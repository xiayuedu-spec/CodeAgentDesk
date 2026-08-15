import { app, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  ArchiveSessionResult,
  CreateSessionResult,
  DeleteSessionsResult,
  ExportResult,
  PickDirectoryResult,
  ReadSessionTextResult,
  RenameSessionResult,
  RestoreSessionResult,
  ResumeSessionResult,
  SearchResult,
  SessionDetailResult,
  SessionRecord,
  SessionUsage,
  SummarizeSessionResult,
} from '../shared/types';
import { readConfig, resolveClaudeHome } from './config';
import {
  findSessionFile,
  listSessions,
  readChatEntries,
  readSessionDetail,
  readSessionInfo,
  readSessionUsage,
  searchSessions,
} from './session-library';
import { buildMarkdown } from './export';
import { recordRecentDir } from './recent-dirs';
import { summarizeSession } from './summarize';
import type { SessionMetaStore } from './session-meta-store';
import type { SessionManager } from './session-manager';
import type { SessionWatcher } from './session-watcher';
import { emptyUsage, locateSessionFile } from './ipc-utils';

export interface SessionsIpcDeps {
  sessions: SessionManager;
  watcher: SessionWatcher;
  metaStore: SessionMetaStore;
}

/** 会话域 IPC：会话列表/创建/恢复/重命名/归档/删除/详情/总结/导出/终端 IO、搜索。 */
export function registerSessionsIpc({ sessions, watcher, metaStore }: SessionsIpcDeps): void {
  ipcMain.handle(IpcChannel.sessionsList, async (): Promise<SessionRecord[]> =>
    listSessions(resolveClaudeHome(readConfig()), metaStore),
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
      const filePath = await locateSessionFile(sessions, metaStore, sessionId);
      if (!filePath) return { sessionId, entries: [] };
      const entries = await readSessionDetail(filePath);
      const info = await readSessionInfo(filePath);
      return { sessionId, title: info.title, cwd: info.cwd, entries };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionSummarize,
    async (_event, sessionId: string): Promise<SummarizeSessionResult> => {
      const filePath = await locateSessionFile(sessions, metaStore, sessionId);
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
    IpcChannel.sessionExport,
    async (_event, payload: { sessionId: string; cwd?: string }): Promise<ExportResult> => {
      const filePath = await locateSessionFile(sessions, metaStore, payload.sessionId, payload.cwd);
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

  ipcMain.handle(
    IpcChannel.sessionReadText,
    async (_event, sessionId: string): Promise<ReadSessionTextResult> => {
      const filePath = await locateSessionFile(sessions, metaStore, sessionId);
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
