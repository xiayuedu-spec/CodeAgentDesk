import { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Download,
  Gauge,
  History,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  RefreshCw,
  Rocket,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useDismiss } from '../hooks/useDismiss';

interface StatusBarProps {
  sessionCount: number;
  archivedCount: number;
  claudeDirName: string;
  version: string;
  onOpenSummary: () => void;
  onOpenUsageTrend: () => void;
  onOpenKnowledge: () => void;
  onOpenEfficiency: () => void;
  onOpenDashboard: () => void;
  onOpenTimeline: () => void;
  onOpenHome: () => void;
  onUnlockNeon: () => void;
  onOpenBackup: () => void;
  onOpenUsageStats: () => void;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  updateReady: boolean;
  agentEmoji: string;
  agentStatusLabel: string;
  pomodoroRunning: boolean;
  pomodoroText: string;
  pomodoroProgress: number;
  onPomodoroToggle: () => void;
  onPomodoroReset: () => void;
}

/** 彩蛋：连点版本号次数达到该值解锁隐藏主题。 */
const NEON_CLICK_TARGET = 7;

export function StatusBar({
  sessionCount,
  archivedCount,
  claudeDirName,
  version,
  onOpenSummary,
  onOpenUsageTrend,
  onOpenKnowledge,
  onOpenEfficiency,
  onOpenDashboard,
  onOpenTimeline,
  onOpenHome,
  onUnlockNeon,
  onOpenBackup,
  onOpenUsageStats,
  onCheckUpdate,
  onInstallUpdate,
  updateReady,
  agentEmoji,
  agentStatusLabel,
  pomodoroRunning,
  pomodoroText,
  pomodoroProgress,
  onPomodoroToggle,
  onPomodoroReset,
}: StatusBarProps) {
  const [versionClicks, setVersionClicks] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  useDismiss(moreOpen, () => setMoreOpen(false));

  const handleVersionClick = (): void => {
    const next = versionClicks + 1;
    if (next >= NEON_CLICK_TARGET) {
      setVersionClicks(0);
      onUnlockNeon();
    } else {
      setVersionClicks(next);
    }
  };

  const moreItems: {
    key: string;
    label: string;
    icon: React.ReactNode | null;
    run: () => void;
    separator?: boolean;
  }[] = [
    { key: 'usage', label: '用量趋势', icon: <TrendingUp size={13} />, run: onOpenUsageTrend },
    { key: 'knowledge', label: '项目知识库', icon: <BookOpen size={13} />, run: onOpenKnowledge },
    { key: 'efficiency', label: '效率洞察', icon: <Gauge size={13} />, run: onOpenEfficiency },
    { key: 'dashboard', label: '今日概览', icon: <LayoutDashboard size={13} />, run: onOpenDashboard },
    { key: 'timeline', label: '工作时间线', icon: <History size={13} />, run: onOpenTimeline },
    { key: 'sep1', label: '', icon: null, run: () => undefined, separator: true },
    { key: 'update', label: '检查更新…', icon: <RefreshCw size={13} />, run: onCheckUpdate },
    ...(updateReady
      ? [{ key: 'install', label: '重启并安装更新', icon: <Rocket size={13} />, run: onInstallUpdate }]
      : []),
    { key: 'backup', label: '备份 / 迁移', icon: <Download size={13} />, run: onOpenBackup },
    { key: 'stats', label: '功能使用统计', icon: <BarChart3 size={13} />, run: onOpenUsageStats },
  ];

  return (
    <footer className="status-bar">
      <span className="agent-status" title={agentStatusLabel}>
        {agentEmoji}
      </span>
      <span>{sessionCount} 会话</span>
      <span>{archivedCount} 归档</span>
      <button type="button" className="status-day" title="返回首页" onClick={onOpenHome}>
        <Home size={12} />
        首页
      </button>
      <button type="button" className="status-day" title="生成今日总结" onClick={onOpenSummary}>
        <Sparkles size={12} />
        今日总结
      </button>
      <div className="status-more-wrap">
        <button
          type="button"
          className={`status-day status-more${moreOpen ? ' active' : ''}`}
          title="更多功能"
          onClick={(event) => {
            event.stopPropagation();
            setMoreOpen((open) => !open);
          }}
        >
          <MoreHorizontal size={13} />
          更多
        </button>
        {moreOpen ? (
          <div className="status-more-menu" role="menu" onClick={(event) => event.stopPropagation()}>
            {moreItems.map((item) =>
              item.separator ? (
                <div key={item.key} className="status-more-sep" />
              ) : (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    item.run();
                  }}
                >
                  <span className="status-more-icon">{item.icon}</span>
                  {item.label}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className={`pomodoro${pomodoroRunning ? ' running' : ''}`}
        title={`番茄钟 · 已完成 ${Math.round(pomodoroProgress * 100)}% · 左键开始/暂停，右键重置`}
        onClick={onPomodoroToggle}
        onContextMenu={(event) => {
          event.preventDefault();
          onPomodoroReset();
        }}
      >
        🍅 {pomodoroText}
      </button>
      <span className="status-bar-spacer" />
      <span>{claudeDirName}</span>
      <span className="status-version" title="连点有惊喜" onClick={handleVersionClick}>
        v{version}
      </span>
    </footer>
  );
}
