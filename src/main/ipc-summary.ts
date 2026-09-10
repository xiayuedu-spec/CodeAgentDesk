import { ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-contract';
import type {
  DaySummarizeResult,
  KnowledgeExportResult,
  KnowledgeGlobalResult,
  SummaryGetResult,
  SummaryHistoryResult,
  TaskProgressEvent,
} from '../shared/types';
import { readConfig, resolveClaudeHome } from './config';
import { ensureGlobalKnowledge, exportKnowledgeToFile, generateProjectKnowledge } from './knowledge';
import {
  getKnowledgeText,
  listKnowledge,
  saveKnowledge,
  type KnowledgeItem,
} from './knowledge-store';
import { summarizeDayText, summarizeMonthText, summarizeWeekReflection, summarizeWeekText } from './summarize';
import { computeEfficiencyInsights } from './ipc-usage';
import { getSummaryText, listSummaries, saveSummary, type SummaryKind } from './summary-store';
import type { SessionMetaStore } from './session-meta-store';
import { collectRangeText, weekRangeFor } from './ipc-utils';
import { broadcast } from './window-manager';

export interface SummaryIpcDeps {
  metaStore: SessionMetaStore;
}

/** 上报长任务阶段进度（渲染层显示阶段进度面板）。 */
function reportProgress(
  task: TaskProgressEvent['task'],
  title: string,
  stage: string,
  index: number,
  total: number,
): void {
  broadcast(IpcChannel.taskProgress, {
    task,
    title,
    stage,
    index,
    total,
    done: false,
  } satisfies TaskProgressEvent);
}

function reportProgressDone(task: TaskProgressEvent['task']): void {
  broadcast(IpcChannel.taskProgress, {
    task,
    title: '',
    stage: '',
    index: 0,
    total: 0,
    done: true,
  } satisfies TaskProgressEvent);
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
        reportProgress('week-summary', '生成周报', '读取并归纳本周会话', 1, 2);
        const text = await summarizeWeekText(combined);
        // 周反思：基于本周内容 + 效率统计生成复盘，追加到周报末尾；失败不阻塞周报。
        let finalText = text;
        try {
          const insights = await computeEfficiencyInsights(claudeHome, metaStore, monday);
          const hours = Math.round((insights.totalDurationMs / 3_600_000) * 10) / 10;
          const savedHours = Math.round((insights.totalDurationMs / 3_600_000) * 1.5 * 10) / 10;
          const outputPercent =
            insights.totalTokens > 0
              ? Math.round((insights.outputTokens / insights.totalTokens) * 100)
              : 0;
          reportProgress('week-summary', '生成周报', '生成本周复盘', 2, 2);
          const reflection = await summarizeWeekReflection(combined, {
            sessions: insights.sessionCount,
            hours,
            savedHours,
            outputPercent,
          });
          if (reflection) {
            finalText = `${text.trim()}\n\n## 本周复盘\n\n${reflection}`;
          }
        } catch {
          // 反思失败静默降级，周报本身不受影响。
        }
        saveSummary('week', monday, finalText);
        reportProgressDone('week-summary');
        return { ok: true, text: finalText };
      } catch (error) {
        reportProgressDone('week-summary');
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
        reportProgress('knowledge', '生成项目知识库', '读取最近会话并提炼', 1, 1);
        const text = await generateProjectKnowledge(
          resolveClaudeHome(readConfig()),
          metaStore,
          cwd,
          { force: force === true },
        );
        if (text === null) {
          reportProgressDone('knowledge');
          return { ok: false, message: '知识库已是最新，暂无新增会话' };
        }
        // 生成即落盘：写入 PROJECT_KNOWLEDGE.md 并同步项目 CLAUDE.md（新会话自动带背景）。
        exportKnowledgeToFile(cwd, text);
        reportProgressDone('knowledge');
        return { ok: true, text };
      } catch (error) {
        reportProgressDone('knowledge');
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

  ipcMain.handle(
    IpcChannel.knowledgeEnsureGlobal,
    (): KnowledgeGlobalResult => {
      try {
        const { globalPath } = ensureGlobalKnowledge(resolveClaudeHome(readConfig()));
        return { ok: true, path: globalPath };
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
