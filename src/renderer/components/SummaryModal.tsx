import { useMemo } from 'react';
import { Copy, FolderOpen, Sparkles, X } from 'lucide-react';
import type { SummaryHistoryResult } from '../../shared/types';

export type SummaryTab = 'day' | 'month' | 'calendar' | 'history';

interface CalDayState {
  date: string;
  text: string;
  loading: boolean;
}

export interface SummaryModalState {
  summaryTab: SummaryTab;
  dayText: string;
  monthText: string;
  summarizing: boolean;
  summaryHistory: SummaryHistoryResult;
  calMonth: string;
  selectedDay: string | null;
  calDay: CalDayState | null;
  viewing: { title: string; text: string } | null;
  sessionCounts: Map<string, number>;
}

export interface SummaryModalActions {
  setSummaryTab: (tab: SummaryTab) => void;
  close: () => void;
  setViewing: (viewing: { title: string; text: string } | null) => void;
  generateDay: () => void;
  generateMonth: () => void;
  loadDay: (date: string) => void;
  generateDayFor: (date: string) => void;
  shiftMonth: (delta: number) => void;
  loadHistory: () => void;
  viewHistoryItem: (kind: 'day' | 'month', key: string) => void;
  buildCells: (month: string) => (string | null)[];
  todayKey: () => string;
}

interface SummaryModalProps {
  state: SummaryModalState;
  actions: SummaryModalActions;
}

export function SummaryModal({ state, actions }: SummaryModalProps) {
  const {
    summaryTab,
    dayText,
    monthText,
    summarizing,
    summaryHistory,
    calMonth,
    selectedDay,
    calDay,
    viewing,
    sessionCounts,
  } = state;
  const {
    setSummaryTab,
    close,
    setViewing,
    generateDay,
    generateMonth,
    loadDay,
    generateDayFor,
    shiftMonth,
    loadHistory,
    viewHistoryItem,
    buildCells,
    todayKey,
  } = actions;

  const summaryDayKeys = useMemo(
    () => new Set(summaryHistory.days.map((item) => item.key)),
    [summaryHistory],
  );

  return (
    <div className="day-overlay" onClick={close}>
      <div className="day-panel" onClick={(event) => event.stopPropagation()}>
        {viewing ? (
          <>
            <div className="day-header">
              <span className="day-title">{viewing.title}</span>
              <div className="day-actions">
                <button
                  type="button"
                  className="icon-button"
                  title="复制"
                  onClick={() => void navigator.clipboard.writeText(viewing.text)}
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="返回"
                  onClick={() => setViewing(null)}
                >
                  <FolderOpen size={14} />
                </button>
                <button type="button" className="icon-button" title="关闭" onClick={close}>
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="day-body">
              <pre className="day-text">{viewing.text}</pre>
            </div>
          </>
        ) : (
          <>
            <div className="day-header">
              <div className="day-tabs" role="tablist" aria-label="总结类型">
                <button
                  type="button"
                  role="tab"
                  aria-selected={summaryTab === 'day'}
                  className={summaryTab === 'day' ? 'active' : ''}
                  onClick={() => setSummaryTab('day')}
                >
                  今日
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={summaryTab === 'month'}
                  className={summaryTab === 'month' ? 'active' : ''}
                  onClick={() => setSummaryTab('month')}
                >
                  月度
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={summaryTab === 'calendar'}
                  className={summaryTab === 'calendar' ? 'active' : ''}
                  onClick={() => {
                    setSummaryTab('calendar');
                    void loadDay(todayKey());
                    void loadHistory();
                  }}
                >
                  日历
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={summaryTab === 'history'}
                  className={summaryTab === 'history' ? 'active' : ''}
                  onClick={() => {
                    setSummaryTab('history');
                    void loadHistory();
                  }}
                >
                  历史
                </button>
              </div>
              <div className="day-actions">
                <button type="button" className="icon-button" title="关闭" onClick={close}>
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="day-body">
              {summaryTab === 'day' ? (
                <div className="day-tab-content">
                  {summarizing ? (
                    <div className="day-loading">正在生成今日总结…（调用 claude 无头模式）</div>
                  ) : dayText ? (
                    <pre className="day-text">{dayText}</pre>
                  ) : (
                    <div className="day-empty">还没有生成今日总结</div>
                  )}
                  <div className="day-generate-bar">
                    <button
                      type="button"
                      className="welcome-btn primary"
                      onClick={() => void generateDay()}
                    >
                      <Sparkles size={14} />
                      <span>{dayText ? '重新生成' : '生成今日总结'}</span>
                    </button>
                  </div>
                </div>
              ) : summaryTab === 'month' ? (
                <div className="day-tab-content">
                  {summarizing ? (
                    <div className="day-loading">正在生成月度总结…（调用 claude 无头模式）</div>
                  ) : monthText ? (
                    <pre className="day-text">{monthText}</pre>
                  ) : (
                    <div className="day-empty">还没有生成月度总结</div>
                  )}
                  <div className="day-generate-bar">
                    <button
                      type="button"
                      className="welcome-btn primary"
                      onClick={() => void generateMonth()}
                    >
                      <Sparkles size={14} />
                      <span>{monthText ? '重新生成' : '生成本月总结'}</span>
                    </button>
                  </div>
                </div>
              ) : summaryTab === 'calendar' ? (
                <div className="cal-content">
                  <div className="cal-nav">
                    <button type="button" aria-label="上个月" onClick={() => shiftMonth(-1)}>
                      ‹
                    </button>
                    <span className="cal-month">{calMonth}</span>
                    <button type="button" aria-label="下个月" onClick={() => shiftMonth(1)}>
                      ›
                    </button>
                  </div>
                  <div className="cal-grid">
                    {['日', '一', '二', '三', '四', '五', '六'].map((weekday) => (
                      <div key={weekday} className="cal-weekday">
                        {weekday}
                      </div>
                    ))}
                    {buildCells(calMonth).map((date, i) =>
                      date === null ? (
                        <div key={`empty-${i}`} className="cal-cell empty" />
                      ) : (
                        <button
                          key={date}
                          type="button"
                          className={`cal-cell${selectedDay === date ? ' selected' : ''}${
                            summaryDayKeys.has(date) ? ' has-summary' : ''
                          }`}
                          onClick={() => void loadDay(date)}
                        >
                          <span className="cal-daynum">{Number(date.slice(8))}</span>
                          {sessionCounts.get(date) ? (
                            <span className="cal-count">{sessionCounts.get(date)}</span>
                          ) : null}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="cal-day-view">
                    {calDay ? (
                      <>
                        <div className="cal-day-head">
                          <span className="cal-day-title">{calDay.date} 当日总结</span>
                          {!calDay.loading && calDay.text ? (
                            <div className="cal-day-actions">
                              <button
                                type="button"
                                className="icon-button"
                                title="复制"
                                onClick={() => void navigator.clipboard.writeText(calDay.text)}
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {calDay.loading ? (
                          <div className="day-loading">正在生成该日总结…</div>
                        ) : calDay.text ? (
                          <pre className="day-text">{calDay.text}</pre>
                        ) : (
                          <div className="cal-day-empty">
                            <div className="day-empty">该日没有归档总结</div>
                            <button
                              type="button"
                              className="welcome-btn primary"
                              onClick={() => void generateDayFor(calDay.date)}
                            >
                              <Sparkles size={14} />
                              <span>找回当日总结</span>
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="day-empty">点击日历某天查看 / 找回当日总结</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="history-list">
                  {summaryHistory.months.length ? (
                    <div className="history-group">
                      <div className="history-group-label">月度总结</div>
                      {summaryHistory.months.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="history-item"
                          onClick={() => void viewHistoryItem('month', item.key)}
                        >
                          <span className="history-key">{item.key}</span>
                          <span className="history-preview">{item.preview}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {summaryHistory.days.length ? (
                    <div className="history-group">
                      <div className="history-group-label">每日总结</div>
                      {summaryHistory.days.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="history-item"
                          onClick={() => void viewHistoryItem('day', item.key)}
                        >
                          <span className="history-key">{item.key}</span>
                          <span className="history-preview">{item.preview}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {!summaryHistory.days.length && !summaryHistory.months.length ? (
                    <div className="day-empty">还没有归档的总结</div>
                  ) : null}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
