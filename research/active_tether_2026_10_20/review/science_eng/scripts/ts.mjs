import { diag } from './diag.mjs';
import { skierAt, bodyPoints } from '../sim/js/concepts/common/skier.js';
const [id, a, b, st] = process.argv.slice(2); const over = JSON.parse(process.argv[6] || '{}');
const d = diag(id, over, { fs: false }); const { O } = d.R.core, A = d.R.analysis, sk = d.R.core.sk;
for (let t = +a; t <= +b; t += +(st || 0.2)) { const i = Math.round(t / 0.02); const s = skierAt(sk, t);
  const h = [O.hx[i], O.hy[i], O.hz[i]];
  console.log(t.toFixed(2), 'mode', O.mode[i], 'rv', s.speed.toFixed(1), 'hd', (Math.atan2(s.heading[1], s.heading[0]) * 57.3).toFixed(0), 've', Math.hypot(O.evx[i], O.evy[i], O.evz[i]).toFixed(1), 'vF', Math.hypot(O.fvx[i], O.fvy[i], O.fvz[i]).toFixed(1), 'vFy', O.fvy[i].toFixed(1), 'vey', O.evy[i].toFixed(1), 'el', O.elev[i].toFixed(0), 'L', O.L[i].toFixed(1), 'T', O.T[i].toFixed(1), 'brk', O.brake[i].toFixed(2), 'phi', O.phi[i].toFixed(0), 'hgt', (O.fz[i] - O.snow[i]).toFixed(1), 'hc', (A.headClear[i] ?? NaN).toFixed?.(2), 'px', (A.bodyPx[i]).toFixed(0), 'art', A.art[i], 'ke', (A.ke[i]).toFixed(1), 'dy', (O.fy[i] - O.ey[i]).toFixed(1));
}
