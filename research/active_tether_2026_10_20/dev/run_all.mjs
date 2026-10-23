// SIM-032 phase 2 — activetether: judged 48-case ensemble (FULLRUN_CASES_R4), variant study (flyer × camera), safety
// robustness (seeds 11–16 + off-grid tail 2–6 m/s and cross 7.5 m/s), sensitivities on the ASSUMED parameters,
// product metrics (false launches on the control scientist's synthetic lift/queue/walk traces through our detector +
// launch gates, dock first-try success, dock time, line-low and third-party exposure), dt check.
// Writes results.json, sensitivity.json, design_notes.json is hand-written; regenerates sim/js/concepts/activetether/ensemble.js.
// Numerical-uncalibrated simulation output — NOT a physical test.
// Usage: node research/active_tether_2026_10_20/dev/run_all.mjs [quick]   (4 worker threads)
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept, { evaluateCase, ensembleStats } from '../../../sim/js/concepts/activetether/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const strip = (r) => JSON.parse(JSON.stringify(r, (k, v) => (typeof v === 'number' ? (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null) : v)));

if (!isMainThread) {
  parentPort.on('message', ({ k, over, c, opt }) => {
    let r;
    try { r = evaluateCase({ ...P, ...over }, c, opt || {}); } catch (e) { r = { id: c.id, error: String(e && e.stack || e) }; }
    parentPort.postMessage({ k, r: strip(r) });
  });
} else {
  const quick = process.argv.includes('quick');
  const { FULLRUN_CASES_R4 } = await import('../../../sim/js/concepts/common/fullrun.js');
  const { flyerBudget, podBudget, wornBudget, packVolume, FLYERS, ldMax, vStall, LINE, REEL, SENS, optics, SENSORS } = await import('../../../sim/js/concepts/activetether/design.js');
  const { runDetector, DET_DEFAULT } = await import('../../../sim/js/concepts/activetether/detect.js');
  const { ACTIVITIES } = await import('../science_control/lib/traces.mjs');
  const { mulberry32 } = await import('../../../sim/js/model/util.js');
  const root = join(here, '../../..');
  const NW = 4, workers = Array.from({ length: NW }, () => new Worker(fileURLToPath(import.meta.url)));
  const runMany = (jobs) => new Promise((res) => {
    const out = new Array(jobs.length); let next = 0, done = 0;
    if (!jobs.length) return res(out);
    const feed = (w) => { if (next < jobs.length) { const k = next++; w.postMessage({ k, over: jobs[k].over || {}, c: jobs[k].c, opt: jobs[k].opt }); } };
    for (const w of workers) { w.removeAllListeners('message'); w.on('message', ({ k, r }) => { out[k] = r; done++; if (done === jobs.length) res(out); else feed(w); }); feed(w); }
  });
  const mk = (dir, U, seed) => { const e = { head: [-1, 0, 0], tail: [1, 0, 0], crossL: [0, 1, 0], crossR: [0, -1, 0], calm: [0, 0, 0] }[dir]; return { id: `${dir}${U}_s${seed}`, U, dir, mean: [e[0] * U, e[1] * U, 0], seed, intensity: U >= 6 ? 0.2 : 0.15 }; };
  const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'headClear', 'endurance'];
  const JUDGE = { avail: ['mean', '>=', 80], pxMed: ['p50', '>=', 300], jitterRms: ['p90', '<=', 3], azRange: ['p50', '>=', 45], addedMass: ['max', '<=', 1.5], bodyForcePeak: ['max', '<=', 40], handsBusy: ['max', '<=', 5], setupTime: ['p90', '<=', 30], ops: ['p90', '<=', 2], keMax: ['max', '<=', 14.9], packVol: ['max', '<=', 3], headClear: ['min', '>=', 1.0], endurance: ['min', '>=', 45] };
  const judged = (st) => Object.fromEntries(STD.map((k) => { const [s, op, v] = JUDGE[k], x = st.metrics[k]?.[s]; return [k, { stat: s, value: x ?? null, pass: x == null ? null : op === '>=' ? x >= v : x <= v, criterion: `${op}${v}` }]; }));
  const t00 = Date.now();
  const cases = quick ? FULLRUN_CASES_R4.filter((c, i) => i % 4 === 0) : FULLRUN_CASES_R4;
  const out = {
    conceptId: 'activetether', modelVersion: concept.modelVersion, generated: new Date().toISOString().slice(0, 10),
    evidence: 'numerical-uncalibrated simulation (sim/js/concepts/activetether); NOT a physical test; parameters ASSUMED unless cited (design.js)',
    fileHashes: Object.fromEntries(['model.js', 'analysis.js', 'design.js', 'detect.js', 'index.js'].map((f) => [f, createHash('sha256').update(readFileSync(join(root, 'sim/js/concepts/activetether', f))).digest('hex').slice(0, 16)])),
    defaults: P,
  };
  // ---- design basis numbers
  out.design = {
    flyers: Object.fromEntries(['delta', 'kite'].map((t) => [t, { fly: flyerBudget(t, true), line: flyerBudget(t, false), LDmax: ldMax(FLYERS[t]), vStallCam: vStall(FLYERS[t], flyerBudget(t, true).kg), vStallNoCam: vStall(FLYERS[t], flyerBudget(t, false).kg), keCapSpeedCam: Math.sqrt(29.8 / flyerBudget(t, true).kg) }])),
    pod: podBudget(), worn: Object.fromEntries([['delta', true], ['delta', false], ['kite', true], ['kite', false]].map(([t, c]) => [`${t}_${c ? 'fly' : 'line'}`, { ...wornBudget(t, c), packVol: packVolume(t, c) }])),
    line: LINE, reel: REEL, optics: { k4_66: optics(66, SENSORS.k4), mp48_66: optics(66, SENSORS.mp48), k4_50: optics(50, SENSORS.k4) },
  };
  // ---- 1. judged 48-case ensemble at the defaults
  let t0 = Date.now();
  const rows = await runMany(cases.map((c) => ({ c })));
  const errs = rows.filter((r) => r.error); if (errs.length) { console.error(errs[0].error); process.exit(1); }
  const stats = ensembleStats(rows);
  out.ensemble = { definition: 'shared simulateRun plan (38 s ride, 20 s rest, 33 s ride, final hold extended 10→25 s so the last dock completes) × FULLRUN_CASES_R4; round-4 rules: avail on footage().bodyPx ≥300 over col.riding (never flown = 0, launch/brake/tow/capture frames not delivered), artefact = overlap AND ≥2 px; jitter = p90 over flown cases of footageStability(R).subjectRms; headClear to helmetAt() incl. line and flyer outline, only the ≤3 s capture window excluded; setup = stop→locked + overrun + 20 s per manual stow; KE ground frame beyond 1.5 m; gates on windEstimate()',
    judged: judged(stats), stats: stats.metrics, counts: stats.counts, rows, seconds: (Date.now() - t0) / 1000 };
  const bin = (f) => { const rr = rows.filter(f); return rr.length ? judged(ensembleStats(rr)) : null; };
  out.ensemble.byDir = Object.fromEntries(['calm', 'head', 'tail', 'crossL', 'crossR'].map((d) => [d, bin((r) => r.dir === d)]));
  out.ensemble.bySpeed = Object.fromEntries([0, 3, 3.5, 4.5, 5.5, 6, 9].map((U) => [`U${U}`, bin((r) => r.U === U)]));
  console.log('ensemble', cases.length, 'in', out.ensemble.seconds, 's', JSON.stringify(Object.fromEntries(Object.entries(out.ensemble.judged).map(([k, v]) => [k, [v.value, v.pass]]))));
  if (process.argv.includes('ensOnly')) { writeFileSync(join(here, 'ens_rows_dev.json'), JSON.stringify(strip(out.ensemble), null, 1)); for (const w of workers) w.terminate(); process.exit(0); }
  // generated constants for index.js (fullrun scenario)
  if (!quick) writeFileSync(join(root, 'sim/js/concepts/activetether/ensemble.js'), `// GENERATED by research/active_tether_2026_10_20/dev/run_all.mjs (${out.generated}) — do not edit.\n// 48-case FULLRUN_CASES_R4 ensemble at the default parameters (numerical-uncalibrated). A test re-checks a subset.\nexport const ENSEMBLE = ${JSON.stringify(strip({ modelVersion: concept.modelVersion, generated: out.generated, counts: stats.counts, metrics: stats.metrics, rowsKey: rows.map((r) => [r.id, r.avail, r.keMax, r.headClear]) }))};\n`);
  // ---- 2. variants: flyer × camera position
  t0 = Date.now();
  const VARS = { delta_fly: { flyer: 0, camPos: 0 }, delta_line: { flyer: 0, camPos: 1 }, kite_fly: { flyer: 1, camPos: 0 }, kite_line: { flyer: 1, camPos: 1 } };
  out.variants = {};
  for (const [k, over] of Object.entries(VARS)) {
    const same = over.flyer === P.flyer && over.camPos === P.camPos;
    const rr = same ? rows : await runMany(cases.map((c) => ({ c, over })));
    const st = ensembleStats(rr);
    out.variants[k] = { over, judged: judged(st), product: pick(st), counts: st.counts };
    console.log('variant', k, JSON.stringify(Object.fromEntries(Object.entries(out.variants[k].judged).map(([kk, v]) => [kk, v.value]))));
  }
  function pick(st) { const m = st.metrics; return { launchSuccess: m.launchSuccess, dockFirstTry: m.dockFirstTry, dockTime: m.dockTime, capVrel: m.capVrel, lowLineShare: m.lowLineShare, lowLenP90: m.lowLenP90, thirdPartyS: m.thirdPartyS, lineH1p10: m.lineH1p10, lineH3p10: m.lineH3p10, crashes: m.crashes, Tmax: m.Tmax, reelPeakW: m.reelPeakW, meanW: m.meanW, keFlyer: m.keFlyer, kePod: m.kePod, headFlyer: m.headFlyer, headLine: m.headLine, artShare: m.artShare, filmShare: m.filmShare, elevMed: m.elevMed, tensionMed: m.tensionMed, refuseS: m.refuseS, manual: m.manual }; }
  out.product = pick(stats);
  console.log('variants in', (Date.now() - t0) / 1000, 's');
  // ---- 3. safety robustness: seeds 11–16 on the R4 wind grid + off-grid tail 2–6 / cross 7.5
  t0 = Date.now();
  const grid = [['calm', 0], ...['head', 'tail', 'crossL', 'crossR'].flatMap((d) => [3, 6, 9].map((U) => [d, U]))];
  const seeds = quick ? [14] : [11, 12, 13, 14, 15, 16];
  const robCases = grid.flatMap(([d, U]) => seeds.map((s) => mk(d, U, s)));
  const offCases = [...[2, 2.5, 3.25, 3.75, 4, 4.25, 4.75, 5, 5.25, 5.75, 6].flatMap((U) => (quick ? [11] : [11, 12, 13]).map((s) => mk('tail', U, s))), ...(quick ? [11] : [11, 12, 13]).flatMap((s) => [mk('crossL', 7.5, s), mk('crossR', 7.5, s)])];
  const rob = await runMany([...robCases, ...offCases].map((c) => ({ c, opt: { fs: false } })));
  const safety = (rr) => { const st = ensembleStats(rr).metrics; return { n: rr.length, keMax: st.keMax, headClear: st.headClear, bodyForcePeak: st.bodyForcePeak, avail: st.avail, keOver14_9: rr.filter((r) => r.keMax > 14.9).length, headUnder1: rr.filter((r) => r.headClear < 1).length, forceOver40: rr.filter((r) => r.bodyForcePeak > 40).length, cutOrBroke: rr.filter((r) => r.cut || r.broke).length }; };
  out.robustness = {
    seeds11to16: safety(rob.slice(0, robCases.length)), offGrid: safety(rob.slice(robCases.length)),
    offGridRows: rob.slice(robCases.length).map((r) => ({ id: r.id, avail: r.avail, keMax: r.keMax, headClear: r.headClear, bodyForcePeak: r.bodyForcePeak, launches: r.launches, launchFails: r.launchFails, flown: r.flown })),
    note: 'grid-only safety was shown to be non-robust in round 4; these runs repeat the wind grid on 6 seeds and add off-grid tail/cross winds',
    seconds: (Date.now() - t0) / 1000,
  };
  console.log('robustness', JSON.stringify({ s: out.robustness.seeds11to16.keOver14_9, h: out.robustness.seeds11to16.headUnder1, f: out.robustness.seeds11to16.forceOver40 }), 'in', out.robustness.seconds, 's');
  // ---- 4. sensitivities (48 cases each)
  t0 = Date.now();
  const SENSI = {
    polar_cd0_x1_3: { cd0Scale: 1.3 }, polar_clmax_x0_8: { clmaxScale: 0.8 }, mass_x0_7: { massScale: 0.7 }, mass_x1_3: { massScale: 1.3 }, mass_x0_5: { massScale: 0.5 },
    capture_x0_8: { capScale: 0.8 }, sensors_x2: { noise: 2 }, sensors_x0: { noise: 0 }, motor_coldbus_11V: { V0: 11 }, motor_coldbus_9V5: { V0: 9.5 },
    launch_payout_4: { vLaunch: 4 }, elev_40: { elev: 40 }, elev_60: { elev: 60 }, line_7_5: { LfilmFly: 7.5 }, line_13: { LfilmFly: 13 },
    station_meancourse_0_5: { devK: 0.5 }, camera_4K: { cam48: 0 }, straightGate_6: { straightAcc: 6 }, gate_1_2: { gateK: 1.2 }, noSideDrop: { sideDrop: 0 },
  };
  const sCases = quick ? cases.slice(0, 4) : cases;
  out.sensitivity = {};
  for (const [k, over] of Object.entries(SENSI)) {
    const rr = await runMany(sCases.map((c) => ({ c, over, opt: { fs: k === 'camera_4K' || k === 'sensors_x2' || k === 'sensors_x0' } })));
    const st = ensembleStats(rr);
    out.sensitivity[k] = { over, judged: judged(st), launchSuccess: st.metrics.launchSuccess, dockFirstTry: st.metrics.dockFirstTry, dockTime: st.metrics.dockTime, crashes: st.metrics.crashes, keOver14_9: rr.filter((r) => r.keMax > 14.9).length, cutOrBroke: rr.filter((r) => r.cut || r.broke).length };
    console.log('sens', k, JSON.stringify(Object.fromEntries(['avail', 'keMax', 'headClear', 'bodyForcePeak', 'setupTime'].map((kk) => [kk, out.sensitivity[k].judged[kk].value]))));
  }
  // dock while moving (lift geofence 6 s before each stop, ASSUMED perfect)
  { const rr = await runMany(sCases.map((c) => ({ c, opt: { fs: false, preDock: 6 } }))); const st = ensembleStats(rr); out.sensitivity.predock_geofence_6s = { judged: judged(st), dockFirstTry: st.metrics.dockFirstTry, dockTime: st.metrics.dockTime, capVrel: st.metrics.capVrel }; }
  out.sensitivitySeconds = (Date.now() - t0) / 1000;
  // ---- 5. product: false launches on synthetic non-ski activity (control scientist's traces) through our detector + gates
  {
    const DAYS = quick ? 4 : 40, rng = mulberry32(4242);
    const per = {}; const dayFalse = [], dayGated = [];
    for (let d = 0; d < DAYS; d++) {
      let f = 0, fg = 0;
      const acts = [];
      for (let l = 0; l < 15; l++) { acts.push('queue'); acts.push(rng() < 0.7 ? 'chairlift' : 'surfaceLift'); }
      acts.push('walk', 'walk', 'gondola', 'catTrack', 'catTrack', 'catTrack', 'sitDown', 'sitDown', 'sitDown', 'busDown');
      for (const [k, a] of acts.entries()) {
        const tr = ACTIVITIES[a](mulberry32(d * 1000 + k + 1));
        const { ev } = runDetector(tr, { seed: d * 1000 + k + 3 });
        // a launch also needs the apparent-wind gate (pack speed + wind ≥ 1.35 × 4.93 m/s; wind 0–6 m/s head ASSUMED worst case)
        const gate = 1.35 * vStall(FLYERS.delta, flyerBudget('delta', true).kg);
        for (const ts of ev.start) {
          const i = Math.min(tr.n - 1, Math.round(ts / tr.dt) + 75);
          const v = Math.hypot(tr.vx[i], tr.vy[i]);
          const lab = tr.label[Math.min(tr.n - 1, Math.round(ts / tr.dt))];
          if (lab === 0) { f++; per[tr.kind] = per[tr.kind] || { n: 0, starts: 0, gated: 0 }; per[tr.kind].starts++; if (v + 3 >= gate) { fg++; per[tr.kind].gated++; } }
        }
        per[tr.kind] = per[tr.kind] || { n: 0, starts: 0, gated: 0 }; per[tr.kind].n++;
      }
      dayFalse.push(f); dayGated.push(fg);
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    out.falseLaunch = { days: DAYS, detectorStartsPerDay: mean(dayFalse), launchesPerDay_afterWindGate_head3: mean(dayGated), perActivity: per,
      note: 'synthetic traces from science_control/lib/traces.mjs (15 laps queue + chair/surface lift, walks, gondola, cat tracks, sit-downs, one bus descent per day); a "false launch" = detector start on a non-ski label (0) that also passes the apparent-wind gate assuming a 3 m/s headwind. Cat tracks (label 2, ambiguous) are excluded. Synthetic activity models — field logs required (≥50 ski days).',
      targets: { lift: '0 per 500 lift rides', unintendedPerDay: '≤0.2' } };
    console.log('falseLaunch', JSON.stringify({ d: out.falseLaunch.detectorStartsPerDay, g: out.falseLaunch.launchesPerDay_afterWindGate_head3 }));
  }
  // ---- 6. dt check (1 ms vs 2 ms) on 3 cases
  {
    const cs = ['calm_s11', 'head6_s12', 'crossL3_s13'].map((id) => FULLRUN_CASES_R4.find((c) => c.id === id));
    const a = await runMany(cs.map((c) => ({ c, opt: { fs: false } }))), b = await runMany(cs.map((c) => ({ c, over: { dt: 0.001 }, opt: { fs: false } })));
    out.dtCheck = cs.map((c, i) => ({ id: c.id, dt2ms: { avail: a[i].avail, keMax: a[i].keMax, headClear: a[i].headClear, bodyForcePeak: a[i].bodyForcePeak, elevMed: a[i].elevMed, tensionMed: a[i].tensionMed }, dt1ms: { avail: b[i].avail, keMax: b[i].keMax, headClear: b[i].headClear, bodyForcePeak: b[i].bodyForcePeak, elevMed: b[i].elevMed, tensionMed: b[i].tensionMed } }));
  }
  out.seconds = (Date.now() - t00) / 1000;
  writeFileSync(join(here, quick ? 'results_quick.json' : 'results.json'), JSON.stringify(strip(out), null, 1));
  writeFileSync(join(here, quick ? 'sensitivity_quick.json' : 'sensitivity.json'), JSON.stringify(strip({ generated: out.generated, evidence: out.evidence, sensitivity: out.sensitivity, robustness: { seeds11to16: out.robustness.seeds11to16, offGrid: out.robustness.offGrid }, variants: out.variants }), null, 1));
  console.log('total', out.seconds, 's');
  for (const w of workers) w.terminate();
}
