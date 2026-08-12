import { app, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  AppInfo,
  ArchiveSessionResult,
  ClaudeConfigInfo,
  CreateSessionResult,
  ExportResult,
  PickClaudeDirResult,
  PickDirectoryResult,
  ReadSessionTextResult,
  RenameSessionResult,
  RestoreSessionResult,
  ResumeSessionResult,
  SessionDetailResult,
  SessionRecord,
  SearchResult,
  SessionUsage,
  ThemeName,
  UiState,
} from '../shared/types';
import {
  readClaudeConfigInfo,
  readConfig,
  resolveClaudeHome,
  writeConfig,
} from './config';
import { getMainWindow } from './window-manager';
import {
  findSessionFile,
  listSessions,
  readChatEntries,
  readSessionDetail,
  readSessionInfo,
  readSessionUsage,
  searchSessions,
} from './session-library';
import { buildMarkdown } from './export';
import { readUiState, writeUiState } from './ui-state';
import type { SessionMetaStore } from './session-meta-store';
import type { SessionManager } from './session-manager';
import type { SessionWatcher } from './session-watcher';

const startedAt = new Date().toISOString();

export function registerIpcHandlers(
  sessions: SessionManager,
  watcher: SessionWatcher,
  metaStore: SessionMetaStore,
  onClaudeDirChanged: () => void,
): void {
  const locateSessionFile = async (sessionId: string, cwd?: string): Promise<string | null> => {
    const claudeHome = resolveClaudeHome(readConfig());
    let filePath = '';
    const runningId = sessions.findBySessionId(sessionId);
    if (runningId) {
      const info = sessions.getSession(runningId);
      if (info?.cwd) {
        filePath = path.join(
          claudeHome,
          'projects',
          info.cwd.replace(/[\\:]/g, '-'),
          `${sessionId}.jsonl`,
        );
      }
    }
    if (!filePath || !fs.existsSync(filePath)) {
      const meta = metaStore.get(sessionId);
      if (meta.archivedPath && fs.existsSync(meta.archivedPath)) {
        filePath = meta.archivedPath;
      }
    }
    if (!filePath || !fs.existsSync(filePath)) {
      const found = await findSessionFile(claudeHome, sessionId);
      if (found) filePath = found;
    }
    return filePath && fs.existsSync(filePath) ? filePath : null;
  };

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

  ipcMain.handle(IpcChannel.configPickClaudeDir, async (): Promise<PickClaudeDirResult> => {
    const result = await dialog.showOpenDialog({
      title: '选择 Claude 目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { dir: null };
    return { dir: result.filePaths[0] };
  });

  ipcMain.handle(IpcChannel.sessionsList, async (): Promise<SessionRecord[]> =>
    listSessions(resolveClaudeHome(readConfig()), metaStore),
  );

  ipcMain.handle(IpcChannel.sessionPickDirectory, async (): Promise<PickDirectoryResult> => {
    const result = await dialog.showOpenDialog({
      title: '选择会话工作目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { cwd: null };
    return { cwd: result.filePaths[0] };
  });

  ipcMain.handle(IpcChannel.sessionCreate, (_event, cwd: string): CreateSessionResult => {
    const created = sessions.create(cwd);
    const { id } = created;
    watcher.registerPending(id, cwd);
    return created;
  });

  ipcMain.handle(
    IpcChannel.sessionResume,
    (_event, payload: { sessionId: string; cwd: string }): ResumeSessionResult => {
      const created = sessions.resume(payload.cwd, payload.sessionId);
      sessions.bind(created.id, payload.sessionId);
      return created;
    },
  );

  ipcMain.handle(
    IpcChannel.sessionRename,
    (_event, payload: { sessionId: string; name: string }): RenameSessionResult => {
      const sessionId = payload.sessionId.trim();
      const name = payload.name.trim();
      if (!sessionId) return { ok: false, message: '会话尚未绑定，无法重命名' };
      if (!name) return { ok: false, message: '名称不能为空' };
      metaStore.rename(sessionId, name);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionArchive,
    async (_event, payload: { sessionId: string; cwd?: string }): Promise<ArchiveSessionResult> => {
      const sessionId = payload.sessionId.trim();
      if (!sessionId) {
        return { ok: false, message: '缺少会话信息，无法归档' };
      }

      const runningId = sessions.findBySessionId(sessionId);
      if (runningId) {
        sessions.close(runningId);
        const deadline = Date.now() + 3000;
        while (sessions.has(runningId) && Date.now() < deadline) {
          await delay(50);
        }
      }

      const claudeHome = resolveClaudeHome(readConfig());
      let source = '';
      if (payload.cwd) {
        source = path.join(
          claudeHome,
          'projects',
          payload.cwd.replace(/[\\:]/g, '-'),
          `${sessionId}.jsonl`,
        );
      }
      if (!source || !fs.existsSync(source)) {
        const found = await findSessionFile(claudeHome, sessionId);
        if (found) source = found;
      }
      if (!fs.existsSync(source)) {
        return { ok: false, message: '找不到会话记录文件' };
      }

      const sessionInfo = await readSessionInfo(source);
      const resolvedCwd = payload.cwd || sessionInfo.cwd || '';
      const encodedDir = resolvedCwd
        ? resolvedCwd.replace(/[\\:]/g, '-')
        : path.basename(path.dirname(source));
      const archiveDir = path.join(app.getPath('userData'), 'archive', encodedDir);
      const destination = path.join(archiveDir, `${sessionId}.jsonl`);

      try {
        fs.mkdirSync(archiveDir, { recursive: true });
        if (fs.existsSync(destination)) {
          fs.rmSync(destination, { force: true });
        }
        fs.renameSync(source, destination);
      } catch {
        try {
          fs.copyFileSync(source, destination);
          fs.rmSync(source, { force: true });
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }

      metaStore.archive(sessionId, resolvedCwd, destination);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.archiveRestore,
    async (_event, payload: { sessionId: string; cwd?: string }): Promise<RestoreSessionResult> => {
      const sessionId = payload.sessionId.trim();
      if (!sessionId) {
        return { ok: false, message: '缺少会话信息，无法恢复' };
      }
      const claudeHome = resolveClaudeHome(readConfig());
      const meta = metaStore.get(sessionId);
      const source = meta.archivedPath && fs.existsSync(meta.archivedPath)
        ? meta.archivedPath
        : '';
      if (!source) {
        const found = await findSessionFile(claudeHome, sessionId);
        if (found && fs.existsSync(found)) {
          metaStore.restore(sessionId);
          return { ok: true };
        }
        return { ok: false, message: '找不到归档文件' };
      }
      const sessionInfo = await readSessionInfo(source);
      const resolvedCwd = payload.cwd || sessionInfo.cwd || '';
      const encodedDir = resolvedCwd
        ? resolvedCwd.replace(/[\\:]/g, '-')
        : path.basename(path.dirname(source));
      const destinationDir = path.join(claudeHome, 'projects', encodedDir);
      const destination = path.join(destinationDir, `${sessionId}.jsonl`);
      try {
        fs.mkdirSync(destinationDir, { recursive: true });
        if (fs.existsSync(destination)) {
          fs.rmSync(destination, { force: true });
        }
        fs.renameSync(source, destination);
      } catch {
        try {
          fs.copyFileSync(source, destination);
          fs.rmSync(source, { force: true });
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }
      metaStore.restore(sessionId);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionDetail,
    async (_event, sessionId: string): Promise<SessionDetailResult> => {
      const filePath = await locateSessionFile(sessionId);
      if (!filePath) return { sessionId, entries: [] };
      const entries = await readSessionDetail(filePath);
      const info = await readSessionInfo(filePath);
      return { sessionId, title: info.title, cwd: info.cwd, entries };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionExport,
    async (_event, payload: { sessionId: string; cwd?: string }): Promise<ExportResult> => {
      const filePath = await locateSessionFile(payload.sessionId, payload.cwd);
      if (!filePath) return { ok: false, message: '找不到会话记录' };
      const entries = await readSessionDetail(filePath);
      const info = await readSessionInfo(filePath);
      const detail: SessionDetailResult = {
        sessionId: payload.sessionId,
        title: info.title,
        cwd: payload.cwd ?? info.cwd,
        entries,
      };
      const safeTitle = (info.title ?? payload.sessionId).replace(/[\\/:*?"<>|]/g, '_');
      const result = await dialog.showSaveDialog({
        title: '导出 Markdown',
        defaultPath: `${safeTitle}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, message: '已取消' };
      try {
        fs.writeFileSync(result.filePath, buildMarkdown(detail), 'utf8');
        return { ok: true, path: result.filePath };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.uiGetState, (): UiState => readUiState());

  ipcMain.handle(IpcChannel.uiSaveState, (_event, state: UiState): void => {
    writeUiState({
      openSessionIds: Array.isArray(state.openSessionIds) ? state.openSessionIds : [],
      activeSessionId: state.activeSessionId,
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

  ipcMain.handle(
    IpcChannel.sessionReadText,
    async (_event, sessionId: string): Promise<ReadSessionTextResult> => {
      const filePath = await locateSessionFile(sessionId);
      if (!filePath) return { ok: false, text: '', message: '找不到会话记录' };
      const entries = await readChatEntries(filePath);
      const text = entries
        .map((entry) => `${entry.role === 'user' ? 'User' : 'Claude'}:\n${entry.text}`)
        .join('\n\n');
      return { ok: true, text };
    },
  );

  ipcMain.handle(
    IpcChannel.searchQuery,
    async (_event, query: string): Promise<SearchResult[]> =>
      searchSessions(query, metaStore, resolveClaudeHome(readConfig())),
  );

  ipcMain.handle(
    IpcChannel.sessionUsage,
    async (_event, id: string): Promise<SessionUsage> => {
      const info = sessions.getSession(id);
      if (!info?.sessionId || !info.cwd) return emptyUsage();
      const claudeHome = resolveClaudeHome(readConfig());
      const encodedDir = info.cwd.replace(/[\\:]/g, '-');
      const filePath = path.join(
        claudeHome,
        'projects',
        encodedDir,
        `${info.sessionId}.jsonl`,
      );
      if (!fs.existsSync(filePath)) return emptyUsage();
      return readSessionUsage(filePath);
    },
  );

  ipcMain.handle(
    IpcChannel.sessionWrite,
    (_event, payload: { id: string; data: string }): void => {
      sessions.write(payload.id, payload.data);
    },
  );

  ipcMain.handle(
    IpcChannel.sessionResize,
    (_event, payload: { id: string; cols: number; rows: number }): void => {
      sessions.resize(payload.id, payload.cols, payload.rows);
    },
  );

  ipcMain.handle(IpcChannel.sessionClose, (_event, id: string): void => {
    watcher.clearPending(id);
    sessions.close(id);
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function emptyUsage(): SessionUsage {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}
