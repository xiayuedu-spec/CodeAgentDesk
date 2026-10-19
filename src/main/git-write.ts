import { execFile } from 'node:child_process';
import type { GitOpResult } from '../shared/types';

/** git 写操作超时（commit 可能触发 pre-commit hook，给宽一点）。 */
const GIT_TIMEOUT_MS = 30_000;
/** 提交信息长度上限，避免把整篇文档塞进去。 */
const MAX_MESSAGE_LENGTH = 4000;

/** 跑 git 并同时拿 stdout/stderr（写操作要把 stderr 回给界面）。 */
function run(
  cwd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', cwd, ...args],
      { timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        const code = typeof (error as { code?: unknown }).code === 'number'
          ? ((error as { code: number }).code)
          : 1;
        resolve({ code, stdout: stdout ?? '', stderr: stderr || error.message });
      },
    );
  });
}

function fail(stderr: string): GitOpResult {
  return { ok: false, message: stderr.trim().split('\n').slice(0, 4).join('\n') || 'git 执行失败' };
}

/**
 * 暂存 / 取消暂存指定文件。
 * `paths` 为空时表示全部（`git add -A`；取消暂存用 `git reset`）。
 */
export async function stageFiles(
  cwd: string,
  paths: string[],
  staged: boolean,
): Promise<GitOpResult> {
  if (!cwd) return { ok: false, message: '缺少工作目录' };

  if (staged) {
    const args = paths.length > 0 ? ['add', '--', ...paths] : ['add', '-A'];
    const result = await run(cwd, args);
    return result.code === 0 ? { ok: true } : fail(result.stderr);
  }

  // 取消暂存：unborn HEAD（还没有任何提交）时 reset 会失败，退化为 rm --cached。
  const args = paths.length > 0 ? ['reset', '-q', 'HEAD', '--', ...paths] : ['reset', '-q', 'HEAD'];
  const result = await run(cwd, args);
  if (result.code === 0) return { ok: true };

  const fallback = await run(
    cwd,
    paths.length > 0 ? ['rm', '--cached', '-q', '--', ...paths] : ['rm', '--cached', '-r', '-q', '.'],
  );
  return fallback.code === 0 ? { ok: true } : fail(result.stderr || fallback.stderr);
}

/**
 * 提交**已暂存**的改动（不带 `-a`，避免把没 review 的文件一起提交）。
 * 不追加 `--no-verify`：仓库自己的 pre-commit hook 该跑就跑，失败原样回给界面。
 */
export async function commitChanges(cwd: string, message: string): Promise<GitOpResult> {
  if (!cwd) return { ok: false, message: '缺少工作目录' };
  const text = message.trim();
  if (!text) return { ok: false, message: '提交信息不能为空' };
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, message: `提交信息过长（上限 ${MAX_MESSAGE_LENGTH} 字）` };
  }

  const result = await run(cwd, ['commit', '-m', text]);
  if (result.code === 0) {
    const summary = result.stdout.trim().split('\n')[0] ?? '';
    return { ok: true, message: summary };
  }
  // `nothing to commit` 之类也会走这里，把 git 的原话带回去。
  return fail(result.stderr || result.stdout);
}
