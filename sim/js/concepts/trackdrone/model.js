// S2 trackdrone physics (SIM-030): a <=249 g ducted quad that replays the
// rider's own recent track, located by a wearable UWB/GNSS-RTK beacon, and
// launches from / docks onto a backpack pod. Deterministic, time-stepped
// (internal dt 5 ms), model coordinates (x downslope, y left, z up, metres).
//
// Vehicle   m·a = F + F_drag − m·g·ẑ,  F = thrust vector with first-order
//           attitude/thrust lag (τ_att), |F| ≤ (T/W)max·W, tilt ≤ θmax.
//           F_drag = −c_lin·v_air − ½ρ·CdA(θ)·|v_air|·v_air, v_air = v − wind,
//           CdA(θ) = CdA0 + CdA_tilt·sin²θ (ducts present more area when tilted).
// Power     momentum theory with figure of merit and Glauert inflow (same form
//           as research/.../aerial/calc_rotor_follow.py), plus parasite and
//           climb power and avionics. ρ from ISA pressure at altitude and the
//           actual temperature.
// Battery   3S Li-ion: OCV(SoC) − I·R(T) with temperature-dependent internal
//           resistance and usable-capacity derating; lumped thermal mass with
//           I²R self-heating; starts at the heated pod's temperature.
// Beacon    10 Hz UWB/RTK fused fixes with Gaussian noise, latency, dropouts;
//           α–β filter at packet rate, latency-compensated continuous estimate.
// Guidance  breadcrumb replay: reference = rider track at (t − τ), τ = d/v
//           clamped to [τmin, τmax], smoothed within a cross-track bound,
//           +h above the planar snow; lookahead tangent feedforward; along-track
//           braking governor and a 3-D keep-out guard around the rider; cascaded
//           P(position) → PI(velocity) → thrust-vector control.
// Gimbal    3-axis, rate-limited follower aimed at the beacon estimate; residual
//           jitter; 4K 85° HFOV with ≤2× electronic crop to frame the rider.
// Evidence: numerical-uncalibrated; all vehicle numbers are ASSUMED design
// points or CALC from the ideation scripts. Not a physical test.
import { simulateSkier, skierAt, bodyPoints } from '../common/skier.js';
import { footage } from '../common/env.js';
import { mulberry32 } from '../../model/util.js';

export const G = 9.81;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const K_I = 0.7, ETA_P = 0.55; // calc_rotor_follow.py (assumed there)

export const DEFAULTS = {
  // vehicle (A02 design point, calc_rotor_follow.py)
  mass: 0.245, rotorD: 0.076, fom: 0.38, twMax: 2.6, tiltMaxDeg: 65,
  CdA: 0.016, CdAtilt: 0.006, cLin: 0.03, tauAtt: 0.07, tauDob: 0.06, pAvionics: 3.5, droneR: 0.13,
  // environment
  altM: 2000, tempC: -10,
  // battery: 75 g pack, 3S Li-ion, 13.5 Wh nominal
  battWh: 13.5, battR25: 0.045, podTempC: 5, reserve: 0.15,
  // guidance
  followDist: 6, lagMin: 0.3, lagMax: 2.0, lookahead: 0.3, hFollow: 3.0, speedCap: 22,
  crossLimit: 0.6, guard3D: 3.0, guardAlong: 3.5, aBrake: 8, smoothWin: 0.6, holdDist: 5,
  // beacon (fused UWB + RTK + IMU)
  beaconSigma: 0.04, beaconLatency: 0.1, beaconRate: 10,
  // camera / gimbal
  hfovDeg: 85, maxCrop: 2, targetFill: 0.45, gimbalRateDeg: 200,
  // dock
  captureR: 0.06, abortErr: 0.04, maxAttempts: 3, descRate: 0.35,
  // optional leash (A09 safety leash); energy 2 = tow leash (the rider provides propulsion)
  leash: 0, leashLen: 20, energy: 1, packs: 1,
  // design generation: 1 = v1 (as iteration 1), 2 = v2 (faired airframe, swappable packs, capture cone, curvature-limited replay)
  design: 1, keCap: 0, smoothCap: 0.21, dockMode: 1, standHeadingIntoWind: 0, battC: 10,
};

// Expand the user parameters into a full vehicle definition for the chosen design.
// v2 scales the airframe from the 245 g reference by mass (s = m/0.245): rotor
// diameter ∝ √s (equal disc loading), drag areas ∝ s^(2/3), pack energy ∝ s.
export function designParams(Pin = {}) {
  const P = { ...DEFAULTS, ...Pin };
  if ((P.design || 1) >= 2) {
    const m = clamp(Pin.mass ?? 0.15, 0.08, 0.249), s = m / 0.245, s23 = Math.pow(s, 2 / 3);
    Object.assign(P, {
      mass: m, rotorD: 0.076 * Math.sqrt(s), CdA: (Pin.CdA ?? 0.008) * s23, CdAtilt: 0.005 * s23, cLin: 0.03 * s23,
      droneR: 0.13 * Math.sqrt(s), battWh: 13.5 * s, packMass: 0.075 * s, podMass: 0.07 + 0.03 * s,
      podTempC: 15, captureR: Pin.captureR ?? 0.10, abortErr: 0.06, dockMode: Pin.dockMode ?? 2, standHeadingIntoWind: Pin.standHeadingIntoWind ?? 1,
      smoothWin: 0.8, smoothCap: 0.25, keCap: Pin.keCap ?? 14.9, packs: Pin.packs ?? 6, energy: Pin.energy ?? 1,
      leash: (Pin.energy ?? 1) === 2 ? 2 : Pin.leash ?? 0, leashLen: (Pin.energy ?? 1) === 2 ? 20 : 20,
    });
    // v3: vision fallback for the rider, forward depth sensor with avoidance and person yield, leapfrog/pan mode
    const v3 = P.design >= 3;
    // v3: smooth across the swept band of the turns (the rider's swing width is part of the verified corridor);
    // the raw ski/chest line is flown only when the depth sensor sees an obstacle
    if (v3) { P.smoothWin = Pin.smoothWin ?? 2.0; P.smoothCap = Pin.smoothCap ?? 0.8; }
    Object.assign(P, { vision: v3 ? 1 : 0, obsSensor: v3 ? 1 : 0, personYield: v3 ? 1 : 0, leap: v3 ? 1 : 0,
      lightFactor: Pin.lightFactor ?? 1, sensorRange: Pin.sensorRange ?? 12, sensorFovDeg: Pin.sensorFovDeg ?? 120, sensorLatency: 0.1 });
  } else {
    Object.assign(P, { vision: 0, obsSensor: 0, personYield: 0, leap: 0, design: 1, mass: 0.245, rotorD: 0.076, CdA: 0.016, CdAtilt: 0.006, cLin: 0.03, droneR: 0.13, battWh: 13.5, packMass: 0.075, podMass: 0.12,
      podTempC: 5, captureR: 0.06, abortErr: 0.04, dockMode: 1, standHeadingIntoWind: 0, smoothWin: 0.6, smoothCap: 0.21, packs: 1, energy: 1 });
  }
  P.__expanded = true;
  return P;
}

export function airDensity(altM, tempC) {
  const Tisa = 288.15 - 0.0065 * altM;
  const p = 101325 * Math.pow(Tisa / 288.15, 5.2559);
  return p / (287.05 * (tempC + 273.15));
}

export function derive(P) {
  if (!P.__expanded) P = designParams(P);
  const rho = airDensity(P.altM, P.tempC);
  const A = 4 * Math.PI * (P.rotorD / 2) ** 2;
  const W = P.mass * G;
  const PhW = Math.sqrt(W ** 3 / (2 * rho * A)) / P.fom;
  const vh = Math.sqrt(W / (2 * rho * A));
  const vnHfov = (P.hfovDeg * Math.PI) / 180;
  const vfovNative = 2 * Math.atan(Math.tan(vnHfov / 2) * 9 / 16);
  return { rho, A, W, PhW, vh, Tmax: P.twMax * W, tiltMax: (P.tiltMaxDeg * Math.PI) / 180, vfovNative };
}

function vInducedForward(vh, V) { return Math.sqrt((-V * V + Math.sqrt(V ** 4 + 4 * vh ** 4)) / 2); }

// electrical power (W) for thrust T (N), airspeed V, parasite drag magnitude Dp, climb rate vz
export function elecPower(D, P, T, V, Dp, vz) {
  const Tn = Math.max(T, 0.05 * D.W);
  const vhT = D.vh * Math.sqrt(Tn / D.W);
  const vi = vInducedForward(vhT, V);
  const pInd = D.PhW * (K_I * Math.pow(Tn / D.W, 1.5) * (vi / vhT) + (1 - K_I));
  const pPar = (Dp * V) / ETA_P;
  const pClimb = vz > 0 ? (D.W * vz) / 0.6 : 0;
  return pInd + pPar + pClimb + P.pAvionics;
}

// level-flight trim (tilt, power) at steady airspeed V — used by tests/limits
export function trim(P, V) {
  if (!P.__expanded) P = designParams(P);
  const D = derive(P);
  let th = 0;
  for (let k = 0; k < 60; k++) {
    const CdA = P.CdA + P.CdAtilt * Math.sin(th) ** 2;
    const Dp = 0.5 * D.rho * CdA * V * V + P.cLin * V;
    th = Math.atan2(Dp, D.W);
  }
  const CdA = P.CdA + P.CdAtilt * Math.sin(th) ** 2;
  const Dp = 0.5 * D.rho * CdA * V * V + P.cLin * V;
  const T = Math.hypot(D.W, Dp);
  return { tiltDeg: (th * 180) / Math.PI, T, feasible: th <= D.tiltMax && T <= D.Tmax, power: elecPower(D, P, T, V, 0.5 * D.rho * CdA * V * V, 0) };
}

// ------------------------------------------------------------------ battery (3S)
const OCV = [[0, 3.0], [0.05, 3.3], [0.1, 3.45], [0.2, 3.56], [0.5, 3.72], [0.8, 3.95], [1, 4.18]];
function ocvCell(soc) {
  soc = clamp(soc, 0, 1);
  for (let i = 1; i < OCV.length; i++) if (soc <= OCV[i][0]) { const [a, va] = OCV[i - 1], [b, vb] = OCV[i]; return va + ((vb - va) * (soc - a)) / (b - a); }
  return 4.18;
}
export const battR = (P, Tb) => P.battR25 * Math.exp(0.035 * (25 - clamp(Tb, -30, 45)));
export const capFactor = (Tb) => clamp(1 - 0.0085 * (25 - Tb), 0.5, 1); // ≈0.70 at −10 °C (assumed 0.70–0.80)
const CELLS = 3, QAH = (P) => P.battWh / (3.7 * CELLS);

// ------------------------------------------------------------------ rider
// rider wrapper: optional standing period before push-off, straight approach
// history for t < 0 when the run starts moving, or standing throughout
export function makeRider(o = {}) {
  const sk = simulateSkier({ ...(o.skier || {}) });
  const tGo = o.tGo || 0;
  const s0 = skierAt(sk, 0);
  const moving = !o.standing && tGo === 0 && sk.opts.start !== 'push' && sk.opts.v0 > 0;
  const v0 = sk.opts.v0;
  const sh = o.standHeading ? (() => { const l = Math.hypot(o.standHeading[0], o.standHeading[1]) || 1; return [o.standHeading[0] / l, o.standHeading[1] / l, 0]; })() : s0.heading;
  const stand = { ...s0, heading: sh, pos: s0.pos.slice(), vel: [0, 0, 0], speed: 0, lat: 0, accel: 0, lean: 0, crouch: 0.12, plantL: 0, plantR: 0, fallen: false };
  return {
    sk, tGo, tanS: sk.tanS, standing: !!o.standing, moving,
    at(t) {
      const tt = t - tGo;
      if (tt < 0 && moving) {
        const h = s0.heading;
        const pos = [s0.pos[0] + h[0] * v0 * tt, s0.pos[1] + h[1] * v0 * tt, 0];
        pos[2] = -pos[0] * sk.tanS;
        return { ...s0, pos, speed: v0, lat: 0, accel: 0, lean: 0 };
      }
      if (o.standing || t < tGo) return stand;
      return skierAt(sk, tt);
    },
  };
}

// body geometry used by the model (beacon on the left shoulder strap, pod on top of the pack)
let geomMemoS = null, geomMemoG = null;
export function riderGeom(s) {
  if (s === geomMemoS) return geomMemoG;
  geomMemoS = s; geomMemoG = riderGeomRaw(s);
  return geomMemoG;
}
function riderGeomRaw(s) {
  const b = bodyPoints(s);
  const h = s.heading, L = b.left, U = b.up;
  const ax = (p, f, l, u) => [p[0] + h[0] * f + L[0] * l + U[0] * u, p[1] + h[1] * f + L[1] * l + U[1] * u, p[2] + h[2] * f + L[2] * l + U[2] * u];
  if (s.fallen) {
    const feet = s.pos;
    return { feet, top: [feet[0], feet[1], feet[2] + 0.5], head: [feet[0] + h[0] * 0.9, feet[1] + h[1] * 0.9, feet[2] + 0.25], beacon: [feet[0], feet[1], feet[2] + 0.35], pod: [feet[0] - h[0] * 0.4, feet[1] - h[1] * 0.4, feet[2] + 0.3], mid: [feet[0], feet[1], feet[2] + 0.3], up: [0, 0, 1], left: L };
  }
  return {
    feet: s.pos, top: ax(b.head, 0, 0, 0.13), head: b.head,
    beacon: ax(b.chest, 0.09, 0.11, 0.13),
    pod: ax(b.packTop, -0.22, 0, 0.06),
    mid: b.chest.map((v, i) => v - U[i] * 0.3),
    up: U, left: L,
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
export function segDist(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a);
  const u = clamp(dot(ap, ab) / Math.max(1e-9, dot(ab, ab)), 0, 1);
  return len([ap[0] - ab[0] * u, ap[1] - ab[1] * u, ap[2] - ab[2] * u]);
}

// ------------------------------------------------------------------ obstacles
// conifer: trunk radius rT up to H, canopy cone from radius Rb at h0 to 0 at H;
// optional branch capsule {a, b, r} (absolute model coords)
export function treeClearance(p, tr, tanS) {
  const zb = -tr.x * tanS, h = p[2] - zb, dh = Math.hypot(p[0] - tr.x, p[1] - tr.y);
  let c = Infinity;
  if (h < tr.H) c = dh - tr.rT;
  const cosA = Math.cos(Math.atan2(tr.Rb, tr.H - tr.h0));
  if (h >= tr.h0 && h <= tr.H) c = Math.min(c, (dh - (tr.Rb * (tr.H - h)) / (tr.H - tr.h0)) * cosA);
  else if (h > tr.H) c = Math.min(c, Math.hypot(dh, h - tr.H));
  else c = Math.min(c, dh < tr.Rb ? tr.h0 - h : Math.hypot(dh - tr.Rb, tr.h0 - h));
  if (tr.branch) c = Math.min(c, segDist(p, tr.branch.a, tr.branch.b) - tr.branch.r);
  return c;
}

// ------------------------------------------------------------------ mission engine
export const MODES = ['docked', 'launch', 'follow', 'side', 'hold', 'orbit', 'dock', 'lost', 'landed', 'crashed', 'leap'];
const M = Object.fromEntries(MODES.map((m, i) => [m, i]));
export const FILMING = new Set([M.follow, M.side, M.hold, M.orbit, M.lost, M.leap]);

export function runMission(Pin, cfg) {
  const P = Pin.__expanded ? Pin : designParams(Pin);
  const D = derive(P);
  const dt = cfg.dtInt || 0.005, sDt = 0.02;
  const every = Math.round(sDt / dt);
  const nS = Math.floor(cfg.duration / sDt + 1e-9) + 1;
  const rider = cfg.rider, tanS = rider.tanS;
  const zT = (x) => -x * tanS;
  const rng = mulberry32(cfg.seed || 11);
  const gauss = () => { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
  const wind = cfg.wind || (() => [0, 0, 0]);
  const wake = cfg.wake || null;
  const trees = cfg.trees || [];
  const other = cfg.other || null;
  const mission = (cfg.mission || []).slice().sort((a, b) => a.t - b.t);
  const dropouts = (cfg.beacon && cfg.beacon.dropouts) || [];
  const degrade = (cfg.beacon && cfg.beacon.degrade) || [];
  const m = P.mass;
  const events = [];
  const ev = (t, type, severity, zh, en) => events.push({ t: +t.toFixed(3), type, severity, zh, en });

  // ---- columns
  const C = {};
  const colNames = ['t', 'dx', 'dy', 'dz', 'vx', 'vy', 'vz', 'gs', 'air', 'tilt', 'thrust', 'power', 'soc', 'vcell', 'tb', 'ke',
    'distRider', 'horizRider', 'headClr', 'clrTree', 'distOther', 'crossErr', 'lag', 'trail', 'riderV', 'mode', 'beaconOk', 'estErr',
    'camx', 'camy', 'camz', 'fx', 'fy', 'fz', 'gx', 'gy', 'gz', 'vfov', 'crop', 'yaw', 'ax', 'ay', 'az', 'spin', 'lid', 'dockErr', 'podx', 'pody', 'podz', 'btn',
    'leashT', 'altAgl', 'refx', 'refy', 'refz', 'wx', 'wy'];
  for (const k of colNames) C[k] = new Float64Array(nS).fill(NaN);

  // ---- beacon & estimator
  const rate = P.beaconRate, Tp = 1 / rate;
  const cap = Math.ceil((cfg.duration + 6) * rate) + 64;
  const bt = new Float64Array(cap), bx = new Float64Array(cap), by = new Float64Array(cap), bs = new Float64Array(cap), box = new Float64Array(cap), boy = new Float64Array(cap);
  let nB = 0;
  const xd = [0, 0, 0], vd = [0, 0, 0], ad = [0, 0, 0], off = [0, 0, 0], voff = [0, 0, 0];
  let tm = -1e9, lastArrival = -1e9, init = false, okCount = 0, lost = false;
  const pushCrumb = (t, x, y, ox = 0, oy = 0) => {
    if (nB > 0) { const ds = Math.hypot(x - bx[nB - 1], y - by[nB - 1]); bs[nB] = bs[nB - 1] + ds; } else bs[nB] = 0;
    bt[nB] = t; bx[nB] = x; by[nB] = y; box[nB] = ox; boy[nB] = oy; nB++;
  };
    // pre-history (moving start): the rider came straight in; breadcrumbs exist
  if (rider.moving) {
    for (let k = -40; k < 0; k++) { const tt = k * Tp; const g = riderGeom(rider.at(tt)); pushCrumb(tt, g.beacon[0], g.beacon[1], g.feet[0] - g.beacon[0], g.feet[1] - g.beacon[1]); }
    const g0 = riderGeom(rider.at(-Tp)), s0 = rider.at(-Tp);
    for (let i = 0; i < 3; i++) { xd[i] = g0.beacon[i]; vd[i] = s0.vel[i]; }
    tm = -Tp; lastArrival = 0; init = true; okCount = 10;
  }
  let nextPkt = rider.moving ? P.beaconLatency : 0;
  let visCam = null, visHits = 0, visMiss = 0;
  const horizonEff = (dtp) => (dtp < 0.4 ? dtp : 0.4 + 0.6 * (1 - Math.exp(-(dtp - 0.4) / 0.6)));
  const estAt = (t) => {
    const hz = horizonEff(t - tm), ha = Math.min(t - tm, 0.3), h2 = 0.5 * ha * ha;
    return [xd[0] + vd[0] * hz + ad[0] * h2 + off[0], xd[1] + vd[1] * hz + ad[1] * h2 + off[1], xd[2] + vd[2] * hz + ad[2] * h2 + off[2]];
  };
  const estVel = (t) => { const f = t - tm < 0.4 ? 1 : Math.exp(-(t - tm - 0.4) / 0.6), ha = Math.min(t - tm, 0.3); return [(vd[0] + ad[0] * ha) * f + voff[0], (vd[1] + ad[1] * ha) * f + voff[1], (vd[2] + ad[2] * ha) * f + voff[2]]; };
  const inDrop = (t) => dropouts.some(([a, b]) => t >= a && t < b);
  const sigmaAt = (t) => { for (const [a, b, s] of degrade) if (t >= a && t < b) return s; return P.beaconSigma; };

  // The beacon fuses UWB/RTK fixes with its own IMU on the rider and sends its
  // state (position, velocity, acceleration) at 10 Hz. Fused position error is
  // modelled as a correlated (Ornstein–Uhlenbeck) process with σ = beaconSigma
  // and 0.3 s correlation; velocity/acceleration errors as white noise.
  const eOU = [0, 0, 0];
  let tOU = null;
  const bTruth = (tt) => riderGeom(rider.at(tt)).beacon;
  function packet(ta, tNow) {
    let tmeas = ta - P.beaconLatency;
    let meas, vel, acc;
    if (inDrop(tmeas)) {
      // v3 fallback: onboard visual tracker of the rider (gimbal camera). Detection probability falls with
      // distance (≈0.97 up to 12 m, 0 at ~30 m) × lighting factor, needs the rider within 0.45 rad of the axis;
      // range noise 3 % of distance, bearing noise ≈0.23°; 0.08 s latency. ASSUMED tracker performance.
      if (!P.vision || !visCam) return;
      tmeas = ta - 0.08;
      const b0 = bTruth(tmeas), bm = bTruth(tmeas - 0.05), bp = bTruth(tmeas + 0.05);
      const dv = sub(b0, visCam.pos), d = len(dv), u = [dv[0] / d, dv[1] / d, dv[2] / d];
      const off = Math.acos(clamp(dot(u, visCam.fwd), -1, 1));
      const pDet = (d < 12 ? 0.97 : Math.max(0, 0.97 * (1 - (d - 12) / 18))) * P.lightFactor * (off < 0.45 ? 1 : 0);
      if (rng() > pDet) { visMiss++; return; }
      const er = 0.03 * d * gauss(), el = 0.004 * d;
      const tA = [-u[1], u[0], 0], tl = Math.hypot(tA[0], tA[1]) || 1;
      const a1 = el * gauss(), a2 = el * gauss();
      meas = [0, 1, 2].map((i) => b0[i] + u[i] * er + (tA[i] / tl) * a1 + (i === 2 ? a2 : 0));
      vel = [0, 1, 2].map((i) => (bp[i] - bm[i]) / 0.1 + 0.3 * gauss());
      acc = [0, 0, 0];
      visHits++;
    } else {
    const sg = sigmaAt(tmeas);
    const b0 = bTruth(tmeas), bm = bTruth(tmeas - 0.02), bp = bTruth(tmeas + 0.02);
    const kz = [1, 1, 1.6];
    const rho = tOU === null ? 0 : Math.exp(-(tmeas - tOU) / 0.3);
    for (let i = 0; i < 3; i++) eOU[i] = rho * eOU[i] + Math.sqrt(1 - rho * rho) * sg * kz[i] * gauss();
    tOU = tmeas;
    meas = [0, 1, 2].map((i) => b0[i] + eOU[i]);
    vel = [0, 1, 2].map((i) => (bp[i] - bm[i]) / 0.04 + (0.03 + 0.5 * sg) * gauss());
    acc = [0, 1, 2].map((i) => clamp((bp[i] - 2 * b0[i] + bm[i]) / 0.0004, -25, 25) * 0.8 + 0.3 * gauss());
    }
    const before = estAt(tNow), vBefore = estVel(tNow);
    const gap = tmeas - tm;
    if (init && gap < 1e-6) return;
    for (let i = 0; i < 3; i++) { xd[i] = meas[i]; vd[i] = vel[i]; ad[i] = acc[i]; }
    // breadcrumb = ground point under the rider: the beacon IMU knows its tilt, so the lean-induced chest
    // offset (up to ~0.6 m inside a carved turn) is removed before the track is stored
    const gm = riderGeom(rider.at(tmeas)), hB = dot(sub(gm.beacon, gm.feet), gm.up);
    // the replay line stays the beacon (chest) track, which is naturally inside of the ski line in turns;
    // v3 also stores the offset to the ground point under the rider (beacon IMU tilt) for flying near obstacles
    const cx = meas[0], cy = meas[1];
    const ox = -(gm.up[0] * hB + 0.02 * hB * gauss()), oy = -(gm.up[1] * hB + 0.02 * hB * gauss()); // chest → ground point
    if (!init) { init = true; tm = tmeas; lastArrival = ta; pushCrumb(tmeas, cx, cy, ox, oy); return; }
    if (nB > 0 && tmeas - bt[nB - 1] > 0.5) ev(tNow, 'corridorGap', 'warning', `信标恢复：${(tmeas - bt[nB - 1]).toFixed(1)} s 的轨迹缺口按直线补齐，该段走廊未经验证`, `Beacon back: ${(tmeas - bt[nB - 1]).toFixed(1)} s track gap bridged by a straight line; corridor not verified there`);
    tm = tmeas; lastArrival = ta;
    const after = estAt(tNow), vAfter = estVel(tNow);
    for (let i = 0; i < 3; i++) { off[i] += before[i] - after[i]; voff[i] += vBefore[i] - vAfter[i]; }
    if (!(nB > 0 && Math.hypot(cx - bx[nB - 1], cy - by[nB - 1]) < 0.15)) pushCrumb(tmeas, cx, cy, ox, oy); // ≥0.15 m spacing: no noise loops while standing
    else { bt[nB - 1] = tmeas; }
    okCount++;
  }

  // ---- track queries
  function idxAtTime(tq) { // largest i with bt[i] <= tq
    if (nB === 0) return -1;
    if (tq >= bt[nB - 1]) return nB - 1;
    if (tq <= bt[0]) return 0;
    let lo = 0, hi = nB - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (bt[mid] <= tq) lo = mid; else hi = mid; }
    return lo;
  }
  function posAtTime(tq) {
    const i = idxAtTime(tq);
    if (i >= nB - 1) { const k = Math.max(0, nB - 1); const ex = Math.min(0.6, Math.max(0, tq - bt[k])); return [bx[k] + vd[0] * ex, by[k] + vd[1] * ex, bs[k] + Math.hypot(vd[0], vd[1]) * ex]; }
    const w = clamp((tq - bt[i]) / Math.max(1e-6, bt[i + 1] - bt[i]), 0, 1);
    return [bx[i] + (bx[i + 1] - bx[i]) * w, by[i] + (by[i + 1] - by[i]) * w, bs[i] + (bs[i + 1] - bs[i]) * w];
  }
  function timeAtS(sq) {
    if (nB === 0) return 0;
    if (sq >= bs[nB - 1]) return bt[nB - 1];
    if (sq <= bs[0]) return bt[0];
    let lo = 0, hi = nB - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (bs[mid] <= sq) lo = mid; else hi = mid; }
    const w = (sq - bs[lo]) / Math.max(1e-9, bs[hi] - bs[lo]);
    return bt[lo] + (bt[hi] - bt[lo]) * w;
  }
  // nearest point on the raw polyline around hint index
  function nearestIdx(px, py) {
    let best = Infinity, bi = 0;
    for (let i = Math.max(0, nB - 600); i < nB; i++) { const d = Math.hypot(px - bx[i], py - by[i]); if (d < best) { best = d; bi = i; } }
    return bi;
  }
  function smoothPos(tq) {
    // Gaussian-weighted window (curvature limiting) clipped to stay inside the verified corridor
    let sx = 0, sy = 0, sw = 0;
    for (let j = -4; j <= 4; j++) { const wj = Math.exp(-0.5 * (j / 2) ** 2), q = posAtTime(Math.min(tq + (j * P.smoothWin) / 8, bt[nB - 1])); sx += q[0] * wj; sy += q[1] * wj; sw += wj; }
    sx /= sw; sy /= sw;
    const raw = posAtTime(tq);
    if (P.design >= 3 && obsNear) { // obstacle sensed: fly the unsmoothed chest or ski line, whichever is farther from it
      const i = idxAtTime(tq), j = Math.min(nB - 1, i + 1), w = i < j ? clamp((tq - bt[i]) / Math.max(1e-6, bt[j] - bt[i]), 0, 1) : 0;
      const ski = [raw[0] + box[i] + (box[j] - box[i]) * w, raw[1] + boy[i] + (boy[j] - boy[i]) * w];
      const dmin = (q) => { let d = Infinity; for (const tr of seenTrees) d = Math.min(d, Math.hypot(q[0] - tr.x, q[1] - tr.y)); return d; };
      return dmin(ski) > dmin(raw) ? ski : [raw[0], raw[1]];
    }
    const ddx = sx - raw[0], ddy = sy - raw[1], dd = Math.hypot(ddx, ddy), lim = obsNear ? 0.03 : P.smoothCap; // obstacle near: replay the raw track
    if (dd > lim) { sx = raw[0] + (ddx * lim) / dd; sy = raw[1] + (ddy * lim) / dd; }
    return [sx, sy];
  }
  function project(px, py, hint) {
    let best = Infinity, bsBest = 0, bi = hint;
    const i0 = Math.max(0, hint - 20), i1 = Math.min(nB - 2, hint + 120);
    for (let i = i0; i <= i1; i++) {
      const ax = bx[i], ay = by[i], ex = bx[i + 1] - ax, ey = by[i + 1] - ay;
      const L2 = ex * ex + ey * ey;
      const u = L2 > 1e-9 ? clamp(((px - ax) * ex + (py - ay) * ey) / L2, 0, 1) : 0;
      const d = Math.hypot(px - ax - ex * u, py - ay - ey * u);
      if (d < best) { best = d; bsBest = bs[i] + Math.sqrt(L2) * u; bi = i; }
    }
    return [bsBest, best, bi];
  }

  // ---- vehicle state
  const p = [0, 0, 0], v = [0, 0, 0], F = [0, 0, m * G], Iv = [0, 0, 0], Fext = [0, 0, 0];
  let mode = M[cfg.startMode || 'follow'];
  let soc = 1, Tb = P.podTempC, energyJ = 0, airborneT = 0;
  let gYaw = 0, gPitch = -0.3, crop = 1.5, bodyYaw = 0;
  let spin = mode === M.docked ? 0 : 1, lid = 0, lidTarget = 0;
  const s00 = rider.at(0), g00 = riderGeom(s00);
  const vKEc = P.keCap > 0 ? 0.935 * Math.sqrt((2 * P.keCap) / P.mass) : Infinity;
  let leapSide = g00.feet[1] > 0 ? -1 : 1, leapLead = 8, leapT0 = 0, fastT = 0, leapEndT = Infinity;
  if (mode === M.docked) { for (let i = 0; i < 3; i++) p[i] = g00.pod[i]; F[2] = 0; }
  else if (mode === M.leap) {
    // pre-positioned ahead of a stopped rider (launched at the stop, flew down the planned line first)
    p[0] = g00.feet[0] + s00.heading[0] * leapLead; p[1] = g00.feet[1] + s00.heading[1] * leapLead + 4 * leapSide; p[2] = zT(p[0]) + 4;
    gYaw = Math.atan2(g00.feet[1] - p[1], g00.feet[0] - p[0]); bodyYaw = gYaw;
  } else {
    const back = P.followDist;
    p[0] = g00.feet[0] - s00.heading[0] * back; p[1] = g00.feet[1] - s00.heading[1] * back; p[2] = zT(p[0]) + P.hFollow;
    for (let i = 0; i < 3; i++) v[i] = s00.vel ? s00.vel[i] : 0;
    if (P.keCap > 0) { const v0n = len(v), vk = 0.94 * Math.sqrt((2 * P.keCap) / P.mass); if (v0n > vk) for (let i = 0; i < 3; i++) v[i] *= vk / v0n; }
    gYaw = Math.atan2(s00.heading[1], s00.heading[0]); bodyYaw = gYaw;
  }
  // mode-local state
  let t0Mode = 0, launchAt = null, holdSince = null, dockSub = 'approach', dockT0 = 0, attempts = 0, stableT = 0;
  let orbitPhi = 0, orbitPhi0 = 0, orbitR = 6, orbitOmegaMax = (2 * Math.PI) / ((cfg.orbit && cfg.orbit.period) || 9);
  let sideT0 = 0, sideDur = 7, sideSign = 1, lostRef = null, holdDir = [-1, 0];
  let projHint = -1;
  let sRefPrev = null, vRefMag = 0, aff = [0, 0, 0], vffPrev = null, refPrev = null;
  let riderStopT = 0, riderStopped = false, fallenSeen = null, crashed = false, validUntil = null;
  let podEst = g00.pod.slice(), podEstT = -1, podPrev = g00.pod.slice(), podVel = [0, 0, 0];
  let lastCrossEv = -9, lastGuardEv = -9, lastTiltEv = -9, lastSatEv = -9, lowBattEv = false;
  let dockedAt = null, landedAt = null, dockResults = [], minVcell = 9, tauNow = P.lagMin, trailNow = 0, crossNow = 0;
  let lidCloseAt = null;
  let peakI = 0;
  let commitT0 = 0, alignT = 0, recF = [0, 0], thrScale = 1, curLimEv = false;
  let btn = 0, leashT = 0, tiltSatT = 0, abortT = 0;
  const accEst = [0, 0, 0];
  let lastAvoidEv = -9;
  let followSD = null, brakeAvoid = false, obsNear = false, seenTrees = [];
  let bboxCrop = null;
  let crossSettling = false, avoidUntil = -1, avoidH = 0, yieldOn = false;
  let vrLP = rider.at(0).speed || 0;
  let losF = null, hdS = [1, 0], refVel = [0, 0], refPrevMode = -1;
  let yawDPrev = null, pitDPrev = null, yawDPrevNext = null, pitDPrevNext = null, ffYf = 0, ffPf = 0;
  let mi = 0;
  const setMode = (t, nm, why) => {
    if (M[nm] === mode) return;
    const pm = MODES[mode];
    mode = M[nm]; t0Mode = t;
    if (nm === 'hold') holdSince = t;
    if (pm === 'launch') lidCloseAt = t + 1.0; // keep the pod warm and closed while flying
    if (nm === 'dock') { lidTarget = 1; lidCloseAt = null; }
    if (nm !== 'follow') sRefPrev = null;
    events.push({ t: +t.toFixed(3), type: 'mode', severity: 'info', zh: `模式 ${pm} → ${nm}${why ? '：' + why.zh : ''}`, en: `Mode ${pm} → ${nm}${why ? ': ' + why.en : ''}` });
  };

  const n = Math.round(cfg.duration / dt);
  let si = 0;
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    // ---- rider truth
    const s = rider.at(t), g = riderGeom(s);
    // pod (true) with quiet-stance sway when standing
    const pod = g.pod.slice();
    if (s.speed < 0.3 && !s.fallen) { pod[0] += 0.02 * Math.sin(2 * Math.PI * 0.35 * t); pod[1] += 0.025 * Math.sin(2 * Math.PI * 0.55 * t + 1); pod[2] += 0.005 * Math.sin(2 * Math.PI * 0.9 * t); }
    const podV = [(pod[0] - podPrev[0]) / dt, (pod[1] - podPrev[1]) / dt, (pod[2] - podPrev[2]) / dt];
    for (let i = 0; i < 3; i++) podPrev[i] = pod[i];
    // ---- beacon packets
    while (nextPkt <= t + 1e-9) { packet(nextPkt, t); nextPkt += Tp; }
    for (let i = 0; i < 3; i++) { off[i] *= Math.exp(-dt / 0.12); voff[i] *= Math.exp(-dt / 0.12); }
    const pe = estAt(t), ve = estVel(t);
    const vr = Math.hypot(ve[0], ve[1]);
    vrLP += (vr - vrLP) * Math.min(1, dt / (P.vrTau ?? 0.8));
    if (vr > 2) { const w = Math.min(1, dt / 2.0); hdS = [hdS[0] + (ve[0] / vr - hdS[0]) * w, hdS[1] + (ve[1] / vr - hdS[1]) * w]; const l = Math.hypot(hdS[0], hdS[1]) || 1; hdS = [hdS[0] / l, hdS[1] / l]; }
    const wasLost = lost;
    lost = t - lastArrival > 0.35;
    if (lost && !wasLost) { okCount = 0; ev(t, 'beaconLost', 'warning', '信标丢失（>0.35 s 无定位）', 'Beacon lost (>0.35 s without a fix)'); }
    const beaconOk = !lost && okCount >= 3;
    // rider stop / fall detection (beacon IMU)
    if (vr < 0.8 && beaconOk) riderStopT += dt; else if (vr > 1.5) riderStopT = 0;
    const wasStopped = riderStopped;
    riderStopped = riderStopT > 1.0;
    if (riderStopped && !wasStopped) ev(t, 'riderStop', 'info', '检测到滑行者停下', 'Rider stop detected');
    if (s.fallen && fallenSeen === null) fallenSeen = t;
    const fallDetected = fallenSeen !== null && t - fallenSeen > 0.3;
    // pod estimate (UWB anchor in pod + optical fiducial, 30 Hz, 1 cm)
    if (t - podEstT >= 1 / 30) { podEstT = t; for (let i = 0; i < 3; i++) { podEst[i] += (pod[i] + 0.008 * gauss() - podEst[i]) * 0.5 + podV[i] / 30 * 0.5; podVel[i] = podV[i]; } }

    // ---- mission commands
    while (mi < mission.length && mission[mi].t <= t) {
      const c = mission[mi++];
      if (c.cmd === 'tap') { btn = 1; ev(t, 'tap', 'info', '滑行者按下肩带按钮', 'Rider taps the strap button'); }
      else if (c.cmd === 'launch' && mode === M.docked) { launchAt = t; lidTarget = 1; ev(t, 'launch', 'info', '仓盖打开，电机启动', 'Pod lid opens, motors spin up'); }
      else if (c.cmd === 'leap' && (mode === M.hold || mode === M.follow || mode === M.leap)) { leapT0 = t; leapLead = c.lead || 14; leapEndT = c.dur ? t + c.dur : Infinity; leapSide = c.sign || leapSide; setMode(t, 'leap', { zh: '前置等待：飞到预计路线前方侧边', en: 'leapfrog: fly ahead beside the predicted line' }); }
      else if (c.cmd === 'side' && (mode === M.follow)) { sideT0 = t; sideDur = c.dur || 7; sideSign = c.sign || (pe[1] > 0 ? -1 : 1); setMode(t, 'side', { zh: '高光侧向跟拍', en: 'highlight side pass' }); }
      else if (c.cmd === 'orbit' && (mode === M.hold || mode === M.follow)) {
        orbitPhi0 = Math.atan2(p[1] - pe[1], p[0] - pe[0]); orbitPhi = orbitPhi0; orbitR = c.r || 5.5;
        setMode(t, 'orbit', { zh: '停下后环绕一周', en: 'one orbit at the stop' });
      } else if (c.cmd === 'dock' && (mode === M.hold || mode === M.follow || mode === M.orbit)) { dockSub = 'approach'; stableT = 0; attempts = 0; setMode(t, 'dock', { zh: '返回背包仓', en: 'return to the pack pod' }); }
    }
    if (btn > 0) btn = Math.max(0, btn - dt / 1.2);
    // launch sequence: lid 0.2–1.0 s, spin-up 1.0–1.5 s, climb from 1.5 s
    if (mode === M.docked && launchAt !== null && t >= launchAt + 1.5) { setMode(t, 'launch', { zh: '垂直起飞', en: 'vertical climb-out' }); for (let i = 0; i < 3; i++) Iv[i] = 0; F[0] = 0; F[1] = 0; F[2] = m * G; }
    if (lidCloseAt !== null && t >= lidCloseAt) { lidTarget = 0; lidCloseAt = null; }
    if (lidTarget > lid) lid = Math.min(lidTarget, lid + dt / 0.8); else if (lidTarget < lid) lid = Math.max(lidTarget, lid - dt / 0.8);
    const spinTarget = (mode === M.docked && (launchAt === null || t < launchAt + 1.0)) || mode === M.landed || mode === M.crashed ? 0 : 1;
    spin += clamp(spinTarget - spin, -dt / 0.5, dt / 0.5);

    // ---- automatic mode logic
    const airborne = mode !== M.docked && mode !== M.landed && mode !== M.crashed;
    if (airborne && mode !== M.launch && mode !== M.dock) {
      if (lost && mode !== M.lost) { const sp = Math.hypot(v[0], v[1]); const k2 = sp / (2 * P.aBrake); lostRef = [p[0] + v[0] * k2, p[1] + v[1] * k2, p[2] + 1.5]; setMode(t, 'lost', { zh: '刹停悬停并爬升 1.5 m', en: 'brake to hover and climb 1.5 m' }); }
      if (mode === M.lost && beaconOk) setMode(t, riderStopped ? 'hold' : 'follow', { zh: '信标重获', en: 'beacon re-acquired' });
      if (mode === M.follow && riderStopped) setMode(t, 'hold', { zh: '滑行者停止', en: 'rider stopped' });
      // v3 leapfrog/pan: when the rider is faster than the KE-safe speed the drone stops chasing; if it is
      // ahead of the rider it slow-flies ahead off the line and films the pass-by; once passed it rejoins
      // the corridor (following at the KE-capped speed) and catches up only when the rider slows
      if (P.leap) {
        fastT = vr > vKEc ? fastT + dt : 0;
        const ahead = (p[0] - pe[0]) * hdS[0] + (p[1] - pe[1]) * hdS[1];
        if (mode === M.follow && fastT > 0.8 && ahead > 2) { leapT0 = t; leapLead = Math.max(6, ahead); setMode(t, 'leap', { zh: '超出动能安全速度：转为前置等待/摇摄', en: 'rider above the KE-safe speed: switch to leapfrog/pan' }); }
        if (mode === M.leap && ahead < -P.guardAlong && t - leapT0 > 1) setMode(t, 'follow', { zh: '滑行者已通过，回到走廊', en: 'rider has passed; rejoin the corridor' });
      }
      if (mode === M.hold && !riderStopped && vr > 2) setMode(t, 'follow', { zh: '滑行者重新出发', en: 'rider moving again' });
      if (mode === M.hold && cfg.autoDock && t >= (cfg.autoDockAfter || 0) && holdSince !== null && t - holdSince > (cfg.holdBeforeDock ?? 2) && !fallDetected && beaconOk) { dockSub = 'approach'; stableT = 0; attempts = 0; setMode(t, 'dock', { zh: '自动回仓', en: 'auto return to pod' }); }
      if (mode === M.hold && fallDetected && holdSince !== null && Math.abs(t - holdSince) < dt) ev(t, 'fallHold', 'info', '检测到摔倒：保持 ≥5 m 悬停拍摄，不回仓', 'Fall detected: hold ≥5 m and keep filming; no docking');
    }

    // ---- reference by mode
    let pRef = null, vff = [0, 0, 0], kp = [1.2, 1.2, 1.6], kv = [3.5, 3.5, 4], vzCap = 4, hCap = P.speedCap;
    let useGovernor = false, tdir = [1, 0], guardOn = true, hAgl = null, vffA = null;
    if (mode === M.follow) {
      // path following along the breadcrumb track: along-track speed from the
      // replay target s*(t) = s(t − τ) (capped by the guard), lateral correction
      // towards the (lightly smoothed) track, lookahead tangent feedforward
      // v3: low-bandwidth station (rider speed and replay speed low-passed, τ 0.5–0.8 s) so short turns do not pump the along-track speed
      const vrUse = P.design >= 3 ? vrLP : vr;
      const tau = clamp(P.followDist / Math.max(vrUse, 0.5), P.lagMin, P.lagMax);
      tauNow = tau;
      const sRider = (nB ? bs[nB - 1] : 0) + Math.hypot(pe[0] - bx[nB - 1], pe[1] - by[nB - 1]);
      const sTarget = Math.min(posAtTime(t - tau)[2], sRider - P.guardAlong);
      if (projHint < 0 || t - t0Mode < 1.5 * dt) projHint = nearestIdx(p[0], p[1]);
      const [sD, ce, hi] = project(p[0], p[1], projHint); projHint = hi;
      const tD = timeAtS(sD);
      const pc = smoothPos(tD);
      const SP = P.design >= 3 ? smoothPos : posAtTime; // v3: tangents of the smoothed line too (no wiggle feedforward)
      const t0a = SP(tD - 0.15), t0b = SP(tD + 0.15), l0 = Math.hypot(t0b[0] - t0a[0], t0b[1] - t0a[1]);
      const tan0 = l0 > 1e-3 ? [(t0b[0] - t0a[0]) / l0, (t0b[1] - t0a[1]) / l0] : [Math.cos(bodyYaw), Math.sin(bodyYaw)];
      const tA = timeAtS(sD + Math.max(0.5, Math.hypot(v[0], v[1]) * P.lookahead));
      const qa = SP(tA - 0.15), qb = SP(tA + 0.15), tl = Math.hypot(qb[0] - qa[0], qb[1] - qa[1]);
      tdir = tl > 1e-3 ? [(qb[0] - qa[0]) / tl, (qb[1] - qa[1]) / tl] : tan0;
      const dsr = sRefPrev === null ? vr : clamp((sTarget - sRefPrev) / dt, 0, 40);
      sRefPrev = sTarget;
      vRefMag += (dsr - vRefMag) * Math.min(1, dt / (P.design >= 3 ? (P.vRefTau ?? 0.5) : 0.12));
      // v3 station keeping: also close the straight-line distance to the rider (the smoothed line is shorter than
      // the wiggly track, so arc-length alone leaves the drone trailing in short turns)
      const dRH = Math.hypot(pe[0] - p[0], pe[1] - p[1]);
      const vAlong = clamp(vRefMag + 1.0 * (sTarget - sD) + (P.design >= 3 && !obsNear ? 0.8 * clamp(dRH - Math.hypot(P.followDist, 0) - 0.5, -2, 6) : 0), 0, P.speedCap);
      const nrm = [-tan0[1], tan0[0]];
      const eLat = nrm[0] * (pc[0] - p[0]) + nrm[1] * (pc[1] - p[1]);
      const vl = clamp(3.5 * eLat, -6, 6);
      vffA = [tdir[0] * vAlong, tdir[1] * vAlong, 0];
      vff = [vffA[0] + nrm[0] * vl, vffA[1] + nrm[1] * vl, 0];
      pRef = [p[0], p[1], 0]; hAgl = P.hFollow;
      crossNow = ce; trailNow = sRider - sD; followSD = sD;
      useGovernor = { sD, sRider };
      const settling = t - t0Mode < 2.0; // joining the track after launch/side/lost
      crossSettling = settling;
      if (!settling && ce > P.crossLimit && t - lastCrossEv > 2) { lastCrossEv = t; ev(t, 'crossTrack', 'warning', `偏离轨迹 ${ce.toFixed(2)} m > ${P.crossLimit} m`, `Cross-track error ${ce.toFixed(2)} m > ${P.crossLimit} m`); }
    } else if (mode === M.leap) {
      // hold a station ahead of and beside the rider's predicted line (off the verified corridor → relies on the
      // forward depth sensor), 4 m up; the station moves with the rider but the KE governor caps the drone,
      // so a faster rider closes in and passes: front → side → rear pan
      if (t > leapEndT) leapLead = Math.max(-10, leapLead - 3.5 * dt); // scripted end: let the rider pass
      const hd = hdS, nl = [-hd[1] * leapSide, hd[0] * leapSide];
      const x = pe[0] + hd[0] * leapLead + nl[0] * 4, y = pe[1] + hd[1] * leapLead + nl[1] * 4;
      pRef = [x, y, 0]; hAgl = 4; guardOn = true;
    } else if (mode === M.side) {
      const u = (t - sideT0) / sideDur;
      if (u >= 1) setMode(t, 'follow', { zh: '侧拍结束，回到轨迹', en: 'side pass done; back on the track' });
      const hd = hdS;
      const nl = [-hd[1] * sideSign, hd[0] * sideSign];
      const lat = 5.5 * smooth01(u / 0.3) * smooth01((1 - u) / 0.3);
      const along = -6 + 6.5 * Math.sin(Math.PI * clamp(u, 0, 1));
      const x = pe[0] + hd[0] * along + nl[0] * lat, y = pe[1] + hd[1] * along + nl[1] * lat;
      pRef = [x, y, 0]; hAgl = P.hFollow - 0.5 * Math.sin(Math.PI * clamp(u, 0, 1));
    } else if (mode === M.hold || mode === M.lost && !lostRef) {
      const dx = p[0] - pe[0], dy = p[1] - pe[1], dh = Math.hypot(dx, dy);
      if (dh > 0.5) { const w = Math.min(1, dt / 1.5); holdDir = [holdDir[0] + (dx / dh - holdDir[0]) * w, holdDir[1] + (dy / dh - holdDir[1]) * w]; const l = Math.hypot(...holdDir); holdDir = [holdDir[0] / l, holdDir[1] / l]; }
      const x = pe[0] + holdDir[0] * P.holdDist, y = pe[1] + holdDir[1] * P.holdDist;
      pRef = [x, y, 0]; hAgl = P.hFollow;
      hCap = 6;
    } else if (mode === M.lost) {
      pRef = lostRef.slice(); hAgl = P.hFollow + 1.5; hCap = 6; guardOn = true;
    } else if (mode === M.orbit) {
      const el = t - t0Mode;
      const omega = orbitOmegaMax * Math.max(0.08, smooth01(el / 1.2)) * Math.max(0.15, smooth01((orbitPhi0 + 2 * Math.PI - orbitPhi) / 0.8));
      orbitPhi += omega * dt;
      if (orbitPhi - orbitPhi0 >= 2 * Math.PI - 0.01) setMode(t, 'hold', { zh: '环绕完成', en: 'orbit complete' });
      const x = pe[0] + orbitR * Math.cos(orbitPhi), y = pe[1] + orbitR * Math.sin(orbitPhi);
      pRef = [x, y, 0]; hAgl = P.hFollow;
      hCap = 8;
    } else if (mode === M.launch) {
      const el = t - t0Mode;
      const hClear = zT(pod[0]) + P.hFollow - pod[2];
      const climb = Math.min(1.4 * el, hClear);
      const tBack = hClear / 1.4 + 0.3;
      const back = 0.15 + smooth01((el - tBack) / 1.6) * (P.holdDist - 0.15);
      pRef = [podEst[0] - s.heading[0] * back, podEst[1] - s.heading[1] * back, podEst[2] + climb];
      vff = [podVel[0], podVel[1], climb < hClear ? 1.4 : 0];
      kp = [2, 2, 2]; kv = [4.5, 4.5, 4.5]; guardOn = false; hCap = 4;
      if (el > tBack + 1.6 && segDist(p, g.feet, g.top) >= P.guard3D + 0.1) { holdDir = [-s.heading[0], -s.heading[1]]; setMode(t, riderStopped || s.speed < 0.5 ? 'hold' : 'follow', { zh: '爬升并退到安全距离', en: 'climbed out and backed off to the guard distance' }); }
    } else if (mode === M.dock) {
      guardOn = false; kp = [3.2, 3.2, 2.5]; kv = [7, 7, 5]; hCap = 5; vzCap = 1.5;
      const hApp = 0.9;
      const ex = p[0] - podEst[0], ey = p[1] - podEst[1], eh = Math.hypot(ex, ey), hAbove = p[2] - podEst[2];
      if (dockSub === 'approach' || dockSub === 'abort') {
        pRef = [podEst[0], podEst[1], podEst[2] + hApp];
        vff = podVel.slice();
        if (eh < 0.05 && Math.abs(hAbove - hApp) < 0.08 && Math.hypot(v[0] - podVel[0], v[1] - podVel[1]) < 0.2) stableT += dt; else stableT = 0;
        if (stableT > 0.6) { dockSub = 'descend'; dockT0 = t; stableT = 0; ev(t, 'dockDescend', 'info', `第 ${attempts + 1} 次下降对接`, `Docking descent, attempt ${attempts + 1}`); }
        if (dockSub === 'approach' && t - t0Mode > 20) { attempts = P.maxAttempts; }
      } else if (dockSub === 'descend') {
        if (P.dockMode >= 2) {
          // v2: descend to 0.25 m, wait until aligned (<2 cm for 0.3 s), then commit at 1 m/s through the
          // recirculating downwash zone into the capture cone; abort only if misaligned during the commit
          const hHold = 0.25;
          let zr, vz;
          if (!commitT0) {
            zr = Math.max(podEst[2] + hHold, podEst[2] + hApp - P.descRate * (t - dockT0)); vz = zr > podEst[2] + hHold + 1e-3 ? -P.descRate : 0;
            alignT = hAbove < hHold + 0.05 && eh < 0.02 ? alignT + dt : 0;
            if (alignT > 0.3) { commitT0 = t; alignT = 0; }
            if (t - dockT0 > (hApp - hHold) / P.descRate + 5) { attempts++; dockResults.push({ t, ok: false, err: eh, why: 'noalign' }); dockSub = 'abort'; stableT = 0; ev(t, 'dockAbort', 'warning', '对准超时，爬升重试', 'Could not align within 5 s; climb and retry'); }
          } else { zr = Math.max(podEst[2] - 0.05, podEst[2] + hHold - 1.0 * (t - commitT0)); vz = -1.0; }
          pRef = [podEst[0], podEst[1], zr]; vff = [podVel[0], podVel[1], vz];
          if (commitT0 && hAbove > 0.05 && eh > P.abortErr) { attempts++; commitT0 = 0; dockResults.push({ t, ok: false, err: eh, why: 'abort' }); dockSub = 'abort'; stableT = 0; ev(t, 'dockAbort', 'warning', `对接中止：偏差 ${(eh * 100).toFixed(1)} cm`, `Docking aborted: offset ${(eh * 100).toFixed(1)} cm`); }
        } else {
        const zr = Math.max(podEst[2] - 0.05, podEst[2] + hApp - P.descRate * (t - dockT0));
        pRef = [podEst[0], podEst[1], zr];
        vff = [podVel[0], podVel[1], -P.descRate];
        abortT = hAbove > 0.12 && eh > P.abortErr ? abortT + dt : 0;
        if (abortT > 0.15) { abortT = 0; attempts++; dockResults.push({ t, ok: false, err: eh, why: 'abort' }); dockSub = 'abort'; stableT = 0; ev(t, 'dockAbort', 'warning', `对接中止：偏差 ${(eh * 100).toFixed(1)} cm > ${(P.abortErr * 100).toFixed(0)} cm，爬升重试`, `Docking aborted: offset ${(eh * 100).toFixed(1)} cm > ${(P.abortErr * 100).toFixed(0)} cm; climb and retry`); }
        }
        const trueErr = Math.hypot(p[0] - pod[0], p[1] - pod[1]);
        if (p[2] - pod[2] <= 0.02) {
          const vrel = Math.hypot(v[0] - podV[0], v[1] - podV[1]);
          commitT0 = 0;
          if (trueErr <= P.captureR && vrel < (P.dockMode >= 2 ? 0.7 : 0.5)) {
            dockResults.push({ t, ok: true, err: trueErr }); dockedAt = t;
            ev(t, 'docked', 'info', `对接成功：偏差 ${(trueErr * 100).toFixed(1)} cm（捕获半径 ${(P.captureR * 100).toFixed(0)} cm），第 ${attempts + 1} 次`, `Docked: offset ${(trueErr * 100).toFixed(1)} cm (capture radius ${(P.captureR * 100).toFixed(0)} cm), attempt ${attempts + 1}`);
            setMode(t, 'docked'); lidTarget = 0; launchAt = null;
          } else {
            attempts++; dockResults.push({ t, ok: false, err: trueErr, why: 'miss' }); dockSub = 'abort';
            ev(t, 'dockMiss', 'warning', `触仓未捕获：偏差 ${(trueErr * 100).toFixed(1)} cm`, `Touched the pod rim without capture: offset ${(trueErr * 100).toFixed(1)} cm`);
          }
        }
      }
      if (mode === M.dock && attempts >= P.maxAttempts) {
        ev(t, 'dockFallback', 'warning', `${P.maxAttempts} 次未成功：降落在滑行者身旁雪面，需手动收回`, `${P.maxAttempts} failed attempts: landing on the snow beside the rider; manual pick-up needed`);
        dockSub = 'land'; attempts = -99;
      }
      if (dockSub === 'land') {
        const x = pe[0] + g.left[0] * 2, y = pe[1] + g.left[1] * 2;
        const hl = Math.hypot(p[0] - x, p[1] - y);
        pRef = [x, y, hl < 0.3 ? zT(x) - 0.2 : zT(x) + 1.5]; vzCap = 0.8; guardOn = false;
        if (p[2] - zT(p[0]) < 0.08) { setMode(t, 'landed', { zh: '降落雪面', en: 'landed on snow' }); landedAt = t; }
      }
    }

    // moving references without an analytic velocity: feedforward from the reference's own rate
    if (pRef && (mode === M.side || mode === M.orbit || mode === M.hold || mode === M.leap)) {
      if (refPrev && refPrevMode === mode) for (let i = 0; i < 2; i++) refVel[i] += (clamp((pRef[i] - refPrev[i]) / dt, -30, 30) - refVel[i]) * Math.min(1, dt / 0.1);
      else { refVel[0] = mode === M.hold ? 0 : v[0]; refVel[1] = mode === M.hold ? 0 : v[1]; }
      refPrev = pRef.slice(); refPrevMode = mode;
      vff[0] = refVel[0]; vff[1] = refVel[1];
    } else refPrevMode = -1;
    // v3 forward depth sensor (range P.sensorRange, ±45° about the velocity, 0.1 s latency): predicted-path
    // clearance check; escape preferably DOWN into the verified corridor (the rider passed under), else up
    if (P.obsSensor && pRef && hAgl !== null && trees.length) {
      const sp = Math.hypot(v[0], v[1]), hv = sp > 1 ? [v[0] / sp, v[1] / sp] : [Math.cos(bodyYaw), Math.sin(bodyYaw)];
      const seen = trees.filter((tr) => {
        const dx = tr.x - p[0], dy = tr.y - p[1], dd = Math.hypot(dx, dy);
        if (dd > P.sensorRange + tr.Rb + 2) return false;
        return dd < tr.Rb + 3 || (dx * hv[0] + dy * hv[1]) / (dd || 1) > Math.cos(((P.sensorFovDeg / 2) * Math.PI) / 180);
      });
      seenTrees = seen;
      obsNear = seen.some((tr) => Math.hypot(tr.x - p[0], tr.y - p[1]) < P.sensorRange && tr.close !== undefined);
      if (seen.length) {
        const clrAt = (h) => {
          let c = Infinity;
          for (let k = 0; k <= 8; k++) {
            const tau = 0.1 + k * 0.18;
            let q;
            if (mode === M.follow && followSD !== null && nB > 1) { // predicted along the corridor, straight beyond the rider
              const sq = followSD + Math.max(sp, vr) * tau, sl = bs[nB - 1];
              if (sq <= sl) { const tq = timeAtS(sq), pr = posAtTime(tq); q = [pr[0], pr[1], 0]; if (P.design >= 3) { const i2 = idxAtTime(tq); q.alt = [pr[0] + box[i2], pr[1] + boy[i2]]; } } /* chest line + ski line alternative */ else continue; // beyond the rider's current position the line is unknown (a straight guess raises false alarms in turns)
              if (Math.hypot(q[0] - p[0], q[1] - p[1]) > P.sensorRange) continue; // beyond the sensor range
            }
            else q = [p[0] + v[0] * tau, p[1] + v[1] * tau, 0];
            q[2] = zT(q[0]) + h;
            let cq = Infinity; for (const tr of seen) cq = Math.min(cq, treeClearance(q, tr, tanS) - P.droneR);
            if (q.alt) { const q2 = [q.alt[0], q.alt[1], zT(q.alt[0]) + h]; let c2 = Infinity; for (const tr of seen) c2 = Math.min(c2, treeClearance(q2, tr, tanS) - P.droneR); cq = Math.max(cq, c2); }
            c = Math.min(c, cq);
          }
          return c;
        };
        const base = hAgl;
        // the drone's own straight-line motion (it may be cutting a corner while catching up)
        const clrStraight = (h) => { let c = Infinity; for (let k = 0; k <= 5; k++) { const tau = 0.1 + k * 0.1, q = [p[0] + v[0] * tau + 0.5 * accEst[0] * tau * tau, p[1] + v[1] * tau + 0.5 * accEst[1] * tau * tau, 0]; q[2] = zT(q[0]) + h; for (const tr of seen) c = Math.min(c, treeClearance(q, tr, tanS) - P.droneR); } return c; };
        const offLine = mode === M.follow && clrStraight(base) < 0.3 && clrAt(base) >= 0.35; // own path (constant-acceleration prediction, 0.6 s)
        if (clrAt(base) < 0.35 || offLine || t < avoidUntil) {
          let best = null, bestC = -Infinity;
          // prefer ducking into the verified corridor; if no lower height is clear, brake hard and take the best height
          for (const h of [base, 2.6, 2.3, 2.0]) { const c = clrAt(h); if (c >= 0.45) { best = h; bestC = c; break; } if (c > bestC) { bestC = c; best = h; } }
          if (bestC < 0.45) for (const h of [base, 2.6, 2.3, 2.0]) { const c = clrAt(h); if (c >= 0.3) { best = h; bestC = Math.max(bestC, 0.45); break; } }
          if (bestC < 0.45) { for (const h of [3.6, 4.2, 5.0]) { const c = clrAt(h); if (c >= 0.45) { bestC = c; best = h; break; } if (c > bestC + 0.1) { bestC = c; best = h; } } } // conifers narrow with height
          brakeAvoid = bestC < 0.3 || offLine;
          const fresh = t >= avoidUntil;
          // hysteresis: once avoiding, only change height if the held one is no longer safe
          if (fresh || (best !== avoidH && clrAt(avoidH) < 0.45)) { if (best !== base && (best !== avoidH || fresh) && t - lastAvoidEv > 1) lastAvoidEv = t, ev(t, 'avoid', 'info', `前视深度传感器：避障高度 ${best.toFixed(1)} m`, `Forward depth sensor: avoidance height ${best.toFixed(1)} m`); avoidH = best; }
          if (clrAt(base) < 0.35 || offLine) avoidUntil = t + (offLine ? 0.4 : 1.2);
          hAgl = avoidH; vzCap = 4; kp[2] = 3.2; kv[2] = 6;
          if (brakeAvoid || clrAt(avoidH) < 0.2) { // no clear height: brake along the track, keep the lateral correction
            if (mode === M.follow && vffA) { const va = vffA[0] * tdir[0] + vffA[1] * tdir[1], vc = 2; if (va > vc) { vff[0] -= tdir[0] * (va - vc); vff[1] -= tdir[1] * (va - vc); vffA = [tdir[0] * vc, tdir[1] * vc, 0]; } }
            else hCap = Math.min(hCap, 2);
          }
        }
      }
    }
    // v3 lateral standoff from sensed trunks/canopies (bounded, stays near the corridor)
    if (P.obsSensor && pRef && hAgl !== null && trees.length) {
      for (const tr of trees) {
        const dx = p[0] - tr.x, dy = p[1] - tr.y, dh = Math.hypot(dx, dy);
        if (dh > 5) continue;
        const hh = p[2] + tanS * tr.x, r = hh >= tr.h0 && hh <= tr.H ? (tr.Rb * (tr.H - hh)) / (tr.H - tr.h0) : tr.rT;
        const c = dh - r - P.droneR;
        if (c < 0.6) { const k = Math.min(3, 4 * (0.6 - c)); vff[0] += (dx / dh) * k; vff[1] += (dy / dh) * k; }
      }
    }
    if (P.personYield && other && pRef && hAgl !== null) {
      const o = other(t);
      if (o) { const dh = Math.hypot(o.feet[0] - p[0], o.feet[1] - p[1]); if (dh < P.sensorRange) { if (!yieldOn) { yieldOn = true; ev(t, 'yield', 'info', `检测到他人（${dh.toFixed(1)} m）：爬升让行`, `Person detected at ${dh.toFixed(1)} m: climb to yield`); } hAgl = Math.max(hAgl, 5.2); vzCap = 4; kp[2] = 3.2; kv[2] = 6; } }
    }
    // altitude hold above the planar snow under the drone (not under the reference point)
    if (hAgl !== null && pRef) { pRef[2] = zT(p[0]) + hAgl; vff[2] = -tanS * v[0]; }
    // ---- dynamics
    if (mode === M.docked) {
      for (let i = 0; i < 3; i++) { p[i] = pod[i]; v[i] = podV[i]; }
      F[0] = 0; F[1] = 0; F[2] = 0;
      bodyYaw = Math.atan2(s.heading[1], s.heading[0]);
    } else if (mode === M.landed || mode === M.crashed) {
      const zg = zT(p[0]) + 0.06;
      if (p[2] > zg) { v[2] -= G * dt; p[2] = Math.max(zg, p[2] + v[2] * dt); p[0] += v[0] * dt; p[1] += v[1] * dt; v[0] *= 0.99; v[1] *= 0.99; }
      else { p[2] = zg; v[0] = v[1] = v[2] = 0; }
      F[0] = F[1] = 0; F[2] = 0;
    } else {
      // velocity command
      const vcmd = [vff[0] + kp[0] * (pRef[0] - p[0]), vff[1] + kp[1] * (pRef[1] - p[1]), vff[2] + kp[2] * (pRef[2] - p[2])];
      if (useGovernor) {
        const gap = useGovernor.sRider - P.guardAlong - useGovernor.sD;
        const vAlongMax = vr + Math.sqrt(2 * P.aBrake * Math.max(0, gap));
        const va = vcmd[0] * tdir[0] + vcmd[1] * tdir[1];
        if (va > vAlongMax) { vcmd[0] -= (va - vAlongMax) * tdir[0]; vcmd[1] -= (va - vAlongMax) * tdir[1]; }
      }
      // 3-D keep-out guard around the rider (never closer than guard3D, never overhead)
      const dR = segDist(p, g.feet, g.top);
      if (guardOn && dR < P.guard3D + 0.6) {
        const ax = p[0] - pe[0], ay = p[1] - pe[1], ah = Math.hypot(ax, ay) || 1;
        const ux = ax / ah, uy = ay / ah;
        const closing = vcmd[0] * ux + vcmd[1] * uy - (ve[0] * ux + ve[1] * uy);
        if (closing < 0) { vcmd[0] -= closing * ux; vcmd[1] -= closing * uy; }
        const push = 2.5 * (P.guard3D + 0.6 - dR);
        vcmd[0] += push * ux; vcmd[1] += push * uy; vcmd[2] += 0.5 * push;
        if (dR < P.guard3D && t - lastGuardEv > 2) { lastGuardEv = t; ev(t, 'guard', 'warning', `与滑行者距离 ${dR.toFixed(2)} m < ${P.guard3D} m，避让`, `Rider distance ${dR.toFixed(2)} m < ${P.guard3D} m; backing off`); }
      }
      // v2 kinetic-energy governor: ground speed limited so ½mv² ≤ keCap (5 % margin for overshoot)
      const vKE = P.keCap > 0 ? 0.935 * Math.sqrt((2 * P.keCap) / P.mass) : Infinity;
      if (P.keCap > 0) hCap = Math.min(hCap, vKE);
      const vh = Math.hypot(vcmd[0], vcmd[1]);
      if (vh > hCap) { vcmd[0] *= hCap / vh; vcmd[1] *= hCap / vh; }
      vcmd[2] = clamp(vcmd[2], vff[2] - vzCap, vff[2] + vzCap); // relative to the terrain-following feedforward
      // feedforward acceleration from the reference velocity
      const vA = vffA || vff;
      if (vffPrev) for (let i = 0; i < 3; i++) aff[i] += ((vA[i] - vffPrev[i]) / dt - aff[i]) * Math.min(1, dt / 0.15);
      vffPrev = vA.slice();
      const evv = [vcmd[0] - v[0], vcmd[1] - v[1], vcmd[2] - v[2]];
      const a = [aff[0] + kv[0] * evv[0] + Iv[0], aff[1] + kv[1] * evv[1] + Iv[1], aff[2] + kv[2] * evv[2] + Iv[2]];
      { const vgn = len(v); if (vgn > vKE) for (let i = 0; i < 3; i++) a[i] -= 12 * (vgn - vKE) * (v[i] / vgn); } // hard KE brake
      const ah = Math.hypot(a[0], a[1]);
      if (ah > 25) { a[0] *= 25 / ah; a[1] *= 25 / ah; }
      const vg = len(v);
      // external-force (wind) compensation from the IMU: the specific-force residual estimates the aero force with τ_dob lag
      const Fc = [m * a[0] - Fext[0], m * a[1] - Fext[1], m * (a[2] + G) - Fext[2]];
      // thrust & tilt limits (vertical priority)
      const TmaxEff = D.Tmax * thrScale;
      const Fz = clamp(Fc[2], 0.25 * D.W, 0.97 * TmaxEff);
      const Hmax = Math.min(Fz * Math.tan(D.tiltMax), Math.sqrt(Math.max(0, TmaxEff ** 2 - Fz ** 2)));
      const Hc = Math.hypot(Fc[0], Fc[1]);
      const sat = Hc > Hmax || Fc[2] !== Fz;
      let Fcl;
      if (Hc > Hmax && useGovernor) {
        // corridor first: keep the cross-track force, give the along-track force what is left (fall behind, stay on the track)
        const fa = Fc[0] * tdir[0] + Fc[1] * tdir[1], fn = -Fc[0] * tdir[1] + Fc[1] * tdir[0];
        const fnL = clamp(fn, -Hmax, Hmax), faL = Math.sign(fa) * Math.min(Math.abs(fa), Math.sqrt(Math.max(0, Hmax * Hmax - fnL * fnL)));
        Fcl = [tdir[0] * faL - tdir[1] * fnL, tdir[1] * faL + tdir[0] * fnL, Fz];
      } else { const hs = Hc > Hmax ? Hmax / Hc : 1; Fcl = [Fc[0] * hs, Fc[1] * hs, Fz]; }
      if (sat) { tiltSatT += dt; if (tiltSatT > 0.5 && t - lastSatEv > 3) { lastSatEv = t; ev(t, 'saturation', 'warning', '推力/倾角饱和超过 0.5 s：跟随能力到达极限', 'Thrust/tilt saturated for >0.5 s: at the follow-capability limit'); } }
      else tiltSatT = 0;
      if (!sat) for (let i = 0; i < 3; i++) Iv[i] = clamp(Iv[i] + (i === 2 ? 1.5 : 1.0) * evv[i] * dt, i === 2 ? -4 : -6, i === 2 ? 4 : 6);
      for (let i = 0; i < 3; i++) F[i] += (Fcl[i] - F[i]) * Math.min(1, dt / P.tauAtt);
      // aerodynamics
      const w = wind(t, p);
      if (wake) { // rider's bluff-body wake: extra turbulence when the drone sits downwind of the rider
        const wm = Math.hypot(w[0], w[1]);
        if (wm > 0.5) {
          const rx = p[0] - g.feet[0], ry = p[1] - g.feet[1];
          const down = (rx * w[0] + ry * w[1]) / wm, crossD = Math.abs(rx * w[1] - ry * w[0]) / wm;
          const inWake = down > 0 && down < 2.5 && crossD < 0.6 && p[2] - g.feet[2] < 2.2;
          if (inWake) { const ww = wake(t, p), f = (1 - down / 2.5) * wm; for (let i = 0; i < 3; i++) w[i] += ww[i] * f; }
        }
      }
      const va = [v[0] - w[0], v[1] - w[1], v[2] - w[2]], V = len(va);
      const Fm = len(F), tilt = Math.acos(clamp(F[2] / Math.max(1e-6, Fm), -1, 1));
      const CdA = P.CdA + P.CdAtilt * Math.sin(tilt) ** 2;
      const Fd = [-P.cLin * va[0] - 0.5 * D.rho * CdA * V * va[0], -P.cLin * va[1] - 0.5 * D.rho * CdA * V * va[1], -P.cLin * va[2] - 0.5 * D.rho * CdA * V * va[2]];
      // optional leash (0.5 mm Dyneema, spring reel): drag + end-stop
      let FL = [0, 0, 0]; leashT = 0;
      if (P.leash) {
        const r = sub(p, pod), Lr = len(r) || 1, e = [r[0] / Lr, r[1] / Lr, r[2] / Lr];
        const vm = [(v[0] + s.vel[0]) / 2 - w[0], (v[1] + s.vel[1]) / 2 - w[1], (v[2] + (s.vel[2] || 0)) / 2 - w[2]];
        const vpar = dot(vm, e), vn = [vm[0] - e[0] * vpar, vm[1] - e[1] * vpar, vm[2] - e[2] * vpar], vnm = len(vn);
        const drag = 0.5 * D.rho * 1.1 * 0.0005 * Lr * vnm * vnm;
        // safety leash: 0.3 N spring reel; tow leash (energy 2): a braked reel holds the tension at the drag the airframe sees
        const tow = P.leash === 2 ? clamp(dot(Fd, e) + 0.3, 0.3, 5) : 0.3;
        const reel = tow + (Lr > P.leashLen ? 400 * (Lr - P.leashLen) : 0);
        for (let i = 0; i < 3; i++) FL[i] = -0.5 * drag * (vnm > 1e-6 ? vn[i] / vnm : 0) - reel * e[i];
        leashT = Math.hypot(0.5 * drag, reel);
      }
      // downwash recirculating off the pack/body close to the pod: random lateral force (ASSUMED σ = 5 % W)
      const hp = p[2] - pod[2];
      if ((mode === M.dock || mode === M.launch) && hp > -0.02 && hp < 0.35 && Math.hypot(p[0] - pod[0], p[1] - pod[1]) < 0.3) {
        const sgm = 0.05 * D.W * (1 - Math.max(0, hp) / 0.35), a1 = Math.exp(-dt / 0.1), b1 = Math.sqrt(1 - a1 * a1);
        recF[0] = a1 * recF[0] + b1 * sgm * gauss(); recF[1] = a1 * recF[1] + b1 * sgm * gauss();
        FL[0] += recF[0]; FL[1] += recF[1];
      } else { recF[0] *= 0.9; recF[1] *= 0.9; }
      const acc = [(F[0] + Fd[0] + FL[0]) / m, (F[1] + Fd[1] + FL[1]) / m, (F[2] + Fd[2] + FL[2]) / m - G];
      for (let i = 0; i < 3; i++) Fext[i] += (Fd[i] + FL[i] + 0.004 * gauss() - Fext[i]) * Math.min(1, dt / P.tauDob);
      for (let i = 0; i < 3; i++) { v[i] += acc[i] * dt; p[i] += v[i] * dt; accEst[i] += (acc[i] - accEst[i]) * Math.min(1, dt / 0.1); }
      // body yaw follows the gimbal yaw (rate-limited)
      const dy = Math.atan2(Math.sin(gYaw - bodyYaw), Math.cos(gYaw - bodyYaw));
      bodyYaw += clamp(dy, -2.5 * dt, 2.5 * dt);
      // power & battery
      const Dp = 0.5 * D.rho * CdA * V * V;
      const Pel = elecPower(D, P, Fm, V, Dp, v[2] - w[2] + tanS * 0);
      const R = battR(P, Tb), ocv = CELLS * ocvCell(soc);
      const disc = ocv * ocv - 4 * R * Pel;
      const I = disc > 0 ? (ocv - Math.sqrt(disc)) / (2 * R) : ocv / (2 * R);
      const Vt = ocv - I * R;
      const Imax = P.battC * QAH(P);
      if (I > Imax) { thrScale = Math.max(0.6, thrScale - 2 * dt); if (!curLimEv) { curLimEv = true; ev(t, 'currentLimit', 'warning', `电池电流达到 ${P.battC}C 上限：推力受限`, `Battery current at the ${P.battC}C limit: thrust limited`); } }
      else thrScale = Math.min(1, thrScale + 0.5 * dt);
      peakI = Math.max(peakI, I);
      minVcell = Math.min(minVcell, Vt / CELLS);
      soc -= (I * dt) / (QAH(P) * 3600 * capFactor(Tb));
      Tb += ((I * I * R - 0.25 * (Tb - P.tempC)) / 75) * dt;
      energyJ += Pel * dt; airborneT += dt;
      if (soc < P.reserve && !lowBattEv) { lowBattEv = true; ev(t, 'lowBattery', 'warning', '电量低于返航储备', 'State of charge below the return reserve'); }
      if (Vt / CELLS < 3.0 && validUntil === null) { validUntil = t; ev(t, 'brownout', 'invalid', '单体电压 <3.0 V：掉电风险', 'Cell voltage <3.0 V: brown-out risk'); }
      // collisions
      for (const tr of trees) {
        if (Math.abs(tr.x - p[0]) > 12 || Math.abs(tr.y - p[1]) > 12) continue;
        if (treeClearance(p, tr, tanS) - P.droneR < 0) { crashed = true; ev(t, 'treeStrike', 'invalid', '撞树（枝叶）：模型失效', 'Tree/branch strike: model invalid from here'); break; }
      }
      if (!crashed && mode !== M.dock && mode !== M.launch && segDist(p, g.feet, g.top) < P.droneR + 0.25) { crashed = true; ev(t, 'riderStrike', 'invalid', '碰到滑行者', 'Contact with the rider'); }
      if (!crashed && other) { const o = other(t); if (o && segDist(p, o.feet, o.top) < P.droneR + 0.25) { crashed = true; ev(t, 'personStrike', 'invalid', '碰到他人', 'Contact with another person'); } }
      if (!crashed && p[2] - zT(p[0]) < 0.1 && mode !== M.dock) { crashed = true; ev(t, 'groundStrike', 'invalid', '触地', 'Ground strike'); }
      if (crashed) { if (validUntil === null) validUntil = t; setMode(t, 'crashed'); }
    }
    // ---- gimbal (3-axis, rate-limited) aimed at the subject estimate (or the pod while docking)
    const camPos = [p[0] + Math.cos(bodyYaw) * 0.06, p[1] + Math.sin(bodyYaw) * 0.06, p[2] - 0.045];
    const aim = mode === M.dock ? [podEst[0], podEst[1], podEst[2] + 0.2] : [pe[0], pe[1], pe[2] - 0.35];
    const dA = sub(aim, camPos), dH = Math.hypot(dA[0], dA[1]);
    const yawD = Math.atan2(dA[1], dA[0]), pitD = clamp(Math.atan2(dA[2], dH), -1.55, 0.35);
    const rmax = (P.gimbalRateDeg * Math.PI) / 180;
    yawDPrevNext = yawD; pitDPrevNext = pitD;
    if (mode === M.docked || mode === M.landed || mode === M.crashed) { gYaw = bodyYaw; gPitch += (0 - gPitch) * Math.min(1, dt / 0.3); }
    else {
      // rate feedforward from the target-angle derivative + proportional correction
      const ffY = yawDPrev === null ? 0 : Math.atan2(Math.sin(yawD - yawDPrev), Math.cos(yawD - yawDPrev)) / dt;
      const ffP = pitDPrev === null ? 0 : (pitD - pitDPrev) / dt;
      ffYf += (clamp(ffY, -6, 6) - ffYf) * Math.min(1, dt / 0.05); ffPf += (clamp(ffP, -6, 6) - ffPf) * Math.min(1, dt / 0.05);
      const ey = Math.atan2(Math.sin(yawD - gYaw), Math.cos(yawD - gYaw));
      gYaw += clamp(ffYf + 12 * ey, -rmax, rmax) * dt;
      gPitch += clamp(ffPf + 12 * (pitD - gPitch), -rmax * 0.6, rmax * 0.6) * dt;
    }
    yawDPrev = yawDPrevNext; pitDPrev = pitDPrevNext;
    visCam = { pos: camPos, fwd: [Math.cos(gPitch) * Math.cos(gYaw), Math.cos(gPitch) * Math.sin(gYaw), Math.sin(gPitch)] };
    // electronic crop to frame the rider at ~targetFill of the frame height (≤ maxCrop for native resolution)
    const dist = len(dA);
    const angH = 2 * Math.atan(0.85 / Math.max(0.5, dist));
    // v3: zoom on the tracker's bounding box (the leaning body's image height shrinks at the turn apex);
    // earlier designs zoom on the beacon distance assuming an upright 1.7 m subject
    const cropWant = P.design >= 3 && bboxCrop ? bboxCrop : clamp((P.targetFill * D.vfovNative) / angH, 1, P.maxCrop);
    crop += clamp(cropWant - crop, -0.8 * dt, 0.8 * dt);

    // ---- sample
    if (k % every === 0 && si < nS && cfg.lite) { const i = si++; C.t[i] = t; C.mode[i] = mode; C.headClr[i] = len(sub(p, g.head)) - P.droneR - 0.13; }
    else if (k % every === 0 && si < nS) {
      const i = si++;
      C.t[i] = t;
      C.dx[i] = p[0]; C.dy[i] = p[1]; C.dz[i] = p[2]; C.vx[i] = v[0]; C.vy[i] = v[1]; C.vz[i] = v[2];
      C.gs[i] = len(v); const w = wind(t, p); C.wx[i] = w[0]; C.wy[i] = w[1];
      C.air[i] = mode === M.docked ? 0 : len([v[0] - w[0], v[1] - w[1], v[2] - w[2]]);
      const Fm = len(F); C.thrust[i] = Fm; C.tilt[i] = Fm > 1e-6 ? (Math.acos(clamp(F[2] / Fm, -1, 1)) * 180) / Math.PI : 0;
      C.ax[i] = Fm > 1e-6 ? F[0] / Fm : 0; C.ay[i] = Fm > 1e-6 ? F[1] / Fm : 0; C.az[i] = Fm > 1e-6 ? F[2] / Fm : 1;
      C.soc[i] = soc * 100; C.tb[i] = Tb; C.ke[i] = 0.5 * m * C.gs[i] ** 2;
      const R = battR(P, Tb), ocv = CELLS * ocvCell(soc);
      const airb = mode !== M.docked && mode !== M.landed && mode !== M.crashed;
      if (airb) {
        const Va = C.air[i], CdA = P.CdA + P.CdAtilt * Math.sin((C.tilt[i] * Math.PI) / 180) ** 2;
        C.power[i] = elecPower(D, P, Fm, Va, 0.5 * D.rho * CdA * Va * Va, v[2] - w[2]);
        const disc = ocv * ocv - 4 * R * C.power[i];
        C.vcell[i] = (disc > 0 ? (ocv + Math.sqrt(disc)) / 2 : ocv / 2) / CELLS;
      } else { C.power[i] = 0; C.vcell[i] = ocv / CELLS; }
      C.distRider[i] = segDist(p, g.feet, g.top);
      C.horizRider[i] = Math.hypot(p[0] - g.head[0], p[1] - g.head[1]);
      C.headClr[i] = len(sub(p, g.head)) - P.droneR - 0.13;
      let ct = Infinity;
      for (const tr of trees) ct = Math.min(ct, treeClearance(p, tr, tanS) - P.droneR);
      C.clrTree[i] = trees.length ? ct : NaN;
      if (other) { const o = other(t); C.distOther[i] = o ? segDist(p, o.feet, o.top) : NaN; }
      C.crossErr[i] = mode === M.follow && !crossSettling ? crossNow : NaN;
      C.lag[i] = mode === M.follow ? tauNow : NaN;
      C.trail[i] = mode === M.follow ? trailNow : NaN;
      C.riderV[i] = s.speed; C.mode[i] = mode; C.beaconOk[i] = beaconOk ? 1 : 0;
      C.estErr[i] = len(sub(pe, g.beacon));
      C.camx[i] = camPos[0]; C.camy[i] = camPos[1]; C.camz[i] = camPos[2];
      const cp = Math.cos(gPitch);
      const gf = [cp * Math.cos(gYaw), cp * Math.sin(gYaw), Math.sin(gPitch)];
      C.gx[i] = gf[0]; C.gy[i] = gf[1]; C.gz[i] = gf[2];
      C.crop[i] = crop; C.vfov[i] = (2 * Math.atan(Math.tan(D.vfovNative / 2) / crop) * 180) / Math.PI;
      // vision framing inside the crop: the crop window shifts toward the detected subject (≈0.12 s lag),
      // limited by the margin between the native and the cropped field of view
      const lt = sub(g.mid, camPos), ll = len(lt) || 1;
      const lnow = [lt[0] / ll + 0.0015 * gauss(), lt[1] / ll + 0.0015 * gauss(), lt[2] / ll + 0.0015 * gauss()];
      if (!losF) losF = lnow.slice(); else for (let j = 0; j < 3; j++) losF[j] += (lnow[j] - losF[j]) * 0.15;
      const lf = len(losF) || 1, lu = [losF[0] / lf, losF[1] / lf, losF[2] / lf];
      const offA = Math.acos(clamp(dot(gf, lu), -1, 1));
      const margin = Math.max(0, (D.vfovNative - (C.vfov[i] * Math.PI) / 180) / 2) * 0.9;
      let ef = gf;
      if (offA > 1e-6 && airb) {
        const k = Math.min(offA, margin) / offA;
        ef = [gf[0] + (lu[0] - gf[0]) * k, gf[1] + (lu[1] - gf[1]) * k, gf[2] + (lu[2] - gf[2]) * k];
        const el = len(ef); ef = [ef[0] / el, ef[1] / el, ef[2] / el];
      }
      C.fx[i] = ef[0]; C.fy[i] = ef[1]; C.fz[i] = ef[2];
      if (P.design >= 3 && airb) { // tracker bounding-box height (with 5 % noise) → crop that puts it at ~380 px
        const fb = footage({ pos: camPos, kind: 'rect', fwd: ef, up: [0, 0, 1], vfovDeg: C.vfov[i], w: 1920, h: 1080 }, s);
        if (fb.inFrame && fb.subjectPx > 1) bboxCrop = clamp(crop * (380 / (fb.subjectPx * (1 + 0.05 * gauss()))), 1, P.maxCrop);
      }
      C.yaw[i] = bodyYaw; C.spin[i] = spin; C.lid[i] = lid; C.btn[i] = btn;
      C.dockErr[i] = mode === M.dock ? Math.hypot(p[0] - pod[0], p[1] - pod[1]) * 100 : NaN;
      C.podx[i] = pod[0]; C.pody[i] = pod[1]; C.podz[i] = pod[2];
      C.leashT[i] = leashT; C.altAgl[i] = p[2] - zT(p[0]);
      if (pRef) { C.refx[i] = pRef[0]; C.refy[i] = pRef[1]; C.refz[i] = pRef[2]; }
    }
    if (cfg.stopWhenDone && (dockedAt !== null || landedAt !== null) && t > (dockedAt ?? landedAt) + 0.5) break;
  }
  return {
    P, D, cols: C, n: si, nS, events, validUntil,
    summary: { visHits, visMiss, peakI, energyWh: energyJ / 3600, airborneT, socEnd: soc, minVcell, dockedAt, landedAt, dockResults, launchAt, tbEnd: Tb },
  };
}

// footage samples for a mission result (rect 1920×1080 output after crop)
export function footageSeries(res, rider) {
  const C = res.cols, n = res.n;
  const out = { px: new Float64Array(n), inFrame: new Float64Array(n), az: new Float64Array(n), elev: new Float64Array(n), fwd: [], los: [] };
  for (let i = 0; i < n; i++) {
    const s = rider.at(C.t[i]);
    const cam = { pos: [C.camx[i], C.camy[i], C.camz[i]], kind: 'rect', fwd: [C.fx[i], C.fy[i], C.fz[i]], up: [0, 0, 1], vfovDeg: C.vfov[i], w: 1920, h: 1080 };
    const f = footage(cam, s);
    out.px[i] = f.inFrame ? f.subjectPx : 0; out.inFrame[i] = f.inFrame; out.az[i] = f.az; out.elev[i] = f.elev;
    out.fwd.push(cam.fwd);
    const g = riderGeom(s);
    const d = sub(g.mid, cam.pos), l = len(d) || 1;
    out.los.push([d[0] / l, d[1] / l, d[2] / l]);
  }
  return out;
}

// residual stabilisation added to the delivered camera axis (deterministic): the
// 3-axis gimbal + EIS leaks a small share of the airframe angular RATE
// (k = 0.3 %, ≈ −50 dB) plus a 0.3 °/s band-limited rate floor; the residual
// angle is integrated from that rate and slowly re-centred (EIS, τ 1 s).
export function addResidualJitter(fwdArr, res, seed = 5, k = 0.003, floorDeg = 0.3) {
  const rng = mulberry32(seed);
  const C = res.cols, out = [], dt = 0.02, d2r = Math.PI / 180;
  let ax = 0, ay = 0, nx = 0, ny = 0;
  for (let i = 0; i < fwdArr.length; i++) {
    let wAir = 0;
    if (i > 0 && Number.isFinite(C.ax[i]) && Number.isFinite(C.ax[i - 1])) {
      const d = Math.hypot(C.ax[i] - C.ax[i - 1], C.ay[i] - C.ay[i - 1], C.az[i] - C.az[i - 1]);
      const dyaw = Math.atan2(Math.sin(C.yaw[i] - C.yaw[i - 1]), Math.cos(C.yaw[i] - C.yaw[i - 1]));
      wAir = Math.hypot(d, dyaw) / dt; // rad/s
    }
    nx = 0.7 * nx + 0.714 * (rng() * 2 - 1) * Math.sqrt(3) * floorDeg * d2r; ny = 0.7 * ny + 0.714 * (rng() * 2 - 1) * Math.sqrt(3) * floorDeg * d2r;
    const sgnA = rng() < 0.5 ? -1 : 1, sgnB = rng() < 0.5 ? -1 : 1;
    ax += (k * wAir * sgnA * 0.7071 + nx) * dt - ax * dt / 1.0;
    ay += (k * wAir * sgnB * 0.7071 + ny) * dt - ay * dt / 1.0;
    const f = fwdArr[i];
    const r = [-f[1], f[0], 0], rl = Math.hypot(r[0], r[1]) || 1;
    const q = [f[0] + (r[0] / rl) * ax, f[1] + (r[1] / rl) * ax, f[2] + ay], ql = Math.hypot(q[0], q[1], q[2]) || 1;
    out.push([q[0] / ql, q[1] / ql, q[2] / ql]);
  }
  return out;
}
