import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { BookOpen, Copy } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  id: string;
  title: string;
  status?: 'starting' | 'running' | 'ended';
  active: boolean;
  onDetail?: () => void;
  onCopy?: () => void;
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
};

function terminalTheme(skin: string): TerminalPalette {
  return TERMINAL_THEMES[skin] ?? TERMINAL_THEMES.default;
}

export function TerminalPane({
  id,
  title,
  status = 'ended',
  active,
  onDetail,
  onCopy,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const [hasSelection, setHasSelection] = useState(false);
  const [menu, setMenu] = useState<TerminalMenuState | null>(null);
  const [skin, setSkin] = useState(() => document.documentElement.dataset.theme ?? 'default');

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: true,
      scrollback: 10000,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: 13,
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

    const dataDisposable = terminal.onData((data) => {
      void window.codeagentdesk.writeSession(id, data);
    });
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void window.codeagentdesk.resizeSession(id, cols, rows);
      // resize 会触发 Claude TUI 整屏重绘，通知状态机忽略随后的输出突发。
      window.dispatchEvent(new CustomEvent<string>('agent-status-ignore', { detail: id }));
    });
    const selectionDisposable = terminal.onSelectionChange(() => {
      setHasSelection(terminal.getSelection().length > 0);
    });
    const unsubscribeData = window.codeagentdesk.onSessionData((event) => {
      if (event.id === id) terminal.write(event.data);
    });
    const unsubscribeExit = window.codeagentdesk.onSessionExited((event) => {
      if (event.id === id) terminal.write('\r\n\x1b[90m[会话已结束]\x1b[0m\r\n');
    });

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);

    return () => {
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
        <div className="terminal-chrome">
          <span
            className={`terminal-status ${status}`}
            title={status === 'running' ? '运行中' : status === 'starting' ? '启动中' : '已结束'}
          />
          <span className="terminal-title">{title}</span>
          <div className="terminal-chrome-actions">
            <button
              type="button"
              className="icon-button"
              title="复制内容"
              onClick={onCopy}
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              className="icon-button"
              title="查看详情"
              onClick={onDetail}
            >
              <BookOpen size={14} />
            </button>
          </div>
        </div>
        <div className="terminal-host" ref={containerRef} />
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
