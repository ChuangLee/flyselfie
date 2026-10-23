// audit2 (round 2, iteration 2) independent re-check of leapfrog@2.0.0 on a COPY of the repo.
// Usage: node recheck.mjs [copyRoot]   (copyRoot = dir that contains sim/ and research/; default $LF_COPY)
// Re-runs the dev 39-case rows from the copy, then for spot cases recomputes metrics from the raw time series
// (independent masks/denominators, KE frames, ops/setup accounting, endurance via components.js, footageStability).
// Numerical-uncalibrated simulation re-check; not a physical test.
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || process.env.LF_COPY;
if (!root) throw new Error('pass the copy root (contains sim/ and research/)');
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const L = await imp('sim/js/concepts/leapfrog/index.js');
const M = await imp('sim/js/concepts/leapfrog/model.js');
const { footageStability } = await imp('sim/js/concepts/common/criteria.js');
const { FULLRUN_CASES, pct } = await imp('sim/js/concepts/common/fullrun.js');
const { enduranceMin, BATTERY, COMPONENTS, MASS_MARGIN, keSpeedCap } = await imp('sim/js/concepts/common/components.js');
const { subjectPoints } = await imp('sim/js/concepts/common/env.js');
const concept = L.default;
const D = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const { PHASE } = M;
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v);
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
const dev = JSON.parse(readFileSync(join(here, '../../dev/leapfrog/results.json'), 'utf8'));
const devRows = Object.fromEntries(dev.ensemble.rows.map((r) => [r.id, r]));

const SPOT = ['calm_s11', 'head3_s12', 'tail3_s12', 'crossL3_s13', 'head6_s11', 'tail6_s11', 'crossL6_s11', 'crossR6_s12', 'head9_s12', 'crossL9_s12', 'crossR9_s11', 'tail9_s13'];
const fr = concept.scenarios.find((s) => s.id === 'fullrun');

function recheck(c, over = {}) {
  const prep = { ...L.fullrunInput(c), fullrun: true };
  const { p, core, A, r } = L.evaluate({ ...D, ...over }, { id: 'fullrun' }, prep);
  const { O, n } = core; const dt = 0.02; const tGo = prep.input.tGo; const sk = prep.sk;
  // independent riding mask from the shared full run (col.riding), shifted by the pre-roll tGo
  const riding = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const j = Math.round((i * dt - tGo) / sk.sampleDt); riding[i] = j >= 0 && j < sk.n && sk.col.riding[j] ? 1 : 0; }
  const nR = riding.reduce((a, b) => a + b, 0);
  let usR = 0, usSki = 0, nSki = 0, geoR = 0;
  // geometric upper bound: whole silhouette inside the 4:3 sensor of the camera's actual pointing and native px ≥300, camera on, not occluded/sprayed/buried
  const tv = Math.tan(core.sensorV / 2), th = Math.tan((p.camHfov * Math.PI) / 360);
  for (let i = 0; i < n; i++) {
    if (A.skiing[i]) { nSki++; if (A.usable[i]) usSki++; }
    if (!riding[i]) continue;
    if (A.usable[i]) usR++;
    const ph = O.phase[i];
    if (ph === PHASE.STOWED || ph === PHASE.PICKUP || O.occl[i] || O.spray[i] || O.sink[i] > 0.05) continue;
    const s = core.rider(i * dt); const pts = subjectPoints(s);
    const f = [O.fx[i], O.fy[i], O.fz[i]], ub = [O.ux[i], O.uy[i], O.uz[i]];
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const nr = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
    const rt = nr(cr(f, ub)), up = nr(cr(rt, f)); const c0 = [O.cx[i], O.cy[i], O.cz[i]];
    let inside = true, ys = [];
    for (const q of [pts.feet, pts.head, pts.shL, pts.shR, pts.skiTip, pts.skiTail]) {
      const d = [q[0] - c0[0], q[1] - c0[1], q[2] - c0[2]]; const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
      if (z <= 0.05) { inside = false; break; }
      const x = (d[0] * rt[0] + d[1] * rt[1] + d[2] * rt[2]) / z / th, y = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / z / tv;
      if (Math.abs(x) > 1 || Math.abs(y) > 1) inside = false; ys.push(y);
    }
    if (!inside) continue;
    const native = A.nativePx[i];
    if (native >= 300) geoR++;
  }
  // KE: ground frame when >1.5 m from the rider, rider frame within; every phase except STOWED (in the holster)
  let ke = 0, keAll = 0;
  for (let i = 0; i < n; i++) {
    if (O.phase[i] === PHASE.STOWED) continue;
    const s = core.rider(i * dt);
    const g = 0.5 * p.mass * (O.vx[i] ** 2 + O.vy[i] ** 2 + O.vz[i] ** 2);
    const rel = 0.5 * p.mass * ((O.vx[i] - s.vel[0]) ** 2 + (O.vy[i] - s.vel[1]) ** 2 + (O.vz[i] - s.vel[2]) ** 2);
    const dist = Math.hypot(O.x[i] - s.pos[0], O.y[i] - s.pos[1], O.z[i] - s.pos[2] - 1.0);
    ke = Math.max(ke, dist > 1.5 ? g : rel); keAll = Math.max(keAll, g);
  }
  // user actions from events + end state
  const evs = core.events.map((e) => e.type);
  const cnt = (t) => evs.filter((x) => x === t).length;
  const opsIndep = core.noFly ? 2 : 1 /* toss */ + 1 /* pick-up + holster */ + ((cnt('giveup') + cnt('stranded') + cnt('perchfail') + cnt('slideaway')) > 0 || r.pr.nextRun ? 1 : 0);
  // standstill: their 4 s toss + 10 s holster (ASSUMED) + side-step; audit alternative also charges the end retrieval ride (glider lands ~30–40 m BEYOND the lift-approach stop)
  const setupAlt = core.noFly ? r.pr.setup : r.pr.setup + r.pr.retrieveRide;
  const whEff = p.battWh + p.bankWh * p.bankEff;
  // energy per run vs the on-board cell (usable cold, with reserve)
  const cellUsable = p.battWh * BATTERY.coldFactor * (1 - BATTERY.reserve);
  return {
    core, r, p,
    row: {
      id: c.id, U: c.U, dir: c.dir, noFly: core.noFly,
      claimed: (() => { const d = devRows[c.id]; return { avail: d.avail, setupTime: d.setupTime, ops: d.ops, keMax: d.keMax, bodyForcePeak: d.bodyForcePeak, pMean: d.pMean, retrieveDist: d.retrieveDist }; })(),
      recomputed: {
        availTheirMask: r3(nSki ? (100 * usSki) / nSki : 0), availRidingMask: r3(nR ? (100 * usR) / nR : 0), availGeomUpperBoundRiding: r3(nR ? (100 * geoR) / nR : 0),
        ridingS: r3(nR * dt), theirSkiingS: r3(nSki * dt),
        setupTime: r3(r.pr.setup), setupTimeInclRetrievalRide: r3(setupAlt), ops: opsIndep,
        keMax: r3(ke), keMaxGroundAllPhases: r3(keAll), tdKEmax: r3(r.tdKE), bodyForcePeak: r3(r.bodyF),
        pMean: r3(r.pMean), energyRunWh: r3(r.eRun), cellUsableColdWh: r3(cellUsable),
        enduranceCase: r3(enduranceMin(whEff, r.pMean, { heated: true })),
        retrieveDist: r3(r.pr.retrieveDist), retrieveRide_s: r3(r.pr.retrieveRide), sepMaxFly: r3(r.sepMaxFly), events: Object.fromEntries([...new Set(evs)].filter((t) => !['touchdown', 'flare'].includes(t)).map((t) => [t, cnt(t)])),
      },
    },
  };
}

const out = { generated: new Date().toISOString().slice(0, 10), copyRoot: root, modelVersion: concept.modelVersion, evidence: 'audit re-run of numerical-uncalibrated simulation on a copy; not a physical test' };

// ---- 1. full 39-case recompute of the judged statistics (their row function, our statistics)
const rows = FULLRUN_CASES.map((c) => { const x = recheck(c).row; return x; });
const col = (k, f = () => true) => rows.filter(f).map((x) => x.recomputed[k]);
const flown = (x) => !x.noFly;
const pMeanFlown = mean(col('pMean', flown));
const pMeanAll = mean(col('pMean'));
const whEff = D.battWh + D.bankWh * 0.85;
out.ensemble = {
  n: rows.length,
  avail: { theirMaskMean: r3(mean(col('availTheirMask'))), ridingMaskMean: r3(mean(col('availRidingMask'))), geomUpperBoundMean: r3(mean(col('availGeomUpperBoundRiding'))), p10: r3(pct(col('availTheirMask'), 0.1)) },
  availEnvelope_U6_noTail6: r3(mean(rows.filter((x) => x.U <= 6 && !(x.dir === 'tail' && x.U >= 6)).map((x) => x.recomputed.availTheirMask))),
  availEnvelope_flownOnly: r3(mean(rows.filter(flown).map((x) => x.recomputed.availTheirMask))),
  byWind: Object.fromEntries([0, 3, 6, 9].map((U) => [`U${U}`, { availTheirMask: r3(mean(rows.filter((x) => x.U === U).map((x) => x.recomputed.availTheirMask))), availRidingMask: r3(mean(rows.filter((x) => x.U === U).map((x) => x.recomputed.availRidingMask))), noFly: rows.filter((x) => x.U === U && x.noFly).length }])),
  setupTime: { p90: r3(pct(col('setupTime'), 0.9)), p90InclRetrievalRide: r3(pct(col('setupTimeInclRetrievalRide'), 0.9)), max: Math.max(...col('setupTime')) },
  ops: { p90: pct(col('ops'), 0.9), max: Math.max(...col('ops')) },
  keMax: { max: r3(Math.max(...col('keMax'))), groundAllPhasesMax: r3(Math.max(...col('keMaxGroundAllPhases'))), tdKEmax: r3(Math.max(...col('tdKEmax').filter(Number.isFinite))) },
  bodyForcePeak: { max: r3(Math.max(...col('bodyForcePeak'))) },
  endurance: {
    flownCasesHeated: r3(enduranceMin(whEff, pMeanFlown, { heated: true })), allCasesHeated: r3(enduranceMin(whEff, pMeanAll, { heated: true })),
    flownCasesAt200WhPerKgIrrelevant: 'bank Wh is fixed at 14 Wh (93 g); 150 Wh/kg is the shared rule',
    onboardCellOnly: r3(enduranceMin(D.battWh, pMeanFlown, { heated: true })), pMeanFlown: r3(pMeanFlown), whEff: r3(whEff),
  },
};
console.log('ensemble', JSON.stringify(out.ensemble));

// ---- 2. spot cases with footageStability on the full Result
out.spot = [];
for (const id of SPOT) {
  const c = FULLRUN_CASES.find((k) => k.id === id);
  const x = rows.find((y) => y.id === id);
  const R = concept.simulate(D, { ...fr, caseId: id });
  const fs = footageStability(R);
  out.spot.push({ ...x, footageStability: { subjectRms: r3(fs.subjectRms), backgroundRms: r3(fs.backgroundRms), samples: fs.samples } });
  console.log(id, JSON.stringify(x.recomputed).slice(0, 300), 'fs', r3(fs.subjectRms), r3(fs.backgroundRms));
}

// ---- 3. sensitivities on the 6-case dev subset + tail/9 cases (audit assumptions)
const SUB = ['calm_s11', 'crossR6_s12', 'head6_s11', 'tail3_s12', 'crossL3_s11', 'head3_s13'];
const SENS = [
  ['base', {}],
  ['uwbPointSig_5deg (DW3000-class PDoA AoA, live pointing)', { pointSigDeg: 5 }],
  ['uwbPointSig_5deg_liveFraming', { pointSigDeg: 5, postFrame: 0 }],
  ['eisRes_0.3_gimbal_4Hz', { eisRes: 0.3, gimbalHz: 4 }],
  ['camRows_2160_16x9 (shared cam4k)', { camRows: 2160, camAspect: 16 / 9 }],
  ['cd0_0.055 (draggier folding wing)', { cd0: 0.055 }],
  ['T0_1.2N (thrust −25 %)', { T0: 1.2 }],
  ['anchorCap_1N_muClaw_0.5 (hard-pack)', { anchorCap: 1, muClaw: 0.5 }],
  ['mass_+10pct', { mass: +(D.mass * 1.1).toFixed(4) }],
];
out.sensitivity = {};
for (const [k, over] of SENS) {
  const rs = SUB.map((id) => recheck(FULLRUN_CASES.find((c) => c.id === id), over).row.recomputed);
  out.sensitivity[k] = { over, availMean: r3(mean(rs.map((x) => x.availTheirMask))), availMin: r3(Math.min(...rs.map((x) => x.availTheirMask))), keMax: r3(Math.max(...rs.map((x) => x.keMax))), opsMax: Math.max(...rs.map((x) => x.ops)), setupMax: Math.max(...rs.map((x) => x.setupTime)), pMean: r3(mean(rs.map((x) => x.pMean))) };
  console.log('sens', k, JSON.stringify(out.sensitivity[k]));
}

// ---- 4. mass rebuild from the shared table
const rebuilt = [['structure (dev ASSUMED)', 47], ['motorProp', COMPONENTS.motorProp.g], ['avionics', COMPONENTS.avionics.g], ['servo×3', 3 * COMPONENTS.servo.g], ['camera 4K 4:3 (dev 20 g; shared cam4k 16 g)', 20], ['gimbal2ax', COMPONENTS.gimbal2ax.g], ['npu (dev 4 g; shared visionCompute 11 g)', 4], ['wiring', COMPONENTS.wiring.g], ['battery 1.8 Wh @150 Wh/kg', 12]];
const sum = rebuilt.reduce((a, b) => a + b[1], 0);
const sumShared = sum - 4 + COMPONENTS.visionCompute.g; // if the shared tracking computer is used instead of the ASSUMED 4 g NPU
out.mass = { lines: rebuilt, sum_g: sum, withMargin_g: r3(sum * (1 + MASS_MARGIN)), withSharedVisionCompute_g: r3(sumShared * (1 + MASS_MARGIN)), keCap_ms: r3(keSpeedCap(sum * (1 + MASS_MARGIN) / 1000)), keCapWithVision_ms: r3(keSpeedCap(sumShared * (1 + MASS_MARGIN) / 1000)), C0_250g: sum * (1 + MASS_MARGIN) < 250 };
console.log('mass', JSON.stringify(out.mass));
writeFileSync(join(here, 'recheck_out.json'), JSON.stringify(out, null, 1));
console.log('wrote recheck_out.json');
