# SIM-033 — pole-free backpack kite ("SledPack") — team brief, 2026-10-21

## User direction (verbatim intent)
"Why does the kite setup need a pole strapped to your back? That makes it way too cumbersome. Ideally the glider should
sit on your back like a backpack and stay docked there when not in use. Once it detects enough speed and wind, it
should automatically let out the line and take off. Keep the whole setup user-friendly and easy to use."
Then: feasibility analysis → refined design → a polished, high-end promotional video for the kite concept built on the
existing demo (zh + en). If the video work reveals a product weakness, fix the design first.

## Rules (AGENTS.md / CLAUDE.md, mandatory)
- Simulation/animation is NOT physical verification; never claim a physical test passed. M-070 not_run, G-MATURE closed.
  The promo is a *concept visualisation*: every frame labelled as simulation/concept, never presented as real footage,
  untested behaviour not packaged as proven.
- No purchasing, outreach, physical experiments. Only the integrator writes project/plan.json and deploys.
- User-facing docs in Chinese; research JSON may be English. Cite sources; mark guesses ASSUMED.
- Shared judged rules: sim/js/concepts/common/ (FULLRUN_CASES_R4 48 cases, windEstimate gates, helmetAt, artefactCounts,
  bodyPx, no idealised actuators/estimators, criteria.js 13 metrics). Do NOT change shared criteria; report any proposed
  criterion change separately as an option for the user.

## Why the existing kite demo has a pole (why_pole.py)
- headClear ≥1.0 m applies to the *line* as well as the flyer. Distance from the helmet to a straight line leaving an exit
  point can never exceed |exit − helmet|. Every body-worn pole-free exit is 0.3–0.7 m from the helmet (lumbar sleeve
  0.52–0.69 m at 65–30° elevation). Only a boom/quiver tip ≥1 m away (AT-1 quiver 1.0–1.14 m) passes. The 2026-10-18 demo
  boom (0.72 m raised 62°) gives only 0.76 m, so it did not meet the rule either.
- The boom also kept the line high behind the rider (no clothesline) and out of the camera view (kite2).
- So "no pole" means: (a) the line clearance rule cannot be met by any pole-free tether; it must be reported honestly
  and offered to the user as a split rule (flyer ≥1.0 m unchanged; line ≥X m with weak link) — a USER decision; (b) the
  clothesline and camera-line problems must be solved by a high line elevation and camera offset instead.

## Lessons from SIM-032 (AT-1, docs/20 §9) that the new design must answer
1. KE: a 116 g rigid delta whips to 25–31 m/s while carving → 57 J. Lighter *gliders* whip faster. → Use a high drag/mass
   soft kite that cannot overspeed the air, mass ≤60–65 g incl. camera pod.
2. Tailwind refusals and slow launch/recovery cap avail at ~30–45 %. → Wing loading ~0.2 kg/m² flies at ~2 m/s
   apparent; launch by letting airflow pull it out of the sleeve (drogue-style), ≤2 s.
3. Reel cannot control tension on a steep line; a sled pulls 2–100 N over 4–22 m/s apparent. → Pack-side depower line
   (two-drum reel, both lines driven from the back, no actuator on the flyer → stays a kite under FAA §101).
4. Stops: wind carries a flying wing over the head. → Depower at deceleration onset → kite becomes a drogue streaming low
   behind → fast reel-in while the rider still moves; on the snow, tow in low; dock into the lumbar sleeve from below.
5. Endurance/mass: put almost all energy in the pack; the pod carries a ~0.3–0.6 Wh cell for one run and is
   recharged (after warming) through dock contacts during the lift ride (dock-charging).
6. Start detection, lift/vehicle lockouts and session arm from AT-1 detect.js are reused.

## Hypotheses to test (bold, then try to refute)
- SP-H1 A ≤65 g soft sled kite (two longitudinal carbon spars, single-skin, no rigid wing) keeps ground-frame KE ≤14.9 J
  in all 48 cases because drag limits whip (KE ≈ ½ m v_rider² × ≤1.6).
- SP-H2 Pole-free lumbar sleeve: flyer clearance ≥1.0 m outside the ≤3 s capture window; line clearance ~0.5–0.7 m
  (fails the current 1.0 m line rule by geometry, reported as such).
- SP-H3 Low wing loading lifts avail ≥80 % (launch ≤2 s from 4 m/s apparent, tailwind refusals only when rider speed −
  tailwind < ~3 m/s).
- SP-H4 Pack depower line keeps body force ≤40 N up to 22 m/s apparent.
- SP-H5 A sled pulled nose/bridle-first into a 50–60 mm sleeve folds itself (spars parallel to the pull) → first-try
  dock ≥95 % (ASSUMED capture model, disclosed).
- SP-H6 Line elevation ≥55° keeps the low line (below 2 m) within ~1 m behind the exit (no clothesline), and a ≥0.1 m
  camera offset from the line keeps the line <2 px over the subject.
- SP-H7 Pod pendulum + gust jitter can be held ≤3 °/s with gyro-EIS crop + subject-tracking reframe (real product
  capability only; no ideal tracker).
- SP-H8 Packed ≤3 L, worn ≤1.0 kg, endurance ≥45 min at −10 °C with dock-charging.
