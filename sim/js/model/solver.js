// Bounded browser solver for the first simulation release (FE-04, FE-05, FE-06).
//
// Point-mass kite (airborne mass incl. camera) on a straight spring-damper tether
// anchored at the skier's backpack. The skier follows a kinematic path on a planar
// slope. Relative airflow = ambient wind (+ seeded gusts) − kite velocity, so skier
// speed, wind and reel motion all enter jointly (EN-02). Coordinates: x horizontal
// down the fall line, y to the skier's left, z up; snow surface z = −x·tan(slope).
//
// The model is deliberately honest about its domain (VV-04): leaving the domain
// (low airspeed, sustained slack, ground or body contact) raises an `invalid`
// event; the run continues to be displayed but is flagged outside validity.

import { MODEL, MODEL_CONSTANTS as K, CONFIG, validateInputs } from './config.js';
import { interp, step } from './scenarios.js';
import { canonicalJSON, fnv1a, mulberry32, gaussian, v3 } from './util.js';

export const RESULT_SCHEMA = 'flyski-sim-result/1';
const PRE_RUN = 5; // s, settled pre-run for scenarios starting in flight
const GUST_TAU = 2; // s
const REEL_MODES = ['hold', 'payout', 'retrieve', 'jam', 'held'];

export const SIGNALS = [
  ['t', 's'], ['sx', 'm'], ['sy', 'm'], ['sz', 'm'], ['ax', 'm'], ['ay', 'm'], ['az', 'm'],
  ['kx', 'm'], ['ky', 'm'], ['kz', 'm'], ['kvx', 'm/s'], ['kvy', 'm/s'], ['kvz', 'm/s'],
  ['wx', 'm/s'], ['wy', 'm/s'], ['wz', 'm/s'], ['vax', 'm/s'], ['vay', 'm/s'], ['vaz', 'm/s'],
  ['skierSpeed', 'm/s'], ['airspeed', 'm/s'], ['L', 'm'], ['Ldot', 'm/s'], ['T', 'N'],
  ['lift', 'N'], ['drag', 'N'], ['height', 'm'], ['clearance', 'm'], ['handleForce', 'N'],
  ['reelPower', 'W'], ['operatorWork', 'J'], ['subjectAngle', 'deg'], ['subjectVisible', '1'],
  ['tetherHeadSep', 'deg'], ['energyResidual', 'J'], ['valid', '1'], ['reelMode', 'enum'],
];

export function effectiveInputs(scenario, inputs) {
  return { ...inputs, ...(scenario.overrides || {}) };
}

export function inputHash(scenario, inputs) {
  return fnv1a(canonicalJSON({ model: MODEL.id + '@' + MODEL.version, scenario: scenario.id, inputs: effectiveInputs(scenario, inputs) }));
}

function capsuleDistance(p, a, b) {
  const ab = v3.sub(b, a);
  const t = Math.max(0, Math.min(1, v3.dot(v3.sub(p, a), ab) / v3.dot(ab, ab)));
  return v3.len(v3.sub(p, v3.add(a, v3.scale(ab, t))));
}

const angle = (u, w) => Math.acos(Math.max(-1, Math.min(1, v3.dot(u, w))));
const DEG = 180 / Math.PI;

export function simulate(scenario, userInputs, opts = {}) {
  if (scenario.evidence !== 'numerical') throw new Error(`scenario ${scenario.id} has no numerical model (${scenario.evidence})`);
  const check = validateInputs(userInputs);
  if (!check.ok) throw Object.assign(new Error('invalid inputs'), { errors: check.errors });
  const P = effectiveInputs(scenario, userInputs);
  const effCheck = validateInputs(P);
  if (!effCheck.ok) throw Object.assign(new Error('invalid scenario overrides'), { errors: effCheck.errors });

  const dt = K.dt.v, sampleEvery = Math.round(K.sampleDt.v / dt);
  const m = P.airborneMass, g = K.g.v, k = K.tetherStiffness.v, c = K.tetherDamping.v;
  const tanS = Math.tan(P.slopeDeg / DEG);
  const psi = P.windFromDeg / DEG;
  const windDir = [-Math.cos(psi), -Math.sin(psi), 0];
  const halfSpan = 0.5 * Math.sqrt(2 * P.wingArea); // aspect ratio 2 envelope, geometry only
  const qS = 0.5 * P.airDensity * P.wingArea;
  const rng = mulberry32(P.seed);
  const base = P.skierSpeed;
  const omegaTurn = (2 * Math.PI) / P.turnPeriod;

  const tStart = scenario.start === 'flight' ? -PRE_RUN : 0;
  const tEnd = scenario.duration;
  const nSamples = Math.floor(tEnd / K.sampleDt.v) + 1;
  const cols = {};
  for (const [name] of SIGNALS) cols[name] = new Float64Array(nSamples);

  // skier state (integrated so that turning phase follows actual speed)
  const u0 = base * interp(scenario.speed, 0);
  let sx = -u0 * (0 - tStart), phase = -omegaTurn * (base > 0 ? u0 / base : 0) * (0 - tStart);
  const skier = (u) => {
    const phiDot = omegaTurn * (base > 0 ? u / base : 0);
    const sy = P.turnAmplitude * Math.sin(phase), syd = P.turnAmplitude * Math.cos(phase) * phiDot;
    const pos = [sx, sy, -sx * tanS];
    const hv = Math.hypot(u, syd);
    const head = hv > 0.05 ? [u / hv, syd / hv] : [1, 0];
    // backpack anchor sits behind the body axis along the heading
    const anchor = [pos[0] - K.anchorBack.v * head[0], pos[1] - K.anchorBack.v * head[1], pos[2] + P.anchorHeight];
    return { pos, vel: [u, syd, -u * tanS], anchor, phiDot };
  };

  let gust = [0, 0, 0];
  const wind = (t) => {
    const f = interp(scenario.wind, Math.max(t, 0));
    return v3.add(v3.scale(windDir, P.windSpeed * f), v3.scale(gust, f));
  };

  // kite initial state
  let s0 = skier(u0);
  let L, p, v, released;
  if (scenario.start === 'hand') {
    const reach = Math.min(0.9 * P.prePayout, 1.0);
    L = P.prePayout;
    p = v3.add(s0.anchor, v3.scale(v3.norm([-0.45, 0, 0.9]), reach));
    v = s0.vel.slice();
    released = false;
  } else {
    L = Math.min(scenario.initialLength ?? P.tetherMax, P.tetherMax);
    const rel = v3.sub(wind(tStart), s0.vel); // relative wind at the anchor
    const back = v3.len([rel[0], rel[1], 0]) > 0.1 ? v3.norm([rel[0], rel[1], 0]) : [-1, 0, 0];
    p = v3.add(s0.anchor, v3.scale(v3.norm([back[0], back[1], 1]), L));
    v = s0.vel.slice();
    released = true;
  }

  const events = [];
  const once = new Set();
  let validUntil = null, scopeEnd = null;
  let preRunInvalid = null;
  const emit = (t, type, severity, pos, detail = {}) => {
    if (t < 0) { if (severity === 'invalid') preRunInvalid = preRunInvalid || type; return; }
    events.push({ t: +t.toFixed(3), type, severity, pos: pos.map((x) => +x.toFixed(3)), detail });
    if (severity === 'invalid' && validUntil === null) validUntil = +t.toFixed(3);
  };

  let clearedBody = scenario.start === 'flight', releaseTime = tStart;
  let slackTime = 0, grounded = false, nearEnd = false, prevMode = null;
  let opWork = 0, energy0 = null, workAero = 0, workTether = 0;
  let warnClear = false, warnHead = false, warnFov = false, warnEnv = false;
  let maxT = 0, maxTt = 0;
  let si = 0;
  const totalSteps = Math.round((tEnd - tStart) / dt);

  for (let n = 0; n <= totalSteps; n++) {
    const t = tStart + n * dt;
    const tt = Math.max(t, 0);
    const u = base * interp(scenario.speed, tt);
    const S = skier(u);
    if (n % 10 === 0) {
      // OU gust process, updated every 10 ms, seeded → reproducible
      const a = Math.exp(-0.01 / GUST_TAU), b = P.gustIntensity * Math.sqrt(1 - a * a);
      gust = [gust[0] * a + b * gaussian(rng), gust[1] * a + b * gaussian(rng), gust[2] * a + 0.3 * b * gaussian(rng)];
    }
    const w = wind(t);

    if (!released && t >= scenario.release) {
      released = true;
      releaseTime = t;
      emit(t, 'release', 'info', p);
    }

    // reel command
    let mode = released ? step(scenario.reel, tt) : 'held';
    if (mode !== prevMode) {
      if (prevMode !== null && t >= 0) emit(t, 'reel_' + mode, mode === 'jam' ? 'warning' : 'info', p);
      prevMode = mode;
    }
    // tether geometry
    const rv = v3.sub(p, S.anchor);
    const d = v3.len(rv);
    const er = d > 1e-9 ? v3.scale(rv, 1 / d) : [0, 0, 1];
    let Ldot = 0;
    if (mode === 'payout' && L < P.tetherMax) Ldot = Math.min(P.payoutRate, (P.tetherMax - L) / dt);
    if (mode === 'retrieve' && !nearEnd) {
      // finite operator power (MC-03): retrieval speed s satisfies T(s)·s ≤ P_op with
      // T(s) = T0 + c·s, i.e. c·s² + T0·s − P_op = 0
      const T0 = d > L ? Math.max(0, k * (d - L) + c * v3.dot(v3.sub(v, S.vel), er)) : 0;
      const sPow = (-T0 + Math.sqrt(T0 * T0 + 4 * c * P.operatorPower)) / (2 * c);
      const s = Math.min(P.retrievalRate, sPow);
      Ldot = -Math.min(s, (L - K.nearEndLength.v) / dt);
    }

    // forces
    let T = 0, Fa = [0, 0, 0], liftMag = 0, dragMag = 0;
    const va = v3.sub(w, v);
    const V = v3.len(va);
    if (!grounded) {
      if (released) {
        const ddot = v3.dot(v3.sub(v, S.vel), er);
        if (d > L) T = Math.max(0, k * (d - L) + c * (ddot - Ldot));
        if (V > 1e-6) {
          const eva = v3.scale(va, 1 / V);
          const q = qS * V * V;
          dragMag = q * P.CD;
          // lift ⟂ airflow; direction blends tether-aligned (β=0, laterally
          // unstable point mass) with roll-stabilised vertical (β=1).
          const nT = v3.norm(v3.sub(er, v3.scale(eva, v3.dot(er, eva))));
          const nU = v3.norm(v3.sub([0, 0, 1], v3.scale(eva, eva[2])));
          const nperp = v3.add(v3.scale(nT, 1 - P.rollStability), v3.scale(nU, P.rollStability));
          const nl = v3.len(nperp);
          liftMag = nl > 1e-6 ? q * P.CL : 0;
          Fa = v3.add(v3.scale(eva, dragMag), nl > 1e-6 ? v3.scale(nperp, liftMag / nl) : [0, 0, 0]);
        }
        const F = v3.add(v3.add(Fa, v3.scale(er, -T)), [0, 0, -m * g]);
        workAero += v3.dot(Fa, v) * dt;
        workTether += v3.dot(v3.scale(er, -T), v) * dt;
        v = v3.add(v, v3.scale(F, dt / m));
        p = v3.add(p, v3.scale(v, dt));
      } else {
        p = v3.add(p, v3.scale(S.vel, dt));
        v = S.vel.slice();
      }
    }
    L += Ldot * dt;
    if (mode === 'retrieve' && !nearEnd && L <= K.nearEndLength.v + 1e-9) {
      nearEnd = true;
      emit(t, 'near_end', 'info', p, { note: 'near-end retrieval only; not handover or lock (UX-03)' });
      if (scopeEnd === null && validUntil === null) {
        scopeEnd = +t.toFixed(3);
        emit(t, 'model_scope_end', 'scope', p, { note: 'handover, locking and stowage are engineering illustrations, not modeled' });
      }
    }
    const reelPower = T * -Ldot;
    if (t >= 0 && reelPower > 0) opWork += reelPower * dt;

    // domain checks and events (only once released)
    const height = p[2] + p[0] * tanS;
    const head = [S.pos[0], S.pos[1], S.pos[2] + K.bodyHeight.v];
    const clearance = capsuleDistance(p, [S.pos[0], S.pos[1], S.pos[2] + 0.2], head) - K.bodyRadius.v - halfSpan;
    if (released && !grounded && scopeEnd === null) {
      if (V < P.minAirspeed && !once.has('low_airspeed')) {
        once.add('low_airspeed');
        emit(t, 'low_airspeed', 'invalid', p, { airspeed: +V.toFixed(2), note: 'lift loss / stall not modeled' });
      }
      slackTime = T <= 0 ? slackTime + dt : 0;
      if (slackTime >= K.slackInvalidAfter.v && !once.has('slack')) {
        once.add('slack');
        emit(t, 'slack', 'invalid', p, { note: 'slack tether shape and entanglement not modeled' });
      }
      if (height <= 0) {
        grounded = true;
        p = [p[0], p[1], -p[0] * tanS];
        v = [0, 0, 0];
        emit(t, 'ground_contact', 'invalid', p, { note: 'no contact model; kite frozen at contact point, forces unavailable' });
      }
      // hand-held launch: contact near the body is a permitted interface until the
      // kite has first cleared the body; failing to clear within the grace time is invalid.
      if (!clearedBody && clearance >= 0) clearedBody = true;
      if (!clearedBody && t - releaseTime > K.launchClearGrace.v && !once.has('no_clearance')) {
        once.add('no_clearance');
        emit(t, 'no_clearance_after_launch', 'invalid', p, { note: 'kite did not clear the body after release' });
      }
      // near the anchor the kite is in the docking/handover interface zone: a
      // permitted interface whose contact behaviour is not modeled (EN-04).
      const inDock = d < K.dockZone.v;
      if (inDock && !once.has('dock')) {
        once.add('dock');
        emit(t, 'docking_zone', 'info', p, { note: 'permitted interface zone; contact behaviour not modeled' });
      }
      if (inDock) { /* body checks suspended in the permitted interface zone */ }
      else if (clearedBody && clearance < 0 && !warnEnv) {
        warnEnv = true;
        emit(t, 'envelope_intrusion', 'warning', p, { note: 'conservative wing envelope (sphere of half-span) overlaps body volume; possible contact' });
      } else if (clearance >= 0.05) warnEnv = false;
      if (!inDock && clearedBody && clearance + halfSpan < 0 && !once.has('body_contact')) {
        once.add('body_contact');
        emit(t, 'body_contact', 'invalid', p, { note: 'kite centre inside body volume; no contact model' });
      }
      if (clearance < K.clearanceWarn.v && clearance >= 0 && !warnClear) {
        warnClear = true;
        emit(t, 'clearance_low', 'warning', p, { clearance: +clearance.toFixed(3) });
      } else if (clearance >= K.clearanceWarn.v + 0.05) warnClear = false;
      if (T > maxT && t >= 0) { maxT = T; maxTt = t; }
    }

    // imaging geometry (FE-09): nadir-looking lens hanging below the kite
    const cam = [p[0], p[1], p[2] - P.cameraDrop];
    const dF = v3.norm(v3.sub(S.pos, cam)), dH = v3.norm(v3.sub(head, cam));
    const nadir = [0, 0, -1];
    const visible = Math.max(angle(dF, nadir), angle(dH, nadir)) <= P.cameraFovDeg / 2 / DEG;
    const subjAng = angle(dF, dH) * DEG;
    let sep = Infinity;
    for (let s = 0.1; s <= 0.85; s += 0.05) {
      const q = v3.add(p, v3.scale(v3.sub(S.anchor, p), s));
      sep = Math.min(sep, angle(v3.norm(v3.sub(q, cam)), dH));
    }
    const headRad = Math.atan(0.12 / Math.max(v3.len(v3.sub(head, cam)), 0.12));
    if (released && t >= 0 && scopeEnd === null) {
      if (sep < headRad && !warnHead) { warnHead = true; emit(t, 'tether_over_head', 'warning', cam, { note: 'geometric line-of-sight approximation' }); }
      else if (sep > headRad * 1.5) warnHead = false;
      if (!visible && !warnFov) { warnFov = true; emit(t, 'subject_out_of_fov', 'warning', cam); }
      else if (visible) warnFov = false;
    }

    const E = 0.5 * m * v3.dot(v, v) + m * g * p[2];
    if (t >= 0 && energy0 === null) { energy0 = E; workAero = 0; workTether = 0; }

    // record
    if (t >= -1e-9 && n % sampleEvery === 0 && si < nSamples) {
      const unavailable = grounded;
      const row = {
        t, sx: S.pos[0], sy: S.pos[1], sz: S.pos[2], ax: S.anchor[0], ay: S.anchor[1], az: S.anchor[2],
        kx: p[0], ky: p[1], kz: p[2], kvx: v[0], kvy: v[1], kvz: v[2], wx: w[0], wy: w[1], wz: w[2],
        vax: va[0], vay: va[1], vaz: va[2], skierSpeed: u,
        airspeed: unavailable ? NaN : V, L, Ldot, T: unavailable ? NaN : T,
        lift: unavailable ? NaN : liftMag, drag: unavailable ? NaN : dragMag,
        height, clearance, handleForce: unavailable ? NaN : T * P.crankRatio,
        reelPower: unavailable ? NaN : reelPower, operatorWork: opWork,
        subjectAngle: subjAng, subjectVisible: visible ? 1 : 0, tetherHeadSep: sep * DEG,
        energyResidual: unavailable || !released || energy0 === null ? NaN : E - energy0 - workAero - workTether,
        valid: validUntil === null && scopeEnd === null ? 1 : 0, reelMode: REEL_MODES.indexOf(mode),
      };
      for (const [name] of SIGNALS) cols[name][si] = row[name];
      si++;
    }

    // advance skier
    sx += u * dt;
    phase += S.phiDot * dt;
    if (opts.onProgress && n % 5000 === 0) opts.onProgress(n / totalSteps);
  }

  if (preRunInvalid) {
    events.unshift({ t: 0, type: 'prerun_unsettled', severity: 'invalid', pos: p.map((x) => +x.toFixed(3)), detail: { cause: preRunInvalid, note: 'steady flight was not established before t=0' } });
    validUntil = 0;
    cols.valid.fill(0);
  }
  if (maxT > 0) events.push({ t: +maxTt.toFixed(3), type: 'peak_tension', severity: 'info', pos: [], detail: { T: +maxT.toFixed(2) } });
  events.sort((a, b) => a.t - b.t);

  return {
    schema: RESULT_SCHEMA,
    config: { id: CONFIG.id, baseline: CONFIG.baseline },
    model: { id: MODEL.id, version: MODEL.version, evidence: MODEL.evidence },
    scenario: scenario.id,
    inputs: userInputs,
    effectiveInputs: P,
    overrides: scenario.overrides || {},
    inputHash: inputHash(scenario, userInputs),
    constants: Object.fromEntries(Object.entries(K).map(([key, o]) => [key, o.v])),
    duration: tEnd,
    sampleDt: K.sampleDt.v,
    validUntil,
    scopeEnd,
    events,
    reelModes: REEL_MODES,
    signals: SIGNALS.map(([name, unit]) => ({ name, unit })),
    columns: cols,
    n: si,
  };
}

// --- serialization (FE-12) -----------------------------------------------

export function resultToJSON(res) {
  // checksum covers everything except itself and the provenance of a loaded file
  const { checksum: _c, sourceChecksum: _s, ...plain } = res;
  const out = { ...plain, columns: Object.fromEntries(Object.entries(res.columns).map(([k2, a]) => [k2, Array.from(a, (x) => (Number.isFinite(x) ? +x.toPrecision(7) : null))])) };
  out.checksum = 'fnv1a64:' + fnv1a(canonicalJSON(out));
  return out;
}

export function resultFromJSON(obj) {
  if (!obj || obj.schema !== RESULT_SCHEMA) throw new Error(`unsupported result schema: ${obj && obj.schema}`);
  if (obj.checksum) {
    const { checksum, ...rest } = obj;
    if ('fnv1a64:' + fnv1a(canonicalJSON(rest)) !== checksum) throw new Error('checksum mismatch');
  }
  const { checksum: _c, ...plain } = obj;
  return { ...plain, sourceChecksum: obj.checksum || null, columns: Object.fromEntries(Object.entries(obj.columns).map(([k2, a]) => [k2, Float64Array.from(a, (x) => (x === null ? NaN : x))])) };
}

export function resultToCSV(res) {
  const names = res.signals.map((s) => s.name);
  const lines = [
    `# schema=${res.schema} model=${res.model.id}@${res.model.version} evidence=${res.model.evidence} config=${res.config.id} scenario=${res.scenario} inputHash=${res.inputHash} validUntil=${res.validUntil ?? 'none'} scopeEnd=${res.scopeEnd ?? 'none'}`,
    res.signals.map((s) => `${s.name}${s.unit ? ' [' + s.unit + ']' : ''}`).join(','),
  ];
  for (let i = 0; i < res.n; i++) lines.push(names.map((nm) => { const x = res.columns[nm][i]; return Number.isFinite(x) ? +x.toPrecision(7) : ''; }).join(','));
  return lines.join('\n') + '\n';
}
