# SIM-033/034 SledPack — design & simulation report (sledpack@0.2.0, iteration I10, 2026-10-21)

Evidence: numerical, uncalibrated simulation (sim/js/concepts/sledpack). Nothing built, flown or user-tested; M-070 not_run,
G-MATURE closed. Parameters ASSUMED unless cited in design.js. I10 applies USER_DECISIONS_2026-10-21.md and the independent
review (review/report.json). I9 archive: REPORT_I9.md, results_I9.json, sensitivity_I9.json, promo_facts_I9.json,
iterations_I9.json, ensemble_I9.js.txt. (Written by the design agent; saved by the integrator.)

## Design (I10)
- Carry: the open sled (0.20 m², 0.59 × 0.46 m) rides flat on the back, nose up between the shoulder blades, keel noses in
  magnetic seats on the shoulder straps, sail top below the shoulders. No pole, sleeve or funnel. Worn 0.617 kg (kite 70.9 g
  incl. 48 MP pod + margin; lumbar module with 120 g 2S battery). Flat stowed envelope 19.9 L; folding into a pack (bonus)
  ≈2.5 L.
- Line exit: short stiff tab with a ring on the hip belt behind the buttocks (0.30 m behind / 0.35 m below the pelvis point,
  ≈0.5 m above snow) — not a pole. At ≤55–60° elevation the line passes ≥1.0 m from the helmet centre (I9 sacrum exit:
  0.77–0.86 m).
- Launch: ride detected + gates (est. apparent wind ≥5.5 m/s, est. tailwind ≤6 m/s) → seats release, the open kite drops
  into the rider's wake (ASSUMED: 70 % deficit, recovering over 1.2 m, ±0.45 m wide) → tension-metered pay-out climbs out of
  the wake; filming after p50 1.9 s / p90 2.6 s.
- Flight: line length follows the 2 s-smoothed est. apparent wind, L = clamp(6 + 0.75·(v_app − 12), 5, 12) m (≈5 m at 8 m/s,
  12 m at 20 m/s), ≈55° elevation; depower line holds ≈14 N (est. AoA ≥14°); lens tilted 8° toward the upper body. Fixed
  viewing angle; steering not adopted (estimate: +25–30 g drum/motor, ≈+15–20 USD parts, four lines through one eyelet, a
  sled steers poorly).
- Stop: full depower; fast pull-down (4.8 m/s) only at real stops while the rider still slides; laid back onto the back if
  the measured line comes in from behind (ASSUMED capture: base 0.9, full at ≤45°, zero at 80°); otherwise parks on the snow
  ≈2.5 m behind and relaunches from there at the next push-off; a kite still parked at the end of the run is stowed by hand
  (20 s, one action).

## Verdict — shared 13 criteria (unchanged, 48 cases): 8 / 13
| Criterion | Value | Target | |
|---|---|---|---|
| avail mean | 44.8 % (calm 66, head 61, cross 52–54, tail 25) | ≥80 % | FAIL |
| bodyPx p50 | 384 | ≥300 | pass |
| jitter p90 | 6.29 °/s (raw drift as AT-1); 3.82 low-pass (info) | ≤3 | FAIL |
| azRange | 0° commandable (swing p50 39°, not a feature) | ≥45° | FAIL |
| added mass | 0.617 kg | ≤1.5 | pass |
| body force max | 35.9 N | ≤40 | pass |
| hands while moving | 0 | ≤5 % | pass |
| standstill p90 | 26.3 s | ≤30 | pass (≈4 s margin) |
| actions p90 | 1 | ≤2 | pass |
| KE max | 14.43 J (p90 11.9) | ≤14.9 | pass, thin |
| packed volume | 19.9 L flat envelope | ≤3 L | FAIL (replaced by user rule) |
| headClear min | 0.49 m (kite 0.75 m) | ≥1.0 | FAIL |
| cold endurance | 50.4 min | ≥45 | pass |

## Verdict — user-revised judgement (integrator quantification, ASSUMED thresholds)
| Item | Value | |
|---|---|---|
| no contact (≥0.25 m) | min 0.49 m | pass |
| each within-1 m episode ≤2 s | max 3.14 s (p50 0.74, p90 1.36) | FAIL |
| within 1 m ≤5 % of riding | max 21.3 % (mean 7.0, p50 2.7, p90 19.4) | FAIL |
| both "brief" rules met | 28/48 cases; fails = tail 3–6 m/s and cross 6–9 m/s (kite swings behind the head each turn) | |
| open on the back, no pole, nothing above helmet | yes | pass |
| fold into a pack (bonus) | ≈2.5 L | pass |
| avail all 48 / user envelope (excl. no-lift time 14.8 %) | 44.8 % / 46.6 % | |
| viewing angle | fixed (accepted) | |

Product numbers: launch success 100 %; parks 1.5 / run; ground relaunches 0.75 / run; docks onto the back ≈1 per 10 stops,
81 % first try when docking; retrieve→locked p90 10.3 s; line <2 m above snow >1 m behind 57 % of airborne riding; others
exposed to a low line ≈72 s / run; tension median 13.8 N, instantaneous max 62.7 N (50 ms mean ≤35.9 N, weak link not
released); elevation p50 55°.

## Hypotheses / user goals
- Carry open + auto launch from the back: works in the model (1.9 s through the wake). Without the wake model 38.4 N body
  force and −1 point avail, so the wake matters; real wake shape, spray and turbulence unknown.
- Auto dock onto the back: mostly NOT achieved — a stopped rider has the kite below/behind on the snow; docks happen only when
  the line still comes in from behind. Park-and-relaunch from the snow replaces docking at intermediate stops.
- Higher/farther when fast and windy: implemented, costs footage (fixed 6 m: 48.1 % vs 44.8 %; px drops at 10–12 m).
- Lower/closer in light air instead of refusing: partly (lines <5 m fail the sensor-fit check; above ≈6 m/s est. tailwind it
  stays on the back; 7 m/s limit gave 15.6 J).
- Line only briefly within 1 m: met in calm, head and light cross winds; fails in tailwind and strong crosswind.
- KE ≤14.9 J: met nominally; fails at mass +10 % and for expert riders.

## Iterations
I0 41.4 % 26.1 J · I1 37.4 % · I2 35.7 % · I3 41.3 % · I4 46.1 % · I5 swivel 47.7 % · I6 rejected · I7 49.0 % (tail worse) ·
I8 47.4 % · I9a 43.1 % 19.3 J · I9 43.1 %, 14.43 J, 54.2 min, 0.40 m · I10 back carry + rear eyelet + length schedule +
lens tilt + tailwind 6 m/s: 44.8 %, 14.43 J, 0.49 m; within-1 m p50 95 % (I9 geometry) → 2.7 %.

## Sensitivity (I10 defaults)
mass +10 %: 15.9 J ✗ · mass −8 %: 13.2 J · low-pass drift: 3.82 °/s · no tailwind envelope: 48.3 %, 16.7 J, 0.20 m, p50
within-1 m 10 % · tailwind limit 7 m/s: 46.6 %, 15.6 J · brake-then-retrieve: 0.007 m · no wake model: 43.8 %, 38.4 N ·
elevation cap 56°: 43.6 %, 15.4 J (rejected) · lens tilt 0°: 36.7 % · sacrum eyelet: 41.8 %, within-1 m 98/96 % · fixed 6 m
line: 48.1 %, 14.8 J · I9 sleeve stow: 43.3 %, 0.40 m · CD0 ±20 %: 44.4–44.8 %, ≥48 min · CLmax ±20 %: 44.9–45.2 % · wind
bias +2: 42.0 % · wind bias −2: 45.2 %, 17.4 J ✗, 0.36 m · noise ×2: 39.1 %, standstill 55 s ✗ · seeds 14–16: 42.3 %,
13.9 J, 0.43 m · expert 15 m/s: 31.8 %, 20.1 J, 36.6 min ✗ · expert 17 m/s: 27.1 %, 24.9 J, standstill 55 s ✗.

## Root causes
1. Line clearance ≤ exit-to-helmet distance; the rear hip-belt eyelet (1.2 m from the helmet) fixes steady flight; window
   swings in tailwind/strong crosswind and the release from the back remain.
2. Dynamic pressure spans 16× above the gate; sail force coefficient only 2–3×; undepowerable tail drag ≈12 N at 22 m/s.
3. Tailwinds: carving dominates the apparent airflow → stays on the back or swings.
4. KE floor = rider speed; levers are mass and envelope.
5. Body px: longer line + carving lean seen from 55° above.
6. Docking onto the back: a stopped rider has no airflow to lift the kite onto the back → parking.
7. Viewing angle: a single-line sled cannot be steered.

## Physical tests needed (none run)
Rider wake and release from the back at 6–15 m/s; sled polar/collapse/flag-out in turbulence; laying onto the back, parking
and relaunch from snow (friction, wet sail, tangles round the skis); whip/KE while carving; line contact/wrap at ≤38 N near
head and neck; rear eyelet in falls and when sitting; low line and third-party exposure on a real slope; three-line twist;
pod charging on the back; false launches on real IMU logs; resort permission.

## Integrator notes
activetether still omits the 48 MP camera's mass/power and uses the raw drift model — align before cross-concept comparison.
