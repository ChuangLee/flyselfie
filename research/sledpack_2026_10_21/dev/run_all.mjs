// SIM-033 — sledpack: judged 48-case ensemble (FULLRUN_CASES_R4), design iterations, sensitivities, expert riders.
// Writes results.json / sensitivity.json / iterations.json and regenerates sim/js/concepts/sledpack/ensemble.js.
// Numerical-uncalibrated simulation output — NOT a physical test.
// Usage: node research/sledpack_2026_10_21/dev/run_all.mjs [quick|ensOnly|iter|sens]
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept, { evaluateCase, ensembleStats } from '../../../sim/js/concepts/sledpack/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const strip = (r) => JSON.parse(JSON.stringify(r, (k, v) => (typeof v === 'number' ? (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null) : v)));

if (!isMainThread) {
  parentPort.on('message', ({ k, over, c, opt }) => {
    let r;
    try { r = evaluateCase({ ...P, ...over }, c, opt || {}); } catch (e) { r = { id: c.id, error: String((e && e.stack) || e) }; }
    parentPort.postMessage({ k, r: strip(r) });
  });
} else {
  const arg = process.argv[2] || 'all';
  const { FULLRUN_CASES_R4, FULLRUN_PLAN } = await import('../../../sim/js/concepts/common/fullrun.js');
  const D = await import('../../../sim/js/concepts/sledpack/design.js');
  const root = join(here, '../../..');
  const NW = 4, workers = Array.from({ length: NW }, () => new Worker(fileURLToPath(import.meta.url)));
  const runMany = (jobs) => new Promise((res) => {
    const out = new Array(jobs.length); let next = 0, done = 0;
    if (!jobs.length) return res(out);
    const feed = (w) => { if (next < jobs.length) { const k = next++; w.postMessage({ k, over: jobs[k].over || {}, c: jobs[k].c, opt: jobs[k].opt }); } };
    for (const w of workers) { w.removeAllListeners('message'); w.on('message', ({ k, r }) => { out[k] = r; done++; if (done === jobs.length) res(out); else feed(w); }); feed(w); }
  });
  const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'headClear', 'endurance'];
  const JUDGE = { avail: ['mean', '>=', 80], pxMed: ['p50', '>=', 300], jitterRms: ['p90', '<=', 3], azRange: ['p50', '>=', 45], addedMass: ['max', '<=', 1.5], bodyForcePeak: ['max', '<=', 40], handsBusy: ['max', '<=', 5], setupTime: ['p90', '<=', 30], ops: ['p90', '<=', 2], keMax: ['max', '<=', 14.9], packVol: ['max', '<=', 3], headClear: ['min', '>=', 1.0], endurance: ['min', '>=', 45] };
  const judged = (st) => Object.fromEntries(STD.map((k) => { const [s, op, v] = JUDGE[k], x = st.metrics[k]?.[s]; return [k, { stat: s, value: x ?? null, pass: x == null ? null : op === '>=' ? x >= v : x <= v, criterion: `${op}${v}` }]; }));
  const info = (st) => { const m = st.metrics; const g = (k, s) => m[k]?.[s] ?? null; return { headFlyerMin: g('headFlyer', 'min'), headFlyerP10: g('headFlyer', 'p10'), headLineMin: g('headLine', 'min'), headLineP50: g('headLine', 'p50'), clothesShareMean: g('clothesShare', 'mean'), clothesShareMax: g('clothesShare', 'max'), thirdPartySmean: g('thirdPartyS', 'mean'), dockFirstTryMean: g('dockFirstTry', 'mean'), dockTimeP90: m.dockTime?.p90 ?? null, launchTimeP50: m.launchTime?.p50 ?? null, launchTimeP90: m.launchTime?.p90 ?? null, launchSuccessMean: g('launchSuccess', 'mean'), collapseShareMean: g('collapseShare', 'mean'), collapsesMean: g('collapses', 'mean'), TmaxMax: g('Tmax', 'max'), tensionMedP50: g('tensionMed', 'p50'), elevMedP50: g('elevMed', 'p50'), keP90: g('keMax', 'p90'), manualMean: g('manual', 'mean'), refuseWindSmean: g('refuseWindS', 'mean'), refuseTailSmean: g('refuseTailS', 'mean'), parksMean: g('parks', 'mean'), groundLaunchesMean: g('groundLaunches', 'mean'), parkedEndMean: g('parkedEnd', 'mean'), azWanderP50: g('azWander', 'p50'), flagOutsMean: g('flagOuts', 'mean'), twRetrievesMean: g('twRetrieves', 'mean'), artShareMean: g('artShare', 'mean'), ridesNoLaunchMean: g('ridesNoLaunch', 'mean'), broke: st.counts.broke }; };
  // user-revised judgement (SIM-034, USER_DECISIONS_2026-10-21.md; integrator quantification, ASSUMED thresholds)
  const judgedUser = (st, rr = []) => { const rr_both = rr.filter((r) => r.headNearShare <= 5 && r.headEpMax <= 2).length, rr_both_all = rr.filter((r) => r.headNearShareAll <= 5 && r.headEpMaxAll <= 2).length; const m = st.metrics, g = (k, s) => m[k]?.[s] ?? null; const hc = g('headClear', 'min'), ep = g('headEpMax', 'max'), nr = g('headNearShare', 'max');
    return { headClearUser_min: { value: hc, pass: hc == null ? null : hc >= 0.25, criterion: '>=0.25 m' }, headEpisodeMax_s: { value: ep, pass: ep == null ? null : ep <= 2, criterion: '<=2 s per episode' }, headNearShareMax_pct: { value: nr, pass: nr == null ? null : nr <= 5, criterion: '<=5 % of riding' },
      headNearShare_dist: { mean: g('headNearShare', 'mean'), p50: g('headNearShare', 'p50'), p90: g('headNearShare', 'p90') }, headEpisodeMax_dist: { p50: g('headEpMax', 'p50'), p90: g('headEpMax', 'p90') },
      allTime: { nearShareMax_pct: g('headNearShareAll', 'max'), nearShare_p50: g('headNearShareAll', 'p50'), episodeMax_s: g('headEpMaxAll', 'max'), casesMeetingBoth: rr_both_all },
      casesMeetingBoth_riding: rr_both,
      avail_all48_mean: g('avail', 'mean'), availUser_mean: g('availUser', 'mean'), noLiftShare_mean: g('noLiftShare', 'mean'),
      packVolUser: { rule: 'stowed open on the back, no pole, nothing above the helmet', pass: true, stowedEnvelope_L: g('packVol', 'max'), foldIntoPack_L_bonus: g('packFolded', 'max') },
      azRangeUser: 'fixed angle accepted by the user; commandable span 0° (no steering adopted)' }; };
  const summary = (rr) => { const st = ensembleStats(rr); return { judged: judged(st), judgedUser: judgedUser(st, rr), info: info(st), counts: st.counts }; };
  const cases = arg === 'quick' ? FULLRUN_CASES_R4.filter((c, i) => i % 4 === 0) : FULLRUN_CASES_R4;
  const ens = async (over = {}, opt = {}, cs = cases) => { const rr = await runMany(cs.map((c) => ({ c, over, opt }))); const e = rr.find((r) => r.error); if (e) { console.error(e.error); process.exit(1); } return rr; };
  const short = (s) => Object.fromEntries(Object.entries(s.judged).map(([k, v]) => [k, [v.value, v.pass]]));
  const read = (f) => (existsSync(join(here, f)) ? JSON.parse(readFileSync(join(here, f), 'utf8')) : {});

  if (arg === 'iter') {
    // design iterations: each entry is one honest design change judged on the full 48 cases
    const ITER = JSON.parse(process.argv[3] || '[]');
    const out = read('iterations.json'); out.iterations = out.iterations || [];
    for (const it of ITER) {
      const t0 = Date.now(); const rr = await ens(it.over || {});
      const s = summary(rr);
      out.iterations.push({ id: it.id, change: it.change, over: it.over, ...s, seconds: (Date.now() - t0) / 1000 });
      console.log(it.id, JSON.stringify(short(s)), 'USER', JSON.stringify(s.judgedUser));
    }
    out.evidence = 'numerical-uncalibrated simulation; NOT a physical test'; out.modelVersion = concept.modelVersion;
    writeFileSync(join(here, 'iterations.json'), JSON.stringify(strip(out), null, 1));
    for (const w of workers) w.terminate(); process.exit(0);
  }

  const out = {
    conceptId: 'sledpack', modelVersion: concept.modelVersion, generated: new Date().toISOString().slice(0, 10),
    evidence: 'numerical-uncalibrated simulation (sim/js/concepts/sledpack); NOT a physical test; parameters ASSUMED unless cited (design.js)',
    fileHashes: Object.fromEntries(['model.js', 'analysis.js', 'design.js', 'detect.js', 'index.js'].map((f) => [f, createHash('sha256').update(readFileSync(join(root, 'sim/js/concepts/sledpack', f))).digest('hex').slice(0, 16)])),
    defaults: P,
    design: { kite: D.kiteBudget(P.areaScale, P.tail), geo: D.sledGeo(P.areaScale), ldMax: D.ldMax(D.sledGeo(P.areaScale)), worn: D.wornBudget(P.areaScale, P.tail, P.stow), packVol: D.packVolume(P.stow, P.areaScale), eyelet: D.EYELET, backStow: D.BACKSTOW, line: D.LINE, reel: D.REEL, geom: D.GEOM },
  };
  if (arg !== 'sens') {
    const t0 = Date.now(); const rows = await ens();
    const st = ensembleStats(rows);
    const stU = judgedUser(st, rows);
    out.ensemble = { judgedUser: stU, definition: 'shared simulateRun plan (38 s ride, 20 s rest, 33 s ride, final hold 25 s) × FULLRUN_CASES_R4; round-4 rules (avail on bodyPx ≥300 over col.riding, artefact overlap AND ≥2 px, jitter p90 of footageStability subjectRms over flown cases, headClear via helmetAt incl. line, only ≤3 s capture window excluded, KE ground frame beyond 1.5 m, gates on windEstimate)', judged: judged(st), info: info(st), stats: st.metrics, counts: st.counts, rows, seconds: (Date.now() - t0) / 1000 };
    const bin = (f) => { const rr = rows.filter(f); return rr.length ? { ...summary(rr) } : null; };
    out.ensemble.byDir = Object.fromEntries(['calm', 'head', 'tail', 'crossL', 'crossR'].map((d) => [d, bin((r) => r.dir === d)]));
    out.ensemble.bySpeed = Object.fromEntries([0, 3, 3.5, 4.5, 5.5, 6, 9].map((U) => [`U${U}`, bin((r) => r.U === U)]));
    console.log('ensemble', cases.length, 'in', out.ensemble.seconds, 's', JSON.stringify(short({ judged: out.ensemble.judged })), JSON.stringify(out.ensemble.info), 'USER', JSON.stringify(stU));
    if (arg !== 'quick') writeFileSync(join(root, 'sim/js/concepts/sledpack/ensemble.js'), `// GENERATED by research/sledpack_2026_10_21/dev/run_all.mjs (${out.generated}) — do not edit.\n// 48-case FULLRUN_CASES_R4 ensemble at the default parameters (numerical-uncalibrated). A test re-checks a subset.\nexport const ENSEMBLE = ${JSON.stringify(strip({ modelVersion: concept.modelVersion, generated: out.generated, counts: st.counts, metrics: st.metrics, rowsKey: rows.map((r) => [r.id, r.avail, r.keMax, r.headClear, r.headFlyer]) }))};\n`);
    writeFileSync(join(here, arg === 'quick' ? 'results_quick.json' : 'results.json'), JSON.stringify(strip(out), null, 1));
    if (arg === 'quick' || arg === 'ensOnly') { for (const w of workers) w.terminate(); process.exit(0); }
  }
  // ---- sensitivity / robustness
  const sens = { generated: out.generated, modelVersion: concept.modelVersion, evidence: out.evidence, base: P, runs: {} };
  const SENS = {
    swingGuard0: { over: { swingGuard: 0 } }, swingGuard2: { over: { swingGuard: 2 } }, cwMax65: { over: { cwMax: 6.5 } }, cwMax6: { over: { cwMax: 6 } },
    noWake: { over: { wake: 0 } }, mass110: { over: { massScale: 1.1 } }, mass92: { over: { massScale: 0.92 } },
    wBias_p2: { over: { wBias: 2 } }, wBias_m2: { over: { wBias: -2 } }, twMax6_I10: { over: { twMax: 6 } }, Lcap12_I10: { over: { LmaxS: 12 } }, relT15: { over: { relT: 1.5 } },
  };

  for (const [k, v] of Object.entries(SENS)) { const t0 = Date.now(); const rr = await ens(v.over); sens.runs[k] = { over: v.over, ...summary(rr), seconds: (Date.now() - t0) / 1000 }; console.log(k, JSON.stringify(short(sens.runs[k])), JSON.stringify(sens.runs[k].info), 'USER', JSON.stringify(sens.runs[k].judgedUser)); }
  // extra seeds 14–16 on the same wind grid
  { const extra = FULLRUN_CASES_R4.map((c) => ({ ...c, id: c.id.replace(/_s\d+$/, `_s${c.seed + 3}`), seed: c.seed + 3 })); const rr = await ens({}, {}, extra); sens.runs.seeds14_16 = { ...summary(rr) }; console.log('seeds14_16', JSON.stringify(short(sens.runs.seeds14_16))); }
  // expert riders 15–17 m/s (expertCarve preset, 20° slope) on the 48 cases
  for (const v of [15, 17]) { const rr = await ens({}, { plan: [{ ride: 38, preset: 'expertCarve', skier: { vTarget: v } }, { hold: 20 }, { ride: 33, preset: 'expertCarve', skier: { vTarget: v } }, { hold: 25 }] }); sens.runs[`expert${v}`] = { ...summary(rr), maxRiderSpeedTarget: v }; console.log(`expert${v}`, JSON.stringify(short(sens.runs[`expert${v}`])), JSON.stringify(sens.runs[`expert${v}`].info)); }
  writeFileSync(join(here, 'sensitivity.json'), JSON.stringify(strip(sens), null, 1));
  for (const w of workers) w.terminate();
}
