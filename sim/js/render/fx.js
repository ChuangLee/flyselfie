// Visual effects driven by the shared timeline (so pausing freezes them and
// playback speed never changes the physics): snow spray at the ski edges during
// turns and stops, and carved ski tracks. Visual only — not modeled physics.
import * as THREE from 'three';

function sprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Spray {
  constructor(scene, max = 4000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('life', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: sprite() }, scale: { value: 600 }, sunCol: { value: new THREE.Color(1.0, 0.98, 0.95) } },
      vertexShader: `attribute float life; attribute float psize; varying float vLife; uniform float scale;
        void main(){ vLife = life; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = life > 0.0 ? psize * scale / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 sunCol; varying float vLife;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * clamp(vLife*1.6,0.0,1.0) * 0.55;
          if (a < 0.01) discard; gl_FragColor = vec4(sunCol * 1.25, a); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
    this.seed = 1;
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  reset() { this.life.fill(0); this.points.geometry.attributes.life.needsUpdate = true; }
  emit(n, origin, baseVel, spread) {
    for (let i = 0; i < n; i++) {
      const k = this.next; this.next = (this.next + 1) % this.max;
      this.pos[k * 3] = origin.x + (this.rnd() - 0.5) * 0.15;
      this.pos[k * 3 + 1] = origin.y + 0.02;
      this.pos[k * 3 + 2] = origin.z + (this.rnd() - 0.5) * 0.15;
      this.vel[k * 3] = baseVel.x + (this.rnd() - 0.5) * spread;
      this.vel[k * 3 + 1] = baseVel.y + this.rnd() * spread * 0.8;
      this.vel[k * 3 + 2] = baseVel.z + (this.rnd() - 0.5) * spread;
      this.life[k] = 0.6 + this.rnd() * 0.7;
      this.size[k] = 0.04 + this.rnd() * 0.09;
    }
  }
  step(dt, groundY) {
    if (dt <= 0) return;
    for (let k = 0; k < this.max; k++) {
      if (this.life[k] <= 0) continue;
      this.life[k] -= dt;
      const drag = Math.exp(-2.2 * dt);
      this.vel[k * 3] *= drag; this.vel[k * 3 + 2] *= drag;
      this.vel[k * 3 + 1] = this.vel[k * 3 + 1] * drag - 9.81 * dt * 0.55;
      this.pos[k * 3] += this.vel[k * 3] * dt;
      this.pos[k * 3 + 1] += this.vel[k * 3 + 1] * dt;
      this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
      const gy = groundY(this.pos[k * 3], this.pos[k * 3 + 2]);
      if (this.pos[k * 3 + 1] < gy) { this.pos[k * 3 + 1] = gy; this.life[k] = Math.min(this.life[k], 0.15); }
      this.size[k] *= 1 + dt * 0.8;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.life.needsUpdate = true; a.psize.needsUpdate = true;
  }
}

// Two carved ribbons following the ski positions (three coords), just above the snow.
export class Tracks {
  constructor(scene) {
    this.mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.80, 0.85, 0.92), roughness: 0.45, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.meshes = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), this.mat); m.receiveShadow = true; scene.add(m); return m; });
  }
  // paths: [[Vector3...], [Vector3...]] ski centre lines; normal: slope normal
  update(paths, normal, width = 0.075) {
    paths.forEach((path, idx) => {
      const mesh = this.meshes[idx];
      mesh.geometry.dispose();
      if (path.length < 2) { mesh.geometry = new THREE.BufferGeometry(); return; }
      const pos = new Float32Array(path.length * 6);
      const ind = [];
      for (let i = 0; i < path.length; i++) {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        const t = b.clone().sub(a).normalize();
        const side = new THREE.Vector3().crossVectors(normal, t).normalize().multiplyScalar(width / 2);
        const p = path[i].clone().addScaledVector(normal, 0.006);
        pos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
        if (i > 0) { const k = i * 2; ind.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(ind);
      g.computeVertexNormals();
      mesh.geometry = g;
    });
  }
}
