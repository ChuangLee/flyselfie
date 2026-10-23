// Generates the bundled reference replays (data/reference/*.json) with the browser
// solver and default inputs. Each file carries model version, input hash and an
// FNV-1a checksum; the app uses a replay only when the input hash matches.
// Usage: node tools/gen-reference.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, resultToJSON } from '../js/model/solver.js';
import { SCENARIOS } from '../js/model/scenarios.js';
import { defaultInputs } from '../js/model/config.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'reference');
mkdirSync(out, { recursive: true });
const files = [];
for (const sc of SCENARIOS.filter((s) => s.evidence === 'numerical')) {
  const res = resultToJSON(simulate(sc, defaultInputs()));
  const name = `${sc.id}.json`;
  writeFileSync(join(out, name), JSON.stringify(res));
  files.push(name);
  console.log(`${name}  hash=${res.inputHash}  validUntil=${res.validUntil}  scopeEnd=${res.scopeEnd}  ${res.checksum}`);
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ note: 'Reference replays computed by the browser solver with default inputs; uncalibrated numerical evidence, not L1 source-model replays.', files }, null, 2) + '\n');
