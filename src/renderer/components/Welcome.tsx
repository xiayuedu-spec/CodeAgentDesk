import { BookOpen, Plus, Sparkles, Terminal } from 'lucide-react';

interface WelcomeProps {
  historyCount: number;
  error: string | null;
  onNew: () => void;
  onFocusHistory: () => void;
  onOpenSummary: () => void;
}

export function Welcome({ historyCount, error, onNew, onFocusHistory, onOpenSummary }: WelcomeProps) {
  return (
    <div className="welcome">
      <div className="welcome-icon">
        <Terminal size={26} strokeWidth={1.6} />
      </div>
      <div className="welcome-title">CodeAgentDesk</div>
      <div className="welcome-sub">Claude Code 统一窗口管理器</div>
      <div className="welcome-actions">
        <button type="button" className="welcome-btn primary" onClick={onNew}>
          <Plus size={16} />
          <span>新建会话</span>
        </button>
        {historyCount > 0 ? (
          <button type="button" className="welcome-btn" onClick={onFocusHistory}>
            <BookOpen size={16} />
            <span>打开历史会话</span>
          </button>
        ) : null}
        <button type="button" className="welcome-btn" onClick={onOpenSummary}>
          <Sparkles size={16} />
          <span>今日总结</span>
        </button>
      </div>
      <div className="welcome-hint">Ctrl+K 全局搜索 · Ctrl+T 新建会话 · Ctrl+1..9 切换标签</div>
      {error ? <div className="welcome-error">{error}</div> : null}
    </div>
  );
}
