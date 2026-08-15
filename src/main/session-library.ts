import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { app } from 'electron';
import type {
  ChatEntry,
  SearchContextLine,
  SearchHit,
  SessionDetailEntry,
  SearchResult,
  SessionRecord,
  SessionUsage,
} from '../shared/types';
import type { SessionMetaStore } from './session-meta-store';

const MAX_SCAN_LINES = 500;
const MAX_DETAIL_LINES = 2000;
const MAX_SEARCH_LINES = 5000;
const MAX_HITS_PER_SESSION = 20;
const MAX_TEXT_LENGTH = 4000;
const MAX_USAGE_INCREMENT_LINES = 2000;

/** 逐行扫描 JSONL（带行数上限与静默吞错），供各解析函数复用。 */
function scanLines(filePath: string, limit: number, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lines = 0;
    reader.on('line', (line) => {
      lines += 1;
      if (lines > limit) {
        reader.close();
        return;
      }
      onLine(line);
    });
    reader.on('close', () => resolve());
    reader.on('error', () => resolve());
    stream.on('error', () => resolve());
  });
}

interface CachedRecord {
  mtimeMs: number;
  size: number;
  metaVersion: number;
  record: SessionRecord;
}

/** 会话记录缓存：文件 mtime/size 未变且元数据版本未变时直接复用，避免重复读 JSONL 头部。 */
const recordCache = new Map<string, CachedRecord>();

export async function listSessions(
  claudeHome: string,
  metaStore: SessionMetaStore,
): Promise<SessionRecord[]> {
  const metaVersion = metaStore.getVersion();
  const projectsRoot = claudeHome;
  const archiveRoot = path.join(app.getPath('userData'), 'archive');
  const [projectRecords, archiveRecords] = await Promise.all([
    scanJsonlFiles(projectsRoot, metaStore, false, metaVersion),
    scanJsonlFiles(archiveRoot, metaStore, true, metaVersion),
  ]);
  return [...projectRecords, ...archiveRecords].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function readChatEntries(filePath: string): Promise<ChatEntry[]> {
  const entries: ChatEntry[] = [];
  await scanLines(filePath, MAX_DETAIL_LINES, (line) => {
    const entry = parseChatLine(line);
    if (entry) entries.push(entry);
  });
  return entries;
}

export async function readSessionDetail(filePath: string): Promise<SessionDetailEntry[]> {
  const entries: SessionDetailEntry[] = [];
  const toolUses = new Map<string, { name: string; input: string }>();
  await scanLines(filePath, MAX_DETAIL_LINES, (line) => {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        role?: string;
        message?: {
          role?: string;
          content?: unknown;
        };
      };
      if (event.type === 'user' || (event.type === 'message' && event.role === 'user')) {
        pushUserDetail(entries, event.message?.content, toolUses);
      } else if (
        event.type === 'assistant' ||
        (event.type === 'message' && event.role === 'assistant')
      ) {
        pushAssistantDetail(entries, event.message?.content, toolUses);
      }
    } catch {
      // Ignore malformed lines.
    }
  });
  return entries;
}

function pushUserDetail(
  entries: SessionDetailEntry[],
  content: unknown,
  toolUses: Map<string, { name: string; input: string }>,
): void {
  if (typeof content === 'string') {
    entries.push({ role: 'user', text: content.slice(0, MAX_TEXT_LENGTH) });
    return;
  }
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const item = block as { type?: unknown; text?: unknown; tool_use_id?: unknown; content?: unknown };
    if (item.type === 'text' && typeof item.text === 'string') {
      entries.push({ role: 'user', text: item.text.slice(0, MAX_TEXT_LENGTH) });
    } else if (item.type === 'tool_result') {
      const id = typeof item.tool_use_id === 'string' ? item.tool_use_id : '';
      const use = toolUses.get(id);
      entries.push({
        role: 'tool',
        toolName: use?.name,
        toolInput: use?.input,
        toolOutput: extractBlockText(item.content),
      });
    }
  }
}

function pushAssistantDetail(
  entries: SessionDetailEntry[],
  content: unknown,
  toolUses: Map<string, { name: string; input: string }>,
): void {
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const item = block as {
      type?: unknown;
      text?: unknown;
      id?: unknown;
      name?: unknown;
      input?: unknown;
    };
    if (item.type === 'text' && typeof item.text === 'string') {
      entries.push({ role: 'assistant', text: item.text.slice(0, MAX_TEXT_LENGTH) });
    } else if (item.type === 'tool_use' && typeof item.id === 'string' && typeof item.name === 'string') {
      toolUses.set(item.id, { name: item.name, input: JSON.stringify(item.input ?? {}) });
    }
  }
}

function extractBlockText(content: unknown): string {
  if (typeof content === 'string') return content.slice(0, MAX_TEXT_LENGTH);
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string') parts.push(text.slice(0, MAX_TEXT_LENGTH));
    }
  }
  return parts.join('\n').slice(0, MAX_TEXT_LENGTH);
}

export async function findSessionFile(
  claudeHome: string,
  sessionId: string,
): Promise<string | null> {
  if (!fs.existsSync(claudeHome)) return null;
  const target = `${sessionId}.jsonl`;
  const stack = [claudeHome];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === target) {
        return full;
      }
    }
  }
  return null;
}

export async function searchSessions(
  query: string,
  metaStore: SessionMetaStore,
  claudeHome: string,
): Promise<SearchResult[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const records = await listSessions(claudeHome, metaStore);
  const results = await Promise.all(
    records.map(async (record) => {
      const hits = await searchFile(record.filePath, needle);
      return {
        sessionId: record.sessionId,
        cwd: record.cwd,
        archived: record.archived,
        customName: record.customName,
        hits,
      };
    }),
  );
  return results.filter((result) => result.hits.length > 0);
}

/** 搜索命中内联预览：命中行前后各保留的行数（含命中行最多 5 行）。 */
const SEARCH_CONTEXT_RADIUS = 2;

async function searchFile(filePath: string, needle: string): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];
  const readableLines: SearchContextLine[] = [];
  let lineNumber = 0;
  // 收集文件内全部可读行（行号对齐原始 JSONL），再按命中位置截取上下文窗口。
  await scanLines(filePath, MAX_SEARCH_LINES, (line) => {
    lineNumber += 1;
    const readable = extractReadableLine(line);
    if (!readable) return;
    readableLines.push({
      line: lineNumber,
      text: readable.text.replace(/\s+/g, ' ').trim(),
      role: readable.role,
    });
  });
  for (let i = 0; i < readableLines.length && hits.length < MAX_HITS_PER_SESSION; i += 1) {
    const entry = readableLines[i];
    if (!entry.text.toLowerCase().includes(needle)) continue;
    const from = Math.max(0, i - SEARCH_CONTEXT_RADIUS);
    const to = Math.min(readableLines.length, i + SEARCH_CONTEXT_RADIUS + 1);
    hits.push({
      line: entry.line,
      snippet: entry.text.slice(0, 240),
      role: entry.role,
      context: readableLines.slice(from, to),
      hitIndex: i - from,
    });
  }
  return hits;
}

interface UsageCacheEntry {
  offset: number;
  usageByMessage: Map<string, UsageSnapshot>;
}

/** 用量统计缓存：按文件字节偏移只读新增行，避免每 3s 轮询时全量重扫。 */
const usageCache = new Map<string, UsageCacheEntry>();

export async function readSessionUsage(filePath: string): Promise<SessionUsage> {
  let fd: number;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    return emptyUsageValue();
  }
  try {
    const size = fs.fstatSync(fd).size;
    let entry = usageCache.get(filePath);
    let offset = entry?.offset ?? 0;
    let usageByMessage = entry?.usageByMessage ?? new Map<string, UsageSnapshot>();
    if (size < offset) {
      // 文件被截断/替换，从头重读。
      offset = 0;
      usageByMessage = new Map();
    }
    if (size === offset) {
      return sumUsage(usageByMessage);
    }
    const delta = size - offset;
    // 增量异常大（如长时间未轮询）时回退全量重读，避免一次解析过多内容。
    if (delta > 2 * 1024 * 1024) {
      usageCache.delete(filePath);
      return readSessionUsageFull(filePath);
    }
    const buffer = Buffer.alloc(delta);
    fs.readSync(fd, buffer, 0, delta, offset);
    const text = buffer.toString('utf8');
    const hasTrailingNewline = text.endsWith('\n');
    const lines = text.split('\n');
    if (!hasTrailingNewline && lines.length > 0) {
      // 末行可能未写完（append 进行中），回退到该行起始，等待下次补读。
      const partial = lines.pop() as string;
      offset = size - Buffer.byteLength(partial);
    } else {
      offset = size;
    }
    for (const line of lines) {
      const parsed = parseUsageLine(line);
      if (parsed) usageByMessage.set(parsed.messageId, parsed.snapshot);
    }
    usageCache.set(filePath, { offset, usageByMessage });
    return sumUsage(usageByMessage);
  } catch {
    return emptyUsageValue();
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // 忽略关闭失败。
    }
  }
}

/** 全量重读（初始或增量回退用），带行数上限保护。 */
async function readSessionUsageFull(filePath: string): Promise<SessionUsage> {
  const usageByMessage = new Map<string, UsageSnapshot>();
  await scanLines(filePath, MAX_DETAIL_LINES, (line) => {
    const parsed = parseUsageLine(line);
    if (parsed) usageByMessage.set(parsed.messageId, parsed.snapshot);
  });
  return sumUsage(usageByMessage);
}

function parseUsageLine(line: string): { messageId: string; snapshot: UsageSnapshot } | null {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      role?: string;
      message?: { id?: unknown; usage?: unknown };
    };
    if (
      (event.type === 'assistant' || (event.type === 'message' && event.role === 'assistant')) &&
      event.message
    ) {
      const messageId = typeof event.message?.id === 'string' ? event.message.id : '';
      const usage = event.message?.usage;
      if (messageId && usage && typeof usage === 'object') {
        return { messageId, snapshot: normalizeUsage(usage as Record<string, unknown>) };
      }
    }
    return null;
  } catch {
    // Ignore malformed lines.
    return null;
  }
}

function sumUsage(usageByMessage: Map<string, UsageSnapshot>): SessionUsage {
  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  for (const usage of usageByMessage.values()) {
    requests += 1;
    inputTokens += usage.input;
    outputTokens += usage.output;
    cacheReadTokens += usage.cacheRead;
    cacheCreationTokens += usage.cacheCreation;
  }
  return { requests, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
}

function emptyUsageValue(): SessionUsage {
  return { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
}

export interface UsageTrendDay {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** 今日每个自然小时的 token 总消耗（会话按 updatedAt 归入所在小时），用于每小时用量柱状图。 */
export async function getHourlyUsageToday(
  claudeHome: string,
  metaStore: SessionMetaStore,
): Promise<{ hour: number; tokens: number }[]> {
  const records = await listSessions(claudeHome, metaStore);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const sinceMs = todayStart.getTime();
  const byHour = new Array<number>(24).fill(0);
  for (const record of records) {
    const time = new Date(record.updatedAt).getTime();
    if (time < sinceMs) continue;
    const hour = new Date(record.updatedAt).getHours();
    try {
      const usage = await readSessionUsage(record.filePath);
      byHour[hour] +=
        usage.inputTokens +
        usage.outputTokens +
        usage.cacheReadTokens +
        usage.cacheCreationTokens;
    } catch {
      // 跳过无法读取的会话。
    }
  }
  return byHour.map((tokens, hour) => ({ hour, tokens }));
}

/** 当前自然小时（整点起）内的 token 总消耗（会话按 updatedAt 归入所在小时），用于按小时限额预警。 */
export async function getCurrentHourUsage(
  claudeHome: string,
  metaStore: SessionMetaStore,
): Promise<{ tokens: number }> {
  const records = await listSessions(claudeHome, metaStore);
  const now = new Date();
  const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  const sinceMs = hourStart.getTime();
  let tokens = 0;
  for (const record of records) {
    if (new Date(record.updatedAt).getTime() < sinceMs) continue;
    try {
      const usage = await readSessionUsage(record.filePath);
      tokens +=
        usage.inputTokens +
        usage.outputTokens +
        usage.cacheReadTokens +
        usage.cacheCreationTokens;
    } catch {
      // 跳过无法读取的会话。
    }
  }
  return { tokens };
}

/** 按天聚合最近 N 天的 token 用量（复用 readSessionUsage 的增量缓存，只对变化文件重读）。 */
export async function getUsageTrend(
  claudeHome: string,
  metaStore: SessionMetaStore,
  days: number,
): Promise<UsageTrendDay[]> {
  const records = await listSessions(claudeHome, metaStore);
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  const sinceKey = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(
    since.getDate(),
  ).padStart(2, '0')}`;

  const byDate = new Map<
    string,
    { input: number; output: number; cacheRead: number; cacheCreation: number }
  >();
  for (const record of records) {
    const date = (record.updatedAt || '').slice(0, 10);
    if (!date || date < sinceKey) continue;
    try {
      const usage = await readSessionUsage(record.filePath);
      if (usage.requests === 0) continue;
      const entry = byDate.get(date) ?? { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
      entry.input += usage.inputTokens;
      entry.output += usage.outputTokens;
      entry.cacheRead += usage.cacheReadTokens;
      entry.cacheCreation += usage.cacheCreationTokens;
      byDate.set(date, entry);
    } catch {
      // 跳过无法读取的会话。
    }
  }

  const result: UsageTrendDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate(),
    ).padStart(2, '0')}`;
    const entry = byDate.get(key);
    result.push({
      date: key,
      inputTokens: entry?.input ?? 0,
      outputTokens: entry?.output ?? 0,
      cacheReadTokens: entry?.cacheRead ?? 0,
      cacheCreationTokens: entry?.cacheCreation ?? 0,
    });
  }
  return result;
}

interface UsageSnapshot {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

function normalizeUsage(usage: Record<string, unknown>): UsageSnapshot {
  return {
    input: toNumber(usage.input_tokens),
    output: toNumber(usage.output_tokens),
    cacheRead: toNumber(usage.cache_read_input_tokens),
    cacheCreation: toNumber(usage.cache_creation_input_tokens),
  };
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function extractReadableLine(line: string): { role: 'user' | 'assistant'; text: string } | null {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      role?: string;
      message?: { role?: string; content?: unknown };
    };
    if (event.type === 'user' || (event.type === 'message' && event.role === 'user')) {
      const text = extractText(event.message?.content);
      return text ? { role: 'user', text } : null;
    }
    if (event.type === 'assistant' || (event.type === 'message' && event.role === 'assistant')) {
      const text = extractText(event.message?.content);
      return text ? { role: 'assistant', text } : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function scanJsonlFiles(
  root: string,
  metaStore: SessionMetaStore,
  archived: boolean,
  metaVersion: number,
): Promise<SessionRecord[]> {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.jsonl')) {
        files.push(full);
      }
    }
  };
  walk(root);
  // 清理已不存在的文件缓存（会话删除/移动后）。
  for (const key of recordCache.keys()) {
    if (!files.includes(key)) recordCache.delete(key);
  }
  const records = await Promise.all(
    files.map((file) => cachedRecord(file, metaStore, archived, metaVersion)),
  );
  return records.filter((record): record is SessionRecord => record !== null);
}

async function cachedRecord(
  file: string,
  metaStore: SessionMetaStore,
  archived: boolean,
  metaVersion: number,
): Promise<SessionRecord | null> {
  try {
    const stat = fs.statSync(file);
    const cached = recordCache.get(file);
    if (
      cached &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size &&
      cached.metaVersion === metaVersion
    ) {
      return cached.record;
    }
    const record = await toRecord(file, metaStore, archived);
    if (record) {
      recordCache.set(file, {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        metaVersion,
        record,
      });
    }
    return record;
  } catch {
    return null;
  }
}

async function toRecord(
  file: string,
  metaStore: SessionMetaStore,
  archived: boolean,
): Promise<SessionRecord | null> {
  const sessionId = path.basename(file, '.jsonl');
  const meta = metaStore.get(sessionId);
  if (!archived && meta.archived) return null;
  try {
    const stat = fs.statSync(file);
    const info = await readSessionInfo(file);
    return {
      sessionId,
      cwd: info.cwd ?? meta.cwd ?? '',
      filePath: file,
      archived,
      archivedAt: meta.archivedAt,
      customName: meta.customName,
      summary: meta.summary,
      tags: meta.tags,
      group: meta.group,
      pinned: meta.pinned,
      pinnedAt: meta.pinnedAt,
      startedAt: info.startedAt ?? stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function readSessionInfo(
  file: string,
): Promise<{ cwd?: string; title?: string; startedAt?: string }> {
  let cwd: string | undefined;
  let title: string | undefined;
  let startedAt: string | undefined;
  await scanLines(file, MAX_SCAN_LINES, (line) => {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        cwd?: unknown;
        aiTitle?: unknown;
        timestamp?: unknown;
        message?: { content?: unknown };
      };
      if (!cwd && typeof event.cwd === 'string') cwd = event.cwd;
      if (!startedAt && typeof event.timestamp === 'string') startedAt = event.timestamp;
      if (event.type === 'ai-title' && typeof event.aiTitle === 'string') {
        title = event.aiTitle.slice(0, 40);
      }
      if (!title && event.type === 'user') {
        const text = extractText(event.message?.content);
        if (text) title = text.replace(/\s+/g, ' ').trim().slice(0, 40);
      }
    } catch {
      // Ignore partially written lines.
    }
  });
  return { cwd, title, startedAt };
}

function parseChatLine(line: string): ChatEntry | null {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      role?: string;
      message?: { role?: string; content?: unknown };
    };
    if (event.type === 'user' || (event.type === 'message' && event.role === 'user')) {
      const text = extractText(event.message?.content);
      return text ? { role: 'user', text } : null;
    }
    if (event.type === 'assistant' || (event.type === 'message' && event.role === 'assistant')) {
      const text = extractText(event.message?.content);
      return text ? { role: 'assistant', text } : null;
    }
    return null;
  } catch {
    return null;
  }
}

function extractText(content: unknown): string | null {
  if (typeof content === 'string') return content.slice(0, MAX_TEXT_LENGTH);
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string') parts.push(text.slice(0, MAX_TEXT_LENGTH));
    }
  }
  return parts.join('\n').slice(0, MAX_TEXT_LENGTH) || null;
}
