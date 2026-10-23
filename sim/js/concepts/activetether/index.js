// activetether (SIM-032 phase 2, 2026-10-20): "active-tether follow-cam" — a ≈0.1 kg folding flyer stowed in a
// hinged lumbar quiver; the back unit detects the ride start (IMU+GNSS+baro), swings the quiver out, launches on a
// straight glide and pays out line; the flyer is flown BRAKED at ≈50° elevation (airbrake/depower glide-ratio servo,
// roll steering, AoA loop on pitot+vane) while the reel holds length, pays out on surplus lift and reels in on a lift
// deficit (KE-governed); on a stop it brakes into a deep stall (never fast reel-in), lands behind or flies in, is towed
// back flagged and captured nose-first in the quiver trumpet (ASSUMED capture model), and the quiver folds back.
// Phase-1 consensus integrated from research/active_tether_2026_10_20/{science_aero,science_control,engineering,product}.
// Physics + autonomy: model.js; camera/footage/safety geometry: analysis.js; design basis: design.js; detector:
// detect.js. Numerical-uncalibrated simulation; the demo is an illustration driven by the same physics. Nothing is
// validated and no physical test was run.
import { simulateSkier, skierAt, SKIER_PRESETS } from '../common/skier.js';
import { simulateRun, FULLRUN_PLAN, FULLRUN_CASES_R4, availMask, pct } from '../common/fullrun.js';
import { makeResult } from '../common/result.js';
import { addStd, footageStability } from '../common/criteria.js';
import { enduranceMin } from '../common/components.js';
import { runCore, resolveP, PDEF, MODE, MODE_NAME, AIRBORNE } from './model.js';
import { analyse, linePoints } from './analysis.js';
import { wornBudget, packVolume, flyerBudget, podBudget, BACK_STATIC_W, FLYERS } from './design.js';
import { ENSEMBLE } from './ensemble.js';

const MV = 'activetether@0.1.0';
const SDT = 0.02;

const PARAMS = [
  { id: 'flyer', zh: '飞行体（0=折叠三角翼 0.094 m²；1=低翼载三角风筝 0.30 m²）', en: 'Flyer (0 = folding delta 0.094 m²; 1 = low-wing-loading delta-kite 0.30 m²)', unit: '', v: 0, min: 0, max: 1, step: 1, src: 'ASSUMED', note: 'variant study in research/active_tether_2026_10_20/dev/results.json' },
  { id: 'camPos', zh: '相机位置（0=飞行体上；1=绳上吊舱，距出口 sCam）', en: 'Camera (0 = on the flyer; 1 = pod clamped on the line sCam from the exit)', unit: '', v: 0, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'elev', zh: '目标线仰角（水平面以上）', en: 'Target line elevation (above horizontal)', unit: '°', v: 50, min: 35, max: 70, step: 1, src: 'CALC', note: 'consensus 40–60° (aero H1/H9, engineering); 50° balances bodyPx and head clearance' },
  { id: 'Tset', zh: '飞行力需求（升力环）', en: 'Flight force demand (lift loop)', unit: 'N', v: 3, min: 1, max: 8, step: 0.5, src: 'ASSUMED' },
  { id: 'LfilmFly', zh: '拍摄线长（相机在飞行体上）', en: 'Filming line length (camera on the flyer)', unit: 'm', v: 10, min: 4, max: 15, step: 0.5, src: 'CALC', note: '10 m: shorter lines are whipped by the ±8 m carving swing of the exit (7.5 m: 3–6× more snow contacts in the 6-case screen)' },
  { id: 'LfilmLine', zh: '拍摄线长（绳上相机）', en: 'Filming line length (line camera)', unit: 'm', v: 14, min: 8, max: 25, step: 0.5, src: 'CALC' },
  { id: 'sCam', zh: '绳上相机到出口距离', en: 'Line camera distance from the exit', unit: 'm', v: 5.5, min: 3, max: 8, step: 0.5, src: 'LIT', note: 'aero H8: 5–6 m' },
  { id: 'LmaxAdd', zh: '富余升力时最多多放线', en: 'Extra line paid out on surplus lift', unit: 'm', v: 1.5, min: 0, max: 6, step: 0.5, src: 'ASSUMED', note: '"pay out when lift is surplus" (user direction), capped for framing' },
  { id: 'gateK', zh: '起飞门槛（估计相对风 / 失速速度）', en: 'Launch gate (est. apparent wind / stall speed)', unit: '', v: 1.35, min: 1.0, max: 2.0, step: 0.05, src: 'ASSUMED', note: 'on the shared windEstimate() + pack GNSS speed' },
  { id: 'straightAcc', zh: '直滑判据（背包横向加速度上限）', en: 'Straight-glide gate (pack lateral acceleration limit)', unit: 'm/s²', v: 2.5, min: 1, max: 10, step: 0.5, src: 'ASSUMED', note: 'control H6: launch only on a straight glide' },
  { id: 'vLaunch', zh: '起飞放线速度上限', en: 'Launch pay-out speed limit', unit: 'm/s', v: 2.0, min: 1, max: 8, step: 0.5, src: 'ASSUMED', note: 'brief: test ≤2 m/s to 6 m' },
  { id: 'cropFc', zh: '跟踪重构图平滑截止频率', en: 'Tracker reframing smoother cut-off', unit: 'Hz', v: 1.5, min: 0.3, max: 4, step: 0.1, src: 'ASSUMED' },
  { id: 'sideDrop', zh: '顺风停下时先侧飞再落（1=开）', en: 'Tailwind stop: steer to the side before the drop (1 = on)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'devK', zh: '机位相对平均航迹的程度（0=跟随出口）', en: 'Station on the mean course (0 = follows the exit)', unit: '', v: 0, min: 0, max: 1, step: 0.1, src: 'ASSUMED', note: 'the rider swings ±8 m per turn: holding the mean course needs ±5 m of reel stroke per turn (rejected, kept as sensitivity)' },
  { id: 'massScale', zh: '飞行体质量系数', en: 'Flyer mass factor', unit: '', v: 1, min: 0.6, max: 1.6, step: 0.05, src: 'ASSUMED' },
  { id: 'cd0Scale', zh: '零升阻力系数倍数（极曲线敏感性）', en: 'CD0 factor (polar sensitivity)', unit: '', v: 1, min: 0.6, max: 2, step: 0.05, src: 'ASSUMED' },
  { id: 'clmaxScale', zh: '最大升力系数倍数', en: 'CLmax factor', unit: '', v: 1, min: 0.6, max: 1.3, step: 0.05, src: 'ASSUMED', note: 'low-Re CLmax can be 20–40 % lower (aero limitations)' },
  { id: 'V0', zh: '低温母线电压（空载）', en: 'Cold bus voltage (open circuit)', unit: 'V', v: 13.2, min: 9, max: 16.8, step: 0.1, src: 'CALC', note: 'engineering 4S1P P28A at −10 °C' },
  { id: 'noise', zh: '传感器噪声/偏差倍数', en: 'Sensor noise/bias factor', unit: '', v: 1, min: 0, max: 3, step: 0.25, src: 'ASSUMED' },
  { id: 'capScale', zh: '捕获模型基准成功率倍数', en: 'Capture model base-rate factor', unit: '', v: 1, min: 0.5, max: 1.04, step: 0.02, src: 'ASSUMED', note: 'ASSUMED capture model: 0.958 × f(speed) × f(angle)' },
];

const W_LIGHT = { mean: [0, 2, 0], intensity: 0.15, seed: 7 };
const FR = (id) => FULLRUN_CASES_R4.find((c) => c.id === id);
const caseWind = (c) => ({ mean: c.mean, intensity: c.intensity ?? 0.15, seed: c.seed });
// shared full-run plan, final hold extended to 25 s so the last retrieve/dock completes inside the simulation (as towglider)
export const PLAN_R4 = [FULLRUN_PLAN[0], FULLRUN_PLAN[1], FULLRUN_PLAN[2], { hold: 25 }];

const SCEN = [
  { id: 'nominal', zh: '标准：从静止蹬出，12 m/s 大弯 30 s（2 m/s 侧风）', en: 'Nominal: push-off from rest, 30 s of 12 m/s carving (2 m/s crosswind)', rider: 'push', dur: 31, wind: W_LIGHT,
    expect: { zh: '起滑检测→箭筒摆出→直滑段起飞→约 50° 刹车飞行跟拍。', en: 'Start detected → quiver out → launch on the straight glide → braked flight at ≈50°.' } },
  { id: 'fullrun', zh: '整趟（共享 R4）：出发→停 20 s→再出发→停（3 m/s 顶风）', en: 'Full run (shared R4): push-off → 20 s stop → push-off → stop (3 m/s headwind)', rider: 'run', case: 'head3_s12',
    expect: { zh: '每次出发自动起飞，停下刹车落后、拖回、入舱；48 例集合指标见 ens*。', en: 'Auto launch at each push-off; at each stop brake, land behind, tow in, dock; 48-case ensemble in ens* metrics.' } },
  { id: 'tail45', zh: '整趟：4.5 m/s 顺风（第四轮关键风段）', en: 'Full run: 4.5 m/s tailwind (the round-4 critical band)', rider: 'run', case: 'tail4.5_s11',
    expect: { zh: '相对风小：可能拒飞或飞得很勉强，诚实报告。', en: 'Low apparent wind: may refuse or fly marginally — reported as is.' } },
  { id: 'tailstop6', zh: '整趟：6 m/s 顺风（停下时飞行体被吹向骑手）', en: 'Full run: 6 m/s tailwind (at a stop the wind pushes the flyer toward the rider)', rider: 'run', case: 'tail6_s11',
    expect: { zh: '停下时先侧飞再深失速，检验头部间隙。', en: 'At the stop it steers to the side, then deep-stalls; checks head clearance.' } },
  { id: 'liftapproach', zh: '进缆车站前 6 s 地理围栏触发：边滑边收回入舱', en: 'Lift geofence 6 s before the stop: fly in and dock while still riding', rider: 'run', case: 'calm_s11', preDock: 6,
    expect: { zh: '滑行中收回、在骑手停下前入舱（依赖缆车站地理围栏，假设完美）。', en: 'Retrieved while riding, docked before the rider stops (relies on a lift geofence, ASSUMED perfect).' } },
  { id: 'fall', zh: '12 m/s 摔倒', en: 'Fall at 12 m/s', rider: 'fall', dur: 24, wind: W_LIGHT,
    expect: { zh: '检测摔倒→深失速 + 放线自由，张力高时切线器动作；报告身体力、动能与头部间隙。', en: 'Fall detected → deep stall + free-spool, cutter on high tension; body force, KE and head clearance reported.' } },
  { id: 'gust', zh: '6 m/s 顶风 + 7 m/s 阵风', en: '6 m/s headwind + 7 m/s gust', rider: 'push', dur: 31, wind: { mean: [-6, 0, 0], intensity: 0.2, seed: 9, gustAt: 16, gust: [-7, 0, 0], gustRise: 1, gustHold: 3 },
    expect: { zh: '刹车与降 CL 压住仰角与拉力；报告峰值拉力与身体力。', en: 'Brake and CL reduction hold elevation and pull; peak tension and body force reported.' } },
  { id: 'shortturns', zh: '短弯 8 m/s', en: 'Short turns 8 m/s', rider: 'push', dur: 31, skier: SKIER_PRESETS.shortTurns, wind: W_LIGHT,
    expect: { zh: '相对风每弯摆动；报告画面稳定性。', en: 'Apparent wind swings each turn; footage stability reported.' } },
  { id: 'moguls', zh: '猫跳 4.5 m/s（低速）', en: 'Moguls 4.5 m/s (slow)', rider: 'push', dur: 31, skier: SKIER_PRESETS.moguls, wind: W_LIGHT,
    expect: { zh: '相对风低于起飞门槛：不起飞（诚实拒飞）。', en: 'Apparent wind below the launch gate: no launch (honest refusal).' } },
  { id: 'chairdown', fault: true, zh: '下行吊椅（5 m/s 下降，背包无雪面振动）', en: 'Downloading chairlift (5 m/s descent, no on-snow vibration)', rider: 'chair', dur: 30, wind: W_LIGHT,
    expect: { zh: '起滑检测需要雪面振动：不展开、不起飞。', en: 'The start detector needs on-snow vibration: no deploy, no launch.' } },
  { id: 'v_delta_fly', compare: true, zh: '对照：三角翼 + 机载相机', en: 'Compare: delta + camera on the flyer', rider: 'push', dur: 31, wind: W_LIGHT, over: { flyer: 0, camPos: 0 },
    expect: { zh: '变体对比（同一标准工况）。', en: 'Variant comparison (same nominal case).' } },
  { id: 'v_kite_line', compare: true, zh: '对照：风筝 + 绳上相机', en: 'Compare: kite + line camera', rider: 'push', dur: 31, wind: W_LIGHT, over: { flyer: 1, camPos: 1 },
    expect: { zh: '变体对比（同一标准工况）。', en: 'Variant comparison (same nominal case).' } },
];

// a downloading chairlift: the pack moves down the fall line at 5 m/s, 6 m above the snow, seated, no chatter
function chairRun(dur) {
  const sampleDt = SDT, n = Math.floor(dur / sampleDt) + 1, tanS = Math.tan((15 * Math.PI) / 180);
  const col = {}; for (const k of ['t', 'x', 'y', 'z', 'psi', 'hx', 'hy', 'vx', 'vy', 'v', 'lat', 'lon', 'lean', 'crouch', 'plantL', 'plantR', 'fallen']) col[k] = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = i * sampleDt; col.t[i] = t; col.x[i] = 5 * t; col.z[i] = -col.x[i] * tanS + 6; col.hx[i] = -1; col.vx[i] = 5; col.v[i] = 5; col.crouch[i] = 1; }
  const sk = { opts: {}, tanS, n, sampleDt, duration: dur, col };
  const nd = n, tr = { dt: sampleDt, n: nd, t: col.t, vx: col.vx, vy: new Float64Array(nd), vz: col.vx.map((v) => -v * tanS), vib: new Float64Array(nd).fill(0.03), tilt: new Float64Array(nd).fill(30), impact: new Float64Array(nd) };
  return { sk, tr };
}

export function prepare(params, sc) {
  let sk, wind = sc.wind, detTrace = null, caseSeed = 7;
  if (sc.rider === 'run') {
    const c = sc.caseObj || FR(sc.case);
    sk = simulateRun({ seed: c.seed, plan: PLAN_R4 }); wind = caseWind(c); caseSeed = c.seed;
  } else if (sc.rider === 'fall') sk = simulateSkier({ duration: sc.dur + 1, seed: 3, fallAt: 12, ...(sc.skier || {}) });
  else if (sc.rider === 'chair') { const ch = chairRun(sc.dur + 0.5); sk = ch.sk; detTrace = ch.tr; }
  else sk = simulateSkier({ start: 'push', v0: 0, duration: (sc.dur ?? 31) + 1, seed: 2, ...(sc.skier || {}) });
  const preDock = sc.preDock && sk.rides ? sk.rides.slice(0, sk.stops.length).map((r) => r.t1 - sc.preDock) : null;
  const dur = sc.dur ?? sk.duration;
  return { sk, input: { sk, wind, duration: dur, detTrace, seed: caseSeed * 31 + 7, preDock, dt: sc.dt, start: sc.start }, dur };
}

const fin = (a) => Array.from(a).filter(Number.isFinite);
const maxOf = (a) => { const v = fin(a); return v.length ? Math.max(...v) : NaN; };
const minOf = (a) => { const v = fin(a); return v.length ? Math.min(...v) : NaN; };
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const nb = (x) => (Number.isFinite(x) ? x : 'n/a');

// all judged numbers of one run (used by simulate(), the ensemble and the tests)
export function judge(core, A, sk, { riding = null } = {}) {
  const O = core.O, n = core.n, p = core.p;
  const ridingAt = (i) => (riding ? riding[Math.min(riding.length - 1, Math.round((i * SDT) / sk.sampleDt))] > 0 : skierAt(sk, i * SDT).speed > 2);
  let rideN = 0, availN = 0, artN = 0, filmRideN = 0, lowN = 0, airRideN = 0, thirdS = 0;
  const px = [], azs = [];
  for (let i = 0; i < n; i++) {
    const r = ridingAt(i);
    if (r) {
      rideN++; if (A.avail[i] === 1) availN++;
      if (A.filming[i] === 1) { filmRideN++; if (A.inFrame[i]) px.push(A.bodyPx[i]); if (A.art[i]) artN++; }
      if (AIRBORNE(O.mode[i]) && Number.isFinite(A.lowLine[i])) { airRideN++; if (A.lowLine[i]) lowN++; }
    }
    if (A.thirdP[i] === 1) thirdS += SDT;
  }
  // azRange: p5–p95 of the 0.2 Hz low-passed viewing azimuth over filmed riding samples
  { let lp = null; const a = 1 - Math.exp(-2 * Math.PI * 0.2 * SDT); for (let i = 0; i < n; i++) { if (!(A.filming[i] === 1) || !ridingAt(i)) { lp = null; continue; } const v = A.az[i]; lp = lp == null ? v : lp + a * (v - lp); azs.push(lp); } }
  const docks = core.met.docks, caps = core.met.captures;
  const stopsDocked = docks.filter((d) => d.tStop != null && !d.manual);
  // setup (standstill attributable to the device): final stop → locked, + overruns past each restart, + 20 s per manual stow
  let setup = 0;
  const stops = sk.stops || [];
  stops.forEach((st, k) => {
    const lock = docks.find((d) => d.t >= st.t0 - 8 && d.t <= st.t1 + 30);
    const last = k === stops.length - 1;
    const iS = Math.min(n - 1, Math.round(st.t0 / SDT)), out0 = AIRBORNE(O.mode[iS]) || O.mode[Math.min(n - 1, iS + 50)] === MODE.BRAKE;
    if (!lock) { setup += last && out0 ? Math.max(0, st.t1 - st.t0) + 30 : 0; return; }
    if (last) setup += Math.max(0, lock.t - st.t0); else setup += Math.max(0, lock.t - st.t1);
  });
  setup += 20 * core.met.manual;
  const W = (core.met.Ebatt / Math.max(1, core.duration)) + BACK_STATIC_W + flyerBudget(p.type, p.camOn).W + (p.pod ? p.pod.W : 0);
  const wb = wornBudget(p.type, p.camOn);
  const endur = enduranceMin(wb.batteryWh + wb.flyerCellWh + wb.podCellWh, W, { heated: true });
  const launchOk = core.met.launches - core.met.launchFails;
  const rides = sk.rides ? sk.rides.length : 1;
  return {
    avail: rideN ? (100 * availN) / rideN : 0, pxMed: px.length ? pct(px, 0.5) : NaN, azRange: azs.length > 50 ? pct(azs, 0.95) - pct(azs, 0.05) : NaN,
    addedMass: wb.kg, bodyForcePeak: maxOf(A.Fbody), handsBusy: 0, setupTime: stops.length ? setup : NaN, ops: core.met.manual + (core.met.brokeAt != null || core.met.cutAt != null ? 1 : 0),
    keMax: maxOf(A.ke), keFlyer: maxOf(A.keFlyer), kePod: maxOf(A.kePod), packVol: packVolume(p.type, p.camOn).total, headClear: minOf(A.headClear), headFlyer: minOf(A.headFlyer), headLine: minOf(A.headLine), endurance: endur, meanW: W,
    artShare: filmRideN ? (100 * artN) / filmRideN : NaN, filmShare: rideN ? (100 * filmRideN) / rideN : 0,
    launches: core.met.launches, launchFails: core.met.launchFails, launchSuccess: core.met.launches ? (100 * launchOk) / core.met.launches : NaN, ridesNoLaunch: Math.max(0, rides - launchOk),
    docks: docks.length, dockFirstTry: caps.length ? (100 * stopsDocked.filter((d) => d.tries === 1).length) / Math.max(1, docks.length) : NaN,
    dockTimes: stopsDocked.map((d) => d.dockTime).filter(Number.isFinite), capVrel: caps.map((c) => c.vRel), manual: core.met.manual,
    lowLineShare: airRideN ? (100 * lowN) / airRideN : NaN, lowLenP90: pct(fin(A.lowLen).filter((x) => x > 0), 0.9), thirdPartyS: thirdS,
    lineH1p10: pct(fin(A.lineH1), 0.1), lineH3p10: pct(fin(A.lineH3), 0.1), crashes: core.met.crashes, Tmax: core.met.Tmax, reelPeakW: core.met.PpeakW, reelWh: core.met.Ebatt / 3600,
    slipS: core.met.slipS, satS: core.met.satS, cut: core.met.cutAt != null, broke: core.met.brokeAt != null, refuseS: core.met.refuseS,
    hcAt: (() => { let b = -1, v = 9; for (let i = 0; i < n; i++) if (A.headClear[i] < v) { v = A.headClear[i]; b = i; } return b < 0 ? null : `${(b * SDT).toFixed(1)}:${MODE_NAME[O.mode[b]]}:${A.headFlyer[b] < A.headLine[b] ? 'flyer' : 'line'}`; })(),
    keAt: (() => { let b = -1, v = -1; for (let i = 0; i < n; i++) if (A.ke[i] > v) { v = A.ke[i]; b = i; } return b < 0 ? null : `${(b * SDT).toFixed(1)}:${MODE_NAME[O.mode[b]]}`; })(),
    elevMed: pct(fin(Array.from(O.elev).filter((_, i) => O.mode[i] === MODE.FLY)), 0.5), tensionMed: pct(fin(Array.from(O.T).filter((_, i) => O.mode[i] === MODE.FLY)), 0.5),
  };
}

export function buildResult(params, sc, prep, { demo = false } = {}) {
  const core = runCore({ ...params, ...(sc.over || {}) }, prep.input);
  const riding = sc.rider === 'run' ? availMask(prep.sk) : null;
  const A = analyse(core, { seed: prep.input.seed, riding });
  const J = judge(core, A, prep.sk, { riding });
  const p = core.p, O = core.O, n = core.n;
  const R = makeResult({ conceptId: 'activetether', scenarioId: sc.id, modelVersion: MV, duration: (n - 1) * SDT, sampleDt: SDT });
  const C = (k, arr) => { const c = R.col(k); for (let i = 0; i < R.n; i++) c[i] = arr[i]; };
  const sp = new Float64Array(n); for (let i = 0; i < n; i++) sp[i] = skierAt(prep.sk, i * SDT).speed;
  C('speed', sp); C('mode', O.mode); C('lineOut', O.L); C('tension', O.T); C('tensionMeas', O.Tm); C('airspeed', O.va); C('elev', O.elev); C('elevMeas', O.elevM);
  C('brake', O.brake); C('alpha', O.alpha); C('bank', O.phi); C('reelRate', O.vr); C('reelPower', O.Pel); C('vbus', O.Vbus); C('lift margin', O.LM);
  const hF = new Float64Array(n); for (let i = 0; i < n; i++) hF[i] = O.fz[i] - O.snow[i]; C('height', hF);
  for (const k of ['bodyPx', 'avail', 'art', 'artW', 'headClear', 'ke', 'Fbody', 'lowLine', 'vfov', 'az', 'lineH1']) C(k, A[k]);
  for (const e of core.events) R.event(e.t, e.type, e.severity, e.zh, e.en);
  // ---- harmonised metrics (fullrun: judged on the 48-case ensemble, as every concept)
  const E = sc.id === 'fullrun' && ENSEMBLE ? ENSEMBLE.metrics : null;
  const eN = (k, s) => (E && E[k] && Number.isFinite(E[k][s]) ? E[k][s] : null);
  const note = (zh, en) => ({ zh, en });
  const ens = !!E;
  addStd(R, 'avail', ens ? eN('avail', 'mean') : J.avail, ens ? note('48 例集合均值；未起飞=0', '48-case ensemble mean; never-launched runs count 0') : note('本例；起降/拒飞时段计为不可用', 'this run; launch/refusal time counts as unavailable'));
  addStd(R, 'pxMed', nb(ens ? eN('pxMed', 'p50') : J.pxMed));
  let jit = NaN;
  try { jit = footageStability({ duration: R.duration, frame: (t) => frameAt(t) }).subjectRms; } catch { jit = NaN; }
  addStd(R, 'jitterRms', nb(ens ? eN('jitterRms', 'p90') : jit), ens ? note('48 例共享 footageStability 主体 p90', 'shared footageStability subject p90 over 48 cases') : note('共享 footageStability 主体', 'shared footageStability subject'));
  addStd(R, 'azRange', nb(ens ? eN('azRange', 'p50') : J.azRange));
  addStd(R, 'addedMass', J.addedMass, note('背负单元按工程 BOM +15 %，飞行体按共享元件表 +15 %', 'back unit from the engineering BOM +15 %, flyer from the shared table +15 %'));
  addStd(R, 'bodyForcePeak', nb(ens ? eN('bodyForcePeak', 'max') : J.bodyForcePeak));
  addStd(R, 'handsBusy', 0, note('全自动；人工收纳只在停稳时', 'fully automatic; manual stow only while stopped'));
  addStd(R, 'setupTime', nb(ens ? eN('setupTime', 'p90') : Number.isFinite(J.setupTime) ? J.setupTime : ENSEMBLE ? ENSEMBLE.metrics.setupTime.p90 : NaN), note('停下到锁定 + 越过再出发的部分 + 每次人工 20 s', 'stop → locked + overrun past the restart + 20 s per manual stow'));
  addStd(R, 'ops', ens ? eN('ops', 'p90') : J.ops);
  addStd(R, 'keMax', nb(ens ? eN('keMax', 'max') : J.keMax), note('飞行体与吊舱，>1.5 m 按雪面系', 'flyer and pod, ground frame beyond 1.5 m'));
  addStd(R, 'packVol', J.packVol);
  addStd(R, 'headClear', nb(ens ? eN('headClear', 'min') : J.headClear), note('飞行体轮廓、吊舱与绳到 helmetAt()；仅排除 ≤3 s 捕获窗口', 'flyer outline, pod and line to helmetAt(); only the ≤3 s capture window excluded'));
  addStd(R, 'endurance', ens ? eN('endurance', 'min') : J.endurance, note('全部随身电池（共享 150 Wh/kg）、−10 °C、15 % 储备、加热', 'all worn cells (shared 150 Wh/kg), −10 °C, 15 % reserve, heated'));
  // ---- product / concept metrics
  const M = (id, zh, en, v, unit, pass = null, czh = null, cen = null) => R.metric(id, zh, en, v, unit, pass, czh ? { zh: czh, en: cen } : null);
  M('launches', '起飞次数（失败）', 'Launches (failed)', `${J.launches} (${J.launchFails})`, '');
  M('launchSuccess', '起飞成功率', 'Launch success', nb(J.launchSuccess), '%', Number.isFinite(J.launchSuccess) ? J.launchSuccess >= 95 : null, '≥95 %（产品）', '≥95 % (product)');
  M('dockFirstTry', '首次捕获入舱率', 'Dock success first try', nb(J.dockFirstTry), '%', Number.isFinite(J.dockFirstTry) ? J.dockFirstTry >= 98 : null, '≥98 %（产品，捕获模型为假设）', '≥98 % (product; capture model ASSUMED)');
  const dt90 = J.dockTimes.length ? pct(J.dockTimes, 0.9) : NaN;
  M('dockTimeP90', '停下检测到锁定 p90', 'Stop detected → locked p90', nb(dt90), 's', Number.isFinite(dt90) ? dt90 <= 10 : null, '≤10 s（产品）', '≤10 s (product)');
  M('lowLine', '骑手身后 3 m 内绳低于 1.8 m 的时间比例', 'Line <1.8 m above snow within 3 m behind (share of airborne riding)', nb(J.lowLineShare), '%', Number.isFinite(J.lowLineShare) ? J.lowLineShare === 0 : null, '0（产品）', '0 (product)');
  M('thirdParty', '第三方暴露（身后 >0.5 m 处绳低于 2 m）', 'Third-party exposure (line <2 m more than 0.5 m behind)', J.thirdPartyS, 's', J.thirdPartyS === 0, '0 s（产品）', '0 s (product)');
  M('artShare', '拍摄时绳伪影（≥2 px 压在人物上）', 'Line artefact while filming (≥2 px over the subject)', nb(J.artShare), '%');
  M('elevMed', '飞行仰角中位', 'Flight elevation median', nb(J.elevMed), '°');
  M('tensionMed', '飞行张力中位', 'Flight tension median', nb(J.tensionMed), 'N');
  M('Tmax', '出口张力瞬时最大', 'Exit tension instantaneous max', J.Tmax, 'N');
  M('reelPeakW', '卷线电机峰值电功率', 'Reel motor peak electrical power', J.reelPeakW, 'W');
  M('reelWh', '本趟卷线耗电', 'Reel energy this run', J.reelWh, 'Wh');
  M('crashes', '飞行中触雪次数', 'Snow contacts in flight', J.crashes, '', null);
  M('flyerMass', '飞行体质量', 'Flyer mass', p.m, 'kg', p.m <= 0.15, '≤0.15 kg（产品）', '≤0.15 kg (product)');
  M('vStall', '失速速度', 'Stall speed', p.Vs, 'm/s');
  if (ens) {
    M('ensAvailP10', '整趟集合：可用率 p10', 'Full-run ensemble: avail p10', eN('avail', 'p10'), '%');
    M('ensKeP90', '整趟集合：动能 p90', 'Full-run ensemble: KE p90', eN('keMax', 'p90'), 'J');
    M('ensHeadP10', '整趟集合：头部间隙 p10', 'Full-run ensemble: head clearance p10', eN('headClear', 'p10'), 'm');
  }
  if (sc.fault || sc.id === 'fall') {
    const SAFE = ['bodyForcePeak', 'keMax', 'headClear', 'addedMass', 'packVol'];
    for (const m of R.metrics) if (!SAFE.includes(m.id) && m.pass != null) { m.pass = null; m.criterion = m.criterion ? { zh: m.criterion.zh + '（故障/安全工况不判）', en: m.criterion.en + ' (fault/safety scenario: not judged)' } : null; }
  }
  if (sc.id === 'chairdown') M('liftLaunch', '缆车上起飞次数', 'Launches on the lift', J.launches, '', J.launches === 0, '0', '0');
  // ---- plots
  R.plots.push({ key: 'flight', zh: '飞行', en: 'Flight', series: [['elev', '°', '线仰角', 'Line elevation'], ['airspeed', 'm/s', '空速', 'Airspeed'], ['height', 'm', '离雪高度', 'Height above snow'], ['brake', '—', '气刹', 'Airbrake']] });
  R.plots.push({ key: 'reel', zh: '绳与卷轴', en: 'Line and reel', series: [['tension', 'N', '出口张力', 'Exit tension'], ['lineOut', 'm', '放线长度', 'Line out'], ['reelRate', 'm/s', '收放速度（+放）', 'Reel rate (+out)'], ['reelPower', 'W', '电机电功率', 'Motor power']] });
  R.plots.push({ key: 'frame', zh: '画面', en: 'Footage', series: [['bodyPx', 'px', '身体像素', 'Body px'], ['avail', '—', '可用', 'Usable'], ['artW', 'px', '绳宽（在人物上）', 'Line width over subject'], ['vfov', '°', '输出视场', 'Output VFOV']] });
  R.plots.push({ key: 'safety', zh: '安全', en: 'Safety', series: [['headClear', 'm', '头部间隙', 'Head clearance'], ['ke', 'J', '动能', 'KE'], ['Fbody', 'N', '身体力（50 ms）', 'Body force (50 ms)'], ['speed', 'm/s', '骑手速度', 'Rider speed']] });
  if (sc.id === 'fall') { const f = core.fallT; if (f != null) { R.validUntil = Math.min(R.duration, f + 6); R.event(R.validUntil, 'scope', 'invalid', '此后倒地者翻滚与绳缠绕未建模', 'Beyond this the tumbling rider and line wrap are not modelled'); } }
  R.events.sort((a, b) => a.t - b.t);
  // ---- frames
  function frameAt(t) {
    const f = Math.max(0, Math.min(n - 1, t / SDT)), i = Math.round(f);
    const s = skierAt(prep.sk, t);
    const md = O.mode[i];
    const line = linePoints(O, i, 16);
    const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), w = f - i0;
    const li = (k) => (Number.isFinite(A[k][i1]) ? A[k][i0] * (1 - w) + A[k][i1] * w : A[k][i0]);
    const cam = A.filming[i0] === 1 ? { pos: [li('cpx'), li('cpy'), li('cpz')], fwd: [li('cfx'), li('cfy'), li('cfz')], up: [0, 0, 1], vfovDeg: li('vfov'), label: p.camOn ? '飞行体相机（4K 重构图）/ flyer camera (4K reframed)' : '绳上相机吊舱 / line camera pod' } : null;
    const dev = {
      mode: MODE_NAME[md], flyerType: p.type, camOn: p.camOn, flyer: [O.fx[i], O.fy[i], O.fz[i]], nose: [O.bfx[i], O.bfy[i], O.bfz[i]], up: [O.bux[i], O.buy[i], O.buz[i]],
      span: FLYERS[p.type].span, chord: FLYERS[p.type].chord, brake: O.brake[i], quiver: O.quiver[i], exit: [O.ex[i], O.ey[i], O.ez[i]], axis: [O.ax[i], O.ay[i], O.az[i]], stow: [O.sx[i], O.sy[i], O.sz[i]],
      line, pod: O.podOn[i] === 1 ? [O.qx[i], O.qy[i], O.qz[i]] : null, L: O.L[i], tension: O.T[i], reel: O.vr[i], cut: O.cut[i] > 0,
      inside: !AIRBORNE(md), folded: md === MODE.STOWED || md === MODE.DOCKED || md === MODE.DEPLOY || md === MODE.READY ? 1 : 0, camPos: cam ? cam.pos : null,
      warn: core.events.some((e) => e.severity !== 'info' && e.t <= t && e.t > t - 3),
    };
    const labels = demo ? [] : AIRBORNE(md) ? [{ p: [O.fx[i], O.fy[i], O.fz[i] + 0.8], text: `${O.L[i].toFixed(1)} m · ${O.T[i].toFixed(1)} N`, color: O.T[i] > 20 ? '#ff6a5a' : '#9cc8ff' }] : [];
    return { t, tanS: core.tanS, skier: { ...s, pack: 'none' }, device: dev, labels, productCam: cam };
  }
  R.frame = frameAt;
  R.core = core; R.analysis = A; R.judge = J;
  return R;
}

function simulate(params, scenario) {
  const sc = scenario || SCEN[0];
  return buildResult(params, sc, prepare({ ...params, ...(sc.over || {}) }, sc));
}

// one FULLRUN_CASES_R4 case → judged numbers (+ shared footageStability)
export function evaluateCase(params, c, { fs = true, preDock = null, plan = PLAN_R4 } = {}) {
  const sc = { id: 'case', rider: 'run', caseObj: c, preDock };
  const prep = prepare(params, sc);
  if (plan !== PLAN_R4) { prep.sk = simulateRun({ seed: c.seed, plan }); prep.input.sk = prep.sk; prep.input.duration = prep.sk.duration; }
  const R = buildResult(params, sc, prep);
  const J = R.judge;
  const fsr = fs ? footageStability(R) : { subjectRms: NaN };
  const { dockTimes, capVrel, ...rest } = J;
  return { id: c.id, U: c.U, dir: c.dir, seed: c.seed, ...rest, jitterRms: fsr.subjectRms, flown: J.launches - J.launchFails > 0, dockTimes, capVrel, events: R.core.events.filter((e) => e.severity !== 'info').map((e) => `${e.t}:${e.type}`) };
}

export function ensembleStats(rows) {
  const keys = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'headClear', 'endurance', 'keFlyer', 'kePod', 'headFlyer', 'headLine',
    'artShare', 'filmShare', 'launchSuccess', 'dockFirstTry', 'lowLineShare', 'lowLenP90', 'thirdPartyS', 'lineH1p10', 'lineH3p10', 'crashes', 'Tmax', 'reelPeakW', 'reelWh', 'meanW', 'elevMed', 'tensionMed', 'manual', 'refuseS'];
  const st = (k, rr) => { const v = rr.map((r) => r[k]).filter(Number.isFinite); return v.length ? { mean: meanOf(v), p10: pct(v, 0.1), p50: pct(v, 0.5), p90: pct(v, 0.9), min: Math.min(...v), max: Math.max(...v), n: v.length } : { n: 0 }; };
  const metrics = Object.fromEntries(keys.map((k) => [k, st(k, rows)]));
  // jitter judged as p90 over flown cases (shared rule)
  metrics.jitterRms = st('jitterRms', rows.filter((r) => r.flown));
  const dts = rows.flatMap((r) => r.dockTimes || []);
  metrics.dockTime = dts.length ? { p50: pct(dts, 0.5), p90: pct(dts, 0.9), max: Math.max(...dts), n: dts.length } : { n: 0 };
  const caps = rows.flatMap((r) => r.capVrel || []);
  metrics.capVrel = caps.length ? { p50: pct(caps, 0.5), p90: pct(caps, 0.9), n: caps.length } : { n: 0 };
  return { metrics, counts: { cases: rows.length, flown: rows.filter((r) => r.flown).length, cut: rows.filter((r) => r.cut).length, broke: rows.filter((r) => r.broke).length } };
}

// ------------------------------------------------------------------ demo: stowed → auto launch → follow → stop → land → tow in → dock
const DEMO_PLAN = [{ ride: 30, preset: 'recreationalCarve' }, { hold: 21 }]; // light 1 m/s crosswind
const DEMO_T = 52.6;
const STAGES = [
  { key: 'stowed', t0: 0, t1: 0.9, title: { zh: '背在背上', en: 'Stowed on the back' }, zh: '约 0.12 kg 的折叠伞骨三角翼收在腰后 0.55 m 的“蝎尾箭筒”里，背负单元含电动卷轴、张力/线角传感器与电池（共约 0.91 kg、约 2.3 L）。', en: 'The ≈0.12 kg folding umbrella delta sits in the 0.55 m lumbar "scorpion quiver"; the back unit holds the motor reel, tension/line-angle sensors and battery (≈0.91 kg worn, ≈2.3 L).', pending: true },
  { key: 'detect', t0: 0.9, t1: 2.2, title: { zh: '起滑检测', en: 'Ride start detected' }, zh: '背包 IMU+GNSS+气压计在蹬出后约 0.8 s 判定起滑（缆车/排队/步行锁定），箭筒摆到身后。', en: 'Pack IMU+GNSS+baro confirm the start ≈0.8 s after push-off (lift/queue/walk lockouts); the quiver swings out behind.', pending: true },
  { key: 'launch', t0: 2.2, t1: 9, title: { zh: '直滑段自动起飞', en: 'Auto launch on the straight glide' }, zh: '估计相对风 ≥1.35×失速速度且直滑时释放；按张力放线 ≤2 m/s。短绳阶段最不稳，仿真里会甩动。', en: 'Released when the estimated apparent wind ≥1.35 × stall speed on a straight glide; tension-controlled pay-out ≤2 m/s. The short-line phase is the least stable and visibly swings in the simulation.', pending: true },
  { key: 'film', t0: 9, t1: 30, title: { zh: '刹车飞行跟拍', en: 'Braked flight, following' }, zh: '气刹 + 降 CL 的“滑翔比伺服”把线压在约 50°，滚转转向保持在平均航线后方；卷轴只保线长，富余升力时多放、升力不足时收（受动能上限约束）。', en: 'A glide-ratio servo (airbrake + lower CL) holds the line near 50°; roll steering keeps the station behind the mean course; the reel holds length, pays out on surplus lift and reels in on a deficit (KE-governed).', pending: true },
  { key: 'stop', t0: 30, t1: 34, title: { zh: '急停：刹车深失速', en: 'Hockey stop: brake, deep stall' }, zh: '检测到停下：不快速收线（会产生 38–145 J），而是气刹深失速、只收松弛线，飞行体落在身后。', en: 'Stop detected: no fast reel-in (38–145 J); airbrake + deep stall, slack take-up only — the flyer drops behind.', pending: true },
  { key: 'retrieve', t0: 34, t1: 41.7, title: { zh: '拖回', en: 'Tow in' }, zh: '翼面“旗化”（零迎角、无刹车），以 3 m/s 沿雪面拖回（最后 3 m 降到 1.5 m/s），最后 1.5 m 以 0.3 m/s 进入，飞行体晃动时暂停。', en: 'Wing flagged (zero AoA, no brake), towed over the snow at 3 m/s (1.5 m/s in the last 3 m), last 1.5 m at 0.3 m/s, pausing while the flyer still moves.', pending: true },
  { key: 'dock', t0: 41.7, t1: DEMO_T, title: { zh: '入舱、折叠、收回背上', en: 'Capture, fold, stowed' }, zh: '箭筒按测得的线角对正，机头进入喇叭口，伞骨被拉合；捕获成功率为假设模型（待 −10 °C 50 次实测）。', en: 'The quiver aligns to the measured line angle; the nose enters the trumpet and the ribs fold; capture success is an ASSUMED model (pending 50 captures at −10 °C).', pending: true },
];
function buildDemo(params) {
  const sk = simulateRun({ seed: 11, plan: DEMO_PLAN });
  const sc = { id: 'demo', rider: 'run' };
  const prep = { sk, input: { sk, wind: { mean: [0, 1, 0], intensity: 0.15, seed: 11 }, duration: DEMO_T, seed: 11 * 31 + 7 }, dur: DEMO_T };
  const R = buildResult(params, sc, prep, { demo: true });
  R.scenarioId = 'demo';
  return R;
}

export default {
  id: 'activetether', family: 'aerial',
  name: { zh: 'AT-1 主动收放线背负风筝相机', en: 'AT-1 active-tether back-stowed kite cam' },
  tagline: { zh: '起滑自动放飞、刹车飞行在约 50° 跟拍、停下深失速落地拖回入舱；卷轴在腰后，飞行体 ≈0.12 kg', en: 'Auto launch on the ride start, braked flight at ≈50°, deep-stall drop and tow-in dock at stops; reel at the lumbar, ≈0.12 kg flyer' },
  about: { zh: 'SIM-032 第二阶段集成设计：采纳第一阶段共识（卷轴在背、不追张力、低相对风是门槛、出口位置决定头部间隙、刹车飞行 40–60°、硬件安全件），并用仿真对冲突给出数值。全部判据按第四轮共享规则；结果、失败项与敏感性见 research/active_tether_2026_10_20/dev/。仿真不是实测验证。', en: 'SIM-032 phase-2 integrated design: adopts the phase-1 consensus (reel on the back, no tension chasing, low apparent wind is a gate, the exit sets head clearance, braked flight 40–60°, hard safety parts) and settles the open conflicts with numbers. Judged on the shared round-4 rules; results, fails and sensitivities in research/active_tether_2026_10_20/dev/. Simulation is not verification.' },
  modelVersion: MV,
  modelLimits: [
    { zh: '飞行体为三自由度质点 + 降阶俯仰/滚转模态，无完整六自由度与气动弹性；极曲线为假设值', en: '3-DOF point-mass flyer + reduced-order pitch/roll modes; no full 6-DOF or aeroelasticity; polars ASSUMED' },
    { zh: '绳为直线弹性段 + 抛物线垂度，无绳波动；骑手尾流与近雪面风梯度未建模', en: 'Line = straight elastic segments + parabolic sag, no line waves; rider wake and near-snow wind gradient not modelled' },
    { zh: '捕获成功率为假设模型；箭筒对正只影响捕获角，不改变出口位置', en: 'Capture success is an ASSUMED model; quiver alignment only changes the capture angle, not the exit position' },
    { zh: '雪面接触为库仑摩擦 μ 0.3；挂树、缠绕、倒地后翻滚未建模', en: 'Snow contact = Coulomb μ 0.3; tree snags, wraps and the tumbling fallen rider not modelled' },
    { zh: '起停检测输入为合成活动轨迹，非实测 IMU 数据', en: 'Start/stop detection runs on synthetic activity traces, not measured IMU logs' },
  ],
  params: PARAMS,
  scenarios: SCEN,
  simulate,
  ensemble: ENSEMBLE,
  demo: { duration: DEMO_T, stages: STAGES, build: buildDemo },
  gear: () => import('./gear.js'),
};
export { SCEN, PARAMS, PDEF, resolveP };
