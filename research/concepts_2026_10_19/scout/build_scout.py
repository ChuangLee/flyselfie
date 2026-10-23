"""Builds sources.json, concepts.json and ranking.json from the calc results.
Run order: calc_descent_glider.py, calc_kills.py, calc_skyhook_kite.py, calc_sequence.py, then this file."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
def L(n): return json.load(open(os.path.join(HERE, f'results_{n}.json')))
DG, KL, SK, SQ = L('descent_glider'), L('kills'), L('skyhook_kite'), L('sequence')
MG = DG['morph_glider_95g']; FX = DG['fixed_wing_95g']; VT = DG['vtol_variant_S2_02']
def kn(value, unit, source, ref): return dict(value=value, unit=unit, source=source, ref=ref)

# ------------------------------------------------------------------ sources
S = [
 ('aerospace/military', 'Switchblade 300: tube-launched loitering munition, spring-loaded wings fold inside the tube and flip out on release', 2020, 'https://en.wikipedia.org/wiki/AeroVironment_Switchblade', '2.5 kg, 49.5 cm, folded-wing tube stow'),
 ('aerospace/military', 'UVision Hero-30: pneumatic canister launch, cruciform wings fold out on launch', 2020, 'https://www.army-technology.com/projects/hero-family-of-loitering-munition-systems/', '~3 kg munition, 5 kg canister, deploy within minutes'),
 ('bio-inspired flight', 'LisHawk: goshawk-inspired synergistic wing+tail morphing; spread for slow high-lift flight, retract for fast efficient flight', 2020, 'https://arxiv.org/pdf/2002.02421', 'Science Robotics 2020; morphing extends speed range and power efficiency'),
 ('bio-inspired perching', 'Stanford SNAG falcon-leg grasper lets a quadcopter perch on branches and catch objects', 2021, 'https://techxplore.com/news/2021-12-stanford-bird-bots-perch.amp', 'perched in Oregon forests; zero-power waiting'),
 ('bio-inspired / soaring', 'TU Delft orographic wind-hovering fixed-wing MAV (AOSOAR, IROS 2023) and ICRA 2023 soaring controller', 2023, 'https://arxiv.org/pdf/2510.23084v1', '0 % throttle hover >30 min (wind tunnel); outdoor no-thrust soaring'),
 ('energy / regenerative soaring', 'Regenerative soaring windprop feasibility (Barnes)', 2006, 'https://saemobilus.sae.org/papers/flight-without-fuel-regenerative-soaring-feasibility-study-2006-01-2422', 'dual-role prop/windmill feasible'),
 ('energy / regenerative soaring', 'DGLR 2022 design challenges of regenerative prop; Pipistrel Velis regen during descent', 2022, 'https://publikationen.dglr.de/publikationen/2022/530100.pdf', 'Velis regen cut net energy ~19 %; windmill efficiency is the weak point'),
 ('energy / regenerative soaring', 'TU Delft (Gossye) regenerative wind-hovering UAV drivetrain', 2022, 'https://repository.tudelft.nl/file/File_58af8e47-8f2e-4b29-b54a-9d4b54e4df68?preview=1', 'test regenerative drivetrain, promising conversion efficiency'),
 ('materials/batteries', 'Amprius SiCore silicon-anode cells shipped to drone makers (450 Wh/kg to AALTO HAPS)', 2025, 'https://www.businesswire.com/news/home/20250722309461/en', '450 Wh/kg cell level'),
 ('materials/batteries', 'Self-heating all-climate Li-ion (embedded Ni foil), Penn State/EC Power (older, still relevant)', 2016, 'https://www.eenewseurope.com/en/self-heating-lithium-ion-battery-combats-freezing-tempatures/', '-20 -> 0 C in 20 s using 3.8 % of capacity'),
 ('materials/insulation', 'Flexible aerogel blankets for battery thermal insulation (Aspen patents/review)', 2023, 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12564297/', '12-25 mW/m/K at 1-2 mm'),
 ('materials/solar', 'Flexible InGaP/GaAs and ultrathin GaAs cells; perovskite 44 W/g (JKU)', 2023, 'https://www.jku.at/en/cdl-vasics/news-events/detail/news/jku-forschung-solarbetriebene-drohnen-ermoeglichen-nachhaltige-luftfahrt/', '~5 W/g GaAs lab, 44 W/g perovskite lab'),
 ('aerospace / HAPS', 'Airbus/AALTO Zephyr 8 stratospheric solar UAV', 2022, 'https://www.army.mil/article/259542/apntspace_cft_concludes_high_altitude_experimentation', '64 days aloft'),
 ('wireless power', 'DARPA POWER optical power beaming record', 2025, 'https://www.theregister.com/2025/05/19/darpa_energy_beaming_record', '>800 W over 8.6 km for 30 s'),
 ('wireless power / safety', 'Direct-beam hazard of large-diameter power beams (NJIT)', 2023, 'https://researchwith.njit.edu/en/publications/direct-beam-hazard-analysis-of-large-beam-diameters-for-laser-pow/', 'skin-safe minimum beam diameter 28 cm at 1050-1400 nm'),
 ('sensing / UWB', 'Smartphone UWB ranging accuracy vs DW3000', 2023, 'https://arxiv.org/pdf/2303.11220', 'RMSE ~15-18 cm'),
 ('sensing / UWB', 'Qorvo DW3110 UWB transceiver', 2022, 'https://www.qorvo.com/products/p/DW3110', '10 cm ranging, +-5 deg AoA (two chips)'),
 ('sensing / event camera', 'Prophesee GenX320 event sensor', 2023, 'https://www.prophesee.ai/event-based-sensor/', '3 mW typical, 36 uW low-power mode, 3x4 mm'),
 ('sensing / SPAD ToF', 'ST VL53L8CX 8x8 multizone ToF', 2023, 'https://www.st.com/en/imaging-and-photonics-solutions/vl53l8cx.html', '4 m range, 60 Hz, 65 deg FoV (terrain/landing sensing)'),
 ('imaging', 'Sony a9 III first full-frame global-shutter camera', 2023, 'https://www.popphoto.com/news/sony-a9-iii-camera-specs-details/', 'no rolling-shutter skew, 1/80000 s'),
 ('imaging', 'Gyroflow open-source gyro-log stabilisation with rolling-shutter correction and horizon lock', 2022, 'https://gyroflow.xyz/', 'gimbal-like results from gyro logs, no gimbal mass'),
 ('imaging', 'RunCam Thumb 2: 4K60 micro action camera with gyro log for Gyroflow', 2024, 'https://oscarliang.com/runcam-thumb-2', '27.8 g (Thumb Pro 16 g)'),
 ('imaging', 'Insta360 GO Ultra', 2025, 'https://www.techradar.com/cameras/action-cameras/insta-360-go-ultra-review', '53 g, 4K60, 1/1.28 in'),
 ('sports broadcasting', 'OBS FPV drones at Milano Cortina 2026 chasing downhill racers', 2026, 'https://www.sportsvideo.org/2026/02/09/how-obs-uses-fpv-drones-360-degree-replay-to-enhance-storytelling/', '243-250 g, up to 140-160 km/h, piloted'),
 ('sports broadcasting', 'Spidercam 3 cable camera', 2023, 'https://www.gravitymedia.com/product/spidercam/', '5 m/s (PRO cut sheet 9 m/s); needs pre-installed cables'),
 ('entertainment', 'Drone light-show records (DAMODA 10,518 drones Vietnam 2025) and RTK swarm positioning', 2025, 'https://insidegnss.com/two-thousand-simultaneous-drones-position-themselves-with-gps-and-glonass-rtk/', 'RTK ~1-2 cm absolute'),
 ('military / recovery', 'Insitu ScanEagle SkyHook: wingtip hook catches a hanging rope, DGPS-guided', 2004, 'https://en.wikipedia.org/wiki/Boeing_Insitu_MQ-27_ScanEagle', 'rope on 15 m pole, shock cord; FLARES quad-held rope concept'),
 ('airborne wind energy', 'SkySails automatic launch/landing mast; Kitemill KM1 autonomous landing (EU project 2024-25)', 2025, 'https://cordis.europa.eu/project/id/101189207/reporting/es', 'autonomous kite landing tested under VLOS'),
 ('guided airdrop', 'Small guided parafoil with bleed-air spoilers (Georgia Tech)', 2015, 'https://www.camm.gatech.edu/images/8/8e/Scheuermann_2015_LateralLongitudinalControl.pdf', 'median miss ~13 m'),
 ('aerospace / inflatable', 'UKY/ILC Dover inflatable-rigidizable UAV wings (BIG BLUE)', 2004, 'https://scholars.uky.edu/en/publications/flying-on-air-uav-flight-testing-with-inflatable-wing-technology/', 'stow in fuselage, UV-rigidize <10 min'),
 ('aerospace / deployables', 'Bistable ultrathin CFRP CubeSat booms (Illinois/NASA LaRC); NASA rollable booms', 2024, 'https://arxiv.org/pdf/2408.08491', '~16-16.5 g/m, 1.22 m boom coils to ~70 mm'),
 ('medical', 'PillCam SB3 capsule camera', 2020, 'https://www.medtronic.com/covidien/en-nz/products/capsule-endoscopy/pillcam-sb-3-system.html', '3.0 g, 2-6 fps, >=8 h'),
 ('toys/entertainment', 'AER throwable foam GoPro glider (Kickstarter)', 2016, 'https://newatlas.com/aer-throw-gopro/45737/', 'passive, no guidance; ~EUR 119k raised'),
 ('entertainment robotics', 'Disney Stuntronics autonomous flipping stunt figure', 2018, 'https://www.slashfilm.com/disney-stunt-robots', 'pose control through ballistic flight (older)'),
 ('robotics', 'Ski Robot Challenge, Hoengseong (humanoid ski robots)', 2018, 'https://spectrum.ieee.org/ski-robot-challenge', '80 m slalom, most robots fell'),
 ('military nano-UAS', 'Teledyne FLIR Black Hornet 4', 2023, 'https://www.thedefensepost.com/2023/10/11/teledyne-advanced-black-hornet-drone/', '70 g, 10 m/s, 25 kn wind, >30 min'),
 ('bio-inspired flight', 'SUTD samara monocopters (SAM, foldable F-SAM)', 2025, 'https://www.sutd.edu.sg/technical-release-listing/small-but-mighty-a-biomimetic-idea-takes-flight/', '32 g hovers 26 min; 60-69 g variants'),
 ('soft robotics', 'Flying HASEL electrostatic gripper', 2022, 'https://arxiv.org/pdf/2205.13011', 'high power density, light actuation'),
 ('soft robotics', 'Untethered electroadhesive perching of a micro quadrotor (lightweight HV generator)', 2020, 'https://superlab.stanford.edu/publication/2020-06-10-HV-Untethered-Perching_Park/index.html', '>1 kV needed; onboard HV generator'),
 ('space robotics', 'Ingenuity Mars helicopter final flight', 2024, 'https://nasaspaceflight.com/2024/01/ingenuity-final-flight', '72 flights, 1.8 kg, ended by landing blade strike on featureless sand (nav lesson for featureless snow)'),
 ('sailing', 'SailGP F50 wingsail with camber/twist flap control', 2023, 'https://eprints.soton.ac.uk/469573/1/CSYS_Paper_Tomlinson_Turnock_Prince.pdf', 'push-button camber/twist; morphing lifting surface on demand'),
 ('consumer drones (baseline)', 'HoverAir X1 PRO/PROMAX Thermo battery', 2025, 'https://hoverair.com/blogs/tech/cold-weather-power-system', '16 min spec (2 m/s, no wind), to -20 C; 64 g battery'),
 ('regulation', 'EU 2019/947 open category: VLOS except follow-me mode; follow-me up to 50 m from pilot and 50 m height in A1', 2019, 'https://gesetze.legal/eu/vo_eu_2019_947/anhang', 'follow-me <=50 m'),
 ('regulation', 'EU C0 class: <250 g, <=19 m/s', 2024, 'https://uas-betrieb.bund.de/homepage/en/information/categorizing-drone-operations/c-classified-drones', '19 m/s cap'),
 ('sport science', 'Stepan et al. skier/snowboarder speeds at US areas (JSAMS Plus)', 2023, 'https://doaj.org/article/2b935686ece744eca0efec1d27afabe2', 'mean 34.9+-13.6 km/h; advanced 44.5+-11.7'),
 ('novelty check', 'Fixed-wing UAV tracking unpredictable ground targets (Quintero & Hespanha), flight-tested', 2020, 'https://www.icb.ucsb.edu/publications/2020', 'research only; no skier/consumer product found'),
 ('novelty check', 'ArduPlane follow mode via scripting (forum, 2025)', 2025, 'https://discuss.ardupilot.org/t/setup-plane-follow-in-arduplane/141794', 'experimental; Copter has native follow'),
]
sources = [dict(id=f'SRC-{i+1:02d}', field=f, what=w, year=y, url=u, key_number=k) for i, (f, w, y, u, k) in enumerate(S)]

# ------------------------------------------------------------------ concepts
adv, inter = MG['day_advanced'], MG['day_intermediate']
row12 = next(x for x in MG['speed_table'] if x['V'] == 12)
row16 = next(x for x in MG['speed_table'] if x['V'] == 16)
jit = DG['jitter']

C = []
C.append(dict(
 id='S2-01', name_en='Descent Glider: gravity-powered morphing micro-glider follow-cam', name_zh='随降滑翔机：靠重力飞行的变形微型滑翔跟拍机',
 lens='scout/cross-industry', one_liner='A 95 g folding-wing glider that descends the same vertical drop as the skier, so gravity pays for the flight; it windmills surplus energy into its cell on steep pitches, orbits you at stops and belly-lands in the snow beside you.',
 principle=('A follow-cam that descends with the skier receives m*g*V*sin(slope) of free power (3.9 W for 95 g at 12 m/s on 20 deg). A light wing needs only D*V. '
            'With bird-style sweep morphing (spread for slow, swept for fast), the glide angle stays below typical piste slopes from 6 to 16 m/s, '
            'so the propeller is mostly a generator. Camera power, not flight, dominates the energy budget.'),
 architecture=dict(carrier=f"{int(DG['mass_kg']*1000)} g EPP/carbon flying wing, span 0.62 m spread / 0.40 m swept (servo sweep), torsion-spring folding wings (loitering-munition style), folding prop on 1S motor that doubles as generator",
                   support='wing lift; energy from descent (gravity) + 4 Wh Si-anode cell (aerogel-wrapped, self-heating)',
                   energy=f"day net {adv['net_Wh']} Wh (advanced) / {inter['net_Wh']} Wh (intermediate) incl. camera; propulsion only {adv['motor_Wh']} Wh, regen {adv['regen_Wh']} Wh",
                   sensing='UWB tag on the skier (DW3000 class, 10 cm / +-5 deg) fused with on-board vision + IMU/GNSS; 8x8 ToF for snow-landing flare',
                   imaging='4K60 gyro-logging micro camera (no gimbal); Gyroflow-style stabilisation + subject-locked reframing in post; 55 deg output crop',
                   use_flow='draw from shoulder quiver while skiing >=7 m/s and release -> follow 6-10 m behind/3-4 m above -> orbit at stops -> belly-land 3-5 m downhill-side at end -> pick up, slide into quiver'),
 viewpoints=[dict(azimuth='rear / rear-quarter (selectable +-45 deg)', elevation_deg='15-30', distance_m='6-10', notes='lags when skier >17.7 m/s (KE cap), catches up when he slows'),
             dict(azimuth='orbit at stops', elevation_deg='~20', distance_m=MG['loiter_orbit']['radius_m'], notes='2.4 W orbit, standing-skier establishing shot')],
 key_numbers=dict(
   mass=kn(DG['mass_kg'], 'kg', 'calc', 'mass budget in calc_descent_glider.py MASS_BUDGET_G (ASSUMED parts)'),
   KE_cap_speed=kn(DG['KE']['vmax_for_14_9J'], 'm/s', 'calc', 'glider never exceeds 14.9 J ground-frame; EU C0 cap is 19 m/s'),
   KE_at_12=kn(DG['KE']['KE_at_12'], 'J', 'calc', ''),
   frac_time_lagging_advanced=kn(adv['frac_skier_faster_than_KE_cap'], 'fraction', 'calc', 'Monte Carlo, Stepan 2023 advanced speeds'),
   max_lag=kn(adv['max_lag_m'], 'm', 'calc', 'extra distance when skier outruns cap'),
   stall_spread_swept=kn([MG['extended']['vstall'], MG['swept']['vstall']], 'm/s', 'calc', 'CLmax 1.0/0.8 ASSUMED'),
   glide_angle_12ms=kn(row12['swept_glide_deg'], 'deg', 'calc', 'swept; CD0 0.055 ASSUMED low-Re'),
   glide_angle_16ms=kn(row16['swept_glide_deg'], 'deg', 'calc', 'piste 16-20 deg (Ettlinger) covers it'),
   propulsion_Wh_day_morph_vs_fixed=kn([adv['motor_Wh'], FX['day_advanced']['motor_Wh']], 'Wh', 'calc', 'morphing cuts propulsion ~5x for advanced skiers'),
   day_net_Wh=kn(adv['net_Wh'], 'Wh', 'calc', '18 runs x 150 s filmed + 1 stop orbit 20 s/run'),
   endurance_4Wh=kn(adv['endurance_min_on_4Wh'], 'min', 'calc', '4 Wh cell, cold factor 0.75, 15 % reserve; PASS >=45'),
   frac_S_turn=kn([adv['frac_S_turn'], inter['frac_S_turn']], 'fraction', 'calc', 'skier slower than 1.25*Vstall incl. tailwind; alternative is climbing (height buffer)'),
   subject_jitter_raw=kn([j['subject_LOS_dps_raw'] for j in jit], 'deg/s', 'calc', 'Dryden gusts, glider rides air; V 10/14 x U20 4/8 m/s; before reframing'),
   background_jitter_after_subject_lock=kn(max(j['background_LOS_dps_after_subject_lock'] for j in jit), 'deg/s', 'calc', 'bg at 60 m'),
   subject_px_8m=kn(DG['footage']['d8m']['subject_px_1080'], 'px', 'calc', '4K over 100 deg, 55 deg crop -> 2112 native px'),
   max_dist_300px=kn(DG['footage']['max_distance_for_300px'], 'm', 'calc', ''),
   touchdown_KE=kn(DG['KE']['touchdown_KE_6ms'], 'J', 'calc', 'belly landing on snow at 6 m/s'),
   pack_volume=kn(DG['stow']['quiver_total_L'], 'L', 'calc', '58 mm x 0.36 m tube + quiver'),
   standstill_per_run=kn(SQ['S2-01']['standstill_s_per_run'], 's', 'calc', 'calc_sequence.py'),
   ops_per_run=kn(SQ['S2-01']['ops_per_run'], '-', 'calc', SQ['S2-01']['note'])),
 scores=dict(
   footage=dict(score=4, why='Real third-person rear/quarter view at 6-10 m (~330-550 px), smooth because the glider follows a low-passed path; S-turn swings when skier is slow; lags above 17.7 m/s.'),
   interference=dict(score=5, why='Nothing on the body but a 1.2 L quiver; no tether, no pull.'),
   convenience=dict(score=3, why='~9 s standstill/run, but 3 ops (launch, pick-up, insert) strict; 51 min/charge.'),
   safety=dict(score=4, why='<=14.9 J by design (6.8 J at 12 m/s), no exposed hover rotors, soft EPP; still a flying object over a piste.'),
   simplicity=dict(score=3, why='One motor, two servos, no gimbal; fixed-wing pursuit guidance and snow landing are the hard software.'),
   originality=dict(score=5, why='No fixed-wing or gravity-powered ski follow-cam found on the market; AER (2016) was a passive thrown glider; round-1 A11 was a 300 g powered wing at 15-25 m with 94 J.'),
   technical_risk=dict(score=3, why='Low-Re polar at 95 g, morph mechanism + folding in one airframe, launch in the skier wake.')),
 bold_hypothesis='On pistes of >=12 deg a <=95 g sweep-morphing glider can follow a skier for a full day on <=1 Wh of propulsion energy, because the descent itself powers the flight.',
 falsification_test='(no experiment run) Measure the swept/spread glide polar of a foam prototype by car-roof tow or slope-soaring logs; replay 10 GNSS-logged real runs through the energy model; if propulsion energy >3 Wh/day or L/D(12 m/s, swept) <4, the hypothesis fails.',
 kill_criteria=['Measured swept-wing L/D at 12 m/s < 4', 'Propulsion energy > 3 Wh per 45 filmed min', 'Wake/hand launch failure > 5 %', 'Snow landing within 5 m of skier < 90 % or damage > 5 %/landing', 'Subject in frame < 80 % on a tree-lined run (turn radius ~10 m)', 'Target resorts prohibit all UAS including <250 g follow-me'],
 sim_plan=dict(what_to_model='3-DOF glider with two-config polar + morph transition, energy state (battery, regen), pursuit guidance with S-turn/height buffer, orbit at stops, snow belly landing, wake-launch release',
               states=['position/velocity', 'bank, sweep', 'battery Wh', 'skier state (common/skier.js)', 'wind (common/env.js)'],
               scenarios=['nominal carve', 'intermediate slow 6-9 m/s', 'advanced 18 m/s (KE cap lag)', '9 m/s downslope tailwind', 'gusty crosswind', 'mid-run stop + restart', '5 deg catwalk', 'tree-lined narrow run', 'launch in wake', 'skier fall under the glider'],
               metrics=['criteria.js 11 metrics', 'propulsion Wh/run', 'landing miss distance', 'S-turn fraction']),
 prior_art=[dict(name='AER throwable GoPro glider (Kickstarter 2016)', url='https://newatlas.com/aer-throw-gopro/45737/', relevance='passive thrown glider, no guidance/follow, no energy concept'),
            dict(name='Round-1 A11 fixed-wing follow flyer (internal)', url='research/concepts_2026_10_18/aerial/concepts.json', relevance='300 g powered, 15-25 m, 60-94 J; S2-01 is 3x lighter, gravity-powered, close-range, <=14.9 J'),
            dict(name='Fixed-wing ground-target tracking research', url='https://www.icb.ucsb.edu/publications/2020', relevance='flight-tested pursuit of vehicles; no human/ski product'),
            dict(name='Regenerative soaring research (SAE 2006, DGLR 2022, TU Delft)', url='https://publikationen.dglr.de/publikationen/2022/530100.pdf', relevance='regen exists for gliders/light aircraft; not used for follow-cams'),
            dict(name='HoverAir X1 PROMAX ski mode (quad)', url='https://us.hoverair.com/pages/best-camera-for-skiing-snowboarding-tracking', relevance='market baseline: quadrotor, 16 min spec battery'),
            dict(name='Web/patent search for gravity/glider skier-follow UAV', url='https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9785147', relevance='only quad image-tracking patents and Amazon ski-tow drone found; no glider follow (search not exhaustive)')],
 novelty='Not found on the market or in patents searched. Building blocks exist (micro FPV wings, folding munitions, regen research); the combination and the energy insight (descent pays flight; camera dominates) appear new.',
 user_sequence=SQ['S2-01']['steps'],
 verdict='TOP-1. Physically sound on magnitude; passes KE, endurance, pack, standstill, hands; strict ops = 3 (fix via S2-03 or treat pick-and-stow as one recovery). Regulation: still a UAS (EU C0 follow-me within 50 m is allowed in A1; resort rules decide).'))

C.append(dict(
 id='S2-02', name_en='VTOL Descent Glider: tail-sitter that hovers only to launch and land on your shoulder', name_zh='垂直起降随降滑翔机：只在起降时悬停的尾座式滑翔跟拍机',
 lens='scout/cross-industry', one_liner='The S2-01 wing with two small props: it lifts off vertically from a shoulder cradle at a button press, glides down with you (gravity-powered), and hovers back into the cradle when you stop.',
 principle='Hover is expensive (13 W) but only needed ~22 s per run; the 150 s of filming is wing-borne and gravity-assisted. Si-anode cells make the hover reserve ~19 g instead of ~40 g, keeping mass at 115 g and KE <=14.9 J up to 16.1 m/s.',
 architecture=dict(carrier='115 g tail-sitter flying wing, 2x 4-inch folding props, sweep morph', support='thrust (launch/land) + wing lift', energy=f"day net {VT['day_net_Wh']} Wh -> {VT['battery_needed_Wh_nominal']} Wh nominal, {VT['battery_mass_g_at_380Whkg']} g at 380 Wh/kg",
                   sensing='as S2-01 + cradle fiducial for docking', imaging='as S2-01', use_flow='button at standstill -> vertical take-off -> transition -> follow -> on stop: hover-land in shoulder cradle funnel'),
 viewpoints=[dict(azimuth='rear/quarter', elevation_deg='15-30', distance_m='6-10', notes='can also hover-hold briefly for a static start shot (13 W)')],
 key_numbers=dict(mass=kn(VT['mass_kg'], 'kg', 'calc', ''), hover_power=kn(VT['hover_W'], 'W', 'calc', 'two 4-in props, FoM*eta 0.5 ASSUMED'),
   KE_cap_speed=kn(VT['vmax_KE'], 'm/s', 'calc', 'advanced skiers above it ~12 % of time'),
   day_net_Wh=kn(VT['day_net_Wh'], 'Wh', 'calc', ''), battery_mass_SiAnode_vs_conventional=kn([VT['battery_mass_g_at_380Whkg'], VT['battery_mass_g_at_180Whkg_conventional']], 'g', 'calc', 'Amprius-class vs 180 Wh/kg'),
   standstill_per_run=kn(SQ['S2-02']['standstill_s_per_run'], 's', 'calc', ''), ops_per_run=kn(SQ['S2-02']['ops_per_run'], '-', 'calc', ''),
   pack_volume=kn(1.4, 'L', 'estimate', 'cradle + folded props')),
 scores=dict(footage=dict(score=4, why='Same as S2-01 plus static hover start shot.'), interference=dict(score=4, why='Shoulder cradle ~0.2 kg on the strap.'),
   convenience=dict(score=4, why='Button launch at standstill, auto-landing in cradle; 2 ops, ~15 s standstill.'),
   safety=dict(score=3, why='Props hover near the head during cradle landing (round-1 issue); 115 g lowers KE cap to 16.1 m/s.'),
   simplicity=dict(score=2, why='Tail-sitter transitions in mountain gusts are a known hard control problem (round-1 A06).'),
   originality=dict(score=4, why='VTOL tail-sitters exist (mapping UAVs); none as a gravity-assisted personal follow-cam.'),
   technical_risk=dict(score=2, why='Transition + docking in 9 m/s gusts near the user.')),
 bold_hypothesis='Hover energy can be confined to <=25 s per run so a 115 g VTOL glider films 45 min/day on <20 g of Si-anode cells.',
 falsification_test='(not run) Sim transition and docking success in common/env.js gusts 0-9 m/s; bench hover power of 4-in folding props at 1.05 kg/m3.',
 kill_criteria=['Docking success < 95 % at 0-9 m/s wind', 'Transition altitude loss > 3 m', 'Hover > 40 s per run on average', 'Prop within 0.5 m of head during docking'],
 sim_plan=dict(what_to_model='S2-01 model + hover/transition dynamics + cradle dock', states=['attitude', 'thrust', 'battery'], scenarios=['dock in gust', 'aborted dock', 'standing launch'], metrics=['dock success', 'hover s/run', 'prop-head clearance']),
 prior_art=[dict(name='Round-1 A06 hybrid kite-drone tail-sitter (tethered)', url='research/concepts_2026_10_18/aerial/concepts.json', relevance='tethered; S2-02 is free-flying and gravity-assisted'),
            dict(name='HoverAir palm landing', url='https://us.hoverair.com/products/hoverair-x1-pro-promax-combo', relevance='quad palm launch/land exists; the glider body does not')],
 novelty='Combination not found; ingredients common.', user_sequence=SQ['S2-02']['steps'],
 verdict='TOP-2. Best convenience score, but trades S2-01 simplicity and safety for hover; depends on Si-anode cells performing at -10 C.'))

C.append(dict(
 id='S2-03', name_en='Skyhook-on-the-move: glider catches a tag line from your pack while you ski', name_zh='滑行中天钩回收：滑翔机在滑行中钩住背包拖出的短绳',
 lens='scout/cross-industry', one_liner='Insitu SkyHook made personal: in the last 100 m a 1.5 m tag line streams from a pack whip, the S2-01 glider hooks it at 1-2 m/s closing speed and is reeled into the quiver, so you never stop or bend down.',
 principle='Glider and skier already move together, so capture happens at closing speed, not flight speed: relative KE 0.03-0.3 J. UWB+VIO relative navigation (~10 cm) suits a hook window of +-0.25 m x 1.2 m.',
 architecture=dict(carrier='S2-01 glider + wingtip/nose hook', support='after capture flies as a mini kite on 1.5 m line', energy='as S2-01', sensing='UWB anchor pair on the whip (AoA) + glider vision on a high-contrast line marker', imaging='as S2-01', use_flow='button or geofence -> whip+line deploy -> hook -> 3 s reel to dorsal quiver'),
 viewpoints=[dict(azimuth='rear', elevation_deg='~20', distance_m='closing 8 -> 2', notes='final approach is itself a dramatic push-in shot')],
 key_numbers=dict(relative_KE=kn(SK['S2-03_skyhook']['relative_KE_J'], 'J', 'calc', 'closing 0.8/1.5/2.5 m/s'), p_capture_single=kn(SK['S2-03_skyhook']['p_capture_single_pass'], '-', 'calc', 'sigma 0.10/0.15 m ASSUMED'),
   hook_load=kn(SK['S2-03_skyhook']['hook_load_N_shockcord_0p3m'], 'N', 'calc', '0.3 m shock cord'), abort_time=kn(SK['S2-03_skyhook']['abort_if_skier_stops']['time_to_cover_3m_at_12'], 's', 'calc', 'skier stops abruptly; glider climbs 0.6 m in that time'),
   standstill_per_run=kn(0, 's', 'calc', ''), ops_per_run=kn(SQ['S2-03']['ops_per_run'], '-', 'calc', 'launch + line deploy (can be automatic -> 1)')),
 scores=dict(footage=dict(score=4, why='As S2-01, plus a push-in shot.'), interference=dict(score=4, why='1.2 m whip + reel adds ~150 g and a line behind the head for ~10 s.'),
   convenience=dict(score=5, why='0 s standstill, 1-2 ops, no bending in the snow.'), safety=dict(score=3, why='Glider maneuvers 2-3 m behind the head; 6.8 J ground-frame if the skier stops dead.'),
   simplicity=dict(score=2, why='Hook, whip, reel and precision relative guidance.'), originality=dict(score=5, why='SkyHook is military fixed-pole recovery; no moving-person version found.'),
   technical_risk=dict(score=2, why='Skier wake turbulence and line flutter unknown.')),
 bold_hypothesis='Because both are moving at the same speed, in-motion recovery of a fixed-wing follow-cam is a low-energy docking problem, not a catch problem.',
 falsification_test='(not run) CFD/sim of a skier wake at 10 m/s and glider response; sim capture with UWB noise; kill if p_capture < 0.9 or any approach path within 1 m of the helmet.',
 kill_criteria=['Capture < 90 % per pass', 'Approach geometry within 1 m of helmet', 'Line flutter > +-0.3 m at 15 m/s', 'Added pack mass > 250 g'],
 sim_plan=dict(what_to_model='relative-frame approach guidance + line dynamics (streaming line in apparent wind) + wake model', states=['relative pose', 'line shape'], scenarios=['nominal', 'skier turns during approach', 'abrupt stop', 'gust'], metrics=['capture rate', 'min helmet clearance']),
 prior_art=[dict(name='Insitu SkyHook', url='https://en.wikipedia.org/wiki/Boeing_Insitu_MQ-27_ScanEagle', relevance='fixed pole rope capture, DGPS'), dict(name='Round-1 R08 docking drone', url='research/concepts_2026_10_18/radical/concepts.json', relevance='quad docking in motion killed (8-15 cm error); hook tolerates +-0.25 m')],
 novelty='Not found.', user_sequence=SQ['S2-03']['steps'],
 verdict='TOP-3 as an add-on to S2-01 (its ops/standstill fix). High technical risk; simulate before anything else.'))

C.append(dict(
 id='S2-04', name_en='Crosswind kite: airborne-wind-energy figure-8 mode keeps the camera kite aloft at slow speed', name_zh='侧风飞行风筝：借鉴高空风能的8字飞行让慢速时风筝不掉',
 lens='scout/cross-industry (input to kite2)', one_liner='Give the round-1 camera kite a 15 g autopilot pod: when the skier slows it flies crosswind figure-8s like an AWE power kite, multiplying its airspeed by ~L/D, so it stays up down to ~2.2 m/s and can sit lower in the wind window.',
 principle='Loyd crosswind law: kite airspeed ~ (L/D)*Vw*cos(beta). With L/D 4.4 a 2.2 m/s apparent wind gives the 5.9 m/s the kite needs. When fast, park the kite at the window edge at 35-50 deg elevation instead of 74 deg.',
 architecture=dict(carrier='round-1 A04 kite 0.30 kg + steering pod (2 bridle servos, IMU)', support='aerodynamic lift on tether', energy='skier motion', sensing='IMU + tether angle', imaging='360 cam, reframed', use_flow='as kite2 design'),
 viewpoints=[dict(azimuth='rear, sweeping +-30 deg when slow', elevation_deg='35-50 (parked) / sweeping', distance_m=8, notes='periodic orbit in footage when in figure-8 mode')],
 key_numbers=dict(min_skier_speed=kn(SK['S2-04_crosswind_kite']['min_skier_speed'], 'm/s', 'calc', 'vs 6.2 m/s passive (round-1 A04)'),
   airborne_fraction_intermediate=kn([SK['S2-04_crosswind_kite']['frac_airborne_intermediate_passive'], SK['S2-04_crosswind_kite']['frac_airborne_intermediate_crosswind']], 'fraction', 'calc', 'passive vs crosswind, moving time only'),
   tension_at_min=kn(SK['S2-04_crosswind_kite']['tension_at_min_N'], 'N', 'calc', ''), figure8_lateral=kn(SK['S2-04_crosswind_kite']['figure8_lateral_m'], 'm', 'calc', '8 m tether, 30 deg sweep')),
 scores=dict(footage=dict(score=3, why='Lower view than 74 deg; periodic sweep when slow.'), interference=dict(score=3, why='Tether pull as round-1 but controllable by parking.'),
   convenience=dict(score=3, why='Still lands at stops.'), safety=dict(score=3, why='Tether over piste; kite sweeps +-4 m.'), simplicity=dict(score=3, why='Adds an autopilot to a passive kite.'),
   originality=dict(score=4, why='AWE autopilots exist for power kites; not for camera kites on a person.'), technical_risk=dict(score=3, why='Figure-8 control on an 8 m line near a turning skier.')),
 bold_hypothesis='Active crosswind flight removes the kite\'s low-speed dead zone except at standstill.',
 falsification_test='(not run) Add crosswind steering to the kite2 sim; kill if airborne fraction at 3-6 m/s < 80 % or sweep collides with the skier volume.',
 kill_criteria=['Airborne < 80 % at 3-6 m/s', 'Tension peaks > 40 N during figure-8', 'Sweep enters 2 m skier volume'],
 sim_plan=dict(what_to_model='kite2 model + crosswind guidance', states=['kite pose on sphere', 'tether'], scenarios=['slow traverse 3 m/s', 'turn while in figure-8'], metrics=['airborne fraction', 'tension', 'elevation histogram']),
 prior_art=[dict(name='SkySails / Kitemill autopilots', url='https://cordis.europa.eu/project/id/101189207/reporting/es', relevance='automatic crosswind flight and landing for power kites')],
 novelty='AWE control for a personal camera kite not found.', user_sequence=SQ['S2-04']['steps'],
 verdict='TOP-4; hand the calc to the kite2 developer. Does not solve standstill.'))

def killed(cid, en, zh, one, key, verdict, prior, scores):
    return dict(id=cid, name_en=en, name_zh=zh, lens='scout/cross-industry', one_liner=one, principle=one, architecture={}, viewpoints=[],
                key_numbers={k: kn(v, '', 'calc', 'results_kills.json / results_descent_glider.json') for k, v in key.items()},
                scores={k: dict(score=s, why='magnitude screen') for k, s in scores.items()}, bold_hypothesis='', falsification_test='',
                kill_criteria=[], sim_plan={}, prior_art=prior, novelty='', user_sequence=[], verdict=verdict)
K = KL
C.append(killed('S2-05', 'Kestrel mode: wind-hover in slope lift at stops', '红隼模式：停下时借坡面上升气流悬停', 'At stops the glider hovers motionless in upslope wind (TU Delft orographic hovering).',
  DG['kestrel_wind_hover_S2_05'], 'MERGE into S2-01 as opportunistic mode: needs >=6.2 m/s upslope wind, available at ~5 % of stops; saves 0.013 Wh/stop.',
  [dict(name='TU Delft AOSOAR', url='https://arxiv.org/pdf/2510.23084v1', relevance='0 % throttle wind-hover')], dict(footage=4, safety=4)))
C.append(killed('S2-06', 'Solar-skin glider', '太阳能蒙皮滑翔机', 'Flexible GaAs/perovskite cells on the S2-01 wing.', DG['solar_skin_S2_06'],
  'MERGE as option: ~4 W mean in sun > 2.2 W camera+avionics, so sunny-day endurance becomes unlimited; 9 g at 1 W/g modules (2 g with lab cells); useless when overcast.',
  [dict(name='Zephyr / flexible GaAs', url='https://www.army.mil/article/259542/apntspace_cft_concludes_high_altitude_experimentation', relevance='solar HAPS')], dict(footage=4)))
C.append(killed('S2-07', 'Laser power-beamed follow drone', '激光无线供能跟拍无人机', 'Pack laser beams power to a battery-less micro drone (DARPA POWER transfer).', K['S2-07_laser_beamed_drone'], 'KILL: ' + K['S2-07_laser_beamed_drone']['verdict'],
  [dict(name='DARPA POWER', url='https://www.theregister.com/2025/05/19/darpa_energy_beaming_record', relevance='800 W at 8.6 km')], dict(safety=1)))
C.append(killed('S2-08', 'Samara spinning camera with global shutter', '翅果式旋转相机（全局快门）', 'Monocopter carries a spinning global-shutter 360 camera.', K['S2-08_samara_spin_cam'], K['S2-08_samara_spin_cam']['verdict'],
  [dict(name='SUTD monocopters', url='https://www.sutd.edu.sg/technical-release-listing/small-but-mighty-a-biomimetic-idea-takes-flight/', relevance='32 g, 26 min hover')], dict(footage=1)))
C.append(killed('S2-09', 'Leapfrog snow-perch flyer', '蛙跳式雪面栖停拍摄机', 'Lands ahead on snow, films the pass-by, overtakes again.', K['S2-09_leapfrog_perch'], K['S2-09_leapfrog_perch']['verdict'],
  [dict(name='Stanford SNAG perching', url='https://techxplore.com/news/2021-12-stanford-bird-bots-perch.amp', relevance='perching')], dict(safety=2)))
C.append(killed('S2-10', 'Micro ski-robot follower', '微型滑雪机器人跟拍', '200 g steerable sled-robot follows in your track.', K['S2-10_micro_ski_robot'], K['S2-10_micro_ski_robot']['verdict'],
  [dict(name='Ski Robot Challenge 2018', url='https://spectrum.ieee.org/ski-robot-challenge', relevance='humanoid ski robots fell')], dict(footage=1)))
C.append(killed('S2-11', 'Si-anode + self-heating + aerogel palm drone', '硅负极+自加热+气凝胶的掌上跟拍机', 'Battery breakthroughs applied to a market follow quad.', K['S2-11_battery_quad'], K['S2-11_battery_quad']['verdict'],
  [dict(name='Amprius SiCore', url='https://www.businesswire.com/news/home/20250722309461/en', relevance='450 Wh/kg')], dict(originality=1)))
C.append(killed('S2-12', 'Guided soft parafoil camera', '制导软翼伞相机', 'Precision-airdrop micro parafoil follows you down.', K['S2-12_guided_parafoil'], K['S2-12_guided_parafoil']['verdict'],
  [dict(name='Georgia Tech small parafoil', url='https://www.camm.gatech.edu/images/8/8e/Scheuermann_2015_LateralLongitudinalControl.pdf', relevance='13 m median miss')], dict(footage=2)))
C.append(killed('S2-13', 'Ground-effect skimming chase glider', '地效贴地追拍滑翔机', 'Fly at 0.3 m over snow for a dramatic low shot and better L/D.', K['S2-13_ground_effect_skim'], K['S2-13_ground_effect_skim']['verdict'], [], dict(safety=1)))
C.append(killed('S2-14', 'Tether-climbing camera trolley on the kite line', '沿风筝线爬行的相机小车', 'Rail-cam idea: camera rides the kite tether to a chosen distance.', K['S2-14_tether_trolley'], K['S2-14_tether_trolley']['verdict'], [], dict(footage=1)))
C.append(killed('S2-15', 'Micro swarm (drone-show RTK)', '微型蜂群（灯光秀式RTK）', 'Several <=30 g drones hand off the shot.', K['S2-15_micro_swarm'], K['S2-15_micro_swarm']['verdict'],
  [dict(name='Black Hornet 4', url='https://www.thedefensepost.com/2023/10/11/teledyne-advanced-black-hornet-drone/', relevance='70 g, 10 m/s')], dict(footage=1)))
C.append(killed('S2-16', 'Camera boomerang', '相机回旋镖', 'Throwable returning camera.', K['S2-16_boomerang_cam'], K['S2-16_boomerang_cam']['verdict'], [], dict(footage=1)))

concepts = dict(meta=dict(round='2026-10-19 scout', author='cross-industry scout agent', evidence='magnitude calcs and public sources only; no physical tests (M-070 NOT_RUN, G-MATURE closed); ASSUMED values marked in calc_*.py',
                          reproduce='python3 calc_descent_glider.py && python3 calc_kills.py && python3 calc_skyhook_kite.py && python3 calc_sequence.py && python3 build_scout.py'),
                concepts=C)

ranking = dict(meta=dict(method='Weighted: originality x2, footage x2, safety x1.5, interference, convenience/stow, simplicity, technical risk (5=low risk) x1; killed concepts excluded; family overlap noted'),
  ranking=[
   dict(rank=1, id='S2-01', reason='Only transfer whose energy source is new AND free: descent pays flight (propulsion ~1 Wh/day vs camera ~1.9 Wh), 95 g / <=14.9 J by design, nothing on the body but a 1.2 L quiver, 51 min per 4 Wh. Market and patent search found no fixed-wing/gravity ski follow-cam.', biggest_risk='Low-Re glide polar of a folding+morphing 95 g airframe (L/D at 12 m/s swept must be >=4) and snow-landing pickup ops (3 strict).'),
   dict(rank=2, id='S2-02', reason='Same energy insight, but hover at launch/land gives 2 ops and button-launch at standstill; Si-anode keeps it at 115 g.', biggest_risk='Tail-sitter transition and cradle docking in gusts with props near the head; KE cap drops to 16.1 m/s.'),
   dict(rank=3, id='S2-03', reason='Turns S2-01 into a zero-standstill product: capture at 1-2 m/s closing speed (0.03-0.3 J).', biggest_risk='Skier wake turbulence and line flutter during capture 2-3 m behind the head.'),
   dict(rank=4, id='S2-04', reason='Cheapest upgrade to the user-requested kite: crosswind figure-8 lowers minimum skier speed from 6.2 to ~2.2 m/s and the view from 74 deg to ~35-50 deg.', biggest_risk='Periodic orbit in footage and tether sweep near a turning skier; still lands at stops.')],
  merged=['S2-05 kestrel wind-hover (5 % of stops)', 'S2-06 solar skin (sunny-day unlimited endurance)', 'S2-11 Si-anode/self-heating/aerogel battery stack'],
  killed=['S2-07 laser beaming (~400x MPE)', 'S2-08 samara spin cam (too slow)', 'S2-09 leapfrog perch (KE/overtake)', 'S2-10 micro ski robot', 'S2-12 guided parafoil (glide 18 deg, 13 m miss)', 'S2-13 ground-effect skim', 'S2-14 tether trolley (geometry)', 'S2-15 micro swarm (10 m/s)', 'S2-16 boomerang'],
  breakthroughs_that_change_the_picture=[
   'Si-anode cells 450 Wh/kg (Amprius 2025): makes a 4 Wh, 10 g day battery; also ~3x cold endurance for market quads (not original)',
   'Bird-inspired sweep morphing (LisHawk 2020): cuts glider propulsion ~5x for fast skiers by covering 6-16 m/s',
   'Loitering-munition folding wings + tube launch: 1.2 L stow and one-motion deploy',
   'Regenerative soaring windprop (Velis, TU Delft): turns steep pitches into stop-orbit energy',
   'UWB (10-15 cm) + 3 mW event/ToF sensors: precise close-range relative navigation for pursuit, landing and hook capture',
   'Gyroflow-style gyro-log stabilisation + subject-locked reframing: removes the gimbal; residual background jitter 0.1-0.4 deg/s',
   'EU 2019/947 follow-me exemption (<=50 m, A1, C0 <=19 m/s): a legal path for a 95 g follow-glider in the EU (resort rules still decide)'])

for name, obj in (('sources', sources), ('concepts', concepts), ('ranking', ranking)):
    with open(os.path.join(HERE, f'{name}.json'), 'w') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    print('wrote', name, len(obj) if isinstance(obj, list) else '')
