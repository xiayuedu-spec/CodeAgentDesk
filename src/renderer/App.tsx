import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { FolderOpen } from 'lucide-react';
import type {
  AgentStatusStyle,
  GroupRecord,
  SearchResult,
  SessionDetailResult,
  SessionRecord,
  ThemeName,
} from '../shared/types';
import {
  folderName,
  formatSessionTitle,
  type ContextMenuState,
  type GroupMenuState,
  type MoveMenuState,
  type SessionView,
} from './session-utils';
import { THEME_BACKGROUND } from './theme';
import { useUiState } from './hooks/useUiState';
import { useSearch } from './hooks/useSearch';
import { usePalette } from './hooks/usePalette';
import { useSummary } from './hooks/useSummary';
import { useDashboardStats } from './hooks/useDashboardStats';
import { useDismiss } from './hooks/useDismiss';
import { useEscape } from './hooks/useEscape';
import { useSessionAgentStatuses } from './hooks/useAgentStatus';
import { useOverlays } from './hooks/useOverlays';
import { useSessionLists } from './hooks/useSessionLists';
import { usePomodoro } from './hooks/usePomodoro';
import { useToast } from './toast';
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
} from './terminal-fonts';
import { TitleBar } from './components/TitleBar';
import { TabBar } from './components/TabBar';
import { InfoPanel } from './components/InfoPanel';
import { Welcome } from './components/Welcome';
import { ErrorBar } from './components/ErrorBar';
import { TaskProgressPanel, useTaskProgress } from './components/TaskProgress';
import { TooltipLayer } from './components/TooltipLayer';
import { StatusBar } from './components/StatusBar';
import { SearchResults } from './components/SearchResults';
import { SidebarBody } from './components/SidebarBody';
import { SidebarFooter } from './components/SidebarFooter';
import { ContextMenus } from './components/ContextMenus';
import type { PaletteItem } from './components/CommandPalette';

/** 稳定分区：置顶项排到最前，其余保持原顺序（Array.prototype.sort 在 V8 中稳定，但显式分区更清晰）。 */
// 首屏不渲染的重组件按需加载，减小主 chunk。
const LazySessionDetail = lazy(() =>
  import('./components/SessionDetail').then((module) => ({ default: module.SessionDetail })),
);
const LazyCommandPalette = lazy(() =>
  import('./components/CommandPalette').then((module) => ({ default: module.CommandPalette })),
);
const LazySummaryModal = lazy(() =>
  import('./components/SummaryModal').then((module) => ({ default: module.SummaryModal })),
);
const LazyUsageTrendModal = lazy(() =>
  import('./components/UsageTrendModal').then((module) => ({ default: module.UsageTrendModal })),
);
const LazyKnowledgeModal = lazy(() =>
  import('./components/KnowledgeModal').then((module) => ({ default: module.KnowledgeModal })),
);
const LazyDashboard = lazy(() =>
  import('./components/Dashboard').then((module) => ({ default: module.Dashboard })),
);
const LazyEfficiencyInsights = lazy(() =>
  import('./components/EfficiencyInsightsModal').then((module) => ({
    default: module.EfficiencyInsightsModal,
  })),
);
const LazyTimeline = lazy(() =>
  import('./components/TimelineModal').then((module) => ({ default: module.TimelineModal })),
);
const LazyBackup = lazy(() =>
  import('./components/BackupModal').then((module) => ({ default: module.BackupModal })),
);
const LazyUsageStats = lazy(() =>
  import('./components/UsageStatsModal').then((module) => ({ default: module.UsageStatsModal })),
);
const LazyCodeSearch = lazy(() =>
  import('./components/CodeSearchModal').then((module) => ({ default: module.CodeSearchModal })),
);
const LazyKnowledgeCards = lazy(() =>
  import('./components/KnowledgeCardsModal').then((module) => ({
    default: module.KnowledgeCardsModal,
  })),
);
const LazyGitDiff = lazy(() =>
  import('./components/GitDiffModal').then((module) => ({ default: module.GitDiffModal })),
);
const LazySessionInsights = lazy(() =>
  import('./components/SessionInsightsModal').then((module) => ({
    default: module.SessionInsightsModal,
  })),
);
// xterm 约 330KB：只有真要开会话时才加载，首页/概览不必为它买单。
const LazyTerminalPane = lazy(() =>
  import('./components/TerminalPane').then((module) => ({ default: module.TerminalPane })),
);

export default function App() {
  const ui = useUiState();
  const {
    appInfo,
    claudeInfo,
    settingsOpen,
    setSettingsOpen,
    recentDirs,
    refreshRecentDirs,
    error,
    setError,
    handlePickClaudeDir,
    handleResetClaudeDir,
    handleSetTheme,
    refreshClaudeInfo,
  } = ui;
  const search = useSearch(setError);
  const { mode, setMode, query, setQuery, searchResults } = search;
  const summaryState = useSummary(setError);
  const {
    summary,
    setSummary,
    summaryOpen,
    setSummaryOpen,
    summaryTab,
    setSummaryTab,
    calMonth,
    selectedDay,
    calDay,
    dayText,
    weekText,
    weekStart,
    weekRangeLabel,
    isCurrentWeek,
    monthText,
    summarizing,
    setSummarizing,
    summaryHistory,
    viewing,
    setViewing,
    editing,
    draft,
    setDraft,
    startEdit,
    cancelEdit,
    saveEdit,
    regenerateViewing,
    startEditCal,
    saveEditCal,
    openSummary,
    loadSummaryHistory,
    viewHistoryItem,
    generateDaySummary,
    generateWeekSummary,
    shiftWeek,
    generateMonthSummary,
    todayKey,
    shiftMonth,
    buildCalendarCells,
    loadDayFor,
    generateDayFor,
  } = summaryState;

  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetailResult | null>(null);
  const [detailQuery, setDetailQuery] = useState('');
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [borrowedIds, setBorrowedIds] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(true);
  const [infoWidth, setInfoWidth] = useState(260);
  const [sidebarWidth, setSidebarWidth] = useState(232);
  const [navIndex, setNavIndex] = useState(-1);
  const [loadingList, setLoadingList] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [groupRenameId, setGroupRenameId] = useState<string | null>(null);
  const [groupMenu, setGroupMenu] = useState<GroupMenuState | null>(null);
  const [sectionMenu, setSectionMenu] = useState<{ kind: 'history'; x: number; y: number } | null>(null);
  const [moveMenu, setMoveMenu] = useState<MoveMenuState | null>(null);
  const [moveNewOpen, setMoveNewOpen] = useState(false);
  const [moveNewName, setMoveNewName] = useState('');
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [archiveSelectMode, setArchiveSelectMode] = useState(false);
  const [confirmDeleteOne, setConfirmDeleteOne] = useState<string | null>(null);
  /** 代码搜索弹窗（null 关闭；cwd 决定搜哪个项目）。 */
  const [codeSearchTarget, setCodeSearchTarget] = useState<{ cwd: string; title?: string } | null>(
    null,
  );
  /** 知识卡片弹窗（null 关闭；cwd 决定读写哪个仓库的 docs/knowledge）。 */
  const [cardsTarget, setCardsTarget] = useState<{ cwd: string; title?: string } | null>(null);
  /** 工作区改动审查弹窗（null 关闭；cwd 决定看哪个仓库）。 */
  const [diffTarget, setDiffTarget] = useState<{ cwd: string; title?: string } | null>(null);
  /** 计划与改动弹窗（null 关闭；path 用于从右栏点某个文件直接定位）。 */
  const [insightsTarget, setInsightsTarget] = useState<{
    sessionId: string;
    title: string;
    cwd?: string;
    path?: string;
  } | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  const dashboard = useDashboardStats();
  const toast = useToast();

  // 本地使用统计（仅计数，不采集内容）。
  const bumpUsage = (key: string): void => {
    void window.codeagentdesk.incrementUsageStat(key);
  };
  // 浮层开关集中在 useOverlays（10 个布尔量 + 4 个带埋点的 opener 原本占了 App 开头一段）。
  const {
    usageTrendOpen,
    setUsageTrendOpen,
    knowledgeOpen,
    setKnowledgeOpen,
    dashboardOpen,
    setDashboardOpen,
    efficiencyOpen,
    setEfficiencyOpen,
    timelineOpen,
    setTimelineOpen,
    backupOpen,
    setBackupOpen,
    usageStatsOpen,
    setUsageStatsOpen,
    openDashboard,
    openEfficiency,
    openTimeline,
    openKnowledge,
  } = useOverlays(bumpUsage);

  // 自动更新：订阅状态 + 启动静默检查（打包环境生效，开发模式返回 dev 不提示）。
  useEffect(() => {
    const unsubscribe = window.codeagentdesk.onUpdateStatus((status) => {
      if (status.kind === 'available') {
        toast.info(status.message);
      } else if (status.kind === 'downloaded') {
        setUpdateReady(true);
        toast.info(`${status.message}（☰ 更多 → 重启并安装更新）`);
      } else if (status.kind === 'error') {
        toast.error(`检查更新失败：${status.message}`);
      }
    });
    void window.codeagentdesk.checkForUpdates();
    return unsubscribe;
  }, [toast]);

  // 统计：命令面板/搜索埋点（搜索在此处安全；命令面板在 palette 定义后埋点）。
  useEffect(() => {
    if (mode === 'search') bumpUsage('search.used');
  }, [mode]);
  const sidebarBodyRef = useRef<HTMLDivElement | null>(null);
  const sidebarWidthRef = useRef(232);
  const infoWidthRef = useRef(260);
  const activeIdRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const retiringRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .listGroups()
      .then((value) => {
        if (!cancelled) setGroups(value);
      })
      .catch(() => {
        // 静默忽略。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const theme = claudeInfo?.config.theme ?? 'default';
    const previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = theme;
    if (previous && previous !== theme) {
      document.body.classList.remove('theme-fade');
      void document.body.offsetWidth; // 重新触发 cross-fade 动画
      document.body.classList.add('theme-fade');
    }
    void window.codeagentdesk.setWindowBackgroundColor(THEME_BACKGROUND[theme]);
  }, [claudeInfo]);

  // 窗口最小化/隐藏时暂停高频轮询，减少无意义 IPC 与扫描。
  const [pageHidden, setPageHidden] = useState(document.hidden);
  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const ids = sessions
      .map((session) => session.sessionId)
      .filter((id): id is string => Boolean(id));
    const active = sessions.find((session) => session.id === activeId)?.sessionId;
    const timer = setTimeout(() => {
      void window.codeagentdesk.saveUiState({
        openSessionIds: ids,
        activeSessionId: active,
        collapsedGroups: [...collapsedGroups],
        collapsedSections: [...collapsedSections],
        sidebarWidth,
        infoWidth,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [sessions, activeId, collapsedGroups, collapsedSections, sidebarWidth, infoWidth]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        void handleNewSession();
      } else if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        if (activeId) void handleCloseSession(activeId);
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMode('search');
        searchInputRef.current?.focus();
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        openPalette();
      } else if (/^[1-9]$/.test(event.key)) {
        const target = sessions[Number(event.key) - 1];
        if (target) setActiveId(target.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sessions, activeId]);

  // 代码搜索：Ctrl+Shift+F（捕获阶段，避免被 xterm 吞掉）。
  useEffect(() => {
    const onCodeSearchKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return;
      if (event.key.toLowerCase() !== 'f') return;
      event.preventDefault();
      openCodeSearch({});
    };
    window.addEventListener('keydown', onCodeSearchKey, true);
    return () => window.removeEventListener('keydown', onCodeSearchKey, true);
  }, [activeId, sessions]);

  // 终端缩放：Ctrl+= / Ctrl+- / Ctrl+0（捕获阶段，避免被 xterm 吞掉）。
  useEffect(() => {
    const onZoomKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      const current = claudeInfo?.config.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
      let next: number | null = null;
      if (event.key === '=' || event.key === '+') next = Math.min(20, current + 1);
      else if (event.key === '-' || event.key === '_') next = Math.max(10, current - 1);
      else if (event.key === '0') next = DEFAULT_TERMINAL_FONT_SIZE;
      if (next === null || next === current) return;
      event.preventDefault();
      void window.codeagentdesk.setTerminalFont({ size: next }).then(refreshClaudeInfo);
    };
    window.addEventListener('keydown', onZoomKey, true);
    return () => window.removeEventListener('keydown', onZoomKey, true);
  }, [claudeInfo?.config.terminalFontSize, refreshClaudeInfo]);

  useEffect(() => {
    if (borrowedIds.length === 0) return;
    for (const sessionId of borrowedIds) {
      const session = sessions.find((item) => item.sessionId === sessionId);
      if (session && session.id !== activeId && !retiringRef.current.has(sessionId)) {
        void retireArchivedSession(sessionId, session.cwd);
      }
    }
  }, [activeId, sessions, borrowedIds]);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .listSessions()
      .then(async (value) => {
        if (cancelled) return;
        setRecords(value);
        setLoadingList(false);
        const state = await window.codeagentdesk.getUiState();
        if (cancelled) return;
        // 恢复上次的布局宽度（侧边栏 / 信息面板）。
        if (state.sidebarWidth) {
          sidebarWidthRef.current = state.sidebarWidth;
          setSidebarWidth(state.sidebarWidth);
        }
        if (state.infoWidth) {
          infoWidthRef.current = state.infoWidth;
          setInfoWidth(state.infoWidth);
        }
        const restored: SessionView[] = [];
        for (const sessionId of state.openSessionIds) {
          const record = value.find((item) => item.sessionId === sessionId && !item.archived);
          if (!record) continue;
          try {
            const created = await window.codeagentdesk.resumeSession(sessionId, record.cwd);
            restored.push({
              id: created.id,
              cwd: record.cwd,
              sequence: created.sequence,
              status: 'running',
              sessionId,
              customName: record.customName,
            });
          } catch {
            // Skip sessions that fail to resume.
          }
        }
        if (cancelled) return;
        setSessions(restored);
        const active = restored.find((item) => item.sessionId === state.activeSessionId);
        setActiveId(active?.id ?? (restored.length > 0 ? restored[0].id : null));
        if (state.collapsedGroups?.length) {
          setCollapsedGroups(new Set(state.collapsedGroups));
        }
        if (state.collapsedSections?.length) {
          setCollapsedSections(new Set(state.collapsedSections));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoadingList(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribeBound = window.codeagentdesk.onSessionBound(({ id, sessionId }) => {
      setSessions((previous) =>
        previous.map((session) =>
          session.id === id ? { ...session, sessionId, status: 'running' as const } : session,
        ),
      );
    });
    const unsubscribeExited = window.codeagentdesk.onSessionExited(({ id }) => {
      setSessions((previous) =>
        previous.map((session) =>
          session.id === id ? { ...session, status: 'ended' as const } : session,
        ),
      );
    });
    const unsubscribeError = window.codeagentdesk.onSessionError(({ id, message }) => {
      setSessions((previous) =>
        previous.map((session) =>
          session.id === id ? { ...session, status: 'ended' as const } : session,
        ),
      );
      setError(message);
    });
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribeChanged = window.codeagentdesk.onSessionsChanged(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void window.codeagentdesk
          .listSessions()
          .then((value) => setRecords(value))
          .catch(() => {
            // 静默忽略列表刷新失败。
          });
      }, 300);
    });
    const unsubscribeData = window.codeagentdesk.onSessionData(({ id }) => {
      if (id === activeIdRef.current) return;
      setSessions((previous) =>
        previous.map((session) =>
          session.id === id ? { ...session, activity: true } : session,
        ),
      );
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribeBound();
      unsubscribeExited();
      unsubscribeError();
      unsubscribeChanged();
      unsubscribeData();
    };
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
    if (!activeId) return;
    setSessions((previous) =>
      previous.map((session) =>
        session.id === activeId ? { ...session, activity: false } : session,
      ),
    );
  }, [activeId]);

  useDismiss(Boolean(menu), () => setMenu(null));
  useDismiss(Boolean(groupMenu), () => setGroupMenu(null));
  useDismiss(Boolean(sectionMenu), () => setSectionMenu(null));
  useDismiss(
    Boolean(moveMenu),
    () => {
      setMoveMenu(null);
      setMoveNewOpen(false);
    },
    () => {
      if (moveNewOpen) setMoveNewOpen(false);
      else {
        setMoveMenu(null);
        setMoveNewOpen(false);
      }
    },
  );
  useDismiss(newMenuOpen, () => setNewMenuOpen(false));

  useEffect(() => {
    const onDragOver = (event: DragEvent): void => {
      if (event.dataTransfer?.types?.includes('Files')) {
        event.preventDefault();
        setDragOver(true);
      }
    };
    const onDragLeave = (event: DragEvent): void => {
      if (!event.relatedTarget) setDragOver(false);
    };
    const onDrop = (event: DragEvent): void => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        const dir = window.codeagentdesk.getPathForFile(file).trim();
        if (dir) void handleNewSession(dir);
      }
    };
    window.addEventListener('dragover', onDragOver, true);
    window.addEventListener('dragleave', onDragLeave, true);
    window.addEventListener('drop', onDrop, true);
    return () => {
      window.removeEventListener('dragover', onDragOver, true);
      window.removeEventListener('dragleave', onDragLeave, true);
      window.removeEventListener('drop', onDrop, true);
    };
  }, []);

  useEffect(() => {
    setNavIndex(-1);
    // 切出归档视图时退出多选模式。
    setArchiveSelectMode(false);
    setSelectedArchiveIds(new Set());
    setConfirmingDelete(false);
  }, [mode]);

  async function handleNewSession(cwd?: string): Promise<void> {
    let target = cwd;
    if (!target) {
      const picked = await window.codeagentdesk.pickDirectory();
      if (!picked.cwd) return;
      target = picked.cwd;
    }
    setNewMenuOpen(false);
    try {
      const created = await window.codeagentdesk.createSession(target);
      void refreshRecentDirs();
      setSessions((previous) => [
        ...previous,
        {
          id: created.id,
          cwd: created.cwd,
          sequence: created.sequence,
          status: 'starting',
        },
      ]);
      setActiveId(created.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function refreshRecords(): Promise<void> {
    const value = await window.codeagentdesk.listSessions();
    setRecords(value);
  }

  function toggleArchiveSelect(sessionId: string): void {
    setSelectedArchiveIds((previous) => {
      const next = new Set(previous);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
    setConfirmingDelete(false);
  }

  function toggleSelectMode(): void {
    setArchiveSelectMode((value) => !value);
    setSelectedArchiveIds(new Set());
    setConfirmingDelete(false);
  }

  function toggleSelectAllArchived(): void {
    setSelectedArchiveIds((previous) => {
      if (previous.size > 0 && previous.size === archivedRecords.length) return new Set();
      return new Set(archivedRecords.map((record) => record.sessionId));
    });
    setConfirmingDelete(false);
  }

  async function handleDeleteArchived(): Promise<void> {
    const ids = [...selectedArchiveIds];
    if (ids.length === 0) return;
    const result = await window.codeagentdesk.deleteSessions(ids);
    setConfirmingDelete(false);
    setSelectedArchiveIds(new Set());
    if (!result.ok) {
      setError(result.message ?? '删除失败');
      toast.error(result.message ?? '删除失败');
      return;
    }
    setArchiveSelectMode(false);
    await refreshRecords();
    toast.success(`已删除 ${ids.length} 个归档会话`);
  }

  async function handleDeleteArchivedOne(sessionId: string): Promise<void> {
    const result = await window.codeagentdesk.deleteSessions([sessionId]);
    if (!result.ok) {
      setError(result.message ?? '删除失败');
      toast.error(result.message ?? '删除失败');
      return;
    }
    await refreshRecords();
    toast.success('已删除归档会话');
  }

  async function refreshGroups(): Promise<void> {
    const value = await window.codeagentdesk.listGroups();
    setGroups(value);
  }

  function toggleGroupCollapse(key: string): void {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSectionCollapse(key: 'current' | 'history'): void {
    setCollapsedSections((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleCreateGroup(name: string): Promise<GroupRecord | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const group = await window.codeagentdesk.createGroup(trimmed);
      await refreshGroups();
      toast.success(`已创建分组「${group.name}」`);
      return group;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      toast.error(message);
      return null;
    }
  }

  async function commitGroupRename(id: string, rawValue: string): Promise<void> {
    if (groupRenameId !== id) return;
    const name = rawValue.trim();
    setGroupRenameId(null);
    if (!name) return;
    const result = await window.codeagentdesk.renameGroup(id, name);
    if (!result.ok) {
      setError(result.message ?? '重命名分组失败');
      toast.error(result.message ?? '重命名分组失败');
      return;
    }
    await refreshGroups();
    toast.success('已重命名分组');
  }

  async function handleDeleteGroup(id: string): Promise<void> {
    setGroupMenu(null);
    const result = await window.codeagentdesk.deleteGroup(id);
    if (!result.ok) {
      setError(result.message ?? '删除分组失败');
      toast.error(result.message ?? '删除分组失败');
      return;
    }
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    await refreshGroups();
    await refreshRecords();
    toast.success('已删除分组');
  }

  async function handleSetGroupColor(id: string, color: string): Promise<void> {
    const result = await window.codeagentdesk.setGroupColor(id, color);
    if (!result.ok) {
      toast.error(result.message ?? '修改颜色失败');
      return;
    }
    await refreshGroups();
  }

  async function handleSetSessionGroup(sessionId: string, groupId: string | null): Promise<void> {
    const result = await window.codeagentdesk.setSessionGroup(sessionId, groupId);
    if (!result.ok) {
      setError(result.message ?? '移动分组失败');
      toast.error(result.message ?? '移动分组失败');
      return;
    }
    await refreshRecords();
  }

  async function handleTogglePin(sessionId: string, pinned: boolean): Promise<void> {
    const result = await window.codeagentdesk.setSessionPinned(sessionId, pinned);
    if (!result.ok) {
      toast.error(result.message ?? '操作失败');
      return;
    }
    await refreshRecords();
  }

  async function handleOpenCwd(cwd: string): Promise<void> {
    if (!cwd) return;
    const result = await window.codeagentdesk.openWorkingDirectory(cwd);
    if (!result.ok) {
      toast.error(result.message ?? '打开目录失败');
    }
  }

  async function handleArchiveGroupHistory(groupId: string): Promise<void> {
    const targets = historyRecords.filter(
      (record) => !record.archived && record.group === groupId,
    );
    if (targets.length === 0) {
      toast.info('该分组没有可归档的历史会话');
      return;
    }
    let ok = 0;
    const errors: string[] = [];
    await Promise.all(
      targets.map(async (record) => {
        const result = await window.codeagentdesk.archiveSession(record.sessionId, record.cwd);
        if (result.ok) ok += 1;
        else errors.push(result.message ?? record.sessionId);
      }),
    );
    await refreshRecords();
    if (ok > 0) {
      toast.success(`已归档 ${ok} 个会话${errors.length > 0 ? `（${errors.length} 个失败）` : ''}`, {
        label: '撤销',
        run: () =>
          void undoArchive(targets.map((record) => ({ sessionId: record.sessionId, cwd: record.cwd }))),
      });
    } else {
      toast.error(errors[0] ?? '归档失败');
    }
  }

  /** 历史会话区块右键「全部归档」：归档全部未归档、未运行中、**未分组**的历史会话。 */
  async function handleArchiveAllHistory(): Promise<void> {
    const targets = historyRecords.filter((record) => !record.archived && !record.group);
    if (targets.length === 0) {
      toast.info('没有可归档的未分组历史会话');
      return;
    }
    let ok = 0;
    const errors: string[] = [];
    await Promise.all(
      targets.map(async (record) => {
        const result = await window.codeagentdesk.archiveSession(record.sessionId, record.cwd);
        if (result.ok) ok += 1;
        else errors.push(result.message ?? record.sessionId);
      }),
    );
    await refreshRecords();
    if (ok > 0) {
      toast.success(`已归档 ${ok} 个历史会话${errors.length > 0 ? `（${errors.length} 个失败）` : ''}`, {
        label: '撤销',
        run: () =>
          void undoArchive(targets.map((record) => ({ sessionId: record.sessionId, cwd: record.cwd }))),
      });
    } else {
      toast.error(errors[0] ?? '归档失败');
    }
  }

  async function handleUnlockTheme(theme: ThemeName): Promise<void> {
    await window.codeagentdesk.unlockTheme(theme);
    await refreshClaudeInfo();
    const label = theme === 'term' ? '终端（极简）' : '霓虹（赛博朋克）';
    toast.success(`🎉 已解锁隐藏主题：${label}，去设置里试试！`);
  }

  async function handleSetAgentStatusStyle(style: AgentStatusStyle): Promise<void> {
    await window.codeagentdesk.setAgentStatusStyle(style);
    await refreshClaudeInfo();
  }

  async function handleSetPomodoroMinutes(minutes: number): Promise<void> {
    await window.codeagentdesk.setPomodoroMinutes(minutes);
    await refreshClaudeInfo();
  }

  async function handleSetShowTokenStats(enabled: boolean): Promise<void> {
    await window.codeagentdesk.setShowTokenStats(enabled);
    await refreshClaudeInfo();
    void dashboard.refresh();
    toast.success(enabled ? '已开启 Token 统计' : '已关闭 Token 统计');
  }

  /** 取消正在跑的 claude 长任务（周报/知识库/日报等），由进度面板的「取消」触发。 */
  async function handleCancelTask(): Promise<void> {
    const result = await window.codeagentdesk.cancelTask();
    toast.info(result.ok ? '已请求取消任务' : '当前没有可取消的任务');
  }

  /** 打开代码搜索（Ctrl+Shift+F）。 */
  function openCodeSearch(target: { cwd?: string; title?: string }): void {
    const cwd = target.cwd ?? activeSession?.cwd;
    if (!cwd) {
      toast.info('先打开一个会话，才知道要搜哪个项目');
      return;
    }
    bumpUsage('codeSearch.opened');
    setCodeSearchTarget({ cwd, title: target.title });
  }

  /** 从会话按需提取知识草稿（右键触发，会花一次模型调用）。 */
  async function handleExtractCards(sessionId: string, cwd: string): Promise<void> {
    if (!cwd) {
      toast.info('这个会话还没有工作目录');
      return;
    }
    bumpUsage('cards.extract');
    const result = await window.codeagentdesk.extractSessionCards(sessionId, cwd);
    if (!result.ok) {
      toast.error(result.message ?? '提取失败');
      return;
    }
    if (result.count === 0) {
      toast.info('这次会话没有值得沉淀的内容');
      return;
    }
    toast.success(`已生成 ${result.count} 张知识草稿`, {
      label: '去核验',
      run: () => openCards({ cwd }),
    });
  }

  /** 打开知识卡片（本会话 cwd 的 docs/knowledge）。 */
  function openCards(target: { cwd?: string; title?: string }): void {
    if (!target.cwd) {
      toast.info('这个会话还没有工作目录');
      return;
    }
    bumpUsage('cards.opened');
    setCardsTarget({ cwd: target.cwd, title: target.title });
  }

  /** 打开工作区改动审查（本会话 cwd 的 git diff）。 */
  function openDiff(target: { cwd?: string; title?: string }): void {
    if (!target.cwd) {
      toast.info('这个会话还没有工作目录');
      return;
    }
    bumpUsage('diff.opened');
    setDiffTarget({ cwd: target.cwd, title: target.title });
  }

  /** 打开「计划与改动」：需要会话已落盘（否则后端找不到 JSONL）。 */
  function openInsights(target: {
    sessionId?: string;
    title?: string;
    cwd?: string;
    path?: string;
  }): void {
    if (!target.sessionId) {
      toast.info('这个会话还没有记录文件，先发一条消息再看');
      return;
    }
    // 从右键菜单进来时没有 cwd/title：从运行中会话或历史记录里补。
    const record = records.find((item) => item.sessionId === target.sessionId);
    const live = sessions.find((item) => item.sessionId === target.sessionId);
    bumpUsage('insights.opened');
    setInsightsTarget({
      sessionId: target.sessionId,
      title: target.title?.trim() || record?.summary?.trim() || target.sessionId.slice(0, 8),
      cwd: target.cwd ?? live?.cwd ?? record?.cwd,
      path: target.path,
    });
  }

  /**
   * 把「继续未完成计划」的提示写进当前会话终端。
   * 单行文本 + 一次回车：不用 bracketed paste，避免不同 TUI 版本把转义序列当字面量打出来。
   */
  function handleContinuePlan(
    session: { id: string; status: string } | null,
    prompt: string,
  ): void {
    if (!session) return;
    if (session.status === 'ended') {
      toast.info('会话已结束，先恢复会话再继续计划');
      return;
    }
    window.codeagentdesk.writeSession(session.id, `${prompt}\r`);
    bumpUsage('plan.continue');
    toast.success('已把续做提示发到终端');
  }

  function openGroupMenu(id: string, name: string, x: number, y: number): void {
    setGroupMenu({ id, name, x, y });
  }

  async function moveToGroup(sessionId: string, groupId: string | null): Promise<void> {
    await handleSetSessionGroup(sessionId, groupId);
    setMoveMenu(null);
    setMoveNewOpen(false);
  }

  async function createGroupAndMove(): Promise<void> {
    const name = moveNewName.trim();
    if (!name || !moveMenu) return;
    const group = await handleCreateGroup(name);
    setMoveNewOpen(false);
    if (group) await moveToGroup(moveMenu.sessionId, group.id);
  }

  async function handleCloseSession(id: string): Promise<void> {
    const session = sessions.find((item) => item.id === id);
    if (session?.sessionId && borrowedIds.includes(session.sessionId)) {
      await retireArchivedSession(session.sessionId, session.cwd);
      return;
    }
    try {
      await window.codeagentdesk.closeSession(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }
    setSessions((previous) => previous.filter((session) => session.id !== id));
    setActiveId((current) => (current === id ? null : current));
  }

  async function openHistory(record: SessionRecord): Promise<void> {
    const existing = sessions.find((session) => session.sessionId === record.sessionId);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const created = await window.codeagentdesk.resumeSession(record.sessionId, record.cwd);
    setSessions((previous) => [
      ...previous,
      {
        id: created.id,
        cwd: record.cwd,
        sequence: created.sequence,
        status: 'running',
        sessionId: record.sessionId,
        customName: record.customName,
      },
    ]);
    setActiveId(created.id);
  }

  async function openArchivedSession(record: SessionRecord): Promise<void> {
    const alreadyBorrowed = borrowedIds.includes(record.sessionId);
    if (!alreadyBorrowed && record.archived && record.cwd) {
      const restored = await window.codeagentdesk.restoreArchivedSession(
        record.sessionId,
        record.cwd,
      );
      if (!restored.ok) {
        setError(restored.message ?? '恢复失败');
        return;
      }
    }
    setBorrowedIds((previous) =>
      previous.includes(record.sessionId) ? previous : [...previous, record.sessionId],
    );
    await openHistory(record);
  }

  async function retireArchivedSession(sessionId: string, cwd: string): Promise<void> {
    if (retiringRef.current.has(sessionId)) return;
    retiringRef.current.add(sessionId);
    const removedId = sessions.find((item) => item.sessionId === sessionId)?.id;
    const result = await window.codeagentdesk.archiveSession(sessionId, cwd);
    setBorrowedIds((previous) => previous.filter((id) => id !== sessionId));
    setSessions((previous) => previous.filter((item) => item.sessionId !== sessionId));
    setRecords((previous) =>
      previous.map((record) =>
        record.sessionId === sessionId
          ? { ...record, archived: true, archivedAt: new Date().toISOString() }
          : record,
      ),
    );
    retiringRef.current.delete(sessionId);
    if (removedId) setActiveId((current) => (current === removedId ? null : current));
    if (!result.ok) setError(result.message ?? '注销失败');
  }

  async function openDetailById(sessionId: string, snippet?: string): Promise<void> {
    bumpUsage('detail.opened');
    setDetailSessionId(sessionId);
    setDetailQuery(snippet ?? '');
    setSummary(null);
    setSummarizing(false);
    const result = await window.codeagentdesk.readSessionDetail(sessionId);
    setDetail(result);
  }

  function closeDetail(): void {
    setDetailSessionId(null);
    setDetail(null);
    setDetailQuery('');
    setSummary(null);
    setSummarizing(false);
  }

  async function handleSummarize(): Promise<void> {
    if (!detailSessionId || summarizing) return;
    setSummarizing(true);
    const result = await window.codeagentdesk.summarizeSession(detailSessionId);
    setSummarizing(false);
    if (result.ok) {
      setSummary({ summary: result.summary ?? '', tags: result.tags ?? [] });
    } else {
      setError(result.message ?? '生成摘要失败');
    }
  }

  async function exportFromDetail(): Promise<void> {
    if (!detailSessionId) return;
    const result = await window.codeagentdesk.exportSessionMarkdown(detailSessionId);
    if (!result.ok) {
      setError(result.message ?? '导出失败');
      toast.error(result.message ?? '导出失败');
      return;
    }
    bumpUsage('export.md');
    toast.success('已导出 Markdown');
  }

  async function commitRename(sessionId: string, rawValue: string): Promise<void> {
    if (renamingId !== sessionId) return;
    const name = rawValue.trim();
    setRenamingId(null);
    if (!name) return;
    const result = await window.codeagentdesk.renameSession(sessionId, name);
    if (!result.ok) {
      setError(result.message ?? '重命名失败');
      toast.error(result.message ?? '重命名失败');
      return;
    }
    setSessions((previous) =>
      previous.map((session) =>
        session.sessionId === sessionId ? { ...session, customName: name } : session,
      ),
    );
    setRecords((previous) =>
      previous.map((record) =>
        record.sessionId === sessionId ? { ...record, customName: name } : record,
      ),
    );
    toast.success('已重命名');
  }

  /** 撤销归档：把刚归档的会话放回历史（不打开终端）。 */
  async function undoArchive(targets: { sessionId: string; cwd: string }[]): Promise<void> {
    let ok = 0;
    for (const target of targets) {
      const result = await window.codeagentdesk.restoreArchivedSession(target.sessionId, target.cwd);
      if (result.ok) ok += 1;
    }
    await refreshRecords();
    if (ok > 0) toast.success(`已撤销归档（${ok} 个会话）`);
    else toast.error('撤销失败');
  }

  async function archiveSession(sessionId: string, cwd: string): Promise<void> {
    const result = await window.codeagentdesk.archiveSession(sessionId, cwd);
    if (!result.ok) {
      setError(result.message ?? '归档失败');
      toast.error(result.message ?? '归档失败');
      return;
    }
    const removed = sessions.find((session) => session.sessionId === sessionId);
    setSessions((previous) => previous.filter((session) => session.sessionId !== sessionId));
    if (removed && activeId === removed.id) setActiveId(null);
    setRecords((previous) =>
      previous.map((record) =>
        record.sessionId === sessionId
          ? { ...record, archived: true, archivedAt: new Date().toISOString() }
          : record,
      ),
    );
    setDetailSessionId((current) => (current === sessionId ? null : current));
    setDetail((current) => (current?.sessionId === sessionId ? null : current));
    // 归档可逆 → 立即执行 + 撤销，而不是先弹确认。
    toast.success('已归档', { label: '撤销', run: () => void undoArchive([{ sessionId, cwd }]) });
  }

  async function copySessionText(sessionId: string): Promise<void> {
    const result = await window.codeagentdesk.readSessionText(sessionId);
    if (!result.ok) {
      setError(result.message ?? '复制失败');
      toast.error(result.message ?? '复制失败');
      return;
    }
    await navigator.clipboard.writeText(result.text);
    toast.success('已复制会话内容');
  }

  async function restoreArchived(sessionId: string, cwd: string): Promise<void> {
    const result = await window.codeagentdesk.restoreArchivedSession(sessionId, cwd);
    if (!result.ok) {
      setError(result.message ?? '恢复失败');
      toast.error(result.message ?? '恢复失败');
      return;
    }
    setRecords((previous) =>
      previous.map((record) =>
        record.sessionId === sessionId
          ? { ...record, archived: false, archivedAt: undefined }
          : record,
      ),
    );
    setBorrowedIds((previous) => previous.filter((id) => id !== sessionId));
    setDetailSessionId((current) => (current === sessionId ? null : current));
    setDetail((current) => (current?.sessionId === sessionId ? null : current));
    setMode('sessions');
    toast.success('已恢复归档会话');
  }

  async function openSearchResult(result: SearchResult): Promise<void> {
    const record = records.find((item) => item.sessionId === result.sessionId) ?? {
      sessionId: result.sessionId,
      cwd: result.cwd,
      filePath: '',
      archived: result.archived,
      customName: result.customName,
      startedAt: '',
      updatedAt: '',
    };
    if (result.archived) {
      setMode('archive');
      void openArchivedSession(record);
    } else {
      setMode('sessions');
      void openHistory(record);
    }
  }

  function openContextMenu(
    sessionId: string,
    cwd: string,
    archived: boolean,
    x: number,
    y: number,
  ): void {
    setMenu({ sessionId, cwd, archived, x, y });
  }

  function startSidebarResize(event: ReactMouseEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;
    const onMove = (ev: MouseEvent): void => {
      const next = Math.min(480, Math.max(180, startWidth + (ev.clientX - startX)));
      sidebarWidthRef.current = next;
      setSidebarWidth(next);
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing-sidebar');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.classList.add('resizing-sidebar');
  }

  function startInfoResize(event: ReactMouseEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = infoWidthRef.current;
    const onMove = (ev: MouseEvent): void => {
      const next = Math.min(480, Math.max(180, startWidth + (startX - ev.clientX)));
      infoWidthRef.current = next;
      setInfoWidth(next);
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing-info');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.classList.add('resizing-info');
  }

  function openNavItem(item: {
    kind: 'running' | 'history' | 'archived';
    id?: string;
    sessionId?: string;
    cwd: string;
  }): void {
    if (item.kind === 'running' && item.id) {
      setActiveId(item.id);
    } else if (item.kind === 'history' && item.sessionId) {
      const record = historyRecords.find((r) => r.sessionId === item.sessionId);
      if (record) void openHistory(record);
    } else if (item.kind === 'archived' && item.sessionId) {
      const record = archivedRecords.find((r) => r.sessionId === item.sessionId);
      if (record) void openArchivedSession(record);
    }
  }

  function onSidebarKeyDown(event: ReactKeyboardEvent): void {
    if (navItems.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setNavIndex((i) => (i < 0 ? 0 : (i + 1) % navItems.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setNavIndex((i) => (i < 0 ? navItems.length - 1 : (i - 1 + navItems.length) % navItems.length));
    } else if (event.key === 'Enter' && activeNav >= 0) {
      event.preventDefault();
      openNavItem(navItems[activeNav]);
    }
  }

  function buildPaletteItems(): PaletteItem[] {
    const items: PaletteItem[] = [
      { key: 'new', label: '新建会话…', run: () => void handleNewSession() },
    ];
    for (const dir of recentDirs) {
      items.push({
        key: `dir:${dir}`,
        label: `新建会话 → ${folderName(dir)}`,
        hint: dir,
        run: () => void handleNewSession(dir),
      });
    }
    items.push({
      key: 'search',
      label: '全文搜索…',
      run: () => {
        setMode('search');
        searchInputRef.current?.focus();
      },
    });
    items.push({
      key: 'day',
      label: '生成今日总结',
      run: openSummary,
    });
    items.push({
      key: 'usage',
      label: 'Token 用量趋势',
      run: () => setUsageTrendOpen(true),
    });
    items.push({
      key: 'knowledge',
      label: '项目知识库',
      run: () => setKnowledgeOpen(true),
    });
    items.push({
      key: 'dashboard',
      label: '今日概览',
      run: () => setDashboardOpen(true),
    });
    items.push({
      key: 'efficiency',
      label: '效率洞察（每周时长 / 省时估算）',
      run: () => setEfficiencyOpen(true),
    });
    items.push({
      key: 'timeline',
      label: '工作时间线（某天会话回放）',
      run: () => setTimelineOpen(true),
    });
    items.push({
      key: 'home',
      label: '首页（今日概览）',
      run: () => setHomeOpen(true),
    });
    items.push({
      key: 'settings',
      label: '打开设置',
      run: () => setSettingsOpen(true),
    });
    return items;
  }

  const activeSession = sessions.find((session) => session.id === activeId) ?? null;
  const sessionStatuses = useSessionAgentStatuses();
  const activeAgentStatus = activeId ? (sessionStatuses[activeId] ?? 'idle') : 'idle';
  // 待审批收件箱：哪些会话正在等用户确认（agent 状态机判定）。
  // useMemo 保持引用稳定，下面的"新进入等待"提示才不会每次渲染都重跑。
  const approvals = useMemo(
    () =>
      sessions
        .filter((session) => sessionStatuses[session.id] === 'approval')
        .map((session) => ({
          id: session.id,
          title: formatSessionTitle(session),
          cwd: session.cwd,
        })),
    [sessions, sessionStatuses],
  );

  // 会话刚进入「等待确认」时提示一次（同一段等待只提醒一次，避免刷屏）。
  const alertedApprovals = useRef<Set<string>>(new Set());
  useEffect(() => {
    const current = new Set(approvals.map((item) => item.id));
    for (const item of approvals) {
      if (!alertedApprovals.current.has(item.id)) {
        alertedApprovals.current.add(item.id);
        toast.info(`「${item.title}」在等你确认`);
      }
    }
    for (const id of [...alertedApprovals.current]) {
      if (!current.has(id)) alertedApprovals.current.delete(id);
    }
  }, [approvals, toast]);

  const pomodoro = usePomodoro((claudeInfo?.config.pomodoroMinutes ?? 25) * 60_000);
  const taskProgress = useTaskProgress();
  useEscape(Boolean(confirmDeleteOne), () => setConfirmDeleteOne(null));
  useEffect(() => {
    if (pomodoro.finished) toast.success('🍅 番茄钟完成，休息一下！');
  }, [pomodoro.finished]);
  const onPomodoroToggle = (): void => {
    bumpUsage('pomodoro.start');
    pomodoro.toggle();
  };

  // 打开首页后，激活任何会话/标签自动退出首页。
  useEffect(() => {
    if (activeId) setHomeOpen(false);
  }, [activeId]);
  // 派生列表（历史/归档/分组区块/导航序号…）已抽到 useSessionLists。
  const {
    historyRecords,
    archivedRecords,
    groupSections,
    ungroupedRunning,
    ungroupedHistory,
    rowIndexByKey,
    navItems,
    activeNav,
    sessionCounts,
  } = useSessionLists({ records, sessions, groups, collapsedGroups, mode, navIndex });
  const navClass = (index: number): string => (activeNav === index ? ' nav-focus' : '');
  const menuSession = menu
    ? sessions.find((session) => session.sessionId === menu.sessionId) ??
      records.find((record) => record.sessionId === menu.sessionId) ??
      null
    : null;

  // 命令面板依赖上述派生数据（buildPaletteItems 引用 historyRecords/activeSession 等），须在其后调用。
  const palette = usePalette(buildPaletteItems);
  const {
    paletteItems,
    paletteOpen,
    setPaletteOpen,
    paletteQuery,
    setPaletteQuery,
    setPaletteIndex,
    openPalette,
    paletteSafeIndex,
    onPaletteKeyDown,
    runPaletteItem,
  } = palette;
  useEffect(() => {
    if (paletteOpen) bumpUsage('palette.opened');
  }, [paletteOpen]);


  useEffect(() => {
    if (activeNav < 0) return;
    const element = sidebarBodyRef.current?.querySelector(`[data-nav-index="${activeNav}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [activeNav]);

  const detailOpen = Boolean(detail && detailSessionId);
  const terminalStackHidden = detailOpen || !activeSession;
  const terminalStack = (
    <div className={`terminal-stack ${terminalStackHidden ? 'hidden' : ''}`}>
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`terminal-slot ${session.id === activeId ? 'active' : ''}`}
        >
          <Suspense fallback={<div className="terminal-loading" />}>
            <LazyTerminalPane
              id={session.id}
              cwd={session.cwd}
              active={!terminalStackHidden && session.id === activeId}
              fontSize={claudeInfo?.config.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE}
              fontFamily={claudeInfo?.config.terminalFontFamily ?? DEFAULT_TERMINAL_FONT_FAMILY}
            />
          </Suspense>
        </div>
      ))}
    </div>
  );

  const sidebarBodyData = {
    mode,
    query,
    loadingList,
    sessions,
    records,
    sessionStatuses,
    agentStatusStyle: claudeInfo?.config.agentStatusStyle ?? 'emoji',
    activeId,
    detailSessionId,
    renamingId,
    groupRenameId,
    collapsedSections,
    historyRecords,
    archivedRecords,
    groupSections,
    ungroupedRunning,
    ungroupedHistory,
    rowIndexByKey,
    navClass,
    activeNav,
    selectedArchiveIds,
    confirmingDelete,
    archiveSelectMode,
  };
  const sidebarBodyActions = {
    setMode,
    setQuery,
    onSearchClear: () => {
      setQuery('');
      searchInputRef.current?.focus();
    },
    onKeyDown: onSidebarKeyDown,
    bodyRef: sidebarBodyRef,
    searchInputRef,
    setActiveId,
    openHistory: (record: SessionRecord) => void openHistory(record),
    openArchivedSession: (record: SessionRecord) => void openArchivedSession(record),
    openContextMenu,
    commitRename: (sessionId: string, name: string) => void commitRename(sessionId, name),
    setRenamingId,
    commitGroupRename: (id: string, name: string) => void commitGroupRename(id, name),
    setGroupRenameId,
    toggleGroupCollapse,
    toggleSectionCollapse,
    openGroupMenu,
    openSectionMenu: (x: number, y: number) => setSectionMenu({ kind: 'history', x, y }),
    toggleArchiveSelect,
    toggleSelectAllArchived,
    handleDeleteArchived,
    setConfirmingDelete,
    toggleSelectMode,
  };
  const sidebarFooterData = {
    appInfo,
    claudeInfo,
    recentDirs,
    newMenuOpen,
    settingsOpen,
    stats: dashboard.stats,
  };
  const sidebarFooterActions = {
    setNewMenuOpen,
    setSettingsOpen,
    handleNewSession: (cwd?: string) => void handleNewSession(cwd),
    handleSetTheme: (theme: ThemeName) => void handleSetTheme(theme),
    handlePickClaudeDir: () => {
      void handlePickClaudeDir().then(() => void refreshRecords());
    },
    handleResetClaudeDir: () => {
      void handleResetClaudeDir().then(() => void refreshRecords());
    },
    handleSetTokenLimit: (limit: number) => {
      void window.codeagentdesk.setTokenLimit(limit).then(refreshClaudeInfo);
    },
    handleSetAgentStatusStyle: (style: AgentStatusStyle) => void handleSetAgentStatusStyle(style),
    handleSetShowTokenStats: (enabled: boolean) => void handleSetShowTokenStats(enabled),
    handleSetPomodoroMinutes: (minutes: number) => void handleSetPomodoroMinutes(minutes),
    handleSetTerminalFont: (payload: { size?: number; family?: string }) => {
      void window.codeagentdesk.setTerminalFont(payload).then(refreshClaudeInfo);
    },
  };

  const contextMenusData = {
    menu,
    menuSession,
    groupMenu,
    sectionMenu,
    moveMenu,
    groups,
    moveNewOpen,
    moveNewName,
    sessions,
    records,
  };
  const contextMenusActions = {
    closeMenu: () => setMenu(null),
    closeGroupMenu: () => setGroupMenu(null),
    closeSectionMenu: () => setSectionMenu(null),
    setRenamingId,
    setGroupRenameId,
    archiveSession: (sessionId: string, cwd: string) => void archiveSession(sessionId, cwd),
    openMoveMenu: (sessionId: string, x: number, y: number) => {
      setMoveMenu({ sessionId, x, y });
      setMoveNewOpen(false);
      setMoveNewName('');
      setMenu(null);
    },
    setActiveId,
    openHistory: (record: SessionRecord) => void openHistory(record),
    openDetailById: (sessionId: string) => void openDetailById(sessionId),
    openInsights: (sessionId: string) => openInsights({ sessionId }),
    openDiff: (cwd: string) => openDiff({ cwd }),
    extractCards: (sessionId: string, cwd: string) => void handleExtractCards(sessionId, cwd),
    restoreArchived: (sessionId: string, cwd: string) => void restoreArchived(sessionId, cwd),
    copySessionText: (sessionId: string) => void copySessionText(sessionId),
    onDeleteSession: (sessionId: string) => setConfirmDeleteOne(sessionId),
    handleDeleteGroup: (id: string) => void handleDeleteGroup(id),
    moveToGroup: (sessionId: string, groupId: string | null) => void moveToGroup(sessionId, groupId),
    togglePin: (sessionId: string, pinned: boolean) => void handleTogglePin(sessionId, pinned),
    archiveGroupHistory: (groupId: string) => void handleArchiveGroupHistory(groupId),
    archiveAllHistory: () => void handleArchiveAllHistory(),
    openCwd: (cwd: string) => void handleOpenCwd(cwd),
    setGroupColor: (id: string, color: string) => void handleSetGroupColor(id, color),
    setMoveNewOpen,
    setMoveNewName,
    createGroupAndMove: () => void createGroupAndMove(),
  };

  return (
    <div className="app">
      {dragOver ? (
        <div className="drop-overlay">
          <FolderOpen size={30} strokeWidth={1.6} />
          <span>释放以在此目录开会话</span>
        </div>
      ) : null}
      <TitleBar />
      <div className="app-body">
        <aside className="sidebar" style={{ width: sidebarWidth }}>
        <SidebarBody data={sidebarBodyData} actions={sidebarBodyActions} />
        <SidebarFooter data={sidebarFooterData} actions={sidebarFooterActions} />
        </aside>
        <div
          className="sidebar-resizer"
          title="拖动调整侧边栏宽度"
          onMouseDown={startSidebarResize}
        />

        <main className="main">
        <TabBar
          sessions={sessions}
          sessionStatuses={sessionStatuses}
          agentStatusStyle={claudeInfo?.config.agentStatusStyle ?? 'emoji'}
          activeId={activeId}
          dragIndex={dragIndex}
          infoOpen={infoOpen}
          onDragStart={setDragIndex}
          onDragEnd={() => setDragIndex(null)}
          onDrop={(from, to) => {
            setDragIndex(null);
            if (from === to) return;
            setSessions((previous) => {
              const next = [...previous];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              return next;
            });
          }}
          onSelect={(id) => {
            setActiveId(id);
            setHomeOpen(false);
          }}
          onClose={(id) => void handleCloseSession(id)}
          onContextMenu={(event, sessionId, cwd) => {
            openContextMenu(
              sessionId,
              cwd,
              records.some(
                (record) => record.sessionId === sessionId && record.archived,
              ),
              event.clientX,
              event.clientY,
            );
          }}
          onToggleInfo={() => setInfoOpen((open) => !open)}
          onNew={() => void handleNewSession()}
          onCopyActive={
            activeSession?.sessionId
              ? () => void copySessionText(activeSession.sessionId as string)
              : undefined
          }
          onDetailActive={
            activeSession?.sessionId
              ? () => void openDetailById(activeSession.sessionId as string)
              : undefined
          }
        />

        <div
          className={`content ${infoOpen ? '' : 'info-collapsed'}${homeOpen ? ' home' : ''}`}
          style={
            !homeOpen && infoOpen ? { gridTemplateColumns: `minmax(0, 1fr) ${infoWidth}px` } : undefined
          }
        >
          {homeOpen ? (
            <Welcome
              stats={dashboard.stats}
              historyCount={historyRecords.length}
              records={records}
              groups={groups}
              onNew={() => void handleNewSession()}
              onFocusHistory={() => sidebarBodyRef.current?.focus()}
              onOpenSummary={openSummary}
              onOpenKnowledge={() => setKnowledgeOpen(true)}
              onOpenUsageTrend={() => setUsageTrendOpen(true)}
            />
          ) : mode === 'search' ? (
            <SearchResults
              results={searchResults}
              query={query}
              onOpen={(result) => void openSearchResult(result)}
              onOpenHit={(result, hit) => void openDetailById(result.sessionId, hit.snippet)}
            />
          ) : (
            <>
              {terminalStack}
              {detail && detailSessionId ? (
                <Suspense fallback={null}>
                  <LazySessionDetail
                    detail={detail}
                    summary={summary}
                    summarizing={summarizing}
                    highlightQuery={detailQuery}
                    onSummarize={() => void handleSummarize()}
                    onOpenInsights={() => openInsights(detail)}
                    onExport={() => void exportFromDetail()}
                    onClose={closeDetail}
                  />
                </Suspense>
              ) : activeSession ? (
                <InfoPanel
                  session={activeSession}
                  running={
                    !pageHidden &&
                    infoOpen &&
                    (activeSession.status === 'running' || activeSession.status === 'starting')
                  }
                  onResizeStart={startInfoResize}
                  onOpenInsights={(path) =>
                    openInsights({
                      sessionId: activeSession.sessionId,
                      cwd: activeSession.cwd,
                      path,
                    })
                  }
                  onContinuePlan={(prompt) => handleContinuePlan(activeSession, prompt)}
                  onOpenDiff={() =>
                    openDiff({
                      cwd: activeSession.cwd,
                      title: formatSessionTitle(activeSession),
                    })
                  }
                  onCollapse={() => setInfoOpen(false)}
                />
              ) : (
                <Welcome
                  stats={dashboard.stats}
                  historyCount={historyRecords.length}
                  records={records}
                  groups={groups}
                  onNew={() => void handleNewSession()}
                  onFocusHistory={() => sidebarBodyRef.current?.focus()}
                  onOpenSummary={openSummary}
                  onOpenKnowledge={() => setKnowledgeOpen(true)}
                  onOpenUsageTrend={() => setUsageTrendOpen(true)}
                />
              )}
            </>
          )}
        </div>
        {error ? <ErrorBar message={error} onDismiss={() => setError(null)} /> : null}
        <TooltipLayer />
        {taskProgress.progress ? (
          <TaskProgressPanel
            progress={taskProgress.progress}
            stages={taskProgress.stages}
            onCancel={handleCancelTask}
          />
        ) : null}
        <StatusBar
          sessionCount={sessions.length}
          archivedCount={archivedRecords.length}
          claudeDirName={claudeInfo ? folderName(claudeInfo.resolvedClaudeDir) : '…'}
          version={appInfo?.appVersion ?? '…'}
          onOpenSummary={openSummary}
          onOpenUsageTrend={() => setUsageTrendOpen(true)}
          onOpenKnowledge={openKnowledge}
          onOpenEfficiency={openEfficiency}
          onUnlockTheme={(theme) => void handleUnlockTheme(theme)}
          showTokenStats={claudeInfo?.config.showTokenStats === true}
          onToggleTokenStats={() =>
            void handleSetShowTokenStats(claudeInfo?.config.showTokenStats !== true)
          }
          unlockedThemes={[
            ...(claudeInfo?.config.funUnlockedNeon === true ? ['neon'] : []),
            ...(claudeInfo?.config.funUnlockedThemes ?? []),
          ]}
          onOpenDashboard={openDashboard}
          onOpenTimeline={openTimeline}
          onOpenHome={() => setHomeOpen(true)}
          onOpenBackup={() => setBackupOpen(true)}
          onOpenUsageStats={() => setUsageStatsOpen(true)}
          onOpenCards={() =>
            openCards({
              cwd: activeSession?.cwd ?? (claudeInfo ? claudeInfo.resolvedClaudeDir : undefined),
              title: activeSession ? formatSessionTitle(activeSession) : undefined,
            })
          }
          onCheckUpdate={() => {
            void window.codeagentdesk.checkForUpdates().then((status) => {
              if (status.kind === 'up-to-date') toast.info('已是最新版本');
              else if (status.kind === 'dev') toast.info('开发模式不支持自动更新');
              else if (status.kind === 'error') toast.error(`检查更新失败：${status.message}`);
            });
          }}
          onInstallUpdate={() => {
            void window.codeagentdesk.installUpdate();
          }}
          updateReady={updateReady}
          agentStatus={activeAgentStatus}
          agentStatusStyle={claudeInfo?.config.agentStatusStyle ?? 'emoji'}
          agentAlert={activeAgentStatus === 'approval'}
          approvals={approvals}
          onOpenApproval={(id) => {
            bumpUsage('approval.jump');
            setActiveId(id);
            setHomeOpen(false);
          }}
          pomodoroRunning={pomodoro.running}
          pomodoroText={pomodoro.remainingText}
          pomodoroProgress={pomodoro.progress}
          onPomodoroToggle={onPomodoroToggle}
          onPomodoroReset={pomodoro.reset}
        />
        </main>
      </div>

      {summaryOpen ? (
        <Suspense fallback={null}>
          <LazySummaryModal
            state={{
              summaryTab,
              dayText,
              weekText,
              weekStart,
              weekRangeLabel,
              isCurrentWeek,
              monthText,
              summarizing,
              summaryHistory,
              calMonth,
              selectedDay,
              calDay,
              viewing,
              sessionCounts,
              editing,
              draft,
            }}
            actions={{
              setSummaryTab,
              close: () => setSummaryOpen(false),
              setViewing,
              generateDay: () => void generateDaySummary(),
              generateWeek: () => void generateWeekSummary(),
              shiftWeek,
              generateMonth: () => void generateMonthSummary(),
              setDraft,
              startEdit,
              cancelEdit,
              saveEdit: (kind, key) => void saveEdit(kind, key),
              regenerateViewing,
              startEditCal,
              saveEditCal,
              loadDay: (date) => void loadDayFor(date),
              generateDayFor: (date) => void generateDayFor(date),
              shiftMonth,
              loadHistory: () => void loadSummaryHistory(),
              viewHistoryItem: (kind, key) => void viewHistoryItem(kind, key),
              buildCells: buildCalendarCells,
              todayKey,
            }}
          />
        </Suspense>
      ) : null}

      {usageTrendOpen ? (
        <Suspense fallback={null}>
          <LazyUsageTrendModal onClose={() => setUsageTrendOpen(false)} />
        </Suspense>
      ) : null}

      {knowledgeOpen ? (
        <Suspense fallback={null}>
          <LazyKnowledgeModal onClose={() => setKnowledgeOpen(false)} />
        </Suspense>
      ) : null}

      {dashboardOpen ? (
        <Suspense fallback={null}>
          <LazyDashboard
            onClose={() => setDashboardOpen(false)}
            onNew={() => void handleNewSession()}
            onFocusHistory={() => sidebarBodyRef.current?.focus()}
            onOpenSummary={openSummary}
            onOpenKnowledge={() => setKnowledgeOpen(true)}
            onOpenUsageTrend={() => setUsageTrendOpen(true)}
            onOpenEfficiency={openEfficiency}
            onOpenTimeline={openTimeline}
          />
        </Suspense>
      ) : null}

      {efficiencyOpen ? (
        <Suspense fallback={null}>
          <LazyEfficiencyInsights onClose={() => setEfficiencyOpen(false)} />
        </Suspense>
      ) : null}

      {timelineOpen ? (
        <Suspense fallback={null}>
          <LazyTimeline
            onClose={() => setTimelineOpen(false)}
            onOpenDetail={(sessionId) => void openDetailById(sessionId)}
          />
        </Suspense>
      ) : null}

      {backupOpen ? (
        <Suspense fallback={null}>
          <LazyBackup onClose={() => setBackupOpen(false)} />
        </Suspense>
      ) : null}

      {usageStatsOpen ? (
        <Suspense fallback={null}>
          <LazyUsageStats onClose={() => setUsageStatsOpen(false)} />
        </Suspense>
      ) : null}

      {codeSearchTarget ? (
        <Suspense fallback={null}>
          <LazyCodeSearch
            cwd={codeSearchTarget.cwd}
            title={codeSearchTarget.title}
            onClose={() => setCodeSearchTarget(null)}
          />
        </Suspense>
      ) : null}

      {cardsTarget ? (
        <Suspense fallback={null}>
          <LazyKnowledgeCards
            cwd={cardsTarget.cwd}
            title={cardsTarget.title}
            onClose={() => setCardsTarget(null)}
          />
        </Suspense>
      ) : null}

      {diffTarget ? (
        <Suspense fallback={null}>
          <LazyGitDiff
            cwd={diffTarget.cwd}
            title={diffTarget.title}
            onClose={() => setDiffTarget(null)}
          />
        </Suspense>
      ) : null}

      {insightsTarget ? (
        <Suspense fallback={null}>
          <LazySessionInsights
            sessionId={insightsTarget.sessionId}
            title={insightsTarget.title}
            cwd={insightsTarget.cwd}
            initialPath={insightsTarget.path}
            onClose={() => setInsightsTarget(null)}
          />
        </Suspense>
      ) : null}

      {confirmDeleteOne ? (
        <div className="confirm-overlay" onClick={() => setConfirmDeleteOne(null)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-title">删除归档会话</div>
            <div className="confirm-text">确定删除该归档会话？此操作不可恢复。</div>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-btn"
                onClick={() => setConfirmDeleteOne(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="confirm-btn danger"
                onClick={() => {
                  const sessionId = confirmDeleteOne;
                  setConfirmDeleteOne(null);
                  void handleDeleteArchivedOne(sessionId);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {paletteOpen ? (
        <Suspense fallback={null}>
          <LazyCommandPalette
            items={paletteItems}
            query={paletteQuery}
            index={paletteSafeIndex}
            onQueryChange={(value) => {
              setPaletteQuery(value);
              setPaletteIndex(0);
            }}
            onHoverIndex={setPaletteIndex}
            onKeyDown={onPaletteKeyDown}
            onSelect={runPaletteItem}
            onClose={() => setPaletteOpen(false)}
          />
        </Suspense>
      ) : null}

      <ContextMenus data={contextMenusData} actions={contextMenusActions} />
    </div>
  );
}
