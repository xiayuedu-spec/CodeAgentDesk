import { Notification } from 'electron';
import { readConfig, resolveClaudeHome } from './config';
import { getCurrentHourUsage } from './session-library';
import type { SessionMetaStore } from './session-meta-store';

/** 默认小时限额（token），工作环境限制；可通过 config.json 的 tokenLimitPerHour 覆盖。 */
export const DEFAULT_HOURLY_LIMIT = 10_000_000;

const CHECK_INTERVAL_MS = 5 * 60_000; // 每 5 分钟检查
const TIERS = [
  { percent: 0.8, key: '80', label: '80%' },
  { percent: 1.0, key: '100', label: '100%' },
];

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

/**
 * Token 限额预警：统计当前自然小时（整点起，额度整点刷新）的消耗，
 * 达到限额 80% / 100% 时发系统通知（每档每小时仅一次）。
 */
export function startUsageWarning(metaStore: SessionMetaStore): void {
  let notifiedHour = -1;
  const notified = new Set<string>();
  const check = async (): Promise<void> => {
    try {
      const claudeHome = resolveClaudeHome(readConfig());
      const limit = readConfig().tokenLimitPerHour ?? DEFAULT_HOURLY_LIMIT;
      const { tokens } = await getCurrentHourUsage(claudeHome, metaStore);
      const hour = new Date().getHours();
      // 跨小时（整点刷新额度）时重置通知档位。
      if (hour !== notifiedHour) {
        notifiedHour = hour;
        notified.clear();
      }
      for (const tier of TIERS) {
        if (tokens >= limit * tier.percent && !notified.has(tier.key)) {
          notified.add(tier.key);
          if (Notification.isSupported()) {
            new Notification({
              title: 'CodeAgentDesk · Token 限额预警',
              body: `本小时已消耗 ${formatTokens(tokens)} token，已达限额的 ${tier.label}`,
            }).show();
          }
        }
      }
    } catch {
      // 检查失败静默忽略，下轮再试。
    }
  };
  setInterval(() => void check(), CHECK_INTERVAL_MS);
}
