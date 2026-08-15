import fs from 'node:fs';
import path from 'node:path';
import { readConfig, resolveClaudeHome } from './config';
import { findSessionFile, listSessions, readChatEntries } from './session-library';
import type { SessionMetaStore } from './session-meta-store';
import type { SessionManager } from './session-manager';
import type { SessionUsage } from '../shared/types';

/**
 * 定位会话记录文件：优先运行中会话的 projects 路径，其次归档路径，最后全盘搜索。
 */
export async function locateSessionFile(
  sessions: SessionManager,
  metaStore: SessionMetaStore,
  sessionId: string,
  cwd?: string,
): Promise<string | null> {
  const claudeHome = resolveClaudeHome(readConfig());
  let filePath = '';
  const runningId = sessions.findBySessionId(sessionId);
  if (runningId) {
    const info = sessions.getSession(runningId);
    if (info?.cwd) {
      filePath = path.join(
        claudeHome,
        'projects',
        info.cwd.replace(/[\\:]/g, '-'),
        `${sessionId}.jsonl`,
      );
    }
  }
  if (!filePath || !fs.existsSync(filePath)) {
    const meta = metaStore.get(sessionId);
    if (meta.archivedPath && fs.existsSync(meta.archivedPath)) {
      filePath = meta.archivedPath;
    }
  }
  if (!filePath || !fs.existsSync(filePath)) {
    const found = await findSessionFile(claudeHome, sessionId);
    if (found) filePath = found;
  }
  return filePath && fs.existsSync(filePath) ? filePath : null;
}

/** 周一起始日期（YYYY-MM-DD，缺省为本周一）所在自然周的起止日期。 */
export function weekRangeFor(monday?: string): [string, string] {
  const base = monday ? new Date(`${monday}T00:00:00`) : new Date();
  const day = base.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // 距本周一的偏移
  const start = new Date(base);
  start.setDate(base.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  return [fmt(start), fmt(end)];
}

/** 收集 [from, to] 日期区间内所有会话的可读文本（按会话分段）。 */
export async function collectRangeText(
  claudeHome: string,
  metaStore: SessionMetaStore,
  from: string,
  to: string,
): Promise<string> {
  const records = await listSessions(claudeHome, metaStore);
  const inRange = records.filter((record) => {
    const date = (record.startedAt || '').slice(0, 10);
    return date >= from && date <= to;
  });
  const parts: string[] = [];
  for (const record of inRange) {
    try {
      const entries = await readChatEntries(record.filePath);
      const text = entries
        .map((entry) => `${entry.role === 'user' ? 'User' : 'Claude'}:\n${entry.text}`)
        .join('\n');
      if (text.trim()) {
        const name =
          record.customName ?? record.cwd.split(/[\\/]/).filter(Boolean).pop() ?? record.sessionId;
        parts.push(`## ${name}\n${text}`);
      }
    } catch {
      // 跳过无法读取的会话。
    }
  }
  return parts.join('\n\n');
}

/** 会话尚无用量记录时的占位值。 */
export function emptyUsage(): SessionUsage {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}
