// Dashboard data for the PZEM extension-monitoring panel. Polls its own endpoints (/api/pzem, /api/pzem/history);
// completely separate from the lamp stream (useLiveLamps) and from relay control.
import { useEffect, useState } from 'react';

const getJson = async (url, signal) => {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

// Latest reading + status. reachable=false when the receiver can't be reached (e.g. demo mode).
export function usePzem(pollMs = 5000) {
  const [state, setState] = useState({ view: null, reachable: true, loaded: false, at: 0 });
  useEffect(() => {
    const ac = new AbortController();
    const load = () => {
      if (typeof document !== 'undefined' && document.hidden) return; // nobody is looking: skip
      getJson('/api/pzem', ac.signal)
        .then((view) => setState({ view, reachable: true, loaded: true, at: Date.now() }))
        .catch((e) => {
          if (e.name !== 'AbortError') setState({ view: null, reachable: false, loaded: true, at: Date.now() });
        });
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [pollMs]);
  return state;
}

// Power history for one range. Only fetches while `enabled` (the panel is expanded). Refreshes every `pollMs`.
export function usePzemHistory(range, enabled, pollMs = 30000) {
  const [res, setRes] = useState({ range: null, data: null, failed: false });
  useEffect(() => {
    if (!enabled) return undefined;
    const ac = new AbortController();
    const load = () =>
      getJson(`/api/pzem/history?range=${encodeURIComponent(range)}`, ac.signal)
        .then((data) => setRes({ range, data, failed: false }))
        .catch((e) => {
          if (e.name !== 'AbortError') setRes({ range, data: null, failed: true });
        });
    load();
    const id = setInterval(load, pollMs);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [range, enabled, pollMs]);
  const current = res.range === range;
  return { history: current ? res.data : null, failed: current && res.failed, loading: !current };
}
