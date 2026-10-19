import { useCallback, useEffect, useState } from 'react';
import { FileCode2, GitBranch, RefreshCw, X } from 'lucide-react';
import type { DiffFile, DiffFileStatus, WorktreeDiff } from '../../shared/types';
import { useEscape } from '../hooks/useEscape';
import { EmptyState } from './EmptyState';
import { SkeletonStack } from './Skeleton';

interface GitDiffModalProps {
  cwd: string;
  title?: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<DiffFileStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
};

/** 文件列表里最多显示几个（超出提示去缩小范围）。 */
const FILES_PREVIEW = 200;

function fileName(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

/**
 * 工作区改动审查：`git diff HEAD` + 未跟踪文件，逐 hunk 展示。
 * 与「计划与改动」的区别：那是会话记录里的**意图**，这里是磁盘上**实际**变了什么。
 */
export function GitDiffModal({ cwd, title, onClose }: GitDiffModalProps) {
  useEscape(true, onClose);
  const [diff, setDiff] = useState<WorktreeDiff | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    window.codeagentdesk
      .getWorktreeDiff(cwd)
      .then((value) => {
        if (cancelled) return;
        setDiff(value);
        setFailed(false);
        setSelected((current) =>
          current && value.files.some((file) => file.path === current)
            ? current
            : (value.files[0]?.path ?? null),
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => load(), [load]);

  const files = diff?.files.slice(0, FILES_PREVIEW) ?? [];
  const current: DiffFile | null = files.find((file) => file.path === selected) ?? null;

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel diff-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">
            <GitBranch size={14} /> 工作区改动
            {diff?.branch ? <span className="diff-branch">{diff.branch}</span> : null}
            {title ? <span className="diff-session">{title}</span> : null}
          </span>
          <div className="day-actions">
            {diff && diff.totals.files > 0 ? (
              <span className="diff-totals">
                {diff.totals.files} 文件
                <b className="rail-add">+{diff.totals.added}</b>
                <b className="rail-del">-{diff.totals.removed}</b>
              </span>
            ) : null}
            <button
              type="button"
              className="icon-button"
              title="重新读取"
              aria-label="重新读取工作区改动"
              disabled={loading}
              onClick={() => load()}
            >
              <RefreshCw size={14} className={loading ? 'spin' : undefined} />
            </button>
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="day-body diff-body">
          {failed ? (
            <EmptyState
              icon={<FileCode2 size={20} strokeWidth={1.6} />}
              title="读取失败"
              hint="工作目录可能不是 git 仓库，或 git 不可用"
            />
          ) : !diff ? (
            <SkeletonStack rows={5} />
          ) : diff.totals.files === 0 ? (
            <EmptyState
              icon={<FileCode2 size={20} strokeWidth={1.6} />}
              title="工作区干净"
              hint="没有未提交的改动（对比最后一次提交）"
            />
          ) : (
            <div className="diff-split">
              <ul className="diff-files">
                {files.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      className={`diff-file${file.path === selected ? ' active' : ''}`}
                      title={file.path}
                      onClick={() => setSelected(file.path)}
                    >
                      <span className={`diff-status ${file.status}`}>
                        {STATUS_LABEL[file.status]}
                      </span>
                      <span className="diff-file-name">{fileName(file.path)}</span>
                      <span className="diff-file-nums">
                        <i className="rail-add">+{file.added}</i>
                        <i className="rail-del">-{file.removed}</i>
                      </span>
                    </button>
                  </li>
                ))}
                {diff.totals.files > files.length ? (
                  <li className="diff-more">另有 {diff.totals.files - files.length} 个文件未列出</li>
                ) : null}
              </ul>

              <div className="diff-hunks">
                {current ? (
                  <>
                    <div className="diff-path" title={current.path}>
                      {current.path}
                    </div>
                    {current.binary ? (
                      <div className="diff-note">二进制文件，不展示内容</div>
                    ) : null}
                    {current.truncated && !current.binary ? (
                      <div className="diff-note">
                        内容过长，已截断（仍按完整行数统计 +{current.added} -{current.removed}）
                      </div>
                    ) : null}
                    {current.hunks.map((hunk, hunkIndex) => (
                      <div key={hunkIndex} className="diff-hunk">
                        <div className="diff-hunk-head">{hunk.header}</div>
                        <pre className="diff-code">
                          {hunk.lines.map((line, lineIndex) => (
                            <span key={lineIndex} className={`diff-line ${line.kind}`}>
                              <span className="diff-gutter">
                                {line.kind === 'del' ? (line.oldLine ?? '') : (line.newLine ?? '')}
                              </span>
                              <span className="diff-sign">
                                {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
                              </span>
                              <span className="diff-text">{line.text}</span>
                            </span>
                          ))}
                        </pre>
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
