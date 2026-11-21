import test from 'node:test';
import assert from 'node:assert/strict';
import { fmt12 } from './scheduleFormat.js';

test('24-hour times become 12-hour times, including midnight and noon', () => {
  assert.equal(fmt12('18:00'), '06:00 PM');
  assert.equal(fmt12('05:30'), '05:30 AM');
  assert.equal(fmt12('00:15'), '12:15 AM');
  assert.equal(fmt12('12:00'), '12:00 PM');
  assert.equal(fmt12(undefined), '—');
  assert.equal(fmt12('7pm'), '—');
});
