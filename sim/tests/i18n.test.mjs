import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS, PARAM_TEXT, SCENARIO_TEXT, EVENT_TEXT } from '../js/i18n.js';
import { PARAMS } from '../js/model/config.js';
import { SCENARIOS } from '../js/model/scenarios.js';
import { DEMO_STAGES } from '../js/ui/demo.js';

test('zh and en define the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.zh).sort(), Object.keys(STRINGS.en).sort());
});

test('every data-i18n key in index.html exists', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [, k] of html.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(k in STRINGS.zh, k);
});

test('every parameter, scenario and solver event has bilingual text', () => {
  for (const p of PARAMS) assert.equal(PARAM_TEXT[p.id]?.length, 2, p.id);
  for (const s of SCENARIOS) assert.equal(SCENARIO_TEXT[s.id]?.length, 2, s.id);
  const solver = readFileSync(new URL('../js/model/solver.js', import.meta.url), 'utf8');
  const types = new Set([...solver.matchAll(/emit\(t, '([a-z_]+)'/g)].map((m) => m[1]));
  types.delete('reel_');
  for (const m of ['hold', 'payout', 'retrieve', 'jam']) types.add('reel_' + m);
  types.add('peak_tension'); types.add('prerun_unsettled');
  for (const ty of types) assert.equal(EVENT_TEXT[ty]?.length, 2, ty);
  for (const st of DEMO_STAGES) assert.ok(st.zh && st.en, st.key);
});
