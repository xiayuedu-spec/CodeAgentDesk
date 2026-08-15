import { BookOpen, Plus, Sparkles, Terminal } from 'lucide-react';
import type { DashboardStats } from '../../shared/types';
import { folderName } from '../session-utils';

interface WelcomeProps {
  stats: DashboardStats;
  historyCount: number;
  error: string | null;
  onNew: () => void;
  onFocusHistory: () => void;
  onOpenSummary: () => void;
  onOpenKnowledge: () => void;
  onOpenUsageTrend: () => void;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

/** 欢迎页：今日概览（打开即见"现在"）。 */
export function Welcome({
  stats,
  historyCount,
  error,
  onNew,
  onFocusHistory,
  onOpenSummary,
  onOpenKnowledge,
  onOpenUsageTrend,
}: WelcomeProps) {
  const {
    todaySessionCount,
    todayTokens,
    runningCount,
    todayProjects,
    knowledgeCount,
    hasTodaySummary,
    hourlyTokens,
    hourlyPercent,
    hourlyLimit,
  } = stats;

  const limitTier =
    hourlyPercent >= 100 ? 'danger' : hourlyPercent >= 80 ? 'warn' : '';

  return (
    <div className="welcome">
      <div className="welcome-icon">
        <Terminal size={26} strokeWidth={1.6} />
      </div>
      <div className="welcome-title">CodeAgentDesk</div>
      <div className="welcome-sub">Claude Code 统一窗口管理器</div>

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
          <span className="dashboard-card-value">{formatTokens(todayTokens.inputTokens)}</span>
          <span className="dashboard-card-label">今日输入 token</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card-value">{formatTokens(todayTokens.outputTokens)}</span>
          <span className="dashboard-card-label">今日输出 token</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card-value">{knowledgeCount}</span>
          <span className="dashboard-card-label">知识库项目</span>
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
            {formatTokens(hourlyTokens)} / {formatTokens(hourlyLimit)}（{hourlyPercent}%）
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

      <div className="welcome-actions">
        <button type="button" className="welcome-btn primary" onClick={onNew}>
          <Plus size={16} />
          <span>新建会话</span>
        </button>
        {historyCount > 0 ? (
          <button type="button" className="welcome-btn" onClick={onFocusHistory}>
            <BookOpen size={16} />
            <span>打开历史会话</span>
          </button>
        ) : null}
        <button type="button" className="welcome-btn" onClick={onOpenSummary}>
          <Sparkles size={16} />
          <span>今日总结</span>
        </button>
        <button type="button" className="welcome-btn" onClick={onOpenKnowledge}>
          知识库
        </button>
        <button type="button" className="welcome-btn" onClick={onOpenUsageTrend}>
          用量趋势
        </button>
      </div>
      <div className="welcome-hint">Ctrl+K 全局搜索 · Ctrl+T 新建会话 · Ctrl+1..9 切换标签</div>
      {error ? <div className="welcome-error">{error}</div> : null}
    </div>
  );
}
