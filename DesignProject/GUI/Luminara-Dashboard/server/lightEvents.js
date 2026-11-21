// Turns "what the lamp health is now" into permanent history rows, and writes them without ever blocking telemetry.
// Pure logic: the database function is injected, so this is tested without PostgreSQL.
//
// What counts as a meaningful event: the lamp's PLAIN-LANGUAGE condition (lampHealth.js `key`) changed.
// Repeated identical reports never create a row. Missing data (NO_DATA) is never written (and never stored as 0 lux).

export const HEALTH_NAMES = {
  GOOD: 'Connected / good',
  NEAR_LIMIT: 'Warning (light close to the low-light limit)',
  WARNING: 'Warning (low light, may be dim)',
  FAULT: 'Fault (no light detected)',
  BLINKING: 'Blinking (unstable light)',
  DAYLIGHT: 'Daylight standby',
  STANDBY: 'Standby (outside the lighting schedule)',
  SENSOR_ERROR: 'Sensor error (light sensor not responding)',
  OFFLINE: 'Offline (no recent report)',
  SLEEPING: 'Sleeping (daytime power saving)',
  UNKNOWN: 'Unrecognised status',
};
const name = (k) => HEALTH_NAMES[k] || k;

// GOOD <-> NEAR_LIMIT can flip back and forth when the light hovers around 100 lux; such flips are only recorded
// if the lamp has stayed in its previous state for a while, so a hovering lamp does not flood the history.
const SOFT = new Set(['GOOD', 'NEAR_LIMIT']);
export const SOFT_GAP_MS = 10 * 60 * 1000;

const luxText = (lux) => (typeof lux === 'number' && Number.isFinite(lux) ? ` (${Math.round(lux)} lux)` : '');

export const describeChange = (prev, next, lux) => {
  if (next === 'SLEEPING') return 'The lamp node went to sleep outside the lighting hours. This is expected, not a fault.';
  if (next === 'OFFLINE') return 'No report received for a while, so the lamp condition is unknown. This is a communication problem, not 0 lux.';
  if (prev === 'SLEEPING') return `The lamp node woke up and reported: ${name(next)}${luxText(lux)}.`;
  if (prev === 'OFFLINE') return `Communication restored: ${name(next)}${luxText(lux)}.`;
  if (!prev) return `First report received: ${name(next)}${luxText(lux)}.`;
  return `Changed from ${name(prev)} to ${name(next)}${luxText(lux)}.`;
};

// seed = { 'L-001': 'GOOD', ... } : the last recorded condition per lamp (loaded from the database at start-up), so a
// restart does not write the same condition twice.
export const createHealthTracker = ({ record, seed = {}, softGapMs = SOFT_GAP_MS }) => {
  const state = new Map(Object.entries(seed).map(([id, key]) => [id, { key, at: 0 }]));
  return {
    // lamp = one entry of the snapshot (id, health, lux, status, source). Returns the event it recorded, or null.
    observe(lamp, now, source) {
      const key = lamp?.health?.key;
      if (!lamp?.id || !key || key === 'NO_DATA') return null;
      const prev = state.get(lamp.id);
      if (prev && prev.key === key) return null;
      if (prev && SOFT.has(prev.key) && SOFT.has(key) && now - prev.at < softGapMs) return null;
      const lux = typeof lamp.lux === 'number' && Number.isFinite(lamp.lux) && lamp.lux >= 0 ? lamp.lux : null;
      const event = {
        streetlightId: lamp.id,
        occurredAt: now,
        type: 'STATUS_CHANGE',
        previous: prev ? prev.key : null,
        next: key,
        rawStatus: typeof lamp.status === 'string' ? lamp.status.slice(0, 24) : null,
        lux,
        description: describeChange(prev ? prev.key : null, key, lux),
        source: source || (lamp.source === 'test' ? 'TEST' : 'DEVICE'),
        ticketId: null,
        actorId: null,
      };
      state.set(lamp.id, { key, at: now });
      record(event);
      return event;
    },
    observeAll(lamps, now, source) {
      return lamps.map((l) => this.observe(l, now, source)).filter(Boolean);
    },
    current: (id) => state.get(id)?.key ?? null,
  };
};

// Saves events one after another in the order they happened. If the database is briefly unreachable the events wait
// (up to maxQueue) and are retried, keeping their ORIGINAL timestamps. Telemetry intake never waits for this.
export const createEventWriter = ({ insert, onError = () => {}, maxQueue = 2000, retryMs = 5000, setTimer = setTimeout }) => {
  const queue = [];
  let running = false;
  let timer = null;
  let dropped = 0;

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        try {
          await insert(queue[0]);
          queue.shift();
        } catch (e) {
          onError(e);
          if (!timer) {
            timer = setTimer(() => { timer = null; drain(); }, retryMs);
            if (timer && timer.unref) timer.unref();
          }
          return;
        }
      }
    } finally {
      running = false;
    }
  };

  return {
    enqueue(event) {
      queue.push(event);
      while (queue.length > maxQueue) { queue.shift(); dropped += 1; }
      drain();
    },
    // Resolves when everything queued so far has been saved (used by tests and by a clean shutdown).
    async flush(maxWaitMs = 3000) {
      const t0 = Date.now();
      while ((queue.length || running) && Date.now() - t0 < maxWaitMs) await new Promise((r) => setTimeout(r, 5));
      return queue.length === 0;
    },
    get pending() { return queue.length; },
    get dropped() { return dropped; },
  };
};
