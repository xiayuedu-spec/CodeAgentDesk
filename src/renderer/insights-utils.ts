import type { SessionInsights, SessionTodo } from '../shared/types';

/**
 * 纯函数集合：右栏 / 洞察弹窗的文本与格式化逻辑。
 * 单独成模块的理由——这些函数决定"往终端打什么"和"界面显示什么"，
 * 但不需要 React，可以在 node 环境直接单测。
 */

/**
 * 未完成计划 → 单行续做提示。
 * 必须是**单行**：写进 pty 后只跟一次 `\r`，多行在 Ink 类 TUI 里会提前提交。
 */
export function buildContinuePrompt(plan: {
  todos: SessionTodo[];
  updates: number;
}): string | null {
  const remaining = plan.todos.filter((todo) => todo.status !== 'completed');
  if (remaining.length === 0) return null;
  const done = plan.todos.length - remaining.length;
  // 待办内容可能自带换行/制表：压成单行，否则写进 pty 会被拆成多次提交。
  const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();
  const active = remaining.find((todo) => todo.status === 'in_progress');
  const items = remaining
    .map((todo, index) => `${index + 1}）${oneLine(todo.content)}`)
    .join('；');
  const lead = active ? `先把「${oneLine(active.content)}」做完` : '按顺序继续';
  return `继续上次未完成的计划（已完成 ${done}/${plan.todos.length}）。剩余待办：${items}。${lead}，每完成一项就用 TodoWrite 更新进度。`.slice(
    0,
    1500,
  );
}

/**
 * 路径中段省略：保留首段（盘符/根）与末尾两段。
 * 比 CSS `direction: rtl` 截断可靠——后者会让路径首尾的斜杠被 bidi 重排。
 */
export function shortenPath(value: string, keepTail = 2): string {
  const parts = value.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= keepTail + 1) return value;
  // 分隔符跟随输入（Windows 用 \，POSIX 用 /），并保留前导分隔符（/home、\\server）。
  const sep = value.includes('\\') ? '\\' : '/';
  const leading = /^[\\/]/.test(value) ? sep : '';
  const head = parts[0];
  return `${leading}${head}${sep}…${sep}${parts.slice(-keepTail).join(sep)}`;
}

/** 时长（毫秒）→ 人话：45 分钟 / 2 小时 14 分。 */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 60_000) return '不到 1 分钟';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

/** ISO 时间 → HH:mm（用于"几点开始"这类短标签）。 */
export function formatClock(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 把洞察导出成可粘贴的 Markdown 摘要（交接 / 写 PR 描述用）。 */
export function buildInsightsMarkdown(title: string, insights: SessionInsights): string {
  const lines: string[] = [`## ${title}`, ''];
  const { totals, plan, stats } = insights;
  lines.push(
    `改动：${totals.files} 个文件，+${totals.added} -${totals.removed}（${totals.edits} 次编辑）`,
    '',
  );
  if (stats && (stats.turns > 0 || stats.toolCalls > 0)) {
    lines.push(
      `痕迹：${stats.turns} 轮对话 · ${stats.toolCalls} 次工具调用 · ${stats.errors} 次失败 · 活跃 ${formatDuration(stats.activeMs)}`,
      '',
    );
  }
  if (plan) {
    const done = plan.todos.filter((todo) => todo.status === 'completed').length;
    lines.push(`### 计划（${done}/${plan.todos.length} 完成，快照 ${plan.updates} 次）`, '');
    for (const todo of plan.todos) {
      const mark = todo.status === 'completed' ? 'x' : ' ';
      const suffix = todo.status === 'in_progress' ? ' **（进行中）**' : '';
      lines.push(`- [${mark}] ${todo.content}${suffix}`);
    }
    lines.push('');
  }
  if (insights.changes.length > 0) {
    lines.push('### 改动文件', '');
    for (const change of insights.changes) {
      lines.push(
        `#### ${change.path}（+${change.added} -${change.removed}，${change.edits} 次${
          change.written ? '，整文件写入' : ''
        }）`,
        '',
      );
      for (const hunk of change.hunks) {
        lines.push('```diff');
        for (const line of hunk.oldText ? hunk.oldText.split('\n') : []) lines.push(`-${line}`);
        for (const line of hunk.newText ? hunk.newText.split('\n') : []) lines.push(`+${line}`);
        lines.push('```', '');
      }
    }
  }
  return lines.join('\n').trimEnd();
}
