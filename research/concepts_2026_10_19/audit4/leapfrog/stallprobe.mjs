// Audit4: how close to CLmax does the leapfrog fly (point-mass model clamps CL at clmax; no stall/departure is modelled)?
// node stallprobe.mjs SIMCOPY_ROOT  → out_stallprobe.json. Numerical-uncalibrated simulation.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2];
if (!ROOT || ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('copy root');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const LF = await imp('sim/js/concepts/leapfrog/index.js');
const M = await imp('sim/js/concepts/leapfrog/model.js');
const FR = await imp('sim/js/concepts/common/fullrun.js');
const D = Object.fromEntries(LF.default.params.map((p) => [p.id, p.v]));
const P = { ...M.PDEF, ...D };
const mk = (U, seed) => ({ id: `tail${U}_s${seed}`, U, dir: 'tail', mean: [U, 0, 0], seed, intensity: U >= 6 ? 0.2 : 0.15 });
const ids = ['calm_s11', 'crossR6_s12', 'head9_s12', 'tail3_s12'];
const cs = [...FR.FULLRUN_CASES_R4.filter((c) => ids.includes(c.id)), mk(4.5, 12), mk(5.5, 11), mk(5.5, 12), mk(6, 11), mk(6.5, 11), mk(5.5, 15), mk(6, 15), mk(5.5, 16)];
const rows = [];
for (const c of cs) {
  const prep = { ...LF.fullrunInput(c, {}), fullrun: true, caseObj: c };
  const R = LF.buildResult(D, { id: c.id }, prep);
  const O = R.core.O, n = R.core.n;
  let air = 0, sat = 0, sat95 = 0, minRatio = Infinity, lowSpeed = 0;
  for (let i = 0; i < n; i++) {
    const ph = O.phase[i]; if (![1, 2].includes(ph)) continue; // launch/lead only (landing flare is intentionally post-stall)
    air++;
    const pc = M.morphCfg(P, O.morph[i] || 0);
    if (O.CL[i] >= pc.clmax - 1e-3) sat++;
    if (O.CL[i] >= 0.95 * pc.clmax) sat95++;
    const vs = M.aero(pc).vStall; const r = O.Va[i] / vs; minRatio = Math.min(minRatio, r); if (r < 1.1) lowSpeed++;
  }
  rows.push({ id: c.id, noFly: R.core.noFly, airS: +(air * 0.02).toFixed(1), clAtMaxPct: air ? +(100 * sat / air).toFixed(2) : null, clAbove95Pct: air ? +(100 * sat95 / air).toFixed(2) : null, minVaOverVstall: Number.isFinite(minRatio) ? +minRatio.toFixed(3) : null, below1p1Pct: air ? +(100 * lowSpeed / air).toFixed(2) : null });
  console.log(JSON.stringify(rows.at(-1)));
}
writeFileSync(join(here, 'out_stallprobe.json'), JSON.stringify({ note: 'launch+lead phases; CL clamp = model cannot stall', rows }, null, 1));
