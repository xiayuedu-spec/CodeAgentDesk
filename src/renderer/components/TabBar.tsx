import { PanelLeft, PanelLeftClose, Plus, X } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { formatSessionTitle, statusLabel, type SessionView } from '../session-utils';

interface TabBarProps {
  sessions: SessionView[];
  activeId: string | null;
  dragIndex: number | null;
  infoOpen: boolean;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
  onDrop: (from: number, to: number) => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onContextMenu: (event: ReactMouseEvent, sessionId: string, cwd: string) => void;
  onToggleInfo: () => void;
  onNew: () => void;
}

export function TabBar({
  sessions,
  activeId,
  dragIndex,
  infoOpen,
  onDragStart,
  onDragEnd,
  onDrop,
  onSelect,
  onClose,
  onContextMenu,
  onToggleInfo,
  onNew,
}: TabBarProps) {
  return (
    <div className="tab-bar" role="tablist" aria-label="打开的会话">
      {sessions.map((session, i) => (
        <div
          key={session.id}
          className={`tab ${session.id === activeId ? 'active' : ''}${
            dragIndex === i ? ' dragging' : ''
          }${session.activity ? ' has-activity' : ''}`}
          role="tab"
          aria-selected={session.id === activeId}
          tabIndex={0}
          draggable
          onDragStart={() => onDragStart(i)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (dragIndex == null) return;
            const from = dragIndex;
            const to = i;
            onDrop(from, to);
          }}
          onDragEnd={onDragEnd}
          onClick={() => onSelect(session.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelect(session.id);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (session.sessionId) {
              onContextMenu(event, session.sessionId, session.cwd);
            }
          }}
        >
          <span
            className={`tab-dot ${session.status}`}
            title={statusLabel(session.status)}
          />
          <span>{formatSessionTitle(session)}</span>
          <button
            type="button"
            className="icon-button tab-close"
            aria-label="关闭会话"
            onClick={(event) => {
              event.stopPropagation();
              onClose(session.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="icon-button tab-panel-toggle"
        aria-label={infoOpen ? '收起信息面板' : '展开信息面板'}
        title={infoOpen ? '收起信息面板' : '展开信息面板'}
        onClick={onToggleInfo}
      >
        {infoOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
      </button>
      <button
        type="button"
        className="icon-button tab-add"
        aria-label="新建会话"
        onClick={onNew}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
