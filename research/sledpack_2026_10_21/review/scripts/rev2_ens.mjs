// SIM-034 (sledpack@0.2.0, I10) independent review runner. Runs the 48 FULLRUN_CASES_R4 cases on a COPY of sim/ and
// recomputes the user-revised head metrics independently from the per-sample analysis (A.headClear = helmetAt-based kite+line
// distance, capture ≤3 s excluded), with three variants of the episode definition:
//  ride      = as index.js (riding samples only; note: an episode is NOT closed by a non-riding gap)
//  rideSplit = riding samples only, episodes closed at every non-riding gap
//  all       = all samples incl. stops/parks (the user said "briefly … now and then", not "while riding")
// Usage: SIMROOT=/copy/sim node rev2_ens.mjs '<paramOverridesJSON>' label
// Numerical-uncalibrated simulation; NOT a physical test.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
const SIM = process.env.SIMROOT;
const idx = await import(pathToFileURL(`${SIM}/js/concepts/sledpack/index.js`).href);
const FR = await import(pathToFileURL(`${SIM}/js/concepts/common/fullrun.js`).href);
const P = Object.fromEntries(idx.default.params.map((p) => [p.id, p.v]));
const SDT = 0.02;
function evalCase(over, c) {
  const params = { ...P, ...over };
  const sc = { id: 'case', rider: 'run', caseObj: c, plan: idx.PLAN_R4 };
  const prep = idx.prepare(params, sc);
  const R = idx.buildResult(params, sc, prep);
  const A = R.analysis, O = R.core.O, J = R.judge, n = R.core.n, riding = FR.availMask(prep.sk);
  const rideAt = (i) => riding[Math.min(riding.length - 1, Math.round((i * SDT) / prep.sk.sampleDt))] > 0;
  const ep = (useRide, split) => { let cur = 0, mx = 0, cnt = 0, long = 0, near = 0, base = 0; const L = [];
    const close = () => { if (cur > 0) { mx = Math.max(mx, cur); cnt++; L.push(cur); if (cur > 2) long++; cur = 0; } };
    for (let i = 0; i < n; i++) { const r = rideAt(i); if (useRide && !r) { if (split) close(); continue; } base++;
      if (A.headClear[i] < 1.0) { near++; cur += SDT; } else close(); }
    close(); return { share: base ? (100 * near) / base : 0, epMax: mx, epN: cnt, epLong: long, nearS: near * SDT }; };
  // where the within-1 m time happens (mode names)
  const byMode = {}; for (let i = 0; i < n; i++) if (A.headClear[i] < 1.0) { const m = idx.default && O.mode[i]; byMode[m] = (byMode[m] || 0) + SDT; }
  const minLaunchFlyer = (() => { let v = 9; for (let i = 0; i < n; i++) if (O.mode[i] === 1 && Number.isFinite(A.headFlyer[i])) v = Math.min(v, A.headFlyer[i]); return v; })();
  return { id: c.id, dir: c.dir, U: c.U, avail: J.avail, keMax: J.keMax, headClear: J.headClear, headEpMax_index: J.headEpMax, headNearShare_index: J.headNearShare,
    ride: ep(true, false), rideSplit: ep(true, true), all: ep(false, false), nearByMode: byMode, minLaunchFlyer, clothes: J.clothesShare, parks: J.parks, groundLaunches: J.groundLaunches, launchSuccess: J.launchSuccess, bodyF: J.bodyForcePeak, pxMed: J.pxMed, setup: J.setupTime, endurance: J.endurance };
}
if (!isMainThread) {
  parentPort.on('message', ({ k, over, c }) => { let r; try { r = evalCase(over, c); } catch (e) { r = { id: c.id, error: String(e.stack || e) }; } parentPort.postMessage({ k, r }); });
} else {
  const over = JSON.parse(process.argv[2] || '{}'), label = process.argv[3] || 'run';
  const cs = FR.FULLRUN_CASES_R4, W = Array.from({ length: 4 }, () => new Worker(fileURLToPath(import.meta.url)));
  const out = new Array(cs.length); let next = 0, done = 0;
  await new Promise((res) => { const feed = (w) => { if (next < cs.length) { const k = next++; w.postMessage({ k, over, c: cs[k] }); } };
    for (const w of W) { w.on('message', ({ k, r }) => { out[k] = r; if (++done === cs.length) res(); else feed(w); }); feed(w); } });
  const e = out.find((r) => r.error); if (e) { console.error(e.error); process.exit(1); }
  const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))]; };
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, r3 = (x) => Math.round(x * 1000) / 1000;
  const S = (f) => { const a = out.map(f).filter(Number.isFinite); return { mean: r3(mean(a)), p50: r3(q(a, 0.5)), p90: r3(q(a, 0.9)), max: r3(Math.max(...a)), min: r3(Math.min(...a)) }; };
  const pass = (k) => out.filter((r) => r[k].epMax <= 2 && r[k].share <= 5).length;
  const modeTot = {}; for (const r of out) for (const [m, s] of Object.entries(r.nearByMode)) modeTot[m] = r3((modeTot[m] || 0) + s / out.length);
  const summary = { label, over, avail: S((r) => r.avail), keMax: S((r) => r.keMax), headClear: S((r) => r.headClear), bodyF: S((r) => r.bodyF), pxMed: S((r) => r.pxMed), setupP90: r3(q(out.map((r) => r.setup), 0.9)), endurance: S((r) => r.endurance), clothes: S((r) => r.clothes),
    index_check: { epMaxMatchesIndex: out.every((r) => Math.abs(r.ride.epMax - r.headEpMax_index) < 1e-6), shareMatchesIndex: out.every((r) => Math.abs(r.ride.share - r.headNearShare_index) < 1e-6) },
    ride: { share: S((r) => r.ride.share), epMax: S((r) => r.ride.epMax), casesPass: pass('ride') }, rideSplit: { share: S((r) => r.rideSplit.share), epMax: S((r) => r.rideSplit.epMax), casesPass: pass('rideSplit') },
    all: { share: S((r) => r.all.share), epMax: S((r) => r.all.epMax), epLongPerRun: S((r) => r.all.epLong), nearS: S((r) => r.all.nearS), casesPass: pass('all') },
    nearSecondsPerRunByMode: modeTot, minLaunchFlyer: S((r) => r.minLaunchFlyer), parks: S((r) => r.parks), groundLaunches: S((r) => r.groundLaunches), launchSuccess: S((r) => r.launchSuccess),
    failingCasesAll: out.filter((r) => !(r.all.epMax <= 2 && r.all.share <= 5)).map((r) => r.id) };
  console.log(JSON.stringify(summary));
  for (const w of W) w.terminate();
}
