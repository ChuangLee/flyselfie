import AT, { prepare, buildResult, PARAMS, SCEN } from './sim/js/concepts/activetether/index.js';
import { MODE_NAME } from './sim/js/concepts/activetether/model.js';
const P0 = Object.fromEntries(PARAMS.map((p) => [p.id, p.v]));
for (const sc of SCEN.filter((s) => s.id.startsWith('ut_'))) {
  const R = buildResult(P0, sc, prepare(P0, sc));
  const O = R.core.O; let last = -1; const tl = [];
  for (let i = 0; i < R.core.n; i++) if (O.mode[i] !== last) { last = O.mode[i]; tl.push(`${(i * 0.02).toFixed(1)}:${MODE_NAME[last]}`); }
  console.log(sc.id, 'stops', JSON.stringify(R.core.sk.stops.map(s=>[+s.t0.toFixed(1), +s.t1.toFixed(1)])), tl.join(' '));
}
