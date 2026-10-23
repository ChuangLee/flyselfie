// EXP-1: ride start / stop / fall detection from a back-worn pack.
// H1: "start detection < 1.0 s (p90) with < 1 false launch per ski day; no missed starts".
// Ski runs from the project skier model (simulateRun + FULLRUN_PLAN and style presets); non-ski activities
// from synthetic generators (lib/traces.mjs). Run: node exp1_startstop.mjs [days]
import { writeFileSync } from 'node:fs';
import { skiTrace, ACTIVITIES, lazyStartTrace } from './lib/traces.mjs';
import { runDetector, score } from './lib/detect.mjs';
import { mulberry32 } from '../../../sim/js/model/util.js';
import { pct } from '../../../sim/js/concepts/common/fullrun.js';

const DAYS = +(process.argv[2] || 60);
const VARIANTS = {
  full: {},                                   // IMU + GNSS + baro
  noBaro: { useBaro: false },
  imuOnly: { useGnss: false },                // IMU + baro, no GNSS
  imuOnlyNoBaro: { useGnss: false, useBaro: false },
  noLockout: { lockoutM: 0 },
  fastStart: { tOn: 0.15, vOn: 1.6, chatOn: 0.2 },
};

function skiSet() {
  const out = [];
  const presets = ['recreationalCarve', 'expertCarve', 'shortTurns', 'moguls'];
  for (let s = 1; s <= 12; s++) for (const pr of presets) {
    const plan = [{ ride: 38, preset: pr }, { hold: 20 }, { ride: 33, preset: pr }, { hold: 10 }];
    out.push({ id: `${pr}_s${s}`, tr: skiTrace({ seed: s, plan }) });
  }
  for (let s = 1; s <= 12; s++) out.push({ id: `fall_s${s}`, tr: skiTrace({ seed: 100 + s, fall: { seg: s % 2 === 0 ? 0 : 2, at: 8 + (s * 1.7) % 20 } }) });
  return out;
}

function agg(list) {
  const r = { runs: list.length, startLat: [], stopLat: [], fallLat: [], missedStart: 0, falseStart: 0, missedStop: 0, falseStop: 0, missedFall: 0, falseFall: 0 };
  for (const s of list) for (const k of Object.keys(r)) if (Array.isArray(r[k])) r[k].push(...s[k]); else if (k !== 'runs') r[k] += s[k];
  const q = (a) => ({ p50: +pct(a, 0.5)?.toFixed(3), p90: +pct(a, 0.9)?.toFixed(3), max: a.length ? +Math.max(...a).toFixed(3) : null, n: a.length });
  return { ...r, startLat: q(r.startLat), stopLat: q(r.stopLat), fallLat: q(r.fallLat) };
}

const ski = skiSet();
const lazy = Array.from({ length: 12 }, (_, k) => ({ id: `lazy${k}`, tr: lazyStartTrace(mulberry32(500 + k), { a: 0.6 + 0.08 * k }) }));
const results = { generated: new Date().toISOString().slice(0, 10), evidence: 'numerical, synthetic sensor + activity models; NOT physical verification', days: DAYS, variants: {} };

for (const [vn, p] of Object.entries(VARIANTS)) {
  const skiScores = ski.map((s, k) => score(s.tr, runDetector(s.tr, { seed: 7 + k, p }).ev));
  const lazyScores = lazy.map((s, k) => score(s.tr, runDetector(s.tr, { seed: 70 + k, p }).ev));
  const skiFalse = skiScores.reduce((a, s) => a + s.falseStart, 0);
  // ---- day simulation (non-ski activities): 15 laps, 70 % chair / 30 % surface lift, queue each lap,
  //      2 walks, 1 gondola, 3 cat tracks, 3 sit-downs; bus reported separately
  const rng = mulberry32(4242);
  const perAct = {}; let dayFalse = [];
  for (let d = 0; d < DAYS; d++) {
    let f = 0;
    const acts = [];
    for (let l = 0; l < 15; l++) { acts.push('queue'); acts.push(rng() < 0.7 ? 'chairlift' : 'surfaceLift'); }
    acts.push('walk', 'walk', 'gondola', 'catTrack', 'catTrack', 'catTrack', 'sitDown', 'sitDown', 'sitDown');
    for (const [k, a] of acts.entries()) {
      const tr = ACTIVITIES[a](mulberry32(d * 1000 + k + 1));
      const { ev } = runDetector(tr, { seed: d * 1000 + k + 3, p });
      const sc = score(tr, ev);
      perAct[tr.kind] ??= { n: 0, falseStart: 0, falseFall: 0, hours: 0 };
      perAct[tr.kind].n++; perAct[tr.kind].falseStart += sc.falseStart; perAct[tr.kind].falseFall += sc.falseFall; perAct[tr.kind].hours += tr.n * tr.dt / 3600;
      f += sc.falseStart;
    }
    dayFalse.push(f + (skiFalse / ski.length) * 15);
  }
  const bus = Array.from({ length: 30 }, (_, k) => { const tr = ACTIVITIES.busDown(mulberry32(9000 + k)); return score(tr, runDetector(tr, { seed: 9100 + k, p }).ev).falseStart; });
  results.variants[vn] = {
    params: p,
    ski: agg(skiScores), lazyStart: agg(lazyScores),
    falseLaunchPerDay: { mean: +(dayFalse.reduce((a, b) => a + b, 0) / DAYS).toFixed(3), p90: +pct(dayFalse, 0.9).toFixed(2), max: Math.max(...dayFalse) },
    perActivity: perAct,
    busDescentFalseStartsPerTrip: +(bus.reduce((a, b) => a + b, 0) / bus.length).toFixed(2),
  };
  const v = results.variants[vn];
  console.log(vn.padEnd(14), 'start p50/p90', v.ski.startLat.p50, v.ski.startLat.p90, 'missed', v.ski.missedStart, '| lazy p90', v.lazyStart.startLat.p90, 'missed', v.lazyStart.missedStart,
    '| stop p90', v.ski.stopLat.p90, 'missed', v.ski.missedStop, 'false', v.ski.falseStop, '| fall p90', v.ski.fallLat.p90, 'missed', v.ski.missedFall, 'false', v.ski.falseFall,
    '| false/day', v.falseLaunchPerDay.mean, 'bus', v.busDescentFalseStartsPerTrip);
  console.log('   per activity', JSON.stringify(Object.fromEntries(Object.entries(perAct).map(([k, a]) => [k, [a.falseStart, a.falseFall]]))));
}
writeFileSync(new URL('./out/exp1_startstop.json', import.meta.url), JSON.stringify(results, null, 1));
