// S3 tetherdrone physics core (SIM-030): backpack power-tethered quadrotor.
//
// Time-stepped, deterministic, Node-safe. Model coordinates (x downslope,
// y left, z up; snow plane z = −x·tanθ).
//  • Tether: lumped-mass chain of NSEG segments (NSEG+1 nodes). Node 0 is the
//    reel exit on the pack dome (kinematic, moves with the rider) unless the
//    weak link has broken; node NSEG is the drone attachment (kinematic, moves
//    with the drone). Axial spring–damper, tension only (slack allowed), rest
//    length L/NSEG (variable-rest-length payout), per-segment cross-flow drag
//    (normal Cd·d) and skin friction (tangential), gravity, snow-plane contact
//    with Coulomb friction, optional branch snag (node pinned).
//  • Reel: drum + motor reduced to an equivalent line mass m_r; torque-mode
//    tension control (T_set) with payout/retract speed limits, a slip limit
//    (F_slip = motor torque / drum radius), hard stop at L_max, free-spool /
//    protect modes, passive weak link at the exit and an active release.
//  • Drone: 3-D point mass, thrust vector with first-order attitude/motor lag,
//    T/W and tilt limits (vertical priority), quadratic drag in gusty wind,
//    tether force at the attachment. Rider-relative station keeping in a
//    low-pass "course" frame from a noisy, delayed UWB/GNSS relative fix,
//    PID + measured-tether-force feed-forward, geofence sphere around the head.
//  • Power: momentum theory with Glauert inflow (thrust, inflow through the
//    disc), FoM_eff, avionics; tether two-conductor I²R at the bus voltage
//    solved exactly (P = V·I − I²R), plus 48 V / 24 V counterfactuals.
// Evidence: numerical-uncalibrated simulation; every coefficient is ASSUMED or
// taken from research/concepts_2026_10_18/aerial/calc_tether.py (A03).
import { skierAt, bodyPoints } from '../common/skier.js';
import { makeWind } from '../common/env.js';
import { mulberry32 } from '../../model/util.js';

export const NSEG = 10;
const G = 9.81;
const RES_CU = 1.72e-8; // Ω·m at 20 °C (cold copper is ~10 % better: conservative)

export const PDEF = {
  Lst: 6, elev: 35, az: 0, Lmax: 10, Tset: 1.5, Fslip: 5, weakLink: 15,
  mass: 0.2, twr: 2.4, tiltMax: 42, CdA: 0.012, rotorR: 0.038, fom: 0.38,
  dT: 1.4, muT: 1.8, cuArea: 0.05, Vbus: 100, geo: 2.0, noise: 0.08, lat: 0.12,
  backup: 30, packWh: 100, attachOff: 0.10, rho: 1.0,
  reelM: 0.02, landT: 0.4, windT: 0, attachFold: 0, windFF: 0, speedSched: 0, stationTau: 0, descendOut: 0, gimbalBW: 0, exit: 0, mastH: 0.7, mastBack: 0.5, snagMode: 0, cutDelay: 0.15,
};

// tether exit / dock geometry on the rider (model coords):
// 0 = pack-top dome (v1), 1 = dock on a rear-tilted telescopic mast above the pack,
// 2 = hip pod on a short left outrigger (dock + exit), 3 = helmet-top guide (geometry study only),
// 4 = dock + exit at the tip of a 0.8 m rear-left hip boom,
// 5 = telescopic pack-top mast: extended (rear-up, = exit 1 geometry) only while stopped for launch/land,
//     retracted to the pack-top exit (= exit 0) while skiing; ext ∈ [0, 1] is the mast stroke
export function exitPoint(s, b, p, ext = 0) {
  const h = s.heading, l = b.left, u = b.up;
  const at = (o, f, ll, uu) => [o[0] + h[0] * f + l[0] * ll + u[0] * uu, o[1] + h[1] * f + l[1] * ll + u[1] * uu, o[2] + h[2] * f + l[2] * ll + u[2] * uu];
  switch (p.exit | 0) {
    case 1: return at(b.packTop, -p.mastBack, 0, 0.1 + p.mastH);
    case 2: return at(b.pelvis, -0.22, 0.42, 0.04);
    case 3: return at(b.head, -0.02, 0, 0.17);
    case 4: return at(b.pelvis, -0.55, 0.6, -0.05);
    case 5: { const lo = add(b.packTop, mul(b.up, 0.1)), hi = at(b.packTop, -p.mastBack, 0, 0.1 + p.mastH); return add(lo, mul(sub(hi, lo), ext)); }
    default: return add(b.packTop, mul(b.up, 0.1));
  }
}
// mount stick that carries the exit (artefact candidate in the image): [from, to] or null
export function mountStick(s, b, p, ext = 0) {
  const h = s.heading, l = b.left, u = b.up;
  const at = (o, f, ll, uu) => [o[0] + h[0] * f + l[0] * ll + u[0] * uu, o[1] + h[1] * f + l[1] * ll + u[1] * uu, o[2] + h[2] * f + l[2] * ll + u[2] * uu];
  if ((p.exit | 0) === 1) return [at(b.packTop, 0, 0, 0.05), exitPoint(s, b, p)];
  if ((p.exit | 0) === 2 || (p.exit | 0) === 4) return [at(b.pelvis, -0.12, 0.17, 0.02), exitPoint(s, b, p)];
  if ((p.exit | 0) === 5 && ext > 0.05) return [at(b.packTop, 0, 0, 0.05), exitPoint(s, b, p, ext)];
  return null;
}

// ------------------------------------------------------------------ vectors
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const V = { sub, add, mul, dot, len, nrm, clamp };

// closest distance between segments p1-q1 and p2-q2
export function segSegDist(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a < 1e-12 && e < 1e-12) return len(r);
  if (a < 1e-12) { s = 0; t = clamp(f / e, 0, 1); } else {
    const c = dot(d1, r);
    if (e < 1e-12) { t = 0; s = clamp(-c / a, 0, 1); } else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = add(p1, mul(d1, s)), c2 = add(p2, mul(d2, t));
  return len(sub(c1, c2));
}

// ------------------------------------------------------------------ rider
// Local work-around (shared skier model unchanged): a hard fall that stops the
// rider at `decel` m/s² from t = tf (tumble/slide), replacing the shared
// model's gentler post-fall slide for the samples after tf.
export function applyHardFall(sk, tf, decel = 8.5) {
  const c = sk.col, dt = sk.sampleDt;
  const i0 = Math.round(tf / dt);
  if (i0 >= sk.n) return sk;
  const ip = Math.max(0, i0 - 1);
  let v = c.v[ip], x = c.x[ip], y = c.y[ip];
  const psi = c.psi[i0], hx = c.hx[i0], hy = c.hy[i0];
  for (let i = i0; i < sk.n; i++) {
    const a = v > 0 ? -decel : 0;
    v = Math.max(0, v + a * dt);
    x += v * Math.cos(psi) * dt; y += v * Math.sin(psi) * dt;
    c.x[i] = x; c.y[i] = y; c.z[i] = -x * sk.tanS; c.v[i] = v;
    c.vx[i] = v * Math.cos(psi); c.vy[i] = v * Math.sin(psi); c.psi[i] = psi; c.hx[i] = hx; c.hy[i] = hy;
    c.lat[i] = 0; c.lean[i] = 0; c.lon[i] = a; c.crouch[i] = 1; c.fallen[i] = 1; c.plantL[i] = 0; c.plantR[i] = 0;
  }
  return sk;
}

// Local work-around: the shared skier model switches lean/crouch instantly at a
// hockey stop or fall, which would teleport the pack anchor by up to 0.6 m in
// one sample. Body inclination is low-passed (τ = 0.15 s, a physiological
// limit) on a private copy; lat is made consistent with the filtered lean.
export function smoothBody(sk, tau = 0.15) {
  const c = sk.col, n = sk.n, k = 1 - Math.exp(-sk.sampleDt / tau);
  const lean = new Float64Array(n), crouch = new Float64Array(n), lat = new Float64Array(n);
  lean[0] = c.lean[0]; crouch[0] = c.crouch[0];
  for (let i = 1; i < n; i++) { lean[i] = lean[i - 1] + (c.lean[i] - lean[i - 1]) * k; crouch[i] = crouch[i - 1] + (c.crouch[i] - crouch[i - 1]) * k; }
  for (let i = 0; i < n; i++) lat[i] = 9.81 * Math.tan(lean[i]);
  return { ...sk, col: { ...c, lean, crouch, lat } };
}

// rider sampler with an optional standing start (demo / launch scenarios)
export function makeRider(sk, tGo = 0) {
  return (t) => {
    const s = skierAt(sk, Math.max(0, t - tGo));
    if (t < tGo) { s.speed = 0; s.vel = [0, 0, 0]; s.accel = 0; s.lat = 0; s.lean = 0; s.crouch = 0.25; s.plantL = s.plantR = 0; }
    return s;
  };
}

// dome top (reel exit / dock) on the pack, in model coordinates
export function domePoint(s, b = bodyPoints(s), p = PDEF) { return exitPoint(s, b, p); }

// body capsules for proximity / silhouette: [p, q, radius, name]
export function bodyCapsules(s, b = bodyPoints(s)) {
  const h = s.heading, l = b.left, u = b.up;
  const P = (o, f, ll, uu) => [o[0] + h[0] * f + l[0] * ll + u[0] * uu, o[1] + h[1] * f + l[1] * ll + u[1] * uu, o[2] + h[2] * f + l[2] * ll + u[2] * uu];
  const shC = P(b.chest, 0, 0, 0.16);
  const caps = [
    [b.head, b.head, 0.14, 'head'],
    [b.pelvis, shC, 0.18, 'torso'],
    [b.packMid, b.packTop, 0.13, 'pack'],
  ];
  for (const sg of [1, -1]) {
    const hip = P(b.pelvis, 0, sg * 0.1, 0), foot = P(b.feet, 0, sg * 0.1, 0.05);
    caps.push([hip, foot, 0.09, 'leg']);
    const sh = P(shC, 0, sg * 0.2, 0), hand = P(b.pelvis, 0.36, sg * 0.31, 0.16);
    caps.push([sh, hand, 0.06, 'arm']);
    const tip = [hand[0] - h[0] * 0.62 + l[0] * sg * 0.1, hand[1] - h[1] * 0.62 + l[1] * sg * 0.1, hand[2] - 0.95];
    caps.push([hand, tip, 0.015, 'pole']);
    caps.push([P(b.feet, -0.8, sg * 0.1, 0.03), P(b.feet, 0.85, sg * 0.1, 0.03), 0.05, 'ski']);
  }
  return caps;
}

// ------------------------------------------------------------------ power
// rotor power, momentum theory + Glauert inflow; n = thrust direction (unit),
// u = air velocity relative to the drone (wind − v)
export function rotorPower(T, n, u, p) {
  const A = 4 * Math.PI * p.rotorR * p.rotorR;
  if (T <= 1e-6) return 0;
  const vh2 = T / (2 * p.rho * A);
  const un = -dot(u, n); // freestream through the disc (climb-like, +)
  const ut = len(sub(u, mul(n, dot(u, n))));
  let vi = Math.sqrt(vh2);
  for (let k = 0; k < 12; k++) vi = 0.5 * vi + 0.5 * (vh2 / Math.sqrt(ut * ut + (un + vi) * (un + vi)));
  const Pi = Math.max(0.15 * T * Math.sqrt(vh2), T * (un + vi)); // windmill-brake floor
  return Pi / p.fom;
}

// two-conductor tether: deliver P at the drone end from bus V over length L
export function tetherElectrical(P, Vbus, L, p) {
  const R = (2 * RES_CU * L) / (p.cuArea * 1e-6);
  const disc = Vbus * Vbus - 4 * R * P;
  if (disc < 0) return { R, I: NaN, loss: NaN, ok: false, Pmax: (Vbus * Vbus) / (4 * R) };
  const I = (Vbus - Math.sqrt(disc)) / (2 * R);
  return { R, I, loss: I * I * R, ok: true, Pmax: (Vbus * Vbus) / (4 * R), Vdrone: Vbus - I * R };
}


// one integration substep of the dynamic tether and the reel (allocation-free)
function tetherSub(S, h, A, Av, wa, wd, att, dv) {
  const { N, px, py, pz, vx, vy, vz, fx, fy, fz, segT, l0a, mna, mu, EA, zeta, dT, CdN, CfT, rho, tanS, cn, nSx, nSz } = S;
  const pinned = S.pinned, broken = S.broken === 1;
  let L = S.L, Ld = S.Ld;
  // rest lengths: payout is shared by the segments between the reel and a snag (if any)
  if (pinned < 0 && S.nonUniform) { let sum = 0; for (let j = 0; j < N; j++) sum += l0a[j]; const k = L / (sum || 1); for (let j = 0; j < N; j++) l0a[j] *= k; }
  else if (pinned < 0) { for (let j = 0; j < N; j++) l0a[j] = L / N; }
  else { const la = Math.max(0.05 * pinned, L - S.Lfix) / pinned; for (let j = 0; j < pinned; j++) l0a[j] = la; }
  for (let j = 0; j <= N; j++) mna[j] = mu * 0.5 * ((j > 0 ? l0a[j - 1] : 0) + (j < N ? l0a[j] : 0));
  if (!broken) { px[0] = A[0]; py[0] = A[1]; pz[0] = A[2]; vx[0] = Av[0]; vy[0] = Av[1]; vz[0] = Av[2]; }
  if (!S.cut) { px[N] = att[0]; py[N] = att[1]; pz[N] = att[2]; vx[N] = dv[0]; vy[N] = dv[1]; vz[N] = dv[2]; }
  if (pinned >= 0) { px[pinned] = S.pinX; py[pinned] = S.pinY; pz[pinned] = S.pinZ; vx[pinned] = 0; vy[pinned] = 0; vz[pinned] = 0; }
  for (let j = 0; j <= N; j++) { fx[j] = 0; fy[j] = 0; fz[j] = -mna[j] * G; }
  for (let j = 0; j < N; j++) {
    const ex = px[j + 1] - px[j], ey = py[j + 1] - py[j], ez = pz[j + 1] - pz[j];
    const sl = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-9;
    const ux = ex / sl, uy = ey / sl, uz = ez / sl;
    let T = 0;
    const l0s = l0a[j];
    if (sl > l0s) {
      const ks = EA / l0s;
      const rv = (vx[j + 1] - vx[j]) * ux + (vy[j + 1] - vy[j]) * uy + (vz[j + 1] - vz[j]) * uz;
      T = ks * (sl - l0s) + 2 * zeta * Math.sqrt(ks * mu * l0s) * rv;
      if (T < 0) T = 0;
    }
    segT[j] = T;
    // aerodynamic drag on the segment (wind interpolated anchor → drone), half to each node
    const q = (j + 0.5) / N;
    const ax2 = wa[0] + (wd[0] - wa[0]) * q - 0.5 * (vx[j] + vx[j + 1]);
    const ay2 = wa[1] + (wd[1] - wa[1]) * q - 0.5 * (vy[j] + vy[j + 1]);
    const az2 = wa[2] + (wd[2] - wa[2]) * q - 0.5 * (vz[j] + vz[j + 1]);
    const ut = ax2 * ux + ay2 * uy + az2 * uz;
    const unx = ax2 - ut * ux, uny = ay2 - ut * uy, unz = az2 - ut * uz;
    const un = Math.sqrt(unx * unx + uny * uny + unz * unz);
    const kn = 0.25 * rho * CdN * dT * sl * un, kt2 = 0.25 * rho * CfT * Math.PI * dT * sl * Math.abs(ut);
    const dfx = kn * unx + kt2 * ut * ux, dfy = kn * uny + kt2 * ut * uy, dfz = kn * unz + kt2 * ut * uz;
    fx[j] += T * ux + dfx; fy[j] += T * uy + dfy; fz[j] += T * uz + dfz;
    fx[j + 1] += -T * ux + dfx; fy[j + 1] += -T * uy + dfy; fz[j + 1] += -T * uz + dfz;
  }
  // interior nodes (+ node 0 after the weak link broke: half segment + 4 g connector)
  let snow = 0;
  for (let j = broken ? 0 : 1; j <= (S.cut ? N : N - 1); j++) {
    if (j === pinned) continue;
    let mj = mna[j];
    if (j === 0) { mj += 0.004; fz[0] -= 0.004 * G; }
    if (j === N) { mj += 0.002; fz[N] -= 0.002 * G; } // cut end: half segment + 2 g ferrule
    vx[j] += (fx[j] / mj) * h; vy[j] += (fy[j] / mj) * h; vz[j] += (fz[j] / mj) * h;
    px[j] += vx[j] * h; py[j] += vy[j] * h; pz[j] += vz[j] * h;
    const hs = (pz[j] + px[j] * tanS) * cn;
    if (hs < 0.0007) {
      px[j] -= (hs - 0.0007) * nSx; pz[j] -= (hs - 0.0007) * nSz;
      const vn = vx[j] * nSx + vz[j] * nSz;
      if (vn < 0) {
        vx[j] -= vn * nSx; vz[j] -= vn * nSz;
        const tl = Math.sqrt(vx[j] * vx[j] + vy[j] * vy[j] + vz[j] * vz[j]);
        const red = tl > 1e-9 ? Math.max(0, 1 - (0.15 * -vn) / tl) : 0; // Coulomb friction μ = 0.15
        vx[j] *= red; vy[j] *= red; vz[j] *= red;
      }
      snow = 1;
    }
  }
  S.snow = snow;
  const T0 = segT[0];
  S.T0 = T0; S.TN = segT[N - 1];
  const e0x = px[1] - px[0], e0y = py[1] - py[0], e0z = pz[1] - pz[0], e0l = Math.sqrt(e0x * e0x + e0y * e0y + e0z * e0z) || 1;
  const kf = broken ? 0 : T0 / e0l;
  S.Fanc[0] = e0x * kf; S.Fanc[1] = e0y * kf; S.Fanc[2] = e0z * kf;
  if (S.cut) { S.Ftd[0] = 0; S.Ftd[1] = 0; S.Ftd[2] = 0; } else { S.Ftd[0] = fx[N]; S.Ftd[1] = fy[N]; S.Ftd[2] = fz[N]; } // segment tension + half-segment drag + node weight
  // ---- reel: constant-tension winch damped towards the drone's range rate (telemetry feed-forward),
  // payout/retract speed limits, slip at F_slip, hard stop at L_max, weak link at the exit
  if (!broken) {
    let fm;
    if (S.reelMode === 2) fm = S.Ffree;
    else {
      const Ts = S.reelMode === 1 ? 0.8 : S.Tset, Fs = S.reelMode === 1 ? 3 : S.Fslip;
      fm = Ts + S.Brr * (Ld - S.rr);
      if (Ld > S.vOut) fm += S.Klim * (Ld - S.vOut);
      if (Ld < -S.vIn) fm -= S.Klim * (-S.vIn - Ld);
      fm = fm < -2 ? -2 : fm > Fs ? Fs : fm; // motor may also brake the drum (−2 N)
    }
    S.Fm = fm;
    Ld += ((T0 - fm - S.cr * Ld) / S.mr) * h;
    L += Ld * h;
    if (L >= S.Lmax && Ld > 0) { L = S.Lmax; Ld = 0; }
    if (T0 > S.weakLink) { S.broken = 1; S.brokeNow = 1; }
    if (L < S.Ldyn) { L = S.Ldyn; if (Ld < 0) Ld = 0; }
  } else S.Fm = 0;
  S.L = L; S.Ld = Ld;
}

// ------------------------------------------------------------------ core
// sc: { duration, skier: sk (simulateSkier result, possibly modified), tGo,
//       wind: makeWind options, plan: { launchAt, landAt, offset(t) → {Lst, elev, az},
//       faultAt, branch: {x, y0, y1, h}, start: 'flying'|'docked' } }
export function runCore(pIn, sc) {
  const p = { ...PDEF, ...pIn };
  const sk = smoothBody(sc.skier);
  const rider = makeRider(sk, sc.tGo || 0);
  const tanS = sk.tanS, cn = 1 / Math.sqrt(1 + tanS * tanS), nS = [tanS * cn, 0, cn];
  const snowZ = (x) => -x * tanS;
  const wind = makeWind(sc.wind || {});
  const plan = sc.plan || {};
  const rng = mulberry32(sc.seed || 11);
  const gauss = () => { const u1 = Math.max(1e-12, rng()), u2 = rng(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };

  const SDT = 0.02, n = Math.floor(sc.duration / SDT + 1e-9) + 1;
  const N = NSEG, NN = N + 1;
  // tether parameters
  const mu = p.muT / 1000, dT = p.dT / 1000, EA = 2000, zeta = 0.35, CdN = 1.2, CfT = 0.02;
  const mr = p.reelM || 0.02, cr = 0.4, Brr = 1.5, vOut = 4, vIn = 1.5, Klim = 6, Ffree = 0.25, Ldyn = 1.2;
  const m = p.mass, Tmax = p.twr * m * G, tilt = (p.tiltMax * Math.PI) / 180, tauT = 0.06;
  const Kp = p.Kp ?? 4.0, Kd = p.Kd ?? 3.6, Ki = 0.8;
  const Phover = rotorPower(m * G, [0, 0, 1], [0, 0, 0], p) + 6;
  const Ebackup0 = Phover * p.backup; // J at hover: "backup cell ≈ 30 s"

  // output storage
  const O = {};
  for (const k of ['ax', 'ay', 'az', 'dx', 'dy', 'dz', 'dvx', 'dvy', 'dvz', 'ux', 'uy', 'uz', 'yx', 'yy', 'T0', 'T0max', 'Fx', 'Fy', 'Fz', 'TN', 'L', 'Ld', 'Fm', 'mode', 'reelMode',
    'thrust', 'tilt', 'air', 'Pdrone', 'Ploss', 'Ppack', 'Ploss48', 'Pmax24', 'rotor', 'dome', 'snow', 'Eb', 'cut', 'mext', 'aside', 'attR', 'aphi', 'cx', 'cy', 'hx', 'hy', 'rx', 'ry', 'rz']) O[k] = new Float64Array(n);
  const nodesOut = new Float32Array(n * NN * 3);
  const events = [];
  const ev = (t, type, severity, zh, en) => events.push({ t, type, severity, zh, en });

  // ---- state
  const px = new Float64Array(NN), py = new Float64Array(NN), pz = new Float64Array(NN);
  const vx = new Float64Array(NN), vy = new Float64Array(NN), vz = new Float64Array(NN);
  const fx = new Float64Array(NN), fy = new Float64Array(NN), fz = new Float64Array(NN);
  const segT = new Float64Array(N);
  let pinned = -1; let pinPos = null;
  let broken = false, released = false;
  let L = 0, Ld = 0, dyn = false;
  let reelMode = 'tension';
  let mode = plan.start === 'docked' ? 'docked' : 'follow';
  let modeT = 0;
  let dp, dv = [0, 0, 0], FT = [0, 0, m * G];
  let Ieint = [0, 0, 0];
  let backup = false, Eb = Ebackup0, landed = false, dropped = false;
  let fallDet = false, decelT = 0, abort = false, abortT = 0, slipT = 0, tethAnomT = 0;
  let courseC = null; let frozen = null;
  let noiseV = [0, 0, 0];
  let dome = mode === 'docked' ? 0 : 1, rotor = mode === 'docked' ? 0 : 1;
  let landPhase = 0, landPhaseT = 0, retries = 0, touchErr = NaN, touchV = NaN, touchT = NaN, launchT = NaN;
  let FtethMeas = [0, 0, 0];
  let lastRef = null, vrefPrev = [0, 0, 0], aff = [0, 0, 0];
  const hist = []; // delayed rider samples
  let AS = null, VS = null;
  let relLand = null, snagT = -1, cutT = -1, retryUntil = -1, holdUntil = -1;
  const prevSide = new Array(N).fill(0);
  const l0a = new Float64Array(N), mna = new Float64Array(NN); let Lfix = 0;
  const S = { N, px, py, pz, vx, vy, vz, fx, fy, fz, segT, l0a, mna, mu, EA, zeta, dT, CdN, CfT, rho: p.rho, tanS, cn, nSx: nS[0], nSz: nS[2],
    cut: 0, nonUniform: 0, pinned: -1, pinX: 0, pinY: 0, pinZ: 0, Lfix: 0, broken: 0, L: 0, Ld: 0, Fm: 0, T0: 0, TN: 0, reelMode: 0, rr: 0,
    Tset: p.Tset, Fslip: p.Fslip, Lmax: p.Lmax, weakLink: p.weakLink, mr, cr, Brr, vOut, vIn, Klim, Ffree, Ldyn,
    Fanc: new Float64Array(3), Ftd: new Float64Array(3), snow: 0, brokeNow: 0 };
  const latN = Math.max(0, Math.round(p.lat / SDT));

  let mastExt = (p.exit | 0) === 5 && plan.start === 'docked' ? 1 : 0;
  const riderState = (t) => { const s = rider(t); const b = bodyPoints(s); return { s, b, A: exitPoint(s, b, p, mastExt) }; };
  const R0 = riderState(0); let Rnext = R0;
  const offsetAt = (t) => ({ Lst: p.Lst, elev: p.elev, az: p.az, ...(plan.offset ? plan.offset(t, p) : {}) });
  const courseInit = () => { const h = R0.s.heading; return [h[0], h[1]]; };
  courseC = courseInit();

  const stationFrom = (rp, A, c, off, extraUp = 0) => {
    const el = (off.elev * Math.PI) / 180, az = (off.az * Math.PI) / 180, Rr = off.Lst * 0.97;
    const back = [-c[0], -c[1]], left = [-c[1], c[0]];
    const hx = (back[0] * Math.cos(az) + left[0] * Math.sin(az)) * Rr * Math.cos(el);
    const hy = (back[1] * Math.cos(az) + left[1] * Math.sin(az)) * Rr * Math.cos(el);
    return [A[0] + hx, A[1] + hy, A[2] + Rr * Math.sin(el) + extraUp];
  };
  // hip docks: the drone's tether eyelet seats in the exit funnel, body outboard (eyelet side towards the rider)
  const hipDock = (p.exit | 0) === 2 || (p.exit | 0) === 4 || (p.exit | 0) === 5; // eyelet-seating docks
  const dockYaw = (Rs) => { const u = nrm([Rs.b.pelvis[0] - Rs.A[0], Rs.b.pelvis[1] - Rs.A[1], 0]); return [u[1], -u[0]]; };
  const dockCenter = (A, yw) => (hipDock ? (() => { const a = attachVec(yw); return [A[0] - a[0], A[1] - a[1], A[2] + 0.02]; })() : [...A]);
  // launch/land path from a hip dock: first away from the body (out-left and back), then up
  let wEst = [0, 0];
  const hipOut = (c) => ((p.exit | 0) === 5 ? (() => { const fw = Math.max(0, wEst[0] * c[0] + wEst[1] * c[1]); const wb = [wEst[0] - fw * c[0], wEst[1] - fw * c[1]]; const wl = Math.hypot(wb[0], wb[1]); const k = Math.min(1, wl / 4) * 0.7 / (wl || 1); return [-c[0] * 0.6 + wb[0] * k, -c[1] * 0.6 + wb[1] * k, 0]; })() : (p.exit | 0) === 4 ? [-c[0] * 1.0 - c[1] * 0.4, -c[1] * 1.0 + c[0] * 0.4, 0] : [-c[0] * 0.7 - c[1] * 0.7, -c[1] * 0.7 + c[0] * 0.7, 0]);
  // tether eyelet: left boom (v1/v2); v3 runs it on a ring trolley so it sits on the side facing away
  // from the station side (left for a right-hand station, right for a left-hand one, rear mid-transfer)
  // ring angle φ: 0 = left boom, π/2 = rear, π = right
  let attPhi = 0, attPhiPrev = 0;
  // v3: the eyelet arm folds to the hub (4 cm) for launch/docking and swings out to attachOff in flight
  let attR = p.attachFold && plan.start === 'docked' ? 0.04 : p.attachOff, attRPrev = attR;
  const attachVec = (yw, ph = attPhi, r = attR) => { const c = Math.cos(ph), sn = Math.sin(ph); return [(-yw[1] * c - yw[0] * sn) * r, (yw[0] * c - yw[1] * sn) * r]; };
  const attachOf = (d, yw) => { const a = attachVec(yw); return [d[0] + a[0], d[1] + a[1], d[2] - 0.02]; };

  // ---- initial condition
  let yaw = [R0.s.heading[0], R0.s.heading[1]];
  if (mode === 'docked') {
    if (hipDock) yaw = dockYaw(R0);
    dp = dockCenter(R0.A, yaw); dv = [...R0.s.vel]; L = 0.12; dyn = false; FT = [0, 0, 0];
  } else {
    const off = offsetAt(0);
    dp = stationFrom(R0.s.pos, R0.A, courseC, off);
    dv = [...R0.s.vel];
    const toR = sub(R0.b.head, dp); yaw = nrm([toR[0], toR[1], 0]);
    const at = attachOf(dp, yaw);
    L = len(sub(at, R0.A)) * 1.001; dyn = true;
    for (let i = 0; i < NN; i++) {
      const w = i / N; const sag = 0;
      px[i] = R0.A[0] + (at[0] - R0.A[0]) * w; py[i] = R0.A[1] + (at[1] - R0.A[1]) * w; pz[i] = R0.A[2] + (at[2] - R0.A[2]) * w - sag;
      vx[i] = dv[0]; vy[i] = dv[1]; vz[i] = dv[2];
    }
    FT = [0, 0, m * G + p.Tset * 0.5];
  }

  for (let k = latN; k > 0; k--) { const dtk = -k * SDT; hist.push({ pos: add(R0.s.pos, mul(R0.s.vel, dtk)), vel: R0.s.vel, head: add(R0.b.head, mul(R0.s.vel, dtk)), A: add(R0.A, mul(R0.s.vel, dtk)), heading: R0.s.heading }); }
  let Aprev = R0.A, wA = wind(0, R0.A), wD = wind(0, dp);
  let T0 = 0, TN = 0, Fm = 0, snowHit = 0;

  for (let i = 0; i < n; i++) {
    const t = i * SDT;
    const R = i === 0 ? R0 : Rnext;
    const Rn = riderState(t + SDT); Rnext = Rn;
    const A0 = R.A, A1 = Rn.A;
    const Av = mul(sub(A1, A0), 1 / SDT);
    hist.push({ pos: R.s.pos, vel: R.s.vel, head: R.b.head, A: A0, heading: R.s.heading });
    const md = hist[Math.max(0, hist.length - 1 - latN)];

    // ---------------- measurement (UWB/GNSS relative fix: coloured noise + latency, latency-compensated)
    const aN = Math.exp(-SDT / 0.3), bN = Math.sqrt(1 - aN * aN) * p.noise;
    noiseV = [aN * noiseV[0] + bN * gauss(), aN * noiseV[1] + bN * gauss(), aN * noiseV[2] + bN * 0.6 * gauss()];
    // final approach (< 2 m of line): relative fix from the reel's tether-angle encoder + length (σ ≈ 1 cm, ASSUMED)
    if ((mode === 'land' && landPhase === 1) || mode === 'spinup' || (mode === 'launch' && t - modeT < 1.5)) noiseV = mul(noiseV, 0.15);
    const lead = latN * SDT;
    const rHat = add(add(md.pos, mul(md.vel, lead)), noiseV);
    const AHat = add(add(md.A, mul(md.vel, lead)), noiseV);
    const headHat = add(add(md.head, mul(md.vel, lead)), noiseV);
    const vHat = md.vel;
    const spH = Math.hypot(vHat[0], vHat[1]);
    if (spH > 1.5 && !frozen) {
      const k = 1 - Math.exp(-SDT / 1.2);
      courseC = [courseC[0] + (vHat[0] / spH - courseC[0]) * k, courseC[1] + (vHat[1] / spH - courseC[1]) * k];
      const cl = Math.hypot(courseC[0], courseC[1]) || 1; courseC = [courseC[0] / cl, courseC[1] / cl];
    }
    const cUse = frozen || courseC;

    // ---------------- supervisory logic (50 Hz)
    // fall detection: pack IMU deceleration > 6 m/s² for 0.1 s (ASSUMED)
    if (!fallDet && mode === 'follow') {
      decelT = R.s.accel < -6 ? decelT + SDT : 0;
      if (decelT >= 0.1) {
        fallDet = true; frozen = [...courseC]; reelMode = 'protect';
        ev(t, 'fall', 'warning', '检测到摔倒（背包IMU减速>6 m/s²）：卷轴转保护/放线模式，无人机刹停并爬升', 'Fall detected (pack IMU decel > 6 m/s²): reel → protect/free-spool, drone brakes and climbs');
      }
    }
    // power fault on the tether conductor
    if (plan.faultAt != null && t >= plan.faultAt && !backup && (mode === 'follow' || mode === 'land')) {
      backup = true; mode = 'descend'; modeT = t;
      ev(t, 'powerfault', 'warning', '系留导线断电：无人机切换机载备用电池（约30 s），提醒滑雪者停下，边跟随边下降', 'Tether power lost: drone on its backup cell (~30 s), rider alerted to stop; descend while following');
    }
    // launch / land commands
    if (plan.launchAt != null && mode === 'docked' && t >= plan.launchAt && !(launchT >= 0)) { mode = 'spinup'; modeT = t; launchT = t; ev(t, 'launch', 'info', '按键起飞：罩盖打开、电机起转', 'Launch tap: dome opens, motors spin up'); }
    if (plan.landAt != null && mode === 'follow' && t >= plan.landAt) { mode = 'land'; modeT = t; landPhase = 0; ev(t, 'land', 'info', '降落指令：返回背包上方，卷轴收线', 'Land command: return above the pack, reel retracts'); }
    if (mode === 'spinup' && t - modeT >= 1.6) { mode = 'launch'; modeT = t; FT = [0, 0, m * G + 0.8]; ev(t, 'liftoff', 'info', '离开罩盖起飞', 'Lift-off from the dome'); }
    if (mode === 'launch' && t - modeT > 4.5) { mode = 'follow'; modeT = t; }

    // ---------------- reference
    let ref, vref = vHat, geoOn = true, Kscale = 1;
    const off = offsetAt(t);
    // v3 speed schedule: above ~13 m/s pull the station in behind the rider (az → 0, shorter outside-of-turn path, lower KE)
    if (p.speedSched) { const vh = Math.hypot(hist[hist.length - 1].vel[0], hist[hist.length - 1].vel[1]); off.az *= clamp((15.5 - vh) / 2.5, p.schedMin ?? 0, 1); }
    { const kw = 1 - Math.exp(-SDT / 3); wEst = [wEst[0] + (wD[0] - wEst[0]) * kw, wEst[1] + (wD[1] - wEst[1]) * kw]; } // wind estimate from attitude/airspeed (slow)
    attPhiPrev = attPhi; attRPrev = attR;
    if (p.attachFold) { const want = mode === 'follow' || mode === 'descend' ? p.attachOff : 0.04; attR += clamp(want - attR, -SDT * 0.3, SDT * 0.3); }
    if (p.attachSwap) { const tgt = mode === 'follow' || mode === 'descend' ? (Math.PI / 2) * (1 + clamp(off.az / 12, -1, 1)) : 0; attPhi += clamp(tgt - attPhi, -SDT * Math.PI / 1.5, SDT * Math.PI / 1.5); } // ring trolley ≈1.5 s end to end
    // telescopic mast: extend while stopped for launch/land, retract once the drone is clear (2 s stroke)
    if ((p.exit | 0) === 5) { const want = mode === 'docked' || mode === 'spinup' || mode === 'land' || mode === 'launch' ? 1 : 0; mastExt = clamp(mastExt + clamp(want - mastExt, -SDT / 2, SDT / 2), 0, 1); }
    // v3.1: station origin = the rider's exit point passed through a critically damped 2nd-order tracking filter
    // (τ = stationTau): follows the run line without lag but ignores the lateral swing of individual turns
    if (p.stationTau > 0 && (mode === 'follow' || mode === 'descend')) {
      if (!AS) { AS = [...AHat]; VS = [...vHat]; }
      const kv = SDT / p.stationTau, kp = (2 * SDT) / p.stationTau;
      VS = add(VS, mul(sub(vHat, VS), kv)); AS = add(add(AS, mul(VS, SDT)), mul(sub(AHat, AS), kp));
    } else { AS = null; VS = null; }
    if (mode === 'follow' || mode === 'descend') {
      if (mode === 'descend' && p.descendOut && !abort) { off.az *= 0.5; off.elev = Math.max(off.elev, 45); } // power loss: hold a high station behind the rider (line well above the arms) until the rider has stopped
      const cS = VS && Math.hypot(VS[0], VS[1]) > 1.5 ? (() => { const l = Math.hypot(VS[0], VS[1]); return [VS[0] / l, VS[1] / l]; })() : cUse;
      ref = stationFrom(rHat, AS || AHat, cS, off, fallDet ? 1.5 : 0);
      if (AS) {
        // smooth only the lateral swing: along-track and vertical offsets follow the actual rider (keeps the range)
        const dA = sub(AHat, AS), along = dA[0] * cS[0] + dA[1] * cS[1];
        ref = [ref[0] + cS[0] * along, ref[1] + cS[1] * along, ref[2] + dA[2]];
        const dVv = sub(vHat, VS), alongV = dVv[0] * cS[0] + dVv[1] * cS[1];
        vref = [VS[0] + cS[0] * alongV, VS[1] + cS[1] * alongV, vHat[2]];
      }
      if (mode === 'descend') {
        // follow the rider while descending at 0.7 m/s; once the rider has stopped, land 3 m behind/beside
        const spd = Math.hypot(vHat[0], vHat[1]);
        const hDes = Math.max(0, (ref[2] - snowZ(ref[0])) - 0.7 * (t - modeT));
        if (spd < 0.6 && t - modeT > 1.5) {
          const back = [-cUse[0], -cUse[1]];
          const sideK = p.descendOut ? 0 : 2, backK = p.descendOut ? 5 : 5;
          const lx = rHat[0] + back[0] * backK + cUse[1] * sideK, ly = rHat[1] + back[1] * backK - cUse[0] * sideK; // land well clear so the line lies away from the legs
          const hNow = dp[2] - snowZ(dp[0]);
          ref = [lx, ly, snowZ(lx) + Math.max(-0.2, Math.min(hNow, hDes) - 0.5)];
        } else if (!p.descendOut) ref = [ref[0], ref[1], snowZ(ref[0]) + Math.max(0.8, hDes)];
      }
      if (abort) { ref = lastRef; vref = [0, 0, 0]; }
    } else if (mode === 'launch') {
      const up = Math.min(1.6, 0.9 * (t - modeT));
      let climb = add(dockCenter(AHat, yaw), [0, 0, up + 0.05]);
      if ((p.exit | 0) === 2 || (p.exit | 0) === 4 || (p.exit | 0) === 5) { const o = Math.min(1, up / 1.2); climb = add(climb, mul(hipOut(cUse), o)); } // out to the left and back first
      const w = smooth((t - modeT - 1.8) / 2.7);
      const st = stationFrom(rHat, AHat, cUse, off);
      ref = add(mul(climb, 1 - w), mul(st, w)); geoOn = false;
    } else if (mode === 'land') {
      const side = (p.exit | 0) >= 2 && (p.exit | 0) !== 3 ? hipOut(cUse) : [0, 0, 0];
      const pre = add(AHat, add(side, [0, 0, 1.3]));
      if (landPhase === 0) {
        // rider-relative blend from the current offset to 1.3 m above (hip dock: and 1 m out/back of) the dock
        if (t - modeT < SDT * 1.5 || !relLand) relLand = sub(dp, AHat);
        const w = smooth((t - modeT) / 3.2);
        ref = add(AHat, add(mul(relLand, 1 - w), mul(add(side, [0, 0, 1.3]), w)));
        if (w >= 1 && len(sub(dp, pre)) < 0.3 && len(sub(dv, vHat)) < 0.5) { landPhase = 1; landPhaseT = t; }
      } else {
        const tau = t - landPhaseT, hgt = Math.max(-0.06, tau < 2.25 ? 1.3 - 0.4 * tau : 0.4 - 0.25 * (tau - 2.25));
        const so = Math.min(1, hgt / 1.3); // hip dock: converge in along the outward/back line
        ref = add(dockCenter(AHat, yaw), add(mul(side, so * so), [0, 0, hgt])); Kscale = 2.0; // stiffer final-approach loop on the precise tether-angle fix
      }
      geoOn = false;
    }
    if (mode === 'follow' && !abort) lastRef = ref;
    if (mode !== 'land' && mode !== 'launch') lastRef = ref || lastRef;

    // ---------------- position controller (50 Hz)
    let Fcmd = [0, 0, 0];
    const flying = mode === 'follow' || mode === 'launch' || mode === 'land' || mode === 'descend';
    if (flying && !landed && !dropped) {
      const e = sub(ref, dp), evv = sub(vref, dv);
      const vrefF = vref;
      const ka = 1 - Math.exp(-SDT / 0.25);
      aff = add(aff, mul(sub(mul(sub(vrefF, vrefPrev), 1 / SDT), aff), ka)); vrefPrev = vrefF;
      if ((mode === 'follow' && !abort) || mode === 'land') Ieint = add(Ieint, mul(e, SDT * (mode === 'land' ? 2 : 1))).map((q) => clamp(q, -1.5, 1.5));
      else Ieint = mul(Ieint, Math.exp(-SDT / 0.6)); // integrator bleeds off outside station keeping
      let a = add(add(mul(e, Kp * Kscale), mul(evv, Kd * Kscale)), add(mul(Ieint, Ki), mul(aff, 0.8)));
      // geofence: keep the drone outside a sphere around the (estimated) head
      if (geoOn && mode !== 'land') {
        const rel = sub(dp, headHat), d = len(rel), nn = mul(rel, 1 / (d || 1));
        const marg = p.geo + 1.0;
        if (d < marg) {
          a = add(a, mul(nn, 7 * (marg - d)));
          const closing = dot(sub(dv, vHat), nn);
          if (closing < 0) a = add(a, mul(nn, -2.5 * closing));
        }
      }
      // a ← clip: horizontal ≤ 12 m/s² request; then convert to force
      Fcmd = sub(add(mul(a, m), [0, 0, m * G]), FtethMeas);
      // drag feed-forward on the estimated airspeed (slow wind estimate from attitude; gusts left to the loop)
      const uE = [(p.windFF ? wEst[0] : 0) - dv[0], (p.windFF ? wEst[1] : 0) - dv[1], -dv[2]];
      Fcmd = sub(Fcmd, mul(uE, 0.5 * p.rho * p.CdA * len(uE)));
      let Fz = clamp(Fcmd[2], 0.25 * m * G, Tmax);
      let Fh = Math.hypot(Fcmd[0], Fcmd[1]);
      const FhMax = Math.min(Fz * Math.tan(tilt), Math.sqrt(Math.max(0, Tmax * Tmax - Fz * Fz)));
      if (Fh > FhMax) { const k = FhMax / Fh; Fcmd[0] *= k; Fcmd[1] *= k; }
      Fcmd[2] = Fz;
      if (backup && Eb <= 0) { Fcmd = [0, 0, 0]; if (!dropped) { dropped = true; ev(t, 'drop', 'invalid', '备用电池耗尽：无人机失去推力坠落', 'Backup cell exhausted: drone loses thrust and falls'); } }
    }
    if (mode === 'spinup') { rotor = clamp((t - modeT) / 1.2, 0, 1) * 0.6; dome = clamp((t - modeT) / 1.0, 0, 1); }
    else if (flying && !landed && !dropped) rotor = 1;
    else if (mode === 'docked') { rotor = Math.max(0, rotor - SDT * 1.5); dome = rotor > 0.05 ? 1 : Math.max(0, dome - SDT / 1.0); }
    else rotor = Math.max(0, rotor - SDT * 2);

    // yaw: face the rider (camera side)
    const seat = hipDock && (mode === 'docked' || mode === 'spinup' || (mode === 'launch' && t - modeT < 1.0) || (mode === 'land' && landPhase === 1));
    if (seat) { const dy = dockYaw(R); const ky = mode === 'land' ? 1 - Math.exp(-SDT / 0.4) : 1; yaw = nrm([yaw[0] + (dy[0] - yaw[0]) * ky, yaw[1] + (dy[1] - yaw[1]) * ky, 0]).slice(0, 2); }
    else if (mode !== 'docked' && mode !== 'spinup') {
      const tr = sub(headHat, dp); const hl = Math.hypot(tr[0], tr[1]);
      if (hl > 0.3) { const ky = 1 - Math.exp(-SDT / 0.25); yaw = [yaw[0] + (tr[0] / hl - yaw[0]) * ky, yaw[1] + (tr[1] / hl - yaw[1]) * ky]; const yl = Math.hypot(yaw[0], yaw[1]) || 1; yaw = [yaw[0] / yl, yaw[1] / yl]; }
    }
    else yaw = [-R.s.heading[0], -R.s.heading[1]];

    // ---------------- reel supervisor
    const reelOn = !broken && !released;
    if (reelOn && dyn) {
      if (Fm >= (reelMode === 'protect' ? 3 : p.Fslip) - 1e-6 && Ld > 0.5) slipT += SDT; else slipT = Math.max(0, slipT - SDT);
      if (slipT > (p.snagMode === 1 ? 1.2 : 0.5) && !released) {
        released = true; broken = true;
        ev(t, 'release', 'warning', '卷轴持续打滑（疑似挂住）：背包电磁锁主动释放系留绳', 'Reel slipping continuously (snag suspected): pack latch actively releases the tether');
      }
    }

    // kinematic → dynamic tether once enough line is out (only at a sample boundary)
    if (!dyn && !broken && (mode === 'launch' || mode === 'follow')) {
      const at0 = attachOf(dp, yaw), dd = sub(at0, A0), dl = len(dd);
      if (dl > Ldyn + 0.03) {
        dyn = true; L = dl * 1.001;
        for (let j = 0; j < NN; j++) { const q = j / N; px[j] = A0[0] + dd[0] * q; py[j] = A0[1] + dd[1] * q; pz[j] = A0[2] + dd[2] * q; vx[j] = Av[0] + (dv[0] - Av[0]) * q; vy[j] = Av[1] + (dv[1] - Av[1]) * q; vz[j] = Av[2] + (dv[2] - Av[2]) * q; }
      }
    }
    // range rate anchor → drone attachment (drone telemetry + pack IMU), used by the reel
    const rrU = nrm(sub(attachOf(dp, yaw), A0)); const rr = dot(sub(dv, Av), rrU);
    // ---------------- integrate substeps
    let l0 = Math.max(1e-3, L / N);
    if (pinned >= 0) for (let j = 0; j < N; j++) l0 = Math.min(l0, l0a[j] || l0);
    const omega = Math.sqrt((2 * EA) / mu) / Math.max(0.05, l0);
    const ksub = dyn ? Math.max(4, Math.ceil(SDT / ((sc.subFactor || 0.75) / omega))) : 4;
    const h = SDT / ksub;
    const wA1 = wind(t + SDT, A1), wD1 = wind(t + SDT, dp);
    let T0acc = 0, T0max = 0, TNacc = 0, Fanc = [0, 0, 0];
    const dva = [0, 0, 0];
    const Ab = [0, 0, 0], wab = [0, 0, 0], wdb = [0, 0, 0], attb = [0, 0, 0], Ftdb = [0, 0, 0];
    const FtdAcc = [0, 0, 0];
    // sample i records the state at t (before integrating to t + SDT)
    const dp0 = [...dp], dv0 = [...dv], brokenAtStart = broken;
    for (let j = 0; j < NN; j++) { const o = (i * NN + j) * 3; nodesOut[o] = px[j]; nodesOut[o + 1] = py[j]; nodesOut[o + 2] = pz[j]; }
    snowHit = 0;
    for (let k = 0; k < ksub; k++) {
      const w = (k + 0.5) / ksub;
      const A = Ab, wa = wab, wd = wdb, att = attb, Ftd = Ftdb;
      for (let c = 0; c < 3; c++) {
        A[c] = A0[c] + (A1[c] - A0[c]) * w; wa[c] = wA[c] + (wA1[c] - wA[c]) * w; wd[c] = wD[c] + (wD1[c] - wD[c]) * w;
        FT[c] += (Fcmd[c] - FT[c]) * (h / tauT); // thrust/attitude lag
        Ftd[c] = 0;
      }
      { const ph = attPhiPrev + (attPhi - attPhiPrev) * w, rr = attRPrev + (attR - attRPrev) * w, av = attachVec(yaw, ph, rr), dph = (attPhi - attPhiPrev) / SDT, dr = (attR - attRPrev) / SDT;
        att[0] = dp[0] + av[0]; att[1] = dp[1] + av[1]; att[2] = dp[2] - 0.02;
        // eyelet velocity = drone velocity + trolley motion along the ring
        const c = Math.cos(ph), sn = Math.sin(ph);
        dva[0] = dv[0] + (yaw[1] * sn - yaw[0] * c) * rr * dph + (-yaw[1] * c - yaw[0] * sn) * dr; dva[1] = dv[1] + (-yaw[0] * sn - yaw[1] * c) * rr * dph + (yaw[0] * c - yaw[1] * sn) * dr; dva[2] = dv[2]; }
      if (mode === 'docked' || mode === 'spinup') {
        dp = dockCenter(A, yaw); dv = [...Av];
        L = 0.12; Ld = 0; T0 = 0; TN = 0;
        for (let j = 0; j < NN; j++) { px[j] = A[0]; py[j] = A[1]; pz[j] = A[2]; vx[j] = Av[0]; vy[j] = Av[1]; vz[j] = Av[2]; }
      } else if (!dyn) {
        // short-tether kinematic mode: straight taut link held at T_set by the reel
        const dd = sub(att, A), dl = len(dd), u = mul(dd, 1 / (dl || 1));
        const Tk = broken ? 0 : mode === 'land' ? (p.landT ?? 0.4) : (mode === 'launch' || mode === 'spinup' ? 0.4 : p.Tset); // near the dock: eases off (v1/v2) or winches the drone down (v3)
        Ftd[0] = -u[0] * Tk; Ftd[1] = -u[1] * Tk; Ftd[2] = -u[2] * Tk; T0 = Tk; TN = Tk; Fanc = mul(u, Tk);
        const Lnew = dl; Ld = (Lnew - L) / h; L = Lnew;
        for (let j = 0; j < NN; j++) { const q = j / N; px[j] = A[0] + dd[0] * q; py[j] = A[1] + dd[1] * q; pz[j] = A[2] + dd[2] * q; vx[j] = Av[0] + (dv[0] - Av[0]) * q; vy[j] = Av[1] + (dv[1] - Av[1]) * q; vz[j] = Av[2] + (dv[2] - Av[2]) * q; }
        void 0;
      } else {
        // ---- dynamic lumped-mass tether + reel (hot loop in tetherSub)
        S.Tset = p.windT ? Math.min(0.35 * Tmax, p.Tset + p.windT * Math.hypot(wEst[0], wEst[1])) : p.Tset; // wind-scheduled tension limits the line bow
        S.L = L; S.Ld = Ld; S.broken = broken ? 1 : 0; S.pinned = pinned; S.reelMode = reelMode === 'free' ? 2 : reelMode === 'protect' ? 1 : 0; S.rr = rr;
        tetherSub(S, h, A, Av, wa, wd, att, dva);
        L = S.L; Ld = S.Ld; T0 = S.T0; TN = S.TN; Fm = S.Fm;
        Fanc[0] = S.Fanc[0]; Fanc[1] = S.Fanc[1]; Fanc[2] = S.Fanc[2]; Ftd[0] = S.Ftd[0]; Ftd[1] = S.Ftd[1]; Ftd[2] = S.Ftd[2];
        if (S.snow) snowHit = 1;
        if (S.brokeNow) {
          broken = true; S.brokeNow = 0;
          ev(t + k * h, 'weaklink', 'warning', `弱连接在 ${S.T0.toFixed(1)} N 断开：系留绳与背包分离，无人机失去系留供电`, `Weak link broke at ${S.T0.toFixed(1)} N: tether separates from the pack; drone loses tether power`);
        }
        if (!broken && L <= Ldyn && Ld <= 0 && (mode === 'land' || mode === 'docked')) { dyn = false; L = Ldyn; Ld = 0; }
      }
      T0acc += T0; T0max = Math.max(T0max, T0); TNacc += TN;
      // ---- drone
      FtdAcc[0] += Ftd[0] / ksub; FtdAcc[1] += Ftd[1] / ksub; FtdAcc[2] += Ftd[2] / ksub;
      if (mode !== 'docked' && mode !== 'spinup') {
        if (landed) {
          dv = [0, 0, 0];
        } else {
          const ux0 = (dropped ? 0 : wd[0]) - dv[0], uy0 = (dropped ? 0 : wd[1]) - dv[1], uz0 = (dropped ? 0 : wd[2]) - dv[2];
          const kd = 0.5 * p.rho * p.CdA * Math.sqrt(ux0 * ux0 + uy0 * uy0 + uz0 * uz0);
          const th = dropped ? 0 : 1, hm = h / m;
          dv[0] += (th * FT[0] + kd * ux0 + Ftd[0]) * hm; dv[1] += (th * FT[1] + kd * uy0 + Ftd[1]) * hm; dv[2] += (th * FT[2] - m * G + kd * uz0 + Ftd[2]) * hm;
          dp[0] += dv[0] * h; dp[1] += dv[1] * h; dp[2] += dv[2] * h;
          // cradle support while launching / landing on the dome
          if (!hipDock && (mode === 'launch' || mode === 'land') && dp[2] < A[2] && Math.hypot(dp[0] - A[0], dp[1] - A[1]) < 0.2) { dp[2] = A[2]; dv[2] = Math.max(dv[2], Av[2]); }
          const hs = dp[2] - snowZ(dp[0]);
          if (hs < 0.06) {
            dp[2] = snowZ(dp[0]) + 0.06;
            if (dv[2] < -tanS * dv[0]) {
              const vimp = len(dv);
              if (mode === 'descend' || dropped || backup) {
                landed = true; rotor = 0;
                ev(t, dropped ? 'crash' : 'landed', dropped ? 'invalid' : 'info', `无人机落在雪面（触地速度 ${vimp.toFixed(1)} m/s）`, `Drone down on the snow (impact ${vimp.toFixed(1)} m/s)`);
              }
              dv = [dv[0] * 0.3, dv[1] * 0.3, -tanS * dv[0] * 0.3];
            }
          }
        }
      }
    }
    wA = wA1; wD = wD1;
    // measured tether force at the drone (load cell, 50 Hz)
    FtethMeas = mode === 'docked' || mode === 'spinup' ? [0, 0, 0] : [...FtdAcc];
    // tether anomaly (snag) at the drone: |F| > 4 N for 0.2 s → abort & hold
    if (mode === 'follow' && !abort && len(FtethMeas) > 4) { tethAnomT += SDT; if (tethAnomT > 0.2) { abort = true; abortT = t; lastRef = [...dp]; ev(t, 'abort', 'warning', '机端系留拉力异常>4 N：中止跟随、原地悬停', 'Tether force at the drone > 4 N: abort follow, hold position'); } } else if (!abort) tethAnomT = 0;
    // snag cutter at the drone (v2): cut the drone end after the detection delay, then unhook
    if (p.snagMode === 1 && pinned >= 0 && !S.cut && t - snagT >= p.cutDelay) {
      S.cut = 1; cutT = t;
      // escape away from the measured tether pull (it points at the snag), climb 1 m, then descend
      { const fh = Math.hypot(FtethMeas[0], FtethMeas[1]); const ux = fh > 0.05 ? FtethMeas[0] / fh : cUse[0], uy = fh > 0.05 ? FtethMeas[1] / fh : cUse[1];
        lastRef = [dp[0] - ux * 2.5, dp[1] - uy * 2.5, dp[2] + 1.0]; abort = true; holdUntil = t + 1.8; }
      backup = true; mode = 'descend'; modeT = t;
      ev(t, 'cut', 'warning', '机端切绳器剪断系留绳：无人机靠备用电池后撤并自主降落', 'Drone-end cutter fires: the drone backs away and lands on its backup cell');
    }
    if (S.cut && pinned >= 0 && segT[Math.max(0, pinned - 1)] > 1.5) {
      pinned = -1; S.pinned = -1;
      ev(t, 'unhooked', 'info', '自由端从树枝上滑脱：系留绳随滑雪者离开，卷轴收线', 'Free end slides off the branch: the line follows the rider and the reel retracts');
    }
    // weak-link / release → power lost
    if ((broken || released) && !backup && mode !== 'docked' && !S.cut) {
      if (!abort) lastRef = [...dp]; // brake and hold where the tether parted, then descend
      backup = true; mode = 'descend'; modeT = t; abort = true;
      ev(t, 'backup', 'warning', '无人机转备用电池：受控下降着陆', 'Drone on backup cell: controlled descent to land');
    }
    // descend under abort: go straight down at the hold point
    if (mode === 'descend' && abort && lastRef && t > holdUntil) lastRef = [lastRef[0], lastRef[1], Math.max(snowZ(lastRef[0]) - 0.3, lastRef[2] - 0.7 * SDT)];
    // backup energy
    const thrust = len(FT);
    const nT = thrust > 1e-6 ? mul(FT, 1 / thrust) : [0, 0, 1];
    const uAir = sub(wD, dv);
    const Prot = (mode === 'docked' || landed || dropped) ? 0 : rotorPower(thrust, nT, uAir, p) * Math.max(rotor, 0.2);
    const Pdrone = Prot + (mode === 'docked' ? 1.0 : 6.0);
    if (backup && !landed && !dropped) Eb -= Pdrone * SDT;
    // landing logic (touchdown on the dome)
    if (mode === 'land' && landPhase === 1) {
      const rel = hipDock ? sub(dp, dockCenter(A1, yaw)) : sub(dp, A1), hz = Math.hypot(rel[0], rel[1]);
      if (rel[2] < 0.04 && t > retryUntil) {
        if (hz < 0.10 && Math.abs(dv[2] - Av[2]) < 0.6) { // cone cradle captures ±10 cm (ASSUMED)
          touchErr = hz; touchV = len(sub(dv, Av)); touchT = t; mode = 'docked'; modeT = t; dyn = false;
          ev(t, 'docked', 'info', `落入罩盖并锁定（水平误差 ${(hz * 100).toFixed(1)} cm）`, `Docked and latched (horizontal error ${(hz * 100).toFixed(1)} cm)`);
        } else if (retries < 3) { retries++; landPhaseT = t - 1.0; retryUntil = t + 2.5; ev(t, 'redock', 'warning', `对准误差 ${(hz * 100).toFixed(0)} cm 过大：复飞重试`, `Misaligned by ${(hz * 100).toFixed(0)} cm: go-around and retry`); }
      }
    }
    // branch snag: the branch is a horizontal line along y at (x_b, z_b). A tether
    // segment hooks it when the branch point changes side of the segment in the
    // x–z plane (swept test) inside the segment span, or touches it (< 3 cm).
    if (plan.branch && pinned < 0 && dyn && !broken && !S.cut) { // after a cut the free end pulls through: no re-snag
      const B = plan.branch, bz = snowZ(B.x) + B.h, ylo = Math.min(B.y0, B.y1), yhi = Math.max(B.y0, B.y1);
      for (let j = 0; j < N; j++) {
        const ex = px[j + 1] - px[j], ez = pz[j + 1] - pz[j], l2 = ex * ex + ez * ez || 1e-9;
        const qx = B.x - px[j], qz = bz - pz[j];
        const u = (qx * ex + qz * ez) / l2, side = Math.sign(ex * qz - ez * qx);
        const dist2d = Math.abs(ex * qz - ez * qx) / Math.sqrt(l2);
        const yAt = py[j] + u * (py[j + 1] - py[j]);
        const inSpan = u >= 0 && u <= 1 && yAt > ylo && yAt < yhi;
        if (inSpan && ((prevSide[j] && side && prevSide[j] !== side && dist2d < 0.5) || dist2d < 0.03)) {
          pinned = clamp(u < 0.5 ? j : j + 1, 1, N - 1); snagT = t; S.nonUniform = 1;
          Lfix = 0; for (let q = pinned; q < N; q++) Lfix += l0a[q];
          S.Lfix = Lfix;
          // the hooked node is held where it is (≤ half a segment from the branch line)
          pinPos = [px[pinned], py[pinned], pz[pinned]]; S.pinX = pinPos[0]; S.pinY = pinPos[1]; S.pinZ = pinPos[2];
          ev(t, 'snag', 'warning', `系留绳挂在离地 ${B.h} m 的横伸树枝上（节点 ${pinned}）`, `Tether caught on a branch ${B.h} m above the snow (node ${pinned})`);
          break;
        }
        prevSide[j] = side;
      }
    }

    // ---------------- outputs (sample i at t)
    const tAvg = T0acc / ksub;
    const pw = tetherElectrical(Pdrone / 0.92, p.Vbus, L, p);
    const pw48 = tetherElectrical(Pdrone / 0.92, 48, L, p);
    const pw24 = tetherElectrical(Pdrone / 0.92, 24, L, p);
    const tethPow = mode !== 'docked' && !backup;
    O.ax[i] = A0[0]; O.ay[i] = A0[1]; O.az[i] = A0[2];
    O.dx[i] = dp0[0]; O.dy[i] = dp0[1]; O.dz[i] = dp0[2];
    O.dvx[i] = dv0[0]; O.dvy[i] = dv0[1]; O.dvz[i] = dv0[2];
    O.ux[i] = nT[0]; O.uy[i] = nT[1]; O.uz[i] = nT[2];
    O.yx[i] = yaw[0]; O.yy[i] = yaw[1];
    O.T0[i] = brokenAtStart ? 0 : tAvg; O.T0max[i] = brokenAtStart ? 0 : T0max; O.TN[i] = TNacc / ksub;
    O.Fx[i] = Fanc[0]; O.Fy[i] = Fanc[1]; O.Fz[i] = Fanc[2];
    O.L[i] = L; O.Ld[i] = Ld; O.Fm[i] = Fm;
    O.mode[i] = ['docked', 'spinup', 'launch', 'follow', 'land', 'descend'].indexOf(mode) + (landed ? 10 : 0) + (dropped ? 20 : 0);
    O.reelMode[i] = broken ? 3 : reelMode === 'protect' ? 1 : reelMode === 'free' ? 2 : 0;
    O.thrust[i] = thrust; O.tilt[i] = (Math.acos(clamp(nT[2], -1, 1)) * 180) / Math.PI; O.air[i] = len(uAir);
    O.Pdrone[i] = Pdrone; O.Ploss[i] = tethPow ? (pw.ok ? pw.loss : NaN) : 0;
    O.Ppack[i] = (tethPow ? Pdrone / 0.92 + (pw.ok ? pw.loss : 0) : 0) + Math.abs(Fm * Ld) / 0.6 + 1.5;
    O.Ploss48[i] = tethPow ? (pw48.ok ? pw48.loss : NaN) : 0; O.Pmax24[i] = pw24.Pmax;
    O.mext[i] = mastExt; O.aside[i] = Math.cos(attPhi); O.attR[i] = attR; O.aphi[i] = attPhi; O.cut[i] = S.cut; O.rotor[i] = rotor; O.dome[i] = dome; O.snow[i] = snowHit; O.Eb[i] = backup ? Math.max(0, Eb) / Ebackup0 : 1;
    O.cx[i] = cUse[0]; O.cy[i] = cUse[1];
    O.hx[i] = headHat[0]; O.hy[i] = headHat[1];
    O.rx[i] = ref ? ref[0] : NaN; O.ry[i] = ref ? ref[1] : NaN; O.rz[i] = ref ? ref[2] : NaN;
    Aprev = A1;
  }
  return { p, O, nodes: nodesOut, NN, n, SDT, events, rider, tanS, Phover, Ebackup0,
    dock: { touchErr, touchV, touchT, launchT, retries }, pinned: pinned >= 0, broken, released, landed, dropped };
}
