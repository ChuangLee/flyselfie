// Independent audit of the leapfrog concept (round 2, SIM-031). Read-only on sim/.
// Run from anywhere: node research/concepts_2026_10_19/audit/check_leapfrog.mjs
// Writes research/concepts_2026_10_19/audit/out_leapfrog.json
// Evidence: numerical re-computation on an uncalibrated model; not a physical test.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import C from '../../../sim/js/concepts/leapfrog/index.js';
import { PDEF, PHASE, runCore, aero, ldAt, motorPower } from '../../../sim/js/concepts/leapfrog/model.js';
import { analyse, captureProb, snatchForce } from '../../../sim/js/concepts/leapfrog/analysis.js';
import { simulateSkier, skierAt, bodyPoints } from '../../../sim/js/concepts/common/skier.js';
import { subjectPoints } from '../../../sim/js/concepts/common/env.js';
import { footageStability, CRITERIA } from '../../../sim/js/concepts/common/criteria.js';

const here = dirname(fileURLToPath(import.meta.url));
const r3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : v);
const D = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const scen = (id) => C.scenarios.find((s) => s.id === id);
const g = (R, id) => { const m = R.metrics.find((x) => x.id === id); return m ? m.value : undefined; };
const med = (a) => { const q = a.filter(Number.isFinite).sort((x, y) => x - y); return q.length ? q[Math.floor(q.length / 2)] : NaN; };
const dev = JSON.parse(readFileSync(join(here, '../dev/leapfrog/results.json'), 'utf8'));
const out = { concept: 'leapfrog', generated: new Date().toISOString().slice(0, 10), evidence: 'audit re-computation on the uncalibrated model; not a physical test' };

// ------------------------------------------------------------- 1. per-scenario independent recomputation
function indep(R, p) {
  const O = R.core.O, A = R.analysis, n = R.n, m = p.mass;
  let keG = 0, keHarm = 0, keNear = 0, minBodyDist = Infinity;
  const crops = [];
  for (let i = 0; i < n; i++) {
    const ph = O.phase[i];
    if (ph === PHASE.STOWED || ph === PHASE.HOOKED) continue;
    const t = i * 0.02, s = R.core.rider(t);
    const v2 = O.vx[i] ** 2 + O.vy[i] ** 2 + O.vz[i] ** 2;
    const kg = 0.5 * m * v2;
    const kr = 0.5 * m * ((O.vx[i] - s.vel[0]) ** 2 + (O.vy[i] - s.vel[1]) ** 2 + (O.vz[i] - s.vel[2]) ** 2);
    // distance to the nearest body point (feet, mid, head), not to a single reference point
    const sp = subjectPoints(s);
    const d = Math.min(...[sp.feet, sp.mid, sp.head].map((q) => Math.hypot(O.x[i] - q[0], O.y[i] - q[1], O.z[i] - q[2])));
    minBodyDist = Math.min(minBodyDist, d);
    keG = Math.max(keG, kg);
    keHarm = Math.max(keHarm, d > 1.5 ? kg : kr);
    if (d <= 1.5) keNear = Math.max(keNear, kr);
    if (A.usable[i] && A.skiing[i]) crops.push(O.cropV[i]);
  }
  const fs = footageStability(R);
  const crop = med(crops);
  const jit = g(R, 'jitterRms');
  return {
    keGroundMax: r3(keG), keHarmonised: r3(keHarm), keRiderFrameWithin1_5m: r3(keNear), minDistToBody_m: r3(minBodyDist),
    footageStability: { subjectRms: r3(fs.subjectRms), backgroundRms: r3(fs.backgroundRms), samples: fs.samples },
    cropVmedDeg: r3(crop),
    jitterPctFramePerS: r3((100 * jit) / crop), fsSubjectPctFramePerS: r3((100 * fs.subjectRms) / crop),
  };
}
const STD = Object.keys(CRITERIA);
out.scenarios = {};
for (const sc of C.scenarios) {
  const p = { ...PDEF, ...D, ...(sc.over || {}) };
  const R = C.simulate(D, sc);
  const claimed = dev.scenarios[sc.id]?.allMetrics || {};
  const now = Object.fromEntries(R.metrics.filter((x) => STD.includes(x.id) || ['frontShare', 'perchShare', 'sepMax', 'perchSF', 'tdKE', 'shotsPerMin', 'keepsLead', 'pMean'].includes(x.id)).map((x) => [x.id, { value: r3(x.value), pass: x.pass }]));
  const stale = Object.entries(now).filter(([k, v]) => claimed[k] && (claimed[k].value !== v.value || claimed[k].pass !== v.pass)).map(([k, v]) => ({ metric: k, resultsJson: claimed[k].value, rerun: v.value }));
  out.scenarios[sc.id] = { fault: !!sc.fault, metricsRerun: now, staleVsResultsJson: stale, audit: indep(R, p) };
}

// ------------------------------------------------------------- 2. dt convergence (simple scenarios; same prep as index.prepare)
out.dtConvergence = {};
for (const id of ['nominal', 'short', 'crossgust', 'gentle']) {
  const sc = scen(id); const p = { ...PDEF, ...D };
  const row = {};
  for (const dt of [0.01, 0.005, 0.0025]) {
    const sk = simulateSkier({ ...sc.skier });
    const core = runCore(p, { duration: sc.dur, skier: sk, tGo: 0, wind: sc.wind, plan: { ...sc.plan }, seed: 5, dt });
    const A = analyse(core, p);
    let ski = 0, us = 0, keMax = 0;
    for (let i = 0; i < core.n; i++) { if (A.skiing[i]) { ski++; us += A.usable[i]; } if (core.O.phase[i] !== PHASE.STOWED) keMax = Math.max(keMax, A.keSnow[i]); }
    row[dt] = { avail: r3((100 * us) / ski), keGroundMax: r3(keMax), perches: core.perchCount, hops: core.hopCount, tdKEmax: r3(Math.max(...core.touchdowns.map((d) => d.ke))), eUsedWh: r3(core.O.eUsed[core.n - 1]), sfMin: r3(core.sfMin) };
  }
  out.dtConvergence[id] = row;
}

// ------------------------------------------------------------- 3. wind-seed and skier-seed sensitivity
const seedRow = (R) => ({ avail: r3(g(R, 'avail')), frontShare: r3(g(R, 'frontShare')), keMax: r3(g(R, 'keMax')), perchSF: r3(g(R, 'perchSF')), tdKE: r3(g(R, 'tdKE')), sepMax: r3(g(R, 'sepMax')), fails: R.metrics.filter((x) => x.pass === false).map((x) => x.id) });
out.seeds = {};
for (const id of ['nominal', 'short', 'headwind', 'crossgust', 'perchwind']) {
  const sc = scen(id); const rows = [];
  for (let seed = 1; seed <= 12; seed++) rows.push({ windSeed: seed, ...seedRow(C.simulate(D, { ...sc, wind: { ...sc.wind, seed } })) });
  const av = rows.map((r) => r.avail).filter(Number.isFinite);
  out.seeds[id] = { scenarioSeed: sc.wind.seed, min: r3(Math.min(...av)), median: r3(med(av)), max: r3(Math.max(...av)), shareFailingAnyStd: r3(rows.filter((r) => r.fails.some((f) => STD.includes(f))).length / rows.length), failCounts: rows.flatMap((r) => r.fails).reduce((a, f) => ((a[f] = (a[f] || 0) + 1), a), {}), rows };
}
{
  const rows = [];
  for (let seed = 1; seed <= 8; seed++) { const sc = scen('nominal'); rows.push({ skierSeed: seed, ...seedRow(C.simulate(D, { ...sc, skier: { ...sc.skier, seed } })) }); }
  out.seeds.nominal_skierSeed = rows;
}

// ------------------------------------------------------------- 4. stop scenario (the shared skier has no restart: stop and stay)
{
  const sc = { ...scen('nominal'), id: 'audit_stop', dur: 45, skier: { duration: 46, stopAt: 22 } };
  const R = C.simulate(D, sc);
  const O = R.core.O; let firstPerchAfterStop = null;
  for (let i = Math.round(22 / 0.02); i < R.n; i++) if (O.phase[i] === PHASE.PERCH) { firstPerchAfterStop = { t: r3(i * 0.02), gap: r3(O.gap[i]), sep: r3(O.sep[i]) }; break; }
  out.stopScenario = { note: 'nominal skier with a hockey stop at 22 s (no restart in the shared skier model)', ...seedRow(R), firstPerchAfterStop, events: R.events.filter((e) => e.t > 20 && e.severity !== 'info').map((e) => ({ t: r3(e.t), type: e.type, en: e.en })) };
}

// ------------------------------------------------------------- 5. mass-, power- and resolution-realistic variants
const VARS = {
  claimed_125g: {},
  mass175_cap13: { mass: 0.175, vCapG: 13.0 },           // audit mass budget; ground-speed cap that keeps KE ≤14.9 J
  mass175_cap15: { mass: 0.175, vCapG: 15.0 },           // same mass with the claimed cap → KE check
  mass175_cap13_cd0_05: { mass: 0.175, vCapG: 13.0, cd0: 0.05 },
  camPower3_5W: { pCam: 3.5 },                           // 50 MP readout + 4K encode + tracking on a phone-class SoC
  rows3072_binned: { camRows: 3072 },                    // 2×2-binned video readout of a 50 MP quad-Bayer sensor
  rows4300_remosaic: { camRows: 4300 },                  // full-res in-sensor crop with ≈0.7 effective linear resolution
  audit_realistic: { mass: 0.175, vCapG: 13.0, cd0: 0.05, pCam: 3.5, camRows: 4300 },
};
out.variants = {};
for (const [k, over] of Object.entries(VARS)) {
  const row = {};
  for (const id of ['nominal', 'short', 'gentle', 'headwind', 'crossgust']) {
    const R = C.simulate({ ...D, ...over }, scen(id));
    row[id] = { avail: r3(g(R, 'avail')), pxMed: r3(g(R, 'pxMed')), frontShare: r3(g(R, 'frontShare')), keMax: r3(g(R, 'keMax')), endurance: r3(g(R, 'endurance')), keepsLead: g(R, 'keepsLead'), fails: R.metrics.filter((x) => x.pass === false).map((x) => x.id) };
  }
  // rider-speed envelope for this variant
  row.leadEnvelope = [10, 11, 12, 13, 14].map((v) => { const R = C.simulate({ ...D, ...over }, { ...scen('nominal'), id: `v${v}`, skier: { duration: 41, vTarget: v, v0: v }, dur: 40 }); return { vTarget: v, keepsLead: g(R, 'keepsLead'), avail: r3(g(R, 'avail')), frontShare: r3(g(R, 'frontShare')), keMax: r3(g(R, 'keMax')) }; });
  out.variants[k] = { over, ...row };
}

// ------------------------------------------------------------- 6. closed-form aero / power / capture checks
{
  const p = { ...PDEF, ...D };
  const a = aero(p);
  const span = Math.sqrt(p.AR * p.S), chord = p.S / span, mu = 1.67e-5; // air at −10 °C
  const Re = (V) => (1.0 * V * chord) / mu;
  const k = 1 / (Math.PI * p.e * p.AR);
  const clOpt = Math.sqrt(p.cd0 / k), ldMax = 0.5 * Math.sqrt(1 / (k * p.cd0)), vLdMax = Math.sqrt((2 * p.mass * 9.81) / (1.0 * p.S * clOpt));
  out.aero = {
    span_m: r3(span), chord_m: r3(chord), wingLoading_Nm2: r3((p.mass * 9.81) / p.S),
    Re: Object.fromEntries([7, 8, 10, 12, 14].map((V) => [V, Math.round(Re(V))])),
    vStall: r3(a.vStall), CLat: Object.fromEntries([8, 10, 12, 14].map((V) => [V, r3((p.mass * 9.81) / (0.5 * V * V * p.S))])),
    LD: Object.fromEntries([8, 10, 12, 14].map((V) => [V, r3(ldAt(p, V))])), LDmax: r3(ldMax), vAtLDmax: r3(vLdMax), clAtLDmax: r3(clOpt),
    glideAngleDeg_12: r3((Math.atan(1 / ldAt(p, 12)) * 180) / Math.PI), glideAngleDeg_14_ld70: r3((Math.atan(1 / (0.7 * ldAt(p, 14))) * 180) / Math.PI),
    staticMotorW: r3(motorPower(p, p.T0, 0)), staticThrustToWeight: r3(p.T0 / (p.mass * 9.81)),
    batteryCurrentAtStaticA_3_5V: r3(motorPower(p, p.T0, 0) / 3.5 + (p.pAv + p.pCam + p.pTurret) / 3.5), cRateOn1000mAh: r3((motorPower(p, p.T0, 0) + p.pAv + p.pCam + p.pTurret) / 3.5 / 1.0),
    mass175: { vStall: r3(aero({ ...p, mass: 0.175 }).vStall), LD12: r3(ldAt({ ...p, mass: 0.175 }, 12)), LD13: r3(ldAt({ ...p, mass: 0.175 }, 13)), vCapForKE14_9: r3(Math.sqrt((2 * 14.9) / 0.175)), flightFloor1_3vs: r3(1.3 * aero({ ...p, mass: 0.175 }).vStall) },
    cd0BuildUp: { airfoilProfileRe50k: '0.015–0.022 (SD7037/AG-series, UIUC LSAT vol. 1–3 at Re 40–60k)', fuselageAndPod: '0.005–0.008 (≈30×30 mm section, Cd 0.3–0.5)', turretTailCam: '≈0.003', skidsClawsHoopHinges: '0.003–0.006', foldedPropAndVtail: '0.004–0.006', total: '0.030–0.045 → model 0.040 is plausible' },
  };
  // touchdown slide distance on 15° with μ_eff 0.9 claws from the reported touchdown speeds
  const th = (15 * Math.PI) / 180, dec = 9.81 * (0.9 * Math.cos(th) - Math.sin(th));
  out.perching = { clawDecel_ms2: r3(dec), slideFrom6ms_m: r3(36 / (2 * dec)), slideFrom6ms_iceMu0_3_m: r3(36 / (2 * 9.81 * (0.3 * Math.cos(th) - Math.sin(th)))), note: 'μ_eff 0.9 ASSUMED; on ice (μ≈0.3 with claws not biting) deceleration is 0.3 m/s² and the slide is ~60 m' };
  // snatch with claws still engaged: lanyard must break a 4 N anchor + μs·N first
  const anchor = p.anchorCap + p.muStatic * p.mass * 9.81 * Math.cos(th);
  out.capture = {
    hitRates: Object.fromEntries([3, 4, 5, 6, 8].map((v) => [v, { hoop40a: r3(captureProb('hoop40a', v)), hoop40a_wind9: r3(captureProb('hoop40a', v, { wind: 9 })), hoop40a_sigma1_5x: null }])),
    clawsEngagedBreakout_N: r3(anchor), lanyardExtAtBreakout_m: r3(anchor / p.lanyardK),
    snatchPeak: Object.fromEntries([4, 6, 8, 10].map((v) => [v, r3(snatchForce(p, v).peakN)])),
    note: 'aim model σ_lat = 0.035+0.013·v is ASSUMED (no data). Hit rate with 1.5× the assumed scatter computed below.',
  };
  // hit rate if real pole-aim scatter is 1.5× / 2× the assumption (manual MC, same geometry as hoop40a)
  const mc = (v, f) => { let s = 12345, ok = 0; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; const gs = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) * Math.cos(2 * Math.PI * rnd());
    for (let k2 = 0; k2 < 20000; k2++) { const sl = f * (0.035 + 0.013 * v), sv = 0.7 * sl; let ey = gs() * sl; const ez = gs() * sv; const pred = ey + gs() * (0.03 + 0.005 * v); ey -= Math.max(-0.15, Math.min(0.15, pred)); if (Math.abs(ey) < 0.16 && Math.abs(ez) < 0.16) ok++; } return ok / 20000; };
  out.capture.scatterSensitivity = Object.fromEntries([4, 5, 6].map((v) => [v, { x1: r3(mc(v, 1)), x1_5: r3(mc(v, 1.5)), x2: r3(mc(v, 2)), x2_noActiveShift: null }]));
}

// ------------------------------------------------------------- 7. endurance and per-run energy re-derivation
{
  const p = { ...PDEF, ...D };
  const pm = out.scenarios.nominal.metricsRerun.pMean.value;
  const e = (Wh, P) => r3((Wh * 60) / P);
  out.endurance = {
    claimedFormula: '(battWh + bankWh) × 0.75 × 0.9 / pMean',
    nominal_pMean_W: pm,
    claimed_min: e((p.battWh + p.bankWh) * 0.75 * 0.9, pm),
    withBankTransferEff0_85_min: e((p.battWh + p.bankWh * 0.85) * 0.75 * 0.9, pm),
    withCam3_5W_min: e((p.battWh + p.bankWh * 0.85) * 0.75 * 0.9, pm + 1.8),
    gentle6deg_withCam3_5W_min: e((p.battWh + p.bankWh * 0.85) * 0.75 * 0.9, out.scenarios.gentle.metricsRerun.pMean.value + 1.8),
    headwind_withCam3_5W_min: e((p.battWh + p.bankWh * 0.85) * 0.75 * 0.9, out.scenarios.headwind.metricsRerun.pMean.value + 1.8),
    onboardOnlyPerRun: { runSkiS: 150, Wh_nominal: r3((pm * 150) / 3600), Wh_nominal_cam3_5: r3(((pm + 1.8) * 150) / 3600), usableOnboardWh: r3(p.battWh * 0.75 * 0.9) },
  };
}

// ------------------------------------------------------------- 8. ops / standstill recount per criteria.js definitions
out.opsRecount = {
  criteriaDef: CRITERIA.ops.def.en,
  claimed: { ops: 2, standstill_s: 10, list: ['toss (deploy/launch)', 'snatch (land/recovery)'], stowCountedAs: '0 actions, 6 s standstill' },
  audit: {
    ops: 3, list: ['draw + toss (deploy/launch)', 'pole-basket snatch at the run-out (recovery, while moving)', 'unhook from the pole, fold wings, retract hoop/periscope, holster (stow)'],
    standstill_s: '4 + 10–15 (gloved unhook/fold/holster of a 0.7 m span glider with a 0.4 m hoop and a 0.35 m mast) = 14–19 s p50; + 8 s hand pick-up on a double miss; powder/soft piste edge: + walk/side-step to a glider ≥9 m off the line',
    pass: 'ops FAIL (3 > 2) by the shared definition; standstill passes (≤30 s) unless stranded',
  },
};

writeFileSync(join(here, 'out_leapfrog.json'), JSON.stringify(out, null, 1));
console.log('wrote out_leapfrog.json');
for (const [id, s] of Object.entries(out.scenarios)) console.log(id.padEnd(13), JSON.stringify(s.audit), 'stale:', s.staleVsResultsJson.map((x) => x.metric).join(','));
console.log(JSON.stringify(out.dtConvergence));
for (const [id, s] of Object.entries(out.seeds)) if (!Array.isArray(s)) console.log('seeds', id, s.min, s.median, s.max, s.shareFailingAnyStd, JSON.stringify(s.failCounts));
console.log('skierSeed', JSON.stringify(out.seeds.nominal_skierSeed.map((r) => [r.avail, r.fails])));
console.log('stop', JSON.stringify(out.stopScenario));
for (const [k, v] of Object.entries(out.variants)) console.log('var', k, JSON.stringify(Object.fromEntries(Object.entries(v).filter(([kk]) => kk !== 'over'))));
console.log(JSON.stringify(out.aero), JSON.stringify(out.perching), JSON.stringify(out.capture), JSON.stringify(out.endurance));
