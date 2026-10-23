// sledpack (SIM-033, 2026-10-21): "SledPack" pole-free backpack soft-kite camera. A ≈0.07 kg single-skin sled kite
// with a camera pod at its bridle apex lives in a spine sleeve whose mouth sits at the sacrum; the back unit detects
// the ride start (IMU+GNSS+baro, lift lockout), lets the airflow pull the folded kite out once the estimated apparent
// wind is enough, holds pull with a second (depower) line driven from the pack, manages length slowly with the reel,
// and at a stop depowers (collapses) the kite, reels it in while the rider still slides, tows it on the snow and draws
// it apex-first through a passive swivel funnel into the sleeve, where the pod cell is warmed and charged.
// User direction 2026-10-21: no pole on the back, sits on the back like a pack, launches by itself when there is
// enough speed and wind. Physics + autonomy: model.js; camera/safety geometry: analysis.js; design basis: design.js;
// detector: detect.js (copied from activetether). Numerical-uncalibrated simulation; nothing validated or tested.
import { simulateSkier, skierAt, SKIER_PRESETS } from '../common/skier.js';
import { simulateRun, FULLRUN_PLAN, FULLRUN_CASES_R4, availMask, pct } from '../common/fullrun.js';
import { makeResult } from '../common/result.js';
import { addStd, footageStability } from '../common/criteria.js';
import { enduranceMin } from '../common/components.js';
import { runCore, resolveP, PDEF, MODE, MODE_NAME, AIRBORNE } from './model.js';
import { analyse, linePoints, sailPts, camPosOf } from './analysis.js';
import { wornBudget, packVolume, BACK_STATIC_W, CHARGE_EFF, GEOM } from './design.js';
import { ENSEMBLE } from './ensemble.js';

const MV = 'sledpack@0.2.1';
const SDT = 0.02;

const PARAMS = [
  { id: 'areaScale', zh: '帆面积倍数（基准 0.30 m²）', en: 'Sail area factor (base 0.30 m²)', unit: '', v: 0.667, min: 0.5, max: 1.4, step: 0.05, src: 'CALC', note: 'sizing study in research/sledpack_2026_10_21/dev/iterations.json' },
  { id: 'tail', zh: '拖尾小伞（1=有）', en: 'Drogue tail (1 = on)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED', note: 'lowers the flying angle for bodyPx, damps yaw' },
  { id: 'tailScale', zh: '拖尾阻力倍数', en: 'Tail drag factor', unit: '', v: 1, min: 0, max: 2, step: 0.1, src: 'ASSUMED' },
  { id: 'Lfilm', zh: '拍摄线长', en: 'Filming line length', unit: 'm', v: 6, min: 5, max: 14, step: 0.5, src: 'ASSUMED' },
  { id: 'Tset', zh: '目标拉力（泄力线闭环）', en: 'Pull target (depower-line loop)', unit: 'N', v: 12, min: 4, max: 25, step: 1, src: 'ASSUMED' },
  { id: 'aMarginDeg', zh: '泄力下限：估计迎角不低于', en: 'Depower limit: estimated AoA not below', unit: '°', v: 14, min: 6, max: 20, step: 1, src: 'ASSUMED', note: 'collapse below ≈6° (design.js SLED)' },
  { id: 'vGate', zh: '放飞门槛（估计相对风）', en: 'Launch gate (estimated apparent wind)', unit: 'm/s', v: 5.5, min: 2.5, max: 8, step: 0.1, src: 'ASSUMED', note: 'shared windEstimate() + pack GNSS; below ≈5 m/s the carving lateral speed (±7 m/s) swings the kite round the window (iteration I2)' },
  { id: 'vGateOff', zh: '在飞时收回门槛（估计相对风）', en: 'In-flight retrieve threshold (estimated apparent wind)', unit: 'm/s', v: 4.5, min: 2, max: 7, step: 0.1, src: 'ASSUMED' },
  { id: 'cropFc', zh: '重构图跟踪带宽', en: 'Reframing tracker bandwidth', unit: 'Hz', v: 1.2, min: 0.3, max: 4, step: 0.1, src: 'ASSUMED', note: 'jitter vs framing lag trade (iteration I5)' },
  { id: 'stow', zh: '收纳方式（1=展开平放在背上；0=脊柱套管 I9）', en: 'Stow (1 = open on the back; 0 = spine sleeve, I9)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED', note: 'user 2026-10-21 (SIM-034)' },
  { id: 'Lsched', zh: '线长随相对风调度（1=开）', en: 'Line length scheduled on apparent wind (1 = on)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED', note: 'user: higher and farther when fast and windy' },
  { id: 'Lk', zh: '线长斜率（每 m/s 相对风）', en: 'Line length slope (per m/s apparent wind)', unit: 'm/(m/s)', v: 0.75, min: 0, max: 2, step: 0.1, src: 'ASSUMED' },
  { id: 'vRef', zh: '线长调度参考相对风（此时线长=拍摄线长）', en: 'Schedule reference apparent wind (line = filming length here)', unit: 'm/s', v: 12, min: 6, max: 16, step: 0.5, src: 'ASSUMED' },
  { id: 'LmaxS', zh: '最长线长', en: 'Longest scheduled line', unit: 'm', v: 9, min: 6, max: 20, step: 0.5, src: 'ASSUMED', note: 'I11: above ≈9 m bodyPx falls with no safety gain (review R2-06)' },
  { id: 'camTiltDeg', zh: '镜头相对线向上倾角（朝向上身）', en: 'Lens tilt from the line toward the upper body', unit: '°', v: 8, min: 0, max: 15, step: 1, src: 'CALC', note: 'eyelet ≈0.9 m below the body centre; keeps the crop inside the sensor on short lines' },
  { id: 'LminS', zh: '最短线长（弱风时更近更低）', en: 'Shortest scheduled line (closer and lower in light air)', unit: 'm', v: 5, min: 2, max: 8, step: 0.5, src: 'ASSUMED' },
  { id: 'wake', zh: '骑手尾流模型（1=开）', en: 'Rider wake model (1 = on)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'twMax', zh: '顺风上限（估计沿航迹顺风，超过则不放/提前收）', en: 'Tailwind limit (estimated along-course tailwind; above it no launch / early retrieve)', unit: 'm/s', v: 5, min: 2, max: 12, step: 0.5, src: 'ASSUMED', note: 'I11: 5 m/s (review R2-08: best single trade for the brief-near-head rule; user accepted the tailwind limitation)' },
  { id: 'cwMax', zh: '侧风上限（估计）', en: 'Crosswind limit (estimated)', unit: 'm/s', v: 99, min: 3, max: 99, step: 0.5, src: 'ASSUMED', note: 'I11 study' },
  { id: 'swingGuard', zh: '摆动保护（0=关，1=收线，2=加泄力）', en: 'Swing guard (0 off, 1 reel in, 2 extra depower)', unit: '', v: 1, min: 0, max: 2, step: 1, src: 'ASSUMED', note: 'I11: reel in while the line is >40° off the course — longest within-1 m episode 3.1 → 1.9 s' },
  { id: 'twStop', zh: '停下策略（0=刹车再收；1=立即快速拉低）', en: 'Stop strategy (0 = brake then retrieve; 1 = immediate fast pull-down)', unit: '', v: 1, min: 0, max: 3, step: 1, src: 'ASSUMED', note: 'I9 study: 1 keeps the kite behind in tailwind stops' },
  { id: 'driftLP', zh: '相机姿态漂移模型（0=与 AT-1 相同的原始 OU；1=0.2 Hz 低通）', en: 'Camera drift model (0 = raw OU as AT-1; 1 = 0.2 Hz low-pass)', unit: '', v: 0, min: 0, max: 1, step: 1, src: 'ASSUMED', note: 'review RV-04: judged like-for-like' },
  { id: 'Lstream', zh: '起飞前低空拖伞段长度（帆保持泄力）', en: 'Low streaming length before the sail is powered', unit: 'm', v: 3, min: 0, max: 5, step: 0.5, src: 'ASSUMED', note: 'iteration I8: opening and climb happen away from the head' },
  { id: 'vLaunch', zh: '放线速度（低拉力时）', en: 'Pay-out speed (low pull)', unit: 'm/s', v: 2.0, min: 1, max: 4, step: 0.5, src: 'ASSUMED' },
  { id: 'vRet', zh: '回收速度', en: 'Retrieve speed', unit: 'm/s', v: 3.5, min: 1, max: 5, step: 0.5, src: 'ASSUMED' },
  { id: 'swivel', zh: '套管口万向漏斗（1=有）', en: 'Swivel funnel at the mouth (1 = on)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'massScale', zh: '风筝质量倍数', en: 'Kite mass factor', unit: '', v: 1, min: 0.7, max: 1.5, step: 0.05, src: 'ASSUMED' },
  { id: 'cd0Scale', zh: '零升阻力倍数', en: 'CD0 factor', unit: '', v: 1, min: 0.6, max: 1.6, step: 0.05, src: 'ASSUMED' },
  { id: 'clmaxScale', zh: '最大升力系数倍数', en: 'CLmax factor', unit: '', v: 1, min: 0.6, max: 1.3, step: 0.05, src: 'ASSUMED' },
  { id: 'wBias', zh: '风估计偏差（+=高估顺风）', en: 'Wind-estimate bias (+ = more tailwind)', unit: 'm/s', v: 0, min: -3, max: 3, step: 0.5, src: 'ASSUMED' },
  { id: 'noise', zh: '传感器噪声倍数', en: 'Sensor noise factor', unit: '', v: 1, min: 0, max: 3, step: 0.25, src: 'ASSUMED' },
  { id: 'capScale', zh: '捕获模型基准倍数', en: 'Capture model base-rate factor', unit: '', v: 1, min: 0.5, max: 1.05, step: 0.05, src: 'ASSUMED' },
];

const W_LIGHT = { mean: [0, 2, 0], intensity: 0.15, seed: 7 };
const FR = (id) => FULLRUN_CASES_R4.find((c) => c.id === id);
const caseWind = (c) => ({ mean: c.mean, intensity: c.intensity ?? 0.15, seed: c.seed });
export const PLAN_R4 = [FULLRUN_PLAN[0], FULLRUN_PLAN[1], FULLRUN_PLAN[2], { hold: 25 }];

const SCEN = [
  { id: 'nominal', zh: '标准：从静止蹬出，12 m/s 大弯 30 s（2 m/s 侧风）', en: 'Nominal: push-off from rest, 30 s of 12 m/s carving (2 m/s crosswind)', rider: 'push', dur: 31, wind: W_LIGHT,
    expect: { zh: '起滑检测→估计相对风够→气流把风筝从腰下拉出→张开爬升→泄力线控拉力跟拍。', en: 'Start detected → enough apparent wind → airflow pulls the kite out of the sacrum mouth → it opens and climbs → depower line holds the pull.' } },
  { id: 'fullrun', zh: '整趟（共享 R4）：出发→停 20 s→再出发→停（3 m/s 顶风）', en: 'Full run (shared R4): push-off → 20 s stop → push-off → stop (3 m/s headwind)', rider: 'run', case: 'head3_s12',
    expect: { zh: '每次出发自动放飞，停下泄力、边滑边收、入套管；48 例集合指标见 ens*。', en: 'Auto launch each push-off; at each stop depower, reel in while sliding, dock; 48-case ensemble in ens* metrics.' } },
  { id: 'tail45', zh: '整趟：4.5 m/s 顺风', en: 'Full run: 4.5 m/s tailwind', rider: 'run', case: 'tail4.5_s11',
    expect: { zh: '相对风约 8 m/s：低翼载应能放飞。', en: 'Apparent wind ≈8 m/s: the low wing loading should still launch.' } },
  { id: 'tail9', zh: '整趟：9 m/s 顺风（停下时风把风筝吹向骑手）', en: 'Full run: 9 m/s tailwind (at the stop the wind blows the kite toward the rider)', rider: 'run', case: 'tail9_s11',
    expect: { zh: '检验停下时的头部间隙与回收。', en: 'Checks head clearance and retrieval at the stop.' } },
  { id: 'head9', zh: '整趟：9 m/s 顶风（相对风 ≈21 m/s，拉力最大）', en: 'Full run: 9 m/s headwind (apparent ≈21 m/s, highest pull)', rider: 'run', case: 'head9_s11',
    expect: { zh: '检验身体力与弱连接。', en: 'Checks body force and the weak link.' } },
  { id: 'fall', zh: '12 m/s 摔倒', en: 'Fall at 12 m/s', rider: 'fall', dur: 24, wind: W_LIGHT,
    expect: { zh: '检测摔倒→全泄力塌翼、放松线；报告身体力、动能、头部间隙。', en: 'Fall detected → full depower (collapse), free-spool; body force, KE, head clearance reported.' } },
  { id: 'gust', zh: '6 m/s 顶风 + 7 m/s 阵风', en: '6 m/s headwind + 7 m/s gust', rider: 'push', dur: 31, wind: { mean: [-6, 0, 0], intensity: 0.2, seed: 9, gustAt: 16, gust: [-7, 0, 0], gustRise: 1, gustHold: 3 },
    expect: { zh: '泄力线压住拉力；报告峰值拉力。', en: 'The depower line holds the pull; peak tension reported.' } },
  { id: 'shortturns', zh: '短弯 8 m/s', en: 'Short turns 8 m/s', rider: 'push', dur: 31, skier: SKIER_PRESETS.shortTurns, wind: W_LIGHT,
    expect: { zh: '出口每弯横摆；报告塌翼与画面稳定性。', en: 'The exit swings each turn; collapses and footage stability reported.' } },
  { id: 'expert', zh: '高手 16 m/s 大弯', en: 'Expert carving 16 m/s', rider: 'push', dur: 31, skier: { ...SKIER_PRESETS.expertCarve, vTarget: 16, v0: 0 }, wind: W_LIGHT,
    expect: { zh: '动能与拉力上限检验。', en: 'KE and pull limits.' } },
  { id: 'moguls', zh: '猫跳 4.5 m/s（低速）', en: 'Moguls 4.5 m/s (slow)', rider: 'push', dur: 31, skier: SKIER_PRESETS.moguls, wind: W_LIGHT,
    expect: { zh: '相对风接近门槛：可能放飞也可能拒飞，诚实报告。', en: 'Apparent wind near the gate: may or may not launch — reported as is.' } },
  { id: 'chairdown', fault: true, zh: '下行吊椅（5 m/s 下降，无雪面振动）', en: 'Downloading chairlift (5 m/s descent, no on-snow vibration)', rider: 'chair', dur: 30, wind: W_LIGHT,
    expect: { zh: '起滑检测需要雪面振动：不放飞。', en: 'The start detector needs on-snow vibration: no launch.' } },
];

function chairRun(dur) {
  const n = Math.floor(dur / SDT) + 1, tanS = Math.tan((15 * Math.PI) / 180);
  const col = {}; for (const k of ['t', 'x', 'y', 'z', 'psi', 'hx', 'hy', 'vx', 'vy', 'v', 'lat', 'lon', 'lean', 'crouch', 'plantL', 'plantR', 'fallen']) col[k] = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = i * SDT; col.t[i] = t; col.x[i] = 5 * t; col.z[i] = -col.x[i] * tanS + 6; col.hx[i] = -1; col.vx[i] = 5; col.v[i] = 5; col.crouch[i] = 1; }
  const sk = { opts: {}, tanS, n, sampleDt: SDT, duration: dur, col };
  const tr = { dt: SDT, n, t: col.t, vx: col.vx, vy: new Float64Array(n), vz: col.vx.map((v) => -v * tanS), vib: new Float64Array(n).fill(0.03), tilt: new Float64Array(n).fill(30), impact: new Float64Array(n) };
  return { sk, tr };
}

export function prepare(params, sc) {
  let sk, wind = sc.wind, detTrace = null, caseSeed = 7;
  if (sc.rider === 'run') {
    const c = sc.caseObj || FR(sc.case);
    sk = simulateRun({ seed: c.seed, plan: sc.plan || PLAN_R4, skier: sc.runSkier || {} }); wind = caseWind(c); caseSeed = c.seed;
  } else if (sc.rider === 'fall') sk = simulateSkier({ start: 'push', v0: 0, duration: sc.dur + 1, seed: 3, fallAt: 12, ...(sc.skier || {}) });
  else if (sc.rider === 'chair') { const ch = chairRun(sc.dur + 0.5); sk = ch.sk; detTrace = ch.tr; }
  else sk = simulateSkier({ start: 'push', v0: 0, duration: (sc.dur ?? 31) + 1, seed: 2, ...(sc.skier || {}), ...(sc.skier ? { start: 'push', v0: 0 } : {}) });
  const dur = sc.dur ?? sk.duration;
  return { sk, input: { sk, wind, duration: dur, detTrace, seed: caseSeed * 31 + 7, dt: sc.dt }, dur };
}

const fin = (a) => Array.from(a).filter(Number.isFinite);
const maxOf = (a) => { const v = fin(a); return v.length ? Math.max(...v) : NaN; };
const minOf = (a) => { const v = fin(a); return v.length ? Math.min(...v) : NaN; };
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const nb = (x) => (Number.isFinite(x) ? x : 'n/a');

// all judged numbers of one run
export function judge(core, A, sk, { riding = null } = {}) {
  const O = core.O, n = core.n, p = core.p;
  const ridingAt = (i) => (riding ? riding[Math.min(riding.length - 1, Math.round((i * SDT) / sk.sampleDt))] > 0 : skierAt(sk, i * SDT).speed > 2);
  let noLiftN = 0, nearN = 0, epCur = 0, epMax = 0, epN = 0;
  let rideN = 0, availN = 0, artN = 0, filmRideN = 0, lowN = 0, low2N = 0, airRideN = 0, thirdS = 0, colRideN = 0, flyRideN = 0;
  const px = [], azs = [];
  for (let i = 0; i < n; i++) {
    const r = ridingAt(i);
    if (r) {
      rideN++; if (A.avail[i] === 1) availN++;
      if (O.noLift[i] === 1) noLiftN++;
      // user-revised head clearance (SIM-034): episodes with kite/line within 1.0 m of the helmet centre while riding
      if (A.headClear[i] < 1.0) { nearN++; epCur += SDT; } else if (epCur > 0) { epMax = Math.max(epMax, epCur); epN++; epCur = 0; }
      if (A.filming[i] === 1) { filmRideN++; if (A.inFrame[i]) px.push(A.bodyPx[i]); if (A.art[i]) artN++; }
      if (AIRBORNE(O.mode[i]) && Number.isFinite(A.lowLine[i])) { airRideN++; if (A.lowLine[i]) lowN++; if (A.lowLine2[i]) low2N++; }
      if (O.mode[i] === MODE.FLY) { flyRideN++; if (O.collapsed[i] === 1) colRideN++; }
    }
    if (A.thirdP[i] === 1) thirdS += SDT;
  }
  { let lp = null; const a = 1 - Math.exp(-2 * Math.PI * 0.2 * SDT); for (let i = 0; i < n; i++) { if (!(A.filming[i] === 1) || !ridingAt(i)) { lp = null; continue; } const v = A.az[i]; lp = lp == null ? v : lp + a * (v - lp); azs.push(lp); } }
  if (epCur > 0) { epMax = Math.max(epMax, epCur); epN++; }
  // all-time variant (review R2-07): over the whole run incl. stops
  let nearAllN = 0, epA = 0, epAMax = 0;
  for (let i = 0; i < n; i++) { if (A.headClear[i] < 1.0) { nearAllN++; epA += SDT; } else { epAMax = Math.max(epAMax, epA); epA = 0; } }
  epAMax = Math.max(epAMax, epA);
  const docks = core.met.docks, caps = core.met.captures;
  let setup = 0;
  const stops = sk.stops || [];
  stops.forEach((st, k) => {
    const lock = docks.find((d) => d.t >= st.t0 - 8 && d.t <= st.t1 + 30) || (k < stops.length - 1 ? core.met.parks.find((d) => d.t >= st.t0 - 8 && d.t <= st.t1 + 30) : null);
    const last = k === stops.length - 1;
    const iS = Math.min(n - 1, Math.round(st.t0 / SDT)), out0 = AIRBORNE(O.mode[iS]);
    if (!lock) {
      // I10: last stop parked on the snow → the rider stows it by hand (20 s ASSUMED, one action)
      const park = last ? core.met.parks.find((d) => d.t >= st.t0 - 8 && d.t <= st.t1 + 30) : null;
      if (park) { setup += Math.max(0, park.t - st.t0) + 20; return; }
      setup += last && out0 ? Math.max(0, st.t1 - st.t0) + 30 : 0; return;
    }
    if (last) setup += Math.max(0, lock.t - st.t0); else setup += Math.max(0, lock.t - st.t1);
  });
  setup += 20 * core.met.manual;
  // I10 park: a kite still parked on the snow at the end of the run is stowed by hand (one action, 20 s ASSUMED)
  const parkedEnd = O.mode[n - 1] === MODE.PARK; // counted in the stop loop above (20 s) and as one action
  const wb = wornBudget(p.areaScale, p.tail, p.stow);
  const podW = p.kb.W;
  const W = core.met.Ebatt / Math.max(1, core.duration) + BACK_STATIC_W + podW / CHARGE_EFF;
  const endur = enduranceMin(wb.batteryWh + wb.podCellWh, W, { heated: true });
  const launchOk = core.met.launches - core.met.launchFails;
  const rides = sk.rides ? sk.rides.length : 1;
  const stopDocks = docks.filter((d) => !d.manual && Number.isFinite(d.dockTime));
  return {
    availUser: rideN - noLiftN > 0 ? (100 * availN) / (rideN - noLiftN) : NaN, noLiftShare: rideN ? (100 * noLiftN) / rideN : 0,
    headNearShare: rideN ? (100 * nearN) / rideN : 0, headEpMax: epMax, headEpN: epN, headNearShareAll: (100 * nearAllN) / n, headEpMaxAll: epAMax, swingGuardS: core.met.swingGuardS,
    avail: rideN ? (100 * availN) / rideN : 0, pxMed: px.length ? pct(px, 0.5) : NaN,
    // I9 (review RV-05): the kite cannot be steered (no actuator on the flyer; the pack only trims pull), so the COMMANDABLE
    // viewing-azimuth span is 0°; the uncontrolled swing is reported as azWander (not a feature)
    azRange: 0, azWander: azs.length > 50 ? pct(azs, 0.95) - pct(azs, 0.05) : NaN,
    addedMass: wb.kg, bodyForcePeak: maxOf(A.Fbody), handsBusy: 0, setupTime: stops.length ? setup : NaN, ops: core.met.manual + (core.met.brokeAt != null ? 1 : 0) + (parkedEnd ? 1 : 0), parks: core.met.parks.length, groundLaunches: core.met.groundLaunches, parkedEnd: parkedEnd ? 1 : 0,
    keMax: maxOf(A.ke), packVol: packVolume(p.stow, p.areaScale).total, packFolded: packVolume(p.stow, p.areaScale).folded ?? NaN, headClear: minOf(A.headClear), headFlyer: minOf(A.headFlyer), headLine: minOf(A.headLine), endurance: endur, meanW: W,
    artShare: filmRideN ? (100 * artN) / filmRideN : NaN, filmShare: rideN ? (100 * filmRideN) / rideN : 0,
    launches: core.met.launches, launchFails: core.met.launchFails, launchSuccess: core.met.launches ? (100 * launchOk) / core.met.launches : NaN, ridesNoLaunch: Math.max(0, rides - launchOk),
    launchTimes: core.met.launchTimes, docks: docks.length, dockFirstTry: caps.length ? (100 * docks.filter((d) => !d.manual && d.tries === 1).length) / Math.max(1, docks.length) : NaN,
    dockTimes: stopDocks.map((d) => d.dockTime), capVrel: caps.map((c) => c.vRel), manual: core.met.manual,
    lowLineShare: airRideN ? (100 * lowN) / airRideN : NaN, clothesShare: airRideN ? (100 * low2N) / airRideN : NaN, thirdPartyS: thirdS,
    lineH1p10: pct(fin(A.lineH1), 0.1), crashes: core.met.crashes, collapses: core.met.collapses, collapseShare: flyRideN ? (100 * colRideN) / flyRideN : NaN,
    Tmax: core.met.Tmax, reelPeakW: core.met.PpeakW, reelWh: core.met.Ebatt / 3600, broke: core.met.brokeAt != null,
    refuseWindS: core.met.refuse.wind, refuseTailS: core.met.refuse.tailwind, flagOuts: core.met.flagOuts, twRetrieves: core.met.twRetrieves, refuseDetectS: core.met.refuse.detect, refuseStraightS: core.met.refuse.straight, refuseLockS: core.met.refuse.lockout,
    hcAt: (() => { let b = -1, v = 9; for (let i = 0; i < n; i++) if (A.headClear[i] < v) { v = A.headClear[i]; b = i; } return b < 0 ? null : `${(b * SDT).toFixed(1)}:${MODE_NAME[O.mode[b]]}:${A.headFlyer[b] < A.headLine[b] ? 'kite' : 'line'}`; })(),
    hfAt: (() => { let b = -1, v = 9; for (let i = 0; i < n; i++) if (A.headFlyer[i] < v) { v = A.headFlyer[i]; b = i; } return b < 0 ? null : `${(b * SDT).toFixed(1)}:${MODE_NAME[O.mode[b]]}`; })(),
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
  const R = makeResult({ conceptId: 'sledpack', scenarioId: sc.id, modelVersion: MV, duration: (n - 1) * SDT, sampleDt: SDT });
  const C = (k, arr) => { const c = R.col(k); for (let i = 0; i < R.n; i++) c[i] = arr[i]; };
  const sp = new Float64Array(n); for (let i = 0; i < n; i++) sp[i] = skierAt(prep.sk, i * SDT).speed;
  C('speed', sp); C('mode', O.mode); C('lineOut', O.L); C('tension', O.T); C('tensionMeas', O.Tm); C('airspeed', O.va); C('elev', O.elev);
  C('depower', O.dep); C('alpha', O.alpha); C('sideslip', O.beta); C('collapsed', O.collapsed); C('reelRate', O.vr); C('apparentWind', O.vApp);
  const hF = new Float64Array(n); for (let i = 0; i < n; i++) hF[i] = O.fz[i] - O.snow[i]; C('height', hF);
  for (const k of ['bodyPx', 'avail', 'art', 'artW', 'headClear', 'headFlyer', 'headLine', 'ke', 'Fbody', 'lowLine2', 'vfov', 'az']) C(k, A[k]);
  for (const e of core.events) R.event(e.t, e.type, e.severity, e.zh, e.en);
  const E = sc.id === 'fullrun' && ENSEMBLE ? ENSEMBLE.metrics : null;
  const eN = (k, s) => (E && E[k] && Number.isFinite(E[k][s]) ? E[k][s] : null);
  const note = (zh, en) => ({ zh, en });
  const ens = !!E;
  addStd(R, 'avail', ens ? eN('avail', 'mean') : J.avail, ens ? note('48 例集合均值；未起飞=0', '48-case ensemble mean; never-launched runs count 0') : note('本例；起降/塌翼/拒飞时段计为不可用', 'this run; launch/collapse/refusal time counts as unavailable'));
  addStd(R, 'pxMed', nb(ens ? eN('pxMed', 'p50') : J.pxMed));
  let jit = NaN;
  try { jit = footageStability({ duration: R.duration, frame: (t) => frameAt(t) }).subjectRms; } catch { jit = NaN; }
  addStd(R, 'jitterRms', nb(ens ? eN('jitterRms', 'p90') : jit), ens ? note('48 例共享 footageStability 主体 p90', 'shared footageStability subject p90 over 48 cases') : note('共享 footageStability 主体', 'shared footageStability subject'));
  addStd(R, 'azRange', 0, note('风筝不可操纵：可指令跨度 0°；不受控摆动见 azWander', 'the kite cannot be steered: commandable span 0°; the uncontrolled swing is azWander'));
  R.metric('azWander', '观察方位不受控摆动 p5–p95（信息，不是功能）', 'Uncontrolled viewing-azimuth swing p5–p95 (info, not a feature)', nb(ens ? eN('azWander', 'p50') : J.azWander), '°', null, null);
  addStd(R, 'addedMass', J.addedMass, note('背负单元 +15 %，风筝按共享元件表 +15 %', 'back unit +15 %, kite from the shared table +15 %'));
  addStd(R, 'bodyForcePeak', nb(ens ? eN('bodyForcePeak', 'max') : J.bodyForcePeak));
  addStd(R, 'handsBusy', 0, note('全自动；人工收纳只在停稳时', 'fully automatic; manual stow only while stopped'));
  addStd(R, 'setupTime', nb(ens ? eN('setupTime', 'p90') : J.setupTime), note('停下到锁定 + 越过再出发部分 + 每次人工 20 s', 'stop → locked + overrun past the restart + 20 s per manual stow'));
  addStd(R, 'ops', ens ? eN('ops', 'p90') : J.ops);
  addStd(R, 'keMax', nb(ens ? eN('keMax', 'max') : J.keMax), note('整只风筝（帆+吊舱），>1.5 m 按雪面系', 'whole kite (sail + pod), ground frame beyond 1.5 m'));
  addStd(R, 'packVol', J.packVol, note('脊柱套管 Ø60×0.60 m + 腰部模块', 'spine sleeve Ø60 × 0.60 m + lumbar module'));
  addStd(R, 'headClear', nb(ens ? eN('headClear', 'min') : J.headClear), note('帆轮廓、吊舱与绳到 helmetAt()；仅排除 ≤3 s 捕获窗口。无杆时绳的几何上限 <1 m', 'sail outline, pod and line to helmetAt(); only the ≤3 s capture window excluded. Without a pole the line cannot reach 1 m by geometry'));
  addStd(R, 'endurance', ens ? eN('endurance', 'min') : J.endurance, note('背包电池+吊舱电池（缆车上回充）、−10 °C、15 % 储备、加热', 'pack + pod cell (recharged on the lift), −10 °C, 15 % reserve, heated'));
  const M = (id, zh, en, v, unit, pass = null, czh = null, cen = null) => R.metric(id, zh, en, v, unit, pass, czh ? { zh: czh, en: cen } : null);
  // user-revised judgement (SIM-034, integrator quantification of the user's words, ASSUMED thresholds)
  const hu = ens ? eN('headClear', 'min') : J.headClear, epMx = ens ? eN('headEpMax', 'max') : J.headEpMax, nearSh = ens ? eN('headNearShare', 'max') : J.headNearShare;
  M('headClearUser', '用户口径：离头盔中心最小距离（不接触）', 'User judgement: min distance to the helmet centre (no contact)', nb(hu), 'm', Number.isFinite(hu) ? hu >= 0.25 : null, '≥0.25 m（假设）', '≥0.25 m (assumed)');
  M('headEpMax', '用户口径：1 m 内单次最长时间（滑行中）', 'User judgement: longest episode within 1 m (riding)', nb(epMx), 's', Number.isFinite(epMx) ? epMx <= 2 : null, '≤2 s（假设）', '≤2 s (assumed)');
  M('headNearShare', '用户口径：1 m 内时间占滑行比例', 'User judgement: share of riding within 1 m', nb(nearSh), '%', Number.isFinite(nearSh) ? nearSh <= 5 : null, '≤5 %（假设）', '≤5 % (assumed)');
  M('availUser', '用户口径：可用率（扣除升力不足的顺风/弱风时段）', 'User judgement: avail excluding insufficient-lift time', nb(ens ? eN('availUser', 'mean') : J.availUser), '%', null);
  M('headFlyer', '风筝本体离头最小距离（信息）', 'Kite body min distance to head (info)', nb(ens ? eN('headFlyer', 'min') : J.headFlyer), 'm', null);
  M('headLine', '绳离头最小距离（信息）', 'Line min distance to head (info)', nb(ens ? eN('headLine', 'min') : J.headLine), 'm', null);
  M('launches', '放飞次数（失败）', 'Launches (failed)', `${J.launches} (${J.launchFails})`, '');
  M('launchSuccess', '放飞成功率', 'Launch success', nb(J.launchSuccess), '%', Number.isFinite(J.launchSuccess) ? J.launchSuccess >= 95 : null, '≥95 %（产品）', '≥95 % (product)');
  M('dockFirstTry', '首次入舱率', 'Dock first try', nb(J.dockFirstTry), '%', Number.isFinite(J.dockFirstTry) ? J.dockFirstTry >= 98 : null, '≥98 %（产品，捕获模型为假设）', '≥98 % (product; capture model ASSUMED)');
  const dt90 = J.dockTimes.length ? pct(J.dockTimes, 0.9) : NaN;
  M('dockTimeP90', '回收开始到锁定 p90', 'Retrieve start → locked p90', nb(dt90), 's', Number.isFinite(dt90) ? dt90 <= 10 : null, '≤10 s（产品）', '≤10 s (product)');
  M('clothes', '晾衣绳：出口后 >1 m 处绳低于 2 m 的比例', 'Clothesline: line <2 m above snow >1 m behind the exit (share of airborne riding)', nb(J.clothesShare), '%');
  M('collapseShare', '飞行中塌翼时间比例', 'Collapsed share of flight', nb(J.collapseShare), '%');
  M('elevMed', '飞行仰角中位', 'Flight elevation median', nb(J.elevMed), '°');
  M('tensionMed', '飞行拉力中位', 'Flight pull median', nb(J.tensionMed), 'N');
  M('Tmax', '出口拉力瞬时最大', 'Exit tension instantaneous max', J.Tmax, 'N');
  M('kiteMass', '风筝质量（含吊舱）', 'Kite mass incl. pod', p.m, 'kg', p.m <= 0.075, '≤0.075 kg（设计目标）', '≤0.075 kg (design target)');
  M('vMin', '最小飞行风速', 'Minimum flying airspeed', p.Vmin, 'm/s');
  if (ens) {
    M('ensAvailP10', '整趟集合：可用率 p10', 'Full-run ensemble: avail p10', eN('avail', 'p10'), '%');
    M('ensKeP90', '整趟集合：动能 p90', 'Full-run ensemble: KE p90', eN('keMax', 'p90'), 'J');
  }
  if (sc.fault || sc.id === 'fall') {
    const SAFE = ['bodyForcePeak', 'keMax', 'headClear', 'addedMass', 'packVol'];
    for (const m of R.metrics) if (!SAFE.includes(m.id) && m.pass != null) { m.pass = null; m.criterion = m.criterion ? { zh: m.criterion.zh + '（故障/安全工况不判）', en: m.criterion.en + ' (fault/safety scenario: not judged)' } : null; }
  }
  if (sc.id === 'chairdown') M('liftLaunch', '缆车上放飞次数', 'Launches on the lift', J.launches, '', J.launches === 0, '0', '0');
  R.plots.push({ key: 'flight', zh: '飞行', en: 'Flight', series: [['elev', '°', '线仰角', 'Line elevation'], ['alpha', '°', '迎角', 'AoA'], ['height', 'm', '离雪高度', 'Height above snow'], ['depower', '—', '泄力', 'Depower']] });
  R.plots.push({ key: 'reel', zh: '绳与卷轴', en: 'Line and reel', series: [['tension', 'N', '出口拉力', 'Exit tension'], ['lineOut', 'm', '放线长度', 'Line out'], ['reelRate', 'm/s', '收放速度（+放）', 'Reel rate (+out)'], ['apparentWind', 'm/s', '相对风', 'Apparent wind']] });
  R.plots.push({ key: 'frame', zh: '画面', en: 'Footage', series: [['bodyPx', 'px', '身体像素', 'Body px'], ['avail', '—', '可用', 'Usable'], ['collapsed', '—', '塌翼', 'Collapsed'], ['vfov', '°', '输出视场', 'Output VFOV']] });
  R.plots.push({ key: 'safety', zh: '安全', en: 'Safety', series: [['headFlyer', 'm', '风筝离头', 'Kite to head'], ['headLine', 'm', '绳离头', 'Line to head'], ['ke', 'J', '动能', 'KE'], ['Fbody', 'N', '身体力（50 ms）', 'Body force (50 ms)']] });
  if (sc.id === 'fall' && core.fallT != null) { R.validUntil = Math.min(R.duration, core.fallT + 6); R.event(R.validUntil, 'scope', 'invalid', '此后倒地翻滚与绳缠绕未建模', 'Beyond this the tumbling rider and line wrap are not modelled'); }
  R.events.sort((a, b) => a.t - b.t);
  function frameAt(t) {
    const f = Math.max(0, Math.min(n - 1, t / SDT)), i = Math.round(f);
    const s = skierAt(prep.sk, t);
    const md = O.mode[i];
    const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), w = f - i0;
    const li = (k) => (Number.isFinite(A[k][i1]) ? A[k][i0] * (1 - w) + A[k][i1] * w : A[k][i0]);
    const cam = A.filming[i0] === 1 ? { pos: [li('cpx'), li('cpy'), li('cpz')], fwd: [li('cfx'), li('cfy'), li('cfz')], up: [0, 0, 1], vfovDeg: li('vfov'), label: '风筝吊舱相机（48 MP 重构图）/ kite pod camera (48 MP reframed)' } : null;
    const air = AIRBORNE(md) && Number.isFinite(O.fx[i]);
    const sail = air ? sailPts(O, i, p) : null;
    const dev = {
      mode: MODE_NAME[md], kite: air ? [O.fx[i], O.fy[i], O.fz[i]] : null, nose: air ? [O.bfx[i], O.bfy[i], O.bfz[i]] : null, lineDir: air ? [O.bux[i], O.buy[i], O.buz[i]] : null,
      stow: p.stow, sail, span: p.geo.span, chord: p.geo.chord, bridle: p.geo.bridle, collapsed: O.collapsed[i] === 1, depower: O.dep[i],
      exit: [O.ex[i], O.ey[i], O.ez[i]], axis: [O.ax[i], O.ay[i], O.az[i]], stow: [O.sx[i], O.sy[i], O.sz[i]], sleeveLen: GEOM.sleeveLen,
      line: linePoints(O, i, 16), L: O.L[i], tension: O.T[i], reel: O.vr[i], cut: O.cut[i] > 0, inside: !air, camPos: air ? camPosOf(O, i) : null,
      warn: core.events.some((e) => e.severity !== 'info' && e.t <= t && e.t > t - 3),
      // the flyer/pod naming used by the shared gear/inset helpers
      flyer: air ? [O.fx[i], O.fy[i], O.fz[i]] : [O.sx[i], O.sy[i], O.sz[i]],
    };
    const labels = demo ? [] : air ? [{ p: [O.fx[i], O.fy[i], O.fz[i] + 0.8], text: `${O.L[i].toFixed(1)} m · ${O.T[i].toFixed(1)} N`, color: O.T[i] > 25 ? '#ff6a5a' : '#9cc8ff' }] : [];
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

export function evaluateCase(params, c, { fs = true, plan = PLAN_R4, runSkier = null } = {}) {
  const sc = { id: 'case', rider: 'run', caseObj: c, plan, runSkier };
  const prep = prepare(params, sc);
  const R = buildResult(params, sc, prep);
  const J = R.judge;
  const fsr = fs ? footageStability(R) : { subjectRms: NaN };
  const { dockTimes, capVrel, launchTimes, ...rest } = J;
  return { id: c.id, U: c.U, dir: c.dir, seed: c.seed, ...rest, jitterRms: fsr.subjectRms, flown: J.launches - J.launchFails > 0, dockTimes, capVrel, launchTimes, events: R.core.events.filter((e) => e.severity !== 'info').map((e) => `${e.t}:${e.type}`) };
}

export const ENS_KEYS = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'headClear', 'endurance', 'headFlyer', 'headLine',
  'parks', 'groundLaunches', 'parkedEnd', 'availUser', 'noLiftShare', 'headNearShare', 'headEpMax', 'headNearShareAll', 'headEpMaxAll', 'swingGuardS', 'headEpN', 'packFolded', 'azWander', 'refuseTailS', 'flagOuts', 'twRetrieves', 'artShare', 'filmShare', 'launchSuccess', 'dockFirstTry', 'lowLineShare', 'clothesShare', 'thirdPartyS', 'crashes', 'collapses', 'collapseShare', 'Tmax', 'reelPeakW', 'reelWh', 'meanW', 'elevMed', 'tensionMed', 'manual',
  'refuseWindS', 'refuseDetectS', 'refuseStraightS', 'refuseLockS', 'ridesNoLaunch'];
export function ensembleStats(rows) {
  const st = (k, rr) => { const v = rr.map((r) => r[k]).filter(Number.isFinite); return v.length ? { mean: meanOf(v), p10: pct(v, 0.1), p50: pct(v, 0.5), p90: pct(v, 0.9), min: Math.min(...v), max: Math.max(...v), n: v.length } : { n: 0 }; };
  const metrics = Object.fromEntries(ENS_KEYS.map((k) => [k, st(k, rows)]));
  metrics.jitterRms = st('jitterRms', rows.filter((r) => r.flown));
  const dts = rows.flatMap((r) => r.dockTimes || []);
  metrics.dockTime = dts.length ? { p50: pct(dts, 0.5), p90: pct(dts, 0.9), max: Math.max(...dts), n: dts.length } : { n: 0 };
  const lts = rows.flatMap((r) => r.launchTimes || []);
  metrics.launchTime = lts.length ? { p50: pct(lts, 0.5), p90: pct(lts, 0.9), max: Math.max(...lts), n: lts.length } : { n: 0 };
  return { metrics, counts: { cases: rows.length, flown: rows.filter((r) => r.flown).length, broke: rows.filter((r) => r.broke).length } };
}

// ------------------------------------------------------------------ demo: docked → auto launch → follow → stop → reel in → dock
const DEMO_PLAN = [{ ride: 30, preset: 'recreationalCarve' }, { hold: 16 }];
const DEMO_T = 44;
const STAGES = [
  { key: 'docked', t0: 0, t1: 0.9, title: { zh: '展开背在背上', en: 'Carried open on the back' }, zh: '约 71 g 的软翼风筝（含相机吊舱）展开平贴在背上，翼尖扣在肩带磁座上，线从臀后腰带的小环出；没有杆，背上没有东西高过肩。背负共约 0.62 kg。', en: 'The ≈71 g soft sled kite (with its camera pod) rides open and flat on the back, keel noses in magnetic seats on the shoulder straps; the line leaves from a small ring on the hip belt behind the buttocks. No pole, nothing above the shoulders. ≈0.62 kg worn.', pending: true },
  { key: 'detect', t0: 0.9, t1: 1.6, title: { zh: '起滑检测', en: 'Ride start detected' }, zh: '背包 IMU+GNSS+气压在蹬出后约 1 s 判定起滑，并估算相对风；估计顺风 >5 m/s 时不放（升力不够，风筝留在背上）。', en: 'Pack IMU+GNSS+baro confirm the ride ≈1 s after push-off and estimate the apparent wind; above ≈5 m/s estimated tailwind it stays on the back (not enough lift).', pending: true },
  { key: 'launch', t0: 1.6, t1: 4.3, title: { zh: '从背上放出', en: 'Released from the back' }, zh: '磁扣松开，展开的风筝从背上翻离（约 0.8 s，翼尖离头约 0.6 m），落进身后尾流，随着放线离开尾流、吃到风后爬升。', en: 'The seats release; the open kite peels off the back (≈0.8 s, nose ≈0.6 m from the helmet), drops into the wake behind the rider and climbs as the line pays out into clean air.', pending: true },
  { key: 'film', t0: 4.3, t1: 29.9, title: { zh: '跟拍：快和风大时飞得更高更远', en: 'Following: higher and farther when fast and windy' }, zh: '线长随相对风调度（约 5–9 m）：风大、速度快时放远（因而更高），弱风时收近收低；风筝摆到身后 ±40° 以外时自动收线把它拉回身后。背包泄力线把拉力压在约 13 N。镜头相对线上倾 8°，48 MP 电子稳像重构图。', en: 'Line length follows the apparent wind (≈5–9 m): farther (and therefore higher) when fast and windy, closer and lower in light air; if the kite swings more than ±40° off straight behind, the reel pulls it back in. The depower line holds ≈13 N. The lens is tilted 8° up from the line; 48 MP stabilised reframing.', pending: true },
  { key: 'stop', t0: 29.9, t1: 33, title: { zh: '减速：塌翼、趁滑行拉低', en: 'Slowing: flag the sail, pull it down while sliding' }, zh: '检测到减速就全泄力（帆像旗一样塌下），趁人还在滑、风筝还在身后立即快速拉低，不让它飘过头顶。', en: 'On the deceleration the sail is flagged and pulled down fast while the rider still slides and the kite is still behind, so it never drifts over the head.', pending: true },
  { key: 'dock', t0: 33, t1: DEMO_T, title: { zh: '落回背上，或在身后雪面待机', en: 'Back onto the back, or parked on the snow behind' }, zh: '线从身后水平方向进来时，把风筝收回贴到背上（成功率为假设模型）；停稳后它垂在下方贴不上时，就在身后约 2.5 m 的雪面上待机，下次出发直接从雪面再起飞。', en: 'When the line comes in from behind it lays the kite back onto the back (an ASSUMED capture model); once the rider has stopped and it hangs below, it waits on the snow ≈2.5 m behind and relaunches from there on the next push-off.', pending: true },
];
function buildDemo(params) {
  const sk = simulateRun({ seed: 11, plan: DEMO_PLAN });
  const sc = { id: 'demo', rider: 'run' };
  const prep = { sk, input: { sk, wind: { mean: [-2, 1, 0], intensity: 0.12, seed: 11 }, duration: DEMO_T, seed: 11 * 31 + 7 }, dur: DEMO_T };
  const R = buildResult(params, sc, prep, { demo: true });
  R.scenarioId = 'demo';
  return R;
}

export default {
  id: 'sledpack', family: 'aerial',
  name: { zh: 'SledPack 无杆背负软翼风筝相机', en: 'SledPack pole-free back-carried soft-kite cam' },
  tagline: { zh: '没有杆：展开的风筝平贴在背上，起滑且风够就放出；快和风大时飞得更高更远，弱风时收近；停下塌翼拉低，落回背上或在身后雪面待机', en: 'No pole: the open kite rides flat on the back, launches once riding with enough wind, flies higher and farther when fast and windy and closer in light air; at stops it is flagged, pulled down and laid back onto the back or parked on the snow behind' },
  about: { zh: 'SIM-033（用户 2026-10-21：去掉背后的杆，像背包一样背着，速度和风够了自动放线起飞）。软单层翼伞形风筝 + 背包双线卷轴（主线+泄力线），飞行体无动力（仍是风筝）。按第四轮共享规则判定；绳到头的距离在无杆时几何上不可能 ≥1 m，单独报告。结果见 research/sledpack_2026_10_21/dev/。仿真不是实测。', en: 'SIM-033 (user 2026-10-21: drop the pole, wear it like a pack, auto launch once speed and wind suffice). Soft single-skin sled + two-line pack reel (main + depower); the flyer is unpowered (still a kite). Judged on the shared round-4 rules; without a pole the line cannot be ≥1 m from the head by geometry, reported separately. Results in research/sledpack_2026_10_21/dev/. Simulation is not verification.' },
  modelVersion: MV,
  modelLimits: [
    { zh: '风筝为质点 + 偏航滞后，迎角由缰绳几何给出；帆的极曲线、塌翼与再张开条件均为假设', en: 'Kite = point mass + yaw lag, AoA from the bridle geometry; sail polar, collapse and re-inflation conditions ASSUMED' },
    { zh: '绳为直线弹性段 + 抛物线垂度；两根线按同一路径；骑手尾流未建模', en: 'Line = straight elastic segment + parabolic sag; both lines share one path; rider wake not modelled' },
    { zh: '入舱成功率为假设模型（含万向漏斗）；软帆在漏斗里卡住、结冰、湿帆未建模', en: 'Dock success is an ASSUMED model (incl. the swivel funnel); sail jams, icing and wet sails not modelled' },
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
