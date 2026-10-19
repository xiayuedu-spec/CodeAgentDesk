import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type { TaskScript, TaskScriptList } from '../shared/types';

/**
 * 任务运行器：只跑项目 `package.json` 里**声明过的**脚本。
 *
 * 刻意不提供自由 shell —— 那等于在应用里开一个无约束终端，风险与"审查后落地"的定位不符；
 * 需要临时命令时应该用会话里的 Claude Code（它会记录、可审计）。
 */

/** 同时最多跑几个任务。 */
const MAX_RUNNING = 3;
/** 每个任务保留的输出上限（字符），超出只留尾部。 */
const MAX_OUTPUT_CHARS = 400_000;

interface RunningTask {
  child: ChildProcess;
  meta: { id: string; cwd: string; script: string };
}

const running = new Map<string, RunningTask>();
let sequence = 0;

/** 根据 lockfile 判断包管理器（只影响展示与命令前缀）。 */
function detectManager(cwd: string): string {
  const has = (name: string): boolean => fs.existsSync(path.join(cwd, name));
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb')) return 'bun';
  return 'npm';
}

/** 读 package.json 的 scripts（不存在 / 解析失败返回空）。 */
export function listScripts(cwd: string): TaskScriptList {
  const empty: TaskScriptList = { cwd, manager: 'npm', scripts: [], hasPackageJson: false };
  if (!cwd) return empty;
  const file = path.join(cwd, 'package.json');
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return empty;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== 'object') {
    return { ...empty, manager: detectManager(cwd), hasPackageJson: true };
  }
  const list: TaskScript[] = Object.entries(scripts as Record<string, unknown>)
    .filter(([, command]) => typeof command === 'string')
    .map(([name, command]) => ({ name, command: command as string }));
  return {
    cwd,
    manager: detectManager(cwd),
    scripts: list,
    hasPackageJson: true,
  };
}

/** 结束进程树（Windows 下 shell:true 起的是 cmd，必须按 pid 树杀）。 */
function killTree(child: ChildProcess): void {
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    child.kill();
  } catch {
    // 进程可能已退出。
  }
}

export interface TaskRunCallbacks {
  onData: (id: string, chunk: string) => void;
  onExit: (id: string, code: number | null) => void;
}

/**
 * 启动一个脚本任务。
 * 返回任务 id；启动失败（超并发、脚本不存在）返回 null。
 */
export function startTask(
  cwd: string,
  script: string,
  callbacks: TaskRunCallbacks,
): { id: string; manager: string } | null {
  if (running.size >= MAX_RUNNING) return null;
  const info = listScripts(cwd);
  if (!info.scripts.some((item) => item.name === script)) return null;

  sequence += 1;
  const id = `task-${sequence}`;
  // Windows 上 npm/pnpm 是 .cmd，必须经 shell 才能启动。
  const child = spawn(info.manager, ['run', script], {
    cwd,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let emitted = 0;
  const emit = (chunk: string): void => {
    if (!chunk) return;
    // 只发尾部预算内的内容（超长输出不塞爆 IPC）。
    const room = MAX_OUTPUT_CHARS - emitted;
    if (room <= 0) return;
    const piece = chunk.length > room ? chunk.slice(0, room) : chunk;
    emitted += piece.length;
    callbacks.onData(id, piece);
  };

  child.stdout?.on('data', (buffer: Buffer) => emit(buffer.toString('utf8')));
  child.stderr?.on('data', (buffer: Buffer) => emit(buffer.toString('utf8')));
  child.on('error', (error) => {
    emit(`\n[启动失败] ${error.message}\n`);
  });
  child.on('close', (code) => {
    running.delete(id);
    callbacks.onExit(id, code);
  });

  running.set(id, { child, meta: { id, cwd, script } });
  return { id, manager: info.manager };
}

/** 停止任务（杀进程树）。 */
export function stopTask(id: string): boolean {
  const task = running.get(id);
  if (!task) return false;
  killTree(task.child);
  return true;
}

/** 停止全部任务（退出应用 / 切换目录时用）。 */
export function stopAllTasks(): void {
  for (const task of running.values()) killTree(task.child);
  running.clear();
}

/** 当前运行中的任务数（供测试/诊断）。 */
export function runningTaskCount(): number {
  return running.size;
}
