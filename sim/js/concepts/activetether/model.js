// activetether physics + sensors + autonomy (SIM-032 phase 2). Numerical-uncalibrated simulation.
//
// TRUTH (read only by the physics, the sensor models and the judging code — never by a controller):
//  • flyer: 3-DOF point mass + reduced-order rotational modes: line-referenced pitch θ (2nd-order bridle/pitch
//    mode driven by a rate-limited servo), bank φ (2nd-order roll mode driven by a servo, plus a turbulence-driven
//    roll disturbance), airbrake/depower b (first-order). AoA = θ − asin(u·n) when the line is taut (bridled wing),
//    relaxing to the free trim when slack; linear polar to stall + flat-plate post-stall blend (design.js aeroCoef).
//    Lift ⟂ airflow in the plane (line, airflow) rotated by the bank (as science_control lib/tether.mjs).
//  • line: straight elastic segments (EA/L) with a fairlead shock spring (150 N/m, 0.12 m stroke) in series at the
//    exit, structural damping, distributed weight and cross-flow drag (half to each end), parabolic sag for geometry;
//    optional camera pod as a node mass gripping the line (two segments); weak link at the exit; cutter.
//  • reel: yo-yo drum radius vs wound length, 2:1 belt, MN3110 700 Kv motor with R, Kt, FOC current and voltage
//    limits (cold bus V0 − R_batt·I; regen clamped by the shunt; pay-out above the back-EMF limit is braked by the
//    diodes), drum/motor inertia, viscous + Coulomb friction, slip clutch (35 N line-equivalent) between the two
//    inertias, ratchet when docked.
//  • rider: exit = 0.66 m behind / 0.10 m below the shared pelvis point on the hinged lumbar quiver (engineering A+);
//    apparent wind = shared makeWind at the flyer − flyer ground velocity.
// SENSORS (datasheet + ASSUMED integration errors, design.js SENS): pack IMU/GNSS/baro detector (detect.js),
//  pack GNSS velocity, exit tension (scale/bias/noise/latency), 2-axis exit line angle (+ pack AHRS tilt/yaw),
//  metered line length, flyer pitot + AoA vane + attitude, UWB range, shared windEstimate() for gates.
// AUTONOMY (sensor estimates only): mode machine STOWED→DEPLOY→READY→LAUNCH→FLY→BRAKE→LANDED/FLYIN→RETRIEVE→
//  CAPTURE→DOCKED→STOWED, ABORT on a detected fall (deep stall, free-spool, cutter), MANUAL stow after 3 failed
//  captures. Reel law: length hold + "kite-like" length adaptation (pay out on surplus lift, reel in on a lift
//  deficit, KE-governed), exit heave feed-forward, slack take-up. Flyer: AoA/CL loop (pitot+vane), elevation loop
//  on the airbrake with CL scale-back, roll loop to the window target (K_φ>1 + rate damping).
import { makeWind } from '../common/env.js';
import { skierAt, bodyPoints } from '../common/skier.js';
import { windEstimate } from '../common/fullrun.js';
import { mulberry32, gaussian } from '../../model/util.js';
import { FLYERS, LINE, REEL, SENS, G, RHO, aeroCoef, drumR, flyerBudget, podBudget, vStall } from './design.js';
import { skiTraceOf, runDetector } from './detect.js';

const D2R = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, f = [0, 0, 1]) => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : f; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const asin = (x) => Math.asin(clamp(x, -1, 1));
// small rotation: yaw about world z, then tilts about x and y
function perturb(v, yaw, tx, ty) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  let x = v[0] * cy - v[1] * sy, y = v[0] * sy + v[1] * cy, z = v[2];
  let c = Math.cos(tx), s = Math.sin(tx); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ty); s = Math.sin(ty); [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}
class Delay { constructor(d) { this.d = d; this.q = []; this.h = 0; this.last = null; } push(t, v) { this.q.push([t, v]); } get(t) { while (this.h < this.q.length && this.q[this.h][0] <= t - this.d + 1e-9) this.last = this.q[this.h++][1]; if (this.h > 256) { this.q = this.q.slice(this.h); this.h = 0; } return this.last; } }

export const MODE = { STOWED: 0, DEPLOY: 1, READY: 2, LAUNCH: 3, FLY: 4, BRAKE: 5, LANDED: 6, FLYIN: 7, RETRIEVE: 8, CAPTURE: 9, DOCKED: 10, ABORT: 11, FREE: 12, MANUAL: 13 };
export const MODE_NAME = Object.fromEntries(Object.entries(MODE).map(([k, v]) => [v, k]));
export const AIRBORNE = (m) => m === MODE.LAUNCH || m === MODE.FLY || m === MODE.BRAKE || m === MODE.FLYIN || m === MODE.ABORT || m === MODE.FREE || m === MODE.LANDED || m === MODE.RETRIEVE || m === MODE.CAPTURE || m === MODE.MANUAL;

// geometry of the worn unit in the body frame of bodyPoints(): exit (quiver mouth, flight position) relative to the
// shared pelvis point; stowed flyer position (quiver folded diagonally across the back); quiver pivot
export const GEOM = { exitF: -0.66, exitU: -0.10, pivotF: -0.14, pivotU: -0.04, stowF: -0.2, stowL: 0.12, stowU: 0.42, quiverPitchDeg: -10, quiverLen: 0.55 };

// defaults (ASSUMED unless noted); index.js exposes the important ones as params
export const PDEF = {
  flyer: 0, camPos: 0, sCam: 5.5, Lfilm: 0, LfilmFly: 10, LfilmLine: 14, LmaxAdd: 1.5, Lmin: 4.5,
  tailGate: 3.0, lowLiftAbort: 1.15, elev: 50, elevFlyin: 35, elevLow: 33, slopeDeg: 15, Tset: 3, gateK: 1.35, straightAcc: 2.5, straightS: 0.6, vLaunch: 2.0, Llaunch: 6,
  kHeave: 1.0, devK: 0, vRet: 3.0, vFlyin: 2.0, vCap: 0.3, sideDrop: 1, tailSide: 1.5,
  massScale: 1, cd0Scale: 1, clmaxScale: 1, V0: REEL.V0, noise: 1, capScale: 1, cutT: 15,
  kPhi: 1.2, kPhiD: 5, elevBank0: 25, azShot: 22, azPeriod: 12, hfovFly: 66, hfovLine: 66, cam48: 1, dbgCam: 0, dt: 0.002, ctrlDt: 0.01,
};

// ASSUMED capture model (disclosed): first-try success = P0 · f(arrival speed) · f(entry angle). P0 0.958 reproduces
// the engineering quiver-aligns-to-line Monte-Carlo (roll jam 2.7 %, ice 1 %, wrap 0.5 %); speed and angle terms are
// ASSUMED (45° trumpet half-angle; ≤0.8 m/s full capture, 50 % at 2 m/s). Not measured — kill test: 50 captures at −10 °C.
export function captureProb(vRel, angDeg, scale = 1) {
  const fv = vRel <= 0.8 ? 1 : vRel <= 2 ? 1 - (0.5 * (vRel - 0.8)) / 1.2 : vRel <= 3 ? 0.5 - 0.4 * (vRel - 2) : 0.1 * Math.exp(-(vRel - 3));
  const fa = angDeg <= 20 ? 1 : angDeg <= 45 ? 1 - (angDeg - 20) / 25 : 0;
  return clamp(0.958 * scale, 0, 1) * fv * fa;
}

export function resolveP(params) {
  const p = { ...PDEF, ...params };
  const type = p.flyer >= 0.5 ? 'kite' : 'delta';
  const camOn = p.camPos < 0.5;
  const F0 = FLYERS[type];
  const F = { ...F0, CD0: F0.CD0 * p.cd0Scale, CLmax: F0.CLmax * p.clmaxScale };
  const fb = flyerBudget(type, camOn);
  const m = fb.kg * p.massScale;
  const pod = camOn ? null : podBudget();
  const L = p.Lfilm > 0 ? p.Lfilm : camOn ? p.LfilmFly : p.LfilmLine;
  return { ...p, type, camOn, F, m, pod, Lfilm: L, Vs: vStall(F, m), Tset: p.Tset * (type === 'kite' ? 0.85 : 1) };
}

// Hermite interpolation of body points sampled at dt0 (smooth exit velocity for the 2 ms integration)
function bodyTrack(sk, T, dt0 = 0.02) {
  const n = Math.floor(T / dt0) + 3;
  const E = [], H = [], S = [], AX = [], UP = [], HD = [], V = [];
  for (let i = 0; i < n; i++) {
    const s = skierAt(sk, i * dt0), b = bodyPoints(s), h = s.heading, up = b.up, pv = b.pelvis;
    const at = (f, l, u) => [pv[0] + h[0] * f + b.left[0] * l + up[0] * u, pv[1] + h[1] * f + b.left[1] * l + up[1] * u, pv[2] + h[2] * f + b.left[2] * l + up[2] * u];
    E.push(at(GEOM.exitF, 0, GEOM.exitU)); S.push(at(GEOM.stowF, GEOM.stowL, GEOM.stowU)); H.push(b.head);
    const qp = GEOM.quiverPitchDeg * D2R; AX.push(unit(add(mul(h, -Math.cos(qp)), mul(up, Math.sin(qp))))); UP.push(up); HD.push(h); V.push(s.vel);
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
  return { E, H, S, AX, UP, HD, V, vel, at, dt0 };
}

// tension of an elastic segment with an optional series shock spring (massless, quasi-static), plus damping
function segTension(dist, L0, relVel, mEff, series) {
  const Lk = Math.max(0.3, L0), kl = LINE.EA / Lk;
  const e = dist - L0;
  if (e <= 0) return { T: 0, k: 0 };
  let T, k;
  if (series) {
    const ks = LINE.kShock, Tb = ks * LINE.strokeShock, e1 = Tb / ks + Tb / kl;
    if (e < e1) { k = (ks * kl) / (ks + kl); T = e * k; } else { k = kl; T = Tb + (e - e1) * kl; }
  } else { k = kl; T = e * kl; }
  const c = 2 * LINE.zeta * Math.sqrt(k * mEff);
  return { T: Math.max(0, T + c * relVel), k };
}

export function runCore(params, input) {
  const p = resolveP(params);
  const { F, m } = p;
  const sk = input.sk;
  const T = input.duration ?? sk.duration;
  const dt = input.dt ?? p.dt, SDT = 0.02, every = Math.max(1, Math.round(SDT / dt));
  const nS = Math.floor(T / SDT + 1e-9) + 1, nSteps = (nS - 1) * every;
  const wc = input.wind || { mean: [0, 0, 0], intensity: 0.15, seed: 1 };
  const wind = makeWind({ Lu: 28, ...wc });
  const seed = input.seed ?? (wc.seed || 1) * 31 + 7;
  const rng = mulberry32(seed), gn = () => gaussian(rng) * p.noise;
  const BT = bodyTrack(sk, T + 0.1);
  // ---- detector (pack IMU+GNSS+baro): open-loop on the pack motion
  const tr = input.detTrace || skiTraceOf(sk, { seed });
  const det = input.detector || runDetector(tr, { seed: seed + 3 });
  const firstStop = det.ev.stop.length ? det.ev.stop[0] : Infinity;
  const detState = (t) => (input.start === 'flying' && t < firstStop ? 1 : det.trace.state[Math.min(det.trace.state.length - 1, Math.max(0, Math.round(t / tr.dt)))]);
  const fallT = det.ev.fall.length ? det.ev.fall[0] : null;
  // ---- shared wind estimate for the gates (10 s trailing mean at the pack + seeded bias)
  const wEst = windEstimate(wind, (t) => BT.at(t).pos, { seed: wc.seed || 1 });
  // ---- fixed sensor error draws
  const sErr = {
    tScale: 1 + gn() * SENS.tension.scale, tBias: gn() * SENS.tension.bias, lScale: 1 + gn() * SENS.length.scale,
    yaw: gn() * SENS.ahrs.yawDeg * D2R, tx: gn() * (SENS.ahrs.tiltDeg + SENS.lineAngle.biasDeg) * D2R, ty: gn() * (SENS.ahrs.tiltDeg + SENS.lineAngle.biasDeg) * D2R,
    att: [gn(), gn(), gn()].map((x) => x * SENS.flyerAtt.errDeg * D2R), rho: 1 + 0.02 * gn(),
  };
  const capRng = mulberry32(seed * 7 + 13);
  // ---- reel inertia
  const g2 = REEL.gear * REEL.gear;
  // ---- state
  let mode = input.start === 'flying' ? MODE.FLY : MODE.STOWED, modeT = 0, quiver = input.start === 'flying' ? 1 : 0;
  let pF = null, vF = null, pP = null, vP = null; // flyer, pod
  let podOn = false, P0len = 0, podDocked = true;
  let Lout = 0.12, wD = 0, wM = 0, iM = 0, Ibatt = 0, slip = false; // drum/motor angular speed (rad/s, + = pay out, drum side)
  let theta = F.aB0Deg * D2R, thetaD = 0, aB = F.aB0Deg * D2R, phi = 0, phiD = 0, del = 0, phiDist = 0, brake = 0, alpha = 0;
  let cmd = { aB: F.aB0Deg * D2R, phi: 0, brake: 0 };
  const vrDel = new Delay(0.03), radio = new Delay(SENS.radio.lat), tDel = new Delay(SENS.tension.lat), gDel = new Delay(SENS.gnss.lat), airDel = new Delay(SENS.radio.lat);
  let Tm = 0, vCmd = 0, intV = 0, iCmd = 0, broken = false, cut = false, wlT = 0, cutT = 0;
  const est = { pos: [0, 0, 0], posM: [0, 0, 0], dev: [0, 0, 0], vA: [0, 0, 0], aA: [0, 0, 0], vAm: null, c: [-0.7, 0, 0.7], cF: [-0.7, 0, 0.7], rel: null, relPrev: null, vrel: [0, 0, 0], W: null, Wair: null, va: 0, alpha: 0, elev: 0, elevPrev: 0, elevRate: 0, LM: 0, range: 0, uE: null, bI: 0, sCL: 1, aBI: F.aB0Deg * D2R };
  let air = null, Ltgt = p.Lfilm, straightT = 0, launchesRide = 0, rideOn = false, lastRide = false;
  let holdRatchet = false, lowT = 0, downT = 0, retryPay = false, dockedThisRide = false, stopT = null, capFails = 0, capWin = null, contactT = -9, snowLog = [], landT = 0, manualT = 0, sideT = 0, sideSgn = 1, slowT = 0;
  // ---- outputs (20 ms)
  const O = {};
  const KEYS = ['mode', 'quiver', 'fx', 'fy', 'fz', 'fvx', 'fvy', 'fvz', 'bfx', 'bfy', 'bfz', 'bux', 'buy', 'buz', 'qx', 'qy', 'qz', 'qvx', 'qvy', 'qvz', 'ex', 'ey', 'ez', 'evx', 'evy', 'evz',
    'hx', 'hy', 'hz', 'sx', 'sy', 'sz', 'ax', 'ay', 'az', 'L', 'L1', 'T', 'Tf', 'Tm', 'va', 'vaM', 'alpha', 'CL', 'CD', 'brake', 'phi', 'theta', 'vr', 'iM', 'Pel', 'Vbus', 'E', 'slip',
    'elev', 'elevM', 'azW', 'LM', 'Ltgt', 'wx', 'wy', 'wz', 'wex', 'wey', 'snow', 'riding', 'contact', 'sag1x', 'sag1y', 'sag1z', 'sag2x', 'sag2y', 'sag2z', 'Fbx', 'Fby', 'Fbz', 'capWin', 'cut', 'dbg1', 'dbg2', 'dbg3', 'erx', 'ery', 'erz', 'ecx', 'ecy', 'ecz', 'L1m', 'vax', 'vay', 'podOn', 'F50'];
  for (const k of KEYS) O[k] = new Float64Array(nS).fill(NaN);
  const events = [];
  const ev = (t, type, severity, zh, en, extra = {}) => events.push({ t: +t.toFixed(3), type, severity, zh, en, ...extra });
  const met = { launches: 0, launchFails: 0, docks: [], captures: [], crashes: 0, snowFlyS: 0, Emech: 0, Ebatt: 0, Eregen: 0, PpeakW: 0, satS: 0, slipS: 0, vrMin: 0, vrMax: 0, manual: 0, refuseS: 0, stopDecisions: [], cutAt: null, brokeAt: null, Tmax: 0 };
  // ---- helpers
  const exitAt = (t) => BT.at(t);
  const idx0 = (t) => Math.min(BT.E.length - 1, Math.round(t / BT.dt0));
  const dockPos = (t, q) => { const i = idx0(t), e = BT.E[i], s = BT.S[i]; return add(mul(s, 1 - q), mul(e, q)); };
  const shotAz = input.shot || ((t) => p.azShot * Math.sign(Math.sin((Math.PI * t) / p.azPeriod) || 1) * Math.min(1, Math.abs(Math.sin((Math.PI * t) / p.azPeriod)) * 3));
  // flyer starts in flight (labelled option for unit tests / dt checks): at Lfilm, elevation target, behind on the course
  if (input.start === 'flying') {
    const e0 = exitAt(0), back = unit([-BT.HD[0][0], -BT.HD[0][1], 0]), el = p.elev * D2R;
    pF = add(e0.pos, mul(add(mul(back, Math.cos(el)), [0, 0, Math.sin(el)]), p.Lfilm)); vF = [...e0.v]; Lout = p.Lfilm * 0.995;
    est.c = unit(sub(pF, e0.pos)); est.cF = est.c; rideOn = true; launchesRide = 1; est.vA = [...e0.v]; est.vAm = [...e0.v]; est.range = p.Lfilm; est.rel = sub(pF, e0.pos);
    if (!p.camOn) { podOn = true; podDocked = false; P0len = p.Lfilm - p.sCam; pP = add(e0.pos, mul(est.c, p.sCam)); vP = [...e0.v]; }
  }
  let e = exitAt(0), mouth = e.pos;
  const fBuf = new Float64Array(Math.max(1, Math.round(0.05 / dt))); let fSum = 0, fI = 0, f50max = 0;
  let vRelLP = 0, dbgFF = 0, dbgLst = 0, wFc = null, wMidC = {}, wEstC = null, ai = 0, bodyNose = [-1, 0, 0], bodyUp = [0, 0, 1];
  const wMeanCourse = { v: null };
  for (let step = 0; step <= nSteps; step++) {
    const t = step * dt;
    e = exitAt(t); mouth = e.pos;
    const ib = idx0(t), ax = BT.AX[ib], upB = BT.UP[ib];
    // ===================================================== truth physics
    const airborne = pF && !(mode === MODE.STOWED || mode === MODE.DEPLOY || mode === MODE.READY || mode === MODE.DOCKED);
    let Fexit = [0, 0, 0], Tf = 0, Texit = 0, sag1 = [0, 0, 0], sag2 = [0, 0, 0], CL = 0, CDt = 0, Va = 0, wF = [0, 0, 0];
    const r = drumR(LINE.Ldrum - Lout), Jd = REEL.Jdrum, Jm = REEL.Jmotor * g2;
    if (airborne) {
      if (step % (p.windEvery ?? 5) === 0 || !wFc) wFc = wind(t, pF); wF = wFc; // 100 Hz wind samples at the flyer
      const vaV = sub(vF, wF); Va = len(vaV) || 1e-6; const u = mul(vaV, 1 / Va);
      const lineOn = !broken && !cut;
      // ---- line segment(s)
      let Fl = [0, 0, 0], Fpod = [0, 0, 0], cu = unit(sub(pF, mouth));
      const lineSeg = (A, vAa, B, vBb, L0, series, mB) => {
        const ch = sub(B, A), dist = len(ch), cuS = unit(ch), relV = dot(sub(vBb, vAa), cuS);
        const { T: Ts } = segTension(dist, L0, relV, mB, series);
        // distributed weight + cross-flow drag of the segment (midpoint air velocity), half to each end
        const Lr = Math.max(0.05, L0), key = series ? 1 : 2; if (step % 10 === 0 || !wMidC[key]) wMidC[key] = wind(t, mul(add(A, B), 0.5));
        const vMid = sub(mul(add(vAa, vBb), 0.5), wMidC[key]);
        const vn = sub(vMid, mul(cuS, dot(vMid, cuS)));
        const Gl = [0, 0, -LINE.lambda * Lr * G], Dl = mul(vn, -0.5 * RHO * LINE.Cd * LINE.d * Lr * len(vn));
        const q = add(Gl, Dl), half = mul(q, 0.5);
        // sag (parabola) from the load normal to the chord: mid-span offset = w⊥ L² / (8 T)
        const qn = sub(q, mul(cuS, dot(q, cuS)));
        const sagM = Ts > 0.05 ? Math.min(0.5 * dist, (len(qn) * Lr) / (8 * Ts)) : 0.25 * Lr;
        return { Ts, cuS, half, sag: mul(unit(qn, [0, 0, -1]), sagM), dist };
      };
      if (lineOn) {
        if (podOn && !podDocked) {
          const s1 = lineSeg(mouth, e.v, pP, vP, Math.max(0.02, Lout - P0len), true, p.pod.kg);
          const s2 = lineSeg(pP, vP, pF, vF, P0len, false, m);
          Fl = add(mul(s2.cuS, -s2.Ts), s2.half); Tf = s2.Ts; cu = s2.cuS; sag1 = s1.sag; sag2 = s2.sag;
          Fexit = add(mul(s1.cuS, s1.Ts), s1.half); Texit = s1.Ts;
          Fpod = add(add(mul(s1.cuS, -s1.Ts), s1.half), add(mul(s2.cuS, s2.Ts), s2.half));
        } else {
          const s1 = lineSeg(mouth, e.v, pF, vF, Lout, true, m);
          Fl = add(mul(s1.cuS, -s1.Ts), s1.half); Tf = s1.Ts; cu = s1.cuS; sag1 = s1.sag;
          Fexit = add(mul(s1.cuS, s1.Ts), s1.half); Texit = s1.Ts;
        }
      }
      // ---- aero
      const w = clamp(Tf / (m * G), 0, 1);
      const ref = unit(add(mul(cu, w), [0, 0, 1.25 - w])); // span stays near horizontal when the line lies along the flow
      let L0 = sub(ref, mul(u, dot(ref, u))); L0 = len(L0) > 1e-3 ? unit(L0) : unit(sub([0, 0, 1], mul(u, u[2])), [0, 0, 1]);
      const sAx = crs(u, L0), phT = phi + phiDist;
      const Lh = add(mul(L0, Math.cos(phT)), mul(sAx, Math.sin(phT)));
      // slack: the bridle carries no load, the wing trims at its free AoA; commanding the pitch actuator above the
      // slack reference (reflex/elevator servo) pitches the free trim up into a deep stall
      const aTaut = theta - asin(dot(u, cu)), aFree = F.aFreeDeg * D2R + clamp(theta - F.aSlackRefDeg * D2R, 0, 60 * D2R);
      alpha = w * aTaut + (1 - w) * aFree;
      const [cl, cd] = aeroCoef(F, alpha, brake); CL = cl; CDt = cd;
      const q = 0.5 * RHO * Va * Va;
      // a flagged wing lying on the snow (towed in / landed) is sheltered and flat: aero force ×0.3 (ASSUMED; the shared wind
      // field has no near-snow gradient)
      const onSnow = pF[2] < -pF[0] * sk.tanS + 0.06 && (mode === MODE.RETRIEVE || mode === MODE.CAPTURE || mode === MODE.LANDED || mode === MODE.MANUAL || mode === MODE.BRAKE);
      const kS = onSnow ? 0.3 : 1;
      const Fa = add(mul(Lh, q * F.S * cl * kS), mul(u, -q * F.S * cd * kS));
      bodyNose = unit(add(mul(u, Math.cos(alpha)), mul(Lh, Math.sin(alpha)))); bodyUp = unit(sub(mul(Lh, Math.cos(alpha)), mul(u, Math.sin(alpha))));
      const mE = m + (lineOn ? 0.5 * LINE.lambda * (podOn && !podDocked ? P0len : Lout) : 0);
      const acc = mul(add(add(Fa, Fl), [0, 0, -m * G]), 1 / mE);
      vF = add(vF, mul(acc, dt)); pF = add(pF, mul(vF, dt));
      // ---- pod (node mass on the line)
      if (podOn && !podDocked && lineOn) {
        if (step % 5 === 0 || !wMidC.p) wMidC.p = wind(t, pP); const wP = wMidC.p, vaP = sub(vP, wP), VaP = len(vaP);
        const Fd = mul(vaP, -0.5 * RHO * p.pod.CdA * VaP);
        const aP = mul(add(add(Fpod, Fd), [0, 0, -p.pod.kg * G]), 1 / p.pod.kg);
        vP = add(vP, mul(aP, dt)); pP = add(pP, mul(vP, dt));
        const zsP = -pP[0] * sk.tanS + 0.03; if (pP[2] < zsP) { pP[2] = zsP; const vz = -vP[0] * sk.tanS; if (vP[2] < vz) vP[2] = vz; const vt = Math.hypot(vP[0], vP[1]), dv = 0.3 * G * dt; if (vt > dv) { vP[0] *= 1 - dv / vt; vP[1] *= 1 - dv / vt; } else { vP[0] = 0; vP[1] = 0; } }
      }
      // ---- snow contact (μ 0.3 sliding, ASSUMED)
      const zs = -pF[0] * sk.tanS + 0.03;
      if (pF[2] < zs) {
        if (t - contactT > 0.5 && (mode === MODE.FLY || mode === MODE.LAUNCH)) { met.crashes++; if (snowLog.length < 20) snowLog.push({ t: +t.toFixed(2), mode: MODE_NAME[mode], L: +Lout.toFixed(1), v: +len(sub(vF, e.v)).toFixed(1) }); }
        contactT = t;
        pF[2] = zs; const vzs = -vF[0] * sk.tanS; if (vF[2] < vzs) vF[2] = vzs;
        const vt = Math.hypot(vF[0], vF[1]), dv = 0.3 * G * dt; if (vt > dv) { vF[0] *= 1 - dv / vt; vF[1] *= 1 - dv / vt; } else { vF[0] = 0; vF[1] = 0; }
        if (mode === MODE.FLY || mode === MODE.LAUNCH) met.snowFlyS += dt;
      }
      // ---- rotational modes and actuators (commands arrive over the radio)
      const cm = radio.get(t) || cmd, sv = SENS.servo;
      aB += clamp((cm.aB - aB) * Math.min(1, dt / sv.tau), (-sv.rateDegS * D2R * dt) / 4, (sv.rateDegS * D2R * dt) / 4);
      const wp = F.pitch.wn; thetaD += (wp * wp * (aB - theta) - 2 * F.pitch.zeta * wp * thetaD) * dt; theta += thetaD * dt;
      del += clamp((cm.phi - del) * Math.min(1, dt / sv.tau), -sv.rateDegS * D2R * dt, sv.rateDegS * D2R * dt);
      const wr = F.roll.wn; phiD += (wr * wr * (del - phi) - 2 * F.roll.zeta * wr * phiD) * dt; phi += phiD * dt;
      const sig = 6 * D2R * ((wc.intensity ?? 0.15) / 0.15) * (len(wc.mean || [0, 0, 0]) > 0 ? 1 : 0.6);
      phiDist += (-phiDist / 0.8) * dt + sig * Math.sqrt((2 * dt) / 0.8) * gaussian(rng);
      brake += (cm.brake - brake) * Math.min(1, dt / 0.1);
      // ---- weak link (38 N for 5 ms at the exit)
      if (!broken && !cut) { wlT = Texit > LINE.weakLinkN ? wlT + dt : 0; if (wlT > 0.005) { broken = true; met.brokeAt = t; mode = MODE.FREE; ev(t, 'weaklink', 'warning', '弱连接在出口处断开（38 N）：飞行体与绳脱离', 'Weak link parted at the exit (38 N): flyer and line released'); } }
      met.Tmax = Math.max(met.Tmax, Texit);
      const fb = len(Fexit); fSum += fb - fBuf[fI]; fBuf[fI] = fb; fI = (fI + 1) % fBuf.length; f50max = Math.max(f50max, fSum / fBuf.length);
    } else {
      // stowed / deploying / ready / docked: the flyer rides in the quiver
      pF = dockPos(t, quiver); vF = [...e.v]; Lout = 0.12; theta = F.aB0Deg * D2R; thetaD = 0; phi = 0; phiD = 0; brake = 0;
      if (!p.camOn) { pP = [...pF]; vP = [...vF]; }
    }
    // ---- reel drum + motor (two inertias, slip clutch, V/I-limited FOC motor, ratchet when stowed)
    const ratchet = !airborne || broken || cut || holdRatchet;
    if (ratchet) { wD = 0; wM = 0; iM = 0; }
    else {
      const Vbus = clamp(p.V0 - REEL.Rbatt * Ibatt, 6, REEL.Vclamp), Vmax = REEL.modIdx * Vbus;
      const wIn = -wM * REEL.gear; // motor shaft speed, + = reel-in
      const iLo = Math.max(-REEL.Imax, (-Vmax - REEL.Kt * wIn) / REEL.R), iHi = Math.min(REEL.Imax, (Vmax - REEL.Kt * wIn) / REEL.R);
      iM = clamp(iCmd, Math.min(iLo, iHi), Math.max(iLo, iHi));
      if (Math.abs(iM - iCmd) > 0.05) met.satS += dt;
      const tauL = Texit * r, tauM = REEL.Kt * iM * REEL.gear; // line torque (pay-out +), motor torque on the drum side (reel-in +)
      const fr = (w) => REEL.b * w + REEL.coul * Math.tanh(w / 0.5);
      const tauClMax = LINE.clutchN * r;
      if (!slip) {
        const aw = (tauL - tauM - fr(wD)) / (Jd + Jm);
        const tauC = tauL - fr(wD) - Jd * aw; // torque the clutch transmits drum → motor side
        if (Math.abs(tauC) > tauClMax) slip = true; else { wD += aw * dt; wM = wD; }
      }
      if (slip) {
        const sg = Math.sign(wD - wM) || Math.sign(tauL - tauM) || 1, tc = sg * tauClMax;
        wD += ((tauL - fr(wD) - tc) / Jd) * dt; wM += ((tc - tauM) / Jm) * dt;
        if (Math.sign(wD - wM) !== sg || Math.abs(wD - wM) < 1e-3) { const wc2 = (Jd * wD + Jm * wM) / (Jd + Jm); wD = wM = wc2; slip = false; }
        met.slipS += dt;
      }
      if (Lout <= 0.12 && wD < 0) { wD = 0; wM = 0; }
      if (Lout >= LINE.Ldrum && wD > 0) { wD = 0; wM = 0; }
      Lout = clamp(Lout + r * wD * dt, 0.12, LINE.Ldrum);
      const Pel = REEL.R * iM * iM + REEL.Kt * (-wM * REEL.gear) * iM; // drawn electrical power (negative = regen into the shunt)
      const Pb = Pel > 0 ? Pel / REEL.drvEff : 0;
      Ibatt = Pb / Vbus;
      met.Ebatt += Pb * dt; if (Pel < 0) met.Eregen += -Pel * dt; met.PpeakW = Math.max(met.PpeakW, Pb);
      met.vrMin = Math.min(met.vrMin, r * wD); met.vrMax = Math.max(met.vrMax, r * wD);
    }
    const vReel = r * wD;
    vRelLP += (len(sub(vF, e.v)) - vRelLP) * Math.min(1, dt / 0.1);
    // ===================================================== sensors (pack, 500 Hz) — measurements only below this line
    tDel.push(t, len(Fexit) * sErr.tScale + sErr.tBias + gn() * SENS.tension.sigma);
    Tm += ((tDel.get(t) ?? 0) - Tm) * Math.min(1, dt / 0.02);
    if (step % 5 === 0) gDel.push(t, add(e.v, [gn() * SENS.gnss.sigmaV, gn() * SENS.gnss.sigmaV, gn() * SENS.gnss.sigmaVz]));
    { const vg = gDel.get(t) || [0, 0, 0], vPrev = est.vA; est.vA = add(est.vA, mul(sub(vg, est.vA), Math.min(1, dt / 0.1))); est.aA = add(est.aA, mul(sub(mul(sub(est.vA, vPrev), 1 / dt), est.aA), Math.min(1, dt / 0.3))); }
    est.vAm = est.vAm ? add(est.vAm, mul(sub(est.vA, est.vAm), Math.min(1, dt / 2.5))) : [...est.vA]; // mean course (τ 2.5 s)
    // pack deviation from its mean-course path (turn-by-turn lateral/along swing), leaky integral of GNSS velocity
    // pack position from integrated GNSS velocity; mean-course point = complementary filter driven by the mean
    // velocity (zero ramp error) pulled toward the position with τ 3 s; dev = lateral offset of the pack from it
    est.pos = add(est.pos, mul([est.vA[0], est.vA[1], 0], dt));
    est.posM = add(est.posM, mul(add([est.vAm[0], est.vAm[1], 0], mul(sub(est.pos, est.posM), 1 / 3)), dt));
    { const cm0 = unit([est.vAm[0], est.vAm[1], 0], [1, 0, 0]), latc = [-cm0[1], cm0[0], 0]; est.dev = mul(latc, dot(sub(est.pos, est.posM), latc)); }
    const Lm = Lout * sErr.lScale;
    if (airborne && !broken && !cut) {
      // exit line angle: line direction at the exit (chord tilted by the sag slope), pack frame + AHRS errors, 30 ms lag
      const ch = podOn && !podDocked ? sub(pP, mouth) : sub(pF, mouth), dl = Math.max(0.05, len(ch));
      const tangE = unit(sub(mul(unit(ch), dl), mul(sag1, 4)));
      const meas = perturb(tangE, sErr.yaw + gn() * 0.15 * D2R, sErr.tx + gn() * SENS.lineAngle.sigmaDeg * D2R, sErr.ty + gn() * SENS.lineAngle.sigmaDeg * D2R);
      if (Tm > 0.3) est.c = unit(add(est.c, mul(sub(meas, est.c), Math.min(1, dt / SENS.lineAngle.tau))));
      // sag-corrected chord estimate toward the flyer: the exit tangent rises above the chord by ≈4·sag/L
      const sagE = (LINE.lambda * G * Lm) / (8 * Math.max(0.5, Tm)) * Lm; // weight-only sag model (pack knows λ, L, T)
      est.cF = unit(add(mul(est.c, Lm), [0, 0, -4 * sagE * Math.cos(asin(est.c[2]))]));
      // UWB range flyer ↔ pack (20 Hz)
      if (step % 25 === 0) est.range = len(sub(pF, mouth)) + gn() * SENS.uwb.sigma;
      const rel = mul(est.cF, Math.max(0.2, est.range || Lm));
      // flyer velocity relative to the pack: flyer IMU + UWB/GNSS fusion on the flyer (30 ms, ±0.15 m/s, ASSUMED)
      vrDel.push(t, add(sub(vF, e.v), [gn() * 0.15, gn() * 0.15, gn() * 0.15]));
      { const vr = vrDel.get(t) || [0, 0, 0]; est.vrel = add(est.vrel, mul(sub(vr, est.vrel), Math.min(1, dt / 0.03))); }
      est.relPrev = rel; est.rel = rel;
      // flyer air data downlink (pitot + vane + attitude-derived airflow direction), 50 Hz, radio latency
      if (step % 10 === 0) {
        const uT = unit(sub(vF, wF)), uM = perturb(uT, sErr.att[0] + gn() * D2R, sErr.att[1] + gn() * D2R, sErr.att[2] + gn() * D2R);
        airDel.push(t, { va: Math.max(0, Va + SENS.pitot.sigma * gn()), alpha: alpha + SENS.vane.sigmaDeg * D2R * gn(), u: uM });
      }
      air = airDel.get(t) || air;
      if (air) {
        est.va = air.va; est.alpha = air.alpha; est.uE = air.u;
        const vFl = add(est.vA, est.vrel);
        if (air.va > 2.5 && Tm > 0.3) { const Wi = sub(vFl, mul(air.u, air.va)); est.Wair = est.Wair ? add(est.Wair, mul(sub(Wi, est.Wair), Math.min(1, dt / 1.5))) : Wi; }
      }
      est.LM = (0.5 * RHO * sErr.rho * est.va * est.va * F.S * F.CLmax) / (m * G);
      const el = Math.atan2(est.cF[2], Math.hypot(est.cF[0], est.cF[1])) / D2R;
      est.elevRate += ((el - est.elev) / dt - est.elevRate) * Math.min(1, dt / 0.3); est.elev = el;
    }
    if (step % 50 === 0 || !wEstC) wEstC = wEst(t);
    const Wg0 = wEstC;
    est.W = est.Wair && airborne && mode !== MODE.LANDED && mode !== MODE.RETRIEVE ? add(mul(Wg0, 0.3), mul(est.Wair, 0.7)) : Wg0;
    const appW = sub(est.W, est.vAm); // where the air goes, relative to the mean course
    const vaGate = dot(sub([est.vA[0], est.vA[1], 0], [est.W[0], est.W[1], 0]), unit([est.vA[0], est.vA[1], 0], [1, 0, 0])); // apparent wind along the travel direction (GNSS velocity − wind estimate)
    // pack straight-glide gate: small lateral acceleration (pack IMU, ≥ straightS)
    const hd = unit([est.vA[0], est.vA[1], 0], [1, 0, 0]), latA = Math.abs(est.aA[0] * -hd[1] + est.aA[1] * hd[0]);
    straightT = latA < p.straightAcc ? straightT + dt : 0;
    // ===================================================== mode machine
    // fly-in is only allowed while the flyer is behind the rider (|azimuth| < 60° from the back; pack AHRS heading)
    const behindOK = () => { if (!est.rel) return false; const hP = perturb(BT.HD[ib], sErr.yaw, 0, 0), b = unit([-hP[0], -hP[1], 0]); const h = unit([est.rel[0], est.rel[1], 0]); return dot(b, h) > 0.5; };
    const hAbove = () => (est.rel ? est.rel[2] + 0.8 + est.rel[0] * sk.tanS : 9);
    const riding = detState(t) === 1;
    const fallen = fallT != null && t >= fallT;
    if (riding && !lastRide) { rideOn = true; launchesRide = 0; dockedThisRide = false; }
    lastRide = riding;
    modeT += dt;
    const prev = mode;
    const setMode = (mm) => { if (mm !== mode) { mode = mm; modeT = 0; } };
    switch (mode) {
      case MODE.STOWED:
        quiver = Math.max(0, quiver - dt / 1.3);
        if (riding && !fallen && quiver <= 0 && !dockedThisRide && launchesRide < 2) { setMode(MODE.DEPLOY); ev(t, 'deploy', 'info', '检测到起滑：箭筒摆出', 'Ride start detected: quiver swings out'); }
        break;
      case MODE.DEPLOY:
        quiver = Math.min(1, quiver + dt / 1.3);
        if (quiver >= 1) setMode(MODE.READY);
        if (!riding) setMode(MODE.STOWED);
        break;
      case MODE.READY: {
        const tailW = dot([est.W[0], est.W[1], 0], unit([est.vA[0], est.vA[1], 0], [1, 0, 0]));
        const ok = riding && !fallen && straightT >= p.straightS && vaGate >= p.gateK * p.Vs && tailW <= p.tailGate && launchesRide < 2 && len(est.vA) > 3;
        if (ok) {
          setMode(MODE.LAUNCH); launchesRide++; met.launches++;
          pF = add(mouth, mul(ax, 0.45)); vF = [...e.v]; Lout = 0.43; wD = wM = 0;
          { const uA = unit(sub(est.vA, est.W), [1, 0, 0]); theta = clamp(8 * D2R + asin(dot(uA, ax)), F.aBminDeg * D2R, F.aBmaxDeg * D2R); }
          thetaD = 0; aB = theta; phi = phiD = del = 0; brake = 0;
          cmd = { aB: theta, phi: 0, brake: 0 }; est.relPrev = null; est.c = unit(sub(pF, mouth)); est.cF = est.c; est.bI = 0; est.sCL = 1; est.aBI = theta; Ltgt = p.Lfilm;
          ev(t, 'launch', 'info', `起飞（估计相对风 ${vaGate.toFixed(1)} m/s ≥ ${(p.gateK * p.Vs).toFixed(1)}，直滑）`, `Launch (est. apparent wind ${vaGate.toFixed(1)} m/s ≥ ${(p.gateK * p.Vs).toFixed(1)}, straight glide)`);
        } else if (riding) met.refuseS += dt;
        if (!riding) { setMode(MODE.STOWED); }
        break;
      }
      case MODE.LAUNCH:
        if (Lm >= p.Llaunch && Tm > 0.3) setMode(MODE.FLY);
        else if ((t - contactT > 0.05 && t - contactT < 0.1) || (Lm < 2.5 && modeT > 3) || (est.alpha > (F.CLmax / F.CLa) + 8 * D2R && modeT > 0.8 && est.va < p.Vs)) { met.launchFails++; setMode(MODE.BRAKE); stopT = t; ev(t, 'launchFail', 'warning', '起飞失败（触雪/失速）：刹车并收回', 'Launch failed (snow contact / stall): brake and retrieve'); }
        if (!riding) { setMode(MODE.BRAKE); stopT = t; }
        if (fallen) setMode(MODE.ABORT);
        break;
      case MODE.FLY:
        if (fallen) setMode(MODE.ABORT);
        else if (!riding) { setMode(MODE.BRAKE); stopT = t; sideT = 0; { const bk = unit([-est.vAm[0], -est.vAm[1], 0], [-1, 0, 0]); sideSgn = Math.sign(est.rel ? dot(est.rel, [-bk[1], bk[0], 0]) : 1) || 1; } ev(t, 'stop', 'info', '检测到停下：气刹深失速，只收松弛线', 'Stop detected: airbrake + deep stall, slack take-up only'); }
        else if ((lowT = est.LM < p.lowLiftAbort && est.va > 0 ? lowT + dt : 0) > 2.0) { setMode(MODE.BRAKE); stopT = t; ev(t, 'lowlift', 'warning', '升力裕度持续不足（空速计）：刹车收回', 'Lift margin too low for 2 s (pitot): brake and retrieve'); }
        else if (input.preDock && input.preDock.some((tp) => t >= tp && t < tp + dt * 1.5)) { setMode(MODE.FLYIN); stopT = t; ev(t, 'predock', 'info', '缆车站地理围栏：边滑边收回入舱', 'Lift geofence: fly in and dock while still riding'); }
        else if ((downT = hAbove() < 0.3 ? downT + dt : 0) > 0.8) { setMode(MODE.BRAKE); stopT = t; ev(t, 'downed', 'warning', '飞行中触雪：刹车、收回、带回背上', 'Flyer down on the snow while riding: brake, retrieve, dock'); }
        else {
          // gentle slow-down (lift approach): fly in and dock while still moving
          slowT = len(est.vA) < 4.5 && dot(est.aA, unit(est.vA)) < -0.2 ? slowT + dt : 0;
          if (slowT > 1.0) { setMode(MODE.FLYIN); stopT = t; ev(t, 'slowdock', 'info', '缓慢减速：边滑边收回入舱', 'Gentle slow-down: fly in and dock while still moving'); }
        }
        break;
      case MODE.BRAKE: {
        if (fallen) { setMode(MODE.ABORT); break; }
        // landed: estimated height low, or no airspeed, or the flyer IMU/UWB shows it at rest while the rider is stopped
        landT = hAbove() < 0.35 || (est.va < 1.2 && modeT > 1) || (!riding && modeT > 1.5 && len(est.vrel) < 0.5) ? landT + dt : 0;
        if (landT > 0.3) { setMode(MODE.LANDED); ev(t, 'landed', 'info', '飞行体落在身后雪面', 'Flyer down on the snow behind'); }
        else if (modeT > 4 && est.va > 1.3 * p.Vs && behindOK()) { setMode(MODE.FLYIN); ev(t, 'flyin', 'info', '有风：像风筝一样边飞边收', 'Wind holds it up: fly it in like a kite'); }
        if (riding && modeT > 3 && mode === MODE.BRAKE && behindOK()) setMode(MODE.FLYIN);
        break;
      }
      case MODE.LANDED: setMode(MODE.RETRIEVE); break;
      case MODE.FLYIN: case MODE.RETRIEVE:
        if (fallen) { setMode(MODE.ABORT); break; }
        if (mode === MODE.FLYIN && !behindOK() && !riding) { setMode(MODE.BRAKE); break; }
        if (retryPay && Lm >= 1.3 && (!riding || capFails < 2)) retryPay = false;
        if (Lm < 1.5 && !retryPay && !(riding && len(est.vA) > 3)) { setMode(MODE.CAPTURE); capWin = t; }
        break;
      case MODE.CAPTURE:
        if (Lout <= 0.3 + 1e-6) {
          const vRel = vRelLP, lineDir = unit(sub(pF, mouth));
          // quiver aligns to the MEASURED line direction within its hinge range (pitch −60…+45°, yaw ±50°, ASSUMED)
          const backH = unit([-BT.HD[ib][0], -BT.HD[ib][1], 0]), lat = [-backH[1], backH[0], 0];
          const mDir = est.rel ? unit(est.rel) : est.c; // align to the flyer's estimated position (UWB range + exit angle)
          const pit = clamp(Math.atan2(mDir[2], Math.max(1e-3, Math.hypot(dot(mDir, backH), dot(mDir, lat)))), -60 * D2R, 45 * D2R), yw = clamp(Math.atan2(dot(mDir, lat), Math.max(1e-3, dot(mDir, backH))), -50 * D2R, 50 * D2R);
          const qa = unit(add(add(mul(backH, Math.cos(pit) * Math.cos(yw)), mul(lat, Math.cos(pit) * Math.sin(yw))), [0, 0, Math.sin(pit)]));
          const ang = Math.acos(clamp(dot(qa, lineDir), -1, 1)) / D2R;
          const P = captureProb(vRel, ang, p.capScale), ok = capRng() < P;
          met.captures.push({ t: +t.toFixed(2), vRel: +vRel.toFixed(2), ang: +ang.toFixed(1), P: +P.toFixed(3), ok, try: capFails + 1 });
          if (ok) {
            setMode(MODE.DOCKED); if (riding) dockedThisRide = true; met.docks.push({ t: +t.toFixed(2), tStop: stopT, dockTime: stopT != null ? +(t - stopT).toFixed(2) : null, tries: capFails + 1, vRel: +vRel.toFixed(2), riding });
            ev(t, 'docked', 'info', `入舱锁定（第 ${capFails + 1} 次，到达 ${vRel.toFixed(1)} m/s，偏角 ${ang.toFixed(0)}°）`, `Docked and latched (try ${capFails + 1}, arrival ${vRel.toFixed(1)} m/s, ${ang.toFixed(0)}° off-axis)`);
            capFails = 0; capWin = null;
          } else {
            capFails++;
            ev(t, 'capFail', 'warning', `捕获失败（第 ${capFails} 次）：放出 1 m 再试`, `Capture failed (try ${capFails}): pay out 1 m and retry`);
            if (capFails >= 3 && riding) { setMode(MODE.RETRIEVE); retryPay = true; capFails = 2; ev(t, 'tow', 'warning', '滑行中三次未捕获：在 1.5 m 处拖着走，停下后再收', 'Three missed captures while riding: tow at 1.5 m and capture at the stop'); }
            else if (capFails >= 3) { setMode(MODE.MANUAL); met.manual++; manualT = 0; ev(t, 'manual', 'warning', '三次未捕获：骑手手动收纳（+1 次操作）', 'Three missed captures: manual stow by the rider (+1 action)'); }
            else { setMode(MODE.RETRIEVE); capWin = null; retryPay = true; }
          }
        }
        break;
      case MODE.DOCKED:
        if (modeT > 0.8) { setMode(MODE.STOWED); }
        break;
      case MODE.MANUAL:
        manualT += dt;
        // the rider stows by hand (counted as standstill even if the run plan moves on)
        if (manualT > 20) { setMode(MODE.DOCKED); met.docks.push({ t: +t.toFixed(2), tStop: stopT, dockTime: stopT != null ? +(t - stopT).toFixed(2) : null, tries: 99, manual: true }); }
        break;
      case MODE.ABORT: {
        // free-spool, deep stall; cutter on high tension or a closing flyer near the pack
        const closing = est.rel ? dot(est.vrel, unit(est.rel)) : 0;
        cutT = Tm > p.cutT || ((est.range || 9) < 2.2 && closing < -3) ? cutT + dt : 0;
        if (cutT > 0.15 && !cut) { cut = true; met.cutAt = t; setMode(MODE.FREE); ev(t, 'cut', 'warning', '摔倒后切线器动作：绳在出口处切断', 'Cutter fired after the fall: line cut at the exit'); }
        break;
      }
      default: break;
    }
    if (mode !== prev && (mode === MODE.ABORT)) ev(t, 'abort', 'warning', '检测到摔倒：深失速 + 放线自由', 'Fall detected: deep stall + free-spool');
    // ===================================================== reel law (pack, every step)
    const Tf2 = Tm;
    let vc = 0, freeSpool = false;
    const KEcap = Math.sqrt((2 * 14.9) / m) - 1;
    const govIn = (vin) => { // limit reel-in speed so |v_pack − c·v_in| stays below the KE speed cap
      if (vin >= 0 || !est.rel) return vin;
      let lo = vin, hi = 0; for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (len(sub(add(est.vA, est.vrel), mul(unit(est.rel), mid))) > KEcap) hi = mid; else lo = mid; }
      return len(sub(add(est.vA, est.vrel), mul(unit(est.rel), vin))) > KEcap ? hi : vin;
    };
    const ff = est.rel ? -p.kHeave * p.devK * dot(sub(est.vA, est.vAm), unit(est.rel)) : 0; // turn/heave motion of the exit along the line (pack GNSS/IMU)
    if (mode === MODE.LAUNCH) {
      // launch pay-out: feed-forward 1 m/s (ratchet released, plunger) + admittance on tension, ≤ vLaunch; hold if slack builds
      // phase A (line < 2.5 m): drift-back — the motor pays out on a ramp (≤ vLaunch) while the wing flies free at its own
      // trim behind the body; hold the ramp if the UWB range shows the line running slack. Phase B: tension-controlled pay-out
      if (Lm < 2.5) vc = (est.range || Lm) < Lm - 0.6 ? 0 : Math.min(p.vLaunch, 4.5 * modeT);
      else vc = Tf2 > 0.3 ? clamp(0.5 + 1.5 * (Tf2 - 0.8), 0.3, p.vLaunch) : 0;
    } else if (mode === MODE.FLY) {
      // kite-like length adaptation on surplus / deficit lift (pitot lift margin), within [Lmin, Lfilm + LmaxAdd]
      if (est.LM > 2.2 && cmd.brake > 0.6 && Tf2 > 1.3 * p.Tset) Ltgt = Math.min(p.Lfilm + p.LmaxAdd, Ltgt + 0.3 * dt);
      else if (est.LM < 1.4) Ltgt = Math.max(p.Lmin, Ltgt - 0.8 * dt); // lift deficit (pitot lift margin) — not a low elevation
      else Ltgt += clamp(p.Lfilm - Ltgt, -0.1 * dt, 0.1 * dt);
      const Lst = est.rel ? len(add(mul(est.dev, -p.devK), mul(unit(est.rel), Ltgt))) : Ltgt; // distance from the exit to the station
      vc = 0.8 * (Lst - Lm) + ff; dbgFF = ff; dbgLst = Lst;
      if (est.LM < 1.4 && Lm > p.Lmin) vc = Math.min(vc, -clamp(2.5 * (1.4 - est.LM), 0, 2)); // reel in for airspeed in a lull
      if (Tf2 < 0.4) vc = Math.min(vc, -1.5 * (0.4 - Tf2) / 0.4);                                // slack take-up
      if (Tf2 > 22) vc = Math.max(vc, 0.6 * (Tf2 - 22));                                        // shed overload by paying out
      vc = govIn(clamp(vc, -3, 6));
    } else if (mode === MODE.BRAKE) {
      vc = Tf2 < 0.3 ? govIn(-1.0) : Tf2 > 6 ? 0.5 * (Tf2 - 6) : 0;
    } else if (mode === MODE.FLYIN) {
      vc = govIn(Tf2 > 8 ? 0.3 : -p.vFlyin);
    } else if (mode === MODE.RETRIEVE) {
      vc = retryPay ? 1.0 : Tf2 > 12 ? 0.5 : govIn(-Math.min(p.vRet, Lm < 3 ? 1.5 : p.vRet) * (Tf2 > 8 ? 0.4 : 1));
      if (riding && len(est.vA) > 3) vc = clamp(0.8 * (4 - Lm), -p.vRet, 1.0); // still riding: tow flagged at 4 m (clear of the head) until the stop
      if (riding && len(est.vA) > 3 && Math.abs(4 - Lm) < 0.25 && Tf2 < 20) { holdRatchet = true; vc = 0; } else holdRatchet = false;
    } else if (mode === MODE.CAPTURE) vc = Tf2 > 10 || len(est.vrel) > 0.8 ? 0 : -p.vCap; // hold until the flyer settles (flyer IMU/UWB velocity)
    else if (mode === MODE.ABORT || mode === MODE.MANUAL) freeSpool = true;
    if (mode !== MODE.RETRIEVE) holdRatchet = false;
    vCmd = clamp(vc, vCmd - 8 * dt, vCmd + 8 * dt);
    const Ldot = vReel * sErr.lScale + 0.002 * gaussian(rng);
    intV = clamp(intV + (vCmd - Ldot) * dt, -2, 2);
    const Jt = (REEL.Jdrum + REEL.Jmotor * g2);
    const alphaCmd = (40 * (vCmd - Ldot) + 200 * intV) / r;
    iCmd = ratchet ? 0 : freeSpool ? (1.0 * r) / (REEL.Kt * REEL.gear) : (r * Math.max(0, Tf2) - Jt * alphaCmd) / (REEL.Kt * REEL.gear);
    // ===================================================== flyer commands (100 Hz, sent over the radio)
    if (airborne && step % Math.max(1, Math.round(p.ctrlDt / dt)) === 0 && !broken && !cut) {
      const cdt = p.ctrlDt;
      const q = 0.5 * RHO * sErr.rho * est.va * est.va;
      const aStall = F.CLmax / F.CLa;
      let aBc = cmd.aB, phiC = 0, br = cmd.brake, side = false;
      if (mode === MODE.LAUNCH || mode === MODE.FLY || mode === MODE.FLYIN) {
        // elevation = glide-ratio servo: the elevation PID commands an effective L/D (feed-forward tan of the target
        // elevation in the slope-tilted window); it is realised with the airbrake first, then by lowering CL when the
        // brake saturates (a draggy, depowered wing), and with full CL / no brake when the flyer sinks
        const eErr = est.elev - (mode === MODE.FLYIN ? p.elevFlyin : p.elev);
        est.bI = clamp(est.bI + 0.02 * cdt * eErr, -1.5, 1.5);
        const Gff = Math.tan(clamp((mode === MODE.FLYIN ? p.elevFlyin : p.elev) - p.slopeDeg, 10, 80) * D2R);
        const Gc = clamp(Gff * Math.exp(-(0.035 * eErr + est.bI + 0.02 * est.elevRate)), 0.25, 8);
        let CLd = clamp((2 * p.Tset + m * G) / Math.max(0.5, q * F.S), 0.25, 0.85 * F.CLmax);
        const cdOf = (cl) => F.CD0 + cl * cl * F.kInd;
        br = clamp((CLd / Gc - cdOf(CLd)) / F.CDbrake, 0, 1);
        if (br >= 1) { let lo = 0.12, hi = CLd; for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (mid / (cdOf(mid) + F.CDbrake) > Gc) hi = mid; else lo = mid; } CLd = lo; }
        if (mode === MODE.LAUNCH) { br = 0; CLd = Math.min(0.85 * F.CLmax, (3 * m * G) / Math.max(0.5, q * F.S)); }
        if (mode === MODE.FLYIN) CLd = Math.min(CLd, clamp((6 + m * G) / Math.max(0.5, q * F.S), 0.1, 0.7 * F.CLmax));
        if (Tm > 22) CLd *= 0.6;
        const aT = Math.min(CLd / F.CLa, aStall - 2.5 * D2R);
        if (Tm > 0.5 * m * G && !(mode === MODE.LAUNCH && Lm < 2.5)) est.aBI = clamp(est.aBI + 6 * cdt * (aT - est.alpha), F.aBminDeg * D2R, F.aBmaxDeg * D2R);
        aBc = mode === MODE.LAUNCH && Lm < 2.5 ? est.aBI : clamp(est.aBI + 0.3 * (aT - est.alpha), F.aBminDeg * D2R, F.aBmaxDeg * D2R);
      } else if (mode === MODE.BRAKE || mode === MODE.ABORT || mode === MODE.LANDED || mode === MODE.RETRIEVE || mode === MODE.CAPTURE || mode === MODE.MANUAL) {
        // deep stall (max drag, low lift); in the first ~1.2 s of a tailwind stop steer to the window side first
        const tailW = dot(est.W, unit(est.vAm, [1, 0, 0]));
        sideT += cdt;
        side = p.sideDrop && mode === MODE.BRAKE && tailW > p.tailSide && sideT < 1.2;
        aBc = side ? cmd.aB : F.aBmaxDeg * D2R; br = side ? 0.5 : 1;
        if (mode === MODE.RETRIEVE || mode === MODE.CAPTURE) { // flag the wing (AoA ≈ 0, no brake): minimum drag and lift while it is towed in
          if (Tm > 0.5 * m * G) est.aBI = clamp(est.aBI + 6 * cdt * (0 - est.alpha), F.aBminDeg * D2R, F.aBmaxDeg * D2R);
          aBc = Math.min(est.aBI, F.aSlackRefDeg * D2R); br = 0;
        }
      }
      // roll loop to the window target (mean-course window, commanded azimuth offset), K_φ > 1 + rate damping;
      // side-drop at a tailwind stop: same law, target 80° to the side the flyer is already on, 20° elevation
      // (on a short or slack line the wing is held wings-level: the exit-angle geometry is meaningless there)
      if ((mode === MODE.FLY || mode === MODE.FLYIN || side || (mode === MODE.LAUNCH && Lm > 1.5 && Tm > 0.5)) && est.uE && est.rel) {
        const cu = unit(est.rel), Lr = len(est.rel);
        const d3 = unit([appW[0], appW[1], 0], [-1, 0, 0]);
        const back = unit([-est.vAm[0], -est.vAm[1], 0], [-1, 0, 0]);
        // window centre azimuth relative to "behind the course"; target = commanded shot offset kept within ±50° of it
        const cAz = Math.atan2(back[0] * d3[1] - back[1] * d3[0], dot(back, d3));
        const az = side ? sideSgn * 80 * D2R : clamp(shotAz(t) * D2R, cAz - 50 * D2R, cAz + 50 * D2R);
        const lat = [-back[1], back[0], 0];
        const hz = unit(add(mul(back, Math.cos(az)), mul(lat, Math.sin(az))));
        const el = (side ? 20 : mode === MODE.LAUNCH ? Math.max(p.elev, 45) : mode === MODE.FLYIN ? p.elevFlyin : p.elev) * D2R;
        // station: a point on the mean course (the exit's turn-by-turn swing est.dev is removed), at the target
        // azimuth/elevation and the length target; the reel absorbs the distance change, the wing does not chase the exit
        const Lst = mode === MODE.LAUNCH ? Math.max(Lr, 1) : Ltgt;
        const Pst = add(mul(est.dev, side ? 0 : -p.devK), mul(unit(add(mul(hz, Math.cos(el)), [0, 0, Math.sin(el)])), Lst));
        const errP0 = mul(sub(Pst, est.rel), 1 / Math.max(1, Lr)), errP = sub(errP0, mul(cu, dot(errP0, cu)));
        const vrP0 = add(est.vrel, mul(sub(est.vA, est.vAm), side ? 0 : p.devK)), vrP = sub(vrP0, mul(cu, dot(vrP0, cu)));
        const L0 = unit(sub(cu, mul(est.uE, dot(cu, est.uE)))), sAx = crs(est.uE, L0);
        const eLat = dot(errP, sAx), eRate = -dot(vrP, sAx) / Math.max(1, Lr);
        const Lhat = Math.max(0.5, q * F.S * Math.max(0.2, F.CLa * Math.max(0.05, est.alpha)));
        // bank authority shrinks when the flyer is low in the window (altitude has priority over the lateral station)
        const pm = (p.phiMax ?? F.phiMaxDeg) * D2R * (side ? 1 : clamp((est.elev - p.elevBank0) / 20, 0.15, 1));
        phiC = clamp(Math.asin(clamp(p.kPhi * eLat + (m * Math.max(1, Lr) * p.kPhiD * eRate) / Lhat, -0.95, 0.95)), -pm, pm);
      }
      cmd = { aB: aBc, phi: phiC, brake: br };
      radio.push(t, cmd);
    }
    // ===================================================== logging (20 ms)
    if (step % every === 0 && ai < nS) {
      const i = ai++;
      const fw = airborne ? bodyNose : ax.map((x) => -x), upv = airborne ? bodyUp : upB;
      const set = (k, v) => { O[k][i] = v; };
      set('mode', mode); set('quiver', quiver);
      [['fx', 'fy', 'fz'], ['fvx', 'fvy', 'fvz'], ['bfx', 'bfy', 'bfz'], ['bux', 'buy', 'buz'], ['ex', 'ey', 'ez'], ['evx', 'evy', 'evz'], ['hx', 'hy', 'hz'], ['sx', 'sy', 'sz'], ['ax', 'ay', 'az'], ['sag1x', 'sag1y', 'sag1z'], ['sag2x', 'sag2y', 'sag2z'], ['Fbx', 'Fby', 'Fbz']]
        .forEach(([a, b, c], k) => { const vv = [pF, vF, fw, upv, mouth, e.v, BT.H[ib], BT.S[ib], ax, sag1, sag2, Fexit][k]; set(a, vv[0]); set(b, vv[1]); set(c, vv[2]); });
      if (podOn && !podDocked && pP) { set('qx', pP[0]); set('qy', pP[1]); set('qz', pP[2]); set('qvx', vP[0]); set('qvy', vP[1]); set('qvz', vP[2]); }
      set('L', Lout); set('L1', podOn && !podDocked ? Lout - P0len : NaN); set('T', len(Fexit)); set('Tf', Tf); set('Tm', Tm); set('va', Va); set('vaM', est.va);
      set('alpha', alpha / D2R); set('CL', CL); set('CD', CDt); set('brake', brake); set('phi', (phi + phiDist) / D2R); set('theta', theta / D2R);
      set('vr', vReel); set('iM', iM); set('Pel', REEL.R * iM * iM + REEL.Kt * (-wM * REEL.gear) * iM); set('Vbus', clamp(p.V0 - REEL.Rbatt * Ibatt, 6, REEL.Vclamp)); set('E', met.Ebatt); set('slip', slip ? 1 : 0);
      const ch = sub(pF, mouth); set('elev', Math.atan2(ch[2], Math.hypot(ch[0], ch[1])) / D2R); set('elevM', est.elev); set('LM', est.LM); set('Ltgt', Ltgt);
      set('wx', wF[0]); set('wy', wF[1]); set('wz', wF[2]); set('wex', est.W[0]); set('wey', est.W[1]);
      set('snow', -pF[0] * sk.tanS); set('riding', riding ? 1 : 0); set('contact', t - contactT < 0.05 ? 1 : 0); set('capWin', capWin != null ? 1 : 0); set('cut', broken ? 2 : cut ? 1 : 0);
      if (est.rel && airborne) { set('erx', est.rel[0]); set('ery', est.rel[1]); set('erz', est.rel[2]); } set('ecx', est.c[0]); set('ecy', est.c[1]); set('ecz', est.c[2]);
      set('L1m', podOn && !podDocked ? (Lout - P0len) * sErr.lScale : NaN); set('vax', est.vAm ? est.vAm[0] : NaN); set('vay', est.vAm ? est.vAm[1] : NaN); set('podOn', podOn && !podDocked ? 1 : 0);
      set('azW', NaN); set('F50', f50max); f50max = 0; set('dbg1', len(est.dev)); set('dbg2', dbgFF); set('dbg3', dbgLst);
    }
    // pod gripping / docking logic (line-camera variant)
    if (!p.camOn) {
      if (podDocked && (mode === MODE.LAUNCH || mode === MODE.FLY) && Lout >= p.Lfilm - p.sCam && !broken && !cut) {
        podOn = true; podDocked = false; P0len = Lout; pP = [...mouth]; vP = [...e.v];
        ev(t, 'podGrip', 'info', `相机吊舱在出口夹住绳并随绳放出（上段 ${P0len.toFixed(1)} m）`, `Camera pod grips the line at the exit and rides out with it (upper segment ${P0len.toFixed(1)} m)`);
      } else if (podOn && !podDocked && Lout - P0len < 0.15 && (mode === MODE.BRAKE || mode === MODE.RETRIEVE || mode === MODE.FLYIN || mode === MODE.CAPTURE || mode === MODE.LANDED)) {
        podDocked = true; podOn = false; ev(t, 'podDock', 'info', '相机吊舱回到喇叭口并松开绳', 'Camera pod back in the trumpet, releases the line');
      }
      if (podDocked) { pP = [...mouth]; vP = [...e.v]; }
    }
  }
  met.snowLog = snowLog;
  return { p, O, n: nS, SDT, events, met, tanS: sk.tanS, sk, BT, det, fallT, duration: T, wind, windEst: wEst };
}
