/**
 * 终端跳转注册表：右栏"痕迹"点击一句话 → 在当前会话的终端缓冲区里定位它。
 *
 * 为什么用注册表而不是 ref 穿透：终端是按 pty id 渲染在列表里的，
 * App 拿不到每个 TerminalPane 的 ref；这里用一个 id → api 的映射，卸载时注销。
 */

export interface TerminalJumpApi {
  /**
   * 在缓冲区里找这句话并滚动/高亮；找不到返回 false。
   * `fromEnd`：同一句话出现多次时，从末尾数第几次（0 = 最近一次）。
   */
  scrollToText: (text: string, fromEnd?: number) => boolean;
  /** 复位鼠标上报/备用屏幕等模式（滚轮被 TUI 残留模式吃掉时用）。 */
  resetModes: () => void;
}

const terminals = new Map<string, TerminalJumpApi>();

/** 注册某终端（返回注销函数）。 */
export function registerTerminalJump(id: string, api: TerminalJumpApi): () => void {
  terminals.set(id, api);
  return () => {
    if (terminals.get(id) === api) terminals.delete(id);
  };
}

/**
 * 在指定终端里跳到某段文本。
 * 返回 false 表示终端缓冲区里没有（比如已经被滚动出 buffer），调用方应退回详情。
 */
/** 复位某个终端的输入模式（滚轮失效的应急开关）。 */
export function resetTerminalModes(id: string | null | undefined): boolean {
  if (!id) return false;
  const api = terminals.get(id);
  if (!api) return false;
  try {
    api.resetModes();
    return true;
  } catch {
    return false;
  }
}

export function jumpTerminalToText(
  id: string | null | undefined,
  text: string,
  fromEnd = 0,
): boolean {
  if (!id) return false;
  const api = terminals.get(id);
  if (!api) return false;
  try {
    return api.scrollToText(text, fromEnd);
  } catch {
    return false;
  }
}
