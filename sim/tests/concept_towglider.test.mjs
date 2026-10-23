// towglider (SIM-031) round-4 model checks (48-case FULLRUN_CASES_R4, bodyPx avail, physical servo/EIS model, reel KE
// governor, line-guide wand, trip profile) — earlier: round-3 model checks: polar and mass basis, dt convergence, harmonised
// metrics, the full-run sequence (launch → rest stop drop/park → auto-relaunch → stow), the
// ensemble constants (subset re-check), wind/tailwind gate, faults and variants. Code
// verification of an uncalibrated simulation only — not validation of the concept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import concept, { evaluateCase, fullrunScenario } from '../js/concepts/towglider/index.js';
import { runCore, liftDrag, vStall, PDEF } from '../js/concepts/towglider/model.js';
import { gliderBudget, packVolume } from '../js/concepts/towglider/design.js';
import { ENSEMBLE } from '../js/concepts/towglider/ensemble.js';
import { simulateSkier } from '../js/concepts/common/skier.js';
import { FULLRUN_CASES, FULLRUN_CASES_R4 } from '../js/concepts/common/fullrun.js';
import { CRITERIA, footageStability } from '../js/concepts/common/criteria.js';

const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const scen = (id) => concept.scenarios.find((s) => s.id === id);
const metric = (R, id) => R.metrics.find((m) => m.id === id);
const val = (R, id) => metric(R, id).value;
const cache = {};
const run = (id) => (cache[id] ||= concept.simulate(P, scen(id)));
const ev = (R, type) => R.events.find((e) => e.type === type);
const caseOf = (id) => FULLRUN_CASES_R4.find((c) => c.id === id);

test('polar: reproduces calc_slope_glider.py with the round-1 fixed polar; the Re-dependent polar is worse', () => {
  const i05 = { ...PDEF, mass: 0.125, S: 0.06, AR: 9, cd0: 0.035, e: 0.8, CLmax: 1.0, rho: 1.0, reModel: 0 };
  assert.ok(Math.abs(liftDrag(i05, 12) - 7.36) < 0.05, `L/D@12 ${liftDrag(i05, 12)}`);
  assert.ok(Math.abs(vStall(i05) - 6.39) < 0.02);
  const p = { ...PDEF, mass: gliderBudget('panRect', PDEF.S).kg };
  assert.ok(vStall(p) > vStall({ ...p, reModel: 0 }), 'low-Re CLmax must raise the stall speed (audit TG-15)');
  assert.ok(liftDrag(p, 12) < liftDrag(i05, 12));
});

test('mass basis and packed volume: shared table + 15 % margin; the chord-folded wing fits an 80 mm holster ≤3 L, the round-2 fold does not (audit2 A2-TG-04)', () => {
  const ch = gliderBudget('panRect', 0.075), gb = gliderBudget('gimbal', 0.075);
  assert.ok(ch.gWithMargin > 125 && ch.gWithMargin < 250, `chosen ${ch.gWithMargin} g`);
  assert.ok(gb.gWithMargin > ch.gWithMargin + 5, 'the 30 g gimbal costs mass (audit TG-02)');
  const pv = packVolume({ S: 0.075, AR: 8, camOpt: 'panRect' }), pv0 = packVolume({ S: 0.075, AR: 8, camOpt: 'panRect', chordFold: 0 });
  assert.ok(pv.total <= 3 && pv.tubeOD_mm <= 82 && pv.foldedChord_mm < 60, `chord-folded ${pv.total} L, OD ${pv.tubeOD_mm}`);
  assert.ok(pv0.total > 3 && pv0.tubeOD_mm > 100, 'a 97 mm chord needs a ≥100 mm tube (audit2)');
  assert.ok(packVolume({ S: 0.075, AR: 8, camOpt: 'gimbal' }).total > 3);
  assert.ok(Math.abs(concept.simulate(P, scen('nominal')).core.p.mass - ch.kg) < 1e-9, 'default mass = budget');
});

test('dt convergence: line/drum substeps ×2 and controller step 20 → 10 ms change the track by < 0.15 m (audit TG-10)', () => {
  const sk = simulateSkier({ duration: 21 });
  const base = { duration: 20, skier: sk, wind: { mean: [0, 2, 0], intensity: 0.2, seed: 7 }, plan: {} };
  const q = { ...PDEF, mass: gliderBudget('panRect', PDEF.S).kg, noise: 0, windEst: 0 };
  const a = runCore(q, base), b = runCore(q, { ...base, subFactor: 2 }), c = runCore(q, { ...base, ctrlDt: 0.01 });
  const rms = (x, y, st) => { let s = 0, n = 0; for (let i = 100; i < x.n; i++) { const j = i * st; if (j >= y.n) break; s += (x.O.gx[i] - y.O.gx[j]) ** 2 + (x.O.gy[i] - y.O.gy[j]) ** 2 + (x.O.gz[i] - y.O.gz[j]) ** 2; n++; } return Math.sqrt(s / n); };
  assert.ok(rms(a, b, 1) > 0 && rms(a, b, 1) < 0.15, `sub ${rms(a, b, 1)}`); // substeps now actually change (KS scales with subFactor)
  assert.ok(rms(a, c, 2) < 0.15, `ctrl ${rms(a, c, 2)}`);
});

test('all harmonised metrics (incl. headClear) are reported with the shared thresholds (fullrun judged on the ensemble)', () => {
  const R = run('fullrun');
  for (const id of Object.keys(CRITERIA)) { const m = metric(R, id); assert.ok(m, `missing ${id}`); assert.ok(m.criterion && m.pass !== null, `${id} judged`); }
  assert.equal(val(R, 'avail'), ENSEMBLE.metrics.avail.mean);
  assert.equal(val(R, 'setupTime'), ENSEMBLE.metrics.setupTime.p90);
});

test('follow segment: jitter with airframe attitude + EIS residual ≤3 °/s, no line artefact, KE ≤14.9 J, clearances', () => {
  const R = run('nominal');
  assert.ok(val(R, 'jitterRms') <= 3 && val(R, 'avail') >= 80 && val(R, 'pxMed') >= 300, `${val(R, 'jitterRms')} ${val(R, 'avail')}`);
  assert.ok(val(R, 'keMax') <= 14.9 && val(R, 'artFrames') <= 2 && val(R, 'heightMin') >= 1.5 && val(R, 'headMin') >= 1);
  assert.ok(val(R, 'bodyRateRms') > 10, 'the airframe really shakes; the picture is stabilised by the camera, not by assumption');
  const fs = footageStability(R);
  assert.ok(fs.subjectRms < 3, `fs ${fs.subjectRms}`);
  assert.ok(val(run('gust'), 'avail') >= 80, 'gusty crosswind');
  assert.ok(val(run('short'), 'keMax') <= 14.9, 'short turns: safe (jitter is an envelope limit with the 50° lens, see results.json)');
});

test('full run: arm → launch → rest stop drop/park → auto-relaunch (no action) → lift-approach stow; ops 1, no release', () => {
  const R = run('fullrun');
  for (const t of ['arm', 'drop', 'winch', 'liftoff', 'stop', 'landed', 'parked', 'relaunch', 'capture', 'docked']) assert.ok(ev(R, t), t);
  assert.ok(!ev(R, 'release') && !ev(R, 'cut'));
  assert.equal(R.summary.ops, 1);
  assert.ok(R.summary.setupTime <= 30 && R.summary.finalStand <= 20 && R.summary.keMax <= 14.9 && R.summary.headClear >= 1);
  assert.ok(val(R, 'launchTime') <= 10 && val(R, 'endurance') >= 45);
});

test('ensemble constants (48 cases, round 4) match a re-computed subset; safety holds in all 48; avail honestly < 80 %', () => {
  const res = JSON.parse(readFileSync(new URL('../../research/concepts_2026_10_19/dev/towglider/results.json', import.meta.url)));
  for (const id of ['calm_s12', 'head9_s13', 'tail5.5_s11']) {
    const r = evaluateCase(P, caseOf(id)), row = res.ensemble.rows.find((x) => x.id === id);
    assert.ok(Math.abs(r.avail - row.avail) < 0.5 && Math.abs(r.setupTime - row.setupTime) < 0.5, `${id} ${r.avail} vs ${row.avail}`);
    if (!r.gated) assert.ok(Math.abs(r.fsSubject - row.fsSubject) < 0.05, `${id} fs ${r.fsSubject} vs ${row.fsSubject}`);
  }
  assert.equal(ENSEMBLE.counts.cases, 48);
  assert.ok(ENSEMBLE.counts.cut === 0 && ENSEMBLE.counts.released === 0);
  assert.ok(ENSEMBLE.metrics.setupTime.p90 <= 30 && ENSEMBLE.metrics.ops.p90 <= 2 && ENSEMBLE.metrics.bodyForcePeak.max <= 40);
  assert.ok(ENSEMBLE.metrics.keMax.max <= 14.9, `KE ${ENSEMBLE.metrics.keMax.max}`);
  assert.ok(ENSEMBLE.metrics.headClear.min >= 1.0, `headClear ${ENSEMBLE.metrics.headClear.min}`);
  assert.ok(ENSEMBLE.metrics.jitterRms.p90 <= 3, `shared jitter p90 ${ENSEMBLE.metrics.jitterRms.p90}`);
  assert.ok(ENSEMBLE.metrics.avail.mean < 80, 'the 48-case mean is honestly below 80 %: ≥3 m/s estimated tailwind runs cannot launch safely');
  assert.ok(res.ensemble.launchedOnly.avail.mean >= 75, `launched-run availability ${res.ensemble.launchedOnly.avail.mean}`);
});

test('round 4 physical mount/EIS model: dead band, backlash and slew are simulated; the residual grows with worse servos/EIS', () => {
  const b = evaluateCase(P, caseOf('calm_s11')), w = evaluateCase({ ...P, servo: { dbDeg: 1, blDeg: 1, fs: 3 }, eis: { syncMs: 3, ks: 0.05 } }, caseOf('calm_s11'));
  assert.ok(b.mountErrDeg > 0.5, `mount error ${b.mountErrDeg} (a real servo leaves error the EIS must remove)`);
  assert.ok(w.mountErrDeg > b.mountErrDeg && w.fsSubject > b.fsSubject, `pessimistic ${w.fsSubject} vs ${b.fsSubject}: the residual is not an assumed constant`);
  assert.ok(b.fsSubject <= 3, `nominal ${b.fsSubject}`);
  assert.ok(b.pxMed >= 300 && b.avail >= 80, `bodyPx avail ${b.avail}`);
});

test('reel KE governor: a refused relaunch never snow-pulls the glider above 14.9 J (audit3 A3-TG-01: 21.8 J before)', () => {
  const r = evaluateCase({ ...P, tailGate: 4.5, gateHyst: 0 }, caseOf('tail3.5_s11'));
  assert.ok(r.keMax <= 14.9, `KE ${r.keMax}`);
});

test('trip profile: leash height 1–3 m behind the feet is reported; following, it is ≥0.3 m at 2 m (p10)', () => {
  const r = evaluateCase(P, caseOf('calm_s11'));
  assert.ok(Number.isFinite(r.tripLow) && Number.isFinite(r.tripH2p10) && r.tripFolH2p10 >= 0.3, `${r.tripLow} ${r.tripFolH2p10}`);
});

test('stops: rest stop in 9 m/s gusty wind drops beside, parks and relaunches without release or cut (audit TG-01/TG-05)', () => {
  for (const id of ['stop', 'stop_wind']) {
    const R = run(id);
    assert.ok(ev(R, 'parked') && ev(R, 'relaunch'), id);
    assert.ok(!ev(R, 'release') && !ev(R, 'cut'), id);
    assert.ok(val(R, 'headMin') >= 1 && val(R, 'keMax') <= 14.9, id);
  }
  for (const id of ['stow', 'stow_wind']) { const R = run(id); assert.ok(ev(R, 'docked') && val(R, 'stowStand') <= 20, id); }
});

test('tailwind gate on the shared windEstimate (3.0 m/s): 5.5 m/s refused; launching anyway at 9 m/s fails (proof)', () => {
  const g = evaluateCase(P, caseOf('tail5.5_s12'));
  assert.ok(g.gated && g.ops === 1 && g.setupTime === 1);
  const f = evaluateCase({ ...P, tailGate: 0 }, caseOf('tail9_s12'));
  assert.ok(f.releases > 0 || f.airMin < 1 || f.keMax > 14.9 || f.avail < 50, 'without the gate the glider cannot follow');
});

test('slow beginner in a 3 m/s tailwind: the airspeed-margin rule keeps it safe (audit2 A2-TG-02)', () => {
  const R = run('slow_tail3');
  assert.ok(val(R, 'keMax') <= 14.9 && R.summary.headClear >= 1, `KE ${val(R, 'keMax')} head ${R.summary.headClear}`);
  assert.ok(ev(R, 'margin'), 'margin rule acts');
});

test('faults: line strike and branch snag release the hook (48 V cut); nothing left behind; KE ≤14.9 J', () => {
  const C = run('crossing'), B = run('snag');
  assert.ok(ev(C, 'strike') && ev(C, 'release'));
  assert.ok(val(C, 'strikeForce') <= 8 && val(C, 'bodyForcePeak') <= 40 && val(C, 'keMax') <= 14.9);
  assert.ok(ev(B, 'snag') && ev(B, 'release') && ev(B, 'unhooked'));
  assert.equal(metric(B, 'leftOnObstacle').pass, true);
  const F = run('fall');
  assert.ok(ev(F, 'fall') && val(F, 'keMax') <= 14.9 && val(F, 'headMin') >= 1);
});

test('envelope: above the KE-governor speed the glider lags and releases before the spool end; KE stays ≤14.9 J', () => {
  const R = run('fast');
  assert.ok(val(R, 'keMax') <= 14.9 && ev(R, 'release') && !ev(R, 'cut'));
  assert.equal(metric(R, 'avail').pass, false);
  assert.ok(val(run('slow'), 'keMax') <= 14.9, 'slow beginner 6 m/s: KE bounded (outside the envelope: headClear/jitter fail, see results.json)');
  assert.ok(val(run('fast14'), 'keMax') <= 14.9 && !ev(run('fast14'), 'cut'));
});

test('camera variants: I-05 fixed camera and the body-fixed 150° fisheye fail; round-1 cold endurance fails', () => {
  const V1 = run('nominal_v1');
  assert.ok(val(V1, 'jitterRms') > 3 || val(V1, 'avail') < 80);
  const FX = run('cam_fixEIS');
  assert.ok(val(FX, 'jitterRms') > 3 || val(FX, 'avail') < 80);
  assert.ok(val(run('cam_panRect'), 'pxMed') > val(run('cam_panEIS'), 'pxMed') + 50, 'the narrow lens resolves the subject better than the 90° fisheye');
  assert.equal(metric(run('nominal_r1'), 'endurance').pass, false);
  assert.ok(val(run('cam_gimbal'), 'packVol') > 3);
});

test('demo: physics-driven cycle launches, parks and relaunches, and docks before the end', () => {
  const D = concept.demo.build(P);
  assert.ok(ev(D, 'liftoff') && ev(D, 'relaunch') && ev(D, 'docked') && ev(D, 'docked').t < concept.demo.duration - 4);
  assert.ok(Math.abs(D.duration - concept.demo.duration) < 0.05);
  assert.ok(D.frame(15).productCam && !D.frame(0.2).productCam);
});

test('fullrunScenario wraps any ensemble case', () => {
  const sc = fullrunScenario(caseOf('calm_s11'));
  assert.ok(sc.run && sc.wind && sc.caseId === 'calm_s11');
});
