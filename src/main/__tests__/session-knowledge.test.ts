import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
vi.mock('../summarize', () => ({ runClaude: async () => '[]' }));
vi.mock('../config', () => ({
  readConfig: () => ({}),
  resolveClaudeHome: () => '/tmp/claude',
}));
vi.mock('../session-library', () => ({
  readSessionDetail: async () => [],
  findSessionFile: async () => null,
}));

const { buildKnowledgePrompt, isSimilarTitle, normalizeTitle, parseKnowledgeCards } = await import('../session-knowledge');

describe('buildKnowledgePrompt', () => {
  it('带上已有卡片标题，避免重复', () => {
    const prompt = buildKnowledgePrompt('用户: 你好', ['已有 A', '已有 B']);
    expect(prompt).toContain('- 已有 A');
    expect(prompt).toContain('- 已有 B');
    expect(prompt).toContain('只输出 JSON 数组');
    expect(prompt).toContain('用户: 你好');
  });

  it('没有已有卡片时给出占位', () => {
    expect(buildKnowledgePrompt('x', [])).toContain('（暂无）');
  });

  it('提示词覆盖规格与变更两类（不只是踩坑）', () => {
    const prompt = buildKnowledgePrompt('x', []);
    expect(prompt).toContain('spec（规格）');
    expect(prompt).toContain('change（变更）');
    expect(prompt).toContain('验收标准');
    expect(prompt).toContain('迁移或回归时要注意什么');
    expect(prompt).toContain('以「实现某个需求」为主');
  });
});

describe('parseKnowledgeCards', () => {
  it('解析裸 JSON 数组', () => {
    const cards = parseKnowledgeCards(
      '[{"title":"白屏是缓存 key 冲突","type":"pitfall","phenomenon":"右侧空白","conclusion":"归档后路径变了","evidence":"a.ts:1","files":["a.ts"]}]',
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: '白屏是缓存 key 冲突',
      type: 'pitfall',
      status: 'draft',
      conclusion: '归档后路径变了',
      files: ['a.ts'],
    });
  });

  it('容忍 ```json 围栏与前后废话', () => {
    const raw = '好的，结果如下：\n```json\n[{"title":"决策：hook 下沉"}]\n```\n以上。';
    expect(parseKnowledgeCards(raw)).toHaveLength(1);
  });

  it('接受 spec / change 类型', () => {
    const cards = parseKnowledgeCards(
      '[{"title":"上传接口规格","type":"spec","conclusion":"单文件 ≤ 10MB，超出返回 413"},{"title":"改了上传超时","type":"change","conclusion":"30s→60s，影响大文件"}]',
    );
    expect(cards.map((card) => card.type)).toEqual(['spec', 'change']);
  });

  it('未知类型回落 pitfall，缺 title 的条目丢弃', () => {
    const cards = parseKnowledgeCards(
      '[{"title":"a","type":"weird"},{"type":"pitfall"},{"title":""}]',
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe('pitfall');
  });

  it('坏 JSON / 空数组 / 非数组都安全返回', () => {
    expect(parseKnowledgeCards('[]')).toEqual([]);
    expect(parseKnowledgeCards('[{"title":}]')).toEqual([]);
    expect(parseKnowledgeCards('没有 JSON')).toEqual([]);
    expect(parseKnowledgeCards('{"title":"a"}')).toEqual([]);
  });
});

describe('标题判重', () => {
  it('归一化：去掉空白与标点、大小写不敏感', () => {
    expect(normalizeTitle('Hook 下沉：别放 App')).toBe('hook下沉别放app');
  });

  it('相等或长标题包含短标题视为相似', () => {
    expect(isSimilarTitle('缓存 TTL 问题', '缓存ttl问题')).toBe(true);
    expect(isSimilarTitle('主进程缓存 TTL 必须小于轮询间隔', '主进程缓存 TTL')).toBe(true);
    expect(isSimilarTitle('缓存问题', '权限问题')).toBe(false);
  });

  it('短标题不做包含判断，避免误杀', () => {
    expect(isSimilarTitle('缓存', '缓存问题')).toBe(false);
  });
});
