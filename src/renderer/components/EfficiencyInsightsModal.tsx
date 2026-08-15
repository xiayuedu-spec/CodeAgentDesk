import { useEffect, useState } from 'react';
import { TrendingUp, X } from 'lucide-react';
import type { EfficiencyInsights, FunStats } from '../../shared/types';
import { folderName } from '../session-utils';

interface EfficiencyInsightsModalProps {
  onClose: () => void;
}

/** 省时估算假设：人工完成同等任务约为 agent 耗时的倍数（透明可调整）。 */
const HUMAN_MULTIPLIER = 2.5;
/** Token 等价物：一本书约 10 万 token。 */
const TOKENS_PER_BOOK = 100_000;
/** 省时等价物：一个工作日约 8 小时。 */
const WORKDAY_HOURS = 8;

const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function fmtDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function mondayKey(reference?: Date): string {
  const base = reference ?? new Date();
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(base);
  start.setDate(base.getDate() + diff);
  return fmtDateKey(start);
}

function shiftWeek(weekStart: string, delta: number): string {
  const date = new Date(`${weekStart}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return fmtDateKey(date);
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '不足 1 分钟';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} 小时 ${rest} 分` : `${rest} 分钟`;
}

function formatDurationShort(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '<1m';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h${rest}m` : `${rest}m`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (date: Date): string => `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${fmt(start)} - ${fmt(end)}`;
}

/** 效率洞察弹窗：每周 agent 投入时长、会话数、产出/成本比与省时估算。 */
export function EfficiencyInsightsModal({ onClose }: EfficiencyInsightsModalProps) {
  const [weekStart, setWeekStart] = useState(() => mondayKey());
  const [data, setData] = useState<EfficiencyInsights | null>(null);
  const [fun, setFun] = useState<FunStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getEfficiencyInsights(weekStart)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  // 趣味数据（成就徽章 / 项目性格）与周无关，仅取一次。
  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getFunStats()
      .then((value) => {
        if (!cancelled) setFun(value);
      })
      .catch(() => {
        if (!cancelled) setFun(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isCurrentWeek = weekStart === mondayKey();
  const maxDaily = Math.max(1, ...(data?.daily.map((day) => day.durationMs) ?? []));
  const outputPercent =
    data && data.totalTokens > 0 ? Math.round((data.outputTokens / data.totalTokens) * 100) : 0;
  const savedMs = (data?.totalDurationMs ?? 0) * (HUMAN_MULTIPLIER - 1);
  const deltaPercent =
    data && data.prevTotalDurationMs > 0
      ? Math.round(((data.totalDurationMs - data.prevTotalDurationMs) / data.prevTotalDurationMs) * 100)
      : null;

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel eff-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">
            <TrendingUp size={14} /> 效率洞察
          </span>
          <div className="day-actions">
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="day-body">
          <div className="week-nav">
            <button type="button" aria-label="上一周" onClick={() => setWeekStart(shiftWeek(weekStart, -7))}>
              ‹
            </button>
            <span className="week-range">
              {weekRangeLabel(weekStart)}
              {isCurrentWeek ? '（本周）' : ''}
            </span>
            <button type="button" aria-label="下一周" onClick={() => setWeekStart(shiftWeek(weekStart, 7))}>
              ›
            </button>
          </div>

          {data === null ? (
            <div className="day-loading">正在统计…</div>
          ) : data.sessionCount === 0 ? (
            <div className="archive-empty">该周没有会话记录</div>
          ) : (
            <>
              <div className="eff-grid">
                <div className="eff-card">
                  <span className="eff-card-value">{data.sessionCount}</span>
                  <span className="eff-card-label">完成会话</span>
                </div>
                <div className="eff-card">
                  <span className="eff-card-value">{formatDuration(data.totalDurationMs)}</span>
                  <span className="eff-card-label">agent 投入时长</span>
                </div>
                <div className="eff-card">
                  <span className={`eff-card-value ${deltaPercent !== null && deltaPercent > 0 ? 'up' : 'down'}`}>
                    {deltaPercent === null ? '—' : `${deltaPercent > 0 ? '↑' : '↓'} ${Math.abs(deltaPercent)}%`}
                  </span>
                  <span className="eff-card-label">较上周时长</span>
                </div>
                <div className="eff-card">
                  <span className="eff-card-value accent">{formatDuration(savedMs)}</span>
                  <span className="eff-card-label">约省时（×{HUMAN_MULTIPLIER} 估算）</span>
                </div>
                <div className="eff-card">
                  <span className="eff-card-value">{outputPercent}%</span>
                  <span className="eff-card-label">输出 token 占比</span>
                </div>
              </div>

              <div className="eff-section-title">每日投入时长</div>
              <div className="hourly-chart eff-chart">
                {data.daily.map((day, index) => {
                  const height = Math.max(2, (day.durationMs / maxDaily) * 100);
                  return (
                    <div key={day.date} className="hourly-col">
                      <div
                        className={`hourly-bar${index === 6 ? ' current' : ''}`}
                        style={{ height: `${height}%` }}
                        title={`${day.date} · ${day.sessionCount} 个会话 · ${formatDuration(day.durationMs)}`}
                      />
                      <span className="hourly-label">{WEEK_DAYS[index]}</span>
                    </div>
                  );
                })}
              </div>

              <div className="eff-section-title">耗时最多的会话（产出/成本）</div>
              <ul className="eff-session-list">
                {data.topSessions.map((session) => {
                  const ratio =
                    session.totalTokens > 0
                      ? Math.round((session.outputTokens / session.totalTokens) * 100)
                      : 0;
                  return (
                    <li key={session.sessionId} className="eff-session">
                      <span className="eff-session-name" title={session.cwd}>
                        {session.customName ?? folderName(session.cwd) ?? session.sessionId}
                      </span>
                      <span className="eff-session-dur">{formatDurationShort(session.durationMs)}</span>
                      <span className="eff-session-ratio">输出 {ratio}%</span>
                      <span className="eff-session-tokens">{formatTokens(session.totalTokens)}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="eff-section-title">本周趣味换算</div>
              <div className="eff-equivalents">
                <span>
                  📚 本周 token ≈ <b>{Math.max(1, Math.round(data.totalTokens / TOKENS_PER_BOOK))} 本书</b>
                </span>
                <span>
                  ⏳ 省时 ≈{' '}
                  <b>
                    {(savedMs / 3_600_000 / WORKDAY_HOURS).toFixed(1)} 个工作日
                  </b>
                </span>
              </div>

              {fun ? (
                <>
                  <div className="eff-section-title">成就徽章（数据说话）</div>
                  <div className="fun-badges">
                    {fun.achievements.map((badge) => (
                      <div
                        key={badge.id}
                        className={`fun-badge${badge.unlocked ? ' unlocked' : ''}`}
                        title={badge.desc}
                      >
                        <span className="fun-badge-icon">{badge.unlocked ? badge.icon : '🔒'}</span>
                        <span className="fun-badge-label">{badge.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="eff-section-title">项目性格标签</div>
                  {fun.personalities.length === 0 ? (
                    <div className="archive-empty">还没有项目会话记录</div>
                  ) : (
                    <ul className="fun-personality-list">
                      {fun.personalities.map((item) => (
                        <li key={item.cwd} className="fun-personality">
                          <span className="fun-personality-label">{item.label}</span>
                          <span className="fun-personality-name" title={item.cwd}>
                            {folderName(item.cwd) ?? item.cwd}
                          </span>
                          <span className="fun-personality-desc">{item.desc}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}

              <div className="eff-note">
                口径：时长按事件间隔 ≤ 5 分钟累计（排除挂机），会话按开始时间归入所在周/日。
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
