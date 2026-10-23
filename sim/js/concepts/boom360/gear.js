// boom360 gear: padded hip belt + aluminium pack-frame stays, root damper/reel
// housing with pivot and elastomer rings, twin carbon tape-spring booms (V in the
// stitch plane, lenticular section) from the physics node positions, anodised tip
// node with status LED, and a twin-lens 360 camera with lenses facing left/right.
// Illustration geometry driven by the boom360 model state; not CAD.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

let LAST = null; // world-space anchor points of the last update (for the shot list)
const CAM_OFF = 0.07;
const K_ST = 36, RING = 14;

function carbonTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1c21'; g.fillRect(0, 0, 256, 256);
  const s = 16;
  for (let y = 0; y < 256; y += s) for (let x = 0; x < 256; x += s) {
    const odd = ((x + y) / s) % 2;
    const grd = odd ? g.createLinearGradient(x, y, x + s, y) : g.createLinearGradient(x, y, x, y + s);
    grd.addColorStop(0, '#15171b'); grd.addColorStop(0.5, odd ? '#2c3038' : '#262a31'); grd.addColorStop(1, '#15171b');
    g.fillStyle = grd; g.fillRect(x + 1, y + 1, s - 2, s - 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createGear(scene, THREE) {
  const root = new THREE.Group();
  scene.add(root);
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const carbonMap = carbonTexture(THREE);
  carbonMap.repeat.set(1, 18);
  const mat = {
    carbon: M({ color: 0xffffff, map: carbonMap, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0.1 }),
    anod: M({ color: 0x3a4250, metalness: 1, roughness: 0.32 }),
    anodOrange: M({ color: 0xe8661c, metalness: 0.8, roughness: 0.35 }),
    alu: M({ color: 0xb8c0ca, metalness: 1, roughness: 0.25 }),
    graphite: M({ color: 0x23272e, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    rubber: M({ color: 0x0f1012, roughness: 0.9 }),
    belt: M({ color: 0x2a323c, roughness: 0.85, sheen: 0.6, sheenColor: 0x8899aa }),
    mesh: M({ color: 0x1b2027, roughness: 0.95 }),
    camBody: M({ color: 0x141518, roughness: 0.55, clearcoat: 0.3 }),
    glass: M({ color: 0x0b1220, metalness: 0.2, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.7, iridescenceIOR: 1.6, envMapIntensity: 2 }),
    screen: M({ color: 0x0a0c10, roughness: 0.1, clearcoat: 1, emissive: 0x112233, emissiveIntensity: 0.6 }),
    buckle: M({ color: 0x15171a, roughness: 0.4, clearcoat: 0.5 }),
  };
  const add = (geo, m, parent = root) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };

  // hip belt: padded band with lumbar pad, buckle, remote button on the left wing
  const belt = add(new THREE.CylinderGeometry(0.168, 0.176, 0.085, 48, 1, true), mat.belt);
  belt.material = mat.belt.clone(); belt.material.side = THREE.DoubleSide;
  const lumbar = add(new RoundedBoxGeometry(0.2, 0.12, 0.05, 4, 0.02), mat.mesh);
  const buckle = add(new RoundedBoxGeometry(0.06, 0.04, 0.02, 3, 0.006), mat.buckle);
  const remote = add(new RoundedBoxGeometry(0.05, 0.035, 0.022, 3, 0.008), mat.graphite);
  const sideStrap = add(new THREE.BoxGeometry(0.035, 1, 0.006), mat.belt);
  const button = add(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 20), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 0.4, roughness: 0.4 }));
  // pack frame stays (anodised aluminium) from the lumbar pad to the root housing
  const stays = [0, 1].map(() => add(new THREE.CylinderGeometry(0.008, 0.008, 1, 12), mat.alu));
  const crossBar = add(new THREE.CylinderGeometry(0.009, 0.009, 1, 12), mat.alu);
  // root housing: twin reels + motor + elastomer damper + pivot
  const pivotG = new THREE.Group(); root.add(pivotG);
  const housing = add(new RoundedBoxGeometry(0.15, 0.11, 0.17, 5, 0.025), mat.graphite, pivotG);
  const reels = [-1, 1].map((sg) => { const r = add(new THREE.CylinderGeometry(0.048, 0.048, 0.022, 32), mat.anod, pivotG); r.userData.sg = sg; return r; });
  const reelCaps = [-1, 1].map(() => add(new THREE.CylinderGeometry(0.018, 0.018, 0.026, 20), mat.anodOrange, pivotG));
  const exitGuide = add(new RoundedBoxGeometry(0.05, 0.03, 0.17, 3, 0.01), mat.anod, pivotG);
  const axle = add(new THREE.CylinderGeometry(0.013, 0.013, 0.2, 20), mat.alu);
  const damperRings = [0, 1].map(() => add(new THREE.TorusGeometry(0.022, 0.009, 12, 28), mat.rubber));
  const mount = add(new RoundedBoxGeometry(0.17, 0.05, 0.05, 3, 0.012), mat.anod);
  // tapes (two lenticular carbon strips)
  const mkTape = () => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(K_ST * RING * 3), uv = new Float32Array(K_ST * RING * 2);
    const idx = [];
    for (let i = 0; i < K_ST - 1; i++) for (let j = 0; j < RING; j++) {
      const a = i * RING + j, b = i * RING + ((j + 1) % RING), c = (i + 1) * RING + j, d = (i + 1) * RING + ((j + 1) % RING);
      idx.push(a, c, b, b, c, d);
    }
    for (let i = 0; i < K_ST; i++) for (let j = 0; j < RING; j++) { uv[2 * (i * RING + j)] = j / RING; uv[2 * (i * RING + j) + 1] = i / (K_ST - 1); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const m = add(g, mat.carbon);
    m.frustumCulled = false;
    return m;
  };
  const tapes = [mkTape(), mkTape(), mkTape()];
  // v2 root stabiliser: pitch motor (axis = rider's left) and lateral motor on a yoke, status LED
  const motorMat = M({ color: 0x2b3240, metalness: 0.9, roughness: 0.35 });
  const motorP = add(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 32), motorMat);
  const motorPcap = add(new THREE.CylinderGeometry(0.022, 0.022, 0.034, 24), mat.anodOrange);
  const motorL = add(new THREE.CylinderGeometry(0.03, 0.03, 0.026, 32), motorMat);
  const motorLcap = add(new THREE.CylinderGeometry(0.019, 0.019, 0.03, 24), mat.anodOrange);
  const stabLedMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3aa0ff, emissiveIntensity: 0 });
  const stabLed = add(new THREE.SphereGeometry(0.006, 12, 8), stabLedMat);
  const lanyard = add(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6), mat.rubber);
  const v2Parts = [motorP, motorPcap, motorL, motorLcap, stabLed];
  // tip node + LED + 360 camera
  const tipNode = add(new RoundedBoxGeometry(0.03, 0.055, 0.07, 3, 0.008), mat.anodOrange);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x33ff66, emissiveIntensity: 0 });
  const led = add(new THREE.SphereGeometry(0.0055, 12, 8), ledMat);
  const cam = new THREE.Group(); root.add(cam);
  const camBody = add(new RoundedBoxGeometry(0.038, 0.124, 0.046, 5, 0.012), mat.camBody, cam);
  const lensParts = [];
  for (const sg of [1, -1]) {
    const dome = add(new THREE.SphereGeometry(0.0165, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass, cam);
    dome.rotation.z = -sg * Math.PI / 2; dome.position.set(sg * 0.019, 0.034, 0);
    const ring = add(new THREE.TorusGeometry(0.0175, 0.003, 10, 28), mat.alu, cam);
    ring.rotation.y = Math.PI / 2; ring.position.set(sg * 0.0195, 0.034, 0);
    lensParts.push(dome, ring);
  }
  const screen = add(new THREE.PlaneGeometry(0.03, 0.04), mat.screen, cam);
  screen.position.set(0, -0.012, 0.0235);
  const recMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 0 });
  const rec = add(new THREE.SphereGeometry(0.003, 8, 6), recMat, cam);
  rec.position.set(0, -0.045, 0.0235);
  const mountScrew = add(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 14), mat.alu, cam);
  mountScrew.position.set(0, -0.067, 0);

  const all = [];
  root.traverse((o) => { if (o.isMesh) all.push(o); });
  const V = () => new THREE.Vector3();
  const tmp = Array.from({ length: 12 }, V);
  const qFall = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  let skierRef = null;
  const place = (o, p, x, y, z) => { o.position.copy(p); m4.makeBasis(x, y, z); o.quaternion.setFromRotationMatrix(m4); };
  const seg = (o, a, b) => { o.position.copy(a).add(b).multiplyScalar(0.5); const d = tmp[11].copy(b).sub(a); o.scale.set(1, Math.max(1e-3, d.length()), 1); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); };
  const resetSkier = () => { if (skierRef) { skierRef.group.position.set(0, 0, 0); skierRef.group.quaternion.identity(); } };

  return {
    hideInPip: [...tapes, tipNode, led, cam, ...cam.children, lanyard],
    setVisible(v) { root.visible = v; if (!v) resetSkier(); },
    update(d, ctx) {
      const sk = ctx.skier;
      skierRef = sk;
      if (!sk.packC || !d.nodes) return;
      // scripted fall: rotate the whole rider rig about the feet (renderer has no fall pose)
      const beta = d.fallBeta || 0;
      const pivot = ctx.toV(d.feet || [0, 0, 0]);
      if (beta > 1e-4 && d.fallAxis) {
        qFall.setFromAxisAngle(ctx.toV(d.fallAxis).normalize(), beta);
        sk.group.quaternion.copy(qFall);
        sk.group.position.copy(pivot).sub(pivot.clone().applyQuaternion(qFall));
      } else { qFall.identity(); resetSkier(); }
      const P = (v) => v.clone().sub(pivot).applyQuaternion(qFall).add(pivot);
      const D = (v) => v.clone().applyQuaternion(qFall);
      const back = D(sk.packBack), up = D(sk.packUp), left = D(sk.packX);
      const fwd = back.clone().negate();
      const packC = P(sk.packC), pel = P(sk.pelvisPos);
      const rootW = packC.clone().addScaledVector(up, 0.17).addScaledVector(back, 0.06);
      const body = (x, y, z) => rootW.clone().addScaledVector(back, x).addScaledVector(left, y).addScaledVector(up, z);
      const N = d.nodes.length / 3;
      const pts = [];
      for (let k = 0; k < N; k++) pts.push(body(d.nodes[3 * k], d.nodes[3 * k + 1], d.nodes[3 * k + 2]));
      const bodyDir = (x, y, z) => back.clone().multiplyScalar(x).addScaledVector(left, y).addScaledVector(up, z).normalize();
      const cE1 = bodyDir(d.cam[0], d.cam[1], d.cam[2]), cE2 = bodyDir(d.cam[3], d.cam[4], d.cam[5]), cE3 = bodyDir(d.cam[6], d.cam[7], d.cam[8]);

      // belt and frame
      const beltC = pel.clone().addScaledVector(up, 0.03).addScaledVector(fwd, 0.01);
      place(belt, beltC, left, up, fwd.clone());
      belt.scale.set(1.06, 1, 0.8);
      place(lumbar, beltC.clone().addScaledVector(back, 0.145).addScaledVector(up, 0.02), left, up, back);
      place(buckle, beltC.clone().addScaledVector(fwd, 0.142), left, up, fwd);
      // remote on the left shoulder strap (glove-sized button, like an airbag trigger)
      const remP = pel.clone().addScaledVector(up, 0.32).addScaledVector(left, 0.1).addScaledVector(fwd, 0.14);
      const remN = fwd.clone().multiplyScalar(0.9).addScaledVector(left, 0.3).normalize();
      const remX = new THREE.Vector3().crossVectors(up, remN).normalize();
      place(remote, remP, remX, up, remN);
      place(button, remP.clone().addScaledVector(remN, 0.012), remX, remN, up.clone().negate());
      const strapA = remP.clone().addScaledVector(up, -0.02), strapB = pel.clone().addScaledVector(up, 0.08).addScaledVector(left, 0.12).addScaledVector(fwd, 0.1);
      seg(sideStrap, strapA, strapB);
      button.material.emissiveIntensity = d.state === 1 || d.state === 2 || d.state === 4 || d.state === 5 ? 2.5 : 0.4;
      const stayTop = rootW.clone().addScaledVector(up, -0.06).addScaledVector(fwd, 0.03);
      for (const [i, sg] of [[0, 1], [1, -1]]) {
        const a = beltC.clone().addScaledVector(back, 0.16).addScaledVector(left, sg * 0.07).addScaledVector(up, 0.03);
        const b = stayTop.clone().addScaledVector(left, sg * 0.07);
        seg(stays[i], a, b);
      }
      seg(crossBar, stayTop.clone().addScaledVector(left, 0.085), stayTop.clone().addScaledVector(left, -0.085));
      place(mount, stayTop.clone().addScaledVector(up, 0.03), left, up, back);
      place(axle, rootW, up, left, back.clone().negate());
      axle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), left);
      damperRings.forEach((r, i) => { r.position.copy(rootW).addScaledVector(left, (i ? -1 : 1) * 0.088); r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), left); });

      // housing follows the first boom segment (root pivot + fold)
      const t0 = pts[1].clone().sub(pts[0]).normalize();
      const n0 = new THREE.Vector3().crossVectors(left, t0).normalize(); // in-plane normal
      const l0 = new THREE.Vector3().crossVectors(t0, n0).normalize();
      pivotG.position.copy(rootW);
      m4.makeBasis(l0, n0, t0); pivotG.quaternion.setFromRotationMatrix(m4);
      housing.position.set(0, 0, -0.035);
      exitGuide.position.set(0, 0, 0.02);
      reels.forEach((r, i) => { r.position.set((i ? -1 : 1) * 0.085, 0, -0.045); r.rotation.set(0, 0, Math.PI / 2); });
      reelCaps.forEach((r, i) => { r.position.set((i ? -1 : 1) * 0.086, 0, -0.045); r.rotation.set(0, 0, Math.PI / 2); });
      exitGuide.scale.set(1, 1, 1);
      // v2 stabiliser motors at the root pivot (pitch motor on the left of the housing, lateral motor under it)
      for (const o of v2Parts) o.visible = !!d.v2;
      if (d.v2) {
        const side = rootW.clone().addScaledVector(left, 0.11);
        motorP.position.copy(side); motorP.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), left);
        motorPcap.position.copy(side).addScaledVector(left, 0.004); motorPcap.quaternion.copy(motorP.quaternion);
        motorPcap.rotateY(d.stab ? d.stab[0] * 6 : 0);
        const under = rootW.clone().addScaledVector(n0, -0.075).addScaledVector(t0, -0.02);
        motorL.position.copy(under); motorL.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n0);
        motorLcap.position.copy(under).addScaledVector(n0, -0.004); motorLcap.quaternion.copy(motorL.quaternion);
        stabLed.position.copy(rootW).addScaledVector(back, 0.075).addScaledVector(up, 0.05);
        stabLedMat.emissiveIntensity = d.stabOn ? 2.5 + 1.5 * Math.sin(ctx.t * 5) : 0;
      }

      // tapes: Catmull-Rom through the nodes, offset ± spread/2 in the stitch plane, tapering to the tip node
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const total = curve.getLength();
      const spread = d.spread ?? 0.12, half = spread / 2;
      const aW = 0.025, bW = (d.tapeD ?? 20) / 2000;
      const lat = new THREE.Vector3(), nrm = new THREE.Vector3();
      tapes[2].visible = (d.tapes ?? 2) >= 3;
      for (const [ti, sg] of [[0, 1], [1, -1], [2, 0]]) {
        if (ti === 2 && !tapes[2].visible) continue;
        const arr = tapes[ti].geometry.attributes.position.array;
        for (let i = 0; i < K_ST; i++) {
          const u = i / (K_ST - 1);
          const p = curve.getPointAt(u, tmp[0]);
          const tg = curve.getTangentAt(u, tmp[1]).normalize();
          lat.copy(left).addScaledVector(tg, -left.dot(tg)).normalize();
          nrm.crossVectors(lat, tg).normalize();
          // spread shrinks linearly to the tip; in the last 6 cm both tapes merge into the node
          const off = sg * half * Math.max(0, 1 - (u * total) / Math.max(0.05, total - 0.06)) + sg * 0.012 * (1 - u);
          const c = p.clone().addScaledVector(nrm, off);
          if (ti === 2) c.addScaledVector(lat, (d.latSpread || 0) * (1 - u));
          // flattened at the housing exit (tape coming off the reel), closed lenticular beyond
          const flat = 1 - Math.min(1, (u * total) / 0.05);
          for (let j = 0; j < RING; j++) {
            const th = (j / RING) * Math.PI * 2;
            const ca = Math.cos(th), sa = Math.sin(th);
            // lenticular: sharper edges than an ellipse
            const w = aW * (1 + 0.25 * flat) * Math.sign(ca) * Math.pow(Math.abs(ca), 0.8);
            const h = bW * (1 - 0.85 * flat) * Math.sign(sa) * Math.pow(Math.abs(sa), 1.4);
            const k = 3 * (i * RING + j);
            arr[k] = c.x + nrm.x * w + lat.x * h; arr[k + 1] = c.y + nrm.y * w + lat.y * h; arr[k + 2] = c.z + nrm.z * w + lat.z * h;
          }
        }
        tapes[ti].geometry.attributes.position.needsUpdate = true;
        tapes[ti].geometry.computeVertexNormals();
        tapes[ti].geometry.computeBoundingSphere();
      }
      // tip node, LED, camera (long axis along the tip tangent, lenses along ±e2 = across the stitch plane)
      const tip = pts[N - 1];
      place(tipNode, tip.clone().addScaledVector(cE1, 0.005), cE2, cE3, cE1);
      led.position.copy(tip).addScaledVector(cE3, 0.03).addScaledVector(cE1, 0.01);
      const blink = (Math.sin(ctx.t * 12) > 0 ? 1 : 0.15);
      const ledCol = d.led === 1 ? 0x33ff66 : d.led === 2 ? 0xffb020 : d.led === 3 ? 0xff3030 : 0x222222;
      ledMat.emissive.setHex(ledCol);
      ledMat.emissiveIntensity = d.led === 1 ? 4 : d.led === 2 || d.led === 3 ? 5 * blink : 0;
      const camC = tip.clone().addScaledVector(cE1, CAM_OFF - 0.01);
      place(cam, camC, cE2, cE1, cE3);
      // v2 magnetic breakaway: the camera hangs on its lanyard below the tip node
      lanyard.visible = !!d.camOff;
      if (d.camOff) {
        const hang = tip.clone().add(new THREE.Vector3(0, -0.45, 0)).addScaledVector(back, 0.15);
        cam.position.copy(hang).add(new THREE.Vector3(0, -0.07, 0));
        cam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0));
        seg(lanyard, tip, hang);
      }
      recMat.emissiveIntensity = d.recording ? 3 * (Math.sin(ctx.t * 4) > -0.3 ? 1 : 0.2) : 0;
      LAST = { tip: camC.clone(), root: rootW.clone(), up: up.clone(), back: back.clone(), left: left.clone(), fall: beta };
    },
  };
}

// ---------------------------------------------------------------- director
const ease = (x) => x * x * (3 - 2 * x);
export function shots(t, st3, { mode, THREE }) {
  const UP = new THREE.Vector3(0, 1, 0);
  const P = st3.pos, F = st3.fwd, L = st3.left;
  const at = (f, l, u, base = P) => base.clone().addScaledVector(F, f).addScaledVector(L, l).addScaledVector(UP, u);
  const tip = LAST ? LAST.tip : at(-1.3, 0, 2.3);
  const rootW = LAST ? LAST.root : at(-0.3, 0, 1.4);
  if (mode !== 'demo') {
    // test mode: alternate a rear-high chase (boom + camera + rider) and a side profile
    const k = Math.floor(t / 6) % 2;
    if (k === 0) return { pos: at(-5.2, 2.4, 3.0), target: at(0.5, 0, 1.3), fov: 38, shot: 'chase' };
    return { pos: at(-0.4, -6.5, 1.7), target: at(-0.6, 0, 1.6), fov: 30, dof: { focus: 6.5, aperture: 0.001 }, shot: 'side' };
  }
  const k = (a, b) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
  if (t < 5) return { pos: at(1.5 - 0.6 * k(0, 5), 5.2, 1.5), target: at(-0.2, 0, 1.25), fov: 30, dof: { focus: 5.3, aperture: 0.0012 }, shot: 'carry-side' };
  if (t < 7) return { pos: at(-2.4, 1.9, 1.6), target: rootW.clone().addScaledVector(UP, -0.25), fov: 32, dof: { focus: 3, aperture: 0.0015 }, shot: 'press' };
  if (t < 10.5) { const u = k(7, 10.5); return { pos: at(-3.2 - 0.8 * u, 3.0 + 0.6 * u, 2.0 + 0.5 * u), target: at(-0.9 * u - 0.3, 0, 1.5 + 0.5 * u), fov: 40, shot: 'deploy' }; }
  if (t < 16) return { pos: at(-5.6, 2.6, 3.2), target: at(0.8, 0, 1.3), fov: 40, shot: 'chase-high' };
  if (t < 20) return { pos: at(-0.3, -6.2, 1.8), target: at(-0.6, 0, 1.7), fov: 32, dof: { focus: 6.2, aperture: 0.001 }, shot: 'side-profile' };
  if (t < 24) {
    // over-the-camera: the 360 camera in the foreground, the rider beyond
    const b = LAST ? LAST.back : F.clone().negate();
    const pos = tip.clone().addScaledVector(b, 0.55).addScaledVector(L, 0.32).addScaledVector(UP, 0.18);
    return { pos, target: at(0.2, 0, 1.0), fov: 48, dof: { focus: 2.6, aperture: 0.0008 }, shot: 'over-camera' };
  }
  if (t < 30) return { pos: at(-1.0, 5.4, 0.7), target: at(-0.4, 0, 1.5), fov: 34, dof: { focus: 5.4, aperture: 0.001 }, shot: 'moguls-low' };
  if (t < 35) return { pos: at(0.8, 4.6, 1.6), target: at(-0.9, 0, 0.6), fov: 40, shot: 'fall-wide' };
  if (t < 41) return { pos: at(3.2, 2.3, 1.6), target: at(-0.5, 0, 1.4), fov: 36, dof: { focus: 4, aperture: 0.0012 }, shot: 'getup-front' };
  if (t < 49.5) { const a = 2.6 + k(41, 49.5) * 1.4; return { pos: P.clone().addScaledVector(F, Math.cos(a) * 6.5).addScaledVector(L, Math.sin(a) * 6.5).addScaledVector(UP, 2.6), target: at(-0.4, 0, 1.4), fov: 40, shot: 'orbit' }; }
  return { pos: at(-1.4, 3.4, 1.8), target: rootW.clone().addScaledVector(UP, 0.1), fov: 34, dof: { focus: 3.6, aperture: 0.0012 }, shot: 'stow' };
}
