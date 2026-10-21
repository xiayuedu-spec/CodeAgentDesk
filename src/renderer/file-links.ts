/**
 * 从一行终端文本里识别"文件路径(:行号)"，用于把 `file:line` 变成可点击链接。
 *
 * 纯函数，便于单测：只负责"认得出来"，不负责打开（打开走 IPC）。
 */

/** 常见源码/配置扩展名，避免把 `1.5`、`v1.2.3` 误当路径。 */
const EXTENSIONS = [
  // 长的放前面：json 必须先于 js、tsx 先于 ts，否则 `package.json` 会被切成 `package.js`
  'tsx', 'jsx', 'mjs', 'cjs', 'jsonc', 'json', 'mdx', 'scss', 'svelte', 'toml', 'yaml',
  'ts', 'js', 'md', 'css', 'less', 'html', 'vue',
  'py', 'go', 'rs', 'java', 'kts', 'kt', 'cs', 'php', 'rb', 'swift',
  'c', 'h', 'cc', 'cpp', 'hpp',
  'yml', 'ini', 'env', 'sh', 'bash', 'ps1', 'sql', 'log', 'm',
];

const PATTERN = new RegExp(
  // 前面是行首或空白，避免匹配 URL 中间的部分
  `(?:^|[\\s("'\`\\[])((?:[A-Za-z]:[\\\\/])?(?:[\\w.@+~-]+[\\\\/])*[\\w.@+~-]+\\.(?:${EXTENSIONS.join('|')}))(?::(\\d+))?`,
  'g',
);

export interface TerminalLink {
  /** 展示用文本（含 :line）。 */
  text: string;
  /** 路径部分。 */
  path: string;
  line?: number;
  /** 在该行文本里的起始列（0-based）。 */
  start: number;
  /** 结束列（0-based，不含）。 */
  end: number;
}

/** 扫描一行文本里的所有"文件路径(:行号)"。 */
export function findFileLinks(text: string): TerminalLink[] {
  const links: TerminalLink[] = [];
  PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATTERN.exec(text)) !== null) {
    const path = match[1];
    const line = match[2] ? Number(match[2]) : undefined;
    // 计算列：match[0] 可能带一个前缀字符（空白/括号），需要定位到路径起点。
    const absoluteStart = match.index + (match[0].length - (match[2] ? match[2].length + 1 : 0) - path.length);
    links.push({
      text: match[2] ? `${path}:${match[2]}` : path,
      path,
      line,
      start: absoluteStart,
      end: absoluteStart + path.length + (match[2] ? match[2].length + 1 : 0),
    });
  }
  return links;
}
