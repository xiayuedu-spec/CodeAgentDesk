import { useCallback, useEffect, useState } from 'react';
import type { DashboardStats } from '../../shared/types';

const EMPTY_STATS: DashboardStats = {
  runningCount: 0,
  todaySessionCount: 0,
  todayTokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
  totalOutputTokens: 0,
  todayProjects: [],
  knowledgeCount: 0,
  hasTodaySummary: false,
  hourlyTokens: 0,
  hourlyLimit: 0,
  hourlyPercent: 0,
};

/** 今日概览数据（首页/仪表盘共用）。 */
export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);

  const refresh = useCallback(async () => {
    try {
      setStats(await window.codeagentdesk.getDashboardStats());
    } catch {
      // 静默忽略。
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 会话变化（新建/归档/删除/绑定）时刷新；主进程有 60s TTL 缓存兜底，不会反复全量扫描。
    const unsubscribe = window.codeagentdesk.onSessionsChanged(() => void refresh());
    // 兜底定时刷新：主进程缓存过期后最多 60s 内更新一次。
    const timer = setInterval(() => void refresh(), 60_000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [refresh]);

  return { stats, refresh };
}
