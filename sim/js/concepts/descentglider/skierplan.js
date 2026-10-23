// Composite rider trajectories for descentglider scenarios: the shared skier
// model has a single start and one stop/fall; runs with a mid-run stop and a
// restart (or a standing start at the top) are built by chaining simulateSkier
// segments, offset so position is continuous. Heading and posture are blended
// over 0.8 s at each join (the shared model starts a push facing the fall line).
import { simulateSkier } from '../common/skier.js';

const KEYS = ['t', 'x', 'y', 'z', 'psi', 'hx', 'hy', 'vx', 'vy', 'v', 'lat', 'lon', 'lean', 'crouch', 'plantL', 'plantR', 'fallen'];

// segs: [{ dur, opts }]; each opts goes to simulateSkier (slopeDeg/seed shared from base)
export function chainSkier(segs, base = {}) {
  const dtS = 0.02;
  const total = segs.reduce((a, s) => a + s.dur, 0);
  const n = Math.floor(total / dtS + 1e-9) + 1;
  const col = {}; for (const k of KEYS) col[k] = new Float64Array(n);
  let i = 0, x0 = 0, y0 = 0, tOff = 0, last = null, sk0 = null;
  const joins = [];
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si];
    const sk = simulateSkier({ ...base, ...sg.opts, duration: sg.dur + 0.1 });
    if (!sk0) sk0 = sk;
    const m = si === segs.length - 1 ? n - i : Math.round(sg.dur / dtS);
    for (let j = 0; j < m && i < n; j++, i++) {
      for (const k of KEYS) col[k][i] = sk.col[k][Math.min(sk.n - 1, j)];
      col.t[i] = i * dtS; col.x[i] += x0; col.y[i] += y0; col.z[i] = -col.x[i] * sk.tanS;
    }
    if (si > 0) joins.push(tOff);
    tOff += sg.dur; x0 = col.x[i - 1]; y0 = col.y[i - 1];
    last = sk;
  }
  // blend heading / posture across joins
  for (const tj of joins) {
    const i0 = Math.round(tj / dtS), w = Math.round(0.8 / dtS);
    if (i0 < 1) continue;
    const hx0 = col.hx[i0 - 1], hy0 = col.hy[i0 - 1], a0 = Math.atan2(hy0, hx0), c0 = col.crouch[i0 - 1];
    for (let j = 0; j < w && i0 + j < n; j++) {
      const u = j / w, s = u * u * (3 - 2 * u);
      let a1 = Math.atan2(col.hy[i0 + j], col.hx[i0 + j]); let d = a1 - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
      const a = a0 + d * s; col.hx[i0 + j] = Math.cos(a); col.hy[i0 + j] = Math.sin(a);
      col.crouch[i0 + j] = c0 + (col.crouch[i0 + j] - c0) * s;
    }
  }
  void last;
  return { opts: { ...sk0.opts }, tanS: sk0.tanS, n, sampleDt: dtS, duration: total, col, joins };
}

// stand at the top for tStand s (across the fall line), push off, ski, optional stops [{at, hold}], end stop at tEnd
export function runWithStops({ tStand = 0, stops = [], tEnd = null, total, carve = {}, base = {} }) {
  const segs = [];
  if (tStand > 0) segs.push({ dur: tStand, opts: { style: 'straight', start: 'moving', v0: 0, stopAt: 0 } });
  let t = tStand;
  const pushed = tStand > 0;
  const plan = [...stops];
  let first = true;
  while (t < total - 1e-6) {
    const st = plan.shift();
    const startOpts = first && !pushed ? { start: 'moving' } : { start: 'push' };
    first = false;
    if (st) {
      const dur = st.at - t + st.hold;
      segs.push({ dur, opts: { ...carve, ...startOpts, stopAt: st.at - t } });
      t += dur;
    } else {
      const dur = total - t;
      segs.push({ dur, opts: { ...carve, ...startOpts, stopAt: tEnd != null ? tEnd - t : null } });
      t = total;
    }
  }
  return chainSkier(segs, base);
}

// Pad a shared full run (common/fullrun.js simulateRun) with `pre` s standing at the top before the push-off
// (the hand throw happens in this window) and `post` s standing at the end (the end-of-run landing and pick-up
// happen there). Times of stops/rides are shifted by `pre`. Standing samples copy the first/last pose.
export function padRun(run, pre = 5, post = 20) {
  const dtS = run.sampleDt, a = Math.round(pre / dtS), b = Math.round(post / dtS);
  const n = run.n + a + b;
  const keys = Object.keys(run.col);
  const col = {};
  for (const k of keys) {
    const src = run.col[k], dst = new Float64Array(n);
    for (let i = 0; i < a; i++) dst[i] = src[0];
    dst.set(src, a);
    for (let i = a + run.n; i < n; i++) dst[i] = src[run.n - 1];
    col[k] = dst;
  }
  for (let i = 0; i < n; i++) col.t[i] = i * dtS;
  for (const k of ['v', 'vx', 'vy', 'lat', 'lon', 'lean', 'psi', 'plantL', 'plantR']) { for (let i = 0; i < a; i++) col[k][i] = 0; for (let i = a + run.n; i < n; i++) col[k][i] = 0; }
  for (let i = 0; i < a; i++) { col.crouch[i] = 0.12; if (col.riding) col.riding[i] = 0; }
  for (let i = a + run.n; i < n; i++) if (col.riding) col.riding[i] = 0;
  const sh = (r) => ({ t0: r.t0 + pre, t1: r.t1 + pre });
  const stops = (run.stops || []).map(sh);
  if (stops.length) stops[stops.length - 1].t1 += post;
  return { ...run, n, duration: run.duration + pre + post, col, stops, rides: (run.rides || []).map(sh), pre, post, opts: { ...run.opts, duration: run.duration + pre + post } };
}
