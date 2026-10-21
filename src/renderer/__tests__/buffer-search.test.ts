import { describe, expect, it } from 'vitest';
import { findInBufferLines, needleCandidates } from '../buffer-search';

const buffer = [
  '❯ 帮我把 diff 面板的列对齐问题修一下',
  '● 我先看当前样式',
  '  Read src/renderer/styles.css:7102',
  '❯ 继续',
  '● 改完了',
  '❯ 继续',
  '● 再跑一遍测试',
];

describe('findInBufferLines', () => {
  it('找到单行命中的行号与列号', () => {
    const match = findInBufferLines(buffer, '我先看当前样式');
    expect(match?.row).toBe(1);
    expect(match?.column).toBeGreaterThan(0);
  });

  it('同一句出现多次：默认取最后一次，fromEnd 可指回前一次', () => {
    expect(findInBufferLines(buffer, '继续')?.row).toBe(5);
    expect(findInBufferLines(buffer, '继续', 1)?.row).toBe(3);
  });

  it('折行也能命中（按整屏拼接），跨行时不给列号', () => {
    const wrapped = ['❯ 归档的会话被重新点开之后，再关闭', '不要直接退回归档中，应该放到历史会话'];
    const match = findInBufferLines(wrapped, '再关闭不要直接退回归档中');
    expect(match).not.toBeNull();
    expect(match?.row).toBe(0);
    // 命中跨越两行 → 列号为 -1，调用方只滚动不高亮
    expect(match?.column).toBe(-1);
  });

  it('忽略空白差异（TUI 可能插入额外空格）', () => {
    const spaced = ['❯   继续   优化   界面'];
    expect(findInBufferLines(spaced, '继续 优化 界面')?.row).toBe(0);
  });

  it('大小写不敏感', () => {
    expect(findInBufferLines(['Read SRC/App.tsx'], 'src/app.tsx')?.row).toBe(0);
  });

  it('找不到返回 null（不抛错）', () => {
    expect(findInBufferLines(buffer, '根本不存在的句子')).toBeNull();
    expect(findInBufferLines([], '任何内容')).toBeNull();
  });

  it('太短的针直接放弃（避免误命中）', () => {
    expect(findInBufferLines(buffer, '继续')).not.toBeNull();
    expect(findInBufferLines(buffer, 'a')).toBeNull();
  });

  it('空行不影响行号反查', () => {
    const withBlanks = ['', '   ', '❯ 目标句子在这里', '', ''];
    expect(findInBufferLines(withBlanks, '目标句子在这里')?.row).toBe(2);
  });
});

describe('needleCandidates', () => {
  it('长句给出 24/12/8 三级针', () => {
    const text = '归档中最好也增加分组，即之前是在哪个分组在归档里就还在哪个分组';
    const candidates = needleCandidates(text);
    expect(candidates.map((candidate) => candidate.length)).toEqual([24, 12, 8]);
  });

  it('短句去重、不足 4 字丢弃', () => {
    expect(needleCandidates('继续')).toEqual([]);
    expect(needleCandidates('abcdefgh')).toEqual(['abcdefgh']);
  });

  it('空白折叠后计算长度', () => {
    expect(needleCandidates('  继续   优化   界面  ')).toEqual(['继续 优化 界面']);
  });
});
