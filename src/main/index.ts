import { app, BrowserWindow, Notification } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  SessionBoundEvent,
  SessionDataEvent,
  SessionErrorEvent,
  SessionExitedEvent,
} from '../shared/types';
import { registerIpcHandlers } from './ipc';
import { readConfig, resolveClaudeHome } from './config';
import { GroupStore } from './group-store';
import { SessionManager } from './session-manager';
import { SessionMetaStore } from './session-meta-store';
import { SessionWatcher } from './session-watcher';
import { broadcast, createMainWindow } from './window-manager';

// Windows 通知/任务栏分组需要显式设置 AppUserModelID（与 electron-builder appId 一致）。
app.setAppUserModelId('com.codeagentdesk.app');

/** 主进程未捕获异常写入 userData/error.log，便于排查启动与运行期问题。 */
function logMainError(kind: string, error: unknown): void {
  try {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    const line = `[${new Date().toISOString()}] ${kind}: ${message}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'error.log'), line);
  } catch {
    // 日志写入失败静默忽略。
  }
}

process.on('uncaughtException', (error) => logMainError('uncaughtException', error));
process.on('unhandledRejection', (reason) => logMainError('unhandledRejection', reason));

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
        // 系统通知：会话结束 / 异常退出（点击聚焦窗口）。
        if (Notification.isSupported()) {
          const name = cwd ? path.basename(cwd) : '会话';
          const abnormal = typeof exitCode === 'number' && exitCode !== 0;
          const notification = new Notification({
            title: `CodeAgentDesk · ${name}`,
            body: abnormal ? `会话已异常退出（代码 ${exitCode}）` : '会话运行结束',
          });
          notification.on('click', () => {
            const [window] = BrowserWindow.getAllWindows();
            if (window) {
              if (window.isMinimized()) window.restore();
              window.focus();
            }
          });
          notification.show();
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
    const groups = GroupStore.create();
    const initialClaudeHome = resolveClaudeHome(readConfig());

    registerIpcHandlers(sessions, watcher, metaStore, groups, () => {
      watcher.restart(resolveClaudeHome(readConfig()));
    });
    createMainWindow();
    watcher.start(initialClaudeHome);

    app.on('before-quit', () => {
      // 退出前终止所有 pty 会话，避免 claude 进程残留。
      sessions.closeAll();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
