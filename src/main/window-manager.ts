import { BrowserWindow } from 'electron';
import path from 'node:path';
import type { IpcChannelName } from '../shared/ipc-contract';

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'CodeAgentDesk',
    backgroundColor: '#0e1014',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  window.on('closed', () => {
    mainWindow = null;
  });
  window.once('ready-to-show', () => window.show());

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return window;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function broadcast(channel: IpcChannelName, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}
