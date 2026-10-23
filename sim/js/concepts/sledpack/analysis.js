// sledpack analysis (adapted from activetether/analysis.js): camera chain (sensor-only tracker → gyro-EIS crop) on the
// pod at the bridle apex, footage on the shared footage() rule (bodyPx, 1080p-equivalent crop limited by native
// resolution), line-in-frame artefacts on the shared artefactCounts() rule, head clearance to helmetAt() split into the
// kite (sail outline + pod) and the line, ground-frame KE, 50 ms body force, line-low-behind-rider and third-party
// exposure. Tracker/crop never read the truth; the judge (metric code) does.
import { footage, subjectPoints } from '../common/env.js';
import { artefactCounts, ARTEFACT_PX } from '../common/fullrun.js';
import { skierAt, bodyPoints } from '../common/skier.js';
import { mulberry32, gaussian } from '../../model/util.js';
import { optics, SENS, CAMERA, SLED, LINE } from './design.js';
import { MODE, AIRBORNE } from './model.js';

const D2R = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, f = [1, 0, 0]) => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : f; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// rotate v by a small rotation vector r (Rodrigues)
function rot(v, r) {
  const th = len(r); if (th < 1e-12) return v;
  const k = mul(r, 1 / th), c = Math.cos(th), s = Math.sin(th);
  return add(add(mul(v, c), mul(crs(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}
function segPointDist(p, a, b) { const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / Math.max(1e-9, dot(ab, ab)), 0, 1); return len(sub(p, add(a, mul(ab, t)))); }

// line polyline (model coords): sleeve mouth → bridle apex, parabolic sag
export function linePoints(O, i, nPer = 14, dense = false) {
  if (!(O.cut[i] === 0) || !Number.isFinite(O.fx[i])) return null;
  if (!AIRBORNE(O.mode[i])) return null;
  const E = [O.ex[i], O.ey[i], O.ez[i]], F = [O.fx[i], O.fy[i], O.fz[i]], sg = [O.sag1x[i], O.sag1y[i], O.sag1z[i]];
  const us = []; for (let j = 0; j <= nPer; j++) us.push(j / nPer);
  if (dense) for (let j = 1; j < 14; j++) { us.push(1 - 0.004 * Math.pow(1.45, j)); us.push(0.004 * Math.pow(1.45, j)); }
  us.sort((x, y) => x - y);
  return us.filter((u) => u >= 0 && u <= 1).map((u) => add(add(E, mul(sub(F, E), u)), mul(sg, 4 * u * (1 - u))));
}

// sail geometry in world coords: centre = apex + bridle along the line, nose along hk, span ⟂
export function sailPts(O, i, p) {
  const P = [O.fx[i], O.fy[i], O.fz[i]], n = [O.bfx[i], O.bfy[i], O.bfz[i]], c = [O.bux[i], O.buy[i], O.buz[i]];
  const sp = unit(crs(n, c), [0, 1, 0]), k0 = p.geo || { span: SLED.span, chord: SLED.chord, bridle: SLED.bridle };
  // collapsed/flagged (and still folded at launch): a bundle ≈0.25 × span wide, 0.7 × bridle from the apex (review RV-03)
  const k = O.collapsed[i] === 1 ? { span: k0.span * 0.25, chord: k0.chord, bridle: k0.bridle * 0.7 } : k0;
  const C = add(P, mul(c, k.bridle));
  return { apex: P, centre: C, nose: add(C, mul(n, k.chord / 2)), tail: add(C, mul(n, -k.chord / 2)), tipL: add(C, mul(sp, k.span / 2)), tipR: add(C, mul(sp, -k.span / 2)) };
}
export function camPosOf(O, i) {
  const P = [O.fx[i], O.fy[i], O.fz[i]], c = [O.bux[i], O.buy[i], O.buz[i]];
  const dn = unit(sub([0, 0, -1], mul(c, -c[2])), [0, 0, -1]);
  return add(P, mul(dn, CAMERA.podOffset));
}

const boxMid = (s) => { const q = subjectPoints(s); return mul(add(add(q.feet, q.head), add(q.shL, q.shR)), 0.25); };

export function analyse(core, opts = {}) {
  const { O, n, SDT, p, sk, tanS } = core;
  const ox = optics();
  const keys = ['filming', 'cpx', 'cpy', 'cpz', 'cfx', 'cfy', 'cfz', 'vfov', 'bodyPx', 'subjectPx', 'inFrame', 'az', 'elevV', 'dist', 'art', 'artW', 'fit', 'avail',
    'headClear', 'headFlyer', 'headLine', 'ke', 'keFlyer', 'kePod', 'lowLine2', 'lowAny', 'Fbody', 'lowLine', 'lowLen', 'thirdP', 'lineH1', 'lineH3', 'offAxis', 'aimErr'];
  const out = {}; for (const k of keys) out[k] = new Float64Array(n).fill(NaN);
  const rng = mulberry32((opts.seed ?? 7) * 911 + 3), g = () => gaussian(rng) * (p.noise ?? 1);
  const riding = opts.riding || null;
  // ---- pack AHRS error for the subject offset (fixed per run, ASSUMED)
  const yawE = g() * SENS.ahrs.yawDeg * D2R, tiltE = g() * SENS.ahrs.tiltDeg * D2R;
  // ---- vision drop-out schedule (bursts of 0.3–1 s, 10 % of the time)
  const drop = new Uint8Array(n);
  { let i = 0; while (i < n) { if (rng() < (SENS.vision.dropout * SDT) / 0.6) { const L = Math.round((0.3 + 0.7 * rng()) / SDT); for (let k = i; k < Math.min(n, i + L); k++) drop[k] = 1; i += L; } else i++; } }
  const latN = Math.round(SENS.vision.lat / SDT);
  // ---- camera position / base attitude per sample
  const camPos = new Array(n).fill(null), baseX = new Array(n).fill(null), baseU = new Array(n).fill(null), subj = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const m = O.mode[i];
    const s = skierAt(sk, i * SDT);
    subj[i] = s;
    // footage is delivered only in stable flight with an open sail (launch, collapse, retrieve, tow, capture not delivered)
    if (m !== MODE.FLY || O.collapsed[i] === 1 || !Number.isFinite(O.fx[i])) continue;
    const c = [O.bux[i], O.buy[i], O.buz[i]];
    camPos[i] = camPosOf(O, i);
    // I10b: the lens is tilted camTiltDeg from the line toward the rider's upper body (the eyelet sits ≈0.9 m below the
    // body centre; a fixed tilt keeps the crop inside the 66° sensor on short light-air lines)
    { const dn = mul(c, -1), upP = unit(sub([0, 0, 1], mul(dn, dn[2])), [0, 0, 1]), a = (p.camTiltDeg ?? 0) * D2R; baseX[i] = unit(add(mul(dn, Math.cos(a)), mul(upP, Math.sin(a)))); } baseU[i] = unit([O.bfx[i], O.bfy[i], O.bfz[i]]);
  }
  if (p.dbgCam & 4) { let c = null; const k = 1 - Math.exp(-SDT / 0.3); for (let i = 0; i < n; i++) { if (!camPos[i]) { c = null; continue; } c = c ? add(c, mul(sub(camPos[i], c), k)) : camPos[i]; camPos[i] = c; } }
  // the logged nose/up follow the instantaneous airflow; the airframe's rotational inertia (weathercock yaw/pitch modes)
  // low-passes them: τ 0.08 s (ASSUMED) before they are used as the camera-mount base attitude
  { let bx = null, bu = null; const k = 1 - Math.exp(-SDT / (p.baseTau ?? 0.08));
    for (let i = 0; i < n; i++) { if (!baseX[i]) { bx = bu = null; continue; } if (!bx) { bx = baseX[i]; bu = baseU[i]; } bx = unit(add(bx, mul(sub(baseX[i], bx), k))); bu = unit(add(bu, mul(sub(baseU[i], bu), k))); baseX[i] = bx; baseU[i] = bu; } }
  // ---- tracker: aim from (a) geometry estimate: subject offset from the pack AHRS + camera estimate from exit angle ×
  //      metered length/UWB, (b) vision bearing (σ 0.3°, 30 Hz, 60 ms, drop-outs) — fused; 2nd-order smoother at cropFc
  const aimRaw = new Array(n).fill(null);
  let gBias = null;
  for (let i = 0; i < n; i++) {
    if (!camPos[i]) continue;
    const s = subj[i], E = [O.ex[i], O.ey[i], O.ez[i]];
    // aim point: the vertical body centre above the feet (the shared footageStability subject point), not the leaning torso
    // aim point: centre of the detected body box (feet, head, shoulders) — what a person detector returns; it follows
    // the lean in a carve (round-1 trackers aimed at the vertical centre above the feet and lost the head)
    const mid = boxMid(s);
    // geometry estimate (relative to the exit): subject offset rotated by the AHRS error; camera from the estimates
    const offT = sub(mid, E), cy = Math.cos(yawE), sy = Math.sin(yawE);
    const offE = [offT[0] * cy - offT[1] * sy, offT[0] * sy + offT[1] * cy, offT[2] + tiltE * Math.hypot(offT[0], offT[1])];
    // camera estimate: measured exit line angle (+AHRS) × metered length, pod offset
    const cE = unit(sub([O.fx[i], O.fy[i], O.fz[i]], E)), ae = (SENS.lineAngle.biasDeg + SENS.ahrs.tiltDeg) * D2R * 0.5;
    const camRelE = add(mul(unit([cE[0] + ae, cE[1] - ae, cE[2] + ae]), O.L[i] * 1.01), [0, 0, -CAMERA.podOffset]);
    const geo = unit(sub(offE, camRelE));
    // vision bearing (delayed) when available
    const j = i - latN;
    let vis = null;
    if (j >= 0 && camPos[j] && !drop[j] && (j % Math.max(1, Math.round(1 / SENS.vision.rate / SDT)) <= 1)) {
      const sj = subj[j], los = unit(sub(boxMid(sj), camPos[j]));
      vis = rot(los, [g() * SENS.vision.sigmaDeg * D2R, g() * SENS.vision.sigmaDeg * D2R, g() * SENS.vision.sigmaDeg * D2R]);
    }
    // fusion: the geometry estimate carries a slowly varying bias (AHRS, line sag, pod offset); learn it while vision
    // is available (0.3 Hz) and keep applying it through vision drop-outs, so drop-outs do not step the crop
    if (vis) { const d = sub(vis, geo); gBias = gBias ? add(gBias, mul(sub(d, gBias), 1 - Math.exp(-2 * Math.PI * 0.3 * SDT))) : d; }
    const geoC = gBias ? unit(add(geo, gBias)) : geo;
    aimRaw[i] = p.dbgCam & 1 ? unit(sub(mid, camPos[i])) : vis ? unit(add(mul(vis, 0.5), mul(geoC, 0.5))) : geoC;
    out.aimErr[i] = Math.acos(clamp(dot(geo, unit(sub(mid, camPos[i]))), -1, 1)) / D2R;
  }
  // reframing tracker: alpha–beta (constant angular-rate) filter on the aim direction, bandwidth cropFc — a type-2 loop
  // that follows the steady LOS sweep of carving without the lag of a plain low-pass (the kite swings behind the rider
  // at the turn rate); reset at gaps. Uses only aimRaw (vision/geometry estimates).
  const fc = p.cropFc ?? 1.5, wn = 2 * Math.PI * fc, ab = 1 - Math.exp(-2 * 0.8 * wn * SDT), bb = (wn * SDT) ** 2;
  const aim = new Array(n).fill(null);
  let s1 = null, v1 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (!aimRaw[i]) { s1 = null; continue; }
    if (!s1) { s1 = aimRaw[i]; v1 = [0, 0, 0]; aim[i] = s1; continue; }
    const pr = unit(add(s1, mul(v1, SDT))), r = sub(aimRaw[i], pr);
    s1 = unit(add(pr, mul(r, ab))); v1 = add(v1, mul(r, bb / SDT));
    v1 = sub(v1, mul(s1, dot(v1, s1)));
    aim[i] = s1;
  }
  // ---- EIS residual (attitude drift OU + fraction of the high-frequency base rotation + gyro/frame sync) and mount
  let drift = [0, 0, 0], driftR = [0, 0, 0], prevX = null, prevU = null, rotLP = [0, 0, 0], hfAng = [0, 0, 0];
  const tauD = 5, sigD = SENS.camAtt.driftDeg * D2R;
  let vf = ox.vfMin * 1.5;
  for (let i = 0; i < n; i++) {
    if (!aim[i]) { prevX = prevU = null; continue; }
    const X = baseX[i], U = baseU[i];
    let w = [0, 0, 0];
    if (prevX) { const dx = crs(prevX, X), du = crs(prevU, U); w = mul(add(dx, du), 0.5 / SDT); } // base angular rate (rad/s), approx
    prevX = X; prevU = U;
    // attitude drift: Gauss–Markov (σ 0.8°, τ 5 s), optionally passed through a 0.2 Hz low-pass. A first-order OU sampled at 50 Hz
    // has a white angular-rate spectrum (≈2.5 °/s RMS above 1 Hz) that a slowly wandering attitude estimate does not
    // have (activetether keeps the raw OU; noted in research/sledpack_2026_10_21/dev/REPORT.md)
    // I9 (review RV-04): judged with the SAME raw OU as activetether (like-for-like); p.driftLP = 1 reports the band-
    // limited variant as a sensitivity (the more plausible physics, but not the shared basis)
    for (let k = 0; k < 3; k++) { driftR[k] += (-driftR[k] / tauD) * SDT + sigD * Math.sqrt((2 * SDT) / tauD) * gaussian(rng); drift[k] = p.driftLP ? drift[k] + (driftR[k] - drift[k]) * (1 - Math.exp(-2 * Math.PI * 0.2 * SDT)) : driftR[k]; }
    rotLP = add(rotLP, mul(sub(w, rotLP), Math.min(1, SDT / 0.5)));
    const hf = sub(w, rotLP); // high-frequency part of the base rate
    hfAng = add(mul(hfAng, 1 - SDT / 0.5), mul(hf, SDT)); // high-frequency rotation angle (leaky integral)
    const resid = add(drift, add(mul(hfAng, SENS.camAtt.eisFrac), mul(w, SENS.camAtt.syncS)));
    let fwd = p.dbgCam & 2 ? aim[i] : unit(rot(aim[i], resid));
    // fixed lens on the pod: the crop must fit the 66° sensor around the pod's (low-passed) optical axis — the pod looks
    // down the line (review RV-09: the earlier offAx = 0 made the fit check vacuous)
    const offAx = Math.acos(clamp(dot(fwd, X), -1, 1));
    out.offAxis[i] = offAx / D2R;
    // framing: body (feet→head/shoulders) at 0.6 of the half-frame, whole subject incl. skis within 0.92
    const s = subj[i], SP = subjectPoints(s), cp = camPos[i];
    const r = unit(crs(fwd, [0, 0, 1]), [0, 1, 0]), u = crs(r, fwd);
    let ex = 0, ey = 0, ebx = 0, eby = 0;
    for (const q of [SP.feet, SP.head, SP.shL, SP.shR, SP.skiTip, SP.skiTail]) {
      const d = sub(q, cp), z = Math.max(0.05, dot(d, fwd)), axx = Math.abs(dot(d, r) / z), ayy = Math.abs(dot(d, u) / z);
      ex = Math.max(ex, axx); ey = Math.max(ey, ayy); if (q !== SP.skiTip && q !== SP.skiTail) { ebx = Math.max(ebx, axx); eby = Math.max(eby, ayy); }
    }
    const vfT = (2 * Math.atan(Math.max(Math.max(eby, (ebx * 9) / 16) / (p.fillBody ?? 0.6), Math.max(ey, (ex * 9) / 16) / (p.fillAll ?? 0.92)))) / D2R;
    vf += (clamp(vfT, ox.vfMin, ox.vfNative * 0.95) - vf) * (1 - Math.exp(-SDT / 0.3));
    // crop must lie inside the sensor window around the optical axis
    const halfV = (vf * D2R) / 2, halfH = Math.atan(Math.tan(halfV) * 16 / 9);
    const marginV = ox.halfV - halfV - offAx, marginH = ox.halfH - halfH - offAx;
    out.fit[i] = marginV >= 0 && marginH >= 0 ? 1 : 0;
    // (if the crop does not fit the sensor window the frame is counted unusable; the crop axis itself stays continuous)
    const cam = { pos: cp, kind: 'rect', fwd, up: [0, 0, 1], vfovDeg: vf, w: CAMERA.out[0], h: CAMERA.out[1] };
    const f = footage(cam, s);
    out.filming[i] = 1; out.cpx[i] = cp[0]; out.cpy[i] = cp[1]; out.cpz[i] = cp[2]; out.cfx[i] = fwd[0]; out.cfy[i] = fwd[1]; out.cfz[i] = fwd[2]; out.vfov[i] = vf;
    out.bodyPx[i] = f.inFrame ? f.bodyPx : 0; out.subjectPx[i] = f.inFrame ? f.subjectPx : 0; out.inFrame[i] = f.inFrame; out.az[i] = f.az; out.elevV[i] = f.elev; out.dist[i] = f.dist;
    // ---- line in frame (shared rule): projected line points over the subject box with width ≥ 2 px
    const pts = linePoints(O, i, 10, true);
    let artW = 0, art = 0;
    if (pts) {
      const tv = Math.tan(halfV), th = tv * 16 / 9, fpx = 540 / tv;
      const proj = (q) => { const d = sub(q, cp), z = dot(d, fwd); if (z <= 0.02) return null; return [(dot(d, r) / z / th) * 960, (dot(d, u) / z / tv) * 540, z]; };
      const box = [SP.feet, SP.head, SP.shL, SP.shR, SP.skiTip, SP.skiTail].map(proj).filter(Boolean);
      if (box.length) {
        const bx0 = Math.min(...box.map((b) => b[0])), bx1 = Math.max(...box.map((b) => b[0])), by0 = Math.min(...box.map((b) => b[1])), by1 = Math.max(...box.map((b) => b[1]));
        // camera-side end of the line: for the flyer camera the tow point, for the pod the clamp just above the lens
        for (const q of pts) {
          const P = proj(q); if (!P) continue;
          if (Math.abs(P[0]) > 960 || Math.abs(P[1]) > 540) continue;
          const wpx = (LINE.d * fpx) / P[2];
          const over = P[0] >= bx0 && P[0] <= bx1 && P[1] >= by0 && P[1] <= by1;
          if (over) { artW = Math.max(artW, wpx); if (artefactCounts(over, wpx)) art = 1; }
        }
      }
    }
    out.art[i] = art; out.artW[i] = artW;
    out.avail[i] = out.filming[i] && f.inFrame && out.bodyPx[i] >= 300 && !art && out.fit[i] ? 1 : 0;
  }
  // ---- safety geometry (truth, judge only)
  const FB = new Float64Array(n);
  // shared rule: only the last ≤3 s of each capture window (before the dock) is excluded from headClear (review 2026-10-20 SE-01)
  const capEx = new Uint8Array(n);
  { const w = Math.round(3 / SDT); let i = 0; while (i < n) { if (O.capWin[i] !== 1) { i++; continue; } let j = i; while (j < n && O.capWin[j] === 1) j++; for (let k = Math.max(i, j - w); k < j; k++) capEx[k] = 1; i = j; } }
  for (let i = 0; i < n; i++) {
    const m = O.mode[i];
    FB[i] = Math.hypot(O.Fbx[i], O.Fby[i], O.Fbz[i]) || 0;
    if (!AIRBORNE(m)) continue;
    const H = [O.hx[i], O.hy[i], O.hz[i]];
    const capWin = capEx[i] === 1;
    const SPt = sailPts(O, i, p);
    let dF = Math.min(...Object.values(SPt).map((q) => len(sub(q, H))));
    dF = Math.min(dF, segPointDist(H, SPt.tipL, SPt.tipR), segPointDist(H, SPt.nose, SPt.tail), segPointDist(H, SPt.apex, SPt.centre));
    let dL = 99;
    const pts = linePoints(O, i, 16);
    if (pts) for (let k = 1; k < pts.length; k++) dL = Math.min(dL, segPointDist(H, pts[k - 1], pts[k]));
    // I11 release episode (review R2-01): a launch from the back starts with the open sail lying on the back (nose at the
    // shoulder seats, ≈0.57 m from the helmet); the peel-off is not in the point-mass dynamics, so for relT s after the
    // release the sail outline is blended from the stowed pose to the modelled flight pose (ASSUMED 0.8 s) and the
    // bridle lies from the sail centre to the hip ring
    const tl = O.launchBack ? O.launchBack[i] : -99, relT = p.relT ?? 0.8;
    if (tl >= 0 && i * SDT - tl < relT) {
      const b0 = (i * SDT - tl) / relT, b = b0 * b0 * (3 - 2 * b0), s = subj[i] || skierAt(sk, i * SDT), bp = bodyPoints(s), up = bp.up, hd = s.heading, lf = bp.left;
      const E = [O.ex[i], O.ey[i], O.ez[i]], g = p.geo, C = add(add(E, mul(up, 0.32)), mul(hd, -0.07));
      const st = [add(C, mul(up, g.chord / 2)), add(C, mul(up, -g.chord / 2)), add(C, mul(lf, g.span / 2)), add(C, mul(lf, -g.span / 2)), C];
      const fl = [SPt.nose, SPt.tail, SPt.tipL, SPt.tipR, SPt.centre];
      const bl = st.map((q, k) => add(mul(q, 1 - b), mul(fl[k], b)));
      dF = Math.min(dF, ...bl.map((q) => len(sub(q, H))), segPointDist(H, bl[2], bl[3]), segPointDist(H, bl[0], bl[1]));
      dL = Math.min(dL, segPointDist(H, E, bl[4]));
      out.headClear[i] = capWin ? NaN : Math.min(dF, dL);
    }
    out.headFlyer[i] = capWin ? NaN : dF; out.headLine[i] = capWin ? NaN : dL;
    out.headClear[i] = capWin ? NaN : Math.min(dF, dL);
    // KE: ground frame beyond 1.5 m from the rider (helmet/pelvis), rider frame within
    const vF = [O.fvx[i], O.fvy[i], O.fvz[i]], vE = [O.evx[i], O.evy[i], O.evz[i]];
    const nearF = Math.min(len(sub([O.fx[i], O.fy[i], O.fz[i]], H)), len(sub([O.fx[i], O.fy[i], O.fz[i]], [O.ex[i], O.ey[i], O.ez[i]]))) < 1.5;
    const keF = 0.5 * p.m * (nearF ? len(sub(vF, vE)) ** 2 : dot(vF, vF));
    out.keFlyer[i] = keF; out.kePod[i] = 0; out.ke[i] = keF;
    // line low behind the rider: any line point within 3 m (horizontal) behind the feet below 1.8 m above the snow
    // (the rigid quiver itself is not counted); third-party (product): any line point below 2 m more than 0.5 m behind
    if (pts) {
      const s = subj[i], back = unit([-s.heading[0], -s.heading[1], 0]);
      let low = false, lowMax = 0, third = false, h1 = 99, h3 = 99;
      for (const q of pts) {
        const d = sub(q, s.pos), behind = dot(d, back), lat = Math.abs(d[0] * -back[1] + d[1] * back[0]);
        const hs = q[2] - -q[0] * tanS;
        if (behind > 0.75 && behind <= 3 && lat < 1.5 && hs < 1.8) { low = true; lowMax = Math.max(lowMax, behind); }
        if (behind > 0.5 && hs < 2.0) third = true;
        if (Math.abs(behind - 1) < 0.35 && lat < 1.5) h1 = Math.min(h1, hs);
        if (Math.abs(behind - 3) < 0.35 && lat < 1.5) h3 = Math.min(h3, hs);
      }
      // clothesline (product): any line point < 2 m above the snow more than 1 m behind the exit
      let low2 = false; const Eh = [O.ex[i], O.ey[i]];
      for (const q of pts) { const behindE = (q[0] - Eh[0]) * back[0] + (q[1] - Eh[1]) * back[1]; if (behindE > 1 && q[2] - -q[0] * tanS < 2) low2 = true; }
      out.lowLine2[i] = low2 ? 1 : 0;
      out.lowLine[i] = low ? 1 : 0; out.lowLen[i] = low ? lowMax - 0.75 : 0; out.thirdP[i] = third ? 1 : 0;
      out.lineH1[i] = h1 < 99 ? h1 : NaN; out.lineH3[i] = h3 < 99 ? h3 : NaN;
    }
  }
  // 50 ms moving mean of the device force on the body (computed on the 2 ms integration grid in model.js)
  for (let i = 0; i < n; i++) out.Fbody[i] = Number.isFinite(O.F50[i]) ? O.F50[i] : FB[i];
  void riding; void ARTEFACT_PX; void CAMERA;
  return out;
}
