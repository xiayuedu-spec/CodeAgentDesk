export interface AppInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
  userDataPath: string;
  startedAt: string;
}

/** 新建分组时按顺序循环取用的颜色。 */
export const GROUP_COLORS = [
  '#34d3c0',
  '#4f8cff',
  '#e0a64e',
  '#2e8b57',
  '#c96f4a',
  '#8b7cf6',
  '#e25f8a',
  '#58a0a8',
] as const;

export interface GroupRecord {
  id: string;
  name: string;
  color: string;
}

export interface GroupOpResult {
  ok: boolean;
  message?: string;
}

export type ThemeName = 'default' | 'mac' | 'green' | 'sepia' | 'amber' | 'mist';

export interface AppConfig {
  claudeDir?: string;
  theme?: ThemeName;
}

export interface ClaudeConfigInfo {
  config: AppConfig;
  resolvedClaudeDir: string;
}

export interface PickClaudeDirResult {
  dir: string | null;
}

export interface PickDirectoryResult {
  cwd: string | null;
}

export interface CreateSessionResult {
  id: string;
  cwd: string;
  sequence: number;
}

export interface ResumeSessionResult {
  id: string;
  cwd: string;
  sequence: number;
}

export interface SessionRecord {
  sessionId: string;
  cwd: string;
  filePath: string;
  archived: boolean;
  archivedAt?: string;
  customName?: string;
  summary?: string;
  tags?: string[];
  group?: string;
  startedAt: string;
  updatedAt: string;
}

export interface ChatEntry {
  role: 'user' | 'assistant';
  text: string;
}

export interface SessionDetailEntry {
  role: 'user' | 'assistant' | 'tool';
  text?: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
}

export interface SessionDetailResult {
  sessionId: string;
  title?: string;
  cwd?: string;
  entries: SessionDetailEntry[];
}

export interface ExportResult {
  ok: boolean;
  path?: string;
  message?: string;
}

export interface UiState {
  openSessionIds: string[];
  activeSessionId?: string;
  collapsedGroups?: string[];
  collapsedSections?: string[];
}

export interface RestoreSessionResult {
  ok: boolean;
  message?: string;
}

export interface ReadSessionTextResult {
  ok: boolean;
  text: string;
  message?: string;
}

export interface SearchHit {
  line: number;
  snippet: string;
  role: 'user' | 'assistant';
}

export interface SearchResult {
  sessionId: string;
  cwd: string;
  archived: boolean;
  customName?: string;
  hits: SearchHit[];
}

export interface SessionUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface RenameSessionResult {
  ok: boolean;
  message?: string;
}

export interface SummarizeSessionResult {
  ok: boolean;
  summary?: string;
  tags?: string[];
  message?: string;
}

export interface DaySummarizeResult {
  ok: boolean;
  text?: string;
  message?: string;
}

export interface SummaryMeta {
  key: string;
  preview: string;
}

export interface SummaryHistoryResult {
  days: SummaryMeta[];
  months: SummaryMeta[];
}

export interface SummaryGetResult {
  ok: boolean;
  text?: string;
  message?: string;
}

export interface ArchiveSessionResult {
  ok: boolean;
  message?: string;
}

export interface DeleteSessionsResult {
  ok: boolean;
  deleted?: string[];
  message?: string;
}

export interface SessionDataEvent {
  id: string;
  data: string;
}

export interface SessionExitedEvent {
  id: string;
  exitCode?: number;
}

export interface SessionBoundEvent {
  id: string;
  sessionId: string;
}

export interface SessionErrorEvent {
  id: string;
  message: string;
}

export interface CodeAgentDeskApi {
  getPathForFile(file: File): string;
  getAppInfo(): Promise<AppInfo>;
  getClaudeConfig(): Promise<ClaudeConfigInfo>;
  setClaudeDir(dir: string | null): Promise<ClaudeConfigInfo>;
  setTheme(theme: ThemeName): Promise<ClaudeConfigInfo>;
  pickClaudeDir(): Promise<PickClaudeDirResult>;
  listSessions(): Promise<SessionRecord[]>;
  listGroups(): Promise<GroupRecord[]>;
  createGroup(name: string): Promise<GroupRecord>;
  renameGroup(id: string, name: string): Promise<GroupOpResult>;
  deleteGroup(id: string): Promise<GroupOpResult>;
  setGroupColor(id: string, color: string): Promise<GroupOpResult>;
  setSessionGroup(sessionId: string, groupId: string | null): Promise<GroupOpResult>;
  deleteSessions(sessionIds: string[]): Promise<DeleteSessionsResult>;
  getRecentDirs(): Promise<string[]>;
  pickDirectory(): Promise<PickDirectoryResult>;
  createSession(cwd: string): Promise<CreateSessionResult>;
  resumeSession(sessionId: string, cwd: string): Promise<ResumeSessionResult>;
  renameSession(sessionId: string, name: string): Promise<RenameSessionResult>;
  archiveSession(sessionId: string, cwd: string): Promise<ArchiveSessionResult>;
  restoreArchivedSession(sessionId: string, cwd: string): Promise<RestoreSessionResult>;
  readSessionDetail(sessionId: string): Promise<SessionDetailResult>;
  summarizeSession(sessionId: string): Promise<SummarizeSessionResult>;
  summarizeDay(date?: string): Promise<DaySummarizeResult>;
  summarizeMonth(month?: string): Promise<DaySummarizeResult>;
  summariesList(): Promise<SummaryHistoryResult>;
  summariesGet(kind: 'day' | 'month', key: string): Promise<SummaryGetResult>;
  exportSessionMarkdown(sessionId: string, cwd?: string): Promise<ExportResult>;
  readSessionText(sessionId: string): Promise<ReadSessionTextResult>;
  getUiState(): Promise<UiState>;
  saveUiState(state: UiState): Promise<void>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<boolean>;
  isWindowMaximized(): Promise<boolean>;
  closeWindow(): Promise<void>;
  setWindowBackgroundColor(color: string): Promise<void>;
  onWindowMaximizedChanged(callback: (maximized: boolean) => void): () => void;
  getSessionUsage(id: string): Promise<SessionUsage>;
  searchSessions(query: string): Promise<SearchResult[]>;
  writeSession(id: string, data: string): Promise<void>;
  resizeSession(id: string, cols: number, rows: number): Promise<void>;
  closeSession(id: string): Promise<void>;
  onSessionData(callback: (event: SessionDataEvent) => void): () => void;
  onSessionExited(callback: (event: SessionExitedEvent) => void): () => void;
  onSessionBound(callback: (event: SessionBoundEvent) => void): () => void;
  onSessionError(callback: (event: SessionErrorEvent) => void): () => void;
  onSessionsChanged(callback: () => void): () => void;
}
