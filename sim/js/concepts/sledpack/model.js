// sledpack physics + sensors + autonomy (SIM-033). Numerical-uncalibrated simulation.
//
// TRUTH (read only by the physics, the sensor models and the judge — never by a controller):
//  • kite: point mass at the bridle apex (sail + pod), bridled single-skin sled: AoA α = 90° − φ + δb where φ is the
//    angle between the line (exit→kite) and the local airflow and δb the bridle trim set by the depower line; linear
//    lift to CLmax then flat-plate blend (design.js aeroCoef); lift ⟂ airflow toward the kite's nose side; keel
//    weathervane lag of the kite heading (τ 0.25 s) gives a sideslip β; membrane COLLAPSE when unloaded (α < 6°,
//    β > 40° or q < 1.2 Pa for 0.15 s) → drogue (CL 0, CD 0.35 on 0.6 S) until re-inflated (10° < α < 50°, β < 25°,
//    q > 3 Pa for 0.4 s); snow contact with Coulomb friction μ 0.3.
//  • line: one straight elastic segment (EA/L, both lines' weight and cross-flow drag, parabolic sag) with the shock
//    spring in series at the sleeve mouth; weak link 38 N (50 ms mean) at the mouth.
//  • reel: line speed state with reflected mass, speed controller with force limit ±30 N, no-load speed 5.3 m/s,
//    spring brake when holding, 35 N slip clutch; depower drum rate-limited (0.10 m stroke in 0.35 s).
//  • rider: shared skier; exit = sleeve mouth 0.17 m behind / 0.12 m below the shared pelvis point (sacrum);
//    apparent wind at the kite = shared makeWind − kite velocity.
// SENSORS: pack IMU/GNSS/baro detector (detect.js, copied from activetether), pack GNSS speed (σ 0.12, 0.1 s),
//  exit tension (scale/bias/noise/latency), exit line angle (+ AHRS), metered line length, shared windEstimate().
// AUTONOMY (estimates only): DOCKED → LAUNCH (gate: ride detected, no lift lockout, estimated apparent wind ≥ vGate,
//  pack lateral accel ≤ straightAcc) → FLY (depower-line tension PI, reel holds length; "kite-like" slow length
//  management: reel in on a lift deficit, pay out on surplus with depower saturated) → RETRIEVE (stop detected or
//  low apparent wind: full depower = collapse, reel in while the rider still slides) → TOW (on the snow) → CAPTURE
//  (last 1.5 m slow, ASSUMED capture model) → DOCKED; MANUAL after 3 failed captures; ABORT on a detected fall.
import { makeWind } from '../common/env.js';
import { skierAt, bodyPoints } from '../common/skier.js';
import { windEstimate } from '../common/fullrun.js';
import { mulberry32, gaussian } from '../../model/util.js';
import { SLED, LINE, REEL, SENS, G, RHO, GEOM, TAIL, BACKSTOW, EYELET, aeroCoef, kiteBudget, vMin, sledGeo } from './design.js';
import { skiTraceOf, runDetector } from './detect.js';

const D2R = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, f = [0, 0, 1]) => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : f; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const acos = (x) => Math.acos(clamp(x, -1, 1));
class Delay { constructor(d) { this.d = d; this.q = []; this.h = 0; this.last = null; } push(t, v) { this.q.push([t, v]); } get(t) { while (this.h < this.q.length && this.q[this.h][0] <= t - this.d + 1e-9) this.last = this.q[this.h++][1]; if (this.h > 256) { this.q = this.q.slice(this.h); this.h = 0; } return this.last; } }

export const MODE = { DOCKED: 0, LAUNCH: 1, FLY: 2, RETRIEVE: 3, TOW: 4, CAPTURE: 5, ABORT: 6, FREE: 7, MANUAL: 8, PARK: 9 };
export const MODE_NAME = Object.fromEntries(Object.entries(MODE).map(([k, v]) => [v, k]));
export const AIRBORNE = (m) => m !== MODE.DOCKED;

// defaults (ASSUMED unless noted); index.js exposes the important ones as params
export const PDEF = {
  Lfilm: 8, Lstream: 3, Lmax: 10, stow: 1, wake: 1, Lsched: 1, vRef: 12, Lk: 0.75, LminS: 5, LmaxS: 9, camTiltDeg: 8, elevCap: 0, twMax: 5, cwMax: 99, swingGuard: 1, swingDeg: 40, twStop: 1, twStopMin: 0, vPull: 4.8, Lmin: 5, vLaunch: 2.0, vGate: 3.6, vGateOff: 2.6, gateT: 0.6, straightAcc: 4.0,
  Tset: 12, Tlo: 1.0, aMarginDeg: 14, depFlyMax: 0.85, vRet: 3.5, vTow: 1.5, Lpark: 2.5, elevLow: 25, retHold: 8, vCap: 0.4, capL: 1.5, preRetrieve: 1,
  swivel: 1, areaScale: 1, tail: 1, tailScale: 1, massScale: 1, cd0Scale: 1, clmaxScale: 1, noise: 1, capScale: 1, wBias: 0, tailFree: 0,
  azShot: 0, cropFc: 1.5, dt: 0.002, ctrlDt: 0.01,
};

// ASSUMED capture model (disclosed): success = P0 · f(arrival speed) · f(entry angle to the mouth axis).
// P0 0.95: the sled folds along its keels when its apex is pulled into the Ø120→Ø55 mm funnel (spars parallel to the
// pull); jam/ice/wrap residual taken as the SIM-032 engineering Monte-Carlo (≈4 %). Speed term as activetether;
// angle term on the entry angle beyond the swivel range (design.js GEOM.swivelDeg): full ≤30°, 0 at 55° beyond it.
// Not measured — kill test: 50 docks at −10 °C, moving and standing, with a stiff and a soft (wet) sail.
export function captureProb(vRel, angDeg, scale = 1) {
  const fv = vRel <= 0.8 ? 1 : vRel <= 2 ? 1 - (0.5 * (vRel - 0.8)) / 1.2 : vRel <= 3 ? 0.5 - 0.4 * (vRel - 2) : 0.1 * Math.exp(-(vRel - 3));
  const fa = angDeg <= 30 ? 1 : angDeg <= 55 ? 1 - (angDeg - 30) / 25 : 0;
  return clamp(0.95 * scale, 0, 1) * fv * fa;
}

export function resolveP(params) {
  const p = { ...PDEF, ...params };
  const kb = kiteBudget(p.areaScale, p.tail);
  const m = kb.kg * p.massScale;
  const geo = sledGeo(p.areaScale);
  return { ...p, m, geo, Vmin: vMin(m, geo, p.clmaxScale), kb };
}

// body track (20 ms samples, Hermite-interpolated exit): sleeve mouth, mouth axis, helmet, heading, up, stow point
function bodyTrack(sk, T, dt0 = 0.02, stow = 0) {
  const xF = stow ? EYELET.exitF : GEOM.exitF, xU = stow ? EYELET.exitU : GEOM.exitU;
  const n = Math.floor(T / dt0) + 3;
  const E = [], H = [], S = [], AX = [], UP = [], HD = [];
  const sb = Math.sin(GEOM.axisBackDeg * D2R), cb = Math.cos(GEOM.axisBackDeg * D2R);
  for (let i = 0; i < n; i++) {
    const s = skierAt(sk, i * dt0), b = bodyPoints(s), h = s.heading, up = b.up, pv = b.pelvis;
    const at = (f, u) => [pv[0] + h[0] * f + up[0] * u, pv[1] + h[1] * f + up[1] * u, pv[2] + h[2] * f + up[2] * u];
    E.push(at(xF, xU)); S.push(at(xF, xU + GEOM.stowU)); H.push(b.head);
    AX.push(unit(add(mul(h, -sb), mul(up, -cb)))); UP.push(up); HD.push(h);
  }
  const vel = E.map((_, i) => { const a = E[Math.max(0, i - 1)], c = E[Math.min(n - 1, i + 1)], k = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * dt0; return mul(sub(c, a), 1 / k); });
  const at = (t) => {
    const f = clamp(t / dt0, 0, n - 1.0001), i = Math.floor(f), u = f - i;
    const p0 = E[i], p1 = E[i + 1], m0 = mul(vel[i], dt0), m1 = mul(vel[i + 1], dt0);
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    const d00 = 6 * u * u - 6 * u, d10 = 3 * u * u - 4 * u + 1, d01 = -6 * u * u + 6 * u, d11 = 3 * u * u - 2 * u;
    const pos = [0, 1, 2].map((k) => h00 * p0[k] + h10 * m0[k] + h01 * p1[k] + h11 * m1[k]);
    const v = [0, 1, 2].map((k) => (d00 * p0[k] + d10 * m0[k] + d01 * p1[k] + d11 * m1[k]) / dt0);
    return { pos, v, i: Math.round(f) };
  };
  return { E, H, S, AX, UP, HD, at, dt0 };
}

// elastic segment with the series shock spring, plus structural damping
function segTension(dist, L0, relVel, mEff) {
  const Lk = Math.max(0.3, L0), kl = LINE.EA / Lk, e = dist - L0;
  if (e <= 0) return 0;
  const ks = LINE.kShock, Tb = ks * LINE.strokeShock, e1 = Tb / ks + Tb / kl;
  let T, k;
  if (e < e1) { k = (ks * kl) / (ks + kl); T = e * k; } else { k = kl; T = Tb + (e - e1) * kl; }
  return Math.max(0, T + 2 * LINE.zeta * Math.sqrt(k * mEff) * relVel);
}

export function runCore(params, input) {
  const p = resolveP(params);
  const m = p.m, F = p.geo;
  const sk = input.sk, tanS = sk.tanS;
  const T = input.duration ?? sk.duration;
  const dt = input.dt ?? p.dt, SDT = 0.02, every = Math.max(1, Math.round(SDT / dt)), cEvery = Math.max(1, Math.round(p.ctrlDt / dt));
  const nS = Math.floor(T / SDT + 1e-9) + 1, nSteps = (nS - 1) * every;
  const wc = input.wind || { mean: [0, 0, 0], intensity: 0.15, seed: 1 };
  const wind = makeWind({ Lu: 28, ...wc });
  const seed = input.seed ?? (wc.seed || 1) * 31 + 7;
  const rng = mulberry32(seed), gn = () => gaussian(rng) * p.noise;
  const BT = bodyTrack(sk, T + 0.1, 0.02, p.stow && !p.eyeletSacrum); // eyeletSacrum: sensitivity with the I9 sacrum exit
  const zSnow = (x) => -x * tanS;
  // ---- detector (pack IMU+GNSS+baro), open loop on the pack motion
  const tr = input.detTrace || skiTraceOf(sk, { seed });
  const det = input.detector || runDetector(tr, { seed: seed + 3 });
  const detAt = (t) => Math.min(det.trace.state.length - 1, Math.max(0, Math.round(t / tr.dt)));
  const fallT = det.ev.fall.length ? det.ev.fall[0] : null;
  // ---- shared wind estimate for the gates (10 s trailing mean at the pack + seeded bias) + sensitivity offset
  const wEst0 = windEstimate(wind, (t) => BT.at(t).pos, { seed: wc.seed || 1 });
  const wEst = (t) => { const w = wEst0(t); return [w[0] + p.wBias, w[1], w[2]]; };
  const sErr = { tScale: 1 + gn() * SENS.tension.scale, tBias: gn() * SENS.tension.bias, lScale: 1 + gn() * SENS.length.scale, ang: gn() * (SENS.ahrs.tiltDeg + SENS.lineAngle.biasDeg) * D2R };
  const capRng = mulberry32(seed * 7 + 13);
  const riding = sk.col.riding || null;
  const ridingAt = (t) => (riding ? riding[Math.min(riding.length - 1, Math.round(t / sk.sampleDt))] > 0 : skierAt(sk, t).speed > 2);
  // ---- state
  let mode = MODE.DOCKED, modeT = 0;
  let pF = null, vF = null, hk = [-1, 0, 0], collapsed = true, colTimer = 0, infTimer = 0, openT = -9;
  let Lout = 0, vr = 0, dep = 0, depCmd = 0, braked = true, broken = false;
  let vcmd = 0, depI = 0, gateT = 0, lowT = 0, lowLiftT = 0, snowT = 0, launchT0 = 0, capTries = 0, payBack = 0, manualT = 0;
  let tStop = null, stopReason = null, abortT = 0, chargeOk = true, lastLaunchEnd = -99;
  const tDel = new Delay(SENS.tension.lat), gDel = new Delay(SENS.gnss.lat);
  let Tm = 0, vRiderM = 0, latAccM = 0, elevM = 0, vAppM = 0, twM = 0, twLP = 0, twT = 0, vMean = [0, 0], cwLP = 0, courseU = [1, 0], swingT = 0, cM = [0, 0, 1], phiM = Math.PI / 2;
  // ---- outputs (20 ms)
  const O = {};
  const KEYS = ['mode', 'fx', 'fy', 'fz', 'fvx', 'fvy', 'fvz', 'bfx', 'bfy', 'bfz', 'bux', 'buy', 'buz', 'ex', 'ey', 'ez', 'evx', 'evy', 'evz', 'hx', 'hy', 'hz',
    'sx', 'sy', 'sz', 'ax', 'ay', 'az', 'L', 'T', 'Tm', 'va', 'alpha', 'beta', 'CL', 'CD', 'dep', 'elev', 'elevM', 'vr', 'Pel', 'snow', 'riding', 'collapsed', 'sag1x', 'sag1y', 'sag1z',
    'Fbx', 'Fby', 'Fbz', 'F50', 'capWin', 'cut', 'vApp', 'vAppM', 'wx', 'wy', 'wz', 'noLift', 'Ltgt', 'launchBack'];
  for (const k of KEYS) O[k] = new Float64Array(nS).fill(NaN);
  const events = [];
  const ev = (t, type, severity, zh, en, extra = {}) => events.push({ t: +t.toFixed(3), type, severity, zh, en, ...extra });
  const met = { launches: 0, launchFails: 0, launchTimes: [], docks: [], captures: [], crashes: 0, collapses: 0, collapseS: 0, Ebatt: 0, PpeakW: 0, manual: 0, refuse: { wind: 0, tailwind: 0, detect: 0, lockout: 0, busy: 0, straight: 0 }, flagOuts: 0, twRetrieves: 0, swingGuardS: 0, parks: [], groundLaunches: 0, refuseS: 0, brokeAt: null, Tmax: 0, snowS: 0 };
  const fBuf = new Float64Array(Math.max(1, Math.round(0.05 / dt)) * 3); const nb = fBuf.length / 3; let fI = 0; const fSum = [0, 0, 0]; let f50 = 0;
  let wFc = null, wMid = null, e = BT.at(0), sag = [0, 0, 0], Tline = 0, CL = 0, CD = 0, alpha = 0, beta = 0, Va = 0, vApp = 0;
  let Ltgt = p.Lfilm, vAppS = 0, gateNoLift = false, launchBackT = -99;
  // line-length schedule on the smoothed (2 s) estimated apparent wind
  const schedL = () => (p.Lsched ? clamp(p.Lfilm + p.Lk * (vAppS - p.vRef), p.LminS, p.LmaxS) : p.Lfilm);
  const setMode = (mm, t) => { mode = mm; modeT = t; };
  const startRetrieve = (t, why) => { setMode(MODE.RETRIEVE, t); stopReason = why; if (tStop == null) tStop = t; ev(t, 'retrieve', 'info', `回收（${why}）`, `Retrieve (${why})`); };

  for (let step = 0; step <= nSteps; step++) {
    const t = step * dt;
    e = BT.at(t);
    const ib = Math.min(BT.E.length - 1, Math.round(t / BT.dt0));
    const ax = BT.AX[ib];
    // ===================================================== truth physics
    let Fexit = [0, 0, 0];
    Tline = 0;
    const flying = pF && mode !== MODE.DOCKED;
    if (flying) {
      if (step % 5 === 0 || !wFc) {
        wFc = wind(t, pF);
        // rider wake (I10, ASSUMED): behind the back the air is partly entrained with the rider — velocity deficit
        // 70 % at the back, recovering over ≈1.2 m behind, ±0.45 m wide, centred 0.4 m above the exit (bluff-body wake
        // class; e.g. cyclist drafting studies, Blocken et al. 2018 J. Wind Eng. 179) — this is what the launch from the
        // back has to get through
        if (p.wake) {
          const h = BT.HD[ib], rel = sub(pF, e.pos), db = -(rel[0] * h[0] + rel[1] * h[1]), lat = rel[0] * -h[1] + rel[1] * h[0], dz = rel[2] - 0.4;
          if (db > -0.1) { const f = 0.7 * Math.exp(-Math.max(0, db) / 1.2) * Math.exp(-((lat / 0.45) ** 2)) * Math.exp(-((dz / 0.6) ** 2)); wFc = add(wFc, mul(sub(e.v, wFc), f)); }
        }
      }
      const vaV = sub(vF, wFc); Va = len(vaV) || 1e-6;
      const uAir = mul(vaV, -1 / Va); // direction the air moves past the kite
      const ch = sub(pF, e.pos), dist = len(ch), c = unit(ch, [0, 0, 1]);
      // line tension (elastic) unless broken
      if (!broken) {
        const relV = dot(sub(vF, e.v), c);
        Tline = segTension(dist, Math.max(0.02, Lout), relV, m);
      }
      // kite heading (keel weathervane lag) and sideslip
      // nose target: the keel weathervanes the nose into the airflow component in the sail plane; near the window
      // centre (line ∥ airflow) that component vanishes and the bridle/weight keep the nose "up the window" (toward
      // the zenith perpendicular to the airflow): blend weight 0.5 (ASSUMED)
      const zW = unit(sub([0, 0, 1], mul(uAir, uAir[2])));
      const nT = unit(add(mul(sub(vaV, mul(c, dot(vaV, c))), 1 / Va), mul(sub(zW, mul(c, dot(zW, c))), 0.5)), hk);
      hk = unit(add(hk, mul(sub(nT, hk), Math.min(1, dt / F.yawTau))));
      hk = unit(sub(hk, mul(c, dot(hk, c))), nT);
      beta = acos(dot(hk, nT));
      const phi = acos(dot(c, uAir));
      const db = (F.deltaPowerDeg - dep * F.deltaDepowerDeg) * D2R;
      alpha = Math.PI / 2 - phi + db;
      const q = 0.5 * RHO * Va * Va;
      // membrane collapse / re-inflation
      const onSnow = pF[2] <= zSnow(pF[0]) + 0.04;
      // flagging: the last 5 % of the depower stroke pulls the trailing edge up to the apex and the sail flags (cannot
      // hold shape at any AoA) — a bridled kite on full trim depower otherwise still flies at the window edge (≈7° AoA)
      if (dep > 0.95 && !collapsed) { collapsed = true; colTimer = 0; infTimer = 0; }
      if (!collapsed) {
        const bad = alpha < F.colAlphaDeg * D2R || beta > F.colBetaDeg * D2R || q < F.colQ || (Tline < 0.05 && !broken && dist < Lout - 0.05);
        colTimer = bad ? colTimer + dt : 0;
        if (colTimer > F.colT) { collapsed = true; colTimer = 0; infTimer = 0; if (mode === MODE.FLY) { met.collapses++; ev(t, 'collapse', 'warn', '风筝塌翼', 'Sail collapsed'); } }
      } else {
        const good = alpha > F.infAlphaLoDeg * D2R && alpha < F.infAlphaHiDeg * D2R && beta < F.infBetaDeg * D2R && q > F.infQ && Lout > 0.6 && dep < 0.9 && (!onSnow || q > 2 * F.infQ);
        infTimer = good ? infTimer + dt : 0;
        if (infTimer > F.infT) { collapsed = false; infTimer = 0; openT = t; }
      }
      let S = F.S;
      if (collapsed) { CL = 0; CD = F.colCD; S = F.S * F.colSfrac; }
      else {
        [CL, CD] = aeroCoef(alpha, F, p.clmaxScale, p.cd0Scale);
        // the membrane opens progressively over ≈0.3 s (ASSUMED): blend from the drogue to the open sail
        const o = clamp((t - openT) / 0.3, 0, 1);
        if (o < 1) { CL *= o; CD = CD * o + F.colCD * F.colSfrac * (1 - o); }
      }
      // lift ⟂ airflow on the nose side (the sail's upper surface faces away from the bridle)
      const lhat = unit(sub(hk, mul(uAir, dot(hk, uAir))), [0, 0, 1]);
      let Fa = add(mul(lhat, q * S * CL), mul(uAir, q * (S * CD + F.podCdA + (p.tail ? TAIL.CdA * p.tailScale : 0))));
      // line weight + cross-flow drag (half to the kite), sag
      if (!broken) {
        if (step % 10 === 0 || !wMid) wMid = wind(t, mul(add(e.pos, pF), 0.5));
        const Lr = Math.max(0.05, Lout), vMid = sub(mul(add(e.v, vF), 0.5), wMid), vn = sub(vMid, mul(c, dot(vMid, c)));
        const ql = add([0, 0, -LINE.lambda * Lr * G], mul(vn, -0.5 * RHO * LINE.Cd * (LINE.d + LINE.dDep) * Lr * len(vn)));
        Fa = add(Fa, mul(ql, 0.5));
        const qn = sub(ql, mul(c, dot(ql, c)));
        const sagM = Tline > 0.05 ? Math.min(0.5 * dist, (len(qn) * Lr) / (8 * Tline)) : Math.min(0.3 * Lr, 0.5 * dist);
        sag = mul(unit(qn, [0, 0, -1]), sagM);
        Fexit = add(mul(c, Tline), mul(ql, 0.5));
      } else sag = [0, 0, 0];
      const Ftot = add(add(Fa, mul(c, -Tline)), [0, 0, -m * G]);
      vF = add(vF, mul(Ftot, dt / m));
      pF = add(pF, mul(vF, dt));
      // snow contact
      const zs = zSnow(pF[0]);
      if (pF[2] < zs + 0.03) {
        const nrm = unit([tanS, 0, 1]);
        pF = add(pF, mul(nrm, (zs + 0.03 - pF[2]) * nrm[2]));
        const vn = dot(vF, nrm);
        if (vn < 0) { if (mode === MODE.FLY && vn < -2) { met.crashes++; ev(t, 'snow', 'warn', '风筝触雪', 'Kite hit the snow'); } vF = sub(vF, mul(nrm, vn)); }
        const vt = len(vF); if (vt > 1e-6) vF = mul(vF, Math.max(0, 1 - (0.3 * G * dt) / vt));
        snowT += dt; if (mode === MODE.FLY) met.snowS += dt;
      } else snowT = 0;
      if (mode === MODE.FLY && collapsed) met.collapseS += dt;
    }
    // ---- weak link / body force (50 ms mean)
    for (let k = 0; k < 3; k++) { fSum[k] += Fexit[k] - fBuf[fI * 3 + k]; fBuf[fI * 3 + k] = Fexit[k]; }
    fI = (fI + 1) % nb; f50 = Math.max(f50, len(fSum) / nb);
    const F50now = len(fSum) / nb;
    met.Tmax = Math.max(met.Tmax, Tline);
    if (flying && !broken && F50now > LINE.weakLinkN) { broken = true; met.brokeAt = t; setMode(MODE.FREE, t); ev(t, 'weaklink', 'fail', `弱连接断开（${F50now.toFixed(0)} N）`, `Weak link released (${F50now.toFixed(0)} N)`); }
    // ---- reel (main drum)
    if (!broken && mode !== MODE.DOCKED) {
      const hold = Math.abs(vcmd) < 1e-6 && Math.abs(vr) < 0.05;
      let Fm;
      if (hold && Tline < LINE.clutchN) { vr = 0; Fm = Tline; braked = true; }
      else {
        braked = false;
        const vc = clamp(vcmd, -REEL.vNL * 0.9, REEL.vNL * 0.9);
        Fm = clamp(Tline - (REEL.mEff * (vc - vr)) / 0.05, -REEL.Fmax, REEL.Fmax);
        if (vr < 0 && vr < -REEL.vNL) Fm = Math.min(Fm, Tline);
        if (hold) Fm = LINE.clutchN; // slip clutch
        const fr = Math.abs(vr) > 1e-4 ? REEL.fric * Math.sign(vr) : 0;
        vr += ((Tline - Fm - fr) / REEL.mEff) * dt;
        if (Lout <= 0 && vr < 0) vr = 0;
        const P = Math.max(0, Fm * -vr) / REEL.eff + REEL.runW;
        met.Ebatt += P * dt; met.PpeakW = Math.max(met.PpeakW, P);
      }
      Lout = Math.max(0, Lout + vr * dt);
      if (Lout > LINE.Ldrum) { Lout = LINE.Ldrum; vr = Math.min(0, vr); }
    }
    // depower drum (rate limited)
    dep += clamp(depCmd - dep, -REEL.depRate / 0.16 * dt, REEL.depRate / 0.16 * dt);
    // ===================================================== sensors + control (100 Hz)
    if (step % cEvery === 0) {
      tDel.push(t, Tline); const Td = tDel.get(t) ?? 0;
      Tm = Math.max(0, Td * sErr.tScale + sErr.tBias + gn() * SENS.tension.sigma);
      const s = skierAt(sk, t);
      gDel.push(t, [s.vel[0], s.vel[1], s.lat]); const gd = gDel.get(t) || [0, 0, 0];
      const vR = [gd[0] + gn() * SENS.gnss.sigmaV, gd[1] + gn() * SENS.gnss.sigmaV];
      vRiderM = Math.hypot(vR[0], vR[1]);
      latAccM = Math.abs(gd[2] ?? 0) + Math.abs(gn() * 0.5);
      const we = wEst(t);
      vAppM = Math.hypot(we[0] - vR[0], we[1] - vR[1]); vAppS = vAppS === 0 ? vAppM : vAppS + (vAppM - vAppS) * Math.min(1, p.ctrlDt / 2);
      // estimated along-track tailwind (shared wind estimate · GNSS course; the fall line when slow)
      // mean course = GNSS velocity low-passed over 5 s (carving swings the instantaneous course ±45°)
      { vMean[0] += (vR[0] - vMean[0]) * p.ctrlDt / 5; vMean[1] += (vR[1] - vMean[1]) * p.ctrlDt / 5; const sp = Math.hypot(vMean[0], vMean[1]); const ux = sp > 1.5 ? vMean[0] / sp : 1, uy = sp > 1.5 ? vMean[1] / sp : 0; twM = we[0] * ux + we[1] * uy; twLP += (twM - twLP) * Math.min(1, p.ctrlDt / 2); cwLP += (Math.abs(-we[0] * uy + we[1] * ux) - cwLP) * Math.min(1, p.ctrlDt / 2); courseU = [ux, uy]; }
      { const wt = wind(t, e.pos), vt = s.vel; vApp = Math.hypot(wt[0] - vt[0], wt[1] - vt[1]); }
      if (pF) {
        const c = unit(sub(pF, e.pos)), sA = SENS.lineAngle.sigmaDeg * D2R;
        cM = unit([c[0] + gn() * sA, c[1] + gn() * sA, c[2] + sErr.ang + gn() * sA]);
        elevM = Math.asin(clamp(cM[2], -1, 1));
        // estimated airflow direction past the kite (wind estimate − GNSS rider velocity incl. the slope descent) and the
        // resulting AoA estimate from the bridle geometry: the depower may not push it below the collapse margin
        const uE = unit([we[0] - vR[0], we[1] - vR[1], -s.vel[2] + gn() * 0.25]); // GNSS vz σ 0.25
        phiM = acos(dot(cM, uE));
      }
      const Lm = Lout * sErr.lScale;
      const di = detAt(t), detRide = det.trace.state[di] === 1, lock = det.trace.lock[di] === 1;
      const stopEv = det.ev.stop.some((x) => x <= t && x > t - p.ctrlDt - 1e-9);
      const fallEv = fallT != null && fallT <= t && fallT > t - p.ctrlDt - 1e-9;
      if (fallEv && mode !== MODE.DOCKED && mode !== MODE.FREE) { setMode(MODE.ABORT, t); abortT = t; ev(t, 'fall', 'warn', '检测到摔倒：全泄力、放松线', 'Fall detected: full depower, free-spool'); }
      const ride = ridingAt(t);
      switch (mode) {
        case MODE.PARK:
        case MODE.DOCKED: {
          // PARK (I10, back stow): the flagged kite waits on the snow ≈Lpark behind; it relaunches from there (ground launch)
          if (mode === MODE.PARK) { depCmd = 1; vcmd = Lm < p.Lpark - 0.3 && Tm < 3 ? 0.8 : Lm > p.Lpark + 0.3 ? -0.8 : 0; } else { vcmd = 0; depCmd = 0; }
          const gWind = vAppM >= p.vGate && twLP <= p.twMax && cwLP <= p.cwMax, gStraight = latAccM <= p.straightAcc; // I9 tailwind envelope
          gateNoLift = !gWind;
          if (detRide && !lock && gWind && gStraight && chargeOk && t - lastLaunchEnd > 2) gateT += p.ctrlDt; else gateT = 0;
          if (ride) {
            if (!detRide) met.refuse.detect += p.ctrlDt; else if (lock) met.refuse.lockout += p.ctrlDt; else if (twLP > p.twMax || cwLP > p.cwMax) met.refuse.tailwind += p.ctrlDt; else if (!gWind) met.refuse.wind += p.ctrlDt; else if (!gStraight || gateT < p.gateT) met.refuse.straight += p.ctrlDt;
          }
          if (gateT >= p.gateT && mode === MODE.PARK) {
            setMode(MODE.LAUNCH, t); launchT0 = t; met.launches++; met.groundLaunches++; gateT = 0; tStop = null; capTries = 0;
            ev(t, 'launch', 'info', `从雪面再起飞（估计相对风 ${vAppM.toFixed(1)} m/s）`, `Relaunch from the snow (est. apparent wind ${vAppM.toFixed(1)} m/s)`);
          } else if (gateT >= p.gateT) {
            setMode(MODE.LAUNCH, t); launchT0 = t; met.launches++; gateT = 0; tStop = null; capTries = 0;
            if (p.stow) {
              // back stow: the latches release and the OPEN kite starts lying on the back (apex at the eyelet, sail centre
              // seatU above it); it is in the rider's wake until it is paid out behind
              const up = BT.UP[ib], h = BT.HD[ib];
              pF = add(add(e.pos, mul(up, 0.02)), mul(h, -0.05)); vF = [...e.v]; hk = [...up]; collapsed = false; openT = t - 1; Lout = 0.12; vr = 0;
              launchBackT = t; // analysis models the peel-off of the stowed sail from this instant (review R2-01)
            } else { pF = add(e.pos, mul(BT.AX[ib], 0.08)); vF = [...e.v]; hk = unit([-BT.HD[ib][0], -BT.HD[ib][1], 0]); hk = mul(hk, -1); collapsed = true; Lout = 0.1; vr = 0; }
            ev(t, 'launch', 'info', `自动放飞（估计相对风 ${vAppM.toFixed(1)} m/s）`, `Auto launch (est. apparent wind ${vAppM.toFixed(1)} m/s)`);
          }
          break;
        }
        case MODE.LAUNCH: {
          Ltgt = schedL();
          // depower feed-forward from the estimated apparent wind (CR ≈ 1.0 powered … ≈0.3 at dep 0.85), then the PI
          // streaming phase (SIM-033 iteration I8, video review): the sail stays flagged (full depower) while the
          // airflow drags the bundle out low behind to Lstream; only then it is powered to open and climb, so the
          // opening and the climb happen ≥Lstream from the body instead of beside the head
          { const CRn = p.Tset / Math.max(1, 0.5 * RHO * vAppM * vAppM * F.S); const d0 = clamp((1 - CRn) / 0.8, 0, p.depFlyMax); const eT = Tm - p.Tset; const streaming = !p.stow && Lm < p.Lstream; depI = streaming ? d0 : clamp(depI + 0.04 * eT * p.ctrlDt, 0, p.depFlyMax); depCmd = streaming ? 1 : Tm > 22 ? 1 : clamp(depI + 0.03 * eT, 0, p.depFlyMax); }
          // tension-metered pay-out: the drogue/kite pulls line out, never pushed (≤ vLaunch)
          // under a strong pull let line run (classic kite launch): up to 5 m/s above 12 N, which lowers the kite's airspeed
          vcmd = Lm < Ltgt ? (Tm > 12 ? Math.min(5, p.vLaunch + (Tm - 12) * 0.5) : p.vLaunch * clamp((Tm - 0.15) / 1.0, 0, 1)) : Tm > 18 && Lm < p.LmaxS + 2 ? Math.min(4, (Tm - 18) * 0.4) : 0;
          if (Lm >= Ltgt * 0.97 && !collapsed) { setMode(MODE.FLY, t); met.launchTimes.push(t - launchT0); ev(t, 'fly', 'info', `起飞完成（${(t - launchT0).toFixed(1)} s）`, `Launch complete (${(t - launchT0).toFixed(1)} s)`); }
          else if (t - launchT0 > 12 || (snowT > 2.5 && t - launchT0 > 3) || (stopEv) || vAppM < p.vGateOff - 0.4) { met.launchFails++; ev(t, 'launchfail', 'warn', '起飞失败，收回', 'Launch failed, retrieving'); startRetrieve(t, 'launch-fail'); }
          break;
        }
        case MODE.FLY: {
          const depA = clamp((Math.PI / 2 - phiM + F.deltaPowerDeg * D2R - p.aMarginDeg * D2R) / (F.deltaDepowerDeg * D2R), 0, p.depFlyMax);
          // depower PI on tension (fast), reel: length management (slow, "fly it like a kite")
          const eT = Tm - p.Tset;
          depI = clamp(depI + 0.04 * eT * p.ctrlDt, 0, depA);
          if (Tm > 30 && depCmd < 1) met.flagOuts++;
          depCmd = Tm > 30 ? 1 : clamp(depI + 0.03 * eT, 0, depA); // > 30 N: emergency full depower (collapse)
          // I10 elevation cap (user rule "line only briefly within 1 m"): above elevCap the line from the rear eyelet passes
          // <1 m from the helmet; less depower = higher AoA = lower L/D = lower flying angle (costs some pull margin)
          if (p.elevCap && elevM > p.elevCap * D2R && Tm < 30) { const cut = clamp((elevM / D2R - p.elevCap) * 0.04, 0, 1); depCmd = clamp(depCmd - cut, 0, depA); depI = clamp(depI - cut * 0.02, 0, depA); }
          if (Tm < p.Tlo) lowLiftT += p.ctrlDt; else lowLiftT = Math.max(0, lowLiftT - 2 * p.ctrlDt);
          // I10 line-length schedule (user: higher and farther when fast and windy, closer and lower in light air)
          Ltgt = schedL();
          if (lowLiftT > 0.3 && Lm > Math.min(p.Lmin, p.LminS)) vcmd = -1.0; // lift deficit: reel in (adds apparent wind)
          else if (depCmd >= depA - 0.02 && Tm > p.Tset * 1.6 && Lm < Ltgt + 2) vcmd = 0.4; // surplus: pay out
          else if (Math.abs(Lm - Ltgt) > 0.3 && Tm > p.Tlo) vcmd = 0.5 * Math.sign(Ltgt - Lm);
          else vcmd = 0;
          // I11 swing guard (review R2-08 hypothesis): the rear-eyelet line is ≥1 m from the helmet only while the kite is
          // within ≈±30–40° of straight behind; when the measured line azimuth leaves ±swingDeg of the course and the line
          // is steep, 1 = reel in at 1 m/s (shorter radius, back into the window), 2 = extra depower 0.3
          if (p.swingGuard) {
            const hz = Math.hypot(cM[0], cM[1]) || 1, az = Math.acos(clamp(-(cM[0] * courseU[0] + cM[1] * courseU[1]) / hz, -1, 1)) / D2R;
            swingT = az > p.swingDeg && elevM > 45 * D2R ? swingT + p.ctrlDt : 0;
            if (swingT > 0.1) { met.swingGuardS += p.ctrlDt; if (p.swingGuard === 1 && Lm > p.LminS) vcmd = -1.0; else if (p.swingGuard === 2) depCmd = clamp(depCmd + 0.3, 0, depA); }
          }
          if (vAppM < p.vGateOff) lowT += p.ctrlDt; else lowT = 0;
          twT = twLP > p.twMax || cwLP > p.cwMax ? twT + p.ctrlDt : 0;
          if (stopEv) startRetrieve(t, 'stop');
          else if (twT > 1.0) { met.twRetrieves++; startRetrieve(t, 'tailwind'); }
          else if (lowT > 1.0) startRetrieve(t, 'low-wind');
          else if (snowT > 1.0) startRetrieve(t, 'on-snow');
          else if (p.preRetrieve && input.preDock && input.preDock.some((x) => t >= x && t < x + p.ctrlDt + 1e-9)) startRetrieve(t, 'geofence');
          break;
        }
        case MODE.ABORT: {
          depCmd = 1; vcmd = Tm > 3 ? 2.5 : 0; // free-spool against tension
          if (t - abortT > 3 && vRiderM < 1.5) startRetrieve(t, 'after-fall');
          break;
        }
        case MODE.RETRIEVE:
        case MODE.TOW: {
          depCmd = 1;
          const onSnow = elevM < 8 * D2R && Lm < 12;
          if (onSnow && mode === MODE.RETRIEVE) setMode(MODE.TOW, t);
          // brake-then-retrieve: never pull a high kite in along the line (reel-in raises its AoA, it climbs overhead
          // and comes down the line past the head). While the line is still steep (> elevLow) only take up slack and
          // let the collapsed sail sink; fast reel-in once it is low behind or after retHold s.
          const high = elevM > p.elevLow * D2R && t - modeT < p.retHold && mode === MODE.RETRIEVE;
          let v = high ? (Tm < 0.4 ? -1.0 : Tm > 4 ? 0.6 : 0) : mode === MODE.TOW ? -p.vTow : -p.vRet;
          // tailwind-stop strategies (I9 study): 1 = fast pull-down at once while the rider still slides (kite still
          // behind); 2 = brake: hold length, no slack take-up, until low; 3 = pay out while high (kite lands far)
          const tailStop = p.twStop && twLP > p.twStopMin && mode === MODE.RETRIEVE && stopReason === 'stop'; // only real stops: an envelope retrieve while riding at speed would add the pull to the rider speed (KE)
          if (tailStop && p.twStop === 1 && t - modeT < 3) v = -Math.min(REEL.vNL * 0.9, p.vPull);
          else if (tailStop && p.twStop === 2 && high) v = 0;
          else if (tailStop && p.twStop === 3 && high) v = 1.5;
          if (Tm > 25) v = -0.5; // force guard
          if (p.tailFree && ride === false && vAppM < 1.5 && Tm < 0.3) v = 0;
          vcmd = v;
          if (Lm < p.capL) setMode(MODE.CAPTURE, t);
          break;
        }
        case MODE.CAPTURE: {
          depCmd = 1;
          if (payBack > 0) { vcmd = 1.0; payBack -= p.ctrlDt; break; }
          vcmd = -p.vCap;
          // back stow: the sail can only be laid onto the back when the line leaves the eyelet backward (kite behind, not
          // hanging below); if the measured line angle says it cannot dock, park it on the snow instead of trying
          if (p.stow) {
            const h = BT.HD[ib], up = BT.UP[ib], axB = unit(add(mul(h, -Math.cos(BACKSTOW.axisUpDeg * D2R)), mul(up, Math.sin(BACKSTOW.axisUpDeg * D2R))));
            const angM = acos(dot(cM, axB)) / D2R;
            if (Lm < 1.0 && angM > BACKSTOW.angZero && !detRide && vRiderM < 1.5) { setMode(MODE.PARK, t); met.parks.push({ t, tStop }); ev(t, 'park', 'info', '无法落到背上：在身后雪面待机', 'Cannot lay it onto the back: parked on the snow behind'); tStop = null; capTries = 0; break; }
          }
          if (Lout <= 0.12) {
            let vRel = len(sub(vF, e.v)), ang, pr;
            if (p.stow) {
              // back stow: the line must leave the eyelet backward (dock axis = back, tilted 20° up) so the sail lies down
              // onto the back seats; ASSUMED: full ≤45°, 0 at 80°, base 0.9, same speed term
              const h = BT.HD[ib], up = BT.UP[ib], axB = unit(add(mul(h, -Math.cos(BACKSTOW.axisUpDeg * D2R)), mul(up, Math.sin(BACKSTOW.axisUpDeg * D2R))));
              ang = acos(dot(unit(sub(pF, e.pos), axB), axB)) / D2R;
              const fa = ang <= BACKSTOW.angFull ? 1 : ang <= BACKSTOW.angZero ? 1 - (ang - BACKSTOW.angFull) / (BACKSTOW.angZero - BACKSTOW.angFull) : 0;
              pr = (captureProb(vRel, 0, p.capScale) / 0.95) * BACKSTOW.P0 * fa;
            } else { ang = Math.max(0, acos(dot(unit(sub(pF, e.pos), ax), ax)) / D2R - (p.swivel ? p.swivelDeg ?? GEOM.swivelDeg : 0)); pr = captureProb(vRel, ang, p.capScale); }
            capTries++;
            const ok = capRng() < pr;
            met.captures.push({ t, vRel, ang, ok });
            if (ok) {
              const dockTime = tStop != null ? t - tStop : NaN;
              met.docks.push({ t, tStop, dockTime, tries: capTries, manual: false, reason: stopReason });
              ev(t, 'dock', 'info', `入舱锁定（第 ${capTries} 次，${vRel.toFixed(2)} m/s，${ang.toFixed(0)}°）`, `Docked (try ${capTries}, ${vRel.toFixed(2)} m/s, ${ang.toFixed(0)}°)`);
              setMode(MODE.DOCKED, t); pF = null; vF = null; Lout = 0; vr = 0; vcmd = 0; lastLaunchEnd = t; capTries = 0; tStop = null; depI = 0;
            } else if (p.stow && capTries >= 2 && !detRide && vRiderM < 1.5) {
              setMode(MODE.PARK, t); met.parks.push({ t, tStop }); ev(t, 'park', 'info', '两次未落到背上：在身后雪面待机', '2 failed back docks: parked on the snow behind'); tStop = null; capTries = 0;
            } else if (capTries >= 3) {
              setMode(MODE.MANUAL, t); manualT = t; met.manual++; ev(t, 'manual', 'warn', '三次捕获失败：提示手动收纳', '3 failed captures: manual stow requested');
            } else { payBack = 0.8; ev(t, 'capfail', 'warn', `捕获失败（${vRel.toFixed(2)} m/s，${ang.toFixed(0)}°），重试`, `Capture failed (${vRel.toFixed(2)} m/s, ${ang.toFixed(0)}°), retry`); }
          }
          break;
        }
        case MODE.MANUAL: {
          vcmd = 0; depCmd = 1;
          if (!detRide && vRiderM < 1 && t - manualT > 20) { /* detector, not truth (review RV-10) */ met.docks.push({ t, tStop, dockTime: tStop != null ? t - tStop : NaN, tries: capTries, manual: true }); setMode(MODE.DOCKED, t); pF = null; vF = null; Lout = 0; vr = 0; lastLaunchEnd = t; capTries = 0; tStop = null; }
          break;
        }
        case MODE.FREE: { vcmd = 0; break; }
        default: break;
      }
    }
    // ===================================================== outputs
    if (step % every === 0) {
      const i = step / every;
      O.mode[i] = mode;
      O.ex[i] = e.pos[0]; O.ey[i] = e.pos[1]; O.ez[i] = e.pos[2]; O.evx[i] = e.v[0]; O.evy[i] = e.v[1]; O.evz[i] = e.v[2];
      const H = BT.H[ib]; O.hx[i] = H[0]; O.hy[i] = H[1]; O.hz[i] = H[2];
      const Sx = BT.S[ib]; O.sx[i] = Sx[0]; O.sy[i] = Sx[1]; O.sz[i] = Sx[2];
      O.ax[i] = ax[0]; O.ay[i] = ax[1]; O.az[i] = ax[2];
      O.L[i] = Lout; O.T[i] = Tline; O.Tm[i] = Tm; O.dep[i] = dep; O.vr[i] = vr; O.riding[i] = ridingAt(t) ? 1 : 0;
      O.F50[i] = len(fSum) / nb; O.Fbx[i] = fSum[0] / nb; O.Fby[i] = fSum[1] / nb; O.Fbz[i] = fSum[2] / nb;
      // user envelope (SIM-034): riding time when the system does not fly because lift is insufficient (gate refusal on
      // apparent wind / tailwind, or a low-wind / tailwind retrieve in progress)
      O.noLift[i] = (mode === MODE.DOCKED && gateNoLift && vRiderM > 4) || ((mode === MODE.RETRIEVE || mode === MODE.TOW || mode === MODE.CAPTURE) && (stopReason === 'low-wind' || stopReason === 'tailwind')) ? 1 : 0;
      O.Ltgt[i] = Ltgt; O.launchBack[i] = launchBackT;
      O.capWin[i] = mode === MODE.CAPTURE ? 1 : 0; O.cut[i] = broken ? 1 : 0; O.vApp[i] = vApp; O.vAppM[i] = vAppM; O.elevM[i] = elevM / D2R;
      if (pF) {
        O.fx[i] = pF[0]; O.fy[i] = pF[1]; O.fz[i] = pF[2]; O.fvx[i] = vF[0]; O.fvy[i] = vF[1]; O.fvz[i] = vF[2];
        const c = unit(sub(pF, e.pos));
        O.bfx[i] = hk[0]; O.bfy[i] = hk[1]; O.bfz[i] = hk[2]; O.bux[i] = c[0]; O.buy[i] = c[1]; O.buz[i] = c[2];
        O.va[i] = Va; O.alpha[i] = alpha / D2R; O.beta[i] = beta / D2R; O.CL[i] = CL; O.CD[i] = CD; O.collapsed[i] = collapsed ? 1 : 0;
        O.elev[i] = Math.asin(clamp(c[2], -1, 1)) / D2R; O.snow[i] = zSnow(pF[0]);
        O.sag1x[i] = sag[0]; O.sag1y[i] = sag[1]; O.sag1z[i] = sag[2];
        if (wFc) { O.wx[i] = wFc[0]; O.wy[i] = wFc[1]; O.wz[i] = wFc[2]; }
      }
    }
  }
  return { O, n: nS, SDT, p, sk, tanS, events, met, duration: T, det, fallT };
}
