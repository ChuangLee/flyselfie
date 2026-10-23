#!/usr/bin/env python3
"""audit4 cross-concept consistency checks and ranking (auditor judgement). Numerical uncalibrated simulation; not physical verification."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
checks = [
 {'id': 'A4-X-01', 'severity': 'major', 'metric': 'wind-estimate bias seeding / grid coverage',
  'finding': 'windEstimate() seeds its ±1 m/s bias from the case seed, so the 48-case grid samples only 3 bias draws per wind. leapfrog keMax and C0 range pass on seeds 11–13 but fail on seeds 14–22 (tail5.5_s15 15.03 J / 54.9 m; tail6_s17 16.05 J; tail5.5_s20 15.49 J; tail6_s21 50.5 m). towglider passes all 48 but crossL7.5_s11 (off-grid, gate on) gives headClear 0.934 m. kite2 KE margin 0.62 J. Grid-only safety maxima are not robust.',
  'favours': 'leapfrog and towglider (safety maxima)', 'action': 'integrator: judge safety maxima (keMax, headClear, range) on ≥6 seeds and an off-grid band, or decouple the bias seed from the turbulence seed',
  'evidence': 'audit4/leapfrog/out_seeds_0_48.json, out_tailseeds_0_24.json; audit4/towglider/out_crossL75.json'},
 {'id': 'A4-X-02', 'severity': 'major', 'metric': 'idealised estimators still in judged runs (rule 5)',
  'finding': 'All launch/park gates use windEstimate() (compliant for all three). But: leapfrog tracker latency compensation and GNSS feed-forward use the true LOS increment/rate (+noise, 50 Hz) and guidance uses true rider state; towglider camera mount is pointed from the true rider position; kite2 window controller uses noise-free kite position/velocity and true dynamic pressure. Effects measured: leapfrog jitter 1.64 → 2.01 (est. comp, 5 Hz GNSS) → 3.43 (1 Hz GNSS, avail 64.6 %); towglider 2.45 → 2.56–2.81 with 3–5 % detection noise; kite2 doubled noise avail +1 pp, KE 14.31 J.',
  'favours': 'leapfrog (jitter/avail rest on the rider-tag link rate)', 'action': 'integrator: add a shared rider-tag/tracker estimator (GNSS rate, latency, noise) in common/ and require it for all pointing/guidance'},
 {'id': 'A4-X-03', 'severity': 'minor', 'metric': 'artefact rule implementation',
  'finding': 'Shared artefactCounts(≥2 px) is applied, but each concept projects its own parts. towglider tests the leash only at polyline vertices (misses the near-camera segment 3–13 px) and omits the 3 mm wand (−1.4 pp own test, −6.7 pp if the subject box includes skis). kite2 boom 1.66 px median meets the rule only because it is 3 mm (structurally infeasible, A4-K2-01). "Bounding box" of the subject is not defined (body vs incl. skis).',
  'favours': 'towglider (small), kite2', 'action': 'integrator: provide a shared segment/cylinder projector and define the subject box (bodyPoints feet/head/shoulders)'},
 {'id': 'A4-X-04', 'severity': 'minor', 'metric': 'worn rigid members excluded from headClear',
  'finding': 'kite2 passive boom (free pivot, moves with the line) 0.33 m from the helmet centre; towglider wand 1.165 m (included would pass). Exclusion of a free-pivoting boom as "worn rigid" is generous; with a buildable 1.2 m boom kite2 headClear 0.84 m.',
  'favours': 'kite2', 'action': 'integrator: count free-pivoting members as airborne parts'},
 {'id': 'A4-X-05', 'severity': 'minor', 'metric': 'reported sensitivities vs files',
  'finding': 'leapfrog sensitivity figures relayed in the round-4 report (mass +10 % → 69.7 %, bias ±2 → 17.65 J, stow 13.5 s → 33.1 s) are not in dev/leapfrog/results.json (18-case subset: 65.6 %, 17.92 J, 33.4 s); auditor full-48: 67.7 %, 17.92 J, 33.2 s. Same direction, all fail.',
  'favours': 'none (direction unchanged)', 'action': 'developers: report only numbers traceable to results.json'},
 {'id': 'A4-X-06', 'severity': 'minor', 'metric': 'packVol / mass bookkeeping',
  'finding': 'All three packVol values are assumed envelopes (no CAD/fold measurement); kite2 kept the round-3 2.86 L constant despite a larger winch and 6-section boom; towglider wand 8 g missing from mass; leapfrog morph mechanism budgeted at micro-servo scale (LisHawk uses 3×7.1 g servos at 284 g).',
  'favours': 'all', 'action': 'mock-up pack and weigh before any further ranking on these metrics'},
 {'id': 'A4-X-07', 'severity': 'minor', 'metric': 'reproducibility',
  'finding': 'common/ unchanged since the dev runs (kite2 commonHash 5d71ed4a96c0 and towglider fileHashes match the live files). All three reproduce on a copy (kite2 within 0.05 pp, leapfrog and towglider exactly). Concept tests pass on the copy (kite2 21, leapfrog 24, towglider 18).',
  'favours': 'neutral'},
]
ranking = {
 'question': 'usable solo follow-cam (self-operated, full run, real winds, minimal set-up) — round 4',
 'noConceptQualifies': True,
 'usableInSimulation': {
  'leapfrog': 'conditionally yes, only inside a light-tailwind envelope: groomed low-traffic piste, calm/cross/head ≤9 m/s, true tailwind ≤≈5 m/s with the launch gate tightened to ≈5 m/s estimated, rider downhill speed ≤≈11 m/s, airframe ≤≈172 g, feathered wing CLmax ≥1.2, rider tag GNSS ≥5 Hz. Not for all-weather use (seeds 14–22 tail 5.5–6 m/s exceed 14.9 J / 50 m).',
  'kite2': 'no — fails avail (72.3 %), and the passive 3 mm boom that makes the artefact rule pass is structurally infeasible (cannot cantilever/compress the KCU); a buildable 6→5 mm boom gives avail ≈6 %.',
  'towglider': 'no — fails avail (48–49 %; launched runs 74 % mean so 80 % is unreachable); light-wind research concept only.',
  'descentglider': 'no — frozen negative result.'},
 'summary': 'leapfrog is the only concept passing all 13 judged metrics as modelled (5 conditional) and reproduces exactly, but its avail margin is 2.3 pp and its KE/C0-range margins fail on unseen seeds in the 5.5–6 m/s tail band. kite2 and towglider honestly fail avail. Ranking is by credible usable envelope × evidence × safety, not by count of passes. Evidence: numerical uncalibrated simulation; nothing physically tested.',
 'order': [
  {'rank': 1, 'id': 'leapfrog', 'label': 'only all-13 pass as modelled; thin, light-tailwind envelope',
   'rationale': 'Exact reproduction; avail 82.46 (2.3 pp margin; lost at mass +8–10 % or CLmax 1.1), jitter 1.64 (2.01 with estimated tracker comp at 5 Hz GNSS, 3.43 fail at 1 Hz), setup p90 24.7 s (stow 13.5 s → 33 s fail), ops p90 2 (max 3), KE 13.75 J and headClear 2.01 m on grid; seeds 14–22 tail 5.5–6 → KE up to 16.05 J and 54.9 m range. Morphing wing goes beyond Ajanic 2020 (+100 % area by sliding feathers vs +41 % by sweep, CLmax 1.25 at Re≈34k, one 2.5 g servo). No tether/clothesline hazard. Needs a tighter tail gate (≈5 m/s est.) — not yet re-judged for avail.'},
  {'rank': 2, 'id': 'kite2', 'label': 'fails avail; boom premise infeasible; clothesline unfixed',
   'rationale': 'Reproduces (avail 72.25 vs 72.30, KE 14.275); winch now within a real 2205/25 A envelope (A3-K2-04 fixed). But the passive 3 mm, 1.45 m boom that meets the 2 px rule cannot nest 6 sections or carry/dock the 90 g KCU (≈930 MPa root stress, buckles at ≈1.3–2 N); a buildable 6→5 mm boom → avail ≈6 %. KE margin 0.62 J (L/D 0.6 → 17.26 J, mass +15 % → 16.95 J). Line 0.74–0.84 m above snow 1–3 m behind in every run. Strongest wind robustness of the flown concepts (non-tail 83 %), hence rank 2.'},
  {'rank': 3, 'id': 'towglider', 'label': 'lowest burden, safe on grid by refusing, fails avail structurally',
   'rationale': 'Exact reproduction; ops 1, setup 12 s, 0.46 kg, KE 13.2 J. avail 48.0 (17/48 refused; launched 74 % mean so ≥80 % unreachable; pre-run history → 53 %). Tail-band hazard of round 3 fixed by refusing ≥3.5 m/s. crossL7.5_s11 headClear 0.934 m off-grid. Jitter pass needs ≥6 Hz loaded servo (4 Hz → 4.4 °/s fail); endurance needs a 0.05 W lift sleep (0.5 W → 40 min fail).'},
  {'rank': 4, 'id': 'descentglider', 'label': 'frozen negative result (round-2 row unchanged)',
   'rationale': 'Round-2 audit: fails avail 29.6 %, setup 60 s, ops p90 3, KE 18 J, jitter p90 18 °/s. Not re-run.'}],
 'nextKillTests': [
  'leapfrog: bench/tow the sliding-feather wing for CLmax and area extension at Re 30–40k (kill CLmax <1.1 or mass >175 g); rider-tag GNSS rate/latency on a carving skier (kill <5 Hz or >100 ms); tail 5–6 m/s launch-gate test with a real wind estimate; gloved −10 °C stow ≤10 s',
  'kite2: build a 1.45 m boom that cantilevers/docks a 90 g KCU and measure its projected width in real 4K footage (kill if >2 px median); tow-test canopy L/D (kill <0.7); clothesline mitigation + resort permission',
  'towglider: loaded camera-servo bandwidth at −10 °C (kill <6 Hz); sleep current of the whole avionics stack (kill >0.3 W); crosswind 7–8 m/s stall-drop clearance',
  'all: resort written permission; G-MATURE closed; M-070 not_run'],
}
json.dump({'generated': '2026-10-20', 'round': 4, 'evidence': 'independent audit4 of numerical, uncalibrated simulations; not physical verification', 'checks': checks}, open(os.path.join(H, 'consistency.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(ranking, open(os.path.join(H, 'ranking.json'), 'w'), ensure_ascii=False, indent=1)
print('ok')
