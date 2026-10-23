// Audit2: integrator footageStability(R) (common/criteria.js) on all 39 towglider full-run cases. node fs_all.mjs [SIMROOT]
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve as presolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const SIMROOT = presolve(process.argv[2] || process.env.SIMROOT || '/tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/tgcopy/sim');
const imp = (p) => import(pathToFileURL(join(SIMROOT, p)).href);
const TG = await imp('js/concepts/towglider/index.js');
const { FULLRUN_CASES, pct } = await imp('js/concepts/common/fullrun.js');
const { footageStability } = await imp('js/concepts/common/criteria.js');
const P = Object.fromEntries(TG.default.params.map((p) => [p.id, p.v]));
const rows = [];
for (const c of FULLRUN_CASES) { const R = TG.default.simulate(P, TG.fullrunScenario(c)); const f = footageStability(R); rows.push({ id: c.id, U: c.U, dir: c.dir, subjectRms: f.subjectRms, backgroundRms: f.backgroundRms, devJitter: R.summary.jitterRms }); }
const fl = rows.filter((r) => Number.isFinite(r.subjectRms));
const s = (k) => ({ mean: fl.reduce((a, r) => a + r[k], 0) / fl.length, p90: pct(fl.map((r) => r[k]), 0.9), max: Math.max(...fl.map((r) => r[k])) });
const out = { note: 'flown cases only (gated runs have no footage)', n: fl.length, subjectRms: s('subjectRms'), backgroundRms: s('backgroundRms'), devJitter: s('devJitter'), over3: fl.filter((r) => r.subjectRms > 3).map((r) => r.id), rows };
writeFileSync(join(here, 'out_fs_all.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, rows: undefined }));
