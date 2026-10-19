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

export type ThemeName =
  | 'default'
  | 'mac'
  | 'green'
  | 'sepia'
  | 'amber'
  | 'mist'
  | 'warm'
  | 'claude'
  | 'neon'
  | 'term';

/** 会话状态显示方式：表情图标 / 单色图标 / 颜色圆点。 */
export type AgentStatusStyle = 'emoji' | 'icon' | 'dot';

export interface AppConfig {
  claudeDir?: string;
  theme?: ThemeName;
  tokenLimitPerHour?: number;
  /** 番茄钟时长（分钟，默认 25）。 */
  pomodoroMinutes?: number;
  /** 终端字号（px，10-20，默认 13）。 */
  terminalFontSize?: number;
  /** 终端字体族（默认 Cascadia Mono 系列）。 */
  terminalFontFamily?: string;
  /** 是否显示 Token 统计（每小时用量/实时用量/限额预警）。默认关闭。 */
  showTokenStats?: boolean;
  agentStatusStyle?: AgentStatusStyle;
  /** 彩蛋：是否已解锁隐藏主题（霓虹）。 */
  funUnlockedNeon?: boolean;
  /** 彩蛋：已解锁的隐藏主题列表（霓虹 / 终端）。 */
  funUnlockedThemes?: string[];
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

/** 会话计划（Claude Code 的 TodoWrite 末次快照）。 */
export interface SessionTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface SessionPlan {
  todos: SessionTodo[];
  /** 最后一次计划的更新时间（记录里的 timestamp）。 */
  updatedAt?: string;
  /** 计划快照次数（TodoWrite 调用次数），用于判断"计划改过几轮"。 */
  updates: number;
}

/** 一处改动片段（来自会话记录里的 Edit/Write 调用，不是工作区实际 diff）。 */
export interface SessionChangeHunk {
  kind: 'edit' | 'write';
  oldText: string;
  newText: string;
  /** 片段被截断（原文更长）。 */
  truncated?: boolean;
}

export interface SessionFileChange {
  path: string;
  /** 该文件在会话里被改动的次数。 */
  edits: number;
  added: number;
  removed: number;
  /** 整文件写入（Write）。 */
  written?: boolean;
  hunks: SessionChangeHunk[];
  /** 超出展示上限、未收录的片段数。 */
  hiddenHunks: number;
}

/** 会话痕迹：不需要读 token 的行为统计（右栏用）。 */
export interface SessionStats {
  /** 真实人类轮次（含文本的 user 消息，不含纯 tool_result）。 */
  turns: number;
  /** 工具调用次数（tool_use 块）。 */
  toolCalls: number;
  /** 失败的 tool_result 数（is_error）。 */
  errors: number;
  startedAt?: string;
  lastAt?: string;
  /** 活跃时长：相邻事件间隔 ≤5 分钟的累加（与效率洞察同口径）。 */
  activeMs: number;
}

/** 会话洞察：计划进度 + 改动清单 + 行为痕迹（口径见界面提示：来自会话记录，非工作区实际内容）。 */
export interface SessionInsights {
  sessionId: string;
  plan: SessionPlan | null;
  changes: SessionFileChange[];
  totals: { files: number; added: number; removed: number; edits: number };
  stats: SessionStats;
  /** 解析时跳过的行数（损坏行 / 超出行数上限）。 */
  skipped: number;
}

/** git 写操作（暂存/提交）的结果。 */
export interface GitOpResult {
  ok: boolean;
  message?: string;
}

/** 知识卡片类型：踩坑 / 决策 / 流程 / 模块说明。 */
export type KnowledgeCardType =
  /** 规格：需求/接口的既定行为、边界与验收标准 */
  | 'spec'
  /** 变更：改了什么、为什么、影响面与迁移注意 */
  | 'change'
  /** 踩坑：报错 → 根因 → 改法 */
  | 'pitfall'
  /** 决策：选了什么方案、为什么 */
  | 'decision'
  /** 流程：怎么跑起来 / 发布 / 排查 */
  | 'flow'
  /** 模块：负责什么、关键位置 */
  | 'module';

/** 一张知识卡片（落在仓库 docs/knowledge/<slug>.md）。 */
export interface KnowledgeCard {
  slug: string;
  title: string;
  type: KnowledgeCardType;
  /** draft = 待确认；verified = 已有人验证过。 */
  status: 'draft' | 'verified';
  createdAt: string;
  updatedAt: string;
  /** 来源会话（可选，便于回溯原始对话）。 */
  sessionId?: string;
  /** 涉及的源码文件（用于判断卡片是否过期）。 */
  files: string[];
  phenomenon: string;
  conclusion: string;
  evidence: string;
}

/** 保存卡片时的入参（slug 有值表示更新已有卡片）。 */
export interface KnowledgeCardInput {
  slug?: string;
  title: string;
  type: KnowledgeCardType;
  status: 'draft' | 'verified';
  sessionId?: string;
  files?: string[];
  phenomenon?: string;
  conclusion?: string;
  evidence?: string;
}

/** 工作区真实 diff（`git diff HEAD` + 未跟踪文件），与会话记录里的"改动意图"区分开。 */
export type DiffLineKind = 'add' | 'del' | 'ctx';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export type DiffFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';

export interface DiffFile {
  path: string;
  status: DiffFileStatus;
  /** 是否已进入暂存区（index）。 */
  staged?: boolean;
  added: number;
  removed: number;
  hunks: DiffHunk[];
  /** 二进制文件：只标记，不展示内容。 */
  binary?: boolean;
  /** 行数超出展示预算或被跳过。 */
  truncated?: boolean;
}

export interface WorktreeDiff {
  cwd: string;
  branch: string | null;
  files: DiffFile[];
  /** 已暂存的文件路径。 */
  staged: string[];
  totals: { files: number; added: number; removed: number };
  /** 文件数超出上限。 */
  truncated: boolean;
}

/** 工作区 git 状态（非仓库时为 null）。 */
export interface SessionGitInfo {
  branch: string;
  /** 未提交文件数（含未跟踪）。 */
  dirty: number;
  /** 领先/落后远端的提交数（有 upstream 时）。 */
  ahead: number;
  behind: number;
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
  /** 侧边栏宽度（px，180-480）。 */
  sidebarWidth?: number;
  /** 右侧信息面板宽度（px，180-480）。 */
  infoWidth?: number;
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

/** 全局知识库链路结果。 */
export interface KnowledgeGlobalResult {
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
  /** Token 统计是否开启（关闭时 UI 隐藏相关卡片，主进程也不做用量扫描）。 */
  tokenStatsEnabled: boolean;
}

/** 备份/迁移结果。 */
export interface BackupResult {
  ok: boolean;
  path?: string;
  message?: string;
}

/** 自动更新状态（主进程 → 渲染层）。 */
export type UpdateStatus =
  | { kind: 'dev'; message: string }
  | { kind: 'checking'; message: string }
  | { kind: 'up-to-date'; message: string }
  | { kind: 'available'; version: string; message: string }
  | { kind: 'downloaded'; version: string; message: string }
  | { kind: 'error'; message: string };

/** 功能使用统计（本地计数）。 */
export interface UsageStat {
  count: number;
  lastAt: string;
}
export type UsageStats = Record<string, UsageStat>;

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

/** 工作时间线：某天的一个会话区块。 */
export interface DayTimelineEvent {
  sessionId: string;
  name: string;
  cwd: string;
  startMs: number;
  endMs: number;
  activeMs: number;
}

export interface DayTimelineResult {
  date: string;
  events: DayTimelineEvent[];
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

/** 长任务阶段进度（周报/知识库等调用 claude 的耗时操作）。 */
export interface TaskProgressEvent {
  task: 'week-summary' | 'knowledge';
  title: string;
  stage: string;
  index: number;
  total: number;
  done?: boolean;
}

export interface CodeAgentDeskApi {
  getPathForFile(file: File): string;
  getAppInfo(): Promise<AppInfo>;
  getClaudeConfig(): Promise<ClaudeConfigInfo>;
  setClaudeDir(dir: string | null): Promise<ClaudeConfigInfo>;
  setTheme(theme: ThemeName): Promise<ClaudeConfigInfo>;
  setTokenLimit(limit: number): Promise<ClaudeConfigInfo>;
  setAgentStatusStyle(style: AgentStatusStyle): Promise<ClaudeConfigInfo>;
  setPomodoroMinutes(minutes: number): Promise<ClaudeConfigInfo>;
  setTerminalFont(payload: { size?: number; family?: string }): Promise<ClaudeConfigInfo>;
  setShowTokenStats(enabled: boolean): Promise<ClaudeConfigInfo>;
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
  ensureGlobalKnowledge(): Promise<KnowledgeGlobalResult>;
  getDashboardStats(): Promise<DashboardStats>;
  getEfficiencyInsights(weekStart?: string): Promise<EfficiencyInsights>;
  getDayTimeline(date: string): Promise<DayTimelineResult>;
  getFunStats(): Promise<FunStats>;
  unlockTheme(theme: ThemeName): Promise<ClaudeConfigInfo>;
  exportSessionMarkdown(sessionId: string, cwd?: string): Promise<ExportResult>;
  readSessionText(sessionId: string): Promise<ReadSessionTextResult>;
  getSessionInsights(sessionId: string): Promise<SessionInsights>;
  getSessionGit(cwd: string): Promise<SessionGitInfo | null>;
  getWorktreeDiff(cwd: string): Promise<WorktreeDiff>;
  stageFiles(cwd: string, paths: string[], staged: boolean): Promise<GitOpResult>;
  commitChanges(cwd: string, message: string): Promise<GitOpResult>;
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
  onTaskProgress(callback: (event: TaskProgressEvent) => void): () => void;
  cancelTask(): Promise<{ ok: boolean }>;
  checkForUpdates(): Promise<UpdateStatus>;
  installUpdate(): Promise<void>;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
  exportBackup(): Promise<BackupResult>;
  importBackup(): Promise<BackupResult>;
  incrementUsageStat(key: string): Promise<void>;
  getUsageStats(): Promise<UsageStats>;
  listKnowledgeCards(cwd: string): Promise<KnowledgeCard[]>;
  saveKnowledgeCard(cwd: string, card: KnowledgeCardInput): Promise<KnowledgeCard>;
  deleteKnowledgeCard(cwd: string, slug: string): Promise<{ ok: boolean }>;
  /** 从某个会话按需提取知识草稿（右键触发）。 */
  extractSessionCards(
    sessionId: string,
    cwd: string,
  ): Promise<{ ok: boolean; count: number; titles: string[]; message?: string }>;
}
