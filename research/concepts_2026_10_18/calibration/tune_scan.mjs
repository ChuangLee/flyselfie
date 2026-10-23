// Parameter scan used to choose the per-style defaults in proposal.json (targets from literature).
import { skierStats } from './compare_skier.mjs';
const targets = {
  rec_carve: { turn: 2.97, loadMax: [1.6, 1.7], v: [11, 14] },
  expert_carve: { turn: 2.97, loadMax: [1.85, 2.05], v: [13, 14.5] },
  short: { turn: 1.04, loadMax: [1.8, 2.05], v: [7, 10] },
};
const rows = [];
for (const style of ['carve', 'short']) for (const slopeDeg of [15, 20]) for (const vTarget of [7, 8, 10, 12, 13]) for (const tp of style === 'carve' ? [2.9, 3.1] : [2.3, 2.5]) for (const amp of [35, 40, 45, 50, 55, 60]) {
  const s = skierStats({ style, slopeDeg, vTarget, v0: vTarget, turnPeriod: tp, turnAmpDeg: amp, duration: 40, seed: 1 });
  rows.push({ style, slopeDeg, vTarget, tp, amp, v: s.speed_ms.mean, turn: s.turn_s?.mean, lat: s.apexLat_g?.mean, R: s.apexRadius_m?.mean, lean: s.apexLean_deg?.mean, load: s.loadFactor_bw.max });
}
for (const [k, T] of Object.entries(targets)) {
  const c = rows.filter((r) => (k === 'short' ? r.style === 'short' : r.style === 'carve') && r.load >= T.loadMax[0] && r.load <= T.loadMax[1] && r.v >= T.v[0] && r.v <= T.v[1] && Math.abs(r.turn - T.turn) < 0.25);
  console.log(k, c.length); c.slice(0, 12).forEach((r) => console.log(' ', JSON.stringify(r)));
}
