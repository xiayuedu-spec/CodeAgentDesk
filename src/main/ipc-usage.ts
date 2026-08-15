import { ipcMain } from 'electron';
import path from 'node:path';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  DashboardStats,
  DayTimelineEvent,
  DayTimelineResult,
  EfficiencyDayStat,
  EfficiencyInsights,
  EfficiencySessionStat,
  HourlyUsage,
  UsageTrendDay,
} from '../shared/types';
import { readConfig, resolveClaudeHome } from './config';
import {
  getHourlyUsageToday,
  getUsageTrend,
  listSessions,
  readSessionActiveMs,
  readSessionUsage,
} from './session-library';
import { listKnowledge } from './knowledge-store';
import { getSummaryText } from './summary-store';
import { DEFAULT_HOURLY_LIMIT } from './usage-warning';
import { weekRangeFor } from './ipc-utils';
import type { SessionMetaStore } from './session-meta-store';
import type { SessionManager } from './session-manager';

export interface UsageIpcDeps {
  sessions: SessionManager;
  metaStore: SessionMetaStore;
}

/** 今日概览统计缓存 TTL：60 秒内重复请求直接复用，避免高频轮询重复扫描全部会话文件。 */
const DASHBOARD_TTL_MS = 60_000;
let dashboardCache: { at: number; value: DashboardStats } | null = null;

/** 配置（如小时限额）变化时使统计缓存失效，下次请求立即重算。 */
export function invalidateDashboardCache(): void {
  dashboardCache = null;
}

/** 用量与统计域 IPC：今日概览、历史用量趋势、今日每小时用量。 */
export function registerUsageIpc({ sessions, metaStore }: UsageIpcDeps): void {
  ipcMain.handle(IpcChannel.dashboardStats, async (): Promise<DashboardStats> => {
    if (dashboardCache && Date.now() - dashboardCache.at < DASHBOARD_TTL_MS) {
      return dashboardCache.value;
    }

    const claudeHome = resolveClaudeHome(readConfig());
    const records = await listSessions(claudeHome, metaStore);
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const todayStartMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    ).getTime();
    const hourStartMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0,
    ).getTime();

    // 单次遍历同时累计：今日会话数/项目分布、今日 token 总量、当前小时 token 量、累计输出。
    let todaySessionCount = 0;
    let todayInput = 0;
    let todayOutput = 0;
    let todayCacheRead = 0;
    let hourTokens = 0;
    let totalOutputTokens = 0;
    const projectMap = new Map<string, number>();
    for (const record of records) {
      if (record.archived) continue;
      const updatedMs = new Date(record.updatedAt).getTime();
      if (Number.isNaN(updatedMs)) continue;
      try {
        const usage = await readSessionUsage(record.filePath);
        totalOutputTokens += usage.outputTokens; // 累计输出：全部会话。
        if (updatedMs >= todayStartMs) {
          todaySessionCount += 1;
          if (record.cwd) {
            projectMap.set(record.cwd, (projectMap.get(record.cwd) ?? 0) + 1);
          }
          todayInput += usage.inputTokens;
          todayOutput += usage.outputTokens;
          todayCacheRead += usage.cacheReadTokens;
          if (updatedMs >= hourStartMs) {
            hourTokens +=
              usage.inputTokens +
              usage.outputTokens +
              usage.cacheReadTokens +
              usage.cacheCreationTokens;
          }
        }
      } catch {
        // 跳过无法读取的会话。
      }
    }

    const limitPerHour = readConfig().tokenLimitPerHour ?? DEFAULT_HOURLY_LIMIT;
    const value: DashboardStats = {
      runningCount: sessions.list().length,
      todaySessionCount,
      todayTokens: {
        inputTokens: todayInput,
        outputTokens: todayOutput,
        cacheReadTokens: todayCacheRead,
      },
      totalOutputTokens,
      todayProjects: [...projectMap.entries()]
        .map(([cwd, count]) => ({ cwd, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      knowledgeCount: listKnowledge().length,
      hasTodaySummary: Boolean(getSummaryText('day', todayKey)),
      hourlyTokens: hourTokens,
      hourlyLimit: limitPerHour,
      hourlyPercent: Math.min(100, Math.round((hourTokens / limitPerHour) * 100)),
    };
    dashboardCache = { at: Date.now(), value };
    return value;
  });

  ipcMain.handle(
    IpcChannel.usageTrend,
    async (_event, days: number): Promise<UsageTrendDay[]> => {
      const safeDays = Number.isFinite(days) ? Math.min(90, Math.max(7, Math.floor(days))) : 14;
      return getUsageTrend(resolveClaudeHome(readConfig()), metaStore, safeDays);
    },
  );

  ipcMain.handle(IpcChannel.usageHourly, async (): Promise<HourlyUsage[]> => {
    return getHourlyUsageToday(resolveClaudeHome(readConfig()), metaStore);
  });

  ipcMain.handle(
    IpcChannel.efficiencyInsights,
    async (_event, weekStart?: string): Promise<EfficiencyInsights> => {
      return computeEfficiencyInsights(resolveClaudeHome(readConfig()), metaStore, weekStart);
    },
  );

  ipcMain.handle(
    IpcChannel.timelineDay,
    async (_event, date?: string): Promise<DayTimelineResult> => {
      const key = date ?? new Date().toISOString().slice(0, 10);
      return computeDayTimeline(resolveClaudeHome(readConfig()), metaStore, key);
    },
  );
}

/** 效率洞察最多返回的会话明细条数。 */
const EFFICIENCY_TOP_SESSIONS = 10;

/**
 * 计算指定周（缺省本周，周一起）的 agent 投入时间与产出/成本统计。
 * 口径：会话按 startedAt 归周/归日；时长优先用活跃时长（事件间隔 ≤ 5 分钟累计），
 * 无时间戳时回退为会话跨度（updatedAt - startedAt）。
 */
export async function computeEfficiencyInsights(
  claudeHome: string,
  metaStore: SessionMetaStore,
  weekStart?: string,
): Promise<EfficiencyInsights> {
  const [monday, sunday] = weekRangeFor(weekStart);
  const prevStart = new Date(`${monday}T00:00:00`);
  prevStart.setDate(prevStart.getDate() - 7);
  const [prevMonday, prevSunday] = weekRangeFor(fmtDateKey(prevStart));

  const records = await listSessions(claudeHome, metaStore);
  const inWeek: { record: (typeof records)[number]; durationMs: number }[] = [];
  let prevTotalDurationMs = 0;
  let totalDurationMs = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  const dailyMap = new Map<string, EfficiencyDayStat>();

  for (const record of records) {
    const started = (record.startedAt || '').slice(0, 10);
    if (!started) continue;
    const durationMs = await sessionDurationMs(record);
    if (started >= monday && started <= sunday) {
      inWeek.push({ record, durationMs });
      totalDurationMs += durationMs;
      const day = dailyMap.get(started) ?? { date: started, durationMs: 0, sessionCount: 0 };
      day.durationMs += durationMs;
      day.sessionCount += 1;
      dailyMap.set(started, day);
      try {
        const usage = await readSessionUsage(record.filePath);
        outputTokens += usage.outputTokens;
        totalTokens +=
          usage.inputTokens +
          usage.outputTokens +
          usage.cacheReadTokens +
          usage.cacheCreationTokens;
      } catch {
        // 跳过无法读取的会话。
      }
    } else if (started >= prevMonday && started <= prevSunday) {
      prevTotalDurationMs += durationMs;
    }
  }

  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${monday}T00:00:00`);
    date.setDate(date.getDate() + index);
    const key = fmtDateKey(date);
    return dailyMap.get(key) ?? { date: key, durationMs: 0, sessionCount: 0 };
  });

  const topSessions: EfficiencySessionStat[] = [];
  for (const { record, durationMs } of inWeek
    .slice()
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, EFFICIENCY_TOP_SESSIONS)) {
    let sessionOutput = 0;
    let sessionTotal = 0;
    try {
      const usage = await readSessionUsage(record.filePath);
      sessionOutput = usage.outputTokens;
      sessionTotal =
        usage.inputTokens +
        usage.outputTokens +
        usage.cacheReadTokens +
        usage.cacheCreationTokens;
    } catch {
      // 跳过无法读取的会话。
    }
    topSessions.push({
      sessionId: record.sessionId,
      customName: record.customName,
      cwd: record.cwd,
      durationMs,
      outputTokens: sessionOutput,
      totalTokens: sessionTotal,
    });
  }

  return {
    weekStart: monday,
    weekEnd: sunday,
    sessionCount: inWeek.length,
    totalDurationMs,
    avgDurationMs: inWeek.length > 0 ? Math.round(totalDurationMs / inWeek.length) : 0,
    prevTotalDurationMs,
    outputTokens,
    totalTokens,
    daily,
    topSessions,
  };
}

async function sessionDurationMs(
  record: { filePath: string; startedAt: string; updatedAt: string },
): Promise<number> {
  try {
    const active = await readSessionActiveMs(record.filePath);
    if (active > 0) return active;
  } catch {
    // 回退到跨度。
  }
  const span =
    new Date(record.updatedAt).getTime() - new Date(record.startedAt).getTime();
  return span > 0 ? span : 0;
}

function fmtDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** 指定日（YYYY-MM-DD）的工作时间线：该日开始的所有会话（按 startedAt 归日）。 */
async function computeDayTimeline(
  claudeHome: string,
  metaStore: SessionMetaStore,
  date: string,
): Promise<DayTimelineResult> {
  const dayStart = new Date(`${date}T00:00:00`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const records = await listSessions(claudeHome, metaStore);

  const events: DayTimelineEvent[] = [];
  for (const record of records) {
    if ((record.startedAt || '').slice(0, 10) !== date) continue;
    const startMs = new Date(record.startedAt).getTime();
    let endMs = new Date(record.updatedAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    // 跨午夜的会话收窄到当天范围内。
    if (endMs > dayEnd) endMs = dayEnd;
    if (endMs <= startMs) endMs = Math.min(dayEnd, startMs + 60_000);
    let activeMs = 0;
    try {
      activeMs = await readSessionActiveMs(record.filePath);
    } catch {
      // 活跃时长不可用时置 0。
    }
    events.push({
      sessionId: record.sessionId,
      name: record.customName ?? (path.basename(record.cwd || '') || record.sessionId),
      cwd: record.cwd,
      startMs,
      endMs,
      activeMs,
    });
  }

  events.sort((a, b) => a.startMs - b.startMs);
  return { date, events };
}
