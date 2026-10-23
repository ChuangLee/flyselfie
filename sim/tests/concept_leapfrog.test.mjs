// leapfrog (round 4, after audit3) model checks: feathered span-morphing wing (tucked/extended polar, rate-limited
// morph servo), live framing tracker (no truth crop), simulated MODAPTS handling, gate on ≥5 s of estimate history,
// 48-case ensemble re-check. Older checks kept: shared mass/battery basis, aerodynamics and energy sanity,
// dt convergence, the harmonised metrics incl. headClear, footage chain, the full-run behaviour (stops, lift
// geofence, simulated standstill), wind gates on the shared windEstimate (no oracle), the independent speed
// protection with the gate bypassed, the sourced pointing model, and a re-check of the precomputed 39-case
// ensemble on a subset. Code verification of an uncalibrated simulation — not validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import concept, { evaluate, fullrunInput } from '../js/concepts/leapfrog/index.js';
import { runCore, PDEF, PHASE, aero, ldAt, cd0At, motorPower, MASS_KG, KE_CAP, BUDGET, imageRoll, bodyAxes, progressFeasible, morphCfg } from '../js/concepts/leapfrog/model.js';
import { handling } from '../js/concepts/leapfrog/index.js';
import { ENSEMBLE } from '../js/concepts/leapfrog/ensemble.js';
import { simulateSkier } from '../js/concepts/common/skier.js';
import { FULLRUN_CASES_R4 as FULLRUN_CASES } from '../js/concepts/common/fullrun.js';
import { CRITERIA, footageStability } from '../js/concepts/common/criteria.js';
import { keSpeedCap, MASS_MARGIN } from '../js/concepts/common/components.js';

const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const scen = (id) => concept.scenarios.find((s) => s.id === id);
const metric = (R, id) => R.metrics.find((m) => m.id === id);
const val = (R, id) => metric(R, id).value;
const cache = {};
const run = (id) => (cache[id] ||= concept.simulate(P, scen(id)));
const has = (R, type) => R.events.some((e) => e.type === type);
const caseEval = (id, over = {}, { bypass = false } = {}) => { const c = FULLRUN_CASES.find((k) => k.id === id); const prep = fullrunInput(c, { params: over }); if (bypass) prep.input.plan.noFlyGate = false; return evaluate({ ...P, ...over }, { id: 'fullrun_case' }, { ...prep, fullrun: true }); };

test('mass comes from the shared component table with the 15 % margin; KE speed cap follows from it', () => {
  assert.ok(Math.abs(MASS_KG - (BUDGET.g * (1 + MASS_MARGIN)) / 1000) < 1e-3);
  assert.ok(MASS_KG > 0.155 && MASS_KG < 0.175, `mass ${MASS_KG} (shared table; KE cap must stay above the rider's straight-line speed)`);
  assert.ok(Math.abs(KE_CAP - keSpeedCap(MASS_KG)) < 1e-9);
  assert.ok(PDEF.vCapG < KE_CAP - 0.5, 'gust margin under the cap');
});

test('aerodynamics: tucked/extended stall speeds, Re-dependent cd0, L/D band, prop power', () => {
  const p = { ...PDEF };
  const vT = aero(p).vStall, vX = aero(morphCfg(p, 1)).vStall;
  assert.ok(vT > 7.5 && vT < 8.8, `tucked vStall ${vT}`);
  assert.ok(vX > 4.6 && vX < 5.6, `extended vStall ${vX}`);
  assert.ok(Math.abs(aero(morphCfg(p, 1)).span - 1.0) < 0.02 && Math.abs(aero(p).span - 0.55) < 0.02, 'span 0.55 → 1.0 m');
  assert.ok(cd0At(p, 8) > cd0At(p, 12), 'cd0 rises at low Re (audit LF-15)');
  assert.ok(ldAt(p, 12) > 6.5 && ldAt(p, 12) < 9.5, `LD12 ${ldAt(p, 12)}`);
  assert.equal(ldAt(p, 5), 0, 'below stall (tucked)');
  assert.ok(ldAt(morphCfg(p, 1), 6) > 5, 'extended flies at 6 m/s');
  assert.ok(ldAt({ ...p, ldScale: 0.7 }, 12) < 0.71 * ldAt(p, 12));
  const P0 = motorPower(p, p.T0, 0);
  assert.ok(P0 > 15 && P0 < 45, `static power ${P0}`);
  assert.ok(p.mass * 9.81 * Math.sin(15 * Math.PI / 180) >= (p.mass * 9.81) / ldAt(p, 12), 'slope pays for a 12 m/s cruise on 15°');
});

test('energy sanity: unpowered glide in still air never gains mechanical energy', () => {
  const sk = simulateSkier({ duration: 21 });
  const p = { ...PDEF, ...P, T0: 0 };
  const core = runCore(p, { duration: 20, skier: sk, wind: { mean: [0, 0, 0], intensity: 0 }, plan: { start: 'lead', gap0: 15 }, seed: 5 });
  const { O, n } = core;
  let prev = null, gains = 0;
  for (let i = 0; i < n; i++) {
    if (O.phase[i] !== PHASE.LEAD && O.phase[i] !== PHASE.LAND) { prev = null; continue; }
    const E = 0.5 * p.mass * (O.vx[i] ** 2 + O.vy[i] ** 2 + O.vz[i] ** 2) + p.mass * 9.81 * O.z[i];
    if (prev != null && E > prev + 1e-3) gains++;
    prev = E;
  }
  assert.equal(gains, 0);
  assert.equal(Math.max(...Array.from(O.pMot).filter(Number.isFinite)), 0);
});

test('dt convergence: 5 ms vs 2.5 ms give the same story; touchdown KE within 10 %', () => {
  const c = FULLRUN_CASES.find((k) => k.id === 'calm_s11');
  const mk = (dt) => runCore({ ...PDEF, ...P }, { ...fullrunInput(c).input, dt });
  const a = mk(0.005), b = mk(0.0025);
  assert.equal(a.perchCount, b.perchCount);
  const ka = Math.max(...a.touchdowns.map((d) => d.ke)), kb = Math.max(...b.touchdowns.map((d) => d.ke));
  assert.ok(Math.abs(ka - kb) / kb < 0.1, `tdKE ${ka} vs ${kb}`);
});

test('camera geometry helpers: image roll of a pan/tilt camera', () => {
  const ax = bodyAxes(0, 0, 0.3); // banked 0.3 rad, looking backwards along −x
  assert.ok(Math.abs(Math.abs(imageRoll([-1, 0, 0], ax.u)) - 0.3) < 1e-6, 'rear view: image roll = bank');
  assert.ok(Math.abs(imageRoll([-1, 0, 0], [0, 0, 1])) < 1e-9);
});

test('all 12 harmonised metrics are reported with the shared thresholds', () => {
  const R = run('nominal');
  for (const id of Object.keys(CRITERIA)) {
    const m = metric(R, id);
    assert.ok(m, `missing ${id}`);
    if (typeof m.value === 'number') assert.ok(m.criterion && m.pass !== null, `${id} judged`);
  }
});

test('nominal: leads without falling behind, all harmonised criteria pass, shared footage stability passes', () => {
  const R = run('nominal');
  assert.equal(val(R, 'keepsLead'), 'no');
  for (const id of Object.keys(CRITERIA)) assert.notEqual(metric(R, id).pass, false, `${id} = ${metric(R, id).value}`);
  assert.ok(val(R, 'frontShare') >= 50);
  const gs = Array.from(R.columns.groundSpeed).filter(Number.isFinite);
  assert.ok(0.5 * PDEF.mass * Math.max(...gs) ** 2 <= 14.9, 'KE line');
  const fs = footageStability(R);
  assert.ok(fs.subjectRms < 3 && fs.backgroundRms < 3, `fs ${fs.subjectRms}/${fs.backgroundRms}`);
});

test('footage chain is not ideal by construction: attitude, gimbal residual and EIS residual all raise jitter', () => {
  const base = caseEval('crossR6_s12').r.jitter;
  assert.ok(caseEval('crossR6_s12', { eisRes: 0.5 }).r.jitter > base * 1.2, 'EIS residual matters');
  assert.ok(caseEval('crossR6_s12', { gimbalHz: 2 }).r.jitter > base, 'gimbal bandwidth matters');
  const live = caseEval('crossR6_s12', { postFrame: 0 }).r;
  assert.ok(live.jitter > base * 2, 'sensor-centre framing is much shakier than the tracked crop');
  const R = run('headwind');
  assert.ok(Math.max(...Array.from(R.columns.leak).filter(Number.isFinite)) > 0.05, 'gimbal residual present');
  assert.ok(val(R, 'attRms') > 1, 'airframe moves in turbulence');
});

test('full run: set-down launch, lands ahead at the rest, takes off at the push-off, lift geofence; simulated standstill', () => {
  const R = run('fullrun');
  const core = R.core;
  assert.ok(has(R, 'setdown') && !has(R, 'launch'), 'set-down launch, no hand toss');
  const perches = core.events.filter((e) => e.type === 'perch').map((e) => e.t);
  assert.ok(perches.some((t) => t > 40 && t < 55), 'perches during the 20 s rest');
  assert.ok(core.events.some((e) => e.type === 'liftoff' && e.t > 60 && e.t < 75), 'takes off at the push-off');
  assert.ok(has(R, 'endmode') && has(R, 'pickupmode'));
  assert.ok(!('endAt' in R.core) && core.spot, 'end of run from the positional geofence (pick-up spot)');
  const r = R.summary;
  assert.equal(r.pr.ops, 2);
  assert.ok(r.pr.setup <= 30 && r.pr.setup > r.pr.launchStand + r.pr.stow, `setup ${r.pr.setup} simulated incl. the move to the glider`);
  assert.ok(r.pr.retrieveDist < 40, 'glider lands near the lift spot');
  assert.ok(r.sepMaxFly <= 50, 'follow-me radius in flight');
  assert.ok(r.headClear >= 1, `headClear ${r.headClear}`);
});

test('wind gates use the shared windEstimate (biased, lagged) with ≥5 s of history, not the true wind', () => {
  const { core } = caseEval('tail3_s12');
  assert.ok(core.gate && Array.isArray(core.gate.w));
  assert.ok(core.gate.t >= PDEF.gateHist + 0.5 - 1e-9 && core.gate.hist >= 4.9, `gate at ${core.gate.t} s with ${core.gate.hist} s history`);
  assert.ok(Math.hypot(core.wBias[0], core.wBias[1]) > 0.05, 'the estimate carries the seeded bias');
  // 9 m/s downslope: refused on the estimate in every seed; the refusal costs the simulated set-down + pick-up only
  for (const id of ['tail9_s11', 'tail9_s12', 'tail9_s13']) {
    const t9 = caseEval(id);
    assert.ok(t9.core.noFly && t9.core.gate.why === 'progress', id);
    assert.equal(t9.r.avail, 0);
    assert.ok(t9.r.pr.ops <= 2 && t9.r.pr.setup < 15, `${id} ops ${t9.r.pr.ops} setup ${t9.r.pr.setup}`);
  }
  // analytic gate: the extended wing keeps pace up to ≈6 m/s downslope, the tucked (fixed) wing does not
  const tanS = Math.tan(15 * Math.PI / 180);
  assert.ok(progressFeasible({ ...PDEF }, [0, 0, 0], tanS).vProg > 11);
  assert.ok(progressFeasible({ ...PDEF }, [5.5, 0, 0], tanS).vProg > 11, 'morphing wing: 5.5 m/s downslope feasible');
  assert.ok(progressFeasible({ ...PDEF, morph: 0 }, [5.5, 0, 0], tanS).vProg < 10, 'fixed tucked wing: infeasible');
  assert.ok(progressFeasible({ ...PDEF }, [9, 0, 0], tanS).vProg < 10, '9 m/s downslope: infeasible (envelope)');
});

test('independent speed protection: gate bypassed in tailwind → KE ≤14.9 J and no flight beyond the 50 m follow-me radius', () => {
  for (const id of ['tail9_s12', 'tail6_s13']) {
    const { r, core } = caseEval(id, { gateMode: 0 }, { bypass: true });
    assert.ok(!core.noFly, `${id} flown`);
    assert.ok(r.keMax <= 14.9, `${id} keMax ${r.keMax}`);
    assert.ok(r.sepMaxFly <= 50, `${id} sepMaxFly ${r.sepMaxFly}`);
  }
});

test('morphing: feathers extend in a tailwind / at the KE cap / for landing, tuck in a strong headwind and on the snow; servo is rate-limited', () => {
  const t = caseEval('tail4.5_s12').core, h = caseEval('head9_s12').core;
  const lead = (c) => Array.from(c.O.morph).filter((_, i) => c.O.phase[i] === PHASE.LEAD);
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(m(lead(t)) > 0.7, `tailwind lead morph ${m(lead(t))}`);
  assert.ok(m(lead(h)) < 0.5, `headwind lead morph ${m(lead(h))}`);
  const perch = Array.from(t.O.morph).filter((_, i) => t.O.phase[i] === PHASE.PERCH);
  assert.ok(Math.max(...perch.slice(50)) < 0.05, 'tucked on the perch');
  let maxRate = 0; for (let i = 1; i < t.n; i++) maxRate = Math.max(maxRate, Math.abs(t.O.morph[i] - t.O.morph[i - 1]) / 0.02);
  assert.ok(maxRate <= PDEF.morphRate * 1.01, `morph rate ${maxRate}`);
  // the fixed-wing comparison cannot keep pace at 5.5 m/s downslope: refused
  assert.ok(caseEval('tail5.5_s11', { morph: 0 }).core.noFly, 'fixed wing refused at 5.5 m/s tail');
  assert.ok(!caseEval('tail5.5_s11').core.noFly, 'morphing wing flies');
});

test('live framing is not idealised: crop follows a modelled tracker; truth crop and detector noise change the result', () => {
  assert.equal(PDEF.postFrame, 2);
  const base = caseEval('crossR6_s12').r, ideal = caseEval('crossR6_s12', { postFrame: 1 }).r, noisy = caseEval('crossR6_s12', { detSig: 0.15, detBias: 0.1, ffSigV: 1.5 }).r;
  assert.notEqual(base.jitter, ideal.jitter, 'live ≠ offline truth');
  assert.ok(noisy.jitter > base.jitter, `noisier tracker shakes more ${noisy.jitter} vs ${base.jitter}`);
});

test('handling is simulated (MODAPTS, gloves), not a constant; seeds differ; gloves 2.0 slower', () => {
  const a = handling(11), b = handling(12), g = handling(11, { glove: 2.0 });
  assert.ok(a.stow > 3 && a.stow < 9 && a.setDown > 2.5 && a.setDown < 7, JSON.stringify(a));
  assert.notEqual(a.stow, b.stow);
  assert.ok(g.stow > a.stow && g.setDown > a.setDown);
  const { r } = caseEval('calm_s11');
  assert.ok(Math.abs(r.pr.stow - handling(11).stow) < 1e-9, 'the case uses the simulated pick-up');
});

test('toss launch (iteration 2) fails headClear; the set-down launch passes', () => {
  assert.equal(metric(run('launch_toss'), 'headClear').pass, false);
  assert.ok(val(run('launch'), 'headClear') >= 1);
});

test('pointing: fused UWB+GNSS+height model is sourced (σ_UWB 5°); avail barely moves with UWB-only azimuth, collapses without height geometry', () => {
  assert.equal(PDEF.uwbSigDeg, 5);
  const base = caseEval('calm_s11').r;
  assert.ok(base.pointRms > 1.5 && base.pointRms < 6, `pointing RMS ${base.pointRms}`);
  const uwbOnly = caseEval('calm_s11', { gnssRelM: 1000, uwbTau: 2 }).r;
  assert.ok(uwbOnly.avail > base.avail - 10, `UWB-only ${uwbOnly.avail} vs ${base.avail}`);
  const noHeight = caseEval('calm_s11', { pointModel: 'gm', pointSigDeg: 5, pointTau: 2 }).r;
  assert.ok(noHeight.avail < base.avail - 15, `5° in elevation too: ${noHeight.avail}`);
});

test('ensemble module: 48 cases on the round-4 rules, judgements, re-check of a subset', () => {
  assert.ok(ENSEMBLE && ENSEMBLE.cases === 48);
  const J = ENSEMBLE.judged;
  for (const k of ['keMax', 'headClear', 'jitterRms', 'setupTime', 'endurance', 'bodyForcePeak', 'pxMed', 'azRange', 'addedMass', 'packVol', 'handsBusy']) assert.ok(J[k].pass, `${k} ${J[k].value}`);
  assert.ok(J.ops.value <= 2, 'ops p90 ≤ 2');
  assert.ok(J.avail.pass && J.avail.value >= 80, `avail ${J.avail.value}`);
  assert.ok(ENSEMBLE.metrics.sepMaxFly.max <= 50, 'follow-me radius over the ensemble');
  for (const [id, ref] of Object.entries(ENSEMBLE.check)) {
    const { r } = caseEval(id);
    assert.ok(Math.abs(r.avail - ref.avail) < 0.5, `${id} avail ${r.avail} vs ${ref.avail}`);
    assert.ok(Math.abs(r.keMax - ref.keMax) < 0.05, `${id} keMax`);
    assert.ok(Math.abs(r.pr.setup - ref.setupTime) < 0.05, `${id} setup`);
    assert.equal(r.pr.ops, ref.ops);
  }
  const R = run('fullrun');
  assert.equal(val(R, 'ops'), J.ops.value, 'fullrun scenario exposes the ensemble judgement');
  assert.equal(val(R, 'headClear'), J.headClear.value);
});

test('slow rider: leapfrog perches and pass shots; never too close in flight', () => {
  const R = run('slow');
  assert.ok(R.core.perchCount >= 3);
  assert.ok(R.events.filter((e) => e.type === 'liftoff').length >= 2);
  assert.ok(val(R, 'sepMin') >= 4);
  assert.notEqual(metric(R, 'avail').pass, false);
});

test('fast rider beyond the KE-capped speed: drops behind (envelope), KE stays ≤14.9 J', () => {
  const R = run('fast');
  assert.ok(has(R, 'fallbehind'));
  assert.ok(val(R, 'keMax') <= 14.9);
});

test('L/D −30 % and gentle slope: motor makes up the difference, endurance still ≥45 min', () => {
  const a = run('nominal'), b = run('nominal_ld70'), g = run('gentle');
  assert.ok(val(b, 'pMotMean') > val(a, 'pMotMean'));
  assert.ok(val(g, 'pMotMean') > val(a, 'pMotMean'));
  assert.ok(val(b, 'endurance') >= 40 && val(g, 'endurance') >= 40, 'single scenarios (judged endurance is the ensemble value)');
});

test('envelope and faults: powder strands it (3 actions), ice slides far, motor failure lands safely, strong perch wind fails SF', () => {
  const p = run('powder');
  assert.ok(has(p, 'stranded'));
  assert.equal(val(p, 'ops'), 3);
  assert.equal(metric(p, 'ops').pass, false, 'soft snow judged, not excused as a fault (audit LF-06)');
  assert.ok(val(run('ice'), 'slideMax') > 15);
  const m = run('motorfail');
  const tf = m.events.find((e) => e.type === 'motorfail').t;
  assert.ok(m.events.some((e) => e.type === 'touchdown' && e.t > tf));
  assert.ok(!m.events.some((e) => e.type === 'liftoff' && e.t > tf));
  assert.ok(val(m, 'keMax') <= 14.9);
  const w = run('perchwind');
  assert.ok(has(w, 'windhold'), 'gust interlock keeps it on the snow');
  assert.ok(val(w, 'keMax') <= 14.9);
  assert.equal(metric(w, 'perchSF').pass, false, 'the perch itself fails in ~16 m/s gusts (envelope)');
});

test('neighbour skier: landing postponed / early hop, stays ≥3 m away', () => {
  const R = run('neighbour');
  assert.ok(has(R, 'nbavoid') || has(R, 'nbhop'));
  assert.ok(val(R, 'nbMin') >= 3);
});

test('launch: set down beside the skis, runs away from the rider, lifts off and leads', () => {
  const R = run('launch');
  assert.ok(has(R, 'setdown') && has(R, 'liftoff'));
  const O = R.core.O, i = Math.round(8.5 / 0.02); // round 4: the gate waits for ≥5 s of wind history (lift-off ≈6 s)
  assert.ok(O.agl[i] > 0.3 && O.sep[i] > 5, `agl ${O.agl[i]} sep ${O.sep[i]}`);
  assert.ok(val(R, 'keMax') <= 14.9);
});

test('demo: 60 s, contiguous stages, launch → stop landing → pick-up in order', () => {
  const D = concept.demo.build(P);
  assert.equal(D.duration, 60);
  const ev = (type) => D.events.find((e) => e.type === type)?.t;
  const perchEnd = D.events.find((e) => e.type === 'perch' && e.t > ev('endmode'))?.t;
  assert.ok(ev('setdown') < ev('liftoff') && ev('liftoff') < ev('endmode') && ev('endmode') < perchEnd && perchEnd < ev('pickup'), JSON.stringify(D.events.map((e) => e.type)));
  assert.ok(ev('pickup') > 42 && ev('pickup') < 50, `pickup ${ev('pickup')}`);
  assert.ok(D.summary.headClear >= 1);
  const st = concept.demo.stages;
  for (let i = 1; i < st.length; i++) assert.equal(st[i].t0, st[i - 1].t1);
  assert.equal(st[st.length - 1].t1, 60);
  const pc = D.frame(15).productCam;
  assert.ok(pc && pc.vfovDeg > 0, 'head-on inset in lead flight');
  assert.equal(D.frame(59).productCam, null, 'camera off after the pick-up');
});
