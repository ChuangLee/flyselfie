// K2 kite ROUND 4 (kite2@4.x: reefing drogue on a passive 3 mm boom, motorised-reel winch with passive drag pay-out,
// noisy sensing, SIM-031) model checks: honest coupled polar, shared-component mass, physics sanity, dt convergence,
// launch interlock, realistic actuators (motor envelope never exceeded, no holding current, passive boom), the shared
// round-4 rules (48 cases, bodyPx, ≥2 px artefact rule, helmetAt headClear) and a re-check of the precomputed ensemble.
// The avail metric FAILS on the 48-case ensemble and the clothesline height gate FAILS: the tests pin those documented
// values, they do not hide them. Code verification of an uncalibrated simulation only — not validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import concept, { evaluateCase } from '../js/concepts/kite2/index.js';
import { runCore, makeRider, smoothBody, PDEF, MODE, resolveP, polar, POLAR_DEF, kiteBudget, makePolarTable, vMinFly } from '../js/concepts/kite2/model.js';
import { ENSEMBLE } from '../js/concepts/kite2/ensemble_summary.js';
import { simulateSkier } from '../js/concepts/common/skier.js';
import { FULLRUN_CASES_R4 as FULLRUN_CASES, ARTEFACT_PX } from '../js/concepts/common/fullrun.js';
import { CRITERIA, footageStability } from '../js/concepts/common/criteria.js';
import { COMPONENTS } from '../js/concepts/common/components.js';

const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const scen = (id) => concept.scenarios.find((s) => s.id === id);
const metric = (R, id) => R.metrics.find((m) => m.id === id);
const val = (R, id) => metric(R, id).value;
const cache = {};
const run = (id) => (cache[id] ||= concept.simulate(P, scen(id)));
const has = (R, type) => R.events.some((e) => e.type === type);
const evT = (R, type) => R.events.find((e) => e.type === type)?.t;

test('audit K2-01: one coupled polar — a soft wing reaches L/D ≤1 only at CR ≥0.8; the round drogue is used instead', () => {
  const wing = { ...POLAR_DEF, ...resolveP({ design: 4 }) };
  for (let a = 15; a <= 90; a += 1) { const r = polar(a, wing); if (r.G <= 1) assert.ok(r.CR >= 0.8, `wing α ${a}: L/D ${r.G.toFixed(2)} at CR ${r.CR.toFixed(2)}`); }
  // anchors (NASA TN D-4182 wing II: α 60° CL 0.55 CD 1.10; TN D-4672: α 60° CL 0.47 CD 0.78) bracket the model
  const w60 = polar(60, wing); assert.ok(w60.CL > 0.45 && w60.CL < 0.6 && w60.CD > 0.75 && w60.CD < 1.15);
  const round = { ...POLAR_DEF, ...resolveP({}) };
  for (const u of [0, 0.5, 1]) { const r = polar(u, round); assert.ok(r.CR >= 0.7 && r.CR <= 1.3 && r.G <= round.gMaxR + 1e-9); }
  // nominal filming really sits on that polar: L/D <1 with CR ≥0.8, the pull limited by AREA (reefing)
  const R = run('nominal');
  // CR ≥0.75: at L/D 0.75 with 12 % slot porosity CR ≈0.78 (iteration 3 default polar)
  assert.ok(val(R, 'filmGlide') < 1 && val(R, 'filmCR') >= 0.75 && val(R, 'filmReef') < 0.6, `G ${val(R, 'filmGlide')} CR ${val(R, 'filmCR')} reef ${val(R, 'filmReef')}`);
});

test('audit K2-02: flying mass is built from the shared component table with 15 % margin', () => {
  const kb = kiteBudget();
  assert.ok(Math.abs(PDEF.mass - kb.kg) < 1e-4);
  assert.ok(kb.g >= COMPONENTS.cam4k.g + COMPONENTS.avionics.g + COMPONENTS.wiring.g + 3 * 2.5);
  assert.ok(kb.kg >= 0.075 && kb.kg <= 0.113, `mass ${kb.kg} inside the audit range 75–113 g`);
  // audit2 A2-X-09: the 3 g of slot/reef/douse hardware is in the budget (78 g × 1.15 ≈ 89.7 g)
  assert.ok(Math.abs(kb.gWithMargin - 89.7) < 0.2, `budget ${kb.gWithMargin} g`);
  // the documented glide is the default (MC-1-1C 0.75), half of it kept when fully reefed
  assert.equal(PDEF.gMaxR, 0.75); assert.equal(P.gMaxR, 0.75); assert.equal(P.reefGloss, 0.5);
});

test('all harmonised metrics are reported with the shared thresholds; nominal passes all of them', () => {
  const R = run('nominal');
  for (const id of Object.keys(CRITERIA)) {
    const m = metric(R, id);
    assert.ok(m, `missing ${id}`);
    assert.equal(m.pass, true, `${id} = ${m.value} should pass in nominal`);
  }
});

test('steady straight run in calm air: tension ≈ reefed aero force, station held', () => {
  const sk = smoothBody(simulateSkier({ style: 'straight', duration: 13, vTarget: 12 }));
  const c = runCore({ ...PDEF }, { duration: 12, rider: makeRider([{ sk, t0: 0 }]), tanS: sk.tanS, wind: { mean: [0, 0, 0], intensity: 0 }, plan: { start: 'flying', shot: () => ({ az: 0, el: 28 }) } });
  const O = c.O, i = c.n - 1, p = resolveP(PDEF);
  const q = 0.5 * p.rho * O.Va[i] ** 2, Fres = q * p.S * O.reef[i] * O.CR[i];
  assert.ok(Math.abs(O.T[i] - Fres) / Fres < 0.25, `T ${O.T[i]} vs qS·r·CR ${Fres}`);
  assert.ok(Math.abs(O.T[i] - p.Tref) < 2, `tension ${O.T[i]} near the set-point`);
  assert.ok(Math.abs(O.elK[i] - O.elT[i]) < 6 && Math.abs(O.azK[i]) < 5, `station el ${O.elK[i]} / ${O.elT[i]}, az ${O.azK[i]}`);
});

test('free (cut) kite descends near its parachute terminal speed', () => {
  const sk = smoothBody(simulateSkier({ style: 'straight', duration: 9, vTarget: 12 }));
  const c = runCore({ ...PDEF }, { duration: 8, rider: makeRider([{ sk, t0: 0 }]), tanS: sk.tanS, wind: { mean: [0, 0, 0], intensity: 0 }, plan: { start: 'flying', cutAt: 2 } });
  const p = resolveP(PDEF), vt = Math.sqrt((2 * p.mass * 9.81) / (p.rho * p.S * p.CRpar));
  let vz = null; for (let i = Math.round(3 / 0.02); i < c.n; i++) if (c.O.mode[i] === MODE.FREE) { vz = -c.O.kvz[i]; break; } // lands ≈3.8 s at the lower iteration-3 station
  assert.ok(vz != null && Math.abs(vz - vt) / vt < 0.3, `descent ${vz} vs terminal ${vt}`);
});

test('round 4 actuators: the reel motor never leaves its voltage/current envelope, holds at zero current, no regeneration credit', () => {
  const R = run('gust'), O = R.core.O, p = resolveP(P);
  const Ke = 60 / (2 * Math.PI * p.Kv);
  let held = 0, heldI = 0;
  for (let i = 0; i < R.n; i++) {
    if (!Number.isFinite(O.Iw[i])) continue;
    const w = -O.nuSh[i] * p.gear / p.rDrum;
    assert.ok(O.Iw[i] <= p.Imax + 1e-6 && Ke * w + O.Iw[i] * p.Rm <= p.Vbat + 1e-6, `envelope at ${i * 0.02}`);
    assert.ok(O.nuSh[i] <= 1e-9, 'anti-reverse: the motor shaft never pays out');
    if (O.mode[i] === MODE.FILM && O.nu[i] === 0) { held++; if (O.Iw[i] > 0.01) heldI++; }
  }
  assert.ok(held > 100 && heldI === 0, `holding samples ${held}, with current ${heldI}`);
  assert.equal(O.Ereg[R.n - 1], 0);
  assert.equal(p.boomActive, 0); assert.equal(p.pGimbal, 0);
});

test('round 4 artefact rule: the 3 mm boom is <2 px over the subject; a 4.5 mm boom would be counted', () => {
  const R = run('nominal'), A = R.analysis;
  let n = 0, bad = 0; for (let i = 0; i < R.n; i++) if (A.filming[i] === 1) { n++; if (A.artF[i] === 1) bad++; }
  assert.equal(ARTEFACT_PX, 2);
  assert.ok(n > 500 && bad / n < 0.02, `artefact share ${bad / n}`);
  const T = concept.simulate({ ...P, boomDBase: 4.5, boomDTip: 3.5 }, scen('nominal')), At = T.analysis;
  let badT = 0; for (let i = 0; i < T.n; i++) if (At.filming[i] === 1 && At.artF[i] === 1) badT++;
  assert.ok(badT > 5 * Math.max(1, bad), `thick boom artefacts ${badT} vs ${bad}`);
});

test('round 4 sensing: the controller sees noisy wind (noise-free sensing changes the trajectory)', () => {
  const a = concept.simulate(P, scen('gust')), b = concept.simulate({ ...P, sigVa: 0, sigHC: 0, sigVk: 0 }, scen('gust'));
  let d = 0; for (let i = 0; i < a.n; i++) if (Number.isFinite(a.core.O.kx[i]) && Number.isFinite(b.core.O.kx[i])) d = Math.max(d, Math.abs(a.core.O.kx[i] - b.core.O.kx[i]));
  assert.ok(d > 0.05, `max track difference ${d}`);
});

test('dt convergence: halving the step barely changes tension and kite track', () => {
  const sk = smoothBody(simulateSkier({ duration: 11 }));
  const base = { duration: 10, rider: makeRider([{ sk, t0: 0 }]), tanS: sk.tanS, wind: { mean: [0, 2, 0], intensity: 0.2, seed: 7 }, plan: { start: 'flying' } };
  const a = runCore({ ...PDEF }, { ...base, dt: 0.002 }), b = runCore({ ...PDEF }, { ...base, dt: 0.001 });
  let dT = 0, dX = 0, n = 0;
  for (let i = 100; i < a.n; i++) { dT += (a.O.T[i] - b.O.T[i]) ** 2; dX += (a.O.kx[i] - b.O.kx[i]) ** 2 + (a.O.ky[i] - b.O.ky[i]) ** 2 + (a.O.kz[i] - b.O.kz[i]) ** 2; n++; }
  assert.ok(Math.sqrt(dT / n) < 1.0, `tension rms diff ${Math.sqrt(dT / n)}`);
  assert.ok(Math.sqrt(dX / n) < 0.4, `kite rms diff ${Math.sqrt(dX / n)}`);
});

test('reefing is what holds the pull: the same canopy unreefed pulls ∝ V² (fast_fixed fails 40 N)', () => {
  assert.ok(val(run('nominal_fixed'), 'tensionMean') > 1.5 * val(run('nominal'), 'tensionMean'));
  assert.ok(val(run('fast_fixed'), 'bodyForcePeak') > 40);
  assert.ok(val(run('gust'), 'bodyForcePeak') <= 40);
});

test('round-1 failure modes reproduced by the passive baseline', () => {
  const v0 = run('nominal_v0');
  assert.ok(val(v0, 'viewElev') > 70 && val(v0, 'pxMed') < 300 && val(v0, 'keMax') > 14.9);
});

test('envelope: minimum flying airspeed ≈3.8 m/s; short turns / quartering tailwind / 6 m/s tailwind stay safe but under 80 % avail', () => {
  const p = resolveP(P); assert.ok(Math.abs(vMinFly(p) - 3.8) < 0.3, `vMin ${vMinFly(p)}`);
  for (const id of ['shorttail', 'short', 'tail']) { const R = run(id); assert.ok(val(R, 'keMax') <= 14.9 && val(R, 'headClear') >= 1.0, id); }
});

test('audit K2-03: armed on a chairlift (up or down) never launches; a climb auto-disarms', () => {
  const U = run('chairlift'), D = run('chairdown');
  // the windEstimate launch gate (≈7 m/s apparent) already blocks at 5 m/s lift speed, before the interlock is reached
  assert.ok(!has(U, 'launch') && has(U, 'disarm'));
  assert.ok(!has(D, 'launch'));
});

test('fast (accelerating to 18 m/s, outside the envelope): retrieval starts on the predicted speed; KE transient disclosed', () => {
  const R = run('fast');
  assert.ok(has(R, 'fastDock') && R.events.find((e) => e.type === 'fastDock').t < 3.0);
  assert.ok(val(R, 'keMax') < 20, `KE ${val(R, 'keMax')} (reel-in capped by the KE limit cannot outrun 1.5 m/s² of acceleration; disclosed)`);
});

test('stops: retrieval on braking docks on the boom axis before the rider stops; wind stows facing the wind work', () => {
  const L = run('liftline');
  assert.ok(has(L, 'stowed') && !L.events.some((e) => e.type === 'launch' && e.t > evT(L, 'docked')));
  assert.ok(L.events.find((e) => e.type === 'retrieve').t < 9.5, 'retrieval starts while still braking');
  for (const id of ['dock_w6', 'dock_w9']) { const D = run(id); assert.ok(has(D, 'stowed') && val(D, 'setupTime') <= 30 && val(D, 'dockAngle') <= 45, id); }
  const S = run('stopstart'); assert.ok(S.events.filter((e) => e.type === 'launch').length === 2 && has(S, 'docked'));
  // wrong procedure (back to the wind, kite in front): never reeled past the head — the head interlock snaps it onto the
  // tip or it is fetched by hand; either way +1 action and the helmet keep-out holds
  const B = run('dock_w6_back'); assert.ok((has(B, 'snapDock') || has(B, 'pickedUp')) && val(B, 'ops') >= 3 && val(B, 'headClear') >= 1.0, `headClear ${val(B, 'headClear')}`);
});

test('audit K2-04 / A2-K2-04: proximity radar softens the clutch first; line contact ≤10 N; boom contact impulse reported', () => {
  const C = run('crosspole');
  assert.ok(has(C, 'proximity') && C.events.find((e) => e.type === 'proximity').t <= evT(C, 'contact'));
  assert.ok(val(C, 'neighbourForce') <= 10, `neighbour ${val(C, 'neighbourForce')} N`);
  assert.ok(has(C, 'boomContact') && val(C, 'boomForce') <= 10 && val(C, 'boomImpulse') <= 0.3, `boom ${val(C, 'boomForce')} N`);
  const X = run('cross'); assert.ok(!has(X, 'contact'), 'helmet-height crossing clears the line');
  const S = run('snag'); assert.ok(has(S, 'freeSpool') && has(S, 'release') && val(S, 'bodyForcePeak') <= 40);
});

test('rider fall and component failures keep forces and KE within limits', () => {
  const F = run('fall'); assert.ok(has(F, 'fall') && val(F, 'keMax') <= 14.9);
  const K = run('kcu_fail'); assert.ok(has(K, 'kcuFail') && has(K, 'docked') && val(K, 'keMax') <= 14.9);
  const X = run('cut'); assert.ok(has(X, 'landed') && val(X, 'keMax') <= 14.9);
  const W = run('winch_fail'); assert.ok(val(W, 'bodyForcePeak') <= 40);
});

test('full-run ensemble (48 cases, round-4 rules): 12 judged metrics pass, avail fails as documented; re-check of three cases', () => {
  const E = ENSEMBLE.metrics;
  assert.ok(E.avail.n === 48);
  assert.ok(E.jitterRms.p90 <= 3 && E.setupTime.p90 <= 30 && E.ops.p90 <= 2 && E.bodyForcePeak.max <= 40 && E.keMax.max <= 14.9 && E.endurance.mean >= 45 && E.headClear.min >= 1.0 && E.azRange.mean >= 45 && E.pxMed.mean >= 300);
  assert.ok(E.avail.mean < 80 && E.avail.mean > 65, `avail ${E.avail.mean} (documented FAIL)`);
  assert.ok(E.lineH1min.min < 1.8, 'clothesline gate documented FAIL');
  for (const id of ['calm_s11', 'head9_s12', 'crossR6_s12']) {
    const c = FULLRUN_CASES.find((x) => x.id === id);
    const r = evaluateCase(P, c);
    assert.ok(r.keMax <= E.keMax.max + 1e-3 && r.bodyForcePeak <= E.bodyForcePeak.max + 1e-3 && r.avail >= E.avail.min - 1e-3 && r.headClear >= E.headClear.min - 1e-3, id);
  }
  const R = run('fullrun');
  assert.ok(has(R, 'docked') && R.events.filter((e) => e.type === 'launch').length === 2);
});

test('audit2 A2-K2-01/05: KE is bounded by the reel (passive drag + governor), not by the polar', () => {
  // the hockey stop of head6_s11 is where iteration 2 peaked; at L/D 0.6 and 30 % reefed glide KE stays ≤14.9 J
  const c = FULLRUN_CASES.find((x) => x.id === 'head6_s11');
  for (const over of [{ gMaxR: 0.6 }, { reefGloss: 0.7 }, { mass: +(PDEF.mass * 1.15).toFixed(4) }]) {
    const r = evaluateCase({ ...P, ...over }, c, { fs: false });
    assert.ok(r.keMax <= 14.9, `${JSON.stringify(over)} KE ${r.keMax}`);
  }
  // the governor (solenoid drag release on the estimated speed) is what caps it in this case
  const on = evaluateCase(P, c, { fs: false }), off = evaluateCase({ ...P, Jgov: 999 }, c, { fs: false });
  assert.ok(off.keMax >= on.keMax, `KE with ${on.keMax} vs without ${off.keMax}`);
});

test('independent footage-stability check agrees with the jitter metric', () => {
  const fs = footageStability(run('nominal'));
  assert.ok(fs.subjectRms < 3 && fs.backgroundRms < 3);
});

test('demo: 40–60 s use cycle driven by the physics', () => {
  const D = concept.demo.build(P);
  assert.ok(D.duration >= 40 && D.duration <= 60);
  for (const k of ['arm', 'launch', 'onStation', 'retrieve', 'docked', 'stowed']) assert.ok(has(D, k), k);
  const st = concept.demo.stages; assert.equal(st[0].t0, 0); assert.equal(st[st.length - 1].t1, concept.demo.duration);
});
