import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type IPty } from 'node-pty';

export interface SessionCallbacks {
  onData(id: string, data: string): void;
  onExit(id: string, exitCode?: number, sessionId?: string, cwd?: string, expected?: boolean): void;
  onBound(id: string, sessionId: string): void;
  onError(id: string, message: string): void;
}

interface RunningSession {
  id: string;
  cwd: string;
  pty: IPty;
  sessionId?: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, RunningSession>();
  private readonly sequences = new Map<string, number>();
  private readonly exitWaiters = new Map<string, () => void>();
  private readonly expectedExits = new Set<string>();

  constructor(private readonly callbacks: SessionCallbacks) {}

  create(cwd: string): { id: string; cwd: string; sequence: number } {
    const { sequence } = this.nextSequence(cwd);
    const { id } = this.start(cwd, []);
    return { id, cwd, sequence };
  }

  resume(cwd: string, sessionId: string): { id: string; cwd: string; sequence: number } {
    const { sequence } = this.nextSequence(cwd);
    const { id } = this.start(cwd, ['--resume', sessionId]);
    const session = this.sessions.get(id);
    if (session) session.sessionId = sessionId;
    return { id, cwd, sequence };
  }

  findBySessionId(sessionId: string): string | null {
    for (const [id, session] of this.sessions) {
      if (session.sessionId === sessionId) return id;
    }
    return null;
  }

  bind(id: string, sessionId: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.sessionId = sessionId;
    this.callbacks.onBound(id, sessionId);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  getSession(id: string): { cwd: string; sessionId?: string } | null {
    const session = this.sessions.get(id);
    return session ? { cwd: session.cwd, sessionId: session.sessionId } : null;
  }

  /** 当前全部运行中会话（供统计/仪表盘使用）。 */
  list(): { id: string; cwd: string; sessionId?: string }[] {
    return [...this.sessions.values()].map((session) => ({
      id: session.id,
      cwd: session.cwd,
      sessionId: session.sessionId,
    }));
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    try {
      session.pty.resize(cols, rows);
    } catch {
      // Ignore resize races while the pty is closing.
    }
  }

  close(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    // 应用主动终止（关闭标签/归档/删除/退出）标记为预期退出，onExit 据此不发异常通知。
    this.expectedExits.add(id);
    try {
      session.pty.kill();
    } catch {
      // Process may have already exited.
    }
  }

  /** 应用退出前清理全部运行中的 pty，避免残留 claude 进程。 */
  closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.close(id);
    }
  }

  /**
   * 强制从运行表移除（归档/删除时兜底清理僵尸 pty 记录）。
   * 若 pty 稍后才触发 onExit，此时 map 已无此会话，回调安全降级为无操作。
   */
  remove(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    this.exitWaiters.delete(id);
  }

  /** 等待会话从运行表移除（进程退出），超时兜底。 */
  waitForExit(id: string, timeoutMs: number): Promise<void> {
    if (!this.sessions.has(id)) return Promise.resolve();
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (): void => {
        if (timer) clearTimeout(timer);
        this.exitWaiters.delete(id);
        resolve();
      };
      timer = setTimeout(finish, timeoutMs);
      this.exitWaiters.set(id, finish);
    });
  }

  private nextSequence(cwd: string): { sequence: number } {
    const key = normalizeCwd(cwd);
    const sequence = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, sequence);
    return { sequence };
  }

  private start(cwd: string, args: string[]): { id: string } {
    const id = randomUUID();
    let pty: IPty;
    try {
      pty = spawn(resolveClaudeCommand(), args, {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });
    } catch (error) {
      this.callbacks.onError(id, error instanceof Error ? error.message : String(error));
      throw error;
    }

    this.sessions.set(id, { id, cwd, pty });
    pty.onData((data) => this.callbacks.onData(id, data));
    pty.onExit(({ exitCode }) => {
      const session = this.sessions.get(id);
      const sessionId = session?.sessionId;
      const cwd = session?.cwd;
      const expected = this.expectedExits.has(id);
      this.expectedExits.delete(id);
      this.sessions.delete(id);
      this.exitWaiters.get(id)?.();
      this.exitWaiters.delete(id);
      this.callbacks.onExit(id, exitCode, sessionId, cwd, expected);
    });

    return { id };
  }
}

function normalizeCwd(cwd: string): string {
  return process.platform === 'win32' ? cwd.toLowerCase() : cwd;
}

export function resolveClaudeCommand(): string {
  if (process.platform !== 'win32') return 'claude';
  const directories = (process.env.PATH ?? '').split(path.delimiter);
  const candidates = ['claude.cmd', 'claude.exe', 'claude.bat', 'claude'];
  for (const directory of directories) {
    if (!directory) continue;
    for (const name of candidates) {
      const candidate = path.join(directory, name);
      try {
        fs.accessSync(candidate);
        return candidate;
      } catch {
        // Try the next candidate.
      }
    }
  }
  return 'claude.cmd';
}
