import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookMarked,
  BookOpen,
  Check,
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
import type { AgentStatusStyle, ThemeName } from '../../shared/types';
import type { AgentStatus } from '../hooks/useAgentStatus';
import { AgentStatusMark } from './AgentStatusMark';

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
  onUnlockTheme: (theme: ThemeName) => void;
  unlockedThemes: string[];
  showTokenStats: boolean;
  onToggleTokenStats: () => void;
  onOpenBackup: () => void;
  onOpenUsageStats: () => void;
  onOpenCards: () => void;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  updateReady: boolean;
  agentStatus: AgentStatus;
  agentStatusStyle: AgentStatusStyle;
  agentAlert?: boolean;
  /** 正在等用户输入/审批的会话（收件箱）。 */
  approvals: { id: string; title: string; cwd: string }[];
  onOpenApproval: (id: string) => void;
  pomodoroRunning: boolean;
  pomodoroText: string;
  pomodoroProgress: number;
  onPomodoroToggle: () => void;
  onPomodoroReset: () => void;
}

/** 彩蛋：连点版本号累计到阈值解锁隐藏主题。 */
const UNLOCK_CHAIN: { count: number; theme: ThemeName }[] = [
  { count: 7, theme: 'neon' },
  { count: 14, theme: 'term' },
];

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
  onUnlockTheme,
  unlockedThemes,
  showTokenStats,
  onToggleTokenStats,
  onOpenBackup,
  onOpenUsageStats,
  onOpenCards,
  onCheckUpdate,
  onInstallUpdate,
  updateReady,
  agentStatus,
  agentStatusStyle,
  agentAlert = false,
  approvals,
  onOpenApproval,
  pomodoroRunning,
  pomodoroText,
  pomodoroProgress,
  onPomodoroToggle,
  onPomodoroReset,
}: StatusBarProps) {
  const [versionClicks, setVersionClicks] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  useDismiss(approvalOpen, () => setApprovalOpen(false));
  // 所有会话都不再等待时自动收起收件箱，避免留一个空面板。
  useEffect(() => {
    if (approvals.length === 0 && approvalOpen) setApprovalOpen(false);
  }, [approvals.length, approvalOpen]);
  useDismiss(moreOpen, () => setMoreOpen(false));

  const handleVersionClick = (): void => {
    // 累计点击（不因解锁而清零），达到阈值即解锁对应隐藏主题。
    const next = versionClicks + 1;
    setVersionClicks(next);
    for (const step of UNLOCK_CHAIN) {
      if (next >= step.count && !unlockedThemes.includes(step.theme)) {
        onUnlockTheme(step.theme);
      }
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
    { key: 'knowledge', label: '项目知识库（AI 概览）', icon: <BookOpen size={13} />, run: onOpenKnowledge },
    { key: 'cards', label: '知识卡片（可检索/可验证）', icon: <BookMarked size={13} />, run: onOpenCards },
    { key: 'efficiency', label: '效率洞察', icon: <Gauge size={13} />, run: onOpenEfficiency },
    { key: 'dashboard', label: '今日概览', icon: <LayoutDashboard size={13} />, run: onOpenDashboard },
    { key: 'timeline', label: '工作时间线', icon: <History size={13} />, run: onOpenTimeline },
    { key: 'sep1', label: '', icon: null, run: () => undefined, separator: true },
    {
      key: 'token-stats',
      label: showTokenStats ? '隐藏 Token 统计' : '显示 Token 统计',
      icon: showTokenStats ? <Check size={13} /> : <Gauge size={13} />,
      run: onToggleTokenStats,
    },
    { key: 'update', label: '检查更新…', icon: <RefreshCw size={13} />, run: onCheckUpdate },
    ...(updateReady
      ? [{ key: 'install', label: '重启并安装更新', icon: <Rocket size={13} />, run: onInstallUpdate }]
      : []),
    { key: 'backup', label: '备份 / 迁移', icon: <Download size={13} />, run: onOpenBackup },
    { key: 'stats', label: '功能使用统计', icon: <BarChart3 size={13} />, run: onOpenUsageStats },
  ];

  return (
    <footer className="status-bar">
      <AgentStatusMark
        status={agentStatus}
        style={agentStatusStyle}
        className={`agent-status${agentAlert ? ' alert' : ''}`}
      />
      {approvals.length > 0 ? (
        <div className="approval-wrap">
          <button
            type="button"
            className={`status-day approval-pill${approvalOpen ? ' active' : ''}`}
            data-tip={`${approvals.length} 个会话在等你确认`}
            onClick={(event) => {
              event.stopPropagation();
              setApprovalOpen((open) => !open);
            }}
          >
            <AlertTriangle size={12} />
            {approvals.length}
          </button>
          {approvalOpen ? (
            <div
              className="approval-popover"
              role="dialog"
              aria-label="等待确认的会话"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="approval-head">在等你确认 · {approvals.length}</div>
              {approvals.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="approval-row"
                  title={item.cwd}
                  onClick={() => {
                    setApprovalOpen(false);
                    onOpenApproval(item.id);
                  }}
                >
                  <span className="approval-title">{item.title}</span>
                  <span className="approval-cwd">{item.cwd}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <span>{sessionCount} 会话</span>
      <span>{archivedCount} 归档</span>
      <button type="button" className="status-day" data-tip="返回首页" onClick={onOpenHome}>
        <Home size={12} />
        首页
      </button>
      <button type="button" className="status-day" data-tip="生成今日总结" onClick={onOpenSummary}>
        <Sparkles size={12} />
        今日总结
      </button>
      <div className="status-more-wrap">
        <button
          type="button"
          className={`status-day status-more${moreOpen ? ' active' : ''}`}
          data-tip="更多功能"
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
        data-tip={`番茄钟 · 已完成 ${Math.round(pomodoroProgress * 100)}% · 左键开始/暂停，右键重置`}
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
      <span className="status-version" data-tip="连点有惊喜" onClick={handleVersionClick}>
        v{version}
      </span>
    </footer>
  );
}
