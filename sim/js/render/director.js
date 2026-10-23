// Shot list for the complete-cycle demonstration. Each shot returns camera
// position, look target, focal length (vertical FOV) and focus distance in
// three.js world space, from the skier frame (pos, fwd, left) and kite. Cuts
// between shots; within a shot the camera moves on eased paths with light
// handheld drift. Times follow DEMO_STAGES (narrative time).
import * as THREE from 'three';

const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const UP = new THREE.Vector3(0, 1, 0);

export const SHOTS = [
  { t0: 0, t1: 5, name: 'establish' },
  { t0: 5, t1: 9, name: 'prepMedium' },
  { t0: 9, t1: 13, name: 'prepClose' },
  { t0: 13, t1: 17, name: 'launchLow' },
  { t0: 17, t1: 21, name: 'payoutTrack' },
  { t0: 21, t1: 27.5, name: 'heliOrbit' },
  { t0: 27.5, t1: 31, name: 'onboard' },
  { t0: 31, t1: 35, name: 'groundPass' },
  { t0: 35, t1: 42, name: 'retrieveOTS' },
  { t0: 42, t1: 46, name: 'handoverClose' },
  { t0: 46, t1: 51, name: 'shortStopOrbit' },
  { t0: 51, t1: 60.01, name: 'craneOut' },
];

export function shotAt(t) { return SHOTS.find((s) => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1]; }

function shake(t, amp) {
  return new THREE.Vector3(
    Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9 + 1) * 0.4,
    Math.sin(t * 1.7 + 2) * 0.5 + Math.sin(t * 3.7) * 0.3,
    Math.sin(t * 1.1 + 4) * 0.6 + Math.sin(t * 2.3 + 3) * 0.4,
  ).multiplyScalar(amp);
}

// st: { pos, fwd, left, kite?, chest, hands: {L,R} } all THREE.Vector3 (three space)
export function direct(t, st) {
  const s = shotAt(t);
  const k = ease(clamp01((t - s.t0) / (s.t1 - s.t0)));
  const P = st.pos, F = st.fwd, Lf = st.left;
  const at = (f, l, u) => P.clone().addScaledVector(F, f).addScaledVector(Lf, l).addScaledVector(UP, u);
  let pos, target, fov = 38, focus = null, aperture = 0.0012, fisheye = false;
  switch (s.name) {
    case 'establish':
      // behind and above, looking down the fall line: skier, piste and valley vista
      pos = at(-15 + 7 * k, 4.5 - 1.5 * k, 5.5 - 2 * k);
      target = at(32, -3, -3.2 + 1.6 * k);
      fov = 36;
      break;
    case 'prepMedium':
      // front three-quarter: one pull on the strap loop, the boom swings up behind
      pos = at(2.7 - 0.4 * k, 2.4 - 0.3 * k, 1.45 + 0.1 * k);
      target = st.chest.clone().addScaledVector(UP, 0.15 + 0.25 * k);
      fov = 36; focus = pos.distanceTo(st.chest); aperture = 0.0018;
      break;
    case 'prepClose': {
      // rear three-quarter close on the cradle: the wing unfolds and weathervanes
      const tip = st.boomTip || at(-0.4, 0, 2.1);
      pos = at(-2.7 + 0.4 * k, 1.9 - 0.3 * k, 2.0 + 0.15 * k);
      target = tip.clone().lerp(st.chest, 0.4);
      fov = 38; focus = pos.distanceTo(tip); aperture = 0.0025;
      break;
    }
    case 'launchLow': {
      // low side-rear tracking: push-off, the wing lifts off the boom and climbs behind
      pos = at(-2.6 - 0.8 * k, -3.6, 0.55 + 0.4 * k);
      const hi = st.kite || st.boomTip || at(0, 0, 2);
      target = st.chest.clone().lerp(hi, 0.55);
      fov = 44; focus = pos.distanceTo(st.chest); aperture = 0.0014;
      break;
    }
    case 'payoutTrack':
      pos = at(-4.2 + 1.2 * k, 3.6, 1.4 + 0.5 * k);
      target = (st.kite ? st.pos.clone().lerp(st.kite, 0.55) : at(0, 0, 1.5)).addScaledVector(F, 1.0);
      fov = 46;
      break;
    case 'heliOrbit': {
      // sweeping arc behind the skier: skier, kite and the valley below
      const a = 2.5 + k * 1.5;
      pos = P.clone().addScaledVector(F, Math.cos(a) * 7.5).addScaledVector(Lf, Math.sin(a) * 7.5).addScaledVector(UP, 2.4 - 0.6 * k);
      target = (st.kite ? P.clone().lerp(st.kite, 0.62) : at(0, 0, 1.6)).addScaledVector(F, 1.5);
      fov = 48;
      break;
    }
    case 'onboard':
      fisheye = true;
      pos = at(0, 0, 3); target = at(0, 0, 0);
      break;
    case 'groundPass':
      pos = at(9 - 2 * k, -3.2 - 0.5 * k, 0.22);
      target = st.kite ? P.clone().lerp(st.kite, 0.35) : at(0, 0, 1.2);
      fov = 32; focus = pos.distanceTo(P); aperture = 0.0018;
      break;
    case 'retrieveOTS':
      pos = at(-7.0 + 2.4 * k, -2.4 + 0.6 * k, 1.3 + 0.3 * k);
      target = st.kite ? st.kite.clone().lerp(st.chest, 0.5 + 0.15 * k) : at(2, 0, 1.4);
      fov = 46; focus = pos.distanceTo(st.chest);
      break;
    case 'handoverClose': {
      // the last of the line draws the wing into the cradle; latch light comes on
      const tip = st.boomTip || at(-0.4, 0, 2.1);
      pos = at(-1.7 - 0.2 * k, 1.5 - 0.3 * k, 1.9 + 0.15 * k);
      target = st.kite ? tip.clone().lerp(st.kite, 0.35) : tip.clone();
      fov = 32; focus = pos.distanceTo(tip); aperture = 0.0025;
      break;
    }
    case 'shortStopOrbit': {
      const a = 0.9 + k * 1.3;
      pos = P.clone().addScaledVector(F, Math.cos(a) * 5).addScaledVector(Lf, Math.sin(a) * 5).addScaledVector(UP, 1.6);
      target = st.boomTip ? st.chest.clone().lerp(st.boomTip, 0.45) : at(0, 0, 1.3);
      fov = 36; focus = pos.distanceTo(target);
      break;
    }
    default: { // craneOut
      const a = 2.0 + k * 0.8;
      const r = 5 + 13 * k;
      pos = P.clone().addScaledVector(F, Math.cos(a) * r).addScaledVector(Lf, Math.sin(a) * r).addScaledVector(UP, 1.8 + 6 * k);
      target = at(0, 0, 1.0);
      fov = 34;
    }
  }
  pos.add(shake(t, s.name === 'groundPass' || s.name === 'launchLow' ? 0.035 : 0.015));
  return { pos, target, fov, dof: focus ? { focus, aperture } : null, fisheye, shot: s.name, cut: Math.abs(t - s.t0) < 0.05 };
}
