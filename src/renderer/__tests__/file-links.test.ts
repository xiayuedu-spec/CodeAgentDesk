import { describe, expect, it } from 'vitest';
import { findFileLinks } from '../file-links';

describe('findFileLinks', () => {
  it('识别相对路径与行号', () => {
    const links = findFileLinks('报错在 src/main/ipc-app.ts:143 这一行');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ path: 'src/main/ipc-app.ts', line: 143 });
  });

  it('识别 Windows 绝对路径（反斜杠）', () => {
    const links = findFileLinks('at D:\\ai\\proj\\src\\a.ts:12:5');
    expect(links[0]).toMatchObject({ path: 'D:\\ai\\proj\\src\\a.ts', line: 12 });
  });

  it('没有行号也能识别', () => {
    const links = findFileLinks('打开 package.json 看看');
    expect(links[0]).toMatchObject({ path: 'package.json', line: undefined });
  });

  it('不把版本号/数字当文件', () => {
    expect(findFileLinks('升级到 v1.2.3 了')).toEqual([]);
    expect(findFileLinks('耗时 1.5 秒')).toEqual([]);
  });

  it('一行里多个路径都识别', () => {
    const links = findFileLinks('src/a.ts:1 和 src/b.tsx:2 都改了');
    expect(links.map((link) => link.path)).toEqual(['src/a.ts', 'src/b.tsx']);
  });

  it('列区间覆盖完整路径与行号', () => {
    const text = '见 src/a.ts:12 处';
    const [link] = findFileLinks(text);
    expect(text.slice(link.start, link.end)).toBe('src/a.ts:12');
  });
});
