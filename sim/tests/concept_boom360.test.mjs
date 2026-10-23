// boom360 (S1) physics sanity tests (SIM-030). Code verification of the numerical
// model only — not validation of the concept and not a physical test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import C, { cfgFor } from '../js/concepts/boom360/index.js';
import { Chain, design, modes, runBoom, footageAnalysis, rms, NSEG } from '../js/concepts/boom360/model.js';

const P = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const P1 = { ...P, design: 1 };
const P2 = { ...P, design: 2 };
const scen = (id) => C.scenarios.find((s) => s.id === id);
const metric = (R, id) => R.metrics.find((m) => m.id === id)?.value;

test('boom360: at least 6 scenarios incl. nominal, each with an expectation', () => {
  assert.ok(C.scenarios.length >= 6);
  assert.ok(scen('nominal'));
  for (const s of C.scenarios) assert.ok(s.expect?.zh && s.expect?.en, s.id);
});

test('boom360: lumped beam modes converge with segment count and match a Rayleigh estimate', () => {
  const d = design(P);
  const m6 = modes(d, 6), m24 = modes(d, 24);
  for (const pl of ['sag', 'lat']) {
    assert.ok(Math.abs(m6[pl][0] / m24[pl][0] - 1) < 0.02, `${pl} f1 ${m6[pl][0]} vs ${m24[pl][0]}`);
    assert.ok(Math.abs(m6[pl][1] / m24[pl][1] - 1) < 0.08, `${pl} f2 ${m6[pl][1]} vs ${m24[pl][1]}`);
    assert.ok(m6[pl][1] > 3 * m6[pl][0], `${pl} second mode well above the first`);
  }
  // lateral: uniform EI cantilever in series with the root spring, tip mass + 0.236 beam mass
  const EI = d.EIlat(), L = d.L;
  const k = 1 / (1 / ((3 * EI) / L ** 3) + 1 / (d.kRootLat / L ** 2));
  const f = Math.sqrt(k / (d.mTip + 0.236 * d.mTapes)) / (2 * Math.PI);
  assert.ok(Math.abs(m24.lat[0] / f - 1) < 0.06, `lat f1 ${m24.lat[0]} vs Rayleigh ${f}`);
});

test('boom360: undamped free vibration — energy never grows, numerical damping stays small (θ-method)', () => {
  const d = design(P);
  for (const a of [0, 1]) {
    const ch = new Chain(d, NSEG);
    ch.foldOn = false;
    ch.c.fill(0);
    const base = { r: [0, 0, 0], vr: [0, 0, 0], ar: [0, 0, 0], Q0: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), w: [0, 0, 0], dw: [0, 0, 0] };
    ch.kin(base);
    // static shape under a 1 N tip load in one plane (≈ first mode)
    for (let i = a; i < ch.n; i += 2) { const o = (ch.N * ch.n + i) * 3; ch.q[i] = ch.J[o + (a ? 1 : 2)] / ch.k[i]; }
    const energy = () => {
      ch.kin(base);
      let e = 0;
      for (let k = 1; k <= ch.N; k++) { const v = ch.vel; e += 0.5 * ch.m[k] * (v[3 * k] ** 2 + v[3 * k + 1] ** 2 + v[3 * k + 2] ** 2); }
      for (let i = 0; i < ch.n; i++) e += 0.5 * ch.k[i] * ch.q[i] ** 2;
      return e;
    };
    const e0 = energy();
    let grow = 0;
    const dt = 0.002;
    for (let s = 0; s < 1500; s++) { ch.kin(base); ch.F.fill(0); ch.Kc.length = 0; ch.solve(dt, null, s * dt); if (s % 25 === 0) grow = Math.max(grow, energy() / e0 - 1); }
    const r = energy() / e0;
    assert.ok(grow < 1e-3, `plane ${a}: energy grows ${grow}`);
    // equivalent numerical damping ratio at the first mode stays below 0.5 %
    const f1 = modes(d)[a ? 'lat' : 'sag'][0];
    const zeta = -Math.log(r) / (2 * 2 * Math.PI * f1 * 3);
    assert.ok(r <= 1 && zeta < 0.005, `plane ${a}: energy ratio ${r}, ζ_num ${zeta}`);
  }
});

test('boom360: static root moment equals the gravity moment of the boom (standing, deployed, v1)', () => {
  const R = C.simulate(P1, scen('cycle'));
  const i = R.index(6.5);
  const Mp = Math.abs(R.columns.Mpitch[i]);
  const d = design(P1);
  // boom elevation in the world = torso-frame alpha + standing torso pitch (crouch ≈ 0.2)
  const elev = d.alpha + (0.18 + 0.42 * 0.2);
  const Mg = 9.81 * Math.cos(elev) * (d.mTip * d.L + (d.mTapes * d.L) / 2);
  assert.ok(Math.abs(Mp / Mg - 1) < 0.2, `pitch moment ${Mp} vs hand calc ${Mg}`);
});
test('boom360: results converge with the time step (nominal, 4 ms vs 1 ms)', () => {
  const run = (dt) => {
    const { cfg } = cfgFor(P, scen('nominal'));
    cfg.duration = 10; cfg.dt = dt;
    const raw = runBoom(P, cfg);
    const fa = footageAnalysis(raw, P);
    return { tr: rms(fa.transMm, fa.filming), M: rms(raw.Mmag), lat: rms(raw.defLat) };
  };
  const a = run(0.004), b = run(0.001);
  for (const k of ['tr', 'M', 'lat']) assert.ok(Math.abs(a[k] / b[k] - 1) < 0.06, `${k}: ${a[k]} vs ${b[k]}`);
});

test('boom360: nominal carving (v3) keeps the fuse closed, full-body framing, better than v1', () => {
  const R = C.simulate(P, scen('nominal')), R1 = C.simulate(P1, scen('nominal'));
  assert.equal(metric(R, 'foldCount'), 0);
  assert.ok(metric(R, 'rootMomentSus') < 25);
  assert.ok(metric(R, 'f1Lat') >= 3);
  assert.ok(metric(R, 'avail') > 90 && metric(R, 'pxMed') > 300);
  assert.ok(metric(R, 'jitterRms') < 0.5 * metric(R1, 'jitterRms'), `${metric(R, 'jitterRms')} vs v1 ${metric(R1, 'jitterRms')}`);
});
test('boom360: backward fall — the tape fold limits the root moment by an order of magnitude vs no fold', () => {
  for (const pp of [P1, P]) {
    const R = C.simulate(pp, scen('fallBack'));
    assert.ok(metric(R, 'foldCount') >= 1, 'fuse acts');
    const pk = metric(R, 'rootMomentPeak'), noFold = metric(R, 'rootMomentNoFold');
    assert.ok(pk <= 60, `peak ${pk}`); // fuse 25–45 N·m + impact overshoot (reported)
    assert.ok(noFold > 5 * pk, `no-fold ${noFold} vs ${pk}`);
    assert.ok(R.events.some((e) => e.type === 'retract'), 'auto-retract (IMU fall detection or persistent fold)');
    assert.ok(R.events.some((e) => e.type === 'stowed'), 'auto-retract completes');
  }
});
test('boom360: crosswind bends the boom out of the stitch plane more than nominal', () => {
  const a = C.simulate(P1, scen('nominal')), b = C.simulate(P1, scen('gust'));
  const latA = rms(a.columns.defLat), latB = rms(b.columns.defLat);
  assert.ok(latB > 2 * latA, `lateral deflection ${latB} vs ${latA}`);
  assert.ok(metric(b, 'stickVisible') > metric(a, 'stickVisible'));
});

test('boom360: damper failure increases the jitter in moguls (v3)', () => {
  const a = C.simulate(P, scen('moguls')), b = C.simulate(P, scen('damperFail'));
  assert.ok(metric(b, 'jitterRms') > metric(a, 'jitterRms'), `${metric(b, 'jitterRms')} vs ${metric(a, 'jitterRms')}`);
});
test('boom360: root stabiliser cuts mogul jitter; pack-IMU feed-forward stable, housing IMU diverges', () => {
  const on = C.simulate(P, scen('moguls')), off = C.simulate({ ...P, stab: 0 }, scen('moguls'));
  assert.ok(metric(on, 'jitterRms') < 0.5 * metric(off, 'jitterRms'), `${metric(on, 'jitterRms')} vs ${metric(off, 'jitterRms')}`);
  const run = (sense) => { const { cfg } = cfgFor(P2, scen('nominal')); cfg.duration = 6; cfg.stabSense = sense; return runBoom(P2, cfg); };
  assert.equal(run('pack').foldCount, 0, 'pack IMU (torso side): no instability');
  assert.ok(run('housing').foldCount > 0, 'IMU on the boom side of the elastomer closes a loop through the boom modes');
});
test('boom360 v2/v3: magnetic breakaway caps the snag pull (v1 does not)', () => {
  const s1 = C.simulate(P1, scen('snag')), s3 = C.simulate(P, scen('snag'));
  assert.ok(s3.events.some((e) => e.type === 'breakaway'));
  assert.ok(metric(s3, 'bodyForcePeak') <= 40, `v3 snag ${metric(s3, 'bodyForcePeak')}`);
  assert.ok(metric(s1, 'bodyForcePeak') > 40, `v1 snag ${metric(s1, 'bodyForcePeak')}`);
});
test('boom360: stitch yaw trim reduces crosswind stick visibility; a lateral third tape would show', () => {
  const on = C.simulate(P2, scen('gust')), off = C.simulate({ ...P2, stitchTrim: 0 }, scen('gust'));
  assert.ok(metric(on, 'stickVisible') < metric(off, 'stickVisible'), `trim ${metric(on, 'stickVisible')} vs ${metric(off, 'stickVisible')}`);
  const tri = C.simulate({ ...P2, tapes: 3, latSpread: 0.05 }, scen('nominal'));
  assert.ok(metric(tri, 'stickVisible') > 50 && metric(tri, 'f1Lat') > metric(on, 'f1Lat'));
});
test('boom360: auto-retract before the chairlift; deploy/stow cycle within the setup budget', () => {
  const L = C.simulate(P, scen('lift'));
  assert.equal(metric(L, 'liftOk'), 'yes');
  const Cy = C.simulate(P, scen('cycle'));
  assert.ok(metric(Cy, 'setupTime') < 60);
  assert.ok(metric(Cy, 'deployMoment') < 25);
  assert.equal(Cy.events.filter((e) => e.type === 'locked').length, 2);
});

test('boom360: demo covers the full use cycle (deploy, fall-fold, auto-retract, redeploy, stow)', () => {
  const R = C.demo.build(P);
  const types = R.events.map((e) => e.type);
  for (const t of ['deploy', 'locked', 'fold', 'fallDetect', 'stowed']) assert.ok(types.includes(t), t);
  assert.equal(types.filter((t) => t === 'locked').length, 2);
  const f = R.frame(15);
  assert.ok(f.productCam && f.device.state === 3);
  assert.equal(R.frame(2).productCam, null, 'no inset while stowed');
});

test('boom360 v3: subject-relative tip stabilisation beats an inertially steady tip (hypothesis falsified)', () => {
  const rel = C.simulate(P, scen('nominal')), inert = C.simulate({ ...P, stab3Mode: 1 }, scen('nominal'));
  assert.ok(metric(rel, 'jitterRms') < metric(inert, 'jitterRms'), `${metric(rel, 'jitterRms')} vs inertial ${metric(inert, 'jitterRms')}`);
});
test('boom360 v3: commandable ±45° side view gives azRange ≥ 45° with rider clearance; actuator goes limp in a fall', () => {
  const R = C.simulate(P, scen('nominal'));
  assert.ok(metric(R, 'azRange') >= 45, `azRange ${metric(R, 'azRange')}`);
  assert.ok(metric(R, 'clearance') >= 0.05);
  const F = C.simulate(P, scen('fallBack'));
  assert.ok(F.events.some((e) => e.type === 'limp'));
});
