// towglider round 4 (audit3): runs the judged 48-case full-run ensemble (FULLRUN_CASES_R4 = the 39 + tail 3.5/4.5/5.5 ×
// 3 seeds), off-grid tailwind sweeps (gate on = realistic gate errors; gate off = what the gate protects against), the
// stabilisation / camera / leash / energy sensitivities, every scenario, the rider-speed / slope envelope, design variants
// and a dt check; writes results.json here and sim/js/concepts/towglider/ensemble.js (constants used by index.js).
// Numerical-uncalibrated simulation output — not a physical test.
// Usage: node research/concepts_2026_10_19/dev/towglider/run_all.mjs   (uses 4 worker threads)
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept, { evaluateCase, ensembleStats, fullrunScenario, resolve } from '../../../../sim/js/concepts/towglider/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const strip = (r) => JSON.parse(JSON.stringify(r));

if (!isMainThread) {
  parentPort.on('message', ({ k, over, c }) => { const r = evaluateCase({ ...P, ...over }, c); parentPort.postMessage({ k, r: strip(r) }); });
} else {
  const { footageStability } = await import('../../../../sim/js/concepts/common/criteria.js');
  const { FULLRUN_CASES, FULLRUN_CASES_R4 } = await import('../../../../sim/js/concepts/common/fullrun.js');
  const { liftDrag, vStall, PDEF, runCore } = await import('../../../../sim/js/concepts/towglider/model.js');
  const { gliderBudget, powerChain, LINE, HIP, WORN, CAMERA_OPTIONS, packVolume } = await import('../../../../sim/js/concepts/towglider/design.js');
  const { SERVO, EIS, REFRAME } = await import('../../../../sim/js/concepts/towglider/attitude.js');
  const { BATTERY } = await import('../../../../sim/js/concepts/common/components.js');
  const { simulateSkier } = await import('../../../../sim/js/concepts/common/skier.js');
  const root = join(here, '../../../..');
  const r3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
  const R3 = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null) : v)));
  const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'headClear', 'endurance'];
  const hash = (f) => createHash('sha256').update(readFileSync(join(root, f))).digest('hex').slice(0, 16);
  const FILES = ['sim/js/concepts/towglider/model.js', 'sim/js/concepts/towglider/analysis.js', 'sim/js/concepts/towglider/attitude.js', 'sim/js/concepts/towglider/design.js', 'sim/js/concepts/towglider/index.js',
    'sim/js/concepts/common/env.js', 'sim/js/concepts/common/fullrun.js', 'sim/js/concepts/common/skier.js', 'sim/js/concepts/common/components.js', 'sim/js/concepts/common/criteria.js'];
  // ---- worker pool
  const NW = 4, workers = Array.from({ length: NW }, () => new Worker(fileURLToPath(import.meta.url)));
  const runMany = (jobs) => new Promise((resolveAll) => {
    const out = new Array(jobs.length); let next = 0, done = 0;
    if (!jobs.length) return resolveAll(out);
    const feed = (w) => { if (next < jobs.length) { const k = next++; w.postMessage({ k, over: jobs[k].over || {}, c: jobs[k].c }); } };
    for (const w of workers) { w.removeAllListeners('message'); w.on('message', ({ k, r }) => { out[k] = r; done++; if (done === jobs.length) resolveAll(out); else feed(w); }); feed(w); }
  });
  const mkCase = (dir, U, seed) => { const e = { head: [-1, 0, 0], tail: [1, 0, 0], crossL: [0, 1, 0], crossR: [0, -1, 0] }[dir]; return { id: `${dir}${U}_s${seed}`, U, dir, mean: [e[0] * U, e[1] * U, 0], seed, intensity: U >= 6 ? 0.2 : 0.15 }; };
  const t00 = Date.now();
  const pp = resolve(P), pf = { ...PDEF, ...pp };
  const out = {
    conceptId: 'towglider', modelVersion: concept.modelVersion, generated: new Date().toISOString().slice(0, 10), round: 4,
    evidence: 'numerical-uncalibrated simulation (sim/js/concepts/towglider); not a physical test. Parameters ASSUMED unless cited.',
    fileHashes: Object.fromEntries(FILES.map((f) => [f, hash(f)])),
    defaults: pp,
    design: {
      budgets_g: Object.fromEntries(Object.keys(CAMERA_OPTIONS).map((k) => { const b = gliderBudget(k, pf.S); return [k, { sum: r3(b.g), withMargin: r3(b.gWithMargin), W: r3(b.W), keCapSpeed: r3(Math.sqrt(29.8 / b.kg)) }]; })),
      line: LINE, hip: HIP, worn_kg: WORN, powerChain: R3(powerChain(gliderBudget('panRect', pf.S).W)),
      packVolume: { chosen: R3(packVolume({ ...pf, camOpt: 'panRect' })), wand_extra_L: 0.01 },
      stab: { servo: SERVO, eis: EIS, reframe: REFRAME },
      polar: Object.fromEntries([6, 7, 8, 10, 12, 14, 16].map((v) => [`LD_at_${v}`, r3(liftDrag(pf, v))])),
      vStall_clean_ms: r3(vStall(pf)), vStall_flaps_ms: r3(Math.sqrt((2 * pf.mass * 9.81) / (pf.rho * pf.S * (0.85 + pf.flapDCL)))), keCapSpeed_ms: r3(Math.sqrt((2 * 14.9) / pf.mass)), keGovernorSpeed_ms: r3(pf.keGov * Math.sqrt((2 * 14.9) / pf.mass)),
    },
  };

  // ---------------------------------------------------------------- 48-case judged ensemble
  let t0 = Date.now();
  const rows = (await runMany(FULLRUN_CASES_R4.map((c) => ({ c })))).map(R3);
  console.log('ensemble 48 in', (Date.now() - t0) / 1000, 's');
  const stats = ensembleStats(rows);
  const bin = (f) => R3(ensembleStats(rows.filter(f)));
  const launched = rows.filter((r) => !r.gated);
  out.ensemble = {
    definition: 'shared simulateRun plan (38 s ride, 20 s rest, 33 s ride, lift-approach stop; final hold 30 s so the stow completes) × FULLRUN_CASES_R4 (calm + 3/6/9 m/s × head/tail/crossL/crossR × 3 seeds + tail 3.5/4.5/5.5 × 3 seeds). Round-4 shared rules: avail on footage().bodyPx ≥300 px over col.riding (never-launched runs 0), artefact = overlap AND ≥2 px width; jitter = p90 over flown cases of footageStability(R).subjectRms; headClear to helmetAt (bodyPoints head) incl. the leash, capture window ≤3 s excluded; setup/ops p90; KE/force max; gates on windEstimate().',
    stats: R3(stats), launchedOnly: bin((r) => !r.gated),
    byWindSpeed: Object.fromEntries([0, 3, 3.5, 4.5, 5.5, 6, 9].map((U) => [`U${U}`, bin((r) => r.U === U)])),
    byDirection: Object.fromEntries(['calm', 'head', 'tail', 'crossL', 'crossR'].map((d) => [d, bin((r) => r.dir === d)])),
    tailBand: bin((r) => r.dir === 'tail' && r.U > 3 && r.U < 6),
    rows,
  };
  // availability ceiling: what the mean could be if every never-launched case flew at the launched mean
  const aL = launched.reduce((a, r) => a + r.avail, 0) / Math.max(1, launched.length);
  out.ensemble.availBound = { launchedMean: r3(aL), nLaunched: launched.length, nGated: rows.length - launched.length,
    ifTailUpTo6Flew: r3((aL * (rows.length - rows.filter((r) => r.dir === 'tail' && r.U >= 9).length)) / rows.length), ifAllFlew: r3(aL),
    note: 'avail mean over 48 = Σ case avail / 48; gated (never-launched) cases count 0. Even if every case incl. tail 9 m/s flew at the launched mean the ensemble would only reach the launched mean.' };
  const ensMetrics = { avail: stats.avail, pxMed: stats.pxMed, jitterRms: stats.fsSubject, jitterOwn: stats.jitterRms, jitterPct: stats.jitterPct, azRange: stats.azRange, setupTime: stats.setupTime, ops: stats.ops, bodyForcePeak: stats.bodyForcePeak, keMax: stats.keMax, headClear: stats.headClear, lineH1: { min: stats.lineH1min?.min, p10: stats.lineH1p10?.p10 }, lineH2: { min: stats.lineH2min?.min, p10: stats.lineH2p10?.p10 }, trip: { lowShareMean: stats.tripLow?.mean, H1p10: stats.tripH1p10?.mean, H2p10: stats.tripH2p10?.mean, H3p10: stats.tripH3p10?.mean, H2min: stats.tripH2min?.min }, endurance: stats.endurance };
  writeFileSync(join(root, 'sim/js/concepts/towglider/ensemble.js'), `// GENERATED by research/concepts_2026_10_19/dev/towglider/run_all.mjs (${out.generated}) — do not edit.\n// Round-4 48-case full-run ensemble (FULLRUN_CASES_R4) at the default parameters (numerical-uncalibrated). A test re-checks a subset.\nexport const ENSEMBLE = ${JSON.stringify(R3({ modelVersion: concept.modelVersion, generated: out.generated, counts: stats.counts, metrics: ensMetrics }))};\n`);

  // ---------------------------------------------------------------- off-grid tailwind sweeps (6 seeds)
  t0 = Date.now();
  const SEEDS6 = [11, 12, 13, 14, 15, 16], TAILU = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];
  const sweepJobs = (over) => TAILU.flatMap((U) => SEEDS6.map((s) => ({ c: mkCase('tail', U, s), over })));
  const summ = (rr) => TAILU.map((U) => { const a = rr.filter((r) => r.U === U), fl = a.filter((r) => !r.gated);
    return { U, n: a.length, launched: fl.length, availMean: r3(a.reduce((x, r) => x + r.avail, 0) / a.length), keMax: r3(Math.max(0, ...a.map((r) => r.keMax))), headClearMin: r3(Math.min(...fl.map((r) => r.headClear).filter(Number.isFinite))), fsMax: r3(Math.max(0, ...fl.map((r) => r.fsSubject).filter(Number.isFinite))), opsMax: Math.max(...a.map((r) => r.ops)), releases: a.filter((r) => r.releases > 0).length, cuts: a.filter((r) => r.cut).length }; });
  const swOn = await runMany(sweepJobs({})), swOff = await runMany(sweepJobs({ tailGate: 0 })), swG45 = await runMany(sweepJobs({ tailGate: 4.5 }));
  out.tailSweep = {
    note: 'off-grid true tailwind 2–6 m/s (0.5 steps) × seeds 11–16, intensity 0.15 (<6 m/s). gateOn = defaults (gate 3.0 m/s on the shared estimate, i.e. the realistic gate errors of the ±1 m/s bias); gateOff = forced launch (what the gate protects against); gate45 = the round-3 4.5 m/s gate.',
    gateOn: summ(swOn), gateOff: summ(swOff), gate45: summ(swG45),
    worstRows: { gateOn: swOn.filter((r) => !r.gated && (r.headClear < 1 || r.keMax > 14.9)).map((r) => R3({ id: r.id, gated: r.gated, avail: r.avail, keMax: r.keMax, headClear: r.headClear, ops: r.ops })), gateOff: swOff.filter((r) => !r.gated && (r.headClear < 1 || r.keMax > 14.9)).map((r) => R3({ id: r.id, avail: r.avail, keMax: r.keMax, headClear: r.headClear, ops: r.ops })), gate45: swG45.filter((r) => !r.gated && (r.headClear < 1 || r.keMax > 14.9)).map((r) => R3({ id: r.id, avail: r.avail, keMax: r.keMax, headClear: r.headClear, ops: r.ops })) },
  };
  // off-grid crosswind/headwind robustness (6 seeds at 4.5 and 7.5 m/s)
  const xJobs = ['crossL', 'crossR', 'head'].flatMap((d) => [4.5, 7.5].flatMap((U) => SEEDS6.map((s) => ({ c: mkCase(d, U, s) }))));
  const xr = await runMany(xJobs);
  out.offGridOther = { n: xr.length, keMax: r3(Math.max(...xr.map((r) => r.keMax))), headClearMin: r3(Math.min(...xr.map((r) => r.headClear).filter(Number.isFinite))), availMean: r3(xr.reduce((a, r) => a + r.avail, 0) / xr.length), opsMax: Math.max(...xr.map((r) => r.ops)), worst: xr.filter((r) => !r.gated && (r.headClear < 1 || r.keMax > 14.9)).map((r) => R3({ id: r.id, keMax: r.keMax, headClear: r.headClear })) };
  console.log('sweeps in', (Date.now() - t0) / 1000, 's');

  // ---------------------------------------------------------------- sensitivities on a 12-case subset (shared rules)
  t0 = Date.now();
  const SUB = ['calm_s11', 'calm_s12', 'head6_s12', 'crossL6_s12', 'crossR6_s13', 'tail3_s12', 'crossL9_s12', 'crossR9_s11', 'head9_s13', 'crossL3_s13', 'head3_s12', 'crossR3_s12'].map((id) => FULLRUN_CASES_R4.find((c) => c.id === id));
  const subStats = async (over = {}) => { const rr = await runMany(SUB.map((c) => ({ c, over }))); const fl = rr.filter((r) => !r.gated); const fsA = fl.map((r) => r.fsSubject).sort((a, b) => a - b);
    return { avail: r3(rr.reduce((a, r) => a + r.avail, 0) / rr.length), fsP90: r3(fsA[Math.round(0.9 * (fsA.length - 1))]), fsMax: r3(fsA[fsA.length - 1]), pxMed: r3(fl.reduce((a, r) => a + r.pxMed, 0) / fl.length), headClearMin: r3(Math.min(...fl.map((r) => r.headClear))), keMax: r3(Math.max(...rr.map((r) => r.keMax))), mountErrDeg: r3(fl.reduce((a, r) => a + r.mountErrDeg, 0) / fl.length), tripLow: r3(fl.reduce((a, r) => a + r.tripLow, 0) / fl.length), tripH2p10: r3(fl.reduce((a, r) => a + r.tripH2p10, 0) / fl.length), releases: rr.filter((r) => r.releases > 0).length }; };
  const SENS = {
    base: {},
    servoDeadband_1deg: { servo: { dbDeg: 1.0 } }, servoBacklash_1deg: { servo: { blDeg: 1.0 } }, servoBandwidth_3Hz: { servo: { fs: 3 } }, servoBandwidth_10Hz: { servo: { fs: 10 } }, servoSlew_300dps: { servo: { vmaxDeg: 300 } }, servoFrame_50Hz: { servo: { frame: 0.02 } }, fcLatency_20ms: { servo: { tauEst: 0.02 } },
    eisSync_3ms: { eis: { syncMs: 3 } }, eisSync_5ms: { eis: { syncMs: 5 } }, eisScale_5pct: { eis: { ks: 0.05 } }, eisRS_30pct: { eis: { rsResid: 0.3 } },
    allPessimistic: { servo: { dbDeg: 1.0, blDeg: 1.0, fs: 3 }, eis: { syncMs: 3, ks: 0.05, rsResid: 0.3 } },
    round3_idealisedMount: { mountModel: 0 },
    lens_56deg: { lensHfov: 56 }, lens_66deg_round3: { lensHfov: 66 }, lens_46deg: { lensHfov: 46 }, cropCentre_off: { cropCentre: 0 }, cropFillBody_0p55: { cropFillBody: 0.55 }, cropMargin_7deg: { cropMargin: 7 },
    Tmin_0p15_round3: { Tmin: 0.15 }, holster_tail_round3: { holster: 'tail' }, keGov_0p95: { keGov: 0.95 }, reelGov_off: { reelGov: 0 }, gate_4p5: { tailGate: 4.5 },
    mass_plus15: { massAuto: 0, mass: gliderBudget('panRect', pf.S).kg * 1.15 }, ld_minus30: { ldFactor: 0.7 },
  };
  out.sensitivities = { cases: SUB.map((c) => c.id) };
  for (const [k, v] of Object.entries(SENS)) { out.sensitivities[k] = await subStats(v); console.log('sens', k, JSON.stringify(out.sensitivities[k])); }
  delete out.sensitivities.trackNoise_3pct;
  // energy: lift-ride sleep vs idle, conductor resistance
  { const usableWh = HIP.packWh * BATTERY.coldFactor * (1 - BATTERY.reserve); const fl = rows.filter((r) => r.filmS > 1); const F = fl.reduce((a, r) => a + r.filmS, 0) / fl.length;
    const Ebase = fl.reduce((a, r) => a + r.E, 0) / fl.length; const W = gliderBudget('panRect', pf.S).W; const dHip = (R) => powerChain(W, 0, R).hipIn - powerChain(W, 0, LINE.ohmPerM).hipIn; const flyS = F * 1.15;
    out.sensitivities.endurance = { sleepMode: r3(((usableWh * 3600) / Ebase) * F / 60), liftIdle_0p6W: r3(((usableWh * 3600) / (Ebase + HIP.liftS * (HIP.reelIdleW + HIP.hipElecW - HIP.sleepW))) * F / 60),
      lineResistance: [1.3, 2.6, 5.2, 7, 10].map((R) => ({ ohmPerM: R, enduranceMin: r3(((usableWh * 3600) / (Ebase + dHip(R) * flyS)) * F / 60) })) }; }
  console.log('sensitivities in', (Date.now() - t0) / 1000, 's');
  for (const w of workers) w.terminate();

  // ---------------------------------------------------------------- scenarios
  const summarise = (R) => { const fs = footageStability(R); return {
    metrics: Object.fromEntries(R.metrics.map((m) => [m.id, { value: r3(m.value), unit: m.unit, pass: m.pass, criterion: m.criterion ? m.criterion.en : null }])),
    events: R.events.map((e) => ({ t: r3(e.t), type: e.type, severity: e.severity, en: e.en })),
    footageStability: { subjectRms_degs: r3(fs.subjectRms), backgroundRms_degs: r3(fs.backgroundRms) }, validUntil: R.validUntil }; };
  out.scenarios = {}; out.passTable = {};
  for (const sc of concept.scenarios) {
    const ts = Date.now(); const R = concept.simulate(P, sc);
    out.scenarios[sc.id] = { en: sc.en, expect: sc.expect.en, fault: !!sc.fault, stow: !!sc.stow, compare: !!sc.compare, computeMs: Date.now() - ts, ...summarise(R) };
    out.passTable[sc.id] = Object.fromEntries(STD.map((id) => { const m = R.metrics.find((x) => x.id === id); return [id, m ? (m.pass === null ? `n/j ${r3(m.value)}` : `${m.pass ? 'PASS' : 'FAIL'} ${r3(m.value)}`) : 'n/a']; }));
  }
  { const D = concept.demo.build(P); out.demo = { duration: concept.demo.duration, stages: concept.demo.stages.map((s) => ({ key: s.key, t0: s.t0, t1: s.t1, pending: s.pending, en: s.en })), ...summarise(D) }; }
  // live-tracker noise sensitivity on two cases (main thread, REFRAME is module state)
  { REFRAME.noiseFrac = 0.03; const a = ['calm_s11', 'crossL9_s12'].map((id) => evaluateCase(P, FULLRUN_CASES_R4.find((c) => c.id === id))); REFRAME.noiseFrac = 0.01;
    out.sensitivities.trackNoise_3pct_2cases = a.map((r) => R3({ id: r.id, avail: r.avail, fsSubject: r.fsSubject })); }
  console.log('scenarios done');

  // ---------------------------------------------------------------- envelope: rider speed and slope (follow segments, 25 s)
  const segScen = (id, skier, wind) => ({ id, en: id, dur: 25, skier: { duration: 26, ...skier }, wind, expect: { en: '' } });
  const env = [];
  const WL = { mean: [0, 2, 0], intensity: 0.2, Lu: 30, seed: 7 }, WC6 = { mean: [0, -6, 0], intensity: 0.2, seed: 12 }, WT3 = { mean: [3, 0, 0], intensity: 0.15, seed: 12 };
  const envRow = (nm, R, extra = {}) => { const fs = footageStability(R); const s = { ...R.summary }; delete s.trip; return { case: nm, ...extra, ...R3(s), fsSubject: r3(fs.subjectRms), events: R.events.filter((e) => ['margin', 'release', 'cut', 'gate', 'overspeed'].includes(e.type)).map((e) => `${e.type}@${r3(e.t)}`) }; };
  for (const [wn, W] of [['light', WL], ['cross6', WC6], ['tail3', WT3]]) for (const v of [6, 8, 10, 12, 13, 14, 15]) {
    const R = concept.simulate(P, segScen(`v${v}_${wn}`, { vTarget: v, v0: v, turnPeriod: v < 9 ? 3.4 : 2.9, turnAmpDeg: v < 9 ? 50 : 45 }, W));
    env.push(envRow(`v${v}_${wn}`, R, { riderSpeed: v, slope: 15, wind: wn }));
  }
  for (const [nm, sk] of [['slope10_v10', { slopeDeg: 10, vTarget: 10, v0: 10 }], ['expert20_v13', { slopeDeg: 20, vTarget: 13, v0: 13, turnAmpDeg: 50 }], ['slope24_v14', { slopeDeg: 24, vTarget: 14, v0: 14 }], ['moguls24_v4.5', { slopeDeg: 24, vTarget: 4.5, v0: 5, style: 'short', turnPeriod: 2.3, turnAmpDeg: 30, mu: 0.08 }], ['beginner_v6_snowplough', { vTarget: 6, v0: 6, turnPeriod: 4, turnAmpDeg: 35 }]]) {
    const R = concept.simulate(P, segScen(nm, sk, WL)); env.push(envRow(nm, R));
  }
  out.envelope = env;
  const runScen = (id, skier, wind) => ({ ...fullrunScenario(FULLRUN_CASES[0]), id, wind, run: { plan: [{ ride: 38, preset: 'recreationalCarve', skier }, { hold: 20 }, { ride: 33, preset: 'recreationalCarve', skier }, { hold: 30 }], seed: 11 } });
  out.runEnvelope = [];
  for (const [nm, sk] of [['beginner_v6', { vTarget: 6, v0: 0, turnPeriod: 3.4, turnAmpDeg: 50 }], ['rider_v14', { vTarget: 14 }], ['rider_v15', { vTarget: 15 }]]) for (const [wn, W] of [['calm', { mean: [0, 0, 0], seed: 11 }], ['tail3', { mean: [3, 0, 0], intensity: 0.15, seed: 12 }]]) {
    const R = concept.simulate(P, runScen(`${nm}_${wn}`, sk, W)); out.runEnvelope.push(envRow(`${nm}_${wn}`, R));
  }
  console.log('envelope done');

  // ---------------------------------------------------------------- dt check
  {
    const sk = simulateSkier({ duration: 21 });
    const base = { duration: 20, skier: sk, wind: { mean: [0, 2, 0], intensity: 0.2, seed: 7 }, plan: {} };
    const q = { ...PDEF, ...resolve(P), noise: 0, windEst: 0 };
    const a = runCore(q, base), b = runCore(q, { ...base, subFactor: 2 }), c = runCore(q, { ...base, ctrlDt: 0.01 });
    const rms = (x, y, st) => { let s = 0, n = 0; for (let i = 100; i < x.n; i++) { const j = i * st; if (j >= y.n) break; s += (x.O.gx[i] - y.O.gx[j]) ** 2 + (x.O.gy[i] - y.O.gy[j]) ** 2 + (x.O.gz[i] - y.O.gz[j]) ** 2; n++; } return Math.sqrt(s / n); };
    out.dtCheck = { posRms_sub1_vs_sub2_m: r3(rms(a, b, 1)), posRms_ctrl20ms_vs_10ms_m: r3(rms(a, c, 2)), note: 'nominal follow, sensor noise off' };
  }
  out.runtime_s = r3((Date.now() - t00) / 1000);
  writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 1));
  console.log('wrote results.json in', out.runtime_s, 's');
}
