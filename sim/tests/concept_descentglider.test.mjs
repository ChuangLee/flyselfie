// descentglider v2 (SIM-031 round 2) model checks: shared mass/battery basis, physics sanity, the full-run
// behaviour (throw → ready → follow → loiter → follow → belly landing), the wind interlock, the ensemble constants
// (re-checked on 3 cases) and honest judging. Code verification of an uncalibrated simulation — not validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import concept, { resolve, massBudget, prepareFullRun, caseMetrics } from '../js/concepts/descentglider/index.js';
import { runCore, wingGeom, freeGlide, vKE, stallSpeed, MODE } from '../js/concepts/descentglider/model.js';
import { analyse } from '../js/concepts/descentglider/analysis.js';
import { ENSEMBLE } from '../js/concepts/descentglider/ensemble.js';
import { CRITERIA } from '../js/concepts/common/criteria.js';
import { BATTERY, MASS_MARGIN } from '../js/concepts/common/components.js';

const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const PR = resolve(P);
const scen = (id) => concept.scenarios.find((s) => s.id === id);
const cache = {};
const run = (id) => (cache[id] ||= concept.simulate(P, scen(id)));
const metric = (R, id) => R.metrics.find((m) => m.id === id);
const fullCase = (id, over = {}) => { const pr = prepareFullRun({ ...P, ...over }, { caseId: id }); const core = runCore(pr.p, pr.input); return { core, K: caseMetrics(core, analyse(core, pr.sk, pr.p), pr.sk, pr.p, { pre: pr.pre, fullRun: true, noFly: !!pr.noFly }) }; };

test('mass and battery come from the shared table (150 Wh/kg, 15 % margin); C0 and KE-cap speed above the rider', () => {
  assert.equal(PR.whPerKg, BATTERY.whPerKgPack);
  const mb = massBudget(PR);
  assert.ok(Math.abs(mb.gWithMargin - mb.g * (1 + MASS_MARGIN)) < 1e-9);
  assert.ok(Math.abs(mb.battG - (PR.battWh / 150) * 1000) < 1e-9);
  assert.ok(PR.mass < 0.13 && PR.mass > 0.11, `mass ${PR.mass}`);
  assert.ok(vKE(PR.mass) > 15, 'KE-cap speed must exceed the 13–13.7 m/s full-run rider with margin');
  assert.ok(PR.pAvionics > 4.5, 'camera 2.5 W boosted + avionics + ToF + servos');
  assert.ok(Math.abs(stallSpeed(0, PR) - 6.84) < 0.1);
});

test('free glide: mechanical energy only falls and the path settles to the polar glide angle', () => {
  const CL = 0.5, out = freeGlide(PR, { V0: 12, CL, T: 25 });
  for (let i = 1; i < out.length; i++) assert.ok(out[i].Emech <= out[i - 1].Emech + 1e-6);
  const g = wingGeom(0, PR), gamma = (Math.atan((g.cd0 + g.k * CL * CL) / CL) * 180) / Math.PI;
  assert.ok(Math.abs(out[out.length - 1].gammaDeg - gamma) < 0.5);
});

test('steady follow: footage criteria pass with the servo cradle; KE ≤ 14.9 J', () => {
  const R = run('steady');
  for (const id of ['avail', 'pxMed', 'jitterRms', 'keMax']) assert.equal(metric(R, id).pass, true, `${id} ${metric(R, id).value}`);
  assert.ok(metric(R, 'lensLoss').value < 5);
});

test('calm full run: throw → ready → loiter at the stop (no landing) → belly landing beside the rider; 2 actions', () => {
  const { core, K } = fullCase('calm_s11');
  const types = core.events.map((e) => e.type);
  for (const ty of ['throw', 'ready', 'loiter', 'pattern', 'touchdown', 'landed']) assert.ok(types.includes(ty), ty);
  assert.equal(types.filter((t) => t === 'touchdown').length, 1, 'touches the snow only at the end of the run');
  assert.ok(!types.includes('snowStrike') && !types.includes('geofence'));
  assert.equal(K.ops, 2);
  assert.ok(K.avail >= 80 && K.keMax <= 14.9 && K.rangeMax <= 50);
  assert.ok(K.restDist >= 1.5 && K.restDist <= 8 && K.landMinRider >= 2.5);
  assert.ok(K.propHeadMin >= 0.5, 'pusher starts ≥0.5 m from the helmet');
  assert.ok(K.catchUp[0] < 5, 'pre-positioned: within 10 m <5 s after push-off');
  assert.ok(K.setup > 30, 'honest: the calm standstill still exceeds 30 s (ready cue + landing wait)');
});

test('wind interlock: at 9 m/s it does not follow, lands and stays under 14.9 J', () => {
  const { core, K } = fullCase('tail9_s11');
  assert.ok(core.events.some((e) => e.type === 'interlock'));
  assert.equal(K.avail, 0);
  assert.ok(K.keMax <= 14.9);
});

test('ensemble constants reproduce on 3 re-run cases and are judged honestly', () => {
  assert.ok(ENSEMBLE && ENSEMBLE.check);
  for (const [id, ref] of Object.entries(ENSEMBLE.check)) {
    const { K } = fullCase(id);
    assert.ok(Math.abs(K.avail - ref.avail) < 0.6, `${id} avail ${K.avail} vs ${ref.avail}`);
    assert.ok(Math.abs(K.setup - ref.setup) < 0.6, `${id} setup ${K.setup} vs ${ref.setup}`);
    assert.equal(K.ops, ref.ops);
  }
  const R = run('fullrun');
  assert.equal(metric(R, 'avail').value, ENSEMBLE.avail.mean);
  assert.equal(metric(R, 'avail').pass, ENSEMBLE.avail.mean >= CRITERIA.avail.v);
  assert.equal(metric(R, 'setupTime').pass, ENSEMBLE.setup.p90 <= 30);
  assert.equal(metric(R, 'keMax').pass, ENSEMBLE.keMax.max <= 14.9);
  assert.ok(ENSEMBLE.byWind.length === 4);
});

test('envelope: a 16 m/s rider outruns the KE-capped glider (reported, not hidden)', () => {
  const R = run('fast');
  assert.equal(metric(R, 'avail').pass, false);
  assert.ok(metric(R, 'keMax').value <= 14.9);
});

test('link loss: fail-safe belly landing away from the track, nobody struck', () => {
  const R = run('linkloss');
  assert.ok(R.events.some((e) => e.type === 'failsafe'));
  assert.ok(metric(R, 'keMax').value <= 14.9 && metric(R, 'headMin').value >= 1.5);
});

test('demo: throw → ready → loiter → landing → stow, camera off before the throw', () => {
  const R = concept.demo.build(P);
  const t = (ty) => (R.events.find((e) => e.type === ty) || {}).t;
  assert.ok(t('throw') < t('ready') && t('ready') < t('pattern') && t('pattern') < t('landed'));
  assert.ok(!R.events.some((e) => e.type === 'snowStrike'));
  assert.equal(R.frame(1).productCam, null);
  assert.equal(R.frame(1).device.modeName, 'stowed');
  assert.ok(Math.abs(R.duration - concept.demo.duration) < 0.1);
});
