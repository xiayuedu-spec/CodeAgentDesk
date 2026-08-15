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
  SessionUsage,
  ThemeName,
} from '../shared/types';
import {
  EMPTY_USAGE,
  folderName,
  formatSessionTitle,
  recordTitle,
  type ContextMenuState,
  type GroupMenuState,
  type GroupSection,
  type GroupSectionItem,
  type MoveMenuState,
  type SessionView,
} from './session-utils';
import { THEME_BACKGROUND, THEMES } from './theme';
import { useUiState } from './hooks/useUiState';
import { useSearch } from './hooks/useSearch';
import { usePalette } from './hooks/usePalette';
import { useSummary } from './hooks/useSummary';
import { useDashboardStats } from './hooks/useDashboardStats';
import { useDismiss } from './hooks/useDismiss';
import { AGENT_STATUS_META, useSessionAgentStatuses } from './hooks/useAgentStatus';
import { useToast } from './toast';
import { TerminalPane } from './components/TerminalPane';
import { TitleBar } from './components/TitleBar';
import { TabBar } from './components/TabBar';
import { InfoPanel } from './components/InfoPanel';
import { Welcome } from './components/Welcome';
import { StatusBar } from './components/StatusBar';
import { SearchResults } from './components/SearchResults';
import { SidebarBody } from './components/SidebarBody';
import { SidebarFooter } from './components/SidebarFooter';
import { ContextMenus } from './components/ContextMenus';
import type { PaletteItem } from './components/CommandPalette';

/** 稳定分区：置顶项排到最前，其余保持原顺序（Array.prototype.sort 在 V8 中稳定，但显式分区更清晰）。 */
function withPinnedFirst<T>(items: T[], isPinned: (item: T) => boolean): T[] {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isPinned(item) ? pinned : rest).push(item);
  return [...pinned, ...rest];
}

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
  const [usage, setUsage] = useState<SessionUsage>(EMPTY_USAGE);
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
  const [moveMenu, setMoveMenu] = useState<MoveMenuState | null>(null);
  const [moveNewOpen, setMoveNewOpen] = useState(false);
  const [moveNewName, setMoveNewName] = useState('');
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [archiveSelectMode, setArchiveSelectMode] = useState(false);
  const [confirmDeleteOne, setConfirmDeleteOne] = useState<string | null>(null);
  const [usageTrendOpen, setUsageTrendOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [efficiencyOpen, setEfficiencyOpen] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  const dashboard = useDashboardStats();
  const toast = useToast();
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

  const activeSessionId = sessions.find((item) => item.id === activeId)?.sessionId;

  // 窗口最小化/隐藏时暂停高频轮询，减少无意义 IPC 与扫描。
  const [pageHidden, setPageHidden] = useState(document.hidden);
  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const session = sessions.find((item) => item.id === activeId);
    if (!session?.sessionId) {
      setUsage(EMPTY_USAGE);
      return;
    }
    // 信息面板折叠或窗口隐藏时暂停轮询。
    if (!infoOpen || pageHidden) return;
    let cancelled = false;
    const refresh = () => {
      window.codeagentdesk
        .getSessionUsage(session.id)
        .then((value) => {
          if (!cancelled) setUsage(value);
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
        });
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId, activeSessionId, infoOpen, pageHidden]);

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
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [sessions, activeId, collapsedGroups, collapsedSections]);

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

  async function handleUnlockNeon(): Promise<void> {
    await window.codeagentdesk.unlockNeon();
    await refreshClaudeInfo();
    toast.success('🎉 已解锁隐藏主题：霓虹（赛博朋克），去设置里试试！');
  }

  async function handleSetAgentStatusStyle(style: AgentStatusStyle): Promise<void> {
    await window.codeagentdesk.setAgentStatusStyle(style);
    await refreshClaudeInfo();
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
    toast.success('已归档');
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
    for (const record of historyRecords) {
      items.push({
        key: `h:${record.sessionId}`,
        label: `恢复会话 → ${recordTitle(record)}`,
        hint: record.cwd,
        run: () => void openHistory(record),
      });
    }
    for (const record of archivedRecords) {
      items.push({
        key: `a:${record.sessionId}`,
        label: `打开归档 → ${recordTitle(record)}`,
        hint: record.cwd,
        run: () => void openArchivedSession(record),
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
    if (activeSession?.sessionId) {
      const sessionId = activeSession.sessionId;
      items.push({
        key: 'export',
        label: '导出当前会话为 Markdown',
        hint: activeSession.cwd,
        run: () => {
          void window.codeagentdesk.exportSessionMarkdown(sessionId).then((result) => {
            if (!result.ok) setError(result.message ?? '导出失败');
          });
        },
      });
    }
    for (const theme of THEMES) {
      items.push({
        key: `theme:${theme.name}`,
        label: `切换主题 → ${theme.label}`,
        run: () => void handleSetTheme(theme.name),
      });
    }
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
  const activeAgentMeta = AGENT_STATUS_META[activeId ? (sessionStatuses[activeId] ?? 'idle') : 'idle'];

  // 打开首页后，激活任何会话/标签自动退出首页。
  useEffect(() => {
    if (activeId) setHomeOpen(false);
  }, [activeId]);
  const historyRecords = records.filter(
    (record) => !record.archived && !sessions.some((s) => s.sessionId === record.sessionId),
  );
  const archivedRecords = records.filter((record) => record.archived);
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

  // 会话 → 分组/置顶映射预建一次，分组与未分组计算共用（避免 filter 内逐会话 find）。
  const recordGroupBySession = useMemo(
    () => new Map(records.map((record) => [record.sessionId, record.group])),
    [records],
  );
  const recordPinnedBySession = useMemo(
    () => new Map(records.map((record) => [record.sessionId, record.pinned === true])),
    [records],
  );

  // 分组是会话管理的核心容器：运行中 + 历史会话都按组归类（运行中在前），分组区块默认在上方。
  // 未分组的会话分别回落到"当前会话 / 历史会话"区块，不单独建"未分组"区块。
  // 置顶会话在各自区块内排到最前。
  const groupSections = useMemo<GroupSection[]>(() => {
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const byGroup = new Map<string, GroupSectionItem[]>();
    const pushItem = (item: GroupSectionItem): void => {
      const groupId = item.sessionId
        ? recordGroupBySession.get(item.sessionId)
        : undefined;
      if (groupId && groupById.has(groupId)) {
        const list = byGroup.get(groupId) ?? [];
        list.push(item);
        byGroup.set(groupId, list);
      }
    };
    for (const session of sessions) {
      pushItem({
        key: `s:${session.id}`,
        kind: 'running',
        id: session.id,
        sessionId: session.sessionId,
        cwd: session.cwd,
      });
    }
    for (const record of historyRecords) {
      pushItem({
        key: `h:${record.sessionId}`,
        kind: 'history',
        sessionId: record.sessionId,
        cwd: record.cwd,
      });
    }
    return groups
      .map((group) => ({
        key: group.id,
        group,
        items: withPinnedFirst(byGroup.get(group.id) ?? [], (item) =>
          item.sessionId ? Boolean(recordPinnedBySession.get(item.sessionId)) : false,
        ),
        collapsed: collapsedGroups.has(group.id),
      }))
      .filter((section) => section.items.length > 0);
  }, [groups, records, sessions, historyRecords, collapsedGroups]);

  const ungroupedRunning = useMemo(
    () =>
      withPinnedFirst(
        sessions.filter((session) => {
          const groupId = session.sessionId
            ? recordGroupBySession.get(session.sessionId)
            : undefined;
          return !groupId || !groups.some((group) => group.id === groupId);
        }),
        (session) =>
          session.sessionId ? Boolean(recordPinnedBySession.get(session.sessionId)) : false,
      ),
    [groups, recordGroupBySession, recordPinnedBySession, sessions],
  );

  const ungroupedHistory = useMemo(
    () =>
      withPinnedFirst(
        historyRecords.filter((record) => {
          const groupId = record.group;
          return !groupId || !groups.some((group) => group.id === groupId);
        }),
        (record) => record.pinned === true,
      ),
    [groups, historyRecords],
  );

  const visibleRows: GroupSectionItem[] = [
    ...groupSections.flatMap((section) => (section.collapsed ? [] : section.items)),
    ...ungroupedRunning.map((session) => ({
      key: `s:${session.id}`,
      kind: 'running' as const,
      id: session.id,
      sessionId: session.sessionId,
      cwd: session.cwd,
    })),
    ...ungroupedHistory.map((record) => ({
      key: `h:${record.sessionId}`,
      kind: 'history' as const,
      sessionId: record.sessionId,
      cwd: record.cwd,
    })),
  ];
  const rowIndexByKey = new Map(visibleRows.map((item, index) => [item.key, index]));

  const navItems: {
    key: string;
    kind: 'running' | 'history' | 'archived';
    id?: string;
    sessionId?: string;
    cwd: string;
  }[] =
    mode === 'sessions'
      ? visibleRows.map((item) => ({
          key: item.key,
          kind: item.kind,
          id: item.id,
          sessionId: item.sessionId,
          cwd: item.cwd,
        }))
      : mode === 'archive'
        ? archivedRecords.map((record) => ({
            key: `a:${record.sessionId}`,
            kind: 'archived' as const,
            sessionId: record.sessionId,
            cwd: record.cwd,
          }))
        : [];
  const activeNav = navItems.length ? Math.min(navIndex, navItems.length - 1) : -1;
  const navClass = (index: number): string => (activeNav === index ? ' nav-focus' : '');

  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      const date = (record.updatedAt || '').slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return counts;
  }, [records]);

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
          <TerminalPane
            id={session.id}
            title={formatSessionTitle(session)}
            status={session.status}
            active={!terminalStackHidden && session.id === activeId}
            onDetail={() => {
              if (session.sessionId) void openDetailById(session.sessionId);
            }}
            onCopy={() => {
              if (session.sessionId) void copySessionText(session.sessionId);
            }}
          />
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
  };

  const contextMenusData = {
    menu,
    menuSession,
    groupMenu,
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
    restoreArchived: (sessionId: string, cwd: string) => void restoreArchived(sessionId, cwd),
    copySessionText: (sessionId: string) => void copySessionText(sessionId),
    onDeleteSession: (sessionId: string) => setConfirmDeleteOne(sessionId),
    handleDeleteGroup: (id: string) => void handleDeleteGroup(id),
    moveToGroup: (sessionId: string, groupId: string | null) => void moveToGroup(sessionId, groupId),
    togglePin: (sessionId: string, pinned: boolean) => void handleTogglePin(sessionId, pinned),
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
              error={error}
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
                    onExport={() => void exportFromDetail()}
                    onClose={closeDetail}
                  />
                </Suspense>
              ) : activeSession ? (
                <InfoPanel
                  session={activeSession}
                  usage={usage}
                  error={error}
                  onResizeStart={startInfoResize}
                />
              ) : (
                <Welcome
                  stats={dashboard.stats}
                  historyCount={historyRecords.length}
                  error={error}
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
        <StatusBar
          sessionCount={sessions.length}
          archivedCount={archivedRecords.length}
          claudeDirName={claudeInfo ? folderName(claudeInfo.resolvedClaudeDir) : '…'}
          version={appInfo?.appVersion ?? '…'}
          onOpenSummary={openSummary}
          onOpenUsageTrend={() => setUsageTrendOpen(true)}
          onOpenKnowledge={() => setKnowledgeOpen(true)}
          onOpenEfficiency={() => setEfficiencyOpen(true)}
          onUnlockNeon={() => void handleUnlockNeon()}
          onOpenDashboard={() => setDashboardOpen(true)}
          onOpenHome={() => setHomeOpen(true)}
          agentEmoji={activeAgentMeta.emoji}
          agentStatusLabel={activeAgentMeta.label}
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
            onOpenEfficiency={() => setEfficiencyOpen(true)}
          />
        </Suspense>
      ) : null}

      {efficiencyOpen ? (
        <Suspense fallback={null}>
          <LazyEfficiencyInsights onClose={() => setEfficiencyOpen(false)} />
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
