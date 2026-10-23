// Audit of S3 tetherdrone (read-only): rotor power vs closed form, tether
// electrical loss vs closed form, tether statics (catenary) check, substep
// convergence, harmonised metrics.
// Run from the repo root: node research/concepts_2026_10_18/audit/check_tetherdrone.mjs
// Evidence: numerical checks of an uncalibrated model; not a physical test.
import { writeFileSync } from 'node:fs';
import C from '../../../sim/js/concepts/tetherdrone/index.js';
import { PDEF, runCore, rotorPower, tetherElectrical, applyHardFall } from '../../../sim/js/concepts/tetherdrone/model.js';
import { analyse } from '../../../sim/js/concepts/tetherdrone/analysis.js';
import { simulateSkier, skierAt, bodyPoints } from '../../../sim/js/concepts/common/skier.js';
import { jitterLOS, r3, sub, nrm, len, dot } from './harmonise.mjs';

const P0 = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const P = { ...PDEF, ...P0 };
const out = { concept: 'tetherdrone', generated: new Date().toISOString().slice(0, 10), evidence: 'audit re-computation on the uncalibrated model; not a physical test' };

// ---------------------------------------------------------------- 1. power / electrical closed forms
{
  const W = P.mass * 9.81, A = 4 * Math.PI * P.rotorR ** 2;
  const Pid = Math.sqrt(W ** 3 / (2 * P.rho * A));
  const model = rotorPower(W, [0, 0, 1], [0, 0, 0], P);
  // forward flight at 12 m/s, towed by the tether: horizontal balance drag − T_h(tether), solve tilt; closed-form Glauert
  const glauert = (T, V, alpha) => { // alpha = disc tilt into the wind (+ = nose down)
    const vh2 = T / (2 * P.rho * A); let vi = Math.sqrt(vh2);
    const un = V * Math.sin(alpha), ut = V * Math.cos(alpha);
    for (let k = 0; k < 200; k++) vi = 0.5 * vi + 0.5 * (vh2 / Math.hypot(ut, un + vi));
    return (T * (un + vi)) / P.fom;
  };
  const rows = [];
  for (const [V, Tteth, elev] of [[0, 0, 35], [12, 0, 35], [12, 1.5, 35], [18, 1.5, 35]]) {
    const D = 0.5 * P.rho * P.CdA * V * V;
    const el = (elev * Math.PI) / 180;
    const Fx = D - Tteth * Math.cos(el); // net horizontal force the rotor must supply (+ = forward)
    const Fz = W + Tteth * Math.sin(el);
    const T = Math.hypot(Fx, Fz), alpha = Math.atan2(Fx, Fz);
    const n = [Math.sin(alpha), 0, Math.cos(alpha)], u = [-V, 0, 0];
    rows.push({ V, tetherN: Tteth, thrustN: r3(T), tiltDeg: r3((alpha * 180) / Math.PI), modelW: r3(rotorPower(T, n, u, P)), closedFormW: r3(glauert(T, V, alpha)), towPowerFromRiderW: r3(Tteth * Math.cos(el) * V) });
  }
  // tether electrical: R = 2ρL/A; 100 V
  const L = 6, Pl = 50;
  const Rth = (2 * 1.72e-8 * L) / (P.cuArea * 1e-6);
  const I = (P.Vbus - Math.sqrt(P.Vbus ** 2 - 4 * Rth * Pl)) / (2 * Rth);
  const te = tetherElectrical(Pl, P.Vbus, L, P);
  out.power = {
    idealHoverW: r3(Pid), modelRotorHoverW: r3(model), closedFormHoverW: r3(Pid / P.fom), plusAvionics: r3(model + 6),
    forward: rows,
    tether: { R_ohm: r3(Rth), modelR: r3(te.R), I_A: r3(I), modelI: r3(te.I), lossW: r3(I * I * Rth), modelLoss: r3(te.loss), lossPct: r3((100 * I * I * Rth) / Pl) },
    rhoNote: 'tetherdrone uses ρ = 1.0 kg/m³ (fixed), trackdrone derives 1.05 (ISA 2000 m, −10 °C); boom uses 1.0. ~5 % effect on induced power.',
    voltageNote: '100 V DC on a body-worn, flexing, possibly wet conductor exceeds the 60 V DC ES1/SELV limit (IEC 62368-1); requires reinforced insulation + ground-fault/arc detection.',
  };
}

// ---------------------------------------------------------------- 2. tether static tension check (taut line, small sag)
{
  // span 6 m, μ 1.8 g/m: sag for horizontal tension H: f = μ g s² / (8H)
  const mu = P.muT / 1000, s = 6;
  out.tetherStatics = { sagAt1_5N_mm: r3((1000 * mu * 9.81 * s * s) / (8 * 1.5)), weightN: r3(mu * 9.81 * s), dragAt12ms_N: r3(0.5 * P.rho * 1.2 * (P.dT / 1000) * s * 12 * 12 * 0.57) };
}

// ---------------------------------------------------------------- 3. per-scenario harmonised metrics + substep convergence
function prep(sc) {
  const sk = simulateSkier({ ...sc.skier });
  if (sc.hardFall) applyHardFall(sk, sc.hardFall.t, sc.hardFall.decel);
  const plan = { ...(sc.plan || {}) };
  if (sc.branch) { const s = skierAt(sk, sc.branch.t); plan.branch = { x: s.pos[0], y0: s.pos[1] - sc.branch.half, y1: s.pos[1] + sc.branch.half, h: sc.branch.h }; }
  return { sk, input: { duration: sc.dur, skier: sk, tGo: sc.tGo || 0, wind: sc.wind, plan, seed: 11 } };
}
function metricsFrom(core, sk, plan) {
  const an = analyse(core, sk, { branch: plan.branch });
  const A = an.cols, O = core.O, n = core.n;
  const settle = Math.round(2 / 0.02);
  let T0max = 0, headMin = Infinity, keSnow = 0, keRel = 0;
  const los = new Array(n).fill(null), mask = new Uint8Array(n), resid = new Float64Array(n).fill(NaN);
  let ski = 0, good = 0;
  for (let i = settle; i < n; i++) {
    T0max = Math.max(T0max, O.T0[i]);
    const fly = A.flying[i] === 1;
    if (O.mode[i] % 10 >= 2) headMin = Math.min(headMin, A.headDist[i]);
    if (fly) { keSnow = Math.max(keSnow, A.keSnow[i]); keRel = Math.max(keRel, A.keRel[i]); }
    const s = core.rider(i * 0.02);
    const skiing = s.speed > 2 && !s.fallen;
    if (skiing) { ski++; if (fly && A.inFrame[i] === 1 && A.subjectPx[i] >= 300) good++; }
    if (fly && skiing) {
      const b = bodyPoints(s); const mid = [b.pelvis[0] + b.up[0] * 0.15, b.pelvis[1] + b.up[1] * 0.15, b.pelvis[2] + b.up[2] * 0.15];
      los[i] = nrm(sub(mid, [A.cpx[i], A.cpy[i], A.cpz[i]])); mask[i] = 1;
      if (i > 0) resid[i] = Math.hypot(0.002 * Math.abs(O.tilt[i] - O.tilt[i - 1]) / 0.02, 0.5); // same rate-consistent residual as applied to S2
    }
  }
  const jl = jitterLOS(los, resid, mask, 0.02, 1.0);
  const jl0 = jitterLOS(los, null, mask, 0.02, 1.0);
  return { avail: r3((100 * good) / Math.max(1, ski)), jitter: r3(jl.jitter), jitterNoResid: r3(jl0.jitter), jitterLosRaw: r3(jl.losRawRate), T0max: r3(T0max), headMin: r3(headMin), keGround: r3(keSnow), keRelRider: r3(keRel) };
}
out.scenarios = [];
for (const sc of C.scenarios) {
  const row = { id: sc.id, sub: {} };
  for (const sf of (['nominal', 'short', 'fast', 'fall', 'snag', 'gust'].includes(sc.id) ? [0.75, 0.375] : [0.75])) {
    const pr = prep(sc);
    const t0 = performance.now();
    const core = runCore(P, { ...pr.input, subFactor: sf });
    const m = metricsFrom(core, pr.sk, pr.input.plan);
    m.ms = Math.round(performance.now() - t0);
    m.warnings = core.events.filter((e) => e.severity !== 'info').map((e) => `${e.t.toFixed(2)} ${e.type}`).slice(0, 6);
    row.sub[sf] = m;
  }
  out.scenarios.push(row);
  console.log(sc.id, JSON.stringify(row.sub));
}
writeFileSync(new URL('./out_tetherdrone.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ power: out.power, statics: out.tetherStatics }, null, 1));
