# Round 2 glider development brief (shared by towglider, descentglider, leapfrog)

Both round-2 scouts independently converged on one physics insight: a follower only has to lose height at the terrain
drop rate, so a small glider with L/D 7–12 can follow a skier downhill on gravity alone (the slope pays for flight; the
lift carries it back up). Electrical load is then camera + avionics (~2–3 W), not 30–50 W of hover. Sources:
research/concepts_2026_10_19/scout/ (S2-01 descent glider, S2-02 VTOL tail-sitter, S2-03 skyhook, calc_descent_glider.py)
and research/concepts_2026_10_19/inventor/ (I-01, I-03, I-05 aerotow, I-10 leapfrog, calc_slope_glider.py, calc_leash_reel.py).

Shared physics you must model honestly (each concept implements its own, but use these common assumptions so the
three are comparable; state deviations):
- Low-Re aerodynamics (Re ≈ 50–150 k): CL–CD polar with stall (CLmax ~1.0–1.2 ASSUMED for a folding/thin wing), induced
  drag from aspect ratio and Oswald e, parasitic drag of fuselage/camera pod/folded-hinge penalty; cite the scout/inventor
  numbers and do not use L/D better than they justify (sensitivity runs at L/D −30 % required).
- Point-mass or 6-DOF-lite glider with bank-to-turn (load factor), speed/energy management (spoilers/airbrake or
  regenerative prop), wind = shared makeWind with Taylor advection, plus terrain following (slope z = −x·tanθ and moguls/
  rollers where the scenario has them) and a wake/upwind-of-skier model where the flyer is near the skier.
- Energy budget: gravity power vs drag power each step, battery state for avionics/camera/any motor, at −10 °C.
- Safety: KE relative to snow/bystanders (criteria keMax 14.9 J), behaviour when the skier stops, falls, goes faster than
  the glider can follow, headwind, tailwind, gust, trees/neighbour skier, control or link failure (fail-safe = land on snow).
- Footage: the camera is on the glider; report all 12 harmonised criteria (sim/js/concepts/common/criteria.js, incl.
  packVol ≤3 L, ops ≤2, setupTime ≤30 s), plus footageStability(R) as the independent jitter check.
- Regulation: it is an unmanned aircraft in most jurisdictions even if unpowered; note the class (EU C0 <250 g, FAA
  recreational/Part 107) and resort-rule exposure honestly in design_notes.json.

Everything else follows research/concepts_2026_10_18/DEV_BRIEF.md (deliverables, contract, demo, gear, tests, visual
check, boundaries) with paths sim/js/concepts/<id>/, sim/tests/concept_<id>.test.mjs, research/concepts_2026_10_19/dev/<id>/.
The registry already imports ./<id>/index.js (a stub); replace the stub. The user's round-2 request is in BRIEF.md: original,
practical, as easy as possible to set up / take down / pack away, cross-industry breakthroughs welcome.
