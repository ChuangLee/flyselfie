// leapfrog round 4 (after audit3): feathered span-morphing wing (morphCfg), rate-limited morph servo, anticipating speed
// limiter, robust launch gate on ≥5 s of shared estimate, follow-me radius pull, chase-after-pass. Base (round-2 it. 3) physics core: a folding-wing lead glider that stays AHEAD
// of the skier. It is set down on the snow beside the skis and takes off by itself, glides down the slope (gravity
// pays the cruise), lands beside the piste when the skier stops, films the skier coming towards it from a tail
// pan/tilt camera and takes off again at the push-off. At the lift-station geofence it lands on a pick-up spot.
// Iteration 3: every wind gate/decision on the shared windEstimate() (launch progress gate, in-flight progress check,
// gust interlock, into-wind approach); independent speed protection (KE-feasible crab heading, GNSS ground-speed trim,
// airbrake, altitude hold, GNSS land-now); sourced pointing error model (UWB PDoA ±5°, GNSS relative position, height
// geometry; optional on-board vision); shared 4K 16:9 camera, 22° lens; 4×3 prop (pitch speed 28 m/s).
// Point-mass 3-DOF flight (forces) + attitude filters (camera only) + planar slope snow contact + perch statics in
// wind. Model coordinates: x downslope, y left, z up; slope z = −x·tanθ. Numerical-uncalibrated simulation; every
// hardware number is ASSUMED unless cited in design_notes.json. Not a physical test.
import { skierAt, bodyPoints } from '../common/skier.js';
import { makeWind, subjectPoints } from '../common/env.js';
import { COMPONENTS, budget, keSpeedCap, ATMOS, MASS_MARGIN } from '../common/components.js';
import { windEstimate } from '../common/fullrun.js';

export const G = 9.81, RHO = ATMOS.rho;
export const NU = 1.67e-5; // kinematic viscosity at −10 °C and ρ 1.0 (μ 1.67e-5 Pa·s)

// ---------------------------------------------------------------- bill of materials (shared table, audit LF-03 / X-02)
// Round 4 (audit3 A3-LF-01/07): a FEATHERED, span-morphing wing (LisHawk-style, Ajanic et al. 2020 Sci. Robot. 5:eabc2897:
// 284 g goshawk drone, wing 0.117 → 0.165 m² (+41 %), wing+tail +60 %, minimum speed 7.6 → 4.0 m/s extended). TUCKED: span
// 0.55 m, 0.050 m² (fast/headwind flight, compact pack, low perch wind load); EXTENDED: overlapping film feathers slide out of
// the panels to span 1.0 m, 0.100 m², cambered, CLmax 1.25 (ASSUMED) → stall 5.1 m/s, so tailwind + minimum airspeed stays
// under the KE cap in tailwinds up to ≈6 m/s. Mass is held near the round-3 value because the KE cap (√(2·14.9 J/m)) must
// stay above the rider's straight-line speed: smaller tucked panel, 1.2 Wh cell, live person detection on the edge-AI MCU
// (STM32N6-class NPU) fed by a 1.5 g co-boresighted preview sensor on the gimbal (the shared 11 g vision board is a
// sensitivity: +8 g → cap −0.3 m/s).
const BOM_R4 = [
  { id: 'structure', g: 51, W: 0, zh: '结构：两片翼板 0.050 m²×330 g/m² 16.5 g，滑出式薄膜羽片 0.050 m²×120 g/m²（尼龙膜+碳羽轴）6 g + 滑轨/拉索/弹性连接 3 g，机身舱+伸缩尾杆 14 g，扇形尾 4 g，腹部滑橇+爪钉+翼尖滑橇 5 g，推进器支架 2 g，折叠弹簧 0.5 g', en: 'structure: 2 wing panels 0.050 m² × 330 g/m² 16.5 g, sliding film feathers 0.050 m² × 120 g/m² (ripstop + carbon shafts) 6 g + guides/cords/elastic links 3 g, pod + telescoping boom 14 g, fan tail 4 g, belly skid + claws + tip skids 5 g, prop pylon 2 g, fold springs 0.5 g', src: 'ASSUMED build-up (round-3 47 g fixed wing; LisHawk ripstop/carbon feathers)' },
  { id: 'motorProp', ...COMPONENTS.motorProp, n: 1, note: 'pusher on a 6 cm pylon above the wing (audit LF-07: no spray ingestion, no nose prop strike)' },
  { id: 'avionics', ...COMPONENTS.avionics, n: 1, note: 'FC/IMU, GNSS (u-blox M10 class), UWB 3-antenna L-array (range + 2-D phase-difference AoA of the rider tag), 8×8 ToF height' },
  { id: 'servo', ...COMPONENTS.servo, n: 4, note: '2 ruddervators + airbrake + feather/fold drive (one servo extends the feathers and folds the wings)' },
  { id: 'cam4k', ...COMPONENTS.cam4k, n: 1, note: 'shared 4K 16:9 module (3840×2160) behind a 22° HFOV M12 lens' },
  { id: 'gimbal2ax', ...COMPONENTS.gimbal2ax, n: 1, note: 'used as pan/tilt; roll is levelled digitally in the frame' },
  { id: 'wiring', ...COMPONENTS.wiring, n: 1 },
  { id: 'battery', g: 8, W: 0, zh: '1S 330 mAh 高倍率锂聚合物（1.2 Wh，一趟+储备）', en: '1S 330 mAh high-C LiPo (1.2 Wh: one run + reserve)', src: 'shared 150 Wh/kg pack level → 1.2 Wh' },
  { id: 'npu', g: 4, W: 0.6, zh: '边缘 AI 微控制器（STM32N6 级 NPU）：实时人物检测（云台锁定 + 输出裁切）与他人检测', en: 'edge-AI MCU (STM32N6-class NPU): live person detection (gimbal lock + output crop) and other-skier detection', src: 'ASSUMED (ST STM32N6 Neural-ART NPU, person-detection model-zoo class)' },
  { id: 'previewCam', g: 1.5, W: 0.2, zh: '共轴预览传感器（VGA，供检测）', en: 'co-boresighted VGA preview sensor (feeds the detector)', src: 'ASSUMED (OV-series VGA module class)' },
];
export const BOM_VISION = [...BOM_R4.filter((b) => b.id !== 'npu' && b.id !== 'previewCam'), { id: 'visionCompute', ...COMPONENTS.visionCompute, n: 1, note: 'shared vision board (sensitivity)' }];
// round-3 design kept for comparison (fixed 0.065 m² wing, 1.8 Wh)
export const BOM_R3 = [
  { id: 'structure', g: 47, W: 0 }, { id: 'motorProp', ...COMPONENTS.motorProp, n: 1 }, { id: 'avionics', ...COMPONENTS.avionics, n: 1 }, { id: 'servo', ...COMPONENTS.servo, n: 3 },
  { id: 'cam4k', ...COMPONENTS.cam4k, n: 1 }, { id: 'gimbal2ax', ...COMPONENTS.gimbal2ax, n: 1 }, { id: 'wiring', ...COMPONENTS.wiring, n: 1 }, { id: 'battery', g: 12, W: 0 }, { id: 'npu', g: 4, W: 0.6 },
];
const massOf = (bom) => +((budget(bom.map((b) => [{ g: b.g, W: b.W }, b.n || 1]), 0).gWithMargin) / 1000).toFixed(4);
export const BOM = BOM_R4;
export const BUDGET = budget(BOM.map((b) => [{ g: b.g, W: b.W }, b.n || 1]), 0);
export const MASS_KG = massOf(BOM_R4); // incl. the shared 15 % margin
export const MASS_KG_VISION = massOf(BOM_VISION);
export const MASS_KG_R3 = massOf(BOM_R3); // 0.1639 kg (round 3)
export const KE_CAP = keSpeedCap(MASS_KG); // 12.85 m/s
export { MASS_MARGIN };
export const KE_MARGIN = 0.7; // vCapG = KE cap − margin (the limiter holds ≈ vCapG − 0.6); land-now backs it up
// mass → KE-derived ground-speed cap (used by sensitivities: the cap is always re-derived from the mass)
export function designParams(mass = MASS_KG, margin = KE_MARGIN) {
  return { mass, vCapG: +(keSpeedCap(mass) - margin).toFixed(2) };
}

export const PDEF = {
  // airframe (round 4): feathers TUCKED span 0.55 m, 0.050 m², AR 6.05, CLmax 1.0; EXTENDED span 1.0 m, 0.100 m², AR 10,
  // CLmax 1.25 (cambered feather fan; LisHawk effective ≈1.4 incl. thrust at 4 m/s, ASSUMED), +0.006 cd0 (feather gaps).
  // Air brake: tucked 0.2 (split flap); extended 0.6 = feather/tail fan spread at incidence (bird braking; LisHawk drag ×5.8
  // at high incidence with wing+tail extended) — needed because terrain-following in a tailwind is a steep AIR path.
  // Morph drive: one servo, full travel 0.6 s (rate 1.67 /s) + 0.1 s lag; commanded from the wanted airspeed.
  mass: MASS_KG, S: 0.050, AR: 6.05, cd0: 0.04, reRef: 60000, reExp: 0.5, e: 0.8, clmax: 1.0, cla: 4.5, dcdBrake: 0.2, ldScale: 1,
  morph: 1, Sx: 0.100, ARx: 10, clmaxX: 1.25, cd0X: 0.006, dcdBrakeX: 0.6, morphRate: 1.67, morphTau: 0.1, morphVaLo: 8, morphVaHi: 10.5,
  // pusher folding prop on a pylon, 1104 motor; iteration 3: coarser 4×3 prop (pitch speed ≈28 m/s at ≈22 k rpm loaded) for the
  // 20 m/s airspeed a headwind lead needs, static thrust 1.6 → 1.3 N (ASSUMED; iteration-2 4″ prop: 1.6 N / 22 m/s, sensitivity)
  T0: 1.3, Vp: 28, propD: 0.102, etaProf: 0.65, etaMot: 0.72,
  // guidance
  vCapG: designParams().vCapG, vMinK: 1.2, hCruise: 3.0, lane: 9, side: -1, gapLand: 34, gapGo: 14, gapMin: 6, gapMax: 45,
  passEvery: 2, passMargin: 2.5, leadOnly: 0, kestrelWind: 7, trigK: 0.5, windMaxFly: 12.5, gustMaxFly: 15, tailKestrel: 99, tailAim: -15, headMaxFly: 99, pxRangeAdapt: 1,
  sepHard: 46, sepSoft: 30, sepLandAhead: 1, sepPredS: 0.3, stopGap: 15, bankFilm: 0.35, bankMax: 0.8, dwellMin: 2.5, restartGap: 44, restartGapTail: 32, liftoffSepMoving: 34, pxGapK: 390,
  // wind-aware operation (iteration 3): crab lead (KE-feasible air vector), progress gate, land-now on GNSS over-speed
  crab: 1, crabConfirm: 1, crabShortTurn: 1, crabFlip: 4, progMargin: 0, estBias: 1, spotHopMax: 0, gsSig: 0.1, pitotSig: 0.3, landNow: 1, landNowMargin: 0.25, chaseAfterPass: 1, chaseSep: 30, perchConfirmGap: 16, inflightPerch: 0, perchTailMax: 3, gateWindMargin: 0.4, antT: 1.0, gateBiasY: 1, gateHist: 5, gateMode: 1, leadStart: 30, endSpot: 1,
  // snow / perch
  muSkid: 0.08, muClaw: 0.9, muStatic: 0.3, anchorCap: 4.0, perchBase: 0.36, hcpSide: 0.09, perchCLnose: -0.25, perchCLtail: 0.35,
  cdaFront: 0.004, cdaSide: 0.022, perchMode: 1, featherActive: 1,
  // camera chain (shared cam4k 16:9)
  camHfov: 22, camRows: 2160, camAspect: 16 / 9, fill: 0.5, cropMinDeg: 5, trackHz: 4, latency: 0.1,
  gimbalHz: 8, eisRes: 0.1, frameLPHz: 1.0, postFrame: 2, detHz: 15, detLat: 0.08, detSig: 0.03, detBias: 0.03, liveHz: 0.4, liveFF: 1, ffLat: 0.1, ffSigV: 0.3, tiltMaxDeg: 5, camH: 0.12, rearCone: 125,
  // pointing on the rider (re-audit A2-LF-03): UWB AoA (DW3000 PDoA ±5°), GNSS relative bearing, height geometry, on-board vision
  pointModel: 'fused', pointSigDeg: 1.2, pointTau: 2, uwbSigDeg: 5, uwbTau: 0.5, gnssRelM: 1.5, gnssTau: 20, hErrM: 0.5, hTau: 5,
  vision: 1, visSigDeg: 0.4, visTau: 0.3, visPxMin: 32, previewDiv: 6, pDet: 0.9, visLost: 0.5,
  // airframe attitude response (camera only; forces stay point-mass)
  spHz: 3, spZeta: 0.5, drHz: 1.5, drZeta: 0.25, rollHz: 2, rollZeta: 0.7, rollTau: 0.08, kDih: 0.3, attGain: 1,
  // power (W) and energy (Wh)
  pAv: 1.0, pCam: COMPONENTS.cam4k.W, pGimbal: 1.0, pNpu: 0.8, pServo: 0.4, pStandby: 0.3, battWh: 1.2, bankWh: 14, bankEff: 0.85,
};

// ---------------------------------------------------------------- aero helpers
// geometry/polar of the morphing wing at feather extension mo ∈ [0, 1] (tucked → extended)
export function morphCfg(p, mo) {
  if (!p.morph || !(mo > 0)) return p;
  const S = p.S + mo * (p.Sx - p.S), AR = p.AR + mo * (p.ARx - p.AR);
  return { ...p, S, AR, clmax: p.clmax + mo * (p.clmaxX - p.clmax), cd0: p.cd0 + mo * p.cd0X, dcdBrake: p.dcdBrake + mo * (p.dcdBrakeX - p.dcdBrake) };
}
export function aero(p) {
  const k = 1 / (Math.PI * p.e * p.AR);
  const vStall = Math.sqrt((2 * p.mass * G) / (RHO * p.S * p.clmax));
  const span = Math.sqrt(p.AR * p.S), chord = p.S / span;
  return { k, vStall, W: p.mass * G, A: Math.PI * (p.propD / 2) ** 2, span, chord };
}
// zero-lift drag rises below the reference Reynolds number (laminar-bubble penalty, ASSUMED cd ∝ Re^-0.5; audit LF-15)
export function cd0At(p, V) {
  const { chord } = aero(p);
  const Re = Math.max(1e4, (Math.max(1, V) * chord) / NU);
  return p.cd0 * (Re < p.reRef ? Math.pow(p.reRef / Re, p.reExp) : 1);
}
export function ldAt(p, V, brake = 0) {
  const { k, W } = aero(p);
  const q = 0.5 * RHO * V * V;
  const cl = W / (q * p.S);
  if (cl > p.clmax) return 0;
  const cd = (cd0At(p, V) + brake * p.dcdBrake + k * cl * cl) / p.ldScale;
  return cl / cd;
}
export function thrustAvail(p, Va) { return p.T0 * Math.max(0, 1 - Va / p.Vp); }
export function motorPower(p, T, Va) {
  if (T <= 1e-6) return 0;
  const A = Math.PI * (p.propD / 2) ** 2;
  const vi = -Va / 2 + Math.sqrt((Va * Va) / 4 + T / (2 * RHO * A));
  return (T * (Math.max(0, Va) + vi)) / (p.etaProf * p.etaMot);
}

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rng) { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// body axes from yaw ψ, pitch θ, roll φ (right wing down +): forward f, left l, up u
export function bodyAxes(psi, th, phi) {
  const f = [Math.cos(th) * Math.cos(psi), Math.cos(th) * Math.sin(psi), Math.sin(th)];
  const l0 = [-Math.sin(psi), Math.cos(psi), 0];
  const u0 = cross(f, l0);
  const r0 = [-l0[0], -l0[1], -l0[2]];
  const u = [u0[0] * Math.cos(phi) + r0[0] * Math.sin(phi), u0[1] * Math.cos(phi) + r0[1] * Math.sin(phi), u0[2] * Math.cos(phi) + r0[2] * Math.sin(phi)];
  const l = cross(u, f);
  return { f, l, u };
}
// image roll of a pan/tilt camera on a body with up vector ub, looking along fs (rad, relative to the world horizon)
export function imageRoll(fs, ub) {
  const ta = cross(fs, ub);
  if (Math.hypot(ta[0], ta[1], ta[2]) < 1e-6) return 0;
  const cu = nrm(cross(nrm(ta), fs));
  const wu = nrm([-fs[2] * fs[0], -fs[2] * fs[1], 1 - fs[2] * fs[2]]);
  return Math.atan2(dot(cross(wu, cu), fs), dot(wu, cu));
}

export const PHASE = { STOWED: 0, LAUNCH: 1, LEAD: 2, LAND: 3, SLIDE: 4, PERCH: 5, TAKEOFF: 6, PICKUP: 7, STRANDED: 8 };
export const PHASE_NAME = ['stowed', 'launch', 'lead', 'land', 'slide', 'perch', 'takeoff', 'pickup', 'stranded'];

// Rewrite a simulated skier from tSlow on: straighten, snow-plough to vEnd, (optionally) stop at tStop; steer onto yTarget.
export function glideOut(sk, tSlow, vEnd = 4, tStop = null, decel = 1.6, yTarget = null) {
  const c = sk.col, dt = sk.sampleDt;
  const i0 = Math.max(1, Math.round(tSlow / dt));
  let x = c.x[i0 - 1], y = c.y[i0 - 1], v = c.v[i0 - 1], psi = c.psi[i0 - 1], lean = c.lean[i0 - 1], cr = c.crouch[i0 - 1];
  for (let i = i0; i < sk.n; i++) {
    const t = i * dt;
    const stopping = tStop != null && t >= tStop;
    const target = stopping ? 0 : vEnd;
    let a;
    if (stopping) { a = -3.0; v = Math.max(0, v + a * dt); }
    else if (v > target) { a = -decel; v = Math.max(target, v + a * dt); }
    else { a = 1.2; v = Math.min(target, v + a * dt); } // push / glide up to the run-out speed
    if (stopping && v < 0.05) v = 0;
    const psi0 = psi;
    const psiT = yTarget == null ? 0 : clamp(0.25 * (yTarget - y), -0.35, 0.35);
    psi += (psiT - psi) * Math.min(1, dt / 0.6);
    const vx = v * Math.cos(psi), vy = v * Math.sin(psi);
    x += vx * dt; y += vy * dt;
    const lat = v * (psi - psi0) / dt;
    lean += (Math.atan2(lat, G) - lean) * Math.min(1, dt / 0.12);
    cr += ((v < 0.3 ? 0.12 : 0.25) - cr) * Math.min(1, dt / 0.3);
    c.x[i] = x; c.y[i] = y; c.z[i] = -x * sk.tanS; c.psi[i] = psi; c.vx[i] = vx; c.vy[i] = vy;
    c.hx[i] = Math.cos(psi); c.hy[i] = Math.sin(psi); c.v[i] = v; c.lat[i] = lat; c.lon[i] = a; c.lean[i] = lean; c.crouch[i] = cr;
    c.plantL[i] = 0; c.plantR[i] = 0; if (c.riding) c.riding[i] = v > 0.3 ? 1 : 0;
  }
  return sk;
}

// Best downhill ground progress (m/s) the glider can make in a horizontal wind w while keeping ground speed ≤ the
// limiter target (vCapG − 0.6) and airspeed between 1.12 v_stall and the thrust + slope-gravity limit (crab allowed).
export function progressFeasible(p0, w, tanS) {
  if (p0.morph) { // best of tucked (fast, headwind) and extended (slow, tailwind)
    const a = progressFeasibleCfg(morphCfg(p0, 1), w, tanS), b = progressFeasibleCfg({ ...p0, morph: 0 }, w, tanS);
    return a.vProg >= b.vProg ? a : b;
  }
  return progressFeasibleCfg(p0, w, tanS);
}
function progressFeasibleCfg(p, w, tanS) {
  const { k, vStall } = aero(p);
  const W = p.mass * G, sinS = tanS / Math.sqrt(1 + tanS * tanS);
  const VaFloor = 1.12 * vStall, cap = p.vCapG - 0.3; // gate: steady ground speed ≤ vCapG − 0.3 (KE cap − 1.0 m/s)
  let best = -Infinity, bestTh = 0, bestVa = VaFloor;
  for (let kk = 0; kk < 72; kk++) {
    const th = (kk * Math.PI) / 36, c = Math.cos(th), s = Math.sin(th);
    for (let Va = VaFloor; Va < 30; Va += 0.25) {
      const q = 0.5 * RHO * Va * Va, cl = W / (q * p.S), D = q * p.S * (cd0At(p, Va) + k * cl * cl) / p.ldScale;
      const gx = w[0] + Va * c, gy = w[1] + Va * s, gh = Math.hypot(gx, gy, gx * tanS); // 3-D: terrain-following descent
      if (thrustAvail(p, Va) + W * sinS * (gh > 0.1 ? Math.max(0, gx / gh) : 0) < D) break; // terrain-following: gravity helps only downhill
      if (gh <= cap && Math.abs(gy) <= 2.5 && gx > best) { best = gx; bestTh = th; bestVa = Va; } // sustained track: ≤2.5 m/s drift across the piste (weave within the ±10 m lane hysteresis)
    }
  }
  return { vProg: best, theta: bestTh, Va: bestVa, VaFloor };
}

// ---------------------------------------------------------------- main simulation
// input: { duration, skier, tGo, wind, dt, seed, plan: { start: 'lead'|'perch'|'hand', gap0, launchAt, motorFailAt,
//          snow: 'groomed'|'powder'|'ice', neighbour: {t0,p0,v}, noFlyGate (default true) } }
export function runCore(p, input) {
  let { k, vStall, span } = aero(p);
  const vStallX = aero(morphCfg(p, 1)).vStall;
  let pc = p, mo = 0, moF = 0, moCmd = 0, vaWant = 12, lastVg = 0, lastVa = 0, vgDot = 0; // feather extension state (rate-limited servo)
  const m = p.mass, W = m * G;
  const sk = input.skier, tanS = sk.tanS, th = Math.atan(tanS), sinT = Math.sin(th), cosT = Math.cos(th);
  const nS = [sinT, 0, cosT]; // slope normal
  const zs = (x) => -x * tanS;
  const plan = input.plan || {};
  const snow = plan.snow || 'groomed';
  const muClaw = snow === 'ice' ? 0.35 : p.muClaw, anchorCap = snow === 'ice' ? 0.5 : p.anchorCap, muStatic = snow === 'ice' ? 0.12 : p.muStatic; // ice: claws barely bite (ASSUMED)
  const tGo = input.tGo || 0;
  const wind = makeWind(input.wind || {});
  const rng = mulberry(input.seed ?? 5);
  // Every wind gate/decision uses the shared on-board estimate (10 s trailing mean at the glider/holster position,
  // seeded ±1 m/s bias, 0.5 s lag; re-audit A2-LF-02). Guidance feed-forward uses the in-flight air-data wind
  // (GNSS velocity − airspeed vector, 2 s low-pass) carrying the SAME bias.
  const posHist = []; // glider (or holster) position every 0.1 s
  const posAt = (tq) => posHist.length ? posHist[Math.max(0, Math.min(posHist.length - 1, Math.round(tq / 0.1)))] : [0, 0, 0];
  const windSeed = input.windSeed ?? (input.wind && input.wind.seed) ?? 1;
  const est = windEstimate(wind, posAt, { seed: windSeed, bias: p.estBias ?? 1 });
  const wBias = windEstimate(() => [0, 0, 0], posAt, { seed: windSeed, bias: p.estBias ?? 1 })(0);
  let wE = [0, 0, 0]; // latest shared estimate (updated at 2 Hz)
  let gsErr = 0; // GNSS ground-speed error (Gauss–Markov, σ gsSig)
  let wsM = 0, wsV = 0, gustPk = 0, gsTrim = 0, perchMode = false, progNow = Infinity, crabMin = 0, kDir = 0, spotHops = 0, sepRate = 0, overT = 0, landNowFlag = false, crabSide = 0, crabActive = false, crabT = 0;
  const KEcap = Math.sqrt((2 * 14.9) / p.mass);
  const dt = input.dt || 0.005, every = Math.round(0.02 / dt);
  const n = Math.floor(input.duration / 0.02 + 1e-9) + 1;
  const rider = (t) => {
    if (t < tGo) { const s = skierAt(sk, 0); return { ...s, speed: 0, vel: [0, 0, 0] }; }
    return skierAt(sk, t - tGo);
  };
  const neigh = plan.neighbour ? (t) => {
    const nb = plan.neighbour, u = Math.max(0, t - nb.t0);
    const pos = [nb.p0[0] + nb.v[0] * u, nb.p0[1] + nb.v[1] * u, 0]; pos[2] = zs(pos[0]);
    return { pos, vel: [nb.v[0], nb.v[1], -nb.v[0] * tanS], active: t >= nb.t0 };
  } : null;

  // ---- outputs (20 ms samples)
  const keys = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'phase', 'agl', 'Va', 'CL', 'bank', 'thr', 'brake', 'T', 'pMot', 'pTot', 'eUsed',
    'gap', 'sep', 'wing', 'claw', 'sfPerch', 'cx', 'cy', 'cz', 'fx', 'fy', 'fz', 'ux', 'uy', 'uz', 'rollImg', 'occl', 'bx', 'by', 'bz', 'blx', 'bly', 'blz',
    'nbx', 'nby', 'nbz', 'nbDist', 'spray', 'sink', 'alpha', 'windH', 'leak', 'wBody', 'phiB', 'thB', 'psiB', 'pickup', 'riderStopped', 'gapT', 'crab', 'morph', 'eYaw', 'ePitch', 'vis'];
  const O = {}; for (const kk of keys) O[kk] = new Float64Array(n).fill(NaN);
  const events = [];
  const ev = (t, type, severity, zh, en, extra) => events.push({ t, type, severity, zh, en, ...(extra || {}) });

  // ---- state
  let phase, pos, vel, tPhase = 0;
  let CL = 0.4, bank = 0, thr = 0, brake = 0, thrI = 0, wing = 1, claw = 0;
  let sfMin = Infinity, perchCount = 0, hopCount = 0, eUsed = 0, Tcur = 0, pMot = 0;
  let ybar = 0, vsx = 0, laneOff = 0, hT = p.hCruise, landT0 = 0, landH0 = p.hCruise, gapTarget = p.gapLand;
  let passPending = false, failed = false, sink = 0, noFly = false, pickup = false, folded = false, sepLimitT = -9;
  const touchdowns = []; let flare = false, kestrel = false, alphaPS = 0, alphaT = 1.22, featherSign = 1, windHold = false, kEff = 0, leanEnv = 0;
  let sepLandFlag = false, behindT = 0, gaveUp = false, afterPass = false, tooFarT = 0, neighbourAvoid = 0, lastNbWarn = -9, tStopLast = -99, stoppedSince = null, lastStopDur = 0, endMode = false, behindWarn = false, sepPrev = 0;
  let hdg = [1, 0]; // body heading on the snow / airspeed heading in flight
  const wl = [0, 0, 0]; // in-flight air-data wind (GNSS ground velocity − airspeed vector), 2 s low-pass, incl. the estimate bias
  const s0 = rider(0);
  ybar = s0.pos[1]; vsx = s0.vel[0];
  let side = p.side;
  let yAmp = 4;
  // lane relative to the rider's mean line (iteration 3: no absolute piste clamp); when the lead is short the lane widens so the
  // rider stays far enough (sepFilm) for the subject to fit the crop on the 22° lens (no clamped, shaky framing at close range)
  let latFilm = 0, radiusPull = 0; // radiusPull (round 4): lane pulled towards the rider's line when the 3-D separation nears the follow-me radius
  const laneY = () => ybar + clamp(side * Math.max(p.lane - radiusPull, Math.max(p.lane, yAmp + 5, yAmp + latFilm) - radiusPull) + laneOff, -22, 22);
  // round 4 (A3-LF-04): no true-wind initialisation — the air-data wind starts at the bias alone and converges (τ 2 s) from
  // pitot measurements; pitot noise σ pitotSig (white, 50 Hz) on every gust/peak measurement
  for (let j = 0; j < 3; j++) wl[j] = wBias[j]; wsM = 0;
  let pitN = [0, 0];
  const start = plan.start || 'lead';
  let launchPending = false, liftoffT = null, gate = null;
  const lift = plan.lift || null; // lift-station geofence { pos: [x, y], rEnd } and the pick-up spot beside it
  let spot = null;
  if (start === 'hand' || start === 'stowed' || start === 'setdown') {
    phase = PHASE.STOWED; const b = bodyPoints(s0); pos = [...b.pelvis]; vel = [0, 0, 0]; wing = 0;
  } else if (start === 'perch') {
    phase = PHASE.PERCH; pos = [s0.pos[0] + (plan.gap0 ?? 30), laneY(), 0]; pos[2] = zs(pos[0]) + 0.03; vel = [0, 0, 0]; claw = 1; wing = 1;
  } else {
    const v0 = Math.min(p.vCapG - 0.8, Math.max(vStall * 1.5, s0.vel[0] + 2));
    phase = PHASE.LEAD; pos = [s0.pos[0] + (plan.gap0 ?? 15), laneY(), 0]; pos[2] = zs(pos[0]) + p.hCruise; vel = [v0, 0, -v0 * tanS];
  }
  // attitude states (yaw ψ, pitch θ, roll φ and rates): 2nd-order response of the airframe (camera model only)
  let psiB = Math.atan2(hdg[1], hdg[0]), thB = -th, phiB = 0, psiR = 0, thR = 0, phiR = 0;
  let axPrev = null, attInit = false, hdgGoal = null;
  // camera: pan/tilt world command (2nd order), pointing-estimate error (Gauss–Markov), gimbal residual
  let camYaw = Math.PI, camPitch = 0, camYawR = 0, camPitchR = 0;
  { const m0 = subjectPoints(s0).mid; camYaw = Math.atan2(m0[1] - pos[1], m0[0] - pos[0]); camPitch = Math.atan2(m0[2] - pos[2], Math.hypot(m0[0] - pos[0], m0[1] - pos[1])); } // turret starts on the rider
  const wn = 2 * Math.PI * p.trackHz, wg = 2 * Math.PI * p.gimbalHz;
  const sensorV = 2 * Math.atan(Math.tan((p.camHfov * Math.PI) / 360) / p.camAspect);
  const nativePxRad = p.camRows / sensorV;
  const latBuf = [];
  let eYaw = 0, ePitch = 0; const sig = (p.pointSigDeg * Math.PI) / 180, D2R = Math.PI / 180;
  // fused pointing (re-audit A2-LF-03): UWB PDoA azimuth (Gauss–Markov σ uwbSigDeg, τ uwbTau), GNSS relative position
  // (σ gnssRelM per axis, τ gnssTau → bearing error = cross-track/d), height geometry for elevation (σ hErrM / d), and
  // on-board person detection (lock σ visSigDeg) when the rider is inside the sensor and ≥ visPxMin preview px tall.
  let eU = 0, eGx = 0, eGy = 0, eH = 0, eVy = 0, eVp = 0, visLock = false, visMiss = 9, visDet = 0;
  let lockT = 0, pointErrSum = 0, pointErrN = 0;
  let dErr = [0, 0, 0]; // gimbal residual (small-angle displacement of the optical axis)
  let wTipD = 0; // spanwise vertical-gust difference

  // shared launch gate; returns true when refused (no-fly)
  const runGate = (t) => {
    const wg = est(t), wgh = Math.hypot(wg[0], wg[1]);
    // round 4: robust feasibility — the worst case over the estimate's own error box (cross-slope component ± gateBiasY,
    // downslope component + gateWindMargin): a cross-wind that exists only in the bias must not be relied on to crab
    let fz = null;
    for (const dy of [-p.gateBiasY, 0, p.gateBiasY]) for (const dx of [0, p.gateWindMargin]) {
      const f = progressFeasible(p, [wg[0] + dx, wg[1] + dy, 0], tanS);
      if (!fz || f.vProg < fz.vProg) fz = f;
    }
    const progShort = p.gateMode && plan.riderProg != null && fz.vProg < plan.riderProg - p.progMargin;
    gate = { t, hist: +Math.min(10, Math.max(0, t - 0.5)).toFixed(2), w: wg.map((v) => +v.toFixed(2)), vProg: +fz.vProg.toFixed(2), riderProg: plan.riderProg ?? null, refused: false };
    if (plan.noFlyGate !== false && (wgh > p.windMaxFly || progShort)) {
      noFly = true; gate.refused = true; gate.why = wgh > p.windMaxFly ? 'wind' : 'progress';
      ev(t, 'nofly', 'warning', wgh > p.windMaxFly
        ? `起飞闸门：估计风 ${wgh.toFixed(1)} m/s > ${p.windMaxFly} m/s（落位/抓取极限）：指示灯红，本趟不拍`
        : `起飞闸门：估计风（顺坡 ${wg[0].toFixed(1)} m/s）下滑翔机最大顺坡推进 ${fz.vProg.toFixed(1)} m/s，低于本滑雪者的 ${plan.riderProg.toFixed(1)} m/s − ${p.progMargin}：会被甩出 50 m 跟随半径，指示灯红，本趟不拍`,
        wgh > p.windMaxFly
        ? `Launch gate: estimated wind ${wgh.toFixed(1)} m/s > ${p.windMaxFly} m/s (perch/handling limit): LED red, no filming this run`
        : `Launch gate: in the estimated wind (downslope ${wg[0].toFixed(1)} m/s) the glider's best downhill progress under the KE cap is ${fz.vProg.toFixed(1)} m/s, below this rider's ${plan.riderProg.toFixed(1)} m/s − ${p.progMargin}: it would be left beyond the 50 m follow-me radius; LED red, no filming this run`);
      return true;
    }
    return false;
  };
  const gateT = Math.max(plan.launchAt ?? 0, (p.gateHist ?? 0) + 0.5);
  let gatePending = false;
  const setPhase = (ph, t, why) => { phase = ph; tPhase = 0; kDir = 0; if (ph !== PHASE.LAND) { flare = false; kestrel = false; alphaPS = 0; } if (why) ev(t, PHASE_NAME[ph], 'info', why.zh, why.en); };
  const nSteps = Math.round(input.duration / dt);
  let iOut = 0, wHold = [0, 0, 0];
  for (let step = 0; step <= nSteps; step++) {
    const t = step * dt;
    const s = rider(t);
    const stopped = s.speed < 1.5 && !s.fallen;
    if (stopped) { tStopLast = t; if (stoppedSince == null) stoppedSince = t; lastStopDur = t - stoppedSince; } else stoppedSince = null;
    // position history for the shared wind estimate; estimate refreshed at 2 Hz
    if (step % 20 === 0) posHist.push(phase === PHASE.STOWED ? bodyPoints(s).chest : [pos[0], pos[1], pos[2]]);
    if (step % 100 === 0) { wE = est(t); if (step % 400 === 0) progNow = progressFeasible(p, wE, tanS).vProg; }
    // end of run: positional lift-station geofence (mapped bottom station, e.g. OSM aerialway; re-audit: no timing oracle).
    // The glider lands on a pick-up spot at the piste edge beside the mapped lift entry and stays down.
    if (!endMode && lift && Math.hypot(lift.pos[0] - s.pos[0], lift.pos[1] - s.pos[1]) < lift.rEnd && t > (input.tGo || 0) + 5) {
      endMode = true;
      const sd = Math.sign(pos[1] - lift.pos[1]) || side;
      spot = [lift.pos[0] + (lift.ahead ?? 2), lift.pos[1] + sd * (lift.lat ?? 6)];
      ev(t, 'endmode', 'info', `进入缆车站地理围栏（${lift.rEnd} m）：本趟结束，滑翔机降落到缆车入口旁的拾取点后不再起飞`, `Inside the lift-station geofence (${lift.rEnd} m): run over; the glider lands on the pick-up spot beside the lift entry and stays down`);
    }
    if (!endMode && plan.endAt != null && t >= plan.endAt) { endMode = true; ev(t, 'endmode', 'info', '本趟结束（计划时刻）：滑翔机降落后不再起飞，等待拾取', 'Run over (planned time): the glider lands and stays down to be picked up'); }
    ybar += (s.pos[1] - ybar) * Math.min(1, dt / 6);
    vsx += (s.vel[0] - vsx) * Math.min(1, dt / 0.6);
    yAmp = Math.max(Math.abs(s.pos[1] - ybar), yAmp - 0.2 * dt);
    const gap = pos[0] - s.pos[0];
    const sepNow = Math.hypot(pos[0] - s.pos[0], pos[1] - s.pos[1], pos[2] - s.pos[2] - 1.0);
    radiusPull += ((sepNow > p.sepSoft ? Math.min(12, (sepNow - p.sepSoft) * 1.5) : 0) - radiusPull) * Math.min(1, dt / 0.8);
    { const sepFilm = 1.9 / (p.fill * sensorV); latFilm += (Math.sqrt(Math.max(0, sepFilm * sepFilm - gap * gap - (p.hCruise + 1) ** 2)) - latFilm) * Math.min(1, dt / 1.5); }
    // shared turbulence at 50 Hz (+ the two wing tips for the spanwise gradient), held for the sub-steps
    if (step % every === 0) {
      wHold = wind(t, pos);
      if (phase === PHASE.LAUNCH || phase === PHASE.LEAD || phase === PHASE.LAND) {
        const r = [Math.sin(psiB), -Math.cos(psiB), 0], hb = span / 2;
        wTipD = wind(t, [pos[0] + r[0] * hb, pos[1] + r[1] * hb, pos[2]])[2] - wind(t, [pos[0] - r[0] * hb, pos[1] - r[1] * hb, pos[2]])[2];
      } else wTipD = 0;
    }
    const w = wHold;
    for (let j = 0; j < 3; j++) wl[j] += (w[j] + wBias[j] - wl[j]) * Math.min(1, dt / 2);
    // gust peak of the measured (pitot/air-data, biased) wind: peak hold decaying 0.5 m/s per s (gust interlock)
    if (step % every === 0) pitN = [p.pitotSig * gauss(rng), p.pitotSig * gauss(rng)];
    gustPk = Math.max(gustPk - 0.5 * dt, Math.hypot(w[0] + wBias[0] + pitN[0], w[1] + wBias[1] + pitN[1]));
    // gust factor: running mean and σ (τ 5 s) of the measured wind speed → expected 3 s peak = mean + 2.5 σ
    { const sp = Math.hypot(w[0] + wBias[0] + pitN[0], w[1] + wBias[1] + pitN[1]), a = Math.min(1, dt / 5); if (step === 0) wsM = sp; wsM += (sp - wsM) * a; wsV += ((sp - wsM) ** 2 - wsV) * a; }
    const gustExp = wsM + 2.5 * Math.sqrt(Math.max(0, wsV));
    const wlh = Math.hypot(wl[0], wl[1]);
    const wEh = Math.hypot(wE[0], wE[1]);
    // fly on the downwind side of the rider in a crosswind (decision on the shared estimate)
    if (Math.abs(wE[1]) > 2.5 && (phase === PHASE.LEAD || phase === PHASE.LAUNCH || phase === PHASE.STOWED)) side = Math.sign(wE[1]);
    { const a = Math.exp(-dt / 2), b = p.gsSig * Math.sqrt(1 - a * a); gsErr = gsErr * a + b * gauss(rng); }
    const motorOK = plan.motorFailAt == null || t < plan.motorFailAt;
    if (plan.motorFailAt != null && Math.abs(t - plan.motorFailAt) < dt / 2) ev(t, 'motorfail', 'warning', '电机/电调故障：此后无法再起飞，只能滑翔降落', 'Motor/ESC failure: no more take-offs; glide-and-land only');
    const nb = neigh ? neigh(t) : null;
    tPhase += dt;
    // feather morph (round 4): extended for slow flight (tailwind / KE limiter / crab), take-off and landing; tucked for fast
    // (headwind) flight and on the snow (less perch wind load). Servo: 0.1 s lag + rate limit (no idealised actuator).
    if (p.morph) {
      if (phase === PHASE.LEAD || phase === PHASE.LAUNCH) moCmd = lastVg + p.antT * Math.max(0, vgDot) > p.vCapG - 0.9 && lastVa < 15 ? 1 : clamp((p.morphVaHi - vaWant) / (p.morphVaHi - p.morphVaLo), 0, 1); // near the KE cap: spread = air brake
      else if (phase === PHASE.LAND || phase === PHASE.TAKEOFF) moCmd = 1;
      else moCmd = 0;
      moF += (moCmd - moF) * Math.min(1, dt / p.morphTau);
      mo += clamp(moF - mo, -p.morphRate * dt, p.morphRate * dt);
      pc = morphCfg(p, mo); ({ k, vStall, span } = aero(pc));
    }
    // subject-size-aware lead distance: keep the lead inside the ≥330 px range of the 4K 4:3 sensor
    leanEnv = Math.max(Math.abs(s.lean || 0), leanEnv - 0.15 * dt);
    const hEff = 1.75 * (1 - 0.16 * (s.crouch ?? 0.3)) * Math.cos(Math.min(1.2, leanEnv));
    kEff = kEff ? kEff + (hEff * nativePxRad - kEff) * Math.min(1, dt / 2) : hEff * nativePxRad;
    // lead distance: the 3-D distance that still gives ≥ pxGapK px at the turn apex, and the follow-me radius (sepHard − 3 m, audit LF-13)
    { const lat = Math.abs(laneY() - s.pos[1]), dz = p.hCruise + 1;
      const dMax = p.pxRangeAdapt ? Math.min(kEff / p.pxGapK, p.sepHard - 3) : p.sepHard - 3;
      gapTarget = clamp(Math.min(p.gapLand, Math.sqrt(Math.max(0, dMax * dMax - lat * lat - dz * dz))), 12, p.gapLand); }
    Tcur = 0; pMot = 0;

    // ======================================================== carried (kinematic)
    if (phase === PHASE.STOWED) {
      const b = bodyPoints(s); pos = [b.pelvis[0], b.pelvis[1], b.pelvis[2]]; vel = [...s.vel];
      wing = 0; hdg = [s.heading[0], s.heading[1]];
      if (!noFly && plan.launchAt != null && t >= plan.launchAt) {
        // launch gate on the SHARED wind estimate (holster/glider sensor, 10 s trailing mean, ±1 m/s bias, 0.5 s lag):
        // (1) perch/handling limit |w| ≤ windMaxFly; (2) the glider must be able to keep pace with this rider downhill
        // without exceeding the KE speed cap (crab geometry, thrust + slope) — otherwise it would be left behind beyond
        // the 50 m follow-me radius. Rider progress is learned from the phone log of previous runs (plan.riderProg).
        // Round 4 (audit3 A3-LF-04 / brief): with the set-down launch the gate is evaluated once the estimate holds
        // ≥ gateHist s of data (the glider measures on the snow); toss/hand launches still gate at launchAt.
        if (start === 'setdown' || !runGate(t)) {
        if (start === 'setdown') {
          // set-down launch (iteration 3, headClear): the rider places the opened glider on the snow beside the skis and
          // stands up; it starts its own skid-run take-off away from the rider (same take-off as from every perch)
          const h = s.heading, l = [-h[1], h[0]];
          pos = [s.pos[0] + h[0] * 0.5 + l[0] * side * 1.5, s.pos[1] + h[1] * 0.5 + l[1] * side * 1.5, 0]; pos[2] = zs(pos[0]) + 0.03;
          vel = [0, 0, 0]; wing = 1; claw = 1; hdg = [h[0], h[1]]; launchPending = true; gatePending = true;
          setPhase(PHASE.PERCH, t, null); ev(t, 'setdown', 'info', '放在雪板旁的雪面上：机翼弹开，起身后它自行滑跑起飞（不再手抛）', 'Set down on the snow beside the skis: wings spring open; once the rider stands up it starts its own skid-run take-off (no hand toss)');
        } else {
          // one-hand toss from the hip holster (iteration-2 launch; kept as a variant: fails headClear)
          const h = s.heading;
          pos = [b.chest[0] + h[0] * 0.4, b.chest[1] + h[1] * 0.4 - 0.25, b.chest[2] + 0.35];
          vel = [s.vel[0] + h[0] * 4.5, s.vel[1] + h[1] * 4.5, s.vel[2] + 1.5];
          wing = 1; setPhase(PHASE.LAUNCH, t, { zh: '单手抛出：机翼弹开、推进电机启动', en: 'One-hand toss: wings spring open, pusher motor starts' });
          hT = Math.max(0.5, pos[2] - zs(pos[0]));
        }
        }
      }
    }
    const airborne = phase === PHASE.LAUNCH || phase === PHASE.LEAD || phase === PHASE.LAND;
    let eAir = null, alphaNow = 0;
    if (airborne) {
      const agl = pos[2] - zs(pos[0]);
      const hdot = vel[2] + vel[0] * tanS;
      const va = [vel[0] - w[0], vel[1] - w[1], vel[2] - w[2]];
      const Va = Math.hypot(va[0], va[1], va[2]);
      const vg = Math.hypot(vel[0], vel[1], vel[2]);
      // airspeed floor 1.2 v_stall; 1.12 v_stall while the KE limiter is active or the lead is too long (cannot fly slower otherwise)
      const VaFloor = (vg > p.vCapG - 1 || (phase === PHASE.LEAD && gap > gapTarget + 4) ? 1.12 : p.vMinK) * vStall;
      const toSpot = endMode && spot && p.endSpot;
      const yL = toSpot && spot[0] - pos[0] < 40 ? spot[1] : laneY(); // keep the side lane until close to the pick-up spot
      const vyCmd = clamp(0.6 * (yL - pos[1]), -3.5, 3.5);
      // into-wind (kestrel) approach: strong wind, headwind > 4 m/s or downslope wind > tailKestrel (shared estimate),
      // gusty air-data wind, or a land-now command
      // a downwind landing at the floor airspeed would exceed the speed cap → into-wind (independent of the launch gate)
      const tailLandOver = (wE[0] + 1.12 * vStallX) / Math.cos(th) > p.vCapG - 0.6;
      // give-up landings behind a receding rider are quick straight-ahead landings unless the KE rule needs into-wind
      if (phase === PHASE.LAND && !flare && !kestrel && (((wEh > p.kestrelWind || -wE[0] > 4 || wE[0] > p.tailKestrel || landNowFlag || tailLandOver) && tPhase < 0.05 && !(gaveUp && !tailLandOver && !landNowFlag)) || (wlh > p.kestrelWind + 1 && !gaveUp))) {
        kestrel = true;
        ev(t, 'kestrel', 'info', `风 ${wEh.toFixed(1)} m/s（估计）：转向迎风进近，对地速度低、不做失速拉平`, `Wind ${wEh.toFixed(1)} m/s (estimate): turning into wind for a slow-ground-speed approach, no stall flare`);
      }
      const vxDes = phase === PHASE.LAUNCH ? p.vCapG : phase === PHASE.LAND ? vsx
        : toSpot ? clamp(Math.max(vsx + 2, 0.5 * (spot[0] - pos[0])), 2, p.vCapG) // to the pick-up spot, never slower than the rider
        : clamp(vsx + clamp(0.45 * ((wEh > p.kestrelWind ? Math.min(p.gapMax, gapTarget + 8) : gapTarget) + 2 - gap), -4, 6), 0, p.vCapG);
      // speed protection 1 (GNSS ground-speed feedback, independent of the wind estimate): a trim integrates the measured
      // 3-D ground-speed excess and lowers both the wanted ground velocity and the feasibility limit of the air-heading choice
      { const vgM0 = vg + gsErr, cT = p.vCapG - 0.1; if (vgM0 > cT) gsTrim = Math.min(6, gsTrim + 4 * (vgM0 - cT) * dt); else if (vgM0 < cT - 0.8) gsTrim = Math.max(0, gsTrim - 0.5 * dt); }
      let airDes = [vxDes - gsTrim - wl[0], vyCmd - wl[1]];
      // KE-feasible air vector (iteration 3, crab lead): the glider cannot fly slower than 1.12 v_stall through the air, so in a
      // downslope wind the ground speed straight downwind would exceed the KE cap. Choose the air heading (at the floor airspeed)
      // whose ground velocity is closest to the wanted one with |v_ground| ≤ vCapG − 0.6; weave across the lane (hysteresis).
      crabActive = false;
      if (p.crab && (phase === PHASE.LEAD || phase === PHASE.LAUNCH)) {
        const capT = p.vCapG - 0.6 - gsTrim, aH = Math.hypot(airDes[0], airDes[1]), VaC = Math.max(VaFloor, aH);
        const sc = VaC / Math.max(1e-6, aH);
        const g3 = (gx, gy) => Math.hypot(gx, gy, gx * tanS); // terrain following: the downhill component also descends
        // round 4: the predicted (air-data, biased) over-speed must be confirmed by the measured GNSS ground speed
        if (aH < VaFloor && g3(wl[0] + airDes[0] * sc, wl[1] + airDes[1] * sc) > capT && (!p.crabConfirm || vg + gsErr > capT - 0.5)) {
          crabActive = true; crabT += dt;
          if (!crabSide) crabSide = Math.sign(yL - pos[1]) || side;
          if ((yL - pos[1]) * crabSide < -p.crabFlip) crabSide = -crabSide;
          let best = null, bc = Infinity;
          for (let kk = 0; kk < 72; kk++) {
            const th = (kk * Math.PI) / 36, ax = VaC * Math.cos(th), ay = VaC * Math.sin(th);
            const gx = wl[0] + ax, gy = wl[1] + ay, gh = g3(gx, gy);
            const c = (gx - (vxDes - gsTrim)) ** 2 + (gy - vyCmd) ** 2 + (Math.sign(gy) === crabSide || Math.abs(gy) < 0.5 ? 0 : 100) + (gh <= capT ? 0 : 1000 + 100 * (gh - capT) ** 2);
            if (c < bc) { bc = c; best = [ax, ay]; }
          }
          airDes = best;
        }
        // GNSS feedback (robust to the wind-estimate bias): if the measured 3-D ground speed still exceeds the target with the
        // airspeed at its floor, open a minimum crab angle off the downwind direction (integrator, 0.35 rad/s per m/s excess)
        const vgM = vg + gsErr;
        if (vgM > p.vCapG && Va < VaFloor + 1.0) crabMin = Math.min(1.6, crabMin + 0.35 * (vgM - capT) * dt);
        else if (vgM < capT - 0.8) crabMin = Math.max(0, crabMin - 0.1 * dt);
        if (crabMin > 0.02 && wlh > 1) {
          const dw = Math.atan2(wl[1], wl[0]), ad = Math.atan2(airDes[1], airDes[0]), rel = wrap(ad - dw);
          if (Math.abs(rel) < crabMin) {
            if (!crabSide) crabSide = Math.sign(yL - pos[1]) || side;
            const a = dw + (Math.sign(rel) || crabSide) * crabMin, m = Math.max(VaFloor, Math.hypot(airDes[0], airDes[1]));
            airDes = [m * Math.cos(a), m * Math.sin(a)]; crabActive = true; crabT += crabT ? 0 : 0;
          }
        }
      }
      vgDot += (clamp((vg - lastVg) / dt, -20, 20) - vgDot) * Math.min(1, dt / 0.2); lastVg = vg; lastVa = Va;
      vaWant = crabActive ? 0 : vg > p.vCapG - 1.5 || gsTrim > 0.2 ? Math.min(Math.hypot(airDes[0], airDes[1]), Va) - 1 : Math.hypot(airDes[0], airDes[1]); // limiter active: wants ≈1 m/s less airspeed
      let err;
      // round 4: a give-up landing in a tailwind goes CROSS-wind (towards the rider's side) when that ground speed is safe —
      // an into-wind approach would drift the glider backwards out of the follow-me radius
      const wDir = Math.atan2(wl[1], wl[0]);
      const crossLand = kestrel && wl[0] > 2 && (gaveUp || s.speed > 3) && Math.hypot(wlh, VaFloor) * Math.sqrt(1 + tanS * tanS) <= p.vCapG - 0.3;
      const aimChi = crossLand ? (Math.cos(wDir + Math.PI / 2) * (s.pos[0] - pos[0]) + Math.sin(wDir + Math.PI / 2) * (s.pos[1] - pos[1]) >= 0 ? wDir + Math.PI / 2 : wDir - Math.PI / 2) : wDir + Math.PI;
      if (phase === PHASE.LAND && kestrel) {
        // into-wind approach: floor airspeed while still turning (never fast downwind), wind-matched airspeed once into wind
        const intoW = (va[0] * Math.cos(aimChi) + va[1] * Math.sin(aimChi)) / Math.max(0.1, Math.hypot(va[0], va[1])) > 0.5;
        err = (intoW && !crossLand ? Math.max(VaFloor, Math.min(wlh + 0.5, 12)) : VaFloor) - Va;
      }
      else if (phase === PHASE.LAUNCH) err = p.vCapG;
      else if (phase === PHASE.LAND) err = clamp(Math.hypot(airDes[0], airDes[1]), VaFloor, 1.55 * vStall) - Va;
      else err = Math.max(VaFloor, Math.hypot(airDes[0], airDes[1])) - Va;
      if (Va < VaFloor) err = Math.max(err, VaFloor - Va);
      if (vg > p.vCapG - 0.6) err = Math.min(err, p.vCapG - 0.6 - vg);
      // independent over-speed protection on the GNSS ground speed (σ gsSig): > KE cap − 0.15 m/s for 0.3 s → land now, into wind
      overT = vg + gsErr > KEcap - p.landNowMargin ? overT + dt : 0;
      if (p.landNow && wE[0] > 2 && vg + gsErr > p.vCapG - 1.5 && gustPk > p.gustMaxFly && !landNowFlag && phase === PHASE.LEAD) { /* a headwind gust only slows it */ landNowFlag = true; ev(t, 'landnow', 'warning', `阵风 ${gustPk.toFixed(1)} m/s 超过 ${p.gustMaxFly} m/s：立即迎风降落`, `Gust ${gustPk.toFixed(1)} m/s above ${p.gustMaxFly} m/s: land now, into wind`); }
      if (p.landNow && overT > 0.3 && !landNowFlag && phase === PHASE.LEAD) { landNowFlag = true; ev(t, 'landnow', 'warning', `GNSS 对地速度 ${(vg + gsErr).toFixed(1)} m/s 接近动能上限 ${KEcap.toFixed(1)} m/s：立即迎风降落`, `GNSS ground speed ${(vg + gsErr).toFixed(1)} m/s at the KE cap ${KEcap.toFixed(1)} m/s: land now, into wind`); }
      thrI = clamp(thrI + 0.25 * err * dt, -0.8, 0.6); // negative integral = steady airbrake
      let thrCmd = clamp(0.35 * err + thrI, 0, 1), brakeCmd = clamp(-0.45 * err - thrI, 0, 1);
      if (vg + p.antT * Math.max(0, vgDot) > p.vCapG - 0.8) thrCmd = 0; // round 4: anticipates the ground-speed rise (GNSS acceleration)
      brakeCmd = Math.max(brakeCmd, clamp(1.5 * (vg - (p.vCapG - 0.5)), 0, 1));
      if (phase === PHASE.LEAD && tPhase < 2.5 && vg > p.vCapG - 1.4) thrCmd = 0; // just after a take-off: the thrust lag would overshoot the cap
      if (phase === PHASE.LAUNCH) { thrCmd = vg > p.vCapG - 1.4 ? 0 : 1; brakeCmd = clamp(1.5 * (vg - (p.vCapG - 0.9)), 0, 1); } // KE limiter also during the climb-out
      if (phase === PHASE.LAND && !kestrel) thrCmd = Va < VaFloor * 0.95 && agl > 0.8 ? 0.4 : 0;
      if (!motorOK) thrCmd = 0;
      thr += (thrCmd - thr) * Math.min(1, dt / 0.08);
      brake += (brakeCmd - brake) * Math.min(1, dt / 0.15);
      let hTarget = p.hCruise, hdotCmd = null, hdotFF = 0;
      if (phase === PHASE.LAUNCH) { hT += (Math.min(p.hCruise, hT + 1) - hT) * Math.min(1, dt / 1.0); hTarget = Math.max(hT, 1.2); }
      else if (phase === PHASE.LEAD) {
        // speed protection 2 (energy): when the airbrake cannot hold the ground speed, stop following the terrain down —
        // hold the absolute altitude (height above snow grows at the slope rate, max 8 m), so gravity stops feeding speed
        if (vg + gsErr > p.vCapG - 0.4 && brake > 0.8) hT = Math.min(8, hT + Math.max(0, vel[0]) * tanS * dt);
        else hT += (p.hCruise - hT) * Math.min(1, dt / 1.2);
        hTarget = hT;
      }
      else {
        const u = t - landT0;
        if (kestrel) {
          const intoWind = hdg[0] * Math.cos(aimChi) + hdg[1] * Math.sin(aimChi) > 0.9;
          const uMax = crossLand ? 2 : 6;
          hTarget = intoWind || u > uMax ? 0 : Math.max(1.2, landH0 - (wl[0] > 2 ? 0 : 1.5) * u); // cross-wind landings also wait until aligned (no dive while still downwind) // tailwind: hold height until into wind (no dive while turning); descend anyway after 6 s
          if (intoWind || u > uMax) { hdotCmd = agl > 0.6 ? (crossLand ? -1.6 : -1.2) : -0.5; }
        } else {
          const sinkR = vg > p.vCapG - 1 ? 1.5 : 3.0; // shallower approach when the KE limiter is active (tailwind)
          hTarget = Math.max(0.4, landH0 - sinkR * u); if (hTarget > 0.4) hdotFF = -sinkR;
          if (agl < 0.5 && !flare) { flare = true; alphaT = clamp((20 + 7 * (Math.min(vg, Va) - 3)) * Math.PI / 180, 0.35, 1.22); ev(t, 'flare', 'info', `失速拉平（栖落机动）：${Va.toFixed(1)} m/s、离雪 ${agl.toFixed(2)} m`, `Post-stall perching flare at ${Va.toFixed(1)} m/s, ${agl.toFixed(2)} m above the snow`); }
        }
      }
      const azCmd = clamp(hdotCmd != null ? 3.0 * (hdotCmd - hdot) : 2.0 * (hTarget - agl) + 2.0 * (hdotFF - hdot), -6, 12);
      const e = Va > 0.5 ? [va[0] / Va, va[1] / Va, va[2] / Va] : [1, 0, 0];
      eAir = e;
      const u0 = nrm([-e[2] * e[0], -e[2] * e[1], 1 - e[2] * e[2]]);
      const s0v = cross(e, u0); // right-wing direction
      // camera-friendly guidance: bank ≤ bankFilm while tracking the lane (roll is levelled digitally), bankMax otherwise
      const bLim = phase === PHASE.LEAD && Math.abs(yL - pos[1]) < 3 && !kestrel ? p.bankFilm : p.bankMax;
      let bankCmd;
      if (kestrel) {
        const chiT = aimChi, chi = Math.atan2(e[1], e[0]);
        let dk = wrap(chiT - chi);
        // a large into-wind turn goes towards the rider's side when the rider is stopping (perch stays inside the follow-me
        // radius), away from the rider's line otherwise (never land in the rider's path)
        const inward = (Math.sign((s.pos[1] - pos[1]) * Math.cos(chi) - (s.pos[0] - pos[0]) * Math.sin(chi)) || 1) * (s.speed < 3 ? 1 : -1);
        if (kDir === 0 && Math.abs(dk) > 2.0) kDir = inward; // latch the turn direction for this approach
        if (kDir > 0 && dk < -0.3) dk += 2 * Math.PI; else if (kDir < 0 && dk > 0.3) dk -= 2 * Math.PI;
        bankCmd = clamp(Math.atan((Va * 1.2 * -dk) / G), -0.75, 0.75);
      } else {
        const chiT = Math.atan2(airDes[1], airDes[0]), chi = Math.atan2(e[1], e[0]);
        const dchi = wrap(chiT - chi);
        bankCmd = clamp(Math.atan((Va * 1.5 * -dchi) / G), -bLim, bLim);
        // crab weave: never turn through the downwind sector where the ground speed would exceed the cap — go round through upwind
        // round 4: the short reversal through downwind is allowed only while that passage stays ≥0.5 m/s under the KE cap
        const passOver = (wlh + VaFloor) * Math.sqrt(1 + tanS * tanS) > KEcap - 0.5;
        if (crabActive && Math.abs(dchi) > 0.3 && (!p.crabShortTurn || passOver)) {
          let bad = false;
          for (let kk = 1; kk <= 8 && !bad; kk++) { const a = chi + (dchi * kk) / 8, gx = wl[0] + VaFloor * Math.cos(a); if (Math.hypot(gx, wl[1] + VaFloor * Math.sin(a), gx * tanS) > p.vCapG + 0.3) bad = true; }
          if (bad) bankCmd = Math.sign(dchi) * p.bankMax;
        }
      }
      bank += (bankCmd - bank) * Math.min(1, dt / 0.2);
      const q = 0.5 * RHO * Va * Va;
      const cd0 = cd0At(pc, Va);
      const Dprev = q * pc.S * (cd0 + brake * pc.dcdBrake + k * CL * CL) / p.ldScale, Tprev = thr * thrustAvail(p, Va);
      const Lneed = (m * (G + azCmd) + Dprev * e[2] - Tprev * e[2]) / Math.max(0.35, Math.cos(bank) * u0[2]);
      const CLcmd = q > 0.5 ? clamp(Lneed / (q * pc.S), -0.4, pc.clmax) : pc.clmax;
      CL += (CLcmd - CL) * Math.min(1, dt / 0.08);
      let CD = (cd0 + brake * pc.dcdBrake + k * CL * CL) / p.ldScale;
      alphaNow = CL / p.cla;
      if (phase === PHASE.LAND && flare) {
        // post-stall perching flare (Cory & Tedrake 2008): pitch up in ~0.3 s (deep stall, mostly drag), flat-plate CN = 1.8·sin α (ASSUMED)
        alphaPS += (alphaT - alphaPS) * Math.min(1, dt / 0.1);
        const CN = 1.8 * Math.sin(alphaPS);
        CL = CN * Math.cos(alphaPS); CD = cd0 + CN * Math.sin(alphaPS);
        bank += (0 - bank) * Math.min(1, dt / 0.1); thr = 0; alphaNow = alphaPS;
      }
      const L = q * pc.S * CL, D = q * pc.S * CD;
      Tcur = thr * thrustAvail(p, Va);
      pMot = motorPower(p, Tcur, Va);
      const ld = [Math.cos(bank) * u0[0] + Math.sin(bank) * s0v[0], Math.cos(bank) * u0[1] + Math.sin(bank) * s0v[1], Math.cos(bank) * u0[2] + Math.sin(bank) * s0v[2]];
      const F = [L * ld[0] - D * e[0] + Tcur * e[0], L * ld[1] - D * e[1] + Tcur * e[1], L * ld[2] - D * e[2] + Tcur * e[2] - W];
      for (let j = 0; j < 3; j++) { vel[j] += (F[j] / m) * dt; pos[j] += vel[j] * dt; }
      if (Math.hypot(e[0], e[1]) > 0.2) { const hl = Math.hypot(e[0], e[1]); hdg = [e[0] / hl, e[1] / hl]; }
      // --- transitions
      if (phase === PHASE.LAUNCH && tPhase > 1.2 && agl > 1.0) setPhase(PHASE.LEAD, t, null);
      if (phase === PHASE.LEAD) {
        if (gap < -2 && !stopped && !behindWarn && !afterPass) {
          behindWarn = true; ev(t, 'fallbehind', 'warning', `滑雪者顺坡速度 ${vsx.toFixed(1)} m/s，滑翔机受动能限速 ${p.vCapG} m/s：落到滑雪者后方，继续伴飞（尾部相机前视受遮挡），等滑雪者停下再到前方降落`, `Rider downhill speed ${vsx.toFixed(1)} m/s vs the KE-capped ${p.vCapG} m/s: the glider drops behind and keeps flying alongside (tail camera partly blocked forward); it lands ahead at the next stop`);
        }
        if (gap > 0) { behindWarn = false; afterPass = false; }
        // cannot regain the lead (headwind / rider faster) and the separation keeps growing: land rather than trail beyond the follow-me radius
        behindT = gap < -8 && !stopped && !afterPass ? behindT + dt : 0;
        // iteration 3: keep chasing (filming from the side/behind) while inside the follow-me radius; land only near it
        sepRate += ((sepNow - sepPrev) / dt - sepRate) * Math.min(1, dt / 0.5);
        if (behindT > 0.5 && sepNow > p.sepHard - (wE[0] > 2 ? 24 : 6) && sepNow + (wE[0] > 3 ? 5.5 : 2.5) * Math.max(0, sepRate) > p.sepHard - 2 && !gaveUp) { gaveUp = true; ev(t, 'giveup', 'warning', `落后 ${(-gap).toFixed(0)} m、接近 50 m 跟随半径：降落等待，滑雪者下次停下时飞到其前方`, `${(-gap).toFixed(0)} m behind, near the 50 m follow-me radius: lands and waits; relocates ahead at the rider's next stop`); }
        // mid-ride perch only when the rider is slow enough for a ≥ dwellMin s approach shot before the re-launch trigger
        const trigPred = Math.max(p.gapGo, p.gapMin + Math.max(0.5, vsx) * p.trigK);
        const dwellPred = (gapTarget - 4 - trigPred) / Math.max(0.5, vsx);
        // cannot fly slower than the rider's progress (min airspeed + tailwind, slow riders): the lead grows → perch instead
        tooFarT = gap > gapTarget + 2.5 && vsx < 8 ? tooFarT + dt : 0; // slow riders only (iteration 3)
        let wantLand = !p.leadOnly && wE[0] < p.perchTailMax && (dwellPred >= p.dwellMin || (tooFarT > 2 && vsx < p.vCapG - 0.6 - 1.5)) && gap >= (wlh > p.kestrelWind ? Math.min(p.gapMax, gapTarget + 8) : gapTarget) && tPhase > 1.5;
        // rider stopping (hockey stop: deceleration > 3 m/s²) or stopped: land ≥ stopGap ahead and wait
        if ((stopped || (s.accel < -3 && s.speed < 11)) && t > tGo + 1 && tPhase > 1.0) wantLand = gap > p.stopGap;
        if (endMode && !(spot && p.endSpot) && tPhase > 0.5) wantLand = gap > 6 || gap < -3;
        if (s.fallen && gap > 6) wantLand = true;
        if (!motorOK && tPhase > 0.5) wantLand = gap > 8 || agl < 1.5;
        if (sepNow + p.sepPredS * Math.max(0, sepRate) > p.sepHard - (gap > 0 ? p.sepLandAhead : 3) && sepNow > sepPrev && tPhase > 0.5) { // follow-me radius: land rather than exceed it (also when the rider has stopped)
          wantLand = true; sepLandFlag = true;
          if (t - sepLimitT > 3) { sepLimitT = t; ev(t, 'seplimit', 'info', `距离 ${sepNow.toFixed(0)} m 达到 ${p.sepHard} m 硬限：降落而非超出跟随半径`, `Separation ${sepNow.toFixed(0)} m reached the ${p.sepHard} m hard limit: landing rather than exceeding the follow-me radius`); }
        }
        if (wantLand && nb && nb.active) {
          let dmin = Infinity;
          for (let u = 0; u <= 5; u += 0.25) {
            const nx = nb.pos[0] + nb.vel[0] * u, ny = nb.pos[1] + nb.vel[1] * u;
            const tx = clamp(nx, pos[0] + 6, pos[0] + 18);
            dmin = Math.min(dmin, Math.hypot(nx - tx, ny - yL));
          }
          if (dmin < 5) {
            wantLand = false;
            if (t - lastNbWarn > 2) { lastNbWarn = t; neighbourAvoid++; ev(t, 'nbavoid', 'info', '落位区预测有其他滑雪者经过：推迟降落、外移航线', 'Another skier predicted through the touchdown zone: landing postponed, lane shifted outwards'); }
            laneOff = clamp(laneOff + side * 0.2, -6, 6);
          }
        }
        // aim past the spot (skating down to it is cheap, side-stepping up is not); into-wind approaches fall shorter
        if (toSpot && tPhase > 0.5) { const aim = spot[0] + (wE[0] > p.tailKestrel ? p.tailAim : wEh > p.kestrelWind || -wE[0] > 4 ? 10 : 4); wantLand = aim - pos[0] < vg * 0.9 + 2 || pos[0] > aim; }
        // in-flight progress check on the shared estimate: it cannot keep pace with this rider → land AHEAD now and film the
        // approach from the perch (hop-and-perch); it will not chase (follow-me radius) — the rider picks it up when passing
        // round 4: the model/estimate verdict must be confirmed by the MEASURED outcome (GNSS/UWB lead shrinking below perchConfirmGap)
        if (p.inflightPerch && plan.riderProg != null && progNow < plan.riderProg - 0.3 && tPhase > 1 && (!p.perchConfirmGap || gap < p.perchConfirmGap)) {
          if (!perchMode) { perchMode = true; ev(t, 'perchmode', 'warning', `飞行中风估计：最大顺坡推进 ${progNow.toFixed(1)} m/s 跟不上滑雪者：在前方降落，从落位处拍迎面镜头，不再追赶`, `In-flight wind estimate: best downhill progress ${progNow.toFixed(1)} m/s cannot keep pace with the rider: lands ahead, films the approach from the perch, does not chase`); }
          wantLand = true;
        }
        if (gaveUp) wantLand = true;
        if (landNowFlag) wantLand = true;
        if (wantLand) { landT0 = t; landH0 = agl; setPhase(PHASE.LAND, t, null); }
      }
      if (phase === PHASE.LAND && gap < p.gapMin && gap > -2 && !gaveUp && !failed && motorOK && s.speed > 2 && !kestrel && !landNowFlag && !sepLandFlag) {
        setPhase(PHASE.LEAD, t, { zh: '降落时滑雪者过近：复飞', en: 'Rider too close during the landing: go-around' });
      }
      if (pos[2] - zs(pos[0]) <= 0.03) {
        pos[2] = zs(pos[0]) + 0.03;
        const vn = dot(vel, nS);
        const keTd = 0.5 * m * dot(vel, vel);
        const td = { t, vNormal: -vn, ke: keTd, v: Math.hypot(vel[0], vel[1], vel[2]), gap, kestrel };
        touchdowns.push(td); landNowFlag = false; sepLandFlag = false; crabSide = 0;
        for (let j = 0; j < 3; j++) vel[j] -= vn * nS[j];
        ev(t, 'touchdown', 'info', `触雪：${td.v.toFixed(1)} m/s，法向 ${(-vn).toFixed(2)} m/s，动能 ${keTd.toFixed(1)} J${kestrel ? '（迎风）' : ''}`, `Touchdown: ${td.v.toFixed(1)} m/s, normal ${(-vn).toFixed(2)} m/s, KE ${keTd.toFixed(1)} J${kestrel ? ' (into wind)' : ''}`);
        if (phase !== PHASE.LAND) ev(t, 'unplanned', 'warning', '非计划触雪', 'Unplanned snow contact');
        setPhase(PHASE.SLIDE, t, null); thr = 0; thrI = 0;
        sink = snow === 'powder' ? 0.08 : 0;
      }
    } else if (phase === PHASE.SLIDE || phase === PHASE.PERCH || phase === PHASE.TAKEOFF || phase === PHASE.STRANDED || phase === PHASE.PICKUP) {
      // ======================================================== on the snow (planar slope), body axes from hdg
      const hb = [hdg[0], hdg[1], 0], sd = [-hdg[1], hdg[0], 0];
      const va = [vel[0] - w[0], vel[1] - w[1], vel[2] - w[2]];
      const wRel = [-va[0], -va[1], -va[2]];
      const wFwd = dot(wRel, hb), wSide = dot(wRel, sd);
      const wa = Math.hypot(wFwd, wSide);
      const qW = 0.5 * RHO * (wRel[0] ** 2 + wRel[1] ** 2 + wRel[2] ** 2);
      let Fa = [0, 0, 0], Lup = 0, fF = 0, fS = 0;
      if (phase === PHASE.TAKEOFF) {
        if (hdgGoal) { const a0 = Math.atan2(hdg[1], hdg[0]), a1 = Math.atan2(hdgGoal[1], hdgGoal[0]); const da = clamp(wrap(a1 - a0), -1.0 * dt, 1.0 * dt); hdg = [Math.cos(a0 + da), Math.sin(a0 + da)]; }
        const Vf = Math.max(0, dot(va, hb));
        const qq = 0.5 * RHO * Vf * Vf;
        const rot = Vf > 1.15 * vStall ? 0.85 * pc.clmax : 0.35;
        Lup = qq * pc.S * rot;
        const D = qq * pc.S * (cd0At(pc, Vf) + k * rot * rot);
        Tcur = motorOK && Math.hypot(vel[0], vel[1], vel[2]) < p.vCapG - 2 ? thrustAvail(p, Vf) : 0; pMot = motorPower(p, Tcur, Vf); // no thrust on the skid run near the KE cap (gravity already accelerates it)
        Fa = [(Tcur - D) * hb[0], (Tcur - D) * hb[1], 0];
      } else {
        featherSign += ((wFwd >= 0 ? 1 : -1) - featherSign) * Math.min(1, dt / 1.0);
        const aligned = Math.sign(wFwd || 1) === Math.sign(featherSign || 1);
        const featherCL = p.perchMode ? (p.featherActive ? (aligned ? p.perchCLnose : p.perchCLtail) : (wFwd > 0 ? p.perchCLtail : p.perchCLnose)) * (Math.abs(wFwd) / Math.max(0.3, wa)) : 0;
        const vertCL = clamp(3.0 * 0.2 * dot(wRel, nS) / Math.max(0.5, wa), -0.3, 0.3);
        const wOpen = wing > 0.5;
        const CLp = wOpen ? featherCL + vertCL : 0.1 * vertCL;
        Lup = qW * (wOpen ? pc.S : 0.012) * CLp;
        fF = 0.5 * RHO * Math.abs(wFwd) * wFwd * (p.cdaFront + (wOpen ? 0.003 : 0));
        fS = 0.5 * RHO * Math.abs(wSide) * wSide * p.cdaSide * (wOpen ? 1.2 : 1);
        Fa = [fF * hb[0] + fS * sd[0], fF * hb[1] + fS * sd[1], 0];
      }
      const g = [0, 0, -G], gn = dot(g, nS);
      const gt = [g[0] - gn * nS[0], g[1] - gn * nS[1], g[2] - gn * nS[2]];
      const N = Math.max(0, m * G * cosT - Lup);
      const FaN = dot(Fa, nS); const Fat = [Fa[0] - FaN * nS[0], Fa[1] - FaN * nS[1], Fa[2] - FaN * nS[2]];
      const Ft = [m * gt[0] + Fat[0], m * gt[1] + Fat[1], m * gt[2] + Fat[2]];
      const vt = Math.hypot(vel[0], vel[1], vel[2]);
      claw = phase === PHASE.TAKEOFF ? 0 : phase === PHASE.SLIDE ? (tPhase > 0.15 ? 1 : 0) : 1;
      const plough = sink > 0 ? 70 * 0.06 * sink * vt * vt + 0.6 * sink * 10 : 0;
      const mu = claw ? muClaw : p.muSkid;
      if (phase === PHASE.SLIDE || phase === PHASE.TAKEOFF) {
        const fr = mu * N + plough;
        const vdir = vt > 1e-3 ? [vel[0] / vt, vel[1] / vt, vel[2] / vt] : [0, 0, 0];
        for (let j = 0; j < 3; j++) vel[j] += ((Ft[j] - fr * vdir[j]) / m) * dt;
        const vn = dot(vel, nS); for (let j = 0; j < 3; j++) vel[j] -= vn * nS[j];
        if (vt > 1e-3 && dot(vel, vdir) < 0) vel = [0, 0, 0];
        if (phase === PHASE.TAKEOFF) { const hs = nrm([hb[0], hb[1], -hb[0] * tanS]); const vh = Math.max(0, dot(vel, hs)); vel = [hs[0] * vh, hs[1] * vh, hs[2] * vh]; } // skid run: the belly skid has high side friction, motion follows the heading
        if (phase === PHASE.SLIDE) {
          const vt2 = Math.hypot(vel[0], vel[1], vel[2]);
          const Ftm = Math.hypot(Ft[0], Ft[1], Ft[2]);
          if (vt2 < 0.05 && Ftm <= muStatic * N + (claw ? anchorCap : 0)) { vel = [0, 0, 0]; setPhase(PHASE.PERCH, t, null); perchCount++; ev(t, 'perch', 'info', `落位第 ${perchCount} 次：爪钉入雪，尾部云台相机对准上坡的滑雪者`, `Perch #${perchCount}: claws in, tail pan/tilt camera on the uphill rider`); }
          if (tPhase > 12 && !failed) { failed = true; ev(t, 'slideaway', 'invalid', '冰面上爪钉不咬雪：持续下滑，落位失败', 'Claws do not bite on ice: keeps sliding, perch failed'); setPhase(PHASE.STRANDED, t, null); vel = [0, 0, 0]; }
        } else {
          const Vf = dot(va, hb);
          if (Math.hypot(vel[0], vel[1], vel[2]) > p.vCapG - 0.6 && !(Lup >= m * G * cosT * 0.98 && Vf > 1.1 * vStall)) {
            // skid run reaching the speed limit without lift (downwind run): abort, claws down
            ev(t, 'tkoabort', 'warning', '滑跑到限速仍未离地（顺风）：中止起飞，爪钉刹停', 'Skid run at the speed limit without lift-off (downwind): take-off aborted, claws down');
            setPhase(PHASE.SLIDE, t, null);
          } else if (Lup >= m * G * cosT * 0.98 && Vf > 1.1 * vStall) {
            for (let j = 0; j < 3; j++) vel[j] += 0.6 * nS[j];
            pos[2] += 0.02;
            hT = 0.2; setPhase(PHASE.LEAD, t, null);
            if (liftoffT == null) liftoffT = t;
            ev(t, 'liftoff', 'info', `离地：${Math.hypot(vel[0], vel[1]).toFixed(1)} m/s，领先滑雪者 ${gap.toFixed(1)} m`, `Lift-off at ${Math.hypot(vel[0], vel[1]).toFixed(1)} m/s, ${gap.toFixed(1)} m ahead of the rider`);
          } else if (tPhase > 4 || (tPhase > 2 && vt < 0.5)) {
            failed = true;
            setPhase(PHASE.STRANDED, t, { zh: '起飞失败（粉雪中犁雪阻力大于推力）：原地等待回收', en: 'Take-off failed (powder ploughing drag exceeds thrust): waiting to be collected' });
            vel = [0, 0, 0];
          }
        }
        for (let j = 0; j < 3; j++) pos[j] += vel[j] * dt;
        if (phase !== PHASE.LEAD) pos[2] = zs(pos[0]) + 0.03 - sink;
      } else {
        // static perch: claw anchors + static friction vs tangential load; uplift; tipping about the wing-tip skid line
        const Ftm = Math.hypot(Ft[0], Ft[1], Ft[2]);
        const cap = muStatic * N + (claw ? anchorCap : 0);
        const base = p.perchMode && wing > 0.5 ? p.perchBase : 0.035;
        const Mover = Math.abs(fS) * p.hcpSide + Math.abs(fF) * 0.05 + (p.perchMode ? Math.max(0, Lup) * 0.1 : 0);
        const Mrest = Math.max(0, m * G * cosT) * base;
        const sf = Math.min(cap / Math.max(1e-6, Ftm), Mrest / Math.max(1e-6, Mover), (m * G * cosT) / Math.max(1e-6, Lup));
        if (phase === PHASE.PERCH && tPhase > 0.3) sfMin = Math.min(sfMin, sf);
        if (sf < 1 && phase === PHASE.PERCH && !failed) {
          failed = true;
          ev(t, 'perchfail', 'invalid', `落位失稳（安全系数 ${sf.toFixed(2)}）：被风推滑/掀翻，此后翻滚未建模`, `Perch failure (safety factor ${sf.toFixed(2)}): pushed/tipped by wind; tumbling not modelled beyond this`);
          setPhase(PHASE.STRANDED, t, null);
        }
        vel = [0, 0, 0];
        pos[2] = zs(pos[0]) + 0.03 - sink;
        if (step % every === 0 && iOut < n) O.sfPerch[iOut] = sf;
      }
      // ---------------- perch decisions
      if (phase === PHASE.PERCH) {
        const closing = Math.max(0.5, vsx);
        const dLat = Math.abs(s.pos[1] - pos[1]);
        let go = false;
        // pick-up mode: the rider stopped within the last 40 s and now comes slowly straight at it → hold, fold when beside it
        const dHor = Math.hypot(gap, s.pos[1] - pos[1]);
        const farFromSpot = spot && p.endSpot && Math.hypot(spot[0] - pos[0], spot[1] - pos[1]) > 12;
        if (endMode && farFromSpot && spotHops < p.spotHopMax && !folded && (stopped || Math.hypot(s.pos[0] - pos[0], s.pos[1] - pos[1]) > 20) && sepNow < p.sepHard - 2 && Math.hypot(s.pos[0] - pos[0], s.pos[1] - pos[1]) > 6 && tPhase > 1) {
          go = true; gaveUp = false; spotHops++; // relocate to the pick-up spot (short hop inside the follow-me radius)
        } else if (!pickup && endMode) {
          pickup = true; ev(t, 'pickupmode', 'info', '收尾：留在雪面等待拾取（滑雪者滑到旁边停下）', 'End of run: stays on the snow to be picked up (the rider glides up and stops beside it)');
        }
        if (pickup && dHor < 2.5 && s.speed < 0.3 && !folded) { folded = true; setPhase(PHASE.PICKUP, t, { zh: '滑雪者停在旁边：机翼自动折叠、相机停止，等待拾取', en: 'Rider stopped beside it: wings fold themselves, camera stops, ready to be picked up' }); }
        if (phase === PHASE.PERCH && !pickup && s.speed > 2 && !s.fallen) {
          const trig = Math.max(p.gapGo, p.gapMin + closing * p.trigK);
          const dLatPred = Math.min(dLat, Math.abs(ybar - pos[1]) - yAmp);
          if (passPending && gap < 25 && dLatPred < 5) { passPending = false; ev(t, 'passabort', 'info', `经过镜头取消：滑雪者转弯摆幅可能距落位点仅 ${Math.max(0, dLatPred).toFixed(1)} m`, `Pass shot cancelled: the rider's turn swing may come within ${Math.max(0, dLatPred).toFixed(1)} m of the perch`); }
          if (!passPending && gap <= trig) go = true;
          // restart after a rest: take off at once so the lead is kept while the rider accelerates (perched shot traded for flight)
          if (lastStopDur > 2 && t - tStopLast < 3 && sepNow < (wE[0] > 2 ? p.restartGapTail : p.restartGap) && gap > 3) go = true; // round 4: tighter restart radius in a tailwind
          if (passPending && gap < 0.5) { go = true; passPending = false; afterPass = true; }
          if (go && Math.hypot(gap, dLat) < 8) go = false;
          if (go && s.speed > 8 && gap > -3 && gap < s.speed * 3 + 5 && dLat < 12) go = false; // round 4: no skid run while a fast rider would reach the run within ≈3 s
        }
        // rider stopped while the glider is behind or abreast: relocate ahead (take-off run ≥5 m to the side)
        if (launchPending && tPhase > 0.4 && t >= gateT) { // set-down launch: the rider has stood up; gate on ≥ gateHist s of estimate
          if (gatePending) { gatePending = false; if (runGate(t)) { setPhase(PHASE.STOWED, t, null); launchPending = false; } }
          if (phase === PHASE.PERCH) go = true;
        }
        // gave up behind the rider: relocate ahead once the rider stops (inside the follow-me radius)
        if (phase === PHASE.PERCH && gaveUp && stopped && stoppedSince != null && t - stoppedSince > 1.5 && sepNow < p.sepHard - 2 && !endMode) { gaveUp = false; go = true; }
        if (phase === PHASE.PERCH && !gaveUp && !endMode && (!pickup || gap < -3) && stopped && t > tGo + 1 && gap < 3 && dLat >= 5 && stoppedSince != null && t - stoppedSince > 1.5) { go = true; pickup = false; }
        if (phase === PHASE.PERCH && nb && nb.active && !go) {
          for (let u = 0; u <= 2.5; u += 0.1) {
            const dx = nb.pos[0] + nb.vel[0] * u - pos[0], dy = nb.pos[1] + nb.vel[1] * u - pos[1];
            if (Math.hypot(dx, dy) < 3 && Math.hypot(nb.pos[0] - pos[0], nb.pos[1] - pos[1]) > 10) { go = true; laneOff = clamp(laneOff + side * 3, -6, 6); ev(t, 'nbhop', 'info', '其他滑雪者将从落位点经过：提前起飞并外移', 'Another skier about to pass the perch: early take-off, moving outwards'); break; }
          }
        }
        if (go && gaveUp) go = false;
        if (go && launchPending && s.speed > 3 && gap < -3) go = false; // round 4: the rider has already left: never chase from the start spot
        if (go && (sepNow > p.sepHard - 3 || (gap < 0 && sepNow + 3 * s.speed > p.sepHard - 4) || (s.speed > 3 && !launchPending && sepNow > p.liftoffSepMoving))) go = false; // round 4: no lift-off far from a moving rider // never lift off outside the follow-me radius (receding rider: predicted at lift-off)
        if (perchMode && plan.riderProg != null && progNow >= plan.riderProg + 0.5) perchMode = false; // wind eased
        const chase = p.chaseAfterPass && wE[0] < p.perchTailMax && gap < -3 && !stopped && sepNow <= p.chaseSep && !endMode; // round 4: follow a rider who passed (stay inside the radius, relocate ahead at the next stop)
        if (go && !chase && (perchMode || (plan.riderProg != null && progNow < plan.riderProg - 0.3)) && !stopped && !launchPending) go = false; // hop-and-perch: stays down while the rider moves
        // chase a rider who has already passed only if it can out-pace them in this wind and they are still close
        if (go && !launchPending && gap < -3 && !stopped && !chase && (sepNow > 30 || (plan.riderProg != null && progNow < plan.riderProg + 0.5))) go = false;
        if (go && (wEh > p.windMaxFly || gustPk > p.gustMaxFly || gustExp > p.gustMaxFly)) {
          if (!windHold) { windHold = true; ev(t, 'windhold', 'warning', `估计风 ${wEh.toFixed(1)} m/s 超出飞行包线：留在落位处，风减弱后再起飞`, `Estimated wind ${wEh.toFixed(1)} m/s outside the flight envelope: stays perched, takes off once it eases`); }
          go = false;
          // round 4: at the start of the run a held launch is a refusal (LED red after 2 s): the rider picks it up again
          if (launchPending && tPhase > 2 + Math.max(0, gateT - (plan.launchAt ?? 0)) && plan.noFlyGate !== false) {
            noFly = true; launchPending = false; if (gate) { gate.refused = true; gate.why = 'gust'; }
            ev(t, 'nofly', 'warning', '起飞阵风联锁：指示灯红，本趟不拍（拾起放回枪套）', 'Launch gust interlock: LED red, no filming this run (picked up again)');
            setPhase(PHASE.STOWED, t, null);
          }
        }
        if (go && !motorOK) {
          if (!failed) { failed = true; ev(t, 'stranded', 'warning', '无法起飞（电机故障）：静止等待，滑雪者经过时停下拾取', 'Cannot take off (motor failure): waiting; the rider stops and picks it up'); }
          go = false;
          setPhase(PHASE.STRANDED, t, null);
        }
        if (go) {
          if (!launchPending) hopCount++;
          if (!launchPending && p.passEvery > 0 && ((hopCount - 1) % p.passEvery) === 0 && vsx < p.vCapG - p.passMargin) passPending = true;
          // wind-aware take-off heading (shared estimate): least ground speed needed for lift-off, never towards the rider
          // (≥ 100° off the rider bearing), small preference for downhill; it pivots on its belly skid before the run (ASSUMED)
          { const rx = pos[0] - s.pos[0], ry = pos[1] - s.pos[1], rl = Math.hypot(rx, ry) || 1;
            let bestA = null, bc = Infinity;
            for (let kk = 0; kk < 24; kk++) {
              const a = (kk * Math.PI) / 12 - Math.PI, hx = Math.cos(a), hy = Math.sin(a);
              if (gap < -6) { if (hx < 0.3) continue; } // relocating ahead of a rider downhill of it: take off downhill (rider ≥6 m away)
              else if (rl > 0.5 && (hx * rx + hy * ry) / rl < Math.cos((80 * Math.PI) / 180)) continue;
              if (launchPending && hx < 0) continue; // the rider stands uphill of the set-down point
              const vNeed = 1.15 * vStallX + (wE[0] * hx + wE[1] * hy);
              if (vNeed > p.vCapG - 1) continue;
              const c = vNeed - (s.speed > 2 ? 6 : 1.5) * hx; // rider moving: strongly downhill (keep the lead)
              if (c < bc) { bc = c; bestA = a; }
            }
            if (bestA === null) { go = false; if (!windHold) { windHold = true; ev(t, 'windhold', 'warning', '没有可用的起飞方向（逆风滑跑会朝向滑雪者，顺风滑跑会超速）：留在雪面', 'No admissible take-off heading (into wind would be towards the rider, downwind would over-speed): stays on the snow'); } }
            else { hdgGoal = [Math.cos(bestA), Math.sin(bestA)]; const dA = Math.abs(wrap(bestA - Math.atan2(hdg[1], hdg[0]))); if (dA > 0.5 || launchPending) hdg = [...hdgGoal]; }
          }
          if (go) { if (launchPending) launchPending = false; setPhase(PHASE.TAKEOFF, t, null); }
        }
      }
    }
    if (airborne) claw = 0;
    if (phase === PHASE.PICKUP) wing += (0 - wing) * Math.min(1, dt / 0.6);
    // energy: camera chain on whenever the glider is out of the holster (also while perched and waiting)
    const camOn = phase !== PHASE.STOWED && phase !== PHASE.PICKUP;
    const pTot = (camOn ? p.pAv + p.pCam + p.pGimbal + p.pNpu + (airborne ? p.pServo : 0.05) : p.pStandby) + pMot;
    eUsed += pTot * dt;

    // ======================================================== airframe attitude (camera model)
    let psiT, thT, phiT, wR, zR, onAir = airborne;
    if (airborne && eAir) {
      psiT = Math.atan2(eAir[1], eAir[0]); thT = Math.asin(clamp(eAir[2], -1, 1)) + alphaNow; phiT = bank;
    } else if (phase === PHASE.STOWED) {
      psiT = Math.atan2(s.heading[1], s.heading[0]); thT = 1.2; phiT = 0;
    } else {
      const fg = nrm([hdg[0], hdg[1], -hdg[0] * tanS]);
      psiT = Math.atan2(hdg[1], hdg[0]); thT = Math.asin(fg[2]) + (phase === PHASE.TAKEOFF ? 0.05 : 0);
      phiT = Math.atan(hdg[1] * tanS);
    }
    if (onAir) {
      // pitch: short period follows the air-path elevation + α; yaw: weakly damped Dutch roll follows the air heading
      // (gusts change the air vector faster than the body can follow); roll: autopilot holds the bank against the
      // spanwise gust gradient p_g = Δw_tip/b and sideslip (dihedral)
      const wsp = 2 * Math.PI * p.spHz, wdr = 2 * Math.PI * p.drHz; wR = 2 * Math.PI * p.rollHz; zR = p.rollZeta;
      const beta = wrap(psiT - psiB);
      thR += (wsp * wsp * (thT - thB) - 2 * p.spZeta * wsp * thR) * dt;
      psiR += (wdr * wdr * beta - 2 * p.drZeta * wdr * psiR) * dt;
      const pg = (wTipD / span) * p.attGain;
      phiR += (wR * wR * (phiT - phiB) - 2 * zR * wR * phiR + pg / p.rollTau + p.kDih * wR * wR * beta * p.attGain) * dt;
    } else {
      const wq = 2 * Math.PI * 2.5; // body on skids / in the hand: firm but not instantaneous
      thR += (wq * wq * (thT - thB) - 2 * 0.7 * wq * thR) * dt;
      psiR += (wq * wq * wrap(psiT - psiB) - 2 * 0.7 * wq * psiR) * dt;
      phiR += (wq * wq * (phiT - phiB) - 2 * 0.7 * wq * phiR) * dt;
    }
    if (!attInit) { attInit = true; psiB = psiT; thB = thT; phiB = phiT; psiR = thR = phiR = 0; }
    thB += thR * dt; psiB = wrap(psiB + psiR * dt); phiB += phiR * dt;
    const ax = bodyAxes(psiB, thB, phiB);
    let omega = [0, 0, 0];
    if (axPrev) {
      const a1 = cross(axPrev.f, ax.f), a2 = cross(axPrev.l, ax.l), a3 = cross(axPrev.u, ax.u);
      omega = [(a1[0] + a2[0] + a3[0]) / (2 * dt), (a1[1] + a2[1] + a3[1]) / (2 * dt), (a1[2] + a2[2] + a3[2]) / (2 * dt)];
    }
    axPrev = ax;

    // ======================================================== camera: pan/tilt command + gimbal residual
    const camPos = phase === PHASE.STOWED ? [pos[0], pos[1], pos[2] + 0.05]
      : [pos[0] - ax.f[0] * 0.24 + ax.u[0] * 0.03, pos[1] - ax.f[1] * 0.24 + ax.u[1] * 0.03, pos[2] - ax.f[2] * 0.24 + ax.u[2] * 0.03 + (airborne ? 0 : p.camH - 0.03)];
    // rider pointing estimate (UWB range + angle-of-arrival + GNSS): Gauss–Markov angular error σ, τ (ASSUMED)
    const sp = subjectPoints(s);
    if (p.pointModel === 'gm') { const a = Math.exp(-dt / p.pointTau), b = sig * Math.sqrt(1 - a * a); eYaw = eYaw * a + b * gauss(rng); ePitch = ePitch * a + b * gauss(rng); }
    else {
      const gm = (x, s1, tau) => { const a = Math.exp(-dt / tau); return x * a + s1 * Math.sqrt(1 - a * a) * gauss(rng); };
      eU = gm(eU, p.uwbSigDeg * D2R, p.uwbTau); eGx = gm(eGx, p.gnssRelM, p.gnssTau); eGy = gm(eGy, p.gnssRelM, p.gnssTau); eH = gm(eH, p.hErrM, p.hTau);
      eVy = gm(eVy, p.visSigDeg * D2R, p.visTau); eVp = gm(eVp, p.visSigDeg * D2R, p.visTau);
      const dx = sp.mid[0] - camPos[0], dy = sp.mid[1] - camPos[1], dH = Math.max(2, Math.hypot(dx, dy)), d3 = Math.hypot(dH, sp.mid[2] - camPos[2]);
      const eGa = (-eGx * dy + eGy * dx) / (dH * dH); // cross-track GNSS error → bearing error
      const sU = p.uwbSigDeg * D2R, sG = Math.max(1e-4, p.gnssRelM / dH);
      const azF = (eU / (sU * sU) + eGa / (sG * sG)) / (1 / (sU * sU) + 1 / (sG * sG));
      const elF = eH / d3;
      // vision: is the true subject inside the current sensor frame, big enough on the preview?
      let det = false;
      if (p.vision && phase !== PHASE.STOWED && phase !== PHASE.PICKUP && axPrev) {
        const fPrev = [O.fx[Math.max(0, iOut - 1)], O.fy[Math.max(0, iOut - 1)], O.fz[Math.max(0, iOut - 1)]];
        if (Number.isFinite(fPrev[0])) {
          const l = nrm([dx, dy, sp.mid[2] - camPos[2]]);
          const off = Math.acos(clamp(dot(l, fPrev), -1, 1));
          const pxPrev = (1.6 / d3) * nativePxRad / p.previewDiv;
          const half = Math.min(sensorV / 2, (p.camHfov * D2R) / 2) - 0.8 / d3;
          if (off < half && pxPrev >= p.visPxMin && step % every === 0) det = rng() < p.pDet;
        }
      }
      if (step % every === 0) { if (det) { visDet++; visMiss = 0; if (visDet >= 3) visLock = true; } else { visMiss += 0.02; visDet = 0; if (visMiss > p.visLost) visLock = false; } }
      if (visLock) { eYaw = eVy; ePitch = eVp; lockT += dt; } else { eYaw = azF; ePitch = elF; }
      pointErrSum += eYaw * eYaw + ePitch * ePitch; pointErrN++;
    }
    latBuf.push([sp.mid[0], sp.mid[1], sp.mid[2], s.vel[0], s.vel[1], s.vel[2]]);
    if (latBuf.length > Math.max(1, Math.round(p.latency / dt))) latBuf.shift();
    const tl = p.latency + 2 * 0.9 / wn; // predict the rider over the measurement latency + the turret's velocity lag (UWB/GNSS velocity)
    const td = [latBuf[0][0] + latBuf[0][3] * tl - vel[0] * 2 * 0.9 / wn, latBuf[0][1] + latBuf[0][4] * tl - vel[1] * 2 * 0.9 / wn, latBuf[0][2] + latBuf[0][5] * tl - vel[2] * 2 * 0.9 / wn];
    const dv = [td[0] - camPos[0], td[1] - camPos[1], td[2] - camPos[2]];
    const yawT = Math.atan2(dv[1], dv[0]) + eYaw, pitchT = Math.atan2(dv[2], Math.hypot(dv[0], dv[1])) + ePitch;
    const dyw = wrap(yawT - camYaw), ddp = pitchT - camPitch;
    camYawR += (wn * wn * dyw - 2 * 0.9 * wn * camYawR) * dt; camYawR = clamp(camYawR, -5.2, 5.2);
    camPitchR += (wn * wn * ddp - 2 * 0.9 * wn * camPitchR) * dt; camPitchR = clamp(camPitchR, -5.2, 5.2);
    camYaw += camYawR * dt; camPitch += camPitchR * dt;
    const fCmd = [Math.cos(camPitch) * Math.cos(camYaw), Math.cos(camPitch) * Math.sin(camYaw), Math.sin(camPitch)];
    // gimbal residual: body rotation ω×f leaks into the optical axis, the 1st-order stabiliser removes it at ω_g
    const fs0 = nrm([fCmd[0] + dErr[0], fCmd[1] + dErr[1], fCmd[2] + dErr[2]]);
    const leakRate = cross(omega, fs0);
    for (let j = 0; j < 3; j++) dErr[j] += (leakRate[j] - wg * dErr[j]) * dt;
    { const dn = dot(dErr, fCmd); for (let j = 0; j < 3; j++) dErr[j] -= dn * fCmd[j]; }
    const fwd = nrm([fCmd[0] + dErr[0], fCmd[1] + dErr[1], fCmd[2] + dErr[2]]);
    const rollImg = imageRoll(fwd, ax.u);
    // occlusion: in flight / on the take-off run the tail camera cannot see forward past ±rearCone from the tail
    let occl = 0;
    if (airborne || phase === PHASE.TAKEOFF || phase === PHASE.SLIDE) {
      const fh = Math.hypot(fwd[0], fwd[1]);
      const ang = Math.acos(clamp(-(fwd[0] * hdg[0] + fwd[1] * hdg[1]) / Math.max(1e-6, fh), -1, 1)) * 180 / Math.PI;
      if (ang > p.rearCone) occl = 1;
    }
    const spray = (phase === PHASE.SLIDE && tPhase < 0.6) || (phase === PHASE.TAKEOFF && tPhase < 0.4) ? 1 : 0; // touchdown shock / skid-run snow spray (ASSUMED unusable)

    // ======================================================== record
    if (step % every === 0 && iOut < n) {
      const i = iOut;
      O.x[i] = pos[0]; O.y[i] = pos[1]; O.z[i] = pos[2]; O.vx[i] = vel[0]; O.vy[i] = vel[1]; O.vz[i] = vel[2];
      O.phase[i] = phase; O.agl[i] = pos[2] - zs(pos[0]);
      O.Va[i] = Math.hypot(vel[0] - w[0], vel[1] - w[1], vel[2] - w[2]); O.CL[i] = CL; O.bank[i] = bank * 180 / Math.PI; O.thr[i] = thr; O.brake[i] = brake;
      O.T[i] = Tcur; O.pMot[i] = pMot; O.pTot[i] = pTot; O.eUsed[i] = eUsed / 3600; O.windH[i] = wlh;
      O.gap[i] = gap; O.sep[i] = sepNow;
      O.wing[i] = wing; O.claw[i] = claw;
      O.cx[i] = camPos[0]; O.cy[i] = camPos[1]; O.cz[i] = camPos[2]; O.fx[i] = fwd[0]; O.fy[i] = fwd[1]; O.fz[i] = fwd[2];
      O.ux[i] = ax.u[0]; O.uy[i] = ax.u[1]; O.uz[i] = ax.u[2]; O.rollImg[i] = rollImg * 180 / Math.PI;
      O.bx[i] = ax.f[0]; O.by[i] = ax.f[1]; O.bz[i] = ax.f[2]; O.blx[i] = ax.l[0]; O.bly[i] = ax.l[1]; O.blz[i] = ax.l[2];
      O.morph[i] = mo; O.eYaw[i] = eYaw; O.ePitch[i] = ePitch; O.vis[i] = visLock ? 1 : 0;
      O.alpha[i] = phase === PHASE.LAND && flare ? alphaPS : airborne ? alphaNow : 0; O.occl[i] = occl; O.spray[i] = spray; O.sink[i] = sink;
      O.leak[i] = Math.hypot(dErr[0], dErr[1], dErr[2]) * 180 / Math.PI; O.wBody[i] = Math.hypot(omega[0], omega[1], omega[2]) * 180 / Math.PI;
      O.phiB[i] = phiB * 180 / Math.PI; O.thB[i] = thB * 180 / Math.PI; O.psiB[i] = psiB * 180 / Math.PI;
      O.pickup[i] = pickup ? 1 : 0; O.gapT[i] = gapTarget; O.crab[i] = crabActive ? 1 : 0; O.riderStopped[i] = stopped ? 1 : 0;
      if (nb) { O.nbx[i] = nb.pos[0]; O.nby[i] = nb.pos[1]; O.nbz[i] = nb.pos[2]; O.nbDist[i] = nb.active ? Math.hypot(nb.pos[0] - pos[0], nb.pos[1] - pos[1], nb.pos[2] + 0.9 - pos[2]) : NaN; }
      iOut++;
    }
    sepPrev = sepNow;
  }
  return { O, n, events, rider, tanS, touchdowns, sfMin, perchCount, hopCount, nativePxRad, sensorV, vStall, neighbourAvoid, failed, neigh, noFly, folded,
    gate, liftoffT, spot, crabT, visLockShare: pointErrN ? lockT / (pointErrN * dt) : 0, pointRmsDeg: pointErrN ? Math.sqrt(pointErrSum / pointErrN) * 180 / Math.PI : 0, wBias, gaveUp };
}
