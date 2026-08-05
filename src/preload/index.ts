import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppInfo,
  ArchiveSessionResult,
  ClaudeConfigInfo,
  CodeAgentDeskApi,
  CreateSessionResult,
  ExportResult,
  PickDirectoryResult,
  PickClaudeDirResult,
  ReadSessionTextResult,
  RenameSessionResult,
  RestoreSessionResult,
  ResumeSessionResult,
  SessionBoundEvent,
  SessionDataEvent,
  SessionDetailResult,
  SessionErrorEvent,
  SessionExitedEvent,
  SessionRecord,
  SearchResult,
  SessionUsage,
  UiState,
} from '../shared/types';

// Keep in sync with IpcChannel in src/shared/ipc-contract.ts.
const CHANNELS = {
  appGetInfo: 'app:get-info',
  configGet: 'config:get',
  configSetClaudeDir: 'config:set-claude-dir',
  configPickClaudeDir: 'config:pick-claude-dir',
  sessionsList: 'sessions:list',
  sessionPickDirectory: 'session:pick-directory',
  sessionCreate: 'session:create',
  sessionResume: 'session:resume',
  sessionRename: 'session:rename',
  sessionArchive: 'session:archive',
  archiveRestore: 'archive:restore',
  sessionDetail: 'session:detail',
  sessionExport: 'session:export',
  sessionReadText: 'session:read-text',
  uiGetState: 'ui:get-state',
  uiSaveState: 'ui:save-state',
  sessionUsage: 'session:usage',
  searchQuery: 'search:query',
  sessionWrite: 'session:write',
  sessionResize: 'session:resize',
  sessionClose: 'session:close',
  sessionData: 'session:data',
  sessionExited: 'session:exited',
  sessionBound: 'session:bound',
  sessionError: 'session:error',
} as const;

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: CodeAgentDeskApi = {
  getAppInfo: () => ipcRenderer.invoke(CHANNELS.appGetInfo) as Promise<AppInfo>,
  getClaudeConfig: () => ipcRenderer.invoke(CHANNELS.configGet) as Promise<ClaudeConfigInfo>,
  setClaudeDir: (dir) =>
    ipcRenderer.invoke(CHANNELS.configSetClaudeDir, dir) as Promise<ClaudeConfigInfo>,
  pickClaudeDir: () =>
    ipcRenderer.invoke(CHANNELS.configPickClaudeDir) as Promise<PickClaudeDirResult>,
  listSessions: () => ipcRenderer.invoke(CHANNELS.sessionsList) as Promise<SessionRecord[]>,
  pickDirectory: () =>
    ipcRenderer.invoke(CHANNELS.sessionPickDirectory) as Promise<PickDirectoryResult>,
  createSession: (cwd) =>
    ipcRenderer.invoke(CHANNELS.sessionCreate, cwd) as Promise<CreateSessionResult>,
  resumeSession: (sessionId, cwd) =>
    ipcRenderer.invoke(CHANNELS.sessionResume, { sessionId, cwd }) as Promise<ResumeSessionResult>,
  renameSession: (sessionId, name) =>
    ipcRenderer.invoke(CHANNELS.sessionRename, { sessionId, name }) as Promise<RenameSessionResult>,
  archiveSession: (sessionId, cwd) =>
    ipcRenderer.invoke(CHANNELS.sessionArchive, { sessionId, cwd }) as Promise<ArchiveSessionResult>,
  restoreArchivedSession: (sessionId, cwd) =>
    ipcRenderer.invoke(CHANNELS.archiveRestore, { sessionId, cwd }) as Promise<RestoreSessionResult>,
  readSessionDetail: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.sessionDetail, sessionId) as Promise<SessionDetailResult>,
  exportSessionMarkdown: (sessionId, cwd) =>
    ipcRenderer.invoke(CHANNELS.sessionExport, { sessionId, cwd }) as Promise<ExportResult>,
  readSessionText: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.sessionReadText, sessionId) as Promise<ReadSessionTextResult>,
  getUiState: () => ipcRenderer.invoke(CHANNELS.uiGetState) as Promise<UiState>,
  saveUiState: (state) => ipcRenderer.invoke(CHANNELS.uiSaveState, state) as Promise<void>,
  getSessionUsage: (id) =>
    ipcRenderer.invoke(CHANNELS.sessionUsage, id) as Promise<SessionUsage>,
  searchSessions: (query) =>
    ipcRenderer.invoke(CHANNELS.searchQuery, query) as Promise<SearchResult[]>,
  writeSession: (id, data) =>
    ipcRenderer.invoke(CHANNELS.sessionWrite, { id, data }) as Promise<void>,
  resizeSession: (id, cols, rows) =>
    ipcRenderer.invoke(CHANNELS.sessionResize, { id, cols, rows }) as Promise<void>,
  closeSession: (id) => ipcRenderer.invoke(CHANNELS.sessionClose, id) as Promise<void>,
  onSessionData: (callback) => subscribe<SessionDataEvent>(CHANNELS.sessionData, callback),
  onSessionExited: (callback) => subscribe<SessionExitedEvent>(CHANNELS.sessionExited, callback),
  onSessionBound: (callback) => subscribe<SessionBoundEvent>(CHANNELS.sessionBound, callback),
  onSessionError: (callback) => subscribe<SessionErrorEvent>(CHANNELS.sessionError, callback),
};

contextBridge.exposeInMainWorld('codeagentdesk', api);
