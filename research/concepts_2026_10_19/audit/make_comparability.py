#!/usr/bin/env python3
"""Lead-auditor cross-concept comparability (round 2). Inputs: part_<id>.json comparability blocks,
sim/js/concepts/*/model.js|index.js parameter tables, file mtimes. Writes comparability.json (JSON only).
Evidence: audit of numerical-uncalibrated simulations; not a physical test."""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ld = lambda cd0, e, AR: round(0.5 * math.sqrt(math.pi * e * AR / cd0), 2)

table = {
    'columns': ['kite2', 'towglider', 'leapfrog', 'descentglider'],
    'flyingMass_g_claimed': [62, 95, 125, 124.4],
    'flyingMass_g_audit': ['75–113', '117–125', '160–175', '152–167'],
    'rho_kg_m3': [1.0, 1.0, 1.0, 1.05],
    'S_m2': [0.35, 0.055, 0.055, '0.060 spread / 0.034 swept'],
    'AR': ['n/a (effective CR, L/D)', 8, 8.9, '6.41 / 4.71'],
    'CD0': ['n/a', 0.040, 0.040, '0.060 / 0.057'],
    'e': ['n/a', 0.8, 0.8, '0.75 / 0.70'],
    'CLmax': ['CR 0.2–1.1', 1.0, 1.0, '1.0 / 0.8'],
    'LDmax_closedForm': ['0.35–2.4 (assumed range)', ld(0.04, 0.8, 8), ld(0.04, 0.8, 8.9), f"{ld(0.06, 0.75, 6.41)} / {ld(0.057, 0.7, 4.71)}"],
    'Re_k': ['600–1400', '30–84', '33–66', '49–91'],
    'LDminus30_run': ['no (audit ran CRmin/Gmin)', 'yes, passes', 'yes (ldScale 0.7)', 'yes (drag ×1.43)'],
    'camera_W': [2.5, '2.5 (+0.4 gimbal) in 2.9 avionics', 1.7, 1.6],
    'camera_plus_stabiliser_g': ['16 (no gimbal; canopy-stabilised + EIS)', '16 + 12 gimbal', '13 + 10 turret', '18 incl. pan-tilt'],
    'avionicsTotal_W': [3.4, 3.3, 2.9, 2.6],
    'flyingCell': ['1.3 Wh / 8 g', '1.2 Wh / 8 g (150 Wh/kg)', '3.7 Wh / 20 g (185 Wh/kg)', '8.5 Wh / 22.4 g (380 Wh/kg)'],
    'wornBank': ['30 Wh / 160 g pack (187 Wh/kg)', '10 Wh hip cell', '10 Wh holster bank', 'none'],
    'coldDerate': [0.75, 0.75, 0.75, 0.75],
    'reserve': [0.10, 0.10, 0.10, 0.15],
    'chargesFlyingCellInCold': ['yes (dock charging, not designed)', 'yes (~1.9 C on each lift)', 'yes (bank → glider on lift)', 'regen ≤3 W into self-heated cell'],
    'keFrameCheck': ['ground frame, agrees', 'ground frame, agrees (1 s settle hides a 17.3 J t=0 artefact)', 'ground frame, agrees', 'ground frame, agrees'],
    'nominalIncludesStops': [False, False, False, False],
    'nominalIncludesLaunch': [True, True, True, False],
    'setupTime_p90_claimed_s': [7.4, 17.9, '14–19', 17.08],
    'setupTime_p90_audit_s': ['17 (incl. manual push-in, 96 stops 0–4.4 m/s)', '21 (own pick-up rule) / 120 if fetched on foot', '14–19 (pass)', '34 (51 cycles 0–9 m/s) / 109 incl. recovery'],
    'ops_claimed': [1, 2, 2, 2],
    'ops_audit': ['2 (arm+disarm before lift)', '2; 3 with one rest stop', 3, '2; >2 in 33 % of windy cycles'],
}

findings = [
    {'id': 'X-01', 'concept': 'cross', 'severity': 'major',
     'claim': 'The three gliders share one battery/aero basis (DEV_BRIEF_GLIDER: "use these common assumptions so the three are comparable").',
     'evidence': 'Flying-cell specific energy: towglider 150 Wh/kg, leapfrog 185 Wh/kg, descentglider 380 Wh/kg (2–2.5× the others; real micro 2S packs ≈117–200 Wh/kg, DG-01). Reserve 10 % (tow, leap) vs 15 % (descent). ρ 1.0 (tow, leap, kite) vs 1.05 (descent: −2.4 % stall speed). CD0 0.040 (tow, leap) vs 0.060 (descent). Camera power for the same RunCam-Thumb class module: 1.6 W (descent), 1.7 W (leap), 2.5 W (tow, kite); audit sources give 2.5 W max at 5 V.',
     'recommendedFix': 'Put one shared table in common/ (cell Wh/kg ≤200 pack-level, camera 2.5 W, ρ 1.0 at 2000–2500 m/−10 °C, reserve 15 %, cold 0.75, no charging below 0 °C unless heated) and re-run all concepts.', 'fixable': 'yes'},
    {'id': 'X-02', 'concept': 'cross', 'severity': 'major',
     'claim': 'Flying masses 62 / 95 / 125 / 124 g.',
     'evidence': 'Every concept is under-budgeted by 20–40 % against real components (RunCam Thumb Pro 16 g/2.5 W; smallest brushless 2-axis micro gimbal found ≈30 g, Caddx GM2; 1103 motors are 2-inch class, 4-inch props need 1404; vision/ranging compute missing): kite 75–113 g, tow 117–125 g, leap 160–175 g, descent 152–167 g. Because each glider caps ground speed at √(2·14.9 J/m), mass directly shrinks the follow envelope (tow 17.7→16.0 m/s, leap 15→≈13 m/s, descent 14.2→12.9 m/s) and the catch-up margin after launch.',
     'recommendedFix': 'Shared component library with sourced masses; carry ≥15 % margin; re-run envelopes at the audit masses.', 'fixable': 'yes'},
    {'id': 'X-03', 'concept': 'cross', 'severity': 'major',
     'claim': 'Endurance ≥45 min at −10 °C (kite 258, tow 102, leap 117, descent 50.5 min).',
     'evidence': 'Kite, tow and leap reach the target only by recharging the flying cell from a worn bank on every lift ride (Li-ion must not be charged below ≈0 °C; tow needs ≈1.9 C): glider-only tow 10.9 min, kite sortie 12 min at 3.5 W camera. Descent has no bank and passes only at 380 Wh/kg and one stop per run (26 min at 200 Wh/kg). Endurance definitions therefore differ (kite counts a 30 Wh pack; descent counts only the aircraft).',
     'recommendedFix': 'Use one endurance definition: everything worn, −10 °C, 15 % reserve, cold-charge only into a heated cell with its heater energy charged to the budget, power from a harmonised full-run scenario with stops.', 'fixable': 'yes'},
    {'id': 'X-04', 'concept': 'cross', 'severity': 'major',
     'claim': '"nominal" represents normal use.',
     'evidence': 'No concept\'s nominal includes a stop; descentglider\'s does not include launch either. Where audited, stop-including runs fail avail: kite stop-start 76.9 %, descent stop 59.9–63.1 % (0/12 seeds) and full cycle 54–71 %, leap powder 44.7 %; setupTime p90 was computed by each concept on 2–3 hand-picked winds (audit sweeps: kite 17 s, tow 21 s, leap 14–19 s, descent 34 s).',
     'recommendedFix': 'Add a shared "fullRun" scenario (top deploy → 2 stops → lift-approach stow, 12 wind seeds 0–9 m/s × 4 directions) and judge avail/setupTime/ops/endurance on it.', 'fixable': 'yes'},
    {'id': 'X-05', 'concept': 'cross', 'severity': 'major',
     'claim': 'Jitter/footageStability passes (all concepts ≤3 °/s).',
     'evidence': 'Independent footageStability recomputations agree with the claims (kite 0.21/0.45 °/s nominal, tow 0.97/1.12, leap 1.25 nominal / 2.23 short, descent subject ≤2.22, background up to 4.0 in short turns/moguls), but the gliders are point-mass (or lagged-attitude) models with an assumed ideal or fixed-residual gimbal: airframe pitch/roll/yaw response to turbulence is not simulated, so the pass is by construction for the gliders. Leapfrog\'s ≈6° crop makes 1.25 °/s ≈21 %/s of frame height.',
     'recommendedFix': 'Add attitude dynamics + a gimbal bandwidth/residual model shared by all gliders, and normalise jitter by crop FOV (%/s of frame).', 'fixable': 'yes'},
    {'id': 'X-06', 'concept': 'cross', 'severity': 'minor',
     'claim': 'results.json files reflect the current shared models.',
     'evidence': 'sim/js/concepts/common/env.js changed at 2026-10-19 20:25:04, after kite2 (20:18), leapfrog (20:19) and towglider (20:24) results were written. Audit re-runs: kite2 identical; towglider gust row stale (avail 88.353→88.491, bodyForcePeak 1.576→0.826 N, towShare 48.7→37.8 %); leapfrog crossgust avail 71.2→76.1 %, perchwind perchSF 1.121→1.32. No harmonised pass/fail flag changes. descentglider (20:34) current. Shared wind model advects turbulence only along the mean wind (TG-13), under-sampling crosswind gusts for every concept.',
     'recommendedFix': 'Regenerate the three results.json; stamp each with the hash of common/*.js; fix crosswind advection in env.js (integrator).', 'fixable': 'yes'},
    {'id': 'X-07', 'concept': 'cross', 'severity': 'major',
     'claim': 'All four are acceptable on safety/regulation as noted in design_notes.',
     'evidence': 'All three gliders are UAS (EU C0 needs <250 g and toy/C0 marking; with a camera the operator must register; A1 follow-me only within 50 m — descent trails 66–133 m with no 50 m fail-safe). US recreational rules need VLOS by the operator or a co-located observer, which a solo downhill skier with a follower behind cannot keep (tow, descent); leapfrog flies ahead and is the best case. Vail Resorts bans drones without written permission. kite2 is not aviation-regulated below 25 kg (EU) / 5 lb (FAA Part 101) but resorts such as Aspen and Niseko Hirafu ban kiting on pistes, and its line is 1.15–1.72 m above snow 1–2 m behind the rider.',
     'recommendedFix': 'Treat resort written permission as a gate for every concept; design to C0/<250 g with Remote-ID-free class; add a 50 m leash/geofence; for kite2 a breakaway, high-visibility line and no-follower-within-5 m sensing.', 'fixable': 'no'},
]

cross = {
    'table': table,
    'note': 'Glider aero is mutually consistent in form (parabolic low-Re polar, CLmax 1.0, e 0.75–0.8) and none uses L/D better than its CD0/AR justify; all three ran a −30 % L/D sensitivity. Re is 30–90 k, partly below the brief band of 50–150 k; at Re ≈30 k CLmax ≈0.85 is more defensible than 1.0 (stall +0.4–0.5 m/s). The real non-comparabilities are battery specific energy (descent 380 vs 150–185 Wh/kg), cold charging from worn banks (kite, tow, leap), camera power (1.6–2.5 W), reserve (10 vs 15 %), the absence of stops in every nominal, and mass budgets that are uniformly 20–40 % light. kite2 uses effective coefficients with no Re dependence and is not comparable to the glider polars; its key unknown (CR 0.2 at L/D ≈0.5–0.7) is a single tow test.',
    'rankingAfterAudit': [
        {'concept': 'towglider', 'verdict': 'conditional: follow footage robust (12 seeds, 117 g); fails cold endurance without a heated holster and standstill/ops with rest or windy stops'},
        {'concept': 'kite2', 'verdict': 'conditional: most original; everything hinges on one untested canopy regime (CR 0.2 at L/D ≈0.6) and on resort kiting rules'},
        {'concept': 'leapfrog', 'verdict': 'conditional/fragile: only head-on view and keeps VLOS; ops 3, mass 160–175 g, relies on full-res 50 MP readout'},
        {'concept': 'descentglider', 'verdict': 'not yet credible: 380 Wh/kg cell, stop-free nominal; realistic full cycles 54–71 % avail, standstill p90 34 s'},
    ],
    'npmTest': {'command': 'cd sim && npm test', 'date': '2026-10-19T20:56-07:00', 'tests': 131, 'pass': 131, 'fail': 0},
    'process': 'Plan registration (project/plan.py start/update) was not performed by the auditor because the task restricted writes to research/concepts_2026_10_19/audit/; the coordinator should record this audit under SIM-031.',
}
json.dump({'findings': findings, 'crossConcept': cross}, open(os.path.join(HERE, 'comparability.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', len(findings))
