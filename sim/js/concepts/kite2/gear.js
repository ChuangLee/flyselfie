// K2-R3 kite gear (browser only), iteration 3: slotted round canopy (gores,
// two rear vent-slot gores, skirt reefing ring, glide tilt, flag/collapse
// states), 8 suspension lines to the kite control unit (KCU) pod, 4K camera on a
// 0.2 m carbon side arm, 0.5 mm hi-vis tether, and the 2.9 L pack-top dock pod
// (clamshell lid, drum window, LED ring, strap button, rear radar) with a 1.45 m
// 6-section 3.0→2.5 mm telescopic carbon boom on a FREE damped pivot (round 4:
// passive, aligned by the line, no motors), a 2.5 mm tip ring (the docking cone is
// on the KCU; the canopy is snuffed by fully cinching its reefing line, no tip
// sleeve), and folds flat on the lid when docked.
// Optional scenario props: tree limb (snag) and a crossing skier.
// Illustrative product design driven by the simulated device state — not CAD.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const toV3 = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const basisQuat = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

function canopyTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  const cells = 15, cols = ['#ff5a1f', '#ff5a1f', '#f4f1ea', '#13b5c8', '#f4f1ea', '#ff5a1f', '#ff5a1f'];
  for (let i = 0; i < cells; i++) {
    const k = Math.abs(i - (cells - 1) / 2);
    g.fillStyle = k < 1 ? '#1d2733' : cols[Math.min(cols.length - 1, Math.round(k)) % cols.length];
    g.fillRect((i * 1024) / cells, 0, 1024 / cells + 1, 256);
  }
  // rib seams + ripstop grid
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 3;
  for (let i = 1; i < cells; i++) { const x = (i * 1024) / cells; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 1;
  for (let i = 0; i < 1024; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); }
  for (let j = 0; j < 256; j += 10) { g.beginPath(); g.moveTo(0, j); g.lineTo(1024, j); g.stroke(); }
  // leading-edge reinforcement and trailing-edge tape
  g.fillStyle = 'rgba(20,24,30,0.85)'; g.fillRect(0, 0, 1024, 14); g.fillRect(0, 246, 1024, 10);
  // two rear vent-slot gores (dark) — the glide jets
  g.fillStyle = '#0b0f14'; for (const gx of [0.70, 0.80]) g.fillRect(gx * 1024, 90, 1024 / 15 * 0.8, 120);
  // small logo patch
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 34px sans-serif'; g.fillText('K2', 600, 150);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function carbonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? '#23262c' : '#121418'; g.fillRect(x, y, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 6); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createGear(scene) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    canopy: M({ map: canopyTexture(), side: THREE.DoubleSide, roughness: 0.6, sheen: 0.9, sheenRoughness: 0.35, sheenColor: 0xffffff }),
    pod: M({ color: 0x2e353e, roughness: 0.38, metalness: 0.7, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
    podAccent: M({ color: 0xff5a1f, roughness: 0.42, metalness: 0.2, clearcoat: 0.4 }),
    shell: M({ color: 0xf1f2f0, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    rubber: M({ color: 0x15171a, roughness: 0.92 }),
    carbon: M({ map: carbonTexture(), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }),
    alu: M({ color: 0xb8bcc2, metalness: 0.95, roughness: 0.25 }),
    glass: M({ color: 0x060a10, roughness: 0.03, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.7, iridescenceIOR: 1.5 }),
    window: M({ color: 0x0c1218, roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1 }),
    drum: M({ color: 0xffb21a, roughness: 0.5 }),
    ring: new THREE.MeshStandardMaterial({ color: 0x0b1410, emissive: 0x2cff8a, emissiveIntensity: 2.5 }),
    led: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2cff8a, emissiveIntensity: 3 }),
    branch: M({ color: 0x4a3626, roughness: 0.95 }),
    needles: M({ color: 0x23402c, roughness: 0.9, sheen: 0.4, sheenColor: 0x4f7a5a }),
    jacket: M({ color: 0x2f6bd8, roughness: 0.7, sheen: 0.4 }),
    pants: M({ color: 0x23272e, roughness: 0.8 }),
    skin: M({ color: 0xd8a98a, roughness: 0.6 }),
  };
  const shadow = (m) => { m.castShadow = true; return m; };

  // ------------------------------------------------------------ canopy (single-skin arc foil)
  const NU = 48, NV = 12;
  const canopyGeo = new THREE.PlaneGeometry(1, 1, NU, NV);
  const canopy = shadow(new THREE.Mesh(canopyGeo, mat.canopy));
  const kiteG = new THREE.Group(); // local: X span, Y up (away from the KCU), Z downstream chord
  kiteG.add(canopy);
  scene.add(kiteG);
  const BR = 0.7; // suspension-line length skirt → confluence (m)
  // canopy point (local) for span s∈[-1,1], chord u∈[0,1]
  const shape = { span: 0.71, infl: 1, flag: 0, reef: 1, tilt: 0, t: 0 };
  // round slotted canopy: s ∈ [-1,1] → azimuth around the canopy axis (local Y, along the tether), u ∈ [0,1] apex → skirt.
  // Reefing gathers the skirt (radius ∝ reef), glide tilts the canopy, two rear gores carry the open vent slots.
  function cpt(s, u, out) {
    const { infl, flag, reef, tilt } = shape;
    const R = shape.span / 2;
    const ph = Math.PI * s;
    const th = u * 1.45 * (0.35 + 0.65 * infl) * (1 - 0.55 * flag);
    const rf = 1 - (1 - Math.sqrt(Math.max(0.15, reef))) * u * u; // skirt reefing ring pulls the hem in
    let x = R * Math.sin(th) * Math.cos(ph) * rf, z = R * Math.sin(th) * Math.sin(ph) * rf, y = R * (Math.cos(th) - 1) * (0.75 + 0.25 * infl) + 0.18;
    // gore scallops between radial tapes
    const sc = 0.025 * R * Math.sin(th) * (1 - Math.abs(Math.cos(8 * ph))) * infl * (1 - flag);
    x += sc * Math.cos(ph); z += sc * Math.sin(ph);
    // glide tilt (the canopy leans into its glide direction) about the local X axis
    const ct = Math.cos(tilt), st = Math.sin(tilt); const y2 = y * ct - z * st, z2 = y * st + z * ct; y = y2; z = z2;
    const wr = (1 - infl) * 0.05 + flag * 0.07;
    if (wr > 0) { const p2 = shape.t * 9; y += wr * Math.sin(7 * s + 11 * u + p2); x += wr * 0.5 * Math.sin(5 * u + 3 * s + p2 * 1.3); }
    out.set(x, y - flag * 0.3 * u, z + flag * 0.4 * u);
    return out;
  }
  const tmpV = new THREE.Vector3();
  function buildCanopy() {
    const pos = canopyGeo.attributes.position;
    let k = 0;
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) { cpt((i / NU) * 2 - 1, j / NV, tmpV); pos.setXYZ(k++, tmpV.x, tmpV.y, tmpV.z); }
    pos.needsUpdate = true; canopyGeo.computeVertexNormals(); canopyGeo.computeBoundingSphere();
  }
  // 8 suspension lines skirt → confluence (blue = slot-control lines on the two rear gores, orange = reefing line hem)
  const bridleMat = new THREE.LineBasicMaterial({ color: 0x2a2d33, transparent: true, opacity: 0.85 });
  const brakeMat = new THREE.LineBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.9 });
  const NB = 8, NR = 32;
  const bridle = new THREE.LineSegments(new THREE.BufferGeometry(), bridleMat);
  bridle.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NB * 2 * 3), 3));
  const brakes = new THREE.LineSegments(new THREE.BufferGeometry(), brakeMat);
  brakes.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((NR * 2 + 4) * 3), 3));
  bridle.frustumCulled = brakes.frustumCulled = false;
  kiteG.add(bridle, brakes);
  const conf = new THREE.Vector3(0, -BR, 0);
  function buildBridle() {
    const a = bridle.geometry.attributes.position, b = brakes.geometry.attributes.position;
    let k = 0, kb = 0;
    for (let i = 0; i < NB; i++) { cpt((i / NB) * 2 - 1, 1, tmpV); a.setXYZ(k++, tmpV.x, tmpV.y, tmpV.z); a.setXYZ(k++, conf.x, conf.y, conf.z); }
    // reefing line along the hem
    const p0 = new THREE.Vector3();
    for (let i = 0; i < NR; i++) { cpt((i / NR) * 2 - 1, 0.99, tmpV); cpt(((i + 1) / NR) * 2 - 1, 0.99, p0); b.setXYZ(kb++, tmpV.x, tmpV.y, tmpV.z); b.setXYZ(kb++, p0.x, p0.y, p0.z); }
    // slot control lines (rear gores, s ≈ ±0.5 → +Z side is downstream)
    for (const s of [0.4, 0.6]) { cpt(s, 0.75, tmpV); b.setXYZ(kb++, tmpV.x, tmpV.y, tmpV.z); b.setXYZ(kb++, conf.x, conf.y + 0.02, conf.z); }
    a.needsUpdate = b.needsUpdate = true;
  }

  // ------------------------------------------------------------ KCU pod + camera arm
  const kcu = new THREE.Group(); // local: Y up (towards the canopy), Z downstream, X side
  const kBody = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.075, 0.04, 4, 0.014), mat.shell));
  const kBand = new THREE.Mesh(new RoundedBoxGeometry(0.052, 0.016, 0.042, 2, 0.006), mat.podAccent); kBand.position.y = -0.012;
  const kEyeTop = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0022, 8, 16), mat.alu); kEyeTop.position.y = 0.046;
  const kEyeBot = kEyeTop.clone(); kEyeBot.position.y = -0.046;
  const kLed = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), mat.led); kLed.position.set(0, 0.02, 0.021);
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.06, 8), mat.alu); pitot.rotation.x = Math.PI / 2; pitot.position.set(0, 0.025, -0.045);
  kcu.add(kBody, kBand, kEyeTop, kEyeBot, kLed, pitot);
  scene.add(kcu);
  const arm = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 10), mat.carbon));
  const camBody = new THREE.Group();
  const camBox = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.03, 0.034, 3, 0.008), mat.rubber));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.012, 24), mat.glass); lens.rotation.x = Math.PI / 2; lens.position.z = 0.021;
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0016, 8, 24), mat.alu); lensRing.position.z = 0.026;
  const recLed = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3 })); recLed.position.set(0.011, 0.012, 0.016);
  camBody.add(camBox, lens, lensRing, recLed); // local +Z = optical axis
  scene.add(arm, camBody);

  // ------------------------------------------------------------ dock pod on the pack top
  const pod = new THREE.Group(); // local: X = packX, Y = up, Z = back
  const housing = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.085, 0.12, 4, 0.024), mat.pod));
  const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.262, 0.01, 0.122, 2, 0.004), mat.podAccent); stripe.position.y = -0.02;
  const win = new THREE.Mesh(new RoundedBoxGeometry(0.004, 0.045, 0.07, 2, 0.002), mat.window); win.position.set(0.106, 0.004, 0.005);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 20), mat.drum); drum.rotation.x = Math.PI / 2; drum.position.set(0.088, 0.004, 0.005);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.014, 0.035, 32, 1, true), mat.rubber); funnel.position.y = 0.035;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.051, 0.0035, 8, 40), mat.ring); ring.rotation.x = Math.PI / 2; ring.position.y = 0.052;
  const lidL = new THREE.Group(), lidR = new THREE.Group();
  lidL.position.set(0.105, 0.043, 0); lidR.position.set(-0.105, 0.043, 0);
  const lidGeo = new RoundedBoxGeometry(0.105, 0.012, 0.118, 2, 0.005);
  const lidLm = shadow(new THREE.Mesh(lidGeo, mat.pod)); lidLm.position.x = -0.0525;
  const lidRm = shadow(new THREE.Mesh(lidGeo, mat.pod)); lidRm.position.x = 0.0525;
  lidL.add(lidLm); lidR.add(lidRm);
  const stowBundle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10), mat.canopy); stowBundle.scale.set(1, 0.6, 1.2); stowBundle.position.y = 0.02;
  // passive slender telescopic boom (round 4): free damped pivot on the rear of the lid, 6 tapered 3.0→2.5 mm carbon
  // sections with hi-vis bands, 2.5 mm tip ring (built in world space, see update)
  const boomG = new THREE.Group(); // origin = gimbal pivot; local +Y = boom axis
  const gimYaw = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.018, 28), mat.alu));
  const gimPitch = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.022, 28), mat.pod)); gimPitch.rotation.z = Math.PI / 2; gimPitch.position.y = 0.012;
  const gimCap = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0025, 8, 24), mat.podAccent); gimCap.rotation.y = Math.PI / 2; gimCap.position.y = 0.012;
  const sections = [];
  for (let k = 0; k < 6; k++) {
    const r0 = 0.0015 - 0.00005 * k, r1 = r0 - 0.00003; // true size (3.0 → 2.5 mm): nearly invisible beyond a few metres, as intended
    const sec = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1, 14), k % 2 ? mat.podAccent : mat.carbon));
    boomG.add(sec); sections.push(sec);
  }
  const tipG = new THREE.Group();
  // round 4: 2.5 mm OD ceramic tip ring only (the docking cone rides on the KCU)
  const trumpetRing = new THREE.Mesh(new THREE.TorusGeometry(0.00095, 0.0003, 6, 16), mat.ring); trumpetRing.rotation.x = Math.PI / 2; trumpetRing.position.y = 0.002;
  const sleeve = new THREE.Object3D();
  tipG.add(trumpetRing, sleeve);
  boomG.add(gimYaw, gimPitch, gimCap, tipG);
  const radar = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.022, 0.008, 2, 0.003), mat.rubber); radar.position.set(0, -0.005, 0.062);
  scene.add(boomG);
  pod.add(housing, stripe, win, drum, funnel, ring, lidL, lidR, stowBundle, radar);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 20), mat.podAccent);
  const buttonLed = new THREE.Mesh(new THREE.TorusGeometry(0.0145, 0.0018, 6, 20), mat.ring);
  scene.add(pod, button, buttonLed);

  // ------------------------------------------------------------ tether (0.5 mm hi-vis, drawn ≥1 px)
  const lineMat = new LineMaterial({ color: 0xffd21a, linewidth: 1.2, worldUnits: false });
  const line = new Line2(new LineGeometry(), lineMat); line.frustumCulled = false; scene.add(line);

  // ------------------------------------------------------------ scenario props
  const tree = new THREE.Group();
  const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 9, 12), mat.branch));
  const limb = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 1, 8), mat.branch));
  tree.add(trunk, limb);
  const cones = []; for (let k = 0; k < 6; k++) { const c = shadow(new THREE.Mesh(new THREE.ConeGeometry(1.6 - k * 0.22, 1.6, 10), mat.needles)); tree.add(c); cones.push(c); }
  tree.visible = false; scene.add(tree);
  const nb = new THREE.Group();
  const nbBody = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.6, 6, 12), mat.jacket)); nbBody.position.y = 1.2;
  const nbLegs = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.6, 6, 12), mat.pants)); nbLegs.position.y = 0.5;
  const nbHead = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat.shell)); nbHead.position.y = 1.72;
  const nbSki = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 1.6), mat.podAccent)); nbSki.position.y = 0.02;
  nb.add(nbBody, nbLegs, nbHead, nbSki); nb.visible = false; scene.add(nb);

  const all = [kiteG, kcu, arm, camBody, pod, boomG, button, buttonLed, line, tree, nb];
  let lastShape = '';

  return {
    hideInPip: [kcu, arm, camBody],
    setVisible(v) { for (const o of all) o.visible = v && (o !== tree || tree.userData.on) && (o !== nb || nb.userData.on); },
    update(d, ctx) {
      const cv = typeof document !== 'undefined' && document.getElementById('gl3d');
      if (cv) lineMat.resolution.set(cv.width || 1, cv.height || 1);
      const rig = ctx.skier;
      if (!rig.packC || !d.kite) return;
      const t = ctx.t || 0;
      // ---- dock pod on the pack lid
      const up = rig.packUp.clone().normalize(), back = rig.packBack.clone().normalize(), px = rig.packX.clone().normalize();
      const podC = rig.packC.clone().addScaledVector(up, 0.292).addScaledVector(back, 0.005);
      pod.position.copy(podC); pod.quaternion.copy(basisQuat(px, up, back));
      const lid = sstep(0, 1, d.lid ?? 0);
      lidL.rotation.z = 1.9 * lid; lidR.rotation.z = -1.9 * lid;
      drum.rotation.y = (d.L || 0) / 0.02;
      stowBundle.visible = !!d.docked;
      stowBundle.scale.set(1, 0.6, 1.2).multiplyScalar(0.4 + 0.6 * sstep(0.3, 1, d.stow ?? 0));
      const blink = Math.sin(t * 12) > 0 ? 1 : 0.25;
      const col = d.warn ? 0xffa020 : d.docked ? 0x3aa0ff : 0x2cff8a;
      mat.ring.emissive.setHex(col); mat.ring.emissiveIntensity = (d.warn ? blink : 1) * 2.6;
      mat.led.emissive.setHex(col);
      const sh = rig.shoulders && rig.shoulders.L ? rig.shoulders.L : rig.packC;
      button.position.copy(sh).addScaledVector(back, -0.11).addScaledVector(up, -0.16).addScaledVector(px, -0.06);
      button.quaternion.copy(basisQuat(px, back.clone().negate(), up));
      buttonLed.position.copy(button.position).addScaledVector(back, -0.004);
      buttonLed.quaternion.copy(basisQuat(px, up, back.clone().negate()));
      pod.updateMatrixWorld();
      // ---- boom: from the rendered gimbal pivot to the model's line exit (so the line always leaves the tip)
      const pivotW = podC.clone().addScaledVector(up, 0.05).addScaledVector(back, 0.045);
      let exitW, boomDir = back.clone(), boomLen = 0.26;
      if (d.boom) {
        const tipM = toV3(d.anchor);
        if (d.docked) { boomDir = px.clone().addScaledVector(up, 0.04).normalize(); boomLen = 0.24; } // collapsed, folded flat across the lid
        else {
          boomDir = tipM.clone().sub(pivotW); boomLen = Math.max(0.24, boomDir.length()); boomDir.normalize();
          if (d.mode === 6 && (d.boom.bx ?? 1) < 0.25) { const f = 1 - (d.boom.bx ?? 0) / 0.25; boomDir.lerp(px.clone().addScaledVector(up, 0.04).normalize(), f).normalize(); }
        }
        boomG.visible = true;
        boomG.position.copy(pivotW); boomG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), boomDir);
        const sl = Math.min(0.26, boomLen), step = (boomLen - sl) / 5;
        sections.forEach((sec, k) => { sec.scale.set(1, sl, 1); sec.position.y = 0.02 + k * step + sl / 2; });
        tipG.position.y = boomLen;
        sleeve.visible = !!d.seated && !d.docked;
        exitW = pivotW.clone().addScaledVector(boomDir, boomLen + 0.03);
      } else { boomG.visible = false; exitW = new THREE.Vector3(0, 0.05, 0).applyMatrix4(pod.matrixWorld); }

      // ---- kite position: model point, blended onto the rendered throat near the dock
      const A = toV3(d.anchor);
      const dA = exitW.clone().sub(A);
      const Kraw = toV3(d.kite);
      const near = 1 - sstep(0.4, 2.0, Kraw.distanceTo(A));
      const K = Kraw.clone().addScaledVector(dA, near);
      const docked = !!d.seated; // in the pod, or seated on the boom tip with the canopy in its sleeve (extend / stow)
      const seated = d.docked ? 1 : 0;
      // orientation frame: Y = tether direction (away from the pack), Z = downstream air
      let yU = toV3(d.er); if (yU.lengthSq() < 0.5) yU.copy(up); yU.normalize();
      if (near > 0) yU.lerp(up, near * 0.6).normalize();
      let zD = toV3(d.air); if (zD.lengthSq() < 1e-4) zD = back.clone();
      zD.addScaledVector(yU, -zD.dot(yU)); if (zD.lengthSq() < 1e-6) zD = back.clone().addScaledVector(yU, -back.dot(yU));
      zD.normalize();
      const xS = new THREE.Vector3().crossVectors(yU, zD).normalize();
      // roll about the downstream axis
      const roll = THREE.MathUtils.degToRad(d.psi || 0);
      // wing: roll the canopy about the downstream axis; round: the canopy yaws about the line (glide direction), axis stays on the line
      const round = d.canopy !== 'wing';
      const yR = round ? yU.clone() : yU.clone().multiplyScalar(Math.cos(roll)).addScaledVector(xS, Math.sin(roll)).normalize();
      const zR = round ? zD.clone().multiplyScalar(Math.cos(roll)).addScaledVector(xS, -Math.sin(roll)).normalize() : zD.clone();
      const xR = new THREE.Vector3().crossVectors(yR, zR).normalize();
      // ---- canopy shape
      shape.span = d.span || 0.71;
      shape.infl = docked ? 0 : Math.max(0, Math.min(1, (d.infl ?? 1) * (d.collapsed ? 0.4 : 1)));
      shape.flag = Math.max(0, Math.min(1, d.flag ?? 0));
      shape.reef = Math.max(0.2, Math.min(1, d.reef ?? 1));
      shape.tilt = 0.35 * Math.max(0, Math.min(1, (d.G ?? 0))) * (1 - shape.flag);
      shape.t = t;
      const key = `${shape.infl.toFixed(2)}|${shape.flag.toFixed(2)}|${shape.reef.toFixed(2)}|${shape.tilt.toFixed(2)}|${(shape.infl < 1 || shape.flag > 0) ? Math.floor(t * 20) : 0}`;
      if (key !== lastShape) { buildCanopy(); buildBridle(); lastShape = key; }
      const kiteVisible = !docked;
      kiteG.visible = kiteVisible;
      if (kiteVisible) {
        const grow = Math.min(1, (d.launch ?? 1) * 1.2) * (0.35 + 0.65 * shape.infl) * (d.mode === 5 ? Math.max(0.25, Math.min(1, (d.L || 0) / 0.6)) : 1);
        kiteG.scale.setScalar(grow);
        kiteG.quaternion.copy(basisQuat(xR, yR, zR));
        kiteG.position.copy(K).addScaledVector(yR, BR * grow);
      }
      // ---- KCU and camera
      kcu.quaternion.copy(basisQuat(xS, yU, zD));
      kcu.position.copy(K).addScaledVector(up, -0.055 * seated * sstep(0.2, 0.9, d.stow ?? 1));
      kcu.visible = !(d.docked && (d.lid ?? 0) < 0.05);
      kLed.visible = !docked || Math.sin(t * 3) > 0;
      const camOn = !docked && d.cam && near < 0.9;
      arm.visible = camBody.visible = !d.docked;
      let camP;
      if (d.cam) camP = toV3(d.cam).addScaledVector(dA, near); else camP = K.clone().addScaledVector(xS, -(d.camOff || 0.2));
      if (docked || near > 0.6) camP = K.clone().addScaledVector(px, 0.07).addScaledVector(up, 0.01);
      const armV = camP.clone().sub(K);
      arm.position.copy(K).addScaledVector(armV, 0.5); arm.scale.set(1, Math.max(0.01, armV.length()), 1);
      if (armV.lengthSq() > 1e-6) arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), armV.clone().normalize());
      const look = camOn && d.crop ? toV3(d.crop) : yU.clone().negate();
      camBody.position.copy(camP);
      camBody.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), look.clone().negate(), new THREE.Vector3(0, 1, 0)));
      recLed.visible = camOn && Math.sin(t * 6) > -0.3;

      // ---- tether polyline
      const showLine = !docked && !(d.cut) && (d.L || 0) > 0.02;
      line.visible = showLine;
      if (showLine) {
        const pts = [d.released ? toV3(d.snag || d.anchor) : exitW.clone()];
        if (d.snag) pts.push(toV3(d.snag));
        pts.push(K.clone().addScaledVector(yU, -0.045));
        const arr = []; for (const p of pts) arr.push(p.x, p.y, p.z);
        const g = new LineGeometry(); g.setPositions(arr);
        line.geometry.dispose(); line.geometry = g;
        if (ctx.camera && cv) {
          const mid = pts[0].clone().lerp(pts[pts.length - 1], 0.3);
          const fpx = (cv.height / 2) / Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2);
          lineMat.linewidth = Math.min(2.5, Math.max(1, (0.0005 * fpx) / Math.max(0.3, ctx.camera.position.distanceTo(mid))));
        }
      }

      // ---- props
      tree.userData.on = !!d.branch; tree.visible = !!d.branch;
      if (d.branch) {
        const b = d.branch;
        const baseV = toV3([b.x, b.yc + b.half + 0.4, -b.x * ctx.tanS]);
        trunk.position.copy(baseV).add(new THREE.Vector3(0, 4.5, 0));
        const a = toV3([b.x, b.yc - b.half, b.z]), c = toV3([b.x, b.yc + b.half + 0.4, b.z]);
        limb.position.copy(a).lerp(c, 0.5); limb.scale.set(1, a.distanceTo(c), 1);
        limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
        cones.forEach((cn, k) => { cn.position.copy(baseV).add(new THREE.Vector3(0, 4.2 + k * 0.85, 0)); });
      }
      nb.userData.on = !!d.neighbour; nb.visible = !!d.neighbour;
      if (d.neighbour) { nb.position.copy(toV3(d.neighbour)); nb.rotation.set(0, 0, 0); nbSki.rotation.y = Math.PI / 2; }
    },
  };
}

// ------------------------------------------------------------ director
// st3 (three.js): { pos, fwd, left, chest, hands }; frame = model-space FrameState
export function shots(t, st3, { frame, mode }) {
  const d = frame && frame.device;
  if (!d || !d.kite) return null;
  const UP = new THREE.Vector3(0, 1, 0);
  const P = st3.pos.clone();
  let F = toV3([d.course[0], d.course[1], 0]); if (F.lengthSq() < 0.5) F = st3.fwd.clone(); F.y = 0; F.normalize();
  const Lf = new THREE.Vector3().crossVectors(UP, F).normalize();
  const at = (f, l, u, o = P) => o.clone().addScaledVector(F, f).addScaledVector(Lf, l).addScaledVector(UP, u);
  const K = toV3(d.kite), A = toV3(d.anchor);
  const mid = A.clone().lerp(K, 0.5);
  const k01 = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const ease = (x) => x * x * (3 - 2 * x);
  const chest = P.clone().addScaledVector(UP, 1.1);
  if (mode !== 'demo') {
    const i = Math.floor(t / 7) % 3, k = ease((t % 7) / 7);
    if (i === 0) return { pos: at(-12 - 2 * k, 7, 6), target: mid.clone().lerp(chest, 0.4).addScaledVector(Lf, -1.2), fov: 46, shot: 'k2-rear3q' };
    if (i === 1) return { pos: at(-2, -13, 3.5), target: mid.clone().lerp(chest, 0.5), fov: 44, shot: 'k2-side' };
    // over the kite: behind and above the canopy, looking down the line at the rider (what the product sees, wider)
    const away = K.clone().sub(A).normalize();
    return { pos: K.clone().addScaledVector(away, 3.2).addScaledVector(UP, 0.7).addScaledVector(Lf, -1.9), target: chest.clone().lerp(K, 0.42), fov: 52, shot: 'k2-over-kite' };
  }
  let s;
  if (t < 5) { const k = ease(k01(0, 5)); s = { pos: at(-1.9 + 0.3 * k, -1.2, 2.05 - 0.1 * k), target: A.clone().addScaledVector(UP, -0.12), fov: 36, shot: 'carry', dofOn: true }; }
  else if (t < 8) { const k = ease(k01(5, 8)); s = { pos: at(0.6 - 1.2 * k, 3.6 + 2.4 * k, 1.7 + 1.3 * k), target: A.clone().lerp(K, 0.4), fov: 48, shot: 'launch-close' }; }
  else if (t < 12) { const k = ease(k01(8, 12)); s = { pos: at(-2 - 2 * k, 11 + 2 * k, 3.5 + 1.5 * k), target: A.clone().lerp(K, 0.5), fov: 50, shot: 'launch-wide' }; }
  else if (t < 17) { const k = ease(k01(12, 17)); s = { pos: at(-13 + 1 * k, 5 - 9 * k, 6.5), target: mid.clone().lerp(chest, 0.45), fov: 44, shot: 'follow-rear3q' }; }
  else if (t < 21) {
    const away = K.clone().sub(A).normalize();
    // behind and above the kite, offset to the LEFT so the canopy sits in the upper-left of the frame (clear of the inset)
    s = { pos: K.clone().addScaledVector(away, 3.2).addScaledVector(UP, 0.7).addScaledVector(Lf, -1.9), target: chest.clone().lerp(K, 0.42), fov: 52, shot: 'over-kite' };
  } else if (t < 24) { const k = ease(k01(21, 24)); s = { pos: at(3 - 2 * k, -7.5, 1.4), target: chest.clone().lerp(K, 0.35), fov: 50, shot: 'track-low' }; }
  else if (t < 31) { const k = ease(k01(24, 31)); s = { pos: at(-3 - 2 * k, -15, 4.5), target: mid.clone().lerp(chest, 0.55), fov: 44, shot: 'gust-side' }; }
  else if (t < 37) { const k = ease(k01(31, 37)); s = { pos: at(10 - 2 * k, 3 - 6 * k, 1.8), target: chest.clone().lerp(K, 0.45), fov: 46, shot: 'front-swap', dofOn: false }; }
  else if (t < 38.5) { const k = ease(k01(37, 38.5)); s = { pos: at(-12 + k, -6, 6), target: mid.clone().lerp(chest, 0.45), fov: 42, shot: 'rear-right' }; }
  else if (t < 41) { const k = ease(k01(38.5, 41)); s = { pos: at(-7.5 + 4.0 * k, 9.5 - 3.5 * k, 6.5 - 3.0 * k), target: chest.clone().lerp(K, 0.65 - 0.4 * k), fov: 58, shot: 'retrieve' }; }
  else { const k = ease(k01(41, 52)), kt = ease(k01(42.2, 44)); const pc = P.clone().addScaledVector(UP, 1.55); s = { pos: pc.clone().addScaledVector(F, -2.6 + 0.7 * k).addScaledVector(Lf, 1.4 - 0.3 * k).addScaledVector(UP, 1.1 - 0.4 * k), target: A.clone().lerp(pc.clone().addScaledVector(F, -0.3), kt), fov: 40, shot: 'stow', dofOn: true }; }
  if (s.dofOn) s.dof = { focus: s.pos.distanceTo(s.target), aperture: 0.0012 };
  return s;
}
