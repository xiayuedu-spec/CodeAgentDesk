import { useEffect, useRef } from 'react';
import { BookOpen, Copy, PanelLeft, PanelLeftClose, Plus, X } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { AgentStatusStyle } from '../../shared/types';
import { formatSessionTitle, statusLabel, type SessionView } from '../session-utils';
import { type AgentStatus } from '../hooks/useAgentStatus';
import { AgentStatusMark } from './AgentStatusMark';

interface TabBarProps {
  sessions: SessionView[];
  sessionStatuses: Record<string, AgentStatus>;
  agentStatusStyle: AgentStatusStyle;
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
  /** 当前会话的终端操作（原本在终端面板头部，合并到这条唯一 chrome 行）。 */
  onCopyActive?: () => void;
  onDetailActive?: () => void;
}

export function TabBar({
  sessions,
  sessionStatuses,
  agentStatusStyle,
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
  onCopyActive,
  onDetailActive,
}: TabBarProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // 标签多到需要滚动时，切换会话要把激活页带回视野（键盘 / 侧栏切换都会触发）。
  useEffect(() => {
    if (!activeId) return;
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  return (
    <div className="tab-bar" role="tablist" aria-label="打开的会话">
      {/* 标签多时横向滚动；动作按钮在容器外，固定右侧不随滚动消失 */}
      <div className="tab-list" ref={listRef}>
        {sessions.map((session, i) => (
          <div
            key={session.id}
            data-tab-id={session.id}
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
            {agentStatusStyle === 'dot' ? (
              <span
                className={`tab-dot ${session.status}`}
                title={statusLabel(session.status)}
              />
            ) : (
              <AgentStatusMark
                status={sessionStatuses[session.id] ?? 'idle'}
                style={agentStatusStyle}
                className="tab-agent"
              />
            )}
            <span className="tab-label" title={formatSessionTitle(session)}>
              {formatSessionTitle(session)}
            </span>
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
      </div>
      {activeId && (onCopyActive || onDetailActive) ? (
        <div className="tab-actions">
          {onCopyActive ? (
            <button
              type="button"
              className="icon-button"
              title="复制内容"
              aria-label="复制会话内容"
              onClick={onCopyActive}
            >
              <Copy size={14} />
            </button>
          ) : null}
          {onDetailActive ? (
            <button
              type="button"
              className="icon-button"
              title="查看详情"
              aria-label="查看会话详情"
              onClick={onDetailActive}
            >
              <BookOpen size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
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
