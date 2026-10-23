// Assemble report.json from the experiment outputs (out/*.json) plus the hand-written hypotheses, verdicts and
// recommendations. Run after exp1–exp4: node make_report.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { SPECS } from './lib/sensors.mjs';
import { FLYERS, LINE, REEL, MOTORS, AIRDATA, CTRL } from './lib/tether.mjs';

const J = (f) => JSON.parse(readFileSync(new URL(`./out/${f}`, import.meta.url), 'utf8'));
const e1 = J('exp1_startstop.json'), e2 = J('exp2_estimation.json'), e3 = J('exp3_flight.json'), e4 = J('exp4_events.json');
const v1 = e1.variants, v3 = e3.variants, v2 = e2.variants;
const nonSkiHours = Object.values(v1.full.perActivity).reduce((a, x) => a + x.hours, 0);
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
const flightKeys = ['availMean', 'availTailMean', 'crashRunsShare', 'crashesMean', 'keMaxP50', 'keMaxP90', 'keMaxMax', 'keOver14_9Share', 'bodyFP50', 'bodyFMax', 'bodyFOver40Share', 'minHeadLineP10', 'dockVrelP50', 'dockVrelP90', 'dockUnder1_5Share', 'retrieveP50', 'retrieveP90', 'stallSMean', 'powerZoneSMean', 'snowSMean', 'energyWhPerRunP50', 'peakWP90', 'reelInMax', 'reelOutMax', 'heightP50', 'elevP50', 'lineLowShare', 'refusedSMean'];

const report = {
  title: 'SIM-032 active-tether follow-cam — controls / estimation science (autonomy: detection, estimation, reel & flyer control, launch / retrieve / dock, abnormal events)',
  role: 'controls / estimation scientist',
  generated: new Date().toISOString().slice(0, 10),
  evidence: 'Numerical, uncalibrated simulation only (point-mass tethered flyer, quasi-static straight line with sag correction, synthetic activity kinematics). NOT physical verification: M-070 not_run, G-MATURE closed. No purchasing, outreach or physical tests. Numbers marked ASSUMED are placeholders.',
  scripts: {
    'lib/sensors.mjs': 'sensor/actuator specs with sources + noise helpers',
    'lib/traces.mjs': 'back-pack motion traces: ski runs from simulateRun/FULLRUN_PLAN, synthetic queue/chairlift/surface lift/walk/gondola/cat-track/bus/sit-down',
    'lib/detect.mjs': 'ride start/stop/fall detector (IMU + GNSS + baro, post-lift lockout) and scoring',
    'lib/tether.mjs': 'truth model (flyer, line, reel/motor, snow) + tether-only EKF, air-data path, mode machine, reel law, flyer pitch/roll/spoiler loops',
    'lib/runner.mjs': 'sharding / caching helpers',
    'exp1_startstop.mjs': 'H1 detection (40 synthetic ski days + 60 ski runs + 12 lazy starts)',
    'exp2_estimation.mjs': 'H2 estimation in shadow mode over FULLRUN_CASES_R4',
    'exp3_flight.mjs': 'H3–H7, H10–H11 closed-loop full runs over FULLRUN_CASES_R4 (14 variants × 48 cases)',
    'exp4_events.mjs': 'fall abort, chairlift approach, third-party exposure',
    'dbg_one.mjs / dbg_eq.mjs': 'development aids (single full run; steady straight/carving equilibrium tests); not used for headline numbers except where cited as "steady-flight test"',
    outputs: 'out/exp1_startstop.json, out/exp2_estimation.json, out/exp3_flight.json, out/exp4_events.json',
  },
  hypotheses: [
    {
      id: 'H1', claim: 'A back-worn IMU (+GNSS +baro) detects ride starts in <1.0 s (p90) with <1 false launch per ski day and no missed starts; chairlift, queue, walking, gondola never trigger.',
      method: 'Detector on synthetic sensor streams (ICM-42688 + AHRS budget, MAX-M10S 10 Hz with 5 % outages, BMP390 with in-pack dynamic-pressure error). 60 project skier runs (4 style presets × 12 seeds + 12 falls), 12 slow "glide-away" starts, 40 simulated days (15 laps queue+chair/surface lift, walks, gondola, cat tracks, sit-downs; ' + nonSkiHours.toFixed(0) + ' h non-ski motion), bus descent separately. Start latency measured from push-off.',
      numbers: {
        full: { startLatency: v1.full.ski.startLat, missedStarts: v1.full.ski.missedStart, falseStartsInSkiRuns: v1.full.ski.falseStart, lazyStart: v1.full.lazyStart.startLat, lazyMissed: v1.full.lazyStart.missedStart, stopLatency: v1.full.ski.stopLat, stopLatencyNote: 'p50 0.38–0.52 s for carving/short turns (decel trigger); moguls (24°, 4.5 m/s) 2.2 s because the hockey-stop decel minus gravity stays below the 2.5 m/s² trigger and the speed rule fires instead', fallLatency: v1.full.ski.fallLat, falseFalls: v1.full.ski.falseFall, falseLaunchPerDay: v1.full.falseLaunchPerDay, falseLaunchUpper95PerDay: +(3 / e1.days).toFixed(3), busDescentFalseStartsPerTrip: v1.full.busDescentFalseStartsPerTrip },
        noBaro: pick(v1.noBaro, ['falseLaunchPerDay']), imuOnly: { falseLaunchPerDay: v1.imuOnly.falseLaunchPerDay, missedStops: v1.imuOnly.ski.missedStop, falseStops: v1.imuOnly.ski.falseStop },
        imuOnlyNoBaro: { falseLaunchPerDay: v1.imuOnlyNoBaro.falseLaunchPerDay, missedStarts: v1.imuOnlyNoBaro.ski.missedStart },
        noPostLiftLockout: v1.noLockout.falseLaunchPerDay, fastThresholds: { startLatency: v1.fastStart.ski.startLat, falseLaunchPerDay: v1.fastStart.falseLaunchPerDay },
      },
      verdict: 'SUPPORTED IN SIMULATION, with conditions. p90 0.98 s from push-off, 0 missed, 0 false launches in 40 synthetic days (95 % upper bound ≈0.075/day) — but only with GNSS (speed gate 2.8 m/s > fixed-grip chair speed), a descent gate, ski-vibration gate, a from-rest condition and a post-lift lockout (30 m of non-ascending travel). Removing the lockout gives ≈2 false launches/day on chairlift unload ramps; IMU-only without baro gives ≈4/day and misses starts. Gentle glide-away starts take 3.4–4.7 s. Every bus/car descent produced a false start → the product needs a ski-session arm (dock latch + "armed" state set by the first lift ride or a pole-tap gesture) or a resort geofence. Activity models are synthetic: a labelled field log (≥50 ski days, several resorts) is required before any claim.',
    },
    {
      id: 'H2', claim: 'Tension + 2-axis line angle (+ reel encoder, pack GNSS/IMU) alone suffice to estimate the apparent wind at the flyer to ±1 m/s, plus flyer position and lift margin, without any flyer air data.',
      method: 'Shadow-mode estimators on identical (oracle-flown) trajectories over the 48-case ensemble. Tether-only estimator = exit-angle sag correction + line kinematics + a 3-state EKF on the wind vector inverting the aero model (AoA referenced to the line), gated by an attached-flow prior. Variants: realistic sensors, calibrated load cell & polar, + flyer IMU specific force, perfect sensors (structural floor), and flyer air data (pitot + vane + attitude). Plus a steady-flight test (12 m line, carving, calm) with a one-factor-at-a-time error budget (dbg_eq.mjs).',
      numbers: { ensemble: Object.fromEntries(Object.entries(v2).map(([k, x]) => [k, pick(x, ['vaAbsErr', 'windHorizErr', 'windHorizErrAirdata', 'flyerPosErr', 'aoaAbsErrDeg', 'lowLiftDetect'].filter((kk) => x[kk]))])),
        steadyFlightTest12m: { perfectSensors: { vaAbsErrP50: 1.25, vaAbsErrP95: 9.3, windErrP50: 1.45, windErrP95: 3.71 }, realisticSensors: { vaAbsErrP50: 7.5, windErrP50: 8.5 }, calibratedCellAndPolarPlusFlyerImu: { vaAbsErrP50: 1.44, windErrP50: 1.7, windErrP95: 3.6 }, airdata: { windErrP50: 0.94, windErrP95: 3.84 },
          oneFactorMeanAbsWindX: { none: 0.74, loadCellScale5pct: 2.81, loadCellBias0_1N: 2.17, polar8pct: 3.29, lengthScale3pct: 0.93, packYaw4deg: 0.77, tilt1_5deg: 0.76, angleBias0_7deg: 0.83, gnss: 0.9 } } },
      verdict: 'FALSIFIED. Structural reason: the aerodynamic force on a tethered wing is almost parallel to the line, so the rotation of the apparent wind about the tether axis is (nearly) unobservable from tension + line angle; only the skier\'s turns make it observable over time, and any force-scale error (load-cell scale 5 %, polar 8 %) is dumped into that weak direction (steady test: mean wind error 0.7 → 2.2–3.3 m/s from a single factor). Even with perfect sensors the 48-case ensemble gives |va| error p50 ≈5.6 m/s (quasi-static assumption and model mismatch during the large swings the controller does not suppress); in steady flight the floor is ≈1.3–1.5 m/s p50 with heavy tails. Flyer position from the exit angle is ≈1.0–1.6 m p50 (≈7–10 % of line length; pack yaw and sag dominate). Low-lift (LM<1.3) detection recall ≤0.2. With a flyer pitot + AoA vane + attitude the horizontal wind error is ' + v2.airdata.windHorizErrAirdata.p50 + ' m/s p50 / ' + v2.airdata.windHorizErrAirdata.p95 + ' m/s p95 — still not ±1 m/s p95. Tension remains a good fast *tension* signal for the reel loop, not an anemometer.',
    },
    {
      id: 'H3', claim: 'A single tension (reel) loop can replace a flight controller on the glider (and kite).',
      method: 'exp3 closed loop over 48 cases: A1 = reel admittance only, flyer with fixed bridle pitch + spoilers and an open-loop launch pitch schedule; A2 = + roll loop; A3 = + AoA/pitch-vs-line loop and spoiler elevation loop; with launch from the back and started in flight at 12 m (launch excluded). Steady equilibrium tests (dbg_eq) on straight and carving runs.',
      numbers: { G_A1: pick(v3['G-A1'], ['availMean', 'crashesMean', 'heightP50', 'keMaxP50', 'bodyFMax']), G_A1_inflight: pick(v3['G-A1-inflight'], ['availMean', 'crashesMean', 'heightP50', 'elevP50']), G_A2_air: pick(v3['G-A2-air'], ['availMean', 'crashesMean', 'heightP50']), G_A3_air_inflight: pick(v3['G-A3-air-inflight'], ['availMean', 'availTailMean', 'crashesMean', 'heightP50', 'elevP50']), K_A1: pick(v3['K-A1'], ['availMean', 'crashesMean', 'bodyFP50', 'bodyFMax', 'heightP50']), K_A3_air: pick(v3['K-A3-air'], ['availMean', 'crashesMean', 'bodyFP50', 'heightP50']) },
      verdict: 'FALSIFIED for the glider; not supported for the kite. Physics found in the model: (1) lift on a tethered wing points along the line, so lateral position is neutral/unstable — a wing with no roll feedback drifts to the window edge where its line-referenced AoA collapses (A1 diverged laterally in ~3 s even in straight, steady running; with a roll loop of bank > lateral angle, K_φ≈1.8, it held); (2) on a 15° slope the wind window tilts forward with the slope and the weight component along the slope pulls the flyer forward → overflight and slack unless drag (spoilers) holds it back; (3) a high-L/D wing at window elevations <40° is in a deep power zone (AoA 40–90°) from which only a ≈80° pitch (flag-out) range recovers. A1 glider: ' + v3['G-A1'].availMean + ' availability, flyer median height ' + v3['G-A1'].heightP50 + ' m (on/near the snow). The kite A1 kept flying more (avail ' + v3['K-A1'].availMean + ') but with median peak body force ' + v3['K-A1'].bodyFP50 + ' N (power-zone dragging). Minimum flyer control set: roll (steering), line-referenced pitch with flag-out range, spoilers/depower, and AoA/airspeed sensing.',
    },
    {
      id: 'H4', claim: '"Fly it like a kite" (pay out with surplus tension, reel in when tension/lift drops) keeps the flyer airborne through lulls and tail winds and gives ≥80 % filming availability.',
      method: 'exp3 A3 variants (admittance reel law, flyer force target 2×T_set so the surplus is paid out, length target 15 m glider / 12 m kite; launch gate: est. apparent wind ≥1.3 V_stall and skier accel <2 m/s² for 0.3 s).',
      numbers: Object.fromEntries(['G-A3-air', 'G-A3-oracle', 'G-A3-air-inflight', 'K-A3-air', 'K-A3-oracle'].map((k) => [k, pick(v3[k], ['availMean', 'availP10', 'availTailMean', 'stallSMean', 'powerZoneSMean', 'snowSMean', 'refusedSMean'])])),
      verdict: 'FALSIFIED as implemented. Best availability (share of riding time with line >5 m and flyer >2 m above the pack) is ' + v3['K-A3-oracle'].availMean + ' (kite, oracle — labelled sensitivity) and ' + v3['G-A3-air-inflight'].availMean + ' (glider already at 12 m); with launch from the back and real estimates ' + v3['G-A3-air'].availMean + ' (glider) / ' + v3['K-A3-air'].availMean + ' (kite). Every variant has snow contacts in every run. Tail winds remain the hard case (glider-in-flight ' + v3['G-A3-air-inflight'].availTailMean + '). Reel-in does supply airspeed (reel-in peaks ≈5.5–7 m/s used) but cannot make up for apparent wind near zero for more than L/v_r ≈2–3 s. The law itself is sound for the reel (smooth, ≤8 m/s² command slew), but the reel cannot stabilise the flyer: that needs H3\'s flyer loops working at short line lengths, which they did not.',
    },
    {
      id: 'H5', claim: 'An 80 g drone outrunner (MN3508 KV380 class, direct drive, 4S, Ø25 mm drum) gives enough reel bandwidth, speed (≥6 m/s in) and pull (≥25 N) with <150 W peak and <0.2 Wh per run.',
      method: 'Reel truth model: drum + rotor inertia (reflected ≈0.27 kg at the line), viscous + Coulomb friction, V/I-limited torque–speed envelope, FOC current loop, 500 Hz velocity loop with tension feed-forward from a 22 ms-delayed load cell. Variants M0 (2207 KV900 + 5:1, 3S), M1, M2 (6S, Ø32 mm).',
      numbers: Object.fromEntries(['G-A3-air', 'G-A3-air-M0', 'G-A3-air-M2', 'K-A3-air'].map((k) => [k, pick(v3[k], ['peakWP90', 'energyWhPerRunP50', 'reelInMax', 'reelOutMax', 'satSMean', 'retrieveP90', 'bodyFP50'])])),
      verdict: 'PARTLY SUPPORTED. M1 reached ≈5.5–7 m/s reel-in and kept energy at ≈0.06–0.16 Wh per 100 s run (≈2–6 Wh per day of 35 runs — small next to the camera), but peak electrical power p90 is ' + v3['G-A3-air'].peakWP90 + ' W (spikes when braking/accelerating against snatch loads) → size the ESC/battery for ≈250 W bursts. M0 (geared, 3S) is too slow (reel-in max ' + v3['G-A3-air-M0'].reelInMax + ' m/s) and drew higher peaks; M2 (6S, larger drum) gave the fastest reel-in at slightly lower peak power. Reflected reel inertia (0.27 kg > flyer mass) means tension spikes are set by the series shock spring (150 N/m used) — the spring, not the motor bandwidth, is what keeps snatch loads bounded; without it the stiff line produced 40–55 N snatches at launch.',
    },
    {
      id: 'H6', claim: 'Automatic launch from the back succeeds on ≥95 % of detected rides within 5 s, with no snow contact.',
      method: 'exp3 full runs (launch from a dock 0.27 m above the pack, high-lift climb-out, ≤2 m/s pay-out while the line is short) vs. "in-flight" variants started at 12 m.',
      numbers: { G_A3_air: pick(v3['G-A3-air'], ['crashRunsShare', 'crashesMean', 'refusedSMean', 'availMean']), G_A3_air_inflight: pick(v3['G-A3-air-inflight'], ['crashRunsShare', 'crashesMean', 'availMean']), K_A3_air: pick(v3['K-A3-air'], ['crashRunsShare', 'crashesMean', 'availMean']) },
      verdict: 'FALSIFIED. The short-line phase (<5 m) is the crux: a carving skier moves the pack laterally ±≈4 m at 0.35 Hz with ≈1.2 g, the flyer at 1–5 m is whipped through the window, stalls, hits the snow (which rises behind the skier on a slope) and is dragged. Launches succeeded reliably only when the skier ran straight (dbg_eq straight test: 3 m in ≈1.5 s, 15 m in ≈7 s) or when the flyer was already at ≥6 m (stable in carving in the steady test). Recommendation: launch only on a straight glide (push-off phase or a traverse; gate on low lateral acceleration for ≥1 s), pay out ≤2 m/s until 6 m, and abort to dock on the first stall. Launch-gate refusal adds ≈' + v3['G-A3-air'].refusedSMean + ' s of riding without footage per run.',
    },
    {
      id: 'H7', claim: 'On a detected stop the system retrieves and docks the flyer on the back within 10 s with ≤1.5 m/s relative speed.',
      method: 'exp3: retrieve at 5 m/s (1.5 m/s below 3 m, 0.6 m/s below 1 m), flyer depowered to a 6 N retrieval tension with spoilers; dock = within 0.25 m of the cradle. Variant "predock": user gesture 6 s before the planned stop → retrieve while still riding.',
      numbers: Object.fromEntries(['G-A3-air', 'G-A3-air-predock', 'K-A3-air', 'K-A3-air-predock', 'G-A3-oracle', 'K-A3-oracle'].map((k) => [k, pick(v3[k], ['docks', 'dockVrelP50', 'dockVrelP90', 'dockUnder1_5Share', 'retrieveP50', 'retrieveP90', 'dockFails'])])),
      verdict: 'FALSIFIED for the glider, borderline for the kite. Retrieval time is fine (p90 3.5–15 s), but the glider arrives at the cradle at ' + v3['G-A3-air'].dockVrelP50 + ' m/s p50 (≈2 J relative KE, ≥1.5 m/s in most docks): after the skier stops there is no apparent wind, the only airspeed is the reel speed, and a 12 N/m² wing cannot fly slower than ≈4.6 m/s. Docking while still riding (predock) lowers it to ' + v3['G-A3-air-predock'].dockVrelP50 + ' m/s p50. The low-wing-loading kite docks at ' + v3['K-A3-air'].dockVrelP50 + ' m/s p50 (' + v3['K-A3-air'].dockUnder1_5Share + ' of docks <1.5 m/s). Conclusion: a back dock needs a light, low-wing-loading flyer and a compliant capture funnel; for a glider, land beside the skier instead.',
    },
    {
      id: 'H8', claim: 'On a skier fall, holding the line and letting the flyer land (flag-out) is safer than reeling it in to the back.',
      method: 'exp4: falls at 18/27 s into a ride (6 wind cases × 2), flyer at 12 m, fall detected by the IMU detector (p90 0.62 s); abort=reel vs abort=hold, glider and kite.',
      numbers: e4.fall.agg,
      verdict: 'NOT SUPPORTED — neither policy is safe in the model. The fallen skier keeps sliding; the line drags the flyer down toward the body in both policies (flyer within 0.5 m of the helmet at >3 m/s relative speed in ' + e4.fall.agg['glider-reel'].hitShare + ' (glider) and ' + e4.fall.agg['kite-reel'].hitShare + '–' + e4.fall.agg['kite-hold'].hitShare + ' (kite) of falls; line tension after the fall p90 ≈48–55 N on a person who is down). Reel-in reaches a safe state faster (glider p50 ' + e4.fall.agg['glider-reel'].timeToSafeP50 + ' s vs ' + e4.fall.agg['glider-hold'].timeToSafeP50 + ' s). Needed: a tension-limited breakaway/weak link at the pack (release ≈15–20 N, ASSUMED), line cutter, and a flyer that is harmless on contact (KE and soft structure), not a smarter abort law.',
    },
    {
      id: 'H9', claim: 'The flyer is always stowed before the skier reaches the chair-loading point.',
      method: 'exp4 gentle lift approach (snow-plough 0.8–2 m/s², no hockey stop) → stop detection when ≤1.5 m/s; stowed time = detection + retrieve/dock time from exp3.',
      numbers: pick(e4.lift, ['detLatencyFrom1_5P90', 'retrieveTimes', 'stowedAfter1_5P90', 'stowedAfter1_5P90_kite']),
      verdict: 'SUPPORTED ON TIME, NOT ON SAFETY. Stowed ≈' + e4.lift.stowedAfter1_5P90 + ' s (glider) / ' + e4.lift.stowedAfter1_5P90_kite + ' s (kite) p90 after slowing to 1.5 m/s, inside an ASSUMED 10–20 s corral budget — but those docks are the fast, uncontrolled ones of H7, among other people in the lift queue. Required interlocks: OSM aerialway geofence (bottom stations, retrieve when <80 m and decelerating), dock-latch sensor, haptic/acoustic alarm if not latched when ascent is detected, and no launch until the post-lift lockout clears.',
    },
    {
      id: 'H10', claim: 'Because the window zenith tilts forward with the slope, the line rises steeply from the pack and the clothesline hazard to crossing skiers disappears beyond ≈2 m.',
      method: 'exp3 line profile (chord + sag) during riding: share of time the line or flyer is <1.9 m above snow at 1–8 m horizontal distance; exp4 share of airborne time with the flyer itself at head height 1.5–15 m from the skier.',
      numbers: { lineLowShareGlider: v3['G-A3-air'].lineLowShare, lineLowShareKite: v3['K-A3-air'].lineLowShare, lineLowShareKiteOracle: v3['K-A3-oracle'].lineLowShare, flyerAtHeadHeight: e4.people.agg, minLineToHelmetP10: { G_A3_air: v3['G-A3-air'].minHeadLineP10, K_A3_air: v3['K-A3-air'].minHeadLineP10 } },
      verdict: 'NOT SUPPORTED in closed loop. The geometry argument holds in steady flight (equilibrium at 60–70° window elevation ⇒ line >1.9 m beyond ≈1 m), but the simulated flights spend much time low: the flyer itself is at head height 1.5–15 m from the skier for ' + e4.people.agg.glider.flyerAtHeadHeightNearShareOfAirborne + ' (glider) / ' + e4.people.agg.kite.flyerAtHeadHeightNearShareOfAirborne + ' (kite) of airborne time, and the line or flyer is below 1.9 m at 3 m behind the skier for ' + v3['G-A3-air'].lineLowShare[3] + ' (glider) / ' + v3['K-A3-air'].lineLowShare[3] + ' (kite) of airborne riding time (median run), and the line passes within ≈0.01–0.08 m (p10 over runs) of the helmet centre (headClear ≥1.0 m fails). Third-party safety therefore depends entirely on solving H6 (short-line phase) and H11.',
    },
    {
      id: 'H11', claim: 'The flyer\'s kinetic energy stays below 14.9 J (FAA Cat 2 line used by the project).',
      method: 'exp3 KE (ground frame beyond 1.5 m from the rider, rider frame within).',
      numbers: { floorAtSkierSpeed: { glider150g_at13_5ms: +(0.5 * 0.15 * 13.5 * 13.5).toFixed(1), kite100g_at13_5ms: +(0.5 * 0.10 * 13.5 * 13.5).toFixed(1), maxMassFor14_9J_at13_5ms_g: Math.round((2 * 14.9 / (13.5 * 13.5)) * 1000), maxMassIfFlyerSwingsAt2xSkierSpeed_g: Math.round((2 * 14.9 / (27 * 27)) * 1000) }, ...Object.fromEntries(['G-A3-air', 'G-A3-oracle', 'K-A3-air', 'K-A3-oracle'].map((k) => [k, pick(v3[k], ['keMaxP50', 'keMaxP90', 'keMaxMax', 'keOver14_9Share'])])) },
      verdict: 'FALSIFIED. A tethered flyer moves with the skier, so its ground-frame KE has a floor of ½·m·v_skier² (glider 150 g: 13.7 J at 13.5 m/s); the swings and crosswind dives of a tethered wing roughly double its speed (median peak KE ' + v3['K-A3-oracle'].keMaxP50 + ' J even for the 100 g kite with oracle states). To hold 14.9 J with 2× swing speed the flyer must weigh ≈40 g — or the 14.9 J rule must be argued in the rider frame (it cannot when the flyer is >1.5 m away).',
    },
  ],
  physicsFindings: [
    'Line-referenced AoA: AoA = pitch-vs-line − asin(u·n). A bridled/tow-hooked wing at window elevation ε sits at AoA ≈ aB + (90° − ε): falling 20° lower in the window adds 20° of AoA → stall/power zone. Elevation control = drag (spoilers/depower) at fixed AoA.',
    'High-L/D (≈11) glider: natural equilibrium ε ≈ 85–88° (near the zenith) where weight and small drag make it overfly and go slack; flying at 60–70° needs L/D_eff ≈2 (spoilers out) — i.e. the glider is flown as a draggy kite.',
    'On a slope the apparent wind is parallel to the slope, so the window zenith tilts forward by the slope angle and gravity has an along-wind component (W·sin θ) that pushes the flyer toward overflight; the snow surface rises behind the skier, so a flyer that falls back in the window hits the snow (uphill).',
    'Lift points along the line ⇒ lateral position is neutrally stable at best; roll steering with bank > lateral angle (K_φ≈1.8) plus rate damping scaled by m·L/Lift is required.',
    'The window must be defined on the mean course (τ≈2.5 s), not the instantaneous skier velocity, which swings ±45° every 1.45 s.',
    'Short line (<5 m) + carving ⇒ the pack\'s ±4 m lateral oscillation whips the flyer; ≥6 m the line low-passes it (stable in the steady carving test at 6 and 12 m).',
    'Snatch loads: slack→taut with a Dyneema line produced 40–55 N; a 150 N/m series shock spring at the fairlead bounds them — required for body force ≤40 N.',
    'Estimator observability: aero force ∥ line ⇒ rotation of va about the line is unobservable instantaneously; turns provide observability; force-scale errors map into wind direction errors.',
  ],
  sensorsActuators: { specs: SPECS, airdata: AIRDATA, flyers: FLYERS, line: LINE, reel: REEL, motors: MOTORS, controllerConstants: CTRL },
  recommendedArchitecture: {
    summary: 'Do not pursue "tension-only" autonomy. If the active-tether direction continues, it needs: a light (≤60–100 g), low-wing-loading kite-like flyer with roll steering, a ≥90° line-referenced pitch range (flag-out) and depower; flyer air data (pitot + AoA vane + IMU) and a radio link; a pack reel with fairlead shock spring; launch only on straight glides; dock only while still moving (or land beside); hard safety elements (weak link, line cutter) rather than abort logic.',
    pack: ['ICM-42688-class IMU + MAX-M10S GNSS (10 Hz) + BMP390; detector as lib/detect.mjs (speed 2.8 m/s, descent, vibration, from-rest, post-lift lockout 30 m) + session arming + OSM aerialway geofence', 'MN3508-class (or 6S, Ø32 mm drum) reel, FOC current loop ≥1000 rad/s, 500 Hz velocity loop with tension feed-forward; ≥250 W burst ESC', 'HX711 + 5 kg cell on the fairlead pulley, two AS5600 on a gimballed exit arm, 150 N/m series shock spring, level-wind', 'weak link ≈15–20 N at the pack (ASSUMED), line cutter, dock latch sensor'],
    flyer: ['roll actuator (steering), bridle pitch actuator −80…+10° (flag-out), spoilers/depower', 'pitot (SDP3x class) + AoA vane + IMU; 100 Hz ELRS-class link', 'AoA loop (target from force demand, ≥2.5° below stall), spoiler loop on window elevation (target 65°), roll loop to the mean-course window centre'],
    modes: 'STOWED → (ride detected ∧ straight glide ∧ va ≥1.3 V_stall) LAUNCH (≤2 m/s pay-out to 6 m) → FLY (admittance reel law, surplus paid out to 12–15 m) → RETRIEVE on stop gesture / decel / geofence / low lift → DOCK while moving or LAND beside → STOWED; ABORT on fall = weak link + flag-out.',
  },
  failureModes: [
    { mode: 'flyer whipped/stalled at short line during carving, hits snow', seen: 'all exp3 variants', mitigation: 'launch on straight glide only, fast but ≤2 m/s pay-out to ≥6 m, abort-to-dock on first stall' },
    { mode: 'power-zone trap (AoA 40–90°) behind the skier, dragged on snow, tension >100 N', seen: 'A1/A2, tether-only estimates', mitigation: 'flag-out pitch range, weak link, payout limit at Lmax' },
    { mode: 'lateral divergence to window edge, AoA collapse', seen: 'A1 straight test', mitigation: 'roll loop K_φ>1' },
    { mode: 'overflight/slack near the tilted zenith', seen: 'glider without spoilers', mitigation: 'spoiler elevation loop, force target > weight' },
    { mode: 'tether-only wind estimate diverges (unobservable axis + calibration)', seen: 'exp2', mitigation: 'flyer air data; never gate safety on tether-only wind' },
    { mode: 'KE >14.9 J from skier speed + swings', seen: 'all variants', mitigation: '≤40–60 g flyer or soft/frangible structure; rider-frame argument not available >1.5 m' },
    { mode: 'fast dock (≥4 m/s) after a stop in calm', seen: 'glider docks', mitigation: 'dock while moving; land beside; compliant funnel' },
    { mode: 'fall: flyer dragged onto the fallen skier, 50 N on the line', seen: 'exp4', mitigation: 'weak link + cutter + soft flyer' },
    { mode: 'false launch on unload ramp / in a bus', seen: 'exp1 noLockout / bus', mitigation: 'post-lift lockout, session arm, geofence' },
    { mode: 'line passes within ≈0.01–0.08 m of the helmet centre (headClear fail)', seen: 'exp3 minHeadLine', mitigation: 'exit point above/behind helmet on a short mast, or tail-mounted exit; needs geometry study' },
  ],
  limitations: [
    'Point-mass flyer; no rotational dynamics, no wake of the skier, crude stall/flat-plate blend; roll disturbance is an ASSUMED stochastic process.',
    'Controllers are first-iteration designs by one scientist in one session; poor closed-loop numbers are an upper bound on difficulty only where backed by the physics findings above; better controllers may do better (the oracle variants bound how much estimation alone explains).',
    'Activity traces for detection are synthetic; no measured ski IMU data used.',
    'Snow contact is Coulomb friction μ=0.3 (ASSUMED); avalanche of snow contacts may be pessimistic or optimistic.',
    'No camera-based estimation simulated (argued: a flyer camera bearing inherits the 3° flyer attitude error ⇒ no better than the exit angle at 12–15 m).',
  ],
  sources: {
    imu: SPECS.imu.src, loadCell: SPECS.loadCell.src, encoder: SPECS.lineAngle.src, gnss: SPECS.gnss.src, baro: SPECS.baro.src, motor: SPECS.motor.src, radio: SPECS.radio.src, pitot: AIRDATA.src,
    liftSpeeds: 'https://en.wikipedia.org/wiki/Chairlift ; https://en.wikipedia.org/wiki/Surface_lift ; https://en.wikipedia.org/wiki/Gondola_lift', aerialwayGeofence: 'https://wiki.openstreetmap.org/wiki/Key:aerialway',
    flatPlate: 'Hoerner, Fluid-Dynamic Drag (1965) — flat plate CD≈1.9–2.0 normal to flow (class value)',
  },
};
writeFileSync(new URL('./report.json', import.meta.url), JSON.stringify(report, null, 1));
console.log('report.json written', Object.keys(report).length, 'sections');
