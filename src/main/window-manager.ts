import { app, BrowserWindow, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IpcChannel, type IpcChannelName } from '../shared/ipc-contract';

let mainWindow: BrowserWindow | null = null;

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const DEFAULT_WINDOW_STATE: WindowState = { width: 1280, height: 820, maximized: false };

function windowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const parsed = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8')) as Partial<WindowState>;
    if (typeof parsed === 'object' && parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      return {
        x: typeof parsed.x === 'number' ? parsed.x : undefined,
        y: typeof parsed.y === 'number' ? parsed.y : undefined,
        width: parsed.width,
        height: parsed.height,
        maximized: parsed.maximized === true,
      };
    }
  } catch {
    // 无存档或损坏时用默认值。
  }
  return { ...DEFAULT_WINDOW_STATE };
}

function saveWindowState(state: WindowState): void {
  try {
    const file = windowStatePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // 窗口状态保存失败静默忽略。
  }
}

/** 校验保存的窗口位置是否仍落在任一显示器工作区内（分辨率/显示器变化后避免窗口跑出屏幕）。 */
function isVisibleOnSomeDisplay(bounds: { x: number; y: number; width: number; height: number }): boolean {
  return screen.getAllDisplays().some((display) => {
    const wa = display.workArea;
    return (
      bounds.x < wa.x + wa.width &&
      bounds.x + bounds.width > wa.x &&
      bounds.y < wa.y + wa.height &&
      bounds.y + bounds.height > wa.y
    );
  });
}

export function createMainWindow(): BrowserWindow {
  const saved = loadWindowState();
  const options: Electron.BrowserWindowConstructorOptions = {
    width: saved.width,
    height: saved.height,
    minWidth: 960,
    minHeight: 600,
    title: 'CodeAgentDesk',
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'default',
    backgroundColor: '#0e1014',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (saved.x !== undefined && saved.y !== undefined) {
    const candidate = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
    if (isVisibleOnSomeDisplay(candidate)) {
      options.x = saved.x;
      options.y = saved.y;
    }
  }

  const window = new BrowserWindow(options);
  if (saved.maximized) window.maximize();

  mainWindow = window;

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistWindowState, 300);
  };
  const persistWindowState = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // getNormalBounds 返回非最大化/最小化时的几何信息，最大化时保存恢复尺寸。
    const bounds = mainWindow.getNormalBounds();
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: mainWindow.isMaximized(),
    });
  };

  window.on('resize', scheduleSave);
  window.on('move', scheduleSave);
  window.on('maximize', () => {
    broadcast(IpcChannel.windowMaximizedChanged, true);
    scheduleSave();
  });
  window.on('unmaximize', () => {
    broadcast(IpcChannel.windowMaximizedChanged, false);
    scheduleSave();
  });
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
