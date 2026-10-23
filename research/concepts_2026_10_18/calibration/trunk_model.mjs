// Drop-in candidate for sim/js/concepts/common/skier.js: trunkAt(sk, t, opts)
// Trunk (thorax) rotation relative to the whole-body frame given by skierAt()
// (heading + inclination 'lean' + crouch), plus vertical acceleration at the
// pelvis/trunk from snow roughness and moguls. Deterministic and seeded.
//   pitch: forward flexion oscillation about the crouch-implied mean (rad, + = more flexed)
//   roll : angulation, same sign convention as skierAt().lean; trunk inclination = lean − roll
//          (the trunk stays more upright than the legs), plus small random lateral sway
//   yaw  : trunk rotation relative to the travel heading (rad, + = left), counter-rotation
//   zAcc : vertical (body-up) acceleration at the trunk, m/s², zero mean
// Parameter values: see calibration/proposal.json (TRUNK_PARAMS) — each with its source.
// The model is a parametric fit to published ranges, NOT a measured trunk spectrum.
import { skierAt } from '../../../sim/js/concepts/common/skier.js';

function mulberry32(seed) { let a = seed >>> 0; return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const TRUNK_PARAMS = {
  // Turn-synchronous terms per style. Basis (see proposal.json trunkModel.sources):
  //  angulation: lateral trunk bending vs pelvis 6–12° avg, 9–14° max in SL/GS racers (Spörri 2016, MEASURED);
  //    with apex lean 50–60° that is ≈0.2 of the lean (INFERENCE); cap at the measured max.
  //  pitchTurnDeg: flexion–extension once per turn; amplitude INFERRED (no measured oscillation amplitude found);
  //    mean flexion 11–27° (SL–GS, Spörri 2016) is the posture, carried by crouch in skierAt().
  //  yaw: trunk torsion vs pelvis 5–9° (Spörri 2016, MEASURED); upper body facing the fall line in short turns
  //    (technique convention, INFERENCE) gives a larger trunk-vs-travel counter-rotation.
  carve:    { angulation: 0.2, angulationMaxDeg: 14, pitchTurnDeg: 5, yawCounter: 0.25, yawMaxDeg: 12 },
  short:    { angulation: 0.15, angulationMaxDeg: 10, pitchTurnDeg: 7, yawCounter: 0.6, yawMaxDeg: 25 },
  straight: { angulation: 0, angulationMaxDeg: 0, pitchTurnDeg: 1, yawCounter: 0, yawMaxDeg: 0 },
  // Terrain: vertical (trunk-up) acceleration RMS at 13 m/s, two spectral bumps:
  //  'body' 2–10 Hz (turning + spine resonance 4–10 Hz) and 'chatter' 10–30 Hz (ski chatter 15–25 Hz),
  //  band edges from Spörri 2017 and Supej 2018 (MEASURED bands); RMS levels are INFERRED by scaling the
  //  measured sacrum 9.4–11.1 m/s² (racers, compact artificial snow, weighted) and boot 9.7 (carve) /
  //  12.9 (short) m/s² (instructors, groomed) down to recreational speed/snow and to the vertical axis only.
  terrain: {
    groomed: { zBodyRms: 2.5, zChatRms: 1.0, pitchRmsDeg: 1.0, rollRmsDeg: 0.8 },
    icy:     { zBodyRms: 3.0, zChatRms: 3.0, pitchRmsDeg: 1.5, rollRmsDeg: 1.0 },
    moguls:  { zBodyRms: 2.5, zChatRms: 1.0, pitchRmsDeg: 2.0, rollRmsDeg: 1.5,
               mogul: { lambda: 3.5, lambdaVar: 0.15, zAmp: 4.5, pitchAmpDeg: 6, pitchLagRad: 0.8, rollAmpDeg: 3 } },
  },
  styleVib: { carve: 1.0, short: 1.33, straight: 0.3 }, // Supej 2018: short swing 12.9 vs carve 9.7 vs straight 2.6 m/s²
  rotBand: [0.5, 4], // random trunk rotation band (INFERENCE: below spine resonance)
};

// sum-of-sines band-limited noise, unit RMS, log-spaced frequencies in [f0,f1], spectral weight w(f)
function multisine(rng, f0, f1, n, w = () => 1) {
  const m = []; let p = 0;
  for (let i = 0; i < n; i++) { const f = f0 * Math.pow(f1 / f0, (i + rng()) / n); const a = Math.sqrt(w(f) * f); m.push([2 * Math.PI * f, a, 2 * Math.PI * rng()]); p += a * a / 2; }
  const s = 1 / Math.sqrt(p || 1); for (const c of m) c[1] *= s;
  return (t) => { let y = 0; for (const [om, a, ph] of m) y += a * Math.sin(om * t + ph); return y; };
}

// Build a trunk-motion function bound to one simulated skier `sk` (from simulateSkier).
// opts: { terrain: 'groomed'|'icy'|'moguls', moguls: [t0,t1] (time span on moguls), seed }
export function makeTrunk(sk, opts = {}) {
  const P = { ...TRUNK_PARAMS, ...(opts.params || {}) };
  const style = sk.opts.style in P ? sk.opts.style : 'carve';
  const S = P[style];
  const T = P.terrain[opts.terrain || 'groomed'];
  const span = opts.moguls || (opts.terrain === 'moguls' ? [0, Infinity] : null);
  const rng = mulberry32(opts.seed ?? 17);
  const D = Math.PI / 180;
  // vertical chatter: acceleration PSD flat-ish in band with a roll-off (ASSUMED shape within the cited band)
  const bump = (fc, q) => (f) => Math.exp(-Math.pow(Math.log(f / fc) / q, 2));
  const zB = multisine(rng, 2, 10, 24, bump(5.5, 0.5)), zC = multisine(rng, 10, 30, 24, bump(18, 0.35));
  const vib = P.styleVib[style] ?? 1;
  const pink = (f) => 1 / (f * f); // angle PSD ∝ f⁻² (INFERENCE: postural sway-like)
  const pN = multisine(rng, P.rotBand[0], P.rotBand[1], 16, pink), rN = multisine(rng, P.rotBand[0], P.rotBand[1], 16, pink), yN = multisine(rng, P.rotBand[0], P.rotBand[1], 16, pink);
  // mogul phase table (distance-based, bump spacing varies ±lambdaVar)
  const dt = sk.sampleDt, ph = new Float64Array(sk.n + 1);
  if (T.mogul) {
    let phase = 0, lam = T.mogul.lambda;
    for (let i = 0; i < sk.n; i++) {
      ph[i] = phase; const before = Math.floor(phase / (2 * Math.PI));
      phase += (2 * Math.PI * sk.col.v[i] * dt) / lam;
      if (Math.floor(phase / (2 * Math.PI)) !== before) lam = T.mogul.lambda * (1 - T.mogul.lambdaVar + 2 * T.mogul.lambdaVar * rng());
    }
    ph[sk.n] = phase;
  }
  // turn phase from the heading: the flexion–extension cycle repeats once per turn (2× the L–R cycle)
  return function trunkAt(t) {
    const s = skierAt(sk, t);
    if (s.fallen) return { pitch: 0, roll: 0, yaw: 0, zAcc: 0, s };
    const vScale = Math.min(1.6, Math.max(0, s.speed / 13)); // roughness grows ~linearly with speed (INFERENCE)
    const ampPsi = (sk.opts.turnAmpDeg || 30) * D;
    const u = Math.max(-1, Math.min(1, s.psi / ampPsi)); // ~sin(turn phase)
    // pitch: most flexed at edge change (u≈0), extended at apex (|u|≈1): cos(2·phase) ≈ 1 − 2u²
    let pitch = S.pitchTurnDeg * D * (1 - 2 * u * u) + T.pitchRmsDeg * D * pN(t) * vScale;
    const ang = Math.max(-S.angulationMaxDeg * D, Math.min(S.angulationMaxDeg * D, S.angulation * s.lean));
    let roll = ang + T.rollRmsDeg * D * rN(t) * vScale;
    let yaw = Math.max(-S.yawMaxDeg * D, Math.min(S.yawMaxDeg * D, -S.yawCounter * s.psi)) + 0.5 * T.rollRmsDeg * D * yN(t);
    let zAcc = vib * vScale * (T.zBodyRms * zB(t) + T.zChatRms * zC(t));
    if (T.mogul && span && t >= span[0] && t <= span[1]) {
      const f = Math.max(0, Math.min(sk.n, t / dt)), i = Math.floor(f), w = f - i;
      const phase = ph[i] * (1 - w) + ph[Math.min(sk.n, i + 1)] * w;
      const env = Math.min(1, (t - span[0]) / 0.5, (span[1] - t) / 0.5);
      zAcc += env * T.mogul.zAmp * Math.sin(phase);
      pitch += env * T.mogul.pitchAmpDeg * D * Math.sin(phase - T.mogul.pitchLagRad);
      roll += env * T.mogul.rollAmpDeg * D * Math.sin(0.5 * phase);
    }
    return { pitch, roll, yaw, zAcc, s };
  };
}

// Signature requested by the integrator: trunkAt(sk, t, opts) with a per-skier cache.
const cache = new WeakMap();
export function trunkAt(sk, t, opts = {}) {
  const key = JSON.stringify(opts);
  let m = cache.get(sk); if (!m) { m = new Map(); cache.set(sk, m); }
  let f = m.get(key); if (!f) { f = makeTrunk(sk, opts); m.set(key, f); }
  const { pitch, roll, yaw, zAcc } = f(t);
  return { pitch, roll, yaw, zAcc };
}
