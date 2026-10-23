// Audit2: shared footageStability(R) (common/criteria.js) on every flown case of the 39-case ensemble, plus
// near-miss gates (developer's own headMin ≥1.5 m and landMinRider ≥2.5 m) aggregated over the flown cases.
// Usage: node fs_all.mjs [copyRoot]; writes fs_all_out.json. Numerical-uncalibrated, not a physical test.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as presolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = presolve(process.argv[2] || process.env.DG_COPY || '/tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/dgcopy');
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const concept = (await imp('sim/js/concepts/descentglider/index.js')).default;
const { footageStability } = await imp('sim/js/concepts/common/criteria.js');
const { pct } = await imp('sim/js/concepts/common/fullrun.js');
const res = JSON.parse(readFileSync(join(root, 'research/concepts_2026_10_19/dev/descentglider/results.json'), 'utf8'));
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const rows = [];
for (const c of res.ensemble.cases) {
  if (c.noFly && !(c.avail > 0)) { rows.push({ id: c.id, noFly: true }); continue; }
  const R = concept.simulate(P, { id: 'a', kind: 'fullrun', fr: c.id, zh: '', en: '', expect: { zh: '', en: '' } });
  const f = footageStability(R);
  rows.push({ id: c.id, subjectRms: r2(f.subjectRms), backgroundRms: r2(f.backgroundRms), devJitter: c.jitter, headMin: c.headMin, landMinRider: c.landMinRider, crashed: c.crashed });
  console.log(c.id, r2(f.subjectRms), r2(f.backgroundRms), c.jitter);
}
const fl = rows.filter((x) => !x.noFly && Number.isFinite(x.subjectRms));
const s = fl.map((x) => x.subjectRms), b = fl.map((x) => x.backgroundRms);
const out = { flown: fl.length, subject: { p50: pct(s, 0.5), p90: pct(s, 0.9), max: Math.max(...s) }, background: { p50: pct(b, 0.5), p90: pct(b, 0.9), max: Math.max(...b) },
  headMinBelow1_5: rows.filter((x) => x.headMin != null && x.headMin < 1.5).map((x) => [x.id, x.headMin]),
  landMinBelow2_5: rows.filter((x) => x.landMinRider != null && x.landMinRider < 2.5).map((x) => [x.id, x.landMinRider]), rows };
writeFileSync(join(here, 'fs_all_out.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, rows: undefined }));
