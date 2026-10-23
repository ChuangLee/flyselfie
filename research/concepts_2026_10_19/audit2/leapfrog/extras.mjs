// audit2 extras for leapfrog@2.0.0 (run on a COPY): launch-gate bypass (what if the gate misjudges the wind),
// mass +10 % with the KE cap re-derived, noisy launch gate (2 s handheld pitot instead of the 10 s true-field mean),
// lift-heater energy accounting. Usage: node extras.mjs <copyRoot>. Numerical-uncalibrated; not a physical test.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || process.env.LF_COPY;
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const L = await imp('sim/js/concepts/leapfrog/index.js');
const { FULLRUN_CASES } = await imp('sim/js/concepts/common/fullrun.js');
const { enduranceMin, keSpeedCap, BATTERY } = await imp('sim/js/concepts/common/components.js');
const { makeWind } = await imp('sim/js/concepts/common/env.js');
const concept = L.default;
const D = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const run = (id, over = {}, gate = true) => {
  const c = FULLRUN_CASES.find((k) => k.id === id);
  const prep = { ...L.fullrunInput(c), fullrun: true };
  prep.input.plan.noFlyGate = gate;
  const { r, core } = L.evaluate({ ...D, ...over }, { id: 'fullrun' }, prep);
  return { id, avail: r3(r.avail), keMax: r3(r.keMax), tdKE: r3(r.tdKE), ops: r.pr.ops, setup: r3(r.pr.setup), sepMaxFly: r3(r.sepMaxFly), events: [...new Set(core.events.map((e) => e.type))].filter((t) => !['touchdown', 'flare', 'liftoff', 'perch'].includes(t)) };
};
const out = {};
// 1. gate bypass: launch anyway in the gated cases
out.gateBypass = ['tail6_s11', 'tail6_s12', 'tail6_s13', 'tail9_s12', 'head9_s11', 'crossR9_s11'].map((id) => run(id, {}, false));
console.log('gateBypass', JSON.stringify(out.gateBypass));
// 2. mass +10 % with the cap re-derived (the dev sensitivity kept the old cap)
const m2 = +(D.mass * 1.1).toFixed(4), cap2 = +(keSpeedCap(m2) - 0.7).toFixed(1);
const SUB = ['calm_s11', 'crossR6_s12', 'head6_s11', 'tail3_s12', 'crossL3_s11', 'head3_s13'];
const rs = SUB.map((id) => run(id, { mass: m2, vCapG: cap2 }));
out.massPlus10_capRederived = { mass: m2, vCapG: cap2, availMean: r3(mean(rs.map((x) => x.avail))), availMin: Math.min(...rs.map((x) => x.avail)), keMax: Math.max(...rs.map((x) => x.keMax)) };
console.log('mass+10', JSON.stringify(out.massPlus10_capRederived));
// 3. noisy launch gate: 2 s mean of the shared field at the chest (handheld pitot, no history) vs the dev 10 s mean
const gate = (c, T) => { const w = makeWind({ mean: c.mean, intensity: c.intensity ?? 0.15, seed: c.seed }); const t0 = 2.6; let wx = 0, wy = 0, k = 0; for (let t = t0 - T; t <= t0 + 1e-9; t += 0.1) { const v = w(t, [0, 0, 1.3]); wx += v[0]; wy += v[1]; k++; } wx /= k; wy /= k; return wx > 4.5 || -wx > 7 || Math.hypot(wx, wy) > 10; };
out.gateNoise = FULLRUN_CASES.filter((c) => c.U >= 3).map((c) => ({ id: c.id, gate10s: gate(c, 10), gate2s: gate(c, 2) })).filter((x) => x.gate10s !== x.gate2s);
console.log('gate 2s vs 10s differences', JSON.stringify(out.gateNoise));
// 4. heater energy on the lift (charging a heated cell below 0 °C for the whole lift ride, ASSUMED 6 min per 1.8 min run)
const pM = 7.644, whEff = D.battWh + D.bankWh * 0.85;
const filmMin = 1.8, liftMin = 6;
const loadEq = pM + BATTERY.heaterW * (filmMin + liftMin) / filmMin;
out.heaterOnLift = { assumption: 'heater 0.6 W also runs while the bank charges the glider cell on a 6 min lift ride; 1.8 min filming per run (ASSUMED)', devEndurance: r3(enduranceMin(whEff, pM, { heated: true })), withLiftHeater: r3(enduranceMin(whEff, loadEq)) };
console.log('heater', JSON.stringify(out.heaterOnLift));
writeFileSync(join(here, 'extras_out.json'), JSON.stringify(out, null, 1));
