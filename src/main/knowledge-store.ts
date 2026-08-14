import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface KnowledgeItem {
  key: string;
  updatedAt: string;
  preview: string;
}

interface KnowledgeRecord {
  text: string;
  updatedAt: string;
}

type KnowledgeMap = Record<string, KnowledgeRecord>;

function knowledgePath(): string {
  return path.join(app.getPath('userData'), 'knowledge.json');
}

export function saveKnowledge(key: string, text: string): void {
  const all = load();
  all[key] = { text, updatedAt: new Date().toISOString() };
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

export function getKnowledgeText(key: string): string | undefined {
  return load()[key]?.text;
}

function load(): KnowledgeMap {
  try {
    const raw = fs.readFileSync(knowledgePath(), 'utf8');
    const parsed = JSON.parse(raw) as KnowledgeMap;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}
