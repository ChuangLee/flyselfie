// parallel runner: node par.mjs <jobs.json> <out.json>; jobs = [{tag, id, over, caseObj?}]
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
if (!isMainThread) {
  const { diag } = await import('./diag.mjs'); const { FULLRUN_CASES_R4 } = await import('../sim/js/concepts/common/fullrun.js');
  const D = await import('../sim/js/concepts/activetether/design.js'); const AN = await import('../sim/js/concepts/activetether/analysis.js');
  const T = { SENS: D.SENS, CAMERA: D.CAMERA, CAM_OFF: AN.CAM_OFF }; const ORIG = JSON.parse(JSON.stringify(T));
  const patch = (pt) => { for (const g of Object.keys(T)) { for (const k of Object.keys(ORIG[g])) { if (typeof ORIG[g][k] === 'object') Object.assign(T[g][k], ORIG[g][k]); else T[g][k] = ORIG[g][k]; } }
    for (const [g, v] of Object.entries(pt || {})) for (const [k, x] of Object.entries(v)) { if (typeof x === 'object') Object.assign(T[g][k], x); else T[g][k] = x; } };
  parentPort.on('message', ({ k, job }) => { patch(job.patch); let r; try { r = diag(job.id, job.over || {}, { fs: job.fs !== false, caseObj: job.caseObj || (job.skier ? { ...FULLRUN_CASES_R4.find((c) => c.id === job.id), skier: job.skier } : null) }); delete r.R; } catch (e) { r = { error: String(e.stack || e) }; } parentPort.postMessage({ k, r: { tag: job.tag, over: job.over, ...r } }); });
} else {
  const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8')); const out = new Array(jobs.length); let next = 0, done = 0; const t0 = Date.now();
  await new Promise((res) => { const ws = Array.from({ length: Math.min(4, jobs.length) }, () => new Worker(fileURLToPath(import.meta.url)));
    const feed = (w) => { if (next < jobs.length) { const k = next++; w.postMessage({ k, job: jobs[k] }); } };
    for (const w of ws) { w.on('message', ({ k, r }) => { out[k] = r; done++; if (done === jobs.length) { ws.forEach((x) => x.terminate()); res(); } else feed(w); }); feed(w); } });
  writeFileSync(process.argv[3], JSON.stringify(out, null, 1)); console.log('done', jobs.length, (Date.now() - t0) / 1000, 's');
}
