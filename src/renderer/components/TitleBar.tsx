import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk.isWindowMaximized().then((value) => {
      if (!cancelled) setMaximized(value);
    });
    const unsubscribe = window.codeagentdesk.onWindowMaximizedChanged((value) => {
      setMaximized(value);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-dot" />
        <span>CodeAgentDesk</span>
      </div>
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-button"
          aria-label="最小化"
          onClick={() => void window.codeagentdesk.minimizeWindow()}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="titlebar-button"
          aria-label={maximized ? '还原' : '最大化'}
          onClick={() => void window.codeagentdesk.toggleMaximizeWindow().then(setMaximized)}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          className="titlebar-button close"
          aria-label="关闭"
          onClick={() => void window.codeagentdesk.closeWindow()}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
