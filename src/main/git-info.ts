import { execFile } from 'node:child_process';
import type { SessionGitInfo } from '../shared/types';

/** 缓存：同一工作目录 20 秒内不重复调 git（右栏会随会话切换频繁刷新）。 */
const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { at: number; info: SessionGitInfo | null }>();
/** git 是外部进程，必须有超时（大仓库 status 偶尔会慢）。 */
const GIT_TIMEOUT_MS = 4000;

function run(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', cwd, ...args],
      { timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function parseAheadBehind(header: string): { ahead: number; behind: number } {
  // `## main...origin/main [ahead 2, behind 1]`
  const match = /\[(.*)\]/.exec(header);
  if (!match) return { ahead: 0, behind: 0 };
  const ahead = /ahead (\d+)/.exec(match[1]);
  const behind = /behind (\d+)/.exec(match[1]);
  return { ahead: ahead ? Number(ahead[1]) : 0, behind: behind ? Number(behind[1]) : 0 };
}

/**
 * 读工作区的 git 摘要：分支 + 未提交文件数（含未跟踪）+ 领先/落后远端。
 * 不是 git 仓库、没装 git、或超时 → 返回 null（界面直接不显示这一行）。
 */
export async function readSessionGit(cwd: string): Promise<SessionGitInfo | null> {
  if (!cwd) return null;
  const cached = cache.get(cwd);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.info;

  const output = await run(cwd, ['status', '--porcelain=v1', '--branch', '-uno']);
  let info: SessionGitInfo | null = null;
  if (output !== null) {
    const lines = output.split('\n').filter((line) => line.trim());
    const header = lines[0] ?? '';
    // 第一条必是 `## <branch>...<upstream>`；非仓库时 git 会直接报错，走不到这里。
    const branch = header.replace(/^##\s*/, '').split('...')[0].trim() || 'HEAD';
    const { ahead, behind } = parseAheadBehind(header);
    info = { branch, dirty: Math.max(0, lines.length - 1), ahead, behind };
  }

  cache.set(cwd, { at: Date.now(), info });
  while (cache.size > 40) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return info;
}

/** 清空缓存（切换 Claude 目录/工作区变化时调用）。 */
export function invalidateGitCache(): void {
  cache.clear();
}
