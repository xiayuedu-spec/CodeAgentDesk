import { useEffect, useState } from 'react';
import { BarChart3, X } from 'lucide-react';
import type { UsageStats } from '../../shared/types';
import { useEscape } from '../hooks/useEscape';

interface UsageStatsModalProps {
  onClose: () => void;
}

const LABELS: Record<string, string> = {
  'palette.opened': '打开命令面板',
  'search.used': '使用全文搜索',
  'summary.day': '生成日报',
  'summary.week': '生成周报',
  'summary.month': '生成月报',
  'knowledge.generate': '生成知识库',
  'knowledge.export': '导出知识库',
  'knowledge.global': '链接全局知识库',
  'dashboard.opened': '打开今日概览',
  'efficiency.opened': '打开效率洞察',
  'timeline.opened': '打开工作时间线',
  'detail.opened': '查看会话详情',
  'export.md': '导出 Markdown',
  'session.pin': '置顶/取消置顶会话',
  'archive.delete': '删除归档会话',
  'pomodoro.start': '开始番茄钟',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 功能使用统计（仅本地计数，不采集内容）：看哪些功能有人用、哪些没人用。 */
export function UsageStatsModal({ onClose }: UsageStatsModalProps) {
  useEscape(true, onClose);
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .getUsageStats()
      .then((value) => {
        if (!cancelled) setStats(value);
      })
      .catch(() => {
        if (!cancelled) setStats({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = Object.entries(stats ?? {})
    .map(([key, stat]) => ({ key, ...stat }))
    .sort((a, b) => b.count - a.count);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel usage-stats-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">
            <BarChart3 size={14} /> 功能使用统计
          </span>
          <div className="day-actions">
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="day-body">
          <div className="backup-desc">
            仅本地计数，不采集任何内容。累计 <b>{total}</b> 次功能使用——用于判断哪些功能值得保留/培训。
          </div>
          {entries.length === 0 ? (
            <div className="archive-empty">还没有统计数据，多用用再说</div>
          ) : (
            <ul className="usage-stats-list">
              {entries.map((entry) => (
                <li key={entry.key} className="usage-stats-row">
                  <span className="usage-stats-label">
                    {LABELS[entry.key] ?? entry.key}
                  </span>
                  <span className="usage-stats-bar">
                    <span
                      style={{
                        width: `${total > 0 ? (entry.count / total) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span className="usage-stats-count">{entry.count}</span>
                  <span className="usage-stats-date">{formatDate(entry.lastAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
