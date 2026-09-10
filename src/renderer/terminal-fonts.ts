/**
 * 终端字号/字体默认值与预设（与设置面板、终端共用）。
 * 单独成模块：让设置面板不必为了取常量而把整个 xterm 组件拉进主 chunk。
 */
export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const DEFAULT_TERMINAL_FONT_FAMILY = '"Cascadia Mono", Consolas, monospace';
export const TERMINAL_FONT_PRESETS = [
  { label: 'Cascadia Mono', value: '"Cascadia Mono", Consolas, monospace' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", "Cascadia Mono", monospace' },
  { label: 'Consolas', value: 'Consolas, "Courier New", monospace' },
  { label: '等宽通用', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
];
