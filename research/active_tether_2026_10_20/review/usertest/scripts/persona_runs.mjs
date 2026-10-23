// User-tester panel scripted scenarios for AT-1 (heuristic usability review; numerical-uncalibrated sim, NOT a user test).
// Runs on a scratchpad copy of sim/ (no project files modified).
import { writeFileSync } from 'node:fs';
import AT, { prepare, buildResult, PARAMS } from './sim/js/concepts/activetether/index.js';
import { simulateRun } from './sim/js/concepts/common/fullrun.js';
import { simulateSkier, skierAt } from './sim/js/concepts/common/skier.js';
import { MODE, MODE_NAME, AIRBORNE } from './sim/js/concepts/activetether/model.js';
import { runDetector, VIB } from './sim/js/concepts/activetether/detect.js';
import { mulberry32, gaussian } from './sim/js/model/util.js';

const P0 = Object.fromEntries(PARAMS.map((p) => [p.id, p.v]));
const SDT = 0.02;
const pct = (a, q) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(q * (v.length - 1) + 0.5))] : null; };
const r2 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 100) / 100);
const WINDS = { calm: [0, 0, 0], head3: [-3, 0, 0], tail3: [3, 0, 0], crossL3: [0, 3, 0], crossL6: [0, 6, 0] };

// run one plan with a wind; returns judged + UX timeline stats
function runPlan(plan, windKey, seed, { preDock = null, skier = {} } = {}) {
  const sk = simulateRun({ plan, seed, skier });
  const sc = { id: 'ut', rider: 'run' };
  const wind = { mean: WINDS[windKey], intensity: 0.15, seed };
  let pre = null;
  if (preDock) pre = sk.rides.slice(0, sk.stops.length).map((r) => r.t1 - preDock);
  const prep = { sk, input: { sk, wind, duration: sk.duration, seed: seed * 31 + 7, preDock: pre }, dur: sk.duration };
  const R = buildResult(P0, sc, prep);
  const J = R.judge, O = R.core.O, n = R.core.n;
  const riding = (i) => sk.col.riding[Math.min(sk.n - 1, Math.round((i * SDT) / sk.sampleDt))] > 0;
  const modeS = {}, modeRideS = {};
  let quiverOutRideS = 0, towedRideS = 0, readyRideS = 0, flownRideS = 0, rideS = 0, standS = 0, standBusyS = 0;
  for (let i = 0; i < n; i++) {
    const m = MODE_NAME[O.mode[i]], r = riding(i);
    modeS[m] = (modeS[m] || 0) + SDT;
    if (r) { rideS += SDT; modeRideS[m] = (modeRideS[m] || 0) + SDT; if (O.quiver[i] > 0.5) quiverOutRideS += SDT; if (O.mode[i] === MODE.RETRIEVE || O.mode[i] === MODE.LANDED) towedRideS += SDT; if (O.mode[i] === MODE.READY) readyRideS += SDT; if (O.mode[i] === MODE.FLY) flownRideS += SDT; }
    else { standS += SDT; if (O.mode[i] !== MODE.STOWED && O.mode[i] !== MODE.DOCKED) standBusyS += SDT; }
  }
  // per-stop: how long after each stop was the device still not docked (rider waiting if they want to leave locked)
  const perStop = sk.stops.map((st) => {
    const i0 = Math.round(st.t0 / SDT), i1 = Math.min(n - 1, Math.round(st.t1 / SDT));
    let lockT = null; for (let i = i0; i < n; i++) { if (O.mode[i] === MODE.DOCKED || O.mode[i] === MODE.STOWED) { lockT = i * SDT; break; } }
    const atRestart = MODE_NAME[O.mode[i1]];
    return { stopS: r2(st.t1 - st.t0), lockedAfterS: lockT == null ? null : r2(Math.max(0, lockT - st.t0)), modeAtRestart: atRestart };
  });
  const evs = R.core.events.filter((e) => e.severity !== 'info').map((e) => `${e.t}:${e.type}`);
  const allEv = R.core.events.map((e) => `${(+e.t).toFixed(1)}:${e.type}`);
  return {
    wind: windKey, seed, avail: r2(J.avail), pxMed: r2(J.pxMed), keMax: r2(J.keMax), headClear: r2(J.headClear), bodyForcePeak: r2(J.bodyForcePeak),
    launches: J.launches, launchFails: J.launchFails, rides: sk.rides.length, docks: J.docks, dockFirstTry: r2(J.dockFirstTry), dockTimes: J.dockTimes, manual: J.manual,
    thirdPartyS: r2(J.thirdPartyS), refuseS: r2(J.refuseS), crashes: J.crashes, cut: J.cut, broke: J.broke,
    rideS: r2(rideS), flownRideS: r2(flownRideS), readyQuiverOutRideS: r2(readyRideS), quiverOutRideS: r2(quiverOutRideS), towedOnSnowWhileRidingS: r2(towedRideS), standS: r2(standS), standDeviceBusyS: r2(standBusyS),
    perStop, warnings: evs, events: allEv.slice(0, 40), fallT: R.core.fallT,
  };
}

const out = { evidence: 'numerical-uncalibrated simulation on a scratchpad copy of sim/ (activetether@0.1.0); persona plans are user-tester ASSUMPTIONS; NOT a user test or physical test', runs: {} };
const seeds = [11, 12, 13];
const many = (name, plan, winds, opt = {}) => { out.runs[name] = { plan, rows: [] }; for (const w of winds) for (const s of seeds) out.runs[name].rows.push(runPlan(plan, w, s, opt)); };

// P1 beginner: snowplough/early parallel on a 10° green, 4–6 m/s, short rides and many stops (5–30 s)
const BEG = { style: 'short', slopeDeg: 10, vTarget: 5, v0: 5, turnPeriod: 3.2, turnAmpDeg: 35, mu: 0.07 };
const BEG7 = { ...BEG, vTarget: 7, v0: 7, slopeDeg: 12 };
many('P1_beginner_5ms', [{ ride: 25, skier: BEG }, { hold: 15 }, { ride: 20, skier: BEG }, { hold: 5 }, { ride: 30, skier: BEG }, { hold: 30 }], ['calm', 'head3', 'tail3']);
many('P1_beginner_7ms', [{ ride: 25, skier: BEG7 }, { hold: 15 }, { ride: 20, skier: BEG7 }, { hold: 5 }, { ride: 30, skier: BEG7 }, { hold: 30 }], ['calm', 'head3', 'tail3']);
// P2 carver: short stop (T05): 10 s and 5 s stops then go
many('T05_stop10_go', [{ ride: 38, preset: 'recreationalCarve' }, { hold: 10 }, { ride: 33, preset: 'recreationalCarve' }, { hold: 25 }], ['calm', 'head3', 'crossL3']);
many('T05_stop5_go', [{ ride: 38, preset: 'recreationalCarve' }, { hold: 5 }, { ride: 33, preset: 'recreationalCarve' }, { hold: 25 }], ['calm', 'head3', 'crossL3']);
// P3 expert: steeper/faster carving 15 m/s (KE)
const EXP = { style: 'carve', slopeDeg: 25, vTarget: 15, v0: 15, turnPeriod: 2.9, turnAmpDeg: 50 };
many('P3_expert_15ms', [{ ride: 40, skier: EXP }, { hold: 25 }], ['calm', 'head3', 'crossL6']);
// P4 family: slow 6 m/s carving with kids, frequent stops 5–20 s
const FAM = { style: 'carve', slopeDeg: 12, vTarget: 6.5, v0: 6.5, turnPeriod: 3.4, turnAmpDeg: 40 };
many('P4_family_6_5ms', [{ ride: 20, skier: FAM }, { hold: 8 }, { ride: 18, skier: FAM }, { hold: 20 }, { ride: 22, skier: FAM }, { hold: 6 }, { ride: 20, skier: FAM }, { hold: 25 }], ['calm', 'head3', 'crossL3']);
// P5 touring descent: 10 m/s wide turns, ridge crosswind 6 m/s
const TOUR = { style: 'carve', slopeDeg: 28, vTarget: 10, v0: 10, turnPeriod: 3.0, turnAmpDeg: 40, mu: 0.08 };
many('P5_tour_descent', [{ ride: 60, skier: TOUR }, { hold: 25 }], ['calm', 'crossL6', 'head3']);

// single-trajectory falls (T06 at 12 m/s, beginner fall at 4 m/s, expert at 15 m/s) via the concept scenario machinery
function fallCase(skOpt, tag) {
  const rows = [];
  for (const seed of [3, 5, 8]) {
    const sk = simulateSkier({ start: 'push', v0: 0, duration: 25, seed, fallAt: 14, ...skOpt });
    const prep = { sk, input: { sk, wind: { mean: [0, 2, 0], intensity: 0.15, seed }, duration: 24, seed: seed * 31 + 7 }, dur: 24 };
    const R = buildResult(P0, { id: 'fall', rider: 'fall' }, prep);
    const J = R.judge, f = R.core.fallT;
    const va = skierAt(sk, 14).speed;
    // post-fall window (fall .. fall+6 s, model valid)
    let minHC = 99, maxF = 0, maxKE = 0;
    for (let i = Math.round((f ?? 14) / SDT); i < Math.min(R.core.n, Math.round(((f ?? 14) + 6) / SDT)); i++) { minHC = Math.min(minHC, R.analysis.headClear[i] ?? 99); maxF = Math.max(maxF, R.analysis.Fbody[i] || 0); maxKE = Math.max(maxKE, R.analysis.ke[i] || 0); }
    rows.push({ seed, speedAtFall: r2(va), fallDetectedAt: f, detectLatencyS: f == null ? null : r2(f - 14), launched: J.launches, postFall6s: { minHeadClear: r2(minHC), maxBodyForce: r2(maxF), maxKE: r2(maxKE) }, run: { keMax: r2(J.keMax), headClear: r2(J.headClear), bodyForcePeak: r2(J.bodyForcePeak), cut: J.cut, broke: J.broke }, events: R.core.events.map((e) => `${(+e.t).toFixed(1)}:${e.type}`) });
  }
  out.runs[tag] = { rows };
}
fallCase({ ...BEG, vTarget: 5 }, 'T02_fall_beginner_5ms');
fallCase({ style: 'carve', vTarget: 12, v0: 12 }, 'T06_fall_12ms');
fallCase(EXP, 'P3_fall_15ms');

// ---------------- activity traces through the shipped detector (start = deploy + launch attempt if the wind gate opens)
function alloc(n) { const o = {}; for (const k of ['t', 'vx', 'vy', 'vz', 'vib', 'tilt', 'impact']) o[k] = new Float64Array(n); return o; }
const DT = 0.02;
function build(segs, rng) {
  const total = segs.reduce((a, s) => a + s.dur, 0), n = Math.floor(total / DT); const o = alloc(n);
  let i = 0, v = 0, hd = rng() * 6.283;
  for (const s of segs) { const m = Math.floor(s.dur / DT); for (let j = 0; j < m && i < n; j++, i++) { const tl = j * DT, t = i * DT; const vt = typeof s.v === 'function' ? s.v(tl) : s.v; v += (vt - v) * Math.min(1, DT / (s.tau ?? 0.8)); hd += (s.turn ?? 0.02) * gaussian(rng) * DT * 3; const vh = v / Math.sqrt(1 + (s.grade ?? 0) ** 2); o.t[i] = t; o.vx[i] = vh * Math.cos(hd); o.vy[i] = vh * Math.sin(hd); o.vz[i] = (s.grade ?? 0) * vh; if (s.bob) { const ph = 2 * Math.PI * s.bob.f * t; o.vz[i] += s.bob.a / (2 * Math.PI * s.bob.f) * Math.sin(ph); } o.vib[i] = Math.hypot(VIB.floorBody, (s.vibK ?? 0) * v, s.vibAdd ?? 0); o.tilt[i] = (s.tilt ?? 5) + 2 * gaussian(rng); o.impact[i] = s.impact ? s.impact(tl, rng) : 0; } }
  return { dt: DT, n: i, ...o };
}
const U = (r, a, b) => a + (b - a) * r();
const ACT = {
  // skinning uphill 0.8–1.2 m/s, grade 0.2–0.35, stride impacts, with kick turns (stop/turn)
  skinUp: (r) => { const segs = []; let T = 45 * 60; while (T > 0) { const d = U(r, 40, 120); segs.push({ dur: d, v: U(r, 0.8, 1.2), tau: 0.8, grade: U(r, 0.2, 0.35), vibK: 0.1, vibAdd: 0.3, tilt: 15, bob: { f: 0.9, a: 1.0 }, impact: (tl) => ((tl * 0.9) % 1 < 0.03 ? 6 : 0) }); segs.push({ dur: U(r, 3, 8), v: 0, tau: 0.5, tilt: 20 }); T -= d; } return build(segs, r); },
  // skinning a descending traverse / flat-out runout with skins on: glide 2–3.5 m/s downhill grade −0.08…−0.15
  skinDownTraverse: (r) => build([{ dur: 5, v: 0, tilt: 10 }, { dur: U(r, 30, 90), v: U(r, 2.0, 3.5), tau: 1.2, grade: -U(r, 0.08, 0.15), vibK: 0.13, vibAdd: 0.2, tilt: 20, impact: (tl) => ((tl * 0.9) % 1 < 0.03 ? 6 : 0) }, { dur: 5, v: 0, tilt: 10 }], r),
  // magic carpet: standing on a belt, 0.6–1 m/s, grade +0.15
  magicCarpet: (r) => build([{ dur: 5, v: 0.5, tilt: 10, vibK: 0.1 }, { dur: U(r, 40, 90), v: U(r, 0.6, 1.0), tau: 1, grade: 0.15, vibAdd: 0.15, tilt: 10 }, { dur: 5, v: 0, tilt: 10 }], r),
  // beginner traverse/sideslip on a green: 2.5–3.5 m/s, grade −0.15, in snowplough (drift that looks like a start)
  beginnerDrift: (r) => build([{ dur: 6, v: 0, tilt: 10 }, { dur: U(r, 8, 20), v: U(r, 2.5, 3.5), tau: 1.5, grade: -U(r, 0.12, 0.2), vibK: 0.13, tilt: 25 }, { dur: 6, v: 0, tilt: 10 }], r),
  // parent snowploughing slowly backwards/in front of a child holding a pole: 1.5–2.5 m/s, grade −0.15
  childGuide: (r) => build([{ dur: 6, v: 0, tilt: 10 }, { dur: U(r, 30, 90), v: U(r, 1.5, 2.5), tau: 1.5, grade: -0.15, vibK: 0.13, tilt: 30 }, { dur: 6, v: 0, tilt: 10 }], r),
  // cat-track with a gentle downhill 3–6 % at 5–7 m/s (schuss home)
  catTrackDown: (r) => build([{ dur: 6, v: 0, tilt: 10 }, { dur: U(r, 30, 90), v: U(r, 5, 7), tau: 2, grade: -U(r, 0.03, 0.06), vibK: 0.13, tilt: 25, impact: (tl) => ((tl % 1.2) < 0.04 ? 8 : 0) }, { dur: 5, v: 0, tilt: 10 }], r),
  // pack left on in a car / shuttle descending the access road
  carDown: (r) => build([{ dur: U(r, 300, 900), v: (tl) => 8 + 6 * Math.sin(tl / 20) ** 2, tau: 3, grade: -U(r, 0.05, 0.1), vibAdd: U(r, 0.3, 0.8), tilt: 10, turn: 0.4 }], r),
  // towed on a snowmobile / sled down to the valley (touring rescue or resort shuttle)
  sledTowDown: (r) => build([{ dur: U(r, 120, 300), v: U(r, 5, 9), tau: 2, grade: -U(r, 0.05, 0.15), vibK: 0.15, vibAdd: 0.3, tilt: 35 }], r),
};
const det = {};
for (const [k, f] of Object.entries(ACT)) {
  let starts = 0, withStart = 0; const N = k === 'skinUp' ? 10 : 40;
  for (let s = 0; s < N; s++) { const r = mulberry32(1000 + s * 7 + k.length); const tr = f(r); const d = runDetector(tr, { seed: 500 + s }); starts += d.ev.start.length; if (d.ev.start.length) withStart++; }
  det[k] = { traces: N, detectorStarts: starts, tracesWithStart: withStart };
}
out.detector = { note: 'shipped detector (sim/js/concepts/activetether/detect.js) on user-tester synthetic activity traces (ASSUMED kinematics); a detector start deploys the quiver; launch then needs the apparent-wind and straight-glide gates', ...det };

writeFileSync(new URL('./persona_runs.json', import.meta.url), JSON.stringify(out, null, 1));
// compact console summary
for (const [k, v] of Object.entries(out.runs)) {
  console.log('==', k);
  for (const r of v.rows) console.log(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([kk]) => !['events', 'plan'].includes(kk)))));
}
console.log(JSON.stringify(out.detector));
