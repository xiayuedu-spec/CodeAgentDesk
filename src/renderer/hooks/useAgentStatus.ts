import { useEffect, useRef, useState } from 'react';

export type AgentStatus = 'thinking' | 'done' | 'idle' | 'approval';

/** 活动量统计窗口：只看最近 3 秒收到的输出。 */
const ACTIVITY_WINDOW_MS = 3000;
/** 3 秒内收到 ≥ 该字节数才视为真实活动（过滤 TUI spinner/状态栏微重绘）。 */
const ACTIVITY_BYTES = 24;
/** 真实活动停止多久后离开"思考中"。 */
const QUIET_MS = 8000;
/** 一段活动持续 ≥ 该时长才视为"完整回合"，结束时展示 ✨。 */
const MIN_ROUND_MS = 20000;
/** ✨ 展示时长，随后回到空闲。 */
const DONE_HOLD_MS = 4000;
/** 只检测最近这段输出是否含审批提示，避免历史内容误报。 */
const TAIL_CHARS = 600;
/** 滚动缓冲上限。 */
const BUFFER_CHARS = 4096;
/** 终端 resize 引发的整屏重绘突发，在这段时间内完全忽略。 */
const RESIZE_IGNORE_MS = 1500;

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

interface SessionState {
  buffer: string;
  recent: { t: number; n: number }[];
  lastRealAt: number;
  burstStart: number;
  quietTimer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
}

/**
 * 每个运行中会话的 agent 状态（按 pty id 跟踪）。
 * 判定基于"真实活动量"而非任何数据：
 * - 3 秒窗口内输出 ≥ ACTIVITY_BYTES → 🧠 思考中（持续刷新）
 * - 停止 QUIET_MS 后：若该段活动 ≥ MIN_ROUND_MS → ✨ 回合完成（4s）→ 😴；否则直接 😴
 * - 安静期且最近输出含审批提示特征 → 🚨 待审批
 * - resize 引发的整屏重绘突发在 RESIZE_IGNORE_MS 内被忽略（避免"点进去就变思考中"）
 */
export function useSessionAgentStatuses() {
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const statesRef = useRef<Record<string, SessionState>>({});
  const ignoreUntilRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const clearTimers = (state: SessionState): void => {
      if (state.quietTimer) clearTimeout(state.quietTimer);
      if (state.idleTimer) clearTimeout(state.idleTimer);
      state.quietTimer = undefined;
      state.idleTimer = undefined;
    };

    // TerminalPane resize 后广播，用于忽略随之而来的 TUI 整屏重绘。
    const onResizeIgnore = (event: Event): void => {
      const id = (event as CustomEvent<string>).detail;
      if (id) ignoreUntilRef.current[id] = Date.now() + RESIZE_IGNORE_MS;
    };
    window.addEventListener('agent-status-ignore', onResizeIgnore);

    const handleData = (id: string, data: string): void => {
      // resize 重绘突发：完全忽略。
      if (Date.now() < (ignoreUntilRef.current[id] ?? 0)) return;

      const state = (statesRef.current[id] ??= {
        buffer: '',
        recent: [],
        lastRealAt: 0,
        burstStart: 0,
      });
      state.buffer = (state.buffer + data).slice(-BUFFER_CHARS);

      // 活动量检测：3 秒窗口内累计字节数。
      const now = Date.now();
      state.recent.push({ t: now, n: data.length });
      state.recent = state.recent.filter((item) => now - item.t <= ACTIVITY_WINDOW_MS);
      const bytes = state.recent.reduce((sum, item) => sum + item.n, 0);

      if (bytes >= ACTIVITY_BYTES) {
        // 真实活动：思考中。
        clearTimers(state);
        if (now - state.lastRealAt > QUIET_MS * 2) state.burstStart = now;
        state.lastRealAt = now;
        setStatuses((previous) => (previous[id] === 'thinking' ? previous : { ...previous, [id]: 'thinking' }));
        state.quietTimer = setTimeout(() => {
          const current = statesRef.current[id];
          if (!current) return;
          if (Date.now() - current.lastRealAt < QUIET_MS) return;
          if (Date.now() - current.burstStart >= MIN_ROUND_MS) {
            setStatuses((previous) => ({ ...previous, [id]: 'done' }));
            current.idleTimer = setTimeout(() => {
              setStatuses((previous) => ({ ...previous, [id]: 'idle' }));
            }, DONE_HOLD_MS);
          } else {
            setStatuses((previous) => ({ ...previous, [id]: 'idle' }));
          }
        }, QUIET_MS);
        return;
      }

      // 安静期：若输出尾部命中审批提示特征（Claude 正在等待确认），显示 🚨。
      if (APPROVAL_PATTERNS.some((pattern) => pattern.test(state.buffer.slice(-TAIL_CHARS)))) {
        clearTimers(state);
        setStatuses((previous) => ({ ...previous, [id]: 'approval' }));
      }
    };

    const unsubscribeData = window.codeagentdesk.onSessionData((event) => {
      handleData(event.id, event.data);
    });

    // 会话退出后清理其状态与定时器。
    const unsubscribeExited = window.codeagentdesk.onSessionExited(({ id }) => {
      const state = statesRef.current[id];
      if (state) clearTimers(state);
      delete statesRef.current[id];
      delete ignoreUntilRef.current[id];
      setStatuses((previous) => {
        if (!(id in previous)) return previous;
        const next = { ...previous };
        delete next[id];
        return next;
      });
    });

    return () => {
      window.removeEventListener('agent-status-ignore', onResizeIgnore);
      unsubscribeData();
      unsubscribeExited();
      for (const state of Object.values(statesRef.current)) clearTimers(state);
      statesRef.current = {};
    };
  }, []);

  return statuses;
}
