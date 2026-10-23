// SledPack promo (SIM-033): scripted narrative timeline for the concept video.
// Pure JS (no three.js) so the 3D page and the text-overlay page share it.
// ILLUSTRATION ONLY — scripted kinematics, not a numerical result. Numbers shown
// in the video come from copy.json (research/sledpack_2026_10_21/video/), which
// cites the simulation results; nothing here is evidence.
// Model coordinates: x downslope, y left, z up (metres), like sim/js/ui/demo.js.

export const FPS = 30;
export const DURATION = 86;
export const TAN_S = Math.tan(15 * Math.PI / 180);

// geometry (BRIEF.md / promo_facts.json; ASSUMED where the design is open)
export const GEOM = {
  lineFly: 6,          // m flown line from the sleeve mouth (sledpack@0.1.0 defaults: Lfilm 6 m)
  elevFly: 55,         // deg line elevation in flight (promo_facts: 50–60, provisional)
  sleeveLen: 0.65,     // m spine sleeve (design.js GEOM, iteration I9: 0.65 m, Ø60 outer / Ø55 inner)
  span: 0.59, chord: 0.457, // sled kite 0.20 m² (sledpack design.js geo, areaScale 0.667)
  bridle: 0.327,       // m from the tow point (apex) to the sail
  tailLen: 1.2, tailD: 0.25, // drogue tail cone on its tail line (design.js TAIL)
};

// sections (used by the overlay for captions and by the director for shots)
export const SECTIONS = [
  { key: 'hero', t0: 0, t1: 6 },
  { key: 'product', t0: 6, t1: 12 },
  { key: 'xray', t0: 12, t1: 18 },
  { key: 'sense', t0: 18, t1: 22.5 },
  { key: 'launch', t0: 22.5, t1: 29 },
  { key: 'fly', t0: 29, t1: 35.5 },
  { key: 'onboard', t0: 35.5, t1: 40 },
  { key: 'how', t0: 40, t1: 47 },
  { key: 'stop', t0: 47, t1: 52.5 },
  { key: 'dock', t0: 52.5, t1: 58.5 },
  { key: 'stowed', t0: 58.5, t1: 64 },
  { key: 'facts', t0: 64, t1: 77 },
  { key: 'end', t0: 77, t1: DURATION + 0.01 },
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

// key events (s)
export const EV = { push: 18.6, armed: 19.6, launch: 21.6, out: 22.1, power: 23.9, open: 24.8, airborne: 26.6, carve0: 31, carve1: 46.6, depower: 46.9, stop: 48.4, reel: 47.3, onSnow: 48.9, slow: 48.6, capture: 54.0, docked: 55.6, relax: 60.0 };

// ground speed (m/s) along the path
const SPEED = [[0, 0], [EV.push, 0], [19.4, 1.6], [20.6, 4.5], [22, 7.5], [24, 10], [27, 11.5], [EV.carve1, 12], [EV.stop, 0], [EV.relax, 0], [61.5, 1.8], [64, 3.2], [72, 3.2], [76, 2.0], [DURATION, 1.5]];
// hockey-stop yaw (deg, relative to travel) and back
const YAW = [[0, 0], [EV.carve1, 0], [47.6, 62], [EV.stop, 78], [59.2, 78], [61.2, 0], [DURATION, 0]];
// external line length from the funnel lip (m); negative = depth inside the sleeve (pod deepest)
// final sequence (promo_facts FINAL I9): launch only at est. apparent wind ≥5.5 m/s and tailwind ≤6 m/s;
// tail-first out of the sleeve, streams low and flagged to 3 m, then powered: opens, climbs to ≈55°, 6 m line.
// Stop: full depower + fast pull-down (3.5 m/s) while still sliding, low tow on the snow, slow last 1.5 m.
const LINE = [[0, -GEOM.sleeveLen], [EV.launch, -GEOM.sleeveLen], [EV.out, 0], [23.7, 3.0], [EV.power, 3.0], [25.4, GEOM.lineFly], [EV.depower, GEOM.lineFly], [EV.reel, GEOM.lineFly], [EV.slow, 1.5], [EV.capture, 0.25], [54.6, 0], [EV.docked, -GEOM.sleeveLen], [DURATION, -GEOM.sleeveLen]];
// line elevation (deg) above the horizontal at the funnel
const ELEV = [[0, -55], [EV.launch, -55], [EV.out, -30], [22.9, -6], [EV.power, 4], [24.8, 22], [EV.airborne, GEOM.elevFly], [EV.depower, GEOM.elevFly], [EV.reel, 40], [EV.slow, -8], [EV.onSnow, -18], [51.0, -25], [53.0, -35], [EV.capture, -55], [54.6, -80], [DURATION, -80]];
// sail opening 0 folded … 1 flying; depower/flag 0 … 1
const OPEN = [[0, 0], [EV.out, 0.05], [23.3, 0.3], [EV.power, 0.35], [EV.open, 1], [EV.depower, 1], [48.0, 0.5], [EV.slow, 0.35], [EV.onSnow, 0.3], [53.0, 0.14], [EV.capture, 0.07], [54.6, 0.03], [DURATION, 0]];
const DEPOWER = [[0, 1], [EV.power, 1], [EV.open, 0], [EV.depower, 0], [47.3, 1], [EV.docked, 1], [DURATION, 1]];
const DT = 0.05;
const PATH = (() => {
  const out = [];
  let x = 0, phase = 0, y = 0, hx = 1, hy = 0;
  for (let t = 0; t <= DURATION + 1e-9; t += DT) {
    const u = lerpTab(SPEED, t);
    const turning = smooth(EV.carve0 - 1.5, EV.carve0, t) * (1 - smooth(EV.carve1 - 1.2, EV.carve1, t));
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
  // lateral acceleration from heading change
  const dh = Math.atan2(b.hy, b.hx) - Math.atan2(a.hy, a.hx);
  const lat = (dh / (2 * DT)) * s.u;
  const accel = (b.u - a.u) / (2 * DT);
  const st = { pos, heading, travel: [s.hx, s.hy, 0], speed: s.u, lat, accel, plantL: 0, plantR: 0, crouch: s.u < 0.3 ? 0.08 : undefined };
  // double-pole push-off, then skating strides when leaving after the dock
  const pushes = [EV.push + 0.1, EV.push + 0.9, EV.push + 1.7, 60.4, 61.3, 62.2];
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

// apparent wind seen by the kite (model frame), ambient wind light cross-head breeze
export const WIND = [-1.5, 1.0, 0];
export function apparentWind(t) {
  const s = pathAt(t);
  return [WIND[0] - s.u * s.hx, WIND[1] - s.u * s.hy, 0]; // air velocity relative to the rider
}

// kite state relative to the sleeve mouth: line length, direction, opening
export function kiteState(t) {
  const L = lerpTab(LINE, t);
  const elev = lerpTab(ELEV, t) * Math.PI / 180;
  // azimuth: downwind of the apparent wind, lagged so the kite averages the carving
  let ax = 0, ay = 0, wsum = 0;
  for (let k = 0; k <= 12; k++) {
    const tt = Math.max(0, t - k * 0.12), w = Math.exp(-k * 0.12 / 0.9);
    const aw = apparentWind(tt), m = Math.hypot(aw[0], aw[1]);
    if (m > 0.5) { ax += (aw[0] / m) * w; ay += (aw[1] / m) * w; wsum += w; }
  }
  const tr = pathAt(t);
  let az = wsum > 0 ? Math.atan2(ay, ax) : Math.atan2(-tr.hy, -tr.hx);
  // once stopped, keep the azimuth where the kite came down (behind the old travel line)
  if (t > EV.stop) {
    const s = pathAt(EV.stop - 0.3);
    az = Math.atan2(-s.hy, -s.hx) + 0.05;
  }
  const sway = smooth(EV.open, EV.airborne, t) * (1 - smooth(EV.depower, 48, t));
  az += sway * (0.07 * Math.sin(t * 0.9) + 0.03 * Math.sin(t * 2.3 + 1));
  const el = elev + sway * (0.035 * Math.sin(t * 1.3 + 2) + 0.015 * Math.sin(t * 3.1));
  const dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  return {
    L, dir, az, elev: el,
    open: lerpTab(OPEN, t), depower: lerpTab(DEPOWER, t),
    docked: L <= 1e-3, inside: L < 0 ? -L / GEOM.sleeveLen : 0,
    onSnow: t > EV.onSnow - 0.3 && t < EV.capture,
  };
}

// state machine shown in the HUD
export function systemState(t) {
  const s = pathAt(t);
  const aw = apparentWind(t), awm = Math.hypot(aw[0], aw[1]);
  let mode = 'DOCKED';
  if (t >= EV.armed && t < EV.launch) mode = 'ARMED';
  else if (t >= EV.launch && t < EV.airborne) mode = 'LAUNCH';
  else if (t >= EV.airborne && t < EV.depower) mode = 'FILMING';
  else if (t >= EV.depower && t < EV.onSnow) mode = 'DEPOWER';
  else if (t >= EV.onSnow && t < EV.capture) mode = 'RETRIEVE';
  else if (t >= EV.capture && t < EV.docked + 0.4) mode = 'DOCKING';
  else if (t >= EV.docked + 0.4) mode = 'DOCKED · CHARGING';
  // displayed line tension (N): illustrative envelope only
  const ks = kiteState(t);
  const tension = ks.L > 1 ? Math.min(32, 0.5 * 1.0 * awm * awm * 0.3 * (0.35 + 0.25 * (1 - ks.depower)) * ks.open) : 0;
  return { mode, speed: s.u, apparent: awm, line: Math.max(0, ks.L), tension };
}
