import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { KnowledgeCard, KnowledgeCardInput, KnowledgeCardType } from '../shared/types';
import { listCards, saveCard } from './knowledge-cards';
import { readSessionDetail } from './session-library';
import { readConfig, resolveClaudeHome } from './config';
import { findSessionFile } from './session-library';
import { runClaude } from './summarize';

/**
 * 自动知识沉淀：会话结束后用 claude 无头模式从会话记录里提取"值得复用"的条目，
 * 落成 **draft** 卡片，等人工点「已确认」。自动生成 + 人工核验，避免错误知识扩散。
 */

/** 会话至少这么多轮（或出现失败）才值得分析。 */
const MIN_TURNS = 4;
/** 送进模型的会话文本上限。 */
const MAX_TRANSCRIPT_CHARS = 14_000;
/** 单次最多产出几张卡片。 */
const MAX_CARDS = 3;
/** 每个会话最多详细分析一次。 */
const ANALYZED_FILE = 'knowledge-auto.json';
const ANALYZED_MAX = 800;

const TYPES: KnowledgeCardType[] = ['pitfall', 'decision', 'flow', 'module'];

/** 已分析过的会话（按 sessionId），避免重复花 token。 */
function readAnalyzed(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), ANALYZED_FILE), 'utf8'));
  } catch {
    return {};
  }
}

function markAnalyzed(sessionId: string): void {
  const data = readAnalyzed();
  data[sessionId] = Date.now();
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, ANALYZED_MAX);
  try {
    fs.writeFileSync(
      path.join(app.getPath('userData'), ANALYZED_FILE),
      JSON.stringify(Object.fromEntries(entries)),
      'utf8',
    );
  } catch {
    // 写不了就算了，最多下次多分析一次。
  }
}

/** 标题归一化，用于判断"是不是已经有这张卡了"。 */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\s\p{P}]+/gu, '');
}

/** 粗略判重：归一化后相等，或长标题互相包含（>=8 字）。 */
export function isSimilarTitle(a: string, b: string): boolean {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;
  return shorter.length >= 8 && longer.includes(shorter);
}

/** 组装提示词（外部可测）。 */
export function buildKnowledgePrompt(transcript: string, existingTitles: string[]): string {
  const existing = existingTitles.length
    ? existingTitles.map((title) => `- ${title}`).join('\n')
    : '（暂无）';
  return [
    '你在为团队积累项目知识。下面是某个开发者与 Claude Code 的一次会话记录。',
    '请提取值得沉淀、且**别人以后会复用**的知识条目（0-3 条）：',
    '- pitfall（踩坑）：报错/异常 → 根因 → 改法',
    '- decision（决策）：选了什么方案、为什么、放弃了什么',
    '- flow（流程）：怎么跑起来/怎么发布/怎么排查',
    '- module（模块）：这个模块负责什么、关键文件在哪',
    '跳过：闲聊、纯进度汇报、没有结论的尝试、只对本次有效的临时操作。',
    '',
    '已有卡片（不要重复这些主题）：',
    existing,
    '',
    '只输出 JSON 数组，不要任何解释或 Markdown 代码块：',
    '[{"title":"一句话标题","type":"pitfall|decision|flow|module","phenomenon":"现象/报错原文","conclusion":"根因与改法","evidence":"文件:行 或 关键排查动作","files":["相对路径"]}]',
    '没有值得沉淀的内容就输出 []。files 只填会话中真实出现过、且相对于项目根目录的路径。',
    '',
    '--- 会话记录（截断）---',
    transcript,
  ].join('\n');
}

/** 从模型输出里抠出 JSON 数组（容忍 ```json 围栏与前后废话）。 */
export function parseKnowledgeCards(raw: string): KnowledgeCardInput[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const cards: KnowledgeCardInput[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!title) continue;
    const type = TYPES.includes(record.type as KnowledgeCardType)
      ? (record.type as KnowledgeCardType)
      : 'pitfall';
    const files = Array.isArray(record.files)
      ? record.files.filter((file): file is string => typeof file === 'string')
      : [];
    cards.push({
      title,
      type,
      status: 'draft',
      phenomenon: typeof record.phenomenon === 'string' ? record.phenomenon : '',
      conclusion: typeof record.conclusion === 'string' ? record.conclusion : '',
      evidence: typeof record.evidence === 'string' ? record.evidence : '',
      files,
    });
  }
  return cards;
}

/** 会话详情 → 便于模型阅读的纯文本。 */
function renderTranscript(entries: { role: string; text?: string; toolName?: string; toolOutput?: string }[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    if (entry.role === 'tool') {
      const output = (entry.toolOutput ?? '').slice(-800);
      if (output) lines.push(`[工具 ${entry.toolName ?? ''}] ${output}`);
      continue;
    }
    if (!entry.text) continue;
    lines.push(`[${entry.role === 'user' ? '用户' : 'Claude'}] ${entry.text.slice(0, 1500)}`);
  }
  return lines.join('\n').slice(-MAX_TRANSCRIPT_CHARS);
}

export interface AutoKnowledgeResult {
  sessionId: string;
  cards: KnowledgeCard[];
}

/**
 * 分析一个会话，产出草稿卡片。
 * 门槛：轮次够（或有失败）才分析；同一会话只分析一次；产出的卡片全部是 draft。
 */
export async function generateCardsFromSession(
  sessionId: string,
  cwd: string,
): Promise<AutoKnowledgeResult> {
  const skip: AutoKnowledgeResult = { sessionId, cards: [] };
  if (!sessionId || !cwd) return skip;
  if (readConfig().autoKnowledge === false) return skip;
  if (readAnalyzed()[sessionId]) return skip;

  const file = await findSessionFile(resolveClaudeHome(readConfig()), sessionId);
  if (!file) return skip;

  let entries: Awaited<ReturnType<typeof readSessionDetail>>;
  try {
    entries = await readSessionDetail(file);
  } catch {
    return skip;
  }
  // 太短的会话不值得花一次模型调用。
  const turns = entries.filter((entry) => entry.role === 'user' || entry.role === 'assistant').length;
  const hasFailure = entries.some(
    (entry) => entry.role === 'tool' && /error|失败|报错|exception/i.test(entry.toolOutput ?? ''),
  );
  if (turns < MIN_TURNS && !hasFailure) {
    markAnalyzed(sessionId);
    return skip;
  }

  const existing = listCards(cwd);
  const prompt = buildKnowledgePrompt(
    renderTranscript(entries),
    existing.map((card) => card.title),
  );

  let output: string;
  try {
    output = await runClaude(prompt);
  } catch {
    // 模型不可用/超时：不标记，下次还会再试。
    return skip;
  }

  const parsed = parseKnowledgeCards(output).slice(0, MAX_CARDS);
  const saved: KnowledgeCard[] = [];
  for (const card of parsed) {
    if (existing.some((item) => isSimilarTitle(item.title, card.title))) continue;
    if (saved.some((item) => isSimilarTitle(item.title, card.title))) continue;
    // 只保留真实存在的文件，避免模型编路径。
    const files = (card.files ?? [])
      .filter((relative) => {
        try {
          return fs.existsSync(path.join(cwd, relative));
        } catch {
          return false;
        }
      })
      .slice(0, 10);
    try {
      saved.push(saveCard(cwd, { ...card, files, status: 'draft', sessionId }));
    } catch {
      // 单张失败不影响其它卡片。
    }
  }

  markAnalyzed(sessionId);
  return { sessionId, cards: saved };
}
