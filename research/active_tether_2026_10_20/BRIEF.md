# Active-tether follow-cam (SIM-032) — team brief, 2026-10-20

## User direction (verbatim intent)
Take the tethered glider/kite follow-cam in a new direction: **automatically control reeling in and letting out the line**, with the reel mechanism either in the backpack or on the kite/glider itself.
- Normally stowed on the back.
- When the skier starts moving, gyros/IMU + algorithms detect it and automatically pay out the line.
- The flyer decides what to do from **line tension, wind, gyro readings and even camera images**: when there is enough lift, let line out; when lift drops, reel in to generate more lift ("like a person flying a kite") — actively keeping itself airborne.
- When the skier stops, automatically reel it in and return it to its stowed position on the back.
- Dig into the science; make bold hypotheses, then test them carefully. Scientists, engineers, product managers and user testers develop, review and finalise the design together.

## Project rules (AGENTS.md / CLAUDE.md — mandatory)
- Simulation and animation are NOT physical verification. Never claim a physical test passed. G-MATURE closed, M-070 not_run.
- No purchasing, outreach, or physical experiments. Only the integrator writes `project/plan.json` (task SIM-032) and deploys.
- Docs default to Chinese for user-facing docs; research JSON/notes may be English.
- Cite sources (URL) for every non-trivial number; mark guesses ASSUMED.

## What we already know (rounds 1–4, research/concepts_2026_10_19/, docs/20-concept-selection-zh.md §5–8)
- Shared judged rules (sim/js/concepts/common/): 48-case full run `FULLRUN_CASES_R4` (ride 38 s, stop 20 s, ride 33 s, stop 10 s; calm + 3/6/9 m/s head/tail/cross + tail 3.5/4.5/5.5, 3 seeds), wind gates must use `windEstimate`, headClear via `helmetAt` ≥1.0 m, artefact ≥2 px over subject counts, bodyPx ≥300, no idealised actuators/estimators, KE ≤14.9 J (FAA Cat 2), packVol ≤3 L, setup p90 ≤30 s, ops p90 ≤2, jitter p90 ≤3 °/s (footageStability), endurance ≥45 min at −10 °C (components.js battery basis), body force ≤40 N, added mass ≤1.5 kg.
- kite2 (drogue canopy, L/D ≈0.75) failed: tailwinds (rider motion − tailwind = little apparent wind), the line from body to canopy crosses the camera view and hangs 0.7–0.8 m above snow behind the rider (clothesline), a thin boom to keep the line out of shot is unbuildable.
- towglider (132 g leashed glider, passive-ish reel) failed: tailwind ≥3 m/s refusals → avail 49 %; trip-line low behind rider.
- leapfrog (free gravity glider, morphing wing) passes with thin margins.
- Gravity-glider insight: the slope supplies energy; KE cap → speed cap √(2·14.9/m).

## Key physics to (re)examine for the new direction
- Tethered-wing equilibrium: elevation angle vs L/D (tan ε ≈ L/D for weightless wing in steady wind; weight and line drag reduce it). High-L/D gliders could fly almost overhead → line steep → clothesline and camera-line geometry may change completely.
- Reel-in as an energy source (kite "pumping", airborne-wind-energy reel-in/out cycles, winch launch of sailplanes, towed-glider dynamics): reeling in at speed v_r adds v_r to apparent wind; power = T·v_r from the battery.
- Apparent wind = wind − skier velocity (+ reel speed along the line). At stops and in tailwinds the reel must supply it.
- Safety: KE in the ground frame, line snap-back, line as a trip/clothesline hazard, head clearance, the reel as a strike-energy governor.
- Autonomy: start/stop detection from IMU, tension-based flight state estimation, line-angle sensing, vision, launch from the back and docking back onto it.
