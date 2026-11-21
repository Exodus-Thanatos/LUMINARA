import test from 'node:test';
import assert from 'node:assert/strict';
import { can, PERMISSIONS, ROLES } from './permissions.js';

test('administrators can do everything listed', () => {
  for (const p of Object.keys(PERMISSIONS).filter((k) => !['maintenance.updateOwn', 'maintenance.viewAssigned', 'basic.dashboard'].includes(k))) assert.equal(can('ADMIN', p), true, p); // updateOwn is the technician's own-ticket right, viewAssigned / basic.dashboard belong to the BASIC role; admins edit everything through maintenance.edit
});

test('every permission names only real roles, and unknown roles/permissions get nothing', () => {
  for (const [p, roles] of Object.entries(PERMISSIONS)) for (const r of roles) assert.ok(ROLES.includes(r), `${p}: ${r}`);
  assert.equal(can('HACKER', 'users.manage'), false);
  assert.equal(can('ADMIN', 'does.not.exist'), false);
  assert.equal(can(undefined, 'dashboard.view'), false);
});

test('staff and technicians cannot manage users, archive, restore or import', () => {
  for (const role of ['STAFF', 'TECHNICIAN']) {
    for (const p of ['users.manage', 'maintenance.create', 'maintenance.edit', 'maintenance.archive', 'maintenance.viewArchive', 'maintenance.restore', 'maintenance.import', 'settings.admin']) assert.equal(can(role, p), false, `${role} ${p}`);
  }
  assert.equal(can('TECHNICIAN', 'maintenance.updateOwn'), true);
  assert.equal(can('STAFF', 'maintenance.updateOwn'), false);
  assert.equal(can('STAFF', 'controls.operate'), false);
  assert.equal(can('TECHNICIAN', 'controls.operate'), true);
});
