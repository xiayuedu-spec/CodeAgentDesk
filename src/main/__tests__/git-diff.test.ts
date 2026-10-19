import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
vi.mock('../git-info', () => ({ readSessionGit: async () => null }));

const { parseUnifiedDiff, parseStatusZ } = await import('../git-diff');

const SAMPLE = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 22;
+const c = 3;
 export {};
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+hello
+world
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-bye
diff --git a/img/logo.png b/img/logo.png
index 5555555..6666666 100644
Binary files a/img/logo.png and b/img/logo.png differ
`;

describe('parseUnifiedDiff', () => {
  it('按文件聚合，路径去掉 a/ b/ 前缀', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files.map((file) => file.path)).toEqual([
      'src/a.ts',
      'src/new.ts',
      'src/old.ts',
      'img/logo.png',
    ]);
  });

  it('统计增删行数并保留上下文行', () => {
    const [file] = parseUnifiedDiff(SAMPLE);
    expect(file.added).toBe(2);
    expect(file.removed).toBe(1);
    expect(file.hunks).toHaveLength(1);
    const kinds = file.hunks[0].lines.map((line) => line.kind);
    expect(kinds).toEqual(['ctx', 'del', 'add', 'add', 'ctx']);
  });

  it('行号按 hunk 头正确推进：删行走旧号、加行走新号', () => {
    const [file] = parseUnifiedDiff(SAMPLE);
    const [, del, add1, add2, ctx] = file.hunks[0].lines;
    expect(del.oldLine).toBe(2);
    expect(del.newLine).toBeUndefined();
    expect(add1.newLine).toBe(2);
    expect(add2.newLine).toBe(3);
    expect(ctx.oldLine).toBe(3);
    expect(ctx.newLine).toBe(4);
  });

  it('识别新建 / 删除 / 重命名 / 二进制', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files[1].status).toBe('added');
    expect(files[2].status).toBe('deleted');
    expect(files[3].binary).toBe(true);
    expect(files[3].hunks).toEqual([]);

    const renamed = parseUnifiedDiff(
      `diff --git a/x.ts b/y.ts
similarity index 90%
rename from x.ts
rename to y.ts
--- a/x.ts
+++ b/y.ts
@@ -1 +1 @@
-a
+b
`,
    );
    expect(renamed[0].status).toBe('renamed');
    expect(renamed[0].path).toBe('y.ts');
  });

  it('空输入返回空数组，纯元数据不产生文件', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('index 111..222 100644\n')).toEqual([]);
  });

  it('超过行数预算的文件标记 truncated，但计数仍然准确', () => {
    const body = Array.from({ length: 500 }, (_, index) => `+line ${index}`).join('\n');
    const diff = `diff --git a/big.ts b/big.ts
--- a/big.ts
+++ b/big.ts
@@ -0,0 +1,500 @@
${body}
`;
    const [file] = parseUnifiedDiff(diff);
    expect(file.added).toBe(500);
    expect(file.truncated).toBe(true);
    expect(file.hunks[0].lines.length).toBeLessThan(500);
  });
});

describe('parseStatusZ', () => {
  it('解析 porcelain -z 的状态码与路径', () => {
    const output = ' M src/a.ts\0?? src/new.ts\0A  src/staged.ts\0';
    expect(parseStatusZ(output)).toEqual([
      { path: 'src/a.ts', code: ' M' },
      { path: 'src/new.ts', code: '??' },
      { path: 'src/staged.ts', code: 'A ' },
    ]);
  });

  it('忽略空记录', () => {
    expect(parseStatusZ('\0\0')).toEqual([]);
  });
});
