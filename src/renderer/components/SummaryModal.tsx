import { useMemo, type ReactNode } from 'react';
import { Copy, FolderOpen, RotateCcw, Sparkles, X } from 'lucide-react';
import type { SummaryHistoryResult } from '../../shared/types';
import type { SummaryTab } from '../hooks/useSummary';
import { useEscape } from '../hooks/useEscape';
import { MarkdownText } from './MarkdownText';

export type { SummaryTab }; // 供调用方引用统一类型

interface CalDayState {
  date: string;
  text: string;
  loading: boolean;
}

export interface SummaryModalState {
  summaryTab: SummaryTab;
  dayText: string;
  weekText: string;
  weekStart: string;
  weekRangeLabel: string;
  isCurrentWeek: boolean;
  monthText: string;
  summarizing: boolean;
  summaryHistory: SummaryHistoryResult;
  calMonth: string;
  selectedDay: string | null;
  calDay: CalDayState | null;
  viewing: { title: string; text: string; kind: 'day' | 'week' | 'month'; key: string } | null;
  sessionCounts: Map<string, number>;
  editing: 'day' | 'week' | 'month' | 'cal' | null;
  draft: string;
}

export interface SummaryModalActions {
  setSummaryTab: (tab: SummaryTab) => void;
  close: () => void;
  setViewing: (
    viewing: { title: string; text: string; kind: 'day' | 'week' | 'month'; key: string } | null,
  ) => void;
  generateDay: () => void;
  generateWeek: () => void;
  shiftWeek: (delta: number) => void;
  generateMonth: () => void;
  setDraft: (text: string) => void;
  startEdit: (kind: 'day' | 'week' | 'month', text?: string) => void;
  cancelEdit: () => void;
  saveEdit: (kind: 'day' | 'week' | 'month', key?: string) => void;
  regenerateViewing: () => void;
  startEditCal: () => void;
  saveEditCal: () => void;
  loadDay: (date: string) => void;
  generateDayFor: (date: string) => void;
  shiftMonth: (delta: number) => void;
  loadHistory: () => void;
  viewHistoryItem: (kind: 'day' | 'week' | 'month', key: string) => void;
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
    weekText,
    weekStart,
    weekRangeLabel,
    isCurrentWeek,
    monthText,
    summarizing,
    summaryHistory,
    calMonth,
    selectedDay,
    calDay,
    viewing,
    sessionCounts,
    editing,
    draft,
  } = state;
  const {
    setSummaryTab,
    close,
    setViewing,
    generateDay,
    generateWeek,
    shiftWeek,
    generateMonth,
    setDraft,
    startEdit,
    cancelEdit,
    saveEdit,
    regenerateViewing,
    startEditCal,
    saveEditCal,
    loadDay,
    generateDayFor,
    shiftMonth,
    loadHistory,
    viewHistoryItem,
    buildCells,
    todayKey,
  } = actions;

  // 编辑中按 Esc 先取消编辑，再按才关闭窗口。
  useEscape(true, () => {
    if (state.editing) actions.cancelEdit();
    else actions.close();
  });

  const summaryDayKeys = useMemo(
    () => new Set(summaryHistory.days.map((item) => item.key)),
    [summaryHistory],
  );
  const summaryWeekKeys = useMemo(
    () => new Set(summaryHistory.weeks.map((item) => item.key)),
    [summaryHistory],
  );

  /** 某日期所在周的周一（YYYY-MM-DD），用于匹配周报 key。 */
  function mondayKeyForDate(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00`);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }

  /** 可编辑总结 tab 的公共渲染：展示 / 编辑（textarea）/ 生成 / 重新生成。 */
  const renderEditableTab = (
    kind: 'day' | 'week' | 'month',
    text: string,
    emptyHint: string,
    generateLabel: string,
    generate: () => void,
  ): ReactNode => (
    <div className="day-tab-content">
      {summarizing ? (
        <div className="day-loading">正在生成…（调用 claude 无头模式）</div>
      ) : editing === kind ? (
        <>
          <textarea
            className="summary-editor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="编辑总结内容…"
            aria-label="编辑总结内容"
          />
          <div className="day-generate-bar">
            <button type="button" className="welcome-btn" onClick={cancelEdit}>
              取消
            </button>
            <button
              type="button"
              className="welcome-btn primary"
              onClick={() => void saveEdit(kind)}
            >
              保存
            </button>
          </div>
        </>
      ) : text ? (
        <>
          <MarkdownText text={text} />
          <div className="day-generate-bar">
            <button type="button" className="welcome-btn" onClick={() => startEdit(kind)}>
              编辑
            </button>
            <button
              type="button"
              className="welcome-btn primary"
              onClick={() => void generate()}
            >
              {text ? '重新生成' : generateLabel}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="day-empty">{emptyHint}</div>
          <div className="day-generate-bar">
            <button type="button" className="welcome-btn primary" onClick={() => void generate()}>
              {generateLabel}
            </button>
          </div>
        </>
      )}
    </div>
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
              {summarizing ? (
                <div className="day-loading">正在重新生成…（调用 claude 无头模式）</div>
              ) : editing === viewing.kind ? (
                <>
                  <textarea
                    className="summary-editor"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="编辑总结内容…"
                    aria-label="编辑总结内容"
                  />
                  <div className="day-generate-bar">
                    <button type="button" className="welcome-btn" onClick={cancelEdit}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="welcome-btn primary"
                      onClick={() => void saveEdit(viewing.kind, viewing.key)}
                    >
                      保存
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <MarkdownText text={viewing.text} />
                  <div className="day-generate-bar">
                    <button
                      type="button"
                      className="welcome-btn"
                      onClick={() => startEdit(viewing.kind, viewing.text)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="welcome-btn primary"
                      onClick={() => void regenerateViewing()}
                    >
                      <RotateCcw size={14} />
                      重新生成
                    </button>
                  </div>
                </>
              )}
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
                  aria-selected={summaryTab === 'week'}
                  className={summaryTab === 'week' ? 'active' : ''}
                  onClick={() => setSummaryTab('week')}
                >
                  周报
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
                renderEditableTab('day', dayText, '还没有生成今日总结', '生成今日总结', generateDay)
              ) : summaryTab === 'week' ? (
                <>
                  <div className="week-nav">
                    <button type="button" aria-label="上一周" onClick={() => shiftWeek(-1)}>
                      ‹
                    </button>
                    <span className="week-range" title={`周起始 ${weekStart}`}>
                      {weekRangeLabel}
                      {isCurrentWeek ? '（本周）' : ''}
                    </span>
                    <button type="button" aria-label="下一周" onClick={() => shiftWeek(1)}>
                      ›
                    </button>
                  </div>
                  {renderEditableTab(
                    'week',
                    weekText,
                    '该周还没有周报',
                    isCurrentWeek ? '生成本周总结' : '生成该周总结',
                    generateWeek,
                  )}
                </>
              ) : summaryTab === 'month' ? (
                renderEditableTab('month', monthText, '还没有生成月度总结', '生成本月总结', generateMonth)
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
                    {buildCells(calMonth).map((date, i) => {
                      const isSunday =
                        date !== null && new Date(`${date}T00:00:00`).getDay() === 0;
                      const hasWeekReport =
                        date !== null && summaryWeekKeys.has(mondayKeyForDate(date));
                      return date === null ? (
                        <div key={`empty-${i}`} className="cal-cell empty" />
                      ) : (
                        <button
                          key={date}
                          type="button"
                          className={`cal-cell${selectedDay === date ? ' selected' : ''}${
                            summaryDayKeys.has(date) ? ' has-summary' : ''
                          }${isSunday && hasWeekReport ? ' has-week-report' : ''}`}
                          onClick={() => void loadDay(date)}
                        >
                          <span className="cal-daynum">{Number(date.slice(8))}</span>
                          {sessionCounts.get(date) ? (
                            <span className="cal-count">{sessionCounts.get(date)}</span>
                          ) : null}
                          {isSunday && hasWeekReport ? (
                            <span className="cal-week-report" title="该周已生成周报" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="cal-day-view">
                    {calDay ? (
                      <>
                        <div className="cal-day-head">
                          <span className="cal-day-title">{calDay.date} 当日总结</span>
                          {!calDay.loading ? (
                            <div className="cal-day-actions">
                              <button
                                type="button"
                                className="icon-button"
                                title="复制"
                                onClick={() => void navigator.clipboard.writeText(calDay.text)}
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                title="编辑"
                                onClick={startEditCal}
                              >
                                <Sparkles size={13} />
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                title="重新生成"
                                onClick={() => void generateDayFor(calDay.date)}
                              >
                                <RotateCcw size={13} />
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {calDay.loading ? (
                          <div className="day-loading">正在生成该日总结…</div>
                        ) : editing === 'cal' ? (
                          <>
                            <textarea
                              className="summary-editor"
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              placeholder="编辑总结内容…"
                              aria-label="编辑总结内容"
                            />
                            <div className="day-generate-bar">
                              <button type="button" className="welcome-btn" onClick={cancelEdit}>
                                取消
                              </button>
                              <button
                                type="button"
                                className="welcome-btn primary"
                                onClick={() => void saveEditCal()}
                              >
                                保存
                              </button>
                            </div>
                          </>
                        ) : calDay.text ? (
                          <MarkdownText text={calDay.text} />
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
                  {summaryHistory.weeks.length ? (
                    <div className="history-group">
                      <div className="history-group-label">周报</div>
                      {summaryHistory.weeks.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="history-item"
                          onClick={() => void viewHistoryItem('week', item.key)}
                        >
                          <span className="history-key">{item.key}</span>
                          <span className="history-preview">{item.preview}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
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
                  {!summaryHistory.days.length &&
                  !summaryHistory.weeks.length &&
                  !summaryHistory.months.length ? (
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
