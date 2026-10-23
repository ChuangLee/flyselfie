// sledpack (SIM-033) model checks: contract, determinism, design basis (sled polar, masses, volume, capture model),
// detector gates, launch → flight → retrieve → dock sequence, safety behaviour (brake-then-retrieve, flag-out kill,
// weak link), and the generated 48-case ensemble constants. Code verification of an uncalibrated simulation only —
// not validation of the concept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import concept, { evaluateCase } from '../js/concepts/sledpack/index.js';
import { CONCEPTS } from '../js/concepts/index.js';
import { captureProb, resolveP, MODE } from '../js/concepts/sledpack/model.js';
import { SLED, aeroCoef, kiteBudget, wornBudget, packVolume, ldMax, LINE, GEOM, EYELET, BACKSTOW, sledGeo } from '../js/concepts/sledpack/design.js';
import { ENSEMBLE } from '../js/concepts/sledpack/ensemble.js';
import { FULLRUN_CASES_R4 } from '../js/concepts/common/fullrun.js';
import { CRITERIA } from '../js/concepts/common/criteria.js';

const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const scen = (id) => concept.scenarios.find((s) => s.id === id);
const metric = (R, id) => R.metrics.find((m) => m.id === id);
const cache = {};
const run = (id) => (cache[id] ||= concept.simulate(P, scen(id)));

test('registered first in the concept list; contract fields present', () => {
  assert.equal(CONCEPTS[0].id, 'sledpack');
  assert.ok(concept.name.zh && concept.name.en && concept.modelVersion && concept.demo.stages.length && typeof concept.gear === 'function');
  for (const p of concept.params) assert.ok(p.v >= p.min && p.v <= p.max && ['CALC', 'LIT', 'ASSUMED'].includes(p.src), p.id);
});

test('design basis: low-AR sled polar, kite ≤75 g with pod, worn ≤1.5 kg, ≤3 L, pole-free exit geometry', () => {
  const g = sledGeo(P.areaScale);
  assert.ok(ldMax(g) > 2 && ldMax(g) < 3.5, `sled L/D ${ldMax(g)}`);
  const [cl1] = aeroCoef(0.42, g), [cl2, cd2] = aeroCoef(1.2, g); // near CLmax vs deep post-stall
  assert.ok(cl1 > 0.4 && cl1 <= SLED.CLmax + 1e-9 && cd2 > 1.0 && cl2 < cl1);
  const kb = kiteBudget(P.areaScale, P.tail);
  assert.ok(kb.kg > 0.05 && kb.kg <= 0.075, `kite ${kb.kg}`);
  assert.ok(wornBudget(P.areaScale, P.tail, 1).kg <= 1.0);
  // I10 back stow: flat envelope on the back (shared ≤3 L fails, disclosed); folding into a pack (bonus) ≤3 L; I9 sleeve ≤3 L
  const pv = packVolume(1, P.areaScale);
  assert.ok(pv.total > 3 && pv.folded <= 3 && packVolume(0).total <= 3);
  // no pole: the rear eyelet tab is ≤0.35 m behind the pelvis point; the stowed sail top stays below the helmet
  assert.ok(Math.abs(EYELET.exitF) <= 0.35 && GEOM.sleeveLen <= 0.7);
  assert.ok(EYELET.exitU + 0.02 + BACKSTOW.seatU + sledGeo(P.areaScale).chord / 2 < 0.78 - 0.15, 'sail top below the helmet');
  assert.ok(LINE.weakLinkN < 40 && LINE.clutchN < LINE.weakLinkN);
});

test('ASSUMED capture model: base rate 0.95, falls with speed and with the angle beyond the swivel', () => {
  assert.ok(Math.abs(captureProb(0.5, 10) - 0.95) < 1e-9);
  assert.ok(captureProb(1.5, 10) < captureProb(0.5, 10) && captureProb(0.5, 40) < captureProb(0.5, 10));
  assert.equal(captureProb(0.5, 60), 0);
});

test('determinism', () => {
  const a = concept.simulate(P, scen('nominal')), b = concept.simulate(P, scen('nominal'));
  for (const k of ['lineOut', 'tension', 'elev', 'bodyPx', 'headClear']) assert.deepEqual(Array.from(a.columns[k]).map(String), Array.from(b.columns[k]).map(String), k);
});

test('nominal: auto launch from the sleeve, open sail, flight at 40–65°, all 13 shared metrics judged', () => {
  const R = run('nominal');
  const launch = R.events.find((e) => e.type === 'launch'), fly = R.events.find((e) => e.type === 'fly');
  assert.ok(launch && launch.t > 0.5 && launch.t < 6, `launch ${launch && launch.t}`);
  assert.ok(fly && fly.t - launch.t < 6, 'launch complete within 6 s');
  for (const id of Object.keys(CRITERIA)) assert.ok(metric(R, id), `missing ${id}`);
  const el = metric(R, 'elevMed').value;
  assert.ok(el > 40 && el < 65, `elevation ${el}`);
  assert.ok(metric(R, 'bodyForcePeak').value <= 40);
  // KE floor: the kite moves at about the rider's speed
  const vMax = Math.max(...R.columns.speed);
  assert.ok(metric(R, 'keMax').value >= 0.5 * R.core.p.m * (0.8 * vMax) ** 2);
  // tracker is not the truth
  let maxErr = 0;
  for (let t = 10; t < 25; t += 0.5) { const f = R.frame(t); if (!f.productCam) continue; const s = f.skier, c = f.productCam; const l = [s.pos[0] - c.pos[0], s.pos[1] - c.pos[1], s.pos[2] + 0.9 - c.pos[2]]; const ln = Math.hypot(...l); const dp = (l[0] * c.fwd[0] + l[1] * c.fwd[1] + l[2] * c.fwd[2]) / ln / Math.hypot(...c.fwd); maxErr = Math.max(maxErr, Math.acos(Math.min(1, dp))); }
  assert.ok(maxErr > 1e-4);
});

test('gates: the downloading chairlift never launches; strong tailwind (9 m/s) is refused by the envelope', () => {
  assert.ok(!run('chairdown').events.some((e) => e.type === 'launch'));
  const r = evaluateCase(P, FULLRUN_CASES_R4.find((c) => c.id === 'tail9_s11'), { fs: false });
  assert.equal(r.launches, 0, 'tail 9 m/s must not launch');
  assert.ok(r.refuseTailS > 10);
  // azRange is the commandable span: the kite cannot be steered
  assert.equal(r.azRange, 0);
});

test('stop: retrieve then dock; the brake-then-retrieve option never reels a steep line in fast', () => {
  assert.ok(concept.simulate(P, scen('fullrun')).events.some((e) => e.type === 'dock' || e.type === 'park')); // I10: docks onto the back or parks on the snow
  const R = concept.simulate({ ...P, twStop: 0 }, scen('fullrun'));
  const types = R.events.map((e) => e.type);
  assert.ok(types.includes('retrieve') && types.some((t) => t === 'dock' || t === 'manual' || t === 'park'), types.join(','));
  const md = R.columns.mode, vr = R.columns.reelRate, el = R.columns.elev;
  for (let i = 0; i < R.n; i++) if (md[i] === MODE.RETRIEVE && el[i] > 40) assert.ok(vr[i] > -1.3, `fast reel-in on a steep line at ${(i * 0.02).toFixed(2)}: ${vr[i]}`);
});

test('fall: full depower flags the sail; body force under the weak link', () => {
  const R = run('fall');
  assert.ok(R.events.some((e) => e.type === 'fall'));
  assert.ok(metric(R, 'bodyForcePeak').value <= 40);
});

test('parameter resolve: area scale changes the sail and the minimum airspeed', () => {
  const a = resolveP({ ...P, areaScale: 1 }), b = resolveP({ ...P, areaScale: 0.667 });
  assert.ok(a.geo.S > b.geo.S && a.Vmin < b.Vmin);
});

test('generated 48-case ensemble constants match a re-run subset and are used by the fullrun scenario', () => {
  if (!ENSEMBLE) return;
  assert.equal(ENSEMBLE.counts.cases, 48);
  for (const id of ['calm_s11', 'head6_s12']) {
    const r = evaluateCase(P, FULLRUN_CASES_R4.find((c) => c.id === id), { fs: false });
    const row = ENSEMBLE.rowsKey.find((x) => x[0] === id);
    assert.ok(Math.abs(r.avail - row[1]) < 0.01 && Math.abs(r.keMax - row[2]) < 0.01, `${id} drifted from ensemble.js: rerun run_all.mjs`);
  }
  const R = concept.simulate(P, scen('fullrun'));
  assert.ok(Math.abs(metric(R, 'avail').value - ENSEMBLE.metrics.avail.mean) < 1e-9);
});
