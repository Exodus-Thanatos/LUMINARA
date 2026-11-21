// Node sleep control: dashboard sets AUTO / MANUAL / "sleep now"; the LoRa master polls it with the device key.
// Proves the HTTP side only (not LoRa or the ESP32).
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DEVICE_KEY = 'test-key';
const { server, resetForTests } = await import('./server.js');

let base;
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => resetForTests());

const get = () => fetch(`${base}/api/sleep`).then((r) => r.json());
const set = (body) => fetch(`${base}/api/sleep`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const poll = (applied, key = 'test-key') =>
  fetch(`${base}/api/sleep/poll${applied ? `?applied=${applied}` : ''}`, { headers: key === null ? {} : { 'X-Api-Key': key } });

test('fresh server: nothing chosen, master never seen', async () => {
  const v = await get();
  assert.equal(v.want, null);
  assert.equal(v.applied, null);
  assert.equal(v.masterOnline, false);
  assert.equal(v.pending, false);
  assert.equal(v.sleepNowSeq, 0);
  const p = await (await poll()).json();
  assert.deepEqual(p, { autoSleep: null, sleepNowSeq: 0 }); // null = master keeps its own saved setting
});

test('MANUAL then AUTO: the master sees the choice and the dashboard shows pending until it confirms', async () => {
  let r = await set({ autoSleep: false });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).pending, true);
  assert.equal((await (await poll()).json()).autoSleep, false);
  let v = await get();
  assert.equal(v.pending, true); // master has not confirmed yet
  await poll('manual');
  v = await get();
  assert.equal(v.applied, false);
  assert.equal(v.pending, false);
  assert.equal(v.masterOnline, true);
  await set({ autoSleep: true });
  assert.equal((await (await poll('manual')).json()).autoSleep, true);
  await poll('auto');
  assert.equal((await get()).applied, true);
});

test('sleep now only ever raises the counter, and does not change the AUTO/MANUAL choice', async () => {
  await set({ autoSleep: false });
  await set({ sleepNow: true });
  await set({ sleepNow: true });
  const p = await (await poll()).json();
  assert.equal(p.sleepNowSeq, 2);
  assert.equal(p.autoSleep, false);
  assert.ok((await get()).sleepNowAt > 0);
});

test('bad input is rejected and changes nothing', async () => {
  for (const body of [{}, { autoSleep: 'yes' }, { sleepNow: false }, { sleepNow: 1 }, []]) {
    const r = await set(body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  const bad = await fetch(`${base}/api/sleep`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
  const v = await get();
  assert.equal(v.want, null);
  assert.equal(v.sleepNowSeq, 0);
});

test('the master poll needs the device key', async () => {
  assert.equal((await poll('auto', null)).status, 401);
  assert.equal((await poll('auto', 'wrong')).status, 401);
  assert.equal((await get()).applied, null); // a rejected poll must not record anything
});
