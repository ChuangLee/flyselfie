// SIM-033 independent review: re-run the 48-case FULLRUN_CASES_R4 ensemble on a PATCHED COPY of sim/ (never the repo sim/).
// Usage: SIMROOT=/path/to/copy/sim REV_JSON='{"camW":0.5}' node rev_ens.mjs '<paramOverridesJSON>' label
// REV_JSON switches (implemented by review/scripts/patch_copy.py in the copy): camG/camW (extra pod camera mass/power),
// tailMax (tailwind envelope gate, m/s, on the shared windEstimate), rawDrift (activetether-style raw OU drift),
// fitCheck (crop must fit the sensor around the pod's real optical axis), bundle (folded sail = 0.46 m bundle while collapsed),
// exitF/exitU (sleeve-mouth position). Numerical-uncalibrated simulation; NOT a physical test.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
const SIM = process.env.SIMROOT;
const idx = await import(pathToFileURL(`${SIM}/js/concepts/sledpack/index.js`).href);
const P = Object.fromEntries(idx.default.params.map((p) => [p.id, p.v]));
if (!isMainThread) {
  parentPort.on('message', ({ k, over, c, opt }) => {
    let r; try { r = idx.evaluateCase({ ...P, ...over }, c, opt || {}); } catch (e) { r = { id: c.id, error: String(e.stack || e) }; }
    delete r.events; parentPort.postMessage({ k, r });
  });
} else {
  const { FULLRUN_CASES_R4 } = await import(pathToFileURL(`${SIM}/js/concepts/common/fullrun.js`).href);
  const over = JSON.parse(process.argv[2] || '{}'), label = process.argv[3] || 'run';
  const opt = process.argv[4] ? JSON.parse(process.argv[4]) : {};
  const W = Array.from({ length: 4 }, () => new Worker(fileURLToPath(import.meta.url)));
  const cs = FULLRUN_CASES_R4; const out = new Array(cs.length); let next = 0, done = 0;
  await new Promise((res) => { const feed = (w) => { if (next < cs.length) { const k = next++; w.postMessage({ k, over, c: cs[k], opt }); } };
    for (const w of W) { w.on('message', ({ k, r }) => { out[k] = r; if (++done === cs.length) res(); else feed(w); }); feed(w); } });
  const err = out.find((r) => r.error); if (err) { console.error(err.error); process.exit(1); }
  const st = idx.ensembleStats(out).metrics;
  const J = { avail: ['mean', '>=', 80], pxMed: ['p50', '>=', 300], jitterRms: ['p90', '<=', 3], azRange: ['p50', '>=', 45], bodyForcePeak: ['max', '<=', 40], setupTime: ['p90', '<=', 30], ops: ['p90', '<=', 2], keMax: ['max', '<=', 14.9], headClear: ['min', '>=', 1], endurance: ['min', '>=', 45], addedMass: ['max', '<=', 1.5], packVol: ['max', '<=', 3] };
  const judged = Object.fromEntries(Object.entries(J).map(([k, [s, op, v]]) => { const x = st[k][s]; return [k, [Math.round(x * 1000) / 1000, op === '>=' ? x >= v : x <= v]]; }));
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const info = { headFlyerMin: r3(st.headFlyer.min), headFlyerP10: r3(st.headFlyer.p10), headLineMin: r3(st.headLine.min), headLineP10: r3(st.headLine.p10), keP90: r3(st.keMax.p90), launchSuccess: r3(st.launchSuccess.mean), dockFirst: r3(st.dockFirstTry.mean), ridesNoLaunch: r3(st.ridesNoLaunch.mean), caseLineLt05: out.filter((r) => r.headLine < 0.5).length, caseFlyerLt1: out.filter((r) => r.headFlyer < 1).length, worstKE: out.slice().sort((a, b) => b.keMax - a.keMax).slice(0, 3).map((r) => [r.id, r3(r.keMax), r.keAt]), worstHC: out.slice().sort((a, b) => a.headClear - b.headClear).slice(0, 3).map((r) => [r.id, r3(r.headClear), r.hcAt]), worstEnd: out.slice().sort((a, b) => a.endurance - b.endurance).slice(0, 2).map((r) => [r.id, r3(r.endurance), r3(r.meanW)]) };
  console.log(JSON.stringify({ label, over, rev: process.env.REV_JSON || '{}', judged, info }));
  for (const w of W) w.terminate();
}
