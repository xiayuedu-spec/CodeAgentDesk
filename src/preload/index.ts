import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  AppInfo,
  ArchiveSessionResult,
  ClaudeConfigInfo,
  CodeAgentDeskApi,
  CreateSessionResult,
  DeleteSessionsResult,
  ExportResult,
  GroupOpResult,
  HourlyUsage,
  GroupRecord,
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
  SessionOpResult,
  KnowledgeExportResult,
  DashboardStats,
  EfficiencyInsights,
  FunStats,
  KnowledgeItem,
  UsageTrendDay,
  SummarizeSessionResult,
  DaySummarizeResult,
  SummaryHistoryResult,
  SummaryGetResult,
  ThemeName,
  UiState,
} from '../shared/types';

// Keep in sync with IpcChannel in src/shared/ipc-contract.ts.
const CHANNELS = {
  appGetInfo: 'app:get-info',
  configGet: 'config:get',
  configSetClaudeDir: 'config:set-claude-dir',
  configSetTheme: 'config:set-theme',
  configSetTokenLimit: 'config:set-token-limit',
  configPickClaudeDir: 'config:pick-claude-dir',
  sessionsList: 'sessions:list',
  sessionsChanged: 'sessions:changed',
  recentDirsGet: 'recent-dirs:get',
  groupsList: 'groups:list',
  groupsCreate: 'groups:create',
  groupsRename: 'groups:rename',
  groupsDelete: 'groups:delete',
  groupsSetColor: 'groups:set-color',
  sessionSetGroup: 'session:set-group',
  sessionSetPinned: 'session:set-pinned',
  sessionOpenCwd: 'session:open-cwd',
  sessionPickDirectory: 'session:pick-directory',
  sessionCreate: 'session:create',
  sessionResume: 'session:resume',
  sessionRename: 'session:rename',
  sessionArchive: 'session:archive',
  sessionDelete: 'session:delete',
  archiveRestore: 'archive:restore',
  sessionDetail: 'session:detail',
  sessionSummarize: 'session:summarize',
  daySummarize: 'day:summarize',
  weekSummarize: 'week:summarize',
  monthSummarize: 'month:summarize',
  summariesList: 'summaries:list',
  summariesGet: 'summaries:get',
  summarySave: 'summary:save',
  knowledgeGenerate: 'knowledge:generate',
  knowledgeList: 'knowledge:list',
  knowledgeGet: 'knowledge:get',
  knowledgeSave: 'knowledge:save',
  knowledgeExport: 'knowledge:export',
  dashboardStats: 'dashboard:stats',
  efficiencyInsights: 'efficiency:insights',
  funStats: 'fun:stats',
  funUnlockNeon: 'fun:unlock-neon',
  sessionExport: 'session:export',
  sessionReadText: 'session:read-text',
  uiGetState: 'ui:get-state',
  uiSaveState: 'ui:save-state',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowIsMaximized: 'window:is-maximized',
  windowClose: 'window:close',
  windowSetBackgroundColor: 'window:set-background-color',
  windowMaximizedChanged: 'window:maximized-changed',
  sessionUsage: 'session:usage',
  usageTrend: 'usage:trend',
  usageHourly: 'usage:hourly',
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
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getAppInfo: () => ipcRenderer.invoke(CHANNELS.appGetInfo) as Promise<AppInfo>,
  getClaudeConfig: () => ipcRenderer.invoke(CHANNELS.configGet) as Promise<ClaudeConfigInfo>,
  setClaudeDir: (dir) =>
    ipcRenderer.invoke(CHANNELS.configSetClaudeDir, dir) as Promise<ClaudeConfigInfo>,
  setTheme: (theme) =>
    ipcRenderer.invoke(CHANNELS.configSetTheme, theme) as Promise<ClaudeConfigInfo>,
  setTokenLimit: (limit) =>
    ipcRenderer.invoke(CHANNELS.configSetTokenLimit, limit) as Promise<ClaudeConfigInfo>,
  pickClaudeDir: () =>
    ipcRenderer.invoke(CHANNELS.configPickClaudeDir) as Promise<PickClaudeDirResult>,
  listSessions: () => ipcRenderer.invoke(CHANNELS.sessionsList) as Promise<SessionRecord[]>,
  listGroups: () => ipcRenderer.invoke(CHANNELS.groupsList) as Promise<GroupRecord[]>,
  createGroup: (name) =>
    ipcRenderer.invoke(CHANNELS.groupsCreate, name) as Promise<GroupRecord>,
  renameGroup: (id, name) =>
    ipcRenderer.invoke(CHANNELS.groupsRename, { id, name }) as Promise<GroupOpResult>,
  deleteGroup: (id) => ipcRenderer.invoke(CHANNELS.groupsDelete, id) as Promise<GroupOpResult>,
  setGroupColor: (id, color) =>
    ipcRenderer.invoke(CHANNELS.groupsSetColor, { id, color }) as Promise<GroupOpResult>,
  setSessionGroup: (sessionId, groupId) =>
    ipcRenderer.invoke(CHANNELS.sessionSetGroup, { sessionId, groupId }) as Promise<GroupOpResult>,
  setSessionPinned: (sessionId, pinned) =>
    ipcRenderer.invoke(CHANNELS.sessionSetPinned, { sessionId, pinned }) as Promise<SessionOpResult>,
  openWorkingDirectory: (cwd) =>
    ipcRenderer.invoke(CHANNELS.sessionOpenCwd, cwd) as Promise<SessionOpResult>,
  getRecentDirs: () => ipcRenderer.invoke(CHANNELS.recentDirsGet) as Promise<string[]>,
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
  deleteSessions: (sessionIds) =>
    ipcRenderer.invoke(CHANNELS.sessionDelete, { sessionIds }) as Promise<DeleteSessionsResult>,
  restoreArchivedSession: (sessionId, cwd) =>
    ipcRenderer.invoke(CHANNELS.archiveRestore, { sessionId, cwd }) as Promise<RestoreSessionResult>,
  readSessionDetail: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.sessionDetail, sessionId) as Promise<SessionDetailResult>,
  summarizeSession: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.sessionSummarize, sessionId) as Promise<SummarizeSessionResult>,
  summarizeDay: (date?: string) =>
    ipcRenderer.invoke(CHANNELS.daySummarize, date) as Promise<DaySummarizeResult>,
  summarizeWeek: (weekStart?: string) =>
    ipcRenderer.invoke(CHANNELS.weekSummarize, weekStart) as Promise<DaySummarizeResult>,
  summarizeMonth: (month) =>
    ipcRenderer.invoke(CHANNELS.monthSummarize, month) as Promise<DaySummarizeResult>,
  summariesList: () => ipcRenderer.invoke(CHANNELS.summariesList) as Promise<SummaryHistoryResult>,
  summariesGet: (kind, key) =>
    ipcRenderer.invoke(CHANNELS.summariesGet, { kind, key }) as Promise<SummaryGetResult>,
  saveSummaryText: (kind, key, text) =>
    ipcRenderer.invoke(CHANNELS.summarySave, { kind, key, text }) as Promise<SummaryGetResult>,
  generateKnowledge: (cwd, force) =>
    ipcRenderer.invoke(CHANNELS.knowledgeGenerate, cwd, force) as Promise<SummaryGetResult>,
  exportKnowledge: (cwd) =>
    ipcRenderer.invoke(CHANNELS.knowledgeExport, cwd) as Promise<KnowledgeExportResult>,
  getDashboardStats: () =>
    ipcRenderer.invoke(CHANNELS.dashboardStats) as Promise<DashboardStats>,
  getEfficiencyInsights: (weekStart) =>
    ipcRenderer.invoke(CHANNELS.efficiencyInsights, weekStart) as Promise<EfficiencyInsights>,
  getFunStats: () => ipcRenderer.invoke(CHANNELS.funStats) as Promise<FunStats>,
  unlockNeon: () => ipcRenderer.invoke(CHANNELS.funUnlockNeon) as Promise<ClaudeConfigInfo>,
  listKnowledge: () => ipcRenderer.invoke(CHANNELS.knowledgeList) as Promise<KnowledgeItem[]>,
  getKnowledge: (key) =>
    ipcRenderer.invoke(CHANNELS.knowledgeGet, key) as Promise<SummaryGetResult>,
  saveKnowledge: (key, text) =>
    ipcRenderer.invoke(CHANNELS.knowledgeSave, { key, text }) as Promise<SummaryGetResult>,
  exportSessionMarkdown: (sessionId, cwd) =>
    ipcRenderer.invoke(CHANNELS.sessionExport, { sessionId, cwd }) as Promise<ExportResult>,
  readSessionText: (sessionId) =>
    ipcRenderer.invoke(CHANNELS.sessionReadText, sessionId) as Promise<ReadSessionTextResult>,
  getUiState: () => ipcRenderer.invoke(CHANNELS.uiGetState) as Promise<UiState>,
  saveUiState: (state) => ipcRenderer.invoke(CHANNELS.uiSaveState, state) as Promise<void>,
  minimizeWindow: () => ipcRenderer.invoke(CHANNELS.windowMinimize) as Promise<void>,
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(CHANNELS.windowToggleMaximize) as Promise<boolean>,
  isWindowMaximized: () => ipcRenderer.invoke(CHANNELS.windowIsMaximized) as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke(CHANNELS.windowClose) as Promise<void>,
  setWindowBackgroundColor: (color) =>
    ipcRenderer.invoke(CHANNELS.windowSetBackgroundColor, color) as Promise<void>,
  onWindowMaximizedChanged: (callback) =>
    subscribe<boolean>(CHANNELS.windowMaximizedChanged, callback),
  getSessionUsage: (id) =>
    ipcRenderer.invoke(CHANNELS.sessionUsage, id) as Promise<SessionUsage>,
  getUsageTrend: (days) =>
    ipcRenderer.invoke(CHANNELS.usageTrend, days) as Promise<UsageTrendDay[]>,
  getHourlyUsageToday: () =>
    ipcRenderer.invoke(CHANNELS.usageHourly) as Promise<HourlyUsage[]>,
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
  onSessionsChanged: (callback) => subscribe<void>(CHANNELS.sessionsChanged, callback),
};

contextBridge.exposeInMainWorld('codeagentdesk', api);
