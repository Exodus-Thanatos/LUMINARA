import { useEffect, useState } from 'react';

/* ==========================================================================
   LIVE LAMP DATA
   Listens to the receiver (server/server.js) and turns its data into the
   same shape as the DEVICES list in App.jsx, so existing screens keep working.

   - Receiver reachable   -> "live" mode: ONLY real (or labeled test) data is shown.
                             Lamps that never reported show "NO DATA", never mock numbers.
   - Receiver unreachable -> "demo" mode: the original sample data, labeled DEMO DATA.
   ========================================================================== */

// Firmware status text (exact strings from LoraIntegrated.ino computeStatus()) -> the status names the dashboard already knows.
// (The firmware cannot tell if the feed is ON, so these are "reported conditions", not confirmed faults.)
//   NORMAL_LIT         healthy lamp at night              -> ONLINE (normal)
//   DAYLIGHT_STANDBY   > 3000 lx, never a fault           -> ONLINE (normal standby)
//   STANDBY            outside the scheduled shift        -> ONLINE (normal standby)
//   LOW_LIGHT          5-80 lx during the shift (dim)     -> WARNING
//   TOTAL_BLACKOUT     <= 5 lx during the shift           -> FAULT
//   BLINKING/UNSTABLE  lux swing > 50 lx in 2 s window    -> FAULT (the firmware itself counts this as a lamp fault)
//   SENSOR_ERROR       BH1750 not answering               -> FAULT (sensor fault, node still talking)
//   NORMAL             legacy value from the older sketch -> ONLINE
// Anything else is NOT assumed to be a hardware fault: it is shown as WARNING with the raw text.
const STATUS_MAP = {
  NORMAL_LIT: 'ONLINE',
  DAYLIGHT_STANDBY: 'ONLINE',
  STANDBY: 'ONLINE',
  NORMAL: 'ONLINE',
  LOW_LIGHT: 'WARNING',
  TOTAL_BLACKOUT: 'FAULT',
  'BLINKING/UNSTABLE': 'FAULT',
  SENSOR_ERROR: 'FAULT',
};
export const isKnownStatus = (reported) => Object.hasOwn(STATUS_MAP, reported);
export const toDashboardStatus = (reported) => (isKnownStatus(reported) ? STATUS_MAP[reported] : 'WARNING');

// Communication health from the receiver ('ONLINE' | 'STALE' | 'OFFLINE') -> label shown in the UI.
const COMM_LABEL = { ONLINE: 'Online', STALE: 'Stale', OFFLINE: 'Offline' };

// Lamp IDs always list in numeric order: L-001, L-002, ... L-010 (not L-001, L-010, L-002).
export const byLampId = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });

const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

// ---- Relay control state, pushed by the receiver as `event: control` on the same stream ----
// A tiny shared store so the Controls screen can read it without opening a second connection.
let controlSnap = null; // { view, at } or null (nothing pushed yet / stream down)
const controlSubs = new Set();
export const setControlFromStream = (view, at = Date.now()) => {
  controlSnap = view ? { view, at } : null;
  controlSubs.forEach((f) => f());
};
export const subscribeControl = (f) => {
  controlSubs.add(f);
  return () => controlSubs.delete(f);
};
export const getControlSnapshot = () => controlSnap;
// true while pushes are arriving (the receiver also sends one every 5 s, so 8 s allows for a late one), so the 2 s poll can stay quiet
export const controlPushIsFresh = (maxAgeMs = 8000, now = Date.now()) => !!controlSnap && now - controlSnap.at < maxAgeMs;

export function useLiveLamps() {
  const [state, setState] = useState({ connected: false, serverTime: null, receivedAt: null, lamps: [] });

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.addEventListener('snapshot', (e) => {
      try {
        const data = JSON.parse(e.data);
        setState({ connected: true, serverTime: data.serverTime, receivedAt: Date.now(), lamps: data.lamps });
      } catch {
        /* ignore a malformed message */
      }
    });
    es.addEventListener('control', (e) => {
      try {
        setControlFromStream(JSON.parse(e.data));
      } catch {
        /* ignore a malformed message */
      }
    });
    es.onerror = () => {
      setControlFromStream(null); // stream down: Controls falls back to polling
      setState((s) => ({ ...s, connected: false })); // the browser retries by itself
    };
    return () => es.close();
  }, []);

  return state;
}

// Returns { devices, mode, hasTest, lastSync }
//
// Live mode: a lamp exists on the dashboard ONLY after its node has reported at least once.
// A brand-new node ID (any of 1..31) shows up by itself as L-001, L-002, ... in order.
// The sample inventory is only used to look up a known lamp's street name.
export function mergeLive(sampleDevices, live) {
  if (!live.connected) return { devices: sampleDevices, mode: 'demo', hasTest: false, lastSync: null };

  const locById = Object.fromEntries(sampleDevices.map((d) => [d.id, d.loc]));
  const devices = live.lamps
    .map((r) => {
      // Two separate questions: (1) how is the LAMP (r.status)? (2) can we still HEAR the node (r.link)?
      const offline = r.link === 'OFFLINE';
      const condition = toDashboardStatus(r.status); // lamp condition as last reported
      return {
        id: r.id,
        loc: locById[r.id] || 'Location not set',
        // A silent node is shown as OFFLINE (communication). Its lamp condition is NOT guessed: see `condition`/`reported`.
        status: offline ? 'OFFLINE' : condition,
        condition,
        level: null, // the node sends lux, not a percentage, so no bar is drawn
        // null = no valid measurement (SENSOR_ERROR) or the node is offline; zero lux is a real reading and is kept.
        lux: !offline && typeof r.lux === 'number' ? r.lux : null,
        reported: r.status,
        known: isKnownStatus(r.status),
        packetType: r.type,
        comm: COMM_LABEL[r.link] || 'Offline',
        vol: '—', // no voltage is measured by the lamp nodes
        time: clock(r.lastSeen),
        source: r.source,
      };
    })
    .sort(byLampId);

  return {
    devices,
    mode: 'live',
    hasTest: live.lamps.some((l) => l.source === 'test'),
    lastSync: clock(live.serverTime),
  };
}
