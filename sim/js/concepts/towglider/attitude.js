// towglider attitude response to turbulence + camera stabilisation residual (round 2,
// ITERATE_BRIEF "footage stability for gliders", audit X-05 / TG-09).
//
// The flight model (model.js) is a translational point mass whose body axes are
// aligned instantly with the relative wind (+α, +bank). Real airframes respond to
// gusts through their short-period, Dutch-roll and roll modes, and the shared
// wind field (common/env.js) has no content above ≈1.6 Hz at a fixed point, so it
// carries almost no gust energy at the 2–10 Hz encounter frequencies that shake a
// 0.8 m-span glider. This module adds, post hoc (one-way coupling, the trajectory
// is not changed):
//  1. a sub-grid gust process: the von Kármán tail of the same σ and length scale
//     above the shared field's cut-off, sampled at the airspeed (Taylor), for the
//     vertical and lateral components (→ gust α, β), plus the MIL-F-8785C Dryden
//     rolling-gust spectrum p_g for the span b (the shared field has no spanwise
//     gradient at this scale);
//  2. attitude dynamics: pitch follows (reference pitch + α_g) through a 2nd-order
//     short-period filter, yaw follows (reference heading + β_g) through a 2nd-order
//     Dutch-roll filter, roll = commanded bank + a perturbation driven by p_g through
//     the roll subsidence mode τ_r and held by the autopilot (2nd-order, f_c);
//  3. body angular rate and, per camera option, the residual rotation left in the
//     output picture: brushless gimbal = 1st-order high-pass above its stabilisation
//     bandwidth f_g plus a floor ratio; gyro EIS (post-processing crop) = a fixed
//     residual ratio of the camera rotation rate (gyro/frame sync, rolling shutter);
//     the subject tracker re-centres residual angle errors at 1 Hz.
// All mode frequencies, ratios and the sub-grid model are ASSUMED (typical small-UAV
// values), not identified on an airframe. Evidence: numerical-uncalibrated.
import { mulberry32 } from '../../model/util.js';

export const ATT = {
  fsp: 2.5, zsp: 0.45,   // short period: 2.5 Hz, ζ 0.45 (ASSUMED, 120 g, 0.78 m span glider)
  fdr: 1.6, zdr: 0.3,    // Dutch roll / weathercock: 1.6 Hz, ζ 0.3 (ASSUMED)
  tauRoll: 0.06,         // roll subsidence time constant (ASSUMED)
  fBank: 1.2,            // autopilot bank hold against rolling gusts (ASSUMED)
  fMax: 0.005 * Math.pow(1.13, 47), // highest mode of the shared makeWind field (Hz at a fixed point)
};
export const STAB = {
  gimbal: { fg: 8, floor: 0.03, zh: '无刷云台：8 Hz 以上的机体转动不抑制（一阶高通）+ 3 % 残余', en: 'brushless gimbal: body rotation above 8 Hz passes (1st-order high-pass) + 3 % floor' },
  eis: { ratio: 0.08, zh: '陀螺电子稳像（后期裁切）：残余 8 % 相机转速（陀螺-帧同步、卷帘）', en: 'gyro EIS (post-processing crop): 8 % of the camera rotation rate remains (gyro–frame sync, rolling shutter)' },
  recentreHz: 1,
  exposureS: 0.001, // 1/1000 s on bright snow (motion blur cannot be removed by EIS)
};

// round 3: stabilised 3-servo mount (world-referenced pointing with FC-IMU feed-forward). f_s = closed-loop servo
// bandwidth for small angles (ASSUMED 4 Hz for a 2.5–4 g digital micro servo at 333 Hz frame rate, ≈0.06 s/60° no-load),
// fPoint = subject pointing bandwidth, deadband/hunting noise dbDeg RMS at fDb (ASSUMED)
export const MOUNT = { fs: 4, fPoint: 1.5, dbDeg: 0.15, fDb: 6 };
// post-processing reframe: zero-phase low-pass of the subject direction; image-detection noise as a fraction of the
// subject's angular height per frame (ASSUMED)
export const REFRAME = { fr: 2, noiseFrac: 0.01 };
// zero-phase 2nd-order Butterworth low-pass (forward + backward), fc Hz
export function lpZero(x, fc, dt) {
  const K = Math.tan(Math.PI * fc * dt), Q = Math.SQRT1_2, norm = 1 / (1 + K / Q + K * K);
  const b0 = K * K * norm, b1 = 2 * b0, b2 = b0, a1 = 2 * (K * K - 1) * norm, a2 = (1 - K / Q + K * K) * norm;
  const pass = (s) => { const y = new Float64Array(s.length); let x1 = s[0], x2 = s[0], y1 = s[0], y2 = s[0]; for (let i = 0; i < s.length; i++) { const v = b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = s[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const f = pass(x); f.reverse(); const r = pass(f); r.reverse(); return r;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// sum-of-sines process with spectrum S(f) (one-sided, per Hz) between f0 and f1
function sines(S, f0, f1, nModes, rng) {
  const modes = []; let v = 0;
  if (!(f1 > f0)) return { modes, sigma: 0, at: () => 0 };
  const r = Math.pow(f1 / f0, 1 / nModes);
  for (let j = 0; j < nModes; j++) {
    const fa = f0 * Math.pow(r, j), fb = fa * r, f = Math.sqrt(fa * fb), a = Math.sqrt(2 * S(f) * (fb - fa));
    modes.push([2 * Math.PI * f, a, rng() * 2 * Math.PI]); v += (a * a) / 2;
  }
  return { modes, sigma: Math.sqrt(v), at: (t) => { let s = 0; for (const [w, a, ph] of modes) s += a * Math.sin(w * t + ph); return s; } };
}

// sub-grid gusts for one run: wind {mean, intensity, Lu}, airspeed V (m/s), span b (m)
export function subgrid(wind = {}, V = 12, b = 0.78, seed = 1) {
  const U = Math.max(2, Math.hypot(...(wind.mean || [0, 0, 0])));
  const sig = (wind.intensity ?? 0.15) * U, L = wind.Lu ?? 28;
  const sw = 0.5 * sig, sv = 0.8 * sig; // component scales as in makeWind
  const Vk = Math.max(4, V);
  const fc = (Vk * ATT.fMax) / U;     // encounter frequency of the shortest resolved wavelength
  const vk = (s) => (f) => { const x = (f * L) / Vk; return (s * s * 4 * (L / Vk) * (4 / 3)) / Math.pow(1 + 70.8 * x * x, 5 / 6); }; // transverse tail
  const rng = mulberry32(seed * 977 + 13);
  const w = sines(vk(sw), fc, 25, 28, rng), v = sines(vk(sv), fc, 25, 28, rng);
  // Dryden rolling gust (MIL-F-8785C), σ_w of the full field, ω in rad/s → per-Hz one-sided S_p(f) = 2π·Φ_p(2πf)
  const Pp = (f) => { const om = 2 * Math.PI * f; return 2 * Math.PI * ((sw * sw) / (Vk * L)) * 0.8 * Math.pow((Math.PI * L) / (4 * b), 1 / 3) / (1 + Math.pow((4 * b * om) / (Math.PI * Vk), 2)); };
  const p = sines(Pp, 0.1, 25, 32, rng);
  return { w: w.at, v: v.at, p: p.at, sigma: { w: w.sigma, v: v.sigma, p: p.sigma, fc } };
}

// 2nd-order tracking filter (x → u) with natural frequency f (Hz) and damping z, 4 substeps
function so(f, z) {
  const om = 2 * Math.PI * f; let x = null, xd = 0;
  return { reset(u) { x = u; xd = 0; }, step(u, dt) { if (x == null) { x = u; xd = 0; } const h = dt / 4; for (let k = 0; k < 4; k++) { const xdd = om * om * (u - x) - 2 * z * om * xd; xd += xdd * h; x += xd * h; } return x; } };
}

// O: runCore outputs; flying[i] = 1 when airborne; wind: scenario wind; span b; seed
// returns per-sample perturbed body axes (bx, bz), world angular rate (rad/s) and summary
export function attitude(O, n, dt, flying, { wind = {}, b = 0.78, seed = 1, Vref = 12 } = {}) {
  const sg = subgrid(wind, Vref, b, seed);
  const fP = so(ATT.fsp, ATT.zsp), fY = so(ATT.fdr, ATT.zdr);
  const omB = 2 * Math.PI * ATT.fBank;
  let phE = 0, phEd = 0, psiPrev = null, psiUn = 0;
  const bxA = new Array(n), bzA = new Array(n), rate = new Array(n), rateDeg = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const bx = [O.fx[i], O.fy[i], O.fz[i]], bz = [O.ux[i], O.uy[i], O.uz[i]];
    // reference Euler angles (yaw unwrapped, pitch, roll about bx)
    const psi = Math.atan2(bx[1], bx[0]);
    if (psiPrev == null) psiUn = psi; else { let d = psi - psiPrev; d = Math.atan2(Math.sin(d), Math.cos(d)); psiUn += d; }
    psiPrev = psi;
    const th = Math.asin(Math.max(-1, Math.min(1, bx[2])));
    const z0 = nrm([-bx[0] * bx[2], -bx[1] * bx[2], 1 - bx[2] * bx[2] || 1e-9]), y0 = cross(z0, bx);
    const phi = Math.atan2(-dot(bz, y0), dot(bz, z0));
    let psiB = psiUn, thB = th, phB = phi;
    if (flying[i]) {
      const V = Math.max(4, O.air[i]);
      thB = fP.step(th + sg.w(t) / V, dt);
      psiB = fY.step(psiUn + sg.v(t) / V, dt);
      const h = dt / 4;
      const pg = sg.p(t);
      for (let k = 0; k < 4; k++) { const pdd = (pg - phEd) / ATT.tauRoll - omB * omB * phE; phEd += pdd * h; phE += phEd * h; } // roll mode (damping) + autopilot bank hold
      phB = phi + phE;
    } else { fP.reset(th); fY.reset(psiUn); phE = 0; phEd = 0; }
    // rebuild the perturbed body axes
    const cps = Math.cos(psiB), sps = Math.sin(psiB), cth = Math.cos(thB), sth = Math.sin(thB);
    const X = [cps * cth, sps * cth, sth];
    const Z0 = nrm([-X[0] * X[2], -X[1] * X[2], 1 - X[2] * X[2] || 1e-9]), Y0 = cross(Z0, X);
    const Z = nrm([Z0[0] * Math.cos(phB) - Y0[0] * Math.sin(phB), Z0[1] * Math.cos(phB) - Y0[1] * Math.sin(phB), Z0[2] * Math.cos(phB) - Y0[2] * Math.sin(phB)]);
    bxA[i] = X; bzA[i] = Z;
  }
  for (let i = 0; i < n; i++) {
    if (i === 0) { rate[i] = [0, 0, 0]; continue; }
    const X0 = bxA[i - 1], Z0 = bzA[i - 1], X1 = bxA[i], Z1 = bzA[i];
    const Y0 = cross(Z0, X0), Y1 = cross(Z1, X1);
    const a = cross(X0, X1), c = cross(Y0, Y1), e = cross(Z0, Z1);
    rate[i] = [(a[0] + c[0] + e[0]) / (2 * dt), (a[1] + c[1] + e[1]) / (2 * dt), (a[2] + c[2] + e[2]) / (2 * dt)];
    rateDeg[i] = (Math.hypot(...rate[i]) * 180) / Math.PI;
  }
  rate[0] = rate[1] || [0, 0, 0];
  return { bx: bxA, bz: bzA, rate, rateDeg, sigma: sg.sigma };
}

// residual rotation (rad, world-frame small-angle vector) left in the picture
// kind 'gimbal' | 'eis'; camRate[i] = camera rotation rate (rad/s, world); active[i] filming
export function residual(kind, camRate, n, dt, active) {
  const out = new Array(n); let e = [0, 0, 0], lp = [0, 0, 0];
  const kRe = 2 * Math.PI * STAB.recentreHz, aG = 1 - Math.exp(-dt * 2 * Math.PI * STAB.gimbal.fg);
  for (let i = 0; i < n; i++) {
    const w = camRate[i] || [0, 0, 0];
    if (!active[i]) { e = [0, 0, 0]; lp = [...w]; out[i] = e; continue; }
    let r;
    if (kind === 'gimbal') { lp = [lp[0] + (w[0] - lp[0]) * aG, lp[1] + (w[1] - lp[1]) * aG, lp[2] + (w[2] - lp[2]) * aG]; r = [w[0] - lp[0] + STAB.gimbal.floor * w[0], w[1] - lp[1] + STAB.gimbal.floor * w[1], w[2] - lp[2] + STAB.gimbal.floor * w[2]]; }
    else r = [STAB.eis.ratio * w[0], STAB.eis.ratio * w[1], STAB.eis.ratio * w[2]];
    e = [e[0] + (r[0] - kRe * e[0]) * dt, e[1] + (r[1] - kRe * e[1]) * dt, e[2] + (r[2] - kRe * e[2]) * dt];
    out[i] = e;
  }
  return out;
}
// rotate unit vector v by small rotation vector e (Rodrigues, first order is enough for mrad-level e)
export function rot(v, e) { const c = cross(e, v); return nrm([v[0] + c[0], v[1] + c[1], v[2] + c[2]]); }

// ---------------------------------------------------------------------------------------------------------------
// Round 4 (audit3 A3-TG-04 / A3-X-08: no idealised actuators or estimators in judged runs). The round-3 mount was a
// linear 4 Hz high-pass plus a random 'deadband noise', and EIS was a fixed 8 % of the camera rate. Both are replaced
// by component models with their own limits:
//  • SERVO: each of the 3 mount axes is a hobby digital micro servo (EMAX ES9251 II class: 2.5 g, 0.08 s/60° no-load
//    ⇒ 750 °/s slew limit, cited) driven by a 333 Hz PWM frame (zero-order hold), commanded from the flight
//    controller's attitude estimate (latency tauEst). Inside the servo: a dead band (no drive while |cmd − pos| ≤ db/2,
//    so the steady error sits anywhere inside ±db/2), a proportional speed loop with small-signal bandwidth fs, the
//    motor/gear-train lag tauM and the slew limit; the output gear has backlash (play operator of width bl). Load:
//    the 27 g camera (I ≈ 5e-6 kg·m², ASSUMED) needs ≤ 1e-3 N·m at 200 rad/s² — < 5 % of the ≈0.03 N·m stall torque
//    of the class (ASSUMED), so the axes are speed-, not torque-limited.
//  • EIS (Gyroflow-class post stabilisation from the camera's own gyro log, applied after the run): the camera
//    rotation is removed except for (i) the gyro/frame timestamp error δ (residual angle δ·ω), (ii) the rolling-shutter
//    model residual (fraction rsResid of the readout skew t_r/2: residual angle ≈ rsResid·(t_r/2)·ω), (iii) the gyro
//    scale-factor + lens-calibration error ks (residual angle ks·θ for the >recentreHz part of the camera rotation), and
//    (iv) the gyro rate noise density (ICM-42688-P class 2.8 mdps/√Hz, datasheet). The residual angle is what is left
//    in the picture; the 1 Hz recentring is the post reframe absorbing slow residuals.
// All numbers without a source are ASSUMED; sensitivities in dev/towglider/results.json.
export const SERVO = { fs: 6, vmaxDeg: 750, tauM: 0.012, frame: 0.003, dbDeg: 0.3, blDeg: 0.5, tauEst: 0.004, sub: 0.002,
  src: 'https://www.readymaderc.com/products/details/emax-es9251-2-5g-plastic-micro-digital-servo (2.5 g, 0.08 s/60°); dead band, backlash, bandwidth ASSUMED' };
export const EIS = { syncMs: 1.0, rsReadoutMs: 25, rsResid: 0.1, ks: 0.02, noiseDps: 0.0028,
  src: 'Gyroflow-class gyro post-stabilisation (https://docs.gyroflow.xyz); ICM-42688-P noise 2.8 mdps/√Hz (TDK datasheet); sync/scale/RS residuals ASSUMED' };

// 3×3 rotation helpers (matrices as [col0, col1, col2] = body axes in world coords)
const mcol = (x, y, z) => [x, y, z];
const mT = (M) => [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];
const mv = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
const mm = (A, B) => [mv(A, B[0]), mv(A, B[1]), mv(A, B[2])];
export function expR(w) { // rotation vector → matrix (columns)
  const th = Math.hypot(w[0], w[1], w[2]);
  if (th < 1e-12) return mcol([1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const k = [w[0] / th, w[1] / th, w[2] / th], c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  const col = (e) => { const kd = k[0] * e[0] + k[1] * e[1] + k[2] * e[2], kx = cross(k, e); return [e[0] * c + kx[0] * s + k[0] * kd * C, e[1] * c + kx[1] * s + k[1] * kd * C, e[2] * c + kx[2] * s + k[2] * kd * C]; };
  return [col([1, 0, 0]), col([0, 1, 0]), col([0, 0, 1])];
}
export function logR(M) { // matrix → rotation vector (|θ| < π)
  const r = (i, j) => M[j][i]; // row i, col j
  const tr = r(0, 0) + r(1, 1) + r(2, 2), c = Math.max(-1, Math.min(1, (tr - 1) / 2)), th = Math.acos(c);
  const v = [r(2, 1) - r(1, 2), r(0, 2) - r(2, 0), r(1, 0) - r(0, 1)];
  if (th < 1e-9) return [v[0] / 2, v[1] / 2, v[2] / 2];
  const f = th / (2 * Math.sin(th)); return [v[0] * f, v[1] * f, v[2] * f];
}
export const frameOf = (x, z) => { const X = nrm(x), Z0 = nrm(z), Y = nrm(cross(Z0, X)), Z = cross(X, Y); return [X, Y, Z]; };

// Servo mount + EIS over a run. B[i], T[i]: body and target camera frames (columns, world); active[i]: filming.
// Returns per-sample camera frame C[i], camera world rate (rad/s), EIS residual angle vector (rad, world) and stats.
export function servoMountEIS(B, T, active, n, dt, { seed = 1, servo = SERVO, eis = EIS } = {}) {
  const h = servo.sub, ns = Math.max(1, Math.round(dt / h)), D = Math.PI / 180;
  const vmax = servo.vmaxDeg * D, db = servo.dbDeg * D, bl = servo.blDeg * D, ws = 2 * Math.PI * servo.fs;
  const rng = mulberry32(seed * 6151 + 29), gs = () => { const u1 = Math.max(1e-12, rng()), u2 = rng(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
  const dEff = Math.hypot(eis.syncMs, eis.rsResid * eis.rsReadoutMs / 2) / 1000; // effective timing error (s)
  const sigN = eis.noiseDps * D * Math.sqrt(0.5 / h); // white rate noise at the substep rate
  const kRe = 2 * Math.PI * STAB.recentreHz;
  const C = new Array(n), rate = new Array(n), res = new Array(n), sReqA = new Array(n), sAct = new Array(n);
  let pos = [0, 0, 0], vel = [0, 0, 0], out = [0, 0, 0], cmd = [0, 0, 0], tFrame = 0, e = [0, 0, 0], wPrev = null, Cprev = null, inited = false;
  let errSum = 0, errN = 0;
  const reqAt = (i) => logR(mm(mT(B[i]), T[i])); // servo angles needed (body coords)
  for (let i = 0; i < n; i++) sReqA[i] = reqAt(i);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    if (!inited || !active[i0]) { pos = [...sReqA[i0]]; out = [...pos]; cmd = [...pos]; vel = [0, 0, 0]; inited = true; } // not filming: the mount just parks on the target
    const dB = logR(mm(mT(B[i0]), B[i])); // body increment over the step (body coords)
    let w = [0, 0, 0], Ck = null;
    for (let k = 1; k <= ns; k++) {
      const u = k / ns, tSub = (i - 1 + u) * dt;
      // FC attitude estimate is tauEst old: the command is the requirement interpolated at t − tauEst
      const ue = Math.max(0, u - servo.tauEst / dt), sr = i === 0 ? sReqA[0] : [0, 1, 2].map((q) => sReqA[i0][q] + (sReqA[i][q] - sReqA[i0][q]) * ue);
      if (tSub >= tFrame) { cmd = sr; tFrame = tSub + servo.frame; }
      for (let q = 0; q < 3; q++) {
        const err = cmd[q] - pos[q], ae = Math.abs(err);
        const vt = ae <= db / 2 ? 0 : Math.max(-vmax, Math.min(vmax, ws * (err - Math.sign(err) * db / 2)));
        vel[q] += (vt - vel[q]) * Math.min(1, h / servo.tauM);
        pos[q] += vel[q] * h;
        if (pos[q] - out[q] > bl / 2) out[q] = pos[q] - bl / 2; else if (out[q] - pos[q] > bl / 2) out[q] = pos[q] + bl / 2;
      }
      const Bk = mm(B[i0], expR([dB[0] * u, dB[1] * u, dB[2] * u]));
      Ck = mm(Bk, expR(out));
      if (Cprev) { const dr = logR(mm(mT(Cprev), Ck)); w = mv(Cprev, [dr[0] / h, dr[1] / h, dr[2] / h]); } // world rate
      const a = wPrev ? [(w[0] - wPrev[0]) / h, (w[1] - wPrev[1]) / h, (w[2] - wPrev[2]) / h] : [0, 0, 0];
      wPrev = w; Cprev = Ck;
      if (active[i]) { // EIS residual rate: d/dt(δ·ω) + ks·ω + noise, recentred at recentreHz
        const r = [0, 1, 2].map((q) => dEff * a[q] + eis.ks * w[q] + sigN * gs());
        e = [0, 1, 2].map((q) => e[q] + (r[q] - kRe * e[q]) * h);
      } else e = [0, 0, 0];
    }
    C[i] = Ck; rate[i] = w; res[i] = e; sAct[i] = [...out];
    if (active[i]) { const er = logR(mm(mT(T[i]), Ck)); errSum += er[0] ** 2 + er[1] ** 2 + er[2] ** 2; errN++; }
  }
  return { C, rate, res, mountErrRmsDeg: errN ? Math.sqrt(errSum / errN) / D : NaN };
}
