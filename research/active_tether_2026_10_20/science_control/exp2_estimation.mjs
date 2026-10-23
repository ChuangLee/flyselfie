// EXP-2: flight-state estimation without true-state access (H2: "tension + line angle alone give the apparent
// wind to ±1 m/s"). The estimators run in SHADOW mode: the flyer is flown by the labelled-oracle controller so
// that every variant is scored on identical trajectories (48-case ensemble, flyer started at 12 m on the first
// detected ride start, then normal reel law / retrieve / relaunch). Errors are sampled every 20 ms in FLY.
// Usage: node exp2_estimation.mjs --shard=i/n ; node exp2_estimation.mjs --combine
import { writeFileSync } from 'node:fs';
import { FULLRUN_CASES_R4 } from '../../../sim/js/concepts/common/fullrun.js';
import { runTether } from './lib/tether.mjs';
import { shardArg, skierFor, writeShard, readShards, q, r3, absQ } from './lib/runner.mjs';

const VARIANTS = {
  tetherReal: { note: 'tension (HX711 + bar cell, ±5 % scale, 0.1 N bias), 2-axis exit angle (AS5600, ±0.7° bias), pack AHRS (1.5° tilt, 4° yaw), reel encoder (±3 % length), GNSS velocity, polar known to ±8 %' },
  tetherCal: { errOff: ['tscale', 'tbias', 'polar'], note: 'as tetherReal but load cell scale/bias and polar perfectly calibrated (best case)' },
  tetherCalImu: { errOff: ['tscale', 'tbias', 'polar'], flyerImu: true, note: 'tetherCal + flyer IMU specific force (removes the quasi-static assumption; 3° attitude error)' },
  perfectSensors: { noiseScale: 0, note: 'structural floor: all sensor errors zero; remaining error = model/quasi-static/sag/unknown roll disturbance' },
  airdata: { airdata: true, note: 'tetherReal + flyer pitot (σ 0.4 m/s) + AoA vane (σ 1.5°) + attitude (3° bias): W = v_flyer − v_air' },
};

const [si, sn] = shardArg();
if (process.argv.includes('--combine')) {
  const rows = readShards('exp2');
  const out = { generated: new Date().toISOString().slice(0, 10), evidence: 'numerical shadow-mode estimator test on the uncalibrated point-mass model; NOT physical verification', variants: {} };
  for (const [vn, v] of Object.entries(VARIANTS)) {
    const R = rows.filter((x) => x.variant === vn);
    if (!R.length) continue;
    const cat = (k) => R.flatMap((x) => x[k] || []);
    const eVa = cat('eVa'), eW = cat('eW'), eWair = cat('eWair'), ePos = cat('ePos'), eA = cat('eAlpha'), eLM = cat('eLM');
    const cm = R.reduce((a, x) => { for (const k of ['tp', 'fp', 'fn', 'tn']) a[k] += x.LMlow[k]; return a; }, { tp: 0, fp: 0, fn: 0, tn: 0 });
    const byDir = {};
    for (const d of ['calm', 'head', 'tail', 'crossL', 'crossR']) { const Rd = R.filter((x) => x.dir === d); byDir[d] = { eVaP50: r3(absQ(Rd.flatMap((x) => x.eVa), 0.5)), eWP50: r3(q(Rd.flatMap((x) => (vn === 'airdata' ? x.eWair : x.eW)), 0.5)) }; }
    out.variants[vn] = {
      note: v.note, samples: eVa.length,
      vaAbsErr: { p50: r3(absQ(eVa, 0.5)), p90: r3(absQ(eVa, 0.9)), p95: r3(absQ(eVa, 0.95)), within1: r3(eVa.filter((x) => Math.abs(x) <= 1).length / eVa.length), bias: r3(eVa.reduce((a, b) => a + b, 0) / eVa.length) },
      windHorizErr: { p50: r3(q(eW, 0.5)), p90: r3(q(eW, 0.9)), p95: r3(q(eW, 0.95)), within1: r3(eW.filter((x) => x <= 1).length / eW.length) },
      ...(eWair.length ? { windHorizErrAirdata: { p50: r3(q(eWair, 0.5)), p90: r3(q(eWair, 0.9)), p95: r3(q(eWair, 0.95)), within1: r3(eWair.filter((x) => x <= 1).length / eWair.length) } } : {}),
      flyerPosErr: { p50: r3(q(ePos, 0.5)), p95: r3(q(ePos, 0.95)) },
      aoaAbsErrDeg: { p50: r3(absQ(eA, 0.5)), p95: r3(absQ(eA, 0.95)) },
      liftMarginErr: { p50: r3(absQ(eLM, 0.5)), p95: r3(absQ(eLM, 0.95)) },
      lowLiftDetect: { ...cm, recall: r3(cm.tp / Math.max(1, cm.tp + cm.fn)), precision: r3(cm.tp / Math.max(1, cm.tp + cm.fp)) },
      byWindDir: byDir,
    };
    const s = out.variants[vn];
    console.log(vn.padEnd(15), '|va| err p50/p95', s.vaAbsErr.p50, s.vaAbsErr.p95, 'within1', s.vaAbsErr.within1, '| W err p50/p95', s.windHorizErr.p50, s.windHorizErr.p95, s.windHorizErrAirdata ? `| Wair p50/p95 ${s.windHorizErrAirdata.p50} ${s.windHorizErrAirdata.p95} within1 ${s.windHorizErrAirdata.within1}` : '', '| pos p50', s.flyerPosErr.p50, '| AoA p50', s.aoaAbsErrDeg.p50, '| LM<1.3 recall/prec', s.lowLiftDetect.recall, s.lowLiftDetect.precision);
  }
  writeFileSync(new URL('./out/exp2_estimation.json', import.meta.url), JSON.stringify(out, null, 1));
} else {
  const rows = [];
  let k = 0;
  for (const [vn, v] of Object.entries(VARIANTS)) for (const c of FULLRUN_CASES_R4) {
    if (k++ % sn !== si) continue;
    const { sk, ev } = skierFor(c.seed);
    const r = runTether({ sk, case: c, events: ev, flyer: 'glider', arch: 'A3', est: 'oracle', launchL: 12, ...v });
    const m = r.met, dec = (a) => (a || []).filter((_, i) => i % 5 === 0).map((x) => r3(x)); // 10 Hz subsample
    rows.push({ variant: vn, case: c.id, dir: c.dir, U: c.U, eVa: dec(m.eVa), eW: dec(m.eW), eWair: dec(m.eWair), ePos: dec(m.ePos), eAlpha: dec(m.eAlpha), eLM: dec(m.eLM), LMlow: m.LMlow });
  }
  writeShard('exp2', si, sn, rows);
}
