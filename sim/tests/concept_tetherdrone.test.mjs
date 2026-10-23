// S3 tetherdrone (SIM-030, iteration 3.1) model checks: physics sanity, dt
// convergence, harmonised metrics, and the qualitative behaviour each v1/v2
// scenario is meant to exercise. Code verification of an uncalibrated
// simulation only — not validation of the concept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import concept from '../js/concepts/tetherdrone/index.js';
import { runCore, rotorPower, tetherElectrical, PDEF } from '../js/concepts/tetherdrone/model.js';
import { simulateSkier } from '../js/concepts/common/skier.js';
import { CRITERIA, footageStability } from '../js/concepts/common/criteria.js';

const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const scen = (id) => concept.scenarios.find((s) => s.id === id);
const metric = (R, id) => R.metrics.find((m) => m.id === id);
const val = (R, id) => metric(R, id).value;
const cache = {};
const run = (id) => (cache[id] ||= concept.simulate(P, scen(id)));
const max = (a) => { let m = -Infinity; for (const v of a) if (Number.isFinite(v) && v > m) m = v; return m; };

test('power model: v1 reproduces calc_tether.py; v2 56 V/0.09 mm² stays under 5 % loss and 24 V cannot feed v1', () => {
  const p1 = { ...PDEF, mass: 0.18 };
  const Ph = rotorPower(0.18 * 9.81, [0, 0, 1], [0, 0, 0], p1);
  assert.ok(Math.abs(Ph - 32.4) < 0.7, `hover ${Ph}`);
  const e100 = tetherElectrical(75, 100, 6, p1);
  assert.ok(e100.ok && Math.abs(e100.loss / 75 - 0.031) < 0.004, `loss ${e100.loss}`);
  assert.equal(tetherElectrical(45, 24, 6, p1).ok, false);
  const p2 = { ...PDEF, cuArea: 0.09 };
  const e56 = tetherElectrical(45, 56, 10, p2);
  assert.ok(e56.ok && e56.loss / 45 < 0.065, `56 V loss ${e56.loss / 45}`);
  // the lighter v2 airframe needs well under v1 hover power
  const h2 = rotorPower(0.12 * 9.81, [0, 0, 1], [0, 0, 0], { ...PDEF, rotorR: 0.032, fom: 0.36 });
  assert.ok(h2 < Ph * 0.75, `v2 hover ${h2}`);
});

test('all 11 harmonised metrics are reported with the shared thresholds', () => {
  const R = run('nominal');
  for (const id of Object.keys(CRITERIA)) {
    if (id === 'packVol' || id === 'headClear') continue; // added in round 2 (2026-10-19/20); round-1 concepts are not re-assessed on them
    const m = metric(R, id);
    assert.ok(m, `missing ${id}`);
    if (typeof m.value === 'number') assert.ok(m.criterion && m.pass !== null, `${id} judged`);
  }
});

test('nominal v3: tension near set-point, limits, no artefact over the subject, KE ≤ 14.9 J, touch-safe bus, nothing protruding', () => {
  const R = run('nominal');
  const T = R.columns.tension;
  let s = 0, k = 0; for (let i = 100; i < R.n; i++) { s += T[i]; k++; }
  assert.ok(Math.abs(s / k - P.Tset) < 0.4, `mean tension ${s / k}`);
  assert.ok(max(R.columns.tilt) <= P.tiltMax + 0.5);
  assert.ok(max(R.core.O.thrust) <= P.twr * P.mass * 9.81 + 1e-6);
  assert.ok(val(R, 'avail') >= 80 && val(R, 'artFrames') < 20);
  assert.ok(val(R, 'keMax') <= 14.9 && metric(R, 'elecSafe').pass === true);
  assert.ok(val(R, 'endurance') >= 45 && val(R, 'bodyForcePeak') < 5);
  assert.equal(metric(R, 'protrusion').pass, true);
  assert.equal(metric(run('nominal_v2'), 'protrusion').pass, false, 'v2 hip boom is a catch point');
});

test('v1 baseline under harmonised rules: fails KE, touch-safe voltage and artefact-free availability', () => {
  const R = run('nominal_v1');
  assert.equal(metric(R, 'keMax').pass, false);
  assert.equal(metric(R, 'elecSafe').pass, false);
  assert.ok(val(R, 'artFrames') > val(run('nominal'), 'artFrames') + 20);
  assert.ok(val(R, 'availInpaint') > val(R, 'avail'), 'inpainting credit is reported separately and is larger');
});

test('dt convergence: halving the tether substep changes tension and drone track only slightly', () => {
  const sk = simulateSkier({ duration: 11 });
  const sc = { duration: 10, skier: sk, wind: { mean: [0, 2, 0], intensity: 0.2, seed: 7 }, plan: {} };
  const p = { ...P };
  const a = runCore(p, { ...sc, subFactor: 0.75 }), b = runCore(p, { ...sc, subFactor: 0.375 });
  // compare 0.2 s mean tension: sub-0.2 s line chatter near slack is not dt-convergent (raw rms diff ≈0.17 N of 0.83 N
  // after the 2026-10-19 oblique-gust wind; the 0.2 s mean converges 0.015 → 0.011 N on further halving)
  const ma = (x, w = 10) => { const o = new Float64Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= w) s -= x[i - w]; o[i] = s / Math.min(i + 1, w); } return o; };
  const TA = ma(a.O.T0), TB = ma(b.O.T0);
  let dT = 0, dR = 0, dX = 0, n = 0;
  for (let i = 100; i < a.n; i++) { dT += (TA[i] - TB[i]) ** 2; dR += (a.O.T0[i] - b.O.T0[i]) ** 2; dX += (a.O.dx[i] - b.O.dx[i]) ** 2 + (a.O.dy[i] - b.O.dy[i]) ** 2 + (a.O.dz[i] - b.O.dz[i]) ** 2; n++; }
  assert.ok(Math.sqrt(dT / n) < 0.05, `0.2 s tension rms diff ${Math.sqrt(dT / n)}`);
  assert.ok(Math.sqrt(dR / n) < 0.25, `raw tension rms diff ${Math.sqrt(dR / n)}`);
  assert.ok(Math.sqrt(dX / n) < 0.05, `drone rms diff ${Math.sqrt(dX / n)}`);
});

test('fall: detected, drone keeps clear of the head', () => {
  const R = run('fall');
  assert.ok(R.events.some((e) => e.type === 'fall') && R.validUntil != null);
  assert.ok(val(R, 'headMin') > 1.0 && val(R, 'keMax') <= 14.9);
});

test('snag: v2 cutter frees the line (nothing left on the branch); weak-link-only leaves the tether in the tree', () => {
  const A = run('snag'), B = run('snag_wl');
  assert.ok(A.events.some((e) => e.type === 'snag') && A.events.some((e) => e.type === 'cut') && A.events.some((e) => e.type === 'unhooked'));
  assert.equal(metric(A, 'leftOnObstacle').pass, true);
  assert.ok(val(A, 'bodyForcePeak') <= 40 && val(A, 'branchMin') >= 0.3);
  assert.ok(A.events.some((e) => e.type === 'landed'));
  assert.equal(metric(B, 'leftOnObstacle').pass, false);
});

test('power interruption: drone lands on the backup cell with energy left', () => {
  const R = run('power');
  assert.ok(R.events.some((e) => e.type === 'landed') && !R.events.some((e) => e.type === 'drop'));
  assert.ok(val(R, 'backupLeft') > 10);
});

test('docking: telescopic mast keeps the rotors ≥0.8 m from the helmet at 3 and 9 m/s and docks; v1 pack dome does not', () => {
  for (const id of ['dock', 'dock_wind']) {
    const R = run(id);
    assert.ok(R.events.some((e) => e.type === 'docked'), `${id} docked`);
    assert.ok(val(R, 'headLaunch') >= 0.8 && val(R, 'dockErr') <= 10, id);
    assert.ok(val(R, 'setupTime') <= 30, id);
  }
  assert.ok(max(run('dock').columns.reelL) > 5, 'paid out to ~6 m');
  const V1 = concept.simulate({ ...P, design: 1 }, scen('dock'));
  assert.ok(val(V1, 'headLaunch') < 0.3);
});

test('envelope: 18 m/s keeps KE ≤ 14.9 J and ≥45 min; gust keeps ≥45 min and footage', () => {
  const F = run('fast'), G = run('gust');
  assert.ok(val(F, 'keMax') <= 14.9 && val(F, 'endurance') >= 45 && val(F, 'avail') >= 80);
  assert.ok(val(G, 'endurance') >= 45 && val(G, 'avail') >= 80);
});

test('geometry: v3 swaps the eyelet with the station side, so both side views stay clean (v2 could not)', () => {
  assert.ok(val(run('side'), 'artFrames') < 10);
  assert.ok(val(run('side_left'), 'artFrames') < 10);
  assert.ok(val(concept.simulate({ ...P, design: 2 }, scen('side_left')), 'artFrames') > 20);
});

test('demo: physics-driven v3 cycle docks before the end', () => {
  const D = concept.demo.build(P);
  assert.ok(D.events.some((e) => e.type === 'docked' && e.t < concept.demo.duration - 1));
  assert.ok(D.frame(20).productCam && !D.frame(1).productCam);
});

test('v3.1 footage stability: smoothed station + 6 Hz subject tracker keep short-turn jitter under 3 °/s (both measures)', () => {
  const R = run('short');
  assert.ok(val(R, 'jitterRms') < 3, `jitterHP ${val(R, 'jitterRms')}`);
  const fs = footageStability(R);
  assert.ok(fs.subjectRms < 2.5 && fs.backgroundRms < 3.5, `subject ${fs.subjectRms} background ${fs.backgroundRms}`);
  // the v3 station (unsmoothed, slow tracker) was worse on the same check
  const old = footageStability(concept.simulate({ ...P, stationTau: 0, gimbalBW: 0 }, scen('short')));
  assert.ok(old.subjectRms > fs.subjectRms && old.backgroundRms > fs.backgroundRms);
});

test('v3.1 power loss: drone holds a high station until the rider stops, then lands behind with energy left', () => {
  const R = run('power');
  assert.ok(R.events.some((e) => e.type === 'landed') && val(R, 'backupLeft') > 10);
  assert.ok(val(R, 'clearPole') > 0.3 && val(R, 'clearSki') > 0.3);
});
