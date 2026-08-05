import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Plus, Search, Settings2, Terminal, X } from 'lucide-react';
import type {
  AppInfo,
  ClaudeConfigInfo,
  SearchResult,
  SessionDetailResult,
  SessionRecord,
  SessionUsage,
} from '../shared/types';
import { TerminalPane } from './components/TerminalPane';
import { SessionDetail } from './components/SessionDetail';

type Mode = 'sessions' | 'archive' | 'search';

interface SessionView {
  id: string;
  cwd: string;
  sequence: number;
  status: 'starting' | 'running' | 'ended';
  sessionId?: string;
  customName?: string;
}

interface ContextMenuState {
  sessionId: string;
  cwd: string;
  archived: boolean;
  x: number;
  y: number;
}

const EMPTY_USAGE: SessionUsage = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

function formatTime(value: string | undefined): string {
  if (!value) return '…';
  return new Date(value).toLocaleString();
}

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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const retiringRef = useRef(new Set<string>());

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
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
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
    return () => {
      unsubscribeBound();
      unsubscribeExited();
      unsubscribeError();
    };
  }, []);

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

  async function handleNewSession(): Promise<void> {
    const picked = await window.codeagentdesk.pickDirectory();
    if (!picked.cwd) return;
    const created = await window.codeagentdesk.createSession(picked.cwd);
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
    const result = await window.codeagentdesk.readSessionDetail(sessionId);
    setDetail(result);
  }

  function closeDetail(): void {
    setDetailSessionId(null);
    setDetail(null);
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

  const detailOpen = Boolean(detail && detailSessionId);
  const terminalStackHidden = detailOpen || !activeSession;
  const terminalStack = (
    <div className={`terminal-stack ${terminalStackHidden ? 'hidden' : ''}`}>
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`terminal-slot ${session.id === activeId ? 'active' : ''}`}
        >
          <TerminalPane id={session.id} active={!detailOpen && session.id === activeId} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="app">
      <aside className="sidebar">
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

        <div className="sidebar-body">
          {mode === 'sessions' ? (
            sessions.length === 0 && historyRecords.length === 0 ? (
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
                      {sessions.map((session) => (
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
                              className={`session-row ${session.id === activeId ? 'active' : ''}`}
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
                              <span className={`session-dot ${session.status}`} />
                              <span className="session-title">
                                {formatSessionTitle(session)}
                              </span>
                              <span className="session-cwd">{session.cwd}</span>
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
                      {historyRecords.map((record) => (
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
                              className="session-row"
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
                              <span className="session-dot ended" />
                              <span className="session-title">{recordTitle(record)}</span>
                              <span className="session-cwd">{record.cwd || '未知目录'}</span>
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
                {archivedRecords.map((record) => (
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
                      }`}
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
                      <span className="session-dot ended" />
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
          <button type="button" className="new-session" onClick={() => void handleNewSession()}>
            <Plus size={16} />
            <span>新建会话</span>
          </button>
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
              <div className="settings-popover">
                <div className="settings-label">Claude 目录</div>
                <div className="settings-path" title={claudeInfo.resolvedClaudeDir}>
                  {claudeInfo.resolvedClaudeDir}
                </div>
                <button
                  type="button"
                  className="settings-action"
                  onClick={() => void handlePickClaudeDir()}
                >
                  选择目录
                </button>
                <button
                  type="button"
                  className="settings-action"
                  onClick={() => void handleResetClaudeDir()}
                >
                  恢复默认
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="tab-bar">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`tab ${session.id === activeId ? 'active' : ''}`}
              role="button"
              tabIndex={0}
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
              <span className={`tab-dot ${session.status}`} />
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
            className="icon-button tab-add"
            aria-label="新建会话"
            onClick={() => void handleNewSession()}
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="content">
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
                          <span className="search-snippet">{hit.snippet}</span>
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
                  onExport={() => void exportFromDetail()}
                  onClose={closeDetail}
                />
              ) : activeSession ? (
                <section className="info-panel" aria-label="会话状态">
                <div className="info-item">
                  <span>状态</span>
                  <strong
                    className={activeSession.status === 'ended' ? 'error-text' : 'ok-text'}
                  >
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
                  <strong>{usage.requests}</strong>
                </div>
                <div className="info-item">
                  <span>输入 Tokens</span>
                  <strong>{usage.inputTokens.toLocaleString()}</strong>
                </div>
                <div className="info-item">
                  <span>输出 Tokens</span>
                  <strong>{usage.outputTokens.toLocaleString()}</strong>
                </div>
                <div className="info-item">
                  <span>缓存读 / 写</span>
                  <strong>
                    {usage.cacheReadTokens.toLocaleString()} /{' '}
                    {usage.cacheCreationTokens.toLocaleString()}
                  </strong>
                </div>
                {error ? (
                  <div className="info-item">
                    <span>错误</span>
                    <strong className="error-text truncate">{error}</strong>
                  </div>
                ) : null}
                </section>
              ) : (
                <>
                  <div className="terminal-surface" role="log" aria-live="polite">
                <div className="terminal-line">
                  <span className="prompt">&gt;</span> codeagentdesk v{appInfo?.appVersion ?? '…'}
                </div>
                <div className="terminal-line">
                  <span className="prompt">&gt;</span> electron {appInfo?.electronVersion ?? '…'}
                </div>
                <div className="terminal-line">
                  <span className="prompt">&gt;</span> chrome {appInfo?.chromeVersion ?? '…'}
                </div>
                <div className="terminal-line">
                  <span className="prompt">&gt;</span> node {appInfo?.nodeVersion ?? '…'}
                </div>
                <div className="terminal-line">
                  <span className="prompt">&gt;</span> platform {appInfo?.platform ?? '…'}
                </div>
                <div className="terminal-line">
                  <span className="prompt">&gt;</span> userData {appInfo?.userDataPath ?? '…'}
                </div>
                {error ? (
                  <div className="terminal-line error">
                    <span className="prompt">&gt;</span> IPC 连接失败：{error}
                  </div>
                ) : null}
                  </div>

                  <section className="info-panel" aria-label="应用状态">
                <div className="info-item">
                  <span>IPC</span>
                  <strong className={error ? 'error-text' : 'ok-text'}>
                    {error ? '失败' : '已连接'}
                  </strong>
                </div>
                <div className="info-item">
                  <span>启动时间</span>
                  <strong>{formatTime(appInfo?.startedAt)}</strong>
                </div>
                <div className="info-item">
                  <span>数据目录</span>
                  <strong className="truncate">{appInfo?.userDataPath ?? '…'}</strong>
                </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {menu ? (
        <div
          className="context-menu"
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
              恢复
            </button>
          ) : null}
          <button
            type="button"
            disabled={!menuSession}
            onClick={() => {
              if (menuSession) void copySessionText(menu.sessionId);
              setMenu(null);
            }}
          >
            复制内容
          </button>
          <button
            type="button"
            onClick={() => {
              if (menu.cwd) void navigator.clipboard.writeText(menu.cwd);
              setMenu(null);
            }}
          >
            复制路径
          </button>
        </div>
      ) : null}
    </div>
  );
}
