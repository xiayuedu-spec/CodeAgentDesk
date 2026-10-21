import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));

const { looksBinary, matchLine, searchCode, shouldSkipDir } = await import('../code-search');

const dirs: string[] = [];
function makeRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadesk-code-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return dir;
}
afterAll(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('过滤规则', () => {
  it('依赖/产物目录不搜', () => {
    for (const dir of ['node_modules', 'dist', '.git', 'coverage', 'target']) {
      expect(shouldSkipDir(dir)).toBe(true);
    }
    expect(shouldSkipDir('src')).toBe(false);
  });

  it('二进制按扩展名或 NUL 字节判定', () => {
    expect(looksBinary('a.png', Buffer.from('x'))).toBe(true);
    expect(looksBinary('a.ts', Buffer.from('x'))).toBe(false);
    expect(looksBinary('a.bin', Buffer.from([0x61, 0x00, 0x62]))).toBe(true);
  });

  it('匹配大小写不敏感', () => {
    expect(matchLine('const Foo = 1', 'foo')).toBe(true);
    expect(matchLine('const Foo = 1', 'bar')).toBe(false);
  });
});

describe('searchCode', () => {
  it('返回相对路径、行号与命中行，并跳过依赖目录', async () => {
    const repo = makeRepo({
      'src/a.ts': 'const x = 1;\nconst needme = 2;\n',
      'src/deep/b.ts': 'export function needme() {}\n',
      'node_modules/pkg/index.js': 'const needme = 3;\n',
      'dist/bundle.js': 'const needme = 4;\n',
    });
    const result = await searchCode(repo, 'needme');
    expect(result.hits.map((hit) => `${hit.path}:${hit.line}`)).toEqual([
      'src/a.ts:2',
      'src/deep/b.ts:1',
    ]);
    expect(result.fileCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('路径统一用正斜杠（便于前端展示与跨平台）', async () => {
    const repo = makeRepo({ 'src/x/y.ts': 'needle\n' });
    const result = await searchCode(repo, 'needle');
    expect(result.hits[0].path).toBe('src/x/y.ts');
  });

  it('关键词太短直接返回空（避免全量返回）', async () => {
    const repo = makeRepo({ 'a.ts': 'x\n' });
    expect((await searchCode(repo, 'x')).hits).toEqual([]);
    expect((await searchCode(repo, '  ')).hits).toEqual([]);
  });

  it('同一文件最多返回若干条命中', async () => {
    const lines = Array.from({ length: 50 }, () => 'hit').join('\n');
    const repo = makeRepo({ 'big.ts': lines });
    const result = await searchCode(repo, 'hit');
    expect(result.hits.length).toBeLessThanOrEqual(8);
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it('二进制与超大文件跳过', async () => {
    const repo = makeRepo({ 'a.ts': 'needle\n' });
    fs.writeFileSync(path.join(repo, 'img.bin'), Buffer.from([0x00, 0x6e, 0x65, 0x65, 0x64, 0x6c, 0x65]));
    const result = await searchCode(repo, 'needle');
    expect(result.hits.map((hit) => hit.path)).toEqual(['a.ts']);
  });
});
