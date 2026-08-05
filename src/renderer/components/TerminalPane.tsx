import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  id: string;
  active: boolean;
}

interface TerminalMenuState {
  x: number;
  y: number;
}

export function TerminalPane({ id, active }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const [hasSelection, setHasSelection] = useState(false);
  const [menu, setMenu] = useState<TerminalMenuState | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: true,
      scrollback: 10000,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0a0c0f',
        foreground: '#dfe3e8',
        cursor: '#2fbfae',
        selectionBackground: '#2f8579',
      },
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

    terminal.attachCustomWheelEventHandler((event) => {
      if (Math.abs(event.deltaY) < 1) return false;
      const lines = event.deltaY > 0 ? 3 : -3;
      try {
        terminal.scrollLines(lines);
      } catch {
        return false;
      }
      return true;
    });

    const dataDisposable = terminal.onData((data) => {
      void window.codeagentdesk.writeSession(id, data);
    });
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void window.codeagentdesk.resizeSession(id, cols, rows);
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
      <div className="terminal-pane" ref={containerRef} />
      {menu ? (
        <div
          className="terminal-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => void copySelection()}
          >
            复制
          </button>
          <button type="button" onClick={() => void pasteClipboard()}>
            粘贴
          </button>
        </div>
      ) : null}
    </>
  );
}
