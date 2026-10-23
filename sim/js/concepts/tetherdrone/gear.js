// S3 tetherdrone gear (browser only): ducted 200 g quad with 3-axis gimbal
// camera, nav/status LEDs and a side tether boom; 1.4 mm hi-vis power tether
// drawn from the lumped-mass nodes; pack-top reel pod with drum, clamshell
// dome cradle and LED ring. Geometry is an illustrative product design, not CAD.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const toV3 = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function discTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 18, 128, 128, 126);
  grd.addColorStop(0, 'rgba(30,30,34,0.0)'); grd.addColorStop(0.25, 'rgba(40,40,46,0.55)');
  grd.addColorStop(0.85, 'rgba(60,60,66,0.35)'); grd.addColorStop(0.97, 'rgba(230,230,235,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fill();
  // two blurred blade sectors
  for (let k = 0; k < 2; k++) {
    g.save(); g.translate(128, 128); g.rotate(k * Math.PI + 0.4);
    const sg = g.createLinearGradient(0, 0, 120, 0); sg.addColorStop(0, 'rgba(20,20,24,0.0)'); sg.addColorStop(1, 'rgba(20,20,24,0.35)');
    g.fillStyle = sg; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 122, -0.35, 0.35); g.closePath(); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function carbonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#16181c'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? '#22252b' : '#121417'; g.fillRect(x, y, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createGear(scene, THREE_) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    shell: M({ color: 0xe9ecef, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    carbon: M({ map: carbonTexture(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
    duct: M({ color: 0x2b3038, roughness: 0.55, side: THREE.DoubleSide }),
    alu: M({ color: 0xc23b22, metalness: 0.9, roughness: 0.3 }),
    dark: M({ color: 0x0d0f12, roughness: 0.35, metalness: 0.2 }),
    rubber: M({ color: 0x1a1c1f, roughness: 0.9 }),
    glass: M({ color: 0x0a1018, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.6, iridescenceIOR: 1.6 }),
    prop: M({ color: 0x24262b, roughness: 0.5 }),
    disc: new THREE.MeshBasicMaterial({ map: discTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    pod: M({ color: 0x353c45, roughness: 0.5, metalness: 0.5, clearcoat: 0.4 }),
    podAccent: M({ color: 0xff6a1a, roughness: 0.4, metalness: 0.3 }),
    dome: M({ color: 0x1d242c, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }),
    cradle: M({ color: 0x23272d, roughness: 0.85 }),
    ledW: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 3 }),
    ledR: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3 }),
    ledG: new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x23ff6a, emissiveIntensity: 3 }),
    ring: new THREE.MeshStandardMaterial({ color: 0x0b1410, emissive: 0x2cff8a, emissiveIntensity: 2.5 }),
    branch: M({ color: 0x4a3626, roughness: 0.95 }),
    needles: M({ color: 0x23402c, roughness: 0.9, sheen: 0.4, sheenColor: 0x4f7a5a }),
  };
  const shadow = (m) => { m.castShadow = true; return m; };

  // ------------------------------------------------------------ drone
  // local frame: +X forward (camera side), +Y up (thrust), +Z right
  const drone = new THREE.Group();
  const body = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.034, 0.066, 4, 0.012), mat.shell));
  const top = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.006, 0.05, 2, 0.003), mat.carbon)); top.position.y = 0.019;
  drone.add(body, top);
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const px = 0.064 * sx, pz = 0.064 * sz;
    const arm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.012), mat.carbon));
    arm.position.set(px * 0.55, 0.0, pz * 0.55); arm.rotation.y = -Math.atan2(pz, px); drone.add(arm);
    const duct = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.041, 0.02, 40, 1, true), mat.duct)); duct.position.set(px, 0.004, pz);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.0025, 8, 40), mat.duct); lip.rotation.x = Math.PI / 2; lip.position.set(px, 0.014, pz);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.003, 0.004), mat.dark); strut.position.set(px, -0.004, pz); strut.rotation.y = Math.PI / 4;
    const motor = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.013, 20), mat.alu)); motor.position.set(px, 0.002, pz);
    const hub = new THREE.Group(); hub.position.set(px, 0.011, pz);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.0015, 0.009), mat.prop); blade.rotation.x = 0.12; hub.add(blade);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.038, 40), mat.disc); disc.rotation.x = -Math.PI / 2; disc.position.set(px, 0.0115, pz); disc.renderOrder = 5;
    drone.add(duct, lip, strut, motor, hub, disc);
    rotors.push({ hub, blade, disc, dir: sx * sz });
  }
  // gimbal + camera under the nose
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.03), mat.dark); yoke.position.set(0.058, -0.022, 0);
  const camBall = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.024, 0.022, 0.026, 3, 0.007), mat.dark));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.007, 24), mat.glass); lens.rotation.z = Math.PI / 2; lens.position.x = 0.013;
  const camG = new THREE.Group(); camG.position.set(0.064, -0.035, 0); camG.add(camBall, lens);
  drone.add(yoke, camG);
  // tether boom on the left (−Z) with an eyelet and strain relief
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 8), mat.dark); boom.rotation.x = Math.PI / 2; boom.position.set(0, -0.012, -0.065);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0018, 8, 16), mat.alu); eye.position.set(0, -0.016, -0.1);
  drone.add(boom, eye);
  const attachLocal = new THREE.Vector3(0, -0.02, -0.1);
  // LEDs: white nose pair, red/green tail
  const ledN1 = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 10, 8), mat.ledW); ledN1.position.set(0.056, 0.0, 0.02);
  const ledN2 = ledN1.clone(); ledN2.position.z = -0.02;
  const ledT1 = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 10, 8), mat.ledR); ledT1.position.set(-0.056, 0.0, -0.022);
  const ledT2 = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 10, 8), mat.ledG); ledT2.position.set(-0.056, 0.0, 0.022);
  drone.add(ledN1, ledN2, ledT1, ledT2);
  // feet
  for (const [fx, fz] of [[0.035, 0.026], [0.035, -0.026], [-0.035, 0.026], [-0.035, -0.026]]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 8), mat.rubber); f.position.set(fx, -0.021, fz); drone.add(f); }
  scene.add(drone);

  // ------------------------------------------------------------ pack pod, reel, dome
  const pod = new THREE.Group();
  const housing = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.055, 0.17, 4, 0.02), mat.pod));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.272, 0.006, 0.172), mat.podAccent); stripe.position.y = -0.012;
  const drum = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.045, 28), mat.pod)); drum.rotation.z = Math.PI / 2; drum.position.set(0.155, -0.035, 0);
  const wound = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.037, 28), mat.podAccent); wound.rotation.z = Math.PI / 2; wound.position.copy(drum.position);
  const drumCap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6), mat.alu); drumCap.rotation.z = Math.PI / 2; drumCap.position.copy(drum.position);
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.13, 0.02, 48), mat.pod)); base.position.y = 0.037;
  const cradle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.05, 0.03, 40, 1, true), mat.cradle); cradle.position.y = 0.045;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.127, 0.0035, 8, 64), mat.ring); ring.rotation.x = Math.PI / 2; ring.position.y = 0.047;
  const exitBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.016, 16), mat.alu); exitBoss.position.y = 0.05;
  pod.add(housing, stripe, drum, wound, drumCap, base, cradle, ring, exitBoss);
  // clamshell dome: left/right halves hinged at the outer edges (opens sideways, away from the head)
  const hingeL = new THREE.Group(), hingeR = new THREE.Group();
  hingeL.position.set(0.128, 0.048, 0); hingeR.position.set(-0.128, 0.048, 0);
  const halfL = new THREE.Mesh(new THREE.SphereGeometry(0.128, 40, 16, Math.PI / 2, Math.PI, 0, Math.PI / 2), mat.dome);
  const halfR = new THREE.Mesh(new THREE.SphereGeometry(0.128, 40, 16, -Math.PI / 2, Math.PI, 0, Math.PI / 2), mat.dome);
  halfL.position.x = -0.128; halfR.position.x = 0.128;
  halfL.renderOrder = halfR.renderOrder = 6;
  const hingePinL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 10), mat.alu); hingePinL.rotation.x = Math.PI / 2; hingePinL.position.set(0.128, 0.048, 0);
  const hingePinR = hingePinL.clone(); hingePinR.position.x = -0.128;
  hingeL.add(halfL); hingeR.add(halfR);
  pod.add(hingeL, hingeR, hingePinL, hingePinR);
  // strap button (left strap)
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 20), mat.podAccent);
  const buttonLed = new THREE.Mesh(new THREE.TorusGeometry(0.0145, 0.0018, 6, 20), mat.ring);
  scene.add(pod, button, buttonLed);
  // v2 hip boom (exit 4) / short outrigger (exit 2): carbon tube, reel pod on the hip belt, cup cradle + LED at the tip
  const hip = new THREE.Group();
  const hipTube = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 1, 14), mat.carbon));
  const hipPod = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.09, 0.07, 3, 0.02), mat.pod));
  const hipStripe = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.008, 0.072), mat.podAccent);
  const hipCup = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.016, 0.03, 24, 1, true), mat.cradle));
  const hipRing = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.003, 8, 32), mat.ring);
  const hipBelt = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 40), mat.rubber);
  hip.add(hipTube, hipPod, hipStripe, hipCup, hipRing, hipBelt);
  // rear mast (exit 1)
  const mast = new THREE.Group();
  const mastTube = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 1, 14), mat.carbon));
  const mastCup = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.035, 24, 1, true), mat.cradle));
  const mastRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.003, 8, 32), mat.ring);
  mast.add(mastTube, mastCup, mastRing);
  scene.add(hip, mast);

  // ------------------------------------------------------------ tether (hi-vis 1.4 mm, drawn at ≥1.6 px)
  const lineMat = new LineMaterial({ color: 0xff6a1a, linewidth: 1.6, worldUnits: false, transparent: false });
  let line = new Line2(new LineGeometry(), lineMat);
  line.frustumCulled = false;
  scene.add(line);

  // ------------------------------------------------------------ snag-scenario tree
  const tree = new THREE.Group();
  const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 9, 12), mat.branch));
  const limb = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.08, 1, 8), mat.branch));
  tree.add(trunk, limb);
  const cones = [];
  for (let k = 0; k < 6; k++) { const c = shadow(new THREE.Mesh(new THREE.ConeGeometry(1.6 - k * 0.22, 1.6, 10), mat.needles)); tree.add(c); cones.push(c); }
  const twigs = [];
  for (let k = 0; k < 14; k++) { const tw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), mat.needles); tree.add(tw); twigs.push(tw); }
  tree.visible = false;
  scene.add(tree);

  const all = [drone, pod, button, buttonLed, line, tree, hip, mast];
  const tmp = new THREE.Vector3();
  let lastDrone = null;

  function basisQuat(x, y, z) { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); }

  return {
    hideInPip: [drone],
    setVisible(v) { for (const o of all) o.visible = v && (o !== tree || tree.userData.on) && (o !== hip || hip.userData.on) && (o !== mast || mast.userData.on); },
    update(d, ctx) {
      // LineMaterial widths are in pixels of the drawing buffer: keep its resolution current
      const cv = typeof document !== 'undefined' && document.getElementById('gl3d');
      if (cv) lineMat.resolution.set(cv.width || 1, cv.height || 1);
      const rig = ctx.skier;
      if (!rig.packC || !d.drone) return;
      // ---- pod on the pack top
      const up = rig.packUp.clone().normalize(), back = rig.packBack.clone().normalize(), px = rig.packX.clone().normalize();
      const podC = rig.packC.clone().addScaledVector(up, 0.245).addScaledVector(back, 0.01);
      pod.position.copy(podC);
      // local: X = packX (left), Y = up, Z = back
      pod.quaternion.copy(basisQuat(px, up, back));
      const open = sstep(0, 1, d.dome ?? 0);
      hingeL.rotation.z = -1.75 * open; hingeR.rotation.z = 1.75 * open;
      drum.rotation.x = wound.rotation.x = drumCap.rotation.x = (d.L || 0) / 0.033;
      // status LED ring: blue docked, green flying, amber warning/backup (blinking)
      const blink = (Math.sin((ctx.t || 0) * 12) > 0) ? 1 : 0.25;
      const col = d.warn || d.backup ? new THREE.Color(0xffa020) : d.docked ? new THREE.Color(0x3aa0ff) : new THREE.Color(0x2cff8a);
      mat.ring.emissive.copy(col); mat.ring.emissiveIntensity = (d.warn || d.backup ? blink : 1) * 2.6;
      // strap button on the left shoulder strap
      const sh = rig.shoulders && rig.shoulders.L ? rig.shoulders.L : rig.packC;
      button.position.copy(sh).addScaledVector(back, -0.11).addScaledVector(up, -0.16).addScaledVector(px, -0.06);
      button.quaternion.copy(basisQuat(px, back.clone().negate(), up));
      buttonLed.position.copy(button.position).addScaledVector(back, -0.004);
      buttonLed.quaternion.copy(basisQuat(px, up, back.clone().negate()));

      // ---- exit / dock hardware for the selected geometry
      const ex = d.exit | 0, B = rig.basis;
      pod.visible = (ex === 0 || ex === 5) && drone.visible; hingeL.visible = hingeR.visible = hingePinL.visible = hingePinR.visible = ex === 0; button.visible = buttonLed.visible = drone.visible;
      hip.userData.on = ex === 2 || ex === 4; mast.userData.on = ex === 1 || (ex === 5 && (d.mext ?? 0) > 0.02);
      hip.visible = hip.userData.on && drone.visible; mast.visible = mast.userData.on && drone.visible;
      const seg = (m, a, b) => { m.position.copy(a).lerp(b, 0.5); m.scale.set(1, a.distanceTo(b), 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); };
      let exitW = podC.clone().addScaledVector(up, 0.058);
      if (hip.visible && B && rig.pelvisPos) {
        const P0 = rig.pelvisPos.clone();
        const at = (f, l, u) => P0.clone().addScaledVector(B.f, f).addScaledVector(B.left, l).addScaledVector(B.up, u);
        const tip = ex === 4 ? at(-0.55, 0.6, -0.05) : at(-0.22, 0.42, 0.04);
        const base = at(-0.12, 0.17, 0.02);
        seg(hipTube, base, tip);
        hipPod.position.copy(at(-0.1, 0.2, -0.02)); hipPod.quaternion.copy(basisQuat(B.left.clone().negate(), B.up, B.f));
        hipStripe.position.copy(hipPod.position).addScaledVector(B.up, -0.02); hipStripe.quaternion.copy(hipPod.quaternion);
        hipBelt.position.copy(at(0, 0, 0.02)); hipBelt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), B.up);
        hipCup.position.copy(tip).add(new THREE.Vector3(0, 0.01, 0)); hipCup.quaternion.identity();
        hipRing.position.copy(tip).add(new THREE.Vector3(0, 0.026, 0)); hipRing.rotation.set(Math.PI / 2, 0, 0);
        exitW = tip.clone().add(new THREE.Vector3(0, 0.026, 0));
      }
      if (mast.visible) {
        const base = rig.packC.clone().addScaledVector(up, 0.25);
        const e5 = ex === 5 ? (d.mext ?? 0) : 1;
        const lo = rig.packC.clone().addScaledVector(up, 0.32);
        const top = lo.clone().lerp(rig.packC.clone().addScaledVector(up, 0.22 + 0.1 + (d.mastH || 0.7)).addScaledVector(back, d.mastBack ?? 0.5), e5);
        seg(mastTube, base, top);
        mastCup.position.copy(top); mastCup.quaternion.identity(); mastRing.position.copy(top).add(new THREE.Vector3(0, 0.017, 0)); mastRing.rotation.set(Math.PI / 2, 0, 0);
        exitW = top.clone().add(new THREE.Vector3(0, 0.017, 0));
      }
      drone.scale.setScalar(d.scale ?? 1);
      // ---- dock pose on the rig and blending of model positions near it
      const dockC = podC.clone().addScaledVector(up, 0.07);
      const modelAnchor = toV3(d.anchor);
      const dA = exitW.clone().sub(modelAnchor);
      let dPos = toV3(d.drone);
      const nearDock = d.docked ? 1 : 1 - sstep(0.4, 2.2, dPos.distanceTo(modelAnchor));
      dPos.addScaledVector(dA, nearDock).addScaledVector(up, ex === 0 ? 0.07 * nearDock * 0.6 : 0);
      if (d.docked) dPos = ex === 0 ? dockC.clone() : toV3(d.drone).add(dA).add(new THREE.Vector3(0, 0.02, 0));
      // orientation: thrust up vector, yaw forward (camera)
      const packDock = d.docked && ex === 0;
      let yU = packDock ? up.clone() : d.docked ? new THREE.Vector3(0, 1, 0) : toV3(d.up).normalize();
      let fw = packDock ? back.clone() : toV3(d.yaw);
      fw.addScaledVector(yU, -fw.dot(yU)); if (fw.lengthSq() < 1e-6) fw = back.clone(); fw.normalize();
      const rz = new THREE.Vector3().crossVectors(fw, yU).normalize();
      if (!d.docked && nearDock > 0 && ex === 0) { yU.lerp(up, nearDock * 0.5).normalize(); }
      drone.position.copy(dPos);
      drone.quaternion.copy(basisQuat(fw, yU, rz));
      // camera tilts with the gimbal (pitch towards the subject)
      if (d.gimbal) {
        const g = toV3(d.gimbal).normalize();
        const pitch = Math.asin(Math.max(-1, Math.min(1, g.dot(yU))));
        camG.rotation.z = pitch;
      } else camG.rotation.z = 0;
      // rotors
      const spin = d.rotor || 0;
      for (const r of rotors) {
        r.hub.rotation.y = r.dir * (ctx.t || 0) * (40 + 900 * spin);
        r.blade.visible = spin < 0.55;
        r.disc.visible = spin > 0.12;
        r.disc.material.opacity = Math.min(1, spin * 1.2);
      }
      const ledOn = !d.docked || spin > 0.05;
      mat.ledW.emissiveIntensity = ledOn ? 3 : 0.2; mat.ledR.emissiveIntensity = mat.ledG.emissiveIntensity = ledOn ? (Math.sin((ctx.t || 0) * 8) > 0.6 ? 6 : 2) : 0.2;
      { const sc = d.scale ?? 1, r = (d.attR ?? d.attachOff ?? 0.1) / sc, ph = d.aphi ?? 0;
        eye.position.set(-r * Math.sin(ph), -0.016, -r * Math.cos(ph));
        boom.scale.set(1, Math.max(0.3, r / 0.07), 1); boom.position.set(eye.position.x / 2, -0.012, eye.position.z / 2);
        boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.sin(ph), 0, -Math.cos(ph)));
        attachLocal.set(eye.position.x, -0.02, eye.position.z); }
      drone.updateMatrixWorld();
      lastDrone = dPos;

      // ---- tether polyline from the lumped-mass nodes, ends snapped to the rendered pack and drone
      const nodes = d.nodes || [];
      const show = nodes.length > 1 && !(d.docked && (d.L || 0) < 0.2);
      line.visible = show;
      if (show) {
        const attW = attachLocal.clone().applyMatrix4(drone.matrixWorld);
        const N = nodes.length - 1;
        const dD = attW.clone().sub(toV3(nodes[N]));
        const pts = nodes.map((p, j) => { const v = toV3(p); if (!d.broken) v.addScaledVector(dA, 1 - j / N); return d.cut ? v : v.addScaledVector(dD, j / N); });
        if (!d.broken) pts[0].copy(exitW);
        if (!d.cut) pts[N].copy(attW);
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        const sm = curve.getPoints(Math.max(16, N * 5));
        const arr = []; for (const p of sm) arr.push(p.x, p.y, p.z);
        const g = new LineGeometry(); g.setPositions(arr);
        line.geometry.dispose(); line.geometry = g; line.computeLineDistances();
        // physically sized: projected tether diameter at the viewing distance, floored at 1 px (sub-pixel lines alias away)
        if (ctx.camera && cv) {
          const mid = pts[Math.floor(N / 2)];
          const fpx = (cv.height / 2) / Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2);
          lineMat.linewidth = Math.min(3, Math.max(1, ((d.tetherD || 0.0014) * fpx) / Math.max(0.3, ctx.camera.position.distanceTo(mid))));
        }
      }

      // ---- tree with an overhanging limb (snag scenario)
      tree.userData.on = !!d.branch;
      tree.visible = !!d.branch && drone.visible;
      if (d.branch) {
        const b = d.branch;
        const yEnd = b.y1 + 0.3, base = [b.x, yEnd, -b.x * ctx.tanS];
        const baseV = toV3(base);
        trunk.position.copy(baseV).add(new THREE.Vector3(0, 4.5, 0)).sub(tree.position.set(0, 0, 0));
        const a = toV3([b.x, b.y0, b.z]), c = toV3([b.x, b.y1 + 0.3, b.z]);
        limb.position.copy(a).lerp(c, 0.5); limb.scale.set(1, a.distanceTo(c), 1);
        limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
        cones.forEach((cn, k) => { cn.position.copy(baseV).add(new THREE.Vector3(0, 4.0 + k * 0.85, 0)); });
        twigs.forEach((tw, k) => { const f = (k + 0.5) / twigs.length; tw.position.copy(a).lerp(c, f).add(new THREE.Vector3(0, 0.05 * Math.sin(k * 2.1), 0.12 * Math.cos(k * 1.7))); tw.rotation.set(Math.PI / 2 + 0.3 * Math.sin(k), 0, 0.4 * Math.cos(k * 1.3)); });
      }
      void tmp; void lastDrone;
    },
  };
}

// ------------------------------------------------------------ director
// st3 (three.js): { pos, fwd, left, chest, hands }; frame = model-space FrameState
export function shots(t, st3, { frame, mode }) {
  const d = frame && frame.device;
  if (!d || !d.drone) return null;
  const UP = new THREE.Vector3(0, 1, 0);
  const P = st3.pos.clone();
  let F = toV3([d.course[0], d.course[1], 0]); if (F.lengthSq() < 0.5) F = st3.fwd.clone(); F.y = 0; F.normalize();
  const Lf = new THREE.Vector3().crossVectors(UP, F).normalize();
  const at = (f, l, u, o = P) => o.clone().addScaledVector(F, f).addScaledVector(Lf, l).addScaledVector(UP, u);
  const D = toV3(d.drone);
  const pack = d.anchor && (d.exit | 0) !== 0 ? toV3(d.anchor) : P.clone().addScaledVector(UP, 1.45).addScaledVector(F, -0.25); // dock / exit point
  const mid = pack.clone().lerp(D, 0.45);
  const k01 = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const ease = (x) => x * x * (3 - 2 * x);
  if (mode !== 'demo') {
    // test mode: alternate wide rear-quarter and side views that hold rider, tether and drone
    const i = Math.floor(t / 7) % 2, k = ease((t % 7) / 7);
    // aim a little right of the rider so the product-camera inset (bottom right) does not cover them
    const aim = pack.clone().lerp(D, 0.35).addScaledVector(Lf, -1.8).addScaledVector(UP, -0.4);
    if (i === 0) return { pos: at(-11 - 2 * k, 4.0, 5.5), target: aim, fov: 46, shot: 'td-rear3q' };
    return { pos: at(-3.0, -12, 3.0), target: pack.clone().lerp(D, 0.4).addScaledVector(F, 2.0), fov: 44, shot: 'td-side' };
  }
  let s;
  const ots = () => { // over the drone's shoulder: product in the foreground, rider and tether beyond
    const away = D.clone().sub(pack).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(UP, away).normalize();
    const nodes = d.nodes || [];
    const mid = nodes.length > 2 ? toV3(nodes[Math.floor(nodes.length * 0.7)]) : D.clone();
    const sgn = mid.clone().sub(D).dot(side) > 0 ? -1 : 1;
    // three-quarter view of the whole drone–tether–rider span from the side opposite the drag bow (a camera
    // behind the drone sits inside the bow, which trails backwards, and makes the 0.3 m eyelet arm look huge)
    const M = D.clone().lerp(pack, 0.45);
    return { pos: M.clone().addScaledVector(side, 9 * sgn).addScaledVector(UP, 2.5), target: D.clone().lerp(pack, 0.72).addScaledVector(UP, 0.3), fov: 52, shot: 'drone-ots' };
  };
  const hipEx = (d.exit | 0) !== 0;
  if (t < 3) { const k = ease(k01(0, 3)); s = hipEx ? { pos: at(-2.4 + 0.3 * k, 2.2, 1.6), target: pack.clone().lerp(P.clone().addScaledVector(UP, 1.2), 0.45), fov: 38, shot: 'carry', dofOn: true } : { pos: at(-1.5 + 0.2 * k, 1.0, 2.05), target: pack.clone().addScaledVector(UP, 0.12), fov: 32, shot: 'carry', dofOn: true }; }
  else if (t < 10) {
    const k = ease(k01(3, 10));
    s = { pos: at((hipEx ? -2.4 : -1.6) - 5.5 * k, (hipEx ? 2.4 : 1.1) + 3.4 * k, (hipEx ? 1.6 : 2.0) + 2.2 * k), target: pack.clone().lerp(D, 0.35 + 0.2 * k), fov: 38 + 6 * k, shot: 'launch', dofOn: k < 0.2 };
  } else if (t < 16) {
    const k = ease(k01(10, 16));
    s = { pos: at(-12 + 2 * k, 6 - 2 * k, 5.5), target: mid.clone().addScaledVector(F, 2), fov: 40, shot: 'follow' };
  } else if (t < 21) s = ots();
  else if (t < 24) { const k = ease(k01(21, 24)); s = { pos: at(-3 + 2 * k, -7.5, 1.6), target: pack.clone().lerp(D, 0.3), fov: 44, shot: 'track-low' }; }
  else if (t < 30) {
    const k = ease(k01(24, 30));
    s = { pos: at(-4 + 2 * k, -14, 3.5), target: pack.clone().lerp(D, 0.4), fov: 44, shot: 'gust-side' };
  } else if (t < 38) {
    const k = ease(k01(30, 38));
    s = { pos: at(10 - 2 * k, -3.5 + 1 * k, 2.4), target: mid.clone().lerp(P.clone().addScaledVector(UP, 1), 0.4), fov: 42, shot: 'side-view' };
  } else if (t < 41) s = ots();
  else if (t < 44) {
    const k = ease(k01(41, 44));
    s = { pos: at(-8, 2.5 - 5 * k, 3.5), target: mid.clone().addScaledVector(F, 2), fov: 42, shot: 'rear' };
  } else if (t < 49) {
    const k = ease(k01(44, 49)); const a = -2.2 + 1.2 * k;
    s = { pos: P.clone().addScaledVector(F, Math.cos(a) * 6.5).addScaledVector(Lf, Math.sin(a) * 6.5).addScaledVector(UP, 2.8), target: mid, fov: 42, shot: 'recall' };
  } else {
    const k = ease(k01(49, 58));
    const tg = pack.clone().lerp(D, 0.5).addScaledVector(UP, 0.05);
    s = { pos: at(-3.6 + 1.6 * k, 2.6 - 1.2 * k, 2.6 - 0.4 * k), target: tg, fov: 40, shot: 'dock', dofOn: k > 0.7 };
  }
  if (s.dofOn) s.dof = { focus: s.pos.distanceTo(s.target), aperture: 0.0012 };
  return s;
}
