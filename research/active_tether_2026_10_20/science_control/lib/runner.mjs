// Small helpers: shard a job list across processes, cache skier traces/detector events per seed, summarise.
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { skiTrace } from './traces.mjs';
import { runDetector } from './detect.mjs';

export function shardArg() {
  const a = process.argv.find((x) => x.startsWith('--shard='));
  if (!a) return [0, 1];
  const [i, n] = a.slice(8).split('/').map(Number);
  return [i, n];
}

const cache = new Map();
// skier run + ride/stop/fall events from the onboard detector (the closed loop never sees the truth labels)
export function skierFor(seed, { fall = null } = {}) {
  const key = seed + JSON.stringify(fall);
  if (!cache.has(key)) {
    const tr = skiTrace({ seed, ...(fall ? { fall } : {}) });
    const { ev } = runDetector(tr, { seed: seed + 1 });
    cache.set(key, { tr, sk: tr.sk, ev });
  }
  return cache.get(key);
}

export const q = (arr, p) => { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))] : null; };
export const r3 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 1000) / 1000);
export const absQ = (arr, p) => q(arr.map(Math.abs), p);

export function writeShard(name, i, n, rows) {
  writeFileSync(new URL(`../out/${name}_${i}of${n}.json`, import.meta.url), JSON.stringify(rows));
}
export function readShards(name) {
  const dir = new URL('../out/', import.meta.url);
  return readdirSync(dir).filter((f) => f.startsWith(name + '_') && f.endsWith('.json') && /_\d+of\d+\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
}
