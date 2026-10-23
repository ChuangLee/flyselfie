// Cross-concept matrix (SIM-030): every scenario of every concept × the 11
// harmonised metrics (common/criteria.js). Run from repo root:
//   node research/concepts_2026_10_18/summary/build_matrix.mjs
import { writeFileSync } from 'node:fs';
import { CONCEPTS } from '../../../sim/js/concepts/index.js';
import { CRITERIA, footageStability } from '../../../sim/js/concepts/common/criteria.js';

const ids = Object.keys(CRITERIA);
const out = { generated: new Date().toISOString(), evidence: 'numerical-uncalibrated simulation; not physical tests', criteria: CRITERIA, concepts: [] };
for (const c of CONCEPTS) {
  const p = Object.fromEntries(c.params.map((x) => [x.id, x.v]));
  const rows = [];
  for (const sc of c.scenarios) {
    const t0 = Date.now();
    const R = c.simulate(p, sc);
    const m = {};
    for (const x of R.metrics) if (ids.includes(x.id)) m[x.id] = { v: x.value, pass: x.pass };
    const fails = ids.filter((k) => m[k] && m[k].pass === false);
    const fsx = footageStability(R);
    m.xSubject = { v: fsx.subjectRms, pass: Number.isFinite(fsx.subjectRms) ? fsx.subjectRms <= 3 : null };
    m.xBackground = { v: fsx.backgroundRms, pass: Number.isFinite(fsx.backgroundRms) ? fsx.backgroundRms <= 3 : null };
    rows.push({ scenario: sc.id, zh: sc.zh, en: sc.en, ms: Date.now() - t0, metrics: m, fails, invalidEvents: R.events.filter((e) => e.severity === 'invalid').length, validUntil: R.validUntil });
  }
  out.concepts.push({ id: c.id, name: c.name, modelVersion: c.modelVersion, rows });
}
writeFileSync(new URL('./matrix.json', import.meta.url), JSON.stringify(out, null, 1));
for (const c of out.concepts) {
  console.log(`\n== ${c.id} (${c.modelVersion})`);
  for (const r of c.rows) console.log(`${r.scenario.padEnd(22)} indep. subject ${(r.metrics.xSubject.v ?? NaN).toFixed(1)} bg ${(r.metrics.xBackground.v ?? NaN).toFixed(1)} °/s | fails: ${r.fails.map((k) => `${k}=${typeof r.metrics[k].v === 'number' ? r.metrics[k].v.toFixed(1) : r.metrics[k].v}`).join(', ') || '—'}`);
}
