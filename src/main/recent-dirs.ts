import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const MAX_DIRS = 8;

export function getRecentDirs(): string[] {
  try {
    const raw = fs.readFileSync(recentDirsPath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .slice(0, MAX_DIRS);
  } catch {
    return [];
  }
}

export function recordRecentDir(cwd: string): void {
  const dir = path.resolve(cwd);
  const next = [dir, ...getRecentDirs().filter((item) => path.resolve(item) !== dir)].slice(
    0,
    MAX_DIRS,
  );
  fs.mkdirSync(path.dirname(recentDirsPath()), { recursive: true });
  fs.writeFileSync(recentDirsPath(), JSON.stringify(next, null, 2), 'utf8');
}

function recentDirsPath(): string {
  return path.join(app.getPath('userData'), 'recent-dirs.json');
}
