import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Check,
  Copy,
  FolderOpen,
  Link2,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import type {
  AppInfo,
  ClaudeConfigInfo,
  SearchResult,
  SessionDetailResult,
  SessionRecord,
  SessionUsage,
  SummaryHistoryResult,
  ThemeName,
} from '../shared/types';
import { TerminalPane } from './components/TerminalPane';
import { SessionDetail } from './components/SessionDetail';
import { TitleBar } from './components/TitleBar';

type Mode = 'sessions' | 'archive' | 'search';

interface SessionView {
  id: string;
  cwd: string;
  sequence: number;
  status: 'starting' | 'running' | 'ended';
  sessionId?: string;
  customName?: string;
  activity?: boolean;
}

interface ContextMenuState {
  sessionId: string;
  cwd: string;
  archived: boolean;
  x: number;
  y: number;
}

interface PaletteItem {
  key: string;
  label: string;
  hint?: string;
  run: () => void;
}

const EMPTY_USAGE: SessionUsage = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

const THEME_BACKGROUND: Record<ThemeName, string> = {
  default: '#08090c',
  mac: '#ececef',
  green: '#c7edcc',
  sepia: '#f4ead8',
  amber: '#16120b',
  mist: '#131619',
};

const THEMES: { name: ThemeName; label: string }[] = [
  { name: 'default', label: '深色默认' },
  { name: 'mac', label: 'Mac 浅色' },
  { name: 'green', label: '护眼豆沙绿' },
  { name: 'sepia', label: '暖纸米黄' },
  { name: 'amber', label: '琥珀夜间' },
  { name: 'mist', label: '柔雾深青' },
];

const THEME_SWATCHES: Record<ThemeName, { bg: string; fg: string; accent: string }> = {
  default: { bg: '#08090c', fg: '#e8ecf1', accent: '#34d3c0' },
  mac: { bg: '#ececef', fg: '#1d1d1f', accent: '#0a84ff' },
  green: { bg: '#c7edcc', fg: '#2f4a35', accent: '#2e8b57' },
  sepia: { bg: '#f4ead8', fg: '#3d3528', accent: '#a67c1f' },
  amber: { bg: '#16120b', fg: '#e2cfa5', accent: '#e0a64e' },
  mist: { bg: '#131619', fg: '#c6cdd4', accent: '#58a0a8' },
};

function folderName(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? cwd;
}

function formatSessionTitle(session: SessionView): string {
  if (session.customName) return session.customName;
  return `${folderName(session.cwd)} #${session.sequence}`;
}

function recordTitle(record: SessionRecord): string {
  return record.customName ?? (record.cwd ? folderName(record.cwd) : '未命名会话');
}

function statusLabel(status: SessionView['status']): string {
  if (status === 'running') return '运行中';
  if (status === 'ended') return '已结束';
  return '启动中';
}

function formatRelativeTime(value: string | undefined): string {
  if (!value) return '';
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return '刚刚';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function renderTime(iso: string | undefined): ReactNode {
  const text = formatRelativeTime(iso);
  return text ? <span className="session-time">{text}</span> : null;
}

function highlight(text: string, needle: string): ReactNode {
  const term = needle.trim().toLowerCase();
  if (!term) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let index = 0;
  let at = lower.indexOf(term);
  while (at >= 0 && index < text.length) {
    if (at > index) parts.push(text.slice(index, at));
    parts.push(<mark key={at}>{text.slice(at, at + term.length)}</mark>);
    index = at + term.length;
    at = lower.indexOf(term, index);
  }
  if (index < text.length) parts.push(text.slice(index));
  return parts;
}

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [mode, setMode] = useState<Mode>('sessions');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetailResult | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [usage, setUsage] = useState<SessionUsage>(EMPTY_USAGE);
  const [claudeInfo, setClaudeInfo] = useState<ClaudeConfigInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [borrowedIds, setBorrowedIds] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(true);
  const [infoWidth, setInfoWidth] = useState(260);
  const [sidebarWidth, setSidebarWidth] = useState(232);
  const [navIndex, setNavIndex] = useState(-1);
  const [loadingList, setLoadingList] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [recentDirs, setRecentDirs] = useState<string[]>([]);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [summary, setSummary] = useState<{ summary: string; tags: string[] } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryTab, setSummaryTab] = useState<'day' | 'month' | 'calendar' | 'history'>('day');
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calDay, setCalDay] = useState<{ date: string; text: string; loading: boolean } | null>(
    null,
  );
  const [dayText, setDayText] = useState('');
  const [monthText, setMonthText] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryHistory, setSummaryHistory] = useState<SummaryHistoryResult>({
    days: [],
    months: [],
  });
  const [viewing, setViewing] = useState<{ title: string; text: string } | null>(null);
  const sidebarBodyRef = useRef<HTMLDivElement | null>(null);
  const sidebarWidthRef = useRef(232);
  const infoWidthRef = useRef(260);
  const activeIdRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const retiringRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getRecentDirs()
      .then((dirs) => {
        if (!cancelled) setRecentDirs(dirs);
      })
      .catch(() => {
        // 静默忽略。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getAppInfo()
      .then((info) => {
        if (!cancelled) setAppInfo(info);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
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

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getClaudeConfig()
      .then((info) => {
        if (!cancelled) setClaudeInfo(info);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'search') return;
    const text = query.trim();
    if (!text) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      window.codeagentdesk
        .searchSessions(text)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, query]);

  const activeSessionId = sessions.find((item) => item.id === activeId)?.sessionId;

  useEffect(() => {
    const session = sessions.find((item) => item.id === activeId);
    if (!session?.sessionId) {
      setUsage(EMPTY_USAGE);
      return;
    }
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
  }, [activeId, activeSessionId]);

  useEffect(() => {
    const ids = sessions
      .map((session) => session.sessionId)
      .filter((id): id is string => Boolean(id));
    const active = sessions.find((session) => session.id === activeId)?.sessionId;
    const timer = setTimeout(() => {
      void window.codeagentdesk.saveUiState({ openSessionIds: ids, activeSessionId: active });
    }, 400);
    return () => clearTimeout(timer);
  }, [sessions, activeId]);

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
        setPaletteQuery('');
        setPaletteIndex(0);
        setPaletteOpen(true);
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

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!newMenuOpen) return;
    const close = () => setNewMenuOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNewMenuOpen(false);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [newMenuOpen]);

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
      window.codeagentdesk
        .getRecentDirs()
        .then((dirs) => setRecentDirs(dirs))
        .catch(() => {
          // 静默忽略最近目录刷新失败。
        });
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

  async function handlePickClaudeDir(): Promise<void> {
    const picked = await window.codeagentdesk.pickClaudeDir();
    if (!picked.dir) return;
    const info = await window.codeagentdesk.setClaudeDir(picked.dir);
    setClaudeInfo(info);
    await refreshRecords();
  }

  async function handleResetClaudeDir(): Promise<void> {
    const info = await window.codeagentdesk.setClaudeDir(null);
    setClaudeInfo(info);
    await refreshRecords();
  }

  async function handleSetTheme(theme: ThemeName): Promise<void> {
    const info = await window.codeagentdesk.setTheme(theme);
    setClaudeInfo(info);
  }

  async function handleSetAutoSummarize(enabled: boolean): Promise<void> {
    const info = await window.codeagentdesk.setAutoSummarize(enabled);
    setClaudeInfo(info);
  }

  async function handleCloseSession(id: string): Promise<void> {
    const session = sessions.find((item) => item.id === id);
    if (session?.sessionId && borrowedIds.includes(session.sessionId)) {
      await retireArchivedSession(session.sessionId, session.cwd);
      return;
    }
    await window.codeagentdesk.closeSession(id);
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

  async function openDetailById(sessionId: string): Promise<void> {
    setDetailSessionId(sessionId);
    setSummary(null);
    setSummarizing(false);
    const result = await window.codeagentdesk.readSessionDetail(sessionId);
    setDetail(result);
  }

  function closeDetail(): void {
    setDetailSessionId(null);
    setDetail(null);
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

  function openSummary(): void {
    setSummaryOpen(true);
    setViewing(null);
    setSummaryTab('day');
  }

  async function loadSummaryHistory(): Promise<void> {
    try {
      const result = await window.codeagentdesk.summariesList();
      setSummaryHistory(result);
    } catch {
      // 静默忽略。
    }
  }

  async function viewHistoryItem(kind: 'day' | 'month', key: string): Promise<void> {
    const result = await window.codeagentdesk.summariesGet(kind, key);
    if (result.ok) {
      setViewing({ title: `${key} ${kind === 'day' ? '每日总结' : '月度总结'}`, text: result.text ?? '' });
    } else {
      setError(result.message ?? '读取总结失败');
    }
  }

  async function generateDaySummary(): Promise<void> {
    if (summarizing) return;
    setSummarizing(true);
    setDayText('');
    const result = await window.codeagentdesk.summarizeDay();
    setSummarizing(false);
    if (result.ok) {
      setDayText(result.text ?? '');
      void loadSummaryHistory();
    } else {
      setError(result.message ?? '生成今日总结失败');
    }
  }

  async function generateMonthSummary(): Promise<void> {
    if (summarizing) return;
    setSummarizing(true);
    setMonthText('');
    const result = await window.codeagentdesk.summarizeMonth();
    setSummarizing(false);
    if (result.ok) {
      setMonthText(result.text ?? '');
      void loadSummaryHistory();
    } else {
      setError(result.message ?? '生成本月总结失败');
    }
  }

  function todayKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
  }

  function shiftMonth(delta: number): void {
    const [year, month] = calMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    setCalMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }

  function buildCalendarCells(month: string): (string | null)[] {
    const [year, monthNum] = month.split('-').map(Number);
    const lead = new Date(year, monthNum - 1, 1).getDay();
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(`${month}-${String(day).padStart(2, '0')}`);
    }
    return cells;
  }

  async function loadDayFor(date: string): Promise<void> {
    setSelectedDay(date);
    setCalDay({ date, text: '', loading: true });
    // 直接查归档存储，不依赖可能过期的 summaryHistory 缓存。
    const result = await window.codeagentdesk.summariesGet('day', date);
    setCalDay({ date, text: result.ok ? result.text ?? '' : '', loading: false });
  }

  async function generateDayFor(date: string): Promise<void> {
    setCalDay({ date, text: '', loading: true });
    const result = await window.codeagentdesk.summarizeDay(date);
    if (result.ok) {
      setCalDay({ date, text: result.text ?? '', loading: false });
      void loadSummaryHistory();
    } else {
      setCalDay({ date, text: '', loading: false });
      setError(result.message ?? '生成失败');
    }
  }

  async function exportFromDetail(): Promise<void> {
    if (!detailSessionId) return;
    const result = await window.codeagentdesk.exportSessionMarkdown(detailSessionId);
    if (!result.ok) setError(result.message ?? '导出失败');
  }

  async function commitRename(sessionId: string, rawValue: string): Promise<void> {
    if (renamingId !== sessionId) return;
    const name = rawValue.trim();
    setRenamingId(null);
    if (!name) return;
    const result = await window.codeagentdesk.renameSession(sessionId, name);
    if (!result.ok) {
      setError(result.message ?? '重命名失败');
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
  }

  async function archiveSession(sessionId: string, cwd: string): Promise<void> {
    const result = await window.codeagentdesk.archiveSession(sessionId, cwd);
    if (!result.ok) {
      setError(result.message ?? '归档失败');
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
  }

  async function copySessionText(sessionId: string): Promise<void> {
    const result = await window.codeagentdesk.readSessionText(sessionId);
    if (!result.ok) {
      setError(result.message ?? '复制失败');
      return;
    }
    await navigator.clipboard.writeText(result.text);
  }

  async function restoreArchived(sessionId: string, cwd: string): Promise<void> {
    const result = await window.codeagentdesk.restoreArchivedSession(sessionId, cwd);
    if (!result.ok) {
      setError(result.message ?? '恢复失败');
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
      key: 'settings',
      label: '打开设置',
      run: () => setSettingsOpen(true),
    });
    return items;
  }

  function runPaletteItem(item: PaletteItem): void {
    setPaletteOpen(false);
    setPaletteQuery('');
    item.run();
  }

  function onPaletteKeyDown(event: ReactKeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (paletteFiltered.length) setPaletteIndex((i) => (i + 1) % paletteFiltered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (paletteFiltered.length) {
        setPaletteIndex((i) => (i - 1 + paletteFiltered.length) % paletteFiltered.length);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = paletteFiltered[paletteSafeIndex];
      if (item) runPaletteItem(item);
    } else if (event.key === 'Escape') {
      setPaletteOpen(false);
    }
  }

  const activeSession = sessions.find((session) => session.id === activeId) ?? null;
  const historyRecords = records.filter(
    (record) => !record.archived && !sessions.some((s) => s.sessionId === record.sessionId),
  );
  const archivedRecords = records.filter((record) => record.archived);
  const menuSession = menu
    ? sessions.find((session) => session.sessionId === menu.sessionId) ??
      records.find((record) => record.sessionId === menu.sessionId) ??
      null
    : null;

  const navItems: {
    key: string;
    kind: 'running' | 'history' | 'archived';
    id?: string;
    sessionId?: string;
    cwd: string;
  }[] = (() => {
    if (mode === 'sessions') {
      return [
        ...sessions.map((s) => ({
          key: `s:${s.id}`,
          kind: 'running' as const,
          id: s.id,
          sessionId: s.sessionId,
          cwd: s.cwd,
        })),
        ...historyRecords.map((r) => ({
          key: `h:${r.sessionId}`,
          kind: 'history' as const,
          sessionId: r.sessionId,
          cwd: r.cwd,
        })),
      ];
    }
    if (mode === 'archive') {
      return archivedRecords.map((r) => ({
        key: `a:${r.sessionId}`,
        kind: 'archived' as const,
        sessionId: r.sessionId,
        cwd: r.cwd,
      }));
    }
    return [];
  })();
  const activeNav = navItems.length ? Math.min(navIndex, navItems.length - 1) : -1;
  const navClass = (index: number): string => (activeNav === index ? ' nav-focus' : '');

  const paletteItems = buildPaletteItems();
  const paletteFiltered = paletteQuery.trim()
    ? paletteItems.filter((item) =>
        `${item.label} ${item.hint ?? ''}`
          .toLowerCase()
          .includes(paletteQuery.trim().toLowerCase()),
      )
    : paletteItems;
  const paletteSafeIndex = paletteFiltered.length
    ? Math.min(paletteIndex, paletteFiltered.length - 1)
    : -1;

  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      const date = (record.updatedAt || '').slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return counts;
  }, [records]);

  const summaryDayKeys = useMemo(
    () => new Set(summaryHistory.days.map((item) => item.key)),
    [summaryHistory],
  );

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
        <div className="brand">
          <span className="brand-icon">
            <Terminal size={18} strokeWidth={1.8} />
          </span>
          <span>CodeAgentDesk</span>
        </div>

        <div className="search-box">
          <Search size={14} />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setMode('search')}
            placeholder="搜索会话"
            aria-label="搜索会话"
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="清空搜索"
              onClick={() => {
                setQuery('');
                searchInputRef.current?.focus();
              }}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        <div className="mode-switch" role="tablist" aria-label="视图模式">
          <button
            type="button"
            className={mode === 'sessions' ? 'active' : ''}
            onClick={() => setMode('sessions')}
          >
            会话
          </button>
          <button
            type="button"
            className={mode === 'archive' ? 'active' : ''}
            onClick={() => setMode('archive')}
          >
            归档
          </button>
          <button
            type="button"
            className={mode === 'search' ? 'active' : ''}
            onClick={() => setMode('search')}
          >
            搜索
          </button>
        </div>

        <div
          className="sidebar-body"
          ref={sidebarBodyRef}
          tabIndex={0}
          aria-label="会话列表"
          onKeyDown={onSidebarKeyDown}
        >
          {mode === 'sessions' ? (
            loadingList && sessions.length === 0 ? (
              <div className="skeleton-list" aria-label="加载中">
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
              </div>
            ) : sessions.length === 0 && historyRecords.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={20} strokeWidth={1.6} />
                <span>暂无会话</span>
              </div>
            ) : (
              <div className="session-groups">
                {sessions.length > 0 ? (
                  <section className="session-group">
                    <div className="group-label">当前会话</div>
                    <ul className="session-list">
                      {sessions.map((session, i) => (
                        <li key={session.id}>
                          {renamingId === session.sessionId ? (
                            <div className="session-row renaming">
                              <input
                                className="session-rename-input"
                                autoFocus
                                defaultValue={session.customName ?? formatSessionTitle(session)}
                                onBlur={(event) =>
                                  void commitRename(
                                    session.sessionId ?? '',
                                    event.currentTarget.value,
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    void commitRename(
                                      session.sessionId ?? '',
                                      event.currentTarget.value,
                                    );
                                  } else if (event.key === 'Escape') {
                                    setRenamingId(null);
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={`session-row ${session.id === activeId ? 'active' : ''}${navClass(i)}`}
                              data-nav-index={i}
                              onClick={() => setActiveId(session.id)}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (session.sessionId) {
                                  openContextMenu(
                                    session.sessionId,
                                    session.cwd,
                                    records.some(
                                      (record) =>
                                        record.sessionId === session.sessionId &&
                                        record.archived,
                                    ),
                                    event.clientX,
                                    event.clientY,
                                  );
                                }
                              }}
                            >
                              <span
                                className={`session-dot ${session.status}`}
                                title={statusLabel(session.status)}
                              />
                              <span className="session-title">
                                {formatSessionTitle(session)}
                              </span>
                              <span className="session-cwd" title={session.cwd}>
                                {session.cwd}
                              </span>
                              {renderTime(
                                records.find((r) => r.sessionId === session.sessionId)?.updatedAt,
                              )}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {historyRecords.length > 0 ? (
                  <section className="session-group">
                    <div className="group-label">历史会话</div>
                    <ul className="session-list">
                      {historyRecords.map((record, j) => (
                        <li key={record.sessionId}>
                          {renamingId === record.sessionId ? (
                            <div className="session-row renaming">
                              <input
                                className="session-rename-input"
                                autoFocus
                                defaultValue={recordTitle(record)}
                                onBlur={(event) =>
                                  void commitRename(record.sessionId, event.currentTarget.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    void commitRename(record.sessionId, event.currentTarget.value);
                                  } else if (event.key === 'Escape') {
                                    setRenamingId(null);
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={`session-row${navClass(sessions.length + j)}`}
                              data-nav-index={sessions.length + j}
                              onClick={() => void openHistory(record)}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openContextMenu(
                                  record.sessionId,
                                  record.cwd,
                                  false,
                                  event.clientX,
                                  event.clientY,
                                );
                              }}
                            >
                              <span className="session-dot ended" title="已结束" />
                              <div className="session-main">
                                <span className="session-title-line">
                                  <span className="session-title">{recordTitle(record)}</span>
                                  {record.tags?.length ? (
                                    <span className="session-tags">
                                      {record.tags.slice(0, 3).map((tag) => (
                                        <i key={tag}>{tag}</i>
                                      ))}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="session-cwd" title={record.cwd || ''}>
                                  {record.summary || record.cwd || '未知目录'}
                                </span>
                              </div>
                              {renderTime(record.updatedAt)}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            )
          ) : mode === 'archive' ? (
            archivedRecords.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={20} strokeWidth={1.6} />
                <span>暂无归档</span>
              </div>
            ) : (
              <ul className="session-list">
                {archivedRecords.map((record, k) => (
                  <li key={record.sessionId}>
                    <button
                      type="button"
                      className={`session-row ${
                        sessions.some(
                          (session) =>
                            session.sessionId === record.sessionId && session.id === activeId,
                        ) || detailSessionId === record.sessionId
                          ? 'active'
                          : ''
                      }${navClass(k)}`}
                      data-nav-index={k}
                      onClick={() => void openArchivedSession(record)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openContextMenu(
                          record.sessionId,
                          record.cwd,
                          true,
                          event.clientX,
                          event.clientY,
                        );
                      }}
                    >
                      <span className="session-dot ended" title="已结束" />
                      <span className="session-title">{recordTitle(record)}</span>
                      <span className="session-cwd">{record.cwd || '未知目录'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="empty-state">
              <Search size={20} strokeWidth={1.6} />
              <span>输入关键词开始搜索</span>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="new-wrap">
            <button
              type="button"
              className="new-session"
              onClick={(event) => {
                event.stopPropagation();
                setNewMenuOpen((open) => !open);
              }}
            >
              <Plus size={16} />
              <span>新建会话</span>
            </button>
            {newMenuOpen ? (
              <div className="new-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                <div className="new-menu-label">最近目录</div>
                {recentDirs.length === 0 ? (
                  <div className="new-menu-empty">暂无历史目录</div>
                ) : (
                  recentDirs.map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      role="menuitem"
                      className="new-menu-item"
                      onClick={() => void handleNewSession(dir)}
                    >
                      <span className="new-menu-name">{folderName(dir)}</span>
                      <span className="new-menu-path">{dir}</span>
                    </button>
                  ))
                )}
                <div className="new-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="new-menu-item"
                  onClick={() => void handleNewSession()}
                >
                  <FolderOpen size={13} />
                  <span>选择其他目录…</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className="status-line">
            <span className={`status-dot ${appInfo ? 'ok' : 'pending'}`} />
            <span>{appInfo ? `v${appInfo.appVersion}` : '启动中'}</span>
          </div>
          <div className="settings-wrap">
            <button
              type="button"
              className="icon-button"
              aria-label="设置"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings2 size={16} />
            </button>
            {settingsOpen && claudeInfo ? (
              <div className="settings-popover settings-popover-compact">
                <div className="settings-label">皮肤</div>
                <div className="theme-grid">
                  {THEMES.map((item) => {
                    const swatch = THEME_SWATCHES[item.name];
                    const active = (claudeInfo.config.theme ?? 'default') === item.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        className={`theme-chip ${active ? 'active' : ''}`}
                        onClick={() => void handleSetTheme(item.name)}
                      >
                        <span
                          className="theme-chip-swatch"
                          style={{ background: swatch.bg }}
                        />
                        <span className="theme-chip-label">{item.label}</span>
                        {active ? (
                          <Check size={12} className="theme-chip-check" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="settings-label">Claude 目录</div>
                <div className="settings-row">
                  <span className="settings-path" title={claudeInfo.resolvedClaudeDir}>
                    {claudeInfo.resolvedClaudeDir}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    title="选择目录"
                    onClick={() => void handlePickClaudeDir()}
                  >
                    <FolderOpen size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="恢复默认"
                    onClick={() => void handleResetClaudeDir()}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
                <div className="settings-label">自动摘要</div>
                <label className="settings-option">
                  <input
                    type="checkbox"
                    checked={claudeInfo.config.autoSummarize === true}
                    onChange={(event) => void handleSetAutoSummarize(event.target.checked)}
                  />
                  <span>会话结束后自动生成 AI 摘要</span>
                </label>
              </div>
            ) : null}
          </div>
        </div>
        </aside>
        <div
          className="sidebar-resizer"
          title="拖动调整侧边栏宽度"
          onMouseDown={startSidebarResize}
        />

        <main className="main">
        <div className="tab-bar" role="tablist" aria-label="打开的会话">
          {sessions.map((session, i) => (
            <div
              key={session.id}
              className={`tab ${session.id === activeId ? 'active' : ''}${
                dragIndex === i ? ' dragging' : ''
              }${session.activity ? ' has-activity' : ''}`}
              role="tab"
              aria-selected={session.id === activeId}
              tabIndex={0}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex == null) return;
                const from = dragIndex;
                const to = i;
                setDragIndex(null);
                if (from === to) return;
                setSessions((previous) => {
                  const next = [...previous];
                  const [moved] = next.splice(from, 1);
                  next.splice(to, 0, moved);
                  return next;
                });
              }}
              onDragEnd={() => setDragIndex(null)}
              onClick={() => setActiveId(session.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setActiveId(session.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (session.sessionId) {
                  openContextMenu(
                    session.sessionId,
                    session.cwd,
                    records.some(
                      (record) =>
                        record.sessionId === session.sessionId && record.archived,
                    ),
                    event.clientX,
                    event.clientY,
                  );
                }
              }}
            >
              <span
                className={`tab-dot ${session.status}`}
                title={statusLabel(session.status)}
              />
              <span>{formatSessionTitle(session)}</span>
              <button
                type="button"
                className="icon-button tab-close"
                aria-label="关闭会话"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleCloseSession(session.id);
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="icon-button tab-panel-toggle"
            aria-label={infoOpen ? '收起信息面板' : '展开信息面板'}
            title={infoOpen ? '收起信息面板' : '展开信息面板'}
            onClick={() => setInfoOpen((open) => !open)}
          >
            {infoOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>
          <button
            type="button"
            className="icon-button tab-add"
            aria-label="新建会话"
            onClick={() => void handleNewSession()}
          >
            <Plus size={16} />
          </button>
        </div>

        <div
          className={`content ${infoOpen ? '' : 'info-collapsed'}`}
          style={infoOpen ? { gridTemplateColumns: `minmax(0, 1fr) ${infoWidth}px` } : undefined}
        >
          {mode === 'search' ? (
            <div className="search-results" role="log">
              {searchResults.length === 0 ? (
                <div className="archive-empty">没有匹配结果</div>
              ) : (
                searchResults.map((result) => (
                  <section key={result.sessionId} className="search-group">
                    <button
                      type="button"
                      className="search-session-header"
                      onClick={() => void openSearchResult(result)}
                    >
                      <span className="search-title">
                        {result.customName ?? folderName(result.cwd)}
                      </span>
                      <span className="search-path">{result.cwd}</span>
                    </button>
                    <ul className="search-hit-list">
                      {result.hits.map((hit) => (
                        <li key={hit.line} className="search-hit">
                          <span className="search-line">{hit.line}</span>
                          <span className={`search-role ${hit.role}`}>
                            {hit.role === 'user' ? '用户' : 'Claude'}
                          </span>
                          <span className="search-snippet">{highlight(hit.snippet, query)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          ) : (
            <>
              {terminalStack}
              {detail && detailSessionId ? (
                <SessionDetail
                  detail={detail}
                  summary={summary}
                  summarizing={summarizing}
                  onSummarize={() => void handleSummarize()}
                  onExport={() => void exportFromDetail()}
                  onClose={closeDetail}
                />
              ) : activeSession ? (
                <section className="info-panel" aria-label="会话状态">
                  <div
                    className="info-resizer"
                    onMouseDown={startInfoResize}
                    title="拖动调整宽度"
                  />
                <div className="info-item">
                  <span>状态</span>
                  <strong className={`status-text ${activeSession.status}`}>
                    {statusLabel(activeSession.status)}
                  </strong>
                </div>
                <div className="info-item">
                  <span>会话 ID</span>
                  <strong className="truncate">{activeSession.sessionId ?? '绑定中…'}</strong>
                </div>
                <div className="info-item">
                  <span>工作目录</span>
                  <strong className="truncate">{activeSession.cwd}</strong>
                </div>
                <div className="info-item">
                  <span>请求数</span>
                  <strong className="usage-badge">{usage.requests}</strong>
                </div>
                <div className="info-item">
                  <span>Token 用量</span>
                  <div className="usage-bar" title="输入 / 输出 / 缓存读">
                    <span className="usage-seg in" style={{ flexGrow: usage.inputTokens }} />
                    <span className="usage-seg out" style={{ flexGrow: usage.outputTokens }} />
                    <span
                      className="usage-seg cache"
                      style={{ flexGrow: usage.cacheReadTokens }}
                    />
                  </div>
                  <div className="usage-legend">
                    <span>
                      <i className="usage-dot in" />
                      输入 {usage.inputTokens.toLocaleString()}
                    </span>
                    <span>
                      <i className="usage-dot out" />
                      输出 {usage.outputTokens.toLocaleString()}
                    </span>
                    <span>
                      <i className="usage-dot cache" />
                      缓存读 {usage.cacheReadTokens.toLocaleString()} / 写{' '}
                      {usage.cacheCreationTokens.toLocaleString()}
                    </span>
                  </div>
                </div>
                {error ? (
                  <div className="info-item">
                    <span>错误</span>
                    <strong className="error-text truncate">{error}</strong>
                  </div>
                ) : null}
                </section>
              ) : (
                <div className="welcome">
                  <div className="welcome-icon">
                    <Terminal size={26} strokeWidth={1.6} />
                  </div>
                  <div className="welcome-title">CodeAgentDesk</div>
                  <div className="welcome-sub">Claude Code 统一窗口管理器</div>
                  <div className="welcome-actions">
                    <button
                      type="button"
                      className="welcome-btn primary"
                      onClick={() => void handleNewSession()}
                    >
                      <Plus size={16} />
                      <span>新建会话</span>
                    </button>
                    {historyRecords.length > 0 ? (
                      <button
                        type="button"
                        className="welcome-btn"
                        onClick={() => sidebarBodyRef.current?.focus()}
                      >
                        <BookOpen size={16} />
                        <span>打开历史会话</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="welcome-btn"
                      onClick={openSummary}
                    >
                      <Sparkles size={16} />
                      <span>今日总结</span>
                    </button>
                  </div>
                  <div className="welcome-hint">
                    Ctrl+K 全局搜索 · Ctrl+T 新建会话 · Ctrl+1..9 切换标签
                  </div>
                  {error ? <div className="welcome-error">{error}</div> : null}
                </div>
              )}
            </>
          )}
        </div>
        <footer className="status-bar">
          <span>{sessions.length} 会话</span>
          <span>{archivedRecords.length} 归档</span>
          <button
            type="button"
            className="status-day"
            title="生成今日总结"
            onClick={openSummary}
          >
            今日总结
          </button>
          <span className="status-bar-spacer" />
          <span>{claudeInfo ? folderName(claudeInfo.resolvedClaudeDir) : '…'}</span>
          <span>v{appInfo?.appVersion ?? '…'}</span>
          </footer>
        </main>
      </div>

      {summaryOpen ? (
        <div className="day-overlay" onClick={() => setSummaryOpen(false)}>
          <div className="day-panel" onClick={(event) => event.stopPropagation()}>
            {viewing ? (
              <>
                <div className="day-header">
                  <span className="day-title">{viewing.title}</span>
                  <div className="day-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="复制"
                      onClick={() => void navigator.clipboard.writeText(viewing.text)}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="返回"
                      onClick={() => setViewing(null)}
                    >
                      <FolderOpen size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="关闭"
                      onClick={() => setSummaryOpen(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="day-body">
                  <pre className="day-text">{viewing.text}</pre>
                </div>
              </>
            ) : (
              <>
                <div className="day-header">
                  <div className="day-tabs" role="tablist" aria-label="总结类型">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={summaryTab === 'day'}
                      className={summaryTab === 'day' ? 'active' : ''}
                      onClick={() => setSummaryTab('day')}
                    >
                      今日
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={summaryTab === 'month'}
                      className={summaryTab === 'month' ? 'active' : ''}
                      onClick={() => setSummaryTab('month')}
                    >
                      月度
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={summaryTab === 'calendar'}
                      className={summaryTab === 'calendar' ? 'active' : ''}
                      onClick={() => {
                        setSummaryTab('calendar');
                        void loadDayFor(todayKey());
                        void loadSummaryHistory();
                      }}
                    >
                      日历
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={summaryTab === 'history'}
                      className={summaryTab === 'history' ? 'active' : ''}
                      onClick={() => {
                        setSummaryTab('history');
                        void loadSummaryHistory();
                      }}
                    >
                      历史
                    </button>
                  </div>
                  <div className="day-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="关闭"
                      onClick={() => setSummaryOpen(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="day-body">
                  {summaryTab === 'day' ? (
                    <div className="day-tab-content">
                      {summarizing ? (
                        <div className="day-loading">正在生成今日总结…（调用 claude 无头模式）</div>
                      ) : dayText ? (
                        <pre className="day-text">{dayText}</pre>
                      ) : (
                        <div className="day-empty">还没有生成今日总结</div>
                      )}
                      <div className="day-generate-bar">
                        <button
                          type="button"
                          className="welcome-btn primary"
                          onClick={() => void generateDaySummary()}
                        >
                          <Sparkles size={14} />
                          <span>{dayText ? '重新生成' : '生成今日总结'}</span>
                        </button>
                      </div>
                    </div>
                  ) : summaryTab === 'month' ? (
                    <div className="day-tab-content">
                      {summarizing ? (
                        <div className="day-loading">正在生成月度总结…（调用 claude 无头模式）</div>
                      ) : monthText ? (
                        <pre className="day-text">{monthText}</pre>
                      ) : (
                        <div className="day-empty">还没有生成月度总结</div>
                      )}
                      <div className="day-generate-bar">
                        <button
                          type="button"
                          className="welcome-btn primary"
                          onClick={() => void generateMonthSummary()}
                        >
                          <Sparkles size={14} />
                          <span>{monthText ? '重新生成' : '生成本月总结'}</span>
                        </button>
                      </div>
                    </div>
                  ) : summaryTab === 'calendar' ? (
                    <div className="cal-content">
                      <div className="cal-nav">
                        <button type="button" aria-label="上个月" onClick={() => shiftMonth(-1)}>
                          ‹
                        </button>
                        <span className="cal-month">{calMonth}</span>
                        <button type="button" aria-label="下个月" onClick={() => shiftMonth(1)}>
                          ›
                        </button>
                      </div>
                      <div className="cal-grid">
                        {['日', '一', '二', '三', '四', '五', '六'].map((weekday) => (
                          <div key={weekday} className="cal-weekday">
                            {weekday}
                          </div>
                        ))}
                        {buildCalendarCells(calMonth).map((date, i) =>
                          date === null ? (
                            <div key={`empty-${i}`} className="cal-cell empty" />
                          ) : (
                            <button
                              key={date}
                              type="button"
                              className={`cal-cell${selectedDay === date ? ' selected' : ''}${
                                summaryDayKeys.has(date) ? ' has-summary' : ''
                              }`}
                              onClick={() => void loadDayFor(date)}
                            >
                              <span className="cal-daynum">{Number(date.slice(8))}</span>
                              {sessionCounts.get(date) ? (
                                <span className="cal-count">{sessionCounts.get(date)}</span>
                              ) : null}
                            </button>
                          ),
                        )}
                      </div>
                      <div className="cal-day-view">
                        {calDay ? (
                          <>
                            <div className="cal-day-head">
                              <span className="cal-day-title">{calDay.date} 当日总结</span>
                              {!calDay.loading && calDay.text ? (
                                <div className="cal-day-actions">
                                  <button
                                    type="button"
                                    className="icon-button"
                                    title="复制"
                                    onClick={() => void navigator.clipboard.writeText(calDay.text)}
                                  >
                                    <Copy size={14} />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            {calDay.loading ? (
                              <div className="day-loading">正在生成该日总结…</div>
                            ) : calDay.text ? (
                              <pre className="day-text">{calDay.text}</pre>
                            ) : (
                              <div className="cal-day-empty">
                                <div className="day-empty">该日没有归档总结</div>
                                <button
                                  type="button"
                                  className="welcome-btn primary"
                                  onClick={() => void generateDayFor(calDay.date)}
                                >
                                  <Sparkles size={14} />
                                  <span>找回当日总结</span>
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="day-empty">点击日历某天查看 / 找回当日总结</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="history-list">
                      {summaryHistory.months.length ? (
                        <div className="history-group">
                          <div className="history-group-label">月度总结</div>
                          {summaryHistory.months.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              className="history-item"
                              onClick={() => void viewHistoryItem('month', item.key)}
                            >
                              <span className="history-key">{item.key}</span>
                              <span className="history-preview">{item.preview}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {summaryHistory.days.length ? (
                        <div className="history-group">
                          <div className="history-group-label">每日总结</div>
                          {summaryHistory.days.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              className="history-item"
                              onClick={() => void viewHistoryItem('day', item.key)}
                            >
                              <span className="history-key">{item.key}</span>
                              <span className="history-preview">{item.preview}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {!summaryHistory.days.length && !summaryHistory.months.length ? (
                        <div className="day-empty">还没有归档的总结</div>
                      ) : null}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {paletteOpen ? (
        <div className="palette-overlay" onClick={() => setPaletteOpen(false)}>
          <div className="palette" onClick={(event) => event.stopPropagation()}>
            <input
              autoFocus
              value={paletteQuery}
              onChange={(event) => {
                setPaletteQuery(event.target.value);
                setPaletteIndex(0);
              }}
              onKeyDown={onPaletteKeyDown}
              placeholder="输入命令或搜索会话…（Ctrl+P）"
              aria-label="命令面板"
            />
            <ul className="palette-list">
              {paletteFiltered.length === 0 ? (
                <li className="palette-empty">无匹配</li>
              ) : (
                paletteFiltered.map((item, i) => (
                  <li
                    key={item.key}
                    className={`palette-item ${i === paletteSafeIndex ? 'active' : ''}`}
                    onMouseEnter={() => setPaletteIndex(i)}
                    onClick={() => runPaletteItem(item)}
                  >
                    <span className="palette-label">{item.label}</span>
                    {item.hint ? <span className="palette-hint">{item.hint}</span> : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {menu ? (
        <div
          className="context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={!menuSession || menu.archived}
            onClick={() => {
              setRenamingId(menu.sessionId);
              setMenu(null);
            }}
          >
            <span className="context-menu-icon">
              <Pencil size={14} />
            </span>
            重命名
          </button>
          <button
            type="button"
            disabled={!menuSession || menu.archived}
            onClick={() => {
              if (menuSession) void archiveSession(menu.sessionId, menu.cwd);
              setMenu(null);
            }}
          >
            <span className="context-menu-icon">
              <Archive size={14} />
            </span>
            归档
          </button>
          <button
            type="button"
            disabled={!menuSession || menu.archived}
            onClick={() => {
              const running = sessions.find((session) => session.sessionId === menu.sessionId);
              if (running) {
                setActiveId(running.id);
              } else {
                const record = records.find((item) => item.sessionId === menu.sessionId);
                if (record) void openHistory(record);
              }
              setMenu(null);
            }}
          >
            <span className="context-menu-icon">
              <RotateCcw size={14} />
            </span>
            恢复会话
          </button>
          <button
            type="button"
            disabled={!menuSession}
            onClick={() => {
              void openDetailById(menu.sessionId);
              setMenu(null);
            }}
          >
            <span className="context-menu-icon">
              <BookOpen size={14} />
            </span>
            查看详情
          </button>
          {menu.archived ? (
            <button
              type="button"
              disabled={!menuSession}
              onClick={() => {
                if (menuSession) void restoreArchived(menu.sessionId, menu.cwd);
                setMenu(null);
              }}
            >
              <span className="context-menu-icon">
                <ArchiveRestore size={14} />
              </span>
              恢复
            </button>
          ) : null}
          <div className="context-menu-separator" />
          <button
            type="button"
            disabled={!menuSession}
            onClick={() => {
              if (menuSession) void copySessionText(menu.sessionId);
              setMenu(null);
            }}
          >
            <span className="context-menu-icon">
              <Copy size={14} />
            </span>
            复制内容
          </button>
          <button
            type="button"
            onClick={() => {
              if (menu.cwd) void navigator.clipboard.writeText(menu.cwd);
              setMenu(null);
            }}
          >
            <span className="context-menu-icon">
              <Link2 size={14} />
            </span>
            复制路径
          </button>
        </div>
      ) : null}
    </div>
  );
}
