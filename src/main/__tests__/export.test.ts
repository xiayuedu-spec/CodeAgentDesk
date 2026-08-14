import { describe, expect, it } from 'vitest';
import { buildMarkdown } from '../export';
import type { SessionDetailEntry } from '../../shared/types';

function detail(entries: SessionDetailEntry[]): Parameters<typeof buildMarkdown>[0] {
  return { sessionId: 'sess-123', title: '测试会话', cwd: 'D:\\proj', entries };
}

describe('buildMarkdown 导出', () => {
  it('输出标题与元信息', () => {
    const md = buildMarkdown(detail([]));
    expect(md).toContain('# 测试会话');
    expect(md).toContain('会话 ID：sess-123');
    expect(md).toContain('工作目录：D:\\proj');
  });

  it('用户消息以引用块展示', () => {
    const md = buildMarkdown(detail([{ role: 'user', text: '第一行\n第二行' }]));
    expect(md).toContain('**User**');
    expect(md).toContain('> 第一行');
    expect(md).toContain('> 第二行');
  });

  it('助手消息原样展示', () => {
    const md = buildMarkdown(detail([{ role: 'assistant', text: '好的，已处理。' }]));
    expect(md).toContain('**Claude**');
    expect(md).toContain('好的，已处理。');
  });

  it('工具调用折叠为 details，包含输入输出', () => {
    const md = buildMarkdown(
      detail([{ role: 'tool', toolName: 'Read', toolInput: '{"path":"a.ts"}', toolOutput: '内容' }]),
    );
    expect(md).toContain('<details><summary>工具：Read</summary>');
    expect(md).toContain('"path":"a.ts"');
    expect(md).toContain('内容');
    expect(md).toContain('</details>');
  });
});
