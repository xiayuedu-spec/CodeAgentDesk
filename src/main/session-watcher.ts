import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { watch, type FSWatcher } from 'chokidar';
import type { SessionManager } from './session-manager';

interface PendingSpawn {
  cwd: string;
}

const MAX_SCAN_LINES = 200;

export class SessionWatcher {
  private watcher?: FSWatcher;
  private readonly pending = new Map<string, PendingSpawn>();

  constructor(private readonly sessions: SessionManager) {}

  start(claudeHome: string): void {
    this.watcher?.close();
    this.watcher = watch(claudeHome, {
      ignoreInitial: true,
      depth: 3,
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 100,
      },
    });
    this.watcher.on('add', (file) => void this.handleFileAdded(file));
    this.watcher.on('error', () => {
      // TODO: route watcher errors into an app log.
    });
  }

  restart(claudeHome: string): void {
    this.start(claudeHome);
  }

  registerPending(id: string, cwd: string): void {
    this.pending.set(id, { cwd: normalizePath(cwd) });
  }

  clearPending(id: string): void {
    this.pending.delete(id);
  }

  private async handleFileAdded(file: string): Promise<void> {
    if (!file.endsWith('.jsonl')) return;
    const cwd = await readSessionCwd(file);
    if (!cwd) return;
    const normalized = normalizePath(cwd);
    for (const [id, pending] of this.pending) {
      if (pending.cwd === normalized) {
        this.pending.delete(id);
        this.sessions.bind(id, path.basename(file, '.jsonl'));
        return;
      }
    }
  }
}

function normalizePath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function readSessionCwd(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lines = 0;

    reader.on('line', (line) => {
      lines += 1;
      if (lines > MAX_SCAN_LINES) {
        reader.close();
        return;
      }
      try {
        const event = JSON.parse(line) as { cwd?: unknown };
        if (typeof event.cwd === 'string') {
          resolve(event.cwd);
          reader.close();
        }
      } catch {
        // A partially written line is expected right after file creation.
      }
    });

    reader.on('close', () => resolve(null));
    reader.on('error', () => resolve(null));
    stream.on('error', () => resolve(null));
  });
}
