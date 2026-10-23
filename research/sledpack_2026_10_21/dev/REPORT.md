# SIM-033/034 SledPack — design & simulation report (sledpack@0.2.1, iteration I11, 2026-10-21)

Evidence: numerical, uncalibrated simulation (sim/js/concepts/sledpack). Nothing built, flown or user-tested; M-070 not_run,
G-MATURE closed. Parameters ASSUMED unless cited in design.js. User decisions: ../USER_DECISIONS_2026-10-21.md. Reviews:
../review/report.json (I8), ../review/report_I10.json (I10). Archives: REPORT_I9.md / *_I9.json, REPORT_I10.md /
*_I10.json / ensemble_I10.js.txt. Iterations I0–I11 in iterations.json. (Written by the design agent; saved by the
integrator.)

## Design (I11)
- **Carry:** open sled flat on the back, nose up between the shoulder blades, keel noses in magnetic seats on the shoulder
  straps; no pole, sleeve or funnel; nothing above the shoulders. Worn 0.617 kg (kite 70.9 g incl. 48 MP pod 30 g / 3.2 W;
  lumbar module with 120 g 2S battery). Flat stowed envelope 19.9 L; folds into a pack ≈2.5 L (bonus).
- **Line exit:** fold-flat tab on the hip belt behind the buttocks (0.30 m behind / 0.35 m below the pelvis point); tab
  folds at ≤50 N, ring magnetic breakaway ≤60 N, sacrum padding (design note, not simulated). With the kite within ≈±30–40°
  of straight behind and ≤55–60° elevation the line passes ≥1 m from the helmet centre.
- **Launch:** ride detected, est. apparent wind ≥5.5 m/s, est. tailwind ≤5 m/s → seats release → 0.8 s peel-off from the
  back (ASSUMED; sail outline blended from the stowed pose, nose starts ≈0.57 m from the helmet) → through the rider's wake
  (ASSUMED 70 % deficit, 1.2 m recovery) → climbs as line pays out; filming after p50 1.9 s / p90 2.6 s. Launch success 100 %
  is an upper bound under the assumed release model.
- **Flight:** L = clamp(6 + 0.75·(est. apparent wind − 12 m/s), 5, 9) m — farther (and so higher, ≈4–7.5 m) when fast and
  windy at ≈56°; depower line ≈14 N with 14° AoA margin; lens tilted 8° toward the upper body; **swing guard**: reel pulls in
  at 1 m/s while the measured line is >40° off the mean course and above 45° elevation. Fixed viewing angle (steering
  estimated ≈+25–30 g, 15–20 USD, four lines through one ring — not adopted).
- **Stop:** flag the sail and pull down fast while the rider still slides → laid back onto the back if the line comes in
  from behind (ASSUMED capture) → otherwise parks on the snow ≈2.5 m behind and relaunches from there → a kite still parked at
  the end of the run is stowed by hand (20 s, one action). Per run: 1.4 parks, 0.7 ground relaunches, back dock ≈1 stop in
  10. Ground relaunch and the parked kite/line uphill of the rider are optimistic and a hazard for others (review R2-03).

## Verdict — shared 13 criteria (unchanged, 48 cases): 8 / 13
| Criterion | Value | Target | |
|---|---|---|---|
| avail mean | 47.8 % (calm 72, head 67, crossL 63, crossR 61, tail 20) | ≥80 % | FAIL |
| bodyPx p50 | 395 | ≥300 | pass |
| jitter p90 | 6.54 °/s (raw drift as AT-1) | ≤3 | FAIL |
| azRange | 0° commandable (swing p50 43°) | ≥45° | FAIL |
| added mass | 0.617 kg | ≤1.5 | pass |
| body force max | 35.9 N; 38.4 N without the wake model (above the 38 N weak link) | ≤40 | pass, wake-dependent |
| hands while moving | 0 | ≤5 % | pass |
| standstill p90 | 24.4 s | ≤30 | pass |
| actions p90 | 1 | ≤2 | pass |
| KE max | 13.55 J (p90 12.3) | ≤14.9 | pass |
| packed volume | 19.9 L flat envelope | ≤3 L | FAIL (replaced by user rule) |
| headClear min | 0.49 m | ≥1.0 | FAIL |
| cold endurance | 48.8 min | ≥45 | pass |

## Verdict — user-revised judgement (integrator quantification, ASSUMED thresholds)
| Item | Riding only | All time | |
|---|---|---|---|
| no contact (≥0.25 m) | 0.49 m | 0.49 m | pass, model-dependent (0.41 m without wake) |
| each within-1 m episode ≤2 s | max 1.94 s (p50 0.66, p90 1.36) | 1.94 s | pass, model-dependent (2.72 s no wake; 2.70 s with 1.5 s release) |
| within 1 m ≤5 % | max 21.2 % (mean 6.6, p50 3.9, p90 17.2) | max 13.2 % (p50 2.4) | FAIL |
| cases meeting both | 26/48 (fails: tail 3–5.5, cross 6–9 m/s) | 30/48 | |
| open on the back, no pole, nothing above helmet; folds ≈2.5 L | yes | | pass |
| avail all 48 / user envelope (excl. no-lift refusals at speed, 19.4 % of riding) | 47.8 % / 49.0 % | | |
| viewing angle | fixed (accepted) | | |

Product numbers: line <2 m above snow >1 m behind 55 % of airborne riding; third-party exposure 67 s/run (+ parked kite/line,
not counted); tension median 14.3 N, instantaneous max 62.7 N (50 ms mean ≤35.9 N); collapsed 1.0 %; emergency flag-outs 14.9
/run.

## Iterations
I9 43.1 % (within-1 m p50 95 %, sacrum geometry) · I10 44.8 %, within-1 m p50 2.7 % / max 21.3 %, episode 3.14 s · I11a
(cap 9 m, tailwind 5 m/s, release modelled) 43.3 %, 14.3 J, episode 3.14 s, 29/48 both (33 all-time) · I11 (+ swing guard)
47.8 %, 13.55 J, episode 1.94 s, 26/48 both (30 all-time).

## Sensitivity (I11 defaults)
swing guard off 43.3 %, 14.3 J, episode 3.14 s, 29/48 · depower guard 43.6 %, 14.7 J, 0.60 m, 3.14 s · crosswind limit 6.5
m/s 39.4 %, 32/48 (36 all-time), share max still 21 % · crosswind 6 m/s 36.3 %, 35/48 · no wake 46.8 %, 38.4 N, 0.41 m,
2.72 s · mass +10 % 48.2 %, 15.2 J ✗ · mass −8 % 47.8 %, 12.3 J · wind bias +2 41.3 %, 38/48 · wind bias −2 52.0 %, 17.3 J ✗,
15/48, 46.7 min · tailwind limit 6 m/s 49.8 %, 24/48 · line cap 12 m 47.5 % · release 1.5 s episode 2.70 s · seeds 14–16
47.4 %, 13.3 J, 37.6 N, 0.67 m · expert 15 m/s 40.3 %, 19.8 J ✗, 37.1 min ✗ · expert 17 m/s 36.2 %, 24.3 J ✗, 44.2 min ✗.

## Root causes
1. Line clearance ≤ exit-to-helmet distance; the rear hip ring gives ≥1 m only while the kite is behind; tailwind and strong
   crosswind swing the kite round the window (13–21 % of riding within 1 m); the swing guard shortens episodes, doesn't remove
   them.
2. Dynamic pressure ≈16× above the gate vs sail force coefficient 2–3×; undepowerable tail drag.
3. Tailwinds: carving dominates the airflow → stays on the back (tail footage 20 %) or swings.
4. KE: levers are mass and envelope; fails at +10 % mass, −2 m/s wind-estimate bias, expert riders.
5. Body px: longer line + carving lean seen from ≈56°; 9 m cap limits the loss.
6. No airflow when stopped → can't be lifted onto the back → parks.
7. Single-line sled → fixed viewing angle.

## I10 review findings handled
R2-01 release modelled (0.8 s), launch success labelled · R2-02 wake-dependent passes labelled · R2-03 park/relaunch
optimistic + third-party hazard disclosed · R2-04 "≥1 m when the kite is behind" + swing guard · R2-05 fold-flat tab and
breakaway (design note) · R2-06 cap 9 m · R2-07 all-time metric reported · R2-08 tailwind 5 m/s and swing guard adopted,
crosswind limit rejected · R2-09 low-line exposure structural; hi-vis first 2 m, third-party breakaway, operating rule
(proposed) · R2-10 no "nudge" mode in copy.

## Physical tests needed (none run)
Release/peel-off from the back and wake on a moving rider at 6–15 m/s (decides body-force and no-contact passes); sled
polar/collapse/flag-out in turbulence; laying onto the back, parking and relaunch from snow (wet sail, ski-tail tangles,
others skiing over a parked kite); whip/KE while carving; line contact/wrap at ≤38 N near head and neck in swings; hip tab
fold-flat/breakaway in backward falls and sitting; low line and third-party exposure on a real slope; three-line twist; pod
charging on the back; false launches on real IMU logs; resort permission.

## Integrator notes
activetether omits the 48 MP camera's mass/power and uses the raw drift model — align before cross-concept comparison.
