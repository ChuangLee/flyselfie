// SledPack promo director: one eased camera move per section (three.js space).
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
  switch (sec.key) {
    case 'hero': {
      // behind and above, looking down the fall line across the valley; slow push and descent
      s = { pos: at(-13 + 6 * k, 3.2 - 0.8 * k, 5.2 - 2.4 * k), target: at(30, -1.5, -5 + 2.5 * k), fov: 34 - 2 * k };
      break;
    }
    case 'product': {
      // slow arc around the back at pack height: no pole, just a pack
      // arc from rear-left to rear-right around the pack
      const a = THREE.MathUtils.lerp(-0.85, 0.75, k);
      const r = 2.5 - 0.35 * k;
      s = { pos: pack.clone().addScaledVector(F, -Math.cos(a) * r).addScaledVector(L, Math.sin(a) * r).addScaledVector(UP, 0.2 - 0.1 * k), target: pack.clone().addScaledVector(UP, 0.02), fov: 32, dofOn: true };
      break;
    }
    case 'xray': {
      // close rear three-quarter: the shell turns to glass
      const a = THREE.MathUtils.lerp(0.7, 0.4, k);
      const r = 2.5 - 0.2 * k;
      s = { pos: pack.clone().addScaledVector(F, -Math.cos(a) * r).addScaledVector(L, Math.sin(a) * r).addScaledVector(UP, 0.1), target: pack.clone().addScaledVector(UP, 0.0), fov: 30, dofOn: true };
      break;
    }
    case 'sense': {
      // front three-quarter, low, tracking the push-off
      s = { pos: at(4.2 - 0.6 * k, -2.6 - 0.4 * k, 0.75 + 0.2 * k), target: chest.clone().addScaledVector(UP, -0.15), fov: 36, dofOn: true };
      break;
    }
    case 'launch': {
      if (t < 25.8) {
        // low rear-side: the kite slides tail-first out of the sleeve and opens
        const k1 = kk(t, sec.t0, 25.8);
        const tgt = mouth.clone().lerp(apex, 0.5 + 0.22 * k1);
        s = { pos: at(-3.2 - 2.2 * k1, 2.3 + 1.2 * k1, 0.8 + 0.4 * k1), target: tgt, fov: 46 + 14 * k1 };
      } else {
        const k2 = kk(t, 25.8, sec.t1);
        const mid = chest.clone().lerp(apex, 0.5);
        s = { pos: at(-7 - 3 * k2, 7 + 2 * k2, 1.6 + 1.5 * k2), target: mid, fov: 48 };
      }
      break;
    }
    case 'fly': {
      if (t < 32.6) {
        // wide helicopter arc: rider, line and kite against the valley
        const a = THREE.MathUtils.lerp(1.95, 1.45, kk(t, sec.t0, 32.6));
        const mid = chest.clone().lerp(apex, 0.5);
        s = { pos: mid.clone().addScaledVector(F, Math.cos(a) * 13).addScaledVector(L, Math.sin(a) * 13).addScaledVector(UP, -0.8), target: mid, fov: 46 };
      } else {
        // over the kite's shoulder: kite in the foreground, rider carving below
        const k2 = kk(t, 32.6, sec.t1);
        const kc = g.kiteCenter || apex;
        s = { pos: kc.clone().addScaledVector(F, -0.3 + 0.3 * k2).addScaledVector(L, 2.3 - 0.3 * k2).addScaledVector(UP, 1.1), target: kc.clone().lerp(chest, 0.38), fov: 56 };
      }
      break;
    }
    case 'onboard': {
      // the product's own view from the pod (simulated render)
      const pod = g.pod || apex;
      const look = chest.clone().addScaledVector(UP, -0.3);
      const fwd = look.clone().sub(pod).normalize();
      s = { pos: pod.clone().addScaledVector(fwd, 0.05), target: look, fov: 44, onboard: true };
      break;
    }
    case 'how': {
      // side view of the whole system: pack, two lines, kite
      const a = THREE.MathUtils.lerp(1.75, 1.4, k);
      const mid = chest.clone().lerp(apex, 0.5);
      s = { pos: mid.clone().addScaledVector(F, Math.cos(a) * 12.5).addScaledVector(L, Math.sin(a) * 12.5).addScaledVector(UP, -0.9), target: mid.clone().addScaledVector(UP, 0.1), fov: 50 };
      break;
    }
    case 'stop': {
      // world-anchored side view of the hockey stop; the depowered kite drops behind
      const ps = P(EV.stop);
      const fr = travelFrame(EV.stop - 0.4);
      const atS = (f, l, u) => ps.clone().addScaledVector(fr.F, f).addScaledVector(fr.L, l).addScaledVector(UP, u);
      const midS = pos.clone().addScaledVector(UP, 1.2).lerp(apex, 0.35);
      s = { pos: atS(2.5 + 1.0 * k, -7.5 + 1.0 * k, 1.6), target: midS, fov: 44 };
      break;
    }
    case 'dock': {
      // close and low behind the pack: the pod rises into the sleeve mouth
      const back = (g.packBack ? g.packBack.clone() : F.clone().negate()).setY(0).normalize();
      const side = new THREE.Vector3().crossVectors(UP, back).normalize();
      const m = mouth.clone();
      const kd = kk(t, sec.t0, sec.t1);
      s = { pos: m.clone().addScaledVector(back, 1.35 - 0.3 * kd).addScaledVector(side, 0.85 - 0.2 * kd).addScaledVector(UP, -0.3 + 0.2 * kd), target: m.clone().addScaledVector(back, 0.15).addScaledVector(UP, -0.15 + 0.2 * kd), fov: 36, dofOn: true };
      break;
    }
    case 'stowed': {
      // rider skates off: a clean pack, nothing trailing
      s = { pos: at(-3.4 - 0.8 * k, 2.4 + 0.6 * k, 1.5 + 0.2 * k), target: at(0.4, 0, 1.0), fov: 38, dofOn: true };
      break;
    }
    case 'facts': {
      s = { pos: at(-9 - 3 * k, -5 - 2 * k, 3.5 + 1.5 * k), target: at(6, 0, 0.2), fov: 40 };
      break;
    }
    default: {
      // closing crane up over the valley
      s = { pos: at(-6 - 4 * k, 3.5, 2.5 + 6 * k), target: at(40, 0, -6 - 2 * k), fov: 40 };
    }
  }
  if (s.dofOn) s.dof = { focus: s.pos.distanceTo(s.target), aperture: 0.0016 };
  s.shot = sec.key;
  return s;
}
