// S2 trackdrone model checks (SIM-030): physics sanity, limits, dt convergence
// and the expected qualitative behaviour per scenario. Code verification of an
// uncalibrated numerical model only — not validation of the concept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import C, { TRACKDRONE_SCENARIOS as SCEN, trim, derive, cycleTrial, runScenario, dockSweep, designParams } from '../js/concepts/trackdrone/index.js';
import { DEFAULTS, airDensity, elecPower, MODES } from '../js/concepts/trackdrone/model.js';

const P0 = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const sc = (id) => SCEN.find((s) => s.id === id);
const metric = (R, id) => { const m = R.metrics.find((x) => x.id === id); assert.ok(m, `metric ${id}`); return m.value; };
const cache = new Map();
const run = (id) => { if (!cache.has(id)) cache.set(id, C.simulate(P0, sc(id))); return cache.get(id); };

test('air density and hover power reproduce the ideation calc (calc_rotor_follow.py)', () => {
  const rho = airDensity(2000, -10);
  assert.ok(Math.abs(rho - 1.05) < 0.02, `rho ${rho}`);
  // calc used rho = 1.00: 51.5 W hover for the 245 g ducted design point
  const D = derive(designParams({ design: 1, altM: 2000, tempC: -10 }));
  const Phover1 = D.PhW * Math.sqrt(D.rho / 1.0);
  assert.ok(Math.abs(Phover1 - 51.5) < 2.5, `hover ${Phover1}`);
  // electrical power rises with airspeed (parasite) and is above hover at 16 m/s
  const V1 = designParams({ design: 1 });
  const p0 = trim(V1, 0).power, p16 = trim(V1, 16).power;
  assert.ok(p16 > 1.8 * p0, `${p0} ${p16}`);
  assert.ok(elecPower(D, V1, D.W, 0, 0, 0) > V1.pAvionics);
  // v2 fairing lowers the drag-dominated power at speed
  const V2 = designParams({ design: 2, mass: 0.245 });
  assert.ok(trim(V2, 16).power < 0.8 * trim(V1, 16).power);
});

test('tilt-limited airspeed is finite and below the calc optimistic bound (extra drag terms)', () => {
  const V1 = designParams({ design: 1 }), V2 = designParams({ design: 2, mass: 0.245 });
  assert.ok(trim(V1, 18).feasible);
  assert.ok(!trim(V1, 26).feasible, '26 m/s airspeed should exceed the v1 tilt limit');
  assert.ok(trim(V2, 22).feasible, 'v2 faired airframe reaches 22 m/s airspeed');
});

test('thrust, tilt and kinetic-energy columns respect the vehicle limits', () => {
  for (const id of ['nominal', 'highspeed', 'crosswind', 'dock']) {
    const R = run(id), c = R.columns, D = derive(designParams(P0));
    for (let i = 0; i < R.n; i++) {
      assert.ok(c.thrust[i] <= D.Tmax * 1.001, `${id} thrust ${c.thrust[i]}`);
      assert.ok(c.tilt[i] <= P0.tiltMaxDeg + 0.5, `${id} tilt ${c.tilt[i]}`);
      const v2 = c.vx[i] ** 2 + c.vy[i] ** 2 + c.vz[i] ** 2;
      assert.ok(Math.abs(c.ke[i] - 0.5 * designParams(P0).mass * v2) < 1e-6);
    }
  }
});

test('battery: state of charge never increases while flying and sags under load', () => {
  const R = run('nominal'), c = R.columns;
  for (let i = 1; i < R.n; i++) assert.ok(c.soc[i] <= c.soc[i - 1] + 1e-9);
  assert.ok(c.soc[R.n - 1] < 100 && c.soc[R.n - 1] > 50);
  assert.ok(metric(R, 'vCellMin') < 4.18);
  // per pack in the calc ballpark; day endurance = packs × per pack (harmonised ≥45 min)
  const e = metric(R, 'perPack');
  assert.ok(e > 4 && e < 14, `per pack ${e}`);
  assert.ok(Math.abs(metric(R, 'endurance') - e * P0.packs) < 1e-6);
  const v1 = run('nominal_v1');
  assert.ok(metric(v1, 'endurance') < 45 && metric(R, 'endurance') > metric(v1, 'endurance'));
});

test('results converge with the internal time step (5 ms vs 2.5 ms)', () => {
  const a = runScenario(P0, sc('nominal')).res, b = runScenario(P0, sc('nominal'), { dtInt: 0.0025 }).res;
  let se = 0, k = 0;
  for (let i = 0; i < Math.min(a.n, b.n); i += 5) { se += (a.cols.dx[i] - b.cols.dx[i]) ** 2 + (a.cols.dy[i] - b.cols.dy[i]) ** 2 + (a.cols.dz[i] - b.cols.dz[i]) ** 2; k++; }
  const rms = Math.sqrt(se / k);
  assert.ok(rms < 0.3, `trajectory rms difference ${rms}`); // calibrated 1.18 g carving: more transient motion
  assert.ok(Math.abs(a.summary.energyWh - b.summary.energyWh) / a.summary.energyWh < 0.03);
});

test('nominal: follows behind at a safe distance with good framing', () => {
  const R = run('nominal');
  assert.ok(metric(R, 'avail') >= 80);
  assert.ok(metric(R, 'minDistRider') >= 3);
  assert.equal(metric(R, 'overheadT'), 0);
  assert.ok(metric(R, 'crossMax') < 1.5); // v3 smooths across the swept turn band (cap 0.8 m) plus tracking error
  assert.ok(metric(R, 'jitterRms') <= 3, 'harmonised >1 Hz jitter');
  assert.ok(metric(R, 'azRange') >= 45, 'commanded side pass delivers azimuth span');
  const lag = R.columns.lag.filter(Number.isFinite);
  assert.ok(lag.every((x) => x >= 0.3 - 1e-9 && x <= 2.0 + 1e-9));
});

test('high speed + headwind: falls behind (KE governor and tilt envelope)', () => {
  const R = run('highspeed'), N = run('nominal');
  assert.ok(metric(R, 'avail') < 50 && metric(R, 'avail') < metric(N, 'avail'));
});

test('kinetic energy: v2 150 g governor keeps ≤14.9 J in every scenario; v1 245 g does not', () => {
  for (const s of SCEN) assert.ok(metric(run(s.id), 'keMax') <= 14.9 || s.id === 'nominal_v1', `${s.id} ${metric(run(s.id), 'keMax')}`);
  assert.ok(metric(run('nominal_v1'), 'keMax') > 14.9);
});

test('rider fall: drone brakes and holds ≥3 m away, never overhead, does not dock', () => {
  const R = run('fall');
  assert.ok(metric(R, 'stopClear') >= 3);
  assert.equal(metric(R, 'overheadT'), 0);
  assert.ok(!R.events.some((e) => e.type === 'docked'));
  assert.ok(R.events.some((e) => e.type === 'fallHold'));
});

test('short turns + stop: stops short of the rider and auto-docks', () => {
  const R = run('short');
  assert.ok(metric(R, 'stopClear') >= 3);
  assert.ok(R.events.some((e) => e.type === 'docked'));
});

test('beacon dropout: v2 brakes and climbs then re-acquires; v3 keeps filming on the vision fallback', () => {
  const V2 = C.simulate({ ...P0, design: 2 }, sc('dropout')), c = V2.columns;
  assert.ok(V2.events.some((e) => e.type === 'beaconLost'));
  assert.ok(metric(V2, 'lostClimb') > 0.5);
  let lostSeen = false;
  for (let i = 0; i < V2.n; i++) if (MODES[c.mode[i]] === 'lost') lostSeen = true;
  assert.ok(lostSeen);
  const R = run('dropout');
  assert.ok(metric(R, 'avail') >= 80, `v3 avail ${metric(R, 'avail')}`);
  assert.ok(metric(R, 'avail') > metric(V2, 'avail'));
  assert.equal(R.validUntil, null);
  // the fallback degrades with light: fewer detections in poor light
  const dim = C.simulate({ ...P0, lightFactor: 0.3 }, sc('dropout'));
  assert.ok(metric(dim, 'avail') <= metric(R, 'avail'));
});

test('tree line and overhang (calibrated carving rider): v2 strikes; v3 depth sensor avoids the strike', () => {
  for (const id of ['treeline', 'overhang']) {
    const V2 = C.simulate({ ...P0, design: 2 }, sc(id));
    assert.ok(V2.events.some((e) => e.type === 'treeStrike') && V2.validUntil !== null, `v2 ${id}`);
    const V3 = run(id);
    assert.equal(V3.validUntil, null, `v3 ${id} must not strike`);
    assert.ok(metric(V3, 'minClrTree') > 0);
  }
  const O3 = run('overhang');
  assert.ok(O3.events.some((e) => e.type === 'avoid'));
  assert.ok(metric(O3, 'avail') >= 80);
  // honest residual: the tree line with 1.3–1.5 m passes costs most of the footage (braking with no KE margin to catch up)
  assert.ok(metric(run('treeline'), 'avail') < 80);
});

test('crossing skier: v2 does not react (<3 m); v3 detects, climbs and yields (≥3 m)', () => {
  const V2 = C.simulate({ ...P0, design: 2 }, sc('crossing'));
  assert.ok(metric(V2, 'minDistOther') < 3);
  const R = run('crossing');
  assert.ok(R.events.some((e) => e.type === 'yield'));
  assert.ok(metric(R, 'minDistOther') >= 3);
});

test('leapfrog/pan: pre-positioned pass-by beats chasing at 18 m/s but stays far below 80 % (KE limit)', () => {
  const chase = run('highspeed'), leap = run('highspeed_leap');
  assert.ok(metric(leap, 'avail') > metric(chase, 'avail'));
  assert.ok(metric(leap, 'avail') < 80);
  assert.ok(metric(leap, 'keMax') <= 14.9);
  assert.ok(metric(leap, 'azRange') > 90, 'pass-by pans front → side → rear');
});

test('docking: v1 degrades with wind, v2 (cone + into wind + commit) holds better; p90 standstill', () => {
  const calm = cycleTrial(designParams(P0), [0, 0, 0], 0.25, 41);
  assert.ok(calm.ok);
  const R = run('dock');
  assert.ok(metric(R, 'dock0') >= 95);
  assert.ok(R.events.some((e) => e.type === 'docked'));
  const s1 = dockSweep(designParams({ ...P0, design: 1 })), s2 = dockSweep(designParams(P0));
  const at9 = (sw) => sw.rows.find((r) => r.U === 9).success;
  assert.ok(at9(s2) >= at9(s1));
  assert.ok(s2.p90 <= s1.p90);
  assert.ok(metric(R, 'headClr') >= 0.3);
});

test('regulatory gate and VLOS are reported as failing, not hidden', () => {
  const R = run('nominal');
  assert.equal(R.metrics.find((m) => m.id === 'regGate').pass, false);
  assert.equal(R.metrics.find((m) => m.id === 'vlos').pass, false);
});

test('demo: stages contiguous, leapfrog, obstacle avoidance and a full cycle docked at the end', () => {
  const D = C.demo.build(P0);
  const ev = D.events.map((e) => e.type);
  assert.ok(ev.includes('launch') && ev.includes('docked') && ev.includes('avoid'));
  assert.ok(D.events.some((e) => /leap/.test(e.en)));
  assert.equal(D.validUntil, null);
  const f = D.frame(D.duration);
  assert.equal(f.device.mode, 'docked');
  assert.ok(D.frame(20).productCam);
});

test('each scenario computes fast enough for the browser main thread', () => {
  for (const s of SCEN) {
    const t0 = performance.now(); C.simulate(P0, s); const ms = performance.now() - t0;
    assert.ok(ms < 4000, `${s.id} ${ms.toFixed(0)} ms`);
  }
});
