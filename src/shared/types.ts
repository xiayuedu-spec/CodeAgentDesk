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

export type ThemeName = 'default' | 'mac' | 'green' | 'sepia' | 'amber' | 'mist' | 'neon';

/** 会话状态显示方式：表情图标 / 颜色圆点。 */
export type AgentStatusStyle = 'emoji' | 'dot';

export interface AppConfig {
  claudeDir?: string;
  theme?: ThemeName;
  tokenLimitPerHour?: number;
  agentStatusStyle?: AgentStatusStyle;
  /** 彩蛋：是否已解锁隐藏主题（霓虹）。 */
  funUnlockedNeon?: boolean;
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
  pinned?: boolean;
  pinnedAt?: string;
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

export interface SearchContextLine {
  line: number;
  text: string;
  role: 'user' | 'assistant';
}

export interface SearchHit {
  line: number;
  snippet: string;
  role: 'user' | 'assistant';
  /** 内联预览：命中行 + 前后各若干行（含命中行，hitIndex 指向命中行）。 */
  context?: SearchContextLine[];
  hitIndex?: number;
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

export interface UsageTrendDay {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface HourlyUsage {
  hour: number;
  tokens: number;
}

export interface RenameSessionResult {
  ok: boolean;
  message?: string;
}

export interface SessionOpResult {
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
  weeks: SummaryMeta[];
  months: SummaryMeta[];
}

export interface SummaryGetResult {
  ok: boolean;
  text?: string;
  message?: string;
}

export interface KnowledgeItem {
  key: string;
  updatedAt: string;
  preview: string;
}

export interface KnowledgeExportResult {
  ok: boolean;
  path?: string;
  message?: string;
}

export interface DashboardStats {
  runningCount: number;
  todaySessionCount: number;
  todayTokens: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  /** 累计输出 token（全部会话，供电子宠物树成长）。 */
  totalOutputTokens: number;
  todayProjects: { cwd: string; count: number }[];
  knowledgeCount: number;
  hasTodaySummary: boolean;
  hourlyTokens: number;
  hourlyLimit: number;
  hourlyPercent: number;
}

/** 效率洞察：单个会话的时长与产出/成本。 */
export interface EfficiencySessionStat {
  sessionId: string;
  customName?: string;
  cwd: string;
  /** 活跃时长（按事件时间戳累计，间隔 ≤ 5 分钟视为活跃；无时间戳时回退到会话跨度）。 */
  durationMs: number;
  outputTokens: number;
  totalTokens: number;
}

export interface EfficiencyDayStat {
  date: string;
  durationMs: number;
  sessionCount: number;
}

/** 效率洞察：指定周（周一起）的 agent 投入时间与产出/成本统计。 */
export interface EfficiencyInsights {
  weekStart: string;
  weekEnd: string;
  sessionCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  prevTotalDurationMs: number;
  outputTokens: number;
  totalTokens: number;
  daily: EfficiencyDayStat[];
  topSessions: EfficiencySessionStat[];
}

/** 成就徽章：由真实使用数据解锁。 */
export interface AchievementBadge {
  id: string;
  icon: string;
  label: string;
  desc: string;
  unlocked: boolean;
}

/** 项目性格标签：按会话时长/输出占比自动归纳。 */
export interface ProjectPersonality {
  cwd: string;
  label: string;
  desc: string;
}

/** 趣味数据：成就徽章 + 项目性格。 */
export interface FunStats {
  achievements: AchievementBadge[];
  personalities: ProjectPersonality[];
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
  setTokenLimit(limit: number): Promise<ClaudeConfigInfo>;
  setAgentStatusStyle(style: AgentStatusStyle): Promise<ClaudeConfigInfo>;
  pickClaudeDir(): Promise<PickClaudeDirResult>;
  listSessions(): Promise<SessionRecord[]>;
  listGroups(): Promise<GroupRecord[]>;
  createGroup(name: string): Promise<GroupRecord>;
  renameGroup(id: string, name: string): Promise<GroupOpResult>;
  deleteGroup(id: string): Promise<GroupOpResult>;
  setGroupColor(id: string, color: string): Promise<GroupOpResult>;
  setSessionGroup(sessionId: string, groupId: string | null): Promise<GroupOpResult>;
  setSessionPinned(sessionId: string, pinned: boolean): Promise<SessionOpResult>;
  openWorkingDirectory(cwd: string): Promise<SessionOpResult>;
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
  summarizeWeek(weekStart?: string): Promise<DaySummarizeResult>;
  summarizeMonth(month?: string): Promise<DaySummarizeResult>;
  summariesList(): Promise<SummaryHistoryResult>;
  summariesGet(kind: 'day' | 'week' | 'month', key: string): Promise<SummaryGetResult>;
  saveSummaryText(
    kind: 'day' | 'week' | 'month',
    key: string,
    text: string,
  ): Promise<SummaryGetResult>;
  generateKnowledge(cwd: string, force?: boolean): Promise<SummaryGetResult>;
  listKnowledge(): Promise<KnowledgeItem[]>;
  getKnowledge(key: string): Promise<SummaryGetResult>;
  saveKnowledge(key: string, text: string): Promise<SummaryGetResult>;
  exportKnowledge(cwd: string): Promise<KnowledgeExportResult>;
  getDashboardStats(): Promise<DashboardStats>;
  getEfficiencyInsights(weekStart?: string): Promise<EfficiencyInsights>;
  getFunStats(): Promise<FunStats>;
  unlockNeon(): Promise<ClaudeConfigInfo>;
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
  getUsageTrend(days: number): Promise<UsageTrendDay[]>;
  getHourlyUsageToday(): Promise<HourlyUsage[]>;
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
