import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { stageFiles, commitChanges } = await import('../git-write');

/** 真实 git 的集成测试：写操作必须真跑一遍，否则"看起来对"没有意义。 */
let repo: string;

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cadesk-git-'));
  // 提交需要身份：用环境变量，避免动用户全局配置。
  process.env.GIT_AUTHOR_NAME = 'Test';
  process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
  process.env.GIT_COMMITTER_NAME = 'Test';
  process.env.GIT_COMMITTER_EMAIL = 'test@example.com';
  git(repo, ['init', '-q']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\n', 'utf8');
  git(repo, ['add', 'a.txt']);
  git(repo, ['commit', '-q', '-m', 'init']);
  // 改动 + 未跟踪
  fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\nworld\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'new\n', 'utf8');
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('stageFiles 暂存', () => {
  it('暂存单个文件后进入 index', async () => {
    const result = await stageFiles(repo, ['b.txt'], true);
    expect(result.ok).toBe(true);
    expect(git(repo, ['diff', '--cached', '--name-only'])).toContain('b.txt');
  });

  it('取消暂存后离开 index', async () => {
    const result = await stageFiles(repo, ['b.txt'], false);
    expect(result.ok).toBe(true);
    expect(git(repo, ['diff', '--cached', '--name-only'])).not.toContain('b.txt');
  });

  it('空路径 + staged=true 表示全部暂存', async () => {
    const result = await stageFiles(repo, [], true);
    expect(result.ok).toBe(true);
    const staged = git(repo, ['diff', '--cached', '--name-only']);
    expect(staged).toContain('a.txt');
    expect(staged).toContain('b.txt');
  });

  it('非仓库目录返回失败而不是抛错', async () => {
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'cadesk-nogit-'));
    try {
      const result = await stageFiles(notRepo, [], true);
      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    } finally {
      fs.rmSync(notRepo, { recursive: true, force: true });
    }
  });
});

describe('commitChanges 提交', () => {
  it('空提交信息被拒绝', async () => {
    const result = await commitChanges(repo, '   ');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('提交信息');
  });

  it('提交已暂存的改动，返回 git 的提交摘要', async () => {
    const before = git(repo, ['rev-list', '--count', 'HEAD']).trim();
    const result = await commitChanges(repo, 'feat: 测试提交');
    expect(result.ok).toBe(true);
    expect(result.message).toBeTruthy();
    const after = git(repo, ['rev-list', '--count', 'HEAD']).trim();
    expect(Number(after)).toBe(Number(before) + 1);
    // 提交信息原样落地
    expect(git(repo, ['log', '-1', '--pretty=%s']).trim()).toBe('feat: 测试提交');
  });

  it('没有暂存内容时提交失败并带回 git 原话', async () => {
    const result = await commitChanges(repo, 'chore: 空提交');
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('超长提交信息被拒绝（不塞进 git）', async () => {
    const result = await commitChanges(repo, 'x'.repeat(4001));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('过长');
  });
});
