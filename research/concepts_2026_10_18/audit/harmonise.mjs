// Shared helpers for the SIM-030 audit: harmonised metric definitions applied
// identically to every concept's per-sample output. Read-only on the models.
// Evidence: numerical post-processing of uncalibrated simulations; not a physical test.

export const D2R = Math.PI / 180;
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// 2nd-order Butterworth high-pass, applied forward and backward (zero phase)
function biquadHP(x, fc, dt) {
  const w0 = 2 * Math.PI * fc * dt, cw = Math.cos(w0), al = Math.sin(w0) / (2 * Math.SQRT1_2);
  const b0 = (1 + cw) / 2, b1 = -(1 + cw), b2 = (1 + cw) / 2, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float64Array(x.length);
  let x1 = x[0], x2 = x[0], y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
export function filtfiltHP(x, fc, dt) {
  const f = biquadHP(x, fc, dt);
  const r = biquadHP(Float64Array.from(f).reverse(), fc, dt);
  return r.reverse();
}

// Harmonised jitter: in-frame angular offset of the subject's mid-body from the
// delivered frame centre, e(t) = (u·right, u·up) [rad], over contiguous filming
// runs; zero-phase 1 Hz high-pass (removes deliberate reframing / turn-rate
// framing drift); RMS of its time derivative in deg/s. Also returns the
// unfiltered RMS rate for comparison.
// fwd[i], los[i]: unit vectors (output-frame centre after stabilisation and
// tracking; subject direction), mask[i]: 1 when filming.
export function harmonisedJitter(fwd, los, mask, dt, fc = 1.0) {
  const n = los.length;
  const ex = new Float64Array(n), ey = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (!mask[i] || !fwd[i] || !los[i]) continue;
    const f = fwd[i];
    let r = cross(f, [0, 0, 1]); const rl = len(r) || 1; r = [r[0] / rl, r[1] / rl, r[2] / rl];
    const u = cross(r, f);
    ex[i] = Math.atan2(dot(los[i], r), dot(los[i], f));
    ey[i] = Math.atan2(dot(los[i], u), dot(los[i], f));
  }
  return harmonisedJitterXY(ex, ey, mask, dt, fc);
}

// same, from precomputed in-frame offsets ex, ey (rad)
export function harmonisedJitterXY(ex, ey, mask, dt, fc = 1.0) {
  const n = ex.length;
  let s2 = 0, k = 0, s2raw = 0, kraw = 0;
  let i = 0;
  while (i < n) {
    if (!mask[i]) { i++; continue; }
    let j = i; while (j < n && mask[j]) j++;
    const L = j - i;
    if (L >= Math.round(2 / dt)) { // ≥ 2 s contiguous segment
      const sx = ex.slice(i, j), sy = ey.slice(i, j);
      const hx = filtfiltHP(sx, fc, dt), hy = filtfiltHP(sy, fc, dt);
      const edge = Math.round(0.5 / dt); // drop filter edge transients
      for (let q = 1 + edge; q < L - edge; q++) {
        const rx = (hx[q] - hx[q - 1]) / dt, ry = (hy[q] - hy[q - 1]) / dt;
        s2 += rx * rx + ry * ry; k++;
      }
      for (let q = 1; q < L; q++) {
        const rx = (sx[q] - sx[q - 1]) / dt, ry = (sy[q] - sy[q - 1]) / dt;
        s2raw += rx * rx + ry * ry; kraw++;
      }
    }
    i = j;
  }
  return { hp: k ? Math.sqrt(s2 / k) / D2R : NaN, raw: kraw ? Math.sqrt(s2raw / kraw) / D2R : NaN, n: k };
}

// The shared losJitter() takes |Δangle(los)| − |Δangle(fwd)|; the physically
// meaningful quantity is the rate of the relative direction. Vector version:
export function losJitterVector(fwdArr, losArr, dt) {
  let s = 0, k = 0;
  for (let i = 1; i < losArr.length; i++) {
    // relative LOS in the camera frame at i and i-1
    const rel = (f, l) => { let r = cross(f, [0, 0, 1]); r = nrm(r); const u = cross(r, f); return [dot(l, r), dot(l, u)]; };
    const a = rel(fwdArr[i], losArr[i]), b = rel(fwdArr[i - 1], losArr[i - 1]);
    const v = Math.hypot(a[0] - b[0], a[1] - b[1]) / dt / D2R;
    s += v * v; k++;
  }
  return k ? Math.sqrt(s / k) : NaN;
}
export function losJitterShared(fwdArr, losArr, dt) {
  let s = 0, k = 0;
  for (let i = 1; i < losArr.length; i++) {
    const da = Math.acos(Math.max(-1, Math.min(1, dot(losArr[i], losArr[i - 1]))));
    const df = Math.acos(Math.max(-1, Math.min(1, dot(fwdArr[i], fwdArr[i - 1]))));
    const v = Math.abs(da - df) / D2R / dt; s += v * v; k++;
  }
  return k ? Math.sqrt(s / k) : NaN;
}

// Harmonised thresholds (see criteria.json)
export const TH = {
  avail: 80, pxMed: 300, jitterRms: 3.0, azRange: 45, addedMass: 1.5, bodyForcePeak: 40,
  handsBusy: 5, setupTime: 30, ops: 2, keMax: 14.9, endurance: 45,
};

export const r3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? +x.toFixed(3) : x);

// Harmonised jitter (adopted definition, see criteria.json): >1 Hz part of the
// INERTIAL line-of-sight angular rate camera→subject (what no gimbal, EIS or
// subject-lock reframe can remove: it can only be shown as subject shake or as
// scene shake), combined in quadrature with the residual un-stabilised camera
// rotation rate. los[i]: unit vectors; resid[i]: residual rotation rate (deg/s,
// magnitude) or null; mask[i]: filming.
export function jitterLOS(los, resid, mask, dt, fc = 1.0) {
  const n = los.length;
  const az = new Float64Array(n), el = new Float64Array(n);
  let prevAz = null;
  for (let i = 0; i < n; i++) {
    if (!mask[i] || !los[i]) { prevAz = null; continue; }
    const l = los[i];
    let a = Math.atan2(l[1], l[0]);
    if (prevAz !== null) { while (a - prevAz > Math.PI) a -= 2 * Math.PI; while (a - prevAz < -Math.PI) a += 2 * Math.PI; }
    prevAz = a; az[i] = a; el[i] = Math.asin(Math.max(-1, Math.min(1, l[2])));
  }
  let s2 = 0, k = 0, s2r = 0, kr = 0, sLos = 0;
  let i = 0;
  while (i < n) {
    if (!mask[i]) { i++; continue; }
    let j = i; while (j < n && mask[j]) j++;
    const L = j - i;
    if (L >= Math.round(2 / dt)) {
      const ce = Float64Array.from({ length: L }, (_, q) => Math.cos(el[i + q]));
      const ax = Float64Array.from({ length: L }, (_, q) => az[i + q]);
      const ey = el.slice(i, j);
      const hx = filtfiltHP(ax, fc, dt), hy = filtfiltHP(ey, fc, dt);
      const edge = Math.round(0.5 / dt);
      for (let q = 1 + edge; q < L - edge; q++) {
        const rx = ((hx[q] - hx[q - 1]) / dt) * ce[q], ry = (hy[q] - hy[q - 1]) / dt;
        const losHP = (rx * rx + ry * ry) / (D2R * D2R);
        const rr = resid && Number.isFinite(resid[i + q]) ? resid[i + q] : 0;
        s2 += losHP + rr * rr; sLos += losHP; k++;
        const rxr = ((ax[q] - ax[q - 1]) / dt) * ce[q], ryr = (ey[q] - ey[q - 1]) / dt;
        s2r += (rxr * rxr + ryr * ryr) / (D2R * D2R); kr++;
      }
    }
    i = j;
  }
  return { jitter: k ? Math.sqrt(s2 / k) : NaN, losHP: k ? Math.sqrt(sLos / k) : NaN, losRawRate: kr ? Math.sqrt(s2r / kr) : NaN, n: k };
}
