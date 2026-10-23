// Independent audit of kite2 (round 2, read-only on sim/): recomputes harmonised
// metrics from the Result frames / core columns, probes the coefficient envelope,
// mass budget, dt, wind seeds/directions, stop handling and the lift-ride launch logic.
// Run from the repo root: node research/concepts_2026_10_19/audit/check_kite2.mjs
// Evidence: numerical checks of an uncalibrated model; not a physical test.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import C from '../../../sim/js/concepts/kite2/index.js';
import { runCore, makeRider, smoothBody, PDEF, MODE, resolveP } from '../../../sim/js/concepts/kite2/model.js';
import { simulateSkier, bodyPoints } from '../../../sim/js/concepts/common/skier.js';
import { footageStability, CRITERIA } from '../../../sim/js/concepts/common/criteria.js';

const here = dirname(fileURLToPath(import.meta.url));
const P = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v);
const sc = (id) => C.scenarios.find((s) => s.id === id);
const mv = (R, id) => R.metrics.find((m) => m.id === id)?.value;
const pct = (a, q) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.round(q * (v.length - 1)))] : NaN; };
const mean = (a) => { const v = a.filter(Number.isFinite); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN; };
const out = { concept: 'kite2', generated: '2026-10-19', evidence: 'audit re-computation on the uncalibrated model; not a physical test' };

// ---------------------------------------------------------------- 1. per-scenario independent recomputation
function audit(R, massKg = 0.062) {
  const O = R.core.O, A = R.analysis, n = R.n, dt = 0.02, RS = R.core.RS;
  const idx = []; for (let i = 0; i < n; i++) if (i * dt >= 2) idx.push(i);
  const ski = idx.filter((i) => RS[i].speed > 2 && !RS[i].fallen);
  // strict avail: no artefact >=1 px over the subject at all (criteria def), vs the model's <3 % tolerance
  const okStrict = (i) => A.filming[i] === 1 && A.inFrame[i] === 1 && A.subjectPx[i] >= 300 && !(A.art[i] > 0);
  const okModel = (i) => A.filming[i] === 1 && A.inFrame[i] === 1 && A.subjectPx[i] >= 300 && !(A.art[i] >= 3);
  // KE: ground frame beyond 1.5 m of the rider (kite is 7 m out), rider frame within; at the given mass
  let keG = 0, keCrit = 0, vmax = 0;
  for (const i of idx) {
    const md = O.mode[i]; if (md === MODE.DOCKED || md === MODE.STOW) continue;
    const v = Math.hypot(O.kvx[i], O.kvy[i], O.kvz[i]); vmax = Math.max(vmax, v);
    const s = RS[i], rv = Math.hypot(O.kvx[i] - s.vel[0], O.kvy[i] - s.vel[1], O.kvz[i] - s.vel[2]);
    const b = bodyPoints(s), d = Math.hypot(O.kx[i] - b.chest[0], O.ky[i] - b.chest[1], O.kz[i] - b.chest[2]);
    const ke = 0.5 * massKg * (d > 1.5 ? v * v : rv * rv);
    keCrit = Math.max(keCrit, ke); keG = Math.max(keG, 0.5 * massKg * v * v);
  }
  // body force: centred 50 ms mean (3 samples, 60 ms) of the tether tension; raw sample peak (Tmax) for reference
  let f50 = 0, raw = 0;
  for (let k = 1; k < idx.length - 1; k++) { const i = idx[k]; f50 = Math.max(f50, (O.T[i - 1] + O.T[i] + O.T[i + 1]) / 3); raw = Math.max(raw, O.Tmax[i]); }
  // operating point while filming and skiing
  const film = ski.filter((i) => O.mode[i] === MODE.FILM);
  const G = film.map((i) => O.G[i]), CR = film.map((i) => O.CR[i]), Va = film.map((i) => O.Va[i]);
  const p = resolveP(P);
  const CL = film.map((i) => O.CR[i] * O.G[i] / Math.hypot(1, O.G[i]));
  // tether height above the snow at 0.5–4 m horizontal behind the exit
  const hAt = {}; for (const dd of [0.5, 1, 1.5, 2, 3, 4]) {
    const h = [];
    for (const i of ski) {
      const md = O.mode[i]; if (md !== MODE.FILM || O.snag[i]) continue;
      const Ax = [O.ax[i], O.ay[i], O.az[i]], K = [O.kx[i], O.ky[i], O.kz[i]];
      const d = [K[0] - Ax[0], K[1] - Ax[1], K[2] - Ax[2]], hz = Math.hypot(d[0], d[1]); if (hz < dd) continue;
      const u = dd / hz, P3 = [Ax[0] + d[0] * u, Ax[1] + d[1] * u, Ax[2] + d[2] * u];
      h.push(P3[2] + P3[0] * R.core.tanS);
    }
    hAt[dd + 'm'] = { p5: r3(pct(h, 0.05)), median: r3(pct(h, 0.5)) };
  }
  const fs = footageStability(R);
  const elv = ski.filter((i) => A.filming[i] === 1).map((i) => A.elev[i]);
  return {
    availModel: r3(ski.length ? 100 * ski.filter(okModel).length / ski.length : NaN),
    availStrictNoArtefact: r3(ski.length ? 100 * ski.filter(okStrict).length / ski.length : NaN),
    footageStability: { subjectRms: r3(fs.subjectRms), backgroundRms: r3(fs.backgroundRms), samples: fs.samples },
    keCriteriaFrame_J: r3(keCrit), keGround_J: r3(keG), kiteSpeedMax: r3(vmax),
    bodyForce50ms_N: r3(f50), rawTensionPeak_N: r3(raw),
    viewElevMedian: r3(pct(elv, 0.5)),
    filmOperatingPoint: film.length ? {
      G_median: r3(pct(G, 0.5)), G_p5: r3(pct(G, 0.05)), CR_median: r3(pct(CR, 0.5)), CL_median: r3(pct(CL, 0.5)),
      pctTime_CR_atMin: r3(100 * CR.filter((x) => x <= p.CRmin * 1.05).length / CR.length),
      pctTime_G_below06: r3(100 * G.filter((x) => x < 0.6).length / G.length),
      pctTime_G_below08: r3(100 * G.filter((x) => x < 0.8).length / G.length),
      Va_median: r3(pct(Va, 0.5)), tensionMean: r3(mean(film.map((i) => O.T[i]))),
    } : null,
    lineHeightBehind_m: hAt,
    events: [...new Set(R.events.map((e) => e.type))],
  };
}
out.scenarios = {};
for (const s of C.scenarios) {
  const R = C.simulate(P, s);
  const std = Object.fromEntries(Object.keys(CRITERIA).map((k) => [k, r3(mv(R, k))]));
  out.scenarios[s.id] = { claimedStd12: std, audit: audit(R) };
}
{ const R = C.demo.build(P); out.scenarios.demo = { claimedStd12: Object.fromEntries(Object.keys(CRITERIA).map((k) => [k, r3(mv(R, k))])), audit: audit(R) }; }

// ---------------------------------------------------------------- 2. mass budget sensitivity (dynamics re-run)
out.massSensitivity = {};
for (const m of [0.062, 0.068, 0.085, 0.1]) {
  out.massSensitivity[m] = {};
  for (const id of ['nominal', 'fast', 'short', 'gust', 'moguls', 'stopstart']) {
    const R = C.simulate({ ...P, mass: m }, sc(id)); const a = audit(R, m);
    out.massSensitivity[m][id] = { avail: r3(mv(R, 'avail')), keMax: r3(mv(R, 'keMax')), keGround: a.keGround_J, kiteSpeedMax: a.kiteSpeedMax, viewElev: r3(mv(R, 'viewElev')), vMinFly: r3(mv(R, 'vMinFly')), landed: R.events.some((e) => e.type === 'landed'), manual: R.events.some((e) => e.type === 'manualStow') };
  }
}

// ---------------------------------------------------------------- 3. coefficient-envelope sensitivity
// Physical argument: L/D ≈0.5 on a soft canopy occurs only at high AoA (parachutal), where CR ≈0.9–1.2;
// the model's (CR 0.2, L/D 0.5) corner is a depowered AND parachutal canopy at the same time.
out.envelope = [];
for (const [CRmin, Gmin] of [[0.2, 0.35], [0.4, 0.35], [0.6, 0.35], [0.8, 0.35], [0.2, 0.6], [0.2, 0.8], [0.2, 1.0], [0.6, 0.8], [0.8, 1.0]]) {
  const row = { CRmin, Gmin };
  for (const id of ['nominal', 'fast', 'gust', 'short']) {
    const R = C.simulate({ ...P, CRmin, Gmin }, sc(id));
    row[id] = { avail: r3(mv(R, 'avail')), pxMed: r3(mv(R, 'pxMed')), tensionMean: r3(mv(R, 'tensionMean')), bodyForcePeak: r3(mv(R, 'bodyForcePeak')), viewElev: r3(mv(R, 'viewElev')), keMax: r3(mv(R, 'keMax')), landed: R.events.some((e) => e.type === 'landed') };
  }
  out.envelope.push(row);
}

// ---------------------------------------------------------------- 4. dt convergence (full scenario)
out.dtConvergence = {};
for (const id of ['nominal', 'short', 'gust']) {
  out.dtConvergence[id] = {};
  for (const dt of [0.002, 0.001, 0.0005]) { const R = C.simulate(P, { ...sc(id), dt }); out.dtConvergence[id][dt] = { avail: r3(mv(R, 'avail')), jitterRms: r3(mv(R, 'jitterRms')), bodyForcePeak: r3(mv(R, 'bodyForcePeak')), keMax: r3(mv(R, 'keMax')), tensionMean: r3(mv(R, 'tensionMean')) }; }
}

// ---------------------------------------------------------------- 5. wind direction / strength not in the scenario set
const windCases = {
  headwind_upslope_4: { mean: [-4, 0, 0], intensity: 0.25, Lu: 28, seed: 21 },
  cross_9_turb: { mean: [0, 9, 0], intensity: 0.3, Lu: 25, seed: 22 },
  tail_9: { mean: [9, 0, 0], intensity: 0.2, Lu: 28, seed: 23 },
  tail_6_quarter: { mean: [4.2, 4.2, 0], intensity: 0.3, Lu: 25, seed: 24 },
  calm_turb_0: { mean: [0, 0, 0], intensity: 0.3, Lu: 15, seed: 25 },
};
out.windCases = {};
for (const [k, w] of Object.entries(windCases)) {
  for (const id of ['nominal', 'short']) {
    const R = C.simulate(P, { ...sc(id), wind: w });
    out.windCases[`${id}/${k}`] = { avail: r3(mv(R, 'avail')), jitterRms: r3(mv(R, 'jitterRms')), bodyForcePeak: r3(mv(R, 'bodyForcePeak')), keMax: r3(mv(R, 'keMax')), viewElev: r3(mv(R, 'viewElev')), landed: R.events.some((e) => e.type === 'landed'), collapse: R.events.some((e) => e.type === 'collapse'), low: R.events.filter((e) => e.type === 'lowAirspeed').length };
  }
}
// moguls at the envelope edge with seeds (low airspeed)
out.mogulSeeds = [1, 2, 3, 4, 5, 6].map((seed) => { const R = C.simulate(P, { ...sc('moguls'), wind: { ...sc('moguls').wind, seed, mean: [0, 3, 0] }, skier: { ...sc('moguls').skier, seed } }); return { seed, crosswind: 3, avail: r3(mv(R, 'avail')), viewElev: r3(mv(R, 'viewElev')), landed: R.events.some((e) => e.type === 'landed'), lowAirspeedEvents: R.events.filter((e) => e.type === 'lowAirspeed').length }; });

// ---------------------------------------------------------------- 6. stop handling: dock success over seeds, standstill p90, ops
{
  const rows = [];
  const base = sc('liftline');
  for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) for (const wm of [0, 1.5, 3, 4.4]) for (const dir of [[0, 1], [1, 0], [-1, 0]]) {
    const R = C.simulate(P, { ...base, skier: { ...base.skier, seed, stopAt: 8 + (seed % 4) * 0.6 }, wind: { mean: [dir[0] * wm, dir[1] * wm, 0], intensity: 0.25, Lu: 20, seed } });
    const manual = R.events.some((e) => e.type === 'manualStow' || e.type === 'landed');
    rows.push({ seed, wind: wm, dir: dir.join(','), stowed: R.events.some((e) => e.type === 'stowed'), manual, redocks: R.events.filter((e) => e.type === 'redock').length, setup: r3(mv(R, 'setupTime')), ops: mv(R, 'ops'), headLaunch: r3(mv(R, 'headLaunch')) });
  }
  // a manual push-in into a pack-top funnel behind the head with gloves: ASSUMED 15 s (take pack off, seat KCU, douse)
  const MANUAL_S = 15;
  const stand = rows.map((r) => (r.manual ? 2 + MANUAL_S : r.setup)).filter(Number.isFinite);
  out.stops = { n: rows.length, autoDocked: rows.filter((r) => r.stowed && !r.manual).length, manual: rows.filter((r) => r.manual).length, notStowed: rows.filter((r) => !r.stowed && !r.manual).length,
    minHeadClearance_m: r3(Math.min(...rows.map((r) => r.headLaunch).filter(Number.isFinite))), headClearanceBelow5cm: rows.filter((r) => r.headLaunch < 0.05).length,
    standstillP90_s_withManual15s: r3(pct(stand, 0.9)), maxRedocks: Math.max(...rows.map((r) => r.redocks)), rows };
}

// 6b. the shared liftline/stopRobustness wind is σ = 0.1·max(2,U) = 0.2 m/s in calm; real 'calm' is gustier
out.calmDockVsTurbulence = {};
for (const I of [0.1, 0.2, 0.25, 0.35]) {
  let auto = 0, man = 0, none = 0; const base = sc('liftline');
  for (let seed = 7; seed <= 30; seed++) for (const stopAt of [8, 8.7, 9.4, 10.1]) {
    const R = C.simulate(P, { ...base, skier: { ...base.skier, seed, stopAt }, wind: { ...base.wind, mean: [0, 0, 0], seed, intensity: I } });
    const m = R.events.some((e) => e.type === 'manualStow' || e.type === 'landed'), s = R.events.some((e) => e.type === 'stowed');
    if (s && !m) auto++; else if (m) man++; else none++;
  }
  out.calmDockVsTurbulence['sigma_' + (I * 2).toFixed(2) + '_ms'] = { auto, manual: man, notStowed: none, n: auto + man + none };
}

// ---------------------------------------------------------------- 7. lift-ride launch interlock (code + sim)
{
  // a rider moving at a detachable-chairlift line speed (5 m/s) with the air from ahead: does an armed, docked kite launch?
  const sk = smoothBody(simulateSkier({ style: 'straight', v0: 5, vTarget: 5, duration: 13 }));
  const c = runCore({ ...PDEF }, { duration: 12, rider: makeRider([{ sk, t0: 0 }]), tanS: sk.tanS, wind: { mean: [0, 0, 0], intensity: 0 }, plan: { start: 'docked', armAt: 0.5 } });
  const launched = c.events.filter((e) => e.type === 'launch').map((e) => e.t);
  out.liftInterlock = { riderSpeed: 5, launchedAt: launched, note: 'model.js l.250: launch if armed && speed>4 m/s && air from ahead for 0.5 s; no climb/descent, lift or geofence check; armed is never cleared by a dock (stopstart relaunches automatically). A detachable chair runs 5–6 m/s facing forward, a T-bar 2.5–4 m/s: the only interlock is the user remembering to disarm.' };
}

// ---------------------------------------------------------------- 8. closed-form plausibility
{
  const p = resolveP(P), rho = 1.0, S = 0.35, g = 9.81;
  const clNeeded = (m, V) => (2 * m * g) / (rho * V * V * S);
  out.closedForm = {
    CLneededForWeight_at_2_1ms_62g: r3(clNeeded(0.062, 2.1)), CLneeded_at_2_1ms_85g: r3(clNeeded(0.085, 2.1)),
    vMin_85g_CL1: r3(Math.sqrt(1.3 * 2 * 0.085 * g / (rho * S * 1.015))),
    modelCLatCRmaxGmax: r3(p.CRmax * p.Gmax / Math.hypot(1, p.Gmax)),
    filmCR_needed_for_5N: Object.fromEntries([6, 9, 12, 15, 18, 21].map((V) => [V, r3(5 / (0.5 * rho * V * V * S))])),
    tensionIfCR_09_parachutal_N: Object.fromEntries([6, 9, 12, 15, 18, 21].map((V) => [V, r3(0.5 * rho * V * V * S * 0.9)])),
    tensionIfCR_05_N: Object.fromEntries([6, 9, 12, 15, 18, 21].map((V) => [V, r3(0.5 * rho * V * V * S * 0.5)])),
    massBudgetModelParam_kg: p.mass, massBudgetSumOfIndexNote_kg: 0.024 + 0.003 + 0.012 + 0.016 + 0.008 + 0.005,
    auditMassBudget_kg: { canopy_singleSkin_0p47m2flat: [0.025, 0.04], bridle_and_3_control_lines: [0.003, 0.006], KCU_3actuators_MCU_IMU_GNSS_UWB_pitot_failsafe: [0.018, 0.03], camera_4K_60deg_custom_optic: [0.016, 0.02], cell_1p3Wh: [0.008, 0.009], arm_wiring_housing: [0.005, 0.008], total: [0.075, 0.113] },
    keAt20_4ms: Object.fromEntries([0.062, 0.068, 0.085, 0.1].map((m) => [m, r3(0.5 * m * 20.43 ** 2)])),
    sortieMin_ifCam3_5W: r3(1.3 * 0.75 * 0.9 * 60 / (3.5 + 0.9)),
  };
}

writeFileSync(join(here, 'out_kite2.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ scen: Object.fromEntries(Object.entries(out.scenarios).map(([k, v]) => [k, { aS: v.audit.availStrictNoArtefact, aM: v.audit.availModel, fs: v.audit.footageStability, ke: v.audit.keCriteriaFrame_J, F: v.audit.bodyForce50ms_N, op: v.audit.filmOperatingPoint, h: v.audit.lineHeightBehind_m['2m'] }])) }, null, 0));
console.log('mass', JSON.stringify(out.massSensitivity));
console.log('env', JSON.stringify(out.envelope));
console.log('dt', JSON.stringify(out.dtConvergence));
console.log('wind', JSON.stringify(out.windCases));
console.log('moguls', JSON.stringify(out.mogulSeeds));
const { rows, ...st } = out.stops; console.log('stops', JSON.stringify(st));
console.log('lift', JSON.stringify(out.liftInterlock.launchedAt));
console.log('cf', JSON.stringify(out.closedForm));
