import { app, BrowserWindow } from 'electron';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  SessionBoundEvent,
  SessionDataEvent,
  SessionErrorEvent,
  SessionExitedEvent,
} from '../shared/types';
import { registerIpcHandlers } from './ipc';
import { readConfig, resolveClaudeHome } from './config';
import { SessionManager } from './session-manager';
import { SessionMetaStore } from './session-meta-store';
import { SessionWatcher } from './session-watcher';
import { maybeAutoSummarize } from './summarize';
import { broadcast, createMainWindow } from './window-manager';

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  void app.whenReady().then(() => {
    const metaStore = SessionMetaStore.create();
    const sessions = new SessionManager({
      onData: (id, data) =>
        broadcast(IpcChannel.sessionData, { id, data } satisfies SessionDataEvent),
      onExit: (id, exitCode, sessionId, cwd) => {
        broadcast(IpcChannel.sessionExited, { id, exitCode } satisfies SessionExitedEvent);
        // 会话结束后自动生成摘要（已有则跳过；等待文件落盘）
        if (sessionId && cwd && readConfig().autoSummarize) {
          setTimeout(() => {
            void maybeAutoSummarize(sessionId, cwd, metaStore).catch(() => {
              // 自动摘要失败静默忽略。
            });
          }, 2000);
        }
      },
      onBound: (id, sessionId) =>
        broadcast(IpcChannel.sessionBound, { id, sessionId } satisfies SessionBoundEvent),
      onError: (id, message) =>
        broadcast(IpcChannel.sessionError, { id, message } satisfies SessionErrorEvent),
    });
    const watcher = new SessionWatcher(sessions, () => {
      broadcast(IpcChannel.sessionsChanged, undefined);
    });
    const initialClaudeHome = resolveClaudeHome(readConfig());

    registerIpcHandlers(sessions, watcher, metaStore, () => {
      watcher.restart(resolveClaudeHome(readConfig()));
    });
    createMainWindow();
    watcher.start(initialClaudeHome);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
