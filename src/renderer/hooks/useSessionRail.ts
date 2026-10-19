import { useEffect, useReducer, useRef } from 'react';
import type { SessionGitInfo, SessionInsights } from '../../shared/types';

/** 会话运行时的刷新间隔（主进程按 mtime / git 缓存，未变化时几乎零成本）。 */
const REFRESH_MS = 15_000;
/** 渲染层缓存上限：洞察数据可能不小（60 个文件 × 8 个片段），只留最近看过的几个会话。 */
const CACHE_MAX = 8;

/** 写入缓存并淘汰最旧的条目（Map 保持插入顺序）。 */
function put<K, V>(cache: Map<K, V>, key: K, value: V): void {
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * 右栏数据：会话洞察（计划/改动/痕迹）+ 工作区 git 摘要。
 *
 * 两个要点：
 * 1. **按会话/目录缓存**：切回看过的会话立刻有数据，不会闪一下"读取中"；换会话时也
 *    不会把上一个会话的数字短暂显示在新会话上。
 * 2. **git 参与同一个轮询**：未提交数会随会话推进变化，不能只在 cwd 变化时取一次。
 */
export function useSessionRail(
  sessionId: string | undefined,
  cwd: string | undefined,
  running: boolean,
): { insights: SessionInsights | null; git: SessionGitInfo | null } {
  const insightsCache = useRef(new Map<string, SessionInsights>());
  const gitCache = useRef(new Map<string, SessionGitInfo | null>());
  const [, bump] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const load = (): void => {
      window.codeagentdesk
        .getSessionInsights(sessionId)
        .then((value) => {
          if (cancelled) return;
          put(insightsCache.current, sessionId, value);
          bump();
        })
        .catch(() => {
          // 读取失败保留旧数据，不把右栏清空。
        });
    };
    load();
    if (!running) {
      return () => {
        cancelled = true;
      };
    }
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, running]);

  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;
    const load = (): void => {
      window.codeagentdesk
        .getSessionGit(cwd)
        .then((value) => {
          if (cancelled) return;
          put(gitCache.current, cwd, value);
          bump();
        })
        .catch(() => {
          if (cancelled) return;
          put(gitCache.current, cwd, null);
          bump();
        });
    };
    load();
    if (!running) {
      return () => {
        cancelled = true;
      };
    }
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cwd, running]);

  return {
    insights: sessionId ? (insightsCache.current.get(sessionId) ?? null) : null,
    git: cwd ? (gitCache.current.get(cwd) ?? null) : null,
  };
}
