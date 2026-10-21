import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  ArrowRight,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  FileCode2,
  GitBranch,
  Loader2,
  ListChecks,
  Send,
} from 'lucide-react';
import type { SessionTodo } from '../../shared/types';
import { statusLabel, type SessionView } from '../session-utils';
import {
  buildContinuePrompt,
  formatClock,
  formatDuration,
} from '../insights-utils';
import { useSessionRail } from '../hooks/useSessionRail';

interface InfoPanelProps {
  session: SessionView;
  /** 是否轮询（会话运行中 + 面板展开 + 窗口可见由上层判定）。 */
  running: boolean;
  onResizeStart: (event: ReactMouseEvent) => void;
  /** 打开「计划与改动」全量弹窗；传 path 时定位到该文件。 */
  onOpenInsights?: (path?: string) => void;
  /** 把未完成计划拼成续做提示注入会话。 */
  onContinuePlan?: (prompt: string) => void;
  /** 打开工作区改动审查（git diff）。 */
  onOpenDiff?: () => void;
  /** 收起右栏（把宽度让给主区）。 */
  onCollapse?: () => void;
  /** 跳到会话详情里对应的那条用户输入。 */
  onJumpToPrompt?: (text: string) => void;
  /** 打开详情并只看我的输入（看全部历史输入）。 */
  onOpenAllPrompts?: () => void;
}

/** 计划里最多直接展示几条（其余折叠进弹窗）。 */
const PLAN_PREVIEW = 5;
/** 改动清单最多直接展示几个文件。 */
const FILES_PREVIEW = 5;

function planIcon(status: SessionTodo['status']) {
  if (status === 'completed') return <CircleCheck size={12} className="rail-todo-done" />;
  if (status === 'in_progress') return <Loader2 size={12} className="spin rail-todo-active" />;
  return <CircleDashed size={12} className="rail-todo-pending" />;
}

/**
 * 右侧信息栏：从"信息展示"改成"当前会话的仪表"——
 * 计划进度（可一键续做）、本次改动、会话痕迹、工作区 git 状态。
 */
export function InfoPanel({
  session,
  running,
  onResizeStart,
  onOpenInsights,
  onContinuePlan,
  onOpenDiff,
  onCollapse,
  onJumpToPrompt,
  onOpenAllPrompts,
}: InfoPanelProps) {
  // 数据在面板内部取：15s 轮询只重渲染这一棵小树，不再把整个 App 叫醒。
  const { insights, git } = useSessionRail(session.sessionId, session.cwd, running);
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
  const prompts = insights?.prompts ?? [];
  const totals = insights?.totals;

  return (
    <section className="info-panel" aria-label="会话仪表">
      <div
        className="info-resizer"
        onMouseDown={onResizeStart}
        onDoubleClick={onCollapse}
        title="拖动调整宽度 · 双击收起"
      />
      <div className="info-scroll">
        <header className="rail-head">
          <span className={`rail-status ${session.status}`}>{statusLabel(session.status)}</span>
          <span className="rail-active">
            活跃 {stats ? formatDuration(stats.activeMs) : '—'}
          </span>
          {onCollapse ? (
            <button
              type="button"
              className="rail-collapse"
              title="收起右栏（双击分隔条也可以）"
              aria-label="收起右栏"
              onClick={onCollapse}
            >
              <ChevronRight size={13} />
            </button>
          ) : null}
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
                  <li key={change.path}>
                    <button
                      type="button"
                      className="rail-file"
                      title={`${change.path}（点击查看片段）`}
                      onClick={() => onOpenInsights?.(change.path)}
                    >
                      <span className="rail-file-name">
                        {change.path.split(/[\\/]/).pop() ?? change.path}
                      </span>
                      <span className="rail-file-nums">
                        <i className="rail-add">+{change.added}</i>
                        <i className="rail-del">-{change.removed}</i>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {onOpenInsights ? (
                <button type="button" className="rail-action" onClick={() => onOpenInsights()}>
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
          <div className="rail-title">
            痕迹
            <span className="rail-title-meta">
              {stats?.turns ?? '—'} 轮 · {stats?.toolCalls ?? '—'} 调用
              {stats && stats.errors > 0 ? ` · ${stats.errors} 失败` : ''}
            </span>
            {prompts.length > 6 && onOpenAllPrompts ? (
              <button
                type="button"
                className="rail-link"
                title={`查看全部 ${prompts.length} 条输入`}
                onClick={onOpenAllPrompts}
              >
                全部 {prompts.length}
              </button>
            ) : null}
          </div>
          {prompts.length > 0 ? (
            <ul className="rail-prompts">
              {prompts.slice(-6).map((prompt, index) => {
                // 绝对轮次：只留了最近 12 条，靠总数反推它的序号
                const turn = (stats?.turns ?? prompts.length) - prompts.slice(-6).length + index + 1;
                return (
                  <li key={`${turn}-${prompt.text.slice(0, 12)}`}>
                    <button
                      type="button"
                      className="rail-prompt"
                      title={prompt.text}
                      onClick={() => onJumpToPrompt?.(prompt.text)}
                    >
                      <span className="rail-prompt-index">{turn}</span>
                      <span className="rail-prompt-text">{prompt.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rail-empty">{insights ? '还没读到用户输入' : '读取中…'}</div>
          )}
          <div className="rail-traces">
            <span>{formatClock(stats?.startedAt)} 开始</span>
            <i>·</i>
            <span>{stats ? formatDuration(stats.activeMs) : '—'} 活跃</span>
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
            {onOpenDiff ? (
              <button type="button" className="rail-action" onClick={onOpenDiff}>
                {git.dirty > 0 ? '审查改动（diff）' : '查看工作区 diff'}
              </button>
            ) : null}
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
