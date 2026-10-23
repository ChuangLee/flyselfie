// Runs every boom360 scenario for designs v3 (default), v2 and v1, the demo, and the
// iteration-2/3 studies (moguls/trunk-motion sensitivity, stabiliser target and spillover,
// stiffness options, stitch trim, snag slip loads, EIS/fusion best case); writes results.json.
// Evidence: numerical-uncalibrated simulation (SIM-030). Not a physical test.
import { writeFileSync } from 'node:fs';
import C, { cfgFor, buildResult } from '../../../../sim/js/concepts/boom360/index.js';
import { design, modes, runBoom } from '../../../../sim/js/concepts/boom360/model.js';
import { TRUNK_PARAMS } from '../../../../sim/js/concepts/common/trunk.js';
const P = Object.fromEntries(C.params.map((p) => [p.id, p.v]));
const P1 = { ...P, design: 1 };
const P2 = { ...P, design: 2 };
const STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'endurance'];
const EXTRA = ['clearance', 'stickVisible', 'rootMomentPeak', 'rootMomentSus', 'foldCount', 'f1Lat', 'f1Sag', 'stabTorquePeak', 'stabPower', 'keCamGround', 'rollInertiaPct', 'yawInertiaPct', 'persp'];
const r3 = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);
const g = (R, id) => { const m = R.metrics.find((x) => x.id === id); return m ? { v: r3(m.value), pass: m.pass } : null; };
const ext = (R, col) => { const a = Array.from(R.columns[col] || []).filter(Number.isFinite); return a.length ? { min: r3(Math.min(...a)), max: r3(Math.max(...a)) } : null; };
const pack = (R, ms) => ({
  id: R.scenarioId, computeMs: Math.round(ms), validUntil: R.validUntil,
  metrics: R.metrics.map((m) => ({ id: m.id, en: m.en, value: r3(m.value), unit: m.unit, pass: m.pass, criterion: m.criterion?.en })),
  events: R.events.filter((e) => e.type !== 'unfold').slice(0, 40).map((e) => ({ t: e.t, type: e.type, severity: e.severity, en: e.en })),
  extremes: Object.fromEntries(['defSag', 'defLat', 'Mroot', 'Fbody', 'jitter', 'stickPx', 'stickSubj', 'motorTau', 'stabPitch', 'stabLat', 'contact'].map((c) => [c, ext(R, c)])),
});
const dsum = (p) => { const d = design(p); return { design: p.design, addedMass: r3(d.addedMass), mTapes: r3(d.mTapes), mTip: r3(d.mTip), mStab: d.mStab, kRootLat: d.kRootLat, foldLat: d.foldLat, tapes: d.nT, stitchMarginMm: d.margin, modes: modes(d) }; };
const out = { concept: 'boom360', modelVersion: C.modelVersion, generated: new Date().toISOString().slice(0, 10), evidence: 'numerical-uncalibrated simulation; ASSUMED inputs; harmonised criteria common/criteria.js (audit 2026-10-18); not a physical test', params: P, designV3: dsum(P), designV2: dsum(P2), designV1: dsum(P1), scenarios: [], scenariosV2: [], scenariosV1: [], demo: null, tables: {}, studies: {} };
for (const sc of C.scenarios) {
  let t = performance.now(); const R3 = C.simulate(P, sc); out.scenarios.push(pack(R3, performance.now() - t));
  if (sc.id === 'nominal_v1' || sc.id === 'nominal_v2') continue;
  t = performance.now(); const R2 = C.simulate(P2, sc); out.scenariosV2.push(pack(R2, performance.now() - t));
  t = performance.now(); const R1 = C.simulate(P1, sc); out.scenariosV1.push(pack(R1, performance.now() - t));
  out.tables[sc.id] = Object.fromEntries([...STD, ...EXTRA].map((id) => [id, { v1: g(R1, id), v2: g(R2, id), v3: g(R3, id) }]));
}
{ const t = performance.now(); const R = C.demo.build(P); out.demo = pack(R, performance.now() - t); }

// (3) moguls sensitivity around the shared calibrated trunk model: pitch amplitude 2–6° × bump frequency 1–3 Hz
const mog = C.scenarios.find((s) => s.id === 'moguls');
out.studies.mogulSensitivity = [];
for (const deg of [2, 4, 6]) for (const f of [1, 2, 3]) {
  const lam = 4.5 / f; // moguls preset speed ≈ 4.5 m/s
  const tp = { terrain: { ...TRUNK_PARAMS.terrain, moguls: { ...TRUNK_PARAMS.terrain.moguls, mogul: { ...TRUNK_PARAMS.terrain.moguls.mogul, pitchAmpDeg: deg, lambda: lam } } } };
  const row = { pitchDeg: deg, freqHz: f };
  for (const [k, p] of [['v1', P1], ['v2', P2], ['v3', P]]) {
    const R = C.simulate(p, { ...mog, trunkParams: tp });
    row[k] = { jitterRms: g(R, 'jitterRms'), avail: g(R, 'avail'), stabPower: g(R, 'stabPower'), foldCount: g(R, 'foldCount') };
  }
  out.studies.mogulSensitivity.push(row);
}
// (2a) stabiliser spillover: IMU on the pack (torso side, feed-forward) vs on the root housing (boom side of the elastomer), gain sweep
out.studies.spillover = [];
for (const sense of ['pack', 'housing']) for (const gain of [0.5, 1, 2]) for (const id of ['nominal', 'moguls']) {
  const sc = C.scenarios.find((s) => s.id === id); const { cfg } = cfgFor(P2, sc); cfg.stabSense = sense; cfg.stabGain = gain;
  const raw = runBoom(P2, cfg); const R = buildResult(P2, sc, raw, cfg);
  out.studies.spillover.push({ design: 2, sense, gain, scenario: id, firstFold: raw.events.find((e) => e.type === 'fold')?.t ?? null, foldCount: raw.foldCount, jitterRms: g(R, 'jitterRms'), torquePeak: r3(raw.motor.torquePeak), backDriveS: r3(raw.motor.slipTime) });
}
// (2b) lateral stiffness options vs stitch hiding and mass
out.studies.stiffness = [];
for (const v of [{ tapes: 2 }, { tapes: 3, latSpread: 0 }, { tapes: 3, latSpread: 0.05 }, { tapes: 3, latSpread: 0.08, kRoot2: 4000 }, { tapes: 2, kRoot2: 4000 }, { tapes: 3, latSpread: 0, kRoot2: 10000, tapeT: 1.0 }, { tapes: 3, latSpread: 0, kRoot2: 10000, tapeT: 1.0, L: 1.3 }]) {
  const p = { ...P2, ...v }; const d = design(p); const row = { variant: { design: 2, ...v }, f1Lat: r3(modes(d).lat[0]), addedMass: r3(d.addedMass) };
  for (const id of ['nominal', 'short', 'gust']) { const R = C.simulate(p, C.scenarios.find((s) => s.id === id)); row[id] = { avail: g(R, 'avail'), jitterRms: g(R, 'jitterRms'), stickVisible: g(R, 'stickVisible'), persp: g(R, 'persp') }; }
  out.studies.stiffness.push(row);
}
// (2e) crosswind stick visibility with and without the stitch yaw trim (and a roll-only alternative is geometrically ineffective, see note)
out.studies.stitchTrim = { note: 'A roll trim about the boom axis cannot move the stitch plane onto points lying along that axis; the trim is a yaw of the camera about e3 aligning the stitch plane with the root→tip chord (0.5 Hz low-pass, ±0.1 rad).', rows: [] };
for (const trim of [0, 1]) for (const id of ['nominal', 'short', 'gust']) { const R = C.simulate({ ...P2, stitchTrim: trim }, C.scenarios.find((s) => s.id === id)); out.studies.stitchTrim.rows.push({ trim, scenario: id, stickVisible: g(R, 'stickVisible'), avail: g(R, 'avail'), stickPxMax: g(R, 'stickPxMax') }); }
// (2c) snag at several branch slip loads, v1 vs v2
out.studies.snag = [];
const sn = C.scenarios.find((s) => s.id === 'snag');
for (const slip of [50, 100, 200, 400]) {
  const row = { branchSlipN: slip };
  for (const [k, p] of [['v1', P1], ['v2', P2], ['v3', P]]) { const s2 = { ...sn, snag: { ...sn.snag, slip } }; const R = C.simulate(p, s2); row[k] = { bodyForcePeak: g(R, 'bodyForcePeak'), rootMomentPeak: g(R, 'rootMomentPeak'), breakaway: R.events.some((e) => e.type === 'breakaway'), folds: g(R, 'foldCount') }; }
  out.studies.snag.push(row);
}
// (3a) v3 stabilisation target: subject-relative (default) vs inertially steady tip (coordinator hypothesis)
const J = ['short', 'moguls', 'fast', 'gust', 'nominal'];
const jrow = (p) => Object.fromEntries(J.map((id) => [id, g(C.simulate(p, C.scenarios.find((s) => s.id === id)), 'jitterRms')]));
out.studies.v3target = { relativeToPelvis: jrow(P), inertialTip: jrow({ ...P, stab3Mode: 1 }), v3off: jrow({ ...P, stab: 0 }), v2: jrow(P2),
  note: 'An inertially steady camera 1.4–1.6 m from the rider sees the rider’s own >1 Hz motion (≈75 mm RMS in short turns); keeping the tip on the pelvis path removes only the torso articulation.' };
// (3b) v3 tip-IMU elastic feedback (spillover) and best-case sensors
out.studies.v3feedback = [0, 0.25, 0.5].map((fb) => ({ stab3Fb: fb, ...jrow({ ...P, stab3Fb: fb }) }));
out.studies.v3sensorsBestCase = { eisResid: 0.02, stab3Noise: 0.5, ...jrow({ ...P, eisResid: 0.02, stab3Noise: 0.5 }) };
// (3c) trunk-motion sensitivity around the shared calibrated model (×0.5 / ×1.5 on the INFERRED amplitudes)
out.studies.trunkSensitivity = [];
const scaleTP = (k) => ({ carve: { ...TRUNK_PARAMS.carve, angulation: TRUNK_PARAMS.carve.angulation * k, pitchTurnDeg: TRUNK_PARAMS.carve.pitchTurnDeg * k, yawCounter: TRUNK_PARAMS.carve.yawCounter * k },
  short: { ...TRUNK_PARAMS.short, angulation: TRUNK_PARAMS.short.angulation * k, pitchTurnDeg: TRUNK_PARAMS.short.pitchTurnDeg * k, yawCounter: TRUNK_PARAMS.short.yawCounter * k },
  terrain: Object.fromEntries(Object.entries(TRUNK_PARAMS.terrain).map(([n, t]) => [n, { ...t, zBodyRms: t.zBodyRms * k, zChatRms: t.zChatRms * k, pitchRmsDeg: t.pitchRmsDeg * k, rollRmsDeg: t.rollRmsDeg * k }])) });
for (const k of [0.5, 1, 1.5]) {
  const row = { amplitudeScale: k };
  for (const id of ['nominal', 'short', 'moguls', 'fast']) { const sc = C.scenarios.find((s) => s.id === id); const R = C.simulate(P, { ...sc, trunkParams: scaleTP(k) }); row[id] = { jitterRms: g(R, 'jitterRms'), avail: g(R, 'avail'), stabPower: g(R, 'stabPower'), foldCount: g(R, 'foldCount') }; }
  out.studies.trunkSensitivity.push(row);
}
out.studies.internalTorsoModel = jrow({ ...P, trunkModel: 0 });
out.studies.trunkModelHook = 'p.trunkModel = 1 (default) drives the torso with common/trunk.js makeTrunk (pitch/roll/yaw + vertical acceleration); 0 = internal kinematic torso model of iterations 1–2.';
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 1));
for (const [id, t] of Object.entries(out.tables)) console.log(id.padEnd(10), ['avail', 'jitterRms', 'azRange', 'bodyForcePeak', 'stickVisible', 'rootMomentPeak', 'foldCount', 'stabPower'].map((k) => `${k} ${t[k]?.v1?.v}/${t[k]?.v2?.v}/${t[k]?.v3?.v}${t[k]?.v3?.pass === false ? '✗' : ''}`).join(' | '));
console.log('v3target', JSON.stringify(out.studies.v3target)); console.log('fb', JSON.stringify(out.studies.v3feedback)); console.log('best', JSON.stringify(out.studies.v3sensorsBestCase)); console.log('trunk', JSON.stringify(out.studies.trunkSensitivity.map((r) => [r.amplitudeScale, r.nominal.jitterRms.v, r.short.jitterRms.v, r.short.avail.v, r.moguls.jitterRms.v, r.fast.jitterRms.v])));
console.log('mogul sens', out.studies.mogulSensitivity.map((r) => `${r.pitchDeg}°/${r.freqHz}Hz v1 ${r.v1.jitterRms.v} v2 ${r.v2.jitterRms.v} v3 ${r.v3.jitterRms.v} (P ${r.v3.stabPower?.v})`).join('; '));
console.log('spill', out.studies.spillover.map((r) => `${r.sense}×${r.gain} ${r.scenario} fold@${r.firstFold} jit ${r.jitterRms?.v}`).join('; '));
console.log('stiff', out.studies.stiffness.map((r) => `${JSON.stringify(r.variant)} f1 ${r.f1Lat} m ${r.addedMass} stk ${r.nominal.stickVisible.v}/${r.short.stickVisible.v}/${r.gust.stickVisible.v}`).join('\n      '));
console.log('trim', out.studies.stitchTrim.rows.map((r) => `${r.trim} ${r.scenario} ${r.stickVisible.v}`).join('; '));
console.log('snag', out.studies.snag.map((r) => `${r.branchSlipN}N v1 ${r.v1.bodyForcePeak.v} v2 ${r.v2.bodyForcePeak.v}`).join('; '));
console.log('demo ms', out.demo.computeMs, out.scenarios.map((s) => s.id + ':' + s.computeMs).join(' '));
