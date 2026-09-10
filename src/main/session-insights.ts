import fs from 'node:fs';
import type {
  SessionChangeHunk,
  SessionFileChange,
  SessionInsights,
  SessionPlan,
  SessionTodo,
} from '../shared/types';
import { scanJsonlLines } from './session-library';

/** 会话洞察的扫描行数上限（长会话可能几万行，纯顺序读，代价可控）。 */
const MAX_INSIGHT_LINES = 60000;
/** 单个改动片段每侧保留的字符数（超出标记 truncated）。 */
const MAX_HUNK_CHARS = 1200;
/** 每个文件最多保留的片段数（超出只计数）。 */
const MAX_HUNKS_PER_FILE = 8;
/** 最多列出的文件数（超出合并为"其他"计数）。 */
const MAX_FILES = 60;

const TODO_STATUSES: SessionTodo['status'][] = ['pending', 'in_progress', 'completed'];

/** 写入类工具名 → 从调用参数里取改动的方式见 applyChangeTool。 */
const CHANGE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'str_replace_editor']);

interface InsightCacheEntry {
  mtimeMs: number;
  size: number;
  insights: SessionInsights;
}

const insightsCache = new Map<string, InsightCacheEntry>();
const INSIGHTS_CACHE_MAX = 60;

interface ParsedEvent {
  type?: string;
  role?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** 行数统计：空串算 0 行，其余按换行符计数（尾换行不额外计一行）。 */
export function countLines(text: string): number {
  if (!text) return 0;
  const normalized = text.endsWith('\n') ? text.slice(0, -1) : text;
  return normalized.split('\n').length;
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_HUNK_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_HUNK_CHARS), truncated: true };
}

/** LCS 行数上限：中段超过该长度就不做精确 diff，退化为"整段替换"统计。 */
const LCS_MAX_LINES = 200;

function splitLines(text: string): string[] {
  if (!text) return [];
  const normalized = text.endsWith('\n') ? text.slice(0, -1) : text;
  return normalized.split('\n');
}

function lcsLength(a: string[], b: string[]): number {
  const width = b.length + 1;
  let previous = new Int32Array(width);
  let current = new Int32Array(width);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] =
        a[i - 1] === b[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], current[j - 1]);
    }
    const swap = previous;
    previous = current;
    current = swap;
    current.fill(0);
  }
  return previous[b.length];
}

/**
 * 行级增删统计（近似 diff）：先裁掉公共前后缀，再对中段做 LCS。
 * 中段过大时退化为"整段替换"，避免长文件把 O(n·m) 拖爆。
 */
export function diffLineCounts(
  oldText: string,
  newText: string,
): { added: number; removed: number } {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length === 0) return { added: midB.length, removed: 0 };
  if (midB.length === 0) return { added: 0, removed: midA.length };
  if (midA.length > LCS_MAX_LINES || midB.length > LCS_MAX_LINES) {
    return { added: midB.length, removed: midA.length };
  }
  const common = lcsLength(midA, midB);
  return { added: midB.length - common, removed: midA.length - common };
}

function addHunk(
  change: SessionFileChange,
  kind: SessionChangeHunk['kind'],
  oldText: string,
  newText: string,
): void {
  if (change.hunks.length >= MAX_HUNKS_PER_FILE) {
    change.hiddenHunks += 1;
    return;
  }
  const oldSide = truncate(oldText);
  const newSide = truncate(newText);
  change.hunks.push({
    kind,
    oldText: oldSide.text,
    newText: newSide.text,
    truncated: oldSide.truncated || newSide.truncated,
  });
}

function fileChange(map: Map<string, SessionFileChange>, filePath: string): SessionFileChange {
  const existing = map.get(filePath);
  if (existing) return existing;
  const created: SessionFileChange = {
    path: filePath,
    edits: 0,
    added: 0,
    removed: 0,
    hunks: [],
    hiddenHunks: 0,
  };
  map.set(filePath, created);
  return created;
}

/**
 * 把一次写入类工具调用并入改动表。
 * 口径：只记录会话记录里的**意图片段**，不代表工作区当前内容（用户可能手改、也可能有未落盘的编辑）。
 */
function applyChangeTool(
  map: Map<string, SessionFileChange>,
  name: string,
  input: Record<string, unknown>,
): void {
  const filePath =
    asText(input.file_path) ?? asText(input.notebook_path) ?? asText(input.path) ?? '';
  if (!filePath) return;

  if (name === 'Write') {
    const content = asText(input.content) ?? '';
    const change = fileChange(map, filePath);
    change.edits += 1;
    change.written = true;
    change.added += countLines(content);
    addHunk(change, 'write', '', content);
    return;
  }

  // Edit / MultiEdit / NotebookEdit / str_replace_editor：一对或多对 old/new。
  const pairs: { oldText: string; newText: string }[] = [];
  if (Array.isArray(input.edits)) {
    for (const entry of input.edits) {
      const record = asRecord(entry);
      if (!record) continue;
      pairs.push({
        oldText: asText(record.old_string) ?? asText(record.old_str) ?? '',
        newText: asText(record.new_string) ?? asText(record.new_str) ?? '',
      });
    }
  }
  const single = {
    oldText: asText(input.old_string) ?? asText(input.old_str) ?? '',
    newText:
      asText(input.new_string) ?? asText(input.new_str) ?? asText(input.new_source) ?? '',
  };
  if (single.oldText || single.newText) pairs.push(single);
  if (pairs.length === 0) return;

  const change = fileChange(map, filePath);
  change.edits += 1;
  for (const pair of pairs) {
    const counts = diffLineCounts(pair.oldText, pair.newText);
    change.removed += counts.removed;
    change.added += counts.added;
    addHunk(change, 'edit', pair.oldText, pair.newText);
  }
}

function parseTodos(input: Record<string, unknown>): SessionTodo[] | null {
  const raw = input.todos;
  if (!Array.isArray(raw)) return null;
  const todos: SessionTodo[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const content = record ? asText(record.content) : null;
    if (!content) continue;
    const status = record ? asText(record.status) : null;
    todos.push({
      content,
      status: TODO_STATUSES.includes(status as SessionTodo['status'])
        ? (status as SessionTodo['status'])
        : 'pending',
    });
  }
  return todos;
}

/**
 * 从会话 JSONL 里提取「计划（TodoWrite 末次快照）+ 改动清单（Edit/Write 系列）」。
 * 按 mtime+size 缓存；同一文件未变化时直接复用。
 */
export async function readSessionInsights(
  filePath: string,
  sessionId: string,
): Promise<SessionInsights> {
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return emptyInsights(sessionId);
  }
  const cached = insightsCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.insights;
  }

  const changes = new Map<string, SessionFileChange>();
  let plan: SessionPlan | null = null;
  let skipped = 0;
  let calls = 0;

  await scanJsonlLines(filePath, MAX_INSIGHT_LINES, (line) => {
    if (!line.trim()) return;
    let event: ParsedEvent;
    try {
      event = JSON.parse(line) as ParsedEvent;
    } catch {
      skipped += 1;
      return;
    }
    const content = event.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      const item = asRecord(block);
      if (!item || item.type !== 'tool_use') continue;
      const name = asText(item.name);
      const input = asRecord(item.input);
      if (!name || !input) continue;

      if (name === 'TodoWrite') {
        const todos = parseTodos(input);
        if (!todos) continue;
        calls += 1;
        plan = { todos, updates: calls, updatedAt: event.timestamp ?? plan?.updatedAt };
        continue;
      }
      if (CHANGE_TOOLS.has(name)) applyChangeTool(changes, name, input);
    }
  });

  const list = [...changes.values()].sort(
    (a, b) => b.added + b.removed - (a.added + a.removed),
  );
  const totals = {
    files: list.length,
    added: list.reduce((sum, change) => sum + change.added, 0),
    removed: list.reduce((sum, change) => sum + change.removed, 0),
    edits: list.reduce((sum, change) => sum + change.edits, 0),
  };
  const insights: SessionInsights = {
    sessionId,
    plan,
    changes: list.slice(0, MAX_FILES),
    totals,
    skipped,
  };

  insightsCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, insights });
  while (insightsCache.size > INSIGHTS_CACHE_MAX) {
    const oldest = insightsCache.keys().next().value;
    if (oldest === undefined) break;
    insightsCache.delete(oldest);
  }
  return insights;
}

/** 空结果（找不到会话记录时使用）。 */
export function emptyInsights(sessionId: string): SessionInsights {
  return {
    sessionId,
    plan: null,
    changes: [],
    totals: { files: 0, added: 0, removed: 0, edits: 0 },
    skipped: 0,
  };
}
