// Audit2 (round 2, iteration 2) independent re-check of towglider@0.3.0.
// Runs against a COPY of sim/ (arg 1 or env SIMROOT; default: the auditor's scratchpad copy).
// Does not modify any file outside this folder. Numerical-uncalibrated simulation, not a physical test.
//   node recheck.mjs [SIMROOT] [--quick]
// Writes out_recheck.json next to this script.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as presolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SIMROOT = presolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : (process.env.SIMROOT || '/tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/tgcopy/sim'));
const quick = process.argv.includes('--quick');
const imp = (p) => import(pathToFileURL(join(SIMROOT, p)).href);
const concept = (await imp('js/concepts/towglider/index.js')).default;
const TG = await imp('js/concepts/towglider/index.js');
const { FULLRUN_CASES, FULLRUN_PLAN, pct } = await imp('js/concepts/common/fullrun.js');
const { footageStability, CRITERIA } = await imp('js/concepts/common/criteria.js');
const { footage } = await imp('js/concepts/common/env.js');
const { bodyPoints } = await imp('js/concepts/common/skier.js');
const { BATTERY, COMPONENTS, MASS_MARGIN, budget } = await imp('js/concepts/common/components.js');
const { STAB } = await imp('js/concepts/towglider/attitude.js');
const { MODES } = await imp('js/concepts/towglider/analysis.js');
const { gliderBudget, powerChain, HIP, LINE, WORN } = await imp('js/concepts/towglider/design.js');

const claimed = JSON.parse(readFileSync(join(SIMROOT, '../research/concepts_2026_10_19/dev/towglider/results.json'), 'utf8'));
const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
const TGO = 1.5, SDT = 0.02;

// ---------------------------------------------------------------- independent per-case recomputation from raw series
function recompute(R, c) {
  const core = R.core, O = core.O, n = core.n, A = R.an.cols, sk = core.rider ? null : null;
  const p = core.p;
  // riding mask from the shared full run (col.riding), shifted by the 1.5 s pre-roll
  const skRun = R._sk;
  const riding = new Uint8Array(n), speed2 = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const ts = i * SDT - TGO; const j = Math.round(ts / skRun.sampleDt);
    riding[i] = ts >= 0 && j < skRun.n ? skRun.col.riding[j] : 0;
    const s = core.rider(i * SDT); speed2[i] = s.speed > 2 && !s.fallen ? 1 : 0;
  }
  // footage from the published productCam (independent of the concept's own footage call)
  let okR = 0, denR = 0, okS = 0, denS = 0, okStrict = 0, pxs = [];
  for (let i = 0; i < n; i++) {
    if (!riding[i] && !speed2[i]) continue;
    const f = R.frame(i * SDT);
    let ok = false, okNoArt = false;
    if (f.productCam) {
      const g = footage({ pos: f.productCam.pos, kind: 'rect', fwd: f.productCam.fwd, up: [0, 0, 1], vfovDeg: f.productCam.vfovDeg, w: 1920, h: 1080 }, f.skier);
      if (g.inFrame) pxs.push(g.subjectPx);
      ok = g.inFrame === 1 && g.subjectPx >= 300;
      const art = A.art[i];
      okNoArt = ok && !(art >= 3);
      ok = ok && !(art > 0); // strict criterion: no ≥1 px-wide line segment of any length over the subject
    }
    if (riding[i]) { denR++; if (okNoArt) okR++; if (ok) okStrict++; }
    if (speed2[i]) { denS++; if (okNoArt) okS++; }
  }
  // KE: ground frame beyond 1.5 m of the rider (closest body point incl. head), rider frame within; holster modes excluded
  let keMax = 0, keMaxAll = 0;
  for (let i = 0; i < n; i++) {
    const md = MODES[O.mode[i]];
    if (['stowed', 'docked', 'seat'].includes(md)) continue;
    const s = core.rider(i * SDT), b = bodyPoints(s);
    const g = [O.gx[i], O.gy[i], O.gz[i]], v = [O.gvx[i], O.gvy[i], O.gvz[i]];
    const d = Math.min(...['head', 'pelvis', 'chest', 'feet'].filter((k) => b[k]).map((k) => Math.hypot(g[0] - b[k][0], g[1] - b[k][1], g[2] - b[k][2])));
    const keG = 0.5 * p.mass * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
    const rv = [v[0] - s.vel[0], v[1] - s.vel[1], v[2] - (s.vel[2] || 0)];
    const keR = 0.5 * p.mass * (rv[0] ** 2 + rv[1] ** 2 + rv[2] ** 2);
    keMax = Math.max(keMax, d > 1.5 ? keG : keR); keMaxAll = Math.max(keMaxAll, keG);
  }
  // body force: 50 ms moving mean (boxcar over 0.05 s, linear interpolation of the 20 ms samples) of the hip line tension
  let F50 = 0;
  for (let i = 3; i < n; i++) { const m = (0.5 * O.Thip[i - 3] + O.Thip[i - 2] + O.Thip[i - 1] + 0.5 * O.Thip[i]) / 3; /* 60 ms trapezoid */ F50 = Math.max(F50, m); }
  let Fpk = 0; for (let i = 0; i < n; i++) Fpk = Math.max(Fpk, O.Thip[i]);
  const capV = core.info.captureV; const Fcap = Number.isFinite(capV) ? (p.mass * capV * capV) / (2 * 0.15) : 0;
  // user actions from events
  const ev = core.events.map((e) => e.type);
  const arms = ev.filter((e) => e === 'arm').length, rel = ev.filter((e) => e === 'release').length, cut = ev.includes('cut'), gated = ev.includes('gate');
  const docked = Number.isFinite(core.info.tDocked);
  const lastStop = skRun.stops[skRun.stops.length - 1];
  const tStill = TGO + lastStop.t0;
  const stand = docked ? core.info.tDocked - tStill : NaN;
  const lost = !gated && (rel > 0 || cut || !docked);
  let walk = 0;
  if (lost) { const r = core.rider(tStill).pos; walk = Math.hypot(O.gx[n - 1] - r[0], O.gy[n - 1] - r[1]) / 0.7 + 20; }
  // ops: arm tap + (if lost) walk-to + re-clip/insert; a gated run still needs the arm tap AND a disarm/holster check is not modelled
  const ops = arms + (lost ? 2 : 0);
  const setup = 1 + (docked ? stand : 0) + walk;
  // energy: glider electrical load by mode through the 48 V chain, reel mechanical power
  const Wg = gliderBudget('panEIS', p.S).W;
  let E = 0, film = 0;
  for (let i = 0; i < n; i++) {
    const md = MODES[O.mode[i]];
    const w = ['stowed', 'docked', 'seat'].includes(md) ? 0.05 : ['park', 'landed', 'snowpull', 'drop', 'sled'].includes(md) ? 1.5 : Wg;
    E += (powerChain(w).hipIn + (O.Preel[i] || 0) / 0.6) * SDT;
    if (A.filming[i] === 1 && core.rider(i * SDT).speed > 2) film += SDT;
  }
  const fs = footageStability(R);
  return {
    availRiding: denR ? (100 * okR) / denR : NaN, availRidingStrictArt: denR ? (100 * okStrict) / denR : NaN, availSpeed2: denS ? (100 * okS) / denS : NaN,
    ridingS: denR * SDT, pxMed: pct(pxs, 0.5), keMax, keMaxGroundAll: keMaxAll, bodyForce60msTrap: Math.max(F50, Fcap), hipTensionRawPeak: Fpk, setup, ops, gated, releases: rel, cut, docked, stand, walkS: walk,
    E_Wh: E / 3600, filmS: film, footageStability: { subjectRms: fs.subjectRms, backgroundRms: fs.backgroundRms, samples: fs.samples },
  };
}

function runCase(c, { plan = null, params = P } = {}) {
  const over = plan ? { run: { plan, seed: c.seed } } : {};
  const sc = TG.fullrunScenario(c, over);
  const R = concept.simulate(params, sc);
  // the simulated full run (simulateRun is deterministic in plan+seed): rebuild for the riding mask
  return R;
}
const { simulateRun } = await imp('js/concepts/common/fullrun.js');
const RUN_PLAN_DEV = [{ ride: 38, preset: 'recreationalCarve' }, { hold: 20 }, { ride: 33, preset: 'recreationalCarve' }, { hold: 30 }];

const out = { generated: new Date().toISOString(), simRoot: SIMROOT, modelVersion: concept.modelVersion, evidence: 'audit2 independent re-run of numerical-uncalibrated simulation; not a physical test' };

// ---------------------------------------------------------------- 1. full ensemble re-run (developer definitions) vs results.json
const rows = [];
const cmpKeys = ['avail', 'setupTime', 'ops', 'bodyForcePeak', 'keMax', 'pxMed', 'jitterRms', 'azRange', 'E', 'filmS'];
const claimRows = Object.fromEntries(claimed.ensemble.rows.map((r) => [r.id, r]));
let maxDiff = {};
for (const c of (quick ? FULLRUN_CASES.filter((x) => x.seed === 12) : FULLRUN_CASES)) {
  const r = TG.evaluateCase(P, c);
  rows.push(r);
  for (const k of cmpKeys) { const a = r[k], b = claimRows[c.id]?.[k]; if (Number.isFinite(a) && Number.isFinite(b)) maxDiff[k] = Math.max(maxDiff[k] || 0, Math.abs(a - b)); }
}
const st = TG.ensembleStats(rows);
out.fullEnsembleRerun = { cases: rows.length, maxAbsDiffVsClaimedRows: Object.fromEntries(Object.entries(maxDiff).map(([k, v]) => [k, r3(v)])),
  stats: { availMean: r3(st.avail.mean), availP10: r3(st.avail.p10), setupP90: r3(st.setupTime.p90), setupMax: r3(st.setupTime.max), opsP90: st.ops.p90, opsMax: st.ops.max, bodyForceMax: r3(st.bodyForcePeak.max), keMax: r3(st.keMax.max), endurance: r3(st.endurance.mean), jitterP90: r3(st.jitterRms.p90), jitterMax: r3(st.jitterRms.max), pxMedMean: r3(st.pxMed.mean), azRangeMean: r3(st.azRange.mean), counts: st.counts },
  claimed: { availMean: claimed.ensemble.stats.avail.mean, setupP90: claimed.ensemble.stats.setupTime.p90, opsP90: claimed.ensemble.stats.ops.p90, bodyForceMax: claimed.ensemble.stats.bodyForcePeak.max, keMax: claimed.ensemble.stats.keMax.max, endurance: claimed.ensemble.stats.endurance.mean, jitterP90: claimed.ensemble.stats.jitterRms.p90 } };
// gated cases inflate the setup sample with 1 s values: p90 without them
const ng = rows.filter((r) => !r.gated);
out.fullEnsembleRerun.setupP90_excludingGated = r3(pct(ng.map((r) => r.setupTime), 0.9));
out.fullEnsembleRerun.availInEnvelope_notGated = r3(mean(ng.map((r) => r.avail)));
out.fullEnsembleRerun.byWind = Object.fromEntries([0, 3, 6, 9].map((U) => [`U${U}`, r3(mean(rows.filter((r) => r.U === U).map((r) => r.avail)))]));
out.fullEnsembleRerun.byWindNotGated = Object.fromEntries([0, 3, 6, 9].map((U) => [`U${U}`, r3(mean(rows.filter((r) => r.U === U && !r.gated).map((r) => r.avail)))]));
out.fullEnsembleRerun.jitterOverall = { note: 'jitter p90 over the 33 flown cases; criteria.js jitterRms has no ensemble stat; brief says p90', p90: r3(st.jitterRms.p90), max: r3(st.jitterRms.max), worstCase: rows.filter((r) => Number.isFinite(r.jitterRms)).sort((a, b) => b.jitterRms - a.jitterRms)[0]?.id };
out.fullEnsembleRerun.releasedCases = rows.filter((r) => r.releases > 0 || r.cut).map((r) => ({ id: r.id, setupTime: r3(r.setupTime), ops: r.ops, pickUp: r3(r.pickUp) }));
console.log('ensemble', JSON.stringify(out.fullEnsembleRerun.stats), 'diffs', JSON.stringify(out.fullEnsembleRerun.maxAbsDiffVsClaimedRows));

// ---------------------------------------------------------------- 2. spot cases: independent recomputation from raw time series
const SPOT = ['calm_s11', 'head3_s12', 'crossL3_s13', 'tail3_s11', 'crossR6_s12', 'head6_s13', 'tail6_s12', 'crossL9_s11', 'crossR9_s13', 'head9_s12', 'tail9_s11', 'tail9_s13'];
// add the released case(s)
for (const x of out.fullEnsembleRerun.releasedCases) if (!SPOT.includes(x.id)) SPOT.push(x.id);
out.spotCases = [];
for (const id of SPOT) {
  const c = FULLRUN_CASES.find((x) => x.id === id);
  const R = runCase(c);
  R._sk = simulateRun({ plan: RUN_PLAN_DEV, seed: c.seed });
  const k = recompute(R, c);
  const cr = claimRows[id];
  out.spotCases.push({ id, U: c.U, dir: c.dir,
    claimed: { avail: cr.avail, setupTime: cr.setupTime, ops: cr.ops, keMax: cr.keMax, bodyForcePeak: cr.bodyForcePeak, pxMed: cr.pxMed, jitterRms: cr.jitterRms, E_Wh: r3(cr.E / 3600), filmS: cr.filmS, gated: cr.gated },
    recomputed: Object.fromEntries(Object.entries(k).filter(([kk]) => kk !== 'footageStability').map(([kk, v]) => [kk, r3(v)])),
    footageStability: { subjectRms: r3(k.footageStability.subjectRms), backgroundRms: r3(k.footageStability.backgroundRms), samples: k.footageStability.samples } });
  console.log('spot', id, JSON.stringify(out.spotCases.at(-1).recomputed));
}

// ---------------------------------------------------------------- 3. unmodified shared FULLRUN_PLAN (final hold 10 s, not 30 s)
const sharedRows = [];
for (const c of (quick ? FULLRUN_CASES.filter((x) => x.seed === 12) : FULLRUN_CASES)) {
  const R = runCase(c, { plan: FULLRUN_PLAN });
  sharedRows.push({ id: c.id, U: c.U, gated: R.summary.gated, avail: R.summary.avail, setupTime: R.summary.setupTime, ops: R.summary.ops, finalStand: R.summary.finalStand, docked: Number.isFinite(R.core.info.tDocked) });
}
out.sharedPlanRerun = {
  note: 'FULLRUN_PLAN exactly as in common/fullrun.js (final hold 10 s). Stows not completed by the end of the hold are counted as the developer\'s own accounting does (walk-up + re-clip, ops +2).',
  availMean: r3(mean(sharedRows.map((r) => r.avail))), setupP90: r3(pct(sharedRows.map((r) => r.setupTime), 0.9)), opsP90: pct(sharedRows.map((r) => r.ops), 0.9), opsMax: Math.max(...sharedRows.map((r) => r.ops)),
  dockedWithin10s: sharedRows.filter((r) => r.docked).length, cases: sharedRows.length, gated: sharedRows.filter((r) => r.gated).length,
  rows: sharedRows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r3(v)]))),
};
console.log('shared plan', JSON.stringify({ ...out.sharedPlanRerun, rows: undefined }));

// ---------------------------------------------------------------- 4. sensitivities on a 6-case flown subset
const SUB = ['calm_s11', 'head3_s12', 'crossL3_s13', 'crossR6_s12', 'head6_s13', 'crossL9_s11'];
const sens = {};
const runSub = (label, params = P, mutate = null, undo = null) => {
  if (mutate) mutate();
  const rs = SUB.map((id) => TG.evaluateCase(params, FULLRUN_CASES.find((x) => x.id === id)));
  if (undo) undo();
  sens[label] = { availMean: r3(mean(rs.map((r) => r.avail))), jitterMean: r3(mean(rs.map((r) => r.jitterRms))), jitterMax: r3(Math.max(...rs.map((r) => r.jitterRms))), pxMed: r3(mean(rs.map((r) => r.pxMed))), keMax: r3(Math.max(...rs.map((r) => r.keMax))), setupMax: r3(Math.max(...rs.map((r) => r.setupTime))), releases: rs.reduce((a, r) => a + r.releases, 0) };
  console.log('sens', label, JSON.stringify(sens[label]));
};
runSub('base');
const eis0 = STAB.eis.ratio;
runSub('eisResidual_0.15', P, () => { STAB.eis.ratio = 0.15; }, () => { STAB.eis.ratio = eis0; });
runSub('eisResidual_0.25', P, () => { STAB.eis.ratio = 0.25; }, () => { STAB.eis.ratio = eis0; });
runSub('ld_minus30', { ...P, ldFactor: 0.7 });
runSub('mass_+15pct_overrun', { ...P, massAuto: 0, mass: +(gliderBudget('panEIS', 0.075).kg * 1.15).toFixed(4) });
runSub('cd0_0.06', { ...P, cd0: 0.06 });
out.sensitivities = sens;

// ---------------------------------------------------------------- 5. mass, power, line arithmetic (independent)
const b = gliderBudget('panEIS', 0.075);
const rhoCu20 = 1.72e-8, rhoCuM10 = rhoCu20 * (1 + 0.00393 * (-30));
const dCond = 0.12e-3, Acond = Math.PI * dCond * dCond / 4;
const W = b.W;
const elec = (ohmPerM, len) => { const atG = W / 0.9; const I = atG / 48; const loss = I * I * 2 * len * ohmPerM; return { I: r3(I), lossW: r3(loss), dropV: r3(I * 2 * len * ohmPerM), lossPct: r3(100 * loss / (atG + loss)) }; };
out.arithmetic = {
  glider: { items_g: { cam4kNoGimbal: 27, servos3: 7.5, mountBracket: 3, avionics: 10, servos4: 10, wiring: 5, release: 2, buck: 2, supercap: 5 }, structure_g: r3(b.structureG), sum_g: r3(b.g), withMargin_g: r3(b.gWithMargin), W: r3(W) },
  worn_kg: { glider: r3(b.kg), ...WORN, total: r3(b.kg + Object.values(WORN).reduce((a, x) => a + x, 0)) },
  line: {
    cuOhmPerM_0p12mm_20C: r3(rhoCu20 / Acond), cuOhmPerM_0p12mm_m10C: r3(rhoCuM10 / Acond), devOhmPerM: LINE.ohmPerM,
    cuMass_gPerM_2cond: r3(2 * Acond * 8960 * 1000), dyneema0p17_gPerM: r3(Math.PI * 0.17e-3 ** 2 / 4 * 970 * 1000),
    jacketPU_gPerM: r3(Math.PI / 4 * ((0.45e-3) ** 2 - (0.41e-3) ** 2) * 1200 * 1000), devGPerM: LINE.gPerM,
    elec_dev_15m_1p8: elec(1.8, 15), elec_tinsel_x3: elec(5.4, 15), elec_tinsel_x10: elec(18, 15),
    note: 'dev powerChain charges the full 15 m spool on both conductors (conservative vs. line out). Tinsel ribbon conductors in headset cords are typically several ohms per metre (higher than solid Cu of equal OD), so ×3 and ×10 are shown.',
  },
  enduranceCheck: (() => { const usable = HIP.packWh * BATTERY.coldFactor * (1 - BATTERY.reserve); const fl = rows.filter((r) => r.filmS > 1); const E = mean(fl.map((r) => r.E)), F = mean(fl.map((r) => r.filmS)); return { usableWh: r3(usable), meanRunWh: r3(E / 3600), meanFilmS: r3(F), enduranceMin: r3((usable * 3600 / E) * F / 60), runsPerCharge: r3(usable * 3600 / E), hipWhPer100sFlown: null }; })(),
};
writeFileSync(join(here, 'out_recheck.json'), JSON.stringify(out, null, 1));
console.log('wrote', join(here, 'out_recheck.json'));
