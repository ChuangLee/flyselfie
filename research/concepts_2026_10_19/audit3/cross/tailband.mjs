// audit3 cross check: off-grid tailwind band 3–5.5 m/s (the 39-case grid has nothing between 3 and 6 m/s,
// where the wind gates sit). Runs kite2 and leapfrog with the same seeds; towglider was done in
// audit3/towglider/out_tail_edge*.json. Run against a COPY of sim/: node tailband.mjs COPYROOT kite2|leapfrog
// Numerical uncalibrated simulation; not physical verification.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2], WHO = process.argv[3];
if (!ROOT || ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('pass a COPY root');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v);
const cases = [];
for (const U of [3.5, 4, 4.5, 5, 5.5]) for (const seed of [11, 12, 13]) cases.push({ id: `tail${U}_s${seed}`, U, dir: 'tail', mean: [U, 0, 0], seed, intensity: U >= 6 ? 0.2 : 0.15 });
const rows = [];
if (WHO === 'kite2') {
  const K2 = await imp('sim/js/concepts/kite2/index.js');
  const P = Object.fromEntries(K2.default.params.map((p) => [p.id, p.v]));
  for (const c of cases) { const r = K2.evaluateCase(P, c); rows.push({ id: c.id, avail: r3(r.avail), keMax: r3(r.keMax), headClear: r3(r.headClear), ops: r.ops, setup: r3(r.setupTime), F50: r3(r.bodyForcePeak), jit: r3(r.jitterRms), launches: r.launches }); console.log(JSON.stringify(rows.at(-1))); }
} else {
  const LF = await imp('sim/js/concepts/leapfrog/index.js');
  const D = Object.fromEntries(LF.default.params.map((p) => [p.id, p.v]));
  for (const c of cases) {
    const prep = { ...LF.fullrunInput(c, {}), fullrun: true, caseObj: c };
    const R = LF.buildResult(D, { id: `tb_${c.id}` }, prep);
    const g = (id) => { const m = R.metrics.find((x) => x.id === id); return m ? m.value : null; };
    rows.push({ id: c.id, avail: r3(g('avail')), keMax: r3(g('keMax')), headClear: r3(g('headClear')), ops: g('ops'), setup: r3(g('setupTime')) });
    console.log(JSON.stringify(rows.at(-1)));
  }
}
writeFileSync(join(here, `out_tailband_${WHO}.json`), JSON.stringify({ generated: new Date().toISOString(), who: WHO, note: 'avail here is the concept-reported per-case value (dev mask), used only to see the trend; keMax/headClear are the safety screens', rows }, null, 1));
