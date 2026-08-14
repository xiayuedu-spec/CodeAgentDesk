import { useEffect, useState } from 'react';
import type { AppInfo, ClaudeConfigInfo, ThemeName } from '../../shared/types';

/** 应用级 UI 状态：版本信息、Claude 目录配置、最近目录、设置弹窗、全局错误提示。 */
export function useUiState() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [claudeInfo, setClaudeInfo] = useState<ClaudeConfigInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentDirs, setRecentDirs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getAppInfo()
      .then((info) => {
        if (!cancelled) setAppInfo(info);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getClaudeConfig()
      .then((info) => {
        if (!cancelled) setClaudeInfo(info);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getRecentDirs()
      .then((dirs) => {
        if (!cancelled) setRecentDirs(dirs);
      })
      .catch(() => {
        // 静默忽略。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshRecentDirs(): Promise<void> {
    try {
      setRecentDirs(await window.codeagentdesk.getRecentDirs());
    } catch {
      // 静默忽略最近目录刷新失败。
    }
  }

  async function handlePickClaudeDir(): Promise<void> {
    const picked = await window.codeagentdesk.pickClaudeDir();
    if (!picked.dir) return;
    const info = await window.codeagentdesk.setClaudeDir(picked.dir);
    setClaudeInfo(info);
  }

  async function handleResetClaudeDir(): Promise<void> {
    const info = await window.codeagentdesk.setClaudeDir(null);
    setClaudeInfo(info);
  }

  async function handleSetTheme(theme: ThemeName): Promise<void> {
    const info = await window.codeagentdesk.setTheme(theme);
    setClaudeInfo(info);
  }

  return {
    appInfo,
    claudeInfo,
    settingsOpen,
    setSettingsOpen,
    recentDirs,
    refreshRecentDirs,
    error,
    setError,
    handlePickClaudeDir,
    handleResetClaudeDir,
    handleSetTheme,
  };
}
