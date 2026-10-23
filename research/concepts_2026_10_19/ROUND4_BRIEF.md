# Round 4 brief (2026-10-20) — make the concepts actually usable under tightened shared rules

User goal (verbatim intent): keep refining — especially the kite — until it is actually usable for a solo skier; original, not market copies; set-up / take-down / packing as easy as possible; use recent cross-industry breakthroughs where they help.

Read first: ROUND3_BRIEF.md, audit3/findings.json, audit3/<your id>/part.json, summary/matrix.json, sim/js/concepts/README.md, sim/js/concepts/common/{criteria,fullrun,components,env}.js.

## Tightened shared rules (now in sim/js/concepts/common/fullrun.js and env.js — do NOT edit common/; ask the integrator if you need a change)
1. Judged ensemble = `FULLRUN_CASES_R4` (48 cases: the 39 + tail 3.5/4.5/5.5 m/s × 3 seeds).
2. headClear uses `helmetAt(sk, t)` (bodyPoints head) for every concept. Worn rigid members (booms, masts) are excluded from headClear but you must report their min distance to the helmet separately and justify it.
3. Artefacts: `artefactCounts(overlapsSubject, widthPx)` with ARTEFACT_PX = 2 at 1080p-equivalent output. No private tolerance.
4. avail/pxMed use `footage(...).bodyPx` (no ski tips) against 300 px.
5. No idealised actuators/estimators in judged runs: model bandwidth, lag, torque and speed limits from components.js or a cited datasheet (motor Kv/current, gimbal torque, servo deadband, EIS residual, tracking error from live — not offline — framing). Idealised versions only as labelled sensitivities.
6. All previous rules still hold (windEstimate gates, simulated setup, ops p90 ≤2, jitter = p90 footageStability subjectRms, shared battery/cold basis, 14.9 J, 3 L, etc.).

## Deliverables (same layout as round 3)
- Bump model version; update sim/js/concepts/<id>/ and sim/tests/concept_<id>.test.mjs (all must pass: `cd sim && node --test tests/concept_<id>.test.mjs`, and do not break others).
- dev/<id>/: run_all.mjs (48 cases), results.json, design_notes.json (round-4 section), audit_response.json (new "audit3" section answering each A3 finding).
- Demo must still render with zero console errors (screenshot in your scratchpad subfolder r4/).
- Report: 48-case table on all 13 shared metrics, wind-bin breakdown (incl. the tail band), envelope, sensitivities (key uncertain parameters ±), remaining kill tests, files changed. Be honest: a fail stated plainly beats a pass that rests on a hidden assumption.
- Do not write project/plan.json, do not deploy, no purchasing/outreach/physical tests. Simulation is not verification.
