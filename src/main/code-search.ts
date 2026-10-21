import fs from 'node:fs';
import path from 'node:path';
import type { CodeSearchResult } from '../shared/types';

/**
 * 代码搜索：在项目里按纯文本（大小写不敏感）找行。
 *
 * 为什么不外接 ripgrep：用户机器不一定有；Node 遍历对本项目量级足够快，
 * 且能精确控制跳过目录与体积预算（大仓库不会把内存吃光）。
 */

/** 这些目录不搜（依赖、产物、缓存）。 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  'release',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.gradle',
  'vendor',
]);

/** 明确不读的二进制扩展名。 */
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svgz',
  '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.mov', '.avi', '.wav',
  '.exe', '.dll', '.so', '.dylib', '.node', '.wasm', '.class', '.jar',
  '.sqlite', '.db', '.lock',
]);

/** 单文件超过这个大小就不读（压缩产物、数据文件）。 */
const MAX_FILE_BYTES = 1024 * 1024;
/** 最多扫多少个文件。 */
const MAX_FILES = 20_000;
/** 最多返回多少条命中。 */
const MAX_HITS = 200;
/** 单个文件最多返回几条（避免一个巨型文件淹没结果）。 */
const MAX_HITS_PER_FILE = 8;
/** 命中行保留的字符数。 */
const MAX_LINE_CHARS = 300;

export function shouldSkipDir(name: string): boolean {
  return SKIP_DIRS.has(name.toLowerCase());
}

/** 粗判二进制：扩展名黑名单 + 前 8KB 内含 NUL。 */
export function looksBinary(filePath: string, sample: Buffer): boolean {
  if (BINARY_EXT.has(path.extname(filePath).toLowerCase())) return true;
  return sample.includes(0);
}

export function matchLine(line: string, needle: string): boolean {
  return line.toLowerCase().includes(needle);
}

async function walk(
  root: string,
  onFile: (absolute: string, relative: string) => Promise<boolean>,
): Promise<{ scanned: number; stopped: boolean }> {
  let scanned = 0;
  let stopped = false;
  const queue = [root];
  while (queue.length > 0) {
    if (stopped) break;
    const dir = queue.shift() as string;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (stopped) break;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        queue.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      scanned += 1;
      if (scanned > MAX_FILES) {
        stopped = true;
        break;
      }
      const keepGoing = await onFile(absolute, path.relative(root, absolute).split(path.sep).join('/'));
      if (!keepGoing) stopped = true;
    }
  }
  return { scanned, stopped };
}

/**
 * 搜索项目里的纯文本。`query` 至少 2 个字符，否则直接返回空（避免全量返回）。
 */
export async function searchCode(cwd: string, query: string): Promise<CodeSearchResult> {
  const started = Date.now();
  const needle = query.trim().toLowerCase();
  const empty: CodeSearchResult = {
    query,
    hits: [],
    fileCount: 0,
    scannedFiles: 0,
    truncated: false,
    elapsedMs: 0,
  };
  if (!cwd || needle.length < 2) return empty;

  const hits: CodeSearchResult['hits'] = [];
  const perFile = new Map<string, number>();
  let truncated = false;

  const { scanned, stopped } = await walk(cwd, async (absolute, relative) => {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(absolute);
    } catch {
      return true;
    }
    if (stat.size > MAX_FILE_BYTES) return true;

    let buffer: Buffer;
    try {
      buffer = await fs.promises.readFile(absolute);
    } catch {
      return true;
    }
    if (looksBinary(absolute, buffer.subarray(0, 8192))) return true;

    const text = buffer.toString('utf8');
    if (!matchLine(text, needle)) return true;

    const lines = text.split('\n');
    let matchedInFile = 0;
    for (let index = 0; index < lines.length; index += 1) {
      if (!matchLine(lines[index], needle)) continue;
      matchedInFile += 1;
      if (matchedInFile > MAX_HITS_PER_FILE) break;
      const count = (perFile.get(relative) ?? 0) + 1;
      perFile.set(relative, count);
      hits.push({
        path: relative,
        line: index + 1,
        text: lines[index].trim().slice(0, MAX_LINE_CHARS),
      });
      if (hits.length >= MAX_HITS) {
        truncated = true;
        return false;
      }
    }
    return true;
  });

  return {
    query,
    hits,
    fileCount: perFile.size,
    scannedFiles: scanned,
    truncated: truncated || stopped,
    elapsedMs: Date.now() - started,
  };
}
