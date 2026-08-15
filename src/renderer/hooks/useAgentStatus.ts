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
 * 每个运行中会话的 agent 状态（按 pty id 跟踪）：
 * 输出数据流动 → 🧠 思考中；停止 2.5s → ✨ 回合完成（4s）→ 😴 空闲；
 * 最近输出含审批提示特征 → 🚨 有待处理审批。
 */
export function useSessionAgentStatuses() {
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const buffersRef = useRef<Record<string, string>>({});
  const timersRef = useRef<
    Record<string, { done?: ReturnType<typeof setTimeout>; idle?: ReturnType<typeof setTimeout> }>
  >({});

  useEffect(() => {
    const clearTimers = (id: string): void => {
      const timers = timersRef.current[id];
      if (!timers) return;
      if (timers.done) clearTimeout(timers.done);
      if (timers.idle) clearTimeout(timers.idle);
      delete timersRef.current[id];
    };

    const unsubscribeData = window.codeagentdesk.onSessionData((event) => {
      const { id, data } = event;
      buffersRef.current[id] = (buffersRef.current[id] ?? '') + data;
      buffersRef.current[id] = buffersRef.current[id].slice(-BUFFER_CHARS);
      clearTimers(id);
      const tail = buffersRef.current[id].slice(-TAIL_CHARS);
      if (APPROVAL_PATTERNS.some((pattern) => pattern.test(tail))) {
        setStatuses((previous) => ({ ...previous, [id]: 'approval' }));
        return;
      }
      setStatuses((previous) => ({ ...previous, [id]: 'thinking' }));
      timersRef.current[id] = {
        done: setTimeout(() => {
          setStatuses((previous) => ({ ...previous, [id]: 'done' }));
        }, IDLE_DELAY_MS),
        idle: setTimeout(() => {
          setStatuses((previous) => ({ ...previous, [id]: 'idle' }));
        }, IDLE_DELAY_MS + DONE_HOLD_MS),
      };
    });

    // 会话退出后清理其状态与定时器。
    const unsubscribeExited = window.codeagentdesk.onSessionExited(({ id }) => {
      clearTimers(id);
      delete buffersRef.current[id];
      setStatuses((previous) => {
        if (!(id in previous)) return previous;
        const next = { ...previous };
        delete next[id];
        return next;
      });
    });

    return () => {
      unsubscribeData();
      unsubscribeExited();
      for (const timers of Object.values(timersRef.current)) {
        if (timers.done) clearTimeout(timers.done);
        if (timers.idle) clearTimeout(timers.idle);
      }
      timersRef.current = {};
    };
  }, []);

  return statuses;
}
