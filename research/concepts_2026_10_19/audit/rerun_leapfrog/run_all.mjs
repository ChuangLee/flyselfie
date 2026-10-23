// Runs every leapfrog scenario (and the demo) with default parameters, the design
// variants, capture-model tables and envelope sweeps, and writes results.json.
// Numerical-uncalibrated simulation (SIM-031); not a physical test.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept from '../../../../sim/js/concepts/leapfrog/index.js';
import { PDEF, aero, ldAt, motorPower } from '../../../../sim/js/concepts/leapfrog/model.js';
import { captureProb, snatchForce, CAPTURE_VARIANTS, aimSigma } from '../../../../sim/js/concepts/leapfrog/analysis.js';
import { footageStability } from '../../../../sim/js/concepts/common/criteria.js';

const here = dirname(fileURLToPath(import.meta.url));
const D = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r3 = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);
const ext = (c) => { let mn = Infinity, mx = -Infinity; for (const v of c) if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } return mn === Infinity ? null : { min: r3(mn), max: r3(mx) }; };
const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'endurance'];
const KEY = [...STD, 'frontShare', 'perchFront', 'shotsPerMin', 'perchShare', 'dwellMax', 'sepMin', 'sepMax', 'tdKE', 'tdVn', 'perchSF', 'pMean', 'pMotMean', 'eHop', 'hops', 'keepsLead', 'captureP', 'captureP2', 'snatchPeak', 'nbMin', 'availLoss', 'missCost', 'hookedOK'];
const scen = (id) => concept.scenarios.find((s) => s.id === id);
const pickM = (R, ids) => Object.fromEntries(R.metrics.filter((x) => ids.includes(x.id)).map((x) => [x.id, { value: r3(x.value), pass: x.pass }]));
const summary = (R) => { const m = pickM(R, KEY); return { fails: Object.entries(m).filter(([, v]) => v.pass === false).map(([k]) => k), metrics: m }; };

const out = {
  conceptId: concept.id, modelVersion: concept.modelVersion,
  evidence: 'numerical-uncalibrated simulation (SIM-031); demo = engineering illustration; nothing physically tested',
  generated: new Date().toISOString().slice(0, 10), params: D, scenarios: {},
};

// ---- 1. scenarios + demo
const cols = ['gap', 'sep', 'agl', 'groundSpeed', 'airspeed', 'keSnow', 'pMot', 'pTot', 'subjectPx', 'sfPerch', 'nbDist'];
const runs = [...concept.scenarios.map((s) => [s.id, () => concept.simulate(D, s), s]), ['demo', () => concept.demo.build(D), null]];
for (const [id, fn, sc] of runs) {
  const t0 = performance.now();
  const R = fn();
  const ms = performance.now() - t0;
  const fs = footageStability(R);
  out.scenarios[id] = {
    name: sc ? sc.en : 'Demo (60 s)', expect: sc ? sc.expect.en : null, fault: !!(sc && sc.fault), computeMs: Math.round(ms), validUntil: R.validUntil,
    ...summary(R),
    allMetrics: Object.fromEntries(R.metrics.map((m) => [m.id, { value: r3(m.value), unit: m.unit, pass: m.pass, criterion: m.criterion ? m.criterion.en : null }])),
    footageStability: { subjectRms: r3(fs.subjectRms), backgroundRms: r3(fs.backgroundRms), samples: fs.samples },
    events: R.events.map((e) => ({ t: +e.t.toFixed(2), type: e.type, severity: e.severity, en: e.en })),
    extremes: Object.fromEntries(cols.filter((k) => R.columns[k]).map((k) => [k, ext(R.columns[k])])),
  };
  console.log(id.padEnd(13), `${Math.round(ms)} ms`, 'fails:', out.scenarios[id].fails.join(' ') || '—', `| fs ${r3(fs.subjectRms)}/${r3(fs.backgroundRms)}`);
}

// ---- 2. design variants (nominal + the scenario that stresses each change)
const VAR = [
  { id: 'V0_inventor_I10', note: 'Inventor I-10 as proposed: no motor; the rider snatches a 0.25 m ring at every pass and re-tosses (analytic, see captureTable)', analytic: true },
  { id: 'V1_lead_only', note: 'Lead glider that never perches (front-chase glider)', over: { leadOnly: 1 } },
  { id: 'V2_chosen', note: 'Chosen: leapfrog lead glider, perch every hop, pass shot every 2nd hop, active hoop snatch at the end', over: {} },
  { id: 'V3_no_pass', note: 'Chosen without pass shots', over: { passEvery: 0 } },
  { id: 'V4_no_holster_bank', note: 'On-board 3.7 Wh only (no holster bank recharge)', over: { bankWh: 0 } },
  { id: 'V5_light_100g', note: '100 g airframe (smaller battery, no periscope), KE cap 17 m/s', over: { mass: 0.1, vCapG: 17, battWh: 2.6, mastH: 0.15 } },
  { id: 'V6_wide_lens_64', note: '64° lens (round-2 inventor action-cam class) instead of 36°', over: { camHfov: 64 } },
  { id: 'V7_folded_pod_perch', note: 'Perch with wings folded (pod), no wing-tip outriggers', over: { perchMode: 0 }, stress: 'perchwind' },
  { id: 'V8_passive_feather', note: 'Wings feathered nose-down only (no active sign switching)', over: { featherActive: 0 }, stress: 'perchwind' },
  { id: 'V9_no_adaptive_gap', note: 'Fixed 48 m lead target (no subject-size-aware gap)', over: { pxRangeAdapt: 0 }, stress: 'short' },
];
out.variants = {};
for (const v of VAR) {
  if (v.analytic) { out.variants[v.id] = { note: v.note, analytic: true }; continue; }
  const row = { note: v.note, over: v.over };
  for (const sid of ['nominal', 'short', 'fast', v.stress].filter((x, i, a) => x && a.indexOf(x) === i)) {
    const R = concept.simulate({ ...D, ...v.over }, scen(sid));
    row[sid] = summary(R);
  }
  out.variants[v.id] = row;
  console.log('variant', v.id.padEnd(22), ['nominal', 'short', 'fast', v.stress].filter(Boolean).map((s) => `${s}:${(row[s] && row[s].fails.join(',')) || '—'}`).join('  '));
}

// ---- 3. capture: hit probability per design and speed, forces, expected cost
const speeds = [2, 3, 4, 5, 6, 8, 10, 12];
out.captureTable = {
  aimModel: 'σ_lat = 0.035 + 0.013·v m (0.10 m at 5 m/s = inventor I-10 base case), σ_vert = 0.7·σ_lat, +30 % at 9 m/s wind (ASSUMED; no measured pole-aim data found)',
  sigmaLat: Object.fromEntries(speeds.map((v) => [v, r3(aimSigma(v))])),
  designs: Object.fromEntries(Object.entries(CAPTURE_VARIANTS).map(([k, V]) => [k, { label: V.en, pHit: Object.fromEntries(speeds.map((v) => [v, r3(captureProb(k, v))])), pHitWind9At5: r3(captureProb(k, 5, { wind: 9 })) }])),
  snatchForce: Object.fromEntries(speeds.map((v) => { const s = snatchForce({ ...PDEF, ...D }, v); return [v, { peakN: r3(s.peakN), bottomed: s.bottomed, extMax: r3(s.extMax), wristNm: r3(s.wristNm) }]; })),
};
// inventor I-10 per-hop snatch economics (analytic, nominal rider 12 m/s slowed to 5 m/s for each pass)
{
  const pH = captureProb('ring25lat', 5), pH12 = captureProb('ring25lat', 12);
  const cycle = 6.6 + 2 + 3.5; // inventor: 6.6 s to lead 40 m + landing + approach
  out.captureTable.inventorPerHop = {
    pHitAt5: r3(pH), pHitAt12: r3(pH12), handsPerHop_s: 2, cycle_s: cycle, handsBusyPct: r3((100 * 2) / cycle),
    expectedMissesPerMinute: r3((60 / cycle) * (1 - pH)), missCost_s: '30–60 s stop + side-step uphill (inventor)',
    verdict: 'fails handsBusy (≈17 % vs ≤5 %) and costs a stop on ~1 in 5 hops; replaced by the motorised leapfrog + one active-hoop snatch per run',
  };
}

// ---- 4. envelope sweeps
out.sweeps = {};
// rider speed (carving, 15°): can it stay ahead?
out.sweeps.riderSpeed = [8, 10, 12, 13, 14, 15, 16, 18].map((v) => {
  const R = concept.simulate(D, { ...scen('nominal'), id: `v${v}`, skier: { duration: 41, vTarget: v, v0: v, turnPeriod: v > 14 ? 4.5 : 2.9, turnAmpDeg: v > 14 ? 30 : 45 }, dur: 40 });
  const g = (id) => r3(R.metrics.find((m) => m.id === id).value);
  return { vTarget: v, keepsLead: g('keepsLead'), avail: g('avail'), frontShare: g('frontShare'), shotsPerMin: g('shotsPerMin'), keMax: g('keMax'), pMotMean: g('pMotMean') };
});
// slope: gravity vs motor
out.sweeps.slope = [4, 6, 10, 15, 20, 25].map((deg) => {
  const R = concept.simulate(D, { ...scen('nominal'), id: `s${deg}`, skier: { duration: 41, slopeDeg: deg, vTarget: deg < 8 ? 8 : 12, v0: deg < 8 ? 8 : 12 }, dur: 40 });
  const g = (id) => r3(R.metrics.find((m) => m.id === id).value);
  return { slopeDeg: deg, keepsLead: g('keepsLead'), avail: g('avail'), pMotMean: g('pMotMean'), endurance: g('endurance'), enduranceNoBank: r3(g('endurance') * D.battWh / (D.battWh + D.bankWh)) };
});
// lens and lead distance
out.sweeps.lensGap = [];
for (const camHfov of [34, 36, 42, 64]) for (const gapLand of [40, 48, 54]) {
  const row = { camHfov, gapLand };
  for (const sid of ['nominal', 'short']) { const R = concept.simulate({ ...D, camHfov, gapLand }, scen(sid)); const g = (id) => r3(R.metrics.find((m) => m.id === id).value); row[sid] = { avail: g('avail'), frontShare: g('frontShare'), shotsPerMin: g('shotsPerMin'), pxMed: g('pxMed') }; }
  out.sweeps.lensGap.push(row);
}
// wind: standstill p90 inputs (snatch hit rate at 5 m/s vs wind) and the flight-hold limits
out.sweeps.windCapture = [0, 3, 6, 9].map((w) => ({ windMs: w, pHit4: r3(captureProb('hoop40a', 4, { wind: w })), pHit2passes: r3(1 - (1 - captureProb('hoop40a', 4, { wind: w })) ** 2) }));
// closed-form airframe facts
const a = aero({ ...PDEF, ...D });
out.airframe = {
  vStall: r3(a.vStall), LD: Object.fromEntries([8, 10, 12, 14, 15].map((v) => [v, r3(ldAt({ ...PDEF, ...D }, v))])), LDminus30pct12: r3(ldAt({ ...PDEF, ...D, ldScale: 0.7 }, 12)),
  vForKE14_9: r3(Math.sqrt((2 * 14.9) / D.mass)), staticMotorW: r3(motorPower({ ...PDEF, ...D }, D.T0, 0)),
  gravityPowerW_14ms_15deg: r3(D.mass * 9.81 * 14 * Math.sin((15 * Math.PI) / 180)), dragPowerW_14ms: r3((D.mass * 9.81 * 14) / ldAt({ ...PDEF, ...D }, 14)),
  nativePx300RangeUpright_m: r3((1.55 * 6144) / (2 * Math.atan(Math.tan((D.camHfov * Math.PI) / 360) * 0.75)) / 300),
};
writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 1));
console.log('wrote', join(here, 'results.json'));
