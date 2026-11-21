import test from 'node:test';
import assert from 'node:assert/strict';
import { HELP_SECTIONS, searchHelp, sectionById } from './helpContent.js';

test('the ten original manual sections and the three new ones exist with unique ids', () => {
  const ids = HELP_SECTIONS.map((s) => s.id);
  assert.equal(ids.length, 13);
  assert.equal(new Set(ids).size, 13);
  for (const id of ['overview', 'getting-started', 'dashboard', 'monitoring', 'map', 'pzem', 'controls', 'maintenance', 'settings', 'troubleshooting', 'status-legend', 'faults', 'priorities']) assert.ok(ids.includes(id), id);
  for (const s of HELP_SECTIONS) assert.ok(s.title && s.summary && s.blocks.length);
});

test('the manual describes the implemented Dashboard: map inside it, no Map tab, voltage always visible', () => {
  const all = JSON.stringify(HELP_SECTIONS);
  assert.match(all, /there is no separate Map page/);
  assert.doesNotMatch(all, /Open Streetlight Map in the sidebar/);
  assert.doesNotMatch(all, /Select the Voltage card on the Dashboard to expand/);
  assert.match(sectionById('pzem').blocks[0].text, /always visible/);
});

test('the status legend and fault guide are generated from the same model the app uses', () => {
  const legend = sectionById('status-legend').blocks.find((b) => b.title === 'Statuses').items.map((i) => i[0]);
  assert.deepEqual(legend, ['Online', 'Offline', 'Fault', 'Warning', 'No Data', 'No Device']);
  const auto = sectionById('faults').blocks.find((b) => b.title === 'Detected automatically').items.map((i) => i[0]);
  assert.ok(auto.includes('Lamp Failure') && auto.includes('Communication Failure'));
  const manual = sectionById('faults').blocks.find((b) => b.title === 'Not detected automatically').items.map((i) => i[0]).join(' ');
  assert.match(manual, /Power Failure \(Manual inspection\)/);
  assert.match(manual, /Voltage Abnormality \(Needs backend\)/);
  assert.ok(!auto.some((n) => /Voltage|Power Failure|Intermittent|Relay/.test(n)), 'unsupported faults are not claimed as automatic');
});

test('the priority legend uses P1 to P4', () => {
  const p = sectionById('priorities').blocks[0].items.map((i) => i[0]);
  assert.deepEqual(p, ['P1 – Emergency', 'P2 – Urgent', 'P3 – Normal', 'P4 – Planned']);
});

test('search finds articles and returns nothing for gibberish or an empty query', () => {
  assert.ok(searchHelp('voltage').some((r) => r.section.id === 'pzem'));
  assert.ok(searchHelp('offline').some((r) => r.section.id === 'troubleshooting'));
  assert.deepEqual(searchHelp('zzzqqq'), []);
  assert.deepEqual(searchHelp('   '), []);
  assert.equal(sectionById('nope'), null);
});
