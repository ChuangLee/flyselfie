// ROUND 4 (kite2@4.0.0, audit3 A3-K2-02..06): the boom is PASSIVE and hair-thin (3.0→2.5 mm, 1.45 m, free damped pivot,
// tension-only), the winch is a motorised fishing reel (anti-reverse + servo friction drag: passive instantaneous pay-out,
// motor reels in only, inside a real 2205-class Kv/R/current/voltage/inertia envelope), the KE governor is a solenoid drag
// release on an ESTIMATED kite speed, and the in-flight controller / tip pitot read coloured-noise sensors. The iteration-3
// notes below describe the parts that are unchanged (polar, reefing, docking logic).
// K2 active kite (SIM-031), iteration 3 — physics core.
// K2-R3 "reefing steerable drogue on a self-aligning boom": an ≈90 g kite with a slotted round canopy
// (0.40 m² nominal, skirt-reefable to 25 % drag area) — a statically stable drag body that glides at
// L/D 0–0.75 through servo-opened vent slots (MC-1-1C documented glide, the DEFAULT; MC-6 0.9–1.2 is a
// sensitivity only). Iteration 3 removes the iteration-2 dependence on L/D ≥1.0 and on keeping 70 % of
// the glide when reefed (default: 50 % kept), by changing what bounds the kite's kinetic energy:
//   • heave-compensating winch: the pack IMU + boom encoders measure how fast the line exit moves
//     relative to the rider's centre of mass (body roll in edge changes / hockey stops moves it at up to
//     8–9 m/s) and the winch pays that motion out/in, so the kite is not yanked (offshore active heave
//     compensation principle);
//   • KE governor: above a soft ground-speed cap computed from the kite's own mass the winch clutch goes
//     soft (≈2 N) — a drogue on a soft line decays towards the wind velocity within a fraction of a
//     second — and reel-in is rate-limited so reeling never adds speed beyond the cap.
// The line leaves from the tip of a 1.1 m passive gimballed telescopic boom (pack-top pivot) that the line
// tension aligns with the line: the exit sits ≥1 m from the helmet, the line rises from ≈0.7 m above the
// pack, and the KCU always slides onto the boom tip ON the boom axis (the funnel only sees the residual
// angle when the line leaves the gimbal cone). Launch is reefed (opening shock limited), a canopy that
// lands is never re-inflated on the snow (reeled in and docked instead), and body force is the true
// 50 ms mean of the line tension at the integration step.
// Kite control unit (KCU) at the riser confluence, three micro servo-winches:
//   trim  x  — vent-slot opening u (round) or riser ratio α (wing) → L/D → cone angle β
//   reef  r  — skirt reefing line (drag-area factor r ∈ [rMin, 1] → pull)
//   steer ψ  — differential slots (round) / brake (wing): direction of the glide force about the apparent wind
// Model: 3-DOF point-mass kite at the confluence; quasi-steady coupled polar; filling-time inflation with an
// opening-shock factor; collapse on a slack line; massless elastic tether with Kelvin–Voigt damping; pack
// winch (velocity servo + slip clutch) at the end of a first-order self-aligning boom; deterministic
// turbulence (common/env.js); wind gates on windEstimate() (common/fullrun.js). Numerical-uncalibrated
// simulation; ASSUMED where marked.
import { skierAt, bodyPoints } from '../common/skier.js';
import { makeWind } from '../common/env.js';
import { COMPONENTS, budget, BATTERY, keSpeedCap } from '../common/components.js';
import { windEstimate } from '../common/fullrun.js';
import { mulberry32 } from '../../model/util.js';

// seeded coloured (first-order low-passed white) noise, unit σ per axis, correlation time tau — sensor error model
export function colouredNoise(seed, tau) {
  const rng = mulberry32(seed >>> 0); const v = [0, 0, 0];
  const g = () => { const u = Math.max(1e-12, rng()), w = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
  return (dt) => { const a = Math.exp(-dt / tau), b = Math.sqrt(1 - a * a); for (let k = 0; k < 3; k++) v[k] = a * v[k] + b * g(); return v; };
}

export const G0 = 9.81;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  nrm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
const { sub, add, mul, dot, cross, len, nrm } = V;

// ---------------------------------------------------------------- canopy polars (one coupled polar per canopy)
// Two canopy families, each with ONE trim input x; L/D and the resultant coefficient CR move together on it.
//
// 'round' (default, K2-R): a small steerable slotted round canopy (MC-1-1C / MC-6 class geometry scaled to
//   ≈0.7 m nominal diameter). Glide comes from rearward vent jets through slots whose opening x = u ∈ [0,1]
//   is a servo input; the canopy stays a statically stable drag body at every u. Coefficients on the NOMINAL
//   (constructed) area S0: CD0 ≈0.80 (flat circular canopy class, ASSUMED), L/D = Gmax·u with Gmax ≈0.75
//   (MC-1-1C: ≈4.1 m/s forward at ≈5.5 m/s descent; MC-6 ≈0.9–1.2), opening slots adds porosity (−12 % CD).
// 'wing' (comparison, design 4): ram-air / single-skin wing with x = α on the coupled polar
//   attached: CL = a·(α−α0), CD = CD0 + k·CL²; separated: CL = CD90·sinα·cosα, CD = CD0 + CD90·sin²α.
//   Anchors: Burk & Ware NASA TN D-4182 (ram-air, CLmax 0.9–1.1 at α 30–35°, (L/D)max 1.9–2.7, CD0 ≈0.15,
//   α 50–70°: L/D 0.7–0.35 at CR 1.15–1.25, "would not inflate properly" above ≈70°, violent oscillations
//   above ≈50°); Ware & Libbey NASA TN D-4672 (multilobe gliding parachute: collapse below α 22.5°,
//   NO stable trim between 30° and 75°). So a soft wing reaches L/D 0.4–0.9 only at CR ≈0.9–1.25 and only
//   with active pitch stabilisation that has never been demonstrated (audit K2-01).
export const POLAR_DEF = { canopy: 'round', cd0r: 0.80, gMaxR: 0.75, porR: 0.12, cla: 2.4, a0: -2, cd0: 0.15, kInd: 0.12, cd90: 1.3, aStall: 30, wStall: 4 };
export function polar(x, q = POLAR_DEF) {
  if (q.canopy === 'round') {
    const u = x < 0 ? 0 : x > 1 ? 1 : x;
    const CD = q.cd0r * (1 - q.porR * u), G = q.gMaxR * u, CL = G * CD;
    return { CL, CD, G, CR: Math.hypot(CL, CD) };
  }
  const ar = x * D2R;
  const CLa = q.cla * (x - q.a0) * D2R, CDa = q.cd0 + q.kInd * CLa * CLa;
  const sn = Math.sin(ar), cs = Math.cos(ar);
  const CLs = q.cd90 * sn * cs, CDs = q.cd0 + q.cd90 * sn * sn;
  const w = 1 / (1 + Math.exp(-(x - q.aStall) / q.wStall));
  const CL = CLa * (1 - w) + CLs * w, CD = CDa * (1 - w) + CDs * w;
  return { CL, CD, G: CL / CD, CR: Math.hypot(CL, CD) };
}
// tabulated polar over the commanded trim band [xLo, xHi] (L/D monotone in x) and its inverse
export function makePolarTable(p) {
  const q = {}; for (const k of Object.keys(POLAR_DEF)) q[k] = p[k];
  const round = q.canopy === 'round';
  const xLo = round ? 0.03 : p.aLo, xHi = round ? 1 : p.aHi, step = round ? 0.005 : 0.25;
  const X = [], G = [];
  for (let x = xLo; x <= xHi + 1e-9; x += step) { X.push(x); G.push(polar(x, q).G); }
  const n = X.length, inc = G[n - 1] > G[0];
  const at = (x) => polar(x, q);
  const xForG = (g) => {
    // index space ordered by increasing G
    const gi = (k) => G[inc ? k : n - 1 - k], xi = (k) => X[inc ? k : n - 1 - k];
    if (g <= gi(0)) return xi(0);
    if (g >= gi(n - 1)) return xi(n - 1);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (gi(m) < g) lo = m; else hi = m; }
    const w = (g - gi(lo)) / (gi(hi) - gi(lo) || 1);
    return xi(lo) + (xi(hi) - xi(lo)) * w;
  };
  return { at, xForG, Gmax: Math.max(G[0], G[n - 1]), Gmin: Math.min(G[0], G[n - 1]), q, round, xLo, xHi,
    xLaunch: round ? 0.4 : p.aLaunch, xFilm: round ? 0.7 : 55 };
}

// ---------------------------------------------------------------- mass budget (shared component table)
export const FABRIC_GSM = 27;   // Porcher Skytex 27 (27 g/m², DHV paraglider parts lists; 32/38 are the heavier grades)
export const FABRIC_RATIO = 1.3; // fabric / nominal area: hems, radial tapes, vent-slot frames, reefing rings (ASSUMED)
export const SERVO_K2 = { g: 4, W: 0.15, zh: '4 g 微型舵机绞盘（拉 5–10 N 控制线）', en: '4 g micro servo-winch (5–10 N control line)', src: 'ASSUMED (4–5 g digital micro servo class); shared 2.5 g servo is too weak for 20–40 % of a 6–25 N line load (audit K2-02)' };
export function kiteBudget(S = 0.40, cellWh = 1.2) {
  const canopyG = S * FABRIC_RATIO * FABRIC_GSM;
  const cellG = (cellWh / BATTERY.whPerKgPack) * 1000;
  const kcuG = 6, lineG = 4, reefHwG = 3;
  const items = [['cam4k'], ['avionics'], [SERVO_K2, 3], ['wiring'], [{ g: cellG, W: 0 }]];
  const b = budget(items, canopyG + kcuG + lineG + reefHwG);
  const W = COMPONENTS.cam4k.W / BATTERY.boostEff + COMPONENTS.avionics.W + 3 * SERVO_K2.W;
  return {
    kg: b.gWithMargin / 1000, g: b.g, gWithMargin: b.gWithMargin, W,
    lines: [
      ['camera 4K (RunCam Thumb Pro class)', COMPONENTS.cam4k.g, COMPONENTS.cam4k.src],
      ['avionics FC/IMU/GNSS/radio', COMPONENTS.avionics.g, COMPONENTS.avionics.src],
      ['3 × servo-winch (trim, reef, steer)', 3 * SERVO_K2.g, SERVO_K2.src],
      ['wiring/boost/SD', COMPONENTS.wiring.g, COMPONENTS.wiring.src],
      [`cell ${cellWh} Wh @ ${BATTERY.whPerKgPack} Wh/kg`, +cellG.toFixed(1), 'components.js BATTERY'],
      [`canopy ${S} m² nominal × ${FABRIC_RATIO} × ${FABRIC_GSM} g/m²`, +canopyG.toFixed(1), 'Porcher Skytex 27 (27 g/m²) + hems/tapes/slot frames (ASSUMED ×1.3)'],
      ['KCU shell, 0.2 m carbon camera arm, funnel seat cone', kcuG, 'ASSUMED'],
      ['8 suspension lines 0.7 m, reefing line + rings, slot/flag lines', lineG, 'ASSUMED (Dyneema 0.5–0.8 mm)'],
      ['slot frames, reefing rings, dousing line, hi-vis flag hardware', reefHwG, 'audit2 A2-X-09 (omitted in iteration 2)'],
    ],
  };
}
const KB = kiteBudget();

// ---------------------------------------------------------------- defaults
// design 2 = K2-R (reefing steerable round drogue); 3 = same canopy without reefing (fixed area);
// 4 = soft wing on the honest polar flown actively in its untrimmed band (needs undemonstrated pitch stabilisation);
// 1 = light passive single-skin kite (fixed trim, no KCU, fixed line); 0 = round-1 A04 (300 g, L/D 4.4, 360 cam)
export const PDEF = {
  design: 2,
  mass: +KB.kg.toFixed(4), S: 0.40, rho: 1.0,
  ...POLAR_DEF,
  aLo: 15, aHi: 70, aLuff: 22.5, aBack: 75, aLaunch: 45, // wing only: commanded α band; luff (TN D-4672) / no-inflation (TN D-4182) boundaries
  rMin: 0.25, tauReef: 0.25, reefGloss: 0.5,      // skirt reefing: drag-area ratio 0.25 at reefing ratio ≈0.2 (Knacke / NASA Ares data), servo lag; HALF the glide lost at full reef (ASSUMED, no data; 0.3/0.7 sensitivities)
  CRflag: 0.15, CRpar: 0.8, CRcol: 0.5,
  tauA: 0.08, tauPitch: 0.12, Tslack: 0.15, tSlack: 0.3, tauReinfl: 0.5,
  Lst: 5, Lpark: 5, Lmax: 14, EA: 6000, kSnub: 400, snubStroke: 0.15, zeta: 0.3,
  Tref: 8, TrefMax: 14, Tret: 6, ThiMin: 14, ThiRatio: 1.35, Tlo: 1.0, Fslip: 30, vOut: 8, vIn: 4.5, vRet: 3.5, vRetWind: 1.5, tauW: 0.03, Ffree: 1.5, tDetect: 0.06,
  az: 15, azWide: 45, wideHalf: 4, el: 22, shotPlan: 1, tauCourse: 2.5, // station frame = rider course low-passed with tauCourse (longer → straighter kite path)
  tauSt: 0.06, kElI: 0.6, cpPhi: 4, cvPhi: 4, elGuard: 10, betaMin: 30, elRetCalm: 40, psiMax: 45,
  vLaunch: 3.5, vLaunchAir: 4, vFly: 2.6, vPark: 4.5, parkAtStop: 0, vMaxFilm: null, climbDisarm: 3,
  // exit: passive 2-axis gimballed telescopic carbon boom on the pack-top pod (5 sections, 0.24 m collapsed → 1.1 m),
  // aligned with the line by the line tension (τ ≈0.08 s taut, centring springs when slack); gimbal cone in the body
  // frame: ±110° about straight back, elevation −35…+80° (keeps the boom tip ≥0.95 m from the helmet centre). The KCU seats in a 45°
  // trumpet on the boom tip; the dousing sleeve is at the tip, so the canopy is snuffed BEFORE the boom retracts.
  mast: 0, mastTilt: 15, boom: 1.45, boomC: 0.26, boomRestEl: 40, boomAzMax: 110, boomElMin: -35, boomElMax: 80, tauBoom: 0.08, tauBoomSlack: 0.4, boomActive: 0, tauBoomAct: 0.02, pGimbal: 0,
  boomDBase: 3, boomDTip: 2.5, boomMass: 0.025, boomBreak: 5, // boom tube + tip trumpet/sleeve (kg) for contact inertia // tapered telescopic tube diameters (mm), counted as footage artefact
  tExtend: 0.8, funnelAcc: 45, headKeep: 0.25, tHand: 8, // tHand: reach back, take the KCU off the boom tip, snuff and stow by hand (ASSUMED task time)
  // KE management (iteration 3): heave-compensating winch feed-forward (1 = on) and a ground-speed governor
  hc: 1, Jgov: 11, Fgov: 2.0, decelRetrieve: 3.0, vRetFast: 5.5, aWinch: 20,
  // reefed launch and inflation: reef preset so the steady opening pull ≤ TLaunch; filling distance nFill·D0
  // (Knacke: 4–8 D0 for solid/slotted canopies, ASSUMED 6); opening-shock overshoot CkMax (infinite-mass case 1.5–2.0)
  TLaunch: 4, nFill: 6, CkMax: 1.8,
  // proximity sensing (rear radar/ToF, ASSUMED 4 m range, 0.2 s latency): clutch soft and climb while someone is near the line
  proxR: 4, proxLag: 0.2, dT: 0.5, // dT: 0.5 mm fluorescent Dyneema (≥1 px only within ≈1.5 m of the camera)
  // camera (KCU pod, 0.2 m side arm): 4K, 60° HFOV rectilinear, gyro EIS + post reframing
  camOff: 0.2, hfov: 45, camTilt: 2.5, cropFc: 1.5, nativeW: 3840, cam360: 0,
  // winch electrical
  // winch (round 4, audit3 A3-K2-04): a MOTORISED FISHING REEL instead of an ideal velocity source. The spool is held by
  // an anti-reverse one-way bearing and a servo-set friction DRAG (carbon drag-washer stack, as in a spinning reel): line
  // leaves the spool only by slipping the drag, i.e. pay-out is passive and instantaneous above the drag force (no
  // motor, no lag, no holding current); the motor only REELS IN, through the same drag. Drag set by a 4 g servo (τ 0.08 s,
  // 120 N/s), plus a solenoid quick-release to the free-spool level (τ 0.02 s) for the KE governor, contact and fall.
  // Static/dynamic friction ratio 1.15 (stick-slip). Motor: 2205-class 2300 KV FPV outrunner (≈30 g; Kt = 60/(2π·Kv)
  // = 4.15 mN·m/A, phase R ≈0.08 Ω, 25 A burst; catalogue class values, ASSUMED until a datasheet is fixed) through a
  // 3:1 planetary (η 0.85) onto a 12 mm spool, 3S Li-ion sagging to 10.8 V at −10 °C: reel-in speed capped by back-EMF
  // (no-load ≈10.4 m/s), force by current (≈22 N at 25 A), line acceleration by the rotor inertia (2.5e-6 kg·m² reflected
  // ×(g/r)² ≈0.16 kg); velocity loop τ 30 ms. Slipping spool (drag side) inertia ≈8 g line-equivalent.
  rDrum: 0.012, gear: 5, Kv: 2300, Rm: 0.08, Imax: 25, Vbat: 10.8, etaG: 0.85, Jrot: 2.5e-6, mDrum: 0.01, mSpool: 0.008, escEff: 0.9,
  tauDrag: 0.08, dragRate: 120, tauRelease: 0.02, muRatio: 1.15, kDragPay: 4,
  // reel-in feed-forward ESTIMATE of the exit motion toward the kite (pack IMU + boom encoders): first-order lag tauHC
  // and coloured noise sigHC (ASSUMED 40 ms, 0.3 m/s), then subject to every motor limit above (pay-out side is the drag)
  headGuard: 0, tauHC: 0.04, sigHC: 0.3, hcDead: 0.6, hcSlackT: 3, lenDead: 0.8,
  // in-flight sensing (audit3 A3-K2-06): KCU pitot/vane apparent wind and GNSS/IMU kite velocity with coloured noise
  // (ASSUMED σ 0.4 m/s per axis, τ 0.3 s) — the controller and the launch pitot check no longer see the true local wind
  sigVa: 0.4, tauVa: 0.3, sigVk: 0.2,
  packWh: 12, podWh: 1.2, pKite: +KB.W.toFixed(2), pPack: 0.6,
  tStow: 2.5,
};
// presets for the comparison designs (override the hardware above)
export const DESIGNS = {
  0: { mass: 0.30, S: 0.25, fixedCR: Math.hypot(0.8, 0.18), fixedG: 0.8 / 0.18, passive: 1, Lst: 8, cam360: 1, camOff: 0.15, mast: 0, boom: 0, hc: 0, Jgov: 999 },
  1: { canopy: 'wing', S: 0.32, fixedAlpha: 12, passive: 1, Lst: 7.5, camOff: 0.12, mast: 0, boom: 0, hc: 0, Jgov: 999 },
  2: {},
  3: { rMin: 1 },
  4: { canopy: 'wing', S: 0.32, rMin: 0.3, reefGloss: 0.35, mass: +kiteBudget(0.32 * 1.4 / 1.3).kg.toFixed(4) },
};
export const resolveP = (pIn) => {
  const p = { ...PDEF, ...pIn, ...(DESIGNS[(pIn.design ?? 2) | 0] || {}) };
  // governor speed from the ACTUAL flying mass (audit2: the iteration-2 cap came from the budget mass)
  p.vGov = keSpeedCap(p.mass, p.Jgov);
  if (p.vMaxFilm == null) p.vMaxFilm = +Math.min(keSpeedCap(p.mass, 14.9) - 2.0, p.vGov - 0.5).toFixed(2);
  return p;
};

// steady weightless equilibrium on the polar (closed form, design notes): cone angle and tension at area factor r
export function equilibrium(p, Va, alphaDeg, r = 1) {
  const pol = polar(alphaDeg, { ...POLAR_DEF, ...p }), q = 0.5 * p.rho * Va * Va;
  const F = q * p.S * r * pol.CR;
  return { tension: F, beta: Math.atan(pol.G) / D2R, G: pol.G, CR: pol.CR };
}
// steady elevation above the horizontal of a kite with weight, azimuth 0, on a slope (apparent wind blows up-slope)
export function steadyElevation(p, Va, alphaDeg, r = 1, slopeDeg = 15) {
  const pol = polar(alphaDeg, { ...POLAR_DEF, ...p }), q = 0.5 * p.rho * Va * Va;
  const gl = 1 - p.reefGloss * (p.rMin < 1 ? (1 - r) / (1 - p.rMin) : 0);
  const CL = pol.CL * gl, CD = pol.CD, F = q * p.S * r * Math.hypot(CL, CD);
  const ang = (slopeDeg + Math.atan(CL / CD) / D2R) * D2R;
  const fx = F * Math.cos(ang), fz = F * Math.sin(ang) - p.mass * G0;
  return { elev: Math.atan2(fz, fx) / D2R, tension: Math.hypot(fx, fz), F };
}
// minimum apparent wind at which the kite, unreefed at its most lifting trim, still holds ≥20° above the slope with ≥1 N line tension
const VMIN_CACHE = new Map();
export function vMinFly(p, slopeDeg = 15) {
  const key = [p.canopy, p.cd0r, p.gMaxR, p.porR, p.reefGloss, p.rMin, p.mass, p.S, p.rho, p.cla, p.a0, p.cd0, p.kInd, p.cd90, p.aStall, p.wStall, p.aLo, p.aHi, slopeDeg].join('|');
  if (VMIN_CACHE.has(key)) return VMIN_CACHE.get(key);
  const PT = makePolarTable(p);
  let out = NaN;
  outer: for (let Va = 1; Va < 20; Va += 0.05) {
    for (let k = 0; k <= 40; k++) { const a = PT.xLo + (PT.xHi - PT.xLo) * k / 40; const s = steadyElevation(p, Va, a, 1, slopeDeg); if (s.elev >= slopeDeg + 20 && s.tension >= 1) { out = +Va.toFixed(2); break outer; } }
  }
  VMIN_CACHE.set(key, out);
  return out;
}

// ---------------------------------------------------------------- rider
// smoothed body inclination (the shared model switches lean/crouch instantly at a hockey stop)
export function smoothBody(sk, tau = 0.15) {
  const c = sk.col, n = sk.n, k = 1 - Math.exp(-sk.sampleDt / tau);
  const lean = new Float64Array(n), crouch = new Float64Array(n);
  lean[0] = c.lean[0]; crouch[0] = c.crouch[0];
  for (let i = 1; i < n; i++) { lean[i] = lean[i - 1] + (c.lean[i] - lean[i - 1]) * k; crouch[i] = crouch[i - 1] + (c.crouch[i] - crouch[i - 1]) * k; }
  return { ...sk, col: { ...c, lean, crouch } };
}
export function applyHardFall(sk, tf, decel = 12) {
  const c = sk.col, dt = sk.sampleDt, i0 = Math.round(tf / dt);
  if (i0 >= sk.n) return sk;
  let v = c.v[Math.max(0, i0 - 1)], x = c.x[Math.max(0, i0 - 1)], y = c.y[Math.max(0, i0 - 1)];
  const psi = c.psi[i0], hx = c.hx[i0], hy = c.hy[i0];
  for (let i = i0; i < sk.n; i++) {
    v = Math.max(0, v - decel * dt); x += v * Math.cos(psi) * dt; y += v * Math.sin(psi) * dt;
    c.x[i] = x; c.y[i] = y; c.z[i] = -x * sk.tanS; c.v[i] = v; c.vx[i] = v * Math.cos(psi); c.vy[i] = v * Math.sin(psi);
    c.psi[i] = psi; c.hx[i] = hx; c.hy[i] = hy; c.lat[i] = 0; c.lean[i] = 0; c.lon[i] = v > 0 ? -decel : 0; c.crouch[i] = 1; c.fallen[i] = 1; c.plantL[i] = c.plantR[i] = 0;
  }
  return sk;
}

// Rider sampler from segments: [{ sk, t0 }] — segment k is active from its t0; between the end of a
// segment's motion and the next t0 the rider stands still. tGo: standing before the first segment.
export function makeRider(segs) {
  const off = [[0, 0]];
  for (let k = 1; k < segs.length; k++) {
    const a = segs[k - 1], e = a.sk.n - 1;
    off.push([off[k - 1][0] + a.sk.col.x[e], off[k - 1][1] + a.sk.col.y[e]]);
  }
  const tanS = segs[0].sk.tanS;
  return (t) => {
    let k = 0; while (k + 1 < segs.length && t >= segs[k + 1].t0) k++;
    const g = segs[k], lt = t - g.t0;
    const s = skierAt(g.sk, Math.max(0, lt));
    const o = off[k];
    s.pos = [s.pos[0] + o[0], s.pos[1] + o[1], -(s.pos[0] + o[0]) * tanS];
    if (lt < 0 || lt > g.sk.duration) { s.speed = 0; s.vel = [0, 0, 0]; s.accel = 0; s.lat = 0; s.plantL = s.plantR = 0; if (lt < 0) { s.lean = 0; s.crouch = 0.25; } }
    if (k > 0 && lt >= 0 && lt < 1.2) { // turn from the stopped stance to the new fall-line heading
      const prev = skierAt(segs[k - 1].sk, segs[k - 1].sk.duration), w = sstep(lt / 1.2);
      s.heading = nrm([prev.heading[0] * (1 - w) + s.heading[0] * w, prev.heading[1] * (1 - w) + s.heading[1] * w, 0]);
    }
    return s;
  };
}

// tether exit = dock funnel at the tip of the folding exit mast on the pack-top pod (model coords).
// The mast is tilted back by `tilt` in the body plane; mast = 0 → lid exit (round-1 / passive designs).
// It raises the line over the helmet (line height behind the rider, audit K2-04) and lifts the KCU out of
// the body wake at launch (K2-10), like SkySails' launch-and-recovery mast at micro scale.
export function mastAxis(s, b = bodyPoints(s), tilt = PDEF.mastTilt) {
  const back = [-s.heading[0], -s.heading[1], 0], ct = Math.cos(tilt * D2R), st = Math.sin(tilt * D2R);
  return nrm([b.up[0] * ct + back[0] * st, b.up[1] * ct + back[1] * st, b.up[2] * ct + back[2] * st]);
}
export function exitPoint(s, b = bodyPoints(s), mast = PDEF.mast, tilt = PDEF.mastTilt) {
  const back = [-s.heading[0], -s.heading[1], 0];
  const base = [b.packTop[0] + b.up[0] * 0.07 + back[0] * 0.05, b.packTop[1] + b.up[1] * 0.07 + back[1] * 0.05, b.packTop[2] + b.up[2] * 0.07];
  if (!mast) return base;
  return add(base, mul(mastAxis(s, b, tilt), mast));
}

// ---- self-aligning boom (iteration 3). Pivot on the pod lid at the pack top; body frame: h = heading, l = left,
// u = inclined body up (bodyPoints). Directions are clamped to the gimbal cone (azimuth about straight back,
// elevation above the body's horizontal plane) so the boom can never swing into the head zone.
export function boomPivot(s, b = bodyPoints(s)) {
  const back = [-s.heading[0], -s.heading[1], 0];
  return [b.packTop[0] + b.up[0] * 0.07 + back[0] * 0.05, b.packTop[1] + b.up[1] * 0.07 + back[1] * 0.05, b.packTop[2] + b.up[2] * 0.07];
}
const bodyFrame = (s, b) => { const u = nrm(b.up); const h = nrm(cross(b.left, u)); const l = cross(u, h); return { h, l, u }; }; // orthonormal (bodyPoints' left is not ⟂ the inclined up)
export function boomDirFromAE(s, b, azDeg, elDeg) {
  const F = bodyFrame(s, b), ce = Math.cos(elDeg * D2R), se = Math.sin(elDeg * D2R), ca = Math.cos(azDeg * D2R), sa = Math.sin(azDeg * D2R);
  return nrm([-F.h[0] * ce * ca + F.l[0] * ce * sa + F.u[0] * se, -F.h[1] * ce * ca + F.l[1] * ce * sa + F.u[1] * se, -F.h[2] * ce * ca + F.l[2] * ce * sa + F.u[2] * se]);
}
export function boomRest(s, b = bodyPoints(s), p = PDEF) { return boomDirFromAE(s, b, 0, p.boomRestEl); }
// clamp a direction into the gimbal cone; returns { dir, out } (out = angle in degrees the input lies outside the cone)
export function boomClamp(dir, s, b, p = PDEF, sideRef = null) {
  const F = bodyFrame(s, b), d = nrm(dir);
  const x = -dot(d, F.h), y = dot(d, F.l), z = dot(d, F.u);
  let el = Math.asin(clamp(z, -1, 1)) / D2R, az = Math.atan2(y, x) / D2R;
  // a target ahead of the rider (|az| > limit): stay on the side the boom is already on (no flip through the front)
  if (sideRef && Math.abs(az) > p.boomAzMax) { const sr = dot(sideRef, F.l); if (sr * az < 0) az = -az; }
  const elC = clamp(el, p.boomElMin, p.boomElMax), azC = clamp(az, -p.boomAzMax, p.boomAzMax);
  if (elC === el && azC === az) return { dir: d, out: 0 };
  const dc = boomDirFromAE(s, b, azC, elC);
  return { dir: dc, out: Math.acos(clamp(dot(dc, d), -1, 1)) / D2R };
}

// body capsules [p, q, r, name] (silhouette for the tether artefact; proximity)
export function bodyCapsules(s, b = bodyPoints(s)) {
  const h = s.heading, l = b.left, u = b.up;
  const P = (o, f, ll, uu) => [o[0] + h[0] * f + l[0] * ll + u[0] * uu, o[1] + h[1] * f + l[1] * ll + u[1] * uu, o[2] + h[2] * f + l[2] * ll + u[2] * uu];
  const shC = P(b.chest, 0, 0, 0.16);
  const caps = [[b.head, b.head, 0.14, 'head'], [b.pelvis, shC, 0.18, 'torso'], [b.packMid, b.packTop, 0.13, 'pack']];
  for (const sg of [1, -1]) {
    caps.push([P(b.pelvis, 0, sg * 0.1, 0), P(b.feet, 0, sg * 0.1, 0.05), 0.09, 'leg']);
    caps.push([P(shC, 0, sg * 0.2, 0), P(b.pelvis, 0.36, sg * 0.31, 0.16), 0.06, 'arm']);
  }
  return caps;
}

// Local wrapper kept for explicit one-shot discrete gusts (common/env.js now has a one-shot envelope too;
// applying it here keeps scenario gust timing identical whatever the shared default becomes).
export function gustWind(o) {
  const base = makeWind({ ...o, gustAt: null });
  if (o.gustAt == null) return base;
  const rise = o.gustRise ?? 0.8, hold = o.gustHold ?? 2, g = o.gust || [0, 0, 0];
  return (t, p) => {
    const w = base(t, p), u = t - o.gustAt;
    if (u <= 0 || u >= 2 * rise + hold) return w;
    const e = u < rise ? 0.5 - 0.5 * Math.cos((Math.PI * u) / rise) : u < rise + hold ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (u - rise - hold)) / rise);
    return [w[0] + g[0] * e, w[1] + g[1] * e, w[2] + g[2] * e];
  };
}

// ---------------------------------------------------------------- core
// Mode codes
export const MODE = { DOCKED: 0, LAUNCH: 1, FILM: 2, PARK: 3, RETRIEVE: 4, FLAGDOCK: 5, STOW: 6, FREE: 7, LANDED: 8, FAILRET: 9, EXTEND: 10 };
const FLYING = new Set([1, 2, 3, 4, 5, 7, 9]);
export const isFlyingMode = (m) => FLYING.has(m);

// input: { duration, rider(t), tanS, wind, plan: { start, armAt, stowAt, shot(t)→{az,el}, kcuFailAt, winchFailAt, cutAt,
//          branch:{x,yc,half,h}, cross:{t,x,vy,y0,h} }, dt }
export function runCore(pIn, input) {
  const p = resolveP(pIn);
  const PT = makePolarTable(p);
  const dt = input.dt || 0.001, SDT = 0.02, every = Math.round(SDT / dt);
  const n = Math.floor(input.duration / SDT + 1e-9) + 1;
  const rider = input.rider, tanS = input.tanS;
  const plan = input.plan || {};
  const O = {};
  for (const k of ['Fd', 'slip', 'nuSh', 'Iw', 'bx', 'bdx', 'bdy', 'bdz', 'px', 'py', 'pz', 'T50', 'gov', 'nuHC', 'prox', 'kx', 'ky', 'kz', 'kvx', 'kvy', 'kvz', 'ax', 'ay', 'az', 'T', 'Tmax', 'L', 'nu', 'Fm', 'psi', 'G', 'CR', 'alpha', 'aEff', 'reef', 'col', 'Va', 'infl', 'mode', 'azK', 'elK', 'azT', 'elT', 'wx', 'wy', 'wz', 'ex', 'ey', 'ez', 'sx', 'sy', 'sz', 'snag', 'Pw', 'Pk', 'Ereg', 'flag', 'nbY', 'cx', 'cy', 'brake', 'armed']) O[k] = new Float64Array(n).fill(NaN);
  const events = [];
  const ev = (t, type, severity, zh, en) => events.push({ t: +t.toFixed(3), type, severity, zh, en });
  const passive = !!p.passive, fixedCoef = p.fixedCR != null;
  const reefRange = p.rMin < 1 ? 1 - p.rMin : 1;
  const gloss = (r) => 1 - p.reefGloss * (p.rMin < 1 ? (1 - r) / reefRange : 0);

  // ---- rider samples on the 20 ms grid (+ boom pivot / legacy exit point and the boom rest axis)
  let t = 0;
  const useBoom = p.boom > 0;
  const RS = [], RB = [], RA = [], RX = [];
  for (let i = 0; i < n + 1; i++) { const si = rider(i * SDT), bi = bodyPoints(si); RS.push(si); RB.push(bi); RA.push(useBoom ? boomPivot(si, bi) : exitPoint(si, bi, p.mast, p.mastTilt)); RX.push(useBoom ? boomRest(si, bi, p) : p.mast ? mastAxis(si, bi, p.mastTilt) : bi.up); }
  let s = RS[0], b = RB[0], A = RA[0].slice();
  // boom state: direction bd (unit), extension bx ∈ [0,1]; tip = pivot + bd·(boomC + (boom − boomC)·bx)
  let bd = RX[0].slice(), bx = 0, Aprev = null, Pp = RA[0].slice();
  const boomLen = () => (useBoom ? p.boomC + (p.boom - p.boomC) * bx : 0);
  // wind gates/interlocks use the shared worn estimate (10 s trailing mean, seeded ±1 m/s bias, 0.5 s lag)
  const windTrue = gustWind(input.wind || {});
  const wEstF = windEstimate(windTrue, (tt) => { const si = RS[Math.min(n, Math.max(0, Math.round(tt / SDT)))]; return [si.pos[0], si.pos[1], si.pos[2] + 2]; }, { seed: input.wind?.seed ?? 1 });
  let wEst = [0, 0, 0], wEstT = -1;
  // raw 50 ms moving mean of the line tension at the integration step (body force, audit2 A2-K2-03)
  const n50 = Math.max(1, Math.round(0.05 / dt)), ring50 = new Float64Array(n50); let k50 = 0, sum50 = 0, T50max = 0;
  let headGuardN = 0, vaMeasN = [0, 0, 0], Fd = p.Fslip, slip = 0, nuSh = 0, hcEst = 0, vGest = 0;
  const KeM = 60 / (2 * Math.PI * p.Kv), fPerA = KeM * p.gear / p.rDrum, mW = p.Jrot * (p.gear / p.rDrum) ** 2 + p.mDrum;
  const nzSeed = ((input.wind?.seed ?? 1) * 7919 + 17) >>> 0, nzHC = colouredNoise(nzSeed + 1, 0.05), nzVk = colouredNoise(nzSeed + 2, 0.1), nzVa = colouredNoise(nzSeed + 3, p.tauVa), nzTip = colouredNoise(nzSeed + 4, 0.3);
  let gov = false, govN = 0, govT = 0, nuHC = 0, prox = false, proxT = -1, proxN = 0, launchT0 = -1, reefLaunch = 1, tLaunchStart = -1, landedRiding = 0, ckNow = 1, gDir = null, nuS = 0, coneOut = 0, coneOutL = 0, coneOutT = 0, launchLock = 0, ovf = false, ovfN = 0, ovfBack = 0, accS = 0, VaF = 0, boomHit = null;
  let course = s.speed > 0.5 ? nrm([s.vel[0], s.vel[1], 0]) : nrm([s.heading[0], s.heading[1], 0]);
  let mode = plan.start === 'flying' || passive ? MODE.FILM : MODE.DOCKED;
  let K, Vk;
  const backOf = (c) => [-c[0], -c[1], 0];
  const leftOf = (c) => [-c[1], c[0], 0];
  const dirAE = (az, el, c) => { const bb = backOf(c), ll = leftOf(c), ca = Math.cos(el * D2R); return nrm([ca * (Math.cos(az * D2R) * bb[0] + Math.sin(az * D2R) * ll[0]), ca * (Math.cos(az * D2R) * bb[1] + Math.sin(az * D2R) * ll[1]), Math.sin(el * D2R)]); };
  if (plan.start === 'park') {
    mode = MODE.PARK; const wd = nrm([(input.wind?.mean || [1, 0, 0])[0], (input.wind?.mean || [1, 0, 0])[1], 0]);
    K = add(A, mul(nrm([wd[0] * 0.57, wd[1] * 0.57, 0.82]), p.Lpark)); Vk = [0, 0, 0];
  } else if (mode === MODE.FILM) {
    const sh = plan.shot ? plan.shot(0) : { az: p.az, el: p.el };
    const e0 = passive ? dirAE(0, 70, course) : dirAE(sh.az, sh.el + Math.atan(tanS) / D2R * Math.cos(sh.az * D2R), course);
    K = add(A, mul(e0, p.Lst)); Vk = s.vel.slice();
  } else { K = A.slice(); Vk = s.vel.slice(); }
  const startAir = mode === MODE.FILM || mode === MODE.PARK;
  if (useBoom && startAir) { bx = 1; const P0 = RA[0]; bd = boomClamp(nrm(sub(K, P0)), RS[0], RB[0], p).dir; A = add(P0, mul(bd, boomLen())); const e = nrm(sub(K, P0)); K = add(A, mul(e, Math.max(1, len(sub(K, A))))); }
  let L = startAir ? len(sub(K, A)) - 0.012 : 0, nu = 0, psi = 0, infl = startAir ? 1 : 0;
  let alpha = passive ? (p.fixedAlpha ?? 12) : startAir ? PT.xFilm : PT.xLaunch, reef = startAir && !passive ? 0.5 : 1;
  let G = fixedCoef ? p.fixedG : PT.at(alpha).G, CR = fixedCoef ? p.fixedCR : PT.at(alpha).CR;
  let flag = 0, dPrev = len(sub(K, A)), Iel = 0, Itn = 0, azPrev = null, azRate = 0, elPrev = null, eaW = [-1, 0, 0], eaLag = null;
  let w = windTrue(0, K), Fm = 0, T = 0, Tmax = 0, Tbar = p.Tref, Ereg = 0, Ew = 0;
  let launchOK = 0, inhibitT = 0, lowVa = 0, slackT = 0, stowT = 0, stowReq = false, armed = plan.armAt != null ? false : true, zRef = null;
  let fallFlag = false, snagOff = 0, snag = null, snagged = false, lineAttached = true, releasedAtPack = false, kcuFailed = false, winchFailed = false, freeSpool = false, snagT = -1;
  let relift = 0, retries = 0, prevBelow = null, crossDone = false, crossHold = 0, approachHigh = 0, fastDock = false, giveUp = false;
  let collapsed = false, nCollapse = 0, tCollapsed = 0, colCause = { luff: 0, backfly: 0, slack: 0 };
  let dockAxisAngle = NaN, dockSpeed = NaN, dockClear = NaN, docks = 0, launches = 0, manual = 0, inhibits = 0;
  const dockInfo = { dockT: [], stowT: [], launchT: [], stationT: [], retrieveT: [], err: [], clear: [], manualT: [] };
  let wasModeT = 0;
  const snowZ = (x) => -x * tanS;
  const slopeDeg = Math.atan(tanS) / D2R;
  const D0 = Math.sqrt((4 * p.S) / Math.PI);
  const vMinA = passive ? 3 : vMinFly(p), vLaunchGate = Math.max(p.vLaunchAir, 1.6 * vMinA + 1.0);
  let pod = 0, step = 0;
  const dg = { azK: NaN, elK: NaN, azT: NaN, elT: NaN, Va: NaN, er: null, aEff: NaN };

  const setMode = (m) => { if (m === mode) return; mode = m; wasModeT = t; };
  let erLock = [0, 0, 1], AvS = [0, 0, 0], gi = 0;
  // helmet clearance of the straight haul-in path (kite → boom tip)
  const pathClear = () => { const h = b.head; const d = segPoint(A, K, h); return d - 0.14; };
  // approach planner (audit K2-06 / A2-K2-02): the boom aligns itself with the line, so the KCU arrives ON the boom
  // axis whenever the line is inside the gimbal cone; the 45° trumpet only has to take the residual angle. Haul in
  // when the residual is inside the trumpet AND the haul path keeps the helmet keep-out; otherwise climb and retry;
  // finally give up safely (flag, land, reel the rag in over the snow; hand-stow only if it still arrives outside).
  let manualDock = false;
  const tryDock = (failSafe = false) => {
    const er = nrm(sub(K, A)), ax = useBoom ? bd : RX[gi];
    const ang = Math.acos(clamp(dot(er, ax), -1, 1)) / D2R, clr = pathClear();
    const calmStop = len([wEst[0], wEst[1], 0]) < 2.5 && s.speed < 1;
    const inCone = ang <= p.funnelAcc, safe = clr >= p.headKeep;
    if (inCone && safe) {
      erLock = er; dockAxisAngle = ang; dockSpeed = Math.abs(nu); dockClear = clr; L = len(sub(K, A)); setMode(MODE.FLAGDOCK);
      ev(t, 'flag', 'info', `最后 ${L.toFixed(1)} m：伞衣旗化，控制单元沿绳滑上臂杆端喇叭口（剩余偏角 ${ang.toFixed(0)}°，离头盔 ${clr.toFixed(2)} m）`, `Final ${L.toFixed(1)} m: canopy flagged, the KCU slides down the line onto the boom-tip trumpet (${ang.toFixed(0)}° residual, ${clr.toFixed(2)} m from the helmet)`);
      return;
    }
    if (safe && (failSafe || (calmStop && retries >= 1))) {
      // calm/fail-safe: the rag is hauled to the boom tip from outside the trumpet and seated by hand
      erLock = er; dockAxisAngle = ang; dockSpeed = Math.abs(nu); dockClear = clr; L = len(sub(K, A)); setMode(MODE.FLAGDOCK); manual++; manualDock = true; dockInfo.manualT.push(t);
      ev(t, 'manualStow', 'warning', `回收：控制单元以 ${ang.toFixed(0)}° 从喇叭口外到达，需手动放入（+1 操作，手动 ${p.tHand} s）`, `Haul-in: the KCU arrives ${ang.toFixed(0)}° outside the trumpet and must be seated by hand (+1 action, ${p.tHand} s hand time)`);
      return;
    }
    if (retries < 3) {
      retries++; approachHigh = 1;
      ev(t, 'redock', 'warning', inCone ? `收回路径离头盔仅 ${clr.toFixed(2)} m（<${p.headKeep} m）：放线到 2.5 m，抬高后重试` : `剩余偏角 ${ang.toFixed(0)}° 在喇叭口外：放线到 2.5 m，抬高后重试`, inCone ? `Haul path only ${clr.toFixed(2)} m from the helmet (<${p.headKeep} m): pay out to 2.5 m, climb and retry` : `Residual ${ang.toFixed(0)}° outside the trumpet: pay out to 2.5 m, climb and retry`);
      return;
    }
    giveUp = true;
    ev(t, 'giveUp', 'warning', '三次重试失败：风筝旗化落在雪面，绞盘把伞衣拖回臂杆端', 'Three retries failed: the kite flags and lands on the snow; the winch reels the rag back to the boom tip');
  };


  for (let i = 0; i < n; ) {
    // ---- rider and anchor (20 ms grid, exit point linearly interpolated)
    gi = Math.min(n - 1, Math.floor(t / SDT + 1e-9)); const gw = t / SDT - gi;
    s = RS[gi]; b = RB[gi];
    const A0 = RA[gi], A1 = RA[Math.min(n - 1, gi + 1)];
    const Pn = [A0[0] + (A1[0] - A0[0]) * gw, A0[1] + (A1[1] - A0[1]) * gw, A0[2] + (A1[2] - A0[2]) * gw];
    let Av;
    if (useBoom) {
      // passive gimbal: the line tension swings the boom onto the line (first order, τ 0.08 s); slack → centring springs
      const dockedish = mode === MODE.DOCKED || mode === MODE.STOW || mode === MODE.EXTEND;
      const taut = !dockedish && T > 0.8 && L > 0.05;
      const viaP = snagged && snag ? snag : K;
      // ACTIVE stabilised 2-axis gimbal (iteration 3, footage): while a kite is out on a taut line the boom is pointed at
      // the kite CAMERA (KCU + camOff side arm), so from the camera the boom is seen end-on (a ≤3 px dot) instead of a
      // 10–20 px stub; the line passes the tip ring within <1°. Passive fallback: aligns with the line (τ 0.08 s).
      let tgt = RX[gi];
      if (taut && mode !== MODE.LANDED) {
        if (p.boomActive && !snagged && mode !== MODE.FLAGDOCK) { const side = nrm(cross(nrm(sub(K, Pn)), [0, 0, 1])); tgt = nrm(sub(add(add(K, mul(side, p.camOff)), [0, 0, -0.03]), Pn)); }
        else tgt = nrm(sub(viaP, Pn));
      }
      const cl = boomClamp(tgt, s, b, p, bd);
      const coneRaw = !dockedish && len(sub(viaP, Pn)) > 1.5 ? boomClamp(nrm(sub(viaP, Pn)), s, b, p, bd).out : 0;
      coneOut = mode !== MODE.LANDED ? coneRaw : 0; coneOutL = mode === MODE.LANDED ? coneRaw : 0;
      // passive (round 4): a free-pivoting slender boom in tension is a pendulum restored by the line, ω = √(3T/(m·ℓ));
      // the gimbal's viscous damper makes it ≈critically damped → first-order equivalent τ ≈ 2/ω (0.07 s at 8 N, 0.14 s at 2 N)
      const tauB = p.boomActive && taut ? p.tauBoomAct : taut ? Math.max(0.04, 2 / Math.sqrt(3 * Math.max(T, 0.5) / (p.boomMass * Math.max(0.3, boomLen())))) : p.tauBoomSlack;
      const bNew = nrm(add(bd, mul(sub(cl.dir, bd), 1 - Math.exp(-dt / tauB))));
      const dAng = Math.acos(clamp(dot(bNew, bd), -1, 1)), maxA = (p.boomActive ? 6 : 20) * dt;
      if (dAng > maxA) { let ax = sub(bNew, mul(bd, Math.cos(dAng))); ax = len(ax) > 1e-9 ? nrm(ax) : bNew; bd = nrm(add(mul(bd, Math.cos(maxA)), mul(ax, Math.sin(maxA)))); } else bd = bNew;
      // (no instantaneous re-clamp: the body frame steps on the 20 ms grid; the slew-limited boom follows the clamped target)
      A = add(Pn, mul(bd, boomLen()));
      Av = Aprev ? mul(sub(A, Aprev), 1 / dt) : mul(sub(A1, A0), 1 / SDT);
      Aprev = A.slice(); Pp = Pn;
    } else {
      A = Pn; Pp = Pn;
      Av = mul(sub(A1, A0), 1 / SDT);
    }
    AvS = Av;
    if (t - wEstT >= 0.5) { wEst = wEstF(t); wEstT = t; }
    if (s.speed > 1.0) { const vd = nrm([s.vel[0], s.vel[1], 0]); const k = 1 - Math.exp(-dt / p.tauCourse); course = nrm(add(course, mul(sub(vd, course), k))); }
    if (step % 10 === 0) w = windTrue(t, mode === MODE.DOCKED || mode === MODE.STOW || mode === MODE.EXTEND ? A : K);

    // ---- plan events
    if (plan.armAt != null && !armed && t >= plan.armAt && zRef == null) { armed = true; zRef = s.pos[2]; ev(t, 'arm', 'info', '肩带按键：武装（下滑且雪面振动时才会自动起飞）', 'Strap tap: armed (launches only while descending on snow)'); }
    if (armed) {
      // launch interlock (audit K2-03): any climb of >3 m (chairlift, T-bar, gondola) disarms
      if (zRef == null) zRef = s.pos[2];
      zRef = Math.min(zRef, s.pos[2]);
      if (s.pos[2] - zRef > p.climbDisarm) { armed = false; ev(t, 'disarm', 'info', `爬升 ${p.climbDisarm} m（缆车/拖牵）：自动解除武装，山顶需再按一次`, `Climbed ${p.climbDisarm} m (chairlift/T-bar): auto-disarmed; one tap at the top re-arms`); }
    }
    if (plan.stowAt != null && !stowReq && t >= plan.stowAt) { stowReq = true; ev(t, 'stowcmd', 'info', '按键：收回并收纳', 'Tap: retrieve and stow'); }
    if (plan.kcuFailAt != null && !kcuFailed && t >= plan.kcuFailAt) { kcuFailed = true; ev(t, 'kcuFail', 'warning', '风筝控制单元执行器失效 → 失效保护：前组吊带弹簧释放，伞翼“旗化”', 'KCU actuator failure → fail-safe: front-riser spring releases, canopy flags'); if (FLYING.has(mode)) setMode(MODE.FAILRET); }
    if (plan.winchFailAt != null && !winchFailed && t >= plan.winchFailAt) { winchFailed = true; ev(t, 'winchFail', 'warning', '绞盘电机失效 → 失效保护弹簧刹车锁住卷筒（打滑离合仍在 30 N）', 'Winch motor failure → fail-safe spring brake locks the drum (slip clutch still at 30 N)'); }
    if (plan.cutAt != null && lineAttached && t >= plan.cutAt) { lineAttached = false; ev(t, 'cut', 'warning', '系留绳在背包出口处断开 → 风筝检测零张力，张开成降落伞下降', 'Tether cut at the pack exit → the kite senses zero tension and opens as a parachute'); setMode(MODE.FREE); }

    if (s.fallen && !fallFlag && FLYING.has(mode) && mode !== MODE.FREE) { fallFlag = true; ev(t, 'fall', 'warning', '检测到摔倒（背包 IMU）：风筝立即旗化，绞盘松放，风筝落在后方，不收向倒地的人', 'Fall detected (pack IMU): the kite flags at once, the winch free-spools, and it drops behind — never reeled towards a tumbling rider'); }
    const aliveLine = lineAttached && !releasedAtPack;
    const ksp = s.speed;
    // ================= docked / stowing / boom extending
    if (mode === MODE.DOCKED || mode === MODE.STOW || mode === MODE.EXTEND) {
      if (mode === MODE.DOCKED) bx = 0;
      else if (mode === MODE.STOW) bx = t - stowT < 1.0 ? 1 : 1 - sstep((t - stowT - 1.0) / 1.2); // snuff at the tip (1 s), then retract (1.2 s), lid (0.3 s)
      else bx = sstep((t - launchT0) / p.tExtend);
      if (!useBoom) bx = 0;
      K = mode === MODE.DOCKED ? Pp.slice() : A.slice(); Vk = Av; L = 0; nu = 0; slip = 0; nuSh = 0; T = 0; Fm = 0; infl = 0; flag = 0; collapsed = false;
      if (mode === MODE.STOW && t - stowT >= p.tStow) { setMode(MODE.DOCKED); dockInfo.stowT.push(t); ev(t, 'stowed', 'info', '收纳完成：伞衣在臂杆端的收卷套内被收拢，臂杆缩回折下，舱盖关闭', 'Stowed: canopy snuffed into the sleeve at the boom tip, boom retracted and folded, lid closed'); }
      // launch gate on the worn wind ESTIMATE (shared rule): apparent wind = estimated wind − rider velocity
      const vaE = sub(wEst, s.vel), vaDock = len(vaE);
      const fromFront = vaDock > 0.1 && dot(vaE, [-s.heading[0], -s.heading[1], 0]) > 0.5 * vaDock; // apparent wind from ahead (±60°)
      const descending = s.vel[2] < -0.3, onSnow = !s.onLift;
      // apparent-wind launch gate: ≥1.4 × the minimum flying airspeed + the 1 m/s estimate bias (tailwind ≈ rider speed: no launch)
      const moving = ksp > p.vLaunch && vaDock > vLaunchGate && fromFront;
      const ready = mode === MODE.DOCKED && t >= launchLock && !stowReq && !kcuFailed && !winchFailed && lineAttached && !passive && ksp < p.vMaxFilm - 1.5 && !(s.accel < -p.decelRetrieve);
      if (ready && armed && moving && descending && onSnow) launchOK += dt; else launchOK = 0;
      if (ready && moving && !(armed && descending && onSnow)) { inhibitT += dt; if (inhibitT > 0.5 && inhibitT - dt <= 0.5) { inhibits++; ev(t, 'inhibit', 'info', `起飞联锁：${!armed ? '未武装' : !onSnow ? '无雪面振动（缆车）' : '未在下降'} → 不起飞`, `Launch interlock: ${!armed ? 'not armed' : !onSnow ? 'no on-snow vibration (lift)' : 'not descending'} → no launch`); } } else inhibitT = 0;
      if (launchOK > 0.3) {
        launches++; dockInfo.launchT.push(t); launchOK = 0;
        if (useBoom) { setMode(MODE.EXTEND); launchT0 = t; ev(t, 'launch', 'info', '自动起飞：伸缩臂杆弹出到 1.1 m（伞衣仍在臂端收卷套内），到位后放伞在相对风中充气', 'Auto launch: the telescopic boom springs out to 1.1 m (canopy still in its sleeve at the tip), then releases the canopy into the apparent wind'); }
        else { setMode(MODE.LAUNCH); ev(t, 'launch', 'info', '自动起飞：伞翼在相对风中充气', 'Auto launch: the canopy inflates in the apparent wind'); }
      }
      if (mode === MODE.EXTEND && t - launchT0 >= p.tExtend) {
        // the KCU pitot at the extended boom tip must confirm the launch airspeed before the canopy is released
        const vaTip = Math.max(0, len(sub(w, Av)) + p.sigVa * nzTip(0.02)[0]); // tip pitot reading (coloured noise, audit3 A3-K2-06)
        if (vaTip < vLaunchGate) { setMode(MODE.STOW); stowT = t - 1.0; launchLock = t + 5; ev(t, 'abort', 'info', `臂杆端空速 ${vaTip.toFixed(1)} m/s < ${vLaunchGate.toFixed(1)} m/s：不放伞，臂杆收回（5 s 后再试）`, `Tip airspeed ${vaTip.toFixed(1)} m/s < ${vLaunchGate.toFixed(1)} m/s: canopy kept in, boom retracts (retry after 5 s)`); }
        else if (ksp < 3 || stowReq || s.accel < -p.decelRetrieve) { setMode(MODE.STOW); stowT = t - 1.0; ev(t, 'abort', 'info', '放伞前减速：臂杆收回', 'Slowing before release: boom retracts'); }
        else setMode(MODE.LAUNCH);
      }
      if (mode === MODE.LAUNCH) {
        const e0 = useBoom ? nrm(add(bd, mul(backOf(course), 0.3))) : nrm(add(add(backOf(course), mul(RX[gi], 1.2)), [0, 0, 0.3]));
        K = add(A, mul(e0, 0.3)); Vk = Av.slice(); L = 0.31; dPrev = len(sub(K, A)); nu = 0; eaW = nrm(sub(w, Av)); eaLag = null; azPrev = null; elPrev = null; approachHigh = 0; retries = 0; giveUp = false;
        // reefed launch: the reefing line is preset from the pitot reading at the tip so the steady opening pull ≤ TLaunch
        const qL = 0.5 * p.rho * Math.max(1, dot(sub(w, Av), sub(w, Av))) * p.S * (fixedCoef ? p.fixedCR : PT.at(PT.xHi).CR);
        infl = 0.05; psi = 0; alpha = PT.xLaunch; reef = passive ? 1 : clamp(p.TLaunch / qL, p.rMin, 1); reefLaunch = reef; Iel = 0; Itn = 0; collapsed = false; tLaunchStart = t;
      }
    } else {
      // ================= airborne / on snow
      const sh = plan.shot ? plan.shot(t) : { az: p.az, el: p.el };
      const brakingNow = s.accel < -p.decelRetrieve && ksp > 1.5 && ksp < 12; // hockey stop / hard braking (pack IMU)
      // elevation target above the local slope plane, capped at 55° above the horizontal (but ≥18° above a steep slope)
      // the commandable azimuth shrinks with the apparent wind (window width ∝ glide authority): beyond ±az the command is
      // scaled by the kite's own 2 s-mean airspeed (pitot), full width only at ≥12 m/s
      VaF += ((Number.isFinite(dg.Va) ? dg.Va : 0) - VaF) * (1 - Math.exp(-dt / 2));
      const azAuth = clamp((VaF - 7) / 5, 0, 1);
      let azT = Math.abs(sh.az) > p.az ? Math.sign(sh.az) * (p.az + (Math.abs(sh.az) - p.az) * azAuth) : sh.az;
      let elT = Math.min(sh.el + slopeDeg * Math.cos(azT * D2R), Math.max(55, slopeDeg + 18));
      let cFrame = course;
      const ambient = len([wEst[0], wEst[1], 0]); // gate decisions on the worn wind estimate (shared rule)
      if (prox) elT = Math.min(elT + 10, 65); // someone near the line: climb (raises the line near the body)
      if (mode === MODE.PARK) { const wd = nrm([wEst[0], wEst[1], 0]); cFrame = [-wd[0], -wd[1], 0]; azT = 0; elT = 55; }
      if (mode === MODE.LAUNCH) azT = sh.az * sstep((t - wasModeT) / 3);
      // elevation the polar can actually reach (iteration 3, honest L/D): cone angle atan(L/D at the current reef, the
      // loop may open the reef by 0.25) about the apparent wind at the exit, minus the weight sag — never command more
      if (!passive && (mode === MODE.FILM || mode === MODE.LAUNCH)) {
        const gF = (fixedCoef ? p.fixedG : PT.Gmax) * gloss(Math.min(1, reef + 0.25));
        const elF = Math.asin(clamp(eaW[2], -1, 1)) / D2R + Math.atan(gF) / D2R - 0.6 * Math.atan((p.mass * G0) / Math.max(2, Tbar)) / D2R;
        elT = Math.min(elT, Math.max(slopeDeg + 8, elF - 2));
      }
      if (mode === MODE.RETRIEVE || mode === MODE.FLAGDOCK || mode === MODE.FAILRET) { azT = 0; elT = (approachHigh ? 60 : 45) + slopeDeg * (approachHigh ? 0 : 1); if (ksp < 1 && ambient > 2) { const wd = nrm([wEst[0], wEst[1], 0]); cFrame = [-wd[0], -wd[1], 0]; } }
      // tether geometry (optionally through a snag point)
      const via = snagged ? snag : A;
      const rr = sub(K, via), dK = len(rr), er = mul(rr, 1 / (dK || 1));
      const dTot = snagged ? len(sub(snag, A)) + dK : dK;
      // tension (Kelvin–Voigt), only when taut and attached
      if (mode === MODE.LANDED) {
        T = 0; // set by the towed-rag model below
      } else if (mode === MODE.FLAGDOCK) {
        const vr = sub(w, Vk); T = 0.5 * p.rho * dot(vr, vr) * p.S * p.CRflag + p.mass * G0 * Math.max(0, er[2]);
      } else if (aliveLine && mode !== MODE.FREE) {
        // line (EA/L) in series with a 0.15 m bungee snubber at the KCU (kSnub, ASSUMED): soft until the stroke is used
        const x = dTot - L, kk = p.EA / Math.max(L, 0.3), xs = p.snubStroke;
        const kEff = x < xs ? p.kSnub : kk;
        const cc = 2 * p.zeta * Math.sqrt(kEff * p.mass);
        const dDot = (dTot - dPrev) / dt;
        T = x > 0 ? Math.max(0, (x < xs ? p.kSnub * x : p.kSnub * xs + kk * (x - xs)) + cc * (dDot - nu)) : 0;
      } else T = 0;
      dPrev = dTot;
      if (T > Tmax) Tmax = T;
      Tbar += (T - Tbar) * (1 - Math.exp(-dt / 2));
      // aero
      const va = sub(w, Vk), Va = len(va) || 1e-6, ea = mul(va, 1 / Va), q = 0.5 * p.rho * Va * Va;
      let eL0 = sub(er, mul(ea, dot(er, ea))); const l0 = len(eL0); eL0 = l0 > 1e-6 ? mul(eL0, 1 / l0) : [0, 0, 1];
      const es = cross(ea, eL0);
      // gust-induced angle of attack: the canopy pitches into a new apparent-wind direction with a lag (τ ≈0.12 s, ASSUMED);
      // air turning towards the canopy's underside (+ê_L) raises α
      eaLag = eaLag ? nrm(add(eaLag, mul(sub(ea, eaLag), 1 - Math.exp(-dt / p.tauPitch)))) : ea.slice();
      const aEff = PT.round ? alpha : alpha - Math.asin(clamp(dot(eaLag, eL0), -1, 1)) / D2R;
      // ---- KCU control
      const rrA = sub(K, A), dA = len(rrA) || 1, elK = Math.asin(clamp(rrA[2] / dA, -1, 1)) / D2R;
      const bb = backOf(cFrame), ll = leftOf(cFrame);
      const azK = Math.atan2(dot(rrA, ll), dot(rrA, bb)) / D2R;
      elPrev = elK;
      if (azPrev != null) { let da = azK - azPrev; if (da > 180) da -= 360; if (da < -180) da += 360; azRate += (da / dt - azRate) * (1 - Math.exp(-dt / 0.08)); }
      azPrev = azK;
      let psiC = 0, alphaC = alpha, reefC = reef;
      const flagging = mode === MODE.FLAGDOCK || mode === MODE.FREE || mode === MODE.FAILRET || mode === MODE.LANDED || kcuFailed || fallFlag || giveUp || freeSpool || ovf;
      // window frame around the apparent wind at the anchor: β = cone angle of the tether from the wind, φ = position around the cone.
      // A massless kite holds any direction in the window if L/D = tan β; on the coupled polar L/D is set by α alone.
      // apparent wind at the exit as the KCU MEASURES it (pitot/vane at the kite + GNSS/IMU kite velocity − boom-tip velocity):
      // true value + coloured noise sigVa per axis (audit3 A3-K2-06: no noise-free local wind in the controller)
      const nva = nzVa(dt); vaMeasN = [p.sigVa * nva[0], p.sigVa * nva[1], p.sigVa * nva[2]];
      const vaA = add(sub(w, Av), vaMeasN);
      const calmRet = len(vaA) < 2.5 && (mode === MODE.RETRIEVE || mode === MODE.FAILRET);
      const eSrc = len(vaA) > 2 ? nrm(vaA) : ea;
      eaW = nrm(add(eaW, mul(sub(eSrc, eaW), 1 - Math.exp(-dt / 0.04))));
      let uz = sub([0, 0, 1], mul(eaW, eaW[2])); uz = len(uz) > 1e-3 ? nrm(uz) : nrm(sub(bb, mul(eaW, dot(bb, eaW))));
      const erA = mul(rrA, 1 / dA);
      const betaK = Math.acos(clamp(dot(erA, eaW), -1, 1));
      const gl = gloss(reef);
      const polNow = fixedCoef ? null : PT.at(alpha);
      const CRnow = fixedCoef ? p.fixedCR : Math.hypot(polNow.CL * gl, polNow.CD);
      if (passive) {
        // passive kite: fixed bridle trim; dihedral/bridle stability idealised as a damped return to the window zenith (ASSUMED, generous)
        const Gp = fixedCoef ? p.fixedG : polNow.G;
        const tP = nrm(cross(eaW, erA)), uP = dot(sub(Vk, Av), tP), lP = Math.max(0.3, q * p.S * CRnow * Gp / Math.sqrt(1 + Gp * Gp));
        const uzP = uz, uyP = cross(eaW, uzP), phiK = Math.atan2(dot(erA, uyP), dot(erA, uzP));
        psiC = Math.asin(clamp((p.mass / lP) * (-2 * dA * Math.sin(betaK) * phiK - 3 * uP + G0 * tP[2]), -0.5, 0.5));
      } else if (!flagging && !collapsed) {
        // altitude priority: if the kite sags well below the target, the target moves up and behind
        const low = clamp(((elT - p.elGuard) - elK) / 10, 0, 1);
        let eT = dirAE(azT * (1 - low), elT + 10 * low, cFrame);
        let betaT = Math.acos(clamp(dot(eT, eaW), -1, 1));
        if (betaT < p.betaMin * D2R) {
          let pr = sub(eT, mul(eaW, dot(eT, eaW))); pr = len(pr) > 1e-3 ? nrm(pr) : uz;
          eT = nrm(add(mul(eaW, Math.cos(p.betaMin * D2R)), mul(pr, Math.sin(p.betaMin * D2R)))); betaT = p.betaMin * D2R;
        }
        // 2-D position/velocity loop in the tangent plane with gravity feed-forward, split into roll (around the wind axis)
        // and glide (away from the axis); glide is realised by α on the post-stall branch of the polar
        const tPhi = nrm(cross(eaW, erA));
        let eB = sub(mul(erA, dot(erA, eaW)), eaW); eB = len(eB) > 1e-6 ? nrm(eB) : nrm(cross(tPhi, erA));
        const Vr = sub(Vk, Av), uT = dot(Vr, tPhi), uB = dot(Vr, eB);
        const xe = mul(sub(eT, mul(erA, dot(eT, erA))), dA);
        const xP = clamp(dot(xe, tPhi), -3, 3), xB = clamp(dot(xe, eB), -3, 3);
        const Gn = polNow.G * gl;
        const Fres = Math.max(0.3, q * p.S * reef * infl * CRnow);
        const liftN = Math.max(0.3, Fres * Gn / Math.sqrt(1 + Gn * Gn));
        const pri = clamp(1 - (elT - elK - 3) / 10, 0.25, 1);
        const FP = p.mass * (pri * (p.cpPhi * xP - p.cvPhi * uT) + G0 * tPhi[2]);
        const FB = p.mass * (p.cpPhi * xB - p.cvPhi * uB + G0 * eB[2]);
        psiC = Math.asin(clamp(FP / liftN, -Math.sin(p.psiMax * D2R), Math.sin(p.psiMax * D2R)));
        Iel = clamp(Iel + (betaT - betaK) * p.kElI * dt, -0.25, 0.25);
        let GC = Math.tan(clamp(betaK + clamp(FB / Fres, -0.5, 0.5) + Iel, 0.12, 1.4));
        if (calmRet) {
          // reel-in in calm air: the only flow is along the line → towed glider; hold a modest glide, damp sideways drift
          GC = 0.8 + 2.0 * (Math.max(elT, p.elRetCalm) - elK) * D2R;
          psiC = Math.asin(clamp((p.mass / liftN) * (-p.cvPhi * uT + G0 * tPhi[2]), -0.5, 0.5));
        }
        const gOutRaw = betaK + clamp(FB / Fres, -0.8, 0.8) + Iel;
        if (PT.round && !calmRet && gOutRaw < 0.15) {
          // a round canopy turns its glide force to ANY direction about the line (differential slots yaw the canopy,
          // MC-1-1C/MC-6 steering): command the lift vector (outward + lateral) and its magnitude together
          const gOut = Math.tan(clamp(betaK + clamp(FB / Fres, -0.8, 0.8) + Iel, -1.2, 1.4));
          const Lout = gOut / Math.sqrt(1 + gOut * gOut), Llat = clamp(FP / Fres, -1, 1);
          const sMax = (PT.Gmax * gl) / Math.sqrt(1 + (PT.Gmax * gl) ** 2);
          const sDes = Math.min(Math.hypot(Lout, Llat), sMax * 0.999);
          GC = sDes / Math.sqrt(1 - sDes * sDes);
          psiC = Math.atan2(Llat, Lout);
        }
        // climb priority (iteration 3): while launching below the target, or sagging >14° below it, all glide goes
        // outward (slots fully open, no yaw) — the iteration-2 launch spent the glide sideways and stayed at 7–13°
        const climbing = !calmRet && (mode === MODE.LAUNCH ? elK < elT - 8 : elK < elT - 14);
        if (climbing) {
          // full glide pointed UP (projected normal to the kite's own apparent wind); ψ = 0 would push it away from the
          // wind axis, i.e. downwards whenever the kite starts below the axis
          const upP = sub([0, 0, 1], mul(ea, ea[2]));
          if (len(upP) > 1e-3) { const uu = nrm(upP); psiC = Math.atan2(dot(uu, es), dot(uu, eL0)); if (!PT.round) psiC = clamp(psiC, -p.psiMax * D2R, p.psiMax * D2R); }
          GC = 50;
        }
        alphaC = PT.xForG(GC / gl);
        // pull: area (reefing) holds the reference tension; feed-forward on measured airspeed + slow PI
        // set-point: Tref, raised towards TrefMax while the kite sits low or off its azimuth (opening the reef restores glide)
        let dAz = azT - azK; dAz = Math.abs(((dAz + 540) % 360) - 180);
        const Tr = mode === MODE.RETRIEVE ? p.Tret : p.Tref + Math.max(clamp((elT - 4 - elK) / 10, 0, 1), clamp((dAz - 6) / 15, 0, 1)) * (p.TrefMax - p.Tref);
        Itn = clamp(Itn + (Tr - T) * 0.15 * dt, -0.6, 0.6);
        const qM = 0.5 * p.rho * Math.max(0, Va + vaMeasN[0]) ** 2; // pitot dynamic pressure (noisy)
        const ff = Tr / Math.max(0.3, qM * p.S * Math.max(0.05, infl) * CRnow);
        reefC = clamp(ff * (1 + Itn), p.rMin, 1);
        if (mode === MODE.LAUNCH && infl < 1) reefC = reefLaunch; // reefed opening
      }
      if (passive) { alphaC = p.fixedAlpha ?? alpha; reefC = 1; }
      if (p.psiFix != null) psiC = p.psiFix * D2R;
      if (p.alphaFix != null) alphaC = p.alphaFix;
      // actuator lags (servo-winches)
      if (PT.round) {
        // canopy yaw about the line as a PHYSICAL glide-direction vector ⟂ the apparent wind (iteration 3): the angle-in-a-
        // frame form flipped with the frame when the kite sat on the wind axis (β≈0). Shortest-way first-order lag with a
        // 360°/s slew limit (ASSUMED for a 0.7 m canopy).
        const gCmd = nrm(add(mul(eL0, Math.cos(psiC)), mul(es, Math.sin(psiC))));
        if (!gDir) gDir = gCmd.slice();
        gDir = sub(gDir, mul(ea, dot(gDir, ea))); gDir = len(gDir) > 1e-6 ? nrm(gDir) : gCmd.slice();
        const ang = Math.acos(clamp(dot(gDir, gCmd), -1, 1));
        if (ang > 1e-6) {
          const rot = Math.min(ang * (1 - Math.exp(-dt / p.tauSt)), 2 * Math.PI * dt);
          let ax = sub(gCmd, mul(gDir, Math.cos(ang))); ax = len(ax) > 1e-9 ? nrm(ax) : es;
          gDir = nrm(add(mul(gDir, Math.cos(rot)), mul(ax, Math.sin(rot))));
        }
        const upP = sub([0, 0, 1], mul(ea, ea[2])), upU = len(upP) > 1e-3 ? nrm(upP) : eL0;
        psi = Math.atan2(dot(gDir, cross(ea, upU)), dot(gDir, upU)); // reported: glide direction from "up" about the wind
      } else psi += (psiC - psi) * (1 - Math.exp(-dt / p.tauSt));
      alpha += (alphaC - alpha) * (1 - Math.exp(-dt / p.tauA));
      reef += (reefC - reef) * (1 - Math.exp(-dt / p.tauReef));
      flag += ((flagging ? 1 : 0) - flag) * (1 - Math.exp(-dt / 0.25));
      // ---- canopy state: luff (front collapse) at low α, back-fly at very high α, collapse on a slack line; re-inflation
      const live = FLYING.has(mode) && mode !== MODE.FREE && mode !== MODE.FLAGDOCK && !flagging && !fixedCoef;
      if (live && infl > 0.9 && !collapsed) {
        const cause = !PT.round && aEff < p.aLuff ? 'luff' : !PT.round && aEff > p.aBack ? 'backfly' : slackT > p.tSlack ? 'slack' : null;
        if (cause) {
          collapsed = true; nCollapse++; colCause[cause]++;
          ev(t, 'collapse', 'warning', cause === 'luff' ? `迎角 ${aEff.toFixed(0)}° 低于前缘失压边界 ${p.aLuff}°：伞翼塌陷` : cause === 'backfly' ? `迎角 ${aEff.toFixed(0)}° 超过倒飞边界：伞翼塌陷` : '系留绳松弛 >0.3 s：软翼失去形状（塌陷）', cause === 'luff' ? `α ${aEff.toFixed(0)}° below the ${p.aLuff}° luff boundary: canopy collapses` : cause === 'backfly' ? `α ${aEff.toFixed(0)}° beyond the back-fly boundary: canopy collapses` : 'Slack line >0.3 s: the soft canopy loses its shape (collapse)');
        }
      }
      if (collapsed) {
        tCollapsed += dt;
        if (T > 0.5 && (PT.round || (aEff > p.aLuff + 4 && aEff < p.aBack - 4)) && Va > 3) { collapsed = false; ev(t, 'reinflate', 'info', '伞翼重新充气', 'Canopy re-inflates'); }
      }
      if (live && T < p.Tslack) slackT += dt; else slackT = 0;
      // inflation over the filling distance nFill·D0 (time ∝ 1/airspeed); opening-shock overshoot near full inflation
      if (mode === MODE.LAUNCH && infl < 1 && !collapsed) infl = Math.min(1, infl + dt * Math.max(2, Va) / (p.nFill * D0));
      else if (collapsed) infl += (0.3 - infl) * (1 - Math.exp(-dt / 0.12));
      else if (infl < 1) { infl = Math.min(1, infl + dt * Math.max(2, Va) / (p.nFill * D0)); }
      ckNow = infl < 0.999 && !collapsed ? 1 + (p.CkMax - 1) * Math.exp(-(((infl - 0.85) / 0.1) ** 2)) : 1;
      // forces
      let F = [0, 0, -p.mass * G0];
      const Sx = p.S * infl;
      let Gout = G, CRout = CR;
      if (mode === MODE.LANDED) { /* on snow: handled below */ }
      else if (Va < 1.5 || mode === MODE.FREE) {
        // low-airspeed / free regime: the canopy is a parachute (drag only, ASSUMED CR_par at α ≈90°)
        F = add(F, mul(ea, q * Math.max(Sx, 0.3 * p.S) * p.CRpar)); Gout = 0; CRout = p.CRpar;
      } else if (flagging || collapsed) {
        const c = flagging ? p.CRflag : p.CRcol;
        F = add(F, mul(ea, q * (flagging ? p.S : Sx) * c)); Gout = 0; CRout = c;
      } else {
        let CL, CD;
        if (fixedCoef) { const sq = Math.sqrt(1 + p.fixedG * p.fixedG); CL = p.fixedCR * p.fixedG / sq; CD = p.fixedCR / sq; }
        else { const pe = PT.at(aEff); CL = pe.CL * gloss(reef); CD = pe.CD; }
        const eL = PT.round && gDir ? gDir : add(mul(eL0, Math.cos(psi)), mul(es, Math.sin(psi)));
        const Sa = Sx * (passive ? 1 : reef);
        // a deploying canopy streams behind before it fills: drag on ≥20 % of the reefed area (streamer, ASSUMED); lift ∝ inflation
        const SaD = p.S * Math.max(infl, 0.2) * (passive ? 1 : reef);
        F = add(F, add(mul(eL, q * Sa * CL * ckNow), mul(ea, q * SaD * CD * (infl >= 0.2 ? ckNow : 1))));
        Gout = CL / CD; CRout = Math.hypot(CL, CD);
      }
      G = Gout; CR = CRout;
      if (T > 0) F = add(F, mul(er, -T));
      // integrate
      if (mode === MODE.LANDED) {
        // on the snow: the rag is towed behind on the line when the line is taut (kinematic, snow friction μ 0.3 + rag drag)
        const dS = len(sub(K, A));
        // towed rag: it can move no faster than the rider plus the reel-in rate (the line, not the boom-tip whip, pulls it)
        if (dS > L + 0.01 && aliveLine) { const dir = nrm(sub(K, A)); const Kn = add(A, mul(dir, L)); Vk = mul(sub(Kn, K), 1 / dt); const vl = len(Vk), vc = Math.min(s.speed + Math.max(0, -nu) + 0.5, Math.max(s.speed, p.vGov - 0.3)); if (vl > vc) Vk = mul(Vk, vc / vl); K = add(K, mul(Vk, dt)); }
        else Vk = [0, 0, 0];
        K[2] = snowZ(K[0]) + 0.05;
        T = aliveLine && dS > L ? 0.3 * p.mass * G0 + 0.5 * p.rho * dot(Vk, Vk) * p.S * 0.1 : 0;
        if (T > Tmax) Tmax = T;
      } else if (mode === MODE.FLAGDOCK) {
        // towed point on the line: the KCU slides towards the tip along the CURRENT tip→KCU direction (a flexible line does
        // not drag it sideways with the boom tip); its velocity is what that motion implies
        const dK = sub(K, A), lK = len(dK), eK = lK > 1e-6 ? mul(dK, 1 / lK) : erLock;
        const Kn = add(A, mul(eK, Math.max(0, Math.min(lK, L)))); Vk = mul(sub(Kn, K), 1 / dt); K = Kn;
      } else {
        Vk = add(Vk, mul(F, dt / p.mass)); K = add(K, mul(Vk, dt));
        if (K[2] < snowZ(K[0]) + 0.05) {
          K[2] = snowZ(K[0]) + 0.05; Vk = [0, 0, 0];
          ev(t, 'landed', 'warning', '风筝落到雪面', 'Kite on the snow');
          setMode(MODE.LANDED);
        }
      }
      // ---- snag detection: branch crossing (tether rises behind the rider through the branch height)
      if (plan.branch && !snagged && aliveLine && mode !== MODE.FREE && mode !== MODE.LANDED) {
        const B = plan.branch, zb = snowZ(B.x) + B.h;
        if ((A[0] - B.x) * (K[0] - B.x) < 0) {
          const u = (B.x - A[0]) / (K[0] - A[0]); const P = add(A, mul(sub(K, A), u));
          const below = P[2] < zb;
          if (prevBelow === true && !below && Math.abs(P[1] - B.yc) < B.half) { snag = [B.x, P[1], zb]; snagged = true; snagT = t; ev(t, 'snag', 'warning', '系留绳挂上树枝', 'Tether caught on a branch'); }
          prevBelow = below;
        } else prevBelow = null;
      }
      // neighbour crossing behind the rider: first the BOOM (rigid, gimballed) — contact if it passes below their helmet/pole.
      // Round 4: the pivot is free (passive) and the boom sits on a 5 N magnetic breakaway, so the load is the
      // boom's inertia: effective mass I/r² at the contact radius r, 50 ms contact (ASSUMED) → impulse and mean force
      if (plan.cross && useBoom && !boomHit && bx > 0.5) {
        const C = plan.cross, ny = C.y0 + C.vy * (t - C.t);
        if (t >= C.t - 1 && (Pn[0] - C.x) * (A[0] - C.x) < 0) {
          const u = (C.x - Pn[0]) / (A[0] - Pn[0]), Q = add(Pn, mul(sub(A, Pn), u));
          if (Math.abs(Q[1] - ny) < 0.45 && Q[2] - snowZ(C.x) < C.h) { // shoulders/arms with poles: ±0.45 m below the helmet top
            const r = Math.max(0.3, len(sub(Q, Pn))), mEffB = Math.min(p.boomMass, (p.boomMass * p.boom * p.boom / 3) / (r * r)), J = mEffB * Math.abs(C.vy); // ≤0.3 m from the pivot = the pack itself; the 5 N magnet lets the struck rod go free (effective mass ≤ its own mass)
            boomHit = { t, r, mEff: mEffB, J, F: Math.min(J / 0.05, p.boomBreak + mEffB * Math.abs(C.vy) / 0.05) };
            ev(t, 'boomContact', 'warning', `横穿者碰到臂杆（离枢轴 ${r.toFixed(2)} m，离地 ${(Q[2] - snowZ(C.x)).toFixed(2)} m）：被动枢轴自由摆开，冲量 ${J.toFixed(3)} N·s（50 ms 内约 ${(J / 0.05).toFixed(1)} N），磁吸脱扣 ${p.boomBreak} N`, `Crossing skier meets the BOOM (${r.toFixed(2)} m from the pivot, ${(Q[2] - snowZ(C.x)).toFixed(2)} m above snow): free passive pivot swings away, impulse ${J.toFixed(3)} N·s (≈${(J / 0.05).toFixed(1)} N over 50 ms), ${p.boomBreak} N magnetic breakaway`);
          }
        }
      }
      // neighbour crossing behind the rider: contact if the line passes below their helmet/raised pole
      if (plan.cross && !crossDone && aliveLine) {
        const C = plan.cross, ny = C.y0 + C.vy * (t - C.t);
        if (t >= C.t - 1 && (A[0] - C.x) * (K[0] - C.x) < 0 && !snagged) {
          const u = (C.x - A[0]) / (K[0] - A[0]); const P = add(A, mul(sub(K, A), u));
          if (Math.abs(P[1] - ny) < 0.3 && P[2] - snowZ(C.x) < C.h) { snag = P.slice(); snagOff = P[1] - ny; snagged = true; snagT = t; crossHold = 0; ev(t, 'contact', 'warning', `横穿滑雪者头盔/雪杖碰到系留绳（离地 ${(P[2] - snowZ(C.x)).toFixed(2)} m）`, `Crossing skier's helmet/pole meets the tether (${(P[2] - snowZ(C.x)).toFixed(2)} m above snow)`); }
        }
        if (snagged && snag && plan.cross) {
          snag[1] = ny + snagOff * Math.max(0, 1 - crossHold / 0.03); crossHold += dt;
          if (crossHold > C.slide / Math.abs(C.vy)) { snagged = false; snag = null; crossDone = true; ev(t, 'unhooked', 'info', '系留绳从头盔上滑脱', 'Line slides off the helmet'); }
        }
      }
      // proximity sensing (rear radar/ToF on the pod, ASSUMED 4 m range, 0.2 s latency): someone near the line →
      // clutch soft (Ffree) and the kite climbs, so a contact meets ≈Ffree instead of the flying pull
      if (plan.cross) {
        const C = plan.cross, ny = C.y0 + C.vy * (t - C.t), dN = Math.hypot(C.x - A[0], ny - A[1]);
        if (dN < p.proxR) { if (proxT < 0) proxT = t; if (!prox && t - proxT >= p.proxLag) { prox = true; proxN++; ev(t, 'proximity', 'info', `后方 ${dN.toFixed(1)} m 有人：离合变软（${p.Ffree} N），风筝爬高`, `Someone ${dN.toFixed(1)} m behind: clutch soft (${p.Ffree} N), kite climbs`); } }
        else { proxT = -1; if (prox && dN > p.proxR + 1) prox = false; }
      }
      // contact/snag detection (line-angle sensor at the mast tip disagrees with the kite's own position, ASSUMED 60 ms):
      // the winch declutches to a 1.5 N free-spool drag, so whoever is caught feels ~2 N instead of the flying pull
      if (snagged && !freeSpool && t - snagT >= p.tDetect && !winchFailed) { freeSpool = true; ev(t, 'freeSpool', 'info', '检测到绳被挂住：绞盘离合脱开，1.5 N 自由放线，风筝旗化', 'Line contact detected: winch declutches to a 1.5 N free-spool drag and the kite flags'); }
      if (freeSpool && !snagged && crossDone && mode !== MODE.LANDED) { freeSpool = false; if (FLYING.has(mode)) { setMode(MODE.RETRIEVE); dockInfo.retrieveT.push(t); } ev(t, 'reengage', 'info', '绳已脱离：离合重新接合，收回后再起飞', 'Line free again: clutch re-engages, retrieve then relaunch'); }
      // ---- mode logic
      if (FLYING.has(mode) && mode !== MODE.FREE) { if (Va + vaMeasN[0] < Math.max(p.vFly, 1.1 * vMinA)) lowVa += dt; else lowVa = 0; }
      if (!passive && !kcuFailed && !fallFlag && !giveUp && !freeSpool) {
        // dock BEFORE the rider passes the KE speed (reel-in near the cap is rate-limited): within 1 m/s of it and predicted 1.5 s ahead
        accS += (Math.max(0, s.accel) - accS) * (1 - Math.exp(-dt / 0.5));
        if (ksp > p.vMaxFilm - 1.0 && ksp + 1.5 * accS > p.vMaxFilm && !fastDock && (mode === MODE.FILM || mode === MODE.LAUNCH)) { fastDock = true; ev(t, 'fastDock', 'warning', `滑行速度 >${p.vMaxFilm} m/s：风筝对地动能将超 14.9 J → 自动收回`, `Rider speed >${p.vMaxFilm} m/s: the kite's ground-frame KE would exceed 14.9 J → auto retrieve`); }
        if (fastDock && ksp + 1.5 * accS < p.vMaxFilm - 1.5) fastDock = false;
        // retrieve as soon as a stop starts (hockey-stop deceleration), so the dock completes while the apparent wind is still from ahead
        const braking = brakingNow;
        // head safety: the kite has drifted out of the boom's rear cone (overflying / ahead of the rider) → retrieve now
        if ((mode === MODE.FILM || mode === MODE.LAUNCH) && coneOut > 15) coneOutT += dt; else coneOutT = 0;
        // short line (<2.2 m) and the kite starts to leave the rear cone (tailwind reversal at a stop, gust at launch): flag
        // and haul it straight onto the tip NOW — shortening the line moves it away from the head faster than it can swing
        // head interlock: on a short line the KCU position relative to the pack is known (boom encoders + line length/angle);
        // if a failing opening or a gust swings it within 1.3 m of the helmet → snap back onto the tip
        const nearHead = len(sub(K, b.head)) < 1.3;
        const failedOpen = mode === MODE.LAUNCH && L < 2.2 && nearHead;
        if (failedOpen) launchLock = t + 5;
        if (!ovf && L < 2.2 && (coneOut > 10 || failedOpen || nearHead) && (mode === MODE.LAUNCH || mode === MODE.RETRIEVE || mode === MODE.FILM)) {
          const erT = nrm(sub(K, A)), resid = useBoom ? Math.acos(clamp(dot(erT, bd), -1, 1)) / D2R : 0;
          erLock = erT; dockAxisAngle = resid; dockSpeed = Math.abs(nu); dockClear = pathClear(); L = len(sub(K, A)); setMode(MODE.FLAGDOCK);
          if (resid > p.funnelAcc) { manual++; manualDock = true; dockInfo.manualT.push(t); }
          ev(t, 'snapDock', 'warning', `${failedOpen ? `开伞中风筝摆到离头盔 ${len(sub(K, b.head)).toFixed(2)} m` : `短绳时风筝漂出臂杆锥区 ${coneOut.toFixed(0)}°`}：立即旗化并拉上臂杆端${resid > p.funnelAcc ? '（喇叭口外，手动放入）' : ''}`, `${failedOpen ? `During the opening the kite swung to ${len(sub(K, b.head)).toFixed(2)} m from the helmet` : `Short line and the kite leaves the boom cone by ${coneOut.toFixed(0)}°`}: flag and haul onto the tip now${resid > p.funnelAcc ? ' (outside the trumpet: seated by hand)' : ''}`);
        }
        // never reel a kite that is ahead of / over the rider (the line would sweep the head): flag it and pay out softly so
        // the rider skis ahead of the falling canopy; retrieve once it is back inside the rear cone
        if (!ovf && coneOutT > 0.3) { ovf = true; ovfN++; ev(t, 'overfly', 'warning', '风筝漂出臂杆后方锥区（越过骑手）：伞衣旗化、软放线，待其落回身后再收', 'Kite drifted out of the boom\'s rear cone (over/ahead of the rider): canopy flagged, soft pay-out until it drops back behind'); }
        if (ovf && coneOut < 5) { ovfBack += dt; if (ovfBack > 0.3) { ovf = false; ovfBack = 0; if (FLYING.has(mode) && mode !== MODE.FLAGDOCK) { setMode(MODE.RETRIEVE); dockInfo.retrieveT.push(t); } } } else ovfBack = 0;
        const overfly = ovf;
        const wantStop = (ksp < 3 && s.accel < 0.5) || braking || stowReq || fastDock || overfly;
        if (mode === MODE.FILM && (wantStop || lowVa > 0.5)) {
          if (p.parkAtStop && !stowReq && ambient > p.vPark && ksp < 3) { setMode(MODE.PARK); ev(t, 'park', 'info', '停下但有环境风：风筝留空停泊在下风处', 'Stopped with ambient wind: the kite stays up, parked downwind'); }
          else { setMode(MODE.RETRIEVE); dockInfo.retrieveT.push(t); ev(t, 'retrieve', 'info', winchFailed ? '收回请求（绞盘已锁，无法收线）' : '自动收回：绞盘收线，收线本身维持空速，风筝飞回桅杆顶', 'Auto retrieve: winch reels in; reel-in keeps the airspeed up so the kite flies back to the mast tip'); }
        }
        if (mode === MODE.PARK) { if (ksp > p.vLaunch && !stowReq) setMode(MODE.FILM); else if (stowReq || ambient < 3.5) { setMode(MODE.RETRIEVE); dockInfo.retrieveT.push(t); ev(t, 'retrieve', 'info', '停泊结束：收回', 'End of park: retrieve'); } }
        if (mode === MODE.RETRIEVE && !stowReq && !fastDock && !braking && !overfly && coneOut < 5 && s.accel > -1 && ksp > 6 && L > 2.5 && lowVa === 0 && Va > 1.3 * vMinA && t - wasModeT > 2) setMode(MODE.FILM);
        if (mode === MODE.LAUNCH && L >= p.Lst - 0.2 && (elK >= elT - 8 || t - tLaunchStart > 6)) { setMode(MODE.FILM); dockInfo.stationT.push(t); ev(t, 'onStation', 'info', `到达机位（${p.Lst} m，后侧方）`, `On station (${p.Lst} m, rear quarter)`); }
        if (mode === MODE.LAUNCH && (ksp < 3 || braking || stowReq || fastDock || overfly || (lowVa > 0.5 && t - tLaunchStart > 1))) { setMode(MODE.RETRIEVE); dockInfo.retrieveT.push(t); }
        if (mode === MODE.RETRIEVE && !ovf && L < 1.6 && L > 0.6 && !approachHigh) tryDock();
        if (mode === MODE.RETRIEVE && !ovf && L <= 0.6 && !approachHigh) tryDock();
      }
      if (mode === MODE.FAILRET && L < 1.6 && !approachHigh) tryDock(true);
      if (giveUp && FLYING.has(mode) && mode !== MODE.FLAGDOCK) { /* flagged; falls behind and lands */ }
      // capture: the KCU seats in the boom-tip trumpet at the end of the guided pull-in
      if (mode === MODE.FLAGDOCK && L <= 0.02) {
        docks++; dockInfo.dockT.push(t); dockInfo.err.push(dockAxisAngle); dockInfo.clear.push(dockClear);
        setMode(MODE.STOW); stowT = manualDock ? t + p.tHand : t; manualDock = false; ev(t, 'docked', 'info', `落座臂杆端：剩余偏角 ${dockAxisAngle.toFixed(0)}°（喇叭口容许 ${p.funnelAcc}°），落座速度 ${dockSpeed.toFixed(1)} m/s`, `Seated on the boom tip: ${dockAxisAngle.toFixed(0)}° residual (${p.funnelAcc}° trumpet), seating at ${dockSpeed.toFixed(1)} m/s`);
        K = A.slice(); Vk = Av; L = 0; nu = 0; slip = 0; nuSh = 0; T = 0; retries = 0;
      }
      // a canopy on the snow is NEVER re-inflated there (audit2 A2-K2-03): the winch reels the flagged rag in over the
      // snow (governor-limited while riding) and the KCU is captured on the boom tip if the residual angle is inside the
      // trumpet; otherwise it is held at the tip and stowed by hand at the next standstill (simulated hand time tHand).
      if (mode === MODE.LANDED && ksp >= 0.5) landedRiding += dt;
      // a rag lying outside the boom's rear cone (in front of / beside a standing rider) is NOT reeled in past the head:
      // the rider walks to it and stows it by hand (simulated walk there and back at 1 m/s + tHand)
      if (mode === MODE.LANDED && ksp < 0.5 && coneOutL > 5 && t - wasModeT > 1 && aliveLine) {
        const dW = Math.hypot(K[0] - s.pos[0], K[1] - s.pos[1]), tWalk = 2 * dW / 1.0;
        manual++; dockInfo.manualT.push(t); docks++; dockInfo.dockT.push(t); giveUp = false; setMode(MODE.STOW); stowT = t + tWalk + p.tHand; K = A.slice(); Vk = Av; L = 0; nu = 0; T = 0; retries = 0;
        ev(t, 'pickedUp', 'warning', `伞衣落在骑手前方/侧方（臂杆锥区外 ${coneOutL.toFixed(0)}°）：步行 ${dW.toFixed(1)} m 取回并手动收纳（+1 操作，${(tWalk + p.tHand).toFixed(0)} s）`, `The rag lies in front of / beside the rider (${coneOutL.toFixed(0)}° outside the boom cone): walk ${dW.toFixed(1)} m to it and stow by hand (+1 action, ${(tWalk + p.tHand).toFixed(0)} s)`);
      }
      if (mode === MODE.LANDED && aliveLine && !winchFailed && L <= 0.6 && t - wasModeT > 0.5) {
        const erT = nrm(sub(K, A)), resid = useBoom ? Math.acos(clamp(dot(erT, bd), -1, 1)) / D2R : 0;
        if (resid <= p.funnelAcc) {
          erLock = erT; dockAxisAngle = resid; dockSpeed = Math.abs(nu); dockClear = pathClear(); giveUp = false; L = len(sub(K, A)); setMode(MODE.FLAGDOCK);
          ev(t, 'landedDock', 'warning', `落雪的伞衣被绞盘拖回，控制单元滑上臂杆端（剩余偏角 ${resid.toFixed(0)}°）`, `The landed canopy is reeled in over the snow and the KCU slides onto the boom tip (${resid.toFixed(0)}° residual)`);
        } else if (ksp < 0.5) {
          manual++; dockInfo.manualT.push(t); docks++; dockInfo.dockT.push(t); giveUp = false; setMode(MODE.STOW); stowT = t + p.tHand; K = A.slice(); Vk = Av; L = 0; nu = 0; T = 0; retries = 0;
          ev(t, 'pickedUp', 'warning', `伞衣被拖到臂杆端但偏角 ${resid.toFixed(0)}° 在喇叭口外：手动取下放入（+1 操作，手动 ${p.tHand} s）`, `The rag reaches the boom tip ${resid.toFixed(0)}° outside the trumpet: taken off and stowed by hand (+1 action, ${p.tHand} s hand time)`);
        }
      }
      // ---- winch
      if (aliveLine && mode !== MODE.FREE && mode !== MODE.STOW) {
        let nuC = 0;
        const Thi = Math.max(p.ThiMin, p.ThiRatio * Tbar);
        // launch: stream the canopy out to 0.8 m, let it inflate and climb on a short line, then pay out while it holds elevation
        if (mode === MODE.LAUNCH) nuC = infl < 1 ? (L < 0.8 ? 1.5 : 0) : elK < elT - 10 && t - tLaunchStart < 5 ? (L < 1.2 ? 0.5 : 0) : clamp(0.8 * (p.Lst - L) + 0.6 * (T - 2.5), 0, 6) * (elK < elT - 10 ? 0.3 : 1);
        else if (fallFlag) nuC = 0;
        else if (giveUp && mode !== MODE.LANDED) nuC = L < 4 ? 1.5 : 0; // flagged rag paid out to 4 m so it settles on the snow
        else if (mode === MODE.FILM) { const dl = p.Lst - L; nuC = passive ? 0 : clamp((dl > 0 ? 0.8 * dl : dl < -p.lenDead && T < 0.9 * Tbar ? -Math.max(1.0, 0.8 * (-dl - p.lenDead)) : 0) + 0.6 * Math.max(0, T - Thi) - 0.6 * Math.max(0, p.Tlo - T), -p.vIn, p.vOut); } // reel back in only beyond a 0.4 m dead band (no motor work on small errors)
        else if (mode === MODE.PARK) nuC = clamp(0.8 * (p.Lpark - L) + 0.6 * Math.max(0, T - Thi), -p.vIn, p.vOut);
        else if (mode === MODE.RETRIEVE && approachHigh) { nuC = L < 2.5 ? 1.2 : -0.8; if (L >= 2.5) approachHigh = 0; }
        // while the rider is still moving (braking) the apparent wind keeps the kite flying behind: reel in FAST so the dock
        // completes before the stop and the kite never drifts downwind of a stopped rider
        else if (mode === MODE.RETRIEVE || mode === MODE.FAILRET) nuC = clamp(-(mode === MODE.FAILRET ? p.vIn : ksp > 2.5 ? p.vRetFast : ksp < 1 && ambient > 3 ? p.vRetWind : p.vRet) + 0.5 * Math.max(0, T - 14), -p.vRetFast, 1); // in wind the wind supplies the airspeed: reel slowly and let the kite hold the downwind-high window
        else if (mode === MODE.FLAGDOCK) nuC = -(L > 0.25 ? 2.2 : 1.2);
        else if (mode === MODE.LANDED) nuC = winchFailed || L <= 0.6 || coneOutL > 5 ? 0 : ksp < 0.5 ? (t - wasModeT > 1 ? -1.5 : 0) : -p.vIn; // reel the rag in over the snow (never re-inflate it)
        // heave compensation (round 4): the exit's motion along the line relative to the rider's CoM is ESTIMATED from the
        // pack IMU + boom encoders (first-order lag tauHC + coloured noise sigHC); the pay-out half needs no actuator (the
        // drag slips), the reel-in half is a feed-forward to the motor and gets every motor limit below
        const hcOn = p.hc > 0 && !passive && !fallFlag && !giveUp && (mode === MODE.FILM || mode === MODE.PARK || mode === MODE.RETRIEVE || (mode === MODE.LANDED && ksp > 0.5) || (mode === MODE.LAUNCH && infl >= 1 && L >= 2));
        const hcTrue = p.hc * dot(sub(Av, s.vel), mul(er, -1));
        hcEst += (hcTrue - hcEst) * (1 - Math.exp(-dt / p.tauHC));
        { const hm = hcEst + p.sigHC * nzHC(dt)[0]; nuHC = hcOn ? (hm < -p.hcDead ? (T < p.hcSlackT ? hm + p.hcDead : 0) : hm > p.hcDead ? hm - p.hcDead : 0) : 0; } // reel-in feed-forward only as slack take-up (T < hcSlackT): reeling against a taut line is what cost 5–10 W // deadband > sensor noise: the motor is not run on noise
        // winch base command slew-limited (a step reel-in through the elastic line rebounds the 90 g kite past rider speed)
        nuS += clamp(nuC - nuS, -p.aWinch * dt, p.aWinch * dt);
        nuC = nuS + nuHC;
        // KE governor on the KCU's ESTIMATED ground speed (GNSS/IMU fusion: coloured noise sigVk, 50 ms lag)
        { const nv = nzVk(dt); vGest += (len(Vk) + p.sigVk * nv[0] - vGest) * (1 - Math.exp(-dt / 0.05)); }
        const vG = vGest;
        const freeFly = mode === MODE.FILM || mode === MODE.LAUNCH || mode === MODE.RETRIEVE || mode === MODE.PARK || mode === MODE.FAILRET;
        if (!freeFly) gov = false; // sliding onto the tip / towed rag: the KCU speed IS the line speed → only the reel-in limit applies
        if (p.Jgov < 900) {
          if (freeFly && !gov && vG > p.vGov) { gov = true; govN++; if (govN <= 3) ev(t, 'governor', 'info', `风筝对地速度估计 ${vG.toFixed(1)} m/s > ${p.vGov.toFixed(1)} m/s：电磁铁松开卷线器摩擦制动到 ${p.Fgov} N`, `Estimated kite ground speed ${vG.toFixed(1)} m/s > ${p.vGov.toFixed(1)} m/s: solenoid drops the reel drag to ${p.Fgov} N`); }
          else if (gov && vG < p.vGov - 1.2) gov = false;
          if (gov) govT += dt;
          // reel-in limit: the largest r with |v_rider + r·ê| ≤ vGov − 0.3 (ê = kite → exit); closing across the travel is cheap
          if (nuC < 0) { const eh = mul(er, -1), vR = s.vel, ve = dot(vR, eh), cap = p.vGov - 0.3, disc = ve * ve - dot(vR, vR) + cap * cap; const rMax = disc > 0 ? Math.max(0, -ve + Math.sqrt(disc)) : 0; if (-nuC > rMax) nuC = -rMax; }
        }
        if (ovf) nuC = 1.0; // soft pay-out while overflown
        // head guard (round 4): the line position is known (boom encoders + line angle + pack IMU body model); if reeling in
        // would bring the line within headGuard of the helmet (hockey-stop body rotation swings the kite abeam), stop reeling
        // and pay out softly instead — the haul resumes once the kite is back behind
        if ((mode === MODE.RETRIEVE || mode === MODE.FAILRET || mode === MODE.FILM) && ksp > 3 && segPoint(A, K, input.helmet ? input.helmet(t) : b.head) < p.headGuard) { nuC = Math.max(nuC, 0.8); headGuardN++; }
        // ---- reel drag set-point: hold at Thi while filming/parked (gust pay-out is the drag slipping), the clutch level
        // while reeling in, a pay-out regulator when line is commanded out; solenoid quick-release for governor/contact/fall
        const reelIn = mode === MODE.RETRIEVE || mode === MODE.FAILRET || mode === MODE.FLAGDOCK || mode === MODE.LANDED;
        // gust pay-out by the drag is allowed only while the line is within 2 m of its set length; beyond that (and near
        // the end of the line) the drag ramps to the clutch level so the spool never runs into its end stop
        const overLen = mode === MODE.PARK ? L - p.Lpark : L - p.Lst;
        const holdF = reelIn ? p.Fslip : Math.min(p.Fslip, Thi + (p.Fslip - Thi) * clamp((overLen - 1) / 1.5, 0, 1) + (p.Fslip - Thi) * clamp((L - (p.Lmax - 3)) / 2, 0, 1));
        let FdT, quick = false;
        if (winchFailed) FdT = p.Fslip;
        else if (freeSpool || fallFlag || prox || ovf) { FdT = p.Ffree; quick = true; }
        else if (gov) { FdT = p.Fgov; quick = true; }
        else if (nuC > 0.05 && overLen < 0) FdT = clamp(Math.min(T, Tbar) - p.kDragPay * (nuC - nu), 0.3, holdF); // commanded pay-out up to the set length only
        else FdT = holdF;
        if (quick && FdT < Fd) Fd += (FdT - Fd) * (1 - Math.exp(-dt / p.tauRelease));
        else { const dF = (FdT - Fd) * (1 - Math.exp(-dt / p.tauDrag)); Fd += clamp(dF, -p.dragRate * dt, p.dragRate * dt); }
        // ---- motor (reel-in only, through the drag; the anti-reverse bearing holds the shaft against pay-out at zero current)
        const nuCin = winchFailed ? 0 : Math.min(0, nuC);
        if (nuCin < 0 || nuSh < -0.05) { // no reel-in command and the shaft nearly stopped → the anti-reverse bearing holds, motor off
          const Tsh = Math.min(T, Fd);
          const wM = Math.abs(nuSh) * p.gear / p.rDrum, Iv = (p.Vbat - KeM * wM) / p.Rm;
          const Fenv = Math.max(0, Math.min(p.Imax, Iv)) * fPerA * p.etaG;
          Fm = clamp(Tsh + (mW * (nuSh - nuCin)) / p.tauW, 0, Fenv);
          nuSh += ((Tsh - Fm) / mW) * dt;
          if (nuSh > 0) nuSh = 0;
        } else { Fm = 0; nuSh = 0; }
        // spool slips on the drag (static/dynamic ratio muRatio), spool-side inertia mSpool
        if (slip > 1e-9 || T > p.muRatio * Fd) slip = Math.max(0, slip + ((T - Fd) / p.mSpool) * dt);
        nu = nuSh + slip;
        L += nu * dt;
        if (L < 0) { L = 0; if (nu < 0) { nu = 0; nuSh = 0; } }
        if (L >= p.Lmax && nu > 0) {
          if (snagged && !plan.cross) { releasedAtPack = true; T = 0; ev(t, 'release', 'warning', '放线到底：背包端释放机构松开系留绳（人身安全优先，绳和风筝留在树上/树下）', 'Line run out: the pack-end release lets the tether go (rider safety first; line and kite stay at the tree)'); setMode(MODE.FREE); }
          else { L = p.Lmax; nu = 0; slip = 0; nuSh = 0; }
        }
        // electrical power: motor only while reeling in (copper loss I²R + mechanical work / gear η), ESC efficiency;
        // no holding current (anti-reverse), no regeneration (pay-out energy goes into the drag as heat); drag servo 0.05 W
        const Iw = Fm / (fPerA * p.etaG), Pmech = Fm * Math.max(0, -nuSh);
        const Pe = (Pmech / p.etaG + Iw * Iw * p.Rm) / p.escEff + 0.05;
        Ew += Pe * dt;
        pod = Pe;
      } else { T = 0; Fm = 0; nu = 0; slip = 0; nuSh = 0; pod = 0; }
      dg.azK = azK; dg.elK = elK; dg.azT = azT; dg.elT = elT; dg.Va = Va; dg.er = er; dg.aEff = aEff;
    }
    // raw 50 ms moving mean of the line tension at the integration step
    { const Tn = Number.isFinite(T) ? T : 0; sum50 += Tn - ring50[k50]; ring50[k50] = Tn; k50 = (k50 + 1) % n50; const m50 = sum50 / n50; if (m50 > T50max) T50max = m50; }
    if (step % every === 0) {
      O.bx[i] = bx; O.bdx[i] = bd[0]; O.bdy[i] = bd[1]; O.bdz[i] = bd[2]; O.px[i] = Pp[0]; O.py[i] = Pp[1]; O.pz[i] = Pp[2];
      O.Fd[i] = Fd; O.slip[i] = slip; O.nuSh[i] = nuSh; O.Iw[i] = Fm / (fPerA * p.etaG);
      O.T50[i] = T50max; T50max = 0; O.gov[i] = gov ? 1 : 0; O.nuHC[i] = nuHC; O.prox[i] = prox ? 1 : 0;
      O.kx[i] = K[0]; O.ky[i] = K[1]; O.kz[i] = K[2]; O.kvx[i] = Vk[0]; O.kvy[i] = Vk[1]; O.kvz[i] = Vk[2];
      O.ax[i] = A[0]; O.ay[i] = A[1]; O.az[i] = A[2];
      O.T[i] = T; O.Tmax[i] = Tmax; Tmax = 0; O.L[i] = L; O.nu[i] = nu; O.Fm[i] = Fm; O.psi[i] = psi / D2R; O.G[i] = G; O.CR[i] = CR;
      O.alpha[i] = alpha; O.reef[i] = reef; O.col[i] = collapsed ? 1 : 0;
      O.infl[i] = infl; O.mode[i] = mode; O.flag[i] = flag; O.armed[i] = armed ? 1 : 0;
      const docked = mode === MODE.DOCKED || mode === MODE.STOW || mode === MODE.EXTEND;
      O.Va[i] = docked ? NaN : dg.Va; O.azK[i] = docked ? NaN : dg.azK; O.elK[i] = docked ? NaN : dg.elK; O.azT[i] = docked ? NaN : dg.azT; O.elT[i] = docked ? NaN : dg.elT; O.aEff[i] = docked ? NaN : dg.aEff;
      O.wx[i] = w[0]; O.wy[i] = w[1]; O.wz[i] = w[2];
      const er = docked || !dg.er ? [0, 0, 1] : dg.er; O.ex[i] = er[0]; O.ey[i] = er[1]; O.ez[i] = er[2];
      O.sx[i] = snagged && snag ? snag[0] : NaN; O.sy[i] = snagged && snag ? snag[1] : NaN; O.sz[i] = snagged && snag ? snag[2] : NaN; O.snag[i] = snagged ? 1 : releasedAtPack ? 2 : 0;
      O.Pw[i] = pod; O.Ereg[i] = Ereg; O.cx[i] = course[0]; O.cy[i] = course[1];
      O.Pk[i] = docked ? 0 : p.pKite * (passive ? 0.7 : 1);
      O.brake[i] = !lineAttached ? 3 : releasedAtPack ? 2 : winchFailed ? 1 : freeSpool ? 4 : 0;
      if (plan.cross) O.nbY[i] = plan.cross.y0 + plan.cross.vy * (t - plan.cross.t);
      i++;
    }
    step++; t = step * dt;
  }
  return { O, n, SDT, events, p, rider, RS, RB, RA, RX, tanS, dockInfo, Ew, Ereg, retries, launches, docks, manual, inhibits, dockAxisAngle, dockSpeed, nCollapse, tCollapsed, colCause, PT, useBoom, govN, govT, proxN, landedRiding, ovfN, boomHit };
}

// distance from point P to segment AB
export function segPoint(A, B, P) {
  const ab = sub(B, A), l2 = dot(ab, ab);
  const u = l2 > 1e-12 ? clamp(dot(sub(P, A), ab) / l2, 0, 1) : 0;
  return len(sub(P, add(A, mul(ab, u))));
}
