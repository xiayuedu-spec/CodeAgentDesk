import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { UsageTrendDay } from '../../shared/types';

interface UsageTrendModalProps {
  onClose: () => void;
}

const DAYS = 14;
const W = 620;
const H = 230;
const PAD_LEFT = 46;
const PAD_RIGHT = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

function dayTotal(day: UsageTrendDay): number {
  return day.inputTokens + day.outputTokens + day.cacheReadTokens + day.cacheCreationTokens;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

/** Token 用量趋势弹窗：近 N 天按日堆叠柱状图（自绘 SVG，无图表库依赖）。 */
export function UsageTrendModal({ onClose }: UsageTrendModalProps) {
  const [days, setDays] = useState<UsageTrendDay[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getUsageTrend(DAYS)
      .then((value) => {
        if (!cancelled) setDays(value);
      })
      .catch(() => {
        if (!cancelled) setDays([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const maxTotal = days ? Math.max(1, ...days.map(dayTotal)) : 1;
  const barSlot = chartW / DAYS;
  const barW = Math.max(4, barSlot * 0.62);
  const segments: { key: keyof UsageTrendDay; color: string }[] = [
    { key: 'inputTokens', color: 'var(--accent)' },
    { key: 'outputTokens', color: 'var(--warn)' },
    { key: 'cacheReadTokens', color: 'var(--border-strong)' },
    { key: 'cacheCreationTokens', color: 'var(--text-faint)' },
  ];

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel usage-trend-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">Token 用量趋势（近 {DAYS} 天）</span>
          <div className="day-actions">
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="day-body usage-trend-body">
          {days === null ? (
            <div className="day-loading">正在统计…</div>
          ) : maxTotal === 1 ? (
            <div className="day-empty">暂无用量数据</div>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                height={H}
                role="img"
                aria-label="Token 用量趋势图"
              >
                {days.map((day, i) => {
                  const x = PAD_LEFT + i * barSlot + (barSlot - barW) / 2;
                  const total = dayTotal(day);
                  let y = PAD_TOP + chartH;
                  return (
                    <g key={day.date}>
                      {segments.map((segment) => {
                        const value = (day[segment.key] as number) || 0;
                        if (value <= 0) return null;
                        const h = (value / maxTotal) * chartH;
                        y -= h;
                        return (
                          <rect
                            key={segment.key}
                            x={x}
                            y={y}
                            width={barW}
                            height={Math.max(0, h - 1)}
                            rx={2}
                            fill={segment.color}
                          >
                            <title>{`${day.date} ${segment.key}`}</title>
                          </rect>
                        );
                      })}
                      <text
                        x={x + barW / 2}
                        y={PAD_TOP + chartH + 16}
                        textAnchor="middle"
                        className="usage-trend-axis"
                      >
                        {i % 2 === 0 || i === DAYS - 1 ? day.date.slice(5) : ''}
                      </text>
                      <title>{`${day.date} · 总计 ${formatTokens(total)}`}</title>
                    </g>
                  );
                })}
                <line
                  x1={PAD_LEFT}
                  y1={PAD_TOP + chartH}
                  x2={W - PAD_RIGHT}
                  y2={PAD_TOP + chartH}
                  stroke="var(--border)"
                />
              </svg>
              <div className="usage-legend usage-trend-legend">
                <span>
                  <i className="usage-dot in" />
                  输入
                </span>
                <span>
                  <i className="usage-dot out" />
                  输出
                </span>
                <span>
                  <i className="usage-dot cache" />
                  缓存读
                </span>
                <span>
                  <i className="usage-dot cache" />
                  缓存写
                </span>
                <span className="usage-trend-total">
                  峰值 {formatTokens(maxTotal)} / 日
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
