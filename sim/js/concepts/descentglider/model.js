// descentglider v2 physics core (SIM-031 round 2, "throw-and-loiter"): a ≈122 g
// folding flying wing with ONE folding pusher prop and a body-fixed EIS camera that
// follows a skier downhill on slope gravity. Redesign after the 2026-10-19 audit
// (DG-01…DG-12): no hover, no perch, no relaunch from the snow.
//   • launch: hand-thrown at the top 2 s BEFORE push-off, so it is already flying
//     (pre-positioned above/behind the start) when the rider accelerates — no catch-up;
//   • stops: it never lands — it loiters (cross-wind beat with into-wind reversals,
//     or wind-hover when the wind exceeds its minimum airspeed), banking height while
//     it waits; the rider's push-off is the catch-up window;
//   • end of run: belly landing on a planned final (heading chosen for the shortest
//     slide: uphill in calm, crabbed across the slope in up-slope wind), ≈3.5 m beside
//     the stopped rider; pick-up = action 2.
//
// 6-DOF-lite point mass: the attitude (nose bx, wing normal bz) follows the
// autopilot command through a first-order lag; aero forces use the TRUE relative
// air (turbulent wind field + skier wake + terrain-following slope flow), so gusts
// change α and lift before the autopilot reacts. Full-range polar (attached
// low-Re polar → flat plate). One pusher prop: momentum-theory power / FoM·η, or
// wind-milling regen (cold-cell acceptance limit). Gust-driven attitude
// disturbance (2nd-order roll/pitch/yaw response with an attitude loop) is computed
// for the camera (one-way: it is not fed back into the forces). Snow contact:
// belly touchdown → Coulomb slide on the slope → rest. All aero/propulsion/snow
// values ASSUMED (see index.js PARAMS); numerical, uncalibrated.
import { makeWind } from '../common/env.js';
import { skierAt } from '../common/skier.js';
import { ATMOS } from '../common/components.js';

export const G = 9.81;
export const RHO = ATMOS.rho; // shared basis (X-01): 1.0 kg/m³ at 2000–2500 m, −10 °C
const D2R = Math.PI / 180;

export const PDEF = {
  mass: 0.122, Sext: 0.065, bext: 0.66, Ssw: 0.065, bsw: 0.66, cd0: 0.050, eExt: 0.75, eSw: 0.75, clmaxExt: 0.8, clmaxSw: 0.8, dragScale: 1, sweepOn: 0,
  cdaSide: 0.0012, nProp: 1, propR: 0.044, tStatic: 1.1, vPitch: 40, fomEta: 0.50, regenEta: 0.30, regenPmax: 2.0, regenCd: 0.6, spoilerDcd: 0.15,
  pAvionics: 4.73, battWh: 2.0, coldFactor: 0.75, reserve: 0.15,
  stationD: 4.5, stationH: 2.6, azAmp: 30, vCapMargin: 0.95, smoothTau: 1.6, followMode: 1, trailK: 0.7,
  tauAtt: 0.10, tauT: 0.04, bankMax: 55, sweepRate: 1.5,
  // stops / launch / landing (v2)
  stopMode: 0, loiterBehind: 8, loiterSide: 4, loiterR: 11, loiterH: 7, loiterHalf: 6, loiterBank: 40, loiterVaK: 1.45, orbitWindMax: 3.5,
  throwSpeed: 10, motorDelay: 0.5,
  tdLat: 3.5, finalLen: 22, finalGamma: 6, flareH: 1.4, muSnow: 0.35, muStatic: 0.5, tdVnMax: 3.0,
  geofence: 50, terrainFlow: 1, readyMax: 7, windMax: 5.5, detectR: 8, linkHold: 1.5,
  // gust → attitude disturbance (camera only) and attitude loop
  wSp: 20, wYaw: 8, tauRoll: 0.06, wAp: 15.7, zAp: 0.7,
  // camera: 4K over an 80° lens on a 3-axis micro-servo cradle, 22° zero tilt, ≥40° subject-locked crop, gyro-stabilisation residual
  camHfov: 80, camTilt: 22, cropHfov: 40, eisRho: 0.1, camRoll: 1, camRollTau: 0.08,
};

// ---------------------------------------------------------------- small vector helpers
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a, fb = [1, 0, 0]) => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fb.slice(); };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, w) => a + (b - a) * w;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const sat3 = (v, lim) => { const l = len(v); return l > lim ? mul(v, lim / l) : v; };
const UP = [0, 0, 1];

// ---------------------------------------------------------------- wing geometry and polar
export function wingGeom(s, p) {
  const S = lerp(p.Sext, p.Ssw, s), b = lerp(p.bext, p.bsw, s);
  const AR = (b * b) / S, e = lerp(p.eExt, p.eSw, s), clmax = lerp(p.clmaxExt, p.clmaxSw, s);
  const cla = (2 * Math.PI * AR) / (2 + Math.sqrt(AR * AR + 4)); // Helmbold
  return { S, b, AR, e, clmax, cla, k: 1 / (Math.PI * e * AR), cd0: p.cd0 * (1 - 0.05 * s), as: clmax / cla };
}

// in-plane coefficients over the full α range (attached polar → flat plate)
export function coeffs(alpha, g, p, dcd = 0) {
  const a = Math.atan2(Math.sin(alpha), Math.cos(alpha));
  const aa = Math.abs(a);
  const sig = 1 / (1 + Math.exp(-(aa - g.as) / 0.025));
  const clAtt = g.cla * clamp(a, -0.5, 0.5);
  const clFp = 0.85 * Math.sin(2 * a), cdFp = 1.7 * Math.sin(a) ** 2 + g.cd0;
  const CL = (1 - sig) * clAtt + sig * clFp;
  const CD = ((1 - sig) * (g.cd0 + g.k * clAtt * clAtt + dcd) + sig * cdFp) * p.dragScale;
  return { CL, CD, stalled: sig > 0.5 };
}

export function stallSpeed(s, p) { const g = wingGeom(s, p); return Math.sqrt((2 * p.mass * G) / (RHO * g.S * g.clmax)); }
export function vKE(m, J = 14.9) { return Math.sqrt((2 * J) / m); }

// steady straight glide at airspeed V in config s: { LD, sink, gammaDeg, CL }
export function glide(V, s, p) {
  const g = wingGeom(s, p), q = 0.5 * RHO * V * V, CL = (p.mass * G) / (q * g.S);
  if (CL > g.clmax) return null;
  const CD = (g.cd0 + g.k * CL * CL) * p.dragScale;
  return { LD: CL / CD, sink: V * (CD / CL), gammaDeg: Math.atan(CD / CL) / D2R, CL };
}
// level coordinated turn at airspeed V and bank φ: drag power (W) and turn radius (m)
export function turnPower(V, bankDeg, p) {
  const g = wingGeom(0, p), q = 0.5 * RHO * V * V, nz = 1 / Math.cos(bankDeg * D2R), CL = (p.mass * G * nz) / (q * g.S);
  const D = q * g.S * (g.cd0 + g.k * CL * CL) * p.dragScale;
  return { Pdrag: D * V, CL, radius: (V * V) / (G * Math.tan(Math.max(1e-3, bankDeg) * D2R)) };
}

// ---------------------------------------------------------------- skier wake (bluff-body far wake, ASSUMED)
// deficit/U = min(0.6, 0.3·(CdA/x²)^(1/3)), σ = 0.45·(CdA·x)^(1/3) + 0.15; air in the wake moves WITH the skier
function wakeAt(pp, s, t) {
  const sp = s.speed;
  if (sp < 1) return [0, 0, 0];
  const h = s.heading, c = [s.pos[0], s.pos[1], s.pos[2] + 1.0];
  const r = sub(pp, c);
  const xb = -(r[0] * h[0] + r[1] * h[1]);
  if (xb < 0.2) return [0, 0, 0];
  const lat = Math.hypot(r[0] + h[0] * xb, r[1] + h[1] * xb), vz = r[2];
  const def = Math.min(0.6, 0.3 * Math.cbrt(0.5 / (xb * xb)));
  const sg = 0.45 * Math.cbrt(0.5 * xb) + 0.15;
  const e = Math.exp(-(lat * lat + vz * vz) / (2 * sg * sg));
  if (e < 1e-4) return [0, 0, 0];
  const f = sp / (2 * sg);
  const turb = 0.3 * (Math.sin(2.1 * f * t) + 0.7 * Math.sin(3.7 * f * t + 1.3) + 0.5 * Math.sin(6.1 * f * t + 2.1)) / 1.33;
  const u = sp * def * e;
  return [h[0] * u * (1 + turb), h[1] * u * (1 + turb), u * 0.4 * turb];
}

export const MODE = { STOWED: 0, THROWN: 1, LOITER: 2, FOLLOW: 3, PATTERN: 4, FINAL: 5, FLARE: 6, SLIDE: 7, LANDED: 8, FAILSAFE: 9, CRASH: 10 };
export const MODE_NAME = ['stowed', 'thrown', 'loiter', 'follow', 'pattern', 'final', 'flare', 'slide', 'landed', 'fail-safe', 'crash'];
const GROUNDED = new Set([MODE.STOWED, MODE.SLIDE, MODE.LANDED, MODE.CRASH]);
export const isFlying = (md) => !GROUNDED.has(md);
export const isMoving = (md) => isFlying(md) || md === MODE.SLIDE;

// ---------------------------------------------------------------- core
// input: { duration, skier (skierAt-compatible), wind (makeWind cfg), plan, dt }
// plan: { start: 'follow'|'stowed', throwAt (s), endAfter (stops after this time = lift geofence → land),
//         azPlan(t) → deg, linkLossAt, trees: [{x,y,r,h}], neighbour: {p0,v,t0,t1}, moguls: {amp, lambda}, stopMode }
export function runCore(p, input) {
  const { duration, skier: sk } = input;
  const plan = input.plan || {};
  const tanS = sk.tanS, cosS = 1 / Math.sqrt(1 + tanS * tanS), sinS = tanS * cosS;
  const dt = input.dt || 0.0025;
  const every = Math.max(1, Math.round(0.02 / dt));
  const n = Math.floor(duration / 0.02 + 1e-9) + 1;
  const windRaw = makeWind(input.wind || {});
  // terrain-following mean flow over the planar slope (ASSUMED): air tangent to the snow, w_z = −tanθ·w_x
  // (up-slope wind rises = slope lift; down-slope wind sinks)
  const windF = (t, q) => { const w = windRaw(t, q); if (p.terrainFlow) w[2] += -tanS * w[0]; return w; };
  const wMean = (input.wind && input.wind.mean) || [0, 0, 0];
  const m = p.mass, W = m * G;
  const Adisc = p.nProp * Math.PI * p.propR ** 2;
  const vCap = p.vCapMargin * vKE(m);
  const VsExt = stallSpeed(0, p);
  const Vmin = 1.3 * VsExt;
  const VaLoit = p.loiterVaK * VsExt;
  const stopMode = plan.stopMode ?? p.stopMode;
  const mog = plan.moguls;
  const zT = (x, y) => -x * tanS + (mog ? mog.amp * Math.sin((2 * Math.PI * x) / mog.lambda) * Math.cos((2 * Math.PI * y) / (1.6 * mog.lambda)) : 0);
  const Euse = p.battWh * 3600 * p.coldFactor * (1 - p.reserve);

  const O = {};
  for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'bxx', 'bxy', 'bxz', 'bzx', 'bzy', 'bzz', 'sweep', 'T', 'Dreg', 'Preg', 'Pmot', 'Pel', 'spo', 'mode', 'E', 'va', 'alpha', 'agl', 'az', 'headD', 'obsD', 'nbD', 'wx', 'wy', 'wz', 'wake', 'lag', 'link', 'px', 'py', 'pz', 'dph', 'dth', 'dps', 'range', 'lsub', 'bank']) O[k] = new Float64Array(n);
  const events = [];
  const ev = (t, type, severity, zh, en) => events.push({ t, type, severity, zh, en });

  // ---- reference-path state
  const s0 = skierAt(sk, 0);
  let sv = s0.vel.slice(), sp = sub(s0.pos, mul(sv, 2 * p.smoothTau)), sa = [0, 0, 0];
  let decelM = 0, speedPrev = s0.speed;
  let zInt = 0, stPrev = null, stVel = s0.vel.slice(), stAcc = [0, 0, 0];
  let course = nrm([s0.heading[0], s0.heading[1], 0]);
  const azPlan = plan.azPlan || ((t) => { const A = p.azAmp, ph = t % 24; return ph < 6 ? A : ph < 10 ? A * (1 - 2 * smooth((ph - 6) / 4)) : ph < 18 ? -A : -A * (1 - 2 * smooth((ph - 18) / 4)); });
  const hist = { t: [], x: [], y: [] };
  for (let j = 150; j >= 1; j--) { hist.t.push(-j * 0.02 - 0.1); hist.x.push(s0.pos[0] - s0.vel[0] * (j * 0.02 + 0.1)); hist.y.push(s0.pos[1] - s0.vel[1] * (j * 0.02 + 0.1)); }
  let halfTurn = 2.5, latSign = 0, lastFlip = null;
  const trees = plan.trees || [];
  let pos, vel, bx, bz, T = 0, Dreg = 0, spo = 0, sweep = 0, sweepCmd = 0;
  let wEst = [wMean[0], wMean[1], -tanS * wMean[0] * (p.terrainFlow ? 1 : 0)], wVar = (0.25 * Math.hypot(wMean[0], wMean[1])) ** 2;
  const trailStation = (t, refP, refC, spd) => {
    const a = azPlan(t) * D2R, l = [-refC[1], refC[0], 0];
    const Dal = p.stationD * Math.cos(a), dly = Dal / Math.max(spd, 3);
    const tq = hist.t[hist.t.length - 1] - dly;
    let j = hist.t.length - 1; while (j > 0 && hist.t[j] > tq) j--;
    const tr = [hist.x[j], hist.y[j]];
    const cen = [refP[0] - refC[0] * Dal, refP[1] - refC[1] * Dal];
    const phi = (Math.PI * dly) / Math.max(0.4, halfTurn);
    const tw = wEst[0] * refC[0] + wEst[1] * refC[1], kTw = clamp(1 - (tw - 2.5) / 3, 0, 1);
    let tK = Math.min(p.trailK, Math.max(0, Math.cos(phi))) * kTw;
    for (const tr_ of trees) { const dTr = Math.hypot(pos[0] - tr_.x, pos[1] - tr_.y) - tr_.r; tK *= clamp((dTr - 3) / 6, 0, 1); }
    const bx_ = cen[0] + tK * (tr[0] - cen[0]) + l[0] * p.stationD * Math.sin(a), by_ = cen[1] + tK * (tr[1] - cen[1]) + l[1] * p.stationD * Math.sin(a);
    return [bx_, by_, zT(bx_, by_) + p.stationH];
  };
  const stationOf = (t, refP, refC, spd) => {
    const a = azPlan(t) * D2R, l = [-refC[1], refC[0], 0];
    const D = p.stationD * (spd < 3 ? 0.85 : 1);
    const x = refP[0] + (-Math.cos(a) * refC[0] + Math.sin(a) * l[0]) * D, y = refP[1] + (-Math.cos(a) * refC[1] + Math.sin(a) * l[1]) * D;
    return [x, y, zT(x, y) + p.stationH];
  };

  let mode;
  let Faero = [0, 0, 0];
  let E = 0;
  let stopped = false, stopT = 0, moveT = 0, stopPt = null, endOfRun = false, stopCourse = course.slice();
  let linkLost = false, lastMeas = null;
  let weaveT = 0;
  let flightT = 0, regenJ = 0, motorJ = 0, launchT = null, keCapT = 0, tThrow = null, loiterJ = 0, loiterT = 0;
  let prevMode = -1, wHold = null, wTipL = null, wTipR = null;
  let avoidEvt = false, evPrev = null, evRate = [0, 0, 0];
  let geoT = 0, rangeMax = 0, failsafe = false;
  // loiter state
  let lo = null; // { C, c, wh, s, phi }
  // landing state
  let ld = null; // { A, hF, Pt, lat, TD, chosen }
  let slide = { v: null, dist: 0, tdV: NaN, tdVn: NaN, tdT: null, restT: null, restPos: null, minRider: Infinity, tdKE: NaN };
  let throwInfo = { minAGL: Infinity, propHeadMin: Infinity, motorOnT: null };
  // attitude disturbance states (rad, rad/s)
  let dph = 0, dphd = 0, dth = 0, dthd = 0, dps = 0, dpsd = 0, pG = 0, aG = 0, bG = 0;
  let headMinFly = Infinity, tReady = null, launchedOnce = false, interlock = false;
  const agl0r = () => pos[2] - zT(pos[0], pos[1]);

  const start = plan.start || 'follow';
  if (start === 'follow') {
    pos = stationOf(0, s0.pos, course, s0.speed);
    vel = s0.vel.slice(); { const v0 = len(vel); if (v0 > vCap) vel = mul(vel, vCap / v0); } mode = MODE.FOLLOW; launchT = 0;
    bx = nrm(vel); bz = nrm(sub(UP, mul(bx, bx[2])));
    ev(0, 'follow', 'info', '已在跟随（起点：稳态跟拍）', 'Already following (scenario starts in steady follow)');
  } else {
    pos = [s0.pos[0] - 0.3, s0.pos[1] - 0.25, s0.pos[2] + 1.1]; vel = [0, 0, 0]; mode = MODE.STOWED;
    bx = [0, 0, -1]; bz = [1, 0, 0];
    stopped = s0.speed < 1; stopPt = s0.pos.slice();
  }

  const cmd = { bx: bx.slice(), bz: bz.slice(), T: 0, Dreg: 0, spo: 0 };
  let energySlack = 0, climbPow = 0;
  function wingAlloc(aDes, va, Va, { allowRegen = true, slow = false, noThrust = false } = {}) {
    const ev_ = mul(va, 1 / Math.max(Va, 0.1));
    const q = 0.5 * RHO * Va * Va;
    const Freq = [m * aDes[0], m * aDes[1], m * (aDes[2] + G)];
    const Fpar = dot(Freq, ev_);
    const Fperp = sub(Freq, mul(ev_, Fpar));
    let upp = sub(UP, mul(ev_, ev_[2])); upp = nrm(upp, [0, 0, 1]);
    const side = cross(ev_, upp);
    const Lu = dot(Fperp, upp), Ls = dot(Fperp, side);
    const phi = clamp(Math.atan2(Ls, Math.max(Lu, 0.25 * W)), -p.bankMax * D2R, p.bankMax * D2R);
    const nL = add(mul(upp, Math.cos(phi)), mul(side, Math.sin(phi)));
    const Lreq = dot(Fperp, nL);
    if (p.sweepOn) {
      const DregMax0 = allowRegen ? Math.min(p.regenCd * q * Adisc, p.regenPmax / (p.regenEta * Math.max(Va, 1))) : 0;
      const cost = (s) => { const g = wingGeom(s, p), CL = Lreq / (q * g.S); if (CL > 0.8 * g.clmax) return Infinity; const Tq = Fpar + q * g.S * (g.cd0 + g.k * CL * CL) * p.dragScale; return 10 * Math.max(0, Tq) + Math.max(0, -Tq - DregMax0); };
      let best = null; for (const s of [0, 0.25, 0.5, 0.75, 1]) { const c = cost(s); if (!best || c < best.c) best = { s, c }; }
      if (!Number.isFinite(best.c)) sweepCmd = 0; else if (best.c < cost(sweepCmd) - 0.01) sweepCmd = best.s;
    } else sweepCmd = 0;
    const g = wingGeom(sweep, p);
    const clLim = slow ? 0.97 * g.clmax : 0.85 * g.clmax;
    let CLc = clamp(Lreq / (q * g.S), -0.25, clLim);
    if (CLc * q * g.S < Lreq - 1e-6 && Lu > 0) { // lift-limited: keep height, give up bank first
      const Lav = CLc * q * g.S, ph2 = Math.acos(clamp(Lu / Lav, -1, 1)) * Math.sign(phi);
      const nL2 = add(mul(upp, Math.cos(ph2)), mul(side, Math.sin(ph2)));
      nL[0] = nL2[0]; nL[1] = nL2[1]; nL[2] = nL2[2];
    }
    const al = clamp(CLc / g.cla, -0.2, (slow ? 0.98 : 0.9) * g.as);
    if (evPrev) evRate = add(evRate, mul(sub(mul(sub(ev_, evPrev), 1 / dt), evRate), Math.min(1, dt / 0.05)));
    evPrev = ev_;
    const evL = nrm(add(ev_, mul(evRate, p.tauAtt)));
    const nLL = nrm(sub(nL, mul(evL, dot(nL, evL))));
    cmd.bx = add(mul(evL, Math.cos(al)), mul(nLL, Math.sin(al)));
    cmd.bz = add(mul(evL, -Math.sin(al)), mul(nLL, Math.cos(al)));
    const Dest = q * g.S * (g.cd0 + g.k * CLc * CLc) * p.dragScale;
    let Vfl = slow ? 1.02 * VsExt : 1.3 * Math.sqrt((2 * W) / (RHO * g.S * g.clmax));
    if (!slow && Va < Vfl && sweep > 0.05) { sweepCmd = 0; Vfl = Math.max(1.15 * VsExt, Vfl * 0.85); }
    let Treq = Math.max(Fpar, Va < Vfl ? m * 1.5 * (Vfl - Va) : -Infinity) + Dest;
    if (climbPow > 0) Treq += climbPow / Math.max(Va, 3);
    const Lshort = Lreq - CLc * q * g.S;
    if (Lshort > 0.02 && !slow) Treq += 0.8 * Lshort;
    else if (Treq > 0 && energySlack > 0) Treq = Math.max(0, Treq - 0.12 * energySlack);
    const Tmax = noThrust ? 0 : p.tStatic * Math.max(0, 1 - Va / p.vPitch);
    if (Treq >= 0) { cmd.T = Math.min(Treq, Tmax); cmd.Dreg = 0; cmd.spo = 0; }
    else {
      cmd.T = 0;
      const Dmax = allowRegen ? Math.min(p.regenCd * q * Adisc, p.regenPmax / (p.regenEta * Math.max(Va, 1))) : 0;
      cmd.Dreg = Math.min(-Treq, Dmax);
      cmd.spo = clamp((-Treq - cmd.Dreg) / (q * g.S * p.dragScale), 0, p.spoilerDcd);
    }
  }
  // ground velocity along unit direction d (horizontal) that keeps airspeed Va in wind w (crab); null if impossible
  const groundAlong = (d, Va, w) => {
    const wa = w[0] * d[0] + w[1] * d[1], wc = -w[0] * d[1] + w[1] * d[0];
    if (Math.abs(wc) >= Va) return wa; // cannot hold the line: drift
    return wa + Math.sqrt(Va * Va - wc * wc);
  };

  // ---- guidance helpers
  const rider = (t) => skierAt(sk, t);
  const headOf = (s) => [s.pos[0], s.pos[1], s.pos[2] + 1.62 * (1 - 0.16 * (s.crouch ?? 0.3))];
  const nb = plan.neighbour;
  const nbPos = (t) => { if (!nb) return null; const tt = clamp(t, nb.t0, nb.t1) - nb.t0; const x = nb.p0[0] + nb.v[0] * tt, y = nb.p0[1] + nb.v[1] * tt; return [x, y, zT(x, y)]; };
  function obstacleRepulse(t, P, V) {
    let corr = [0, 0, 0], dmin = Infinity;
    const vh = nrm([V[0], V[1], 0], [1, 0, 0]);
    for (const tr of trees) {
      const dx = P[0] - tr.x, dy = P[1] - tr.y, dh = Math.hypot(dx, dy);
      const top = zT(tr.x, tr.y) + tr.h;
      const rr = tr.r * clamp((top - P[2]) / tr.h, 0.15, 1);
      const d = P[2] > top ? Math.hypot(Math.max(0, dh - rr), P[2] - top) : dh - rr;
      dmin = Math.min(dmin, d);
      const seen = -(dx * vh[0] + dy * vh[1]) > -0.35 * dh;
      if (d < 12 && seen) { const k = 14 * Math.max(0, 1 / Math.max(d, 0.4) - 1 / 9); corr = add(corr, [(dx / dh) * k, (dy / dh) * k, 0.3 * k]); }
    }
    let dn = Infinity;
    const q = nbPos(t);
    if (q) {
      const c = [q[0], q[1], q[2] + 1.0];
      const r = sub(P, c), dh = Math.hypot(r[0], r[1]);
      dn = Math.max(0, Math.hypot(dh, Math.max(0, Math.abs(r[2]) - 0.9)) - 0.4);
      if (dn < p.detectR) { const k = 10 * Math.max(0, 1 / Math.max(dn, 0.4) - 1 / 7); corr = add(corr, [(r[0] / Math.max(dh, 0.3)) * k * 0.6, (r[1] / Math.max(dh, 0.3)) * k * 0.6, 1.0 * k]); }
    }
    return { corr: sat3(corr, 6), dmin, dn };
  }
  // loiter geometry around a stopped rider: centre behind (up-slope of) the rider, beat line ⟂ wind (calm: across the slope)
  function startLoiter(t) {
    const lft = [-stopCourse[1], stopCourse[0]];
    const sd = Math.sign((pos[0] - stopPt[0]) * lft[0] + (pos[1] - stopPt[1]) * lft[1]) || 1;
    const C0 = [stopPt[0] - stopCourse[0] * p.loiterBehind + lft[0] * sd * p.loiterSide, stopPt[1] - stopCourse[1] * p.loiterBehind + lft[1] * sd * p.loiterSide];
    const U = Math.hypot(wEst[0], wEst[1]);
    const wh = U > 1.5 ? [wEst[0] / U, wEst[1] / U] : [stopCourse[0], stopCourse[1]];
    const c = [-wh[1], wh[0]];
    const side = (pos[0] - C0[0]) * c[0] + (pos[1] - C0[1]) * c[1];
    // calm/light wind: constant-airspeed orbit (ground speed ≤ Va + U stays under the KE cap); stronger wind: cross-wind
    // beat with reversals turning through up-wind (ground speed ≤ Va); wind ≥ 1.08·Va_loiter: wind-hover
    // wind ≥ orbitWindMax: position-hold up-wind of the rider with constant-airspeed S-turns about the into-wind
    // heading (reversals through up-wind, ground speed ≤ airspeed); 'beat' kept as an option (stopMode 2)
    const kind = stopMode === 2 ? 'beat' : (stopMode === 1 || U >= p.orbitWindMax ? 'hover' : 'orbit');
    const rr = [pos[0] - C0[0], pos[1] - C0[1]];
    const dirO = Math.sign(rr[0] * vel[1] - rr[1] * vel[0]) || 1; // keep the current sense of rotation
    lo = { C: C0, c, wh, s: side >= 0 ? 1 : -1, phi: null, kind, hover: kind === 'hover', dirO };
    const txt = { hover: [`等待：风 ${U.toFixed(1)} m/s，在上风侧迎风定点（等空速 S 形）`, `Waiting: ${U.toFixed(1)} m/s wind, into-wind station-keeping up-wind of the rider (constant-airspeed S-turns)`], orbit: ['等待：在滑雪者上坡侧盘旋（不着陆，高度储能）', 'Waiting: orbit up-slope of the rider (no landing, height banked)'], beat: [`等待：风 ${U.toFixed(1)} m/s，横风往返（迎风掉头，对地速度 ≤ 空速）`, `Waiting: ${U.toFixed(1)} m/s wind, cross-wind beat (reversals into the wind, ground speed ≤ airspeed)`] }[kind];
    ev(t, 'loiter', 'info', txt[0], txt[1]);
  }
  // landing plan: touchdown beside the stopped rider (or at a fail-safe point), final heading with the shortest slide
  function startLanding(t, tdPoint, why) {
    const U = Math.hypot(wEst[0], wEst[1]);
    const lft = [-stopCourse[1], stopCourse[0]];
    const cand = [[-stopCourse[0], -stopCourse[1]], lft, [-lft[0], -lft[1]], [stopCourse[0], stopCourse[1]]];
    if (U > 1) cand.push([-wEst[0] / U, -wEst[1] / U]);
    const VaTd = 1.05 * VsExt;
    let best = null;
    for (const h of cand) {
      const gs = groundAlong(h, VaTd, wEst);
      if (!(gs > 0.5)) continue;
      const rise = -tanS * h[0]; // terrain rise per metre along h (up-slope > 0)
      const wz = p.terrainFlow ? -tanS * wEst[0] : 0;
      const sinkNeed = wz - gs * rise; // vertical air speed the glider must beat to reach the snow
      const gl = glide(Math.max(VaTd, 1.15 * VsExt), 0, p);
      const sinkAv = gl ? gl.sink + 0.5 * RHO * VaTd ** 3 * wingGeom(0, p).S * p.spoilerDcd / W : 3;
      if (sinkNeed > 0.8 * sinkAv) continue;
      const decel = G * (p.muSnow * cosS + sinS * (-h[0])); // up-slope slide decelerates faster
      if (decel <= 0.2) continue;
      const slideL = (gs * gs) / (2 * decel);
      const sc = slideL + 0.3 * gs;
      if (!best || sc < best.sc) best = { h, gs, slideL, sc };
    }
    if (!best) best = { h: [-stopCourse[0], -stopCourse[1]], gs: VaTd, slideL: 6, sc: 99 };
    let TD = tdPoint;
    let direct = false;
    if (U >= 4 && why !== 'geofence' && why !== 'fail-safe') {
      // strong wind: creep into the wind straight to a touchdown point up-wind and to the side of the rider (no
      // downwind leg, no slide): the final starts wherever the glider is
      const up = [-wEst[0] / U, -wEst[1] / U], lt = [-up[1], up[0]];
      const sd = Math.sign((pos[0] - stopPt[0]) * lt[0] + (pos[1] - stopPt[1]) * lt[1]) || 1;
      const gUp = (pos[0] - stopPt[0]) * up[0] + (pos[1] - stopPt[1]) * up[1]; // glider's up-wind offset from the rider
      const dUp = clamp(gUp + 10, 4, 14); // touchdown ≥7 m up-wind of where the glider is now (it can only creep up-wind)
      TD = [stopPt[0] + up[0] * dUp + lt[0] * sd * p.tdLat, stopPt[1] + up[1] * dUp + lt[1] * sd * p.tdLat];
      best = { h: up, gs: Math.max(0.3, VaTd - U), slideL: Math.max(0.3, VaTd - U) ** 2 / (2 * G * p.muSnow * cosS), sc: 0 };
      direct = true;
    }
    const hF = best.h;
    const A = [TD[0] - hF[0] * Math.min(6, best.slideL), TD[1] - hF[1] * Math.min(6, best.slideL)];
    const fLen = clamp(3 * best.gs, 8, p.finalLen); // ≈3 s of final at the expected ground speed
    const Pt = [A[0] - hF[0] * fLen, A[1] - hF[1] * fLen];
    // downwind-leg point: abeam the turn point, two turn radii out on the side away from the rider (base turn → final)
    const lat = [-hF[1], hF[0]], sdR = Math.sign((TD[0] - stopPt[0]) * lat[0] + (TD[1] - stopPt[1]) * lat[1]) || 1;
    const rT = (1.35 * VsExt) ** 2 / (G * Math.tan(45 * D2R));
    // strong wind (into-wind final at low ground speed): no downwind leg — go straight to the turn point and turn into wind
    const Uw = Math.hypot(wEst[0], wEst[1]);
    const Pd = Uw >= 4 ? Pt.slice() : [Pt[0] + lat[0] * sdR * 2 * rT, Pt[1] + lat[1] * sdR * 2 * rT];
    if (direct) { Pd[0] = Pt[0]; Pd[1] = Pt[1]; }
    ld = { direct, A, hF, Pt, Pd, TD, fLen, slideL: best.slideL, gs: best.gs, tries: (ld && ld.tries) || 0, aligned: false };
    mode = direct ? MODE.FINAL : MODE.PATTERN;
    ev(t, 'pattern', 'info', `${why}：进入降落航线，五边航向 ${(Math.atan2(hF[1], hF[0]) / D2R).toFixed(0)}°（预计滑行 ${best.slideL.toFixed(1)} m）`, `${why}: landing pattern, final heading ${(Math.atan2(hF[1], hF[0]) / D2R).toFixed(0)}° (expected slide ${best.slideL.toFixed(1)} m)`);
  }

  let i = 0;
  const steps = Math.round(duration / dt);
  for (let k = 0; k <= steps; k++) {
    const t = k * dt;
    const sTrue = rider(t);
    if (plan.linkLossAt != null && t >= plan.linkLossAt && !linkLost) { linkLost = true; ev(t, 'linkLost', 'warning', 'UWB/数传链路与视觉目标同时丢失：按航迹外推', 'UWB/radio link and visual lock lost together: dead-reckoning the rider track'); }
    let meas;
    if (!linkLost) { const s = rider(Math.max(0, t - 0.1)); meas = { pos: s.pos, vel: s.vel, speed: s.speed, fallen: s.fallen, t }; lastMeas = meas; }
    else { const dtl = t - lastMeas.t; meas = { pos: add(lastMeas.pos, mul(lastMeas.vel, dtl)), vel: lastMeas.vel, speed: lastMeas.speed, fallen: false, t, dr: dtl }; }
    if (k % 8 === 0) { hist.t.push(t); hist.x.push(meas.pos[0]); hist.y.push(meas.pos[1]); }
    {
      const lv = -meas.vel[0] * course[1] + meas.vel[1] * course[0], sg = lv > 0.8 ? 1 : lv < -0.8 ? -1 : 0;
      if (sg && sg !== latSign) { if (lastFlip != null && t - lastFlip < 6) halfTurn += (t - lastFlip - halfTurn) * 0.4; lastFlip = t; latSign = sg; }
    }
    const om = 1 / p.smoothTau;
    const acc = [om * om * (meas.pos[0] - sp[0]) - 2 * om * sv[0], om * om * (meas.pos[1] - sp[1]) - 2 * om * sv[1], om * om * (meas.pos[2] - sp[2]) - 2 * om * sv[2]];
    sa = acc; sv = add(sv, mul(acc, dt)); sp = add(sp, mul(sv, dt));
    const svh = Math.hypot(sv[0], sv[1]);
    if (svh > 1.5) { const kc = Math.min(1, dt / 4); course = nrm([course[0] + (sv[0] / svh - course[0]) * kc, course[1] + (sv[1] / svh - course[1]) * kc, 0]); }
    const along = sv[0] * course[0] + sv[1] * course[1];
    const ref = [sp[0] + 2 * p.smoothTau * along * course[0], sp[1] + 2 * p.smoothTau * along * course[1], 0];
    // ---- stop / move detection (UWB tag speed + IMU braking)
    const speedM = Math.hypot(meas.vel[0], meas.vel[1]);
    decelM += ((speedPrev - speedM) / dt - decelM) * Math.min(1, dt / 0.3); speedPrev = speedM;
    let justStopped = false, justMoved = false;
    if (!stopped) {
      const braking = decelM > 2.5 && speedM < 4;
      stopT = speedM < 1.0 || meas.fallen || braking ? stopT + dt : 0;
      if (stopT > (meas.fallen ? 0.3 : braking ? 0.2 : 0.8)) {
        stopped = true; justStopped = true; moveT = 0; stopPt = meas.pos.slice(); stopCourse = course.slice();
        endOfRun = plan.endAfter != null && t >= plan.endAfter;
        ev(t, 'stop', 'info', meas.fallen ? '检测到摔倒（标签加速度）→ 等待盘旋' : (endOfRun ? '在缆车站地理围栏内停下 → 身旁降落' : '检测到停下 → 等待盘旋（不着陆）'), meas.fallen ? 'Fall detected (tag IMU) → loiter' : (endOfRun ? 'Stopped inside the lift geofence → land beside the rider' : 'Stop detected → loiter (no landing)'));
      }
    } else {
      const dmove = stopPt ? Math.hypot(meas.pos[0] - stopPt[0], meas.pos[1] - stopPt[1]) : 0;
      moveT = (speedM > 1.5 && decelM < 0.5) || dmove > 2.5 ? moveT + dt : 0;
      if (moveT > 0.5 && !meas.fallen && !endOfRun) { stopped = false; justMoved = true; stopT = 0; ev(t, 'move', 'info', '滑雪者出发（标签速度）', 'Rider moving (tag speed)'); }
    }
    // ---- wind (125–200 Hz sampling of the ≤6 Hz turbulence field), wake, estimate
    const flying = isFlying(mode);
    if (k % 3 === 0 || !wHold) wHold = windF(t, pos);
    const wTrue = wHold;
    const wk = flying ? wakeAt(pos, sTrue, t) : [0, 0, 0];
    const wAir = add(wTrue, wk);
    if (flying) { const kw = Math.min(1, dt / 3); wEst = add(wEst, mul(sub(wTrue, wEst), kw)); const dw = sub(wTrue, wEst); wVar += (dot(dw, dw) - wVar) * Math.min(1, dt / 8); }
    const by0 = cross(bz, bx);
    if (flying && (k % 8 === 0 || !wTipL)) { const hb = wingGeom(sweep, p).b / 2; wTipL = windF(t, add(pos, mul(by0, hb))); wTipR = windF(t, add(pos, mul(by0, -hb))); }

    // ---- mode machine
    const riderHead = headOf(sTrue);
    const dHead = len(sub(pos, riderHead));
    const rng = Math.hypot(pos[0] - meas.pos[0], pos[1] - meas.pos[1]);
    if (mode === MODE.STOWED && plan.throwAt != null && t >= plan.throwAt) {
      // hand throw from shoulder height, wings level, across the slope (blended into the wind), away from the body
      const s = sTrue, lft = [-s.heading[1], s.heading[0], 0];
      const U = Math.hypot(wEst[0], wEst[1]);
      // across the slope (never up-slope: the snow rises 15° into the flight path), on the side with an up-wind
      // component; tilted down the fall line when the wind blows up-slope (that is into the wind)
      let d = [-lft[0], -lft[1], 0];
      if (U > 2) {
        const wl = (wEst[0] * lft[0] + wEst[1] * lft[1]) / U; // wind component towards the left
        if (wl > 0.2) d = [lft[0], lft[1], 0]; // wind from the right… blowing left → throw right? (into wind = −w)
        d = wl > 0.2 ? [-lft[0], -lft[1], 0] : wl < -0.2 ? [lft[0], lft[1], 0] : d;
        const wd = -(wEst[0] * s.heading[0] + wEst[1] * s.heading[1]) / U; // up-slope wind component (into wind = down-slope)
        if (wd > 0.2) d = nrm(add(d, mul([s.heading[0], s.heading[1], 0], 1.5 * wd)), d);
      }
      pos = [s.pos[0] + 0.55 * d[0] + 0.1 * s.heading[0], s.pos[1] + 0.55 * d[1] + 0.1 * s.heading[1], s.pos[2] + 1.65];
      vel = add(mul(d, p.throwSpeed), [0, 0, 0.8]);
      bx = nrm(vel); bz = nrm(sub(UP, mul(bx, bx[2]))); mode = MODE.THROWN; tThrow = t; launchT = t; T = 0;
      ev(t, 'throw', 'info', `手抛起飞（操作 1）：${p.throwSpeed.toFixed(0)} m/s，迎风或横坡，推进桨 ${p.motorDelay} s 后启动`, `Hand throw (action 1): ${p.throwSpeed.toFixed(0)} m/s into the wind (calm: across the slope); pusher starts after ${p.motorDelay} s`);
    }
    if (mode === MODE.THROWN && t - tThrow >= p.motorDelay) {
      throwInfo.motorOnT = t;
      if (stopped) { mode = MODE.LOITER; startLoiter(t); lo.climb = true; } else mode = MODE.FOLLOW;
    }
    if (mode === MODE.LOITER && !stopped) { mode = MODE.FOLLOW; lo = null; ev(t, 'follow', 'info', '滑雪者出发：退出盘旋，就位跟拍（无需追赶：它已在空中）', 'Rider set off: roll out of the loiter into the follow station (already airborne, no catch-up)'); }
    if (mode === MODE.FOLLOW && stopped) {
      if (endOfRun) { const lft = [-stopCourse[1], stopCourse[0]], sd = Math.sign((pos[0] - stopPt[0]) * lft[0] + (pos[1] - stopPt[1]) * lft[1]) || 1; startLanding(t, [stopPt[0] + lft[0] * sd * p.tdLat, stopPt[1] + lft[1] * sd * p.tdLat], '收工'); }
      else { mode = MODE.LOITER; startLoiter(t); }
    }
    if ((mode === MODE.PATTERN || mode === MODE.FINAL) && !stopped && !endOfRun && !failsafe) { mode = MODE.FOLLOW; ld = null; ev(t, 'abortLanding', 'info', '降落前滑雪者出发：转回跟随', 'Rider left before touchdown: back to follow'); }
    if (mode === MODE.FOLLOW || mode === MODE.LOITER) {
      geoT = rng > p.geofence ? geoT + dt : 0;
      const lost = linkLost && meas.dr > p.linkHold;
      if (geoT > 1 || lost) {
        failsafe = true;
        const lft = [-course[1], course[0]], sd = Math.sign((pos[0] - meas.pos[0]) * lft[0] + (pos[1] - meas.pos[1]) * lft[1]) || 1;
        const tdp = [pos[0] + course[0] * 25 + lft[0] * sd * 12, pos[1] + course[1] * 25 + lft[1] * sd * 12];
        stopPt = [pos[0], pos[1], zT(pos[0], pos[1])]; stopCourse = course.slice();
        ev(t, lost ? 'failsafe' : 'geofence', 'warning', lost ? '失联超过 1.5 s：转离预测滑行线，在滑行线外降落（+1 操作取回）' : `超出 ${p.geofence} m 跟拍围栏：转离滑行线并降落（+1 操作取回）`, lost ? 'Link lost >1.5 s: turn away from the predicted track and land off the track (+1 action to collect)' : `Beyond the ${p.geofence} m follow-me geofence: turn away from the track and land (+1 action to collect)`);
        startLanding(t, tdp, lost ? 'fail-safe' : 'geofence');
      }
    }
    rangeMax = Math.max(rangeMax, flying && mode !== MODE.THROWN ? rng : 0);
    // "ready" cue to the rider at the top (tag vibration / helmet beep): glider in the loiter, ≥4 m up, behind the rider
    // and heading down the fall line within ±50° — the push-off then needs no catch-up
    if (tReady == null && mode === MODE.LOITER && stopped && !launchedOnce) {
      const behindD = -((pos[0] - stopPt[0]) * stopCourse[0] + (pos[1] - stopPt[1]) * stopCourse[1]);
      const vh = Math.hypot(vel[0], vel[1]), hd = vh > 1 ? (vel[0] * stopCourse[0] + vel[1] * stopCourse[1]) / vh : -1;
      const late = tThrow != null && t - tThrow > p.readyMax; // beat / wind-hover: no down-slope leg — cue anyway when behind and up
      if ((agl0r() > 4 && behindD > 2 && behindD < 16 && hd > (p.readyHd ?? 0.64)) || (late && agl0r() > 3 && behindD > -4 && rng < 20)) { tReady = t; ev(t, 'ready', 'info', '就位提示（标签振动）：可以出发', 'Ready cue (tag vibrates): push off now'); }
    }
    if (justMoved) launchedOnce = true;
    // wind interlock: measured mean wind above windMax after the climb-out (before the first push-off) → land at once
    if (!launchedOnce && !interlock && mode === MODE.LOITER && tThrow != null && t - tThrow > 4 && Math.hypot(wEst[0], wEst[1]) > p.windMax) {
      interlock = true; tReady = null;
      ev(t, 'interlock', 'warning', `风 ${Math.hypot(wEst[0], wEst[1]).toFixed(1)} m/s 超出包线（>${p.windMax} m/s：盘旋超动能上限/顺风窗口关闭）：不跟拍，迎风就近降落`, `Wind ${Math.hypot(wEst[0], wEst[1]).toFixed(1)} m/s beyond the envelope (>${p.windMax} m/s: loiter would exceed the KE cap, tailwind window closed): no follow, into-wind landing nearby`);
      endOfRun = true; startLanding(t, [stopPt[0], stopPt[1]], 'interlock');
    }
    if (mode === MODE.PATTERN && ld) {
      const dP = Math.hypot(pos[0] - ld.Pd[0], pos[1] - ld.Pd[1]);
      if (dP < (ld.Pd === ld.Pt || (ld.Pd[0] === ld.Pt[0] && ld.Pd[1] === ld.Pt[1]) ? 5 : 8)) { mode = MODE.FINAL; ev(t, 'final', 'info', '转五边：对准着陆线', 'Base turn onto final'); }
    }
    const agl0 = pos[2] - zT(pos[0], pos[1]);
    if (mode === MODE.FINAL && ld) {
      const sToGo = (ld.A[0] - pos[0]) * ld.hF[0] + (ld.A[1] - pos[1]) * ld.hF[1];
      if (ld.recover && agl0 > 3) ld.recover = false;
      if (ld.recover) { /* climbing back after a go-around */ }
      else if (agl0 < p.flareH && ld.aligned) { mode = MODE.FLARE; ev(t, 'flare', 'info', '拉平减速（推进桨停）', 'Flare (pusher off)'); }
      else if (ld.direct && sToGo < 1.5 && agl0 > p.flareH && (ld.shift || 0) < 3) { // strong wind: slide the aim point up-wind
        ld.shift = (ld.shift || 0) + 1;
        for (const P_ of [ld.A, ld.TD, ld.Pt, ld.Pd]) { P_[0] += ld.hF[0] * 6; P_[1] += ld.hF[1] * 6; }
      }
      else if ((agl0 < p.flareH && !ld.aligned) || sToGo < -8) { // go-around: re-fly the pattern (count it)
        ld.tries++; ld.recover = true;
        ev(t, 'goAround', 'warning', `未对准着陆线：复飞（第 ${ld.tries} 次）`, `Not lined up: go-around (#${ld.tries})`);
        if (ld.tries >= 3) { ev(t, 'landAnywhere', 'warning', '三次复飞：就地降落（+1 操作取回）', 'Three go-arounds: land wherever possible (+1 action to collect)'); ld.giveUp = true; mode = MODE.FLARE; }
        else mode = ld.direct ? MODE.FINAL : MODE.PATTERN;
      }
    }

    // ---- guidance → aDes, allocation
    if (mode !== prevMode) { if (mode === MODE.FOLLOW) { stPrev = null; stVel = vel.slice(); stAcc = [0, 0, 0]; zInt = 0; } prevMode = mode; }
    let aDes = [0, 0, 0];
    let pDesOut = null;
    const agl = agl0;
    if (flying) {
      let pDes, vff = [0, 0, 0], vCmd, kpos = 0.6, gainV = 1.3, ff = [0, 0, 0], noWeave = false, slow = false, noThrust = false;
      if (mode === MODE.FOLLOW || mode === MODE.THROWN) {
        pDes = p.followMode === 1 ? trailStation(t, ref, course, speedM) : stationOf(t, ref, course, along);
        for (const tr of trees) { const dx = pDes[0] - tr.x, dy = pDes[1] - tr.y, dh = Math.hypot(dx, dy), keep = tr.r + 4.5; if (dh < keep) { pDes[0] = tr.x + (dx / Math.max(dh, 0.1)) * keep; pDes[1] = tr.y + (dy / Math.max(dh, 0.1)) * keep; } }
        if (decelM > 2.0 && speedM < 11) pDes[2] += 2.5; // rider braking: zoom-climb (bank the energy as height)
        if (!stPrev) stPrev = pDes;
        const vRaw = mul(sub(pDes, stPrev), 1 / dt); stPrev = pDes;
        const stVel0 = stVel;
        stVel = add(stVel, mul(sub(vRaw, stVel), Math.min(1, dt / 0.25)));
        stAcc = add(stAcc, mul(sub(mul(sub(stVel, stVel0), 1 / dt), stAcc), Math.min(1, dt / 0.25)));
        vff = stVel.slice();
        zInt = clamp(zInt + (pDes[2] - pos[2]) * dt * 0.15, -2, 2);
        pDes = [pDes[0], pDes[1], pDes[2] + zInt];
        kpos = 0.9; gainV = 1.8; ff = p.followMode === 1 ? stAcc : mul(sa, 0.6);
        if (mode === MODE.THROWN) { noThrust = true; }
        vCmd = add(vff, sat3(mul(sub(pDes, pos), kpos), 6));
      } else if (mode === MODE.LOITER) {
        noWeave = true;
        const C = lo.C, zC = Math.max(zT(C[0], C[1]) + p.loiterH, zT(pos[0], pos[1]) + p.loiterH - 2);
        pDes = [C[0], C[1], zC];
        const Uh = Math.hypot(wEst[0], wEst[1]);
        if (lo.climb && agl0 > 4) lo.climb = false;
        if (lo.climb) {
          // climb-out after the throw: wings near level, into the wind (calm: keep the throw heading), full climb demand
          const U = Math.hypot(wEst[0], wEst[1]);
          const d = U > 1.5 ? [-wEst[0] / U, -wEst[1] / U] : nrm([vel[0], vel[1], 0], [1, 0, 0]);
          const gsC = groundAlong(d, VaLoit, wEst);
          vCmd = [d[0] * gsC, d[1] * gsC, 3];
          noWeave = true;
        } else if (lo.kind === 'hover') {
          vCmd = sat3(mul(sub([C[0] - lo.wh[0] * 4, C[1] - lo.wh[1] * 4, zC], pos), 0.4), 2.5);
          noWeave = false;
        } else if (lo.kind === 'orbit') {
          const rr = [pos[0] - C[0], pos[1] - C[1]], r = Math.hypot(rr[0], rr[1]) || 1e-3;
          const er = [rr[0] / r, rr[1] / r], et = [-er[1] * lo.dirO, er[0] * lo.dirO];
          const gs = groundAlong(et, VaLoit, wEst);
          // capture: outside the circle head for the tangent point; on it, constant-airspeed tangential flight
          const rc = clamp(1.0 * (p.loiterR - r), -VaLoit, 4);
          const v2 = [et[0] * gs + er[0] * rc, et[1] * gs + er[1] * rc], l2 = Math.hypot(v2[0], v2[1]) || 1;
          const gs2 = groundAlong([v2[0] / l2, v2[1] / l2], VaLoit, wEst);
          vCmd = [(v2[0] / l2) * gs2, (v2[1] / l2) * gs2, 0];
        } else {
          // cross-wind beat: air velocity at VaLoit, angle φ from up-wind; reversals turn THROUGH up-wind
          const up = [-lo.wh[0], -lo.wh[1]];
          const cross_ = (pos[0] - C[0]) * lo.c[0] + (pos[1] - C[1]) * lo.c[1];
          const alongU = (pos[0] - C[0]) * up[0] + (pos[1] - C[1]) * up[1];
          if (cross_ * lo.s > p.loiterHalf) lo.s = -lo.s;
          const phi0 = Math.acos(clamp(Uh / VaLoit, 0, 0.97));
          const phiT = lo.s * clamp(phi0 + 0.05 * alongU, 0.25, Math.PI - 0.25);
          if (lo.phi == null) lo.phi = phiT;
          const wTurn = (G * Math.tan(p.loiterBank * D2R)) / VaLoit;
          lo.phi += clamp(phiT - lo.phi, -wTurn * dt, wTurn * dt);
          const aDir = [Math.cos(lo.phi) * up[0] + Math.sin(lo.phi) * lo.c[0], Math.cos(lo.phi) * up[1] + Math.sin(lo.phi) * lo.c[1]];
          vCmd = [wEst[0] + VaLoit * aDir[0], wEst[1] + VaLoit * aDir[1], 0];
        }
        if (!lo.climb) vCmd[2] = clamp(0.8 * (zC - pos[2]), -2, 3);
        kpos = 0.6; gainV = 1.4;
      } else if (mode === MODE.PATTERN || mode === MODE.FINAL || mode === MODE.FLARE) {
        noWeave = true;
        const hF = ld.hF, lat = [-hF[1], hF[0]];
        const VaA = mode === MODE.FLARE ? Math.max(1.02 * VsExt, len(sub(vel, wEst)) - 2 * dt) : 1.35 * VsExt;
        if (mode === MODE.PATTERN) {
          // fly to the turn point (on the extended final, behind the aim point), height for a 6° final + 2 m
          const zP = Math.max(zT(ld.Pd[0], ld.Pd[1]), zT(ld.Pt[0], ld.Pt[1]), zT(pos[0], pos[1])) + Math.max(4, ld.fLen * Math.tan(p.finalGamma * D2R) + 2);
          pDes = [ld.Pd[0], ld.Pd[1], zP];
          const d = nrm([pDes[0] - pos[0], pDes[1] - pos[1], 0]);
          const gs = groundAlong(d, VaA, wEst);
          vCmd = [d[0] * gs, d[1] * gs, clamp(0.6 * (zP - pos[2]), -2.5, 2)];
          // keep ≥4 m horizontal from the rider on the way
          const rr = [pos[0] - sTrue.pos[0], pos[1] - sTrue.pos[1]], dr = Math.hypot(rr[0], rr[1]);
          if (dr < 6) { vCmd[0] += (rr[0] / Math.max(dr, 0.3)) * 2 * (6 - dr); vCmd[1] += (rr[1] / Math.max(dr, 0.3)) * 2 * (6 - dr); }
          if (agl < 3.5) vCmd[2] = Math.max(vCmd[2], 1.5 + (3.5 - agl));
          if (ld.recover) { vCmd[2] = Math.max(vCmd[2], 2); if (agl > 3.5) ld.recover = false; }
        } else {
          const sToGo = (ld.A[0] - pos[0]) * hF[0] + (ld.A[1] - pos[1]) * hF[1];
          const xt = (pos[0] - ld.A[0]) * lat[0] + (pos[1] - ld.A[1]) * lat[1];
          // L1-style line capture: steer at a look-ahead point 12 m down the line (no overshoot)
          const Lk = ld.direct ? 5 : 12;
          const look = [ld.A[0] - hF[0] * (sToGo - Lk), ld.A[1] - hF[1] * (sToGo - Lk)];
          const dL = nrm([look[0] - pos[0], look[1] - pos[1], 0], [hF[0], hF[1], 0]);
          const gs = groundAlong(dL, VaA, wEst);
          vCmd = [dL[0] * gs, dL[1] * gs, 0];
          const zA = zT(ld.A[0], ld.A[1]) + 0.25;
          const gam = Math.tan(p.finalGamma * D2R);
          const vhh = Math.hypot(vel[0], vel[1]), vhn = nrm([vel[0], vel[1], 0]);
          const headOK = vhh < 2.5 ? (bx[0] * hF[0] + bx[1] * hF[1]) / (Math.hypot(bx[0], bx[1]) || 1) > 0.7 : vhn[0] * hF[0] + vhn[1] * hF[1] > 0.8;
          const aligned = (headOK && Math.abs(xt) < 3) || !!ld.giveUp;
          ld.aligned = aligned;
          if (mode === MODE.FINAL && (!aligned || ld.recover)) { // still turning onto the line: hold ≥3.5 m above the snow, no descent
            pDes = [ld.A[0], ld.A[1], Math.max(zT(pos[0], pos[1]) + 3.5, zA + Math.max(0, sToGo) * gam)];
            vCmd[2] = clamp(0.8 * (pDes[2] - pos[2]), -1, 2.5);
          } else if (mode === MODE.FINAL) {
            const zPath = zA + Math.max(0, sToGo) * gam;
            const terrRate = -tanS * vel[0];
            vCmd[2] = clamp(-gs * gam + 0.8 * (zPath - pos[2]), -3.5, 1.0);
            if (agl < 1.6) vCmd[2] = Math.max(vCmd[2], terrRate - 1.2);
          } else {
            slow = true; noThrust = true;
            const terrRate = -tanS * vel[0] + (mog ? 0 : 0);
            vCmd[2] = terrRate - 0.45 - 0.5 * Math.max(0, agl - 0.3);
          }
        }
        pDes = pDes || [ld.A[0], ld.A[1], zT(ld.A[0], ld.A[1])];
        kpos = 0; gainV = mode === MODE.FLARE ? 2.5 : 1.6;
        if (mode !== MODE.PATTERN) noThrust = noThrust || false;
      }
      pDesOut = pDes;
      if (mode !== MODE.PATTERN && mode !== MODE.FINAL && mode !== MODE.FLARE && mode !== MODE.LOITER) vCmd[2] = clamp(vCmd[2], -tanS * vCmd[0] - 1.5 * clamp((agl - 1.5) / 2, 0.3, 1), 3); // ≤1.5 m/s towards the snow
      { const v3 = len(vCmd); if (v3 > vCap) vCmd = mul(vCmd, vCap / v3); }
      const ob = obstacleRepulse(t, pos, vel);
      if (mode === MODE.FOLLOW || mode === MODE.LOITER || mode === MODE.PATTERN) {
        if (len(ob.corr) > 0.3 && !avoidEvt) { avoidEvt = true; ev(t, 'avoid', 'info', '前视测距发现障碍：绕避', 'Forward ranging sees an obstacle: avoiding'); }
        vCmd = add(vCmd, ob.corr);
        if (dHead < 3) vCmd = add(vCmd, mul(nrm(sub(pos, riderHead)), 4 * (3 - dHead)));
      } else if (dHead < 2.5) { const aw = nrm([pos[0] - riderHead[0], pos[1] - riderHead[1], 0]); vCmd = add(vCmd, mul(aw, 3 * (2.5 - dHead))); }
      const vaC = sub(vCmd, wEst), vaH = Math.hypot(vaC[0], vaC[1]);
      if (!noWeave && vaH < Vmin) {
        weaveT += dt;
        const dir = vaH > 0.5 ? [vaC[0] / vaH, vaC[1] / vaH] : [course[0], course[1]];
        const beta = Math.acos(clamp(vaH / Vmin, 0, 1)) * clamp(1.8 * Math.sin((Math.PI * weaveT) / 2.6), -1, 1);
        const cb = Math.cos(beta), sbt = Math.sin(beta);
        vCmd = [wEst[0] + Vmin * (dir[0] * cb - dir[1] * sbt), wEst[1] + Vmin * (dir[1] * cb + dir[0] * sbt), vCmd[2]];
      } else weaveT = 0;
      aDes = add(mul(sub(vCmd, vel), gainV), ff);
      { // a wing cannot brake hard or reverse in place: limit the along-path demand and turn (horizontally) towards
        // commands that point >≈60° away from the current track, instead of pulling up into a loop
        const vhl = Math.hypot(vel[0], vel[1]);
        if (vhl > 3) {
          const e = [vel[0] / vhl, vel[1] / vhl], l = [-e[1], e[0]];
          let aA = aDes[0] * e[0] + aDes[1] * e[1], aL = aDes[0] * l[0] + aDes[1] * l[1];
          const cA = vCmd[0] * e[0] + vCmd[1] * e[1], cL = vCmd[0] * l[0] + vCmd[1] * l[1];
          if (cA < 0.6 * Math.abs(cL) && Math.hypot(cA, cL) > 2) aL = (Math.sign(cL) || 1) * Math.max(Math.abs(aL), 8);
          aA = clamp(aA, -3, 6);
          aDes = [e[0] * aA + l[0] * aL, e[1] * aA + l[1] * aL, aDes[2]];
        }
      }
      aDes = sat3(aDes, 12);
      const gH = mode === MODE.PATTERN ? 3 : 2.0;
      if (agl < gH && mode !== MODE.FLARE && !(mode === MODE.FINAL && ld && ld.aligned && !ld.recover)) { // terrain guard
        const k2 = clamp((gH - agl) / 1.0, 0, 1);
        aDes[0] *= 1 - 0.7 * k2; aDes[1] *= 1 - 0.7 * k2;
        aDes[2] = Math.max(aDes[2], 4 * (gH - agl) - 1.5 * Math.min(0, vel[2] + tanS * Math.hypot(vel[0], vel[1])));
      }
      const sp3 = len(vel);
      if (sp3 > vCap - 0.3) aDes = add(aDes, mul(vel, -6 * (sp3 - vCap + 0.3) / sp3)); // KE guard
      energySlack = mode === MODE.FOLLOW ? clamp((pos[2] - (pDes[2] - 1.0)) / 1.0, 0, 1) : mode === MODE.FINAL ? 1 : 0;
      // TECS-like climb power: the glide alone cannot pay for a climb (loiter/pattern: full climb power demand)
      climbPow = (mode === MODE.FOLLOW || mode === MODE.LOITER || mode === MODE.PATTERN || mode === MODE.FINAL) && pos[2] < pDes[2] - (mode === MODE.FOLLOW ? 1 : 0.3) ? W * Math.max(0, vCmd[2] - vel[2]) * (mode === MODE.FOLLOW ? 0.6 : 1.2) : 0;
      const vaV = sub(vel, wAir), Va = Math.max(len(vaV), 0.5);
      wingAlloc(aDes, vaV, Va, { slow, noThrust });
    } else { cmd.T = 0; cmd.Dreg = 0; cmd.spo = 0; cmd.bx = bx; cmd.bz = bz; }

    // ---- plant
    if (flying) {
      const ka = Math.min(1, dt / p.tauAtt);
      let nbx = add(bx, mul(sub(cmd.bx, bx), ka));
      const turn = Math.acos(clamp(dot(nrm(nbx), bx), -1, 1));
      if (turn > 6 * dt) nbx = add(bx, mul(sub(nrm(nbx), bx), (6 * dt) / turn));
      bx = nrm(nbx);
      let nbz = add(bz, mul(sub(cmd.bz, bz), ka));
      nbz = sub(nbz, mul(bx, dot(nbz, bx))); bz = nrm(nbz, cross(bx, [0, 1, 0]));
      const kt = Math.min(1, dt / p.tauT);
      T += (cmd.T - T) * kt; Dreg += (cmd.Dreg - Dreg) * kt; spo += (cmd.spo - spo) * kt;
      sweep += clamp(sweepCmd - sweep, -p.sweepRate * dt, p.sweepRate * dt);
      const u = sub(vel, wAir);
      const ux = dot(u, bx), uz = dot(u, bz), by = cross(bz, bx), uy = dot(u, by);
      const Vp = Math.hypot(ux, uz), Va = len(u);
      const g = wingGeom(sweep, p);
      const alpha = Math.atan2(-uz, ux);
      const c = coeffs(alpha, g, p, spo);
      const qp = 0.5 * RHO * Vp * Vp;
      let F = [0, 0, 0];
      if (Vp > 0.05) {
        const eD = add(mul(bx, ux / Vp), mul(bz, uz / Vp));
        const eL = add(mul(bx, -uz / Vp), mul(bz, ux / Vp));
        F = add(mul(eL, c.CL * qp * g.S), mul(eD, -c.CD * qp * g.S));
      }
      F = add(F, mul(by, -0.5 * RHO * Math.abs(uy) * uy * p.cdaSide));
      const DregEff = Math.min(Dreg, p.regenCd * 0.5 * RHO * Va * Va * Adisc);
      if (Va > 0.5) F = add(F, mul(u, -DregEff / Va));
      Faero = add(Faero, mul(sub(F, Faero), Math.min(1, dt / 0.12)));
      const Tmax = p.tStatic * Math.max(0, 1 - Math.max(0, ux) / p.vPitch);
      const Tact = Math.min(T, Tmax);
      const acc2 = add(mul(add(F, mul(bx, Tact)), 1 / m), [0, 0, -G]);
      vel = add(vel, mul(acc2, dt)); pos = add(pos, mul(vel, dt));
      const uax = Math.max(0, ux);
      const vi = -uax / 2 + Math.sqrt((uax * uax) / 4 + Tact / (2 * RHO * Adisc));
      const Pm = Tact > 1e-4 ? (Tact * (uax + vi)) / p.fomEta : 0;
      const Pr = Math.min(p.regenPmax, p.regenEta * DregEff * Va);
      E += (p.pAvionics + Pm - Pr) * dt;
      motorJ += Pm * dt; regenJ += Pr * dt; flightT += dt;
      if (mode === MODE.LOITER) { loiterJ += (p.pAvionics + Pm - Pr) * dt; loiterT += dt; }
      // ---- gust-driven attitude disturbance (camera): roll from the span-wise gradient of the vertical gust,
      // pitch/yaw weather-cocking to the gust angle; attitude loop at ωap (2nd order, ζ). One-way (not fed back).
      {
        const ug = sub(wAir, wEst);
        aG = dot(ug, bz) / Math.max(Va, 3); bG = dot(ug, by) / Math.max(Va, 3);
        pG = wTipL && wTipR ? (wTipL[2] - wTipR[2]) / g.b : 0;
        const wT = Math.sqrt(p.wSp * p.wSp + p.wAp * p.wAp), wY = Math.sqrt(p.wYaw * p.wYaw + p.wAp * p.wAp);
        dphd += ((pG - dphd) / p.tauRoll - p.wAp * p.wAp * dph - 2 * p.zAp * p.wAp * dphd) * dt; dph += dphd * dt;
        dthd += (p.wSp * p.wSp * (-aG - dth) - p.wAp * p.wAp * dth - 2 * p.zAp * wT * dthd) * dt; dth += dthd * dt;
        dpsd += (p.wYaw * p.wYaw * (bG - dps) - p.wAp * p.wAp * dps - 2 * p.zAp * wY * dpsd) * dt; dps += dpsd * dt;
      }
      // throw bookkeeping: prop (pusher, 0.17 m behind the CG) to helmet once the motor runs
      if (mode !== MODE.STOWED && tThrow != null && t - tThrow < 4) {
        throwInfo.minAGL = Math.min(throwInfo.minAGL, pos[2] - zT(pos[0], pos[1]));
        if (Tact > 0.01) throwInfo.propHeadMin = Math.min(throwInfo.propHeadMin, len(sub(sub(pos, mul(bx, 0.17)), riderHead)) - 0.13 - p.propR);
      }
      if (mode !== MODE.THROWN) headMinFly = Math.min(headMinFly, dHead);
      // ---- snow contact (belly)
      const zg = zT(pos[0], pos[1]);
      if (pos[2] - zg < 0.03 && vel[2] < 0.05 + -tanS * vel[0]) {
        const vn = -(vel[2] + tanS * vel[0]) * cosS; // speed into the slope plane
        const bank = Math.acos(clamp(dot(bz, [sinS, 0, cosS]), -1, 1)) / D2R; // wing tilt relative to the snow plane
        const vh = Math.hypot(vel[0], vel[1]);
        const ke = 0.5 * m * dot(vel, vel);
        if ((mode === MODE.FLARE || mode === MODE.FINAL) && vn < p.tdVnMax && bank < 30) {
          mode = MODE.SLIDE; slide.tdT = t; slide.tdV = vh; slide.tdVn = vn; slide.tdKE = ke;
          pos[2] = zg + 0.03; slide.v = [vel[0], vel[1]]; T = 0; Dreg = 0; spo = 0;
          ev(t, 'touchdown', 'info', `机腹着雪：${vh.toFixed(1)} m/s，法向 ${vn.toFixed(1)} m/s（${ke.toFixed(1)} J）`, `Belly touchdown: ${vh.toFixed(1)} m/s, ${vn.toFixed(1)} m/s into the snow (${ke.toFixed(1)} J)`);
        } else {
          mode = MODE.CRASH; pos[2] = zg + 0.03; vel = [0, 0, 0];
          ev(t, 'snowStrike', 'warning', `飞行中触雪（动能 ${ke.toFixed(1)} J）：需人工取回（+1 操作）`, `Snow strike in flight (KE ${ke.toFixed(1)} J): manual recovery (+1 action)`);
        }
      }
    } else if (mode === MODE.SLIDE) {
      // Coulomb slide on the planar slope (horizontal-plane approximation): friction μk·g·cosθ against the motion,
      // gravity g·sinθ·cosθ down the fall line; rests when slow if μs > tanθ
      const v = slide.v, vh = Math.hypot(v[0], v[1]);
      const ax = G * sinS * cosS - (vh > 1e-6 ? (p.muSnow * G * cosS * v[0]) / vh : 0);
      const ay = -(vh > 1e-6 ? (p.muSnow * G * cosS * v[1]) / vh : 0);
      v[0] += ax * dt; v[1] += ay * dt;
      pos[0] += v[0] * dt; pos[1] += v[1] * dt; pos[2] = zT(pos[0], pos[1]) + 0.03;
      vel = [v[0], v[1], -tanS * v[0]];
      slide.dist += Math.hypot(v[0], v[1]) * dt;
      slide.minRider = Math.min(slide.minRider, Math.hypot(pos[0] - sTrue.pos[0], pos[1] - sTrue.pos[1]));
      if (Math.hypot(v[0], v[1]) < 0.15 && p.muStatic > tanS) {
        mode = MODE.LANDED; vel = [0, 0, 0]; slide.restT = t; slide.restPos = pos.slice();
        const dR = Math.hypot(pos[0] - sTrue.pos[0], pos[1] - sTrue.pos[1]);
        ev(t, 'landed', 'info', `停在雪上，离滑雪者 ${dR.toFixed(1)} m：等待拾起（操作 2）`, `At rest on the snow ${dR.toFixed(1)} m from the rider: waiting to be picked up (action 2)`);
      }
      E += p.pAvionics * dt;
    } else if (mode === MODE.LANDED) { E += 0.3 * dt; }
    else if (mode === MODE.CRASH) { E += 0.3 * dt; }
    if (mode === MODE.FINAL || mode === MODE.FLARE) slide.minRider = Math.min(slide.minRider, Math.hypot(pos[0] - sTrue.pos[0], pos[1] - sTrue.pos[1]));
    if (isFlying(mode) && Math.hypot(vel[0], vel[1]) > vCap * 0.97 && sTrue.speed > vCap * 0.97) { keCapT += dt; }

    // ---- output
    if (k % every === 0 && i < n) {
      O.x[i] = pos[0]; O.y[i] = pos[1]; O.z[i] = pos[2]; O.vx[i] = vel[0]; O.vy[i] = vel[1]; O.vz[i] = vel[2];
      O.bxx[i] = bx[0]; O.bxy[i] = bx[1]; O.bxz[i] = bx[2]; O.bzx[i] = bz[0]; O.bzy[i] = bz[1]; O.bzz[i] = bz[2];
      const fl = isFlying(mode);
      O.sweep[i] = mode === MODE.STOWED ? 2 : sweep; O.T[i] = fl ? T : 0; O.Dreg[i] = fl ? Dreg : 0; O.spo[i] = fl ? spo : 0; O.mode[i] = mode; O.E[i] = E / 3600;
      const u = sub(vel, wAir), Va = len(u);
      O.va[i] = fl ? Va : 0; O.alpha[i] = fl ? Math.atan2(-dot(u, bz), dot(u, bx)) / D2R : NaN;
      O.agl[i] = pos[2] - zT(pos[0], pos[1]);
      const uax = Math.max(0, dot(u, bx)), Tact = fl ? Math.min(T, p.tStatic * Math.max(0, 1 - uax / p.vPitch)) : 0;
      const vi = -uax / 2 + Math.sqrt((uax * uax) / 4 + Tact / (2 * RHO * Adisc));
      O.Pmot[i] = Tact > 1e-4 ? (Tact * (uax + vi)) / p.fomEta : 0;
      O.Preg[i] = fl ? Math.min(p.regenPmax, p.regenEta * Math.min(Dreg, p.regenCd * 0.5 * RHO * Va * Va * Adisc) * Va) : 0;
      O.Pel[i] = fl ? p.pAvionics + O.Pmot[i] - O.Preg[i] : mode === MODE.SLIDE ? p.pAvionics : mode === MODE.STOWED ? 0 : 0.3;
      O.headD[i] = dHead; O.wx[i] = wTrue[0]; O.wy[i] = wTrue[1]; O.wz[i] = wTrue[2]; O.wake[i] = len(wk);
      if (trees.length || nb) { const ob = obstacleRepulse(t, pos, vel); O.obsD[i] = ob.dmin; O.nbD[i] = ob.dn; } else { O.obsD[i] = Infinity; O.nbD[i] = Infinity; }
      O.lag[i] = Math.hypot(pos[0] - sTrue.pos[0], pos[1] - sTrue.pos[1]);
      O.range[i] = rng;
      O.link[i] = linkLost ? 0 : 1;
      O.dph[i] = fl ? dph : 0; O.dth[i] = fl ? dth : 0; O.dps[i] = fl ? dps : 0;
      O.bank[i] = fl ? Math.asin(clamp(dot(cross(bz, bx), UP) * -1, -1, 1)) / D2R : 0;
      O.lsub[i] = lo ? (lo.hover ? 2 : 1) : 0;
      if (pDesOut) { O.px[i] = pDesOut[0]; O.py[i] = pDesOut[1]; O.pz[i] = pDesOut[2]; } else { O.px[i] = O.py[i] = O.pz[i] = NaN; }
      O.az[i] = azPlan(t);
      i++;
    }
  }
  const sumUp = { interlock, tReady, Euse, flightT, motorJ, regenJ, Ej: E, keCapT, launchT, tThrow, vCap, VsExt, Vmin, VaLoit, rangeMax, slide, throwInfo, loiterJ, loiterT, headMinFly, landPlan: ld, failsafe };
  return { O, n, events, tanS, zT, sum: sumUp, rider, nbPos, trees, plan, MODE };
}

// Hands-off physics check (tests): point mass at a fixed CL in still air, wings level, no thrust.
export function freeGlide(p, { V0 = 12, s = 0, CL = 0.5, T = 20, dt = 0.002 } = {}) {
  const g = wingGeom(s, p), m = p.mass;
  let vx = V0, vz = 0, z = 0, x = 0;
  const out = [];
  for (let k = 0; k * dt <= T; k++) {
    const V = Math.hypot(vx, vz), q = 0.5 * RHO * V * V;
    const CD = (g.cd0 + g.k * CL * CL) * p.dragScale;
    const ex = vx / V, ez = vz / V;
    const ax = (-CD * q * g.S * ex + CL * q * g.S * -ez) / m, az = (-CD * q * g.S * ez + CL * q * g.S * ex) / m - G;
    if (k % 50 === 0) out.push({ t: k * dt, V, gammaDeg: (Math.atan2(-vz, vx) * 180) / Math.PI, Emech: 0.5 * m * V * V + m * G * z, x, z });
    vx += ax * dt; vz += az * dt; x += vx * dt; z += vz * dt;
  }
  return out;
}
