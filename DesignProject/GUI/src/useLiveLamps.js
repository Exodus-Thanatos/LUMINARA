import { useEffect, useState } from 'react';

/* ==========================================================================
   LIVE LAMP DATA
   Listens to the receiver (server/server.js) and turns its data into the
   same shape as the DEVICES list in App.jsx, so existing screens keep working.

   - Receiver reachable   -> "live" mode: ONLY real (or labeled test) data is shown.
                             Lamps that never reported show "NO DATA", never mock numbers.
   - Receiver unreachable -> "demo" mode: the original sample data, labeled DEMO DATA.
   ========================================================================== */

// Firmware status text -> the status names the dashboard already knows.
// (The firmware cannot tell if the feed is ON, so these are "reported conditions", not confirmed faults.)
const toDashboardStatus = (reported) => {
  if (reported === 'NORMAL') return 'ONLINE';
  if (reported === 'LOW_LIGHT') return 'WARNING';
  return 'FAULT'; // TOTAL_BLACKOUT, BLINKING/UNSTABLE, SENSOR_ERROR
};

const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

export function useLiveLamps() {
  const [state, setState] = useState({ connected: false, serverTime: null, lamps: [] });

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.addEventListener('snapshot', (e) => {
      try {
        const data = JSON.parse(e.data);
        setState({ connected: true, serverTime: data.serverTime, lamps: data.lamps });
      } catch {
        /* ignore a malformed message */
      }
    });
    es.onerror = () => setState((s) => ({ ...s, connected: false })); // the browser retries by itself
    return () => es.close();
  }, []);

  return state;
}

// Returns { devices, mode, hasTest, lastSync }
export function mergeLive(sampleDevices, live) {
  if (!live.connected) return { devices: sampleDevices, mode: 'demo', hasTest: false, lastSync: null };

  const byId = Object.fromEntries(live.lamps.map((l) => [l.id, l]));
  const fromReport = (id, loc, r) => {
    const online = r.link === 'ONLINE';
    return {
      id,
      loc,
      status: online ? toDashboardStatus(r.status) : 'OFFLINE',
      level: null, // the node sends lux, not a percentage, so no bar is drawn
      lux: online ? r.lux : null, // an old reading is not shown as if it were current
      reported: r.status,
      comm: online ? 'Online' : 'Offline',
      vol: '—', // no voltage is measured by the lamp nodes
      time: clock(r.lastSeen),
      source: r.source,
    };
  };

  const devices = sampleDevices.map((d) =>
    byId[d.id]
      ? fromReport(d.id, d.loc, byId[d.id])
      : { id: d.id, loc: d.loc, status: 'NO DATA', level: null, lux: null, reported: null, comm: 'Offline', vol: '—', time: '—' }
  );
  // A node ID that is not in the inventory still gets shown rather than silently dropped.
  live.lamps.filter((l) => !sampleDevices.some((d) => d.id === l.id)).forEach((l) => devices.push(fromReport(l.id, 'Not in inventory', l)));

  return {
    devices,
    mode: 'live',
    hasTest: live.lamps.some((l) => l.source === 'test'),
    lastSync: clock(live.serverTime),
  };
}
