# Round-2, iteration 3 brief (after re-audit, 2026-10-20)

Re-audit: research/concepts_2026_10_19/audit2/ (findings.json, cross/consistency.json, <id>/part.json) and the cross-concept
matrix research/concepts_2026_10_19/summary/matrix.json. All ensembles reproduced; none of the four is a usable solo
follow-cam as specified yet. descentglider is frozen as a documented negative result. kite2, towglider and leapfrog get
one more iteration. ITERATE_BRIEF.md still applies.

## Shared judging rules now fixed in code (integrator; import, do not edit)
- common/fullrun.js: availMask(sk) = col.riding (refused/no-fly runs count 0); jitter = p90 over flown cases of
  footageStability(R).subjectRms (shared metric, no private masks); ops judged on p90, max reported; setupTime must be
  simulated incl. any retrieval walk/ride (no constants); every wind gate/interlock must use windEstimate() (10 s trailing
  mean + seeded ±1 m/s bias + 0.5 s lag) — no oracle wind.
- common/criteria.js: new judged metric headClear ≥1.0 m (ASSUMED): min distance of any airborne body, line or rotor disc
  to the helmet centre over the full run (stops, launch, landing included), excluding only a declared ≤3 s dock-capture
  window. Report it (ensemble min) via addStd.
- common/components.js enduranceMin(..., {heated}) now charges the cell heater over the whole day (lift time too).
- Line/clothesline exposure is a documented gate: report min line height above snow 1 m and 2 m behind the rider
  (ensemble p10/min) and a bystander contact force estimate.
Regenerate everything on this basis, report claimed values that match an independent recompute.

## Goal of this iteration
Make the concept usable within the honest physics, not just pass a table. Address every major re-audit finding for your
concept with a design change where possible; otherwise state it as an envelope limit or a kill test. Update
audit_response.json (add a section "audit2"). Keep the demo accurate to the device (visual check, zero console errors).
