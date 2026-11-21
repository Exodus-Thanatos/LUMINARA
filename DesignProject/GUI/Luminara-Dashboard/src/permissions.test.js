import test from 'node:test';
import assert from 'node:assert/strict';
import { can, PERMISSIONS } from '../server/permissions.js';
import { screenAllowed } from './access.js';

test('screens follow the same permission table the server enforces', () => {
  assert.equal(screenAllowed('users', 'ADMIN'), true);
  assert.equal(screenAllowed('users', 'STAFF'), false);
  assert.equal(screenAllowed('users', 'TECHNICIAN'), false);
  for (const role of ['ADMIN', 'TECHNICIAN', 'STAFF']) for (const s of ['dashboard', 'monitoring', 'map', 'maintenance', 'controls', 'settings', 'help', 'manual']) assert.equal(screenAllowed(s, role), true, `${role} ${s}`);
  assert.equal(screenAllowed('users', undefined), false);
  assert.equal(screenAllowed('dashboard', 'BASIC'), true);
  assert.equal(screenAllowed('controls', 'BASIC'), false);
  assert.ok(PERMISSIONS['users.manage'] && can('ADMIN', 'users.manage'));
});
