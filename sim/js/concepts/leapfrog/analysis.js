// leapfrog footage chain (iteration 3): what the product really outputs.
//   sensor  : shared 4K 16:9 module (3840×2160) behind a 22° lens on a pan/tilt gimbal; the gimbal is pointed causally
//             at the fused UWB-AoA + GNSS + height-geometry estimate of the rider (model.js, sourced error model) and
//             leaks body motion through its 1st-order loop.
//   output  : a 1080p crop reframed in post (phone app): the crop follows a zero-phase low-pass of the subject line
//             of sight found by vision tracking in the recorded file, gyro EIS removes all but eisRes of the sensor's
//             own rotation, roll is levelled digitally, and the crop must stay inside the sensor (it is clamped,
//             shrunk to fill ≤0.6, or the horizon stays tilted). Subject px are capped by native sensor rows.
// Jitter is computed on that crop (°/s and % of crop height per second). Numerical-uncalibrated; the EIS residual,
// gimbal bandwidth and post smoother are ASSUMED (sensitivity runs in results.json).
import { footage, subjectPoints } from '../common/env.js';
import { PHASE } from './model.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// 2nd-order Butterworth low/high-pass (bilinear), forward–backward (zero phase)
function biquad(x, fc, dt, high) {
  const K = Math.tan(Math.PI * fc * dt), Q = Math.SQRT1_2, norm = 1 / (1 + K / Q + K * K);
  const b0 = high ? norm : K * K * norm, b1 = high ? -2 * norm : 2 * K * K * norm, b2 = b0;
  const a1 = 2 * (K * K - 1) * norm, a2 = (1 - K / Q + K * K) * norm;
  const pass = (s) => { const y = new Float64Array(s.length); let x1 = s[0], x2 = s[0], y1 = high ? 0 : s[0], y2 = y1; for (let i = 0; i < s.length; i++) { const v = b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = s[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const f = pass(x); f.reverse(); const r = pass(f); r.reverse(); return r;
}
export const lowpassZP = (x, fc, dt) => biquad(x, fc, dt, false);
export const highpassZP = (x, fc, dt) => biquad(x, fc, dt, true);

// apply fn(segmentArray) to each contiguous masked segment of each vector component (unmasked samples untouched)
function segFilter(vecs, mask, fn) {
  const n = vecs.length, out = vecs.map((v) => [...v]);
  let i = 0;
  while (i < n) {
    if (!mask[i]) { i++; continue; }
    let j = i; while (j < n && mask[j]) j++;
    if (j - i >= 4) for (let k = 0; k < 3; k++) { const s = Float64Array.from({ length: j - i }, (_, q) => vecs[i + q][k]); const f = fn(s); for (let q = 0; q < j - i; q++) out[i + q][k] = f[q]; }
    i = j;
  }
  return out;
}

// largest crop VFOV h (rad) whose 16:9 rectangle rotated by phi fits a sensor of half-extents (sh, sv) with offset (ox, oy)
function fitsCrop(h, phi, sh, sv) {
  const hv = h / 2, hw = Math.atan(Math.tan(hv) * 16 / 9);
  const c = Math.abs(Math.cos(phi)), s = Math.abs(Math.sin(phi));
  return { allowH: sh - (hw * c + hv * s), allowV: sv - (hw * s + hv * c) };
}

export function analyse(core, p) {
  const { O, n } = core;
  const dt = 0.02;
  const cols = {};
  for (const k of ['subjectPx', 'nativePx', 'inFrame', 'az', 'elev', 'dist', 'usable', 'front', 'active', 'lx', 'ly', 'lz', 'ox', 'oy', 'oz', 'cropV', 'tilt', 'clamp', 'keSnow', 'keRel', 'riderSpeed', 'skiing', 'loss']) cols[k] = new Float64Array(n).fill(NaN);
  const sensV = core.sensorV, sensH = 2 * Math.atan(Math.tan((p.camHfov * D2R) / 2));
  const los = [], sen = [], ang = [], camOn = new Uint8Array(n), S = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const s = core.rider(t); S.push(s);
    const ph = O.phase[i];
    const skiing = s.speed > 2 && !s.fallen && ph !== PHASE.PICKUP ? 1 : 0;
    cols.skiing[i] = skiing; cols.riderSpeed[i] = s.speed;
    const v2 = O.vx[i] ** 2 + O.vy[i] ** 2 + O.vz[i] ** 2;
    cols.keSnow[i] = 0.5 * p.mass * v2;
    cols.keRel[i] = 0.5 * p.mass * ((O.vx[i] - s.vel[0]) ** 2 + (O.vy[i] - s.vel[1]) ** 2 + (O.vz[i] - s.vel[2]) ** 2);
    camOn[i] = ph !== PHASE.STOWED && ph !== PHASE.PICKUP ? 1 : 0;
    const pts = subjectPoints(s);
    const c = [O.cx[i], O.cy[i], O.cz[i]];
    los.push(nrm([pts.mid[0] - c[0], pts.mid[1] - c[1], pts.mid[2] - c[2]]));
    sen.push([O.fx[i], O.fy[i], O.fz[i]]);
    const a = nrm([pts.feet[0] - c[0], pts.feet[1] - c[1], pts.feet[2] - c[2]]), b = nrm([pts.head[0] - c[0], pts.head[1] - c[1], pts.head[2] - c[2]]);
    ang.push(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))));
  }
  // ---- post reframing: smoothed subject direction + EIS residual of the sensor's own rotation
  // the post smoother follows the rider's turn rhythm: cut-off = max(frameLPHz, 3 × turn-pair frequency from lateral-acceleration sign changes)
  let nCross = 0, tRide = 0, prevSgn = 0;
  for (let i = 0; i < n; i++) { if (S[i].speed > 2) { tRide += dt; const sg = Math.sign(S[i].lat || 0); if (sg && prevSgn && sg !== prevSgn) nCross++; if (sg) prevSgn = sg; } }
  const fTurn = tRide > 3 ? nCross / (2 * tRide) : 0;
  const fc = Math.min(2, Math.max(p.frameLPHz, 3 * fTurn));
  const losLP = segFilter(los, camOn, (x) => lowpassZP(x, fc, dt));
  const senLP = segFilter(sen, camOn, (x) => lowpassZP(x, fc, dt));
  // zoom follows the turn-apex (smallest) subject size over ±1 s, smoothed: the crop does not pump with every edge change
  const angMin = (() => { const o = new Float64Array(n), W = 50; for (let i = 0; i < n; i++) { let m = Infinity; for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) if (camOn[k] && ang[k] < m) m = ang[k]; o[i] = Number.isFinite(m) ? m : ang[i]; } return o; })();
  const angLP = (() => { const a = angMin; const o = new Float64Array(n); let i = 0; while (i < n) { if (!camOn[i]) { o[i] = a[i]; i++; continue; } let j = i; while (j < n && camOn[j]) j++; const f = j - i >= 4 ? lowpassZP(a.subarray(i, j), 0.3, dt) : a.subarray(i, j); for (let q = 0; q < j - i; q++) o[i + q] = f[q]; i = j; } return o; })();
  // ---- round 4 (audit3 A3-LF-02): LIVE framing with a modelled tracker (postFrame 2, default). The crop centre follows a
  // causal 2nd-order tracker of the MEASURED subject line of sight: while the on-board detector holds the rider (core
  // O.vis) a detection arrives every 1/detHz s, detLat s late, with white bbox-centre noise detSig × subject angular height
  // plus a slowly wandering pose bias (bbox centre ≠ body centre; detBias × height, τ 1 s); without a lock the measurement
  // is the fused UWB/GNSS/height estimate (core eYaw/ePitch). The tracker predicts over the latency with its own velocity.
  // EIS residual: eisRes × the sensor's rotation relative to a CAUSAL 1 Hz low-pass. Zoom: causal min-hold of the measured
  // subject size. postFrame 1 (offline, true LOS) and 0 (sensor centre) remain as labelled sensitivities.
  const live = p.postFrame === 2;
  let losLive = null, senLc = null, angLive = null;
  if (live) {
    let st = 987654321 >>> 0;
    const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let x = st; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const gs = () => { const u = Math.max(1e-12, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const rot = (l, ey, ep) => { // perturb a unit LOS by small yaw/pitch angles
      const h = Math.hypot(l[0], l[1]) || 1e-9, az = Math.atan2(l[1], l[0]) + ey, el = Math.atan2(l[2], h) + ep;
      return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    };
    const latN = Math.max(0, Math.round(p.detLat / dt)), every = Math.max(1, Math.round(1 / (p.detHz * dt)));
    const wn = 2 * Math.PI * p.liveHz, z = 0.9, aB = Math.exp(-dt / 1.0);
    losLive = new Array(n); senLc = new Array(n); angLive = new Float64Array(n);
    let x = null, v = [0, 0, 0], meas = null, bY = 0, bP = 0, sl = null, aHold = null; const eV = [0, 0, 0];
    const A_dist = (i) => { const c = [O.cx[i], O.cy[i], O.cz[i]]; const m = subjectPoints(S[i]).mid; return Math.hypot(m[0] - c[0], m[1] - c[1], m[2] - c[2]); };
    for (let i = 0; i < n; i++) {
      if (!camOn[i]) { x = null; sl = null; aHold = null; losLive[i] = los[i]; senLc[i] = sen[i]; angLive[i] = ang[i]; continue; }
      bY = bY * aB + p.detBias * Math.sqrt(1 - aB * aB) * gs(); bP = bP * aB + p.detBias * Math.sqrt(1 - aB * aB) * gs();
      const j = Math.max(0, i - latN);
      if (i % every === 0 || meas == null) {
        const vis = O.vis ? O.vis[j] === 1 : false;
        const sg = p.detSig * ang[j];
        meas = vis ? rot(los[j], (gs() * p.detSig + bY) * ang[j], (gs() * p.detSig + bP) * ang[j]) : rot(los[j], O.eYaw ? O.eYaw[j] : 0, O.ePitch ? O.ePitch[j] : 0);
        void sg;
        const aM = ang[j] * (1 + 0.04 * gs());
        aHold = aHold == null ? aM : aHold;
        aHold = Math.min(aM, aHold + (aM - aHold) * Math.min(1, (every * dt) / 1.5)); // shrinks at once, grows over 1.5 s
      }
      if (!x) { x = [...meas]; v = [0, 0, 0]; }
      if (p.liveFF) {
        // feed-forward of the LOS rate predicted from GNSS relative velocity (rider phone + glider, ffLat s old, Gauss–Markov
        // velocity error σ ffSigV, τ 1 s, projected over the range) + 1st-order correction towards the detections (liveHz)
        const aV = Math.exp(-dt / 1.0), dist = Math.max(3, A_dist(i));
        for (let k = 0; k < 3; k++) eV[k] = eV[k] * aV + p.ffSigV * Math.sqrt(1 - aV * aV) * gs();
        const jf = Math.max(1, i - Math.round(p.ffLat / dt));
        const ff = [los[jf][0] - los[jf - 1][0] + eV[0] * dt / dist, los[jf][1] - los[jf - 1][1] + eV[1] * dt / dist, los[jf][2] - los[jf - 1][2] + eV[2] * dt / dist];
        const kc = 1 - Math.exp(-dt * 2 * Math.PI * p.liveHz);
        for (let k = 0; k < 3; k++) x[k] += ff[k] + kc * (meas[k] + (los[i][k] - los[j][k]) - x[k]); // detections are latency-compensated with the same prediction
        losLive[i] = nrm(x); x = losLive[i].slice();
      } else {
        for (let k = 0; k < 3; k++) { const r = meas[k] - x[k]; x[k] += (v[k] + 2 * z * wn * r) * dt; v[k] += wn * wn * r * dt; }
        const pr = latN * dt;
        losLive[i] = nrm([x[0] + v[0] * pr, x[1] + v[1] * pr, x[2] + v[2] * pr]);
      }
      sl = sl ? sl.map((q, k) => q + (sen[i][k] - q) * Math.min(1, dt * 2 * Math.PI * 1.0)) : [...sen[i]];
      senLc[i] = sl;
      angLive[i] = aHold;
    }
  }
  const rollRes = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ph = O.phase[i];
    if (!camOn[i]) { cols.active[i] = 0; cols.usable[i] = 0; cols.front[i] = 0; cols.loss[i] = 6; continue; }
    const s = S[i];
    const fs = sen[i];
    // desired crop direction
    // live framing (postFrame 0): the output is the sensor centre (turret pointing incl. UWB error, latency, gimbal residual)
    const LL = live ? losLive[i] : losLP[i], SL = live ? senLc[i] : senLP[i];
    let d = !p.postFrame ? [...fs] : nrm([LL[0] + p.eisRes * (fs[0] - SL[0]), LL[1] + p.eisRes * (fs[1] - SL[1]), LL[2] + p.eisRes * (fs[2] - SL[2])]);
    // sensor frame (pan/tilt: image up from the body up vector)
    const ub = [O.ux[i], O.uy[i], O.uz[i]];
    let ta = cross(fs, ub); if (Math.hypot(...ta) < 1e-6) ta = cross(fs, [0, 0, 1]);
    const right = nrm(ta), up = nrm(cross(right, fs));
    const phi = O.rollImg[i] * D2R;
    // crop size: subject fill p.fill, ≥ cropMin, ≤ what fits the sensor when rotated by the roll correction; shrink to fill 0.6 before giving up roll
    const aZ = live ? angLive[i] : angLP[i];
    let h = Math.max(p.cropMinDeg * D2R, aZ / p.fill);
    h = Math.min(h, sensV * 0.98);
    let phiC = phi;
    let fit = fitsCrop(h, phiC, sensH / 2, sensV / 2);
    if (fit.allowH < 0 || fit.allowV < 0) {
      const hMin = Math.max(p.cropMinDeg * D2R, aZ / 0.6);
      let lo = hMin, hi = h;
      if (fitsCrop(lo, phiC, sensH / 2, sensV / 2).allowV >= 0 && fitsCrop(lo, phiC, sensH / 2, sensV / 2).allowH >= 0) {
        for (let it = 0; it < 20; it++) { const mid = (lo + hi) / 2; const f = fitsCrop(mid, phiC, sensH / 2, sensV / 2); if (f.allowH >= 0 && f.allowV >= 0) lo = mid; else hi = mid; }
        h = lo;
      } else {
        h = hMin; let a0 = 0, a1 = Math.abs(phi);
        for (let it = 0; it < 20; it++) { const mid = (a0 + a1) / 2; const f = fitsCrop(h, mid, sensH / 2, sensV / 2); if (f.allowH >= 0 && f.allowV >= 0) a0 = mid; else a1 = mid; }
        phiC = Math.sign(phi) * a0;
      }
      fit = fitsCrop(h, phiC, sensH / 2, sensV / 2);
    }
    const tilt = Math.abs(phi - phiC) * R2D;
    rollRes[i] = (phi - phiC) * R2D;
    // the crop centre must stay inside the sensor: first zoom in (down to fill 0.6), then clamp (crop follows the sensor edge)
    const az = Math.atan2(dot(d, right), dot(d, fs)), el = Math.asin(Math.max(-1, Math.min(1, dot(d, up))));
    if (Math.abs(az) > fit.allowH || Math.abs(el) > fit.allowV) {
      const hMin = Math.max(p.cropMinDeg * D2R, aZ / 0.6);
      const ok = (hh) => { const f2 = fitsCrop(hh, phiC, sensH / 2, sensV / 2); return Math.abs(az) <= f2.allowH && Math.abs(el) <= f2.allowV; };
      if (ok(hMin)) { let lo = hMin, hi = h; for (let it = 0; it < 20; it++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; } h = lo; }
      else h = Math.min(h, hMin);
      fit = fitsCrop(h, phiC, sensH / 2, sensV / 2);
    }
    cols.clamp[i] = Math.abs(az) > fit.allowH || Math.abs(el) > fit.allowV ? 1 : 0;
    const azc = Math.max(-Math.max(0, fit.allowH), Math.min(Math.max(0, fit.allowH), az)), elc = Math.max(-Math.max(0, fit.allowV), Math.min(Math.max(0, fit.allowV), el));
    if (azc !== az || elc !== el) d = nrm([fs[0] * Math.cos(elc) * Math.cos(azc) + right[0] * Math.cos(elc) * Math.sin(azc) + up[0] * Math.sin(elc), fs[1] * Math.cos(elc) * Math.cos(azc) + right[1] * Math.cos(elc) * Math.sin(azc) + up[1] * Math.sin(elc), fs[2] * Math.cos(elc) * Math.cos(azc) + right[2] * Math.cos(elc) * Math.sin(azc) + up[2] * Math.sin(elc)]);
    const cropDeg = h * R2D;
    const cam = { kind: 'rect', pos: [O.cx[i], O.cy[i], O.cz[i]], fwd: d, up: [0, 0, 1], vfovDeg: cropDeg, w: 1920, h: 1080 };
    const fp = footage(cam, s);
    const nativeRows = h * core.nativePxRad;
    const px = fp.bodyPx * Math.min(1, nativeRows / 1080); // round 4 (A3-X-04): feet→head/shoulders, no ski tips
    const native = (fp.angSizeDeg * D2R) * core.nativePxRad;
    const buried = O.sink[i] > 0.05;
    const active = O.occl[i] ? 0 : O.spray[i] ? 0 : buried ? 0 : 1;
    cols.subjectPx[i] = px; cols.nativePx[i] = native; cols.inFrame[i] = fp.inFrame; cols.az[i] = fp.az; cols.elev[i] = fp.elev; cols.dist[i] = fp.dist;
    cols.active[i] = active; cols.cropV[i] = cropDeg; cols.tilt[i] = tilt;
    const tiltOK = tilt <= p.tiltMaxDeg;
    const ok = active && fp.inFrame === 1 && px >= 300 && tiltOK ? 1 : 0;
    // loss reason: 1 occluded by the airframe, 2 touchdown spray, 3 buried, 4 subject outside the crop, 5 too far (<300 px), 7 horizon tilt
    cols.loss[i] = ok ? 0 : O.occl[i] ? 1 : O.spray[i] ? 2 : buried ? 3 : fp.inFrame !== 1 ? 4 : px < 300 ? 5 : 7;
    cols.usable[i] = ok;
    cols.front[i] = ok && Math.abs(fp.az) >= 120 ? 1 : 0;
    cols.lx[i] = los[i][0]; cols.ly[i] = los[i][1]; cols.lz[i] = los[i][2];
    cols.ox[i] = d[0]; cols.oy[i] = d[1]; cols.oz[i] = d[2];
    void ph;
  }
  cols.rollRes = rollRes;
  return cols;
}

// >1 Hz relative angular rate of the subject line of sight in the output crop, per sample (°/s) and per crop height (%/s);
// same construction as criteria.jitterHP (vector cross-product rate, 2nd-order HP at 1 Hz per component over ≥2 s
// masked segments, 0.5 s edges dropped) but also normalised by the crop VFOV of each sample (audit LF-01 / X-05).
export function jitterNorm(los, fwd, cropV, mask, dt = 0.02, fc = 1) {
  const n = los.length;
  const w = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let i = 1; i < n; i++) { const a = cross(los[i - 1], los[i]), b = cross(fwd[i - 1], fwd[i]); for (let k = 0; k < 3; k++) w[k][i] = (a[k] - b[k]) / dt; }
  let s1 = 0, s2 = 0, cnt = 0;
  const edge = Math.round(0.5 / dt), minLen = Math.round(2 / dt);
  let i = 0;
  while (i < n) {
    if (!mask[i]) { i++; continue; }
    let j = i; while (j < n && mask[j]) j++;
    if (j - i >= minLen) {
      const seg = w.map((c) => { const x = Float64Array.from(c.subarray(i, j)); x[0] = x[1]; return x; });
      const f = seg.map((c) => highpassZP(c, fc, dt));
      for (let k = edge; k < j - i - edge; k++) {
        const r = Math.sqrt(f[0][k] ** 2 + f[1][k] ** 2 + f[2][k] ** 2) * R2D;
        s1 += r * r; s2 += (100 * r / cropV[i + k]) ** 2; cnt++;
      }
    }
    i = j;
  }
  return { rmsDeg: cnt ? Math.sqrt(s1 / cnt) : NaN, rmsPct: cnt ? Math.sqrt(s2 / cnt) : NaN, samples: cnt };
}

// >1 Hz rate of the residual (uncorrected) horizon tilt plus EIS residual of the levelled roll (°/s)
export function rollJitter(rollImg, rollRes, mask, eisRes, dt = 0.02) {
  const n = rollImg.length;
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = (Number.isFinite(rollRes[i]) ? rollRes[i] : 0) + eisRes * (Number.isFinite(rollImg[i]) ? rollImg[i] : 0);
  let s = 0, cnt = 0, i = 0;
  while (i < n) {
    if (!mask[i]) { i++; continue; }
    let j = i; while (j < n && mask[j]) j++;
    if (j - i >= 100) {
      const rate = new Float64Array(j - i); for (let k = 1; k < j - i; k++) rate[k] = (r[i + k] - r[i + k - 1]) / dt; rate[0] = rate[1];
      const f = highpassZP(rate, 1, dt);
      for (let k = 25; k < j - i - 25; k++) { s += f[k] ** 2; cnt++; }
    }
    i = j;
  }
  return cnt ? Math.sqrt(s / cnt) : NaN;
}

// Poisson exposure of other skiers to the perched and flying glider (analytic, ASSUMED densities; audit LF-05).
// A static object is passed within r by a stream of skiers of areal density ρ at mean speed v̄: rate = ρ·v̄·2r.
export function exposure({ perchS, flyS, densities = { low: 0.1, medium: 0.3, high: 1.0 }, vBar = 10, rPerch = 3, rFly = 5, detect = 0.8 }) {
  const out = {};
  for (const [k, per1000m2] of Object.entries(densities)) {
    const rho = per1000m2 / 1000;
    const perch = rho * vBar * 2 * rPerch * perchS;
    const fly = rho * vBar * 2 * rFly * flyS;
    out[k] = { skiersPer1000m2: per1000m2, perchPassesWithin3m: +perch.toFixed(3), flightPassesWithin5m: +fly.toFixed(3), afterAvoidance: +((perch + fly) * (1 - detect)).toFixed(3) };
  }
  return out;
}
