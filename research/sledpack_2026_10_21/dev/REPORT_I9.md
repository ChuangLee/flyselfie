# SIM-033 SledPack — design & simulation report (sledpack@0.1.0, iteration I9, 2026-10-21)

Evidence: numerical, uncalibrated simulation (sim/js/concepts/sledpack). Nothing built, flown or user-tested; M-070 not_run,
G-MATURE closed. Parameters ASSUMED unless cited in design.js. I9 includes the independent review fixes (review/report.json).
Files: results.json (final 48-case ensemble), iterations.json (I0–I9), sensitivity.json (I9 defaults),
sensitivity_I9a.json (superseded I9a), promo_facts.json. (Written by the design agent; saved by the integrator.)

## Design (I9)
- Back unit, no pole: Ø60 mm × 0.65 m spine sleeve, mouth at the sacrum (0.17 m behind / 0.12 m below the pelvis point) with
  a ±80° swivel funnel; 1.05 L lumbar module (reel main + depower line, 120 g 2S battery, electronics, 38 N weak link,
  cutter). Worn 0.607 kg, packed 2.89 L. Harness, or clipped to the rider's own pack.
- Kite: 0.20 m² single-skin sled 0.59 × 0.46 m, two Ø2 mm keel spars; pod at the bridle apex, 48 MP gyro-EIS camera (30 g,
  3.2 W); drogue cone CdA 0.05 m²; 70.9 g incl. margin; unpowered (all actuation in the pack → a kite).
- Sequence: ride detected; launch gate est. apparent wind ≥5.5 m/s and est. tailwind along the 5 s averaged course ≤6 m/s →
  airflow pulls the folded kite out; streams flagged and low to 3 m → powered, opens, climbs to ≈55° → depower line holds
  ≈13 N (est. AoA ≥14°), reel manages length; sustained est. tailwind >6 m/s → early retrieve → at a real stop: full depower,
  fast pull-down (4.8 m/s) while the rider still slides and the kite is still behind → low tow → slow last 1.5 m into the
  funnel (ASSUMED capture model) → docked and charging.

## Verdict (unchanged 13 shared criteria, 48 cases): 8 / 13 — not a usable design
| Criterion | Value | Target | |
|---|---|---|---|
| avail (mean) | 43.1 % (calm 61, head 64, cross 51–52, tail 22) | ≥80 % | FAIL |
| bodyPx p50 | 379 | ≥300 | pass |
| jitter p90 | 6.42 °/s (same raw drift model as AT-1); 4.02 low-pass (info) | ≤3 | FAIL |
| azRange (commandable) | 0° (not steerable; uncontrolled swing p50 40° is not a feature) | ≥45° | FAIL |
| added mass | 0.607 kg | ≤1.5 | pass |
| body force max | 35.9 N | ≤40 | pass |
| hands while moving | 0 | ≤5 % | pass |
| standstill p90 | 8.3 s | ≤30 | pass |
| actions/run p90 | 0 | ≤2 | pass |
| KE max | 14.43 J (p90 12.7) | ≤14.9 | pass, thin |
| packed volume | 2.89 L | ≤3 | pass, thin |
| headClear min | 0.40 m (line; kite 0.61 m) | ≥1.0 | FAIL |
| cold endurance | 54.2 min | ≥45 | pass |

AT-1 for comparison: 16.7 %, 279 px, 10.5 °/s, 57 J, 0.014 m (AT-1 still counts the 48 MP camera optimistically and uses the
raw drift model).

Product metrics: launch success 98.9 %; launch→filming p50 2.8 s / p90 3.7 s; first-try dock 97.8 % (ASSUMED model);
retrieve→locked p50 5.7 s / p90 9.8 s; manual stows 0; line over the rider in frame ≈0 %; tailwind refusal mean 8.7 s/run
(the three 9 m/s tailwind cases never fly); line <2 m above snow >1 m behind 44.8 % of airborne riding; elevation p50 55°.

## Hypotheses
- SP-H1 KE ≤14.9 J: confirmed only with the tailwind envelope (14.43 J). Fails at mass +10 % (16.1), wind-estimate bias −2
  m/s (16.4), experts (19.4 J at 15 m/s, 24.0 J at 17 m/s). Without envelope 16.3 J.
- SP-H2 pole-free exit: refuted for kite and line. Kite ≥0.61 m (launch/capture start inside 1 m in 36–48/48 cases); line
  min 0.40 m, median 0.66 m. Line clearance ≤ exit-to-helmet distance (0.97–0.99 m in the shared body model; 0.82–0.85 m at
  55°). Minimum now from tailwind/crosswind retrieves (before I9 tailwind stops reached 0.075 m).
- SP-H3 avail ≥80 %: refuted (43 %) — launch/retrieve time, carving-lean foreshortening, tailwinds below ≈5 m/s apparent;
  envelope costs 3.6 points but is needed for safety.
- SP-H4 body force ≤40 N: confirmed, little margin (35.9 N; 37.9 N extra seeds); tail adds ≈12 N at 22 m/s undepowerable.
- SP-H5 dock: plausible only with the ±80° swivel (ASSUMED); without: 28.9 % first try, 75 s standstill.
- SP-H6 line in frame ≈0 % confirmed; line low behind the rider refuted (45 %): on a 15° slope a 55° line is ≈40° above snow.
- SP-H7 jitter ≤3 °/s: refuted (6.4 AT-1 drift model; 4.0 band-limited).
- SP-H8 ≤3 L / ≤1 kg / ≥45 min: confirmed after I9 corrections (2.89 L, 0.607 kg, 54.2 min); review's camera correction
  had flipped I8 endurance to a fail; larger battery restores margin.

## Iterations (all 48 cases)
I0 0.30 m² no tail 41.4 %, 26.1 J, 3 weak-link releases · I1 0.20 m² + tail 37.4 %, 17.7 J, 55° · I2 gate 6 m/s 35.7 % ·
I3 6 m line 41.3 % · I4 tracker 46.1 %, jitter 9.8→3.8 (low-pass drift) · I5 ±80° swivel 47.7 %, 0 manual stows · I6 gate
4.5 m/s rejected (line 0.015 m) · I7 tail ×1.6 + 5 m line 49.0 %, tailwind worse, not adopted · I8 3 m flagged streaming +
0.50 m sleeve 47.4 % · I9a review fixes + fast pull-down on every retrieve 43.1 %, 19.3 J · I9 fast pull-down only at real
stops 43.1 %, 14.43 J (final).

## Sensitivity (I9 defaults)
mass +10 %: 42.9 %, 16.1 J ✗ · mass −8 %: 42.9 %, 13.1 J, headClear 0.34 · low-pass drift: jitter 4.02 · no envelope:
46.7 %, 16.3 J, 0.08 m · brake-then-retrieve: 14.4 J, 0.09 m · CD0 ±20 %: 42.4–43.1 %, endurance ≥52 · CLmax ±20 %:
42.4–43.2 % · wind bias +2: 38.0 %, 0.51 m · wind bias −2: 45.8 %, 16.4 J ✗, 0.24 m · noise ×2: 39.0 %, 14.94 J ✗, 7.5 °/s
· capture ×0.85: dock 94.4 % · no swivel: 31.5 %, dock 28.9 %, standstill 75 s ✗ · seeds 14–16: 40.6 %, 14.6 J, 0.29 m,
37.9 N · expert 15 m/s: 31.5 %, 19.4 J, 37 min ✗ · expert 17 m/s: 26.4 %, 24.0 J, 49 min.

## Root causes (physics, not tuning)
1. Head clearance: without a pole the line is always within the exit-to-helmet distance, and the kite starts ≈0.98 m from
   the helmet. 1.0 m at 55° needs the exit ≈0.45 m further back (a stand-off) or a rule change — user decisions.
2. Pull range: dynamic pressure spans 16× above the launch gate; sail force coefficient only 2–3× before collapse; tail drag
   cannot be depowered.
3. Tailwinds: below ≈5 m/s apparent wind, carving sets the airflow direction; the fix is refusal, which costs footage.
4. KE: floor is rider speed (≈5 J at 12 m/s); failures are whip + tailwind or fast riders → levers are mass and envelope.
5. Body px: carving lean seen from 55° above.
6. Viewing angle: a single-line kite can't be steered; needs a multi-line steerable kite.

## Review findings handled
RV-01 camera mass/power fixed (battery +25 g) · RV-02 tailwind-stop line 0.075 → ≥0.40 m, still fails 1.0 · RV-03 bundle
outline fixed, still fails · RV-04 judged with AT-1 raw drift model, low-pass as sensitivity · RV-05 azRange 0° commandable ·
RV-06 sleeve 0.65 m, 2.89 L · RV-07 thin margins (sensitivity) · RV-08 extraction, rider wake, line twist not modelled →
physical tests · RV-09 sensor-fit fixed · RV-10 counting fixed · camera hung on the line not simulated (review hand calc:
sail 4 J, pod ≤11 J).

## Integrator notes
activetether also omits the 48 MP camera's mass/power and uses the raw drift model — align before comparing.
concept_activetether.test.mjs accepts first or second position.

## User decisions (options)
1. Accept a ≈0.45 m stand-off (a pole again), or split the head-clearance rule (kite ≥1 m outside launch/capture windows;
   line ≥X m with weak link) — even then the line minimum is 0.40 m.
2. Accept "does not fly in tailwinds above ≈6 m/s".
3. Accept a non-selectable viewing angle, or move to a steerable multi-line kite.

## Physical tests needed (none run)
Sled polar/collapse/flag-out in turbulence; pull-out, rider wake, opening; 50 swivel-funnel docks at −10 °C (standing,
sliding, wet sail); whip/KE while carving; line contact/wrap/laceration near head and neck at ≤38 N; low line and third-party
exposure on a real slope; chairlift-seat and backward-fall loads on the funnel; three-line twist; warm-then-charge of the pod;
false launches on real IMU logs; sleeve stow length with drogue and tail line; resort permission.
