import { ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-contract';
import type { DashboardStats, HourlyUsage, UsageTrendDay } from '../shared/types';
import { readConfig, resolveClaudeHome } from './config';
import {
  getCurrentHourUsage,
  getHourlyUsageToday,
  getUsageTrend,
  listSessions,
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

/** 用量与统计域 IPC：今日概览、历史用量趋势、今日每小时用量。 */
export function registerUsageIpc({ sessions, metaStore }: UsageIpcDeps): void {
  ipcMain.handle(IpcChannel.dashboardStats, async (): Promise<DashboardStats> => {
    const claudeHome = resolveClaudeHome(readConfig());
    const records = await listSessions(claudeHome, metaStore);
    const today = new Date().toISOString().slice(0, 10);
    const todayRecords = records.filter(
      (record) => !record.archived && (record.updatedAt || '').slice(0, 10) === today,
    );
    const projectMap = new Map<string, number>();
    for (const record of todayRecords) {
      if (!record.cwd) continue;
      projectMap.set(record.cwd, (projectMap.get(record.cwd) ?? 0) + 1);
    }
    const trend = await getUsageTrend(claudeHome, metaStore, 1);
    const todayTokens = trend[0] ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    const limitPerHour = readConfig().tokenLimitPerHour ?? DEFAULT_HOURLY_LIMIT;
    const hour = await getCurrentHourUsage(claudeHome, metaStore);
    return {
      runningCount: sessions.list().length,
      todaySessionCount: todayRecords.length,
      todayTokens: {
        inputTokens: todayTokens.inputTokens,
        outputTokens: todayTokens.outputTokens,
        cacheReadTokens: todayTokens.cacheReadTokens,
      },
      todayProjects: [...projectMap.entries()]
        .map(([cwd, count]) => ({ cwd, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      knowledgeCount: listKnowledge().length,
      hasTodaySummary: Boolean(getSummaryText('day', today)),
      hourlyTokens: hour.tokens,
      hourlyLimit: limitPerHour,
      hourlyPercent: Math.min(100, Math.round((hour.tokens / limitPerHour) * 100)),
    };
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
