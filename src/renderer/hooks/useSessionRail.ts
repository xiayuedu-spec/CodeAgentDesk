import { useEffect, useState } from 'react';
import type { SessionGitInfo, SessionInsights } from '../../shared/types';

/** 运行中的会话按这个间隔刷新右栏数据（主进程按 mtime 缓存，未变化时几乎零成本）。 */
const REFRESH_MS = 15_000;

/**
 * 右栏数据：会话洞察（计划/改动/痕迹）+ 工作区 git 摘要。
 * 会话切走/结束就停止轮询；`running` 为 false 时只取一次。
 */
export function useSessionRail(
  sessionId: string | undefined,
  cwd: string | undefined,
  running: boolean,
): { insights: SessionInsights | null; git: SessionGitInfo | null } {
  const [insights, setInsights] = useState<SessionInsights | null>(null);
  const [git, setGit] = useState<SessionGitInfo | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setInsights(null);
      return;
    }
    let cancelled = false;
    const load = (): void => {
      window.codeagentdesk
        .getSessionInsights(sessionId)
        .then((value) => {
          if (!cancelled) setInsights(value);
        })
        .catch(() => {
          if (!cancelled) setInsights(null);
        });
    };
    setInsights(null);
    load();
    if (!running) return () => {
      cancelled = true;
    };
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, running]);

  useEffect(() => {
    if (!cwd) {
      setGit(null);
      return;
    }
    let cancelled = false;
    window.codeagentdesk
      .getSessionGit(cwd)
      .then((value) => {
        if (!cancelled) setGit(value);
      })
      .catch(() => {
        if (!cancelled) setGit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return { insights, git };
}
