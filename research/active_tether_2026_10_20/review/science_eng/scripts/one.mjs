import { diag } from './diag.mjs';
const id = process.argv[2]; const over = JSON.parse(process.argv[3] || '{}');
const t0 = Date.now(); const d = diag(id, over); delete d.R; console.log(JSON.stringify(d)); console.error((Date.now() - t0) / 1000, 's');
