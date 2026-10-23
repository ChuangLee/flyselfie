// towglider physics core (SIM-031): gravity glider on a reel-controlled leash.
//
// Time-stepped, deterministic, Node-safe. Model coordinates (x downslope, y left,
// z up; planar snow z = −x·tanθ).
//  • Glider: 3-DOF point mass with a parabolic low-Re polar (CD0 + CL²/(π·e·AR),
//    CL ≤ CLmax), bank-to-turn (bank lag + rate limit), CL lag, split-flap airbrake,
//    optional sweep morph, folded-dart drag, belly-skid snow contact (Coulomb).
//    Wind = shared makeWind (Taylor advection) + skier wake (far-wake similarity).
//  • Leash: massless (0.025 g/m ≪ glider) quasi-static elastic line with drag and
//    sag: each span is a parabola bowed by the distributed perpendicular load
//    (cylinder cross-flow drag + weight); the tension T solves
//    L·(1 + T/EA) = Σ [ℓ + q²ℓ³/(24T²)]  (elastic parabolic catenary), so a slack
//    line in the airflow bows instead of going to zero tension. End forces follow
//    the parabola tangents; a contact point (crossing skier, branch) splits it into
//    two spans with equal tension (frictionless sliding, ASSUMED).
//  • Reel: drum with equivalent line mass, tension-mode motor (set-point from the
//    glider's tow request), retract-speed limit, slip clutch (pays out freely above
//    F_clutch), pawl/free/protect/failed modes, hip cutter at the spool end.
//  • Glider controller: rider-relative station in a low-passed course frame
//    (smoothed path through turns), PD + feed-forward → required aero force →
//    allocation to lift vector (CL, bank) and airbrake; any thrust shortfall is
//    requested from the reel as tow tension. KE governor, tailwind weave,
//    launch (drop → sled tow → winch), dock (land beside + snow winch, or
//    in-motion reel-in), fall abort, tow-hook release on snag/strike, free flight.
// Evidence: numerical-uncalibrated simulation. Coefficients are ASSUMED or taken
// from research/concepts_2026_10_19/inventor/calc_slope_glider.py, calc_leash_reel.py.
import { skierAt, bodyPoints } from '../common/skier.js';
import { makeWind } from '../common/env.js';
import { windEstimate } from '../common/fullrun.js';
import { mulberry32 } from '../../model/util.js';

export const G = 9.81;

export const PDEF = {
  // airframe (round-2 baseline: 121 g from common/components.js + 15 % margin, see design.js; ASSUMED)
  mass: 0.1323, S: 0.075, AR: 8, cd0: 0.051, e: 0.8, CLmax: 1.0, CLmin: -0.3, CLa: 4.5, brakeCD: 0.20,
  bankMax: 50, sweep: 0, ldFactor: 1, cdaFold: 0.0035, rho: 1.0,
  // Re-dependent polar (audit TG-15): CLmax 0.85 at Re 30 k → 1.0 at ≥80 k, cd0 ∝ (Re/60 k)^−0.2 (UIUC LSAT trend, ASSUMED)
  reModel: 1, mu: 1.67e-5,
  // post-stall plate for the deep-stall drop (flat plate near 45°: CN ≈ 1.2 → CL ≈ 0.85, CD ≈ 0.9 + flaps; Hoerner, ASSUMED)
  CLpost: 0.85, CDpost: 0.9,
  // split flaps are also a high-lift device: ΔCLmax at full deflection (full-scale ≈0.6–0.9; low Re ASSUMED 0.35)
  flapDCL: 0.35,
  // station
  Dback: 4.5, Hsnow: 2.7, az: 0, stationTau: 1.2, latK: 1, latMax: 5, alongTau: 0.3, courseTau: 12, Kp: 2.2, Kd: 2.4,
  // leash + reel: conductive 0.45 mm line (power over the leash, design.js LINE), 15 m spool
  dLine: 0.6, muLine: 0.40, EA: 1800, Lmax: 15, Tmin: 0.8, TtowMax: 2.0, Fclutch: 3.0, vIn: 3.5, reelM: 0.012,
  Tlaunch: 1.8, Llaunch: 4.5, vWinch: 3.5, hookRelease: 2.4, hookOk: 1, Lpark: 4.5,
  // modes: stopMode 2 = deep-stall drop → park on the line → auto-relaunch (rest) / snow pull into the holster (final);
  //        0 = round-1 turn-away landing + snow pull; dockMode 1 = in-motion reel-in on a planned (geofence) stow
  // tailwind launch gate: no launch when the known mean tailwind component along the fall line ≥ tailGate (m/s)
  tailGate: 3.0, zoomStop: 1, zoomMax: 1, filmPark: 1, holster: 'wand', windEst: 1, marginMin: 5.8, fastAdapt: 1, fastV0: 13.3,
  stopMode: 2, dockMode: 0, gateHyst: 1.0, deferS: 8, deferV: 6, sledVmax: 99, reelGov: 1, reelGovK: 0.95, zoomGov: 6, zoomGovMax: 2, sideLock: 0, tailTurn: 99, overT: 0.6, tailDback: 0, tailAz: 0, weave: 1, weaveMax: 4, keCap: 14.9, keGov: 0.92, noise: 0.06, lat: 0.08, cam: 3, camTilt: 26,
};

// ------------------------------------------------------------------ vectors
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp3 = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
export const V = { sub, add, mul, dot, cross, len, nrm, clamp, lerp3 };

// ------------------------------------------------------------------ polar
export function reynolds(p, V) { return (p.rho * Math.max(0.1, V) * Math.sqrt(p.S / p.AR)) / (p.mu || 1.67e-5); }
export function polar(p, V) {
  const m = p.sweep ? smooth((V - 11) / 5) : 0; // sweep morph: spread slow, swept fast
  const S = p.S * (1 - 0.4 * m), AR = p.AR * (1 - 0.5 * m);
  let clF = 1, cdF = 1, Re = NaN;
  if (p.reModel) { Re = reynolds(p, V); clF = clamp(0.85 + (0.15 * (Re - 30e3)) / 50e3, 0.85, 1); cdF = Math.pow(clamp(Re, 20e3, 2e5) / 60e3, -0.2); }
  return { S, AR, cd0: p.cd0 * cdF + 0.005 * m, k: 1 / (Math.PI * p.e * AR), CLmax: p.CLmax * clF * (1 - 0.2 * m), m, Re };
}
export function liftDrag(p, V) { // L/D at airspeed V in 1-g glide
  const P = polar(p, V), q = 0.5 * p.rho * V * V;
  const CL = (p.mass * G) / (q * P.S);
  if (CL > P.CLmax) return 0;
  return CL / ((P.cd0 + P.k * CL * CL) / p.ldFactor);
}
export function vStall(p) { // with a Re-dependent CLmax: fixed point V = √(2mg / ρ S CLmax(Re(V)))
  let V = Math.sqrt((2 * p.mass * G) / (p.rho * p.S * p.CLmax));
  for (let k = 0; k < 8; k++) V = Math.sqrt((2 * p.mass * G) / (p.rho * p.S * polar(p, V).CLmax));
  return V;
}

// ------------------------------------------------------------------ rider helpers (local copies)
export function smoothBody(sk, tau = 0.15) {
  const c = sk.col, n = sk.n, k = 1 - Math.exp(-sk.sampleDt / tau);
  const lean = new Float64Array(n), crouch = new Float64Array(n), lat = new Float64Array(n);
  lean[0] = c.lean[0]; crouch[0] = c.crouch[0];
  for (let i = 1; i < n; i++) { lean[i] = lean[i - 1] + (c.lean[i] - lean[i - 1]) * k; crouch[i] = crouch[i - 1] + (c.crouch[i] - crouch[i - 1]) * k; }
  for (let i = 0; i < n; i++) lat[i] = G * Math.tan(lean[i]);
  return { ...sk, col: { ...c, lean, crouch, lat } };
}
export function applyHardFall(sk, tf, decel = 12) {
  const c = sk.col, dt = sk.sampleDt, i0 = Math.round(tf / dt);
  if (i0 >= sk.n) return sk;
  let v = c.v[Math.max(0, i0 - 1)], x = c.x[Math.max(0, i0 - 1)], y = c.y[Math.max(0, i0 - 1)];
  const psi = c.psi[i0], hx = c.hx[i0], hy = c.hy[i0];
  for (let i = i0; i < sk.n; i++) {
    const a = v > 0 ? -decel : 0; v = Math.max(0, v + a * dt);
    x += v * Math.cos(psi) * dt; y += v * Math.sin(psi) * dt;
    c.x[i] = x; c.y[i] = y; c.z[i] = -x * sk.tanS; c.v[i] = v; c.vx[i] = v * Math.cos(psi); c.vy[i] = v * Math.sin(psi);
    c.psi[i] = psi; c.hx[i] = hx; c.hy[i] = hy; c.lat[i] = 0; c.lean[i] = 0; c.lon[i] = a; c.crouch[i] = 1; c.fallen[i] = 1; c.plantL[i] = 0; c.plantR[i] = 0;
  }
  return sk;
}
export function makeRider(sk, tGo = 0) {
  return (t) => {
    const s = skierAt(sk, Math.max(0, t - tGo));
    if (t < tGo) { s.speed = 0; s.vel = [0, 0, 0]; s.accel = 0; s.lat = 0; s.lean = 0; s.crouch = 0.25; s.plantL = s.plantR = 0; }
    return s;
  };
}
// holster funnel (leash exit + dock). Round 3 (re-audit headClear ≥1.0 m incl. the line): a hard 80 mm tube worn
// behind the seat, angled 37° below horizontal, its mouth ≈0.55 m behind and 0.15 m below the pelvis, so the leash
// leaves the body ≥1.1 m from the helmet centre and ≥0.23 m above the snow at a 45° carving lean (kind 'tail', chosen);
// 'thigh' = mouth on the outer back of the left thigh (also ≥1.1 m from the helmet but only 0.14 m above the snow at
// 45° lean: rejected); 'hip' = round 2, mouth behind the left hip, 0.8–0.9 m from the helmet.
export function funnelPoint(s, b, kind = 'thigh') {
  const h = s.heading, l = b.left, u = b.up;
  const [f, ll, uu] = kind === 'hip' ? [-0.24, 0.13, 0.04] : kind === 'thigh' ? [-0.36, 0.17, -0.36] : kind === 'wand' ? [-0.85, 0.05, -0.1] : kind === 'wandHi' ? [-0.8, 0.05, 0.05] : kind === 'wandMid' ? [-0.85, 0.05, -0.02] : [-0.55, 0.05, -0.15];
  return [b.pelvis[0] + h[0] * f + l[0] * ll + u[0] * uu, b.pelvis[1] + h[1] * f + l[1] * ll + u[1] * uu, b.pelvis[2] + h[2] * f + l[2] * ll + u[2] * uu];
}
export function funnelAxis(s, b, kind = 'thigh') {
  const h = s.heading, u = b.up, l = b.left;
  const [f, ll, uu] = kind === 'hip' ? [-0.55, 0.35, 0.76] : kind === 'thigh' ? [-0.5, 0.2, -0.84] : kind === 'wand' ? [-0.96, 0.05, -0.26] : kind === 'wandHi' ? [-0.97, 0.05, 0.1] : kind === 'wandMid' ? [-0.99, 0.05, -0.1] : [-0.8, 0.05, -0.6]; // thigh: along the back-outside of the thigh; tail: behind the seat, 37° below horizontal
  return nrm([h[0] * f + l[0] * ll + u[0] * uu, h[1] * f + l[1] * ll + u[1] * uu, h[2] * f + l[2] * ll + u[2] * uu]);
}

export function bodyCapsules(s, b = bodyPoints(s)) {
  const h = s.heading, l = b.left, u = b.up;
  const P = (o, f, ll, uu) => [o[0] + h[0] * f + l[0] * ll + u[0] * uu, o[1] + h[1] * f + l[1] * ll + u[1] * uu, o[2] + h[2] * f + l[2] * ll + u[2] * uu];
  const shC = P(b.chest, 0, 0, 0.16);
  const caps = [[b.head, b.head, 0.14, 'head'], [b.pelvis, shC, 0.18, 'torso'], [b.packMid, b.packTop, 0.12, 'pack']];
  for (const sg of [1, -1]) {
    caps.push([P(b.pelvis, 0, sg * 0.1, 0), P(b.feet, 0, sg * 0.1, 0.05), 0.09, 'leg']);
    const sh = P(shC, 0, sg * 0.2, 0), hand = P(b.pelvis, 0.36, sg * 0.31, 0.16);
    caps.push([sh, hand, 0.06, 'arm']);
    caps.push([hand, [hand[0] - h[0] * 0.62 + l[0] * sg * 0.1, hand[1] - h[1] * 0.62 + l[1] * sg * 0.1, hand[2] - 0.95], 0.015, 'pole']);
    caps.push([P(b.feet, -0.8, sg * 0.1, 0.03), P(b.feet, 0.85, sg * 0.1, 0.03), 0.05, 'ski']);
  }
  return caps;
}
export function segSegDist(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a < 1e-12 && e < 1e-12) return len(r);
  if (a < 1e-12) { s = 0; t = clamp(f / e, 0, 1); } else {
    const c = dot(d1, r);
    if (e < 1e-12) { t = 0; s = clamp(-c / a, 0, 1); } else {
      const bb = dot(d1, d2), den = a * e - bb * bb;
      s = den > 1e-12 ? clamp((bb * f - c * e) / den, 0, 1) : 0;
      t = (bb * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((bb - c) / a, 0, 1); }
    }
  }
  return len(sub(add(p1, mul(d1, s)), add(p2, mul(d2, t))));
}

// skier wake: far-wake similarity (calc_leash_reel.py I-02), Gaussian profile; returns the
// air velocity change at point P (air dragged along with the skier)
const CDA_SKIER = 0.4;
export function wakeAt(P, s, b, wS) {
  const ur = sub(s.vel, wS), U = len(ur);
  if (U < 0.5) return [0, 0, 0];
  const e = mul(ur, -1 / U), C = [s.pos[0], s.pos[1], s.pos[2] + 1.0];
  const d = sub(P, C), x = dot(d, e);
  if (x < -0.1) return [0, 0, 0];
  const rr = len(sub(d, mul(e, x)));
  const xe = Math.max(0.3, x); // near-body region: deficit saturates (no singularity at the body)
  const ud = Math.min(0.85, 0.7 * Math.cbrt(CDA_SKIER) * Math.pow(xe, -2 / 3)) * smooth((x + 0.1) / 0.4);
  const bw = 0.6 * Math.cbrt(CDA_SKIER * xe) + 0.3;
  const f = ud * Math.exp(-0.7 * (rr * rr) / (bw * bw));
  return mul(ur, f);
}

// ------------------------------------------------------------------ leash
// tension of a line of unstretched length L over spans [{l, q}] (parabolic elastic catenary)
function solveT(L, spans, EA, T0) {
  let sl = 0; for (const sp of spans) sl += sp.l;
  let T = Math.max(1e-4, T0 || 0.05);
  const f = (x) => { let a = L * (1 + x / EA) - sl; for (const sp of spans) a -= (sp.q * sp.q * sp.l ** 3) / (24 * x * x); return a; };
  // bracket + safeguarded Newton (f increasing in T)
  let lo = 1e-6, hi = 2000;
  for (let k = 0; k < 40; k++) {
    const fv = f(T);
    if (Math.abs(fv) < 1e-9 * Math.max(1, L)) break;
    if (fv > 0) hi = Math.min(hi, T); else lo = Math.max(lo, T);
    let d = L / EA; for (const sp of spans) d += (sp.q * sp.q * sp.l ** 3) / (12 * T * T * T);
    let Tn = T - fv / d;
    if (!(Tn > lo && Tn < hi)) Tn = Math.sqrt(lo * hi);
    if (Math.abs(Tn - T) < 1e-7 * T) { T = Tn; break; }
    T = Tn;
  }
  return T;
}
// span load: perpendicular distributed load q⃗ (N/m) and tangential friction (N/m) along ĉ
function spanLoad(P0, P1, v0, v1, wMid, p) {
  const c = sub(P1, P0), l = len(c) || 1e-6, ch = mul(c, 1 / l);
  const vm = mul(add(v0, v1), 0.5), wr = sub(wMid, vm);
  const wt = dot(wr, ch), wp = sub(wr, mul(ch, wt)), wpn = len(wp);
  const d = p.dLine / 1000, mu = p.muLine / 1000;
  const qd = mul(wp, 0.5 * p.rho * 1.2 * d * wpn);
  const g = [0, 0, -G * mu], gp = sub(g, mul(ch, dot(g, ch)));
  const q = add(qd, gp);
  const ft = 0.5 * p.rho * 0.01 * Math.PI * d * Math.abs(wt) * wt + G * mu * dot([0, 0, -1], ch);
  return { c, l, ch, q, qm: Math.max(1e-6, len(q)), ft };
}
// bow vector of a span at tension T (capped at ℓ/4: beyond that the small-sag parabola is not valid and the line is lying/streaming)
function bowOf(sp, T) { const dmag = Math.min(sp.l * 0.25, (sp.qm * sp.l * sp.l) / (8 * Math.max(T, 1e-6))); return mul(sp.q, dmag / sp.qm); }
export function linePoints(A, B, bow, P, P2bow, n = 24) {
  const pts = [];
  const span = (a, b, w, m) => { for (let k = 0; k <= m; k++) { const u = k / m; pts.push(add(lerp3(a, b, u), mul(w, 4 * u * (1 - u)))); } };
  if (P) { span(A, P, bow, n >> 1); pts.pop(); span(P, B, P2bow, n >> 1); } else span(A, B, bow, n);
  return pts;
}

// ------------------------------------------------------------------ core
// sc: { duration, skier (simulateSkier result), tGo, wind, seed,
//       plan: { start: 'flying'|'stowed', armAt, offset(t,p) → {az, D, H}, branch {x,y0,y1,h},
//               crosser {t, behind, speed, side}, reelFailAt, hookFail } }
export function runCore(pIn, sc) {
  const p = { ...PDEF, ...pIn };
  const sk = smoothBody(sc.skier);
  const rider = makeRider(sk, sc.tGo || 0);
  const tanS = sk.tanS, cS = 1 / Math.sqrt(1 + tanS * tanS), nS = [tanS * cS, 0, cS];
  const snowZ = (x) => -x * tanS;
  const hSnow = (P) => (P[2] + P[0] * tanS) * cS;
  const wind = makeWind(sc.wind || {});
  const plan = sc.plan || {};
  const rng = mulberry32(sc.seed || 11);
  const gauss = () => { const u1 = Math.max(1e-12, rng()), u2 = rng(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
  // controller / output step (0.02 s; the dt test refines it to 0.01 s) and line-drum substep factor
  const SDT = sc.ctrlDt || 0.02, n = Math.floor(sc.duration / SDT + 1e-9) + 1, kFac = sc.subFactor || 1;
  const m = p.mass, Vs = vStall(p), vCap = Math.sqrt((2 * p.keCap) / m);
  const bankMax = (p.bankMax * Math.PI) / 180;

  const O = {};
  for (const k of ['gx', 'gy', 'gz', 'gvx', 'gvy', 'gvz', 'fx', 'fy', 'fz', 'ux', 'uy', 'uz', 'bank', 'CL', 'brake', 'fold', 'air', 'mode', 'reelMode', 'L', 'Ld', 'T', 'Thip', 'TglX', 'TglY', 'TglZ',
    'ax', 'ay', 'az', 'bx', 'by', 'bz', 'wx', 'wy', 'wz', 'px', 'py', 'pz', 'p2x', 'p2y', 'p2z', 'contact', 'hookOn', 'Tcmd', 'Pgrav', 'Pdrag', 'Ptow', 'Preel', 'hgt', 'cx', 'cy', 'crx', 'cry', 'crz', 'Fcross', 'snow', 'wake', 'rx', 'ry', 'rz', 'weave', 'freeEnd', 'sideSign', 'vwx', 'vwy', 'vwz', 'post', 'Pel']) O[k] = new Float64Array(n);
  const events = [];
  const ev = (t, type, severity, zh, en) => events.push({ t, type, severity, zh, en });

  // ---- rider state with the funnel
  const RS = (t) => { const s = rider(t); const b = bodyPoints(s); return { s, b, A: funnelPoint(s, b, p.holster), ax: funnelAxis(s, b, p.holster) }; };
  const R0 = RS(0);
  let tailEstS = 0;
  let course = [R0.s.heading[0], R0.s.heading[1]], courseS = [...course];
  // round 4: in a tailwind the station moves further back (tailDback m per m/s of estimated tail above 1.5 m/s) so a stop
  // leaves room for the turn-away (the glider cannot decelerate with the rider in a tailwind)
  const offsetAt = (t) => { const o = { az: p.az, D: p.Dback + (p.tailDback || 0) * clamp(tailEstS - 1.5, 0, 3), H: p.Hsnow, ...(plan.offset ? plan.offset(t, p) : {}) };
    // round 4: in a tailwind the station sits tailAz to the holster side, so a stop turn-away starts off the rider's line
    if (p.tailAz) o.az = (o.az || 0) * (1 - smooth((tailEstS - 1.5) / 1)) + p.tailAz * smooth((tailEstS - 1.5) / 1);
    return o; };
  const stationFrom = (O2, c, off, A) => {
    const az = (off.az * Math.PI) / 180, back = [-c[0], -c[1]], left = [-c[1], c[0]];
    const x = O2[0] + (back[0] * Math.cos(az) + left[0] * Math.sin(az)) * off.D, y = O2[1] + (back[1] * Math.cos(az) + left[1] * Math.sin(az)) * off.D;
    return [x, y, snowZ(x) + off.H + (A ? 0 : 0)];
  };

  // ---- glider state
  let mode = plan.start === 'stowed' ? 'stowed' : 'follow';
  let modeT = 0;
  let gp, gv, bankA = 0, CLa = 0.3, brakeA = 0, fold = mode === 'stowed' ? 1 : 0;
  let bodyX = [course[0], course[1], 0], bodyZ = [0, 0, 1];
  let hookOn = true, armed = mode !== 'stowed', reelMode = mode === 'stowed' ? 'locked' : 'tension';
  let L, Ld = 0, T = 0.12, Tcmd = p.Tmin, Fline = [0, 0, 0], FlineMeas = [0, 0, 0], Thip = 0;
  let contact = null; // {kind:'cross'|'branch', P:[...], Pv:[...]}
  let freeEnd = null; // after hook release: free line end
  let lineCut = false, reelFailed = false, captured = false;
  let vAirF = 10, branchSide = 0, keLimit = false, snowT = 0, stopDet = false, fallDet = false, decelT = 0, slowT = 0, snagT = 0, strikeT = 0, landedT = -1, stillT = 0;
  let side = 1, turnPsi = null, turnAcc = 0, weaveA = 0, wEst = [0, 0, 0], tLiftoff = NaN, tDocked = NaN, tStop = NaN, tTouch = NaN, vTouch = NaN, captureV = NaN, touchKE = NaN;
  let reelinFrom = null, AS = null, VS = null, AS1 = null, VS1 = null, refPrevF = null, vrefF = null;
  let post = 0, vgF = 0, vgDot = 0, stopN = 0, isFinal = false, tParked = NaN, relaunchN = 0, lastLift = -1e9, dsV0 = [0, 0], postCmd = 0;
  // wind known to the hip unit before launch (glider pitot + GNSS on the previous flight / while parked; first run: resort station)
  // round 3 (re-audit: no oracle wind): the hip unit estimates the wind with the shared windEstimate() (10 s trailing
  // mean at the rider, seeded ±1 m/s bias, 0.5 s lag); the tail component is taken along the smoothed course
  const westF = p.windEst ? windEstimate(wind, (tt) => rider(Math.max(0, tt)).pos, { seed: sc.seed || 11 }) : null;
  const tailOracle = plan.tailKnown ?? (sc.wind && sc.wind.mean ? sc.wind.mean[0] : 0);
  const cFall = [1, 0]; // down-slope (fall-line) direction from the belt IMU's slope estimate
  let wasStill = false, tailEst = westF ? 0 : tailOracle, tEstNext = 0, vRidF = R0.s.speed || 0, lowT = 0, okT = 0, marginDrop = false, gateN = 0;
  let gateEv = false, tPush = NaN, vgS = 0, restowF = false, tailLand = false, overT = 0;
  let zoomH = 0, dsPhase = 1, dsT2 = 0, riderStill = false, weaveW = 0, weaveS = 0, weaveV = 0, weaveFb = 0, vgRF = 0, weavePh = 0, latP1 = null, latP2 = null, latO = null, alS = null, alV = 0;
  const parkLog = [], dropLog = [];
  const hist = []; const latN = Math.max(0, Math.round(p.lat / SDT));
  let noiseV = [0, 0, 0];
  let lastRef = null, vrefPrev = [0, 0, 0], aff = [0, 0, 0];
  let maxSlipRun = 0, slipT = 0, Lpre = 0;
  const hookLocal = (bx, bz) => add(mul(bx, 0.05), mul(bz, -0.03));
  if (mode === 'stowed') { gp = sub(R0.A, mul(R0.ax, 0.2)); gv = [...R0.s.vel]; L = 0.05; }
  else {
    const off = offsetAt(0);
    gp = stationFrom(R0.A, course, off);
    gv = [...R0.s.vel];
    { const v0 = len(gv), vm = 0.9 * p.keGov * vCap; if (v0 > vm) gv = mul(gv, vm / v0); } // start under the KE governor (audit TG-12)
    bodyX = nrm(gv[0] || gv[1] ? gv : [1, 0, 0]);
    L = len(sub(add(gp, hookLocal(bodyX, bodyZ)), R0.A)) * 1.0002 + 0.002;
  }
  for (let k = latN; k > 0; k--) hist.push({ pos: R0.s.pos, vel: R0.s.vel, A: R0.A });
  let wG0 = wind(0, gp), wR0 = wind(0, R0.s.pos);
  let crosserPos = null;
  const cr = plan.crosser;
  const crosserAt = (t) => {
    if (!cr) return null;
    // crossing body (vertical capsule r 0.25 m, 1.8 m tall) moving across the track, passing `behind` metres behind the
    // rider's funnel at time cr.t (positions precomputed from the rider at cr.t)
    if (!cr.P0) { const s = rider(cr.t), b = bodyPoints(s), A = funnelPoint(s, b, p.holster); const hd = s.heading; cr.P0 = [A[0] - hd[0] * cr.behind, A[1] - hd[1] * cr.behind]; cr.dir = [-hd[1] * cr.side, hd[0] * cr.side]; }
    const u = (t - cr.t) * cr.speed;
    const x = cr.P0[0] + cr.dir[0] * u, y = cr.P0[1] + cr.dir[1] * u;
    return { x, y, z0: snowZ(x), v: [cr.dir[0] * cr.speed, cr.dir[1] * cr.speed, -cr.dir[0] * cr.speed * tanS] };
  };

  let Rnext = null;
  for (let i = 0; i < n; i++) {
    const t = i * SDT;
    const R = Rnext || RS(t), Rn = RS(t + SDT); Rnext = Rn;
    const A0 = R.A, A1 = Rn.A, Av = mul(sub(A1, A0), 1 / SDT);
    hist.push({ pos: R.s.pos, vel: R.s.vel, A: A0 });
    const md = hist[Math.max(0, hist.length - 1 - latN)];
    // relative fix (UWB + leash length/angle encoder): coloured noise + latency, latency-compensated
    const aN = Math.exp(-SDT / 0.3), bN = Math.sqrt(1 - aN * aN) * p.noise;
    noiseV = [aN * noiseV[0] + bN * gauss(), aN * noiseV[1] + bN * gauss(), aN * noiseV[2] + bN * 0.6 * gauss()];
    const lead = latN * SDT;
    const AHat = add(add(md.A, mul(md.vel, lead)), noiseV), vHat = md.vel;
    const spd = Math.hypot(vHat[0], vHat[1]);
    if (spd > 1.5 && !stopDet && !fallDet) { const k = 1 - Math.exp(-SDT / 1.2); course = [course[0] + (vHat[0] / spd - course[0]) * k, course[1] + (vHat[1] / spd - course[1]) * k]; const cl = Math.hypot(course[0], course[1]) || 1; course = [course[0] / cl, course[1] / cl];
      const k2 = 1 - Math.exp(-SDT / p.courseTau); courseS = [courseS[0] + (vHat[0] / spd - courseS[0]) * k2, courseS[1] + (vHat[1] / spd - courseS[1]) * k2]; const c2 = Math.hypot(courseS[0], courseS[1]) || 1; courseS = [courseS[0] / c2, courseS[1] / c2]; }
    const attachedNow = mode === 'stowed' || mode === 'docked';
    const wG1 = attachedNow ? wG0 : wind(t + SDT, gp), wR1 = attachedNow ? wR0 : wind(t + SDT, R.s.pos); // no wind needed while the glider sits in the holster
    { const kw = 1 - Math.exp(-SDT / 3); wEst = add(wEst, mul(sub(wG0, wEst), kw)); }
    const Rspd = R.s.speed, Racc = R.s.accel;
    vgS += (len(gv) - vgS) * (1 - Math.exp(-SDT / 0.1));

    // ---------------- supervisory logic
    if (plan.reelFailAt != null && t >= plan.reelFailAt && !reelFailed) {
      reelFailed = true; reelMode = 'failed';
      ev(t, 'reelfail', 'warning', '卷轴电机/控制器失效：卷筒转为被动 0.25 N 拖曳刹车（只能放线），滑翔机失去拖曳与回收', 'Reel motor/controller fails: drum falls back to a passive 0.25 N drag brake (pay-out only); the glider loses tow and recovery');
    }
    if (mode === 'stowed' && plan.armAt != null && t >= plan.armAt && !armed) { armed = true; ev(t, 'arm', 'info', '按键布防（停稳时一次操作）', 'Arm tap (one action, while standing)'); }
    if (westF && t >= tEstNext) { const we = westF(t); tailEst = we[0] * cFall[0] + we[1] * cFall[1]; tEstNext = t + 0.5; }
    vRidF += (Rspd - vRidF) * (1 - Math.exp(-SDT / 2));
    tailEstS += (tailEst - tailEstS) * (1 - Math.exp(-SDT / 3));
    const marginV = Math.max(vRidF, Rspd) - tailEst, marginOK = !(p.marginMin > 0) || marginV >= p.marginMin;
    okT = marginOK ? okT + SDT : 0;
    const gated = p.tailGate > 0 && tailEst >= p.tailGate;
    if (gated && armed && (mode === 'stowed' || mode === 'park') && !gateEv) { gateEv = true; gateN++; ev(t, 'gate', 'warning', `顺风门限：估计顺坡风分量 ${tailEst.toFixed(1)} m/s ≥ ${p.tailGate} m/s（腰带估风，含偏差与滞后），滑翔机无法在最低空速下跟随，暂不起飞（腰带 LED 琥珀色）`, `Tailwind gate: estimated down-slope wind ${tailEst.toFixed(1)} m/s ≥ ${p.tailGate} m/s (belt wind estimate incl. bias and lag); the glider cannot follow above its minimum airspeed, so it waits (amber belt LED)`); }
    if (!gated) gateEv = false;
    if (Rspd < 0.3) { wasStill = true; tPush = NaN; } else if (Rspd > 1.2 && !Number.isFinite(tPush)) tPush = t;
    // round 4 (audit3 A3-TG-03): a launch refused at push-off (e.g. the estimate has only ~1 s of history at the top of the
    // run) may still go ahead while the rider is below deferV in the first deferS seconds of the ride, once the estimate clears
    const deferOK = p.deferS > 0 && Number.isFinite(tPush) && t - tPush < p.deferS && Rspd < p.deferV;
    if (mode === 'stowed' && armed && Rspd > 1.2 && !gated && ((wasStill && Rspd < 8 && Racc > 0.3) || deferOK || !p.windEst)) { // round 3: drop only at a push-off (a launch delayed by the gate waits for the next push-off)
      mode = 'drop'; modeT = t; reelMode = 'free'; wasStill = false;
      gp = add(A0, mul(R.ax, 0.15)); gv = add(R.s.vel, mul(R.ax, 0.8)); L = len(sub(gp, A0)) + 0.05;
      ev(t, 'drop', 'info', '蹬出后滑翔机从髋部箭筒滑出落到雪面，机翼弹开；卷轴自由放线', 'After push-off the glider slides out of the hip quiver onto the snow and its wings spring open; reel pays out freely');
    }
    if (stopDet && Rspd < 0.3) { riderStill = true; marginDrop = false; }
    // auto-relaunch from the parked position at the next push-off (still armed; audit TG-05)
    // parked glider, rider pushes off but the tailwind gate refuses the relaunch: pull it into the holster at once (never drag it)
    if (mode === 'park' && Rspd > 1.2 && gated && hookOn && !reelFailed && !lineCut) { mode = 'snowpull'; modeT = t; reelMode = 'retract'; marginDrop = true; restowF = true; ev(t, 'gatepull', 'warning', '蹬出时顺风门限拒绝再起飞：卷轴立即快速收回停放的滑翔机（卷轴动能限速器生效）', 'The tailwind gate refuses the relaunch at push-off: the reel pulls the parked glider in at once (reel KE governor active)'); }
    // round 4 (audit3 A3-TG-01): while the rider rests, a parked glider is pulled into the holster already when the estimate
    // comes within gateHyst of the gate, so a refused relaunch never has to drag it in behind a moving rider
    if (mode === 'park' && riderStill && p.gateHyst > 0 && tailEst >= p.tailGate - p.gateHyst && hookOn && !reelFailed && !lineCut && reelMode === 'hold') { mode = 'snowpull'; modeT = t; reelMode = 'retract'; marginDrop = true; restowF = true; ev(t, 'gatestow', 'info', `停歇中估计顺坡风 ${tailEst.toFixed(1)} m/s 接近门限：卷轴趁站立把停放的滑翔机收回枪套（下次蹬出若门限允许则从枪套起飞）`, `Estimated down-slope wind ${tailEst.toFixed(1)} m/s near the gate while resting: the reel pulls the parked glider into the holster while the rider stands (it launches from the holster at the next push-off if the gate allows)`); }
    // lift-base geofence reached while parked after a margin drop: pull it into the holster
    if (mode === 'park' && riderStill && plan.finalAfter != null && t >= plan.finalAfter && hookOn && !reelFailed && !lineCut) { mode = 'snowpull'; modeT = t; reelMode = 'retract'; isFinal = true; }
    if (mode === 'park' && (riderStill || (!stopDet && wasStill)) && armed && hookOn && !reelFailed && !lineCut && Rspd > 1.2 && !gated) {
      mode = 'drop'; modeT = t; reelMode = 'free'; relaunchN++; stopDet = false; slowT = 0; decelT = 0; riderStill = false;
      ev(t, 'relaunch', 'info', '蹬出：停放在雪面的滑翔机自动展翼，卷轴放线后雪面拖行、绞盘起飞（无需操作）', 'Push-off: the parked glider opens its wings; the reel pays out, sled-tows and winch-launches it (no action)');
    }
    if (mode === 'drop' && len(sub(gp, A0)) >= p.Llaunch - 0.3) { mode = 'sled'; modeT = t; reelMode = 'tension'; Tcmd = 0.35; ev(t, 'sled', 'info', `放线 ${p.Llaunch} m 后卷轴制动：滑翔机在雪面上被拖行`, `Reel brakes after ${p.Llaunch} m: glider is sled-towed over the snow`); }
    // round 4: never sled-tow a glider behind a fast rider (short line + swinging hip = whip, audit3 A3-TG-01): if the
    // winch launch has not started by sledVmax, pull it into the holster instead (relaunch at the next push-off)
    if (mode === 'sled' && Rspd > p.sledVmax && !(Rspd >= p.vWinch && fold < 0.05 && marginOK) && hookOn && !reelFailed && !lineCut) { mode = 'snowpull'; modeT = t; reelMode = 'retract'; marginDrop = true; restowF = true; ev(t, 'sledpull', 'warning', `雪面拖行时滑雪者已超过 ${p.sledVmax} m/s 而未能起飞：卷轴把滑翔机收回枪套`, `Rider above ${p.sledVmax} m/s before the winch launch could start: the reel pulls the glider into the holster`); }
    if (mode === 'sled' && Rspd >= p.vWinch && fold < 0.05 && marginOK) { mode = 'winch'; modeT = t; Tcmd = p.Tlaunch; ev(t, 'winch', 'info', `滑雪者≥${p.vWinch} m/s：卷轴绞收起飞（类似滑翔机绞盘起飞）`, `Rider ≥${p.vWinch} m/s: reel winch launch (sailplane-style)`); }
    if (mode === 'winch' && hSnow(gp) > 1.2 && t - lastLift > 5) { lastLift = t; if (!Number.isFinite(tLiftoff)) tLiftoff = t; ev(t, 'liftoff', 'info', '离地升空', 'Lift-off'); }
    if (mode === 'winch' && hSnow(gp) > 2.3 && t - modeT > 1) { mode = 'follow'; modeT = t; stopDet = false; slowT = 0; decelT = 0; ev(t, 'follow', 'info', '到达跟拍机位，转为重力滑翔跟随', 'On station: gravity-glide follow'); }
    // rider stops while the glider is still on the snow (drop / sled): park it on the line
    if ((mode === 'drop' || mode === 'sled') && t - modeT > 1 && Rspd < 0.5 && R.s.accel <= 0.05 && hookOn && !reelFailed && !lineCut) {
      mode = 'park'; modeT = t; reelMode = 'retract'; ev(t, 'park', 'info', '滑雪者在起飞前停下：滑翔机停放在雪面', 'Rider stops before lift-off: glider stays parked on the snow');
    }
    // stop / fall detection from the hip-unit IMU + GNSS
    if ((mode === 'follow' || mode === 'free') && !stopDet && !fallDet) {
      decelT = Racc < -8 ? decelT + SDT : 0;
      slowT = Racc < -3 || Rspd < 2 ? slowT + SDT : 0;
      if (decelT >= 0.08) {
        fallDet = true; tStop = t;
        side = (dot(sub(gp, A0), [-course[1], course[0], 0]) >= 0 ? 1 : -1);
        if (hookOn && !reelFailed) reelMode = 'protect';
        mode = 'abort'; modeT = t;
        ev(t, 'fall', 'warning', '检测到摔倒（髋部IMU 减速>8 m/s²）：卷轴自由放线，滑翔机拉起侧转、远离滑雪者降落雪面', 'Fall detected (hip IMU decel > 8 m/s²): reel free-spools; glider zooms, turns away and lands on the snow clear of the rider');
      } else if (p.overT > 0 && mode === 'follow' && hookOn && !reelFailed && !lineCut && (overT = keLimit && len(gv) > p.keGov * vCap && tailEst >= 2 ? overT + SDT : 0) > p.overT) {
        // round 4 overspeed escape (gate error: launched in a tailwind the glider cannot fly slowly enough in, ground speed
        // = tailwind + airspeed above the KE governor despite full airbrake and zoom): turn 180° to its own side into the
        // wind, land, and go back into the holster (no relaunch before the next push-off)
        const lo = (gp[0] - A0[0]) * (-course[1]) + (gp[1] - A0[1]) * course[0]; side = Math.abs(lo) > 1 ? Math.sign(lo) : 1;
        stopDet = true; marginDrop = true; restowF = true; tStop = t; stopN++; isFinal = false; overT = 0;
        mode = 'land'; modeT = t; turnPsi = null; dsV0 = [gv[0], gv[1]]; postCmd = 0; reelMode = 'soft'; tailLand = true;
        dropLog.push({ t, final: false });
        ev(t, 'overspeed', 'warning', `超速：顺风中地速 ${len(gv).toFixed(1)} m/s 超过动能限速且减速板/拉升已饱和——滑翔机迎风转弯 180° 降落并收回枪套`, `Overspeed: ground speed ${len(gv).toFixed(1)} m/s above the KE governor in a tailwind with airbrake and zoom saturated — the glider turns 180° into the wind, lands and is pulled into the holster`);
      } else if (p.marginMin > 0 && mode === 'follow' && (lowT = marginV < p.marginMin - 0.3 && Rspd > 2 ? lowT + SDT : 0) > 1.5) {
        // round 3: estimated airspeed margin (rider speed − estimated tailwind) too small to follow (slow rider in a
        // tailwind): drop and sled-park on the line, relaunch automatically when the margin is back
        stopDet = true; marginDrop = true; tStop = t; stopN++; isFinal = false; lowT = 0;
        side = (dot(sub(gp, A0), [-course[1], course[0], 0]) >= 0 ? 1 : -1); if (hookOn && !reelFailed) side = 1;
        mode = 'dstall'; modeT = t; dsV0 = [gv[0], gv[1]]; postCmd = 0; dsPhase = 2; dsT2 = t; zoomH = 0; if (hookOn && !reelFailed && !lineCut) reelMode = 'hold'; // towed down on a held line (rider still moving)
        dropLog.push({ t, final: false });
        ev(t, 'margin', 'warning', `空速裕度不足（滑雪者 ${vRidF.toFixed(1)} m/s − 估计顺风 ${tailEst.toFixed(1)} m/s < ${p.marginMin} m/s）：滑翔机落雪、在 3 m 牵绳上被拖行待机`, `Airspeed margin too small (rider ${vRidF.toFixed(1)} m/s − estimated tailwind ${tailEst.toFixed(1)} m/s < ${p.marginMin} m/s): the glider drops and is towed on 3 m of line until the margin returns`);
      } else if (slowT >= 0.25) {
        stopDet = true; tStop = t; stopN++;
        isFinal = plan.finalAfter != null && t >= plan.finalAfter;
        side = (dot(sub(gp, A0), [-course[1], course[0], 0]) >= 0 ? 1 : -1);
        if (hookOn && !reelFailed && mode !== 'free') side = 1; // leash recovery: land on the holster (left) side so the snow pull never crosses the skis
        if (p.tailTurn > 0 && tailEst >= p.tailTurn && hookOn && !reelFailed && !lineCut && mode === 'follow') {
          // round 4 (audit3 A3-TG-01/02): in a tailwind the glider cannot decelerate with the stopping rider (it overtook
          // and passed the leash 0.5 m from the helmet in a 4.5 m/s tailwind); it turns away to its own side through 180°
          // into the wind at 1.25·Vs airspeed (ground speed ≈ airspeed − tailwind, moving uphill, away), then lands
          const lo = (gp[0] - A0[0]) * (-course[1]) + (gp[1] - A0[1]) * course[0]; side = Math.abs(lo) > 1 ? Math.sign(lo) : 1;
          mode = 'land'; modeT = t; turnPsi = null; dsV0 = [gv[0], gv[1]]; postCmd = 0; reelMode = 'soft'; tailLand = true;
          dropLog.push({ t, final: isFinal });
          ev(t, 'stop', 'info', '顺风中停下：滑翔机向自身一侧转弯 180° 迎风（地速≈空速−顺风，向坡上远离滑雪者）后降落雪面，再停放/收回', 'Stop in a tailwind: the glider turns 180° to its own side into the wind (ground speed ≈ airspeed − tailwind, moving uphill away from the rider), lands, then parks / stows');
        } else if (p.stopMode === 2 && !(p.dockMode === 1 && isFinal && hookOn && !reelFailed)) {
          mode = 'dstall'; modeT = t; dsV0 = [gv[0], gv[1]]; postCmd = 0; dsPhase = 1; zoomH = 0;
          if (hookOn && !reelFailed && !lineCut) reelMode = 'soft';
          dropLog.push({ t, final: isFinal });
          ev(t, 'stop', 'info', isFinal ? '在缆车站地理围栏内停下：滑翔机全襟翼减速、深失速落在侧后方雪面，卷轴随后把折叠的滑翔机拖回髋部枪套' : '中途停下：滑翔机全襟翼减速、深失速落在侧后方雪面，折翼后卷轴把它拉到 3 m 处停放（下次蹬出自动起飞）',
            isFinal ? 'Stop inside the lift-base geofence: full flaps, deep-stall drop onto the snow behind-beside; the reel then pulls the folded glider into the hip holster' : 'Rest stop: full flaps, deep-stall drop onto the snow behind-beside; wings fold and the reel draws it to a 3 m park (auto-relaunch at the next push-off)');
        } else if (mode === 'free' || !hookOn || reelFailed) { mode = p.stopMode === 2 ? 'dstall' : 'land'; modeT = t; dsV0 = [gv[0], gv[1]]; postCmd = 0; ev(t, 'stop', 'info', '检测到停下：无牵绳回收，滑翔机在侧面降落雪面', 'Stop detected: no leash recovery, glider lands on the snow to the side'); }
        else { mode = p.dockMode === 1 ? 'reelin' : 'recover'; modeT = t; reelMode = p.dockMode === 1 ? 'retract' : 'soft'; ev(t, 'stop', 'info', p.dockMode === 1 ? '检测到停下：卷轴沿绳绞回（滑行中对接）' : '检测到停下：滑翔机减速下降、在侧后方落雪，卷轴拖回髋部箭筒', p.dockMode === 1 ? 'Stop detected: reel winches the glider down the line (in-motion dock)' : 'Stop detected: glider brakes, lands on the snow behind-beside, reel drags it to the hip quiver'); }
      }
    }
    // planned dock while still skiing (tap or lift-base geofence): reel the glider in along the line in the airflow
    if (plan.dockAt != null && t >= plan.dockAt && mode === 'follow' && hookOn && !reelFailed && !lineCut) {
      mode = 'reelin'; modeT = t; reelMode = 'retract';
      ev(t, 'dockcmd', 'info', '滑行中回收指令（按键或缆车站地理围栏）：卷轴沿绳把滑翔机收回髋部漏斗', 'Dock command while skiing (tap or lift-base geofence): the reel draws the glider down the line into the hip funnel');
    }
    // landed glider on the leash: wait until the rider is still, then winch over the snow
    if (mode === 'landed' && hookOn && !reelFailed && !lineCut) {
      stillT = Rspd < 0.3 ? stillT + SDT : 0;
      if (restowF) { mode = 'snowpull'; modeT = t; reelMode = 'retract'; stopDet = false; slowT = 0; decelT = 0; } // overspeed escape: straight back into the holster (KE-governed pull)
      else if (marginDrop && Rspd > p.sledVmax) { mode = 'snowpull'; modeT = t; reelMode = 'retract'; stopDet = false; slowT = 0; decelT = 0; } // round 4: no sled tow behind a fast rider: pull it in (restow)
      else if (marginDrop) { mode = 'drop'; modeT = t; reelMode = 'free'; marginDrop = false; stopDet = false; slowT = 0; decelT = 0; } // slow rider still moving: the glider waits on the snow as in a launch (free pay-out → sled tow), winch-launches when the margin returns
      else if (p.stopMode === 2 && stopDet && !isFinal && !fallDet) { mode = 'park'; modeT = t; reelMode = 'retract'; }
      else if ((stopDet && t - landedT >= 0) || (fallDet && stillT > 3)) { mode = 'snowpull'; modeT = t; reelMode = 'retract'; }
    }
    if (mode === 'park' && reelMode === 'retract' && L <= p.Lpark) { reelMode = 'hold'; if (!Number.isFinite(tParked) || parkLog.length < stopN) { tParked = t; parkLog.push({ t, L }); ev(t, 'parked', 'info', `滑翔机折翼停放在离髋部 ${p.Lpark} m 的雪面上`, `Glider parked folded on the snow ${p.Lpark} m from the hip`); } }

    // ---------------- reference + control
    let Fdes = null, cmdCL = 0, cmdBank = 0, cmdBrake = 0, shortfall = 0, Vair = 0;
    const flyModes = mode === 'follow' || mode === 'winch' || mode === 'recover' || mode === 'reelin' || mode === 'abort' || mode === 'land' || mode === 'free' || mode === 'dstall';
    const off = offsetAt(t);
    // smoothed station origin (critically damped 2nd-order tracker of the funnel)
    if (!AS) { AS = [...AHat]; VS = [...vHat]; }
    { // two cascaded first-order low-passes (lateral swing of the turns is smoothed, along-track restored below)
      const k = 1 - Math.exp(-SDT / p.stationTau);
      if (!AS1) { AS1 = [...AHat]; VS1 = [...vHat]; }
      AS1 = add(AS1, mul(sub(AHat, AS1), k)); AS = add(AS, mul(sub(AS1, AS), k));
      VS1 = add(VS1, mul(sub(vHat, VS1), k)); VS = add(VS, mul(sub(VS1, VS), k)); }
    let ref = null, vref = [...vHat];
    const wakeG = wakeAt(gp, R.s, R.b, wR0);
    const wAir = add(wG0, wakeG);
    const va = sub(gv, wAir); Vair = len(va);
    const VsE = Math.sqrt((2 * m * G) / (p.rho * p.S * (polar(p, Math.max(Vair, 0.8 * Vs)).CLmax + p.flapDCL * brakeA))); // stall speed at the current flap setting
    if (flyModes) {
      if (mode === 'follow' || mode === 'free' || mode === 'winch') {
        const cS2 = courseS;
        // slow-rider / tailwind weave (round 2): a triangle weave with constant lateral speed vlat so the airspeed
        // stays ≥ 1.25·Vs everywhere on the path (a sinusoid has zero lateral speed at its ends). Feed-forward
        // vlat = √((1.25·Vs)² − (Vg − w_tail)²) from the station speed and the wind estimate, plus a feedback trim
        // on the filtered airspeed. Amplitude ≤ weaveMax; reversal = a short banked turn (smoothed reference).
        vgRF += (Math.max(0, vHat[0] * cS2[0] + vHat[1] * cS2[1]) - vgRF) * (1 - Math.exp(-SDT / 0.6));
        const Vg = Math.max(0, VS[0] * cS2[0] + VS[1] * cS2[1]), wt = wEst[0] * cS2[0] + wEst[1] * cS2[1]; void vgRF;
        const need = mode === 'follow' ? Math.sqrt(Math.max(0, (1.25 * VsE) ** 2 - (Vg - wt) ** 2)) : 0;
        vAirF += (Vair - vAirF) * (1 - Math.exp(-SDT / 1.0));
        weaveFb = p.weave && mode === 'follow' ? clamp(weaveFb + SDT * 0.8 * (1.2 * VsE - vAirF), -2, 3) : 0;
        const vlatT = p.weave ? clamp(need * 1.1 + weaveFb, 0, 8) : 0;
        weaveV += (vlatT - weaveV) * (1 - Math.exp(-SDT / 1.0));
        // smoothed square-wave lateral velocity v = vlat·clip(1.6·sin φ), period T = 4·A/vlat (3–8 s), A ≤ weaveMax
        const Tw = clamp((4 * p.weaveMax) / Math.max(0.3, weaveV), 3, 8);
        weavePh += (2 * Math.PI * SDT) / Tw;
        const vw = weaveV * clamp(1.6 * Math.sin(weavePh), -1, 1);
        weaveW += (vw - weaveW / 8) * SDT; weaveS = vw;
        weaveA = weaveV;
        // station origin (round 2): exact along-track position of the hip, lateral coordinate in the slow course
        // frame through two cascaded low-passes (stationTau) — the glider flies a straight-ish line through the turns
        const lft = [-cS2[1], cS2[0]];
        // round 3: fast riders → straighter glider line (less ground speed needed under the KE governor)
        const fF = p.fastAdapt ? clamp((vRidF - p.fastV0) / 1.5, 0, 1) : 0, latKe = p.latK * (1 - 0.7 * fF), stTau = p.stationTau + 1.3 * fF;
        { const kL = 1 - Math.exp(-SDT / stTau);
          if (!latP1) { latP1 = [AHat[0], AHat[1]]; latP2 = [AHat[0], AHat[1]]; }
          const step = (P, T) => { const d = [T[0] - P[0], T[1] - P[1]], da = d[0] * cS2[0] + d[1] * cS2[1], dl = d[0] * lft[0] + d[1] * lft[1]; return [P[0] + cS2[0] * da + lft[0] * dl * kL, P[1] + cS2[1] * da + lft[1] * dl * kL]; };
          latP1 = step(latP1, AHat); latP2 = step(latP2, latP1);
        }
        // in-phase station: centreline (latP2) + latK × the hip's lateral offset from it (no added lag), soft-clamped to ±latMax
        { const dl = (AHat[0] - latP2[0]) * lft[0] + (AHat[1] - latP2[1]) * lft[1], dy = p.latMax * Math.tanh((latKe * dl) / p.latMax);
          // along-track: 1st-order smoothing with velocity feed-forward (exact on a ramp), so the glider does not surge with
          // the rider's turn-by-turn speed oscillation
          const kA = 1 - Math.exp(-SDT / p.alongTau), sA = AHat[0] * cS2[0] + AHat[1] * cS2[1], vA = vHat[0] * cS2[0] + vHat[1] * cS2[1];
          if (alS == null) { alS = sA; alV = vA; } alS += (sA - alS) * kA; alV += (vA - alV) * kA;
          const dA = alS + p.alongTau * alV - (latP2[0] * cS2[0] + latP2[1] * cS2[1]);
          latO = [latP2[0] + lft[0] * dy + cS2[0] * dA, latP2[1] + lft[1] * dy + cS2[1] * dA]; }
        ref = stationFrom(latO, cS2, off);
        const wv = weaveW, wvd = weaveS;
        ref = [ref[0] + lft[0] * wv, ref[1] + lft[1] * wv, ref[2]];
        ref[2] = snowZ(ref[0]) + off.H;
        // reference velocity = time derivative of the reference point (low-passed 0.15 s)
        if (refPrevF && t - refPrevF.t < SDT * 1.5) { const vd = mul(sub(ref, refPrevF.r), 1 / SDT); vrefF = vrefF ? add(vrefF, mul(sub(vd, vrefF), 1 - Math.exp(-SDT / 0.15))) : vd; }
        else vrefF = [...vHat];
        refPrevF = { r: [...ref], t };
        vref = [...vrefF]; void wvd;
        if (mode === 'winch') { const hg = hSnow(gp); const hr = Math.min(off.H, hg + 1.6 + 1.5 * (t - modeT)); ref[2] = snowZ(ref[0]) + hr; }
      } else if (mode === 'reelin') {
        // approach along the holster axis (back-up from the funnel), wings spread until the nose is in the funnel
        const tau = t - modeT;
        const d = Math.max(0, 2.6 - 1.25 * Math.max(0, tau - 2.0));
        const lS = [-courseS[1], courseS[0]];
        const axS = nrm([-courseS[0] * 0.55 + lS[0] * 0.35, -courseS[1] * 0.55 + lS[1] * 0.35, 0.76]); // approach axis in the smoothed course frame
        const P1 = add(AHat, mul(axS, d + 0.17));
        if (!reelinFrom) reelinFrom = [...(lastRef || gp)];
        ref = lerp3(reelinFrom, P1, smooth(tau / 2.0));
      } else if (mode === 'dstall') {
        // stop → drop (round 2, audit TG-01). Phase 1 (on the leash): track a point 5 m behind / 3 m above the decelerating
        // rider, 1.5 m to the holster side, with the reel in tension mode, so the line does not run out while the rider
        // slides to a halt. Phase 1 ends when the airspeed falls below 1.15·Vs, the rider is slower than 6 m/s, the glider is within 6 m, or after 3 s.
        // Phase 2: descend at 3 m/s with full flaps; below 1.6·Vs the airframe pitches up into a post-stall plate
        // (CL 0.85, CD 0.9 + flaps) and parachutes onto the snow. In a strong headwind it simply glides down into the
        // wind at ~zero ground speed. No 180° turn and no downwind run (the round-1 'recover' kited away in wind).
        const tau = t - modeT, hg = hSnow(gp), lft = [-course[1], course[0]];
        if (dsPhase === 1) {
          if (hookOn) {
            // round 3 zoom stop: surplus airspeed is traded for height (up to zoomMax above the snow) instead of being
            // dumped into the line, so the camera keeps the decelerating rider in frame and the clutch never slips
            const zr = p.zoomStop ? clamp(Math.max(0.6 * (Vair - 1.5 * Vs), 0.8 * (Math.hypot(gv[0], gv[1]) - Rspd)), 0, p.zoomRate ?? 3.5) : 0; // surplus airspeed or closing ground speed
            if (p.zoomStop) zoomH = Math.min(p.zoomMax, zoomH + SDT * zr);
            const bk = p.zoomStop ? 6 : 5, sd1 = p.zoomStop ? p.stopSide ?? 7 : 1.5; // round 3: side-step to ≈7 m
            // round 3: a hockey stop turns the rider across the slope; side-step to the side the rider's back faces, so the
            // glider and the line stay behind the stopped rider (not in front of the face)
            if (p.zoomStop && !p.sideLock) { const hl = R.s.heading[0] * lft[0] + R.s.heading[1] * lft[1]; if (Math.abs(hl) > 0.35) side = hl > 0 ? -1 : 1; }
            // round 4 (audit3 A3-TG-02): the side is chosen once when the stop is detected — the side the glider is already
            // on (|offset| > 1 m), else the holster side — and never flips, so the glider and its leash never cross over the
            // decelerating, turning rider (a flip in a tailwind passed the line 0.86 m from the helmet)
            if (p.zoomStop && p.sideLock && tau < SDT * 1.5) { const lo = (gp[0] - AHat[0]) * lft[0] + (gp[1] - AHat[1]) * lft[1]; side = Math.abs(lo) > 1 ? Math.sign(lo) : 1; }
ref = [AHat[0] - course[0] * bk + lft[0] * side * sd1, AHat[1] - course[1] * bk + lft[1] * side * sd1, 0];
            ref[2] = snowZ(ref[0]) + 3.0 + zoomH; vref = [...vHat]; vref[2] += zoomH < p.zoomMax ? zr : 0;
          } else { vref = [dsV0[0] * Math.max(0, 1 - tau / 1.2), dsV0[1] * Math.max(0, 1 - tau / 1.2), 0]; vref[2] = -vref[0] * tanS; ref = null; }
          const dH = Math.hypot(gp[0] - R.s.pos[0], gp[1] - R.s.pos[1]);
          if (Vair < 1.15 * Vs || (p.zoomStop ? Rspd < 0.5 : Rspd < 6) || dH < (p.zoomStop ? 0 : 6) || tau > (p.zoomStop ? 4.5 : 3)) { dsPhase = 2; dsT2 = t; if (hookOn && !reelFailed && !lineCut) reelMode = 'soft'; }
          // the rider only slowed down and skis on: resume following
          if (hookOn && tau > 0.6 && Rspd > 5 && Racc > 0.3) { mode = 'follow'; modeT = t; stopDet = false; slowT = 0; reelMode = 'tension'; ev(t, 'resume', 'info', '滑雪者未停下继续滑行：恢复跟拍', 'Rider skis on without stopping: follow resumes'); }
        }
        if (mode === 'dstall' && dsPhase === 2) {
          // step away from the rider (horizontal), biased to the holster side, for the first 1.6 s
          const away = [gp[0] - R.s.pos[0], gp[1] - R.s.pos[1]], al = Math.hypot(away[0], away[1]) || 1;
          const dir2 = [away[0] / al + 0.5 * side * lft[0], away[1] / al + 0.5 * side * lft[1]], dl2 = Math.hypot(dir2[0], dir2[1]) || 1;
          const sd = t - dsT2 < 1.6 ? 2.5 : 0;
          vref = [(dir2[0] / dl2) * sd, (dir2[1] / dl2) * sd, 0]; vref[2] = -vref[0] * tanS + (hg > 0.6 ? -3 : -1.5);
          ref = null;
          if (hookOn && !reelFailed && !lineCut) reelMode = marginDrop ? 'hold' : L > (p.zoomStop ? 10 : 7) ? 'retract' : L < (p.zoomStop ? 9 : 6) ? 'soft' : reelMode; // long line (drift downwind): take it up; the glider is then well clear of the rider
          postCmd = Vair < 1.3 * Vs ? 1 : 0; // slow: pitch up into the post-stall plate; in a strong wind the plate would kite, so above 1.3·Vs it dives down into the wind instead
        }
      } else if (mode === 'abort' || mode === 'land' || mode === 'recover') {
        // turn-away program: a banked turn away from the rider (turnTarget rad: 180° = land facing uphill,
        // which brakes the slide), height held during the first part of the turn, then descent and flare;
        // abort (fall) starts with a 0.8 s zoom climb. Velocity tracking, not position tracking.
        const tau = t - modeT, hg = hSnow(gp);
        if (tau < SDT * 1.5 || turnPsi == null) { turnPsi = Math.atan2(course[1], course[0]); turnAcc = 0; } // turn relative to the run line
        const Vh = tailLand ? 1.25 * VsE : Math.max(1.2 * Vs, Math.hypot(gv[0], gv[1]));
        const tgt = mode === 'abort' ? Math.PI * 0.75 : Math.PI;
        if (turnAcc < tgt && !(mode === 'abort' && tau < 0.5)) { const om = (G * Math.tan(bankMax * 0.95)) / Math.max(Vh, 6); turnAcc = Math.min(tgt, turnAcc + om * SDT); }
        const psi = turnPsi + side * turnAcc;
        const dirH = [Math.cos(psi), Math.sin(psi), 0];
        const turnDone = turnAcc / tgt;
        let vz;
        if (mode === 'abort' && tau < 0.9) vz = 2.5; // zoom: trade speed for height first
        else if (mode === 'recover' && tau < 1.2) vz = 1.0;
        else if (hg < 0.6) vz = -0.35; // flare: hold ~1 g and let the airbrake bleed speed
        else vz = turnDone < 0.7 ? 0 : -Math.max(1.0, Math.min(2.5, hg * 0.9));
        vref = [dirH[0] * Vh, dirH[1] * Vh, -dirH[0] * Vh * tanS + vz];
        if (tailLand) { vref[0] += wEst[0]; vref[1] += wEst[1]; vref[2] = -vref[0] * tanS + vz; } // air-relative: ground = air + wind (height above the snow held, then the descent)
        ref = null;
      }
      // ---- PD + feed-forward
      let a;
      if (ref) {
        const ka = 1 - Math.exp(-SDT / 0.25);
        aff = add(aff, mul(sub(mul(sub(vref, vrefPrev), 1 / SDT), aff), ka)); vrefPrev = vref;
        let e = sub(ref, gp);
        const el = len(e); if (el > 6) e = mul(e, 6 / el);
        const ks = mode === 'reelin' ? 2.5 : 1; // final approach on the precise leash-angle fix: stiffer loop
        a = add(add(mul(e, p.Kp * ks), mul(sub(vref, gv), p.Kd * Math.sqrt(ks))), mul(aff, 0.7));
      } else { a = mul(sub(vref, gv), mode === 'dstall' ? 3.5 : 2.0); vrefPrev = vref; }
      // KE governor (ground speed ≤ vCap)
      const vg = len(gv);
      // predictive: ground speed + 0.4 s of its filtered rate must stay ≤ keGov·vCap (audit TG-12: 0.97 was on the line)
      vgDot += ((vg - vgF) / SDT - vgDot) * (1 - Math.exp(-SDT / 0.2)); vgF = vg;
      const vPred = vg + Math.max(0, vgDot) * 0.4, vLim = vCap * p.keGov, offAt0H = off.H;
      keLimit = vPred > vLim;
      if (keLimit && vg > 0.1) { // no along-track acceleration beyond the limit, brake above it (the glider lags, the reel pays out)
        const vh = mul(gv, 1 / vg), aAl = dot(a, vh);
        a = add(sub(a, mul(vh, aAl)), mul(vh, Math.min(aAl, -4 * (vPred - vLim))));
        // round 4: the airbrake alone is weak at low dynamic pressure (tailwind legs); the surplus is also traded for
        // height (zoom, ≤ zoomGovMax above the station height), so the governor does not depend on drag alone
        if (p.zoomGov && hSnow(gp) < (offAt0H + p.zoomGovMax)) a[2] += p.zoomGov * (vPred - vLim);
      }
      // geofence: keep ≥ 2.2 m from the head except on final approach
      if (mode !== 'reelin') {
        const head = R.b.head, rel = sub(gp, head), d = len(rel);
        if (d < 2.6) { const nn = mul(rel, 1 / (d || 1)); a = add(a, mul(nn, 6 * (2.6 - d))); const cl = dot(sub(gv, R.s.vel), nn); if (cl < 0) a = add(a, mul(nn, -2 * cl)); }
      }
      const ah = Math.hypot(a[0], a[1]); if (ah > 14) { a[0] *= 14 / ah; a[1] *= 14 / ah; }
      a[2] = clamp(a[2], -9, 12);
      Fdes = sub(sub(mul(a, m), [0, 0, -m * G]), FlineMeas);
      lastRef = ref || lastRef;
      // ---- allocation to lift vector, bank and airbrake
      if (Vair > 2 && fold < 0.5) {
        const ea = mul(va, 1 / Vair);
        let u0 = sub([0, 0, 1], mul(ea, ea[2])); u0 = len(u0) > 1e-3 ? nrm(u0) : [1, 0, 0];
        const r0 = cross(ea, u0);
        const Fal = dot(Fdes, ea), Fpp = sub(Fdes, mul(ea, Fal));
        const P = polar(p, Vair), qS = 0.5 * p.rho * Vair * Vair * P.S;
        const lx = dot(Fpp, u0), ly = dot(Fpp, r0);
        cmdBank = clamp(Math.atan2(ly, Math.max(lx, 0.15 * qS)), -bankMax, bankMax);
        const ldir = add(mul(u0, Math.cos(cmdBank)), mul(r0, Math.sin(cmdBank)));
        cmdCL = clamp(dot(Fpp, ldir) / qS, p.CLmin, P.CLmax + p.flapDCL * brakeA);
        const Dmin = (qS * (P.cd0 + P.k * cmdCL * cmdCL)) / p.ldFactor;
        cmdBrake = clamp((-Fal - Dmin) / (qS * p.brakeCD), 0, 1);
        shortfall = Math.max(0, Dmin + Fal);
        if ((mode === 'land' || mode === 'abort' || mode === 'recover') && hSnow(gp) < 0.6) { cmdBrake = Math.max(cmdBrake, 0.7); cmdCL = Math.min(cmdCL, (1.05 * m * G) / qS); }
        if (mode === 'dstall' && dsPhase === 2) { cmdBrake = 1; if (postCmd) { cmdCL = p.CLpost; cmdBank = clamp(cmdBank, -0.5, 0.5); } }
      } else if (mode === 'dstall') { cmdCL = p.CLpost; cmdBank = 0; cmdBrake = 1; postCmd = 1; }
      else { cmdCL = 0; cmdBank = 0; cmdBrake = 0; }
    }
    if (mode === 'sled' || mode === 'drop' || mode === 'landed' || mode === 'snowpull' || mode === 'park') { cmdCL = 0; cmdBank = 0; cmdBrake = mode === 'landed' || mode === 'snowpull' || mode === 'park' ? 1 : 0; }
    if (mode !== 'dstall') postCmd = 0;

    // ---- tow request → reel tension set-point
    const towModes = mode === 'follow' || mode === 'winch';
    if (towModes && hookOn && reelMode === 'tension') {
      const tB = nrm(sub(A0, add(gp, hookLocal(bodyX, bodyZ))));
      const ea = Vair > 1 ? mul(va, 1 / Vair) : bodyX;
      const cosT = Math.max(0.3, -dot(tB, ea) * -1 >= 0 ? dot(tB, ea) : 0.3);
      const surplus = cmdBrake > 0.03 && Tcmd > p.Tmin ? cmdBrake * 0.5 * p.rho * Vair * Vair * p.S * p.brakeCD : 0;
      Tcmd += SDT * 4 * (keLimit ? -1.5 : shortfall / cosT - surplus);
      const winchFull = mode === 'winch' && hSnow(gp) < 0.8 && t - modeT < 2.5 && !keLimit; // round 3: the KE governor also caps the winch (tailwind relaunch reached 16.5 J) // full winch tension only until 0.8 m: then the normal tow request
      const TminEff = keLimit ? Math.min(0.15, p.Tmin) : p.Tmin + (Math.min(0.15, p.Tmin) - p.Tmin) * smooth((tailEstS - 0.5) / 1.5); // round 4: the anti-sag floor fades to 0.15 N in a tailwind (a 0.8 N pull made the glider overrun stopping riders)
      Tcmd = clamp(Tcmd, winchFull ? p.Tlaunch : TminEff, winchFull ? Math.max(p.Tlaunch, p.TtowMax) : p.TtowMax); // round 4: the 0.8 N anti-sag floor drops to 0.15 N while the KE governor is active
      // airspeed floor: request more tow before the glider sinks below 1.15 Vs
      if (Vair < 1.15 * VsE && mode === 'follow') Tcmd = Math.min(p.TtowMax, Tcmd + SDT * 3);
    }
    let vInLim = p.vIn, Tret = 0.5;
    if (mode === 'recover') { Tret = 0.5; vInLim = 0.6; }
    if (mode === 'reelin') { Tret = 1.2; vInLim = L > 3 ? 3 : 1.3; }
    if (mode === 'snowpull') { Tret = L > 1.6 ? 1.5 : 2.5; vInLim = clamp(0.4 + 0.5 * (L - 0.8), 0.4, 1.6); if (Rspd > 0.5) { Tret = 2.5; vInLim = clamp(0.6 + 1.2 * (L - 0.8), 0.6, 3.0); } } // moving rider: fast pull (KE-governed by the reel)
    if (mode === 'park') { Tret = 1.5; vInLim = 1.2; }
    if (mode === 'dstall') { Tret = hookOn && L > 7 ? 2.6 : 1.5; vInLim = 1.5; } // round 3: a plate drifting in a strong wind is held on the line (≤2.6 N, below the 3 N clutch) instead of running out the spool
    if (mode === 'land' && tailLand && hookOn && !reelFailed && !lineCut) { reelMode = L > 9 ? 'retract' : L < 8 ? 'soft' : reelMode; Tret = 2.0; vInLim = 1.5; } // round 4: the turn-away into the wind is held on ≤ 9 m of line (≤ 2 N, below the clutch)
    if (mode === 'free' || !hookOn) { Tret = 0.3; vInLim = 3; }

    // fold: wings spring open after the drop; fold for the final dock / snow pull
    // substeps: keep ω·h ≤ 0.8 for the stiffest line–drum mode (EA/L on the drum mass)
    const govModes = ['sled', 'snowpull', 'park', 'drop', 'landed', 'winch', 'dstall'].includes(mode); // in flight the aero KE governor acts
    const KS = Math.max(6 * kFac, Math.ceil((SDT * Math.sqrt((p.EA / Math.max(0.05, L)) * (1 / p.reelM + 1 / m))) / (0.8 * kFac))), h = SDT / KS;
    const foldCmd = mode === 'stowed' || mode === 'docked' || mode === 'seat' || mode === 'snowpull' || mode === 'park' || (mode === 'landed' && p.stopMode === 2) || (mode === 'reelin' && L < 0.55) ? 1 : mode === 'drop' && t - modeT < 0.3 ? 1 : 0;

    // ---------------- substeps
    const dp0 = [...gp], dv0 = [...gv];
    const slack0 = hookOn ? L - len(sub(add(gp, hookLocal(bodyX, bodyZ)), A0)) : 0;
    let Tacc = 0, Tmax = 0, Facc = [0, 0, 0], snowAcc = 0, PgA = 0, PdA = 0, PtA = 0, PrA = 0;
    let bowA = [0, 0, 0], bowB = [0, 0, 0];
    const Pc = contact ? contact.P : null;
    const crs = crosserAt(t);
    for (let k = 0, KSe = attachedNow ? 1 : KS; k < KSe; k++) {
      const w = (k + 0.5) / KSe;
      const A = lerp3(A0, A1, w);
      const wG = lerp3(wG0, wG1, w);
      fold += clamp(foldCmd - fold, -h / 0.35, h / 0.35);
      post += clamp(postCmd - post, -h / 0.25, h / 0.25);
      bankA += clamp((cmdBank - bankA) * (h / 0.15), -h * 3.5, h * 3.5);
      CLa += (cmdCL - CLa) * (h / 0.08);
      brakeA += clamp((cmdBrake - brakeA) * (h / 0.1), -h * 6, h * 6);
      if (mode === 'stowed' || mode === 'docked' || mode === 'seat') {
        const tgt = mode === 'seat' ? lerp3(add(A, mul(R.ax, 0.05)), sub(A, mul(R.ax, 0.2)), smooth((t - modeT) / 0.8)) : sub(A, mul(R.ax, 0.2));
        gp = tgt; gv = [...Av]; L = 0.05; Ld = 0; T = 0; Fline = [0, 0, 0];
        bodyX = mul(R.ax, -1); bodyZ = nrm(cross(cross(bodyX, [0, 0, 1]), bodyX));
        continue;
      }
      // ---- line geometry and tension
      const B = add(gp, hookLocal(bodyX, bodyZ));
      let FonA = [0, 0, 0], FonB = [0, 0, 0], FonP = [0, 0, 0];
      const lineOn = !lineCut;
      if (lineOn && hookOn) {
        const wMid = lerp3(wG, wR0, 0.5);
        let spans;
        if (contact) {
          const Pk = add(contact.P, mul(contact.Pv, (k + 0.5) * h)); // contact moves with the crossing body within the step
          const s1 = spanLoad(A, Pk, Av, contact.Pv, wMid, p), s2 = spanLoad(Pk, B, contact.Pv, gv, wMid, p);
          spans = [{ l: s1.l, q: s1.qm, s: s1 }, { l: s2.l, q: s2.qm, s: s2 }];
        } else { const s1 = spanLoad(A, B, Av, gv, wMid, p); spans = [{ l: s1.l, q: s1.qm, s: s1 }]; }
        T = solveT(L, spans, p.EA, T);
        const first = spans[0].s, last = spans[spans.length - 1].s;
        bowA = bowOf(first, T); bowB = spans.length > 1 ? bowOf(last, T) : bowA;
        FonA = add(mul(nrm(add(first.c, mul(bowA, 4))), T), mul(first.ch, 0.5 * first.ft * first.l));
        FonB = add(mul(nrm(add(mul(last.c, -1), mul(bowB, 4))), T), mul(last.ch, 0.5 * last.ft * last.l));
        if (contact) FonP = mul(add(nrm(add(mul(first.c, -1), mul(bowA, 4))), nrm(add(last.c, mul(bowB, 4)))), T);
      } else if (lineOn && !hookOn && freeEnd) {
        // free line after the hook release: reel retracts; the free end trails (no load beyond friction/drag)
        T = Math.max(0.02, Math.min(Tret, 0.15)); FonA = mul(nrm(sub(freeEnd.P, A)), T);
      } else { T = 0; }
      // ---- reel drum
      if (!lineCut && (hookOn || freeEnd)) {
        let F;
        const rr = hookOn ? dot(sub(gv, Av), nrm(sub(B, A))) : 0;
        switch (reelMode) {
          case 'free': F = 0.05 + 0.1 * Math.max(0, Ld); break; // magnetic anti-backlash brake (ASSUMED, baitcasting-reel practice)
          case 'protect': F = 0.05; break;
          case 'soft': F = (mode === 'dstall' && p.zoomStop ? 0.7 : 0.3) + 0.15 * Math.max(0, Ld);
            if (mode === 'dstall' && p.zoomStop && slack0 > 0.15) F = Math.min(0.4 + 0.08 * Math.hypot(wEst[0], wEst[1]), T + 6 * (Ld + Math.min(3, 3 * slack0)));
            if (mode === 'dstall' && p.zoomStop && Math.hypot(wEst[0], wEst[1]) > 4) F = 1.0 + 0.3 * Math.max(0, Ld); // strong wind: constant 1.0 N tension (the plate's ≈3 N drag holds it; the line cannot bow ≥0.4 m) // slack take-up only (≤0.4 N): a slack line bows in a crosswind towards the head
            break; // round 3: 0.7 N pay-out drag in a drop keeps the line from bowing towards the head in a crosswind // recovery turn: gentle drag on pay-out, never yanks
          case 'failed': F = 0.25; break;
          case 'retract': F = clamp(T + 6 * (Ld + vInLim), -0.3, Ld > 0 ? p.Fclutch : Tret); break; // speed-controlled winch, pull ≤ Tret, brakes pay-out
          case 'locked': F = p.Fclutch; break;
          case 'hold': F = T <= p.Fclutch ? T + 6 * Ld : p.Fclutch; // parked: drum held by the motor brake, slips above the clutch
            if (p.zoomStop && mode === 'park' && slack0 > 0.15) F = Math.min(0.5, T + 6 * (Ld + Math.min(1, 2 * slack0))); // round 3: take up slack (≤0.5 N, below the 0.6 N snow friction of the parked glider) so a slack line cannot bow towards the head in a crosswind
            break;
          default: F = Tcmd + 1.2 * (Ld - rr); if (Ld < -p.vIn) F -= 8 * (-p.vIn - Ld);
            if (slack0 > 0.15) F = T + 6 * (Ld + Math.min(p.vIn, 2 * slack0)); // slack line: speed-controlled take-up
            if (mode === 'winch' && L < p.Llaunch - 0.5 && Ld < 0.2 && slack0 <= 0.15 && !keLimit) F = T + 6 * Ld; // the winch tension climbs the glider; it does not shorten the line below the launch length
        }
        // round 4 reel KE governor (energy governor on the leash): when the glider's own GNSS/IMU ground speed (0.1 s
        // filtered) exceeds reelGovK × the KE-governor speed, the drum stops pulling (free pay-out, 0.05 N), so the line can
        // never accelerate the glider beyond it (sled, snow pull, winch, tow)
        if (p.reelGov && hookOn && govModes && vgS > p.reelGovK * p.keGov * vCap) F = Math.min(F, 0.05);
        F = clamp(F, -0.3, p.Fclutch);
        const pawl = reelMode === 'free' || reelMode === 'protect' || reelMode === 'failed' || (reelMode === 'soft' && !(mode === 'dstall' && p.zoomStop));
        Ld += ((T - F - 0.05 * Ld) / p.reelM) * h;
        if (pawl && Ld < 0) Ld = 0;
        L += Ld * h;
        if (L < 0.05) { L = 0.05; if (Ld < 0) Ld = 0; }
        if (L >= p.Lmax) { L = p.Lmax; if (Ld > 0) Ld = 0; }
        if (Ld > 0.3 && F >= p.Fclutch - 1e-6) slipT += h; else slipT = Math.max(0, slipT - h * 0.5);
        PrA += Math.abs(F * Ld) / KS;
      }
      // ---- glider forces
      const air = sub(gv, add(wG, wakeG)), Va = len(air);
      let Fa = [0, 0, 0];
      if (Va > 0.05) {
        const ea = mul(air, 1 / Va), qd = 0.5 * p.rho * Va * Va;
        if (fold > 0.5) Fa = mul(ea, -qd * p.cdaFold * (1 + (1 - fold) * 3));
        else {
          let u0 = sub([0, 0, 1], mul(ea, ea[2])); u0 = len(u0) > 1e-3 ? nrm(u0) : [1, 0, 0];
          const r0 = cross(ea, u0), ldir = add(mul(u0, Math.cos(bankA)), mul(r0, Math.sin(bankA)));
          const P = polar(p, Va), S = P.S * (1 - fold);
          const CLmx = P.CLmax + p.flapDCL * brakeA;
          let CLe = Math.min(CLa, CLmx);
          let CD = (P.cd0 + P.k * CLe * CLe) / p.ldFactor + brakeA * p.brakeCD + (CLa > CLmx * 1.02 ? 0.3 : 0);
          if (post > 0) { CLe = CLe * (1 - post) + p.CLpost * post; CD = CD * (1 - post) + (p.CDpost + brakeA * p.brakeCD) * post; } // post-stall plate
          Fa = add(mul(ldir, qd * S * CLe), mul(ea, -qd * S * CD - qd * p.cdaFold * fold));
          PdA += (qd * S * CD * Va) / KS;
        }
      }
      let F = add(add(Fa, [0, 0, -m * G]), FonB);
      // snow contact (belly skid)
      const hs = hSnow(gp);
      let onSnow = false;
      if (hs < 0.0365) { // resting contact band (projection sets 0.035)
        onSnow = true;
        const Fn = dot(F, nS);
        const vn = dot(gv, nS);
        if (vn < -0.3 && !Number.isFinite(tTouch) && (mode === 'recover' || mode === 'land' || mode === 'abort' || mode === 'dstall')) { tTouch = t; vTouch = len(gv); touchKE = 0.5 * m * dot(gv, gv); }
        gp = add(gp, mul(nS, 0.035 - hs)); if (vn < 0) gv = sub(gv, mul(nS, vn));
        if (Fn < 0) {
          const N = -Fn; F = add(F, mul(nS, N));
          const vt = sub(gv, mul(nS, dot(gv, nS))), vtl = len(vt);
          const mu = mode === 'sled' || mode === 'drop' || mode === 'winch' ? 0.15 : mode === 'snowpull' || mode === 'park' || fold > 0.5 ? 0.45 : 0.3; // belly skid 0.15; wings/flaps on snow 0.3; folded with split flaps out as a snow brake 0.45 (ASSUMED)
          if (vtl > 1e-3) { const fr = Math.min(mu * N, (vtl * m) / h); F = sub(F, mul(vt, fr / vtl)); }
          else { // static friction holds unless the tangential force exceeds μN
            const Ft = sub(F, mul(nS, dot(F, nS))), Ftl = len(Ft);
            if (Ftl <= mu * N) F = sub(F, Ft); else F = sub(F, mul(Ft, (mu * N) / Ftl));
          }
        }
      }
      gv = add(gv, mul(F, h / m));
      if (mode === 'snowpull' && L < 0.6) gv = add(gv, mul(sub(Av, gv), Math.min(1, h / 0.15))); // last 0.6 m: the folded dart rubs on the funnel cone / leg (contact damping, ASSUMED)
      gp = add(gp, mul(gv, h));
      // body attitude: x along the air velocity pitched by α, z = lift direction (flying); along the slope on snow; along the line when folded/hanging
      if (onSnow && fold < 0.5) {
        const vt = sub(gv, mul(nS, dot(gv, nS)));
        const hd = len(vt) > 0.3 ? nrm(vt) : (hookOn && !lineCut ? nrm(sub(sub(A, gp), mul(nS, dot(sub(A, gp), nS)))) : bodyX);
        bodyX = hd; bodyZ = nS;
      } else if (fold >= 0.5 && hookOn && !lineCut) {
        bodyX = nrm(sub(A, gp)); bodyZ = nrm(cross(cross(bodyX, [0, 0, 1]), bodyX)); if (!Number.isFinite(bodyZ[0])) bodyZ = [0, 0, 1];
      } else if (Va > 1) {
        const ea = mul(air, 1 / Va);
        let u0 = sub([0, 0, 1], mul(ea, ea[2])); u0 = len(u0) > 1e-3 ? nrm(u0) : [0, 0, 1];
        const r0 = cross(ea, u0), ldir = add(mul(u0, Math.cos(bankA)), mul(r0, Math.sin(bankA)));
        const al = clamp(CLa / p.CLa, -0.15, 0.3);
        bodyX = nrm(add(mul(ea, Math.cos(al)), mul(ldir, Math.sin(al)))); bodyZ = nrm(sub(mul(ldir, Math.cos(al)), mul(ea, Math.sin(al))));
      }
      Fline = FonB;
      Tacc += T / KS; Tmax = Math.max(Tmax, T); Facc = add(Facc, mul(FonA, 1 / KS)); snowAcc = Math.max(snowAcc, onSnow ? 1 : 0);
      PgA += (-m * G * gv[2]) / KS; PtA += dot(FonB, gv) / KS;
      if (contact) { contact.F = FonP; }
    }
    FlineMeas = [...Fline];
    Thip = len(Facc);
    wG0 = wG1; wR0 = wR1;

    // ---------------- events after integration
    const B = add(gp, hookLocal(bodyX, bodyZ));
    // capture at the funnel: hook within 8 cm of the mouth
    if ((mode === 'reelin' || mode === 'snowpull') && hookOn && (len(sub(B, A1)) < 0.09 || (mode === 'snowpull' && L < 0.2))) { // nose within the 20 cm funnel cone (capture itself not modelled, audit TG-08)
      captureV = len(sub(gv, Av));
      mode = 'seat'; modeT = t; reelMode = 'locked';
      ev(t, 'capture', 'info', `机头进入髋部漏斗（相对速度 ${captureV.toFixed(1)} m/s），机翼折叠入筒`, `Nose enters the hip funnel (relative speed ${captureV.toFixed(1)} m/s); wings fold into the quiver`);
    }
    if (mode === 'seat' && t - modeT > 0.8 && (marginDrop || restowF) && !isFinal) { mode = 'stowed'; modeT = t; marginDrop = false; restowF = false; stopDet = false; wasStill = false; reelMode = 'locked'; ev(t, 'restow', 'info', '滑翔机已收回枪套，下次蹬出时自动再起飞', 'Glider back in the holster; it relaunches at the next push-off'); }
    if (mode === 'seat' && t - modeT > 0.8) { mode = 'docked'; modeT = t; tDocked = t; captured = true; ev(t, 'docked', 'info', '入筒锁定，开始充电', 'Seated and latched; charging'); }
    // recover: after touchdown slide → landed (reel then drags it in)
    snowT = hSnow(gp) < 0.045 ? snowT + SDT : 0;
    if (mode === 'dstall' && t - modeT > 0.3 && snowT > 0.1) {
      mode = 'landed'; modeT = t; landedT = t; post = 0; postCmd = 0;
      if (hookOn && !reelFailed && !lineCut) reelMode = 'soft';
      ev(t, 'landed', 'info', `滑翔机深失速落雪（触地 ${Number.isFinite(vTouch) ? vTouch.toFixed(1) : '—'} m/s），折翼`, `Glider deep-stall lands on the snow (touchdown ${Number.isFinite(vTouch) ? vTouch.toFixed(1) : '—'} m/s) and folds`);
    }
    if ((mode === 'recover' || mode === 'land' || mode === 'abort') && t - modeT > 0.4 && ((mode === 'recover' && snowT > 0.3) || (hSnow(gp) < 0.04 && len(sub(gv, mul(nS, dot(gv, nS)))) < Math.max(1.0, Rspd + 0.5)))) {
      mode = 'landed'; modeT = t; landedT = t; tailLand = false;
      ev(t, 'landed', 'info', `滑翔机落在雪面（触地 ${Number.isFinite(vTouch) ? vTouch.toFixed(1) : '—'} m/s）`, `Glider down on the snow (touchdown ${Number.isFinite(vTouch) ? vTouch.toFixed(1) : '—'} m/s)`);
    }
    if (mode === 'recover' && t - modeT > 8) { mode = 'land'; modeT = t; }
    // in-motion reel-in failure: glider on the snow before capture → snow pull fallback
    if (mode === 'reelin' && hSnow(gp) < 0.04 && t - modeT > 0.3) { mode = 'snowpull'; modeT = t; ev(t, 'reelinFail', 'warning', '沿绳绞回时滑翔机在尾流中失速落雪：改为雪面拖回', 'Glider stalls in the wake and drops to the snow during reel-in: falls back to the snow pull'); }

    // contacts: crossing skier and branch
    const crs1 = crosserAt(t + SDT);
    if (hookOn && !lineCut && L > 0.5) {
      if (!contact && crs1) {
        const pts = linePoints(A1, B, bowA, null, null, 16);
        for (let j = 1; j < pts.length; j++) {
          const q = pts[j], d = Math.hypot(q[0] - crs1.x, q[1] - crs1.y), hz = q[2] - crs1.z0;
          if (d < 0.25 && hz > 0.25 && hz < 1.85) {
            contact = { kind: 'cross', P: [crs1.x, crs1.y, q[2]], Pv: crs1.v, F: [0, 0, 0], t0: t, h0: hz };
            ev(t, 'strike', 'warning', `横穿滑雪者在离雪 ${hz.toFixed(2)} m 处撞上牵绳`, `A crossing skier runs into the leash ${hz.toFixed(2)} m above the snow`);
            break;
          }
        }
      }
      if (!contact && plan.branch) {
        // swept test in the x–z plane: the branch (horizontal, along y) is caught when the line sweeps up through it
        const Bq = plan.branch, bz = snowZ(Bq.x) + Bq.h;
        const pts = linePoints(A1, B, bowA, null, null, 16);
        let side = 0, yy = NaN;
        for (let j = 1; j < pts.length; j++) {
          const a = pts[j - 1], c = pts[j];
          if ((a[0] - Bq.x) * (c[0] - Bq.x) <= 0 && Math.abs(c[0] - a[0]) > 1e-9) {
            const u = (Bq.x - a[0]) / (c[0] - a[0]);
            yy = a[1] + u * (c[1] - a[1]); const zz = a[2] + u * (c[2] - a[2]);
            if (yy > Bq.y0 && yy < Bq.y1) side = zz < bz ? -1 : 1;
            break;
          }
        }
        if (branchSide === -1 && side === 1) {
          contact = { kind: 'branch', P: [Bq.x, yy, bz], Pv: [0, 0, 0], F: [0, 0, 0] };
          ev(t, 'snag', 'warning', `牵绳挂在离雪 ${Bq.h} m 的横伸树枝上`, `Leash caught on a branch ${Bq.h} m above the snow`);
        }
        branchSide = side;
      }
    }
    if (contact && contact.kind === 'cross') {
      // contact slides along the crossing body's vertical axis to the shortest-path height; slips off over the head
      const c1 = crs1 || crosserAt(t);
      const P = [c1.x, c1.y, 0];
      const d1 = Math.hypot(A1[0] - P[0], A1[1] - P[1]), d2 = Math.hypot(B[0] - P[0], B[1] - P[1]);
      const zs = A1[2] + (B[2] - A1[2]) * (d1 / Math.max(1e-6, d1 + d2));
      const zr = zs - c1.z0;
      if (cr.catch && t - contact.t0 < cr.catch) { contact.P = [c1.x, c1.y, c1.z0 + contact.h0]; contact.Pv = c1.v; } // line caught (arm/pole/jacket friction): no sliding
      else if (zr > 1.9 || zr < 0.1) { contact = null; ev(t, 'slipoff', 'info', zr > 1.9 ? '牵绳从横穿者头顶滑脱' : '牵绳从横穿者脚下滑脱', zr > 1.9 ? 'Leash slides off over the crosser\'s head' : 'Leash slides off under the crosser'); }
      else { contact.P = [c1.x, c1.y, c1.z0 + clamp(zr, 0.25, 1.85)]; contact.Pv = c1.v; }
    } else if (contact && contact.kind === 'branch' && plan.branch) {
      const Bq = plan.branch;
      // slides along the branch (frictionless) towards the shortest path; slips off the branch tip
      const d1 = Math.hypot(A1[0] - Bq.x, A1[2] - contact.P[2]), d2 = Math.hypot(B[0] - Bq.x, B[2] - contact.P[2]);
      const ys = A1[1] + (B[1] - A1[1]) * (d1 / Math.max(1e-6, d1 + d2));
      if (ys < Bq.y0 || ys > Bq.y1) { contact = null; ev(t, 'slipoff', 'info', '牵绳从树枝末端滑脱', 'Leash slips off the branch tip'); }
      else contact.P = [Bq.x, contact.P[1] + clamp(ys - contact.P[1], -0.3, 0.3), contact.P[2]];
    }
    // tow-hook release on the glider: strike/snag = line force well off the expected direction, or overload
    if (hookOn && !lineCut && (mode === 'follow' || mode === 'winch')) {
      const fm = len(FlineMeas), exp = nrm(sub(A1, B)), cosd = fm > 1e-6 ? dot(FlineMeas, exp) / fm : 1;
      snagT = fm > 0.5 && cosd < Math.cos((35 * Math.PI) / 180) ? snagT + SDT : 0;
      strikeT = fm > p.hookRelease && !(mode === 'winch' && hSnow(gp) < 2.5) ? strikeT + SDT : 0;
      if ((snagT > 0.2 || strikeT > 0.04) && p.hookOk) {
        hookOn = false; mode = 'dstall'; modeT = t; reelMode = 'retract'; dsV0 = [gv[0], gv[1]]; postCmd = 0;
        freeEnd = { P: [...B] };
        ev(t, 'release', 'warning', `滑翔机拖钩释放（机端拉力 ${fm.toFixed(1)} N、偏离 ${(Math.acos(clamp(cosd, -1, 1)) * 57.3).toFixed(0)}°）：失去牵绳供电，靠超级电容深失速落雪待取；卷轴收回空绳`, `Glider tow-hook releases (hook force ${fm.toFixed(1)} N, ${(Math.acos(clamp(cosd, -1, 1)) * 57.3).toFixed(0)}° off-axis): leash power is lost, it deep-stall lands on its supercapacitor for pick-up; the reel retracts the empty line`);
      }
    }
    // free line end after release: drawn back by the reel, around the contact point
    if (freeEnd && !lineCut) {
      const base = contact ? contact.P : A1;
      let l1 = contact ? len(sub(contact.P, A1)) : 0;
      const rest = Math.max(0, L - l1);
      const dir = nrm(sub(freeEnd.P, base));
      freeEnd.P = add(base, mul(dir, rest));
      freeEnd.P[2] = Math.max(freeEnd.P[2] - 0.02, snowZ(freeEnd.P[0]) + 0.01);
      if (contact && rest < 0.05) { contact = null; ev(t, 'unhooked', 'info', '空绳自由端绕过障碍物被收回：障碍物上无残留', 'The empty line end pulls through past the obstacle: nothing left behind'); }
      if (L <= 0.06 && !captured) { captured = true; ev(t, 'lineHome', 'info', '空绳已全部收回', 'Empty line fully retracted'); }
    }
    // spool nearly empty while the glider lags (rider faster than the KE cap): the glider releases its tow hook and
    // free-flies (then lands for pick-up); the reel retracts the empty line — the hip cutter stays the last resort
    if (hookOn && !lineCut && !['stowed', 'docked', 'seat', 'snowpull', 'park'].includes(mode) && L > p.Lmax - 1.5 && p.hookOk) {
      // release BEFORE any hip cut (audit TG-01): the hook opens, the glider deep-stall lands, the reel winds the empty line home
      hookOn = false; mode = 'dstall'; modeT = t; reelMode = 'retract'; freeEnd = { P: [...B] }; dsV0 = [gv[0], gv[1]]; postCmd = 0;
      ev(t, 'release', 'warning', `牵绳将用尽（${L.toFixed(1)} m）：先释放拖钩（不触发髋部切绳），滑翔机深失速落雪待取，卷轴收回空绳`, `Leash nearly used up (${L.toFixed(1)} m): the tow hook releases first (no hip cut), the glider deep-stall lands for pick-up, the reel winds in the empty line`);
    }
    // clutch slipping for >1 s with >4 m extra pay-out: open the tow hook first (audit TG-01) …
    if (hookOn && !lineCut && reelMode !== 'locked' && p.hookOk && slipT > 1.0 && L - Lpre > 4 && !['stowed', 'docked', 'seat'].includes(mode)) {
      hookOn = false; mode = 'dstall'; modeT = t; reelMode = 'retract'; freeEnd = { P: [...B] }; dsV0 = [gv[0], gv[1]]; postCmd = 0; dsPhase = 2; dsT2 = t;
      ev(t, 'release', 'warning', '离合器持续打滑：先释放拖钩（不切绳），滑翔机落雪待取', 'Clutch slipping continuously: the tow hook opens first (no cut); the glider lands for pick-up');
    }
    // … the hip cutter is the last resort (hook failed to open): clutch slipping for >1 s with >6 m extra pay-out, or spool end
    if (hookOn && !lineCut && reelMode !== 'locked') {
      if (slipT < 0.05) Lpre = L;
      if ((slipT > 1.0 && L - Lpre > 6) || L >= p.Lmax - 0.3) {
        lineCut = true; reelMode = 'cut';
        ev(t, 'cut', 'warning', '髋部切绳器动作（离合器持续打滑或线轴到底）：牵绳与身体分离', 'Hip cutter fires (clutch slipping continuously or spool end): leash separates from the body');
        if (mode === 'follow' || mode === 'winch') { mode = 'free'; modeT = t; }
      }
    }
    maxSlipRun = Math.max(maxSlipRun, slipT);

    // ---------------- outputs
    const md2 = ['stowed', 'drop', 'sled', 'winch', 'follow', 'recover', 'reelin', 'seat', 'docked', 'abort', 'land', 'landed', 'snowpull', 'free', 'dstall', 'park'].indexOf(mode);
    O.gx[i] = dp0[0]; O.gy[i] = dp0[1]; O.gz[i] = dp0[2];
    O.gvx[i] = dv0[0]; O.gvy[i] = dv0[1]; O.gvz[i] = dv0[2];
    O.fx[i] = bodyX[0]; O.fy[i] = bodyX[1]; O.fz[i] = bodyX[2]; O.ux[i] = bodyZ[0]; O.uy[i] = bodyZ[1]; O.uz[i] = bodyZ[2];
    O.bank[i] = (bankA * 180) / Math.PI; O.CL[i] = CLa; O.brake[i] = brakeA; O.fold[i] = fold; O.air[i] = Vair;
    O.mode[i] = md2; O.reelMode[i] = ['tension', 'free', 'protect', 'failed', 'retract', 'locked', 'cut', 'soft', 'hold'].indexOf(reelMode);
    O.L[i] = L; O.Ld[i] = Ld; O.T[i] = hookOn && !lineCut ? Tacc : 0; O.Thip[i] = lineCut ? 0 : Thip; O.Tcmd[i] = Tcmd;
    O.TglX[i] = FlineMeas[0]; O.TglY[i] = FlineMeas[1]; O.TglZ[i] = FlineMeas[2];
    O.ax[i] = A0[0]; O.ay[i] = A0[1]; O.az[i] = A0[2];
    O.bx[i] = bowA[0]; O.by[i] = bowA[1]; O.bz[i] = bowA[2];
    O.wx[i] = bowB[0]; O.wy[i] = bowB[1]; O.wz[i] = bowB[2];
    O.contact[i] = contact ? (contact.kind === 'cross' ? 1 : 2) : 0;
    O.px[i] = contact ? contact.P[0] : NaN; O.py[i] = contact ? contact.P[1] : NaN; O.pz[i] = contact ? contact.P[2] : NaN;
    O.Fcross[i] = contact && contact.F ? len(contact.F) : 0;
    O.p2x[i] = freeEnd ? freeEnd.P[0] : NaN; O.p2y[i] = freeEnd ? freeEnd.P[1] : NaN; O.p2z[i] = freeEnd ? freeEnd.P[2] : NaN;
    O.freeEnd[i] = freeEnd && !captured ? 1 : 0;
    O.hookOn[i] = hookOn && !lineCut ? 1 : 0;
    O.Pgrav[i] = PgA; O.Pdrag[i] = PdA; O.Ptow[i] = PtA; O.Preel[i] = PrA;
    O.hgt[i] = hSnow(dp0); O.cx[i] = course[0]; O.cy[i] = course[1];
    O.crx[i] = crs ? crs.x : NaN; O.cry[i] = crs ? crs.y : NaN; O.crz[i] = crs ? crs.z0 : NaN;
    O.snow[i] = snowAcc; O.wake[i] = len(wakeG); O.weave[i] = weaveA; O.sideSign[i] = side;
    O.rx[i] = ref ? ref[0] : NaN; O.ry[i] = ref ? ref[1] : NaN; O.rz[i] = ref ? ref[2] : NaN;
    O.vwx[i] = wAir[0]; O.vwy[i] = wAir[1]; O.vwz[i] = wAir[2]; O.post[i] = post; O.Pel[i] = VsE;
  }
  return { p, O, n, SDT, events, rider, tanS, Vs, vCap,
    info: { tLiftoff, tDocked, tStop, tTouch, vTouch, touchKE, captureV, maxSlipRun, hookOn, lineCut, reelFailed, captured, relaunchN, parkLog, dropLog, stopN } };
}
