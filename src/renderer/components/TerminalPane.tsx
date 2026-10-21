import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { findFileLinks } from '../file-links';
import { findInBufferLines, needleCandidates } from '../buffer-search';
import type { RegisterTerminalApi, TerminalJumpApi } from '../terminal-jump';
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
} from '../terminal-fonts';

interface TerminalPaneProps {
  id: string;
  /** 把终端 API 交给上层登记（上层持有注册表，见 terminal-jump.ts 注释）。 */
  onRegisterApi?: RegisterTerminalApi;
  /** 工作目录：用于把终端里的相对路径解析成可打开的文件。 */
  cwd?: string;
  active: boolean;
  /** 终端字号（px）与字体族，来自设置（支持 Ctrl +/- 即时缩放）。 */
  fontSize?: number;
  fontFamily?: string;
}

interface TerminalMenuState {
  x: number;
  y: number;
}

interface TerminalPalette {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
}

const TERMINAL_THEMES: Record<string, TerminalPalette> = {
  default: { background: '#0a0c0f', foreground: '#dfe3e8', cursor: '#2fbfae', selectionBackground: '#2f8579' },
  mac: { background: '#fbfbfd', foreground: '#1d1d1f', cursor: '#0a84ff', selectionBackground: '#b8d4ff' },
  green: { background: '#d5f1d9', foreground: '#2f4a35', cursor: '#2e8b57', selectionBackground: '#a5d8b0' },
  sepia: { background: '#f7f0e2', foreground: '#3d3528', cursor: '#a67c1f', selectionBackground: '#e0d3b3' },
  amber: { background: '#1a150d', foreground: '#d8c393', cursor: '#e0a64e', selectionBackground: '#3d3220' },
  mist: { background: '#15181c', foreground: '#b4bcc3', cursor: '#58a0a8', selectionBackground: '#2a3438' },
  warm: { background: '#faf9f5', foreground: '#3d3d3a', cursor: '#cc785c', selectionBackground: '#f0d9cd' },
  claude: { background: '#faf9f5', foreground: '#3d3d3a', cursor: '#d97757', selectionBackground: '#efd9cf' },
  neon: { background: '#0a0614', foreground: '#e6e1ff', cursor: '#00e5ff', selectionBackground: '#123a4d' },
  term: { background: '#0b0b0b', foreground: '#e8e8e8', cursor: '#30d158', selectionBackground: '#1f3a26' },
};

function terminalTheme(skin: string): TerminalPalette {
  return TERMINAL_THEMES[skin] ?? TERMINAL_THEMES.default;
}

/** 终端字号/字体默认值与可选预设见 `renderer/terminal-fonts.ts`（单独模块，避免主 chunk 拉进 xterm）。 */

/**
 * 会话结束时显式复位终端模式。
 *
 * 为什么要手动发：TUI（Claude Code）可能开启鼠标上报（SGR 1000/1002/1003/1006）
 * 或切到备用屏幕；如果它异常退出没来得及关，这些模式会留在终端里——
 * 表现就是**滚轮不再滚动，被当成鼠标事件上报给已经结束的进程**。
 * 这几条序列只复位模式，不清屏（内容还要留着看）。
 */
const TERMINAL_MODE_RESET =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l' +
  '\x1b[?1049l\x1b[?25h';

export function TerminalPane({
  id,
  cwd,
  onRegisterApi,
  active,
  fontSize = DEFAULT_TERMINAL_FONT_SIZE,
  fontFamily = DEFAULT_TERMINAL_FONT_FAMILY,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const fontSizeRef = useRef(fontSize);
  const fontFamilyRef = useRef(fontFamily);
  const [hasSelection, setHasSelection] = useState(false);
  const [menu, setMenu] = useState<TerminalMenuState | null>(null);
  const [skin, setSkin] = useState(() => document.documentElement.dataset.theme ?? 'default');
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 选中文本自动复制并闪现"已复制"提示。
  const flashCopied = (): void => {
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };
  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const applySkin = () => setSkin(document.documentElement.dataset.theme ?? 'default');
    const observer = new MutationObserver(applySkin);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    applySkin();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = terminalTheme(skin);
    terminal.refresh(0, terminal.rows - 1);
  }, [skin]);

  // 字号/字体变化（设置面板或 Ctrl +/- 缩放）即时生效并重新适配尺寸。
  useEffect(() => {
    fontSizeRef.current = fontSize;
    fontFamilyRef.current = fontFamily;
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal) return;
    terminal.options.fontSize = fontSize;
    terminal.options.fontFamily = fontFamily;
    if (fit && activeRef.current) {
      try {
        fit.fit();
        terminal.refresh(0, terminal.rows - 1);
      } catch {
        // 终端尚未布局完成时忽略。
      }
    }
  }, [fontSize, fontFamily]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: true,
      scrollback: 10000,
      fontFamily: fontFamilyRef.current,
      fontSize: fontSizeRef.current,
      theme: terminalTheme(skin),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const fitTerminal = () => {
      if (!activeRef.current || container.clientWidth === 0 || container.clientHeight === 0) {
        return;
      }
      fit.fit();
      terminal.refresh(0, terminal.rows - 1);
    };
    let frame = 0;
    const scheduleFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitTerminal);
    };
    scheduleFit();

    // 注册"跳到某句话"能力：右栏痕迹点击时优先在终端缓冲区里定位。
    const jumpApi: TerminalJumpApi = {
      resetModes: () => terminal.write(TERMINAL_MODE_RESET),
      scrollToText: (text, fromEnd = 0) => {
        const buffer = terminal.buffer.active;
        const lines: string[] = [];
        for (let row = 0; row < buffer.length; row += 1) {
          lines.push(buffer.getLine(row)?.translateToString(true) ?? '');
        }
        // 针由长到短（长句折行时短针更容易命中），纯函数见 buffer-search.ts
        for (const needle of needleCandidates(text)) {
          const match = findInBufferLines(lines, needle, fromEnd);
          if (!match) continue;
          terminal.scrollToLine(Math.max(0, match.row - 2));
          if (match.column >= 0) {
            try {
              terminal.select(match.column, match.row, needle.length);
              window.setTimeout(() => {
                try {
                  terminal.clearSelection();
                } catch {
                  // 终端可能已被销毁
                }
              }, 2200);
            } catch {
              // 选中失败不影响滚动
            }
          }
          return true;
        }
        return false;
      },
    };
    onRegisterApi?.(id, jumpApi);

    // 终端里的 file:line 变成可点击链接（xterm 内置 link provider，无需 addon）。
    const linkDisposable = terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) {
          callback(undefined);
          return;
        }
        const text = line.translateToString(true);
        const links = findFileLinks(text);
        if (links.length === 0) {
          callback(undefined);
          return;
        }
        callback(
          links.map((link) => ({
            range: {
              start: { x: link.start + 1, y: bufferLineNumber },
              end: { x: link.end, y: bufferLineNumber },
            },
            text: link.text,
            decorations: { pointerCursor: true, underline: true },
            activate: () => {
              void window.codeagentdesk.openFile(link.path, link.line, cwdRef.current);
            },
          })),
        );
      },
    });

    const dataDisposable = terminal.onData((data) => {
      void window.codeagentdesk.writeSession(id, data);
    });
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void window.codeagentdesk.resizeSession(id, cols, rows);
      // resize 会触发 Claude TUI 整屏重绘，通知状态机忽略随后的输出突发。
      window.dispatchEvent(new CustomEvent<string>('agent-status-ignore', { detail: id }));
    });
    const selectionDisposable = terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      setHasSelection(selection.length > 0);
      // 选中即自动复制（xterm 常规习惯）。
      if (selection.length > 0) {
        void navigator.clipboard.writeText(selection).then(flashCopied).catch(() => {
          // 剪贴板不可用时静默忽略。
        });
      }
    });
    const unsubscribeData = window.codeagentdesk.onSessionData((event) => {
      if (event.id === id) terminal.write(event.data);
    });
    const unsubscribeExit = window.codeagentdesk.onSessionExited((event) => {
      if (event.id !== id) return;
      terminal.write(`${TERMINAL_MODE_RESET}\r\n\x1b[90m[会话已结束]\x1b[0m\r\n`);
    });

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);

    return () => {
      linkDisposable.dispose();
      onRegisterApi?.(id, null);
      cancelAnimationFrame(frame);
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      selectionDisposable.dispose();
      unsubscribeData();
      unsubscribeExit();
      terminalRef.current = null;
      fitRef.current = null;
      terminal.dispose();
    };
  }, [id]);

  useEffect(() => {
    activeRef.current = active;
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      const terminal = terminalRef.current;
      const fit = fitRef.current;
      if (!container || !terminal || !fit) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      fit.fit();
      terminal.focus();
      terminal.refresh(0, terminal.rows - 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      const terminal = terminalRef.current;
      if (!terminal) return;
      if (event.key.toLowerCase() === 'c') {
        const selection = terminal.getSelection();
        if (selection) {
          event.preventDefault();
          void navigator.clipboard.writeText(selection);
        }
      } else if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        void navigator.clipboard.readText().then((text) => {
          if (text) terminal.paste(text);
        });
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const terminal = terminalRef.current;
      setHasSelection(terminal ? terminal.getSelection().length > 0 : false);
      setMenu({ x: event.clientX, y: event.clientY });
    };

    container.addEventListener('keydown', onKeyDown);
    container.addEventListener('contextmenu', onContextMenu);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('contextmenu', onContextMenu);
    };
  }, [id]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  async function copySelection(): Promise<void> {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const selection = terminal.getSelection();
    if (selection) await navigator.clipboard.writeText(selection);
    setMenu(null);
  }

  async function pasteClipboard(): Promise<void> {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const text = await navigator.clipboard.readText();
    if (text) terminal.paste(text);
    setMenu(null);
  }

  return (
    <>
      <div className="terminal-pane">
        <div className="terminal-host" ref={containerRef} />
        {copied ? <span className="terminal-copied floating">已复制</span> : null}
      </div>
      {menu ? (
        <div
          className="terminal-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!hasSelection}
            onClick={() => void copySelection()}
          >
            复制
          </button>
          <button type="button" role="menuitem" onClick={() => void pasteClipboard()}>
            粘贴
          </button>
        </div>
      ) : null}
    </>
  );
}
