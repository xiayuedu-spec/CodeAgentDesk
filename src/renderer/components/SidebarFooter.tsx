import { Check, FolderOpen, Plus, RotateCcw, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppInfo, AgentStatusStyle, ClaudeConfigInfo, DashboardStats, ThemeName } from '../../shared/types';
import { folderName } from '../session-utils';
import { THEMES, THEME_SWATCHES } from '../theme';
import { HourlyUsagePopover } from './HourlyUsagePopover';

export const DEFAULT_HOURLY_LIMIT = 10_000_000;

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

interface SidebarFooterData {
  appInfo: AppInfo | null;
  claudeInfo: ClaudeConfigInfo | null;
  recentDirs: string[];
  newMenuOpen: boolean;
  settingsOpen: boolean;
  stats: DashboardStats;
}

interface SidebarFooterActions {
  setNewMenuOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  handleNewSession: (cwd?: string) => void;
  handleSetTheme: (theme: ThemeName) => void;
  handlePickClaudeDir: () => void;
  handleResetClaudeDir: () => void;
  handleSetTokenLimit: (limit: number) => void;
  handleSetAgentStatusStyle: (style: AgentStatusStyle) => void;
}

export function SidebarFooter({
  data,
  actions,
}: {
  data: SidebarFooterData;
  actions: SidebarFooterActions;
}) {
  const { appInfo, claudeInfo, recentDirs, newMenuOpen, settingsOpen, stats } = data;
  const {
    setNewMenuOpen,
    setSettingsOpen,
    handleNewSession,
    handleSetTheme,
    handlePickClaudeDir,
    handleResetClaudeDir,
    handleSetTokenLimit,
    handleSetAgentStatusStyle,
  } = actions;

  const limitTier = stats.hourlyPercent >= 100 ? 'danger' : stats.hourlyPercent >= 80 ? 'warn' : '';
  const [limitInput, setLimitInput] = useState(
    String(claudeInfo?.config.tokenLimitPerHour ?? DEFAULT_HOURLY_LIMIT),
  );
  const [hourlyOpen, setHourlyOpen] = useState(false);
  const newWrapRef = useRef<HTMLDivElement | null>(null);
  const settingsWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hourlyOpen) return;
    const close = () => setHourlyOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHourlyOpen(false);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [hourlyOpen]);

  // 新建会话菜单 / 设置弹窗：点击自身区域外或按 Esc 关闭。
  useEffect(() => {
    if (!settingsOpen && !newMenuOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (newWrapRef.current?.contains(target) || settingsWrapRef.current?.contains(target))
      ) {
        return;
      }
      setSettingsOpen(false);
      setNewMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
        setNewMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen, newMenuOpen]);

  return (
    <div className="sidebar-footer">
      <div className="new-wrap" ref={newWrapRef}>
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

      {/* 本小时 Token 限额统计（新建会话下方，点击查看每小时用量小窗） */}
      <div className="footer-limit-wrap">
        <button
          type="button"
          className="footer-limit"
          title="本小时 Token 消耗（整点刷新）· 点击查看每小时用量"
          onClick={(event) => {
            event.stopPropagation();
            setHourlyOpen((open) => !open);
          }}
        >
          <div className="footer-limit-head">
            <span className="footer-limit-label">本小时消耗</span>
            <span className={`footer-limit-percent ${limitTier}`}>{stats.hourlyPercent}%</span>
          </div>
          <div className={`footer-limit-bar ${limitTier}`}>
            <span style={{ width: `${Math.min(100, stats.hourlyPercent)}%` }} />
          </div>
          <div className="footer-limit-sub">
            {formatTokens(stats.hourlyTokens)} / {formatTokens(stats.hourlyLimit)} · 整点刷新
          </div>
        </button>
        {hourlyOpen ? (
          <HourlyUsagePopover limit={claudeInfo?.config.tokenLimitPerHour ?? DEFAULT_HOURLY_LIMIT} />
        ) : null}
      </div>

      <div className="status-line">
        <span className={`status-dot ${appInfo ? 'ok' : 'pending'}`} />
        <span>{appInfo ? `v${appInfo.appVersion}` : '启动中'}</span>
      </div>
      <div className="settings-wrap" ref={settingsWrapRef}>
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
              {THEMES.filter(
                (item) => item.name !== 'neon' || claudeInfo.config.funUnlockedNeon === true,
              ).map((item) => {
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
            <div className="settings-label">小时 Token 限额（整点刷新）</div>
            <div className="settings-row">
              <input
                type="number"
                className="settings-limit-input"
                value={limitInput}
                min={1}
                step={100000}
                onChange={(event) => setLimitInput(event.target.value)}
                aria-label="小时 Token 限额"
              />
              <button
                type="button"
                className="settings-action settings-limit-save"
                onClick={() => {
                  const value = Number(limitInput);
                  if (Number.isFinite(value) && value > 0) {
                    handleSetTokenLimit(Math.floor(value));
                  }
                }}
              >
                保存
              </button>
            </div>
            <div className="settings-label">会话状态显示</div>
            <div className="status-style-row">
              <button
                type="button"
                className={`status-style-btn${(claudeInfo.config.agentStatusStyle ?? 'emoji') === 'emoji' ? ' active' : ''}`}
                onClick={() => handleSetAgentStatusStyle('emoji')}
              >
                🧠 表情图标
              </button>
              <button
                type="button"
                className={`status-style-btn${claudeInfo.config.agentStatusStyle === 'dot' ? ' active' : ''}`}
                onClick={() => handleSetAgentStatusStyle('dot')}
              >
                ● 颜色圆点
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
