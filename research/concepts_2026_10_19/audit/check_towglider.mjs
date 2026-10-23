// Round-2 audit of towglider (read-only; writes only audit/out_towglider.json).
// Run from anywhere: node research/concepts_2026_10_19/audit/check_towglider.mjs
// Evidence: numerical re-computation on the uncalibrated model; not a physical test.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import C from '../../../sim/js/concepts/towglider/index.js';
import { runCore, PDEF, vStall, liftDrag, applyHardFall } from '../../../sim/js/concepts/towglider/model.js';
import { analyse } from '../../../sim/js/concepts/towglider/analysis.js';
import { footageStability, CRITERIA } from '../../../sim/js/concepts/common/criteria.js';
import { footage } from '../../../sim/js/concepts/common/env.js';
import { simulateSkier, bodyPoints, SKIER_PRESETS } from '../../../sim/js/concepts/common/skier.js';

const here = dirname(fileURLToPath(import.meta.url));
const P0 = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const r3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const SC = (id) => C.scenarios.find((s) => s.id === id);
const met = (R, id) => { const m = R.metrics.find((x) => x.id === id); return m ? m.value : null; };
const out = { concept: 'towglider', generated: '2026-10-19', evidence: 'audit re-computation on the uncalibrated model; not a physical test' };

// ------------------------------------------------------------ independent per-run recomputation from R.frame / R.columns
function audit(R) {
  const dt = 0.02, n = R.n;
  let keJudged = 0, keJudgedT = null, keGround = 0, keGroundT = null, nSki = 0, nOk = 0, px = [];
  const T = R.columns.tension;
  for (let i = 0; i < n; i++) {
    const t = i * dt, f = R.frame(t), s = f.skier, d = f.device;
    const g = d.glider, b = bodyPoints(s);
    const dist = Math.min(...[b.head, b.chest, b.pelvis, b.feet].map((q) => Math.hypot(g[0] - q[0], g[1] - q[1], g[2] - q[2])));
    const keS = R.columns.keSnow[i], keR = R.columns.keRel[i];
    const attached = ['stowed', 'docked', 'seat'].includes(d.mode);
    if (!attached) {
      const k = dist > 1.5 ? keS : keR;
      if (k > keJudged) { keJudged = k; keJudgedT = t; }
      if (keS > keGround) { keGround = keS; keGroundT = t; }
    }
    if ((s.speed ?? 0) > 2 && !s.fallen) {
      nSki++;
      const pc = f.productCam;
      if (pc) {
        const ft = footage({ pos: pc.pos, kind: 'rect', fwd: pc.fwd, up: [0, 0, 1], vfovDeg: pc.vfovDeg, w: 1920, h: 1080 }, s);
        if (ft.inFrame) px.push(ft.subjectPx);
        if (ft.inFrame && ft.subjectPx >= 300 && !(R.columns.lineArt[i] >= 1)) nOk++;
      }
    }
  }
  // body force: true 50 ms moving mean (linear interpolation of the 20 ms samples), whole run incl. the first second
  let F50 = 0, Fraw = 0;
  for (let i = 0; i < n; i++) Fraw = Math.max(Fraw, T[i]);
  for (let t = 0; t + 0.05 <= R.duration; t += 0.005) {
    let s = 0, k = 0; for (let u = t; u <= t + 0.05 + 1e-9; u += 0.005) { const x = u / dt, i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), w = x - i0; s += T[i0] * (1 - w) + T[i1] * w; k++; }
    F50 = Math.max(F50, s / k);
  }
  px.sort((a, b) => a - b);
  const fs = footageStability(R);
  return {
    avail_recomputed: r3((100 * nOk) / Math.max(1, nSki)), pxMed_recomputed: r3(px.length ? px[Math.floor(px.length / 2)] : NaN),
    keJudged_J: r3(keJudged), keJudged_t: r3(keJudgedT), keGroundOnly_J: r3(keGround), keGroundOnly_t: r3(keGroundT),
    hipForceRaw_N: r3(Fraw), hipForce50ms_N: r3(F50),
    fsSubject: r3(fs.subjectRms), fsBackground: r3(fs.backgroundRms),
  };
}
const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'bodyForcePeak', 'setupTime', 'ops', 'keMax', 'endurance'];
const claimed = (R) => Object.fromEntries([...STD, 'airMin', 'heightMin', 'lagMax', 'tensionP95', 'towShare', 'artFrames', 'clearPole', 'clearBody', 'dockTime', 'captureV'].map((k) => [k, r3(met(R, k))]));
const evTypes = (R) => [...new Set(R.events.map((e) => e.type))];

// 1. determinism (dev results.json gust differed from a fresh run)
{
  const a = C.simulate(P0, SC('gust')), b = C.simulate(P0, SC('gust'));
  out.determinism = { gustAvailRun1: r3(met(a, 'avail')), gustAvailRun2: r3(met(b, 'avail')), identical: met(a, 'avail') === met(b, 'avail') && met(a, 'bodyForcePeak') === met(b, 'bodyForcePeak'),
    note: 'dev/towglider/results.json gust row (avail 88.353, bodyForcePeak 1.576, tensionP95 0.818, towShare 48.7) does not match a fresh run of the current code (88.491, 0.826, 0.617, 37.8): results.json is stale for gust (model edited after the run); the other 19 scenarios match exactly.' };
}

// 2. every scenario: claimed vs recomputed
out.scenarios = {};
for (const sc of C.scenarios) {
  const R = C.simulate(P0, sc);
  out.scenarios[sc.id] = { fault: !!sc.fault, stow: !!sc.stow, claimed: claimed(R), audit: audit(R), events: evTypes(R) };
}

// 3. wind-seed sensitivity
const seedRun = (id, seeds, over = {}) => seeds.map((sd) => {
  const base = SC(id); const sc = { ...base, wind: { ...base.wind, seed: sd } };
  const R = C.simulate({ ...P0, ...over }, sc);
  return { seed: sd, avail: r3(met(R, 'avail')), keMax: r3(met(R, 'keMax')), setupTime: r3(met(R, 'setupTime')), airMin: r3(met(R, 'airMin')), heightMin: r3(met(R, 'heightMin')), clearPole: r3(met(R, 'clearPole')), clearBody: r3(met(R, 'clearBody')), dockTime: r3(met(R, 'dockTime')), events: evTypes(R).filter((e) => !['follow', 'arm', 'drop', 'sled', 'winch', 'liftoff', 'stop', 'landed', 'docked', 'capture', 'dockcmd'].includes(e)) };
});
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
out.seedSweep = { nominal: seedRun('nominal', SEEDS), gust: seedRun('gust', SEEDS), stop_wind: seedRun('stop_wind', SEEDS), dock_wind: seedRun('dock_wind', SEEDS), tailwind: seedRun('tailwind', SEEDS) };
const summ = (rows, k) => { const v = rows.map((r) => r[k]).filter(Number.isFinite).sort((a, b) => a - b); return v.length ? { min: v[0], p50: v[Math.floor(v.length / 2)], p90: v[Math.min(v.length - 1, Math.round(0.9 * (v.length - 1)))], max: v[v.length - 1] } : null; };
out.seedSummary = Object.fromEntries(Object.entries(out.seedSweep).map(([id, rows]) => [id, { avail: summ(rows, 'avail'), keMax: summ(rows, 'keMax'), setupTime: summ(rows, 'setupTime'), airMin: summ(rows, 'airMin'), clearPole: summ(rows, 'clearPole') }]));

// 4. scenarios the concept did not run (envelope probes)
const W = { mean: [0, 2, 0], intensity: 0.2, Lu: 30, seed: 7 };
const EXTRA = [
  { id: 'audit_expertCarve20', en: 'expert carve, 20°, 13 m/s', dur: 30, skier: { duration: 31, ...SKIER_PRESETS.expertCarve }, wind: W },
  { id: 'audit_moguls24', en: 'moguls/short turns 24°, 4.5 m/s', dur: 25, skier: { duration: 26, ...SKIER_PRESETS.moguls }, wind: W },
  { id: 'audit_steep28_15ms', en: 'steep 28° carve, 15 m/s', dur: 25, skier: { duration: 26, slopeDeg: 28, vTarget: 15, v0: 15, turnPeriod: 3, turnAmpDeg: 50 }, wind: W },
  { id: 'audit_beginner6', en: 'slow beginner 6 m/s, 12°, wide turns', dur: 30, skier: { duration: 31, slopeDeg: 12, vTarget: 6, v0: 6, turnPeriod: 5, turnAmpDeg: 55 }, wind: W },
  { id: 'audit_16ms', en: 'fast-recreational 16 m/s', dur: 25, skier: { duration: 26, vTarget: 16, v0: 16, turnPeriod: 4.5, turnAmpDeg: 30 }, wind: W },
  { id: 'audit_turb_along', en: 'nominal skier, 4 m/s wind along the fall line (Taylor advection along the flight path), intensity 0.35', dur: 30, skier: { duration: 31 }, wind: { mean: [4, 0, 0], intensity: 0.35, Lu: 20, seed: 3 } },
  { id: 'audit_turb_cross6', en: 'nominal skier, 6 m/s crosswind, intensity 0.35', dur: 30, skier: { duration: 31 }, wind: { mean: [0, 6, 0], intensity: 0.35, Lu: 20, seed: 8 } },
];
out.envelopeProbes = {};
for (const sc of EXTRA) {
  const s2 = { ...sc, expect: { zh: '', en: sc.en } };
  try { const R = C.simulate(P0, s2); out.envelopeProbes[sc.id] = { en: sc.en, claimed: claimed(R), audit: audit(R), events: evTypes(R) }; }
  catch (e) { out.envelopeProbes[sc.id] = { en: sc.en, error: String(e) }; }
}

// 5. audit-realistic mass/aero variant (see part_towglider.json massBudget): 117 g, CLmax 0.9, CD0 0.05
const REAL = { mass: 0.117, CLmax: 0.9, cd0: 0.05 };
out.realisticVariant = { over: REAL, vStall: r3(vStall({ ...PDEF, ...P0, ...REAL })), keCapSpeed_ms: r3(Math.sqrt((2 * 14.9 * 0.98) / REAL.mass)), runs: {} };
for (const id of ['nominal', 'short', 'gust', 'tailwind', 'headwind', 'stop_wind', 'dock_wind', 'launch', 'flat']) {
  const R = C.simulate({ ...P0, ...REAL }, SC(id));
  out.realisticVariant.runs[id] = { claimed: claimed(R), audit: audit(R), events: evTypes(R) };
}
for (const sc of EXTRA.filter((e) => ['audit_16ms', 'audit_beginner6', 'audit_turb_cross6'].includes(e.id))) {
  const R = C.simulate({ ...P0, ...REAL }, { ...sc, expect: { zh: '', en: sc.en } });
  out.realisticVariant.runs[sc.id] = { claimed: claimed(R), audit: audit(R), events: evTypes(R) };
}

// 6. dt (substep) convergence on the carved nominal, replicating index.js prepare()
{
  const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const off = (dur) => (t) => ({ az: 32 * (sm((t - 0.28 * dur) / 2.5) - 2 * sm((t - 0.52 * dur) / 2.5) + sm((t - 0.78 * dur) / 2.5)) });
  const mk = (k, idSc = 'nominal') => { const sc = SC(idSc); const sk = simulateSkier({ ...sc.skier }); return runCore({ ...PDEF, ...P0 }, { duration: sc.dur, skier: sk, wind: sc.wind, plan: { offset: off(sc.dur) }, seed: 11, subFactor: k }); };
  const res = {};
  for (const idSc of ['nominal', 'short', 'gust']) {
    const a = mk(1, idSc), b = mk(2, idSc), c = mk(4, idSc);
    const rms = (x, y, f) => { let s = 0, m = 0; for (let i = 50; i < x.n; i++) { s += f(x, i, y) ** 2; m++; } return Math.sqrt(s / m); };
    const dpos = (x, i, y) => Math.hypot(x.O.gx[i] - y.O.gx[i], x.O.gy[i] - y.O.gy[i], x.O.gz[i] - y.O.gz[i]);
    const dT = (x, i, y) => x.O.Thip[i] - y.O.Thip[i];
    res[idSc] = { posRms_1v2_m: r3(rms(a, b, dpos)), posRms_2v4_m: r3(rms(b, c, dpos)), hipTRms_1v2_N: r3(rms(a, b, dT)), hipTRms_2v4_N: r3(rms(b, c, dT)) };
  }
  out.dtConvergence = { note: 'glider controller runs at a fixed 50 Hz (SDT 0.02 s); subFactor refines only the line/drum/glider integration substeps', ...res };
}

// 7. closed-form aero (independent of the model code)
{
  const p = { ...PDEF, ...P0 };
  const b = Math.sqrt(p.S * p.AR), c = p.S / b, nu = 1.67e-5 / p.rho; // μ(−10 °C) ≈ 1.67e-5 Pa·s; ρ = 1.0 (≈2000 m, −10 °C)
  const k = 1 / (Math.PI * p.e * p.AR), LDmax = 0.5 / Math.sqrt(p.cd0 * k), CLopt = Math.sqrt(p.cd0 / k);
  const Vmd = Math.sqrt((2 * p.mass * 9.81) / (p.rho * p.S * CLopt));
  const ld = (m, S, cd0, V, e = p.e, AR = p.AR) => { const CL = (m * 9.81) / (0.5 * p.rho * V * V * S); const CD = cd0 + CL * CL / (Math.PI * e * AR); return { CL: r3(CL), LD: r3(CL / CD) }; };
  out.aero = {
    span_m: r3(b), chord_m: r3(c), Re_at: Object.fromEntries([6, 8, 12, 17].map((V) => [V, Math.round((V * c) / nu)])),
    wingLoading_Nm2: r3((p.mass * 9.81) / p.S), vStall_model: r3(vStall(p)), LDmax_closedForm: r3(LDmax), CLopt: r3(CLopt), Vmd_ms: r3(Vmd),
    modelLD: Object.fromEntries([6, 8, 10, 12, 14, 17].map((V) => [V, r3(liftDrag(p, V))])),
    requiredLD_15deg: r3(1 / Math.tan((15 * Math.PI) / 180)), requiredLD_20deg: r3(1 / Math.tan((20 * Math.PI) / 180)),
    auditPolar_117g_cd0_050_e075: Object.fromEntries([6.5, 8, 10, 12, 14].map((V) => [V, ld(0.117, p.S, 0.05, V, 0.75)])),
    auditLDmax_117g: r3(0.5 / Math.sqrt(0.05 / (Math.PI * 0.75 * p.AR))),
    vStall_117g_CLmax09: r3(Math.sqrt((2 * 0.117 * 9.81) / (p.rho * p.S * 0.9))),
    vStall_95g_CLmax085_Re30k: r3(Math.sqrt((2 * 0.095 * 9.81) / (p.rho * p.S * 0.85))),
    keCapSpeed: { m095: r3(Math.sqrt(2 * 14.9 / 0.095)), m117: r3(Math.sqrt(2 * 14.9 / 0.117)), m125: r3(Math.sqrt(2 * 14.9 / 0.125)) },
  };
}

// 8. endurance at −10 °C (claimed formula vs audit power budget)
{
  const cold = 0.75, res = 0.9;
  const claimedAv = 3.3;
  const auditAv = { camera_4K_at_cell: 2.5 / 0.88, fc_gnss_uwb_rx: 0.7, servos: 0.3, gimbal_brushless: 0.6 };
  const auditW = Object.values(auditAv).reduce((a, b) => a + b, 0);
  out.endurance = {
    claimedGliderOnly_min: r3((1.2 * cold * res * 60) / claimedAv), auditGliderOnly_min: r3((1.2 * cold * res * 60) / auditW), auditAvionics_W: r3(auditW), auditPowerItems_W: Object.fromEntries(Object.entries(auditAv).map(([k, v]) => [k, r3(v)])),
    claimedWithHipCell_min: 102.2, auditWithHipCell_min: r3(((1.2 + 10) * cold * res * 60) / (auditW / 0.9 + 0.8)),
    cellChargePerRun: { flight_min_per_run: 4, Wh_per_run_audit: r3((auditW * 4) / 60), cRateToRefillOn8minLift: r3((auditW * 4) / 60 / (8 / 60) / 1.2) },
    note: 'The 102 min claim needs the 1.2 Wh glider LiPo to be recharged from the hip cell on every lift ride at ~1–1.5 C. Li-ion/LiPo cells must not be charged below ~0 °C (plating); in a −10 °C holster this needs a heated holster/cell or the glider is limited to its own cell: 11–15 min of flight per day.',
  };
}

// 9. standstill / ops per real run (criteria.js definitions)
{
  const stop = out.scenarios.stop.claimed.setupTime, stopW = out.scenarios.stop_wind.claimed.setupTime;
  const w = Math.max(stop, stopW, ...out.seedSweep.stop_wind.map((r) => r.setupTime).filter(Number.isFinite));
  out.standstillPerRun = {
    worstSingleUnplannedStop_s: r3(w),
    run_0_restStops_s: 1 + 1, run_1_restStop_s: r3(1 + w + 1), run_2_restStops_s: r3(1 + 2 * w + 1),
    opsPerRun: { noRestStop: 2, oneRestStop: 3, note: 'model has no transition docked→launch: after an unplanned mid-run stop the glider stays seated until it is re-armed (one more tap). With a lift-base geofence: 1 + stops.' },
    releaseCases: { fast_lagMax_m: out.scenarios.fast.claimed.lagMax, note: 'fast (18 m/s), snag, crossing: hook releases, glider lands for manual pick-up; setupTime is reported as the constant 17.9 s although retrieval means walking to a glider up to ~90 m upslope (fast) — ASSUMED 30–120 s in design_notes.' },
  };
}

// 10. packed volume check
{
  const p = { ...PDEF, ...P0 };
  const half = Math.sqrt(p.S * p.AR) / 2;
  out.packVol = { claimed_L: 2.58, holster_L: r3(0.37 * 0.08 * 0.06 * 1000 * 1.25), foldedLength_m: r3(Math.max(0.34, half + 0.04)),
    note: 'holster length = half-span + 4 cm; the fuselage + V-tail moment arm is assumed ≤0.37 m (tail arm ≈3 chords). A rigid 37 cm holster behind the left hip is within 3 L, but conflicts with sitting on chairlifts and with T-bars (not modelled).' };
}

writeFileSync(join(here, 'out_towglider.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ determinism: out.determinism, seedSummary: out.seedSummary, aero: out.aero, endurance: out.endurance, standstill: out.standstillPerRun, dt: out.dtConvergence }, null, 1));
for (const [id, s] of Object.entries(out.scenarios)) console.log(id.padEnd(14), JSON.stringify(s.claimed), JSON.stringify(s.audit));
for (const [id, s] of Object.entries(out.envelopeProbes)) console.log(id.padEnd(22), JSON.stringify(s.claimed || s.error), JSON.stringify(s.audit), s.events);
for (const [id, s] of Object.entries(out.realisticVariant.runs)) console.log('REAL', id.padEnd(18), JSON.stringify(s.claimed), JSON.stringify(s.audit), s.events);
