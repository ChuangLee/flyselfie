import json, datetime
import os; A=os.path.dirname(os.path.abspath(__file__))+'/'
b=json.load(open(A+'out_boom360.json')); t=json.load(open(A+'out_trackdrone.json')); d=json.load(open(A+'out_tetherdrone.json'))
bs={s['id']:s for s in b['scenarios']}; ts={s['id']:s for s in t['scenarios']}; ds={s['id']:s for s in d['scenarios']}
H=lambda s:s['harmonised']
F=[]
def f(concept,file,line,sev,issue,evidence,fix): F.append(dict(concept=concept,file=file,line=line,severity=sev,issue=issue,evidence=evidence,suggested_fix=fix))
f('boom360','sim/js/concepts/boom360/model.js',501,'critical',
  'S1 fails footage stability for a structural reason the metric split hides: the camera is rigidly carried by the torso, so every >1 Hz torso rotation is multiplied by the ~2 m lever into camera translation (LOS rate ≈ (R/d)·torso rate ≈ 0.9× torso rate). EIS and the subject-tracking crop cannot remove translation parallax. The moguls verdict is driven by an ASSUMED ±4° torso pitch at the bump frequency (l.501).',
  f"Harmonised LOS jitter (1 Hz HP): nominal {H(bs['nominal'])['jitter']} °/s, short {H(bs['short'])['jitter']}, moguls {H(bs['moguls'])['jitter']}, fast {H(bs['fast'])['jitter']}, gust {H(bs['gust'])['jitter']} vs 3 °/s; boom-flex-only part (jitterBoom) is already 4.0 °/s nominal; dt-converged (6.00/6.02 at dt/2, dt/4). audit/out_boom360.json",
  'Decouple the camera from torso rotation: active 2-axis root stabiliser (IMU-commanded, ≈10 N·m peak for ±4° at 2 Hz on 0.6–0.9 kg·m²) or root at the pelvis/hip belt; plus f1Lat ≥ 8 Hz. Validate the torso-pitch assumption with an IMU-on-pack recording in moguls.')
f('boom360','sim/js/concepts/boom360/index.js',223,'major',
  'keMax is the KE of the whole boom relative to the snow and judged against 80 J; it is dominated by the rider’s own speed and is not added bystander risk (a person struck within the rider’s envelope is struck by the 80 kg rider too). The 18 m/s scenario fails for this reason only.',
  f"Rider-relative KE (m_eff = tip + ⅓ tapes): nominal {H(bs['nominal'])['keRel']} J, fast {H(bs['fast'])['keRel']} J, falls ≤{max(H(bs['fallBack'])['keRel'],H(bs['fallSide'])['keRel'])} J vs reported 50.4 / 102.5 J. Camera-only ground-frame KE {H(bs['nominal'])['keCamAbs']} J nominal (definition-dependent).",
  'Report keMax in the rider frame for parts within 1.5 m of the body (harmonised criterion) and separately flag lateral tip protrusion beyond the rider’s corridor.')
f('boom360','sim/js/concepts/boom360/model.js',36,'major',
  'I_BODY_ROLL = 12.5 kg·m² is a centroidal whole-body value but rollInertiaPct compares it with added inertia computed about the FEET line (index.js l.183, l.238). Inconsistent reference makes the metric fail spuriously in every scenario.',
  'Parallel-axis: 12.5 + 80·(0.95 m)² ≈ 85 kg·m² (77–93 for h_cm 0.9–1.0 m); 3.27 kg·m² added ⇒ 3.9 % (pass ≤20 %) instead of 26 % (fail). Yaw reference 1.5 kg·m² omits skis/boots (≈+0.9 kg·m²): 24 % instead of 40 %. audit/out_boom360.json inertiaReference',
  'Use I_feet = I_cm + m·h_cm² (≈85–93 kg·m²) and include skis in the yaw reference.')
f('boom360','sim/js/concepts/boom360/index.js',72,'major',
  'Snag body force (197 N, fail) is set by the scenario’s ASSUMED branch slip load (slip: 200 N), not by the design: the tape-spring fold limits BENDING moment only, so an axial/backward pull passes straight into the back until the branch lets go.',
  'Events: fold at 45.7 N·m at 6.049 s, branch slips at 202 N at 6.074 s; 50 ms dynamic body force 100.7 N (harmonised fail vs 40 N); unchanged at dt/4 (197.5 N).',
  'Add an axial breakaway (magnetic camera/tip release ≈30–40 N with lanyard) and test the snag at several slip loads (50–400 N).')
f('boom360','sim/js/concepts/boom360/index.js',33,'major',
  'Lateral fold fuse (25 N·m) has almost no margin over operating loads: a hockey stop causes a false fold (lift scenario, 26.8 N·m, footage lost while still decelerating) and the gust scenario reaches 24.1 N·m yaw torque.',
  f"lift: fold at 9.1 s, foldStuck → retract; harmonised avail {H(bs['lift'])['avail']} % (<80). gust yawTorquePeak 24.07 N·m. results.json + audit dt runs (foldCount 1 at all dt).",
  'Raise foldLat to ≥35 N·m with a rate-sensitive (viscous) fuse, or use the IMU fall detector for retraction and keep the passive fuse for impacts only.')
f('boom360','sim/js/concepts/boom360/index.js',150,'minor',
  'avail denominator is the whole scenario (incl. standstill, deploy, post-fall) and the threshold is 70 % while both drones use 80 %; falls appear to fail although the boom films all skiing time.',
  f"Harmonised (skiing-time denominator): fallBack/fallSide {H(bs['fallBack'])['avail']} % vs reported 49.9 %.",
  'Use the harmonised skiing-time denominator and ≥80 %.')
f('boom360','sim/js/concepts/boom360/model.js',432,'minor',
  'bodyForcePeak is an instantaneous (1–4 ms) peak that includes the 11.4 N static weight of the worn parts; the drones exclude weight and S3 uses a 20 ms mean.',
  f"Dynamic 50 ms value nominal {H(bs['nominal'])['bodyForceDyn50ms']} N vs reported 18.6 N.", 'Subtract static weight and use a 50 ms moving mean.')
f('boom360','sim/js/concepts/boom360/model.js',28,'minor',
  'Impact transients are not fully dt-converged (the θ-method integrator itself is stable and only weakly dissipative).',
  'fallBack bodyForcePeak 112.5 → 122.2 → 126.9 N and rootMomentPeak 21.4 → 24.5 → 25.4 N·m at dt 4/2/1 ms; steady metrics change <1 %. Undamped first-mode free vibration loses 24 % energy in 2 s at 4 ms (ζ_num ≈ 0.2 %) and 7 % at 1 ms, never gains energy; modes within 0.9 % of a Rayleigh closed form (f1Lat 4.00 vs 4.03 Hz, f1Sag 6.08 vs 6.10 Hz).',
  'Sub-step to 0.5 ms during contact or report impact peaks with a convergence band; verdicts unchanged (still below 150 N / 40 N·m).')
f('boom360','sim/js/concepts/boom360/index.js',65,'minor','Fall scenario expectation text says the root folds at ~15 N·m but the parameter foldPos is 25 N·m (l.31).','index.js l.31 v: 25 vs l.65 "~15 N·m"; events show folds at 25.9–27.7 N·m.','Align the text with the parameter.')
f('boom360','sim/js/concepts/boom360/index.js',224,'minor','endurance is a hard-coded 75 min (ASSUMED camera spec × cold factor); deploy-motor energy not counted.','index.js l.224','Compute from camera + motor energy budget at −10 °C.')

f('trackdrone','sim/js/concepts/trackdrone/model.js',785,'major',
  'Residual gimbal jitter model scales the per-sample ANGLE noise with the airframe tilt RATE (σ = 0.02° + 0.002·tiltRate[°/s]); at 50 Hz this injects ≈4 °/s of artificial rate jitter that dominates jitterRms. A gimbal that leaks 0.2 % of the airframe rate gives a 0.2 °/s-class residual.',
  f"Residual-model RMS {H(ts['nominal'])['jitterResidModelRms']} °/s; harmonised jitter nominal {H(ts['nominal'])['jitter']} °/s as modelled vs {H(ts['nominal'])['jitterWithRateResid']} °/s with a rate-consistent residual (LOS HP alone {H(ts['nominal'])['jitterLosHP']}). Short turns stay above 3 °/s either way ({H(ts['short'])['jitterWithRateResid']}).",
  'Model the residual as rate leakage (ω_res = k·ω_airframe, k≈0.1–0.5 %) plus a small angle floor, and judge the >1 Hz LOS rate.')
f('trackdrone','sim/js/concepts/trackdrone/index.js',215,'major',
  'Endurance is judged per run (≥4 min) instead of per day; the ≤249 g battery holds only one cold run, and the per-lift pod recharge assumes 20 W into a 13.5 Wh cell held at 5 °C (≈1.5 C), above typical cold-charge limits (≤0.3–0.5 C). The power bank this needs is not in addedMass (l.209).',
  f"Mean power {H(ts['nominal'])['meanPowerW']} W nominal (mean tilt {H(ts['nominal'])['meanTiltDeg']}°); 4.5–6.3 min per battery cold; {t['endurance']['batteriesFor45minCold']} batteries for 45 min cold ({t['endurance']['batteriesFor45minWarmPocket']} if kept warm); podSustain 0.54 even at 20 W.",
  'Judge cumulative filming time per day (≥45 min); count power-bank mass; limit pod charging to the cold-charge C-rate or heat the pod.')
f('trackdrone','sim/js/concepts/trackdrone/index.js',214,'major',
  'keMax fails robustly: 0.245 kg at the rider’s speed exceeds 14.9 J above 11 m/s; only ≤150 g would pass at the nominal 14.1 m/s peak. (Regulatory note: FAA Cat 1 / EU C0 permit ≤250 g without exposed rotors over people with no energy limit.)',
  f"KE nominal {H(ts['nominal'])['keGround']} J at {H(ts['nominal'])['vGroundMax']} m/s; crosswind {H(ts['crosswind'])['keGround']} J; mass for 14.9 J at nominal peak {H(ts['nominal'])['massForKE14_9AtVmax']} kg.",
  'Either a crushable shroud certified by an ASTM F3389 transfer test, or a ≤150 g airframe; state which regulatory route (Cat 1 vs Cat 2) is targeted.')
f('trackdrone','sim/js/concepts/trackdrone/index.js',188,'major',
  'setupTime is evaluated only at 0.6× the scenario mean wind; the dock sweep shows 67 % success at 6 m/s and 0 % at 9 m/s, so the p90 setup time with manual retrieval is not represented.',
  'results.json dock: dock6 66.7 %, dock9 0 %; setupTime 12.65–12.84 s in all scenarios.',
  'Report setupTime at p90 of a wind sweep including the fallback landing + pick-up time.')
f('common','sim/js/concepts/common/env.js',108,'major',
  'losJitter() uses |Δ∠LOS| − |Δ∠fwd| (difference of magnitudes). It ignores direction, so a camera rotating at the right speed in the wrong direction scores zero; it underestimates the relative LOS rate.',
  f"On trackdrone nominal arrays: shared {H(ts['nominal'])['jitterSharedFn']} °/s vs vector relative-rate {H(ts['nominal'])['jitterVectorFn']} °/s (+30 %); short {H(ts['short'])['jitterSharedFn']} vs {H(ts['short'])['jitterVectorFn']}. tetherdrone index.js l.125 copies the same scalar form.",
  'Compute the rate of the LOS expressed in the camera frame (vector difference), as in audit/harmonise.mjs losJitterVector().')
f('trackdrone','sim/js/concepts/trackdrone/model.js',39,'minor',
  'Hover power uses FoM 0.38 for 4×76 mm ducted rotors (53.7 W hover at ρ 1.05); a DJI Avata-class benchmark implies FoM_eff ≈0.5–0.6, so power is pessimistic by up to ~1.5×. Not verdict-changing (endurance stays ≪45 min).',
  f"Closed-form ideal hover {t['power']['idealHoverW']} W; model {t['power']['modelHoverW']} W; trim 12 m/s {t['power']['trim'][2]['power']} W at {t['power']['trim'][2]['tiltDeg']}°; the parasitic term dominates at 12–14 m/s (CdA 0.016–0.022 m²).",
  'Bracket FoM 0.38–0.55 and CdA 0.008–0.02 in a sensitivity table.')
f('trackdrone','sim/js/concepts/trackdrone/model.js',652,'minor',
  'Battery current limits are not enforced: 312 W peak (highspeed) on a 13.5 Wh 3S Li-ion pack is ≈23 C, beyond typical high-energy Li-ion ratings (~10 C); voltage sag is modelled but not a current limit.',
  f"peakPowerW highspeed {H(ts['highspeed'])['peakPowerW']} W; vCellMin 3.17 V.", 'Cap discharge current at the cell rating and let the drone fall behind accordingly.')
f('trackdrone','sim/js/concepts/trackdrone/index.js',195,'minor','bodyForcePeak uses worn mass × horizontal skier acceleration only (no vertical/bump loads). Values ~1 N so the verdict is unaffected.','index.js l.195–196','Use the 3-D acceleration of the pack anchor.')
f('trackdrone','sim/js/concepts/trackdrone/index.js',164,'minor','avail denominator = filming modes incl. lost/hold rather than skiing time.',f"Harmonised values equal within 0.2 pp (overhang {H(ts['overhang'])['avail']} vs 100).",'Use the skiing-time denominator.')
f('trackdrone','sim/js/concepts/trackdrone/index.js',135,'minor','Integration converges (dt 5 → 2.5 ms changes metrics ≤4 %), but crosswind crossMax moves from 0.602 to 0.644 m around its 0.6 m threshold; the default export also drops the extra argument (simulate: (params, scenario) => simulate(params, scenario), l.385), so dt studies must use simulateWith.','audit/out_trackdrone.json dt table','Document simulateWith for convergence tests.')

f('tetherdrone','sim/js/concepts/tetherdrone/analysis.js',36,'major',
  'The tether crosses the rider in 100 % of frames at ≈1.3 px width (visible ≥0.5 px in 93–100 % of frames at Lst ≤6 m, 52 % at 10 m) in every geometry tried (attachOff 0–0.2 m, Lst 3–10 m) because the line ends on the rider’s back; avail ignores it.',
  'results.json tetherCross 100 %, tetherCrossVis 100 % nominal, tetherWidthPx 1.28 px; sensitivity attachOff 0/0.2 unchanged.',
  'Fold device artefacts into avail; evaluate known-geometry tether inpainting (line position is known from reel length + exit angle) or a sub-0.5 px (≤0.5 mm) conductor.')
f('tetherdrone','sim/js/concepts/tetherdrone/model.js',37,'major',
  '100 V DC bus on a body-worn, flexing tether exceeds the 60 V DC ES1/SELV touch-safe limit; electrical safety is not a metric.',
  'PDEF Vbus 100; 48 V counterfactual loss 5.9 % (passes <5 % only marginally); loss at 100 V 1.1 W at 6 m (closed form R 4.13 Ω, I 0.51 A — matches model).',
  'Either 48–60 V with 0.08–0.1 mm² conductors (loss ≈3 %) or reinforced insulation + ground-fault/arc cut-off; add an electrical-safety gate.')
f('tetherdrone','sim/js/concepts/tetherdrone/index.js',188,'minor',
  'keRelNear (KE relative to the rider at closest approach, 0.03 J, pass) is not a bystander metric: the drone is ~5 m from the rider, so the ground-frame keMax (19.7 J, fail) governs.',
  f"Audit ground-frame KE nominal {ds['nominal']['sub']['0.75']['keGround']} J, fast {ds['fast']['sub']['0.75']['keGround']} J; rider-relative {ds['nominal']['sub']['0.75']['keRelRider']} J.",
  'Drop keRelNear from the pass list or relabel as rider-strike energy.')
f('tetherdrone','sim/js/concepts/tetherdrone/index.js',125,'minor','Jitter uses a scalar magnitude difference and no residual stabilisation term; with the harmonised LOS form plus the same rate-leak residual as S2 it still passes.',f"Harmonised nominal {ds['nominal']['sub']['0.75']['jitter']} °/s (no residual {ds['nominal']['sub']['0.75']['jitterNoResid']}), short {ds['short']['sub']['0.75']['jitter']}, snag {ds['snag']['sub']['0.75']['jitter']}.",'Use the shared vector form with a residual term.')
f('tetherdrone','sim/js/concepts/tetherdrone/index.js',181,'minor','handsBusy charges a 1 s tap per run against the scenario duration even though taps happen when stopped (3–5 %).','index.js l.181','Count only actions while skiing (0 %).')
f('tetherdrone','sim/js/concepts/tetherdrone/index.js',204,'minor','p24max is a 24 V counterfactual but is reported with pass=false, polluting the fail list of the 100 V design.','results.json p24max fail in every scenario','Report counterfactuals with pass=null.')
f('tetherdrone','sim/js/concepts/tetherdrone/model.js',38,'minor','Air density fixed at 1.0 kg/m³ (boom 1.0) while trackdrone derives 1.05 from ISA 2000 m/−10 °C; ~5 % on induced power across concepts.','PDEF rho 1.0; trackdrone derive().rho 1.052','Use the shared ISA function for all concepts.')
f('tetherdrone','sim/js/concepts/tetherdrone/model.js',145,'minor','No physics error found in rotor power or tether electrics: rotorPower matches closed-form momentum/Glauert hover and forward flight; the 27 W mean drone power (below 44 W hover) is real — the 1.5 N tether tows the drone and the rider supplies ≈15 W.',
  f"hover {d['power']['plusAvionics']} W; 12 m/s untethered {d['power']['forward'][1]['modelW']} W vs towed {d['power']['forward'][2]['modelW']} W (tow power {d['power']['forward'][2]['towPowerFromRiderW']} W); sub-step factor 0.75→0.375 changes T0max/KE <0.5 %.",
  'None; document the towing effect.')
json.dump({'generated':str(datetime.date.today()),'evidence':'audit of numerical-uncalibrated simulations; not a physical test','findings':F}, open(A+'findings.json','w'), ensure_ascii=False, indent=1)
print(len(F))
