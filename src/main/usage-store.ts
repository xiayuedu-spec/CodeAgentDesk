import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface UsageStat {
  count: number;
  lastAt: string;
}

export type UsageStats = Record<string, UsageStat>;

/** 允许统计的功能键（防止渲染层写入任意键）。 */
const KNOWN_KEYS = new Set([
  'palette.opened',
  'search.used',
  'summary.day',
  'summary.week',
  'summary.month',
  'knowledge.generate',
  'knowledge.export',
  'knowledge.global',
  'dashboard.opened',
  'efficiency.opened',
  'timeline.opened',
  'detail.opened',
  'export.md',
  'session.pin',
  'archive.delete',
  'pomodoro.start',
]);

let cache: UsageStats | null = null;

function filePath(): string {
  return path.join(app.getPath('userData'), 'usage-stats.json');
}

function load(): UsageStats {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(filePath(), 'utf8')) as UsageStats;
  } catch {
    cache = {};
  }
  return cache;
}

function save(): void {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cache ?? {}, null, 2), 'utf8');
}

/** 记录一次功能使用（本地计数，不采集内容）。未知 key 忽略。 */
export function incrementUsage(key: string): void {
  if (!KNOWN_KEYS.has(key)) return;
  const map = load();
  const entry = map[key] ?? { count: 0, lastAt: '' };
  entry.count += 1;
  entry.lastAt = new Date().toISOString();
  map[key] = entry;
  save();
}

/** 当前全部使用统计（浅拷贝）。 */
export function listUsage(): UsageStats {
  return { ...load() };
}
