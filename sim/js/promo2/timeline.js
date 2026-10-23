// SledPack promo v2 (SIM-034): scripted narrative timeline for the concept film.
// User decisions 2026-10-21: the kite rides OPEN on a slim back shell (no sleeve, no pole, no chairlift
// case); it flies higher and farther when fast/windy and lower/closer in light air or tailwind; fixed
// filming angle, optional small automatic nudges. Pure JS (no three.js), shared by the 3D and text pages.
// ILLUSTRATION ONLY — scripted kinematics, not a numerical result. Numbers in the film come from
// research/sledpack_2026_10_21/video/copy_v2.json (cited to dev/promo_facts.json); nothing here is evidence.
// Model coordinates: x downslope, y left, z up (metres).

export const DURATION = 93;
export const TAN_S = Math.tan(15 * Math.PI / 180);

// geometry + line law: sledpack@0.2.1 / I11 (dev/promo_facts.json FINAL)
export const GEOM = {
  span: 0.588, chord: 0.457, bridle: 0.327,     // sled kite 0.20 m²
  tailLen: 1.2, tailD: 0.25,                    // drogue tail
  // line schedule: L = clamp(6 + 0.75 (v_app − 12), 5, 9) m, 2 s smoothing; same ≈55° flying angle
  lineMin: 5, lineMax: 9, lineRef: 6, vRef: 12, lineK: 0.75, smoothS: 2,
  elevLo: 55, elevHi: 55,
  payout: 2.0, reelIn: 3.5,                     // m/s line rates
  nudge: false,                                 // steering not adopted in I10 (fixed angle; user accepted)
  nudgeAz: 0.22, nudgeEl: 0.08,
  parkBehind: 2.5,                              // m: parks on the snow behind the rider when it cannot be laid on the back
};

export const SECTIONS = [
  { key: 'hero', t0: 0, t1: 6 },
  { key: 'product', t0: 6, t1: 12 },
  { key: 'onback', t0: 12, t1: 17 },
  { key: 'sense', t0: 17, t1: 21.2 },
  { key: 'launch', t0: 21.2, t1: 26.5 },
  { key: 'fast', t0: 26.5, t1: 34.5 },
  { key: 'onboard', t0: 34.5, t1: 38.5 },
  { key: 'light', t0: 38.5, t1: 45 },
  { key: 'how', t0: 45, t1: 50 },
  { key: 'stop', t0: 50, t1: 55 },
  { key: 'park', t0: 55, t1: 61 },
  { key: 'dock', t0: 61, t1: 67 },
  { key: 'stowed', t0: 67, t1: 71 },
  { key: 'facts', t0: 71, t1: 84 },
  { key: 'end', t0: 84, t1: DURATION + 0.01 },
];
export const sectionAt = (t) => SECTIONS.find((s) => t >= s.t0 && t < s.t1) || SECTIONS[SECTIONS.length - 1];

const lerpTab = (tab, t) => {
  if (t <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (t <= tab[i][0]) {
      const [t0, a] = tab[i - 1], [t1, b] = tab[i];
      const k = (t - t0) / (t1 - t0), s = k * k * (3 - 2 * k);
      return a + (b - a) * s;
    }
  }
  return tab[tab.length - 1][1];
};
export const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// key events (s)
export const EV = {
  push: 18.0, armed: 19.0, launch: 20.8, drop: 21.6, power: 22.2, airborne: 23.0, // I11: 0.8 s peel-off from the back
  carve0: 28.0, carve1: 37.5, slowA: 38.5, lightOn: 40.5, lightOff: 44.5, carve2: 46.5, carve3: 49.4,
  depower: 49.9, pull: 50.2, stop: 51.8, parked: 52.2,
  push2: 58.4, relaunch: 58.8, air2: 60.6, retrieve: 63.4, capture: 65.4, stow: 66.6,
};

// ground speed (m/s)
const SPEED = [[0, 0], [EV.push, 0], [18.8, 1.6], [20.0, 4.5], [21.5, 8], [24, 11], [27.5, 13], [EV.carve1, 13.2], [40.0, 6.5], [EV.lightOff, 6.2], [47.0, 10.5], [EV.carve3, 10.8], [EV.stop, 0], [EV.push2, 0], [59.3, 2.0], [60.6, 5.5], [62.5, 7.0], [EV.retrieve, 6.8], [EV.capture, 3.5], [70, 3.2], [80, 3.0], [DURATION, 2.0]];
const YAW = [[0, 0], [EV.carve3 + 0.2, 0], [51.0, 62], [EV.stop, 78], [57.4, 78], [59.0, 0], [DURATION, 0]];
const DT = 0.05;
const PATH = (() => {
  const out = [];
  let x = 0, phase = 0, y = 0, hx = 1, hy = 0;
  for (let t = 0; t <= DURATION + 1e-9; t += DT) {
    const u = lerpTab(SPEED, t);
    const turning = Math.max(
      smooth(EV.carve0 - 1.5, EV.carve0, t) * (1 - smooth(EV.carve1 - 1.2, EV.carve1, t)),
      0.6 * smooth(EV.carve2 - 1.0, EV.carve2, t) * (1 - smooth(EV.carve3 - 0.8, EV.carve3, t)));
    const w = (2 * Math.PI) / 4.6;
    const ydot = u * 0.42 * Math.cos(phase) * turning;
    const xdot = Math.sqrt(Math.max(0, u * u - ydot * ydot));
    if (u > 0.2) { const n = Math.hypot(xdot, ydot); hx = xdot / n; hy = ydot / n; }
    out.push({ t, x, y, u, hx, hy, phase, turning });
    x += xdot * DT; y += ydot * DT;
    phase += w * DT * turning;
  }
  return out;
})();
const pathAt = (t) => PATH[Math.max(0, Math.min(PATH.length - 1, Math.round(t / DT)))];

export function skierState(t) {
  const s = pathAt(t);
  const a = pathAt(t - DT), b = pathAt(t + DT);
  const yaw = lerpTab(YAW, t) * Math.PI / 180;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const heading = [s.hx * c - s.hy * sn, s.hx * sn + s.hy * c, 0];
  const pos = [s.x, s.y, -s.x * TAN_S];
  const dh = Math.atan2(b.hy, b.hx) - Math.atan2(a.hy, a.hx);
  const lat = (dh / (2 * DT)) * s.u;
  const accel = (b.u - a.u) / (2 * DT);
  const st = { pos, heading, travel: [s.hx, s.hy, 0], speed: s.u, lat, accel, plantL: 0, plantR: 0, crouch: s.u < 0.3 ? 0.08 : undefined };
  const pushes = [EV.push + 0.1, EV.push + 0.9, EV.push + 1.7, EV.push2 + 0.1, EV.push2 + 0.9, EV.push2 + 1.7];
  let p = 0; for (const tp of pushes) p = Math.max(p, Math.exp(-(((t - tp) / 0.2) ** 2)));
  st.plantL = st.plantR = p;
  if (s.turning > 0.3) {
    const ph = ((s.phase % Math.PI) + Math.PI) % Math.PI;
    const plant = Math.exp(-(((ph - Math.PI * 0.85) / 0.3) ** 2)) * s.turning;
    const odd = Math.floor(s.phase / Math.PI) % 2 === 0;
    st.plantL = Math.max(st.plantL, odd ? plant : 0); st.plantR = Math.max(st.plantR, odd ? 0 : plant);
  }
  return st;
}

// ambient wind (model frame): light head/cross breeze; during the light-air beat a weak tailwind gust
export function windAt(t) {
  // fast beat: a fresh head wind (apparent ≈19 m/s → long line); light beat: weak tailwind gust
  const head = smooth(26.0, 28.5, t) * (1 - smooth(36.5, 38.5, t));
  const tail = smooth(EV.slowA, EV.lightOn, t) * (1 - smooth(EV.lightOff, EV.lightOff + 1.2, t));
  return [-1.5 - 4.5 * head + 3.0 * tail, 1.0 * (1 - tail), 0];
}
export function apparentWind(t) {
  const s = pathAt(t), w = windAt(t);
  return [w[0] - s.u * s.hx, w[1] - s.u * s.hy, 0];
}
const vApp = (t) => { const a = apparentWind(t); return Math.hypot(a[0], a[1]); };

// line schedule (I11): L = clamp(6 + 0.75 (v − 12), 5, 9); same flying angle
export const lineTarget = (v) => clamp(GEOM.lineRef + GEOM.lineK * (v - GEOM.vRef), GEOM.lineMin, GEOM.lineMax);
export const elevTarget = (v) => GEOM.elevLo + (GEOM.elevHi - GEOM.elevLo) * clamp((v - 8) / 12, 0, 1);

// swing guard (I11): when the kite drifts to the side the pack reels in a little until it recentres (not steering)
export const swing = (t) => smooth(46.6, 47.4, t) * (1 - smooth(48.4, 49.3, t));

// precomputed line state: scripted launch/stop/park, rate-limited 2 s-smoothed schedule while flying
const flying = (t) => (t >= EV.airborne && t < EV.depower) || (t >= EV.air2 && t < EV.retrieve);
const LINE = (() => {
  const out = [];
  let L = 0, el = -10, vs = 0;
  for (let t = 0; t <= DURATION + 1e-9; t += DT) {
    const v = vApp(t);
    vs += (v - vs) * Math.min(1, DT / GEOM.smoothS);
    let Lt, et, rateUp = GEOM.payout, rateDn = GEOM.reelIn, tauE = 1.0;
    if (t < EV.launch) { Lt = 0; et = 0; }
    else if (t < EV.power) { Lt = 2.2; et = -2; rateUp = 2.5; tauE = 0.3; }      // seats release: drops into the wake behind
    else if (t < EV.airborne) { Lt = 5.0; et = 50; tauE = 0.5; }               // paid out into clean air: climbs
    else if (t < EV.depower) { Lt = lineTarget(vs) - 1.4 * swing(t); et = elevTarget(vs); }
    else if (t < EV.pull) { Lt = L; et = el; }                                 // flags
    else if (t < EV.push2) { Lt = GEOM.parkBehind; et = -18; tauE = 0.5; }    // pulled down while sliding, parks on the snow
    else if (t < EV.air2) { Lt = 5.0; et = 50; rateUp = 1.6; tauE = 0.6; }     // relaunch from the snow
    else if (t < EV.retrieve) { Lt = lineTarget(vs); et = elevTarget(vs); }
    else if (t < EV.capture) { Lt = 0.15; et = 18; rateDn = 2.6; tauE = 0.6; } // comes in from behind
    else { Lt = 0; et = 18; }
    L += clamp(Lt - L, -rateDn * DT, rateUp * DT);
    el += (et - el) * Math.min(1, DT / tauE);
    out.push({ L, el, tgt: flying(t) ? lineTarget(vs) : null, v });
  }
  return out;
})();
const lineAt = (t) => LINE[Math.max(0, Math.min(LINE.length - 1, Math.round(t / DT)))];

const OPEN = [[0, 1], [EV.launch, 1], [EV.drop, 0.7], [EV.power, 0.75], [EV.airborne, 1], [EV.depower, 1], [50.8, 0.55], [EV.parked, 0.45], [EV.push2, 0.45], [EV.air2, 1], [EV.retrieve, 1], [EV.capture, 0.9], [EV.stow, 1], [DURATION, 1]];
const DEPOWER = [[0, 0], [EV.launch, 0.3], [EV.drop, 0.6], [EV.power, 0.2], [EV.airborne, 0], [EV.depower, 0], [50.3, 1], [EV.push2, 1], [59.4, 0.2], [EV.air2, 0], [EV.retrieve, 0], [64.4, 0.5], [EV.capture, 0.8], [EV.stow, 0.1], [DURATION, 0]];
// stow 1 = lying open on the back; 0 = flying pose
const STOW = [[0, 1], [EV.launch, 1], [EV.drop, 0], [EV.capture, 0], [EV.stow, 1], [DURATION, 1]];

export function kiteState(t) {
  const ls = lineAt(t);
  const L = ls.L;
  let ax = 0, ay = 0, wsum = 0;
  for (let k = 0; k <= 12; k++) {
    const tt = Math.max(0, t - k * 0.12), w = Math.exp(-k * 0.12 / 0.9);
    const aw = apparentWind(tt), m = Math.hypot(aw[0], aw[1]);
    if (m > 0.5) { ax += (aw[0] / m) * w; ay += (aw[1] / m) * w; wsum += w; }
  }
  const tr = pathAt(t);
  let az = wsum > 0 ? Math.atan2(ay, ax) : Math.atan2(-tr.hy, -tr.hx);
  if (t > EV.stop && t < EV.push2 + 1.5) { const s = pathAt(EV.stop - 0.3); const azP = Math.atan2(-s.hy, -s.hx) + 0.05; az = t < EV.push2 ? azP : azP + (az - azP) * smooth(EV.push2, EV.push2 + 1.5, t); }
  const sway = Math.max(smooth(EV.power, EV.airborne, t) * (1 - smooth(EV.depower, 51, t)), smooth(EV.relaunch, EV.air2, t) * (1 - smooth(EV.retrieve, 64.4, t)));
  az += sway * (0.06 * Math.sin(t * 0.9) + 0.025 * Math.sin(t * 2.3 + 1));
  az += 0.5 * swing(t) * (1 - 0.6 * smooth(47.6, 48.6, t));
  let el = ls.el * Math.PI / 180 + sway * (0.03 * Math.sin(t * 1.3 + 2) + 0.012 * Math.sin(t * 3.1));
  // optional automatic nudges: right, left, up (only shown if the design adopts them)
  let nudge = 0;
  if (GEOM.nudge) {
    const n1 = smooth(46.0, 46.8, t) * (1 - smooth(47.6, 48.4, t));
    const n2 = smooth(48.3, 49.1, t) * (1 - smooth(49.5, 50.2, t));
    az += GEOM.nudgeAz * (n1 - n2);
    el += GEOM.nudgeEl * n2;
    nudge = n1 > 0.05 ? 1 : n2 > 0.05 ? -1 : 0;
  }
  const dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  return {
    L, dir, az, elev: el, target: ls.tgt, vApp: ls.v, nudge,
    open: lerpTab(OPEN, t), depower: lerpTab(DEPOWER, t), stow: lerpTab(STOW, t),
    docked: t < EV.launch || t >= EV.stow, onSnow: t > EV.parked - 0.4 && t < EV.relaunch + 0.5,
  };
}

export function systemState(t) {
  const s = pathAt(t);
  const ks = kiteState(t);
  let mode = 'ON BACK';
  if (t >= EV.armed && t < EV.launch) mode = 'ARMED';
  else if (t >= EV.launch && t < EV.airborne) mode = 'LAUNCH';
  else if (flying(t)) mode = swing(t) > 0.3 ? 'SWING GUARD' : ks.target != null && ks.target < 6.5 ? 'FILMING · LOW' : 'FILMING · HIGH';
  else if (t >= EV.depower && t < EV.parked) mode = 'DEPOWER';
  else if (t >= EV.parked && t < EV.relaunch) mode = 'PARKED';
  else if (t >= EV.relaunch && t < EV.air2) mode = 'RELAUNCH';
  else if (t >= EV.retrieve && t < EV.stow + 0.3) mode = 'DOCKING';
  return { mode, speed: s.u, apparent: ks.vApp, line: Math.max(0, ks.L), target: ks.target };
}
