// Motion traces for start/stop/fall detection (SIM-032 controls study).
// A trace is the true kinematics of the back-worn sensor pack at 50 Hz plus labels:
//   { kind, dt, n, t, vx, vy, vz (world m/s), vib (10–50 Hz trunk vibration rms, m/s²),
//     tilt (trunk tilt from vertical, deg), impact (extra peak |a| in the sample, m/s²),
//     label (0 = not riding, 1 = riding, 2 = ambiguous: flat skating), ev: { starts, stops, falls } }
// Ski runs come from the project's skier model (simulateRun / FULLRUN_PLAN). All other activities are
// synthetic kinematic generators with literature-typical speeds (sources in ACTIVITY_SRC) and ASSUMED
// vibration/impact levels. Detection numbers inherit these assumptions — a labelled field log is required.
import { simulateRun, FULLRUN_PLAN } from '../../../../sim/js/concepts/common/fullrun.js';
import { skierAt } from '../../../../sim/js/concepts/common/skier.js';
import { mulberry32, gaussian } from '../../../../sim/js/model/util.js';

export const DT = 0.02;
export const VIB = {
  kSnow: 0.13,   // trunk vibration rms per m/s on groomed snow (≈1.6 m/s² ≈ 0.16 g at 12 m/s) ASSUMED
  floorBody: 0.05, // standing / body sway rms ASSUMED
  note: 'ASSUMED: trunk-level ski vibration ≈0.1–0.3 g rms while carving; no ski-trunk vibration dataset cited',
};

export const ACTIVITY_SRC = {
  chairFixed: { v: [2.0, 2.5], src: 'https://en.wikipedia.org/wiki/Chairlift (fixed-grip ≈2.3 m/s, detachable up to 6 m/s)' },
  chairDetach: { v: [4.5, 6.0], src: 'https://en.wikipedia.org/wiki/Chairlift' },
  surface: { v: [2.5, 4.0], src: 'https://en.wikipedia.org/wiki/Surface_lift (T-bar / platter, ASSUMED range)' },
  gondola: { v: [5.0, 6.0], src: 'https://en.wikipedia.org/wiki/Gondola_lift' },
  walkBoots: { v: [0.9, 1.4], src: 'ASSUMED (ski-boot walking, step 1.6–1.9 Hz)' },
};

function alloc(n) { const o = {}; for (const k of ['t', 'vx', 'vy', 'vz', 'vib', 'tilt', 'impact', 'label']) o[k] = new Float64Array(n); return o; }

// ---------- ski run from the project skier model
export function skiTrace({ seed = 1, plan = FULLRUN_PLAN, skier = {}, fall = null } = {}) {
  const pl = fall ? plan.map((p, k) => (k === fall.seg ? { ...p, skier: { ...(p.skier || {}), fallAt: fall.at } } : p)) : plan;
  const sk = simulateRun({ plan: pl, seed, skier });
  const n = Math.floor(sk.duration / DT);
  const o = alloc(n);
  const rng = mulberry32(seed * 977 + 5);
  const starts = sk.rides.map((r) => r.t0), stops = [], falls = [];
  sk.rides.forEach((r, k) => { const segPlan = pl.filter((p) => p.ride != null)[k]; if (pl[pl.indexOf(segPlan) + 1]?.hold != null) stops.push(r.t1); });
  let fallT = null;
  if (fall) { let acc = 0; for (let k = 0; k < pl.length; k++) { if (k === fall.seg) { fallT = acc + fall.at; break; } acc += pl[k].ride != null ? pl[k].ride + (pl[k + 1]?.hold != null ? 1.6 : 0) : pl[k].hold; } falls.push(fallT); }
  let tiltF = 0;
  for (let i = 0; i < n; i++) {
    const t = i * DT, s = skierAt(sk, t);
    o.t[i] = t; o.vx[i] = s.vel[0]; o.vy[i] = s.vel[1]; o.vz[i] = s.vel[2];
    o.vib[i] = s.speed > 0.3 ? Math.hypot(VIB.kSnow * s.speed, VIB.floorBody) : VIB.floorBody;
    let tilt = Math.abs(s.lean) * 0.6 * 57.3 + 25 * s.crouch; // trunk inclines less than the CoM line; crouch pitches forward (ASSUMED)
    if (s.fallen) { tiltF = Math.min(1, tiltF + DT / 0.4); tilt = tilt * (1 - tiltF) + 80 * tiltF; }
    o.tilt[i] = tilt;
    o.label[i] = sk.col.riding[Math.min(sk.n - 1, Math.round(t / sk.sampleDt))] ? 1 : 0;
    if (s.fallen) o.label[i] = 1; // still moving, flyer must abort
    // pole plants: small spikes
    o.impact[i] = 4 * Math.max(s.plantL, s.plantR) * (rng() < 0.5 ? 1 : 0.6);
  }
  if (fallT != null) { const i0 = Math.round(fallT / DT) + 10; for (let k = 0; k < 3; k++) if (i0 + k < n) o.impact[i0 + k] = 30 + 25 * rng(); }
  return { kind: 'ski', dt: DT, n, ...o, ev: { starts, stops, falls }, sk };
}

// ---------- synthetic activity builder: piecewise speed profile v(t), slope (vz = grade·v), heading wander
function build(kind, segs, rng, extra = {}) {
  const total = segs.reduce((a, s) => a + s.dur, 0), n = Math.floor(total / DT);
  const o = alloc(n);
  let i = 0, v = segs[0].v0 ?? 0, hd = rng() * 6.283;
  for (const s of segs) {
    const m = Math.floor(s.dur / DT);
    for (let j = 0; j < m && i < n; j++, i++) {
      const tl = j * DT, t = i * DT;
      const vt = typeof s.v === 'function' ? s.v(tl) : s.v;
      v += (vt - v) * Math.min(1, DT / (s.tau ?? 0.8));
      hd += (s.turn ?? 0.02) * gaussian(rng) * DT * 3;
      const vh = v / Math.sqrt(1 + (s.grade ?? 0) ** 2);
      o.t[i] = t; o.vx[i] = vh * Math.cos(hd); o.vy[i] = vh * Math.sin(hd); o.vz[i] = (s.grade ?? 0) * vh;
      if (s.bob) { // walking: vertical bob and fore-aft surge at step frequency
        const ph = 2 * Math.PI * s.bob.f * t;
        o.vz[i] += s.bob.a / (2 * Math.PI * s.bob.f) * Math.sin(ph);
        o.vx[i] += 0.15 * Math.cos(hd) * Math.sin(2 * ph); o.vy[i] += 0.15 * Math.sin(hd) * Math.sin(2 * ph);
      }
      o.vib[i] = Math.hypot(VIB.floorBody, (s.vibK ?? 0) * v, typeof s.vibAdd === 'function' ? s.vibAdd(tl) : (s.vibAdd ?? 0));
      o.tilt[i] = (s.tilt ?? 5) + 2 * gaussian(rng);
      o.label[i] = s.label ?? 0;
      o.impact[i] = s.impact ? s.impact(tl, rng) : 0;
    }
  }
  return { kind, dt: DT, n: i, ...o, ev: { starts: [], stops: [], falls: [] }, ...extra };
}
const U = (rng, a, b) => a + (b - a) * rng();

export const ACTIVITIES = {
  queue(rng) { // lift queue: shuffles of 0.5–2 m by skating/poling, otherwise standing
    const segs = []; let T = U(rng, 60, 240);
    while (T > 0) { const st = U(rng, 4, 20); segs.push({ dur: st, v: 0, tau: 0.3, vibK: 0.05, tilt: 15 }); const mv = U(rng, 1, 3); segs.push({ dur: mv, v: U(rng, 0.5, 1.4), tau: 0.4, vibK: 0.1, tilt: 20, grade: U(rng, -0.05, 0.03), impact: (tl) => (Math.abs((tl % 0.8) - 0.1) < 0.02 ? 6 : 0) }); T -= st + mv; }
    return build('queue', segs, rng);
  },
  chairlift(rng, { detach = rng() < 0.5, unloadRamp = true } = {}) {
    const vL = detach ? U(rng, 4.5, 6) : U(rng, 2.0, 2.5), dur = U(rng, 240, 480), grade = U(rng, 0.25, 0.45);
    const tower = U(rng, 50, 90);
    const segs = [
      { dur: U(rng, 3, 8), v: 1.0, tau: 0.5, vibK: 0.1, tilt: 15 },                 // move to the loading line
      { dur: 2, v: detach ? 1.1 : vL, tau: 0.25, vibK: 0.15, impact: (tl) => (tl < 0.06 ? 15 : 0), tilt: 30 }, // chair scoops the rider
      { dur: dur, v: (tl) => (detach && tl < 8 ? 1.1 + (vL - 1.1) * Math.min(1, tl / 8) : vL), tau: 1, grade, vibK: 0, tilt: 30,
        vibAdd: (tl) => ((tl % tower) < 1.2 ? U(rng, 0.5, 1.5) : 0.02), impact: (tl) => ((tl % tower) < 0.05 ? 8 : 0) }, // tower sheaves
    ];
    if (unloadRamp) segs.push({ dur: U(rng, 3, 5), v: U(rng, 3, 5), tau: 0.8, grade: -U(rng, 0.15, 0.25), vibK: VIB.kSnow, tilt: 20, impact: (tl) => (tl < 0.06 ? 10 : 0) },
      { dur: U(rng, 3, 10), v: 0, tau: 0.6, vibK: 0.05, tilt: 10 }); // stop beside the lift to regroup
    return build('chairlift', segs, rng, { liftEnd: segs.slice(0, 3).reduce((a, s) => a + s.dur, 0) });
  },
  surfaceLift(rng) { // T-bar / platter: on snow, chatter, ascending
    const v = U(rng, 2.5, 4), grade = U(rng, 0.2, 0.4);
    return build('surfaceLift', [
      { dur: U(rng, 2, 5), v: 0.5, tau: 0.5, vibK: 0.1, tilt: 15 },
      { dur: U(rng, 150, 420), v, tau: 1.2, grade, vibK: VIB.kSnow * 1.1, tilt: 10, turn: 0.05, impact: (tl, r) => (r() < 0.002 ? 12 : 0) },
      { dur: U(rng, 2, 4), v: 1.5, tau: 0.5, grade: 0.05, vibK: VIB.kSnow, tilt: 15 }, // exit track
      { dur: U(rng, 3, 10), v: 0, tau: 0.6, vibK: 0.05, tilt: 10 },
    ], rng);
  },
  walk(rng) { // ski boots, sometimes stairs down
    const segs = []; let T = U(rng, 60, 600);
    while (T > 0) { const d = U(rng, 10, 60), stairs = rng() < 0.2; segs.push({ dur: d, v: U(rng, 0.9, 1.4), tau: 0.6, grade: stairs ? -U(rng, 0.4, 0.7) : U(rng, -0.08, 0.08), bob: { f: U(rng, 1.6, 1.9), a: U(rng, 2, 4) }, vibAdd: 0.6, tilt: 8, turn: 0.2, impact: (tl) => ((tl * 1.75) % 1 < 0.04 ? 12 : 0) }); segs.push({ dur: U(rng, 2, 20), v: 0, tau: 0.4, tilt: 8 }); T -= d; }
    return build('walk', segs, rng);
  },
  gondola(rng, { down = rng() < 0.5 } = {}) { // in the cabin, skis in the rack; descent possible (download)
    const v = U(rng, 5, 6), grade = (down ? -1 : 1) * U(rng, 0.25, 0.45), tower = U(rng, 60, 120);
    return build(down ? 'gondolaDown' : 'gondolaUp', [
      { dur: U(rng, 5, 15), v: 0.3, tau: 0.5, tilt: 5 },
      { dur: U(rng, 300, 600), v: (tl) => Math.min(v, 0.3 + tl * 0.6), tau: 1, grade, tilt: 5, vibAdd: (tl) => ((tl % tower) < 1.5 ? U(rng, 0.4, 1.2) : 0.03), impact: (tl) => ((tl % tower) < 0.05 ? 6 : 0) },
      { dur: U(rng, 5, 15), v: 0, tau: 2, tilt: 5 },
    ], rng);
  },
  catTrack(rng) { // flat skating — ambiguous (label 2): launching is allowed but not required
    return build('catTrack', [
      { dur: U(rng, 20, 90), v: U(rng, 2.5, 5), tau: 1.5, grade: -U(rng, 0, 0.04), vibK: VIB.kSnow, tilt: 25, turn: 0.1, label: 2, impact: (tl) => ((tl % 1.2) < 0.04 ? 8 : 0) },
      { dur: 5, v: 0, tau: 0.6, tilt: 10 },
    ], rng);
  },
  busDown(rng) { // shuttle bus / car descending a mountain road (product forgotten on)
    return build('busDown', [{ dur: U(rng, 300, 900), v: (tl) => 8 + 6 * Math.sin(tl / 20) ** 2, tau: 3, grade: -U(rng, 0.05, 0.1), vibAdd: U(rng, 0.3, 0.8), tilt: 10, turn: 0.4 }], rng);
  },
  sitDown(rng) { // sits on the snow to adjust bindings — tilt without speed
    return build('sitDown', [{ dur: 3, v: 0, tilt: 10 }, { dur: U(rng, 10, 40), v: 0, tilt: 70, impact: (tl) => (tl < 0.05 ? 15 : 0) }, { dur: 5, v: 0, tilt: 10 }], rng);
  },
};

// gentle start variant: no push-off, glide away on a shallow slope (latency sensitivity)
export function lazyStartTrace(rng, { a = 0.9 } = {}) {
  const segs = [{ dur: 5, v: 0, tau: 0.3, tilt: 10 }, { dur: 25, v: (tl) => Math.min(10, a * tl), tau: 0.15, grade: -0.15, vibK: VIB.kSnow, tilt: 25, label: 1 }];
  const tr = build('lazyStart', segs, rng);
  tr.ev.starts = [5];
  return tr;
}
