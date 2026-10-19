import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  FileCode2,
  GitBranch,
  Loader2,
  ListChecks,
  Send,
} from 'lucide-react';
import type { SessionGitInfo, SessionInsights, SessionTodo } from '../../shared/types';
import { statusLabel, type SessionView } from '../session-utils';

interface InfoPanelProps {
  session: SessionView;
  /** 会话洞察：计划 / 改动 / 痕迹（null = 读取中或还没有记录）。 */
  insights: SessionInsights | null;
  /** 工作区 git 摘要（非仓库为 null，整行隐藏）。 */
  git: SessionGitInfo | null;
  onResizeStart: (event: ReactMouseEvent) => void;
  /** 打开「计划与改动」全量弹窗。 */
  onOpenInsights?: () => void;
  /** 把未完成计划拼成续做提示注入会话。 */
  onContinuePlan?: (prompt: string) => void;
}

/** 计划里最多直接展示几条（其余折叠进弹窗）。 */
const PLAN_PREVIEW = 5;
/** 改动清单最多直接展示几个文件。 */
const FILES_PREVIEW = 5;

function formatMinutes(ms: number): string {
  if (!ms) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

function formatClock(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function planIcon(status: SessionTodo['status']) {
  if (status === 'completed') return <CircleCheck size={12} className="rail-todo-done" />;
  if (status === 'in_progress') return <Loader2 size={12} className="spin rail-todo-active" />;
  return <CircleDashed size={12} className="rail-todo-pending" />;
}

/** 未完成计划 → 单行续做提示（单行是为了能安全地注入终端并按一次回车提交）。 */
export function buildContinuePrompt(plan: {
  todos: SessionTodo[];
  updates: number;
}): string | null {
  const remaining = plan.todos.filter((todo) => todo.status !== 'completed');
  if (remaining.length === 0) return null;
  const done = plan.todos.length - remaining.length;
  const active = remaining.find((todo) => todo.status === 'in_progress');
  const items = remaining.map((todo, index) => `${index + 1}）${todo.content}`).join('；');
  const lead = active
    ? `先把「${active.content}」做完`
    : `按顺序继续`;
  return `继续上次未完成的计划（已完成 ${done}/${plan.todos.length}）。剩余待办：${items}。${lead}，每完成一项就用 TodoWrite 更新进度。`.slice(
    0,
    1500,
  );
}

/**
 * 右侧信息栏：从"信息展示"改成"当前会话的仪表"——
 * 计划进度（可一键续做）、本次改动、会话痕迹、工作区 git 状态。
 */
export function InfoPanel({
  session,
  insights,
  git,
  onResizeStart,
  onOpenInsights,
  onContinuePlan,
}: InfoPanelProps) {
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  // 换会话时收起预览，避免把上一个会话的提示发给新会话。
  useEffect(() => {
    setPendingPrompt(null);
  }, [session.id]);

  const plan = insights?.plan ?? null;
  const planDone = plan ? plan.todos.filter((todo) => todo.status === 'completed').length : 0;
  const planTotal = plan?.todos.length ?? 0;
  const remaining = plan ? planTotal - planDone : 0;
  const percent = planTotal > 0 ? (planDone / planTotal) * 100 : 0;
  const previewTodos = plan
    ? [
        // 先把"进行中"的顶上来，被折叠的待办不会盖住当前在做的事
        ...plan.todos.filter((todo) => todo.status === 'in_progress'),
        ...plan.todos.filter((todo) => todo.status !== 'in_progress'),
      ].slice(0, PLAN_PREVIEW)
    : [];
  const stats = insights?.stats;
  const totals = insights?.totals;

  return (
    <section className="info-panel" aria-label="会话仪表">
      <div className="info-resizer" onMouseDown={onResizeStart} title="拖动调整宽度" />
      <div className="info-scroll">
        <header className="rail-head">
          <span className={`rail-status ${session.status}`}>{statusLabel(session.status)}</span>
          <span className="rail-active">
            活跃 {stats ? formatMinutes(stats.activeMs) : '—'}
          </span>
        </header>

        <section className="rail-card">
          <div className="rail-title">
            <ListChecks size={12} />
            计划
            {plan ? (
              <span className="rail-title-meta">
                {planDone}/{planTotal}
              </span>
            ) : null}
          </div>
          {plan ? (
            <>
              <div className="rail-bar">
                <span style={{ width: `${percent}%` }} />
              </div>
              <ul className="rail-todos">
                {previewTodos.map((todo, index) => (
                  <li key={`${index}-${todo.content}`} className={`rail-todo ${todo.status}`}>
                    {planIcon(todo.status)}
                    <span title={todo.content}>{todo.content}</span>
                  </li>
                ))}
              </ul>
              {planTotal > previewTodos.length ? (
                <div className="rail-hint">另有 {planTotal - previewTodos.length} 项在完整视图里</div>
              ) : null}
              {remaining > 0 && onContinuePlan ? (
                pendingPrompt === null ? (
                  <button
                    type="button"
                    className="rail-action primary"
                    onClick={() => {
                      const prompt = buildContinuePrompt({
                        todos: plan.todos,
                        updates: plan.updates,
                      });
                      if (prompt) setPendingPrompt(prompt);
                    }}
                  >
                    <ArrowRight size={12} />
                    继续未完成的 {remaining} 项
                  </button>
                ) : (
                  // 先预览再发送：往终端写整句提示是不可撤销操作，给一次看清的机会。
                  <div className="rail-preview" aria-label="续做提示预览">
                    <pre className="rail-preview-text">{pendingPrompt}</pre>
                    <div className="rail-preview-hint">
                      将以单行发送到终端，并自动回车
                    </div>
                    <div className="rail-preview-actions">
                      <button
                        type="button"
                        className="rail-action primary"
                        onClick={() => {
                          onContinuePlan(pendingPrompt);
                          setPendingPrompt(null);
                        }}
                      >
                        <Send size={12} />
                        发送
                      </button>
                      <button
                        type="button"
                        className="rail-action"
                        onClick={() => setPendingPrompt(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )
              ) : null}
            </>
          ) : (
            <div className="rail-empty">
              {insights ? '本次会话还没有计划（TodoWrite）' : '读取中…'}
            </div>
          )}
        </section>

        <section className="rail-card">
          <div className="rail-title">
            <FileCode2 size={12} />
            改动
            {totals && totals.files > 0 ? (
              <span className="rail-title-meta">
                {totals.files} 文件 <b className="rail-add">+{totals.added}</b>{' '}
                <b className="rail-del">-{totals.removed}</b>
              </span>
            ) : null}
          </div>
          {insights && insights.changes.length > 0 ? (
            <>
              <ul className="rail-files">
                {insights.changes.slice(0, FILES_PREVIEW).map((change) => (
                  <li key={change.path} title={change.path}>
                    <span className="rail-file-name">
                      {change.path.split(/[\\/]/).pop() ?? change.path}
                    </span>
                    <span className="rail-file-nums">
                      <i className="rail-add">+{change.added}</i>
                      <i className="rail-del">-{change.removed}</i>
                    </span>
                  </li>
                ))}
              </ul>
              {onOpenInsights ? (
                <button type="button" className="rail-action" onClick={onOpenInsights}>
                  查看全部片段
                </button>
              ) : null}
            </>
          ) : (
            <div className="rail-empty">
              {insights ? '本次会话没有文件改动' : '读取中…'}
            </div>
          )}
        </section>

        <section className="rail-card">
          <div className="rail-title">痕迹</div>
          <div className="rail-stats">
            <div>
              <strong>{stats?.turns ?? '—'}</strong>
              <span>轮对话</span>
            </div>
            <div>
              <strong>{stats?.toolCalls ?? '—'}</strong>
              <span>次工具调用</span>
            </div>
            <div>
              <strong className={stats && stats.errors > 0 ? 'rail-del' : ''}>
                {stats?.errors ?? '—'}
              </strong>
              <span>次失败</span>
            </div>
            <div>
              <strong>{formatClock(stats?.startedAt)}</strong>
              <span>开始</span>
            </div>
          </div>
        </section>

        {git ? (
          <section className="rail-card rail-git">
            <div className="rail-title">
              <GitBranch size={12} />
              <span className="rail-branch" title={git.branch}>
                {git.branch}
              </span>
            </div>
            <div className="rail-git-meta">
              {git.dirty > 0 ? `${git.dirty} 个文件未提交` : '工作区干净'}
              {git.ahead > 0 ? ` · 领先 ${git.ahead}` : ''}
              {git.behind > 0 ? ` · 落后 ${git.behind}` : ''}
            </div>
          </section>
        ) : null}

        <section className="rail-card rail-meta">
          <div className="rail-meta-row" title={session.cwd}>
            {session.cwd}
          </div>
          <div className="rail-meta-row mono">{session.sessionId ?? '会话 ID 绑定中…'}</div>
        </section>
      </div>
    </section>
  );
}
