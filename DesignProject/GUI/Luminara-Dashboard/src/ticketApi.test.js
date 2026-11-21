import test from 'node:test';
import assert from 'node:assert/strict';
import { toUiTicket, reportedAtFrom, request, ApiError, setUnauthorizedHandler } from './api.js';

test('server tickets get the report date the screens expect', () => {
  const ms = new Date('2026-10-20T12:00:00').getTime();
  assert.equal(toUiTicket({ id: 'MT-1', createdAt: ms }).reportDate, '2026-10-20');
});

test('report date: today keeps the real time, other days become noon', () => {
  const now = new Date('2026-11-07T15:30:00').getTime();
  assert.equal(reportedAtFrom('2026-11-07', now), now);
  assert.equal(reportedAtFrom('2026-11-05', now), new Date('2026-11-05T12:00:00').getTime());
});

test('api errors carry status, code and field messages; 401 triggers the sign-out handler', async () => {
  const real = globalThis.fetch;
  let signedOut = 0;
  setUnauthorizedHandler(() => { signedOut += 1; });
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ code: 'validation', error: 'Please correct the highlighted fields.', fields: { email: 'bad' } }) });
  await assert.rejects(request('POST', '/api/users', {}), (e) => e instanceof ApiError && e.fields.email === 'bad' && e.status === 400);
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ code: 'unauthenticated', error: 'Please sign in.' }) });
  await assert.rejects(request('GET', '/api/tickets'));
  assert.equal(signedOut, 1);
  await assert.rejects(request('GET', '/api/auth/me', undefined, { silent401: true }));
  assert.equal(signedOut, 1);
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(request('GET', '/x'), (e) => e.code === 'network');
  globalThis.fetch = real;
});
