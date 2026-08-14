import type { SearchHit, SearchResult } from '../../shared/types';
import { folderName, highlight } from '../session-utils';

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  onOpen: (result: SearchResult) => void;
  onOpenHit: (result: SearchResult, hit: SearchHit) => void;
}

export function SearchResults({ results, query, onOpen, onOpenHit }: SearchResultsProps) {
  if (results.length === 0) {
    return <div className="archive-empty">没有匹配结果</div>;
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
                  <span className="search-line">{hit.line}</span>
                  <span className={`search-role ${hit.role}`}>
                    {hit.role === 'user' ? '用户' : 'Claude'}
                  </span>
                  <span className="search-snippet">{highlight(hit.snippet, query)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
