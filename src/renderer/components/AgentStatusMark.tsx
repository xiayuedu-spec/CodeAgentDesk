import { AlertTriangle, Check, Loader2, Moon, type LucideIcon } from 'lucide-react';
import type { AgentStatusStyle } from '../../shared/types';
import { AGENT_STATUS_META, type AgentStatus } from '../hooks/useAgentStatus';

/** agent 状态对应的单色图标（克制派：不用 emoji，靠形状 + accent 表达）。 */
export const AGENT_STATUS_ICON: Record<AgentStatus, LucideIcon> = {
  thinking: Loader2,
  done: Check,
  idle: Moon,
  approval: AlertTriangle,
};

/**
 * agent 状态标记：按用户偏好渲染为表情或单色图标。
 * `dot` 模式由调用方自行渲染（圆点表达的是会话进程状态，不是 agent 状态）。
 */
export function AgentStatusMark({
  status,
  style,
  className,
}: {
  status: AgentStatus;
  style: AgentStatusStyle;
  className: string;
}) {
  const meta = AGENT_STATUS_META[status];
  if (style === 'icon') {
    const Icon = AGENT_STATUS_ICON[status];
    return (
      <span className={`${className} mark-icon ${status}`} title={meta.label} aria-label={meta.label}>
        <Icon size={13} className={status === 'thinking' ? 'spin' : undefined} />
      </span>
    );
  }
  return (
    <span className={className} title={meta.label} aria-label={meta.label}>
      {meta.emoji}
    </span>
  );
}
