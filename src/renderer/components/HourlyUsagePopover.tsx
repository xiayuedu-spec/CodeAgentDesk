import { useEffect, useState } from 'react';
import type { HourlyUsage } from '../../shared/types';

interface HourlyUsagePopoverProps {
  limit: number;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

/** 左下角小窗：今日每小时 Token 用量柱状图（无遮罩，跟随卡片定位）。 */
export function HourlyUsagePopover({ limit }: HourlyUsagePopoverProps) {
  const [hours, setHours] = useState<HourlyUsage[] | null>(null);
  const currentHour = new Date().getHours();

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getHourlyUsageToday()
      .then((value) => {
        if (!cancelled) setHours(value);
      })
      .catch(() => {
        if (!cancelled) setHours([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = hours ?? [];
  const maxTokens = Math.max(1, ...visible.map((item) => item.tokens), limit);
  const total = visible.reduce((sum, item) => sum + item.tokens, 0);

  return (
    <div className="hourly-popover" onClick={(event) => event.stopPropagation()}>
      <div className="hourly-popover-title">今日每小时用量</div>
      {hours === null ? (
        <div className="day-loading">正在统计…</div>
      ) : total === 0 ? (
        <div className="hourly-popover-empty">今天还没有用量</div>
      ) : (
        <>
          <div className="hourly-chart hourly-chart-compact">
            {visible.map((item) => {
              const isCurrent = item.hour === currentHour;
              const overLimit = item.tokens > limit;
              const height = Math.max(2, (item.tokens / maxTokens) * 100);
              return (
                <div key={item.hour} className="hourly-col">
                  <div
                    className={`hourly-bar${isCurrent ? ' current' : ''}${overLimit ? ' over' : ''}`}
                    style={{ height: `${height}%` }}
                    title={`${item.hour}:00 - ${item.tokens.toLocaleString()} token${
                      overLimit ? '（超限）' : ''
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <div className="hourly-legend hourly-legend-compact">
            <span>
              <i className="hourly-dot current" />
              当前小时
            </span>
            <span>
              <i className="hourly-dot over" />
              超限
            </span>
            <span className="hourly-total">合计 {formatTokens(total)}</span>
          </div>
        </>
      )}
    </div>
  );
}
