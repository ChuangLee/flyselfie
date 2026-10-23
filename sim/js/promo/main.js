// SledPack promo — 3D layer. Deterministic: window.__promo.seek(t) renders one frame
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
  const xray = smooth(12.5, 13.6, t) * (1 - smooth(17.0, 17.9, t));
  const led = t >= EV.docked ? 'charge' : (t >= EV.armed && t < EV.launch) ? 'amber' : 'green';
  const pulse = led === 'amber' ? 2 + 2 * (0.5 + 0.5 * Math.sin(t * 12)) : 3;
  // studio rim/fill on the pack for the product shots (render lighting, labelled as render)
  const rim = smooth(5.6, 6.6, t) * (1 - smooth(17.6, 18.4, t)) + smooth(52.4, 53.4, t) * (1 - smooth(58.2, 59, t)) * 0.7;
  // flip-down cover: closed while docked, opens when armed, closes after docking
  const cover = Math.min(1, Math.max(0, 1 - smooth(20.4, 21.1, t) + smooth(EV.docked + 0.3, EV.docked + 1.0, t)));
  return { kite: kiteState(t), xray, led, ledI: pulse, rim, cover };
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
