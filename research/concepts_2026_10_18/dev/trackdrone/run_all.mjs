// Runs every S2 trackdrone scenario (v2 default + v1 reference), the v1-vs-v2
// tables, the mass/KE/wind trade, the energy-option comparison, the docking
// ablation and a sensitivity block, and writes results.json.
// Numerical-uncalibrated simulation; not a physical test.
// Usage (repo root): node research/concepts_2026_10_18/dev/trackdrone/run_all.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import C, { designParams, dockSweep, windCapability, trim } from '../../../../sim/js/concepts/trackdrone/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const P = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const r = (x, n = 3) => (typeof x === 'number' && Number.isFinite(x) ? +x.toFixed(n) : x);
const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'endurance'];
const EXTRA = ['crossMax', 'minDistRider', 'minClrTree', 'minDistOther', 'perPack', 'pMean', 'peakI', 'reacq', 'lineClr'];
const sc = (id) => C.scenarios.find((s) => s.id === id);
const ext = (R, k) => { let mn = Infinity, mx = -Infinity; const a = R.columns[k]; if (!a) return null; for (const v of a) if (Number.isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } return mn === Infinity ? null : { min: r(mn), max: r(mx) }; };
const pick = (R, ids) => Object.fromEntries(R.metrics.filter((m) => ids.includes(m.id)).map((m) => [m.id, { value: r(m.value), pass: m.pass }]));

const out = {
  concept: C.id, modelVersion: C.modelVersion, generated: new Date().toISOString().slice(0, 10),
  evidence: 'numerical-uncalibrated simulation with harmonised criteria (sim/js/concepts/common/criteria.js); demo is an engineering illustration; nothing physically tested',
  params: C.params.map((p) => ({ id: p.id, value: p.v, unit: p.unit, src: p.src, note: p.note || '' })),
  designs: { v1: designParams({ ...P, design: 1 }), v2: designParams({ ...P, design: 2 }), v3: designParams(P) },
  modelLimits: C.modelLimits.map((l) => l.en),
  scenarios: [],
};
for (const s of C.scenarios) {
  const t0 = Date.now();
  const R = C.simulate(P, s);
  out.scenarios.push({
    id: s.id, name: s.en, expect: s.expect.en, computeMs: Date.now() - t0, validUntil: R.validUntil,
    metrics: R.metrics.map((m) => ({ id: m.id, en: m.en, value: r(m.value), unit: m.unit, pass: m.pass, criterion: m.criterion ? m.criterion.en : null })),
    failed: R.metrics.filter((m) => m.pass === false).map((m) => m.id),
    events: R.events.filter((e) => e.type !== 'mode' || /dock|launch|lost|hold/.test(e.en)).map((e) => ({ t: e.t, type: e.type, severity: e.severity, en: e.en })),
    extremes: Object.fromEntries(['distRider', 'clrTree', 'distOther', 'crossErr', 'tilt', 'air', 'gs', 'power', 'soc', 'vcell', 'tb', 'ke', 'subjectPx', 'crop', 'estErr', 'altAgl', 'dockErr'].map((k) => [k, ext(R, k)]).filter(([, v]) => v)),
  });
  console.log(s.id, `${Date.now() - t0} ms`, 'failed:', out.scenarios.at(-1).failed.join(','));
}

// v1 / v2 / v3 on the same scenarios (design param switched)
out.versions = ['nominal', 'highspeed', 'highspeed_leap', 'short', 'crosswind', 'dropout', 'fall', 'treeline', 'overhang', 'crossing'].map((id) => {
  const r3 = Object.fromEntries([1, 2, 3].map((d) => { const R = C.simulate({ ...P, design: d }, sc(id)); return [`v${d}`, { validUntil: R.validUntil, ...pick(R, [...STD, ...EXTRA]) }]; }));
  return { scenario: id, ...r3 };
});
console.log('versions done');

// Pareto front at KE ≤14.9 J: mass vs max follow speed vs crosswind tolerance (trim, 10° tilt margin, ±30° path)
out.pareto = [0.08, 0.1, 0.12, 0.15, 0.18, 0.21, 0.245].map((mass) => {
  const D = designParams({ ...P, mass });
  const vKE = Math.sqrt((2 * 14.9) / mass);
  let vAir = 0; for (let V = 0; V <= 40; V += 0.25) if (trim(D, V).tiltDeg <= D.tiltMaxDeg) vAir = V;
  const vFollow = Math.min(0.935 * vKE, vAir);
  let W = 0; for (let Wv = 0; Wv <= 25; Wv += 0.25) { let ok = true; for (const psi of [-0.52, 0, 0.52]) { const va = Math.hypot(vFollow * Math.cos(psi), vFollow * Math.sin(psi) + Wv); if (trim(D, va).tiltDeg > D.tiltMaxDeg - 10) ok = false; } if (!ok) break; W = Wv; }
  return { mass, vKE: r(vKE, 2), vAirMax: vAir, maxFollowSpeed: r(vFollow, 2), crosswindTolAtThatSpeed: W, keAt18: r(0.5 * mass * 18 * 18, 1) };
});

// leapfrog/pan variants (v3): 18 m/s with and without a pre-positioned start, crosswind with a pre-positioned start
const cwLeap = { ...sc('crosswind'), id: 'crosswind_leap', rider: { skier: { start: 'push', vTarget: 12, duration: 30, seed: 5 } }, startMode: 'leap' };
out.leapfrog = [['highspeed (chase, moving start)', sc('highspeed')], ['highspeed_leap (pre-positioned)', sc('highspeed_leap')], ['crosswind (chase)', sc('crosswind')], ['crosswind_leap (pre-positioned, push start)', cwLeap]].map(([tag, s]) => {
  const R = C.simulate(P, s);
  return { case: tag, metrics: pick(R, ['avail', 'pxMed', 'azRange', 'keMax', 'jitterRms']), modes: R.events.filter((e) => e.type === 'mode').map((e) => `${e.t}: ${e.en}`) };
});
// v3 sensor sensitivities
out.v3sensors = [['dropout', 'light 0.6', { lightFactor: 0.6 }], ['dropout', 'light 0.3', { lightFactor: 0.3 }], ['overhang', 'range 6 m', { sensorRange: 6 }], ['overhang', 'range 8 m', { sensorRange: 8 }], ['overhang', 'h 2.4 m', { hFollow: 2.4 }], ['treeline', 'range 6 m', { sensorRange: 6 }], ['crossing', 'range 6 m', { sensorRange: 6 }]].map(([sid, tag, o]) => {
  const R = C.simulate({ ...P, ...o }, sc(sid));
  return { scenario: sid, variant: tag, validUntil: R.validUntil, metrics: pick(R, ['avail', 'minClrTree', 'minDistOther', 'reacq', 'reframe', 'keMax']) };
});
console.log('v3 extras done');

// mass trade: KE governor vs wind capability vs following
out.massTrade = [0.12, 0.15, 0.245].flatMap((mass) => [14.9, 0].map((keCap) => {
  const Pm = { ...P, mass, keCap };
  const n = C.simulate(Pm, sc('nominal')), cw = C.simulate(Pm, sc('crosswind'));
  const wc = windCapability(designParams(Pm));
  return { mass, keGovernor: keCap > 0, keSpeedCap: keCap > 0 ? r(0.94 * Math.sqrt((2 * 14.9) / mass), 2) : null, windLimit: wc.Wlim, vAirMax: wc.vmax,
    nominal: pick(n, ['avail', 'keMax', 'endurance', 'addedMass']), crosswind: pick(cw, ['avail', 'keMax', 'crossMax']) };
}));
console.log('massTrade done');

// energy option: swappable packs vs tow leash
out.energy = [['swap6', { energy: 1, packs: 6 }], ['tow1', { energy: 2, packs: 1 }], ['tow6', { energy: 2, packs: 6 }], ['single', { energy: 1, packs: 1 }]].map(([tag, o]) => {
  const n = C.simulate({ ...P, ...o }, sc('nominal')), x = C.simulate({ ...P, ...o }, sc('crossing'));
  return { option: tag, change: o, nominal: pick(n, ['endurance', 'perPack', 'pMean', 'addedMass', 'bodyForcePeak', 'ops', 'keMax']), crossing: pick(x, ['minDistOther', 'lineClr']) };
});
console.log('energy done');

// docking ablation over the 0–9 m/s sweep (+ standstill p90)
const abl = [['v1', { design: 1 }], ['v2/v3-all', {}], ['v2-cone-only', { dockMode: 1, standHeadingIntoWind: 0 }], ['v2-intoWind-only', { captureR: 0.06, dockMode: 1 }], ['v2-commit-only', { captureR: 0.06, standHeadingIntoWind: 0 }], ['v2-noCone', { captureR: 0.06 }]];
out.dockAblation = abl.map(([tag, o]) => {
  const sw = dockSweep(designParams({ ...P, ...o }));
  return { variant: tag, change: o, successByWind: Object.fromEntries(sw.rows.map((x) => [x.U, r(x.success)])), firstByWind: Object.fromEntries(sw.rows.map((x) => [x.U, r(x.first)])), standstillP90: r(sw.p90), pFail: r(sw.pFail) };
});
console.log('dockAblation done');

// sensitivity (one change from the v2 defaults)
const variants = [
  ['nominal', 'fom0.5', { fom: 0.5 }], ['nominal', 'CdA0.012', { CdA: 0.012 }], ['nominal', 'uwbOnly', { beaconSigma: 0.12 }], ['nominal', 'cold-20C', { tempC: -20 }],
  ['nominal', 'd10m', { followDist: 10 }], ['treeline', 'h4m', { hFollow: 4 }], ['short', 'v1', { design: 1 }],
];
out.sensitivity = variants.map(([sid, tag, over]) => {
  const R = C.simulate({ ...P, ...over }, sc(sid));
  return { scenario: sid, variant: tag, change: over, validUntil: R.validUntil, metrics: pick(R, [...STD, ...EXTRA]) };
});
out.trim = [0, 8, 12, 16, 20, 24].map((V) => ({ V, v1: trim(designParams({ design: 1 }), V), v2_150: trim(designParams(P), V), v2_245: trim(designParams({ ...P, mass: 0.245 }), V) }));

const D = C.demo.build(P);
out.demo = { duration: D.duration, stages: C.demo.stages.map((s) => ({ key: s.key, t0: s.t0, t1: s.t1, pending: s.pending, en: s.en })), events: D.events.map((e) => ({ t: e.t, type: e.type, en: e.en })), metrics: D.metrics.map((m) => ({ id: m.id, value: r(m.value) })) };
writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 1));
console.log('wrote', join(here, 'results.json'));
