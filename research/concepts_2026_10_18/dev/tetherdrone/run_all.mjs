// Runs every tetherdrone scenario (and the demo) with default parameters and
// writes results.json: metrics, events and key extremes per scenario.
// Numerical-uncalibrated simulation (SIM-030); not a physical test.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept from '../../../../sim/js/concepts/tetherdrone/index.js';
import { PDEF, rotorPower, tetherElectrical } from '../../../../sim/js/concepts/tetherdrone/model.js';
import { footageStability } from '../../../../sim/js/concepts/common/criteria.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaults = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const ext = (c) => { let mn = Infinity, mx = -Infinity; for (const v of c) if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } return mn === Infinity ? null : { min: +mn.toFixed(3), max: +mx.toFixed(3) }; };
const r3 = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);
const out = { conceptId: concept.id, modelVersion: concept.modelVersion, evidence: 'numerical-uncalibrated simulation (SIM-030); not a physical test', generated: new Date().toISOString().slice(0, 10), params: defaults, scenarios: {} };
const pick = ['tension', 'tensionPeak', 'tensLat', 'reelL', 'headDist', 'handDist', 'clearBody', 'clearPole', 'clearSki', 'sweep', 'tilt', 'droneSpeed', 'pDrone', 'pLoss', 'subjectPx', 'tetherArt', 'keRel', 'keSnow', 'yawM'];
const runs = [...concept.scenarios.map((s) => [s.id, () => concept.simulate(defaults, s), s]), ['demo', () => concept.demo.build(defaults), null]];
for (const [id, fn, sc] of runs) {
  const t0 = performance.now();
  const R = fn();
  const ms = performance.now() - t0;
  out.scenarios[id] = {
    name: sc ? sc.en : 'Demo', expect: sc ? sc.expect.en : null, computeMs: Math.round(ms), validUntil: R.validUntil,
    metrics: Object.fromEntries(R.metrics.map((m) => [m.id, { value: r3(m.value), unit: m.unit, pass: m.pass, criterion: m.criterion ? m.criterion.en : null }])),
    events: R.events.map((e) => ({ t: +e.t.toFixed(2), type: e.type, severity: e.severity, en: e.en })),
    extremes: Object.fromEntries(pick.filter((k) => R.columns[k]).map((k) => [k, ext(R.columns[k])])),
  };
  console.log(id.padEnd(8), `${Math.round(ms)} ms`, R.metrics.filter((m) => m.pass === false).map((m) => `${m.id}=${typeof m.value === 'number' ? m.value.toFixed(2) : m.value}`).join(' '));
}
// v1 / v2 / v3 on every scenario: harmonised metrics + key extras (pass flags)
const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'endurance'];
const EXTRA = ['elecSafe', 'protrusion', 'artFrames', 'availInpaint', 'headLaunch', 'headMin', 'clearBody', 'lossPct', 'branchMin', 'leftOnObstacle', 'backupLeft', 'dockErr'];
const pickM = (R, ids) => Object.fromEntries(R.metrics.filter((x) => ids.includes(x.id)).map((x) => [x.id, { value: r3(x.value), pass: x.pass }]));
out.byDesign = {};
for (const des of [1, 2, 3]) { // v3 = current defaults (v3.1: smoothed station, 6 Hz tracker)
  out.byDesign['v' + des] = {};
  for (const sc of concept.scenarios.filter((x) => !x.compare)) {
    const R = concept.simulate({ ...defaults, design: des }, sc);
    const m = pickM(R, [...STD, ...EXTRA]);
    const fails = Object.entries(m).filter(([, v]) => v.pass === false).map(([k]) => k);
    const fsr = footageStability(R);
    out.byDesign['v' + des][sc.id] = { fails, metrics: m, footageStability: { subjectRms: r3(fsr.subjectRms), backgroundRms: r3(fsr.backgroundRms) } };
    console.log('v' + des, sc.id.padEnd(10), fails.join(' ') || 'all pass', 'jHP', r3(m.jitterRms && m.jitterRms.value), 'fs', r3(fsr.subjectRms), r3(fsr.backgroundRms));
  }
}
// (a) light airframe: hover power and KE at following speeds (closed form)
out.airframe = [[0.2, 0.038, 0.38], [0.12, 0.032, 0.36], [0.075, 0.028, 0.34]].map(([m, R, fom]) => ({
  massKg: m, rotorR: R, hoverW: r3(rotorPower(m * 9.81, [0, 0, 1], [0, 0, 0], { ...PDEF, rotorR: R, fom }) + 6),
  KE12: r3(0.5 * m * 144), KE14: r3(0.5 * m * 196), KE18: r3(0.5 * m * 324), vMaxFor14_9J: r3(Math.sqrt(2 * 14.9 / m)),
}));
// (b) bus voltage vs conductor: loss at 10 m for 45 W delivered, tether mass (2 Cu + 0.7 g/m jacket/aramid)
out.electrical = [];
for (const V of [24, 48, 56, 60, 100]) for (const a of [0.05, 0.09, 0.15]) {
  const e = tetherElectrical(45, V, 10, { ...PDEF, cuArea: a });
  out.electrical.push({ V, cuArea_mm2: a, lossPct: e.ok ? r3((100 * e.loss) / 45) : 'infeasible', PmaxW: r3(e.Pmax), massGperM: r3(2 * a * 8.96 + 0.7), touchSafe: V <= 60 });
}
// (c) geometry study: tether exit × attach spacing × station azimuth (nominal, v2 airframe)
out.geometry = [];
for (const exit of [0, 1, 2, 3, 4, 5]) for (const attachOff of [0.1, 0.3]) for (const az of [0, 30, -30]) {
  const R = concept.simulate({ ...defaults, exit, attachOff, az, shotPlan: 0, attachSwap: 0 }, concept.scenarios.find((s) => s.id === 'nominal'));
  const g = (id) => r3(R.metrics.find((x) => x.id === id).value);
  out.geometry.push({ exit, attachOff, az, artFrames: g('artFrames'), avail: g('avail'), availInpaint: g('availInpaint') });
}
console.log('geometry', out.geometry.map((x) => `${x.exit}/${x.attachOff}/${x.az}:${x.artFrames}`).join(' '));
// sensitivity: one-at-a-time parameter changes on selected scenarios
const SENS = [
  ['fast', { mass: 0.085 }], ['fast', { speedSched: 0 }], ['gust', { windFF: 0 }], ['dock_wind', { windFF: 0 }], ['dock_wind', { attachFold: 0 }],
  ['side_left', { attachSwap: 0 }], ['nominal', { shotPlan: 0 }], ['snag', { cutDelay: 0.1 }], ['fast', { packWh: 60 }], ['nominal', { exit: 0 }],
];
const keys = ['protrusion', 'avail', 'artFrames', 'availInpaint', 'bodyForcePeak', 'bodyForceRaw', 'keMax', 'endurance', 'lossPct', 'headLaunch', 'handLaunch', 'setupTime', 'branchMin', 'leftOnObstacle', 'dockErr'];
out.sensitivity = SENS.map(([sid, ex]) => {
  const R = concept.simulate({ ...defaults, ...ex }, concept.scenarios.find((s) => s.id === sid));
  const m = Object.fromEntries(R.metrics.filter((x) => keys.includes(x.id)).map((x) => [x.id, r3(x.value)]));
  const evs = R.events.filter((e) => e.severity !== 'info').map((e) => `${e.t.toFixed(2)} ${e.type}`);
  console.log('sens', sid, JSON.stringify(ex), JSON.stringify(m), evs.join(', '));
  return { scenario: sid, change: ex, metrics: m, warnings: evs };
});
writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 1));
console.log('wrote', join(here, 'results.json'));
