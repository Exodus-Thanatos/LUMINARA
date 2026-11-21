import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLamp, blinkingConfirmed, BLINK, LUX, NEAR_MARGIN } from './lampHealth.js';

const { ingest, snapshot, resetForTests, validate } = await import('./server.js');
beforeEach(() => resetForTests());

const T0 = Date.parse('2026-11-08T20:00:00Z');
const rep = (status, atSec) => ({ status, at: T0 + atSec * 1000 });
const cls = (status, over = {}) => classifyLamp({ status, link: 'ONLINE', recent: [rep(status, 0)], ...over }, T0);

test('thresholds are the firmware ones, not new ones', () => {
  assert.deepEqual(LUX, { BLACKOUT_MAX: 5, LOW_LIGHT_MAX: 80, DAYLIGHT_MIN: 3000, FLICKER_DELTA: 50 });
});

test('FAULT: expected lit but no light is detected (red)', () => {
  const h = cls('TOTAL_BLACKOUT');
  assert.equal(h.label, 'FAULT');
  assert.equal(h.tone, 'red');
  assert.equal(h.dashboardStatus, 'FAULT');
  assert.match(h.short, /No light detected/);
});

test('WARNING: low light / dim (amber)', () => {
  const h = cls('LOW_LIGHT');
  assert.equal(h.label, 'WARNING');
  assert.equal(h.tone, 'amber');
  assert.equal(h.dashboardStatus, 'WARNING');
  assert.match(h.short, /dim/i);
});

test('CONNECTED / GOOD: normal operation (green), including the legacy NORMAL value', () => {
  for (const s of ['NORMAL_LIT', 'NORMAL']) {
    const h = cls(s);
    assert.equal(h.label, 'CONNECTED / GOOD');
    assert.equal(h.tone, 'green');
    assert.equal(h.dashboardStatus, 'ONLINE');
  }
});

test('a single unstable report is shown as BLINKING straight away, not as a warning', () => {
  const h = cls('BLINKING/UNSTABLE');
  assert.equal(h.key, 'BLINKING');
  assert.equal(h.label, 'BLINKING');
  assert.equal(h.dashboardStatus, 'FAULT');
  assert.equal(h.animate, true);
});

test('healthy report with light just above the low-light limit is a WARNING; clearly healthy stays GOOD', () => {
  const near = classifyLamp({ status: 'NORMAL_LIT', link: 'ONLINE', recent: [], lux: LUX.LOW_LIGHT_MAX + 10 }, T0);
  assert.equal(near.key, 'NEAR_LIMIT');
  assert.equal(near.label, 'WARNING');
  assert.equal(near.dashboardStatus, 'WARNING');
  const edge = classifyLamp({ status: 'NORMAL_LIT', link: 'ONLINE', recent: [], lux: LUX.LOW_LIGHT_MAX + NEAR_MARGIN }, T0);
  assert.equal(edge.key, 'NEAR_LIMIT');
  const fine = classifyLamp({ status: 'NORMAL_LIT', link: 'ONLINE', recent: [], lux: LUX.LOW_LIGHT_MAX + NEAR_MARGIN + 1 }, T0);
  assert.equal(fine.key, 'GOOD');
  // no lux known (older caller): never guessed, stays GOOD
  assert.equal(classifyLamp({ status: 'NORMAL_LIT', link: 'ONLINE', recent: [] }, T0).key, 'GOOD');
});

test('BLINKING needs repeated reports: 3 of the last 5 inside 5 minutes', () => {
  const U = 'BLINKING/UNSTABLE';
  const two = [rep('NORMAL_LIT', 0), rep(U, 30), rep(U, 60)];
  assert.equal(blinkingConfirmed(two, T0 + 60000), false);
  const three = [...two, rep(U, 90)];
  assert.equal(blinkingConfirmed(three, T0 + 90000), true);
  const h = classifyLamp({ status: U, link: 'ONLINE', recent: three }, T0 + 90000);
  assert.equal(h.key, 'BLINKING');
  assert.equal(h.label, 'BLINKING');
  assert.equal(h.animate, true);
  assert.equal(h.dashboardStatus, 'FAULT');
});

test('old unstable reports (older than 5 minutes) do not count', () => {
  const U = 'BLINKING/UNSTABLE';
  const old = [rep(U, 0), rep(U, 10), rep(U, 20), rep(U, 400)];
  assert.equal(blinkingConfirmed(old, T0 + 400000), false);
  assert.equal(BLINK.windowMs, 300000);
});

test('light swinging between good and no-light across reports is also confirmed as blinking', () => {
  const seq = [rep('NORMAL_LIT', 0), rep('TOTAL_BLACKOUT', 20), rep('NORMAL_LIT', 40), rep('TOTAL_BLACKOUT', 60)];
  assert.equal(blinkingConfirmed(seq, T0 + 60000), true);
  // one drop and recovery is not a pattern
  assert.equal(blinkingConfirmed([rep('NORMAL_LIT', 0), rep('TOTAL_BLACKOUT', 20), rep('NORMAL_LIT', 40)], T0 + 40000), false);
  // a lamp that is simply dark all night is a fault, not blinking
  assert.equal(blinkingConfirmed([rep('TOTAL_BLACKOUT', 0), rep('TOTAL_BLACKOUT', 30), rep('TOTAL_BLACKOUT', 60), rep('TOTAL_BLACKOUT', 90)], T0 + 90000), false);
});

test('daylight and out-of-schedule are never faults', () => {
  const d = cls('DAYLIGHT_STANDBY');
  assert.equal(d.label, 'DAYLIGHT STANDBY');
  assert.equal(d.dashboardStatus, 'ONLINE');
  const s = cls('STANDBY');
  assert.equal(s.dashboardStatus, 'ONLINE');
  assert.notEqual(d.tone, 'red');
});

test('a saturated 65535 lux packet is accepted and shown as daylight, not as a fault', () => {
  const v = validate({ nodeId: 3, seq: 1, type: 'BEAT', status: 'DAYLIGHT_STANDBY', lux: 65535 });
  assert.equal(v.ok, true);
  ingest(v.packet, T0);
  const lamp = snapshot(T0 + 1000).lamps[0];
  assert.equal(lamp.lux, 65535);
  assert.equal(lamp.health.key, 'DAYLIGHT');
  assert.equal(lamp.health.dashboardStatus, 'ONLINE');
});

test('a dead light sensor is its own state and is not a lamp failure; its lux is "no reading", not zero', () => {
  const v = validate({ nodeId: 2, seq: 1, type: 'BEAT', status: 'SENSOR_ERROR', lux: 0 });
  ingest(v.packet, T0);
  const lamp = snapshot(T0 + 1000).lamps[0];
  assert.equal(lamp.lux, null);
  assert.equal(lamp.health.key, 'SENSOR_ERROR');
  assert.notEqual(lamp.health.label, 'FAULT');
  assert.equal(lamp.health.lampKnown, false);
  assert.match(lamp.health.long, /does not mean the lamp has failed/);
});

test('missing telemetry is OFFLINE / unknown, never "0 lux" and never a lamp fault', () => {
  ingest(validate({ nodeId: 1, seq: 1, type: 'BEAT', status: 'NORMAL_LIT', lux: 300 }).packet, T0);
  const late = snapshot(T0 + 10 * 60 * 1000).lamps[0];
  assert.equal(late.link, 'OFFLINE');
  assert.equal(late.health.key, 'OFFLINE');
  assert.equal(late.health.dashboardStatus, 'OFFLINE');
  assert.equal(late.health.lampKnown, false);
  assert.match(late.health.long, /never counted as 0 lux/);
  assert.equal(classifyLamp(null).key, 'NO_DATA');
});

test('a late (stale) report keeps the last condition and says it may be out of date', () => {
  ingest(validate({ nodeId: 1, seq: 1, type: 'BEAT', status: 'NORMAL_LIT', lux: 300 }).packet, T0);
  const l = snapshot(T0 + 70000).lamps[0];
  assert.equal(l.link, 'STALE');
  assert.equal(l.health.key, 'GOOD');
  assert.match(l.health.long, /little late/);
});

test('unknown firmware text is a warning, not an assumed hardware fault', () => {
  const h = cls('SOMETHING_NEW');
  assert.equal(h.key, 'UNKNOWN');
  assert.equal(h.dashboardStatus, 'WARNING');
});

test('end to end through the receiver: an unstable packet is BLINKING at once, and a near-limit lux gives WARNING', () => {
  const send = (seq, status, lux, at) => ingest(validate({ nodeId: 5, seq, type: 'ALRT', status, lux }).packet, at);
  send(1, 'NORMAL_LIT', 300, T0);
  send(2, 'BLINKING/UNSTABLE', 40, T0 + 5000);
  assert.equal(snapshot(T0 + 6000).lamps[0].health.key, 'BLINKING');
  send(3, 'BLINKING/UNSTABLE', 280, T0 + 10000);
  send(4, 'BLINKING/UNSTABLE', 20, T0 + 15000);
  assert.equal(snapshot(T0 + 16000).lamps[0].health.key, 'BLINKING');
  // a duplicate (retry) of the same packet is not counted twice
  send(4, 'BLINKING/UNSTABLE', 20, T0 + 16000);
  assert.equal(snapshot(T0 + 17000).lamps[0].health.key, 'BLINKING');
  // recovery
  send(5, 'NORMAL_LIT', 300, T0 + 20000);
  assert.equal(snapshot(T0 + 21000).lamps[0].health.key, 'GOOD');
  send(6, 'NORMAL_LIT', 90, T0 + 25000);
  assert.equal(snapshot(T0 + 26000).lamps[0].health.key, 'NEAR_LIMIT');
});

test('duplicate retries of one unstable packet are still just one report and show BLINKING', () => {
  const send = (seq, at) => ingest(validate({ nodeId: 6, seq, type: 'ALRT', status: 'BLINKING/UNSTABLE', lux: 30 }).packet, at);
  send(1, T0); send(1, T0 + 1000); send(1, T0 + 2000);
  assert.equal(snapshot(T0 + 3000).lamps[0].health.key, 'BLINKING');
});
