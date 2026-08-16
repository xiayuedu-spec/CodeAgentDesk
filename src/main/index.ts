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
import { startUsageWarning } from './usage-warning';
import { setupAutoUpdater } from './updater';
import { broadcast, createMainWindow } from './window-manager';

// Windows 通知/任务栏分组需要显式设置 AppUserModelID（与 electron-builder appId 一致）。
app.setAppUserModelId('com.codeagentdesk.app');

/** 长时间会话自然结束后弹"任务完成"通知的时长门槛（3 分钟）。 */
const TASK_DONE_MIN_MS = 3 * 60_000;

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

function focusMainWindow(): void {
  const [window] = BrowserWindow.getAllWindows();
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
}

function showSystemNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  notification.on('click', focusMainWindow);
  notification.show();
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
      onExit: (id, exitCode, sessionId, cwd, expected, durationMs) => {
        broadcast(IpcChannel.sessionExited, { id, exitCode } satisfies SessionExitedEvent);
        const sessionName =
          metaStore.get(sessionId ?? '')?.customName ?? (cwd ? path.basename(cwd) : '会话');
        // 仅"意外异常退出"发系统通知；主动关闭（关标签/归档/退出应用）与正常结束（/exit）不打扰。
        if (!expected && typeof exitCode === 'number' && exitCode !== 0) {
          showSystemNotification(
            `CodeAgentDesk · ${sessionName}`,
            `会话已异常退出（代码 ${exitCode}）`,
          );
        }
        // 长时间会话自然结束（运行 ≥ 3 分钟、退出码 0）且窗口不在前台时，提示任务已完成。
        const appFocused = BrowserWindow.getAllWindows().some((window) => window.isFocused());
        if (
          typeof exitCode === 'number' &&
          exitCode === 0 &&
          (durationMs ?? 0) >= TASK_DONE_MIN_MS &&
          !appFocused
        ) {
          const minutes = Math.round((durationMs ?? 0) / 60000);
          showSystemNotification(
            `CodeAgentDesk · ${sessionName}`,
            `会话已结束，运行了 ${minutes} 分钟`,
          );
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
    startUsageWarning(metaStore);
    setupAutoUpdater();

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
