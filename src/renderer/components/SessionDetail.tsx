import { useEffect, useRef } from 'react';
import { Download, MessageSquare, Sparkles, X } from 'lucide-react';
import type { SessionDetailResult } from '../../shared/types';
import { useEscape } from '../hooks/useEscape';
import { EmptyState } from './EmptyState';

interface SessionDetailProps {
  detail: SessionDetailResult;
  summary?: { summary: string; tags: string[] } | null;
  summarizing?: boolean;
  highlightQuery?: string;
  onSummarize?: () => void;
  onExport: () => void;
  onClose: () => void;
}

export function SessionDetail({
  detail,
  summary,
  summarizing,
  highlightQuery,
  onSummarize,
  onExport,
  onClose,
}: SessionDetailProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEscape(true, onClose);

  // 从搜索结果跳转：定位并高亮包含命中文本的首个会话条目。
  useEffect(() => {
    const query = (highlightQuery ?? '').trim().toLowerCase();
    const container = bodyRef.current;
    if (!query || !container) return;
    const entries = container.querySelectorAll<HTMLElement>('.chat-entry');
    let target: HTMLElement | null = null;
    for (const entry of entries) {
      if ((entry.textContent ?? '').toLowerCase().includes(query)) {
        target = entry;
        break;
      }
    }
    if (!target) return;
    target.classList.add('highlight');
    target.scrollIntoView({ block: 'center' });
  }, [highlightQuery, detail.sessionId]);

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
          </div>
        </div>
        <div className="detail-actions">
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
        {detail.entries.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={36} strokeWidth={1.4} />}
            title="暂无内容"
            hint="这个会话还没有可展示的对话记录"
          />
        ) : (
          detail.entries.map((entry, index) =>
            entry.role === 'tool' ? (
              <details key={index} className="tool-card">
                <summary>
                  <span className="tool-name">{entry.toolName ?? '工具调用'}</span>
                  {entry.toolOutput ? (
                    <span className="tool-preview">{toolPreview(entry.toolOutput)}</span>
                  ) : null}
                </summary>
                {entry.toolOutput ? <pre className="tool-output">{entry.toolOutput}</pre> : null}
              </details>
            ) : (
              <div key={index} className={`chat-entry ${entry.role}`}>
                <div className="chat-role">{entry.role === 'user' ? 'User' : 'Claude'}</div>
                <pre className="chat-text">{entry.text}</pre>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
