// leapfrog gear (browser only), round 4: 168 g feathered span-morphing lead glider (feathers slide out for slow flight);
// iteration 2 base: folding-wing lead glider (tapered cambered
// wings that swing back along the fuselage, V-tail, folding PUSHER prop on a pylon above the wing
// with motion disc, 2-axis pan/tilt camera pod on a short tail post, belly skid with snow claws,
// wing-tip skids, status LED), the right-hip holster with its 14 Wh bank, and a simple neighbour
// skier. No periscope, no capture hoop (removed after the 2026-10-19 audit). Geometry is an
// illustrative product design, not CAD.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const toV3 = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const carbonTex = () => canvasTex(128, 128, (g) => { g.fillStyle = '#15171b'; g.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? '#24272d' : '#111316'; g.fillRect(x, y, 8, 8); } }, [4, 4]);
const discTex = () => canvasTex(256, 256, (g) => {
  const grd = g.createRadialGradient(128, 128, 14, 128, 128, 126);
  grd.addColorStop(0, 'rgba(30,30,34,0)'); grd.addColorStop(0.3, 'rgba(40,40,46,0.45)'); grd.addColorStop(0.9, 'rgba(70,70,76,0.3)'); grd.addColorStop(0.98, 'rgba(255,140,40,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fill();
});
// wing skin: white film with an orange tip band and a faint rib pattern
const wingTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#f2f3f4'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.05)'; for (let x = 8; x < w; x += 18) g.fillRect(x, 0, 2, h);
  g.fillStyle = '#ff6a1a'; g.fillRect(w - 46, 0, 46, h);
  g.fillStyle = '#1b1d21'; g.fillRect(w - 50, 0, 4, h);
});

// tapered, slightly swept, cambered wing panel; root at z = 0, tip at z = span (local +Z = outboard)
function wingGeometry(span, chordRoot, chordTip, sweep) {
  const shape = new THREE.Shape();
  const N = 14, t = 0.085, m = 0.035;
  const up = [], lo = [];
  for (let i = 0; i <= N; i++) {
    const x = 0.5 - 0.5 * Math.cos((Math.PI * i) / N); // cosine spacing 0..1 (LE → TE)
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = x < 0.4 ? (m / 0.16) * (0.8 * x - x * x) : (m / 0.36) * (0.2 + 0.8 * x - x * x);
    up.push([x, yc + yt]); lo.push([x, yc - yt]);
  }
  shape.moveTo(-up[0][0], up[0][1]);
  for (const [x, y] of up) shape.lineTo(-x, y);
  for (let i = lo.length - 1; i >= 0; i--) shape.lineTo(-lo[i][0], lo[i][1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 6 });
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const z = p.getZ(k); // 0..1 spanwise
    const c = chordRoot + (chordTip - chordRoot) * z;
    p.setXYZ(k, p.getX(k) * c + 0.25 * chordRoot - sweep * z, p.getY(k) * c, z * span);
  }
  g.computeVertexNormals();
  // UVs: u along span, v along chord
  const uv = g.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, p.getZ(k) / span, (p.getX(k) + chordRoot) / (chordRoot * 1.5));
  return g;
}

function fuselageGeometry() {
  // radius profile along the body (x from nose 0.17 to tail −0.19), revolved about X
  const pts = [];
  const prof = [[0.17, 0.0], [0.168, 0.008], [0.16, 0.016], [0.14, 0.022], [0.1, 0.025], [0.04, 0.025], [-0.02, 0.021], [-0.07, 0.014], [-0.12, 0.009], [-0.17, 0.007], [-0.19, 0.0]];
  for (const [x, r] of prof) pts.push(new THREE.Vector2(r, x));
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateZ(-Math.PI / 2); // lathe axis Y → X
  g.scale(1, 0.9, 1);      // slightly flattened pod
  return g;
}

function neighbourSkier(M) {
  const g = new THREE.Group();
  const jacket = M({ color: 0xc8262c, roughness: 0.65, sheen: 0.5, sheenColor: 0xff8080 });
  const pants = M({ color: 0x22252b, roughness: 0.8 });
  const helmet = M({ color: 0xf2f2f2, roughness: 0.25, clearcoat: 0.8 });
  const ski = M({ color: 0x2b6cd6, roughness: 0.3, clearcoat: 0.6 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 12), jacket); torso.position.set(0.05, 1.18, 0); torso.rotation.z = -0.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), helmet); head.position.set(0.22, 1.62, 0);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 4, 10), pants); leg.position.set(-0.02, 0.5, 0.13 * s); leg.rotation.z = 0.3; g.add(leg);
    const sk = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.02, 0.085, 2, 0.008), ski); sk.position.set(0.05, 0.02, 0.13 * s); g.add(sk);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.45, 4, 8), jacket); arm.position.set(0.25, 1.1, 0.25 * s); arm.rotation.z = 0.9; g.add(arm);
  }
  g.add(torso, head);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function createGear(scene) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    shell: M({ color: 0xf4f5f6, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.18 }),
    accent: M({ color: 0xff5a14, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    wing: M({ map: wingTex(), roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25, side: THREE.DoubleSide }),
    carbon: M({ map: carbonTex(), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 }),
    alu: M({ color: 0x9aa3ad, metalness: 0.95, roughness: 0.28 }),
    dark: M({ color: 0x0e1013, roughness: 0.4, metalness: 0.2 }),
    rubber: M({ color: 0x1a1b1e, roughness: 0.92 }),
    glass: M({ color: 0x0a1220, roughness: 0.03, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.7, iridescenceIOR: 1.5 }),
    prop: M({ color: 0x1d1f23, roughness: 0.45 }),
    disc: new THREE.MeshBasicMaterial({ map: discTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    cord: M({ color: 0xffd21e, roughness: 0.6 }),
    holster: M({ color: 0x2c3138, roughness: 0.85, sheen: 0.6, sheenColor: 0x8a96a6 }),
    holsterTrim: M({ color: 0xff5a14, roughness: 0.5 }),
    ledG: new THREE.MeshStandardMaterial({ color: 0x001a08, emissive: 0x2cff7a, emissiveIntensity: 3 }),
    ledA: new THREE.MeshStandardMaterial({ color: 0x1a0d00, emissive: 0xffa21e, emissiveIntensity: 3 }),
    spray: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }),
  };
  const sh = (m) => { m.castShadow = true; return m; };

  // ------------------------------------------------------------ glider (local: +X nose, +Y up, +Z right)
  const glider = new THREE.Group();
  const body = new THREE.Group(); glider.add(body); // pitched by alpha
  const fus = sh(new THREE.Mesh(fuselageGeometry(), mat.shell)); body.add(fus);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0252, 0.0252, 0.012, 28, 1, true), mat.accent); stripe.rotation.z = Math.PI / 2; stripe.position.x = 0.07; stripe.scale.set(1, 1, 0.9); body.add(stripe);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.018, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass); canopy.scale.set(2.2, 0.7, 1); canopy.position.set(0.085, 0.018, 0); body.add(canopy); // GNSS/UWB window
  const boom = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0075, 0.16, 12), mat.carbon)); boom.rotation.z = Math.PI / 2; boom.position.x = -0.16; body.add(boom);
  // wings: root hinge at the shoulder; open = span out, folded = swung back along the boom
  const wingGeoR = wingGeometry(0.275, 0.1, 0.085, 0.015); // round 4: tucked panel (span 0.55 m)
  const hingeL = new THREE.Group(), hingeR = new THREE.Group();
  hingeL.position.set(0.035, 0.02, -0.012); hingeR.position.set(0.035, 0.02, 0.012);
  const wR = sh(new THREE.Mesh(wingGeoR, mat.wing)); hingeR.add(wR);
  const wL = sh(new THREE.Mesh(wingGeoR, mat.wing)); wL.scale.z = -1; hingeL.add(wL);
  // spoilers (airbrake) on the upper surface, tip skids (perch outriggers)
  const spoilerR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.09), mat.accent); spoilerR.position.set(-0.01, 0.006, 0.12); hingeR.add(spoilerR);
  const spoilerL = spoilerR.clone(); spoilerL.position.z = -0.12; hingeL.add(spoilerL);
  const skidR = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.012, 0.012, 2, 0.005), mat.rubber); skidR.position.set(-0.005, -0.006, 0.27); hingeR.add(skidR);
  const skidL = skidR.clone(); skidL.position.z = -0.27; hingeL.add(skidL);
  // round 4: sliding film feathers (5 per side). Tucked they lie on the panel; extended they slide 0.225 m outboard and fan
  // slightly (span 0.55 → 1.0 m, area 0.05 → 0.10 m²)
  const featherGeo = new RoundedBoxGeometry(0.03, 0.0016, 0.25, 2, 0.0008); featherGeo.translate(0, 0, 0.125);
  const feathers = [];
  for (const [hinge, s] of [[hingeR, 1], [hingeL, -1]]) {
    for (let k = 0; k < 5; k++) {
      const piv = new THREE.Group(); piv.position.set(0.035 - k * 0.019, 0.004 + k * 0.0008, s * 0.02); hinge.add(piv);
      const fm = sh(new THREE.Mesh(featherGeo, k === 0 ? mat.accent : mat.wing)); fm.scale.z = s; piv.add(fm);
      feathers.push({ piv, fm, k, s });
    }
  }
  body.add(hingeL, hingeR);
  // V-tail
  const tail = new THREE.Group(); tail.position.set(-0.225, 0.004, 0); body.add(tail);
  for (const s of [-1, 1]) {
    const fin = sh(new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.003, 0.085, 2, 0.0012), mat.shell));
    fin.position.set(0, 0.03, 0.03 * s); fin.rotation.x = -s * 0.78; tail.add(fin);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.0035, 0.018), mat.accent); tip.position.set(0, 0.059, 0.059 * s); tip.rotation.x = -s * 0.78; tail.add(tip);
  }
  // nose: spinner + folding 2-blade prop + motion disc
  const nose = sh(new THREE.Mesh(new THREE.SphereGeometry(0.0125, 18, 12), mat.shell)); nose.scale.set(1.4, 1, 1); nose.position.x = 0.168; body.add(nose);
  const pylon = sh(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.06, 0.008, 2, 0.003), mat.carbon)); pylon.position.set(-0.03, 0.05, 0); body.add(pylon);
  const pod = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.05, 16), mat.dark)); pod.rotation.z = Math.PI / 2; pod.position.set(-0.035, 0.083, 0); body.add(pod);
  const spinner = sh(new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.022, 18), mat.alu)); spinner.rotation.z = Math.PI / 2; spinner.position.set(-0.07, 0.083, 0); body.add(spinner);
  const hub = new THREE.Group(); hub.position.set(-0.063, 0.083, 0); body.add(hub);
  const blades = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); hub.add(piv);
    const bl = new THREE.Mesh(new RoundedBoxGeometry(0.004, 0.056, 0.012, 2, 0.0018), mat.prop); bl.position.y = 0.03 * s; bl.rotation.y = 0.25 * s; piv.add(bl);
    blades.push({ piv, s });
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.051, 40), mat.disc); disc.rotation.y = Math.PI / 2; disc.position.set(-0.064, 0.083, 0); disc.renderOrder = 5; body.add(disc);
  // short tail post + 2-axis pan/tilt camera pod (stabilised, aimed in world space)
  const mast = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.03, 10), mat.carbon)); mast.position.set(-0.215, 0.027, 0); body.add(mast);
  const turret = new THREE.Group(); scene.add(turret);
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.012, 18), mat.dark); yoke.position.y = -0.016; turret.add(yoke);
  const ball = sh(new THREE.Mesh(new THREE.SphereGeometry(0.017, 24, 16), mat.dark)); turret.add(ball);
  const lensG = new THREE.Group(); turret.add(lensG);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.01, 0.012, 24), mat.glass); lens.rotation.z = -Math.PI / 2; lens.position.x = 0.016; lensG.add(lens);
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.0012, 8, 24), mat.accent); lensRing.rotation.y = Math.PI / 2; lensRing.position.x = 0.022; lensG.add(lensRing);
  // belly claws
  const claws = [];
  for (const x of [0.06, -0.03]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.022, 8), mat.alu); c.rotation.z = Math.PI; c.position.set(x, -0.03, 0); body.add(c); claws.push(c); }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), mat.ledG); led.position.set(0.12, 0.022, 0); body.add(led);
  scene.add(glider);

  // ------------------------------------------------------------ holster (right hip) with power bank
  const holster = new THREE.Group();
  const hBody = sh(new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.40, 0.08, 4, 0.03), mat.holster)); holster.add(hBody);
  const hTrim = new THREE.Mesh(new THREE.BoxGeometry(0.087, 0.012, 0.082), mat.holsterTrim); hTrim.position.y = 0.18; holster.add(hTrim);
  const hBank = new THREE.Mesh(new RoundedBoxGeometry(0.072, 0.13, 0.034, 2, 0.008), mat.dark); hBank.position.set(0, -0.1, 0.047); holster.add(hBank);
  const hLed = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), mat.ledG); hLed.position.set(0.02, -0.09, 0.061); holster.add(hLed);
  const hTail = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 12), mat.dark); hTail.position.y = 0.21; holster.add(hTail); // turret peeking out when stowed
  scene.add(holster);

  // ------------------------------------------------------------ neighbour skier, touchdown spray
  const nbSkier = neighbourSkier(M); nbSkier.visible = false; scene.add(nbSkier);
  const spray = new THREE.Group(); const flakes = [];
  for (let k = 0; k < 28; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.012 + 0.012 * ((k * 7) % 5) / 5, 6, 4), mat.spray); spray.add(f); flakes.push(f); }
  scene.add(spray);

  const all = [glider, turret, holster, nbSkier, spray];
  const basis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  let sprayT0 = -9, lastSpray = 0;

  return {
    hideInPip: [glider, turret],
    setVisible(v) { for (const o of all) o.visible = v && (o !== nbSkier || nbSkier.userData.on) && (o !== spray || spray.userData.on); },
    update(d, ctx) {
      const rig = ctx.skier;
      if (!d.pos || !rig.pelvisPos) return;
      const t = ctx.t || 0;
      const B = rig.basis;
      // ---- holster on the right hip (rig basis: f forward, left, up)
      const right = B.left.clone().negate();
      const hp = rig.pelvisPos.clone().addScaledVector(right, 0.165).addScaledVector(B.f, -0.03).addScaledVector(B.up, -0.1);
      holster.position.copy(hp);
      const hUp = B.up.clone().addScaledVector(B.f, 0.25).normalize();
      holster.quaternion.copy(basis(B.f.clone().negate().cross(hUp).normalize().negate(), hUp, B.f.clone().negate()));
      const inPocket = d.stowed || (d.stowT ?? 0) > 0.98;
      hTail.visible = inPocket;
      mat.ledG.emissiveIntensity = 2.5 + 1.5 * (Math.sin(t * 3) > 0 ? 1 : 0);

      // ---- glider pose
      glider.visible = !inPocket && holster.visible;
      const wing = d.wing ?? 1;
      let P, F, U;
      if (d.inHand && rig.hands) {
        P = rig.hands.R.grip.clone().addScaledVector(B.f, 0.08);
        F = toV3(d.dir || [1, 0, 0]).setY(0.15).normalize(); U = new THREE.Vector3(0, 1, 0);
        const st = d.stowT ?? 0; // into the holster: nose first, upright
        if (st > 0) { P.lerp(holster.position.clone().addScaledVector(hUp, 0.12), st); F.lerp(hUp.clone().negate(), st).normalize(); U = B.f.clone().negate(); }
      } else if (d.up && (d.phase === 1 || d.phase === 2 || d.phase === 3)) {
        // in flight: the model's body axes (attitude incl. turbulence response)
        P = toV3(d.pos); F = toV3(d.dir || [1, 0, 0]).normalize(); U = toV3(d.up).normalize();
      } else {
        P = toV3(d.pos);
        F = toV3(d.dir || [1, 0, 0]).normalize();
        const onSnow = d.phase === 4 || d.phase === 5 || d.phase === 6 || d.phase === 7 || d.phase === 8;
        U = onSnow ? ctx.slopeN.clone() : new THREE.Vector3(0, 1, 0);
        U.addScaledVector(F, -U.dot(F)).normalize();
        if (onSnow) P.addScaledVector(U, 0.012 - (d.sink || 0));
      }
      let R = new THREE.Vector3().crossVectors(F, U).normalize();
      U = new THREE.Vector3().crossVectors(R, F).normalize();
      const q = basis(F, U, R);
      // bank (right wing down = +) about the body X axis
      const bank = d.up ? 0 : THREE.MathUtils.degToRad(d.bank || 0) * (d.phase === 2 || d.phase === 3 || d.phase === 1 ? 1 : 0); // body axes already carry the bank
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bank));
      glider.position.copy(P); glider.quaternion.copy(q);
      body.rotation.z = d.up && d.phase !== 3 ? 0 : Math.min(1.25, Math.max(-0.2, d.alpha || 0)); // flare pitch (in cruise the body axes include α)
      // wings: fold back along the boom (stowed/in-hand before opening); perched = feathered nose-down a little
      const fold = 1 - wing;
      hingeR.rotation.y = fold * 1.42; hingeL.rotation.y = -fold * 1.42;
      const feather = d.phase === 5 || d.phase === 8 ? -0.12 : 0;
      hingeR.rotation.z = feather; hingeL.rotation.z = feather;
      hingeR.rotation.x = fold * 0.12; hingeL.rotation.x = -fold * 0.12;
      spoilerR.rotation.z = spoilerL.rotation.z = (d.phase === 3 || d.phase === 5 ? 0.9 : 0);
      const ext = Math.max(0, Math.min(1, d.morph ?? 0)) * wing;
      for (const fe of feathers) { fe.fm.position.z = fe.s * ext * 0.225; fe.piv.rotation.y = fe.s * ext * (fe.k - 2) * 0.05; }
      // prop: spinning (disc) vs folded back
      const spin = d.prop || 0;
      hub.rotation.x = t * (30 + 600 * spin);
      for (const b of blades) b.piv.rotation.z = spin > 0.05 ? 0 : b.s * -1.35;
      disc.visible = spin > 0.08; disc.material.opacity = Math.min(1, spin * 1.3);
      // claws
      for (const c of claws) c.visible = (d.claw || 0) > 0.5;
      // camera pod on the tail post
      glider.updateMatrixWorld(true);
      const top = new THREE.Vector3(-0.215, 0.058, 0).applyMatrix4(body.matrixWorld);
      turret.position.copy(top);
      const cf = d.camFwd ? toV3(d.camFwd).normalize() : F.clone().negate();
      const cr = new THREE.Vector3().crossVectors(cf, new THREE.Vector3(0, 1, 0)).normalize();
      const cu = new THREE.Vector3().crossVectors(cr, cf).normalize();
      turret.quaternion.copy(basis(cf, cu, cr));
      turret.visible = glider.visible;
      // status LED: green filming, amber warning/hold
      led.material = d.warn || d.stranded ? mat.ledA : mat.ledG; led.visible = !(d.pickup || d.inHand);
      led.material.emissiveIntensity = Math.sin(t * 9) > 0 ? 4 : 1.2;

      // ---- touchdown spray
      if (d.spray && t - lastSpray > 0.6) { sprayT0 = t; }
      if (d.spray) lastSpray = t;
      const age = t - sprayT0;
      spray.userData.on = age >= 0 && age < 1.2 && glider.visible;
      spray.visible = spray.userData.on;
      if (spray.visible) {
        spray.position.copy(P);
        flakes.forEach((f, k) => {
          const a = k * 2.399, r = 0.15 + 0.9 * age * (0.6 + 0.4 * ((k * 13) % 7) / 7);
          f.position.set(Math.cos(a) * r - F.x * age * 1.5, 0.05 + 1.2 * age * (1 - age) * (0.5 + (k % 3) / 3), Math.sin(a) * r - F.z * age * 1.5);
        });
        mat.spray.opacity = Math.max(0, 0.85 * (1 - age / 1.2));
      }

      // ---- neighbour skier
      nbSkier.userData.on = !!d.nb;
      nbSkier.visible = !!d.nb && holster.visible;
      if (d.nb) {
        nbSkier.position.copy(toV3(d.nb.pos));
        const hd = toV3(d.nb.heading).setY(0).normalize();
        nbSkier.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), hd);
      }
    },
  };
}

// ------------------------------------------------------------ director
// st3 (three.js): { pos (skier feet), fwd, left, chest, hands }; frame = model-space FrameState
export function shots(t, st3, { frame, mode }) {
  const d = frame && frame.device;
  if (!d || !d.pos) return null;
  const UP = new THREE.Vector3(0, 1, 0);
  const P = st3.pos.clone();
  const G = toV3(d.pos);
  const DOWN = new THREE.Vector3(1, -frame.tanS, 0).normalize(); // fall line (three.js)
  const ACROSS = new THREE.Vector3(0, 0, 1); // three +z = model −y (right side looking downhill)
  const side = Math.sign(G.z - P.z) || 1; // which side of the rider the glider is on (three z)
  const mid = G.clone().lerp(P.clone().addScaledVector(UP, 1), 0.5);
  const k01 = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const ease = (x) => x * x * (3 - 2 * x);
  const gp = d.phase;
  const near = (o, f, a, u) => o.clone().addScaledVector(DOWN, f).addScaledVector(ACROSS, a).addScaledVector(UP, u);
  let s;
  const chest = P.clone().addScaledVector(UP, 1.0);
  const R3 = st3.left.clone().negate(); // rider's right (three.js)
  // camera on the extension of the rider→glider line, just beyond the glider: glider big in front, rider behind it
  const pastGlider = (dist, lat, up, lean = 1.8, fov = 46, shot = 'past-glider') => {
    const away = G.clone().sub(chest); away.y = 0; away.normalize();
    const lat3 = new THREE.Vector3().crossVectors(UP, away).normalize();
    const toRider = chest.clone().sub(G).normalize();
    return { pos: G.clone().addScaledVector(away, dist).addScaledVector(lat3, lat).addScaledVector(UP, up), target: G.clone().addScaledVector(toRider, lean).addScaledVector(UP, 0.06), fov, shot };
  };
  if (mode !== 'demo') {
    // test mode: alternate a high wide shot from behind the rider (lane + glider ahead) and a shot past the glider at the rider
    const i = Math.floor(t / 8) % 2;
    if (i === 0) return { pos: near(P, -9, 5 * side, 4), target: P.clone().lerp(G, 0.35).addScaledVector(UP, 0.8), fov: 55, shot: 'lf-wide' };
    return pastGlider(2.0, 0.8 * side, 0.35, 1.8, 46, 'lf-past-glider');
  }
  if (t < 4) {
    // carry & draw: close on the right hip and hand
    const k = ease(k01(0, 4));
    s = { pos: P.clone().addScaledVector(st3.fwd, 1.8 - 0.2 * k).addScaledVector(R3, 1.5).addScaledVector(UP, 1.25 + 0.2 * k), target: P.clone().addScaledVector(UP, 0.95 + 0.25 * k).addScaledVector(R3, 0.2), fov: 36, shot: 'draw', dofOn: true };
  } else if (t < 4.8) {
    // the toss: front-right of the rider, glider leaving the hand
    const k = ease(k01(4, 4.8));
    s = { pos: P.clone().addScaledVector(st3.fwd, -2.2 + 0.6 * k).addScaledVector(R3, 3.0 + 0.6 * k).addScaledVector(UP, 1.6 + 0.3 * k), target: chest.clone().lerp(G, 0.5), fov: 44, shot: 'toss' };
  } else if (t < 22) {
    // climb-out and lead flight: past the glider, looking back up the slope at the rider
    const k = ease(k01(4.8, 22));
    s = pastGlider(1.9 - 0.2 * k, (0.7 + 0.3 * k) * side, 0.35 + 0.08 * Math.sin(t * 0.7), 1.6 + 0.4 * k, 46, 'lead-track');
  } else if (t < 28) {
    // establishing: high and wide from behind the rider, the glider leading ahead on its lane
    const k = ease(k01(22, 28));
    s = { pos: near(P, -10 + 2 * k, 4 * side, 6 - k), target: P.clone().lerp(G, 0.6), fov: 46, shot: 'wide' };
  } else if (t < 34) {
    // close on the glider in gusty air: the pan/tilt pod holds the rider while the airframe moves
    s = pastGlider(1.1, 0.5 * side, 0.25, 0.9, 40, 'gimbal-close');
  } else if (t < 41) {
    // stop: the glider lands ahead; low camera beside the perch, the stopped rider behind it
    s = pastGlider(1.6, 0.6 * side, 0.3, 1.6, 46, 'perch-low');
    s.dofOn = true;
  } else if (t < 51) {
    // glide up: camera low beside the perched glider, the rider gliding in and stopping beside it
    s = { pos: G.clone().addScaledVector(DOWN, 3.2).addScaledVector(ACROSS, 2.6 * side).addScaledVector(UP, 0.9), target: G.clone().lerp(chest, 0.45), fov: 44, shot: 'glide-up' };
  } else if (t < 55) {
    // pick-up: front-right of the rider, close on the hand and the folded glider
    const mid2 = P.clone().lerp(G, 0.5);
    s = { pos: mid2.clone().addScaledVector(st3.fwd, 2.6).addScaledVector(R3, 2.6 * side * -1).addScaledVector(UP, 1.4), target: mid2.clone().addScaledVector(UP, 0.45), fov: 44, shot: 'pickup', dofOn: true };
  } else {
    // holster: close on the right hip
    const k = ease(k01(55, 60));
    s = { pos: P.clone().addScaledVector(st3.fwd, 2.4 - 0.3 * k).addScaledVector(R3, 2.0).addScaledVector(UP, 1.35), target: P.clone().addScaledVector(UP, 0.85).addScaledVector(R3, 0.25), fov: 38, shot: 'stow', dofOn: true };
  }
  void mid;
  if (s.dofOn) s.dof = { focus: s.pos.distanceTo(s.target), aperture: 0.001 };
  return s;
}
