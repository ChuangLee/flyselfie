// towglider: per-sample post-processing of a runCore() result — camera options
// (2-axis gimbal, 4K gyro-EIS fisheye on a servo pan, body-fixed fisheye, 48 MP
// fisheye; legacy body-fixed rectilinear), airframe attitude response to turbulence
// and the stabilisation residual (attitude.js), the shared footage metric on the
// output crop, leash-in-frame artefact (projected line over the rider's silhouette),
// leash/glider proximity to the body, KE in the snow and rider frames.
// Numerical-uncalibrated geometry; camera/gimbal/EIS figures ASSUMED (attitude.js).
import { bodyPoints } from '../common/skier.js';
import { footage, subjectPoints } from '../common/env.js';
import { bodyCapsules, segSegDist, V } from './model.js';
import { attitude, residual, rot, STAB, MOUNT, REFRAME, lpZero, SERVO, EIS, servoMountEIS, frameOf } from './attitude.js';
import { mulberry32 } from '../../model/util.js';

const { sub, add, mul, dot, cross, len, nrm } = V;
const D2R = Math.PI / 180;
export const MODES = ['stowed', 'drop', 'sled', 'winch', 'follow', 'recover', 'reelin', 'seat', 'docked', 'abort', 'land', 'landed', 'snowpull', 'free', 'dstall', 'park'];
// optic: rect (rectilinear) or fisheye (equidistant); sensor px; stab: gimbal | eis; pan: 1-axis servo pan
export const CAMS = {
  0: { key: 'fixed90', optic: 'rect', hfov: 90, sensor: [3840, 2160], stab: 'eis', pan: false, gimbal: false, zh: '机身固定 4K 90° + 电子稳像重构图（I-05）', en: 'body-fixed 4K 90° + EIS reframing (I-05)' },
  1: { key: 'fixed120', optic: 'rect', hfov: 120, sensor: [3840, 2160], stab: 'eis', pan: false, gimbal: false, zh: '机身固定 4K 120° 直线镜头 + 电子稳像', en: 'body-fixed 4K 120° rectilinear + EIS' },
  2: { key: 'gimbal', optic: 'rect', hfov: 60, sensor: [3840, 2160], stab: 'gimbal', pan: false, gimbal: true, zh: '4K 60° 两轴无刷云台（30 g 级）', en: '4K 60° on a 2-axis brushless gimbal (30 g class)' },
  3: { key: 'panEIS', optic: 'fisheye', hfov: 90, sensor: [3840, 2160], stab: 'eis', pan: true, tilt: true, roll: true, gimbal: false, zh: '4K 陀螺稳像 90° 鱼眼 + 三舵机指向座（水平/俯仰/横滚，只指向不稳像，选定）', en: '4K gyro-EIS 90° fisheye on a 3-servo pointing mount (pan/tilt/roll, pointing only, chosen)' },
  4: { key: 'fixEIS', optic: 'fisheye', hfov: 150, sensor: [3840, 2160], stab: 'eis', pan: false, gimbal: false, zh: '4K 陀螺稳像 150° 鱼眼机身固定（无云台）', en: '4K gyro-EIS 150° fisheye, body-fixed (no gimbal)' },
  5: { key: 'fix48', optic: 'fisheye', hfov: 150, sensor: [8000, 6000], stab: 'eis', pan: false, gimbal: false, zh: '48 MP 150° 鱼眼机身固定（假设部件）', en: '48 MP 150° fisheye, body-fixed (ASSUMED part)' },
  6: { key: 'panRect', optic: 'rect', hfov: 60, sensor: [3840, 2880], stab: 'eis', pan: true, tilt: true, roll: true, stabMount: true, gimbal: false, zh: '4K 陀螺稳像 + M12 窄角直线镜头 + 三舵机指向座', en: '4K gyro-EIS camera, narrow M12 rectilinear lens on the 3-servo pointing mount' },
};
export const SPAN_WING = (p) => Math.sqrt(p.S * p.AR);
// native focal length (px/rad at the image centre) and the narrowest output crop (1080 rows at ≤ native resolution)
export function optics(cam) {
  const [W, H] = cam.sensor, hf = (cam.hfov / 2) * D2R;
  const fN = cam.optic === 'rect' ? W / 2 / Math.tan(hf) : W / (2 * hf);
  const vfMin = (2 * Math.atan(540 / fN)) / D2R;
  const vfFull = cam.optic === 'rect' ? (2 * Math.atan(Math.tan(hf) * (H / W))) / D2R : Math.min(70, (cam.hfov * H) / W);
  return { fN, vfMin, vfFull, halfH: hf, halfV: cam.optic === 'rect' ? Math.atan(Math.tan(hf) * (H / W)) : hf * (H / W) };
}

const hookOf = (g, bx, bz) => add(g, add(mul(bx, 0.05), mul(bz, -0.03)));
export function camOf(O, i) {
  const bx = [O.fx[i], O.fy[i], O.fz[i]], bz = [O.ux[i], O.uy[i], O.uz[i]];
  return { pos: add([O.gx[i], O.gy[i], O.gz[i]], add(mul(bx, 0.14), mul(bz, 0.01))), bx, bz };
}
// leash polyline at sample i (model coords); dense near the glider for artefact checks
export function leashAt(O, i, dense = false, tanS = null) {
  if (!O.hookOn[i]) return null;
  const A = [O.ax[i], O.ay[i], O.az[i]];
  const B = hookOf([O.gx[i], O.gy[i], O.gz[i]], [O.fx[i], O.fy[i], O.fz[i]], [O.ux[i], O.uy[i], O.uz[i]]);
  const bowA = [O.bx[i], O.by[i], O.bz[i]], bowB = [O.wx[i], O.wy[i], O.wz[i]];
  const P = O.contact[i] ? [O.px[i], O.py[i], O.pz[i]] : null;
  const pts = [];
  const span = (a, b, w, us) => { for (const u of us) pts.push(add(add(a, mul(sub(b, a), u)), mul(w, 4 * u * (1 - u)))); };
  const uni = (k) => Array.from({ length: k + 1 }, (_, j) => j / k);
  const toEnd = () => { const u = uni(24); if (!dense) return u; const extra = []; for (let k = 0; k < 24; k++) extra.push(1 - 0.004 * Math.pow(1.28, k)); return [...u.filter((x) => x < 0.9), ...extra.filter((x) => x >= 0.9).sort((a, b) => a - b), 1]; };
  if (P) { span(A, P, bowA, uni(12)); pts.pop(); span(P, B, bowB, toEnd()); } else span(A, B, bowA, toEnd());
  if (tanS != null) for (const q of pts) q[2] = Math.max(q[2], -q[0] * tanS + 0.004); // a slack line lies on the snow
  return pts;
}

// line over silhouette in the output frame (1920×1080 units)
function lineInFrame(cam, caps, pts, dLine) {
  const f = nrm(cam.fwd), r = nrm(cross(f, [0, 0, 1])), u = cross(r, f);
  const tv = Math.tan((cam.vfovDeg * D2R) / 2), th = tv * (16 / 9), fpx = 540 / tv;
  const proj = (p) => { const d = sub(p, cam.pos); const z = dot(d, f); if (z <= 0.02) return null; return [(dot(d, r) / z / th) * 960, (dot(d, u) / z / tv) * 540, z]; };
  const pc = [];
  for (const [a, b, rad, name] of caps) {
    if (name === 'ski' || name === 'pole') continue;
    const A = proj(a), B = proj(b); if (!A || !B) continue;
    pc.push([A[0], A[1], B[0], B[1], (rad * fpx) / A[2], (rad * fpx) / B[2], A[2], B[2], rad]);
  }
  let artPx = 0, visPx = 0, maxW = 0, wOver = 0;
  let prev = null;
  for (const q of pts) {
    const P = proj(q);
    let cur = null;
    if (P && Math.abs(P[0]) <= 960 && Math.abs(P[1]) <= 540) {
      const wpx = (dLine * fpx) / P[2];
      let over = false;
      for (const c of pc) {
        const qx = c[2] - c[0], qy = c[3] - c[1], l2 = qx * qx + qy * qy;
        const tt = l2 > 1e-9 ? Math.max(0, Math.min(1, ((P[0] - c[0]) * qx + (P[1] - c[1]) * qy) / l2)) : 0;
        const hx = c[0] + qx * tt - P[0], hy = c[1] + qy * tt - P[1], rr = c[4] + (c[5] - c[4]) * tt, zc = c[6] + (c[7] - c[6]) * tt;
        if (hx * hx + hy * hy < rr * rr && P[2] < zc + c[8]) { over = true; break; }
      }
      cur = { x: P[0], y: P[1], w: wpx, over };
      if (wpx > maxW) maxW = wpx;
      if (over && wpx > wOver) wOver = wpx;
    }
    if (cur && prev && cur.over && prev.over) {
      const dl = Math.hypot(cur.x - prev.x, cur.y - prev.y), w = Math.min(cur.w, prev.w);
      if (w >= 0.5) visPx += dl;
      if (w >= 1) artPx += dl;
    }
    prev = cur;
  }
  return { artPx, visPx, maxW, wOver };
}

// is the level 16:9 crop (vertical FOV vf, centre dir) inside the sensor window of a camera (cax, cup, crt)?
function cropFits(dir, vf, cam, ox, cax, cup, crt) {
  const r = nrm(cross(dir, [0, 0, 1])), u = cross(r, dir);
  const tvv = Math.tan((vf * D2R) / 2), thh = (tvv * 16) / 9;
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const d = nrm(add(dir, add(mul(r, sx * thh), mul(u, sy * tvv))));
    const z = dot(d, cax);
    if (cam.optic === 'rect') { if (z <= 0) return false; if (Math.abs(dot(d, crt) / z) > Math.tan(ox.halfH) || Math.abs(dot(d, cup) / z) > Math.tan(ox.halfV)) return false; }
    else { const th = Math.acos(Math.max(-1, Math.min(1, z))), a = dot(d, crt), b = dot(d, cup), l = Math.hypot(a, b) || 1; if (Math.abs((th * a) / l) > ox.halfH || Math.abs((th * b) / l) > ox.halfV) return false; }
  }
  return true;
}

export function analyse(core, opts = {}) {
  const { O, n, SDT, rider, p } = core;
  const cam0 = CAMS[p.cam | 0] || CAMS[3];
  const cam = cam0.key === 'panRect' ? { ...cam0, hfov: p.lensHfov ?? cam0.hfov } : cam0;
  const ox = optics(cam);
  const out = {};
  for (const k of ['subjectPx', 'bodyPx', 'inFrame', 'az', 'elev', 'dist', 'vfov', 'art', 'artW', 'lineVis', 'headDist', 'handDist', 'clearBody', 'clearSki', 'clearPole', 'keSnow', 'keRel', 'filming',
    'headC', 'capWin', 'lineH1', 'lineH2', 'cfx', 'cfy', 'cfz', 'cpx', 'cpy', 'cpz', 'lx', 'ly', 'lz', 'offAxis', 'fit', 'branchDist', 'bodyRate', 'blurPx', 'pan', 'resid', 'sx', 'sy']) out[k] = new Float64Array(n).fill(NaN);
  const TRIP_D = [0.5, 1, 1.5, 2, 2.5, 3], trip = TRIP_D.map(() => new Float64Array(n).fill(NaN));
  out.lowLen = new Float64Array(n).fill(NaN);
  const tilt = (p.camTilt ?? 25) * D2R;
  const span = SPAN_WING(p);
  // airframe attitude with turbulence (one-way): flying samples only
  const flying = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const md = MODES[O.mode[i]]; flying[i] = ['winch', 'follow', 'free', 'dstall', 'recover', 'abort', 'land', 'reelin'].includes(md) && O.hgt[i] > 0.3 ? 1 : 0; }
  const att = opts.attitude === false ? null : attitude(O, n, SDT, flying, { wind: opts.wind || {}, b: span, seed: opts.seed || 1, Vref: 12 });
  // pass 1: camera axes, pan, tracker direction, camera rotation rate
  const camAx = new Array(n), camRate = new Array(n), gArr = new Array(n), losArr = new Array(n), aimArr = new Array(n), filmA = new Uint8Array(n);
  let g = null, losPrev = null, pan = 0, rollS = 0, tiltS = tilt, prevCax = null, prevCup = null;
  // stabilised servo mount (round 3): world-referenced pointing with body-rate feed-forward from the FC IMU; the
  // camera follows the commanded world attitude, body rotation leaks through above the servo bandwidth f_s
  // (1st-order high-pass of the body attitude angle) plus a deadband/hunting noise (ASSUMED, attitude.js MOUNT)
  let cmdAx = null, eC = [0, 0, 0], dbN = [0, 0, 0];
  const useServo = cam.stabMount && (p.mountModel ?? 1) === 1, Barr = useServo ? new Array(n) : null, Tarr = useServo ? new Array(n) : null;
  const kS = 2 * Math.PI * MOUNT.fs, kP = 1 - Math.exp(-SDT * 2 * Math.PI * MOUNT.fPoint), aDb = Math.exp(-SDT * 2 * Math.PI * MOUNT.fDb), bDb = Math.sqrt(1 - aDb * aDb) * MOUNT.dbDeg * D2R;
  const rngM = mulberry32((opts.seed || 1) * 7919 + 3), gsM = () => { const u1 = Math.max(1e-12, rngM()), u2 = rngM(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
  const filmH = p.filmH ?? 1.5;
  for (let i = 0; i < n; i++) {
    const md = MODES[O.mode[i]];
    const attached = md === 'stowed' || md === 'docked' || md === 'seat';
    const bx = att ? att.bx[i] : [O.fx[i], O.fy[i], O.fz[i]], bz = att ? att.bz[i] : [O.ux[i], O.uy[i], O.uz[i]], by = cross(bz, bx);
    const gp = [O.gx[i], O.gy[i], O.gz[i]];
    const cpos = add(gp, add(mul(bx, 0.14), mul(bz, 0.01)));
    // the clip is auto-trimmed to airborne on-station flight: sled tow, launch below filmH, drops are cut (they count as
    // unavailable); round 3: a glider parked still on the snow (park, or waiting on the snow at push-off) keeps filming
    const gSp = Math.hypot(O.gvx[i], O.gvy[i], O.gvz[i]);
    const still = p.filmPark && (md === 'park' || md === 'drop') && O.hgt[i] < 0.1 && gSp < 0.3 && O.fold[i] > 0.5;
    const filming = !attached && ((O.fold[i] < 0.5 && (md === 'follow' || md === 'free' || ((md === 'winch' || (md === 'dstall' && O.post[i] < 0.05)) && O.hgt[i] > filmH))) || still);
    filmA[i] = filming ? 1 : 0;
    const s = rider(i * SDT);
    const mid = [s.pos[0], s.pos[1], s.pos[2] + 1.75 * 0.55 * (1 - 0.16 * (s.crouch ?? 0.3))];
    const los = nrm(sub(mid, cpos)); losArr[i] = los;
    // round 4: the post reframe aims at the centre of the subject's bounding box (feet/head/shoulders/ski tips) in a level
    // crop around the line of sight, not at the hip-height 'mid' point (the ski tail below the feet set the zoom before)
    if (p.cropCentre) { const rr0 = nrm(cross(los, [0, 0, 1])), uu0 = cross(rr0, los); let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
      const SPc = subjectPoints(s); for (const q of [SPc.feet, SPc.head, SPc.shL, SPc.shR, SPc.skiTip, SPc.skiTail]) { const d = sub(q, cpos), z = Math.max(0.05, dot(d, los)), yy = dot(d, uu0) / z, xx = dot(d, rr0) / z; y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); }
      aimArr[i] = nrm(add(los, add(mul(uu0, (y0 + y1) / 2), mul(rr0, (x0 + x1) / 2)))); } else aimArr[i] = los;
    let cax, cup;
    if (cam.stabMount) {
      // commanded axis: towards the subject (world frame), 1st-order at fPoint; parked: the mount tilts up to the rider
      cmdAx = cmdAx && filming ? nrm(add(cmdAx, mul(sub(los, cmdAx), kP))) : (filming ? los : nrm(sub(mul(bx, Math.cos(tilt)), mul(bz, Math.sin(tilt)))));
      // body rotation leaking through the servo loop: dθ/dt = ω_body − 2π f_s θ (rad, world small-angle vector)
      if (useServo) { // round 4: physical servo + EIS model after this loop (attitude.js servoMountEIS); store the frames
        Barr[i] = frameOf(bx, bz); const lv0 = sub([0, 0, 1], mul(cmdAx, cmdAx[2])); Tarr[i] = frameOf(cmdAx, len(lv0) > 1e-3 ? lv0 : bz);
        cax = cmdAx; cup = Tarr[i][2]; out.pan[i] = Math.atan2(dot(cax, by), dot(cax, bx)) / D2R;
        const crt0 = cross(cax, cup); camAx[i] = { pos: cpos, cax, cup, crt: crt0 }; camRate[i] = [0, 0, 0]; prevCax = cax; prevCup = cup;
        out.bodyRate[i] = att && flying[i] ? att.rateDeg[i] : 0;
        if (!filming) { g = null; losPrev = null; gArr[i] = null; continue; }
        const lp = losPrev || los, rate = mul(sub(los, lp), 1 / SDT); losPrev = los;
        const target = nrm(add(los, mul(rate, -0.04 * 0.2)));
        g = g ? nrm(add(g, mul(sub(target, g), 1 - Math.exp(-SDT * 2 * Math.PI * 3)))) : los;
        gArr[i] = g; continue;
      }
      const wb = att && att.rate[i] ? att.rate[i] : [0, 0, 0];
      eC = [eC[0] + (wb[0] - kS * eC[0]) * SDT, eC[1] + (wb[1] - kS * eC[1]) * SDT, eC[2] + (wb[2] - kS * eC[2]) * SDT];
      dbN = [aDb * dbN[0] + bDb * gsM(), aDb * dbN[1] + bDb * gsM(), aDb * dbN[2] + bDb * gsM()];
      const e = filming ? add(eC, dbN) : [0, 0, 0];
      cax = rot(cmdAx, e);
      const lv = sub([0, 0, 1], mul(cax, cax[2])); cup = len(lv) > 1e-3 ? nrm(lv) : bz; // roll servo levels the horizon
      cup = nrm(sub(rot(cup, e), mul(cax, dot(rot(cup, e), cax))));
      out.pan[i] = Math.atan2(dot(cax, by), dot(cax, bx)) / D2R;
    } else {
      if (cam.pan && filming) { // servo pan (pointing only): towards the subject azimuth in the body frame, 1 Hz, ≤150°/s, ±75°
        const want = Math.max(-75 * D2R, Math.min(75 * D2R, Math.atan2(dot(los, by), dot(los, bx))));
        const step = (want - pan) * (1 - Math.exp(-SDT * 2 * Math.PI * 1)); pan += Math.max(-2.6 * SDT, Math.min(2.6 * SDT, step));
      } else if (!filming) pan = 0;
      const ax0 = add(mul(bx, Math.cos(pan)), mul(by, Math.sin(pan)));
      if (cam.tilt && filming) { // tilt servo (pointing only): towards the subject elevation in the body frame, 1.5 Hz, ≤150°/s, −10…70° down
        const want = Math.max(-10 * D2R, Math.min(70 * D2R, Math.atan2(-dot(los, bz), dot(los, ax0))));
        const st = (want - tiltS) * (1 - Math.exp(-SDT * 2 * Math.PI * 1.5)); tiltS += Math.max(-2.6 * SDT, Math.min(2.6 * SDT, st));
      } else if (!filming || !cam.tilt) tiltS = tilt;
      cax = nrm(sub(mul(ax0, Math.cos(tiltS)), mul(bz, Math.sin(tiltS))));
      cup = nrm(add(mul(bz, Math.cos(tiltS)), mul(ax0, Math.sin(tiltS))));
      if (cam.roll && filming) { // roll servo (pointing only): levels the camera's horizon about its optical axis, 2 Hz, ≤300°/s, ±60°
        const lv = sub([0, 0, 1], mul(cax, cax[2])), lvn = len(lv) > 1e-3 ? nrm(lv) : cup;
        const want = Math.max(-60 * D2R, Math.min(60 * D2R, Math.atan2(dot(cross(cup, lvn), cax), dot(cup, lvn))));
        const st = (want - rollS) * (1 - Math.exp(-SDT * 2 * Math.PI * 2)); rollS += Math.max(-5.2 * SDT, Math.min(5.2 * SDT, st));
        const cr0 = cross(cax, cup); cup = nrm(add(mul(cup, Math.cos(rollS)), mul(cr0, Math.sin(rollS))));
      } else if (!filming) rollS = 0;
      out.pan[i] = pan / D2R;
    }
    const crt = cross(cax, cup);
    camAx[i] = { pos: cpos, cax, cup, crt };
    // camera rotation rate (world): from successive camera frames (body attitude + pan)
    if (prevCax) { const a = cross(prevCax, cax), b = cross(prevCup, cup), c = cross(cross(prevCax, prevCup), crt); camRate[i] = [(a[0] + b[0] + c[0]) / (2 * SDT), (a[1] + b[1] + c[1]) / (2 * SDT), (a[2] + b[2] + c[2]) / (2 * SDT)]; } else camRate[i] = [0, 0, 0];
    prevCax = cax; prevCup = cup;
    out.bodyRate[i] = att && flying[i] ? att.rateDeg[i] : 0;
    if (!filming) { g = null; losPrev = null; gArr[i] = null; continue; }
    // live subject tracker (UWB/leash geometry + image, ASSUMED 3 Hz loop, 80 % of 40 ms latency recovered)
    const lp = losPrev || los, rate = mul(sub(los, lp), 1 / SDT); losPrev = los;
    const target = nrm(add(los, mul(rate, -0.04 * 0.2)));
    g = g ? nrm(add(g, mul(sub(target, g), 1 - Math.exp(-SDT * 2 * Math.PI * 3)))) : los;
    gArr[i] = g;
  }
  // round 3: the clip is rendered after the run (Gyroflow-style post stabilisation + reframing from the 4K recording,
  // gyro log and subject track): the reframe path is a zero-phase 2nd-order low-pass (REFRAME.fr) of the subject
  // direction measured with an image-detection noise (REFRAME.noiseFrac of the subject's angular height per frame)
  if (p.reframe) {
    const rngR = mulberry32((opts.seed || 1) * 104729 + 7), gsR = () => { const u1 = Math.max(1e-12, rngR()), u2 = rngR(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    let i = 0;
    while (i < n) {
      if (!filmA[i]) { i++; continue; }
      let j = i; while (j < n && filmA[j]) j++;
      const comp = [new Float64Array(j - i), new Float64Array(j - i), new Float64Array(j - i)];
      // box-centre offset from the line of sight, slowly smoothed (zero-phase, centreHz) so re-centring adds no jitter
      const offA = [0, 1, 2].map((q) => { const a = new Float64Array(j - i); for (let k = i; k < j; k++) a[k - i] = aimArr[k][q] - losArr[k][q]; return p.cropCentre ? lpZero(a, p.centreHz ?? 0.25, SDT) : a; });
      for (let k = i; k < j; k++) {
        const s = rider(k * SDT), dd = Math.max(1, len(sub(s.pos, camAx[k].pos))), sig = REFRAME.noiseFrac * (1.6 / dd);
        const l = losArr[k]; for (let q = 0; q < 3; q++) comp[q][k - i] = l[q] + offA[q][k - i] + sig * gsR();
      }
      const f = comp.map((c) => lpZero(c, REFRAME.fr, SDT));
      for (let k = i; k < j; k++) gArr[k] = nrm([f[0][k - i], f[1][k - i], f[2][k - i]]);
      i = j;
    }
  }
  // round 4: physical 3-servo mount (dead band, backlash, slew/bandwidth, PWM frame, estimator latency) and component EIS
  // residual (sync, rolling shutter, scale/lens, gyro noise) — attitude.js servoMountEIS
  let sm = null;
  if (useServo) {
    sm = servoMountEIS(Barr, Tarr, filmA, n, SDT, { seed: opts.seed || 1, servo: { ...SERVO, ...(p.servo || {}) }, eis: { ...EIS, ...(p.eis || {}) } });
    for (let i = 0; i < n; i++) { const Cm = sm.C[i], cax = Cm[0], cup = Cm[2]; camAx[i] = { pos: camAx[i].pos, cax, cup, crt: cross(cax, cup) }; camRate[i] = sm.rate[i]; }
  }
  // stabilisation residual: gimbal acts on the base (body) rotation, EIS on the camera rotation
  const res = sm ? sm.res : residual(cam.stab, cam.stab === 'gimbal' ? (att ? att.rate : camRate) : camRate, n, SDT, filmA);
  // pass 2: output crop, footage, artefacts, clearances
  let vf = ox.vfFull;
  // crop ceiling: keep a pointing margin inside the sensor window (round 3: cropMax × full VFOV for the stabilised mount)
  const mg = (p.cropMargin ?? 5) * D2R; // pointing margin kept on every side of the crop (ASSUMED ≈ 2.5 σ of the mount + EIS error)
  const vfCapH = cam.optic === 'rect' ? (2 * Math.atan(Math.tan(ox.halfH - mg) * 9 / 16)) / D2R : (2 * (ox.halfH - mg) * 9 / 16) / D2R;
  const vfCap = cam.stabMount ? Math.max(ox.vfMin, Math.min(ox.vfFull - 2 * mg / D2R, vfCapH)) : ox.vfFull;
  const vfOk = (v) => Math.max(ox.vfMin, Math.min(vfCap, v));
  for (let i = 0; i < n; i++) {
    const t = i * SDT, s = rider(t);
    const md = MODES[O.mode[i]];
    const gp = [O.gx[i], O.gy[i], O.gz[i]], gv = [O.gvx[i], O.gvy[i], O.gvz[i]];
    const attached = md === 'stowed' || md === 'docked' || md === 'seat';
    out.keSnow[i] = 0.5 * p.mass * dot(gv, gv);
    const rv = sub(gv, s.vel); out.keRel[i] = 0.5 * p.mass * dot(rv, rv);
    out.filming[i] = filmA[i];
    if (attached) continue; // in the holster: no clearance, footage or KE exposure to evaluate
    const b = bodyPoints(s), caps = bodyCapsules(s, b);
    const bx = [O.fx[i], O.fy[i], O.fz[i]], bz = [O.ux[i], O.uy[i], O.uz[i]], by = cross(bz, bx);
    const tipK = O.fold[i] < 0.5 ? span / 2 : 0.05;
    const tips = [add(gp, mul(by, tipK)), add(gp, mul(by, -tipK)), add(gp, mul(bx, 0.17)), add(gp, mul(bx, -0.24))];
    out.headDist[i] = attached ? NaN : Math.min(...tips.map((q) => len(sub(q, b.head)))) - 0.14;
    // round 3 shared headClear: helmet centre to any part of the glider (tips, nose, tail) or of the leash over the whole
    // run; only the declared dock-capture window (snow pull with < 1 m of line left, then seating) is excluded
    const capWin = (md === 'snowpull' && O.L[i] < 1.0);
    out.capWin[i] = capWin ? 1 : 0;
    if (!capWin) {
      let hc = Math.min(...tips.map((q) => len(sub(q, b.head))));
      if (i % 2 === 0 || !Number.isFinite(out.headC[i - 1])) { const lp = leashAt(O, i, false, core.tanS); if (lp) for (let j = 0; j + 1 < lp.length; j++) hc = Math.min(hc, segSegDist(lp[j], lp[j + 1], b.head, b.head)); }
      else hc = Math.min(hc, out.headC[i - 1]);
      out.headC[i] = hc;
    }
    const arms = caps.filter((c) => c[3] === 'arm');
    out.handDist[i] = attached ? NaN : Math.min(...tips.flatMap((q) => arms.map((c) => len(sub(q, c[1]))))) - 0.06;
    if (opts.branch) { const B = opts.branch, bzz = -B.x * core.tanS + B.h; out.branchDist[i] = Math.min(...tips.map((q) => segSegDist(q, q, [B.x, B.y0, bzz], [B.x, B.y1, bzz]))) - 0.04; }
    // round 3 shared line-exposure gate: line height above the snow 1 m and 2 m (horizontal) behind the rider's feet
    if (i % 5 === 0 && O.hookOn[i] && O.L[i] > 0.5) {
      const lp = leashAt(O, i, false, core.tanS);
      if (lp) { const f0 = s.pos; let h1 = NaN, h2 = NaN;
        for (let j = 0; j + 1 < lp.length; j++) { const da = Math.hypot(lp[j][0] - f0[0], lp[j][1] - f0[1]), db = Math.hypot(lp[j + 1][0] - f0[0], lp[j + 1][1] - f0[1]);
          for (const [D, set] of [[1, (v) => { if (!Number.isFinite(h1)) h1 = v; }], [2, (v) => { if (!Number.isFinite(h2)) h2 = v; }]]) if ((da - D) * (db - D) <= 0 && Math.abs(db - da) > 1e-9) { const u = (D - da) / (db - da), z = lp[j][2] + u * (lp[j + 1][2] - lp[j][2]), x = lp[j][0] + u * (lp[j + 1][0] - lp[j][0]); set(z + x * core.tanS); } }
        out.lineH1[i] = h1; out.lineH2[i] = h2;
        // round 4 trip-hazard profile (audit3 A3-TG-06): line height above the snow where it crosses horizontal distance D
        // from the feet (first crossing), D = 0.5…3 m, and the length of line 1–3 m from the feet lying lower than 0.3 m
        let low = 0;
        for (let j = 0; j + 1 < lp.length; j++) { const a = lp[j], c = lp[j + 1], da = Math.hypot(a[0] - f0[0], a[1] - f0[1]), db = Math.hypot(c[0] - f0[0], c[1] - f0[1]);
          const ha = a[2] + a[0] * core.tanS, hb = c[2] + c[0] * core.tanS;
          for (let k = 0; k < TRIP_D.length; k++) { const D = TRIP_D[k]; if (!Number.isFinite(trip[k][i]) && (da - D) * (db - D) <= 0 && Math.abs(db - da) > 1e-9) { const u = (D - da) / (db - da); trip[k][i] = ha + u * (hb - ha); } }
          if (Math.max(da, db) <= 3 && Math.min(da, db) >= 1 && Math.max(ha, hb) < 0.3) low += Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]); }
        out.lowLen[i] = low; }
    }
    // leash clearance to body / skis / poles every 0.1 s (first 0.4 m out of the funnel = holster lip skipped)
    if (i % 5 === 0 && O.L[i] > 0.4 && !attached) {
      const ptsC = leashAt(O, i, false, core.tanS);
      if (ptsC) {
        let cb = Infinity, cs = Infinity, cpl = Infinity, acc = 0;
        for (let j = 0; j + 1 < ptsC.length; j++) {
          const a = ptsC[j], c = ptsC[j + 1], sl = len(sub(c, a)); acc += sl;
          if (acc < 0.4) continue;
          for (const [P, Q, r, name] of caps) {
            if (name === 'pack') continue;
            const d = segSegDist(a, c, P, Q) - r;
            if (name === 'ski') cs = Math.min(cs, d); else if (name === 'pole') cpl = Math.min(cpl, d); else cb = Math.min(cb, d);
          }
        }
        for (let k = i; k < Math.min(n, i + 5); k++) { out.clearBody[k] = cb; out.clearSki[k] = cs; out.clearPole[k] = cpl; }
      }
    }
    if (!filmA[i] || !gArr[i]) { continue; }
    const { pos: cpos, cax, cup, crt } = camAx[i];
    const g = gArr[i], los = losArr[i];
    const f0 = footage({ pos: cpos, kind: 'rect', fwd: g, up: [0, 0, 1], vfovDeg: vf, w: 1920, h: 1080 }, s);
    let vfT = f0.angSizeDeg / 0.42;
    if (cam.stabMount) { // round 3 auto-zoom: the whole subject (incl. skis) spans ≤ cropFill of the half-frame both ways
      const fw = nrm(g), rr = nrm(cross(fw, [0, 0, 1])), uu = cross(rr, fw); let ex = 0, ey = 0;
      const SP = subjectPoints(s);
      let ebx = 0, eby = 0;
      for (const q of [SP.feet, SP.head, SP.shL, SP.shR, SP.skiTip, SP.skiTail]) { const d = sub(q, cpos), z = Math.max(0.05, dot(d, fw)), ax = Math.abs(dot(d, rr) / z), ay = Math.abs(dot(d, uu) / z); ex = Math.max(ex, ax); ey = Math.max(ey, ay); if (q !== SP.skiTip && q !== SP.skiTail) { ebx = Math.max(ebx, ax); eby = Math.max(eby, ay); } }
      const fill = p.cropFill ?? 0.7;
      vfT = (2 * Math.atan(Math.max(ey / fill, (ex * 9) / (16 * fill)))) / D2R;
      // round 4 (avail judged on bodyPx, audit3 A3-X-04): frame the BODY at cropFillBody of the half-frame and only
      // require the whole subject incl. skis to stay inside cropFillAll (skis may run close to the frame edge)
      if (p.cropFillBody) vfT = (2 * Math.atan(Math.max(Math.max(eby, (ebx * 9) / 16) / p.cropFillBody, Math.max(ey, (ex * 9) / 16) / (p.cropFillAll ?? 0.92)))) / D2R;
    }
    vf += (vfOk(vfT) - vf) * (1 - Math.exp(-SDT / 0.3));
    let gOut = g, fit = 1;
    if (!cam.gimbal && !cropFits(g, vf, cam, ox, cax, cup, crt)) {
      // the level crop must stay inside the sensor window: pull it towards the optical axis
      let lo = 0, hi = 1;
      for (let k = 0; k < 10; k++) { const mI = (lo + hi) / 2; if (cropFits(nrm(add(mul(cax, 1 - mI), mul(g, mI))), vf, cam, ox, cax, cup, crt)) lo = mI; else hi = mI; }
      gOut = nrm(add(mul(cax, 1 - lo), mul(g, lo))); fit = lo;
    }
    const e = res[i] || [0, 0, 0];
    gOut = rot(gOut, e);
    const camObj = { pos: cpos, kind: 'rect', fwd: gOut, up: [0, 0, 1], vfovDeg: vf, w: 1920, h: 1080 };
    const f = footage(camObj, s);
    out.subjectPx[i] = f.inFrame ? f.subjectPx : 0; out.bodyPx[i] = f.inFrame ? f.bodyPx : 0; out.inFrame[i] = f.inFrame; out.az[i] = f.az; out.elev[i] = f.elev; out.dist[i] = f.dist; out.vfov[i] = vf; out.fit[i] = fit;
    out.offAxis[i] = Math.acos(Math.max(-1, Math.min(1, dot(los, cax)))) / D2R;
    { const th = Math.acos(Math.max(-1, Math.min(1, dot(los, cax)))), a = dot(los, crt), bb = dot(los, cup), l = Math.hypot(a, bb) || 1; out.sx[i] = (th * a) / l / D2R; out.sy[i] = (th * bb) / l / D2R; }
    out.cfx[i] = gOut[0]; out.cfy[i] = gOut[1]; out.cfz[i] = gOut[2]; out.cpx[i] = cpos[0]; out.cpy[i] = cpos[1]; out.cpz[i] = cpos[2];
    out.lx[i] = los[0]; out.ly[i] = los[1]; out.lz[i] = los[2];
    out.resid[i] = Math.hypot(...e) / D2R;
    // motion blur in output px during a 1 ms exposure: EIS cannot remove intra-frame rotation; a gimbal leaves its residual rate
    const w = camRate[i] || [0, 0, 0], wp = sub(w, mul(gOut, dot(w, gOut)));
    const ep = i > 0 && res[i - 1] ? mul(sub(e, res[i - 1]), 1 / SDT) : [0, 0, 0];
    const blurRate = cam.stab === 'gimbal' ? Math.hypot(...ep) + 0.03 * Math.hypot(...wp) : Math.hypot(...wp);
    out.blurPx[i] = blurRate * STAB.exposureS * (540 / Math.tan((vf * D2R) / 2));
    if (i % 2 === 0 || i === n - 1) {
      const pts = leashAt(O, i, true, core.tanS);
      if (pts) { const lf = lineInFrame(camObj, caps, pts, p.dLine / 1000); out.art[i] = lf.artPx; out.artW[i] = lf.wOver; out.lineVis[i] = lf.visPx; }
      else { out.art[i] = 0; out.artW[i] = 0; out.lineVis[i] = 0; }
    } else { out.art[i] = out.art[i - 1] ?? 0; out.artW[i] = out.artW[i - 1] ?? 0; out.lineVis[i] = out.lineVis[i - 1] ?? 0; }
  }
  return { cols: out, trip: { D: TRIP_D, h: trip }, vfMin: ox.vfMin, vfFull: ox.vfFull, optics: ox, cam, att, mountErrRmsDeg: sm ? sm.mountErrRmsDeg : NaN };
}
