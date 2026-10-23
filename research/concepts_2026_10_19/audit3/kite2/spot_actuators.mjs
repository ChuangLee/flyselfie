// Audit3 kite2 spot check: winch reel-in (motoring) demand vs the model's own motor constants, artefact (art) distribution,
// and boom-related artefact share. Usage: node spot_actuators.mjs SIMCOPY_ROOT. Numerical uncalibrated simulation.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2];
if (!ROOT || ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('pass a COPY root');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const K2 = await imp('sim/js/concepts/kite2/index.js');
const FR = await imp('sim/js/concepts/common/fullrun.js');
const M = await imp('sim/js/concepts/kite2/model.js');
const concept = K2.default;
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r3 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : v);
const out = {};
for (const id of ['calm_s11', 'crossL9_s12', 'tail9_s11', 'head9_s12']) {
  const c = FR.FULLRUN_CASES.find((x) => x.id === id);
  const res = {};
  for (const [nm, over] of [['default', {}], ['noBoomArtefact_boomDiam0', { boomDBase: 0.0001, boomDTip: 0.0001 }]]) {
    const sc = { ...K2.SCEN.find((x) => x.id === 'fullrun'), runSeed: c.seed, dt: 0.002, wind: { mean: c.mean, intensity: c.intensity ?? 0.15, Lu: 28, seed: c.seed }, plan: { start: 'docked', armAt: 0 } };
    const prep = K2.prepare({ ...P, ...over }, sc);
    const R = K2.buildResult({ ...P, ...over }, sc, prep);
    const O = R.core.O, A = R.analysis, p = R.core.p, n = R.core.n;
    const arts = [], artW = []; let reelInMax = 0, PmotMax = 0, FmAtReel = 0;
    for (let i = 0; i < n; i++) {
      if (A.filming[i] === 1 && Number.isFinite(A.art[i])) { arts.push(A.art[i]); artW.push(A.artW[i]); }
      const nu = O.nu[i], Fm = O.Fm[i];
      if (Number.isFinite(nu) && nu < 0 && Fm > 0.5) { if (-nu > reelInMax) { reelInMax = -nu; FmAtReel = Fm; } PmotMax = Math.max(PmotMax, -Fm * nu); }
    }
    arts.sort((a, b) => a - b); artW.sort((a, b) => a - b);
    const q = (a, x) => a[Math.min(a.length - 1, Math.round(x * (a.length - 1)))];
    res[nm] = { avail: r3(R.judge.avail * 100), artP50: r3(q(arts, 0.5)), artP90: r3(q(arts, 0.9)), shareArtGt0: r3(100 * arts.filter((x) => x > 0).length / arts.length), shareArtGe3: r3(100 * arts.filter((x) => x >= 3).length / arts.length), artWidthPxP50: r3(q(artW, 0.5)),
      reelInUnderLoadMax_m_s: r3(reelInMax), tensionAtThat_N: r3(FmAtReel), motoringPowerMax_W: r3(PmotMax),
      motorSpeedNeeded_rad_s: r3(reelInMax * p.gear / p.rDrum), backEmf_V: r3(reelInMax * p.gear / p.rDrum * p.Kt), maxLineSpeedAt11V1: r3(11.1 / p.Kt * p.rDrum / p.gear), maxLineSpeedAt22V2: r3(22.2 / p.Kt * p.rDrum / p.gear) };
  }
  out[id] = res; console.log(id, JSON.stringify(res));
}
writeFileSync(join(here, 'out_spot_actuators.json'), JSON.stringify({ generated: new Date().toISOString(), modelVersion: concept.modelVersion, cases: out }, null, 1));
