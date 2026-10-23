// K2 active kite (SIM-031), ROUND 4 (kite2@4.0.0): K2-R4 "reefing steerable drogue on a passive hair-thin boom with a
// motorised-reel winch". Round 3 (audit3) passed 13/13 only with a ≈4.5 px boom stub tolerated over the rider, an active
// boom gimbal sized below its own load (0.13 vs 0.35–1 N·m), a zero-lag heave-compensating winch running at 6–8 m/s /
// 93–166 W beyond its motor, and noise-free in-flight wind. Round 4 removes every one of those instead of tuning around
// them: (1) the boom is a PASSIVE 3.0→2.5 mm carbon tube on a free damped pivot — the line tension aligns it, so it carries
// tension only (no bending, no motors) and it is <2 px wide in the delivered frame; 1.45 m keeps the line tip ≥1 m from the
// helmet; (2) the winch is a MOTORISED FISHING REEL: anti-reverse bearing + servo-set friction drag, so pay-out (gusts,
// body heave) is passive and instantaneous above the drag, the motor (2205-class, real Kv/R/current/voltage/inertia
// envelope) only reels in, holding costs no current; the KE governor is a solenoid drag release on an ESTIMATED kite speed;
// (3) the controller, launch pitot and governor read noisy, lagged sensors. The rules are the shared round-4 ones (48
// cases, bodyPx ≥300, ≥2 px artefact rule, helmetAt headClear). Physics: model.js; footage/safety geometry: analysis.js.
// Numerical-uncalibrated simulation; the demo is an illustration. Nothing is validated.
import { simulateSkier, skierAt, bodyPoints, SKIER_PRESETS } from '../common/skier.js';
import { makeResult } from '../common/result.js';
import { addStd, jitterHP, footageStability } from '../common/criteria.js';
import { simulateRun, FULLRUN_CASES, FULLRUN_CASES_R4, availMask, helmetAt } from '../common/fullrun.js';
import { BATTERY, enduranceMin, MASS_MARGIN } from '../common/components.js';
import { runCore, makeRider, smoothBody, applyHardFall, resolveP, PDEF, MODE, vMinFly, kiteBudget } from './model.js';
import { analyse } from './analysis.js';
import { ENSEMBLE } from './ensemble_summary.js';

const MV = 'kite2@4.0.0';
const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const PARAMS = [
  { id: 'design', zh: '设计（2=K2-R 收口圆伞；3=同伞不收口；4=软翼诚实极曲线；1=轻被动风筝；0=第一轮 A04）', en: 'Design (2 = K2-R reefing round; 3 = same, no reefing; 4 = soft wing on the honest polar; 1 = light passive kite; 0 = round-1 A04)', unit: '', v: 2, min: 0, max: 4, step: 1, src: 'ASSUMED' },
  { id: 'mass', zh: '飞行质量（共享元件表 + 伞衣 + 15 % 余量）', en: 'Flying mass (shared component table + canopy + 15 % margin)', unit: 'kg', v: PDEF.mass, min: 0.05, max: 0.4, step: 0.001, src: 'CALC', note: 'camera 16 + avionics 10 + 3×4 g servo-winch + wiring 5 + 1.2 Wh cell 8 + canopy 0.40 m²×1.3×27 g/m² 14.0 + KCU 6 + lines 4 = 75.0 g, ×1.15 = 86.3 g (model.js kiteBudget)' },
  { id: 'S', zh: '伞衣名义面积 S0', en: 'Canopy nominal area S0', unit: 'm²', v: 0.40, min: 0.15, max: 0.8, step: 0.01, src: 'CALC', note: '≈0.71 m nominal diameter; sets the lowest flying apparent wind (≈3.8 m/s)' },
  { id: 'rMin', zh: '最小收口阻力面积比', en: 'Min reefed drag-area ratio', unit: '', v: 0.25, min: 0.1, max: 1, step: 0.05, src: 'LIT', note: 'skirt reefing: drag-area ratio ≈0.25 at reefing ratio 0.2 (Knacke data in NASA Ares I reefing report); continuous servo reefing is new (ASSUMED); 1 = no reefing' },
  { id: 'gMaxR', zh: '圆伞最大升阻比（排气缝全开）', en: 'Round canopy max L/D (slots fully open)', unit: '', v: 0.75, min: 0.3, max: 1.2, step: 0.05, src: 'LIT', note: 'MC-1-1C ≈4.1 m/s forward at ≈5.5 m/s descent → 0.75 (documented, default); MC-6 0.9–1.2 only from non-archival sources (sensitivity)' },
  { id: 'cd0r', zh: '圆伞阻力系数（名义面积）', en: 'Round canopy drag coefficient (nominal area)', unit: '', v: 0.8, min: 0.5, max: 1.0, step: 0.05, src: 'ASSUMED', note: 'flat circular canopy class 0.75–0.8' },
  { id: 'reefGloss', zh: '全收口时损失的升阻比比例（保留 = 1 − 此值）', en: 'Share of L/D lost at full reef (retention = 1 − this)', unit: '', v: 0.5, min: 0, max: 1, step: 0.05, src: 'ASSUMED', note: 'no data for gliding reefed rounds (audit2 A2-K2-05): default keeps 50 %, sensitivities keep 30/50/70 %' },
  { id: 'Lst', zh: '拍摄系留长度', en: 'Filming tether length', unit: 'm', v: 5, min: 3, max: 12, step: 0.5, src: 'CALC', note: 'round 4: 5 m (was 7) so the 4K native 1:1 crop still gives ≥300 px feet→head at peak carving lean (bodyPx rule)' },
  { id: 'az', zh: '机位方位（相对行进方向后方；中途换侧）', en: 'Station azimuth from behind (swaps sides mid-run)', unit: '°', v: 15, min: 0, max: 60, step: 5, src: 'ASSUMED' },
  { id: 'el', zh: '机位仰角目标（相对坡面；受极曲线可达值限制）', en: 'Station elevation target (above the slope plane; capped at what the polar can reach)', unit: '°', v: 22, min: 10, max: 50, step: 1, src: 'ASSUMED', note: '+ slope = elevation above the horizontal (37° on a 15° piste)' },
  { id: 'Tref', zh: '拍摄张力设定（收口环）', en: 'Filming tension set-point (reefing loop)', unit: 'N', v: 8, min: 3, max: 15, step: 0.5, src: 'ASSUMED' },
  { id: 'ThiMin', zh: '卷线器摩擦制动保持力下限', en: 'Reel drag holding force (floor)', unit: 'N', v: 14, min: 6, max: 30, step: 1, src: 'ASSUMED', note: 'drag set to max(14 N, 1.35 × 2 s mean tension) while filming: above it the spool slips (passive, zero-lag gust/heave pay-out)' },
  { id: 'Fslip', zh: '卷线器最大摩擦制动（离合）', en: 'Reel drag maximum (clutch level)', unit: 'N', v: 30, min: 15, max: 38, step: 1, src: 'ASSUMED', note: 'carbon drag-washer stack (spinning-reel class, ASSUMED)' },
  { id: 'vRet', zh: '收回收线速度', en: 'Retrieve reel-in speed', unit: 'm/s', v: 3.5, min: 1.5, max: 4.5, step: 0.1, src: 'CALC', note: 'within the 2205-class motor envelope (no-load ≈6.2 m/s at 5:1, 10.8 V)' },
  { id: 'boom', zh: '被动细长伸缩臂杆长度（受拉二力杆）', en: 'Passive slender telescopic boom length (tension member)', unit: 'm', v: 1.45, min: 0, max: 1.6, step: 0.05, src: 'ASSUMED', note: 'round 4: 6-section 3.0→2.5 mm carbon tube (fly-rod-tip class) on a free 2-axis pivot with a viscous damper: the line tension aligns it, so it carries tension only (no bending, no motors). <2 px wide in the delivered frame (shared artefact rule); 1.45 m keeps the tip ≥1.0 m from the helmet in any lean; 0 = lid exit' },
  { id: 'funnelAcc', zh: '控制单元对接锥容许剩余偏角', en: 'KCU docking cone: accepted residual angle', unit: '°', v: 45, min: 15, max: 120, step: 5, src: 'ASSUMED', note: 'round 4: the funnel is on the KCU (a female cone over the 2.5 mm tip ring), not a trumpet on the boom tip' },
  { id: 'hc', zh: '收线升沉前馈增益（0 = 关）', en: 'Reel-in heave feed-forward gain (0 = off)', unit: '', v: 1, min: 0, max: 1, step: 0.1, src: 'ASSUMED', note: 'round 4: estimate with 40 ms lag + 0.3 m/s noise, 0.6 m/s dead band, only as slack take-up below 3 N; pay-out half is the passive drag' },
  { id: 'Jgov', zh: '动能调速器门限（电磁铁松开摩擦制动）', en: 'KE governor threshold (solenoid drag release)', unit: 'J', v: 11, min: 8, max: 999, step: 0.5, src: 'ASSUMED', note: 'estimated kite ground speed above √(2J/m) → drag released to 2 N in ≈20 ms; 999 = off. 11 J (was 12.5) leaves room for the estimate lag/noise' },
  { id: 'EA', zh: '系留绳轴向刚度 EA', en: 'Tether axial stiffness EA', unit: 'N', v: 6000, min: 1000, max: 20000, step: 500, src: 'ASSUMED' },
  { id: 'hfov', zh: '相机水平视场（4K 直线镜头）', en: 'Camera HFOV (4K rectilinear)', unit: '°', v: 45, min: 35, max: 120, step: 5, src: 'ASSUMED', note: 'round 4: 45° M12 lens on a 16 g 4K module (ASSUMED part), mounted 2.5° below the line axis; more native px/° for the bodyPx rule' },
  { id: 'cropFc', zh: '事后重构图平滑截止频率', en: 'Post-run reframing smoother cut-off', unit: 'Hz', v: 1.5, min: 0.3, max: 4, step: 0.1, src: 'ASSUMED' },
  { id: 'camOff', zh: '相机偏离系留绳轴线距离', en: 'Camera offset from the tether axis', unit: 'm', v: 0.2, min: 0, max: 0.4, step: 0.01, src: 'CALC' },
  { id: 'packWh', zh: '背包舱电池', en: 'Pod battery', unit: 'Wh', v: 12, min: 4, max: 40, step: 1, src: 'CALC', note: '150 Wh/kg pack level (shared table) → 80 g; 3S for the reel motor' },
];

const W_LIGHT = { mean: [0, 2, 0], intensity: 0.2, Lu: 28, seed: 7 };
const FR_CASE = FULLRUN_CASES.find((c) => c.id === 'crossR6_s12');
const SCEN = [
  { id: 'nominal', zh: '标准：12 m/s 大弯，微风', en: 'Nominal: 12 m/s carving, light wind', dur: 30, skier: {}, wind: W_LIGHT,
    expect: { zh: '后侧方约 30–35° 视角仰角跟拍，张力 8–14 N（收口），统一判据满足；身后 1 m 绳高低于 2 m（晾衣绳门槛不过，诚实报告）。', en: 'Rear-quarter filming at ≈30–35° view elevation, 8–14 N (reefed), harmonised criteria met; line height 1 m behind stays below 2 m (clothesline gate fails, reported).' } },
  { id: 'fullrun', zh: '整趟（共享）：山顶出发→停 20 s→再出发→缆车前停（6 m/s 右侧风）', en: 'Full run (shared): push-off → 20 s stop → push-off → stop at the lift (6 m/s crosswind from the right)', dur: null, rider: 'fullrun', wind: { mean: FR_CASE.mean, intensity: FR_CASE.intensity, Lu: 28, seed: FR_CASE.seed }, plan: { start: 'docked', armAt: 0 }, dt: 0.002,
    expect: { zh: '每次出发自动起飞，两次停下都自动飞回桅杆顶入舱；48 个风况的集合统计见 ens* 指标。', en: 'Auto launch at each push-off, auto dock at both stops; the 48-case ensemble statistics are the ens* metrics.' } },
  { id: 'short', zh: '短弯（1.04 s/弯，8 m/s）', en: 'Short turns (1.04 s/turn, 8 m/s)', dur: 25, skier: { ...SKIER_PRESETS.shortTurns }, wind: W_LIGHT,
    expect: { zh: '相对风每弯摆动约 ±35°：风筝滞后但平滑。', en: 'Apparent wind swings ≈±35° per turn: the kite lags but smoothly.' } },
  { id: 'shorttail', zh: '短弯 + 6 m/s 斜后风（审计 K2-07）', en: 'Short turns + 6 m/s quartering tailwind (audit K2-07)', dur: 25, skier: { ...SKIER_PRESETS.shortTurns }, wind: { mean: [4.24, -4.24, 0], intensity: 0.2, Lu: 28, seed: 7 },
    expect: { zh: '相对风只有约 4 m/s，低于起飞门槛（1.6×最低飞行风速 3.8 m/s + 1 m/s 估计偏差）：按实测级升阻比不起飞、不拍摄（包线外）。诚实报告。', en: 'Apparent wind only ≈4 m/s, below the launch gate (1.6 × the 3.8 m/s minimum flying airspeed + 1 m/s estimate bias): with the documented glide it does not launch and does not film (outside the envelope). Honest report.' } },
  { id: 'fast', zh: '加速到 18 m/s（超出拍摄包线）', en: 'Accelerating to 18 m/s (leaves the filming envelope)', dur: 25, skier: { vTarget: 18, v0: 12, turnPeriod: 5.5, turnAmpDeg: 24 }, wind: W_LIGHT, plan: { start: 'flying' },
    expect: { zh: '预测速度超过 16.2 m/s 即开始收回，但收线速率受动能上限约束，骑手 4 s 内从 12 加速到 18 m/s 时来不及入舱：动能瞬时约 18 J（包线外，诚实报告）。', en: 'Retrieval starts when the predicted speed exceeds 16.2 m/s, but reel-in is capped by the KE limit, so a rider accelerating 12→18 m/s in 4 s outruns the dock: ≈18 J transient (outside the envelope, honest report).' } },
  { id: 'gust', zh: '阵风侧风 6 m/s + 7 m/s 阵风', en: 'Gusty crosswind 6 m/s + 7 m/s gust', dur: 30, skier: {}, wind: { mean: [0, 6, 0], intensity: 0.3, Lu: 25, seed: 9, gustAt: 12, gust: [0, 7, 0], gustRise: 1, gustHold: 3 },
    expect: { zh: '收口 + 再生绞盘吸收阵风；报告峰值拉力。', en: 'Reefing + regenerating winch absorb the gust; report the peak pull.' } },
  { id: 'tail', zh: '顺风 6 m/s（从背后吹来）', en: 'Tailwind 6 m/s (from behind)', dur: 30, skier: {}, wind: { mean: [6, 0, 0], intensity: 0.2, Lu: 28, seed: 12 },
    expect: { zh: '相对风只剩约 6 m/s：全展开飞行。', en: 'Apparent wind only ≈6 m/s: flies unreefed.' } },
  { id: 'moguls', zh: '猫跳 4.5 m/s（低速包线边缘）', en: 'Moguls 4.5 m/s (low-speed envelope edge)', dur: 25, skier: { ...SKIER_PRESETS.moguls }, wind: W_LIGHT,
    expect: { zh: '相对风 3–5 m/s 接近最低飞行风速 3.8 m/s：诚实报告。', en: 'Apparent wind 3–5 m/s near the 3.8 m/s minimum: honest report.' } },
  { id: 'stopstart', zh: '停下再出发（无风）', en: 'Stop and restart (calm)', dur: 36, rider: 'stopstart', wind: { mean: [0, 0.5, 0], intensity: 0.2, Lu: 28, seed: 4 }, plan: { start: 'docked', armAt: 0.5 },
    expect: { zh: '自动起飞、停下自动入舱、再出发自动再起飞。', en: 'Auto launch, auto dock at the stop, auto relaunch.' } },
  { id: 'liftline', zh: '进入缆车排队区（无风停下）', en: 'Into the lift line (stop, no wind)', dur: 24, skier: { stopAt: 9, duration: 25 }, wind: { mean: [0, 0, 0], intensity: 0.1, Lu: 28, seed: 5 }, plan: {},
    expect: { zh: '停稳后数秒内入舱，静止时绝不起飞。', en: 'Docked within seconds of stopping, never launches while stationary.' } },
  { id: 'chairlift', zh: '武装状态坐上吊椅（5 m/s 上行）', en: 'Riding a chairlift armed (5 m/s up)', dur: 20, rider: 'chairUp', wind: W_LIGHT, plan: { start: 'docked', armAt: 0.2 },
    expect: { zh: '审计 K2-03：第一版在 1.0 s 自动起飞。现在：不下降、无雪面振动 → 联锁；爬升 3 m 自动解除武装。', en: 'Audit K2-03: iteration 1 launched at 1.0 s. Now: not descending, no on-snow vibration → interlock; 3 m of climb auto-disarms.' } },
  { id: 'chairdown', zh: '武装状态坐下行吊椅（5 m/s 下行）', en: 'Riding a chairlift down, armed (5 m/s)', dur: 20, rider: 'chairDown', wind: W_LIGHT, plan: { start: 'docked', armAt: 0.2 },
    expect: { zh: '下降且有相对风，只有“无雪面振动”一项挡住起飞（假设可检测）。', en: 'Descending with apparent wind: only the no-on-snow-vibration check stops a launch (ASSUMED detectable).' } },
  { id: 'dock_w6', zh: '有风站立：面向来风后按键收纳（6 m/s 阵风）', en: 'Standing in wind: face the wind, tap to stow (6 m/s gusty)', dur: 16, rider: 'stand', face: 'wind', wind: { mean: [5, 3, 0], intensity: 0.3, Lu: 15, seed: 3 }, plan: { start: 'park', stowAt: 3 },
    expect: { zh: '风筝停泊在身后下风处，臂杆指向它，沿轴线拉回臂杆端；报告用时与剩余偏角。', en: 'The parked kite is behind (downwind); the boom points at it and it is hauled onto the tip on-axis; report time and residual angle.' } },
  { id: 'dock_w9', zh: '有风站立收纳（9 m/s 阵风，面向来风）', en: 'Standing stow in 9 m/s gusty wind (facing the wind)', dur: 16, rider: 'stand', face: 'wind', wind: { mean: [7, 5.5, 0], intensity: 0.35, Lu: 15, seed: 5 }, plan: { start: 'park', stowAt: 3 },
    expect: { zh: '9 m/s 阵风中收纳。', en: 'Stow in 9 m/s gusty wind.' } },
  { id: 'dock_w6_back', fault: true, zh: '操作错误：背风站立时收纳（风筝在身前）', en: 'Wrong procedure: stow while standing with the back to the wind (kite in front)', dur: 22, rider: 'stand', face: 'downwind', wind: { mean: [5, 3, 0], intensity: 0.3, Lu: 15, seed: 3 }, plan: { start: 'park', stowAt: 3 },
    expect: { zh: '风筝在臂杆后方锥区之外：不往头部方向收线，旗化软放线落在身前，需转身或手动收回。诚实报告。', en: 'The kite is outside the boom\'s rear cone: it is never reeled past the head; it flags and settles in front on a soft line and needs a turn-around or hand stow. Honest report.' } },
  { id: 'fall', zh: '摔倒（12 m/s 急停）', en: 'Rider fall (sudden stop from 12 m/s)', dur: 20, skier: { duration: 21 }, hardFall: { t: 10, decel: 12 }, wind: W_LIGHT,
    expect: { zh: '风筝旗化落在后方，不收向倒地者。', en: 'The kite flags and drops behind, never reeled into the fallen rider.' } },
  { id: 'snag', fault: true, zh: '树枝挂绳（林边，3 m 高横枝）', en: 'Tree snag (branch 3 m up)', dur: 22, skier: { duration: 23 }, wind: W_LIGHT, branch: { t: 10, h: 3.0, half: 4 },
    expect: { zh: '检测到挂绳 → 1.5 N 自由放线 → 放到底时背包端释放。', en: 'Snag detected → 1.5 N free-spool → pack-end release at the end of the line.' } },
  { id: 'cross', fault: true, zh: '他人从身后 0.35 m 横穿', en: 'Neighbour crosses 0.35 m behind', dur: 20, skier: { duration: 21 }, wind: W_LIGHT, cross: { t: 11, behind: 0.35, vy: 8, h: 1.9, slide: 1.0 },
    expect: { zh: '后方雷达先把离合变软、风筝爬高；绳不碰头盔，但横穿者在肩部碰到臂杆：报告冲量。', en: 'The rear radar softens the clutch and the kite climbs first; the line clears the helmet but the crossing skier meets the boom at shoulder height: report the impulse.' } },
  { id: 'crosspole', fault: true, zh: '他人从身后 0.35 m 横穿（举杖 2.3 m）', en: 'Neighbour crosses 0.35 m behind (pole raised to 2.3 m)', dur: 20, skier: { duration: 21 }, wind: W_LIGHT, cross: { t: 11, behind: 0.35, vy: 8, h: 2.3, slide: 1.0 },
    expect: { zh: '强制接触：检验自由放线保护。', en: 'Forced contact: exercises the free-spool protection.' } },
  { id: 'winch_fail', fault: true, zh: '绞盘电机失效（刹车锁死）', en: 'Winch motor failure (brake locks)', dur: 26, skier: { duration: 27, stopAt: 18 }, wind: W_LIGHT, plan: { winchFailAt: 10 },
    expect: { zh: '固定绳长继续拍摄；停下时降落在后方，手动收回。', en: 'Keeps filming at fixed length; at the stop it drops behind for manual pick-up.' } },
  { id: 'kcu_fail', fault: true, zh: '风筝控制单元执行器失效', en: 'KCU actuator failure', dur: 24, skier: { duration: 25 }, wind: W_LIGHT, plan: { kcuFailAt: 10 },
    expect: { zh: '失效保护旗化，绞盘收回入舱。', en: 'Fail-safe flags the canopy; the winch reels it into the dock.' } },
  { id: 'cut', fault: true, zh: '系留绳在背包处断开', en: 'Tether cut at the pack', dur: 20, skier: { duration: 21 }, wind: W_LIGHT, plan: { cutAt: 10 },
    expect: { zh: '风筝张开成降落伞下降；报告对地动能。', en: 'The kite opens as a parachute; report ground-frame KE.' } },
  { id: 'nominal_v0', compare: true, zh: '对照：第一轮 A04 被动风筝（300 g、L/D 4.4）', en: 'Compare: round-1 A04 passive kite (300 g, L/D 4.4)', dur: 30, skier: {}, wind: W_LIGHT, over: { design: 0 },
    expect: { zh: '重现第一轮否决理由。', en: 'Reproduces the round-1 rejection.' } },
  { id: 'nominal_v1', compare: true, zh: '对照：轻量被动单层翼（无控制单元）', en: 'Compare: light passive single-skin kite (no KCU)', dur: 30, skier: {}, wind: W_LIGHT, over: { design: 1 },
    expect: { zh: '只减重不控制：仍是俯视、拉力 ∝ V²。', en: 'Mass alone: still top-down, pull ∝ V².' } },
  { id: 'nominal_fixed', compare: true, zh: '对照：同一圆伞不收口（固定面积）', en: 'Compare: same round canopy without reefing', dur: 30, skier: {}, wind: W_LIGHT, over: { design: 3 },
    expect: { zh: '诚实极曲线下不收口：拉力 ∝ V²。', en: 'Honest polar without reefing: pull ∝ V².' } },
  { id: 'fast_fixed', compare: true, zh: '对照：不收口圆伞 18 m/s 拉力', en: 'Compare: unreefed round at 18 m/s (pull)', dur: 25, skier: { vTarget: 18, v0: 18, turnPeriod: 5.5, turnAmpDeg: 24 }, wind: W_LIGHT, over: { design: 3, vMaxFilm: 99 },
    expect: { zh: '诚实极曲线下不收口在高速的拉力。', en: 'Pull of the unreefed canopy at speed on the honest polar.' } },
  { id: 'nominal_wing', compare: true, zh: '对照：软翼在诚实极曲线上主动飞行（设计 4）', en: 'Compare: soft wing flown actively on the honest polar (design 4)', dur: 30, skier: {}, wind: W_LIGHT, over: { design: 4 },
    expect: { zh: '可飞但需要未验证的主动俯仰稳定（30–75° 无静稳定配平）。', en: 'Flies, but needs undemonstrated active pitch stabilisation (no static trim at 30–75°).' } },
];

// worn mass (kg): kite from the shared component table; pod items ASSUMED budget; battery at 150 Wh/kg
const KB = kiteBudget();
const wornMass = (p) => {
  // round 4 boom (passive): 6-section 3.0→2.5 mm carbon tube ≈12 g + 2.5 mm tip ring 1 g + free 2-axis pivot with viscous
  // damper, centring spring, encoders, 5 N magnetic breakaway, extension spring ≈27 g (ASSUMED) = 0.04 kg (was 0.148 kg active).
  // winch = motorised reel: 2205-class motor 30 g + 5:1 planetary 12 g + spool/drag stack/anti-reverse 20 g + drag servo 4 g
  // + release solenoid 6 g + ESC 8 g = 0.085 kg (ASSUMED). Rear proximity radar 10 g (ASSUMED)
  const items = { kite: p.mass, tether: 0.004, podShell: 0.12, winch: 0.085, boom: p.boom ? (p.boomActive ? 0.148 : 0.04) : p.mast ? 0.015 : 0, proxRadar: p.boom ? 0.01 : 0, podElectronics: 0.025, heaterPad: 0.005, battery: (p.packWh / BATTERY.whPerKgPack), mount: 0.04 };
  const sum = Object.values(items).reduce((a, b) => a + b, 0);
  return { items, kg: items.kite + (sum - items.kite) * (1 + MASS_MARGIN) };
};
const MASS0 = { kite: 0.3, tether: 0.01, reel: 0.25, boom: 0.25, mount: 0.05 };
const PACK_L = 0.26 * 0.11 * 0.10 * 1000; // pod incl. collapsed 0.26 m boom, stowed canopy, winch, battery (ASSUMED layout) = 2.86 L
const T_ARM = 2.0;   // s standstill at the top: one strap tap (ASSUMED)

// lift riders (seated; onLift → no on-snow vibration signature)
function liftRider(dir, dur) {
  const tanS = Math.tan(15 * Math.PI / 180), v = 5, h = 6;
  return (t) => {
    const x = -dir * v * t; // dir +1 = up the slope (−x)
    return { pos: [x, 0, -x * tanS + h], heading: [-dir, 0, 0], vel: [-dir * v, 0, dir * v * tanS], speed: v, lat: 0, accel: 0, lean: 0, crouch: 1, plantL: 0, plantR: 0, fallen: false, psi: 0, onLift: true };
  };
}

function riderFor(sc) {
  const dur = sc.dur;
  if (sc.rider === 'fullrun') {
    const sk = simulateRun({ seed: sc.runSeed ?? FR_CASE.seed });
    const r = makeRider([{ sk: smoothBody(sk), t0: 0 }]);
    return { rider: r, tanS: sk.tanS, sk, dur: sk.duration, stops: sk.stops, riding: availMask(sk) };
  }
  if (sc.rider === 'stopstart') {
    const a = smoothBody(simulateSkier({ start: 'push', duration: 16, stopAt: 12, seed: 3 }));
    const b = smoothBody(simulateSkier({ start: 'push', duration: dur - 22 + 1, seed: 4 }));
    return { rider: makeRider([{ sk: a, t0: 2 }, { sk: b, t0: 22 }]), tanS: a.tanS, sk: a };
  }
  if (sc.rider === 'stand') {
    // standing still; procedure (iteration 3): FACE INTO the wind before tapping stow, so the parked kite is behind,
    // inside the boom's rear cone (sc.face = 'wind' | 'downwind')
    const a = simulateSkier({ style: 'straight', v0: 0, stopAt: 0, duration: dur + 1 });
    const base = makeRider([{ sk: a, t0: 0 }]);
    const wm = sc.wind?.mean || [1, 0, 0], wl = Math.hypot(wm[0], wm[1]) || 1;
    const hd = sc.face === 'downwind' ? [wm[0] / wl, wm[1] / wl, 0] : [-wm[0] / wl, -wm[1] / wl, 0];
    return { rider: (t) => ({ ...base(t), heading: hd }), tanS: a.tanS, sk: a };
  }
  if (sc.rider === 'chairUp' || sc.rider === 'chairDown') return { rider: liftRider(sc.rider === 'chairUp' ? 1 : -1, dur), tanS: Math.tan(15 * Math.PI / 180) };
  let sk = simulateSkier({ duration: dur + 1, ...(sc.skier || {}) });
  if (sc.hardFall) sk = applyHardFall(sk, sc.hardFall.t, sc.hardFall.decel);
  sk = smoothBody(sk);
  return { rider: makeRider([{ sk, t0: sc.tGo || 0 }]), tanS: sk.tanS, sk };
}

function prepare(params, sc) {
  const rf = riderFor(sc);
  const dur = sc.dur ?? rf.dur;
  const p = resolveP({ ...PDEF, ...params, ...(sc.over || {}) });
  const plan = { start: 'flying', ...(sc.plan || {}) };
  const tm = sc.swapAt ?? dur * 0.5;
  // side swap: the kite crosses behind the rider over 5 s and passes 8° higher
  // shot plan: rear-quarter station at ±az with a side swap behind the rider at mid-run, plus two 5 s commanded
  // side shots out to ±azWide (one per half) — the commandable azimuth span the criterion asks for
  if (!plan.shot) plan.shot = (t) => {
    const w = sstep((t - tm) / 5);
    const side = (tc) => sstep((t - tc + p.wideHalf) / 1.5) * (1 - sstep((t - tc - p.wideHalf) / 1.5));
    const wide = (p.azWide - p.az) * (side(dur * 0.25) - side(dur * 0.8));
    return { az: p.az * (1 - 2 * w) + wide, el: p.el + 8 * Math.sin(Math.PI * w) };
  };
  if (sc.branch) { const s = rf.rider(sc.branch.t); plan.branch = { x: s.pos[0] + 0.5, yc: s.pos[1], half: sc.branch.half, h: sc.branch.h }; }
  if (sc.cross) { const s = rf.rider(sc.cross.t), bp = bodyPoints(s); plan.cross = { t: sc.cross.t, x: bp.packTop[0] - sc.cross.behind, y0: bp.packTop[1], vy: sc.cross.vy, h: sc.cross.h, slide: sc.cross.slide }; }
  return { p, dur, stops: rf.stops, riding: rf.riding || null, helmet: sc.rider === 'fullrun' ? (t) => helmetAt(rf.sk, t) : null, input: { duration: dur, rider: rf.rider, tanS: rf.tanS, wind: sc.wind, plan, dt: sc.dt || 0.001, helmet: sc.rider === 'fullrun' ? (t) => helmetAt(rf.sk, t) : null } };
}

// --------------------------------------------------------------- result
const pctl = (a, q) => { if (!a.length) return NaN; const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))]; };
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

// standstill intervals of a rider (speed <0.3 m/s for ≥1 s) on the 20 ms grid
function standstills(RS, dt) {
  const out = []; let a = null;
  for (let i = 0; i < RS.length; i++) {
    const still = RS[i].speed < 0.3;
    if (still && a == null) a = i * dt;
    if ((!still || i === RS.length - 1) && a != null) { const b = i * dt; if (b - a >= 1) out.push([a, b]); a = null; }
  }
  return out;
}

// harmonised + concept metrics from a core run (used by every scenario, the demo and the ensemble)
export function judgeCore(core, A, p, sc, { settle = 2, riding = null } = {}) {
  const O = core.O, n = core.n, dt = 0.02;
  // shared rule (fullrun.js availMask): the full-run riding column from push-off, no settle; otherwise speed > 2 m/s
  if (riding) settle = 0;
  const idx = []; for (let i = 0; i < n; i++) if (i * dt >= settle) idx.push(i);
  const skiing = new Uint8Array(n);
  for (const i of idx) { const s = core.RS[i]; skiing[i] = riding ? (riding[Math.min(riding.length - 1, i)] ? 1 : 0) : s.speed > 2 && !s.fallen && !s.onLift ? 1 : 0; }
  const skiIdx = idx.filter((i) => skiing[i]);
  const pick = (arr, ii) => ii.map((i) => arr[i]).filter(Number.isFinite);
  // round-4 shared rules: bodyPx (feet→head/shoulders, A3-X-04) ≥300 and no product part ≥ARTEFACT_PX wide over the subject (A3-X-01)
  const ok = (i) => A.filming[i] === 1 && A.inFrame[i] === 1 && A.bodyPx[i] >= 300 && A.artF[i] !== 1;
  const avail = skiIdx.length ? skiIdx.filter(ok).length / skiIdx.length : NaN;
  const filmSki = skiIdx.filter((i) => A.filming[i] === 1);
  const availFlying = filmSki.length ? skiIdx.filter(ok).length / filmSki.length : NaN;
  const pxMed = pctl(filmSki.filter((i) => A.inFrame[i] === 1).map((i) => A.bodyPx[i]), 0.5);
  // jitter: LOS relative to the delivered crop axis, >1 Hz ⊕ 0.5 °/s EIS residual (ASSUMED)
  const mask = new Uint8Array(n), los = [], fwd = [];
  let lastL = [1, 0, 0], lastF = [1, 0, 0];
  for (let i = 0; i < n; i++) {
    const okk = skiing[i] && A.filming[i] === 1 && Number.isFinite(A.lx[i]) && Number.isFinite(A.fx[i]);
    mask[i] = okk ? 1 : 0;
    if (okk) { lastL = [A.lx[i], A.ly[i], A.lz[i]]; lastF = [A.fx[i], A.fy[i], A.fz[i]]; }
    los.push(lastL); fwd.push(lastF);
  }
  const jh = jitterHP(los, fwd, dt, mask, 1);
  const jitter = Number.isFinite(jh.rms) ? Math.hypot(jh.rms, 0.5) : NaN;
  const vfm = pctl(pick(A.vfov, filmSki), 0.5);
  const azLP = []; { let y = null; const k = 1 - Math.exp(-dt * 2 * Math.PI * 0.2); for (const i of filmSki) { const a = A.az[i]; if (!Number.isFinite(a)) continue; y = y == null ? a : y + (a - y) * k; azLP.push(y); } }
  const azRange = azLP.length > 50 ? pctl(azLP, 0.95) - pctl(azLP, 0.05) : NaN;
  // body force (audit2 A2-K2-03): the RAW 50 ms moving mean of the line tension computed at the integration step, whole run
  let F50 = 0; for (let i = 0; i < n; i++) if (Number.isFinite(O.T50[i]) && O.T50[i] > F50) F50 = O.T50[i];
  let Traw = 0; for (let i = 0; i < n; i++) if (Number.isFinite(O.Tmax[i]) && O.Tmax[i] > Traw) Traw = O.Tmax[i];
  // KE that can strike others: ground frame when >1.5 m from every body capsule, rider frame within; every non-docked sample
  let keMax = 0; for (let i = 0; i < n; i++) { const md = O.mode[i]; if (md === MODE.DOCKED) continue; const ke = A.bodyDist[i] > 1.5 ? A.keSnow[i] : A.keRel[i]; if (ke > keMax) keMax = ke; }
  // energy (shared rules): kite load (camera via 5 V boost, avionics, servos) is drawn from the kite cell, which is
  // recharged in the dock from the pod pack (90 % charge efficiency) only inside a heated holster (heater counted);
  // pod electronics 0.6 W always; winch electrical power incl. regeneration. Mean over the whole run incl. standstills.
  const allI = []; for (let i = 0; i < n; i++) allI.push(i);
  const Pk = meanOf(allI.map((i) => O.Pk[i])), Pw = meanOf(pick(O.Pw, allI));
  // active boom gimbal (2 brushless gimbal motors holding ≈0.13 Nm + IMU/driver, ASSUMED 1.5 W) while the boom is out
  const boomOut = p.boom && p.boomActive ? allI.filter((i) => O.bx[i] > 0.5).length / n : 0;
  const Pmean = Pk / 0.9 + Pw + p.pPack + boomOut * (p.pGimbal || 0);
  const endurance = enduranceMin(p.packWh + p.podWh, Pmean, { heated: true });
  const filmShare = n ? allI.filter((i) => A.filming[i] === 1).length / n : NaN;
  const sortieMin = (p.podWh * BATTERY.coldFactor * (1 - BATTERY.reserve) * 60) / p.pKite;
  // events → actions / standstill
  const evs = (type) => core.events.filter((e) => e.type === type);
  const manualN = core.manual;
  const strayLanded = evs('landed').length && !evs('pickedUp').length && !evs('relift').length && !evs('giveUp').length ? 1 : 0;
  const lost = evs('release').length > 0 || evs('cut').length > 0;
  const stowTaps = evs('stowcmd').length;
  const armTap = sc.plan?.armAt != null || /^(fullrun|stopstart)/.test(sc.id) ? 1 : 1;
  const ops = armTap + stowTaps + manualN + strayLanded + (lost ? 1 : 0);
  // standstill attributable to the device (shared rule: simulated, no per-action constants): arm tap 2 s + for EVERY stop
  // the wait from standstill until the kite is stowed (incl. reeling a landed rag in and any simulated hand time), counted
  // beyond the rider's own rest at mid-run stops and in full at the last stop; a kite not stowed by the end costs the rest + 10 s
  const stops = standstills(core.RS, dt);
  let wait = 0;
  const stowedT = core.dockInfo.stowT;
  stops.forEach(([a, b2], k) => {
    const last = k === stops.length - 1;
    const iA = Math.min(n - 1, Math.round(a / dt));
    const airborne = O.mode[iA] !== MODE.DOCKED;
    const st = stowedT.find((x) => x >= a - 5 && x <= b2 + 30);
    const wv = st != null ? Math.max(0, st - a) : airborne ? b2 - a + 10 : 0;
    wait += last ? wv : Math.max(0, wv - (b2 - a));
  });
  let setup = /^dock_w/.test(sc.id) ? (() => { const st = stowedT[0]; return Number.isFinite(st) ? T_ARM + (st - (sc.plan.stowAt - 1)) : T_ARM + sc.dur + 20; })() : T_ARM + wait;
  const measuredSetup = /^dock_w/.test(sc.id) || stops.length > 0;
  return { idx, skiing, skiIdx, filmSki, avail, availFlying, pxMed, jitter, vfm, azRange, F50, Traw, keMax, Pk, Pw, Pmean, endurance, filmShare, sortieMin, ops, setup, measuredSetup, manualN, stops, evs, lost };
}

function buildResult(params, sc, prep, { demo = false, settle = 2 } = {}) {
  const { p } = prep;
  const dur = prep.dur ?? sc.dur;
  const core = runCore(p, prep.input);
  const A = analyse(core, { fc: p.cropFc ?? 1.0, helmet: prep.helmet });
  const O = core.O, n = core.n, dt = 0.02;
  const R = makeResult({ conceptId: 'kite2', scenarioId: sc.id, modelVersion: MV, duration: dur, sampleDt: dt });
  if (R.n !== n) throw new Error('sample count mismatch');
  const C = (k, src) => { const c = R.col(k); c.set(src); return c; };
  C('tension', O.T); C('lineOut', O.L); C('reelRate', O.nu); C('psi', O.psi); C('glide', O.G); C('cr', O.CR); C('trim', O.alpha); C('reef', O.reef); C('collapsed', O.col); C('airspeed', O.Va);
  C('elK', O.elK); C('azK', O.azK); C('elT', O.elT); C('azT', O.azT); C('mode', O.mode); C('pWinch', O.Pw); C('eRegen', O.Ereg);
  C('subjectPx', A.subjectPx); C('azView', A.az); C('elevView', A.elev); C('dist', A.dist); C('art', A.art); C('keSnow', A.keSnow); C('keRel', A.keRel);
  C('headDist', A.headDist); C('crossH1', A.crossH1); C('crossH2', A.crossH2); C('clearBody', A.clearBody); C('vfov', A.vfov);
  const speed = R.col('speed'), kspd = R.col('kiteSpeed');
  for (let i = 0; i < n; i++) { const s = core.RS[i]; speed[i] = s.speed; kspd[i] = Math.hypot(O.kvx[i], O.kvy[i], O.kvz[i]); }
  for (const e of core.events) R.events.push(e);

  const J = judgeCore(core, A, p, sc, { settle, riding: prep.riding });
  const { idx, skiing, skiIdx, filmSki } = J;
  const pick = (arr, ii) => ii.map((i) => arr[i]).filter(Number.isFinite);
  const max = (a) => (a.length ? Math.max(...a) : NaN), min = (a) => (a.length ? Math.min(...a) : NaN);
  const nb = (x) => (Number.isFinite(x) ? x : 'n/a');
  const M = (id, zh, en, v, unit, pass, cz, ce) => R.metric(id, zh, en, v, unit, pass, cz ? { zh: cz, en: ce } : null);
  const design = (p.design ?? 2) | 0;
  const WM = wornMass(p);
  const noSki = skiIdx.length === 0;

  addStd(R, 'avail', noSki ? 'n/a' : J.avail * 100, { zh: '原始画面；起降/入舱时段计为不可用', en: 'raw footage; launch/dock time counts as unavailable' });
  addStd(R, 'pxMed', nb(J.pxMed));
  addStd(R, 'jitterRms', nb(J.jitter));
  addStd(R, 'azRange', nb(J.azRange));
  addStd(R, 'addedMass', design === 0 ? Object.values(MASS0).reduce((a, b) => a + b, 0) : WM.kg, { zh: '风筝按共享元件表，舱体部件 +15 % 余量', en: 'kite from the shared component table, pod items +15 % margin' });
  addStd(R, 'bodyForcePeak', J.F50);
  addStd(R, 'handsBusy', 0, { zh: '武装/人工塞入都在停稳时', en: 'arm tap / manual push-in happen while stopped' });
  const setupV = J.measuredSetup ? J.setup : ENSEMBLE.metrics.setupTime.p90;
  addStd(R, 'setupTime', nb(setupV), J.measuredSetup ? { zh: '起始按键 2 s + 最后一次停下到收纳完成 + 每次人工 15 s', en: 'arm tap 2 s + last stop → stowed + 15 s per manual intervention' } : { zh: '无停站工况：取 48 例整趟集合 p90', en: 'no stop in this scenario: 48-case full-run ensemble p90' });
  addStd(R, 'ops', J.ops, { zh: '每趟武装 1 次（爬升自动解除）；+人工塞入/拾起；+按键收纳', en: 'arm once per run (climb auto-disarms); + manual push-in/pick-up; + stow taps' });
  addStd(R, 'keMax', nb(J.keMax));
  // headClear (shared, re-audit 2026-10-20): whole run incl. stops/launch/landing; declared exclusion = STOW (≤3 s capture)
  const hcAll = Array.from(A.headClear).filter(Number.isFinite);
  const headClearV = hcAll.length ? Math.min(...hcAll) : NaN;
  addStd(R, 'headClear', nb(headClearV), { zh: '绳（臂杆端以外）、控制单元、伞衣到头盔中心；排除声明的 2.5 s 落座-收纳窗口', en: 'line beyond the boom tip, KCU and canopy to the helmet centre; declared 2.5 s seat-to-stowed window excluded' });
  addStd(R, 'packVol', design === 0 ? 6.5 : PACK_L, design === 0 ? { zh: '第一轮发射杆+卷轴+300 g 风筝（估）', en: 'round-1 boom + reel + 300 g kite (estimate)' } : { zh: '舱体 260×110×100 mm 含缩回的 0.26 m 细臂杆与被动枢轴、收拢的伞衣、电动卷线器、电池（假设布局）', en: 'pod 260×110×100 mm incl. the collapsed 0.26 m slender boom and passive pivot, snuffed canopy, motorised reel, battery (ASSUMED layout)' });
  const endV = sc.id === 'fullrun' || noSki ? (sc.id === 'fullrun' ? J.endurance : ENSEMBLE.metrics.endurance.mean) : ENSEMBLE.metrics.endurance.mean;
  addStd(R, 'endurance', nb(endV), { zh: '全部随身电池、−10 °C、15 % 储备、加热充电、按整趟平均功率', en: 'all worn cells, −10 °C, 15 % reserve, heated charging, full-run mean power' });
  // ---- concept-specific
  const Tfilm = pick(O.T, idx.filter((i) => O.mode[i] === MODE.FILM && skiing[i]));
  const Tm = meanOf(Tfilm);
  M('tensionMean', '拍摄时平均拉力', 'Mean pull while filming', nb(Tm), 'N', null);
  M('tensionSwing', '拉力摆动 (p95−p5)/2/均值', 'Pull swing (p95−p5)/2/mean', nb(Tfilm.length ? 100 * (pctl(Tfilm, 0.95) - pctl(Tfilm, 0.05)) / 2 / Tm : NaN), '%', Tfilm.length ? 100 * (pctl(Tfilm, 0.95) - pctl(Tfilm, 0.05)) / 2 / Tm <= 60 : null, '≤60 %（假设）', '≤60 % (ASSUMED)');
  const elv = pick(A.elev, filmSki);
  M('viewElev', '视角仰角（中位）', 'View elevation (median)', nb(pctl(elv, 0.5)), '°', elv.length ? pctl(elv, 0.5) <= 55 : null, '≤55°（非俯视；第二轮放宽自 50°，较高俯视为用户原始取景，假设）', '≤55° (not top-down; relaxed from 50° in iteration 2 — a higher overhead view is the user\'s original framing, ASSUMED)');
  M('availFlying', '风筝在机位时的可用率（参考）', 'Avail while on station (info)', nb(J.availFlying * 100), '%', null);
  const trimF = pick(O.alpha, idx.filter((i) => O.mode[i] === MODE.FILM)), reefF = pick(O.reef, idx.filter((i) => O.mode[i] === MODE.FILM)), gF = pick(O.G, idx.filter((i) => O.mode[i] === MODE.FILM)), crF = pick(O.CR, idx.filter((i) => O.mode[i] === MODE.FILM));
  M('filmGlide', '拍摄时升阻比（中位，极曲线上）', 'L/D while filming (median, on the polar)', nb(pctl(gF, 0.5)), '', null);
  M('filmCR', '拍摄时合力系数 CR（中位，满面积基准）', 'CR while filming (median, full-area basis)', nb(pctl(crF, 0.5)), '', null);
  M('filmReef', '拍摄时收口面积比（中位）', 'Reefed area ratio while filming (median)', nb(pctl(reefF, 0.5)), '', null);
  M('filmTrim', p.canopy === 'round' ? '拍摄时排气缝开度（中位）' : '拍摄时迎角（中位）', p.canopy === 'round' ? 'Slot opening while filming (median)' : 'Angle of attack while filming (median)', nb(pctl(trimF, 0.5)), p.canopy === 'round' ? '' : '°', null);
  M('collapses', '伞衣塌陷次数', 'Canopy collapses', core.nCollapse, '', null);
  M('kiteSpeedMax', '风筝对地速度最大值', 'Max kite ground speed', nb(max(pick(kspd, idx.filter((i) => O.mode[i] !== MODE.DOCKED)))), 'm/s', null);
  const preSnag = skiIdx.filter((i) => O.mode[i] === MODE.FILM && O.snag[i] === 0);
  const h1 = pick(A.crossH1, preSnag), h2 = pick(A.crossH2, preSnag);
  M('lineH1m', '身后 1 m 处臂杆/绳离地高度（最小）', 'Boom/line height 1 m behind the rider (min)', nb(min(h1)), 'm', h1.length ? min(h1) >= 2.0 : null, '≥2.0 m（高于头盔，假设）', '≥2.0 m (above helmet height, ASSUMED)');
  M('lineH1p10', '身后 1 m 处臂杆/绳离地高度（p10）', 'Boom/line height 1 m behind the rider (p10)', nb(pctl(h1, 0.1)), 'm', null);
  M('lineH2m', '身后 2 m 处绳离地高度（p5）', 'Tether height 2 m behind the rider (p5)', nb(pctl(h2, 0.05)), 'm', h2.length ? pctl(h2, 0.05) >= 2.2 : null, '≥2.2 m（审计建议）', '≥2.2 m (audit recommendation)');
  M('lineH2min', '身后 2 m 处绳离地高度（最小）', 'Tether height 2 m behind the rider (min)', nb(min(h2)), 'm', null);
  const cb = pick(A.clearBody, skiIdx.filter((i) => O.snag[i] === 0));
  M('clearBody', '系留绳到身体最小间隙（出口 0.3 m 以外）', 'Min tether-to-body clearance (beyond 0.3 m from the exit)', nb(min(cb)), 'm', cb.length ? min(cb) >= 0.1 : null, '≥0.1 m', '≥0.1 m');
  const bh = Array.from(A.boomHead).filter(Number.isFinite);
  if (bh.length) M('boomHead', '臂杆（随身刚性件）到头盔中心最小距离', 'Min boom (worn rigid part) to helmet-centre distance', min(bh), 'm', null);
  M('bodyForceRawMax', '绳张力瞬时最大（积分步长，参考）', 'Line tension instantaneous max (integration step, info)', J.Traw, 'N', null);
  M('govTime', '动能调速器软离合时间', 'KE governor soft-clutch time', core.govT, 's', null);
  M('landedRiding', '滑行中伞衣在雪面上的时间', 'Time with the canopy on the snow while riding', core.landedRiding, 's', null);
  M('regenJ', '绞盘再生能量（放线时发电）', 'Winch regenerated energy (pay-out)', O.Ereg[n - 1], 'J', null);
  M('pMean', '整趟平均电功率（全部随身）', 'Mean electrical power over the run (everything worn)', J.Pmean, 'W', null);
  M('sortieMin', `风筝 ${p.podWh} Wh 电池单次飞行（−10 °C）`, `Kite ${p.podWh} Wh cell per sortie (−10 °C)`, J.sortieMin, 'min', J.sortieMin >= 10, '≥10 min（≥2 趟，假设）', '≥10 min (≥2 runs, ASSUMED)');
  M('vMinFly', '最低飞行相对风速（不收口，仰角≥坡面+20°，张力≥1 N）', 'Min flying apparent wind (unreefed, ≥20° above slope, ≥1 N)', vMinFly(p), 'm/s', null);
  M('launches', '起飞次数', 'Launches', core.launches, '', null);
  M('manualActions', '人工干预（塞入/拾起）', 'Manual interventions (push-in / pick-up)', J.manualN, '', null);
  if (core.docks || J.evs('docked').length) {
    const ang = core.dockInfo.err.length ? Math.max(...core.dockInfo.err) : NaN;
    M('dockAngle', '入舱偏轴角（最大）', 'Dock off-axis angle (max)', nb(ang), '°', Number.isFinite(ang) ? ang <= p.funnelAcc : null, `≤${p.funnelAcc}°（漏斗捕获，假设）`, `≤${p.funnelAcc}° (funnel capture, ASSUMED)`);
    M('dockRetries', '入舱重试次数', 'Dock retries', J.evs('redock').length, '', J.evs('redock').length <= 1, '≤1', '≤1');
  }
  if (/^chair/.test(sc.id)) M('liftLaunch', '缆车上起飞次数', 'Launches on the lift', core.launches, '', core.launches === 0, '0', '0');
  if (sc.cross) {
    const cI = idx.filter((k) => O.snag[k] === 1); const fN = cI.length ? Math.max(...cI.map((k) => Math.max(O.T[k], 0.4 * O.Tmax[k]))) : 0;
    M('neighbourForce', '横穿者身上的绳力（峰值）', 'Line force on the crossing skier (peak)', fN, 'N', fN <= 10, '≤10 N（审计：弱连接级，假设）', '≤10 N (audit: weak-link level, ASSUMED)');
    M('contact', '是否接触（绳）', 'Line contact occurred', J.evs('contact').length ? 'yes' : 'no', '', null);
    const bh2 = core.boomHit;
    M('boomContact', '是否碰到臂杆', 'Boom contact occurred', bh2 ? 'yes' : 'no', '', null);
    if (bh2) { M('boomImpulse', '臂杆对横穿者冲量', 'Boom impulse on the crossing skier', bh2.J, 'N·s', null); M('boomForce', '臂杆对横穿者平均力（50 ms 假设）', 'Boom mean force on the crossing skier (50 ms ASSUMED)', bh2.J / 0.05, 'N', bh2.J / 0.05 <= 40, '≤40 N（同身体力上限，假设）', '≤40 N (same as the body-force limit, ASSUMED)'); }
  }
  if (sc.branch || sc.cross) {
    const left = J.evs('release').length ? { zh: '系留绳与风筝留在树上/树下（背包端已释放）', en: 'line and kite left at the tree (pack end released)' } : J.evs('unhooked').length || !J.evs('contact').length ? { zh: '无', en: 'nothing' } : { zh: '仍挂着', en: 'still caught' };
    R.metric('leftOnObstacle', '留在障碍物上的东西：' + left.zh, 'Left on the obstacle', left.en, '', left.en === 'nothing', { zh: '无', en: 'nothing' });
  }
  if (sc.id === 'fullrun') {
    const E = ENSEMBLE.metrics;
    M('ensAvail', '整趟集合：可用率均值（48 例）', 'Full-run ensemble: avail mean (48 cases)', E.avail.mean, '%', E.avail.mean >= 80, '≥80 %', '≥80 %');
    M('ensAvailP10', '整趟集合：可用率 p10', 'Full-run ensemble: avail p10', E.avail.p10, '%', null);
    M('ensSetupP90', '整趟集合：停留时间 p90', 'Full-run ensemble: standstill p90', E.setupTime.p90, 's', E.setupTime.p90 <= 30, '≤30 s', '≤30 s');
    M('ensOpsP90', '整趟集合：操作次数 p90', 'Full-run ensemble: actions p90', E.ops.p90, '', E.ops.p90 <= 2, '≤2', '≤2');
    M('ensOpsMax', '整趟集合：操作次数最大', 'Full-run ensemble: actions max', E.ops.max, '', null);
    M('ensForceMax', '整趟集合：身体峰值力最大', 'Full-run ensemble: body force max', E.bodyForcePeak.max, 'N', E.bodyForcePeak.max <= 40, '≤40 N', '≤40 N');
    M('ensKeMax', '整趟集合：动能最大', 'Full-run ensemble: KE max', E.keMax.max, 'J', E.keMax.max <= 14.9, '≤14.9 J', '≤14.9 J');
    M('ensEndurance', '整趟集合：续航（平均功率）', 'Full-run ensemble: endurance (mean power)', E.endurance.mean, 'min', E.endurance.mean >= 45, '≥45 min', '≥45 min');
  }
  if (sc.fault || sc.id === 'fall' || /^chair/.test(sc.id)) {
    const SAFE = ['bodyForcePeak', 'keMax', 'headClear', 'leftOnObstacle', 'headLaunch', 'clearBody', 'neighbourForce', 'boomForce', 'liftLaunch', 'addedMass', 'packVol'];
    for (const m of R.metrics) if (!SAFE.includes(m.id) && m.pass != null) { m.pass = null; m.criterion = m.criterion ? { zh: m.criterion.zh + '（故障/安全工况不判）', en: m.criterion.en + ' (fault/safety scenario: not judged)' } : null; }
  }
  if (sc.id === 'fast') for (const m of R.metrics) if (['avail', 'pxMed', 'jitterRms', 'azRange', 'viewElev', 'tensionSwing', 'lineH1m', 'lineH2m'].includes(m.id) && m.pass != null) { m.pass = null; m.criterion = { zh: m.criterion.zh + '（超出拍摄包线：自动入舱，不判画面）', en: m.criterion.en + ' (outside the filming envelope: auto-docks, footage not judged)' }; }
  if (sc.compare) for (const m of R.metrics) if (['lineH1m', 'lineH2m'].includes(m.id)) m.pass = null;

  // ---- plots
  R.plots.push({ key: 'force', zh: '拉力与绞盘', en: 'Pull and winch', series: [['tension', 'N', '系留张力', 'Tether tension'], ['lineOut', 'm', '放线长度', 'Line out'], ['reelRate', 'm/s', '收放速度（+放）', 'Reel rate (+out)'], ['speed', 'm/s', '滑雪者速度', 'Rider speed']] });
  R.plots.push({ key: 'ctrl', zh: '控制单元：同一极曲线上的升阻比与合力系数、收口、滚转', en: 'KCU: L/D and CR on one polar, reefing, roll', series: [['glide', '—', '升阻比 L/D', 'L/D'], ['cr', '—', '合力系数 CR', 'Resultant coeff. CR'], ['reef', '—', '收口面积比', 'Reefed area ratio'], ['psi', '°', '滚转 ψ', 'Roll ψ'], ['airspeed', 'm/s', '空速', 'Airspeed']] });
  R.plots.push({ key: 'station', zh: '机位（相对行进方向）', en: 'Station (relative to the course)', series: [['elK', '°', '仰角', 'Elevation'], ['elT', '°', '仰角目标', 'Elevation target'], ['azK', '°', '方位', 'Azimuth'], ['azT', '°', '方位目标', 'Azimuth target']] });
  R.plots.push({ key: 'frame', zh: '画面', en: 'Footage', series: [['subjectPx', 'px', '人物像高', 'Subject px'], ['azView', '°', '视角方位', 'View azimuth'], ['elevView', '°', '视角仰角', 'View elevation'], ['art', '%', '主体上≥1 px 绳伪影', '≥1 px line artefact over subject']] });
  R.plots.push({ key: 'safety', zh: '安全', en: 'Safety', series: [['keSnow', 'J', '对地动能', 'KE vs snow'], ['headDist', 'm', '风筝-头盔距离', 'Kite–helmet distance'], ['crossH1', 'm', '身后 1 m 绳高', 'Line height 1 m behind'], ['kiteSpeed', 'm/s', '风筝速度', 'Kite speed']] });

  // ---- validity
  if (sc.hardFall) { R.validUntil = sc.hardFall.t + 2.5; R.event(R.validUntil, 'scope', 'invalid', '此后滑雪者翻滚/倒地姿态未建模，绳-身体缠绕无法评估', 'Beyond this the tumbling/lying rider is not modelled; tether–body wrap cannot be assessed'); }
  const inval = core.events.find((e) => e.severity === 'invalid');
  if (inval) R.validUntil = R.validUntil == null ? inval.t : Math.min(R.validUntil, inval.t);
  const rel = core.events.find((e) => e.type === 'release');
  if (rel) { R.scopeEnd = rel.t + 1; R.event(rel.t + 1, 'scope', 'info', '释放后绳与风筝在树上的运动未建模', 'Line/kite motion in the tree after release not modelled'); }
  R.events.sort((a, b) => a.t - b.t);

  // ---- frames
  const lerp = (a, b, w) => a + (b - a) * w;
  const dockT = core.dockInfo.dockT;
  R.frame = (t) => {
    const f = Math.max(0, Math.min(n - 1, t / dt)), i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), w = f - i0;
    const L = (k) => lerp(O[k][i0], O[k][i1], w);
    const La = (o, k) => (Number.isFinite(o[k][i0]) ? (Number.isFinite(o[k][i1]) ? lerp(o[k][i0], o[k][i1], w) : o[k][i0]) : NaN);
    const s = core.rider(t);
    const md = O.mode[i0];
    const lastDock = dockT.filter((x) => x <= t + 1e-9).pop();
    const stowP = md === MODE.STOW && lastDock != null ? Math.min(1, (t - lastDock) / p.tStow) : md === MODE.DOCKED ? 1 : 0;
    const launchT = core.dockInfo.launchT.filter((x) => x <= t + 1e-9).pop();
    const launchP = md === MODE.LAUNCH && launchT != null ? Math.min(1, (t - launchT) / 0.5) : 1;
    const cam = Number.isFinite(A.cpx[i0]) ? [La(A, 'cpx'), La(A, 'cpy'), La(A, 'cpz')] : null;
    const fw = Number.isFinite(A.fx[i0]) ? [La(A, 'fx'), La(A, 'fy'), La(A, 'fz')] : null;
    const dev = {
      mode: md, kite: [L('kx'), L('ky'), L('kz')], er: [L('ex'), L('ey'), L('ez')], air: [L('wx') - L('kvx'), L('wy') - L('kvy'), L('wz') - L('kvz')],
      psi: L('psi'), G: L('G'), CR: L('CR'), trim: L('alpha'), reef: L('reef'), collapsed: O.col[i0] > 0.5, canopy: p.canopy, infl: L('infl'), flag: L('flag'), anchor: [L('ax'), L('ay'), L('az')], L: L('L'), tension: L('T'), reel: L('nu'),
      docked: md === MODE.DOCKED, stow: stowP, launch: launchP, lid: md === MODE.DOCKED ? 0 : md === MODE.STOW ? 1 - sstep((stowP - 0.6) / 0.4) : 1,
      mast: 0, boom: p.boom ? { pivot: [L('px'), L('py'), L('pz')], dir: [L('bdx'), L('bdy'), L('bdz')], len: p.boomC + (p.boom - p.boomC) * L('bx'), bx: L('bx'), full: p.boom, dBase: p.boomDBase, dTip: p.boomDTip } : null,
      seated: md === MODE.DOCKED || md === MODE.STOW || md === MODE.EXTEND, extending: md === MODE.EXTEND, prox: O.prox[i0] > 0.5, gov: O.gov[i0] > 0.5,
      snag: Number.isFinite(O.sx[i0]) ? [O.sx[i0], O.sy[i0], O.sz[i0]] : null, released: O.brake[i0] === 2 || O.brake[i0] === 3, cut: O.brake[i0] === 3, freeSpool: O.brake[i0] === 4,
      branch: prep.input.plan.branch ? { ...prep.input.plan.branch, z: -prep.input.plan.branch.x * core.tanS + prep.input.plan.branch.h } : null,
      neighbour: prep.input.plan.cross && Math.abs(t - prep.input.plan.cross.t) < 2.5 ? [prep.input.plan.cross.x, prep.input.plan.cross.y0 + prep.input.plan.cross.vy * (t - prep.input.plan.cross.t), -prep.input.plan.cross.x * core.tanS] : null,
      cam, crop: fw, design, span: Math.sqrt(p.S * 4 / Math.PI), camOff: p.camOff,
      course: [O.cx[i0], O.cy[i0], 0], warn: core.events.some((e) => e.severity !== 'info' && e.t <= t && e.t > t - 3),
    };
    const skier = { ...s, pack: 'plain' };
    if (sc.handTaps) for (const [ta, tb] of sc.handTaps) {
      if (t > ta && t < tb) { const b = bodyPoints(s); const u = Math.sin(Math.PI * (t - ta) / (tb - ta)); skier.handL = [b.chest[0] + s.heading[0] * 0.1 + b.left[0] * 0.12, b.chest[1] + s.heading[1] * 0.1 + b.left[1] * 0.12, b.chest[2] + 0.14]; skier.reachL = u; }
    }
    const labels = demo ? [] : [{ p: [dev.anchor[0], dev.anchor[1], dev.anchor[2] + 0.35], text: `${dev.tension.toFixed(1)} N`, color: dev.tension > 20 ? '#ff6a5a' : '#ffd27a' }, { p: [dev.kite[0], dev.kite[1], dev.kite[2] + 0.9], text: `${dev.L.toFixed(1)} m`, color: '#9cc8ff' }];
    const filming = A.filming[i0] === 1 && cam && fw;
    return { t, tanS: core.tanS, skier, device: dev, labels, productCam: filming ? { pos: cam, fwd: fw, up: [0, 0, 1], vfovDeg: Number.isFinite(A.vfov[i0]) ? A.vfov[i0] : 40, label: 'K2 风筝相机（4K 重构图）/ K2 kite cam (4K reframed)' } : null };
  };
  R.core = core; R.analysis = A; R.judge = J;
  return R;
}

function simulate(params, scenario) {
  const sc = scenario || SCEN[0];
  return buildResult(params, sc, prepare(params, sc));
}

// --------------------------------------------------------------- full-run ensemble (shared, audit X-04)
// one case of FULLRUN_CASES → judged numbers (fast path: no Result object)
export function evaluateCase(params, c, { dt = 0.002, fs = true } = {}) {
  const sc = { ...SCEN.find((x) => x.id === 'fullrun'), runSeed: c.seed, dt, wind: { mean: c.mean, intensity: c.intensity ?? 0.15, Lu: 28, seed: c.seed }, plan: { start: 'docked', armAt: 0 } };
  const prep = prepare(params, sc);
  // the full Result is built so the SHARED footageStability(R) jitter (subject RMS) is computed on every case
  const R = buildResult(params, sc, prep);
  const core = R.core, A = R.analysis, J = R.judge;
  const fsr = fs ? footageStability(R) : { subjectRms: NaN, backgroundRms: NaN, samples: 0 };
  const ev = (k) => core.events.filter((e) => e.type === k).length;
  const hc = Array.from(A.headClear).filter(Number.isFinite), bh = Array.from(A.boomHead).filter(Number.isFinite);
  const h1 = J.filmSki.map((i) => A.crossH1[i]).filter(Number.isFinite), h2 = J.filmSki.map((i) => A.crossH2[i]).filter(Number.isFinite), h3 = J.filmSki.map((i) => A.crossH3[i]).filter(Number.isFinite);
  // clothesline exposure (round 4): share of airborne riding samples where the boom/line is below 1.8 m above the snow anywhere 1–3 m behind
  const hMin = J.skiIdx.map((i) => Math.min(...[A.crossH1[i], A.crossH2[i], A.crossH3[i]].filter(Number.isFinite))).filter(Number.isFinite);
  const lowShare = hMin.length ? hMin.filter((v) => v < 1.8).length / hMin.length : NaN;
  return {
    id: c.id, U: c.U, dir: c.dir, seed: c.seed,
    avail: J.avail * 100, pxMed: J.pxMed, azRange: J.azRange, jitterRms: fsr.subjectRms, jitterOwn: J.jitter, fsBackground: fsr.backgroundRms, fsSamples: fsr.samples, setupTime: J.setup, ops: J.ops, bodyForcePeak: J.F50, tensionRawMax: J.Traw, keMax: J.keMax, endurance: J.endurance,
    headClear: hc.length ? Math.min(...hc) : NaN, boomHead: bh.length ? Math.min(...bh) : NaN,
    pMeanW: J.Pmean, launches: core.launches, docks: ev('docked'), manual: J.manualN, collapses: core.nCollapse, landed: ev('landed'), landedDock: ev('landedDock'), landedRidingS: core.landedRiding, relift: ev('relift'), fastDock: ev('fastDock'), redock: ev('redock'), giveUp: ev('giveUp'), govN: core.govN, govT: core.govT,
    dockResidMax: core.dockInfo.err.length ? Math.max(...core.dockInfo.err) : NaN,
    viewElev: pctl(J.filmSki.map((i) => A.elev[i]).filter(Number.isFinite), 0.5),
    lineH1min: h1.length ? Math.min(...h1) : NaN, lineH1p10: pctl(h1, 0.1),
    lineH2min: h2.length ? Math.min(...h2) : NaN, lineH2p5: pctl(h2, 0.05), lineH2p10: pctl(h2, 0.1),
    lineH3min: h3.length ? Math.min(...h3) : NaN, lineH3p10: pctl(h3, 0.1), lineLowShare: lowShare * 100, lineH13med: pctl(hMin, 0.5),
    tensionMean: meanOf(J.filmSki.filter((i) => core.O.mode[i] === MODE.FILM).map((i) => core.O.T[i])),
    reefMed: pctl(J.filmSki.filter((i) => core.O.mode[i] === MODE.FILM).map((i) => core.O.reef[i]), 0.5),
  };
}
export function summarise(rows) {
  const keys = ['avail', 'pxMed', 'azRange', 'jitterRms', 'jitterOwn', 'setupTime', 'ops', 'bodyForcePeak', 'tensionRawMax', 'keMax', 'endurance', 'headClear', 'boomHead', 'viewElev', 'lineH1min', 'lineH1p10', 'lineH2min', 'lineH2p5', 'lineH2p10', 'lineH3min', 'lineH3p10', 'lineLowShare', 'lineH13med', 'pMeanW', 'tensionMean', 'manual', 'collapses', 'landed', 'landedRidingS', 'govT', 'dockResidMax'];
  const st = (k, rr) => { const v = rr.map((r) => r[k]).filter(Number.isFinite); return { mean: +meanOf(v).toFixed(2), p10: +pctl(v, 0.1).toFixed(2), p90: +pctl(v, 0.9).toFixed(2), min: +Math.min(...v).toFixed(2), max: +Math.max(...v).toFixed(2), n: v.length }; };
  const metrics = Object.fromEntries(keys.map((k) => [k, st(k, rows)]));
  const bins = {};
  for (const r of rows) { const key = r.U === 0 ? 'calm' : `${r.U}ms_${r.dir}`; (bins[key] ||= []).push(r); }
  const byBin = Object.fromEntries(Object.entries(bins).map(([k, rr]) => [k, Object.fromEntries(['avail', 'jitterRms', 'setupTime', 'ops', 'bodyForcePeak', 'keMax', 'headClear', 'lineH1min', 'viewElev', 'manual'].map((m) => [m, st(m, rr)]))]));
  const bySpeed = {};
  for (const r of rows) (bySpeed[r.U] ||= []).push(r);
  const bySpeedBin = Object.fromEntries(Object.entries(bySpeed).map(([k, rr]) => [k, Object.fromEntries(['avail', 'jitterRms', 'setupTime', 'ops', 'bodyForcePeak', 'keMax', 'endurance', 'headClear', 'lineH1min', 'lineH2min'].map((m) => [m, st(m, rr)]))]));
  return { metrics, byBin, bySpeedBin };
}

// --------------------------------------------------------------- demo
const DEMO_T = 52;
const STAGES = [
  { key: 'carry', t0: 0, t1: 5, title: { zh: '山顶', en: 'At the top' }, zh: '整套装置是背包顶上一个 2.9 L 的舱：约 90 g 的收口圆伞风筝收在收卷套里，1.45 m、3 mm 粗的伸缩碳管臂杆缩成 0.26 m 平躺在舱盖上，舱内是带摩擦制动的电动卷线器。戴手套按一下肩带键即武装（坐缆车爬升自动解除）。', en: 'The device is a 2.9 L pod on the pack top: the ≈90 g reefing round-canopy kite sits in its snuffer sleeve, the 1.45 m, 3 mm telescopic carbon boom lies collapsed (0.26 m) on the lid, and inside is a drag-braked motorised reel. One gloved tap arms it (any lift climb auto-disarms it).', pending: false },
  { key: 'launch', t0: 5, t1: 12, title: { zh: '滑行中自动起飞', en: 'Auto launch while moving' }, zh: '只在下滑、雪面有振动、且估计相对风 ≥7 m/s 时起飞：臂杆弹出，臂端空速计（带噪声）确认后放出收口的伞衣，先在短绳上爬高，再借摩擦制动放线到 5 m。弹射与充气为示意，待实物验证。', en: 'Launches only while descending on snow with an estimated apparent wind ≥7 m/s: the boom springs out, the (noisy) tip pitot confirms the airspeed, the canopy is released REEFED, climbs on a short line, then the drag lets the line out to 5 m. Ejection and inflation are illustrative, pending hardware.', pending: true },
  { key: 'film', t0: 12, t1: 24, title: { zh: '后侧方跟拍', en: 'Rear-quarter follow' }, zh: '排气缝开度定升阻比（实测级 0.75）→ 约 35° 视角仰角；收口压住拉力；细臂杆由绳张力自动对正、无电机，在成片中不到 2 像素宽。卷线器靠防逆转轴承保持，不耗电。内嵌窗为 4K 宽画面事后重构图。', en: 'Slot opening sets the glide (documented 0.75) → ≈35° view elevation; reefing holds the pull; the thin boom is aligned by the line tension (no motors) and is under 2 px wide in the delivered clip. The reel holds on its anti-reverse bearing at zero current. The inset is the post-run reframed crop of the 4K frame.', pending: false },
  { key: 'gust', t0: 24, t1: 31, title: { zh: '7 m/s 侧向阵风', en: 'A 7 m/s side gust' }, zh: '阵风来时收口加深；张力超过卷线器摩擦制动时线被动、即时地放出（像渔线轮卸力），电机只在之后慢慢收回；风筝估计对地速度超过调速门限时电磁铁把制动松到 2 N。', en: 'In the gust the reefing tightens; when the tension exceeds the reel drag the line slips out passively and instantly (like a fishing reel), and the motor only reels it back afterwards; if the estimated kite ground speed passes the governor threshold a solenoid drops the drag to 2 N.', pending: false },
  { key: 'swap', t0: 31, t1: 38.5, title: { zh: '换到右后方', en: 'Swap to rear-right' }, zh: '镜头指令：风筝从左后方经身后飞到右后方；臂杆被绳带着转向。', en: 'Shot command: the kite crosses behind from rear-left to rear-right; the line swings the boom with it.', pending: false },
  { key: 'retrieve', t0: 38.5, t1: 41, title: { zh: '刹车即收回', en: 'Braking: retrieve at once' }, zh: '一检测到急停，电机在其电压/电流包络内收线（≤5.5 m/s，受动能上限约束），趁相对风还从前方来，风筝在骑手停稳前沿臂杆轴线滑上臂端。', en: 'The moment a hard stop is detected the motor reels in within its voltage/current envelope (≤5.5 m/s, capped by the KE limit) while the apparent wind is still from ahead, so the kite slides onto the boom tip along the boom axis before the rider has stopped.', pending: false },
  { key: 'stow', t0: 41, t1: DEMO_T, title: { zh: '收纳', en: 'Stow' }, zh: '伞衣先在臂端收卷套里收拢（1 s），臂杆再缩回、放平（1.2 s），舱盖关闭：从落座到收好 2.5 s。收纳与 3 mm 臂杆可靠性待实物测试（≥500 次湿/冰/阵风循环）。', en: 'The canopy is snuffed into the sleeve at the boom tip first (1 s), then the boom retracts and folds flat (1.2 s) and the lid closes: 2.5 s from seat to stowed. Stow and 3 mm boom reliability pending physical tests (≥500 wet/iced/gusty cycles).', pending: true },
];

function buildDemo(params) {
  const tGo = 4;
  const sk = smoothBody(simulateSkier({ start: 'push', duration: DEMO_T - tGo + 1, stopAt: (params.demoStopAt ?? 39) - tGo, seed: 2 }));
  const rider = makeRider([{ sk, t0: tGo }]);
  const p = resolveP({ ...PDEF, ...params });
  const sc = { id: 'demo', dur: DEMO_T, handTaps: [[1.4, 2.6]], plan: { armAt: 2 } };
  // demo shot plan: rear-quarter left, a commanded wide side shot (14–23 s), swap behind to rear-right (31.5–36.5 s)
  const shot = (t) => { const w = sstep((t - 31.5) / 5); const wide = (p.azWide - p.az) * sstep((t - 13.5) / 1.5) * (1 - sstep((t - 22.5) / 1.5)); return { az: p.az * (1 - 2 * w) + wide, el: p.el + 8 * Math.sin(Math.PI * w) }; };
  const input = { duration: DEMO_T, rider, tanS: sk.tanS, dt: 0.001,
    wind: { mean: [0, 1.5, 0], intensity: 0.2, Lu: 28, seed: 4, gustAt: 24.5, gust: [0, 7, 0], gustRise: 1.0, gustHold: 2.5 },
    plan: { start: 'docked', armAt: 2.0, shot } };
  const R = buildResult(params, sc, { p, input, dur: DEMO_T }, { demo: true, settle: 0 });
  R.scenarioId = 'demo';
  return R;
}

export default {
  id: 'kite2', family: 'aerial',
  name: { zh: 'K2-R4 收口圆伞风筝相机（被动细臂杆 + 电动卷线器）', en: 'K2-R4 reefing drogue kite cam (passive hair-thin boom + motorised reel)' },
  tagline: { zh: '≈90 g 带缝圆伞 + 收口 + 摩擦制动电动卷线器（放线被动、零延迟）+ 1.45 m 3 mm 被动臂杆：后侧方约 35° 视角、急停时自动入舱', en: '≈90 g slotted round canopy + reefing + drag-braked motorised reel (passive zero-lag pay-out) + 1.45 m 3 mm passive boom: ≈35° rear-quarter view, auto-docks at every stop' },
  about: { zh: '第四轮：取消上一轮所有理想化部件。臂杆改为无电机的 3 mm 细碳管，自由阻尼枢轴，由绳张力对正，只受拉，在成片中 <2 px（按共享伪影规则不计）；1.45 m 长保证绳端离头盔 ≥1 m。绞盘改为“电动渔线轮”：防逆转轴承 + 舵机调节的摩擦制动，阵风/身体起伏时超过制动力的放线是被动、即时的，电机（2205 级，按真实 Kv、电阻、电流、电压和转子惯量）只负责收线，保持张力不耗电；动能调速器是按估计风筝速度触发的电磁铁松闸。控制、起飞空速确认与调速器都用带噪声和延迟的传感器。按第四轮共享规则（48 例、身体像素 ≥300、≥2 px 伪影、helmetAt 头部间隙）判定：可用率不达标（顺风段），身后 1–3 m 绳高不达标，其余通过。', en: 'Round 4: every idealised part of round 3 is gone. The boom is now a motorless 3 mm carbon tube on a free damped pivot, aligned by the line tension, loaded in tension only and <2 px wide in the delivered frame (not an artefact under the shared rule); 1.45 m keeps the line tip ≥1 m from the helmet. The winch is a "motorised fishing reel": anti-reverse bearing + servo-set friction drag, so pay-out above the drag (gusts, body heave) is passive and instantaneous, the motor (2205 class, real Kv, resistance, current, voltage and rotor inertia) only reels in, and holding costs no current; the KE governor is a solenoid drag release triggered by the ESTIMATED kite speed. Control, launch-pitot confirmation and governor use noisy, lagged sensors. Judged on the shared round-4 rules (48 cases, bodyPx ≥300, ≥2 px artefact, helmetAt headClear): avail FAILS (tailwind band) and the 1–3 m line height behind the rider FAILS; the rest pass.' },
  modelVersion: MV,
  modelLimits: [
    { zh: '风筝为质点 + 单一耦合极曲线 + 一阶执行器滞后；伞衣形变、呼吸/锥摆振荡、吊带动力学未建模；塌陷用简化规则；充气按充满距离 6·D0 与开伞冲击系数 1.8（假设）', en: 'Kite = point mass + ONE coupled polar + first-order actuators; canopy deformation, breathing/coning and line dynamics not modelled; simplified collapse rules; inflation over a 6·D0 filling distance with a 1.8 opening-shock factor (ASSUMED)' },
    { zh: '圆伞极曲线（CD0 0.8、最大 L/D 0.75 = MC-1-1C）取自全尺寸伞，缩到 0.7 m 直径未验证；收口时保留一半升阻比为假设（无文献）；连续电动收口无先例', en: 'Round polar (CD0 0.8, max L/D 0.75 = MC-1-1C) is from full-size canopies, unverified at 0.7 m; keeping half the glide when reefed is ASSUMED (no literature); continuous servo reefing has no precedent' },
    { zh: '臂杆为被动一阶对正（τ = 2/√(3T/mℓ)，枢轴阻尼假设临界）；3 mm 伸缩碳管的强度、结冰、接头间隙与反复伸缩寿命未建模（关键否决试验）', en: 'Boom = passive first-order alignment (τ = 2/√(3T/mℓ), pivot damping ASSUMED critical); strength, icing, joint play and cycle life of a 3 mm telescopic carbon tube are not modelled (key kill test)' },
    { zh: '卷线器：摩擦制动为一阶舵机滞后 + 静/动摩擦比 1.15，电机按 2205 级典型参数（假设，待选定数据手册）；拖曳垫片发热、线在卷筒上的排线、低温润滑未建模', en: 'Reel: drag = first-order servo lag + static/dynamic friction ratio 1.15; motor uses typical 2205-class values (ASSUMED until a datasheet is fixed); drag-washer heating, level-wind and cold lubrication not modelled' },
    { zh: '传感器噪声为有色噪声（空速/风向 0.4 m/s、风筝速度 0.2 m/s、升沉估计 0.3 m/s + 40 ms 滞后，均为假设）', en: 'Sensor errors are coloured noise (apparent wind 0.4 m/s, kite speed 0.2 m/s, heave estimate 0.3 m/s + 40 ms lag; all ASSUMED)' },
    { zh: '空速 <1.5 m/s 时按降落伞阻力计算；系留绳为无质量弹性直线，无绳阻力；挂枝为固定点', en: 'Below 1.5 m/s airspeed a parachute-drag model is used; the tether is a massless elastic straight line without drag; snags are fixed points' },
    { zh: '起飞联锁的“雪面振动”判据、挂绳检测（60 ms）与后方接近雷达（4 m、0.2 s）为假设，需实测', en: 'The on-snow-vibration launch interlock, the 60 ms line-contact detection and the 4 m / 0.2 s rear proximity radar are ASSUMED and need tests' },
    { zh: '画面为几何（剪影胶囊、绳与臂杆宽度、事后重构图，跟踪用真实几何，未加视觉跟踪误差）', en: 'Footage is geometric (silhouette capsules, line and boom widths, post reframing; the reframing uses the true geometry, no vision-tracking error added)' },
    { zh: '雪场规定（多数雪场禁止风筝/系留物）不在模型内：只能在书面许可的场地使用；身后 1–3 m 处臂杆/绳离地多在 0.8–1.8 m（晾衣绳风险，未解决，见 clothesline 指标）', en: 'Resort rules (most resorts ban kites/tethers) are outside the model: use only with written permission; the boom/line is mostly 0.8–1.8 m above the snow 1–3 m behind the rider (clothesline risk, unsolved; see the clothesline metrics)' },
  ],
  params: PARAMS,
  scenarios: SCEN,
  simulate,
  ensemble: ENSEMBLE,
  demo: { duration: DEMO_T, stages: STAGES, build: buildDemo },
  gear: () => import('./gear.js'),
};
export { SCEN, prepare, buildResult };
