import { useState } from 'react';

/**
 * 各浮层/视图的开关状态。
 *
 * 抽出来的理由：`App.tsx` 是一个近 2000 行的容器，10 个弹窗布尔量 + 4 个"打开并埋点"
 * 的函数占了开头的固定篇幅，且彼此毫无耦合。集中到这里后，App 只负责把它们接到 JSX。
 *
 * 埋点 key 仍由调用方（App）注入，避免这个 hook 直接依赖 `window.codeagentdesk`。
 */
export function useOverlays(bumpUsage: (key: string) => void) {
  const [usageTrendOpen, setUsageTrendOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [efficiencyOpen, setEfficiencyOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [usageStatsOpen, setUsageStatsOpen] = useState(false);

  return {
    usageTrendOpen,
    setUsageTrendOpen,
    knowledgeOpen,
    setKnowledgeOpen,
    dashboardOpen,
    setDashboardOpen,
    efficiencyOpen,
    setEfficiencyOpen,
    timelineOpen,
    setTimelineOpen,
    backupOpen,
    setBackupOpen,
    usageStatsOpen,
    setUsageStatsOpen,
    /** 打开今日概览（带埋点）。 */
    openDashboard: (): void => {
      bumpUsage('dashboard.opened');
      setDashboardOpen(true);
    },
    openEfficiency: (): void => {
      bumpUsage('efficiency.opened');
      setEfficiencyOpen(true);
    },
    openTimeline: (): void => {
      bumpUsage('timeline.opened');
      setTimelineOpen(true);
    },
    openKnowledge: (): void => {
      bumpUsage('knowledge.opened');
      setKnowledgeOpen(true);
    },
  };
}
