// leapfrog round 4 (after audit3): scenarios + demo, the 48-case judged ensemble (common/fullrun.js FULLRUN_CASES_R4:
// the 39 cases + tail 3.5/4.5/5.5 m/s × 3 seeds) on the round-4 shared rules (helmetAt-based headClear, bodyPx for
// avail/pxMed, ARTEFACT_PX rule, no idealised actuators/estimators in judged runs), by-wind-bin tables incl. the tail
// band, gate-bypass check of the independent speed protection, sensitivities (key uncertain parameters ±, idealised
// elements only as labelled sensitivities), rider-speed × downslope-wind envelope, dt convergence, exposure.
// Writes results.json and sim/js/concepts/leapfrog/ensemble.js. Numerical-uncalibrated simulation; not a physical test.
// Usage: node run_all.mjs            (full)      FAST=1 node run_all.mjs (ensemble only)
// Parallel: the ensemble and the sensitivities fan out over worker threads (deterministic; same numbers as serial).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import concept, { evaluate, fullrunInput, buildResult, PER_RUN, handling } from '../../../../sim/js/concepts/leapfrog/index.js';
import { PDEF, BOM, BOM_VISION, BOM_R3, BUDGET, MASS_KG, MASS_KG_VISION, MASS_KG_R3, KE_CAP, aero, ldAt, cd0At, motorPower, runCore, progressFeasible, designParams, morphCfg } from '../../../../sim/js/concepts/leapfrog/model.js';
import { exposure } from '../../../../sim/js/concepts/leapfrog/analysis.js';
import { footageStability, CRITERIA, judge } from '../../../../sim/js/concepts/common/criteria.js';
import { FULLRUN_CASES_R4, pct, helmetAt } from '../../../../sim/js/concepts/common/fullrun.js';
import { enduranceMin, keSpeedCap, COMPONENTS } from '../../../../sim/js/concepts/common/components.js';
import { simulateSkier } from '../../../../sim/js/concepts/common/skier.js';

const here = dirname(fileURLToPath(import.meta.url));
const FAST = !!process.env.FAST;
const D = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r3 = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);
const fin = (a) => a.filter(Number.isFinite);
const mean = (a) => { const b = fin(a); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
const st = (a) => { const b = fin(a); return b.length ? { mean: r3(mean(b)), p10: r3(pct(b, 0.1)), p50: r3(pct(b, 0.5)), p90: r3(pct(b, 0.9)), min: r3(Math.min(...b)), max: r3(Math.max(...b)), n: b.length } : { n: 0 }; };
const caseById = (id) => FULLRUN_CASES_R4.find((c) => c.id === id);

// ---- one case on the shared rules (also run inside the workers)
function caseRow(c, over = {}, { skier = {}, bypass = false, fs = true } = {}) {
  const t0 = performance.now();
  const prep = { ...fullrunInput(c, { skier, params: over }), fullrun: true, caseObj: c };
  if (bypass) prep.input.plan.noFlyGate = false;
  const R = buildResult({ ...D, ...over }, { id: `case_${c.id}` }, prep);
  const r = R.summary, core = R.core;
  const ms = performance.now() - t0;
  const f = fs && !core.noFly ? footageStability(R) : null;
  const O = core.O;
  const flyS = Array.from(O.phase).filter((ph) => ph === 2 || ph === 3 || ph === 1).length * 0.02;
  // headClear re-check with the shared helmetAt() (round-4 rule) on the core trajectory (airborne/moving glider, 0.38 m
  // half-span envelope extended to the 0.5 m half-span when the feathers are out)
  let hcShared = Infinity;
  for (let i = 0; i < core.n; i++) {
    const ph = O.phase[i]; if (![1, 2, 3, 4, 6].includes(ph)) continue;
    const ts = i * 0.02 - (prep.input.tGo || 0);
    const hd = ts < 0 ? helmetAt(prep.sk, 0) : helmetAt(prep.sk, ts);
    hcShared = Math.min(hcShared, Math.hypot(O.x[i] - hd[0], O.y[i] - hd[1], O.z[i] - hd[2]) - (0.275 + 0.225 * (O.morph[i] || 0)));
  }
  return {
    id: c.id, U: c.U, dir: c.dir, seed: c.seed, ms: Math.round(ms), noFly: core.noFly, gateWhy: core.gate && core.gate.refused ? core.gate.why : null,
    gateW: core.gate ? core.gate.w : null, gateT: core.gate ? core.gate.t : null, gateVProg: core.gate ? core.gate.vProg : null, riderProg: core.gate ? core.gate.riderProg : null,
    avail: r.avail, pxMed: r.pxMed, jitterOwn: r.jitter, fsSubject: f ? f.subjectRms : NaN, fsBackground: f ? f.backgroundRms : NaN,
    azRange: r.azRange, frontShare: r.frontShare, fromFlight: r.fromFlight, fromPerch: r.fromPerch,
    setupTime: r.pr.setup, launchStand: r.pr.launchStand, endWait: r.pr.wait, retrieveMove: (r.pr.retrieveRide || 0) + (r.pr.sidestep || 0), retrieveDist: r.pr.retrieveDist, stow: r.pr.stow, setDown: prep.handling ? prep.handling.setDown : NaN,
    ops: r.pr.ops, nextRun: !!r.pr.nextRun, bodyForcePeak: r.bodyF, keMax: r.keMax, headClear: r.headClear, headClearShared: Number.isFinite(hcShared) ? hcShared : NaN, pMean: r.pMean, pMotMean: r.pMotMean,
    sepMaxFly: r.sepMaxFly, sepMin: r.sepMin, tdKE: r.tdKE, slideMax: r.slideMax, behindShare: r.behindShare, perchShare: r.perchShare, hops: r.hops,
    crabS: r.crabS, visLock: r.visLock, pointRms: r.pointRms, morphMean: mean(Array.from(O.morph).filter((v, i) => [1, 2, 3].includes(O.phase[i]))), landNow: core.events.filter((e) => e.type === 'landnow').length, giveUp: core.events.some((e) => e.type === 'giveup'),
    perchS: (r.perchShare / 100) * (core.n * 0.02), flyS, loss: r.loss.map((v) => r3(v)),
  };
}

if (!isMainThread) {
  const { jobs } = workerData;
  const out = jobs.map((j) => ({ key: j.key, row: caseRow(caseById(j.id), j.over || {}, j.opts || {}) }));
  parentPort.postMessage(out);
} else {
  // ---- run a list of jobs over worker threads
  const runJobs = async (jobs) => {
    const W = Math.max(1, Math.min(availableParallelism() - 1, 8, jobs.length));
    const parts = Array.from({ length: W }, () => []);
    jobs.forEach((j, i) => parts[i % W].push({ ...j, key: i }));
    const res = await Promise.all(parts.map((p) => new Promise((ok, bad) => { const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: p } }); w.on('message', ok); w.on('error', bad); })));
    const rows = new Array(jobs.length); for (const part of res) for (const x of part) rows[x.key] = x.row; return rows;
  };

  const out = {
    conceptId: concept.id, modelVersion: concept.modelVersion,
    evidence: 'numerical-uncalibrated simulation (round 4); demo = engineering illustration; nothing physically tested',
    generated: new Date().toISOString().slice(0, 10), params: D, scenarios: {},
  };

  // ---- 1. scenarios + demo
  if (!FAST) {
    const runs = [...concept.scenarios.map((s) => [s.id, () => concept.simulate(D, s), s]), ['demo', () => concept.demo.build(D), null]];
    for (const [id, fn, sc] of runs) {
      const t0 = performance.now();
      const R = fn();
      const ms = performance.now() - t0;
      const fs = footageStability(R);
      const m = Object.fromEntries(R.metrics.map((x) => [x.id, { value: r3(x.value), unit: x.unit, pass: x.pass, criterion: x.criterion ? x.criterion.en : null }]));
      out.scenarios[id] = {
        name: sc ? sc.en : 'Demo (60 s)', expect: sc ? sc.expect.en : null, fault: !!(sc && sc.fault), envelope: !!(sc && sc.envelope), computeMs: Math.round(ms), validUntil: R.validUntil,
        fails: R.metrics.filter((x) => x.pass === false).map((x) => x.id), metrics: m,
        footageStability: { subjectRms: r3(fs.subjectRms), backgroundRms: r3(fs.backgroundRms), samples: fs.samples },
        events: R.events.filter((e) => !['touchdown', 'flare'].includes(e.type)).map((e) => ({ t: +e.t.toFixed(2), type: e.type, severity: e.severity, en: e.en })),
      };
      console.log(id.padEnd(13), `${Math.round(ms)} ms`, 'fails:', out.scenarios[id].fails.join(' ') || '—', `| fs ${r3(fs.subjectRms)}/${r3(fs.backgroundRms)}`);
    }
  }

  // ---- 2. the 48-case judged ensemble
  const t0e = performance.now();
  const rows = await runJobs(FULLRUN_CASES_R4.map((c) => ({ id: c.id })));
  console.log(`ensemble ${rows.length} cases in ${Math.round(performance.now() - t0e)} ms wall`);
  const flown = rows.filter((x) => !x.noFly);
  const pMeanEns = mean(flown.map((x) => x.pMean));
  const whEff = D.battWh + D.bankWh * PDEF.bankEff;
  const holsterKg = 0.05 + D.bankWh / 150, addedMass = MASS_KG + holsterKg + 0.008;
  const PACK_L = 0.32 * 0.091 * 0.086 * 1000;
  const K = ['avail', 'pxMed', 'fsSubject', 'fsBackground', 'jitterOwn', 'azRange', 'frontShare', 'fromFlight', 'fromPerch', 'setupTime', 'launchStand', 'endWait', 'retrieveMove', 'retrieveDist', 'stow', 'setDown', 'ops', 'bodyForcePeak', 'keMax', 'headClear', 'headClearShared', 'pMean', 'sepMaxFly', 'sepMin', 'tdKE', 'slideMax', 'behindShare', 'perchShare', 'crabS', 'visLock', 'pointRms', 'morphMean'];
  const summ = (rs) => Object.fromEntries(K.map((k) => [k, st(rs.map((x) => x[k]))]));
  const UB = [...new Set(FULLRUN_CASES_R4.map((c) => c.U))].sort((a, b) => a - b);
  const ens = {
    cases: rows.length, generated: out.generated, modelVersion: concept.modelVersion,
    rules: 'round 4: 48 cases (FULLRUN_CASES_R4); avail = mean of 48 on col.riding (no-fly = 0), frames judged on footage().bodyPx ≥300 px; jitter = p90 over flown cases of footageStability(R).subjectRms with the LIVE tracker crop; setup p90 simulated (MODAPTS gloved set-down + gate wait + lead wait + landing wait + skate/side-step + MODAPTS gloved pick-up/snap); ops p90 (max reported); keMax/bodyForce max; headClear min (helmetAt); all wind gates on windEstimate()',
    metrics: {
      avail: st(rows.map((x) => x.avail)), setupTime: st(rows.map((x) => x.setupTime)), ops: st(rows.map((x) => x.ops)),
      bodyForcePeak: st(rows.map((x) => x.bodyForcePeak)), keMax: st(rows.map((x) => x.keMax)), headClear: st(rows.map((x) => x.headClear)), headClearShared: st(rows.map((x) => x.headClearShared)),
      jitter: st(flown.map((x) => x.fsSubject)), jitterOwn: st(flown.map((x) => x.jitterOwn)), pxMed: st(rows.map((x) => x.pxMed)), azRange: st(rows.map((x) => x.azRange)),
      endurance: { value: r3(enduranceMin(whEff, pMeanEns, { heated: true })), pMean: r3(pMeanEns), whEff: r3(whEff), rule: 'shared enduranceMin(cell + bank×0.85, mean full-run power of the flown cases, heated: heater charged over the whole day) — cold 0.75, reserve 15 %' },
      addedMass: { value: r3(addedMass), note: `glider ${r3(MASS_KG)} + holster shell 0.05 + bank ${r3(D.bankWh / 150)} + tag 0.008 kg` },
      packVol: { value: r3(PACK_L), note: 'holster outer 0.32 × 0.091 × 0.086 m incl. 3 mm walls (folded span-morphing glider 0.30 m long)' },
      handsBusy: { value: 0, note: 'set-down and pick-up at standstill only' },
      availFlown: st(flown.map((x) => x.avail)), sepMaxFly: st(flown.map((x) => x.sepMaxFly)), stow: st(rows.map((x) => x.stow)),
    },
    byWind: UB.map((U) => {
      const rs = rows.filter((x) => x.U === U), fl = rs.filter((x) => !x.noFly);
      return { U, n: rs.length, noFly: rs.length - fl.length, avail: st(rs.map((x) => x.avail)), availFlown: st(fl.map((x) => x.avail)), fromFlight: r3(mean(fl.map((x) => x.fromFlight))), fromPerch: r3(mean(fl.map((x) => x.fromPerch))),
        keMax: r3(Math.max(0, ...fl.map((x) => x.keMax))), sepMaxFly: r3(Math.max(0, ...fl.map((x) => x.sepMaxFly))), setupP90: r3(pct(rs.map((x) => x.setupTime), 0.9)), opsMax: Math.max(...rs.map((x) => x.ops)), jitterP90: r3(pct(fin(fl.map((x) => x.fsSubject)), 0.9)) };
    }),
    byDir: ['calm', 'head', 'tail', 'crossL', 'crossR'].map((d) => { const rs = rows.filter((x) => x.dir === d); return { dir: d, n: rs.length, avail: st(rs.map((x) => x.avail)), noFly: rs.filter((x) => x.noFly).length }; }),
    byWindDir: UB.filter((U) => U > 0).flatMap((U) => ['head', 'tail', 'crossL', 'crossR'].map((d) => { const rs = rows.filter((x) => x.U === U && x.dir === d); if (!rs.length) return null; return { U, dir: d, availMean: r3(mean(rs.map((x) => x.avail))), availMin: r3(Math.min(...rs.map((x) => x.avail))), keMax: r3(Math.max(...rs.map((x) => x.keMax))), noFly: rs.filter((x) => x.noFly).length, ops: rs.map((x) => x.ops).join('/'), gate: rs.map((x) => (x.gateWhy || 'fly') + `(${x.gateW ? x.gateW[0].toFixed(1) : '-'})`).join('/') }; }).filter(Boolean)),
    tailBand: (() => { const rs = rows.filter((x) => x.dir === 'tail'); return { n: rs.length, availMean: r3(mean(rs.map((x) => x.avail))), noFly: rs.filter((x) => x.noFly).length, ops3: rs.filter((x) => x.ops > 2).map((x) => x.id), keMax: r3(Math.max(...rs.map((x) => x.keMax))), sepMaxFly: r3(Math.max(...rs.map((x) => x.sepMaxFly))) }; })(),
    footageSource: { fromFlight: r3(mean(flown.map((x) => x.fromFlight))), fromPerch: r3(mean(flown.map((x) => x.fromPerch))), note: 'share of usable riding-time footage filmed while airborne vs from the snow, mean over flown cases' },
  };
  const J = (id, v, extra = {}) => ({ value: r3(v), ...judge(id, v), ...extra });
  ens.judged = {
    avail: J('avail', ens.metrics.avail.mean, { stat: 'mean of 48 (col.riding, bodyPx)' }),
    pxMed: J('pxMed', ens.metrics.pxMed.mean, { stat: 'mean of case medians (bodyPx)' }),
    jitterRms: J('jitterRms', ens.metrics.jitter.p90, { stat: 'p90 of footageStability subjectRms over flown cases (live tracker crop)' }),
    azRange: J('azRange', ens.metrics.azRange.mean, { stat: 'mean' }),
    addedMass: J('addedMass', addedMass, { stat: 'design' }),
    bodyForcePeak: J('bodyForcePeak', ens.metrics.bodyForcePeak.max, { stat: 'max' }),
    handsBusy: J('handsBusy', 0, { stat: 'design' }),
    setupTime: J('setupTime', ens.metrics.setupTime.p90, { stat: 'p90 (simulated)', max: ens.metrics.setupTime.max }),
    ops: J('ops', ens.metrics.ops.p90, { stat: 'p90 / max', max: ens.metrics.ops.max, passMax: ens.metrics.ops.max <= 2 }),
    keMax: J('keMax', ens.metrics.keMax.max, { stat: 'max' }),
    packVol: J('packVol', PACK_L, { stat: 'design (ASSUMED envelope)' }),
    endurance: J('endurance', ens.metrics.endurance.value, { stat: 'mean power of flown cases' }),
    headClear: J('headClear', Math.min(ens.metrics.headClear.min, ens.metrics.headClearShared.min), { stat: 'min (own and helmetAt recompute)' }),
  };
  for (const k of Object.keys(ens.judged)) delete ens.judged[k].criterion;
  out.ensemble = { ...ens, summary: summ(rows), rows: rows.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Array.isArray(v) ? v.map(r3) : r3(v)]))) };
  console.log('JUDGED', Object.entries(ens.judged).map(([k, v]) => `${k} ${v.value}${v.pass ? '' : ' FAIL'}`).join(' | '));
  for (const b of ens.byWind) console.log(`  wind ${b.U}: avail ${b.avail.mean}/${b.avail.p10}/${b.avail.p90} flown ${b.availFlown.mean} noFly ${b.noFly}/${b.n} ke ${b.keMax} sep ${b.sepMaxFly} setupP90 ${b.setupP90} opsMax ${b.opsMax} jit ${b.jitterP90}`);
  for (const b of ens.byWindDir) console.log(`  ${b.dir}${b.U}: avail ${b.availMean} (min ${b.availMin}) ke ${b.keMax} ops ${b.ops} gate ${b.gate}`);
  for (const x of rows) console.log(`   ${x.id.padEnd(13)} ${x.noFly ? 'NOFLY ' + x.gateWhy : '      '} av ${r3(x.avail)} fs ${r3(x.fsSubject)} setup ${r3(x.setupTime)} ops ${x.ops} ke ${r3(x.keMax)} hc ${r3(x.headClear)}/${r3(x.headClearShared)} sep ${r3(x.sepMaxFly)} px ${r3(x.pxMed)}`);

  const CHECK = ['calm_s11', 'crossR6_s12', 'head3_s13', 'tail6_s13', 'tail3_s12', 'tail5.5_s11', 'tail4.5_s12'];
  const ENS_JS = { cases: ens.cases, generated: ens.generated, modelVersion: ens.modelVersion, rules: ens.rules, metrics: ens.metrics, judged: ens.judged, footageSource: ens.footageSource, tailBand: ens.tailBand,
    byWind: ens.byWind.map((b) => ({ U: b.U, n: b.n, noFly: b.noFly, avail: { mean: b.avail.mean, p10: b.avail.p10, p90: b.avail.p90 }, fromFlight: b.fromFlight, fromPerch: b.fromPerch, keMax: b.keMax })),
    byWindDir: ens.byWindDir, check: Object.fromEntries(CHECK.map((id) => { const x = rows.find((y) => y.id === id); return [id, { avail: r3(x.avail), keMax: r3(x.keMax), setupTime: r3(x.setupTime), ops: x.ops, noFly: x.noFly }]; })) };
  writeFileSync(join(here, '../../../../sim/js/concepts/leapfrog/ensemble.js'), `// Generated by research/concepts_2026_10_19/dev/leapfrog/run_all.mjs (${out.generated}) — do not edit.\n// 48-case full-run ensemble (common/fullrun.js FULLRUN_CASES_R4) of ${concept.modelVersion} on the round-4 shared judging rules; numerical-uncalibrated.\nexport const ENSEMBLE = ${JSON.stringify(ENS_JS)};\n`);
  if (FAST) { writeFileSync(join(here, 'results_fast.json'), JSON.stringify(out, null, 1)); process.exit(0); }

  // ---- 3. gate bypass: the refused cases launched anyway → independent speed protection and follow-me give-up
  const refused = FULLRUN_CASES_R4.filter((c) => rows.find((x) => x.id === c.id).noFly);
  const byp = await runJobs(refused.map((c) => ({ id: c.id, opts: { bypass: true, fs: false } })));
  out.gateBypass = { note: 'cases the gate refused, flown anyway', rows: byp.map((x) => ({ id: x.id, avail: r3(x.avail), keMax: r3(x.keMax), sepMaxFly: r3(x.sepMaxFly), ops: x.ops, landNow: x.landNow, giveUp: x.giveUp, nextRun: x.nextRun })), keMax: r3(Math.max(...byp.map((x) => x.keMax))), sepMaxFly: r3(Math.max(...byp.map((x) => x.sepMaxFly))), availMean: r3(mean(byp.map((x) => x.avail))) };
  console.log('gate bypass', JSON.stringify(out.gateBypass));

  // ---- 4. sensitivities on an 18-case subset spanning the bins incl. the whole tail band edge (judged runs above are
  // the reference; IDEALISED elements appear here only, labelled)
  const SUB = ['calm_s11', 'calm_s12', 'head3_s12', 'head6_s13', 'head9_s12', 'tail3_s11', 'tail3_s13', 'tail3.5_s12', 'tail4.5_s11', 'tail4.5_s13', 'tail5.5_s11', 'tail5.5_s12', 'tail6_s11', 'crossL3_s13', 'crossL6_s11', 'crossR6_s12', 'crossL9_s12', 'crossR9_s13'];
  const vis = designParams(MASS_KG_VISION);
  const VAR = [
    { id: 'V0_chosen', note: 'round-4 design (judged settings)', over: {} },
    { id: 'V1_fixed_wing', note: 'feathers locked tucked (fixed 0.05 m² wing, same mass): what the morphing buys', over: { morph: 0 } },
    { id: 'V2_clmaxX_1.1', note: 'extended CLmax 1.1 instead of 1.25 (stall 5.5 m/s)', over: { clmaxX: 1.1 } },
    { id: 'V3_clmaxX_1.4', note: 'extended CLmax 1.4 (LisHawk-like)', over: { clmaxX: 1.4 } },
    { id: 'V4_Sx_0.085', note: 'extended area only 0.085 m² (feathers +70 % instead of +100 %)', over: { Sx: 0.085, ARx: 9 } },
    { id: 'V5_mass_plus10', note: 'mass +10 % with the KE cap re-derived', over: designParams(MASS_KG * 1.1) },
    { id: 'V6_vision_board', note: 'shared 11 g / 2.5 W vision board instead of NPU + preview sensor (mass +7.4 g, cap re-derived, power +1.7 W)', over: { ...vis, pNpu: COMPONENTS.visionCompute.W } },
    { id: 'V7_ld_minus30', note: 'L/D −30 % (shared glider rule)', over: { ldScale: 0.7 } },
    { id: 'V8_brakeX_0.3', note: 'extended-wing air brake only Δcd 0.3 instead of 0.6', over: { dcdBrakeX: 0.3 } },
    { id: 'V9_morph_slow', note: 'morph servo 2× slower (1.2 s full travel)', over: { morphRate: 0.83 } },
    { id: 'V10_estBias_x2', note: 'wind-estimate bias ±2 m/s instead of ±1 (gate still assumes ±1)', over: { estBias: 2 } },
    { id: 'V11_gateHist_2s', note: 'round-3 gate timing (2 s of estimate history)', over: { gateHist: 0 } },
    { id: 'V12_no_gate_margin', note: 'gate on the bare estimate (no ±1 m/s cross-slope box, no +0.4 m/s)', over: { gateBiasY: 0, gateWindMargin: 0 } },
    { id: 'V13_det_noise_x2.7', note: 'detector noise 8 % + pose bias 6 % at 8 Hz (vs 3 % + 3 % at 15 Hz)', over: { detSig: 0.08, detBias: 0.06, detHz: 8 } },
    { id: 'V14_ff_sigV_0.8', note: 'GNSS relative-velocity error 0.8 m/s (vs 0.3) in the framing feed-forward', over: { ffSigV: 0.8 } },
    { id: 'V15_no_ff', note: 'live framing without the velocity feed-forward (detections only, 0.6 Hz 2nd-order tracker)', over: { liveFF: 0, liveHz: 0.6 } },
    { id: 'V16_IDEAL_offline_truth', note: 'IDEALISED (not judged): round-3 offline crop on the true line of sight', over: { postFrame: 1 } },
    { id: 'V17_live_sensor_centre', note: 'sensor centre as output (no reframing)', over: { postFrame: 0 } },
    { id: 'V18_no_vision', note: 'no detector at all (UWB/GNSS/height pointing and framing only)', over: { vision: 0 } },
    { id: 'V19_eis_0.25', note: 'EIS residual 25 %', over: { eisRes: 0.25 } },
    { id: 'V20_glove_2.0', note: 'glove factor 2.0 on every hand element (vs 1.3)', over: { handling: { glove: 2.0 } } },
    { id: 'V21_stow_13.5s', note: 'auditor stress: pick-up/stow 13.5 s constant', over: { handling: { stowConst: 13.5 } } },
    { id: 'V22_stow_8s_r3', note: 'round-3 constant 8 s pick-up/stow', over: { handling: { stowConst: 8 } } },
    { id: 'V23_no_chase_radius_pull', note: 'round-3 lane (no follow-me radius pull) and no chase', over: { sepSoft: 99, chaseAfterPass: 0 } },
  ];
  const vjobs = VAR.flatMap((v) => SUB.map((id) => ({ id, over: v.over, opts: { fs: true }, v: v.id })));
  const vrows = await runJobs(vjobs);
  out.variants = { subset: SUB };
  for (const v of VAR) {
    const rs = vrows.filter((_, i) => vjobs[i].v === v.id);
    const pm = mean(rs.filter((x) => !x.noFly).map((x) => x.pMean));
    const p = { ...PDEF, ...v.over };
    out.variants[v.id] = { note: v.note, over: v.over, availMean: r3(mean(rs.map((x) => x.avail))), availTail: r3(mean(rs.filter((x) => x.dir === 'tail').map((x) => x.avail))), avail: Object.fromEntries(rs.map((x) => [x.id, r3(x.avail)])), noFly: rs.filter((x) => x.noFly).length,
      jitterP90: r3(pct(fin(rs.map((x) => x.fsSubject)), 0.9)), keMax: r3(Math.max(...rs.map((x) => x.keMax))), sepMaxFly: r3(Math.max(...rs.map((x) => x.sepMaxFly))), setupP90: r3(pct(rs.map((x) => x.setupTime), 0.9)), opsMax: Math.max(...rs.map((x) => x.ops)), ops3: rs.filter((x) => x.ops > 2).length,
      pxMed: r3(mean(rs.map((x) => x.pxMed))), endurance: r3(enduranceMin(p.battWh + p.bankWh * p.bankEff, pm, { heated: true })) };
    console.log('variant', v.id.padEnd(26), JSON.stringify(out.variants[v.id]).replace(/"avail":\{[^}]*\},/, '').slice(0, 300));
  }

  // ---- 5. rider-speed × wind envelope: analytic progress feasibility (the gate) and simulated spot checks
  const tanS = Math.tan((15 * Math.PI) / 180);
  const vT = [6, 8, 10, 12, 14];
  const prog = {}; for (const v of vT) { const sk = simulateSkier({ vTarget: v, v0: v, duration: 30 }); let vx = 0, k = 0; for (let i = 250; i < sk.n; i++) { vx += sk.col.vx[i]; k++; } prog[v] = vx / k; }
  out.envelope2D = { note: 'gate geometry: sustained track (≤2.5 m/s drift across the piste) with downhill progress ≥ the rider\'s, thrust + slope gravity, 1.12 v_stall floor (best of tucked/extended), 3-D ground speed ≤ vCapG − 0.3; downslope wind + = tail. Judged gate also adds +0.4 m/s and a ±1 m/s cross-slope box.', riderProgress: Object.fromEntries(vT.map((v) => [v, r3(prog[v])])),
    table: [-9, -6, -3, 0, 3, 4.5, 5.5, 6, 6.5, 7, 9].map((wx) => ({ downslopeWind: wx, vProgGlider: r3(progressFeasible({ ...PDEF }, [wx, 0, 0], tanS).vProg), vProgFixedWing: r3(progressFeasible({ ...PDEF, morph: 0 }, [wx, 0, 0], tanS).vProg), vProgR3: r3(progressFeasible({ ...PDEF, morph: 0, mass: MASS_KG_R3, S: 0.065, AR: 8.9, vCapG: designParams(MASS_KG_R3).vCapG }, [wx, 0, 0], tanS).vProg), fliesFor: Object.fromEntries(vT.map((v) => [v, progressFeasible({ ...PDEF }, [wx, 0, 0], tanS).vProg >= prog[v]])) })) };
  // first-principles tail-wind bound: straight downwind needs w + 1.12·v_stall ≤ (KE cap − 1.0)/√(1+tan²θ)
  const capH = (m) => (keSpeedCap(m) - 1.0) / Math.sqrt(1 + tanS * tanS);
  const vsx = aero(morphCfg(PDEF, 1)).vStall, vst = aero({ ...PDEF, morph: 0 }).vStall;
  out.tailBound = { note: 'max tail wind for a straight downwind lead under the KE cap (gate margins 1.0 m/s): w_max = (√(2·14.9/m) − 1.0)/cos θ·… − 1.12 v_stall', extended: { vStall: r3(vsx), wMax: r3(capH(MASS_KG) - 1.12 * vsx) }, tucked: { vStall: r3(vst), wMax: r3(capH(MASS_KG) - 1.12 * vst) }, round3: { vStall: r3(aero({ ...PDEF, morph: 0, mass: MASS_KG_R3, S: 0.065, AR: 8.9 }).vStall), wMax: r3(capH(MASS_KG_R3) - 1.12 * aero({ ...PDEF, morph: 0, mass: MASS_KG_R3, S: 0.065, AR: 8.9 }).vStall) },
    convexHullProgress: Object.fromEntries([6, 7, 9].map((w) => [w, r3((capH(MASS_KG) ** 2 - (1.12 * vsx) ** 2 + w * w) / (2 * w))])), convexHullNote: 'upper bound on mean downhill progress by alternating crab legs on the cap circle (no turn losses): (c² − Va² + w²)/(2w); rider needs ≈10.9 m/s', requiredVStallFor9: r3(Math.sqrt(Math.max(0, capH(MASS_KG) ** 2 + 81 - 2 * 9 * 10.9)) / 1.12) };
  console.log('tailBound', JSON.stringify(out.tailBound));
  const SPEED_CASES = ['calm_s11', 'head3_s13', 'tail3_s11', 'crossL6_s12', 'tail5.5_s11', 'head9_s12'];
  const sjobs = [7, 9, 11, 12, 13, 14].flatMap((v) => SPEED_CASES.map((id) => ({ id, opts: { skier: { vTarget: v, v0: v }, fs: false }, v })));
  const srows = await runJobs(sjobs);
  out.riderSpeed = [7, 9, 11, 12, 13, 14].map((v) => { const rs = srows.filter((_, i) => sjobs[i].v === v); return { vTarget: v, availMean: r3(mean(rs.map((x) => x.avail))), avail: Object.fromEntries(rs.map((x) => [x.id, r3(x.avail)])), noFly: rs.filter((x) => x.noFly).length, keMax: r3(Math.max(...rs.map((x) => x.keMax))), sepMaxFly: r3(Math.max(...rs.map((x) => x.sepMaxFly))), opsMax: Math.max(...rs.map((x) => x.ops)) }; });
  for (const x of out.riderSpeed) console.log('  rider vTarget', x.vTarget, JSON.stringify(x.avail), 'ke', x.keMax, 'sep', x.sepMaxFly, 'ops', x.opsMax);

  // ---- 6. dt convergence
  out.dtConvergence = [0.01, 0.005, 0.0025].map((dt) => {
    const prep = fullrunInput(caseById('calm_s11'));
    const core = runCore({ ...PDEF, ...D }, { ...prep.input, dt });
    const tds = core.touchdowns;
    return { dt, perches: core.perchCount, tdKEmax: r3(Math.max(...tds.map((d) => d.ke))), firstPerchT: r3(core.events.find((e) => e.type === 'perch' && e.t > 10)?.t) };
  });
  console.log('dt', JSON.stringify(out.dtConvergence));

  // ---- 7. bystander exposure (Poisson, ASSUMED densities)
  const perchS = mean(flown.map((x) => x.perchS)), flyS = mean(flown.map((x) => x.flyS));
  out.exposure = { perRun: { perchedS: r3(perchS), flyingS: r3(flyS) }, note: 'expected other-skier passes per run, rate = density × 10 m/s × 2r × time; densities ASSUMED; detection 80 % ASSUMED', table: exposure({ perchS, flyS }) };

  // ---- 8. airframe / mass / camera / handling facts
  const p = { ...PDEF };
  const aT = aero(p), aX = aero(morphCfg(p, 1));
  const sensV = 2 * Math.atan(Math.tan((p.camHfov * Math.PI) / 360) / p.camAspect);
  const H = FULLRUN_CASES_R4.map((c) => handling(c.seed));
  out.airframe = {
    bom: BOM.map((b) => ({ id: b.id, g: b.g * (b.n || 1), W: b.W * (b.n || 1), src: b.src || b.note || '' })), bomVision: BOM_VISION.map((b) => ({ id: b.id, g: b.g * (b.n || 1), W: b.W * (b.n || 1) })), bomR3: BOM_R3.map((b) => ({ id: b.id, g: b.g * (b.n || 1) })),
    sum_g: BUDGET.g, margin: 0.15, mass_g: r3(MASS_KG * 1000), massVision_g: r3(MASS_KG_VISION * 1000), massR3_g: r3(MASS_KG_R3 * 1000), keSpeedCap: r3(KE_CAP), vCapG: p.vCapG, limiterTarget: r3(p.vCapG - 0.6),
    tucked: { S: p.S, span: r3(aT.span), chord: r3(aT.chord), vStall: r3(aT.vStall), LD: Object.fromEntries([10, 12, 15, 20].map((v) => [v, r3(ldAt(p, v))])) },
    extended: { S: p.Sx, span: r3(aX.span), chord: r3(aX.chord), clmax: p.clmaxX, vStall: r3(aX.vStall), vaFloor: r3(1.12 * aX.vStall), LD: Object.fromEntries([6, 8, 10, 12].map((v) => [v, r3(ldAt(morphCfg(p, 1), v))])), Re6: Math.round((6 * aX.chord) / 1.67e-5), dcdBrake: p.dcdBrakeX },
    morph: { rate: p.morphRate, tau: p.morphTau, VaLo: p.morphVaLo, VaHi: p.morphVaHi, src: 'LisHawk: Ajanic et al. 2020, Science Robotics 5:eabc2897 (wing 0.117 → 0.165 m², min speed 7.6 → 4.0 m/s)' },
    staticMotorW: r3(motorPower(p, p.T0, 0)),
    camera: { rows: p.camRows, hfov: p.camHfov, sensorVfov: r3((sensV * 180) / Math.PI), pxPerRad: r3(p.camRows / sensV) },
    tracking: { detHz: p.detHz, detLat: p.detLat, detSig: p.detSig, detBias: p.detBias, liveHz: p.liveHz, liveFF: p.liveFF, ffLat: p.ffLat, ffSigV: p.ffSigV, pointing: { uwbSigDeg: p.uwbSigDeg, gnssRelM: p.gnssRelM, hErrM: p.hErrM, vision: p.vision, visSigDeg: p.visSigDeg, pDet: p.pDet } },
    handling: { model: 'MODAPTS (1 MOD = 0.129 s), glove ×1.3 on hand elements, boot ×1.2 on bending, ±15 % scatter, grasp miss 8 %, snap miss 15 %', setDown: st(H.map((h) => h.setDown)), rise: st(H.map((h) => h.rise)), stow: st(H.map((h) => h.stow)) },
    perRun: PER_RUN,
  };
  writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 1));
  console.log('wrote results.json and ensemble.js');
}
