import { readChatEntries, listSessions } from './session-library';
import { runClaude } from './summarize';
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
 * 估算偏保守（按 3 字符/token，中英混合场景实际消耗更少）。
 */

const MAX_SESSIONS = 30;
const MAX_SESSION_CHARS = 8000;
const MAX_INPUT_CHARS = 120000;

/** 保守估算 token：按 3 字符/token（中英混合偏保守高估）。 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** 生成某项目的知识库文档，返回 Markdown 文本。 */
export async function generateProjectKnowledge(
  claudeHome: string,
  metaStore: SessionMetaStore,
  cwd: string,
): Promise<string> {
  const records = await listSessions(claudeHome, metaStore);
  const normalized = normalizeCwd(cwd);
  const projectRecords = records
    .filter((record) => !record.archived && normalizeCwd(record.cwd) === normalized)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SESSIONS);

  if (projectRecords.length === 0) {
    throw new Error('该项目没有可用的会话记录');
  }

  const parts: string[] = [];
  let totalChars = 0;
  for (const record of projectRecords) {
    const entries = await readChatEntries(record.filePath);
    const text = entries
      .map((entry) => `${entry.role === 'user' ? 'User' : 'Claude'}:\n${entry.text}`)
      .join('\n')
      .slice(-MAX_SESSION_CHARS);
    const name = record.customName ?? folderNameOf(record.cwd);
    parts.push(`## ${name}\n${text}`);
    totalChars += text.length;
    if (totalChars >= MAX_INPUT_CHARS) break;
  }

  const input = parts.join('\n\n').slice(-MAX_INPUT_CHARS);
  const instruction =
    '你是项目知识提炼助手。根据下面的 Claude Code 会话记录（截断），为该项目生成一份知识文档（Markdown）：\n' +
    '## 项目概述\n## 架构与关键代码位置\n## 常用命令 / 工作流\n## 易踩的坑 / 解决方案\n' +
    '## 关键决策与理由\n## 遗留问题 / 待办\n只基于会话记录内容提炼，不要编造缺失的信息。\n\n' +
    `--- 会话记录（${projectRecords.length} 个会话，输入约 ${Math.ceil(estimateTokens(input) / 1000)}k token）---\n`;
  const output = await runClaude(instruction + input);
  return output.trim();
}

function normalizeCwd(cwd: string): string {
  const value = cwd.replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
