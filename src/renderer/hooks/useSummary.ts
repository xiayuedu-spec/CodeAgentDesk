import { useState } from 'react';
import type { SummaryHistoryResult } from '../../shared/types';

export type SummaryTab = 'day' | 'month' | 'calendar' | 'history';

interface CalDayState {
  date: string;
  text: string;
  loading: boolean;
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
  const [monthText, setMonthText] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryHistory, setSummaryHistory] = useState<SummaryHistoryResult>({
    days: [],
    months: [],
  });
  const [viewing, setViewing] = useState<{ title: string; text: string } | null>(null);

  function openSummary(): void {
    setSummaryOpen(true);
    setViewing(null);
    setSummaryTab('day');
  }

  async function loadSummaryHistory(): Promise<void> {
    try {
      setSummaryHistory(await window.codeagentdesk.summariesList());
    } catch {
      // 静默忽略。
    }
  }

  async function viewHistoryItem(kind: 'day' | 'month', key: string): Promise<void> {
    const result = await window.codeagentdesk.summariesGet(kind, key);
    if (result.ok) {
      setViewing({
        title: `${key} ${kind === 'day' ? '每日总结' : '月度总结'}`,
        text: result.text ?? '',
      });
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
      setDayText(result.text ?? '');
      void loadSummaryHistory();
    } else {
      reportError(result.message ?? '生成今日总结失败');
    }
  }

  async function generateMonthSummary(): Promise<void> {
    if (summarizing) return;
    setSummarizing(true);
    setMonthText('');
    const result = await window.codeagentdesk.summarizeMonth();
    setSummarizing(false);
    if (result.ok) {
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
    monthText,
    summarizing,
    setSummarizing,
    summaryHistory,
    viewing,
    setViewing,
    openSummary,
    loadSummaryHistory,
    viewHistoryItem,
    generateDaySummary,
    generateMonthSummary,
    todayKey,
    shiftMonth,
    buildCalendarCells,
    loadDayFor,
    generateDayFor,
  };
}
