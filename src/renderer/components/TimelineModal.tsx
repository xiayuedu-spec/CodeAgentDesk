import { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';
import type { DayTimelineResult } from '../../shared/types';
import { useEscape } from '../hooks/useEscape';

interface TimelineModalProps {
  onClose: () => void;
  onOpenDetail: (sessionId: string) => void;
}

function fmtDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function shiftDay(dateKey: string, delta: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return fmtDateKey(date);
}

function formatTime(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '不足 1 分钟';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} 小时 ${rest} 分` : `${rest} 分钟`;
}

/** 按项目目录生成稳定的色相，让同一项目的会话同色。 */
function colorOf(cwd: string): string {
  let hash = 0;
  for (const char of cwd) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 55%)`;
}

const HOUR_TICKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

/** 工作时间线回放：以天为单位，按会话起止时间渲染横向时间条。 */
export function TimelineModal({ onClose, onOpenDetail }: TimelineModalProps) {
  const [day, setDay] = useState(() => fmtDateKey(new Date()));
  useEscape(true, onClose);
  const [data, setData] = useState<DayTimelineResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getDayTimeline(day)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [day]);

  const dayStartMs = new Date(`${day}T00:00:00`).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const events = data?.events ?? [];

  // 贪心分道：按开始时间排序，放进第一个"上一条已结束"的泳道。
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const event of events) {
    let lane = laneEnds.findIndex((end) => end <= event.startMs);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = event.endMs;
    lanes.set(event.sessionId, lane);
  }
  const maxLanes = Math.max(1, laneEnds.length);

  const isToday = day === fmtDateKey(new Date());
  const firstStart = events.length > 0 ? events[0].startMs : null;
  const lastEnd = events.length > 0 ? events[events.length - 1].endMs : null;
  const totalActive = events.reduce((sum, event) => sum + event.activeMs, 0);

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel timeline-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">
            <History size={14} /> 工作时间线
          </span>
          <div className="day-actions">
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="day-body">
          <div className="week-nav">
            <button type="button" aria-label="前一天" onClick={() => setDay(shiftDay(day, -1))}>
              ‹
            </button>
            <span className="week-range">
              {day}
              {isToday ? '（今天）' : ''}
            </span>
            <button type="button" aria-label="后一天" onClick={() => setDay(shiftDay(day, 1))}>
              ›
            </button>
          </div>

          {data === null ? (
            <div className="day-loading">正在统计…</div>
          ) : events.length === 0 ? (
            <div className="archive-empty">这一天没有会话记录</div>
          ) : (
            <>
              <div className="timeline-summary">
                {events.length} 个会话 · 首段 {firstStart ? formatTime(firstStart) : '—'} · 末段{' '}
                {lastEnd ? formatTime(lastEnd) : '—'} · 活跃合计 {formatDuration(totalActive)}
              </div>
              <div className="timeline-body">
                <div className="timeline-ruler">
                  {HOUR_TICKS.map((hour) => (
                    <span
                      key={hour}
                      className="timeline-tick"
                      style={{ top: `${(hour / 24) * 100}%` }}
                    >
                      {hour === 24 ? '24' : String(hour).padStart(2, '0')}
                    </span>
                  ))}
                </div>
                <div
                  className="timeline-lanes"
                  style={{ gridTemplateColumns: `repeat(${maxLanes}, 1fr)` }}
                >
                  {events.map((event) => {
                    const lane = lanes.get(event.sessionId) ?? 0;
                    const top = ((event.startMs - dayStartMs) / dayMs) * 100;
                    const height = Math.max(1.2, ((event.endMs - event.startMs) / dayMs) * 100);
                    return (
                      <button
                        key={event.sessionId}
                        type="button"
                        className="timeline-bar"
                        style={{
                          top: `${top}%`,
                          height: `${height}%`,
                          background: colorOf(event.cwd),
                          gridColumn: lane + 1,
                        }}
                        title={`${event.name}\n${formatTime(event.startMs)} - ${formatTime(event.endMs)} · ${formatDuration(event.endMs - event.startMs)}\n活跃 ${formatDuration(event.activeMs)}\n${event.cwd}`}
                        onClick={() => onOpenDetail(event.sessionId)}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="timeline-hint">点击时间条查看会话详情 · 颜色 = 项目</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
