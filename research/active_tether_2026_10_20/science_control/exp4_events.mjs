// EXP-4: abnormal events — (a) skier fall while flying (abort policy: reel in vs. hold & let it land),
// (b) chairlift approach: time from the stop/slow-down until stowed vs. the time to the loading point,
// (c) third parties: low-flyer / low-line exposure around the skier (crossing skiers), from full closed-loop runs.
// Usage: node exp4_events.mjs [--part=fall|lift|people]
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { FULLRUN_CASES_R4 } from '../../../sim/js/concepts/common/fullrun.js';
import { runTether } from './lib/tether.mjs';
import { runDetector } from './lib/detect.mjs';
import { skierFor, q, r3 } from './lib/runner.mjs';
import { DT, VIB } from './lib/traces.mjs';

const part = process.argv.find((x) => x.startsWith('--part='))?.slice(7);
const outPath = new URL('./out/exp4_events.json', import.meta.url);
const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
out.generated = new Date().toISOString().slice(0, 10);
out.evidence = 'numerical, uncalibrated; synthetic fall and lift-approach kinematics; NOT physical verification';
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// ---------------------------------------------------------------- (a) fall abort
if (!part || part === 'fall') {
  const casesF = FULLRUN_CASES_R4.filter((c) => ['calm_s11', 'head6_s12', 'tail4.5_s13', 'crossL6_s11', 'crossR9_s12', 'tail6_s12'].includes(c.id));
  const res = [];
  for (const flyer of ['glider', 'kite']) for (const abort of ['reel', 'hold']) for (const [k, c] of casesF.entries()) for (const at of [18, 27]) {
    const seed = 40 + k;
    const { sk, ev } = skierFor(seed, { fall: { seg: 0, at } });
    const tf = ev.fall[0];
    if (tf == null) { res.push({ flyer, abort, case: c.id, detected: false }); continue; }
    const acc = { minHead: 9, minLine: 9, keMax: 0, hitFast: 0, bodyFmax: 0, safeT: null };
    const r = runTether({ sk, case: c, events: ev, flyer, arch: 'A3', airdata: true, abort, launchL: 12,
      extra: ({ t, mode, p, v, A, Tc }) => {
        if (t < tf || !p) return;
        const dH = len(sub(p, A.head)), vA = acc.prev ? sub(A.packTop, acc.prev).map((x) => x / 0.02) : [0, 0, 0]; acc.prev = A.packTop;
        const vg = len(v), vrel = len(sub(v, vA)), mF = flyer === 'glider' ? 0.15 : 0.10;
        // KE rule: ground frame beyond 1.5 m from the rider, rider frame within
        acc.minHead = Math.min(acc.minHead, dH); acc.keMax = Math.max(acc.keMax, 0.5 * mF * (dH > 1.5 ? vg * vg : vrel * vrel));
        if (dH < 0.5 && vrel > 3) acc.hitFast++;
        const vr = vrel;
        acc.bodyFmax = Math.max(acc.bodyFmax, Tc);
        if (acc.safeT == null && (mode === 'STOWED' || mode === 'DOCKED' || (mode === 'LANDED' && vr < 0.5))) acc.safeT = t - tf;
      } });
    res.push({ flyer, abort, case: c.id, fallAt: r3(tf), modeAtEnd: r.met.endMode, minFlyerHead: r3(acc.minHead), keMaxAfter: r3(acc.keMax), flyerHitsBodyFast: acc.hitFast > 0, lineTensionMaxAfter: r3(acc.bodyFmax), timeToSafe: r3(acc.safeT) });
  }
  const agg = {};
  for (const flyer of ['glider', 'kite']) for (const abort of ['reel', 'hold']) {
    const R = res.filter((x) => x.flyer === flyer && x.abort === abort && x.fallAt != null);
    agg[`${flyer}-${abort}`] = { n: R.length, minFlyerHeadP10: r3(q(R.map((x) => x.minFlyerHead), 0.1)), keMaxAfterP90: r3(q(R.map((x) => x.keMaxAfter), 0.9)), hitShare: r3(R.filter((x) => x.flyerHitsBodyFast).length / Math.max(1, R.length)), tensionAfterP90: r3(q(R.map((x) => x.lineTensionMaxAfter), 0.9)), timeToSafeP50: r3(q(R.map((x) => x.timeToSafe), 0.5)), timeToSafeP90: r3(q(R.map((x) => x.timeToSafe), 0.9)), neverSafe: R.filter((x) => x.timeToSafe == null).length };
    console.log('fall', flyer, abort, JSON.stringify(agg[`${flyer}-${abort}`]));
  }
  out.fall = { note: 'fall at 18 or 27 s into the first ride (skier model fallAt: sliding decel, trunk tilt 80°); flyer started at 12 m; abort=reel: fast retrieve to the back; abort=hold: hold the line, flag out (CL→0, spoilers) and let the flyer settle on the snow, then reel in along the snow', agg, runs: res };
}

// ---------------------------------------------------------------- (b) chairlift approach
if (!part || part === 'lift') {
  // gentle approach (snow-plough, no hockey stop): 12 → 1.2 m/s at −a, then skating 1 m/s on the flat lift corral
  const res = [];
  for (const decel of [0.8, 1.2, 2.0]) for (let s = 0; s < 10; s++) {
    const T = 60, n = Math.round(T / DT), tr = { kind: 'liftApproach', dt: DT, n, ev: { starts: [], stops: [], falls: [] } };
    for (const k of ['t', 'vx', 'vy', 'vz', 'vib', 'tilt', 'impact', 'label']) tr[k] = new Float64Array(n);
    const t0 = 20 + s; // slow-down starts after t0 s of riding
    let tSlow = null;
    for (let i = 0; i < n; i++) {
      const t = i * DT, v = t < t0 ? 12 : Math.max(1.0, 12 - decel * (t - t0)), grade = t < t0 ? -0.27 : Math.max(-0.27 + 0.03 * (t - t0), -0.02);
      if (tSlow == null && v <= 1.5) tSlow = t;
      tr.t[i] = t; tr.vx[i] = v; tr.vz[i] = grade * v; tr.vib[i] = Math.hypot(VIB.kSnow * v, VIB.floorBody); tr.tilt[i] = 25; tr.label[i] = v > 1.6 ? 1 : 0;
    }
    tr.ev.starts = [0.5]; tr.ev.stops = [tSlow];
    for (let i = 0; i < 25; i++) tr.label[i] = 0;
    const { ev } = runDetector(tr, { seed: 300 + s });
    const tStopDet = ev.stop.find((t) => t > t0) ?? null;
    res.push({ decel, slowStart: t0, reach1_5: r3(tSlow), stopDetected: r3(tStopDet), detLatencyFromSlowStart: r3(tStopDet != null ? tStopDet - t0 : null), detLatencyFrom1_5: r3(tStopDet != null ? tStopDet - tSlow : null) });
  }
  const e3 = existsSync(new URL('./out/exp3_flight.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('./out/exp3_flight.json', import.meta.url), 'utf8')) : null;
  const ret = e3 ? Object.fromEntries(['G-A3-air', 'K-A3-air', 'G-A3-air-predock'].map((v) => [v, e3.variants[v] ? { p50: e3.variants[v].retrieveP50, p90: e3.variants[v].retrieveP90 } : null])) : null;
  const det = res.map((x) => x.detLatencyFrom1_5).filter((x) => x != null);
  out.lift = {
    note: 'Time budget: from slowing to ≤1.5 m/s in the lift corral to the loading point is ASSUMED 10–20 s (queue-free lift). Stowed time = stop-detection latency + retrieve/dock time (exp3).',
    approach: res, detLatencyFrom1_5P90: r3(q(det, 0.9)), retrieveTimes: ret,
    stowedAfter1_5P90: ret && ret['G-A3-air'] ? r3(q(det, 0.9) + ret['G-A3-air'].p90) : null,
    stowedAfter1_5P90_kite: ret && ret['K-A3-air'] ? r3(q(det, 0.9) + ret['K-A3-air'].p90) : null,
  };
  console.log('lift', JSON.stringify({ det90: out.lift.detLatencyFrom1_5P90, ret, stowed: out.lift.stowedAfter1_5P90, stowedKite: out.lift.stowedAfter1_5P90_kite }));
}

// ---------------------------------------------------------------- (c) third parties around the skier
if (!part || part === 'people') {
  const res = [];
  for (const flyer of ['glider', 'kite']) for (const c of FULLRUN_CASES_R4.filter((_, i) => i % 3 === 0)) {
    const { sk, ev } = skierFor(c.seed);
    const acc = { air: 0, lowNear: 0, lowFar: 0, n: 0 };
    runTether({ sk, case: c, events: ev, flyer, arch: 'A3', airdata: true,
      extra: ({ mode, p, P0, sk: s }) => {
        if (!p || mode === 'STOWED' || mode === 'DOCKED') return;
        acc.n++;
        const hSnow = p[2] + p[0] * s.tanS, dh = Math.hypot(p[0] - P0[0], p[1] - P0[1]);
        if (hSnow < 2.0 && dh > 1.5 && dh < 15) acc.lowNear++; // flyer at head height of a passer-by, 1.5–15 m away
        if (hSnow < 2.0 && dh >= 15) acc.lowFar++;
      } });
    res.push({ flyer, case: c.id, airborneS: r3(acc.n * 0.02), flyerAtHeadHeightNearS: r3(acc.lowNear * 0.02), flyerAtHeadHeightFarS: r3(acc.lowFar * 0.02) });
  }
  const agg = {};
  for (const flyer of ['glider', 'kite']) {
    const R = res.filter((x) => x.flyer === flyer);
    agg[flyer] = { runs: R.length, flyerAtHeadHeightNearShareOfAirborne: r3(R.reduce((a, x) => a + x.flyerAtHeadHeightNearS, 0) / R.reduce((a, x) => a + x.airborneS, 0)), perRunS_P50: r3(q(R.map((x) => x.flyerAtHeadHeightNearS), 0.5)), perRunS_P90: r3(q(R.map((x) => x.flyerAtHeadHeightNearS), 0.9)) };
  }
  out.people = { note: 'share of airborne time the flyer is below 2.0 m above the snow and 1.5–15 m horizontally from the skier (where a crossing skier could be struck); line-height exposure at 1–8 m behind is in exp3 lineLowShare', agg, runs: res };
  console.log('people', JSON.stringify(agg));
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
