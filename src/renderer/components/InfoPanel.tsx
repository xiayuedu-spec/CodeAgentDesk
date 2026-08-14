import type { MouseEvent as ReactMouseEvent } from 'react';
import type { SessionUsage } from '../../shared/types';
import { statusLabel, type SessionView } from '../session-utils';

interface InfoPanelProps {
  session: SessionView;
  usage: SessionUsage;
  error: string | null;
  onResizeStart: (event: ReactMouseEvent) => void;
}

export function InfoPanel({ session, usage, error, onResizeStart }: InfoPanelProps) {
  return (
    <section className="info-panel" aria-label="会话状态">
      <div className="info-resizer" onMouseDown={onResizeStart} title="拖动调整宽度" />
      <div className="info-item">
        <span>状态</span>
        <strong className={`status-text ${session.status}`}>{statusLabel(session.status)}</strong>
      </div>
      <div className="info-item">
        <span>会话 ID</span>
        <strong className="truncate">{session.sessionId ?? '绑定中…'}</strong>
      </div>
      <div className="info-item">
        <span>工作目录</span>
        <strong className="truncate">{session.cwd}</strong>
      </div>
      <div className="info-item">
        <span>请求数</span>
        <strong className="usage-badge">{usage.requests}</strong>
      </div>
      <div className="info-item">
        <span>Token 用量</span>
        <div className="usage-bar" title="输入 / 输出 / 缓存读">
          <span className="usage-seg in" style={{ flexGrow: usage.inputTokens }} />
          <span className="usage-seg out" style={{ flexGrow: usage.outputTokens }} />
          <span className="usage-seg cache" style={{ flexGrow: usage.cacheReadTokens }} />
        </div>
        <div className="usage-legend">
          <span>
            <i className="usage-dot in" />
            输入 {usage.inputTokens.toLocaleString()}
          </span>
          <span>
            <i className="usage-dot out" />
            输出 {usage.outputTokens.toLocaleString()}
          </span>
          <span>
            <i className="usage-dot cache" />
            缓存读 {usage.cacheReadTokens.toLocaleString()} / 写{' '}
            {usage.cacheCreationTokens.toLocaleString()}
          </span>
        </div>
      </div>
      {error ? (
        <div className="info-item">
          <span>错误</span>
          <strong className="error-text truncate">{error}</strong>
        </div>
      ) : null}
    </section>
  );
}
