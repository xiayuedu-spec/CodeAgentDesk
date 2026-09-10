import type { MouseEvent as ReactMouseEvent } from 'react';
import { ListChecks } from 'lucide-react';
import type { SessionUsage } from '../../shared/types';
import { statusLabel, type SessionView } from '../session-utils';

interface InfoPanelProps {
  session: SessionView;
  usage: SessionUsage;
  /** Token 统计开关（关闭时不显示用量、也不轮询）。 */
  tokenStatsEnabled?: boolean;
  onResizeStart: (event: ReactMouseEvent) => void;
  /** 打开「计划与改动」（TodoWrite 末次快照 + Edit/Write 改动清单）。 */
  onOpenInsights?: () => void;
}

export function InfoPanel({
  session,
  usage,
  tokenStatsEnabled = false,
  onResizeStart,
  onOpenInsights,
}: InfoPanelProps) {
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
      {tokenStatsEnabled ? (
        <>
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
        </>
      ) : (
        <div className="info-item">
          <span>Token 统计</span>
          <strong className="truncate">已关闭（☰ 更多可开启）</strong>
        </div>
      )}
      {onOpenInsights ? (
        <button type="button" className="info-action" onClick={onOpenInsights}>
          <ListChecks size={13} />
          计划与改动
        </button>
      ) : null}
    </section>
  );
}
