// Onboard camera view (FE-09): equidistant fisheye from the lens node hanging
// below the kite, optical axis at nadir, image "up" = skier heading. Synthetic
// geometry only — no exposure, resolution or stitching is represented.
import { v3 } from '../model/util.js';

export function drawCamView(ctx, W, H, st, colors, fovDeg) {
  const R = Math.min(W, H) * 0.46;
  const cx = W / 2, cy = H / 2;
  const half = (fovDeg / 2) * Math.PI / 180;
  const cam = st.cam;
  const fwd = v3.norm([st.heading[0], st.heading[1], 0]);
  const right = [fwd[1], -fwd[0], 0];
  // returns screen point or null outside FOV
  const proj = (pt) => {
    const d = v3.norm(v3.sub(pt, cam));
    const th = Math.acos(Math.max(-1, Math.min(1, -d[2])));
    if (th > half) return null;
    const r = (th / half) * R;
    const az = Math.atan2(v3.dot(d, right), v3.dot(d, fwd));
    return [cx + r * Math.sin(az), cy - r * Math.cos(az)];
  };
  const seg = (a, b, style, width, steps = 24, dash) => {
    ctx.save();
    ctx.strokeStyle = style; ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= steps; i++) {
      const q = proj(v3.add(a, v3.scale(v3.sub(b, a), i / steps)));
      if (!q) { pen = false; continue; }
      if (pen) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
      pen = true;
    }
    ctx.stroke();
    ctx.restore();
  };

  ctx.fillStyle = colors.camBg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = colors.snow; ctx.fill(); ctx.clip();
  // slope grid
  const tanS = st.tanS;
  const gx = Math.round(st.skierPos[0]), gy = Math.round(st.skierPos[1]);
  for (let i = -15; i <= 15; i++) {
    seg([gx + i, gy - 15, -(gx + i) * tanS], [gx + i, gy + 15, -(gx + i) * tanS], colors.grid, 0.7, 30);
    seg([gx - 15, gy + i, -(gx - 15) * tanS], [gx + 15, gy + i, -(gx + 15) * tanS], colors.grid, 0.7, 30);
  }
  // skier: skis, body axis, head
  const p = st.skierPos;
  const side = [-fwd[1], fwd[0], 0];
  for (const s of [-0.13, 0.13]) {
    const o = v3.add(p, v3.scale(side, s));
    seg(v3.add(o, v3.scale(fwd, -0.8)), v3.add(o, v3.scale(fwd, 0.85)), colors.ski, 3, 6);
  }
  seg(p, v3.add(p, [0, 0, 1.45]), colors.body, 6, 6);
  const hq = proj(v3.add(p, [0, 0, 1.63]));
  if (hq) { ctx.beginPath(); ctx.arc(hq[0], hq[1], 6, 0, Math.PI * 2); ctx.fillStyle = colors.helmet; ctx.fill(); }
  // tether from kite attachment to backpack anchor
  seg(st.kite, st.anchor, st.slack ? colors.slack : colors.tether, 1.6, 40, st.slack ? [4, 3] : null);
  ctx.restore();
  // FOV ring and orientation mark
  ctx.strokeStyle = colors.fg; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = colors.fg; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('▲ heading', cx - 26, cy - R - 4);
}
