// Audit4 (round 4) independent re-check of towglider@0.5.0. Runs against a COPY of sim/ (never the live repo):
//   node recheck.mjs --root SIMCOPY [--shard k/N] [--cases id,..] [--tailU 3,3.25,..] [--seeds 11,12,13] [--dir tail|crossL|..]
//                    [--servoFs 4] [--noise 0.03] [--preHist] [--fsOnly] --out FILE
// Per case: R = concept.simulate(P, fullrunScenario(c)); auditor's OWN metrics from R.frame(t) / raw core columns:
//   avail   : shared availMask (simulateRun(RUN_PLAN, seed).col.riding shifted by tGo 1.5 s) as denominator; a sample is usable when
//             productCam exists, all 6 env.subjectPoints project inside the 16:9 output, own bodyPx (feet/head/shL/shR rows) ≥300,
//             rider not fallen, and no artefact: own projection of the leash polyline (Ø0.6 mm, dense near the glider) and of the
//             0.35 m Ø3 mm wand (holster mouth → eyelet) — a part counts when any projected point with width ≥2 px (1080p output)
//             lies inside the subject's projected bounding box (6 points) [shared artefactCounts]. Never-launched runs = 0.
//   pxMed   : median own bodyPx over in-frame filming riding samples.
//   jitter  : common/criteria.js footageStability(R).subjectRms (flown cases).
//   keMax   : ground-frame KE beyond 1.5 m of head/torso/pack capsules, rider frame within; not-attached samples.
//   headClear: helmetAt(simulateRun, t−tGo) (common/fullrun.js) and bodyPoints(frame skier).head; to the glider as segments
//             (tip–tip, nose–tail), every leash / free-line segment; capture window (snowpull, L<1 m) excluded (length reported);
//             wand (worn rigid member) to helmet reported separately.
//   setup/ops: dev R.summary (accounting from events) + own recount (arm 1 s + rider-still→seated).
//   endurance: dev formula reproduced from R.acc (E incl. 8 min lift in 0.05 W sleep) plus variants (sleep 0.15/0.3/0.5 W, idle 0.6 W).
// Numerical-uncalibrated simulation; not physical verification.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = arg('--root', '/tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/copy');
if (ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('refusing to run against the live repo; pass a copy');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const TG = await imp('sim/js/concepts/towglider/index.js');
const AT = await imp('sim/js/concepts/towglider/attitude.js');
const DS = await imp('sim/js/concepts/towglider/design.js');
const MD = await imp('sim/js/concepts/towglider/model.js');
const CR = await imp('sim/js/concepts/common/criteria.js');
const FR = await imp('sim/js/concepts/common/fullrun.js');
const SK = await imp('sim/js/concepts/common/skier.js');
const ENV = await imp('sim/js/concepts/common/env.js');
const CO = await imp('sim/js/concepts/common/components.js');
const concept = TG.default;
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
if (arg('--servoFs')) AT.SERVO.fs = +arg('--servoFs');           // runtime sensitivity (module object), files untouched
if (arg('--noise')) AT.REFRAME.noiseFrac = +arg('--noise');
const FS_ONLY = process.argv.includes('--fsOnly');
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v ?? null);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ptSeg(p, a, b) { const ab = sub(b, a), L2 = dot(ab, ab); const u = L2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0; return len(sub(p, add(a, mul(ab, u)))); }
const polyDist = (p, pts) => { let d = Infinity; if (!pts) return d; for (let j = 0; j + 1 < pts.length; j++) d = Math.min(d, ptSeg(p, pts[j], pts[j + 1])); return d; };
const ATTACHED = ['stowed', 'docked', 'seat'];
const RUN_PLAN = [{ ride: 38, preset: 'recreationalCarve' }, { hold: 20 }, { ride: 33, preset: 'recreationalCarve' }, { hold: 30 }];
const TGO = 1.5;
const D_LINE = P.dLine / 1000, D_WAND = 0.003;

function mkProj(cam) {
  const f = nrm(cam.fwd), r = nrm(cross(f, [0, 0, 1])), u = cross(r, f);
  const tv = Math.tan((cam.vfovDeg * Math.PI) / 360), th = tv * 16 / 9, fpx = 540 / tv;
  return (q) => { const d = sub(q, cam.pos), z = dot(d, f); if (z <= 0.02) return null; return [(dot(d, r) / z / th) * 960, (dot(d, u) / z / tv) * 540, z, fpx]; };
}
// max apparent width (px) of a polyline's points (densified) lying inside the subject box (box mode) or over a body capsule
// (sil mode: caps = projected [x0,y0,x1,y1,r0,r1]) — returns [wBox, wSil]
function artW(pr, pts, dia, box, caps) {
  let w = 0, ws = 0;
  for (let j = 0; j + 1 < pts.length; j++) {
    const a = pts[j], b = pts[j + 1], L = len(sub(b, a)), k = Math.max(1, Math.ceil(L / 0.05));
    for (let m = 0; m <= k; m++) {
      const q = add(a, mul(sub(b, a), m / k)), P = pr(q); if (!P) continue;
      if (Math.abs(P[0]) > 960 || Math.abs(P[1]) > 540) continue;
      const wp = (dia * P[3]) / P[2];
      if (P[0] >= box[0] && P[0] <= box[1] && P[1] >= box[2] && P[1] <= box[3]) w = Math.max(w, wp);
      for (const c of caps) { const qx = c[2] - c[0], qy = c[3] - c[1], l2 = qx * qx + qy * qy; const tt = l2 > 1e-9 ? Math.max(0, Math.min(1, ((P[0] - c[0]) * qx + (P[1] - c[1]) * qy) / l2)) : 0; const hx = c[0] + qx * tt - P[0], hy = c[1] + qy * tt - P[1], rr = c[4] + (c[5] - c[4]) * tt; if (hx * hx + hy * hy < rr * rr) { ws = Math.max(ws, wp); break; } }
    }
  }
  return [w, ws];
}

function evalCase(c) {
  const sc = TG.fullrunScenario(c);
  const R = concept.simulate(P, sc);
  const gated = !!R.summary.gated;
  const fs = gated ? { subjectRms: NaN, backgroundRms: NaN } : CR.footageStability(R);
  const base = { id: c.id, U: c.U, dir: c.dir, seed: c.seed, gated, fsSubject: r3(fs.subjectRms), fsBackground: r3(fs.backgroundRms), mountErrDeg: r3(R.an.mountErrRmsDeg) };
  const S = R.summary;
  const dev = { avail: r3(S.avail), pxMed: r3(S.pxMed), setupTime: r3(S.setupTime), ops: S.ops, bodyForcePeak: r3(S.bodyForcePeak), keMax: r3(S.keMax), headClear: r3(S.headClear), endurance: r3(S.endurance), azRange: r3(S.azRange) };
  if (FS_ONLY) return { ...base, dev };
  const core = R.core, O = core.O, n = core.n, dt = core.SDT, p = core.p;
  const run = FR.simulateRun({ plan: RUN_PLAN, seed: c.seed });
  const mask = FR.availMask(run);
  const ridingAt = (i) => { const j = Math.round((i * dt - TGO) / run.sampleDt); return j >= 0 && j < run.n ? mask[j] === 1 : false; };
  let ride = 0, ok = 0, okNoArt = 0, artLeash = 0, artWand = 0, okBody = 0, okSil = 0, artLeashSil = 0, artWandSil = 0, wandWmax = 0, leashWmax = 0; const pxs = [], wandWs = [];
  let keRule = 0, keArg = null;
  let capRuns = [], inCap = false, capStart = 0;
  let hcH = Infinity, hcB = Infinity, hcWhere = null, capS = 0, wandMin = Infinity, helmDiff = 0, hcInclCap = Infinity;
  const launched = R.events.some((e) => e.type === 'drop' || e.type === 'liftoff');
  for (let i = 0; i < n; i++) {
    const t = i * dt, f = R.frame(t), s = f.skier, d = f.device;
    const b = SK.bodyPoints(s);
    const attached = ATTACHED.includes(d.mode);
    // wand (worn rigid member): holster mouth ('tail' point) → eyelet ('wand' point)
    const wA = MD.funnelPoint(s, b, 'tail'), wB = MD.funnelPoint(s, b, 'wand');
    const helm = t >= TGO ? FR.helmetAt(run, t - TGO) : b.head;
    helmDiff = Math.max(helmDiff, len(sub(helm, b.head)));
    wandMin = Math.min(wandMin, ptSeg(helm, wA, wB));
    if (ridingAt(i)) {
      ride++;
      const pc = f.productCam;
      if (launched && pc && !s.fallen) {
        const pr = mkProj(pc), SP = ENV.subjectPoints(s);
        const all = [SP.feet, SP.head, SP.shL, SP.shR, SP.skiTip, SP.skiTail].map(pr);
        const inF = all.every((q) => q && Math.abs(q[0]) <= 960 && Math.abs(q[1]) <= 540);
        if (inF) {
          const yb = all.slice(0, 4).map((q) => q[1]); const px = Math.max(...yb) - Math.min(...yb); pxs.push(px);
          if (px >= 300) {
            okNoArt++;
            const box = [Math.min(...all.map((q) => q[0])), Math.max(...all.map((q) => q[0])), Math.min(...all.map((q) => q[1])), Math.max(...all.map((q) => q[1]))];
            const ab = all.slice(0, 4), boxB = [Math.min(...ab.map((q) => q[0])), Math.max(...ab.map((q) => q[0])), Math.min(...ab.map((q) => q[1])), Math.max(...ab.map((q) => q[1]))];
            const caps = [];
            for (const [a, bb, rad, name] of MD.bodyCapsules(s, b)) { if (name === 'ski' || name === 'pole') continue; const A = pr(a), B = pr(bb); if (!A || !B) continue; caps.push([A[0], A[1], B[0], B[1], rad * A[3] / A[2], rad * B[3] / B[2]]); }
            const [wl, wlS] = d.leash ? artW(pr, d.leash, D_LINE, box, caps) : [0, 0];
            const [ww, wwS] = artW(pr, [wA, wB], D_WAND, box, caps);
            const [wlB] = d.leash ? artW(pr, d.leash, D_LINE, boxB, []) : [0], [wwB] = artW(pr, [wA, wB], D_WAND, boxB, []);
            wandWmax = Math.max(wandWmax, ww); leashWmax = Math.max(leashWmax, wl); if (ww > 0) wandWs.push(ww);
            const aL = FR.artefactCounts(wl > 0, wl), aW = FR.artefactCounts(ww > 0, ww);
            if (aL) artLeash++; if (aW) artWand++;
            if (!aL && !aW) ok++;
            if (!FR.artefactCounts(wlB > 0, wlB) && !FR.artefactCounts(wwB > 0, wwB)) okBody++;
            const sL = FR.artefactCounts(wlS > 0, wlS), sW = FR.artefactCounts(wwS > 0, wwS);
            if (sL) artLeashSil++; if (sW) artWandSil++;
            if (!sL && !sW) okSil++;
          }
        }
      }
    }
    if (!attached) {
      const gv = [O.gvx[i], O.gvy[i], O.gvz[i]], gp = d.glider;
      const dBody = Math.min(len(sub(gp, b.head)) - 0.14, ptSeg(gp, b.pelvis, b.chest) - 0.18, ptSeg(gp, b.packMid, b.packTop) - 0.12);
      const keS = 0.5 * p.mass * dot(gv, gv), rv = sub(gv, s.vel), keR = 0.5 * p.mass * dot(rv, rv);
      const ke = dBody > 1.5 ? keS : keR;
      if (ke > keRule) { keRule = ke; keArg = { t: r3(t), mode: d.mode, dBody: r3(dBody), vg: r3(len(gv)) }; }
      const capWin = d.mode === 'snowpull' && d.L < 1.0;
      if (capWin) capS += dt;
      if (capWin && !inCap) { inCap = true; capStart = t; } if (!capWin && inCap) { inCap = false; capRuns.push(r3(t - capStart)); }
      const fx = nrm(d.fwd), up = nrm(d.up), by = nrm(cross(up, fx));
      const half = d.fold < 0.5 ? d.span / 2 : 0.05;
      const segs = [[add(gp, mul(by, half)), add(gp, mul(by, -half))], [add(gp, mul(fx, 0.17)), add(gp, mul(fx, -0.24))]];
      const dist = (h) => Math.min(...segs.map(([a, bb]) => ptSeg(h, a, bb)), polyDist(h, d.leash), polyDist(h, d.freeLine));
      const dH = dist(helm), dB = dist(b.head);
      hcInclCap = Math.min(hcInclCap, dH);
      if (!capWin) { if (dH < hcH) hcWhere = { t: r3(t), mode: d.mode, L: r3(d.L), riderSpeed: r3(s.speed), dHelmetAt: r3(dH), dBodyHead: r3(dB) }; hcH = Math.min(hcH, dH); hcB = Math.min(hcB, dB); }
    }
  }
  // endurance variants (dev formula: usable Wh × 3600 / E_run × filmS)
  const usableWh = DS.HIP.packWh * CO.BATTERY.coldFactor * (1 - CO.BATTERY.reserve);
  const E = R.acc.E, filmS = R.acc.filmS, liftS = DS.HIP.liftS, Eb = E - liftS * DS.HIP.sleepW;
  const end = (Ex) => (filmS > 1 ? ((usableWh * 3600) / Ex) * filmS / 60 : NaN);
  return {
    ...base, launched, releases: R.events.filter((e) => e.type === 'release').length, cut: R.events.some((e) => e.type === 'cut'),
    avail: r3(launched ? 100 * ok / Math.max(1, ride) : 0), availNoArtefact: r3(launched ? 100 * okNoArt / Math.max(1, ride) : 0),
    availBodyBox: r3(launched ? 100 * okBody / Math.max(1, ride) : 0), availSilhouette: r3(launched ? 100 * okSil / Math.max(1, ride) : 0),
    artLeashSilPct: r3(100 * artLeashSil / Math.max(1, ride)), artWandSilPct: r3(100 * artWandSil / Math.max(1, ride)), wandWmaxPx: r3(wandWmax), wandWp50Px: r3(FR.pct(wandWs, 0.5)), leashWmaxPx: r3(leashWmax),
    artLeashPct: r3(100 * artLeash / Math.max(1, ride)), artWandPct: r3(100 * artWand / Math.max(1, ride)), pxMed: r3(FR.pct(pxs, 0.5)),
    keMax: r3(keRule), keArg, headClear: r3(hcH), headClearBodyHead: r3(hcB), headClearInclCapture: r3(hcInclCap), headClearWhere: hcWhere, captureWindowS: r3(capS), captureRuns: capRuns,
    wandToHelmetMin: r3(wandMin), helmetAtVsFrameHeadMaxDiff: r3(helmDiff),
    E_J: r3(E), filmS: r3(filmS), E_runOnly_J: r3(Eb),
    endurance: r3(end(E)), endSleep015: r3(end(Eb + liftS * 0.15)), endSleep03: r3(end(Eb + liftS * 0.3)), endSleep05: r3(end(Eb + liftS * 0.5)), endIdle06: r3(end(Eb + liftS * 0.6)),
    dev,
  };
}

let cases = FR.FULLRUN_CASES_R4;
if (arg('--cases')) { const ids = arg('--cases').split(','); cases = cases.filter((c) => ids.includes(c.id)); }
if (arg('--tailU')) {
  const seeds = (arg('--seeds', '11,12,13')).split(',').map(Number), dir = arg('--dir', 'tail');
  const E = { head: [-1, 0, 0], tail: [1, 0, 0], crossL: [0, 1, 0], crossR: [0, -1, 0] }[dir];
  cases = []; for (const U of arg('--tailU').split(',').map(Number)) for (const seed of seeds) cases.push({ id: `${dir}${U}_s${seed}`, U, dir, mean: [E[0] * U, E[1] * U, 0], seed, intensity: U >= 6 ? 0.2 : 0.15 });
}
if (arg('--shard')) { const [k, N] = arg('--shard').split('/').map(Number); cases = cases.filter((_, i) => i % N === k); }
const rows = [];
for (const c of cases) { const t0 = Date.now(); const r = evalCase(c); rows.push(r); console.log(c.id, Date.now() - t0, 'ms', JSON.stringify({ a: r.avail, da: r.dev.avail, fs: r.fsSubject, ke: r.keMax, hc: r.headClear, dhc: r.dev.headClear })); }
writeFileSync(arg('--out', 'out.json'), JSON.stringify({ generated: new Date().toISOString(), simCopy: ROOT, modelVersion: concept.modelVersion, servoFs: AT.SERVO.fs, noiseFrac: AT.REFRAME.noiseFrac, rows }, null, 1));
