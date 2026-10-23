# Concept lab modules (SIM-030)

`concepts.html` + `js/concepts/lab.js` run any number of product concepts on one
shared skier model, wind model and footage metric, so the concepts can be compared on the same task.
Each concept lives in its own folder `js/concepts/<id>/` and is registered in
`js/concepts/index.js`. Concept folders must not edit shared files; ask the
integrator if a shared hook is missing.

## Shared modules
- `common/skier.js`: `simulateSkier(opts)` gives a deterministic physics trajectory (slope, drag,
  friction, speed control by skidding, carve/short turns, push-off, hockey stop, fall).
  `skierAt(sk, t)` returns `{pos, heading, vel, speed, lat, accel, lean, crouch, plantL, plantR, fallen}`.
  `bodyPoints(s)` gives approximate pelvis/chest/packTop/packMid/head/feet points, inclined into the turn.
- `common/env.js`: `makeWind({mean, intensity, Lu, seed, gustAt, gust})` returns `wind(t, p) → [u,v,w]` (m/s).
  `footage(cam, s)` returns the subject's pixel height, fill, in-frame flag, framing offset, and viewing azimuth
  (0 = from behind, ±90 = side, 180 = front) and elevation. `losJitter()` gives the line-of-sight angular rate. `stats()`.
- Model coordinates throughout: x is downslope, y is left, z is up, in metres. The slope is planar, z = −x·tanθ, within |y| < 22 m.

## Concept module (`<id>/index.js`, default export)
```js
{
  id, name: {zh, en}, tagline: {zh, en}, family: 'aerial'|'body'|'snow'|'computational'|'baseline',
  modelVersion: 'id@0.1.0',
  modelLimits: [{zh, en}],              // what the model does NOT capture
  params: [{ id, zh, en, unit, v, min, max, step, src: 'CALC'|'LIT'|'ASSUMED', note }],
  scenarios: [{ id, zh, en, ...anything simulate() needs }],
  simulate(params, scenario) → Result,  // deterministic, must run in Node (no DOM) for tests
  demo: { duration, stages: [{ key, t0, t1, zh, en, pending }], build(params) → Result },  // cinematic
  gear: () => import('./gear.js'),       // renderer module (browser only)
}
```
**Result**
```js
{ conceptId, scenarioId, modelVersion, duration, sampleDt, n,
  columns: { t: Float64Array, <name>: Float64Array, ... },      // NaN = unavailable
  events: [{ t, type, severity: 'info'|'warning'|'invalid', zh, en }],
  metrics: [{ id, zh, en, value, unit, pass: true|false|null, criterion: {zh, en} }],
  plots: [{ key, zh, en, series: [[colName, unit, labelZh, labelEn], ...] }],
  validUntil: null | t, scopeEnd: null | t,
  frame(t) → FrameState }
```
**FrameState** (model coordinates)
```js
{ t, tanS,
  skier: { pos, heading, speed, lat, accel, crouch, handL?, handR?, reachL?, reachR?, noPoles?, plantL, plantR,
           pack: 'plain'|'none'|'kite' },
  device: { ... },                 // passed verbatim to gear.update()
  productCam: { pos, fwd, up, vfovDeg, label } | null,   // what the product actually records → rendered as an inset
  labels?: [{ p, text, color }] }
```
**Gear** (`gear.js`, browser)
```js
export function createGear(scene, THREE) → { update(device, ctx), setVisible(bool), hideInPip: [Object3D] }
export function shots(t, st3, { frame, mode, result, THREE }) → { pos, target, fov, dof?: {focus, aperture}, shot } | null
// st3 (THREE.Vector3, three.js space): { pos (skier feet), fwd, left, chest, hands:{L,R}, kite, boomTip }; return null to
// fall back to the generic chase/side/front/orbit director. mode = 'test' | 'demo'.
// ctx = { skier (rig: packC, packBack, packUp, packX, headPos, pelvisPos, shoulders, hands, basis), toV, t, dt, seekJump, fwd, slopeN, tanS, camera, scene }
```
`toV([x,y,z])` maps model coordinates to three.js coordinates as (x, z, −y). Use PBR materials (MeshPhysicalMaterial) that match `render/skier.js`.

## Evidence rules
Simulation is numerical and uncalibrated, and the demo is an illustration. Neither is a physical test. Mark assumptions as `ASSUMED`.
Never present generated or reconstructed imagery as real footage.
