// activetether gear (browser only): lumbar back unit with the hinged "scorpion quiver" (dock, launch rail and line
// exit), the folding umbrella delta (or the larger delta-kite) with its airbrake flaps and the camera on a pan/tilt
// mount under the nose, the 0.36 mm hi-vis line (drawn ≥1 px for visibility; its true width in the product image is
// judged in analysis.js), and the optional camera pod on the line. Illustrative design, not CAD.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const toV3 = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const basisQuat = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

function sailTexture(accent) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = accent; g.fillRect(0, 0, 256, 18); g.fillRect(0, 110, 256, 18);
  g.strokeStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createGear(scene) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    sail: M({ map: sailTexture('#ff5a14'), roughness: 0.7, sheen: 0.5, sheenColor: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.96 }),
    carbon: M({ color: 0x15171b, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
    flap: M({ color: 0x2c333c, roughness: 0.5, side: THREE.DoubleSide }),
    pack: M({ color: 0x2b3038, roughness: 0.55, clearcoat: 0.4 }),
    quiver: M({ color: 0x1c1f24, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
    trumpet: M({ color: 0xff6a1a, roughness: 0.45, side: THREE.DoubleSide }),
    dark: M({ color: 0x0f1114, roughness: 0.35, metalness: 0.3 }),
    glass: M({ color: 0x07090d, roughness: 0.03, clearcoat: 1, iridescence: 0.5 }),
    webbing: M({ color: 0x23272d, roughness: 0.95 }),
    pod: M({ color: 0xffc23a, roughness: 0.4, clearcoat: 0.6 }),
    led: new THREE.MeshStandardMaterial({ color: 0x002210, emissive: 0x2cff8a, emissiveIntensity: 2.5 }),
  };
  const sh = (m) => { m.castShadow = true; return m; };
  // ---------------- back unit: hip belt + lumbar box + quiver (tube + orange trumpet) on a hinge
  const unit = new THREE.Group();
  const box = sh(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.16, 0.09, 3, 0.03), mat.pack));
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 32), mat.webbing); belt.scale.set(1, 0.75, 1);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 10), mat.led);
  unit.add(box, belt, led);
  const quiver = new THREE.Group();
  const tube = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.47, 24), mat.quiver)); tube.position.y = 0.235;
  const trumpet = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.08, 28, 1, true), mat.trumpet)); trumpet.position.y = 0.51;
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 16), mat.dark); hinge.rotation.z = Math.PI / 2;
  quiver.add(tube, trumpet, hinge);
  // ---------------- flyer (local: +X nose, +Y up, +Z right)
  const flyer = new THREE.Group();
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9 * 2), 3));
  sailGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array([0, 0, 1, 0.5, 0, 1, 0, 0, 1, 0.5, 0, 1]), 2));
  const sail = sh(new THREE.Mesh(sailGeo, mat.sail));
  const keel = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 8), mat.carbon)); keel.rotation.z = Math.PI / 2;
  const leL = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 8), mat.carbon)), leR = leL.clone();
  const flaps = [0, 1].map(() => sh(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat.flap)));
  const cam = new THREE.Group();
  const camBody = sh(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.024, 0.026, 2, 0.004), mat.dark));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.008, 20), mat.glass); lens.rotation.y = Math.PI / 2; lens.position.x = 0.016;
  cam.add(camBody, lens);
  const probe = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 16), mat.trumpet); probe.rotation.z = -Math.PI / 2;
  flyer.add(sail, keel, leL, leR, ...flaps, cam, probe);
  // ---------------- line + pod
  const lineMat = new LineMaterial({ color: 0xff2fa0, linewidth: 1.4, worldUnits: false, transparent: true, opacity: 0.95 });
  const line = new Line2(new LineGeometry(), lineMat); line.frustumCulled = false;
  const pod = sh(new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.05, 0.05, 2, 0.01), mat.pod));
  const all = [unit, quiver, flyer, line, pod];
  for (const o of all) scene.add(o);
  const setLine = (pts) => { const a = []; for (const p of pts) a.push(p.x, p.y, p.z); const g = new LineGeometry(); g.setPositions(a); line.geometry.dispose(); line.geometry = g; line.computeLineDistances(); };
  let built = { span: 0, chord: 0 };
  const buildSail = (span, chord, open) => {
    const s = (span / 2) * open, c = chord;
    const P = [0.06, 0, 0, -c, 0.0, s, -c * 0.85, 0, 0, 0.06, 0, 0, -c * 0.85, 0, 0, -c, 0.0, -s];
    sailGeo.attributes.position.array.set(P); sailGeo.attributes.position.needsUpdate = true; sailGeo.computeVertexNormals();
    keel.scale.set(1, c + 0.06, 1); keel.position.set(-c / 2 + 0.03, 0, 0);
    const le = Math.hypot(c, s);
    for (const [m, sg] of [[leL, 1], [leR, -1]]) { m.scale.set(1, le, 1); m.position.set(0.06 - c / 2, 0, (sg * s) / 2); m.rotation.set(0, 0, 0); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-c - 0.06, 0, sg * s).normalize()); }
    flaps.forEach((f, k) => { const sg = k ? -1 : 1; f.scale.set(c * 0.25, s * 0.45, 1); f.position.set(-c * 0.92, 0, (sg * s) * 0.45); });
    built = { span, chord, open };
  };
  return {
    hideInPip: [flyer, line, pod],
    setVisible(v) { for (const o of all) o.visible = v; },
    update(d, ctx) {
      const cv = typeof document !== 'undefined' && document.getElementById('gl3d');
      if (cv) lineMat.resolution.set(cv.width || 1, cv.height || 1);
      const rig = ctx.skier;
      if (!rig || !rig.pelvisPos || !rig.basis || !d.flyer) return;
      const B = rig.basis, P0 = rig.pelvisPos.clone();
      const at = (f, l, u) => P0.clone().addScaledVector(B.f, f).addScaledVector(B.left, l).addScaledVector(B.up, u);
      // back unit
      unit.position.copy(at(-0.16, 0, 0.05)); unit.quaternion.copy(basisQuat(B.left.clone().negate(), B.up, B.f.clone().negate()));
      led.position.set(0.08, 0.05, 0.05);
      mat.led.emissive.setHex(d.warn ? 0xffa020 : d.inside ? 0x3aa0ff : 0x2cff8a);
      // quiver: folded diagonally across the back (right hip → left shoulder blade) ↔ deployed rearward −10°
      const q = sstep(0, 1, d.quiver ?? 0);
      const pivot = at(-0.2, -0.05, 0.02);
      const stowDir = B.up.clone().multiplyScalar(0.82).addScaledVector(B.left, 0.57).addScaledVector(B.f, -0.05).normalize();
      const flyDir = B.f.clone().multiplyScalar(-0.985).addScaledVector(B.up, -0.17).normalize();
      const dir = stowDir.clone().lerp(flyDir, q).normalize();
      quiver.position.copy(pivot); quiver.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const mouthR = pivot.clone().addScaledVector(dir, 0.55);
      // model ↔ render offset at the exit
      const exitM = toV3(d.exit), dA = mouthR.clone().sub(exitM);
      // flyer
      const span = d.span, chord = d.chord;
      const nearL = d.L ?? 0;
      const open = d.inside ? 0 : sstep(0.3, 1.2, nearL) * 0.97 + 0.03;
      if (built.span !== span || Math.abs((built.open ?? 0) - open) > 0.01) buildSail(span, chord, open);
      let fpos = toV3(d.flyer), nose = toV3(d.nose).normalize(), up = toV3(d.up).normalize();
      const near = 1 - sstep(0.8, 3, fpos.distanceTo(exitM));
      fpos.addScaledVector(dA, near);
      if (d.inside) { fpos = mouthR.clone().addScaledVector(dir, -0.25); nose = dir.clone().negate(); up = B.up.clone(); }
      up.addScaledVector(nose, -up.dot(nose)); if (up.lengthSq() < 1e-6) up.set(0, 1, 0); up.normalize();
      const rz = new THREE.Vector3().crossVectors(nose, up).normalize();
      flyer.position.copy(fpos); flyer.quaternion.copy(basisQuat(nose, up, rz));
      flyer.visible = unit.visible && !d.inside;
      flaps.forEach((f, k) => { f.rotation.set(0, 0, 0); f.rotateZ(-1.2 * (d.brake || 0)); f.rotateX(Math.PI / 2); void k; });
      cam.visible = !!d.camOn; cam.position.set(-0.02, -0.1, 0);
      probe.position.set(0.09, 0, 0);
      flyer.updateMatrixWorld();
      // camera pointing (toward the rider)
      if (d.camOn) { cam.lookAt(P0); cam.rotateY(-Math.PI / 2); }
      // line
      const show = !d.inside && Array.isArray(d.line) && d.line.length > 1 && !d.cut;
      line.visible = show && unit.visible;
      if (show) {
        const pts = d.line.map((p) => toV3(p)), N = pts.length - 1;
        const probeW = new THREE.Vector3(0.11, 0, 0).applyMatrix4(flyer.matrixWorld), dB = probeW.clone().sub(pts[N]);
        for (let j = 0; j <= N; j++) pts[j].addScaledVector(dA, 1 - j / N).addScaledVector(dB, j / N);
        pts[0].copy(mouthR); pts[N].copy(probeW);
        setLine(pts);
      }
      pod.visible = !!d.pod && unit.visible && !d.inside;
      if (d.pod) { pod.position.copy(toV3(d.pod)).addScaledVector(dA, 1 - sstep(0.5, 3, toV3(d.pod).distanceTo(exitM))); }
    },
  };
}

// ------------------------------------------------------------ director
export function shots(t, st3, { frame, mode }) {
  const d = frame && frame.device;
  if (!d || !d.flyer) return null;
  const UP = new THREE.Vector3(0, 1, 0);
  const P = st3.pos.clone();
  let F = st3.fwd.clone(); F.y = 0; if (F.lengthSq() < 1e-6) F.set(1, 0, 0); F.normalize();
  const Lf = new THREE.Vector3().crossVectors(UP, F).normalize();
  const at = (f, l, u, o = P) => o.clone().addScaledVector(F, f).addScaledVector(Lf, l).addScaledVector(UP, u);
  const G = toV3(d.flyer), hip = P.clone().addScaledVector(UP, 0.9);
  const mid = hip.clone().lerp(G, 0.5);
  const k01 = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const ease = (x) => x * x * (3 - 2 * x);
  if (mode !== 'demo') {
    if (d.inside) return { pos: at(-3, 2.2, 1.6), target: at(-0.3, 0, 0.9), fov: 40, shot: 'at-back' };
    return { pos: mid.clone().addScaledVector(F, -7).addScaledVector(Lf, 6).addScaledVector(UP, 2), target: mid, fov: 50, shot: 'at-side' };
  }
  let s;
  if (t < 0.9) s = { pos: at(-2.2, 1.4, 1.5), target: at(-0.3, 0, 1.0), fov: 34, shot: 'stowed', dofOn: true };
  else if (t < 2.2) { const k = ease(k01(0.9, 2.2)); s = { pos: at(-2.6 - k, 1.8 + k, 1.3), target: at(-0.5, 0, 0.8), fov: 38, shot: 'deploy' }; }
  else if (t < 9) { const k = ease(k01(2.2, 9)); s = { pos: at(-4 - 5 * k, 3 + 3 * k, 1.5 + 2 * k), target: mid, fov: 46, shot: 'launch' }; }
  else if (t < 16) { s = { pos: G.clone().addScaledVector(F, -2.5).addScaledVector(Lf, 1.2).addScaledVector(UP, 1.0), target: hip.clone().lerp(G, 0.2), fov: 48, shot: 'over-flyer' }; }
  else if (t < 23) { const k = ease(k01(16, 23)); const a = 2.2 + 1.6 * k; s = { pos: mid.clone().addScaledVector(F, Math.cos(a) * 11).addScaledVector(Lf, Math.sin(a) * 11).addScaledVector(UP, 3), target: mid, fov: 50, shot: 'orbit' }; }
  else if (t < 30) { s = { pos: G.clone().addScaledVector(F, 0.5).addScaledVector(Lf, -1.6).addScaledVector(UP, 0.4), target: G.clone().addScaledVector(F, 0.2), fov: 36, shot: 'flyer-hero', dofOn: true }; }
  else if (t < 34) { s = { pos: at(3, -9, 3), target: mid, fov: 54, shot: 'stop-side' }; }
  else if (t < 41.7) { const k = ease(k01(34, 41.7)); s = { pos: at(-2 - 3 * (1 - k), 4, 1.8), target: hip.clone().lerp(G, 0.5), fov: 48, shot: 'tow-in' }; }
  else { const k = ease(k01(41.7, 52.6)); s = { pos: at(-2.4 + 0.6 * k, 1.8 - 0.4 * k, 1.5), target: at(-0.4, 0, 0.9), fov: 40 - 4 * k, shot: 'dock', dofOn: true }; }
  if (s.dofOn) s.dof = { focus: s.pos.distanceTo(s.target), aperture: 0.0012 };
  return s;
}
