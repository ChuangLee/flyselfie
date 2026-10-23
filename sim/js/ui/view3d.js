// Minimal perspective renderer on Canvas 2D (no external dependencies). World
// coordinates in metres: x down the fall line, y left, z up.
import { v3 } from '../model/util.js';

export class Orbit {
  constructor(o = {}) {
    this.yaw = o.yaw ?? -2.1; // radians around z
    this.pitch = o.pitch ?? 0.3;
    this.dist = o.dist ?? 9;
    this.fov = 50 * Math.PI / 180;
    this.target = o.target ?? [0, 0, 1];
  }
  eye() {
    const { yaw, pitch, dist, target } = this;
    return [target[0] + dist * Math.cos(pitch) * Math.cos(yaw), target[1] + dist * Math.cos(pitch) * Math.sin(yaw), target[2] + dist * Math.sin(pitch)];
  }
  zoom(f) { this.dist = Math.max(2, Math.min(60, this.dist * f)); }
}

// Pointer/wheel/keyboard orbit control; `get` returns the orbit currently shown.
export function attachOrbit(canvas, get, onChange) {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const o = get();
    o.yaw -= (e.clientX - drag[0]) * 0.008;
    o.pitch = Math.max(-0.1, Math.min(1.5, o.pitch + (e.clientY - drag[1]) * 0.006));
    drag = [e.clientX, e.clientY];
    onChange();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    get().zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
    onChange();
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const o = get(), k = e.key;
    if (k === 'ArrowLeft') o.yaw += 0.08;
    else if (k === 'ArrowRight') o.yaw -= 0.08;
    else if (k === 'ArrowUp') o.pitch = Math.min(1.5, o.pitch + 0.06);
    else if (k === 'ArrowDown') o.pitch = Math.max(-0.1, o.pitch - 0.06);
    else if (k === '+' || k === '=') o.zoom(1 / 1.1);
    else if (k === '-') o.zoom(1.1);
    else return;
    e.preventDefault();
    e.stopPropagation();
    onChange();
  });
}

export class Projector {
  constructor(orbit, w, h) {
    this.w = w; this.h = h;
    this.eye = orbit.eye();
    this.f = this.h / (2 * Math.tan(orbit.fov / 2));
    const fwd = v3.norm(v3.sub(orbit.target, this.eye));
    this.r = v3.norm(v3.cross(fwd, [0, 0, 1]));
    this.u = v3.cross(this.r, fwd);
    this.fwd = fwd;
  }
  // returns [sx, sy, depth] or null behind camera
  p(pt) {
    const d = v3.sub(pt, this.eye);
    const z = v3.dot(d, this.fwd);
    if (z < 0.05) return null;
    return [this.w / 2 + (this.f * v3.dot(d, this.r)) / z, this.h / 2 - (this.f * v3.dot(d, this.u)) / z, z];
  }
  depth(pt) { return v3.dot(v3.sub(pt, this.eye), this.fwd); }
  scale(pt) { const z = this.depth(pt); return z > 0.05 ? this.f / z : 0; }
}

export function line(ctx, P, a, b, style, width = 1.5, dash = null) {
  const A = P.p(a), B = P.p(b);
  if (!A || !B) return;
  ctx.save();
  ctx.strokeStyle = style; ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  ctx.restore();
}

export function poly(ctx, P, pts, fill, stroke) {
  const S = pts.map((q) => P.p(q));
  if (S.some((s) => !s)) return;
  ctx.beginPath();
  S.forEach((s, i) => (i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
}

export function dot(ctx, P, pt, r, fill) {
  const S = P.p(pt);
  if (!S) return;
  ctx.beginPath(); ctx.arc(S[0], S[1], r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}

export function label(ctx, P, pt, text, color, dx = 6, dy = -6) {
  const S = P.p(pt);
  if (!S) return;
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(text, S[0] + dx, S[1] + dy);
  ctx.restore();
}

export function arrow(ctx, P, a, vec, style, width = 2) {
  const b = v3.add(a, vec);
  const A = P.p(a), B = P.p(b);
  if (!A || !B) return;
  ctx.save();
  ctx.strokeStyle = style; ctx.fillStyle = style; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
  ctx.beginPath();
  ctx.moveTo(B[0], B[1]);
  ctx.lineTo(B[0] - 9 * Math.cos(ang - 0.4), B[1] - 9 * Math.sin(ang - 0.4));
  ctx.lineTo(B[0] - 9 * Math.cos(ang + 0.4), B[1] - 9 * Math.sin(ang + 0.4));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Slope grid around a centre point; 1 m lines, heavier every 5 m.
export function slopeGrid(ctx, P, centre, tanS, colors, half = 14) {
  const cx = Math.round(centre[0]), cy = Math.round(centre[1]);
  for (let i = -half; i <= half; i++) {
    const heavy = (cx + i) % 5 === 0;
    const x = cx + i;
    line(ctx, P, [x, cy - half, -x * tanS], [x, cy + half, -x * tanS], heavy ? colors.gridHeavy : colors.grid, heavy ? 1.2 : 0.7);
    const y = cy + i;
    const heavyY = y % 5 === 0;
    line(ctx, P, [cx - half, y, -(cx - half) * tanS], [cx + half, y, -(cx + half) * tanS], heavyY ? colors.gridHeavy : colors.grid, heavyY ? 1.2 : 0.7);
  }
}

// Stick-figure skier: illustration geometry, not a human model.
export function skier(ctx, P, pos, heading, colors, pose = {}) {
  const h = v3.norm([heading[0], heading[1], 0]);
  const side = [-h[1], h[0], 0];
  const crouch = pose.crouch ?? 0.08;
  const hip = v3.add(pos, [0, 0, 0.95 - crouch]);
  const shoulder = v3.add(pos, [0, 0, 1.45 - crouch]);
  const headC = v3.add(pos, [0, 0, 1.63 - crouch]);
  // skis
  for (const s of [-0.13, 0.13]) {
    const o = v3.add(pos, v3.scale(side, s));
    line(ctx, P, v3.add(o, v3.scale(h, -0.8)), v3.add(o, v3.scale(h, 0.85)), colors.ski, 3);
    line(ctx, P, o, v3.add(hip, v3.scale(side, s * 0.6)), colors.body, 3);
  }
  line(ctx, P, hip, shoulder, colors.body, 5);
  // arms and poles
  const armL = pose.armL || v3.add(shoulder, v3.add(v3.scale(h, 0.35), v3.add(v3.scale(side, 0.35), [0, 0, -0.45])));
  const armR = pose.armR || v3.add(shoulder, v3.add(v3.scale(h, 0.35), v3.add(v3.scale(side, -0.35), [0, 0, -0.45])));
  line(ctx, P, v3.add(shoulder, v3.scale(side, 0.2)), armL, colors.body, 2.5);
  line(ctx, P, v3.add(shoulder, v3.scale(side, -0.2)), armR, colors.body, 2.5);
  if (!pose.noPoles) {
    line(ctx, P, armL, v3.add(armL, v3.add(v3.scale(h, -0.25), [0, 0, -1.0])), colors.pole, 1.5);
    line(ctx, P, armR, v3.add(armR, v3.add(v3.scale(h, -0.25), [0, 0, -1.0])), colors.pole, 1.5);
  }
  const H = P.p(headC);
  if (H) {
    ctx.beginPath(); ctx.arc(H[0], H[1], Math.max(2, 0.12 * P.scale(headC)), 0, Math.PI * 2);
    ctx.fillStyle = colors.helmet; ctx.fill();
  }
  // backpack
  const bp = v3.add(pos, v3.add(v3.scale(h, -0.17), [0, 0, 1.2 - crouch]));
  const bw = v3.scale(side, 0.16), bh = [0, 0, 0.25], bd = v3.scale(h, -0.08);
  poly(ctx, P, [v3.sub(bp, bw), v3.add(bp, bw), v3.add(v3.add(bp, bw), bh), v3.add(v3.sub(bp, bw), bh)], colors.pack, null);
  poly(ctx, P, [v3.add(v3.sub(bp, bw), bd), v3.add(v3.add(bp, bw), bd), v3.add(v3.add(v3.add(bp, bw), bh), bd), v3.add(v3.add(v3.sub(bp, bw), bh), bd)], colors.pack, colors.packEdge);
}

// Kite as a flat diamond: span horizontal ⟂ airflow, chord along airflow.
export function kite(ctx, P, p, airflow, halfSpan, colors, alpha = 1) {
  let a = v3.norm(airflow);
  if (v3.len(a) < 0.5) a = [-1, 0, 0];
  let s = v3.norm(v3.cross(a, [0, 0, 1]));
  if (v3.len(s) < 0.5) s = [0, 1, 0];
  const up = v3.norm(v3.cross(s, a));
  const chord = halfSpan * 0.9;
  const lead = v3.add(p, v3.add(v3.scale(a, -chord * 0.45), v3.scale(up, chord * 0.15)));
  const trail = v3.add(p, v3.scale(a, chord * 0.75));
  ctx.save();
  ctx.globalAlpha = alpha;
  poly(ctx, P, [lead, v3.add(p, v3.scale(s, halfSpan)), trail, v3.add(p, v3.scale(s, -halfSpan))], colors.kite, colors.kiteEdge);
  ctx.restore();
}
