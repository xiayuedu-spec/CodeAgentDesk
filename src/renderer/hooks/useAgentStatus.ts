import { useEffect, useRef, useState } from 'react';

export type AgentStatus = 'thinking' | 'done' | 'idle' | 'approval';

/** 输出停止多久后视为"回合刚完成"。 */
const IDLE_DELAY_MS = 2500;
/** "回合刚完成"（✨）展示时长，随后回到空闲。 */
const DONE_HOLD_MS = 4000;
/** 只检测最近这段输出是否含审批提示，避免历史内容误报。 */
const TAIL_CHARS = 600;
/** 滚动缓冲上限。 */
const BUFFER_CHARS = 4096;

/** Claude Code 权限请求横幅/交互提示的特征（中英）。 */
const APPROVAL_PATTERNS = [
  /do you want to proceed\?/i,
  /allow\s*\?/i,
  /proceed\s*\?/i,
  /y\/n/i,
  /允许/i,
  /是否继续/i,
  /批准/i,
];

export const AGENT_STATUS_META: Record<AgentStatus, { emoji: string; label: string }> = {
  thinking: { emoji: '🧠', label: '思考中' },
  done: { emoji: '✨', label: '回合刚完成' },
  idle: { emoji: '😴', label: '空闲' },
  approval: { emoji: '🚨', label: '有待处理审批' },
};

/**
 * 当前活动会话的 agent 状态：
 * 输出数据流动 → 🧠 思考中；停止 2.5s → ✨ 回合完成（4s）→ 😴 空闲；
 * 最近输出含审批提示特征 → 🚨 有待处理审批。
 */
export function useAgentStatus(activeId: string | null) {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const bufferRef = useRef('');
  const timersRef = useRef<{ done?: ReturnType<typeof setTimeout>; idle?: ReturnType<typeof setTimeout> }>({});

  // 切换会话时重置状态与缓冲。
  useEffect(() => {
    bufferRef.current = '';
    const { done, idle } = timersRef.current;
    if (done) clearTimeout(done);
    if (idle) clearTimeout(idle);
    timersRef.current = {};
    setStatus('idle');
  }, [activeId]);

  useEffect(() => {
    return window.codeagentdesk.onSessionData((event) => {
      if (event.id !== activeIdRef.current) return;
      bufferRef.current = (bufferRef.current + event.data).slice(-BUFFER_CHARS);
      const { done, idle } = timersRef.current;
      if (done) clearTimeout(done);
      if (idle) clearTimeout(idle);
      const tail = bufferRef.current.slice(-TAIL_CHARS);
      if (APPROVAL_PATTERNS.some((pattern) => pattern.test(tail))) {
        setStatus('approval');
        return;
      }
      setStatus('thinking');
      timersRef.current.done = setTimeout(() => setStatus('done'), IDLE_DELAY_MS);
      timersRef.current.idle = setTimeout(() => setStatus('idle'), IDLE_DELAY_MS + DONE_HOLD_MS);
    });
  }, []);

  const meta = AGENT_STATUS_META[status];
  return { agentStatus: status, agentEmoji: meta.emoji, agentStatusLabel: meta.label };
}
