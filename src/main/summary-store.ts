import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type SummaryKind = 'day' | 'month';

interface SummaryRecord {
  text: string;
  updatedAt: string;
}

interface SummaryFile {
  days: Record<string, SummaryRecord>;
  months: Record<string, SummaryRecord>;
}

export function saveSummary(kind: SummaryKind, key: string, text: string): void {
  const all = load();
  const bucket = kind === 'day' ? all.days : all.months;
  bucket[key] = { text, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(summariesPath()), { recursive: true });
  fs.writeFileSync(summariesPath(), JSON.stringify(all, null, 2), 'utf8');
}

export function listSummaries(kind: SummaryKind): { key: string; preview: string }[] {
  const all = load();
  const bucket = kind === 'day' ? all.days : all.months;
  return Object.entries(bucket)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, record]) => ({ key, preview: record.text.replace(/\s+/g, ' ').trim().slice(0, 60) }));
}

export function getSummaryText(kind: SummaryKind, key: string): string | undefined {
  const all = load();
  const bucket = kind === 'day' ? all.days : all.months;
  return bucket[key]?.text;
}

function load(): SummaryFile {
  try {
    const raw = fs.readFileSync(summariesPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<SummaryFile>;
    return {
      days: parsed.days ?? {},
      months: parsed.months ?? {},
    };
  } catch {
    return { days: {}, months: {} };
  }
}

function summariesPath(): string {
  return path.join(app.getPath('userData'), 'summaries.json');
}
