import test from 'node:test';
import assert from 'node:assert/strict';
import { isDevShortcut } from './devShortcut.js';

test('Ctrl+Shift+D and Cmd+Shift+D open the developer form, in either letter case', () => {
  assert.equal(isDevShortcut({ ctrlKey: true, shiftKey: true, key: 'D' }), true);
  assert.equal(isDevShortcut({ ctrlKey: true, shiftKey: true, key: 'd' }), true);
  assert.equal(isDevShortcut({ metaKey: true, shiftKey: true, key: 'D' }), true);
});
test('other key combinations do nothing', () => {
  assert.equal(isDevShortcut({ ctrlKey: true, key: 'd' }), false);
  assert.equal(isDevShortcut({ shiftKey: true, key: 'D' }), false);
  assert.equal(isDevShortcut({ ctrlKey: true, shiftKey: true, key: 'E' }), false);
  assert.equal(isDevShortcut({ ctrlKey: true, shiftKey: true, altKey: true, key: 'D' }), false);
  assert.equal(isDevShortcut(null), false);
});
