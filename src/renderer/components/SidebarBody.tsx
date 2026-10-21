import {
  ChevronRight,
  FolderOpen,
  Pin,
  Search,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import type { AgentStatusStyle, GroupRecord, SessionRecord } from '../../shared/types';
import {
  formatSessionTitle,
  recordTitle,
  renderTime,
  statusLabel,
  type GroupSection,
  type Mode,
  type SessionView,
} from '../session-utils';
import { type AgentStatus } from '../hooks/useAgentStatus';
import { AgentStatusMark } from './AgentStatusMark';
import { SessionList } from './SessionList';

interface SidebarBodyData {
  mode: Mode;
  query: string;
  loadingList: boolean;
  sessions: SessionView[];
  records: SessionRecord[];
  sessionStatuses: Record<string, AgentStatus>;
  agentStatusStyle: AgentStatusStyle;
  activeId: string | null;
  detailSessionId: string | null;
  renamingId: string | null;
  groupRenameId: string | null;
  collapsedSections: Set<string>;
  historyRecords: SessionRecord[];
  archivedRecords: SessionRecord[];
  archivedGroupSections: {
    key: string;
    group: GroupRecord;
    records: SessionRecord[];
    collapsed: boolean;
  }[];
  archivedUngrouped: SessionRecord[];
  archiveIndexByKey: Map<string, number>;
  groupSections: GroupSection[];
  ungroupedRunning: SessionView[];
  ungroupedHistory: SessionRecord[];
  rowIndexByKey: Map<string, number>;
  navClass: (index: number) => string;
  /** 键盘导航焦点行的全局下标（-1 表示无焦点）。 */
  activeNav: number;
  selectedArchiveIds: Set<string>;
  confirmingDelete: boolean;
  archiveSelectMode: boolean;
  historySelectMode: boolean;
  selectedHistoryIds: Set<string>;
  archivingSelection: boolean;
}

interface SidebarBodyActions {
  setMode: (mode: Mode) => void;
  setQuery: (query: string) => void;
  onSearchClear: () => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
  bodyRef: RefObject<HTMLDivElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  setActiveId: (id: string) => void;
  openHistory: (record: SessionRecord) => void;
  openArchivedSession: (record: SessionRecord) => void;
  openContextMenu: (sessionId: string, cwd: string, archived: boolean, x: number, y: number) => void;
  commitRename: (sessionId: string, name: string) => void;
  setRenamingId: (id: string | null) => void;
  commitGroupRename: (id: string, name: string) => void;
  setGroupRenameId: (id: string | null) => void;
  toggleGroupCollapse: (key: string) => void;
  toggleSectionCollapse: (key: 'current' | 'history') => void;
  openGroupMenu: (id: string, name: string, x: number, y: number) => void;
  openSectionMenu: (x: number, y: number, kind?: 'history' | 'archive') => void;
  toggleArchiveSelect: (sessionId: string) => void;
  toggleSelectAllArchived: () => void;
  handleDeleteArchived: () => void;
  setConfirmingDelete: (confirming: boolean) => void;
  toggleSelectMode: () => void;
  toggleHistorySelectMode: () => void;
  toggleHistorySelect: (sessionId: string) => void;
  toggleSelectAllHistory: () => void;
  handleArchiveSelectedHistory: () => void;
}

export function SidebarBody({ data, actions }: { data: SidebarBodyData; actions: SidebarBodyActions }) {
  const {
    mode,
    query,
    loadingList,
    sessions,
    records,
    sessionStatuses,
    agentStatusStyle,
    activeId,
    detailSessionId,
    renamingId,
    groupRenameId,
    collapsedSections,
    historyRecords,
    archivedRecords,
    archivedGroupSections,
    archivedUngrouped,
    archiveIndexByKey,
    groupSections,
    ungroupedRunning,
    ungroupedHistory,
    rowIndexByKey,
    navClass,
    activeNav,
    selectedArchiveIds,
    confirmingDelete,
    archiveSelectMode,
    historySelectMode,
    selectedHistoryIds,
    archivingSelection,
  } = data;
  const {
    setMode,
    setQuery,
    onSearchClear,
    onKeyDown,
    bodyRef,
    searchInputRef,
    setActiveId,
    openHistory,
    openArchivedSession,
    openContextMenu,
    commitRename,
    setRenamingId,
    commitGroupRename,
    setGroupRenameId,
    toggleGroupCollapse,
    toggleSectionCollapse,
    openGroupMenu,
    openSectionMenu,
    toggleArchiveSelect,
    toggleSelectAllArchived,
    handleDeleteArchived,
    setConfirmingDelete,
    toggleSelectMode,
    toggleHistorySelectMode,
    toggleHistorySelect,
    toggleSelectAllHistory,
    handleArchiveSelectedHistory,
  } = actions;

  const renderRunningRow = (session: SessionView, rowIndex: number): ReactNode => (
    <li key={session.id}>
      {renamingId === session.sessionId ? (
        <div className="session-row renaming">
          <input
            className="session-rename-input"
            autoFocus
            defaultValue={session.customName ?? formatSessionTitle(session)}
            onBlur={(event) =>
              void commitRename(session.sessionId ?? '', event.currentTarget.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void commitRename(session.sessionId ?? '', event.currentTarget.value);
              } else if (event.key === 'Escape') {
                setRenamingId(null);
              }
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className={`session-row ${session.id === activeId ? 'active' : ''}${navClass(rowIndex)}`}
          data-nav-index={rowIndex}
          onClick={() => setActiveId(session.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (session.sessionId) {
              openContextMenu(
                session.sessionId,
                session.cwd,
                records.some(
                  (record) => record.sessionId === session.sessionId && record.archived,
                ),
                event.clientX,
                event.clientY,
              );
            }
          }}
        >
          {agentStatusStyle === 'dot' ? (
            <span
              className={`session-dot ${session.status}`}
              title={statusLabel(session.status)}
            />
          ) : (
            <AgentStatusMark
              status={sessionStatuses[session.id] ?? 'idle'}
              style={agentStatusStyle}
              className="session-agent"
            />
          )}
          <div className="session-main">
            <span className="session-title-line">
              {records.find((r) => r.sessionId === session.sessionId)?.pinned ? (
                <Pin size={10} className="session-pin" />
              ) : null}
              <span className="session-title">{formatSessionTitle(session)}</span>
            </span>
            <span className="session-sub" title={session.cwd}>
              {session.cwd}
            </span>
          </div>
          {renderTime(records.find((r) => r.sessionId === session.sessionId)?.updatedAt)}
        </button>
      )}
    </li>
  );

  const renderHistoryRow = (record: SessionRecord, rowIndex: number): ReactNode => {
    const checked = selectedHistoryIds.has(record.sessionId);
    return (
    <li key={record.sessionId} className={`session-item${checked ? ' checked' : ''}`}>
      {historySelectMode ? (
        <input
          type="checkbox"
          className="archive-check"
          aria-label={`选择 ${recordTitle(record)}`}
          checked={checked}
          onChange={() => toggleHistorySelect(record.sessionId)}
        />
      ) : null}
      {renamingId === record.sessionId ? (
        <div className="session-row renaming">
          <input
            className="session-rename-input"
            autoFocus
            defaultValue={recordTitle(record)}
            onBlur={(event) => void commitRename(record.sessionId, event.currentTarget.value)}
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
          className={`session-row${navClass(rowIndex)}`}
          data-nav-index={rowIndex}
          onClick={(event) => {
            if (historySelectMode) {
              toggleHistorySelect(record.sessionId);
              return;
            }
            // Ctrl/⌘ + 点击：进入多选并选中这一行（不常驻任何按钮）
            if (event.ctrlKey || event.metaKey) {
              toggleHistorySelectMode();
              toggleHistorySelect(record.sessionId);
              return;
            }
            void openHistory(record);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenu(record.sessionId, record.cwd, false, event.clientX, event.clientY);
          }}
        >
          <span className="session-dot ended" title="已结束" />
          <div className="session-main">
            <span className="session-title-line">
              {record.pinned ? <Pin size={10} className="session-pin" /> : null}
              <span className="session-title">{recordTitle(record)}</span>
              {record.tags?.length ? (
                <span className="session-tags">
                  {record.tags.slice(0, 3).map((tag) => (
                    <i key={tag}>{tag}</i>
                  ))}
                </span>
              ) : null}
            </span>
            <span className="session-sub" title={record.cwd || ''}>
              {record.summary || record.cwd || '未知目录'}
            </span>
          </div>
          {renderTime(record.updatedAt)}
        </button>
      )}
    </li>
    );
  };

  const renderArchiveRow = (record: SessionRecord, rowIndex: number): ReactNode => {
    const checked = selectedArchiveIds.has(record.sessionId);
    return (
      <li key={record.sessionId} className={`archive-row${checked ? ' checked' : ''}`}>
        {archiveSelectMode ? (
          <input
            type="checkbox"
            className="archive-check"
            aria-label={`选择 ${recordTitle(record)}`}
            checked={checked}
            onChange={() => toggleArchiveSelect(record.sessionId)}
          />
        ) : null}
        <button
          type="button"
          className={`session-row archive-row-main ${
            sessions.some(
              (session) => session.sessionId === record.sessionId && session.id === activeId,
            ) || detailSessionId === record.sessionId
              ? 'active'
              : ''
          }${navClass(rowIndex)}`}
          data-nav-index={rowIndex}
          onClick={(event) => {
            if (archiveSelectMode) {
              toggleArchiveSelect(record.sessionId);
              return;
            }
            if (event.ctrlKey || event.metaKey) {
              toggleSelectMode();
              toggleArchiveSelect(record.sessionId);
              return;
            }
            void openArchivedSession(record);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openContextMenu(record.sessionId, record.cwd, true, event.clientX, event.clientY);
          }}
        >
          <span className="session-dot ended" title="已结束" />
          <div className="session-main">
            <span className="session-title-line">
              {record.pinned ? <Pin size={10} className="session-pin" /> : null}
              <span className="session-title">{recordTitle(record)}</span>
            </span>
            <span className="session-sub" title={record.cwd || ''}>
              {record.cwd || '未知目录'}
            </span>
          </div>
        </button>
      </li>
    );
  };

  const renderGroupBlock = (section: GroupSection): ReactNode => (
    <section key={section.key} className="group-block">
      <div
        className="group-header"
        role="button"
        tabIndex={0}
        aria-expanded={!section.collapsed}
        onClick={() => toggleGroupCollapse(section.key)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleGroupCollapse(section.key);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openGroupMenu(
            section.group?.id ?? '',
            section.group?.name ?? '',
            event.clientX,
            event.clientY,
          );
        }}
      >
        <ChevronRight size={12} className={`group-chevron${section.collapsed ? '' : ' open'}`} />
        {section.group ? (
          <span className="group-color-dot" style={{ background: section.group.color }} />
        ) : (
          <span className="group-color-dot none" />
        )}
        {groupRenameId === section.group?.id ? (
          <input
            className="session-rename-input group-rename-input"
            autoFocus
            defaultValue={section.group?.name ?? ''}
            onBlur={(event) =>
              void commitGroupRename(section.group?.id ?? '', event.currentTarget.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void commitGroupRename(section.group?.id ?? '', event.currentTarget.value);
              } else if (event.key === 'Escape') {
                setGroupRenameId(null);
              }
            }}
          />
        ) : (
          <span className="group-name">{section.group?.name ?? '分组'}</span>
        )}
        <span className="group-count">{section.items.length}</span>
      </div>
      {!section.collapsed ? (
        <SessionList
          items={section.items}
          firstIndex={
            section.items.length
              ? (rowIndexByKey.get(section.items[0].key) ?? 0)
              : 0
          }
          focusIndex={activeNav}
          scrollRef={bodyRef}
          renderRow={(item, rowIndex) => {
            if (item.kind === 'running') {
              const session = sessions.find((s) => s.id === item.id);
              return session ? renderRunningRow(session, rowIndex) : null;
            }
            const record = records.find((r) => r.sessionId === item.sessionId);
            return record ? renderHistoryRow(record, rowIndex) : null;
          }}
        />
      ) : null}
    </section>
  );

  return (
    <>
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
            onClick={onSearchClear}
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
      </div>

      <div
        className="sidebar-body"
        ref={bodyRef}
        tabIndex={0}
        aria-label="会话列表"
        onKeyDown={onKeyDown}
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
              {groupSections.length > 0 ? (
                <section className="session-group group-section">
                  <div className="group-label">分组</div>
                  {groupSections.map(renderGroupBlock)}
                </section>
              ) : null}

              {ungroupedRunning.length > 0 ? (
                <section className="session-group">
                  <button
                    type="button"
                    className={`group-label section-toggle${collapsedSections.has('current') ? '' : ' open'}`}
                    aria-expanded={!collapsedSections.has('current')}
                    onClick={() => toggleSectionCollapse('current')}
                  >
                    <ChevronRight size={11} className="section-chevron" />
                    当前会话
                    <span className="group-count">{ungroupedRunning.length}</span>
                  </button>
                  {!collapsedSections.has('current') ? (
                    <SessionList
                      items={ungroupedRunning}
                      firstIndex={
                        ungroupedRunning.length
                          ? (rowIndexByKey.get(`s:${ungroupedRunning[0].id}`) ?? 0)
                          : 0
                      }
                      focusIndex={activeNav}
                      scrollRef={bodyRef}
                      renderRow={(session, rowIndex) => renderRunningRow(session, rowIndex)}
                    />
                  ) : null}
                </section>
              ) : null}

              {ungroupedHistory.length > 0 ? (
                <section className={`session-group${historySelectMode ? ' selecting' : ''}`}>
                  <button
                    type="button"
                    className={`group-label section-toggle${collapsedSections.has('history') ? '' : ' open'}`}
                    aria-expanded={!collapsedSections.has('history')}
                    title={historySelectMode ? undefined : '右键可多选归档'}
                    onClick={() => toggleSectionCollapse('history')}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openSectionMenu(event.clientX, event.clientY);
                    }}
                  >
                    <ChevronRight size={11} className="section-chevron" />
                    历史会话
                    <span className="group-count">{ungroupedHistory.length}</span>
                  </button>
                  {historySelectMode && !collapsedSections.has('history') ? (
                    <div className="bulk-bar">
                      <button
                        type="button"
                        className="archive-toolbar-btn"
                        onClick={toggleSelectAllHistory}
                      >
                        {selectedHistoryIds.size > 0 &&
                        selectedHistoryIds.size === ungroupedHistory.length
                          ? '取消全选'
                          : '全选'}
                      </button>
                      <span className="archive-selected-count">
                        {selectedHistoryIds.size} 已选
                      </span>
                      <button
                        type="button"
                        className="archive-toolbar-btn primary"
                        disabled={selectedHistoryIds.size === 0 || archivingSelection}
                        onClick={handleArchiveSelectedHistory}
                      >
                        {archivingSelection ? '归档中…' : '归档'}
                      </button>
                      <button
                        type="button"
                        className="archive-toolbar-btn"
                        onClick={toggleHistorySelectMode}
                      >
                        完成
                      </button>
                    </div>
                  ) : null}
                  {!collapsedSections.has('history') ? (
                    <SessionList
                      items={ungroupedHistory}
                      firstIndex={
                        ungroupedHistory.length
                          ? (rowIndexByKey.get(`h:${ungroupedHistory[0].sessionId}`) ?? 0)
                          : 0
                      }
                      focusIndex={activeNav}
                      scrollRef={bodyRef}
                      renderRow={(record, rowIndex) => renderHistoryRow(record, rowIndex)}
                    />
                  ) : null}
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
            <>
              <div
                className="group-label section-plain"
                title="右键可多选删除"
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openSectionMenu(event.clientX, event.clientY, 'archive');
                }}
              >
                归档
                <span className="group-count">{archivedRecords.length}</span>
              </div>
              {archiveSelectMode ? (
                <div className="bulk-bar">
                  <>
                    <button
                      type="button"
                      className="archive-toolbar-btn"
                      onClick={toggleSelectAllArchived}
                    >
                      {selectedArchiveIds.size > 0 &&
                      selectedArchiveIds.size === archivedRecords.length
                        ? '取消全选'
                        : '全选'}
                    </button>
                    {selectedArchiveIds.size > 0 ? (
                      <button
                        type="button"
                        className={`archive-toolbar-btn danger${confirmingDelete ? ' confirming' : ''}`}
                        onClick={() => {
                          if (!confirmingDelete) {
                            setConfirmingDelete(true);
                            return;
                          }
                          void handleDeleteArchived();
                        }}
                      >
                        <Trash2 size={12} />
                        <span>{confirmingDelete ? `确认删除 ${selectedArchiveIds.size} 个？` : '删除'}</span>
                      </button>
                    ) : null}
                    <span className="archive-selected-count">{selectedArchiveIds.size} 已选</span>
                    <button type="button" className="archive-toolbar-btn" onClick={toggleSelectMode}>
                      完成
                    </button>
                  </>
                </div>
              ) : null}
              {archivedGroupSections.map((section) => (
                <section key={section.key} className="group-block">
                  <div
                    className="group-header"
                    role="button"
                    tabIndex={0}
                    aria-expanded={!section.collapsed}
                    onClick={() => toggleGroupCollapse(section.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleGroupCollapse(section.key);
                      }
                    }}
                  >
                    <ChevronRight
                      size={12}
                      className={`group-chevron${section.collapsed ? '' : ' open'}`}
                    />
                    <span
                      className="group-color-dot"
                      style={{ background: section.group.color }}
                    />
                    <span className="group-name">{section.group.name}</span>
                    <span className="group-count">{section.records.length}</span>
                  </div>
                  {!section.collapsed ? (
                    <SessionList
                      items={section.records}
                      firstIndex={archiveIndexByKey.get(`a:${section.records[0].sessionId}`) ?? 0}
                      focusIndex={activeNav}
                      scrollRef={bodyRef}
                      renderRow={(record, k) => renderArchiveRow(record, k)}
                    />
                  ) : null}
                </section>
              ))}
              {archivedUngrouped.length > 0 ? (
                <section className="group-block">
                  {archivedGroupSections.length > 0 ? (
                    <div className="group-label section-plain">
                      未分组
                      <span className="group-count">{archivedUngrouped.length}</span>
                    </div>
                  ) : null}
                  <SessionList
                    items={archivedUngrouped}
                    firstIndex={archiveIndexByKey.get(`a:${archivedUngrouped[0].sessionId}`) ?? 0}
                    focusIndex={activeNav}
                    scrollRef={bodyRef}
                    renderRow={(record, k) => renderArchiveRow(record, k)}
                  />
                </section>
              ) : null}
            </>
          )
        ) : (
          <div className="empty-state">
            <Search size={20} strokeWidth={1.6} />
            <span>输入关键词开始搜索</span>
          </div>
        )}
      </div>
    </>
  );
}
