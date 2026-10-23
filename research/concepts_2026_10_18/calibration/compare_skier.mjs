// Calibration check: statistics of the shared skier model (sim/js/concepts/common/skier.js)
// for the styles/speeds used by the concept lab. Output: calibration/skier_stats.json.
// Run: node research/concepts_2026_10_18/calibration/compare_skier.mjs
// Read-only with respect to sim/ (imports only).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateSkier, skierAt } from '../../../sim/js/concepts/common/skier.js';

const here = dirname(fileURLToPath(import.meta.url));
const G = 9.81, R2D = 180 / Math.PI;

const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const rms = (a) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);

export function skierStats(opts, tSkip = 4) {
  const sk = simulateSkier(opts);
  const c = sk.col, dt = sk.sampleDt;
  const i0 = Math.round(tSkip / dt);
  const idx = []; for (let i = i0; i < sk.n; i++) if (!c.fallen[i]) idx.push(i);
  const v = idx.map((i) => c.v[i]);
  const lat = idx.map((i) => c.lat[i]);
  const lean = idx.map((i) => Math.abs(c.lean[i]) * R2D);
  const crouch = idx.map((i) => c.crouch[i]);
  const psi = idx.map((i) => c.psi[i] * R2D);
  // turns = sign changes of the heading (edge change ≈ zero heading crossing)
  const cross = [];
  for (let k = 1; k < idx.length; k++) if (Math.sign(psi[k]) !== Math.sign(psi[k - 1]) && psi[k] !== 0) cross.push(c.t[idx[k]]);
  const turnDur = []; for (let k = 1; k < cross.length; k++) turnDur.push(cross[k] - cross[k - 1]);
  // per-turn apex: max |lat| and radius v²/|lat| at the apex
  const apexLat = [], apexR = [], apexLean = [];
  for (let k = 1; k < cross.length; k++) {
    let best = -1, bi = -1;
    for (const i of idx) if (c.t[i] >= cross[k - 1] && c.t[i] < cross[k] && Math.abs(c.lat[i]) > best) { best = Math.abs(c.lat[i]); bi = i; }
    if (bi >= 0 && best > 0.2) { apexLat.push(best / G); apexR.push(c.v[bi] ** 2 / best); apexLean.push(Math.abs(c.lean[bi]) * R2D); }
  }
  // quasi-static resultant load factor on the skier (normal gravity + centripetal), in body weights
  const cosT = Math.cos((sk.opts.slopeDeg * Math.PI) / 180);
  const load = lat.map((a) => Math.hypot(G * cosT, a) / G);
  // posture rates: lean rate (roll of the whole body in the model) and crouch rate
  const leanRate = []; for (let k = 1; k < idx.length; k++) leanRate.push(Math.abs(c.lean[idx[k]] - c.lean[idx[k - 1]]) / dt * R2D);
  // spectral content of lean (dominant frequency) by DFT of lean signal
  const sig = idx.map((i) => c.lean[i]);
  let bestF = 0, bestP = 0;
  for (let f = 0.05; f <= 5; f += 0.01) { let re = 0, im = 0; sig.forEach((s, k) => { re += s * Math.cos(2 * Math.PI * f * k * dt); im += s * Math.sin(2 * Math.PI * f * k * dt); }); const P = re * re + im * im; if (P > bestP) { bestP = P; bestF = f; } }
  const s5 = skierAt(sk, 5);
  return {
    opts: { style: sk.opts.style, slopeDeg: sk.opts.slopeDeg, vTarget: sk.opts.vTarget, turnPeriod: sk.opts.turnPeriod, turnAmpDeg: sk.opts.turnAmpDeg, mu: sk.opts.mu, CdA: sk.opts.CdA, duration: sk.opts.duration },
    speed_ms: { mean: +mean(v).toFixed(2), p05: +q(v, 0.05).toFixed(2), p95: +q(v, 0.95).toFixed(2), kmh_mean: +(mean(v) * 3.6).toFixed(1) },
    turn_s: turnDur.length ? { mean: +mean(turnDur).toFixed(2), min: +Math.min(...turnDur).toFixed(2), max: +Math.max(...turnDur).toFixed(2), turnsPerS: +(1 / mean(turnDur)).toFixed(3), fullCycleHz: +(0.5 / mean(turnDur)).toFixed(3), n: turnDur.length } : null,
    headingAmp_deg: { p95abs: +q(psi.map(Math.abs), 0.95).toFixed(1) },
    apexLat_g: apexLat.length ? { mean: +mean(apexLat).toFixed(2), max: +Math.max(...apexLat).toFixed(2) } : null,
    apexRadius_m: apexR.length ? { mean: +mean(apexR).toFixed(1), min: +Math.min(...apexR).toFixed(1) } : null,
    apexLean_deg: apexLean.length ? { mean: +mean(apexLean).toFixed(1), max: +Math.max(...apexLean).toFixed(1) } : null,
    latRms_g: +(rms(lat) / G).toFixed(3),
    loadFactor_bw: { p95: +q(load, 0.95).toFixed(2), max: +Math.max(...load).toFixed(2) },
    leanRate_degps: { p95: +q(leanRate, 0.95).toFixed(1), max: +Math.max(...leanRate).toFixed(1) },
    leanDominantHz: +bestF.toFixed(2),
    crouch: { min: +Math.min(...crouch).toFixed(2), max: +Math.max(...crouch).toFixed(2) },
    sampleAt5s: { speed: +s5.speed.toFixed(2), lean_deg: +(s5.lean * R2D).toFixed(1), crouch: +s5.crouch.toFixed(2) },
    note: 'skierAt() has no trunk pitch/roll/yaw oscillation and no vertical snow excitation; lean is whole-body inclination atan(lat/g) with 0.12 s lag.',
  };
}

if (process.argv[1] && process.argv[1].endsWith("compare_skier.mjs")) main();
function main() {
const cases = {
  default_carve: {},
  short_default: { style: 'short' },
  boom_moguls_case: { duration: 20, vTarget: 9, v0: 9, turnPeriod: 3.4, turnAmpDeg: 20 },
  boom_demo_seg2: { start: 'push', vTarget: 12, turnPeriod: 4.0, turnAmpDeg: 30, duration: 24.6, seed: 3 },
  // proposed calibrated styles (see proposal.json skier.styles) for comparison
  proposed_recreational_carve: { style: 'carve', slopeDeg: 15, vTarget: 12, v0: 12, turnPeriod: 2.9, turnAmpDeg: 45 },
  proposed_expert_carve: { style: 'carve', slopeDeg: 20, vTarget: 13, v0: 13, turnPeriod: 2.9, turnAmpDeg: 50 },
  proposed_short: { style: 'short', slopeDeg: 15, vTarget: 8, v0: 8, turnPeriod: 2.3, turnAmpDeg: 40 },
  proposed_moguls: { style: 'short', slopeDeg: 24, vTarget: 4.5, v0: 5, turnPeriod: 2.3, turnAmpDeg: 30, mu: 0.08 },
  proposed_gs_racer: { style: 'carve', slopeDeg: 24, vTarget: 16.5, v0: 16, turnPeriod: 1.45, turnAmpDeg: 30, CdA: 0.35, mu: 0.03 },
};
const out = {};
for (const [k, o] of Object.entries(cases)) out[k] = skierStats({ duration: 40, ...o });
writeFileSync(join(here, 'skier_stats.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
}
