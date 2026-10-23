// Ride start / stop / fall detection from a back-worn pack (IMU + optional GNSS + barometer).
// Sensor errors follow lib/sensors.mjs (datasheet + ASSUMED integration budget). The detector sees ONLY
// the synthetic measurements, never the trace truth. Evidence: numerical, synthetic activity models.
import { SPECS, rngFrom } from './sensors.mjs';

export const DET_DEFAULT = {
  useGnss: true, useBaro: true,
  vOn: 2.8, vzOn: -0.3, chatOn: 0.25, tOn: 0.3, fromRestS: 6, vRest: 1.0, // fast start (from rest)
  vOnSlow: 3.0, vzOnSlow: -0.5, chatOnSlow: 0.3, tOnSlow: 3.0,              // slow start (no rest before)
  vOff: 1.5, tOff: 0.2, decelOff: -2.5, tDecel: 0.3, vDecelMax: 25,           // stop
  liftVz: 0.25, liftT: 20, lockoutM: 30,                                       // post-lift lockout
  fallImpact: 25, fallTilt: 55, fallTiltT: 0.4, fallWin: 1.5, slideTilt: 60, slideT: 1.0,
};

// Synthesise the sensor streams for a trace and run the detector; returns events with times.
export function runDetector(tr, { seed = 1, p = {}, sensorScale = 1 } = {}) {
  const P = { ...DET_DEFAULT, ...p };
  const R = rngFrom(seed), g = R.n, u = R.u;
  const dt = tr.dt, n = tr.n;
  const gn = SPECS.gnss.model, ba = SPECS.baro.model, im = SPECS.imu.integration;
  // slowly varying AHRS-level accel bias (random walk, σ ≈ accelBiasAfterAhrs)
  let bA = g() * im.accelBiasAfterAhrs * sensorScale, bZ = g() * 0.1 * sensorScale;
  // GNSS outage schedule
  const outage = new Uint8Array(n);
  if (P.useGnss) { let i = 0; while (i < n) { if (u() < gn.outageFrac * dt / 6) { const L = Math.round((2 + 8 * u()) / dt); for (let k = i; k < Math.min(n, i + L); k++) outage[k] = 1; i += L; } else i++; } }
  const lagN = Math.round(gn.latencyS / dt), gEvery = Math.round(1 / gn.rateHz / dt), bEvery = Math.round(1 / ba.rateHz / dt);
  // estimator state
  let vh = 0, vz = 0, alt = 0, altTrue = 0, chat = 0, chatS = 0, prevVh = 0, aLP = 0;
  const vhHist = new Float64Array(n);
  let state = 0, onT = 0, onTS = 0, offT = 0, decT = 0, lastRestT = -1e9, liftT = 0, lockFrom = null, lockDist = 0, wasLift = false;
  let vzLP = 0, lastFix = -1e9, impactT = -1e9, tiltT = 0, slideT = 0, fallen = false;
  const ev = { start: [], stop: [], fall: [] };
  const trace = { vh: new Float32Array(n), vz: new Float32Array(n), chat: new Float32Array(n), state: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const vhT = Math.hypot(tr.vx[i], tr.vy[i]), vhTp = i ? Math.hypot(tr.vx[i - 1], tr.vy[i - 1]) : vhT;
    const aT = (vhT - vhTp) / dt, azT = i ? (tr.vz[i] - tr.vz[i - 1]) / dt : 0;
    altTrue += tr.vz[i] * dt;
    bA += g() * 0.02 * Math.sqrt(dt) * sensorScale; bA *= 1 - dt / 60; // slow drift
    const leak = 0.3 * tr.vib[i];                                       // vibration leaking through the 5 Hz LPF (ASSUMED)
    const aM = aT + bA + leak * g() * sensorScale;
    const azM = azT + bZ + leak * g() * sensorScale;
    // --- horizontal speed: IMU-propagated, GNSS-corrected with latency compensation
    vh = Math.max(0, vh + aM * dt);
    vhHist[i] = vh;
    if (P.useGnss && i % gEvery === 0 && !outage[i] && i >= lagN) {
      const z = Math.hypot(tr.vx[i - lagN], tr.vy[i - lagN]) + g() * gn.sigmaVh * sensorScale;
      const innov = Math.max(0, z) - vhHist[i - lagN];
      vh = Math.max(0, vh + 0.35 * innov); lastFix = t;
    }
    const gnssFresh = !P.useGnss || t - lastFix < 0.5;
    if (!P.useGnss) { // IMU only: zero-velocity updates when the pack is still (low vibration & no accel)
      if (tr.vib[i] * Math.exp(0.3 * g()) < 0.08 && Math.abs(aM - bA) < 0.3) vh *= 1 - dt / 0.3;
    }
    // --- vertical speed: complementary filter IMU + baro + GNSS vz
    vz += azM * dt;
    if (P.useBaro && i % bEvery === 0) {
      const q = 0.5 * 1.0 * vhT * vhT, side = vhT > 0.5 ? tr.vy[i] / vhT : 0;
      const altM = altTrue + g() * ba.sigmaM * sensorScale + (ba.cpDyn * q * side) / 9.81;
      const innov = altM - alt; alt += 0.15 * innov; vz += 0.05 * innov / (bEvery * dt);
    }
    alt += vz * dt;
    if (P.useGnss && i % gEvery === 0 && !outage[i] && i >= lagN) vz += 0.25 * (tr.vz[i - lagN] + g() * gn.sigmaVz * sensorScale - vz);
    // --- chatter (10–50 Hz band rms, 10 Hz feature), noise floor from IMU density
    if (i % 5 === 0) chat = Math.hypot(tr.vib[i] * Math.exp(0.3 * g()), 0.005);
    chatS += (chat - chatS) * Math.min(1, dt / 0.25);
    aLP += (aM - aLP) * Math.min(1, dt / 0.15);
    // --- lift memory and post-lift lockout
    // a sustained ascent latches 'on lift'; the lockout lasts until lockoutM of non-ascending travel
    vzLP += (vz - vzLP) * Math.min(1, dt / 3);
    if (vzLP > P.liftVz) { liftT += dt; if (liftT > P.liftT) { wasLift = true; lockFrom = t; } } else if (vzLP < 0.1) liftT = 0;
    if (wasLift) { if (vzLP > 0.15) lockDist = 0; else lockDist += vh * dt; if (lockDist > P.lockoutM) { wasLift = false; lockDist = 0; } }
    if (vh < P.vRest) lastRestT = t;
    // --- start
    const fast = gnssFresh && vh > P.vOn && vz < P.vzOn && chatS > P.chatOn && t - lastRestT < P.fromRestS;
    const slow = vh > P.vOnSlow && vz < P.vzOnSlow && chatS > P.chatOnSlow;
    onT = fast ? onT + dt : 0; onTS = slow ? onTS + dt : 0;
    if (state === 0 && !wasLift && (onT >= P.tOn || onTS >= P.tOnSlow)) { state = 1; ev.start.push(t); offT = 0; decT = 0; fallen = false; }
    // --- stop
    if (state === 1) {
      offT = vh < P.vOff ? offT + dt : 0;
      decT = aLP < P.decelOff && vh < P.vDecelMax ? decT + dt : 0;
      if (offT >= P.tOff || decT >= P.tDecel) { state = 0; ev.stop.push(t); onT = onTS = 0; }
    }
    // --- fall (any state while moving or within 2 s after a stop)
    const accMag = Math.hypot(9.81 + aT, 2) + tr.impact[i] + 0.5 * g();
    if (accMag > P.fallImpact) impactT = t;
    const tiltM = tr.tilt[i] + 2 * g() * sensorScale;
    tiltT = tiltM > P.fallTilt ? tiltT + dt : 0;
    slideT = tiltM > P.slideTilt && vh > 2 ? slideT + dt : 0;
    if (!fallen && ((t - impactT < P.fallWin && tiltT >= P.fallTiltT && (vh > 1.0 || state === 1)) || slideT >= P.slideT)) { fallen = true; ev.fall.push(t); if (state === 1) { state = 0; ev.stop.push(t); } }
    if (tiltM < 30 && vh < 0.5) fallen = false;
    trace.vh[i] = vh; trace.vz[i] = vz; trace.chat[i] = chatS; trace.state[i] = state;
  }
  return { ev, trace };
}

// score a detector run against the trace labels
export function score(tr, ev, { startWin = 6, stopWin = 4 } = {}) {
  const res = { startLat: [], missedStart: 0, falseStart: 0, stopLat: [], missedStop: 0, falseStop: 0, fallLat: [], missedFall: 0, falseFall: 0 };
  const lab = (t) => tr.label[Math.min(tr.n - 1, Math.max(0, Math.round(t / tr.dt)))];
  const usedS = new Set();
  for (const t0 of tr.ev.starts) { const d = ev.start.find((t) => t >= t0 - 0.05 && t <= t0 + startWin); if (d == null) res.missedStart++; else { res.startLat.push(d - t0); usedS.add(d); } }
  for (const t of ev.start) if (!usedS.has(t) && lab(t) === 0) res.falseStart++;
  const usedP = new Set();
  for (const t0 of tr.ev.stops) { if (tr.ev.falls.some((f) => f < t0 && t0 - f < 40)) continue; const d = ev.stop.find((t) => t >= t0 - 0.5 && t <= t0 + stopWin); if (d == null) res.missedStop++; else { res.stopLat.push(d - t0); usedP.add(d); } }
  const fallSet = new Set(ev.fall);
  for (const t of ev.stop) if (!usedP.has(t) && lab(t) === 1 && !tr.ev.falls.some((f) => t >= f && t < f + 5) && !ev.fall.some((f) => Math.abs(f - t) < 1e-9)) res.falseStop++;
  for (const f of tr.ev.falls) { const d = ev.fall.find((t) => t >= f && t <= f + 3); if (d == null) res.missedFall++; else res.fallLat.push(d - f); }
  for (const t of ev.fall) if (!tr.ev.falls.some((f) => t >= f && t <= f + 3)) res.falseFall++;
  void fallSet;
  return res;
}
