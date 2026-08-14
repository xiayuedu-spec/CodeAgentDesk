import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Copy,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Tags,
  X,
} from 'lucide-react';
import type { GroupRecord, SessionRecord } from '../../shared/types';
import type {
  ContextMenuState,
  GroupMenuState,
  MoveMenuState,
  SessionView,
} from '../session-utils';

type MenuSession = SessionView | SessionRecord | null;

interface ContextMenusData {
  menu: ContextMenuState | null;
  menuSession: MenuSession;
  groupMenu: GroupMenuState | null;
  moveMenu: MoveMenuState | null;
  groups: GroupRecord[];
  moveNewOpen: boolean;
  moveNewName: string;
  sessions: SessionView[];
  records: SessionRecord[];
}

interface ContextMenusActions {
  closeMenu: () => void;
  closeGroupMenu: () => void;
  setRenamingId: (id: string | null) => void;
  setGroupRenameId: (id: string | null) => void;
  archiveSession: (sessionId: string, cwd: string) => void;
  openMoveMenu: (sessionId: string, x: number, y: number) => void;
  setActiveId: (id: string) => void;
  openHistory: (record: SessionRecord) => void;
  openDetailById: (sessionId: string) => void;
  restoreArchived: (sessionId: string, cwd: string) => void;
  copySessionText: (sessionId: string) => void;
  handleDeleteGroup: (id: string) => void;
  moveToGroup: (sessionId: string, groupId: string | null) => void;
  setMoveNewOpen: (open: boolean) => void;
  setMoveNewName: (name: string) => void;
  createGroupAndMove: () => void;
}

export function ContextMenus({ data, actions }: { data: ContextMenusData; actions: ContextMenusActions }) {
  const { menu, menuSession, groupMenu, moveMenu, groups, moveNewOpen, moveNewName, sessions, records } = data;
  const {
    closeMenu,
    closeGroupMenu,
    setRenamingId,
    setGroupRenameId,
    archiveSession,
    openMoveMenu,
    setActiveId,
    openHistory,
    openDetailById,
    restoreArchived,
    copySessionText,
    handleDeleteGroup,
    moveToGroup,
    setMoveNewOpen,
    setMoveNewName,
    createGroupAndMove,
  } = actions;

  return (
    <>
      {menu ? (
        <div
          className="context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={!menuSession || menu.archived}
            onClick={() => {
              setRenamingId(menu.sessionId);
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              <Pencil size={14} />
            </span>
            重命名
          </button>
          <button
            type="button"
            disabled={!menuSession || menu.archived}
            onClick={() => {
              if (menuSession) void archiveSession(menu.sessionId, menu.cwd);
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              <Archive size={14} />
            </span>
            归档
          </button>
          <button
            type="button"
            disabled={!menuSession || menu.archived}
            onClick={() => {
              if (!menuSession) return;
              openMoveMenu(menu.sessionId, menu.x + 160, menu.y);
            }}
          >
            <span className="context-menu-icon">
              <Tags size={14} />
            </span>
            移动到分组
          </button>
          <button
            type="button"
            disabled={!menuSession || menu.archived}
            onClick={() => {
              const running = sessions.find((session) => session.sessionId === menu.sessionId);
              if (running) {
                setActiveId(running.id);
              } else {
                const record = records.find((item) => item.sessionId === menu.sessionId);
                if (record) void openHistory(record);
              }
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              <RotateCcw size={14} />
            </span>
            恢复会话
          </button>
          <button
            type="button"
            disabled={!menuSession}
            onClick={() => {
              void openDetailById(menu.sessionId);
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              <BookOpen size={14} />
            </span>
            查看详情
          </button>
          {menu.archived ? (
            <button
              type="button"
              disabled={!menuSession}
              onClick={() => {
                if (menuSession) void restoreArchived(menu.sessionId, menu.cwd);
                closeMenu();
              }}
            >
              <span className="context-menu-icon">
                <ArchiveRestore size={14} />
              </span>
              恢复
            </button>
          ) : null}
          <div className="context-menu-separator" />
          <button
            type="button"
            disabled={!menuSession}
            onClick={() => {
              if (menuSession) void copySessionText(menu.sessionId);
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              <Copy size={14} />
            </span>
            复制内容
          </button>
          <button
            type="button"
            onClick={() => {
              if (menu.cwd) void navigator.clipboard.writeText(menu.cwd);
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              <Link2 size={14} />
            </span>
            复制路径
          </button>
        </div>
      ) : null}

      {groupMenu ? (
        <div
          className="context-menu"
          role="menu"
          style={{ left: groupMenu.x, top: groupMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setGroupRenameId(groupMenu.id);
              closeGroupMenu();
            }}
          >
            <span className="context-menu-icon">
              <Pencil size={14} />
            </span>
            重命名分组
          </button>
          <button type="button" role="menuitem" onClick={() => void handleDeleteGroup(groupMenu.id)}>
            <span className="context-menu-icon">
              <Archive size={14} />
            </span>
            删除分组
          </button>
        </div>
      ) : null}

      {moveMenu ? (
        <div
          className="context-menu move-menu"
          role="menu"
          style={{ left: moveMenu.x, top: moveMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {moveNewOpen ? (
            <div className="move-new-row">
              <input
                className="session-rename-input"
                autoFocus
                placeholder="新分组名称"
                value={moveNewName}
                onChange={(event) => setMoveNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void createGroupAndMove();
                  } else if (event.key === 'Escape') {
                    setMoveNewOpen(false);
                  }
                }}
              />
            </div>
          ) : null}
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              role="menuitem"
              onClick={() => void moveToGroup(moveMenu.sessionId, group.id)}
            >
              <span className="context-menu-icon">
                <span className="group-color-dot" style={{ background: group.color }} />
              </span>
              {group.name}
            </button>
          ))}
          <div className="context-menu-separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void moveToGroup(moveMenu.sessionId, null)}
          >
            <span className="context-menu-icon">
              <X size={14} />
            </span>
            移出分组
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMoveNewOpen(true);
              setMoveNewName('');
            }}
          >
            <span className="context-menu-icon">
              <Plus size={14} />
            </span>
            新建分组…
          </button>
        </div>
      ) : null}
    </>
  );
}
