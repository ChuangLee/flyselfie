// Configuration and parameter definitions for SIM-010 first release.
//
// Source labels (FE-04): every value states where it comes from.
//   REQ     — value stated in docs/16-project-requirements-en.md (§2, §12) for L1.
//   ASSUMED — placeholder chosen for this simulator because the signed L1
//             configuration files are not present in this repository. Replace by
//             importing the L1 release; until then results are not L1 results.
//   MODEL   — numerical/model-domain constant of the browser solver.

export const CONFIG = {
  id: 'L1-D1-R1+R2/sim-placeholder',
  baseline: 'L1-D1-R1 with operation amendment R2',
  note: 'L1 release files were not available when this simulator was built; geometry and model constants marked ASSUMED are placeholders, not L1 signed values.',
  maturity: 'L1: limited D1 (per requirements §2). G-MATURE gate closed.',
  pendingTests: ['M-070 physical tests', 'aerodynamic coefficients', 'cold / wet snow', 'imaging quality', 'human factors', 'complete-cycle'],
};

export const MODEL = {
  id: 'pm-tether',
  name: 'Point-mass kite on straight spring-damper tether',
  version: '0.1.0',
  evidence: 'numerical-uncalibrated',
  limits: [
    'point mass: no attitude, no 6-DOF, no soft-wing deformation; lateral stability represented only by the assumed roll-stability blend',
    'constant CL/CD (bridle-fixed angle of attack); stall and lift loss are NOT modeled — airspeed below the domain invalidates the run',
    'straight tether; slack tether shape, tether drag and entanglement NOT modeled — sustained slack invalidates the run',
    'no contact model — ground or body contact invalidates the run',
    'skier is a kinematic path; tether load does not affect the skier',
    'inputs uncalibrated against physical measurements (VV-03 open)',
  ],
};

// Constants of the solver, shown read-only in the UI.
export const MODEL_CONSTANTS = {
  g: { v: 9.81, unit: 'm/s²', src: 'MODEL' },
  tetherStiffness: { v: 3000, unit: 'N/m', src: 'MODEL', note: 'numerical penalty stiffness, not a tether material property' },
  tetherDamping: { v: 8, unit: 'N·s/m', src: 'MODEL' },
  dt: { v: 0.001, unit: 's', src: 'MODEL' },
  sampleDt: { v: 0.02, unit: 's', src: 'MODEL' },
  slackInvalidAfter: { v: 0.3, unit: 's', src: 'MODEL' },
  nearEndLength: { v: 0.35, unit: 'm', src: 'ASSUMED' },
  anchorBack: { v: 0.15, unit: 'm', src: 'ASSUMED', note: 'backpack anchor offset behind body axis' },
  dockZone: { v: 0.6, unit: 'm', src: 'ASSUMED', note: 'kite–anchor distance below which the docking/handover interface applies' },
  launchClearGrace: { v: 1.0, unit: 's', src: 'ASSUMED' },
  bodyRadius: { v: 0.25, unit: 'm', src: 'ASSUMED' },
  bodyHeight: { v: 1.75, unit: 'm', src: 'ASSUMED' },
  clearanceWarn: { v: 0.3, unit: 'm', src: 'ASSUMED' },
};

// Editable parameters. `supported: false` parameters are shown disabled so they
// never appear to be effective (FE-04).
export const PARAMS = [
  // scenario
  { id: 'skierSpeed', group: 'scenario', unit: 'm/s', def: 8, min: 0, max: 20, step: 0.5, src: 'ASSUMED' },
  { id: 'slopeDeg', group: 'scenario', unit: '°', def: 15, min: 0, max: 35, step: 1, src: 'ASSUMED' },
  { id: 'turnAmplitude', group: 'scenario', unit: 'm', def: 3, min: 0, max: 8, step: 0.5, src: 'ASSUMED' },
  { id: 'turnPeriod', group: 'scenario', unit: 's', def: 6, min: 2, max: 20, step: 0.5, src: 'ASSUMED' },
  { id: 'windSpeed', group: 'scenario', unit: 'm/s', def: 3, min: 0, max: 15, step: 0.5, src: 'ASSUMED' },
  { id: 'windFromDeg', group: 'scenario', unit: '°', def: 0, min: -180, max: 180, step: 5, src: 'ASSUMED' },
  { id: 'gustIntensity', group: 'scenario', unit: 'm/s', def: 0.5, min: 0, max: 3, step: 0.1, src: 'ASSUMED' },
  { id: 'seed', group: 'scenario', unit: '', def: 1, min: 0, max: 999999, step: 1, src: 'MODEL', integer: true },
  { id: 'airDensity', group: 'scenario', unit: 'kg/m³', def: 1.1, min: 0.9, max: 1.4, step: 0.01, src: 'ASSUMED' },
  // design
  { id: 'airborneMass', group: 'design', unit: 'kg', def: 0.30, min: 0.1, max: 0.6, step: 0.01, src: 'ASSUMED', ref: 'REQ §12: L1 airborne design ceiling 0.34 kg' },
  { id: 'wingArea', group: 'design', unit: 'm²', def: 0.25, min: 0.05, max: 1.0, step: 0.01, src: 'ASSUMED' },
  { id: 'CL', group: 'design', unit: '', def: 0.8, min: 0.2, max: 1.5, step: 0.05, src: 'ASSUMED' },
  { id: 'CD', group: 'design', unit: '', def: 0.18, min: 0.05, max: 0.6, step: 0.01, src: 'ASSUMED' },
  { id: 'rollStability', group: 'design', unit: '', def: 0.7, min: 0, max: 1, step: 0.05, src: 'ASSUMED', ref: 'lift-direction blend: 0 tether-aligned, 1 roll-stabilised vertical; stands in for unmodeled attitude dynamics' },
  { id: 'minAirspeed', group: 'design', unit: 'm/s', def: 3, min: 1, max: 8, step: 0.5, src: 'ASSUMED', ref: 'lower bound of the constant-coefficient domain' },
  { id: 'tetherMax', group: 'design', unit: 'm', def: 2.5, min: 0.5, max: 6, step: 0.1, src: 'REQ', ref: 'REQ §12: L1 maximum working external tether 2.5 m' },
  { id: 'prePayout', group: 'design', unit: 'm', def: 0.8, min: 0.3, max: 2.5, step: 0.05, src: 'REQ', ref: 'REQ §12: L1 launch pre-payout 0.8 m' },
  { id: 'anchorHeight', group: 'design', unit: 'm', def: 1.35, min: 0.8, max: 1.8, step: 0.05, src: 'ASSUMED' },
  { id: 'cameraDrop', group: 'design', unit: 'm', def: 0.15, min: 0, max: 0.5, step: 0.01, src: 'ASSUMED' },
  { id: 'cameraFovDeg', group: 'design', unit: '°', def: 180, min: 60, max: 220, step: 5, src: 'ASSUMED' },
  { id: 'payoutRate', group: 'operation', unit: 'm/s', def: 0.8, min: 0.05, max: 3, step: 0.05, src: 'ASSUMED' },
  { id: 'retrievalRate', group: 'operation', unit: 'm/s', def: 0.5, min: 0.05, max: 2, step: 0.05, src: 'ASSUMED' },
  { id: 'operatorPower', group: 'operation', unit: 'W', def: 40, min: 5, max: 150, step: 5, src: 'ASSUMED', ref: 'MC-03: finite operator input, not ideal' },
  { id: 'crankRatio', group: 'operation', unit: '', def: 0.3, min: 0.05, max: 1, step: 0.05, src: 'ASSUMED', ref: 'reel radius / crank radius' },
  // shown but not supported by this model (FE-04)
  { id: 'aspectRatio', group: 'unsupported', unit: '', def: 2, src: 'ASSUMED', supported: false },
  { id: 'wingFlex', group: 'unsupported', unit: '', def: 0, src: 'ASSUMED', supported: false },
  { id: 'tetherDiameter', group: 'unsupported', unit: 'mm', def: 1.2, src: 'ASSUMED', supported: false },
  { id: 'temperature', group: 'unsupported', unit: '°C', def: -5, src: 'ASSUMED', supported: false },
];

export function defaultInputs() {
  const o = {};
  for (const p of PARAMS) if (p.supported !== false) o[p.id] = p.def;
  return o;
}

// Returns { ok, errors: [{id, msg}] }. Invalid input is rejected, never clamped silently.
export function validateInputs(inp) {
  const errors = [];
  for (const p of PARAMS) {
    if (p.supported === false) continue;
    const v = inp[p.id];
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push({ id: p.id, msg: 'not a number' });
    else if (v < p.min || v > p.max) errors.push({ id: p.id, msg: `out of range [${p.min}, ${p.max}] ${p.unit}` });
    else if (p.integer && !Number.isInteger(v)) errors.push({ id: p.id, msg: 'must be an integer' });
  }
  if (!errors.length && inp.prePayout > inp.tetherMax) errors.push({ id: 'prePayout', msg: 'pre-payout exceeds tether maximum' });
  return { ok: errors.length === 0, errors };
}
