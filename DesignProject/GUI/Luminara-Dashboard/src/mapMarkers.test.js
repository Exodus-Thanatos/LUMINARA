import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, KEY_OF, esc, deriveLamp, markerHtml, tipHtml } from './mapMarkers.js';

const rec = (lamp, dev) => ({ streetlightId: lamp.streetlightId, deviceId: lamp.deviceId, ...deriveLamp(lamp, dev ? { [lamp.deviceId]: dev } : {}) });

test('every status has its own marker shape, not only a colour', () => {
  const svg = (k) => markerHtml(k, false, false);
  assert.match(svg('FAULT'), /<polygon points="16,3 29,16 16,29 3,16"/); // diamond
  assert.match(svg('WARNING'), /<polygon points="16,4 29,27 3,27"/); // triangle
  assert.match(svg('NO_DEVICE'), /stroke-dasharray/); // dashed empty ring
  assert.match(svg('ACTIVE'), /✓/);
  assert.match(svg('OFFLINE'), /–/);
  assert.match(svg('NO_DATA'), /\?/);
  assert.equal(new Set(['ACTIVE', 'WARNING', 'FAULT', 'OFFLINE', 'NO_DATA', 'NO_DEVICE'].map(svg)).size, 6);
  assert.deepEqual(Object.keys(STATUS).sort(), Object.values(KEY_OF).sort());
});

test('a registry row joins its live device through the one status model', () => {
  const lamp = { streetlightId: 'L-003', deviceId: 'L-003', streetName: 'Main Road' };
  const fault = deriveLamp(lamp, { 'L-003': { id: 'L-003', status: 'FAULT', reported: 'TOTAL_BLACKOUT', comm: 'Online', time: '10:42' } });
  assert.equal(fault.key, 'FAULT');
  assert.equal(fault.cls.faultType, 'LAMP_FAILURE');
  assert.equal(fault.comm, 'Online'); // connected, but the lamp failed
  const off = deriveLamp(lamp, { 'L-003': { id: 'L-003', status: 'OFFLINE', reported: 'TOTAL_BLACKOUT' } });
  assert.equal(off.key, 'OFFLINE');
  assert.match(off.op, /^Unknown/); // offline is never reported as a lamp failure
  assert.equal(deriveLamp(lamp, { 'L-003': { id: 'L-003', status: 'NO DATA' } }).key, 'NO_DATA');
});

test('no device, and a node that has not reported yet, are never counted as offline', () => {
  assert.equal(deriveLamp({ streetlightId: 'NL-001', deviceId: '' }, {}).key, 'NO_DEVICE');
  const pending = deriveLamp({ streetlightId: 'L-009', deviceId: 'L-009' }, {});
  assert.equal(pending.key, 'NO_DEVICE');
  assert.equal(pending.pending, true);
});

test('the hover preview shows only real data and says No Data otherwise', () => {
  const lamp = { streetlightId: 'L-003', deviceId: 'L-003', streetName: 'Main Road' };
  const live = rec(lamp, { id: 'L-003', status: 'FAULT', reported: 'TOTAL_BLACKOUT', comm: 'Online', lux: 0.8, time: '10:42:08 AM' });
  const html = tipHtml({ ...live, location: 'Main Road' });
  assert.match(html, /L-003/);
  assert.match(html, /Lamp Failure/);
  assert.match(html, /10:42:08 AM/);
  assert.match(html, /0\.8 lx/);
  assert.match(html, /Voltage<\/span><b[^>]*>No Data/); // lamp nodes do not measure voltage
  const noLux = tipHtml({ ...rec(lamp, { id: 'L-003', status: 'ONLINE', comm: 'Online', time: '10:42' }), location: 'Main Road' });
  assert.match(noLux, /Light level<\/span><b[^>]*>No Data/);
  const none = tipHtml({ ...deriveLamp({ streetlightId: 'NL-002', deviceId: '' }, {}), streetlightId: 'NL-002', location: 'Park' });
  assert.match(none, /No Device Installed/);
  assert.doesNotMatch(none, /Voltage/);
});

test('imported street names cannot inject HTML into the preview', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  const lamp = { streetlightId: 'L-001', deviceId: 'L-001', streetName: '<script>alert(1)</script>' };
  const html = tipHtml({ ...rec(lamp, { id: 'L-001', status: 'ONLINE', comm: 'Online' }), location: lamp.streetName });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});
