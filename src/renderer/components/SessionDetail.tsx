import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, ListChecks, MessageSquare, Sparkles, X } from 'lucide-react';
import type { SessionDetailResult } from '../../shared/types';
import { useEscape } from '../hooks/useEscape';
import { EmptyState } from './EmptyState';

/** 首屏渲染条目数：长会话（上限 2000 条）不再一次性铺满 DOM。 */
const PAGE_SIZE = 200;

interface SessionDetailProps {
  detail: SessionDetailResult;
  summary?: { summary: string; tags: string[] } | null;
  summarizing?: boolean;
  highlightQuery?: string;
  onSummarize?: () => void;
  onOpenInsights?: () => void;
  onExport: () => void;
  onClose: () => void;
}

export function SessionDetail({
  detail,
  summary,
  summarizing,
  highlightQuery,
  onSummarize,
  onOpenInsights,
  onExport,
  onClose,
}: SessionDetailProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEscape(true, onClose);

  const entries = detail.entries;
  // 换会话时回到首屏条数。
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [detail.sessionId]);

  // 搜索命中下标在**数据**上找（不是 DOM）：命中在窗口之外时先扩容再滚动。
  const highlightIndex = useMemo(() => {
    const query = (highlightQuery ?? '').trim().toLowerCase();
    if (!query) return -1;
    return entries.findIndex(
      (entry) => entry.role !== 'tool' && (entry.text ?? '').toLowerCase().includes(query),
    );
  }, [entries, highlightQuery]);

  useEffect(() => {
    if (highlightIndex < 0) return;
    setVisible((current) => Math.max(current, Math.min(entries.length, highlightIndex + 1)));
  }, [highlightIndex, entries.length]);

  useEffect(() => {
    if (highlightIndex < 0) return;
    const target = bodyRef.current?.querySelector<HTMLElement>(
      `[data-entry-index="${highlightIndex}"]`,
    );
    if (!target) return;
    target.classList.add('highlight');
    target.scrollIntoView({ block: 'center' });
  }, [highlightIndex, visible]);

  const shown = entries.slice(0, visible);
  const remaining = entries.length - shown.length;

  const toolPreview = (value: string): string => {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    return singleLine.length > 80 ? `${singleLine.slice(0, 80)}…` : singleLine;
  };

  return (
    <div className="session-detail">
      <header className="detail-header">
        <div className="detail-info">
          <div className="detail-title">{detail.title ?? '会话详情'}</div>
          <div className="detail-meta">
            <span>{detail.cwd || '未知目录'}</span>
            <span>{detail.sessionId}</span>
            <span>
              {entries.length} 条记录
              {remaining > 0 ? `（已显示前 ${shown.length} 条）` : ''}
            </span>
          </div>
        </div>
        <div className="detail-actions">
          <button
            type="button"
            className="icon-button"
            title="计划与改动"
            onClick={onOpenInsights}
          >
            <ListChecks size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="生成 AI 摘要与标签"
            disabled={summarizing}
            onClick={onSummarize}
          >
            <Sparkles size={16} />
          </button>
          <button type="button" className="icon-button" title="导出 Markdown" onClick={onExport}>
            <Download size={16} />
          </button>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="detail-body" ref={bodyRef}>
        {summarizing ? (
          <div className="summary-card summary-loading">正在生成摘要…（调用 claude 无头模式）</div>
        ) : null}
        {!summarizing && summary?.summary ? (
          <div className="summary-card">
            <div className="summary-text">{summary.summary}</div>
            {summary.tags.length ? (
              <div className="summary-tags">
                {summary.tags.map((tag) => (
                  <span key={tag} className="summary-tag">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {entries.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={36} strokeWidth={1.4} />}
            title="暂无内容"
            hint="这个会话还没有可展示的对话记录"
          />
        ) : (
          <>
            {shown.map((entry, index) =>
              entry.role === 'tool' ? (
                <details key={index} className="tool-card" data-entry-index={index}>
                  <summary>
                    <span className="tool-name">{entry.toolName ?? '工具调用'}</span>
                    {entry.toolOutput ? (
                      <span className="tool-preview">{toolPreview(entry.toolOutput)}</span>
                    ) : null}
                  </summary>
                  {entry.toolOutput ? <pre className="tool-output">{entry.toolOutput}</pre> : null}
                </details>
              ) : (
                <div
                  key={index}
                  className={`chat-entry ${entry.role}`}
                  data-entry-index={index}
                >
                  <div className="chat-role">{entry.role === 'user' ? 'User' : 'Claude'}</div>
                  <pre className="chat-text">{entry.text}</pre>
                </div>
              ),
            )}
            {remaining > 0 ? (
              <button
                type="button"
                className="detail-more"
                onClick={() => setVisible((current) => current + PAGE_SIZE)}
              >
                显示更多（还有 {remaining} 条）
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
