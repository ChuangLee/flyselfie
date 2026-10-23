// Photoreal environment: physical sky (Preetham) as background and image-based
// light, matched sun with soft shadows, PBR snow slope with world-space
// texturing and sparkle, piste banks opening into a valley, instanced
// snow-laden conifers, distant ridgelines with aerial perspective.
// Model coordinates (x downslope, y left, z up) map to three.js as (x, z, −y).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const toV = (p, out = new THREE.Vector3()) => out.set(p[0], p[2], -p[1]);

// ---- deterministic noise -----------------------------------------------------
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Terrain height (model coords). Exactly the planar slope inside the piste
// corridor (|y| < 22 m) so the rendered snow matches the solver's surface.
export function terrainHeight(x, y, tanS) {
  const e = Math.max(0, Math.abs(y) - 22);
  // the piste runs down a broad open mountain face: gentle side banks, then
  // large rolling spurs and gullies
  const bank = 0.14 * e * smooth(0, 60, e) + 0.03 * e * smooth(300, 3000, e);
  const rolls = fbm(x * 0.012, y * 0.012, 4) * 5 * smooth(4, 50, e) + fbm(x * 0.0016 + 3.1, y * 0.0016, 4) * 140 * smooth(200, 1200, e);
  const micro = fbm(x * 0.09, y * 0.09, 3) * 0.35 * smooth(0, 12, e);
  // the run eases out into a valley floor far below
  const X0 = 900;
  const base = x < X0 ? -x * tanS : -X0 * tanS - (x - X0) * tanS * Math.exp(-(x - X0) / 700);
  return base + bank + rolls + micro;
}

// ---- snow material ---------------------------------------------------------------
function snowMaterial(tex, aniso) {
  const load = (f, srgb) => {
    const t = tex.load(f);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const mat = new THREE.MeshStandardMaterial({
    map: load('assets/textures/snow_02_diff_2k.jpg', true),
    normalMap: load('assets/textures/snow_02_nor_gl_2k.jpg'),
    roughnessMap: load('assets/textures/snow_02_rough_2k.jpg'),
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughness: 1.0,
    color: new THREE.Color(1.0, 1.0, 1.0),
  });
  mat.userData.uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = mat.userData.uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uTime;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`)
      // break up tiling: second texture scale + low-frequency tone variation
      .replace('#include <map_fragment>', `
vec2 wuv = vWPos.xz / 3.0;
vec4 t1 = texture2D(map, wuv);
vec4 t2 = texture2D(map, wuv * 0.173 + vec2(0.37, 0.71));
float macro = vn(vWPos.xz * 0.035) * 0.6 + vn(vWPos.xz * 0.11) * 0.4;
vec4 sampledDiffuseColor = mix(t1, t2, 0.45);
sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(1.0), 0.3) * (0.86 + 0.14 * macro);
sampledDiffuseColor.rgb *= vec3(0.985, 0.995, 1.02);
diffuseColor *= sampledDiffuseColor;`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
vec4 texelRoughness = texture2D(roughnessMap, vWPos.xz / 3.0);
roughnessFactor *= mix(0.62, 0.95, texelRoughness.g);`)
      .replace('#include <normal_fragment_maps>', `
vec3 mapN = texture2D(normalMap, vWPos.xz / 3.0).xyz * 2.0 - 1.0;
vec3 mapN2 = texture2D(normalMap, vWPos.xz / 0.9 + 0.5).xyz * 2.0 - 1.0;
mapN = normalize(mapN + mapN2 * 0.6 + vec3((vn(vWPos.xz*vec2(0.9,2.6))-0.5)*0.5, 0.0, 0.0));
mapN.xy *= normalScale;
normal = normalize(tbn * mapN);`)
      // crystal glints: sparse cells that flash with view direction
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 V = normalize(cameraPosition - vWPos);
  vec2 cell = floor(vWPos.xz * 55.0);
  float r = h21(cell);
  float flick = h21(cell + floor(V.xz * 40.0) + 3.7);
  float dist = length(cameraPosition - vWPos);
  float glint = step(0.998, r) * step(0.6, flick) * smoothstep(40.0, 6.0, dist);
  totalEmissiveRadiance += vec3(1.0, 0.98, 0.94) * glint * 3.5;
}`);
  };
  // the replaced chunks above need their usual uv-less inputs
  mat.defines = { USE_UV: '' };
  return mat;
}

// ---- trees -----------------------------------------------------------------------------
function conifer(tiers = 9, seg = 16, rows = 3, fine = false) {
  const parts = [];
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1);
    const r = 0.40 * (1 - f) + 0.04, h = 0.2 - 0.07 * f, y = 0.08 + f * 0.84;
    const g = new THREE.ConeGeometry(r, h, seg, rows, true);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const px = pos.getX(k), py = pos.getY(k), pz = pos.getZ(k);
      const ang = Math.atan2(pz, px);
      const down = 0.5 - py / h; // 0 at tip, 1 at skirt
      // branch tips: jagged radius by angle, drooping skirt
      const jag = fine
        // promo (SIM-033): many branch tips per tier, ragged and slightly upturned at the skirt
        ? 1 + down * (0.18 * Math.sin(ang * 13 + i * 1.7) + 0.12 * Math.sin(ang * 29 + i * 3.1) + 0.2 * noise2(ang * 5 + i * 5.1, i * 2.3))
        : 1 + down * (0.22 * Math.sin(ang * 7 + i * 1.7) + 0.16 * noise2(ang * 3 + i * 5.1, i * 2.3));
      pos.setXYZ(k, px * jag, py - down * down * 0.06 * (1 - f * 0.5), pz * jag);
    }
    g.computeVertexNormals();
    g.translate(0, y, 0);
    parts.push(g);
  }
  const trunk = new THREE.CylinderGeometry(0.018, 0.032, 0.3, Math.max(5, seg / 2));
  trunk.translate(0, 0.1, 0);
  parts.push(trunk);
  const merged = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; }));
  const col = new Float32Array(merged.attributes.position.count * 3);
  const nrm = merged.attributes.normal, p = merged.attributes.position;
  const nTrunk = trunk.attributes.position.count;
  for (let k = 0; k < p.count; k++) {
    if (k >= p.count - nTrunk) { col[k * 3] = 0.09; col[k * 3 + 1] = 0.065; col[k * 3 + 2] = 0.05; continue; }
    const up = nrm.getY(k);
    const nz = noise2(p.getX(k) * 17 + p.getY(k) * 5, p.getZ(k) * 17);
    const snow = fine ? THREE.MathUtils.clamp((up - 0.55) * 2.0 + 0.55 * nz, 0, 1) * 0.85 : THREE.MathUtils.clamp((up - 0.35) * 2.4 + 0.45 * nz, 0, 1);
    const g0 = fine ? [0.03 + 0.02 * nz, 0.075 + 0.03 * nz, 0.045] : [0.025, 0.06, 0.035], s0 = [0.86, 0.9, 0.96];
    for (let c = 0; c < 3; c++) col[k * 3 + c] = g0[c] + (s0[c] - g0[c]) * snow;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return merged;
}

// ---- distant ridges ------------------------------------------------------------------
function ridges(tanS) {
  const geoms = [];
  const ringN = 10;
  for (let i = 0; i < ringN; i++) {
    const ang = (i / ringN) * Math.PI * 2 + 0.2;
    const dist = 5200 + 1800 * hash2(i, 7);
    const w = 5200, d = 1800;
    const g = new THREE.PlaneGeometry(w, d, 160, 56);
    g.rotateX(-Math.PI / 2);
    const local = g.attributes.position.array.slice();
    const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
    g.rotateY(-ang + Math.PI / 2);
    g.translate(cx, 0, cz);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = local[k * 3], z = local[k * 3 + 2];
      const across = 1 - Math.abs(z) / (d / 2);
      let ridged = 0, amp = 1, fq = 0.00055, wsum = 0;
      for (let o = 0; o < 6; o++) { ridged += amp * Math.pow(1 - Math.abs(noise2(x * fq + i * 13 + o * 7.1, z * fq * 1.4 + o * 3.3)), 2); wsum += amp; amp *= 0.48; fq *= 2.05; }
      ridged /= wsum;
      const h = Math.pow(ridged, 1.7) * 2000 * Math.pow(Math.max(0, across), 0.6) * (0.6 + 0.4 * hash2(i, 3));
      // seat every vertex on the terrain beneath it so nothing floats
      pos.setY(k, terrainHeight(pos.getX(k), -pos.getZ(k), tanS) - 60 + h);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const steep = 1 - nrm.getY(k);
      const rock = THREE.MathUtils.smoothstep(steep + 0.12 * noise2(pos.getX(k) * 0.01, pos.getZ(k) * 0.01), 0.3, 0.45);
      const snow = 1 - rock;
      col[k * 3] = 0.16 + 0.78 * snow; col[k * 3 + 1] = 0.17 + 0.78 * snow; col[k * 3 + 2] = 0.19 + 0.79 * snow;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geoms.push(g);
  }
  return mergeGeometries(geoms);
}

// ---- world -------------------------------------------------------------------------------
// high cirrus / fair-weather cumulus on a large dome: fbm coverage, sun-side
// silver lining and blue-shadowed bases; drifts slowly on the shared timeline
function cloudLayer(sunDir) {
  const g = new THREE.SphereGeometry(8200, 64, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: sunDir.clone() }, uCovLo: { value: 0.5 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform float uCovLo; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a*n(p); p = p*2.03 + 1.7; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        if (d.y < 0.015) discard;
        vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
        float cu = fbm(uv * 1.3 + 3.0);
        float ci = fbm(vec2(uv.x * 0.5, uv.y * 3.2) + 11.0);
        float cov = smoothstep(uCovLo, uCovLo + 0.22, cu);
        float cirrus = smoothstep(0.55, 0.85, ci) * 0.35;
        float a = max(cov, cirrus) * smoothstep(0.015, 0.12, d.y);
        float sunAmt = pow(max(dot(d, normalize(uSun)), 0.0), 6.0);
        float thick = smoothstep(0.6, 0.95, cu);
        vec3 lit = vec3(1.0, 0.98, 0.95) * (1.25 + 1.2 * sunAmt);
        vec3 base = vec3(0.62, 0.68, 0.78);
        vec3 col = mix(lit, base, thick * 0.65);
        // polariser-like deepening of the clear sky away from the sun and horizon
        float pol = 0.42 * smoothstep(0.03, 0.55, d.y) * (1.0 - 0.8 * pow(max(dot(d, normalize(uSun)), 0.0), 3.0));
        vec3 deep = vec3(0.13, 0.3, 0.68);
        float ca = a * 0.95;
        float outA = ca + pol * (1.0 - ca);
        vec3 outC = (col * 1.35 * ca + deep * pol * (1.0 - ca)) / max(outA, 1e-4);
        gl_FragColor = vec4(outC, outA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1;
  m.frustumCulled = false;
  m.onBeforeRender = (r, sc, cam) => m.position.copy(cam.position);
  return m;
}

export class World {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.tanS = null;
    this.sunDir = new THREE.Vector3(0.4, 0.6, 0.3).normalize();
  }

  async init(quality) {
    const { scene, renderer } = this;
    // physical sky; sun behind-left of the downhill direction: raking light, blue sky downhill
    const elev = THREE.MathUtils.degToRad(29), azim = Math.atan2(0.8, -0.38);
    this.sunDir.set(Math.cos(elev) * Math.cos(azim), Math.sin(elev), -Math.cos(elev) * Math.sin(azim)).normalize();
    const sky = new Sky();
    sky.scale.setScalar(18000);
    const u = sky.material.uniforms;
    u.turbidity.value = 1.25; u.rayleigh.value = 2.4; u.mieCoefficient.value = 0.0026; u.mieDirectionalG.value = 0.88;
    u.sunPosition.value.copy(this.sunDir);
    scene.add(sky);
    this.sky = sky;
    this.clouds = cloudLayer(this.sunDir);
    if (quality === 'promo') this.clouds.material.uniforms.uCovLo.value = 0.6; // cleaner sky for the promo film
    scene.add(this.clouds);
    // image-based light from the same sky
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(1000);
    Object.assign(envSky.material.uniforms.sunPosition.value, this.sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = u[k].value;
    envScene.add(envSky);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.58, 0.62) }));
    ground.position.y = -20;
    envScene.add(ground);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.5;
    scene.fog = new THREE.FogExp2(new THREE.Color(0.66, 0.76, 0.9), 0.00011);
    await Promise.resolve();

    const light = new THREE.DirectionalLight(new THREE.Color(1.0, 0.94, 0.85), 3.9);
    light.castShadow = true;
    const sm = quality === 'ultra' ? 4096 : quality === 'high' || quality === 'promo' ? 2048 : 1024;
    light.shadow.mapSize.set(sm, sm);
    const sc = light.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 80;
    light.shadow.bias = -0.0002;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 3;
    scene.add(light, light.target);
    this.sun = light;
    this.snowMat = snowMaterial(new THREE.TextureLoader(), renderer.capabilities.getMaxAnisotropy());

    const treeGeo = quality === 'promo' ? conifer(12, 22, 3, true) : conifer();
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.trees = new THREE.InstancedMesh(treeGeo, this.treeMat, quality === 'low' || quality === 'promo' ? 700 : 1400);
    this.trees.castShadow = false; // tight hero shadow frustum; tree shadows would clip at its edges
    this.trees.receiveShadow = true;
    scene.add(this.trees);
    // distant forest: low-poly LOD of the same tree
    this.farTreeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, color: new THREE.Color(0.42, 0.5, 0.5) });
    this.farTrees = new THREE.InstancedMesh(quality === 'promo' ? conifer(5, 9, 1, true) : conifer(4, 7, 1), this.farTreeMat, quality === 'low' || quality === 'promo' ? 1500 : 4000);
    scene.add(this.farTrees);
    this.ridgeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.7 });
  }

  // (re)build slope-dependent geometry
  setSlope(tanS) {
    if (this.tanS !== null && Math.abs(this.tanS - tanS) < 1e-6) return;
    this.tanS = tanS;
    const { scene } = this;
    if (this.terrain) { scene.remove(this.terrain); this.terrain.geometry.dispose(); }
    if (this.ridge) { scene.remove(this.ridge); this.ridge.geometry.dispose(); }
    const x0 = -180, x1 = 680, y0 = -260, y1 = 260;
    const nx = 344, ny = 208;
    const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, nx, ny);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const mx = pos.getX(k) + (x0 + x1) / 2, my = pos.getY(k) + (y0 + y1) / 2;
      pos.setXYZ(k, mx, terrainHeight(mx, my, tanS), -my);
    }
    g.computeVertexNormals();
    this.terrain = new THREE.Mesh(g, this.snowMat);
    this.terrain.receiveShadow = true;
    scene.add(this.terrain);

    // trees on the banks, never in the piste corridor
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0, tries = 0;
    while (n < this.trees.count && tries < 20000) {
      tries++;
      const mx = x0 + 30 + hash2(tries, 1.3) * (x1 - x0 - 60);
      const side = hash2(tries, 2.1) < 0.5 ? -1 : 1;
      const my = side * (38 + Math.pow(hash2(tries, 3.7), 1.6) * 190);
      const cluster = noise2(mx * 0.02, my * 0.02);
      if (cluster < -0.15 && Math.abs(my) > 30) continue;
      const hgt = 7 + hash2(tries, 4.9) * 11;
      p.set(mx, terrainHeight(mx, my, tanS) - 0.3, -my);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(tries, 5.5) * Math.PI * 2);
      s.set(hgt * (0.85 + 0.3 * hash2(tries, 6.1)), hgt, hgt * (0.85 + 0.3 * hash2(tries, 7.3)));
      m.compose(p, q, s);
      this.trees.setMatrixAt(n++, m);
    }
    this.trees.count = n;
    this.trees.instanceMatrix.needsUpdate = true;
    this.trees.computeBoundingSphere();

    this.ridge = new THREE.Mesh(ridges(tanS), this.ridgeMat);
    scene.add(this.ridge);

    // coarse far terrain to the horizon, tucked below the detailed slope
    if (this.far) { scene.remove(this.far); this.far.geometry.dispose(); }
    const fx0 = -9500, fx1 = 9500, fy0 = -9500, fy1 = 9500;
    const fg = new THREE.PlaneGeometry(fx1 - fx0, fy1 - fy0, 240, 240);
    const fpos = fg.attributes.position;
    for (let k = 0; k < fpos.count; k++) {
      const mx = fpos.getX(k) + (fx0 + fx1) / 2, my = fpos.getY(k) + (fy0 + fy1) / 2;
      const inside = mx > x0 + 10 && mx < x1 - 10 && my > y0 + 10 && my < y1 - 10;
      fpos.setXYZ(k, mx, terrainHeight(mx, my, tanS) - (inside ? 8 : 1.2), -my);
    }
    fg.computeVertexNormals();
    this.far = new THREE.Mesh(fg, this.snowMat);
    this.far.receiveShadow = false;
    scene.add(this.far);
    let fn = 0;
    for (let tries = 0; tries < 30000 && fn < this.farTrees.count; tries++) {
      const mx = -400 + hash2(tries, 8.1) * 2600;
      const my = (hash2(tries, 9.3) < 0.5 ? -1 : 1) * (240 + Math.pow(hash2(tries, 10.7), 1.3) * 1100);
      if (noise2(mx * 0.004, my * 0.004) < -0.1) continue;
      const hgt = 9 + hash2(tries, 11.9) * 12;
      p.set(mx, terrainHeight(mx, my, tanS) - 0.5, -my);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(tries, 12.5) * Math.PI * 2);
      s.set(hgt * 0.9, hgt, hgt * 0.9);
      m.compose(p, q, s);
      this.farTrees.setMatrixAt(fn++, m);
    }
    this.farTrees.count = fn;
    this.farTrees.instanceMatrix.needsUpdate = true;
    this.farTrees.computeBoundingSphere();
  }

  // keep the shadow frustum centred on the action
  follow(target) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 40);
    this.sun.target.updateMatrixWorld();
  }

  tick(t) {
    this.snowMat.userData.uniforms.uTime.value = t;
    if (this.clouds) this.clouds.material.uniforms.uTime.value = t;
  }
}

