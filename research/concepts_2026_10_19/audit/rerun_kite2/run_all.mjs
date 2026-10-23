// Runs every K2 kite scenario (and the demo) with default parameters, plus the
// variant / parameter / robustness studies used in design_notes.json, and writes
// results.json. Numerical-uncalibrated simulation (SIM-031); not a physical test.
// Run: node research/concepts_2026_10_19/dev/kite2/run_all.mjs   (from the repo root)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept from '../../../../sim/js/concepts/kite2/index.js';
import { PDEF, resolveP, equilibrium } from '../../../../sim/js/concepts/kite2/model.js';
import { footageStability, CRITERIA } from '../../../../sim/js/concepts/common/criteria.js';

const here = dirname(fileURLToPath(import.meta.url));
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r3 = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);
const ext = (c) => { let mn = Infinity, mx = -Infinity; for (const v of c) if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } return mn === Infinity ? null : { min: r3(mn), max: r3(mx) }; };
const STD = Object.keys(CRITERIA);
const mget = (R) => Object.fromEntries(R.metrics.map((m) => [m.id, m.value]));
const out = { conceptId: concept.id, modelVersion: concept.modelVersion, evidence: 'numerical-uncalibrated simulation (SIM-031); not a physical test; nothing here is validated', generated: new Date().toISOString().slice(0, 10), params: P, scenarios: {} };

// ---- 1. every scenario + demo
const pick = ['tension', 'lineOut', 'reelRate', 'glide', 'cr', 'psi', 'airspeed', 'elK', 'azK', 'subjectPx', 'azView', 'elevView', 'art', 'keSnow', 'headDist', 'crossH2', 'kiteSpeed', 'pWinch'];
const runs = [...concept.scenarios.map((s) => [s.id, () => concept.simulate(P, s), s]), ['demo', () => concept.demo.build(P), null]];
const summary = [];
for (const [id, fn, sc] of runs) {
  const t0 = performance.now(); const R = fn(); const ms = performance.now() - t0;
  const fs = footageStability(R);
  const fails = R.metrics.filter((m) => m.pass === false).map((m) => m.id);
  out.scenarios[id] = {
    name: sc ? sc.en : 'Demo', expect: sc ? sc.expect.en : null, fault: !!sc?.fault, compare: !!sc?.compare, computeMs: Math.round(ms), validUntil: R.validUntil, scopeEnd: R.scopeEnd,
    std12: Object.fromEntries(R.metrics.filter((m) => STD.includes(m.id)).map((m) => [m.id, { value: r3(m.value), pass: m.pass }])),
    metrics: Object.fromEntries(R.metrics.map((m) => [m.id, { value: r3(m.value), unit: m.unit, pass: m.pass, criterion: m.criterion ? m.criterion.en : null }])),
    failsJudged: fails,
    footageStability: { subjectRms: r3(fs.subjectRms), backgroundRms: r3(fs.backgroundRms), samples: fs.samples },
    events: R.events.map((e) => ({ t: +e.t.toFixed(2), type: e.type, severity: e.severity, en: e.en })),
    extremes: Object.fromEntries(pick.filter((k) => R.columns[k]).map((k) => [k, ext(R.columns[k])])),
  };
  summary.push(`${id.padEnd(11)} ${String(Math.round(ms)).padStart(5)} ms  fails: ${fails.join(' ') || '—'}`);
}
console.log(summary.join('\n'));

// ---- 2. design variants on the same dynamics (V0 round-1 A04, V1 light passive, V2 K2)
out.variants = {};
for (const [name, over] of [['V0_roundOne_A04_passive_300g', { design: 0 }], ['V1_light_passive_68g', { design: 1 }], ['V2_K2_active', {}]]) {
  out.variants[name] = {};
  for (const id of ['nominal', 'fast', 'gust', 'short']) {
    const R = concept.simulate({ ...P, ...over }, concept.scenarios.find((s) => s.id === id));
    const m = mget(R);
    out.variants[name][id] = Object.fromEntries(['avail', 'pxMed', 'keMax', 'bodyForcePeak', 'tensionMean', 'viewElev', 'jitterRms'].map((k) => [k, r3(m[k])]));
    out.variants[name][id].landed = R.events.some((e) => e.type === 'landed');
  }
}

// ---- 3. parameter studies (nominal unless stated)
const study = (param, values, ids = ['nominal', 'short']) => values.map((v) => {
  const row = { [param]: v };
  for (const id of ids) { const R = concept.simulate({ ...P, [param]: v }, concept.scenarios.find((s) => s.id === id)); const m = mget(R); row[id] = { avail: r3(m.avail), pxMed: r3(m.pxMed), azRange: r3(m.azRange), keMax: r3(m.keMax), viewElev: r3(m.viewElev), landed: R.events.some((e) => e.type === 'landed') }; }
  return row;
});
out.studies = {
  cameraOffset_m: study('camOff', [0.0, 0.06, 0.12, 0.2, 0.3]),
  stationAzimuth_deg: study('az', [0, 10, 15, 20, 30]),
  stationElevationAboveSlope_deg: study('el', [16, 22, 28, 34]),
  lensHfov_deg: study('hfov', [50, 60, 70, 80, 100]),
  tetherLength_m: study('Lst', [5.5, 7, 8.5, 10]),
  flyingMass_kg: study('mass', [0.05, 0.062, 0.08, 0.1, 0.14], ['nominal', 'fast']),
};

// ---- 4. robustness: 8 turbulence/skier seeds per scenario
out.robustness = {};
for (const id of ['nominal', 'short', 'gust', 'tail', 'fast', 'moguls']) {
  const base = concept.scenarios.find((s) => s.id === id); const rows = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const R = concept.simulate(P, { ...base, wind: { ...base.wind, seed }, skier: { ...(base.skier || {}), seed } }); const m = mget(R);
    rows.push({ seed, avail: r3(m.avail), keMax: r3(m.keMax), bodyForcePeak: r3(m.bodyForcePeak), jitterRms: r3(m.jitterRms), landed: R.events.some((e) => e.type === 'landed') });
  }
  out.robustness[id] = { minAvail: Math.min(...rows.map((r) => r.avail)), maxKe: Math.max(...rows.map((r) => r.keMax)), maxForce: Math.max(...rows.map((r) => r.bodyForcePeak)), landedRuns: rows.filter((r) => r.landed).length, rows };
}

// ---- 4b. stop robustness: calm/light-wind stops (6 skier seeds × 4 stop times × 2 winds) — automatic dock vs manual push-in
{
  const base = concept.scenarios.find((s) => s.id === 'liftline'); const rows = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) for (const stopAt of [8, 8.7, 9.4, 10.1]) for (const wm of [0, 1.5]) {
    const R = concept.simulate(P, { ...base, skier: { ...base.skier, seed, stopAt }, wind: { ...base.wind, mean: [0, wm, 0], seed } });
    const m = mget(R);
    rows.push({ seed, stopAt, windMean: wm, stowed: R.events.some((e) => e.type === 'stowed'), manual: R.events.some((e) => e.type === 'manualStow' || e.type === 'landed'), setupTime: r3(m.setupTime), headLaunch: r3(m.headLaunch) });
  }
  // the demo's push-start rider with light gusty wind, stopping at different instants
  const demoStops = [];
  for (const st of [38.5, 39, 39.5, 40, 40.5]) {
    const R = concept.demo.build({ ...P, demoStopAt: st });
    demoStops.push({ stopAt: st, stowed: R.events.some((e) => e.type === 'stowed'), manual: R.events.some((e) => e.type === 'manualStow' || e.type === 'landed'), headLaunch: r3(mget(R).headLaunch) });
  }
  out.stopRobustness = { calmStops: { n: rows.length, autoDocked: rows.filter((r) => r.stowed && !r.manual).length, manual: rows.filter((r) => r.manual).length, minHeadClearance: Math.min(...rows.map((r) => r.headLaunch).filter(Number.isFinite)), maxSetup: Math.max(...rows.map((r) => r.setupTime).filter(Number.isFinite)), rows }, demoStops };
}

// ---- 5. standstill sweep (setupTime 90th pct over 0–9 m/s wind) and the constant used in index.js
const st = ['stopstart', 'liftline', 'dock_w6', 'dock_w9'].map((id) => [id, out.scenarios[id].metrics.setupTime.value]);
out.setupSweep = { runs: Object.fromEntries(st), worst: Math.max(...st.map((x) => x[1])), note: 'index.js SETUP_SWEEP must equal "worst" (re-run after changing dock/retrieve logic)' };

// ---- 6. closed-form: steady tension vs airspeed, passive vs K2 depower envelope; minimum flying airspeed vs mass
const p2 = resolveP(PDEF), p0 = resolveP({ design: 0 });
out.closedForm = {
  tensionVsAirspeed: [3, 6, 9, 12, 15, 18, 21].map((Va) => ({
    Va,
    passiveA04_N: r3(equilibrium(p0, Va, p0.fixedG, p0.fixedCR).tension),
    k2_minN: r3(equilibrium(p2, Va, 1, p2.CRmin).tension), k2_maxN: r3(equilibrium(p2, Va, 1, p2.CRmax).tension),
    k2_heldN: r3(Math.min(Math.max(p2.Tref, equilibrium(p2, Va, 1, p2.CRmin).tension), equilibrium(p2, Va, 1, p2.CRmax).tension)),
  })),
  vMinVsMass: [0.05, 0.062, 0.08, 0.12, 0.2, 0.3].map((m) => ({ massKg: m, vMin_ms: r3(equilibrium({ ...p2, mass: m }, 3, p2.Gmax, p2.CRmax).vminSupport), vMaxForKE14_9: r3(Math.sqrt((2 * 14.9) / m)) })),
  roundOneA04_vMin_ms: r3(Math.sqrt((2 * 0.3 * 9.81 * 1.3) / (1.0 * 0.25 * 0.8))),
  gustQuasiStatic: { passiveRiseFor3msAt12: r3(100 * ((15 / 12) ** 2 - 1)), note: 'passive pull ∝ V²; K2 holds CR·q constant inside the depower envelope, the winch pays out above 9 N' },
  // AWE-style pumping harvest (closed form, not used by default): reel out ΔL under T_out, reel in under T_in
  pumpingHarvest: (() => { const Tout = 12, Tin = 2, dL = 2, vout = 1, vin = 2, eta = 0.6; const E = (Tout - Tin) * dL * eta; const Tc = dL / vout + dL / vin; return { Tout_N: Tout, Tin_N: Tin, strokeM: dL, cycleS: Tc, netW: r3(E / Tc), note: 'about 4 W net (closed form), but the camera distance swings ±1 m and the pull on the body swings 2↔12 N every 3 s: rejected for filming; the winch only regenerates on gust pay-out' }; })(),
};
const nomPw = out.scenarios.nominal.metrics.pWinch.value;
out.energy = { podCellWh: p2.podWh, packWh: p2.packWh, kitePowerW: p2.pCam + p2.pKcu, winchMeanW_nominal: nomPw, enduranceMin_nominal: out.scenarios.nominal.metrics.endurance.value, sortieMin: out.scenarios.nominal.metrics.sortieMin.value };

writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 1));
console.log('wrote', join(here, 'results.json'));
