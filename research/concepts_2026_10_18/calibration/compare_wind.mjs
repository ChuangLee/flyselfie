// Calibration check: statistics of the shared wind model makeWind() (sim/js/concepts/common/env.js).
// Output: calibration/wind_stats.json.  Run: node research/concepts_2026_10_18/calibration/compare_wind.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeWind } from '../../../sim/js/concepts/common/env.js';

const here = dirname(fileURLToPath(import.meta.url));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const movAvgMax = (a, n) => { let s = 0, best = -Infinity; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) best = Math.max(best, s / n); } return best; };

// Welch-free band power by direct DFT on a log grid (adequate for a sum of sinusoids)
function bandPower(x, dt, f0, f1) {
  const n = x.length, m = mean(x); let P = 0;
  for (let k = Math.ceil(f0 * n * dt); k <= Math.floor(f1 * n * dt); k++) {
    let re = 0, im = 0; const w = (2 * Math.PI * k) / n;
    for (let i = 0; i < n; i += 1) { re += (x[i] - m) * Math.cos(w * i); im += (x[i] - m) * Math.sin(w * i); }
    P += (2 * (re * re + im * im)) / (n * n);
  }
  return P;
}

function run({ U, I, Lu = 30, seed = 7, T = 600, dt = 0.05, moving = null }) {
  const w = makeWind({ mean: [U, 0, 0], intensity: I, Lu, seed });
  const u = [], v = [], ww = [], spd = [];
  for (let t = 0; t <= T; t += dt) {
    // moving: skier position (m) as function of t to test whether the field is advected (Taylor frozen turbulence)
    const p = moving ? moving(t) : [0, 0, 0];
    const o = w(t, p);
    u.push(o[0]); v.push(o[1]); ww.push(o[2]); spd.push(Math.hypot(o[0], o[1]));
  }
  const m = mean(spd);
  const g3 = movAvgMax(spd, Math.round(3 / dt)) / m;
  const g1 = movAvgMax(spd, Math.round(1 / dt)) / m;
  const sigU = std(u);
  // inertial-range PSD slope: least squares of log(band power / bandwidth) over octave bands 0.25–4 Hz
  // (Kolmogorov: −5/3 = −1.67). Mode spacing is ×1.28 so each octave holds 2–3 modes (coarse).
  const xs = [], ys = [], seg = u.slice(0, 4000);
  for (const f0 of [0.25, 0.5, 1, 2]) { xs.push(Math.log(f0 * 1.414)); ys.push(Math.log(bandPower(seg, dt, f0, 2 * f0) / f0)); }
  const mx = mean(xs), my = mean(ys);
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return {
    U, I, Lu, T, meanSpeed: +m.toFixed(2), Iu_realised: +(sigU / U).toFixed(3), sigV_over_sigU: +(std(v) / sigU).toFixed(2), sigW_over_sigU: +(std(ww) / sigU).toFixed(2),
    gust3s_factor: +g3.toFixed(2), gust1s_factor: +g1.toFixed(2), maxInstant_factor: +(Math.max(...spd) / m).toFixed(2),
    psdSlope_0p25to4Hz: +slope.toFixed(2), kolmogorov_expected: -1.67,
    fracPowerAbove1Hz: +(bandPower(u.slice(0, 4000), dt, 1, 9.9) / (sigU ** 2)).toFixed(3),
  };
}

const out = {
  note: 'Gust factors are 3 s / 1 s moving-average maxima over T divided by the T-mean (WMO convention uses a 10-min mean). The model clamps U to ≥2 m/s for σ, so calm runs still get σ=I·2 m/s.',
  calm_U1_I0p15: run({ U: 1, I: 0.15 }),
  default_U5_I0p15: run({ U: 5, I: 0.15 }),
  U5_I0p25: run({ U: 5, I: 0.25 }),
  U9_I0p2: run({ U: 9, I: 0.2 }),
  U9_I0p3: run({ U: 9, I: 0.3 }),
};
// advection test: a skier moving at 12 m/s against a 5 m/s headwind. Under Taylor's frozen-turbulence
// hypothesis the encountered frequency scales with the relative speed (17/5 = 3.4×), moving gust energy to
// higher frequency. The model's spatial term is a random wavenumber 0.01·φ rad/m (φ∈[0,2π)) per mode,
// independent of frequency, so the encountered spectrum stays almost the fixed-point spectrum.
function encountered(vs) {
  const a = makeWind({ mean: [-5, 0, 0], intensity: 0.2, seed: 3 });
  const x = []; const dt = 0.05;
  for (let t = 0; t < 200; t += dt) x.push(a(t, [vs * t, 0, 0])[0]);
  const tot = bandPower(x, dt, 0.005, 9.9);
  return +(bandPower(x, dt, 1, 9.9) / tot).toFixed(3);
}
out.advection_check = {
  fracPowerAbove1Hz_static: encountered(0), fracPowerAbove1Hz_moving12ms_into5msWind: encountered(12),
  taylor_expected_moving: 'for a -5/3 range the >1 Hz share should grow ~ (3.4)^(2/3)≈2.3× (inference, Taylor hypothesis)',
};
writeFileSync(join(here, 'wind_stats.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
