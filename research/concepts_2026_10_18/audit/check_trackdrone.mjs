// Audit of S2 trackdrone (read-only): hover/forward-flight power vs closed form,
// energy bookkeeping, dt convergence, shared-jitter-function check, harmonised metrics.
// Run from the repo root: node research/concepts_2026_10_18/audit/check_trackdrone.mjs
// Evidence: numerical checks of an uncalibrated model; not a physical test.
import { writeFileSync } from 'node:fs';
import C from '../../../sim/js/concepts/trackdrone/index.js';
import { DEFAULTS, derive, elecPower, trim, makeRider, riderGeom, addResidualJitter, FILMING, airDensity } from '../../../sim/js/concepts/trackdrone/model.js';
import { jitterLOS, losJitterShared, losJitterVector, TH, r3, sub, nrm, len, dot, D2R } from './harmonise.mjs';

const P0 = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const P = { ...DEFAULTS, ...P0 };
const out = { concept: 'trackdrone', generated: new Date().toISOString().slice(0, 10), evidence: 'audit re-computation on the uncalibrated model; not a physical test' };

// ---------------------------------------------------------------- 1. power vs closed form
{
  const D = derive(P);
  const rho = 79495 / (287.05 * 263.15); // ISA 2000 m pressure, −10 °C
  const A = 4 * Math.PI * (P.rotorD / 2) ** 2, W = P.mass * 9.81;
  const Pid = Math.sqrt(W ** 3 / (2 * rho * A));
  const rows = [];
  for (const V of [0, 6, 12, 18, 24]) { const tr = trim(P, V); rows.push({ V, tiltDeg: r3(tr.tiltDeg), power: r3(tr.power), feasible: tr.feasible }); }
  out.power = {
    rho: r3(D.rho), rhoCheck: r3(rho), discArea: r3(A), idealHoverW: r3(Pid), modelHoverW: r3(D.PhW + P.pAvionics),
    hoverCheckW: r3(Pid / P.fom + P.pAvionics), diskLoadingNm2: r3(W / A), trim: rows,
    benchmark: 'DJI Avata (410 g, 4×~74 mm ducted) ≈ 18.6 Wh / ~18 min ⇒ ≈ 60 W mean; scaled to 245 g at equal disc area by W^1.5 ⇒ ≈ 28 W at sea level. Model hover 53.5 W at 2000 m/−10 °C (ρ≈1.05) with FoM 0.38: conservative by up to ~1.6× (FoM_eff of good ducted whoops ≈ 0.45–0.6).',
  };
}

// ---------------------------------------------------------------- 2. scenarios: dt convergence + harmonised metrics
const pick = (R, id) => R.metrics.find((m) => m.id === id)?.value;
function harmonised(R, sc, P) {
  const rider = makeRider(sc.rider);
  const Cc = R.columns, n = R.n;
  const filming = new Uint8Array(n), skiing = new Uint8Array(n);
  const los = [], fwd = [];
  for (let i = 0; i < n; i++) {
    const s = rider.at(Cc.t[i]);
    const valid = R.validUntil === null || Cc.t[i] <= R.validUntil;
    filming[i] = FILMING.has(Cc.mode[i]) && valid ? 1 : 0;
    skiing[i] = s.speed > 2 && !s.fallen ? 1 : 0;
    const g = riderGeom(s);
    const cam = [Cc.camx[i], Cc.camy[i], Cc.camz[i]];
    los.push(Number.isFinite(cam[0]) ? nrm(sub(g.mid, cam)) : null);
    fwd.push(Number.isFinite(Cc.fx[i]) ? [Cc.fx[i], Cc.fy[i], Cc.fz[i]] : [1, 0, 0]);
  }
  // residual stabilisation (same model as the concept: addResidualJitter) → residual rotation rate
  const fw = addResidualJitter(fwd, { cols: Cc });
  const resid = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const a = Math.acos(Math.max(-1, Math.min(1, dot(fw[i], fwd[i])))), b = Math.acos(Math.max(-1, Math.min(1, dot(fw[i - 1], fwd[i - 1]))));
    resid[i] = Math.abs(a - b) / 0.02 / D2R * Math.SQRT2; // two-axis magnitude (approx.)
  }
  const mask = Uint8Array.from(filming, (f, i) => (f && skiing[i] ? 1 : 0));
  const jl = jitterLOS(los, resid, mask, 0.02, 1.0);
  // physically consistent residual: gimbal leaks ~0.2 % of the airframe angular RATE (−54 dB) plus a 0.5 °/s floor
  const residC = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) residC[i] = Math.hypot(0.002 * Math.abs(Cc.tilt[i] - Cc.tilt[i - 1]) / 0.02, 0.5);
  const jlC = jitterLOS(los, residC, mask, 0.02, 1.0);
  let rs = 0, rk = 0; for (let i = 1; i < n; i++) if (mask[i] && Number.isFinite(resid[i])) { rs += resid[i] ** 2; rk++; }
  // shared losJitter (magnitude difference) vs vector version on the concept's own arrays
  const idx = []; for (let i = 0; i < n; i++) if (filming[i]) idx.push(i);
  const losF = idx.map((i) => los[i]), fwF = idx.map((i) => fw[i]);
  // availability over skiing time
  let ski = 0, good = 0;
  for (let i = 0; i < n; i++) if (skiing[i] && (R.validUntil === null || Cc.t[i] <= R.validUntil)) { ski++; if (filming[i] && Cc.avail[i] === 1) good++; }
  let keMax = 0; for (let i = 0; i < n; i++) if (filming[i] && Number.isFinite(Cc.ke[i])) keMax = Math.max(keMax, Cc.ke[i]);
  let vmax = 0; for (let i = 0; i < n; i++) if (filming[i] && Number.isFinite(Cc.gs[i])) vmax = Math.max(vmax, Cc.gs[i]);
  // energy bookkeeping: ∫ power dt (sampled) vs integrator energy; power breakdown
  let eS = 0, nA = 0, pMax = 0, tiltSum = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(Cc.power[i]) && Cc.power[i] > 0) { eS += Cc.power[i] * 0.02; nA++; pMax = Math.max(pMax, Cc.power[i]); tiltSum += Cc.tilt[i]; }
  return {
    avail: r3((100 * good) / Math.max(1, ski)), jitter: r3(jl.jitter), jitterResidModelRms: r3(Math.sqrt(rs / Math.max(1, rk))), jitterWithRateResid: r3(jlC.jitter), jitterLosHP: r3(jl.losHP), jitterLosRaw: r3(jl.losRawRate),
    jitterSharedFn: r3(losJitterShared(fwF, losF, 0.02)), jitterVectorFn: r3(losJitterVector(fwF, losF, 0.02)),
    keGround: r3(keMax), vGroundMax: r3(vmax), massForKE14_9AtVmax: r3((2 * 14.9) / (vmax * vmax)),
    energyWhSampled: r3(eS / 3600), meanPowerW: r3(nA ? eS / (nA * 0.02) : NaN), peakPowerW: r3(pMax), meanTiltDeg: r3(nA ? tiltSum / nA : NaN),
  };
}

out.scenarios = [];
for (const sc of C.scenarios) {
  const row = { id: sc.id, dt: {} };
  const dts = ['nominal', 'highspeed', 'crosswind', 'short', 'fall', 'treeline'].includes(sc.id) ? [0.005, 0.0025] : [0.005];
  for (const dt of dts) {
    const t0 = performance.now();
    const R = C.simulateWith(P0, sc, dt === 0.005 ? {} : { dtInt: dt });
    const m = {}; for (const id of ['avail', 'pxMed', 'jitterRms', 'azRange', 'keMax', 'endurance', 'energyRun', 'minDistRider', 'crossMax', 'minClrTree', 'setupTime', 'bodyForcePeak']) m[id] = r3(pick(R, id));
    m.validUntil = R.validUntil; m.ms = Math.round(performance.now() - t0);
    row.dt[dt] = m;
    if (dt === 0.005) { row.harmonised = harmonised(R, sc, P); row.events = R.events.filter((e) => e.severity !== 'info').map((e) => `${e.t} ${e.type}`).slice(0, 10); }
  }
  out.scenarios.push(row);
  console.log(sc.id, JSON.stringify(row.dt), JSON.stringify(row.harmonised));
}

// ---------------------------------------------------------------- 3. endurance / charging physics
{
  const nom = out.scenarios.find((s) => s.id === 'nominal');
  const whRun = nom.dt[0.005].energyRun; // Wh per 3-min run incl. launch/dock
  const usableCold = P.battWh * 0.9 * 0.7 * (1 - P.reserve);
  const usableWarm = P.battWh * 0.9 * 0.95 * (1 - P.reserve);
  const pMean = nom.harmonised.meanPowerW;
  out.endurance = {
    whPerRun: whRun, usableColdWh: r3(usableCold), minutesPerBatteryCold: r3((usableCold * 60) / pMean),
    batteriesFor45minCold: r3(45 / ((usableCold * 60) / pMean)), batteriesFor45minWarmPocket: r3(45 / ((usableWarm * 60) / pMean)),
    podChargeAt1C_W: P.battWh, podChargePerLift8min_Wh_at1C: r3((P.battWh * 8) / 60), podChargeLimitNote: 'Li-ion charging at ≤5 °C is normally limited to ≤0.3–0.5 C to avoid lithium plating; the model assumes 20 W (≈1.5 C) into a pod held at 5 °C',
    powerBankMassNotCounted: 'POD_CHARGE_W assumes a pack power bank that is not included in addedMass',
  };
}
writeFileSync(new URL('./out_trackdrone.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ power: out.power, endurance: out.endurance }, null, 1));
