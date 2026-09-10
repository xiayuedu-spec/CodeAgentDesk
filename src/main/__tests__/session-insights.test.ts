import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));

const { countLines, diffLineCounts, readSessionInsights } = await import('../session-insights');

const tempDirs: string[] = [];

function writeSession(lines: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-'));
  tempDirs.push(dir);
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, lines.map((line) => JSON.stringify(line)).join('\n') + '\n', 'utf8');
  return file;
}

function toolUse(name: string, input: unknown, timestamp?: string) {
  return {
    type: 'assistant',
    timestamp,
    message: { role: 'assistant', content: [{ type: 'tool_use', id: `t-${name}`, name, input }] },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('countLines 行数口径', () => {
  it('空串 0 行，尾换行不多算一行', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\n')).toBe(1);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('a\nb\n')).toBe(2);
  });
});

describe('diffLineCounts 行级增删', () => {
  it('纯插入只加不减，纯删除只减不加', () => {
    expect(diffLineCounts('x', 'x\ny')).toEqual({ added: 1, removed: 0 });
    expect(diffLineCounts('p\nq', 'p')).toEqual({ added: 0, removed: 1 });
  });

  it('原地改一行算 +1 -1，而不是整块前后行数', () => {
    expect(diffLineCounts('a\nb\nc', 'a\nB\nc')).toEqual({ added: 1, removed: 1 });
  });

  it('完全相同与空串', () => {
    expect(diffLineCounts('same', 'same')).toEqual({ added: 0, removed: 0 });
    expect(diffLineCounts('', 'a')).toEqual({ added: 1, removed: 0 });
    expect(diffLineCounts('a', '')).toEqual({ added: 0, removed: 1 });
  });

  it('中段过大时退化为整段替换而不是超时', () => {
    const big = Array.from({ length: 400 }, (_, i) => `old-${i}`).join('\n');
    const bigNew = Array.from({ length: 400 }, (_, i) => `new-${i}`).join('\n');
    expect(diffLineCounts(big, bigNew)).toEqual({ added: 400, removed: 400 });
  });
});

describe('readSessionInsights 计划与改动提取', () => {
  it('取 TodoWrite 的末次快照，并记录快照次数', async () => {
    const file = writeSession([
      toolUse('TodoWrite', {
        todos: [
          { content: '第一步', status: 'completed' },
          { content: '第二步', status: 'in_progress' },
        ],
      }),
      toolUse('TodoWrite', {
        todos: [
          { content: '第一步', status: 'completed' },
          { content: '第二步', status: 'completed' },
          { content: '第三步', status: 'pending' },
        ],
      }, '2026-01-02T03:04:05Z'),
    ]);
    const insights = await readSessionInsights(file, 's1');
    expect(insights.plan?.todos.map((todo) => todo.status)).toEqual([
      'completed',
      'completed',
      'pending',
    ]);
    expect(insights.plan?.updates).toBe(2);
    expect(insights.plan?.updatedAt).toBe('2026-01-02T03:04:05Z');
  });

  it('未知 status 归为 pending，缺失 content 的条目被丢弃', async () => {
    const file = writeSession([
      toolUse('TodoWrite', {
        todos: [{ content: 'a', status: 'weird' }, { status: 'completed' }, 'not-an-object'],
      }),
    ]);
    const insights = await readSessionInsights(file, 's1');
    expect(insights.plan?.todos).toEqual([{ content: 'a', status: 'pending' }]);
  });

  it('Edit 按文件聚合，统计增删行数与编辑次数', async () => {
    const file = writeSession([
      toolUse('Edit', { file_path: 'a.ts', old_string: 'x', new_string: 'x\ny' }),
      toolUse('Edit', { file_path: 'a.ts', old_string: 'p\nq', new_string: 'p' }),
      toolUse('Edit', { file_path: 'b.ts', old_string: 'k', new_string: 'k' }),
    ]);
    const insights = await readSessionInsights(file, 's1');
    const a = insights.changes.find((change) => change.path === 'a.ts');
    expect(a?.edits).toBe(2);
    expect(a?.added).toBe(1); // x→x\ny 插入一行
    expect(a?.removed).toBe(1); // p\nq→p 删除一行
    expect(a?.hunks).toHaveLength(2);
    expect(insights.totals).toMatchObject({ files: 2, added: 1, removed: 1, edits: 3 });
  });

  it('Write 记为整文件写入，内容全部算新增行', async () => {
    const file = writeSession([
      toolUse('Write', { file_path: 'new.md', content: '一\n二\n三\n' }),
    ]);
    const insights = await readSessionInsights(file, 's1');
    expect(insights.changes[0]).toMatchObject({ path: 'new.md', written: true, added: 3, removed: 0 });
    expect(insights.changes[0].hunks[0].kind).toBe('write');
  });

  it('MultiEdit 一次调用算一次编辑、多条片段', async () => {
    const file = writeSession([
      toolUse('MultiEdit', {
        file_path: 'c.ts',
        edits: [
          { old_string: 'a', new_string: 'a\nb' },
          { old_string: 'x\ny', new_string: 'x' },
        ],
      }),
    ]);
    const insights = await readSessionInsights(file, 's1');
    expect(insights.changes[0]).toMatchObject({ edits: 1, added: 1, removed: 1 });
    expect(insights.changes[0].hunks).toHaveLength(2);
  });

  it('超长片段被截断并标记，超出上限的片段只计数', async () => {
    const longText = 'x'.repeat(2000);
    const file = writeSession([
      toolUse('Edit', { file_path: 'big.ts', old_string: longText, new_string: 'y' }),
      ...Array.from({ length: 10 }, () =>
        toolUse('Edit', { file_path: 'big.ts', old_string: 'a', new_string: 'b' }),
      ),
    ]);
    const insights = await readSessionInsights(file, 's1');
    const big = insights.changes[0];
    expect(big.hunks.length).toBeLessThanOrEqual(8);
    expect(big.hiddenHunks).toBeGreaterThan(0);
    expect(big.hunks[0].truncated).toBe(true);
    expect(big.hunks[0].oldText).toHaveLength(1200);
  });

  it('损坏行被跳过并计入 skipped，不影响其余解析', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'session.jsonl');
    fs.writeFileSync(
      file,
      ['{ not json', JSON.stringify(toolUse('Write', { file_path: 'a.ts', content: 'x' }))].join('\n'),
      'utf8',
    );
    const insights = await readSessionInsights(file, 's1');
    expect(insights.skipped).toBe(1);
    expect(insights.totals.files).toBe(1);
  });

  it('文件未变化时复用缓存，追加内容后重新解析', async () => {
    const file = writeSession([toolUse('Write', { file_path: 'a.ts', content: 'x' })]);
    const first = await readSessionInsights(file, 's1');
    const second = await readSessionInsights(file, 's1');
    expect(second).toBe(first); // 同一对象 → 命中缓存

    fs.appendFileSync(
      file,
      JSON.stringify(toolUse('Write', { file_path: 'b.ts', content: 'y' })) + '\n',
      'utf8',
    );
    const third = await readSessionInsights(file, 's1');
    expect(third).not.toBe(first);
    expect(third.totals.files).toBe(2);
  });

  it('无计划无改动时返回空结构', async () => {
    const file = writeSession([{ type: 'user', message: { role: 'user', content: '你好' } }]);
    const insights = await readSessionInsights(file, 's1');
    expect(insights.plan).toBeNull();
    expect(insights.changes).toEqual([]);
    expect(insights.totals).toEqual({ files: 0, added: 0, removed: 0, edits: 0 });
  });

  it('文件不存在时返回空结构而不抛错', async () => {
    const insights = await readSessionInsights(path.join(os.tmpdir(), 'no-such-file.jsonl'), 's1');
    expect(insights.sessionId).toBe('s1');
    expect(insights.changes).toEqual([]);
  });
});
