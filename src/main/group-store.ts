import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GROUP_COLORS, type GroupRecord } from '../shared/types';

/** 分组定义存储：<userData>/groups.json，纯数组按创建顺序排列。 */
export class GroupStore {
  private constructor(private readonly filePath: string) {}

  static create(): GroupStore {
    return new GroupStore(path.join(app.getPath('userData'), 'groups.json'));
  }

  list(): GroupRecord[] {
    return this.load();
  }

  create(name: string): GroupRecord {
    const groups = this.load();
    const group: GroupRecord = {
      id: randomUUID(),
      name: name.trim() || '未命名分组',
      color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
    };
    groups.push(group);
    this.save(groups);
    return group;
  }

  rename(id: string, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const groups = this.load();
    const group = groups.find((item) => item.id === id);
    if (!group) return false;
    group.name = trimmed;
    this.save(groups);
    return true;
  }

  setColor(id: string, color: string): boolean {
    const groups = this.load();
    const group = groups.find((item) => item.id === id);
    if (!group) return false;
    group.color = color;
    this.save(groups);
    return true;
  }

  delete(id: string): boolean {
    const groups = this.load();
    const next = groups.filter((item) => item.id !== id);
    if (next.length === groups.length) return false;
    this.save(next);
    return true;
  }

  private load(): GroupRecord[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is GroupRecord =>
          Boolean(
            item &&
              typeof item === 'object' &&
              typeof (item as GroupRecord).id === 'string' &&
              typeof (item as GroupRecord).name === 'string',
          ),
      );
    } catch {
      return [];
    }
  }

  private save(groups: GroupRecord[]): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(groups, null, 2), 'utf8');
  }
}
