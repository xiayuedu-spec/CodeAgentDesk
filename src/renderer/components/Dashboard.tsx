import { Activity, BookOpen, Database, History, Plus, Sparkles, TrendingUp, X } from 'lucide-react';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useEscape } from '../hooks/useEscape';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { folderName } from '../session-utils';

interface DashboardProps {
  onClose: () => void;
  onNew: () => void;
  onFocusHistory: () => void;
  onOpenSummary: () => void;
  onOpenKnowledge: () => void;
  onOpenUsageTrend: () => void;
  onOpenEfficiency: () => void;
  onOpenTimeline: () => void;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

/** 今日 AI 段位：按今日输出 token 分档（纯趣味）。 */
const RANKS: { min: number; icon: string; label: string }[] = [
  { min: 400_000, icon: '👑', label: '王者' },
  { min: 150_000, icon: '💎', label: '钻石' },
  { min: 50_000, icon: '🥇', label: '黄金' },
  { min: 10_000, icon: '🥈', label: '白银' },
  { min: 0, icon: '🥉', label: '青铜' },
];

function todayRank(outputTokens: number): { icon: string; label: string } {
  return RANKS.find((rank) => outputTokens >= rank.min) ?? RANKS[RANKS.length - 1];
}

/** 今日概览弹窗（Ctrl+P 入口，随时查看"现在"）。 */
export function Dashboard({
  onClose,
  onNew,
  onFocusHistory,
  onOpenSummary,
  onOpenKnowledge,
  onOpenUsageTrend,
  onOpenEfficiency,
  onOpenTimeline,
}: DashboardProps) {
  const { stats } = useDashboardStats();
  useEscape(true, onClose);
  const animatedInput = useAnimatedNumber(stats.todayTokens.inputTokens);
  const animatedOutput = useAnimatedNumber(stats.todayTokens.outputTokens);
  const animatedHourly = useAnimatedNumber(stats.hourlyTokens);
  const {
    todaySessionCount,
    todayTokens,
    runningCount,
    todayProjects,
    knowledgeCount,
    hasTodaySummary,
    hourlyPercent,
    hourlyLimit,
  } = stats;

  const limitTier = hourlyPercent >= 100 ? 'danger' : hourlyPercent >= 80 ? 'warn' : '';

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel dashboard-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">今日概览</span>
          <div className="day-actions">
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="day-body">
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <span className="dashboard-card-value">{runningCount}</span>
              <span className="dashboard-card-label">运行中会话</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-card-value">{todaySessionCount}</span>
              <span className="dashboard-card-label">今日会话</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-card-value">{formatTokens(animatedInput)}</span>
              <span className="dashboard-card-label">今日输入 token</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-card-value">{formatTokens(animatedOutput)}</span>
              <span className="dashboard-card-label">今日输出 token</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-card-value">{knowledgeCount}</span>
              <span className="dashboard-card-label">知识库项目</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-card-value">{todayRank(todayTokens.outputTokens).icon}</span>
              <span className="dashboard-card-label">
                今日段位 {todayRank(todayTokens.outputTokens).label}
              </span>
            </div>
            <div className="dashboard-card">
              <span className={`dashboard-card-value ${hasTodaySummary ? 'ok' : ''}`}>
                {hasTodaySummary ? '✓' : '—'}
              </span>
              <span className="dashboard-card-label">今日总结</span>
            </div>
          </div>

          <div className="dashboard-limit">
            <div className="dashboard-limit-head">
              <span className="dashboard-limit-label">本小时消耗（整点刷新）</span>
              <span className={`dashboard-limit-value ${limitTier}`}>
                {formatTokens(animatedHourly)} / {formatTokens(hourlyLimit)}（{hourlyPercent}%）
              </span>
            </div>
            <div className={`dashboard-limit-bar ${limitTier}`}>
              <span style={{ width: `${Math.min(100, hourlyPercent)}%` }} />
            </div>
          </div>

          {todayProjects.length > 0 ? (
            <div className="dashboard-projects">
              <span className="dashboard-projects-label">今日活跃项目</span>
              <div className="dashboard-project-chips">
                {todayProjects.map((project) => (
                  <span key={project.cwd} className="dashboard-project-chip" title={project.cwd}>
                    {folderName(project.cwd)} · {project.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="dashboard-actions">
            <button type="button" className="welcome-btn primary" onClick={onNew}>
              <Plus size={14} />
              新建会话
            </button>
            <button type="button" className="welcome-btn" onClick={onFocusHistory}>
              <BookOpen size={14} />
              历史会话
            </button>
            <button type="button" className="welcome-btn" onClick={onOpenSummary}>
              <Sparkles size={14} />
              今日总结
            </button>
            <button type="button" className="welcome-btn" onClick={onOpenKnowledge}>
              <Database size={14} />
              知识库
            </button>
            <button type="button" className="welcome-btn" onClick={onOpenUsageTrend}>
              <Activity size={14} />
              用量趋势
            </button>
            <button type="button" className="welcome-btn" onClick={onOpenEfficiency}>
              <TrendingUp size={14} />
              效率洞察
            </button>
            <button type="button" className="welcome-btn" onClick={onOpenTimeline}>
              <History size={14} />
              时间线
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
