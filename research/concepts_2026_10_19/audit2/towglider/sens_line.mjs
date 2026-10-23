// Audit2: endurance sensitivity of towglider to the leash conductor resistance (and pack specific energy).
// node sens_line.mjs [SIMROOT]  -> out_sens_line.json. Runs on a copy; mutates only in-memory objects.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve as presolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const SIMROOT = presolve(process.argv[2] || process.env.SIMROOT || '/tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/tgcopy/sim');
const imp = (p) => import(pathToFileURL(join(SIMROOT, p)).href);
const TG = await imp('js/concepts/towglider/index.js');
const { LINE, powerChain, gliderBudget } = await imp('js/concepts/towglider/design.js');
const { FULLRUN_CASES } = await imp('js/concepts/common/fullrun.js');
const P = Object.fromEntries(TG.default.params.map((p) => [p.id, p.v]));
const cases = FULLRUN_CASES.filter((c) => c.seed === 12 && !(c.dir === 'tail' && c.U >= 6));
const out = { note: 'seed-12 flown cases (11); endurance = usable hip Wh / mean run energy × mean filming s (developer formula, shared cold/reserve rules)', rows: [] };
const r0 = LINE.ohmPerM;
for (const ohm of [1.8, 3.6, 5.4, 9]) {
  LINE.ohmPerM = ohm;
  const rows = cases.map((c) => TG.evaluateCase(P, c));
  const st = TG.ensembleStats(rows);
  const pc = powerChain(gliderBudget('panEIS', 0.075).W);
  out.rows.push({ ohmPerMperConductor: ohm, lossPct: +pc.lossPct.toFixed(1), dropV: +(pc.I * pc.Rloop).toFixed(1), hipInW: +pc.hipIn.toFixed(2), enduranceMin: +st.endurance.mean.toFixed(1) });
  console.log(JSON.stringify(out.rows.at(-1)));
}
LINE.ohmPerM = r0;
writeFileSync(join(here, 'out_sens_line.json'), JSON.stringify(out, null, 1));
