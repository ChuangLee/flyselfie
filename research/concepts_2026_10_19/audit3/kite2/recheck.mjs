// Audit3 (round 3) independent re-check of kite2@3.x. Runs against a COPY of sim/ (never the live repo):
//   node recheck.mjs SIMCOPY_ROOT [--part k/m] [--out file.json]
// For every FULLRUN_CASE (or the k-th of m slices):
//  A. dev evaluateCase() (reproduction vs dev/kite2/ensemble_rows.json)
//  B. auditor metrics from the Result (R.frame, raw core.O columns, simulateRun riding column):
//     avail (availMask + own ok-test: productCam present, own footage() inFrame & ≥300 px, dev inNative, art<3 % | strict art=0),
//     footageStability subject RMS, KE (own capsule distance), headClear by own geometry (helmet = bodyPoints head and
//     the brief's pos+1.61 m vertical), boom-to-helmet, excluded-window durations, line height 1/2 m behind the pivot,
//     ops/setup recount, endurance (own power sum, ± regen credit), winch/boom actuator demand.
// Numerical uncalibrated simulation; not physical verification.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2];
if (!ROOT || ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('pass a COPY root (not the live repo)');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const [pk, pm] = (arg('--part') || '0/1').split('/').map(Number);
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const K2 = await imp('sim/js/concepts/kite2/index.js');
const M = await imp('sim/js/concepts/kite2/model.js');
const AN = await imp('sim/js/concepts/kite2/analysis.js');
const CR = await imp('sim/js/concepts/common/criteria.js');
const FR = await imp('sim/js/concepts/common/fullrun.js');
const CO = await imp('sim/js/concepts/common/components.js');
const EN = await imp('sim/js/concepts/common/env.js');
const SK = await imp('sim/js/concepts/common/skier.js');
const concept = K2.default;
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const { MODE } = M;
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v);
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
const pct = (a, q) => FR.pct(a, q);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function ptSeg(p, a, b) { const ab = sub(b, a), l2 = dot(ab, ab); const t = l2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0; return len(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t])); }
const claimedRows = JSON.parse(readFileSync(join(ROOT, 'research/concepts_2026_10_19/dev/kite2/ensemble_rows.json'), 'utf8')).rows;

function audit(c) {
  // ---- A. developer's evaluateCase
  const dev = K2.evaluateCase(P, c);
  // ---- B. same scenario construction as evaluateCase, Result built once more for the auditor's own pass
  const sc = { ...K2.SCEN.find((x) => x.id === 'fullrun'), runSeed: c.seed, dt: 0.002, wind: { mean: c.mean, intensity: c.intensity ?? 0.15, Lu: 28, seed: c.seed }, plan: { start: 'docked', armAt: 0 } };
  const prep = K2.prepare(P, sc);
  const R = K2.buildResult(P, sc, prep);
  const core = R.core, A = R.analysis, O = core.O, n = core.n, dt = 0.02, p = core.p;
  const run = FR.simulateRun({ seed: c.seed });
  const riding = FR.availMask(run);
  // avail + px
  let rideN = 0, ok = 0, okStrict = 0, okNoBoomArt = 0; const px = [];
  let ridingFilm = 0;
  for (let i = 0; i < n; i++) {
    if (!riding[Math.min(run.n - 1, i)]) continue;
    rideN++;
    const f = R.frame(i * dt);
    if (!f.productCam) continue;
    ridingFilm++;
    const ft = EN.footage({ pos: f.productCam.pos, kind: 'rect', fwd: f.productCam.fwd, up: [0, 0, 1], vfovDeg: f.productCam.vfovDeg, w: 1920, h: 1080 }, f.skier);
    const inF = ft.inFrame === 1 && A.inNative[i] === 1;
    if (inF) px.push(ft.subjectPx);
    const good = inF && ft.subjectPx >= 300;
    if (good && !(A.art[i] >= 3)) ok++;
    if (good && !(A.art[i] > 0)) okStrict++;
  }
  const fs = CR.footageStability(R);
  // KE + headClear + boom + windows + line heights + actuator demand
  let keMax = 0, keFly = 0;
  let hcBody = Infinity, hcBodyInclExcl = Infinity, hcVert = Infinity, boomHead = Infinity, boomTipHead = Infinity;
  let hcWorst = null; const exclWins = []; let wStart = null, wMin = Infinity;
  const h1 = [], h2 = [];
  let nuMax = 0, nuP99 = [], aNuMax = 0, PmMax = 0, Pfeat = [], wBoomMax = 0, aBoomMax = 0; const wB = [], aB = [];
  let prevBd = null, prevW = null;
  for (let i = 0; i < n; i++) {
    const t = i * dt, md = O.mode[i];
    const s = core.RS[i], b = SK.bodyPoints(s);
    const head = b.head, headV = [s.pos[0], s.pos[1], s.pos[2] + 1.75 * 0.92];
    const K = [O.kx[i], O.ky[i], O.kz[i]], Ap = [O.ax[i], O.ay[i], O.az[i]], Pv = [O.px[i], O.py[i], O.pz[i]];
    if (md !== MODE.DOCKED && K.every(Number.isFinite)) {
      const caps = M.bodyCapsules(s, b); let d = Infinity; for (const [a, c2, r] of caps) d = Math.min(d, AN.segSeg(K, K, a, c2) - r);
      const vk = [O.kvx[i], O.kvy[i], O.kvz[i]], rv = sub(vk, s.vel);
      const ke = d > 1.5 ? 0.5 * p.mass * dot(vk, vk) : 0.5 * p.mass * dot(rv, rv);
      keMax = Math.max(keMax, ke); if (md !== MODE.STOW && md !== MODE.FLAGDOCK) keFly = Math.max(keFly, ke);
    }
    // airborne geometry: everything not docked/extending (EXTEND = canopy still in the sleeve on the boom)
    const airborne = md !== MODE.DOCKED && md !== MODE.EXTEND && O.brake[i] < 2;
    const excluded = md === MODE.STOW || (md === MODE.FLAGDOCK && O.L[i] <= 0.6);
    if (airborne) {
      const span = Math.sqrt((4 * p.S) / Math.PI), inf = Math.max(0.2, O.infl[i] || 0);
      const er = [O.ex[i], O.ey[i], O.ez[i]];
      const can = [K[0] + er[0] * 0.7, K[1] + er[1] * 0.7, K[2] + er[2] * 0.7];
      const dist = (H) => Math.min(len(sub(K, H)) - 0.05, ptSeg(H, Ap, K), md === MODE.STOW ? Infinity : len(sub(can, H)) - 0.5 * span * inf);
      const dB = dist(head), dV = dist(headV);
      hcBodyInclExcl = Math.min(hcBodyInclExcl, dB);
      if (!excluded) { if (dB < hcBody) { hcBody = dB; hcWorst = { t: r3(t), mode: md, L: r3(O.L[i]) }; } hcVert = Math.min(hcVert, dV); }
      if (excluded) { if (wStart == null) { wStart = t; wMin = Infinity; } wMin = Math.min(wMin, dB); }
    }
    if (!(airborne && (md === MODE.STOW || (md === MODE.FLAGDOCK && O.L[i] <= 0.6))) && wStart != null) { exclWins.push({ t0: r3(wStart), dur: r3(t - wStart), minDist: r3(wMin) }); wStart = null; }
    if (core.useBoom && O.bx[i] > 0.05 && Pv.every(Number.isFinite)) {
      boomHead = Math.min(boomHead, ptSeg(head, Pv, Ap)); boomTipHead = Math.min(boomTipHead, len(sub(Ap, head)));
      const bd = [O.bdx[i], O.bdy[i], O.bdz[i]];
      if (prevBd && O.bx[i] > 0.9) { const w = Math.acos(Math.max(-1, Math.min(1, dot(bd, prevBd)))) / dt; wB.push(w); if (prevW != null) aB.push(Math.abs(w - prevW) / dt); prevW = w; } else prevW = null;
      prevBd = bd;
    } else { prevBd = null; prevW = null; }
    // line heights behind the pivot (riding, filming, FILM mode, no snag)
    if (riding[Math.min(run.n - 1, i)] && A.filming[i] === 1 && md === MODE.FILM && O.snag[i] === 0) {
      const P0 = core.useBoom ? Pv : Ap; const poly = [P0, Ap, K];
      for (const [dd, arr] of [[1, h1], [2, h2]]) for (let k = 0; k + 1 < poly.length; k++) {
        const a0 = poly[k], a1 = poly[k + 1];
        const g0 = Math.hypot(a0[0] - P0[0], a0[1] - P0[1]), g1 = Math.hypot(a1[0] - P0[0], a1[1] - P0[1]);
        if ((g0 - dd) * (g1 - dd) <= 0 && Math.abs(g1 - g0) > 1e-6) { const u = (dd - g0) / (g1 - g0); const z = a0[2] + (a1[2] - a0[2]) * u, x = a0[0] + (a1[0] - a0[0]) * u; arr.push(z + x * core.tanS); break; }
      }
    }
    if (Number.isFinite(O.nu[i])) { nuMax = Math.max(nuMax, Math.abs(O.nu[i])); nuP99.push(Math.abs(O.nu[i])); if (i > 0 && Number.isFinite(O.nu[i - 1])) aNuMax = Math.max(aNuMax, Math.abs(O.nu[i] - O.nu[i - 1]) / dt); }
    if (Number.isFinite(O.Fm[i]) && Number.isFinite(O.nu[i])) { const pm = Math.abs(O.Fm[i] * O.nu[i]); PmMax = Math.max(PmMax, pm); Pfeat.push(pm); }
  }
  // boom gimbal torque demand: uniform rod of boomMass over the full length about the pivot (+ tip-mass 0 → lower bound)
  const Iboom = (p.boomMass * p.boom * p.boom) / 3;
  const aBp99 = pct(aB, 0.99), wBp99 = pct(wB, 0.99);
  // body force
  let F50 = 0, Traw = 0, F50grid = 0;
  for (let i = 0; i < n; i++) { if (Number.isFinite(O.T50[i])) F50 = Math.max(F50, O.T50[i]); if (Number.isFinite(O.Tmax[i])) Traw = Math.max(Traw, O.Tmax[i]); }
  for (let i = 2; i < n; i++) { const v = (0.5 * O.T[i - 2] + O.T[i - 1] + 0.5 * O.T[i]) / 2; if (Number.isFinite(v)) F50grid = Math.max(F50grid, v); }
  // ops / setup from events and simulateRun stops
  const evc = (tp) => core.events.filter((e) => e.type === tp).length;
  const gu = core.events.filter((e) => e.type === 'giveUp').map((e) => e.t);
  const pickNot = core.events.filter((e) => e.type === 'pickedUp' && !gu.some((g) => e.t >= g && e.t - g < 15)).length;
  const nManual = evc('manualStow') + evc('giveUp') + pickNot;
  const strayLanded = evc('landed') && !evc('pickedUp') && !evc('relift') && !evc('giveUp') ? 1 : 0;
  const ops = 1 + evc('stowcmd') + nManual + strayLanded + (evc('release') + evc('cut') > 0 ? 1 : 0);
  let wait = 0; const stopsDetail = [];
  for (const [k, st] of run.stops.entries()) {
    const last = k === run.stops.length - 1;
    const stowT = core.dockInfo.stowT.find((x) => x >= st.t0 - 5 && x <= st.t1 + 30);
    const iA = Math.min(n - 1, Math.round(st.t0 / dt)); const air = O.mode[iA] !== MODE.DOCKED;
    const w = stowT != null ? Math.max(0, stowT - st.t0) : air ? st.t1 - st.t0 + 10 : 0;
    const counted = last ? w : Math.max(0, w - (st.t1 - st.t0));
    stopsDetail.push({ t0: r3(st.t0), t1: r3(st.t1), stowT: r3(stowT ?? NaN), wait: r3(w), counted: r3(counted), airborneAtStop: air });
    wait += counted;
  }
  const setup = 2 + wait; // arm tap 2 s (ASSUMED) + simulated waits (manual hand time is inside the stow time)
  // dock/launch while riding: share of riding time spent in launch/extend/retrieve/flagdock/stow (not filming)
  // endurance
  const Pk = mean(Array.from(O.Pk)), PwArr = Array.from(O.Pw).filter(Number.isFinite), Pw = mean(PwArr), PwPos = mean(PwArr.map((v) => Math.max(0, v)));
  const boomOut = core.useBoom ? Array.from(O.bx).filter((v) => v > 0.5).length / n : 0;
  const Pmean = Pk / 0.9 + Pw + p.pPack + boomOut * p.pGimbal, PmeanNoRegen = Pk / 0.9 + PwPos + p.pPack + boomOut * p.pGimbal;
  const endur = CO.enduranceMin(p.packWh + p.podWh, Pmean, { heated: true }), endurNoRegen = CO.enduranceMin(p.packWh + p.podWh, PmeanNoRegen, { heated: true });
  // azRange (own: 0.2 Hz LP of footage az over riding & filming samples)
  const azs = []; { let y = null; const k = 1 - Math.exp(-dt * 2 * Math.PI * 0.2); for (let i = 0; i < n; i++) { if (!riding[Math.min(run.n - 1, i)] || A.filming[i] !== 1 || !Number.isFinite(A.az[i])) continue; y = y == null ? A.az[i] : y + (A.az[i] - y) * k; azs.push(y); } }
  const hcDev = Array.from(A.headClear).filter(Number.isFinite);
  const cl = claimedRows.find((x) => x.id === c.id);
  return {
    id: c.id, U: c.U, dir: c.dir,
    devRerun: { avail: r3(dev.avail), jitterRms: r3(dev.jitterRms), setupTime: r3(dev.setupTime), ops: dev.ops, bodyForcePeak: r3(dev.bodyForcePeak), keMax: r3(dev.keMax), endurance: r3(dev.endurance), headClear: r3(dev.headClear), boomHead: r3(dev.boomHead), pxMed: r3(dev.pxMed), azRange: r3(dev.azRange), lineH1min: r3(dev.lineH1min), lineH2min: r3(dev.lineH2min) },
    claimed: cl ? { avail: cl.avail, jitterRms: cl.jitterRms, setupTime: cl.setupTime, ops: cl.ops, bodyForcePeak: cl.bodyForcePeak, keMax: cl.keMax, endurance: cl.endurance, headClear: cl.headClear, pxMed: cl.pxMed, azRange: cl.azRange } : null,
    aud: {
      avail: r3(100 * ok / Math.max(1, rideN)), availStrictArt0: r3(100 * okStrict / Math.max(1, rideN)), filmShareOfRiding: r3(100 * ridingFilm / Math.max(1, rideN)),
      pxMed: r3(pct(px, 0.5)), azRange: r3(azs.length > 50 ? pct(azs, 0.95) - pct(azs, 0.05) : NaN),
      fsSubject: r3(fs.subjectRms), fsBackground: r3(fs.backgroundRms), fsSamples: fs.samples,
      keMax: r3(keMax), keMaxExclDock: r3(keFly),
      headClear: r3(hcBody), headClearVertHelmet: r3(hcVert), headClearInclExcluded: r3(hcBodyInclExcl), headClearDevMin: r3(hcDev.length ? Math.min(...hcDev) : NaN), headClearWorst: hcWorst,
      excludedWindows: exclWins, excludedMaxDur: r3(exclWins.length ? Math.max(...exclWins.map((w) => w.dur)) : 0),
      boomSegToHelmet: r3(boomHead), boomTipToHelmet: r3(boomTipHead),
      lineH1min: r3(h1.length ? Math.min(...h1) : NaN), lineH1p10: r3(pct(h1, 0.1)), lineH2min: r3(h2.length ? Math.min(...h2) : NaN), lineH2p10: r3(pct(h2, 0.1)),
      bodyForce50: r3(F50), bodyForce50grid20ms: r3(F50grid), tensionRawMax: r3(Traw),
      ops, setupTime: r3(setup), stops: stopsDetail, manual: nManual,
      endurance: r3(endur), enduranceNoRegen: r3(endurNoRegen), pMeanW: r3(Pmean), boomOutShare: r3(boomOut),
      winch: { nuMax: r3(nuMax), nuP99: r3(pct(nuP99, 0.99)), accMax: r3(aNuMax), PmechMax: r3(PmMax), PmechP99: r3(pct(Pfeat, 0.99)), motorRadS_atNuMax: r3(nuMax * p.gear / p.rDrum), backEmfV_atNuMax: r3(nuMax * p.gear / p.rDrum * p.Kt), lineSpeedAt11V1: r3((11.1 / p.Kt) * p.rDrum / p.gear) },
      boom: { omegaP99_rad_s: r3(wBp99), alphaP99_rad_s2: r3(aBp99), I_kgm2: r3(Iboom), torqueP99_Nm: r3(Iboom * aBp99), gravTorque_Nm: r3(p.boomMass * 9.81 * p.boom / 2) },
      events: { launches: core.launches, docks: evc('docked'), landed: evc('landed'), collapses: core.nCollapse, aborts: evc('abort'), governor: core.govN },
    },
  };
}
const rows = [];
FR.FULLRUN_CASES.forEach((c, k) => { if (k % pm !== pk) return; const t0 = Date.now(); const r = audit(c); r.ms = Date.now() - t0; rows.push(r); console.log(c.id, JSON.stringify({ avail: r.aud.avail, fs: r.aud.fsSubject, ke: r.aud.keMax, hc: r.aud.headClear, hcV: r.aud.headClearVertHelmet, setup: r.aud.setupTime, ops: r.aud.ops, F: r.aud.bodyForce50, end: r.aud.endurance, nu: r.aud.winch.nuMax }), r.ms, 'ms'); });
writeFileSync(arg('--out') || join(here, `out_part${pk}.json`), JSON.stringify({ generated: new Date().toISOString(), simCopy: ROOT, modelVersion: concept.modelVersion, rows }, null, 1));
