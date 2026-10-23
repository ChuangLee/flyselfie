// K2 kite: per-sample footage and safety geometry from a runCore() result.
// Camera: 4K rectilinear on a 0.12 m side arm of the KCU pod at the bridle
// confluence; the pod hangs on the tensioned line, so its axis points along the
// tether towards the pack (2nd-order pendulum lag + canopy flutter, ASSUMED).
// The product records the full wide frame with gyro data (EIS); the delivered
// 1080p clip is a reframed crop aimed at the rider, computed after the run with
// a zero-phase 1 Hz smoother of the measured line of sight (like Gyroflow +
// subject reframing). Crop never exceeds 1:1 native pixels. Tether artefact:
// projection of the 0.5 mm line into the delivered crop and overlap with the
// rider's silhouette capsules (≥1 px width counts). Numerical geometry only.
import { bodyPoints } from '../common/skier.js';
import { footage, subjectPoints } from '../common/env.js';
import { artefactCounts } from '../common/fullrun.js';
import { V, bodyCapsules, MODE } from './model.js';

const { sub, add, mul, dot, len, nrm, cross } = V;
const D2R = Math.PI / 180;

// zero-phase 2nd-order Butterworth low-pass applied to a scalar series
export function lpZero(x, fc, dt) {
  const K = Math.tan(Math.PI * fc * dt), Q = Math.SQRT1_2, nn = 1 / (1 + K / Q + K * K);
  const b0 = K * K * nn, b1 = 2 * b0, b2 = b0, a1 = 2 * (K * K - 1) * nn, a2 = (1 - K / Q + K * K) * nn;
  const pass = (s) => { const y = new Float64Array(s.length); let x1 = s[0], x2 = s[0], y1 = s[0], y2 = s[0]; for (let i = 0; i < s.length; i++) { const v = b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = s[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const f = pass(Float64Array.from(x)); f.reverse(); const r = pass(f); r.reverse(); return r;
}

const FILMING = new Set([MODE.LAUNCH, MODE.FILM, MODE.PARK, MODE.RETRIEVE]);

export function analyse(core, opts = {}) {
  const { O, n, SDT, rider, p } = core;
  const out = {};
  const keys = ['crossH3', 'bodyPx', 'artF', 'subjectPx', 'inFrame', 'inNative', 'az', 'elev', 'dist', 'vfov', 'art', 'artW', 'filming', 'headDist', 'bodyDist', 'headClear', 'boomHead', 'keSnow', 'keRel', 'lx', 'ly', 'lz', 'fx', 'fy', 'fz', 'cpx', 'cpy', 'cpz', 'pax', 'pay', 'paz', 'crossH1', 'crossH2', 'clearBody'];
  for (const k of keys) out[k] = new Float64Array(n).fill(NaN);
  const hf = (p.hfov / 2) * D2R;
  const fpxN = (p.nativeW / 2) / Math.tan(hf);              // native px per unit tangent
  const vfFull = 2 * Math.atan(Math.tan(hf) * 9 / 16) / D2R; // full native vertical FOV
  const vfMin = 2 * Math.atan(540 / fpxN) / D2R;             // 1:1 native crop for a 1080-line output
  // pod axis: 2nd-order lag of the tether direction (ω 12 rad/s, ζ 0.45) + flutter (ASSUMED 0.4° rms, 6–14 Hz)
  let pa = null, pav = [0, 0, 0];
  const w0 = 12, ze = 0.45;
  const C = [], L = [], S = [];
  for (let i = 0; i < n; i++) {
    const t = i * SDT, md = O.mode[i];
    const s = core.RS ? core.RS[i] : rider(t); S.push(s);
    const K = [O.kx[i], O.ky[i], O.kz[i]], A = [O.ax[i], O.ay[i], O.az[i]];
    const b = core.RB ? core.RB[i] : bodyPoints(s);
    // judged helmet point (round 4, A3-X-03): shared helmetAt(sk, t) on the raw shared run when the caller provides it
    const H = opts.helmet ? opts.helmet(t) : b.head;
    out.headDist[i] = len(sub(K, H)) - 0.14 - 0.05;
    // distance of the KCU from every body capsule (KE frame switch at 1.5 m)
    { const caps = bodyCapsules(s, b); let d = Infinity; for (const [a, c, r] of caps) d = Math.min(d, segSeg(K, K, a, c) - r); out.bodyDist[i] = d; }
    // headClear (criteria.js, re-audit 2026-10-20): helmet CENTRE to the airborne kite (KCU, canopy disc) and the line
    // beyond the boom tip; the boom is a worn rigid part (reported separately as boomHead). Excluded: docked, the boom
    // extending with the canopy still in its sleeve (EXTEND, nothing airborne) and the declared ≤3 s dock-capture
    // window (final 0.6 m slide onto the tip ≈0.3 s + STOW: seat → snuffed → boom retracted 2.5 s; ≤2.8 s in total).
    const finalSeat = md === MODE.FLAGDOCK && O.L[i] <= 0.6; // last 0.6 m onto the boom tip (≈0.3 s) — part of the declared ≤3 s capture window
    if (md !== MODE.DOCKED && md !== MODE.STOW && md !== MODE.EXTEND && !finalSeat && O.brake[i] < 2) {
      const er0 = [O.ex[i], O.ey[i], O.ez[i]], P = core.useBoom ? [O.px[i], O.py[i], O.pz[i]] : A;
      const via = Number.isFinite(O.sx[i]) ? [O.sx[i], O.sy[i], O.sz[i]] : null;
      const dLine = via ? Math.min(segSeg(A, via, H, H), segSeg(via, K, H, H)) : segSeg(A, K, H, H);
      const span = Math.sqrt((4 * p.S) / Math.PI), inf = Math.max(0.2, O.infl[i] || 0);
      const cc = add(K, mul(er0, 0.7 * (md === MODE.LANDED ? 0.3 : 1))), dCan = len(sub(cc, H)) - 0.5 * span * inf;
      out.headClear[i] = Math.min(dLine, len(sub(K, H)) - 0.05, dCan);
      if (core.useBoom) out.boomHead[i] = segSeg(P, A, H, H);
    }
    const vk = [O.kvx[i], O.kvy[i], O.kvz[i]];
    out.keSnow[i] = 0.5 * p.mass * dot(vk, vk);
    const rv = sub(vk, s.vel); out.keRel[i] = 0.5 * p.mass * dot(rv, rv);
    const filming = FILMING.has(md) && O.infl[i] > 0.9 && O.flag[i] < 0.3 && O.L[i] > 2;
    out.filming[i] = filming ? 1 : 0;
    // clothesline check: height above the snow of the boom + line assembly 1 m and 2 m (horizontal) behind the boom pivot
    // on the pack (iteration 3 measures from the pack, not from the exit, so the boom itself counts as an obstacle)
    const er = [O.ex[i], O.ey[i], O.ez[i]];
    if (md !== MODE.DOCKED && md !== MODE.STOW && md !== MODE.EXTEND && O.brake[i] < 2) {
      const P0 = core.useBoom ? [O.px[i], O.py[i], O.pz[i]] : A;
      if (len(sub(K, A)) > 2.5) {
        const poly = [P0, A, K];
        for (const [dd, key] of [[1, 'crossH1'], [2, 'crossH2'], [3, 'crossH3']]) {
          for (let k = 0; k + 1 < poly.length; k++) {
            const a0 = poly[k], a1 = poly[k + 1];
            const h0 = Math.hypot(a0[0] - P0[0], a0[1] - P0[1]), h1 = Math.hypot(a1[0] - P0[0], a1[1] - P0[1]);
            if ((h0 - dd) * (h1 - dd) <= 0 && Math.abs(h1 - h0) > 1e-6) { const u = (dd - h0) / (h1 - h0); const Q = add(a0, mul(sub(a1, a0), u)); out[key][i] = Q[2] + Q[0] * core.tanS; break; }
          }
        }
      }
      // tether-to-body clearance (beyond the first 0.3 m out of the dock)
      const caps = bodyCapsules(s, b); let cb = Infinity;
      const Pc = add(A, mul(er, 0.3));
      for (const [a, c, r, nm] of caps) { if (nm === 'pack') continue; cb = Math.min(cb, segSeg(Pc, K, a, c) - r); }
      out.clearBody[i] = cb;
    }
    if (!filming) { pa = null; C.push(null); L.push(null); continue; }
    // pod axis dynamics
    const tgt = mul(er, -1);
    if (!pa) { pa = tgt.slice(); pav = [0, 0, 0]; }
    const acc = sub(mul(sub(tgt, pa), w0 * w0), mul(pav, 2 * ze * w0));
    pav = add(pav, mul(acc, SDT)); pa = nrm(add(pa, mul(pav, SDT)));
    const fl = 0.4 * D2R * (Math.sin(2 * Math.PI * 7.3 * t + 1.1) + 0.7 * Math.sin(2 * Math.PI * 11.9 * t + 2.3)) / 1.22;
    const side = nrm(cross(er, [0, 0, 1]));
    // fixed boresight: the camera is mounted tilted camTilt° down from the line axis (the rider sits below the boom tip as
    // seen from the kite; measured mean offset 2–3°), so the reframing crop has symmetric room inside the native frame
    const upC = nrm(cross(side, pa));
    const paF = nrm(add(add(pa, mul(side, fl)), mul(upC, Math.tan((p.camTilt ?? 0) * D2R))));
    const cam = add(add(K, mul(side, p.camOff)), [0, 0, -0.03]);
    // reframing target (round 4): centre of the whole subject incl. ski tips/tails (bounding-box centre), not the 55 % body point
    const sp = subjectPoints(s), pts = [sp.feet, sp.head, sp.shL, sp.shR, sp.skiTip, sp.skiTail];
    const mid = [0, 1, 2].map((k) => pts.reduce((a, q) => a + q[k], 0) / pts.length);
    const los = nrm(sub(mid, cam));
    C.push(cam); L.push(los);
    out.pax[i] = paF[0]; out.pay[i] = paF[1]; out.paz[i] = paF[2];
    out.cpx[i] = cam[0]; out.cpy[i] = cam[1]; out.cpz[i] = cam[2];
    out.lx[i] = los[0]; out.ly[i] = los[1]; out.lz[i] = los[2];
  }
  // delivered crop direction: zero-phase low-pass of the LOS over each filming segment (post reframing)
  let i = 0;
  while (i < n) {
    if (!L[i]) { i++; continue; }
    let j = i; while (j < n && L[j]) j++;
    const comp = [0, 1, 2].map((k) => { const a = new Float64Array(j - i); for (let q = i; q < j; q++) a[q - i] = L[q][k]; return j - i > 8 ? lpZero(a, opts.fc ?? 1.0, SDT) : a; });
    // crop size: subject vertical extent ≈ 50 % of the output height, within [1:1 native, full native]
    const want = new Float64Array(j - i);
    for (let q = i; q < j; q++) {
      const f0 = footage({ pos: C[q], kind: 'rect', fwd: L[q], up: [0, 0, 1], vfovDeg: 40, w: 1920, h: 1080 }, S[q]);
      // round 4: frame the BODY (feet→head/shoulders, the judged bodyPx) at ≈60 % of the output height while the whole
      // subject incl. ski tips stays inside 85 % of it (the product's own reframing choice; live-feasible from the LOS)
      const bodyDeg = ((f0.bodyPx ?? f0.subjectPx) / 1080) * 40, subjDeg = (f0.subjectPx / 1080) * 40;
      want[q - i] = Math.max(vfMin, Math.min(vfFull * 0.8, Math.max(bodyDeg / (opts.bodyFill ?? 0.6), subjDeg / (opts.subjFill ?? 0.78), f0.angSizeDeg / 0.9)));
    }
    // offline reframing sizes the crop on a ±0.6 s running max of the need (so a fast spread of the ski tips is not cut off), then smooths
    const W = Math.round(0.6 / SDT), wmax = new Float64Array(j - i);
    for (let q = 0; q < j - i; q++) { let m = 0; for (let r = Math.max(0, q - W); r <= Math.min(j - i - 1, q + W); r++) if (want[r] > m) m = want[r]; wmax[q] = m; }
    const vfs = j - i > 8 ? lpZero(wmax, 0.3, SDT) : wmax;
    for (let q = i; q < j; q++) {
      const f = nrm([comp[0][q - i], comp[1][q - i], comp[2][q - i]]);
      out.fx[q] = f[0]; out.fy[q] = f[1]; out.fz[q] = f[2];
      const vf = Math.max(vfMin, vfs[q - i]);
      out.vfov[q] = vf;
      let ft;
      if (p.cam360) {
        ft = footage({ pos: C[q], kind: '360', w: 5760, h: 2880, cropVfovDeg: 60 }, S[q]);
        out.inNative[q] = 1;
      } else {
        ft = footage({ pos: C[q], kind: 'rect', fwd: f, up: [0, 0, 1], vfovDeg: vf, w: 1920, h: 1080 }, S[q]);
        // the crop must lie inside the native wide frame (pod axis ± native FOV)
        const pa = [out.pax[q], out.pay[q], out.paz[q]];
        const off = Math.acos(Math.max(-1, Math.min(1, dot(pa, f)))) / D2R;
        const halfDiagCrop = Math.atan(Math.tan(vf * D2R / 2) * Math.hypot(1, 16 / 9)) / D2R;
        const halfNative = Math.atan(Math.tan(hf) * Math.hypot(1, 9 / 16)) / D2R; // native half-diagonal
        out.inNative[q] = off + halfDiagCrop <= halfNative ? 1 : 0;
      }
      out.subjectPx[q] = ft.inFrame && out.inNative[q] ? ft.subjectPx : 0;
      out.bodyPx[q] = ft.inFrame && out.inNative[q] ? (ft.bodyPx ?? ft.subjectPx) : 0; // round-4 rule A3-X-04: feet→head/shoulders
      out.inFrame[q] = ft.inFrame && out.inNative[q] ? 1 : 0;
      out.az[q] = ft.az; out.elev[q] = ft.elev; out.dist[q] = ft.dist;
      // tether artefact in the delivered frame
      const A = [O.ax[q], O.ay[q], O.az[q]], K = [O.kx[q], O.ky[q], O.kz[q]];
      const poly = Number.isFinite(O.sx[q]) ? [A, [O.sx[q], O.sy[q], O.sz[q]], K] : [A, K];
      const camObj = p.cam360 ? { pos: C[q], fwd: L[q], vfovDeg: 60 } : { pos: C[q], fwd: f, vfovDeg: vf };
      // line (dT) plus the boom itself (tapered telescopic tube, base → tip), both counted as product artefact
      const segs = [];
      for (let j = 0; j + 1 < poly.length; j++) segs.push([poly[j], poly[j + 1], p.dT / 1000, p.dT / 1000]);
      if (core.useBoom) segs.push([[O.px[q], O.py[q], O.pz[q]], A, p.boomDBase / 1000, p.boomDTip / 1000]);
      const tf = tetherInFrame(camObj, S[q], segs);
      out.art[q] = (100 * tf.artPx) / Math.max(1, ft.subjectPx); out.artW[q] = tf.artW;
      out.artF[q] = artefactCounts(tf.artW > 0, tf.artW) ? 1 : 0; // shared rule A3-X-01: any product part ≥ARTEFACT_PX wide over the subject
    }
    i = j;
  }
  return out;
}

export function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return len(r);
  if (a <= 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return len(sub(add(p1, mul(d1, s)), add(p2, mul(d2, t))));
}

// tether polyline vs rider silhouette in the delivered 1920×1080 frame: length (px) of line ≥1 px wide over the subject
function tetherInFrame(cam, s, segs) {
  const f = nrm(cam.fwd), r = nrm(cross(f, [0, 0, 1])), u = cross(r, f);
  const tv = Math.tan((cam.vfovDeg * D2R) / 2), th = tv * (16 / 9), fpx = 540 / tv;
  const Cp = cam.pos;
  const proj = (P) => { const d = sub(P, Cp); const z = dot(d, f); if (z <= 0.03) return null; return [(dot(d, r) / z / th) * 960, (dot(d, u) / z / tv) * 540, z]; };
  const caps = [];
  for (const [a, b, rad, name] of bodyCapsules(s)) { void name; const A = proj(a), B = proj(b); if (!A || !B) continue; caps.push([A, B, (rad * fpx) / A[2], (rad * fpx) / B[2], rad]); }
  let artPx = 0, artW = 0;
  // subject bounding box in the image (with margin): only line samples inside it can overlap the silhouette
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const c of caps) for (const [P, r] of [[c[0], c[2]], [c[1], c[3]]]) { bx0 = Math.min(bx0, P[0] - r); bx1 = Math.max(bx1, P[0] + r); by0 = Math.min(by0, P[1] - r); by1 = Math.max(by1, P[1] + r); }
  for (const [a, b, w0, w1] of segs) {
    const seg = sub(b, a), sl = len(seg);
    // dense (2 cm) near the pack end where the line image meets the rider, coarser (12 cm) further out
    const ts = [];
    for (let d = 0; d < sl; d += d < 1.5 ? 0.02 : 0.12) ts.push(d / sl);
    ts.push(1);
    let prev = null;
    for (const u of ts) {
      const P = proj(add(a, mul(seg, u)));
      let cur = null;
      if (P && P[0] >= bx0 && P[0] <= bx1 && P[1] >= by0 && P[1] <= by1) {
        const wpx = ((w0 + (w1 - w0) * u) * fpx) / P[2];
        let over = false;
        for (const c of caps) {
          const qx = c[1][0] - c[0][0], qy = c[1][1] - c[0][1], l2 = qx * qx + qy * qy;
          const tt = l2 > 1e-9 ? Math.max(0, Math.min(1, ((P[0] - c[0][0]) * qx + (P[1] - c[0][1]) * qy) / l2)) : 0;
          const hx = c[0][0] + qx * tt - P[0], hy = c[0][1] + qy * tt - P[1], rr = c[2] + (c[3] - c[2]) * tt, zc = c[0][2] + (c[1][2] - c[0][2]) * tt;
          if (hx * hx + hy * hy < rr * rr && P[2] < zc + c[4]) { over = true; break; }
        }
        cur = { x: P[0], y: P[1], w: wpx, over };
        if (over && wpx > artW) artW = wpx;
      }
      if (prev && cur && prev.over && cur.over && Math.min(prev.w, cur.w) >= 1) artPx += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      prev = cur;
    }
  }
  return { artPx, artW };
}
