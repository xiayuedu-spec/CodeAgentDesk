import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { app } from 'electron';
import type {
  ChatEntry,
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

export async function listSessions(
  claudeHome: string,
  metaStore: SessionMetaStore,
): Promise<SessionRecord[]> {
  const projectsRoot = claudeHome;
  const archiveRoot = path.join(app.getPath('userData'), 'archive');
  const [projectRecords, archiveRecords] = await Promise.all([
    scanJsonlFiles(projectsRoot, metaStore, false),
    scanJsonlFiles(archiveRoot, metaStore, true),
  ]);
  return [...projectRecords, ...archiveRecords].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function readChatEntries(filePath: string): Promise<ChatEntry[]> {
  const entries: ChatEntry[] = [];
  let lines = 0;
  await new Promise<void>((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    reader.on('line', (line) => {
      lines += 1;
      if (lines > MAX_DETAIL_LINES) {
        reader.close();
        return;
      }
      const entry = parseChatLine(line);
      if (entry) entries.push(entry);
    });
    reader.on('close', () => resolve());
    reader.on('error', () => resolve());
    stream.on('error', () => resolve());
  });
  return entries;
}

export async function readSessionDetail(filePath: string): Promise<SessionDetailEntry[]> {
  const entries: SessionDetailEntry[] = [];
  const toolUses = new Map<string, { name: string; input: string }>();
  let lines = 0;
  await new Promise<void>((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    reader.on('line', (line) => {
      lines += 1;
      if (lines > MAX_DETAIL_LINES) {
        reader.close();
        return;
      }
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
    reader.on('close', () => resolve());
    reader.on('error', () => resolve());
    stream.on('error', () => resolve());
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

async function searchFile(filePath: string, needle: string): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];
  let lineNumber = 0;
  await new Promise<void>((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    reader.on('line', (line) => {
      lineNumber += 1;
      if (lineNumber > MAX_SEARCH_LINES || hits.length >= MAX_HITS_PER_SESSION) {
        reader.close();
        return;
      }
      const readable = extractReadableLine(line);
      if (readable && readable.text.toLowerCase().includes(needle)) {
        hits.push({
          line: lineNumber,
          snippet: readable.text.trim().slice(0, 240),
          role: readable.role,
        });
      }
    });
    reader.on('close', () => resolve());
    reader.on('error', () => resolve());
    stream.on('error', () => resolve());
  });
  return hits;
}

export async function readSessionUsage(filePath: string): Promise<SessionUsage> {
  const usageByMessage = new Map<string, UsageSnapshot>();
  let lines = 0;
  await new Promise<void>((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    reader.on('line', (line) => {
      lines += 1;
      if (lines > MAX_DETAIL_LINES) {
        reader.close();
        return;
      }
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
            usageByMessage.set(messageId, normalizeUsage(usage as Record<string, unknown>));
          }
        }
      } catch {
        // Ignore malformed lines.
      }
    });
    reader.on('close', () => resolve());
    reader.on('error', () => resolve());
    stream.on('error', () => resolve());
  });

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
  const records = await Promise.all(files.map((file) => toRecord(file, metaStore, archived)));
  return records.filter((record): record is SessionRecord => record !== null);
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
      startedAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function readSessionInfo(file: string): Promise<{ cwd?: string; title?: string }> {
  let cwd: string | undefined;
  let title: string | undefined;
  let lines = 0;
  await new Promise<void>((resolve) => {
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    reader.on('line', (line) => {
      lines += 1;
      if (lines > MAX_SCAN_LINES) {
        reader.close();
        return;
      }
      try {
        const event = JSON.parse(line) as {
          type?: string;
          cwd?: unknown;
          aiTitle?: unknown;
          message?: { content?: unknown };
        };
        if (!cwd && typeof event.cwd === 'string') cwd = event.cwd;
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
    reader.on('close', () => resolve());
    reader.on('error', () => resolve());
    stream.on('error', () => resolve());
  });
  return { cwd, title };
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
