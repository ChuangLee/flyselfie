# Round-2 iteration brief (after the independent audit, 2026-10-19)

The audit (research/concepts_2026_10_19/audit/findings.json, verdicts.json, comparability.json, part_<id>.json,
out_<id>.json) found 0 fatal and 37 major issues. None of the four concepts passes as specified. The user wants
USABLE original concepts: fix what is fixable, redesign where needed, and state the honest envelope for the rest.

## New shared basis (integrator, do not edit — import it)
- `sim/js/concepts/common/components.js`: shared component masses/powers (camera 16 g / 2.5 W, 2-axis micro gimbal
  30 g, avionics 10 g / 1 W, vision compute 11 g / 2.5 W, servos, motors, wiring), BATTERY (150 Wh/kg pack level,
  200 Wh/kg optimistic sensitivity only, cold factor 0.75, 15 % reserve, NO charging below 0 °C unless the cell is heated
  and the heater power is charged to the budget), ATMOS ρ = 1.0, MASS_MARGIN 15 %, helpers budget(), enduranceMin(),
  packWh(), keSpeedCap(). Build your flying mass from this table (+ your structure with a justified g/m² or g/m),
  apply the margin, and use these battery rules. Deviations must be explicit and justified with a source.
- `sim/js/concepts/common/fullrun.js`: simulateRun() (push-off at top → ride 38 s → stop, 20 s rest → push-off →
  ride 33 s → stop at the lift approach, ≈104 s) returning a skier object compatible with skierAt(); FULLRUN_CASES
  (39 cases: calm + 3/6/9 m/s × head/tail/crossL/crossR × 3 seeds). Add a scenario `fullrun` (one representative case,
  e.g. crossR6_s12) and an ensemble evaluation in run_all.mjs over ALL 39 cases. The harmonised metrics avail,
  setupTime (p90), ops (p90 and max), bodyForcePeak (max), keMax (max) and endurance (from mean full-run power) are
  JUDGED ON THE ENSEMBLE; report mean/p10/p90 per metric in results.json and expose the ensemble summary as concept
  metrics in index.js (precomputed constants are fine if a test re-checks a subset). Also report per wind speed bin,
  so the envelope is visible. Each case must still compute in < ~1.5 s.
- `common/env.js` makeWind: one-shot gust envelope fixed; turbulence modes now have oblique wavefronts (±60°) so a
  platform moving across the wind meets gusts. Regenerate all results; some of your tests may now fail — re-tune
  honestly (never loosen a test just to pass; if a behaviour changed, explain).
- `common/criteria.js`: packVol ≤3 L (ASSUMED) is judged.

## Footage stability for gliders
Point-mass + ideal gimbal passes by construction (audit X-05). Add attitude response to turbulence (at least a
2nd-order roll/pitch/yaw response driven by the gust field at the airframe's short-period/roll-mode bandwidth) and a
gimbal residual model (bandwidth-limited rejection, e.g. 1st order with a stated rejection ratio; no gimbal = EIS crop
with stated residual), then compute jitter. Also report jitter normalised by output crop FOV (%/s of frame height).

## Regulation / safety gates (cannot be fixed by design alone; still minimise exposure)
Resort written permission is a gate for every concept. Gliders: design for EU C0 (<250 g) and a 50 m follow-me
geofence/fail-safe; state the US VLOS issue. Kite: line height and bystander protection (breakaway, visibility,
proximity sensing), kiting bans.

## Deliverables
Update your own files only (sim/js/concepts/<id>/, sim/tests/concept_<id>.test.mjs, research/concepts_2026_10_19/dev/<id>/).
Add `audit_response.json` in your dev folder: for every finding with your concept id (and X-01..X-07) → status
fixed/partly/not fixable, what changed, new numbers. Keep the demo working and accurate to the redesigned device
(visual check with the screenshot helper; zero console errors). `cd sim && npm test` green for your tests.
