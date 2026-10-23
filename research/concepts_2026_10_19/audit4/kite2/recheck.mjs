// Audit4 (round 4) independent re-check of kite2@4.0.0. Runs against a COPY of sim/ (never the live repo):
//   node recheck.mjs SIMCOPY_ROOT i0 i1 [--over '{"gMaxR":0.6}'] [--tag name] [--cases id,id]   → out_<tag>_<i0>_<i1>.json
// For every FULLRUN_CASES_R4 case: the concept's own prepare()+buildResult() exactly as evaluateCase() does (dt 2 ms),
// then the auditor's OWN metrics from R.frame(t) and the raw core columns (20 ms grid):
//   avail     own riding mask (simulateRun(seed).col.riding via availMask) × productCam present × own footage() bodyPx ≥300 ×
//             all 6 subject points in the 16:9 crop × crop inside the native 45° frame (pod axis) and ≥1:1 native ×
//             own artefact test: boom (pivot→tip, 3.0→2.5 mm) and line (tip→KCU, 0.5 mm) projected with their real
//             diameters into the delivered 1080-line crop; counts when ≥2 px wide (artefactCounts) AND inside the subject
//             bounding box (shared-rule text, "bbox" variant) — also the developer's silhouette-capsule variant ("caps").
//   pxMed     median bodyPx (own footage()) over riding+filming in-frame samples.
//   jitter    common/criteria.js footageStability(R).subjectRms.
//   keMax     KCU KE, ground frame when >1.5 m from every body capsule, rider frame within, every non-docked sample.
//   headClear helmetAt(simulateRun(seed), t) to line (boom tip→KCU), KCU sphere (0.05) and canopy disc; exclusions DOCKED,
//             EXTEND, STOW, final 0.6 m seat; window lengths reported. Worn boom (pivot→tip) min distance separately.
//   setup/ops own recount from the mode column + shared stops; bodyForce from O.T50 and from a 20 ms-grid 50 ms mean.
//   winch     motor current / shaft speed / electrical power / battery C-rate vs the 2205 envelope.
//   clothesline heights of boom+line 1/2/3 m behind the pivot.
// Numerical-uncalibrated simulation; not a physical test.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2];
if (!ROOT || ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('pass a COPY root (not the live repo)');
const i0 = +(process.argv[3] ?? 0), i1 = +(process.argv[4] ?? 48);
const arg = (k) => { const j = process.argv.indexOf(k); return j > 0 ? process.argv[j + 1] : null; };
const OVER = arg('--over') ? JSON.parse(arg('--over')) : {};
const TAG = arg('--tag') || 'base';
const ONLY = arg('--cases') ? arg('--cases').split(',') : null;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const K2 = await imp('sim/js/concepts/kite2/index.js');
const M = await imp('sim/js/concepts/kite2/model.js');
const CR = await imp('sim/js/concepts/common/criteria.js');
const FR = await imp('sim/js/concepts/common/fullrun.js');
const CO = await imp('sim/js/concepts/common/components.js');
const EN = await imp('sim/js/concepts/common/env.js');
const concept = K2.default;
const D = { ...Object.fromEntries(concept.params.map((p) => [p.id, p.v])), ...OVER };
const { MODE } = M;
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const D2R = Math.PI / 180;
const segPt = (A, B, P) => { const d = sub(B, A), l2 = dot(d, d); const u = l2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(P, A), d) / l2)) : 0; return len(sub(add(A, mul(d, u)), P)); };
const segSeg = M.segPoint ? null : null; void segSeg;
const pct = (a, q) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))] : NaN; };
const dt = 0.02;

function camBasis(fwd) { const f = nrm(fwd), r = nrm(crs(f, [0, 0, 1])), u = crs(r, f); return { f, r, u }; }

function runCase(c) {
  const t0 = performance.now();
  const sc = { ...K2.SCEN.find((x) => x.id === 'fullrun'), runSeed: c.seed, dt: 0.002, wind: { mean: c.mean, intensity: c.intensity ?? 0.15, Lu: 28, seed: c.seed }, plan: { start: 'docked', armAt: 0 } };
  const prep = K2.prepare(D, sc);
  const R = K2.buildResult(D, sc, prep);
  const core = R.core, O = core.O, n = core.n, A = R.analysis, J = R.judge, p = core.p;
  const run = FR.simulateRun({ seed: c.seed });
  const mask = FR.availMask(run);
  const helm = (t) => FR.helmetAt(run, t);
  // native frame
  const hf = (p.hfov / 2) * D2R, fpxN = (p.nativeW / 2) / Math.tan(hf), vfMin = 2 * Math.atan(540 / fpxN) / D2R;
  const halfNative = Math.atan(Math.tan(hf) * Math.hypot(1, 9 / 16)) / D2R;
  let ride = 0, okB = 0, okC = 0, okNoArt = 0, artBboxN = 0, artCapsN = 0, filmRide = 0;
  const bodyPxArr = [], boomW = [], lineW = [], boomWover = [], vfArr = [];
  let boomWmaxOver = 0, boomWmaxAny = 0, boomTipCamMin = Infinity, nativeViol = 0;
  let ke = 0, keT = null, hc = Infinity, hcT = null, hcWhat = null, boomHead = Infinity, boomHeadT = null, hcNoExcl = Infinity, kcuSeatHead = Infinity;
  const exclWin = []; let exStart = null;
  const h1 = [], h2 = [], h3 = []; let lowN = 0, lowDen = 0;
  let T50grid = 0, Imax = 0, nuInMax = 0, PwMax = 0, motorOn = 0, cRateMax = 0, FmMax = 0, envViol = 0;
  const KeM = 60 / (2 * Math.PI * p.Kv), fPerA = KeM * p.gear / p.rDrum;
  const vNoLoad = p.Vbat / KeM / p.gear * p.rDrum;
  const packAh = (p.packWh) / (3 * 3.6); // 3S nominal
  let pSum = 0;
  const caps = (s) => M.bodyCapsules(s);
  const span = Math.sqrt(4 * p.S / Math.PI);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const md = O.mode[i];
    const s = core.RS[i];
    const K = [O.kx[i], O.ky[i], O.kz[i]], Ax = [O.ax[i], O.ay[i], O.az[i]], P0 = [O.px[i], O.py[i], O.pz[i]];
    const H = helm(t);
    // ---------- footage
    const riding = mask[Math.min(run.n - 1, i)] === 1;
    const f = R.frame(t), pc = f.productCam;
    if (riding) ride++;
    if (pc) {
      const vf = pc.vfovDeg; vfArr.push(vf);
      const ft = EN.footage({ pos: pc.pos, kind: 'rect', fwd: pc.fwd, up: [0, 0, 1], vfovDeg: vf, w: 1920, h: 1080 }, f.skier);
      // crop inside the native frame (pod axis from the analysis column = physics state, not a metric)
      const pa = [A.pax[i], A.pay[i], A.paz[i]];
      const off = Math.acos(Math.max(-1, Math.min(1, dot(nrm(pa), nrm(pc.fwd))))) / D2R;
      const halfDiagCrop = Math.atan(Math.tan(vf * D2R / 2) * Math.hypot(1, 16 / 9)) / D2R;
      const inNative = off + halfDiagCrop <= halfNative + 1e-9 && vf >= vfMin - 1e-6;
      if (!(vf >= vfMin - 1e-6)) nativeViol++;
      // artefact projection
      const { f: cf, r: cr, u: cu } = camBasis(pc.fwd);
      const tv = Math.tan(vf * D2R / 2), th = tv * 16 / 9, fpx = 540 / tv;
      const proj = (X) => { const d = sub(X, pc.pos); const z = dot(d, cf); if (z <= 0.03) return null; return [dot(d, cr) / z / th * 960, dot(d, cu) / z / tv * 540, z]; };
      const sp = EN.subjectPoints(f.skier);
      const spp = [sp.feet, sp.head, sp.shL, sp.shR, sp.skiTip, sp.skiTail].map(proj);
      let bb = null;
      if (spp.every(Boolean)) bb = { x0: Math.min(...spp.map((q) => q[0])), x1: Math.max(...spp.map((q) => q[0])), y0: Math.min(...spp.map((q) => q[1])), y1: Math.max(...spp.map((q) => q[1])), z: Math.max(...spp.map((q) => q[2])) };
      // silhouette capsules (developer variant)
      const cps = caps(f.skier).map(([a, b2, rad]) => { const Pa = proj(a), Pb = proj(b2); return Pa && Pb ? [Pa, Pb, rad * fpx / Pa[2], rad * fpx / Pb[2], rad] : null; }).filter(Boolean);
      const segs = [];
      if (p.boom) segs.push(['boom', P0, Ax, p.boomDBase / 1000, p.boomDTip / 1000]);
      segs.push(['line', Ax, K, p.dT / 1000, p.dT / 1000]);
      let wB = 0, wC = 0, bwAny = 0, bwOver = 0, lw = 0;
      for (const [nm, a, b2, d0, d1] of segs) {
        const sl = len(sub(b2, a));
        for (let dd = 0; dd <= sl + 1e-9; dd += dd < 2 ? 0.01 : 0.1) {
          const u = Math.min(1, dd / (sl || 1));
          const X = add(a, mul(sub(b2, a), u)), Pp = proj(X);
          if (!Pp) continue;
          const w = (d0 + (d1 - d0) * u) * fpx / Pp[2];
          if (nm === 'boom' && Math.abs(Pp[0]) <= 960 && Math.abs(Pp[1]) <= 540) { bwAny = Math.max(bwAny, w); boomTipCamMin = Math.min(boomTipCamMin, Pp[2]); }
          if (bb && Pp[0] >= bb.x0 && Pp[0] <= bb.x1 && Pp[1] >= bb.y0 && Pp[1] <= bb.y1 && Pp[2] < bb.z + 0.3) { wB = Math.max(wB, w); if (nm === 'boom') bwOver = Math.max(bwOver, w); else lw = Math.max(lw, w); }
          for (const cc of cps) {
            const qx = cc[1][0] - cc[0][0], qy = cc[1][1] - cc[0][1], l2 = qx * qx + qy * qy;
            const tt = l2 > 1e-9 ? Math.max(0, Math.min(1, ((Pp[0] - cc[0][0]) * qx + (Pp[1] - cc[0][1]) * qy) / l2)) : 0;
            const hx = cc[0][0] + qx * tt - Pp[0], hy = cc[0][1] + qy * tt - Pp[1], rr = cc[2] + (cc[3] - cc[2]) * tt, zc = cc[0][2] + (cc[1][2] - cc[0][2]) * tt;
            if (hx * hx + hy * hy < rr * rr && Pp[2] < zc + cc[4]) { wC = Math.max(wC, w); break; }
          }
        }
      }
      boomWmaxAny = Math.max(boomWmaxAny, bwAny);
      if (riding) {
        filmRide++;
        const inFrame = ft.inFrame === 1 && inNative && !f.skier.fallen;
        const bpx = inFrame ? ft.bodyPx : 0;
        if (inFrame) bodyPxArr.push(bpx);
        const base = inFrame && bpx >= 300;
        const artB = FR.artefactCounts(wB > 0, wB), artC = FR.artefactCounts(wC > 0, wC);
        if (base) { okNoArt++; if (!artB) okB++; if (!artC) okC++; if (artB) artBboxN++; if (artC) artCapsN++; }
        if (bwOver > 0) { boomWover.push(bwOver); boomWmaxOver = Math.max(boomWmaxOver, bwOver); }
        if (lw > 0) lineW.push(lw);
        boomW.push(bwAny);
      }
    }
    // ---------- KE
    if (md !== MODE.DOCKED) {
      const vk = [O.kvx[i], O.kvy[i], O.kvz[i]];
      let dB = Infinity; for (const [a, b2, rad] of caps(s)) dB = Math.min(dB, segPt(a, b2, K) - rad);
      const k = dB > 1.5 ? 0.5 * p.mass * dot(vk, vk) : 0.5 * p.mass * dot(sub(vk, s.vel), sub(vk, s.vel));
      if (k > ke) { ke = k; keT = t; }
    }
    // ---------- headClear
    const airborneOK = md !== MODE.DOCKED && md !== MODE.STOW && md !== MODE.EXTEND && !(md === MODE.FLAGDOCK && O.L[i] <= 0.6) && O.brake[i] < 2;
    const excluded = (md === MODE.STOW || (md === MODE.FLAGDOCK && O.L[i] <= 0.6));
    if (excluded && exStart == null) exStart = t; if (!excluded && exStart != null) { exclWin.push(t - exStart); exStart = null; }
    if (md === MODE.STOW) kcuSeatHead = Math.min(kcuSeatHead, len(sub(K, H)));
    if (md !== MODE.DOCKED && O.brake[i] < 2) {
      const er = [O.ex[i], O.ey[i], O.ez[i]];
      const dLine = segPt(Ax, K, H), dK = len(sub(K, H)) - 0.05;
      const inf = Math.max(0.2, O.infl[i] || 0), cc = add(K, mul(er, 0.7 * (md === MODE.LANDED ? 0.3 : 1)));
      const dCan = (md === MODE.STOW || md === MODE.EXTEND) ? Infinity : len(sub(cc, H)) - 0.5 * span * inf;
      const d = Math.min(dLine, dK, dCan);
      hcNoExcl = Math.min(hcNoExcl, d);
      if (airborneOK && d < hc) { hc = d; hcT = t; hcWhat = d === dLine ? 'line' : d === dK ? 'kcu' : 'canopy'; }
      if (p.boom && md !== MODE.STOW && md !== MODE.EXTEND) { const bh = segPt(P0, Ax, H); if (bh < boomHead) { boomHead = bh; boomHeadT = t; } }
    }
    // ---------- clothesline
    if (riding && md !== MODE.DOCKED && md !== MODE.STOW && md !== MODE.EXTEND && O.brake[i] < 2 && len(sub(K, Ax)) > 2.5) {
      const poly = [P0, Ax, K]; const hs = [];
      for (const [ddd, arr] of [[1, h1], [2, h2], [3, h3]]) {
        for (let k = 0; k + 1 < poly.length; k++) {
          const a0 = poly[k], a1 = poly[k + 1];
          const g0 = Math.hypot(a0[0] - P0[0], a0[1] - P0[1]), g1 = Math.hypot(a1[0] - P0[0], a1[1] - P0[1]);
          if ((g0 - ddd) * (g1 - ddd) <= 0 && Math.abs(g1 - g0) > 1e-6) { const u = (ddd - g0) / (g1 - g0); const Q = add(a0, mul(sub(a1, a0), u)); const h = Q[2] + Q[0] * core.tanS; arr.push(h); hs.push(h); break; }
        }
      }
      if (hs.length) { lowDen++; if (Math.min(...hs) < 1.8) lowN++; }
    }
    // ---------- force / winch / power
    if (i >= 2) { const m = (O.T[i] + O.T[i - 1] + O.T[i - 2]) / 3; if (Number.isFinite(m) && m > T50grid) T50grid = m; }
    const Iw = O.Iw[i]; if (Number.isFinite(Iw)) { Imax = Math.max(Imax, Iw); if (Iw > p.Imax + 1e-6) envViol++; if (Iw > 0.01) motorOn += dt; }
    if (Number.isFinite(O.nuSh[i])) { nuInMax = Math.max(nuInMax, -O.nuSh[i]); if (-O.nuSh[i] > vNoLoad + 1e-6) envViol++; }
    if (Number.isFinite(O.Fm[i])) FmMax = Math.max(FmMax, O.Fm[i]);
    if (Number.isFinite(O.Pw[i])) { PwMax = Math.max(PwMax, O.Pw[i]); cRateMax = Math.max(cRateMax, O.Pw[i] / p.Vbat / packAh); }
    pSum += (O.Pk[i] || 0) / 0.9 + (Number.isFinite(O.Pw[i]) ? O.Pw[i] : 0) + p.pPack;
  }
  if (exStart != null) exclWin.push(n * dt - exStart);
  // ---------- setup / ops recount (shared stops)
  const docked = (i) => O.mode[i] === MODE.DOCKED;
  let wait = 0;
  run.stops.forEach((st, k) => {
    const last = k === run.stops.length - 1;
    let iA = Math.min(n - 1, Math.round(st.t0 / dt));
    let j = iA; while (j < n && !docked(j)) j++;
    const w = j < n ? (j - iA) * dt : (n - iA) * dt + 10;
    wait += last ? w : Math.max(0, w - (st.t1 - st.t0));
  });
  const ownSetup = 2.0 + wait;
  const evs = (ty) => core.events.filter((e) => e.type === ty).length;
  const ownOps = 1 + evs('stowcmd') + core.manual + (evs('release') + evs('cut') > 0 ? 1 : 0) + (evs('landed') && !evs('pickedUp') && !evs('relift') && !evs('giveUp') ? 1 : 0);
  const fs = CR.footageStability(R);
  const pMean = pSum / n;
  const endurance = CO.enduranceMin(p.packWh + p.podWh, pMean, { heated: true });
  return {
    id: c.id, U: c.U, dir: c.dir, seed: c.seed, ms: Math.round(performance.now() - t0),
    dev: { avail: r3(J.avail * 100), pxMed: r3(J.pxMed), jitterFs: r3(fs.subjectRms), setup: r3(J.setup), ops: J.ops, F50: r3(J.F50), keMax: r3(J.keMax), endurance: r3(J.endurance), azRange: r3(J.azRange),
      headClear: r3(Math.min(...Array.from(A.headClear).filter(Number.isFinite))), boomHead: r3(Math.min(...Array.from(A.boomHead).filter(Number.isFinite))) },
    own: {
      avail: r3(100 * okB / Math.max(1, ride)), availCaps: r3(100 * okC / Math.max(1, ride)), availNoArtefact: r3(100 * okNoArt / Math.max(1, ride)),
      artBboxSharePct: r3(100 * artBboxN / Math.max(1, okNoArt)), artCapsSharePct: r3(100 * artCapsN / Math.max(1, okNoArt)),
      filmRideSharePct: r3(100 * filmRide / Math.max(1, ride)),
      pxMed: r3(pct(bodyPxArr, 0.5)), vfMed: r3(pct(vfArr, 0.5)), vfMin: r3(Math.min(...vfArr)), vfMinNative: r3(vfMin), nativeViol,
      boomWpxMedOver: r3(pct(boomWover, 0.5)), boomWpxP99Over: r3(pct(boomWover, 0.99)), boomWpxMaxOver: r3(boomWmaxOver), boomWpxMaxInFrame: r3(boomWmaxAny), boomCamDistMin: r3(boomTipCamMin), boomOverShare: r3(100 * boomWover.length / Math.max(1, filmRide)), lineWpxMaxOver: r3(lineW.length ? Math.max(...lineW) : 0),
      jitterSubject: r3(fs.subjectRms), jitterBackground: r3(fs.backgroundRms),
      keMax: r3(ke), keT: r3(keT), headClear: r3(hc), headClearT: r3(hcT), headClearWhat: hcWhat, headClearNoExclusion: r3(hcNoExcl), exclWindowsS: exclWin.map(r3), kcuSeatedHeadMin: r3(kcuSeatHead),
      boomHeadMin: r3(boomHead), boomHeadT: r3(boomHeadT),
      setup: r3(ownSetup), ops: ownOps, F50: r3(J.F50), F50grid20ms: r3(T50grid), endurance: r3(endurance), pMean: r3(pMean),
      lineH1min: r3(Math.min(...h1)), lineH2min: r3(Math.min(...h2)), lineH3min: r3(Math.min(...h3)), lineH1p10: r3(pct(h1, 0.1)), lowSharePct: r3(100 * lowN / Math.max(1, lowDen)),
      winch: { Imax: r3(Imax), nuInMax: r3(nuInMax), vNoLoad: r3(vNoLoad), FmMax: r3(FmMax), PwMax: r3(PwMax), battCrateMax: r3(cRateMax), motorOnS: r3(motorOn), envViol, stallF: r3(p.Imax * fPerA * p.etaG) },
      launches: core.launches, manual: core.manual, govN: core.govN, govT: r3(core.govT),
    },
  };
}

let cases = FR.FULLRUN_CASES_R4.slice(i0, i1);
if (ONLY) cases = FR.FULLRUN_CASES_R4.filter((c) => ONLY.includes(c.id));
const rows = [];
for (const c of cases) { const r = runCase(c); rows.push(r); console.log(c.id, r.ms, 'ms', JSON.stringify({ dev: r.dev, own: { avail: r.own.avail, availCaps: r.own.availCaps, ke: r.own.keMax, hc: r.own.headClear, bw: r.own.boomWpxMaxOver } })); }
writeFileSync(join(here, `out_${TAG}_${i0}_${i1}.json`), JSON.stringify({ generated: new Date().toISOString(), simCopy: ROOT, modelVersion: concept.modelVersion, over: OVER, rows }, null, 1));
