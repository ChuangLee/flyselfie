// towglider (SIM-031, from inventor I-05 "aerotow camera"), round 4 after audit3 (2026-10-20):
// a 132 g folding-wing camera glider follows on slope gravity on a powered 0.6 mm conductive leash
// (2 × 7/44 AWG Cu litz, 48 V; no lithium cell on the glider) from a reel on the belt. Round 4:
// the leash leaves through a 0.35 m glass-fibre line-guide wand on the holster mouth (exit ≥1.36 m
// from the helmet, so the LINE itself clears the head), reel minimum tension 0.8 N (less sag/trip
// line), a reel KE governor (the drum never pulls a glider faster than 0.95 × the KE-governor
// speed: no snow-pull whip), rest-stop pre-emptive stow when the wind estimate nears the gate,
// tailwind gate 3.0 m/s on the shared windEstimate (worst-case ±1 m/s bias ⇒ ≤4 m/s true tail),
// zoom-assisted KE governor in flight, 50° M12 lens framed on the body (bodyPx rule) and a
// physical 3-servo mount + gyro-EIS residual model (dead band, backlash, slew, PWM frame, sync,
// rolling shutter, scale error). Physics: model.js; attitude/servo/EIS: attitude.js; camera/
// footage/clearance/trip profile: analysis.js; mass/power/pack: design.js. Numerical-uncalibrated
// simulation; the demo is an illustration driven by the same physics.
import { simulateSkier, skierAt, bodyPoints, SKIER_PRESETS } from '../common/skier.js';
import { simulateRun, FULLRUN_CASES, FULLRUN_CASES_R4, artefactCounts, pct as pctE } from '../common/fullrun.js';
import { makeResult } from '../common/result.js';
import { addStd, jitterHP, CRITERIA, footageStability } from '../common/criteria.js';
import { BATTERY } from '../common/components.js';
import { runCore, applyHardFall, PDEF, vStall, liftDrag, linePoints } from './model.js';
import { analyse, leashAt, MODES, CAMS, SPAN_WING, optics } from './analysis.js';
import { gliderBudget, powerChain, WORN, HIP, LINE, packVolume } from './design.js';
import { ENSEMBLE } from './ensemble.js';

const MV = 'towglider@0.5.0';
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const CAM_BUDGET = { 0: 'fixEIS', 1: 'fixEIS', 2: 'gimbal', 3: 'panEIS', 4: 'fixEIS', 5: 'fix48', 6: 'panRect' };

const PARAMS = [
  { id: 'design', zh: '设计版本（1=I-05 原方案，2=第一轮 95 g 方案，3=第三轮：按下列参数）', en: 'Design (1 = I-05 original, 2 = round-1 95 g design, 3 = round 3 as listed below)', unit: '', v: 3, min: 1, max: 3, step: 1, src: 'ASSUMED' },
  { id: 'cam', zh: '相机（0 固定 90°，1 固定 120°，2 两轴云台 60°，3 第二轮：只指向三舵机座+90° 鱼眼 EIS，4 固定鱼眼 150° EIS，5 48MP 固定鱼眼，6 第三轮：4K 4:3 + M12 窄角镜头 + 闭环稳定三舵机座）', en: 'Camera (0 fixed 90°, 1 fixed 120°, 2 2-axis gimbal 60°, 3 round 2: pointing-only 3-servo mount + 90° fisheye EIS, 4 fixed 150° fisheye EIS, 5 48 MP fixed fisheye, 6 round 3: 4K 4:3 + narrow M12 lens on a closed-loop stabilised 3-servo mount)', unit: '', v: 6, min: 0, max: 6, step: 1, src: 'ASSUMED' },
  { id: 'lensHfov', zh: '窄角 M12 直线镜头水平视场（相机 6）', en: 'Narrow M12 rectilinear lens horizontal FOV (camera 6)', unit: '°', v: 50, min: 40, max: 100, step: 1, src: 'ASSUMED', note: 'round 4: 50° (≈6.9 mm M12 on the 1/2" IMX586) instead of 66° — avail is now judged on bodyPx (no ski tips), which is resolution-limited at 66°; custom lens swap, 4K 4:3 (3840×2880) at 30 fps' },
  { id: 'cropFill', zh: '自动变焦：主体占半幅比例上限（cropFillBody=0 时）', en: 'Auto-zoom: subject extent as a share of the half-frame (when cropFillBody = 0)', unit: '—', v: 0.8, min: 0.4, max: 0.95, step: 0.05, src: 'ASSUMED' },
  { id: 'cropFillBody', zh: '自动变焦（第四轮）：身体（脚→头/肩）占半幅比例', en: 'Auto-zoom (round 4): body (feet→head/shoulders) extent as a share of the half-frame', unit: '—', v: 0.65, min: 0, max: 0.9, step: 0.05, src: 'ASSUMED' },
  { id: 'cropFillAll', zh: '自动变焦（第四轮）：含雪板的整个主体不超出半幅的比例', en: 'Auto-zoom (round 4): whole subject incl. skis kept within this share of the half-frame', unit: '—', v: 0.93, min: 0.7, max: 0.98, step: 0.01, src: 'ASSUMED' },
  { id: 'cropCentre', zh: '重构图对准主体包围盒中心（0.25 Hz 平滑偏移）', en: 'Reframe aims at the subject bounding-box centre (offset smoothed at 0.25 Hz)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'mountModel', zh: '稳定座/电子稳像模型（1 第四轮：舵机死区/齿隙/限速/PWM + 同步/卷帘/标定残差；0 第三轮理想化，仅灵敏度）', en: 'Mount/EIS model (1 round 4: servo dead band/backlash/slew/PWM + sync/RS/calibration residual; 0 round-3 idealised, sensitivity only)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'reframe', zh: '事后重构图（0 实时 3 Hz 跟踪；1 跑后零相位 2 Hz 平滑）', en: 'Post reframing (0 live 3 Hz tracker; 1 zero-phase 2 Hz after the run)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'filmH', zh: '起飞时开始计入画面的离雪高度', en: 'Launch height from which footage counts', unit: 'm', v: 0.8, min: 0.3, max: 2, step: 0.1, src: 'ASSUMED' },
  { id: 'massAuto', zh: '质量按共享部件表自动计算（含 15 % 余量）', en: 'Mass from the shared component table (+15 % margin)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'CALC', note: 'design.js gliderBudget(): panRect at S 0.075 = 115 g → 132.3 g' },
  { id: 'mass', zh: '滑翔机质量（massAuto=0 时使用）', en: 'Glider mass (used when massAuto = 0)', unit: 'kg', v: 0.1323, min: 0.06, max: 0.2, step: 0.005, src: 'CALC' },
  { id: 'S', zh: '翼面积', en: 'Wing area', unit: 'm²', v: 0.075, min: 0.03, max: 0.12, step: 0.001, src: 'ASSUMED', note: 'Vs ≈6.3 m/s clean at 132 g with CLmax(Re) 0.85–1.0' },
  { id: 'AR', zh: '展弦比', en: 'Aspect ratio', unit: '—', v: 8, min: 4, max: 12, step: 0.5, src: 'ASSUMED', note: 'span 0.78 m, chord 97 mm; panels pivot aft and fold at 55 % chord → 80 mm OD holster' },
  { id: 'cd0', zh: '零升阻力系数（Re 6 万时，含吊舱/铰缝）', en: 'Zero-lift drag coeff. at Re 60 k (incl. pod, hinges)', unit: '—', v: 0.051, min: 0.025, max: 0.08, step: 0.001, src: 'ASSUMED', note: '∝ (Re/60k)^−0.2 (audit TG-15); round 3 +0.003 for the sealed chord-fold hinge gap' },
  { id: 'CLmax', zh: '最大升力系数（Re≥8 万；Re 3 万时 ×0.85）', en: 'CLmax at Re ≥ 80 k (×0.85 at Re 30 k)', unit: '—', v: 1.0, min: 0.7, max: 1.3, step: 0.05, src: 'ASSUMED' },
  { id: 'flapDCL', zh: '分裂襟翼增升 ΔCLmax（全偏）', en: 'Split-flap ΔCLmax (full)', unit: '—', v: 0.35, min: 0, max: 0.8, step: 0.05, src: 'ASSUMED', note: 'full-scale split flaps 0.6–0.9; low-Re value assumed' },
  { id: 'ldFactor', zh: '升阻比系数（灵敏度：0.7 = 降 30 %）', en: 'L/D factor (sensitivity: 0.7 = −30 %)', unit: '—', v: 1, min: 0.5, max: 1.2, step: 0.05, src: 'ASSUMED' },
  { id: 'brakeCD', zh: '分裂襟翼减速板 ΔCD', en: 'Split-flap airbrake ΔCD', unit: '—', v: 0.2, min: 0.05, max: 0.4, step: 0.01, src: 'ASSUMED' },
  { id: 'Dback', zh: '机位后方距离（沿平滑滑行线）', en: 'Station distance behind (along smoothed course)', unit: 'm', v: 4.5, min: 3, max: 12, step: 0.5, src: 'ASSUMED' },
  { id: 'Hsnow', zh: '机位离雪高度', en: 'Station height above snow', unit: 'm', v: 2.7, min: 1.5, max: 7, step: 0.1, src: 'ASSUMED' },
  { id: 'stationTau', zh: '转弯中心线平滑时间常数（两级一阶，仅横向）', en: 'Turn-centreline smoothing time constant (2 cascaded 1st-order, lateral only)', unit: 's', v: 1.2, min: 0.5, max: 5, step: 0.1, src: 'ASSUMED' },
  { id: 'latK', zh: '机位横向跟随比例（相对中心线，同相、无滞后）', en: 'Station lateral gain (relative to the centreline, in phase, no lag)', unit: '—', v: 1, min: 0, max: 1, step: 0.05, src: 'ASSUMED', note: '0 = straight line through the turns, 1 = copy the hip (round 3: keeps the camera distance constant); ±5 m soft limit' },
  { id: 'dLine', zh: '导电牵绳外径（Dyneema 芯 + 两根铜合金箔丝 + 护套）', en: 'Conductive leash OD (Dyneema core + 2 Cu-alloy tinsel conductors + jacket)', unit: 'mm', v: 0.6, min: 0.1, max: 1, step: 0.01, src: 'CALC', note: '2 × 7/44 AWG Cu litz on a 0.17 mm UHMWPE core + PU jacket: 0.40 g/m, 1.3 Ω/m per conductor, 48 V (design.js LINE)' },
  { id: 'EA', zh: '牵绳轴向刚度 EA', en: 'Leash axial stiffness EA', unit: 'N', v: 1800, min: 300, max: 5000, step: 100, src: 'ASSUMED' },
  { id: 'Tmin', zh: '卷轴最小张力（控弓形；第四轮 0.8 N 减少绳下垂/绊绳）', en: 'Reel minimum tension (bow control; round 4: 0.8 N to cut leash sag / trip exposure)', unit: 'N', v: 0.8, min: 0.02, max: 1.5, step: 0.01, src: 'ASSUMED' },
  { id: 'TtowMax', zh: '最大拖曳张力', en: 'Max tow tension', unit: 'N', v: 2.0, min: 0.5, max: 3, step: 0.1, src: 'ASSUMED' },
  { id: 'Fclutch', zh: '卷轴滑动离合器（超过即自由放线）', en: 'Reel slip clutch (free pay-out above)', unit: 'N', v: 3.0, min: 1, max: 6, step: 0.1, src: 'ASSUMED', note: 'I-05: 3 N' },
  { id: 'hookRelease', zh: '机端拖钩释放拉力', en: 'Glider tow-hook release force', unit: 'N', v: 2.4, min: 1, max: 5, step: 0.1, src: 'ASSUMED', note: 'plus a 35° off-axis rule for snags/strikes' },
  { id: 'Tlaunch', zh: '绞盘起飞张力（离地 0.8 m 前）', en: 'Winch-launch tension (below 0.8 m)', unit: 'N', v: 1.8, min: 0.8, max: 3, step: 0.1, src: 'CALC' },
  { id: 'stopMode', zh: '停下处理（0 第一轮：转向落雪+拖回；2 第二轮：深失速落雪→停放→自动再起飞/收回）', en: 'Stop handling (0 round 1: turn-away landing + snow pull; 2 round 2: deep-stall drop → park → auto-relaunch / stow)', unit: '', v: 2, min: 0, max: 2, step: 2, src: 'ASSUMED' },
  { id: 'dockMode', zh: '缆车站收回（0 落雪+雪面拖回入套；1 滑行中沿绳绞回入套，未验证）', en: 'Lift-approach stow (0 drop + snow pull into the holster; 1 in-motion reel-in, unverified)', unit: '', v: 0, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'tailGate', zh: '顺风起飞门限（腰带估计的顺坡风分量，共享 windEstimate：10 s 均值、±1 m/s 偏差、0.5 s 滞后）', en: 'Tailwind launch gate (down-slope wind component estimated by the belt unit with the shared windEstimate: 10 s mean, ±1 m/s bias, 0.5 s lag)', unit: 'm/s', v: 3.0, min: 0, max: 12, step: 0.5, src: 'CALC', note: 'round 4: 3.0 (was 4.5) — with the shared ±1 m/s estimate bias a launched run can then see ≤4 m/s true tailwind, forced launches at 2.5–4 m/s true × 6 seeds: KE ≤13.1 J, headClear ≥1.0 m in 23/24 (0.89 m at 3.5 m/s seed 16); 4.5–6 m/s true: releases, cuts, KE up to 16.8 J, headClear down to 0.07 m. 0 = off. Evaluated at every push-off; a parked glider is pulled into the holster if the relaunch is refused' },
  { id: 'marginMin', zh: '空速裕度门限（滑雪者速度 − 估计顺风）', en: 'Airspeed-margin threshold (rider speed − estimated tailwind)', unit: 'm/s', v: 5.8, min: 0, max: 9, step: 0.1, src: 'CALC', note: '≈1.1 × flap-down stall speed; below it the winch launch waits, and in flight the glider drops and is pulled into the holster' },
  { id: 'shotPlan', zh: '镜头计划（0 正后方，1 后方→左后→右后）', en: 'Shot plan (0 behind only, 1 behind → rear-left → rear-right)', unit: '', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
];
// legacy presets (compare scenarios): round-1 physics switches + their hardware
const LEGACY = { filmPark: 0, Lpark: 3.0, fastAdapt: 0, windEst: 0, marginMin: 0, holster: 'hip', zoomStop: 0, reframe: 0, filmH: 1.5, Llaunch: 4.0, latK: 1, latMax: 99, alongTau: 0.02, courseTau: 4, Dback: 6.5, Hsnow: 3.5, stationTau: 1.4, camTilt: 20, reModel: 0, flapDCL: 0, tailGate: 0, stopMode: 0, keGov: 0.97, dLine: 0.17, muLine: 0.025, EA: 1500, Lmax: 25, Tmin: 0.12, Tlaunch: 1.6, camTilt: 20, massAuto: 0 };
const V1 = { mass: 0.125, S: 0.06, AR: 9, cd0: 0.035, cam: 0, stationTau: 0.4, Dback: 7, Hsnow: 4.5, Tmin: 0.02, shotPlan: 0 };
const R1 = { mass: 0.095, S: 0.055, AR: 8, cd0: 0.04, cam: 2, CLmax: 1.0 };
export function resolve(pr) {
  const d = pr.design | 0;
  if (d === 1) return { ...pr, ...LEGACY, ...V1 };
  if (d === 2) return { ...pr, ...LEGACY, ...R1 };
  const o = { ...pr };
  if (o.massAuto) o.mass = gliderBudget(CAM_BUDGET[o.cam | 0] || 'panEIS', o.S ?? PDEF.S).kg;
  return o;
}
const DEFAULTS = Object.fromEntries(PARAMS.map((q) => [q.id, q.v]));
const isDefault = (pr) => JSON.stringify(resolve({ ...DEFAULTS, ...pr })) === JSON.stringify(resolve(DEFAULTS));

// ------------------------------------------------------------------ scenarios
const TGO = 1.5; // the arm tap happens 1 s before push-off
const RUN_PLAN = [{ ride: 38, preset: 'recreationalCarve' }, { hold: 20 }, { ride: 33, preset: 'recreationalCarve' }, { hold: 30 }]; // shared FULLRUN_PLAN with the lift-approach hold extended 10 → 30 s so the stow completes in-sim (riding identical)
const caseWind = (c) => ({ mean: c.mean, intensity: c.intensity ?? 0.15, seed: c.seed });
export function fullrunScenario(c, over = {}) {
  return { id: `fullrun_${c.id}`, zh: `完整一趟（${c.id}）`, en: `Full run (${c.id})`, run: { plan: RUN_PLAN, seed: c.seed }, wind: caseWind(c), caseId: c.id, seed: c.seed,
    expect: { zh: '共享完整一趟：坡顶起飞→滑行→中途停下→再起飞→缆车站停下收回。', en: 'Shared full run: launch at the top → ride → rest stop → relaunch → ride → stow at the lift approach.' }, ...over };
}
const REP = FULLRUN_CASES.find((c) => c.id === 'crossR6_s12');
const W_LIGHT = { mean: [0, 2, 0], intensity: 0.2, Lu: 30, seed: 7 };
const SHORT_RUN = [{ ride: 16, preset: 'recreationalCarve' }, { hold: 14 }, { ride: 12, preset: 'recreationalCarve' }];
const STOW_RUN = [{ ride: 16, preset: 'recreationalCarve' }, { hold: 25 }];
const SCEN = [
  fullrunScenario(REP, { id: 'fullrun', zh: '完整一趟（代表工况 crossR6_s12；统一判据按 48 例集合（第四轮））', en: 'Full run (representative crossR6_s12; harmonised metrics judged on the 48-case round-4 ensemble)', ensemble: true,
    expect: { zh: '共享完整一趟：两次起飞、一次中途停下（深失速落雪→停放→自动再起飞）、缆车站停下收回。统一指标按 48 例集合（第四轮）判定（均值/p10/p90）。', en: 'Shared full run: two launches, a rest stop (deep-stall drop → park → auto-relaunch) and a stow at the lift approach. Harmonised metrics are judged on the 48-case round-4 ensemble (mean/p10/p90).' } }),
  { id: 'nominal', zh: '跟拍段：12 m/s 大弯，15°，微风（含镜头计划）', en: 'Follow segment: 12 m/s carving, 15°, light wind (with shot plan)', dur: 30, skier: { duration: 31 }, wind: W_LIGHT,
    expect: { zh: '空中跟拍段：重力滑翔+牵绳补拖曳；无≥1 px 绳伪影；动能≤14.9 J。完整一趟的判据见 fullrun。', en: 'Airborne follow only: gravity glide + leash tow; no ≥1 px line artefact; KE ≤14.9 J. Per-run criteria: see fullrun.' } },
  { id: 'nominal_r1', compare: true, zh: '跟拍段（第一轮 95 g 方案：12 g 云台，审计认为不存在）', en: 'Follow segment (round-1 95 g design with a 12 g gimbal the audit could not find)', dur: 30, skier: { duration: 31 }, wind: W_LIGHT, over: { design: 2 },
    expect: { zh: '第一轮方案对照（质量不可信）。', en: 'Round-1 design for comparison (mass not credible).' } },
  { id: 'nominal_v1', compare: true, zh: '跟拍段（I-05 原方案：125 g、固定相机）', en: 'Follow segment (I-05 original: 125 g, fixed camera)', dur: 30, skier: { duration: 31 }, wind: W_LIGHT, over: { design: 1 },
    expect: { zh: '原方案对照。', en: 'Original design for comparison.' } },
  { id: 'nominal_ld70', compare: true, zh: '灵敏度：升阻比 −30 %', en: 'Sensitivity: L/D −30 %', dur: 30, skier: { duration: 31 }, wind: W_LIGHT, over: { ldFactor: 0.7 },
    expect: { zh: '低雷诺数极曲线更差时牵绳要补多少拖曳。', en: 'How much tow the leash must add if the low-Re polar is 30 % worse.' } },
  { id: 'cam_gimbal', compare: true, zh: '相机变体：两轴无刷云台（137 g）', en: 'Camera variant: 2-axis brushless gimbal (137 g)', dur: 30, skier: { duration: 31 }, wind: { mean: [0, 6, 0], intensity: 0.2, seed: 12 }, over: { cam: 2 },
    expect: { zh: '同一阵风侧风下：云台 vs 鱼眼电子稳像的抖动、像素、质量。', en: 'Same gusty crosswind: gimbal vs fisheye EIS jitter, pixels, mass.' } },
  { id: 'cam_panEIS', compare: true, zh: '相机（第二轮）：只指向三舵机座 + 90° 鱼眼 EIS', en: 'Camera (round 2): pointing-only 3-servo mount + 90° fisheye EIS', dur: 30, skier: { duration: 31 }, wind: { mean: [0, 6, 0], intensity: 0.2, seed: 12 }, over: { cam: 3 },
    expect: { zh: '第二轮相机对照：鱼眼原生分辨率限制人物像素。', en: 'Round-2 camera for comparison: the fisheye’s native resolution limits subject pixels.' } },
  { id: 'cam_panRect', compare: true, zh: '相机（第三轮，选定）：4K 4:3 + 66° M12 镜头 + 闭环稳定三舵机座', en: 'Camera (round 3, chosen): 4K 4:3 + 66° M12 lens on the closed-loop stabilised 3-servo mount', dur: 30, skier: { duration: 31 }, wind: { mean: [0, 6, 0], intensity: 0.2, seed: 12 }, over: { cam: 6 },
    expect: { zh: '同一阵风侧风：与云台、鱼眼对照。', en: 'Same gusty crosswind: compare with the gimbal and the fisheye.' } },
  { id: 'cam_fixEIS', compare: true, zh: '相机变体：无云台 150° 固定鱼眼 EIS（115 g）', en: 'Camera variant: no gimbal, fixed 150° fisheye EIS (115 g)', dur: 30, skier: { duration: 31 }, wind: { mean: [0, 6, 0], intensity: 0.2, seed: 12 }, over: { cam: 4 },
    expect: { zh: '更广镜头无活动部件：像素是否够。', en: 'Wider lens, no moving parts: enough pixels?' } },
  { id: 'cam_fix48', compare: true, zh: '相机变体：48 MP 150° 固定鱼眼（假设部件）', en: 'Camera variant: 48 MP fixed 150° fisheye (ASSUMED part)', dur: 30, skier: { duration: 31 }, wind: { mean: [0, 6, 0], intensity: 0.2, seed: 12 }, over: { cam: 5 },
    expect: { zh: '更高分辨率传感器能否替代云台（部件未找到来源）。', en: 'Can a higher-resolution sensor replace the gimbal (no sourced part)?' } },
  { id: 'launch', zh: '静止起飞：布防→蹬出→雪面拖行→绞盘起飞', en: 'Launch from standstill: arm → push off → sled tow → winch launch', dur: 26, skier: { duration: 26, start: 'push' }, tGo: 2, wind: W_LIGHT, plan: { start: 'stowed', armAt: 0.6 },
    expect: { zh: '一次按键后自动起飞；报告到达机位用时与身体受力。', en: 'Automatic launch after one tap; time to station and body force.' } },
  { id: 'stop', zh: '中途停下（微风）：深失速落雪→停放 3 m→蹬出自动再起飞', en: 'Rest stop (light wind): deep-stall drop → park at 3 m → auto-relaunch at push-off', run: { plan: SHORT_RUN, seed: 4 }, wind: W_LIGHT, noFinal: true,
    expect: { zh: '滑翔机不能悬停：停下时在侧后方深失速落雪、折翼停放；再蹬出时自动起飞，无需操作、无需等待。', en: 'A glider cannot hover: it drops behind-beside, folds and parks; at the next push-off it relaunches with no action and no waiting.' } },
  { id: 'stop_wind', zh: '中途停下：9 m/s 阵风（斜侧逆风；第四轮顺风门限 3 m/s 下斜侧顺风 4 m/s 不再起飞）', en: 'Rest stop in 9 m/s gusty wind (quartering head/cross; round 4: with the 3 m/s gate a 4 m/s quartering tail no longer launches)', run: { plan: SHORT_RUN, seed: 4 }, wind: { mean: [-4, 8, 0], intensity: 0.3, Lu: 20, seed: 5 }, noFinal: true,
    expect: { zh: '第一轮在 9 m/s 中切绳 6/12：现为侧后方深失速，不再顺风飘出。', en: 'Round 1 fired the hip cutter in 6/12 seeds at 9 m/s; now a deep-stall drop instead of a downwind run.' } },
  { id: 'stow', stow: true, zh: '缆车站停下：深失速落雪→雪面拖回髋部枪套', en: 'Stop at the lift approach: deep-stall drop → snow pull into the hip holster', run: { plan: STOW_RUN, seed: 6 }, wind: W_LIGHT,
    expect: { zh: '统一判据基础：停稳→入套的站立时间。入套捕获本身未验证。', en: 'Basis of the harmonised standstill: rider still → seated. The capture itself is unverified.' } },
  { id: 'stow_wind', stow: true, zh: '缆车站停下：9 m/s 阵风侧风', en: 'Stop at the lift approach in 9 m/s gusty crosswind', run: { plan: STOW_RUN, seed: 6 }, wind: { mean: [0, 9, 0], intensity: 0.3, Lu: 20, seed: 5 },
    expect: { zh: '侧风下落雪位置与拖回时间。', en: 'Landing spot and pull-in time in crosswind.' } },
  { id: 'dock', stow: true, compare: true, zh: '缆车站收回变体：滑行中沿绳绞回（未验证）', en: 'Stow variant: in-motion reel-in into the funnel (unverified)', run: { plan: STOW_RUN, seed: 6, skier: { style: 'straight' } }, wind: W_LIGHT, over: { dockMode: 1 }, dockBefore: 6,
    expect: { zh: '尾流中入漏斗的可靠性未知（审计 TG-08），只作选项。', en: 'Capture in the wake is unknown (audit TG-08); option only.' } },
  { id: 'short', zh: '短弯（1.04 s/弯）', en: 'Short turns (1.04 s/turn)', dur: 25, skier: { duration: 26, ...SKIER_PRESETS.shortTurns }, wind: W_LIGHT,
    expect: { zh: '快速换刃：平滑路线、画面抖动、绳与雪杖间隙。', en: 'Fast edge changes: smoothed path, jitter, line–pole clearance.' } },
  { id: 'slow', zh: '慢速初学者 6 m/s（15°）', en: 'Slow beginner 6 m/s (15°)', dur: 25, skier: { duration: 26, vTarget: 6, v0: 6, turnPeriod: 3.4, turnAmpDeg: 50 }, wind: W_LIGHT,
    expect: { zh: '低于最低空速：S 形绕飞+襟翼增升（微风）。', en: 'Below the minimum airspeed: weave + flap high lift (light wind).' } },
  { id: 'slow_tail3', zh: '慢速初学者 7 m/s + 顺风 3 m/s（空速裕度门限）', en: 'Slow beginner 7 m/s in a 3 m/s tailwind (airspeed-margin rule)', dur: 25, skier: { duration: 26, vTarget: 7, v0: 7, turnPeriod: 3.4, turnAmpDeg: 50 }, wind: { mean: [3, 0, 0], intensity: 0.15, seed: 12 },
    expect: { zh: '第二轮：失速触雪、离头 0.78 m。现：估计空速裕度不足→落雪等待（雪面拖行），不拍但安全。', en: 'Round 2: stall, snow contact, 0.78 m from the helmet. Now: estimated airspeed margin too small → drop and wait on the snow (sled tow); no footage but safe.' } },
  { id: 'fast14', zh: '快速滑行 14 m/s（15°）', en: 'Fast rider 14 m/s (15°)', dur: 25, skier: { duration: 26, vTarget: 14, v0: 14, turnPeriod: 2.9, turnAmpDeg: 45 }, wind: W_LIGHT,
    expect: { zh: '接近动能限速（132 g 时 15.0 m/s，调速器 13.8 m/s）。', en: 'Near the KE-cap speed (15.0 m/s at 132 g, governor 13.8 m/s).' } },
  { id: 'expert', zh: '高手大弯 20°、13 m/s（共享预设）', en: 'Expert carve 20°, 13 m/s (shared preset)', dur: 25, skier: { duration: 26, ...SKIER_PRESETS.expertCarve }, wind: W_LIGHT,
    expect: { zh: '审计：第一轮 73.5 %。', en: 'Audit: round 1 73.5 %.' } },
  { id: 'steep', zh: '陡坡 28°、15 m/s', en: 'Steep 28°, 15 m/s', dur: 25, skier: { duration: 26, slopeDeg: 28, vTarget: 15, v0: 15, turnPeriod: 2.9, turnAmpDeg: 45 }, wind: W_LIGHT,
    expect: { zh: '接近动能上限速度：报告落后、可用率与动能。', en: 'Near the KE-cap speed: lag, availability and KE.' } },
  { id: 'fast', zh: '高速 18 m/s（超出包线）', en: 'High speed 18 m/s (outside the envelope)', dur: 25, skier: { duration: 26, vTarget: 18, v0: 18, turnPeriod: 5.5, turnAmpDeg: 24 }, wind: W_LIGHT,
    expect: { zh: '超出动能上限速度：滑翔机落后，牵绳将尽时先放钩深失速落雪。', en: 'Above the KE-cap speed: the glider lags; before the spool end it releases and deep-stall lands.' } },
  { id: 'headwind', zh: '逆风 6 m/s', en: 'Headwind 6 m/s', dur: 25, skier: { duration: 26 }, wind: { mean: [-6, 0, 0], intensity: 0.2, Lu: 30, seed: 3 },
    expect: { zh: '空速高、升阻比低→牵绳补拖曳；报告张力。', en: 'High airspeed, low L/D → the leash tows; report tension.' } },
  { id: 'tailwind', zh: '顺风 4 m/s（估计门限 4.5 m/s 附近）', en: 'Tailwind 4 m/s (near the 4.5 m/s estimated gate)', dur: 25, skier: { duration: 26 }, wind: { mean: [4, 0, 0], intensity: 0.2, Lu: 30, seed: 4 },
    expect: { zh: '最低空速约束：S 形绕飞+襟翼增升；报告最低空速。', en: 'Minimum-airspeed constraint: weave + flap high lift; report minimum airspeed.' } },
  { id: 'gust', zh: '阵风侧风 4 m/s + 6 m/s 阵风', en: 'Gusty crosswind 4 m/s + 6 m/s gust', dur: 30, skier: { duration: 31 }, wind: { mean: [0, 4, 0], intensity: 0.3, Lu: 25, seed: 9, gustAt: 12, gust: [0, 6, 0], gustRise: 1, gustHold: 3 },
    expect: { zh: '偏流角大：相机窗口能否保住人物；机体姿态抖动。', en: 'Large crab angle: does the camera window keep the rider; airframe attitude jitter.' } },
  { id: 'flat', zh: '平缓猫道 3°、逆风 3 m/s（重力不足）', en: 'Flat cat-track 3° with 3 m/s headwind (gravity insufficient)', dur: 25, skier: { duration: 26, slopeDeg: 3, style: 'straight', v0: 10, vTarget: 12, mu: 0.03 }, wind: { mean: [-3, 0, 0], intensity: 0.15, Lu: 30, seed: 6 },
    expect: { zh: '牵绳拖着滑翔机（空中拖曳）：拖曳张力与身体受力。', en: 'The leash aerotows the glider: tow tension and body force.' } },
  { id: 'fall', zh: '摔倒（12 m/s² 急停）', en: 'Rider fall (12 m/s² stop)', dur: 20, skier: { duration: 21, fallAt: 10 }, hardFall: { t: 10, decel: 12 }, wind: W_LIGHT,
    expect: { zh: '卷轴自由放线；滑翔机拉起侧转、远离降落；相对动能与最近距离。', en: 'Reel free-spools; glider zooms, turns away and lands clear; relative KE and closest approach.' } },
  { id: 'crossing', fault: true, zh: '他人横穿并挂住牵绳（距背后 0.9 m，7 m/s，卡住 1.5 s）', en: 'Neighbour skier crosses and catches the leash (0.9 m behind, 7 m/s, held 1.5 s)', dur: 20, skier: { duration: 21 }, wind: W_LIGHT, plan: { crosser: { t: 10, behind: 0.9, speed: 7, side: 1, catch: 1.5 } },
    expect: { zh: '撞绳力（离合器 3 N 封顶）、拖钩释放、对他人和本人的力；48 V 断电。', en: 'Line-strike force (3 N clutch cap), hook release, forces on both; 48 V cut.' } },
  { id: 'crossing_slip', fault: true, compare: true, zh: '他人横穿牵绳（绳可滑动）', en: 'Neighbour skier crosses the leash (line free to slide)', dur: 20, skier: { duration: 21 }, wind: W_LIGHT, plan: { crosser: { t: 10, behind: 0.9, speed: 7, side: 1 } },
    expect: { zh: '无摩擦假设：绳从横穿者头顶滑脱。', en: 'Frictionless assumption: the line rides over the crosser’s head.' } },
  { id: 'snag', fault: true, zh: '树枝挂绳（离雪 2.4 m 横枝）', en: 'Tree branch snags the leash (2.4 m above the snow)', dur: 22, skier: { duration: 23 }, wind: W_LIGHT, branch: { t: 10, h: 2.4, half: 6 },
    expect: { zh: '挂住→拖钩释放→深失速落雪→空绳收回；身体受力与留在树上的东西。', en: 'Snag → hook release → deep-stall landing → empty line retracts; body force and what is left in the tree.' } },
  { id: 'reelfail', fault: true, zh: '卷轴电机/控制器失效后停下', en: 'Reel motor/controller failure, then a stop', dur: 30, skier: { duration: 31, stopAt: 20 }, wind: W_LIGHT, plan: { reelFailAt: 8 },
    expect: { zh: '无拖曳、无回收：停下时落雪，需手动取回。', en: 'No tow, no recovery: lands at the stop, manual pick-up.' } },
];

function shotOffset(dur) { // behind → rear-left (+32°) → rear-right (−32°) → behind
  return (t) => { const a = smooth((t - 0.28 * dur) / 2.5) - 2 * smooth((t - 0.52 * dur) / 2.5) + smooth((t - 0.78 * dur) / 2.5); return { az: 32 * a }; };
}
const runShots = (t) => ({ az: 28 * (smooth((t - 20) / 3) - smooth((t - 34) / 3)) - 28 * (smooth((t - 80) / 3) - smooth((t - 92) / 3)) });

function prepare(params, sc) {
  const pr = resolve({ ...params, ...(sc.over || {}) });
  if (sc.run) {
    const sk = simulateRun({ plan: sc.run.plan, seed: sc.run.seed, skier: sc.run.skier || {} });
    const lastRide = sk.rides[sk.rides.length - 1];
    const plan = { start: 'stowed', armAt: TGO - 1, offset: pr.shotPlan ? runShots : null };
    if (!sc.noFinal) plan.finalAfter = TGO + lastRide.t0 + 3; // lift-base geofence: the last stop of the run is the stow
    if (sc.dockBefore != null) plan.dockAt = TGO + lastRide.t1 - sc.dockBefore;
    return { sk, dur: Math.floor((sk.duration + TGO) * 50) / 50, input: { duration: Math.floor((sk.duration + TGO) * 50) / 50, skier: sk, tGo: TGO, wind: sc.wind, plan, seed: sc.seed || 11 }, run: true };
  }
  const sk = simulateSkier({ ...sc.skier });
  if (sc.hardFall) applyHardFall(sk, sc.hardFall.t, sc.hardFall.decel);
  const plan = { ...(sc.plan || {}) };
  if (pr.shotPlan && !plan.offset && plan.start !== 'stowed') plan.offset = shotOffset(sc.dur);
  if (sc.branch) { const s = skierAt(sk, sc.branch.t); plan.branch = { x: s.pos[0], y0: s.pos[1] - sc.branch.half, y1: s.pos[1] + sc.branch.half, h: sc.branch.h }; }
  if (plan.crosser) plan.crosser = { ...plan.crosser };
  return { sk, dur: sc.dur, input: { duration: sc.dur, skier: sk, tGo: sc.tGo || 0, wind: sc.wind, plan, seed: sc.seed || 11 }, run: false };
}

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const WALK_UP = 0.7, RECLIP = 20; // m/s uphill in ski boots, s to re-clip the magnetic hook and insert the glider (ASSUMED)

// per-run user cost and energy from a core run (shared by buildResult and the ensemble)
function accounting(core, prep, sc, p, A) {
  const O = core.O, n = core.n, SDT = core.SDT, ev = core.events.map((e) => e.type);
  const gated = ev.includes('gate') && !ev.includes('drop'); // never launched (a gate that only delayed a launch is not a no-fly run)
  const gateDelays = ev.filter((e) => e === 'gate').length;
  const releases = ev.filter((e) => e === 'release').length, cut = ev.includes('cut'), reelfail = ev.includes('reelfail');
  const sk = prep.sk;
  let finalStill = NaN, finalPos = null;
  if (prep.run) { const st = sk.stops[sk.stops.length - 1]; finalStill = TGO + st.t0; finalPos = core.rider(finalStill).pos; }
  else { for (let i = Math.round(((sc.tGo || 0) + 1) / SDT); i < n; i++) if (core.rider(i * SDT).speed < 0.3) { finalStill = i * SDT; finalPos = core.rider(finalStill).pos; break; } }
  // round 4: a glider already back in the holster at the end (restowed after a gate/margin pull-in) counts as docked, 0 s stow
  const inHolsterEnd = ['stowed', 'docked', 'seat'].includes(MODES[O.mode[n - 1]]) && core.info.hookOn && !core.info.lineCut;
  const docked = Number.isFinite(core.info.tDocked) || (inHolsterEnd && !gated);
  const finalStand = Number.isFinite(core.info.tDocked) && Number.isFinite(finalStill) ? Math.max(0, core.info.tDocked - finalStill) : docked ? 0 : NaN;
  // a released / unrecovered glider: walk to it from where the rider stops, re-clip, insert
  let pickUp = 0, pickDist = NaN;
  const lost = !gated && (releases > 0 || cut || reelfail || (prep.run && !sc.noFinal && !docked));
  if (lost) { const g = [O.gx[n - 1], O.gy[n - 1]], r = finalPos || core.rider((n - 1) * SDT).pos; pickDist = Math.hypot(g[0] - r[0], g[1] - r[1]); pickUp = pickDist / WALK_UP + RECLIP; }
  const setup = 1 + (Number.isFinite(finalStand) ? finalStand : 0) + pickUp; // arm tap (standing) + stow standstill + pick-up
  const ops = 1 + (p.dockMode === 1 && !prep.run ? 1 : 0) + (lost ? 2 : 0) + (prep.run && !docked && !lost && !gated && !sc.noFinal ? 1 : 0);
  // energy: glider electrical load per mode, delivered over the leash from the hip pack
  const Wg = gliderBudget(CAM_BUDGET[p.cam | 0] || 'panEIS', p.S).W;
  let E = 0, filmS = 0;
  for (let i = 0; i < n; i++) {
    const md = MODES[O.mode[i]];
    const w = ['stowed', 'docked', 'seat'].includes(md) ? 0.05 : ['park', 'landed', 'snowpull', 'drop', 'sled'].includes(md) ? 1.5 : Wg;
    E += (powerChain(w).hipIn + (O.Preel[i] || 0) / 0.6) * SDT;
    if (A && A.filming[i] === 1 && core.rider(i * SDT).speed > 2) filmS += SDT;
  }
  E += HIP.liftS * (p.liftSleep === 0 ? HIP.reelIdleW + HIP.hipElecW : HIP.sleepW); // round 4: lift ride charged (sleep mode)
  const usableWh = HIP.packWh * BATTERY.coldFactor * (1 - BATTERY.reserve);
  const endurance = filmS > 1 ? ((usableWh * 3600) / E) * filmS / 60 : NaN;
  return { gated, releases, cut, docked, finalStand, pickUp, pickDist, setup, ops, E, filmS, endurance, Wg, lost };
}

function buildResult(params, sc, prep, { demo = false } = {}) {
  const pr = resolve({ ...params, ...(sc.over || {}) });
  const p = { ...PDEF, ...pr };
  const core = runCore(p, prep.input);
  const an = analyse(core, { branch: prep.input.plan.branch, wind: prep.input.wind, seed: prep.input.seed });
  const A = an.cols, O = core.O, n = core.n, SDT = 0.02;
  const dur = prep.dur;
  const R = makeResult({ conceptId: 'towglider', scenarioId: sc.id, modelVersion: MV, duration: dur, sampleDt: SDT });
  if (R.n !== n) throw new Error(`sample count mismatch ${R.n} ${n}`);
  const C = (k, src) => { const c = R.col(k); c.set(src); return c; };
  C('tension', O.Thip); C('tensionGlider', O.T); C('towCmd', O.Tcmd); C('reelL', O.L); C('reelRate', O.Ld);
  C('airspeed', O.air); C('height', O.hgt); C('bank', O.bank); C('brake', O.brake); C('CL', O.CL);
  C('pGrav', O.Pgrav); C('pDrag', O.Pdrag); C('pTow', O.Ptow);
  C('subjectPx', A.subjectPx); C('azView', A.az); C('lineArt', A.art); C('keSnow', A.keSnow); C('keRel', A.keRel);
  C('headDist', A.headDist); C('clearBody', A.clearBody); C('clearPole', A.clearPole); C('clearSki', A.clearSki); C('offAxis', A.offAxis); C('cropVfov', A.vfov);
  C('crossForce', O.Fcross); C('wake', O.wake); C('bodyRate', A.bodyRate); C('blurPx', A.blurPx); C('camPan', A.pan);
  const speed = R.col('speed'), lag = R.col('lag'), latOff = R.col('latOff');
  for (let i = 0; i < n; i++) { const s = core.rider(i * SDT); speed[i] = s.speed; lag[i] = Math.hypot(O.gx[i] - s.pos[0], O.gy[i] - s.pos[1]); const c = [O.cx[i], O.cy[i]]; latOff[i] = Math.abs((O.gy[i] - s.pos[1]) * c[0] - (O.gx[i] - s.pos[0]) * c[1]); }
  for (const e of core.events) R.events.push(e);

  // ---- windows (whole run judged; legacy 30 s follow segments start on station, settle 1 s)
  const settle = prep.run || demo ? 0 : 1;
  const idx = []; for (let i = 0; i < n; i++) if (i * SDT >= settle) idx.push(i);
  const skiing = new Uint8Array(n);
  for (const i of idx) { const s = core.rider(i * SDT); skiing[i] = s.speed > 2 && !s.fallen ? 1 : 0; }
  const skiIdx = idx.filter((i) => skiing[i]);
  const flyIdx = idx.filter((i) => ['follow', 'free', 'winch'].includes(MODES[O.mode[i]]));
  const pick = (arr, ii) => ii.map((i) => arr[i]).filter(Number.isFinite);
  const max = (a) => (a.length ? Math.max(...a) : NaN), min = (a) => (a.length ? Math.min(...a) : NaN);
  const pct = (a, q) => { if (!a.length) return NaN; const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.round(q * (v.length - 1)))]; };
  const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const nb = (x) => (Number.isFinite(x) ? x : 'n/a');
  const M = (id, zh, en, v, unit, pass, cz, ce) => R.metric(id, zh, en, v, unit, pass, cz ? { zh: cz, en: ce } : null);

  // footage
  // round 4 shared rules (audit3 A3-X-01/X-04): subject size = footage().bodyPx (feet→head/shoulders, no ski tips) ≥300 px;
  // a line frame is an artefact when the leash overlaps the subject with an apparent width ≥ ARTEFACT_PX (2 px at 1080p)
  const geomOK = (i) => A.filming[i] === 1 && A.inFrame[i] === 1 && A.bodyPx[i] >= 300;
  const artef = (i) => artefactCounts(A.artW[i] > 0, A.artW[i]);
  const den = Math.max(1, skiIdx.length), noSki = skiIdx.length === 0;
  let avail = skiIdx.filter((i) => geomOK(i) && !artef(i)).length / den;
  // round 3 shared rule (fullrun availMask): the riding mask of the shared run plan is the denominator in run scenarios
  let ridIdx = null;
  if (prep.run) { const rc = prep.sk.col.riding, tg = prep.input.tGo || 0; ridIdx = idx.filter((i) => { const j = Math.round((i * SDT - tg) / prep.sk.sampleDt); return j >= 0 && j < prep.sk.n && rc[j] === 1; }); avail = ridIdx.length ? ridIdx.filter((i) => geomOK(i) && !artef(i)).length / ridIdx.length : 0; }
  const availGeom = skiIdx.filter(geomOK).length / den;
  const filmSki = skiIdx.filter((i) => A.filming[i] === 1);
  const artFrames = filmSki.length ? filmSki.filter(artef).length / filmSki.length : NaN;
  const pxMed = pct(filmSki.filter((i) => A.inFrame[i] === 1).map((i) => A.bodyPx[i]), 0.5);
  const los = [], fwd = [], mask = new Uint8Array(n);
  { let last = null; for (let i = 0; i < n; i++) { const ok = skiing[i] && A.filming[i] === 1 && Number.isFinite(A.lx[i]) && ['follow', 'free', 'winch', 'sled'].includes(MODES[O.mode[i]]); mask[i] = ok ? 1 : 0; if (ok) last = { l: [A.lx[i], A.ly[i], A.lz[i]], f: [A.cfx[i], A.cfy[i], A.cfz[i]] }; los.push(last ? last.l : [1, 0, 0]); fwd.push(last ? last.f : [1, 0, 0]); } }
  const jh = jitterHP(los, fwd, SDT, mask, 1);
  const jitter = jh.rms; // attitude response + stabilisation residual are modelled (attitude.js); no add-on
  const vfMed = pct(filmSki.map((i) => A.vfov[i]).filter(Number.isFinite), 0.5);
  const jitterPct = (jitter / vfMed) * 100;
  const fl = filmSki.filter((i) => MODES[O.mode[i]] === 'follow');
  const blur95 = pct(pick(A.blurPx, fl), 0.95), bodyRms = Math.sqrt(meanOf(pick(A.bodyRate, fl).map((x) => x * x)));
  const azLP = []; { let y = null; const k = 1 - Math.exp(-SDT * 2 * Math.PI * 0.2); for (const i of filmSki) { const a = A.az[i]; if (!Number.isFinite(a)) continue; y = y == null ? a : y + (a - y) * k; azLP.push(y); } }
  const azRange = azLP.length > 50 ? pct(azLP, 0.95) - pct(azLP, 0.05) : NaN;
  let F50 = 0; for (let k = 2; k < idx.length; k++) { const i = idx[k]; F50 = Math.max(F50, (0.5 * O.Thip[i - 2] + O.Thip[i - 1] + O.Thip[i]) / 2.5); }
  const capV = core.info.captureV;
  const Fcap = Number.isFinite(capV) ? (p.mass * capV * capV) / (2 * 0.15) : 0; // funnel stroke 0.15 m (I-05)
  F50 = Math.max(F50, Fcap);
  let keMax = 0; for (const i of idx) { if (!Number.isFinite(A.headDist[i])) continue; const ke = A.headDist[i] + 0.14 > 1.5 ? A.keSnow[i] : A.keRel[i]; if (ke > keMax) keMax = ke; }
  const acc = accounting(core, prep, sc, p, A);
  const design = pr.design | 0 || 3;
  const worn = p.mass + Object.values(WORN).reduce((a, b) => a + b, 0);
  const pv = packVolume({ ...p, camOpt: CAMS[p.cam | 0]?.key });
  const legacyEndurance = design < 3 ? (1.2 * BATTERY.coldFactor * (1 - BATTERY.reserve) * 60) / (2.9 + 0.4 + 1.1) : NaN; // round-1 1.2 Wh glider cell, no cold charging (audit TG-03)

  // ---- harmonised metrics: the fullrun scenario is judged on the 48-case (FULLRUN_CASES_R4) ensemble (precomputed for the defaults)
  const ens = sc.ensemble && isDefault(params) && ENSEMBLE && ENSEMBLE.metrics ? ENSEMBLE.metrics : null;
  const eN = (id, q) => ens && ens[id] ? ens[id][q] : NaN;
  const note = (zh, en) => ({ zh, en });
  if (ens) {
    addStd(R, 'avail', eN('avail', 'mean'), note(`48 例集合均值；p10 ${fmt(eN('avail', 'p10'))} %，p90 ${fmt(eN('avail', 'p90'))} %；本例 ${fmt(avail * 100)} %`, `48-case ensemble mean; p10 ${fmt(eN('avail', 'p10'))} %, p90 ${fmt(eN('avail', 'p90'))} %; this case ${fmt(avail * 100)} %`));
    addStd(R, 'pxMed', eN('pxMed', 'mean'), note('集合均值', 'ensemble mean'));
    addStd(R, 'jitterRms', eN('jitterRms', 'p90'), note(`集合 p90（共享 footageStability 主体指标，飞行的工况；本概念自算 p90 ${fmt(eN('jitterOwn', 'p90'))} °/s = ${fmt(eN('jitterPct', 'p90'))} %/s 画面高）`, `ensemble p90 of the shared footageStability subject metric over flown cases (own metric p90 ${fmt(eN('jitterOwn', 'p90'))} °/s = ${fmt(eN('jitterPct', 'p90'))} %/s of frame height)`));
    addStd(R, 'azRange', eN('azRange', 'mean'), note('集合均值', 'ensemble mean'));
  } else {
    addStd(R, 'avail', noSki ? 'n/a' : avail * 100, note('原始画面，不计算法去绳', 'raw footage, no line-removal credit'));
    addStd(R, 'pxMed', nb(pxMed));
    addStd(R, 'jitterRms', nb(jitter), note(`含机体姿态湍流响应与稳像残余；= ${fmt(jitterPct)} %/s 画面高`, `incl. airframe attitude response and stabilisation residual; = ${fmt(jitterPct)} %/s of frame height`));
    addStd(R, 'azRange', nb(azRange));
  }
  addStd(R, 'addedMass', worn);
  addStd(R, 'bodyForcePeak', ens ? Math.max(eN('bodyForcePeak', 'max'), F50) : F50, ens ? note('集合最大值', 'ensemble max') : null);
  addStd(R, 'handsBusy', 0, note('布防在停稳时；中途停下与缆车站收回无需操作（地理围栏）', 'arm while standing; rest stops and the lift-approach stow need no action (geofence)'));
  if (ens) addStd(R, 'setupTime', eN('setupTime', 'p90'), note(`集合 p90（布防 1 s + 缆车站收回站立 + 放钩时步行取回）；均值 ${fmt(eN('setupTime', 'mean'))} s，最大 ${fmt(eN('setupTime', 'max'))} s`, `ensemble p90 (1 s arm + lift-approach stow standstill + walk-up pick-up after a release); mean ${fmt(eN('setupTime', 'mean'))} s, max ${fmt(eN('setupTime', 'max'))} s`));
  else if (prep.run || sc.stow) addStd(R, 'setupTime', acc.setup, note(`本例：布防 1 s + 收回站立 ${fmt(acc.finalStand)} s + 取回 ${fmt(acc.pickUp)} s`, `this run: 1 s arm + stow standstill ${fmt(acc.finalStand)} s + pick-up ${fmt(acc.pickUp)} s`));
  else addStd(R, 'setupTime', ENSEMBLE?.metrics?.setupTime?.p90 ?? NaN, note('跟拍段不含停下：取完整一趟集合 p90', 'follow segment has no stop: full-run ensemble p90'));
  if (ens) addStd(R, 'ops', eN('ops', 'p90'), note(`集合 p90（最大 ${fmt(eN('ops', 'max'), 0)}）：布防 1 次；中途停下自动再起飞；缆车站地理围栏收回`, `ensemble p90 (max ${fmt(eN('ops', 'max'), 0)}): one arm tap; rest stops relaunch automatically; lift-base geofence stows`));
  else addStd(R, 'ops', acc.ops, acc.lost ? note('布防 + 步行取回 + 重新挂钩', 'arm + walk to the glider + re-clip') : note('布防（地理围栏收回）', 'arm (geofence stow)'));
  addStd(R, 'keMax', ens ? Math.max(eN('keMax', 'max'), keMax) : nb(keMax), ens ? note('集合最大值，全程判定（含起飞/落雪）', 'ensemble max over the whole run (incl. launch and drops)') : note('全程判定', 'whole run'));
  const folIdx = flyIdx.filter((i) => MODES[O.mode[i]] === 'follow');
  const lh1 = pick(A.lineH1, folIdx), lh2 = pick(A.lineH2, folIdx);
  const lineH1min = min(lh1), lineH1p10 = pct(lh1, 0.1), lineH2min = min(lh2), lineH2p10 = pct(lh2, 0.1);
  if (lh1.length) M('lineH1', '牵绳离雪高度：滑雪者后方 1 m 处（最小 / p10，跟随）', 'Leash height above snow 1 m behind the rider (min / p10, following)', lineH1min, 'm', null);
  if (lh2.length) M('lineH2', '牵绳离雪高度：滑雪者后方 2 m 处（最小 / p10，跟随）', 'Leash height above snow 2 m behind the rider (min / p10, following)', lineH2min, 'm', null);
  // round 4 trip-hazard profile (A3-TG-06): leash height above the snow 0.5–3 m (horizontal) behind the feet, over all
  // riding samples with line out (launch, sled, follow, stops) and following only; low-line exposure = share of riding
  // samples with line out where ≥5 cm of leash lies 1–3 m from the feet lower than 0.3 m (ski/boot trip band)
  const ridI = (ridIdx || skiIdx).filter((i) => i % 5 === 0 && O.hookOn[i] && O.L[i] > 0.5 && !['stowed', 'docked', 'seat'].includes(MODES[O.mode[i]]));
  const folR = ridI.filter((i) => MODES[O.mode[i]] === 'follow');
  const trip = { D: an.trip.D, all: {}, follow: {} };
  an.trip.D.forEach((D, k) => { const a = pick(an.trip.h[k], ridI), f = pick(an.trip.h[k], folR); trip.all[D] = { min: min(a), p10: pct(a, 0.1), p50: pct(a, 0.5), n: a.length }; trip.follow[D] = { min: min(f), p10: pct(f, 0.1), p50: pct(f, 0.5) }; });
  trip.lowShare = ridI.length ? (100 * ridI.filter((i) => A.lowLen[i] > 0.05).length) / ridI.length : NaN;
  trip.lowShareRide = (ridIdx || skiIdx).length ? (100 * ridI.filter((i) => A.lowLen[i] > 0.05).length * 5) / (ridIdx || skiIdx).length : NaN;
  if (ridI.length) M('tripLow', '绊绳暴露：滑行且放线时，脚后 1–3 m 内有≥5 cm 牵绳低于 0.3 m 的时间比例', 'Trip exposure: share of riding time with line out where ≥5 cm of leash lies 1–3 m behind the feet below 0.3 m', trip.lowShare, '%', null);
  if (ridI.length) M('tripH2', '牵绳在脚后 2 m 处离雪高度（滑行全程 p10）', 'Leash height above the snow 2 m behind the feet (all riding with line out, p10)', trip.all[2].p10, 'm', null);
  const headClear = min(pick(A.headC, idx)), capWinS = idx.filter((i) => A.capWin[i] === 1).length * SDT;
  addStd(R, 'headClear', ens && eN('headClear', 'min') != null ? Math.min(eN('headClear', 'min'), headClear) : nb(headClear), ens ? note(`集合最小值（滑翔机与牵绳到头盔中心，全程；仅排除入套捕获窗口，本例 ${fmt(capWinS)} s）`, `ensemble min (glider and leash to the helmet centre, whole run; only the dock-capture window is excluded, ${fmt(capWinS)} s here)`) : note(`滑翔机与牵绳到头盔中心，全程；排除入套捕获窗口 ${fmt(capWinS)} s`, `glider and leash to the helmet centre, whole run; dock-capture window excluded ${fmt(capWinS)} s`));
  addStd(R, 'packVol', pv.total);
  if (design < 3) addStd(R, 'endurance', legacyEndurance, note('第一轮：机上 1.2 Wh 电池，−10 °C 不得充电（审计 TG-03）', 'round 1: 1.2 Wh glider cell, no charging at −10 °C (audit TG-03)'));
  else addStd(R, 'endurance', ens ? eN('endurance', 'mean') : nb(acc.endurance), note(`髋部 ${HIP.packWh} Wh（${(WORN.hipPack * 1000).toFixed(0)} g）经 48 V 导电牵绳供电，滑翔机上无锂电池（无低温充电问题）；${ens ? '集合平均完整一趟功率' : '本例完整一趟功率'}`, `hip ${HIP.packWh} Wh pack (${(WORN.hipPack * 1000).toFixed(0)} g) powers the glider over the 48 V leash; no lithium cell on the glider (no cold-charging issue); ${ens ? 'ensemble mean full-run power' : 'this run’s power'}`));

  // ---- concept-specific
  const Tmov = pick(O.Thip, skiIdx.filter((i) => MODES[O.mode[i]] === 'follow'));
  M('tensionP50', '跟随时牵绳张力中位（髋部）', 'Leash tension at the hip while following, median', nb(pct(Tmov, 0.5)), 'N', null);
  M('tensionP95', '跟随时牵绳张力 p95', 'Leash tension while following, p95', nb(pct(Tmov, 0.95)), 'N', Number.isFinite(pct(Tmov, 0.95)) ? pct(Tmov, 0.95) <= 3 : null, '≤3 N（I-05 否决线）', '≤3 N (I-05 kill line)');
  const towI = flyIdx.filter((i) => O.Tcmd[i] > p.Tmin + 0.05 && O.hookOn[i]);
  M('towShare', '需要牵绳额外拖曳的时间比例', 'Share of flight time the leash adds tow', flyIdx.length ? (100 * towI.length) / flyIdx.length : 'n/a', '%', null);
  const gIdx = flyIdx.filter((i) => Number.isFinite(O.Pgrav[i]));
  M('pGravMean', '平均重力功率（跟随）', 'Mean gravity power (following)', nb(meanOf(pick(O.Pgrav, gIdx))), 'W', null);
  M('pTowMean', '平均牵绳拖曳功率', 'Mean leash tow power', nb(meanOf(pick(O.Ptow, gIdx))), 'W', null);
  M('brakeMean', '平均减速板开度（重力富余被耗散）', 'Mean airbrake (gravity surplus dumped)', nb(meanOf(pick(O.brake, gIdx)) * 100), '%', null);
  const folI = flyIdx.filter((i) => O.hgt[i] > 0.5 && MODES[O.mode[i]] === 'follow');
  const vMin = min(folI.map((i) => O.air[i] / (O.Pel[i] || core.Vs)));
  M('airMin', '跟随时最低空速 / 当前襟翼下失速速度', 'Min airspeed while following / stall speed at the current flap setting', nb(vMin), '×Vs', Number.isFinite(vMin) ? vMin >= 1.0 : null, '≥1.0', '≥1.0');
  const hMin = min(pick(O.hgt, flyIdx.filter((i) => MODES[O.mode[i]] === 'follow' && O.hookOn[i])));
  M('heightMin', '跟随时最低离雪高度', 'Min height above snow while following', nb(hMin), 'm', Number.isFinite(hMin) ? hMin >= 1.5 : null, '≥1.5 m（假设）', '≥1.5 m (ASSUMED)');
  M('lagMax', '与滑雪者最大水平距离（跟随）', 'Max horizontal distance to the rider (following)', nb(max(pick(lag, flyIdx))), 'm', null);
  M('latOffP95', '滑翔机偏离滑行线的横向距离 p95（牵绳扫过雪道的宽度）', 'Lateral offset of the glider from the rider’s course, p95 (how far the leash sweeps across the piste)', nb(pct(pick(latOff, flyIdx), 0.95)), 'm', null);
  M('artFrames', '主体上有≥1 px 绳伪影的帧（滑行+拍摄）', 'Frames with a ≥1 px line artefact over the subject', nb(artFrames * 100), '%', Number.isFinite(artFrames) ? artFrames <= 0.02 : null, '≤2 %（I-05 否决线）', '≤2 % (I-05 kill line)');
  M('availGeom', '几何可用率（不计伪影，参考）', 'Geometric availability (artefacts ignored, info)', noSki ? 'n/a' : availGeom * 100, '%', null);
  M('jitterPct', '画面抖动 / 输出画面高（%/s）', 'Jitter normalised by the output crop height', nb(jitterPct), '%/s', null);
  M('bodyRateRms', '机体角速度 RMS（湍流姿态响应，跟随）', 'Airframe angular rate RMS (turbulence attitude response, following)', nb(bodyRms), '°/s', null);
  M('blurP95', '1 ms 曝光运动模糊 p95（输出像素）', 'Motion blur in a 1 ms exposure, p95 (output px)', nb(blur95), 'px', Number.isFinite(blur95) ? blur95 <= 2 : null, '≤2 px（假设）', '≤2 px (ASSUMED)');
  const cIdx0 = skiIdx.filter((i) => !['reelin', 'seat', 'docked', 'stowed', 'drop', 'snowpull', 'park'].includes(MODES[O.mode[i]]));
  const cIdx = cIdx0.length ? cIdx0 : idx;
  const cB = min(pick(A.clearBody, cIdx)), cP = min(pick(A.clearPole, cIdx)), cS = min(pick(A.clearSki, cIdx));
  M('clearBody', '牵绳到身体最小间隙（滑行，漏斗口 0.4 m 以外）', 'Min leash-to-body clearance (skiing, beyond 0.4 m from the funnel)', nb(cB), 'm', Number.isFinite(cB) ? cB > 0 : null, '>0 m（不接触）', '>0 m (no contact)');
  M('clearPole', '牵绳到雪杖最小间隙（滑行）', 'Min leash-to-pole clearance (skiing)', nb(cP), 'm', Number.isFinite(cP) ? cP >= 0.1 : null, '≥0.1 m（假设）', '≥0.1 m (ASSUMED)');
  M('clearSki', '牵绳到雪板最小间隙（滑行）', 'Min leash-to-ski clearance (skiing)', nb(cS), 'm', Number.isFinite(cS) ? cS >= 0.1 : null, '≥0.1 m（假设）', '≥0.1 m (ASSUMED)');
  const hd = min(pick(A.headDist, idx.filter((i) => ['follow', 'free', 'recover', 'abort', 'land', 'dstall'].includes(MODES[O.mode[i]]))));
  const hl = min(pick(A.headDist, idx.filter((i) => ['winch', 'reelin'].includes(MODES[O.mode[i]]))));
  if (Number.isFinite(hl)) M('headLaunch', '起飞/入筒时滑翔机到头盔最小距离', 'Min glider-to-helmet distance in launch / dock', hl, 'm', hl >= 0.5, '≥0.5 m（假设）', '≥0.5 m (ASSUMED)');
  M('headMin', '滑翔机（含翼尖）到头盔最小距离（飞行与落雪）', 'Min glider (incl. wing tips) to helmet distance (flight and drops)', nb(hd), 'm', Number.isFinite(hd) ? hd >= 1.0 : null, '≥1.0 m', '≥1.0 m');
  const launches = core.events.filter((e) => e.type === 'follow');
  if (launches.length && (sc.plan?.start === 'stowed' || prep.run)) {
    const drops = core.events.filter((e) => e.type === 'drop' || e.type === 'relaunch');
    const lt = drops.map((d) => { const f = launches.find((e) => e.t > d.t); return f ? f.t - d.t : NaN; }).filter(Number.isFinite);
    M('launchTime', '起飞指令（蹬出）到到达机位（最大）', 'Push-off to on-station (max over launches)', lt.length ? Math.max(...lt) : 'n/a', 's', lt.length ? Math.max(...lt) <= 10 : false, '≤10 s（假设）', '≤10 s (ASSUMED)');
  }
  M('relaunches', '中途停下后自动再起飞次数', 'Automatic relaunches after rest stops', core.info.relaunchN, '', null);
  if (core.info.parkLog.length) M('parkTime', '停稳/停下→停放到位（最大）', 'Stop detected → parked on the line (max)', Math.max(...core.info.parkLog.map((q, k) => q.t - (core.info.dropLog[k]?.t ?? q.t))), 's', null);
  if (prep.run || sc.stow) {
    M('stowStand', '缆车站：停稳→入套锁定', 'Lift approach: rider still → seated', nb(acc.finalStand), 's', Number.isFinite(acc.finalStand) ? acc.finalStand <= 20 : null, '≤20 s（假设）', '≤20 s (ASSUMED)');
    M('touchKE', '首次落雪动能（对雪）', 'First touchdown KE (snow frame)', nb(core.info.touchKE), 'J', null);
  }
  if (Number.isFinite(capV)) M('captureV', '入漏斗相对速度', 'Funnel entry speed (rider frame)', capV, 'm/s', capV <= 2, '≤2 m/s（假设）', '≤2 m/s (ASSUMED)');
  M('releases', '拖钩释放 / 切绳次数', 'Hook releases / hip cuts', acc.releases + (acc.cut ? 100 : 0), '', acc.cut ? false : null);
  if (acc.gated) M('gated', '顺风门限：本趟不起飞', 'Tailwind gate: no launch this run', 1, '', null);
  M('runEnergy', '本趟髋部电池耗电（含牵绳线损）', 'Hip-pack energy this run (incl. line loss)', acc.E / 3600, 'Wh', null);
  if (sc.plan?.crosser) { const fc = max(pick(O.Fcross, idx)); M('strikeForce', '对横穿者的最大绳力', 'Peak leash force on the crosser', nb(fc), 'N', Number.isFinite(fc) ? fc <= 8 : null, '≤8 N（假设）', '≤8 N (ASSUMED)'); }
  if (prep.input.plan.branch) { const bm = min(pick(A.branchDist, idx)); M('branchMin', '滑翔机到树枝最小距离', 'Min glider-to-branch distance', nb(bm), 'm', Number.isFinite(bm) ? bm >= 0.3 : null, '≥0.3 m', '≥0.3 m'); }
  if (sc.plan?.crosser || prep.input.plan.branch) {
    const ok = core.events.some((e) => e.type === 'unhooked' || e.type === 'slipoff') && !core.events.some((e) => e.type === 'cut');
    const left = ok ? { zh: '无（空绳绕过后收回；滑翔机落雪待取）', en: 'nothing (empty line pulled through and retracted; glider lands for pick-up)' } : core.events.some((e) => e.type === 'cut') ? { zh: '牵绳一段（髋部切断）', en: 'a length of leash (cut at the hip)' } : { zh: '仍挂住', en: 'still caught' };
    R.metric('leftOnObstacle', '留在障碍物上的东西：' + left.zh, 'Left on the obstacle', left.en, '', ok, { zh: '无', en: 'nothing' });
  }
  M('packVolDetail', `收纳：折叠机身 ${(pv.foldedLength * 100).toFixed(0)} cm 枪套 ${pv.holsterL.toFixed(2)} L + 卷轴 0.3 L + 电池 0.12 L + 其他 0.18 L`, `Packed: ${(pv.foldedLength * 100).toFixed(0)} cm folded-glider holster ${pv.holsterL.toFixed(2)} L + reel 0.3 L + pack 0.12 L + other 0.18 L`, pv.total, 'L', null);
  M('regClass', '法规：<250 g 无人航空器（EU C0/开放类 A1，需运营者注册）；15 m 牵绳=物理地理围栏；美国 VLOS 与雪场许可为门槛', 'Regulation: <250 g UAS (EU C0 / open A1, operator registration); 15 m leash = physical geofence; US VLOS and resort permission are gates', p.mass * 1000, 'g', p.mass < 0.25, '<250 g', '<250 g');
  if (sc.stow) for (const m of R.metrics) if (['avail', 'pxMed', 'jitterRms', 'azRange', 'availGeom', 'artFrames'].includes(m.id) && m.pass != null) { m.pass = null; m.criterion = m.criterion ? { zh: m.criterion.zh + '（收纳工况不判）', en: m.criterion.en + ' (stow scenario: not judged)' } : null; }
  if (sc.fault) {
    const SAFE = ['bodyForcePeak', 'keMax', 'headMin', 'branchMin', 'leftOnObstacle', 'strikeForce', 'regClass'];
    for (const m of R.metrics) if (!SAFE.includes(m.id) && m.pass != null) { m.pass = null; m.criterion = m.criterion ? { zh: m.criterion.zh + '（故障工况不判）', en: m.criterion.en + ' (fault scenario: not judged)' } : null; }
  }

  // ---- plots
  R.plots.push({ key: 'leash', zh: '牵绳与卷轴', en: 'Leash and reel', series: [['tension', 'N', '髋部张力', 'Hip tension'], ['towCmd', 'N', '拖曳指令', 'Tow command'], ['reelL', 'm', '放线长度', 'Line out'], ['reelRate', 'm/s', '收放速度', 'Reel rate']] });
  R.plots.push({ key: 'energy', zh: '能量：重力 vs 阻力 vs 拖曳', en: 'Energy: gravity vs drag vs tow', series: [['pGrav', 'W', '重力功率', 'Gravity power'], ['pDrag', 'W', '气动耗散', 'Aero dissipation'], ['pTow', 'W', '牵绳拖曳功率', 'Leash tow power']] });
  R.plots.push({ key: 'flight', zh: '飞行状态', en: 'Flight state', series: [['airspeed', 'm/s', '空速', 'Airspeed'], ['height', 'm', '离雪高度', 'Height above snow'], ['bank', '°', '坡度', 'Bank'], ['speed', 'm/s', '滑雪者速度', 'Rider speed']] });
  R.plots.push({ key: 'frame', zh: '画面', en: 'Footage', series: [['subjectPx', 'px', '人物像高', 'Subject px'], ['lineArt', 'px', '主体上≥1 px 绳长', '≥1 px line over subject'], ['azView', '°', '视角方位', 'View azimuth'], ['camPan', '°', '转台角', 'Camera pan']] });
  R.plots.push({ key: 'stab', zh: '机体抖动与稳像', en: 'Airframe shake and stabilisation', series: [['bodyRate', '°/s', '机体角速度', 'Body rate'], ['blurPx', 'px', '运动模糊', 'Motion blur'], ['cropVfov', '°', '输出视场', 'Crop FOV']] });
  R.plots.push({ key: 'safety', zh: '安全距离与动能', en: 'Clearances and KE', series: [['headDist', 'm', '机-头盔', 'Glider–helmet'], ['clearBody', 'm', '绳-身体', 'Leash–body'], ['clearPole', 'm', '绳-雪杖', 'Leash–pole'], ['keSnow', 'J', '对地动能', 'KE vs snow']] });
  if (sc.plan?.crosser) R.plots.push({ key: 'strike', zh: '横穿撞绳', en: 'Line strike', series: [['crossForce', 'N', '对横穿者的力', 'Force on crosser'], ['tension', 'N', '髋部张力', 'Hip tension'], ['reelRate', 'm/s', '放线速度', 'Pay-out rate']] });

  if (sc.hardFall) { R.validUntil = sc.hardFall.t + 2.5; R.event(R.validUntil, 'scope', 'invalid', '此后滑雪者倒地姿态未建模，绳-身体间隙不可信', 'Beyond this the rider’s lying pose is not modelled; leash–body clearance not credible'); }
  if (prep.input.plan.branch) { const k = idx.find((i) => A.branchDist[i] < 0.02); if (k != null) { R.event(k * SDT, 'branchhit', 'invalid', '滑翔机碰到树枝：碰撞未建模', 'Glider touches the branch: collision not modelled'); R.validUntil = k * SDT; } }
  R.events.sort((a, b) => a.t - b.t);

  // ---- frames
  const lerp = (a, b, w) => a + (b - a) * w;
  const att = an.att;
  R.frame = (t) => {
    const f = Math.max(0, Math.min(n - 1, t / SDT)), i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), w = f - i0;
    const L = (k) => lerp(O[k][i0], O[k][i1], w);
    const s = core.rider(t);
    const md = MODES[O.mode[i0]];
    const leash = leashAt(O, i0, false, core.tanS);
    const lin = leash && i1 !== i0 && O.hookOn[i1] && O.contact[i0] === O.contact[i1] ? (() => { const b2 = leashAt(O, i1, false, core.tanS); return b2 && b2.length === leash.length ? leash.map((q, j) => [lerp(q[0], b2[j][0], w), lerp(q[1], b2[j][1], w), lerp(q[2], b2[j][2], w)]) : leash; })() : leash;
    const freeLine = O.freeEnd[i0] ? linePoints([L('ax'), L('ay'), L('az')], [O.p2x[i0], O.p2y[i0], O.p2z[i0]], [0, 0, -0.05], O.contact[i0] ? [O.px[i0], O.py[i0], O.pz[i0]] : null, [0, 0, -0.05], 12) : null;
    const warn = core.events.some((e) => e.severity !== 'info' && e.t <= t && e.t > t - 3);
    const fx = att && att.bx[i0] ? att.bx[i0] : [L('fx'), L('fy'), L('fz')], ux = att && att.bz[i0] ? att.bz[i0] : [L('ux'), L('uy'), L('uz')];
    const dev = {
      glider: [L('gx'), L('gy'), L('gz')], fwd: fx, up: ux,
      bank: L('bank'), fold: L('fold'), brake: L('brake'), post: L('post'), mode: md, anchor: [L('ax'), L('ay'), L('az')], leash: lin, freeLine,
      L: L('L'), tension: L('Thip'), reelRate: L('Ld'), warn, span: SPAN_WING(p), mass: p.mass, cam: p.cam | 0, dLine: p.dLine / 1000, pan: Number.isFinite(A.pan[i0]) ? A.pan[i0] : 0,
      course: [O.cx[i0], O.cy[i0], 0], hook: O.hookOn[i0] === 1, gated: acc.gated,
      crosser: Number.isFinite(O.crx[i0]) ? [L('crx'), L('cry'), L('crz')] : null, crosserDir: sc.plan?.crosser ? prep.input.plan.crosser.dir : null,
      branch: prep.input.plan.branch ? { ...prep.input.plan.branch, z: -prep.input.plan.branch.x * core.tanS + prep.input.plan.branch.h } : null,
      camDir: Number.isFinite(A.cfx[i0]) ? [A.cfx[i0], A.cfy[i0], A.cfz[i0]] : null,
    };
    const filming = A.filming[i0] === 1 && Number.isFinite(A.cpx[i0]);
    const labels = demo ? [] : [
      { p: [dev.anchor[0], dev.anchor[1], dev.anchor[2] + 0.5], text: `${dev.tension.toFixed(2)} N`, color: dev.tension > 2 ? '#ff6a5a' : '#ffd27a' },
      { p: [dev.glider[0], dev.glider[1], dev.glider[2] + 0.35], text: `${md} · ${L('air').toFixed(1)} m/s`, color: '#9cc8ff' },
    ];
    return {
      t, tanS: core.tanS, skier: { ...s, pack: 'none', ...(demo && sc.handTaps ? handTap(s, t, sc.handTaps) : {}) }, device: dev, labels,
      productCam: filming ? { pos: [A.cpx[i0], A.cpy[i0], A.cpz[i0]], fwd: [A.cfx[i0], A.cfy[i0], A.cfz[i0]], up: [0, 0, 1], vfovDeg: A.vfov[i0], label: `towglider · ${CAMS[p.cam | 0]?.en || ''}` } : null,
    };
  };
  R.core = core; R.an = an; R.acc = acc;
  R.summary = { trip, avail: noSki ? NaN : avail * 100, pxMed, jitterRms: jitter, jitterPct, azRange, setupTime: acc.setup, ops: acc.ops, bodyForcePeak: F50, keMax, E: acc.E, filmS: acc.filmS, endurance: acc.endurance, gated: acc.gated, releases: acc.releases, cut: acc.cut, finalStand: acc.finalStand, pickUp: acc.pickUp,
    airMin: vMin, heightMin: hMin, headMin: hd, headClear, capWinS, lineH1min, lineH1p10, lineH2min, lineH2p10, clearBody: cB, clearPole: cP, clearSki: cS, latOffP95: pct(pick(latOff, flyIdx), 0.95), blurP95: blur95, bodyRateRms: bodyRms, relaunches: core.info.relaunchN, touchKE: core.info.touchKE, tensionP95: pct(Tmov, 0.95) };
  return R;
}
function handTap(s, t, taps) {
  for (const [ta, tb] of taps) if (t > ta && t < tb) {
    const b = bodyPoints(s), u = Math.sin((Math.PI * (t - ta)) / (tb - ta));
    return { handL: [b.pelvis[0] - s.heading[0] * 0.05 + b.left[0] * 0.22, b.pelvis[1] - s.heading[1] * 0.05 + b.left[1] * 0.22, b.pelvis[2] + 0.05], reachL: u };
  }
  return {};
}

function simulate(params, scenario) {
  const sc = scenario || SCEN[0];
  return buildResult(params, sc, prepare(params, sc));
}
// one ensemble case (48 FULLRUN_CASES_R4): summary numbers used by run_all.mjs and the tests
export function evaluateCase(params, c) {
  const R = simulate(params, fullrunScenario(c));
  const fs = R.summary.gated ? { subjectRms: NaN, backgroundRms: NaN } : footageStability(R); // shared jitter metric (integrator), flown cases only
  const t = R.summary.trip || { all: {}, follow: {} }, g = (o, D, q) => (o[D] ? o[D][q] : NaN);
  const evs = R.events.map((e) => e.type);
  return { id: c.id, U: c.U, dir: c.dir, seed: c.seed, ...R.summary, trip: undefined, fsSubject: fs.subjectRms, fsBackground: fs.backgroundRms, mountErrDeg: R.an.mountErrRmsDeg,
    tripLow: t.lowShare, tripH1p10: g(t.all, 1, 'p10'), tripH2p10: g(t.all, 2, 'p10'), tripH3p10: g(t.all, 3, 'p10'), tripH1min: g(t.all, 1, 'min'), tripH2min: g(t.all, 2, 'min'), tripH3min: g(t.all, 3, 'min'),
    tripH1p50: g(t.all, 1, 'p50'), tripH2p50: g(t.all, 2, 'p50'), tripH3p50: g(t.all, 3, 'p50'), tripFolH2p10: g(t.follow, 2, 'p10'), tripFolH3p10: g(t.follow, 3, 'p10'),
    events: { gate: evs.filter((e) => e === 'gate').length, gatestow: evs.includes('gatestow'), gatepull: evs.includes('gatepull'), sledpull: evs.includes('sledpull'), overspeed: evs.includes('overspeed'), margin: evs.includes('margin') } };
}
// ensemble statistics from case summaries
export function ensembleStats(rows) {
  const st = (k) => { const a = rows.map((r) => r[k]).filter(Number.isFinite); return a.length ? { mean: a.reduce((x, y) => x + y, 0) / a.length, p10: pctE(a, 0.1), p50: pctE(a, 0.5), p90: pctE(a, 0.9), min: Math.min(...a), max: Math.max(...a), n: a.length } : null; };
  const out = {};
  for (const k of ['avail', 'pxMed', 'jitterRms', 'jitterPct', 'azRange', 'setupTime', 'ops', 'bodyForcePeak', 'keMax', 'airMin', 'headMin', 'headClear', 'capWinS', 'lineH1min', 'lineH1p10', 'lineH2min', 'lineH2p10', 'fsSubject', 'fsBackground', 'clearBody', 'clearPole', 'latOffP95', 'blurP95', 'bodyRateRms', 'finalStand', 'touchKE', 'tensionP95', 'mountErrDeg', 'tripLow', 'tripH1p10', 'tripH2p10', 'tripH3p10', 'tripH1min', 'tripH2min', 'tripH3min', 'tripH1p50', 'tripH2p50', 'tripH3p50', 'tripFolH2p10', 'tripFolH3p10']) out[k] = st(k);
  const usableWh = HIP.packWh * BATTERY.coldFactor * (1 - BATTERY.reserve);
  const fl = rows.filter((r) => r.filmS > 1), E = fl.reduce((a, r) => a + r.E, 0) / Math.max(1, fl.length), F = fl.reduce((a, r) => a + r.filmS, 0) / Math.max(1, fl.length);
  const Enosleep = E + HIP.liftS * (HIP.reelIdleW + HIP.hipElecW - HIP.sleepW);
  out.endurance = { mean: ((usableWh * 3600) / E) * F / 60, noSleep: ((usableWh * 3600) / Enosleep) * F / 60, note: 'usable Wh / (mean full-run hip energy + 8 min lift ride in sleep mode 0.05 W) × mean filming s per run; noSleep = lift ride idling at 0.6 W' };
  out.counts = { cases: rows.length, gated: rows.filter((r) => r.gated).length, released: rows.filter((r) => r.releases > 0).length, cut: rows.filter((r) => r.cut).length };
  return out;
}

// --------------------------------------------------------------- demo
const DEMO_PLAN = [{ ride: 22, preset: 'recreationalCarve' }, { hold: 10 }, { ride: 20, preset: 'recreationalCarve' }, { hold: 16 }];
const DEMO_T = 72.7;
const STAGES = [
  { key: 'carry', t0: 0, t1: 1.5, zh: '坡顶站立：132 g 折叠滑翔机装在臀后 80 mm 硬枪套里（腰带转扣，坐缆车时转到侧面）（机翼后折并沿 55 % 弦长对折），枪套口有一根 0.35 m 橙色玻纤导杆，牵绳从杆端引出；卷轴、15 Wh 电池与 48 V 升压在腰带上。按一下腰带按键布防；腰带用共享估风判断顺风门限。', en: 'Standing at the top: the 132 g folded glider sits in an 80 mm hard holster behind the seat (swivel clamp on the belt, turned aside on the chairlift) (wings swung aft and folded at 55 % chord); a 0.35 m orange glass-fibre line-guide wand on the holster mouth carries the leash exit; reel, 15 Wh pack and 48 V boost on the belt. One tap arms it; the belt checks the tailwind gate from its wind estimate.', title: { zh: '布防', en: 'Arm' }, pending: false },
  { key: 'launch', t0: 1.5, t1: 5.6, zh: '蹬出：滑翔机从枪套口滑落雪面、机翼弹开，放线 4.5 m 后雪面拖行，绞盘起飞；离雪 0.8 m 起计入画面。弹出与展翼机构为示意。', en: 'Push-off: the glider slides out of the holster mouth onto the snow and its wings spring open; after 4.5 m of line it is sled-towed and winch-launched; footage counts from 0.8 m. Ejection and wing-deploy hardware are illustrative.', title: { zh: '自动起飞', en: 'Automatic launch' }, pending: true },
  { key: 'follow', t0: 5.6, t1: 23.3, zh: '大弯跟拍：靠坡度重力滑翔，跟随髋部的转弯路线保持约 6 m 距离；导电牵绳供电并只补阻力差。三舵机闭环稳定座把 50° 镜头对准人物，跑后再做陀螺稳像与重构图。', en: 'Carved turns: the glider flies on slope gravity, copying the hip’s line at ≈6 m; the leash powers it and adds only the drag shortfall. A closed-loop 3-servo mount keeps the 50° lens on the rider; gyro stabilisation and reframing are done after the run.', title: { zh: '重力跟拍', en: 'Gravity follow' }, pending: false },
  { key: 'rest', t0: 23.3, t1: 35.4, zh: '中途停下：滑翔机拉升、侧移到停下滑雪者的背后一侧继续拍，然后深失速“伞降”落雪、折翼，卷轴把它拉到 3 m 处停放。', en: 'Rest stop: the glider zooms up and side-steps behind the stopped rider while still filming, then deep-stall “parachutes” onto the snow, folds and is drawn to a 3 m park.', title: { zh: '停下与停放', en: 'Drop and park' }, pending: false },
  { key: 'relaunch', t0: 35.4, t1: 38.9, zh: '再蹬出：停放的滑翔机自动展翼、雪面拖行、绞盘起飞——无需按键。', en: 'Push off again: the parked glider opens its wings, is sled-towed and winch-launched — no button.', title: { zh: '自动再起飞', en: 'Auto-relaunch' }, pending: false },
  { key: 'follow2', t0: 38.9, t1: 55, zh: '继续跟拍，机位换到右后方。', en: 'Following again; the station moves to rear-right.', title: { zh: '跟拍', en: 'Follow' }, pending: false },
  { key: 'stow', t0: 55, t1: DEMO_T, zh: '缆车站地理围栏内停下：滑翔机落雪、折翼，卷轴把它沿雪面拖进臀后枪套（入套捕获机构待实物测试）。', en: 'Stop inside the lift-base geofence: the glider drops and folds; the reel pulls it over the snow into the holster (capture hardware pending tests).', title: { zh: '收回', en: 'Stow' }, pending: true },
];
function buildDemo(params) {
  const sc = { id: 'demo', run: { plan: DEMO_PLAN, seed: 2 }, wind: { mean: [0, 1.5, 0], intensity: 0.2, Lu: 30, seed: 4, gustAt: 47, gust: [0, 5, 0], gustRise: 1.0, gustHold: 3 }, handTaps: [[0.2, 1.2]], seed: 5 };
  const prep = prepare(params, sc);
  prep.input.plan.offset = (t) => ({ az: -28 * (smooth((t - 43) / 3) - smooth((t - 52) / 3)) });
  const R = buildResult(params, sc, prep, { demo: true });
  R.scenarioId = 'demo';
  return R;
}

export default {
  id: 'towglider', family: 'aerial',
  name: { zh: '牵绳滑翔跟拍（供电牵绳 + 停放自动再起飞）', en: 'Tow-glider (powered leash, park-and-relaunch)' },
  tagline: { zh: '132 g 折叠滑翔机靠坡度重力跟拍；48 V 导电牵绳供电并补阻力差；窄角镜头+闭环稳定座；停下时拉升侧移、落雪停放，蹬出自动再起飞', en: '132 g folding glider follows on slope gravity; a 48 V conductive leash powers it and adds the drag shortfall; narrow lens on a stabilised mount; at stops it zooms, side-steps, drops, parks and relaunches by itself' },
  about: { zh: '源自 I-05“滑翔拖拍”。第四轮按审计 audit3 重做：安全优先——牵绳经 0.35 m 玻纤导杆引出（出口离头盔≥1.36 m，绳本身也离头≥1 m），卷轴动能限速器（卷筒不会把滑翔机拉到超过 0.95×限速），停歇时估风接近门限即趁站立收回枪套，顺风门限降到 3 m/s（共享估风 ±1 m/s 偏差下起飞时真实顺风 ≤4 m/s，6 个种子验证安全），飞行中 KE 调速器加拉升；画面按身体像素（不含雪板）判定，改用 50° M12 镜头、按身体取景并对准包围盒中心；稳定座和电子稳像改为物理部件模型（舵机死区、齿隙、限速、PWM、同步误差、卷帘、标定）。结果：48 例全部 KE≤14.9 J、离头≥1.0 m，但可用率不到 80 %：≥3 m/s（估计）顺风的工况无法安全起飞。', en: 'From inventor I-05 "aerotow camera". Round 4 after audit3, safety first: the leash leaves through a 0.35 m glass-fibre line-guide wand (exit ≥1.36 m from the helmet, so the line itself clears the head by ≥1 m), a reel KE governor (the drum never pulls the glider beyond 0.95 × the governor speed), a parked glider is stowed while the rider rests when the wind estimate nears the gate, the tailwind gate drops to 3 m/s (with the shared ±1 m/s estimate bias a launch then sees ≤4 m/s true tailwind, verified safe on 6 seeds), and the in-flight KE governor also zooms. Footage is judged on body pixels (no skis): 50° M12 lens, body framing aimed at the subject box centre. The mount and EIS are physical component models (servo dead band, backlash, slew, PWM; sync, rolling shutter, calibration). Result: KE ≤14.9 J and head clearance ≥1.0 m in all 48 cases, but availability stays below 80 %: runs with ≥3 m/s estimated tailwind cannot launch safely.' },
  modelVersion: MV,
  modelLimits: [
    { zh: '平动为三自由度质点；机体姿态对湍流的响应（短周期/荷兰滚/滚转模态、亚网格阵风、滚转阵风）按二阶模型事后叠加，不反馈到轨迹（attitude.js，参数为假设）', en: 'Translation is a 3-DOF point mass; airframe attitude response to turbulence (short-period / Dutch-roll / roll modes, sub-grid gusts, rolling gusts) is a 2nd-order post-hoc model with no feedback to the trajectory (attitude.js, ASSUMED parameters)' },
    { zh: '深失速“伞降”用平板后失速系数（CL 0.85、CD 0.9+襟翼，假设）；进入深失速的俯仰动态、翻滚风险未建模', en: 'The deep-stall drop uses flat-plate post-stall coefficients (CL 0.85, CD 0.9 + flaps, ASSUMED); the pitch-up entry and tumble risk are not modelled' },
    { zh: '牵绳为无质量准静态弹性抛物线；导电绳的电气（48 V、线损）按解析计算；绳波动、扭转、缠绕未建模', en: 'Leash is a massless quasi-static elastic parabola; the conductive line’s electrics (48 V, loss) are analytic; waves, twist and wrapping are not modelled' },
    { zh: '雪面停放、拖行和入套捕获为简化接触（μ 0.15–0.45 假设，入套=绳收到 0.15 m）；枪套捕获可靠性未知', en: 'Parking, sled tow and holster capture are simplified contacts (μ 0.15–0.45 ASSUMED; capture = line in to 0.15 m); capture reliability unknown' },
    { zh: '画面只算几何（剪影胶囊体、绳像宽、1 ms 曝光模糊估计）；鱼眼为等距投影', en: 'Footage is geometric (capsule silhouette, line pixel width, 1 ms blur estimate); fisheye is equidistant' },
    { zh: '第四轮相机：三舵机稳定座按每轴死区/齿隙/限速/333 Hz PWM/飞控姿态延迟建模，电子稳像残差按陀螺同步误差、卷帘残差、标定/比例误差与陀螺噪声建模（参数多为假设，见灵敏度）；跑后重构图为零相位 2 Hz 平滑 + 1 % 检测噪声；50° M12 镜头与 4K 4:3 读出为假设部件/模式', en: 'Round-4 camera: the 3-servo mount is modelled per axis with dead band, backlash, slew limit, 333 Hz PWM frame and FC attitude latency; the EIS residual from gyro/frame sync error, rolling-shutter residual, scale/calibration error and gyro noise (mostly ASSUMED values, see sensitivities); post reframing is a zero-phase 2 Hz smoother with 1 % detection noise; the 50° M12 lens and the 4K 4:3 readout are ASSUMED part/mode' },
    { zh: '共享滑雪者模型在停下段末速度跳到 0（≈2 m/s 时）', en: 'The shared skier model jumps to zero speed at the end of each stop (from ≈2 m/s)' },
    { zh: '顺风中停下时滑翔机无法随滑雪者减速；第四轮靠 3 m/s 顺风门限把起飞限制在 ≤4 m/s 真实顺风（6 个种子验证），超出时仅有超速逃逸（未证明可靠）', en: 'In a tailwind the glider cannot decelerate with a stopping rider; round 4 limits launches to ≤4 m/s true tailwind with the 3 m/s gate (verified on 6 seeds); beyond that only an overspeed escape exists (not shown reliable)' },
    { zh: '导线导杆（0.35 m 玻纤杆）与其在收回最后 1 m 折叠的机构为假设设计，未建模接触与疲劳', en: 'The 0.35 m glass-fibre line-guide wand and its fold for the last metre of a stow are an ASSUMED design; contact and fatigue are not modelled' },
    { zh: '法规（无人机归类、雪场禁飞、美国 VLOS）不在数值模型内，见 design_notes.json', en: 'Regulation (UAS classification, resort bans, US VLOS) is outside the numerical model; see design_notes.json' },
  ],
  params: PARAMS,
  scenarios: SCEN,
  simulate,
  demo: { duration: DEMO_T, stages: STAGES, build: buildDemo },
  gear: () => import('./gear.js'),
};
export { SCEN, V1, R1, vStall, liftDrag, CRITERIA, optics };
