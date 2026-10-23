// Shared environment and footage metrics for the concept lab (SIM-030).
//
// Wind: mean wind plus deterministic turbulence. Each component is a sum of
// random-phase sinusoids whose amplitudes follow a von Kármán-like spectrum
// (length scale Lu, intensity Iu = σu/Ū), so gusts are repeatable across runs.
// Footage: projects the skier (feet → helmet, shoulders) through a pinhole or
// a reframed 360° crop and reports subject size in pixels, framing offset,
// viewing azimuth/elevation relative to the skier and whether the subject is
// fully in frame. Metrics describe geometry only, not exposure or image quality.
import { mulberry32 } from '../../model/util.js';

// Calibrated 2026-10-18: Lu 28 m, Iu 0.11–0.15 flat snow / 0.2 slopes (WMO 2010, IEC);
// 48 modes from 0.005 Hz (ratio 1.13) so the 3 s gust factor approaches 1 + 2.6·Iu;
// Taylor advection: a platform moving through the field meets Doppler-shifted gusts.
export function makeWind({ mean = [0, 0, 0], intensity = 0.15, Lu = 28, seed = 7, gustAt = null, gust = [0, 0, 0], gustRise = 0.8, gustHold = 2 } = {}) {
  const rng = mulberry32(seed);
  const U = Math.max(2, Math.hypot(mean[0], mean[1], mean[2]));
  const sigma = intensity * U;
  const comps = [0, 1, 2].map((k) => {
    const modes = [];
    let norm = 0;
    for (let j = 0; j < 48; j++) {
      const f = 0.005 * Math.pow(1.13, j); // 0.005 … ~1.6 Hz (… ≈6 Hz with the top modes)
      const fn = (f * Lu) / U;
      const S = (4 * fn) / Math.pow(1 + 70.8 * fn * fn, 5 / 6) / f; // von Kármán (longitudinal shape)
      const df = f * 0.28;
      const a = Math.sqrt(S * df);
      modes.push([2 * Math.PI * f, a, rng() * 2 * Math.PI, rng() * 2 * Math.PI]);
      norm += a * a / 2;
    }
    const scale = (sigma * (k === 2 ? 0.5 : k === 1 ? 0.8 : 1)) / Math.sqrt(norm || 1);
    return { modes, scale };
  });
  const eU = Math.hypot(mean[0], mean[1], mean[2]) > 1e-6 ? [mean[0] / U, mean[1] / U, mean[2] / U] : [1, 0, 0];
  // each mode's wavefront is oblique by α ∈ ±60° to the mean wind, so a platform moving ACROSS the wind also
  // meets gusts (audit 2026-10-19 TG-13); separate rng keeps the original phases unchanged
  const rngA = mulberry32(seed * 7919 + 101);
  const ang = comps.map((c) => c.modes.map(() => { const a = (rngA() * 2 - 1) * Math.PI / 3; return [Math.cos(a), Math.sin(a)]; }));
  const eC = [-eU[1], eU[0], 0];
  return function wind(t, p = [0, 0, 0]) {
    const out = [mean[0], mean[1], mean[2]];
    const xs = p[0] * eU[0] + p[1] * eU[1] + p[2] * eU[2]; // along-wind coordinate (frozen turbulence, Taylor)
    const ys = p[0] * eC[0] + p[1] * eC[1];                  // cross-wind coordinate
    for (let k = 0; k < 3; k++) {
      let s = 0;
      const md = comps[k].modes, an = ang[k];
      for (let j = 0; j < md.length; j++) { const [w, a, ph] = md[j]; s += a * Math.sin(w * (t - (xs * an[j][0] + ys * an[j][1]) / U) + ph); }
      out[k] += s * comps[k].scale;
    }
    if (gustAt != null && t > gustAt) {
      const u = t - gustAt;
      const e = u < gustRise ? 0.5 - 0.5 * Math.cos((Math.PI * u) / gustRise) : u < gustRise + gustHold ? 1 : u < 2 * gustRise + gustHold ? 0.5 + 0.5 * Math.cos((Math.PI * (u - gustRise - gustHold)) / gustRise) : 0; // one-shot (fixed 2026-10-19: the decay cosine used to re-open periodically)
      for (let k = 0; k < 3; k++) out[k] += gust[k] * e;
    }
    return out;
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// skier silhouette points (model coords) from a skierAt() sample
export function subjectPoints(s, height = 1.75) {
  const h = s.heading, left = [-h[1], h[0], 0];
  const lean = s.lean || 0;
  const up = [left[0] * Math.sin(lean), left[1] * Math.sin(lean), Math.cos(lean)];
  const H = height * (1 - 0.16 * (s.crouch ?? 0.3));
  const P = (u, l, f = 0) => [s.pos[0] + up[0] * u + left[0] * l + h[0] * f, s.pos[1] + up[1] * u + left[1] * l + h[1] * f, s.pos[2] + up[2] * u + left[2] * l];
  return { feet: P(0, 0), head: P(H, 0), mid: P(H * 0.55, 0), shL: P(H * 0.82, 0.22), shR: P(H * 0.82, -0.22), skiTip: P(0, 0, 0.85), skiTail: P(0, 0, -0.8) };
}

// Footage geometry for one frame.
// cam: { pos, kind: 'rect' | '360', fwd?, up?, vfovDeg?, w, h, cropVfovDeg? }
//   rect: fixed lens pointing along fwd (with up), vertical FOV vfovDeg, w×h pixels
//   360 : equirectangular w×h (e.g. 5760×2880); output is a virtual crop of
//         cropVfovDeg aimed at the subject, so size is limited by angular resolution
export function footage(cam, s) {
  const pts = subjectPoints(s);
  const toSub = sub(pts.mid, cam.pos);
  const dist = Math.hypot(toSub[0], toSub[1], toSub[2]);
  // viewing geometry relative to the skier: azimuth 0 = from directly behind, ±90 = side, 180 = front
  const hz = [-toSub[0], -toSub[1]];
  const back = [-s.heading[0], -s.heading[1]];
  const az = (Math.atan2(back[0] * hz[1] - back[1] * hz[0], back[0] * hz[0] + back[1] * hz[1]) * 180) / Math.PI;
  const elev = (Math.atan2(-toSub[2], Math.hypot(toSub[0], toSub[1])) * 180) / Math.PI;
  const angH = (() => { // angular height of the subject as seen from the camera
    const a = norm(sub(pts.feet, cam.pos)), b = norm(sub(pts.head, cam.pos));
    return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  })();
  if (cam.kind === '360') {
    const pxPerRad = cam.w / (2 * Math.PI);
    const cropV = ((cam.cropVfovDeg ?? 60) * Math.PI) / 180;
    const fill = angH / cropV;
    return { dist, az, elev, subjectPx: angH * pxPerRad, cropPx: cropV * pxPerRad, fill, inFrame: fill < 0.95 ? 1 : 0, offset: 0, angSizeDeg: (angH * 180) / Math.PI };
  }
  const f = norm(cam.fwd), upv = norm(cam.up || [0, 0, 1]);
  const r = norm(cross(f, upv)), u = cross(r, f);
  const tv = Math.tan(((cam.vfovDeg ?? 60) * Math.PI) / 360), th = tv * (cam.w / cam.h);
  const proj = (p) => { const d = sub(p, cam.pos); const z = dot(d, f); if (z <= 0.05) return null; return [dot(d, r) / z / th, dot(d, u) / z / tv]; };
  const all = [pts.feet, pts.head, pts.shL, pts.shR, pts.skiTip, pts.skiTail].map(proj);
  if (all.some((p) => !p)) return { dist, az, elev, subjectPx: 0, fill: 0, inFrame: 0, offset: 1, angSizeDeg: (angH * 180) / Math.PI };
  const ys = all.map((p) => p[1]), xs = all.map((p) => p[0]);
  const inFrame = Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)) <= 1 ? 1 : 0;
  const c = proj(pts.mid);
  const subjectPx = ((Math.max(...ys) - Math.min(...ys)) / 2) * cam.h;
  // bodyPx: feet→head/shoulders only (no ski tips/tails); round-4 rule (audit3 A3-X-04) judges avail/pxMed on bodyPx
  const yb = [all[0], all[1], all[2], all[3]].map((p) => p[1]);
  const bodyPx = ((Math.max(...yb) - Math.min(...yb)) / 2) * cam.h;
  return { dist, az, elev, subjectPx, bodyPx, fill: subjectPx / cam.h, inFrame, offset: Math.hypot(c[0], c[1]), angSizeDeg: (angH * 180) / Math.PI };
}

// Line-of-sight angular rate (deg/s) of the subject as seen by a camera whose
// orientation is given per sample: high values = shaky / hard-to-watch footage.
// fwd: array of unit vectors (camera optical axis), los: array of unit vectors to subject
export function losJitter(fwdArr, losArr, dt) {
  // relative angular velocity of the line of sight in the camera: |l×l' − f×f'|/dt
  // (vector difference; the earlier magnitude difference under-read by ~25%, audit 2026-10-18)
  const rel = [];
  for (let i = 1; i < losArr.length; i++) {
    const a = cross(losArr[i - 1], losArr[i]), b = cross(fwdArr[i - 1], fwdArr[i]);
    rel.push((Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 180) / Math.PI / dt);
  }
  const rms = Math.sqrt(rel.reduce((s, v) => s + v * v, 0) / Math.max(1, rel.length));
  return { rms, max: Math.max(0, ...rel) };
}

export function stats(arr) {
  const a = Array.from(arr).filter(Number.isFinite);
  if (!a.length) return { mean: NaN, min: NaN, max: NaN, p05: NaN, p95: NaN };
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  return { mean: a.reduce((x, y) => x + y, 0) / a.length, min: s[0], max: s[s.length - 1], p05: q(0.05), p95: q(0.95) };
}
