// Audit2 (round 2, iteration 2) independent re-check of kite2 (K2-R).
// Runs against a COPY of sim/ (never the originals):
//   node recheck.mjs [SIMCOPY_ROOT] [--sens]
// SIMCOPY_ROOT = folder that contains sim/ and research/concepts_2026_10_19/dev (default: env K2COPY or the
// auditor's scratchpad copy). Writes out_recheck.json next to this script.
// Part A: full 39-case rerun with the developer's evaluateCase → diff vs dev/kite2/ensemble_rows.json.
// Part B: spot cases recomputed from the RAW time series (core.O, rider samples, simulateRun riding column)
//         with the auditor's own metric code; footageStability(R) from common/criteria.js on the Result.
// Part C (--sens): extra ensembles (L/D 0.9 / 0.95, funnel acceptance 60°, KE with all non-docked modes).
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2]
  : (process.env.K2COPY || '/tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/k2copy');
if (ROOT.startsWith('/root/ai-workspace/flySelfie') && !process.env.ALLOW_LIVE) throw new Error('refusing to run against the live repo; pass a copy');
const SENS = process.argv.includes('--sens');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const K2 = await imp('sim/js/concepts/kite2/index.js');
const M = await imp('sim/js/concepts/kite2/model.js');
const AN = await imp('sim/js/concepts/kite2/analysis.js');
const CR = await imp('sim/js/concepts/common/criteria.js');
const FR = await imp('sim/js/concepts/common/fullrun.js');
const CO = await imp('sim/js/concepts/common/components.js');
const SK = await imp('sim/js/concepts/common/skier.js');
const concept = K2.default;
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v);
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
const claimedRows = JSON.parse(readFileSync(join(ROOT, 'research/concepts_2026_10_19/dev/kite2/ensemble_rows.json'), 'utf8')).rows;
const out = { generated: new Date().toISOString(), simCopy: ROOT, modelVersion: concept.modelVersion };

// ---------------------------------------------------------------- A. full rerun with their evaluateCase
const rows = [];
for (const c of FR.FULLRUN_CASES) rows.push(K2.evaluateCase(P, c));
const KEYS = ['avail', 'setupTime', 'ops', 'bodyForcePeak', 'keMax', 'endurance', 'pxMed', 'jitterRms'];
let maxDiff = 0; const diffs = [];
for (const r of rows) {
  const c = claimedRows.find((x) => x.id === r.id);
  for (const k of KEYS) { const d = Math.abs((r[k] ?? 0) - (c[k] ?? 0)); if (d > 0.002) diffs.push({ id: r.id, k, claimed: c[k], rerun: r3(r[k]) }); maxDiff = Math.max(maxDiff, d); }
}
const S = K2.summarise(rows);
out.rerun = { cases: rows.length, maxAbsDiff: r3(maxDiff), diffs, metrics: { avail: S.metrics.avail, setupTime: S.metrics.setupTime, ops: S.metrics.ops, bodyForcePeak: S.metrics.bodyForcePeak, keMax: S.metrics.keMax, endurance: S.metrics.endurance, pxMed: S.metrics.pxMed, jitterRms: S.metrics.jitterRms, viewElev: S.metrics.viewElev, lineH1min: S.metrics.lineH1min, collapses: S.metrics.collapses, manual: S.metrics.manual } };
console.log('A rerun maxDiff', maxDiff, 'diffs', diffs.length);

// ---------------------------------------------------------------- B. independent recomputation on spot cases
const SPOT = process.argv.includes('--all') || process.argv.includes('--sens') ? [] : ['calm_s11', 'head3_s13', 'tail3_s12', 'crossL3_s11', 'tail6_s13', 'crossR6_s12', 'head9_s12', 'tail9_s12', 'tail9_s13', 'crossL9_s12'];
const { MODE } = M;
function capsDist(Kp, caps) { let d = Infinity; for (const [a, b, r] of caps) d = Math.min(d, AN.segSeg(Kp, Kp, a, b) - r); return d; }
function independent(c, over = {}, opts = {}) {
  const sc = { id: 'fullrun', rider: 'fullrun', runSeed: c.seed, dt: 0.002, wind: { mean: c.mean, intensity: c.intensity ?? 0.15, Lu: 28, seed: c.seed }, plan: { start: 'docked', armAt: 0 } };
  const prep = K2.prepare({ ...P, ...over }, sc);
  const core = M.runCore(prep.p, prep.input);
  const A = AN.analyse(core, { fc: prep.p.cropFc ?? 1.0 });
  const O = core.O, n = core.n, dt = 0.02, p = core.p;
  const run = FR.simulateRun({ seed: c.seed }); // same rider as riderFor('fullrun')
  // --- avail over riding time (fullrun col.riding) from t = 0, no settle; refused launch counts 0
  let ride = 0, okN = 0, ride2 = 0, ok2 = 0;
  for (let i = 0; i < n; i++) {
    const s = core.RS[i];
    const ok = A.filming[i] === 1 && A.inFrame[i] === 1 && A.subjectPx[i] >= 300 && !(A.art[i] >= 3);
    if (run.col.riding[Math.min(run.n - 1, i)] === 1) { ride++; if (ok) okN++; }
    if (s.speed > 2 && !s.fallen) { ride2++; if (ok) ok2++; }
  }
  // --- KE: kite ground-frame KE if >1.5 m from ANY body capsule, rider-frame KE within; every non-docked sample (incl. STOW slide-in)
  let keG = 0, keGfly = 0;
  for (let i = 0; i < n; i++) {
    const md = O.mode[i]; if (md === MODE.DOCKED) continue;
    const s = core.RS[i]; const Kp = [O.kx[i], O.ky[i], O.kz[i]], vk = [O.kvx[i], O.kvy[i], O.kvz[i]];
    if (!Kp.every(Number.isFinite)) continue;
    const d = capsDist(Kp, M.bodyCapsules(s, core.RB[i]));
    const keS = 0.5 * p.mass * (vk[0] ** 2 + vk[1] ** 2 + vk[2] ** 2);
    const rv = [vk[0] - s.vel[0], vk[1] - s.vel[1], vk[2] - s.vel[2]], keR = 0.5 * p.mass * (rv[0] ** 2 + rv[1] ** 2 + rv[2] ** 2);
    const ke = d > 1.5 ? keS : keR; keG = Math.max(keG, ke);
    if (md !== MODE.STOW) keGfly = Math.max(keGfly, ke);
  }
  // --- body force: 50 ms moving mean of the line tension (20 ms grid: trapezoid over 3 samples) and the raw sub-sample max
  let F50 = 0, Fraw = 0;
  for (let i = 2; i < n; i++) { const v = (0.5 * O.T[i - 2] + O.T[i - 1] + 0.5 * O.T[i]) / 2; if (Number.isFinite(v)) F50 = Math.max(F50, v); }
  for (let i = 0; i < n; i++) if (Number.isFinite(O.Tmax[i])) Fraw = Math.max(Fraw, O.Tmax[i]);
  // --- actions from the event log: arm tap + every manual push-in/pick-up/give-up + stow taps + losses
  const evc = (t) => core.events.filter((e) => e.type === t).length;
  // a give-up (kite flagged onto the snow) and its later hand pick-up are ONE intervention
  const gu = core.events.filter((e) => e.type === 'giveUp').map((e) => e.t);
  const pickNotAfterGiveUp = core.events.filter((e) => e.type === 'pickedUp' && !gu.some((g) => e.t >= g && e.t - g < 15)).length;
  const nManual = evc('manualStow') + evc('giveUp') + pickNotAfterGiveUp;
  const ops = 1 + evc('stowcmd') + nManual + (evc('release') + evc('cut') > 0 ? 1 : 0);
  // --- standstill: arm 2 s + for EVERY stop, time the rider must wait after stopping until the kite is stowed IF the rider
  //     must stay (end stop: always; mid stop: only if the kite is not stowed before the rest ends) + 15 s per manual action
  let wait = 0; const stopsDetail = [];
  for (const [k, st] of run.stops.entries()) {
    const last = k === run.stops.length - 1;
    const stowT = core.dockInfo.stowT.find((x) => x >= st.t0 - 5 && x <= st.t1 + 30);
    const w = stowT != null ? Math.max(0, stowT - st.t0) : (last ? st.t1 - st.t0 + 10 : 0);
    const counted = last ? w : Math.max(0, w - (st.t1 - st.t0));
    stopsDetail.push({ t0: r3(st.t0), t1: r3(st.t1), stowT: r3(stowT ?? NaN), waitS: r3(w), counted: r3(counted) });
    wait += counted;
  }
  const setup = 2 + wait + 15 * nManual;
  // --- energy from raw power columns (kite cell via 90 % charge, winch incl./excl. regeneration, pod 0.6 W, heater)
  const Pk = mean(Array.from(O.Pk)), Pw = mean(Array.from(O.Pw)), PwPos = mean(Array.from(O.Pw).map((v) => Math.max(0, v)));
  const wh = p.packWh + p.podWh;
  const endur = CO.enduranceMin(wh, Pk / 0.9 + Pw + p.pPack, { heated: true });
  const endurNoRegen = CO.enduranceMin(wh, Pk / 0.9 + PwPos + p.pPack, { heated: true });
  const packG = CO.packWh(1000) ? (p.packWh / CO.BATTERY.whPerKgPack) * 1000 : NaN;
  // --- footage stability on the full Result object (shared independent metric)
  const R = opts.noFs ? null : concept.simulate({ ...P, ...over }, { ...concept.scenarios.find((s) => s.id === 'fullrun'), wind: sc.wind, runSeed: c.seed });
  const fs = R ? CR.footageStability(R) : { subjectRms: NaN, backgroundRms: NaN, samples: 0 };
  const landed = evc('landed'), relift = evc('relift');
  const tLanded = (() => { let k = 0; for (let i = 0; i < n; i++) if (O.mode[i] === MODE.LANDED && run.col.riding[Math.min(run.n - 1, i)] === 1) k++; return k * dt; })();
  return {
    id: c.id, U: c.U, dir: c.dir,
    recomputed: { availRiding: r3(100 * okN / ride), availSpeedGt2NoSettle: r3(100 * ok2 / ride2), keMax: r3(keG), keMaxExclStow: r3(keGfly), bodyForce50ms: r3(F50), tensionRawMax: r3(Fraw), ops, setupTime: r3(setup), stops: stopsDetail, manual: nManual, endurance: r3(endur), enduranceNoRegenCredit: r3(endurNoRegen), pMeanW: r3(Pk / 0.9 + Pw + p.pPack), packG: r3(packG), landedEvents: landed, reliftEvents: relift, landedWhileRidingS: r3(tLanded), collapses: core.nCollapse, redock: evc('redock') },
    footageStability: { subjectRms: r3(fs.subjectRms), backgroundRms: r3(fs.backgroundRms), samples: fs.samples, fullrunResultAvail: R ? r3(R.metrics.find((m) => m.id === 'avail').value) : null },
  };
}
out.spot = [];
for (const id of SPOT) {
  const c = FR.FULLRUN_CASES.find((x) => x.id === id);
  const cl = claimedRows.find((x) => x.id === id);
  const r = independent(c);
  r.claimed = { avail: cl.avail, setupTime: cl.setupTime, ops: cl.ops, bodyForcePeak: cl.bodyForcePeak, keMax: cl.keMax, endurance: cl.endurance, manual: cl.manual, landed: cl.landed, collapses: cl.collapses };
  out.spot.push(r);
  console.log(id, JSON.stringify(r.claimed), '\n   ->', JSON.stringify(r.recomputed).slice(0, 400), JSON.stringify(r.footageStability));
}

// ---------------------------------------------------------------- B2. independent metrics on ALL 39 cases (no footage pass)
if (process.argv.includes('--all')) {
  const all = FR.FULLRUN_CASES.map((c) => ({ ...independent(c, {}, { noFs: true }), claimed: claimedRows.find((x) => x.id === c.id) }));
  const col = (f) => all.map(f);
  const pct = FR.pct;
  out.allIndependent = {
    availRidingMean: r3(mean(col((x) => x.recomputed.availRiding))), availRidingP10: r3(pct(col((x) => x.recomputed.availRiding), 0.1)),
    byU: Object.fromEntries([0, 3, 6, 9].map((U) => [`U${U}`, { availRiding: r3(mean(all.filter((x) => x.U === U).map((x) => x.recomputed.availRiding))), availClaimed: r3(mean(all.filter((x) => x.U === U).map((x) => x.claimed.avail))) }])),
    byDir: Object.fromEntries(['calm', 'head', 'tail', 'crossL', 'crossR'].map((d) => [d, r3(mean(all.filter((x) => x.dir === d).map((x) => x.recomputed.availRiding)))])),
    setupP90: r3(pct(col((x) => x.recomputed.setupTime), 0.9)), setupMax: r3(Math.max(...col((x) => x.recomputed.setupTime))),
    opsP90: pct(col((x) => x.recomputed.ops), 0.9), opsMax: Math.max(...col((x) => x.recomputed.ops)), opsShareAbove2: r3(100 * all.filter((x) => x.recomputed.ops > 2).length / all.length),
    F50max: r3(Math.max(...col((x) => x.recomputed.bodyForce50ms))), tensionRawMax: r3(Math.max(...col((x) => x.recomputed.tensionRawMax))), casesRawOver40N: all.filter((x) => x.recomputed.tensionRawMax > 40).map((x) => x.id),
    keMax: r3(Math.max(...col((x) => x.recomputed.keMax))), enduranceMean: r3(mean(col((x) => x.recomputed.endurance))), enduranceNoRegenMean: r3(mean(col((x) => x.recomputed.enduranceNoRegenCredit))),
    casesWithLandingWhileRiding: all.filter((x) => x.recomputed.landedWhileRidingS > 0).length, landedEventsTotal: all.reduce((a, x) => a + x.recomputed.landedEvents, 0), reliftTotal: all.reduce((a, x) => a + x.recomputed.reliftEvents, 0),
    rows: all.map((x) => ({ id: x.id, availRiding: x.recomputed.availRiding, availClaimed: x.claimed.avail, setup: x.recomputed.setupTime, setupClaimed: x.claimed.setupTime, ops: x.recomputed.ops, opsClaimed: x.claimed.ops, F50: x.recomputed.bodyForce50ms, Fclaimed: x.claimed.bodyForcePeak, Traw: x.recomputed.tensionRawMax, ke: x.recomputed.keMax, end: x.recomputed.endurance, landedS: x.recomputed.landedWhileRidingS, relift: x.recomputed.reliftEvents })),
  };
  console.log('ALL', JSON.stringify({ ...out.allIndependent, rows: undefined }));
}
// ---------------------------------------------------------------- C. sensitivities (full 39 cases)
if (SENS) {
  out.sens = {};
  const SV = [['gMaxR_0.90', { gMaxR: 0.9 }], ['gMaxR_0.95', { gMaxR: 0.95 }], ['funnelAcc_60', { funnelAcc: 60 }], ['funnelAcc_90', { funnelAcc: 90 }], ['gMaxR_0.9_mass_+15pct', { gMaxR: 0.9, mass: +(M.PDEF.mass * 1.15).toFixed(4) }]];
  for (const [nm, over] of SV) {
    const rr = FR.FULLRUN_CASES.map((c) => K2.evaluateCase({ ...P, ...over }, c));
    const s = K2.summarise(rr).metrics;
    out.sens[nm] = { over, avail: s.avail.mean, availP10: s.avail.p10, setupP90: s.setupTime.p90, opsP90: s.ops.p90, opsMax: s.ops.max, Fmax: s.bodyForcePeak.max, keMax: s.keMax.max, endurance: s.endurance.mean, viewElevMean: s.viewElev.mean,
      judgedPass: s.avail.mean >= 80 && s.setupTime.p90 <= 30 && s.ops.p90 <= 2 && s.bodyForcePeak.max <= 40 && s.keMax.max <= 14.9 && s.endurance.mean >= 45 };
    console.log('sens', nm, JSON.stringify(out.sens[nm]));
  }
}
writeFileSync(join(here, SENS ? 'out_recheck_sens.json' : process.argv.includes('--all') ? 'out_recheck_all.json' : 'out_recheck.json'), JSON.stringify(out, null, 1));
console.log('wrote');
