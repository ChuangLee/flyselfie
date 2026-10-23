// towglider gear (browser only), round 3: 132 g folding camera glider (EPP/carbon pod,
// 0.78 m wings on a single top pivot that swing aft AND fold along a 55 %-chord hinge so the
// folded glider fits an 80 mm holster, split flaps on the folding rear chord, folding V-tail,
// a closed-loop 3-servo pan/tilt/roll mount carrying a 4K gyro camera with a narrow 66° M12
// lens, belly skid, magnetic pogo tow hook), a 0.6 mm hi-vis conductive litz leash (48 V)
// drawn from the model's parabolic line, the belt (reel pod with drum, slip clutch and slip
// ring, 15 Wh pack + 48 V boost, button) and the hard 80 mm holster behind the seat (swivel
// clamp on the belt) whose back-down mouth is the leash exit (≥1.1 m from the helmet). The glider
// pitches nose-up in the deep-stall drop. Optional crossing skier and tree for the fault
// scenarios. Illustrative design, not CAD.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const toV3 = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function carbonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#16181c'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? '#23262c' : '#111317'; g.fillRect(x, y, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function wingTexture() {
  // EPP skin with a carbon spar stripe, orange tip band and a thin registration stripe
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#eef0ef'; g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + 0.03 * Math.random()})`; g.fillRect(Math.random() * 512, Math.random() * 64, 1.5, 1.5); }
  g.fillStyle = '#1b1d22'; g.fillRect(0, 18, 512, 6);
  g.fillStyle = '#ff6a1a'; g.fillRect(440, 0, 72, 64);
  g.fillStyle = '#20252c'; g.fillRect(0, 58, 512, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// airfoil (chord along +X from LE at 0 to TE at 1, thickness along +Y), extruded along +Z (span)
function airfoilGeometry(chord, semispan, tc = 0.09) {
  const s = new THREE.Shape();
  const n = 18, pts = [];
  for (let i = 0; i <= n; i++) { const x = 1 - i / n; pts.push([x, 5 * tc * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4) + 0.02 * Math.sin(Math.PI * x)]); }
  for (let i = 1; i <= n; i++) { const x = i / n; pts.push([x, -0.6 * 5 * tc * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4) + 0.02 * Math.sin(Math.PI * x)]); }
  s.moveTo(pts[0][0] * chord, pts[0][1] * chord);
  for (const [x, y] of pts.slice(1)) s.lineTo(x * chord, y * chord);
  const g = new THREE.ExtrudeGeometry(s, { depth: semispan, bevelEnabled: false, steps: 1 });
  // UVs: u along span, v along chord
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getZ(i) / semispan, pos.getX(i) / chord);
  g.computeVertexNormals();
  return g;
}

export function createGear(scene) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    foam: M({ color: 0xf2f3f1, roughness: 0.62, sheen: 0.5, sheenColor: 0xffffff, sheenRoughness: 0.6 }),
    wing: M({ map: wingTexture(), roughness: 0.55, sheen: 0.4, sheenColor: 0xffffff, side: THREE.DoubleSide }),
    carbon: M({ map: carbonTexture(), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }),
    orange: M({ color: 0xff5a14, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    dark: M({ color: 0x111317, roughness: 0.35, metalness: 0.25 }),
    alu: M({ color: 0x9aa3ad, metalness: 0.95, roughness: 0.28 }),
    aluRed: M({ color: 0xb8361f, metalness: 0.9, roughness: 0.3 }),
    rubber: M({ color: 0x1a1c1f, roughness: 0.9 }),
    glass: M({ color: 0x07090d, roughness: 0.03, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.6, iridescenceIOR: 1.5 }),
    pod: M({ color: 0x2c333c, roughness: 0.45, metalness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
    podDS: M({ color: 0x2c333c, roughness: 0.45, metalness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25, side: THREE.DoubleSide }),
    webbing: M({ color: 0x23272d, roughness: 0.95, sheen: 0.6, sheenColor: 0x4a5058 }),
    funnel: M({ color: 0x30363e, roughness: 0.55, side: THREE.DoubleSide }),
    ring: new THREE.MeshStandardMaterial({ color: 0x0b1410, emissive: 0x2cff8a, emissiveIntensity: 2.5 }),
    ledR: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3 }),
    ledG: new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x23ff6a, emissiveIntensity: 3 }),
    jacket: M({ color: 0x1f8a8a, roughness: 0.8, sheen: 0.5, sheenColor: 0x7fd6d6 }),
    pants: M({ color: 0x2a2d35, roughness: 0.85 }),
    helmet: M({ color: 0xeeeeee, roughness: 0.3, clearcoat: 0.8 }),
    branch: M({ color: 0x4a3626, roughness: 0.95 }),
    needles: M({ color: 0x23402c, roughness: 0.9, sheen: 0.4, sheenColor: 0x4f7a5a }),
  };
  const shadow = (m) => { m.castShadow = true; return m; };

  // ------------------------------------------------------------ glider (local: +X nose, +Y up, +Z right)
  const glider = new THREE.Group();
  const fusePts = [];
  for (let i = 0; i <= 24; i++) { const u = i / 24; const r = 0.024 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.02)), 0.6) * (1 - 0.55 * u) + 0.004; fusePts.push(new THREE.Vector2(r, -0.17 + 0.34 * (1 - u))); }
  const fuse = shadow(new THREE.Mesh(new THREE.LatheGeometry(fusePts, 28), mat.foam)); fuse.rotation.z = -Math.PI / 2; fuse.scale.set(1, 1, 0.85);
  const boom = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, 0.14, 12), mat.carbon)); boom.rotation.z = Math.PI / 2; boom.position.set(-0.2, 0.004, 0);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.012, 28), mat.orange); stripe.rotation.z = Math.PI / 2; stripe.position.set(0.06, 0, 0); stripe.scale.set(1, 1, 0.86);
  glider.add(fuse, boom, stripe);
  // camera gimbal under the nose (pan yoke + tilt ball + lens)
  const yoke = new THREE.Group(); yoke.position.set(0.13, -0.02, 0);
  const yokeArm = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.02, 0.034, 2, 0.004), mat.dark); yokeArm.position.y = -0.004;
  const tilt = new THREE.Group(); tilt.position.y = -0.016;
  // closed-loop 3-servo stabilised mount (pan yoke → tilt arm → roll ring) carrying the 4K gyro camera
  const roll = new THREE.Group();
  const camBody = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.022, 0.022, 2, 0.004), mat.dark));
  // narrow M12 rectilinear lens: a short barrel with a flat front element (round 3; the round-2 fisheye dome is gone)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.012, 24), mat.dark); barrel.rotation.z = -Math.PI / 2; barrel.position.x = 0.021;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 24), mat.glass); lens.rotation.y = Math.PI / 2; lens.position.x = 0.0272;
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.0068, 0.0012, 8, 24), mat.alu); lensRing.rotation.y = Math.PI / 2; lensRing.position.x = 0.0272;
  roll.add(barrel);
  const rollRing = new THREE.Mesh(new THREE.TorusGeometry(0.0135, 0.0018, 8, 24), mat.orange); rollRing.rotation.y = Math.PI / 2; rollRing.position.x = -0.006;
  roll.add(camBody, lens, lensRing, rollRing); tilt.add(roll);
  const ball = camBody;
  yoke.add(yokeArm, tilt); glider.add(yoke);
  // tow hook + load cell under the forward fuselage, belly skid
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.0015, 8, 16, Math.PI * 1.4), mat.aluRed); hook.position.set(0.05, -0.03, 0); hook.rotation.x = Math.PI / 2;
  const skid = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.006, 0.014, 2, 0.003), mat.rubber); skid.position.set(-0.01, -0.024, 0);
  glider.add(hook, skid);
  const hookLocal = new THREE.Vector3(0.05, -0.03, 0);
  // scissor wings on one pivot on the fuselage top: two panels stacked, each pivots about Y
  const wings = [];
  const pivot = new THREE.Vector3(0.07, 0.026, 0);
  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.012, 18), mat.alu); pylon.position.set(0.07, 0.022, 0); glider.add(pylon);
  for (const sgn of [1, -1]) {
    const piv = new THREE.Group(); piv.position.copy(pivot).add(new THREE.Vector3(0, sgn > 0 ? 0.0 : 0.009, 0));
    // front 55 % of the chord (fixed to the pivot arm) + rear 45 % on a lower-surface chord hinge (folds under for the holster)
    const pan = shadow(new THREE.Mesh(airfoilGeometry(0.0533, 0.39, 0.15), mat.wing));
    // panel local: chord along +X from LE; span along +Z; place LE ahead of the pivot
    pan.position.set(0.03, 0, 0); pan.rotation.y = Math.PI; // chord runs aft (−X), span towards +Z (flipped below for the left panel)
    const span = new THREE.Group(); span.add(pan); span.scale.z = sgn;
    const rearH = new THREE.Group(); rearH.position.set(-0.0233, -0.0025, 0);
    const rear = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.0435, 0.0035, 0.39, 1, 0.0012), mat.foam)); rear.position.set(-0.0218, 0, -0.195);
    const tipBand = new THREE.Mesh(new THREE.BoxGeometry(0.0435, 0.0038, 0.05), mat.orange); tipBand.position.set(-0.0218, 0, -0.36);
    rearH.add(rear, tipBand); span.add(rearH);
    // split-flap airbrake on the inboard rear chord (hinged at the lower surface)
    const flapH = new THREE.Group(); flapH.position.set(-0.03, -0.002, -0.02);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0025, 0.1), mat.orange); flap.position.set(-0.011, 0, -0.05);
    flapH.add(flap); rearH.add(flapH);
    piv.add(span); glider.add(piv);
    wings.push({ piv, span, flapH, rearH, sgn });
  }
  // folding V-tail
  const tails = [];
  for (const sgn of [1, -1]) {
    const th = new THREE.Group(); th.position.set(-0.25, 0.006, 0);
    const fin = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.075, 0.003, 2, 0.0012), mat.foam)); fin.position.set(-0.01, 0.034, 0);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.0035), mat.orange); tip.position.set(-0.016, 0.068, 0);
    th.add(fin, tip); glider.add(th); tails.push({ th, sgn });
  }
  const ledR = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), mat.ledR); ledR.position.set(-0.29, 0.006, 0);
  const ledG = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 8, 6), mat.ledG); ledG.position.set(0.08, 0.024, 0);
  glider.add(ledR, ledG);
  scene.add(glider);

  // ------------------------------------------------------------ hip unit: belt, reel pod, holster + funnel, button
  const hip = new THREE.Group();
  const belt = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 10, 48), mat.webbing)); belt.scale.set(1, 0.78, 1);
  const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.035, 0.012, 2, 0.004), mat.alu);
  const holster = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.46, 24, 1, true), mat.podDS));
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.007, 8, 28), mat.alu); // swivel clamp to the belt (rotates the holster aside for the chairlift)
  const holsterCap = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.04, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.pod));
  const funnel = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.04, 0.06, 32, 1, true), mat.funnel));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 8, 40), mat.ring);
  const holsterStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0408, 0.0408, 0.012, 24, 1, true), mat.orange);
  const reel = new THREE.Group();
  const reelBody = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 32), mat.pod));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.032, 32), mat.orange);
  const drumCap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.036, 6), mat.alu);
  const clutch = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.003, 8, 32), mat.aluRed); clutch.rotation.x = Math.PI / 2; clutch.position.y = 0.017;
  reel.add(reelBody, drum, drumCap, clutch);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 20), mat.orange);
  const buttonLed = new THREE.Mesh(new THREE.TorusGeometry(0.0135, 0.0018, 6, 20), mat.ring);
  // round 4 line-guide wand: 0.35 m Ø3 mm glass-fibre rod hinged at the holster mouth, ceramic eyelet at the tip (leash exit
  // ≈0.85 m behind the pelvis, ≥1.36 m from the helmet); it folds along the holster for the last metre of a stow
  const wand = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.002, 1, 8), mat.orange));
  const wandTip = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0015, 6, 14), mat.alu);
  hip.add(belt, buckle, holster, holsterCap, funnel, ring, holsterStripe, strap, reel, button, buttonLed, wand, wandTip);
  scene.add(hip);

  // ------------------------------------------------------------ leash (0.6 mm hi-vis conductive litz)
  const lineMat = new LineMaterial({ color: 0xff7a2a, linewidth: 1.6, worldUnits: false });
  // hip power pack (15 Wh) + 48 V boost on the belt, right side
  const pack = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.05, 0.026, 2, 0.006), mat.pod));
  const packLed = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.002), mat.ledG);
  hip.add(pack, packLed);
  const line = new Line2(new LineGeometry(), lineMat); line.frustumCulled = false; scene.add(line);
  const freeLine = new Line2(new LineGeometry(), lineMat); freeLine.frustumCulled = false; scene.add(freeLine);

  // ------------------------------------------------------------ crossing skier (fault scenario)
  const crosser = new THREE.Group();
  const cap = (r, l, m) => shadow(new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 12), m));
  const cTorso = cap(0.17, 0.42, mat.jacket); cTorso.position.y = 1.15;
  const cHead = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), mat.helmet)); cHead.position.y = 1.66;
  const cLegL = cap(0.08, 0.62, mat.pants), cLegR = cap(0.08, 0.62, mat.pants); cLegL.position.set(0, 0.47, 0.1); cLegR.position.set(0, 0.47, -0.1);
  const cArmL = cap(0.055, 0.45, mat.jacket), cArmR = cap(0.055, 0.45, mat.jacket); cArmL.position.set(0.12, 1.15, 0.24); cArmR.position.set(0.12, 1.15, -0.24); cArmL.rotation.z = cArmR.rotation.z = -0.6;
  const cSkiL = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.02, 0.08, 2, 0.008), mat.dark), cSkiR = cSkiL.clone(); cSkiL.position.set(0.1, 0.01, 0.1); cSkiR.position.set(0.1, 0.01, -0.1);
  crosser.add(cTorso, cHead, cLegL, cLegR, cArmL, cArmR, cSkiL, cSkiR);
  crosser.visible = false; scene.add(crosser);
  // ------------------------------------------------------------ tree (snag scenario)
  const tree = new THREE.Group();
  const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 9, 12), mat.branch));
  const limb = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.08, 1, 8), mat.branch));
  tree.add(trunk, limb);
  const cones = []; for (let k = 0; k < 6; k++) { const c = shadow(new THREE.Mesh(new THREE.ConeGeometry(1.6 - k * 0.22, 1.6, 10), mat.needles)); tree.add(c); cones.push(c); }
  const twigs = []; for (let k = 0; k < 14; k++) { const tw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), mat.needles); tree.add(tw); twigs.push(tw); }
  tree.visible = false; scene.add(tree);

  const all = [glider, hip, line, freeLine];
  const basisQuat = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const setLine = (l, pts) => { const arr = []; for (const p of pts) arr.push(p.x, p.y, p.z); const g = new LineGeometry(); g.setPositions(arr); l.geometry.dispose(); l.geometry = g; l.computeLineDistances(); };

  return {
    hideInPip: [glider, line, freeLine], // the 0.6 mm leash is drawn ≥1 px for visibility in director views; its true pixel width in the product image is computed in analysis.js
    setVisible(v) { for (const o of all) o.visible = v; crosser.visible = v && !!crosser.userData.on; tree.visible = v && !!tree.userData.on; },
    update(d, ctx) {
      const cv = typeof document !== 'undefined' && document.getElementById('gl3d');
      if (cv) lineMat.resolution.set(cv.width || 1, cv.height || 1);
      const rig = ctx.skier;
      if (!rig.pelvisPos || !rig.basis || !d.glider) return;
      const B = rig.basis, P0 = rig.pelvisPos.clone();
      const at = (f, l, u) => P0.clone().addScaledVector(B.f, f).addScaledVector(B.left, l).addScaledVector(B.up, u);
      // ---- hip unit
      const beltC = at(-0.02, 0, 0.02);
      belt.position.copy(beltC); belt.quaternion.copy(basisQuat(B.f, B.left, B.up));
      buckle.position.copy(at(0.16, 0, 0.02)); buckle.quaternion.copy(basisQuat(B.left, B.up, B.f));
      // tail holster (round 3): 80 mm hard tube behind the seat, 37° below horizontal, mouth back-down (= leash exit)
      const ax = B.f.clone().multiplyScalar(-0.8).addScaledVector(B.left, 0.05).addScaledVector(B.up, -0.6).normalize();
      const mouth = at(-0.55, 0.05, -0.15);
      const hc = mouth.clone().addScaledVector(ax, -0.23);
      holster.position.copy(hc); holster.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax);
      holsterCap.position.copy(mouth.clone().addScaledVector(ax, -0.46)); holsterCap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax.clone().negate());
      holsterStripe.position.copy(mouth.clone().addScaledVector(ax, -0.1)); holsterStripe.quaternion.copy(holster.quaternion);
      funnel.position.copy(mouth.clone().addScaledVector(ax, 0.01)); funnel.quaternion.copy(holster.quaternion);
      ring.position.copy(mouth.clone().addScaledVector(ax, 0.04)); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax);
      strap.position.copy(mouth.clone().addScaledVector(ax, -0.42)); strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax);
      const wandOut = !(d.mode === 'stowed' || d.mode === 'docked' || d.mode === 'seat' || ((d.mode === 'snowpull' || d.mode === 'reelin') && (d.L || 0) < 1));
      const tipOut = at(-0.85, 0.05, -0.1), tipIn = mouth.clone().addScaledVector(ax, -0.3);
      const exitP = wandOut ? tipOut : mouth.clone().addScaledVector(ax, 0.03);
      { const wb = mouth.clone(), wt = wandOut ? tipOut : tipIn, dv = wt.clone().sub(wb); wand.position.copy(wb).addScaledVector(dv, 0.5); wand.scale.set(1, dv.length(), 1); wand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.normalize()); wandTip.position.copy(wt); wandTip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dv); }
      reel.position.copy(at(-0.06, 0.19, -0.02)); reel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.left);
      drum.rotation.y = (d.L || 0) / 0.025; drumCap.rotation.y = drum.rotation.y;
      pack.position.copy(at(-0.08, -0.17, 0.0)); pack.quaternion.copy(basisQuat(B.f, B.up, B.left.clone().negate()));
      packLed.position.copy(at(-0.08, -0.185, 0.02)); packLed.quaternion.copy(pack.quaternion);
      button.position.copy(at(0.12, 0.13, 0.03)); button.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.f);
      buttonLed.position.copy(button.position).addScaledVector(B.f, 0.004); buttonLed.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), B.f);
      const blink = Math.sin((ctx.t || 0) * 12) > 0 ? 1 : 0.25;
      const col = d.warn ? 0xffa020 : d.mode === 'docked' || d.mode === 'stowed' || d.mode === 'seat' ? 0x3aa0ff : 0x2cff8a;
      mat.ring.emissive.setHex(col); mat.ring.emissiveIntensity = (d.warn ? blink : 1) * 2.6;
      // ---- glider pose: model pose, blended onto the rendered holster near the body
      const modelA = toV3(d.anchor), dA = exitP.clone().sub(modelA);
      let gpos = toV3(d.glider);
      const near = 1 - sstep(0.6, 2.5, gpos.distanceTo(modelA));
      gpos.addScaledVector(dA, near);
      let fw = toV3(d.fwd).normalize(), up = toV3(d.up).normalize();
      const inside = d.mode === 'stowed' || d.mode === 'docked' || d.mode === 'seat';
      if (inside) { gpos = mouth.clone().addScaledVector(ax, d.mode === 'seat' ? -0.06 - 0.19 * Math.min(1, d.fold) : -0.25); fw = ax.clone().negate(); up = B.left.clone(); glider.visible = d.mode === 'seat'; } else glider.visible = hip.visible; // stowed: inside the opaque holster
      up.addScaledVector(fw, -up.dot(fw)); if (up.lengthSq() < 1e-6) up.set(0, 1, 0); up.normalize();
      if (!inside && (d.post || 0) > 0.01) { // deep-stall drop: nose-up ~40° about the wing axis (post-stall plate)
        const ax2 = new THREE.Vector3().crossVectors(fw, up).normalize(), a2 = 0.7 * Math.min(1, d.post);
        fw.applyAxisAngle(ax2, a2); up.applyAxisAngle(ax2, a2);
      }
      const rz = new THREE.Vector3().crossVectors(fw, up).normalize();
      glider.position.copy(gpos); glider.quaternion.copy(basisQuat(fw, up, rz));
      const fold = Math.min(1, Math.max(0, d.fold ?? 0));
      for (const w of wings) {
        w.piv.rotation.y = w.sgn * (Math.PI / 2 - 0.06) * sstep(0, 1, fold) * -1; // panels swing aft along the fuselage
        w.flapH.rotation.z = 0.9 * (d.brake || 0) * (1 - fold);
        w.rearH.rotation.z = Math.PI * 0.97 * sstep(0.1, 0.8, fold); // rear chord folds under the front for the holster
      }
      for (const tl of tails) { tl.th.rotation.x = tl.sgn * (0.65 - 0.55 * fold); }
      // gimbal: pan/tilt the camera ball towards the product-camera direction
      if (d.camDir && !inside) {
        const cd = toV3(d.camDir).normalize();
        const lx = cd.dot(fw), ly = cd.dot(up), lz = cd.dot(rz);
        yoke.rotation.y = -Math.atan2(lz, lx); tilt.rotation.z = Math.atan2(ly, Math.hypot(lx, lz));
        roll.rotation.x = -Math.asin(Math.max(-1, Math.min(1, rz.y))) * 0.9; // roll servo levels the camera horizon
      } else { yoke.rotation.y = 0; tilt.rotation.z = -0.3; }
      const ledOn = !inside;
      mat.ledR.emissiveIntensity = ledOn ? (Math.sin((ctx.t || 0) * 9) > 0.5 ? 6 : 1.5) : 0.2; mat.ledG.emissiveIntensity = ledOn ? 3 : 0.2;
      glider.updateMatrixWorld();
      // ---- leash: model polyline, ends snapped to the rendered funnel and hook
      const hookW = hookLocal.clone().applyMatrix4(glider.matrixWorld);
      const show = d.hook && Array.isArray(d.leash) && d.leash.length > 1 && !inside && (d.L || 0) > 0.08;
      line.visible = show && glider.visible !== false && hip.visible;
      if (show) {
        const N = d.leash.length - 1;
        const pts = d.leash.map((p) => toV3(p));
        const dB = hookW.clone().sub(pts[N]);
        for (let j = 0; j <= N; j++) { pts[j].addScaledVector(dA, 1 - j / N).addScaledVector(dB, j / N); }
        pts[0].copy(exitP); pts[N].copy(hookW);
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        setLine(line, curve.getPoints(Math.max(24, N * 4)));
        if (ctx.camera && cv) {
          const mid = pts[Math.floor(N / 2)];
          const fpx = (cv.height / 2) / Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2);
          lineMat.linewidth = Math.min(2.2, Math.max(1.1, ((d.dLine || 0.00017) * fpx) / Math.max(0.3, ctx.camera.position.distanceTo(mid))));
        }
      }
      freeLine.visible = !!(d.freeLine && d.freeLine.length > 1) && hip.visible;
      if (freeLine.visible) { const pts = d.freeLine.map((p) => toV3(p)); pts[0].copy(exitP); setLine(freeLine, pts); }
      // ---- crossing skier
      crosser.userData.on = !!d.crosser; crosser.visible = !!d.crosser && hip.visible;
      if (d.crosser) {
        crosser.position.copy(toV3(d.crosser));
        const dir = d.crosserDir ? toV3([d.crosserDir[0], d.crosserDir[1], -d.crosserDir[0] * (ctx.tanS || 0)]).normalize() : new THREE.Vector3(1, 0, 0);
        const yv = new THREE.Vector3(0, 1, 0), zv = new THREE.Vector3().crossVectors(dir, yv).normalize();
        crosser.quaternion.copy(basisQuat(dir, yv, zv));
      }
      // ---- tree with an overhanging limb
      tree.userData.on = !!d.branch; tree.visible = !!d.branch && hip.visible;
      if (d.branch) {
        const b = d.branch, baseV = toV3([b.x, b.y1 + 0.3, -b.x * ctx.tanS]);
        trunk.position.copy(baseV).add(new THREE.Vector3(0, 4.5, 0));
        const a = toV3([b.x, b.y0, b.z]), c = toV3([b.x, b.y1 + 0.3, b.z]);
        limb.position.copy(a).lerp(c, 0.5); limb.scale.set(1, a.distanceTo(c), 1);
        limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
        cones.forEach((cn, k) => { cn.position.copy(baseV).add(new THREE.Vector3(0, 4.0 + k * 0.85, 0)); });
        twigs.forEach((tw, k) => { const f = (k + 0.5) / twigs.length; tw.position.copy(a).lerp(c, f).add(new THREE.Vector3(0, 0.05 * Math.sin(k * 2.1), 0.12 * Math.cos(k * 1.7))); tw.rotation.set(Math.PI / 2 + 0.3 * Math.sin(k), 0, 0.4 * Math.cos(k * 1.3)); });
      }
    },
  };
}

// ------------------------------------------------------------ director
export function shots(t, st3, { frame, mode }) {
  const d = frame && frame.device;
  if (!d || !d.glider) return null;
  const UP = new THREE.Vector3(0, 1, 0);
  const P = st3.pos.clone();
  let F = toV3([d.course[0], d.course[1], 0]); if (F.lengthSq() < 0.5) F = st3.fwd.clone(); F.y = 0; F.normalize();
  const Lf = new THREE.Vector3().crossVectors(UP, F).normalize();
  const at = (f, l, u, o = P) => o.clone().addScaledVector(F, f).addScaledVector(Lf, l).addScaledVector(UP, u);
  const G = toV3(d.glider), hipP = P.clone().addScaledVector(UP, 0.95);
  const mid = hipP.clone().lerp(G, 0.45);
  const k01 = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const ease = (x) => x * x * (3 - 2 * x);
  if (mode !== 'demo') {
    const far = G.distanceTo(hipP) > 25;
    const i = Math.floor(t / 7) % 2, k = ease((t % 7) / 7);
    if (far) return { pos: at(-6, 5, 3), target: hipP.clone().addScaledVector(F, 2), fov: 46, shot: 'tg-rider' };
    if (i === 0) return { pos: G.clone().addScaledVector(F, -6 - 2 * k).addScaledVector(Lf, 3.5).addScaledVector(UP, 2.5), target: mid.clone().addScaledVector(F, 1.5).addScaledVector(Lf, -0.8), fov: 48, shot: 'tg-rear3q' };
    return { pos: at(-3.5, -11, 3.2), target: mid.clone().addScaledVector(F, 1.0), fov: 46, shot: 'tg-side' };
  }
  let s;
  const GL = G.clone().lerp(hipP, 0.5);
  if (t < 1.5) { s = { pos: at(-2.4, 1.9, 1.45), target: at(-0.2, 0.15, 0.9), fov: 36, shot: 'carry', dofOn: true }; }
  else if (t < 7) { const k = ease(k01(1.5, 7)); s = { pos: at(-3.2 - 3 * k, 2.6 + 1.2 * k, 1.1 + 0.6 * k), target: hipP.clone().lerp(G, 0.5).addScaledVector(UP, -0.3), fov: 44, shot: 'launch-low' }; }
  else if (t < 13) { const k = ease(k01(7, 13)); s = { pos: G.clone().addScaledVector(F, -6 + 1.5 * k).addScaledVector(Lf, 4.5 - 2 * k).addScaledVector(UP, 2.6), target: mid.clone().addScaledVector(F, 2), fov: 44, shot: 'chase-high' }; }
  else if (t < 16) { const k = ease(k01(13, 16)); s = { pos: G.clone().addScaledVector(F, 0.6 - 1.6 * k).addScaledVector(Lf, 1.9).addScaledVector(UP, 0.35 + 0.3 * k), target: G.clone().addScaledVector(F, 0.1).addScaledVector(Lf, -0.25), fov: 34, shot: 'glider-hero', dofOn: true }; }
  else if (t < 23) { s = { pos: G.clone().addScaledVector(F, -2.6).addScaledVector(Lf, 0.8).addScaledVector(UP, 1.1), target: hipP.clone().lerp(G, 0.15), fov: 46, shot: 'over-glider' }; }
  else if (t < 30) { s = { pos: GL.clone().addScaledVector(F, 1).addScaledVector(Lf, -9).addScaledVector(UP, 2.5), target: GL.clone().addScaledVector(UP, -0.4), fov: 52, shot: 'drop-side' }; }
  else if (t < 35.3) { s = { pos: G.clone().addScaledVector(F, 1.8).addScaledVector(Lf, -2.2).addScaledVector(UP, 1.1), target: G.clone().lerp(hipP, 0.3), fov: 46, shot: 'park-close', dofOn: true }; }
  else if (t < 40.5) { const k = ease(k01(35.3, 40.5)); s = { pos: at(-3.5 - 3 * k, 3.0 + k, 1.0 + 0.8 * k), target: hipP.clone().lerp(G, 0.5).addScaledVector(UP, -0.3), fov: 46, shot: 'relaunch' }; }
  else if (t < 48) { const k = ease(k01(40.5, 48)); s = { pos: GL.clone().addScaledVector(F, -2 - 2 * k).addScaledVector(Lf, -9).addScaledVector(UP, 3.2), target: GL.clone().addScaledVector(UP, -0.3), fov: 58, shot: 'gust-side' }; }
  else if (t < 54.8) { const k = ease(k01(48, 54.8)); const a = 2.6 + 1.3 * k; s = { pos: mid.clone().addScaledVector(F, Math.cos(a) * 9).addScaledVector(Lf, Math.sin(a) * 9).addScaledVector(UP, 3.2), target: mid, fov: 46, shot: 'orbit' }; }
  else if (t < 61) { s = { pos: GL.clone().addScaledVector(F, 1.5).addScaledVector(Lf, -8).addScaledVector(UP, 2.4), target: GL.clone().addScaledVector(UP, -0.4), fov: 50, shot: 'stow-drop' }; }
  else if (t < 65) { s = { pos: at(-1.8, 2.4, 1.3), target: at(-0.6, 0.4, 0.7), fov: 44, shot: 'snow-pull', dofOn: true }; }
  else { const k = ease(k01(65, 72.7)); s = { pos: at(-2.4 + 0.5 * k, 1.8 - 0.3 * k, 1.5), target: at(-0.2, 0.12, 0.95), fov: 38 - 4 * k, shot: 'stowed', dofOn: true }; }
  if (s.dofOn) s.dof = { focus: s.pos.distanceTo(s.target), aperture: 0.0012 };
  return s;
}
