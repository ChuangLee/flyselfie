// Runs every descentglider scenario plus the design-variant sweeps and writes results.json
// (metrics, events, key extremes, independent footage-stability check, measured constants).
// Usage: node research/concepts_2026_10_19/dev/descentglider/run_all.mjs   (from the repo root)
// Numerical, uncalibrated simulation — not a physical test.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept, { SETUP_SWEEP, HOVER_J, resolve } from '../../../../sim/js/concepts/descentglider/index.js';
import { MODE, MODE_NAME, glide, stallSpeed, hoverPower, tipWind, vKE, wingGeom } from '../../../../sim/js/concepts/descentglider/model.js';
import { footageStability } from '../../../../sim/js/concepts/common/criteria.js';

const here = dirname(fileURLToPath(import.meta.url));
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const PR = resolve(P);
const r = (x, n = 2) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : x);
const colStats = (c) => { let mn = Infinity, mx = -Infinity; for (const v of c) if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } return [r(mn), r(mx)]; };
const E = (R, modes) => { const O = R.core.O; let e = 0; for (let i = 0; i < R.n; i++) if (modes.includes(O.mode[i])) e += O.Pmot[i] * 0.02; return e; };
const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'endurance'];

function summary(R) {
  const m = {};
  for (const x of R.metrics) m[x.id] = { value: r(x.value), unit: x.unit, pass: x.pass, criterion: x.criterion ? x.criterion.en : null };
  const fs = footageStability(R);
  const C = R.columns;
  const modeTime = {}; for (let i = 0; i < R.n; i++) { const k = MODE_NAME[R.core.O.mode[i]]; modeTime[k] = r((modeTime[k] || 0) + 0.02, 2); }
  return {
    metrics: m,
    std12: Object.fromEntries(STD.map((id) => [id, { value: m[id]?.value, pass: m[id]?.pass }])),
    std12Passed: STD.filter((id) => m[id]?.pass === true).length,
    std12Judged: STD.filter((id) => m[id] && m[id].pass !== null).length,
    footageStability: { subjectRms: r(fs.subjectRms), backgroundRms: r(fs.backgroundRms) },
    extremes: { agl: colStats(C.agl), airspeed: colStats(C.airspeed), groundSpeed: colStats(C.groundSpeed), headDist: colStats(C.headDist), keSnow: colStats(C.keSnow), pElec: colStats(C.pElec), energyWh: r(C.energyWh[R.n - 1], 3), regenJ: r(R.core.sum.regenJ, 0), motorJ: r(R.core.sum.motorJ, 0) },
    modeTime,
    events: R.events.map((e) => ({ t: r(e.t), type: e.type, severity: e.severity, en: e.en })),
    validUntil: R.validUntil,
  };
}

const out = {
  meta: {
    concept: 'descentglider', modelVersion: concept.modelVersion, generated: new Date().toISOString().slice(0, 10),
    evidence: 'numerical-uncalibrated simulation; demo is an illustration; nothing physically tested',
    params: P, resolvedMass_kg: r(PR.mass, 4),
  },
  sizing: {
    LDmax_spread: r(1 / (2 * Math.sqrt(wingGeom(0, PR).cd0 * wingGeom(0, PR).k))), LDmax_swept: r(1 / (2 * Math.sqrt(wingGeom(1, PR).cd0 * wingGeom(1, PR).k))),
    stall_spread_ms: r(stallSpeed(0, PR)), stall_swept_ms: r(stallSpeed(1, PR)), hoverPower_W: r(hoverPower(PR), 1), KEcapSpeed_ms: r(vKE(PR.mass)),
    glideDeg: Object.fromEntries([8, 10, 12, 14, 16].map((V) => [V, { spread: r(glide(V, 0, PR)?.gammaDeg ?? null, 1), swept: r(glide(V, 1, PR)?.gammaDeg ?? null, 1) }])),
    tipWind_ms: { spanAligned: r(tipWind(PR, 0), 1), offset15deg: r(tipWind(PR, 15), 1) },
  },
  scenarios: {},
};

const t0 = Date.now();
const R = {};
for (const sc of concept.scenarios) {
  const t1 = Date.now();
  R[sc.id] = concept.simulate(P, sc);
  out.scenarios[sc.id] = { name: sc.en, expect: sc.expect.en, compare: !!sc.compare, fault: !!sc.fault, computeMs: Date.now() - t1, ...summary(R[sc.id]) };
  process.stdout.write(`${sc.id} ${out.scenarios[sc.id].std12Passed}/${out.scenarios[sc.id].std12Judged}\n`);
}
// measured constants used by index.js (SETUP_SWEEP, HOVER_J)
const cyc = ['cycle', 'cycle_w5', 'cycle_w9'];
out.measuredConstants = {
  setupTime_worst_s: r(Math.max(...cyc.map((id) => R[id].metrics.find((m) => m.id === 'setupTime').value))), SETUP_SWEEP_inCode: SETUP_SWEEP,
  hoverJ_launch_worst: r(Math.max(...cyc.map((id) => E(R[id], [MODE.TAKEOFF, MODE.TRANS]))), 0),
  hoverJ_endLanding_worst: r(Math.max(...cyc.map((id) => E(R[id], [MODE.FLARE, MODE.HLAND]))), 0),
  hoverJ_midPerchCycle: r(E(R.stop, [MODE.TAKEOFF, MODE.TRANS, MODE.FLARE, MODE.HLAND]), 0),
  HOVER_J_inCode: HOVER_J,
};
// design-variant sweeps on the nominal (and selected) scenarios
const variants = [
  { id: 'v0.9_centreline', over: { followMode: 0, stationD: 7, stationH: 3.5, cropHfov: 55, azAmp: 35, smoothTau: 1.6 }, note: 'low-passed centre line, 7 m behind (first iteration)' },
  { id: 'trail_k1', over: { trailK: 1 }, note: 'pure delayed own track' },
  { id: 'trail_k0.5', over: { trailK: 0.5 }, note: 'half blend' },
  { id: 'station_6m', over: { stationD: 6, stationH: 3 }, note: 'farther station' },
  { id: 'station_4m', over: { stationD: 4, stationH: 2.4 }, note: 'closer station' },
  { id: 'battery_6Wh', over: { battWh: 6 }, note: '118 g airframe' },
  { id: 'battery_10Wh', over: { battWh: 10 }, note: '128 g airframe' },
  { id: 'fixed_wing', over: { sweepOn: 0 }, note: 'no sweep morphing' },
  { id: 'LD_minus30', over: { dragScale: 1.43 }, note: 'brief-mandated sensitivity' },
  { id: 'crop_55', over: { cropHfov: 55 }, note: 'wider crop (4K over 110° lens)' },
];
out.variants = {};
for (const v of variants) {
  out.variants[v.id] = { note: v.note, over: v.over };
  for (const id of ['nominal', 'short', 'gust']) {
    const Rv = concept.simulate({ ...P, ...v.over }, concept.scenarios.find((s) => s.id === id));
    const g = (k) => r(Rv.metrics.find((m) => m.id === k)?.value);
    out.variants[v.id][id] = { avail: g('avail'), pxMed: g('pxMed'), jitterRms: g('jitterRms'), pFollow: g('pFollow'), endurance: g('endurance'), keMax: g('keMax'), aglMin: g('aglMin') };
  }
}
for (const [id, over] of [['stop_orbit', { stopMode: 1 }], ['stop_perch', {}]]) {
  const Rv = concept.simulate({ ...P, ...over }, concept.scenarios.find((s) => s.id === 'stop'));
  const g = (k) => r(Rv.metrics.find((m) => m.id === k)?.value);
  out.variants[id] = { note: over.stopMode === 1 ? 'orbit the stopped rider instead of perching' : 'default perch', stop: { avail: g('avail'), energyWh: r(Rv.columns.energyWh[Rv.n - 1], 3), pFollow: g('pFollow'), hoverJ: g('hoverJ'), ops: g('ops') } };
}
const D = concept.demo.build(P);
out.demo = { duration: D.duration, events: D.events.map((e) => ({ t: r(e.t), type: e.type })), stages: concept.demo.stages.map((s) => ({ key: s.key, t0: s.t0, t1: s.t1, pending: !!s.pending })) };
out.meta.totalComputeMs = Date.now() - t0;
writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 1));
console.log('wrote results.json', out.meta.totalComputeMs, 'ms');
