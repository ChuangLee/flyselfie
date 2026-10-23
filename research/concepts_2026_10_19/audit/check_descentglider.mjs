// Independent audit of descentglider (read-only use of the concept code).
// Run from the repo root: node research/concepts_2026_10_19/audit/check_descentglider.mjs
// Writes research/concepts_2026_10_19/audit/out_descentglider.json.
// Evidence: numerical re-computation on an uncalibrated model; not a physical test.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import concept, { buildResult, prepare, SCEN, RUN_S } from '../../../sim/js/concepts/descentglider/index.js';
import { PDEF, RHO, wingGeom, stallSpeed, hoverPower, tipWind, vKE } from '../../../sim/js/concepts/descentglider/model.js';
import { footageStability, CRITERIA } from '../../../sim/js/concepts/common/criteria.js';

const here = dirname(fileURLToPath(import.meta.url));
const P0 = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const r = (x, n = 2) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : x);
const mv = (R, id) => R.metrics.find((m) => m.id === id)?.value;
const sc = (id) => SCEN.find((s) => s.id === id);
const out = { concept: 'descentglider', generated: '2026-10-19', evidence: 'audit re-computation on the uncalibrated model; not a physical test' };

// ---------------------------------------------------------------- 1. closed-form aero / sizing
{
  const mass = P0.dryMass + P0.battWh / 380;
  const p = { ...PDEF, ...P0, mass };
  const nu = 1.67e-5 / RHO; // μ(−10 °C) ≈ 1.67e-5 Pa·s
  const rows = {};
  for (const s of [0, 1]) {
    const g = wingGeom(s, p), c = g.S / g.b;
    const LD = 1 / (2 * Math.sqrt(g.cd0 * g.k)), CLopt = Math.sqrt(g.cd0 / g.k);
    const vLD = Math.sqrt((2 * mass * 9.81) / (RHO * g.S * CLopt));
    rows[s ? 'swept' : 'spread'] = { S: g.S, b: g.b, AR: r(g.AR), chord_m: r(c, 3), e: g.e, cd0: r(g.cd0, 4), CLmax: g.clmax, LDmax: r(LD), CL_LDmax: r(CLopt, 3), V_LDmax: r(vLD), Vstall: r(stallSpeed(s, p)), Re_at_8: r((8 * c) / nu, -3), Re_at_12: r((12 * c) / nu, -3), Re_at_15: r((15 * c) / nu, -3) };
  }
  // hover power with a more typical micro-prop FoM×η (0.35) and the stated 0.5
  out.aero = { rho: RHO, mass_kg: r(mass, 4), configs: rows,
    hover_W: { model_fomEta0p5: r(hoverPower(p), 1), fomEta0p40: r(hoverPower({ ...p, fomEta: 0.4 }), 1), fomEta0p35: r(hoverPower({ ...p, fomEta: 0.35 }), 1) },
    staticThrustRequired_perMotor_g: r((mass * 9.81) / 2 / 9.81 * 1000, 0), claimedStatic_perMotor_g: r((2.6 / 2) / 9.81 * 1000, 0),
  };
  // tip-over wind vs wind angle off the span, with/without the snow-spike moment
  const tw = {};
  for (const beta of [0, 15, 30, 45, 90]) tw[beta] = { anchored: r(tipWind(p, beta), 1), ice_anchorM0: r(tipWind({ ...p, anchorM: 0 }, beta), 1) };
  out.tipWind_ms_atBody = tw;
  out.tipWind_note = 'model applies 0.64× the mean wind at 0.18 m (log law) and 0.8× gust excursions, so free-stream tip-over is ≈1/0.64 of these for steady wind; perch yaw is frozen at touchdown';
}

// ---------------------------------------------------------------- 2. per-scenario: claimed vs independent
const STD = Object.keys(CRITERIA);
out.scenarios = {};
const base = {};
for (const s of SCEN) {
  const R = concept.simulate(P0, s); base[s.id] = R;
  const fs = footageStability(R);
  const C = R.columns; let keG = 0, keRule = 0, keGall = 0;
  for (let i = 0; i < R.n; i++) {
    const kg = C.keSnow[i], kr = C.keRel[i], d = C.headDist[i];
    if (Number.isFinite(kg)) keGall = Math.max(keGall, kg);
    if (Number.isFinite(d) && Number.isFinite(kg)) keRule = Math.max(keRule, d > 1.5 ? kg : kr);
  }
  const m = {}; for (const id of STD) { const x = R.metrics.find((y) => y.id === id); m[id] = x ? [r(x.value), x.pass] : null; }
  out.scenarios[s.id] = { fault: !!s.fault, compare: !!s.compare, claimed: m, footageStability: { subjectRms: r(fs.subjectRms), backgroundRms: r(fs.backgroundRms) },
    keRecomputedRule: r(keRule), keGroundAnyDistance: r(keGall), events: R.events.filter((e) => e.severity !== 'info').map((e) => `${r(e.t)} ${e.type}`) };
}

// ---------------------------------------------------------------- 3. dt convergence
{
  const conv = {};
  for (const id of ['nominal', 'stop', 'gust', 'cycle_w5']) {
    const row = {};
    for (const dt of [0.004, 0.002, 0.001]) {
      const s = sc(id), prep = prepare(P0, s); prep.input.dt = dt;
      const R = buildResult(P0, s, prep);
      row[dt] = { avail: r(mv(R, 'avail')), pFollow: r(mv(R, 'pFollow')), keMax: r(mv(R, 'keMax')), endurance: r(mv(R, 'endurance')), tipped: mv(R, 'tipped') };
    }
    conv[id] = row;
  }
  out.dtConvergence = conv;
}

// ---------------------------------------------------------------- 4. wind-seed sensitivity
{
  const ss = {};
  for (const id of ['nominal', 'gust', 'stop', 'short', 'cycle_w5']) {
    const rows = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 17]) {
      const s = { ...sc(id), wind: { ...sc(id).wind, seed } };
      const R = concept.simulate(P0, s);
      rows.push({ seed, avail: r(mv(R, 'avail'), 1), endurance: r(mv(R, 'endurance'), 1), ops: mv(R, 'ops'), setup: r(mv(R, 'setupTime'), 1), tipped: mv(R, 'tipped') ?? null });
    }
    const a = rows.map((x) => x.avail).filter(Number.isFinite).sort((x, y) => x - y);
    ss[id] = { defaultSeed: sc(id).wind.seed, availMin: a[0], availMedian: a[a.length >> 1], availMax: a[a.length - 1], availPassShare: r(a.filter((x) => x >= 80).length / a.length, 2), rows };
  }
  out.seedSensitivity = ss;
}

// ---------------------------------------------------------------- 5. full-cycle wind sweep 0–9 m/s (setupTime p90, ops, avail)
{
  const rows = [];
  const dirs = { downslopeTail: [1, 0], cross: [0, 1], upslopeHead: [-1, 0], diagTail: [0.707, 0.707] };
  for (const U of [0, 3, 5, 7, 9]) for (const [dn, d] of Object.entries(dirs)) for (const seed of [2, 6, 8]) {
    if (U === 0 && dn !== 'cross') continue;
    const s = { ...sc('cycle'), id: 'cycle', wind: { mean: [U * d[0], U * d[1], 0], intensity: 0.3, Lu: 20, seed } };
    const R = concept.simulate(P0, s);
    const ev = R.events.map((e) => e.type);
    // standstill incl. recovery: tipped/badTouchdown +15 s (walk ≤5 m, right it); fail-safe/tailwind landings off-track: +60 s (walk/side-step to it, ASSUMED)
    let st = mv(R, 'setupTime');
    const tipped = ev.includes('tipover') || ev.includes('badTouchdown'), off = ev.includes('failsafe') || ev.includes('tailwindAbort'), crash = ev.includes('snowStrike') || ev.includes('collision');
    const stRec = st + (tipped ? 15 : 0) + (off ? 60 : 0) + (crash ? 30 : 0);
    rows.push({ U, dir: dn, seed, avail: r(mv(R, 'avail'), 1), setupClaimed: r(st, 1), setupWithRecovery: r(stRec, 1), ops: mv(R, 'ops'), endurance: r(mv(R, 'endurance'), 1), headLaunch: mv(R, 'headLaunch') ?? null, events: ev.filter((e) => !['follow', 'move', 'takeoff', 'transition', 'wingborne', 'flare', 'hoverland', 'stop', 'planted'].includes(e)) });
  }
  const pct = (a, q) => { const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.round(q * (v.length - 1)))]; };
  out.cycleWindSweep = {
    n: rows.length,
    setupP90_claimedRule: pct(rows.map((x) => x.setupClaimed), 0.9),
    setupP90_withRecovery: pct(rows.map((x) => x.setupWithRecovery), 0.9),
    availMedian: pct(rows.map((x) => x.avail), 0.5), availPassShare: r(rows.filter((x) => x.avail >= 80).length / rows.length, 2),
    opsOver2Share: r(rows.filter((x) => x.ops > 2).length / rows.length, 2),
    palmLaunchHeadFail: rows.filter((x) => x.headLaunch != null && x.headLaunch < 0.5).length,
    rows,
  };
}

// ---------------------------------------------------------------- 6. component-realism sensitivity
{
  const cases = {
    claimed: {},
    batt200WhKg: { dryMass: P0.dryMass + (P0.battWh / 200 - P0.battWh / 380) },
    batt150WhKg: { dryMass: P0.dryMass + (P0.battWh / 150 - P0.battWh / 380) },
    sameMass_battWh_at200: { battWh: (P0.battWh / 380) * 200 },
    avionics3p3W: { pAvionics: 3.3 },
    fomEta0p35: { fomEta: 0.35 },
    realistic: { dryMass: P0.dryMass + 0.008 + (P0.battWh / 200 - P0.battWh / 380), pAvionics: 3.3, fomEta: 0.35, tStatic: 2.6 },
    realistic_LDm30: { dryMass: P0.dryMass + 0.008 + (P0.battWh / 200 - P0.battWh / 380), pAvionics: 3.3, fomEta: 0.35, dragScale: 1.43 },
  };
  const res = {};
  for (const [k, over] of Object.entries(cases)) {
    const pp = { ...P0, ...over };
    const mass = pp.dryMass + pp.battWh / 380;
    const row = { mass_g: r(mass * 1000, 1), vKEcap_ms: r(0.92 * vKE(mass)) };
    for (const id of ['nominal', 'stop', 'cycle', 'fast', 'gust']) {
      const R = concept.simulate(pp, sc(id));
      row[id] = { avail: r(mv(R, 'avail'), 1), endurance: r(mv(R, 'endurance'), 1), pFollow: r(mv(R, 'pFollow')), keMax: r(mv(R, 'keMax')), hoverJ: r(mv(R, 'hoverJ'), 0) };
    }
    res[k] = row;
  }
  out.componentSensitivity = res;
}

// ---------------------------------------------------------------- 7. endurance accounting check
{
  const p = { ...PDEF, ...P0 };
  const Euse = p.battWh * 3600 * p.coldFactor * 0.85;
  const per = (pf, ov) => (pf * RUN_S + ov);
  const pF = mv(base.nominal, 'pFollow');
  // overhead per run from the code: launch 77 + one perch cycle 130 + end 127 J (hover 14.6 W); a day with 2 stops per run and FoM·η 0.35 instead
  out.enduranceCheck = {
    usableJ: r(Euse, 0), RUN_S, pFollowNominal: r(pF),
    claimed_min: r(Euse / (per(pF, 334) / RUN_S) / 60, 1),
    twoStopsPerRun_min: r(Euse / (per(pF, 334 + 130) / RUN_S) / 60, 1),
    hover0p35_twoStops_min: r(Euse / (per(pF, (334 + 130) * 0.5 / 0.35) / RUN_S) / 60, 1),
    perchedWaitIncluded: false,
    note: 'endurance counts only filmed follow seconds; the perched/landed time (camera on at 0.85×2.6 W) and the wait at the top are excluded; a 5 min run with 60 s of stops adds ≈130 J',
  };
}

writeFileSync(join(here, 'out_descentglider.json'), JSON.stringify(out, null, 1));
console.log('wrote out_descentglider.json');
