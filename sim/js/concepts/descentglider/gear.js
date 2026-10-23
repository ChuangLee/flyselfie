// descentglider v2 gear (browser only): ≈122 g folding flying wing (scissor pivot: halves swing back over the
// pod to stow), one folding pusher prop (motion-blur disc when powered or wind-milling), 16 g 4K camera on a
// 3-axis micro-servo cradle in the nose, spiked belly skid for the end-of-run belly landing, winglets with
// nav LEDs; heated stow sleeve on the right of the pack (charges from a power bank inside) and a UWB tag on the
// left shoulder strap. Illustrative product design, not CAD.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const toV3 = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, w) => a + (b - a) * w;

function discTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 14, 128, 128, 126);
  grd.addColorStop(0, 'rgba(30,30,34,0)'); grd.addColorStop(0.3, 'rgba(40,40,46,0.45)');
  grd.addColorStop(0.86, 'rgba(70,70,76,0.3)'); grd.addColorStop(0.97, 'rgba(255,150,60,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 2; k++) {
    g.save(); g.translate(128, 128); g.rotate(k * Math.PI + 0.5);
    const sg = g.createLinearGradient(0, 0, 120, 0); sg.addColorStop(0, 'rgba(20,20,24,0)'); sg.addColorStop(1, 'rgba(20,20,24,0.4)');
    g.fillStyle = sg; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 122, -0.3, 0.3); g.closePath(); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function carbonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#15171b'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? '#23262c' : '#111316'; g.fillRect(x, y, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// thin cambered feather panel: tapered planform extruded 6 mm, root at the origin, span along +Z
function featherGeom(len, c0, c1) {
  const s = new THREE.Shape();
  s.moveTo(0.012, 0); s.lineTo(0.012 - 0.01, len); s.quadraticCurveTo(-c1 * 0.4, len + 0.012, -c1, len - 0.004);
  s.lineTo(-c0, 0.004); s.quadraticCurveTo(-c0 * 0.5, -0.006, 0.012, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0018, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.003);
  // shape XY → feather: X = chordwise (forward +), Y(shape) = span → map to local Z; thickness → local Y
  g.rotateX(Math.PI / 2);
  return g;
}

export function createGear(scene) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    shell: M({ color: 0xff6b1a, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
    white: M({ color: 0xeef0f2, roughness: 0.35, clearcoat: 0.6 }),
    orange: M({ color: 0xff5a14, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    carbon: M({ map: carbonTexture(), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }),
    wing: M({ color: 0x1c2026, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
    feather: M({ color: 0x1c2026, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: 0x6a7f99 }),
    featherTip: M({ color: 0xff6a1f, roughness: 0.4, clearcoat: 0.6 }),
    alu: M({ color: 0x9aa3ad, metalness: 0.95, roughness: 0.28 }),
    aluRed: M({ color: 0xc8401f, metalness: 0.9, roughness: 0.3 }),
    dark: M({ color: 0x0e1013, roughness: 0.35, metalness: 0.2 }),
    rubber: M({ color: 0x18191c, roughness: 0.92 }),
    glass: M({ color: 0x08101a, roughness: 0.03, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.7, iridescenceIOR: 1.6 }),
    prop: M({ color: 0x202226, roughness: 0.5 }),
    disc: new THREE.MeshBasicMaterial({ map: discTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    fabric: M({ color: 0x2a3340, roughness: 0.95, sheen: 0.6, sheenColor: 0x7d8da3 }),
    ledW: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 3 }),
    ledR: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3 }),
    ledG: new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x23ff6a, emissiveIntensity: 3 }),
    status: new THREE.MeshStandardMaterial({ color: 0x0b1410, emissive: 0x2cff8a, emissiveIntensity: 2.5 }),
    trunk: M({ color: 0x4a3626, roughness: 0.95 }),
    needles: M({ color: 0x22402c, roughness: 0.9, sheen: 0.4, sheenColor: 0x4f7a5a }),
    jacket: M({ color: 0x2b6fd6, roughness: 0.7, sheen: 0.5, sheenColor: 0x9cc3ff }),
    pants: M({ color: 0x23262b, roughness: 0.8 }),
    helmet: M({ color: 0xf0f0f0, roughness: 0.3, clearcoat: 0.8 }),
    ski: M({ color: 0xd8342a, roughness: 0.35, clearcoat: 0.7 }),
  };
  const sh = (m) => { m.castShadow = true; return m; };

  // ------------------------------------------------------------ glider (local: +X nose, +Y top (wing normal), +Z right)
  // v2: 0.66 m flying wing on a single scissor pivot (wing halves swing back over the pod to fold), one folding
  // pusher prop at the tail, 16 g 4K camera on a 3-axis micro-servo cradle in the nose, spiked belly skid, winglets
  const glider = new THREE.Group();
  const pod = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.2, 6, 16), mat.shell)); pod.rotation.z = Math.PI / 2; pod.scale.set(1, 0.85, 1);
  const spine = sh(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.01, 0.03, 2, 0.004), mat.white)); spine.position.set(-0.01, 0.022, 0);
  const skid = sh(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.008, 0.022, 2, 0.003), mat.rubber)); skid.position.set(-0.01, -0.024, 0);
  glider.add(pod, spine, skid);
  for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.0025, 0.008, 6), mat.alu); sp.rotation.z = Math.PI; sp.position.set(-0.09 + k * 0.04, -0.031, 0); glider.add(sp); }
  // nose cradle (yoke) + camera
  const yoke = new THREE.Group(); yoke.position.set(0.125, -0.006, 0);
  const yArm = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.003, 8, 20, Math.PI), mat.dark); yArm.rotation.y = Math.PI / 2; yoke.add(yArm);
  const ball = new THREE.Group();
  const cam = sh(new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.022, 0.024, 3, 0.006), mat.dark));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.008, 20), mat.glass); lens.rotation.z = -Math.PI / 2; lens.position.x = 0.016;
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0014, 8, 20), mat.aluRed); lensRing.rotation.y = Math.PI / 2; lensRing.position.x = 0.02;
  ball.add(cam, lens, lensRing); yoke.add(ball); glider.add(yoke);
  // wing halves on one pivot behind the camera: spread (fold 0) → swept back over the pod (fold 1)
  const wingG = (sz) => { const k = -sz; const sh_ = new THREE.Shape(); sh_.moveTo(0.03, 0); sh_.lineTo(0.0, 0.33 * k); sh_.lineTo(-0.06, 0.335 * k); sh_.lineTo(-0.1, 0.0); sh_.lineTo(0.03, 0); return new THREE.ExtrudeGeometry(sh_, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 }); };
  const wings = [];
  for (const sz of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(0.02, 0.026 + (sz > 0 ? 0.0 : 0.012), 0);
    const w = sh(new THREE.Mesh(wingG(sz), mat.wing)); w.rotation.x = -Math.PI / 2; w.position.y = -0.004;
    const tip = sh(new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.05, 0.004, 2, 0.002), mat.featherTip)); tip.position.set(-0.03, 0.018, 0.333 * sz);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.0102, 0.02), mat.orange); stripe.position.set(-0.035, 0, 0.28 * sz);
    piv.add(w, tip, stripe); glider.add(piv); wings.push({ piv, sz, tip });
  }
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), mat.ledR), navR = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), mat.ledG);
  wings[1].tip.add(navL); wings[0].tip.add(navR); navL.position.set(0.03, 0.02, 0); navR.position.set(0.03, 0.02, 0);
  // single folding pusher at the tail
  const props = [];
  { const bell = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 18), mat.aluRed)); bell.rotation.z = Math.PI / 2; bell.position.set(-0.135, 0.004, 0);
    const hub = new THREE.Group(); hub.position.set(-0.146, 0.004, 0);
    const blades = [];
    for (const b of [1, -1]) { const pivot = new THREE.Group(); pivot.rotation.x = b > 0 ? 0 : Math.PI; const blade = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.042, 0.01), mat.prop); blade.position.y = 0.023; blade.rotation.y = 0.25; pivot.add(blade); hub.add(pivot); blades.push(pivot); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.044, 40), mat.disc); disc.rotation.y = Math.PI / 2; disc.position.set(-0.148, 0.004, 0); disc.renderOrder = 5;
    glider.add(bell, hub, disc); props.push({ hub, blades, disc, dir: 1 }); }
  const ledNose = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 8), mat.ledW); ledNose.position.set(0.1, 0.02, 0);
  const ledStat = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), mat.status); ledStat.position.set(-0.04, 0.03, 0);
  glider.add(ledNose, ledStat);
  scene.add(glider);

  // ------------------------------------------------------------ pack sleeve + UWB tag
  const sleeve = new THREE.Group();
  const sBody = sh(new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.35, 0.125, 4, 0.015), mat.fabric));
  const sRim = new THREE.Mesh(new RoundedBoxGeometry(0.066, 0.02, 0.13, 3, 0.008), mat.rubber); sRim.position.y = 0.177;
  const sStripe = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.012, 0.147), mat.orange); sStripe.position.y = -0.06;
  const sLed = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), mat.status); sLed.position.set(0.027, 0.11, 0.05);
  sleeve.add(sBody, sRim, sStripe, sLed);
  const tag = new THREE.Group();
  const tagBody = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.012, 0.04, 3, 0.006), mat.dark);
  const tagRing = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.002, 8, 24), mat.status); tagRing.rotation.x = Math.PI / 2; tagRing.position.y = 0.007;
  tag.add(tagBody, tagRing);
  scene.add(sleeve, tag);

  // ------------------------------------------------------------ scenario props: tree line, neighbour skier
  const forest = new THREE.Group(); forest.visible = false; scene.add(forest);
  const treeObjs = [];
  function ensureTrees(n) {
    while (treeObjs.length < n) {
      const t = new THREE.Group();
      const tr = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3, 10), mat.trunk)); tr.position.y = 1.5; t.add(tr);
      for (let k = 0; k < 5; k++) { const c = sh(new THREE.Mesh(new THREE.ConeGeometry(2.2 - k * 0.38, 2.0, 12), mat.needles)); c.position.y = 2.4 + k * 1.25; t.add(c); }
      forest.add(t); treeObjs.push(t);
    }
  }
  const nbG = new THREE.Group(); nbG.visible = false;
  { const torso = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.45, 6, 12), mat.jacket)); torso.position.y = 1.15; torso.rotation.z = -0.25;
    const legs = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.55, 6, 12), mat.pants)); legs.position.y = 0.5; legs.rotation.z = 0.15;
    const head = sh(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat.helmet)); head.position.set(0.12, 1.62, 0);
    const skiL = sh(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 0.08), mat.ski)); skiL.position.set(0, 0.02, 0.12);
    const skiR = skiL.clone(); skiR.position.z = -0.12;
    nbG.add(torso, legs, head, skiL, skiR); }
  scene.add(nbG);

  const all = [glider, sleeve, tag];
  const basisQuat = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return {
    hideInPip: [glider],
    setVisible(v) { for (const o of all) o.visible = v; forest.visible = v && forest.userData.on; nbG.visible = v && nbG.userData.on; },
    update(d, ctx) {
      const rig = ctx.skier;
      if (!rig.packC || !d.pos) return;
      const t = ctx.t || 0;
      const up = rig.packUp.clone().normalize(), back = rig.packBack.clone().normalize(), px = rig.packX.clone().normalize();
      // sleeve on the right side of the pack
      const sleeveC = rig.packC.clone().addScaledVector(px, -0.19).addScaledVector(up, -0.02).addScaledVector(back, 0.02);
      sleeve.position.copy(sleeveC); sleeve.quaternion.copy(basisQuat(px.clone().negate(), up, back.clone().negate().cross(px.clone().negate()).negate().normalize()));
      sleeve.quaternion.copy(basisQuat(px.clone().negate(), up, new THREE.Vector3().crossVectors(px.clone().negate(), up)));
      // UWB tag on the left shoulder strap
      const shL = rig.shoulders && rig.shoulders.L ? rig.shoulders.L : rig.packC;
      tag.position.copy(shL).addScaledVector(back, -0.11).addScaledVector(up, -0.15).addScaledVector(px, -0.05);
      tag.quaternion.copy(basisQuat(px, back.clone().negate(), up));
      // ---- glider pose: sleeve (hold 0) → right glove (hold 1) → model pose (hold 2)
      const wPos = toV3(d.pos);
      let xA = toV3(d.bx).normalize(), yA = toV3(d.bz).normalize();
      const hold = d.hold ?? 2;
      const sPos = sleeveC.clone().addScaledVector(up, 0.06), sX = up.clone().negate(), sY = px.clone().negate();
      const hand = rig.hands && rig.hands.R ? rig.hands.R.grip.clone() : sPos.clone();
      const hPos = hand.clone().addScaledVector(up, 0.03), hX = back.clone().negate(), hY = up.clone();
      let P, X, Y;
      if (hold >= 2) { P = wPos; X = xA; Y = yA; }
      else if (hold >= 1) { const w = sstep(0, 1, hold - 1); P = hPos.clone().lerp(wPos, w); X = hX.clone().lerp(xA, w).normalize(); Y = hY.clone().lerp(yA, w).normalize(); }
      else { const w = sstep(0, 1, hold); P = sPos.clone().lerp(hPos, w); X = sX.clone().lerp(hX, w).normalize(); Y = sY.clone().lerp(hY, w).normalize(); }
      Y.addScaledVector(X, -Y.dot(X)).normalize();
      const Z = new THREE.Vector3().crossVectors(X, Y);
      glider.position.copy(P); glider.quaternion.copy(basisQuat(X, Y, Z));
      // fold: wing halves swing back over the pod (stowed / in the hand before the throw / after pick-up)
      const fold = Math.min(1, Math.max(0, d.fold ?? 0));
      for (const w of wings) w.piv.rotation.y = w.sz * fold * 1.45;
      // pusher: folded back when off, spinning (motion-blur disc) under thrust or regen
      const spin = d.propSpin || 0;
      for (const pr of props) {
        pr.hub.rotation.x = pr.dir * t * (spin > 0 ? 60 + 700 * spin : 0);
        const pf = spin > 0.05 ? 0 : 1;
        pr.blades.forEach((b, k) => { b.rotation.z = (k === 0 ? -1 : 1) * pf * 1.35; b.visible = spin < 0.45; });
        pr.disc.visible = spin > 0.12; mat.disc.opacity = Math.min(0.95, 0.25 + spin * 0.7);
      }
      // camera cradle points at the rider
      if (d.ball) {
        const dir = toV3(d.ball).normalize();
        const loc = dir.clone().applyQuaternion(glider.quaternion.clone().invert());
        ball.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), loc);
      } else ball.quaternion.identity();
      // LEDs
      const blink = Math.sin(t * 9) > 0.5 ? 1 : 0.15;
      const flying = hold >= 2 && !['slide', 'landed', 'stowed', 'crash'].includes(d.modeName);
      mat.ledW.emissiveIntensity = flying ? 3 * blink + 0.5 : 0.3;
      mat.ledR.emissiveIntensity = mat.ledG.emissiveIntensity = flying ? 3 : 0.6;
      mat.status.emissive.set(d.warn ? 0xffa020 : d.modeName === 'landed' ? 0x3aa0ff : 0x2cff8a);
      mat.status.emissiveIntensity = d.warn ? 1 + 2.5 * blink : 2.2;
      // ---- trees and neighbour (scenario props)
      forest.userData.on = !!d.trees;
      if (d.trees) {
        ensureTrees(d.trees.length);
        d.trees.forEach((tr, k) => { const o = treeObjs[k]; o.visible = true; o.position.copy(toV3([tr.x, tr.y, -tr.x * ctx.tanS])); o.scale.setScalar(1); });
        for (let k = d.trees.length; k < treeObjs.length; k++) treeObjs[k].visible = false;
      }
      forest.visible = glider.visible && forest.userData.on;
      nbG.userData.on = !!(d.neighbour && d.neighbour.on);
      nbG.visible = glider.visible && nbG.userData.on;
      if (nbG.userData.on) {
        nbG.position.copy(toV3(d.neighbour.pos));
        const h = toV3([d.neighbour.heading[0], d.neighbour.heading[1], 0]).normalize();
        nbG.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), h);
      }
    },
  };
}

// ------------------------------------------------------------ director
export function shots(t, st3, { frame, mode, result }) {
  const d = frame && frame.device;
  if (!d || !d.pos) return null;
  const UP = new THREE.Vector3(0, 1, 0);
  const P = st3.pos.clone(), F = st3.fwd.clone().setY(0).normalize(), L = new THREE.Vector3().crossVectors(UP, F).normalize();
  const D = toV3(d.pos);
  const chest = P.clone().addScaledVector(UP, 1.15);
  const mid = chest.clone().lerp(D, 0.5);
  const k01 = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const ease = (x) => x * x * (3 - 2 * x);
  const at = (o, f, l, u) => o.clone().addScaledVector(F, f).addScaledVector(L, l).addScaledVector(UP, u);
  const toD = D.clone().sub(P).setY(0); const dD = toD.length(); if (dD > 1e-3) toD.multiplyScalar(1 / dD); else toD.copy(F);
  const side = new THREE.Vector3().crossVectors(UP, toD).normalize();
  if (mode !== 'demo') {
    const i = Math.floor(t / 7) % 3, k = ease((t % 7) / 7);
    if (i === 0) return { pos: at(mid, -9 - 2 * k, 2.5, 4.2), target: mid.clone().addScaledVector(F, 1.5), fov: 46, shot: 'dg-chase' };
    if (i === 1) return { pos: at(mid, -1.5, -10, 2.2), target: mid.clone().addScaledVector(F, 1.0), fov: 44, shot: 'dg-side' };
    return { pos: D.clone().addScaledVector(toD, 1.5).addScaledVector(UP, 0.7).addScaledVector(side, 0.8), target: D.clone().lerp(chest, 0.35), fov: 50, shot: 'dg-over-glider' };
  }
  // demo: stage times from the (deterministic) result's events
  const ev = (type) => { const x = result && result.events.find((q) => q.type === type); return x ? x.t : null; };
  const C = result ? (result._dgT ||= { thr: ev('throw') ?? 3, ready: ev('ready') ?? 10, stop: (result.events.find((q) => q.type === 'loiter' && q.t > 15) || {}).t ?? 40, go2: (result.events.filter((q) => q.type === 'follow')[0] || {}).t ?? 55, pat: ev('pattern') ?? 70, land: ev('landed') ?? 85 }) : null;
  let s;
  const hero = (dist = 2.0) => { const away = D.clone().sub(P).setY(0).normalize(); return { pos: D.clone().addScaledVector(away, dist * 0.85).addScaledVector(UP, 1.0).addScaledVector(new THREE.Vector3().crossVectors(UP, away), 0.9), target: D.clone().lerp(chest, 0.5), fov: 50, shot: 'hero-chase' }; };
  if (!C) return hero();
  if (t < C.thr + 0.6) { const k = ease(k01(0, C.thr + 0.6)); s = { pos: at(P, 2.6 - 0.3 * k, -2.2, 1.5), target: chest.clone().lerp(D, 0.4), fov: 48, shot: 'draw-throw', dofOn: true }; }
  else if (t < C.ready + 1) { s = { pos: at(P, 3.5, -4.5, 2.2), target: D.clone().lerp(chest, 0.35), fov: 56, shot: 'climb-out' }; }
  else if (t < C.ready + 8) s = hero(2.0);
  else if (t < C.stop - 2) { const k = ease(k01(C.ready + 8, C.stop - 2)); s = { pos: at(mid, -0.5 + 1.5 * k, -5.5, 1.6), target: mid.clone().addScaledVector(F, 0.5), fov: 46, shot: 'side-track' }; }
  else if (t < C.go2) { s = { pos: at(P, 7, 3.5, 2.2), target: chest.clone().lerp(D, 0.5), fov: 58, shot: 'loiter-over-rider' }; }
  else if (t < C.go2 + 7) s = hero(2.2);
  else if (t < C.pat) s = { pos: D.clone().addScaledVector(toD, 1.6).addScaledVector(UP, 0.35).addScaledVector(side, 0.45), target: chest.clone().lerp(D, 0.2), fov: 50, shot: 'over-glider' };
  else if (t < C.land + 0.5) { s = { pos: at(P, 3.5, -6.5, 1.6), target: D.clone().lerp(chest, 0.3), fov: 58, shot: 'belly-landing' }; }
  else { const k = ease(k01(C.land, C.land + 6)); s = { pos: at(P, -1.8 + 0.3 * k, -2.9, 1.6), target: chest.clone().lerp(D, 0.4), fov: 46, shot: 'pick-up-stow', dofOn: true }; }
  if (s.dofOn) s.dof = { focus: s.pos.distanceTo(s.target), aperture: 0.0012 };
  return s;
}
