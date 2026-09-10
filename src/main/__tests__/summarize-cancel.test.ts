import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 伪造 spawn 返回的子进程：可控地触发 stdout / close。 */
class FakeChild extends EventEmitter {
  pid = 4321;
  exitCode: number | null = null;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { end: vi.fn() };
  killed = false;
  kill = vi.fn(() => {
    this.killed = true;
  });

  close(code: number): void {
    this.exitCode = code;
    this.emit('close', code);
  }
}

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { cancelRunningClaude, runClaude } = await import('../summarize');

/** 最后一次启动的 claude 子进程（taskkill 的假进程被过滤掉）。 */
let claudeChild: FakeChild | null = null;

function lastChild(): FakeChild {
  if (!claudeChild) throw new Error('没有正在运行的 claude 假进程');
  return claudeChild;
}

describe('runClaude 取消', () => {
  beforeEach(() => {
    claudeChild = null;
    spawnMock.mockReset();
    spawnMock.mockImplementation((command: unknown) => {
      const child = new FakeChild();
      if (command === 'claude') claudeChild = child;
      return child;
    });
  });

  it('无任务时取消返回 false', () => {
    expect(cancelRunningClaude()).toBe(false);
  });

  it('正常退出返回 stdout', async () => {
    const promise = runClaude('hi');
    lastChild().stdout.emit('data', '摘要: ok');
    lastChild().close(0);
    await expect(promise).resolves.toBe('摘要: ok');
  });

  it('取消后以「已取消」结束，而不是当成异常退出', async () => {
    const promise = runClaude('hi');
    expect(cancelRunningClaude()).toBe(true);
    lastChild().close(1);
    await expect(promise).rejects.toThrow('已取消');
  });

  it('取消后再跑新任务不受影响', async () => {
    const first = runClaude('a');
    cancelRunningClaude();
    lastChild().close(1);
    await expect(first).rejects.toThrow('已取消');

    const second = runClaude('b');
    lastChild().stdout.emit('data', 'ok');
    lastChild().close(0);
    await expect(second).resolves.toBe('ok');
  });

  it('结束后 activeChild 清空，重复取消返回 false', async () => {
    const promise = runClaude('hi');
    lastChild().close(0);
    await promise;
    expect(cancelRunningClaude()).toBe(false);
  });
});
