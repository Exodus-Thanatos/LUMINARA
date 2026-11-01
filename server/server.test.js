// Backend tests. Run with:  npm test      (Node's built-in test runner, no extra packages)
// They use packets shaped exactly like the ones LoraIntegrated.ino's bridge posts.
// NOTE: this proves the HTTP/backend side only. It does not exercise LoRa or the ESP32.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DEVICE_KEY = 'test-key';
process.env.STALE_AFTER_MS = '60000';
process.env.OFFLINE_AFTER_MS = '90000';
const { server, snapshot, ingest, validate, resetForTests } = await import('./server.js');

let base;
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => resetForTests());

const pkt = (o = {}) => ({ type: 'BEAT', nodeId: 1, seq: 1, lux: 153.2, status: 'NORMAL_LIT', rssi: -71, ...o });
const post = (body, key = 'test-key', raw) =>
  fetch(`${base}/api/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key === null ? {} : { 'X-Api-Key': key }) },
    body: raw ?? JSON.stringify(body),
  });
const lamp = (n = 1) => snapshot().lamps.find((l) => l.nodeId === n);

test('accepts every packet type: JOIN, ALRT, BEAT, RPT', async () => {
  for (const [i, type] of ['JOIN', 'ALRT', 'BEAT', 'RPT'].entries()) {
    const r = await post(pkt({ type, seq: i + 1 }));
    assert.equal(r.status, 200, type);
    const b = await r.json();
    assert.equal(b.ok, true);
    assert.equal(b.accepted, true);
    assert.equal(b.id, 'L-001');
    assert.equal(lamp().type, type);
  }
});

test('stores node, seq, lux, status, rssi and timestamp from a firmware-shaped RPT', async () => {
  await post(pkt({ type: 'RPT', nodeId: 2, seq: 7, lux: 0, status: 'TOTAL_BLACKOUT', rssi: -93 }));
  const l = lamp(2);
  assert.equal(l.id, 'L-002');
  assert.equal(l.seq, 7);
  assert.equal(l.lux, 0); // zero lux is a real reading and must stay 0
  assert.equal(l.status, 'TOTAL_BLACKOUT');
  assert.equal(l.rssi, -93);
  assert.ok(Date.parse(l.lastSeen) > 0);
  assert.equal(l.link, 'ONLINE');
});

test('every status string used by the firmware is accepted unchanged', async () => {
  const all = ['NORMAL_LIT', 'DAYLIGHT_STANDBY', 'STANDBY', 'LOW_LIGHT', 'TOTAL_BLACKOUT', 'BLINKING/UNSTABLE', 'SENSOR_ERROR'];
  for (const [i, status] of all.entries()) {
    const r = await post(pkt({ seq: i + 1, status }));
    assert.equal(r.status, 200, status);
    assert.equal(lamp().status, status);
  }
});

test('SENSOR_ERROR: the 0.0 placeholder lux is stored as null, not as a reading', async () => {
  await post(pkt({ status: 'SENSOR_ERROR', lux: 0 }));
  assert.equal(lamp().lux, null);
  await post(pkt({ seq: 2, status: 'SENSOR_ERROR' })); // lux omitted entirely is also fine
  assert.equal(lamp().lux, null);
});

test('missing lux is rejected for a normal status (never turned into 0)', async () => {
  const b = pkt(); delete b.lux;
  const r = await post(b);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'invalid_lux');
  assert.equal(lamp(), undefined);
  assert.equal((await post(pkt({ lux: null }))).status, 400);
  assert.equal((await post(pkt({ lux: '12' }))).status, 400);
});

test('ALRT is remembered as lastAlert even after a later BEAT', async () => {
  await post(pkt({ type: 'ALRT', seq: 1, status: 'LOW_LIGHT', lux: 40 }));
  await post(pkt({ type: 'BEAT', seq: 2, status: 'LOW_LIGHT', lux: 41 }));
  const l = lamp();
  assert.equal(l.type, 'BEAT');
  assert.equal(l.lastAlert.status, 'LOW_LIGHT');
  assert.equal(l.lastAlert.seq, 1);
});

test('malformed requests are rejected safely and nothing is stored', async () => {
  const cases = [
    [pkt({ type: 'HELLO' }), 'invalid_type'],
    [pkt({ nodeId: 0 }), 'invalid_node'],
    [pkt({ nodeId: 32 }), 'invalid_node'],
    [pkt({ nodeId: '1' }), 'invalid_node'],
    [pkt({ seq: -1 }), 'invalid_seq'],
    [pkt({ seq: 1.5 }), 'invalid_seq'],
    [pkt({ lux: -5 }), 'invalid_lux'],
    [pkt({ lux: 1e9 }), 'invalid_lux'],
    [pkt({ status: '' }), 'invalid_status'],
    [pkt({ status: 'X'.repeat(25) }), 'invalid_status'],
    [pkt({ status: '<script>' }), 'invalid_status'],
    [pkt({ rssi: 'strong' }), 'invalid_rssi'],
    [[1, 2, 3], 'invalid_body'],
    [null, 'invalid_body'],
  ];
  for (const [body, code] of cases) {
    const r = await post(body);
    assert.equal(r.status, 400, code);
    assert.equal((await r.json()).code, code);
  }
  const bad = await post(null, 'test-key', '{not json');
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'invalid_json');
  assert.equal(snapshot().lamps.length, 0);
});

test('oversized body gets 413', async () => {
  const r = await post(null, 'test-key', JSON.stringify({ pad: 'x'.repeat(3000) }));
  assert.equal(r.status, 413);
});

test('authentication is enforced', async () => {
  assert.equal((await post(pkt(), 'wrong-key')).status, 401);
  assert.equal((await post(pkt(), null)).status, 401);
  assert.equal((await post(pkt(), '')).status, 401);
  assert.equal(snapshot().lamps.length, 0);
  assert.equal((await post(pkt())).status, 200);
});

test('unknown routes 404, GET /api/lamps works', async () => {
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  const r = await fetch(`${base}/api/lamps`);
  assert.equal(r.status, 200);
  const s = await r.json();
  assert.equal(s.offlineAfterMs, 90000);
  assert.equal(s.staleAfterMs, 60000);
});

test('a report updates only its own node', async () => {
  await post(pkt({ nodeId: 1, seq: 1, status: 'NORMAL_LIT' }));
  await post(pkt({ nodeId: 2, seq: 1, status: 'LOW_LIGHT', lux: 40 }));
  await post(pkt({ nodeId: 1, seq: 2, status: 'TOTAL_BLACKOUT', lux: 0 }));
  assert.equal(lamp(1).status, 'TOTAL_BLACKOUT');
  assert.equal(lamp(2).status, 'LOW_LIGHT');
  assert.equal(snapshot().lamps.length, 2);
});

test('duplicate seq (a retry) does not change data or the count', async () => {
  await post(pkt({ seq: 5, lux: 100 }));
  const r = await post(pkt({ seq: 5, lux: 999, status: 'LOW_LIGHT' }));
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.duplicate, true);
  assert.equal(b.accepted, false);
  assert.equal(lamp().lux, 100);
  assert.equal(lamp().status, 'NORMAL_LIT');
  assert.equal(lamp().rxCount, 1);
});

test('an older seq cannot overwrite newer data (409)', async () => {
  await post(pkt({ seq: 50, lux: 100 }));
  const r = await post(pkt({ seq: 40, lux: 5, status: 'TOTAL_BLACKOUT' }));
  assert.equal(r.status, 409);
  const b = await r.json();
  assert.equal(b.code, 'stale_seq');
  assert.equal(b.latestSeq, 50);
  assert.equal(lamp().seq, 50);
  assert.equal(lamp().status, 'NORMAL_LIT');
});

test('seq restart after power loss (small seq) is accepted and counted', async () => {
  await post(pkt({ seq: 120, lux: 100 }));
  const r = await post(pkt({ seq: 1, type: 'RPT', lux: 150 }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).restart, true);
  assert.equal(lamp().seq, 1);
  assert.equal(lamp().restarts, 1);
  assert.equal((await post(pkt({ seq: 2 }))).status, 200); // and counting up works again
});

test('seq regression after the node was OFFLINE is accepted as a restart (no stuck node)', () => {
  const t0 = 1_000_000;
  ingest(validate(pkt({ seq: 500 })).packet, t0);
  const r = ingest(validate(pkt({ seq: 30 })).packet, t0 + 91_000);
  assert.equal(r.code, 200);
  assert.equal(r.body.restart, true);
});

test('deep sleep keeps counting: a normal seq increase after a long silence is a plain accept', () => {
  const t0 = 1_000_000;
  ingest(validate(pkt({ seq: 100 })).packet, t0);
  const r = ingest(validate(pkt({ seq: 101 })).packet, t0 + 3_600_000);
  assert.equal(r.code, 200);
  assert.equal(r.body.restart, undefined);
});

test('link health follows the configured thresholds (ONLINE -> STALE -> OFFLINE) and never changes lamp status', () => {
  const t0 = 2_000_000;
  ingest(validate(pkt({ status: 'NORMAL_LIT' })).packet, t0);
  const at = (ms) => snapshot(t0 + ms).lamps[0];
  assert.equal(at(0).link, 'ONLINE');
  assert.equal(at(60_000).link, 'ONLINE'); // exactly on the threshold is still fresh
  assert.equal(at(60_001).link, 'STALE');
  assert.equal(at(90_000).link, 'STALE');
  assert.equal(at(90_001).link, 'OFFLINE');
  for (const ms of [0, 70_000, 200_000]) assert.equal(at(ms).status, 'NORMAL_LIT'); // lamp condition untouched
  assert.equal(at(200_000).ageMs, 200_000);
});

test('a duplicate refreshes the "last seen" time (node is alive) but not the data', () => {
  const t0 = 3_000_000;
  ingest(validate(pkt({ seq: 9 })).packet, t0);
  ingest(validate(pkt({ seq: 9, lux: 1 })).packet, t0 + 80_000);
  const l = snapshot(t0 + 100_000).lamps[0];
  assert.equal(l.link, 'ONLINE');
  assert.equal(l.lux, 153.2);
});
