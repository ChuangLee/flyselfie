// S2 trackdrone (SIM-030): track-replay follow drone with a backpack dock.
// Merged from A02 (track replay, wearable beacon), A08 (opportunity shots),
// A09 (optional Dyneema leash) and R08/R09 (backpack dock, highlight director).
// Physics in ./model.js; this file defines scenarios, metrics, plots and the demo.
// Evidence: numerical-uncalibrated simulation + illustration; not a physical test.
import { makeWind, stats } from '../common/env.js';
import { makeResult } from '../common/result.js';
import { addStd, jitterHP } from '../common/criteria.js';
import { bodyPoints, SKIER_PRESETS } from '../common/skier.js';
import { DEFAULTS, designParams, runMission, makeRider, riderGeom, footageSeries, addResidualJitter, trim, derive, segDist, MODES, FILMING } from './model.js';

const VERSION = 'trackdrone@0.4.0';
const FAA_CAT2_J = 14.9; // 11 ft-lbf (FAA Part 107 subpart D, category 2) used as a reference only
const MASS_BEACON = 0.03, MASS_REEL = 0.025, MASS_TOWREEL = 0.04, MASS_POUCH = 0.02;
const PICKUP_S = 25; // ASSUMED: walk to the drone on the snow, pick it up and stow it after a failed docking

// ------------------------------------------------------------------ parameters
const PARAMS = [
  { id: 'design', zh: '设计版本（1/2/3）', en: 'Design (1 / 2 / 3)', unit: '-', v: 3, min: 1, max: 3, step: 1, src: 'ASSUMED', note: 'v2: faired airframe, swappable packs, capture cone; v3: + vision fallback, forward depth sensor (avoid/yield), leapfrog/pan' },
  { id: 'lightFactor', zh: 'v3 视觉检测光照系数', en: 'v3 vision lighting factor', unit: '-', v: 1, min: 0.2, max: 1, step: 0.05, src: 'ASSUMED', note: '1 = good light, ~0.6 flat light/snowfall' },
  { id: 'sensorRange', zh: 'v3 前视深度传感器量程', en: 'v3 forward depth-sensor range', unit: 'm', v: 12, min: 4, max: 20, step: 1, src: 'ASSUMED', note: 'ToF/stereo class 8–15 m' },
  { id: 'mass', zh: 'v2 起飞质量（v1 固定 0.245）', en: 'v2 take-off mass (v1 fixed 0.245)', unit: 'kg', v: 0.15, min: 0.1, max: 0.249, step: 0.005, src: 'ASSUMED', note: '≤150 g keeps KE ≤14.9 J up to ~14 m/s; airframe scaled from 245 g' },
  { id: 'CdA', zh: 'v2 阻力面积（按 245 g 折算）', en: 'v2 drag area (245 g equivalent)', unit: 'm²', v: 0.008, min: 0.005, max: 0.02, step: 0.001, src: 'ASSUMED', note: 'faired body + duct lips; v1 0.016 + 0.006·sin²θ' },
  { id: 'packs', zh: '随身电池块数（v2）', en: 'Battery packs carried (v2)', unit: '-', v: 6, min: 1, max: 8, step: 1, src: 'ASSUMED', note: 'warm inner pocket; swapped on the lift' },
  { id: 'energy', zh: '能源方案（1=换电，2=拖曳绳）', en: 'Energy option (1 = swap packs, 2 = tow leash)', unit: '-', v: 1, min: 1, max: 2, step: 1, src: 'ASSUMED', note: 'tow leash: 20 m Dyneema, braked reel holds the drag tension' },
  { id: 'twMax', zh: '最大推重比', en: 'Max thrust/weight', unit: '-', v: 2.6, min: 1.6, max: 4, step: 0.1, src: 'ASSUMED', note: 'calc_rotor_follow.py' },
  { id: 'tiltMaxDeg', zh: '最大倾角', en: 'Max tilt', unit: '°', v: 65, min: 30, max: 70, step: 1, src: 'ASSUMED' },
  { id: 'fom', zh: '有效品质因数（含电机/电调）', en: 'Effective figure of merit (incl. motor/ESC)', unit: '-', v: 0.38, min: 0.25, max: 0.6, step: 0.01, src: 'ASSUMED', note: 'calc_rotor_follow.py; audit brackets 0.38–0.55' },
  { id: 'tempC', zh: '环境温度', en: 'Ambient temperature', unit: '°C', v: -10, min: -25, max: 10, step: 1, src: 'ASSUMED' },
  { id: 'altM', zh: '海拔', en: 'Altitude', unit: 'm', v: 2000, min: 0, max: 3500, step: 100, src: 'ASSUMED' },
  { id: 'followDist', zh: '复现距离 d（时滞 τ=d/v）', en: 'Replay distance d (lag τ=d/v)', unit: 'm', v: 6, min: 3.5, max: 15, step: 0.5, src: 'ASSUMED' },
  { id: 'hFollow', zh: '离雪高度', en: 'Height above snow', unit: 'm', v: 3, min: 2.2, max: 6, step: 0.1, src: 'ASSUMED', note: 'A02: 3 m' },
  { id: 'speedCap', zh: '水平速度上限', en: 'Horizontal speed cap', unit: 'm/s', v: 22, min: 8, max: 30, step: 1, src: 'ASSUMED' },
  { id: 'guard3D', zh: '与滑行者最小距离', en: 'Min distance to rider', unit: 'm', v: 3, min: 2, max: 6, step: 0.1, src: 'ASSUMED' },
  { id: 'beaconSigma', zh: '信标定位噪声 σ', en: 'Beacon position noise σ', unit: 'm', v: 0.04, min: 0.01, max: 0.5, step: 0.01, src: 'ASSUMED', note: 'RTK 0.02–0.05 m, UWB ~0.1 m' },
  { id: 'beaconLatency', zh: '信标延迟', en: 'Beacon latency', unit: 's', v: 0.1, min: 0.02, max: 0.4, step: 0.01, src: 'ASSUMED' },
  { id: 'captureR', zh: 'v2 捕获锥半径（v1 固定 0.06）', en: 'v2 capture-cone radius (v1 fixed 0.06)', unit: 'm', v: 0.10, min: 0.04, max: 0.14, step: 0.005, src: 'ASSUMED', note: 'R08 calc: ≥6 cm' },
  { id: 'leash', zh: '安全牵绳（0/1）', en: 'Safety leash (0/1)', unit: '-', v: 0, min: 0, max: 1, step: 1, src: 'ASSUMED', note: 'A09 0.5 mm Dyneema, spring reel' },
];
const defaults = () => Object.fromEntries(PARAMS.map((p) => [p.id, p.v]));
const toModel = (params) => designParams(params);

// ------------------------------------------------------------------ obstacles & bystanders
// trees placed deterministically along the rider's own track (local to this model)
function makeTrees(rider, spec, duration) {
  const pts = [];
  for (let t = -1; t <= duration; t += 0.1) pts.push(rider.at(t).pos);
  const minDist = (x, y) => { let d = Infinity; for (const q of pts) d = Math.min(d, Math.hypot(q[0] - x, q[1] - y)); return d; };
  return spec.map((sp) => {
    const s = rider.at(sp.t), L = [-s.heading[1], s.heading[0]];
    let off = sp.off;
    let x = s.pos[0] + L[0] * off * sp.side, y = s.pos[1] + L[1] * off * sp.side;
    for (let k = 0; k < 30 && minDist(x, y) < sp.off - 0.02; k++) { off += 0.1; x = s.pos[0] + L[0] * off * sp.side; y = s.pos[1] + L[1] * off * sp.side; }
    const tr = { x, y, H: sp.H || 9, h0: 0.9, Rb: sp.Rb || 1.0, rT: 0.14, branch: null, close: sp.off <= 1.6 };
    if (sp.branch) {
      const zb = -x * rider.tanS;
      const tip = [s.pos[0] - L[0] * sp.side * sp.branch.over, s.pos[1] - L[1] * sp.side * sp.branch.over, -(s.pos[0] - L[0] * sp.side * sp.branch.over) * rider.tanS + sp.branch.zTip];
      tr.branch = { a: [x, y, zb + sp.branch.zBase], b: tip, r: sp.branch.r };
    }
    return tr;
  });
}
// a second skier traversing across the slope through the rider's track, just behind the rider
function makeCrossing(rider, c) {
  const s = rider.at(c.t - c.lead), ph = [s.pos[0], s.pos[1]];
  const u = [c.vx, c.vy];
  const ul = Math.hypot(u[0], u[1]);
  return (t) => {
    const dtc = t - c.t;
    if (Math.abs(dtc) > 4) return null;
    const x = ph[0] + u[0] * dtc, y = ph[1] + u[1] * dtc, z = -x * rider.tanS;
    return { feet: [x, y, z], top: [x, y, z + 1.78], pos: [x, y, z], heading: [u[0] / ul, u[1] / ul, 0] };
  };
}

// ------------------------------------------------------------------ scenarios
const NOM_SK = { ...SKIER_PRESETS.recreationalCarve, duration: 30, seed: 1 }; // calibrated shared preset (turn 2.84 s, apex 1.18 g)
const SCEN = [
  { id: 'nominal', zh: '标准（v2）：12 m/s 大弯，微风，含一次侧拍', en: 'Nominal (v2): 12 m/s carving, light wind, one side pass', rider: { skier: { ...NOM_SK } }, duration: 30, wind: { mean: [0, 2, 0], intensity: 0.15, seed: 7 }, mission: [{ t: 17, cmd: 'side', dur: 7 }],
    expect: { zh: '复现轨迹 0.5 s 后方、离雪 3 m，17 s 时指令一次侧拍。按统一判据（可用率、>1 Hz 抖动、日续航、p90 停留、动能）判定。', en: 'Replays the track ~0.5 s behind, 3 m up; one commanded side pass at 17 s. Judged on the harmonised criteria (availability, >1 Hz jitter, day endurance, p90 standstill, KE).' } },
  { id: 'nominal_v2', zh: '标准（v2 对照）', en: 'Nominal (v2 reference)', over: { design: 2 }, rider: { skier: { ...NOM_SK } }, duration: 30, wind: { mean: [0, 2, 0], intensity: 0.15, seed: 7 }, mission: [{ t: 17, cmd: 'side', dur: 7 }],
    expect: { zh: '同一工况下的第 2 版设计（无视觉兜底/前视传感器/前置模式）。', en: 'Same run with the iteration-2 design (no vision fallback, depth sensor or leapfrog).' } },
  { id: 'nominal_v1', zh: '标准（v1 对照）', en: 'Nominal (v1 reference)', over: { design: 1 }, rider: { skier: { ...NOM_SK } }, duration: 30, wind: { mean: [0, 2, 0], intensity: 0.15, seed: 7 }, mission: [{ t: 17, cmd: 'side', dur: 7 }],
    expect: { zh: '同一工况下的第 1 版设计（245 g、CdA 0.016、单电池、6 cm 仓口）。', en: 'Same run with the iteration-1 design (245 g, CdA 0.016, one battery, 6 cm pod mouth).' } },
  { id: 'highspeed', zh: '高速 18 m/s + 8 m/s 逆风', en: 'High speed 18 m/s + 8 m/s headwind', rider: { skier: { vTarget: 18, v0: 18, duration: 25, turnPeriod: 5.5, seed: 2 } }, duration: 25, wind: { mean: [-8, 0, 0], intensity: 0.15, seed: 8 },
    expect: { zh: '空速约 26 m/s；v2 的动能限速（150 g → ≤13.3 m/s）使其必然掉队。失败：可用率 <80%。', en: 'Airspeed ~26 m/s; the v2 KE governor (150 g → ≤13.3 m/s) makes it fall behind by design. Fail: availability <80%.' } },
  { id: 'highspeed_leap', zh: '高速 18 m/s：前置等待/摇摄（v3）', en: 'High speed 18 m/s: leapfrog/pan (v3)', rider: { skier: { start: 'push', vTarget: 18, duration: 30, turnPeriod: 5.5, seed: 2 } }, duration: 30, wind: { mean: [-8, 0, 0], intensity: 0.15, seed: 8 }, startMode: 'leap',
    expect: { zh: '起步时无人机已飞到前方侧边 4 m 高处；滑行者超过动能安全速度后由其超越，云台摇摄迎面—侧面—背影，之后回到走廊限速跟随。报告该模式的可用率。', en: 'The drone starts ahead and beside the line, 4 m up (launched at the stop); once the rider exceeds the KE-safe speed they overtake it while the gimbal pans front→side→rear; then it rejoins the corridor at the capped speed. Reports availability of this mode.' } },
  { id: 'short', zh: '短弯 + 急停 + 自动回仓', en: 'Short turns + hockey stop + auto-dock', rider: { skier: { ...SKIER_PRESETS.shortTurns, duration: 34, stopAt: 20, seed: 4 } }, duration: 34, wind: { mean: [0, 2, 0], intensity: 0.2, seed: 9 }, autoDock: true,
    expect: { zh: '平滑短弯摆动但偏轨 ≤1 m；急停不冲过头；停稳后自动回仓。失败：距离 <3 m、偏轨 >1 m、未回仓。', en: 'Smooths the short-turn wiggle within 1 m cross-track; no overrun at the stop; auto-docks. Fail: distance <3 m, cross-track >1 m, no dock.' } },
  { id: 'crosswind', zh: '阵风侧风 6→11 m/s', en: 'Gusty crosswind 6→11 m/s', rider: { skier: { ...NOM_SK, seed: 5 } }, duration: 30, wind: { mean: [0, 6, 0], intensity: 0.3, seed: 10, gustAt: 12, gust: [0, 5, 1.5] },
    expect: { zh: '6 m/s 侧风（湍流 30%）+ 12 s 处 5 m/s 阵风。保持轨迹与构图。失败：偏轨 >0.6 m、可用率 <80%、抖动 >5 °/s。另报告跟随风速上限。', en: '6 m/s crosswind (30% turbulence) + 5 m/s gust at 12 s. Holds track and framing. Fail: cross-track >0.6 m, availability <80%, jitter >5 °/s. Also reports the follow wind limit.' } },
  { id: 'dropout', zh: '信标丢失 2 s', en: 'Beacon dropout 2 s', rider: { skier: { ...NOM_SK, seed: 6 } }, duration: 30, wind: { mean: [0, 2, 0], intensity: 0.15, seed: 11 }, beacon: { dropouts: [[10, 12]], degrade: [[12, 15, 0.15]] },
    expect: { zh: '丢失时刹停悬停并爬升，恢复后（RTK 重新固定前 σ=0.15 m）追回。失败：碰撞、重获画面 >3 s。', en: 'On loss: brake, hover and climb; on return (σ 0.15 m until RTK re-fixes) catch up. Fail: collision or >3 s to re-frame.' } },
  { id: 'fall', zh: '滑行者摔倒急停', en: 'Rider fall (sudden stop)', rider: { skier: { ...NOM_SK, fallAt: 12, duration: 22, seed: 1 } }, duration: 22, wind: { mean: [0, 2, 0], intensity: 0.15, seed: 7 }, autoDock: true,
    expect: { zh: '无人机须在 ≥3 m 处停住，不越过、不悬于头顶，摔倒时不回仓。失败：距离 <3 m 或头顶悬停。', en: 'Must stop ≥3 m away, never overrun or hover overhead, and not dock onto a fallen rider. Fail: distance <3 m or overhead.' } },
  { id: 'treeline', zh: '林边：贴树滑过', en: 'Tree line: rider skims trees', rider: { skier: { ...NOM_SK, seed: 3 } }, duration: 30, wind: { mean: [0, 3, 0], intensity: 0.2, seed: 12 },
    trees: [{ t: 6, off: 1.35, side: 1 }, { t: 8.5, off: 2.2, side: -1 }, { t: 11, off: 1.5, side: 1 }, { t: 13.5, off: 3, side: -1 }, { t: 16, off: 1.3, side: -1 }, { t: 18.5, off: 2.5, side: 1 }, { t: 21, off: 1.6, side: 1 }, { t: 23.5, off: 2, side: -1 }],
    expect: { zh: '滑行者距树干 1.3–3 m 擦过；验证“复现走廊”清障。失败：树木净距 <0.3 m 或撞树。', en: 'Rider passes 1.3–3 m from trunks; tests the replay-corridor clearance. Fail: tree clearance <0.3 m or strike.' } },
  { id: 'overhang', zh: '横枝：头顶上方的树枝', en: 'Overhang: branch above head height', rider: { skier: { ...NOM_SK, seed: 3 } }, duration: 30, wind: { mean: [0, 3, 0], intensity: 0.2, seed: 12 },
    trees: [{ t: 6, off: 1.35, side: 1 }, { t: 11, off: 1.9, side: 1, branch: { zBase: 2.9, zTip: 2.8, over: 0.9, r: 0.25 } }, { t: 16, off: 1.3, side: -1 }],
    expect: { zh: '横枝在 2.6–3.1 m，人从下方通过而无人机在 3 m：轨迹复现的已知盲点。失败（预期）：撞枝。', en: 'Branch at 2.6–3.1 m: the rider passes under, the drone at 3 m does not. Known blind spot of track replay. Expected fail: branch strike.' } },
  { id: 'crossing', zh: '他人横穿轨迹', en: 'Crossing skier', rider: { skier: { ...NOM_SK, seed: 1 } }, duration: 24, wind: { mean: [0, 2, 0], intensity: 0.15, seed: 7 }, crossing: { t: 12, lead: 0.55, vx: 2, vy: 8 },
    expect: { zh: '另一名滑雪者在无人机下方横穿（无人机不感知他人）。报告最小距离与当时动能。失败：距离 <3 m 或动能 >14.9 J 时靠近。', en: 'Another skier crosses under the drone (no person detection modelled). Reports min distance and KE. Fail: <3 m, or >14.9 J nearby.' } },
  { id: 'dock', zh: '停下：背包起飞与回仓（风扫描）', en: 'At a stop: launch from pack and dock (wind sweep)', rider: { standing: true, skier: { duration: 1 } }, duration: 36, wind: { mean: [-4.5, 2, 0], intensity: 0.25, seed: 13 }, wake: true, startMode: 'docked', mission: [{ t: 1, cmd: 'tap' }, { t: 1.2, cmd: 'launch' }, { t: 19, cmd: 'tap' }, { t: 19.2, cmd: 'launch' }], autoDock: true, holdBeforeDock: 3, sweep: true,
    expect: { zh: '静止时起飞、悬停、回仓，连续两个循环；5 m/s 迎面风（仓位于人体尾流）。扫描 0–9 m/s 风的对接成功率。失败：≤3 次尝试成功率 <95%、旋翼距头 <0.3 m。', en: 'Launch, hover, dock while standing, two cycles; 5 m/s wind from the front (pod in the body wake). Sweeps dock success over 0–9 m/s. Fail: success within 3 attempts <95%, rotor-to-head <0.3 m.' } },
];

// ------------------------------------------------------------------ launch/dock trials
const cycleCache = new Map();
function cycleTrial(Pin, mean, intensity, seed) {
  const P = Pin.__expanded ? Pin : designParams(Pin);
  const key = JSON.stringify([P, mean, intensity, seed]);
  if (cycleCache.has(key)) return cycleCache.get(key);
  // v2: the rider turns their back into the wind so the pod is upwind of the body wake
  const U = Math.hypot(mean[0], mean[1]);
  const standHeading = P.standHeadingIntoWind && U > 0.5 ? [mean[0], mean[1], 0] : null;
  const rider = makeRider({ standing: true, standHeading, skier: { duration: 1 } });
  const res = runMission(P, { rider, duration: 40, wind: makeWind({ mean, intensity, seed }), wake: makeWind({ mean: [0, 0, 0], intensity: 0.35, Lu: 2, seed: seed + 100 }), startMode: 'docked',
    mission: [{ t: 0.2, cmd: 'tap' }, { t: 0.4, cmd: 'launch' }], autoDock: true, holdBeforeDock: 1.0, stopWhenDone: true, seed: 31 + seed, dtInt: 0.01, lite: true });
  const S = res.summary;
  const evs = res.events;
  const holdT = (evs.find((e) => e.type === 'mode' && /launch → hold/.test(e.en)) || {}).t ?? NaN;
  const dockCmd = (evs.find((e) => e.type === 'mode' && /hold → dock/.test(e.en)) || {}).t ?? NaN;
  const ok = S.dockedAt !== null;
  const attempts = S.dockResults.length;
  let minHead = Infinity;
  for (let i = 0; i < res.n; i++) if (res.cols.mode[i] === 6) minHead = Math.min(minHead, res.cols.headClr[i]);
  const launchS = Number.isFinite(holdT) ? holdT - 0.2 : 8;
  const endT = ok ? S.dockedAt : S.landedAt ?? 40;
  const dockS = Number.isFinite(dockCmd) ? endT - dockCmd : 20;
  // standstill per run: tap + lid (2 s) + launch to filming-ready, then stop → dock command (1 s) → docked (+ manual pick-up on failure)
  const standstill = 2 + launchS + 1 + dockS + (ok ? 0 : PICKUP_S);
  const out = { ok, attempts, first: ok && attempts === 1, launchS, dockS, standstill, err: ok ? S.dockResults[S.dockResults.length - 1].err : NaN, wh: S.energyWh, minHead };
  cycleCache.set(key, out);
  return out;
}
const sweepCache = new Map();
function dockSweep(Pin) {
  const P = Pin.__expanded ? Pin : designParams(Pin);
  const key = JSON.stringify(P);
  if (sweepCache.has(key)) return sweepCache.get(key);
  const winds = [0, 3, 6, 9], seeds = [1, 2, 3];
  const all = [];
  const rows = winds.map((U) => {
    const tr = seeds.map((sd) => cycleTrial(P, [-0.85 * U, 0.5 * U, 0], 0.25, 40 + sd * 7 + U));
    all.push(...tr);
    const ok = tr.filter((x) => x.ok);
    return { U, success: ok.length / tr.length, first: tr.filter((x) => x.first).length / tr.length, meanErr: ok.length ? ok.reduce((a, x) => a + x.err, 0) / ok.length : NaN, meanDock: ok.length ? ok.reduce((a, x) => a + x.dockS, 0) / ok.length : NaN, minHead: Math.min(...tr.map((x) => x.minHead)) };
  });
  const st = all.map((x) => x.standstill).sort((a, b) => a - b);
  const out = { rows, p90: st[Math.min(st.length - 1, Math.ceil(0.9 * st.length) - 1)], pFail: all.filter((x) => !x.ok).length / all.length, whCycle: all.reduce((a, x) => a + x.wh, 0) / all.length };
  sweepCache.set(key, out);
  return out;
}

// ------------------------------------------------------------------ simulate
function runScenario(params, sc, extra = {}) {
  const P = toModel({ ...params, ...(sc.over || {}) });
  const rider = makeRider(sc.rider);
  const duration = sc.duration;
  const wind = makeWind(sc.wind || {});
  const wake = sc.wake ? makeWind({ mean: [0, 0, 0], intensity: 0.35, Lu: 2, seed: 77 }) : null;
  const trees = sc.trees ? makeTrees(rider, sc.trees, duration) : [];
  const other = sc.crossing ? makeCrossing(rider, sc.crossing) : null;
  const res = runMission(P, { rider, duration, wind, wake, trees, other, mission: sc.mission || [], startMode: sc.startMode || 'follow', autoDock: !!sc.autoDock, holdBeforeDock: sc.holdBeforeDock, beacon: sc.beacon, seed: 11, dtInt: extra.dtInt, orbit: sc.orbit });
  return { P, rider, res, trees, other, wind };
}

function simulate(params, scenario, extra = {}) {
  const sc = scenario || SCEN[0];
  const { P, rider, res, trees, other } = runScenario(params, sc, extra);
  const R = makeResult({ conceptId: 'trackdrone', scenarioId: sc.id, modelVersion: VERSION, duration: sc.duration, sampleDt: 0.02 });
  const C = res.cols;
  for (const k of Object.keys(C)) R.columns[k] = C[k];
  R.columns.t = C.t;
  R.events = res.events;
  R.validUntil = res.validUntil;
  const fs = footageSeries(res, rider);
  const n = R.n;
  const valid = (i) => res.validUntil === null || C.t[i] <= res.validUntil;
  const filming = (i) => FILMING.has(C.mode[i]) && valid(i);
  const avail = R.col('avail'), px = R.col('subjectPx');
  for (let i = 0; i < n; i++) { px[i] = filming(i) ? fs.px[i] : NaN; avail[i] = filming(i) ? (fs.inFrame[i] && fs.px[i] >= 300 ? 1 : 0) : NaN; }
  R.col('azView').set(fs.az);
  addMetrics(R, P, sc, res, fs, rider, trees, other, filming, valid);
  addPlots(R, sc, trees, other);
  R.frame = makeFrame(R, res, rider, trees, other, P, { label: sc.id });
  return R;
}

// zero-phase one-pole low-pass (for the 0.2 Hz azimuth)
function lowpass(x, fc, dt) {
  const a = Math.exp(-2 * Math.PI * fc * dt), y = Float64Array.from(x);
  for (let i = 1; i < y.length; i++) y[i] = a * y[i - 1] + (1 - a) * y[i];
  for (let i = y.length - 2; i >= 0; i--) y[i] = a * y[i + 1] + (1 - a) * y[i];
  return y;
}

function addMetrics(R, P, sc, res, fs, rider, trees, other, filming, valid) {
  const C = res.cols, n = R.n;
  const mx = (arr, sel) => { let m = -Infinity; for (const i of sel) if (Number.isFinite(arr[i])) m = Math.max(m, arr[i]); return m; };
  const mn = (arr, sel) => { let m = Infinity; for (const i of sel) if (Number.isFinite(arr[i])) m = Math.min(m, arr[i]); return m; };
  const riders = []; for (let i = 0; i < n; i++) riders.push(rider.at(C.t[i]));
  const skiing = riders.map((s) => s.speed > 2 && !s.fallen);
  const ski = []; for (let i = 0; i < n; i++) if (skiing[i]) ski.push(i);
  // --- footage (harmonised): skiing-time denominator
  const availPct = ski.length ? (100 * ski.filter((i) => filming(i) && fs.inFrame[i] && fs.px[i] >= 300).length) / ski.length : NaN;
  const pxs = ski.filter((i) => filming(i) && fs.inFrame[i]).map((i) => fs.px[i]).sort((a, b) => a - b);
  const pxMed = pxs.length ? pxs[Math.floor(pxs.length / 2)] : (ski.length ? 0 : NaN);
  const fw = addResidualJitter(fs.fwd, res);
  const mask = Uint8Array.from({ length: n }, (_, i) => (skiing[i] && filming(i) ? 1 : 0));
  const jit = jitterHP(fs.los, fw, 0.02, mask);
  const azIdx = ski.filter((i) => filming(i));
  let azRange = NaN;
  if (azIdx.length > 10) {
    const az = new Float64Array(n); let prev = fs.az[0];
    for (let i = 0; i < n; i++) { let a = fs.az[i]; while (a - prev > 180) a -= 360; while (a - prev < -180) a += 360; az[i] = a; prev = a; }
    const lp = lowpass(az, 0.2, 0.02), st = stats(azIdx.map((i) => lp[i]));
    azRange = st.p95 - st.p05;
  }
  // --- airborne samples
  const air = []; for (let i = 0; i < n; i++) if (C.mode[i] !== 0 && C.mode[i] !== 8 && C.mode[i] !== 9 && valid(i)) air.push(i);
  const flyNoDock = air.filter((i) => C.mode[i] !== 6 && C.mode[i] !== 1);
  const minDistRider = mn(C.distRider, flyNoDock);
  let overheadT = 0; for (const i of flyNoDock) if (C.horizRider[i] < 1.5) overheadT += 0.02;
  const crossMax = mx(C.crossErr, air);
  // KE: ground frame beyond 1.5 m of the rider, rider frame within (harmonised)
  let keMax = 0;
  for (const i of air) {
    const s = riders[i], v = [C.vx[i], C.vy[i], C.vz[i]];
    const rel = C.distRider[i] > 1.5 ? v : [v[0] - s.vel[0], v[1] - s.vel[1], v[2] - (s.vel[2] || 0)];
    keMax = Math.max(keMax, 0.5 * P.mass * (rel[0] ** 2 + rel[1] ** 2 + rel[2] ** 2));
  }
  // --- energy: per pack from this profile (pack starts at the pocket/pod temperature), then per charge of everything worn
  const S = res.summary;
  const pMean = S.airborneT > 0 ? (S.energyWh * 3600) / S.airborneT : 0;
  const dSoc = 1 - S.socEnd;
  const perPack = dSoc > 1e-6 ? ((1 - P.reserve) * S.airborneT) / dSoc / 60 : NaN;
  const endurance = perPack * P.packs;
  // --- standstill (p90 over the 0–9 m/s wind sweep incl. retries and manual pick-up)
  const sw = dockSweep(P);
  const flightPerRun = 3 + 0.7; // min airborne per run: 3-min descent + launch/hold/dock (ASSUMED)
  const swapsPerRun = P.packs > 1 && Number.isFinite(perPack) ? Math.min(1, flightPerRun / perPack) : 0;
  const ops = 1 + swapsPerRun + sw.pFail;
  // --- worn mass and body force
  const towOn = P.leash === 2;
  const worn = MASS_BEACON + P.podMass + P.mass + (P.packs - 1) * P.packMass + (P.packs > 1 ? MASS_POUCH : 0) + (P.leash === 1 ? MASS_REEL : 0) + (towOn ? MASS_TOWREEL : 0);
  const wornFlying = worn - P.mass;
  const fB = new Float64Array(n);
  // pack-anchor positions smoothed over 0.1 s before differentiating (the shared kinematic skier has posture
  // steps, e.g. at the hockey-stop onset, that would otherwise read as >200 m/s² spikes)
  const pk0 = riders.map((s) => bodyPoints(s).packTop);
  const pk = pk0.map((_, i) => { const q = [0, 0, 0]; let c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { q[0] += pk0[j][0]; q[1] += pk0[j][1]; q[2] += pk0[j][2]; c++; } return [q[0] / c, q[1] / c, q[2] / c]; });
  for (let i = 3; i < n - 3; i++) {
    const a = [0, 1, 2].map((k) => (pk[i + 1][k] - 2 * pk[i][k] + pk[i - 1][k]) / 0.0004);
    const mWorn = C.mode[i] === 0 ? worn : wornFlying;
    fB[i] = mWorn * Math.hypot(a[0], a[1], a[2]) + (C.leashT[i] || 0);
  }
  let bodyForce = 0; for (let i = 2; i < n - 2; i++) bodyForce = Math.max(bodyForce, (fB[i - 1] + fB[i] + fB[i + 1]) / 3);
  // VLOS: can the rider see the drone while skiing? (drone within ±60° of the travel direction, or rider stopped)
  let vis = 0; for (const i of air) { const s = riders[i]; if (s.speed < 1) { vis++; continue; } const dx = C.dx[i] - s.pos[0], dy = C.dy[i] - s.pos[1], dl = Math.hypot(dx, dy) || 1; if ((dx * s.heading[0] + dy * s.heading[1]) / dl > 0.5) vis++; }
  const vlosPct = (100 * vis) / Math.max(1, air.length);
  const dArr = flyNoDock.map((i) => C.distRider[i]).sort((x, y) => x - y);
  const dmed = dArr.length ? dArr[Math.floor(dArr.length / 2)] : 5;
  const noise = 75 - 20 * Math.log10(Math.max(1, dmed));

  const m = (...a) => R.metric(...a);
  const tag = P.design >= 2 ? { zh: `v2 ${Math.round(P.mass * 1000)} g`, en: `v2 ${Math.round(P.mass * 1000)} g` } : { zh: 'v1 245 g', en: 'v1 245 g' };
  const na = (v) => (Number.isFinite(v) ? v : 'n/a (no skiing)');
  addStd(R, 'avail', na(availPct), tag);
  addStd(R, 'pxMed', na(pxMed));
  addStd(R, 'jitterRms', na(jit.rms));
  addStd(R, 'azRange', na(azRange));
  addStd(R, 'addedMass', worn, { zh: `含 ${P.packs - 1} 块备用电池`, en: `incl. ${P.packs - 1} spare packs` });
  addStd(R, 'bodyForcePeak', bodyForce);
  addStd(R, 'handsBusy', 0, { zh: '按键与换电只在停下/缆车上', en: 'button and swaps only when stopped / on the lift' });
  addStd(R, 'setupTime', sw.p90, { zh: `p90，0–9 m/s 风，失败率 ${(100 * sw.pFail).toFixed(0)}%`, en: `p90 over 0–9 m/s wind, ${(100 * sw.pFail).toFixed(0)}% dock failures` });
  addStd(R, 'ops', ops, { zh: `起飞 1 + 换电 ${swapsPerRun.toFixed(2)} + 找回 ${sw.pFail.toFixed(2)}`, en: `launch 1 + swap ${swapsPerRun.toFixed(2)} + pick-up ${sw.pFail.toFixed(2)}` });
  addStd(R, 'keMax', keMax, { zh: '>1.5 m 按雪面系', en: 'ground frame beyond 1.5 m' });
  addStd(R, 'endurance', endurance, { zh: `${P.packs} 块 × ${perPack.toFixed(1)} min`, en: `${P.packs} packs × ${perPack.toFixed(1)} min` });
  m('perPack', '每块电池低温拍摄时长（本工况）', 'Cold filming per pack (this profile)', perPack, 'min', null, null);
  m('peakI', '峰值电池电流（C 倍率，超限时推力被限制）', 'Peak battery current (C-rate; thrust is limited above the rating)', S.peakI / (P.battWh / 11.1), 'C', null, { zh: `额定 ${P.battC}C`, en: `rated ${P.battC}C` });
  m('minDistRider', '与滑行者最小距离', 'Min distance to rider', minDistRider, 'm', minDistRider >= P.guard3D - 0.05, { zh: `≥${P.guard3D} m`, en: `≥${P.guard3D} m` });
  m('overheadT', '处于头顶 1.5 m 水平范围内的时间', 'Time within 1.5 m horizontally of the head', overheadT, 's', overheadT === 0, { zh: '= 0', en: '= 0' });
  if (Number.isFinite(crossMax)) m('crossMax', '最大偏轨距离（跟随模式）', 'Max cross-track error (follow)', crossMax, 'm', crossMax <= P.crossLimit, { zh: `≤${P.crossLimit} m`, en: `≤${P.crossLimit} m` });
  if (trees.length) { const c = mn(C.clrTree, air); m('minClrTree', '与树（干/冠/枝）最小净距', 'Min clearance to trees (trunk/canopy/branch)', Number.isFinite(c) ? c : -1, 'm', c >= 0.3, { zh: '≥0.3 m', en: '≥0.3 m' }); }
  if (other) {
    let dmin = Infinity, keAt = 0; for (const i of air) if (C.distOther[i] < dmin) { dmin = C.distOther[i]; keAt = 0.5 * P.mass * (C.vx[i] ** 2 + C.vy[i] ** 2 + C.vz[i] ** 2); }
    m('minDistOther', '与横穿者最小距离', 'Min distance to crossing skier', dmin, 'm', dmin >= 3, { zh: '≥3 m', en: '≥3 m' });
    m('keNearOther', '最近时动能（雪面系）', 'KE at closest approach (ground frame)', keAt, 'J', keAt <= FAA_CAT2_J, { zh: '≤14.9 J', en: '≤14.9 J' });
    if (P.leash) {
      let lmin = Infinity;
      for (let i = 0; i < n; i++) { const o = other(C.t[i]); if (!o || !valid(i) || C.mode[i] === 0) continue; const pod = [C.podx[i], C.pody[i], C.podz[i]], d = [C.dx[i], C.dy[i], C.dz[i]];
        for (let k = 0; k <= 10; k++) { const q = [pod[0] + (d[0] - pod[0]) * k / 10, pod[1] + (d[1] - pod[1]) * k / 10, pod[2] + (d[2] - pod[2]) * k / 10]; lmin = Math.min(lmin, segDist(q, o.feet, o.top)); } }
      m('lineClr', '牵绳到横穿者最小距离', 'Leash line to crossing skier', lmin, 'm', lmin >= 0.5, { zh: '≥0.5 m（否则绊/勒风险）', en: '≥0.5 m (else trip/strike hazard)' });
    }
  }
  if (sc.beacon && sc.beacon.dropouts) {
    const tBack = sc.beacon.dropouts[0][1] + P.beaconLatency;
    let tRe = NaN, tIn = NaN;
    for (let i = 0; i < n; i++) if (C.t[i] > tBack && R.columns.avail[i] === 1) { tRe = C.t[i] - tBack; break; }
    for (let i = 0; i < n; i++) if (C.t[i] > tBack && fs.inFrame[i] === 1 && C.mode[i] !== 7) { tIn = C.t[i] - tBack; break; }
    m('reframe', '信标恢复后重新锁定入画用时', 'Time to re-lock framing after beacon returns', Number.isFinite(tIn) ? tIn : 99, 's', tIn <= 3, { zh: '≤3 s', en: '≤3 s' });
    let climb = 0; for (let i = 0; i < n; i++) if (C.mode[i] === 7) climb = Math.max(climb, C.altAgl[i] - P.hFollow);
    m('reacq', '信标恢复后回到 ≥300 px 用时', 'Time back to ≥300 px after beacon returns', Number.isFinite(tRe) ? tRe : 99, 's', tRe <= 5, { zh: '≤5 s（需追回 ~20 m）', en: '≤5 s (must close ~20 m)' });
    if (P.vision) m('visionFixes', '丢失期间视觉跟踪定位次数 / 漏检', 'Vision-tracker fixes / misses during the loss', `${res.summary.visHits} / ${res.summary.visMiss}`, '', null, null);
    m('lostClimb', '丢失期间爬升', 'Climb during loss', climb, 'm', P.vision ? null : climb > 0.5, P.vision ? { zh: 'v3 视觉兜底时不需要', en: 'not needed with the v3 vision fallback' } : { zh: '>0.5 m（安全爬升）', en: '>0.5 m (safety climb)' });
  }
  if (sc.id === 'fall' || sc.id === 'short') {
    let gmin = Infinity; for (const i of flyNoDock) if (riders[i].speed < 1) gmin = Math.min(gmin, C.distRider[i]);
    m('stopClear', '停住后与滑行者距离', 'Distance once the rider has stopped', gmin, 'm', gmin >= P.guard3D - 0.05, { zh: `≥${P.guard3D} m，不越过`, en: `≥${P.guard3D} m, no overrun` });
  }
  if (sc.id === 'crosswind' || sc.id === 'highspeed') {
    const wl = windCapability(P);
    m('windLimit', '可跟随的侧风上限（12 m/s，留 10° 倾角余量）', 'Crosswind limit while following at 12 m/s (10° tilt margin)', wl.Wlim, 'm/s', null, null);
    m('vAirMax', '倾角限制下的最大空速（定常）', 'Tilt-limited max steady airspeed', wl.vmax, 'm/s', null, null);
  }
  if (sc.sweep) {
    for (const r of sw.rows) m(`dock${r.U}`, `对接成功率 @${r.U} m/s 风（≤3 次）`, `Dock success @${r.U} m/s wind (≤3 tries)`, 100 * r.success, '%', r.success >= 0.95, { zh: '≥95%（R08）', en: '≥95% (R08)' });
    const t12 = [1, 2, 3].map((sd) => cycleTrial(P, [-0.85 * 12, 0.5 * 12, 0], 0.25, 40 + sd * 7 + 12));
    m('dock12', '对接成功率 @12 m/s 风（扫描外，找上限）', 'Dock success @12 m/s wind (beyond the sweep; limit search)', (100 * t12.filter((x) => x.ok).length) / 3, '%', null, null);
    m('dockFirst', '首次即成功比例（风速:比例）', 'First-attempt success (wind:rate)', sw.rows.map((r) => `${r.U}:${Math.round(100 * r.first)}%`).join(' '), '', null, null);
    const head = Math.min(...sw.rows.map((r) => r.minHead), mn(C.headClr, air.filter((i) => C.mode[i] === 6)));
    m('headClr', '对接时旋翼到头盔最小间隙', 'Min rotor-to-helmet gap while docking', head, 'm', head >= 0.3, { zh: '≥0.3 m（R08 否决线）', en: '≥0.3 m (R08 kill line)' });
    const S2 = res.summary;
    if (S2.dockedAt !== null) m('dockErr', '本次对接偏差', 'This docking offset', 100 * S2.dockResults[S2.dockResults.length - 1].err, 'cm', S2.dockResults[S2.dockResults.length - 1].err <= P.captureR, { zh: `≤${(P.captureR * 100).toFixed(0)} cm`, en: `≤${(P.captureR * 100).toFixed(0)} cm` });
    else m('dockErr', '本次对接', 'This docking', 'failed', '', false, null);
  }
  m('pMean', '平均电功率', 'Mean electrical power', pMean, 'W', null, null);
  m('vCellMin', '最低单体电压（负载下）', 'Min cell voltage under load', S.minVcell, 'V', S.minVcell >= 3.2, { zh: '≥3.2 V', en: '≥3.2 V' });
  m('tiltMax', '最大倾角', 'Max tilt', mx(C.tilt, air), '°', null, null);
  m('airMax', '最大空速', 'Max airspeed', mx(C.air, air), 'm/s', null, null);
  m('noise', '滑行者处噪声（假设 75 dBA@1 m）', 'Noise at rider (ASSUMED 75 dBA @ 1 m)', noise, 'dBA', null, null);
  m('ePending', 'EPP 可压溃护罩（降低传递能量）', 'Crushable EPP shroud (lower transferred energy)', 'pending test', '', null, { zh: '需 ASTM F3389 传递能量试验，未计入 keMax', en: 'needs an ASTM F3389 transfer test; not credited in keMax' });
  m('vlos', '滑行者能目视无人机的时间', 'Time the rider can keep the drone in sight', vlosPct, '%', vlosPct >= 99, { zh: '100%（VLOS；欧盟“跟随模式”例外待法务核实）', en: '100% (VLOS; EU follow-me exception to be verified)' });
  m('regGate', '法规/雪场许可关口', 'Regulatory / resort gate', 'not met', '', false, { zh: '多数雪场禁止或需书面许可（Vail 禁飞）', en: 'Most resorts ban or need written permission (Vail bans)' });
}

function windCapability(P) {
  // steepest crosswind absorbable while following a 12 m/s rider with ±30° path heading, keeping 10° tilt margin
  let Wlim = 0;
  for (let Wv = 0; Wv <= 25; Wv += 0.25) {
    let ok = true;
    for (const psi of [-0.52, 0, 0.52]) { const va = Math.hypot(12 * Math.cos(psi), 12 * Math.sin(psi) + Wv); if (trim(P, va).tiltDeg > P.tiltMaxDeg - 10) ok = false; }
    if (!ok) break; Wlim = Wv;
  }
  let vmax = 0; for (let V = 0; V <= 40; V += 0.25) { if (trim(P, V).tiltDeg <= P.tiltMaxDeg) vmax = V; }
  return { Wlim, vmax };
}

function addPlots(R, sc, trees, other) {
  const P = (key, zh, en, series) => R.plots.push({ key, zh, en, series });
  P('dist', '与滑行者距离与速度', 'Distance to rider and speeds', [['distRider', 'm', '与人距离', 'Distance to rider'], ['riderV', 'm/s', '滑行者速度', 'Rider speed'], ['gs', 'm/s', '无人机地速', 'Drone ground speed']]);
  P('frame', '画面：主体像素与裁切', 'Footage: subject px and crop', [['subjectPx', 'px', '主体像素高', 'Subject px'], ['crop', '×', '电子裁切倍数', 'Electronic crop']]);
  P('flight', '倾角、空速与功率', 'Tilt, airspeed and power', [['tilt', '°', '倾角', 'Tilt'], ['air', 'm/s', '空速', 'Airspeed'], ['power', 'W', '电功率', 'Electrical power']]);
  P('batt', '电池', 'Battery', [['soc', '%', '电量', 'State of charge'], ['vcell', 'V', '单体电压', 'Cell voltage'], ['tb', '°C', '电池温度', 'Battery temperature']]);
  if (trees.length) P('clr', '树木净距与偏轨', 'Tree clearance and cross-track', [['clrTree', 'm', '树木净距', 'Tree clearance'], ['crossErr', 'm', '偏轨', 'Cross-track']]);
  else if (other) P('clr', '与横穿者距离', 'Distance to crossing skier', [['distOther', 'm', '与他人距离', 'Distance to other'], ['ke', 'J', '动能', 'Kinetic energy']]);
  else if (sc.id === 'dock') P('dock', '对接偏差与高度', 'Docking offset and height', [['dockErr', 'cm', '水平偏差', 'Horizontal offset'], ['altAgl', 'm', '离雪高度', 'Height above snow']]);
  else P('track', '复现：时滞与偏轨', 'Replay: lag and cross-track', [['lag', 's', '时滞 τ', 'Lag τ'], ['crossErr', 'm', '偏轨', 'Cross-track'], ['estErr', 'm', '信标估计误差', 'Beacon estimate error']]);
}

// ------------------------------------------------------------------ frames
const LED = { leap: 0xffd27a, docked: 0x2a7fff, launch: 0x37e08a, follow: 0x31c6ff, side: 0xd65cff, hold: 0xffffff, orbit: 0xd65cff, dock: 0x37e08a, lost: 0xffa400, landed: 0xffa400, crashed: 0xff2a2a };
function makeFrame(R, res, rider, trees, other, P, opt = {}) {
  const C = res.cols, nn = res.n;
  const treeList = trees.map((t) => ({ ...t }));
  const treesKey = treeList.map((t) => `${t.x.toFixed(2)},${t.y.toFixed(2)}`).join(';');
  return (t) => {
    const f = Math.max(0, Math.min(nn - 1, t / 0.02));
    const i0 = Math.floor(f), i1 = Math.min(nn - 1, i0 + 1), w = f - i0;
    const L = (k) => C[k][i0] * (1 - w) + C[k][i1] * w;
    const s = rider.at(t);
    const g = riderGeom(s);
    const mode = MODES[C.mode[w < 0.5 ? i0 : i1]] || 'follow';
    const pos = [L('dx'), L('dy'), L('dz')];
    const cam = [L('camx'), L('camy'), L('camz')];
    const fwd = [L('fx'), L('fy'), L('fz')];
    const fl = Math.hypot(...fwd) || 1;
    const podModel = [L('podx'), L('pody'), L('podz')];
    const dPod = Math.hypot(pos[0] - podModel[0], pos[1] - podModel[1], pos[2] - podModel[2]);
    const dockW = mode === 'docked' ? 1 : mode === 'launch' || mode === 'dock' ? Math.max(0, 1 - dPod / 1.2) : 0;
    const btn = L('btn');
    const strap = [g.beacon[0], g.beacon[1], g.beacon[2]];
    const o = other ? other(t) : null;
    const filming = !['docked', 'landed', 'crashed'].includes(mode);
    const skier = { ...s, pack: 'plain' };
    if (btn > 0.01) { skier.handR = strap; skier.reachR = Math.min(1, Math.sin(Math.PI * Math.min(1, 1 - btn)) * 1.6); }
    // demo only: battery swap from the warm inner pocket into the drone in the pod (illustration)
    const swap = opt.swap ? opt.swap(t) : -1;
    const swapLid = swap >= 0 ? Math.min(1, Math.sin(Math.PI * swap) * 2) * 0.55 : 0;
    if (swap >= 0) {
      const k = swap < 0.5 ? swap * 2 : 1, chestP = [g.beacon[0] - g.left[0] * 0.16, g.beacon[1] - g.left[1] * 0.16, g.beacon[2] - 0.12];
      const podP = [g.pod[0], g.pod[1], g.pod[2] + 0.08];
      const hp = [chestP[0] + (podP[0] - chestP[0]) * k, chestP[1] + (podP[1] - chestP[1]) * k, chestP[2] + (podP[2] - chestP[2]) * k + 0.1 * Math.sin(Math.PI * k)];
      skier.handR = swap < 0.85 ? hp : strap; skier.reachR = Math.min(1, Math.sin(Math.PI * swap) * 2.2);
    }
    return {
      t, tanS: rider.tanS,
      skier,
      device: {
        pos, vel: [L('vx'), L('vy'), L('vz')], att: [L('ax'), L('ay'), L('az')], yaw: L('yaw'), cam: [fwd[0] / fl, fwd[1] / fl, fwd[2] / fl], spin: L('spin'),
        lid: Math.max(L('lid'), swapLid), mode, led: LED[mode] ?? 0xffffff, podModel, dockW, btn, trees: treeList, treesKey, other: o, leash: !!P.leash,
        design: P.design, mass: P.mass, swap, chest: g.beacon,
        lost: mode === 'lost', invalid: res.validUntil !== null && t > res.validUntil,
      },
      productCam: filming ? { pos: cam, fwd: [fwd[0] / fl, fwd[1] / fl, fwd[2] / fl], up: [0, 0, 1], vfovDeg: L('vfov'), label: 'S2 云台 4K（裁切）/ gimbal 4K (crop)' } : null,
      labels: opt.labels ? opt.labels(t, g, pos) : [],
    };
  };
}

// ------------------------------------------------------------------ demo (driven by the same physics)
const DEMO_T = 58;
const DEMO_STAGES = [
  { key: 'carry', t0: 0, t1: 4, title: { zh: '携带与换电', en: 'Carry and pack swap' }, zh: '150 g 整流罩机身收在背包顶部的仓里。滑行者从内袋取出一块保温电池换入（通常在缆车上完成；示意）。肩带上是信标和按钮。', en: 'The 150 g faired drone sits in the pod on top of the pack. The rider takes a warm pack from the inner pocket and swaps it in (normally done on the lift; illustration). Beacon and button are on the strap.', pending: true },
  { key: 'launch', t0: 4, t1: 9, title: { zh: '起飞', en: 'Launch' }, zh: '按一下肩带按钮，仓盖翻起挡在头后，无人机垂直升到离雪 3 m 并退到身后。', en: 'One tap on the strap button: the lid flips up behind the head and the drone climbs vertically to 3 m above the snow, then backs off.', pending: true },
  { key: 'leap', t0: 9, t1: 17, title: { zh: '前置等待/摇摄', en: 'Leapfrog / pan' }, zh: '起步前无人机已在前方侧边 4 m 高处等待；滑行者冲过时云台从迎面摇到侧面再到背影，然后无人机回到身后的走廊。高速时（超过动能安全速度）自动采用此方式。', en: 'Before push-off the drone waits ahead and beside the line, 4 m up; as the rider passes the gimbal pans front → side → rear, then the drone rejoins the corridor behind. Used automatically when the rider exceeds the KE-safe speed.', pending: true },
  { key: 'follow', t0: 17, t1: 29, title: { zh: '轨迹复现 + 避障', en: 'Track replay + avoidance' }, zh: '无人机沿刚滑过的轨迹 0.5 s 后、3 m 高处复现飞行；约 21 s 处前视深度传感器发现头顶上方的横枝，降到 2 m（人刚从下面通过的走廊内）钻过去。', en: 'The drone replays the track about 0.5 s behind and 3 m up; at about 21 s the forward depth sensor sees a branch above head height and the drone ducks to 2 m, inside the corridor the rider just passed under.', pending: false },
  { key: 'highlight', t0: 29, t1: 37, title: { zh: '高光：侧向跟拍', en: 'Highlight: side pass' }, zh: '在标记为开阔的高光段，无人机离开轨迹做一次侧向跟拍，再回到轨迹。离开轨迹就失去“走廊已验证”保证。', en: 'On a segment flagged as open snow the drone leaves the track for a side tracking pass, then rejoins it. Off-track it loses the verified-corridor guarantee.', pending: true },
  { key: 'stop', t0: 37, t1: 41, title: { zh: '急停', en: 'Stop' }, zh: '滑行者急停：制动调速器让无人机在 ≥3 m 外停住，不越过、不悬在头顶。', en: 'The rider stops hard: the braking governor halts the drone ≥3 m away, with no overrun and never overhead.', pending: false },
  { key: 'orbit', t0: 41, t1: 50.5, title: { zh: '停留环绕', en: 'Orbit at the stop' }, zh: '停下后无人机以 5 m 半径环绕一周，拍摄全方位镜头。', en: 'At the stop the drone flies one 5 m-radius orbit for an all-round shot.', pending: false },
  { key: 'dock', t0: 50.5, t1: 58, title: { zh: '回仓', en: 'Dock' }, zh: '无人机飞到仓上方，降到 0.25 m 对准光学标记，然后快速穿过下洗回流区落入 10 cm 捕获锥；仓盖合上保温。', en: 'The drone moves above the pod, stops at 0.25 m to align on the optical marker, then commits quickly through the recirculating downwash into the 10 cm capture cone; the lid closes to keep it warm.', pending: true },
];

function buildDemo(params) {
  const P = toModel(params);
  const rider = makeRider({ tGo: 10.5, skier: { start: 'push', vTarget: 12, duration: DEMO_T - 10.5 + 1, stopAt: 38 - 10.5, turnPeriod: 4.2, seed: 21 } });
  const wind = makeWind({ mean: [-1.5, 1.5, 0], intensity: 0.15, seed: 5 });
  const mission = [{ t: 4.3, cmd: 'tap' }, { t: 4.5, cmd: 'launch' }, { t: 9.05, cmd: 'leap', lead: 9, dur: 5 }, { t: 29, cmd: 'side', dur: 7.5 }, { t: 41.2, cmd: 'orbit', r: 5 }];
  const trees = P.obsSensor ? makeTrees(rider, [{ t: 21, off: 1.9, side: 1, branch: { zBase: 2.9, zTip: 2.8, over: 0.9, r: 0.25 } }, { t: 24.5, off: 2.6, side: -1 }], DEMO_T) : [];
  const res = runMission(P, { rider, duration: DEMO_T, wind, trees, startMode: 'docked', mission, autoDock: true, autoDockAfter: 44, holdBeforeDock: 0.6, seed: 17, orbit: { period: 6.5 } });
  // hold → follow happens automatically when the rider pushes off
  const R = makeResult({ conceptId: 'trackdrone', scenarioId: 'demo', modelVersion: VERSION, duration: DEMO_T, sampleDt: 0.02 });
  for (const k of Object.keys(res.cols)) R.columns[k] = res.cols[k];
  R.events = res.events;
  R.validUntil = res.validUntil;
  R.metrics.push({ id: 'note', zh: '演示由同一物理模型驱动（任务指令为脚本）', en: 'Demo driven by the same physics model (mission commands scripted)', value: 'illustration', unit: '', pass: null, criterion: null });
  const fs = footageSeries(res, rider);
  let ok = 0, nf = 0; for (let i = 0; i < res.n; i++) if (FILMING.has(res.cols.mode[i])) { nf++; if (fs.inFrame[i] && fs.px[i] >= 300) ok++; }
  R.metric('avail', '演示中可用率', 'Availability during the demo', (100 * ok) / Math.max(1, nf), '%', null, null);
  const labels = (t, g, pos) => {
    const out = [];
    if (t < 4) { out.push({ p: g.beacon, text: 'UWB/RTK 信标 · beacon', color: '#ffd27a' }); out.push({ p: [g.pod[0], g.pod[1], g.pod[2] + 0.15], text: '背包仓 · pod', color: '#9cc8ff' }); }
    if (t > 1 && t < 3.5) out.push({ p: [g.beacon[0], g.beacon[1], g.beacon[2] - 0.25], text: '内袋 5 块备用电池 · 5 spare packs', color: '#ffd27a' });
    if (t > 10 && t < 15) out.push({ p: pos, text: '前置等待 · leapfrog', color: '#ffd27a' });
    if (t > 19.5 && t < 23) out.push({ p: pos, text: '避障：降到 2 m · duck under branch', color: '#9cc8ff' });
    return out;
  };
  R.frame = makeFrame(R, res, rider, trees, null, P, { labels, swap: (t) => (t >= 0.4 && t <= 3.6 ? (t - 0.4) / 3.2 : -1) });
  R.demoResult = res;
  return R;
}

export default {
  id: 'trackdrone', family: 'aerial',
  name: { zh: 'S2 轨迹复现跟拍无人机 + 背包仓', en: 'S2 Track-replay drone + backpack dock' },
  tagline: { zh: 'v2：150 g 整流罩涵道机沿你刚滑过的轨迹飞，动能限速，换电，捕获锥回仓', en: 'v2: 150 g faired ducted quad replays your track, KE-governed, swappable packs, capture-cone dock' },
  about: {
    zh: 'v3（默认；design=1/2 回到旧版）：在 v2 基础上加入信标丢失时的机载视觉跟踪兜底、前视深度传感器（量程 12 m、视场 120°，躲树/下钻横枝/对他人爬升让行）、超出动能安全速度时的前置等待/摇摄模式、按跟踪框高度变焦。v2：150 g 整流罩涵道机（CdA≈0.006 m²）、动能限速 ≤14.9 J、内袋 6 块保温电池（缆车上换电）、10 cm 捕获锥 + 背风站姿 + 0.25 m 对准后快速下压回仓、曲率受限的走廊内平滑。可穿戴 UWB/RTK 信标给出滑行者位置；无人机在其轨迹后 0.3–2 s、离雪 3 m 复现飞行（人身高处的障碍已被人“试过”），云台锁定信标。停下时从背包仓起飞与回仓，可做侧拍/环绕高光镜头，可选 Dyneema 牵绳。模型：三维平动 + 推力/倾角极限 + 一阶姿态、线性+二次阻力、阵风、海拔密度、动量理论功率、低温电池与压降、信标噪声/延迟/丢失、障碍与他人、对接中止重试。',
    en: 'v3 (default; design=1/2 restore older versions): v2 plus an onboard visual-tracker fallback for beacon loss, a forward depth sensor (12 m, 120° FOV: tree standoff, ducking under branches, climbing to yield to people), a leapfrog/pan mode when the rider exceeds the KE-safe speed, and bounding-box zoom. v2: 150 g faired ducted airframe (CdA ≈0.006 m²), kinetic-energy speed governor ≤14.9 J, six warm packs in an inner pocket (swapped on the lift), 10 cm capture cone + back-to-wind stance + align-at-0.25 m-then-commit docking, curvature-limited smoothing inside the corridor. A wearable UWB/RTK beacon gives the rider’s position; the drone replays the rider’s track 0.3–2 s behind at 3 m above the snow (obstacles at rider height were just “tested” by the rider), gimbal locked on the beacon. Launches from and docks on a backpack pod at stops; side-pass/orbit highlights; optional Dyneema leash. Model: 3-D translation with thrust/tilt limits and first-order attitude, linear+quadratic drag, gusts, altitude density, momentum-theory power, cold battery with sag, beacon noise/latency/dropouts, obstacles and bystanders, dock abort/retry.',
  },
  modelVersion: VERSION,
  modelLimits: [
    { zh: '无机载视觉避障：只有轨迹走廊；高于头顶的树枝、走廊外障碍不可见', en: 'No onboard vision avoidance: only the track corridor; branches above head height and off-corridor obstacles are invisible to it' },
    { zh: '旋翼为准静态动量理论；不含桨盘入流导致的高空速推力下降、涡环、地面效应', en: 'Quasi-static momentum-theory rotors; no thrust loss at high advance ratio, vortex ring or ground effect' },
    { zh: '姿态为一阶推力矢量滞后，不含转动惯量/偏航动力学；人体尾流为简化湍流模型', en: 'Attitude as a first-order thrust-vector lag, no rotational inertia/yaw dynamics; rider wake is a simplified turbulence add-on' },
    { zh: '画面仅几何（不含曝光、雪地反光、运动模糊、遮挡）；噪声值为假设', en: 'Footage is geometric only (no exposure, snow glare, motion blur, occlusion); noise is assumed' },
    { zh: '仓口捕获为几何判据（半径+相对速度），不含接触力学与仓盖机构', en: 'Pod capture is a geometric criterion (radius + relative speed), no contact mechanics or lid mechanism' },
    { zh: '树木为确定性锥体+枝干包络；真实林缘不规则、会随风摆动', en: 'Trees are deterministic cone + branch envelopes; real tree lines are irregular and sway' },
    { zh: '法规仅按目视/雪场许可标注，未做法务分析', en: 'Regulation only flagged (VLOS / resort permission); no legal analysis' },
    { zh: 'v2 机身按质量缩放（未做 CFD/风洞）；整流罩阻力面积为假设；EPP 护罩未计入（待 ASTM F3389 试验）', en: 'v2 airframe scaled by mass (no CFD/wind tunnel); fairing drag area ASSUMED; EPP shroud not credited (ASTM F3389 test pending)' },
    { zh: '仓口下洗回流为随机侧向力假设（5% 重量）；拖曳绳只算几何与张力，不含缠绕/挂枝动力学', en: 'Pod downwash recirculation is an assumed random lateral force (5 % W); tow leash: geometry and tension only, no tangling/snag dynamics' },
    { zh: '续航由 20–36 s 片段外推，电池起始温度取内袋/加热仓温度', en: 'Endurance extrapolated from 20–36 s runs; packs start at the pocket/pod temperature' },
    { zh: 'v3 视觉跟踪与深度传感器为参数化假设（检测率随距离/光照、噪声、视场），未用真实数据集标定；树只按锥体包络感知，细枝/雪雾不建模', en: 'v3 vision tracker and depth sensor are parametric ASSUMPTIONS (detection vs distance/light, noise, FOV), not fitted to real datasets; trees sensed as cone envelopes, no thin twigs or snow-fog' },
    { zh: '信标装在躯干肩带上：共享 trunk.js 的躯干转动未接入（信标点按 bodyPoints 的整体倾斜计算）', en: 'Beacon on the torso strap: shared trunk.js trunk rotation not yet applied (beacon point follows the whole-body lean of bodyPoints)' },
  ],
  params: PARAMS,
  scenarios: SCEN,
  simulate: (params, scenario) => simulate(params, scenario),
  simulateWith: simulate,
  demo: { duration: DEMO_T, stages: DEMO_STAGES, build: (p) => buildDemo(p || defaults()) },
  gear: () => import('./gear.js'),
};
export { trim, derive, designParams, windCapability, SCEN as TRACKDRONE_SCENARIOS, PARAMS as TRACKDRONE_PARAMS, cycleTrial, dockSweep, runScenario, buildDemo };
