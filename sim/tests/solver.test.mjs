// Code-verification checks for the browser solver (VV-02). Passing these shows the
// code implements the stated model; it says nothing about agreement with physical
// behaviour (VV-03, open).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, resultToJSON, resultFromJSON, resultToCSV, inputHash } from '../js/model/solver.js';
import { SCENARIOS, scenarioById } from '../js/model/scenarios.js';
import { defaultInputs, validateInputs, MODEL_CONSTANTS, MODEL } from '../js/model/config.js';

const steady = { id: 'steady', evidence: 'numerical', duration: 8, start: 'flight', speed: [[0, 1]], wind: [[0, 1]], reel: [[0, 'hold']], stages: [] };
const calmInputs = (o = {}) => ({ ...defaultInputs(), slopeDeg: 0, turnAmplitude: 0, gustIntensity: 0, rollStability: 1, ...o });
const last = (r, name) => r.columns[name][r.n - 1];

test('same inputs and seed reproduce identical results; seed changes gusts', () => {
  const sc = scenarioById('film_turns');
  const a = simulate(sc, defaultInputs()), b = simulate(sc, defaultInputs());
  assert.deepEqual(Array.from(a.columns.T), Array.from(b.columns.T));
  assert.equal(a.inputHash, b.inputHash);
  const c = simulate(sc, { ...defaultInputs(), seed: 2 });
  assert.notDeepEqual(Array.from(a.columns.T), Array.from(c.columns.T));
  assert.notEqual(a.inputHash, c.inputHash);
});

test('invalid inputs are rejected, not clamped', () => {
  assert.equal(validateInputs({ ...defaultInputs(), skierSpeed: -1 }).ok, false);
  assert.equal(validateInputs({ ...defaultInputs(), wingArea: NaN }).ok, false);
  assert.equal(validateInputs({ ...defaultInputs(), seed: 1.5 }).ok, false);
  assert.equal(validateInputs({ ...defaultInputs(), prePayout: 2.4, tetherMax: 2.0 }).ok, false);
  assert.throws(() => simulate(scenarioById('launch'), { ...defaultInputs(), CL: 9 }), /invalid inputs/);
  assert.throws(() => simulate(scenarioById('power_loss'), defaultInputs()), /no numerical model/);
});

test('steady flight matches analytic force balance (level ground, roll-stabilised lift)', () => {
  const P = calmInputs();
  const r = simulate({ ...steady, duration: 25 }, P); // lightly damped: allow settling
  assert.equal(r.validUntil, null);
  const tail = (name) => { let s = 0, n = 0; for (let i = r.n - 100; i < r.n; i++) { s += r.columns[name][i]; n++; } return s / n; };
  const V = P.skierSpeed + P.windSpeed; // head-on wind, kite at rest relative to skier
  const q = 0.5 * P.airDensity * P.wingArea * V * V;
  const lift = q * P.CL, drag = q * P.CD, W = P.airborneMass * MODEL_CONSTANTS.g.v;
  const Texp = Math.hypot(drag, lift - W);
  assert.ok(Math.abs(tail('airspeed') - V) / V < 0.002, `airspeed ${tail('airspeed')} vs ${V}`);
  assert.ok(Math.abs(tail('T') - Texp) / Texp < 0.005, `T ${tail('T')} vs ${Texp}`);
  // tether elevation angle = atan((L - W) / D)
  const dx = last(r, 'kx') - last(r, 'ax'), dz = last(r, 'kz') - last(r, 'az');
  const elev = Math.atan2(dz, -dx), elevExp = Math.atan2(lift - W, drag);
  assert.ok(Math.abs(elev - elevExp) < 0.01, `elevation ${elev} vs ${elevExp}`);
});

test('aerodynamic forces scale with ½ρSV² (unit consistency)', () => {
  const P = calmInputs();
  const r = simulate(steady, P);
  for (let i = 10; i < r.n; i += 37) {
    const q = 0.5 * P.airDensity * P.wingArea * r.columns.airspeed[i] ** 2;
    assert.ok(Math.abs(r.columns.lift[i] / q - P.CL) < 1e-9);
    assert.ok(Math.abs(r.columns.drag[i] / q - P.CD) < 1e-9);
  }
});

test('energy bookkeeping: ΔE ≈ aero work + tether work', () => {
  for (const id of ['film_turns', 'retrieval_crosswind', 'launch']) {
    const r = simulate(scenarioById(id), defaultInputs());
    let maxRes = 0;
    for (let i = 0; i < r.n; i++) if (Number.isFinite(r.columns.energyResidual[i])) maxRes = Math.max(maxRes, Math.abs(r.columns.energyResidual[i]));
    // integrator dissipation stays small relative to the kite's potential energy scale (~10 J)
    assert.ok(maxRes < 1.0, `${id}: energy residual ${maxRes} J`);
  }
});

test('time-step convergence: halving dt changes steady tension < 1 %', () => {
  const P = calmInputs({ rollStability: 0.7, turnAmplitude: 2 });
  const sc = { ...steady, duration: 6 };
  const a = simulate(sc, P);
  const dt0 = MODEL_CONSTANTS.dt.v;
  MODEL_CONSTANTS.dt.v = dt0 / 2;
  try {
    const b = simulate(sc, P);
    let rel = 0;
    for (let i = 0; i < a.n; i += 25) rel = Math.max(rel, Math.abs(a.columns.T[i] - b.columns.T[i]) / Math.max(1, b.columns.T[i]));
    assert.ok(rel < 0.01, `max relative tension difference ${rel}`);
  } finally { MODEL_CONSTANTS.dt.v = dt0; }
});

test('counterexamples raise invalid events in physical order; validUntil is the first one', () => {
  const r = simulate(scenarioById('wind_loss'), defaultInputs());
  const types = r.events.map((e) => e.type);
  assert.ok(types.indexOf('low_airspeed') >= 0 && types.indexOf('low_airspeed') < types.indexOf('ground_contact'));
  const firstInvalid = r.events.find((e) => e.severity === 'invalid');
  assert.equal(r.validUntil, firstInvalid.t);
  assert.ok(firstInvalid.t > 7, 'wind ramps to zero at 6–7 s');
  // after ground contact forces are unavailable (NaN), not invented
  const gi = Math.ceil(r.events.find((e) => e.type === 'ground_contact').t / r.sampleDt) + 1;
  assert.ok(Number.isNaN(r.columns.T[gi]));
  // valid flag drops at the first invalid event
  assert.equal(r.columns.valid[0], 1);
  assert.equal(r.columns.valid[r.n - 1], 0);
});

test('slack counterexample flags sustained slack', () => {
  const r = simulate(scenarioById('slack_overpayout'), defaultInputs());
  assert.ok(r.events.some((e) => e.type === 'slack' && e.severity === 'invalid'));
});

test('lift direction β=0 (tether-aligned point mass) is laterally unstable under gusts', () => {
  const r = simulate(scenarioById('film_turns'), { ...defaultInputs(), rollStability: 0 });
  assert.notEqual(r.validUntil, null);
});

test('near-end retrieval ends numerical scope without claiming handover', () => {
  const r = simulate(scenarioById('retrieval_crosswind'), defaultInputs());
  const ne = r.events.find((e) => e.type === 'near_end');
  assert.ok(ne);
  assert.equal(r.scopeEnd, ne.t);
  assert.ok(!r.events.some((e) => /handover|lock/.test(e.type)));
  assert.ok(Math.abs(last(r, 'L') - MODEL_CONSTANTS.nearEndLength.v) < 1e-6);
});

test('operator power limit bounds retrieval speed (no ideal operator)', () => {
  const P = { ...defaultInputs(), operatorPower: 5, retrievalRate: 2 };
  const r = simulate(scenarioById('retrieval_headwind'), P);
  for (let i = 0; i < r.n; i++) {
    const T = r.columns.T[i], Ld = r.columns.Ldot[i];
    if (Number.isFinite(T) && Ld < 0) assert.ok(-Ld * T <= P.operatorPower * 1.001 + 1e-9, `t=${r.columns.t[i]} speed ${-Ld} T ${T}`);
  }
});

test('JSON export round-trips, detects tampering, keeps failures; CSV has every sample', () => {
  const r = simulate(scenarioById('abrupt_stop'), defaultInputs());
  const j = JSON.parse(JSON.stringify(resultToJSON(r)));
  const back = resultFromJSON(j);
  assert.equal(back.validUntil, r.validUntil);
  assert.equal(back.events.length, r.events.length);
  assert.ok(back.events.some((e) => e.severity === 'invalid'));
  // a loaded result can be exported again and re-imported (replay → export → import)
  assert.doesNotThrow(() => resultFromJSON(JSON.parse(JSON.stringify(resultToJSON(back)))));
  j.events[0].t += 1;
  assert.throws(() => resultFromJSON(j), /checksum/);
  const csv = resultToCSV(r).trim().split('\n');
  assert.equal(csv.length, r.n + 2);
  assert.match(csv[0], /evidence=numerical-uncalibrated/);
});

test('bundled reference replays are current for this model version', () => {
  const idx = JSON.parse(readFileSync(new URL('../data/reference/index.json', import.meta.url)));
  const numeric = SCENARIOS.filter((s) => s.evidence === 'numerical').map((s) => s.id + '.json');
  assert.deepEqual([...idx.files].sort(), numeric.sort());
  for (const f of idx.files) {
    const ref = resultFromJSON(JSON.parse(readFileSync(new URL('../data/reference/' + f, import.meta.url))));
    assert.equal(ref.model.version, MODEL.version);
    const sc = scenarioById(ref.scenario);
    assert.equal(ref.inputHash, inputHash(sc, defaultInputs()), `${f} stale: run npm run gen-reference`);
    const fresh = resultToJSON(simulate(sc, defaultInputs()));
    assert.equal(JSON.parse(readFileSync(new URL('../data/reference/' + f, import.meta.url))).checksum, fresh.checksum, `${f} stale`);
  }
});
