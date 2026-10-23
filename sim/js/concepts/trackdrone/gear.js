// S2 trackdrone gear (browser): ducted ≤249 g quad with prop blades / motion-
// blur discs, 3-axis gimbal 4K camera, navigation + status LEDs, a heated dock
// pod on top of the backpack with a hinged lid (which doubles as a prop shield
// behind the helmet), the UWB/RTK beacon puck with button on the left shoulder
// strap, an optional Dyneema leash, and scenario props (trees with branch
// envelopes, a crossing skier). Geometry is an illustration, not CAD.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

let THREE_ = null;
const V = (p) => new THREE_.Vector3(p[0], p[2], -p[1]);
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createGear(scene, THREE) {
  THREE_ = THREE;
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    shell: M({ color: 0x24292f, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
    carbon: M({ color: 0x15171b, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
    white: M({ color: 0xe8eaed, roughness: 0.4, clearcoat: 0.6 }),
    accent: M({ color: 0xff6a1a, roughness: 0.45, clearcoat: 0.5 }),
    alu: M({ color: 0xa7afb8, metalness: 1, roughness: 0.28 }),
    rubber: M({ color: 0x141518, roughness: 0.9 }),
    blade: M({ color: 0x1a1c20, roughness: 0.5 }),
    glass: M({ color: 0x07090c, roughness: 0.02, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.8, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600], envMapIntensity: 2.2 }),
    gold: M({ color: 0xd8b25a, metalness: 1, roughness: 0.25 }),
    pod: M({ color: 0x2f3a46, roughness: 0.55, clearcoat: 0.3, sheen: 0.3, sheenColor: 0x93a4b8 }),
    podIn: M({ color: 0x1a1f25, roughness: 0.85 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.95 }),
    needles: new THREE.MeshStandardMaterial({ color: 0x2c4a37, roughness: 0.9 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.75 }),
    jacket2: M({ color: 0x2a6fd6, roughness: 0.6, sheen: 0.6, sheenColor: 0x9fc4ff }),
    pants2: M({ color: 0x2b2f36, roughness: 0.8 }),
    helmet2: M({ color: 0x15171a, roughness: 0.3, clearcoat: 1 }),
    leash: new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.6 }),
  };
  const led = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 3, roughness: 0.3 });
  const mesh = (geo, m, parent) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const root = new THREE.Group(); scene.add(root);

  // ---------------------------------------------------------------- drone (local: +X forward, +Y up, +Z right)
  const drone = new THREE.Group(); root.add(drone);
  const v1Only = [], v2Only = [];
  v1Only.push(mesh(new RoundedBoxGeometry(0.118, 0.036, 0.074, 4, 0.014), mat.shell, drone));
  const top = mesh(new RoundedBoxGeometry(0.086, 0.012, 0.052, 3, 0.005), mat.white, drone); top.position.y = 0.021;
  const stripe = mesh(new THREE.BoxGeometry(0.06, 0.002, 0.008), mat.accent, drone); stripe.position.set(0.004, 0.0275, 0);
  v1Only.push(top, stripe);
  // v2 fairing: two-tone teardrop shell, faired duct lips and wing-like arm fairings (illustrative shapes)
  const sph = new THREE.SphereGeometry(1, 36, 20);
  const shellUp = mesh(sph, mat.white, drone); shellUp.scale.set(0.078, 0.026, 0.046); shellUp.position.set(0.004, 0.006, 0);
  const shellLo = mesh(sph, mat.shell, drone); shellLo.scale.set(0.074, 0.02, 0.043); shellLo.position.set(0.002, -0.008, 0);
  const canopy = mesh(sph, mat.glass, drone); canopy.scale.set(0.022, 0.008, 0.02); canopy.position.set(0.045, 0.012, 0);
  const v2stripe = mesh(new THREE.BoxGeometry(0.07, 0.002, 0.006), mat.accent, drone); v2stripe.position.set(-0.004, 0.032, 0);
  v2Only.push(shellUp, shellLo, canopy, v2stripe);
  const batt = mesh(new RoundedBoxGeometry(0.07, 0.014, 0.05, 3, 0.005), mat.carbon, drone); batt.position.set(-0.012, -0.024, 0);
  const ant = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 8), mat.carbon, drone); ant.position.set(-0.05, 0.035, 0);
  const statusMat = led(0x31c6ff);
  const status = mesh(new THREE.TorusGeometry(0.016, 0.0028, 8, 28), statusMat, drone); status.rotation.x = Math.PI / 2; status.position.set(-0.02, 0.0285, 0);
  const ductProf = [[0.0405, -0.016], [0.046, -0.0155], [0.0485, -0.004], [0.0478, 0.01], [0.0452, 0.0165], [0.0418, 0.0155], [0.0402, 0.008], [0.0405, -0.016]].map(([r, y]) => new THREE.Vector2(r, y));
  const ductGeo = new THREE.LatheGeometry(ductProf, 40);
  const props = [], discs = [];
  const discTex = canvasTex(THREE, 256, 256, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, w * 0.06, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(40,42,46,0.0)'); grd.addColorStop(0.25, 'rgba(40,42,46,0.55)'); grd.addColorStop(0.85, 'rgba(30,32,36,0.8)'); grd.addColorStop(0.97, 'rgba(200,205,210,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2;
    for (let k = 0; k < 18; k++) { g.beginPath(); g.arc(w / 2, w / 2, w * (0.14 + 0.019 * k), k, k + 1.4); g.stroke(); }
  });
  const discMat = new THREE.MeshBasicMaterial({ map: discTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const navF = led(0xf6f8ff), navR = led(0xff2a2a);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = new THREE.Vector3(0.076 * sx, 0, 0.076 * sz);
    const duct = mesh(ductGeo, mat.shell, drone); duct.position.copy(c);
    const ring = mesh(new THREE.TorusGeometry(0.046, 0.0016, 6, 40), mat.accent, drone); ring.rotation.x = Math.PI / 2; ring.position.copy(c).add(new THREE.Vector3(0, 0.0168, 0));
    const arm = mesh(new THREE.BoxGeometry(0.06, 0.009, 0.014), mat.carbon, drone);
    arm.position.copy(c).multiplyScalar(0.5); arm.rotation.y = -Math.atan2(sz, sx);
    v1Only.push(arm);
    const lip = mesh(new THREE.TorusGeometry(0.0455, 0.0045, 10, 40), mat.white, drone); lip.rotation.x = Math.PI / 2; lip.position.copy(c).add(new THREE.Vector3(0, 0.0155, 0));
    const wing = mesh(sph, mat.white, drone); wing.scale.set(0.034, 0.0065, 0.013); wing.position.copy(c).multiplyScalar(0.55); wing.rotation.y = -Math.atan2(sz, sx);
    v2Only.push(lip, wing);
    const hub = mesh(new THREE.CylinderGeometry(0.0115, 0.0125, 0.014, 20), mat.alu, drone); hub.position.copy(c).add(new THREE.Vector3(0, -0.002, 0));
    for (let k = 0; k < 3; k++) { const st = mesh(new THREE.BoxGeometry(0.029, 0.004, 0.003), mat.carbon, drone); const a = (k * Math.PI * 2) / 3 + 0.3; st.position.copy(c).add(new THREE.Vector3(Math.cos(a) * 0.026, -0.008, Math.sin(a) * 0.026)); st.rotation.y = -a; }
    const pr = new THREE.Group(); pr.position.copy(c).add(new THREE.Vector3(0, 0.007, 0)); drone.add(pr);
    for (const s of [1, -1]) { const b = mesh(new THREE.BoxGeometry(0.036, 0.0014, 0.0105), mat.blade, pr); b.position.x = 0.019 * s; b.rotation.x = 0.28 * s; }
    props.push(pr);
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.0395, 40), discMat); d.rotation.x = -Math.PI / 2; d.position.copy(c).add(new THREE.Vector3(0, 0.0072, 0)); drone.add(d); discs.push(d);
    const pad = mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.006, 10), mat.rubber, drone); pad.position.copy(c).add(new THREE.Vector3(0.03 * sx, -0.019, 0.03 * sz).multiplyScalar(1));
    const nl = mesh(new THREE.SphereGeometry(0.0035, 10, 8), sx > 0 ? navF : navR, drone); nl.position.copy(c).add(new THREE.Vector3(0.044 * sx * 0.7, 0.0, 0.044 * sz * 0.7));
  }
  // gimbal: aluminium yoke under the nose, camera head oriented in world space
  const yoke = mesh(new RoundedBoxGeometry(0.02, 0.012, 0.03, 2, 0.004), mat.alu, drone); yoke.position.set(0.05, -0.022, 0);
  const camHead = new THREE.Group(); root.add(camHead);
  mesh(new RoundedBoxGeometry(0.03, 0.027, 0.032, 3, 0.008), mat.shell, camHead);
  const arc = mesh(new THREE.TorusGeometry(0.02, 0.0025, 6, 20, Math.PI), mat.alu, camHead); arc.rotation.y = Math.PI / 2; arc.position.x = -0.004;
  const barrel = mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.01, 24), mat.carbon, camHead); barrel.rotation.z = Math.PI / 2; barrel.position.x = 0.018;
  const lens = mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.002, 24), mat.glass, camHead); lens.rotation.z = Math.PI / 2; lens.position.x = 0.0235;
  const recMat = led(0xff2a2a);
  const rec = mesh(new THREE.SphereGeometry(0.0022, 8, 6), recMat, camHead); rec.position.set(0.012, 0.012, 0.01);

  // ---------------------------------------------------------------- pod on the backpack (local: +X packX, +Y packUp, +Z forward)
  const pod = new THREE.Group(); root.add(pod);
  const swapBatt = new THREE.Group(); root.add(swapBatt);
  mesh(new RoundedBoxGeometry(0.075, 0.026, 0.05, 2, 0.007), mat.carbon, swapBatt);
  const sbl = mesh(new THREE.BoxGeometry(0.03, 0.0025, 0.03), mat.accent, swapBatt); sbl.position.y = 0.0105;
  mesh(new RoundedBoxGeometry(0.3, 0.022, 0.3, 3, 0.01), mat.pod, pod).position.y = -0.03;
  for (const [x, z, w, d] of [[0.14, 0, 0.022, 0.3], [-0.14, 0, 0.022, 0.3], [0, 0.14, 0.3, 0.022], [0, -0.14, 0.3, 0.022]]) {
    const wall = mesh(new RoundedBoxGeometry(w, 0.05, d, 2, 0.008), mat.pod, pod); wall.position.set(x, -0.0, z);
  }
  const padTex = canvasTex(THREE, 256, 256, (g, w) => {
    g.fillStyle = '#16191e'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#ff6a1a'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w * 0.4, 0, Math.PI * 2); g.stroke();
    // optical fiducial (illustrative AprilTag-like pattern)
    const n = 6, s = w * 0.42 / n, o = w / 2 - (n * s) / 2;
    const bits = [0b111111, 0b100101, 0b110011, 0b101101, 0b100011, 0b111111];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (bits[i] >> j) & 1 ? '#f2f2f2' : '#050505'; g.fillRect(o + j * s, o + i * s, s, s); }
  });
  const padMat = new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.85, emissive: 0x000000 });
  const padM = mesh(new THREE.BoxGeometry(0.255, 0.004, 0.255), padMat, pod); padM.position.y = -0.017;
  for (const s of [1, -1]) { const pin = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 10), mat.gold, pod); pin.position.set(0.06 * s, -0.013, -0.08); }
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.026, 0.15); pod.add(lidPivot);
  const lid = mesh(new RoundedBoxGeometry(0.3, 0.016, 0.3, 3, 0.008), mat.pod, lidPivot); lid.position.set(0, 0.0, -0.15);
  const lidStripe = mesh(new THREE.BoxGeometry(0.22, 0.003, 0.02), mat.accent, lidPivot); lidStripe.position.set(0, 0.011, -0.24);
  const hinge = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 12), mat.alu, lidPivot); hinge.rotation.z = Math.PI / 2;
  const podLedMat = led(0x2a7fff);
  const podLed = mesh(new THREE.SphereGeometry(0.005, 10, 8), podLedMat, pod); podLed.position.set(0.12, 0.0, -0.152);

  // ---------------------------------------------------------------- beacon puck on the left shoulder strap
  const beacon = new THREE.Group(); root.add(beacon);
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.014, 28), mat.shell, beacon);
  const bRim = mesh(new THREE.TorusGeometry(0.025, 0.003, 8, 28), mat.accent, beacon); bRim.rotation.x = Math.PI / 2;
  const bBtn = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 20), mat.rubber, beacon); bBtn.position.y = 0.009;
  const bLedMat = led(0x37e08a);
  const bLed = mesh(new THREE.SphereGeometry(0.0028, 8, 6), bLedMat, beacon); bLed.position.set(0.017, 0.008, 0);

  // ---------------------------------------------------------------- leash
  const leash = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 1, 4), mat.leash); root.add(leash);

  // ---------------------------------------------------------------- trees (rebuilt when the list changes)
  const treeGroup = new THREE.Group(); root.add(treeGroup);
  let treesKey = null;
  function buildTrees(list, tanS) {
    while (treeGroup.children.length) { const c = treeGroup.children.pop(); c.geometry && c.geometry.dispose(); }
    for (const tr of list) {
      const base = V([tr.x, tr.y, -tr.x * tanS]);
      const trunk = mesh(new THREE.CylinderGeometry(tr.rT * 0.7, tr.rT, tr.H * 0.98, 10), mat.bark, treeGroup); trunk.position.copy(base).add(new THREE.Vector3(0, tr.H * 0.49, 0));
      const tiers = 5;
      for (let k = 0; k < tiers; k++) {
        const h0 = tr.h0 + ((tr.H - tr.h0) * k) / tiers, h1 = tr.h0 + ((tr.H - tr.h0) * (k + 1.6)) / tiers;
        const r0 = (tr.Rb * (tr.H - h0)) / (tr.H - tr.h0);
        const ht = Math.min(tr.H, h1) - h0;
        const cone = mesh(new THREE.ConeGeometry(r0, ht, 14, 1, true), mat.needles, treeGroup); cone.position.copy(base).add(new THREE.Vector3(0, h0 + ht / 2, 0));
        const cap = mesh(new THREE.ConeGeometry(r0 * 0.62, ht * 0.42, 14, 1, true), mat.snow, treeGroup); cap.position.copy(base).add(new THREE.Vector3(0, h0 + ht * 0.62, 0));
      }
      if (tr.branch) {
        const a = V(tr.branch.a), b = V(tr.branch.b), mid = a.clone().add(b).multiplyScalar(0.5), L = a.distanceTo(b);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        const limb = mesh(new THREE.CylinderGeometry(0.025, 0.05, L, 8), mat.bark, treeGroup); limb.position.copy(mid); limb.quaternion.copy(q);
        const fol = mesh(new THREE.SphereGeometry(1, 16, 10), mat.needles, treeGroup); fol.position.copy(mid.clone().lerp(b, 0.25)); fol.quaternion.copy(q); fol.scale.set(tr.branch.r, L * 0.42, tr.branch.r * 0.8);
        const fs = mesh(new THREE.SphereGeometry(1, 16, 10), mat.snow, treeGroup); fs.position.copy(fol.position).add(new THREE.Vector3(0, tr.branch.r * 0.45, 0)); fs.quaternion.copy(q); fs.scale.set(tr.branch.r * 0.8, L * 0.36, tr.branch.r * 0.5);
      }
    }
  }

  // ---------------------------------------------------------------- crossing skier (simple mannequin)
  const other = new THREE.Group(); root.add(other);
  const cap = (r, l, m) => mesh(new THREE.CapsuleGeometry(r, l, 6, 12), m, other);
  const oLegL = cap(0.07, 0.62, mat.pants2), oLegR = cap(0.07, 0.62, mat.pants2);
  const oTorso = cap(0.16, 0.36, mat.jacket2), oHead = mesh(new THREE.SphereGeometry(0.11, 18, 12), mat.helmet2, other);
  const oArmL = cap(0.05, 0.45, mat.jacket2), oArmR = cap(0.05, 0.45, mat.jacket2);
  const oSkiL = mesh(new THREE.BoxGeometry(1.7, 0.02, 0.09), mat.carbon, other), oSkiR = mesh(new THREE.BoxGeometry(1.7, 0.02, 0.09), mat.carbon, other);
  oLegL.position.set(-0.05, 0.42, 0.11); oLegR.position.set(0.05, 0.42, -0.11); oLegL.rotation.z = 0.25; oLegR.rotation.z = 0.25;
  oTorso.position.set(0.05, 1.05, 0); oTorso.rotation.z = -0.35; oHead.position.set(0.25, 1.52, 0);
  oArmL.position.set(0.25, 1.0, 0.24); oArmR.position.set(0.25, 1.0, -0.24); oArmL.rotation.z = 0.9; oArmR.rotation.z = 0.9;
  oSkiL.position.set(0, 0.01, 0.11); oSkiR.position.set(0, 0.01, -0.11);

  // ---------------------------------------------------------------- update
  const tmpM = new THREE.Matrix4(), qF = new THREE.Quaternion(), qD = new THREE.Quaternion();
  let propAng = 0;
  return {
    hideInPip: [drone, camHead, leash],
    setVisible(v) { root.visible = v; },
    update(d, ctx) {
      const sk = ctx.skier;
      if (!sk.packC || !sk.packUp) return;
      const t = ctx.t || 0;
      const v2 = (d.design || 1) >= 2;
      const sc = v2 ? Math.sqrt((d.mass || 0.15) / 0.245) : 1;
      for (const o of v1Only) o.visible = !v2;
      for (const o of v2Only) o.visible = v2;
      drone.scale.setScalar(sc); camHead.scale.setScalar(Math.max(0.85, sc)); pod.scale.setScalar(sc);
      // pod placement on top of the pack, cantilevered rearwards (sized to the airframe)
      const fwdT = sk.packBack.clone().negate();
      const podC = sk.packC.clone().addScaledVector(sk.packUp, 0.235 + 0.02 * sc).addScaledVector(sk.packBack, 0.03 + 0.08 * sc);
      tmpM.makeBasis(sk.packX, sk.packUp, fwdT); pod.quaternion.setFromRotationMatrix(tmpM); pod.position.copy(podC);
      lidPivot.rotation.x = 1.62 * ss(0, 1, d.lid ?? 0);
      const docking = d.mode === 'dock';
      padMat.emissive.setHex(docking ? 0x1f8a4a : 0x000000); padMat.emissiveIntensity = docking ? 0.35 + 0.25 * Math.sin(t * 8) : 0;
      podLedMat.emissive.setHex(d.mode === 'docked' ? 0x2a7fff : 0x37e08a); podLedMat.color.copy(podLedMat.emissive);
      // drone pose: physics position, blended onto the rendered pod seat while docking/launching
      const seat = podC.clone().addScaledVector(sk.packUp, 0.004 * sc);
      // battery swap (demo illustration): warm pack from the inner chest pocket into the drone in the pod
      const sw = d.swap ?? -1;
      swapBatt.visible = sw >= 0 && sw < 0.55;
      if (swapBatt.visible && sk.basis) {
        const b0 = sk.basis, chestBase = sk.packC.clone().addScaledVector(b0.spineUp, -0.26).addScaledVector(b0.torsoZ, 0.2);
        const from = chestBase.addScaledVector(b0.spineUp, 0.22).addScaledVector(b0.torsoZ, 0.15).addScaledVector(b0.torsoX, -0.08);
        const k = Math.min(1, sw * 2 / 1.1);
        swapBatt.position.copy(from).lerp(seat, k).addScaledVector(sk.packUp, 0.1 * Math.sin(Math.PI * k));
        swapBatt.quaternion.copy(pod.quaternion);
      }
      const pos = V(d.pos);
      const w = d.dockW || 0;
      if (w > 0 && d.podModel) pos.add(seat.clone().sub(V(d.podModel)).multiplyScalar(w));
      drone.position.copy(pos);
      const up = V(d.att || [0, 0, 1]).normalize();
      if (up.lengthSq() < 0.5) up.set(0, 1, 0);
      const fH = V([Math.cos(d.yaw || 0), Math.sin(d.yaw || 0), 0]);
      const x = fH.clone().addScaledVector(up, -fH.dot(up)).normalize(), z = new THREE.Vector3().crossVectors(x, up).normalize();
      tmpM.makeBasis(x, up, z); qF.setFromRotationMatrix(tmpM);
      const xd = sk.packBack.clone(), zd = new THREE.Vector3().crossVectors(xd, sk.packUp).normalize();
      tmpM.makeBasis(xd, sk.packUp, zd); qD.setFromRotationMatrix(tmpM);
      drone.quaternion.copy(qF).slerp(qD, ss(0.35, 1, w));
      drone.updateMatrixWorld();
      // props: blades when slow, blur discs when spinning
      const spin = d.spin || 0;
      propAng += spin * (ctx.dt || 0) * 2 * Math.PI * 23; // displayed rate (aliased on purpose)
      props.forEach((p, k) => { p.rotation.y = (k % 2 ? 1 : -1) * propAng + k; p.visible = spin < 0.85; });
      discMat.opacity = 0.75 * ss(0.15, 0.8, spin);
      for (const dd of discs) dd.visible = spin > 0.12;
      // LEDs
      const col = d.invalid ? 0xff2a2a : d.lost ? (Math.sin(t * 12) > 0 ? 0xffa400 : 0x221100) : (d.led ?? 0x31c6ff);
      statusMat.color.setHex(col); statusMat.emissive.setHex(col);
      const blink = Math.sin(t * 6.3) > 0.2 ? 3.5 : 0.3;
      navF.emissiveIntensity = spin > 0.2 ? 3 : 0.2; navR.emissiveIntensity = spin > 0.2 ? blink : 0.2;
      recMat.emissiveIntensity = d.mode !== 'docked' && spin > 0.5 ? (Math.sin(t * 3) > 0 ? 4 : 0.6) : 0.1;
      // gimbal camera head
      const cm = new THREE.Vector3(0.056, v2 ? -0.03 : -0.034, 0).applyMatrix4(drone.matrixWorld);
      camHead.position.copy(cm);
      const cf = V(d.cam || [1, 0, 0]).normalize();
      const cz = new THREE.Vector3().crossVectors(cf, new THREE.Vector3(0, 1, 0)); if (cz.lengthSq() < 1e-6) cz.set(0, 0, 1); cz.normalize();
      const cy = new THREE.Vector3().crossVectors(cz, cf).normalize();
      tmpM.makeBasis(cf, cy, cz);
      const qc = new THREE.Quaternion().setFromRotationMatrix(tmpM);
      camHead.quaternion.copy(w > 0.6 ? drone.quaternion : qc);
      // beacon on the left strap
      const b = sk.basis;
      if (sk.shoulders && b) {
        const chestBase = sk.packC.clone().addScaledVector(b.spineUp, -0.26).addScaledVector(b.torsoZ, 0.2);
        const bp = chestBase.addScaledVector(b.spineUp, 0.37).addScaledVector(b.torsoZ, 0.135).addScaledVector(b.torsoX, 0.1);
        beacon.position.copy(bp);
        const yAx = b.torsoZ.clone(), xAx = b.torsoX.clone(), zAx = new THREE.Vector3().crossVectors(xAx, yAx).normalize();
        tmpM.makeBasis(xAx, yAx, zAx); beacon.quaternion.setFromRotationMatrix(tmpM);
        bBtn.position.y = 0.009 - 0.004 * (d.btn > 0.3 ? 1 : 0);
        const bc = d.lost ? 0xffa400 : 0x37e08a; bLedMat.color.setHex(bc); bLedMat.emissive.setHex(bc);
        bLedMat.emissiveIntensity = Math.sin(t * 4) > 0.6 || d.btn > 0.2 ? 4 : 0.4;
      }
      // leash (optional): pod → drone
      leash.visible = !!d.leash && w < 0.9;
      if (leash.visible) { const a = seat, bb = drone.position; leash.position.copy(a).lerp(bb, 0.5); leash.scale.set(1, a.distanceTo(bb), 1); leash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bb.clone().sub(a).normalize()); }
      // trees
      const key = d.treesKey || '';
      if (key !== treesKey) { treesKey = key; buildTrees(d.trees || [], ctx.tanS || 0.268); }
      // crossing skier
      other.visible = !!d.other;
      if (d.other) {
        other.position.copy(V(d.other.pos));
        const hf = V(d.other.heading).normalize();
        const oz = new THREE.Vector3().crossVectors(hf, new THREE.Vector3(0, 1, 0)).normalize();
        tmpM.makeBasis(hf, new THREE.Vector3(0, 1, 0), oz); other.quaternion.setFromRotationMatrix(tmpM);
      }
    },
  };
}

// ---------------------------------------------------------------- director shot list
const cache = new WeakMap();
function anchors(result) {
  if (cache.has(result)) return cache.get(result);
  const fr = result.frame;
  const a = { stop: fr(Math.min(result.duration, 49)).skier.pos, side: 1 };
  const f31 = fr(Math.min(result.duration, 32.5));
  a.side = f31.device.pos[1] - f31.skier.pos[1] >= 0 ? 1 : -1;
  a.stopHead = fr(Math.min(result.duration, 49)).skier.heading;
  cache.set(result, a);
  return a;
}
export function shots(t, st3, { frame, mode, result, THREE }) {
  if (!frame || !frame.device) return null;
  const Vt = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
  const R = frame.skier.pos, D = frame.device.pos;
  const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
  const lerp = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  const out = (pos, tgt, fov, shot, focus) => ({ pos: Vt(pos), target: Vt(tgt), fov, shot, dof: focus ? { focus, aperture: 0.0012 } : undefined });
  const zt = (x) => -x * frame.tanS;
  if (mode !== 'demo') {
    const mid = lerp(R, D, 0.5);
    const span = Math.hypot(D[0] - R[0], D[1] - R[1], D[2] - R[2]);
    const k = 0.75 + span * 0.07;
    return out(add(mid, [-3.2 * k, -5 * k, 2.4 * k]), add(mid, [0, 0, 0.5]), 44, 'trackdrone-test');
  }
  const A = anchors(result);
  const pod = frame.device.podModel || add(R, [0, 0, 1.4]);
  if (t < 4.6) { const k = t / 4.6; return out(add(R, [0.2 - 1.6 * k, -2.0 + 0.4 * k, 1.75 + 0.35 * k]), add(R, [-0.12, 0.0, 1.32]), 36, 'carry-swap', 2.4); }
  if (t < 9.3) { const k = ss(4.6, 9.3, t); return out(add(R, [-3.2 - 1.4 * k, -2.4 - 0.6 * k, 1.9 + 0.9 * k]), add(lerp(pod, D, 0.5), [0, 0, -0.25]), 40 + 6 * k, 'launch'); }
  if (t < 17) { const dx = D[0] - R[0], dy = D[1] - R[1], dl = Math.hypot(dx, dy) || 1; return out(add(D, [(dx / dl) * 2.6, (dy / dl) * 2.6, 0.7]), lerp(D, add(R, [0, 0, 1.1]), 0.55), 46, 'leapfrog-over-drone'); }
  if (t < 23) return out(add(D, [-3.2, 2.2, 0.9]), add(D, [5, 0, -0.9]), 50, 'avoid-chase');
  if (t < 29) { const k = (t - 23) / 6; return out(add(R, [11 - 3 * k, 2.6, 0.9]), add(lerp(add(R, [0, 0, 1.4]), D, 0.35), [0, 0, 0]), 36, 'front'); }
  if (t < 37) return out(add(R, [-4, 10 * A.side, 4.2]), lerp(add(R, [0, 0, 1]), D, 0.3), 46, 'highlight');
  if (t < 41) return out(add(R, [7.5, 2.5, 1.3]), lerp(add(R, [0, 0, 1.3]), D, 0.3), 42, 'stop');
  if (t < 50.5) { const S = A.stop, k = (t - 41) / 9.5; const a = -2.6 + 0.6 * k; return out(add(S, [Math.cos(a) * 7.5, Math.sin(a) * 7.5, 6.5 - 1.2 * k]), add(S, [0, 0, 1.4]), 54, 'orbit-crane'); }
  const h = A.stopHead, back = [-h[0], -h[1], 0], left = [-h[1], h[0], 0], k = ss(55.5, 58, t);
  return out(add(pod, [back[0] * (1.9 + 2 * k) + left[0] * (0.55 + 1.2 * k), back[1] * (1.9 + 2 * k) + left[1] * (0.55 + 1.2 * k), 1.15 + 1.3 * k]), add(pod, [0, 0, 0.3 - 0.25 * k]), 36 + 8 * k, 'dock', 2.2);
}
