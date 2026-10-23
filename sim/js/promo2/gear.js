// SledPack promo v2 gear (browser only), SIM-034 user decisions: the sled kite rides OPEN on a slim back shell
// (no sleeve, no funnel, no pole); a lumbar module holds the two-drum reel, battery and electronics with the line
// exit low at the sacrum; the camera pod rests in a cradle next to the exit; launch = the latch releases and the
// airflow peels the kite off the shell; dock = reeled in low, then laid back onto the shell. Illustrative concept
// geometry for the promo film, not CAD.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { terrainHeight } from '../render/world.js';
import { GEOM } from './timeline.js';

const toV3 = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const basisQuat = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
const sstep = THREE.MathUtils.smoothstep;

// sail texture: u = span (0 left tip … 1 right tip), v = chord (0 trailing … 1 leading edge)
// centre panel between the keels = u 1/3 … 2/3 (white), wings hi-vis orange, small wordmark
function sailTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#ff5a1f'; g.fillRect(0, 0, 1024, 1024);
  const wing = g.createLinearGradient(0, 0, 1024, 0);
  wing.addColorStop(0, 'rgba(0,0,0,0.10)'); wing.addColorStop(0.33, 'rgba(0,0,0,0)'); wing.addColorStop(0.67, 'rgba(0,0,0,0)'); wing.addColorStop(1, 'rgba(0,0,0,0.10)');
  g.fillStyle = wing; g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = '#f6f5f1'; g.fillRect(341, 0, 342, 1024);
  // seams (soft, wide enough not to alias)
  g.fillStyle = 'rgba(20,24,30,0.55)'; g.fillRect(337, 0, 8, 1024); g.fillRect(679, 0, 8, 1024);
  g.fillStyle = 'rgba(255,90,31,0.9)'; g.fillRect(345, 990, 334, 34);
  // wordmark along the chord in the centre panel
  g.save(); g.translate(512, 520); g.rotate(-Math.PI / 2); g.scale(1, -1); // mirrored: reads correctly on the outer face when the kite rides on the back
  g.fillStyle = 'rgba(18,22,28,0.82)'; g.font = '600 46px "Noto Sans CJK SC", sans-serif'; g.textAlign = 'center';
  g.fillText('S L E D P A C K', 0, 16); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function logoTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(230,234,238,0.9)'; g.font = '500 54px "Noto Sans CJK SC", sans-serif'; g.textAlign = 'center';
  g.fillText('S L E D P A C K', 256, 82);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function createPromoGear(scene) {
  const M = (o) => new THREE.MeshPhysicalMaterial(o);
  const mat = {
    shell: M({ color: 0x23282f, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.28, sheen: 0.35, sheenColor: 0x9aa8b8, transparent: true }),
    accent: M({ color: 0xff5a1f, roughness: 0.38, clearcoat: 0.7, transparent: true }),
    seam: M({ color: 0x0e1014, roughness: 0.8, transparent: true }),
    strap: M({ color: 0x16191e, roughness: 0.88, sheen: 0.45, sheenColor: 0x6a7888 }),
    alu: M({ color: 0xc3c9d0, roughness: 0.22, metalness: 0.92 }),
    anod: M({ color: 0xff5a1f, roughness: 0.28, metalness: 0.65, clearcoat: 0.6, side: THREE.DoubleSide }),
    dark: M({ color: 0x101216, roughness: 0.36, metalness: 0.35 }),
    battery: M({ color: 0x2a6df4, roughness: 0.35, metalness: 0.25, clearcoat: 0.5 }),
    pcb: M({ color: 0x0f5132, roughness: 0.5 }),
    sleeve: M({ color: 0xdfe6ee, roughness: 0.08, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }),
    sail: M({ map: sailTexture(), roughness: 0.58, sheen: 0.7, sheenRoughness: 0.5, sheenColor: 0xffffff, side: THREE.DoubleSide }),
    keel: M({ color: 0xff5a1f, roughness: 0.6, sheen: 0.5, sheenColor: 0xffffff, side: THREE.DoubleSide }),
    spar: M({ color: 0x15171b, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }),
    pod: M({ color: 0xf2f2ee, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.08 }),
    glass: M({ color: 0x04060a, roughness: 0.02, clearcoat: 1, iridescence: 0.6 }),
    drogue: M({ color: 0xff3d8a, roughness: 0.6, sheen: 0.5, sheenColor: 0xffffff, side: THREE.DoubleSide }),
    logo: new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, depthWrite: false, toneMapped: true }),
    led: new THREE.MeshStandardMaterial({ color: 0x001a10, emissive: 0x2cff8a, emissiveIntensity: 3 }),
  };
  const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const root = new THREE.Group(); scene.add(root);

  // ------------------------------------------------ back shell + lumbar module (local: x right, y up the spine from the exit, z out of the back)
  const SH = { w: 0.26, h: 0.40, y0: 0.14 };      // thin back plate under the open kite (render; the design seats the keels on the straps)
  const LM = { w: 0.22, h: 0.13, d: 0.06 };       // lumbar module (reel, battery, electronics; promo_facts I9 0.20×0.13×0.055)
  const pack = new THREE.Group(); root.add(pack);
  const plateShape = new THREE.Shape();
  { const w = SH.w / 2, y0 = SH.y0, y1 = SH.y0 + SH.h, r = 0.06;
    plateShape.moveTo(-w + r, y0); plateShape.lineTo(w - r, y0); plateShape.quadraticCurveTo(w, y0, w, y0 + r);
    plateShape.lineTo(w * 0.92, y1 - r); plateShape.quadraticCurveTo(w * 0.9, y1, w * 0.9 - r, y1);
    plateShape.lineTo(-w * 0.9 + r, y1); plateShape.quadraticCurveTo(-w * 0.9, y1, -w * 0.92, y1 - r);
    plateShape.lineTo(-w, y0 + r); plateShape.quadraticCurveTo(-w, y0, -w + r, y0); }
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 4, curveSegments: 20 });
  // gentle curvature to follow the back
  { const pa = plateGeo.attributes.position; for (let k = 0; k < pa.count; k++) { const x = pa.getX(k); pa.setZ(k, pa.getZ(k) + 0.012 - 0.25 * x * x); } plateGeo.computeVertexNormals(); }
  const plate = sh(new THREE.Mesh(plateGeo, mat.shell));
  const plateRim = sh(new THREE.Mesh(new RoundedBoxGeometry(SH.w * 0.6, 0.008, 0.012, 2, 0.003), mat.accent)); plateRim.position.set(0, SH.y0 + SH.h - 0.012, 0.03);
  const clips = [-1, 1].map((s) => { const m = sh(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.018, 0.016, 2, 0.005), mat.dark)); m.position.set(s * 0.11, SH.y0 + SH.h * 0.55, 0.036); return m; });
  const lumbar = sh(new THREE.Mesh(new RoundedBoxGeometry(LM.w, LM.h, LM.d, 5, 0.022), mat.shell)); lumbar.position.set(0, 0.075, 0.03);
  const seam = new THREE.Mesh(new RoundedBoxGeometry(LM.w * 0.9, 0.004, 0.004, 1, 0.0015), mat.seam); seam.position.set(0, 0.11, 0.061);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.0375), mat.logo); logo.position.set(0, 0.065, 0.0612);
  const ledDot = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 16), mat.led); ledDot.position.set(0.085, 0.035, 0.0606);
  // line exit: orange fairlead eyelet + rollers at the bottom of the module, pod cradle beside it
  const eyelet = sh(new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0045, 12, 32), mat.anod)); eyelet.position.set(0, 0.008, 0.045); eyelet.rotation.x = Math.PI / 2 - 0.6;
  const rollerA = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 14), mat.alu)); rollerA.rotation.z = Math.PI / 2; rollerA.position.set(0, 0.016, 0.052);
  const cradle = sh(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.03, 0.03, 3, 0.008), mat.dark)); cradle.position.set(0.065, 0.0, 0.05);
  pack.add(lumbar, seam, logo, ledDot); // no plate in I10: the open kite lies directly on the back, keels in the strap seats
  // hip-belt tab + eyelet ring (I10b) and magnetic keel-nose seats on the shoulder straps
  const tabMesh = sh(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.27, 0.012, 2, 0.005), mat.dark)); root.add(tabMesh);
  const ringMesh = sh(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 12, 32), mat.anod)); root.add(ringMesh);
  const seats = [0, 1].map(() => { const m = sh(new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.02, 0.012, 2, 0.005), mat.accent)); root.add(m); return m; });
  const internals = new THREE.Group(); pack.add(internals); // (no x-ray in v2)

  // harness straps
  const tubeMesh = () => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat.strap); m.castShadow = true; root.add(m); return m; };
  const strapL = tubeMesh(), strapR = tubeMesh(), chestStrap = tubeMesh(), hipL = tubeMesh(), hipR = tubeMesh();
  const tube = (m, pts, r = 0.011) => { m.geometry.dispose(); m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, r, 8, false); m.scale.set(1, 1, 1); };
  const sensor = sh(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.046, 0.015, 3, 0.006), mat.dark)); root.add(sensor);
  const sensorLed = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 16), mat.led); root.add(sensorLed);

  // studio rim light for the product shots (render-only lighting)
  const rim = new THREE.SpotLight(0xdfe9ff, 0, 6, 0.55, 0.6, 1.2); rim.castShadow = false; root.add(rim, rim.target);
  const fill = new THREE.SpotLight(0xffe2c8, 0, 6, 0.7, 0.8, 1.2); fill.castShadow = false; root.add(fill, fill.target);

  // ------------------------------------------------ sled kite (local: +X toward leading edge, +Y windward/bridle side, +Z span)
  const kite = new THREE.Group(); root.add(kite);
  const NX = 14, NI = 8, NO = 8, NZ = 2 * NO + NI; // columns: outer-left NO, inner NI, outer-right NO
  const pos = new Float32Array((NX + 1) * (NZ + 1) * 3), uv = new Float32Array((NX + 1) * (NZ + 1) * 2), idx = [];
  for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
    const k = i * (NZ + 1) + j;
    const uS = j < NO ? (j / NO) / 3 : j <= NO + NI ? 1 / 3 + ((j - NO) / NI) / 3 : 2 / 3 + ((j - NO - NI) / NO) / 3;
    uv[2 * k] = uS; uv[2 * k + 1] = i / NX;
    if (i < NX && j < NZ) { const a = k, b = k + 1, c2 = k + NZ + 1, d2 = c2 + 1; idx.push(a, c2, b, b, c2, d2); }
  }
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sailGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  sailGeo.setIndex(idx);
  const sail = sh(new THREE.Mesh(sailGeo, mat.sail));
  const sparGeo = new THREE.CylinderGeometry(0.003, 0.003, 1, 10);
  const spars = [0, 1].map(() => sh(new THREE.Mesh(sparGeo, mat.spar)));
  // keel fabric: small triangles on the windward side along each keel (bridle attaches at their tips)
  const keelGeo = new THREE.BufferGeometry();
  keelGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  keelGeo.setIndex([0, 1, 2]);
  const keels = [0, 1].map(() => sh(new THREE.Mesh(keelGeo.clone(), mat.keel)));
  kite.add(sail, ...spars, ...keels);
  // pod: hangs 0.12 m below the line at the apex; lens toward the rider
  const podG = new THREE.Group(); root.add(podG);
  const podBody = sh(new THREE.Mesh(new RoundedBoxGeometry(0.035, 0.032, 0.045, 4, 0.011), mat.pod));
  const podBand = new THREE.Mesh(new RoundedBoxGeometry(0.037, 0.006, 0.047, 2, 0.002), mat.accent); podBand.position.y = 0.007;
  const podLens = new THREE.Mesh(new THREE.CircleGeometry(0.0085, 24), mat.glass); podLens.position.z = 0.0228;
  const podRing = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.0018, 8, 24), mat.alu); podRing.position.z = 0.0225;
  podG.add(podBody, podBand, podLens, podRing);
  const hanger = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6), mat.spar)); root.add(hanger);
  // drogue tail cone
  const drogue = sh(new THREE.Mesh(new THREE.CylinderGeometry(GEOM.tailD / 2, 0.012, 0.22, 28, 1, true), mat.drogue)); root.add(drogue);

  // lines (screen-space width; SMAA in the 'promo' post chain smooths them)
  const mk = (color, w, op = 0.95) => { const m = new LineMaterial({ color, linewidth: w, worldUnits: false, transparent: true, opacity: op }); const l = new Line2(new LineGeometry(), m); l.frustumCulled = false; root.add(l); return l; };
  const mainLine = mk(0xff2fa0, 1.5), depLine = mk(0xf2f4f6, 1.15, 0.9), bridleA = mk(0x2a2f36, 1.0, 0.85), bridleB = mk(0x2a2f36, 1.0, 0.85), tailLine = mk(0x2a2f36, 1.0, 0.85);
  const lines = [mainLine, depLine, bridleA, bridleB, tailLine];
  const setLine = (l, pts) => { const a = []; for (const p of pts) a.push(p.x, p.y, p.z); const g = new LineGeometry(); g.setPositions(a); l.geometry.dispose(); l.geometry = g; };
  const sagPts = (a, b, sag, n = 20) => { const out = []; for (let i = 0; i <= n; i++) { const s = i / n; out.push(a.clone().lerp(b, s).add(new THREE.Vector3(0, -sag * 4 * s * (1 - s), 0))); } return out; };

  // build the sail: open 0 folded bundle … 1 flying; flag 0 … 1 depowered/flagging (luffing ripples); t for flutter
  const flare = THREE.MathUtils.degToRad(45);
  const buildSail = (open, flag, onSnow, t, flat = 0) => {
    const c = GEOM.chord * (0.8 + 0.2 * open), b0 = GEOM.span / 6, tipZ = GEOM.span / 2;
    const wscale = 0.06 + 0.94 * open * open; // folding narrows everything toward the keels
    for (let i = 0; i <= NX; i++) {
      const u = i / NX;                 // 0 trailing … 1 leading edge
      const x = (u - 0.5) * c;
      // wing planform: tip at mid-chord, edges back to 0.68 of the tip half-span at LE/TE
      const tipW = u < 0.58 ? 0.3 + 0.7 * Math.sin((u / 0.58) * Math.PI / 2) : 1 - 0.5 * Math.pow((u - 0.58) / 0.42, 1.3);
      const hs = b0 + (tipZ - b0) * tipW;
      for (let j = 0; j <= NZ; j++) {
        let z, y = 0;
        if (j >= NO && j <= NO + NI) {
          const v = (j - NO) / NI * 2 - 1; // −1 … 1 across the centre panel
          z = v * b0;
          y = 0.045 * (1 - v * v) * open * (1 - 0.6 * flag) * (1 - 0.8 * flat) * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.05));
        } else {
          const sgn = j < NO ? -1 : 1;
          const w = j < NO ? 1 - j / NO : (j - NO - NI) / NO; // 0 at keel … 1 at the tip
          const r = (hs - b0) * w;
          const fl = (flare * (0.55 + 0.45 * open) + (1 - open) * 0.9) * (1 - 0.55 * flat); // folded: wings wrap windward; flatter on the back
          z = sgn * (b0 + r * Math.cos(fl) * (0.6 + 0.4 * open));
          y = r * Math.sin(fl) * (1 - 0.75 * onSnow) + 0.02 * Math.sin(Math.PI * w) * open;
        }
        // depower/flag: luffing ripples travelling aft
        y += flag * open * 0.018 * Math.sin(u * 11 - t * 14 + j * 0.35) * (0.4 + 0.6 * (1 - u));
        y += (1 - open) * 0.018 * Math.sin(u * 17 + j * 1.3) * Math.cos(u * 7 - j * 0.6); // crumpled when folded
        const k = (i * (NZ + 1) + j) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z * wscale;
      }
    }
    sailGeo.attributes.position.needsUpdate = true; sailGeo.computeVertexNormals(); sailGeo.computeBoundingSphere();
    for (const [m, s] of [[spars[0], 1], [spars[1], -1]]) {
      m.scale.set(1, c * 0.98, 1); m.rotation.set(0, 0, Math.PI / 2);
      m.position.set(0, -0.004, s * b0 * wscale); // spar sleeves on the leeward face, clear of the fabric
    }
    const kd = 0.07 * open; // keel fabric depth
    keels.forEach((m, n) => {
      const s = n ? -1 : 1, z = s * b0 * wscale;
      const a = m.geometry.attributes.position.array;
      a.set([-c * 0.32, 0.002, z, c * 0.28, 0.002, z, 0.0, kd, z]);
      m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
    });
    return { keelTipY: kd, keelZ: b0 * wscale };
  };

  const out = { anchors: {}, apex: null, pod: null, mouthPos: null, exitDir: null, kiteCenter: null };
  let lastApex = null;
  return {
    out,
    hideInPip: [kite, podG, hanger, drogue, ...lines],
    setVisible(v) { root.visible = v; },
    update(d, ctx) {
      const cv = document.getElementById('gl3d');
      if (cv) for (const l of lines) l.material.resolution.set(cv.width || 1, cv.height || 1);
      const rig = ctx.skier;
      if (!rig || !rig.basis || !rig.pelvisPos) return;
      const B = rig.basis;
      const X = B.torsoX.clone(), Y = B.spineUp.clone(), Zout = B.torsoZ.clone().negate(), Fw = B.torsoZ.clone();
      const base = rig.pelvisPos.clone().addScaledVector(Zout, 0.13).addScaledVector(Y, -0.1);
      pack.position.copy(base); pack.quaternion.copy(basisQuat(X.clone().negate(), Y, Zout)); pack.updateMatrixWorld();
      const wp = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(pack.matrixWorld);
      const pc = wp(0, SH.y0 + SH.h * 0.45, 0.04);
      // magnetic keel-nose seats on the shoulder straps
      { const sho0 = rig.shoulders || {}; [['L', 0], ['R', 1]].forEach(([k, n]) => { if (sho0[k]) { seats[n].position.copy(rig.pelvisPos).addScaledVector(X, (k === 'L' ? 1 : -1) * 0.1).addScaledVector(Y, 0.335).addScaledVector(Zout, 0.2); seats[n].quaternion.copy(basisQuat(X, Y, Fw)); } }); }
      // harness
      const sho = rig.shoulders || {};
      for (const [m, sg, key] of [[strapL, 1, 'L'], [strapR, -1, 'R']]) {
        const shp = sho[key] ? sho[key].clone().addScaledVector(X, -sg * 0.075) : wp(-sg * 0.12, 0.6, -0.1);
        tube(m, [
          wp(-sg * 0.06, SH.y0 + SH.h - 0.03, 0.0),
          shp.clone().addScaledVector(Y, 0.07).addScaledVector(Fw, -0.04),
          shp.clone().addScaledVector(Y, 0.02).addScaledVector(Fw, 0.12),
          shp.clone().addScaledVector(Y, -0.2).addScaledVector(Fw, 0.135).addScaledVector(X, -sg * 0.02),
          shp.clone().addScaledVector(Y, -0.33).addScaledVector(Fw, 0.07).addScaledVector(X, sg * 0.06),
          wp(-sg * 0.1, 0.14, 0.0),
        ], 0.011);
      }
      if (sho.L && sho.R) {
        const a = sho.L.clone().addScaledVector(Y, -0.14).addScaledVector(Fw, 0.135).addScaledVector(X, -0.08);
        const b = sho.R.clone().addScaledVector(Y, -0.14).addScaledVector(Fw, 0.135).addScaledVector(X, 0.08);
        tube(chestStrap, [a, a.clone().lerp(b, 0.5).addScaledVector(Fw, 0.02), b], 0.006);
      }
      const pel = rig.pelvisPos.clone();
      for (const [m, sg] of [[hipL, 1], [hipR, -1]]) {
        tube(m, [wp(-sg * 0.1, 0.08, 0.0), pel.clone().addScaledVector(Y, 0.08).addScaledVector(X, sg * 0.175).addScaledVector(Fw, 0.03), pel.clone().addScaledVector(Y, 0.07).addScaledVector(X, sg * 0.09).addScaledVector(Fw, 0.17)], 0.015);
      }
      const sensP = sho.L ? sho.L.clone().addScaledVector(X, -0.075).addScaledVector(Y, -0.12).addScaledVector(Fw, 0.145) : pc.clone();
      sensor.position.copy(sensP); sensor.quaternion.copy(basisQuat(X, Y, Fw));
      sensorLed.position.copy(sensP).addScaledVector(Fw, 0.0082).addScaledVector(Y, 0.012); sensorLed.quaternion.copy(basisQuat(X, Y, Fw));
      const ledHex = d.led === 'charge' ? 0x3aa0ff : d.led === 'amber' ? 0xffb020 : 0x2cff8a;
      mat.led.emissive.setHex(ledHex); mat.led.emissiveIntensity = d.ledI ?? 3;
      const rI = d.rim || 0;
      rim.intensity = 14 * rI; fill.intensity = 5 * rI;
      rim.position.copy(pc).addScaledVector(Zout, -0.4).addScaledVector(Y, 1.1).addScaledVector(X, 0.9); rim.target.position.copy(pc);
      fill.position.copy(pc).addScaledVector(Zout, 1.4).addScaledVector(Y, 0.3).addScaledVector(X, -1.0); fill.target.position.copy(pc);
      rim.target.updateMatrixWorld(); fill.target.updateMatrixWorld();

      // ------------------------------------------------ line exit at the bottom of the lumbar module (down and back)
      const ax = THREE.MathUtils.degToRad(35);
      const exitDir = Zout.clone().multiplyScalar(Math.cos(THREE.MathUtils.degToRad(20))).addScaledVector(Y, Math.sin(THREE.MathUtils.degToRad(20))).normalize(); // dock axis: backward, 20° up
      // I10b: line eyelet on a short stiff tab on the hip belt behind the buttocks (0.30 m behind / 0.35 m below the pelvis point)
      const lipP = rig.pelvisPos.clone().addScaledVector(Zout, 0.30).addScaledVector(Y, -0.35);
      tabMesh.position.copy(rig.pelvisPos.clone().addScaledVector(Zout, 0.2).addScaledVector(Y, -0.25)); tabMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lipP.clone().sub(rig.pelvisPos.clone().addScaledVector(Zout, 0.11).addScaledVector(Y, -0.16)).normalize());
      ringMesh.position.copy(lipP); ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), exitDir);
      const ks = d.kite;
      const L = ks.L, stow = ks.stow;
      let dir = toV3(ks.dir).normalize();
      if (L < 0.6) dir = exitDir.clone().lerp(dir, sstep(L, 0.0, 0.6)).normalize();
      let apex = lipP.clone().addScaledVector(dir, Math.max(0, L));
      const ground = terrainHeight(apex.x, -apex.z, ctx.tanS) + 0.03;
      if (apex.y < ground) apex.y = ground;
      const open = ks.open, flag = ks.depower, snow = ks.onSnow ? 1 : 0;
      const kInfo = buildSail(open, flag * (1 - stow), snow * (1 - stow), ctx.t || 0, stow);
      let lineDir = L >= 0.05 ? apex.clone().sub(lipP).normalize() : exitDir.clone();
      const outward = lineDir.clone();
      // flying pose: sail ⟂ line, leading edge up, pitched by the angle of attack
      const Yw = outward.clone().negate();
      let Zs = new THREE.Vector3().crossVectors(outward, new THREE.Vector3(0, 1, 0));
      if (Zs.lengthSq() < 1e-4) Zs = X.clone(); Zs.normalize();
      let Xs = new THREE.Vector3().crossVectors(Yw, Zs).normalize();
      if (Xs.y < 0) { Xs.negate(); Zs.negate(); }
      const aoa = THREE.MathUtils.degToRad(24 - 20 * flag);
      const q = new THREE.Quaternion().setFromAxisAngle(Zs, -aoa);
      const XsA = Xs.clone().applyQuaternion(q), YwA = Yw.clone().applyQuaternion(q);
      const Xf = outward.clone().negate();
      const Yf = Zs.clone().cross(Xf).normalize();
      const w = open * (1 - 0.85 * flag);
      let kx = Xf.clone().lerp(XsA, w).normalize();
      let ky = Yf.clone().lerp(YwA, w); ky.addScaledVector(kx, -ky.dot(kx)).normalize();
      if (snow) { ky.lerp(new THREE.Vector3(0, 1, 0), 0.7); ky.addScaledVector(kx, -ky.dot(kx)).normalize(); }
      const bridleLen = GEOM.bridle * w + (GEOM.chord * 0.5 + 0.04) * (1 - w);
      let center = apex.clone().addScaledVector(outward, bridleLen);
      if (snow) center.y = Math.max(center.y, terrainHeight(center.x, -center.z, ctx.tanS) + 0.05);
      // stowed pose: lying open on the shell, leading edge up the spine, bridle side toward the back
      if (stow > 0) {
        const sc = rig.pelvisPos.clone().addScaledVector(Zout, 0.22).addScaledVector(Y, 0.10); // I10: sail centre ≈0.30–0.35 m above the eyelet, nose at the strap seats
        const s = sstep(stow, 0, 1);
        center = center.clone().lerp(sc, s);
        const kxS = Y.clone(), kyS = Zout.clone().negate();
        kx = kx.clone().lerp(kxS, s).normalize();
        ky = ky.clone().lerp(kyS, s); ky.addScaledVector(kx, -ky.dot(kx)).normalize();
      }
      const kz = new THREE.Vector3().crossVectors(kx, ky).normalize();
      kite.position.copy(center); kite.quaternion.copy(basisQuat(kx, ky, kz)); kite.updateMatrixWorld();
      kite.visible = true;
      // pod: in its cradle when on the back; hangs 0.12 m below the line at the apex in flight
      const cradleP = lipP.clone(); // the bridle apex + pod seat in the eyelet when the kite is on the back
      const below = new THREE.Vector3(0, -1, 0).addScaledVector(lineDir, lineDir.y).normalize();
      const hang = 0.12 * sstep(L, 0.15, 0.7);
      let podP = apex.clone().addScaledVector(below, hang);
      if (podP.y < ground + 0.02) podP.y = ground + 0.02;
      const inCradle = 1 - sstep(L, 0.0, 0.35);
      podP = podP.clone().lerp(cradleP, inCradle);
      podG.position.copy(podP);
      const look = rig.pelvisPos.clone().add(new THREE.Vector3(0, 0.35, 0));
      const pz = L > 0.4 ? look.clone().sub(podP).normalize() : Zout.clone();
      let px = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), pz); if (px.lengthSq() < 1e-6) px.copy(X); px.normalize();
      const py = new THREE.Vector3().crossVectors(pz, px).normalize();
      podG.quaternion.copy(basisQuat(px, py, pz));
      hanger.visible = hang > 0.01;
      if (hanger.visible) { hanger.position.copy(apex).lerp(podP, 0.5); hanger.scale.set(1, Math.max(0.01, apex.distanceTo(podP)), 1); hanger.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), podP.clone().sub(apex).normalize()); }
      // bridle from the keel tips to the apex (or to the cradle when stowed); trailing edge for depower + tail
      const apexB = apex.clone().lerp(cradleP, inCradle);
      const tipL = new THREE.Vector3(0.0, kInfo.keelTipY, kInfo.keelZ).applyMatrix4(kite.matrixWorld);
      const tipR = new THREE.Vector3(0.0, kInfo.keelTipY, -kInfo.keelZ).applyMatrix4(kite.matrixWorld);
      const te = new THREE.Vector3(-GEOM.chord * 0.48, 0.0, 0).applyMatrix4(kite.matrixWorld);
      const showLines = L > 0.03;
      mainLine.visible = depLine.visible = showLines;
      bridleA.visible = bridleB.visible = true;
      if (showLines) {
        const sag = L > 2 ? 0.012 * L * (0.5 + 0.5 * flag) : 0;
        setLine(mainLine, sagPts(lipP, apex, sag));
        setLine(depLine, sagPts(lipP.clone().addScaledVector(X, 0.01), te, sag * 1.1));
      }
      setLine(bridleA, [tipL, apexB]); setLine(bridleB, [tipR, apexB]);
      // drogue tail: tucked along the shell when stowed, streaming in flight
      const tailOut = 1 - stow;
      drogue.visible = tailLine.visible = tailOut > 0.02;
      if (drogue.visible) {
        const grow = sstep(L, 0.2, 1.4);
        let tdir = outward.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, -0.35 - 0.4 * flag, 0)).normalize();
        const tEnd = te.clone().addScaledVector(tdir, GEOM.tailLen * Math.max(0.15, grow));
        const gT = terrainHeight(tEnd.x, -tEnd.z, ctx.tanS) + 0.06;
        if (tEnd.y < gT) tEnd.y = gT;
        tdir = tEnd.clone().sub(te).normalize();
        setLine(tailLine, [te, tEnd]);
        drogue.position.copy(tEnd).addScaledVector(tdir, 0.11);
        drogue.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tdir);
        drogue.scale.set(0.35 + 0.65 * grow, 1, 0.35 + 0.65 * grow);
      }
      lastApex = apex.clone();
      out.apex = apex; out.pod = podP; out.packBack = Zout.clone(); out.packCenter = pc.clone(); out.mouthPos = lipP; out.exitDir = exitDir; out.kiteCenter = center; out.podFwd = pz;
      out.anchors = {
        pack: wp(0.0, SH.y0 + SH.h * 0.75, 0.07), kiteOnBack: wp(-0.08, SH.y0 + SH.h * 0.55, 0.09), lumbar: wp(-0.06, 0.08, 0.06), mouth: lipP.clone(),
        cradle: cradleP.clone(), seat: seats[0].position.clone(), sensor: sensP.clone(), kite: center.clone(), pod: podP.clone(),
        mainMid: lipP.clone().lerp(apex, 0.45), depMid: lipP.clone().lerp(te, 0.62),
      };
    },
  };
}
