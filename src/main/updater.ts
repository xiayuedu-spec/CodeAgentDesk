import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IpcChannel } from '../shared/ipc-contract';
import { broadcast } from './window-manager';

export type UpdateStatus =
  | { kind: 'dev'; message: string }
  | { kind: 'checking'; message: string }
  | { kind: 'up-to-date'; message: string }
  | { kind: 'available'; version: string; message: string }
  | { kind: 'downloaded'; version: string; message: string }
  | { kind: 'error'; message: string };

let downloadedVersion: string | null = null;

/** 打包环境下才真正启用自动更新；开发模式返回 dev 状态。 */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    downloadedVersion = null;
    broadcast(IpcChannel.updateStatus, {
      kind: 'available',
      version: info.version,
      message: `发现新版本 v${info.version}`,
    } satisfies UpdateStatus);
    // 发现新版本后自动后台下载。
    void autoUpdater.downloadUpdate();
  });
  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version;
    broadcast(IpcChannel.updateStatus, {
      kind: 'downloaded',
      version: info.version,
      message: `新版本 v${info.version} 已下载，重启后生效`,
    } satisfies UpdateStatus);
  });
  autoUpdater.on('error', (error) => {
    broadcast(IpcChannel.updateStatus, {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies UpdateStatus);
  });
}

/** 检查更新（打包环境）。 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return { kind: 'dev', message: '开发模式不支持自动更新' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo) {
      return { kind: 'up-to-date', message: '已是最新版本' };
    }
    return {
      kind: 'available',
      version: result.updateInfo.version,
      message: `发现新版本 v${result.updateInfo.version}`,
    };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 是否已有下载好的更新。 */
export function hasDownloadedUpdate(): boolean {
  return downloadedVersion !== null;
}

/** 重启并安装已下载的更新。 */
export function installUpdate(): void {
  if (!app.isPackaged || !downloadedVersion) return;
  autoUpdater.quitAndInstall();
}
