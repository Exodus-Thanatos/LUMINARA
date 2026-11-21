// Connection and data-freshness wording for the Dashboard. Pure functions.
// The receiver sends a snapshot every 5 s, so up to 15 s (three snapshots) is "fresh".
export const FRESH_MS = 15000;
export const STALE_MS = 60000;

export const fmtAge = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};

// level: connecting | fresh | delayed | outdated | disconnected
export function connectionState({ mode, connecting, receivedAt, now }) {
  if (connecting) return { level: 'connecting', label: 'Connecting…', detail: 'Waiting for the first update from the receiver.' };
  if (mode !== 'live') return { level: 'disconnected', label: 'Disconnected', detail: 'The receiver cannot be reached. Sample data is shown, not live readings.' };
  if (receivedAt == null) return { level: 'connecting', label: 'Connecting…', detail: 'Waiting for the first update from the receiver.' };
  const age = now - receivedAt;
  if (age <= FRESH_MS) return { level: 'fresh', label: 'Connected', detail: `Updated ${fmtAge(age)}` };
  if (age <= STALE_MS) return { level: 'delayed', label: 'Connected · update delayed', detail: `Last update ${fmtAge(age)}` };
  return { level: 'outdated', label: 'Connected · data outdated', detail: `No update for ${fmtAge(age).replace(' ago', '')}` };
}

// How many lamps are reporting on time, late, or not at all (installed lamps only).
export function lampFreshness(devices) {
  const live = devices.filter((d) => d.status !== 'UNINSTALLED' && d.status !== 'NO DATA');
  const offline = live.filter((d) => d.status === 'OFFLINE').length;
  const late = live.filter((d) => d.status !== 'OFFLINE' && d.comm === 'Stale').length;
  return { total: live.length, offline, late, onTime: live.length - offline - late };
}
