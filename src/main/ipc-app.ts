import { app, dialog, ipcMain, shell } from 'electron';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  AppInfo,
  BackupResult,
  ClaudeConfigInfo,
  PickClaudeDirResult,
  SessionOpResult,
  ThemeName,
  UiState,
  UpdateStatus,
  UsageStats,
} from '../shared/types';
import {
  readClaudeConfigInfo,
  readConfig,
  writeConfig,
} from './config';
import { getMainWindow } from './window-manager';
import { getRecentDirs } from './recent-dirs';
import { readUiState, writeUiState } from './ui-state';
import { invalidateDashboardCache } from './ipc-usage';
import { exportBackup, importBackup } from './backup';
import { incrementUsage, listUsage } from './usage-store';
import { checkForUpdates, installUpdate } from './updater';

const startedAt = new Date().toISOString();

export interface AppIpcDeps {
  onClaudeDirChanged: () => void;
}

/** 应用级 IPC：版本信息、配置（目录/主题/限额）、最近目录、窗口控制、UI 状态。 */
export function registerAppIpc({ onClaudeDirChanged }: AppIpcDeps): void {
  ipcMain.handle(IpcChannel.appGetInfo, (): AppInfo => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    startedAt,
  }));

  ipcMain.handle(IpcChannel.configGet, (): ClaudeConfigInfo => readClaudeConfigInfo());

  ipcMain.handle(
    IpcChannel.configSetClaudeDir,
    (_event, dir: string | null): ClaudeConfigInfo => {
      writeConfig({ claudeDir: dir ?? undefined });
      onClaudeDirChanged();
      return readClaudeConfigInfo();
    },
  );

  ipcMain.handle(
    IpcChannel.configSetTheme,
    (_event, theme: ThemeName): ClaudeConfigInfo => {
      writeConfig({ ...readConfig(), theme });
      return readClaudeConfigInfo();
    },
  );

  ipcMain.handle(
    IpcChannel.configSetTokenLimit,
    (_event, limit: number): ClaudeConfigInfo => {
      const safeLimit =
        typeof limit === 'number' && Number.isFinite(limit) && limit > 0
          ? Math.floor(limit)
          : undefined;
      writeConfig({ ...readConfig(), tokenLimitPerHour: safeLimit });
      invalidateDashboardCache(); // 限额变化立即反映到统计缓存。
      return readClaudeConfigInfo();
    },
  );

  ipcMain.handle(
    IpcChannel.configSetAgentStatusStyle,
    (_event, style: unknown): ClaudeConfigInfo => {
      writeConfig({ ...readConfig(), agentStatusStyle: style === 'dot' ? 'dot' : 'emoji' });
      return readClaudeConfigInfo();
    },
  );

  ipcMain.handle(
    IpcChannel.configSetPomodoroMinutes,
    (_event, minutes: number): ClaudeConfigInfo => {
      const safe =
        typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 1
          ? Math.min(180, Math.round(minutes))
          : undefined;
      writeConfig({ ...readConfig(), pomodoroMinutes: safe });
      return readClaudeConfigInfo();
    },
  );

  ipcMain.handle(IpcChannel.configPickClaudeDir, async (): Promise<PickClaudeDirResult> => {
    const result = await dialog.showOpenDialog({
      title: '选择 Claude 目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { dir: null };
    return { dir: result.filePaths[0] };
  });

  ipcMain.handle(IpcChannel.recentDirsGet, (): string[] => getRecentDirs());

  ipcMain.handle(
    IpcChannel.sessionOpenCwd,
    async (_event, cwd: string): Promise<SessionOpResult> => {
      if (typeof cwd !== 'string' || !cwd.trim()) {
        return { ok: false, message: '缺少工作目录' };
      }
      try {
        const errorMessage = await shell.openPath(cwd.trim());
        return errorMessage ? { ok: false, message: errorMessage } : { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(IpcChannel.uiGetState, (): UiState => readUiState());

  ipcMain.handle(IpcChannel.uiSaveState, (_event, state: UiState): void => {
    writeUiState({
      openSessionIds: Array.isArray(state.openSessionIds) ? state.openSessionIds : [],
      activeSessionId: state.activeSessionId,
      collapsedGroups: Array.isArray(state.collapsedGroups) ? state.collapsedGroups : [],
      collapsedSections: Array.isArray(state.collapsedSections) ? state.collapsedSections : [],
    });
  });

  ipcMain.handle(IpcChannel.windowMinimize, (): void => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle(IpcChannel.windowToggleMaximize, (): boolean => {
    const window = getMainWindow();
    if (!window) return false;
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return window.isMaximized();
  });

  ipcMain.handle(IpcChannel.windowIsMaximized, (): boolean => {
    return getMainWindow()?.isMaximized() ?? false;
  });

  ipcMain.handle(IpcChannel.windowClose, (): void => {
    getMainWindow()?.close();
  });

  ipcMain.handle(IpcChannel.windowSetBackgroundColor, (_event, color: string): void => {
    getMainWindow()?.setBackgroundColor(color);
  });

  // 自动更新
  ipcMain.handle(IpcChannel.updateCheck, (): Promise<UpdateStatus> => checkForUpdates());
  ipcMain.handle(IpcChannel.updateInstall, (): void => installUpdate());

  // 备份 / 迁移
  ipcMain.handle(IpcChannel.backupExport, (): Promise<BackupResult> => exportBackup());
  ipcMain.handle(IpcChannel.backupImport, (): Promise<BackupResult> => importBackup());

  // 使用统计（本地计数）
  ipcMain.handle(IpcChannel.usageStatIncrement, (_event, key: string): void => {
    if (typeof key === 'string') incrementUsage(key);
  });
  ipcMain.handle(IpcChannel.usageStatList, (): UsageStats => listUsage());
}
