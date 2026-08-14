import {
  Check,
  FolderOpen,
  Plus,
  RotateCcw,
  Settings2,
  Tags,
  X,
} from 'lucide-react';
import type { AppInfo, ClaudeConfigInfo, GroupRecord, SessionRecord, ThemeName } from '../../shared/types';
import { folderName } from '../session-utils';
import { THEMES, THEME_SWATCHES } from '../theme';

interface SidebarFooterData {
  appInfo: AppInfo | null;
  claudeInfo: ClaudeConfigInfo | null;
  groups: GroupRecord[];
  records: SessionRecord[];
  recentDirs: string[];
  newMenuOpen: boolean;
  settingsOpen: boolean;
  groupManageOpen: boolean;
  newGroupName: string;
  groupRenameId: string | null;
}

interface SidebarFooterActions {
  setNewMenuOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setGroupManageOpen: (open: boolean) => void;
  setNewGroupName: (name: string) => void;
  setGroupRenameId: (id: string | null) => void;
  handleNewSession: (cwd?: string) => void;
  handleSetTheme: (theme: ThemeName) => void;
  handlePickClaudeDir: () => void;
  handleResetClaudeDir: () => void;
  createGroupFromManage: () => void;
  commitGroupRename: (id: string, name: string) => void;
  handleDeleteGroup: (id: string) => void;
  cycleGroupColor: (id: string, color: string) => void;
}

export function SidebarFooter({
  data,
  actions,
}: {
  data: SidebarFooterData;
  actions: SidebarFooterActions;
}) {
  const {
    appInfo,
    claudeInfo,
    groups,
    records,
    recentDirs,
    newMenuOpen,
    settingsOpen,
    groupManageOpen,
    newGroupName,
    groupRenameId,
  } = data;
  const {
    setNewMenuOpen,
    setSettingsOpen,
    setGroupManageOpen,
    setNewGroupName,
    setGroupRenameId,
    handleNewSession,
    handleSetTheme,
    handlePickClaudeDir,
    handleResetClaudeDir,
    createGroupFromManage,
    commitGroupRename,
    handleDeleteGroup,
    cycleGroupColor,
  } = actions;

  return (
    <div className="sidebar-footer">
      <div className="new-wrap">
        <button
          type="button"
          className="new-session"
          onClick={(event) => {
            event.stopPropagation();
            setNewMenuOpen(!newMenuOpen);
          }}
        >
          <Plus size={16} />
          <span>新建会话</span>
        </button>
        {newMenuOpen ? (
          <div className="new-menu" role="menu" onClick={(event) => event.stopPropagation()}>
            <div className="new-menu-label">最近目录</div>
            {recentDirs.length === 0 ? (
              <div className="new-menu-empty">暂无历史目录</div>
            ) : (
              recentDirs.map((dir) => (
                <button
                  key={dir}
                  type="button"
                  role="menuitem"
                  className="new-menu-item"
                  onClick={() => void handleNewSession(dir)}
                >
                  <span className="new-menu-name">{folderName(dir)}</span>
                  <span className="new-menu-path">{dir}</span>
                </button>
              ))
            )}
            <div className="new-menu-sep" />
            <button
              type="button"
              role="menuitem"
              className="new-menu-item"
              onClick={() => void handleNewSession()}
            >
              <FolderOpen size={13} />
              <span>选择其他目录…</span>
            </button>
          </div>
        ) : null}
      </div>
      <div className="status-line">
        <span className={`status-dot ${appInfo ? 'ok' : 'pending'}`} />
        <span>{appInfo ? `v${appInfo.appVersion}` : '启动中'}</span>
      </div>
      <div className="groups-wrap">
        <button
          type="button"
          className="icon-button"
          aria-label="分组管理"
          title="分组管理"
          onClick={() => setGroupManageOpen(!groupManageOpen)}
        >
          <Tags size={16} />
        </button>
        {groupManageOpen ? (
          <div
            className="settings-popover group-manage-popover"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-label">分组管理</div>
            <div className="group-manage-create">
              <input
                className="session-rename-input"
                placeholder="新分组名称…"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createGroupFromManage();
                }}
              />
              <button
                type="button"
                className="icon-button"
                title="新建分组"
                onClick={() => void createGroupFromManage()}
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="group-manage-list">
              {groups.length === 0 ? (
                <div className="group-manage-empty">还没有分组</div>
              ) : (
                groups.map((group) => (
                  <div key={group.id} className="group-manage-row">
                    <button
                      type="button"
                      className="group-manage-color"
                      title="切换颜色"
                      onClick={() => void cycleGroupColor(group.id, group.color)}
                    >
                      <span className="group-color-dot" style={{ background: group.color }} />
                    </button>
                    {groupRenameId === group.id ? (
                      <input
                        className="session-rename-input"
                        autoFocus
                        defaultValue={group.name}
                        onBlur={(event) =>
                          void commitGroupRename(group.id, event.currentTarget.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void commitGroupRename(group.id, event.currentTarget.value);
                          } else if (event.key === 'Escape') {
                            setGroupRenameId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="group-manage-name"
                        title="点击重命名"
                        onClick={() => setGroupRenameId(group.id)}
                      >
                        {group.name}
                      </button>
                    )}
                    <span className="group-manage-count">
                      {records.filter((record) => record.group === group.id).length}
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      title="删除分组"
                      onClick={() => void handleDeleteGroup(group.id)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
      <div className="settings-wrap">
        <button
          type="button"
          className="icon-button"
          aria-label="设置"
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <Settings2 size={16} />
        </button>
        {settingsOpen && claudeInfo ? (
          <div className="settings-popover settings-popover-compact">
            <div className="settings-label">皮肤</div>
            <div className="theme-grid">
              {THEMES.map((item) => {
                const swatch = THEME_SWATCHES[item.name];
                const active = (claudeInfo.config.theme ?? 'default') === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    className={`theme-chip ${active ? 'active' : ''}`}
                    onClick={() => void handleSetTheme(item.name)}
                  >
                    <span className="theme-chip-swatch" style={{ background: swatch.bg }} />
                    <span className="theme-chip-label">{item.label}</span>
                    {active ? <Check size={12} className="theme-chip-check" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="settings-label">Claude 目录</div>
            <div className="settings-row">
              <span className="settings-path" title={claudeInfo.resolvedClaudeDir}>
                {claudeInfo.resolvedClaudeDir}
              </span>
              <button
                type="button"
                className="icon-button"
                title="选择目录"
                onClick={() => void handlePickClaudeDir()}
              >
                <FolderOpen size={14} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="恢复默认"
                onClick={() => void handleResetClaudeDir()}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
