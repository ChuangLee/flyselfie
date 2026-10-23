// descentglider v2 footage geometry: no brushless gimbal. A 16 g 4K camera module (Thumb-Pro class, gyro log for
// post stabilisation) sits in the nose on a 3-axis MICRO-SERVO cradle (pan/tilt/roll, slow: τ ≈0.08 s, 6 rad/s)
// that removes the turn-induced pointing and bank; the fast remainder is removed by gyro stabilisation with a residual.
// Lens camHfov (f-θ, 16:9), zero-tilt camTilt below the wing chord. The output is a
// horizon-levelled, subject-locked crop (≥ cropHfov wide; 1 Hz critically damped tracking of the UWB/vision line
// of sight with LOS-rate feed-forward). Because the cradle is slow and has limited travel:
//   • the crop can only be placed inside the lens image: its centre (azimuth/elevation in the camera frame) is
//     clamped so the ROTATED crop rectangle (rotated by the bank angle to keep the horizon level) stays inside the
//     lens — banked turns and the loiter can push the rider out of the usable image (counted as lost footage);
//   • every body rotation (commanded attitude + gust-driven disturbance from model.js) reaches the image; gyro
//     EIS removes it with a residual fraction eisRho (ASSUMED 0.1) above ≈0.5 Hz; the subject lock removes the rest.
// Native resolution: 3840 px over camHfov → (3840/camHfov) px/° ; output px are scaled down when the crop has fewer
// than 1080 native rows (no up-scaling credit). Geometry only (no exposure, blur, prop disc in frame).
import { footage } from '../common/env.js';
import { isFlying, isMoving, MODE } from './model.js';

export const cropVfov = (hfov) => (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) * (9 / 16)) * 180) / Math.PI;
export const CROP_HFOV = 40;
export const CROP_VFOV = cropVfov(CROP_HFOV);
const D = Math.PI / 180;
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const addS = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

export function analyse(core, sk, p) {
  const O = core.O, n = core.n, dt = 0.02, m = p.mass;
  const cols = {};
  for (const k of ['camx', 'camy', 'camz', 'fx', 'fy', 'fz', 'lx', 'ly', 'lz', 'px', 'inFrame', 'az', 'keG', 'keRel', 'cam', 'lensOK', 'dist', 'vfov', 'imgRoll', 'camRoll', 'camPan', 'camTiltC', 'cbx', 'cby', 'cbz']) cols[k] = new Float64Array(n).fill(NaN);
  const H = p.camHfov / 2, V = (p.camHfov * 9) / 32; // f-θ lens: half extents (deg)
  const pxPerDeg = 3840 / p.camHfov;
  const lensV = 2 * V;
  const tilt = p.camTilt * D;
  let f = null, fd = [0, 0, 0], lp = null, zoomV = cropVfov(p.cropHfov ?? CROP_HFOV);
  const w = 2 * Math.PI * 1.0;
  let prev = null, th = [0, 0, 0], thLP = [0, 0, 0], camR = 0, camP = 0, camT = 0;
  const kHP = 1 - Math.exp(-dt * 2 * Math.PI * 0.5);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const s = core.rider(t);
    const md = O.mode[i];
    const vel = [O.vx[i], O.vy[i], O.vz[i]];
    const vr = [vel[0] - s.vel[0], vel[1] - s.vel[1], vel[2] - s.vel[2]];
    cols.keG[i] = isMoving(md) ? 0.5 * m * dot(vel, vel) : 0;
    cols.keRel[i] = isMoving(md) ? 0.5 * m * dot(vr, vr) : 0;
    const camOn = isFlying(md) || md === MODE.SLIDE;
    if (!camOn) { f = null; lp = null; prev = null; continue; }
    // body axes with the gust-driven disturbance rotation δ = roll·bx + pitch·by + yaw·bz (small angles)
    let bx = [O.bxx[i], O.bxy[i], O.bxz[i]], bz = [O.bzx[i], O.bzy[i], O.bzz[i]];
    const by = cross(bz, bx);
    const dl = addS(addS(addS([0, 0, 0], bx, O.dph[i]), by, O.dth[i]), bz, O.dps[i]);
    bx = nrm(addS(bx, cross(dl, bx), 1)); bz = nrm(addS(bz, cross(dl, bz), 1));
    const byd = cross(bz, bx); // left
    const cb = nrm(addS([bx[0] * Math.cos(tilt), bx[1] * Math.cos(tilt), bx[2] * Math.cos(tilt)], bz, -Math.sin(tilt)));
    const cu = nrm(addS([bx[0] * Math.sin(tilt), bx[1] * Math.sin(tilt), bx[2] * Math.sin(tilt)], bz, Math.cos(tilt)));
    const cr = [-byd[0], -byd[1], -byd[2]]; // image right
    const cp = [O.x[i] + bx[0] * 0.14 - bz[0] * 0.01, O.y[i] + bx[1] * 0.14 - bz[1] * 0.01, O.z[i] + bx[2] * 0.14 - bz[2] * 0.01];
    const hgt = 1.75 * 0.55 * (1 - 0.16 * (s.crouch ?? 0.3));
    const los = nrm([s.pos[0] - cp[0], s.pos[1] - cp[1], s.pos[2] + hgt - cp[2]]);
    if (!f) { f = los.slice(); fd = [0, 0, 0]; lp = los.slice(); }
    const ld = [(los[0] - lp[0]) / dt, (los[1] - lp[1]) / dt, (los[2] - lp[2]) / dt]; lp = los;
    for (let k = 0; k < 3; k++) { const a = w * w * (los[k] - f[k]) + 2 * w * (ld[k] - fd[k]); fd[k] += a * dt; f[k] += fd[k] * dt; }
    let fw = nrm(f);
    // adaptive zoom (never tighter than the minimum crop; zoom out when the rider is close)
    const ang = footage({ pos: cp, kind: 'rect', fwd: fw, up: [0, 0, 1], vfovDeg: 60, w: 1920, h: 1080 }, s).angSizeDeg;
    zoomV += (Math.max(cropVfov(p.cropHfov ?? CROP_HFOV), Math.min(0.8 * lensV, ang / 0.55)) - zoomV) * Math.min(1, dt / 0.6);
    // horizon-levelled crop rotated by the image roll; clamp its centre inside the lens image
    const upImg = [dot([0, 0, 1], cr), dot([0, 0, 1], cu)];
    const rollB = Math.atan2(upImg[0], upImg[1]);
    const ah0 = Math.atan2(dot(fw, cr), dot(fw, cb)) / D, av0 = Math.atan2(dot(fw, cu), Math.hypot(dot(fw, cb), dot(fw, cr))) / D;
    // 3-axis micro-servo cradle (pan / tilt / roll): each axis follows its target with a 1st-order lag (τ camRollTau),
    // a 6 rad/s slew limit and limited travel; the crop absorbs only what the slow cradle leaves
    if (p.camRoll) {
      const step = (cur, tgt, lim) => { const d = (Math.max(-lim, Math.min(lim, tgt)) - cur) * Math.min(1, dt / p.camRollTau); return cur + Math.max(-6 * dt / D, Math.min(6 * dt / D, d)); };
      camP = step(camP, ah0, 90); camT = step(camT, av0, 45); camR = step(camR, rollB / D, 60) ;
    } else { camP = 0; camT = 0; camR = 0; }
    const roll = rollB - camR * D;
    const hh = zoomV / 2, hw = Math.atan(Math.tan((zoomV * D) / 2) * (16 / 9)) / D;
    const cR = Math.abs(Math.cos(roll)), sR = Math.abs(Math.sin(roll));
    const hwR = hw * cR + hh * sR, hhR = hw * sR + hh * cR;
    let ah = ah0 - camP, av = av0 - camT;
    const ahMax = Math.max(0, H - hwR), avMax = Math.max(0, V - hhR);
    const lensOK = Math.abs(ah) <= ahMax && Math.abs(av) <= avMax && dot(fw, cb) > 0 ? 1 : 0;
    if (!lensOK) {
      const a1 = Math.max(-ahMax, Math.min(ahMax, ah)) + camP, v1 = Math.max(-avMax, Math.min(avMax, av)) + camT;
      const ch = Math.cos(v1 * D);
      fw = nrm(addS(addS([cb[0] * ch * Math.cos(a1 * D), cb[1] * ch * Math.cos(a1 * D), cb[2] * ch * Math.cos(a1 * D)], cr, ch * Math.sin(a1 * D)), cu, Math.sin(v1 * D)));
    }
    // gyro-EIS residual: a fraction eisRho of the >0.5 Hz body rotation stays in the crop pointing
    if (prev) {
      const r = [0, 0, 0];
      for (const [a, b] of [[prev.cb, cb], [prev.cu, cu], [prev.cr, cr]]) { const c = cross(a, b); r[0] += c[0] / 2; r[1] += c[1] / 2; r[2] += c[2] / 2; }
      th = addS(th, r, 1);
    }
    prev = { cb, cu, cr };
    thLP = addS(thLP, [th[0] - thLP[0], th[1] - thLP[1], th[2] - thLP[2]], kHP);
    const e = [(th[0] - thLP[0]) * p.eisRho, (th[1] - thLP[1]) * p.eisRho, (th[2] - thLP[2]) * p.eisRho];
    const fOut = nrm(addS(fw, cross(e, fw), 1));
    const ft = footage({ pos: cp, kind: 'rect', fwd: fOut, up: [0, 0, 1], vfovDeg: zoomV, w: 1920, h: 1080 }, s);
    const native = Math.min(1, (pxPerDeg * zoomV) / 1080);
    cols.vfov[i] = zoomV; cols.imgRoll[i] = roll / D; cols.camRoll[i] = camR; cols.camPan[i] = camP; cols.camTiltC[i] = camT;
    cols.camx[i] = cp[0]; cols.camy[i] = cp[1]; cols.camz[i] = cp[2];
    cols.fx[i] = fOut[0]; cols.fy[i] = fOut[1]; cols.fz[i] = fOut[2];
    cols.lx[i] = los[0]; cols.ly[i] = los[1]; cols.lz[i] = los[2];
    cols.cbx[i] = cb[0]; cols.cby[i] = cb[1]; cols.cbz[i] = cb[2];
    cols.px[i] = ft.subjectPx * native; cols.inFrame[i] = ft.inFrame ? 1 : 0; cols.az[i] = ft.az; cols.dist[i] = ft.dist;
    cols.cam[i] = 1; cols.lensOK[i] = lensOK;
  }
  return cols;
}
