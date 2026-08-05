import type { SessionDetailResult } from '../shared/types';

export function buildMarkdown(detail: SessionDetailResult): string {
  const lines: string[] = [];
  lines.push(`# ${detail.title ?? detail.sessionId}`);
  lines.push('');
  lines.push(`- 会话 ID：${detail.sessionId}`);
  if (detail.cwd) lines.push(`- 工作目录：${detail.cwd}`);
  lines.push('');

  for (const entry of detail.entries) {
    if (entry.role === 'user') {
      lines.push('**User**');
      lines.push('');
      lines.push(`> ${(entry.text ?? '').replace(/\n/g, '\n> ')}`);
      lines.push('');
    } else if (entry.role === 'assistant') {
      lines.push('**Claude**');
      lines.push('');
      lines.push(entry.text ?? '');
      lines.push('');
    } else {
      lines.push(`<details><summary>工具：${entry.toolName ?? '调用'}</summary>`);
      if (entry.toolInput) {
        lines.push('');
        lines.push('输入：');
        lines.push('```json');
        lines.push(entry.toolInput);
        lines.push('```');
      }
      if (entry.toolOutput) {
        lines.push('');
        lines.push('输出：');
        lines.push('```');
        lines.push(entry.toolOutput);
        lines.push('```');
      }
      lines.push('</details>');
      lines.push('');
    }
  }

  return lines.join('\n');
}
