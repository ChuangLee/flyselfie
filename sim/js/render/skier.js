// Procedural skier for the photoreal renderer: PBR outerwear, helmet, mirrored
// goggles, boots, sidecut skis, poles and the L1-style backpack with a reel and
// hand crank. Posed every frame in world space: two-bone IK for arms and legs,
// pelvis/spine driven by speed (crouch), turning lean (inclination) and
// angulation. Illustration geometry — not a human-factors manikin.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = () => new THREE.Vector3();
const UPW = new THREE.Vector3(0, 1, 0);

const L = { thigh: 0.45, shin: 0.44, upper: 0.30, fore: 0.27, spine: 0.30, chest: 0.24, neck: 0.08, ankle: 0.13, hipW: 0.095, shoulderW: 0.19, pole: 1.22 };

function skiTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0, '#101820'); grd.addColorStop(0.45, '#13202c'); grd.addColorStop(1, '#0d141b');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 1024);
  g.fillStyle = '#f04a1d'; g.fillRect(0, 120, 64, 26); g.fillRect(0, 860, 64, 14);
  g.fillStyle = '#e8eef3'; g.fillRect(28, 160, 8, 680);
  g.fillStyle = '#f5b400'; g.fillRect(0, 150, 64, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// woven fabric with soft creases, used as a bump map on outerwear
function fabricBump() {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const weave = 0.5 + 0.25 * Math.sin(x * 1.6) * Math.sin(y * 1.6 + (Math.floor(x / 2) % 2) * 1.2);
      const crease = 0.25 * Math.sin((x * 0.7 + y * 0.25) * 0.08 + Math.sin(y * 0.03) * 3) * Math.sin(y * 0.021 + x * 0.004);
      const v = Math.max(0, Math.min(255, (weave * 0.55 + 0.25 + crease) * 255 + (Math.random() - 0.5) * 18));
      const k = (y * n + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

function skiGeometry() {
  const len = 1.66;
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 1, 90);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i); // z ∈ [-.5,.5], +z = tip
    const s = z + 0.5;
    // sidecut: 118 / 72 / 102 mm
    const w = s > 0.5 ? 0.072 + (0.118 - 0.072) * Math.pow((s - 0.5) / 0.5, 2) : 0.072 + (0.102 - 0.072) * Math.pow((0.5 - s) / 0.5, 2);
    let wf = w;
    if (s > 0.94) wf *= Math.cos(((s - 0.94) / 0.06) * 1.2); // rounded shovel
    const thick = 0.004 + 0.014 * Math.sin(Math.PI * Math.min(1, Math.max(0, (s - 0.06) / 0.86)));
    let lift = 0;
    if (s > 0.86) lift = 0.055 * Math.pow((s - 0.86) / 0.14, 2);
    if (s < 0.06) lift = 0.02 * Math.pow((0.06 - s) / 0.06, 2);
    p.setXYZ(i, x * wf, (y + 0.5) * thick + lift, z * len);
  }
  g.computeVertexNormals();
  return g;
}

export class Skier {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const M = (o) => new THREE.MeshPhysicalMaterial(o);
    this.mat = {
      jacket: M({ color: 0xc8321a, roughness: 0.62, sheen: 0.7, sheenRoughness: 0.5, sheenColor: 0xffb090 }),
      jacket2: M({ color: 0x1d2633, roughness: 0.7, sheen: 0.4, sheenColor: 0x8899aa }),
      pants: M({ color: 0x232c38, roughness: 0.78, sheen: 0.5, sheenColor: 0x7a8aa0 }),
      helmet: M({ color: 0xf1f2f4, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
      lens: M({ color: 0xffffff, metalness: 1, roughness: 0.04, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 700], envMapIntensity: 1.6 }),
      black: M({ color: 0x0c0d10, roughness: 0.55 }),
      rubber: M({ color: 0x15171a, roughness: 0.85 }),
      skin: M({ color: 0xc99780, roughness: 0.55, sheen: 0.3 }),
      gaiter: M({ color: 0x2a3644, roughness: 0.9 }),
      boot: M({ color: 0xe9ecef, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
      metal: M({ color: 0xc8ced6, metalness: 1, roughness: 0.28 }),
      ski: M({ map: skiTexture(), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
      skiBase: M({ color: 0x0b0b0d, roughness: 0.35 }),
      pack: M({ color: 0x2f3a46, roughness: 0.82, sheen: 0.5, sheenColor: 0x93a4b8 }),
      packAccent: M({ color: 0xf2a900, roughness: 0.6 }),
      carbon: M({ color: 0x1a1c20, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 }),
    };
    const bump = fabricBump();
    for (const k of ['jacket', 'jacket2', 'pants', 'gaiter', 'pack']) { this.mat[k].bumpMap = bump; this.mat[k].bumpScale = 1.2; }
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m; };
    const cap = (r, len, mat) => add(new THREE.CapsuleGeometry(r, len, 10, 22), mat);

    // torso: lathe profile, oriented each frame
    const prof = [[0.001, -0.16], [0.135, -0.155], [0.155, -0.08], [0.15, 0.0], [0.158, 0.1], [0.172, 0.22], [0.182, 0.33], [0.178, 0.42], [0.15, 0.49], [0.09, 0.535], [0.06, 0.55]].map(([r, y]) => new THREE.Vector2(r, y));
    const torsoGeo = new THREE.LatheGeometry(prof, 40);
    torsoGeo.scale(1.08, 1, 0.74);
    this.torso = add(torsoGeo, this.mat.jacket);
    this.yoke = add(new THREE.SphereGeometry(0.19, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), this.mat.jacket2);
    this.yoke.scale.set(1.08, 0.55, 0.78);
    this.zip = add(new THREE.BoxGeometry(0.008, 0.46, 0.006), this.mat.metal);
    this.collar = add(new THREE.CylinderGeometry(0.075, 0.085, 0.09, 24, 1, true), this.mat.jacket2);
    this.collar.material = this.mat.jacket2;
    this.pelvisM = cap(0.115, 0.13, this.mat.pants);
    this.belt = add(new THREE.TorusGeometry(0.15, 0.012, 8, 40), this.mat.jacket2);
    this.belt.scale.set(1.05, 1, 0.75);

    // head
    this.neck = cap(0.055, 0.06, this.mat.gaiter);
    this.face = add(new THREE.SphereGeometry(0.095, 32, 24), this.mat.gaiter); // balaclava
    this.face.scale.set(0.92, 1.12, 1.0);
    this.helmet = add(new THREE.SphereGeometry(0.106, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), this.mat.helmet);
    this.helmet.scale.set(0.95, 1.05, 1.1);
    this.brim = add(new THREE.TorusGeometry(0.102, 0.007, 8, 40), this.mat.black);
    this.brim.scale.set(0.95, 1.1, 1);
    this.vents = [];
    for (let i = -1; i <= 1; i++) { const v = add(new THREE.BoxGeometry(0.012, 0.006, 0.09), this.mat.black); this.vents.push([v, i]); }
    this.goggleFrame = add(new THREE.CylinderGeometry(0.104, 0.104, 0.07, 40, 1, true, -1.25, 2.5), this.mat.black);
    this.goggleLens = add(new THREE.CylinderGeometry(0.108, 0.108, 0.058, 40, 1, true, -1.15, 2.3), this.mat.lens);
    this.strap = add(new THREE.CylinderGeometry(0.102, 0.102, 0.034, 40, 1, true, 1.2, Math.PI * 2 - 2.4), this.mat.black);
    this.gaiterM = add(new THREE.CylinderGeometry(0.085, 0.07, 0.1, 24, 1, true), this.mat.gaiter);

    // hood rolled at the collar, joint caps that hide limb seams
    this.hood = add(new THREE.TorusGeometry(0.092, 0.026, 12, 32), this.mat.jacket);
    this.hood.scale.set(1.05, 1, 0.85);
    this.joints = {};
    for (const side of ['L', 'R']) {
      this.joints['shoulder' + side] = add(new THREE.SphereGeometry(0.068, 24, 16), this.mat.jacket);
      this.joints['elbow' + side] = add(new THREE.SphereGeometry(0.055, 20, 14), this.mat.jacket);
      this.joints['hip' + side] = add(new THREE.SphereGeometry(0.098, 20, 14), this.mat.pants);
    }
    // limbs
    this.limbs = {};
    for (const side of ['L', 'R']) {
      this.limbs['upper' + side] = cap(0.058, L.upper - 0.08, this.mat.jacket);
      this.limbs['fore' + side] = cap(0.05, L.fore - 0.07, this.mat.jacket);
      this.limbs['cuff' + side] = add(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 20), this.mat.jacket2);
      this.limbs['glove' + side] = add(new RoundedBoxGeometry(0.075, 0.1, 0.045, 3, 0.02), this.mat.black);
      this.limbs['thumb' + side] = cap(0.016, 0.035, this.mat.black);
      this.limbs['thigh' + side] = cap(0.088, L.thigh - 0.1, this.mat.pants);
      this.limbs['knee' + side] = add(new THREE.SphereGeometry(0.083, 20, 14), this.mat.pants);
      this.limbs['shin' + side] = cap(0.068, L.shin - 0.16, this.mat.pants);
      this.limbs['boot' + side] = add(new RoundedBoxGeometry(0.115, 0.17, 0.31, 4, 0.035), this.mat.boot);
      this.limbs['cuffB' + side] = add(new THREE.CylinderGeometry(0.068, 0.075, 0.17, 24), this.mat.boot);
      for (let b = 0; b < 3; b++) this.limbs[`buckle${side}${b}`] = add(new THREE.BoxGeometry(0.03, 0.012, 0.04), this.mat.metal);
      this.limbs['ski' + side] = add(skiGeometry(), [this.mat.ski]);
      this.limbs['ski' + side].material = this.mat.ski;
      this.limbs['binding' + side] = add(new RoundedBoxGeometry(0.085, 0.035, 0.42, 2, 0.01), this.mat.carbon);
      this.limbs['pole' + side] = add(new THREE.CylinderGeometry(0.0085, 0.006, L.pole, 10), this.mat.metal);
      this.limbs['grip' + side] = cap(0.016, 0.1, this.mat.rubber);
      this.limbs['basket' + side] = add(new THREE.TorusGeometry(0.04, 0.005, 6, 20), this.mat.rubber);
    }

    // backpack with reel housing and crank (L1 hand-cranked route)
    this.pack = add(new RoundedBoxGeometry(0.30, 0.44, 0.16, 5, 0.05), this.mat.pack);
    this.packLid = add(new RoundedBoxGeometry(0.28, 0.08, 0.17, 4, 0.035), this.mat.jacket2);
    this.packStrapL = add(new THREE.TorusGeometry(0.12, 0.014, 8, 24, Math.PI), this.mat.packAccent);
    this.packStrapR = add(new THREE.TorusGeometry(0.12, 0.014, 8, 24, Math.PI), this.mat.packAccent);
    this.reel = add(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 32), this.mat.carbon);
    this.reelCap = add(new THREE.CylinderGeometry(0.03, 0.03, 0.062, 20), this.mat.metal);
    this.crankArm = add(new THREE.BoxGeometry(0.012, 0.012, 0.1), this.mat.metal);
    this.crankKnob = add(new THREE.CylinderGeometry(0.013, 0.013, 0.045, 14), this.mat.rubber);
    this.guide = add(new THREE.TorusGeometry(0.018, 0.005, 8, 20), this.mat.metal);
    this.crankAngle = 0;
    // launch boom concept (not L1): hinge on the pack lid, two-stage carbon
    // tube, tip funnel/cradle with latch light, release loop on the left strap
    this.boomHinge = add(new THREE.CylinderGeometry(0.026, 0.026, 0.11, 20), this.mat.metal);
    this.boomOuter = add(new THREE.CylinderGeometry(0.014, 0.014, 1, 14), this.mat.carbon);
    this.boomInner = add(new THREE.CylinderGeometry(0.0105, 0.0105, 1, 12), this.mat.carbon);
    this.boomCollar = add(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 14), this.mat.packAccent);
    this.funnel = add(new THREE.CylinderGeometry(0.032, 0.012, 0.05, 20, 1, true), this.mat.metal);
    this.funnel.material = this.mat.metal.clone(); this.funnel.material.side = THREE.DoubleSide;
    this.forks = [0, 1].map(() => add(new THREE.CylinderGeometry(0.005, 0.005, 1, 8), this.mat.carbon));
    this.latchLed = add(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff66, emissiveIntensity: 0 }));
    this.loop = add(new THREE.TorusGeometry(0.022, 0.006, 8, 18), this.mat.packAccent);
    this.loopCord = add(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 5), this.mat.black);
    this.boomParts = [this.boomHinge, this.boomOuter, this.boomInner, this.boomCollar, this.funnel, ...this.forks, this.latchLed, this.loop, this.loopCord];
    this.boomTip = new THREE.Vector3();
    this.boomDir = new THREE.Vector3(0, 1, 0);

    // scratch
    this.v = Array.from({ length: 24 }, V);
    this.q = new THREE.Quaternion();
    this.m4 = new THREE.Matrix4();
  }

  // orient mesh so its local +Y runs from a to b, centred between them
  seg(mesh, a, b) {
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    const d = this.v[23].copy(b).sub(a).normalize();
    mesh.quaternion.setFromUnitVectors(UPW, d);
  }
  // full basis placement: x, y, z axes (unit) at position
  place(mesh, pos, x, y, z) {
    mesh.position.copy(pos);
    this.m4.makeBasis(x, y, z);
    mesh.quaternion.setFromRotationMatrix(this.m4);
  }

  static ik(a, t, l1, l2, hint, out) {
    const d = new THREE.Vector3().subVectors(t, a);
    let len = d.length();
    d.normalize();
    len = THREE.MathUtils.clamp(len, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-4);
    const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const p = new THREE.Vector3().copy(hint).addScaledVector(d, -hint.dot(d)).normalize();
    return out.copy(a).addScaledVector(d, x).addScaledVector(p, h);
  }

  // s: { pos (three), fwd (three, horizontal-ish), slopeN (three), speed, lean, crouch,
  //      handL?, handR? (three), noPoles, plantL, plantR, crank (bool), crankRate, stopped }
  pose(s) {
    const f = s.fwd.clone().normalize();
    const n = s.slopeN.clone().normalize();
    // ski frame on the slope
    const skiF = f.clone().addScaledVector(n, -f.dot(n)).normalize();
    const lean = THREE.MathUtils.clamp(s.lean || 0, -0.85, 0.85);
    const left = new THREE.Vector3().crossVectors(UPW, f).normalize();
    // body up: inclined into the turn about the travel direction
    const up = UPW.clone().applyAxisAngle(f, -lean * 0.85);
    const crouch = THREE.MathUtils.clamp(s.crouch ?? 0.35, 0, 1);

    // feet: stance on the snow, ski edged by the lean
    const stance = 0.13 + 0.03 * crouch;
    const skiN = n.clone().applyAxisAngle(skiF, -lean * 0.9);
    const skiX = new THREE.Vector3().crossVectors(skiN, skiF).normalize();
    const feet = {};
    for (const [side, sgn] of [['L', 1], ['R', -1]]) {
      const base = s.pos.clone().addScaledVector(left, sgn * stance);
      const fore = sgn * (lean > 0 ? 1 : -1) * 0.06 * Math.abs(lean);
      base.addScaledVector(skiF, fore);
      feet[side] = { base, ankle: base.clone().addScaledVector(skiN, L.ankle) };
    }
    const feetMid = feet.L.ankle.clone().add(feet.R.ankle).multiplyScalar(0.5);
    const legReach = (L.thigh + L.shin) * (0.93 - 0.22 * crouch);
    const pelvis = feetMid.clone().addScaledVector(up, legReach).addScaledVector(f, -0.06 - 0.1 * crouch);
    const hipL = pelvis.clone().addScaledVector(left, L.hipW);
    const hipR = pelvis.clone().addScaledVector(left, -L.hipW);

    // spine: forward pitch, upper body counter-rotates (angulation)
    const pitch = 0.18 + 0.42 * crouch;
    const spineUp = up.clone().applyAxisAngle(left, pitch).applyAxisAngle(f, lean * 0.35).normalize();
    const chestBase = pelvis.clone().addScaledVector(spineUp, 0.07);
    const torsoZ = f.clone().addScaledVector(spineUp, -f.dot(spineUp)).normalize();
    const torsoX = new THREE.Vector3().crossVectors(spineUp, torsoZ).normalize();
    this.place(this.torso, chestBase, torsoX, spineUp, torsoZ);
    const shoulderC = chestBase.clone().addScaledVector(spineUp, 0.44);
    this.place(this.yoke, chestBase.clone().addScaledVector(spineUp, 0.36), torsoX, spineUp, torsoZ);
    this.place(this.zip, chestBase.clone().addScaledVector(spineUp, 0.22).addScaledVector(torsoZ, 0.126), torsoX, spineUp, torsoZ);
    this.place(this.belt, chestBase.clone().addScaledVector(spineUp, -0.07), torsoX, torsoZ.clone().negate(), spineUp);
    this.place(this.pelvisM, pelvis.clone().addScaledVector(spineUp, -0.02), spineUp, torsoX.clone().negate(), torsoZ);

    // head looks ahead (towards horizontal)
    const neckBase = chestBase.clone().addScaledVector(spineUp, 0.53);
    const headUp = spineUp.clone().lerp(UPW, 0.65).normalize();
    const headZ = f.clone().addScaledVector(headUp, -f.dot(headUp)).normalize();
    const headX = new THREE.Vector3().crossVectors(headUp, headZ).normalize();
    const headC = neckBase.clone().addScaledVector(headUp, 0.15);
    this.seg(this.neck, neckBase, neckBase.clone().addScaledVector(headUp, 0.07));
    this.place(this.collar, neckBase.clone().addScaledVector(spineUp, 0.01), torsoX, spineUp, torsoZ);
    this.place(this.hood, neckBase.clone().addScaledVector(spineUp, -0.005).addScaledVector(torsoZ, -0.03), torsoX, torsoZ.clone().negate(), spineUp);
    this.place(this.face, headC.clone().addScaledVector(headZ, 0.01).addScaledVector(headUp, -0.02), headX, headUp, headZ);
    this.place(this.helmet, headC.clone().addScaledVector(headUp, 0.028), headX, headUp, headZ);
    this.place(this.brim, headC.clone().addScaledVector(headUp, 0.028), headX, headZ.clone().negate(), headUp);
    for (const [v, i] of this.vents) this.place(v, headC.clone().addScaledVector(headUp, 0.128).addScaledVector(headX, i * 0.035), headX, headUp, headZ);
    // goggles: cylinder axis = head up, opening centred forward (+Z)
    const gC = headC.clone().addScaledVector(headUp, -0.005);
    this.place(this.goggleFrame, gC, headX, headUp, headZ);
    this.place(this.goggleLens, gC, headX, headUp, headZ);
    this.place(this.strap, gC, headX, headUp, headZ);
    this.place(this.gaiterM, headC.clone().addScaledVector(headUp, -0.085), headX, headUp, headZ);

    // legs (knees forward and slightly into the turn)
    for (const [side, hip] of [['L', hipL], ['R', hipR]]) {
      const ft = feet[side];
      const hint = f.clone().addScaledVector(left, -lean * 0.6).normalize();
      const knee = Skier.ik(hip, ft.ankle, L.thigh, L.shin, hint, new THREE.Vector3());
      this.joints['hip' + side].position.copy(hip);
      this.seg(this.limbs['thigh' + side], hip, knee);
      this.limbs['knee' + side].position.copy(knee);
      const shinTop = knee.clone(), shinBot = knee.clone().lerp(ft.ankle, 0.62);
      this.seg(this.limbs['shin' + side], shinTop, shinBot);
      this.seg(this.limbs['cuffB' + side], knee.clone().lerp(ft.ankle, 0.55), ft.ankle.clone().addScaledVector(skiN, -0.02));
      const bootC = ft.base.clone().addScaledVector(skiN, 0.115).addScaledVector(skiF, 0.01);
      this.place(this.limbs['boot' + side], bootC, skiX, skiN, skiF);
      for (let b = 0; b < 3; b++) {
        const bp = bootC.clone().addScaledVector(skiN, 0.02 + b * 0.05).addScaledVector(skiF, 0.07 - b * 0.05).addScaledVector(skiX, side === 'L' ? 0.062 : -0.062);
        this.place(this.limbs[`buckle${side}${b}`], bp, skiX, skiN, skiF);
      }
      this.place(this.limbs['ski' + side], ft.base.clone().addScaledVector(skiN, 0.0), skiX, skiN, skiF);
      this.place(this.limbs['binding' + side], ft.base.clone().addScaledVector(skiN, 0.03).addScaledVector(skiF, 0.0), skiX, skiN, skiF);
    }

    // arms
    const shoulders = {
      L: shoulderC.clone().addScaledVector(torsoX, L.shoulderW).addScaledVector(spineUp, -0.04),
      R: shoulderC.clone().addScaledVector(torsoX, -L.shoulderW).addScaledVector(spineUp, -0.04),
    };
    const hands = {};
    for (const [side, sgn] of [['L', 1], ['R', -1]]) {
      const plant = side === 'L' ? s.plantL || 0 : s.plantR || 0;
      const def = pelvis.clone().addScaledVector(f, 0.36 + 0.12 * plant).addScaledVector(left, sgn * 0.31).addScaledVector(up, 0.16 + 0.04 * plant);
      const want = side === 'L' ? s.handL : s.handR;
      const w = side === 'L' ? s.reachL : s.reachR;
      const target = want ? (w != null ? def.clone().lerp(want, THREE.MathUtils.clamp(w, 0, 1)) : want) : def;
      const sh = shoulders[side];
      const hint = left.clone().multiplyScalar(sgn).addScaledVector(f, -0.6).addScaledVector(UPW, -0.6).normalize();
      const elbow = Skier.ik(sh, target, L.upper, L.fore, hint, new THREE.Vector3());
      const wrist = elbow.clone().addScaledVector(target.clone().sub(elbow).normalize(), L.fore);
      this.joints['shoulder' + side].position.copy(sh);
      this.joints['elbow' + side].position.copy(elbow);
      this.seg(this.limbs['upper' + side], sh, elbow);
      this.seg(this.limbs['fore' + side], elbow, wrist);
      this.seg(this.limbs['cuff' + side], elbow.clone().lerp(wrist, 0.82), wrist);
      const fd = wrist.clone().sub(elbow).normalize();
      const gx2 = new THREE.Vector3().crossVectors(fd, f).normalize();
      if (gx2.lengthSq() < 0.1) gx2.copy(left);
      const gz2 = new THREE.Vector3().crossVectors(gx2, fd).normalize();
      const gp = wrist.clone().addScaledVector(fd, 0.045);
      this.place(this.limbs['glove' + side], gp, gx2, fd, gz2);
      this.seg(this.limbs['thumb' + side], gp.clone().addScaledVector(gz2, 0.03), gp.clone().addScaledVector(gz2, 0.03).addScaledVector(fd, 0.04).addScaledVector(gx2, sgn * -0.01));
      hands[side] = { grip: gp, x: gx2, fd, gz: gz2 };

      // pole: from grip down and back to just above the snow (or planted forward)
      const pole = this.limbs['pole' + side], grip = this.limbs['grip' + side], basket = this.limbs['basket' + side];
      const vis = !s.noPoles;
      pole.visible = grip.visible = basket.visible = vis;
      if (vis) {
        const gh = gp.y - s.pos.y;
        let dir;
        if (plant > 0.2) dir = f.clone().multiplyScalar(0.35).addScaledVector(UPW, -1).addScaledVector(left, sgn * 0.12).normalize();
        else {
          const vy = THREE.MathUtils.clamp((gh - 0.06) / L.pole, 0.2, 0.97);
          dir = f.clone().multiplyScalar(-Math.sqrt(1 - vy * vy)).addScaledVector(UPW, -vy).addScaledVector(left, sgn * 0.1).normalize();
        }
        const tip = gp.clone().addScaledVector(dir, L.pole);
        this.seg(pole, gp, tip);
        this.seg(grip, gp.clone().addScaledVector(dir, -0.05), gp.clone().addScaledVector(dir, 0.08));
        basket.position.copy(gp).addScaledVector(dir, L.pole - 0.1);
        basket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      }
    }
    this.hands = hands;

    // backpack on the back of the torso
    const packC = chestBase.clone().addScaledVector(spineUp, 0.26).addScaledVector(torsoZ, -0.2);
    this.place(this.pack, packC, torsoX, spineUp, torsoZ);
    this.place(this.packLid, packC.clone().addScaledVector(spineUp, 0.21), torsoX, spineUp, torsoZ);
    for (const [m, sgn] of [[this.packStrapL, 1], [this.packStrapR, -1]]) {
      const sp = chestBase.clone().addScaledVector(spineUp, 0.34).addScaledVector(torsoX, sgn * 0.1).addScaledVector(torsoZ, -0.04);
      this.place(m, sp, torsoZ, spineUp, torsoX.clone().multiplyScalar(-1));
      m.rotateY(sgn > 0 ? 0 : 0);
    }
    const reelC = packC.clone().addScaledVector(torsoX, -0.18).addScaledVector(spineUp, -0.1);
    this.place(this.reel, reelC, spineUp, torsoX.clone().negate(), torsoZ);
    this.place(this.reelCap, reelC.clone().addScaledVector(torsoX, -0.005), spineUp, torsoX.clone().negate(), torsoZ);
    if (s.crank) this.crankAngle += (s.crankRate ?? 6) * (s.dt ?? 0.016);
    const arm = spineUp.clone().applyAxisAngle(torsoX, this.crankAngle);
    const armMid = reelC.clone().addScaledVector(torsoX, -0.04).addScaledVector(arm, 0.045);
    const armZ = arm.clone(), armY = torsoX.clone().negate(), armX = new THREE.Vector3().crossVectors(armY, armZ);
    this.place(this.crankArm, armMid, armX, armY, armZ);
    this.knobPos = reelC.clone().addScaledVector(torsoX, -0.065).addScaledVector(arm, 0.09);
    this.place(this.crankKnob, this.knobPos, armZ, armY.clone(), armX);
    this.guidePos = packC.clone().addScaledVector(spineUp, 0.26).addScaledVector(torsoZ, -0.04);
    this.place(this.guide, this.guidePos, torsoX, torsoZ, spineUp);

    // pack style: 'kite' (reel + crank, default), 'plain' (pack only), 'none'
    const pack = s.pack || 'kite';
    for (const m of [this.reel, this.reelCap, this.crankArm, this.crankKnob, this.guide]) m.visible = pack === 'kite';
    for (const m of [this.pack, this.packLid, this.packStrapL, this.packStrapR]) m.visible = pack !== 'none';
    this.packC = packC.clone();
    // launch boom (only when the frame state carries a boom angle)
    const hasBoom = s.boom != null;
    for (const m of this.boomParts) m.visible = hasBoom;
    if (hasBoom) {
      const th = THREE.MathUtils.degToRad(s.boom);
      const ext = THREE.MathUtils.smoothstep(s.boom, -40, 60);
      const len = 0.72 * (0.6 + 0.4 * ext);
      const back = torsoZ.clone().negate();
      const pivot = packC.clone().addScaledVector(spineUp, 0.2).addScaledVector(torsoZ, -0.1);
      const dir = back.clone().multiplyScalar(Math.cos(th)).addScaledVector(spineUp, Math.sin(th)).normalize();
      // folded: lies on the outer face of the pack rather than through it
      const lift = 0.02 * (1 - ext);
      const p0 = pivot.clone().addScaledVector(back, lift);
      const tip = p0.clone().addScaledVector(dir, len);
      this.place(this.boomHinge, pivot, spineUp, torsoX, torsoZ.clone().negate());
      const split = p0.clone().addScaledVector(dir, 0.43);
      this.seg(this.boomOuter, p0, split); this.boomOuter.scale.set(1, p0.distanceTo(split), 1);
      this.seg(this.boomInner, split, tip); this.boomInner.scale.set(1, Math.max(0.01, split.distanceTo(tip)), 1);
      this.seg(this.boomCollar, split.clone().addScaledVector(dir, -0.015), split.clone().addScaledVector(dir, 0.015));
      this.seg(this.funnel, tip.clone().addScaledVector(dir, -0.04), tip.clone().addScaledVector(dir, 0.01));
      // cradle fork arms hold the wing's spine either side of the tip
      for (const [k, sgn] of [[0, 1], [1, -1]]) {
        const a = tip.clone().addScaledVector(dir, -0.03);
        const b = tip.clone().addScaledVector(torsoX, sgn * 0.05).addScaledVector(dir, 0.03).addScaledVector(torsoZ, 0.02);
        this.seg(this.forks[k], a, b); this.forks[k].scale.set(1, a.distanceTo(b), 1);
      }
      this.latchLed.position.copy(tip).addScaledVector(dir, -0.05).addScaledVector(torsoZ, 0.016);
      this.latchLed.material.emissiveIntensity = s.locked ? 5 : 0;
      // release loop on the left shoulder strap; cord to the boom hinge
      const loopP = chestBase.clone().addScaledVector(spineUp, 0.3).addScaledVector(torsoX, 0.1).addScaledVector(torsoZ, 0.13 + 0.05 * (s.pull || 0));
      this.place(this.loop, loopP, torsoX, spineUp, torsoZ);
      this.loopPos = loopP.clone().addScaledVector(torsoZ, 0.03);
      const cordA = loopP.clone().addScaledVector(spineUp, 0.02);
      const cordB = chestBase.clone().addScaledVector(spineUp, 0.47).addScaledVector(torsoX, 0.11).addScaledVector(torsoZ, -0.02);
      this.seg(this.loopCord, cordA, cordB); this.loopCord.scale.set(1, cordA.distanceTo(cordB), 1);
      this.boomTip.copy(tip);
      this.boomDir.copy(dir);
      this.guidePos = tip.clone();
    }
    this.packBack = torsoZ.clone().negate();
    this.packUp = spineUp.clone();
    this.packX = torsoX.clone();

    this.headPos = headC;
    this.pelvisPos = pelvis;
    this.feet = feet;
    this.skiF = skiF; this.skiX = skiX; this.skiN = skiN;
    this.shoulders = shoulders;
    this.basis = { f, left, up, spineUp, torsoX, torsoZ };
  }
}
