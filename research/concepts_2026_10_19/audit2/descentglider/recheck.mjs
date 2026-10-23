// Audit2 (round 2, iteration 2) independent recheck of descentglider v2 on spot cases of the shared 39-case
// full-run ensemble. Uses the developer's physics (runCore/analyse) from a COPY of sim/, but recomputes the judged
// metrics from raw time series with the auditor's own code (criteria.js / ITERATE_BRIEF definitions).
// Usage: [ALL=1] node recheck.mjs [copyRoot]  (ALL=1: all 39 cases, no footageStability)   (copyRoot contains sim/ and research/concepts_2026_10_19/dev/; default env DG_COPY)
// Writes recheck_out.json next to this script. Numerical-uncalibrated simulation, not a physical test.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as presolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = presolve(process.argv[2] || process.env.DG_COPY || '/tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/dgcopy');
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const idx = await imp('sim/js/concepts/descentglider/index.js');
const concept = idx.default;
const { runCore, isMoving, isFlying, MODE } = await imp('sim/js/concepts/descentglider/model.js');
const { analyse } = await imp('sim/js/concepts/descentglider/analysis.js');
const { footageStability } = await imp('sim/js/concepts/common/criteria.js');
const { enduranceMin, BATTERY } = await imp('sim/js/concepts/common/components.js');
const { FULLRUN_CASES } = await imp('sim/js/concepts/common/fullrun.js');
const claimed = JSON.parse(readFileSync(join(root, 'research/concepts_2026_10_19/dev/descentglider/results.json'), 'utf8'));
const cl = Object.fromEntries(claimed.ensemble.cases.map((c) => [c.id, c]));

const P = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
const SPOT0 = ['calm_s11', 'head3_s11', 'tail3_s12', 'crossL3_s13', 'crossR3_s12', 'head6_s11', 'tail6_s11', 'tail6_s12', 'crossR6_s12', 'head9_s12', 'tail9_s12', 'crossR9_s12'];
const ALL = process.env.ALL === '1';
const SPOT = ALL ? FULLRUN_CASES.map((c) => c.id) : SPOT0;
const dt = 0.02, r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const segDist = (p, a, b) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]; const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2; const u = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (L || 1))); return Math.hypot(ap[0] - u * ab[0], ap[1] - u * ab[1], ap[2] - u * ab[2]); };
const DRAW_S = 3, STOW_S = 5, WALK = 1.5, LIFT_MIN = 6, XFER = 0.85;

const rows = [];
let pSum = 0, pN = 0, eRun = [];
for (const id of SPOT) {
  const c = FULLRUN_CASES.find((x) => x.id === id);
  const pr = idx.prepareFullRun(P, { caseId: id });
  const core = runCore(pr.p, pr.input);
  const A = analyse(core, pr.sk, pr.p);
  const O = core.O, n = core.n, m = pr.p.mass;
  // ---- avail: denominator = riding time of the shared full run (col.riding), refused/no-fly runs = 0
  let nRide = 0, nGood = 0, nSpd = 0, nGoodSpd = 0;
  const riding = pr.sk.col.riding;
  for (let i = 0; i < n; i++) {
    const good = A.cam[i] === 1 && A.inFrame[i] === 1 && A.px[i] >= 300;
    if (riding[i] === 1) { nRide++; if (good) nGood++; }
    if (pr.sk.col.v[i] > 2) { nSpd++; if (good) nGoodSpd++; }
  }
  // no-fly runs: the sim stops after the interlock landing (DRAW+40 s); the rider then skis the whole run without footage
  const fullRideS = pr.sk.rides ? pr.sk.rides.reduce((a, r) => a + (r.t1 - r.t0), 0) : NaN;
  const availRiding = pr.noFly ? 0 : (100 * nGood) / nRide;
  const availSpeed2 = pr.noFly ? 0 : (100 * nGoodSpd) / nSpd;
  // ---- KE: ground frame beyond 1.5 m of the rider's body (feet→head segment), rider frame within; all moving modes
  let ke = 0, keAt = null, minBody = Infinity, keTd = NaN;
  for (let i = 0; i < n; i++) {
    if (!isMoving(O.mode[i])) continue;
    const s = core.rider(i * dt);
    const H = 1.75 * (1 - 0.16 * (s.crouch ?? 0.3));
    const pos = [O.x[i], O.y[i], O.z[i]];
    const d = segDist(pos, s.pos, [s.pos[0], s.pos[1], s.pos[2] + H]);
    if (O.mode[i] !== MODE.THROWN) minBody = Math.min(minBody, d);
    const v = [O.vx[i], O.vy[i], O.vz[i]], vr = [v[0] - s.vel[0], v[1] - s.vel[1], v[2] - s.vel[2]];
    const k = d > 1.5 ? 0.5 * m * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) : 0.5 * m * (vr[0] ** 2 + vr[1] ** 2 + vr[2] ** 2);
    if (k > ke) { ke = k; keAt = { t: r2(i * dt), mode: O.mode[i], distBody: r2(d), speed: r2(Math.hypot(...v)) }; }
  }
  // crash: snow strike KE (last flying sample before CRASH)
  let crashKE = null;
  for (let i = 1; i < n; i++) if (O.mode[i] === MODE.CRASH && O.mode[i - 1] !== MODE.CRASH) crashKE = r2(0.5 * m * (O.vx[i - 1] ** 2 + O.vy[i - 1] ** 2 + O.vz[i - 1] ** 2));
  // ---- standstill: top = from t=0 (rider standing) to push-off; end = last stop → glider at rest + walk + stow
  const ev = core.events, has = (t) => ev.some((e) => e.type === t);
  const crashed = has('snowStrike'), fs = has('failsafe') || has('geofence'), anywhere = has('landAnywhere');
  const slide = core.sum.slide;
  let top, endWait, walk, restDist = NaN;
  if (pr.noFly) {
    top = DRAW_S; endWait = (slide.restT ?? (n - 1) * dt) - DRAW_S;
    const s0 = core.rider(0); restDist = slide.restPos ? Math.hypot(slide.restPos[0] - s0.pos[0], slide.restPos[1] - s0.pos[1]) : NaN;
    walk = crashed || !Number.isFinite(restDist) || restDist > 12 ? 30 : Math.max(0, restDist - 1) * WALK;
  } else {
    // top standstill measured from the rider column itself: first sample where riding = 1
    let iPush = 0; while (iPush < n && riding[iPush] !== 1) iPush++;
    top = iPush * dt;
    const tStop = pr.sk.stops[pr.sk.stops.length - 1].t0;
    if (slide.restT != null) { const s = core.rider(slide.restT); restDist = Math.hypot(slide.restPos[0] - s.pos[0], slide.restPos[1] - s.pos[1]); endWait = Math.max(0, slide.restT - tStop); walk = Math.max(0, restDist - 1) * WALK; }
    if (crashed || fs || anywhere || slide.restT == null || restDist > 12) { endWait = Number.isFinite(endWait) ? endWait : 0; walk = 30; }
  }
  const setup = top + endWait + walk + STOW_S;
  // ---- ops: throw + pick-up/stow, +1 for each recovery event (crash, fail-safe, land-anywhere, never at rest)
  const ops = 2 + (crashed ? 1 : 0) + (fs ? 1 : 0) + (anywhere && !crashed ? 1 : 0) + (slide.restT == null && !crashed ? 1 : 0);
  // ---- energy: throw → rest
  const tA = core.sum.tThrow ?? 0, tB = slide.restT ?? (n - 1) * dt;
  const Ewh = O.E[Math.min(n - 1, Math.round(tB / dt))] - O.E[Math.round(tA / dt)];
  const pMean = (Ewh * 3600) / Math.max(1, tB - tA);
  pSum += pMean; pN++; eRun.push(Ewh);
  // ---- footage stability via the shared criteria.js on the Result
  const fsR = ALL ? { subjectRms: NaN, backgroundRms: NaN, samples: 0 } : footageStability(concept.simulate(P, { id: `audit_${id}`, kind: 'fullrun', fr: id, zh: id, en: id, expect: { zh: '', en: '' } }));
  const K = cl[id];
  rows.push({
    id, U: c.U, dir: c.dir, noFly: !!pr.noFly,
    claimed: { avail: K.avail, setup: K.setup, ops: K.ops, keMax: K.keMax, pMean: K.pMean, jitter: K.jitter, tdKE: K.tdKE, crashed: K.crashed, landMinRider: K.landMinRider },
    recomputed: { availRiding: r2(availRiding), availSpeed2: r2(availSpeed2), ridingS: r2(nRide * dt), fullRideS: r2(fullRideS), setup: r2(setup), top: r2(top), endWait: r2(endWait), walk: r2(walk), restDist: r2(restDist), ops, keMax: r2(ke), keAt, crashKE, minBodyDistInFlight: r2(minBody), landMinRider: r2(slide.minRider), tdKE: r2(slide.tdKE), pMean: r2(pMean), Ewh: r2(Ewh * 1000) / 1000, crashed, failsafe: fs },
    footageStability: { subjectRms: r2(fsR.subjectRms), backgroundRms: r2(fsR.backgroundRms), samples: fsR.samples },
  });
  console.log(id, JSON.stringify(rows[rows.length - 1].recomputed).slice(0, 300), JSON.stringify(rows[rows.length - 1].footageStability));
}
// ---- endurance two ways (shared components.js rules)
const bankWh = P.bankWh, battWh = P.battWh;
const whEff = bankWh * XFER + battWh;
const pAll = claimed.ensemble.cases.map((c) => c.pMean).filter(Number.isFinite);
const pMeanEns = pAll.reduce((a, b) => a + b, 0) / pAll.length;
const devMethod = enduranceMin(whEff, pMeanEns, { heated: true });
// per-run accounting: flight energy + heater for the whole lift ride (0.6 W × LIFT_MIN), filming = riding time per run
const eAll = claimed.ensemble.cases.map((c) => c.Ewh).filter(Number.isFinite);
const eMean = eAll.reduce((a, b) => a + b, 0) / eAll.length;
const usable = whEff * BATTERY.coldFactor * (1 - BATTERY.reserve);
const perRunWh = eMean + BATTERY.heaterW * LIFT_MIN / 60;
const runs = usable / perRunWh;
const ridingMinPerRun = 71 / 60; // 38 s + 33 s shared plan
const endurancePerRun = runs * ridingMinPerRun;
// flying-cell limit: usable flying-cell energy vs per-run energy (must be ≥1 run between lift recharges)
const flyUsable = battWh * BATTERY.coldFactor * (1 - BATTERY.reserve);
const out = {
  generated: new Date().toISOString().slice(0, 10), copyRoot: root, spot: rows,
  endurance: { devMethod_min: r2(devMethod), pMeanEns_W: r2(pMeanEns), perRunAccounting: { meanRunWh: r2(eMean * 1000) / 1000, heaterPerLiftWh: BATTERY.heaterW * LIFT_MIN / 60, usableWh: r2(usable), runsPerCharge: r2(runs), filmingMinPerRun: r2(ridingMinPerRun), filmingMin: r2(endurancePerRun) }, flyingCellUsableWh: r2(flyUsable), flyingCellRuns: r2(flyUsable / eMean), note: 'dev method = enduranceMin(bank·0.85 + cell, ensemble mean throw→rest power, heated) i.e. minutes of airborne time incl. loiter/landing; per-run accounting counts the heater over the whole lift ride and only riding minutes as filming' },
};
writeFileSync(join(here, ALL ? 'recheck_all_out.json' : 'recheck_out.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.endurance));
