// Audit4 (round 4) independent re-check of leapfrog@4.0.0. Runs against a COPY of sim/ (never the live repo):
//   node recheck.mjs SIMCOPY_ROOT SET [i0 i1] [--over '{"param":v}'] [--tag name] [--bypass]
//   SET: r4 (FULLRUN_CASES_R4, 48) | seeds (same 16 wind cells, seeds 14/15/16) | offgrid (tail 5/5.5/6/6.5, head/crossL/crossR 7.5 × seeds 11–13)
//        | tailseeds (tail 4.5/5/5.5/6 × seeds 17–22: more wind-estimate bias draws in the gate band)
// For every case: dev fullrunInput() + buildResult() (the same entry the developer's run_all uses), then the auditor's OWN
// metrics from R.frame(t) and the raw core columns:
//   avail     own usable test over simulateRun(seed).col.riding shifted by tGo (availMask rule; no-fly = 0): productCam present,
//             rider not fallen, env.footage(productCam as 1920×1080 crop).inFrame, bodyPx × native-row cap ≥300, airframe
//             occlusion / touchdown spray / buried flags honoured. Variant with the dev's extra horizon-tilt rule reported separately.
//   pxMed     median bodyPx (native-capped) over riding samples with the subject in frame.
//   jitter    common/criteria.js footageStability(R).subjectRms (flown cases) — on the LIVE-tracker crop that R.frame outputs.
//   keMax     ground frame when the glider centre is >1.5 m from every rider body point, rider frame within; all non-carried phases.
//   headClear helmetAt(sk, t − tGo) (common/fullrun.js) to the glider centre minus the ACTUAL half-span (0.275 + 0.225·morph m;
//             prop disc on a pylon inside it) for LAUNCH/LEAD/LAND/TAKEOFF/SLIDE; separately incl. PERCH while the rider moves.
//   sepMax    max 3-D distance glider ↔ rider pelvis while airborne (EU C0 follow-me 50 m).
//   setup/ops recount from the phase log + simulateRun stops + the dev's simulated handling times (set-down/stow) — reported
//             next to the dev's perRun().
//   endurance shared enduranceMin(cell + bank×eff, mean pTot over non-carried samples, heated).
// Numerical-uncalibrated simulation; not a physical test.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ROOT = argv[0];
if (!ROOT || ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('pass a COPY root (not the live repo)');
const SET = argv[1] || 'r4';
const flag = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const OVER = flag('--over') ? JSON.parse(flag('--over')) : {};
const TAG = flag('--tag') || '';
const BYPASS = argv.includes('--bypass');
const pos = argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const i0 = +(pos[0] ?? 0), i1 = +(pos[1] ?? 999);
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
const P = { ...M.PDEF, ...D, ...OVER };
const { PHASE } = M;
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v === Infinity ? null : v);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dt = 0.02;

function cases() {
  if (SET === 'r4') return FR.FULLRUN_CASES_R4;
  const mk = (U, dir, seed) => {
    const e = { head: [-1, 0, 0], tail: [1, 0, 0], crossL: [0, 1, 0], crossR: [0, -1, 0], calm: [0, 0, 0] }[dir];
    return { id: dir === 'calm' ? `calm_s${seed}` : `${dir}${U}_s${seed}`, U, dir, mean: [e[0] * U, e[1] * U, 0], seed, intensity: U >= 6 ? 0.2 : 0.15 };
  };
  const out = [];
  if (SET === 'seeds') {
    for (const seed of [14, 15, 16]) {
      out.push(mk(0, 'calm', seed));
      for (const U of [3, 6, 9]) for (const d of ['head', 'tail', 'crossL', 'crossR']) out.push(mk(U, d, seed));
      for (const U of [3.5, 4.5, 5.5]) out.push(mk(U, 'tail', seed));
    }
  } else if (SET === 'offgrid') {
    for (const seed of [11, 12, 13]) {
      for (const U of [5, 5.5, 6, 6.5]) out.push(mk(U, 'tail', seed));
      for (const d of ['head', 'crossL', 'crossR']) out.push(mk(7.5, d, seed));
    }
  } else if (SET === 'tailseeds') {
    for (const seed of [17, 18, 19, 20, 21, 22]) for (const U of [4.5, 5, 5.5, 6]) out.push(mk(U, 'tail', seed));
  } else throw new Error('SET');
  return out;
}

function runCase(c) {
  const t0 = performance.now();
  const prep = { ...LF.fullrunInput(c, { params: OVER }), fullrun: true, caseObj: c };
  if (BYPASS) prep.input.plan.noFlyGate = false;
  const R = LF.buildResult({ ...D, ...OVER }, { id: `a4_${c.id}` }, prep);
  const core = R.core, O = core.O, n = core.n, tGo = prep.input.tGo, sk = prep.sk;
  const run = FR.simulateRun({ seed: c.seed });
  const mask = FR.availMask(run);
  const ridingAt = (i) => { const ts = i * dt - tGo; if (ts < 0) return 0; return mask[Math.min(run.n - 1, Math.round(ts / run.sampleDt))]; };
  const A = R.analysis;
  let ride = 0, ok = 0, okTilt = 0, okNoFlags = 0, flight = 0; const pxs = [];
  let ke = 0, hc = Infinity, hcT = null, hcPh = null, hcPerch = Infinity, sepMax = 0, sepMaxT = null, hcCentre = Infinity;
  const airborne = (ph) => ph === PHASE.LAUNCH || ph === PHASE.LEAD || ph === PHASE.LAND;
  const moving = (ph) => airborne(ph) || ph === PHASE.TAKEOFF || ph === PHASE.SLIDE;
  let pSum = 0, pN = 0, morphMax = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const f = R.frame(t);
    const s = f.skier, ph = O.phase[i];
    const g = [O.x[i], O.y[i], O.z[i]];
    if (ridingAt(i) === 1) {
      ride++;
      const pc = f.productCam;
      if (pc && !s.fallen) {
        const fp = EN.footage({ kind: 'rect', pos: pc.pos, fwd: pc.fwd, up: [0, 0, 1], vfovDeg: pc.vfovDeg, w: 1920, h: 1080 }, s);
        const nativeRows = (pc.vfovDeg * Math.PI / 180) * core.nativePxRad;
        const px = (fp.bodyPx || 0) * Math.min(1, nativeRows / 1080);
        if (fp.inFrame) pxs.push(px);
        const flags = O.occl[i] || O.spray[i] || O.sink[i] > 0.05;
        if (fp.inFrame && px >= 300) { okNoFlags++; if (!flags) { ok++; if (airborne(ph)) flight++; if (A.tilt[i] <= P.tiltMaxDeg) okTilt++; } }
      }
    }
    if (ph === PHASE.STOWED || ph === PHASE.PICKUP) continue;
    const bp = SK.bodyPoints(s);
    const dBody = Math.min(...[bp.feet, bp.pelvis, bp.chest, bp.head].map((q) => Math.hypot(...sub(g, q))));
    const v = [O.vx[i], O.vy[i], O.vz[i]];
    const k = dBody > 1.5 ? 0.5 * P.mass * dot(v, v) : 0.5 * P.mass * dot(sub(v, s.vel), sub(v, s.vel));
    ke = Math.max(ke, k);
    const ts = t - tGo;
    const hd = FR.helmetAt(sk, Math.max(0, ts));
    const dc = Math.hypot(...sub(g, hd));
    const half = 0.275 + 0.225 * (O.morph[i] || 0);
    morphMax = Math.max(morphMax, O.morph[i] || 0);
    if (moving(ph)) { if (dc - half < hc) { hc = dc - half; hcT = t; hcPh = M.PHASE_NAME[ph]; } hcCentre = Math.min(hcCentre, dc); }
    if ((ph === PHASE.PERCH || ph === PHASE.STRANDED) && s.speed > 0.5) hcPerch = Math.min(hcPerch, dc - half);
    if (airborne(ph)) { const sp = Math.hypot(...sub(g, bp.pelvis)); if (sp > sepMax) { sepMax = sp; sepMaxT = t; } }
    if (Number.isFinite(O.pTot[i])) { pSum += O.pTot[i]; pN++; }
  }
  const noFly = !!core.noFly;
  const fs = noFly ? null : CR.footageStability(R);
  // setup / ops recount (auditor): final stop of THIS rider shifted by tGo; when is the glider down for good; where is it
  const onSnow = (ph) => ph === PHASE.PERCH || ph === PHASE.PICKUP || ph === PHASE.STRANDED;
  const lastStop = run.stops[run.stops.length - 1];
  let tDown = 0; for (let i = n - 1; i >= 0; i--) if (!onSnow(O.phase[i])) { tDown = (i + 1) * dt; break; }
  const landedAtEnd = onSnow(O.phase[n - 1]);
  const sEnd = core.rider((n - 1) * dt);
  const gEnd = [O.x[n - 1], O.y[n - 1]];
  const along = (gEnd[0] - sEnd.pos[0]) / Math.cos(Math.atan(core.tanS)), lat = gEnd[1] - sEnd.pos[1];
  const retrieveDist = Math.hypot(along, lat);
  const PR = LF.PER_RUN, H = prep.handling;
  const stranded = core.events.some((e) => ['stranded', 'perchfail', 'slideaway'].includes(e.type));
  const mt = (d, vv = 4, a = 1.5, b = 2) => { if (d <= 0) return 0; const dA = vv * vv / (2 * a) + vv * vv / (2 * b); return d >= dA ? vv / a + vv / b + (d - dA) / vv : Math.sqrt(2 * d * a * b / (a + b)) * (1 / a + 1 / b); };
  const own = noFly ? { setup: tGo, ops: 1, wait: 0, move: 0 } : (() => {
    const wait = landedAtEnd ? Math.max(0, tDown - (lastStop.t0 + tGo)) : 15;
    const nextRun = retrieveDist > P.sepHard && along < 0;
    const move = nextRun ? 10 : along >= -1 ? mt(Math.max(0, retrieveDist - 1.2)) : Math.max(0, -along - 1) / PR.SIDESTEP_V + Math.abs(lat) / PR.TRAVERSE_V;
    return { setup: tGo + wait + move + H.stow, ops: 2 + (stranded || nextRun ? 1 : 0), wait, move, nextRun };
  })();
  const whEff = P.battWh + P.bankWh * P.bankEff;
  const pMean = noFly ? P.pStandby : pSum / Math.max(1, pN);
  const S = R.summary;
  const evc = (ty) => core.events.filter((e) => e.type === ty).length;
  const med = (a) => { if (!a.length) return NaN; const q = [...a].sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
  return {
    id: c.id, U: c.U, dir: c.dir, seed: c.seed, noFly, gateWhy: core.gate && core.gate.refused ? core.gate.why : null, gateW: core.gate ? core.gate.w : null, gateHist: core.gate ? core.gate.hist : null,
    tGo: r3(tGo), ms: Math.round(performance.now() - t0),
    own: {
      avail: r3(100 * ok / Math.max(1, ride)), availWithTilt: r3(100 * okTilt / Math.max(1, ride)), availNoLossFlags: r3(100 * okNoFlags / Math.max(1, ride)), fromFlightPct: r3(ok ? 100 * flight / ok : NaN),
      pxMed: r3(med(pxs)), jitterSubject: fs ? r3(fs.subjectRms) : null, jitterBackground: fs ? r3(fs.backgroundRms) : null,
      keMax: r3(ke), headClear: r3(hc), headClearT: r3(hcT), headClearPhase: hcPh, headClearCentre: r3(hcCentre), headClearPerchRiderMoving: r3(hcPerch), morphMax: r3(morphMax),
      sepMax: r3(sepMax), sepMaxT: r3(sepMaxT), setup: r3(own.setup), setupParts: { tGo: r3(tGo), wait: r3(own.wait), move: r3(own.move), stow: noFly ? 0 : H.stow, setDown: H.setDown }, ops: own.ops, nextRun: !!own.nextRun, stranded,
      pMean: r3(pMean), endurance: r3(CO.enduranceMin(whEff, pMean, { heated: true })), liftoffs: evc('liftoff'), landNow: evc('landnow'), giveUp: evc('giveup'), fallBehind: evc('fallbehind'),
    },
    dev: { avail: r3(S.avail), pxMed: r3(S.pxMed), jitterOwn: r3(S.jitter), keMax: r3(S.keMax), headClear: r3(S.headClear), setup: r3(S.pr.setup), ops: S.pr.ops, sepMaxFly: r3(S.sepMaxFly), pMean: r3(S.pMean), visLock: r3(S.visLock), pointRms: r3(S.pointRms), azRange: r3(S.azRange), bodyF: r3(S.bodyF) },
  };
}

const cs = cases().slice(i0, i1);
const rows = [];
for (const c of cs) { const r = runCase(c); rows.push(r); console.log(c.id, r.ms, 'ms', JSON.stringify(r.own).slice(0, 220)); }
const name = `out_${SET}${TAG ? '_' + TAG : ''}${BYPASS ? '_bypass' : ''}_${i0}_${Math.min(i1, i0 + cs.length)}.json`;
writeFileSync(join(here, name), JSON.stringify({ generated: new Date().toISOString(), simCopy: ROOT, set: SET, over: OVER, bypass: BYPASS, modelVersion: concept.modelVersion, rows }, null, 1));
console.log('wrote', name);
