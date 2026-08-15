import { ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  AchievementBadge,
  FunStats,
  ProjectPersonality,
  SessionRecord,
} from '../shared/types';
import { readClaudeConfigInfo, readConfig, resolveClaudeHome, writeConfig } from './config';
import { listSessions, readSessionUsage } from './session-library';
import { computeEfficiencyInsights } from './ipc-usage';
import { weekRangeFor } from './ipc-utils';
import type { SessionMetaStore } from './session-meta-store';

export interface FunIpcDeps {
  metaStore: SessionMetaStore;
}

/** 成就徽章定义（按真实使用数据判定是否解锁）。 */
const BADGES: Omit<AchievementBadge, 'unlocked'>[] = [
  { id: 'first', icon: '🐣', label: '初来乍到', desc: '完成第一个会话' },
  { id: 'centurion', icon: '🥇', label: '百战老兵', desc: '累计完成 100 个会话' },
  { id: 'streak7', icon: '🔥', label: '七日连击', desc: '连续 7 天使用（截至今日）' },
  { id: 'nightowl', icon: '🌙', label: '夜猫子', desc: '有会话在凌晨 0-5 点活跃' },
  { id: 'power', icon: '⚡', label: '算力怪兽', desc: '单日输出 token 超 50 万' },
  { id: 'efficient', icon: '🎯', label: '效率大师', desc: '本周省时超 10 小时（按 2.5 倍人工估算）' },
  { id: 'organizer', icon: '🧹', label: '整理控', desc: '同一周归档超 10 个会话' },
];

/** 省时估算假设（与效率洞察一致）：人工约为 agent 耗时的 2.5 倍。 */
const HUMAN_MULTIPLIER = 2.5;
/** 单日输出 ≥ 该值解锁"算力怪兽"。 */
const POWER_DAY_OUTPUT = 500_000;
/** 本周省时 ≥ 该值解锁"效率大师"。 */
const EFFICIENT_SAVED_HOURS = 10;
/** 同周归档 ≥ 该值解锁"整理控"。 */
const ORGANIZER_WEEKLY_ARCHIVE = 10;
/** 项目性格取会话数最多的前 N 个项目。 */
const PERSONALITY_TOP = 5;

const FUN_TTL_MS = 60_000;
let funCache: { at: number; value: FunStats } | null = null;

function fmtDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function weekKeyOf(dateStr: string): string {
  return weekRangeFor(dateStr)[0];
}

/** 趣味域 IPC：成就徽章、项目性格、彩蛋解锁。 */
export function registerFunIpc({ metaStore }: FunIpcDeps): void {
  ipcMain.handle(IpcChannel.funStats, async (): Promise<FunStats> => {
    if (funCache && Date.now() - funCache.at < FUN_TTL_MS) {
      return funCache.value;
    }
    const claudeHome = resolveClaudeHome(readConfig());
    const value = await computeFunStats(claudeHome, metaStore);
    funCache = { at: Date.now(), value };
    return value;
  });

  ipcMain.handle(IpcChannel.funUnlockNeon, (): ReturnType<typeof readClaudeConfigInfo> => {
    writeConfig({ ...readConfig(), funUnlockedNeon: true });
    return readClaudeConfigInfo();
  });
}

async function computeFunStats(
  claudeHome: string,
  metaStore: SessionMetaStore,
): Promise<FunStats> {
  const records = await listSessions(claudeHome, metaStore);

  // 连续使用天数（截至今日；今天还没有会话则从昨天起算）。
  const activeDates = new Set(records.map((record) => (record.updatedAt || '').slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  if (!activeDates.has(fmtDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDates.has(fmtDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // 夜猫子：任一会话在凌晨 0-5 点最后活跃。
  let nightOwl = false;
  for (const record of records) {
    const hour = new Date(record.updatedAt).getHours();
    if (hour >= 0 && hour <= 5) {
      nightOwl = true;
      break;
    }
  }

  // 单日最大输出 / 每周归档数（整理控）/ 各项目输出占比（性格标签）。
  let maxDayOutput = 0;
  const outputByDay = new Map<string, number>();
  const projectTokens = new Map<string, { output: number; total: number }>();
  for (const record of records) {
    const day = (record.updatedAt || '').slice(0, 10);
    if (!day) continue;
    try {
      const usage = await readSessionUsage(record.filePath);
      outputByDay.set(day, (outputByDay.get(day) ?? 0) + usage.outputTokens);
      if (record.cwd) {
        const entry = projectTokens.get(record.cwd) ?? { output: 0, total: 0 };
        entry.output += usage.outputTokens;
        entry.total +=
          usage.inputTokens +
          usage.outputTokens +
          usage.cacheReadTokens +
          usage.cacheCreationTokens;
        projectTokens.set(record.cwd, entry);
      }
    } catch {
      // 跳过无法读取的会话。
    }
  }
  for (const output of outputByDay.values()) {
    if (output > maxDayOutput) maxDayOutput = output;
  }
  const archiveByWeek = new Map<string, number>();
  for (const record of records) {
    if (!record.archivedAt) continue;
    const week = weekKeyOf(record.archivedAt.slice(0, 10));
    archiveByWeek.set(week, (archiveByWeek.get(week) ?? 0) + 1);
  }
  const organizer = [...archiveByWeek.values()].some((count) => count >= ORGANIZER_WEEKLY_ARCHIVE);

  // 效率大师：本周省时（×2.5 估算）≥ 10 小时。
  let efficient = false;
  try {
    const insights = await computeEfficiencyInsights(claudeHome, metaStore);
    const savedHours = (insights.totalDurationMs / 3_600_000) * (HUMAN_MULTIPLIER - 1);
    efficient = savedHours >= EFFICIENT_SAVED_HOURS;
  } catch {
    // 计算失败不阻塞徽章。
  }

  const unlocked: Record<string, boolean> = {
    first: records.length >= 1,
    centurion: records.length >= 100,
    streak7: streak >= 7,
    nightowl: nightOwl,
    power: maxDayOutput >= POWER_DAY_OUTPUT,
    efficient,
    organizer,
  };
  const achievements = BADGES.map((badge) => ({ ...badge, unlocked: unlocked[badge.id] === true }));

  return {
    achievements,
    personalities: computePersonalities(records, projectTokens),
  };
}

/** 按会话数量取前 N 个项目，用平均跨度与输出占比归纳性格标签。 */
function computePersonalities(
  records: SessionRecord[],
  projectTokens: Map<string, { output: number; total: number }>,
): ProjectPersonality[] {
  const byProject = new Map<
    string,
    { count: number; spanMs: number; output: number; total: number }
  >();
  for (const record of records) {
    if (record.archived || !record.cwd) continue;
    const entry = byProject.get(record.cwd) ?? { count: 0, spanMs: 0, output: 0, total: 0 };
    entry.count += 1;
    const span = new Date(record.updatedAt).getTime() - new Date(record.startedAt).getTime();
    if (span > 0) entry.spanMs += span;
    const tokens = projectTokens.get(record.cwd);
    if (tokens) {
      entry.output += tokens.output;
      entry.total += tokens.total;
    }
    byProject.set(record.cwd, entry);
  }
  const sorted = [...byProject.entries()].sort((a, b) => b[1].count - a[1].count);
  const result: ProjectPersonality[] = [];
  for (const [cwd, stats] of sorted.slice(0, PERSONALITY_TOP)) {
    if (stats.count === 0) continue;
    const avgMinutes = Math.round(stats.spanMs / stats.count / 60_000);
    const ratio = stats.total > 0 ? Math.round((stats.output / stats.total) * 100) : 0;
    const label =
      avgMinutes >= 45
        ? '深耕型选手'
        : stats.count >= 10
          ? '高频协作型'
          : avgMinutes <= 10
            ? '快闪游击型'
            : '稳定推进型';
    result.push({
      cwd,
      label,
      desc: `${stats.count} 个会话 · 平均 ${avgMinutes} 分钟 · 输出占比 ${ratio}%`,
    });
  }
  return result;
}
