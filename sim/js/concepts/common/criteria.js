// Harmonised acceptance criteria for all concepts (SIM-030 iteration 2).
// Source: independent audit research/concepts_2026_10_18/audit/criteria.json.
// One definition and one threshold per metric so the compare table is fair.
// Thresholds are design targets derived from the user goal and cited rules,
// not measured human-factors limits (ASSUMED where stated).

export const CRITERIA = {
  avail: { op: '>=', v: 80, unit: '%', zh: '可用全身画面比例', en: 'Usable full-body footage',
    def: { zh: '滑行时间中，输出画面含完整主体、≥300 px，且主体上无≥1 px 的产品伪影（杆/绳）', en: 'share of skiing time with the full subject in the output frame, ≥300 px, and no product artefact ≥1 px over the subject (stick/tether)' } },
  pxMed: { op: '>=', v: 300, unit: 'px', zh: '主体像素（中位）', en: 'Subject px (median)',
    def: { zh: '1080p 等效输出中主体（脚→头）中位像素高，受原生分辨率限制', en: 'median feet→head height in a 1080p-equivalent output, native-resolution limited' } },
  jitterRms: { op: '<=', v: 3, unit: '°/s', assumed: true, zh: '画面抖动（>1 Hz 视线角速度 RMS）', en: 'Jitter (>1 Hz line-of-sight rate RMS)',
    def: { zh: '产品真实稳像/重构图之后，主体视线相对相机的角速度经 1 Hz 高通后的 RMS（ASSUMED 可观看上限）', en: 'RMS of the >1 Hz line-of-sight angular rate relative to the camera after the stabilisation/reframing the product really has (ASSUMED watchability limit; no video-jitter literature found — nearest: VR cybersickness onset ≈24 °/s; viewer test needed)' } },
  azRange: { op: '>=', v: 45, unit: '°', zh: '可指令观察方位跨度', en: 'Commandable viewing-azimuth span',
    def: { zh: '一趟内可按指令获得的相对滑行方向的观察方位 p5–p95 跨度（0.2 Hz 低通）', en: 'p5–p95 span of viewing azimuth relative to heading deliverable on command within a run (0.2 Hz low-pass)' } },
  addedMass: { op: '<=', v: 1.5, unit: 'kg', zh: '身上附加质量', en: 'Added body mass',
    def: { zh: '滑行时身上全部附加质量，含停靠的飞行器、所依赖的电池/充电宝、卷轴与支架', en: 'everything worn while skiing incl. docked aircraft, batteries/power banks relied on, reels and frames' } },
  bodyForcePeak: { op: '<=', v: 40, unit: 'N', zh: '装置对身体峰值力', en: 'Peak device force on body', assumed: true,
    def: { zh: '直立滑行各工况（含挂枝）装置对身体力的 50 ms 滑动平均峰值，扣除静重', en: 'peak 50 ms moving mean of device force on the body minus static weight, all upright scenarios incl. snags (ASSUMED target: no wearer force-tolerance literature found, calibration 2026-10-18)' } },
  handsBusy: { op: '<=', v: 5, unit: '%', zh: '滑行中需要手的时间', en: 'Hand needed while moving',
    def: { zh: '滑行中每次操作计 1 s；停稳时的操作不计', en: '1 s per action while moving; actions while stopped do not count' } },
  setupTime: { op: '<=', v: 30, unit: 's', zh: '每趟停留时间（展开+收纳）', en: 'Standstill per run (deploy + stow)',
    def: { zh: '0–9 m/s 风中 90 百分位，含停靠失败重试', en: '90th percentile over 0–9 m/s wind, incl. dock retries' } },
  ops: { op: '<=', v: 2, unit: '-', zh: '每趟操作次数', en: 'User actions per run', def: { zh: '展开/起飞、收纳/降落、换电、找回', en: 'deploy/launch, stow/land, battery swap, recovery' } },
  keMax: { op: '<=', v: 14.9, unit: 'J', zh: '可撞他人的最大动能', en: 'Max KE that can strike others',
    def: { zh: '离骑手 >1.5 m 时按雪面系，≤1.5 m 按骑手系；14.9 J 参照 FAA Part 107 第 2 类，80 J 为硬否决线', en: 'ground frame beyond 1.5 m of the rider, rider frame within; 14.9 J per FAA Part 107 Cat 2, 80 J hard kill line' } },
  packVol: { op: '<=', v: 3, unit: 'L', assumed: true, zh: '收纳体积', en: 'Packed volume',
    def: { zh: '不拍摄时（缆车、行走）全部装置收起后的外包体积；3 L≈背包侧袋（ASSUMED，用户2026-10-19要求收放携带极简）', en: 'bounding volume of the whole device when stowed (lift, walking); 3 L ≈ a pack side pocket (ASSUMED, user 2026-10-19: set-up, take-down and packing as easy as possible)' } },
  headClear: { op: '>=', v: 1.0, unit: 'm', assumed: true, zh: '飞行/拖曳部件离头最小距离', en: 'Min clearance of flying/towed parts to the head',
    def: { zh: '全程（含停顿与起降）任何飞行体、绳线或桨盘到骑手头盔中心的最小距离，仅排除声明的≤3 s 停靠捕获窗口（ASSUMED，复核2026-10-20）', en: 'minimum distance from any airborne body, line or rotor disc to the rider\'s helmet centre over the full run incl. stops/launch/landing, excluding only a declared ≤3 s dock-capture window (ASSUMED, re-audit 2026-10-20)' } },
  endurance: { op: '>=', v: 45, unit: 'min', zh: '低温累计拍摄时长', en: 'Cold filming per charge',
    def: { zh: '−10 °C、保留储备、按标准工况平均功率，一次充电（含全部随身电池）的累计拍摄分钟', en: 'cumulative filming minutes per charge of everything worn at −10 °C, nominal mean power, keeping reserve' } },
};

export function judge(id, value) {
  const c = CRITERIA[id];
  if (!c || !Number.isFinite(value)) return { pass: null, criterion: null };
  const pass = c.op === '>=' ? value >= c.v : value <= c.v;
  const a = c.assumed ? '（假设）' : '', ae = c.assumed ? ' (assumed)' : '';
  return { pass, criterion: { zh: `${c.op === '>=' ? '≥' : '≤'}${c.v} ${c.unit}${a}`, en: `${c.op === '>=' ? '≥' : '≤'}${c.v} ${c.unit}${ae}` } };
}

// Add a harmonised metric to a Result (see common/result.js): uses the shared
// label, threshold and pass logic so every concept is judged identically.
export function addStd(R, id, value, note) {
  const c = CRITERIA[id];
  const j = judge(id, value);
  R.metric(id, c.zh + (note ? `（${note.zh}）` : ''), c.en + (note ? ` (${note.en})` : ''), value, c.unit, j.pass, j.criterion);
}

// 2nd-order Butterworth high-pass (bilinear), applied forward and backward (zero phase)
function hp2(x, fc, dt) {
  const K = Math.tan(Math.PI * fc * dt), Q = Math.SQRT1_2, norm = 1 / (1 + K / Q + K * K);
  const b0 = norm, b1 = -2 * norm, b2 = norm, a1 = 2 * (K * K - 1) * norm, a2 = (1 - K / Q + K * K) * norm;
  const pass = (s) => { const y = new Float64Array(s.length); let x1 = s[0], x2 = s[0], y1 = 0, y2 = 0; for (let i = 0; i < s.length; i++) { const v = b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = s[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const f = pass(x); f.reverse(); const r = pass(f); r.reverse(); return r;
}

// Harmonised jitter: los[i], fwd[i] unit vectors (subject line of sight, camera
// optical axis) at uniform dt; mask[i] = sample counts (skiing + filming).
// Relative angular velocity ω = (l_{i-1}×l_i − f_{i-1}×f_i)/dt, high-passed at
// 1 Hz per component over contiguous ≥2 s masked segments (0.5 s edges dropped).
export function jitterHP(los, fwd, dt, mask = null, fc = 1) {
  const n = los.length;
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const w = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let i = 1; i < n; i++) {
    const a = cr(los[i - 1], los[i]), b = cr(fwd[i - 1], fwd[i]);
    for (let k = 0; k < 3; k++) w[k][i] = (a[k] - b[k]) / dt;
  }
  w.forEach((c) => { c[0] = c[1] || 0; });
  let sum = 0, cnt = 0, peak = 0;
  const edge = Math.round(0.5 / dt), minLen = Math.round(2 / dt);
  let i = 0;
  while (i < n) {
    if (mask && !mask[i]) { i++; continue; }
    let j = i; while (j < n && (!mask || mask[j])) j++;
    if (j - i >= minLen) {
      // the first sample of a segment differences against an unmasked (placeholder) sample: hold the next value
      const seg = w.map((c) => { const x = Float64Array.from(c.subarray(i, j)); x[0] = x[1]; return x; });
      const f = seg.map((c) => hp2(c, fc, dt));
      for (let k = edge; k < j - i - edge; k++) {
        const m2 = f[0][k] ** 2 + f[1][k] ** 2 + f[2][k] ** 2;
        sum += m2; cnt++; peak = Math.max(peak, Math.sqrt(m2));
      }
    }
    i = j;
  }
  const deg = 180 / Math.PI;
  return { rms: cnt ? Math.sqrt(sum / cnt) * deg : NaN, peak: peak * deg, samples: cnt };
}

// Independent, uniform footage-stability check computed by the integrator from
// any Result's productCam frames (not from the concept's own metric code):
//   subject  = >1 Hz rate of the subject line of sight relative to the optical
//              axis (how much the rider jumps in frame)
//   background = >1 Hz world angular rate of the optical axis (how much the
//              scene shakes/pans behind the rider)
// Reference (2026-10-18, scratchpad ideal-chase study): a perfectly smooth chase
// camera 6 m back / 3 m up with a perfect tracking gimbal gives subject 0 and
// background 0.1–0.3 °/s carving, 1.6–3.0 °/s in measured short turns; a
// body-locked camera 1.5 m from the rider gives 2.5 (carving) to 26 °/s (short turns).
export function footageStability(R, { minSpeed = 2, dt = 0.02 } = {}) {
  const los = [], fwd = [], mask = [];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  let last = null;
  for (let t = 0; t <= R.duration + 1e-9; t += dt) {
    const f = R.frame(t);
    const pc = f.productCam;
    const s = f.skier;
    const ok = !!pc && (s.speed ?? 0) > minSpeed && !s.fallen;
    if (ok) {
      const h = 1.75 * 0.55 * (1 - 0.16 * (s.crouch ?? 0.3));
      const mid = [s.pos[0], s.pos[1], s.pos[2] + h];
      last = { l: nrm([mid[0] - pc.pos[0], mid[1] - pc.pos[1], mid[2] - pc.pos[2]]), f: nrm(pc.fwd) };
    }
    los.push(last ? last.l : [1, 0, 0]); fwd.push(last ? last.f : [1, 0, 0]); mask.push(ok ? 1 : 0);
  }
  const zero = fwd.map(() => [1, 0, 0]);
  const subj = jitterHP(los, fwd, dt, mask), bg = jitterHP(fwd, zero, dt, mask);
  return { subjectRms: subj.rms, backgroundRms: bg.rms, samples: subj.samples };
}
