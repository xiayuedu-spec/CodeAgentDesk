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
  group?: string;
}

type SessionMetaMap = Record<string, SessionMeta>;

export class SessionMetaStore {
  private constructor(private readonly filePath: string) {}

  private map: SessionMetaMap = {};
  private loaded = false;
  private version = 0;

  /** 元数据每次写入递增；session-library 据此使会话记录缓存失效。 */
  getVersion(): number {
    return this.version;
  }

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

  setGroup(sessionId: string, groupId: string | null): SessionMeta {
    const meta = this.get(sessionId);
    const next = { ...meta };
    if (groupId) next.group = groupId;
    else delete next.group;
    this.set(sessionId, next);
    return next;
  }

  /** 删除分组后，把仍指向该分组的会话统一移出分组。 */
  clearGroup(groupId: string): void {
    const all = this.all();
    let changed = false;
    for (const meta of Object.values(all)) {
      if (meta.group === groupId) {
        delete meta.group;
        changed = true;
      }
    }
    if (changed) {
      this.version += 1;
      this.save(all);
    }
  }

  /** 彻底移除某会话的元数据（归档删除时调用）。 */
  remove(sessionId: string): void {
    const all = this.all();
    if (sessionId in all) {
      delete all[sessionId];
      this.version += 1;
      this.save(all);
    }
  }

  get(sessionId: string): SessionMeta {
    // 返回浅拷贝，避免调用方意外改动共享数据。
    return { ...(this.all()[sessionId] ?? {}) };
  }

  isArchived(sessionId: string): boolean {
    return this.get(sessionId).archived === true;
  }

  private set(sessionId: string, meta: SessionMeta): void {
    const all = this.all();
    all[sessionId] = meta;
    this.version += 1;
    this.save(all);
  }

  /** 整份元数据只读一次并常驻内存，仅写操作落盘。 */
  private all(): SessionMetaMap {
    if (!this.loaded) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.map = JSON.parse(raw) as SessionMetaMap;
      } catch {
        // 首次读取失败按空处理；下次写入时以当前内存为准重建。
      }
      this.loaded = true;
    }
    return this.map;
  }

  private save(all: SessionMetaMap): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf8');
  }
}
