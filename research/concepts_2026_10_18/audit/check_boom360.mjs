// Audit of S1 boom360 (read-only): modal check vs closed form, energy
// conservation of the chain integrator, dt convergence, harmonised metrics.
// Run from the repo root: node research/concepts_2026_10_18/audit/check_boom360.mjs
// Evidence: numerical checks of an uncalibrated model; not a physical test.
import { writeFileSync } from 'node:fs';
import C, { cfgFor, buildResult } from '../../../sim/js/concepts/boom360/index.js';
import { design, modes, Chain, runBoom, footageAnalysis, NSEG, SDT, G } from '../../../sim/js/concepts/boom360/model.js';
import { harmonisedJitterXY, jitterLOS, TH, r3, len, sub, dot } from './harmonise.mjs';

const P = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const out = { concept: 'boom360', generated: new Date().toISOString().slice(0, 10), evidence: 'audit re-computation on the uncalibrated model; not a physical test' };

// ---------------------------------------------------------------- 1. modes vs closed form
{
  const d = design(P);
  const md = modes(d);
  const L = d.L, mT = d.mTapes, mtip = d.mTip;
  // static tip compliance δ/F = ∫ (L−x)²/EI(x) dx + L²/k_root  (Rayleigh with static shape)
  const comp = (EIfun, kroot) => { let s = 0; const N = 4000; for (let i = 0; i < N; i++) { const x = (i + 0.5) * L / N; s += ((L - x) ** 2 / EIfun(x)) * (L / N); } return s + (L * L) / kroot; };
  // effective mass: tip + distributed mass weighted by the static shape (≈0.236 mT for a uniform cantilever, 1/3 for a rigid hinge)
  const shapeMass = (EIfun, kroot) => {
    const N = 400, w = new Float64Array(N + 1);
    // deflection under unit tip load
    for (let i = 0; i <= N; i++) { const x = (i * L) / N; let s = (x * L) / kroot; for (let j = 0; j < i; j++) { const xi = (j + 0.5) * L / N; s += ((L - xi) * (x - xi) / EIfun(xi)) * (L / N); } w[i] = s; }
    const wt = w[N]; let m = 0; for (let i = 0; i <= N; i++) m += (mT / N) * (i === 0 || i === N ? 0.5 : 1) * (w[i] / wt) ** 2;
    return mtip + m;
  };
  const latEI = () => d.EIlat(), sagEI = (x) => d.EIsag(x, L);
  const fLat = Math.sqrt(1 / comp(latEI, P.kRootLat) / shapeMass(latEI, P.kRootLat)) / (2 * Math.PI);
  const fSag = Math.sqrt(1 / comp(sagEI, P.kRootSag) / shapeMass(sagEI, P.kRootSag)) / (2 * Math.PI);
  // section check vs thin-walled ellipse formulas (independent recomputation)
  const a = 0.025, b = P.tapeD / 2000, t = P.tapeT / 1000;
  const Iw = (Math.PI / 4) * t * b * b * (b + 3 * a);
  out.modes = {
    model: md, rayleighLat: r3(fLat), rayleighSag: r3(fSag),
    errLatPct: r3((100 * (md.lat[0] - fLat)) / fLat), errSagPct: r3((100 * (md.sag[0] - fSag)) / fSag),
    EIlatCheck: r3(2 * P.Eeff * 1e9 * Iw), EIlatModel: r3(d.EIlat()), mTapes: r3(mT), mTip: mtip,
    note: 'Rayleigh quotient with the static tip-load shape incl. root spring; the model lumps 6 segments.',
  };
}

// ---------------------------------------------------------------- 2. energy conservation of the chain integrator
{
  const d = design(P);
  const res = {};
  for (const dt of [0.004, 0.001]) {
    const ch = new Chain(d);
    ch.setLength(d.L); ch.c.fill(0); ch.foldOn = false;
    const base = { r: [0, 0, 0], vr: [0, 0, 0], ar: [0, 0, 0], Q0: [1, 0, 0, 0, 1, 0, 0, 0, 1], w: [0, 0, 0], dw: [0, 0, 0] };
    for (let i = 0; i < ch.n; i++) ch.q[i] = i % 2 ? 0.02 : 0.03; // initial bend in both planes
    const energy = (grav) => {
      let ke = 0, pe = 0;
      for (let k = 1; k <= ch.N; k++) { ke += 0.5 * ch.m[k] * (ch.vel[3 * k] ** 2 + ch.vel[3 * k + 1] ** 2 + ch.vel[3 * k + 2] ** 2); if (grav) pe += ch.m[k] * G * ch.p[3 * k + 2]; }
      for (let i = 0; i < ch.n; i++) pe += 0.5 * ch.k[i] * (ch.q[i] - ch.qrest[i]) ** 2;
      return ke + pe;
    };
    for (const grav of [false, true]) {
      // static tip-load shape (≈ first mode), tip load 3 N lateral + 3 N sagittal (≈ 10–20 mm tip deflection)
      for (let j = 0; j < ch.N; j++) for (let a = 0; a < 2; a++) { const i = 2 * j + a; ch.q[i] = (3 * (d.L - j * ch.D)) / ch.k[i]; ch.v[i] = 0; }
      ch.kin(base);
      const E0 = energy(grav);
      const steps = Math.round(2 / dt);
      let Emax = E0, Emin = E0;
      for (let s = 0; s < steps; s++) {
        ch.kin(base); ch.F.fill(0);
        if (grav) for (let k = 1; k <= ch.N; k++) ch.F[3 * k + 2] -= ch.m[k] * G;
        ch.Kc.length = 0; ch.solve(dt, null, s * dt);
        ch.kin(base);
        const E = energy(grav); Emax = Math.max(Emax, E); Emin = Math.min(Emin, E);
      }
      ch.kin(base);
      const E1 = energy(grav);
      res[`dt${dt}_${grav ? 'gravity' : 'elastic'}`] = { E0: r3(E0), E2s: r3(E1), driftPct: r3((100 * (E1 - E0)) / Math.abs(E0)), maxPct: r3((100 * (Emax - E0)) / Math.abs(E0)) };
    }
  }
  out.energy = { ...res, note: 'undamped chain (structural+root damping zeroed), fixed base, 2 s free vibration from the static tip-load shape; θ=0.52 adds slight numerical dissipation, positive drift would indicate instability' };
}

// ---------------------------------------------------------------- 3. dt convergence + harmonised metrics per scenario
const pick = (R, id) => R.metrics.find((m) => m.id === id)?.value;
function harmonised(p, sc, raw, cfg) {
  const fa = footageAnalysis(raw, p);
  const ns = raw.ns, d = raw.design;
  // in-frame offset = LOS vs crop (small angle) + integrated residual rotation, as in footageAnalysis
  const ex = new Float64Array(ns), ey = new Float64Array(ns);
  let rx = 0, ry = 0;
  const resid = new Float64Array(ns).fill(NaN), losArr = [];
  for (let i = 0; i < ns; i++) {
    losArr.push([fa.u[3 * i], fa.u[3 * i + 1], fa.u[3 * i + 2]]);
    const cx = fa.crop[3 * i], cy = fa.crop[3 * i + 1], cz = fa.crop[3 * i + 2];
    let rgt = [cy, -cx, 0]; const lr = Math.hypot(rgt[0], rgt[1]) || 1; rgt = [rgt[0] / lr, rgt[1] / lr, 0];
    const up = [rgt[1] * cz, -rgt[0] * cz, rgt[0] * cy - rgt[1] * cx];
    const u = [fa.u[3 * i], fa.u[3 * i + 1], fa.u[3 * i + 2]];
    if (i > 0 && fa.filming[i] && fa.filming[i - 1]) {
      const w = [raw.wCam[3 * i], raw.wCam[3 * i + 1], raw.wCam[3 * i + 2]], wh = [raw.wCamHP[3 * i], raw.wCamHP[3 * i + 1], raw.wCamHP[3 * i + 2]];
      const res = [p.eisResid * w[0] + wh[0], p.eisResid * w[1] + wh[1], p.eisResid * w[2] + wh[2]];
      rx += dot(res, up) * SDT; ry += dot(res, rgt) * SDT;
      resid[i] = Math.hypot(dot(res, up), dot(res, rgt)) * 180 / Math.PI;
    } else { rx = 0; ry = 0; }
    ex[i] = dot(u, rgt) + rx; ey[i] = dot(u, up) + ry;
  }
  const S = raw.samples;
  // harmonised availability denominator: rider skiing (speed > 2 m/s, not fallen)
  let ski = 0, good = 0;
  for (let i = 0; i < ns; i++) { const s = S[i]; if (s.speed > 2 && !s.fallen && raw.beta[i] < 0.05) { ski++; if (fa.filming[i] && fa.inF[i] && fa.px[i] >= 300) good++; } }
  const jit = harmonisedJitterXY(ex, ey, fa.filming, SDT, 1.0);
  const jl = jitterLOS(losArr, resid, fa.filming, SDT, 1.0);
  // KE: rider-relative (device is within 1.5 m of the rider) with m_eff = tip + 1/3 tapes; camera-only ground-frame KE for reference
  const mEff = d.mTip + d.mTapes / 3;
  let keRel = 0, keCamAbs = 0, latMax = 0, lat99 = [];
  for (let i = 1; i < ns - 1; i++) {
    if (raw.stateCode[i] === 0) continue;
    const vt = [0, 1, 2].map((c) => (raw.tip[3 * (i + 1) + c] - raw.tip[3 * (i - 1) + c]) / (2 * SDT));
    const vr = [0, 1, 2].map((c) => (raw.rootW[3 * (i + 1) + c] - raw.rootW[3 * (i - 1) + c]) / (2 * SDT));
    keRel = Math.max(keRel, 0.5 * mEff * len(sub(vt, vr)) ** 2);
    keCamAbs = Math.max(keCamAbs, 0.5 * p.mCam * len(vt) ** 2);
    // lateral protrusion of the tip beyond the rider's own swept corridor (|y_travel| > 0.3 m)
    const s = S[i]; if (s.speed < 2 || s.fallen || raw.stateCode[i] !== 3) continue;
    const vh = Math.hypot(s.vel[0], s.vel[1]) || 1, left = [-s.vel[1] / vh, s.vel[0] / vh];
    const lat = Math.abs((raw.tip[3 * i] - s.pos[0]) * left[0] + (raw.tip[3 * i + 1] - s.pos[1]) * left[1]);
    latMax = Math.max(latMax, lat); lat99.push(lat);
  }
  lat99.sort((a, b) => a - b);
  // body force: subtract static weight of the worn parts, 50 ms moving mean, upright skiing only
  const Wst = d.addedMass * G;
  let fpk = 0; const win = 3; // 3 samples × 20 ms ≈ 50 ms (samples are already instantaneous at 20 ms)
  for (let i = win; i < ns; i++) { if (S[i].fallen || raw.beta[i] > 0.05) continue; let s = 0; for (let k = 0; k < win; k++) s += raw.Fbody[i - k]; fpk = Math.max(fpk, Math.max(0, s / win - Wst)); }
  return {
    avail: r3((100 * good) / Math.max(1, ski)), jitter: r3(jl.jitter), jitterLosHP: r3(jl.losHP), jitterLosRaw: r3(jl.losRawRate), jitterSubjInFrameHP: r3(jit.hp), jitterRawInFrame: r3(jit.raw),
    keRel: r3(keRel), keCamAbs: r3(keCamAbs), keChainAbs: r3(raw.peaks.ke), tipLatMax: r3(latMax), tipLatP99: r3(lat99[Math.floor(0.99 * (lat99.length - 1))] ?? NaN),
    bodyForceDyn50ms: r3(fpk), staticWeightN: r3(Wst),
  };
}

out.scenarios = [];
const DTS = [0.004, 0.002, 0.001];
for (const sc of C.scenarios) {
  const row = { id: sc.id, dt: {} };
  for (const dt of (['nominal', 'moguls', 'fallBack', 'snag', 'gust', 'damperFail', 'lift'].includes(sc.id) ? DTS : [0.004])) {
    const { cfg } = cfgFor(P, sc); cfg.dt = dt;
    const t0 = performance.now();
    const raw = runBoom(P, cfg);
    const R = buildResult(P, sc, raw, cfg);
    const m = {}; for (const id of ['avail', 'jitterRms', 'jitterBoom', 'tipTransRms', 'bodyForcePeak', 'rootMomentPeak', 'keMax', 'foldCount', 'stickVisible', 'yawTorquePeak']) m[id] = r3(pick(R, id));
    m.ms = Math.round(performance.now() - t0);
    if (dt === 0.004) Object.assign(row, { harmonised: harmonised(P, sc, raw, cfg), events: R.events.filter((e) => e.severity !== 'info').map((e) => `${e.t} ${e.type}`) });
    row.dt[dt] = m;
  }
  out.scenarios.push(row);
  console.log(sc.id, JSON.stringify(row.dt), JSON.stringify(row.harmonised));
}

// ---------------------------------------------------------------- 4. inertia reference check
{
  // whole-body roll inertia about the feet line: I_cm(AP) ≈ 12–15 kg·m² (standing adult, de Leva/Zatsiorsky order)
  // plus m·h_cm², h_cm ≈ 1.0 m (crouched skier ~0.9 m)
  const Icm = 12.5, m = 80;
  const Ifeet = (h) => Icm + m * h * h;
  out.inertiaReference = {
    modelRollRef: 12.5, rollAboutFeet_h1_0: Ifeet(1.0), rollAboutFeet_h0_9: Ifeet(0.9),
    addedRollModel: 3.27, addedRollPctCorrected: r3((100 * 3.27) / Ifeet(0.95)),
    yawBodyPlusSkis: 1.5 + 2 * (1.7 * 1.75 ** 2) / 12 + 0.1, addedYaw: 0.60, addedYawPctCorrected: r3((100 * 0.6) / (1.5 + 2 * (1.7 * 1.75 ** 2) / 12 + 0.1)),
    note: 'I_BODY_ROLL = 12.5 kg·m² is a centroidal value but is compared with added inertia taken about the feet; consistent reference ≈ 85–93 kg·m². Skis (2 × 1.7 kg, 1.75 m) add ≈0.9 kg·m² in yaw.',
  };
}
writeFileSync(new URL('./out_boom360.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ modes: out.modes, energy: out.energy, inertia: out.inertiaReference }, null, 1));
