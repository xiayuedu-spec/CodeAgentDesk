import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface KnowledgeItem {
  key: string;
  updatedAt: string;
  preview: string;
}

export interface KnowledgeMeta {
  text: string;
  updatedAt: string;
  /** 生成时处理过的会话指纹（sessionId → updatedAt），用于增量更新判断。 */
  sessionIds: Record<string, string>;
}

type KnowledgeMap = Record<string, KnowledgeMeta>;

function knowledgePath(): string {
  return path.join(app.getPath('userData'), 'knowledge.json');
}

export function saveKnowledge(key: string, text: string, sessionIds?: Record<string, string>): void {
  const all = load();
  all[key] = {
    text,
    updatedAt: new Date().toISOString(),
    sessionIds: sessionIds ?? all[key]?.sessionIds ?? {},
  };
  fs.mkdirSync(path.dirname(knowledgePath()), { recursive: true });
  fs.writeFileSync(knowledgePath(), JSON.stringify(all, null, 2), 'utf8');
}

export function listKnowledge(): KnowledgeItem[] {
  const all = load();
  return Object.entries(all)
    .sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt))
    .map(([key, record]) => ({
      key,
      updatedAt: record.updatedAt,
      preview: record.text.replace(/\s+/g, ' ').trim().slice(0, 80),
    }));
}

export function getKnowledgeMeta(key: string): KnowledgeMeta | null {
  return load()[key] ?? null;
}

export function getKnowledgeText(key: string): string | undefined {
  return load()[key]?.text;
}

function load(): KnowledgeMap {
  try {
    const raw = fs.readFileSync(knowledgePath(), 'utf8');
    const parsed = JSON.parse(raw) as KnowledgeMap;
    if (typeof parsed !== 'object' || !parsed) return {};
    // 兼容旧数据（无 sessionIds 字段）。
    for (const record of Object.values(parsed)) {
      if (!record.sessionIds) record.sessionIds = {};
    }
    return parsed;
  } catch {
    return {};
  }
}
