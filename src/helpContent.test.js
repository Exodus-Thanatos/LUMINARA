import test from 'node:test';
import assert from 'node:assert/strict';
import { HELP_SECTIONS, searchHelp, sectionById } from './helpContent.js';

test('all ten required manual sections exist with unique ids', () => {
  const ids = HELP_SECTIONS.map((s) => s.id);
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10);
  for (const s of HELP_SECTIONS) assert.ok(s.title && s.summary && s.blocks.length);
});

test('search finds articles and returns nothing for gibberish or an empty query', () => {
  assert.ok(searchHelp('voltage').some((r) => r.section.id === 'pzem'));
  assert.ok(searchHelp('offline').some((r) => r.section.id === 'troubleshooting'));
  assert.deepEqual(searchHelp('zzzqqq'), []);
  assert.deepEqual(searchHelp('   '), []);
  assert.equal(sectionById('nope'), null);
});
