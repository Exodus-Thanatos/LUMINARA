// LUMINARA data receiver (no npm packages needed, just Node 18+).
//
//   Master ESP32 --HTTP POST /api/telemetry--> this server --SSE /api/stream--> React dashboard
//
// It keeps the LATEST packet of every lamp node IN MEMORY only.
// If you restart the server, the lamps show "NO DATA" until they report again.
import http from 'node:http';

const PORT = Number(process.env.PORT) || 3001;
// Shared secret. The ESP32 sends it in the "X-Api-Key" header; set the same value in the .ino.
const DEVICE_KEY = process.env.DEVICE_KEY || 'dev-key-change-me';
// Same number as DISCONNECT_TIMEOUT_MS in the Arduino sketch (75 s).
const OFFLINE_AFTER_MS = Number(process.env.OFFLINE_AFTER_MS) || 75000;

const TYPES = new Set(['JOIN', 'ALRT', 'BEAT']); // packet types the sketch really sends
const lamps = new Map(); // nodeId -> latest record
const clients = new Set(); // open dashboard connections (SSE)

const lampId = (nodeId) => `L-${String(nodeId).padStart(3, '0')}`; // node 1 -> "L-001"

// Check one incoming packet. Returns { ok, error | packet }.
function validate(b) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'body must be a JSON object' };
  const nodeId = Number(b.nodeId);
  const seq = Number(b.seq);
  const lux = Number(b.lux);
  if (!Number.isInteger(nodeId) || nodeId < 1 || nodeId > 31) return { ok: false, error: 'nodeId must be 1..31' };
  if (!Number.isInteger(seq) || seq < 0) return { ok: false, error: 'seq must be an integer >= 0' };
  if (!Number.isFinite(lux) || lux < 0 || lux > 200000) return { ok: false, error: 'lux out of range' };
  if (!TYPES.has(b.type)) return { ok: false, error: 'type must be JOIN, ALRT or BEAT' };
  if (typeof b.status !== 'string' || b.status.length === 0 || b.status.length > 24) {
    return { ok: false, error: 'status must be a short string' };
  }
  const rssi = b.rssi === undefined || b.rssi === null ? null : Number(b.rssi);
  if (rssi !== null && !Number.isFinite(rssi)) return { ok: false, error: 'rssi must be a number' };
  return {
    ok: true,
    packet: { nodeId, seq, lux, type: b.type, status: b.status, rssi, source: b.source === 'test' ? 'test' : 'hardware' },
  };
}

// What the dashboard receives: one object per lamp that has ever reported.
function snapshot() {
  const now = Date.now();
  const list = [...lamps.values()].map((r) => ({
    id: lampId(r.nodeId),
    nodeId: r.nodeId,
    seq: r.seq,
    lux: r.lux,
    status: r.status, // exactly what the node reported
    rssi: r.rssi,
    lastSeen: new Date(r.lastSeenMs).toISOString(),
    link: now - r.lastSeenMs > OFFLINE_AFTER_MS ? 'OFFLINE' : 'ONLINE',
    source: r.source, // 'hardware' or 'test'
  }));
  return { serverTime: new Date(now).toISOString(), offlineAfterMs: OFFLINE_AFTER_MS, lamps: list };
}

function broadcast() {
  const data = `event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) res.write(data);
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/telemetry') {
    if (req.headers['x-api-key'] !== DEVICE_KEY) return json(res, 401, { error: 'bad api key' });
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2000) req.destroy(); // packets are tiny; refuse anything big
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: 'invalid JSON' });
      }
      const v = validate(body);
      if (!v.ok) return json(res, 400, { error: v.error });
      const p = v.packet;
      const prev = lamps.get(p.nodeId);
      // The master does not filter duplicates, so a re-sent packet (same type + seq) is ignored.
      const duplicate = prev && prev.seq === p.seq && prev.type === p.type;
      lamps.set(p.nodeId, {
        ...p,
        lastSeenMs: Date.now(),
        rxCount: (prev ? prev.rxCount : 0) + (duplicate ? 0 : 1),
      });
      broadcast();
      json(res, 200, { ok: true, id: lampId(p.nodeId), duplicate: Boolean(duplicate) });
    });
    return undefined;
  }

  if (req.method === 'GET' && url.pathname === '/api/lamps') return json(res, 200, snapshot());

  if (req.method === 'GET' && url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return undefined;
  }

  return json(res, 404, { error: 'not found' });
});

// Re-send the snapshot every 5 s so a silent node flips to OFFLINE without needing a new packet.
setInterval(broadcast, 5000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LUMINARA receiver listening on port ${PORT}`);
  if (DEVICE_KEY === 'dev-key-change-me') console.log('WARNING: using the default DEVICE_KEY. Set your own: DEVICE_KEY=... node server/server.js');
});
