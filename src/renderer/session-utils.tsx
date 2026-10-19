import type { ReactNode } from 'react';
import type { GroupRecord, SessionRecord, SessionUsage } from '../shared/types';

export type Mode = 'sessions' | 'archive' | 'search';

export interface ContextMenuState {
  sessionId: string;
  cwd: string;
  archived: boolean;
  x: number;
  y: number;
}

export interface GroupMenuState {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface MoveMenuState {
  sessionId: string;
  x: number;
  y: number;
}

export interface GroupSectionItem {
  key: string;
  kind: 'running' | 'history';
  id?: string;
  sessionId?: string;
  cwd: string;
}

export interface GroupSection {
  key: string;
  group?: GroupRecord;
  items: GroupSectionItem[];
  collapsed: boolean;
}

/** 运行中会话的 UI 视图状态（与标签页一一对应）。 */
export interface SessionView {
  id: string;
  cwd: string;
  sequence: number;
  status: 'starting' | 'running' | 'ended';
  sessionId?: string;
  customName?: string;
  activity?: boolean;
}

export const EMPTY_USAGE: SessionUsage = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

export function folderName(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? cwd;
}

export function formatSessionTitle(session: SessionView): string {
  if (session.customName) return session.customName;
  return `${folderName(session.cwd)} #${session.sequence}`;
}

export function recordTitle(record: SessionRecord): string {
  return record.customName ?? (record.cwd ? folderName(record.cwd) : '未命名会话');
}

export function statusLabel(status: SessionView['status']): string {
  if (status === 'running') return '运行中';
  if (status === 'ended') return '已结束';
  return '启动中';
}

export function formatRelativeTime(value: string | undefined): string {
  if (!value) return '';
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return '刚刚';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function renderTime(iso: string | undefined): ReactNode {
  const text = formatRelativeTime(iso);
  return text ? <span className="session-time">{text}</span> : null;
}

export function highlight(text: string, needle: string): ReactNode {
  const term = needle.trim().toLowerCase();
  if (!term) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let index = 0;
  let at = lower.indexOf(term);
  while (at >= 0 && index < text.length) {
    if (at > index) parts.push(text.slice(index, at));
    parts.push(<mark key={at}>{text.slice(at, at + term.length)}</mark>);
    index = at + term.length;
    at = lower.indexOf(term, index);
  }
  if (index < text.length) parts.push(text.slice(index));
  return parts;
}
