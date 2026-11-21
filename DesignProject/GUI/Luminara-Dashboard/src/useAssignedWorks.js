import { useEffect, useState } from 'react';
import { apiListTickets } from './api.js';

// The maintenance tickets assigned to the signed-in user (the server only ever returns their own for a BASIC account).
export function useAssignedWorks({ refreshMs = 60000 } = {}) {
  const [state, setState] = useState({ tickets: [], loading: true, error: '' });
  useEffect(() => {
    let alive = true;
    const run = () =>
      apiListTickets()
        .then((d) => { if (alive) setState({ tickets: d.tickets, loading: false, error: '' }); })
        .catch((e) => { if (alive) setState((s) => ({ ...s, loading: false, error: e.message || 'Could not load your assigned works.' })); });
    run();
    const id = setInterval(() => { if (document.visibilityState === 'visible') run(); }, refreshMs);
    return () => { alive = false; clearInterval(id); };
  }, [refreshMs]);
  return state;
}
