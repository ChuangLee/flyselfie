// Shared full-run scenario for the concept lab (SIM-031, audit 2026-10-19 X-04).
// A realistic run instead of endless carving: push off at the top, ride, stop
// (rest / regroup), push off again, ride, stop at the lift approach. Judged over
// an ensemble of wind speeds, directions and turbulence seeds so setup time,
// availability and actions are not decided by one favourable seed.
//
// simulateRun() returns the same shape as simulateSkier() so skierAt(),
// bodyPoints() and everything downstream work unchanged; extra fields:
//   stops: [{ t0, t1 }]  standstill intervals (speed < 0.3 m/s after a stop)
//   rides: [{ t0, t1 }]  riding intervals (from push-off to the start of the stop)
//   col.riding: 1 while riding, 0 while standing
import { simulateSkier, SKIER_PRESETS, skierAt, bodyPoints } from './skier.js';

// default plan: 0–38 s ride, rest 20 s, 33 s ride, end stop 10 s (≈ 101 s)
export const FULLRUN_PLAN = [
  { ride: 38, preset: 'recreationalCarve' },
  { hold: 20 },
  { ride: 33, preset: 'recreationalCarve' },
  { hold: 10 },
];

// ensemble: calm + {3, 6, 9} m/s × {head, tail, cross-left, cross-right} × 3 seeds = 39 cases
// wind "from" directions in model coords: head = blowing up the fall line (mean −x), tail = +x
export const FULLRUN_CASES = (() => {
  const cases = [];
  for (const seed of [11, 12, 13]) cases.push({ id: `calm_s${seed}`, U: 0, dir: 'calm', mean: [0, 0, 0], seed });
  const dirs = { head: [-1, 0, 0], tail: [1, 0, 0], crossL: [0, 1, 0], crossR: [0, -1, 0] };
  for (const U of [3, 6, 9]) for (const [d, e] of Object.entries(dirs)) for (const seed of [11, 12, 13]) {
    cases.push({ id: `${d}${U}_s${seed}`, U, dir: d, mean: [e[0] * U, e[1] * U, 0], seed, intensity: U >= 6 ? 0.2 : 0.15 });
  }
  return cases;
})();

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function simulateRun({ plan = FULLRUN_PLAN, seed = 1, sampleDt = 0.02, skier = {} } = {}) {
  // build segments
  const segs = [];
  let first = true;
  for (let k = 0; k < plan.length; k++) {
    const p = plan[k];
    if (p.ride != null) {
      const nextHold = plan[k + 1] && plan[k + 1].hold != null;
      const preset = SKIER_PRESETS[p.preset] || {};
      const dur = p.ride + (nextHold ? 1.6 : 0); // the hockey stop completes inside the ride segment
      segs.push({ kind: 'ride', sk: simulateSkier({ ...preset, ...skier, ...(p.skier || {}), start: 'push', v0: 0, stopAt: nextHold ? p.ride - 0.4 : null, duration: dur, sampleDt, seed: seed + k }) });
      first = false;
    } else segs.push({ kind: 'hold', dur: p.hold });
  }
  const tanS = segs.find((s) => s.kind === 'ride').sk.tanS;
  const total = segs.reduce((a, s) => a + (s.kind === 'ride' ? s.sk.duration : s.dur), 0);
  const n = Math.floor(total / sampleDt) + 1;
  const keys = ['t', 'x', 'y', 'z', 'psi', 'hx', 'hy', 'vx', 'vy', 'v', 'lat', 'lon', 'lean', 'crouch', 'plantL', 'plantR', 'fallen', 'riding'];
  const col = {}; for (const k of keys) col[k] = new Float64Array(n);
  let i = 0, t0 = 0, ox = 0, oy = 0, last = null;
  const stops = [], rides = [];
  for (const s of segs) {
    if (s.kind === 'ride') {
      const c = s.sk.col;
      const h0 = last ? Math.atan2(last.hy, last.hx) : 0; // standing ski heading before push-off
      let stopT = null;
      for (let j = 0; j < s.sk.n && i < n; j++, i++) {
        const tl = c.t[j];
        col.t[i] = t0 + tl; col.x[i] = ox + c.x[j]; col.y[i] = oy + c.y[j]; col.z[i] = -col.x[i] * tanS;
        for (const k of ['psi', 'vx', 'vy', 'v', 'lat', 'lon', 'lean', 'crouch', 'plantL', 'plantR', 'fallen']) col[k][i] = c[k][j];
        // skis rotate from the stopped stance to the fall line during the first second of the push-off
        const w = last ? smooth(tl / 1.0) : 1, a1 = Math.atan2(c.hy[j], c.hx[j]);
        let da = a1 - h0; da = Math.atan2(Math.sin(da), Math.cos(da));
        const a = h0 + da * w; col.hx[i] = Math.cos(a); col.hy[i] = Math.sin(a);
        col.riding[i] = c.v[j] > 0.3 || tl < 2.5 ? 1 : 0;
        if (stopT == null && s.sk.opts.stopAt != null && tl > s.sk.opts.stopAt && c.v[j] < 0.3) stopT = t0 + tl;
      }
      const jl = s.sk.n - 1;
      rides.push({ t0, t1: s.sk.opts.stopAt != null ? t0 + s.sk.opts.stopAt : t0 + s.sk.duration });
      last = { x: ox + c.x[jl], y: oy + c.y[jl], hx: c.hx[jl], hy: c.hy[jl], crouch: c.crouch[jl], tStop: stopT ?? t0 + s.sk.duration };
      ox = last.x; oy = last.y; t0 += s.sk.duration;
    } else {
      const steps = Math.round(s.dur / sampleDt);
      for (let j = 0; j < steps && i < n; j++, i++) {
        col.t[i] = t0 + j * sampleDt; col.x[i] = last.x; col.y[i] = last.y; col.z[i] = -last.x * tanS;
        col.hx[i] = last.hx; col.hy[i] = last.hy; col.psi[i] = 0; col.v[i] = 0; col.vx[i] = col.vy[i] = 0;
        col.lat[i] = col.lon[i] = col.lean[i] = 0; col.crouch[i] = 0.12 + (last.crouch - 0.12) * Math.exp(-j * sampleDt / 0.3);
        col.plantL[i] = col.plantR[i] = 0; col.fallen[i] = 0; col.riding[i] = 0;
      }
      stops.push({ t0: last.tStop, t1: t0 + s.dur });
      t0 += s.dur;
    }
  }
  for (; i < n; i++) { for (const k of keys) col[k][i] = col[k][i - 1]; col.t[i] = i * sampleDt; }
  return { opts: { ...skier, plan, seed, sampleDt, duration: total, fullRun: true }, tanS, n, sampleDt, duration: total, col, stops, rides };
}

// ensemble summary helpers
export function pct(arr, p) {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  return a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
}

// ---- Judging rules for the full-run ensemble (re-audit 2026-10-20, audit2/cross/consistency.json) ----
// avail   : share of col.riding time (refused-launch / no-fly runs count 0) — use availMask(sk)
// jitter  : p90 over flown cases of footageStability(R).subjectRms (common/criteria.js), same for every concept
// ops     : judged on p90 (≤2); max is reported and discussed
// setup   : simulated standstill incl. any retrieval walk/ride; constants are not allowed
// gates   : any wind gate/interlock must use windEstimate() (no oracle wind)
export const availMask = (sk) => sk.col.riding || null;

// Onboard/worn wind estimate: 10 s trailing mean of the wind at the sensor position plus a seeded
// bias (±1 m/s per axis, ASSUMED for an airspeed/GNSS-derived or tag anemometer estimate) and 0.5 s lag.
export function windEstimate(wind, posAt, { seed = 1, window = 10, lag = 0.5, bias = 1 } = {}) {
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const b = [(rnd() * 2 - 1) * bias, (rnd() * 2 - 1) * bias, 0];
  return function est(t) {
    const t1 = Math.max(0, t - lag), t0 = Math.max(0, t1 - window), n = 20, o = [0, 0, 0];
    for (let k = 0; k < n; k++) { const tk = t0 + ((k + 0.5) / n) * (t1 - t0 || 1e-6); const w = wind(tk, posAt(tk)); o[0] += w[0] / n; o[1] += w[1] / n; o[2] += w[2] / n; }
    return [o[0] + b[0], o[1] + b[1], o[2] + b[2]];
  };
}

// ---- Round-4 rules (audit3 2026-10-20: A3-X-01..04) ----
// A3-X-02: the 39-case grid had no wind between 3 and 6 m/s, exactly where tail-wind gates sit.
// Round 4 judges on 48 cases: FULLRUN_CASES + tail 3.5 / 4.5 / 5.5 m/s × 3 seeds.
export const TAILBAND_CASES = (() => {
  const c = [];
  for (const U of [3.5, 4.5, 5.5]) for (const seed of [11, 12, 13]) c.push({ id: `tail${U}_s${seed}`, U, dir: 'tail', mean: [U, 0, 0], seed, intensity: U >= 6 ? 0.2 : 0.15 });
  return c;
})();
export const FULLRUN_CASES_R4 = [...FULLRUN_CASES, ...TAILBAND_CASES];

// A3-X-03: one helmet point for every concept (headClear criterion).
export const helmetAt = (sk, t) => bodyPoints(skierAt(sk, t)).head;

// A3-X-01: one artefact rule for every concept. A product part (line, boom, mast, prop…) counts as an
// artefact in a frame when its projection overlaps the subject's bounding box AND its apparent width in a
// 1080p-equivalent output is ≥ ARTEFACT_PX. Thinner lines are treated as removable in post. Counts against avail.
export const ARTEFACT_PX = 2;
export const artefactCounts = (overlapsSubject, widthPx) => !!overlapsSubject && widthPx >= ARTEFACT_PX;

// A3-X-04: avail and pxMed use footage().bodyPx (feet→head/shoulders, no ski tips) against the 300 px line.
// A3-X-08: actuators and estimators must be modelled with their own bandwidth/lag/torque/speed limits
// from the component table or a cited datasheet; idealised (zero-lag, unlimited) elements are not allowed
// in judged runs (they may appear only as labelled sensitivities).
