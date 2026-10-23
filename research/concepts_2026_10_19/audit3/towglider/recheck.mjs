// Audit3 (round 3) independent re-check of towglider@0.4.0. Runs against a COPY of sim/ (never the live repo):
//   node recheck.mjs [--root SIMCOPY] [--shard k/N] [--cases id,id] [--tailU 4,4.5,5,5.5] [--eis 0.15] [--db 0.5] [--fsOnly] [--dev] --out FILE
// SIMCOPY = folder containing sim/ and research/concepts_2026_10_19/dev (default: env TGCOPY or the auditor scratchpad copy).
// Per FULLRUN case: builds the Result with the concept's simulate(P, fullrunScenario(c)) and recomputes, with the
// auditor's own code, from R.frame(t) / raw core columns:
//   avail   : shared availMask (simulateRun col.riding of the same plan, shifted by tGo) as denominator; ok = filming
//             productCam AND subject fully in the 16:9 output AND own projected head–feet height ≥300 px AND the dev's
//             line-artefact column <3 px (artefact not re-derived); never-launched runs count 0
//   jitter  : common/criteria.js footageStability(R).subjectRms (flown cases)
//   keMax   : ground-frame KE beyond 1.5 m from the rider's body capsules (head/torso/pack per model), rider frame within;
//             plus an upper bound (ground-frame everywhere off the holster)
//   headClear: helmet centre (a) skier.pos + 1.75·0.92 up, (b) bodyPoints head; to the glider as SEGMENTS (wing tip–tip,
//             nose–tail) and every leash/free-line polyline segment from the frame; min incl./excl. the declared capture
//             window (snowpull with <1 m line), plus the window length and the minimising moment
//   ops/setup from events; bodyForce = 50 ms mean of hip tension (+ funnel capture impact as dev); line height 1/2 m behind
//   (riding, line out); endurance as dev + variant charging hip idle power over the lift time.
// Numerical-uncalibrated simulation; not physical verification.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = arg('--root', process.env.TGCOPY || '/tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/copy3');
if (ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('refusing to run against the live repo; pass a copy');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const TG = await imp('sim/js/concepts/towglider/index.js');
const AT = await imp('sim/js/concepts/towglider/attitude.js');
const DS = await imp('sim/js/concepts/towglider/design.js');
const CR = await imp('sim/js/concepts/common/criteria.js');
const FR = await imp('sim/js/concepts/common/fullrun.js');
const SK = await imp('sim/js/concepts/common/skier.js');
const ENV = await imp('sim/js/concepts/common/env.js');
const CO = await imp('sim/js/concepts/common/components.js');
const concept = TG.default;
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
if (arg('--eis')) AT.STAB.eis.ratio = +arg('--eis');       // runtime sensitivity only (module object), files untouched
if (arg('--db')) AT.MOUNT.dbDeg = +arg('--db');
const FS_ONLY = process.argv.includes('--fsOnly');
const DEV = process.argv.includes('--dev');
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v ?? null);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ptSeg(p, a, b) { const ab = sub(b, a), L2 = dot(ab, ab); const u = L2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0; return len(sub(p, add(a, mul(ab, u)))); }
const polyDist = (p, pts) => { let d = Infinity; if (!pts) return d; for (let j = 0; j + 1 < pts.length; j++) d = Math.min(d, ptSeg(p, pts[j], pts[j + 1])); return d; };
const MODES = ['stowed', 'docked', 'seat']; // attached modes (strings from frame.device.mode)

const RUN_PLAN = [{ ride: 38, preset: 'recreationalCarve' }, { hold: 20 }, { ride: 33, preset: 'recreationalCarve' }, { hold: 30 }];
const TGO = 1.5;

function project(cam, q) { // → [x,y] in 1920×1080 output units, or null
  const f = nrm(cam.fwd), r = nrm(cross(f, [0, 0, 1])), u = cross(r, f);
  const tv = Math.tan((cam.vfovDeg * Math.PI) / 360), th = tv * 16 / 9;
  const d = sub(q, cam.pos), z = dot(d, f); if (z <= 0.05) return null;
  return [(dot(d, r) / z / th) * 960, (dot(d, u) / z / tv) * 540];
}

function evalCase(c) {
  const sc = TG.fullrunScenario(c);
  const R = concept.simulate(P, sc);
  const fs = R.summary.gated ? { subjectRms: NaN, backgroundRms: NaN, samples: 0 } : CR.footageStability(R);
  const base = { id: c.id, U: c.U, dir: c.dir, seed: c.seed, gated: R.summary.gated, fsSubject: r3(fs.subjectRms), fsBackground: r3(fs.backgroundRms) };
  if (FS_ONLY) return base;
  const dev = DEV ? { avail: R.summary.avail, pxMed: R.summary.pxMed, setupTime: R.summary.setupTime, ops: R.summary.ops, bodyForcePeak: R.summary.bodyForcePeak, keMax: R.summary.keMax, headClear: R.summary.headClear, endurance: R.summary.endurance, azRange: R.summary.azRange, lineH1min: R.summary.lineH1min, lineH1p10: R.summary.lineH1p10, lineH2min: R.summary.lineH2min, lineH2p10: R.summary.lineH2p10 } : null;
  const core = R.core, O = core.O, n = core.n, dt = core.SDT, p = core.p, A = R.an.cols;
  const run = FR.simulateRun({ plan: RUN_PLAN, seed: c.seed });
  const ridingAt = (i) => { const j = Math.round((i * dt - TGO) / run.sampleDt); return j >= 0 && j < run.n ? FR.availMask(run)[j] === 1 : false; };
  let ride = 0, ok = 0, okHF = 0, okDev = 0, pxAgree = 0, pxN = 0; const pxs = [], pxsHF = [];
  let keRule = 0, keUpper = 0, keArg = null;
  let hcA = Infinity, hcB = Infinity, hcAx = Infinity, hcBx = Infinity, hcWhere = null, capS = 0, capRuns = [], inCap = false, capStart = 0;
  const h1 = [], h2 = [];
  let F50 = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt, f = R.frame(t), s = f.skier, d = f.device;
    const riding = ridingAt(i);
    // ---- footage (own projection)
    if (riding) {
      ride++;
      const pc = f.productCam;
      if (pc) {
        // shared silhouette (env.js subjectPoints: feet, head, shoulders, ski tip/tail) projected with the auditor's own code
        const SP = ENV.subjectPoints(s);
        const pr = [SP.feet, SP.head, SP.shL, SP.shR, SP.skiTip, SP.skiTail].map((q) => project(pc, q));
        const inF = pr.every((q) => q && Math.abs(q[0]) <= 960 && Math.abs(q[1]) <= 540);
        const ys = inF ? pr.map((q) => q[1]) : [0];
        const px = inF ? Math.max(...ys) - Math.min(...ys) : 0;
        const pxHF = inF ? Math.abs(pr[1][1] - pr[0][1]) : 0; // strict feet→head (criteria wording)
        if (inF) { pxs.push(px); pxsHF.push(pxHF); }
        if (inF && px >= 300 && !(A.art[i] >= 3)) ok++;
        if (inF && pxHF >= 300 && !(A.art[i] >= 3)) okHF++;
        pxN++; if ((inF && px >= 300) === (A.subjectPx[i] >= 300 && A.inFrame[i] === 1)) pxAgree++;
      }
      if (A.filming[i] === 1 && A.inFrame[i] === 1 && A.subjectPx[i] >= 300 && !(A.art[i] >= 3)) okDev++;
    }
    const attached = MODES.includes(d.mode);
    // ---- KE
    if (!attached) {
      const gv = [O.gvx[i], O.gvy[i], O.gvz[i]], gp = d.glider;
      const b = SK.bodyPoints(s);
      const dBody = Math.min(len(sub(gp, b.head)) - 0.14, ptSeg(gp, b.pelvis, b.chest) - 0.18, ptSeg(gp, b.packMid, b.packTop) - 0.12);
      const keS = 0.5 * p.mass * dot(gv, gv), rv = sub(gv, s.vel), keR = 0.5 * p.mass * dot(rv, rv);
      const ke = dBody > 1.5 ? keS : keR;
      if (ke > keRule) { keRule = ke; keArg = { t: r3(t), mode: d.mode, dBody: r3(dBody), vg: r3(len(gv)) }; }
      keUpper = Math.max(keUpper, keS);
    }
    // ---- head clearance
    const capWin = d.mode === 'snowpull' && d.L < 1.0;
    if (capWin && !inCap) { inCap = true; capStart = t; }
    if (!capWin && inCap) { inCap = false; capRuns.push(r3(t - capStart)); }
    if (capWin) capS += dt;
    if (!attached) {
      const hA = add(s.pos, [0, 0, 1.75 * 0.92]), hB = SK.bodyPoints(s).head;
      const segs = [];
      if (!attached) {
        const fx = nrm(d.fwd), up = nrm(d.up), by = nrm(cross(up, fx));
        const half = d.fold < 0.5 ? d.span / 2 : 0.05;
        segs.push([add(d.glider, mul(by, half)), add(d.glider, mul(by, -half))], [add(d.glider, mul(fx, 0.17)), add(d.glider, mul(fx, -0.24))]);
      }
      const dist = (h) => Math.min(...segs.map(([a, b]) => ptSeg(h, a, b)), polyDist(h, d.leash), polyDist(h, d.freeLine));
      const dA = dist(hA), dB = dist(hB);
      hcAx = Math.min(hcAx, dA); hcBx = Math.min(hcBx, dB);
      if (!capWin) { if (dB < hcB) hcWhere = { t: r3(t), mode: d.mode, L: r3(d.L), riderSpeed: r3(s.speed), dA: r3(dA), dB: r3(dB) }; hcA = Math.min(hcA, dA); hcB = Math.min(hcB, dB); }
    }
    // ---- line height 1 m / 2 m behind the feet (riding, line out ≥0.5 m)
    if (riding && i % 5 === 0 && d.leash && d.L > 0.5 && s.speed > 2) {
      const ft = s.pos, hb = [-s.heading[0], -s.heading[1]];
      for (const [D, arr] of [[1, h1], [2, h2]]) {
        // point on the leash whose horizontal distance from the feet crosses D, taking the crossing farthest behind
        let best = null;
        for (let j = 0; j + 1 < d.leash.length; j++) {
          const qa = d.leash[j], qb = d.leash[j + 1];
          const da = Math.hypot(qa[0] - ft[0], qa[1] - ft[1]), db = Math.hypot(qb[0] - ft[0], qb[1] - ft[1]);
          if ((da - D) * (db - D) <= 0 && Math.abs(db - da) > 1e-9) { const u = (D - da) / (db - da); const q = add(qa, mul(sub(qb, qa), u)); const behind = (q[0] - ft[0]) * hb[0] + (q[1] - ft[1]) * hb[1]; const hs = q[2] + q[0] * core.tanS; if (!best || behind > best.behind) best = { hs, behind }; }
        }
        if (best) arr.push(best.hs);
      }
    }
    if (i >= 2) F50 = Math.max(F50, (0.5 * O.Thip[i - 2] + O.Thip[i - 1] + 0.5 * O.Thip[i]) / 2);
  }
  if (inCap) capRuns.push(r3(n * dt - capStart));
  const capV = core.info.captureV, Fcap = Number.isFinite(capV) ? (p.mass * capV * capV) / (2 * 0.15) : 0;
  // ---- ops / setup from events
  const ev = R.events.map((e) => e.type), has = (k) => ev.includes(k), cnt = (k) => ev.filter((e) => e === k).length;
  const launched = has('drop') || has('liftoff');
  const docked = Number.isFinite(core.info.tDocked);
  const lost = launched && (cnt('release') > 0 || has('cut') || has('reelfail') || !docked);
  const ops = 1 + (lost ? 2 : 0);
  const lastStop = run.stops[run.stops.length - 1];
  const finalStill = TGO + lastStop.t0;
  // standstill: rider must stay until the glider is seated; mid-run rest: count any wait beyond the rest (relaunch delay)
  const stand = docked ? Math.max(0, core.info.tDocked - finalStill) : 0;
  const midStop = run.stops[0], restEnd = TGO + midStop.t1;
  const relaunchEv = R.events.filter((e) => e.type === 'relaunch' || e.type === 'drop').map((e) => e.t).find((x) => x > TGO + midStop.t0);
  const setup = 1 + stand + (lost ? 30 : 0);
  // ---- energy: dev accounting + lift idle (hip electronics + reel idle + stowed glider 0.05 W via chain, 8 min lift per run)
  const idleW = DS.powerChain(0.05).hipIn; // stowed: glider standby over the leash + reel idle + hip electronics
  const usableWh = DS.HIP.packWh * CO.BATTERY.coldFactor * (1 - CO.BATTERY.reserve);
  const E = R.acc.E, filmS = R.acc.filmS;
  const endur = filmS > 1 ? ((usableWh * 3600) / E) * filmS / 60 : NaN;
  const liftS = 8 * 60;
  const endurLift = filmS > 1 ? ((usableWh * 3600) / (E + idleW * liftS)) * filmS / 60 : NaN;
  const pc = (a, q) => FR.pct(a, q);
  return {
    ...base, launched, docked, lost, releases: cnt('release'), gates: cnt('gate'), margins: cnt('margin'), relaunches: cnt('relaunch'),
    avail: r3(launched ? 100 * ok / Math.max(1, ride) : 0), availDevMaskOwnCount: r3(launched ? 100 * okDev / Math.max(1, ride) : 0), pxAgreePct: r3(pxN ? 100 * pxAgree / pxN : NaN), pxMedOwn: r3(pc(pxs, 0.5)), pxMedFeetHead: r3(pc(pxsHF, 0.5)), availFeetHead: r3(launched ? 100 * okHF / Math.max(1, ride) : 0),
    keMax: r3(keRule), keArg, keUpperGround: r3(keUpper),
    headClearHelmetSimple: r3(hcA), headClearBodyHead: r3(hcB), headClearInclCapture: r3(Math.min(hcAx, hcBx)), headClearWhere: hcWhere, captureWindowS: r3(capS), captureRuns: capRuns,
    lineH1min: r3(h1.length ? Math.min(...h1) : NaN), lineH1p10: r3(pc(h1, 0.1)), lineH2min: r3(h2.length ? Math.min(...h2) : NaN), lineH2p10: r3(pc(h2, 0.1)), lineN: h1.length,
    bodyForce50: r3(Math.max(F50, Fcap)), Fcap: r3(Fcap), ops, setupTime: r3(setup), finalStand: r3(stand), relaunchDelayAfterRest: relaunchEv != null ? r3(relaunchEv - restEnd) : null,
    endurance: r3(endur), enduranceLiftIdle: r3(endurLift), idleW: r3(idleW), E_J: r3(E), filmS: r3(filmS), massKg: r3(p.mass), dev,
  };
}

let cases = FR.FULLRUN_CASES;
if (arg('--cases')) { const ids = arg('--cases').split(','); cases = cases.filter((c) => ids.includes(c.id)); }
if (arg('--tailU')) { cases = []; for (const U of arg('--tailU').split(',').map(Number)) for (const seed of [11, 12, 13]) cases.push({ id: `tail${U}_s${seed}`, U, dir: 'tail', mean: [U, 0, 0], seed, intensity: U >= 6 ? 0.2 : 0.15 }); } // off-grid tailwinds (gate-edge check)
if (arg('--shard')) { const [k, N] = arg('--shard').split('/').map(Number); cases = cases.filter((_, i) => i % N === k); }
const rows = [];
for (const c of cases) { const t0 = Date.now(); const r = evalCase(c); rows.push(r); console.log(c.id, Date.now() - t0, 'ms', JSON.stringify({ a: r.avail, fs: r.fsSubject, ke: r.keMax, hc: r.headClearBodyHead })); }
writeFileSync(arg('--out', 'out.json'), JSON.stringify({ generated: new Date().toISOString(), simCopy: ROOT, modelVersion: concept.modelVersion, eis: AT.STAB.eis.ratio, dbDeg: AT.MOUNT.dbDeg, rows }, null, 1));
