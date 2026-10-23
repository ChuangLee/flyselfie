// independent diagnostic of one case: availability-loss decomposition, KE decomposition, head-clearance events
import concept, { buildResult, prepare } from '../sim/js/concepts/activetether/index.js';
import { FULLRUN_CASES_R4, availMask } from '../sim/js/concepts/common/fullrun.js';
import { skierAt, bodyPoints } from '../sim/js/concepts/common/skier.js';
import { MODE, MODE_NAME, AIRBORNE } from '../sim/js/concepts/activetether/model.js';
import { footageStability } from '../sim/js/concepts/common/criteria.js';
const P0 = Object.fromEntries(concept.params.map((p) => [p.id, p.v]));
export function diag(id, over = {}, { fs = true, caseObj = null, skierOver = null } = {}) {
  const c = caseObj || FULLRUN_CASES_R4.find((x) => x.id === id);
  const sc = { id: 'case', rider: 'run', caseObj: c };
  const prep = prepare({ ...P0, ...over }, sc);
  const R = buildResult({ ...P0, ...over }, sc, prep);
  const { O, n } = R.core, A = R.analysis, J = R.judge, p = R.core.p;
  const rid = availMask(prep.sk), SDT = 0.02;
  const cat = { notAirborne: 0, launch: 0, brakeRetrieve: 0, flyNotInFrame: 0, flyPxLow: 0, flyArt: 0, flyFit: 0, avail: 0, other: 0 };
  let rideN = 0;
  const keFly = [], keStop = [], vrelFly = [], vexit = [], vF = [], vMeanCourse = [];
  for (let i = 0; i < n; i++) {
    const r = rid[Math.min(rid.length - 1, Math.round((i * SDT) / prep.sk.sampleDt))] > 0;
    const m = O.mode[i];
    if (r) {
      rideN++;
      if (A.avail[i] === 1) cat.avail++;
      else if (!AIRBORNE(m)) cat.notAirborne++;
      else if (m === MODE.LAUNCH) cat.launch++;
      else if (m !== MODE.FLY) cat.brakeRetrieve++;
      else if (!(A.filming[i] === 1) || !A.inFrame[i]) cat.flyNotInFrame++;
      else if (A.art[i]) cat.flyArt++;
      else if (!A.fit[i]) cat.flyFit++;
      else if (A.bodyPx[i] < 300) cat.flyPxLow++;
      else cat.other++;
    }
    if (m === MODE.FLY && r) {
      const v = [O.fvx[i], O.fvy[i], O.fvz[i]], e = [O.evx[i], O.evy[i], O.evz[i]];
      const vv = Math.hypot(...v), ve = Math.hypot(...e), vr = Math.hypot(v[0] - e[0], v[1] - e[1], v[2] - e[2]);
      vF.push(vv); vexit.push(ve); vrelFly.push(vr); keFly.push(0.5 * p.m * vv * vv);
    }
  }
  for (const k in cat) cat[k] = +(100 * cat[k] / Math.max(1, rideN)).toFixed(2);
  const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))].toFixed(2); };
  // ke peak location and decomposition
  let kb = -1, kv = -1; for (let i = 0; i < n; i++) if (A.ke[i] > kv) { kv = A.ke[i]; kb = i; }
  const kpk = kb >= 0 ? { t: +(kb * SDT).toFixed(2), mode: MODE_NAME[O.mode[kb]], ke: +kv.toFixed(1), vF: +Math.hypot(O.fvx[kb], O.fvy[kb], O.fvz[kb]).toFixed(2), vExit: +Math.hypot(O.evx[kb], O.evy[kb], O.evz[kb]).toFixed(2), riderV: +skierAt(prep.sk, kb * SDT).speed.toFixed(2), L: +O.L[kb].toFixed(2) } : null;
  let hb = -1, hv = 99; for (let i = 0; i < n; i++) if (A.headClear[i] < hv) { hv = A.headClear[i]; hb = i; }
  const hc = hb >= 0 ? { t: +(hb * SDT).toFixed(2), mode: MODE_NAME[O.mode[hb]], d: +hv.toFixed(2), riderV: +skierAt(prep.sk, hb * SDT).speed.toFixed(2), L: +O.L[hb].toFixed(2), T: +O.T[hb].toFixed(1), what: A.headFlyer[hb] < A.headLine[hb] ? 'flyer' : 'line' } : null;
  // KE over FLY while riding vs KE over the stop transients
  const keByMode = {};
  for (let i = 0; i < n; i++) { if (!Number.isFinite(A.ke[i])) continue; const k = MODE_NAME[O.mode[i]]; keByMode[k] = Math.max(keByMode[k] || 0, +A.ke[i].toFixed(1)); }
  // head clearance with the capture exclusion limited to the LAST 3 s of each capture window (rule text: "≤3 s")
  let hc3 = 99, hcAll = 99; { const ex = new Uint8Array(n); let s0 = -1; for (let i = 0; i <= n; i++) { const w = i < n && O.capWin[i] === 1; if (w && s0 < 0) s0 = i; if (!w && s0 >= 0) { for (let k = Math.max(s0, i - 150); k < i; k++) ex[k] = 1; s0 = -1; } }
    for (let i = 0; i < n; i++) { const d = Math.min(A.headFlyer[i], A.headLine[i]); if (!Number.isFinite(d)) continue; hcAll = Math.min(hcAll, d); if (!ex[i]) hc3 = Math.min(hc3, d); } }
  const jit = fs ? footageStability(R).subjectRms : NaN;
  return { id: c.id, avail: +J.avail.toFixed(2), pxMed: J.pxMed, jitter: jit, keMax: J.keMax, headClear: J.headClear, launches: J.launches, launchFails: J.launchFails, dockTimes: J.dockTimes, cat,
    fly: { vF: [q(vF, .5), q(vF, .9), q(vF, 1)], vExit: [q(vexit, .5), q(vexit, .9), q(vexit, 1)], vRel: [q(vrelFly, .5), q(vrelFly, .9), q(vrelFly, 1)], ke: [q(keFly, .5), q(keFly, .9), q(keFly, 1)], keFloorExitMedian: q(vexit, .5) != null ? +(0.5 * p.m * q(vexit, .5) ** 2).toFixed(2) : null },
    kePeak: kpk, hc3: hc3 < 99 ? +hc3.toFixed(3) : null, hcNoExcl: hcAll < 99 ? +hcAll.toFixed(3) : null, keByMode, headMin: hc, m: p.m, R };
}
