// S3 tetherdrone: per-sample post-processing of a runCore() result —
// gimbal camera + 4K reframing crop, shared footage metric, tether-in-frame
// (projection of the lumped-mass tether into the product camera and overlap
// with the rider's silhouette), tether/rotor proximity to the body, sweep
// angle, anchor force and yaw moment. Numerical-uncalibrated geometry.
import { bodyPoints } from '../common/skier.js';
import { footage } from '../common/env.js';
import { bodyCapsules, segSegDist, mountStick, V } from './model.js';

const { sub, add, mul, dot, len, nrm } = V;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const D2R = Math.PI / 180;
// 4K sensor, 85° HFOV; 1080p output may crop up to 2× without upscaling
export const VFOV_FULL = (2 * Math.atan(Math.tan(42.5 * D2R) * 9 / 16)) / D2R; // ≈ 54.5°
export const VFOV_MIN = (2 * Math.atan(Math.tan(42.5 * D2R) * 9 / 16 / 2)) / D2R; // ≈ 28.9°

export function camPose(O, i) {
  const yaw = [O.yx[i], O.yy[i], 0];
  return add([O.dx[i], O.dy[i], O.dz[i]], add(mul(yaw, 0.06), [0, 0, -0.05]));
}

// project a model point into a camera (normalised −1..1 coords, depth)
export function makeProj(cam) {
  const f = nrm(cam.fwd), r = nrm(cross(f, [0, 0, 1])), u = cross(r, f);
  const tv = Math.tan((cam.vfovDeg * D2R) / 2), th = tv * (16 / 9);
  const fpx = 540 / tv;
  return { fpx, P(p) { const d = sub(p, cam.pos); const z = dot(d, f); if (z <= 0.03) return null; return [dot(d, r) / z / th, dot(d, u) / z / tv, z]; } };
}

// tether vs silhouette in the output frame (1920×1080 px units); allocation-light
function tetherInFrame(cam, s, nodes, dTm, caps, stick = null) {
  const f = nrm(cam.fwd), r = nrm(cross(f, [0, 0, 1])), u = cross(r, f);
  const tv = Math.tan((cam.vfovDeg * D2R) / 2), th = tv * (16 / 9), fpx = 540 / tv;
  const C = cam.pos;
  const proj = (x, y, z, out) => {
    const dx = x - C[0], dy = y - C[1], dz = z - C[2];
    const zc = dx * f[0] + dy * f[1] + dz * f[2];
    if (zc <= 0.03) return false;
    out[0] = ((dx * r[0] + dy * r[1] + dz * r[2]) / zc / th) * 960; out[1] = ((dx * u[0] + dy * u[1] + dz * u[2]) / zc / tv) * 540; out[2] = zc;
    return true;
  };
  // capsules in pixel space: [ax, ay, bx, by, ra, rb, za, zb, r]
  const pc = [], A = [0, 0, 0], B = [0, 0, 0];
  for (const [a, b, rad, name] of caps) {
    if (name === 'ski' || name === 'pole') continue; // thin; not part of the body silhouette here
    if (!proj(a[0], a[1], a[2], A) || !proj(b[0], b[1], b[2], B)) continue;
    pc.push([A[0], A[1], B[0], B[1], (rad * fpx) / A[2], (rad * fpx) / B[2], A[2], B[2], rad]);
  }
  let sAcc = 0, overPx = 0, visPx = 0, artPx = 0, maxW = 0, wSub = NaN, artW = 0;
  let pX = 0, pY = 0, pOver = false, pW = 0, pOk = false;
  const P = [0, 0, 0];
  // pieces: the tether polyline (diameter dTm, first 0.15 m = exit ferrule skipped) and the mount stick (20 mm, base 0.12 m skipped)
  const pieces = [[nodes, dTm, 0.15]];
  if (stick) pieces.push([stick, 0.02, 0.12]);
  for (const [pl, diam, skip] of pieces) {
  sAcc = 0; pOk = false; pOver = false;
  for (let j = 0; j + 1 < pl.length; j++) {
    const a = pl[j], b = pl[j + 1];
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], sl = Math.sqrt(ex * ex + ey * ey + ez * ez);
    const k = Math.max(1, Math.ceil(sl / 0.05));
    for (let q = 0; q < k; q++) {
      const w = q / k, sArc = sAcc + sl * w;
      let ok = false, over = false, wpx = 0;
      if (proj(a[0] + ex * w, a[1] + ey * w, a[2] + ez * w, P) && Math.abs(P[0]) <= 960 && Math.abs(P[1]) <= 540) {
        ok = true; wpx = (diam * fpx) / P[2];
        if (diam === dTm && wpx > maxW) maxW = wpx;
        if (sArc > skip) {
          for (let c = 0; c < pc.length; c++) {
            const cc = pc[c];
            const qx = cc[2] - cc[0], qy = cc[3] - cc[1], l2 = qx * qx + qy * qy;
            const tt = l2 > 1e-9 ? Math.max(0, Math.min(1, ((P[0] - cc[0]) * qx + (P[1] - cc[1]) * qy) / l2)) : 0;
            const hx = cc[0] + qx * tt - P[0], hy = cc[1] + qy * tt - P[1];
            const rr = cc[4] + (cc[5] - cc[4]) * tt, zc = cc[6] + (cc[7] - cc[6]) * tt;
            if (hx * hx + hy * hy < rr * rr && P[2] < zc + cc[8]) { over = true; if (diam === dTm && !(wSub >= wpx)) wSub = wpx; if (wpx > artW) artW = wpx; break; }
          }
        }
      }
      if (ok && pOk && over && pOver) {
        const dl = Math.hypot(P[0] - pX, P[1] - pY);
        if (diam === dTm) { overPx += dl; if (Math.min(wpx, pW) >= 0.5) visPx += dl; }
        if (Math.min(wpx, pW) >= 1) artPx += dl;
      }
      pOk = ok; pOver = over; pX = P[0]; pY = P[1]; pW = wpx;
    }
    sAcc += sl;
  }
  }
  return { overPx, visPx, artPx, artW, maxW, wSub };
}

export function analyse(core, sk, opts = {}) {
  const { O, n, nodes, NN, SDT, rider, p } = core;
  const out = {};
  for (const k of ['subjectPx', 'inFrame', 'az', 'elev', 'dist', 'vfov', 'cross', 'crossVis', 'tetherW', 'tetherMaxW', 'headDist', 'clearBody', 'clearSki', 'clearPole', 'sweep', 'yawM', 'keSnow', 'keRel', 'gfx', 'gfy', 'gfz', 'cpx', 'cpy', 'cpz', 'flying', 'branchDist', 'art', 'artW', 'handDist', 'lx', 'ly', 'lz']) out[k] = new Float64Array(n).fill(NaN);
  const losArr = [], fwdArr = [], idxArr = [];
  // lens: 4K sensor, HFOV p.camHfov (85° v1/v2); 1080p output may crop up to 2× without upscaling
  const hf = ((p.camHfov || 85) / 2) * D2R;
  const vfFull = (2 * Math.atan(Math.tan(hf) * 9 / 16)) / D2R, vfMin = (2 * Math.atan(Math.tan(hf) * 9 / 16 / 2)) / D2R;
  let g = null, vf = vfFull, losPrev = null;
  const nodeAt = (i) => { const a = []; for (let j = 0; j < NN; j++) { const o = (i * NN + j) * 3; a.push([nodes[o], nodes[o + 1], nodes[o + 2]]); } return a; };
  for (let i = 0; i < n; i++) {
    const t = i * SDT;
    const s = rider(t);
    const b = bodyPoints(s);
    const caps = bodyCapsules(s, b);
    const md = O.mode[i] % 10, landed = O.mode[i] >= 10;
    const flying = (md >= 2 && md <= 5) && !landed;
    out.flying[i] = flying ? 1 : 0;
    const dp = [O.dx[i], O.dy[i], O.dz[i]], dv = [O.dvx[i], O.dvy[i], O.dvz[i]];
    const gr = p.mass < 0.16 ? 0.085 : 0.10; // guard radius (v2 airframe is smaller)
    out.headDist[i] = len(sub(dp, b.head)) - gr - 0.14; // guard edge to helmet surface
    out.handDist[i] = Math.min(...caps.filter((c) => c[3] === 'arm').map((c) => len(sub(dp, c[1])))) - gr - 0.06; // guard to glove
    out.keSnow[i] = 0.5 * p.mass * dot(dv, dv);
    const rv = sub(dv, s.vel); out.keRel[i] = 0.5 * p.mass * dot(rv, rv);
    const A = [O.ax[i], O.ay[i], O.az[i]];
    const pel = b.pelvis;
    out.yawM[i] = (A[0] - pel[0]) * O.Fy[i] - (A[1] - pel[1]) * O.Fx[i];
    const nd = nodeAt(i);
    if (opts.branch) {
      const B = opts.branch, bz = -B.x * core.tanS + B.h;
      out.branchDist[i] = segSegDist(dp, dp, [B.x, B.y0, bz], [B.x, B.y1, bz]) - 0.1;
    }
    if (md === 0 || md === 1) { g = null; losPrev = null; continue; }
    // tether sweep: direction of the first ~2 m relative to the rider's rear axis
    const q = nd[Math.min(NN - 1, 4)];
    const hz = [q[0] - A[0], q[1] - A[1]];
    if (Math.hypot(hz[0], hz[1]) > 0.2 && O.reelMode[i] !== 3) {
      const back = [-s.heading[0], -s.heading[1]];
      out.sweep[i] = Math.atan2(back[0] * hz[1] - back[1] * hz[0], back[0] * hz[0] + back[1] * hz[1]) / D2R;
    }
    // tether proximity to body / skis / poles (skip the first 0.3 m out of the dome)
    let cb = Infinity, cs = Infinity, cpl = Infinity, sAcc = 0;
    if (O.L[i] > 0.5) {
      for (let j = 0; j + 1 < NN; j++) {
        const a = nd[j], c = nd[j + 1], sl = len(sub(c, a));
        if (sAcc + sl > 0.3) {
          const a2 = sAcc < 0.3 ? add(a, mul(sub(c, a), (0.3 - sAcc) / (sl || 1))) : a;
          for (const [P, Q, r, name] of caps) {
            if (name === 'pack') continue;
            const d = segSegDist(a2, c, P, Q) - r;
            if (name === 'ski') cs = Math.min(cs, d); else if (name === 'pole') cpl = Math.min(cpl, d); else cb = Math.min(cb, d);
          }
        }
        sAcc += sl;
      }
      out.clearBody[i] = cb; out.clearSki[i] = cs; out.clearPole[i] = cpl;
    }
    if (!flying) { g = null; losPrev = null; continue; }
    // gimbal: aims at the rider's mid-body (visual tracking, τ = 0.12 s)
    const cam = camPose(O, i);
    // aim point: subject centre (same definition as the shared footage-stability check)
    const mid = p.gimbalBW > 0 ? [s.pos[0], s.pos[1], s.pos[2] + 1.75 * 0.55 * (1 - 0.16 * (s.crouch ?? 0.3))] : add(b.pelvis, mul(b.up, 0.15));
    const los = nrm(sub(mid, cam));
    if (p.gimbalBW > 0) {
      // v3.1: vision (30 Hz, 40 ms latency) + UWB/IMU rate feed-forward; the loop (bandwidth gimbalBW Hz) tracks the
      // latency-compensated LOS (80 % of the latency recovered by rate prediction, ASSUMED)
      const lp = losPrev || los, rate = mul(sub(los, lp), 1 / SDT); losPrev = los;
      const target = nrm(add(los, mul(rate, -0.04 * 0.2)));
      g = g ? nrm(add(g, mul(sub(target, g), 1 - Math.exp(-SDT * 2 * Math.PI * p.gimbalBW)))) : los;
    } else g = g ? nrm(add(g, mul(sub(los, g), 1 - Math.exp(-SDT / 0.12)))) : los;
    // crop: keep the subject ≈ 45 % of the output height within the 2× lossless range
    const f0 = footage({ pos: cam, kind: 'rect', fwd: g, up: [0, 0, 1], vfovDeg: vf, w: 1920, h: 1080 }, s);
    // v3.1 crop: frame the subject's VERTICAL image extent (a leaning rider is short and wide) while keeping the
    // feet–head diagonal inside the frame; v1–v3: feet–head angle only
    const vertDeg = (f0.subjectPx / 1080) * vf;
    const want = Math.max(vfMin, Math.min(vfFull, p.gimbalBW > 0 ? Math.max(vertDeg / 0.45, f0.angSizeDeg / 0.95) : f0.angSizeDeg / 0.45));
    vf += (want - vf) * (1 - Math.exp(-SDT / (p.gimbalBW > 0 ? 0.12 : 0.8)));
    const camObj = { pos: cam, kind: 'rect', fwd: g, up: [0, 0, 1], vfovDeg: vf, w: 1920, h: 1080 };
    const f = footage(camObj, s);
    out.subjectPx[i] = f.inFrame ? f.subjectPx : 0; out.inFrame[i] = f.inFrame; out.az[i] = f.az; out.elev[i] = f.elev; out.dist[i] = f.dist; out.vfov[i] = vf;
    out.gfx[i] = g[0]; out.gfy[i] = g[1]; out.gfz[i] = g[2]; out.cpx[i] = cam[0]; out.cpy[i] = cam[1]; out.cpz[i] = cam[2];
    const tf = tetherInFrame(camObj, s, O.reelMode[i] === 3 ? [] : nd, p.dT / 1000, caps, mountStick(s, b, p, O.mext ? O.mext[i] : 0));
    out.art[i] = (100 * tf.artPx) / Math.max(1, f.subjectPx); out.artW[i] = tf.artW;
    out.lx[i] = los[0]; out.ly[i] = los[1]; out.lz[i] = los[2];
    const sp = Math.max(1, f.subjectPx);
    out.cross[i] = (100 * tf.overPx) / sp; out.crossVis[i] = (100 * tf.visPx) / sp; out.tetherW[i] = tf.wSub; out.tetherMaxW[i] = tf.maxW;
    losArr.push(los); fwdArr.push(g); idxArr.push(i);
  }
  return { cols: out, losArr, fwdArr, idxArr };
}
