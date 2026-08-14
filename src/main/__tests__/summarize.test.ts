import { describe, expect, it } from 'vitest';
import { parseSummary } from '../summarize';

describe('parseSummary 摘要解析', () => {
  it('解析摘要与标签两行', () => {
    const result = parseSummary('摘要: 完成了分组功能\n标签: 分组, UI, 重构\n');
    expect(result.summary).toBe('完成了分组功能');
    expect(result.tags).toEqual(['分组', 'UI', '重构']);
  });

  it('兼容中英文冒号', () => {
    const result = parseSummary('摘要：修复归档删除\n标签：删除, 僵尸会话');
    expect(result.summary).toBe('修复归档删除');
    expect(result.tags).toEqual(['删除', '僵尸会话']);
  });

  it('标签去重上限 5 个', () => {
    const result = parseSummary('标签: a, b, c, d, e, f');
    expect(result.tags).toHaveLength(5);
  });

  it('无标记时兜底取首行前 80 字', () => {
    const result = parseSummary('这是一段没有标记的输出内容');
    expect(result.summary).toBe('这是一段没有标记的输出内容');
    expect(result.tags).toEqual([]);
  });
});
