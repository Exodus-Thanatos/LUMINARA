import { useCallback, useEffect, useRef, useState } from 'react';
import { apiHistory } from './api.js';

// Loads the permanent history (newest first), refreshes the first page now and then so new events appear by themselves,
// and appends older pages on request. A late answer for an old filter is ignored.
export function useHistory({ lamp = '', type = '', pageSize = 10, refreshMs = 15000, enabled = true } = {}) {
  const [state, setState] = useState({ events: [], next: null, loading: true, error: '', loadingMore: false });
  const seq = useRef(0);

  const loadFirst = useCallback(
    async (quiet) => {
      const mine = ++seq.current;
      if (!quiet) setState((s) => ({ ...s, loading: true, error: '' }));
      try {
        const d = await apiHistory({ lamp, type, limit: pageSize });
        if (mine !== seq.current) return;
        // keep any older pages the person already opened: only the newest page is replaced
        setState((s) => {
          const fresh = new Set(d.events.map((e) => e.id));
          const older = quiet ? s.events.filter((e) => !fresh.has(e.id)).filter((e) => d.events.length === 0 || e.at <= d.events[d.events.length - 1].at) : [];
          return { events: [...d.events, ...older], next: quiet && older.length ? s.next : d.next, loading: false, error: '', loadingMore: false };
        });
      } catch (e) {
        if (mine !== seq.current) return;
        setState((s) => ({ ...s, loading: false, error: e.message || 'Could not load the history.' }));
      }
    },
    [lamp, type, pageSize]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    loadFirst(false);
    const id = setInterval(() => { if (document.visibilityState === 'visible') loadFirst(true); }, refreshMs);
    return () => { clearInterval(id); seq.current += 1; };
  }, [enabled, loadFirst, refreshMs]);

  const loadMore = useCallback(async () => {
    if (!state.next || state.loadingMore) return;
    const mine = seq.current;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const d = await apiHistory({ lamp, type, limit: pageSize, before: state.next });
      if (mine !== seq.current) return;
      setState((s) => {
        const have = new Set(s.events.map((e) => e.id));
        return { ...s, events: [...s.events, ...d.events.filter((e) => !have.has(e.id))], next: d.next, loadingMore: false };
      });
    } catch (e) {
      setState((s) => ({ ...s, loadingMore: false, error: e.message || 'Could not load more.' }));
    }
  }, [lamp, type, pageSize, state.next, state.loadingMore]);

  return { ...state, reload: () => loadFirst(false), loadMore };
}
