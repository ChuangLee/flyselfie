import json, os
D = '/root/ai-workspace/flySelfie/research/active_tether_2026_10_20/review/usertest'
R = json.load(open(D + '/sim_persona_runs.json'))

def agg(name, key):
    rows = [r for r in R['runs'][name]['rows'] if key in r]
    vals = [r[key] for r in rows if isinstance(r[key], (int, float)) and r[key] is not None]
    return {'min': min(vals) if vals else None, 'max': max(vals) if vals else None, 'n': len(vals)}

def runs_table(name):
    out = []
    for r in R['runs'][name]['rows']:
        if 'wind' not in r: continue
        out.append({k: r[k] for k in ['wind', 'seed', 'avail', 'pxMed', 'keMax', 'headClear', 'bodyForcePeak', 'launches', 'launchFails', 'rides', 'dockTimes', 'manual', 'thirdPartyS', 'refuseS', 'crashes', 'broke', 'rideS', 'flownRideS', 'quiverOutRideS', 'towedOnSnowWhileRidingS', 'standDeviceBusyS', 'perStop']})
    return out

S = lambda a, b, c, d, e, note: {'effort': a, 'confusion': b, 'fearSafety': c, 'socialAcceptability': d, 'failureRecovery': e, 'note': note}
# scale: 1 = very bad … 5 = good (for every dimension; 'confusion 5' = no confusion, 'fear 5' = no fear)

steps = ['J1 car gear-up', 'J2 lift (chair/T-bar/gondola/carpet) with quiver on the back', 'J3 top / getting ready', 'J4 push-off / launch', 'J5 ride / film', 'J6 planned stop (and wanting to keep going)', 'J7 fall', 'J8 restart after stop/fall', 'J9 walk / skate / queue / skin / shuttle bus', 'J10 end of day', 'J11 charging / drying overnight']

journeys = {
 'P1': {
  'J1 car gear-up': S(3, 3, 4, 3, 4, 'Lumbar unit + 0.55 m quiver over a normal jacket; 0.91 kg is fine. No screen: "single beep = ready" is unverified; she will not know if the flyer is charged.'),
  'J2 lift (chair/T-bar/gondola/carpet) with quiver on the back': S(2, 2, 2, 2, 3, 'Beginner areas use magic carpets (0/40 detector starts in our traces - good) and T-bars/platters: the bar goes exactly where the lumbar unit and the hinged quiver sit; nobody has checked this. On a chair she cannot sit back fully (65 mm plate ASSUMED acceptable, engineering).'),
  'J3 top / getting ready': S(4, 2, 4, 3, 4, 'Nothing to do (ops 0) - but she gets no prediction whether it will fly at her speed.'),
  'J4 push-off / launch': S(4, 1, 2, 2, 2, 'At 5 m/s the gate (1.35 x 4.93 m/s stall = 6.65 m/s apparent) never opens in calm or 3 m/s tail: 0 launches, but the quiver swings out and stays out for 68-72 s of 77 s riding (READY). At 7 m/s (or 5 m/s + 3 m/s headwind) it tries and fails: 2-3 launch attempts/run, 1-2 failures, flyer drops and is dragged on the snow 19-50 s per 79 s of riding.'),
  'J5 ride / film': S(3, 2, 2, 1, 2, 'Usable footage 0 % (5 m/s calm/tail), 9-21 % (5 m/s head 3), 0-25 % (7 m/s). KE is low (<=18.6 J max, mostly <7 J) - the one thing that is safe at her speed. Head clearance 0.36-0.67 m in the 7 m/s calm case (fails >=1.0 m).'),
  'J6 planned stop (and wanting to keep going)': S(2, 2, 3, 2, 3, 'Many stops; each flown stop costs 5-17 s standing (up to 42 s). 5 m/s + head 3: the 5.8 s stop was docked by the restart (5.1-5.2 s). 7 m/s: after the 5.2 s stop the device was still CAPTURE/RETRIEVE/BRAKE at restart in 4/6 cases.'),
  'J7 fall': S(3, 3, 3, 3, 3, 'Sim (4-5 m/s fall): fall detected 0.60-0.64 s after the event (target <=0.5 s), body force <=9.7 N, head clearance >=0.98 m in the 6 s after the fall. Backward sit-down falls onto the rigid lumbar unit/quiver are NOT modelled (engineering top risk: breakaway <=60 N).'),
  'J8 restart after stop/fall': S(4, 2, 3, 3, 2, 'Max 2 launches per ride; after failed attempts the rest of the run is unfilmed with no explanation. 1 of 9 7 m/s runs ended in MANUAL stow (+20 s, hands behind her back).'),
  'J9 walk / skate / queue / skin / shuttle bus': S(3, 3, 2, 3, 3, 'Queue/walk/chair 0 starts (results.json, synthetic). Slow beginner drifts 2.5-3.5 m/s on a green: 24/40 detector starts -> quiver swings out next to other beginners. Ski bus down to the village: 39/40 bus descents start AND pass the wind gate (results.json) -> launch attempt inside the bus.'),
  'J10 end of day': S(4, 3, 4, 4, 4, 'Footage offload (PM-M12) not modelled; little footage to offload.'),
  'J11 charging / drying overnight': S(3, 3, 4, 4, 4, 'Two cells (32 Wh pack + 1.65 Wh flyer); wet line drying reminder needed; no charger spec.'),
 },
 'P2': {
  'J1 car gear-up': S(4, 4, 4, 4, 4, 'Fine: 0.91 kg, 2.28 L, nothing to assemble.'),
  'J2 lift (chair/T-bar/gondola/carpet) with quiver on the back': S(3, 3, 3, 3, 3, 'Chair downloads: 0 launches (sim scenario chairdown, no on-snow chatter). Uphill lifts 0/640 synthetic rides. Diagonal quiver across the back on a 6-pack chair with the bar down: comfort/neighbour clearance NOT_RUN. Flyer recharges on the lift only if its cell is >5 C.'),
  'J3 top / getting ready': S(4, 3, 4, 3, 4, 'Zero actions. But in the 15 of 48 ensemble cases (tail >=3.5 m/s etc.) it never flies all run: refusal rate 31 % > 15 % target.'),
  'J4 push-off / launch': S(5, 3, 3, 3, 3, 'Launch success 90 % mean (p10 50 %), target >=95 %. Launch needs a straight glide - he wants to turn immediately; 0.8-1 s detection + 1.3 s quiver deploy + 2 m/s pay-out => first ~9 s of every run unfilmed (demo: stable flight from 9 s).'),
  'J5 ride / film': S(5, 3, 2, 2, 3, 'Ensemble: avail 16.7 % mean (target 80), pxMed 279 px (300), jitter p90 10.5 deg/s (3), KE max 57 J (p50 21.6 J; cap 14.9), head clearance min 0.25 m. Line below 2 m more than 0.5 m behind him 84.7 s per run (p50). For a technique-video buyer this is ~12 s usable per 71 s run.'),
  'J6 planned stop (and wanting to keep going)': S(1, 2, 3, 2, 2, 'Dock p50 13.9 s / p90 31.3 s / max 70.9 s (target p90 <=10 s); first-try dock 80 % (98 %). T05: after a 10 s stop the device was still BRAKE/CAPTURE (not locked) at restart in 6/9 cases; after a 5 s stop in 9/9 cases -> the flyer is towed/flown-in on a short line during the next ride and that ride is NOT filmed (next ride launched in only 3/9 and 0/9 cases). The shared setupTime metric still passes (10-22 s) because it ignores lost footage.'),
  'J7 fall': S(4, 4, 4, 3, 3, 'T06 at 12-13 m/s: detection 0.58-0.60 s, post-fall body force <=4.9 N, head clearance >=1.26 m, KE <=6.3 J in the 6 s after the fall. Line wrap around limbs/poles and tumbling not modelled.'),
  'J8 restart after stop/fall': S(3, 2, 3, 3, 2, 'See J6; no audible "wait 10 s" cue exists in the design; a user who waits gets 14 s p50 of standing per stop.'),
  'J9 walk / skate / queue / skin / shuttle bus': S(4, 4, 2, 3, 3, 'Gentle downhill cat tracks 5-7 m/s: 27/40 starts (deploy; launch if the gate opens). Car/shuttle descent: 40/40 starts in our traces (results.json bus 39/40 also pass the wind gate, 0.975 false launches/day vs <=0.2).'),
  'J10 end of day': S(4, 4, 4, 4, 4, 'Pack energy ample (endurance min 73 min, p50 163 min at -10 C). Flyer cell 1.65 Wh / 4.25 W = ~23 min airborne per charge: day of 20 runs relies on dock charging on lifts (blocked <5 C cell).'),
  'J11 charging / drying overnight': S(3, 4, 4, 4, 4, 'Charge + dry the line (wet UHMWPE frozen in the drum is a J1 risk).'),
 },
 'P3': {
  'J1 car gear-up': S(4, 4, 3, 4, 4, 'Must fit with avalanche pack; 0.55 m quiver + lumbar unit vs airbag hip belt/leg loop: NOT_RUN.'),
  'J2 lift (chair/T-bar/gondola/carpet) with quiver on the back': S(3, 3, 3, 3, 3, 'As P2; tram/gondola with skis in rack: unit must be disarmed by the lift lockout (0/20 gondola-up/down starts).'),
  'J3 top / getting ready': S(4, 2, 3, 3, 3, 'No way to say "not here (trees)" except the single strap control; refusal in trees is not implemented in the model (no tree sensing).'),
  'J4 push-off / launch': S(4, 2, 1, 3, 1, 'Steep (25 deg) 15 m/s: 4/9 launches fail ~0.2-2 s after release; 3 of those 9 runs end with the 38 N weak link breaking and the flyer free (lost) within ~5 s of push-off. A lost 116 g flyer per ~3 runs is a product killer.'),
  'J5 ride / film': S(5, 3, 1, 2, 2, 'When it flies: avail 21-24 %, pxMed 187-222 px (subject too small at 15 m/s), KE 30-52 J (cap 14.9 J), head clearance 0.58-1.0 m.'),
  'J6 planned stop (and wanting to keep going)': S(3, 3, 3, 3, 3, 'Single stop at the bottom: dock 10-17.5 s when flown; 46.6 s after a launch failure.'),
  'J7 fall': S(3, 3, 2, 3, 2, 'Fall at 17 m/s: detected 0.56-0.60 s; 1/3 seeds had already lost the flyer (weak link) before the fall; deep-snow tumbles, tree wells and the rigid quiver under the rider are not modelled.'),
  'J8 restart after stop/fall': S(3, 3, 3, 3, 2, 'Flyer may be buried; beacon (PM-M13) not modelled.'),
  'J9 walk / skate / queue / skin / shuttle bus': S(3, 3, 2, 3, 3, 'Boot-pack/hike: walk 0/80 starts; snowmobile/sled tow-out 40/40 starts in our traces.'),
  'J10 end of day': S(4, 4, 4, 4, 3, 'Line wear count after weak-link events; spare flyers needed.'),
  'J11 charging / drying overnight': S(4, 4, 4, 4, 4, '-'),
 },
 'P4': {
  'J1 car gear-up': S(3, 3, 4, 3, 4, 'Also dressing two kids; any extra step is costly - AT-1 adds none (good).'),
  'J2 lift (chair/T-bar/gondola/carpet) with quiver on the back': S(2, 3, 2, 2, 3, 'Riding a chair next to a 7-year-old: the diagonal quiver takes seat width and sits at the child\'s head height when loading. Magic carpet 0/40 starts.'),
  'J3 top / getting ready': S(4, 2, 3, 2, 3, 'Cannot tell the device "kids behind me, do not fly" except by a manual lift-lock; no crowd sensing (T17).'),
  'J4 push-off / launch': S(4, 1, 1, 1, 2, '6.5 m/s calm: 10/10 launches fail (3 seeds, 3-4 attempts each); 3 m/s head: 1-2 of 3 attempts fail. Each failure = flyer drops and is dragged behind her on 1.5-4 m of line: 33-51 s of 86 s riding in calm.'),
  'J5 ride / film': S(4, 2, 1, 1, 2, 'Avail 0 % (calm) / 5-14 % (head 3) / 3-10 % (cross 3). Third-party exposure 72-116 s per ~145 s plan; line within 3 m behind her below 1.8 m during ~100 % of airborne riding (ensemble lowLineShare 99.9 %, first 1.8 m p50). Her kids ski in her tracks 2-5 m behind: that is the exposed zone.'),
  'J6 planned stop (and wanting to keep going)': S(2, 2, 2, 2, 3, 'Stops every 20 s: device busy 16-37 s while she stands waiting for kids; at restarts the flyer was often still out (CAPTURE/BRAKE at 6/18 restarts in head/cross cases; 2/9 in calm).'),
  'J7 fall': S(3, 3, 2, 3, 3, 'Her own falls are slow; the risk is a child falling over the line/flyer behind her (not modelled).'),
  'J8 restart after stop/fall': S(3, 2, 2, 2, 2, '-'),
  'J9 walk / skate / queue / skin / shuttle bus': S(3, 3, 2, 3, 3, 'Guiding a child at 1.5-2.5 m/s: 0/40 starts (good). Queue 0/600. Ski bus: see P1.'),
  'J10 end of day': S(4, 3, 4, 4, 4, '-'),
  'J11 charging / drying overnight': S(3, 4, 4, 4, 4, '-'),
 },
 'P5': {
  'J1 car gear-up': S(3, 3, 4, 4, 3, '0.913 kg vs his 0.9 kg budget (marginal fail); airbag compatibility (quiver diagonal across the back, lumbar unit on the hip belt) NOT_RUN.'),
  'J2 lift (chair/T-bar/gondola/carpet) with quiver on the back': S(4, 4, 4, 4, 4, 'Skinning instead of lifts: 45-min uphill skin traces 0/10 starts (good).'),
  'J3 top / getting ready': S(3, 2, 3, 4, 3, 'Transition: skins off, boots, pack - wants zero extra time; AT-1 adds none. But descending skin traverses/run-outs with skins on (2-3.5 m/s, 8-15 % grade) gave 19/40 starts -> quiver deploys while touring; with a ridge headwind the wind gate could open.'),
  'J4 push-off / launch': S(4, 2, 1, 4, 1, 'Simulated 28 deg descent at 10 m/s: 9/9 launches failed within ~2.2 s (1 weak-link loss). May partly be a model limit on steep slopes, but the design has no evidence of launching on touring terrain.'),
  'J5 ride / film': S(4, 2, 2, 4, 1, 'Avail 0 % in all 9 descents; flyer dragged/towed up to 57 s; dock 62-79 s after the stop.'),
  'J6 planned stop (and wanting to keep going)': S(2, 3, 3, 4, 2, 'Regroup stops in avalanche terrain: standing 30-70 s for a dock is unacceptable exposure time.'),
  'J7 fall': S(3, 3, 2, 4, 2, 'Deep-snow fall, burial of the flyer, line around limbs in an avalanche: not modelled; cutter (PM-M05) exists; airbag interaction unknown.'),
  'J8 restart after stop/fall': S(3, 3, 3, 4, 2, '-'),
  'J9 walk / skate / queue / skin / shuttle bus': S(4, 3, 3, 4, 3, 'Snowmobile/sled tow-out or car down the pass road: 40/40 starts in our traces.'),
  'J10 end of day': S(4, 4, 4, 4, 4, 'Pack energy fine; -15 C not simulated (shared endurance at -10 C).'),
  'J11 charging / drying overnight': S(3, 4, 4, 4, 4, 'Hut nights: needs USB charging of two cells and line drying.'),
 },
}

def mean_scores(j):
    dims = ['effort', 'confusion', 'fearSafety', 'socialAcceptability', 'failureRecovery']
    return {d: round(sum(v[d] for v in j.values()) / len(j), 2) for d in dims}

report = {
 'id': 'SIM-032/review/usertest',
 'role': 'user-tester panel (simulated personas)',
 'date': '2026-10-20',
 'evidenceBoundary': 'SIMULATED / HEURISTIC USABILITY REVIEW, NOT REAL USER TESTING. No person took part. The five personas from product/report.json were role-played as cognitive-walkthrough evaluators by an AI agent; the "test rig" is the uncalibrated numerical simulator (sim/, activetether@0.1.0) run headless and on a scratchpad copy with extra persona scenarios (rider plans and activity traces are user-tester ASSUMPTIONS). Scores are evaluator judgements, not measurements. Real user tests (T12, T14, T16, T18, all wearing/lift/chairlift trials) are physical, NOT_RUN and need user authorisation. M-070 NOT_RUN, G-MATURE closed. This file does not write project/plan.json; sim/ was not modified.',
 'inputs': ['research/active_tether_2026_10_20/product/report.json (journey J1-J10, PM-M01..M14, product metrics, personas P1-P5, T01-T18)', 'research/active_tether_2026_10_20/dev/design_notes.json, dev/results.json (ensemble 48 cases, product, sensitivity, falseLaunch)', 'research/active_tether_2026_10_20/engineering/report.json (worn unit, quiver, dock, chairlift)', 'sim/js/concepts/activetether/* (model.js mode machine, detect.js, index.js scenarios + demo)'],
 'method': {
  'browserRig': 'sim/ copied to the scratchpad, served by tools/serve.mjs, opened headless (Playwright + Chrome, SwiftShader WebGL) at concepts.html?c=activetether&m=demo&lang=en; demo seeked through all 7 stages; all 12 shipped test scenarios run in test mode; 5 persona scenarios added to the scratchpad copy only (patch in scripts/scratch_sim_scenarios.patch).',
  'scriptedRuns': 'scripts/persona_runs.mjs on the scratchpad copy: persona ride plans x {calm, head 3, tail 3 / cross 3 / cross 6} x seeds 11-13 through the shipped buildResult() pipeline; falls via simulateSkier(fallAt); activity traces through the shipped detector (detect.js). Raw output: sim_persona_runs.json.',
  'scoring': 'Each journey step scored 1-5 on effort, confusion, fear/safety, social acceptability on the piste, failure recovery (5 = best / no problem). Heuristic (Nielsen visibility of status, error prevention, recovery) + cognitive walkthrough ("will the user know what to do / what happened?").',
  'uxMetricsAdded': {'quiverOutRideS': 'seconds of riding with the quiver deployed (O.quiver > 0.5)', 'towedOnSnowWhileRidingS': 'seconds of riding in LANDED/RETRIEVE (flyer on a short line, on or near the snow)', 'standDeviceBusyS': 'seconds standing while the device is not STOWED/DOCKED', 'perStop.modeAtRestart': 'device mode at the moment the rider pushes off again'},
 },
 'whatTheUserSees_demo': {
  'note': 'Demo = 30 s recreational carve + 21 s stop, 1 m/s cross wind, seed 11 (the friendliest case). Screens in screenshots/demo_*.png.',
  'timeline': [
   {'t': '0-0.9 s', 'shot': 'demo_01_stowed.png', 'obs': 'Quiver rendered diagonally from the right hip up past the shoulder blade - a 0.55 m rigid tube across the back; that is the chairlift/backrest profile.'},
   {'t': '0.9-2.2 s', 'shot': 'demo_02_detect.png', 'obs': 'Start detected ~0.8 s after push-off; quiver swings out behind the pelvis. Nothing tells the rider (no light/sound in the design).'},
   {'t': '2.2-9 s', 'shot': 'demo_03_launch_short_line.png, demo_04_launch_payout.png', 'obs': 'Launch on the straight glide; short-line phase visibly swings. The rider must keep a straight line for >=0.6 s - he would naturally start turning.'},
   {'t': '9-30 s', 'shot': 'demo_05_film_carve.png, demo_06_film_turn.png', 'obs': 'Line at ~50 deg; PiP shows a usable rear-high full-body shot. Even in this friendly case the run reports avail 16.1 %, pxMed 242 px, KE 19.1 J (fail).'},
   {'t': '30-34 s', 'shot': 'demo_07_stop_brake.png', 'obs': 'Hockey stop; flyer deep-stalls and drops behind.'},
   {'t': '34-41.7 s', 'shot': 'demo_08_tow_in.png', 'obs': 'Flyer dragged over the snow toward the rider for ~8 s on a magenta line at ankle height - a trip line for anyone skiing past.'},
   {'t': '41.7-52.6 s', 'shot': 'demo_09_capture.png, demo_10_docked.png', 'obs': 'Capture + fold; the rider stood ~12 s before locked. In the shipped ensemble the same step is p50 13.9 s / p90 31.3 s.'},
  ],
  'simulatorUiObservations': [
   'The demo shows only the favourable path; failures that dominate persona runs (launch failure, drag-on-snow while riding, lost flyer, refusals with the quiver out) are only visible if one constructs those cases. Recommend demo stages for refusal, failed launch and short-stop-and-go.',
   'The rider-facing interface (beep/haptic/LED, strap button, app) is not represented at all, so refusal comprehension (PM-M08/T12) and status visibility cannot be walked through in the sim.',
   'For non-run scenarios the setupTime row shows the 48-case ensemble value (22.19 s) next to single-run numbers - confusing for reviewers.',
   'setupTime passes (10-22 s) in runs where the next ride is lost because the device was still retrieving: the shared metric does not charge lost footage or towing-while-riding. Proposed product metrics: nextRideFilmedAfterStop, towedWhileRidingS, quiverOutWithoutFlightS.',
  ],
 },
 'personaJourneys': {p: {'scores': j, 'meanScores': mean_scores(j)} for p, j in journeys.items()},
 'scoreScale': '1 = very bad, 5 = good, for every dimension (confusion 5 = no confusion; fearSafety 5 = no fear/hazard)',
 'simEvidenceByPersona': {
  'P1_beginner_5ms': {'plan': '3 rides 25/20/30 s at 5 m/s short-radius on 10 deg, stops 15/5/30 s', 'summary': 'calm & tail 3: 0 launches, quiver out 71.7-72.2 s of 77.4 s riding, refuseS ~68 s; head 3: 3 launches, 1-2 failures, avail 8.7-21.0 %, KE <=6.4 J, headClear 0.93-1.07 m, towed on snow 13.8-33.2 s, third-party 87-102 s', 'rows': runs_table('P1_beginner_5ms')},
  'P1_beginner_7ms': {'summary': 'calm: 2-3 launches, 1-2 failed, avail 0-1.3 %, headClear 0.36-0.67 m, towed 19-38 s, 1 MANUAL stow; head 3: avail 5-25 %, dock after a 5 s stop up to 42 s; tail 3: no launch, quiver out 72 s', 'rows': runs_table('P1_beginner_7ms')},
  'T05_stop10_go': {'summary': 'restart found the device not locked (BRAKE/CAPTURE) in 6/9 cases; only 3/9 cases launched for the second ride; dock times up to 57 s', 'rows': runs_table('T05_stop10_go')},
  'T05_stop5_go': {'summary': '9/9 cases: second ride never launched (1 launch per 2 rides); device still RETRIEVE/BRAKE/CAPTURE at restart; 1 MANUAL stow', 'rows': runs_table('T05_stop5_go')},
  'P3_expert_15ms': {'summary': '25 deg, 15 m/s: 4/9 launch failures, 3/9 weak-link break (flyer lost); flown runs KE 30-52 J, pxMed 187-222 px, avail 20.5-24.1 %', 'rows': runs_table('P3_expert_15ms')},
  'P4_family_6_5ms': {'summary': '4 rides x ~20 s at 6.5 m/s, stops 8/20/6/25 s: calm 10/10 launches failed (avail 0 %, towed 33-51 s of 86 s riding, headClear 0.41-0.86 m); head 3 avail 5-14 %; third-party 72-116 s per plan', 'rows': runs_table('P4_family_6_5ms')},
  'P5_tour_descent': {'summary': '28 deg, 10 m/s, 60 s descent: 9/9 launch failures at ~2.2 s, 1 weak-link loss, avail 0 %, dock 62-79 s after the stop', 'rows': runs_table('P5_tour_descent')},
  'falls': {k: R['runs'][k]['rows'] for k in ['T02_fall_beginner_5ms', 'T06_fall_12ms', 'P3_fall_15ms']},
  'activityDetector': R['detector'],
  'fromResultsJson': {'ensemble48': {'avail_mean': 16.748, 'pxMed_p50': 279.103, 'jitter_p90': 10.519, 'keMax_max': 57.079, 'keMax_p50': 21.647, 'headClear_min': 0.25, 'headClear_p10': 0.448, 'bodyForcePeak_max': 32.852, 'setupTime_p90': 22.19, 'endurance_min': 73.374, 'casesNeverFlown': 15, 'broke': 2}, 'product': {'launchSuccess_mean': 90, 'dockFirstTry_mean': 80, 'dockTime': {'p50': 13.87, 'p90': 31.25, 'max': 70.86}, 'thirdPartyS_p50': 84.74, 'thirdPartyS_p90': 100.92, 'lowLineShare_mean': 99.898, 'lowLenP90_p50_m': 1.795, 'refuseS_p90': 66.612}, 'falseLaunch': {'days': 40, 'perDay': 0.975, 'busDown': '39/40 starts, 39 pass the wind gate', 'chairlift': '0/438', 'surfaceLift': '0/162', 'queue': '0/600', 'gondolaDown': '0/20'}, 'liftGeofenceScenario_browser': {'setupTime_s': 5.69, 'dockFirstTry_pct': 50, 'Tmax_N': 150.99, 'bodyForcePeak_N': 31.91, 'note': 'pre-dock while riding shortens standstill but shows a 151 N instantaneous exit-tension spike (50 ms body force 31.9 N)'}},
 },
 'testScenarios': [
  {'id': 'T01', 'status': 'SIM_RUN (dev ensemble + browser fullrun)', 'result': 'FAIL 5/13 shared criteria: avail 16.7 %, pxMed 279 px, jitter 10.5 deg/s, keMax 57.1 J, headClear 0.25 m. Pass: azRange, mass 0.913 kg, body force 32.9 N, handsBusy 0, setupTime 22.2 s, ops 0, packVol 2.28 L, endurance 73 min.'},
  {'id': 'T02', 'status': 'SIM_APPROX (persona plan P1 5 & 7 m/s + beginner fall)', 'result': 'Body force <=17 N PASS. headClear 0.36-0.67 m at 7 m/s calm FAIL. Honest refusal at 5 m/s: the device does refuse, but silently with the quiver out for ~68 s per run - honesty requires an audible reason (PM-M08) and folding back. missedLaunch excluding refusals: at 7 m/s calm the device attempted launches but avail was 0-1.3 %, i.e. essentially all 9 rides unfilmed FAIL (target <=5 %). Fall detection 0.60-0.64 s (PM-M09 <=0.5 s) FAIL marginal.'},
  {'id': 'T03', 'status': 'SIM_APPROX (energy arithmetic + ensemble)', 'result': 'Pack endurance PASS (min 73 min, p50 163 min at -10 C vs ~60 filmed min/day). Flyer cell 1.65 Wh at 4.25 W = ~23 min airborne/charge -> depends on dock charging on lifts (cell must be >5 C) - unverified. avail 16.7 % FAIL, dock first-try 80 % FAIL. Over 20 runs with 2 stops each: ~9 min (p50) to ~21 min (p90) of standing for docks per day.'},
  {'id': 'T04', 'status': 'SIM_RUN (ensemble tail band + browser tail45/tail6)', 'result': 'Clear refusal for tail >=3.5 m/s in sim (no launch, refuseS ~67 s), but quiver stays out (t04_tail45_refusal_quiver_out.png) and no user-facing reason exists. Tail 3 launches fail 3/6 attempts; KE 18.7-21.7 J > 14.9 J FAIL; headClear 0.58-0.79 m FAIL.'},
  {'id': 'T05', 'status': 'SIM_RUN (scripted 10 s and 5 s stop-and-go)', 'result': 'FAIL. 10 s stop: device not locked at restart in 6/9; next ride launched in 3/9. 5 s stop: next ride filmed 0/9; 1 manual stow. Flyer towed on a short line behind a 12 m/s rider for most of the second ride (t05_second_ride_towed.png).'},
  {'id': 'T06', 'status': 'SIM_RUN (fall at 12-13 m/s, 3 seeds; valid 6 s after the fall)', 'result': 'Body force <=10.7 N, head clearance >=1.15 m, KE <=13.3 J PASS within model scope. Fall detection 0.58-0.60 s (>0.5 s target). Line around limbs NOT modelled -> physical dummy test NOT_RUN.'},
  {'id': 'T07', 'status': 'SIM_APPROX (no crowd model; thirdPartyS proxy)', 'result': 'FAIL: line below 2 m more than 0.5 m behind the rider p50 84.7 s / p90 100.9 s per run (target 0). A skier crossing 1-3 m behind meets the line ~100 % of airborne riding time. Needs a crowd/third-party agent model (sim-new) and contact/load model.'},
  {'id': 'T08', 'status': 'NOT_RUN', 'result': 'Tree snag not modelled. Needs: line-snag model + physical bench with 38 N weak link / 35 N clutch / cutter at 15 m/s, locator beacon test. Indirect signal: at 15 m/s on 25 deg 3/9 runs already broke the weak link without any tree.'},
  {'id': 'T09', 'status': 'NOT_RUN', 'result': 'Skier model has no airtime. Needs a jump/drop trajectory (1.5 s airtime, 14 m/s landing) in sim-new; physical rig later.'},
  {'id': 'T10', 'status': 'SIM_APPROX (detector on skin traces + descent plan)', 'result': 'Skinning uphill 0/10 x 45 min starts PASS. Descending skin traverse 19/40 starts (deploys while touring) FAIL-risk. 28 deg descent 9/9 launch failures FAIL (check model on steep slopes). -15 C endurance NOT simulated (shared -10 C rule). Airbag compatibility NOT_RUN.'},
  {'id': 'T11', 'status': 'SIM_APPROX (synthetic traces: results.json + user-tester traces)', 'result': 'Lifts 0 launches PASS (synthetic). Unintended per day 0.975 (bus) FAIL vs <=0.2; car/shuttle 40/40 and snowmobile/sled tow 40/40 starts in our traces; gentle downhill cat tracks 27/40; beginner drifts 24/40. Recorded IMU traces (>=500 lift rides, >=50 ski days) NOT_RUN.'},
  {'id': 'T12', 'status': 'NOT_RUN (physical usability)', 'result': 'Heuristic: FAIL by design inspection - no spoken/beep vocabulary is specified; in sim a refusal looks identical to "about to launch" (quiver out). Needs: prototype audio prompts, >=10 testers per persona, 9 m/s cross wind at the top, comprehension interview.'},
  {'id': 'T13', 'status': 'SIM_APPROX (lift geofence scenario) / usability NOT_RUN', 'result': 'Pre-dock geofence 6 s before the lift stop: setupTime 5.7 s, but first-try dock 50 % and a 151 N instantaneous exit tension. No alarm or forced reel-in logic for "approaching lift with line out" exists in model.js. Needs lift-approach geofence + alarm state + manual-stow timing test with gloves.'},
  {'id': 'T14', 'status': 'NOT_RUN (physical); MODAPTS-style estimate', 'result': 'The single strap control is reachable, but manual stow after 3 failed captures means pulling the flyer nose into a quiver mouth 0.66 m behind the pelvis - a blind reach behind the back (violates "no blind insertion behind back"). Model assumes 20 s. Estimate with mittens 25-45 s.'},
  {'id': 'T15', 'status': 'SIM_RUN (sensitivity capture x0.8, sensors x2) / usability NOT_RUN', 'result': 'Dock first-try falls to 71 % (capture x0.8) / 69 % (sensors x2); setupTime p90 55 s in 6 sensitivity sets. Manual stows observed: 1 of 48 ensemble, 2 of our persona runs. Hand-near-loaded-line rule not modelled.'},
  {'id': 'T16', 'status': 'NOT_RUN', 'result': 'Out-of-box: pairing, fit, first flight - needs a physical prototype and app.'},
  {'id': 'T17', 'status': 'NOT_RUN in sim (no crowd model); design inspection FAIL', 'result': 'No crowd sensing in model.js; device launches regardless of people behind. Needs crowd model + rear sensor concept.'},
  {'id': 'T18', 'status': 'NOT_RUN (physical viewer panel)', 'result': 'Sim PiP renders can rehearse the protocol only; with pxMed 279 px and 16.7 % availability we would not expect >=60 % preference vs Insta360 X5 / HoverAir - prediction, not evidence.'},
 ],
 'topProblems': [
  {'rank': 1, 'severity': 'critical (safety)', 'problem': 'Line low behind the rider = clothesline/trip line for third parties, worst for families and crowded pistes.', 'evidence': 'thirdPartyS p50 84.7 s / p90 100.9 s per run; lowLineShare 99.9 % of airborne riding; first ~1.8 m behind the quiver below 1.8 m; drag-on-snow phases (towedOnSnowWhileRidingS up to 51 s per P4 plan).', 'designChange': 'Raise the exit above head height (shoulder-mast or helmet-height exit) or accept that AT-1 is a no-crowd product: rear-facing presence sensor (radar/camera) that blocks launch and forces fly-in when anyone is within ~10 m behind; hi-vis line + flag on the first 3 m; rear LED showing "line out"; never tow the flyer on snow while riding.'},
  {'rank': 2, 'severity': 'critical (safety)', 'problem': 'Flyer kinetic energy far above the 14.9 J cap at normal and expert speeds.', 'evidence': 'Ensemble KE max 57.1 J, p50 21.6 J; P3 15 m/s 30-52 J; mass x0.5 still 40.5 J.', 'designChange': 'Hard speed governor: refuse/land above the speed where KE would exceed 14.9 J (~12 m/s for 116 g incl. swing); <=60 g flyer study; padding/frangible nose. This is architectural - not a UX patch.'},
  {'rank': 3, 'severity': 'critical (safety)', 'problem': 'False launches in vehicles and tows (bus, car, snowmobile/sled).', 'evidence': 'results.json bus 39/40 starts pass the wind gate (0.975/day vs <=0.2); our car/sled traces 40/40 starts.', 'designChange': 'Require snow-chatter spectral signature + ski-specific turn rhythm; disarm above 20 m/s or after >60 s without snow signature; "transport lock" that engages automatically when the pack is taken off/buckle opened and must be released with one deliberate action at the top; hard mechanical quiver lock independent of software.'},
  {'rank': 4, 'severity': 'high (usability, core JTBD-3)', 'problem': 'Short stop then go: dock p90 31 s means the next ride is not filmed and the flyer is towed behind.', 'evidence': 'T05: 10 s stop -> not locked at restart 6/9, next ride launched 3/9; 5 s stop -> next ride launched 0/9. Ensemble dock p50 13.9 / p90 31.3 / max 70.9 s; first try 80 %.', 'designChange': '"Keep going" path: on a stop <15 s hold at short line (fly-in/hover-kite) instead of land-and-tow; if the rider restarts during retrieve, re-launch from the tow instead of locking out the ride; allow capture while riding slowly (slowdock) so the device is ready; audible "docking - 10 s" and "ready" cues; make nextRideFilmedAfterStop a judged metric.'},
  {'rank': 5, 'severity': 'high (safety)', 'problem': 'Head clearance during stops/tow-in/fly-in in tail/cross wind.', 'evidence': 'headClear min 0.25 m, p10 0.45 m (ensemble), 0.36 m beginner 7 m/s calm, 0.17 m P5 calm descent.', 'designChange': 'Side-drop always, never fly-in from the windward side; stop reel-in when the flyer is <1.5 m from the helmet estimate (UWB) and let it land; flyer padding.'},
  {'rank': 6, 'severity': 'high (usability/expectation)', 'problem': 'Speed envelope excludes beginners and families, and the 6-8 m/s band is worse than not flying.', 'evidence': 'P1 5 m/s: 0 launches; P1 7 m/s and P4 6.5 m/s calm: 1-4 failed launches per plan, flyer dragged 19-51 s per plan, avail ~0 %.', 'designChange': 'Do not attempt below a speed+wind margin that predicts >=95 % success (e.g. gate on predicted sustained apparent wind >=1.6 Vs over the next 5 s); market AT-1 for >=10 m/s riders; state the envelope on the box/app ("films from ~10 m/s; slower = stays stowed").'},
  {'rank': 7, 'severity': 'high (usability/social)', 'problem': 'Quiver deploys and stays out when the device refuses or for false starts.', 'evidence': 'quiverOutRideS 68-72 s per 77 s run at P1 5 m/s; tail45 screenshot; beginner drift starts 24/40, skin traverse 19/40, cat track 27/40.', 'designChange': 'Evaluate the launch gate BEFORE deploying the quiver (deploy only when a launch is predicted within 2 s); fold back after 3 s of refusal; one short audio reason ("too slow", "tailwind", "crowd").'},
  {'rank': 8, 'severity': 'high (loss/cost)', 'problem': 'Weak-link breaks and lost flyers at expert speeds / steep terrain; launch failures on steep slopes.', 'evidence': 'P3 25 deg 15 m/s: 3/9 weak-link losses, 4/9 launch failures; P5 28 deg 10 m/s: 9/9 launch failures, 1 loss; ensemble broke 2/48.', 'designChange': 'Check steep-slope launch geometry (rail pitch vs slope, release height); retain the flyer on a secondary leash after a weak-link event (weak link releases tension, not the flyer); beacon + app "find flyer"; refuse launch above slope/speed limits.'},
  {'rank': 9, 'severity': 'medium-high (comfort/safety)', 'problem': 'Rigid 0.55 m quiver on chairlifts, T-bars, in backward falls and next to children.', 'evidence': 'Demo shows it stowed diagonally across the back; engineering: 65 mm backrest plate ASSUMED acceptable, breakaway <=60 N, top risk #2. T-bar/platter interaction not analysed at all.', 'designChange': 'Stow the quiver flat along the spine inside the pack outline; T-bar/platter fit test and a "surface-lift" mode; breakaway hinge verified by drop dummy; consider a telescopic/collapsible quiver.'},
  {'rank': 10, 'severity': 'medium (usability)', 'problem': 'No status/feedback channel designed; refusal comprehension and manual fallback undefined.', 'evidence': 'PM-M08 and T12 have no implementation; manual stow requires blind insertion behind the back after 3 failed captures.', 'designChange': 'Define an audio/haptic vocabulary (6 messages max) and a front-visible strap LED; manual fallback = reel brings the flyer to the hand in front (shoulder guide), then one-handed push into a front-loading sleeve; app shows flyer battery and dock-charging state.'},
  {'rank': 11, 'severity': 'medium', 'problem': 'Footage quality below the product reason.', 'evidence': 'avail 16.7 %, pxMed 279 px, jitter p90 10.5 deg/s; first ~9 s of every ride unfilmed; P3 pxMed 187-222 px.', 'designChange': 'Narrower lens / zoom crop at 10 m line; reduce launch latency (pre-deploy quiver at the top on user arm); stabilisation.'},
  {'rank': 12, 'severity': 'medium (touring)', 'problem': 'Touring fit: 0.913 kg vs 0.9 kg target, airbag compatibility unknown, flyer cell cannot charge below 5 C.', 'evidence': 'design BOM 0.913 kg; engineering battery note; no -15 C model.', 'designChange': 'Touring "descent arm" button (one action acceptable to P5), body-heated flyer cell bay, airbag-compatible mount study.'},
 ],
 'personaVerdicts': {
  'P1': {'verdict': 'would not buy, would not use', 'why': 'At her 3-7 m/s the product either never flies (quiver out all run) or fails launches and drags the flyer behind her; she fears hurting someone and being embarrassed - both triggered. KE is low at her speed but head clearance is not.'},
  'P2': {'verdict': 'would not buy v1 (would try a demo unit)', 'why': '~17 % usable footage at 279 px and 10.5 deg/s jitter does not meet "same angle every run, full body, smooth"; 14-31 s standing per stop and losing the next run after a short stop break JTBD-3. At USD 399-599 he picks an Insta360 X5 or HoverAir. Would reconsider if avail >=60 %, dock <=10 s, KE within cap.'},
  'P3': {'verdict': 'would not buy, would not use', 'why': 'KE 30-52 J at his speeds, 3/9 lost flyers at 15 m/s on 25 deg, no tree handling, rigid quiver in tree wells. The weak link "saves him" from body force, but at the cost of the flyer.'},
  'P4': {'verdict': 'would not use (and expects resort staff to stop her)', 'why': 'The child skiing in her tracks is exactly the third-party zone (72-116 s exposure per plan); at 6.5 m/s calm every launch failed and the flyer was dragged 33-51 s; no crowd sensing; resort permission unresolved.'},
  'P5': {'verdict': 'would not buy v1; would use a touring-specific v2', 'why': 'Likes 0 starts while skinning uphill and ample pack energy, but 9/9 simulated steep-descent launches failed, 0.913 kg > 0.9 kg, airbag compatibility unknown, skin-traverse deploys (19/40), cold flyer-cell charging. A single deliberate "descent arm" action would be acceptable to him.'},
 },
 'mustFixV2': [
  'MF-1 Third-party/clothesline: raised exit or crowd-blocking + never drag the flyer while riding; target thirdPartyS 0 s (currently p50 84.7 s).',
  'MF-2 KE <=14.9 J at all speeds via speed governor/lighter flyer (currently max 57 J, p50 21.6 J).',
  'MF-3 Vehicle/tow false-launch prevention + automatic transport lock (currently 0.975/day from bus alone).',
  'MF-4 Short-stop-and-go: next ride filmed after a 5-10 s stop in >=90 % (currently launched 0/9 and 3/9); dock p90 <=10 s, first try >=98 % (currently 31.3 s, 80 %).',
  'MF-5 Head clearance >=1.0 m in all stop/tow/fly-in phases (currently min 0.25 m).',
  'MF-6 Gate before deploy: quiver stays stowed when a launch is not predicted; fold back after 3 s refusal (currently out ~68 s/run on refusals).',
  'MF-7 Launch reliability >=95 % incl. 6-8 m/s band and steep (25-30 deg) slopes, or a declared envelope that refuses those cases outright (currently 90 % mean; 0 % P4 calm; 0/9 P5).',
  'MF-8 Flyer retention after weak-link events + beacon (currently 3/9 losses at P3 15 m/s).',
  'MF-9 Audio/haptic status vocabulary and front-visible LED; refusal reasons (PM-M08) - prerequisite for T12.',
  'MF-10 Manual fallback without blind reach behind the back, <=30 s with mittens (T14/T15).',
  'MF-11 Quiver stowed profile compatible with chairlift backrest, T-bar/platter and backward falls (physical fit + drop tests).',
  'MF-12 Fall detection <=0.5 s (currently 0.56-0.64 s).',
 ],
 'physicalTestsNeeded_NOT_RUN': ['T08 snag bench', 'T09 jump rig', 'T11 recorded lift/vehicle IMU logs', 'T12 refusal comprehension', 'T13 lift approach with line out', 'T14 gloves/handedness', 'T15 manual stow usability', 'T16 out-of-box', 'T17 crowd', 'T18 viewer panel', 'chairlift/T-bar/gondola fit with the quiver', 'airbag compatibility', 'backward-fall drop dummy', '-15 C endurance'],
 'screenshots': sorted([f for f in os.listdir(D + '/screenshots') if f.endswith('.png')]),
 'screenshotNotes': {
  'demo_01..10': 'AT-1 demo mode, each stage (see whatTheUserSees_demo)',
  'test_01..12': 'the 12 shipped AT-1 test scenarios in order (nominal, fullrun, tail45, tailstop6, liftapproach, fall, gust, shortturns, moguls, chairdown, v_delta_fly, v_kite_line), full page at t = 14 s with metrics; log in screenshots/shots_log.json',
  'p1_beg5_quiver_out_no_launch': 'P1 5 m/s calm: riding with the quiver deployed, no launch (t = 12 s)',
  'p1_beg7_flyer_dragged_while_riding': 'P1 7 m/s calm: failed launch, flyer towed on the snow while she rides (t = 15 s)',
  'p1_beg7_manual_stow': 'P1 7 m/s calm seed 13: three missed captures -> MANUAL stow (t = 112 s)',
  'p4_family_towed_behind': 'P4 6.5 m/s head 3: flyer dragged ~4 m behind on the snow (t = 12 s)',
  'p4_family_filming': 'P4: one of the few filmed windows (t = 42 s)',
  't05_stop10_standing': 'T05: during the 10 s stop the flyer is still braking/landed (t = 45 s)',
  't05_second_ride_towed': 'T05: second ride, flyer towed on a short line at 12 m/s, not filming (t = 66 s)',
  'p3_exp15_launch_fail': 'P3 15 m/s 25 deg: launch failure ~0.2 s after release (t = 3 s)',
  'p3_exp15_weaklink_flyer_lost': 'P3: weak link broke at 5.2 s, flyer FREE (t = 8 s)',
  't04_tail45_refusal_quiver_out': 'T04 tail 4.5 m/s: refusal, quiver out, nothing tells the rider why (t = 20 s)',
  't11_chair_download_stowed': 'Downloading chairlift: stays stowed (t = 10 s)',
 },
 'files': {'report': 'review/usertest/report.json', 'rawSim': 'review/usertest/sim_persona_runs.json', 'scripts': 'review/usertest/scripts/ (persona_runs.mjs, shots.py, shots2.py, modes.mjs; scratch_sim_scenarios.patch = persona scenarios added to the scratchpad copy only)', 'screenshots': 'review/usertest/screenshots/'},
 'limitations': ['Personas are role-played by an AI; scores are heuristic judgements.', 'All numbers are from an uncalibrated simulation with ASSUMED polars, capture model and synthetic activity traces.', 'Persona rider plans (speeds, slopes, stops) are user-tester assumptions, 3 seeds each - small samples.', 'Steep-slope launch failures (P3/P5) may partly reflect model limits; flagged for the dev team, not concluded as physics.', 'Falls are valid only 6 s after the event; tumbling, wraps, snags, trees, airtime, crowds and the rider-facing UI are not modelled.'],
}
json.dump(report, open(D + '/report.json', 'w'), indent=1, ensure_ascii=False)
print('ok', {p: v['meanScores'] for p, v in report['personaJourneys'].items()})
