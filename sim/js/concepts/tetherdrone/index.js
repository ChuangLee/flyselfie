// S3 tetherdrone (A03): backpack power-tethered quadrotor — a "flying boom".
// A ≈200 g battery-less quad (30 s backup cell) is powered over a 1.4 mm,
// 100 V micro-tether from a 100 Wh battery and a tension-controlled reel in
// the backpack; it lifts off from / lands into a dome cradle on the pack and
// station-keeps 3–10 m behind/above (or beside) the rider.
// Physics: model.js (lumped-mass tether, reel, drone, power); geometry and
// footage: analysis.js. Numerical-uncalibrated simulation; demo = illustration.
import { simulateSkier, skierAt, bodyPoints, SKIER_PRESETS } from '../common/skier.js';
import { stats } from '../common/env.js';
import { makeResult, fraction } from '../common/result.js';
import { addStd, jitterHP } from '../common/criteria.js';
import { runCore, applyHardFall, NSEG, PDEF, tetherElectrical, rotorPower } from './model.js';
import { analyse, VFOV_FULL } from './analysis.js';

const MV = 'tetherdrone@0.3.1';
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const PARAMS = [
  { id: 'design', zh: '设计版本（1=v1、2=v2 预设，覆盖下列硬件参数；3=v3 按下列参数）', en: 'Design (1 = v1, 2 = v2 preset, override the hardware params below; 3 = v3 as listed)', unit: '', v: 3, min: 1, max: 3, step: 1, src: 'ASSUMED' },
  { id: 'exit', zh: '出绳/停靠位置（0背包罩 1背后桅杆 2髋部短臂 3头盔顶 4髋部0.8 m后伸臂 5背包伸缩桅杆：仅停稳起降时伸出）', en: 'Tether exit / dock (0 pack dome, 1 rear mast, 2 short hip outrigger, 3 helmet top, 4 0.8 m rear-left hip boom, 5 telescopic pack mast extended only while stopped)', unit: '', v: 5, min: 0, max: 5, step: 1, src: 'ASSUMED', note: '3 = geometry study only (no dock model)' },
  { id: 'Lst', zh: '工作系留长度', en: 'Station tether length', unit: 'm', v: 6.5, min: 3, max: 10, step: 0.5, src: 'ASSUMED', note: 'A03: 3–10 m "flying boom"' },
  { id: 'elev', zh: '机位仰角（相对出绳点）', en: 'Station elevation (from the exit)', unit: '°', v: 50, min: 15, max: 60, step: 1, src: 'ASSUMED' },
  { id: 'az', zh: '机位方位偏置（0=正后，+左）', en: 'Station azimuth offset (0 = behind, + left)', unit: '°', v: -35, min: -90, max: 90, step: 5, src: 'ASSUMED', note: 'v3: base side; shot plan hops to the mirrored side mid-run' },
  { id: 'Lmax', zh: '卷轴容绳量', en: 'Reel line capacity', unit: 'm', v: 12, min: 4, max: 15, step: 0.5, src: 'ASSUMED' },
  { id: 'Tset', zh: '卷轴张力设定', en: 'Reel tension set-point', unit: 'N', v: 0.8, min: 0.3, max: 3, step: 0.1, src: 'ASSUMED' },
  { id: 'Fslip', zh: '卷轴打滑力', en: 'Reel slip force', unit: 'N', v: 4, min: 2, max: 12, step: 0.5, src: 'ASSUMED' },
  { id: 'weakLink', zh: '出绳处弱连接断开力', en: 'Weak link at the exit', unit: 'N', v: 50, min: 5, max: 80, step: 1, src: 'ASSUMED', note: 'v2 relies on the drone-end cutter first; a fixed-obstacle catch at 12 m/s gives a ≈2·v·√(EA·μ) ≈ 40 N tension wave (calc), so the link must exceed it; 50 ms mean stays <40 N' },
  { id: 'snagMode', zh: '挂绳处置（0 仅弱连接，1 机端切绳+自主降落）', en: 'Snag response (0 weak link only, 1 drone-end cutter + autonomous landing)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'cutDelay', zh: '切绳器触发+动作时间', en: 'Cutter trigger + actuation time', unit: 's', v: 0.06, min: 0.02, max: 0.5, step: 0.01, src: 'ASSUMED', note: 'drone load cell spike + 30 ms hot-knife; 0.10 s lets the snagged line pull the drone into the branch' },
  { id: 'mass', zh: '飞行质量（含备用电芯）', en: 'Flying mass (incl. backup cell)', unit: 'kg', v: 0.07, min: 0.05, max: 0.25, step: 0.005, src: 'ASSUMED', note: 'v3 no main battery: 2″ ducted frame 30 g, 4× 1103 motors 11 g, FC/ESC/56 V→8 V 11 g, 4K 2-axis gimbal cam 11 g, 2S 50 mAh backup 4 g, eyelet ring 3 g (ASSUMED; 70 g keeps KE ≤14.9 J up to 20.6 m/s)' },
  { id: 'twr', zh: '最大推重比', en: 'Max thrust/weight', unit: '—', v: 3.5, min: 1.6, max: 3.5, step: 0.1, src: 'ASSUMED' },
  { id: 'tiltMax', zh: '最大倾角', en: 'Tilt limit', unit: '°', v: 55, min: 25, max: 55, step: 1, src: 'ASSUMED' },
  { id: 'CdA', zh: '机体阻力面积', en: 'Airframe drag area CdA', unit: 'm²', v: 0.0055, min: 0.004, max: 0.03, step: 0.001, src: 'ASSUMED' },
  { id: 'rotorR', zh: '桨半径（4桨）', en: 'Rotor radius (×4)', unit: 'm', v: 0.028, min: 0.025, max: 0.06, step: 0.001, src: 'ASSUMED', note: 'v2 2.5″ ducted props' },
  { id: 'fom', zh: '等效品质因数', en: 'Effective figure of merit', unit: '—', v: 0.34, min: 0.25, max: 0.55, step: 0.01, src: 'ASSUMED' },
  { id: 'dT', zh: '系留绳直径', en: 'Tether diameter', unit: 'mm', v: 1.6, min: 0.8, max: 2.5, step: 0.1, src: 'CALC', note: 'v3: 2× 0.15 mm² Cu + aramid + jacket' },
  { id: 'muT', zh: '系留绳线密度', en: 'Tether mass per metre', unit: 'g/m', v: 3.0, min: 0.8, max: 4, step: 0.1, src: 'CALC', note: '2.69 g/m Cu + 0.7 g/m' },
  { id: 'cuArea', zh: '单根导体截面积', en: 'Conductor area (each of 2)', unit: 'mm²', v: 0.15, min: 0.02, max: 0.2, step: 0.01, src: 'CALC', note: '56 V: ≈2 % loss at 6 m nominal, 3.6 % at 10 m / 45 W' },
  { id: 'Vbus', zh: '系留母线电压', en: 'Tether bus voltage', unit: 'V', v: 56, min: 24, max: 200, step: 4, src: 'ASSUMED', note: 'IEC 62368-1 ES1 ≤60 V DC touch-safe' },
  { id: 'geo', zh: '头部地理围栏半径', en: 'Head geofence radius', unit: 'm', v: 2, min: 1, max: 4, step: 0.1, src: 'ASSUMED' },
  { id: 'noise', zh: '相对定位噪声 σ', en: 'Relative fix noise σ', unit: 'm', v: 0.08, min: 0, max: 0.5, step: 0.01, src: 'ASSUMED' },
  { id: 'lat', zh: '相对定位延迟', en: 'Relative fix latency', unit: 's', v: 0.12, min: 0, max: 0.4, step: 0.02, src: 'ASSUMED' },
  { id: 'backup', zh: '机载备用电池（悬停秒数）', en: 'On-board backup (hover seconds)', unit: 's', v: 25, min: 5, max: 120, step: 5, src: 'ASSUMED', note: 'v2: 2S 120 mAh LiHV, cold (15 s); v3.1: 2S 80 mAh high-rate LiHV within the 70 g budget (25 s, ASSUMED)' },
  { id: 'packWh', zh: '背包电池能量', en: 'Pack battery energy', unit: 'Wh', v: 120, min: 30, max: 160, step: 10, src: 'ASSUMED' , note: 'v3: 120 Wh at 200 Wh/kg pack level = 0.60 kg' },
  { id: 'attachOff', zh: '机体系留挂点/相机侧向间距', en: 'Tether attach ↔ camera lateral spacing', unit: 'm', v: 0.3, min: 0, max: 0.4, step: 0.01, src: 'ASSUMED', note: 'v3: 0.3 m eyelet ring; eyelet on the side away from the station' },
  { id: 'camHfov', zh: '相机水平视场（4K 传感器）', en: 'Camera HFOV (4K sensor)', unit: '°', v: 60, min: 40, max: 100, step: 1, src: 'ASSUMED', note: 'v3: 60° lens (gimbal tracks the rider, so 85° is not needed) → 2× lossless crop reaches 30° HFOV; v1/v2 85°' },
  { id: 'landT', zh: '入座末段卷轴张力（系留引导）', en: 'Reel tension in the final approach (tether-guided)', unit: 'N', v: 1, min: 0.2, max: 4, step: 0.1, src: 'ASSUMED', note: 'v3 winches the drone into the cup: lateral stiffness T/L ≫ gust drag' },
  { id: 'windT', zh: '风速张力增益', en: 'Wind-scheduled tension gain', unit: 'N/(m/s)', v: 0, min: 0, max: 0.4, step: 0.01, src: 'ASSUMED', note: 'v3: Tset + gain·wind (≤2.5 N) keeps the bowed line off the body' },
  { id: 'attachFold', zh: '起降时挂点臂收回到机体中心', en: 'Eyelet arm folds to the hub for launch/docking', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'windFF', zh: '风估计阻力前馈', en: 'Wind-estimate drag feed-forward', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED', note: 'v3: slow wind estimate from attitude/thrust; v1/v2 left wind to the integrator' },
  { id: 'speedSched', zh: '速度调度机位（>13 m/s 收到正后方）', en: 'Speed-scheduled station (pulls in behind above ~13 m/s)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'schedMin', zh: '高速时方位保留比例', en: 'Azimuth kept at high speed (fraction)', unit: '', v: 0.8, min: 0, max: 1, step: 0.05, src: 'ASSUMED', note: 'keeps the line off the subject (az 0 puts it across) while trimming the outside-of-turn path' },
  { id: 'stationTau', zh: '机位原点平滑时间常数', en: 'Station-origin smoothing time constant', unit: 's', v: 0.7, min: 0, max: 4, step: 0.1, src: 'ASSUMED', note: 'v3.1: station rides a 2nd-order low-passed rider path, not the instantaneous rider (0 = off, v1–v3)' },
  { id: 'gimbalBW', zh: '主体跟踪云台带宽', en: 'Subject-tracking gimbal bandwidth', unit: 'Hz', v: 6, min: 0, max: 10, step: 0.5, src: 'ASSUMED', note: 'vision + UWB feed-forward; 0 = v1–v3 slow tracker (τ 0.12 s)' },
  { id: 'descendOut', zh: '断电下降时侧移远离滑雪者', en: 'Power-loss descent swings out to the side', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'attachSwap', zh: '挂点随机位侧换边（环形滑车）', en: 'Eyelet swaps side with the station (ring trolley)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'shotPlan', zh: '镜头计划（0 固定方位，1 中途跨到对侧）', en: 'Shot plan (0 fixed azimuth, 1 hop to the mirrored side mid-run)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'mastH', zh: '桅杆高度（exit=1）', en: 'Mast height (exit 1)', unit: 'm', v: 0.7, min: 0.3, max: 1.2, step: 0.05, src: 'ASSUMED' },
  { id: 'mastBack', zh: '桅杆后倾距离（exit=1）', en: 'Mast rearward offset (exit 1)', unit: 'm', v: 0.5, min: 0, max: 0.8, step: 0.05, src: 'ASSUMED' },
];
// v1 hardware preset (iteration 1), selected by design = 1
const V1 = { exit: 0, az: 0, elev: 35, Lst: 6, Lmax: 10, Tset: 1.5, Fslip: 5, weakLink: 15, snagMode: 0, mass: 0.2, twr: 2.4, tiltMax: 42, CdA: 0.012, rotorR: 0.038, fom: 0.38, dT: 1.4, muT: 1.8, cuArea: 0.05, Vbus: 100, backup: 30, packWh: 100, attachOff: 0.1, attachSwap: 0, shotPlan: 0, landT: 0.4, windT: 0, attachFold: 0, windFF: 0, speedSched: 0, camHfov: 85, schedMin: 0, stationTau: 0, gimbalBW: 0, descendOut: 0 };
const V2 = { exit: 4, az: -25, elev: 40, Lst: 6, Lmax: 12, Tset: 0.8, Fslip: 4, weakLink: 50, snagMode: 1, cutDelay: 0.06, mass: 0.12, twr: 2.6, tiltMax: 45, CdA: 0.008, rotorR: 0.032, fom: 0.36, dT: 1.5, muT: 2.3, cuArea: 0.09, Vbus: 56, backup: 15, packWh: 60, attachOff: 0.1, attachSwap: 0, shotPlan: 0, landT: 0.4, windT: 0, attachFold: 0, windFF: 0, speedSched: 0, camHfov: 85, schedMin: 0, stationTau: 0, gimbalBW: 0, descendOut: 0 };
const resolve = (params) => { const d = params.design | 0; return d === 1 ? { ...params, ...V1 } : d === 2 ? { ...params, ...V2 } : { ...params }; };
// worn mass breakdown (ASSUMED), kg
const MASS = { 3: { drone: 0.07, reel: 0.2, telescopicMast: 0.15, battery: 0.6, electronics: 0.05, tether: 0.036 }, 1: { drone: 0.2, reel: 0.22, battery: 0.62, dome: 0.09, electronics: 0.08, tether: 0.018 }, 2: { drone: 0.12, reelPod: 0.2, hipBoom: 0.12, battery: 0.37, electronics: 0.05, tether: 0.028 } };

const W_LIGHT = { mean: [0, 2, 0], intensity: 0.2, Lu: 30, seed: 7 };
const SCEN = [
  { id: 'nominal', zh: '标准：12 m/s 大弯，微风（v3）', en: 'Nominal: 12 m/s carving, light wind (v3)', dur: 30, skier: { duration: 31 }, wind: W_LIGHT,
    expect: { zh: '改进方案稳定跟拍：画面中主体上无≥1 px 的绳/杆伪影；动能≤14.9 J；背部力、续航满足统一判据。', en: 'Redesign filming steadily: no ≥1 px tether/boom artefact over the subject; KE ≤14.9 J; body force and endurance within the harmonised criteria.' } },
  { id: 'nominal_v1', compare: true, zh: '标准工况（v1 原方案）', en: 'Nominal (v1 original design)', dur: 30, skier: { duration: 31 }, wind: W_LIGHT, over: { design: 1 },
    expect: { zh: 'v1 基线：200 g、100 V、背包罩出绳——用统一判据重新计算。', en: 'v1 baseline: 200 g, 100 V, pack-dome exit — re-scored with the harmonised criteria.' } },
  { id: 'nominal_v2', compare: true, zh: '标准工况（v2 方案）', en: 'Nominal (v2 design)', dur: 30, skier: { duration: 31 }, wind: W_LIGHT, over: { design: 2 },
    expect: { zh: 'v2 对照：120 g、56 V、髋部 0.8 m 后伸臂出绳与起降。', en: 'v2 comparison: 120 g, 56 V, 0.8 m hip-boom exit and dock.' } },
  { id: 'short', zh: '短弯（校准预设 1.04 s/弯）', en: 'Short turns (calibrated preset, 1.04 s/turn)', dur: 25, skier: { duration: 26, ...SKIER_PRESETS.shortTurns }, wind: W_LIGHT,
    expect: { zh: '快速换刃：系留绳扫掠、张力抖动、绳与杆/板间隙。', en: 'Fast edge changes: tether sweep, tension jerks, clearance to poles/skis.' } },
  { id: 'fast', zh: '高速 18 m/s', en: 'High speed 18 m/s', dur: 25, skier: { duration: 26, vTarget: 18, v0: 18, turnPeriod: 5.5, turnAmpDeg: 24 }, wind: W_LIGHT,
    expect: { zh: '设计包线压力测试：轻机能否跟上？动能是否超 14.9 J？', en: 'Envelope stress: can the light drone keep up, and does KE exceed 14.9 J?' } },
  { id: 'gust', zh: '阵风侧风 6 m/s + 7 m/s 阵风', en: 'Gusty crosswind 6 m/s + 7 m/s gust', dur: 30, skier: { duration: 31 }, wind: { mean: [0, 6, 0], intensity: 0.3, Lu: 25, seed: 9, gustAt: 12, gust: [0, 7, 0], gustRise: 1, gustHold: 3 },
    expect: { zh: '120 g 机体的抗风余量：位置误差、倾角饱和、画面可用率。', en: 'Gust authority of the 120 g airframe: position error, tilt saturation, usable footage.' } },
  { id: 'side', zh: '侧面机位（方位 −60°，5.5 m）', en: 'Side view (azimuth −60°, 5.5 m)', dur: 30, skier: { duration: 31 }, wind: W_LIGHT, plan: { offset: () => ({ az: -60, Lst: 5.5, elev: 50 }) },
    expect: { zh: '与出绳侧相反的侧面镜头：绳是否仍避开人物剪影？', en: 'Side view on the side opposite the exit: does the line still stay off the silhouette?' } },
  { id: 'side_left', zh: '侧面机位（方位 +60°，左侧）', en: 'Side view (azimuth +60°, left side)', dur: 30, skier: { duration: 31 }, wind: W_LIGHT, plan: { offset: () => ({ az: 60, Lst: 5.5, elev: 50 }) },
    expect: { zh: '与出绳同侧的侧面镜头：预计绳/臂进入画面主体，作为几何限制报告。', en: 'Side view on the exit side: tether/boom expected over the subject — reported as a geometric limit.' } },
  { id: 'fall', zh: '摔倒（12 m/s 急停）', en: 'Rider fall (sudden stop from 12 m/s)', dur: 20, skier: { duration: 21, fallAt: 10 }, hardFall: { t: 10, decel: 12 }, wind: W_LIGHT,
    expect: { zh: '卷轴保护放线；无人机刹停不撞人；报告最近距离与动能。', en: 'Reel protect mode; the drone brakes and does not strike the rider; closest approach and KE.' } },
  { id: 'snag', fault: true, zh: '树枝挂绳：机端切绳+自主降落（v2）', en: 'Tree snag: drone-end cutter + autonomous landing (v2)', dur: 24, skier: { duration: 25 }, wind: W_LIGHT, branch: { t: 10, h: 2.6, half: 5 },
    expect: { zh: '挂住→机端切绳→自由端滑脱、卷轴收线；无人机后撤降落。报告背部力和留在障碍物上的东西。', en: 'Snag → drone-end cut → free end slides off, reel retracts; the drone backs off and lands. Report body force and what is left on the obstacle.' } },
  { id: 'snag_wl', fault: true, compare: true, zh: '树枝挂绳：仅弱连接（对照）', en: 'Tree snag: weak link only (comparison)', dur: 24, skier: { duration: 25 }, wind: W_LIGHT, branch: { t: 10, h: 2.6, half: 5 }, over: { snagMode: 0 },
    expect: { zh: '对照：仅靠弱连接时绳与无人机的结局。', en: 'Comparison: outcome for line and drone with only the weak link.' } },
  { id: 'power', fault: true, zh: '系留供电中断（备用电池 15 s）', en: 'Tether power interruption (15 s backup)', dur: 25, skier: { duration: 26, stopAt: 14 }, wind: W_LIGHT, plan: { faultAt: 10 },
    expect: { zh: '靠小备用电池边跟随边下降，滑雪者停下，无人机着陆。失败：电量耗尽前未着陆。', en: 'Descend on the small backup cell while following; the rider stops and the drone lands. Fail: energy runs out first.' } },
  { id: 'dock', zh: '静止时髋部后伸臂起降（阵风 3 m/s）', en: 'Launch & land on the hip boom while stopped (3 m/s gusty)', dur: 34, skier: { duration: 35, style: 'straight', v0: 0, stopAt: 0 }, wind: { mean: [2, 2, 0], intensity: 0.35, Lu: 15, seed: 3 }, plan: { start: 'docked', launchAt: 2, landAt: 16 },
    expect: { zh: '从 0.8 m 髋部后伸臂起降：桨护圈到头盔 ≥0.8 m、到手套距离，对准误差与用时。', en: 'Launch/land from the 0.8 m hip boom: rotor guard ≥0.8 m from the helmet, distance to the glove, alignment and time.' } },
  { id: 'dock_wind', zh: '起降：9 m/s 阵风', en: 'Launch & land in 9 m/s gusty wind', dur: 44, skier: { duration: 45, style: 'straight', v0: 0, stopAt: 0 }, wind: { mean: [6, 6, 0], intensity: 0.35, Lu: 15, seed: 5 }, plan: { start: 'docked', launchAt: 2, landAt: 16 },
    expect: { zh: '统一判据要求 0–9 m/s 风的停留时间（90 百分位）≤30 s。', en: 'Harmonised standstill time (90th pct over 0–9 m/s wind) ≤30 s.' } },
];

function prepare(params, sc) { // eslint-disable-line no-unused-vars
  const sk = simulateSkier({ ...sc.skier });
  if (sc.hardFall) applyHardFall(sk, sc.hardFall.t, sc.hardFall.decel);
  const plan = { ...(sc.plan || {}) };
  const pr = resolve({ ...params, ...(sc.over || {}) });
  // v3 standard shot plan: base station side for the first half, then hop across behind the rider to the mirror side
  if (pr.shotPlan && !plan.start) {
    const base = plan.offset || (() => ({}));
    const tm = sc.hardFall ? Math.min(sc.dur * 0.5, sc.hardFall.t - 4) : sc.dur * 0.5; // the hop happens before a scripted fall
    plan.offset = (t, pp) => { const o = base(t, pp); const a0 = o.az ?? pp.az; const w = smooth((t - tm) / 3); return { ...o, az: a0 * (1 - 2 * w) }; };
  }
  if (sc.branch) {
    const s = skierAt(sk, sc.branch.t);
    plan.branch = { x: s.pos[0], y0: s.pos[1] - sc.branch.half, y1: s.pos[1] + sc.branch.half, h: sc.branch.h };
  }
  return { sk, input: { duration: sc.dur, skier: sk, tGo: sc.tGo || 0, wind: sc.wind, plan, seed: 11 } };
}

const fmt1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
// launch + recovery time without running the dock scenario: spin-up 1.6 s + climb/transit 4.5 s +
// return 3.2 s + descent (1.3 m at 0.4 m/s, last 0.4 m at 0.25 m/s) + latch/dome 1 s (CALC from the plan)
const SETUP_EST = 1.6 + 4.5 + 3.2 + (0.9 / 0.4 + 0.4 / 0.25) + 1.0;
// harmonised setup time (90th pct over 0–9 m/s wind) for non-dock scenarios: the worse of the measured
// 'dock' (3 m/s) and 'dock_wind' (9 m/s) runs at default parameters (CALC by run_all.mjs; re-run those
// scenarios after changing the dock geometry or the drone)
const SETUP_SWEEP = { 1: 18.1, 2: 18.2, 3: 18.2 };

// --------------------------------------------------------------- results
function buildResult(params, sc, prep, { demo = false, settle = 2 } = {}) {
  const p = { ...PDEF, ...resolve({ ...params, ...(sc.over || {}) }) };
  const core = runCore(p, prep.input);
  const sk = prep.sk;
  const an = analyse(core, sk, { branch: prep.input.plan.branch });
  const A = an.cols, O = core.O, n = core.n;
  const R = makeResult({ conceptId: 'tetherdrone', scenarioId: sc.id, modelVersion: MV, duration: sc.dur, sampleDt: 0.02 });
  if (R.n !== n) throw new Error('sample count mismatch');
  const C = (k, src) => { const c = R.col(k); c.set(src); return c; };
  C('tension', O.T0); C('tensionPeak', O.T0max); C('reelL', O.L); C('reelRate', O.Ld);
  const lat = R.col('tensLat'), back = R.col('tensBack'), speed = R.col('speed'), dspd = R.col('droneSpeed');
  for (let i = 0; i < n; i++) {
    const s = core.rider(i * 0.02);
    const h = s.heading, l = [-h[1], h[0]];
    lat[i] = O.Fx[i] * l[0] + O.Fy[i] * l[1];
    back[i] = -(O.Fx[i] * h[0] + O.Fy[i] * h[1]);
    speed[i] = s.speed; dspd[i] = Math.hypot(O.dvx[i], O.dvy[i], O.dvz[i]);
  }
  C('yawM', A.yawM); C('headDist', A.headDist); C('clearBody', A.clearBody); C('clearSki', A.clearSki); C('clearPole', A.clearPole);
  C('sweep', A.sweep); C('tilt', O.tilt); C('pDrone', O.Pdrone); C('pLoss', O.Ploss); C('pLoss48', O.Ploss48); C('pMax24', O.Pmax24); C('pPack', O.Ppack);
  C('subjectPx', A.subjectPx); C('azView', A.az); C('tetherCross', A.cross); C('tetherCrossVis', A.crossVis); C('keSnow', A.keSnow); C('keRel', A.keRel);
  C('backupLeft', O.Eb); C('cropVfov', A.vfov); C('branchDist', A.branchDist);
  for (const e of core.events) R.events.push(e);

  // ---- metric windows (harmonised, common/criteria.js)
  C('tetherArt', A.art); C('handDist', A.handDist);
  const t0 = settle;
  const idx = []; for (let i = 0; i < n; i++) if (i * 0.02 >= t0) idx.push(i);
  const fly = idx.filter((i) => A.flying[i] === 1);
  const isDock = /^dock/.test(sc.id);
  // skiing samples: rider moving > 2 m/s and not fallen (harmonised avail/jitter denominator)
  const skiing = new Uint8Array(n);
  for (const i of idx) { const s = core.rider(i * 0.02); skiing[i] = s.speed > 2 && !s.fallen ? 1 : 0; }
  const skiIdx = idx.filter((i) => skiing[i]);
  const pick = (arr, ii) => ii.map((i) => arr[i]).filter(Number.isFinite);
  const max = (a) => (a.length ? Math.max(...a) : NaN), min = (a) => (a.length ? Math.min(...a) : NaN);
  const med = (a) => { if (!a.length) return NaN; const q = [...a].sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
  const pct = (a, q) => { if (!a.length) return NaN; const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.round(q * (v.length - 1)))]; };
  const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const nb = (x) => (Number.isFinite(x) ? x : 'n/a');
  const M = (id, zh, en, v, unit, pass, cz, ce) => R.metric(id, zh, en, v, unit, pass, cz ? { zh: cz, en: ce } : null);

  // footage: full body ≥300 px in the delivered frame and no ≥1 px product artefact (≥3 px of crossing length, ASSUMED de-minimis)
  const geomOK = (i) => A.flying[i] === 1 && A.inFrame[i] === 1 && A.subjectPx[i] >= 300;
  const artef = (i) => A.art[i] >= 3;
  const den = Math.max(1, skiIdx.length);
  const noSki = skiIdx.length === 0;
  const availRaw = skiIdx.filter((i) => geomOK(i) && !artef(i)).length / den;
  const availGeom = skiIdx.filter(geomOK).length / den;
  const availInp = skiIdx.filter((i) => geomOK(i) && (!artef(i) || A.artW[i] <= 9)).length / den;
  const artFrames = fly.filter((i) => skiing[i]).length ? fly.filter((i) => skiing[i] && artef(i)).length / fly.filter((i) => skiing[i]).length : NaN;
  const pxMed = med(skiIdx.filter((i) => A.inFrame[i] === 1 && A.flying[i] === 1).map((i) => A.subjectPx[i]));
  // jitter: inertial line-of-sight rate (>1 Hz) over skiing+filming samples, ⊕ gimbal residual 0.5 °/s (ASSUMED, as in the audit)
  const los = [], fwd0 = [], mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const ok = skiing[i] && A.flying[i] === 1 && Number.isFinite(A.lx[i]); mask[i] = ok ? 1 : 0; los.push(ok ? [A.lx[i], A.ly[i], A.lz[i]] : [1, 0, 0]); fwd0.push([1, 0, 0]); }
  // hold the nearest valid LOS through masked samples (the shared filter differences across segment starts)
  { let last = null; for (let i = 0; i < n; i++) { if (mask[i]) last = los[i]; else if (last) los[i] = last; } let nxt = null; for (let i = n - 1; i >= 0; i--) { if (mask[i]) nxt = los[i]; else if (!Number.isFinite(A.lx[i]) || !mask[i]) { if (i > 0 && !mask[i - 1] && nxt && (los[i][0] === 1 && los[i][1] === 0)) los[i] = nxt; } } }
  const jh = jitterHP(los, fwd0, 0.02, mask, 1);
  const jitter = Number.isFinite(jh.rms) ? Math.hypot(jh.rms, 0.5) : NaN;
  // viewing azimuth span after a 0.2 Hz low-pass (turn wobble is not shot variety)
  const azLP = []; { let y = null; const k = 1 - Math.exp(-0.02 * 2 * Math.PI * 0.2); for (const i of fly) { const a = A.az[i]; if (!Number.isFinite(a)) continue; y = y == null ? a : y + (a - y) * k; azLP.push(y); } }
  const azRange = azLP.length ? pct(azLP, 0.95) - pct(azLP, 0.05) : NaN;
  // force on the body: 50 ms moving mean of the exit force (20 ms samples)
  let F50 = 0; for (let k = 2; k < idx.length; k++) { const i = idx[k]; F50 = Math.max(F50, (0.5 * O.T0[i - 2] + O.T0[i - 1] + O.T0[i]) / 2.5); }
  F50 = Math.max(F50, max(pick(O.T0max, idx)) * 0.4); // a sub-sample spike counts at ≥40 % of its peak in a 50 ms window
  const Fraw = max(pick(O.T0max, idx));
  let jerk = 0; for (let k = 10; k < idx.length; k++) jerk = Math.max(jerk, Math.abs(O.T0[idx[k]] - O.T0[idx[k - 10]]));
  // proximity
  const launchIdx = idx.filter((i) => { const m = O.mode[i] % 10; return m === 2 || m === 4; });
  const headLaunch = min(pick(A.headDist, launchIdx)), handLaunch = min(pick(A.handDist, launchIdx));
  const headFlight = min(pick(A.headDist, fly.filter((i) => O.mode[i] % 10 === 3 || O.mode[i] % 10 === 5)));
  // tether clearance judged while skiing (where an arm/pole/ski can catch the line); standstill minimum reported separately
  const cIdx = skiIdx.length ? skiIdx : idx;
  const cBody = min(pick(A.clearBody, cIdx)), cSki = min(pick(A.clearSki, cIdx)), cPole = min(pick(A.clearPole, cIdx));
  const cStop = min(pick(A.clearBody, idx.filter((i) => !skiing[i])));
  const sw = pick(A.sweep, idx);
  const snowPct = 100 * fraction(idx.length, (k) => O.snow[idx[k]] > 0);
  // KE that can strike others: ground frame beyond 1.5 m of the rider, rider frame within
  let keMax = 0; for (const i of fly) { const ke = A.headDist[i] + 0.24 > 1.5 ? A.keSnow[i] : A.keRel[i]; if (ke > keMax) keMax = ke; }
  // power and electrical safety
  const pTow = fly.filter((i) => O.mode[i] % 10 === 3 && O.reelMode[i] < 3);
  const Pd = meanOf(pick(O.Pdrone, pTow)), Pl = meanOf(pick(O.Ploss, pTow)), Pp = meanOf(pick(O.Ppack, pTow));
  const endurance = Number.isFinite(Pp) ? (p.packWh * 0.75 * 0.9 * 60) / Pp : NaN; // −10 °C 75 %, 10 % reserve
  const hov = rotorPower(p.mass * 9.81, [0, 0, 1], [0, 0, 0], p) + 6;
  const Lnom = meanOf(pick(O.L, pTow));
  const e24 = tetherElectrical(hov / 0.92, 24, Lnom || p.Lst, p);
  const design = ({ ...params, ...(sc.over || {}) }.design | 0) || 3;
  const massSum = Object.values(MASS[design]).reduce((a, b) => a + b, 0);
  const touchT = core.dock.touchT, lift = core.events.find((e) => e.type === 'liftoff');
  const lastRetry = [...core.events].reverse().find((e) => e.type === 'redock');
  const dockFailed = isDock && !Number.isFinite(touchT);
  // a failed dock falls back to landing beside the rider and a manual pick-up (ASSUMED 20 s)
  const setupMeas = isDock && lift ? (lift.t - 2 + 4.5) + (Number.isFinite(touchT) ? touchT - 16 + 1 : (lastRetry ? lastRetry.t : sc.dur) - 16 + 20) : NaN;
  const lostDrone = core.events.some((e) => e.type === 'cut' || e.type === 'weaklink' || e.type === 'landed');

  addStd(R, 'avail', noSki ? 'n/a' : availRaw * 100, { zh: '原始画面，不计算法去绳', en: 'raw footage, no line-removal credit' });
  addStd(R, 'pxMed', nb(pxMed));
  addStd(R, 'jitterRms', nb(jitter));
  addStd(R, 'azRange', nb(azRange));
  addStd(R, 'addedMass', massSum);
  addStd(R, 'bodyForcePeak', F50);
  addStd(R, 'handsBusy', 0, { zh: '起降按键在停稳时', en: 'launch/land taps happen while stopped' });
  addStd(R, 'setupTime', isDock ? nb(setupMeas) : SETUP_SWEEP[design], isDock ? (dockFailed ? { zh: '对接失败→雪面降落+手动取回 20 s（假设）', en: 'dock failed → land on snow + manual pick-up 20 s (ASSUMED)' } : null) : { zh: '取 dock(3 m/s) 与 dock_wind(9 m/s) 实测的较大值', en: 'worse of the measured dock (3 m/s) and dock_wind (9 m/s) runs' });
  addStd(R, 'ops', (lostDrone && /snag|power/.test(sc.id)) || dockFailed ? 3 : 2, lostDrone && /snag|power/.test(sc.id) ? { zh: '含找回落地无人机', en: 'incl. retrieving the landed drone' } : null);
  addStd(R, 'keMax', nb(keMax));
  addStd(R, 'endurance', nb(endurance));
  // concept-specific (gates and diagnostics)
  const PROT = { 0: 0.1, 1: p.mastH + 0.1, 2: 0.47, 3: 0.17, 4: 0.8, 5: 0.1 }; // m beyond the body/pack envelope while skiing
  M('protrusion', '滑行时伸出身体/背包外的硬件长度（挂碰点）', 'Hardware protruding beyond body/pack while skiing (catch point)', PROT[p.exit | 0], 'm', PROT[p.exit | 0] <= 0.15, '≤0.15 m（假设）', '≤0.15 m (ASSUMED)');
  M('elecSafe', '母线电压（触摸安全 ES1）', 'Bus voltage (touch-safe ES1)', p.Vbus, 'V', p.Vbus <= 60, '≤60 V DC（IEC 62368-1）', '≤60 V DC (IEC 62368-1)');
  M('artFrames', '主体上有≥1 px 绳/杆伪影的帧（滑行+拍摄）', 'Frames with a ≥1 px tether/boom artefact over the subject (skiing+filming)', nb(artFrames * 100), '%', null);
  M('availGeom', '几何可用率（不计伪影，仅参考）', 'Geometric availability (artefacts ignored, reference only)', noSki ? 'n/a' : availGeom * 100, '%', null);
  M('availInpaint', '计算去绳后可用率（已知几何细线修补，≤9 px；计算性，非原始画面）', 'Avail with known-geometry line removal (≤9 px; COMPUTATIONAL, not raw footage)', noSki ? 'n/a' : availInp * 100, '%', null);
  M('bodyForceRaw', '出绳点瞬时拉力峰值', 'Peak instantaneous exit force', nb(Fraw), 'N', null);
  M('jerk', '0.2 s 内拉力最大变化', 'Max force change within 0.2 s', jerk, 'N', jerk <= 5, '≤5 N（假设）', '≤5 N (ASSUMED)');
  M('headLaunch', '起降时桨护圈到头盔最小距离', 'Min rotor-guard-to-helmet distance in launch/land', nb(headLaunch), 'm', Number.isFinite(headLaunch) ? headLaunch >= 0.8 : null, '≥0.8 m', '≥0.8 m');
  M('handLaunch', '起降时桨护圈到手套最小距离', 'Min rotor-guard-to-glove distance in launch/land', nb(handLaunch), 'm', Number.isFinite(handLaunch) ? handLaunch >= 0.3 : null, '≥0.3 m（假设）', '≥0.3 m (ASSUMED)');
  M('headMin', '飞行中桨护圈到头盔最小距离', 'Min rotor-guard-to-helmet distance in flight', nb(headFlight), 'm', Number.isFinite(headFlight) ? headFlight >= 1.0 : null, '≥1.0 m', '≥1.0 m');
  M('clearBody', '系留绳到身体最小间隙', 'Min tether-to-body clearance', nb(cBody), 'm', Number.isFinite(cBody) ? cBody >= 0.3 : null, '≥0.3 m', '≥0.3 m');
  M('clearPole', '系留绳到雪杖最小间隙', 'Min tether-to-pole clearance', nb(cPole), 'm', Number.isFinite(cPole) ? cPole >= 0.2 : null, '≥0.2 m', '≥0.2 m');
  M('clearSki', '系留绳到雪板最小间隙', 'Min tether-to-ski clearance', nb(cSki), 'm', Number.isFinite(cSki) ? cSki >= 0.2 : null, '≥0.2 m', '≥0.2 m');
  M('clearStop', '停稳时系留绳到身体最小间隙（参考）', 'Min tether-to-body clearance while stopped (info)', nb(cStop), 'm', null);
  M('sweepP95', '系留绳扫掠角 |p95|', 'Tether sweep |p95|', nb(pct(sw.map(Math.abs), 0.95)), '°', null);
  M('snowContact', '系留绳触雪时间', 'Tether touching snow', snowPct, '%', null);
  M('pDrone', '机上平均电功率（跟随）', 'Mean drone electrical power (following)', nb(Pd), 'W', null);
  M('pHover', '悬停电功率（含航电）', 'Hover electrical power (incl. avionics)', hov, 'W', null);
  M('lossPct', `系留线损（${p.Vbus} V）`, `Tether I²R loss (${p.Vbus} V)`, Number.isFinite(Pl) && Pd ? (100 * Pl) / (Pd / 0.92) : 'n/a', '%', null, null);
  M('p24max', '24 V 可送达最大功率 V²/4R（反事实）', '24 V max deliverable power V²/4R (counterfactual)', e24.Pmax, 'W', null);
  if (prep.input.plan.branch) {
    const bm = min(pick(A.branchDist, idx));
    M('branchMin', '护圈到树枝最小距离', 'Min guard-to-branch distance', nb(bm), 'm', Number.isFinite(bm) ? bm >= 0.3 : null, '≥0.3 m', '≥0.3 m');
    const unhooked = core.events.some((e) => e.type === 'unhooked'), wl = core.events.some((e) => e.type === 'weaklink' || e.type === 'release');
    const left = unhooked && !wl ? { zh: '无（绳收回；无人机降落在障碍附近待找回）', en: 'nothing (line retracted; drone landed near the obstacle for pick-up)' }
      : wl ? { zh: `系留绳（约 ${O.L[n - 1].toFixed(0)} m）挂在树上并连着无人机`, en: `the tether (~${O.L[n - 1].toFixed(0)} m) hanging in the tree, still tied to the drone` } : { zh: '仍挂住', en: 'still snagged' };
    R.metric('leftOnObstacle', '留在障碍物上的东西', 'Left on the obstacle', left.en, '', unhooked && !wl, { zh: '无', en: 'nothing' });
    R.metrics[R.metrics.length - 1].value = left.en; R.metrics[R.metrics.length - 1].zh = '留在障碍物上的东西：' + left.zh;
  }
  if (isDock) {
    M('dockErr', '入座水平误差', 'Docking horizontal error', Number.isFinite(core.dock.touchErr) ? core.dock.touchErr * 100 : 'n/a', 'cm', Number.isFinite(core.dock.touchErr) ? core.dock.touchErr <= 0.1 : false, '≤10 cm（锥形托架捕获，假设）', '≤10 cm (cone cradle capture, ASSUMED)');
    M('dockRetries', '复飞次数', 'Go-arounds', core.dock.retries, '', core.dock.retries <= 1, '≤1', '≤1');
  }
  if (core.events.some((e) => e.type === 'landed' || e.type === 'crash')) {
    const l = core.events.find((e) => e.type === 'landed' || e.type === 'crash');
    M('backupLeft', '着陆时备用电量剩余', 'Backup energy left at touchdown', 100 * O.Eb[Math.min(n - 1, Math.round(l.t / 0.02))], '%', l.type === 'landed', '>0（着陆而非坠落）', '>0 (landed, not dropped)');
  }
  // faults (snag, power loss) are judged on safety only (audit aggregation rule); other metrics are reported, not judged
  if (sc.fault) {
    const SAFE = ['bodyForcePeak', 'keMax', 'headMin', 'branchMin', 'leftOnObstacle', 'backupLeft', 'elecSafe'];
    for (const m of R.metrics) if (!SAFE.includes(m.id) && m.pass != null) { m.pass = null; m.criterion = m.criterion ? { zh: m.criterion.zh + '（故障工况不判）', en: m.criterion.en + ' (fault scenario: not judged)' } : null; }
  }
  void stats; void design;

  // ---- plots
  R.plots.push({ key: 'force', zh: '背部受力（挂点张力）与卷轴', en: 'Force on the back (anchor tension) and reel', series: [['tension', 'N', '张力（20 ms）', 'Tension (20 ms)'], ['tensLat', 'N', '侧向分量', 'Lateral comp.'], ['reelL', 'm', '放线长度', 'Line out'], ['reelRate', 'm/s', '收放速度', 'Reel rate']] });
  R.plots.push({ key: 'prox', zh: '安全距离', en: 'Safety distances', series: [['headDist', 'm', '桨护圈-头盔', 'Rotor guard–helmet'], ['handDist', 'm', '桨护圈-手套', 'Rotor guard–glove'], ['clearBody', 'm', '绳-身体', 'Tether–body'], ['clearPole', 'm', '绳-雪杖', 'Tether–pole']] });
  R.plots.push({ key: 'sweep', zh: '系留绳扫掠与机体', en: 'Tether sweep and airframe', series: [['sweep', '°', '扫掠角', 'Sweep angle'], ['tilt', '°', '机体倾角', 'Drone tilt'], ['droneSpeed', 'm/s', '机体速度', 'Drone speed'], ['speed', 'm/s', '滑雪者速度', 'Rider speed']] });
  R.plots.push({ key: 'power', zh: '功率（系留供电）', en: 'Power (tether feed)', series: [['pDrone', 'W', '机上电功率', 'Drone electrical'], ['pLoss', 'W', '线损（母线电压）', 'Loss (bus voltage)'], ['pLoss48', 'W', '线损 48 V', 'Loss 48 V'], ['pMax24', 'W', '24 V 可送达上限', '24 V deliverable max']] });
  R.plots.push({ key: 'frame', zh: '画面', en: 'Footage', series: [['subjectPx', 'px', '人物像高', 'Subject px'], ['tetherArt', 'px', '主体上≥1 px 伪影长度', '≥1 px artefact over subject'], ['azView', '°', '视角方位', 'View azimuth']] });
  if (sc.id === 'fall' || sc.id === 'power' || sc.id === 'snag') R.plots.push({ key: 'ke', zh: '动能与备用电量', en: 'Kinetic energy and backup energy', series: [['keRel', 'J', '相对滑雪者动能', 'KE rel. rider'], ['keSnow', 'J', '对地动能', 'KE vs snow'], ['backupLeft', '—', '备用电量比例', 'Backup fraction']] });

  // ---- validity
  if (sc.hardFall) {
    R.validUntil = sc.hardFall.t + 2.5;
    R.event(R.validUntil, 'scope', 'invalid', '此后滑雪者倒地/翻滚姿态未建模（身体仍按直立蹲姿计算），绳-身体间隙不可信', 'Beyond this the rider’s tumbling/lying pose is not modelled (body still upright-crouched); tether–body clearance not credible');
  }
  if (prep.input.plan.branch) {
    const k = idx.find((i) => A.branchDist[i] < 0.05);
    if (k != null) {
      R.event(k * 0.02, 'branchhit', 'invalid', '无人机（护圈）触碰树枝：碰撞未建模，此后结果无效', 'Drone (guard) touches the branch: collision not modelled, results invalid beyond this');
      R.validUntil = R.validUntil == null ? k * 0.02 : Math.min(R.validUntil, k * 0.02);
    }
  }
  const crash = core.events.find((e) => e.type === 'crash' || e.type === 'drop');
  if (crash && (R.validUntil == null || crash.t < R.validUntil)) R.validUntil = crash.t;
  R.events.sort((a, b) => a.t - b.t);

  // ---- frames
  const NN = core.NN;
  const lerp = (a, b, w) => a + (b - a) * w;
  R.frame = (t) => {
    const f = Math.max(0, Math.min(n - 1, t / 0.02));
    const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), w = f - i0;
    const L = (k) => lerp(O[k][i0], O[k][i1], w);
    const s = core.rider(t);
    const md = O.mode[i0] % 10, landed = O.mode[i0] >= 10;
    const nodes = [];
    for (let j = 0; j < NN; j++) { const a = (i0 * NN + j) * 3, b = (i1 * NN + j) * 3; nodes.push([lerp(core.nodes[a], core.nodes[b], w), lerp(core.nodes[a + 1], core.nodes[b + 1], w), lerp(core.nodes[a + 2], core.nodes[b + 2], w)]); }
    const drone = [L('dx'), L('dy'), L('dz')];
    const brokenNow = O.reelMode[i0] === 3;
    const warn = brokenNow || core.events.some((e) => (e.severity !== 'info') && e.t <= t && e.t > t - 3);
    const dev = {
      drone, up: [L('ux'), L('uy'), L('uz')], yaw: [L('yx'), L('yy'), 0], rotor: L('rotor'), dome: L('dome'),
      docked: md === 0 || md === 1, landed, anchor: [L('ax'), L('ay'), L('az')], nodes, tetherOn: true, broken: brokenNow,
      L: L('L'), tension: L('T0'), reelRate: L('Ld'), mode: md, warn, backup: L('Eb') < 1,
      course: [L('cx'), L('cy'), 0], branch: prep.input.plan.branch ? { ...prep.input.plan.branch, z: -prep.input.plan.branch.x * core.tanS + prep.input.plan.branch.h } : null,
      exit: p.exit | 0, mext: L('mext'), attR: L('attR'), aphi: L('aphi'), mastH: p.mastH, mastBack: p.mastBack, small: p.mass < 0.16, scale: Math.max(0.6, Math.min(1, Math.cbrt(p.mass / 0.2))), cut: O.cut[i0] > 0, tetherD: p.dT / 1000, attachOff: p.attachOff,
      gimbal: Number.isFinite(A.gfx[i0]) ? [A.gfx[i0], A.gfy[i0], A.gfz[i0]] : null, cam: Number.isFinite(A.cpx[i0]) ? [A.cpx[i0], A.cpy[i0], A.cpz[i0]] : null,
    };
    const flying = A.flying[i0] === 1 && dev.cam;
    const skier = { ...s, pack: 'plain' };
    if (demo && sc.handTaps) for (const [ta, tb] of sc.handTaps) {
      if (t > ta && t < tb) { const b = bodyPoints(s); const u = Math.sin(Math.PI * (t - ta) / (tb - ta)); skier.handL = [b.chest[0] + s.heading[0] * 0.12 + b.left[0] * 0.1, b.chest[1] + s.heading[1] * 0.12 + b.left[1] * 0.1, b.chest[2] + 0.12]; skier.reachL = u; }
    }
    const labels = demo ? [] : [
      { p: [dev.anchor[0], dev.anchor[1], dev.anchor[2] + 0.35], text: `${dev.tension.toFixed(1)} N`, color: dev.tension > 10 ? '#ff6a5a' : '#ffd27a' },
      { p: [drone[0], drone[1], drone[2] + 0.3], text: `${dev.L.toFixed(1)} m`, color: '#9cc8ff' },
    ];
    return {
      t, tanS: sk.tanS, skier, device: dev, labels,
      productCam: flying ? { pos: dev.cam, fwd: dev.gimbal, up: [0, 0, 1], vfovDeg: Number.isFinite(A.vfov[i0]) ? A.vfov[i0] : VFOV_FULL, label: 'S3 系留无人机 4K / tether-drone 4K' } : null,
    };
  };
  R.core = core;
  return R;
}

function simulate(params, scenario) {
  const sc = scenario || SCEN[0];
  return buildResult(params, sc, prepare(params, sc));
}

// --------------------------------------------------------------- demo
const DEMO_T = 58;
const STAGES = [
  { key: 'carry', t0: 0, t1: 3, zh: '滑雪者站立；背包伸缩桅杆已伸出（停稳时），75 g 无人机停在桅杆顶托杯里，桨离头盔约 1 m。按下肩带按钮。', en: 'The rider stands; the telescopic pack mast is up (only while stopped) and the 75 g drone sits in its top cup, rotors ≈1 m from the helmet. A tap on the strap button.', title: { zh: '待机（v3）', en: 'Docked (v3)' }, pending: false },
  { key: 'launch', t0: 3, t1: 10, zh: '向后（并顺风）飞离后爬升，挂点臂展开到 0.3 m；到达机位后桅杆收回，出绳点回到背包顶。桅杆与托杯为示意，待实物验证。', en: 'It backs away (downwind) and climbs, the eyelet arm swings out to 0.3 m; once on station the mast retracts and the line exits at the pack top. Mast and cup are illustrative, pending hardware.', title: { zh: '起飞放线', en: 'Launch & pay-out' }, pending: true },
  { key: 'follow', t0: 10, t1: 24, zh: '蹬出并连续大弯：右后上方机位，挂点在机体左侧——内嵌窗中绳不压人物，身上没有伸出的杆。', en: 'Push-off and carved turns: rear-right station, eyelet on the drone’s left — the line stays off the rider in the inset and nothing sticks out from the body.', title: { zh: '跟拍', en: 'Follow' }, pending: false },
  { key: 'gust', t0: 24, t1: 30, zh: '7 m/s 侧向阵风：风估计前馈让 75 g 机体保持机位。', en: 'A 7 m/s side gust: wind-estimate feed-forward keeps the 75 g airframe on station.', title: { zh: '阵风', en: 'Gust' }, pending: false },
  { key: 'side', t0: 30, t1: 38, zh: '高光：机位从右后方经滑雪者身后跨到左侧 +65°，挂点滑车同时换到右侧，绳仍不压人物。', en: 'Highlight: the station hops from rear-right across behind the rider to the left, +65°, while the eyelet trolley swaps to the right — the line still stays off the rider.', title: { zh: '跨侧侧拍', en: 'Cross-over side view' }, pending: false },
  { key: 'rear', t0: 38, t1: 43, zh: '回到右后方机位继续转弯。', en: 'Back to the rear-right station through more turns.', title: { zh: '回到后方', en: 'Back to rear' }, pending: false },
  { key: 'stop', t0: 43, t1: 49, zh: '刹停；按键后桅杆伸出，挂点臂收回，无人机飞到桅杆后上方进近点，卷轴收线。', en: 'Hockey stop; a tap raises the mast, folds the eyelet arm and brings the drone to the approach point behind and above the mast while the reel retracts.', title: { zh: '停下回收', en: 'Stop & recall' }, pending: false },
  { key: 'land', t0: 49, t1: DEMO_T, zh: '卷轴以约 1 N 引导下降，挂点落入托杯并锁定；桅杆收回。对接可靠性待实物测试。', en: 'The reel guides the descent at ≈1 N, the eyelet seats in the cup and latches; the mast retracts. Docking reliability pending physical tests.', title: { zh: '入座', en: 'Dock' }, pending: true },
];

function buildDemo(params) {
  const tGo = 10;
  const sk = simulateSkier({ start: 'push', duration: DEMO_T - tGo + 1, stopAt: 33, seed: 2 });
  const offset = (t) => {
    const w = smooth((t - 30) / 2.2) * (1 - smooth((t - 36) / 2.2));
    return { az: -30 + 95 * w, elev: 40 - 12 * w, Lst: 6 - 1 * w };
  };
  const sc = { id: 'demo', dur: DEMO_T, handTaps: [[1.6, 2.9], [45.8, 47.0]] };
  const input = { duration: DEMO_T, skier: sk, tGo, seed: 5,
    wind: { mean: [0, 1.5, 0], intensity: 0.2, Lu: 30, seed: 4, gustAt: 24, gust: [0, 7, 0], gustRise: 1.0, gustHold: 2.5 },
    plan: { start: 'docked', launchAt: 3, landAt: 46.8, offset } };
  const R = buildResult(params, sc, { sk, input }, { demo: true, settle: 0 });
  R.scenarioId = 'demo';
  return R;
}

export default {
  id: 'tetherdrone', family: 'aerial',
  name: { zh: 'S3 系留无人机（飞行自拍杆）v3', en: 'S3 Tether-drone ("flying boom") v3' },
  tagline: { zh: 'v3：75 g、56 V 系留、停稳时伸出的背包桅杆起降、换侧挂点、机端切绳', en: 'v3: 75 g quad, 56 V tether, telescopic pack mast for launch/land only, side-swapping eyelet, drone-end cutter' },
  about: { zh: 'v2 改进方案：背包 60 Wh 电池经 56 V（≤60 V 触摸安全）、1.5 mm 双 0.09 mm² 导线系留给 120 g 无主电池四旋翼供电（机上仅 15 s 备用电芯）。系留绳从左髋 0.8 m 后伸臂末端引出，无人机也在该处起降（桨离头盔约 1 m）；机位在右后上方，使绳不压画面中的人物；挂绳时机端切绳器 60 ms 内剪断，自由端滑脱、卷轴收线，无人机避开挂点自主降落。design=1 复现 v1（200 g、100 V、背包罩出绳）。', en: 'v2 redesign: a 60 Wh pack battery feeds a 120 g quad with no main battery (15 s backup cell only) over a 56 V (≤60 V touch-safe), 1.5 mm tether with 2× 0.09 mm² conductors. The line leaves from the tip of a 0.8 m rear-left hip boom, which is also the dock (rotors ≈1 m from the helmet); the station is rear-right and high so the line stays off the rider in the image; on a snag a drone-end cutter fires within 60 ms, the free end slides off and the reel retracts while the drone escapes and lands on its own. design = 1 reproduces v1 (200 g, 100 V, pack-dome exit).' },
  modelVersion: MV,
  modelLimits: [
    { zh: `系留绳为 ${NSEG + 1} 节点集中质量链：无弯曲/扭转刚度，有效轴向刚度 EA=2 kN（假设，低于 Dyneema 芯，冲击峰值可能被低估）；放线按段等比例伸长`, en: `Tether is a ${NSEG + 1}-node lumped-mass chain: no bending/torsion, effective EA = 2 kN (ASSUMED, below a Dyneema core, so snatch peaks may be under-estimated); payout stretches segments proportionally` },
    { zh: '无人机为质点+一阶姿态/推力滞后，不含桨叶动力学、地面效应、尾流打在头盔上的影响和避障', en: 'Drone is a point mass with first-order attitude/thrust lag; no blade dynamics, ground effect, downwash on the helmet, or obstacle avoidance' },
    { zh: '滑雪者姿态由共享运动学给出；摔倒时的翻滚/倒地姿态未建模（局部替换为 12 m/s² 急停）；绳缠绕身体无法评估', en: 'Rider pose comes from the shared kinematics; tumbling/lying after a fall is not modelled (locally replaced by a 12 m/s² stop), so tether wrap cannot be assessed' },
    { zh: '树枝挂绳按“节点被钉住”处理；其他滑雪者、缆车、标志绳未建模', en: 'Branch snag = node pinned; other skiers, lift lines and rope barriers not modelled' },
    { zh: '画面只算几何（剪影胶囊体、绳像宽），不含曝光、景深、压缩；可见阈值 0.5 px 为假设', en: 'Footage is geometric only (capsule silhouette, tether pixel width); no exposure, depth of field or compression; 0.5 px visibility threshold ASSUMED' },
    { zh: '髋部后伸臂（0.8 m）是新的挂碰/勾住他人与树枝的风险点，其载荷、折叠与摔倒时受力未建模', en: 'The 0.8 m hip boom is a new snag/clothesline point for trees and other skiers; its loads, folding and fall loads are not modelled' },
    { zh: '挂绳后自由端“滑脱”为理想化（无二次缠绕）；切绳器触发时间为假设', en: 'The cut free end is assumed to slide off the branch (no re-wrap); cutter timing is ASSUMED' },
    { zh: '去绳（已知几何细线修补）只作为计算性说明，不计入原始画面可用率', en: 'Known-geometry line removal is reported only as a computational credit, never as raw footage' },
    { zh: '罩盖、锁扣与对接机构为示意；法规（目视、雪场禁飞）未纳入数值模型', en: 'Dome, latch and docking hardware are illustrative; regulations (VLOS, resort bans) are outside the numerical model' },
  ],
  params: PARAMS,
  scenarios: SCEN,
  simulate,
  demo: { duration: DEMO_T, stages: STAGES, build: buildDemo },
  gear: () => import('./gear.js'),
};
