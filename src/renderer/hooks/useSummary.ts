import { useState } from 'react';
import type { SummaryHistoryResult } from '../../shared/types';

export type SummaryTab = 'day' | 'week' | 'month' | 'calendar' | 'history';

interface CalDayState {
  date: string;
  text: string;
  loading: boolean;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** 某日期所在周的周一。 */
function mondayOf(date: Date): string {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(date);
  d.setDate(date.getDate() + diff);
  return formatDate(d);
}

/** 周一起始日期对应的"周一 ~ 周日"展示标签。 */
function formatWeekRange(monday: string): string {
  const start = new Date(`${monday}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${monday.slice(5)} ~ ${formatDate(end).slice(5)}`;
}

/** 总结弹窗（今日/月度/日历/历史）的完整状态与逻辑。 */
export function useSummary(reportError: (message: string) => void) {
  const [summary, setSummary] = useState<{ summary: string; tags: string[] } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryTab, setSummaryTab] = useState<SummaryTab>('day');
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calDay, setCalDay] = useState<CalDayState | null>(null);
  const [dayText, setDayText] = useState('');
  const [weekText, setWeekText] = useState('');
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [weekRangeLabel, setWeekRangeLabel] = useState(() => formatWeekRange(mondayOf(new Date())));
  const [isCurrentWeek, setIsCurrentWeek] = useState(true);
  const [monthText, setMonthText] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryHistory, setSummaryHistory] = useState<SummaryHistoryResult>({
    days: [],
    weeks: [],
    months: [],
  });
  const [viewing, setViewing] = useState<{
    title: string;
    text: string;
    kind: 'day' | 'week' | 'month';
    key: string;
  } | null>(null);
  const [editing, setEditing] = useState<'day' | 'week' | 'month' | 'cal' | null>(null);
  const [draft, setDraft] = useState('');

  function openSummary(): void {
    setSummaryOpen(true);
    setViewing(null);
    setSummaryTab('day');
    // 预载已生成的总结：生成中途关闭弹窗 / 应用重启后再打开，已完成的内容直接展示。
    void preloadSummaryTexts();
  }

  /** 拉取今日 / 当前周 / 本月已归档的总结文本。 */
  async function preloadSummaryTexts(): Promise<void> {
    const day = await window.codeagentdesk.summariesGet('day', todayKey()).catch(() => null);
    if (day?.ok) setDayText(day.text ?? '');
    const week = await window.codeagentdesk.summariesGet('week', weekStart).catch(() => null);
    if (week?.ok) setWeekText(week.text ?? '');
    const month = await window.codeagentdesk
      .summariesGet('month', new Date().toISOString().slice(0, 7))
      .catch(() => null);
    if (month?.ok) setMonthText(month.text ?? '');
  }

  async function loadSummaryHistory(): Promise<void> {
    try {
      setSummaryHistory(await window.codeagentdesk.summariesList());
    } catch {
      // 静默忽略。
    }
  }

  async function viewHistoryItem(kind: 'day' | 'week' | 'month', key: string): Promise<void> {
    const result = await window.codeagentdesk.summariesGet(kind, key);
    if (result.ok) {
      const label = kind === 'day' ? '每日总结' : kind === 'week' ? '周报' : '月度总结';
      setViewing({ title: `${key} ${label}`, text: result.text ?? '', kind, key });
    } else {
      reportError(result.message ?? '读取总结失败');
    }
  }

  async function generateDaySummary(): Promise<void> {
    if (summarizing) return;
    setSummarizing(true);
    setDayText('');
    const result = await window.codeagentdesk.summarizeDay();
    setSummarizing(false);
    if (result.ok) {
      void window.codeagentdesk.incrementUsageStat('summary.day');
      setDayText(result.text ?? '');
      void loadSummaryHistory();
    } else {
      reportError(result.message ?? '生成今日总结失败');
    }
  }

  async function generateWeekSummary(): Promise<void> {
    if (summarizing) return;
    setSummarizing(true);
    setWeekText('');
    const result = await window.codeagentdesk.summarizeWeek(weekStart);
    setSummarizing(false);
    if (result.ok) {
      void window.codeagentdesk.incrementUsageStat('summary.week');
      setWeekText(result.text ?? '');
      void loadSummaryHistory();
    } else {
      reportError(result.message ?? '生成本周总结失败');
    }
  }

  /** 切换周：更新范围标签并加载该周已有的周报。 */
  function shiftWeek(delta: number): void {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + delta * 7);
    const next = mondayOf(d);
    setWeekStart(next);
    setWeekRangeLabel(formatWeekRange(next));
    setIsCurrentWeek(next === mondayOf(new Date()));
    setWeekText('');
    window.codeagentdesk
      .summariesGet('week', next)
      .then((result) => {
        if (result.ok) setWeekText(result.text ?? '');
      })
      .catch(() => {
        // 静默忽略加载失败。
      });
  }

  /** 进入编辑：以当前文本为草稿（可显式指定，用于查看详情的任意条目）。 */
  function startEdit(kind: 'day' | 'week' | 'month', text?: string): void {
    const current =
      text ??
      (kind === 'day' ? dayText : kind === 'week' ? weekText : monthText);
    setEditing(kind);
    setDraft(current);
  }

  function cancelEdit(): void {
    setEditing(null);
    setDraft('');
  }

  /** 保存手动编辑：覆盖到 summaries.json 对应维度与 key（key 缺省为当前维度）。 */
  async function saveEdit(
    kind: 'day' | 'week' | 'month',
    keyOverride?: string,
  ): Promise<void> {
    const key =
      keyOverride ??
      (kind === 'day'
        ? todayKey()
        : kind === 'week'
          ? weekStart
          : new Date().toISOString().slice(0, 7));
    const result = await window.codeagentdesk.saveSummaryText(kind, key, draft);
    if (!result.ok) {
      reportError(result.message ?? '保存失败');
      return;
    }
    const text = draft;
    if (kind === 'day' && key === todayKey()) setDayText(text);
    else if (kind === 'week' && key === weekStart) setWeekText(text);
    else if (kind === 'month' && key === new Date().toISOString().slice(0, 7)) setMonthText(text);
    setViewing((v) => (v && v.kind === kind && v.key === key ? { ...v, text } : v));
    setEditing(null);
    setDraft('');
    void loadSummaryHistory();
  }

  /** 重新生成查看详情中的总结（历史条目，按 kind/key 定位）。 */
  async function regenerateViewing(): Promise<void> {
    if (!viewing || summarizing) return;
    setSummarizing(true);
    const result =
      viewing.kind === 'day'
        ? await window.codeagentdesk.summarizeDay(viewing.key)
        : viewing.kind === 'week'
          ? await window.codeagentdesk.summarizeWeek(viewing.key)
          : await window.codeagentdesk.summarizeMonth(viewing.key);
    setSummarizing(false);
    if (result.ok) {
      const text = result.text ?? '';
      setViewing((v) => (v ? { ...v, text } : v));
      if (viewing.kind === 'day' && viewing.key === todayKey()) setDayText(text);
      else if (viewing.kind === 'week' && viewing.key === weekStart) setWeekText(text);
      else if (
        viewing.kind === 'month' &&
        viewing.key === new Date().toISOString().slice(0, 7)
      ) {
        setMonthText(text);
      }
      void loadSummaryHistory();
    } else {
      reportError(result.message ?? '重新生成失败');
    }
  }

  /** 日历选中日的总结：进入编辑。 */
  function startEditCal(): void {
    if (!calDay) return;
    setEditing('cal');
    setDraft(calDay.text);
  }

  /** 日历选中日的总结：保存编辑。 */
  async function saveEditCal(): Promise<void> {
    if (!calDay) return;
    const result = await window.codeagentdesk.saveSummaryText('day', calDay.date, draft);
    if (!result.ok) {
      reportError(result.message ?? '保存失败');
      return;
    }
    setCalDay({ date: calDay.date, text: draft, loading: false });
    if (calDay.date === todayKey()) setDayText(draft);
    setEditing(null);
    setDraft('');
    void loadSummaryHistory();
  }

  async function generateMonthSummary(): Promise<void> {
    if (summarizing) return;
    setSummarizing(true);
    setMonthText('');
    const result = await window.codeagentdesk.summarizeMonth();
    setSummarizing(false);
    if (result.ok) {
      void window.codeagentdesk.incrementUsageStat('summary.month');
      setMonthText(result.text ?? '');
      void loadSummaryHistory();
    } else {
      reportError(result.message ?? '生成本月总结失败');
    }
  }

  function todayKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
  }

  function shiftMonth(delta: number): void {
    const [year, month] = calMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    setCalMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }

  function buildCalendarCells(month: string): (string | null)[] {
    const [year, monthNum] = month.split('-').map(Number);
    const lead = new Date(year, monthNum - 1, 1).getDay();
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(`${month}-${String(day).padStart(2, '0')}`);
    }
    return cells;
  }

  async function loadDayFor(date: string): Promise<void> {
    setSelectedDay(date);
    setCalDay({ date, text: '', loading: true });
    // 直接查归档存储，不依赖可能过期的 summaryHistory 缓存。
    const result = await window.codeagentdesk.summariesGet('day', date);
    setCalDay({ date, text: result.ok ? result.text ?? '' : '', loading: false });
  }

  async function generateDayFor(date: string): Promise<void> {
    setCalDay({ date, text: '', loading: true });
    const result = await window.codeagentdesk.summarizeDay(date);
    if (result.ok) {
      setCalDay({ date, text: result.text ?? '', loading: false });
      void loadSummaryHistory();
    } else {
      setCalDay({ date, text: '', loading: false });
      reportError(result.message ?? '生成失败');
    }
  }

  return {
    summary,
    setSummary,
    summaryOpen,
    setSummaryOpen,
    summaryTab,
    setSummaryTab,
    calMonth,
    selectedDay,
    calDay,
    dayText,
    weekText,
    weekStart,
    weekRangeLabel,
    isCurrentWeek,
    monthText,
    summarizing,
    setSummarizing,
    summaryHistory,
    viewing,
    setViewing,
    editing,
    draft,
    setDraft,
    startEdit,
    cancelEdit,
    saveEdit,
    regenerateViewing,
    startEditCal,
    saveEditCal,
    openSummary,
    loadSummaryHistory,
    viewHistoryItem,
    generateDaySummary,
    generateWeekSummary,
    shiftWeek,
    generateMonthSummary,
    todayKey,
    shiftMonth,
    buildCalendarCells,
    loadDayFor,
    generateDayFor,
  };
}
