// debug: one closed-loop case with a log (development aid; not used for reported numbers)
import { skiTrace } from './lib/traces.mjs';
import { runDetector } from './lib/detect.mjs';
import { runTether } from './lib/tether.mjs';
import { FULLRUN_CASES_R4 } from '../../../sim/js/concepts/common/fullrun.js';
const a = Object.fromEntries(process.argv.slice(2).map((x) => x.split('=')));
const c = FULLRUN_CASES_R4.find((x) => x.id === (a.id || 'calm_s11'));
const plan = a.style ? [{ ride: 38, preset: 'recreationalCarve', skier: { style: a.style } }, { hold: 20 }, { ride: 33, preset: 'recreationalCarve', skier: { style: a.style } }, { hold: 10 }] : undefined;
const tr = skiTrace({ seed: c.seed, ...(plan ? { plan } : {}) });
const { ev } = runDetector(tr, { seed: c.seed + 1 });
const t0 = Date.now();
const r = runTether({ sk: tr.sk, case: c, flyer: a.flyer || 'glider', arch: a.arch || 'A3', est: a.est || 'noisy', airdata: a.air === '1', events: ev, log: true, tEnd: +(a.tEnd || 101), logEvery: +(a.le || 50), ctrl: a.ctrl ? JSON.parse(a.ctrl) : {} });
console.log('ms', Date.now() - t0, 'Vstall', r.Vstall.toFixed(2), JSON.stringify(ev));
console.log(Object.keys(r.log[0]).join(' '));
for (const l of r.log.filter((l, k) => k % +(a.every || 1) === 0 && l.t >= +(a.from || 0))) console.log(Object.values(l).join(' '));
const m = r.met; const s = (x) => x.length ? [Math.min(...x).toFixed(2), (x.reduce((p, q) => p + q, 0) / x.length).toFixed(2), Math.max(...x).toFixed(2)] : null;
console.log(JSON.stringify({ ...m, ePos: s(m.ePos), eVa: s(m.eVa), eW: s(m.eW), eLM: s(m.eLM), eAlpha: s(m.eAlpha), clothes3: s(m.clothes3), elev: s(m.elev), height: s(m.height) }));
