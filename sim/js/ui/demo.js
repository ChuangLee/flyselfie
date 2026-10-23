// Complete-cycle engineering illustration (FE-11). Scripted kinematics only — not
// a numerical result. Retrieval keeps the L1 hand crank (requirements §5.1);
// launch, payout, docking and stowage show a semi-automatic backpack launch-boom
// CONCEPT (spring boom, lift-triggered cradle release, brake-metered payout,
// funnel docking) that is not part of L1 and is marked pending throughout.
import { interp } from '../model/scenarios.js';
import { v3 } from '../model/util.js';

export const DEMO_STAGES = [
  { key: 'carry', t0: 0, t1: 5, pending: false,
    zh: '背负滑行至使用地点：风筝折叠在背包发射杆的托架上，发射杆收拢贴背（运输状态）。',
    en: 'Carry to the use location: the folded wing sits in the cradle of the backpack launch boom, boom folded flat against the pack (transport state).' },
  { key: 'prepare', t0: 5, t1: 13, pending: true,
    zh: '停稳后单手拉肩带释放拉环：弹簧发射杆向后上方升起至头顶后上方，风筝在托架上自动展开并迎风定姿；双手不离雪杖。发射杆与弹簧展开为概念方案，待验证。',
    en: 'After stopping, one pull on the shoulder-strap release: the spring launch boom swings up behind and above the head, and the wing unfolds in its cradle and weathervanes into the airflow. Both hands stay on the poles. Boom and spring deployment are a concept, pending verification.' },
  { key: 'launch', t0: 13, t1: 17, pending: true,
    zh: '起步撑杖加速；相对气流使风筝升力超过托架脱扣力后自动离架，在身体后上方爬升并带出预放线 0.8 m（REQ）。自动脱扣阈值为概念，起飞条件见“起步与起飞”数值工况（其模型仍为手放）。',
    en: 'Push off and accelerate; once airflow lift exceeds the cradle release force the wing leaves the cradle by itself, climbs behind and above the skier and draws out the 0.8 m pre-payout (REQ). The automatic release threshold is a concept; see the numerical “Start & launch” scenario (which still models a hand release).' },
  { key: 'payout', t0: 17, t1: 21, pending: true,
    zh: '卷轮制动器按设定张力放线至最大外露长度 2.5 m（REQ），无需手动操作。制动放线为概念，待验证。',
    en: 'The reel brake pays out at a set tension to the maximum external length of 2.5 m (REQ), no hand action needed. Brake-metered payout is a concept, pending verification.' },
  { key: 'film', t0: 21, t1: 35, pending: false,
    zh: '滑行与转弯，机载相机俯拍全身与环境。成像质量未经实拍验证。',
    en: 'Ski and turn while the onboard camera films the full body and surroundings from above. Imaging quality not verified with real footage.' },
  { key: 'retrieve', t0: 35, t1: 42, pending: false,
    zh: '提前请求回收，计划减速，手摇卷回至发射杆端部。迎风/静风/侧风结果见数值工况。',
    en: 'Request retrieval in advance, decelerate as planned, hand-crank the wing back to the boom tip. See the headwind/calm/crosswind numerical scenarios.' },
  { key: 'handover', t0: 42, t1: 46, pending: true,
    zh: '末段收线把系留点拉入发射杆端部导向口，风筝落入托架并由锁扣锁定，无需用手接。导向、落架与锁定可靠性待验证（UX-03）。',
    en: 'The last of the line pulls the tow point into the boom-tip funnel; the wing settles into the cradle and the latch closes, with no hand catch. Guiding, seating and latch reliability pending verification (UX-03).' },
  { key: 'shortStop', t0: 46, t1: 51, pending: true,
    zh: '短停：风筝锁定在立起的发射杆上，下一段起步即可再次自动起飞。锁定指示需与实际状态一致，待验证。',
    en: 'Short stop: the wing stays latched on the raised boom, ready to self-launch again on the next push-off. Lock indication must match the actual state; pending verification.' },
  { key: 'stow', t0: 51, t1: 60, pending: true,
    zh: '最终收纳：风筝在托架上折叠，发射杆收拢贴背。完整收纳路径与系绳松弛管理待验证。',
    en: 'Final stowage: the wing folds in its cradle and the boom folds flat against the pack. Complete stowage path and tether slack management pending verification.' },
];
export const DEMO_DURATION = 60;

const TAN_S = Math.tan(15 * Math.PI / 180);
const SPEED = [[0, 2], [4, 2], [5, 0], [13, 0], [13.4, 1.2], [15, 5], [17, 7], [35, 7], [40, 2], [42, 0], [60, 0]];
// external tether length from the boom tip: 0 = seated in the cradle
const TETHER = [[0, 0], [13.8, 0], [14.3, 0.12], [15.2, 0.8], [17, 0.8], [21, 2.5], [36, 2.5], [41.4, 0.3], [42.6, 0], [60, 0]];
// launch boom angle in the sagittal plane (deg): -90 folded down the pack, +62 raised
const BOOM = [[0, -90], [7.2, -90], [8.9, 62], [53.5, 62], [56.5, -90], [60, -90]];
// wing fold (0.12 folded … 1 open) and stowed-attitude blend (1 lying on the boom … 0 flight attitude)
const FOLD = [[0, 0.12], [8.6, 0.12], [11.2, 1], [51.2, 1], [53.8, 0.12], [60, 0.12]];
const STOWATT = [[0, 1], [8.2, 1], [10.4, 0], [51.4, 0], [53.6, 1], [60, 1]];
export const BOOM_LEN = 0.72;
const smooth = (x) => x * x * (3 - 2 * x);
const ramp = (t, a, b) => smooth(Math.min(1, Math.max(0, (t - a) / (b - a))));
const deg = Math.PI / 180;

// precomputed skier path (integrated speed), 20 Hz
const DT = 0.05;
const PATH = (() => {
  const out = [];
  let x = 0, phase = 0;
  for (let t = 0; t <= DEMO_DURATION + 1e-9; t += DT) {
    const u = interp(SPEED, t);
    const turning = t > 22 && t < 35 ? 1 : 0;
    const y = 2 * Math.sin(phase) * turning;
    const yd = 2 * Math.cos(phase) * turning * (2 * Math.PI / 6);
    out.push({ x, y, u, yd, phase, turning });
    x += u * DT;
    phase += (2 * Math.PI / 6) * DT * turning;
  }
  return out;
})();

export function demoStage(t) {
  return DEMO_STAGES.find((s) => t >= s.t0 && t < s.t1) || DEMO_STAGES[DEMO_STAGES.length - 1];
}

// approximate boom geometry in model coordinates (the WebGL rig recomputes it
// exactly from the posed backpack; this is used by the 2D fallback and labels)
export function boomTip(pos, heading, thetaDeg) {
  const th = thetaDeg * deg;
  const pivot = v3.add(pos, v3.add(v3.scale(heading, -0.3), [0, 0, 1.47]));
  const len = BOOM_LEN * (0.6 + 0.4 * ramp(thetaDeg, -40, 60));
  return v3.add(pivot, v3.add(v3.scale(heading, -Math.cos(th) * len), [0, 0, Math.sin(th) * len]));
}

export function demoState(t) {
  const i = Math.max(0, Math.min(PATH.length - 1, Math.round(t / DT)));
  const s = PATH[i];
  const pos = [s.x, s.y, -s.x * TAN_S];
  const heading = s.u > 0.1 ? v3.norm([s.u, s.yd, 0]) : [1, 0, 0];
  const side = [-heading[1], heading[0], 0];
  const stage = demoStage(t).key;
  const boom = interp(BOOM, t);
  const anchor = boomTip(pos, heading, boom);
  const st = { stage, pos, heading, anchor, tanS: TAN_S, showKite: true, halfSpan: 0.35, tetherVisible: true, pose: {}, boom };
  // motion cues for the renderer: speed, lateral acceleration (turn lean),
  // longitudinal acceleration (stop spray) and alternating pole plants
  const a = PATH[Math.max(0, i - 1)], b = PATH[Math.min(PATH.length - 1, i + 1)];
  st.speed = Math.hypot(s.u, s.yd);
  st.lat = (b.yd - a.yd) / (2 * DT);
  st.accel = (b.u - a.u) / (2 * DT);
  if (s.turning) {
    const ph = ((s.phase % Math.PI) + Math.PI) % Math.PI;
    const plant = Math.exp(-Math.pow((ph - Math.PI * 0.85) / 0.3, 2)); // just before edge change
    const odd = Math.floor(s.phase / Math.PI) % 2 === 0;
    st.plantL = odd ? plant : 0;
    st.plantR = odd ? 0 : plant;
  }
  // double-pole push-off at the start of the launch run
  if (t > 12.9 && t < 15.2) {
    const push = Math.max(Math.exp(-Math.pow((t - 13.25) / 0.22, 2)), Math.exp(-Math.pow((t - 14.05) / 0.22, 2)), 0.8 * Math.exp(-Math.pow((t - 14.8) / 0.22, 2)));
    st.plantL = st.plantR = push;
  }

  const L = interp(TETHER, t);
  // flight direction: downwind of the relative airflow (behind) and high; the
  // wing pitches back from straight above the boom as it leaves the cradle
  const sway = 0.06 * Math.sin(t * 1.7) + 0.025 * Math.sin(t * 4.3 + 1);
  const climb = ramp(L, 0, 0.8);
  const back = 0.15 + 0.32 * climb;
  const flightDir = v3.norm(v3.add(v3.scale(heading, -back), [0, -0.15 * s.y / 2 + sway * climb, 1]));
  st.airflow = v3.scale(heading, -1);
  st.relDir = flightDir;
  st.rel = v3.scale(flightDir, L);
  st.dock = L < 1e-3 ? 1 : 0;
  st.halfSpan = 0.35 * interp(FOLD, t);
  st.fold = interp(FOLD, t);
  st.stowAtt = interp(STOWATT, t);
  st.tetherVisible = L > 1e-3;
  st.locked = t >= 42.9 && t < 51.2;

  if (stage === 'prepare') {
    // one pull on the release loop on the left shoulder strap, then back to the pole
    const reach = ramp(t, 5.4, 6.6) * (1 - ramp(t, 7.4, 8.6));
    const shoulder = v3.add(pos, [0, 0, 1.37]);
    const strap = v3.add(shoulder, v3.add(v3.scale(heading, 0.2), v3.add(v3.scale(side, 0.1), [0, 0, -0.05 - 0.06 * ramp(t, 6.6, 7.2)])));
    if (reach > 0) { st.pose.armR = strap; st.pose.reachR = reach; }
    st.pullR = ramp(t, 6.6, 7.2) * (1 - ramp(t, 7.6, 8.2));
  }
  if (t >= 35 && t < 43.2) {
    // right hand moves to the reel crank and winds until the wing is seated
    st.crank = t < 42.6;
    st.handOnCrank = true;
    st.pose.reachR = ramp(t, 35, 35.6) * (1 - ramp(t, 42.6, 43.2));
  }
  st.kite = v3.add(anchor, st.rel);
  st.cam = v3.add(st.kite, [0, 0, -0.15]);
  return st;
}

// skier centre-line history up to t (for carved tracks), ~5 Hz
export function demoTrack(t) {
  const out = [];
  const end = Math.min(PATH.length - 1, Math.round(t / DT));
  for (let i = 0; i <= end; i += 4) {
    const s = PATH[i];
    out.push({ pos: [s.x, s.y, -s.x * TAN_S], heading: s.u > 0.1 ? v3.norm([s.u, s.yd, 0]) : [1, 0, 0] });
  }
  return out;
}
