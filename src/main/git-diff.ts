import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { DiffFile, DiffHunk, DiffLine, WorktreeDiff } from '../shared/types';
import { readSessionGit } from './git-info';

/** 每个文件最多保留的行数（超出只统计、不渲染）。 */
const MAX_LINES_PER_FILE = 400;
/** 最多展示的文件数。 */
const MAX_FILES = 80;
/** 未跟踪文件的读取上限（二进制/超大文件只标记不读取）。 */
const MAX_UNTRACKED_BYTES = 200_000;
/** git 是外部进程，必须有超时。 */
const GIT_TIMEOUT_MS = 8000;

function run(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', cwd, ...args],
      { timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

/** `--- a/foo` / `+++ b/foo` / `diff --git a/foo b/foo` → `foo`（去前缀与引号）。 */
function stripDiffPath(raw: string): string {
  let value = raw.trim();
  // 引号与前缀可能嵌套（b/"my file.ts"），最多剥两轮。
  for (let round = 0; round < 2; round++) {
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith('a/') || value.startsWith('b/')) value = value.slice(2);
  }
  return value.trim();
}

/**
 * 解析 `git diff` 的 unified 输出 → 按文件聚合的 hunk 列表。
 * 纯函数，便于单测；只认 `diff --git` 起的块，其余元数据行忽略。
 */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const lines = text.split('\n');
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let lineBudget = 0;

  const flush = (): void => {
    if (current && (current.path || current.hunks.length > 0)) files.push(current);
    current = null;
    hunk = null;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      current = { path: '', status: 'modified', added: 0, removed: 0, hunks: [] };
      lineBudget = 0;
      // 二进制文件没有 ---/+++ 行，路径只能从这行拿（取 b/ 之后的部分）。
      const rest = line.slice('diff --git '.length);
      const bIndex = rest.lastIndexOf(' b/');
      current.path = stripDiffPath(bIndex >= 0 ? rest.slice(bIndex + 1) : (rest.split(' ').pop() ?? ''));
      continue;
    }
    if (!current) continue;

    if (line.startsWith('new file mode')) {
      current.status = 'added';
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      current.status = 'deleted';
      continue;
    }
    if (line.startsWith('rename from ') || line.startsWith('rename to ')) {
      current.status = 'renamed';
      continue;
    }
    if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
      current.binary = true;
      continue;
    }
    if (line.startsWith('--- ')) {
      const value = line.slice(4);
      if (value.trim() !== '/dev/null' && !current.path) current.path = stripDiffPath(value);
      continue;
    }
    if (line.startsWith('+++ ')) {
      const value = line.slice(4);
      if (value.trim() !== '/dev/null') current.path = stripDiffPath(value);
      continue;
    }
    if (line.startsWith('@@')) {
      const match = /^@@+ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      hunk = { header: line, lines: [] };
      current.hunks.push(hunk);
      oldNo = match ? Number(match[1]) : 0;
      newNo = match ? Number(match[2]) : 0;
      continue;
    }
    if (!hunk) continue;

    const record = (item: DiffLine): void => {
      // 计数照算（总行数要准），但超出预算的行不再入内存，只标记截断。
      if (lineBudget < MAX_LINES_PER_FILE) {
        hunk?.lines.push(item);
        lineBudget += 1;
      } else {
        current!.truncated = true;
      }
    };

    if (line.startsWith('+')) {
      record({ kind: 'add', text: line.slice(1), newLine: newNo++ });
      current.added += 1;
    } else if (line.startsWith('-')) {
      record({ kind: 'del', text: line.slice(1), oldLine: oldNo++ });
      current.removed += 1;
    } else if (line.startsWith(' ')) {
      record({ kind: 'ctx', text: line.slice(1), oldLine: oldNo++, newLine: newNo++ });
    }
    // `\ No newline at end of file` 与空行忽略
  }
  flush();
  return files;
}

/** `git status --porcelain -z` → 路径 + 状态码（`??` 为未跟踪）。 */
export function parseStatusZ(output: string): { path: string; code: string }[] {
  const entries: { path: string; code: string }[] = [];
  for (const record of output.split('\0')) {
    if (record.length < 4) continue;
    const code = record.slice(0, 2);
    const filePath = record.slice(3);
    if (!filePath) continue;
    entries.push({ path: filePath, code });
  }
  return entries;
}

/** 未跟踪文件：读内容合成一个"全新增"的 hunk（二进制/超大只标记）。 */
async function readUntracked(cwd: string, relative: string): Promise<DiffFile> {
  const empty: DiffFile = {
    path: relative,
    status: 'untracked',
    added: 0,
    removed: 0,
    hunks: [],
  };
  const root = path.resolve(cwd);
  const full = path.resolve(root, relative);
  if (!full.startsWith(root)) return { ...empty, truncated: true };
  try {
    const stat = await fs.promises.stat(full);
    if (!stat.isFile()) return { ...empty, truncated: true };
    if (stat.size > MAX_UNTRACKED_BYTES) return { ...empty, truncated: true, binary: true };
    const buffer = await fs.promises.readFile(full);
    if (buffer.includes(0)) return { ...empty, binary: true };
    const all = buffer.toString('utf8').split('\n');
    const kept = all.slice(0, MAX_LINES_PER_FILE);
    return {
      path: relative,
      status: 'untracked',
      added: all.length,
      removed: 0,
      truncated: all.length > kept.length,
      hunks: [
        {
          header: `@@ -0,0 +1,${all.length} @@`,
          lines: kept.map((text, index) => ({
            kind: 'add' as const,
            text,
            newLine: index + 1,
          })),
        },
      ],
    };
  } catch {
    return { ...empty, truncated: true };
  }
}

/**
 * 工作区的真实改动：`git diff HEAD`（工作区+暂存 vs 最后一次提交）+ 未跟踪文件。
 * 与 insights 的区别在这里——那是"会话记录里的意图"，这是"磁盘上真的变了什么"。
 */
export async function readWorktreeDiff(cwd: string): Promise<WorktreeDiff> {
  const empty: WorktreeDiff = {
    cwd,
    branch: null,
    files: [],
    totals: { files: 0, added: 0, removed: 0 },
    truncated: false,
  };
  if (!cwd) return empty;

  const [info, statusOut, diffOut] = await Promise.all([
    readSessionGit(cwd),
    run(cwd, ['status', '--porcelain=v1', '-uall', '-z']),
    run(cwd, ['diff', 'HEAD', '--unified=3', '--no-color', '-M']),
  ]);
  if (statusOut === null && diffOut === null) return empty;

  const files = diffOut ? parseUnifiedDiff(diffOut) : [];
  const tracked = new Set(files.map((file) => file.path));
  const statuses = statusOut ? parseStatusZ(statusOut) : [];

  for (const entry of statuses) {
    if (entry.code !== '??') continue;
    if (tracked.has(entry.path)) continue;
    const untracked = await readUntracked(cwd, entry.path);
    files.push(untracked);
  }

  const limited = files.slice(0, MAX_FILES);
  return {
    cwd,
    branch: info?.branch ?? null,
    files: limited,
    totals: {
      files: files.length,
      added: files.reduce((sum, file) => sum + file.added, 0),
      removed: files.reduce((sum, file) => sum + file.removed, 0),
    },
    truncated: files.length > limited.length,
  };
}
