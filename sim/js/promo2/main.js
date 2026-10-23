// SledPack promo v2 (SIM-034) — 3D layer. Deterministic: window.__promo.seek(t) renders one frame
// and returns the screen positions of the callout anchors for the text-overlay page.
// Concept visualisation only (SIM-033); G-MATURE closed; not real footage.
import * as THREE from 'three';
import { GLView } from '../render/gl.js';
import { createPromoGear } from './gear.js';
import { promoShot } from './shots.js';
import { skierState, kiteState, TAN_S, EV, DURATION, smooth } from './timeline.js';

const q = new URLSearchParams(location.search);
const quality = q.get('quality') || 'promo';
const msg = document.getElementById('msg');
let gl, gear;

function device(t) {
  const led = (t >= EV.armed && t < EV.launch) ? 'amber' : 'green';
  const pulse = led === 'amber' ? 2 + 2 * (0.5 + 0.5 * Math.sin(t * 12)) : 3;
  // studio rim/fill on the back unit for the product shots (render lighting, labelled as render)
  const rim = smooth(5.6, 6.6, t) * (1 - smooth(16.6, 17.4, t)) + 0.7 * smooth(55.4, 56.4, t) * (1 - smooth(61.6, 62.4, t));
  return { kite: kiteState(t), led, ledI: pulse, rim };
}

function render(t) {
  const sk = skierState(t);
  const fs = {
    mode: 'demo', t, tanS: TAN_S, reducedMotion: false,
    skier: { ...sk, pack: 'none', handOnCrank: false, crank: false },
    kite: null, gear, device: device(t), overlays: false,
    camera: 'director', letterbox: true,
    shots: (tt) => { const s = promoShot(tt, gear.out); if (q.get('dof') === '0') delete s.dof; return s; },
    trackKey: `promo:${Math.floor(t * 4)}`,
    trackPath: () => { const out = []; for (let tt = 0; tt <= t; tt += 0.2) { const s = skierState(tt); out.push({ pos: s.pos, heading: s.travel }); } return out; },
    hud: {},
  };
  const r = gl.frame(fs);
  // project callout anchors to CSS pixels
  const W = gl.canvas.clientWidth, H = gl.canvas.clientHeight;
  const anchors = {};
  for (const [k, v] of Object.entries(gear.out.anchors || {})) {
    const p = v.clone().project(gl.camera);
    if (p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2) anchors[k] = [Math.round((p.x * 0.5 + 0.5) * W), Math.round((-p.y * 0.5 + 0.5) * H)];
  }
  return { shot: r && r.shot, anchors };
}

async function init() {
  if (!GLView.supported()) { msg.textContent = 'WebGL2 unavailable'; return; }
  gl = await GLView.create(document.getElementById('gl3d'), quality);
  gl.hud.draw = () => {}; // all typography lives in the overlay layer
  gear = createPromoGear(gl.scene);
  // warm-up so shaders and the track are built before the first captured frame
  render(0); render(0.04);
  window.__promo = { ready: true, duration: DURATION, seek: (t) => render(t), gl, gear };
  if (q.get('play')) {
    const t0 = performance.now();
    const loop = () => { const t = ((performance.now() - t0) / 1000) % DURATION; render(t); requestAnimationFrame(loop); };
    loop();
  }
}
init().catch((e) => { msg.textContent = String(e && e.stack || e); console.error(e); });
