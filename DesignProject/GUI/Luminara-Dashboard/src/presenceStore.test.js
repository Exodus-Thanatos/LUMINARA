import test from 'node:test';
import assert from 'node:assert/strict';
import { technicianUsers, presenceFromUsers, loadPresence, savePresence } from './presenceStore.js';
import { setPresence, isEligible } from './technicianStore.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('database technicians become users the availability rules understand', () => {
  const users = technicianUsers([{ id: '7', fullName: 'Tomas Tech' }], {});
  assert.deepEqual(users[0], { id: '7', name: 'Tomas Tech', role: 'TECHNICIAN', presentOn: null, presenceUpdatedAt: null });
  assert.ok(isEligible(users[0]));
});

test('on-duty flags are remembered per technician id in this browser', () => {
  const s = mem();
  const users = technicianUsers([{ id: '7', fullName: 'Tomas Tech' }, { id: '8', fullName: 'Tina Tech' }], loadPresence(s));
  const next = setPresence(users, '7', true, new Date('2026-11-07T08:00:00').getTime());
  assert.equal(savePresence(presenceFromUsers(next), s), true);
  const again = technicianUsers([{ id: '7', fullName: 'Tomas Tech' }, { id: '8', fullName: 'Tina Tech' }], loadPresence(s));
  assert.equal(again[0].presentOn, '2026-11-07');
  assert.equal(again[1].presentOn, null);
  assert.deepEqual(loadPresence({ getItem: () => 'not json' }), {});
});
