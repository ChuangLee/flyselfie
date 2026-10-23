// B0 baseline: helmet action camera (first-person). Anchors the comparison: a
// body camera records continuously with no setup, but never sees the skier
// from outside, so third-person availability is 0 by geometry.
import { simulateSkier, skierAt, bodyPoints } from '../common/skier.js';
import { footage, stats } from '../common/env.js';
import { makeResult, fraction } from '../common/result.js';

const SCEN = [
  { id: 'cruise', zh: '中速大弯', en: 'Medium-speed carving', skier: { duration: 25 } },
  { id: 'short', zh: '短弯', en: 'Short turns', skier: { duration: 25, style: 'short' } },
];

function simulate(params, scenario) {
  const sc = scenario || SCEN[0];
  const sk = simulateSkier({ ...sc.skier });
  const R = makeResult({ conceptId: 'baseline', scenarioId: sc.id, modelVersion: 'baseline@0.1.0', duration: sk.duration, sampleDt: sk.sampleDt });
  const px = R.col('subjectPx'), sp = R.col('speed'), lat = R.col('latG');
  const cams = [];
  for (let i = 0; i < R.n; i++) {
    const s = skierAt(sk, R.columns.t[i]);
    const b = bodyPoints(s);
    const pos = [b.head[0] + s.heading[0] * 0.12, b.head[1] + s.heading[1] * 0.12, b.head[2] + 0.1];
    const cam = { pos, kind: 'rect', fwd: [s.heading[0], s.heading[1], -0.35], up: b.up, vfovDeg: 70, w: 1920, h: 1080 };
    cams.push(cam);
    const f = footage(cam, s);
    px[i] = f.inFrame ? f.subjectPx : 0; sp[i] = s.speed; lat[i] = s.lat / 9.81;
  }
  const third = fraction(R.n, (i) => px[i] > 100);
  R.metric('avail', '第三人称全身可用比例', 'Third-person full-body availability', third * 100, '%', third > 0.8, { zh: '>80%', en: '>80%' });
  R.metric('pxMed', '主体像素（中位）', 'Subject px (median)', 0, 'px', false, { zh: '≥300 px', en: '≥300 px' });
  R.metric('azRange', '观察方位角跨度', 'Viewing azimuth span', 0, '°', null);
  R.metric('addedMass', '身上附加质量', 'Added body mass', 0.15, 'kg', true, { zh: '<1.5 kg', en: '<1.5 kg' });
  R.metric('bodyForcePeak', '装置对身体峰值力', 'Peak device force on body', 0, 'N', true);
  R.metric('handsBusy', '滑行中需要手的时间', 'Time a hand is needed', 0, '%', true);
  R.metric('setupTime', '展开+收纳时间', 'Deploy + stow time', 10, 's', true, { zh: '<60 s（假设）', en: '<60 s (assumed)' });
  R.metric('ops', '每趟操作次数', 'User actions per run', 1, '-', true);
  R.metric('endurance', '低温累计拍摄时长', 'Cold filming per charge', 90, 'min', true, { zh: '≥45 min', en: '≥45 min' });
  R.plots.push({ key: 'px', zh: '主体像素高度', en: 'Subject pixel height', series: [['subjectPx', 'px', '主体像素高', 'Subject px'], ['speed', 'm/s', '速度', 'Speed']] });
  R.frame = (t) => {
    const s = skierAt(sk, t);
    const cam = cams[R.index(t)];
    return { t, tanS: sk.tanS, skier: { ...s, pack: 'plain' }, device: { cam: cam.pos, fwd: cam.fwd }, productCam: { pos: cam.pos, fwd: cam.fwd, up: [0, 0, 1], vfovDeg: 70, label: 'B0 头盔相机 / helmet cam' } };
  };
  return R;
}

export default {
  id: 'baseline', family: 'baseline',
  name: { zh: 'B0 头盔运动相机（基线）', en: 'B0 Helmet action cam (baseline)' },
  tagline: { zh: '零准备，但永远看不到自己', en: 'Zero setup, but never sees the skier' },
  modelVersion: 'baseline@0.1.0',
  modelLimits: [{ zh: '只计算几何可见性，不含画质与曝光', en: 'Geometric visibility only; no image quality or exposure' }],
  params: [],
  scenarios: SCEN,
  simulate,
  demo: { duration: 20, stages: [{ key: 'ride', t0: 0, t1: 20, zh: '头盔相机持续记录第一人称画面。', en: 'The helmet camera records first-person footage continuously.', pending: false }], build: (p) => simulate(p, { ...SCEN[0], skier: { duration: 20 } }) },
  gear: () => import('./gear.js'),
};
