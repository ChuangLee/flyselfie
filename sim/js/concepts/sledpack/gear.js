// sledpack gear (browser only). I10 back stow (default): the open sled lies on the back (nose up, seats on the shoulder
// straps), the line leaves from a short rear eyelet tab on the hip belt behind the buttocks; I9 spine unit: (Ø60 mm sleeve from the shoulder blades to the sacrum + lumbar
// module on a harness, orange swivel funnel at the sacrum), the soft single-skin sled kite (two keel spars, bridle V to
// the apex, camera pod at the apex, drogue tail), the hi-vis main line and the thin depower line to the trailing edge.
// Illustrative design, not CAD. Lines are drawn ≥1 px for visibility; their true width in the product image is judged
// in analysis.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const toV3 = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const basisQuat = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

function sailTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ff5a14'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fbf7ee'; g.fillRect(84, 0, 88, 256);
  g.fillStyle = '#1b1f26'; g.fillRect(84, 0, 4, 256); g.fillRect(168, 0, 4, 256);
  g.strokeStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < 256; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createGear(scene) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    sail: M({ map: sailTexture(), roughness: 0.65, sheen: 0.6, sheenColor: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.97 }),
    carbon: M({ color: 0x15171b, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
    shell: M({ color: 0x2a3038, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    sleeve: M({ color: 0x1d2127, roughness: 0.35, clearcoat: 0.8 }),
    funnel: M({ color: 0xff6a1a, roughness: 0.45, side: THREE.DoubleSide }),
    webbing: M({ color: 0x23272d, roughness: 0.95 }),
    pod: M({ color: 0xf2f2ee, roughness: 0.35, clearcoat: 0.8 }),
    glass: M({ color: 0x07090d, roughness: 0.03, clearcoat: 1, iridescence: 0.5 }),
    drogue: M({ color: 0xff2fa0, roughness: 0.6, side: THREE.DoubleSide }),
    led: new THREE.MeshStandardMaterial({ color: 0x002210, emissive: 0x2cff8a, emissiveIntensity: 2.5 }),
  };
  const sh = (m) => { m.castShadow = true; return m; };
  // ---------------- spine unit (local: +Y up the spine, +Z away from the back, +X to the rider's left)
  const unit = new THREE.Group();
  const sleeve = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.030, 0.54, 6, 20), mat.sleeve)); sleeve.position.set(0, 0.33, 0.07);
  const module = sh(new THREE.Mesh(new RoundedBoxGeometry(0.20, 0.13, 0.055, 3, 0.02), mat.shell)); module.position.set(0, 0.10, 0.045);
  const funnel = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.06, 0.07, 28, 1, true), mat.funnel)); funnel.position.set(0, -0.02, 0.09); funnel.rotation.x = -0.6;
  const strapL = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 24, Math.PI), mat.webbing), strapR = strapL.clone();
  strapL.position.set(0.1, 0.55, -0.02); strapL.rotation.set(0, Math.PI / 2, 0); strapR.position.set(-0.1, 0.55, -0.02); strapR.rotation.set(0, Math.PI / 2, 0);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 8, 32), mat.webbing); belt.rotation.x = Math.PI / 2; belt.position.set(0, 0.06, -0.12); belt.scale.set(1, 0.8, 1);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 10), mat.led); led.position.set(0.11, 0.48, 0.0);
  const tab = sh(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.03, 0.14, 2, 0.01), mat.shell)); tab.position.set(0, -0.23, 0.10);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 8, 16), mat.funnel); eye.position.set(0, -0.23, 0.17);
  const seatL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 12), mat.funnel), seatR = seatL.clone();
  seatL.rotation.x = Math.PI / 2; seatR.rotation.x = Math.PI / 2; seatL.position.set(0.07, 0.62, 0.05); seatR.position.set(-0.07, 0.62, 0.05);
  unit.add(sleeve, module, funnel, strapL, strapR, belt, led, tab, eye, seatL, seatR);
  // ---------------- kite (local: +X nose, +Y sail normal toward the bridle side, +Z span)
  const kite = new THREE.Group();
  const sailGeo = new THREE.BufferGeometry();
  const NX = 6, NZ = 8, verts = new Float32Array((NX + 1) * (NZ + 1) * 3), uvs = new Float32Array((NX + 1) * (NZ + 1) * 2), idx = [];
  for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) { const k = i * (NZ + 1) + j; uvs[k * 2] = j / NZ; uvs[k * 2 + 1] = i / NX; }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { const a = i * (NZ + 1) + j, b = a + 1, c = a + NZ + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  sailGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3)); sailGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); sailGeo.setIndex(idx);
  const sail = sh(new THREE.Mesh(sailGeo, mat.sail));
  const sparL = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 6), mat.carbon)), sparR = sparL.clone();
  const pod = new THREE.Group();
  const podBody = sh(new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.032, 0.035, 2, 0.008), mat.pod));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.009, 20), mat.glass); lens.position.set(0.024, 0, 0); lens.rotation.y = Math.PI / 2;
  pod.add(podBody, lens);
  const drogue = sh(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 16, 1, true), mat.drogue));
  kite.add(sail, sparL, sparR, drogue);
  // ---------------- lines
  const mk = (color, w, op) => { const m = new LineMaterial({ color, linewidth: w, worldUnits: false, transparent: true, opacity: op }); const l = new Line2(new LineGeometry(), m); l.frustumCulled = false; return [l, m]; };
  const [mainLine, mainMat] = mk(0xff2fa0, 1.5, 0.95), [depLine, depMat] = mk(0xf5f5f5, 1.0, 0.8), [bridle, bridleMat] = mk(0x2a2a2a, 0.9, 0.85), [tailLine, tailMat] = mk(0xff2fa0, 0.8, 0.8);
  const all = [unit, kite, pod, mainLine, depLine, bridle, tailLine];
  for (const o of all) scene.add(o);
  const setL = (l, pts) => { const a = []; for (const p of pts) a.push(p.x, p.y, p.z); const g = new LineGeometry(); g.setPositions(a); l.geometry.dispose(); l.geometry = g; l.computeLineDistances(); };
  const buildSail = (span, chord, open, t) => {
    const p = sailGeo.attributes.position.array;
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
      const u = i / NX, v = j / NZ - 0.5; // u: tail→nose, v: −0.5…0.5 across
      const tipCut = Math.abs(v) > 0.25 ? 1 - 0.45 * (Math.abs(v) - 0.25) / 0.25 : 1;
      const x = (u - 0.5) * chord * (0.4 + 0.6 * tipCut) + (1 - tipCut) * 0.08 * chord;
      // keels at |v| = 0.22; centre panel billows toward −Y (away from the bridle), wings drape
      const billow = (Math.abs(v) < 0.22 ? -0.05 * Math.cos((v / 0.22) * Math.PI / 2) : 0.03 * (Math.abs(v) - 0.22)) * open * Math.sin(u * Math.PI);
      const flut = (1 - open) * 0.03 * Math.sin(t * 23 + u * 9 + v * 7);
      const k = (i * (NZ + 1) + j) * 3;
      p[k] = x; p[k + 1] = billow + flut; p[k + 2] = v * span * (0.25 + 0.75 * open);
    }
    sailGeo.attributes.position.needsUpdate = true; sailGeo.computeVertexNormals();
    for (const [m, sg] of [[sparL, 1], [sparR, -1]]) { m.scale.set(1, chord, 1); m.rotation.set(0, 0, Math.PI / 2); m.position.set(0, -0.02 * open, sg * 0.22 * span * (0.25 + 0.75 * open)); }
    drogue.position.set(-chord * 0.5 - 0.9, 0, 0); drogue.rotation.set(0, 0, Math.PI / 2);
  };
  return {
    hideInPip: [kite, pod, mainLine, depLine, bridle, tailLine],
    setVisible(v) { for (const o of all) o.visible = v; },
    update(d, ctx) {
      const cv = typeof document !== 'undefined' && document.getElementById('gl3d');
      for (const m of [mainMat, depMat, bridleMat, tailMat]) if (cv) m.resolution.set(cv.width || 1, cv.height || 1);
      const rig = ctx.skier;
      if (!rig || !rig.pelvisPos || !rig.basis || !d) return;
      const B = rig.basis, P0 = rig.pelvisPos.clone();
      const at = (f, l, u) => P0.clone().addScaledVector(B.f, f).addScaledVector(B.left, l).addScaledVector(B.up, u);
      // spine unit on the back: bottom (funnel) at the sacrum
      unit.position.copy(at(-0.13, 0, -0.12)); unit.quaternion.copy(basisQuat(B.left, B.up, B.f.clone().negate()));
      mat.led.emissive.setHex(d.warn ? 0xffa020 : d.inside ? 0x3aa0ff : 0x2cff8a);
      unit.updateMatrixWorld();
      const back = !!d.stow;
      sleeve.visible = funnel.visible = !back; tab.visible = eye.visible = seatL.visible = seatR.visible = back;
      const mouthR = back ? new THREE.Vector3(0, -0.23, 0.17).applyMatrix4(unit.matrixWorld) : new THREE.Vector3(0, -0.05, 0.11).applyMatrix4(unit.matrixWorld);
      const exitM = toV3(d.exit), dA = mouthR.clone().sub(exitM);
      const t = ctx.t ?? 0;
      if (back && d.inside && unit.visible) {
        // docked open on the back: nose up between the shoulder blades, sail facing backward, lines reeled in
        buildSail(d.span, d.chord, 1, t);
        const nose = B.up.clone(), nrm = B.f.clone(), sp = new THREE.Vector3().crossVectors(nose, nrm.clone().negate()).normalize();
        kite.position.copy(at(-0.21, 0, 0.30)); kite.quaternion.copy(basisQuat(nose, nrm, sp));
        kite.visible = pod.visible = true; mainLine.visible = depLine.visible = bridle.visible = tailLine.visible = false;
        pod.position.copy(mouthR).addScaledVector(B.up, 0.06); pod.quaternion.copy(basisQuat(B.f.clone().negate(), B.up, B.left));
        return;
      }
      const vis = unit.visible && !d.inside && !!d.kite;
      kite.visible = pod.visible = vis; mainLine.visible = depLine.visible = bridle.visible = tailLine.visible = vis && !d.cut;
      if (!vis) return;
      const apexM = toV3(d.kite), near = 1 - sstep(0.6, 2.5, apexM.distanceTo(exitM));
      const apex = apexM.clone().addScaledVector(dA, near);
      const c = toV3(d.lineDir).normalize(), nose = toV3(d.nose).normalize();
      nose.addScaledVector(c, -nose.dot(c)).normalize();
      const sp = new THREE.Vector3().crossVectors(nose, c).normalize();
      const open = d.collapsed ? 0.12 : 1;
      buildSail(d.span, d.chord, open, t);
      const centre = apex.clone().addScaledVector(c, d.bridle * (d.collapsed ? 0.7 : 1));
      kite.position.copy(centre); kite.quaternion.copy(basisQuat(nose, c.clone().negate(), sp));
      kite.updateMatrixWorld();
      // pod hangs at the apex, lens toward the rider
      pod.position.copy(apex).addScaledVector(new THREE.Vector3(0, -1, 0).addScaledVector(c, c.y).normalize(), 0.05);
      pod.lookAt(P0.clone().addScaledVector(B.up, 0.6)); pod.rotateY(-Math.PI / 2);
      // bridle V: apex → front of both keels; depower line → trailing edge centre; tail line → drogue
      const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(kite.matrixWorld);
      const kz = 0.22 * d.span * (0.25 + 0.75 * open);
      setL(bridle, [W(d.chord * 0.3, 0, kz), apex, W(d.chord * 0.3, 0, -kz)]);
      const te = W(-d.chord * 0.5, 0, 0);
      setL(tailLine, [te, W(-d.chord * 0.5 - 0.84, 0, 0)]);
      if (Array.isArray(d.line) && d.line.length > 1) {
        const pts = d.line.map((p) => toV3(p)), N = pts.length - 1, dB = apex.clone().sub(pts[N]);
        for (let j = 0; j <= N; j++) pts[j].addScaledVector(dA, 1 - j / N).addScaledVector(dB, j / N);
        pts[0].copy(mouthR); pts[N].copy(apex);
        setL(mainLine, pts);
        // depower line: parallel, offset 4 cm, ends at the trailing edge
        const off = sp.clone().multiplyScalar(0.04), dp = pts.map((p, j) => p.clone().addScaledVector(off, j / N));
        dp[N] = te; setL(depLine, dp);
      }
    },
  };
}

// ------------------------------------------------------------ director (concept-lab demo shots)
export function shots(t, st3, { frame, mode }) {
  const d = frame && frame.device;
  if (!d) return null;
  const UP = new THREE.Vector3(0, 1, 0);
  const P = st3.pos.clone();
  let F = st3.fwd.clone(); F.y = 0; if (F.lengthSq() < 1e-6) F.set(1, 0, 0); F.normalize();
  const Lf = new THREE.Vector3().crossVectors(UP, F).normalize();
  const at = (f, l, u, o = P) => o.clone().addScaledVector(F, f).addScaledVector(Lf, l).addScaledVector(UP, u);
  const G = d.kite ? toV3(d.kite) : at(-0.3, 0, 0.9), hip = P.clone().addScaledVector(UP, 0.9);
  const mid = hip.clone().lerp(G, 0.5);
  const k01 = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const ease = (x) => x * x * (3 - 2 * x);
  if (mode !== 'demo') {
    if (d.inside) return { pos: at(-3, 2.2, 1.6), target: at(-0.3, 0, 0.9), fov: 40, shot: 'at-back' };
    return { pos: mid.clone().addScaledVector(F, -7).addScaledVector(Lf, 6).addScaledVector(UP, 2), target: mid, fov: 50, shot: 'at-side' };
  }
  let s;
  if (t < 1.2) s = { pos: at(-1.9, 1.2, 1.4), target: at(-0.3, 0, 0.8), fov: 34, shot: 'docked', dofOn: true };
  else if (t < 2.5) { const k = ease(k01(1.2, 2.5)); s = { pos: at(-2.4 - k, 1.6 + k, 1.2), target: at(-0.4, 0, 0.7), fov: 38, shot: 'detect' }; }
  else if (t < 7) { const k = ease(k01(2.5, 7)); s = { pos: at(-3.5 - 4 * k, 2.6 + 3 * k, 1.0 + 2 * k), target: mid, fov: 46, shot: 'launch' }; }
  else if (t < 14) s = { pos: G.clone().addScaledVector(F, -2.2).addScaledVector(Lf, 1.1).addScaledVector(UP, 0.8), target: hip.clone().lerp(G, 0.2), fov: 48, shot: 'over-kite' };
  else if (t < 21) { const k = ease(k01(14, 21)); const a = 2.2 + 1.6 * k; s = { pos: mid.clone().addScaledVector(F, Math.cos(a) * 9).addScaledVector(Lf, Math.sin(a) * 9).addScaledVector(UP, 2.5), target: mid, fov: 50, shot: 'orbit' }; }
  else if (t < 29.5) s = { pos: G.clone().addScaledVector(F, 0.4).addScaledVector(Lf, -1.3).addScaledVector(UP, 0.3), target: G.clone().addScaledVector(F, 0.15), fov: 36, shot: 'kite-hero', dofOn: true };
  else if (t < 33) s = { pos: at(3, -8, 2.5), target: mid, fov: 54, shot: 'stop-side' };
  else { const k = ease(k01(33, 44)); s = { pos: at(-2.2 + 0.5 * k, 1.6 - 0.3 * k, 1.2), target: at(-0.35, 0, 0.6), fov: 42 - 4 * k, shot: 'dock', dofOn: true }; }
  if (s.dofOn) s.dof = { focus: s.pos.distanceTo(s.target), aperture: 0.0012 };
  return s;
}
