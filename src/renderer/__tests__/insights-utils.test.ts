import { describe, expect, it } from 'vitest';
import type { SessionInsights, SessionTodo } from '../../shared/types';
import {
  buildContinuePrompt,
  buildInsightsMarkdown,
  formatClock,
  formatDuration,
  shortenPath,
} from '../insights-utils';

function todo(content: string, status: SessionTodo['status']): SessionTodo {
  return { content, status };
}

function insights(overrides: Partial<SessionInsights> = {}): SessionInsights {
  return {
    sessionId: 's1',
    plan: null,
    changes: [],
    totals: { files: 0, added: 0, removed: 0, edits: 0 },
    stats: { turns: 0, toolCalls: 0, errors: 0, activeMs: 0 },
    prompts: [],
    skipped: 0,
    ...overrides,
  };
}

describe('buildContinuePrompt 续做提示', () => {
  it('全部完成时返回 null（没有可继续的东西）', () => {
    expect(
      buildContinuePrompt({
        todos: [todo('a', 'completed'), todo('b', 'completed')],
        updates: 1,
      }),
    ).toBeNull();
  });

  it('空计划返回 null', () => {
    expect(buildContinuePrompt({ todos: [], updates: 0 })).toBeNull();
  });

  it('只列未完成项，并带上完成比例', () => {
    const prompt = buildContinuePrompt({
      todos: [todo('已完成项', 'completed'), todo('待办一', 'pending'), todo('待办二', 'pending')],
      updates: 2,
    });
    expect(prompt).toContain('已完成 1/3');
    expect(prompt).toContain('1）待办一；2）待办二');
    expect(prompt).not.toContain('已完成项');
  });

  it('有进行中的项时优先点名它', () => {
    const prompt = buildContinuePrompt({
      todos: [todo('进行中的项', 'in_progress'), todo('后面的', 'pending')],
      updates: 1,
    });
    expect(prompt).toContain('先把「进行中的项」做完');
  });

  it('没有进行中的项时按顺序继续', () => {
    const prompt = buildContinuePrompt({
      todos: [todo('a', 'pending')],
      updates: 1,
    });
    expect(prompt).toContain('按顺序继续');
  });

  it('必须是单行（写进 pty 只跟一次回车）', () => {
    const prompt = buildContinuePrompt({
      todos: [todo('多\n行\n的待办', 'pending')],
      updates: 1,
    });
    expect(prompt).not.toBeNull();
    expect(prompt).not.toContain('\n');
  });

  it('超长计划截断到 1500 字符，避免把终端刷爆', () => {
    const prompt = buildContinuePrompt({
      todos: Array.from({ length: 200 }, (_, index) => todo(`待办项目 ${index}`, 'pending')),
      updates: 1,
    });
    expect(prompt).not.toBeNull();
    expect((prompt as string).length).toBeLessThanOrEqual(1500);
  });
});

describe('shortenPath 路径中段省略', () => {
  it('短路径原样返回', () => {
    expect(shortenPath('a.ts')).toBe('a.ts');
    expect(shortenPath('src/a.ts')).toBe('src/a.ts');
  });

  it('长路径保留首段与末尾两段', () => {
    expect(shortenPath('D:\\ai\\proj\\src\\components\\InfoPanel.tsx')).toBe(
      'D:\\…\\components\\InfoPanel.tsx',
    );
  });

  it('POSIX 路径保留根、分隔符跟随输入', () => {
    expect(shortenPath('/home/user/proj/src/index.ts')).toBe('/home/…/src/index.ts');
    expect(shortenPath('a//b/c/d/e')).toBe('a/…/d/e');
  });
});

describe('formatDuration 时长', () => {
  it('0 / 负数 / 缺失都显示占位符', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(-1000)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });

  it('不到 1 分钟、分钟、小时+分钟、整小时', () => {
    expect(formatDuration(30_000)).toBe('不到 1 分钟');
    expect(formatDuration(45 * 60_000)).toBe('45 分钟');
    expect(formatDuration(134 * 60_000)).toBe('2 小时 14 分');
    expect(formatDuration(120 * 60_000)).toBe('2 小时');
  });
});

describe('formatClock 时间', () => {
  it('补零到 HH:mm', () => {
    const iso = new Date(2026, 0, 2, 9, 5).toISOString();
    expect(formatClock(iso)).toBe('09:05');
  });

  it('缺失或非法值返回占位符', () => {
    expect(formatClock(undefined)).toBe('—');
    expect(formatClock('not-a-date')).toBe('—');
  });
});

describe('buildInsightsMarkdown 摘要', () => {
  it('包含改动统计与痕迹行', () => {
    const text = buildInsightsMarkdown(
      '会话 A',
      insights({
        totals: { files: 2, added: 30, removed: 4, edits: 3 },
        stats: { turns: 5, toolCalls: 12, errors: 1, activeMs: 45 * 60_000 },
      }),
    );
    expect(text).toContain('## 会话 A');
    expect(text).toContain('改动：2 个文件，+30 -4（3 次编辑）');
    expect(text).toContain('痕迹：5 轮对话 · 12 次工具调用 · 1 次失败 · 活跃 45 分钟');
  });

  it('计划用 Markdown 复选框，进行中额外标注', () => {
    const text = buildInsightsMarkdown(
      '会话 B',
      insights({
        plan: {
          todos: [todo('已完成', 'completed'), todo('在做', 'in_progress'), todo('没开始', 'pending')],
          updates: 2,
        },
      }),
    );
    expect(text).toContain('### 计划（1/3 完成，快照 2 次）');
    expect(text).toContain('- [x] 已完成');
    expect(text).toContain('- [ ] 在做 **（进行中）**');
    expect(text).toContain('- [ ] 没开始');
  });

  it('改动片段导出成 diff 代码块，整文件写入带标注', () => {
    const text = buildInsightsMarkdown(
      '会话 C',
      insights({
        changes: [
          {
            path: 'a.ts',
            edits: 1,
            added: 1,
            removed: 1,
            hunks: [{ kind: 'edit', oldText: 'old', newText: 'new' }],
            hiddenHunks: 0,
          },
          {
            path: 'b.md',
            edits: 1,
            added: 2,
            removed: 0,
            written: true,
            hunks: [{ kind: 'write', oldText: '', newText: 'x\ny' }],
            hiddenHunks: 0,
          },
        ],
      }),
    );
    expect(text).toContain('#### a.ts（+1 -1，1 次）');
    expect(text).toContain('-old');
    expect(text).toContain('+new');
    expect(text).toContain('#### b.md（+2 -0，1 次，整文件写入）');
    expect(text).toContain('+x');
  });

  it('没有痕迹时不输出空行', () => {
    const text = buildInsightsMarkdown('会话 D', insights());
    expect(text).not.toContain('痕迹：');
  });
});
