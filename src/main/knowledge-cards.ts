import fs from 'node:fs';
import path from 'node:path';
import type {
  KnowledgeCard,
  KnowledgeCardInput,
  KnowledgeCardType,
} from '../shared/types';

/** 卡片目录（仓库内，跟着 git 走）。 */
const CARD_DIR = path.join('docs', 'knowledge');
/** 索引文件名（自动生成，人只读）。 */
const INDEX_FILE = 'README.md';
/** 单卡片体积上限（防止把整篇日志塞进来）。 */
const MAX_FIELD_CHARS = 8000;

const TYPES: KnowledgeCardType[] = ['pitfall', 'decision', 'flow', 'module'];

export const TYPE_LABEL: Record<KnowledgeCardType, string> = {
  pitfall: '踩坑',
  decision: '决策',
  flow: '流程',
  module: '模块说明',
};

function clip(value: string): string {
  return value.replace(/\r\n/g, '\n').trim().slice(0, MAX_FIELD_CHARS);
}

/** 标题 → 文件名 slug（保留中英文与数字，其余折叠成 -）。 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'card';
}

/** 序列化：front-matter + 三个固定小节。纯函数，便于测试。 */
export function serializeCard(card: KnowledgeCard): string {
  const files = card.files.map((file) => `  - ${file}`).join('\n');
  return [
    '---',
    `title: ${card.title}`,
    `type: ${card.type}`,
    `status: ${card.status}`,
    `created: ${card.createdAt}`,
    `updated: ${card.updatedAt}`,
    card.sessionId ? `session: ${card.sessionId}` : null,
    files ? `files:\n${files}` : null,
    '---',
    '',
    '## 现象',
    card.phenomenon || '',
    '',
    '## 结论',
    card.conclusion || '',
    '',
    '## 证据',
    card.evidence || '',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** 解析：宽松处理（缺字段给默认值，坏文件返回 null 不抛错）。 */
export function parseCard(fileName: string, raw: string): KnowledgeCard | null {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw.replace(/\r\n/g, '\n'));
  if (!match) return null;
  const [, frontMatter, body] = match;

  const meta: Record<string, string> = {};
  const files: string[] = [];
  let readingFiles = false;
  for (const line of frontMatter.split('\n')) {
    if (readingFiles && /^\s+-\s+/.test(line)) {
      files.push(line.replace(/^\s+-\s+/, '').trim());
      continue;
    }
    readingFiles = false;
    const pair = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    if (pair[1] === 'files') {
      readingFiles = true;
      continue;
    }
    meta[pair[1]] = pair[2];
  }

  const section = (name: string): string => {
    const start = body.indexOf(`## ${name}`);
    if (start < 0) return '';
    const rest = body.slice(start + name.length + 3);
    const end = rest.indexOf('\n## ');
    return (end < 0 ? rest : rest.slice(0, end)).trim();
  };

  const type = TYPES.includes(meta.type as KnowledgeCardType)
    ? (meta.type as KnowledgeCardType)
    : 'pitfall';
  return {
    slug: fileName.replace(/\.md$/i, ''),
    title: meta.title?.trim() || fileName.replace(/\.md$/i, ''),
    type,
    status: meta.status === 'verified' ? 'verified' : 'draft',
    createdAt: meta.created || '',
    updatedAt: meta.updated || '',
    sessionId: meta.session || undefined,
    files,
    phenomenon: section('现象'),
    conclusion: section('结论'),
    evidence: section('证据'),
  };
}

function cardDir(cwd: string): string {
  return path.join(cwd, CARD_DIR);
}

/** 列出项目里的全部卡片（按更新时间倒序）。 */
export function listCards(cwd: string): KnowledgeCard[] {
  const dir = cardDir(cwd);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const cards: KnowledgeCard[] = [];
  for (const name of names) {
    if (!name.endsWith('.md') || name === INDEX_FILE) continue;
    try {
      const card = parseCard(name, fs.readFileSync(path.join(dir, name), 'utf8'));
      if (card) cards.push(card);
    } catch {
      // 坏文件跳过，不影响其它卡片。
    }
  }
  return cards.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/** 索引 Markdown：按类型分组，人和 Claude 都从这个文件进入。 */
export function renderIndex(cards: KnowledgeCard[]): string {
  const lines = [
    '# 项目知识索引',
    '',
    '> 由 CodeAgentDesk 自动生成，**不要手改这个文件**：改卡片请用应用，或直接编辑同目录下的卡片文件。',
    '',
  ];
  for (const type of TYPES) {
    const group = cards.filter((card) => card.type === type);
    if (group.length === 0) continue;
    lines.push(`## ${TYPE_LABEL[type]}（${group.length}）`, '');
    for (const card of group) {
      const mark = card.status === 'verified' ? '✅' : '📝';
      const oneLine = (card.conclusion || card.phenomenon || '').replace(/\s+/g, ' ').slice(0, 80);
      lines.push(`- ${mark} [${card.title}](${card.slug}.md)${oneLine ? ` — ${oneLine}` : ''}`);
    }
    lines.push('');
  }
  if (cards.length === 0) lines.push('（还没有卡片）', '');
  return lines.join('\n');
}

/** 保存（新增或更新）一张卡片，并重建索引。返回落盘路径。 */
export function saveCard(cwd: string, input: KnowledgeCardInput): KnowledgeCard {
  const dir = cardDir(cwd);
  fs.mkdirSync(dir, { recursive: true });

  const now = new Date().toISOString();
  const title = clip(input.title) || '未命名卡片';
  // 更新时沿用原 slug；新建时按标题生成，撞名就加序号。
  let slug = input.slug?.trim() || slugify(title);
  if (!input.slug) {
    let candidate = slug;
    let index = 2;
    while (fs.existsSync(path.join(dir, `${candidate}.md`))) {
      candidate = `${slug}-${index}`;
      index += 1;
    }
    slug = candidate;
  }

  const existing = input.slug
    ? (() => {
        try {
          return parseCard(`${input.slug}.md`, fs.readFileSync(path.join(dir, `${input.slug}.md`), 'utf8'));
        } catch {
          return null;
        }
      })()
    : null;

  const type = TYPES.includes(input.type as KnowledgeCardType)
    ? (input.type as KnowledgeCardType)
    : 'pitfall';
  const card: KnowledgeCard = {
    slug,
    title,
    type,
    status: input.status === 'verified' ? 'verified' : 'draft',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    sessionId: input.sessionId?.trim() || existing?.sessionId,
    files: (input.files ?? []).map((file) => file.trim()).filter(Boolean).slice(0, 30),
    phenomenon: clip(input.phenomenon ?? ''),
    conclusion: clip(input.conclusion ?? ''),
    evidence: clip(input.evidence ?? ''),
  };

  fs.writeFileSync(path.join(dir, `${slug}.md`), serializeCard(card), 'utf8');
  fs.writeFileSync(path.join(dir, INDEX_FILE), renderIndex(listCards(cwd)), 'utf8');
  return card;
}

/** 删除卡片并重建索引。 */
export function deleteCard(cwd: string, slug: string): boolean {
  const file = path.join(cardDir(cwd), `${slug}.md`);
  try {
    fs.unlinkSync(file);
  } catch {
    return false;
  }
  fs.writeFileSync(path.join(cardDir(cwd), INDEX_FILE), renderIndex(listCards(cwd)), 'utf8');
  return true;
}

/** 卡片目录路径（界面显示 / 打开目录用）。 */
export function cardDirPath(cwd: string): string {
  return cardDir(cwd);
}
