import { useMemo } from 'react';
import type { GroupRecord, SessionRecord } from '../../shared/types';
import type { GroupSection, GroupSectionItem, Mode, SessionView } from '../session-utils';

/**
 * 会话列表的派生数据（历史/归档拆分、分组区块、未分组回落、导航序号、日历计数）。
 *
 * 从 App 抽出来的：这一串 useMemo / 纯计算约 130 行，输入只有 records/sessions/groups/
 * 折叠状态/mode/navIndex，输出是渲染层直接吃的结构。搬出来后 App 只留一行调用。
 */
export function useSessionLists({
  records,
  sessions,
  groups,
  collapsedGroups,
  mode,
  navIndex,
}: {
  records: SessionRecord[];
  sessions: SessionView[];
  groups: GroupRecord[];
  collapsedGroups: Set<string>;
  mode: Mode;
  navIndex: number;
}) {
function withPinnedFirst<T>(items: T[], isPinned: (item: T) => boolean): T[] {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isPinned(item) ? pinned : rest).push(item);
  return [...pinned, ...rest];
}


  const historyRecords = records.filter(
    (record) => !record.archived && !sessions.some((s) => s.sessionId === record.sessionId),
  );
  const archivedRecords = records.filter((record) => record.archived);

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

  // 归档视图也按分组归类：归档时 meta 里的 group 是保留的，所以归档后还能回到原分组，
  // 不至于"归档完就找不到了"。分组被删掉的记录回落到"未分组"。
  const archivedGroupSections = useMemo(() => {
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const byGroup = new Map<string, SessionRecord[]>();
    for (const record of archivedRecords) {
      const groupId = record.group;
      if (!groupId || !groupById.has(groupId)) continue;
      const list = byGroup.get(groupId) ?? [];
      list.push(record);
      byGroup.set(groupId, list);
    }
    return groups
      .map((group) => ({
        key: group.id,
        group,
        records: withPinnedFirst(byGroup.get(group.id) ?? [], (record) => record.pinned === true),
        collapsed: collapsedGroups.has(group.id),
      }))
      .filter((section) => section.records.length > 0);
  }, [groups, archivedRecords, collapsedGroups]);

  const archivedUngrouped = useMemo(
    () =>
      withPinnedFirst(
        archivedRecords.filter(
          (record) => !record.group || !groups.some((group) => group.id === record.group),
        ),
        (record) => record.pinned === true,
      ),
    [groups, archivedRecords],
  );

  /** 归档视图的实际渲染顺序（分组区块 → 未分组），键盘导航与行下标都按它算。 */
  const archivedRows = useMemo(
    () => [
      ...archivedGroupSections.flatMap((section) => (section.collapsed ? [] : section.records)),
      ...archivedUngrouped,
    ],
    [archivedGroupSections, archivedUngrouped],
  );
  const archiveIndexByKey = useMemo(
    () => new Map(archivedRows.map((record, index) => [`a:${record.sessionId}`, index])),
    [archivedRows],
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
        ? archivedRows.map((record) => ({
            key: `a:${record.sessionId}`,
            kind: 'archived' as const,
            sessionId: record.sessionId,
            cwd: record.cwd,
          }))
        : [];
  const activeNav = navItems.length ? Math.min(navIndex, navItems.length - 1) : -1;

  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      const date = (record.updatedAt || '').slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return counts;
  }, [records]);

  return {
    historyRecords,
    archivedRecords,
    archivedGroupSections,
    archivedUngrouped,
    archiveIndexByKey,
    groupSections,
    ungroupedRunning,
    ungroupedHistory,
    rowIndexByKey,
    navItems,
    activeNav,
    sessionCounts,
  };
}
