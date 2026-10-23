// Actively reeled tethered flyer on a skier — truth model + onboard estimators + controllers (SIM-032 controls).
//
// TRUTH (never read by the controllers): point-mass flyer; the wing pitch is referenced to the LINE through a
// bridle / forward tow point with an actuated pitch offset aB, so AoA = aB − asin(u·n) (u = air-relative
// velocity direction, n = line direction away from the pack); linear polar to stall, then flat-plate
// coefficients; bank angle φ (roll steering) and spoilers; a turbulence-driven roll disturbance; straight
// elastic line (Dyneema EA in series with a fairlead shock spring) with distributed weight and drag (half to
// each end, quasi-static) so the exit angle differs from the chord (sag); reel drum with inertia, friction and
// a voltage/current-limited BLDC (torque–speed envelope); skier anchor = project skier model packTop.
// ESTIMATORS: (a) tether-only: load cell, 2-axis exit-angle encoders (pack frame + pack AHRS error), reel
// encoder, skier GNSS/IMU velocity, known commands; optional flyer IMU specific force. (b) optional flyer air
// data (pitot + AoA vane). CONTROL: pack-side mode machine, reel law ("fly it like a kite"), flyer pitch/roll
// loops over a radio link with latency.
// Evidence: numerical-uncalibrated; point-mass flight model (no 6-DOF rotational dynamics), ASSUMED polars.
import { makeWind } from '../../../../sim/js/concepts/common/env.js';
import { skierAt, bodyPoints } from '../../../../sim/js/concepts/common/skier.js';
import { windEstimate } from '../../../../sim/js/concepts/common/fullrun.js';
import { SPECS, rngFrom, Delay } from './sensors.mjs';

const G = 9.81, D2R = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, f = [0, 0, 1]) => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : f; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mat3mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mat3T = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
const mat3add = (A, B) => A.map((r, i) => r.map((x, j) => x + B[i][j]));
const mat3sub = (A, B) => A.map((r, i) => r.map((x, j) => x - B[i][j]));
const mat3vec = (A, v) => A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
function mat3inv(A) {
  const [a, b, c] = A[0], [d, e, f] = A[1], [g, h, i] = A[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  return [[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det], [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det], [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]];
}
const asin = (x) => Math.asin(clamp(x, -1, 1));
// small rotation of a vector: yaw about world z, then tilts about x and y
function perturb(v, yaw, tx, ty) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  let x = v[0] * cy - v[1] * sy, y = v[0] * sy + v[1] * cy, z = v[2];
  let c = Math.cos(tx), s = Math.sin(tx); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ty); s = Math.sin(ty); [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}

// ---------------------------------------------------------------- vehicles (ASSUMED designs, see report)
export const FLYERS = {
  glider: { name: 'tether glider (rigid wing, bridled tow point, elevator = pitch-vs-line actuator)', m: 0.15, S: 0.12, AR: 7, e: 0.8, CD0: 0.035, CLa: 4.5, CLmax: 1.15, aB0: -15, brake0: 1, aFree: 5, aBmin: -80, aBmax: 10, CDbrake: 0.25, phiMax: 40,
    src: 'ASSUMED: 150 g / 0.12 m² foam-carbon glider (wing loading 12.3 N/m²), L/D max ≈11; CDbrake = spoilers' },
  kite: { name: 'single-skin foil kite + 30 g control pod (bridle pitch winch)', m: 0.10, S: 0.35, AR: 3.5, e: 0.7, CD0: 0.10, CLa: 3.5, CLmax: 1.0, aB0: -5, brake0: 0.3, aFree: 0, aBmin: -80, aBmax: 10, CDbrake: 0.3, phiMax: 35,
    src: 'ASSUMED: 0.35 m² foil, L/D max ≈4.4, 2.8 N/m²' },
};
export const LINE = { kSeries: 150, d: 0.0006, lambda: 0.00025, Cd: 1.1, EA: 5000, zeta: 0.3, Lmax: 30,
  src: 'ASSUMED Dyneema SK78 Ø0.6 mm class (≈0.25 g/m); EA 5 kN incl. drum compliance; kSeries 150 N/m = shock-absorbing fairlead spring (design choice) in series to limit snatch loads' };
export const REEL = { r: 0.0125, Jdrum: 1.2e-5, b: 3e-5, coul: 0.008, src: 'ASSUMED Ø25 mm drum (≈30 m of Ø0.6 mm line), bearing + seal friction' };
export const MOTORS = {
  M1: { ...SPECS.motor, name: 'MN3508 KV380 class, direct drive, 4S, Ø25 mm drum' },
  M2: { ...SPECS.motor, name: 'same motor, 6S, Ø32 mm drum (faster, weaker)', Vbus: 22.2, rOverride: 0.016 },
  M0: { ...SPECS.motor, name: '2207 KV900-class drone motor + 5:1 gear, 3S (lighter)', kv: 900, R: 0.07, Vbus: 11.1, Imax: 25, Jrotor: 1.2e-5, gear: 5, massG: 32 },
};
export const AIRDATA = { pitotSigma: 0.4, aoaSigmaDeg: 1.5, rateHz: 50, src: 'ASSUMED pitot (Sensirion SDP3x-class differential pressure, https://sensirion.com/products/catalog/SDP31) + 1 g AoA vane; σ incl. installation/icing' };

export const CTRL = {
  dtSim: 0.002, dtFlyer: 0.01,
  Tset: { glider: 3.0, kite: 2.5 }, Tmax: 25, Ka: 0.6, KaIn: 1.0, accMax: 8, kFly: 2, kHi: 2.5, kLo: 0.5, vOutMax: 6, vInMax: 7, vSlack: 2, vCreep: 1.5, vLaunch: 2.0, KaL: 1.0, launchHold: 0.5,
  Ltarget: { glider: 15, kite: 12 }, LminFly: 3, Ldock: 1.0, vRet: 5, vDock: 0.6,
  launchVaFactor: 1.3, launchAccMax: 2.0, launchCalmS: 0.3, elevStar: 65, elevEscape: 40, // launch gate: est. apparent wind ≥ factor × V_stall and skier accel small
  kPhi: 1.8, kPhiD: 5, tauCourse: 2.5, Tret: 6, ekfQ: 0.5, ekfR0: 0.4, ekfR1: 0.08, ekfGate: 16, elevTgt: 65, kBrake: 0.06, elevMinPay: 50, aoaK: 6, CLdesMax: 0.8,
};

// lift/drag vs angle of attack: linear polar to stall, then a blend to flat-plate coefficients
// (CL = sin 2α, CD = 1.9 sin²α; Hoerner-class flat plate), symmetric for negative α
export function aeroCoef(F, alpha) {
  const kInd = 1 / (Math.PI * F.e * F.AR), aS = F.CLmax / F.CLa, aN = -0.5 / F.CLa;
  if (alpha <= aS && alpha >= aN) { const CL = F.CLa * alpha; return [CL, F.CD0 + CL * CL * kInd]; }
  const edge = alpha > aS ? aS : aN, cE = F.CLa * edge, cdE = F.CD0 + cE * cE * kInd, w = 1 - Math.exp(-Math.abs(alpha - edge) / 0.08);
  return [cE * (1 - w) + Math.sin(2 * alpha) * w, cdE * (1 - w) + Math.max(cdE, 1.9 * Math.sin(alpha) ** 2) * w];
}

// ---------------------------------------------------------------- one closed-loop run
// o: { sk, case, flyer, arch: 'A1'|'A2'|'A3', airdata: bool (flyer pitot+vane used by the A3 pitch loop; else
//      tether-only estimates), est: 'noisy'|'oracle', motor, events: {start, stop, fall}, abort: 'reel'|'hold',
//      flyerImu: bool, Ltarget, Tset, ctrl: {...}, tEnd, log, logEvery, extra: fn(ctx) per 20 ms }
export function runTether(o) {
  const fk = o.flyer || 'glider', F = FLYERS[fk];
  const M = MOTORS[o.motor || 'M1'];
  const gear = M.gear || 1, r = M.rOverride || REEL.r;
  const Kt = 60 / (2 * Math.PI * M.kv), J = REEL.Jdrum + M.Jrotor * gear * gear;
  const sk = o.sk, c = o.case;
  const wind = makeWind({ mean: c.mean, intensity: c.intensity ?? 0.15, seed: c.seed });
  const R = rngFrom(o.seed ?? c.seed * 31 + 7), gn = R.n;
  const arch = o.arch || 'A3', oracle = o.est === 'oracle', airdata = !!o.airdata;
  const C = { ...CTRL, ...(o.ctrl || {}) };
  const Ltgt = o.Ltarget ?? C.Ltarget[fk], Tset = o.Tset ?? C.Tset[fk];
  const tEnd = o.tEnd ?? sk.duration;
  const m = F.m, S = F.S, rho = 1.0;
  const Vstall = Math.sqrt((2 * m * G) / (rho * S * F.CLmax));
  const anc = (t) => bodyPoints(skierAt(sk, t));
  // ---- sensor error draws (fixed per run)
  const la = SPECS.lineAngle.model, lc = SPECS.loadCell.model, imI = SPECS.imu.integration;
  const ns = o.noiseScale ?? 1, gnn = () => gn() * ns, on = (k) => (o.errOff && o.errOff.includes(k) ? 0 : 1);
  const errYaw = on('yaw') * gnn() * imI.yawErrDeg * D2R, errTx = on('tilt') * gnn() * imI.tiltErrDeg * D2R + on('abias') * gnn() * la.biasDeg * D2R, errTy = on('tilt') * gnn() * imI.tiltErrDeg * D2R + on('abias') * gnn() * la.biasDeg * D2R;
  const tScale = 1 + on('tscale') * gnn() * lc.scaleErr, tBias = on('tbias') * gnn() * lc.biasN, lScale = 1 + on('len') * gnn() * SPECS.reelEncoder.model.lengthScaleErr;
  const rhoHat = rho * (1 + on('rho') * 0.02 * gnn()), polErr = 1 + on('polar') * 0.08 * gnn(), aBerr = on('aB') * gnn() * 1.0 * D2R; // ASSUMED ±2 % ρ, ±8 % polar, ±1° pitch-actuator calibration
  const attErr = [gnn(), gnn(), gnn()].map((x) => x * SPECS.flyerImu.model.attErrDeg * D2R);
  const wEstPrior = windEstimate(wind, (t) => anc(t).packTop, { seed: c.seed });
  // ---- state
  let mode = 'STOWED', modeT = 0;
  let p = null, v = null;
  let aB = F.aB0 * D2R, phiA = 0, phiDist = 0, brake = F.brake0, alphaT = 0;
  let Lp = 0.12, om = 0, iM = 0, Tc = 0, Tanc = [0, 0, 0];
  const Tdel = new Delay(lc.latencyS), radio = new Delay(SPECS.radio.model.latencyS), down = new Delay(SPECS.radio.model.latencyS), vaDel = new Delay(SPECS.gnss.model.latencyS);
  let TmeasF = 0, vCmd = 0, iCmd = 0, intV = 0;
  let cmd = { aB: F.aB0 * D2R, phi: 0, brake: F.brake0 };
  let air = null; // last air-data packet received at the pack {va, alpha}
  const est = { valid: false, W: [0, 0, 0], va: 0, q: 0, c: [-1, 0, 1], rel: [0, 0, 0], relPrev: null, vrel: [0, 0, 0], LM: 0, vA: [0, 0, 0], aA: [0, 0, 0], alpha: 0, elevW: 90, uE: null };
  let holdT = -1, escapeT = 0, okLaunchT = 0, lastW = null, nextStop = 0, nextStart = 0, nextFall = 0, retT = null;
  const ev = o.events || { start: [], stop: [], fall: [] };
  let riding = false, falling = false;
  // ---- metrics
  const met = { minHead: 9, minHeadLine: 9, keMax: 0, bodyF: 0, crashes: 0, slackS: 0, flyS: 0, ridingS: 0, availS: 0, launches: 0, refusedS: 0, docks: [], retrieveS: [], stallS: 0, powerZoneS: 0,
    clothes3: [], lowLine3S: 0, Tmax: 0, satS: 0, ePos: [], eVa: [], eW: [], eLM: [], eAlpha: [], LMlow: { tp: 0, fp: 0, fn: 0, tn: 0 }, energyJ: 0, regenJ: 0, peakW: 0, vReel: [0, 0], elev: [], dockFail: 0, abort: [], height: [] };
  const fBuf = new Float64Array(25); let fSum = 0, fI = 0;
  const dtS = C.dtSim, nF = Math.round(C.dtFlyer / dtS);
  let wF = [0, 0, 0], wMid = [0, 0, 0], Wmean2 = null, dbg = [0, 0, 0];
  let A = anc(0), Ap = A, vA = [0, 0, 0];
  const log = o.log ? [] : null;
  const n = Math.floor(tEnd / dtS);
  for (let step = 0; step < n; step++) {
    const t = step * dtS;
    Ap = A; A = anc(t); vA = step ? mul(sub(A.packTop, Ap.packTop), 1 / dtS) : [0, 0, 0];
    const P0 = A.packTop, dockPt = add(P0, mul(A.up, 0.12));
    while (nextStart < ev.start.length && ev.start[nextStart] <= t) { riding = true; falling = false; nextStart++; }
    while (nextStop < ev.stop.length && ev.stop[nextStop] <= t) { riding = false; nextStop++; }
    if (o.preDock != null && sk.rides) for (const rd of sk.rides) if (t >= rd.t1 - o.preDock && t < rd.t1 - o.preDock + dtS * 1.5 && (mode === 'FLY' || mode === 'LAUNCH')) { mode = 'RETRIEVE'; modeT = 0; retT = t; met.preDocks = (met.preDocks || 0) + 1; holdT = rd.t1 + 3; }
    while (nextFall < ev.fall.length && ev.fall[nextFall] <= t) { falling = true; riding = false; nextFall++; }
    // ================================================ truth physics
    if (mode === 'STOWED' || mode === 'DOCKED') { p = dockPt; v = vA; Lp = 0.12; om = 0; Tc = 0; Tanc = [0, 0, 0]; }
    else {
      wF = wind(t, p); if (step % 2 === 0) wMid = wind(t, mul(add(p, P0), 0.5));
      const va = sub(v, wF), Va = len(va) || 1e-6, u = mul(va, 1 / Va);
      const ch = sub(p, P0), dist = len(ch), cu = unit(ch), Lr = Math.max(0.1, Lp);
      const k = 1 / (Lr / LINE.EA + 1 / LINE.kSeries), cD = 2 * LINE.zeta * Math.sqrt(k * m);
      Tc = dist > Lr ? Math.max(0, k * (dist - Lr) + cD * dot(sub(v, vA), cu)) : 0;
      const vMid = sub(mul(add(v, vA), 0.5), wMid), vn = sub(vMid, mul(cu, dot(vMid, cu)));
      const Gl = [0, 0, -LINE.lambda * Lr * G], Dl = mul(vn, -0.5 * rho * LINE.Cd * LINE.d * Lr * len(vn));
      const half = mul(add(Gl, Dl), 0.5);
      Tanc = add(mul(cu, Tc), half);
      // aero: lift ⟂ u in the plane of (line, u) rotated by bank; AoA referenced to the line
      const w = clamp(Tc / (m * G), 0, 1), ref = unit(add(mul(cu, w), [0, 0, 1 - w]));
      let L0 = sub(ref, mul(u, dot(ref, u))); L0 = len(L0) > 1e-3 ? unit(L0) : unit(sub([0, 0, 1], mul(u, u[2])), [0, 0, 1]);
      const sAx = crs(u, L0), phi = phiA + phiDist;
      const Lh = add(mul(L0, Math.cos(phi)), mul(sAx, Math.sin(phi)));
      alphaT = w * (aB - asin(dot(u, cu))) + (1 - w) * F.aFree * D2R; // slack: free-flight trim
      const [CL, CDa] = aeroCoef(F, alphaT); dbg = [alphaT / D2R, CL, CDa];
      const q = 0.5 * rho * Va * Va;
      const Fa = add(mul(Lh, q * S * CL), mul(u, -q * S * (CDa + brake * F.CDbrake)));
      const Fl = add(mul(cu, -Tc), half);
      const acc = mul(add(add(Fa, Fl), [0, 0, -m * G]), 1 / (m + 0.5 * LINE.lambda * Lr));
      v = add(v, mul(acc, dtS)); p = add(p, mul(v, dtS));
      const zs = -p[0] * sk.tanS;
      if (p[2] < zs + 0.05) {
        if (mode !== 'LANDED' && mode !== 'ABORT' && t - (met._lastSnow ?? -9) > 0.5) { met.crashes++; met.crashLog = met.crashLog || []; if (met.crashLog.length < 20) met.crashLog.push({ t: +t.toFixed(2), mode, L: +Lp.toFixed(1), vImpact: +len(sub(v, vA)).toFixed(1) }); }
        met._lastSnow = t;
        // snow contact: no penetration, Coulomb sliding friction μ = 0.3 (ASSUMED, plastic on snow)
        p[2] = zs + 0.05; const vzs = -v[0] * sk.tanS; if (v[2] < vzs) v[2] = vzs;
        const vt = Math.hypot(v[0], v[1]), dv = 0.3 * G * dtS; if (vt > dv) { v[0] *= 1 - dv / vt; v[1] *= 1 - dv / vt; } else { v[0] = 0; v[1] = 0; }
        met.snowS = (met.snowS || 0) + dtS;
        if (mode === 'ABORT') mode = 'LANDED';
      }
      // turbulence-driven roll disturbance (OU, ASSUMED 6° rms at Iu 0.15, 0.8 s)
      { const sig = (o.noRollDist ? 0 : 1) * 6 * D2R * ((c.intensity ?? 0.15) / 0.15) * (c.U > 0 ? 1 : 0.6); phiDist += (-phiDist / 0.8) * dtS + sig * Math.sqrt((2 * dtS) / 0.8) * gn(); }
      // actuators (servo first order + rate limit); commands arrive over the radio link
      const cm = radio.get(t) || cmd, sv = SPECS.servo.model;
      aB += clamp((cm.aB - aB) * Math.min(1, dtS / sv.tauS), -sv.rateDegS * D2R * dtS / 4, sv.rateDegS * D2R * dtS / 4); // pitch via bridle/elevator: ¼ servo rate
      phiA += clamp((cm.phi - phiA) * Math.min(1, dtS / sv.tauS), -sv.rateDegS * D2R * dtS, sv.rateDegS * D2R * dtS);
      brake += (cm.brake - brake) * Math.min(1, dtS / 0.1);
      // reel drum + motor (FOC current loop ≈1 ms → instantaneous at 2 ms; voltage & current limits)
      const omM = om * gear;
      const iLo = Math.max(-M.Imax, (-M.Vbus + Kt * omM) / M.R), iHi = Math.min(M.Imax, (M.Vbus + Kt * omM) / M.R);
      iM = clamp(iCmd, iLo, iHi);
      if (iM !== iCmd) met.satS += dtS;
      const Tline = len(Tanc);
      om += ((r * Tline - Kt * gear * iM - REEL.b * om - REEL.coul * Math.sign(om)) / J) * dtS;
      if (Lp <= 0.13 && om < 0) om = 0;
      if (o.fixedL) om = 0;
      Lp = clamp(Lp + r * om * dtS, 0.12, LINE.Lmax);
      const Pel = M.R * iM * iM - Kt * omM * iM; // electrical power (positive = drawn)
      if (Pel > 0) met.energyJ += (Pel / 0.9) * dtS; else met.regenJ += -Pel * 0.8 * dtS;
      met.peakW = Math.max(met.peakW, Pel / 0.9);
      met.vReel[0] = Math.min(met.vReel[0], r * om); met.vReel[1] = Math.max(met.vReel[1], r * om);
      fSum += Tline - fBuf[fI]; fBuf[fI] = Tline; fI = (fI + 1) % fBuf.length; met.bodyF = Math.max(met.bodyF, fSum / fBuf.length);
      met.Tmax = Math.max(met.Tmax, Tc);
      if (step % 10 === 0) {
        const H = A.head, dH = len(sub(p, H));
        const tt = clamp(dot(sub(H, P0), cu) / Math.max(1e-6, dist), 0, 1), dL = len(sub(H, add(P0, mul(ch, tt))));
        if (mode === 'FLY' || mode === 'LAUNCH' || mode === 'RETRIEVE' || (mode === 'DOCK' && Lp > 0.6) || mode === 'ABORT') { met.minHead = Math.min(met.minHead, dH); met.minHeadLine = Math.min(met.minHeadLine, dL); }
        const vr = len(sub(v, vA)), ke = 0.5 * m * (dH > 1.5 ? dot(v, v) : vr * vr);
        if (ke > met.keMax) { met.keMax = ke; met.keAt = { t: +t.toFixed(2), mode, L: +Lp.toFixed(1) }; }
        (met.keS = met.keS || []).push(ke);
        const hd = Math.hypot(ch[0], ch[1]);
        if (riding && mode === 'FLY') {
          let h3 = 9;
          if (hd > 3 && Tc > 0.05) {
            const s3 = 3 / hd, wn = len(add(Gl, Dl)) / Lr, sag = (wn * Lr * Lr * s3 * (1 - s3)) / (2 * Math.max(0.2, Tc));
            h3 = P0[2] + ch[2] * s3 - sag + (P0[0] + ch[0] * s3) * sk.tanS;
          }
          met.clothes3.push(h3); if (h3 < 1.9) met.lowLine3S += 10 * dtS;
          met.elev.push(Math.atan2(ch[2], hd) / D2R);
          met.height.push(p[2] - zs);
        }
        if (Tc < 0.05 && mode === 'FLY') met.slackS += 10 * dtS;
        if (mode === 'FLY' && alphaT > F.CLmax / F.CLa) met.stallS += 10 * dtS;
        if (mode === 'FLY' && alphaT > 35 * D2R) met.powerZoneS += 10 * dtS;
      }
    }
    // ================================================ sensors + estimator + controllers (pack, 500 Hz)
    Tdel.push(t, len(Tanc) * tScale + tBias + on('tnoise') * lc.sigmaN * gnn());
    const Tm = Tdel.get(t) ?? 0;
    TmeasF += (Tm - TmeasF) * Math.min(1, dtS / 0.02);
    vaDel.push(t, add(vA, mul([gnn() * 0.08, gnn() * 0.08, gnn() * 0.12], on('gnss'))));
    { const vAh = vaDel.get(t) || [0, 0, 0], vPrev = est.vA;
      est.vA = add(est.vA, mul(sub(vAh, est.vA), Math.min(1, dtS / 0.1)));
      est.aA = add(est.aA, mul(sub(mul(sub(est.vA, vPrev), 1 / dtS), est.aA), Math.min(1, dtS / 0.3))); }
    const Lm = Lp * lScale;
    if (mode !== 'STOWED' && mode !== 'DOCKED') {
      // ---- tether-only estimator
      const Tvec = len(Tanc) > 1e-6 ? Tanc : mul(unit(sub(p, P0)), 1e-6);
      const eExit = perturb(unit(Tvec), errYaw + on('anoise') * gnn() * 0.3 * D2R, errTx + on('anoise') * gnn() * la.sigmaDeg * D2R, errTy + on('anoise') * gnn() * la.sigmaDeg * D2R);
      const Tm2 = Math.max(0, TmeasF);
      const Th = mul(eExit, Tm2), Lr = Math.max(0.1, Lm);
      const cu0 = unit(est.c), vMidE = sub(add(est.vA, mul(est.vrel, 0.5)), est.W); let vnE = sub(vMidE, mul(cu0, dot(vMidE, cu0))); if (len(vnE) > 20) vnE = mul(unit(vnE), 20);
      const GlE = [0, 0, -LINE.lambda * Lr * G], DlE = mul(vnE, -0.5 * rhoHat * LINE.Cd * LINE.d * Lr * len(vnE));
      if (Tm2 > 0.4) est.c = unit(sub(Th, mul(add(GlE, DlE), 0.5)), cu0);
      const rel = mul(est.c, Lr);
      // flyer velocity relative to the pack: 2nd-order low-pass (≈3 Hz) on the line-kinematics derivative
      if (est.relPrev) { const vr = mul(sub(rel, est.relPrev), 1 / dtS); est.vrel1 = add(est.vrel1 || vr, mul(sub(vr, est.vrel1 || vr), Math.min(1, dtS / 0.05))); est.vrel = add(est.vrel, mul(sub(est.vrel1, est.vrel), Math.min(1, dtS / 0.05))); }
      est.relPrev = rel; est.rel = rel;
      const vF = add(est.vA, est.vrel);
      const Fline = add(mul(Th, -1), add(GlE, DlE));
      let Rh = sub([0, 0, m * G], Fline); // quasi-static aero force
      if (o.flyerImu) {
        const aTrue = mul(sub(v, est._vPrev || v), 1 / dtS); est._vPrev = v;
        const fMeas = perturb(add(aTrue, [0, 0, G]), attErr[0], attErr[1], attErr[2]);
        Rh = sub(mul(add(fMeas, [gn() * 0.3, gn() * 0.3, gn() * 0.3]), m), Fline);
      }
      // invert the aero model: find the air-relative velocity va (3 unknowns) whose predicted aero force matches
      // the measured one (3 equations); actuator states come from a model of the commanded servo response
      est.aBm = est.aBm ?? cmd.aB; est.aBm += clamp((cmd.aB - est.aBm) * Math.min(1, dtS / SPECS.servo.model.tauS), -SPECS.servo.model.rateDegS * D2R * dtS / 4, SPECS.servo.model.rateDegS * D2R * dtS / 4);
      est.phim = (est.phim ?? 0) + (cmd.phi - (est.phim ?? 0)) * Math.min(1, dtS / SPECS.servo.model.tauS);
      est.brm = (est.brm ?? brake) + (cmd.brake - (est.brm ?? brake)) * Math.min(1, dtS / 0.1);
      const cE = est.c, aBk = est.aBm + aBerr, cphi = Math.cos(est.phim), sphi = Math.sin(est.phim), CDb = est.brm * F.CDbrake;
      const model = (x) => {
        const V = len(x) || 1e-3, u = mul(x, 1 / V), al = aBk - asin(dot(u, cE));
        const [cl, cd] = aeroCoef(F, al), L0 = unit(sub(cE, mul(u, dot(cE, u)))), sA = crs(u, L0);
        const qq = 0.5 * rhoHat * V * V, ld = add(mul(L0, cphi), mul(sA, sphi));
        return add(mul(ld, qq * S * cl * polErr), mul(u, -qq * S * (cd + CDb)));
      };
      // EKF on the wind vector W (3 states, random walk): z = measured aero force, h(W) = model(vF − W).
      // Instantaneously the apparent-wind direction about the line axis is (nearly) unobservable because the aero
      // force is almost parallel to the line; the skier's turns rotate the geometry and make W observable over time.
      if (!est.P) { est.P = [[4, 0, 0], [0, 4, 0], [0, 0, 1]]; }
      if (Tm2 > 0.8 && Lr > 2.0 && step % 5 === 0) {
        const dtE = 5 * dtS, qW = C.ekfQ * dtE;
        for (let k = 0; k < 3; k++) est.P[k][k] += k === 2 ? qW * 0.3 : qW;
        const x = sub(vF, est.W), f0 = model(x), h = 0.05;
        const Jc = [0, 1, 2].map((k) => { const xe = [...x]; xe[k] += h; return mul(sub(model(xe), f0), 1 / h); }); // columns ∂F/∂va_k
        const H = [0, 1, 2].map((i) => [0, 1, 2].map((k) => -Jc[k][i]));                                           // ∂h/∂W = −J
        const sig = C.ekfR0 + C.ekfR1 * len(Rh), Rn = sig * sig;
        const PHt = mat3mul(est.P, mat3T(H)), Sm = mat3add(mat3mul(H, PHt), [[Rn, 0, 0], [0, Rn, 0], [0, 0, Rn]]);
        const Si = mat3inv(Sm);
        if (Si) {
          const K = mat3mul(PHt, Si), innov = sub(Rh, f0), d2 = dot(innov, mat3vec(Si, innov));
          const dW = mat3vec(K, innov), dl = len(dW), Wn = add(est.W, dl > 1 ? mul(dW, 1 / dl) : dW);
          // gate: Mahalanobis distance and the attached-flow prior (the pitch loop keeps the wing below stall)
          const un = unit(sub(vF, Wn)), aN = aBk - asin(dot(un, cE));
          if (d2 < C.ekfGate && aN < F.CLmax / F.CLa + 5 * D2R && aN > -12 * D2R) {
            est.W = Wn; est.P = mat3sub(est.P, mat3mul(mat3mul(K, H), est.P)); est.valid = true;
          } else est.rej = (est.rej || 0) + 1;
        }
        // pseudo-measurement: mean vertical wind ≈ 0 (σ 0.7 m/s)
        { const pz = est.P[2][2], kz = pz / (pz + 0.49); est.W[2] -= kz * est.W[2]; for (let j = 0; j < 3; j++) { est.P[2][j] *= 1 - kz; if (j !== 2) est.P[j][2] *= 1 - kz; } }
      }
      est.vaV = sub(vF, est.W);
      const Vh = len(est.vaV) || 1e-3, uE = mul(est.vaV, 1 / Vh);
      est.va = Vh; est.q = 0.5 * rhoHat * Vh * Vh;
      est.alpha = aBk - asin(dot(uE, cE));
      est.LM = (est.q * S * F.CLmax) / (m * G);
      est.uE = uE;
      // flyer air data downlink (pitot + AoA vane + attitude → air-relative velocity direction), 50 Hz, radio latency
      if (airdata && step % Math.round(1 / AIRDATA.rateHz / dtS) === 0) {
        const uT = unit(sub(v, wF)), uM = perturb(uT, attErr[0] + gn() * D2R, attErr[1] + gn() * D2R, attErr[2] + gn() * D2R);
        down.push(t, { va: len(sub(v, wF)) + AIRDATA.pitotSigma * gn(), alpha: alphaT + AIRDATA.aoaSigmaDeg * D2R * gn(), u: uM });
      }
      if (airdata) {
        air = down.get(t) || air;
        if (air && Tm2 > 0.3) { const Wi = sub(vF, mul(air.u, air.va)); est.Wair = est.Wair ? add(est.Wair, mul(sub(Wi, est.Wair), Math.min(1, dtS / 1.5))) : Wi; }
      }
    }
    // ---- what the controllers see: tether-only estimate, + flyer air data, or (labelled sensitivity) the truth
    let E = est;
    const windowOf = (X) => {
      X.vAm = est.vAm = est.vAm ? add(est.vAm, mul(sub(X.vA, est.vAm), Math.min(1, dtS / C.tauCourse))) : X.vA; // mean course: the flyer cannot follow turn-by-turn
      const d3 = unit(sub(X.W, X.vAm), [-1, 0, 0]), zw = unit(sub([0, 0, 1], mul(d3, d3[2]))), cu2 = unit(X.rel);
      X.d3 = d3; X.zw = zw; X.elevW = Math.max(0, Math.atan2(dot(cu2, zw), Math.max(1e-6, dot(cu2, d3))) / D2R);
      return X;
    };
    if (mode !== 'STOWED' && mode !== 'DOCKED') {
      if (oracle) { const rel = sub(p, P0), va = len(sub(v, wF)); E = { ...est, valid: true, W: wF, vA, va, q: 0.5 * rho * va * va, alpha: alphaT, uE: unit(sub(v, wF)), rel, vrel: sub(v, vA), c: unit(rel) }; }
      else if (airdata && air && est.Wair) E = { ...est, W: est.Wair, va: air.va, q: 0.5 * rhoHat * air.va ** 2, alpha: air.alpha, uE: air.u, valid: true };
      else E = { ...est };
      windowOf(E);
    }
    // ---- mode machine
    modeT += dtS;
    const prev = mode;
    const Wg = E.valid ? E.W : (lastW || wEstPrior(t));
    const vaPack = Math.hypot(Wg[0] - E.vA[0], Wg[1] - E.vA[1]);
    if (mode === 'STOWED') {
      if (riding && !falling && t > holdT) {
        okLaunchT = len(E.aA) < C.launchAccMax ? okLaunchT + dtS : 0;
        if (vaPack >= C.launchVaFactor * Vstall && okLaunchT >= C.launchCalmS) {
          mode = 'LAUNCH'; p = add(dockPt, mul(A.up, 0.15)); v = vA; Lp = 0.3; om = 0;
          if (o.launchL) { const d3 = unit(sub(wEstPrior(t), vA)), zw = unit(sub([0, 0, 1], mul(d3, d3[2]))); p = add(P0, mul(unit(add(mul(zw, Math.sin(C.elevStar * D2R)), mul(d3, Math.cos(C.elevStar * D2R)))), o.launchL)); Lp = o.launchL * 0.995; } aB = F.aB0 * D2R; brake = F.brake0; cmd = { aB, phi: 0, brake: F.brake0 };
          est.relPrev = null; est.c = unit(sub(p, P0)); est.valid = false; est.q = 0.5 * rhoHat * vaPack ** 2; est.W = Wg; met.launches++;
        } else met.refusedS += dtS;
      }
    } else if (mode === 'LAUNCH') { if (Lp > C.LminFly) mode = 'FLY'; if (!riding || falling) mode = falling ? 'ABORT' : 'RETRIEVE'; }
    else if (mode === 'FLY') { if (falling) mode = 'ABORT'; else if (!riding) mode = 'RETRIEVE'; }
    else if (mode === 'RETRIEVE') { if (Lp < C.Ldock) mode = 'DOCK'; if (falling) mode = 'ABORT'; }
    else if (mode === 'DOCK') {
      if (len(sub(p, dockPt)) < 0.25 && Lp < 0.35) { const vrel = len(sub(v, vA)); met.docks.push({ t: +t.toFixed(2), vrel: +vrel.toFixed(2), keRel: +(0.5 * m * vrel * vrel).toFixed(2), during: riding ? 'ride' : 'stop', tRet: +(t - (retT ?? t)).toFixed(2) }); met.retrieveS.push(t - (retT ?? t)); mode = 'DOCKED'; lastW = est.valid ? est.W : lastW; }
      else if (modeT > 15) { met.dockFail++; mode = 'DOCKED'; }
    } else if (mode === 'DOCKED') { if (modeT > 1) mode = 'STOWED'; }
    else if (mode === 'LANDED') { if (Lp < C.Ldock) { mode = 'STOWED'; met.abort.push({ t: +t.toFixed(2), how: 'landed+reeled' }); } }
    else if (mode === 'ABORT' && (o.abort || 'reel') === 'reel' && Lp < C.Ldock) mode = 'DOCK';
    if (mode !== prev) { modeT = 0; if (mode === 'RETRIEVE' || mode === 'ABORT') retT = t; if (mode === 'ABORT') met.abort.push({ t: +t.toFixed(2), how: o.abort || 'reel' }); }
    // ---- reel law ("fly it like a kite"): shed load by paying out, regain airspeed by reeling in, otherwise
    //      creep toward the target length; never pay out while the flyer sits low in the window
    const Tf = TmeasF;
    let vc = 0;
    if (mode === 'LAUNCH' || mode === 'FLY') {
      // admittance: pay out in proportion to surplus tension, reel in in proportion to the deficit
      vc = Tf > Tset ? C.Ka * (Tf - Tset) : -C.KaIn * (Tset - Tf);
      if (vc > 0 && Lm >= Ltgt && Tf < C.kHi * Tset) vc = Math.min(vc, Math.max(0, 0.5 * (Ltgt - Lm)));
      if (vc > 0 && E.elevW < C.elevMinPay && Tf < C.Tmax * 0.8 && mode === 'FLY') vc = 0;
      if (vc < 0 && Lm <= C.LminFly && mode === 'FLY') vc = Math.max(vc, 0.5 * (Lm - C.LminFly));
      if (mode === 'LAUNCH') vc = clamp(Tf > Tset ? C.KaL * (Tf - Tset) : vc, -0.5, C.vLaunch);
      vc = clamp(vc, -C.vInMax, C.vOutMax);
    } else if (mode === 'RETRIEVE' || (mode === 'ABORT' && (o.abort || 'reel') === 'reel')) {
      vc = -(Lm > 3 ? C.vRet : 1.5); if (Tf > 15) vc *= 0.5; if (Tf > 22) vc = 1;
    } else if (mode === 'ABORT') vc = Tf > 15 ? 1 : 0; // hold: let the flyer settle on the snow behind
    else if (mode === 'LANDED') vc = -1.0;
    else if (mode === 'DOCK') vc = -C.vDock;
    vCmd = clamp(vc, vCmd - C.accMax * dtS, vCmd + C.accMax * dtS);
    const Ldot = r * om * lScale + 0.002 * gn();
    intV = clamp(intV + (vCmd - Ldot) * dtS, -2, 2);
    const alphaCmd = (40 * (vCmd - Ldot) + 200 * intV) / r;
    iCmd = mode === 'STOWED' || mode === 'DOCKED' ? 0 : (r * Tf - J * alphaCmd) / (Kt * gear);
    // ---- flyer commands (100 Hz over the radio)
    if (step % nF === 0 && mode !== 'STOWED' && mode !== 'DOCKED') {
      let aBc = F.aB0 * D2R, phiC = 0, br = F.brake0;
      if (mode === 'LAUNCH') aBc = (8 + (F.aB0 - 8) * clamp((Lm - 0.3) / 2.7, 0, 1)) * D2R; // open-loop bridle schedule (A1/A2): climb-out pitch → flying pitch
      const qUse = airdata && air ? 0.5 * rhoHat * air.va ** 2 : E.q;
      const aUse = airdata && air ? air.alpha : E.alpha;
      if (arch === 'A3') {
        let CLdes = clamp((C.kFly * Tset + m * G) / Math.max(1, qUse * S), 0.25, C.CLdesMax * F.CLmax);
        if (mode === 'LAUNCH' && modeT < C.launchHold) CLdes = C.CLdesMax * F.CLmax; // climb out at high lift first
        if (mode === 'RETRIEVE' || mode === 'DOCK' || (mode === 'ABORT' && (o.abort || 'reel') === 'reel')) CLdes = clamp((C.Tret + m * G) / Math.max(1, qUse * S), 0.15, C.CLdesMax * F.CLmax); // depower to a retrieval tension
        if (mode === 'ABORT' && o.abort === 'hold') CLdes = 0;
        // AoA target: force-based, plus more lift when low in the window, never closer than 2.5° to stall
        let aTgt = CLdes / F.CLa;
        aTgt = Math.min(aTgt, F.CLmax / F.CLa - 2.5 * D2R);
        // line-referenced pitch only acts on a taut line: freeze the integrator when slack (anti-windup)
        aBc = TmeasF < 0.5 * m * G ? cmd.aB : clamp(cmd.aB + C.aoaK * C.dtFlyer * (aTgt - aUse), F.aBmin * D2R, F.aBmax * D2R);
      }
      // window elevation is held with drag (spoilers / kite depower), AoA with pitch
      br = arch === 'A3' ? clamp(cmd.brake + C.kBrake * C.dtFlyer * (E.elevW - C.elevStar), 0, 1) : F.brake0;
      if (arch === 'A3' && E.elevW < C.elevEscape) br = 0;
      if (arch !== 'A1' && (mode === 'RETRIEVE' || mode === 'DOCK' || mode === 'ABORT' || mode === 'LANDED')) br = 1;
      if (arch !== 'A1' && E.uE && E.d3 && (mode === 'FLY' || mode === 'LAUNCH' || mode === 'RETRIEVE')) {
        const cu = unit(E.rel), Lr = len(E.rel);
        let tgt = unit(add(mul(E.d3, Math.cos(C.elevTgt * D2R)), mul(E.zw, Math.sin(C.elevTgt * D2R))));
        if (E.elevW < C.elevEscape || escapeT > 0) { // power-zone escape: steer to the nearer window edge, then climb along it
          const yw = crs(E.zw, E.d3), sg = Math.sign(dot(cu, yw)) || 1;
          tgt = unit(add(mul(yw, 0.9 * sg), mul(E.zw, 0.45)));
          escapeT = E.elevW < C.elevEscape + 15 ? 0.5 : escapeT - C.dtFlyer;
        }
        const err = sub(tgt, cu), errP = sub(err, mul(cu, dot(err, cu)));
        const vrP = sub(E.vrel, mul(cu, dot(E.vrel, cu)));
        const L0 = unit(sub(cu, mul(E.uE, dot(cu, E.uE)))), sAx = crs(E.uE, L0);
        // bank toward the target: lift along the line makes a tethered wing laterally neutral/unstable, so the
        // bank must exceed the lateral angle (K_phi > 1) plus rate damping
        const eLat = dot(errP, sAx), eRate = -dot(vrP, sAx) / Math.max(1, Lr);
        const Lhat = Math.max(0.5, qUse * S * Math.max(0.2, F.CLa * aUse));
        phiC = clamp(Math.asin(clamp(C.kPhi * eLat + (m * Math.max(1, Lr) * C.kPhiD * eRate) / Lhat, -0.95, 0.95)), -F.phiMax * D2R, F.phiMax * D2R);
      }
      cmd = { aB: aBc, phi: phiC, brake: br };
      radio.push(t, cmd);
    }
    // ---- estimation metrics (FLY, every 20 ms)
    if (mode === 'FLY' && step % 10 === 0) {
      Wmean2 = Wmean2 ? add(Wmean2, mul(sub(wF, Wmean2), 0.02 / 2)) : wF;
      const vaT = len(sub(v, wF));
      met.ePos.push(len(sub(add(P0, est.rel), p)));
      met.eVa.push(est.va - vaT);
      met.eW.push(Math.hypot(est.W[0] - Wmean2[0], est.W[1] - Wmean2[1]));
      if (est.Wair) (met.eWair = met.eWair || []).push(Math.hypot(est.Wair[0] - Wmean2[0], est.Wair[1] - Wmean2[1]));
      met.eAlpha.push((est.alpha - alphaT) / D2R);
      const LMt = (0.5 * rho * vaT * vaT * S * F.CLmax) / (m * G);
      met.eLM.push(est.LM - LMt);
      met.LMlow[LMt < 1.3 ? (est.LM < 1.3 ? 'tp' : 'fn') : (est.LM < 1.3 ? 'fp' : 'tn')]++;
    }
    if (o.extra && step % 10 === 0) o.extra({ t, mode, p, v, P0, A, Lp, Tc, riding, est, sk });
    if (log && step % (o.logEvery ?? 50) === 0) log.push({ t: +t.toFixed(2), mode, L: +Lp.toFixed(2), T: +Tc.toFixed(2), Tm: +TmeasF.toFixed(2), va: p ? +len(sub(v, wF)).toFixed(2) : 0, vaE: +est.va.toFixed(2), ew: +(E.elevW ?? 0).toFixed(0), aoa: +dbg[0].toFixed(1), aoaE: +(est.alpha / D2R).toFixed(1), aB: +(aB / D2R).toFixed(1), CL: +dbg[1].toFixed(2), h: p ? +(p[2] - P0[2]).toFixed(2) : 0, rx: p ? +(p[0] - P0[0]).toFixed(2) : 0, ry: p ? +(p[1] - P0[1]).toFixed(2) : 0, phi: +(phiA / D2R).toFixed(0), vc: +vCmd.toFixed(2), vr: +(r * om).toFixed(2), ride: riding ? 1 : 0, vaN: +est.va.toFixed(2), aN: +(est.alpha / D2R).toFixed(1), WNx: +est.W[0].toFixed(1), WNy: +est.W[1].toFixed(1), WNz: +est.W[2].toFixed(1), eP: p ? +len(sub(add(P0, est.rel), p)).toFixed(2) : 0, Tm2: +TmeasF.toFixed(2) });
    // ---- availability bookkeeping
    if (step % 10 === 0) {
      if (sk.col.riding ? sk.col.riding[Math.min(sk.n - 1, Math.round(t / sk.sampleDt))] > 0 : riding) {
        met.ridingS += 10 * dtS;
        if (mode === 'FLY' && Lp > 5 && p[2] - P0[2] > 2.0) met.availS += 10 * dtS;
      }
      if (mode === 'FLY') met.flyS += 10 * dtS;
    }
  }
  met.endMode = mode;
  return { met, log, Vstall };
}
