import { useEffect, useMemo, useRef, useState } from 'react';
import { FileCode2, Search, X } from 'lucide-react';
import type { CodeSearchResult } from '../../shared/types';
import { useEscape } from '../hooks/useEscape';
import { EmptyState } from './EmptyState';
import { SkeletonStack } from './Skeleton';

interface CodeSearchModalProps {
  cwd: string;
  title?: string;
  onClose: () => void;
}

/** 输入停顿多久后才真正搜（避免每敲一个字符就遍历一遍目录）。 */
const DEBOUNCE_MS = 280;

/**
 * 代码搜索：搜项目里的文本（不是会话记录），命中行可直接在编辑器打开。
 * 与 Ctrl+K 的会话搜索互补——那个找"当时怎么聊的"，这个找"代码在哪"。
 */
export function CodeSearchModal({ cwd, title, onClose }: CodeSearchModalProps) {
  useEscape(true, onClose);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<CodeSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResult(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      window.codeagentdesk
        .searchCode(cwd, text)
        .then((value) => {
          if (cancelled) return;
          setResult(value);
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cwd, query]);

  // 按文件分组展示（同一文件的命中聚在一起，读起来更像代码）。
  const grouped = useMemo(() => {
    const map = new Map<string, CodeSearchResult['hits']>();
    for (const hit of result?.hits ?? []) {
      const list = map.get(hit.path) ?? [];
      list.push(hit);
      map.set(hit.path, list);
    }
    return [...map.entries()];
  }, [result]);

  const open = (relative: string, line: number): void => {
    void window.codeagentdesk.openFile(relative, line, cwd);
  };

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel code-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">
            <Search size={14} /> 代码搜索
            {title ? <span className="diff-session">{title}</span> : null}
          </span>
          <div className="day-actions">
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="code-search-bar">
          <Search size={13} />
          <input
            ref={inputRef}
            className="code-search-input"
            value={query}
            placeholder="搜索代码（至少 2 个字符，回车无效，自动搜）"
            aria-label="代码搜索关键词"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="清空"
              onClick={() => setQuery('')}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        <div className="day-body code-body">
          {failed ? (
            <EmptyState icon={<FileCode2 size={20} strokeWidth={1.6} />} title="搜索失败" />
          ) : query.trim().length < 2 ? (
            <div className="code-hint">输入至少 2 个字符开始搜索（自动跳过依赖与构建产物）</div>
          ) : !result && searching ? (
            <SkeletonStack rows={5} />
          ) : result && result.hits.length === 0 ? (
            <EmptyState
              icon={<Search size={20} strokeWidth={1.6} />}
              title="没有命中"
              hint={`扫了 ${result.scannedFiles} 个文件 · ${result.elapsedMs}ms`}
            />
          ) : result ? (
            <>
              <div className="code-summary">
                {result.fileCount} 个文件 · {result.hits.length} 处命中
                {result.truncated ? ' · 结果已截断' : ''} · {result.elapsedMs}ms
                {searching ? ' · 搜索中…' : ''}
              </div>
              <div className="code-results">
                {grouped.map(([file, hits]) => (
                  <section key={file} className="code-file">
                    <div className="code-file-head" title={file}>
                      {file}
                      <span>{hits.length}</span>
                    </div>
                    {hits.map((hit) => (
                      <button
                        key={`${hit.path}:${hit.line}`}
                        type="button"
                        className="code-hit"
                        title={`在编辑器中打开 ${file}:${hit.line}`}
                        onClick={() => open(hit.path, hit.line)}
                      >
                        <span className="code-hit-line">{hit.line}</span>
                        <span className="code-hit-text">{hit.text}</span>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
