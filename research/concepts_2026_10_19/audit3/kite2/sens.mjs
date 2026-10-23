// Audit3 kite2 sensitivities (full 39 cases, dev evaluateCase on a COPY of sim/): imperfect heave compensation and
// winch speed limits. node sens.mjs SIMCOPY_ROOT NAME. Numerical uncalibrated simulation, not physical verification.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2], NAME = process.argv[3];
if (!ROOT || ROOT.startsWith('/root/ai-workspace/flySelfie')) throw new Error('pass a COPY root');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const K2 = await imp('sim/js/concepts/kite2/index.js');
const FR = await imp('sim/js/concepts/common/fullrun.js');
const P = Object.fromEntries(K2.default.params.map((p) => [p.id, p.v]));
const V = {
  hc_0p5: { hc: 0.5 },                                   // feed-forward 50 % effective (latency/estimation error proxy)
  hc_0p5_speed3p7: { hc: 0.5, vRetFast: 3.7, vIn: 3.7, vOut: 3.7, vRet: 3.5 }, // + commanded reel speeds ≤3.7 m/s (22 V with the model's Kt/gear)
  gMaxR0p6_hc0p5: { gMaxR: 0.6, hc: 0.5 },
};
const over = V[NAME];
const rows = FR.FULLRUN_CASES.map((c) => K2.evaluateCase({ ...P, ...over }, c));
const S = K2.summarise(rows).metrics;
const res = { name: NAME, over, avail: S.avail, jitterP90: S.jitterRms.p90, setupP90: S.setupTime.p90, opsP90: S.ops.p90, opsMax: S.ops.max, F50max: S.bodyForcePeak.max, keMax: S.keMax.max, endurance: S.endurance.mean, headClearMin: S.headClear.min };
res.judgedPass = S.avail.mean >= 80 && S.jitterRms.p90 <= 3 && S.setupTime.p90 <= 30 && S.ops.p90 <= 2 && S.bodyForcePeak.max <= 40 && S.keMax.max <= 14.9 && S.endurance.mean >= 45 && S.headClear.min >= 1.0;
console.log(JSON.stringify(res));
writeFileSync(join(here, `out_sens_${NAME}.json`), JSON.stringify({ generated: new Date().toISOString(), ...res }, null, 1));
