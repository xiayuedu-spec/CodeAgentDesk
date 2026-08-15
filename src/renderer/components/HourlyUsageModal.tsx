import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { HourlyUsage } from '../../shared/types';

interface HourlyUsageModalProps {
  onClose: () => void;
}

const HOURLY_LIMIT = 10_000_000;

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

/** 今日每小时 Token 用量柱状图（每自然小时一根柱，限额参考线）。 */
export function HourlyUsageModal({ onClose }: HourlyUsageModalProps) {
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
  const maxTokens = Math.max(1, ...visible.map((item) => item.tokens), HOURLY_LIMIT);
  const total = visible.reduce((sum, item) => sum + item.tokens, 0);

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel hourly-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">今日每小时用量</span>
          <div className="day-actions">
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="day-body">
          {hours === null ? (
            <div className="day-loading">正在统计…</div>
          ) : total === 0 ? (
            <div className="day-empty">今天还没有用量</div>
          ) : (
            <>
              <div className="hourly-chart">
                {visible.map((item) => {
                  const isCurrent = item.hour === currentHour;
                  const overLimit = item.tokens > HOURLY_LIMIT;
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
                      <span className="hourly-label">
                        {item.hour % 3 === 0 || isCurrent ? item.hour : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="hourly-legend">
                <span>
                  <i className="hourly-dot current" />
                  当前小时
                </span>
                <span>
                  <i className="hourly-dot over" />
                  超限（&gt;{formatTokens(HOURLY_LIMIT)}）
                </span>
                <span className="hourly-total">今日合计 {formatTokens(total)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
