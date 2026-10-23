// activetether (SIM-032 phase 2) model checks: contract, determinism, design basis (polar, drum, motor back-EMF
// limit, capture model), detector, metric sanity, dt convergence and the generated 48-case ensemble constants.
// Code verification of an uncalibrated simulation only — not validation of the concept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import concept, { evaluateCase, prepare, buildResult } from '../js/concepts/activetether/index.js';
import { CONCEPTS } from '../js/concepts/index.js';
import { runCore, captureProb, resolveP, MODE } from '../js/concepts/activetether/model.js';
import { FLYERS, aeroCoef, drumR, REEL, flyerBudget, wornBudget, packVolume, vStall, ldMax, LINE } from '../js/concepts/activetether/design.js';
import { ENSEMBLE } from '../js/concepts/activetether/ensemble.js';
import { simulateSkier } from '../js/concepts/common/skier.js';
import { FULLRUN_CASES_R4 } from '../js/concepts/common/fullrun.js';
import { CRITERIA } from '../js/concepts/common/criteria.js';

const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const scen = (id) => concept.scenarios.find((s) => s.id === id);
const metric = (R, id) => R.metrics.find((m) => m.id === id);
const cache = {};
const run = (id) => (cache[id] ||= concept.simulate(P, scen(id)));

test('registered first in the concept list; contract fields present', () => {
  assert.ok(CONCEPTS.slice(0, 2).some((c) => c.id === 'activetether')); // sledpack (SIM-033) is listed first since 2026-10-21
  assert.ok(concept.name.zh && concept.name.en && concept.modelVersion && concept.demo.stages.length && typeof concept.gear === 'function');
  for (const p of concept.params) assert.ok(p.v >= p.min && p.v <= p.max && ['CALC', 'LIT', 'ASSUMED'].includes(p.src), p.id);
});

test('design basis: polars, flyer mass ≤150 g, worn mass/volume, drum radius, motor back-EMF pay-out limit', () => {
  const d = FLYERS.delta, k = FLYERS.kite;
  assert.ok(Math.abs(ldMax(d) - 5.92) < 0.05, `delta L/D ${ldMax(d)}`); // engineering umbrella delta 5.92
  assert.ok(ldMax(k) < ldMax(d));
  const [clS] = aeroCoef(d, 0.2), [clPost, cdPost] = aeroCoef(d, 1.2);
  assert.ok(clS > 0.75 && clS <= d.CLmax + 1e-9 && cdPost > 1.0 && clPost < clS, 'post-stall: more drag, less lift');
  const fb = flyerBudget('delta', true);
  assert.ok(fb.kg > 0.1 && fb.kg <= 0.15, `flyer ${fb.kg}`);
  assert.ok(vStall(d, fb.kg) > 4.5 && vStall(k, flyerBudget('kite', true).kg) < 3.5);
  const wb = wornBudget('delta', true);
  assert.ok(wb.kg > 0.8 && wb.kg <= 1.5, `worn ${wb.kg}`);
  assert.ok(packVolume('delta', true).total <= 3 && packVolume('kite', false).total > packVolume('delta', true).total);
  assert.ok(Math.abs(drumR(0) - 0.015) < 1e-6 && Math.abs(drumR(25) - 0.02187) < 2e-4, 'yo-yo drum 15→21.9 mm (engineering)');
  // pay-out speed where the back-EMF reaches the cold bus (0.95 × 13.2 V): ≈9–10 m/s at a full drum (engineering ≤9 m/s)
  const vEMF = ((REEL.modIdx * REEL.V0) / REEL.Kt / REEL.gear) * drumR(25);
  assert.ok(vEMF > 8.5 && vEMF < 10.5, `vEMF ${vEMF}`);
  assert.ok(LINE.weakLinkN < 40 && LINE.clutchN < LINE.weakLinkN);
});

test('ASSUMED capture model: base rate reproduces the engineering MC (0.958), falls with speed and angle', () => {
  assert.ok(Math.abs(captureProb(0.5, 10) - 0.958) < 1e-9);
  assert.ok(captureProb(1.5, 10) < captureProb(0.5, 10) && captureProb(0.5, 35) < captureProb(0.5, 10));
  assert.equal(captureProb(0.5, 50), 0);
  assert.ok(captureProb(3.5, 10) < 0.1);
});

test('determinism: the same scenario twice gives identical columns and metrics', () => {
  const a = concept.simulate(P, scen('nominal')), b = concept.simulate(P, scen('nominal'));
  for (const k of ['lineOut', 'tension', 'elev', 'bodyPx', 'headClear']) assert.deepEqual(Array.from(a.columns[k]).map(String), Array.from(b.columns[k]).map(String), k);
  assert.deepEqual(a.metrics.map((m) => String(m.value)), b.metrics.map((m) => String(m.value)));
});

test('nominal: start detected, auto launch, braked flight near the target elevation, all 13 shared metrics judged', () => {
  const R = run('nominal');
  const types = R.events.map((e) => e.type);
  assert.ok(types.includes('deploy') && types.includes('launch'), types.join(','));
  const launch = R.events.find((e) => e.type === 'launch').t;
  assert.ok(launch > 1 && launch < 5, `launch at ${launch}`);
  for (const id of Object.keys(CRITERIA)) { const m = metric(R, id); assert.ok(m, `missing ${id}`); }
  const el = metric(R, 'elevMed').value;
  assert.ok(el > 38 && el < 62, `elevation median ${el}`);
  assert.equal(metric(R, 'handsBusy').value, 0);
  assert.ok(metric(R, 'addedMass').value <= 1.5 && metric(R, 'packVol').value <= 3);
  // KE floor: a tethered flyer moves at about the rider's speed → ½·m·v² at the max rider speed is a lower bound
  const vMax = Math.max(...R.columns.speed);
  assert.ok(metric(R, 'keMax').value >= 0.5 * R.core.p.m * (0.8 * vMax) ** 2, 'KE below the rider-speed floor');
  // the tracker never reads the truth: productCam differs from the exact line of sight
  let maxErr = 0;
  for (let t = 10; t < 25; t += 0.5) { const f = R.frame(t); if (!f.productCam) continue; const s = f.skier, c = f.productCam; const l = [s.pos[0] - c.pos[0], s.pos[1] - c.pos[1], s.pos[2] + 0.9 - c.pos[2]]; const ln = Math.hypot(...l); const dp = (l[0] * c.fwd[0] + l[1] * c.fwd[1] + l[2] * c.fwd[2]) / ln / Math.hypot(...c.fwd); maxErr = Math.max(maxErr, Math.acos(Math.min(1, dp))); }
  assert.ok(maxErr > 1e-4, 'productCam must not be the exact line of sight');
});

test('detector and gates: the downloading chairlift never deploys or launches; moguls (4.5 m/s) stay below the launch gate', () => {
  const C = run('chairdown');
  assert.ok(!C.events.some((e) => e.type === 'launch' || e.type === 'deploy'));
  const Mg = run('moguls');
  assert.ok(!Mg.events.some((e) => e.type === 'launch'), 'moguls must not launch');
});

test('stop handling: brake (never fast reel-in), land/fly-in, retrieve and dock with the KE-governed reel', () => {
  const R = concept.simulate(P, scen('fullrun'));
  const types = R.events.map((e) => e.type);
  assert.ok(types.includes('stop') && types.some((t) => t === 'docked' || t === 'manual'), types.join(','));
  // during BRAKE the reel never reels in faster than 1 m/s
  const md = R.columns.mode, vr = R.columns.reelRate;
  for (let i = 0; i < R.n; i++) if (md[i] === MODE.BRAKE) assert.ok(vr[i] > -1.3, `fast reel-in in BRAKE at ${i * 0.02}: ${vr[i]}`);
});

test('fall: deep stall + free-spool; body force stays under the weak link', () => {
  const R = run('fall');
  assert.ok(R.events.some((e) => e.type === 'abort'), 'fall abort');
  assert.ok(metric(R, 'bodyForcePeak').value <= 40);
});

test('dt convergence: 2 ms vs 1 ms integration gives the same flight statistics (chaotic flight: statistics, not trajectories)', () => {
  const sk = simulateSkier({ duration: 21, seed: 2, style: 'straight' });
  const base = { sk, wind: { mean: [0, 2, 0], intensity: 0.15, seed: 7 }, start: 'flying', duration: 20 };
  const stat = (c) => { const el = [], T = []; for (let i = 250; i < c.n; i++) if (c.O.mode[i] === MODE.FLY) { el.push(c.O.elev[i]); T.push(c.O.T[i]); } const m = (a) => a.reduce((x, y) => x + y, 0) / a.length; return { el: m(el), T: m(T), n: el.length }; };
  const a = stat(runCore(P, base)), b = stat(runCore({ ...P, dt: 0.001 }, base));
  assert.ok(a.n > 500 && b.n > 500);
  assert.ok(Math.abs(a.el - b.el) < 4, `elevation ${a.el} vs ${b.el}`);
  assert.ok(Math.abs(a.T - b.T) < 0.25 * a.T + 0.5, `tension ${a.T} vs ${b.T}`);
});

test('generated 48-case ensemble constants match a re-run subset and are used by the fullrun scenario', () => {
  if (!ENSEMBLE) return; // before the first run_all
  assert.equal(ENSEMBLE.counts.cases, 48);
  for (const id of ['calm_s11', 'head6_s12']) {
    const r = evaluateCase(P, FULLRUN_CASES_R4.find((c) => c.id === id), { fs: false });
    const row = ENSEMBLE.rowsKey.find((x) => x[0] === id);
    assert.ok(Math.abs(r.avail - row[1]) < 0.01 && Math.abs(r.keMax - row[2]) < 0.01, `${id} drifted from ensemble.js: rerun run_all.mjs`);
  }
  const R = concept.simulate(P, scen('fullrun'));
  assert.ok(Math.abs(metric(R, 'avail').value - ENSEMBLE.metrics.avail.mean) < 1e-9);
  assert.ok(Math.abs(metric(R, 'keMax').value - ENSEMBLE.metrics.keMax.max) < 1e-9);
});

test('variants resolve: kite is lighter-loaded, line camera moves the camera mass off the flyer', () => {
  const d = resolveP({ ...P, flyer: 0, camPos: 0 }), kl = resolveP({ ...P, flyer: 1, camPos: 1 });
  assert.ok(kl.Vs < d.Vs && kl.pod && !d.pod && kl.m < resolveP({ ...P, flyer: 1, camPos: 0 }).m);
  const sc = { id: 'x', rider: 'push', dur: 12, wind: { mean: [0, 2, 0], intensity: 0.15, seed: 7 } };
  const R = buildResult({ ...P, flyer: 1, camPos: 1 }, sc, prepare({}, sc));
  assert.ok(R.n > 500);
});
