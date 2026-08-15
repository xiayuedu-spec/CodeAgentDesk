import { ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  DaySummarizeResult,
  KnowledgeExportResult,
  SummaryGetResult,
  SummaryHistoryResult,
} from '../shared/types';
import { readConfig, resolveClaudeHome } from './config';
import { generateProjectKnowledge, exportKnowledgeToFile } from './knowledge';
import {
  getKnowledgeText,
  listKnowledge,
  saveKnowledge,
  type KnowledgeItem,
} from './knowledge-store';
import { summarizeDayText, summarizeMonthText, summarizeWeekText } from './summarize';
import { getSummaryText, listSummaries, saveSummary, type SummaryKind } from './summary-store';
import type { SessionMetaStore } from './session-meta-store';
import { collectRangeText, weekRangeFor } from './ipc-utils';

export interface SummaryIpcDeps {
  metaStore: SessionMetaStore;
}

/** 总结与知识库域 IPC：日报/周报/月报生成与存取、知识库生成/导出/存取。 */
export function registerSummaryIpc({ metaStore }: SummaryIpcDeps): void {
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
}
