import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface SessionMeta {
  customName?: string;
  archived?: boolean;
  archivedAt?: string;
  archivedPath?: string;
  cwd?: string;
  summary?: string;
  tags?: string[];
}

type SessionMetaMap = Record<string, SessionMeta>;

export class SessionMetaStore {
  private constructor(private readonly filePath: string) {}

  static create(): SessionMetaStore {
    return new SessionMetaStore(path.join(app.getPath('userData'), 'session-meta.json'));
  }

  rename(sessionId: string, name: string): SessionMeta {
    const meta = this.get(sessionId);
    const next = { ...meta, customName: name };
    this.set(sessionId, next);
    return next;
  }

  archive(sessionId: string, cwd: string, archivedPath: string): SessionMeta {
    const meta = this.get(sessionId);
    const next = {
      ...meta,
      archived: true,
      archivedAt: new Date().toISOString(),
      archivedPath,
      cwd,
    };
    this.set(sessionId, next);
    return next;
  }

  restore(sessionId: string): SessionMeta {
    const meta = this.get(sessionId);
    const next = { ...meta, archived: false, archivedAt: undefined, archivedPath: undefined };
    this.set(sessionId, next);
    return next;
  }

  setSummary(sessionId: string, summary: string, tags: string[]): SessionMeta {
    const meta = this.get(sessionId);
    const next = { ...meta, summary, tags };
    this.set(sessionId, next);
    return next;
  }

  get(sessionId: string): SessionMeta {
    const cached = this.cache.get(sessionId);
    if (cached) return cached;
    const all = this.load();
    return all[sessionId] ?? {};
  }

  isArchived(sessionId: string): boolean {
    return this.get(sessionId).archived === true;
  }

  private set(sessionId: string, meta: SessionMeta): void {
    this.cache.set(sessionId, meta);
    const all = this.load();
    all[sessionId] = meta;
    this.save(all);
  }

  private readonly cache = new Map<string, SessionMeta>();

  private load(): SessionMetaMap {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw) as SessionMetaMap;
    } catch {
      return {};
    }
  }

  private save(all: SessionMetaMap): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf8');
  }
}
