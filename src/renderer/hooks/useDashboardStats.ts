import { useCallback, useEffect, useState } from 'react';
import type { DashboardStats } from '../../shared/types';

const EMPTY_STATS: DashboardStats = {
  runningCount: 0,
  todaySessionCount: 0,
  todayTokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
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
  }, [refresh]);

  return { stats, refresh };
}
