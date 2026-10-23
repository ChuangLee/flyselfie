// Time-series plots sharing the simulation timeline (FE-06). NaN = unavailable
// and is drawn as a gap, never interpolated.

export const PLOT_DEFS = [
  { key: 'sigT', series: [['T', 'N']], color: ['--c1'] },
  { key: 'sigAirspeed', series: [['airspeed', 'm/s'], ['skierSpeed', 'm/s']], color: ['--c2', '--c5'], labels: ['sigAirspeed', 'sigSkier'] },
  { key: 'sigL', series: [['L', 'm'], ['Ldot', 'm/s']], color: ['--c3', '--c4'], labels: ['sigL', 'sigLdot'] },
  { key: 'sigHeight', series: [['height', 'm'], ['clearance', 'm']], color: ['--c4', '--c1'], labels: ['sigHeight', 'sigClearance'] },
  { key: 'sigHandle', series: [['handleForce', 'N'], ['reelPower', 'W']], color: ['--c5', '--c2'], labels: ['sigHandle', 'sigReelPower'] },
  { key: 'sigSubject', series: [['subjectAngle', 'deg'], ['tetherHeadSep', 'deg']], color: ['--c3', '--c1'], labels: ['sigSubject', 'sigTetherHead'] },
];

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function drawPlot(canvas, def, res, t, tr, onSeek) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const padL = 44, padR = 8, padT = 18, padB = 16;
  const pw = W - padL - padR, ph = H - padT - padB;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = css('--muted');
  if (!res) { ctx.fillText(tr('statusNoData'), padL, padT + ph / 2); return; }

  const n = res.n, cols = res.columns, T = res.duration;
  let lo = Infinity, hi = -Infinity;
  for (const [name] of def.series) for (let i = 0; i < n; i++) { const v = cols[name][i]; if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; }
  const span = hi - lo; lo -= span * 0.08; hi += span * 0.08;
  const X = (tt) => padL + (tt / T) * pw;
  const Y = (v) => padT + ph - ((v - lo) / (hi - lo)) * ph;

  // invalid / out-of-scope shading
  const shade = (from, style) => {
    if (from === null || from === undefined) return;
    ctx.fillStyle = style;
    ctx.fillRect(X(from), padT, X(T) - X(from), ph);
  };
  shade(res.scopeEnd, css('--scope-bg'));
  shade(res.validUntil, css('--invalid-bg'));

  // axes
  ctx.strokeStyle = css('--grid'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + ph); ctx.lineTo(padL + pw, padT + ph); ctx.stroke();
  if (lo < 0 && hi > 0) { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(padL + pw, Y(0)); ctx.stroke(); ctx.setLineDash([]); }
  ctx.fillStyle = css('--muted');
  ctx.fillText(hi.toPrecision(3), 2, padT + 8);
  ctx.fillText(lo.toPrecision(3), 2, padT + ph);
  ctx.fillText(`${T.toFixed(0)} s`, padL + pw - 26, H - 3);

  // events
  for (const e of res.events) {
    if (e.severity === 'info' && e.type !== 'release' && e.type !== 'near_end') continue;
    ctx.strokeStyle = e.severity === 'invalid' ? css('--bad') : e.severity === 'warning' ? css('--warn') : css('--muted');
    ctx.setLineDash(e.severity === 'invalid' ? [] : [2, 3]);
    ctx.beginPath(); ctx.moveTo(X(e.t), padT); ctx.lineTo(X(e.t), padT + ph); ctx.stroke();
  }
  ctx.setLineDash([]);

  // series
  def.series.forEach(([name], si) => {
    ctx.strokeStyle = css(def.color[si]); ctx.lineWidth = 1.6;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < n; i++) {
      const v = cols[name][i];
      if (!Number.isFinite(v)) { pen = false; continue; }
      const x = X(cols.t[i]), y = Y(v);
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
  });

  // cursor + legend with readout
  ctx.strokeStyle = css('--fg'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X(t), padT); ctx.lineTo(X(t), padT + ph); ctx.stroke();
  const idx = Math.max(0, Math.min(n - 1, Math.round(t / res.sampleDt)));
  let lx = padL;
  def.series.forEach(([name, unit], si) => {
    const v = cols[name][idx];
    const text = `${tr(def.labels ? def.labels[si] : def.key)}: ${Number.isFinite(v) ? v.toFixed(2) + ' ' + unit : tr('unavailable')}`;
    ctx.fillStyle = css(def.color[si]);
    ctx.fillRect(lx, 5, 10, 3);
    ctx.fillStyle = css('--fg');
    ctx.fillText(text, lx + 13, 11);
    lx += ctx.measureText(text).width + 26;
  });

  if (!canvas._seekBound) {
    canvas._seekBound = true;
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const frac = (e.clientX - r.left - padL) / (r.width - padL - padR);
      if (frac >= 0 && frac <= 1) onSeek(frac * canvas._duration);
    });
  }
  canvas._duration = T;
}
