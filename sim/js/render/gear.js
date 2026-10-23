// Airborne gear: ripstop delta kite (canopy with billow, carbon spars, keel,
// bridle), twin-lens 360° camera payload on a short suspension, Dyneema tether,
// and optional engineering overlays (state-coloured tether, airflow arrows,
// invalid-event marker). Kite planform is illustrative; L1 CAD not available.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

function ripstopTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  // panels
  const panels = ['#f2581f', '#f7f4ef', '#f2581f', '#1e2a38', '#f2581f', '#f7f4ef', '#f2581f'];
  panels.forEach((col, i) => { g.fillStyle = col; g.fillRect((i * 1024) / panels.length, 0, 1024 / panels.length + 1, 1024); });
  // seams
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
  for (let i = 1; i < panels.length; i++) { const x = (i * 1024) / panels.length; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1024); g.stroke(); }
  // ripstop grid
  g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1;
  for (let i = 0; i < 1024; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); }
  // reinforced trailing edge
  g.fillStyle = 'rgba(30,42,56,0.85)'; g.fillRect(0, 980, 1024, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Kite {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.canopyMat = new THREE.MeshPhysicalMaterial({ map: ripstopTexture(), side: THREE.DoubleSide, roughness: 0.55, sheen: 0.8, sheenRoughness: 0.4, sheenColor: 0xffffff, transmission: 0.0, thickness: 0.001 });
    this.sparMat = new THREE.MeshPhysicalMaterial({ color: 0x15171b, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
    this.lineMat = new THREE.MeshStandardMaterial({ color: 0xeae7dc, roughness: 0.6 });
    this.nu = 28; this.nv = 14;
    const g = new THREE.PlaneGeometry(1, 1, this.nu, this.nv);
    this.canopy = new THREE.Mesh(g, this.canopyMat);
    this.canopy.castShadow = true;
    this.group.add(this.canopy);
    const cyl = (r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), this.sparMat); m.castShadow = true; this.group.add(m); return m; };
    this.spars = { le1: cyl(0.0035), le2: cyl(0.0035), spine: cyl(0.004), spreader: cyl(0.003) };
    this.keel = new THREE.Mesh(new THREE.BufferGeometry(), this.canopyMat);
    this.keel.castShadow = true;
    this.group.add(this.keel);
    this.bridle = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 1, 4), this.lineMat); this.group.add(m); return m; });
    this.span = -1; this.fold = -1;
  }

  // local frame: +X span, +Y lift-up, +Z downstream (chord). Returns tow point (local).
  build(span, fold) {
    if (Math.abs(span - this.span) < 1e-4 && Math.abs(fold - this.fold) < 1e-3) return;
    this.span = span; this.fold = fold;
    const half = (span / 2) * fold;
    const chord = span * 0.62;
    const pos = this.canopy.geometry.attributes.position;
    const uv = this.canopy.geometry.attributes.uv;
    const P = (s, c) => {
      const le = Math.abs(s) * chord * 0.62; // swept leading edge
      const te = chord * (1.0 - 0.18 * Math.abs(s)) - 0.06 * chord * Math.pow(Math.abs(s), 3);
      const z = le + (te - le) * c;
      const billow = 0.055 * span * Math.sin(Math.PI * c) * (1 - s * s) * (0.4 + 0.6 * fold);
      const dihedral = Math.abs(s) * 0.07 * span * fold;
      return [s * half, billow + dihedral, z - chord * 0.35];
    };
    let k = 0;
    for (let j = 0; j <= this.nv; j++) {
      for (let i = 0; i <= this.nu; i++) {
        const s = (i / this.nu) * 2 - 1, c = j / this.nv;
        const [x, y, z] = P(s, c);
        pos.setXYZ(k, x, y, z);
        uv.setXY(k, i / this.nu, 1 - c);
        k++;
      }
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
    this.canopy.geometry.computeVertexNormals();
    this.canopy.geometry.computeBoundingSphere();
    const nose = new THREE.Vector3(...P(0, 0)), tipL = new THREE.Vector3(...P(-1, 0)), tipR = new THREE.Vector3(...P(1, 0)), tail = new THREE.Vector3(...P(0, 1));
    const setSeg = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(1, a.distanceTo(b), 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); };
    setSeg(this.spars.le1, nose, tipL); setSeg(this.spars.le2, nose, tipR); setSeg(this.spars.spine, nose, tail);
    const mL = new THREE.Vector3(...P(-0.55, 0.12)), mR = new THREE.Vector3(...P(0.55, 0.12));
    setSeg(this.spars.spreader, mL.add(new THREE.Vector3(0, 0.004, 0)), mR.add(new THREE.Vector3(0, 0.004, 0)));
    // keel: triangle under the spine, tow point at its apex
    const tow = new THREE.Vector3(0, -0.16 * span, nose.z + chord * 0.3);
    const kg = new THREE.BufferGeometry();
    const a = nose.clone().add(new THREE.Vector3(0, 0, chord * 0.08)), b = tail.clone().add(new THREE.Vector3(0, 0, -chord * 0.15));
    kg.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, tow.x, tow.y, tow.z], 3));
    kg.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0.95, 0.5, 0.05, 0.45, 0.5], 2));
    kg.computeVertexNormals();
    this.keel.geometry.dispose();
    this.keel.geometry = kg;
    setSeg(this.bridle[0], tow, nose.clone().add(new THREE.Vector3(0, 0, chord * 0.06)));
    setSeg(this.bridle[1], tow, tail.clone().add(new THREE.Vector3(0, 0, -chord * 0.2)));
    this.towLocal = tow;
  }

  // place kite: position p (three), downstream dir, lift-up hint
  update(p, downstream, upHint, span, fold = 1) {
    this.build(span, fold);
    const z = downstream.clone().normalize();
    let y = upHint.clone().addScaledVector(z, -upHint.dot(z));
    if (y.lengthSq() < 1e-6) y.set(0, 1, 0);
    y.normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    this.group.quaternion.setFromRotationMatrix(m);
    this.group.position.copy(p);
    this.group.updateMatrixWorld();
    return this.towLocal.clone().applyMatrix4(this.group.matrixWorld);
  }
}

export class Payload {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.11, 0.03, 4, 0.01), new THREE.MeshPhysicalMaterial({ color: 0x1b1d21, roughness: 0.45, clearcoat: 0.4 }));
    body.castShadow = true;
    this.group.add(body);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.02, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 2.2 });
    const ring = new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 1, roughness: 0.3 });
    for (const sgn of [1, -1]) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
      dome.rotation.x = sgn * Math.PI / 2;
      dome.position.set(0, 0.025, sgn * 0.015);
      this.group.add(dome);
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.0165, 0.002, 8, 24), ring);
      r.position.set(0, 0.025, sgn * 0.0152);
      this.group.add(r);
    }
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2010, emissiveIntensity: 4 }));
    this.led.position.set(0.012, -0.04, 0.0155);
    this.group.add(this.led);
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 5), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
    scene.add(this.rod);
  }
  // lens node at `cam` (three), heading `fwd`; suspension from `hang`
  update(cam, hang, fwd, t) {
    this.group.position.copy(cam);
    const y = new THREE.Vector3(0, 1, 0);
    const z = fwd.clone().setY(0).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    // body upright, lenses facing fore/aft (dual hemispherical camera)
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.rod.position.copy(cam).add(hang).multiplyScalar(0.5);
    this.rod.scale.set(1, Math.max(0.001, cam.distanceTo(hang)), 1);
    this.rod.quaternion.setFromUnitVectors(y, hang.clone().sub(cam).normalize());
    this.led.material.emissiveIntensity = Math.sin(t * 6) > 0.6 ? 6 : 0.3;
  }
}

export class Tether {
  constructor(scene) {
    this.mat = new THREE.MeshStandardMaterial({ color: 0xf3e9c8, roughness: 0.5 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }
  // straight when taut; illustrative parabolic sag when slack (shape is NOT modeled)
  update(a, b, slackLen = 0) {
    const pts = [];
    const n = 24;
    const d = a.distanceTo(b);
    const sag = slackLen > 0 ? Math.sqrt(Math.max(0, (3 / 8) * d * slackLen)) : 0;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const p = a.clone().lerp(b, s);
      p.y -= sag * 4 * s * (1 - s);
      pts.push(p);
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0022, 5, false);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.points = pts;
  }
}

export class Overlays {
  constructor(scene, resolution) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lineMat = new LineMaterial({ color: 0xffffff, linewidth: 2.5, vertexColors: false, dashed: false, depthTest: false, transparent: true });
    this.lineMat.resolution.copy(resolution);
    this.tether = new Line2(new LineGeometry(), this.lineMat);
    this.tether.renderOrder = 10;
    this.group.add(this.tether);
    this.trailMat = new LineMaterial({ color: 0xff7a3d, linewidth: 1.5, transparent: true, opacity: 0.7, depthTest: true });
    this.trailMat.resolution.copy(resolution);
    this.trail = new Line2(new LineGeometry(), this.trailMat);
    this.group.add(this.trail);
    this.air = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xa66cff, 0.12, 0.07);
    this.wind = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x3c8dff, 0.25, 0.12);
    this.group.add(this.air, this.wind);
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false, transparent: true }));
    this.marker.renderOrder = 11;
    this.group.add(this.marker);
  }
  setResolution(r) { this.lineMat.resolution.copy(r); this.trailMat.resolution.copy(r); }
  update(o) {
    this.group.visible = o.visible;
    if (!o.visible) return;
    const flat = (pts) => pts.flatMap((p) => [p.x, p.y, p.z]);
    this.tether.geometry.dispose();
    this.tether.geometry = new LineGeometry().setPositions(flat([o.anchor, o.kite]));
    this.lineMat.color.set(o.unavailable ? 0x8a8f98 : o.slack ? 0xffb020 : o.valid ? 0xffffff : 0xff6a5c);
    this.lineMat.dashed = false;
    if (o.trail && o.trail.length > 1) {
      this.trail.visible = true;
      this.trail.geometry.dispose();
      this.trail.geometry = new LineGeometry().setPositions(flat(o.trail));
    } else this.trail.visible = false;
    const setArrow = (ar, origin, vec, scale) => {
      const l = vec.length();
      ar.visible = l > 0.05;
      if (!ar.visible) return;
      ar.position.copy(origin);
      ar.setDirection(vec.clone().normalize());
      ar.setLength(l * scale, Math.min(0.3, l * scale * 0.3), Math.min(0.15, l * scale * 0.15));
    };
    setArrow(this.air, o.kite, o.air, 0.08);
    setArrow(this.wind, o.windOrigin, o.wind, 0.3);
    this.marker.visible = !!o.marker;
    if (o.marker) { this.marker.position.copy(o.marker); this.marker.lookAt(o.camPos); }
  }
}
