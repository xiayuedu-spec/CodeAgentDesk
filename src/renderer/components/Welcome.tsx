import { useEffect, useState } from 'react';
import { Activity, BookOpen, Database, Plus, Sparkles, Terminal } from 'lucide-react';
import type { DashboardStats, GroupRecord, SessionRecord } from '../../shared/types';
import { folderName } from '../session-utils';
import { computeMbti } from '../mbti';

interface WelcomeProps {
  stats: DashboardStats;
  historyCount: number;
  records: SessionRecord[];
  groups: GroupRecord[];
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

/** 电子宠物树成长阶段（按累计输出 token）。 */
const TREE_STAGES: { min: number; emoji: string; label: string; next: number | null }[] = [
  { min: 0, emoji: '🌰', label: '种子', next: 100_000 },
  { min: 100_000, emoji: '🌱', label: '幼苗', next: 1_000_000 },
  { min: 1_000_000, emoji: '🌿', label: '小树', next: 5_000_000 },
  { min: 5_000_000, emoji: '🌳', label: '大树', next: 20_000_000 },
  { min: 20_000_000, emoji: '🌟🌳', label: '发光大树', next: null },
];

function treeInfo(totalOutput: number): {
  emoji: string;
  label: string;
  progress: number;
  gap: number;
} {
  let stage = TREE_STAGES[0];
  for (const candidate of TREE_STAGES) {
    if (totalOutput >= candidate.min) stage = candidate;
  }
  const next = stage.next;
  const progress = next
    ? Math.min(100, ((totalOutput - stage.min) / (next - stage.min)) * 100)
    : 100;
  const gap = next ? Math.max(0, next - totalOutput) : 0;
  return { emoji: stage.emoji, label: stage.label, progress, gap };
}

/** 今日摸鱼指数（纯娱乐，按今日输出 token 估算）。 */
function slackingInfo(output: number): { index: number; text: string } {
  if (output < 10_000) return { index: 88, text: '鱼都快忘了你是程序员' };
  if (output < 50_000) return { index: 52, text: '摸鱼与工作五五开' };
  if (output < 150_000) return { index: 23, text: '状态不错，继续' };
  return { index: 8, text: '卷王本王' };
}

/** 程序员幸运签（按日期确定性轮换）。 */
const FORTUNES: { good: string; bad: string }[] = [
  { good: '重构', bad: '加需求' },
  { good: '写测试', bad: '删测试' },
  { good: '早睡', bad: '半夜改代码' },
  { good: '小步提交', bad: '一次性大提交' },
  { good: '读文档', bad: '盲猜 API' },
  { good: '清理 TODO', bad: '新开 TODO' },
  { good: '喝咖啡', bad: '喝第三杯咖啡' },
  { good: '备份', bad: '相信"应该没事"' },
  { good: '问同事', bad: '独自硬刚三小时' },
  { good: '写注释', bad: '写"// 这里很复杂"' },
  { good: '优化慢查询', bad: '多加索引' },
  { good: '代码评审', bad: '直接合并' },
  { good: '摸鱼五分钟', bad: '摸鱼五小时' },
  { good: '小步升级', bad: '立刻升到最新版' },
  { good: '写提交信息', bad: '提交"update"' },
  { good: '删死代码', bad: '留着"以后可能用"' },
];

function fortuneOf(dateKey: string): { good: string; bad: string } {
  let hash = 0;
  for (const char of dateKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FORTUNES[hash % FORTUNES.length];
}

/** 打字机开场：逐字显示标题。 */
function useTypewriter(text: string, speedMs = 90): string {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    const timer = setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, speedMs);
    return () => clearInterval(timer);
  }, [text, speedMs]);
  return text.slice(0, count);
}

/** 欢迎页：今日概览（打开即见"现在"）。 */
export function Welcome({
  stats,
  historyCount,
  records,
  groups,
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
  const tree = treeInfo(stats.totalOutputTokens);
  const slack = slackingInfo(todayTokens.outputTokens);
  const mbti = computeMbti(records, groups, todayTokens.inputTokens, todayTokens.outputTokens);
  const fortune = fortuneOf(new Date().toISOString().slice(0, 10));
  const typedTitle = useTypewriter('CodeAgentDesk');

  return (
    <div className="welcome">
      <div className="welcome-icon">
        <Terminal size={26} strokeWidth={1.6} />
      </div>
      <div className="welcome-title">
        {typedTitle}
        <span className="type-cursor" />
      </div>
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

      <div className="fun-row">
        <div className="fun-tree" title={`累计输出 ${formatTokens(stats.totalOutputTokens)} token`}>
          <span className="fun-tree-emoji">{tree.emoji}</span>
          <span className="fun-tree-label">电子宠物树 · {tree.label}</span>
          <div className="fun-tree-bar">
            <span style={{ width: `${tree.progress}%` }} />
          </div>
          <span className="fun-tree-sub">
            {tree.gap > 0 ? `距下一阶段还需 ${formatTokens(tree.gap)} 输出` : '已满级，点亮全场 ✨'}
          </span>
        </div>
        <div className="fun-slack">
          <span className="fun-slack-index">🐟 今日摸鱼指数 {slack.index}%</span>
          <span className="fun-slack-text">{slack.text}</span>
        </div>
      </div>

      {mbti ? (
        <div className="fun-mbti" title="基于使用习惯的娱乐推断，非严谨测评">
          <div className="fun-mbti-head">
            <span className="fun-mbti-code">{mbti.code}</span>
            <span className="fun-mbti-title">你的 MBTI 属性（按使用习惯推断）</span>
          </div>
          <div className="fun-mbti-dims">
            {mbti.dims.map((dim) => (
              <span key={dim.trait} className="fun-mbti-dim" title={`${dim.label} ${dim.percent}%`}>
                {dim.trait} {dim.percent}%
              </span>
            ))}
          </div>
          <div className="fun-mbti-summary">{mbti.summary}</div>
        </div>
      ) : (
        <div className="fun-mbti fun-mbti-empty">积累一些会话后，解锁基于习惯的 MBTI 推断 🧭</div>
      )}

      <div className="fun-fortune" title="按日期轮换的今日签">
        🥠 今日宜<b>{fortune.good}</b> · 忌<b>{fortune.bad}</b>
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
          <Database size={14} />
          <span>知识库</span>
        </button>
        <button type="button" className="welcome-btn" onClick={onOpenUsageTrend}>
          <Activity size={14} />
          <span>用量趋势</span>
        </button>
      </div>
      <div className="welcome-hint">Ctrl+K 全局搜索 · Ctrl+T 新建会话 · Ctrl+1..9 切换标签</div>
      {error ? <div className="welcome-error">{error}</div> : null}
    </div>
  );
}
