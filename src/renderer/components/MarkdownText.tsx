import { useMemo, type ReactNode } from 'react';

const CODE_FENCE = '\x60\x60\x60'; // ```

/** 行内解析：**粗体** / `代码` / [文本](链接)。文本经 React 元素输出，天然防注入。 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-${k++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={`${keyPrefix}-${k++}`}>{token.slice(1, -1)}</code>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        nodes.push(
          <a key={`${keyPrefix}-${k++}`} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** 段落起始的块级标记（标题 / 代码围栏 / 列表 / 引用 / 分隔线）。 */
function isBlockStart(trimmed: string): boolean {
  return (
    /^#{1,3}\s+/.test(trimmed) ||
    trimmed.startsWith(CODE_FENCE) ||
    /^[-*]\s+/.test(trimmed) ||
    /^\d+[.)]\s+/.test(trimmed) ||
    trimmed.startsWith('>') ||
    /^-{3,}$/.test(trimmed)
  );
}

/** 块级解析：标题 / 代码块 / 列表 / 引用 / 分隔线 / 段落。 */
function parseBlocks(markdown: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith(CODE_FENCE)) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(CODE_FENCE)) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结束围栏
      nodes.push(
        <pre key={key++} className="md-code">
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], `h${key}`);
      if (level === 1) nodes.push(<h1 key={key++}>{content}</h1>);
      else if (level === 2) nodes.push(<h2 key={key++}>{content}</h2>);
      else nodes.push(<h3 key={key++}>{content}</h3>);
      i += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      nodes.push(<hr key={key++} />);
      i += 1;
      continue;
    }

    if (/^(?:[-*]\s+|\d+[.)]\s+)/.test(trimmed)) {
      const ordered = /^\d+[.)]\s+/.test(trimmed);
      const items: ReactNode[] = [];
      let j = i;
      while (j < lines.length) {
        const match = /^(?:[-*]\s+|\d+[.)]\s+)(.*)$/.exec(lines[j].trim());
        if (!match) break;
        items.push(<li key={j}>{renderInline(match[1], `li${j}`)}</li>);
        j += 1;
      }
      nodes.push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      i = j;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quotes: ReactNode[] = [];
      let j = i;
      let qk = 0;
      while (j < lines.length && lines[j].trim().startsWith('>')) {
        quotes.push(
          <p key={qk}>{renderInline(lines[j].trim().replace(/^>\s?/, ''), `q${qk}`)}</p>,
        );
        qk += 1;
        j += 1;
      }
      nodes.push(<blockquote key={key++}>{quotes}</blockquote>);
      i = j;
      continue;
    }

    if (!trimmed) {
      i += 1;
      continue;
    }

    const paragraph: string[] = [];
    let j = i;
    while (j < lines.length && lines[j].trim() && !isBlockStart(lines[j].trim())) {
      paragraph.push(lines[j].trim());
      j += 1;
    }
    nodes.push(<p key={key++}>{renderInline(paragraph.join(' '), `p${key}`)}</p>);
    i = j;
  }
  return nodes;
}

/** 轻量 Markdown 渲染（零依赖，React 元素输出防注入），用于总结内容展示。 */
export function MarkdownText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return <div className="markdown-text">{blocks}</div>;
}
