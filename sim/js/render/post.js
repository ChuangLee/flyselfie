// Cinematic post chain, in-frame evidence HUD, and the onboard fisheye renderer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// display-space grade: split-tone, gentle S-curve, chromatic fringe, vignette,
// temporal grain and optional letterbox
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uLetterbox: { value: 0 }, uAspect: { value: 1.7 },
    uGrain: { value: 0.035 }, uVignette: { value: 0.28 }, uCA: { value: 0.0012 }, uCurve: { value: 0.36 }, uSat: { value: 1.16 }, uTone: { value: 0.0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uLetterbox, uAspect, uGrain, uVignette, uCA, uCurve, uSat, uTone; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c,c);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - c * uCA * r2 * 8.0).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + c * uCA * r2 * 8.0).b;
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(col, col * vec3(0.93,0.98,1.07), 1.0 - smoothstep(0.0, 0.6, l));  // cool shadows
      col = mix(col, col * vec3(1.01,1.0,0.985), smoothstep(0.6, 1.0, l));        // neutral-warm highlights
      col = mix(col, col*col*(3.0-2.0*col), uCurve);                               // S-curve
      col = mix(vec3(l), col, uSat);                                               // a touch of saturation
      col += uTone * (vec3(-0.012, 0.004, 0.022) * (1.0 - smoothstep(0.0, 0.5, l)) + vec3(0.018, 0.008, -0.012) * smoothstep(0.55, 1.0, l)); // teal shadows / warm highlights
      col *= 1.0 - uVignette * smoothstep(0.15, 0.75, r2 * 1.6);
      col += (h(vUv * 1000.0 + fract(uTime) * 91.0) - 0.5) * uGrain;
      if (uLetterbox > 0.0) {
        float target = 2.39;
        float bar = max(0.0, (1.0 - uAspect / target) * 0.5);
        if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality === 'low' || quality === 'film' || quality === 'promo' ? 0 : 4 }); // 'film'/'promo': offline promo renders (no MSAA)
    this.composer = new EffectComposer(renderer, rt);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    if (quality === 'ultra') {
      this.ao = new GTAOPass(scene, camera, size.x, size.y);
      this.ao.output = GTAOPass.OUTPUT.Default;
      this.ao.blendIntensity = 0.75;
      this.composer.addPass(this.ao);
    }
    this.bokeh = new BokehPass(scene, camera, { focus: 8, aperture: 0.0015, maxblur: 0.008 });
    this.bokeh.enabled = false;
    if (quality !== 'low') this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.5, 0.93);
    if (quality !== 'low' && quality !== 'promo') this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // 'promo' (SIM-033 offline film): SMAA instead of MSAA, firmer grade, light grain
    if (quality === 'promo') this.composer.addPass(new SMAAPass(size.x, size.y));
    this.grade = new ShaderPass(GradeShader);
    if (quality === 'promo') Object.assign(this.grade.uniforms, { uGrain: { value: 0.012 }, uCurve: { value: 0.46 }, uSat: { value: 1.22 }, uTone: { value: 1.0 }, uVignette: { value: 0.34 } });
    this.composer.addPass(this.grade);
  }
  setSize(w, h) {
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
  }
  setCamera(camera) {
    this.render.camera = camera;
    if (this.bokeh) this.bokeh.camera = camera;
    if (this.ao) this.ao.camera = camera;
  }
  frame(t, opts) {
    this.grade.uniforms.uTime.value = t;
    this.grade.uniforms.uLetterbox.value = opts.letterbox ? 1 : 0;
    const dof = opts.dof && this.composer.passes.includes(this.bokeh);
    this.bokeh.enabled = !!dof;
    if (dof) {
      this.bokeh.uniforms.focus.value = opts.dof.focus;
      this.bokeh.uniforms.aperture.value = opts.dof.aperture;
      this.bokeh.uniforms.maxblur.value = 0.01;
    }
    this.composer.render();
  }
}

// HUD drawn into the frame itself so labels survive screenshots and recordings.
export class HUD {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, toneMapped: false }));
    this.scene.add(this.quad);
    this.sig = '';
  }
  draw(w, h, d) {
    const sig = JSON.stringify([w, h, d]);
    if (sig === this.sig) return;
    this.sig = sig;
    const c = this.canvas;
    if (c.width !== w || c.height !== h) {
      // a resized canvas needs a fresh texture (sub-image upload would overflow)
      c.width = w; c.height = h;
      this.tex.dispose();
      this.tex = new THREE.CanvasTexture(c);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.quad.material.map = this.tex;
      this.quad.material.needsUpdate = true;
    }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const s = h / 900;
    const bar = d.letterbox ? Math.max(0, (1 - (w / h) / 2.39) * 0.5) * h : 0;
    const font = (px, wt = 500) => `${wt} ${Math.round(px * s)}px "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    // evidence tag (always)
    g.font = font(15, 600);
    const tag = d.evidence;
    const tw = g.measureText(tag).width;
    g.fillStyle = 'rgba(10,14,20,0.55)';
    g.fillRect(18 * s, bar + 16 * s, tw + 24 * s, 30 * s);
    g.fillStyle = d.tagColor || '#ffd27a';
    g.fillText(tag, 30 * s, bar + 37 * s);
    if (d.sub) { g.font = font(12); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(d.sub, 30 * s, bar + 62 * s); }
    // demonstration banner (mandatory while G-MATURE is closed)
    if (d.banner) {
      g.font = font(17, 700);
      const bw = g.measureText(d.banner).width;
      const y = h - bar - 28 * s;
      g.fillStyle = 'rgba(176,96,0,0.88)';
      g.fillRect(w / 2 - bw / 2 - 18 * s, y - 24 * s, bw + 36 * s, 34 * s);
      g.fillStyle = '#fff';
      g.fillText(d.banner, w / 2 - bw / 2, y);
    }
    // lower third: stage title
    if (d.title && d.titleAlpha > 0.01) {
      g.globalAlpha = d.titleAlpha;
      const y = h - bar - 96 * s;
      g.fillStyle = '#f2581f';
      g.fillRect(40 * s, y - 34 * s, 5 * s, 52 * s);
      g.font = font(30, 700); g.fillStyle = '#fff';
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 12 * s;
      g.fillText(d.title, 58 * s, y - 4 * s);
      if (d.subtitle) { g.font = font(14); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillText(d.subtitle, 59 * s, y + 18 * s); }
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }
    if (d.endCard && d.endAlpha > 0.01) {
      g.globalAlpha = d.endAlpha;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, bar, w, h - 2 * bar);
      g.fillStyle = '#fff'; g.font = font(54, 800);
      const t1 = 'FlySkiSelfie'; g.fillText(t1, w / 2 - g.measureText(t1).width / 2, h / 2 - 10 * s);
      g.font = font(18); g.fillStyle = 'rgba(255,255,255,0.92)';
      for (const [i, line] of d.endCard.entries()) g.fillText(line, w / 2 - g.measureText(line).width / 2, h / 2 + (30 + i * 26) * s);
      g.globalAlpha = 1;
    }
    if (d.labels) {
      g.font = font(13, 600);
      for (const [x, y, text, color] of d.labels) {
        const tw2 = g.measureText(text).width;
        g.fillStyle = 'rgba(8,12,18,0.62)';
        g.fillRect(x + 8 * s, y - 16 * s, tw2 + 12 * s, 22 * s);
        g.fillStyle = color || '#cfe8ff';
        g.fillText(text, x + 14 * s, y);
        g.beginPath(); g.arc(x, y, 3 * s, 0, Math.PI * 2); g.fill();
      }
    }
    if (d.pip) {
      const [x, y, pw, ph, lab] = d.pip;
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2 * s;
      g.strokeRect(x, y, pw, ph);
      if (lab) {
        g.font = font(12, 600);
        const lw = g.measureText(lab).width;
        g.fillStyle = 'rgba(8,12,18,0.7)'; g.fillRect(x, y + ph, lw + 16 * s, 20 * s);
        g.fillStyle = '#ffd27a'; g.fillText(lab, x + 8 * s, y + ph + 14 * s);
      }
      // REC dot: this inset is the product's own camera
      g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(x + pw - 12 * s, y + 12 * s, 4 * s, 0, Math.PI * 2); g.fill();
    }
    if (d.warn) {
      g.font = font(14, 700);
      const ww = g.measureText(d.warn).width;
      g.fillStyle = 'rgba(160,20,10,0.85)';
      g.fillRect(w - ww - 42 * s, bar + 16 * s, ww + 24 * s, 30 * s);
      g.fillStyle = '#fff'; g.fillText(d.warn, w - ww - 30 * s, bar + 37 * s);
    }
    this.tex.needsUpdate = true;
  }
  render(renderer) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.cam);
    renderer.autoClear = ac;
  }
}

// Onboard camera: cube capture at the lens node → equidistant fisheye (nadir
// axis, heading up), tone-mapped in-shader so it can be read back to a 2D canvas.
export class Fisheye {
  constructor(renderer, res = 256) {
    this.renderer = renderer;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(res, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCam = new THREE.CubeCamera(0.03, 30000, this.cubeRT);
    this.size = 384;
    this.rt = new THREE.WebGLRenderTarget(this.size, this.size);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { cube: { value: this.cubeRT.texture }, fwd: { value: new THREE.Vector3(1, 0, 0) }, right: { value: new THREE.Vector3(0, 0, 1) }, uHalf: { value: Math.PI / 2 }, exposure: { value: 1.0 }, overlay: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform samplerCube cube; uniform vec3 fwd, right; uniform float uHalf, exposure; varying vec2 vUv;
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p);
          if (r > 1.0) { gl_FragColor = vec4(0.04,0.045,0.05,1.0); return; }
          float th = r * uHalf; float az = atan(p.x, p.y);
          vec3 d = cos(th) * vec3(0.0,-1.0,0.0) + sin(th) * (sin(az) * right + cos(az) * fwd);
          vec3 c = textureCube(cube, d).rgb * exposure;
          c = pow(aces(c), vec3(1.0/2.2));
          c *= 1.0 - 0.35 * smoothstep(0.75, 1.0, r);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.buf = new Uint8Array(this.size * this.size * 4);
  }
  capture(scene, lens, fwd, fovDeg, hide = []) {
    hide.forEach((o) => (o.visible = false));
    this.cubeCam.position.copy(lens);
    this.cubeCam.update(this.renderer, scene);
    hide.forEach((o) => (o.visible = true));
    const f = fwd.clone().setY(0).normalize();
    this.mat.uniforms.fwd.value.copy(f);
    this.mat.uniforms.right.value.crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    this.mat.uniforms.uHalf.value = (fovDeg / 2) * Math.PI / 180;
    this.mat.uniforms.exposure.value = this.renderer.toneMappingExposure;
  }
  // draw to the 2D canvas (readback) or straight to the current screen target
  toCanvas(ctx2d) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.ortho);
    r.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, this.buf);
    r.setRenderTarget(prev);
    const img = ctx2d.createImageData(this.size, this.size);
    for (let y = 0; y < this.size; y++) {
      const src = (this.size - 1 - y) * this.size * 4;
      img.data.set(this.buf.subarray(src, src + this.size * 4), y * this.size * 4);
    }
    return img;
  }
  toScreen(w, h) {
    const r = this.renderer;
    const s = Math.min(w, h);
    r.setViewport((w - s) / 2, (h - s) / 2, s, s);
    r.render(this.scene, this.ortho);
    r.setViewport(0, 0, w, h);
  }
}
