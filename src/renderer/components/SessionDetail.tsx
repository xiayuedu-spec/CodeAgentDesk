import { Download, X } from 'lucide-react';
import type { SessionDetailResult } from '../../shared/types';

interface SessionDetailProps {
  detail: SessionDetailResult;
  onExport: () => void;
  onClose: () => void;
}

export function SessionDetail({
  detail,
  onExport,
  onClose,
}: SessionDetailProps) {
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
          <button type="button" className="icon-button" title="导出 Markdown" onClick={onExport}>
            <Download size={16} />
          </button>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="detail-body">
        {detail.entries.length === 0 ? (
          <div className="archive-empty">暂无内容</div>
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
