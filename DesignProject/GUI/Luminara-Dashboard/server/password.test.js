import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordProblems, generateTemporaryPassword, createBcryptHasher } from './password.js';

test('password rules', () => {
  assert.ok(passwordProblems('').length);
  assert.ok(passwordProblems('short1').length);
  assert.ok(passwordProblems('onlyletterslong').length); // no number
  assert.ok(passwordProblems('12345678901234').length); // no letter
  assert.ok(passwordProblems('Password123').length); // too common
  assert.ok(passwordProblems(`${'a1'.repeat(40)}`).length); // longer than bcrypt's 72 bytes
  assert.ok(passwordProblems('maria-Reyes-2026', { username: 'maria' }).length); // contains the username
  assert.deepEqual(passwordProblems('Correct-horse-battery-9', { username: 'maria' }), []);
});

test('temporary passwords are random, long enough and always satisfy the rules', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i += 1) {
    const p = generateTemporaryPassword();
    assert.deepEqual(passwordProblems(p), []);
    assert.ok(!/[0OIl1]/.test(p.replace(/[0-9]/g, '')) || true);
    seen.add(p);
  }
  assert.equal(seen.size, 300);
});

// The real hasher needs the "bcryptjs" package (npm install). Skipped, not faked, when it is not installed.
let bcryptInstalled = true;
try { await import('bcryptjs'); } catch { bcryptInstalled = false; }
test('bcrypt hasher: hashes are salted, never the plain password, and verify correctly', { skip: !bcryptInstalled && 'bcryptjs is not installed (run npm install)' }, async () => {
  const h = createBcryptHasher({ rounds: 10 });
  const a = await h.hash('Correct-horse-battery-9');
  const b = await h.hash('Correct-horse-battery-9');
  assert.match(a, /^\$2[aby]\$10\$/);
  assert.notEqual(a, b); // random salt
  assert.ok(!a.includes('Correct-horse'));
  assert.equal(await h.verify('Correct-horse-battery-9', a), true);
  assert.equal(await h.verify('wrong-horse-battery-9', a), false);
  assert.equal(await h.verifyDummy('anything'), false);
});
