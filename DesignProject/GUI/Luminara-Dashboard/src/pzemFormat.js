// PZEM extension-monitoring panel: wording for every state and number formatting. Pure functions (no React, no fetch).

export const fmtAgo = (ms) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
};

export const fmtPower = (w) => (w >= 1000 ? String(Math.round(w)) : w.toFixed(1));

// The six readings of the meter, in the order they are shown when the panel is expanded (Voltage is the always-visible one).
export const READING_CARDS = [
  { key: 'voltage', label: 'Voltage', unit: 'V', fmt: (v) => v.toFixed(1) },
  { key: 'current', label: 'Current', unit: 'A', fmt: (v) => v.toFixed(3) },
  { key: 'power', label: 'Active Power', unit: 'W', fmt: fmtPower },
  { key: 'energy', label: 'Energy', unit: 'kWh', fmt: (v) => v.toFixed(3) },
  { key: 'frequency', label: 'Frequency', unit: 'Hz', fmt: (v) => v.toFixed(1) },
  { key: 'pf', label: 'Power Factor', unit: '', fmt: (v) => v.toFixed(2) },
];

// state: unreachable | none | live | pzem_offline | stale
// tone:  ok (green) | warn (amber) | bad (red) | idle (grey)
export function describePzem({ view, reachable }) {
  if (!reachable) {
    return { state: 'unreachable', tone: 'idle', label: 'NO CONNECTION', detail: 'The receiver is not connected, so there is no PZEM data.', reading: null, dim: true, isTest: false };
  }
  if (!view || view.status === 'none') {
    return { state: 'none', tone: 'idle', label: 'WAITING', detail: 'No reading yet. It appears here after the ESP32 posts its first PZEM reading.', reading: null, dim: true, isTest: false };
  }
  const isTest = view.source === 'test';
  const reading = view.reading || null;
  const lastAgo = view.readingAgeMs !== null && view.readingAgeMs !== undefined ? fmtAgo(view.readingAgeMs) : '';
  if (view.status === 'live') {
    return { state: 'live', tone: 'ok', label: 'LIVE', detail: `Updated ${fmtAgo(view.ageMs)}`, reading, dim: false, isTest };
  }
  if (view.status === 'pzem_offline') {
    return {
      state: 'pzem_offline',
      tone: 'bad',
      label: 'METER NOT ANSWERING',
      detail: `The ESP32 is online but the PZEM does not answer. Check its 5 V supply, the RX/TX wires and that the meter has mains power.${lastAgo ? ` Last reading ${lastAgo}.` : ''}`,
      reading,
      dim: true,
      isTest,
    };
  }
  return {
    state: 'stale',
    tone: 'warn',
    label: 'NO UPDATE',
    detail: `Nothing received for ${fmtAgo(view.ageMs).replace(' ago', '')}. The ESP32, its Wi-Fi or this connection may be down.${lastAgo ? ` Last reading ${lastAgo}.` : ''}`,
    reading,
    dim: true,
    isTest,
  };
}

export const HISTORY_OPTIONS = [
  ['1h', 'Last hour'],
  ['6h', '6 hours'],
  ['24h', '24 hours'],
];

// Recharts wants plain rows; gaps (no samples) stay null so the chart shows a break instead of a false zero.
export const historyRows = (history) =>
  (history?.points || []).map((p) => ({ t: p.t, powerW: p.powerW, maxPowerW: p.maxPowerW }));

// Same, with every value the receiver records per point (used by the metric selector). Gaps stay null.
export const historySeries = (history) =>
  (history?.points || []).map((p) => ({
    t: p.t,
    powerW: p.powerW ?? null,
    voltageV: p.voltageV ?? null,
    currentA: p.currentA ?? null,
    energyKwh: p.energyKwh ?? null,
  }));

// What the history chart can show: only these values are recorded by the receiver (frequency and power factor are not).
export const HISTORY_METRICS = [
  { id: 'powerW', label: 'Power', unit: 'W', name: 'Average active power' },
  { id: 'voltageV', label: 'Voltage', unit: 'V', name: 'Average voltage' },
  { id: 'currentA', label: 'Current', unit: 'A', name: 'Average current' },
  { id: 'energyKwh', label: 'Energy counter', unit: 'kWh', name: 'Meter energy counter' },
];

// Guide thresholds. They are defaults for a 230 V / 60 Hz supply, NOT settings: the Settings page cannot change them yet.
// Current, power and energy have no threshold because the rating of the monitored feed is not known to the system.
// level: normal | warning | critical | none (no threshold defined, or not meaningful right now)
export const THRESHOLD_NOTE = 'Guide ranges for a 230 V, 60 Hz supply. They are not configurable yet.';
export function readingLevel(key, value, reading) {
  const none = { level: 'none', label: 'No threshold set' };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { level: 'none', label: 'Unavailable' };
  if (key === 'voltage') {
    if (value >= 207 && value <= 253) return { level: 'normal', label: 'Normal' };
    if (value < 195) return { level: 'critical', label: 'Very low' };
    if (value > 265) return { level: 'critical', label: 'Very high' };
    return { level: 'warning', label: value < 207 ? 'Low' : 'High' };
  }
  if (key === 'frequency') {
    if (value >= 59 && value <= 61) return { level: 'normal', label: 'Normal' };
    if (value >= 58 && value <= 62) return { level: 'warning', label: value < 59 ? 'Low' : 'High' };
    return { level: 'critical', label: value < 58 ? 'Very low' : 'Very high' };
  }
  if (key === 'pf') {
    if (!reading || reading.power < 5) return { level: 'none', label: 'No load' }; // power factor means nothing without a load
    if (value >= 0.85) return { level: 'normal', label: 'Good' };
    if (value >= 0.7) return { level: 'warning', label: 'Fair' };
    return { level: 'critical', label: 'Poor' };
  }
  return none;
}
