// Copied unchanged from activetether/detect.js (SIM-033) so the activetether results stay frozen.
// Ride start / stop / fall detector for the back-worn unit (IMU + GNSS + baro, post-lift lockout).
// Port of research/active_tether_2026_10_20/science_control/lib/detect.mjs (same thresholds and sensor model,
// browser-safe imports). The detector sees ONLY synthetic measurements (truth + datasheet noise + ASSUMED
// integration errors), never the trace truth. Also builds a detector trace from the shared skier model
// (same construction as science_control lib/traces.mjs skiTrace). Evidence: numerical, synthetic activity models.
import { mulberry32, gaussian } from '../../model/util.js';
import { skierAt } from '../common/skier.js';

export const DET_DEFAULT = {
  useGnss: true, useBaro: true,
  vOn: 2.8, vzOn: -0.3, chatOn: 0.25, tOn: 0.3, fromRestS: 6, vRest: 1.0,
  vOnSlow: 3.0, vzOnSlow: -0.5, chatOnSlow: 0.3, tOnSlow: 3.0,
  vOff: 1.5, tOff: 0.2, decelOff: -2.5, tDecel: 0.3, vDecelMax: 25,
  liftVz: 0.25, liftT: 20, lockoutM: 30,
  fallImpact: 25, fallTilt: 55, fallTiltT: 0.4, fallWin: 1.5, slideTilt: 60, slideT: 1.0,
};
const GN = { outageFrac: 0.05, latencyS: 0.1, rateHz: 10, sigmaVh: 0.12, sigmaVz: 0.25 };
const BA = { rateHz: 25, sigmaM: 0.1, cpDyn: 0.08 };
const IMI = { accelBiasAfterAhrs: 0.25 };
export const rngFrom = (seed) => { const r = mulberry32((seed * 2654435761) >>> 0); return { u: r, n: () => gaussian(r) }; };

export const VIB = { kSnow: 0.13, floorBody: 0.05 };
// detector input trace from a shared skier run (simulateSkier / simulateRun): vx, vy, vz, vib, tilt, impact at dt
export function skiTraceOf(sk, { dt = 0.02, seed = 1 } = {}) {
  const n = Math.floor(sk.duration / dt) + 1;
  const o = {}; for (const k of ['t', 'vx', 'vy', 'vz', 'vib', 'tilt', 'impact']) o[k] = new Float64Array(n);
  const rng = mulberry32(seed * 977 + 5);
  let tiltF = 0, fallT = null;
  for (let i = 0; i < n; i++) {
    const t = i * dt, s = skierAt(sk, t);
    o.t[i] = t; o.vx[i] = s.vel[0]; o.vy[i] = s.vel[1]; o.vz[i] = s.vel[2];
    o.vib[i] = s.speed > 0.3 ? Math.hypot(VIB.kSnow * s.speed, VIB.floorBody) : VIB.floorBody;
    let tilt = Math.abs(s.lean) * 0.6 * 57.3 + 25 * s.crouch;
    if (s.fallen) { if (fallT == null) fallT = t; tiltF = Math.min(1, tiltF + dt / 0.4); tilt = tilt * (1 - tiltF) + 80 * tiltF; }
    o.tilt[i] = tilt;
    o.impact[i] = 4 * Math.max(s.plantL, s.plantR) * (rng() < 0.5 ? 1 : 0.6);
  }
  if (fallT != null) { const i0 = Math.round(fallT / dt) + 10; for (let k = 0; k < 3; k++) if (i0 + k < n) o.impact[i0 + k] = 30 + 25 * rng(); }
  return { dt, n, ...o };
}

// run the detector over a trace (identical algorithm to science_control lib/detect.mjs runDetector)
export function runDetector(tr, { seed = 1, p = {}, sensorScale = 1 } = {}) {
  const P = { ...DET_DEFAULT, ...p };
  const R = rngFrom(seed), g = R.n, u = R.u;
  const dt = tr.dt, n = tr.n;
  let bA = g() * IMI.accelBiasAfterAhrs * sensorScale, bZ = g() * 0.1 * sensorScale;
  const outage = new Uint8Array(n);
  if (P.useGnss) { let i = 0; while (i < n) { if (u() < GN.outageFrac * dt / 6) { const L = Math.round((2 + 8 * u()) / dt); for (let k = i; k < Math.min(n, i + L); k++) outage[k] = 1; i += L; } else i++; } }
  const lagN = Math.round(GN.latencyS / dt), gEvery = Math.round(1 / GN.rateHz / dt), bEvery = Math.round(1 / BA.rateHz / dt);
  let vh = 0, vz = 0, alt = 0, altTrue = 0, chat = 0, chatS = 0, aLP = 0;
  const vhHist = new Float64Array(n);
  let state = 0, onT = 0, onTS = 0, offT = 0, decT = 0, lastRestT = -1e9, liftT = 0, lockDist = 0, wasLift = false;
  let vzLP = 0, lastFix = -1e9, impactT = -1e9, tiltT = 0, slideT = 0, fallen = false;
  const ev = { start: [], stop: [], fall: [] };
  const trace = { vh: new Float32Array(n), state: new Uint8Array(n), lock: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const vhT = Math.hypot(tr.vx[i], tr.vy[i]), vhTp = i ? Math.hypot(tr.vx[i - 1], tr.vy[i - 1]) : vhT;
    const aT = (vhT - vhTp) / dt, azT = i ? (tr.vz[i] - tr.vz[i - 1]) / dt : 0;
    altTrue += tr.vz[i] * dt;
    bA += g() * 0.02 * Math.sqrt(dt) * sensorScale; bA *= 1 - dt / 60;
    const leak = 0.3 * tr.vib[i];
    const aM = aT + bA + leak * g() * sensorScale;
    const azM = azT + bZ + leak * g() * sensorScale;
    vh = Math.max(0, vh + aM * dt);
    vhHist[i] = vh;
    if (P.useGnss && i % gEvery === 0 && !outage[i] && i >= lagN) {
      const z = Math.hypot(tr.vx[i - lagN], tr.vy[i - lagN]) + g() * GN.sigmaVh * sensorScale;
      const innov = Math.max(0, z) - vhHist[i - lagN];
      vh = Math.max(0, vh + 0.35 * innov); lastFix = t;
    }
    const gnssFresh = !P.useGnss || t - lastFix < 0.5;
    if (!P.useGnss) { if (tr.vib[i] * Math.exp(0.3 * g()) < 0.08 && Math.abs(aM - bA) < 0.3) vh *= 1 - dt / 0.3; }
    vz += azM * dt;
    if (P.useBaro && i % bEvery === 0) {
      const q = 0.5 * 1.0 * vhT * vhT, side = vhT > 0.5 ? tr.vy[i] / vhT : 0;
      const altM = altTrue + g() * BA.sigmaM * sensorScale + (BA.cpDyn * q * side) / 9.81;
      const innov = altM - alt; alt += 0.15 * innov; vz += 0.05 * innov / (bEvery * dt);
    }
    alt += vz * dt;
    if (P.useGnss && i % gEvery === 0 && !outage[i] && i >= lagN) vz += 0.25 * (tr.vz[i - lagN] + g() * GN.sigmaVz * sensorScale - vz);
    if (i % 5 === 0) chat = Math.hypot(tr.vib[i] * Math.exp(0.3 * g()), 0.005);
    chatS += (chat - chatS) * Math.min(1, dt / 0.25);
    aLP += (aM - aLP) * Math.min(1, dt / 0.15);
    vzLP += (vz - vzLP) * Math.min(1, dt / 3);
    if (vzLP > P.liftVz) { liftT += dt; if (liftT > P.liftT) { wasLift = true; } } else if (vzLP < 0.1) liftT = 0;
    if (wasLift) { if (vzLP > 0.15) lockDist = 0; else lockDist += vh * dt; if (lockDist > P.lockoutM) { wasLift = false; lockDist = 0; } }
    if (vh < P.vRest) lastRestT = t;
    const fast = gnssFresh && vh > P.vOn && vz < P.vzOn && chatS > P.chatOn && t - lastRestT < P.fromRestS;
    const slow = vh > P.vOnSlow && vz < P.vzOnSlow && chatS > P.chatOnSlow;
    onT = fast ? onT + dt : 0; onTS = slow ? onTS + dt : 0;
    if (state === 0 && !wasLift && (onT >= P.tOn || onTS >= P.tOnSlow)) { state = 1; ev.start.push(t); offT = 0; decT = 0; fallen = false; }
    if (state === 1) {
      offT = vh < P.vOff ? offT + dt : 0;
      decT = aLP < P.decelOff && vh < P.vDecelMax ? decT + dt : 0;
      if (offT >= P.tOff || decT >= P.tDecel) { state = 0; ev.stop.push(t); onT = onTS = 0; }
    }
    const accMag = Math.hypot(9.81 + aT, 2) + tr.impact[i] + 0.5 * g();
    if (accMag > P.fallImpact) impactT = t;
    const tiltM = tr.tilt[i] + 2 * g() * sensorScale;
    tiltT = tiltM > P.fallTilt ? tiltT + dt : 0;
    slideT = tiltM > P.slideTilt && vh > 2 ? slideT + dt : 0;
    if (!fallen && ((t - impactT < P.fallWin && tiltT >= P.fallTiltT && (vh > 1.0 || state === 1)) || slideT >= P.slideT)) { fallen = true; ev.fall.push(t); if (state === 1) { state = 0; ev.stop.push(t); } }
    if (tiltM < 30 && vh < 0.5) fallen = false;
    trace.vh[i] = vh; trace.state[i] = state; trace.lock[i] = wasLift ? 1 : 0;
  }
  return { ev, trace };
}
