// // LUMINARA data receiver (no npm packages needed, just Node 18+).
// //
// //   Master ESP32 --HTTP POST /api/telemetry--> this server --SSE /api/stream--> React dashboard
// //
// // It keeps the LATEST packet of every lamp node IN MEMORY only.
// // If you restart the server, the lamps show "NO DATA" until they report again.
// //
// // Packet format (what LoraIntegrated.ino's bridge really posts):
// //   {"type":"RPT|ALRT|BEAT","nodeId":1,"seq":42,"lux":153.2,"status":"NORMAL_LIT","rssi":-71}
// //   JOIN is still accepted for the older sketch / test tool, but LoraIntegrated.ino never sends it.
// //
// // Responses to POST /api/telemetry (the sketch treats 200 = sent, other 4xx = dropped, 5xx/no reply = retried):
// //   200 {ok:true, accepted:true,  id, type, seq, restart?}   packet stored
// //   200 {ok:true, accepted:false, duplicate:true, id, seq}   same seq as the stored one: data kept, "last seen" refreshed
// //   400 {ok:false, code, error}                              invalid JSON / invalid field
// //   401 {ok:false, code:'bad_api_key', error}                missing or wrong X-Api-Key
// //   409 {ok:false, code:'stale_seq', error, id, seq, latestSeq}  older packet: ignored, newer data is NOT overwritten
// //   413 {ok:false, code:'too_large', error}                  body over 2000 bytes
// import http from 'node:http';
// import crypto from 'node:crypto';
// import { pathToFileURL } from 'node:url';

// const PORT = Number(process.env.PORT) || 3001;
// // Shared secret. The ESP32 sends it in the "X-Api-Key" header; set the same value in the .ino.
// const DEVICE_KEY = process.env.DEVICE_KEY || 'dev-key-change-me';

// // ---- Link-health thresholds (all in one place; override with environment variables) ----
// // Firmware facts (LoraIntegrated.ino): in the FREE phase every node transmits once per 30 s cycle
// // (FREE_PERIOD_S), and the master marks a node OFFLINE after DISCONNECT_TIMEOUT_MS = 85 s of silence.
// //   STALE   : 60 s = two missed 30 s cycles. The node is probably fine but the data is getting old.
// //   OFFLINE : 90 s = master's 85 s timeout + ~5 s (the master only checks every 5 s, and a packet waits
// //             in its Wi-Fi queue before it reaches this server). A healthy node is never flagged
// //             before the master itself would flag it.
// // NOTE: these values assume the FREE phase. See "Remaining issues" in the docs for polling-only and
// // deep-sleep periods, where nodes are legitimately silent for longer.
// const envMs = (name, fallback) => {
//   const n = Number(process.env[name]);
//   return Number.isFinite(n) && n > 0 ? n : fallback;
// };
// const OFFLINE_AFTER_MS = envMs('OFFLINE_AFTER_MS', 90000);
// const STALE_AFTER_MS = Math.min(envMs('STALE_AFTER_MS', 60000), OFFLINE_AFTER_MS);

// // A node's seq counter lives in RTC memory: it survives deep sleep but restarts from 1 after a power loss.
// // A lower seq is therefore treated as a node RESTART (accepted) when it is small, or when the node had
// // already been silent long enough to be OFFLINE. Any other lower seq is an old/replayed packet (rejected).
// const SEQ_RESTART_MAX = 10;

// const TYPES = new Set(['RPT', 'ALRT', 'BEAT', 'JOIN']); // RPT = poll reply, ALRT/BEAT = free-phase report, JOIN = legacy
// const STATUS_RE = /^[A-Za-z0-9_/ .-]{1,24}$/; // firmware statuses are <= 23 chars, e.g. BLINKING/UNSTABLE
// const SENSOR_ERROR = 'SENSOR_ERROR';

// const lamps = new Map(); // nodeId -> latest record
// const clients = new Set(); // open dashboard connections (SSE)

// const lampId = (nodeId) => `L-${String(nodeId).padStart(3, '0')}`; // node 1 -> "L-001"

// // Check one incoming packet. Returns { ok, code, error | packet }.
// export function validate(b) {
//   const bad = (code, error) => ({ ok: false, code, error });
//   if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('invalid_body', 'body must be a JSON object');
//   const { nodeId, seq, type, status } = b;
//   if (!Number.isInteger(nodeId) || nodeId < 1 || nodeId > 31) return bad('invalid_node', 'nodeId must be an integer 1..31');
//   if (!Number.isInteger(seq) || seq < 0) return bad('invalid_seq', 'seq must be an integer >= 0');
//   if (!TYPES.has(type)) return bad('invalid_type', 'type must be RPT, ALRT, BEAT or JOIN');
//   if (typeof status !== 'string' || !STATUS_RE.test(status)) return bad('invalid_status', 'status must be a short string (letters, digits, _ / . - space)');

//   // The sketch sends lux 0.0 as a placeholder when the BH1750 failed. That is NOT a measurement,
//   // so it is stored as null. For every other status lux is required and 0 is a real reading.
//   let lux = null;
//   if (status !== SENSOR_ERROR) {
//     if (typeof b.lux !== 'number' || !Number.isFinite(b.lux) || b.lux < 0 || b.lux > 200000) {
//       return bad('invalid_lux', 'lux must be a number between 0 and 200000');
//     }
//     lux = b.lux;
//   }
//   const rssi = b.rssi === undefined || b.rssi === null ? null : b.rssi;
//   if (rssi !== null && (typeof rssi !== 'number' || !Number.isFinite(rssi))) return bad('invalid_rssi', 'rssi must be a number');
//   return { ok: true, packet: { nodeId, seq, lux, type, status, rssi, source: b.source === 'test' ? 'test' : 'hardware' } };
// }

// // Store one validated packet. Returns { code, body } for the HTTP reply. `now` is injectable for tests.
// export function ingest(p, now = Date.now()) {
//   const id = lampId(p.nodeId);
//   const prev = lamps.get(p.nodeId);
//   let restart = false;

//   if (prev) {
//     if (p.seq === prev.seq) {
//       // Retry of a packet we already have. Keep the data, but the node did just talk to us.
//       prev.lastSeenMs = now;
//       return { code: 200, body: { ok: true, accepted: false, duplicate: true, id, seq: p.seq } };
//     }
//     if (p.seq < prev.seq) {
//       const wasOffline = now - prev.lastSeenMs > OFFLINE_AFTER_MS;
//       if (p.seq <= SEQ_RESTART_MAX || wasOffline) restart = true;
//       else {
//         return {
//           code: 409,
//           body: { ok: false, code: 'stale_seq', error: 'older sequence number; newer data kept', id, seq: p.seq, latestSeq: prev.seq },
//         };
//       }
//     }
//   }

//   const statusChanged = !prev || prev.status !== p.status;
//   lamps.set(p.nodeId, {
//     ...p,
//     lastSeenMs: now,
//     statusSinceMs: statusChanged ? now : prev.statusSinceMs,
//     rxCount: (prev ? prev.rxCount : 0) + 1,
//     restarts: (prev ? prev.restarts : 0) + (restart ? 1 : 0),
//     // ALRT = the node itself said "something changed". Keep the last one so it is not lost when a BEAT follows.
//     lastAlert: p.type === 'ALRT' ? { seq: p.seq, lux: p.lux, status: p.status, at: new Date(now).toISOString() } : prev ? prev.lastAlert : null,
//   });
//   return { code: 200, body: { ok: true, accepted: true, id, type: p.type, seq: p.seq, ...(restart ? { restart: true } : {}) } };
// }

// // ONLINE (fresh) -> STALE (a report is overdue) -> OFFLINE (no report for a long time).
// // This is ONLY about communication. The lamp condition is the separate `status` field and is never changed here.
// const linkState = (ageMs) => (ageMs > OFFLINE_AFTER_MS ? 'OFFLINE' : ageMs > STALE_AFTER_MS ? 'STALE' : 'ONLINE');

// // What the dashboard receives: one object per lamp that has ever reported.
// export function snapshot(now = Date.now()) {
//   const list = [...lamps.values()].sort((a, b) => a.nodeId - b.nodeId).map((r) => ({
//     id: lampId(r.nodeId),
//     nodeId: r.nodeId,
//     seq: r.seq,
//     type: r.type, // RPT | ALRT | BEAT | JOIN: which kind of packet produced this reading
//     lux: r.lux, // null = no valid measurement (e.g. SENSOR_ERROR). 0 is a real reading.
//     status: r.status, // exactly what the node reported (lamp condition)
//     statusSince: new Date(r.statusSinceMs).toISOString(),
//     rssi: r.rssi,
//     lastSeen: new Date(r.lastSeenMs).toISOString(),
//     ageMs: now - r.lastSeenMs,
//     link: linkState(now - r.lastSeenMs), // communication health, separate from `status`
//     lastAlert: r.lastAlert, // last ALRT packet from this node, or null
//     rxCount: r.rxCount,
//     restarts: r.restarts, // times the seq counter went backwards (node reboot / power loss)
//     source: r.source, // 'hardware' or 'test'
//   }));
//   return { serverTime: new Date(now).toISOString(), staleAfterMs: STALE_AFTER_MS, offlineAfterMs: OFFLINE_AFTER_MS, lamps: list };
// }

// function broadcast() {
//   const data = `event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`;
//   for (const res of clients) res.write(data);
// }

// const json = (res, code, obj) => {
//   res.writeHead(code, { 'Content-Type': 'application/json' });
//   res.end(JSON.stringify(obj));
// };

// const keyOk = (given) => {
//   if (typeof given !== 'string') return false;
//   const a = Buffer.from(given);
//   const b = Buffer.from(DEVICE_KEY);
//   return a.length === b.length && crypto.timingSafeEqual(a, b);
// };

// export const server = http.createServer((req, res) => {
//   const url = new URL(req.url, 'http://localhost');

//   if (req.method === 'POST' && url.pathname === '/api/telemetry') {
//     if (!keyOk(req.headers['x-api-key'])) return json(res, 401, { ok: false, code: 'bad_api_key', error: 'bad api key' });
//     let raw = '';
//     let tooBig = false;
//     req.on('data', (c) => {
//       if (tooBig) return;
//       raw += c;
//       if (raw.length > 2000) { // packets are tiny; refuse anything big
//         tooBig = true;
//         json(res, 413, { ok: false, code: 'too_large', error: 'body too large' });
//         req.resume();
//       }
//     });
//     req.on('end', () => {
//       if (tooBig) return;
//       let body;
//       try {
//         body = JSON.parse(raw);
//       } catch {
//         return json(res, 400, { ok: false, code: 'invalid_json', error: 'invalid JSON' });
//       }
//       const v = validate(body);
//       if (!v.ok) return json(res, 400, { ok: false, code: v.code, error: v.error });
//       const result = ingest(v.packet);
//       if (result.code === 200) broadcast();
//       json(res, result.code, result.body);
//     });
//     return undefined;
//   }

//   if (req.method === 'GET' && url.pathname === '/api/lamps') return json(res, 200, snapshot());

//   if (req.method === 'GET' && url.pathname === '/api/stream') {
//     res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
//     res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
//     clients.add(res);
//     req.on('close', () => clients.delete(res));
//     return undefined;
//   }

//   return json(res, 404, { error: 'not found' });
// });

// // Test helper: forget every stored lamp.
// export const resetForTests = () => lamps.clear();

// // Only start listening when run directly (`node server/server.js`), not when imported by the tests.
// if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
//   // Re-send the snapshot every 5 s so a silent node flips to STALE/OFFLINE without needing a new packet.
//   setInterval(broadcast, 5000);
//   server.listen(PORT, '0.0.0.0', () => {
//     console.log(`LUMINARA receiver listening on port ${PORT} (stale after ${STALE_AFTER_MS / 1000} s, offline after ${OFFLINE_AFTER_MS / 1000} s)`);
//     if (DEVICE_KEY === 'dev-key-change-me') console.log('WARNING: using the default DEVICE_KEY. Set your own: DEVICE_KEY=... node server/server.js');
//   });
// }


// LUMINARA data receiver (no npm packages needed, just Node 18+).
//
//   Master ESP32 --HTTP POST /api/telemetry--> this server --SSE /api/stream--> React dashboard
//
// It keeps the LATEST packet of every lamp node IN MEMORY only.
// If you restart the server, the lamps show "NO DATA" until they report again.
//
// Packet format (what LoraIntegrated.ino's bridge really posts):
//   {"type":"RPT|ALRT|BEAT","nodeId":1,"seq":42,"lux":153.2,"status":"NORMAL_LIT","rssi":-71}
//   JOIN is still accepted for the older sketch / test tool, but LoraIntegrated.ino never sends it.
//
// Responses to POST /api/telemetry (the sketch treats 200 = sent, other 4xx = dropped, 5xx/no reply = retried):
//   200 {ok:true, accepted:true,  id, type, seq, restart?}   packet stored
//   200 {ok:true, accepted:false, duplicate:true, id, seq}   same seq as the stored one: data kept, "last seen" refreshed
//   400 {ok:false, code, error}                              invalid JSON / invalid field
//   401 {ok:false, code:'bad_api_key', error}                missing or wrong X-Api-Key
//   409 {ok:false, code:'stale_seq', error, id, seq, latestSeq}  older packet: ignored, newer data is NOT overwritten
//   413 {ok:false, code:'too_large', error}                  body over 2000 bytes
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT) || 3001;
// Shared secret. The ESP32 sends it in the "X-Api-Key" header; set the same value in the .ino.
const DEVICE_KEY = process.env.DEVICE_KEY || 'rophil1234';

// ---- Link-health thresholds (all in one place; override with environment variables) ----
// Firmware facts (LoraIntegrated.ino): in the FREE phase every node transmits once per 30 s cycle
// (FREE_PERIOD_S), and the master marks a node OFFLINE after DISCONNECT_TIMEOUT_MS = 85 s of silence.
//   STALE   : 60 s = two missed 30 s cycles. The node is probably fine but the data is getting old.
//   OFFLINE : 90 s = master's 85 s timeout + ~5 s (the master only checks every 5 s, and a packet waits
//             in its Wi-Fi queue before it reaches this server). A healthy node is never flagged
//             before the master itself would flag it.
// NOTE: these values assume the FREE phase. See "Remaining issues" in the docs for polling-only and
// deep-sleep periods, where nodes are legitimately silent for longer.
const envMs = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const OFFLINE_AFTER_MS = envMs('OFFLINE_AFTER_MS', 90000);
const STALE_AFTER_MS = Math.min(envMs('STALE_AFTER_MS', 60000), OFFLINE_AFTER_MS);

// A node's seq counter lives in RTC memory: it survives deep sleep but restarts from 1 after a power loss.
// A lower seq is therefore treated as a node RESTART (accepted) when it is small, or when the node had
// already been silent long enough to be OFFLINE. Any other lower seq is an old/replayed packet (rejected).
const SEQ_RESTART_MAX = 10;

const TYPES = new Set(['RPT', 'ALRT', 'BEAT', 'JOIN']); // RPT = poll reply, ALRT/BEAT = free-phase report, JOIN = legacy
const STATUS_RE = /^[A-Za-z0-9_/ .-]{1,24}$/; // firmware statuses are <= 23 chars, e.g. BLINKING/UNSTABLE
const SENSOR_ERROR = 'SENSOR_ERROR';

const lamps = new Map(); // nodeId -> latest record
const clients = new Set(); // open dashboard connections (SSE)

const lampId = (nodeId) => `L-${String(nodeId).padStart(3, '0')}`; // node 1 -> "L-001"

// Check one incoming packet. Returns { ok, code, error | packet }.
export function validate(b) {
  const bad = (code, error) => ({ ok: false, code, error });
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('invalid_body', 'body must be a JSON object');
  const { nodeId, seq, type, status } = b;
  if (!Number.isInteger(nodeId) || nodeId < 1 || nodeId > 31) return bad('invalid_node', 'nodeId must be an integer 1..31');
  if (!Number.isInteger(seq) || seq < 0) return bad('invalid_seq', 'seq must be an integer >= 0');
  if (!TYPES.has(type)) return bad('invalid_type', 'type must be RPT, ALRT, BEAT or JOIN');
  if (typeof status !== 'string' || !STATUS_RE.test(status)) return bad('invalid_status', 'status must be a short string (letters, digits, _ / . - space)');

  // The sketch sends lux 0.0 as a placeholder when the BH1750 failed. That is NOT a measurement,
  // so it is stored as null. For every other status lux is required and 0 is a real reading.
  let lux = null;
  if (status !== SENSOR_ERROR) {
    if (typeof b.lux !== 'number' || !Number.isFinite(b.lux) || b.lux < 0 || b.lux > 200000) {
      return bad('invalid_lux', 'lux must be a number between 0 and 200000');
    }
    lux = b.lux;
  }
  const rssi = b.rssi === undefined || b.rssi === null ? null : b.rssi;
  if (rssi !== null && (typeof rssi !== 'number' || !Number.isFinite(rssi))) return bad('invalid_rssi', 'rssi must be a number');
  return { ok: true, packet: { nodeId, seq, lux, type, status, rssi, source: b.source === 'test' ? 'test' : 'hardware' } };
}

// Store one validated packet. Returns { code, body } for the HTTP reply. `now` is injectable for tests.
export function ingest(p, now = Date.now()) {
  const id = lampId(p.nodeId);
  const prev = lamps.get(p.nodeId);
  let restart = false;

  if (prev) {
    if (p.seq === prev.seq) {
      // Retry of a packet we already have. Keep the data, but the node did just talk to us.
      prev.lastSeenMs = now;
      return { code: 200, body: { ok: true, accepted: false, duplicate: true, id, seq: p.seq } };
    }
    if (p.seq < prev.seq) {
      const wasOffline = now - prev.lastSeenMs > OFFLINE_AFTER_MS;
      if (p.seq <= SEQ_RESTART_MAX || wasOffline) restart = true;
      else {
        return {
          code: 409,
          body: { ok: false, code: 'stale_seq', error: 'older sequence number; newer data kept', id, seq: p.seq, latestSeq: prev.seq },
        };
      }
    }
  }

  const statusChanged = !prev || prev.status !== p.status;
  lamps.set(p.nodeId, {
    ...p,
    lastSeenMs: now,
    statusSinceMs: statusChanged ? now : prev.statusSinceMs,
    rxCount: (prev ? prev.rxCount : 0) + 1,
    restarts: (prev ? prev.restarts : 0) + (restart ? 1 : 0),
    // ALRT = the node itself said "something changed". Keep the last one so it is not lost when a BEAT follows.
    lastAlert: p.type === 'ALRT' ? { seq: p.seq, lux: p.lux, status: p.status, at: new Date(now).toISOString() } : prev ? prev.lastAlert : null,
  });
  return { code: 200, body: { ok: true, accepted: true, id, type: p.type, seq: p.seq, ...(restart ? { restart: true } : {}) } };
}

// ONLINE (fresh) -> STALE (a report is overdue) -> OFFLINE (no report for a long time).
// This is ONLY about communication. The lamp condition is the separate `status` field and is never changed here.
const linkState = (ageMs) => (ageMs > OFFLINE_AFTER_MS ? 'OFFLINE' : ageMs > STALE_AFTER_MS ? 'STALE' : 'ONLINE');

// What the dashboard receives: one object per lamp that has ever reported.
export function snapshot(now = Date.now()) {
  const list = [...lamps.values()].sort((a, b) => a.nodeId - b.nodeId).map((r) => ({
    id: lampId(r.nodeId),
    nodeId: r.nodeId,
    seq: r.seq,
    type: r.type, // RPT | ALRT | BEAT | JOIN: which kind of packet produced this reading
    lux: r.lux, // null = no valid measurement (e.g. SENSOR_ERROR). 0 is a real reading.
    status: r.status, // exactly what the node reported (lamp condition)
    statusSince: new Date(r.statusSinceMs).toISOString(),
    rssi: r.rssi,
    lastSeen: new Date(r.lastSeenMs).toISOString(),
    ageMs: now - r.lastSeenMs,
    link: linkState(now - r.lastSeenMs), // communication health, separate from `status`
    lastAlert: r.lastAlert, // last ALRT packet from this node, or null
    rxCount: r.rxCount,
    restarts: r.restarts, // times the seq counter went backwards (node reboot / power loss)
    source: r.source, // 'hardware' or 'test'
  }));
  return { serverTime: new Date(now).toISOString(), staleAfterMs: STALE_AFTER_MS, offlineAfterMs: OFFLINE_AFTER_MS, lamps: list };
}

function broadcast() {
  const data = `event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) res.write(data);
}

// Phase 2: the dashboard also gets the relay-control state pushed over the same /api/stream (event: control),
// so it no longer has to wait for its own poll. Old clients ignore unknown events; GET /api/control is unchanged.
function broadcastControl() {
  const data = `event: control\ndata: ${JSON.stringify(controlView())}\n\n`;
  for (const res of clients) res.write(data);
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const keyOk = (given) => {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(DEVICE_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// ---- Manual switching ----
// The dashboard sets the DESIRED state; the relay ESP32 polls it, applies it, and reports back what it applied.
// want === null means "no command yet": the controller leaves the relay alone (so a server restart never kills the lights).
const CONTROLLER_ONLINE_MS = 10000;
const control = { want: null, appliedOn: null, lastPollMs: null };
const controlView = (now = Date.now()) => ({
  want: control.want,
  applied: control.appliedOn, // null = the controller has never confirmed
  controllerOnline: control.lastPollMs !== null && now - control.lastPollMs <= CONTROLLER_ONLINE_MS,
  pending: control.want !== null && control.appliedOn !== control.want,
});

export const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/telemetry') {
    if (!keyOk(req.headers['x-api-key'])) return json(res, 401, { ok: false, code: 'bad_api_key', error: 'bad api key' });
    let raw = '';
    let tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return;
      raw += c;
      if (raw.length > 2000) { // packets are tiny; refuse anything big
        tooBig = true;
        json(res, 413, { ok: false, code: 'too_large', error: 'body too large' });
        req.resume();
      }
    });
    req.on('end', () => {
      if (tooBig) return;
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(res, 400, { ok: false, code: 'invalid_json', error: 'invalid JSON' });
      }
      const v = validate(body);
      if (!v.ok) return json(res, 400, { ok: false, code: v.code, error: v.error });
      const result = ingest(v.packet);
      if (result.code === 200) broadcast();
      json(res, result.code, result.body);
    });
    return undefined;
  }

  if (req.method === 'GET' && url.pathname === '/api/lamps') return json(res, 200, snapshot());

  if (req.method === 'GET' && url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
    res.write(`event: control\ndata: ${JSON.stringify(controlView())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return undefined;
  }

  // Dashboard: read the manual-switch state.
  if (url.pathname === '/api/control' && req.method === 'GET') return json(res, 200, controlView());

  // Dashboard: set the desired state. Body: {"on": true|false}
  if (url.pathname === '/api/control' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => {
      if (raw.length < 500) raw += c;
    });
    req.on('end', () => {
      let b;
      try {
        b = JSON.parse(raw);
      } catch {
        return json(res, 400, { ok: false, code: 'invalid_json', error: 'invalid JSON' });
      }
      if (!b || typeof b.on !== 'boolean') return json(res, 400, { ok: false, code: 'invalid_on', error: 'on must be true or false' });
      control.want = b.on;
      broadcastControl();
      json(res, 200, controlView());
    });
    return undefined;
  }

  // Relay ESP32 polls this (needs the device key). ?applied=on|off tells the server what the relay is doing right now.
  if (url.pathname === '/api/command' && req.method === 'GET') {
    if (!keyOk(req.headers['x-api-key'])) return json(res, 401, { ok: false, code: 'bad_api_key', error: 'bad api key' });
    const before = JSON.stringify(controlView());
    const a = url.searchParams.get('applied');
    if (a === 'on' || a === 'off') control.appliedOn = a === 'on';
    control.lastPollMs = Date.now();
    if (JSON.stringify(controlView()) !== before) broadcastControl(); // only when something the dashboard shows has changed
    return json(res, 200, { on: control.want });
  }

  return json(res, 404, { error: 'not found' });
});

// Test helper: forget every stored lamp.
export const resetForTests = () => {
  lamps.clear();
  control.want = null;
  control.appliedOn = null;
  control.lastPollMs = null;
};

// Only start listening when run directly (`node server/server.js`), not when imported by the tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Re-send the snapshot every 5 s so a silent node flips to STALE/OFFLINE without needing a new packet.
  setInterval(() => {
    broadcast();
    broadcastControl(); // also lets "controller offline" show up without a poll
  }, 5000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LUMINARA receiver listening on port ${PORT} (stale after ${STALE_AFTER_MS / 1000} s, offline after ${OFFLINE_AFTER_MS / 1000} s)`);
    if (DEVICE_KEY === 'dev-key-change-me') console.log('WARNING: using the default DEVICE_KEY. Set your own: DEVICE_KEY=... node server/server.js');
  });
}