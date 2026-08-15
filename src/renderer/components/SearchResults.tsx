import { SearchX } from 'lucide-react';
import type { SearchHit, SearchResult } from '../../shared/types';
import { folderName, highlight } from '../session-utils';
import { EmptyState } from './EmptyState';

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  onOpen: (result: SearchResult) => void;
  onOpenHit: (result: SearchResult, hit: SearchHit) => void;
}

export function SearchResults({ results, query, onOpen, onOpenHit }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <EmptyState
        icon={<SearchX size={40} strokeWidth={1.4} />}
        title="没有匹配结果"
        hint="换个关键词试试，支持会话全文检索"
      />
    );
  }
  return (
    <div className="search-results" role="log">
      {results.map((result) => (
        <section key={result.sessionId} className="search-group">
          <button type="button" className="search-session-header" onClick={() => onOpen(result)}>
            <span className="search-title">
              {result.customName ?? folderName(result.cwd)}
            </span>
            <span className="search-path">{result.cwd}</span>
          </button>
          <ul className="search-hit-list">
            {result.hits.map((hit) => (
              <li key={hit.line}>
                <button
                  type="button"
                  className="search-hit"
                  title="在详情中定位该命中"
                  onClick={() => onOpenHit(result, hit)}
                >
                  <span className="search-hit-head">
                    <span className="search-line">{hit.line}</span>
                    <span className={`search-role ${hit.role}`}>
                      {hit.role === 'user' ? '用户' : 'Claude'}
                    </span>
                    {hit.context?.length ? (
                      <span className="search-hit-count">{hit.context.length} 行</span>
                    ) : null}
                  </span>
                  {hit.context?.length ? (
                    <span className="search-context">
                      {hit.context.map((ctx, index) => (
                        <span
                          key={ctx.line}
                          className={`search-context-line${index === hit.hitIndex ? ' hit' : ''}`}
                        >
                          <span className="search-context-no">{ctx.line}</span>
                          <span className="search-context-text">
                            {index === hit.hitIndex ? highlight(ctx.text, query) : ctx.text}
                          </span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="search-snippet">{highlight(hit.snippet, query)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
