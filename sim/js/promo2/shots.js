// SledPack promo v2 director (SIM-034): one eased camera move per section (three.js space).
// Camera framing is relative to the rider's smoothed travel direction so carving
// does not swing the camera; the stop and dock shots are anchored in the world.
import * as THREE from 'three';
import { skierState, sectionAt, EV } from './timeline.js';
import { toV } from '../render/world.js';

const UP = new THREE.Vector3(0, 1, 0);
const ease = (x) => x * x * (3 - 2 * x);
const k01 = (t, a, b) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
const ease3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const kk = (t, a, b) => ease3(Math.min(1, Math.max(0, (t - a) / (b - a))));

function travelFrame(t) {
  // average travel direction over the last second (no carving swing)
  let x = 0, y = 0;
  for (let k = 0; k < 10; k++) { const s = skierState(Math.max(0, t - k * 0.1)); x += s.travel[0]; y += s.travel[1]; }
  const F = toV([x, y, 0]).normalize();
  if (F.lengthSq() < 1e-6) F.set(1, 0, 0);
  return { F, L: new THREE.Vector3().crossVectors(UP, F).normalize() };
}
const P = (t) => toV(skierState(t).pos);

export function promoShot(t, gearOut) {
  const sec = sectionAt(t);
  const { F, L } = travelFrame(Math.min(t, EV.stop - 0.4));
  const pos = P(t);
  const at = (f, l, u, o = pos) => o.clone().addScaledVector(F, f).addScaledVector(L, l).addScaledVector(UP, u);
  const chest = at(0, 0, 1.2);
  const g = gearOut || {};
  const pack = g.packCenter ? g.packCenter.clone() : at(-0.25, 0, 1.15);
  const apex = g.apex || at(-5, 0, 7), mouth = g.mouthPos || at(-0.2, 0, 0.95);
  const k = kk(t, sec.t0, sec.t1);
  let s;
  const mid = (f = 0.5) => chest.clone().lerp(apex, f);
  switch (sec.key) {
    case 'hero': {
      s = { pos: at(-13 + 6 * k, 3.2 - 0.8 * k, 5.2 - 2.4 * k), target: at(30, -1.5, -5 + 2.5 * k), fov: 34 - 2 * k };
      break;
    }
    case 'product': {
      // slow arc behind the rider: the open kite lies on the back like a shell — no pole
      const a = THREE.MathUtils.lerp(-0.9, 0.8, k);
      const r = 2.6 - 0.4 * k;
      s = { pos: pack.clone().addScaledVector(F, -Math.cos(a) * r).addScaledVector(L, Math.sin(a) * r).addScaledVector(UP, 0.3 - 0.1 * k), target: pack.clone().addScaledVector(UP, 0.0), fov: 32, dofOn: true };
      break;
    }
    case 'onback': {
      const a = THREE.MathUtils.lerp(0.75, 0.35, k);
      const r = 2.3 - 0.2 * k;
      s = { pos: pack.clone().addScaledVector(F, -Math.cos(a) * r).addScaledVector(L, Math.sin(a) * r).addScaledVector(UP, 0.1), target: pack.clone().addScaledVector(UP, -0.08), fov: 32, dofOn: true };
      break;
    }
    case 'sense': {
      // rear three-quarter, low, tracking the push-off: the kite still on the back
      s = { pos: at(-3.6 + 0.4 * k, 2.4 + 0.3 * k, 1.0 + 0.2 * k), target: chest.clone().addScaledVector(UP, -0.1), fov: 38, dofOn: true };
      break;
    }
    case 'launch': {
      if (t < 24.0) {
        // one move: the latch lets go and the airflow peels the kite off the back
        const k1 = kk(t, sec.t0, 24.0);
        s = { pos: at(-3.4 - 2.0 * k1, 2.6 + 1.2 * k1, 0.9 + 0.5 * k1), target: mouth.clone().lerp(apex, 0.5), fov: 46 + 10 * k1 };
      } else {
        const k2 = kk(t, 24.0, sec.t1);
        s = { pos: at(-8 - 4 * k2, 9 + 2 * k2, 1.4 + 1.5 * k2), target: mid(0.5), fov: 50 };
      }
      break;
    }
    case 'fast': {
      if (t < 31.5) {
        // fast and high: long line, wide arc
        const a = THREE.MathUtils.lerp(1.95, 1.5, kk(t, sec.t0, 31.5));
        const m = mid(0.5);
        s = { pos: m.clone().addScaledVector(F, Math.cos(a) * 22).addScaledVector(L, Math.sin(a) * 22).addScaledVector(UP, -1.5), target: m, fov: 46 };
      } else {
        const kc = g.kiteCenter || apex, k2 = kk(t, 31.5, sec.t1);
        s = { pos: kc.clone().addScaledVector(F, -0.3 + 0.3 * k2).addScaledVector(L, 2.6 - 0.3 * k2).addScaledVector(UP, 1.2), target: kc.clone().lerp(chest, 0.35), fov: 58 };
      }
      break;
    }
    case 'onboard': {
      const pod = g.pod || apex;
      const look = chest.clone().addScaledVector(UP, -0.3);
      const fwd = look.clone().sub(pod).normalize();
      s = { pos: pod.clone().addScaledVector(fwd, 0.05), target: look, fov: 44, onboard: true };
      break;
    }
    case 'light': {
      // light air / tailwind: the kite comes lower and closer — side view shows the shorter line
      const a = THREE.MathUtils.lerp(1.7, 1.45, k);
      const m = mid(0.45);
      s = { pos: m.clone().addScaledVector(F, Math.cos(a) * 14).addScaledVector(L, Math.sin(a) * 14).addScaledVector(UP, -0.4), target: m.clone().addScaledVector(UP, 0.3), fov: 46 };
      break;
    }
    case 'how': {
      // side view of the whole system: hip eyelet, two lines, kite (fixed filming angle)
      const a = THREE.MathUtils.lerp(1.75, 1.4, k);
      const m = mid(0.5);
      s = { pos: m.clone().addScaledVector(F, Math.cos(a) * 15).addScaledVector(L, Math.sin(a) * 15).addScaledVector(UP, -0.9), target: m.clone().addScaledVector(UP, 0.1), fov: 50 };
      break;
    }
    case 'nudge': {
      // behind the rider looking past the kite: small automatic left/right/up nudges
      s = { pos: at(-10 - 1.5 * k, 5.5, 6.5), target: mid(0.62), fov: 52 };
      break;
    }
    case 'stop': {
      const ps = P(EV.stop);
      const fr = travelFrame(EV.stop - 0.4);
      const atS = (f, l, u) => ps.clone().addScaledVector(fr.F, f).addScaledVector(fr.L, l).addScaledVector(UP, u);
      const midS = pos.clone().addScaledVector(UP, 1.2).lerp(apex, 0.35);
      s = { pos: atS(2.5 + 1.0 * k, -8.0 + 1.0 * k, 1.8), target: midS, fov: 46 };
      break;
    }
    case 'park': {
      // stopped: the kite waits on the snow ≈2.5 m behind, then relaunches from there on the next push-off
      const ps = P(EV.stop);
      const fr = travelFrame(EV.stop - 0.4);
      const atS = (f, l, u) => ps.clone().addScaledVector(fr.F, f).addScaledVector(fr.L, l).addScaledVector(UP, u);
      const tgt = t < EV.push2 ? atS(-1.3, 0, 0.6) : pos.clone().addScaledVector(UP, 1.0).lerp(apex, 0.4);
      s = { pos: atS(-5.5 - 1.5 * k, 4.5 + 1.0 * k, 1.6 + 0.8 * k), target: tgt, fov: 44 };
      break;
    }
    case 'dock': {
      // close behind: the kite comes in low and is laid back onto the shell
      const back = (g.packBack ? g.packBack.clone() : F.clone().negate()).setY(0).normalize();
      const side = new THREE.Vector3().crossVectors(UP, back).normalize();
      const kd = kk(t, sec.t0, sec.t1);
      const m = pack.clone();
      if (t < 64.2) {
        // the kite flies low and close, then comes in from behind
        const k1 = kk(t, sec.t0, 64.2);
        s = { pos: at(-2.5 - 1.5 * k1, 8.5 - 4.5 * k1, 1.6 + 0.2 * k1), target: chest.clone().lerp(apex, 0.62 - 0.4 * k1), fov: 62 - 16 * k1 };
      } else {
        const k2 = kk(t, 64.2, sec.t1);
        s = { pos: m.clone().addScaledVector(back, 2.3 - 0.3 * k2).addScaledVector(side, 1.0 - 0.2 * k2).addScaledVector(UP, 0.15 + 0.1 * k2), target: m.clone().addScaledVector(back, 0.25).addScaledVector(UP, -0.3 + 0.2 * k2), fov: 40, dofOn: true };
      }
      break;
    }
    case 'stowed': {
      s = { pos: at(-3.6 - 0.8 * k, 2.4 + 0.6 * k, 1.6 + 0.2 * k), target: at(0.4, 0, 1.1), fov: 38, dofOn: true };
      break;
    }
    case 'facts': {
      s = { pos: at(-9 - 3 * k, -5 - 2 * k, 3.5 + 1.5 * k), target: at(6, 0, 0.2), fov: 40 };
      break;
    }
    default: {
      s = { pos: at(-6 - 4 * k, 3.5, 2.5 + 6 * k), target: at(40, 0, -6 - 2 * k), fov: 40 };
    }
  }
  if (s.dofOn) s.dof = { focus: s.pos.distanceTo(s.target), aperture: 0.0016 };
  s.shot = sec.key;
  return s;
}
