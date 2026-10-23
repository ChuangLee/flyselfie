#!/usr/bin/env python3
"""Builds report.json from calc_out.json + the engineering narrative (hardware role, SIM-032)."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(H, 'calc_out.json')))
B = C['budget']; R = C['reel']; BAT = C['battery']; S = C['structures']; HC = C['headClearance']

SRC = {
 'line': 'https://www.cabelas.com/shop/en/powerpro-3000-yard-spectra-braid-65-lb-4409341 (50 lb = 0.36 mm) ; https://www.basspro.com/shop/en/powerpro-braided-spectra-fiber-microfilament-line-150-yards',
 'dyneema': 'https://www.dyneema.com/pt-pt/applications/ropes-lines-slings-chains/paragliding-lines ; https://shop.marlowropes.com/content/files/datasheets/defence/datasheets%20with%20iso%2014001/kiteline%202024.pdf ; https://www.teufelberger.com/pub/media/contentmanager/content/downloads/15-08-13_TEUFELBERGER-Kitelines-2015-2016_web.pdf (creep)',
 'motor': 'https://www.getfpv.com/tiger-motor-mn3110-17-700kv.html ; https://www.ligpower.com/product/mn3110-kv700-motor-navigator-type.html (700 Kv, 92 mΩ, 80 g bare / 99 g with leads, 21 A/180 s)',
 'moteus': 'https://github.com/mjbots/moteus (r4.11: 10–44 V, 100 A peak phase, 14.2 g; c1: 10–51 V, 20 A peak, 100 W, 8.9 g) ; https://hackaday.io/project/179234-moteus-brushless-controller',
 'odrive': 'https://odriverobotics.com/shop/odrive-micro (3.5 A cont / 7 A peak — too small for the reel)',
 'cell': 'https://18650batterystore.com/products/molicel-p28a (2800 mAh, 35 A, ≈46 g) ; https://www.imrbatteries.com/content/molicel_p45b.pdf (Moli low-T table: P45B ≥3.85 Ah @0 °C, ≥3.60 Ah @−20 °C at 4.5 A)',
 'cold_charge': 'https://www.redarcelectronics.com/us/resources/chargers-isolators-faqs/do-not-charge-lithium-battery-below-32-degrees/',
 'loadcell': 'https://be.farnell.com/sensor-solutions-te-connectivity/fx29k0-100a-0010-l/load-cell-sensor-10lb-5-5v/dp/3290105 (FX29 10 lbf, rated 0…50 °C only)',
 'adc': 'https://www.ti.com/product/ADS1220 (24-bit bridge ADC, PGA ×128, −40…125 °C)',
 'encoder': 'https://www.infineon.com/assets/row/public/documents/24/49/infineon-as5600-datasheet-en.pdf (AS5600 12-bit on-axis magnetic angle; −40…125 °C)',
 'gearmotor': 'https://pololu.com/product/3046/specs (1000:1 HPCB 12 V: 10 kg·cm stall, 35 rpm, 10.5 g)',
 'magnet': 'https://www.kjmagnetics.com/dx84-n52-neodymium-disc-magnet ; https://kjmagnetics.com/d82-n52-neodymium-disc-magnet (pull-force tables, contact case)',
 'burnwire': 'https://www.nrl.navy.mil/Media/News/Article/2554563/nrl-invents-cubesat-release-mechanism-to-deploy-solar-panels-tethers/ (≈1.6 A for 5–10 s — too slow for an emergency cut)',
 'fotokite': 'https://dblp.uni-trier.de/pid/31/5374.html (Lupashin & D\'Andrea, IROS 2013, taut-tether inertial sensing) ; https://robohub.org/robots-fotokite-phi (tether direction from tension = position)',
 'camera_components': 'sim/js/concepts/common/components.js (cam4kNoGimbal 27 g/2.7 W, avionics 10 g/1 W, BATTERY 150 Wh/kg, cold 0.75, reserve 0.15)',
 'sail': 'Porcher Skytex 27 (27 g/m²) as used in dev/kite2/design_notes.json',
 'audit4': 'research/concepts_2026_10_19/audit4/findings.json (A4-K2-01 boom, A4-K2-07 reel C-rate, A4-TG-04/05/06 wand/holster, A4-TG-09 trip)',
}

report = {
 'role': 'hardware / mechanical engineer', 'task': 'SIM-032 active-tether follow-cam', 'date': '2026-10-20',
 'evidence': ('Closed-form hand calculations (calc_hardware.py → calc_out.json) with catalogue numbers (sources below) and '
              'coefficients marked ASSUMED. Nothing designed in CAD, built, bench-tested or flown. Not physical verification; '
              'M-070 not_run, G-MATURE closed. No purchasing; cost classes are order-of-magnitude.'),
 'files': ['research/active_tether_2026_10_20/engineering/calc_hardware.py',
           'research/active_tether_2026_10_20/engineering/calc_out.json',
           'research/active_tether_2026_10_20/engineering/make_report.py'],

 'headline': [
  'Recommended: architecture A+ — reel in a lumbar back unit (hip-pack form) with a hinged 0.55 m "scorpion quiver" that is the dock, the launch rail and the line exit; flyer = 111 g (with 15 % margin) folding "umbrella delta" that is folded passively by being pulled nose-first into the quiver trumpet.',
  'The line-exit position, not the reel, is the design driver: any exit on the upper back/shoulder or on a mast gives ≤0.34 m head clearance (calc: shoulder 0.07–0.34 m, 0.6 m mast 0.25 m). A lumbar exit 0.55 m behind the pivot gives ≥1.0 m up to 55° line elevation; 0.65 m gives it up to 65°.',
  'High L/D makes the line steep (70–80° with an un-braked delta/glider) — this solves the clothesline (line ≥1.85 m above snow 1 m behind at 45°) but breaks head clearance above ≈55°, so the flyer needs an elevation (drag/AoA) control, not more L/D. Target band 40–55°.',
  'B (reel on flyer) fails on kinetic energy: +72 g of reel/driver/cell → ≈0.20 kg flyer → 12.2 m/s KE cap, below normal rider speed. C (spring) cannot store a full retract (25 m × 2 N ≈ 50 J ≈ 150–400 g of spring steel); keep it only as a short-stroke dancer for slack take-up.',
  'Reel: T-Motor MN3110 700 Kv + 2:1 GT2 belt + 4 mm-wide "yo-yo" drum (r 15→22 mm, no level-wind) on a 4S1P Molicel P28A pack: all operating points feasible at −10 °C with ≤5.7 C peak (vs kite2 15.8 C). Hold/limit by ratchet + slip clutch at 35 N, not by the motor.',
  'Every slender part sized by hand calc: quiver 56×0.6 mm carbon σ 11.5 MPa at 35 N lateral; delta LE spars 5×4 mm σ 97 MPa/7 mm sag (3×2 mm would be 331 MPa/42 mm — the "3 mm boom" trap, rejected); struts 3–4 mm SF 7.6–21 in Euler; kite2 3 mm boom reproduced (3353 mm tip deflection, 933 MPa) for contrast.',
 ],

 'requirements_used': {
  'tensionCapOp_N': 25, 'clutchLimit_N': 35, 'bodyForceRule_N': 40, 'lineLength_m': 25, 'reelInSpeed_ms': '≤6 (retract), ≤3 m/s at 15 N (pumping), 5 m/s at 20 N (tailwind bursts)',
  'payoutSpeed_ms': '≤9 m/s at full drum (above that BEMF > cold bus voltage → uncontrolled diode regen)',
  'KE_J': 14.9, 'packVol_L': 3.0, 'addedMass_kg': 1.5, 'headClear_m': 1.0, 'endurance_min_at_-10C': 45,
 },

 'architecture_comparison': {
  'A_backReel': {
   'summary': 'Motor, drum, sensors, battery and dock on the body; only the wing + camera fly.',
   'flyerKg': B['flyerWithMarginG'] / 1000, 'keSpeedCap_ms': round((2 * 14.9 / (B['flyerWithMarginG'] / 1000)) ** 0.5, 2),
   'pros': ['flyer mass minimal → KE headroom', 'big motor/battery allowed (worn mass rule 1.5 kg)', 'battery kept warm by the body',
            'line angle + tension measured at the anchor (Fotokite-style state estimation)', 'retract works even if the flyer electronics die'],
   'cons': ['line always runs from the body → exit geometry vs head/clothesline', 'dock must be on the body and survive falls/chairlift'],
   'verdict': 'recommended (with a short-stroke dancer from C)'},
  'B_reelOnFlyer': {
   'summary': 'Drum and motor on the flyer, line anchored at the body.',
   'calc': C['archB_reelOnFlyer'],
   'cons': ['KE cap 12.2 m/s < rider speed', 'reel-in work (T·v up to 100 W) drawn from a flyer cell in the cold', 'line still anchored to the body → same head/clothesline geometry, no gain',
            'spinning drum + line spooling on a 100 g camera platform → jitter'],
   'verdict': 'rejected (KE)'},
  'C_hybrid_springBack': {
   'summary': 'Small fast motor reel + passive constant-force spring.',
   'calc': 'full-retract spring energy ≈ 2 N × 25 m = 50 J; spring steel σ²/2E ≈ 0.7 J/g ideal, 0.1–0.3 J/g practical → 170–500 g (ASSUMED practical factor)',
   'useful_part': 'a 0.3 m dancer arm (doubles to 0.6 m line accumulator) with a 1–2 N spring: sub-10 ms slack take-up at stops/heave and a passive tension floor when the motor driver trips; +15–20 g',
   'verdict': 'only as a dancer inside A'},
 },

 'line': {
  'choice': '8-carrier UHMWPE (Dyneema/Spectra) braid 0.36 mm, 50 lb class (≈222 N), PU-coated, hi-vis; 25 m on the drum (first 0.5 m at the flyer: 0.6 mm sleeve for abrasion at the nose probe)',
  'checks': C['line'],
  'drag': 'cross-flow drag of 15 m at 15 m/s ≈ 0.5·1.0·225·0.36e-3·15·1.1 = 0.67 N (≈half acts at the flyer) — 7 % of a 10 N flight tension; 0.6 mm conductive line would be 1.1 N',
  'cold_UV_abrasion': 'UHMWPE keeps strength in cold (no glass transition in the ski range) and is UV-resistant per Dyneema/Marlow; creep negligible at ≤25 N on a 222 N line; abrasion: SiC/ceramic guides only, never aluminium (ASSUMED good practice). Ice: braid absorbs water and can freeze to the drum → PU coating + wipe at the mouth.',
  'conductive_tether': 'NOT recommended for baseline: a 4–10 k rpm drum needs a slip ring (capsule rings are rated a few hundred rpm — ASSUMED typical) or an inductive rotary transformer; conductor fatigue on a 30 mm drum; 3.6× line weight. Alternative used: 1S 450 mAh flyer cell topped up through dock pogo contacts on every lift ride (cell warmed to >5 °C before charge).',
  'cut_hazard': 'a 0.36 mm line under 10–25 N is a laceration hazard for third parties; line height ≥1.8 m 1 m behind at ε≥45° reduces but does not remove it (resort permission gate as round 4).',
  'sources': [SRC['line'], SRC['dyneema']]},

 'reel': {
  'motor': {'part': 'T-Motor MN3110-17 700 Kv (12N14P, 92 mΩ, 80 g bare, 21 A/180 s, 466 W)', 'Kt_NmPerA': round(60 / (2 * 3.14159 * 700), 4), 'source': SRC['motor'],
            'why': 'low-Kv 37 mm outrunner: enough torque for 25 N hold at 2:1 with ≤22 A, and 6 m/s on a 15 mm drum radius at 12.4 V cold bus; backdrivable (good for tension control, no gearbox stiction)'},
  'transmission': '2:1 GT2 6 mm belt (20T/40T), effective belt tension 60 N at the 35 N clutch limit (Gates allowable working tension ASSUMED ≥100 N)',
  'drum': R['drum'] | {'type': '"yo-yo" narrow drum, 4 mm gap — no level-wind (the line self-stacks; effective radius tracked from the metering wheel). Solid 6061 hub; hub pressure ' + str(R['hubCrush']['windOnTension_15N']['hubPressure_MPa']) + ' MPa at 15 N wind-on (spool-burst mode for braid: wind on at ≤5 N → 18 MPa).'},
  'operatingPoints_gear2': R['gearSweep']['2.0']['points'],
  'gearSweepVerdict': {g: v['allFeasible'] for g, v in R['gearSweep'].items()},
  'reflectedMass_kg': R['reflectedMass_kg'],
  'driver': {'part': 'mjbots moteus r4.11 (FOC, encoder, CAN-FD, 10–44 V, 100 A peak phase, 14.2 g)', 'source': SRC['moteus'],
             'rejected': ['ODrive Micro 3.5 A cont (too small)', 'moteus-c1 100 W peak (pumping bursts need 140 W)', 'FPV AM32 ESC (no true torque control at stall)']},
  'brake_clutch_cut': [
   'Mechanical slip clutch (wave-spring friction, line-equivalent 35 N) between drum and pulley: the body-force limit holds with the electronics dead.',
   'Power-off ratchet pawl (spring-engaged, solenoid-released): holds the line when power fails or while docked; reel-in still possible (ratchet direction).',
   'Pay-out braking energy (25 N × 10 m/s × 2 s = 500 J) goes to a 10 W shunt resistor/short-circuit braking unless the pack thermistor reads >5 °C (cold Li-ion must not be charged — components.js chargeBelow0C=false). Dumped in the windings it is +14 K on the motor.',
   'Emergency cut: spring-loaded ceramic guillotine at the drum exit released by a micro solenoid latch (<50 ms, ASSUMED); manual pull-handle on the shoulder strap; weak link 60–80 N at the drum anchor. Nichrome burn-wire rejected as the primary cut (1.6 A for 5–10 s in NRL practice — too slow).',
   'KE governor: reel-in speed limited in software to keep |v_rider + v_reel·ê| ≤ √(2·14.9/m) − 1 m/s; at 12 m/s rider and ε 45° that is ≤4.6 m/s.'],
  'sensing': {
   'tension': 'custom aluminium flexure under the middle roller of a 3-roller metering head (full strain bridge) read by a TI ADS1220 (−40…125 °C) + motor current as a cross-check. TE FX29 rejected: rated 0…50 °C only.',
   'length': 'idler wheel Ø20 mm with AS5600 magnetic encoder (independent of yo-yo radius); drum encoder from the moteus.',
   'lineAngle': '2-axis gimballed exit eyelet at the trumpet with two AS5600 (−40…125 °C); fused with the back-unit IMU → line direction in the world frame (Fotokite-style taut-tether estimation).',
   'sources': [SRC['loadcell'], SRC['adc'], SRC['encoder'], SRC['fotokite']]},
 },

 'battery': BAT | {'choice': '4S1P Molicel P28A (18650, 2.8 Ah, 35 A) in the insulated back unit against the body; 10 W shunt for pay-out; flyer: 1S 450 mAh LiPo (≈11 g) charged in the dock only above +5 °C cell temperature',
                   'sources': [SRC['cell'], SRC['cold_charge'], SRC['camera_components']]},

 'dock_launch_capture': {
  'concept': '"Scorpion quiver": a 56 mm × 0.47 m carbon tube + 0.08 m trumpet, hinged at the right lumbar pivot with a hollow hinge pin that carries the line along the hinge axis (deploy rotation does not change line length).',
  'skiing_stowed': 'stowed diagonally across the back (right hip → left shoulder blade, ≈35° from vertical) in a shallow channel of a slim back plate; outer thickness ≈65 mm (like a 10–15 L ski pack). The flyer\'s tail carries a disc that plugs the mouth (snow/ice seal).',
  'chairlift': 'mechanical lockout pin + software lockout (barometric/GNSS ascent at lift speed, seated posture from IMU, lift-line geofence). Launching on a lift = line into the haul rope → catastrophic; this lockout is safety-critical and must be two-channel. Sitting against the backrest with a 65 mm plate is ASSUMED acceptable (user test needed).',
  'deploy': 'fold drive (Pololu 1000:1 HPCB + 3:1 spur, stall 2.9 N·m, need 1.4 N·m) swings the quiver to the flight position (pointing rearward, −10° pitch) in ≈1.3 s; detent with breakaway (≤60 N at the tip in any direction except along the line).',
  'launch': 'Flyer sits nose-first toward the reel, tail at the mouth → it is already oriented nose-into-the-apparent-wind. Ratchet released, motor pays out at ~1–2 m/s; a 0.15 m spring plunger pushes the tail out of the body wake; the umbrella runner spring opens the wings; tension builds, pay-out speeds up to the target length. Launch gate: estimated apparent wind ≥7.4 m/s (needed for ε 45° and ≥1.5 N measurable tension, calc) — below that, stay docked.',
  'capture': 'Stop/command → KE-governed reel-in, flyer trimmed to high AoA (low elevation, line near the quiver axis); last 2 m at ≤1 m/s with the quiver pitched to the measured line angle; nose probe enters the 120 mm trumpet; the trumpet lip closes the leading edges like an umbrella pulled handle-first through a ring (the reel supplies the ≈5–15 N); nose seats on pogo contacts + 1/2" N52 magnet (detent only); 3–5 N line tension on the ratchet is the primary retention; quiver folds back.',
  'capture_reliability_drivers': C['capture'],
  'notes': ['Position error at the mouth is self-centring because the line passes through the eyelet; the risk is attitude (entry angle vs 45° trumpet half-angle, roll at entry → asymmetric spar contact), icing of mouth/sail, line wrap after a tumble, and body-wake turbulence in the last metre.',
            'Retry = pay out 1–2 m and re-approach (≈3 s). The towglider audit kill test applies: 50 captures at −10 °C, kill if <95 % first-time.'],
 },

 'flyer': {
  'options': {k: {kk: vv for kk, vv in v.items() if kk != 'byVa'} | {'eps_T_at_10_15_20ms': {va: v['byVa'][va] for va in ('10', '15', '20')}} for k, v in C['flyers'].items()},
  'comparison': {
   'umbrellaDelta': 'L/D 4.5–6 (ASSUMED polar, flexible sail, camera pod); folds passively in the trumpet; tolerant of capture misalignment; spars 5 mm carbon (calc); medium strike hazard; packs into Ø52 × 0.47 m. CHOSEN.',
   'foldGlider': 'L/D ≈10 → lowest launch wind (but elevation then needs even more braking); a rigid wing must be folded by actuators or a cam track during capture; 140 g → KE cap 14.6 m/s; towglider needed 2.8 L just for a holster. Back-up if the delta polar disappoints.',
   'ramAir': 'lightest, safest on impact, packs smallest; but collapses at low apparent wind, cannot re-inflate on the line, camera on a bridle pendulum, and a soft canopy is the hardest thing to re-dock automatically (kite2 needed a snuffer). Rejected for auto-dock; keep for a manual-stow variant.'},
  'elevationControl': {'why': 'un-braked equilibria sit at 70–82° (calc) — top-down framing and head clearance <1 m. Hold 40–55° with tow-point AoA trim (flat-plate branch L/D≈cot α, α 35–50°) or a servo tail drogue.',
                       'requiredExtraCdA_m2': C['elevationControl']},
  'massBudget_g': B['flyerItems'], 'flyerG': B['flyerG'], 'flyerWithMarginG': B['flyerWithMarginG'],
  'power_W': BAT['flyerLoadW'], 'minPerCharge': BAT['flyerMinPerCharge'],
 },

 'structures_handcalcs': S,
 'headClearance_and_clothesline': HC,

 'BOM': [
  # item, part/class, mass g, power W (mean/peak), cost class, source
  ['Reel motor', 'T-Motor MN3110 700 Kv', 85, '6 mean / 140 peak (elec.)', '$$', SRC['motor']],
  ['Belt 2:1, pulleys, bearings, slip clutch, ratchet + solenoid', 'GT2 6 mm, 2× 6800 bearings, wave-spring clutch', 35, '0.3 (solenoid pulses)', '$', 'ASSUMED'],
  ['Yo-yo drum', 'CNC 6061, 4 mm gap, r 15→22 mm', 12, '-', '$', 'calc'],
  ['FOC driver', 'mjbots moteus r4.11', 14.2, 'in motor figure', '$$', SRC['moteus']],
  ['Metering head', '3 rollers, Al flexure bridge, ADS1220, AS5600 idler', 15, '0.05', '$', SRC['adc']],
  ['Line-angle gimbal + trumpet', '2× AS5600, POM/PA12 trumpet 120 mm', 18, '0.05', '$', SRC['encoder']],
  ['Back MCU/IMU/baro/GNSS/radio', 'STM32-class + 9-axis IMU + baro + M10 GNSS + 2.4 GHz', 12, '0.6', '$', 'ASSUMED'],
  ['Battery', '4S1P Molicel P28A + BMS + thermistor', 215, '-', '$', SRC['cell']],
  ['Shunt resistor, cell heater, insulation', '10 W resistor + film heater + foam', 18, '0–1', '$', 'ASSUMED'],
  ['Line cutter', 'spring guillotine + micro solenoid; weak link', 8, 'pulse', '$', 'ASSUMED'],
  ['Line', 'PowerPro 50 lb 0.36 mm × 25 m', 2.8, '-', '$', SRC['line']],
  ['Quiver tube', 'carbon 56 × 0.6 mm × 0.47 m', 76, '-', '$$', 'calc'],
  ['Hinge, breakaway detent, fold drive', 'Pololu 1000:1 HPCB + 3:1 spur, hollow hinge pin', 32, '0.05 mean / 9 peak', '$', SRC['gearmotor']],
  ['Enclosure + hip belt + back plate', 'PA12 / foam / webbing', 150, '-', '$$', 'ASSUMED'],
  ['Flyer total (camera 27, avionics 10, servos 11.5, cell 11, structure ≈29, misc)', 'umbrella delta', B['flyerG'], str(BAT['flyerLoadW']), '$$$ (camera dominates)', SRC['camera_components']],
 ],
 'BOM_totals': {'backUnitG': B['backUnitG'], 'backWithMarginG': B['backWithMarginG'], 'flyerWithMarginG': B['flyerWithMarginG'],
                'wornTotalKg_withMargin': B['wornTotalKg'], 'packVolL': B['packVolL'], 'volumeSplitL': B['volumeL'],
                'enduranceMin_backUnit_at_reelMean6W': BAT['enduranceMin_backUnit'], 'enduranceSensitivity': BAT['reelMeanSensitivity'],
                'costClass': 'prototype BOM order US$400–700 per set excl. tooling (ASSUMED, no quotes requested)'},

 'manufacturability': [
  'All primary parts are off-the-shelf classes: FPV/robotics BLDC + FOC driver, 18650 cells, fishing braid, pultruded carbon rods/tubes, magnetic encoders.',
  'Custom: CNC drum + clutch, injection-moulded or SLS PA12 trumpet/runner/hinges, sewn Skytex sail (kite-industry process), strain flexure (machined + bonded gauges — calibration over −20…+20 °C needed).',
  '56 mm thin-wall carbon tube is a roll-wrapped stock size class (ASSUMED availability); fallback: 1.2 mm PA12/PC tube (≈+60 g).',
  'Sealing/icing: IP54 back unit, line entry through a felt/brush wiper; heated trumpet lip optional (+1–2 W).'],

 'top_risks': [
  {'id': 'R1', 'risk': 'Head clearance vs line elevation: ≥1.0 m only for ε ≤55° with a 0.55 m lumbar exit; overfly at stops/gusts puts the line 0.58 m from the helmet (ε 90°).', 'mitigation': 'elevation control + retract before overfly; 0.65 m exit; line-angle interlock', 'killTest': 'tethered dummy rig: line distance to a helmet target over posture/elevation sweeps; kill if the controller cannot keep ε≤55° in 9 m/s gusts'},
  {'id': 'R2', 'risk': 'Rigid 0.55 m quiver behind the pelvis in a fall / sit-back / tree well: injury and breakage.', 'mitigation': 'breakaway ≤60 N + fold-on-impact (IMU) + foam bumper', 'killTest': 'drop/fall dummy; kill if breakaway force >60 N or tube intrudes into the seat zone'},
  {'id': 'R3', 'risk': 'Auto-capture reliability (entry angle, roll, ice, wrap) — illustrative MC: 60 % first try with a fixed quiver vs 96 % when the quiver aligns to the line; all inputs ASSUMED.', 'mitigation': 'quiver pitch alignment, high-AoA approach, 45° trumpet, tail plug, retry logic', 'killTest': '50 captures at −10 °C on a tow rig; kill if <95 % first time'},
  {'id': 'R4', 'risk': 'Launch out of the body wake at the 7.4 m/s gate; tailwinds where apparent wind <5 m/s cannot launch at all (same physics that killed towglider tail cases).', 'mitigation': 'pay-out plunger, reel pumping bursts (≤140 W), honest launch gate', 'killTest': 'wake survey behind a crouched dummy; launch trials'},
  {'id': 'R5', 'risk': 'Chairlift: inadvertent launch / line snag on lift = catastrophic; stowed comfort against the backrest.', 'mitigation': 'two-channel lockout (mechanical pin + software), stowed flush plate', 'killTest': 'FMEA + user trial (not run)'},
  {'id': 'R6', 'risk': 'Delta polar unknown (L/D 4.5–6 and post-stall elevation control ASSUMED); flexible sail flutter → camera jitter.', 'mitigation': 'wind-tunnel/tow tests; fallback folding glider', 'killTest': 'tow-car polar; kill if ε cannot be held 40–55° with T ≥1.5 N'},
  {'id': 'R7', 'risk': 'Cold electro-mechanics: regen into a cold pack, strain-flexure drift, ice in ratchet/clutch, braid freezing to the drum.', 'mitigation': 'shunt brake, thermistor-gated regen, −20 °C calibration, PU-coated line, wiper', 'killTest': 'climate-chamber reel cycling (not run)'},
  {'id': 'R8', 'risk': 'Third-party line hazard (laceration, clothesline) remains at ε <45° and near lifts/crowds.', 'mitigation': 'ε ≥45° most of the time, hi-vis line, radar proximity retract, resort permission', 'killTest': 'policy gate'},
 ],

 'bold_ideas_considered': [
  'The dock is the launch rail and the line exit (one rigid member, sized properly) — avoids a separate boom.',
  'Passive capture-fold: the reel\'s own pull folds the wing in the trumpet (umbrella pulled handle-first through a ring).',
  'Line routed along the hollow hinge axis so deploy/fold never changes line length.',
  'Body-heated battery in the lumbar unit instead of a heater-charged flyer cell; LTO/lithium-ion-capacitor flyer buffer as a later option for cold charging.',
  'The flyer\'s tail disc is the quiver\'s snow plug.'],

 'handoff_to_others': {
  'science_aero': 'please replace the ASSUMED delta polar (CD0 0.075, k 0.095, CLmax 1.0, post-stall L/D≈cot α) and check whether ε 40–55° can be held with the AoA-trim range; body-wake survey at the quiver mouth.',
  'science_control': 'pay-out speed cap 9 m/s (BEMF), reel-in KE governor formula, tension cap 25 N / clutch 35 N, launch gate 7.4 m/s apparent, two-channel chairlift lockout, retract-before-overfly rule for head clearance.',
  'integrator': 'calc is not simulation-judged; do not count anything here as verification.'},
 'sources': SRC,
}
json.dump(report, open(os.path.join(H, 'report.json'), 'w'), indent=1, ensure_ascii=False)
print('ok', len(json.dumps(report)))
