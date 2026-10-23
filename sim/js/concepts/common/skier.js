// Shared skier trajectory for the concept lab (SIM-030). Deterministic,
// physics-based kinematic model in MODEL coordinates (x downslope, y left,
// z up, metres; planar slope z = -x·tanθ):
//   v' = g(sinθ·cosψ − μ·cosθ) − (ρ·CdA / 2m)·v² − a_skid
//   x' = v·cosψ,  y' = v·sinψ,  ψ = heading relative to the fall line
// The skier steers ψ along a turn plan (carving or short turns) and controls
// speed by skidding (a_skid) towards a target speed, as real skiers do through
// turn shape. Lateral acceleration v·ψ' drives inclination; edge changes
// trigger pole plants. Scripted events: push-off start, hockey stop, fall.
// Evidence: numerical-uncalibrated kinematics; not a biomechanical model.
import { mulberry32 } from '../../model/util.js';

export const SKIER_DEFAULTS = {
  slopeDeg: 15, mass: 80, CdA: 0.5, mu: 0.05, rho: 1.0,
  // calibrated 2026-10-18 (research/concepts_2026_10_18/calibration/proposal.json):
  // recreational carving, turn 2.84 s (measured 2.97 s, Martínez 2019), apex 1.18 g, peak 1.61 BW (1.61–1.68, Nakazato 2011)
  vTarget: 12, turnPeriod: 2.9, turnAmpDeg: 45, style: 'carve', // carve | short | straight
  start: 'moving', v0: 12, // moving | push (from standstill)
  stopAt: null, fallAt: null, duration: 30, sampleDt: 0.02, seed: 1,
};

// Literature-calibrated style presets (each value sourced in calibration/proposal.json)
export const SKIER_PRESETS = {
  recreationalCarve: { style: 'carve', slopeDeg: 15, vTarget: 12, v0: 12, turnPeriod: 2.9, turnAmpDeg: 45 },
  expertCarve: { style: 'carve', slopeDeg: 20, vTarget: 13, v0: 13, turnPeriod: 2.9, turnAmpDeg: 50 },
  shortTurns: { style: 'short', slopeDeg: 15, vTarget: 8, v0: 8, turnPeriod: 2.3, turnAmpDeg: 40 },     // 1.04 s/turn (Martínez 2019)
  moguls: { style: 'short', slopeDeg: 24, vTarget: 4.5, v0: 5, turnPeriod: 2.3, turnAmpDeg: 30, mu: 0.08 }, // ≈ one turn per 3.5 m bump (inference)
};

const G = 9.81;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function simulateSkier(opts = {}) {
  const o = { ...SKIER_DEFAULTS, ...opts };
  const th = (o.slopeDeg * Math.PI) / 180;
  const tanS = Math.tan(th), sinT = Math.sin(th), cosT = Math.cos(th);
  const kd = (o.rho * o.CdA) / (2 * o.mass);
  const rng = mulberry32(o.seed);
  const dt = 0.002, every = Math.round(o.sampleDt / dt);
  const n = Math.floor(o.duration / o.sampleDt) + 1;
  const col = {};
  for (const k of ['t', 'x', 'y', 'z', 'psi', 'hx', 'hy', 'vx', 'vy', 'v', 'lat', 'lon', 'lean', 'crouch', 'plantL', 'plantR', 'fallen']) col[k] = new Float64Array(n);
  // turn-to-turn variation in period and amplitude (deterministic)
  const per = [], amp = [];
  for (let k = 0; k < 64; k++) { per.push(o.turnPeriod * (0.88 + 0.24 * rng())); amp.push(o.turnAmpDeg * (0.85 + 0.3 * rng())); }
  const period = o.style === 'short' ? 0.45 : 1;
  let yawSkid = 0, yawSide = 1, leanS = 0, crouchS = 0.3;
  let x = 0, y = 0, v = o.start === 'push' ? 0 : o.v0, psi = 0, psiPrev = 0, phase = 0, half = 0, lastPlant = -9, plantSide = 1;
  let i = 0;
  for (let s = 0; i < n; s++) {
    const t = s * dt;
    // --- steering plan
    const stopping = o.stopAt != null && t >= o.stopAt;
    const fallen = o.fallAt != null && t >= o.fallAt;
    const pushing = o.start === 'push' && t < 2.2;
    let psiCmd = 0;
    if (o.style !== 'straight' && !pushing) {
      const P = per[half % 64] * period;
      phase += (Math.PI / P) * dt;
      if (phase >= Math.PI) { phase -= Math.PI; half++; }
      const sgn = half % 2 === 0 ? 1 : -1;
      const ramp = o.start === 'push' ? smooth((t - 2.2) / 2) : 1;
      psiCmd = sgn * Math.sin(phase) * (amp[half % 64] * Math.PI / 180) * ramp * (o.style === 'short' ? 0.85 : 1);
    }
    // stay near the piste centre line: bias the turn plan against lateral drift
    if (!stopping) psiCmd -= Math.max(-0.25, Math.min(0.25, 0.035 * y + 0.08 * Math.sin(psi)));
    if (stopping) psiCmd = psi * Math.max(0, 1 - (t - o.stopAt) / 0.8); // travel straightens while skidding
    // first-order steering response (edging lag ≈ 0.15 s)
    psi += (psiCmd - psi) * Math.min(1, dt / 0.15);
    // ski yaw = travel direction + skid angle (skis sideways in a hockey stop)
    if (stopping) yawSkid = (yawSide) * 1.35 * smooth((t - o.stopAt) / 0.45);
    else yawSide = psi >= 0 ? 1 : -1;
    // --- longitudinal dynamics
    let a = G * (sinT * Math.cos(psi) - o.mu * cosT) - kd * v * v;
    if (pushing) a += 2.6 * (1 - t / 2.2) + 0.8;              // double-pole push-off
    if (!stopping && v > o.vTarget) a -= 1.2 * (v - o.vTarget); // speed control by skidding
    if (stopping) a -= 5.5;                                     // hockey-stop deceleration
    if (fallen) a -= 4.0 + 2 * rng();                           // sliding on the snow after a fall
    v = Math.max(0, v + a * dt);
    const vx = v * Math.cos(psi), vy = v * Math.sin(psi);
    x += vx * dt; y += vy * dt;
    const psiDot = (psi - psiPrev) / dt; psiPrev = psi;
    // posture follows its targets with body time constants (no instant switches at stops/falls)
    const leanT = fallen ? 0 : Math.atan2(v * psiDot, G);
    const crouchT = fallen ? 1 : v < 0.3 && !pushing ? 0.12 : Math.min(0.75, 0.2 + 0.02 * v + 0.25 * Math.abs(v * psiDot) / G);
    leanS += (leanT - leanS) * Math.min(1, dt / 0.12);
    crouchS += (crouchT - crouchS) * Math.min(1, dt / (fallen ? 0.35 : 0.3));
    // edge change → pole plant on the new inside
    if (o.style !== 'straight' && Math.abs(psiCmd) < 0.02 && t - lastPlant > 0.6 && v > 3 && !stopping) { lastPlant = t; plantSide = -plantSide; }
    if (s % every === 0) {
      col.t[i] = t; col.x[i] = x; col.y[i] = y; col.z[i] = -x * tanS;
      col.psi[i] = psi;
      col.vx[i] = vx; col.vy[i] = vy;
      col.hx[i] = Math.cos(psi + yawSkid); col.hy[i] = Math.sin(psi + yawSkid);
      col.v[i] = v; col.lat[i] = v * psiDot; col.lon[i] = a;
      col.lean[i] = leanS;
      col.crouch[i] = crouchS;
      const pk = Math.exp(-Math.pow((t - lastPlant - 0.12) / 0.12, 2));
      col.plantL[i] = plantSide > 0 ? pk : 0; col.plantR[i] = plantSide < 0 ? pk : 0;
      if (pushing) { const pp = Math.max(Math.exp(-Math.pow((t - 0.3) / 0.2, 2)), Math.exp(-Math.pow((t - 1.1) / 0.2, 2)), Math.exp(-Math.pow((t - 1.9) / 0.2, 2))); col.plantL[i] = col.plantR[i] = pp; }
      col.fallen[i] = fallen ? 1 : 0;
      i++;
    }
  }
  return { opts: o, tanS, n, sampleDt: o.sampleDt, duration: o.duration, col };
}

// sample (linear) at time t → { pos, heading, speed, lat, accel, lean, crouch, plantL, plantR, fallen }
export function skierAt(sk, t) {
  const f = Math.max(0, Math.min(sk.n - 1, t / sk.sampleDt));
  const i0 = Math.floor(f), i1 = Math.min(sk.n - 1, i0 + 1), w = f - i0;
  const L = (k) => sk.col[k][i0] * (1 - w) + sk.col[k][i1] * w;
  const hx = L('hx'), hy = L('hy'), hl = Math.hypot(hx, hy) || 1;
  return {
    pos: [L('x'), L('y'), L('z')], heading: [hx / hl, hy / hl, 0], vel: [L('vx'), L('vy'), -L('vx') * sk.tanS], speed: L('v'), lat: L('lat'), accel: L('lon'),
    lean: L('lean'), crouch: L('crouch'), plantL: L('plantL'), plantR: L('plantR'), fallen: L('fallen') > 0.5, psi: L('psi'),
  };
}

// approximate body anchor points (model coords) for loads and attachments:
// pelvis, chest, backpack top (rear), helmet, with turn inclination applied
export function bodyPoints(s) {
  const h = s.heading, left = [-h[1], h[0], 0];
  const lean = s.lean || 0, c = s.crouch ?? 0.3;
  // body up vector inclined into the turn (towards the inside = sign of lat)
  const up = [left[0] * Math.sin(lean), left[1] * Math.sin(lean), Math.cos(lean)];
  const at = (f, l, u) => [s.pos[0] + h[0] * f + left[0] * l + up[0] * u, s.pos[1] + h[1] * f + left[1] * l + up[1] * u, s.pos[2] + h[2] * f + left[2] * l + up[2] * u];
  const hipH = 0.95 - 0.22 * c;
  return {
    up, left,
    pelvis: at(-0.06 - 0.1 * c, 0, hipH),
    chest: at(0.05, 0, hipH + 0.4),
    packTop: at(-0.28, 0, hipH + 0.62),
    packMid: at(-0.26, 0, hipH + 0.4),
    head: at(0.12, 0, hipH + 0.78),
    feet: at(0, 0, 0),
  };
}
