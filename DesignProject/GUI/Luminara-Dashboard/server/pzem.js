// PZEM-004T extension monitoring: validation, latest reading and a small power history.
// Deliberately separate from the streetlight telemetry (/api/telemetry, lamps) and from relay control (/api/control, /api/command):
// nothing here reads or writes those. In memory only, like the rest of the receiver (a restart clears the history; the meter keeps its own kWh counter).

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const envMs = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
// The ESP32 posts every 5 s; three missed posts = the link to the dashboard is down.
export const PZEM_STALE_AFTER_MS = envMs('PZEM_STALE_AFTER_MS', 15000);
const MAX_BUCKETS = 24 * 60; // one bucket per minute, 24 h

export const HISTORY_RANGES = {
  '1h': { spanMs: HOUR, stepMs: MINUTE },
  '6h': { spanMs: 6 * HOUR, stepMs: 5 * MINUTE },
  '24h': { spanMs: 24 * HOUR, stepMs: 15 * MINUTE },
};

// Datasheet ranges (PZEM-004T-100A v3.0): 80-260 V, 0-100 A, 0-23 kW, 0-9999.99 kWh, 45-65 Hz, PF 0-1. Limits here are a little wider.
const LIMITS = { voltage: [0, 400], current: [0, 150], power: [0, 30000], energy: [0, 10000], frequency: [0, 100], pf: [0, 1.05] };
const REASON_RE = /^[A-Za-z0-9_ .-]{1,40}$/;

let latest = null; // last packet of any kind: { receivedAtMs, ok, source, seq, errors, reason }
let lastGood = null; // last packet with a real reading: { receivedAtMs, source, reading }
const buckets = new Map(); // minute index -> { n, sumP, maxP, sumV, sumI, lastE, test }

const num = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export function validatePzem(b) {
  const bad = (code, error) => ({ ok: false, code, error });
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('invalid_body', 'body must be a JSON object');
  const ok = b.ok === undefined ? true : b.ok;
  if (typeof ok !== 'boolean') return bad('invalid_ok', 'ok must be true or false');
  if (b.seq !== undefined && (!Number.isInteger(b.seq) || b.seq < 0)) return bad('invalid_seq', 'seq must be an integer >= 0');
  if (b.errors !== undefined && (!Number.isInteger(b.errors) || b.errors < 0)) return bad('invalid_errors', 'errors must be an integer >= 0');
  const packet = {
    ok,
    seq: b.seq === undefined ? null : b.seq,
    errors: b.errors === undefined ? null : b.errors,
    source: b.source === 'test' ? 'test' : 'hardware',
    reason: null,
    reading: null,
  };
  if (!ok) {
    if (b.reason !== undefined) {
      if (typeof b.reason !== 'string' || !REASON_RE.test(b.reason)) return bad('invalid_reason', 'reason must be a short string');
      packet.reason = b.reason;
    }
    return { ok: true, packet };
  }
  const { voltage, current, power, energy, frequency, pf } = b;
  if (!num(voltage, LIMITS.voltage)) return bad('invalid_voltage', 'voltage must be a number 0..400');
  if (!num(current, LIMITS.current)) return bad('invalid_current', 'current must be a number 0..150');
  if (!num(power, LIMITS.power)) return bad('invalid_power', 'power must be a number 0..30000');
  if (!num(energy, LIMITS.energy)) return bad('invalid_energy', 'energy (kWh) must be a number 0..10000');
  if (!num(frequency, LIMITS.frequency)) return bad('invalid_frequency', 'frequency must be a number 0..100');
  if (!num(pf, LIMITS.pf)) return bad('invalid_pf', 'pf must be a number 0..1');
  if (b.alarm !== undefined && typeof b.alarm !== 'boolean') return bad('invalid_alarm', 'alarm must be true or false');
  packet.reading = { voltage, current, power, energy, frequency, pf, alarm: b.alarm === true };
  return { ok: true, packet };
}

export function recordPzem(p, now = Date.now()) {
  if (latest && p.seq !== null && p.seq === latest.seq && p.source === latest.source) {
    latest.receivedAtMs = now; // a retry of the same packet: keep the link alive, do not count it twice
    return { accepted: false, duplicate: true };
  }
  latest = { receivedAtMs: now, ok: p.ok, source: p.source, seq: p.seq, errors: p.errors, reason: p.reason };
  if (p.ok) {
    lastGood = { receivedAtMs: now, source: p.source, reading: p.reading };
    const idx = Math.floor(now / MINUTE);
    const r = p.reading;
    const b = buckets.get(idx) || { n: 0, sumP: 0, maxP: 0, sumV: 0, sumI: 0, lastE: 0, test: false };
    b.n += 1;
    b.sumP += r.power;
    b.maxP = Math.max(b.maxP, r.power);
    b.sumV += r.voltage;
    b.sumI += r.current;
    b.lastE = r.energy;
    b.test = b.test || p.source === 'test';
    buckets.set(idx, b);
    if (buckets.size > MAX_BUCKETS) {
      const oldest = Math.min(...buckets.keys());
      buckets.delete(oldest);
    }
  }
  return { accepted: true, duplicate: false };
}

// status: none (never heard) | live (fresh good reading) | pzem_offline (ESP32 is posting but the meter does not answer)
//         | stale (nothing received for a while: ESP32, Wi-Fi or this link is down)
export function pzemView(now = Date.now()) {
  if (!latest) return { status: 'none', staleAfterMs: PZEM_STALE_AFTER_MS };
  const ageMs = now - latest.receivedAtMs;
  const stale = ageMs > PZEM_STALE_AFTER_MS;
  const status = stale ? 'stale' : latest.ok ? 'live' : 'pzem_offline';
  return {
    status,
    source: latest.source,
    ageMs,
    staleAfterMs: PZEM_STALE_AFTER_MS,
    errors: latest.errors,
    reason: latest.reason,
    reading: lastGood ? lastGood.reading : null,
    readingAgeMs: lastGood ? now - lastGood.receivedAtMs : null,
  };
}

export function pzemHistory(range, now = Date.now()) {
  const cfg = HISTORY_RANGES[range];
  if (!cfg) return null;
  const end = Math.floor(now / cfg.stepMs) * cfg.stepMs + cfg.stepMs; // end of the current step
  const start = end - cfg.spanMs;
  const points = [];
  for (let t = start; t < end; t += cfg.stepMs) {
    let n = 0, sumP = 0, maxP = 0, sumV = 0, sumI = 0, lastE = null, test = false;
    for (let m = Math.floor(t / MINUTE); m < Math.floor((t + cfg.stepMs) / MINUTE); m += 1) {
      const b = buckets.get(m);
      if (!b) continue;
      n += b.n; sumP += b.sumP; maxP = Math.max(maxP, b.maxP); sumV += b.sumV; sumI += b.sumI; lastE = b.lastE; test = test || b.test;
    }
    points.push(n
      ? { t, powerW: +(sumP / n).toFixed(1), maxPowerW: +maxP.toFixed(1), voltageV: +(sumV / n).toFixed(1), currentA: +(sumI / n).toFixed(3), energyKwh: lastE, samples: n }
      : { t, powerW: null, maxPowerW: null, voltageV: null, currentA: null, energyKwh: null, samples: 0 });
  }
  const withData = points.filter((p) => p.samples > 0);
  return {
    range,
    stepMs: cfg.stepMs,
    points,
    includesTestData: [...buckets.values()].some((b) => b.test),
    summary: withData.length
      ? {
          avgPowerW: +(withData.reduce((a, p) => a + p.powerW * p.samples, 0) / withData.reduce((a, p) => a + p.samples, 0)).toFixed(1),
          peakPowerW: Math.max(...withData.map((p) => p.maxPowerW)),
          // energy used in the range = counter at the end minus counter at the start (the meter keeps its own kWh counter)
          usedKwh: +(withData[withData.length - 1].energyKwh - withData[0].energyKwh).toFixed(3),
        }
      : null,
  };
}

export const resetPzem = () => {
  latest = null;
  lastGood = null;
  buckets.clear();
};
