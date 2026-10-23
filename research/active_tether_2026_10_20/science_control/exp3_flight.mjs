// EXP-3: closed-loop flight of an actively reeled tethered flyer over the 48-case full-run ensemble
// (FULLRUN_CASES_R4, FULLRUN_PLAN, project skier model). Launch from the back on detected starts, "fly it like a
// kite" reel law, retrieve + dock on detected stops. Variants test H3 (a tension loop alone vs. flyer control),
// estimator in the loop (tether-only vs. flyer air data vs. labelled oracle sensitivity), flyer type and motor.
// Usage: node exp3_flight.mjs --shard=i/n   (then: node exp3_flight.mjs --combine)
import { writeFileSync } from 'node:fs';
import { FULLRUN_CASES_R4 } from '../../../sim/js/concepts/common/fullrun.js';
import { runTether, LINE } from './lib/tether.mjs';
import { shardArg, skierFor, writeShard, readShards, q, r3 } from './lib/runner.mjs';

export const VARIANTS = {
  'G-A1': { flyer: 'glider', arch: 'A1', note: 'tension-only reel loop; flyer has no feedback (fixed bridle pitch + spoilers, open-loop launch pitch schedule)' },
  'G-A2-air': { flyer: 'glider', arch: 'A2', airdata: true, note: 'reel loop + flyer roll loop (no pitch/AoA loop)' },
  'G-A3-air': { flyer: 'glider', arch: 'A3', airdata: true, note: 'reel loop + flyer AoA/pitch, roll and spoiler loops; flyer pitot+vane+attitude' },
  'G-A3-tether': { flyer: 'glider', arch: 'A3', note: 'as G-A3-air but only tether/pack estimates (tension, exit angle, encoder, GNSS)' },
  'G-A3-oracle': { flyer: 'glider', arch: 'A3', est: 'oracle', note: 'LABELLED SENSITIVITY: controllers see true state' },
  'K-A1': { flyer: 'kite', arch: 'A1', note: 'kite, tension-only' },
  'K-A3-air': { flyer: 'kite', arch: 'A3', airdata: true, note: 'kite, full loops + air data' },
  'K-A3-oracle': { flyer: 'kite', arch: 'A3', est: 'oracle', note: 'LABELLED SENSITIVITY: kite, controllers see true state' },
  'G-A3-air-M0': { flyer: 'glider', arch: 'A3', airdata: true, motor: 'M0', note: 'lighter geared drone motor, 3S' },
  'G-A3-air-M2': { flyer: 'glider', arch: 'A3', airdata: true, motor: 'M2', note: '6S, larger drum (faster, weaker)' },
  'G-A1-inflight': { flyer: 'glider', arch: 'A1', launchL: 12, note: 'tension-only, started already at 12 m (launch excluded)' },
  'G-A3-air-inflight': { flyer: 'glider', arch: 'A3', airdata: true, launchL: 12, note: 'full loops, started at 12 m (launch excluded)' },
  'G-A3-air-predock': { flyer: 'glider', arch: 'A3', airdata: true, preDock: 6, note: 'dock while still riding: user gesture 6 s before the stop' },
  'K-A3-air-predock': { flyer: 'kite', arch: 'A3', airdata: true, preDock: 6, note: 'kite, dock while still riding' },
};

const DIST = [1, 2, 3, 5, 8];
function lineProfile(acc) {
  return ({ mode, p, P0, Lp, Tc, riding, A, sk }) => {
    if (!riding || !p || mode === 'STOWED' || mode === 'DOCKED') return;
    acc.n++;
    const ch = [p[0] - P0[0], p[1] - P0[1], p[2] - P0[2]], hd = Math.hypot(ch[0], ch[1]);
    const vA = 12, wn = LINE.lambda * 9.81 + 0.5 * 1.0 * LINE.Cd * LINE.d * vA * vA; // ASSUMED drag at a typical 12 m/s
    for (const [k, d] of DIST.entries()) {
      let h = 9;
      if (hd > d) { const s = d / hd, sag = (wn * Lp * Lp * s * (1 - s)) / (2 * Math.max(0.3, Tc)); h = P0[2] + ch[2] * s - Math.min(sag, 3) + (P0[0] + ch[0] * s) * sk.tanS; }
      else h = p[2] + p[0] * sk.tanS; // flyer itself is within d (horizontally): its height counts
      if (h < 1.9) acc.low[k]++;
    }
  };
}

function summarise(vname, c, r) {
  const m = r.met, ke = m.keS || [0];
  return {
    variant: vname, case: c.id, U: c.U, dir: c.dir,
    avail: r3(m.availS / Math.max(1e-6, m.ridingS)), crashes: m.crashes, launches: m.launches, refusedS: r3(m.refusedS),
    keMax: r3(m.keMax), keP99: r3(q(ke, 0.99)), keAt: m.keAt, bodyF: r3(m.bodyF), Tmax: r3(m.Tmax),
    minHead: r3(m.minHead), minHeadLine: r3(m.minHeadLine), docks: m.docks, dockFail: m.dockFail, preDocks: m.preDocks || 0,
    slackS: r3(m.slackS), stallS: r3(m.stallS), powerZoneS: r3(m.powerZoneS), snowS: r3(m.snowS || 0), flyS: r3(m.flyS),
    energyWh: r3(m.energyJ / 3600), regenWh: r3(m.regenJ / 3600), peakW: r3(m.peakW), vReel: m.vReel.map(r3), satS: r3(m.satS),
    heightP50: r3(q(m.height, 0.5)), elevP50: r3(q(m.elev, 0.5)), clothes3low: r3(m.lowLine3S),
    lineLow: m._prof ? Object.fromEntries(DIST.map((d, k) => [d, r3(m._prof.low[k] / Math.max(1, m._prof.n))])) : null,
    endMode: m.endMode,
  };
}

const [si, sn] = shardArg();
if (process.argv.includes('--combine')) {
  const rows = readShards('exp3');
  const out = { generated: new Date().toISOString().slice(0, 10), evidence: 'numerical, uncalibrated point-mass tethered-flyer model on the project skier model; NOT physical verification (M-070 not_run, G-MATURE closed)', variants: {}, rows };
  for (const [vn, v] of Object.entries(VARIANTS)) {
    const R = rows.filter((x) => x.variant === vn);
    if (!R.length) continue;
    const docks = R.flatMap((x) => x.docks || []);
    const tail = R.filter((x) => x.dir === 'tail');
    out.variants[vn] = {
      note: v.note, n: R.length,
      availMean: r3(R.reduce((a, x) => a + x.avail, 0) / R.length), availP10: r3(q(R.map((x) => x.avail), 0.1)), availTailMean: r3(tail.reduce((a, x) => a + x.avail, 0) / Math.max(1, tail.length)),
      crashRunsShare: r3(R.filter((x) => x.crashes > 0).length / R.length), crashesMean: r3(R.reduce((a, x) => a + x.crashes, 0) / R.length),
      keMaxP50: r3(q(R.map((x) => x.keMax), 0.5)), keMaxP90: r3(q(R.map((x) => x.keMax), 0.9)), keMaxMax: r3(Math.max(...R.map((x) => x.keMax))), keOver14_9Share: r3(R.filter((x) => x.keMax > 14.9).length / R.length),
      keP99P50: r3(q(R.map((x) => x.keP99), 0.5)),
      bodyFP50: r3(q(R.map((x) => x.bodyF), 0.5)), bodyFMax: r3(Math.max(...R.map((x) => x.bodyF))), bodyFOver40Share: r3(R.filter((x) => x.bodyF > 40).length / R.length),
      minHeadP10: r3(q(R.map((x) => x.minHead), 0.1)), minHeadLineP10: r3(q(R.map((x) => x.minHeadLine), 0.1)),
      docks: docks.length, dockVrelP50: r3(q(docks.map((d) => d.vrel), 0.5)), dockVrelP90: r3(q(docks.map((d) => d.vrel), 0.9)), dockUnder1_5Share: r3(docks.filter((d) => d.vrel < 1.5).length / Math.max(1, docks.length)),
      retrieveP50: r3(q(docks.map((d) => d.tRet), 0.5)), retrieveP90: r3(q(docks.map((d) => d.tRet), 0.9)), dockFails: R.reduce((a, x) => a + x.dockFail, 0),
      stallSMean: r3(R.reduce((a, x) => a + x.stallS, 0) / R.length), powerZoneSMean: r3(R.reduce((a, x) => a + x.powerZoneS, 0) / R.length), snowSMean: r3(R.reduce((a, x) => a + x.snowS, 0) / R.length),
      energyWhPerRunP50: r3(q(R.map((x) => x.energyWh), 0.5)), peakWP90: r3(q(R.map((x) => x.peakW), 0.9)), reelInMax: r3(Math.min(...R.map((x) => x.vReel[0]))), reelOutMax: r3(Math.max(...R.map((x) => x.vReel[1]))), satSMean: r3(R.reduce((a, x) => a + x.satS, 0) / R.length),
      heightP50: r3(q(R.map((x) => x.heightP50), 0.5)), elevP50: r3(q(R.map((x) => x.elevP50), 0.5)),
      lineLowShare: Object.fromEntries(DIST.map((d) => [d, r3(q(R.map((x) => (x.lineLow ? x.lineLow[d] : null)), 0.5))])),
      refusedSMean: r3(R.reduce((a, x) => a + x.refusedS, 0) / R.length),
    };
    const s = out.variants[vn];
    console.log(vn.padEnd(18), 'avail', s.availMean, 'tail', s.availTailMean, 'crashRuns', s.crashRunsShare, 'KE p50/p90/max', s.keMaxP50, s.keMaxP90, s.keMaxMax, 'bodyF p50/max', s.bodyFP50, s.bodyFMax, 'dock vrel p50/p90', s.dockVrelP50, s.dockVrelP90, 'ret p50/p90', s.retrieveP50, s.retrieveP90, 'Wh', s.energyWhPerRunP50, 'peakW', s.peakWP90, 'reel', s.reelInMax, s.reelOutMax, 'h', s.heightP50, 'elev', s.elevP50);
  }
  writeFileSync(new URL('./out/exp3_flight.json', import.meta.url), JSON.stringify(out, null, 1));
} else {
  const only = process.argv.find((x) => x.startsWith('--only='))?.slice(7).split(',');
  const jobs = [];
  for (const [vn, v] of Object.entries(VARIANTS)) if (!only || only.includes(vn)) for (const c of FULLRUN_CASES_R4) jobs.push([vn, v, c]);
  const rows = [];
  jobs.forEach(([vn, v, c], k) => {
    if (k % sn !== si) return;
    const { sk, ev } = skierFor(c.seed);
    const prof = { n: 0, low: DIST.map(() => 0) };
    const r = runTether({ sk, case: c, events: ev, ...v, extra: lineProfile(prof) });
    r.met._prof = prof;
    rows.push(summarise(vn, c, r));
    if (rows.length % 10 === 0) console.error(`shard ${si}: ${rows.length} done`);
  });
  writeShard('exp3', si, sn, rows);
}
