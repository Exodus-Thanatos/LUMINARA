import test from 'node:test';
import assert from 'node:assert/strict';
import { statusText, luxText, eventDot, EVENT_TYPE_LABEL } from './historyUi.js';

test('status changes use plain words; other events keep their own text', () => {
  assert.equal(statusText({ type: 'STATUS_CHANGE', next: 'GOOD' }, 'next'), 'Connected / good');
  assert.equal(statusText({ type: 'STATUS_CHANGE', next: 'SLEEPING' }, 'next'), 'Sleeping (daytime power saving)');
  assert.equal(statusText({ type: 'STATUS_CHANGE', previous: null }, 'previous'), 'None yet');
  assert.equal(statusText({ type: 'MAINTENANCE', next: 'IN PROGRESS' }, 'next'), 'IN PROGRESS');
  assert.equal(statusText({ type: 'SCHEDULE_CHANGE', next: 'ON 18:00 · OFF 05:30' }, 'next'), 'ON 18:00 · OFF 05:30');
  assert.equal(statusText({ type: 'STATUS_CHANGE', next: 'SOMETHING_NEW' }, 'next'), 'SOMETHING_NEW'); // unknown words are shown, not hidden
});

test('missing light is shown as "no reading", real zero is shown as 0 lux', () => {
  assert.equal(luxText(null), 'no reading');
  assert.equal(luxText(undefined), 'no reading');
  assert.equal(luxText(0), '0 lux');
  assert.equal(luxText(65535), '65535 lux');
  assert.equal(luxText(153.24), '153.2 lux');
});

test('faults are red, normal states are not, and every event type has a label', () => {
  assert.equal(eventDot({ type: 'STATUS_CHANGE', next: 'FAULT' }), 'bg-[#e04848]');
  assert.equal(eventDot({ type: 'STATUS_CHANGE', next: 'DAYLIGHT' }), 'bg-[#3b82f6]');
  assert.equal(eventDot({ type: 'STATUS_CHANGE', next: 'SLEEPING' }), 'bg-[#3b82f6]');
  assert.ok(['STATUS_CHANGE', 'MAINTENANCE', 'SCHEDULE_CHANGE'].every((k) => EVENT_TYPE_LABEL[k]));
});
