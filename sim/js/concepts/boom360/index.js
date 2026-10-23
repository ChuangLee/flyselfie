// S1 boom360: backpack 360 tail boom (merged BODY-02 + BODY-01 + R02/R11).
// A hip-belt + pack-frame mounted rear boom of two bistable composite tape
// springs forming a V in the 360 camera's stitch plane, deployed by a button,
// with an elastomer damper and a tape-spring fold ("natural fuse") at the root,
// auto-retract on fall / standstill. Physics in ./model.js; this file wires
// scenarios, metrics, plots, frames and the demonstration.
// Evidence: numerical-uncalibrated simulation and illustration. Not a physical test.
import * as SK from '../common/skier.js';
import * as TR from '../common/trunk.js';
const { simulateSkier, skierAt } = SK;
import { stats } from '../common/env.js';
import { makeResult } from '../common/result.js';
import { addStd as addStd0, jitterHP } from '../common/criteria.js';
// standing-only scenarios have no skiing samples: report '—' instead of NaN
const addStd = (R, id, v, note) => { addStd0(R, id, Number.isFinite(v) ? v : NaN, note); if (!Number.isFinite(v)) R.metrics[R.metrics.length - 1].value = '—'; };
import {
  runBoom, footageAnalysis, design, modes, rms, maxOf, movingMeanMax, NSEG, SDT, STOW_LEN,
  SKIER_CDA, RHO,
} from './model.js';

const VERSION = 'boom360@0.4.0';

const PARAMS = [
  { id: 'design', zh: '设计版本（1/2/3）', en: 'Design version (1/2/3)', unit: '-', v: 3, min: 1, max: 3, step: 1, src: 'ASSUMED', note: 'v2: rotation stabiliser, stiff root, magnetic tip breakaway, rate-sensitive lateral fuse, stitch trim; v3: + translation stabiliser (tip follows a low-passed pack path), commandable azimuth, lighter 360 module' },
  { id: 'elev3', zh: 'v3 杆仰角', en: 'v3 boom elevation above horizontal', unit: '°', v: 25, min: 10, max: 50, step: 1, src: 'ASSUMED', note: 'lower than v1/v2: with calibrated 45–50° lean a high camera looks down the inclined body (foreshortening)' },
  { id: 'L3', zh: 'v3 展开长度', en: 'v3 deployed length', unit: 'm', v: 1.4, min: 1.0, max: 2.2, step: 0.05, src: 'ASSUMED', note: 'shorter: stiffer, less lever for the actuator; closer camera' },
  { id: 'zeta3', zh: 'v3 根部阻尼比', en: 'v3 root damping ratio', unit: '-', v: 0.3, min: 0.01, max: 0.6, step: 0.01, src: 'ASSUMED', note: 'larger elastomer damper' },
  { id: 'stab3Noise', zh: 'v3 相对位置融合误差（0.5 Hz 带内 RMS）', en: 'v3 relative-position fusion error (0.5 Hz band, RMS)', unit: 'mm', v: 2, min: 0, max: 10, step: 0.5, src: 'ASSUMED', note: 'attitude-error gravity leakage dominates' },
  { id: 'stab3Mode', zh: 'v3 稳定目标（0=相对骨盆，1=惯性）', en: 'v3 stabilisation target (0 = relative to pelvis, 1 = inertial)', unit: '-', v: 0, min: 0, max: 1, step: 1, src: 'ASSUMED', note: '1 = the coordinator hypothesis (inertially steady tip); falsified for LOS jitter, see results.json' },
  { id: 'stab3Range', zh: 'v3 稳定行程（每轴，软限幅）', en: 'v3 stabilisation range (per axis, soft limit)', unit: '°', v: 25, min: 2, max: 25, step: 1, src: 'ASSUMED', note: 'azimuth command is added on top' },
  { id: 'stab3Fc', zh: 'v3 稳定高通截止', en: 'v3 stabiliser high-pass corner', unit: 'Hz', v: 0.3, min: 0.2, max: 1.5, step: 0.05, src: 'ASSUMED' },
  { id: 'stab3Fb', zh: 'v3 杆端 IMU 弹性反馈增益', en: 'v3 tip-IMU elastic feedback gain', unit: '-', v: 0, min: 0, max: 2, step: 0.1, src: 'ASSUMED', note: 'spillover study' },
  { id: 'stabTmax3', zh: 'v3 稳定器峰值力矩', en: 'v3 actuator peak torque', unit: 'N·m', v: 12, min: 4, max: 30, step: 1, src: 'ASSUMED' },
  { id: 'mCam3', zh: 'v3 360 相机模块质量', en: 'v3 360 camera module mass', unit: 'kg', v: 0.13, min: 0.08, max: 0.25, step: 0.005, src: 'ASSUMED', note: 'lighter 360 module (coordinator suggestion ~120 g)' },
  { id: 'azSide', zh: 'v3 指令侧视方位', en: 'v3 commanded side-view azimuth', unit: '°', v: 45, min: 0, max: 60, step: 1, src: 'ASSUMED' },
  { id: 'tapes', zh: 'v2 卷带根数（2 或 3）', en: 'v2 number of tapes (2 or 3)', unit: '-', v: 2, min: 2, max: 3, step: 1, src: 'ASSUMED', note: '3 = triangular truss with one tape off the stitch plane (tested, rejected: visible over the rider)' },
  { id: 'latSpread', zh: 'v2 第三卷带侧向间距（根部）', en: 'v2 third-tape lateral offset at the root', unit: 'm', v: 0.05, min: 0, max: 0.12, step: 0.005, src: 'ASSUMED', note: 'leaves the stitch plane → can show over the rider' },
  { id: 'kRoot2', zh: 'v2 根部安装刚度（两轴）', en: 'v2 root mount stiffness (both axes)', unit: 'N·m/rad', v: 2500, min: 500, max: 10000, step: 100, src: 'ASSUMED' },
  { id: 'foldLat2', zh: 'v2 侧向折叠力矩（慢加载）', en: 'v2 lateral fold moment (slow loading)', unit: 'N·m', v: 35, min: 10, max: 60, step: 1, src: 'ASSUMED', note: 'drops by up to 30 % at impact loading rates' },
  { id: 'foldLat3', zh: 'v3 侧向折叠力矩（慢加载）', en: 'v3 lateral fold moment (slow loading)', unit: 'N·m', v: 42, min: 10, max: 60, step: 1, src: 'ASSUMED', note: 'drops by up to 30 % at impact loading rates' },
  { id: 'magnetN', zh: 'v2 磁吸杆端脱开力', en: 'v2 magnetic tip breakaway force', unit: 'N', v: 35, min: 10, max: 100, step: 1, src: 'ASSUMED' },
  { id: 'stab', zh: 'v2 根部主动稳定器开关', en: 'v2 active root stabiliser on', unit: '-', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'stabTmax', zh: '稳定器峰值力矩', en: 'Stabiliser peak torque', unit: 'N·m', v: 10, min: 2, max: 30, step: 1, src: 'ASSUMED' },
  { id: 'stabBw', zh: '稳定器伺服带宽', en: 'Stabiliser servo bandwidth', unit: 'Hz', v: 10, min: 1, max: 20, step: 0.5, src: 'ASSUMED' },
  { id: 'stabRate', zh: '稳定器最大角速度', en: 'Stabiliser max rate', unit: 'rad/s', v: 4, min: 0.5, max: 10, step: 0.5, src: 'ASSUMED' },
  { id: 'stabLag', zh: 'IMU 滤波/延迟', en: 'IMU lag', unit: 'ms', v: 8, min: 1, max: 40, step: 1, src: 'ASSUMED' },
  { id: 'stabHpRoll', zh: '稳定器侧倾高通截止（二阶）', en: 'Stabiliser roll high-pass corner (2nd order)', unit: 'Hz', v: 1.2, min: 0.2, max: 3, step: 0.05, src: 'ASSUMED' },
  { id: 'stabHp', zh: '稳定器俯仰高通截止（二阶）', en: 'Stabiliser pitch high-pass corner (2nd order)', unit: 'Hz', v: 0.3, min: 0.2, max: 2, step: 0.05, src: 'ASSUMED' },
  { id: 'stabKm', zh: '电机常数（含减速）', en: 'Motor constant (geared)', unit: 'N·m/√W', v: 3.0, min: 0.3, max: 8, step: 0.1, src: 'ASSUMED' },
  { id: 'stitchTrim', zh: '拼缝面偏航微调（0/1）', en: 'v2 stitch-plane yaw trim (0/1)', unit: '-', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED' },
  { id: 'L', zh: '展开长度', en: 'Deployed length', unit: 'm', v: 1.6, min: 1.2, max: 2.4, step: 0.05, src: 'ASSUMED', note: 'concept range 1.6–2.2 m; 1.6 chosen for lateral stiffness (see results.json sweep)' },
  { id: 'elev', zh: '杆仰角（标准蹲姿下相对水平）', en: 'Boom elevation above horizontal (nominal stance)', unit: '°', v: 35, min: 20, max: 60, step: 1, src: 'ASSUMED', note: 'calc_boom.py ALPHA 30°; torso pitch 20° at crouch 0.4' },
  { id: 'tapeD', zh: '卷带截面厚度（垂直拼缝面）', en: 'Tape section depth across the stitch plane', unit: 'mm', v: 20, min: 8, max: 28, step: 1, src: 'ASSUMED', note: 'calc_boom.py CTM 50×16 mm; 20 mm chosen (stiffer, 5 mm slab margin)' },
  { id: 'tapeT', zh: '卷带壁厚', en: 'Tape laminate thickness', unit: 'mm', v: 0.6, min: 0.2, max: 0.8, step: 0.05, src: 'ASSUMED', note: 'calc_boom.py used 0.3 mm' },
  { id: 'Eeff', zh: '层合板等效模量', en: 'Laminate effective modulus', unit: 'GPa', v: 60, min: 30, max: 120, step: 5, src: 'ASSUMED', note: 'calc_boom.py E_eff 60 GPa' },
  { id: 'spread', zh: 'V 形根部间距（拼缝面内）', en: 'V root spread (in the stitch plane)', unit: 'm', v: 0.12, min: 0.03, max: 0.25, step: 0.01, src: 'ASSUMED' },
  { id: 'etaTruss', zh: 'V 桁架效率折减', en: 'V-truss efficiency knock-down', unit: '-', v: 0.1, min: 0.01, max: 1, step: 0.01, src: 'ASSUMED', note: 'node, reel exit and shear-lag compliance' },
  { id: 'kRootSag', zh: '根部安装刚度（俯仰）', en: 'Root mount stiffness (pitch)', unit: 'N·m/rad', v: 1500, min: 200, max: 6000, step: 50, src: 'ASSUMED', note: 'pack frame + elastomer isolator' },
  { id: 'kRootLat', zh: '根部安装刚度（侧向）', en: 'Root mount stiffness (lateral)', unit: 'N·m/rad', v: 1200, min: 200, max: 6000, step: 50, src: 'ASSUMED' },
  { id: 'zeta', zh: '根部阻尼比', en: 'Root damping ratio ζ', unit: '-', v: 0.15, min: 0.01, max: 0.5, step: 0.01, src: 'ASSUMED', note: 'calc_boom.py ZETA_DAMPED design target' },
  { id: 'mCam', zh: '360 相机质量', en: '360 camera mass', unit: 'kg', v: 0.19, min: 0.12, max: 0.3, step: 0.005, src: 'LIT', note: 'Insta360 X4/X5 class ≈ 0.18–0.20 kg' },
  { id: 'mHw', zh: '根部硬件质量（卷筒/电机/阻尼/腰带框架）', en: 'Root hardware mass (reels, motor, damper, belt frame)', unit: 'kg', v: 0.6, min: 0.3, max: 1.5, step: 0.05, src: 'ASSUMED' },
  { id: 'foldPos', zh: '折叠力矩（向上/朝头）', en: 'Fold moment, upward sense', unit: 'N·m', v: 25, min: 5, max: 60, step: 1, src: 'ASSUMED', note: 'BODY-02: 20–40 N·m assumed; must be measured' },
  { id: 'foldNeg', zh: '折叠力矩（向下）', en: 'Fold moment, downward sense', unit: 'N·m', v: 45, min: 10, max: 80, step: 1, src: 'ASSUMED' },
  { id: 'foldLat', zh: '折叠力矩（侧向）', en: 'Fold moment, lateral', unit: 'N·m', v: 25, min: 5, max: 60, step: 1, src: 'ASSUMED' },
  { id: 'foldRes', zh: '折叠残余力矩比', en: 'Fold residual / peak moment', unit: '-', v: 0.12, min: 0.03, max: 0.4, step: 0.01, src: 'ASSUMED', note: 'tape-spring plateau (Seffen & Pellegrino)' },
  { id: 'baseline', zh: '镜头基线（拼缝盲区宽）', en: 'Lens baseline (stitch blind slab)', unit: 'mm', v: 30, min: 15, max: 50, step: 1, src: 'ASSUMED', note: 'calc_imaging.py LENS_BASELINE' },
  { id: 'mountErr', zh: '相机安装滚转误差', en: 'Camera mount roll error', unit: '°', v: 0.1, min: 0, max: 1, step: 0.05, src: 'ASSUMED' },
  { id: 'equiW', zh: '等距柱状宽度', en: 'Equirect width', unit: 'px', v: 5760, min: 3840, max: 7680, step: 1920, src: 'LIT', note: '5.7K' },
  { id: 'cropV', zh: '重构图垂直视场', en: 'Reframe vertical FOV', unit: '°', v: 75, min: 40, max: 110, step: 1, src: 'ASSUMED' },
  { id: 'eisResid', zh: '电子防抖残余比例', en: 'EIS residual rotation fraction', unit: '-', v: 0.05, min: 0, max: 0.3, step: 0.01, src: 'ASSUMED' },
  { id: 'eisBw', zh: '电子防抖带宽', en: 'EIS bandwidth', unit: 'Hz', v: 20, min: 5, max: 60, step: 1, src: 'ASSUMED' },
  { id: 'angul', zh: '上身倾斜/转弯倾角（反倾）', en: 'Upper-body / turn inclination (angulation)', unit: '-', v: 0.5, min: 0.2, max: 1, step: 0.05, src: 'ASSUMED' },
  { id: 'trunkBw', zh: '躯干偏航跟随带宽', en: 'Trunk yaw bandwidth', unit: 'Hz', v: 2.5, min: 0.5, max: 8, step: 0.1, src: 'ASSUMED' },
  { id: 'trunkModel', zh: '躯干运动来源（0=内置，1=共享标定 trunk.js）', en: 'Trunk motion source (0 = internal, 1 = shared calibrated trunk.js)', unit: '-', v: 1, min: 0, max: 1, step: 1, src: 'ASSUMED', note: 'falls back to internal if trunkAt is not available' },
  { id: 'torsoYaw', zh: '躯干偏航跟随比例（反向转体）', en: 'Torso yaw / heading (counter-rotation)', unit: '-', v: 0.7, min: 0.3, max: 1, step: 0.05, src: 'ASSUMED' },
  { id: 'rough', zh: '雪面粗糙度（髋部加速度 RMS @12 m/s）', en: 'Snow roughness (hip accel RMS @12 m/s)', unit: 'm/s²', v: 1.2, min: 0, max: 5, step: 0.1, src: 'ASSUMED', note: '1–30 Hz deterministic spectrum' },
  { id: 'deployRate', zh: '卷带展开速度', en: 'Tape pay-out speed', unit: 'm/s', v: 0.8, min: 0.3, max: 1.5, step: 0.05, src: 'ASSUMED', note: 'BODY-02 0.7–1 m/s' },
  { id: 'liftDelay', zh: '静止自动收回延时', en: 'Standstill auto-retract delay', unit: 's', v: 6, min: 2, max: 20, step: 1, src: 'ASSUMED' },
];

const T = (zh, en) => ({ zh, en });
const SCEN = [
  { id: 'nominal', ...T('标准：12 m/s 大弯，微风', 'Nominal: 12 m/s carving, light wind'),
    expect: T('按统一判据（common/criteria.js）；v3 在 8–13 s、16–21 s 按指令摆到 ±45° 侧视（azRange）。失败：任一门槛指标未过、折叠误触发或杆与骑手间隙 < 0。', 'Harmonised criteria (common/criteria.js); v3 also swings to a ±45° side view on command at 8–13 s and 16–21 s (azRange). Fail: any gating metric, a false fold, or boom–rider clearance < 0.'),
    skier: { ...(SK.SKIER_PRESETS?.recreationalCarve || {}), duration: 24 }, wind: { mean: [1.5, 1.0, 0], intensity: 0.2, seed: 3 }, expectFold: false, az: [[8, 13, 1], [16, 21, -1]] },
  { id: 'nominal_v2', ...T('标准（v2 对照）', 'Nominal, design v2 (comparison)'),
    expect: T('与 nominal 相同工况，使用 v2 设计（仅旋转稳定，无指令方位）。', 'Same as nominal with the v2 design (rotation-only stabiliser, no commandable azimuth).'),
    skier: { ...(SK.SKIER_PRESETS?.recreationalCarve || {}), duration: 24 }, wind: { mean: [1.5, 1.0, 0], intensity: 0.2, seed: 3 }, expectFold: false, design: 2, az: [[8, 13, 1], [16, 21, -1]] },
  { id: 'nominal_v1', ...T('标准（初版 v1 对照）', 'Nominal, design v1 (comparison)'),
    expect: T('与 nominal 相同工况，使用初版设计（无稳定器、两卷带、无磁吸脱开）。', 'Same as nominal with the v1 design (no stabiliser, two tapes, no magnetic breakaway).'),
    skier: { ...(SK.SKIER_PRESETS?.recreationalCarve || {}), duration: 24 }, wind: { mean: [1.5, 1.0, 0], intensity: 0.2, seed: 3 }, expectFold: false, design: 1, az: [[8, 13, 1], [16, 21, -1]] },
  { id: 'short', ...T('短弯（shortTurns 预设，1.04 s/弯）', 'Short turns (shortTurns preset, 1.04 s per turn)'),
    expect: T('考察躯干快速偏航/侧倾时杆的侧向响应与额外偏航力矩；失败：额外偏航力矩 > 10 N·m 或折叠误触发。', 'Tests lateral response and extra yaw torque under fast torso yaw/roll; fail: extra yaw torque > 10 N·m or a false fold.'),
    skier: { ...(SK.SKIER_PRESETS?.shortTurns || {}), duration: 20 }, wind: { mean: [1, 0.5, 0], intensity: 0.2, seed: 4 }, expectFold: false },
  { id: 'moguls', ...T('猫跳（moguls 预设 + trunk.js 猫跳地形）', 'Moguls (moguls preset + trunk.js moguls terrain)'),
    expect: T('1–3 Hz 0.5 g 竖向冲击 + 1–30 Hz 粗糙度；失败：杆端平移 RMS > 30 mm、抖动 > 5°/s 或折叠误触发。', '1–3 Hz 0.5 g vertical bumps + 1–30 Hz roughness; fail: tip translation RMS > 30 mm, jitter > 5°/s or a false fold.'),
    skier: { ...(SK.SKIER_PRESETS?.moguls || {}), duration: 20 }, rough: 2.0, moguls: { span: [3, 18], A: 0.5 * 9.81, lambda: 3.5 }, wind: { mean: [1, 0, 0], intensity: 0.2, seed: 5 }, expectFold: false },
  { id: 'fast', ...T('高速 18 m/s', 'High speed 18 m/s'),
    expect: T('气动阻力、雪面激励随速度增大；失败：抖动 > 5°/s、根部持续力矩 > 25 N·m 或折叠误触发；动能单独评估。', 'Aero drag and snow excitation grow with speed; fail: jitter > 5°/s, sustained root moment > 25 N·m or a false fold; kinetic energy reported.'),
    skier: { ...(SK.SKIER_PRESETS?.recreationalCarve || {}), duration: 20, vTarget: 18, v0: 18, turnPeriod: 4.5, turnAmpDeg: 25 }, wind: { mean: [2, 1, 0], intensity: 0.2, seed: 6 }, expectFold: false },
  { id: 'gust', ...T('阵风侧风 7 + 8 m/s', 'Gusty crosswind 7 + 8 m/s'),
    expect: T('侧风吹宽面使杆侧弯偏离拼缝面；失败：隐形杆露出 > 5% 时间或侧向折叠误触发。', 'Crosswind on the broad tape faces bends the boom out of the stitch plane; fail: stick visible > 5 % of time or a lateral false fold.'),
    skier: { ...(SK.SKIER_PRESETS?.recreationalCarve || {}), duration: 20 }, wind: { mean: [0, -7, 0], intensity: 0.25, seed: 7, gustAt: 8, gust: [0, -8, 0], gustHold: 2.5 }, expectFold: false },
  { id: 'fallBack', ...T('后仰摔倒（折叠保险）', 'Backward fall (fold fuse)'),
    expect: T('杆尖先触雪，根部卷带须在 ~25 N·m 折叠，限制传到腰背的力矩；失败：根部峰值力矩 > 40 N·m 或身体力 > 150 N；同时给出无折叠对照。', 'The tip hits the snow first; the root tape must fold at ~25 N·m and limit the moment into the back; fail: peak root moment > 40 N·m or body force > 150 N; a no-fold ablation is reported.'),
    skier: { ...(SK.SKIER_PRESETS?.recreationalCarve || {}), duration: 14, fallAt: 7 }, fall: { t0: 7, dir: 'back' }, wind: { mean: [1, 0, 0], intensity: 0.2, seed: 8 }, expectFold: true, ablation: true },
  { id: 'fallSide', ...T('侧向摔倒', 'Sideways fall'),
    expect: T('向左侧倒，杆侧向触雪，须侧向折叠；失败：根部峰值力矩 > 40 N·m。', 'Fall to the left; the boom strikes the snow sideways and must fold laterally; fail: peak root moment > 40 N·m.'),
    skier: { ...(SK.SKIER_PRESETS?.recreationalCarve || {}), duration: 14, vTarget: 11, v0: 11, fallAt: 7 }, fall: { t0: 7, dir: 'side', side: 1 }, wind: { mean: [1, 0, 0], intensity: 0.2, seed: 9 }, expectFold: true, ablation: true },
  { id: 'snag', ...T('杆端勾挂树枝', 'Branch snag at the tip'),
    expect: T('8 m/s 时杆端勾住树枝（向后+侧向拉），须折叠脱开；失败：根部峰值力矩 > 40 N·m 或身体力 > 150 N。', 'At 8 m/s the tip hooks a branch (backward + lateral pull) and must fold free; fail: peak root moment > 40 N·m or body force (50 ms, dynamic) > 40 N.'),
    skier: { ...(SK.SKIER_PRESETS?.recreationalCarve || {}), duration: 14, vTarget: 8, v0: 8 }, snag: { t: 6.0, k: 300, slip: 200, maxStretch: 0.8 }, wind: { mean: [1, 0, 0], intensity: 0.2, seed: 10 }, expectFold: true },
  { id: 'lift', ...T('停下排队 → 自动收回 → 上缆车', 'Stop → auto-retract → chairlift'),
    expect: T('停止 6 s 后自动收回，须在上缆车（停止后 12 s）前完全收纳；失败：上缆车时杆仍伸出。', 'After 6 s standstill the boom auto-retracts and must be stowed before boarding (12 s after stopping); fail: boom still out at boarding.'),
    skier: { ...(SK.SKIER_PRESETS?.recreationalCarve || {}), duration: 24, vTarget: 11, v0: 11, stopAt: 9 }, liftAt: 22, wind: { mean: [1, 0, 0], intensity: 0.2, seed: 11 }, expectFold: false },
  { id: 'cycle', ...T('原地展开/收回循环', 'Deploy / retract cycle (standing)'),
    expect: T('按键展开—收回—再展开，测准备时间与展开冲击；失败：准备+收纳 > 60 s 或展开时根部力矩 > 25 N·m。', 'Press-deploy, retract, re-deploy: measures setup time and deployment transients; fail: setup + stow > 60 s or root moment during deployment > 25 N·m.'),
    skier: { duration: 16, v0: 0, stopAt: 0, style: 'straight' }, startDeployed: false, commands: [{ t: 1, cmd: 'deploy' }, { t: 7, cmd: 'retract' }, { t: 10.5, cmd: 'deploy' }], wind: { mean: [1, 0, 0], intensity: 0.2, seed: 12 }, expectFold: false, standing: true },
  { id: 'damperFail', ...T('故障：根部阻尼失效（猫跳）', 'Failure: root damper lost (moguls)'),
    expect: T('阻尼器失效 ζ = 0.01 时的猫跳工况；失败：杆端平移 RMS > 30 mm 或抖动 > 5°/s。', 'Moguls with the damper failed (ζ = 0.01); fail: tip translation RMS > 30 mm or jitter > 5°/s.'),
    skier: { ...(SK.SKIER_PRESETS?.moguls || {}), duration: 20 }, rough: 2.0, moguls: { span: [3, 18], A: 0.5 * 9.81, lambda: 3.5 }, zeta: 0.01, wind: { mean: [1, 0, 0], intensity: 0.2, seed: 5 }, expectFold: false },
];

const I_YAW_REF = 1.5 + 0.9;          // whole-body yaw incl. skis/boots (audit; de Leva 1996)
const I_ROLL_FEET = 12.5 + 80 * 0.95 ** 2; // centroidal roll + parallel axis to the feet line ≈ 85 kg·m²

// p90 user standstill per run (press → filming-ready, press → stowed, +2 s to reach the button)
// over a 0–9 m/s crosswind sweep (end points simulated); a fold during deployment costs a 5 s retry (ASSUMED)
const setupCache = new Map();
function setupP90(p) {
  const key = JSON.stringify(p);
  if (setupCache.has(key)) return setupCache.get(key);
  const list = [];
  for (const w of [9]) { // p90 of the 0–9 m/s sweep is set by its windy end (9 m/s simulated; calm = same deploy time without folds)
    const sk = simulateSkier({ duration: 9, v0: 0, stopAt: 0, style: 'straight' });
    const raw = runBoom(p, { skFn: (t) => skierAt(sk, t), tanS: sk.tanS, duration: 9, wind: { mean: [0, w, 0], intensity: 0.25, seed: 31 }, rough: 0, commands: [{ t: 0.5, cmd: 'deploy' }, { t: 5.5, cmd: 'retract' }], startDeployed: false });
    const ev = (ty) => raw.events.find((e) => e.type === ty);
    const tl = ev('locked'), ts = ev('stowed');
    const folds = raw.events.filter((e) => e.type === 'fold').length;
    list.push((tl ? tl.t - 0.5 : 8) + (ts ? ts.t - 5.5 : 4) + 2 + 5 * folds);
  }
  const s2 = [...list].sort((a, b) => a - b);
  const r = { list, p90: s2[Math.min(s2.length - 1, Math.ceil(0.9 * s2.length) - 1)] };
  setupCache.set(key, r);
  return r;
}

// cumulative filming per charge at −10 °C: 360 camera 135 min (LIT, 5.7K30) × 0.6 cold × 0.9 reserve;
// v2 stabiliser on its own 21700 cell (18 Wh × 0.7 cold × 0.9) at the nominal mean motor power + 0.5 W electronics
function endurance(p, d, motor) {
  const cam = 135 * 0.6 * 0.9;
  if (!d.v2 || !motor.on) return { min: cam, noteZh: '相机电池，−10 °C', noteEn: 'camera battery, −10 °C' };
  const P = motor.powerMean + 0.5;
  const stab = (18 * 0.7 * 0.9 * 60) / P;
  return { min: Math.min(cam, stab), noteZh: `相机 ${cam.toFixed(0)} min / 稳定器 ${stab.toFixed(0)} min（${P.toFixed(1)} W）`, noteEn: `camera ${cam.toFixed(0)} min / stabiliser ${stab.toFixed(0)} min (${P.toFixed(1)} W)` };
}

const defaults = () => Object.fromEntries(PARAMS.map((p) => [p.id, p.v]));
const full = (params) => ({ ...defaults(), ...(params || {}) });

// Shared calibrated trunk model (common/trunk.js, makeTrunk): trunk pitch/roll/yaw relative to
// the whole-body frame and vertical trunk acceleration (roughness, moguls). p.trunkModel = 1 (default)
// uses it; 0 = the internal kinematic torso model of iterations 1–2 (angul, torsoYaw, rough, moguls).
function sharedTrunk(p, sc, sk, pre, extra = {}) {
  if (p.trunkModel !== 1 || typeof TR.makeTrunk !== 'function') return { trunk: null, trunkZ: null };
  const opts = { terrain: sc.moguls ? 'moguls' : sc.terrain || 'groomed', seed: 17, ...extra };
  if (sc.moguls) opts.moguls = [sc.moguls.span[0] + pre, sc.moguls.span[1] + pre];
  if (sc.trunkParams) opts.params = sc.trunkParams;
  const f = TR.makeTrunk(sk, opts);
  return { trunk: (t) => { const r = f(t + pre); return { pitch: r.pitch, roll: r.roll, yaw: r.yaw, shared: true }; }, trunkZ: (t) => f(t + pre).zAcc };
}

// The shared skier model starts turning abruptly at t = 0; scenarios that start in
// motion run PRE seconds of pre-roll so the boom does not see that start-up jerk.
const PRE = 3;
function cfgFor(p, sc) {
  const pre = sc.standing ? 0 : PRE;
  const o = { ...sc.skier, duration: sc.skier.duration + pre };
  if (o.fallAt != null) o.fallAt += pre;
  if (o.stopAt != null) o.stopAt += pre;
  const sk = simulateSkier(o);
  const x0 = skierAt(sk, pre).pos;
  return {
    sk,
    cfg: {
      skFn: (t) => { const s = skierAt(sk, t + pre); s.pos = [s.pos[0] - x0[0], s.pos[1], s.pos[2] - x0[2]]; return s; },
      tanS: sk.tanS, duration: sc.skier.duration,
      // switchable trunk-motion input: p.trunkModel = 1 uses the shared calibrated trunkAt() when it exists
      // (expected to return rad deviations {pitch, roll, yaw}); otherwise the internal kinematic torso model
      ...sharedTrunk(p, sc, sk, pre),
      wind: sc.wind ? { ...sc.wind } : null, rough: sc.rough ?? p.rough,
      moguls: sc.moguls ? { ...sc.moguls, span: [...sc.moguls.span] } : null,
      fall: sc.fall ? { ...sc.fall } : null, snag: sc.snag ? { ...sc.snag } : null,
      commands: (sc.commands || []).map((c) => ({ ...c })), startDeployed: sc.startDeployed !== false,
      liftAt: sc.liftAt ?? null, zeta: sc.zeta ?? null,
      // commanded side view: smooth (raised-cosine) 2.5 s transitions, held in between
      azCmd: sc.az ? (t) => { for (const [a, b, side] of sc.az) { const w = Math.min(1, Math.max(0, (t - a) / 2.5)) * Math.min(1, Math.max(0, (b - t) / 2.5)); if (w > 0) return (side * p.azSide * Math.PI / 180) * (0.5 - 0.5 * Math.cos(Math.PI * w)); } return 0; } : null,
    },
  };
}

// ---------------------------------------------------------------- results
function buildResult(p, sc, raw, cfg, extra = {}) {
  const fa = footageAnalysis(raw, p);
  const R = makeResult({ conceptId: 'boom360', scenarioId: sc.id, modelVersion: VERSION, duration: cfg.duration, sampleDt: SDT });
  const n = Math.min(R.n, raw.ns);
  const d = raw.design;
  const C = (name, src, f = (x) => x) => { const c = R.col(name); for (let i = 0; i < n; i++) c[i] = f(src[i], i); return c; };
  C('defSag', raw.defSag, (v, i) => (raw.stateCode[i] === 0 ? NaN : v));
  C('defLat', raw.defLat, (v, i) => (raw.stateCode[i] === 0 ? NaN : v));
  C('Mpitch', raw.M, (v, i) => raw.M[3 * i]);
  C('Myaw', raw.M, (v, i) => raw.M[3 * i + 1]);
  C('Mroll', raw.M, (v, i) => raw.M[3 * i + 2]);
  C('Mroot', raw.Mmag);
  C('Fbody', raw.Fbody);
  C('jitter', fa.jit);
  C('jitterBoom', fa.jitBoom);
  C('subjectPx', fa.px);
  C('stickPx', raw.stickPx, (v, i) => (fa.filming[i] ? v : NaN));
  C('stickMm', raw.stickMm, (v, i) => (raw.stateCode[i] === 3 ? v : NaN));
  C('len', raw.len);
  C('fold', raw.foldS, (v, i) => (raw.foldS[i] !== 0 || raw.foldL[i] !== 0 ? 1 : 0));
  C('speed', raw.speed);
  C('tipTrans', fa.transMm);
  C('ke', raw.ke);
  C('contact', raw.contactF);
  C('az', fa.az);
  C('motorTau', raw.motorTau);
  C('stabPitch', raw.thM, (v, i) => (raw.thM[2 * i] * 180) / Math.PI);
  C('stabLat', raw.thM, (v, i) => (raw.thM[2 * i + 1] * 180) / Math.PI);
  C('stickSubj', raw.stickSubjPx, (v, i) => (fa.filming[i] ? v : NaN));
  R.validUntil = raw.validUntil;
  R.events.push(...raw.events);
  if (cfg.fall) R.event(cfg.fall.t0, 'fallScript', 'info', '摔倒运动学为脚本（绕脚点后仰/侧倒，0.7 s，ASSUMED）', 'Rider fall kinematics are scripted (rotation about the feet, 0.7 s, ASSUMED)');
  R.events.sort((a, b) => a.t - b.t);

  // ---- metrics
  const film = fa.filming;
  let nf = 0; for (let i = 0; i < n; i++) nf += film[i];
  const pass = (v, ok) => (Number.isFinite(v) ? ok : null);
  const pxs = []; for (let i = 0; i < n; i++) if (film[i] && Number.isFinite(fa.px[i])) pxs.push(fa.px[i]);
  const st = stats(pxs);
  const pxMed = pxs.length ? [...pxs].sort((a, b) => a - b)[Math.floor(pxs.length / 2)] : NaN;
  const azs = stats(Array.from(fa.az).filter((v, i) => film[i]));
  const md = modes(d);
  const tipTrans = rms(fa.transMm, film);
  const shake = rms(fa.shakeDeg, film);
  let vis = 0; for (let i = 0; i < n; i++) if (film[i] && raw.stickSubjPx[i] >= 1) vis++;
  const stickVis = nf ? (100 * vis) / nf : NaN;
  const stickPxMax = maxOf(raw.stickPx, film);
  const stickMmMax = maxOf(raw.stickMm, film);
  const deployedMask = Uint8Array.from(raw.stateCode, (s) => (s !== 0 ? 1 : 0));
  const Msus = movingMeanMax(raw.Mmag, Math.round(1 / SDT), deployedMask);
  const Mpk = raw.peaks.Mmag;
  // added inertia (deployed rest shape at t = 0 or first deployed sample)
  let i0 = 0; while (i0 < n - 1 && raw.stateCode[i0] !== 3) i0++;
  const inert = (() => {
    const U = [raw.frame[9 * i0 + 6], raw.frame[9 * i0 + 7], raw.frame[9 * i0 + 8]];
    const Fv = [raw.frame[9 * i0], raw.frame[9 * i0 + 1], raw.frame[9 * i0 + 2]];
    const pel = [raw.pelvis[3 * i0], raw.pelvis[3 * i0 + 1], raw.pelvis[3 * i0 + 2]];
    const ft = [raw.feet[3 * i0], raw.feet[3 * i0 + 1], raw.feet[3 * i0 + 2]];
    const root = [raw.rootW[3 * i0], raw.rootW[3 * i0 + 1], raw.rootW[3 * i0 + 2]];
    const Lb = [raw.frame[9 * i0 + 3], raw.frame[9 * i0 + 4], raw.frame[9 * i0 + 5]];
    const B = Fv.map((x) => -x);
    const NODES = 3 * (NSEG + 1);
    let Iy = 0, Ir = 0;
    const mseg = d.mTapes / NSEG;
    const add = (pt, m) => {
      // yaw about the vertical axis through the pelvis (comparable to whole-body yaw 1–2 kg·m²)
      const r = [pt[0] - pel[0], pt[1] - pel[1]];
      Iy += m * (r[0] ** 2 + r[1] ** 2);
      const s = [pt[0] - ft[0], pt[1] - ft[1], pt[2] - ft[2]];
      const hf = [Fv[0], Fv[1], 0]; const hl = Math.hypot(hf[0], hf[1]) || 1;
      const sf = (s[0] * hf[0] + s[1] * hf[1]) / hl;
      Ir += m * (s[0] ** 2 + s[1] ** 2 + s[2] ** 2 - sf * sf);
    };
    for (let k = 1; k <= NSEG; k++) {
      const o = i0 * NODES + 3 * k;
      const x = raw.nodesB[o], y = raw.nodesB[o + 1], z = raw.nodesB[o + 2];
      const pt = [0, 1, 2].map((c) => root[c] + B[c] * x + Lb[c] * y + U[c] * z);
      add(pt, mseg * (k === NSEG ? 0.5 : 1) + (k === NSEG ? d.mTip : 0));
    }
    add(root, p.mHw * 0.5 + d.mStab + mseg * 0.5); // reels/damper/stabiliser at the root; belt frame lower (half the hardware)
    add(pel, p.mHw * 0.5);
    return { Iy, Ir };
  })();
  // extra yaw torque vs body yaw torque
  const MyawPk = maxOf(Array.from(raw.M).filter((v, k) => k % 3 === 1).map(Math.abs), deployedMask);
  const yawAccPk = maxOf(Array.from(raw.yawBodyAcc).map(Math.abs), deployedMask);
  const dragMean = (() => { let s = 0, k = 0; for (let i = 0; i < n; i++) if (film[i]) { s += raw.drag[i]; k++; } return k ? s / k : NaN; })();
  const vMean = (() => { let s = 0, k = 0; for (let i = 0; i < n; i++) if (film[i]) { s += raw.speed[i]; k++; } return k ? s / k : NaN; })();
  const skierDrag = 0.5 * RHO * SKIER_CDA * vMean * vMean;
  const persp = stats(Array.from(fa.persp).filter(Number.isFinite));
  const dMed = stats(Array.from(fa.dist).filter(Number.isFinite)).mean;
  const ppd = p.equiW / 360;
  const deployT = 0.6 + (d.L - STOW_LEN) / p.deployRate, stowT = (d.L - STOW_LEN) / (p.deployRate * 1.25) + 0.6;
  const userCmds = (cfg.commands || []).length;
  const ops = (cfg.startDeployed !== false ? 1 : 0) + (cfg.commands || []).filter((c) => c.cmd === 'deploy').length;
  const movingCmds = (cfg.commands || []).filter((c) => cfg.skFn(c.t).speed > 1).length;

  const M = (id, zh, en, value, unit, ok, czh, cen) => R.metric(id, zh, en, value, unit, ok, czh != null ? { zh: czh, en: cen } : null);
  // ---- harmonised standard metrics (common/criteria.js, audit 2026-10-18)
  const skiing = new Uint8Array(n);
  for (let i = 0; i < n; i++) skiing[i] = raw.speed[i] > 2 && raw.beta[i] < 0.05 && !raw.samples[i].fallen ? 1 : 0;
  let nSki = 0, good = 0;
  for (let i = 0; i < n; i++) if (skiing[i]) { nSki++; if (film[i] && fa.inF[i] && fa.px[i] >= 300 && raw.stickSubjPx[i] < 1) good++; }
  const availH = nSki ? (100 * good) / nSki : NaN;
  const jmask = Uint8Array.from(film, (f, i) => (f && skiing[i] ? 1 : 0));
  // delivered frame: the EIS residual rotation (eisResid·ω + content above the EIS bandwidth) is
  // integrated into the apparent line of sight, then the offline subject-tracking reframe (same
  // zero-phase τ = 0.15 s tracker as footageAnalysis) follows it; jitterHP = >1 Hz rate of the
  // subject relative to that crop
  const los = [], fwd = [];
  { const th = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      if (!jmask[i]) { th[0] = th[1] = th[2] = 0; }
      else for (let c = 0; c < 3; c++) th[c] += SDT * (p.eisResid * raw.wCam[3 * i + c] + raw.wCamHP[3 * i + c]);
      const u = [fa.u[3 * i], fa.u[3 * i + 1], fa.u[3 * i + 2]];
      const v = [u[0] + th[1] * u[2] - th[2] * u[1], u[1] + th[2] * u[0] - th[0] * u[2], u[2] + th[0] * u[1] - th[1] * u[0]];
      const l = Math.hypot(...v) || 1; los.push([v[0] / l, v[1] / l, v[2] / l]);
    }
    const a = SDT / (0.15 + SDT);
    for (let i = 0; i < n; i++) fwd.push([...los[i]]);
    for (let pass = 0; pass < 2; pass++) for (let k = 1; k < n; k++) {
      const i = pass === 0 ? k : n - 1 - k, j = pass === 0 ? i - 1 : i + 1;
      if (!jmask[i] || !jmask[j]) continue;
      for (let c = 0; c < 3; c++) fwd[i][c] = fwd[j][c] + a * (fwd[i][c] - fwd[j][c]);
    }
    for (const f of fwd) { const l = Math.hypot(...f) || 1; f[0] /= l; f[1] /= l; f[2] /= l; }
  }
  const jh = jitterHP(los, fwd, SDT, jmask);
  const jitterH = jh.rms;
  // body force: 50 ms moving mean of |F − static weight| while upright
  const mWorn = p.mHw + d.mStab + d.mTapes + d.mTip;
  const fdyn = new Float64Array(n);
  for (let i = 0; i < n; i++) fdyn[i] = Math.hypot(raw.Fv[3 * i], raw.Fv[3 * i + 1], raw.Fv[3 * i + 2] + mWorn * 9.81);
  const upright = Uint8Array.from(raw.beta, (b, i) => (b < 0.05 && !raw.samples[i].fallen ? 1 : 0));
  let fPk = 0; { const w = Math.max(1, Math.round(0.05 / SDT)); for (let i = 0; i + w <= n; i++) { let ok = 1, m = 0; for (let k = i; k < i + w; k++) { ok &= upright[k]; m += fdyn[k]; } if (ok) fPk = Math.max(fPk, m / w); } }
  const keR = maxOf(raw.keRider), keCam = maxOf(raw.keCam, deployedMask), reach = maxOf(raw.reach, deployedMask);
  const setup = setupP90(p);
  const endur = endurance(p, d, raw.motor);
  const azLP = (() => { const a = Array.from(fa.az).map((v, i) => (film[i] ? v : NaN)); const o = []; let y = null; for (const v of a) { if (!Number.isFinite(v)) { y = null; continue; } y = y == null ? v : y + (v - y) * (SDT / (0.8 + SDT)); o.push(y); } return stats(o); })();
  addStd(R, 'avail', availH, { zh: '滑行时间；隐形杆在主体上露出 ≥1 px 的帧不计', en: 'skiing time; frames with the stick ≥1 px over the subject excluded' });
  addStd(R, 'pxMed', pxMed);
  addStd(R, 'jitterRms', jitterH, { zh: 'EIS 残余并入视线后，相对重构图的 >1 Hz 角速度', en: '>1 Hz LOS rate relative to the reframe, EIS residual folded into the LOS' });
  M('jitterRotOnly', '仅 EIS 残余旋转（未高通，旧合成口径）', 'EIS residual rotation alone (no high-pass, audit quadrature term)', rms(fa.jitRot, jmask), '°/s', null, '信息项', 'informational');
  if (!d.v3) addStd(R, 'azRange', 0, { zh: `不可指令：身体锁定后视角；转弯摆动 ${(azLP.p95 - azLP.p05).toFixed(0)}° 不计`, en: `not commandable: body-locked rear view; turn wobble ${(azLP.p95 - azLP.p05).toFixed(0)}° not counted` });
  else if (cfg.azCmd) addStd(R, 'azRange', azLP.p95 - azLP.p05, { zh: `按指令 ±${p.azSide}° 侧视（0.2 Hz 低通方位 p5–p95）`, en: `commanded ±${p.azSide}° side view (0.2 Hz low-passed azimuth p5–p95)` });
  else addStd(R, 'azRange', 2 * p.azSide, { zh: `能力值（本工况未指令；在 nominal 中实际执行）`, en: `capability (not commanded in this scenario; exercised in nominal)` });
  const clr = maxOf(Array.from(raw.clear).map((v) => -v), deployedMask);
  M('clearance', '杆与骑手（头/肩/手/雪杖）最小间隙', 'Min boom clearance to the rider (head/shoulders/hands/poles)', -clr, 'm', -clr >= 0.05, '≥ 0.05 m（扣除 3 cm 衣物/余量）', '≥ 0.05 m (after 3 cm clothing margin)');
  addStd(R, 'addedMass', d.addedMass);
  addStd(R, 'bodyForcePeak', fPk, { zh: '本工况，直立时 50 ms 平均、扣除静重', en: 'this scenario, upright, 50 ms mean, static weight removed' });
  addStd(R, 'handsBusy', (100 * movingCmds) / Math.max(1e-9, nSki * SDT || cfg.duration));
  addStd(R, 'setupTime', setup.p90, { zh: `0–9 m/s 侧风 p90：${setup.list.map((v) => v.toFixed(1)).join('/')} s`, en: `p90 over 0–9 m/s crosswind: ${setup.list.map((v) => v.toFixed(1)).join('/')} s` });
  addStd(R, 'ops', ops);
  addStd(R, 'keMax', keR, { zh: `骑手系（相机+⅓卷带，杆端在骑手 1.5 m 内外缘：最远 ${reach.toFixed(2)} m）；相机对地动能 ${keCam.toFixed(0)} J 另列`, en: `rider frame (camera + ⅓ tapes; tip reach ${reach.toFixed(2)} m from the pelvis axis); camera KE vs snow ${keCam.toFixed(0)} J listed separately` });
  addStd(R, 'endurance', endur.min, { zh: endur.noteZh, en: endur.noteEn });
  M('keCamGround', '相机对地动能（撞击外人参考）', 'Camera KE vs snow (strike reference)', keCam, 'J', null, `信息项：杆端离骨盆 ${reach.toFixed(2)} m，处于 1.5 m 包络边缘`, `informational: tip ${reach.toFixed(2)} m from the pelvis, at the edge of the 1.5 m envelope`);
  M('jitterBoom', '杆致抖动（杆端平移视差 + EIS 残余）', 'Boom-induced jitter (tip parallax + EIS residual)', rms(fa.jitBoom, jmask), '°/s', null, '信息项（旧口径，无高通）', 'informational (old definition, no high-pass)');
  M('jitterOld', '旧口径抖动（无高通）', 'Jitter, v1 definition (no high-pass)', rms(fa.jit, jmask), '°/s', null, '信息项', 'informational');
  if (raw.motor.on) {
    M('stabTorquePeak', '稳定器峰值力矩', 'Stabiliser peak torque', raw.motor.torquePeak, 'N·m', raw.motor.torquePeak <= p.stabTmax + 1e-6 && raw.motor.slipTime < 0.05, `≤ ${p.stabTmax} N·m，回驱 ${raw.motor.slipTime.toFixed(2)} s`, `≤ ${p.stabTmax} N·m; back-driven ${raw.motor.slipTime.toFixed(2)} s`);
    M('stabPower', '稳定器平均功率', 'Stabiliser mean power', raw.motor.powerMean, 'W', raw.motor.powerMean <= 5, '≤ 5 W', '≤ 5 W');
  }
  M('f1Lat', '侧向一阶频率', 'Lateral 1st mode', md.lat[0], 'Hz', md.lat[0] >= 3, '≥ 3 Hz（BODY-02 否决判据）', '≥ 3 Hz (BODY-02 kill criterion)');
  M('f2Lat', '侧向二阶频率', 'Lateral 2nd mode', md.lat[1], 'Hz', null, '信息项', 'informational');
  M('f1Sag', '俯仰一阶频率', 'Sagittal 1st mode', md.sag[0], 'Hz', md.sag[0] >= 3, '≥ 3 Hz（避开 1–3 Hz 猫跳）', '≥ 3 Hz (clear of 1–3 Hz moguls)');
  M('f2Sag', '俯仰二阶频率', 'Sagittal 2nd mode', md.sag[1], 'Hz', null, '信息项', 'informational');
  M('tipTransRms', '杆端相对平移 RMS（>0.5 Hz）', 'Tip translation RMS (>0.5 Hz)', tipTrans, 'mm', pass(tipTrans, tipTrans <= 30), '≤ 30 mm（BODY-01/R02 否决判据）', '≤ 30 mm (BODY-01/R02 kill criterion)');
  M('shakeRms', '主体视差晃动 RMS', 'Subject parallax shake RMS', shake, '°', pass(shake, shake <= 0.8), '≤ 0.8°（BODY-01）', '≤ 0.8° (BODY-01)');
  M('stickVisible', '隐形杆在主体上露出', 'Stick visible over the subject', stickVis, '%', pass(stickVis, stickVis <= 5), '≤ 5%（在主体轮廓内露出 ≥1 px）', '≤ 5 % (≥1 px protrusion over the subject silhouette)');
  M('stickPxMax', '隐形杆最大露出', 'Max stick protrusion', stickPxMax, 'px', null, '信息项（5.7K 源像素）', 'informational (5.7K source px)');
  M('stickMmMax', '离拼缝面最大偏离（扣除盲区）', 'Max deviation beyond the blind slab', stickMmMax, 'mm', null, `>0 即露出；静态余量 ${d.margin.toFixed(1)} mm`, `>0 = outside the slab; static margin ${d.margin.toFixed(1)} mm`);
  M('rootMomentSus', '根部持续力矩（1 s 平均最大）', 'Sustained root moment (max 1 s mean)', Msus, 'N·m', Msus <= 25, '≤ 25 N·m（否决判据）', '≤ 25 N·m (kill criterion)');
  M('rootMomentPeak', '根部峰值力矩', 'Peak root moment', Mpk, 'N·m', Mpk <= 40, '≤ 40 N·m（ASSUMED 安全阈值）', '≤ 40 N·m (ASSUMED safety threshold)');
  M('rootForcePeak', '杆对根部峰值力', 'Peak boom force at the root', raw.peaks.Fboom, 'N', null, '信息项（不含背包硬件惯性）', 'informational (excl. pack hardware inertia)');
  M('yawInertiaPct', '附加偏航惯量', 'Added yaw inertia', (100 * inert.Iy) / I_YAW_REF, '%', (100 * inert.Iy) / I_YAW_REF <= 50, `≤ 50%（${inert.Iy.toFixed(2)} kg·m² vs 人体+雪板 2.4）`, `≤ 50 % (${inert.Iy.toFixed(2)} kg·m² vs body + skis 2.4)`);
  M('rollInertiaPct', '附加侧倾惯量（绕脚）', 'Added roll inertia (about feet)', (100 * inert.Ir) / I_ROLL_FEET, '%', (100 * inert.Ir) / I_ROLL_FEET <= 20, `≤ 20%（${inert.Ir.toFixed(2)} kg·m² vs 人体绕脚 ${I_ROLL_FEET.toFixed(0)}）`, `≤ 20 % (${inert.Ir.toFixed(2)} kg·m² vs body about the feet ${I_ROLL_FEET.toFixed(0)})`);
  const yawPct = yawAccPk > 0 ? (100 * MyawPk) / (I_YAW_REF * yawAccPk) : NaN;
  M('yawTorquePeak', '额外偏航力矩峰值', 'Extra yaw torque peak', MyawPk, 'N·m', pass(MyawPk, MyawPk <= 10), `≤ 10 N·m（ASSUMED）；为人体自身偏航力矩的 ${Number.isFinite(yawPct) ? yawPct.toFixed(0) : '—'}%`, `≤ 10 N·m (ASSUMED); ${Number.isFinite(yawPct) ? yawPct.toFixed(0) : '—'} % of the body's own yaw torque`);
  M('drag', '杆+相机平均阻力', 'Boom + camera mean drag', dragMean, 'N', pass(dragMean, dragMean <= 0.05 * skierDrag), `≤ 5% 人体阻力（${Number.isFinite(skierDrag) ? skierDrag.toFixed(0) : '—'} N）`, `≤ 5 % of skier drag (${Number.isFinite(skierDrag) ? skierDrag.toFixed(0) : '—'} N)`);
  const fc = raw.foldCount;
  const brk = raw.events.some((e) => e.type === 'breakaway');
  M('foldCount', '折叠次数', 'Fold events', fc, '-', sc.expectFold ? fc >= 1 || brk : fc === 0, sc.expectFold ? '≥ 1（保险或磁吸脱开须动作）' : '0（不得误触发）', sc.expectFold ? '≥ 1 (fold fuse or tip breakaway must act)' : '0 (no false trigger)');
  M('persp', '透视比（脚距/头距）', 'Perspective ratio (feet/head distance)', persp.mean, '-', pass(persp.mean, persp.mean <= 1.6), '≤ 1.6（ASSUMED；航拍 ≈1.06）', '≤ 1.6 (ASSUMED; drone ≈ 1.06)');
  M('seamParallax', '主体位于拼缝线的视差', 'Seam parallax on the subject', Number.isFinite(dMed) ? ((p.baseline / 1000) / dMed) * (180 / Math.PI) * ppd : NaN, 'px', null, '信息项：主体在拼缝上（b/d），依赖光流拼接', 'informational: subject lies on the seam (b/d); relies on optical-flow stitching');
  if (extra.noFold) M('rootMomentNoFold', '对照：无折叠时根部峰值力矩', 'Ablation: peak root moment without fold', extra.noFold.Mpk, 'N·m', null, '信息项：受规定的摔倒运动学驱动的上界', 'informational: upper bound driven by the scripted fall kinematics');
  if (extra.noFold) M('bodyForceNoFold', '对照：无折叠时身体峰值力', 'Ablation: peak body force without fold', extra.noFold.Fpk, 'N', null, '信息项', 'informational');
  const tStow = raw.events.find((e) => e.type === 'stowed');
  const tRet = raw.events.find((e) => e.type === 'retract');
  if (tStow && tRet) M('retractTime', '收回用时', 'Retract time', tStow.t - tRet.t, 's', tStow.t - tRet.t <= 4, '≤ 4 s', '≤ 4 s');
  if (cfg.liftAt != null) { const ok = raw.events.find((e) => e.type === 'liftBoard'); M('liftOk', '上缆车前已收纳', 'Stowed before boarding', ok && ok.severity === 'info' ? 'yes' : 'no', '', !!(ok && ok.severity === 'info'), '是', 'yes'); }
  if (sc.standing || cfg.commands?.some((c) => c.cmd === 'deploy')) {
    let mDep = 0; for (let i = 0; i < n; i++) if (raw.stateCode[i] === 1 || raw.stateCode[i] === 2) mDep = Math.max(mDep, raw.Mmag[i]);
    M('deployMoment', '展开过程根部最大力矩', 'Max root moment while deploying', mDep, 'N·m', mDep <= 25, '≤ 25 N·m', '≤ 25 N·m');
  }

  for (const m of R.metrics) if (typeof m.value === 'number' && !Number.isFinite(m.value)) { m.value = '—'; m.pass = null; }

  // ---- plots
  R.plots.push(
    { key: 'tip', zh: '杆端偏移（相对静止杆线）', en: 'Tip deflection (vs rigid rest line)', series: [['defSag', 'mm', '俯仰面', 'sagittal'], ['defLat', 'mm', '侧向', 'lateral']] },
    { key: 'loads', zh: '根部力矩（作用在躯干）', en: 'Root moment on the torso', series: [['Mpitch', 'N·m', '俯仰', 'pitch'], ['Myaw', 'N·m', '偏航', 'yaw'], ['Mroll', 'N·m', '侧倾', 'roll']] },
    { key: 'footage', zh: '重构图画面', en: 'Reframed footage', series: [['jitter', '°/s', '总抖动', 'total jitter'], ['jitterBoom', '°/s', '杆致抖动', 'boom-induced'], ['subjectPx', 'px', '主体像素', 'subject px']] },
    { key: 'stitch', zh: '隐形杆露出', en: 'Stick protrusion out of the stitch slab', series: [['stickPx', 'px', '露出像素', 'visible px'], ['stickSubj', 'px', '在主体上', 'over subject'], ['stickMm', 'mm', '超出盲区', 'beyond slab']] },
    { key: 'state', zh: '杆状态', en: 'Boom state', series: [['len', 'm', '伸出长度', 'length'], ['fold', '-', '折叠', 'folded'], ['speed', 'm/s', '速度', 'speed']] },
  );
  if (raw.motor.on) R.plots.push({ key: 'stab', zh: '根部稳定器', en: 'Root stabiliser', series: [['stabPitch', '°', '俯仰指令', 'pitch'], ['stabLat', '°', '侧向指令', 'lateral'], ['motorTau', 'N·m', '电机力矩', 'motor torque']] });
  if (cfg.fall || cfg.snag) R.plots.push({ key: 'impact', zh: '冲击', en: 'Impact', series: [['Mroot', 'N·m', '根部力矩', 'root moment'], ['contact', 'N', '触雪力', 'snow contact'], ['Fbody', 'N', '身体力', 'body force']] });

  attachFrame(R, raw, fa, cfg, p);
  R.raw = { peaks: raw.peaks, foldCount: raw.foldCount, modes: md, cRoot: raw.cRoot, inertia: inert };
  return R;
}

// ---------------------------------------------------------------- frames
function attachFrame(R, raw, fa, cfg, p) {
  const NODES = 3 * (NSEG + 1);
  const ns = raw.ns;
  R.frame = (t) => {
    const f = Math.max(0, Math.min(ns - 1, t / SDT));
    const i0 = Math.floor(f), i1 = Math.min(ns - 1, i0 + 1), w = f - i0;
    const s = cfg.skFn(t);
    const lerp = (arr, k, stride) => arr[i0 * stride + k] * (1 - w) + arr[i1 * stride + k] * w;
    const nodes = []; for (let k = 0; k < NODES; k++) nodes.push(lerp(raw.nodesB, k, NODES));
    const cam = []; for (let k = 0; k < 9; k++) cam.push(lerp(raw.camB, k, 9));
    const tip = [0, 1, 2].map((c) => lerp(raw.tip, c, 3));
    const crop = [0, 1, 2].map((c) => lerp(fa.crop, c, 3));
    const ic = w < 0.5 ? i0 : i1;
    const state = raw.stateCode[ic];
    const folded = raw.foldS[ic] !== 0 || raw.foldL[ic] !== 0;
    const beta = lerp(raw.beta, 0, 1);
    const device = {
      nodes, cam, len: lerp(raw.len, 0, 1), state, folded, led: raw.led[ic], spread: p.spread, tapeD: p.tapeD, stickPx: raw.stickPx[ic],
      fallBeta: beta, fallAxis: raw.fallAxis, feet: s.pos, recording: state === 3 && !raw.camOff[ic],
      v2: raw.design.v2, stabOn: raw.motor.on && state === 3, stab: [lerp(raw.thM, 0, 2), lerp(raw.thM, 1, 2)], camOff: !!raw.camOff[ic], tapes: raw.design.nT, latSpread: raw.design.v2 && raw.design.nT === 3 ? p.latSpread : 0,
    };
    const labels = [];
    if (folded) labels.push({ p: [raw.rootW[3 * ic], raw.rootW[3 * ic + 1], raw.rootW[3 * ic + 2] + 0.15], text: '⚠ fold', color: '#ffb347' });
    if (fa.filming[ic] && raw.stickPx[ic] >= 2) labels.push({ p: [tip[0], tip[1], tip[2] + 0.2], text: `stick visible ${raw.stickPx[ic].toFixed(1)} px`, color: '#ff6b6b' });
    const pc = state === 0 || folded || raw.camOff[ic] || beta > 0.05 || (state !== 3 && lerp(raw.len, 0, 1) < 1.0) ? null : {
      pos: tip, fwd: Math.hypot(...crop) > 0.5 ? crop : [s.heading[0], s.heading[1], -0.6], up: [0, 0, 1], vfovDeg: p.cropV,
      label: state === 3 ? '360 → 重构图 reframe (5.7K)' : '360 (未就绪 / not ready)',
    };
    // button presses: the left hand reaches the remote on the left shoulder strap
    const sk = { ...s, pack: 'plain' };
    let reach = 0;
    for (const c of cfg.commands || []) reach = Math.max(reach, Math.min(1, Math.max(0, 1 - Math.abs(t - c.t) / 0.6) * 1.6));
    if (reach > 0) {
      const o = 3 * ic, f = 9 * ic;
      sk.handL = [0, 1, 2].map((k) => raw.pelvis[o + k] + raw.frame[f + 6 + k] * 0.34 + raw.frame[f + 3 + k] * 0.1 + raw.frame[f + k] * 0.16);
      sk.reachL = reach;
    }
    device.press = reach;
    return { t, tanS: cfg.tanS, skier: sk, device, productCam: pc, labels };
  };
}

function simulate(params, scenario) {
  const sc = scenario || SCEN[0];
  const p = { ...full(params), ...(sc.design ? { design: sc.design } : {}) };
  const { cfg } = cfgFor(p, sc);
  const raw = runBoom(p, cfg);
  let extra = {};
  if (sc.ablation) {
    const { cfg: c2 } = cfgFor(p, sc);
    c2.foldOn = false;
    const r2 = runBoom(p, c2);
    extra = { noFold: { Mpk: r2.peaks.Mmag, Fpk: r2.peaks.Fbody } };
  }
  return buildResult(p, sc, raw, cfg, extra);
}

// ---------------------------------------------------------------- demonstration
// Composite timeline from several shared-skier runs (positions chained, heading
// and crouch blended at the joins). Physics drives the boom throughout; the
// fall/stand-up rotation of the rider is scripted (illustration).
function composite(segs) {
  let off = [0, 0];
  const list = [];
  let prev = null;
  for (const sg of segs) {
    const e = { ...sg, off: [...off], prevEnd: prev };
    list.push(e);
    const end = skierAt(sg.sk, sg.t1 - sg.t0);
    prev = { heading: end.heading, crouch: end.crouch };
    off = [off[0] + end.pos[0], off[1] + end.pos[1]];
  }
  const tanS = segs[0].sk.tanS;
  return (t) => {
    let e = list[list.length - 1];
    for (const x of list) if (t < x.t1) { e = x; break; }
    const s = skierAt(e.sk, Math.max(0, t - e.t0));
    const pos = [s.pos[0] + e.off[0], s.pos[1] + e.off[1], 0];
    pos[2] = -pos[0] * tanS;
    const out = { ...s, pos };
    if (e.prevEnd) {
      const w = Math.min(1, Math.max(0, (t - e.t0) / 1.2));
      const k = w * w * (3 - 2 * w);
      const a0 = Math.atan2(e.prevEnd.heading[1], e.prevEnd.heading[0]), a1 = Math.atan2(s.heading[1], s.heading[0]);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const a = a0 + da * k;
      out.heading = [Math.cos(a), Math.sin(a), 0];
      out.crouch = e.prevEnd.crouch * (1 - k) + s.crouch * k;
    }
    return out;
  };
}

const STAGES = [
  { key: 'carry', t0: 0, t1: 5, title: T('携行', 'Carry'), zh: '携行：杆收纳，竖直贴在背包上，相机停靠在包顶。滑向拍摄起点。', en: 'Carry: the boom is stowed upright along the pack, camera docked on the lid. Skiing to the start.', pending: false },
  { key: 'press', t0: 5, t1: 7, title: T('停下·按键', 'Stop & press'), zh: '停下，按腰带上的按键（戴手套可操作）。', en: 'Stop and press the hip-belt button (glove-friendly).', pending: false },
  { key: 'deploy', t0: 7, t1: 10.5, title: T('展开', 'Deploy'), zh: '根部转出，两根卷带从卷筒伸出并弹成闭口截面，LED 变绿。卷带弹形过程为示意。', en: 'The root pivots out, both tapes pay out of their reels and snap to a closed section; LED turns green. Tape snap-through is illustrative.', pending: true },
  { key: 'ski', t0: 10.5, t1: 24, title: T('滑行拍摄', 'Filming'), zh: '转弯滑行；内嵌窗为 360 重构图。根部稳定器让杆端跟随骨盆而不随躯干摆动（蓝灯）；16–22 s 按指令把杆摆到 45° 侧后方拍侧视。', en: 'Turns; the inset is the reframed 360 view. The root stabiliser keeps the tip on the pelvis path instead of swinging with the torso (blue LED); at 16–22 s the boom swings to a commanded 45° rear-quarter side view.', pending: false },
  { key: 'moguls', t0: 24, t1: 30, title: T('猫跳段', 'Moguls'), zh: '猫跳段：1–3 Hz 竖向冲击。蓝色指示灯表示根部稳定器正在反向转动杆根抵消躯干俯仰，相机不随躯干上下摆动；电子防抖只去掉旋转。', en: 'Mogul section: 1–3 Hz bumps. The blue LED shows the root stabiliser counter-rotating the boom against torso pitch, so the camera does not bob with the torso. EIS removes rotation only.', pending: false },
  { key: 'fall', t0: 30, t1: 32.5, title: T('后仰摔倒', 'Backward fall'), zh: '后仰摔倒：杆尖先触雪，根部卷带在设定力矩处折叠（保险），传到背部的力矩受限。摔倒运动为脚本。', en: 'Backward fall: the tip hits the snow first; the root tape folds at its set moment (fuse) and limits the moment into the back. Fall motion is scripted.', pending: true },
  { key: 'retract', t0: 32.5, t1: 35, title: T('自动收回', 'Auto-retract'), zh: 'IMU 判定摔倒后自动收卷，折叠段被拉回卷筒恢复截面。', en: 'The IMU detects the fall and retracts automatically; the folded zone is pulled into the reel and re-forms.', pending: true },
  { key: 'redeploy', t0: 35, t1: 41, title: T('起身·再展开', 'Stand up & redeploy'), zh: '起身，按键再次展开。', en: 'Stand up and press to redeploy.', pending: false },
  { key: 'ski2', t0: 41, t1: 49.5, title: T('继续滑行', 'Ski on'), zh: '继续滑行拍摄。', en: 'Back to filming.', pending: false },
  { key: 'stow', t0: 49.5, t1: 58, title: T('收纳', 'Stow'), zh: '滑向缆车时按键收纳（停下排队 6 s 也会自动收回），收好后再急停。', en: 'Press to stow while gliding to the lift (a 6 s standstill also auto-retracts); stop once it is stowed.', pending: false },
];

function buildDemo(params) {
  const p = full(params);
  const segs = [
    { t0: 0, t1: 10.5, sk: simulateSkier({ start: 'push', vTarget: 7, turnPeriod: 3.6, turnAmpDeg: 20, stopAt: 5.0, duration: 10.6, seed: 2 }) },
    { t0: 10.5, t1: 35, sk: simulateSkier({ start: 'push', vTarget: 12, turnPeriod: 4.0, turnAmpDeg: 30, fallAt: 19.5, duration: 24.6, seed: 3 }) },
    { t0: 35, t1: 41, sk: simulateSkier({ v0: 0, stopAt: 0, style: 'straight', duration: 6.1 }) },
    { t0: 41, t1: 58, sk: simulateSkier({ start: 'push', vTarget: 9, turnPeriod: 3.6, turnAmpDeg: 26, stopAt: 11.2, duration: 17.1, seed: 4 }) },
  ];
  const skFn = composite(segs);
  const cfg = {
    skFn, tanS: segs[0].sk.tanS, duration: 58, wind: { mean: [1.5, 0.8, 0], intensity: 0.2, seed: 21 }, rough: p.rough,
    moguls: { span: [24, 29.6], A: 0.3 * 9.81, lambda: 6 }, fall: { t0: 30, dir: 'back', getUp: 35 }, snag: null,
    commands: [{ t: 6.8, cmd: 'deploy' }, { t: 37.5, cmd: 'deploy' }, { t: 49.6, cmd: 'retract' }], startDeployed: false, liftAt: null, zeta: null,
    // v3 commanded side view (highlight) during the first filming stage and the second run
    azCmd: (t) => { for (const [a, b, side] of [[16, 22.5, 1], [42.5, 48, -1]]) { const w = Math.min(1, Math.max(0, (t - a) / 2.5)) * Math.min(1, Math.max(0, (b - t) / 2.5)); if (w > 0) return (side * p.azSide * Math.PI / 180) * (0.5 - 0.5 * Math.cos(Math.PI * w)); } return 0; },
  };
  const raw = runBoom(p, cfg);
  const R = buildResult(p, { id: 'demo', expectFold: true }, raw, cfg);
  R.scenarioId = 'demo';
  return R;
}

export default {
  id: 'boom360', family: 'body',
  name: T('S1 背负 360 尾杆', 'S1 boom360: backpack 360 tail boom'),
  tagline: T('按键伸出的卷带尾杆 + 根部主动稳定，360 拼缝藏杆', 'Push-button tape boom with an active root stabiliser; the 360 seam hides the stick'),
  about: T(
    'v2（默认）：腰带+背包框架根部，1.6 m 双稳态碳纤维卷带在 360 相机拼缝面内成 V 形；根部两轴主动稳定器（背包 IMU 前馈，俯仰/侧倾高通）抵消躯干转动带来的杆端平移；根部刚度 2500 N·m/rad；杆端磁吸脱开（35 N，挂绳）；侧向折叠保险 35 N·m（冲击速率时降至 ~25）；相机偏航微调让拼缝面跟随杆的准静态弯曲。v1 可用参数 design=1 选择。模型：6 段集总梁 + 躯干运动 + 雪面/猫跳激励 + 气动 + 触雪 + 伺服限幅。',
    'v2 (default): hip-belt + pack-frame root; a 1.6 m V of two bistable carbon tape springs inside the 360 camera stitch plane; a 2-axis active root stabiliser (pack-IMU feed-forward, pitch/roll high-passed) cancels the tip translation caused by torso rotation; 2500 N·m/rad root; magnetic tip breakaway (35 N, lanyard); 35 N·m lateral fuse that drops to ~25 N·m at impact rates; a camera yaw trim lets the stitch plane follow the boom’s quasi-static bend. v1 via design = 1. Model: 6-segment lumped beam on the moving torso, snow/mogul excitation, aerodynamics, snow contact, servo limits.'),
  modelVersion: VERSION,
  modelLimits: [
    T('躯干运动由共享滑雪者轨迹推导（反向转体、侧倾比例为假设），不是生物力学模型；摔倒运动为脚本', 'Torso motion derived from the shared skier track (counter-rotation and angulation factors assumed), not biomechanics; falls are scripted'),
    T('杆的扭转、卷带截面局部屈曲细节、卷筒出口间隙未建模；折叠为集总力矩-转角规律', 'Boom torsion, local tape buckling details and reel-exit play are not modelled; folding is a lumped moment–rotation law'),
    T('雪面激励为确定性谱（基加速度），未建模雪面几何与腿部动力学', 'Snow excitation is a deterministic base-acceleration spectrum; no snow geometry or leg dynamics'),
    T('电子防抖用残余比例 + 带宽近似；未建模卷帘快门、运动模糊、拼接误差与曝光', 'EIS approximated by a residual fraction and bandwidth; no rolling shutter, motion blur, stitching error or exposure'),
    T('杆与骑手身体/头盔的接触、缆车机构未建模', 'Contact between the boom and the rider/helmet, and the chairlift itself, are not modelled'),
    T('稳定器：躯干运动为规定输入（背包 IMU 前馈不形成回路）；电机为一阶伺服 + 速率/力矩限幅 + 回驱；准静态载荷由被动平衡弹簧承担（假设）；功率为铜损 + 齿轮效率估算', 'Stabiliser: torso motion is a prescribed input (pack-IMU feed-forward closes no loop); motors are first-order servos with rate/torque limits and back-drive; quasi-static loads assumed carried by a passive balance spring; power from copper loss + gearbox efficiency'),
    T('磁吸脱开后相机悬挂动力学与挂绳撕裂带为简化力上限模型', 'After the magnetic breakaway, camera swing and the rip-stitch lanyard are a simplified force-cap model'),
  ],
  params: PARAMS,
  scenarios: SCEN,
  simulate,
  demo: { duration: 58, stages: STAGES, build: buildDemo },
  gear: () => import('./gear.js'),
};

export { PARAMS, SCEN, design, cfgFor, buildResult };
