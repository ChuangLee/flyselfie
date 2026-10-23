// towglider audit: standstill after an unplanned stop and after a planned dock over 0–9 m/s wind
// (4 directions × 4 seeds per speed), harmonised setupTime = 90th percentile (criteria.js).
// Cut/no-recovery runs are counted as 120 s (ASSUMED walk-to-glider + re-thread), not the model's 21 s.
// Run: node research/concepts_2026_10_19/audit/check_towglider_stopsweep.mjs  → out_towglider_stopsweep.json
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import C from '../../../sim/js/concepts/towglider/index.js';
const here = dirname(fileURLToPath(import.meta.url));
const P = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const met = (R, id) => R.metrics.find((m) => m.id === id)?.value;
const rows = [];
for (const base of ['stop', 'dock']) for (const U of [0, 3, 6, 9]) for (const [dn, d] of [['cross', [0, 1]], ['head', [-1, 0]], ['tail', [1, 0]], ['diagTail', [0.6, 0.8]]]) for (const seed of [1, 2, 3, 4]) {
  if (U === 0 && dn !== 'cross') continue;
  const sc0 = C.scenarios.find((s) => s.id === base);
  const sc = { ...sc0, wind: { mean: [d[0] * U, d[1] * U, 0], intensity: U >= 6 ? 0.35 : 0.2, Lu: 20, seed } };
  const R = C.simulate(P, sc);
  const ev = R.events.map((e) => e.type);
  const cut = ev.includes('cut') || ev.includes('release');
  const st = met(R, 'setupTime');
  rows.push({ base, U, dir: dn, seed, setupModel: Math.round(st * 100) / 100, cut, standAudit: cut ? 120 : st, airMin: Math.round(met(R, 'airMin') * 1000) / 1000, keMax: Math.round(met(R, 'keMax') * 1000) / 1000, clearBody: Math.round(met(R, 'clearBody') * 1000) / 1000, clearPole: Math.round(met(R, 'clearPole') * 1000) / 1000 });
}
const p90 = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.round(0.9 * (v.length - 1)))]; };
const summary = {};
for (const base of ['stop', 'dock']) {
  const r = rows.filter((x) => x.base === base);
  summary[base] = { runs: r.length, cutOrRelease: r.filter((x) => x.cut).length, cutByWind: Object.fromEntries([0, 3, 6, 9].map((U) => [U, `${r.filter((x) => x.U === U && x.cut).length}/${r.filter((x) => x.U === U).length}`])),
    setupP90_modelValues: p90(r.map((x) => x.setupModel)), setupP90_audit: p90(r.map((x) => x.standAudit)), keOver14_9: r.filter((x) => x.keMax > 14.9).length, stallRuns: r.filter((x) => x.airMin < 1).length, lineTouchesBody: r.filter((x) => x.clearBody < 0).length, lineTouchesPole: r.filter((x) => x.clearPole < 0).length };
}
writeFileSync(join(here, 'out_towglider_stopsweep.json'), JSON.stringify({ generated: '2026-10-19', evidence: 'audit re-computation on the uncalibrated model; not a physical test', summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
