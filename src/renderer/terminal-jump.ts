/**
 * 终端跳转的类型定义与纯工具。
 *
 * ⚠️ 这里**不能放模块级可变状态**：`TerminalPane` 是 lazy chunk，
 * 与主 chunk 共享一个模块会被分别打包（实测 dist 里 scrollToText 出现在
 * 两个 chunk 中），于是注册表和查找表是两个不同的 Map，永远查不到。
 * 状态的持有者是 App（`useRef<Map>`），通过 props 下发注册回调。
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

/** 终端注册回调：api 为 null 表示注销。 */
export type RegisterTerminalApi = (id: string, api: TerminalJumpApi | null) => void;
