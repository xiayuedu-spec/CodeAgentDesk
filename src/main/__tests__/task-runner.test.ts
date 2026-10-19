import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { listScripts, startTask, stopTask, runningTaskCount } = await import('../task-runner');

const dirs: string[] = [];

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadesk-task-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

afterAll(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('listScripts', () => {
  it('读出 package.json 的 scripts，顺序与文件一致', () => {
    const dir = makeProject({
      'package.json': JSON.stringify({
        scripts: { dev: 'vite', test: 'vitest run', build: 'tsc && vite build' },
      }),
    });
    const info = listScripts(dir);
    expect(info.hasPackageJson).toBe(true);
    expect(info.manager).toBe('npm');
    expect(info.scripts.map((item) => item.name)).toEqual(['dev', 'test', 'build']);
    expect(info.scripts[1].command).toBe('vitest run');
  });

  it('按 lockfile 识别包管理器', () => {
    const pnpm = makeProject({ 'package.json': '{"scripts":{}}', 'pnpm-lock.yaml': '' });
    expect(listScripts(pnpm).manager).toBe('pnpm');
    const yarn = makeProject({ 'package.json': '{"scripts":{}}', 'yarn.lock': '' });
    expect(listScripts(yarn).manager).toBe('yarn');
  });

  it('没有 package.json / 没有 scripts 时返回空表而不是抛错', () => {
    const none = makeProject({ 'README.md': '# hi' });
    expect(listScripts(none)).toMatchObject({ hasPackageJson: false, scripts: [] });

    const noScripts = makeProject({ 'package.json': '{"name":"x"}' });
    const info = listScripts(noScripts);
    expect(info.hasPackageJson).toBe(true);
    expect(info.scripts).toEqual([]);
  });

  it('package.json 坏掉时返回空表', () => {
    const broken = makeProject({ 'package.json': '{ not json' });
    expect(listScripts(broken).scripts).toEqual([]);
  });
});

describe('startTask / stopTask', () => {
  let project: string;

  beforeAll(() => {
    project = makeProject({
      'package.json': JSON.stringify({
        scripts: {
          echo: 'node -e "console.log(\'hello-task\')"',
          fail: 'node -e "process.exit(2)"',
          sleepy: 'node -e "setTimeout(() => {}, 30000)"',
        },
      }),
    });
  });

  it('未声明的脚本拒绝启动（不提供自由 shell）', () => {
    expect(startTask(project, 'rm -rf /', { onData: () => {}, onExit: () => {} })).toBeNull();
  });

  it('真实执行脚本：拿到输出与退出码', async () => {
    const chunks: string[] = [];
    const code = await new Promise<number | null>((resolve, reject) => {
      const started = startTask(project, 'echo', {
        onData: (_id, chunk) => chunks.push(chunk),
        onExit: (_id, exitCode) => resolve(exitCode),
      });
      if (!started) reject(new Error('任务未能启动'));
    });
    expect(code).toBe(0);
    expect(chunks.join('')).toContain('hello-task');
    expect(runningTaskCount()).toBe(0);
  }, 30_000);

  it('非零退出码原样返回', async () => {
    const code = await new Promise<number | null>((resolve, reject) => {
      const started = startTask(project, 'fail', {
        onData: () => {},
        onExit: (_id, exitCode) => resolve(exitCode),
      });
      if (!started) reject(new Error('任务未能启动'));
    });
    expect(code).toBe(2);
  }, 30_000);

  it('stopTask 能杀掉长任务，结束后不再可停', async () => {
    let taskId = '';
    const done = new Promise<number | null>((resolve, reject) => {
      const started = startTask(project, 'sleepy', {
        onData: () => {},
        onExit: (_id, exitCode) => resolve(exitCode),
      });
      if (!started) {
        reject(new Error('任务未能启动'));
        return;
      }
      taskId = started.id;
      // 等进程真的起来再杀
      setTimeout(() => stopTask(taskId), 800);
    });
    const code = await done;
    // 被杀掉的进程：退出码非 0（Windows 上 taskkill 后通常为 1）
    expect(code).not.toBe(0);
    // 断言放到 await 之后：setTimeout 里抛 expect 只会变成未处理异常
    expect(runningTaskCount()).toBe(0);
    expect(stopTask(taskId)).toBe(false);
  }, 30_000);
});
