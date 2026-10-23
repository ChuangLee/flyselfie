// audit2 cross-check: shared footageStability(R) (common/criteria.js) over ALL 39 full-run cases for kite2 and
// leapfrog, so the jitter column is computed on the same coverage for every concept (towglider and descentglider
// already have fs_all in their folders). Runs against COPIES only.
// Usage: node fs_all_k2_lf.mjs <k2copyRoot> <lfcopyRoot>
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [k2root, lfroot] = process.argv.slice(2);
if (!k2root || !lfroot || [k2root, lfroot].some((r) => r.startsWith('/root/ai-workspace/flySelfie'))) throw new Error('pass two copy roots (not the live repo)');
const imp = (root, p) => import(pathToFileURL(join(root, p)).href);
const pctl = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const out = { generated: new Date().toISOString().slice(0, 10), note: 'footageStability subject/background RMS (°/s), flown cases only; p90 over flown cases is the harmonised jitter statistic' };
for (const [id, root] of [['kite2', k2root], ['leapfrog', lfroot]]) {
  const C = (await imp(root, `sim/js/concepts/${id}/index.js`)).default;
  const { footageStability } = await imp(root, 'sim/js/concepts/common/criteria.js');
  const { FULLRUN_CASES } = await imp(root, 'sim/js/concepts/common/fullrun.js');
  const P = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
  const fr = C.scenarios.find((s) => s.id === 'fullrun');
  const rows = [];
  for (const c of FULLRUN_CASES) {
    const sc = id === 'kite2' ? { ...fr, wind: { mean: c.mean, intensity: c.intensity ?? 0.15, Lu: 28, seed: c.seed }, runSeed: c.seed } : { ...fr, caseId: c.id };
    const R = C.simulate(P, sc);
    const fs = footageStability(R);
    rows.push({ id: c.id, U: c.U, dir: c.dir, subjectRms: +fs.subjectRms.toFixed(3), backgroundRms: +fs.backgroundRms.toFixed(3), samples: fs.samples });
  }
  const fl = rows.filter((r) => Number.isFinite(r.subjectRms) && r.samples > 0);
  out[id] = { n: fl.length, subject: { p50: pctl(fl.map((r) => r.subjectRms), 0.5), p90: pctl(fl.map((r) => r.subjectRms), 0.9), max: Math.max(...fl.map((r) => r.subjectRms)) }, background: { p50: pctl(fl.map((r) => r.backgroundRms), 0.5), p90: pctl(fl.map((r) => r.backgroundRms), 0.9), max: Math.max(...fl.map((r) => r.backgroundRms)) }, over3: fl.filter((r) => r.subjectRms > 3).map((r) => r.id), rows };
  console.log(id, JSON.stringify({ n: out[id].n, subject: out[id].subject, background: out[id].background, over3: out[id].over3 }));
}
writeFileSync(join(here, 'fs_all_k2_lf_out.json'), JSON.stringify(out, null, 1));
