import { useEffect, useMemo, useState } from 'react';
import {
  CircleCheck,
  CircleDashed,
  ClipboardCopy,
  FileCode2,
  GitBranch,
  ListChecks,
  Loader2,
  X,
} from 'lucide-react';
import type { SessionGitInfo, SessionInsights, SessionTodo } from '../../shared/types';
import { folderName } from '../session-utils';
import { buildInsightsMarkdown, formatClock, formatDuration, shortenPath } from '../insights-utils';
import { useEscape } from '../hooks/useEscape';
import { useToast } from '../toast';
import { EmptyState } from './EmptyState';
import { SkeletonStack } from './Skeleton';

interface SessionInsightsModalProps {
  sessionId: string;
  title: string;
  /** 工作目录（用于显示 git 分支/未提交数；缺省则不显示）。 */
  cwd?: string;
  /** 从右栏点某个文件进来时，直接定位到它。 */
  initialPath?: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<SessionTodo['status'], string> = {
  completed: '已完成',
  in_progress: '进行中',
  pending: '待办',
};

function statusIcon(status: SessionTodo['status']) {
  if (status === 'completed') return <CircleCheck size={13} className="insight-todo-done" />;
  if (status === 'in_progress') return <Loader2 size={13} className="spin insight-todo-active" />;
  return <CircleDashed size={13} className="insight-todo-pending" />;
}

/**
 * 计划与改动：从会话记录里提取的 TodoWrite 末次快照 + Edit/Write 改动清单。
 * 口径：内容来自**会话记录里的工具调用意图**，不等于工作区当前内容。
 */
export function SessionInsightsModal({
  sessionId,
  title,
  cwd,
  initialPath,
  onClose,
}: SessionInsightsModalProps) {
  useEscape(true, onClose);
  const toast = useToast();
  const [insights, setInsights] = useState<SessionInsights | null>(null);
  const [git, setGit] = useState<SessionGitInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInsights(null);
    setFailed(false);
    window.codeagentdesk
      .getSessionInsights(sessionId)
      .then((value) => {
        if (cancelled) return;
        setInsights(value);
        const wanted = initialPath
          ? value.changes.find((change) => change.path === initialPath)?.path
          : undefined;
        setSelectedPath(wanted ?? value.changes[0]?.path ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, initialPath]);

  // git 摘要（非仓库返回 null，整段不渲染）。
  useEffect(() => {
    if (!cwd) {
      setGit(null);
      return;
    }
    let cancelled = false;
    window.codeagentdesk
      .getSessionGit(cwd)
      .then((value) => {
        if (!cancelled) setGit(value);
      })
      .catch(() => {
        if (!cancelled) setGit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const plan = insights?.plan ?? null;
  const planDone = useMemo(
    () => (plan ? plan.todos.filter((todo) => todo.status === 'completed').length : 0),
    [plan],
  );
  const selected = insights?.changes.find((change) => change.path === selectedPath) ?? null;
  const planPercent = plan && plan.todos.length > 0 ? (planDone / plan.todos.length) * 100 : 0;

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel insights-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">
            <ListChecks size={14} /> 计划与改动
            <span className="insights-session">{title}</span>
          </span>
          <div className="day-actions">
            <button
              type="button"
              className="icon-button"
              title="复制改动摘要（Markdown）"
              disabled={!insights}
              onClick={() => {
                if (!insights) return;
                void navigator.clipboard
                  .writeText(buildInsightsMarkdown(title, insights))
                  .then(() => toast.success('已复制改动摘要'));
              }}
            >
              <ClipboardCopy size={14} />
            </button>
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="day-body insights-body">
          {failed ? (
            <EmptyState icon={<FileCode2 size={20} strokeWidth={1.6} />} title="读取失败" />
          ) : !insights ? (
            <SkeletonStack rows={4} />
          ) : !plan && insights.changes.length === 0 ? (
            <EmptyState
              icon={<ListChecks size={20} strokeWidth={1.6} />}
              title="这次会话没有计划与文件改动"
              hint="计划来自 TodoWrite，改动来自 Edit / Write 工具调用"
            />
          ) : (
            <>
              <div className="insights-scope">
                以下内容来自<strong>会话记录里的工具调用</strong>，是当时写入的片段，不代表工作区现在的样子。
                {insights.skipped > 0 ? `（${insights.skipped} 行记录无法解析，已跳过）` : ''}
              </div>

              <div className="insights-stats">
                <span>
                  <b>{insights.stats.turns}</b> 轮对话
                </span>
                <span>
                  <b>{insights.stats.toolCalls}</b> 次工具调用
                </span>
                <span className={insights.stats.errors > 0 ? 'danger' : ''}>
                  <b>{insights.stats.errors}</b> 次失败
                </span>
                <span>
                  活跃 <b>{formatDuration(insights.stats.activeMs)}</b>
                </span>
                <span>
                  {formatClock(insights.stats.startedAt)} 开始
                </span>
                {git ? (
                  <span className="insights-git" title={git.branch}>
                    <GitBranch size={11} />
                    {git.branch}
                    {git.dirty > 0 ? ` · ${git.dirty} 未提交` : ' · 干净'}
                  </span>
                ) : null}
              </div>

              {plan ? (
                <section className="insights-card plan">
                  <div className="insights-card-head">
                    <span className="insights-card-title">
                      计划 · {planDone}/{plan.todos.length} 完成
                    </span>
                    <span className="insights-card-meta">
                      {plan.updates > 1 ? `快照 ${plan.updates} 次` : '单次快照'}
                    </span>
                  </div>
                  <div className="insights-plan-bar">
                    <span style={{ width: `${planPercent}%` }} />
                  </div>
                  <ul className="insights-todos">
                    {plan.todos.map((todo, index) => (
                      <li key={`${index}-${todo.content}`} className={`insights-todo ${todo.status}`}>
                        {statusIcon(todo.status)}
                        <span className="insights-todo-text">{todo.content}</span>
                        <span className="insights-todo-status">{STATUS_LABEL[todo.status]}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {insights.changes.length > 0 ? (
                <section className="insights-card changes">
                  <div className="insights-card-head">
                    <span className="insights-card-title">
                      改动 · {insights.totals.files} 个文件
                    </span>
                    <span className="insights-card-meta">
                      {insights.totals.edits} 次编辑
                      <b className="insights-add">+{insights.totals.added}</b>
                      <b className="insights-del">-{insights.totals.removed}</b>
                    </span>
                  </div>
                  <div className="insights-split">
                    <ul className="insights-files">
                      {insights.changes.map((change) => (
                        <li key={change.path}>
                          <button
                            type="button"
                            className={`insights-file${
                              change.path === selectedPath ? ' active' : ''
                            }`}
                            title={change.path}
                            onClick={() => setSelectedPath(change.path)}
                          >
                            <span className="insights-file-name">{folderName(change.path)}</span>
                            <span className="insights-file-dir">{shortenPath(change.path)}</span>
                            <span className="insights-file-nums">
                              <i className="insights-add">+{change.added}</i>
                              <i className="insights-del">-{change.removed}</i>
                              <i className="insights-file-edits">×{change.edits}</i>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="insights-hunks">
                      {selected ? (
                        <>
                          <div className="insights-hunks-head" title={selected.path}>
                            {selected.path}
                            {selected.written ? <em>整文件写入</em> : null}
                            {selected.hiddenHunks > 0 ? (
                              <em>另有 {selected.hiddenHunks} 处未展示</em>
                            ) : null}
                          </div>
                          {selected.hunks.map((hunk, index) => (
                            <div key={index} className="insights-hunk">
                              <div className="insights-hunk-head">
                                #{index + 1} {hunk.kind === 'write' ? '写入' : '编辑'}
                                {hunk.truncated ? ' · 片段已截断' : ''}
                              </div>
                              {hunk.oldText ? (
                                <pre className="insights-code old">
                                  {hunk.oldText.split('\n').map((line, lineIndex) => (
                                    <span key={lineIndex} className="insights-line">
                                      {line}
                                    </span>
                                  ))}
                                </pre>
                              ) : null}
                              {hunk.newText ? (
                                <pre className="insights-code new">
                                  {hunk.newText.split('\n').map((line, lineIndex) => (
                                    <span key={lineIndex} className="insights-line">
                                      {line}
                                    </span>
                                  ))}
                                </pre>
                              ) : null}
                            </div>
                          ))}
                        </>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
