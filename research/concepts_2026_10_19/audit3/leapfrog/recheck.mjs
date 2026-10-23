// Audit3 (round 3) independent re-check of leapfrog@3.0.0. Runs against a COPY of sim/ (never the live repo):
//   node recheck.mjs SIMCOPY_ROOT [i0 i1] [--bypass]   → out_part_<i0>_<i1>.json (merge with merge.mjs)
// For every FULLRUN_CASE: concept.simulate() on a fullrun scenario for that case, then the auditor's OWN metrics from
// R.frame(t) and the raw core columns:
//   avail     own usable test (productCam present, all 6 subject points inside the 16:9 crop, ≥300 px after the native-row
//             cap, rider not fallen, product loss flags occl/spray/buried honoured) over simulateRun(seed).col.riding shifted by
//             the simulated push-off time tGo (availMask rule; no-fly runs = 0). Also a variant without the loss flags.
//   jitter    common/criteria.js footageStability(R).subjectRms (flown cases).
//   keMax     ground frame when >1.5 m from every rider body point, rider frame within; all non-carried phases.
//   headClear helmet centre = skier.pos + [0,0,1.75·0.92]; distance to the glider centre minus a 0.38 m half-span sphere
//             (wing tips + prop disc) — airborne phases (launch/lead/land/takeoff/slide) and, separately, incl. perch.
//   range     max 3-D distance glider ↔ rider pelvis while airborne (EU C0 follow-me 50 m).
//   setup/ops recount from the core phase log + simulateRun stops (wait for landing, retrieval distance), dev constants
//             reported separately.
//   endurance shared enduranceMin(cell + bank×eff, mean pTot over non-carried samples of flown cases, heated).
// Also: reproduction of the developer's per-case numbers (R.summary) vs dev/leapfrog/results.json ensemble rows.
// Numerical-uncalibrated simulation; not a physical test.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2];
if (!ROOT || ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('pass a COPY root (not the live repo)');
const i0 = +(process.argv[3] ?? 0), i1 = +(process.argv[4] ?? 39);
const BYPASS = process.argv.includes('--bypass');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const LF = await imp('sim/js/concepts/leapfrog/index.js');
const M = await imp('sim/js/concepts/leapfrog/model.js');
const CR = await imp('sim/js/concepts/common/criteria.js');
const FR = await imp('sim/js/concepts/common/fullrun.js');
const CO = await imp('sim/js/concepts/common/components.js');
const SK = await imp('sim/js/concepts/common/skier.js');
const EN = await imp('sim/js/concepts/common/env.js');
const concept = LF.default;
const D = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const P = { ...M.PDEF, ...D };
const { PHASE } = M;
const dev = JSON.parse(readFileSync(join(ROOT, 'research/concepts_2026_10_19/dev/leapfrog/results.json'), 'utf8'));
const devRows = dev.ensemble.rows;
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dt = 0.02;
// accelerate 1.5 m/s² to a 4 m/s skate/glide, brake 2 m/s² (auditor kinematics; same numbers the developer declares)
const mt = (d, v = 4, a = 1.5, b = 2) => { if (d <= 0) return 0; const dA = v * v / (2 * a) + v * v / (2 * b); return d >= dA ? v / a + v / b + (d - dA) / v : Math.sqrt(2 * d * a * b / (a + b)) * (1 / a + 1 / b); };

function ownFrameOK(pc, s, nativePxRad) {
  if (!pc || s.fallen) return { ok: false, px: 0, inFrame: false };
  const pts = EN.subjectPoints(s);
  const f = nrm(pc.fwd), r = nrm(crs(f, [0, 0, 1])), u = crs(r, f);
  const tv = Math.tan(pc.vfovDeg * Math.PI / 360), th = tv * 16 / 9;
  const pr = (p) => { const d = sub(p, pc.pos); const z = dot(d, f); return z <= 0.05 ? null : [dot(d, r) / z / th, dot(d, u) / z / tv]; };
  const all = [pts.feet, pts.head, pts.shL, pts.shR, pts.skiTip, pts.skiTail].map(pr);
  if (all.some((x) => !x)) return { ok: false, px: 0, inFrame: false };
  const inFrame = Math.max(...all.map((x) => Math.max(Math.abs(x[0]), Math.abs(x[1])))) <= 1;
  const ys = all.map((x) => x[1]);
  let px = (Math.max(...ys) - Math.min(...ys)) / 2 * 1080;
  const nativeRows = pc.vfovDeg * Math.PI / 180 * nativePxRad;
  px *= Math.min(1, nativeRows / 1080);
  return { ok: inFrame && px >= 300, px, inFrame };
}

function runCase(c, { bypass = false } = {}) {
  const t0 = performance.now();
  let R, tGo, sk;
  if (bypass) {
    const prep = { ...LF.fullrunInput(c, {}), fullrun: true, caseObj: c };
    prep.input.plan.noFlyGate = false;
    R = LF.buildResult(D, { id: `bypass_${c.id}` }, prep); tGo = prep.input.tGo; sk = prep.sk;
  } else {
    R = concept.simulate(D, { id: `fullrun_${c.id}`, kind: 'fullrun', caseId: c.id });
    const fi = LF.fullrunInput(c, {}); tGo = fi.input.tGo; sk = fi.sk;
  }
  const core = R.core, O = core.O, n = core.n;
  if (Math.abs(R.duration - (sk.duration + tGo)) > 1e-6) throw new Error('tGo mismatch');
  const run = FR.simulateRun({ seed: c.seed });
  const ridingAt = (i) => { const ts = i * dt - tGo; if (ts < 0) return 0; const m = FR.availMask(run); return m[Math.min(run.n - 1, Math.round(ts / run.sampleDt))]; };
  let ride = 0, ok = 0, okNoFlags = 0, flight = 0;
  let ke = 0, keAir = 0, hcAir = Infinity, hcAirT = null, hcAirPh = null, hcInclPerch = Infinity, hcPerchT = null, rangeMax = 0;
  const helmet = (s) => [s.pos[0], s.pos[1], s.pos[2] + 1.75 * 0.92];
  const airborne = (ph) => ph === PHASE.LAUNCH || ph === PHASE.LEAD || ph === PHASE.LAND;
  const moving = (ph) => airborne(ph) || ph === PHASE.TAKEOFF || ph === PHASE.SLIDE;
  let pSum = 0, pN = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const f = R.frame(t);
    const s = f.skier, ph = O.phase[i];
    const g = [O.x[i], O.y[i], O.z[i]];
    // avail
    if (ridingAt(i) === 1) {
      ride++;
      const fr = ownFrameOK(f.productCam, s, core.nativePxRad);
      const flags = O.occl[i] || O.spray[i] || O.sink[i] > 0.05;
      if (fr.ok) { okNoFlags++; if (!flags) { ok++; if (airborne(ph)) flight++; } }
    }
    if (ph === PHASE.STOWED || ph === PHASE.PICKUP) continue;
    // KE
    const bp = SK.bodyPoints(s);
    const dBody = Math.min(...[bp.feet, bp.pelvis, bp.chest, bp.head].map((q) => Math.hypot(...sub(g, q))));
    const v = [O.vx[i], O.vy[i], O.vz[i]];
    const k = dBody > 1.5 ? 0.5 * P.mass * dot(v, v) : 0.5 * P.mass * dot(sub(v, s.vel), sub(v, s.vel));
    ke = Math.max(ke, k); if (airborne(ph)) keAir = Math.max(keAir, k);
    // headClear
    const hd = Math.hypot(...sub(g, helmet(s))) - 0.38;
    if (moving(ph) && hd < hcAir) { hcAir = hd; hcAirT = t; hcAirPh = M.PHASE_NAME[ph]; }
    if (hd < hcInclPerch) { hcInclPerch = hd; hcPerchT = t; }
    if (airborne(ph)) rangeMax = Math.max(rangeMax, Math.hypot(...sub(g, bp.pelvis)));
    if (Number.isFinite(O.pTot[i])) { pSum += O.pTot[i]; pN++; }
  }
  const noFly = !!core.noFly;
  const fs = noFly ? null : CR.footageStability(R);
  // setup / ops recount: final stop of THIS rider (simulateRun stops) shifted by tGo; when is the glider down for good
  const onSnow = (ph) => ph === PHASE.PERCH || ph === PHASE.PICKUP || ph === PHASE.STRANDED;
  const lastStop = run.stops[run.stops.length - 1];
  let tDown = 0; for (let i = n - 1; i >= 0; i--) if (!onSnow(O.phase[i])) { tDown = (i + 1) * dt; break; }
  const landedAtEnd = onSnow(O.phase[n - 1]);
  const sEnd = core.rider((n - 1) * dt);
  const gEnd = [O.x[n - 1], O.y[n - 1]];
  const retrieveDist = Math.hypot((gEnd[0] - sEnd.pos[0]) / Math.cos(Math.atan(core.tanS)), gEnd[1] - sEnd.pos[1]);
  const along = (gEnd[0] - sEnd.pos[0]);
  const PR = LF.PER_RUN;
  const stranded = core.events.some((e) => ['stranded', 'perchfail', 'slideaway'].includes(e.type));
  const evCount = (ty) => core.events.filter((e) => e.type === ty).length;
  const own = noFly ? { setup: PR.NOFLY_S, ops: 1, launchStand: PR.NOFLY_S, wait: 0, move: 0 } : (() => {
    const wait = landedAtEnd ? Math.max(0, tDown - (lastStop.t0 + tGo)) : 15;
    const nextRun = retrieveDist > P.sepHard && along < 0;
    const move = nextRun ? 10 : along >= -1 ? mt(Math.max(0, retrieveDist - 1.2)) : Math.max(0, -along - 1) / PR.SIDESTEP_V + Math.abs(gEnd[1] - sEnd.pos[1]) / PR.TRAVERSE_V;
    return { setup: tGo + wait + move + PR.STOW_S, ops: 2 + (stranded || nextRun ? 1 : 0), launchStand: tGo, wait, move, nextRun };
  })();
  // endurance of this case
  const whEff = P.battWh + P.bankWh * P.bankEff;
  const pMean = noFly ? P.pStandby : pSum / Math.max(1, pN);
  const S = R.summary;
  const d = devRows.find((x) => x.id === c.id);
  const repro = d ? Object.fromEntries(['avail', 'keMax', 'headClear', 'setupTime', 'ops', 'fsSubject', 'sepMaxFly', 'pMean'].map((k) => {
    const mine = k === 'setupTime' ? S.pr.setup : k === 'ops' ? S.pr.ops : k === 'fsSubject' ? (fs ? fs.subjectRms : NaN) : k === 'pMean' ? S.pMean : S[k];
    return [k, { dev: d[k], rerun: r3(mine) }];
  })) : null;
  return {
    id: c.id, U: c.U, dir: c.dir, seed: c.seed, bypass, noFly, gate: core.gate, tGo: r3(tGo), ms: Math.round(performance.now() - t0),
    own: {
      avail: r3(100 * ok / Math.max(1, ride)), availNoLossFlags: r3(100 * okNoFlags / Math.max(1, ride)), fromFlightPct: r3(ok ? 100 * flight / ok : NaN),
      jitterSubject: fs ? r3(fs.subjectRms) : null, jitterBackground: fs ? r3(fs.backgroundRms) : null,
      keMax: r3(ke), keMaxAirborne: r3(keAir), headClearMoving: r3(Number.isFinite(hcAir) ? hcAir : NaN), headClearMovingT: r3(hcAirT), headClearMovingPhase: hcAirPh,
      headClearInclPerch: r3(Number.isFinite(hcInclPerch) ? hcInclPerch : NaN), headClearInclPerchT: r3(hcPerchT),
      rangeMax: r3(rangeMax), setup: r3(own.setup), setupParts: { launchStand: r3(own.launchStand), wait: r3(own.wait), move: r3(own.move), stow: noFly ? 0 : PR.STOW_S }, ops: own.ops, nextRun: !!own.nextRun, stranded,
      pMean: r3(pMean), endurance: r3(CO.enduranceMin(whEff, pMean, { heated: true })), liftoffs: evCount('liftoff'), perches: evCount('perch'), landNow: evCount('landnow'), giveUp: evCount('giveup'),
    },
    dev: S ? { avail: r3(S.avail), pxMed: r3(S.pxMed), azRange: r3(S.azRange), bodyF: r3(S.bodyF), addedMass: r3(S.addedMass), keMax: r3(S.keMax), headClear: r3(S.headClear), setup: r3(S.pr.setup), ops: S.pr.ops, sepMaxFly: r3(S.sepMaxFly), pointRms: r3(S.pointRms) } : null,
    repro,
  };
}

const cases = BYPASS ? FR.FULLRUN_CASES.filter((c) => (devRows.find((x) => x.id === c.id) || {}).noFly) : FR.FULLRUN_CASES.slice(i0, i1);
const rows = [];
for (const c of cases) { const r = runCase(c, { bypass: BYPASS }); rows.push(r); console.log(c.id, r.ms, 'ms', JSON.stringify(r.own).slice(0, 300)); }
writeFileSync(join(here, BYPASS ? 'out_bypass.json' : `out_part_${i0}_${i1}.json`), JSON.stringify({ generated: new Date().toISOString(), simCopy: ROOT, modelVersion: concept.modelVersion, rows }, null, 1));
