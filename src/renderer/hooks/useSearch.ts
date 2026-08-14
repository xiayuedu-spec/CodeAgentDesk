import { useEffect, useState } from 'react';
import type { SearchResult } from '../../shared/types';
import type { Mode } from '../session-utils';

/** 搜索视图状态：模式切换、搜索框输入与防抖后的全文搜索结果。 */
export function useSearch(reportError: (message: string) => void) {
  const [mode, setMode] = useState<Mode>('sessions');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (mode !== 'search') return;
    const text = query.trim();
    if (!text) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      window.codeagentdesk
        .searchSessions(text)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((reason: unknown) => {
          if (!cancelled) reportError(reason instanceof Error ? reason.message : String(reason));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, query, reportError]);

  return { mode, setMode, query, setQuery, searchResults, setSearchResults };
}
