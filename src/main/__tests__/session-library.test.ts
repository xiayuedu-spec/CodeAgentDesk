import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => path.join(os.tmpdir(), 'codeagentdesk-test') },
}));

import { readChatEntries, readSessionDetail, readSessionInfo } from '../session-library';

function writeTemp(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-'));
  const file = path.join(dir, 'sess-abc.jsonl');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

describe('JSONL 解析（readChatEntries）', () => {
  it('解析字符串 content 的用户消息', async () => {
    const file = writeTemp(JSON.stringify({ type: 'user', message: { content: '你好' } }) + '\n');
    const entries = await readChatEntries(file);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ role: 'user', text: '你好' });
  });

  it('解析 content block 数组（text / tool_result）', async () => {
    const lines = [
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: '请读文件' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '我来读' },
            { type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a.ts' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: '文件内容' }] },
      }),
      '',
    ].join('\n');
    const file = writeTemp(lines);
    const entries = await readChatEntries(file);
    expect(entries.map((e) => e.role)).toEqual(['user', 'assistant']);
    expect(entries[1].text).toBe('我来读');
  });

  it('忽略坏行', async () => {
    const file = writeTemp('{bad json\n' + JSON.stringify({ type: 'user', message: { content: 'ok' } }) + '\n');
    const entries = await readChatEntries(file);
    expect(entries).toHaveLength(1);
  });
});

describe('JSONL 解析（readSessionInfo）', () => {
  it('提取 cwd / timestamp / ai-title', async () => {
    const file = writeTemp(
      [
        JSON.stringify({ type: 'last-prompt', sessionId: 'sess-abc', leafUuid: 'x' }),
        JSON.stringify({ type: 'ai-title', aiTitle: '修复缓存问题', timestamp: '2026-08-01T10:00:00.000Z' }),
        JSON.stringify({ type: 'user', cwd: 'D:\\proj', entrypoint: 'cli', message: { content: '开始' }, timestamp: '2026-08-01T10:00:01.000Z' }),
        '',
      ].join('\n'),
    );
    const info = await readSessionInfo(file);
    expect(info.cwd).toBe('D:\\proj');
    expect(info.title).toBe('修复缓存问题');
    expect(info.startedAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('无 ai-title 时取首条用户输入作标题', async () => {
    const file = writeTemp(
      JSON.stringify({ type: 'user', cwd: 'D:\\p', message: { content: '  帮我 重构 代码  ' } }) + '\n',
    );
    const info = await readSessionInfo(file);
    expect(info.title).toBe('帮我 重构 代码');
  });

  it('截断超过 500 行', async () => {
    const lines: string[] = [];
    for (let i = 0; i < 520; i += 1) {
      lines.push(JSON.stringify({ type: 'user', message: { content: `行${i}` } }));
    }
    const file = writeTemp(lines.join('\n') + '\n');
    const info = await readSessionInfo(file);
    expect(info.title).toBe('行0');
  });
});

describe('JSONL 解析（readSessionDetail 工具链）', () => {
  it('tool_use 与 tool_result 配对展示', async () => {
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 't9', name: 'Edit', input: { path: 'b.ts' } }] },
      }),
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't9', content: '成功' }] },
      }),
      '',
    ].join('\n');
    const file = writeTemp(lines);
    const entries = await readSessionDetail(file);
    expect(entries).toHaveLength(1);
    expect(entries[0].role).toBe('tool');
    expect(entries[0].toolName).toBe('Edit');
    expect(entries[0].toolOutput).toBe('成功');
  });
});
