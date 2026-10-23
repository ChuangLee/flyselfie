// development aid: steady straight running, flyer placed at the window zenith → is tethered flight stable?
import { simulateSkier } from '../../../sim/js/concepts/common/skier.js';
import { runTether } from './lib/tether.mjs';
const a = Object.fromEntries(process.argv.slice(2).map((x) => x.split('=')));
const sk = simulateSkier({ style: a.style || 'straight', start: 'moving', v0: 12, vTarget: 12, duration: 40, seed: 3 });
const c = { id: 'x', U: +(a.U || 0), mean: [-(+(a.U || 0)), 0, 0], seed: 11, intensity: +(a.I || 0.15) };
const r = runTether({ sk, case: c, flyer: a.flyer || 'glider', arch: a.arch || 'A1', est: a.est || 'oracle', events: { start: [0.5], stop: [], fall: [] }, log: true, tEnd: +(a.tEnd || 20), logEvery: +(a.le || 50), launchL: +(a.L || 3), ctrl: a.ctrl ? JSON.parse(a.ctrl) : {}, Ltarget: a.Lt ? +a.Lt : undefined, airdata: a.air === '1', noRollDist: a.nd === '1', fixedL: a.fl === '1', noiseScale: a.ns != null ? +a.ns : 1, errOff: a.off ? a.off.split(',') : null, flyerImu: a.imu === '1' });
console.log(Object.keys(r.log[0]).join(' '));
for (const l of r.log.filter((l, k) => k % +(a.every || 1) === 0)) console.log(Object.values(l).join(' '));
const m = r.met; console.log('Tmax', m.Tmax.toFixed(1), 'keMax', m.keMax.toFixed(1), 'slackS', m.slackS.toFixed(1), 'stallS', m.stallS.toFixed(1), 'pz', m.powerZoneS.toFixed(1), 'crash', m.crashes);
const q = (x) => { if (!x || !x.length) return null; const a = x.map(Math.abs).sort((p, q) => p - q); return { mean: +(x.reduce((p, q) => p + q, 0) / x.length).toFixed(2), p50abs: +a[Math.floor(a.length / 2)].toFixed(2), p95abs: +a[Math.floor(a.length * 0.95)].toFixed(2) }; };
console.log(JSON.stringify({ ePos: q(m.ePos), eVa: q(m.eVa), eW: q(m.eW), eWair: q(m.eWair), eAlpha: q(m.eAlpha), eLM: q(m.eLM), LMlow: m.LMlow, avail: (m.availS / m.ridingS).toFixed(2) }));
