// Statistics of the proposed trunk/vertical model (trunk_model.mjs) and comparison with the concept
// assumptions (boom360: ±4° pitch in moguls at the bump rate; rough 1.2 m/s² hip RMS 1–30 Hz; moguls 0.5 g).
// Output: calibration/trunk_stats.json.  Run: node research/concepts_2026_10_18/calibration/compare_trunk.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateSkier } from '../../../sim/js/concepts/common/skier.js';
import { trunkAt } from './trunk_model.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const R2D = 180 / Math.PI;
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
// zero-phase 2nd-order Butterworth high-pass (same as criteria.js hp2)
function hp2(x, fc, dt) {
  const K = Math.tan(Math.PI * fc * dt), Q = Math.SQRT1_2, n = 1 / (1 + K / Q + K * K);
  const b0 = n, b1 = -2 * n, b2 = n, a1 = 2 * (K * K - 1) * n, a2 = (1 - K / Q + K * K) * n;
  const pass = (s) => { const y = new Float64Array(s.length); let x1 = s[0], x2 = s[0], y1 = 0, y2 = 0; for (let i = 0; i < s.length; i++) { const v = b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = s[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const f = pass(Float64Array.from(x)); f.reverse(); const r = pass(f); r.reverse(); return r;
}
function stats(skOpts, trunkOpts, T = 30, dt = 0.005) {
  const sk = simulateSkier({ duration: T + 1, sampleDt: 0.01, ...skOpts });
  const P = [], Rl = [], Y = [], Z = [];
  for (let t = 3; t < T; t += dt) { const o = trunkAt(sk, t, trunkOpts); P.push(o.pitch); Rl.push(o.roll); Y.push(o.yaw); Z.push(o.zAcc); }
  const rate = (a) => a.slice(1).map((x, i) => (x - a[i]) / dt);
  const hpRate = (a) => rms(Array.from(hp2(rate(a), 1, dt)).slice(200, -200)) * R2D;
  const pp = (a) => (Math.max(...a) - Math.min(...a)) * R2D;
  const pitchHP = hp2(P, 1, dt).slice(200, -200);
  return {
    pitch_pp_deg: +pp(P).toFixed(1), roll_pp_deg: +pp(Rl).toFixed(1), yaw_pp_deg: +pp(Y).toFixed(1),
    pitch_gt1Hz_rms_deg: +(rms(Array.from(pitchHP)) * R2D).toFixed(2),
    rate_gt1Hz_rms_degps: { pitch: +hpRate(P).toFixed(1), roll: +hpRate(Rl).toFixed(1), yaw: +hpRate(Y).toFixed(1) },
    zAcc_rms_ms2: +rms(Z).toFixed(2), zAcc_peak_ms2: +Math.max(...Z.map(Math.abs)).toFixed(1),
  };
}
const carve = { style: 'carve', slopeDeg: 15, vTarget: 12, v0: 12, turnPeriod: 2.9, turnAmpDeg: 45 };
const short = { style: 'short', slopeDeg: 15, vTarget: 8, v0: 8, turnPeriod: 2.3, turnAmpDeg: 40 };
const mog = { style: 'short', slopeDeg: 24, vTarget: 4.5, v0: 5, turnPeriod: 2.3, turnAmpDeg: 30, mu: 0.08 };
const out = {
  note: 'Proposed trunk model statistics (rad→deg). rate_gt1Hz is the >1 Hz trunk angular-rate RMS, the input a body-mounted camera mount/stabiliser must reject (cf. criteria jitterRms 3 °/s).',
  carve_groomed: stats(carve, { terrain: 'groomed' }),
  carve_icy: stats(carve, { terrain: 'icy' }),
  short_groomed: stats(short, { terrain: 'groomed' }),
  moguls: stats(mog, { terrain: 'moguls' }),
  boom360_assumption: {
    mogul_pitch: '±4° at bump rate v/λ = 9/5 = 1.8 Hz → peak rate 4·2π·1.8 = 45 °/s, >1 Hz rate RMS ≈ 32 °/s',
    rough: '1.2 m/s² (default) / 2.0 m/s² (mogul scenario) hip RMS 1–30 Hz, two axes',
    moguls_A: '0.5 g = 4.9 m/s² amplitude (scenario), 0.3 g in the demo',
  },
};
writeFileSync(join(here, 'trunk_stats.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
