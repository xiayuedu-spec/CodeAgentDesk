import fs from 'node:fs';
import path from 'node:path';
import { readChatEntries, listSessions } from './session-library';
import { runClaude } from './summarize';
import { getKnowledgeMeta, saveKnowledge } from './knowledge-store';
import type { SessionMetaStore } from './session-meta-store';

function folderNameOf(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? cwd;
}

/**
 * 自动知识库：把项目最近的会话记录提炼为可复用的项目知识文档。
 *
 * Token 预算控制（工作环境限额 1000 万/小时）：
 * - 每会话最多读取 MAX_SESSION_CHARS 字符（约 2.5k token）
 * - 最多取 MAX_SESSIONS 个最近会话
 * - 总输入截断到 MAX_INPUT_CHARS（约 4 万 token，占限额 <0.5%）
 * - 估算按 3 字符/token 保守高估（中英混合场景实际消耗更少）
 *
 * 增量更新：非 force 时只处理上次生成后新增/变更的会话，
 * 并把已有知识库作为上下文一并交给 claude 合并更新，避免全量重读。
 */

const MAX_SESSIONS = 30;
const MAX_SESSION_CHARS = 8000;
const MAX_INPUT_CHARS = 120000;
const MAX_EXISTING_KNOWLEDGE_CHARS = 30000; // 增量时旧知识库的截断上限

/** 保守估算 token：按 3 字符/token（中英混合偏保守高估）。 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export interface KnowledgeOptions {
  /** true = 全量重建（忽略增量指纹，重新处理全部会话）；缺省为增量。 */
  force?: boolean;
}

/**
 * 生成/更新某项目的知识库文档。
 * @returns Markdown 文本；若增量模式下无新增会话且已有知识库，返回 null（表示已是最新）。
 */
export async function generateProjectKnowledge(
  claudeHome: string,
  metaStore: SessionMetaStore,
  cwd: string,
  options?: KnowledgeOptions,
): Promise<string | null> {
  const key = cwd.replace(/[\\:]/g, '-');
  const prev = getKnowledgeMeta(key);
  const force = options?.force === true;

  const records = await listSessions(claudeHome, metaStore);
  const normalized = normalizeCwd(cwd);
  const projectRecords = records
    .filter((record) => !record.archived && normalizeCwd(record.cwd) === normalized)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SESSIONS);

  if (projectRecords.length === 0) {
    throw new Error('该项目没有可用的会话记录');
  }

  // 增量：只处理指纹变化（新增或 updatedAt 变更）的会话。
  const prevFingerprint = prev?.sessionIds ?? {};
  const fresh = force
    ? projectRecords
    : projectRecords.filter((record) => prevFingerprint[record.sessionId] !== record.updatedAt);

  if (!force && prev?.text && fresh.length === 0) {
    return null; // 知识库已是最新，无需调用 claude。
  }

  const parts: string[] = [];
  if (!force && prev?.text) {
    parts.push(`【已有知识库（供参考与保留）】\n${prev.text.slice(-MAX_EXISTING_KNOWLEDGE_CHARS)}`);
  }
  for (const record of fresh) {
    const entries = await readChatEntries(record.filePath);
    const text = entries
      .map((entry) => `${entry.role === 'user' ? 'User' : 'Claude'}:\n${entry.text}`)
      .join('\n')
      .slice(-MAX_SESSION_CHARS);
    const name = record.customName ?? folderNameOf(record.cwd);
    parts.push(`## ${name}\n${text}`);
  }
  const input = parts.join('\n\n').slice(-MAX_INPUT_CHARS);

  const isIncremental = !force && Boolean(prev?.text);
  const instruction = isIncremental
    ? '你是项目知识维护助手。下面包含【已有知识库】与新增的 Claude Code 会话记录（截断）。' +
      '请更新这份知识文档（Markdown），保留仍然正确的部分、修正过时内容、补充新会话带来的经验，' +
      '结构保持：## 项目概述 / ## 架构与关键代码位置 / ## 常用命令 / 工作流 / ## 易踩的坑 / 解决方案 / ## 关键决策与理由 / ## 遗留问题 / 待办。' +
      `\n\n--- 新增会话（${fresh.length} 个，输入约 ${Math.ceil(estimateTokens(input) / 1000)}k token）---\n`
    : '你是项目知识提炼助手。根据下面的 Claude Code 会话记录（截断），为该项目生成一份知识文档（Markdown）：\n' +
      '## 项目概述\n## 架构与关键代码位置\n## 常用命令 / 工作流\n## 易踩的坑 / 解决方案\n' +
      '## 关键决策与理由\n## 遗留问题 / 待办\n只基于会话记录内容提炼，不要编造缺失的信息。\n\n' +
      `--- 会话记录（${fresh.length} 个会话，输入约 ${Math.ceil(estimateTokens(input) / 1000)}k token）---\n`;

  const output = await runClaude(instruction + input);
  // 记录本次处理后全部会话的指纹，供下次增量判断。
  const fingerprint: Record<string, string> = {};
  for (const record of projectRecords) {
    fingerprint[record.sessionId] = record.updatedAt;
  }
  saveKnowledge(key, output.trim(), fingerprint);
  return output.trim();
}

/** 导出知识库到项目目录（PROJECT_KNOWLEDGE.md），返回文件路径。 */
export function exportKnowledgeToFile(cwd: string, text: string): string {
  const filePath = path.join(cwd, 'PROJECT_KNOWLEDGE.md');
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

function normalizeCwd(cwd: string): string {
  const value = cwd.replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
