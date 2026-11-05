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
