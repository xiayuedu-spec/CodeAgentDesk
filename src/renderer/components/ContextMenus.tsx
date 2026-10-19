import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Copy,
  FolderOpen,
  GitBranch,
  Link2,
  ListChecks,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GROUP_COLORS } from '../../shared/types';
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
  sectionMenu: { kind: 'history'; x: number; y: number } | null;
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
  closeSectionMenu: () => void;
  setRenamingId: (id: string | null) => void;
  setGroupRenameId: (id: string | null) => void;
  archiveSession: (sessionId: string, cwd: string) => void;
  openMoveMenu: (sessionId: string, x: number, y: number) => void;
  setActiveId: (id: string) => void;
  openHistory: (record: SessionRecord) => void;
  openDetailById: (sessionId: string) => void;
  openInsights: (sessionId: string) => void;
  openDiff: (cwd: string) => void;
  restoreArchived: (sessionId: string, cwd: string) => void;
  copySessionText: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  handleDeleteGroup: (id: string) => void;
  moveToGroup: (sessionId: string, groupId: string | null) => void;
  togglePin: (sessionId: string, pinned: boolean) => void;
  openCwd: (cwd: string) => void;
  setGroupColor: (id: string, color: string) => void;
  archiveGroupHistory: (groupId: string) => void;
  archiveAllHistory: () => void;
  setMoveNewOpen: (open: boolean) => void;
  setMoveNewName: (name: string) => void;
  createGroupAndMove: () => void;
}

/**
 * 右键菜单容器：先按鼠标坐标渲染，再测量自身尺寸把浮层拉回视口内。
 * 修复"在窗口下部右键，菜单溢出到屏幕外"的问题（会话菜单已十余项，很容易触底）。
 */
function ClampedMenu({
  x,
  y,
  className,
  children,
}: {
  x: number;
  y: number;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      setPos({ left: x, top: y });
      return;
    }
    // 尺寸与位置无关，用当前 rect 的宽高即可。
    const { width, height } = element.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - height - margin));
    setPos((current) =>
      current.left === left && current.top === top ? current : { left, top },
    );
  }, [x, y]);

  return (
    <div
      ref={ref}
      className={className}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function ContextMenus({ data, actions }: { data: ContextMenusData; actions: ContextMenusActions }) {
  const { menu, menuSession, groupMenu, sectionMenu, moveMenu, groups, moveNewOpen, moveNewName, sessions, records } = data;
  // 分组内可归档的历史会话数（未归档且未运行中）——"全部归档"使用。
  const groupHistoryCount =
    groupMenu && groupMenu.id
      ? records.filter(
          (record) =>
            !record.archived &&
            record.group === groupMenu.id &&
            !sessions.some((session) => session.sessionId === record.sessionId),
        ).length
      : 0;
  // 全部可归档的未分组历史会话数（历史会话区块"全部归档"，已分组的归各分组管理）。
  const historyCountAll = records.filter(
    (record) =>
      !record.archived &&
      !record.group &&
      !sessions.some((session) => session.sessionId === record.sessionId),
  ).length;
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
  openInsights,
  openDiff,
    restoreArchived,
    copySessionText,
    onDeleteSession,
    handleDeleteGroup,
    moveToGroup,
    togglePin,
    openCwd,
    setGroupColor,
    archiveGroupHistory,
    archiveAllHistory,
    closeSectionMenu,
    setMoveNewOpen,
    setMoveNewName,
    createGroupAndMove,
  } = actions;

  return (
    <>
      {menu ? (
        <ClampedMenu x={menu.x} y={menu.y} className="context-menu">
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
              if (!menuSession) return;
              const pinned =
                records.find((record) => record.sessionId === menu.sessionId)?.pinned === true;
              void togglePin(menu.sessionId, !pinned);
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              {records.find((record) => record.sessionId === menu.sessionId)?.pinned ? (
                <PinOff size={14} />
              ) : (
                <Pin size={14} />
              )}
            </span>
            {records.find((record) => record.sessionId === menu.sessionId)?.pinned
              ? '取消置顶'
              : '置顶'}
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
          <button
            type="button"
            disabled={!menuSession}
            title="计划（TodoWrite 快照）与本次会话的文件改动"
            onClick={() => {
              openInsights(menu.sessionId);
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              <ListChecks size={14} />
            </span>
            计划与改动
          </button>
          <button
            type="button"
            disabled={!menu.cwd}
            title="工作区真实的 git diff（不是会话记录里的意图）"
            onClick={() => {
              if (menu.cwd) openDiff(menu.cwd);
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              <GitBranch size={14} />
            </span>
            审查工作区改动
          </button>
          {menu.archived ? (
            <button
              type="button"
              disabled={!menuSession}
              title="恢复后放回历史会话，不打开终端"
              onClick={() => {
                if (menuSession) void restoreArchived(menu.sessionId, menu.cwd);
                closeMenu();
              }}
            >
              <span className="context-menu-icon">
                <ArchiveRestore size={14} />
              </span>
              恢复（放回历史会话）
            </button>
          ) : null}
          <button
            type="button"
            disabled={!menuSession || !menu.cwd}
            onClick={() => {
              if (menu.cwd) void openCwd(menu.cwd);
              closeMenu();
            }}
          >
            <span className="context-menu-icon">
              <FolderOpen size={14} />
            </span>
            打开工作目录
          </button>
          {menu.archived ? (
            <button
              type="button"
              className="context-menu-danger"
              disabled={!menuSession}
              onClick={() => {
                onDeleteSession(menu.sessionId);
                closeMenu();
              }}
            >
              <span className="context-menu-icon">
                <Trash2 size={14} />
              </span>
              删除
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
        </ClampedMenu>
      ) : null}

      {groupMenu ? (
        <ClampedMenu x={groupMenu.x} y={groupMenu.y} className="context-menu">
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
          <button
            type="button"
            role="menuitem"
            disabled={groupHistoryCount === 0}
            onClick={() => {
              void archiveGroupHistory(groupMenu.id);
              closeGroupMenu();
            }}
          >
            <span className="context-menu-icon">
              <Archive size={14} />
            </span>
            全部归档（{groupHistoryCount} 个历史会话）
          </button>
          <div className="context-menu-separator" />
          <div className="group-color-label">分组颜色</div>
          <div className="group-color-picker" onClick={(event) => event.stopPropagation()}>
            {GROUP_COLORS.map((color) => {
              const active = groups.find((group) => group.id === groupMenu.id)?.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  role="menuitem"
                  className={`group-color-swatch${active ? ' active' : ''}`}
                  style={{ background: color }}
                  aria-label={`颜色 ${color}`}
                  onClick={() => void setGroupColor(groupMenu.id, color)}
                />
              );
            })}
            <label className="group-color-custom" title="自定义颜色">
              <input
                type="color"
                value={groups.find((group) => group.id === groupMenu.id)?.color ?? '#34d3c0'}
                onChange={(event) => void setGroupColor(groupMenu.id, event.target.value)}
              />
            </label>
          </div>
          <button type="button" role="menuitem" onClick={() => void handleDeleteGroup(groupMenu.id)}>
            <span className="context-menu-icon">
              <Archive size={14} />
            </span>
            删除分组
          </button>
        </ClampedMenu>
      ) : null}

      {sectionMenu ? (
        <ClampedMenu x={sectionMenu.x} y={sectionMenu.y} className="context-menu">
          <button
            type="button"
            role="menuitem"
            disabled={historyCountAll === 0}
            onClick={() => {
              void archiveAllHistory();
              closeSectionMenu();
            }}
          >
            <span className="context-menu-icon">
              <Archive size={14} />
            </span>
            全部归档（{historyCountAll} 个历史会话）
          </button>
        </ClampedMenu>
      ) : null}

      {moveMenu ? (
        <ClampedMenu x={moveMenu.x} y={moveMenu.y} className="context-menu move-menu">
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
        </ClampedMenu>
      ) : null}
    </>
  );
}
