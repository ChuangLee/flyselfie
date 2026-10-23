// descentglider v2 runner (round 2): every scenario, the FULL-RUN ENSEMBLE (all 39 shared cases, ITERATE_BRIEF),
// a rider-speed sweep, sensitivities and dt convergence. Writes results.json here and the ensemble constants to
// sim/js/concepts/descentglider/ensemble.js (read by index.js; tests re-check a subset).
// Usage (repo root): node research/concepts_2026_10_19/dev/descentglider/run_all.mjs
// Numerical, uncalibrated simulation — not a physical test.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept, { prepareFullRun, caseMetrics, resolve, massBudget, LIFT_MIN, XFER } from '../../../../sim/js/concepts/descentglider/index.js';
import { runCore, MODE_NAME, stallSpeed, vKE, glide, turnPower, wingGeom } from '../../../../sim/js/concepts/descentglider/model.js';
import { analyse } from '../../../../sim/js/concepts/descentglider/analysis.js';
import { FULLRUN_CASES, pct } from '../../../../sim/js/concepts/common/fullrun.js';
import { footageStability } from '../../../../sim/js/concepts/common/criteria.js';
import { enduranceMin, BATTERY, keSpeedCap } from '../../../../sim/js/concepts/common/components.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../..');
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const PR = resolve(P);
const r = (x, n = 2) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : x);
const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'endurance'];
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
const stat = (a) => ({ mean: r(mean(a)), p10: r(pct(a, 0.1)), p50: r(pct(a, 0.5)), p90: r(pct(a, 0.9)), min: r(Math.min(...a.filter(Number.isFinite))), max: r(Math.max(...a.filter(Number.isFinite))), n: a.filter(Number.isFinite).length });

function runCase(params, opts) {
  const t0 = Date.now();
  const pr = prepareFullRun(params, opts);
  const core = runCore(pr.p, pr.input);
  const A = analyse(core, pr.sk, pr.p);
  const K = caseMetrics(core, A, pr.sk, pr.p, { pre: pr.pre, fullRun: true, noFly: !!pr.noFly });
  const modeTime = {}; for (let i = 0; i < core.n; i++) { const k = MODE_NAME[core.O.mode[i]]; modeTime[k] = r((modeTime[k] || 0) + 0.02, 1); }
  return { K, ms: Date.now() - t0, events: core.events.filter((e) => e.severity !== 'info' || ['throw', 'ready', 'loiter', 'pattern', 'touchdown', 'landed'].includes(e.type)).map((e) => ({ t: r(e.t, 1), type: e.type, en: e.en })), modeTime };
}
const slim = (K) => ({ noFly: K.noFly, avail: r(K.avail, 1), pxMed: r(K.pxMed, 0), jitter: r(K.jitter), jitterPct: r(K.jitterPct, 1), attRateRms: r(K.attRateRms), azRange: r(K.azRange, 0), keMax: r(K.keMax), setup: r(K.setup, 1), tReady: r(K.tReady, 1), endWait: r(K.endWait, 1), walk: r(K.walk, 1), restDist: r(K.restDist, 1), ops: K.ops, rangeMax: r(K.rangeMax, 1), pMean: r(K.pMean), pFollow: r(K.pFollow), pLoiter: r(K.pLoiter), Ewh: r(K.Ewh, 3), endurance: r(K.endurance, 1), runsPerCharge: r(K.runsPerCharge, 1), rechargeC: r(K.rechargeC), catchUp: K.catchUp.map((x) => r(x, 1)), headMin: r(K.headMin), aglMin: r(K.aglMin), lensLossPct: r(K.lensLossPct, 1), landMinRider: r(K.landMinRider), tdKE: r(K.tdKE), crashed: K.crashed, failsafe: K.failsafe, goArounds: K.goArounds, propHeadMin: r(K.propHeadMin) });

const tAll = Date.now();
// ---------------------------------------------------------------- ensemble (39 cases)
const cases = [];
for (const c of FULLRUN_CASES) {
  const o = runCase(P, { caseId: c.id });
  cases.push({ id: c.id, U: c.U, dir: c.dir, seed: c.seed, computeMs: o.ms, ...slim(o.K), events: o.events, modeTime: o.modeTime, _K: o.K });
  process.stdout.write(`${c.id} avail ${r(o.K.avail, 1)} setup ${r(o.K.setup, 1)} ops ${o.K.ops} ${o.ms} ms\n`);
}
const col = (f, list = cases) => list.map((c) => f(c));
const summarise = (list) => {
  const pM = mean(col((c) => c.pMean, list));
  return {
    n: list.length,
    avail: stat(col((c) => c.avail, list)), pxMed: stat(col((c) => c.pxMed, list)), jitter: stat(col((c) => c.jitter, list)), jitterPct: stat(col((c) => c.jitterPct, list)),
    azRange: stat(col((c) => c.azRange, list)), setup: stat(col((c) => c.setup, list)), keMax: stat(col((c) => c.keMax, list)), rangeMax: stat(col((c) => c.rangeMax, list)),
    ops: { ...stat(col((c) => c.ops, list)), shareAbove2: r((100 * list.filter((c) => c.ops > 2).length) / list.length, 1) },
    pMean: stat(col((c) => c.pMean, list)), endurance: { fromMeanPower: r(enduranceMin(PR.bankWh * XFER + PR.battWh, pM, { heated: true }), 1), perCase: stat(col((c) => c.endurance, list)) },
    bodyForcePeak: { max: 0 }, crashes: list.filter((c) => c.crashed).length, noFly: list.filter((c) => c.noFly).length, failsafes: list.filter((c) => c.failsafe).length,
    catchUpRestart: stat(col((c) => (Number.isFinite(c.catchUp[1]) ? c.catchUp[1] : 30), list)),
  };
};
const ens = summarise(cases);
ens.byWind = [0, 3, 6, 9].map((U) => ({ U, ...summarise(cases.filter((c) => c.U === U)) }));
ens.byDir = ['calm', 'head', 'tail', 'crossL', 'crossR'].map((d) => ({ dir: d, ...summarise(cases.filter((c) => c.dir === d)) }));
const passEns = {
  avail: ens.avail.mean >= 80, setupTime: ens.setup.p90 <= 30, ops: ens.ops.p90 <= 2, keMax: ens.keMax.max <= 14.9, bodyForcePeak: true, endurance: ens.endurance.fromMeanPower >= 45, jitterRms: ens.jitter.p90 <= 3, pxMed: ens.pxMed.mean >= 300, azRange: ens.azRange.mean >= 45,
};

// ---------------------------------------------------------------- envelope: rider speed (calm and 3 m/s cross), wind ≤3 m/s subset
const speedSweep = [];
for (const v of [9, 11, 13, 15]) for (const w of [{ id: 'calm', mean: [0, 0, 0] }, { id: 'crossR3', mean: [0, -3, 0] }]) {
  const o = runCase(P, { seed: 12, wind: { mean: w.mean, intensity: 0.15, seed: 12 }, skier: { vTarget: v } });
  speedSweep.push({ vTarget: v, wind: w.id, ...slim(o.K) });
  process.stdout.write(`speed ${v} ${w.id} avail ${r(o.K.avail, 1)}\n`);
}
// ---------------------------------------------------------------- sensitivities on a light-wind subset (calm + 3 m/s, seed 12)
const SUB = FULLRUN_CASES.filter((c) => c.seed === 12 && c.U <= 3).map((c) => c.id);
const sens = {};
for (const [k, over] of Object.entries({ base: {}, whPerKg200: { whPerKg: 200 }, LDminus30: { dragScale: 1.43 }, clmax07: { clmaxExt: 0.7 }, eis03: { eisRho: 0.3 }, noCradle_fixedCam120: { camRoll: 0, camHfov: 120 }, noTerrainFlow: { terrainFlow: 0 }, mass_plus15g: { airframeG: 45 } })) {
  const list = SUB.map((id) => slim(runCase({ ...P, ...over }, { caseId: id }).K));
  const q = resolve({ ...P, ...over });
  sens[k] = { over, mass_g: r(q.mass * 1000, 1), vKE: r(vKE(q.mass)), avail: r(mean(list.map((x) => x.avail)), 1), setupP90: r(pct(list.map((x) => x.setup), 0.9), 1), pMean: r(mean(list.map((x) => x.pMean))), ops_max: Math.max(...list.map((x) => x.ops)), keMax: r(Math.max(...list.map((x) => x.keMax))), jitterMean: r(mean(list.map((x) => x.jitter))) };
  process.stdout.write(`sens ${k} ${JSON.stringify(sens[k])}\n`);
}
// ---------------------------------------------------------------- dt convergence (calm_s11)
const dtConv = [];
for (const dt of [0.004, 0.0025, 0.001]) {
  const pr = prepareFullRun(P, { caseId: 'calm_s11' });
  const core = runCore(pr.p, { ...pr.input, dt });
  const K = caseMetrics(core, analyse(core, pr.sk, pr.p), pr.sk, pr.p, { pre: pr.pre, fullRun: true });
  dtConv.push({ dt, avail: r(K.avail, 1), pMean: r(K.pMean, 3), pFollow: r(K.pFollow, 3), setup: r(K.setup, 1), keMax: r(K.keMax) });
}
// ---------------------------------------------------------------- scenarios
const scen = {};
for (const sc of concept.scenarios) {
  const t1 = Date.now();
  const R = concept.simulate(P, sc);
  const m = {}; for (const x of R.metrics) m[x.id] = { value: r(x.value), unit: x.unit, pass: x.pass, criterion: x.criterion ? x.criterion.en : null };
  const fs = footageStability(R);
  scen[sc.id] = { name: sc.en, compare: !!sc.compare, fault: !!sc.fault, computeMs: Date.now() - t1, metrics: m, footageStability: { subjectRms: r(fs.subjectRms), backgroundRms: r(fs.backgroundRms) }, events: R.events.filter((e) => e.severity !== 'info').map((e) => ({ t: r(e.t, 1), type: e.type, en: e.en })) };
  process.stdout.write(`scenario ${sc.id} ${scen[sc.id].computeMs} ms\n`);
}
// demo pre-roll (ready cue time) for the fixed demo duration
const demoPre = prepareFullRun(P, { seed: 2, plan: [{ ride: 22, preset: 'recreationalCarve' }, { hold: 14 }, { ride: 16, preset: 'recreationalCarve' }, { hold: 10 }], wind: { mean: [0.5, 2, 0], intensity: 0.15, Lu: 28, seed: 4 }, post: 12 }).pre;

const mb = massBudget(PR);
const out = {
  meta: { concept: 'descentglider', modelVersion: concept.modelVersion, generated: new Date().toISOString().slice(0, 10), evidence: 'numerical-uncalibrated simulation; demo is an illustration; nothing physically tested', params: P, computeSeconds: r((Date.now() - tAll) / 1000, 0) },
  sizing: {
    massBudget_g: Object.fromEntries(Object.entries(mb.lines).map(([k, v]) => [k, r(v, 1)])), sum_g: r(mb.g, 1), withMargin15_g: r(mb.gWithMargin, 1), pAvionics_W: r(mb.pAvionics),
    stall_ms: r(stallSpeed(0, PR)), LDmax: r(1 / (2 * Math.sqrt(wingGeom(0, PR).cd0 * wingGeom(0, PR).k))), KEcapSpeed_ms: r(vKE(PR.mass)), groundSpeedCap_ms: r(PR.vCapMargin * vKE(PR.mass)),
    loiter: (() => { const V = PR.loiterVaK * stallSpeed(0, PR), tp = turnPower(V, 40, PR); return { Va_ms: r(V), bankDeg: 40, radius_m: r(tp.radius, 1), dragPower_W: r(tp.Pdrag) }; })(),
    glideDeg: Object.fromEntries([9, 11, 13, 15].map((V) => [V, r(glide(V, 0, PR)?.gammaDeg ?? null, 1)])),
    battery: { flyingWh: PR.battWh, flyingG: r(mb.battG, 1), bankWh: PR.bankWh, whPerKg: PR.whPerKg, coldFactor: BATTERY.coldFactor, reserve: BATTERY.reserve, heaterW: BATTERY.heaterW, liftMin: LIFT_MIN, transferEff: XFER },
    v1_at_shared_basis: { note: 'v1 perch-and-hop rebuilt from the shared table: cam4k 16 + gimbal2ax 30 + avionics 10 + ToF 5 + 2×1404/4″ 34 + 3 servos 7.5 + airframe 40 + wiring 5 + 8.5 Wh at 150 Wh/kg 56.7 g = 204 g, ×1.15 = 235 g', mass_g: 235, keCap_ms: r(keSpeedCap(0.235)), verdict: 'cannot keep up with a 13 m/s rider (KE cap 11.3 m/s); T/W 1.1 for hover' },
  },
  ensemble: { cases: cases.map(({ _K, ...c }) => c), summary: ens, passOnEnsemble: passEns },
  speedSweep, sensitivities: sens, dtConvergence: dtConv, scenarios: scen, demoPre: r(demoPre, 2),
};
writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 1));
// ensemble constants for index.js
const E = { avail: ens.avail, pxMed: ens.pxMed, jitter: ens.jitter, azRange: ens.azRange, setup: ens.setup, ops: ens.ops, keMax: ens.keMax, rangeMax: ens.rangeMax, pMean: ens.pMean, endurance: ens.endurance, byWind: ens.byWind.map((b) => ({ U: b.U, avail: b.avail, setup: b.setup, ops: b.ops, keMax: b.keMax })), check: Object.fromEntries(['calm_s11', 'crossR3_s12', 'crossR6_s12'].map((id) => { const c = cases.find((x) => x.id === id); return [id, { avail: c.avail, setup: c.setup, ops: c.ops, keMax: c.keMax }]; })) };
writeFileSync(join(root, 'sim/js/concepts/descentglider/ensemble.js'), `// GENERATED by research/concepts_2026_10_19/dev/descentglider/run_all.mjs (${out.meta.generated}) — do not edit by hand.\n// Full-run ensemble (39 shared cases) summary used by index.js; tests/concept_descentglider.test.mjs re-checks 3 cases.\nexport const ENSEMBLE = ${JSON.stringify(E)};\nexport const DEMO_PRE = ${r(demoPre, 2)};\n`);
console.log('ensemble', JSON.stringify({ avail: ens.avail, setup: ens.setup, ops: ens.ops, keMax: ens.keMax.max, endurance: ens.endurance.fromMeanPower, pass: passEns }));
