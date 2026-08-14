import type { SearchResult } from '../../shared/types';
import { folderName, highlight } from '../session-utils';

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  onOpen: (result: SearchResult) => void;
}

export function SearchResults({ results, query, onOpen }: SearchResultsProps) {
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
              <li key={hit.line} className="search-hit">
                <span className="search-line">{hit.line}</span>
                <span className={`search-role ${hit.role}`}>
                  {hit.role === 'user' ? '用户' : 'Claude'}
                </span>
                <span className="search-snippet">{highlight(hit.snippet, query)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
