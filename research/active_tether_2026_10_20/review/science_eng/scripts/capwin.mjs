import { diag } from './diag.mjs';
import { bodyPoints, skierAt } from '../sim/js/concepts/common/skier.js';
const ids = process.argv.slice(2); const all = [];
for (const id of ids) { const d = diag(id, {}, { fs: false }); const O = d.R.core.O, A = d.R.analysis; let s = -1; const w = [];
  let minExcl = 99;
  for (let i = 0; i < d.R.core.n; i++) { if (O.capWin[i] === 1) { if (s < 0) s = i; minExcl = Math.min(minExcl, A.headFlyer[i], A.headLine[i]); } else if (s >= 0) { w.push(+((i - s) * 0.02).toFixed(2)); s = -1; } }
  all.push(...w); console.log(id, 'capture windows (s):', w.join(','), 'min clearance inside excluded windows', minExcl.toFixed(2)); }
all.sort((a, b) => a - b); console.log('n', all.length, 'p50', all[Math.floor(all.length / 2)], 'max', all[all.length - 1], 'share>3s', (all.filter((x) => x > 3).length / all.length).toFixed(2));
// exit-helmet geometry
const { simulateRun } = await import('../sim/js/concepts/common/fullrun.js');
const sk = simulateRun({ seed: 11 });
for (const t of [1, 20, 21.5, 39.9, 50]) { const s = skierAt(sk, t), b = bodyPoints(s); const h = s.heading, up = b.up, pv = b.pelvis; const E = [0, 1, 2].map((k) => pv[k] + h[k] * -0.66 + up[k] * -0.10); const H = b.head; console.log('t', t, 'speed', s.speed.toFixed(1), 'exit→helmet', Math.hypot(H[0] - E[0], H[1] - E[1], H[2] - E[2]).toFixed(2), 'vec', [0, 1, 2].map((k) => (H[k] - E[k]).toFixed(2)).join(',')); }
