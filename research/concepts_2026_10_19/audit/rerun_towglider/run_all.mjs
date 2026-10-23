// Runs every towglider scenario (default parameters) plus the design-variant sweep and
// writes results.json next to this script. Numerical-uncalibrated simulation output.
// Usage: node research/concepts_2026_10_19/dev/towglider/run_all.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept from '../../../../sim/js/concepts/towglider/index.js';
import { footageStability } from '../../../../sim/js/concepts/common/criteria.js';
import { liftDrag, vStall, PDEF } from '../../../../sim/js/concepts/towglider/model.js';

const here = dirname(fileURLToPath(import.meta.url));
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const colMax = (R, k) => { let m = -Infinity; for (const v of R.columns[k] || []) if (Number.isFinite(v) && v > m) m = v; return Number.isFinite(m) ? r3(m) : null; };
const summarise = (R) => {
  const fs = footageStability(R);
  return {
    metrics: Object.fromEntries(R.metrics.map((m) => [m.id, { value: r3(m.value), unit: m.unit, pass: m.pass, criterion: m.criterion ? m.criterion.en : null }])),
    events: R.events.map((e) => ({ t: r3(e.t), type: e.type, severity: e.severity, en: e.en })),
    extremes: { hipTensionMax_N: colMax(R, 'tension'), keSnowMax_J: colMax(R, 'keSnow'), lagMax_m: colMax(R, 'lag'), reelLineMax_m: colMax(R, 'reelL'), airspeedMax_ms: colMax(R, 'airspeed'), crossForceMax_N: colMax(R, 'crossForce') },
    footageStability: { subjectRms_degs: r3(fs.subjectRms), backgroundRms_degs: r3(fs.backgroundRms) },
    validUntil: R.validUntil,
  };
};
const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'endurance'];

const out = {
  conceptId: 'towglider', modelVersion: concept.modelVersion, generated: new Date().toISOString().slice(0, 10),
  evidence: 'numerical-uncalibrated simulation (sim/js/concepts/towglider); not a physical test. Parameters ASSUMED unless cited.',
  defaults: P,
  polar: Object.fromEntries([6, 8, 10, 12, 14, 16, 18].map((v) => [`LD_at_${v}`, r3(liftDrag({ ...PDEF, ...P }, v))])),
  vStall_ms: r3(vStall({ ...PDEF, ...P })),
  scenarios: {}, demo: null, variants: [], passTable: {},
};
for (const sc of concept.scenarios) {
  const t0 = Date.now();
  const R = concept.simulate(P, sc);
  out.scenarios[sc.id] = { en: sc.en, expect: sc.expect.en, fault: !!sc.fault, stow: !!sc.stow, compare: !!sc.compare, computeMs: Date.now() - t0, ...summarise(R) };
  out.passTable[sc.id] = Object.fromEntries(STD.map((id) => { const m = R.metrics.find((x) => x.id === id); return [id, m ? (m.pass === null ? `n/j ${r3(m.value)}` : `${m.pass ? 'PASS' : 'FAIL'} ${r3(m.value)}`) : 'n/a']; }));
  console.log(sc.id.padEnd(14), `${Date.now() - t0} ms`, STD.map((id) => { const m = R.metrics.find((x) => x.id === id); return m ? `${id}:${typeof m.value === 'number' ? m.value.toFixed(1) : m.value}${m.pass === true ? '✓' : m.pass === false ? '✗' : '·'}` : ''; }).join(' '));
}
{ const D = concept.demo.build(P); out.demo = { duration: concept.demo.duration, stages: concept.demo.stages.map((s) => ({ key: s.key, t0: s.t0, t1: s.t1, pending: s.pending, en: s.en })), ...summarise(D) }; }

// setup-time sweep used by index.js SETUP_SWEEP: worst measured standstill over the 0–9 m/s stop/dock runs
out.setupSweep = {};
for (const d of [1, 2]) {
  const vals = ['dock', 'dock_wind', 'stop', 'stop_wind'].map((id) => { const R = concept.simulate({ ...P, design: d }, concept.scenarios.find((s) => s.id === id)); return R.metrics.find((m) => m.id === 'setupTime').value; });
  out.setupSweep[`design${d}`] = { dock: r3(vals[0]), dock_wind: r3(vals[1]), stop: r3(vals[2]), stop_wind: r3(vals[3]), worst: r3(Math.max(...vals.filter(Number.isFinite))) };
}
console.log('setup sweep', JSON.stringify(out.setupSweep));

// ---- design-variant sweep (one factor at a time from the chosen design, plus the I-05 preset)
const VARIANTS = [
  { id: 'chosen', over: {}, why: 'chosen architecture (defaults)' },
  { id: 'I05_original', over: { design: 1 }, why: 'inventor I-05 numbers: 125 g, S 0.06, AR 9, cd0 0.035, fixed 90° camera, light smoothing, 7 m / 4.5 m' },
  { id: 'cam_fixed90', over: { cam: 0 }, why: 'no gimbal: body-fixed 4K 90° + EIS reframe' },
  { id: 'cam_fixed120', over: { cam: 1 }, why: 'no gimbal: body-fixed 4K 120° + EIS reframe' },
  { id: 'mass_080', over: { mass: 0.08 }, why: 'lighter 80 g (KE cap 19 m/s; needs a lighter camera than budgeted)' },
  { id: 'mass_125', over: { mass: 0.125 }, why: 'I-05 mass 125 g with the chosen airframe' },
  { id: 'sweep_morph', over: { sweep: 1 }, why: 'LisHawk-style sweep morph (S2-01)' },
  { id: 'station_far', over: { Dback: 9, Hsnow: 4.5 }, why: 'farther station 9 m behind / 4.5 m up' },
  { id: 'station_close', over: { Dback: 5, Hsnow: 2.6 }, why: 'closer station 5 m behind / 2.6 m up' },
  { id: 'Tmin_005', over: { Tmin: 0.05 }, why: 'near-zero leash tension (I-05 median 0.01 N idea)' },
  { id: 'Tmin_030', over: { Tmin: 0.3 }, why: 'stiffer leash 0.3 N minimum' },
  { id: 'line_030', over: { dLine: 0.3 }, why: '0.3 mm line (more visible to others, stronger)' },
  { id: 'smooth_short', over: { stationTau: 0.4 }, why: 'little path smoothing (glider tracks every turn)' },
  { id: 'ld_minus30', over: { ldFactor: 0.7 }, why: 'L/D −30 % sensitivity' },
];
const VSC = ['nominal', 'short', 'fast', 'flat', 'gust'];
const KEYS = ['avail', 'pxMed', 'jitterRms', 'keMax', 'tensionP50', 'tensionP95', 'towShare', 'brakeMean', 'artFrames', 'lagMax', 'heightMin', 'airMin', 'clearPole', 'addedMass', 'packVol'];
for (const v of VARIANTS) {
  const row = { id: v.id, over: v.over, why: v.why, results: {} };
  for (const id of VSC) {
    const R = concept.simulate({ ...P, ...v.over }, concept.scenarios.find((s) => s.id === id));
    const fs = footageStability(R);
    row.results[id] = { ...Object.fromEntries(KEYS.map((k) => { const m = R.metrics.find((x) => x.id === k); return [k, m ? r3(m.value) : null]; })), fsSubject: r3(fs.subjectRms), fsBackground: r3(fs.backgroundRms) };
  }
  out.variants.push(row);
  console.log('variant', v.id.padEnd(14), VSC.map((id) => `${id}: av ${row.results[id].avail} px ${row.results[id].pxMed} j ${row.results[id].jitterRms} KE ${row.results[id].keMax} T95 ${row.results[id].tensionP95}`).join(' | '));
}
writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 1));
console.log('wrote', join(here, 'results.json'));
