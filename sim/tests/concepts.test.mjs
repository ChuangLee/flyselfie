// Concept-lab contract tests (SIM-030): every registered concept must simulate
// deterministically in Node, follow the Result/FrameState schema and report
// finite metrics. Code verification only — not validation of any concept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONCEPTS } from '../js/concepts/index.js';
import { simulateSkier } from '../js/concepts/common/skier.js';

const defaults = (c) => Object.fromEntries(c.params.map((p) => [p.id, p.v]));
const fin3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

test('shared skier model stays on the piste corridor and below 1.5 g in nominal carving', () => {
  const sk = simulateSkier({ duration: 40 });
  let ymax = 0, latmax = 0;
  for (let i = 0; i < sk.n; i++) { ymax = Math.max(ymax, Math.abs(sk.col.y[i])); latmax = Math.max(latmax, Math.abs(sk.col.lat[i])); }
  assert.ok(ymax < 20, `ymax ${ymax}`);
  assert.ok(latmax < 1.5 * 9.81, `lat ${latmax}`);
});

for (const c of CONCEPTS) {
  test(`concept ${c.id}: schema, determinism and frames`, () => {
    assert.ok(c.name?.zh && c.name?.en && c.modelVersion && c.scenarios.length && c.demo?.stages?.length);
    for (const p of c.params) assert.ok(p.v >= p.min && p.v <= p.max && ['CALC', 'LIT', 'ASSUMED'].includes(p.src), p.id);
    for (const sc of c.scenarios) {
      const a = c.simulate(defaults(c), sc), b = c.simulate(defaults(c), sc);
      assert.equal(a.n, a.columns.t.length);
      for (const k of Object.keys(a.columns)) assert.deepEqual(Array.from(a.columns[k]).map(String), Array.from(b.columns[k]).map(String), `${sc.id}.${k} not deterministic`);
      assert.ok(a.metrics.length > 0, `${sc.id} metrics`);
      for (const m of a.metrics) assert.ok(typeof m.value === 'string' || Number.isFinite(m.value), `${sc.id}.${m.id} = ${m.value}`);
      for (const tt of [0, a.duration / 2, a.duration]) {
        const f = a.frame(tt);
        assert.ok(fin3(f.skier.pos) && fin3(f.skier.heading), `${sc.id} frame skier @${tt}`);
        if (f.productCam) assert.ok(fin3(f.productCam.pos) && fin3(f.productCam.fwd), `${sc.id} productCam @${tt}`);
      }
    }
    const d = c.demo.build(defaults(c));
    assert.ok(Math.abs(d.duration - c.demo.duration) < 0.05);
    const st = c.demo.stages;
    for (let i = 1; i < st.length; i++) assert.equal(st[i].t0, st[i - 1].t1, 'demo stages contiguous');
    for (const s of st) assert.ok(s.zh && s.en, s.key);
  });
}
