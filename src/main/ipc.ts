import { app, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  AppInfo,
  ArchiveSessionResult,
  ClaudeConfigInfo,
  CreateSessionResult,
  ExportResult,
  GroupOpResult,
  GroupRecord,
  PickClaudeDirResult,
  PickDirectoryResult,
  ReadSessionTextResult,
  RenameSessionResult,
  RestoreSessionResult,
  ResumeSessionResult,
  SessionDetailResult,
  SessionRecord,
  SearchResult,
  SessionUsage,
  SummarizeSessionResult,
  DaySummarizeResult,
  DeleteSessionsResult,
  DashboardStats,
  KnowledgeExportResult,
  SummaryHistoryResult,
  SummaryGetResult,
  ThemeName,
  UiState,
  UsageTrendDay,
} from '../shared/types';
import {
  readClaudeConfigInfo,
  readConfig,
  resolveClaudeHome,
  writeConfig,
} from './config';
import { getMainWindow } from './window-manager';
import {
  findSessionFile,
  getCurrentHourUsage,
  getUsageTrend,
  listSessions,
  readChatEntries,
  readSessionDetail,
  readSessionInfo,
  readSessionUsage,
  searchSessions,
} from './session-library';
import { buildMarkdown } from './export';
import { getRecentDirs, recordRecentDir } from './recent-dirs';
import { generateProjectKnowledge, exportKnowledgeToFile } from './knowledge';
import {
  getKnowledgeMeta,
  getKnowledgeText,
  listKnowledge,
  saveKnowledge,
  type KnowledgeItem,
} from './knowledge-store';
import { summarizeDayText, summarizeMonthText, summarizeSession, summarizeWeekText } from './summarize';
import { getSummaryText, listSummaries, saveSummary, type SummaryKind } from './summary-store';
import { listKnowledge as listKnowledgeItems } from './knowledge-store';
import { DEFAULT_HOURLY_LIMIT } from './usage-warning';
import { readUiState, writeUiState } from './ui-state';
import type { GroupStore } from './group-store';
import type { SessionMetaStore } from './session-meta-store';
import type { SessionManager } from './session-manager';
import type { SessionWatcher } from './session-watcher';

const startedAt = new Date().toISOString();

export function registerIpcHandlers(
  sessions: SessionManager,
  watcher: SessionWatcher,
  metaStore: SessionMetaStore,
  groups: GroupStore,
  onClaudeDirChanged: () => void,
): void {
  const locateSessionFile = async (sessionId: string, cwd?: string): Promise<string | null> => {
    const claudeHome = resolveClaudeHome(readConfig());
    let filePath = '';
    const runningId = sessions.findBySessionId(sessionId);
    if (runningId) {
      const info = sessions.getSession(runningId);
      if (info?.cwd) {
        filePath = path.join(
          claudeHome,
          'projects',
          info.cwd.replace(/[\\:]/g, '-'),
          `${sessionId}.jsonl`,
        );
      }
    }
    if (!filePath || !fs.existsSync(filePath)) {
      const meta = metaStore.get(sessionId);
      if (meta.archivedPath && fs.existsSync(meta.archivedPath)) {
        filePath = meta.archivedPath;
      }
    }
    if (!filePath || !fs.existsSync(filePath)) {
      const found = await findSessionFile(claudeHome, sessionId);
      if (found) filePath = found;
    }
    return filePath && fs.existsSync(filePath) ? filePath : null;
  };

  ipcMain.handle(IpcChannel.appGetInfo, (): AppInfo => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    startedAt,
  }));

  ipcMain.handle(IpcChannel.configGet, (): ClaudeConfigInfo => readClaudeConfigInfo());

  ipcMain.handle(
    IpcChannel.configSetClaudeDir,
    (_event, dir: string | null): ClaudeConfigInfo => {
      writeConfig({ claudeDir: dir ?? undefined });
      onClaudeDirChanged();
      return readClaudeConfigInfo();
    },
  );

  ipcMain.handle(
    IpcChannel.configSetTheme,
    (_event, theme: ThemeName): ClaudeConfigInfo => {
      writeConfig({ ...readConfig(), theme });
      return readClaudeConfigInfo();
    },
  );

  ipcMain.handle(IpcChannel.configPickClaudeDir, async (): Promise<PickClaudeDirResult> => {
    const result = await dialog.showOpenDialog({
      title: '选择 Claude 目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { dir: null };
    return { dir: result.filePaths[0] };
  });

  ipcMain.handle(IpcChannel.sessionsList, async (): Promise<SessionRecord[]> =>
    listSessions(resolveClaudeHome(readConfig()), metaStore),
  );

  ipcMain.handle(IpcChannel.recentDirsGet, (): string[] => getRecentDirs());

  ipcMain.handle(IpcChannel.groupsList, (): GroupRecord[] => groups.list());

  ipcMain.handle(IpcChannel.groupsCreate, (_event, name: string): GroupRecord => {
    return groups.create(typeof name === 'string' ? name : '');
  });

  ipcMain.handle(
    IpcChannel.groupsRename,
    (_event, payload: { id: string; name: string }): GroupOpResult => {
      if (!payload.name.trim()) return { ok: false, message: '名称不能为空' };
      if (!groups.rename(payload.id, payload.name)) return { ok: false, message: '分组不存在' };
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.groupsDelete,
    (_event, id: string): GroupOpResult => {
      if (!groups.delete(id)) return { ok: false, message: '分组不存在' };
      metaStore.clearGroup(id);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.groupsSetColor,
    (_event, payload: { id: string; color: string }): GroupOpResult => {
      if (!groups.setColor(payload.id, payload.color)) return { ok: false, message: '分组不存在' };
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionSetGroup,
    (_event, payload: { sessionId: string; groupId: string | null }): GroupOpResult => {
      const sessionId = payload.sessionId.trim();
      if (!sessionId) return { ok: false, message: '缺少会话信息' };
      metaStore.setGroup(sessionId, payload.groupId);
      return { ok: true };
    },
  );

  ipcMain.handle(IpcChannel.sessionPickDirectory, async (): Promise<PickDirectoryResult> => {
    const result = await dialog.showOpenDialog({
      title: '选择会话工作目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { cwd: null };
    return { cwd: result.filePaths[0] };
  });

  ipcMain.handle(IpcChannel.sessionCreate, (_event, cwd: string): CreateSessionResult => {
    const resolved = path.resolve(cwd);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error('所选目录不存在或不是文件夹');
    }
    recordRecentDir(resolved);
    const created = sessions.create(resolved);
    const { id } = created;
    watcher.registerPending(id, resolved);
    return created;
  });

  ipcMain.handle(
    IpcChannel.sessionResume,
    (_event, payload: { sessionId: string; cwd: string }): ResumeSessionResult => {
      const created = sessions.resume(payload.cwd, payload.sessionId);
      sessions.bind(created.id, payload.sessionId);
      return created;
    },
  );

  ipcMain.handle(
    IpcChannel.sessionRename,
    (_event, payload: { sessionId: string; name: string }): RenameSessionResult => {
      const sessionId = payload.sessionId.trim();
      const name = payload.name.trim();
      if (!sessionId) return { ok: false, message: '会话尚未绑定，无法重命名' };
      if (!name) return { ok: false, message: '名称不能为空' };
      metaStore.rename(sessionId, name);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionArchive,
    async (_event, payload: { sessionId: string; cwd?: string }): Promise<ArchiveSessionResult> => {
      const sessionId = payload.sessionId.trim();
      if (!sessionId) {
        return { ok: false, message: '缺少会话信息，无法归档' };
      }

      const runningId = sessions.findBySessionId(sessionId);
      if (runningId) {
        sessions.close(runningId);
        await sessions.waitForExit(runningId, 3000);
        // pty 未及时退出时兜底清理，避免僵尸会话阻塞后续删除/归档。
        sessions.remove(runningId);
      }

      const claudeHome = resolveClaudeHome(readConfig());
      let source = '';
      if (payload.cwd) {
        source = path.join(
          claudeHome,
          'projects',
          payload.cwd.replace(/[\\:]/g, '-'),
          `${sessionId}.jsonl`,
        );
      }
      if (!source || !fs.existsSync(source)) {
        const found = await findSessionFile(claudeHome, sessionId);
        if (found) source = found;
      }
      if (!fs.existsSync(source)) {
        return { ok: false, message: '找不到会话记录文件' };
      }

      const sessionInfo = await readSessionInfo(source);
      const resolvedCwd = payload.cwd || sessionInfo.cwd || '';
      const encodedDir = resolvedCwd
        ? resolvedCwd.replace(/[\\:]/g, '-')
        : path.basename(path.dirname(source));
      const archiveDir = path.join(app.getPath('userData'), 'archive', encodedDir);
      const destination = path.join(archiveDir, `${sessionId}.jsonl`);

      try {
        fs.mkdirSync(archiveDir, { recursive: true });
        if (fs.existsSync(destination)) {
          fs.rmSync(destination, { force: true });
        }
        fs.renameSync(source, destination);
      } catch {
        try {
          fs.copyFileSync(source, destination);
          fs.rmSync(source, { force: true });
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }

      metaStore.archive(sessionId, resolvedCwd, destination);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.archiveRestore,
    async (_event, payload: { sessionId: string; cwd?: string }): Promise<RestoreSessionResult> => {
      const sessionId = payload.sessionId.trim();
      if (!sessionId) {
        return { ok: false, message: '缺少会话信息，无法恢复' };
      }
      const claudeHome = resolveClaudeHome(readConfig());
      const meta = metaStore.get(sessionId);
      const source = meta.archivedPath && fs.existsSync(meta.archivedPath)
        ? meta.archivedPath
        : '';
      if (!source) {
        const found = await findSessionFile(claudeHome, sessionId);
        if (found && fs.existsSync(found)) {
          metaStore.restore(sessionId);
          return { ok: true };
        }
        return { ok: false, message: '找不到归档文件' };
      }
      const sessionInfo = await readSessionInfo(source);
      const resolvedCwd = payload.cwd || sessionInfo.cwd || '';
      const encodedDir = resolvedCwd
        ? resolvedCwd.replace(/[\\:]/g, '-')
        : path.basename(path.dirname(source));
      const destinationDir = path.join(claudeHome, 'projects', encodedDir);
      const destination = path.join(destinationDir, `${sessionId}.jsonl`);
      try {
        fs.mkdirSync(destinationDir, { recursive: true });
        if (fs.existsSync(destination)) {
          fs.rmSync(destination, { force: true });
        }
        fs.renameSync(source, destination);
      } catch {
        try {
          fs.copyFileSync(source, destination);
          fs.rmSync(source, { force: true });
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }
      metaStore.restore(sessionId);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionDelete,
    async (_event, payload: { sessionIds: string[] }): Promise<DeleteSessionsResult> => {
      const ids = Array.isArray(payload.sessionIds)
        ? payload.sessionIds.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        : [];
      if (ids.length === 0) return { ok: false, message: '没有选择要删除的会话' };
      const claudeHome = resolveClaudeHome(readConfig());
      const archiveRoot = path.join(app.getPath('userData'), 'archive');
      const deleted: string[] = [];
      const errors: string[] = [];
      for (const sessionId of ids) {
        // 借出运行中的会话：先关闭 pty（超时兜底清理僵尸记录），再删文件。
        const runningId = sessions.findBySessionId(sessionId);
        if (runningId) {
          sessions.close(runningId);
          await sessions.waitForExit(runningId, 1500);
          sessions.remove(runningId);
        }
        const meta = metaStore.get(sessionId);
        let filePath =
          meta.archivedPath && fs.existsSync(meta.archivedPath) ? meta.archivedPath : '';
        if (!filePath) {
          const found = await findSessionFile(archiveRoot, sessionId);
          if (found) filePath = found;
        }
        if (!filePath) {
          // 借出未收回时文件在 projects 下；找不到任何文件则只清理元数据。
          const foundProject = await findSessionFile(claudeHome, sessionId);
          if (foundProject) filePath = foundProject;
        }
        if (filePath) {
          try {
            fs.rmSync(filePath, { force: true });
          } catch (error) {
            errors.push(`${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
          }
        }
        metaStore.remove(sessionId);
        deleted.push(sessionId);
      }
      if (deleted.length === 0) {
        const detail = errors.length > 0 ? `（${errors[0]}）` : '';
        return { ok: false, message: `没有可删除的会话${detail}` };
      }
      return { ok: true, deleted };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionDetail,
    async (_event, sessionId: string): Promise<SessionDetailResult> => {
      const filePath = await locateSessionFile(sessionId);
      if (!filePath) return { sessionId, entries: [] };
      const entries = await readSessionDetail(filePath);
      const info = await readSessionInfo(filePath);
      return { sessionId, title: info.title, cwd: info.cwd, entries };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionSummarize,
    async (_event, sessionId: string): Promise<SummarizeSessionResult> => {
      const filePath = await locateSessionFile(sessionId);
      if (!filePath) return { ok: false, message: '找不到会话记录' };
      const entries = await readChatEntries(filePath);
      const text = entries
        .map((entry) => `${entry.role === 'user' ? 'User' : 'Claude'}:\n${entry.text}`)
        .join('\n\n');
      if (!text.trim()) return { ok: false, message: '会话为空，无法总结' };
      try {
        const result = await summarizeSession(text);
        metaStore.setSummary(sessionId, result.summary, result.tags);
        return { ok: true, summary: result.summary, tags: result.tags };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.daySummarize,
    async (_event, date?: string): Promise<DaySummarizeResult> => {
      const day = date ?? new Date().toISOString().slice(0, 10);
      const claudeHome = resolveClaudeHome(readConfig());
      const combined = await collectRangeText(claudeHome, metaStore, day, day);
      if (!combined.trim()) return { ok: false, message: `${day} 没有可总结的会话` };
      try {
        const text = await summarizeDayText(combined);
        saveSummary('day', day, text);
        return { ok: true, text };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.monthSummarize,
    async (_event, month?: string): Promise<DaySummarizeResult> => {
      const key = month ?? new Date().toISOString().slice(0, 7);
      const claudeHome = resolveClaudeHome(readConfig());
      const combined = await collectRangeText(claudeHome, metaStore, `${key}-01`, `${key}-31`);
      if (!combined.trim()) return { ok: false, message: `${key} 没有可总结的会话` };
      try {
        const text = await summarizeMonthText(combined);
        saveSummary('month', key, text);
        return { ok: true, text };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.weekSummarize,
    async (_event, weekStart?: string): Promise<DaySummarizeResult> => {
      const claudeHome = resolveClaudeHome(readConfig());
      const [monday, sunday] = weekRangeFor(weekStart);
      const combined = await collectRangeText(claudeHome, metaStore, monday, sunday);
      if (!combined.trim()) return { ok: false, message: `${monday} 周没有可总结的会话` };
      try {
        const text = await summarizeWeekText(combined);
        saveSummary('week', monday, text);
        return { ok: true, text };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.summariesList,
    async (): Promise<SummaryHistoryResult> => ({
      days: listSummaries('day'),
      weeks: listSummaries('week'),
      months: listSummaries('month'),
    }),
  );

  ipcMain.handle(
    IpcChannel.summariesGet,
    async (_event, payload: { kind: SummaryKind; key: string }): Promise<SummaryGetResult> => {
      const text = getSummaryText(payload.kind, payload.key);
      return text ? { ok: true, text } : { ok: false, message: '找不到该总结' };
    },
  );

  ipcMain.handle(
    IpcChannel.summarySave,
    async (
      _event,
      payload: { kind: SummaryKind; key: string; text: string },
    ): Promise<SummaryGetResult> => {
      if (payload.kind !== 'day' && payload.kind !== 'week' && payload.kind !== 'month') {
        return { ok: false, message: '无效的总结类型' };
      }
      if (!payload.key.trim()) return { ok: false, message: '缺少日期' };
      try {
        saveSummary(payload.kind, payload.key.trim(), payload.text);
        return { ok: true, text: payload.text };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.knowledgeGenerate,
    async (_event, cwd: string, force?: boolean): Promise<SummaryGetResult> => {
      if (!cwd) return { ok: false, message: '缺少项目目录' };
      try {
        const text = await generateProjectKnowledge(
          resolveClaudeHome(readConfig()),
          metaStore,
          cwd,
          { force: force === true },
        );
        if (text === null) {
          return { ok: false, message: '知识库已是最新，暂无新增会话' };
        }
        return { ok: true, text };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    IpcChannel.knowledgeExport,
    async (_event, cwd: string): Promise<KnowledgeExportResult> => {
      if (!cwd) return { ok: false, message: '缺少项目目录' };
      const key = cwd.replace(/[\\:]/g, '-');
      const text = getKnowledgeText(key);
      if (!text) return { ok: false, message: '尚未生成知识库' };
      try {
        const filePath = exportKnowledgeToFile(cwd, text);
        return { ok: true, path: filePath };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.knowledgeList, (): KnowledgeItem[] => listKnowledge());

  ipcMain.handle(IpcChannel.dashboardStats, async (): Promise<DashboardStats> => {
    const claudeHome = resolveClaudeHome(readConfig());
    const records = await listSessions(claudeHome, metaStore);
    const today = new Date().toISOString().slice(0, 10);
    const todayRecords = records.filter(
      (record) => !record.archived && (record.updatedAt || '').slice(0, 10) === today,
    );
    const projectMap = new Map<string, number>();
    for (const record of todayRecords) {
      if (!record.cwd) continue;
      projectMap.set(record.cwd, (projectMap.get(record.cwd) ?? 0) + 1);
    }
    const trend = await getUsageTrend(claudeHome, metaStore, 1);
    const todayTokens = trend[0] ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    const limitPerHour = readConfig().tokenLimitPerHour ?? DEFAULT_HOURLY_LIMIT;
    const hour = await getCurrentHourUsage(claudeHome, metaStore);
    return {
      runningCount: sessions.list().length,
      todaySessionCount: todayRecords.length,
      todayTokens: {
        inputTokens: todayTokens.inputTokens,
        outputTokens: todayTokens.outputTokens,
        cacheReadTokens: todayTokens.cacheReadTokens,
      },
      todayProjects: [...projectMap.entries()]
        .map(([cwd, count]) => ({ cwd, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      knowledgeCount: listKnowledgeItems().length,
      hasTodaySummary: Boolean(getSummaryText('day', today)),
      hourlyTokens: hour.tokens,
      hourlyLimit: limitPerHour,
      hourlyPercent: Math.min(100, Math.round((hour.tokens / limitPerHour) * 100)),
    };
  });

  ipcMain.handle(
    IpcChannel.knowledgeGet,
    async (_event, key: string): Promise<SummaryGetResult> => {
      const text = getKnowledgeText(key);
      return text ? { ok: true, text } : { ok: false, message: '尚未生成知识库' };
    },
  );

  ipcMain.handle(
    IpcChannel.knowledgeSave,
    async (_event, payload: { key: string; text: string }): Promise<SummaryGetResult> => {
      if (!payload.key.trim()) return { ok: false, message: '缺少项目标识' };
      saveKnowledge(payload.key.trim(), payload.text);
      return { ok: true, text: payload.text };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionExport,
    async (_event, payload: { sessionId: string; cwd?: string }): Promise<ExportResult> => {
      const filePath = await locateSessionFile(payload.sessionId, payload.cwd);
      if (!filePath) return { ok: false, message: '找不到会话记录' };
      const entries = await readSessionDetail(filePath);
      const info = await readSessionInfo(filePath);
      const detail: SessionDetailResult = {
        sessionId: payload.sessionId,
        title: info.title,
        cwd: payload.cwd ?? info.cwd,
        entries,
      };
      const safeTitle = (info.title ?? payload.sessionId).replace(/[\\/:*?"<>|]/g, '_');
      const result = await dialog.showSaveDialog({
        title: '导出 Markdown',
        defaultPath: `${safeTitle}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, message: '已取消' };
      try {
        fs.writeFileSync(result.filePath, buildMarkdown(detail), 'utf8');
        return { ok: true, path: result.filePath };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.uiGetState, (): UiState => readUiState());

  ipcMain.handle(IpcChannel.uiSaveState, (_event, state: UiState): void => {
    writeUiState({
      openSessionIds: Array.isArray(state.openSessionIds) ? state.openSessionIds : [],
      activeSessionId: state.activeSessionId,
      collapsedGroups: Array.isArray(state.collapsedGroups) ? state.collapsedGroups : [],
      collapsedSections: Array.isArray(state.collapsedSections) ? state.collapsedSections : [],
    });
  });

  ipcMain.handle(IpcChannel.windowMinimize, (): void => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle(IpcChannel.windowToggleMaximize, (): boolean => {
    const window = getMainWindow();
    if (!window) return false;
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return window.isMaximized();
  });

  ipcMain.handle(IpcChannel.windowIsMaximized, (): boolean => {
    return getMainWindow()?.isMaximized() ?? false;
  });

  ipcMain.handle(IpcChannel.windowClose, (): void => {
    getMainWindow()?.close();
  });

  ipcMain.handle(IpcChannel.windowSetBackgroundColor, (_event, color: string): void => {
    getMainWindow()?.setBackgroundColor(color);
  });

  ipcMain.handle(
    IpcChannel.sessionReadText,
    async (_event, sessionId: string): Promise<ReadSessionTextResult> => {
      const filePath = await locateSessionFile(sessionId);
      if (!filePath) return { ok: false, text: '', message: '找不到会话记录' };
      const entries = await readChatEntries(filePath);
      const text = entries
        .map((entry) => `${entry.role === 'user' ? 'User' : 'Claude'}:\n${entry.text}`)
        .join('\n\n');
      return { ok: true, text };
    },
  );

  ipcMain.handle(
    IpcChannel.searchQuery,
    async (_event, query: string): Promise<SearchResult[]> =>
      searchSessions(query, metaStore, resolveClaudeHome(readConfig())),
  );

  ipcMain.handle(
    IpcChannel.sessionUsage,
    async (_event, id: string): Promise<SessionUsage> => {
      const info = sessions.getSession(id);
      if (!info?.sessionId || !info.cwd) return emptyUsage();
      const claudeHome = resolveClaudeHome(readConfig());
      const encodedDir = info.cwd.replace(/[\\:]/g, '-');
      const filePath = path.join(
        claudeHome,
        'projects',
        encodedDir,
        `${info.sessionId}.jsonl`,
      );
      if (!fs.existsSync(filePath)) return emptyUsage();
      return readSessionUsage(filePath);
    },
  );

  ipcMain.handle(
    IpcChannel.usageTrend,
    async (_event, days: number): Promise<UsageTrendDay[]> => {
      const safeDays = Number.isFinite(days) ? Math.min(90, Math.max(7, Math.floor(days))) : 14;
      return getUsageTrend(resolveClaudeHome(readConfig()), metaStore, safeDays);
    },
  );

  ipcMain.handle(
    IpcChannel.sessionWrite,
    (_event, payload: { id: string; data: string }): void => {
      sessions.write(payload.id, payload.data);
    },
  );

  ipcMain.handle(
    IpcChannel.sessionResize,
    (_event, payload: { id: string; cols: number; rows: number }): void => {
      sessions.resize(payload.id, payload.cols, payload.rows);
    },
  );

  ipcMain.handle(IpcChannel.sessionClose, (_event, id: string): void => {
    watcher.clearPending(id);
    sessions.close(id);
  });
}

/** 周一起始日期（YYYY-MM-DD，缺省为本周一）所在自然周的起止日期。 */
function weekRangeFor(monday?: string): [string, string] {
  const base = monday ? new Date(`${monday}T00:00:00`) : new Date();
  const day = base.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // 距本周一的偏移
  const start = new Date(base);
  start.setDate(base.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  return [fmt(start), fmt(end)];
}

/** 收集 [from, to] 日期区间内所有会话的可读文本（按会话分段）。 */
async function collectRangeText(
  claudeHome: string,
  metaStore: SessionMetaStore,
  from: string,
  to: string,
): Promise<string> {
  const records = await listSessions(claudeHome, metaStore);
  const inRange = records.filter((record) => {
    const date = (record.startedAt || '').slice(0, 10);
    return date >= from && date <= to;
  });
  const parts: string[] = [];
  for (const record of inRange) {
    try {
      const entries = await readChatEntries(record.filePath);
      const text = entries
        .map((entry) => `${entry.role === 'user' ? 'User' : 'Claude'}:\n${entry.text}`)
        .join('\n');
      if (text.trim()) {
        const name =
          record.customName ?? record.cwd.split(/[\\/]/).filter(Boolean).pop() ?? record.sessionId;
        parts.push(`## ${name}\n${text}`);
      }
    } catch {
      // 跳过无法读取的会话。
    }
  }
  return parts.join('\n\n');
}

function emptyUsage(): SessionUsage {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}
