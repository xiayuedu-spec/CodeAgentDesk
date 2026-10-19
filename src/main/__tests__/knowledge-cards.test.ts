import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const { parseCard, serializeCard, slugify, renderIndex, listCards, saveCard, deleteCard } =
  await import('../knowledge-cards');

const dirs: string[] = [];
function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadesk-cards-'));
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function sample(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'demo',
    title: '详情页白屏是缓存 key 冲突',
    type: 'pitfall' as const,
    status: 'draft' as const,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    sessionId: 'abc-123',
    files: ['src/a.ts', 'src/b.ts'],
    phenomenon: '打开长会话详情页，右侧空白。',
    conclusion: '归档后路径变了，缓存 key 没跟着变。',
    evidence: 'src/main/session-insights.ts:239',
    ...overrides,
  };
}

describe('slugify', () => {
  it('保留中英文数字，其余折叠成连字符', () => {
    expect(slugify('会话详情页 白屏 (v2)')).toBe('会话详情页-白屏-v2');
    expect(slugify('  A/B :: C  ')).toBe('a-b-c');
  });

  it('空标题兜底', () => {
    expect(slugify('!!!')).toBe('card');
  });
});

describe('serialize / parse 往返', () => {
  it('序列化再解析得到同一张卡片', () => {
    const card = sample();
    const parsed = parseCard('demo.md', serializeCard(card));
    expect(parsed).toMatchObject({
      slug: 'demo',
      title: card.title,
      type: 'pitfall',
      status: 'draft',
      sessionId: 'abc-123',
      files: ['src/a.ts', 'src/b.ts'],
      phenomenon: card.phenomenon,
      conclusion: card.conclusion,
      evidence: card.evidence,
    });
  });

  it('缺字段/坏 front-matter 时不抛错', () => {
    expect(parseCard('x.md', 'no front matter')).toBeNull();
    const minimal = parseCard('x.md', '---\ntitle: 只有标题\n---\n');
    expect(minimal?.title).toBe('只有标题');
    expect(minimal?.type).toBe('pitfall');
    expect(minimal?.status).toBe('draft');
    expect(minimal?.files).toEqual([]);
  });

  it('未知类型回落 pitfall，未知状态回落 draft', () => {
    const parsed = parseCard('x.md', '---\ntitle: t\ntype: weird\nstatus: odd\n---\n');
    expect(parsed?.type).toBe('pitfall');
    expect(parsed?.status).toBe('draft');
  });
});

describe('renderIndex', () => {
  it('按类型分组，带验证标记与一句话结论', () => {
    const text = renderIndex([
      sample({ slug: 'a', title: '踩坑 A', type: 'pitfall', status: 'verified' }),
      sample({ slug: 'b', title: '决策 B', type: 'decision', status: 'draft' }),
    ]);
    expect(text).toContain('## 踩坑（1）');
    expect(text).toContain('- ✅ [踩坑 A](a.md)');
    expect(text).toContain('## 决策（1）');
    expect(text).toContain('- 📝 [决策 B](b.md)');
    // 顺序固定：踩坑在决策前
    expect(text.indexOf('## 踩坑')).toBeLessThan(text.indexOf('## 决策'));
  });

  it('空列表也有说明', () => {
    expect(renderIndex([])).toContain('还没有卡片');
  });
});

describe('saveCard / listCards / deleteCard', () => {
  it('新建卡片写入 docs/knowledge 并生成索引', () => {
    const repo = makeRepo();
    const card = saveCard(repo, {
      title: '会话详情页白屏',
      type: 'pitfall',
      status: 'draft',
      phenomenon: '右侧空白',
      conclusion: '缓存 key 冲突',
      files: ['src/a.ts'],
    });
    expect(card.slug).toBeTruthy();
    const file = path.join(repo, 'docs', 'knowledge', `${card.slug}.md`);
    expect(fs.existsSync(file)).toBe(true);
    const index = fs.readFileSync(path.join(repo, 'docs', 'knowledge', 'README.md'), 'utf8');
    expect(index).toContain('会话详情页白屏');
    expect(listCards(repo)).toHaveLength(1);
  });

  it('同标题新建会自动加序号，不会互相覆盖', () => {
    const repo = makeRepo();
    const first = saveCard(repo, { title: '同名', type: 'flow', status: 'draft' });
    const second = saveCard(repo, { title: '同名', type: 'flow', status: 'draft' });
    expect(second.slug).not.toBe(first.slug);
    expect(listCards(repo)).toHaveLength(2);
  });

  it('带 slug 保存 = 更新，保留 createdAt', async () => {
    const repo = makeRepo();
    const created = saveCard(repo, { title: '先这样', type: 'pitfall', status: 'draft' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = saveCard(repo, {
      slug: created.slug,
      title: '改了标题',
      type: 'pitfall',
      status: 'verified',
    });
    expect(updated.slug).toBe(created.slug);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.title).toBe('改了标题');
    expect(updated.status).toBe('verified');
    expect(listCards(repo)).toHaveLength(1);
  });

  it('删除卡片会同步重建索引', () => {
    const repo = makeRepo();
    const card = saveCard(repo, { title: '待删', type: 'module', status: 'draft' });
    expect(deleteCard(repo, card.slug)).toBe(true);
    expect(listCards(repo)).toHaveLength(0);
    const index = fs.readFileSync(path.join(repo, 'docs', 'knowledge', 'README.md'), 'utf8');
    expect(index).not.toContain('待删');
    expect(deleteCard(repo, card.slug)).toBe(false);
  });

  it('列表按更新时间倒序', () => {
    const repo = makeRepo();
    const older = saveCard(repo, { title: '旧', type: 'flow', status: 'draft' });
    const newer = saveCard(repo, { title: '新', type: 'flow', status: 'draft' });
    // 直接改文件里的 updated 字段，避免依赖时间精度
    const file = path.join(repo, 'docs', 'knowledge', `${older.slug}.md`);
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace(/updated: .*/, 'updated: 2000-01-01T00:00:00.000Z'),
      'utf8',
    );
    expect(listCards(repo)[0].slug).toBe(newer.slug);
  });
});
