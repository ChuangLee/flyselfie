// boom360 physics (SIM-030, concept S1): backpack-frame rear boom made of two
// bistable composite tape springs (CTM) forming a V in the camera's stitch
// plane, a 360 camera at the tip, an elastomer damper + tape-spring fold
// ("natural fuse") at the root, motorised deploy/retract.
//
// Model (numerical, uncalibrated):
// - Boom = chain of NSEG rigid segments with 2-axis rotational springs (lumped
//   Euler–Bernoulli beam: k = EI/Δ, root = series(root mount, half segment)).
//   Large rotations are exact (serial-chain kinematics with Coriolis/centripetal
//   bias terms); bending at each joint is linear-elastic up to the tape-spring
//   fold moment (different for the two curvature senses), then a low residual
//   plateau with hysteretic recovery (Seffen & Pellegrino tape-spring law).
// - Base = rider's torso: translation, heading yaw (with counter-rotation),
//   inclination, crouch pitch, scripted fall rotation, plus deterministic snow
//   roughness (1–30 Hz) and mogul excitation applied as base acceleration.
// - Loads: gravity, cross-flow drag on tapes and camera at the relative
//   airspeed (with wind), snow contact (penalty + friction), branch snag.
// - Time integration: linearised θ-method (θ = 0.52: near-trapezoidal for the
//   resolved bending modes, dissipative for unresolved stiff joint modes), dt = 4 ms,
//   sub-stepped to 1 ms near the snow, while snagged or folded; joint and contact
//   stiffness are implicit, everything else explicit.
// Evidence: numerical-uncalibrated; every input marked ASSUMED is a placeholder.
import { makeWind, footage, subjectPoints } from '../common/env.js';
import { mulberry32 } from '../../model/util.js';

export const G = 9.81;
export const NSEG = 6;
export const DT = 0.004;
export const THETA = 0.52;
export const SDT = 0.02;
const RHO = 1.0;              // kg/m³ air at ~2000 m, cold (matches shared skier model)
export const STOW_LEN = 0.2;  // m of tape left out when stowed (camera docked on the pack lid)
export const CAM_OFF = 0.07;  // m, lens centre beyond the tip clamp along the boom axis
const PIVOT_TIME = 0.6;       // s, motorised root pivot stowed ↔ deployed (ASSUMED)
const I_BODY_YAW = 1.5;       // kg·m², whole-body yaw (brief: 1–2)
const I_BODY_ROLL = 12.5;     // kg·m², roll about the feet line (brief: 10–15)
const SKIER_CDA = 0.5;        // m² (shared skier model)
const NOMINAL_PITCH_DEG = ((0.18 + 0.42 * 0.4) * 180) / Math.PI; // torso forward pitch at crouch 0.4

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const softLim = (x, r) => r * Math.tanh(x / r); // smooth saturation (no rate discontinuity)
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- section & stiffness
// Thin-walled lenticular (CTM-like) section: semi-axes a (width, in the stitch
// plane) and b (half-thickness, across the stitch plane), wall t. Same formulas as
// research/concepts_2026_10_18/body/calc_boom.py thin_ellipse().
export function section(p) {
  const a = 0.025, b = p.tapeD / 2000, t = p.tapeT / 1000, E = p.Eeff * 1e9;
  const Iw = (Math.PI / 4) * t * b * b * (b + 3 * a);
  const Is = (Math.PI / 4) * t * a * a * (a + 3 * b);
  const per = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const A = per * t;
  return { a, b, t, E, EIw: E * Iw, EIs: E * Is, EA: E * A, A, mu: 2 * 1550 * A };
}

export function design(p) {
  const sec = section(p);
  const v2 = (p.design ?? 3) >= 2, v3 = (p.design ?? 3) >= 3;
  // elev = elevation above horizontal at the nominal torso pitch (crouch 0.4 → 20° forward);
  // in the torso frame the boom is set alpha above the 'back' direction
  const L = v3 ? p.L3 : p.L, alpha = ((v3 ? p.elev3 : p.elev) - NOMINAL_PITCH_DEG) * D2R;
  // camera + tip clamp/node (+ magnetic breakaway and stitch-trim micro-servo in v2; v3: lighter 360 module + tip IMU)
  const mTip = (v3 ? p.mCam3 + 0.01 : p.mCam) + 0.03 + (v2 ? 0.035 : 0);
  const nT = v2 ? (p.tapes ?? 3) : 2;
  const mTapes = (sec.mu / 2) * nT * L;
  // sagittal (in stitch plane): the in-plane tapes about their strong axis + V-truss
  // action (knocked down by eta for node/reel/shear-lag compliance)
  const EIsag = (x, l) => 2 * sec.EIs + (nT === 3 ? sec.EIw : 0) + p.etaTruss * 2 * sec.EA * Math.pow((p.spread / 2) * (1 - x / l), 2);
  // lateral (across the stitch plane): weak axes of the tapes; v2 adds a third tape offset
  // laterally (latSpread at the root, tapering to the tip) → triangular truss, I = 2/3·A·h²
  const hLat = (x, l) => (v2 && nT === 3 ? p.latSpread * (1 - x / l) : 0);
  const EIlat = (x = 0, l = L) => nT * sec.EIw + (nT === 3 ? p.etaTruss * (2 / 3) * sec.EA * hLat(x, l) ** 2 : 0);
  // v2 extras: 2-axis root stabiliser (2 geared gimbal motors + driver 0.24 kg, 21700 cell 0.07 kg)
  const mStab = v3 ? 0.37 : v2 ? 0.31 : 0; // v3: larger pitch/yaw motors (12 N·m) + tip IMU wiring
  return {
    p, sec, L, alpha, mTip, mTapes, v2, v3, nT, hLat, mStab,
    tMax: v3 ? p.stabTmax3 : p.stabTmax, zeta: v3 ? p.zeta3 : p.zeta,
    kRootSag: v2 ? p.kRoot2 : p.kRootSag, kRootLat: v2 ? p.kRoot2 : p.kRootLat,
    foldLat: v3 ? p.foldLat3 : v2 ? p.foldLat2 : p.foldLat,
    addedMass: p.mHw - (v2 ? 0.05 : 0) + mStab + mTapes + mTip, // v2 deploy motor shares the stabiliser cell
    EIsag, EIlat,
    stowAngle: Math.PI / 2 - alpha, // root rotation that puts the boom along the spine
    margin: (p.baseline - p.tapeD) / 2, // mm, stitch slab margin when perfectly aligned
  };
}

// ---------------------------------------------------------------- small linear algebra
function cholSolve(A, b, n) {
  // in-place Cholesky (lower) of SPD A (row-major n×n), solves A x = b into b
  for (let j = 0; j < n; j++) {
    let s = A[j * n + j];
    for (let k = 0; k < j; k++) s -= A[j * n + k] * A[j * n + k];
    const d = Math.sqrt(Math.max(s, 1e-14));
    A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let s2 = A[i * n + j];
      for (let k = 0; k < j; k++) s2 -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = s2 / d;
    }
  }
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= A[i * n + k] * b[k]; b[i] = s / A[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= A[k * n + i] * b[k]; b[i] = s / A[i * n + i]; }
}

// symmetric eigenvalues (Jacobi)
function jacobiEig(A, n) {
  const a = Float64Array.from(A);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i * n + j] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p * n + q];
      if (Math.abs(apq) < 1e-30) continue;
      const th = (a[q * n + q] - a[p * n + p]) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k * n + p], akq = a[k * n + q];
        a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p * n + k], aqk = a[q * n + k];
        a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk;
      }
    }
  }
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(a[i * n + i]);
  return ev.sort((x, y) => x - y);
}

// rotate v (3, at offset) about unit axis k by angle (Rodrigues), write to out
function rot(v, k, c, s, out, o) {
  const vx = v[o], vy = v[o + 1], vz = v[o + 2];
  const kd = k[0] * vx + k[1] * vy + k[2] * vz;
  const cx = k[1] * vz - k[2] * vy, cy = k[2] * vx - k[0] * vz, cz = k[0] * vy - k[1] * vx;
  out[o] = vx * c + cx * s + k[0] * kd * (1 - c);
  out[o + 1] = vy * c + cy * s + k[1] * kd * (1 - c);
  out[o + 2] = vz * c + cz * s + k[2] * kd * (1 - c);
}

// ---------------------------------------------------------------- the boom chain
// Generalised coordinates q[2j] (sagittal, + = tip towards e3 = up/forward over the
// head) and q[2j+1] (lateral, + = tip towards e2 = rider's right) at joint j.
export class Chain {
  constructor(d, N = NSEG) {
    this.d = d; this.N = N; this.n = 2 * N;
    const n = this.n;
    this.q = new Float64Array(n); this.v = new Float64Array(n); this.qrest = new Float64Array(n);
    this.k = new Float64Array(n); this.c = new Float64Array(n);
    this.mcp = new Float64Array(n); this.mcn = new Float64Array(n); this.fold = new Int8Array(n);
    this.m = new Float64Array(N + 1);
    // kinematics workspace
    this.o = new Float64Array(3 * N); this.as = new Float64Array(3 * N); this.al = new Float64Array(3 * N);
    this.Q = new Float64Array(9 * N); // segment frames (e1,e2,e3 columns stored as 3 consecutive vectors)
    this.p = new Float64Array(3 * (N + 1)); this.vel = new Float64Array(3 * (N + 1)); this.ab = new Float64Array(3 * (N + 1));
    this.acc = new Float64Array(3 * (N + 1));
    this.J = new Float64Array(3 * n * (N + 1));
    this.M = new Float64Array(n * n); this.A = new Float64Array(n * n); this.rhs = new Float64Array(n);
    this.F = new Float64Array(3 * (N + 1));
    this.Kc = []; // contact rows (J^T n) with stiffness/damping
    this.vrest = new Float64Array(2 * N); this.mPrev = new Float64Array(2 * N); this.mT = new Float64Array(2 * N); this.mRate = new Float64Array(2 * N);
    this.tipDetached = false;
    this.dv = new Float64Array(2 * N); this.qddScale = 0; this.tauRoot = [0, 0]; this.near = false;
    this.foldOn = true; this.latched = false;
    this.len = d.L;
    this.zeta = d.zeta;
    this.setLength(d.L);
  }

  setLength(l) {
    const { d, N } = this;
    this.len = l;
    const D = l / N;
    this.D = D;
    const mu = d.mTapes / d.L;
    for (let k = 1; k <= N; k++) this.m[k] = mu * D * (k === N ? 0.5 : 1);
    this.m[N] += this.tipDetached ? 0.02 : d.mTip;
    const p = d.p;
    const latch = this.latched ? 4 : 1;
    // root joint: mount/elastomer spring in series with half a segment of beam
    const kr0 = 1 / (1 / (d.kRootSag * latch) + D / (2 * d.EIsag(0, l)));
    const kl0 = 1 / (1 / (d.kRootLat * latch) + D / (2 * d.EIlat(0, l)));
    this.k[0] = kr0; this.k[1] = kl0;
    for (let j = 1; j < N; j++) { this.k[2 * j] = d.EIsag(j * D, l) / D; this.k[2 * j + 1] = d.EIlat(j * D, l) / D; }
    // inertia about the root (straight boom) for the damper sizing
    let I = 0;
    for (let k = 1; k <= N; k++) I += this.m[k] * (k * D) ** 2;
    this.Iroot = I;
    // structural damping of the laminate: stiffness-proportional, ζ_s ≈ 2 % at ~4 Hz
    const beta = (2 * 0.02) / (2 * Math.PI * 4);
    for (let i = 0; i < this.n; i++) this.c[i] = beta * this.k[i];
    // root elastomer/viscous damper, sized for ζ on the root mode (ASSUMED parameter)
    this.cRoot = [2 * this.zeta * Math.sqrt(kr0 * I), 2 * this.zeta * Math.sqrt(kl0 * I)];
    this.c[0] += this.cRoot[0]; this.c[1] += this.cRoot[1];
    this.beta = beta;
    // fold (tape-spring snap) moments: root = designed fuse; along the tapes ×2.5
    for (let j = 0; j < N; j++) {
      const f = j === 0 ? 1 : 2.5;
      this.mcp[2 * j] = p.foldPos * f; this.mcn[2 * j] = p.foldNeg * f;
      this.mcp[2 * j + 1] = this.mcn[2 * j + 1] = d.foldLat * f;
    }
  }

  // kinematics from base state: r, vr, ar (3), Q0 (9: e1,e2,e3), w, dw (3)
  kin(base) {
    const { N, q, v } = this;
    const Qin = this._Qin || (this._Qin = new Float64Array(9));
    const Qm = this._Qm || (this._Qm = new Float64Array(9));
    Qin.set(base.Q0);
    let wx = base.w[0], wy = base.w[1], wz = base.w[2];
    let ax = base.dw[0], ay = base.dw[1], az = base.dw[2];
    let ox = base.r[0], oy = base.r[1], oz = base.r[2];
    let vx = base.vr[0], vy = base.vr[1], vz = base.vr[2];
    let bx = base.ar[0], by = base.ar[1], bz = base.ar[2];
    const P = this.p, V = this.vel, AB = this.ab;
    P[0] = ox; P[1] = oy; P[2] = oz; V[0] = vx; V[1] = vy; V[2] = vz; AB[0] = bx; AB[1] = by; AB[2] = bz;
    const ks = this._ks || (this._ks = new Float64Array(3)), kl = this._kl || (this._kl = new Float64Array(3));
    for (let j = 0; j < N; j++) {
      const qs = q[2 * j], ql = q[2 * j + 1], ds = v[2 * j], dl = v[2 * j + 1];
      // sagittal axis = −e2 of the incoming frame
      ks[0] = -Qin[3]; ks[1] = -Qin[4]; ks[2] = -Qin[5];
      const cs = Math.cos(qs), ss = Math.sin(qs);
      for (let c = 0; c < 3; c++) rot(Qin, ks, cs, ss, Qm, 3 * c);
      kl[0] = Qm[6]; kl[1] = Qm[7]; kl[2] = Qm[8];
      const cl = Math.cos(ql), sl = Math.sin(ql);
      const Qo = this.Q; const oQ = 9 * j;
      for (let c = 0; c < 3; c++) { rot(Qm, kl, cl, sl, Qm, 3 * c); }
      for (let c = 0; c < 9; c++) Qo[oQ + c] = Qm[c];
      this.o[3 * j] = ox; this.o[3 * j + 1] = oy; this.o[3 * j + 2] = oz;
      this.as[3 * j] = ks[0]; this.as[3 * j + 1] = ks[1]; this.as[3 * j + 2] = ks[2];
      this.al[3 * j] = kl[0]; this.al[3 * j + 1] = kl[1]; this.al[3 * j + 2] = kl[2];
      // angular velocity / bias angular acceleration
      const usx = ks[0] * ds, usy = ks[1] * ds, usz = ks[2] * ds;
      const ulx = kl[0] * dl, uly = kl[1] * dl, ulz = kl[2] * dl;
      const w1x = wx + usx, w1y = wy + usy, w1z = wz + usz;
      const njx = w1x + ulx, njy = w1y + uly, njz = w1z + ulz;
      // α_j = α_in + ω_in × u_s + (ω_in + u_s) × u_l
      ax += (wy * usz - wz * usy) + (w1y * ulz - w1z * uly);
      ay += (wz * usx - wx * usz) + (w1z * ulx - w1x * ulz);
      az += (wx * usy - wy * usx) + (w1x * uly - w1y * ulx);
      wx = njx; wy = njy; wz = njz;
      const D = this.D;
      const rx = Qm[0] * D, ry = Qm[1] * D, rz = Qm[2] * D;
      // velocity and bias acceleration of the segment end
      const cwx = wy * rz - wz * ry, cwy = wz * rx - wx * rz, cwz = wx * ry - wy * rx;
      vx += cwx; vy += cwy; vz += cwz;
      bx += (ay * rz - az * ry) + (wy * cwz - wz * cwy);
      by += (az * rx - ax * rz) + (wz * cwx - wx * cwz);
      bz += (ax * ry - ay * rx) + (wx * cwy - wy * cwx);
      ox += rx; oy += ry; oz += rz;
      const k = 3 * (j + 1);
      P[k] = ox; P[k + 1] = oy; P[k + 2] = oz; V[k] = vx; V[k + 1] = vy; V[k + 2] = vz; AB[k] = bx; AB[k + 1] = by; AB[k + 2] = bz;
      Qin.set(Qm);
    }
    this.wTip = [wx, wy, wz];
    // Jacobians: node k (1..N), column i (joint j < k)
    const n = this.n, Jm = this.J;
    Jm.fill(0);
    for (let k = 1; k <= N; k++) {
      const px = P[3 * k], py = P[3 * k + 1], pz = P[3 * k + 2];
      for (let j = 0; j < k; j++) {
        const dx = px - this.o[3 * j], dy = py - this.o[3 * j + 1], dz = pz - this.o[3 * j + 2];
        for (let a = 0; a < 2; a++) {
          const ax2 = a === 0 ? this.as : this.al;
          const ux = ax2[3 * j], uy = ax2[3 * j + 1], uz = ax2[3 * j + 2];
          const base2 = (k * n + 2 * j + a) * 3;
          Jm[base2] = uy * dz - uz * dy; Jm[base2 + 1] = uz * dx - ux * dz; Jm[base2 + 2] = ux * dy - uy * dx;
        }
      }
    }
  }

  // joint moment law (spring + fold + stops): writes tau, tangent stiffness, damping into out[0..2]
  jointLaw(i, ev, t, out) {
    const k = this.k[i], th = this.q[i] - this.qrest[i];
    const kf = 0.003 * k, res = this.d.p.foldRes;
    let st = this.fold[i];
    if (st === 0 && this.foldOn) {
      // the tape is in series with the root elastomer/damper: it carries spring + damper moment
      const m = k * th + this.c[i] * (this.v[i] - this.vrest[i]);
      // v2 rate-sensitive lateral fuse: the critical moment drops by up to 30 % for impact-rate
      // loading (|dM/dt| ≥ 5000 N·m/s) and keeps its full value for slow loads (hockey stop, gust)
      let f = 1;
      if (i === 1 && this.d.v2) {
        const dt = t - this.mT[i];
        if (dt > 0) this.mRate[i] = (m - this.mPrev[i]) / dt;
        f = 1 - 0.3 * Math.min(1, Math.abs(this.mRate[i]) / 5000);
      }
      this.mPrev[i] = m; this.mT[i] = t;
      if (m > f * this.mcp[i]) { st = this.fold[i] = 1; ev && ev(t, i, 1, m); }
      else if (m < -f * this.mcn[i]) { st = this.fold[i] = -1; ev && ev(t, i, -1, m); }
    } else if (st !== 0) {
      const plateau = st > 0 ? res * this.mcp[i] + kf * th : -res * this.mcn[i] + kf * th;
      if ((st > 0 && k * th < plateau) || (st < 0 && k * th > plateau)) { st = this.fold[i] = 0; ev && ev(t, i, 0, k * th); }
    }
    let tau, kt, c;
    if (st === 0) { tau = k * th; kt = k; c = this.c[i]; }
    else { tau = (st > 0 ? res * this.mcp[i] : -res * this.mcn[i]) + kf * th; kt = kf; c = this.beta * k * 0.2; }
    // mechanical stops (root: boom against the pack / along the spine; elsewhere ±85°)
    const qa = this.q[i];
    let hi = 1.5, lo = -1.5;
    // root: the fold may carry the boom past the spine line (over the head when upright,
    // along the snow when lying on the pack) before the cushioned stop
    if (i === 0) { hi = this.d.stowAngle + 0.7; lo = -1.4; }
    if (i === 1) { hi = 1.45; lo = -1.45; }
    const ks = 3000;
    if (qa > hi) { tau += ks * (qa - hi); kt += ks; c += 30; }
    if (qa < lo) { tau += ks * (qa - lo); kt += ks; c += 30; }
    out[0] = tau; out[1] = kt; out[2] = c;
  }

  // external forces (gravity, cross-flow drag, snow contact) on the nodes
  forces(windV, tanS, Ft) {
    const N = this.N, d = this.d, ch = this;
    const Fx = this.F;
    Fx.fill(0);
    let dragX = 0, contactF = 0, near = false;
    this.Kc.length = 0;
    const kL = 0.5 * RHO * 1.2 * (2 * 2 * d.sec.a * 0.85), kS = 0.5 * RHO * 0.35 * (2 * 2 * d.sec.b * 0.8);
    const nn = Math.sqrt(1 + tanS * tanS), nx = tanS / nn, nz = 1 / nn;
    for (let k = 1; k <= N; k++) {
      const m = ch.m[k];
      Fx[3 * k + 2] -= m * G;
      const oQ = 9 * (k - 1);
      const vax = windV[0] - ch.vel[3 * k], vay = windV[1] - ch.vel[3 * k + 1], vaz = windV[2] - ch.vel[3 * k + 2];
      const e1x = ch.Q[oQ], e1y = ch.Q[oQ + 1], e1z = ch.Q[oQ + 2];
      const ax1 = vax * e1x + vay * e1y + vaz * e1z;
      const vnx = vax - ax1 * e1x, vny = vay - ax1 * e1y, vnz = vaz - ax1 * e1z;
      const vn = Math.sqrt(vnx * vnx + vny * vny + vnz * vnz);
      const ls = ch.D * (k === N ? 0.5 : 1);
      const e2x = ch.Q[oQ + 3], e2y = ch.Q[oQ + 4], e2z = ch.Q[oQ + 5], e3x = ch.Q[oQ + 6], e3y = ch.Q[oQ + 7], e3z = ch.Q[oQ + 8];
      // broad tape faces across the stitch plane (e2), thin edges in it (e3)
      const c2 = kL * ls * vn * (vnx * e2x + vny * e2y + vnz * e2z);
      const c3 = kS * ls * vn * (vnx * e3x + vny * e3y + vnz * e3z);
      let fx = c2 * e2x + c3 * e3x, fy = c2 * e2y + c3 * e3y, fz = c2 * e2z + c3 * e3z;
      if (k === N) { // camera body (bluff, CdA ≈ 0.0055 m²)
        const va = Math.sqrt(vax * vax + vay * vay + vaz * vaz), cc = 0.5 * RHO * 0.0055 * va;
        fx += cc * vax; fy += cc * vay; fz += cc * vaz;
      }
      Fx[3 * k] += fx; Fx[3 * k + 1] += fy; Fx[3 * k + 2] += fz;
      dragX += fx * Ft[0] + fy * Ft[1] + fz * Ft[2];
      // snow contact (planar piste, |y| < 22 m): penalty normal force + regularised friction
      const px = ch.p[3 * k], py = ch.p[3 * k + 1], pz = ch.p[3 * k + 2];
      const sd = (tanS * px + pz) / nn;
      if (sd < 0.06) near = true;
      if (sd < 0 && Math.abs(py) < 22) {
        const kc = 8000, cc = 40, mu = 0.15;
        const vnorm = ch.vel[3 * k] * nx + ch.vel[3 * k + 2] * nz;
        const fn = Math.max(0, -kc * sd - cc * vnorm);
        const vtx = ch.vel[3 * k] - vnorm * nx, vty = ch.vel[3 * k + 1], vtz = ch.vel[3 * k + 2] - vnorm * nz;
        const vt = Math.max(0.05, Math.sqrt(vtx * vtx + vty * vty + vtz * vtz));
        Fx[3 * k] += fn * nx - (mu * fn * vtx) / vt; Fx[3 * k + 1] += -(mu * fn * vty) / vt; Fx[3 * k + 2] += fn * nz - (mu * fn * vtz) / vt;
        contactF += fn;
        this.Kc.push([k, nx, 0, nz, kc, cc]);
      }
    }
    this.dragX = dragX; this.contactF = contactF; this.near = near;
  }

  // assemble M q̈ = Jᵀ(F − m a_bias) − τ(q) − C q̇ and advance one linearised trapezoidal step
  solve(DTc, foldEv, t) {
    const N = this.N, n = this.n, ch = this;
    const M = this.M, J = this.J, Fx = this.F, rhs = this.rhs;
    const tau = this._tau || (this._tau = new Float64Array(n)), Kt = this._Kt || (this._Kt = new Float64Array(n)), Ct = this._Ct || (this._Ct = new Float64Array(n));
    const jl = this._jl || (this._jl = new Float64Array(3)), dv = this.dv, gK = this._gK || (this._gK = new Float64Array(n));
    M.fill(0); rhs.fill(0);
    for (let k = 1; k <= N; k++) {
      const m = ch.m[k];
      const gx = Fx[3 * k] - m * ch.ab[3 * k], gy = Fx[3 * k + 1] - m * ch.ab[3 * k + 1], gz = Fx[3 * k + 2] - m * ch.ab[3 * k + 2];
      const cols = 2 * k;
      for (let i = 0; i < cols; i++) {
        const oi = (k * n + i) * 3;
        const jx = J[oi], jy = J[oi + 1], jz = J[oi + 2];
        rhs[i] += jx * gx + jy * gy + jz * gz;
        for (let c = 0; c <= i; c++) {
          const oc = (k * n + c) * 3;
          M[i * n + c] += m * (jx * J[oc] + jy * J[oc + 1] + jz * J[oc + 2]);
        }
      }
    }
    for (let i = 0; i < n; i++) for (let c = 0; c < i; c++) M[c * n + i] = M[i * n + c];
    for (let i = 0; i < n; i++) {
      this.jointLaw(i, foldEv, t, jl);
      tau[i] = jl[0]; Kt[i] = jl[1]; Ct[i] = jl[2];
      rhs[i] -= jl[0] + jl[2] * (ch.v[i] - ch.vrest[i]);
    }
    // θ-method (θ = 0.52): near-trapezoidal for the resolved modes, dissipative for unresolved
    // high-frequency joint modes whose velocity-squared bias terms are treated explicitly
    const th = THETA;
    const A = this.A;
    for (let i = 0; i < n * n; i++) A[i] = M[i];
    for (let i = 0; i < n; i++) {
      A[i * n + i] += th * DTc * Ct[i] + th * th * DTc * DTc * Kt[i];
      dv[i] = DTc * rhs[i] - th * DTc * DTc * Kt[i] * ch.v[i];
    }
    // contact / snag springs (implicit): k (Jᵀn)(Jᵀn)ᵀ
    for (let e = 0; e < this.Kc.length; e++) {
      const [k, nx, ny, nz, kc, cc] = this.Kc[e];
      const g = gK; g.fill(0);
      for (let i = 0; i < 2 * k; i++) { const oi = (k * n + i) * 3; g[i] = J[oi] * nx + J[oi + 1] * ny + J[oi + 2] * nz; }
      let gv = 0; for (let i = 0; i < n; i++) gv += g[i] * ch.v[i];
      const w = th * DTc * cc + th * th * DTc * DTc * kc;
      for (let i = 0; i < n; i++) {
        if (!g[i]) continue;
        dv[i] -= th * DTc * DTc * kc * g[i] * gv;
        for (let c = 0; c < n; c++) A[i * n + c] += w * g[i] * g[c];
      }
    }
    cholSolve(A, dv, n);
    // fuse check on the root moment the step actually transmits: if it exceeds the fold moment,
    // fold now and redo the step (avoids a one-step overshoot past the fuse)
    if (this.foldOn && !this._redo) {
      for (let a = 0; a < 2; a++) {
        if (this.fold[a] !== 0) continue;
        const qn = ch.q[a] + 0.5 * DTc * (ch.v[a] + th * dv[a]), vn = ch.v[a] + 0.5 * dv[a]; // mid-step, as tauRoot
        const m = this.k[a] * (qn - this.qrest[a]) + this.c[a] * (vn - this.vrest[a]);
        const f = a === 1 && this.d.v2 ? 1 - 0.3 * Math.min(1, Math.abs(this.mRate[a]) / 5000) : 1;
        const sgn = m > f * this.mcp[a] ? 1 : m < -f * this.mcn[a] ? -1 : 0;
        if (sgn) {
          this.fold[a] = sgn; foldEv && foldEv(t, a, sgn, m);
          this._redo = true; this.solve(DTc, foldEv, t); this._redo = false;
          return;
        }
      }
    }
    const dq = this._dq || (this._dq = new Float64Array(n));
    for (let i = 0; i < n; i++) { const v0 = ch.v[i]; ch.v[i] = v0 + dv[i]; dq[i] = DTc * (v0 + th * dv[i]); ch.q[i] += dq[i]; }
    this.qddScale = 1 / DTc;
    // forces consistent with the implicit step (for the root loads): contact/snag springs at mid-step,
    // joint moments at mid-step
    for (let e = 0; e < this.Kc.length; e++) {
      const [k, nx, ny, nz, kc, cc] = this.Kc[e];
      let gq = 0, gv = 0;
      for (let i = 0; i < 2 * k; i++) { const oi = (k * n + i) * 3, g = J[oi] * nx + J[oi + 1] * ny + J[oi + 2] * nz; gq += g * dq[i]; gv += g * dv[i]; }
      const df = -th * kc * gq - th * cc * gv;
      Fx[3 * k] += df * nx; Fx[3 * k + 1] += df * ny; Fx[3 * k + 2] += df * nz;
    }
    this.tauRoot = [tau[0] + th * Kt[0] * dq[0] + Ct[0] * (ch.v[0] - (1 - th) * dv[0] - ch.vrest[0]), tau[1] + th * Kt[1] * dq[1] + Ct[1] * (ch.v[1] - (1 - th) * dv[1] - ch.vrest[1])];
  }

  // root reaction on the body (force, moment about the root) and boom kinetic energy
  loads(base, mHw, useJoint) {
    const N = this.N, n = this.n, ch = this, J = this.J, Fx = this.F, dv = this.dv, s = this.qddScale;
    let Fbx = 0, Fby = 0, Fbz = 0, Mx = 0, My = 0, Mz = 0, ke = 0;
    for (let k = 1; k <= N; k++) {
      const m = ch.m[k];
      let ax = ch.ab[3 * k], ay = ch.ab[3 * k + 1], az = ch.ab[3 * k + 2];
      for (let i = 0; i < 2 * k; i++) { const oi = (k * n + i) * 3, qdd = dv[i] * s; ax += J[oi] * qdd; ay += J[oi + 1] * qdd; az += J[oi + 2] * qdd; }
      const gx = Fx[3 * k] - m * ax, gy = Fx[3 * k + 1] - m * ay, gz = Fx[3 * k + 2] - m * az;
      Fbx += gx; Fby += gy; Fbz += gz;
      const rx = ch.p[3 * k] - base.r[0], ry = ch.p[3 * k + 1] - base.r[1], rz = ch.p[3 * k + 2] - base.r[2];
      Mx += ry * gz - rz * gy; My += rz * gx - rx * gz; Mz += rx * gy - ry * gx;
      const vx = ch.vel[3 * k], vy = ch.vel[3 * k + 1], vz = ch.vel[3 * k + 2];
      ke += 0.5 * m * (vx * vx + vy * vy + vz * vz);
    }
    // the root joint transmits exactly its joint moments about the two bending axes; the
    // Newton–Euler sum supplies the torsion component (about the first segment axis)
    if (useJoint) {
      const e1x = this.Q[0], e1y = this.Q[1], e1z = this.Q[2];
      const mt = Mx * e1x + My * e1y + Mz * e1z;
      const as = this.as, al = this.al, tr = this.tauRoot;
      Mx = mt * e1x + tr[0] * as[0] + tr[1] * al[0];
      My = mt * e1y + tr[0] * as[1] + tr[1] * al[1];
      Mz = mt * e1z + tr[0] * as[2] + tr[1] * al[2];
    }
    const Fhx = Fbx - mHw * base.ar[0], Fhy = Fby - mHw * base.ar[1], Fhz = Fbz - mHw * (G + base.ar[2]);
    const L = this.ld || (this.ld = {});
    L.Mx = Mx; L.My = My; L.Mz = Mz; L.ke = ke;
    L.Mmag = Math.sqrt(Mx * Mx + My * My + Mz * Mz); L.Fboom = Math.sqrt(Fbx * Fbx + Fby * Fby + Fbz * Fbz);
    L.Fbody = Math.sqrt(Fhx * Fhx + Fhy * Fhy + Fhz * Fhz);
    L.Fx = Fhx; L.Fy = Fhy; L.Fz = Fhz;
  }
}

// ---------------------------------------------------------------- modal analysis
// First bending modes of the straight deployed boom (no gravity), sagittal and lateral.
export function modes(d, N = NSEG, l = d.L) {
  const ch = new Chain(d, N);
  ch.setLength(l);
  const base = { r: [0, 0, 0], vr: [0, 0, 0], ar: [0, 0, 0], Q0: [1, 0, 0, 0, 1, 0, 0, 0, 1], w: [0, 0, 0], dw: [0, 0, 0] };
  ch.kin(base);
  const n = ch.n, out = {};
  for (const [name, a] of [['sag', 0], ['lat', 1]]) {
    const idx = []; for (let j = 0; j < N; j++) idx.push(2 * j + a);
    const m = idx.length;
    const M = new Float64Array(m * m), K = new Float64Array(m * m);
    for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) {
      let s = 0;
      for (let k = 1; k <= N; k++) for (let x = 0; x < 3; x++) s += ch.m[k] * ch.J[(k * n + idx[r]) * 3 + x] * ch.J[(k * n + idx[c]) * 3 + x];
      M[r * m + c] = s;
    }
    for (let r = 0; r < m; r++) K[r * m + r] = ch.k[idx[r]];
    // M = L Lᵀ → A = L⁻¹ K L⁻ᵀ
    const Lc = Float64Array.from(M);
    for (let j = 0; j < m; j++) {
      let s = Lc[j * m + j]; for (let k = 0; k < j; k++) s -= Lc[j * m + k] ** 2;
      Lc[j * m + j] = Math.sqrt(s);
      for (let i = j + 1; i < m; i++) { let s2 = Lc[i * m + j]; for (let k = 0; k < j; k++) s2 -= Lc[i * m + k] * Lc[j * m + k]; Lc[i * m + j] = s2 / Lc[j * m + j]; }
      for (let i = 0; i < j; i++) Lc[i * m + j] = 0;
    }
    const inv = new Float64Array(m * m); // L⁻¹
    for (let c = 0; c < m; c++) {
      for (let i = 0; i < m; i++) { let s = i === c ? 1 : 0; for (let k = 0; k < i; k++) s -= Lc[i * m + k] * inv[k * m + c]; inv[i * m + c] = s / Lc[i * m + i]; }
    }
    const T = new Float64Array(m * m), A = new Float64Array(m * m);
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < m; k++) s += inv[i * m + k] * K[k * m + j]; T[i * m + j] = s; }
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < m; k++) s += T[i * m + k] * inv[j * m + k]; A[i * m + j] = s; }
    const ev = jacobiEig(A, m);
    out[name] = ev.slice(0, 2).map((e) => Math.sqrt(Math.max(e, 0)) / (2 * Math.PI));
  }
  return out;
}

// ---------------------------------------------------------------- base (torso) kinematics
// Torso frame: F (forward, pitched), L (left), U (spine up). Heading yaw is scaled by the
// counter-rotation factor, inclination by the angulation factor (upper body leans less
// than the legs), crouch pitch as in the renderer rig. Fall = rotation about the feet.
export function torsoPose(s, t, p, sc, fallAxis, flt) {
  const hx = s.heading[0], hy = s.heading[1];
  const hd = flt ? flt.hd : Math.atan2(hy, hx);
  // counter-rotation: the torso follows the travel direction by torsoYaw and the ski skid
  // (hockey stop) by only 0.3 (ASSUMED)
  const skid = flt ? flt.skid : 0;
  const shared = flt && flt.tr && flt.tr.shared;
  // shared calibrated trunk model: trunk yaw = travel heading + counter-rotation (tr.yaw)
  const yaw = shared ? (hd - skid) + flt.tr.yaw + 0.3 * skid : p.torsoYaw * (hd - skid) + 0.3 * skid + (flt && flt.tr ? flt.tr.yaw || 0 : 0);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const F0 = [cy, sy, 0], L0 = [-sy, cy, 0];
  // upper-body inclination = angul × turn lean (angulation), plus optional external trunk model
  const phi = shared ? (flt.lean - flt.tr.roll) : (p.angul ?? 0.5) * (flt ? flt.lean : s.lean || 0) + (flt && flt.tr ? flt.tr.roll || 0 : 0);
  const cph = Math.cos(phi), sph = Math.sin(phi);
  const U1 = [L0[0] * sph, L0[1] * sph, cph];
  const L1 = [L0[0] * cph, L0[1] * cph, -sph];
  const crouch = flt ? flt.crouch : s.crouch ?? 0.3;
  let pitch = 0.18 + 0.42 * crouch + (flt && flt.tr ? flt.tr.pitch || 0 : 0);
  if (sc.moguls && !shared) {
    const [m0, m1] = sc.moguls.span;
    const env = smooth((t - m0) / 0.6) * (1 - smooth((t - m1 + 0.6) / 0.6));
    pitch += env * ((sc.moguls.pitchDeg ?? 4) * D2R) * Math.sin(sc._mogPhase ? sc._mogPhase(t) - 0.8 : 0); // ±4° (ASSUMED) absorption pitch, lagging the bumps
  }
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const U = [U1[0] * cp + F0[0] * sp, U1[1] * cp + F0[1] * sp, U1[2] * cp + F0[2] * sp];
  const F = [F0[0] * cp - U1[0] * sp, F0[1] * cp - U1[1] * sp, F0[2] * cp - U1[2] * sp];
  const c = crouch;
  const hipH = 0.95 - 0.22 * c;
  const feet = s.pos;
  // legs incline by the full turn lean (as in the shared bodyPoints); the torso above the
  // pelvis keeps half of it (angulation)
  const lf = flt ? flt.lean : s.lean || 0;
  const Uf = [L0[0] * Math.sin(lf), L0[1] * Math.sin(lf), Math.cos(lf)];
  const pelvis = [feet[0] + Uf[0] * hipH - F0[0] * (0.06 + 0.1 * c), feet[1] + Uf[1] * hipH - F0[1] * (0.06 + 0.1 * c), feet[2] + Uf[2] * hipH];
  const root = [pelvis[0] + U[0] * 0.5 - F[0] * 0.26, pelvis[1] + U[1] * 0.5 - F[1] * 0.26, pelvis[2] + U[2] * 0.5 - F[2] * 0.26];
  let beta = 0;
  if (sc.fall && t >= sc.fall.t0 && fallAxis) {
    beta = sc.fall.profile(t - sc.fall.t0);
    if (sc.fall.getUp != null) beta *= 1 - smooth((t - sc.fall.getUp) / 1.8);
  }
  const out = { F, L: L1, U, pelvis, root, feet, beta, yaw, hd, F0, L0 };
  if (beta > 1e-6) {
    const k = fallAxis, c2 = Math.cos(beta), s2 = Math.sin(beta);
    const R = (v, isPt) => {
      const w = new Float64Array(3);
      const src = isPt ? [v[0] - feet[0], v[1] - feet[1], v[2] - feet[2]] : v;
      rot(src, k, c2, s2, w, 0);
      return isPt ? [w[0] + feet[0], w[1] + feet[1], w[2] + feet[2]] : [w[0], w[1], w[2]];
    };
    out.F = R(F); out.L = R(L1); out.U = R(U); out.pelvis = R(pelvis, true); out.root = R(root, true);
  }
  return out;
}

// Fall rotation β(t): inverted pendulum about the feet (l = 0.9 m) from a 0.6 rad/s
// perturbation, then the pack/back lands and stops within 0.15 s (ASSUMED).
function fallProfile(betaMax) {
  const h = 0.001, l = 0.9, tStop = 0.15;
  const out = [0];
  let b = 0, w = 0.6, landing = false, wl = 0, k = 0;
  while (out.length < 2500) {
    if (!landing) {
      w += h * (G / l) * Math.sin(b + 0.05);
      b += h * w;
      if (b >= betaMax - (w * tStop) / 2) { landing = true; wl = w; k = 0; }
    } else {
      k++;
      w = Math.max(0, wl * (1 - (k * h) / tStop));
      b += h * w;
    }
    out.push(b);
  }
  return (t) => { const f = t / h; if (f >= out.length - 1) return out[out.length - 1]; const i = Math.floor(f), x = f - i; return out[i] * (1 - x) + out[i + 1] * x; };
}

export function fallSetup(sc, skFn, tanS) {
  if (!sc.fall) return null;
  const res = fallSetupAxis(sc, skFn, tanS);
  sc.fall.profile = fallProfile(sc.fall.betaMax);
  return res;
}
function fallSetupAxis(sc, skFn, tanS) {
  const s = skFn(sc.fall.t0);
  const hx = s.heading[0], hy = s.heading[1];
  const S = Math.atan(tanS);
  if (sc.fall.dir === 'side') {
    // roll about the heading axis towards side (+1 = left): rotation about +F by −β·side… sign so that up tilts to that side
    const sgn = sc.fall.side || 1;
    const axis = [hx * -sgn, hy * -sgn, 0];
    const surf = S * hy * sgn; // the slope rises towards the rider's left when hy > 0
    sc.fall.betaMax = sc.fall.betaMax ?? (Math.PI / 2 - surf - 0.2);
    return axis;
  }
  // backward: rotate about +left by −β (up tilts backwards)
  const axis = [hy, -hx, 0]; // = −left
  const rise = S * hx; // slope rises behind when travelling downhill
  sc.fall.betaMax = sc.fall.betaMax ?? (Math.PI / 2 - rise - 0.2);
  return axis;
}

// deterministic snow roughness (hip-level base acceleration, 1–30 Hz)
export function makeRough(rms, seed = 11) {
  const rng = mulberry32(seed);
  const comps = [];
  const nf = 36;
  for (const axis of [0, 1]) {
    const list = [];
    let pw = 0;
    for (let i = 0; i < nf; i++) {
      const f = Math.exp(Math.log(1) + (i / (nf - 1)) * Math.log(30));
      const df = f * (Math.log(30) / (nf - 1));
      // road-like profile (S_z ∝ Ω⁻²) seen as acceleration ∝ f², attenuated by legs/skis above ~6 Hz (ASSUMED shape)
      const S = (f * f) / (1 + Math.pow(f / 6, 4));
      const a = Math.sqrt(S * df);
      list.push([2 * Math.PI * f, a, rng() * 2 * Math.PI]);
      pw += a * a / 2;
    }
    const sc = (rms * (axis === 0 ? 1 : 0.4)) / Math.sqrt(pw);
    for (const c of list) c[1] *= sc;
    comps.push(list);
  }
  const nfc = comps[0].length;
  const W = new Float64Array(2 * nfc), Aa = new Float64Array(2 * nfc), P = new Float64Array(2 * nfc);
  for (let a = 0; a < 2; a++) for (let i = 0; i < nfc; i++) { W[a * nfc + i] = comps[a][i][0]; Aa[a * nfc + i] = comps[a][i][1]; P[a * nfc + i] = comps[a][i][2]; }
  return (t, out) => {
    let v = 0, l = 0;
    for (let i = 0; i < nfc; i++) v += Aa[i] * Math.sin(W[i] * t + P[i]);
    for (let i = nfc; i < 2 * nfc; i++) l += Aa[i] * Math.sin(W[i] * t + P[i]);
    out[0] = v; out[1] = l;
  };
}

// ---------------------------------------------------------------- simulation
// cfg: { skFn, tanS, duration, wind:{...}|null, rough (m/s² rms at 12 m/s), moguls:{span:[t0,t1], A, lambda},
//        fall:{t0, dir, side, getUp}, snag:{t, k, slip, maxStretch}, commands:[{t, cmd}], startDeployed,
//        liftAt, foldOn, zeta }
export function runBoom(p, cfg) {
  const d = design(p);
  const dur = cfg.duration;
  const tanS = cfg.tanS;
  const ns = Math.floor(dur / SDT + 1e-9) + 1;
  const sc = cfg;
  // mogul phase (bump spacing varies ±15 %)
  if (sc.moguls) {
    const rng = mulberry32(5);
    const ph = new Float64Array(ns + 2);
    let phase = 0, lam = sc.moguls.lambda;
    for (let i = 0; i < ns + 2; i++) {
      ph[i] = phase;
      const v = cfg.skFn(i * SDT).speed;
      const before = Math.floor(phase / (2 * Math.PI));
      phase += (2 * Math.PI * v * SDT) / lam;
      if (Math.floor(phase / (2 * Math.PI)) !== before) lam = sc.moguls.lambda * (0.85 + 0.3 * rng());
    }
    sc._mogPhase = (t) => { const f = clamp(t / SDT, 0, ns); const i = Math.floor(f), w = f - i; return ph[i] * (1 - w) + ph[Math.min(ns + 1, i + 1)] * w; };
  }
  const fallAxis = fallSetup(sc, cfg.skFn, tanS);
  // ---- tabulate torso pose on the sample grid, then differentiate
  const nb = ns + 2;
  const R = new Float64Array(3 * nb), FR = new Float64Array(9 * nb), PEL = new Float64Array(3 * nb), FEET = new Float64Array(3 * nb);
  const BETA = new Float64Array(nb), SPD = new Float64Array(nb), TILT = new Float64Array(nb), YAW = new Float64Array(nb);
  const samples = [], sks = [];
  for (let i = 0; i < nb; i++) {
    const t = i * SDT;
    let s = cfg.skFn(Math.min(t, dur));
    if (t > dur) { const e = t - dur; s = { ...s, pos: [s.pos[0] + s.vel[0] * e, s.pos[1] + s.vel[1] * e, s.pos[2] + s.vel[2] * e] }; }
    if (i < ns) samples.push(s);
    sks.push(s);
  }
  // the upper body cannot follow kinks of the track model: torso yaw passes a critically damped
  // 2nd-order low-pass (fn 2.5 Hz, ASSUMED neuromuscular bandwidth)
  const flt = { hd: new Float64Array(nb), lean: new Float64Array(nb), crouch: new Float64Array(nb), skid: new Float64Array(nb) };
  {
    const wn = 2 * Math.PI * (p.trunkBw ?? 2.5);
    let prevHd = Math.atan2(sks[0].heading[1], sks[0].heading[0]), unw = prevHd;
    const sk0 = (s) => { let d = Math.atan2(s.heading[1], s.heading[0]) - (s.psi ?? Math.atan2(s.heading[1], s.heading[0])); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const st = { hd: [unw, 0], lean: [sks[0].lean || 0, 0], crouch: [sks[0].crouch ?? 0.3, 0], skid: [sk0(sks[0]), 0] };
    for (let i = 0; i < nb; i++) {
      const s = sks[i];
      const h = Math.atan2(s.heading[1], s.heading[0]);
      let dh = h - prevHd; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      unw += dh; prevHd = h;
      const tgt = { hd: unw, lean: s.lean || 0, crouch: s.crouch ?? 0.3, skid: sk0(s) };
      for (const k of ['hd', 'lean', 'crouch', 'skid']) {
        const x = st[k];
        for (let sub = 0; sub < 4; sub++) { // 5 ms substeps, semi-implicit
          const h2 = SDT / 4;
          x[1] += h2 * (wn * wn * (tgt[k] - x[0]) - 2 * wn * x[1]);
          x[0] += h2 * x[1];
        }
        // the shared skier model already smooths lean (τ 0.12 s) and crouch (τ 0.3 s): use them as is,
        // so the pelvis/torso stay consistent with the subject silhouette; only heading/skid are filtered
        flt[k][i] = k === 'lean' || k === 'crouch' ? tgt[k] : x[0];
      }
    }
  }
  for (let i = 0; i < nb; i++) {
    const t = i * SDT;
    const s = sks[i];
    // external trunk-motion model (e.g. a calibrated shared trunkAt): deviations {pitch, roll, yaw} (rad)
    const tr = cfg.trunk ? cfg.trunk(t, s) : null;
    const tp = torsoPose(s, t, p, sc, fallAxis, { hd: flt.hd[i], lean: flt.lean[i], crouch: flt.crouch[i], skid: flt.skid[i], tr });
    R.set(tp.root, 3 * i); PEL.set(tp.pelvis, 3 * i); FEET.set(tp.feet, 3 * i);
    FR.set(tp.F, 9 * i); FR.set(tp.L, 9 * i + 3); FR.set(tp.U, 9 * i + 6);
    BETA[i] = tp.beta; SPD[i] = s.speed; YAW[i] = tp.yaw;
    // IMU fall indicator: backward lean of the spine, or side lean beyond the turn range
    const uf = tp.U[0] * tp.F0[0] + tp.U[1] * tp.F0[1], ul = tp.U[0] * tp.L0[0] + tp.U[1] * tp.L0[1];
    TILT[i] = Math.max(Math.asin(clamp(-uf, -1, 1)), Math.asin(clamp(Math.abs(ul), 0, 1)) - 0.35);
  }
  const VR = new Float64Array(3 * nb), AR = new Float64Array(3 * nb), W = new Float64Array(3 * nb), DW = new Float64Array(3 * nb);
  const im = (i) => Math.max(0, Math.min(nb - 1, i));
  for (let i = 0; i < nb; i++) {
    const a = im(i - 1), b = im(i + 1), h = (b - a) * SDT;
    for (let c = 0; c < 3; c++) {
      VR[3 * i + c] = (R[3 * b + c] - R[3 * a + c]) / h;
      AR[3 * i + c] = (b - a === 2) ? (R[3 * b + c] - 2 * R[3 * i + c] + R[3 * a + c]) / (SDT * SDT) : 0;
    }
    // ω = ½ Σ col × d(col)/dt
    let wx = 0, wy = 0, wz = 0;
    for (let c = 0; c < 3; c++) {
      const o = 9 * i + 3 * c;
      const dx = (FR[9 * b + 3 * c] - FR[9 * a + 3 * c]) / h, dy = (FR[9 * b + 3 * c + 1] - FR[9 * a + 3 * c + 1]) / h, dz = (FR[9 * b + 3 * c + 2] - FR[9 * a + 3 * c + 2]) / h;
      const x = FR[o], y = FR[o + 1], z = FR[o + 2];
      wx += 0.5 * (y * dz - z * dy); wy += 0.5 * (z * dx - x * dz); wz += 0.5 * (x * dy - y * dx);
    }
    W[3 * i] = wx; W[3 * i + 1] = wy; W[3 * i + 2] = wz;
  }
  for (let c = 0; c < 3; c++) { AR[c] = AR[3 + c]; AR[3 * (nb - 1) + c] = AR[3 * (nb - 2) + c]; }
  for (let i = 0; i < nb; i++) {
    const a = im(i - 1), b = im(i + 1), h = (b - a) * SDT;
    for (let c = 0; c < 3; c++) DW[3 * i + c] = (W[3 * b + c] - W[3 * a + c]) / h;
  }
  const rough = cfg.rough > 0 ? makeRough(cfg.rough, 11) : null;
  const wind = cfg.wind ? makeWind(cfg.wind) : null;

  // ---- chain
  const ch = new Chain(d);
  if (cfg.zeta != null) { ch.zeta = cfg.zeta; }
  ch.foldOn = cfg.foldOn !== false;
  const N = ch.N, n = ch.n;
  // deploy state machine
  let state = cfg.startDeployed === false ? 'stowed' : 'deployed';
  let len = state === 'deployed' ? d.L : STOW_LEN;
  let pivot = state === 'deployed' ? 0 : d.stowAngle; // root rest rotation
  let stateT = 0;
  ch.latched = state === 'stowed';
  ch.setLength(len);
  ch.qrest[0] = pivot;
  ch.q[0] = pivot;
  const cmds = (cfg.commands || []).slice().sort((a, b) => a.t - b.t);
  let ci = 0;
  const events = [];
  const ev = (t, type, severity, zh, en) => events.push({ t: +t.toFixed(3), type, severity, zh, en });
  const jointName = (i) => (i >> 1 === 0 ? { zh: '根部', en: 'root' } : { zh: `第${i >> 1}节`, en: `joint ${i >> 1}` });
  const axisName = (i, s) => (i & 1 ? { zh: s > 0 ? '向右' : '向左', en: s > 0 ? 'rightward' : 'leftward' } : { zh: s > 0 ? '向上（朝头部）' : '向下', en: s > 0 ? 'upward (towards the head)' : 'downward' });
  let foldCount = 0;
  const foldEv = (t, i, st, m) => {
    const jn = jointName(i);
    if (st !== 0) {
      foldCount++;
      const an = axisName(i, st);
      ev(t, 'fold', 'warning', `卷带折叠（保险触发）：${jn.zh}${an.zh}，弯矩 ${Math.abs(m).toFixed(1)} N·m`, `Tape fold (fuse): ${jn.en} ${an.en}, moment ${Math.abs(m).toFixed(1)} N·m`);
    } else ev(t, 'unfold', 'info', `卷带折叠恢复：${jn.zh}`, `Tape fold recovered: ${jn.en}`);
  };

  // ---- output buffers
  const NODES = 3 * (N + 1);
  const out = {
    d, ns, events, samples, tanS,
    nodesB: new Float32Array(ns * NODES), camB: new Float32Array(ns * 9),
    tip: new Float64Array(3 * ns), camW: new Float64Array(9 * ns), wCam: new Float64Array(3 * ns), wCamHP: new Float64Array(3 * ns),
    rootW: new Float64Array(3 * ns), frame: new Float64Array(9 * ns), pelvis: new Float64Array(3 * ns), feet: new Float64Array(3 * ns),
    len: new Float64Array(ns), stateCode: new Float64Array(ns), foldS: new Float64Array(ns), foldL: new Float64Array(ns),
    defSag: new Float64Array(ns), defLat: new Float64Array(ns), relTip: new Float64Array(3 * ns),
    M: new Float64Array(3 * ns), Mmag: new Float64Array(ns), Fboom: new Float64Array(ns), Fbody: new Float64Array(ns),
    ke: new Float64Array(ns), drag: new Float64Array(ns), stickPx: new Float64Array(ns), stickMm: new Float64Array(ns),
    beta: new Float64Array(ns), tilt: new Float64Array(ns), speed: new Float64Array(ns), yawBodyAcc: new Float64Array(ns),
    contactF: new Float64Array(ns), snagF: new Float64Array(ns), fallAxis, led: new Float64Array(ns),
    clear: new Float64Array(ns), azNow: new Float64Array(ns), keRider: new Float64Array(ns), keCam: new Float64Array(ns), reach: new Float64Array(ns),
    camOff: new Uint8Array(ns), thM: new Float64Array(2 * ns), Fv: new Float64Array(3 * ns), motorTau: new Float64Array(ns), stickSubjPx: new Float64Array(ns),
  };
  const peaks = { Mmag: 0, Fboom: 0, Fbody: 0, ke: 0, Myaw: 0, contact: 0, jointMax: 0 };
  let validUntil = null;

  // ---- per-step scratch
  const base = { r: [0, 0, 0], vr: [0, 0, 0], ar: [0, 0, 0], Q0: new Float64Array(9), w: [0, 0, 0], dw: [0, 0, 0] };
  const Ft = [0, 0, 0], Lt = [0, 0, 0], Ut = [0, 0, 0];
  const rgh = [0, 0];
  const windV = [0, 0, 0]; let windT = -1, windA = null, windB = null;
  const DTc = cfg.dt || DT, EVERY = Math.round(SDT / DTc);
  const cAx = Math.cos(d.alpha), sAx = Math.sin(d.alpha);
  const hp = [0, 0, 0], hpPrev = [0, 0, 0]; // EIS high-pass state
  const stabOn = d.v2 && p.stab !== 0 && cfg.stab !== false;
  const nWand = [0, 0, 0], hpA = [0, 0, 0], hpB = [0, 0, 0], est = [0, 0, 0], elLP = [0, 0, 0], elRef = [0, 0, 0];
  let hpInit = false, azNow = 0, limpEv = false, stopFade = 1, frz = null, braking = false;
  const nrng = mulberry32(17); const noise = () => { let u = 0; for (let k = 0; k < 6; k++) u += nrng(); return (u - 3) * Math.SQRT2; };
  const gyro = [0, 0, 0], Phi = [0, 0, 0], Phi1 = [0, 0, 0], PhiLP = [0, 0, 0], thM = [0, 0], vM = [0, 0];
  let deployedAt = state === 'deployed' ? -1 : 1e9, tauStat = null, motor = { tPk: 0, eJ: 0, tDep: 0, slip: 0, tauLP: [0, 0] };
    let camOff = false, trimG = 0;
  let still = 0, holdStop = false, fallDetT = null, foldT = null, snag = null, snagDone = false, liftChecked = false;
  const rootFoldStart = { t: null };

  const setBase = (t) => {
    const f = clamp(t / SDT, 0, nb - 1.000001);
    const i = Math.floor(f), w = f - i;
    for (let c = 0; c < 3; c++) {
      base.r[c] = R[3 * i + c] * (1 - w) + R[3 * i + 3 + c] * w;
      base.vr[c] = VR[3 * i + c] * (1 - w) + VR[3 * i + 3 + c] * w;
      base.ar[c] = AR[3 * i + c] * (1 - w) + AR[3 * i + 3 + c] * w;
      base.w[c] = W[3 * i + c] * (1 - w) + W[3 * i + 3 + c] * w;
      base.dw[c] = DW[3 * i + c] * (1 - w) + DW[3 * i + 3 + c] * w;
      Ft[c] = FR[9 * i + c] * (1 - w) + FR[9 * i + 9 + c] * w;
      Lt[c] = FR[9 * i + 3 + c] * (1 - w) + FR[9 * i + 12 + c] * w;
      Ut[c] = FR[9 * i + 6 + c] * (1 - w) + FR[9 * i + 15 + c] * w;
    }
    // re-orthonormalise (Gram–Schmidt on F, U; L = U × F)
    let l = Math.sqrt(Ft[0] * Ft[0] + Ft[1] * Ft[1] + Ft[2] * Ft[2]); for (let c = 0; c < 3; c++) Ft[c] /= l;
    const du = Ut[0] * Ft[0] + Ut[1] * Ft[1] + Ut[2] * Ft[2];
    for (let c = 0; c < 3; c++) Ut[c] -= du * Ft[c];
    l = Math.sqrt(Ut[0] * Ut[0] + Ut[1] * Ut[1] + Ut[2] * Ut[2]); for (let c = 0; c < 3; c++) Ut[c] /= l;
    Lt[0] = Ut[1] * Ft[2] - Ut[2] * Ft[1]; Lt[1] = Ut[2] * Ft[0] - Ut[0] * Ft[2]; Lt[2] = Ut[0] * Ft[1] - Ut[1] * Ft[0];
    // rest boom frame: e1 = B cosα + U sinα, e2 = −L (right), e3 = e1 × e2 = U cosα − B sinα
    const Q0 = base.Q0;
    for (let c = 0; c < 3; c++) {
      const B = -Ft[c];
      Q0[c] = B * cAx + Ut[c] * sAx;
      Q0[3 + c] = -Lt[c];
      Q0[6 + c] = Ut[c] * cAx - B * sAx;
    }
    const spd = SPD[i] * (1 - w) + SPD[Math.min(nb - 1, i + 1)] * w;
    const fallen = (BETA[i] > 0.05);
    // snow roughness / chatter and moguls as base acceleration (torso up / left)
    if (cfg.trunkZ && !fallen) {
      const za = cfg.trunkZ(t);
      for (let c = 0; c < 3; c++) base.ar[c] += za * Ut[c];
    } else if (rough && !fallen) {
      rough(t, rgh);
      const sf = Math.pow(Math.min(1.6, spd / 12), 1.5);
      for (let c = 0; c < 3; c++) base.ar[c] += sf * (rgh[0] * Ut[c] + rgh[1] * Lt[c]);
    }
    if (sc.moguls && !fallen && !cfg.trunkZ) {
      const [m0, m1] = sc.moguls.span;
      const env = smooth((t - m0) / 0.6) * (1 - smooth((t - m1 + 0.6) / 0.6));
      if (env > 0) {
        const a = env * sc.moguls.A * Math.sin(sc._mogPhase(t));
        for (let c = 0; c < 3; c++) base.ar[c] += a * Ut[c];
      }
    }
    return spd;
  };

  const command = (t, cmd, why) => {
    if (cmd === 'deploy' && (state === 'stowed' || state === 'pivotIn' || state === 'retracting')) {
      state = 'pivotOut'; stateT = t; ch.latched = false; ch.fold.fill(0);
      ev(t, 'deploy', 'info', `开始展开（${why.zh}）`, `Deploy started (${why.en})`);
    } else if (cmd === 'retract' && (state === 'deployed' || state === 'extending' || state === 'pivotOut')) {
      state = 'retracting'; stateT = t;
      ev(t, 'retract', 'info', `开始收回（${why.zh}）`, `Retract started (${why.en})`);
    }
  };

  // ---- static initial equilibrium (fixed-point on gravity + initial base acceleration)
  setBase(0);
  for (let it = 0; it < 40; it++) {
    ch.kin(base);
    for (let i = 0; i < n; i++) {
      let Qi = 0;
      for (let k = 1; k <= N; k++) {
        const m = ch.m[k];
        const o = (k * n + i) * 3;
        Qi += ch.J[o] * (-m * base.ar[0]) + ch.J[o + 1] * (-m * base.ar[1]) + ch.J[o + 2] * (-m * (G + base.ar[2]));
      }
      const target = ch.qrest[i] + Qi / ch.k[i];
      ch.q[i] += 0.7 * (target - ch.q[i]);
    }
  }
  const qStatic = Float64Array.from(ch.q);

  // ---- integrate
  const steps = Math.round(dur / DTc);
  let si = 0;
  for (let step = 0; step <= steps; step++) {
    const t = step * DTc;
    const spd = setBase(t);
    // commands, automation
    while (ci < cmds.length && cmds[ci].t <= t + 1e-9) {
      const c = cmds[ci++];
      if (c.cmd === 'deploy') holdStop = spd < 0.6;
      command(t, c.cmd, { zh: '用户按键', en: 'button press' });
    }
    const iB = Math.min(nb - 1, Math.round(t / SDT));
    const tilt = TILT[iB];
    if (tilt > 0.45) { if (fallDetT == null) fallDetT = t; } else fallDetT = null;
    if (fallDetT != null && t - fallDetT > 0.15 && (state === 'deployed' || state === 'extending' || state === 'pivotOut')) {
      ev(t, 'fallDetect', 'warning', 'IMU 判定摔倒 → 自动收回', 'IMU detects a fall → auto-retract');
      command(t, 'retract', { zh: '摔倒检测', en: 'fall detected' });
    }
    if (spd < 0.5) still += DTc; else { still = 0; holdStop = false; }
    if (still > p.liftDelay && !holdStop && (state === 'deployed') && fallDetT == null) {
      ev(t, 'stopDetect', 'info', `静止 ${p.liftDelay.toFixed(0)} s（排队/缆车）→ 自动收回`, `Stationary ${p.liftDelay.toFixed(0)} s (lift queue) → auto-retract`);
      command(t, 'retract', { zh: '静止检测', en: 'stop detected' });
    }
    const rootFolded = ch.fold[0] !== 0 || ch.fold[1] !== 0;
    if (rootFolded) { if (rootFoldStart.t == null) rootFoldStart.t = t; } else rootFoldStart.t = null;
    if (rootFoldStart.t != null && t - rootFoldStart.t > 0.8 && state === 'deployed') {
      ev(t, 'foldStuck', 'warning', '折叠 0.8 s 未自行恢复 → 自动收回后需重新展开', 'Fold not self-recovered within 0.8 s → auto-retract, re-deploy needed');
      command(t, 'retract', { zh: '折叠未恢复', en: 'fold persisted' });
    }
    // state machine: pivot / tape pay-out
    let newLen = len;
    if (state === 'pivotOut') {
      pivot = d.stowAngle * (1 - smooth((t - stateT) / PIVOT_TIME));
      if (t - stateT >= PIVOT_TIME) { state = 'extending'; stateT = t; }
    } else if (state === 'extending') {
      newLen = Math.min(d.L, len + p.deployRate * DTc);
      if (newLen >= d.L - 1e-9) { state = 'deployed'; deployedAt = t; tauStat = null; ev(t, 'locked', 'info', `展开到位 ${d.L.toFixed(2)} m，卷带弹成闭口截面（LED 绿）`, `Deployed to ${d.L.toFixed(2)} m, tapes snapped to closed section (LED green)`); }
    } else if (state === 'retracting') {
      newLen = Math.max(STOW_LEN, len - p.deployRate * 1.25 * DTc);
      if (newLen <= STOW_LEN + 1e-9) { state = 'pivotIn'; stateT = t; }
    } else if (state === 'pivotIn') {
      pivot = d.stowAngle * smooth((t - stateT) / PIVOT_TIME);
      if (t - stateT >= PIVOT_TIME) {
        // folded zone has been drawn into the reel housing and re-formed: the 0.2 m stub is reset
        if (ch.fold.some((f) => f !== 0)) { ch.fold.fill(0); for (let i = 0; i < n; i++) { ch.q[i] = ch.qrest[i]; ch.v[i] = 0; } }
        state = 'stowed'; ch.latched = true; ch.setLength(len); ev(t, 'stowed', 'info', '收纳完成：相机停靠在背包顶部', 'Stowed: camera docked on the pack top'); }
    }
    if (newLen !== len) { len = newLen; ch.setLength(len); }
    ch.foldOn = cfg.foldOn !== false && state !== 'stowed' && state !== 'pivotIn' && state !== 'pivotOut';
    // ---- v2 active 2-axis root stabiliser (feed-forward from the pack IMU)
    // Gyro (lagged) → leaky integrator (high-pass above stabHp) gives the >0.7 Hz torso rotation Φ;
    // the tip displacement it causes, Φ × (tip − pelvis), is cancelled by commanding the root
    // joint (pitch: along e3, lateral: along e2). Geared motors: bandwidth, rate and torque
    // limits; above the torque limit the gearbox back-drives.
    if (stabOn) {
      const on = state === 'deployed' ? Math.min(1, (t - Math.max(0, deployedAt)) / (d.v3 ? 2.0 : 0.5)) : 0;
      const tauLag = Math.max(1e-4, p.stabLag / 1000);
      const wSense = [base.w[0], base.w[1], base.w[2]];
      if (cfg.stabSense === 'housing') for (let c = 0; c < 3; c++) wSense[c] += (ch.v[0] - ch.vrest[0]) * ch.as[c] + (ch.v[1] - ch.vrest[1]) * ch.al[c];
      // pitch and roll only (yaw is the turn itself). Pitch (about the torso's left axis) is
      // high-passed at stabHp; roll (about the horizontal heading) at stabHpRoll, above the turn
      // rhythm, so the boom does not fight the deliberate inclination changes of turning.
      let cmd;
      motor.gs = Math.min(1, (motor.gs ?? 1) + (d.v3 ? 0.15 : 0.3) * DTc);
      if (d.v3) {
        // ---- v3: translation stabiliser. The rigid body-locked tip position (pack IMU + encoders)
        // is high-passed (2nd order at stab3Fc); the root pitch/yaw joints move the tip by −δ, so the
        // tip follows a low-passed copy of the pack trajectory. Fusion error: 8 ms lag + 2 mm noise.
        // Optional tip-IMU feedback of the elastic tip deviation (low-passed below f1) via stab3Fb.
        const wc = 2 * Math.PI * p.stab3Fc;
        const lim = Math.min(1, DTc / tauLag);
        // mode 0 (default): the controlled quantity is the tip position RELATIVE to the pelvis
        // (hip-belt IMU) — the camera co-moves with the subject and only the torso articulation
        // above stab3Fc is removed; mode 1: inertial tip stabilisation (pack trajectory low-pass)
        const rel = !p.stab3Mode;
        const fP = clamp(t / SDT, 0, nb - 1.000001), iP = Math.floor(fP), wP = fP - iP;
        for (let c = 0; c < 3; c++) {
          const pel = PEL[3 * iP + c] * (1 - wP) + PEL[3 * iP + 3 + c] * wP;
          const pr = base.r[c] + len * base.Q0[c] - (rel ? pel : 0), vr = rel ? 0 : base.vr[c];
          if (!hpInit) { hpA[c] = pr - vr / wc; hpB[c] = vr / wc; }
          const y1 = pr - hpA[c]; hpA[c] += DTc * wc * (pr - hpA[c]);
          const y2 = y1 - hpB[c]; hpB[c] += DTc * wc * (y1 - hpB[c]);
          // fusion error: slow wander (0.5 Hz band, stab3Noise mm RMS, ASSUMED) — accelerometer white
          // noise double-integrated is negligible above 1 Hz; drift below is removed by the high-pass
          nWand[c] += (noise() * Math.sqrt(2 / (2 * Math.PI * 0.5 * DTc)) - nWand[c]) * (2 * Math.PI * 0.5 * DTc);
          est[c] += (y2 + ((p.stab3Noise ?? 2) / 1000) * nWand[c] - est[c]) * lim;
          // elastic tip deviation from the commanded rigid tip (tip IMU), low-passed at 2 Hz
          // elastic = actual tip − (rigid tip + commanded joint displacement), minus its static part
          const el0 = ch.p[3 * N + c] - (base.r[c] + len * (base.Q0[c] + thM[0] * base.Q0[6 + c] + (thM[1] - azNow) * base.Q0[3 + c]));
          elRef[c] += (el0 - elRef[c]) * Math.min(1, DTc * 2 * Math.PI * 0.3);
          elLP[c] += (el0 - elRef[c] - elLP[c]) * Math.min(1, DTc * 2 * Math.PI * 2);
        }
        hpInit = true;
        if (stopFade < 0.05) { hpInit = false; for (let c = 0; c < 3; c++) est[c] = 0; } // re-arm cleanly when skiing resumes
        const fall = fallDetT != null || tilt > 0.45;
        // graceful degradation: fade out below 4 m/s and in hard decelerations (hockey stop)
        const iS = Math.min(nb - 2, Math.max(1, Math.round(t / SDT))), aF = -(SPD[iS + 1] - SPD[iS - 1]) / (2 * SDT); // skier deceleration
        braking = aF > 3;
        stopFade += ((cfg.noFade || (spd > 4 && aF < 3) ? 1 : 0) - stopFade) * Math.min(1, DTc / 1.0);
        const g3 = (fall ? 0 : on) * motor.gs * stopFade;
        const fb = p.stab3Fb || 0;
        // while fading (stop/hockey stop) the last estimate is frozen and ramped out, not tracked
        if (!braking || !frz) frz = [est[0], est[1], est[2]];
        const src = braking ? frz : est;
        const dx = src[0] + fb * elLP[0], dy = src[1] + fb * elLP[1], dz = src[2] + fb * elLP[2];
        // commanded azimuth (highlight side view), slew-limited
        const azT = cfg.azCmd && state === 'deployed' && !fall ? cfg.azCmd(t) : 0;
        azNow += clamp(azT - azNow, -1.0 * DTc, 1.0 * DTc); // safety slew limit 1 rad/s
        cmd = [
          softLim((-g3 * (dx * base.Q0[6] + dy * base.Q0[7] + dz * base.Q0[8])) / len, p.stab3Range * D2R),
          clamp(softLim((-g3 * (dx * base.Q0[3] + dy * base.Q0[4] + dz * base.Q0[5])) / len, p.stab3Range * D2R) + azNow, -1.1, 1.1),
        ];
        if (fall && !limpEv) { limpEv = true; ev(t, 'limp', 'info', '摔倒：稳定器断电放松，折叠保险接管', 'Fall: stabiliser goes limp, the fold fuse takes over'); }
      } else {
      const fh = Math.hypot(Ft[0], Ft[1]) || 1, Fh = [Ft[0] / fh, Ft[1] / fh, 0];
      const raw2 = [wSense[0] * Lt[0] + wSense[1] * Lt[1] + wSense[2] * Lt[2], wSense[0] * Fh[0] + wSense[1] * Fh[1]];
      const wcs = [2 * Math.PI * p.stabHp, 2 * Math.PI * p.stabHpRoll];
      for (let a = 0; a < 2; a++) {
        gyro[a] += (raw2[a] - gyro[a]) * Math.min(1, DTc / tauLag);
        // two cascaded first-order high-passes (2nd order) on the integrated rate
        Phi1[a] += DTc * (gyro[a] * (cfg.stabGain ?? 1) - wcs[a] * Phi1[a]);
        PhiLP[a] += DTc * wcs[a] * (Phi1[a] - PhiLP[a]);
      }
      const ap = Phi1[0] - PhiLP[0], ar = Phi1[1] - PhiLP[1];
      for (let c = 0; c < 3; c++) Phi[c] = ap * Lt[c] + ar * Fh[c];
      const i0 = Math.min(nb - 1, Math.round(t / SDT));
      const rx = base.r[0] + len * base.Q0[0] - PEL[3 * i0], ry = base.r[1] + len * base.Q0[1] - PEL[3 * i0 + 1], rz = base.r[2] + len * base.Q0[2] - PEL[3 * i0 + 2];
      const dx = Phi[1] * rz - Phi[2] * ry, dy = Phi[2] * rx - Phi[0] * rz, dz = Phi[0] * ry - Phi[1] * rx;
      // authority limiter (anti-windup): back-driving the gearbox fades the command, recovering slowly
      const gsc = on * motor.gs;
      cmd = [
        clamp((-gsc * (dx * base.Q0[6] + dy * base.Q0[7] + dz * base.Q0[8])) / len, -0.25, 0.25),
        clamp((-gsc * (dx * base.Q0[3] + dy * base.Q0[4] + dz * base.Q0[5])) / len, -0.25, 0.25),
      ];
      }
      for (let a = 0; a < 2; a++) {
        // v3 hold: during a stop/hockey stop the joints lock where they are, then relax slowly once slow
        const hold = d.v3 && ((braking && spd > 1) || (motor.gs ?? 1) < 0.05);
        const vm = hold ? 0 : clamp((cmd[a] - thM[a]) * 2 * Math.PI * p.stabBw, -p.stabRate, p.stabRate) * (on > 0 || Math.abs(thM[a]) > 1e-6 ? 1 : 0);
        thM[a] += vm * DTc; vM[a] = vm;
        if (on === 0 || (d.v3 && fallDetT != null)) { thM[a] *= 0.98; }
      }
    }
    ch.qrest[0] = pivot + thM[0]; ch.qrest[1] = thM[1];
    ch.vrest[0] = vM[0]; ch.vrest[1] = vM[1];
    if (cfg.liftAt != null && !liftChecked && t >= cfg.liftAt) {
      liftChecked = true;
      const ok = state === 'stowed';
      ev(t, 'liftBoard', ok ? 'info' : 'invalid', ok ? '上缆车：杆已收纳 ✓' : `上缆车：杆仍伸出 ${len.toFixed(2)} m ✗`, ok ? 'Chairlift boarding: boom stowed ✓' : `Chairlift boarding: boom still out ${len.toFixed(2)} m ✗`);
    }

    // sub-step (×4) while the boom is near the snow, snagged or folding, so impacts and fold
    // onsets are resolved at 1 ms
    const nsub = state !== 'stowed' && (ch.near || snag || ch.fold[0] !== 0 || ch.fold[1] !== 0) ? 4 : 1;
    const h = DTc / nsub, aHPs = 1 / (1 + 2 * Math.PI * p.eisBw * h);
    let Mx = 0, My = 0, Mz = 0, Mmag = 0, Fboom = 0, Fbody = 0, ke = 0, Myaw = 0, dragX = 0, contactF = 0, snagFm = 0;
    for (let sub = 0; sub < nsub; sub++) {
      const ts = t + sub * h;
      if (sub > 0) setBase(ts);
      // stowed: the docked stub is latched to the pack and moves rigidly with it
      if (state === 'stowed') { ch.q.set(ch.qrest); ch.v.fill(0); }
      ch.kin(base);
      // wind at the root, sampled every 10 ms
      if (wind) {
        const kw = Math.floor(ts / SDT + 1e-9);
        if (kw !== windT) { windT = kw; windA = windB; windB = wind((kw + 1) * SDT, base.r); if (!windA) windA = wind(kw * SDT, base.r); }
        const ww = ts / SDT - kw;
        windV[0] = windA[0] + (windB[0] - windA[0]) * ww; windV[1] = windA[1] + (windB[1] - windA[1]) * ww; windV[2] = windA[2] + (windB[2] - windA[2]) * ww;
      }
      ch.forces(windV, tanS, Ft);
      const Fx = ch.F;
      // branch snag on the tip
      if (sc.snag && !snagDone) {
        if (!snag && ts >= sc.snag.t && state === 'deployed') {
          snag = { a: [ch.p[3 * N], ch.p[3 * N + 1], ch.p[3 * N + 2]] };
          ev(ts, 'snag', 'warning', '杆端勾住树枝', 'Boom tip hooks a branch');
        }
        if (snag && snag.lanyard) {
          // camera held by the branch, tied to the tip node by a 0.5 m lanyard with a 25 N rip-stitch
          const dx = snag.a[0] - ch.p[3 * N], dy = snag.a[1] - ch.p[3 * N + 1], dz = snag.a[2] - ch.p[3 * N + 2];
          const st = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const f = Math.min(25, Math.max(0, 400 * (st - 0.5)));
          if (st > 1.4 || f > sc.snag.slip) { snagDone = true; snag = null; ev(ts, 'snagRelease', 'info', '树枝放开相机，相机挂在挂绳上', 'Branch lets go of the camera; camera hangs on its lanyard'); }
          else if (f > 0) {
            Fx[3 * N] += (f * dx) / st; Fx[3 * N + 1] += (f * dy) / st; Fx[3 * N + 2] += (f * dz) / st;
            snagFm = Math.max(snagFm, f);
          }
        } else if (snag) {
          const dx = snag.a[0] - ch.p[3 * N], dy = snag.a[1] - ch.p[3 * N + 1], dz = snag.a[2] - ch.p[3 * N + 2];
          const st = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const f = sc.snag.k * st;
          if (d.v2 && f > p.magnetN && !ch.tipDetached) {
            ch.tipDetached = true; ch.setLength(len); snag.lanyard = true; camOff = true;
            ev(ts, 'breakaway', 'warning', `磁吸杆端脱开（${f.toFixed(0)} N），相机由挂绳系住`, `Magnetic tip breakaway at ${f.toFixed(0)} N; camera kept on the lanyard`);
          } else
          if (f > sc.snag.slip || st > sc.snag.maxStretch) {
            snagDone = true; snag = null;
            ev(ts, 'snagRelease', 'info', `树枝滑脱（拉力 ${f.toFixed(0)} N）`, `Branch slips off (pull ${f.toFixed(0)} N)`);
          } else {
            Fx[3 * N] += sc.snag.k * dx; Fx[3 * N + 1] += sc.snag.k * dy; Fx[3 * N + 2] += sc.snag.k * dz;
            snagFm = Math.max(snagFm, f);
            ch.Kc.push([N, dx / (st || 1), dy / (st || 1), dz / (st || 1), sc.snag.k, 0]);
          }
        }
      }
      if (state === 'stowed') { ch.dv.fill(0); ch.qddScale = 0; ch.loads(base, p.mHw + d.mStab, false); }
      else { ch.solve(h, foldEv, ts); ch.loads(base, p.mHw + d.mStab, true); }
      ({ Mx, My, Mz, Mmag, Fboom, Fbody, ke } = ch.ld);
      Myaw = Mx * Ut[0] + My * Ut[1] + Mz * Ut[2];
      dragX = ch.dragX; contactF = Math.max(contactF, ch.contactF);
      if (state !== 'stowed') {
        if (Mmag > peaks.Mmag) { peaks.Mt = ts; peaks.Mcomp = [Mx * Lt[0] + My * Lt[1] + Mz * Lt[2], Myaw, Mx * Ft[0] + My * Ft[1] + Mz * Ft[2], ch.fold[0], ch.fold[1], ch.q[0], ch.q[1], ch.tauRoot[0], ch.tauRoot[1]]; }
      peaks.Mmag = Math.max(peaks.Mmag, Mmag); peaks.Fboom = Math.max(peaks.Fboom, Fboom); peaks.Myaw = Math.max(peaks.Myaw, Math.abs(Myaw));
      }
      peaks.Fbody = Math.max(peaks.Fbody, Fbody); peaks.ke = Math.max(peaks.ke, ke); peaks.contact = Math.max(peaks.contact, contactF);
      // validity: elastic joints beyond the small-angle beam assumption
      for (let i = 2; i < n; i++) {
        if (ch.fold[i] === 0 && Math.abs(ch.q[i]) > 0.35 && validUntil == null) {
          validUntil = ts;
          ev(ts, 'invalid', 'invalid', '卷带弹性转角超出小变形梁假设，后续结果仅作示意', 'Tape elastic rotation beyond the small-deflection beam assumption; later results are illustrative');
        }
        peaks.jointMax = Math.max(peaks.jointMax, Math.abs(ch.q[i]));
      }
      // EIS: rotation beyond the gyro stabilisation bandwidth (first-order high-pass of ω_tip)
      for (let c = 0; c < 3; c++) { hp[c] = aHPs * (hp[c] + ch.wTip[c] - hpPrev[c]); hpPrev[c] = ch.wTip[c]; }
    }

    if (stabOn) {
      // motor torque = root moment minus the passive gravity balance (captured when locked)
      if (state === 'deployed' && tauStat == null && t - deployedAt > 0.4) tauStat = deployedAt < 0 ? ch.k[0] * (qStatic[0] - ch.qrest[0] + thM[0]) : motor.tauLP[0];
      if (!motor.init) { motor.tauLP = [ch.tauRoot[0], ch.tauRoot[1]]; motor.init = true; }
      for (let a = 0; a < 2; a++) motor.tauLP[a] += (ch.tauRoot[a] - motor.tauLP[a]) * Math.min(1, DTc / 1.0);
      if (state === 'deployed' && ch.fold[0] === 0 && ch.fold[1] === 0) {
        // a passive balance spring/brake carries quasi-static root moments (gravity, steady turn and
        // crosswind loads, < ~0.16 Hz); the motor supplies the dynamic remainder (ASSUMED architecture)
        const td = [ch.tauRoot[0] - motor.tauLP[0], ch.tauRoot[1] - motor.tauLP[1]];
        for (let a = 0; a < 2; a++) {
          if (Math.abs(td[a]) > d.tMax) { // gearbox back-drives
            const over = Math.abs(td[a]) - d.tMax;
            thM[a] += Math.sign(td[a]) * over / ch.k[a];
            motor.slip += DTc; td[a] = Math.sign(td[a]) * d.tMax;
            motor.gs = Math.max(d.v3 ? 0 : 0.2, (motor.gs ?? 1) - (d.v3 ? 10 : 4) * DTc);
          }
          motor.tPk = Math.max(motor.tPk, Math.abs(td[a]));
          motor.eJ += DTc * (Math.abs(td[a] * vM[a]) / 0.7 + (td[a] * td[a]) / (p.stabKm * p.stabKm)); // gearbox η 0.7 + copper loss
        }
        motor.tDep += DTc;
        motor.tau = td;
        // v3 graceful degradation: back off when the root moment nears the fuse (keeps the fuse for impacts)
        if (d.v3 && (Math.abs(ch.tauRoot[1]) > 0.6 * ch.mcp[1] || ch.tauRoot[0] > 0.6 * ch.mcp[0] || -ch.tauRoot[0] > 0.6 * ch.mcn[0])) motor.gs = Math.max(0, motor.gs - 10 * DTc);
      }
    }
    // ---- record sample
    if (step % EVERY === 0 && si < ns) {
      const i = si++;
      const B = [-Ft[0], -Ft[1], -Ft[2]];
      for (let k = 0; k <= N; k++) {
        const rx = ch.p[3 * k] - base.r[0], ry = ch.p[3 * k + 1] - base.r[1], rz = ch.p[3 * k + 2] - base.r[2];
        out.nodesB[i * NODES + 3 * k] = rx * B[0] + ry * B[1] + rz * B[2];
        out.nodesB[i * NODES + 3 * k + 1] = rx * Lt[0] + ry * Lt[1] + rz * Lt[2];
        out.nodesB[i * NODES + 3 * k + 2] = rx * Ut[0] + ry * Ut[1] + rz * Ut[2];
      }
      const oQ = 9 * (N - 1);
      for (let c = 0; c < 3; c++) {
        const e = [ch.Q[oQ + 3 * c], ch.Q[oQ + 3 * c + 1], ch.Q[oQ + 3 * c + 2]];
        out.camB[9 * i + 3 * c] = e[0] * B[0] + e[1] * B[1] + e[2] * B[2];
        out.camB[9 * i + 3 * c + 1] = e[0] * Lt[0] + e[1] * Lt[1] + e[2] * Lt[2];
        out.camB[9 * i + 3 * c + 2] = e[0] * Ut[0] + e[1] * Ut[1] + e[2] * Ut[2];
        out.camW[9 * i + 3 * c] = e[0]; out.camW[9 * i + 3 * c + 1] = e[1]; out.camW[9 * i + 3 * c + 2] = e[2];
      }
      const e1 = [ch.Q[oQ], ch.Q[oQ + 1], ch.Q[oQ + 2]];
      for (let c = 0; c < 3; c++) {
        out.tip[3 * i + c] = ch.p[3 * N + c] + CAM_OFF * e1[c];
        out.wCam[3 * i + c] = ch.wTip[c]; out.wCamHP[3 * i + c] = hp[c];
        out.rootW[3 * i + c] = base.r[c];
        out.frame[9 * i + c] = Ft[c]; out.frame[9 * i + 3 + c] = Lt[c]; out.frame[9 * i + 6 + c] = Ut[c];
        out.pelvis[3 * i + c] = PEL[3 * iB + c]; out.feet[3 * i + c] = FEET[3 * iB + c];
      }
      // tip deflection relative to the rigid rest line (root + len·e1(rest))
      const ca = Math.cos(d.alpha + pivot), sa = Math.sin(d.alpha + pivot);
      const rest = [base.r[0] + len * (B[0] * ca + Ut[0] * sa), base.r[1] + len * (B[1] * ca + Ut[1] * sa), base.r[2] + len * (B[2] * ca + Ut[2] * sa)];
      const dx = ch.p[3 * N] - rest[0], dy = ch.p[3 * N + 1] - rest[1], dz = ch.p[3 * N + 2] - rest[2];
      const e3r = [Ut[0] * ca - B[0] * sa, Ut[1] * ca - B[1] * sa, Ut[2] * ca - B[2] * sa];
      out.relTip[3 * i] = dx; out.relTip[3 * i + 1] = dy; out.relTip[3 * i + 2] = dz;
      out.defSag[i] = 1000 * (dx * e3r[0] + dy * e3r[1] + dz * e3r[2]);
      out.defLat[i] = 1000 * (dx * Lt[0] + dy * Lt[1] + dz * Lt[2]);
      out.len[i] = len;
      out.stateCode[i] = { stowed: 0, pivotOut: 1, extending: 2, deployed: 3, retracting: 4, pivotIn: 5 }[state];
      out.foldS[i] = ch.fold[0]; out.foldL[i] = ch.fold[1];
      let anyFold = 0; for (let q = 0; q < n; q++) if (ch.fold[q]) anyFold = 1;
      out.led[i] = anyFold ? 3 : state === 'deployed' ? 1 : state === 'stowed' ? 0 : 2;
      out.M[3 * i] = Mx * Lt[0] + My * Lt[1] + Mz * Lt[2];   // pitch (about torso left axis)
      out.M[3 * i + 1] = Myaw;                                 // yaw (about spine)
      out.M[3 * i + 2] = Mx * Ft[0] + My * Ft[1] + Mz * Ft[2]; // roll (about torso forward)
      out.Mmag[i] = Mmag; out.Fboom[i] = Fboom; out.Fbody[i] = Fbody; out.ke[i] = ke; out.drag[i] = -dragX;
      {
        // KE of tip camera + ⅓ tapes relative to the rider's rigid torso motion, and camera KE vs snow
        const k = 3 * N, rx = ch.p[k] - base.r[0], ry = ch.p[k + 1] - base.r[1], rz = ch.p[k + 2] - base.r[2];
        const w = base.w;
        const vx = ch.vel[k] - (base.vr[0] + w[1] * rz - w[2] * ry), vy = ch.vel[k + 1] - (base.vr[1] + w[2] * rx - w[0] * rz), vz = ch.vel[k + 2] - (base.vr[2] + w[0] * ry - w[1] * rx);
        const mEff = ch.m[N] + d.mTapes / 3;
        out.keRider[i] = 0.5 * mEff * (vx * vx + vy * vy + vz * vz);
        out.keCam[i] = 0.5 * ch.m[N] * (ch.vel[k] ** 2 + ch.vel[k + 1] ** 2 + ch.vel[k + 2] ** 2);
        out.reach[i] = Math.hypot(ch.p[k] - PEL[3 * iB], ch.p[k + 1] - PEL[3 * iB + 1]);
      }
      out.beta[i] = BETA[iB]; out.tilt[i] = tilt; out.speed[i] = spd; out.contactF[i] = contactF; out.snagF[i] = snagFm;
      // body yaw angular acceleration (for the % torque comparison)
      out.yawBodyAcc[i] = DW[3 * iB] * Ut[0] + DW[3 * iB + 1] * Ut[1] + DW[3 * iB + 2] * Ut[2];
      // stitch-plane check: deviation of every boom node from the camera's stitch plane
      let e2 = [ch.Q[oQ + 3], ch.Q[oQ + 4], ch.Q[oQ + 5]];
      const pc = [out.tip[3 * i], out.tip[3 * i + 1], out.tip[3 * i + 2]];
      // optional stitch trim: a slow camera yaw servo (about e3) turns the stitch plane from the
      // tip tangent onto the root→tip chord (0.5 Hz low-pass, ±0.1 rad)
      if (p.stitchTrim && d.v2) {
        const cx = ch.p[3 * N] - ch.p[0], cy = ch.p[3 * N + 1] - ch.p[1], cz = ch.p[3 * N + 2] - ch.p[2];
        const g = Math.atan2(cx * e2[0] + cy * e2[1] + cz * e2[2], cx * e1[0] + cy * e1[1] + cz * e1[2]);
        trimG += (clamp(g, -0.1, 0.1) - trimG) * Math.min(1, SDT / 0.32);
        const cg = Math.cos(trimG), sg = Math.sin(trimG);
        e2 = [e2[0] * cg - e1[0] * sg, e2[1] * cg - e1[1] * sg, e2[2] * cg - e1[2] * sg];
      }
      let worstPx = 0, worstMm = 0, subjPx = 0;
      const ppr = p.equiW / (2 * Math.PI);
      const se = Math.sin(p.mountErr * D2R);
      const dRoot = Math.hypot(ch.p[0] - pc[0], ch.p[1] - pc[1], ch.p[2] - pc[2]);
      const subjHalf = 0.3 / Math.max(0.5, dRoot); // rider's half-width as seen behind the root (rad)
      for (let k = 0; k < N; k++) {
        const rx = ch.p[3 * k] - pc[0], ry = ch.p[3 * k + 1] - pc[1], rz = ch.p[3 * k + 2] - pc[2];
        const r = Math.hypot(rx, ry, rz);
        const ein = rx * e2[0] + ry * e2[1] + rz * e2[2];
        // in-plane tapes, and (v2) the third tape offset laterally by h(x) (worst side)
        const offs = d.v2 ? [ein, ein + d.hLat(k * ch.D, len) * Math.sign(ein || 1)] : [ein];
        for (const eo of offs) {
          const e = Math.abs(eo) + r * se; // + mounting misalignment (worst sign)
          const prot = e + (p.tapeD / 2000) - (p.baseline / 2000);
          worstMm = Math.max(worstMm, prot * 1000);
          if (prot > 0) {
            const px = (prot / r) * ppr;
            worstPx = Math.max(worstPx, px);
            if (e / r < subjHalf) subjPx = Math.max(subjPx, px);
          }
        }
      }
      out.stickSubjPx[i] = subjPx;
      // clearance between the boom (segments) and the rider's head, shoulders, hands and poles
      if (state !== 'stowed') {
        const pl = [PEL[3 * iB], PEL[3 * iB + 1], PEL[3 * iB + 2]];
        const P3 = (f, l, u, z = 0) => [pl[0] + Ft[0] * f + Lt[0] * l + Ut[0] * u, pl[1] + Ft[1] * f + Lt[1] * l + Ut[1] * u, pl[2] + Ft[2] * f + Lt[2] * l + Ut[2] * u + z];
        const pts = [[P3(0.1, 0, 0.8), 0.13], [P3(0, 0.19, 0.52), 0.08], [P3(0, -0.19, 0.52), 0.08]];
        for (const sg of [1, -1]) { const hnd = P3(0.36, 0.31 * sg, 0.16); pts.push([hnd, 0.05]); for (let q = 1; q <= 4; q++) pts.push([[hnd[0] - Ft[0] * 0.12 * q, hnd[1] - Ft[1] * 0.12 * q, hnd[2] - 0.27 * q], 0.012]); }
        let cl = 9;
        for (let k = 0; k < N; k++) {
          const a = [ch.p[3 * k], ch.p[3 * k + 1], ch.p[3 * k + 2]], b = [ch.p[3 * k + 3], ch.p[3 * k + 4], ch.p[3 * k + 5]];
          const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
          for (const [q, rad] of pts) {
            const tt = clamp(((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1] + (q[2] - a[2]) * ab[2]) / l2, 0, 1);
            cl = Math.min(cl, Math.hypot(a[0] + ab[0] * tt - q[0], a[1] + ab[1] * tt - q[1], a[2] + ab[2] * tt - q[2]) - rad - 0.03);
          }
        }
        out.clear[i] = cl;
        out.azNow[i] = azNow;
      } else out.clear[i] = NaN;
      out.stickPx[i] = worstPx; out.stickMm[i] = worstMm;
      out.camOff[i] = camOff ? 1 : 0; out.thM[2 * i] = thM[0]; out.thM[2 * i + 1] = thM[1];
      out.Fv[3 * i] = ch.ld.Fx; out.Fv[3 * i + 1] = ch.ld.Fy; out.Fv[3 * i + 2] = ch.ld.Fz;
      out.motorTau[i] = motor.tau ? Math.hypot(motor.tau[0], motor.tau[1]) : 0;
    }
  }
  out.validUntil = validUntil;
  out.motor = { torquePeak: motor.tPk, powerMean: motor.tDep > 0 ? motor.eJ / motor.tDep : 0, slipTime: motor.slip, on: stabOn };
  out.peaks = peaks;
  out.foldCount = foldCount;
  out.qStatic = qStatic;
  out.design = d;
  out.cRoot = ch.cRoot;
  return out;
}

// ---------------------------------------------------------------- footage post-processing
// 360 equirect at the tip; output = reframed crop aimed at the rider by (offline,
// zero-phase) subject tracking. Electronic stabilisation removes camera rotation
// except a residual fraction and content above the EIS bandwidth; tip translation
// relative to the rider (parallax at distance d) is NOT removed.
export function footageAnalysis(raw, p) {
  const ns = raw.ns, S = raw.samples;
  const filming = new Uint8Array(ns);
  const px = new Float64Array(ns).fill(NaN), az = new Float64Array(ns).fill(NaN), persp = new Float64Array(ns).fill(NaN), dist = new Float64Array(ns).fill(NaN);
  const inF = new Uint8Array(ns);
  const u = new Float64Array(3 * ns);
  for (let i = 0; i < ns; i++) {
    const s = S[i];
    const ok = raw.stateCode[i] === 3 && raw.beta[i] < 0.05 && !s.fallen && raw.foldS[i] === 0 && raw.foldL[i] === 0 && !raw.camOff[i];
    const c = [raw.tip[3 * i], raw.tip[3 * i + 1], raw.tip[3 * i + 2]];
    const pts = subjectPoints(s);
    const dx = pts.mid[0] - c[0], dy = pts.mid[1] - c[1], dz = pts.mid[2] - c[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    u[3 * i] = dx / l; u[3 * i + 1] = dy / l; u[3 * i + 2] = dz / l;
    if (!ok) continue;
    filming[i] = 1;
    const f = footage({ pos: c, kind: '360', w: p.equiW, h: p.equiW / 2, cropVfovDeg: p.cropV }, s);
    const outPx = Math.min(f.subjectPx, f.fill * 1080);
    px[i] = outPx; az[i] = f.az; dist[i] = f.dist; inF[i] = f.inFrame;
    persp[i] = Math.hypot(pts.feet[0] - c[0], pts.feet[1] - c[1], pts.feet[2] - c[2]) / Math.hypot(pts.head[0] - c[0], pts.head[1] - c[1], pts.head[2] - c[2]);
  }
  // crop direction: zero-phase exponential smoothing of the LOS (offline AI subject tracking,
  // τ = 0.15 s per pass, ASSUMED); what it cannot follow (> ~1 Hz) is jitter
  const crop = Float64Array.from(u);
  const a = SDT / (0.15 + SDT);
  for (let pass = 0; pass < 2; pass++) {
    const fwd = pass === 0;
    for (let k = 1; k < ns; k++) {
      const i = fwd ? k : ns - 1 - k, j = fwd ? i - 1 : i + 1;
      if (!filming[i] || !filming[j]) continue;
      for (let c = 0; c < 3; c++) crop[3 * i + c] = crop[3 * j + c] + a * (crop[3 * i + c] - crop[3 * j + c]);
    }
  }
  for (let i = 0; i < ns; i++) { const l = Math.hypot(crop[3 * i], crop[3 * i + 1], crop[3 * i + 2]) || 1; for (let c = 0; c < 3; c++) crop[3 * i + c] /= l; }
  // in-frame subject position (2-D small angles) + residual rotation, then its rate
  const jit = new Float64Array(ns).fill(NaN), jitTrans = new Float64Array(ns).fill(NaN), jitRot = new Float64Array(ns).fill(NaN);
  const offs = new Float64Array(2 * ns);
  let rx = 0, ry = 0; // integrated residual rotation (pan, tilt)
  for (let i = 0; i < ns; i++) {
    const cx = crop[3 * i], cy = crop[3 * i + 1], cz = crop[3 * i + 2];
    let rgt = [cy, -cx, 0]; const lr = Math.hypot(rgt[0], rgt[1]) || 1; rgt = [rgt[0] / lr, rgt[1] / lr, 0];
    const up = [rgt[1] * cz - 0 * cy, 0 * cx - rgt[0] * cz, rgt[0] * cy - rgt[1] * cx];
    offs[2 * i] = u[3 * i] * rgt[0] + u[3 * i + 1] * rgt[1] + u[3 * i + 2] * rgt[2];
    offs[2 * i + 1] = u[3 * i] * up[0] + u[3 * i + 1] * up[1] + u[3 * i + 2] * up[2];
    if (i === 0 || !filming[i] || !filming[i - 1]) { rx = ry = 0; continue; }
    const w = [raw.wCam[3 * i], raw.wCam[3 * i + 1], raw.wCam[3 * i + 2]], wh = [raw.wCamHP[3 * i], raw.wCamHP[3 * i + 1], raw.wCamHP[3 * i + 2]];
    // residual image rotation rate: EIS error fraction of ω plus content above the EIS bandwidth
    const res = [p.eisResid * w[0] + wh[0], p.eisResid * w[1] + wh[1], p.eisResid * w[2] + wh[2]];
    const pan = res[0] * up[0] + res[1] * up[1] + res[2] * up[2], tilt = res[0] * rgt[0] + res[1] * rgt[1] + res[2] * rgt[2];
    const tr = Math.hypot(offs[2 * i] - offs[2 * i - 2], offs[2 * i + 1] - offs[2 * i - 1]) / SDT;
    jitTrans[i] = (tr * 180) / Math.PI;
    jitRot[i] = (Math.hypot(pan, tilt) * 180) / Math.PI;
    jit[i] = (Math.hypot((offs[2 * i] - offs[2 * i - 2]) / SDT + pan, (offs[2 * i + 1] - offs[2 * i - 1]) / SDT + tilt) * 180) / Math.PI;
    rx += pan * SDT; ry += tilt * SDT;
  }
  // tip translation relative to the rider: dynamic part (high-pass by zero-phase smoothing, τ 0.3 s)
  const rel = raw.relTip, sm = Float64Array.from(rel);
  const b = SDT / (0.3 + SDT);
  for (let pass = 0; pass < 2; pass++) for (let k = 1; k < ns; k++) {
    const i = pass === 0 ? k : ns - 1 - k, j = pass === 0 ? i - 1 : i + 1;
    for (let c = 0; c < 3; c++) sm[3 * i + c] = sm[3 * j + c] + b * (sm[3 * i + c] - sm[3 * j + c]);
  }
  const transMm = new Float64Array(ns).fill(NaN), shakeDeg = new Float64Array(ns).fill(NaN), jitBoom = new Float64Array(ns).fill(NaN);
  let px0 = 0, py0 = 0;
  for (let i = 0; i < ns; i++) {
    if (!filming[i]) continue;
    {
      // boom-induced in-frame motion: dynamic tip translation projected on the crop axes / distance
      const cx = crop[3 * i], cy = crop[3 * i + 1], cz = crop[3 * i + 2];
      const rl = Math.sqrt(cy * cy + cx * cx) || 1, rgt = [cy / rl, -cx / rl, 0];
      const up = [rgt[1] * cz, -rgt[0] * cz, rgt[0] * cy - rgt[1] * cx];
      const dx = rel[3 * i] - sm[3 * i], dy = rel[3 * i + 1] - sm[3 * i + 1], dz = rel[3 * i + 2] - sm[3 * i + 2];
      const dd = dist[i] || 2;
      const ax = (dx * rgt[0] + dy * rgt[1]) / dd, ay = (dx * up[0] + dy * up[1] + dz * up[2]) / dd;
      if (i > 0 && filming[i - 1] && Number.isFinite(jitRot[i])) {
        const w = [raw.wCam[3 * i], raw.wCam[3 * i + 1], raw.wCam[3 * i + 2]], wh = [raw.wCamHP[3 * i], raw.wCamHP[3 * i + 1], raw.wCamHP[3 * i + 2]];
        const res = [p.eisResid * w[0] + wh[0], p.eisResid * w[1] + wh[1], p.eisResid * w[2] + wh[2]];
        const pan = res[0] * up[0] + res[1] * up[1] + res[2] * up[2], tilt = res[0] * rgt[0] + res[1] * rgt[1] + res[2] * rgt[2];
        jitBoom[i] = (Math.hypot((ax - px0) / SDT + pan, (ay - py0) / SDT + tilt) * 180) / Math.PI;
      }
      px0 = ax; py0 = ay;
    }
    const dx = rel[3 * i] - sm[3 * i], dy = rel[3 * i + 1] - sm[3 * i + 1], dz = rel[3 * i + 2] - sm[3 * i + 2];
    // component perpendicular to the line of sight = parallax shake of the subject
    const ud = dx * u[3 * i] + dy * u[3 * i + 1] + dz * u[3 * i + 2];
    const perp = Math.hypot(dx - ud * u[3 * i], dy - ud * u[3 * i + 1], dz - ud * u[3 * i + 2]);
    transMm[i] = 1000 * Math.hypot(dx, dy, dz);
    shakeDeg[i] = (Math.atan2(perp, dist[i] || 2) * 180) / Math.PI;
  }
  return { filming, px, az, persp, dist, inF, crop, u, jit, jitTrans, jitRot, jitBoom, transMm, shakeDeg };
}

export const rms = (arr, mask) => { let s = 0, k = 0; for (let i = 0; i < arr.length; i++) { const v = arr[i]; if ((!mask || mask[i]) && Number.isFinite(v)) { s += v * v; k++; } } return k ? Math.sqrt(s / k) : NaN; };
export const maxOf = (arr, mask) => { let m = -Infinity; for (let i = 0; i < arr.length; i++) { const v = arr[i]; if ((!mask || mask[i]) && Number.isFinite(v)) m = Math.max(m, v); } return Number.isFinite(m) ? m : NaN; };
export function movingMeanMax(arr, win, mask) {
  let best = 0, s = 0; const q = [];
  for (let i = 0; i < arr.length; i++) {
    const v = (!mask || mask[i]) && Number.isFinite(arr[i]) ? arr[i] : 0;
    q.push(v); s += v; if (q.length > win) s -= q.shift();
    if (q.length === win) best = Math.max(best, s / win);
  }
  return best;
}
export { I_BODY_YAW, I_BODY_ROLL, SKIER_CDA, RHO };
