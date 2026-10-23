// WebGL view (three.js r170). Renders sim, demo and geometry modes from a frame
// state expressed in MODEL coordinates (x downslope, y left, z up, metres).
// Presentation only: nothing here changes solver results or their evidence level.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { World, toV, terrainHeight } from './world.js';
import { Skier } from './skier.js';
import { Kite, Payload, Tether, Overlays } from './gear.js';
import { Spray, Tracks } from './fx.js';
import { Post, HUD, Fisheye } from './post.js';
import { direct } from './director.js';

export const QUALITIES = ['low', 'high', 'ultra'];

export class GLView {
  static supported() {
    try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
  }

  static async create(canvas, quality = 'high') {
    const v = new GLView(canvas, quality);
    await v.init();
    return v;
  }

  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;
  }

  async init() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.62;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 30000);
    this.camera.position.set(-6, 3, 6);
    this.world = new World(r, this.scene);
    await this.world.init(this.quality);
    this.world.setSlope(Math.tan(15 * Math.PI / 180));
    this.skier = new Skier(this.scene);
    this.kite = new Kite(this.scene);
    this.payload = new Payload(this.scene);
    this.tether = new Tether(this.scene);
    this.spray = new Spray(this.scene);
    this.tracks = new Tracks(this.scene);
    this.tracks.mat.side = THREE.DoubleSide;
    this.res = new THREE.Vector2(1, 1);
    this.overlays = new Overlays(this.scene, this.res);
    this.dimMat = new LineMaterial({ color: 0x7cd1ff, linewidth: 1.6, dashed: true, dashSize: 0.06, gapSize: 0.04, depthTest: false, transparent: true });
    this.dimLines = [];
    this.hud = new HUD();
    this.fisheye = new Fisheye(r, this.quality === 'ultra' ? 512 : 256);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 80;
    this.controls.addEventListener('change', () => this.onUserCamera && this.onUserCamera());
    this.followTarget = null;
    this.trackKey = '';
    this.lastT = null;
    this.frameTimes = [];
    this.buildPost();
    this.resize();
  }

  buildPost() {
    this.post = new Post(this.renderer, this.scene, this.camera, this.quality);
    const pr = this.quality === 'ultra' ? Math.min(window.devicePixelRatio || 1, 2) : this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
    this.renderer.setPixelRatio(pr);
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    const sm = q === 'ultra' ? 4096 : q === 'high' ? 2048 : 1024;
    const sh = this.world.sun.shadow;
    sh.mapSize.set(sm, sm);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
    this.buildPost();
    this.resize(true);
  }

  resize(force) {
    const w = this.canvas.clientWidth || 640, h = this.canvas.clientHeight || 360;
    if (!force && w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const db = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.res.copy(db);
    this.overlays.setResolution(db);
    this.dimMat.resolution.copy(db);
  }

  // ---------------------------------------------------------------- frame
  frame(fs) {
    const t0 = performance.now();
    this.resize();
    const { scene, camera } = this;
    const tanS = fs.tanS;
    this.world.setSlope(tanS);
    const slopeN = new THREE.Vector3(tanS, 1, 0).normalize(); // three: model (tanS,0,1) → (tanS,1,0)
    const dt = this.lastT === null ? 0 : fs.t - this.lastT;
    const seekJump = dt < 0 || dt > 0.5;
    this.lastT = fs.t;

    // skier
    const sk = fs.skier;
    const pos = toV(sk.pos);
    const fwd = toV([sk.heading[0], sk.heading[1], 0]).normalize();
    const g = 9.81;
    const lean = Math.atan2(sk.lat || 0, g);
    const crouch = sk.crouch ?? THREE.MathUtils.clamp(0.25 + (sk.speed || 0) * 0.03, 0.15, 0.6);
    this.skier.pose({
      pos, fwd, slopeN, speed: sk.speed, lean, crouch,
      handL: sk.handL ? toV(sk.handL) : null,
      // cranking: right hand follows last frame's crank knob position
      handR: sk.handOnCrank && this.skier.knobPos ? this.skier.knobPos.clone() : sk.handToLoop && this.skier.loopPos ? this.skier.loopPos.clone() : sk.handR ? toV(sk.handR) : null,
      reachL: sk.reachL, reachR: sk.reachR,
      noPoles: sk.noPoles, plantL: sk.plantL, plantR: sk.plantR,
      crank: sk.crank, crankRate: sk.crankRate, dt: Math.max(0, Math.min(dt, 0.1)),
      boom: sk.boom, pull: sk.pull, locked: sk.locked, pack: sk.pack,
    });

    // concept-lab gear (SIM-030): a module object with update(device, ctx)
    if (this.activeGear && this.activeGear !== fs.gear) { this.activeGear.setVisible && this.activeGear.setVisible(false); }
    this.activeGear = fs.gear || null;
    if (fs.gear) {
      fs.gear.setVisible && fs.gear.setVisible(true);
      fs.gear.update(fs.device || {}, { skier: this.skier, toV, t: fs.t, dt: Math.max(0, Math.min(dt, 0.1)), seekJump, fwd, slopeN, tanS, camera: this.camera, scene });
    }

    // kite, payload, tether
    const kt = fs.kite;
    const kiteVisible = kt && kt.visible && (kt.pos || kt.rel);
    this.kite.group.visible = this.payload.group.visible = this.payload.rod.visible = !!kiteVisible;
    this.tether.mesh.visible = !!(kiteVisible && kt.tetherVisible !== false);
    let kitePos = null;
    if (kiteVisible) {
      const onBoom = kt.rel && sk.boom != null;
      // boom-mounted (demo concept): position relative to the rig's boom tip
      kitePos = onBoom ? this.skier.boomTip.clone().add(toV(kt.rel)) : toV(kt.pos);
      const anchor = onBoom ? this.skier.boomTip.clone() : kt.anchor ? toV(kt.anchor) : this.skier.guidePos;
      let down = toV(kt.air || [-1, 0, 0]);
      if (down.lengthSq() < 1e-4) down = fwd.clone().negate();
      const er = onBoom ? toV(kt.relDir).normalize() : kitePos.clone().sub(anchor).normalize();
      const upHint = er.clone().addScaledVector(new THREE.Vector3(0, 1, 0), 0.8).normalize();
      this.kite.update(kitePos, down, upHint, kt.span, kt.fold ?? 1);
      const stow = onBoom ? THREE.MathUtils.clamp(kt.stowAtt || 0, 0, 1) : 0;
      if (stow > 0) {
        // folded wing lies along the boom, nose at the tip, sail facing out
        const z = this.skier.boomDir.clone().negate();
        const y = this.skier.packBack.clone().addScaledVector(z, -this.skier.packBack.dot(z)).normalize();
        const x = new THREE.Vector3().crossVectors(y, z).normalize();
        const qs = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        this.kite.group.quaternion.slerp(qs, stow);
      }
      // place so the bridle tow point sits on the solver's point mass (or the cradle)
      const towWorld = this.kite.towLocal.clone().applyQuaternion(this.kite.group.quaternion);
      this.kite.group.position.copy(kitePos).sub(towWorld);
      this.kite.group.updateMatrixWorld();
      let lens = kt.cam && !onBoom ? toV(kt.cam) : kitePos.clone().add(new THREE.Vector3(0, -0.15, 0));
      if (onBoom) {
        // seated: the camera pod sits beside the funnel instead of hanging through the boom
        const seat = 1 - THREE.MathUtils.smoothstep(toV(kt.rel).length(), 0.05, 0.35);
        lens.addScaledVector(this.skier.packBack, 0.06 * seat).addScaledVector(this.skier.packX, 0.05 * seat).add(new THREE.Vector3(0, 0.06 * seat, 0));
      }
      if (stow > 0) lens.lerp(kitePos.clone().addScaledVector(this.skier.packBack, 0.07).addScaledVector(this.skier.boomDir, -0.12), stow);
      this.lensPos = lens;
      this.payload.update(lens, kitePos, fwd, fs.t);
      const slackLen = kt.slackLen || 0;
      if (this.tether.mesh.visible) this.tether.update(anchor, kitePos, slackLen);
    }

    // tracks (rebuilt only when the history changes)
    if (fs.trackKey !== this.trackKey && fs.trackPath) {
      this.trackKey = fs.trackKey;
      const path = fs.trackPath();
      const paths = [[], []];
      for (const p of path) {
        const c = toV(p.pos), f = toV([p.heading[0], p.heading[1], 0]).normalize();
        const l = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), f).normalize();
        paths[0].push(c.clone().addScaledVector(l, 0.14));
        paths[1].push(c.clone().addScaledVector(l, -0.14));
      }
      this.tracks.update(paths, slopeN);
    }

    // spray on the shared timeline
    if (seekJump) this.spray.reset();
    else if (dt > 0) {
      const speed = sk.speed || 0;
      const rate = Math.min(500, speed * Math.abs(lean) * 70 + Math.max(0, -(sk.accel || 0)) * speed * 30);
      const n = Math.floor(rate * dt + Math.random());
      if (n > 0) {
        const out = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize().multiplyScalar(lean > 0 ? -1 : 1);
        for (const side of ['L', 'R']) {
          const tail = this.skier.feet[side].base.clone().addScaledVector(this.skier.skiF, -0.55);
          const bv = out.clone().multiplyScalar(1.2 + speed * 0.18).addScaledVector(fwd, speed * 0.35).add(new THREE.Vector3(0, 1.1, 0));
          this.spray.emit(Math.ceil(n / 2), tail, bv, 1.4);
        }
      }
      this.spray.step(dt, (x, z) => terrainHeight(x, -z, tanS));
    }

    // camera
    let shot = null;
    if (fs.camera === 'director') {
      const st3 = { boomTip: sk.boom != null ? this.skier.boomTip.clone() : null, pos, fwd, left: new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize(), kite: kitePos, chest: this.skier.basis ? pos.clone().add(new THREE.Vector3(0, 1.25, 0)) : pos, hands: { L: this.skier.hands.L.grip, R: this.skier.hands.R.grip } };
      shot = (fs.shots && fs.shots(fs.t, st3, fs)) || direct(fs.t, st3);
      camera.position.copy(shot.pos);
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(shot.target);
      this.controls.enabled = false;
      this.followTarget = null;
    } else {
      this.controls.enabled = true;
      const tgt = fs.camera === 'geometry' ? toV(fs.geomTarget || [0, 0, 1.5]) : pos.clone().add(new THREE.Vector3(0, 1.9, 0));
      if (fs.camera !== 'geometry' && fs.reducedMotion && this.followTarget && this.followTarget.distanceTo(tgt) < 10) {
        // reduced motion: hold the camera until the skier nears the frame edge
      } else if (this.followTarget) {
        const d = tgt.clone().sub(this.followTarget);
        camera.position.add(d);
        this.controls.target.add(d);
        this.followTarget = tgt;
      } else {
        this.followTarget = tgt;
        this.controls.target.copy(tgt);
        const off = fs.camera === 'geometry' ? new THREE.Vector3(1.2, 1.0, 5.5) : new THREE.Vector3(-6.5, 2.4, 8.0);
        camera.position.copy(tgt).add(off);
      }
      if (camera.fov !== 40) { camera.fov = 40; camera.updateProjectionMatrix(); }
      this.controls.update();
    }
    this.world.follow(pos.clone().add(new THREE.Vector3(0, 1, 0)));
    this.world.tick(fs.t);

    // overlays
    const ov = fs.overlays && kiteVisible;
    this.overlays.update({
      visible: !!ov,
      anchor: kt && kt.anchor ? toV(kt.anchor) : pos, kite: kitePos || pos,
      slack: kt && kt.slack, valid: kt ? kt.valid !== false : true, unavailable: kt && kt.unavailable,
      trail: fs.trail ? fs.trail.map((p) => toV(p)) : null,
      air: kt && kt.air ? toV(kt.air) : new THREE.Vector3(),
      wind: fs.wind ? toV(fs.wind) : new THREE.Vector3(), windOrigin: pos.clone().add(new THREE.Vector3(0, 3.2, 0)).addScaledVector(fwd, -2),
      marker: fs.marker ? toV(fs.marker) : null, camPos: camera.position,
    });
    this.updateDims(fs.dims || []);

    // HUD labels projected from 3D
    const labels = (fs.labels || []).map((l) => {
      const v = toV(l.p).project(camera);
      return v.z < 1 ? { x: (v.x * 0.5 + 0.5) * this.res.x, y: (-v.y * 0.5 + 0.5) * this.res.y, text: l.text, color: l.color } : null;
    }).filter(Boolean);

    // render
    const showFisheye = shot && shot.fisheye && kiteVisible;
    if (showFisheye) {
      this.fisheye.capture(scene, this.lensPos || toV(kt.cam), fwd, kt.fov || 180, [this.payload.group, this.payload.rod, this.kite.group]);
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(0x050505, 1);
      this.renderer.clear();
      this.fisheye.toScreen(this.w, this.h);
    } else {
      this.post.setCamera(camera);
      this.post.frame(fs.t, { letterbox: fs.letterbox, dof: shot && shot.dof && this.quality !== 'low' ? shot.dof : null });
    }
    // product-camera inset: what the device itself records (rendered directly, no post)
    let pipRect = null;
    if (fs.pip && !showFisheye) {
      const pc = this.pipCam || (this.pipCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.03, 30000));
      const pr = this.renderer.getPixelRatio();
      const bar = fs.letterbox ? Math.max(0, (1 - (this.w / this.h) / 2.39) * 0.5) * this.h : 0;
      const pw = Math.round(this.w * (fs.pip.size || 0.3)), ph = Math.round(pw * 9 / 16);
      const px = this.w - pw - Math.round(this.h * 0.025), py = Math.round(bar + this.h * 0.025); // from bottom (GL)
      pc.aspect = pw / ph; pc.fov = fs.pip.vfovDeg || 60;
      pc.position.copy(toV(fs.pip.pos));
      pc.up.copy(toV(fs.pip.up || [0, 0, 1]));
      pc.lookAt(pc.position.clone().add(toV(fs.pip.fwd)));
      pc.updateProjectionMatrix();
      const hidden = (fs.pip.hide || []).filter((o) => o && o.visible);
      for (const o of hidden) o.visible = false;
      this.renderer.setRenderTarget(null);
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(px, py, pw, ph);
      this.renderer.setViewport(px, py, pw, ph);
      this.renderer.render(scene, pc);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.w, this.h);
      for (const o of hidden) o.visible = true;
      pipRect = [px * pr, (this.h - py - ph) * pr, pw * pr, ph * pr, fs.pip.label || ''];
    }
    const hudData = { ...fs.hud, letterbox: fs.letterbox, pip: pipRect, labels: labels.map((l) => [Math.round(l.x), Math.round(l.y), l.text, l.color]) };
    if (showFisheye) hudData.sub = (hudData.sub ? hudData.sub + ' · ' : '') + (fs.hud.fisheyeNote || '');
    this.hud.draw(this.res.x, this.res.y, hudData);
    this.hud.render(this.renderer);

    const ms = performance.now() - t0;
    this.frameTimes.push(ms);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    return { shot: shot && shot.shot, ms };
  }

  updateDims(dims) {
    while (this.dimLines.length < dims.length) {
      const l = new Line2(new LineGeometry(), this.dimMat);
      l.renderOrder = 12;
      this.scene.add(l);
      this.dimLines.push(l);
    }
    this.dimLines.forEach((l, i) => {
      l.visible = i < dims.length;
      if (!l.visible) return;
      const pts = dims[i].flatMap((p) => { const v = toV(p); return [v.x, v.y, v.z]; });
      l.geometry.dispose();
      l.geometry = new LineGeometry().setPositions(pts);
      l.computeLineDistances();
    });
  }

  // onboard camera panel (2D canvas) — only when the kite is airborne
  fisheyeTo(ctx2d, fs) {
    const kt = fs.kite;
    if (!kt || !kt.visible || !(kt.cam || kt.rel)) return false;
    if (kt.rel && Math.hypot(...kt.rel) < 0.3) return false;
    const fwd = toV([fs.skier.heading[0], fs.skier.heading[1], 0]).normalize();
    this.fisheye.capture(this.scene, this.lensPos || toV(kt.cam), fwd, kt.fov || 180, [this.payload.group, this.payload.rod, this.kite.group]);
    const img = this.fisheye.toCanvas(ctx2d);
    const c = ctx2d.canvas;
    if (c.width !== this.fisheye.size) { c.width = c.height = this.fisheye.size; }
    ctx2d.putImageData(img, 0, 0);
    return true;
  }

  avgFrameMs() { return this.frameTimes.length ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length : 0; }

  // real-time capture of the canvas (labels are burned into the frame)
  startRecording(fps = 30) {
    const stream = this.canvas.captureStream(fps);
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = types.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mimeType) throw new Error('MediaRecorder unsupported');
    this.chunks = [];
    this.rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16e6 });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
  }
  stopRecording() {
    return new Promise((resolve) => {
      if (!this.rec) return resolve(null);
      this.rec.onstop = () => resolve(new Blob(this.chunks, { type: 'video/webm' }));
      this.rec.stop();
      this.rec = null;
    });
  }
}
