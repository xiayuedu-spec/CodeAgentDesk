import { ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-contract';
import type { DashboardStats, HourlyUsage, UsageTrendDay } from '../shared/types';
import { readConfig, resolveClaudeHome } from './config';
import {
  getHourlyUsageToday,
  getUsageTrend,
  listSessions,
  readSessionUsage,
} from './session-library';
import { listKnowledge } from './knowledge-store';
import { getSummaryText } from './summary-store';
import { DEFAULT_HOURLY_LIMIT } from './usage-warning';
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

    // 单次遍历同时累计：今日会话数/项目分布、今日 token 总量、当前小时 token 量。
    let todaySessionCount = 0;
    let todayInput = 0;
    let todayOutput = 0;
    let todayCacheRead = 0;
    let hourTokens = 0;
    const projectMap = new Map<string, number>();
    for (const record of records) {
      if (record.archived) continue;
      const updatedMs = new Date(record.updatedAt).getTime();
      if (Number.isNaN(updatedMs)) continue;
      if (updatedMs >= todayStartMs) {
        todaySessionCount += 1;
        if (record.cwd) {
          projectMap.set(record.cwd, (projectMap.get(record.cwd) ?? 0) + 1);
        }
      } else {
        continue; // 今天之前的会话不贡献今日用量。
      }
      try {
        const usage = await readSessionUsage(record.filePath);
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
}
