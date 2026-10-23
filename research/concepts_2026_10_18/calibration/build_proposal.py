# Builds proposal.json from the literature table below plus the computed *_stats.json and trunk_model.mjs.
# Run: python3 research/concepts_2026_10_18/calibration/build_proposal.py
import json, os
H = os.path.dirname(os.path.abspath(__file__))
L = lambda f: json.load(open(os.path.join(H, f)))
F, S = 'fetched_full_text', 'snippet_or_abstract_only'
src = {
 'brunner2015': {'cite': 'Brunner, Ruedl et al. 2015, PLoS ONE (radar, n=416 recreational adults, Austria)', 'url': 'https://doi.org/10.1371/journal.pone.0132002', 'access': S},
 'ettlinger2005': {'cite': 'Ettlinger, Shealy & Johnson 2005, J ASTM Int (radar, blue groomed trails, USA)', 'url': 'https://store.astm.org/stp12212s.html', 'access': S},
 'supej2018': {'cite': 'Supej, Ogrin & Holmberg 2018, Front Physiol (instructors, GNSS + accelerometers)', 'url': 'https://doi.org/10.3389/fphys.2018.00204', 'access': F},
 'klous2014': {'cite': 'Klous et al. 2014, Comput Math Methods Med (ski teachers, 21° slope)', 'url': 'https://doi.org/10.1155/2014/340272', 'access': F},
 'gilgien2015': {'cite': 'Gilgien et al. 2015, PLoS ONE (World Cup GNSS)', 'url': 'https://doi.org/10.1371/journal.pone.0118119', 'access': F},
 'martinez2019': {'cite': 'Martínez et al. 2019, Front Sports Act Living (experts, boot IMUs)', 'url': 'https://doi.org/10.3389/fspor.2019.00018', 'access': F},
 'sporri2016': {'cite': 'Spörri et al. 2016, Orthop J Sports Med (elite racers, sacrum+sternum IMUs, insoles)', 'url': 'https://doi.org/10.1177/2325967116630719', 'access': F},
 'sporri2017': {'cite': 'Spörri et al. 2017, Front Physiol (racers, vibration bands, sacrum RMS)', 'url': 'https://doi.org/10.3389/fphys.2017.00522', 'access': F},
 'reid2020': {'cite': 'Reid et al. 2020, Front Sports Act Living (slalom 3D video)', 'url': 'https://doi.org/10.3389/fspor.2020.00025', 'access': F},
 'nakazato2011': {'cite': 'Nakazato, Scheiber & Müller 2011, J Sports Sci Med (force plates, experts/intermediates)', 'url': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3761512', 'access': F},
 'steenstrup2018': {'cite': 'Steenstrup et al. 2018, Br J Sports Med 52:32 (WC head impacts, video)', 'url': 'https://doi.org/10.1136/bjsports-2017-098050', 'access': S},
 'lubricants2016': {'cite': 'Ski-suit fabric on snow tribometer, Lubricants 2016', 'url': 'https://doaj.org/article/80fa8d48cb5647a4812f0b934b3addf1', 'access': S},
 'mogulKnee2007': {'cite': 'Mogul knee goniometry, 6 competitive freestyle skiers (conference, via search)', 'url': 'https://researchspace.auckland.ac.nz/handle/2292/6772', 'access': S},
 'fisMogul': {'cite': 'FIS/NSF mogul course specification sheet (2007 rev.)', 'url': 'https://skiforbundet.no/contentassets/e4988bcec1a94439bbabfb3922c11395/mogul-spec-mog-final.pdf', 'access': S},
 'wmo2010': {'cite': 'Harper, Kepert & Ginger 2010, WMO/TD-1555 gust factors', 'url': 'https://www.systemsengineeringaustralia.com.au/download/WMO_TC_Wind_Averaging_27_Aug_2010.pdf', 'access': F},
 'iec61400': {'cite': 'IEC 61400-1 turbulence classes and Kaimal length scale (secondary summary)', 'url': 'https://support.ul-renewables.com/windographer/articles-IEC-turbulence.htm', 'access': S},
 'tuwienLift': {'cite': 'TU Wien 2021, ropeway crosswind availability limit', 'url': 'https://www.tuwien.at/en/tu-wien/news/news-articles/news/how-windproof-are-cable-cars-1', 'access': S},
 'hoverair': {'cite': 'HoverAir X1 PRO/PROMAX ski product page', 'url': 'https://us.hoverair.com/products/hoverair-x1-pro-promax-for-skiing', 'access': S},
 'djiNeo': {'cite': 'DJI Neo specs', 'url': 'https://www.dji.com/neo/specs', 'access': S},
 'djiFlip': {'cite': 'DJI Flip spec copy', 'url': 'https://dronespec.dronedesk.io/dji-flip', 'access': S},
 'insta360x4': {'cite': 'Insta360 X4 review/spec', 'url': 'https://www.maisondudrone.com/en/insta360-x4-complete-test-the-360-power-of-8k', 'access': S},
 'faa107': {'cite': '14 CFR 107 Subpart D', 'url': 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-107/subpart-D', 'access': S},
 'astmF3389': {'cite': 'ASTM F3389/F3389M-21', 'url': 'https://store.astm.org/f3389_f3389m-21.html', 'access': S},
 'easa2019_945': {'cite': 'EASA Easy Access Rules UAS, Reg. (EU) 2019/945 classes', 'url': 'https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-unmanned-aircraft-systems?page=19', 'access': S},
 'sust80J': {'cite': 'Swiss STSB safety recommendation on the 80 J criterion', 'url': 'https://www.sust.admin.ch/en/safety-recommendations/aviation/av_se_587.pdf', 'access': S},
 'nasaSickness': {'cite': 'Terenzi & Zaal 2020, NASA/AIAA 2020-0171 cybersickness thresholds', 'url': 'https://ntrs.nasa.gov/api/citations/20200000787/downloads/20200000787.pdf', 'access': F},
 'cipaDC011': {'cite': 'CIPA DC-X011 image stabilisation measurement (stills)', 'url': 'https://corp.dxomark.com/wp-content/uploads/2025/11/CIPA-DC-X011-2014_E.pdf', 'access': S},
 'militaryLoad': {'cite': 'Military load carriage review (combat 30% BW, march 45% BW)', 'url': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4580806', 'access': S},
 'torayT700': {'cite': 'Toray T700S datasheet', 'url': 'https://www.toraycma.com/wp-content/uploads/T700S-Data-Sheet.pdf', 'access': S},
 'fleckTape': {'cite': 'Fleck/Pellegrino woven CFRP tape spring', 'url': 'https://www.repository.cam.ac.uk/bitstream/1810/285430/1/Fleck60JMPSRevised.pdf', 'access': S},
 'battCold': {'cite': 'Li-ion low-temperature capacity, Machines 13(12):1114', 'url': 'https://www.mdpi.com/2075-1702/13/12/1114', 'access': S},
}
M, I = 'MEASURED', 'INFERENCE'
lit = {
 'speed': [
  {'v': '48.2±14.3 km/h (13.4±4.0 m/s)', 'pop': 'recreational adults, radar', 'src': 'brunner2015', 'kind': M},
  {'v': '44.5 km/h skiers (12.4 m/s), peak over window', 'pop': 'recreational, blue groomed', 'src': 'ettlinger2005', 'kind': M},
  {'v': 'carved turns 13.3 m/s; snow-plow 4.8 m/s', 'pop': 'instructors, GNSS', 'src': 'supej2018', 'kind': M},
  {'v': 'carved turn mean 13.9, max 16.5 m/s (21° slope)', 'pop': 'ski teachers', 'src': 'klous2014', 'kind': M},
  {'v': 'GS 17.75±2.30 m/s median±IQR', 'pop': 'World Cup', 'src': 'gilgien2015', 'kind': M},
  {'v': 'p95 recreational ≈ 62–72 km/h (17–20 m/s)', 'pop': 'mean+1.645 SD', 'src': 'brunner2015', 'kind': I}],
 'turnDuration': [
  {'v': 'long carving 2.97±0.43 s/turn; short turns 1.04±0.41 s/turn', 'pop': 'experts (ex-racers, instructors)', 'src': 'martinez2019', 'kind': M},
  {'v': 'GS 1.45±0.11 s; SL 0.90±0.04 s', 'pop': 'elite racers 26° icy', 'src': 'sporri2016', 'kind': M},
  {'v': 'SL min radius 3.96–4.94 m; edge angle 66–71°', 'pop': 'slalom racers', 'src': 'reid2020', 'kind': M}],
 'groundReactionBW': [
  {'v': 'short carving peak 1.91–2.05 (experts), 1.61–1.68 (intermediates); long steered peak 1.76–1.86', 'pop': 'force plates 15°/23°', 'src': 'nakazato2011', 'kind': M},
  {'v': 'carve 1.93, short swing 1.89, straight 1.23', 'pop': 'instructors', 'src': 'supej2018', 'kind': M},
  {'v': 'GS 1.80, SL 2.02–2.25 (insoles, read ~30–40% low)', 'pop': 'racers', 'src': 'sporri2016', 'kind': M}],
 'trunk': [
  {'v': 'frontal flexion avg/max GS 27/29°, SL 11/13°; lateral bending GS 11–12/13–14°, SL 6–7/9–10°; torsion GS 6/8–9°, SL 5–6/7.5°', 'pop': 'elite racers, sacrum+sternum IMUs', 'src': 'sporri2016', 'kind': M},
  {'v': 'knee angle change 50–60° per mogul turn', 'pop': '6 competitive freestyle skiers', 'src': 'mogulKnee2007', 'kind': M},
  {'v': 'mogul spacing ≈3.5 m; course 26–28°', 'pop': 'competition course', 'src': 'fisMogul', 'kind': M},
  {'v': 'NO measured trunk oscillation amplitude/frequency for recreational skiers, nor trunk angles in moguls, nor pelvis lateral excursion was found', 'src': None, 'kind': 'GAP'}],
 'vibration': [
  {'v': 'boot weighted RMS: carve 9.69, short swing 12.92, basic swing 7.73, straight 2.55, plough 6.05 m/s²; PSD peaks 1.5–8 Hz; extra 8.5–35 Hz band only with skidding; falls above 35 Hz', 'pop': 'instructors groomed', 'src': 'supej2018', 'kind': M},
  {'v': 'sacrum weighted RMS GS 11.10, SL 9.35 m/s²; bands <4 Hz turning, 4–10 Hz spine resonance, 10–20 Hz shank/thigh, 15–25 Hz ski chatter', 'pop': 'racers, compact artificial snow 19°', 'src': 'sporri2017', 'kind': M}],
 'falls': [
  {'v': 'normal head impact velocity 8.1±0.6 m/s (1.9–12.1)', 'pop': 'World Cup crashes, video', 'src': 'steenstrup2018', 'kind': M},
  {'v': 'ski-suit on snow μ 0.19–0.48 → sliding decel ≈ 2–5 m/s² minus slope component', 'src': 'lubricants2016', 'kind': M + ' (μ) / ' + I + ' (decel)'},
  {'v': 'NO measured whole-body crash deceleration/duration found', 'src': None, 'kind': 'GAP'}],
 'wind': [
  {'v': 'G(3 s/600 s) at 10 m: in-land 1.66, off-land 1.52, off-sea 1.38, at-sea 1.23 (SD≈0.1); G = 1 + g·Iu; Iu ≈ 1/ln(z/z0)', 'src': 'wmo2010', 'kind': M},
  {'v': 'snow z0 0.0002–0.005 m → Iu 0.11–0.15 at 2–10 m, G3s 1.3–1.45 over flat snow', 'src': 'wmo2010', 'kind': I},
  {'v': 'Kaimal Lu = 8.1·0.7z → 28 m at z = 5 m', 'src': 'iec61400', 'kind': M + ' (standard)'},
  {'v': 'ropeway crosswind limit 14–18 m/s', 'src': 'tuwienLift', 'kind': M},
  {'v': 'NO measured Iu on steep alpine ski slopes retrieved (TEAMx data pending)', 'src': None, 'kind': 'GAP'}],
 'devices': [
  {'v': 'HoverAir X1 PRO/PROMAX 191.5/192.5 g, auto-follow 11.7 m/s, wind Level 5 (10.7 m/s), 16 min', 'src': 'hoverair', 'kind': 'SPEC'},
  {'v': 'DJI Neo 135 g, follow 6–8 m/s, wind 8 m/s, 18 min, −10…40 °C', 'src': 'djiNeo', 'kind': 'SPEC'},
  {'v': 'DJI Flip <249 g, tracking 12 m/s, wind 10.7 m/s, 31 min, −10…40 °C', 'src': 'djiFlip', 'kind': 'SPEC'},
  {'v': 'Insta360 X4 203 g, 8K30 (7680×3840) 75 min, 5.7K30 135 min, −20…40 °C; X5 200 g 8K30 88–93 min', 'src': 'insta360x4', 'kind': 'SPEC'},
  {'v': 'Li-ion at −10 °C: plan 60–85 % of rated capacity', 'src': 'battCold', 'kind': I},
  {'v': 'no maker publishes FlowState gyro range / max stabilisable rate / rolling-shutter time', 'src': None, 'kind': 'GAP'}],
 'material': [
  {'v': 'T700S fibre 4900 MPa, 230 GPa, 2.1 %, 1.80 g/cm³; UD 60 % Vf 2860 MPa, 134 GPa, 2.0 %', 'src': 'torayT700', 'kind': 'SPEC'},
  {'v': 'woven CFRP tape spring R 12.5 mm, t 0.65 mm', 'src': 'fleckTape', 'kind': M},
  {'v': '−20 °C benign for fibre-dominated properties; thermal-cycling matrix microcracking is the risk', 'src': 'torayT700', 'kind': I}],
}
sk = L('skier_stats.json'); wi = L('wind_stats.json'); tr = L('trunk_stats.json')
pick = lambda k: {x: sk[k][x] for x in ['speed_ms', 'turn_s', 'apexLat_g', 'apexRadius_m', 'apexLean_deg', 'loadFactor_bw']}
styles = {
 'recreational_carve': {'params': {'style': 'carve', 'slopeDeg': 15, 'vTarget': 12, 'v0': 12, 'turnPeriod': 2.9, 'turnAmpDeg': 45, 'mu': 0.05, 'CdA': 0.5},
   'targets': 'turn 2.97 s (martinez2019), mean speed 12.4–13.4 m/s (ettlinger2005, brunner2015), peak GRF 1.61–1.68 BW intermediates (nakazato2011)', 'model': pick('proposed_recreational_carve')},
 'expert_carve': {'params': {'style': 'carve', 'slopeDeg': 20, 'vTarget': 13, 'v0': 13, 'turnPeriod': 2.9, 'turnAmpDeg': 50, 'mu': 0.05, 'CdA': 0.5},
   'targets': 'turn 2.97 s, speed 13.3–13.9 m/s (supej2018, klous2014), peak GRF 1.76–1.93 BW (nakazato2011, supej2018)', 'model': pick('proposed_expert_carve')},
 'short_turns': {'params': {'style': 'short', 'slopeDeg': 15, 'vTarget': 8, 'v0': 8, 'turnPeriod': 2.3, 'turnAmpDeg': 40, 'mu': 0.05, 'CdA': 0.5},
   'targets': 'turn 1.04 s (martinez2019; the model multiplies turnPeriod by 0.45 for short), peak GRF 1.89–2.05 BW (supej2018, nakazato2011); speed 8–10 m/s is INFERENCE (no measured short-swing speed found)', 'model': pick('proposed_short')},
 'moguls_recreational': {'params': {'style': 'short', 'slopeDeg': 24, 'vTarget': 4.5, 'v0': 5, 'turnPeriod': 2.3, 'turnAmpDeg': 30, 'mu': 0.08, 'CdA': 0.5},
   'targets': 'one turn per bump at ≈3.5 m spacing (fisMogul) → ~1 s/turn; speed 5–7 m/s INFERENCE; resulting bump rate v/λ ≈ 2 Hz', 'model': pick('proposed_moguls')},
 'gs_racer_reference': {'params': {'style': 'carve', 'slopeDeg': 24, 'vTarget': 16.5, 'v0': 16, 'turnPeriod': 1.45, 'turnAmpDeg': 30, 'mu': 0.03, 'CdA': 0.35},
   'targets': 'GS 17.75 m/s (gilgien2015), 1.45 s/turn (sporri2016), GRF ~2.5–2.9 BW force-plate equivalent', 'model': pick('proposed_gs_racer')},
}
code = open(os.path.join(H, 'trunk_model.mjs')).read()
proposal = {
 'id': 'CAL-2026-10-18', 'task': 'SIM-030', 'status': 'proposal — literature-calibrated, not physically verified (M-070 not_run)',
 'evidenceKinds': {'MEASURED': 'value reported in the cited study', 'SPEC': 'manufacturer/standard specification', 'INFERENCE': 'derived by this calibration, not measured', 'GAP': 'no measured value found'},
 'sources': src, 'literature': lit,
 'currentModelDeviations': {
  'skier': [
   'turnPeriod is the duration of ONE turn (edge change to edge change). Default 4.5 s gives 0.22 turns/s vs measured 2.97±0.43 s for long carving (martinez2019): turns ~50 % too long.',
   "style 'short' (0.45×4.5 = 2.0 s/turn at 13 m/s) vs measured 1.04 s/turn; short turns are also run at long-turn speed.",
   'Default apex lateral acceleration 0.54 g, lean 28°, quasi-static load peak 1.14 BW vs measured GRF peaks 1.6–2.05 BW (implying ~1.2–1.6 g, 50–57° inclination): turn loads and lean are ~half of reality. Concept scenarios (boom moguls case 0.34 g / 1.03 BW, demo 0.47 g) are even gentler.',
   'Speed is constant within ±1 % (p05≈p95); mean settles ≈1–2.5 m/s ABOVE vTarget because the skid controller is proportional only (gain 1.2 s⁻¹). Default mean 13.2 m/s is consistent with recreational radar means (12.4–13.4 m/s) but there is no population spread (SD 4 m/s measured) and no p95 case (17–20 m/s, INFERENCE).',
   'skierAt() has no trunk pitch/roll/yaw oscillation and no vertical snow excitation; lean is whole-body. Each concept adds its own (boom360: ±4° pitch at v/λ, rough 1.2 m/s² hip RMS 1–30 Hz).'],
  'trunkAndVibration': [
   'boom360 rough 1.2 m/s² (default) / 2.0 (mogul scenario) hip RMS is LOW against measured weighted RMS 9.4–11.1 m/s² at the sacrum (racers, sporri2017) and 9.7/12.9 m/s² at the boot (instructors carve/short, supej2018). Proposed recreational vertical trunk RMS ≈ 2.6–2.7 m/s² groomed, ≈4.3 icy, ≈3.7 moguls (INFERENCE: scaled down for speed, softer snow, single axis; still below the racer figures).',
   'boom360 roughness shape (∝f² up to 6 Hz, 1–30 Hz) misses the measured 4–10 Hz spine-resonance peak and the 15–25 Hz chatter band; replace with the two-band shape in trunkModel.',
   'boom360 mogul pitch ±4° at 1.8 Hz (>1 Hz rate RMS ≈32 °/s) and 0.5 g bumps: same order as the proposal (±6°, ≈2 Hz at 3.5 m spacing, >1 Hz pitch-rate RMS ≈52 °/s, 4.5 m/s² bumps), but the amplitude is unmeasured for both (GAP). Bump wavelength 5 m in boom360 vs ≈3.5 m measured course spacing.'],
  'wind': [
   'Realised Iu equals the requested intensity; σv/σu 0.8 and σw/σu 0.5 match standard ratios; PSD slope −1.56 vs −5/3 Kolmogorov: OK; Lu 30 m matches IEC Kaimal 28 m at z = 5 m.',
   'Gust factor G3s: model 1.30 (Iu 0.15), 1.38 (0.2), 1.49 (0.25), 1.55 (0.3) → peak factor g ≈ 1.9–2.0 vs WMO in-land 1.66 at Iu 0.25 (g ≈ 2.6). Model underestimates gust peaks ~25 % at a given Iu (24-mode sum-of-sines, lowest mode 0.02 Hz).',
   'For U < 2 m/s the model floors σ at Iu·2 m/s (Iu realised 0.30 at U = 1): acceptable for calm-with-puffs but label it.',
   'No Taylor advection: a skier moving 12 m/s into a 5 m/s wind sees the same >1 Hz share (6.2 %) as a fixed point; frozen turbulence would raise it ~2.3× (INFERENCE). The spatial phase term 0.01·φ rad/m is frequency-independent.']},
 'skier': {'styles': styles,
   'populationSpeed': {'meanKmh': 48.2, 'sdKmh': 14.3, 'src': 'brunner2015', 'note': 'draw vTarget ≈ N(12.2, 3.5) m/s clipped 5–20 to cover the population; model mean ≈ vTarget+1 m/s (INFERENCE)'},
   'mu': {'value': 0.05, 'range': [0.03, 0.1], 'src': 'Kuroiwa ski–snow friction via search snippet', 'kind': 'MEASURED (range), snippet only'},
   'CdA': {'value': 0.5, 'range': [0.35, 0.7], 'src': None, 'kind': 'INFERENCE — not verified in this pass; keep ASSUMED'},
   'modelChanges': ['add a PI speed controller or document vTarget ≈ desired mean − 1 m/s', 'add within-turn speed modulation (skid at apex) — not quantified in retrieved sources'],
   'fall': {'slidingDecel_ms2': [2, 5], 'kind': 'INFERENCE from suit–snow μ 0.19–0.48 (lubricants2016)', 'headImpactNormal_ms': {'mean': 8.1, 'range': [1.9, 12.1], 'src': 'steenstrup2018', 'note': 'World Cup; recreational lower (GAP)'}, 'current': 'model uses 4–6 m/s² sliding: within the inferred range'}},
 'trunkModel': {
   'outputs': {'pitch': 'rad, flexion oscillation about the crouch mean', 'roll': 'rad, angulation (trunk inclination = lean − roll) + sway', 'yaw': 'rad, trunk vs travel heading (counter-rotation)', 'zAcc': 'm/s², trunk-up acceleration, zero mean'},
   'params': {
     'angulation': {'carve': '0.2×lean capped 14°', 'short': '0.15×lean capped 10°', 'src': 'sporri2016 lateral bending 6–14°', 'kind': 'MEASURED range, INFERENCE mapping'},
     'turnPitch': {'carve': '±5° once per turn', 'short': '±7°', 'src': 'sporri2016 mean flexion 11–27° (posture only)', 'kind': 'INFERENCE (GAP for amplitude)'},
     'yaw': {'carve': '−0.25ψ capped 12°', 'short': '−0.6ψ capped 25°', 'src': 'sporri2016 torsion 5–9° (trunk vs pelvis)', 'kind': 'MEASURED trunk–pelvis; trunk–ski counter-rotation INFERENCE'},
     'randomRotation': {'pitchRmsDeg': {'groomed': 1.0, 'icy': 1.5, 'moguls': 2.0}, 'rollRmsDeg': {'groomed': 0.8, 'icy': 1.0, 'moguls': 1.5}, 'band': '0.5–4 Hz, PSD ∝ f⁻²', 'kind': 'INFERENCE'},
     'vertical': {'bands': {'body': '2–10 Hz centred 5.5 Hz (spine resonance 4–10 Hz)', 'chatter': '10–30 Hz centred 18 Hz (ski chatter 15–25 Hz)'}, 'bandSrc': ['sporri2017', 'supej2018'], 'rmsAt13ms': {'groomed': {'body': 2.5, 'chatter': 1.0}, 'icy': {'body': 3.0, 'chatter': 3.0}, 'moguls': {'body': 2.5, 'chatter': 1.0}}, 'styleFactor': {'carve': 1.0, 'short': 1.33, 'straight': 0.3, 'src': 'supej2018 ratios 12.9/9.7, 2.6/9.7'}, 'speedScaling': 'linear in v/13, capped 1.6 (INFERENCE)', 'kind': 'bands MEASURED; levels INFERENCE scaled below measured 9.4–12.9 m/s² weighted RMS'},
     'moguls': {'lambda_m': 3.5, 'lambdaVar': 0.15, 'zAmp_ms2': 4.5, 'pitchAmpDeg': 6, 'pitchLagRad': 0.8, 'rollAmpDeg': 3, 'src': 'fisMogul (spacing); knee 50–60°/turn (mogulKnee2007)', 'kind': 'spacing MEASURED; amplitudes INFERENCE (GAP)'}},
   'resultingStats': tr,
   'dropInJs': code,
   'integration': "copy makeTrunk/trunkAt/TRUNK_PARAMS into sim/js/concepts/common/skier.js (replace the skierAt import; use mulberry32 from ../../model/util.js); call trunkAt(sk, t, {terrain:'groomed'|'icy'|'moguls', moguls:[t0,t1], seed}). Rerun npm test and npm run gen-reference."},
 'wind': {
   'defaults': {'Lu_m': 28, 'IuFlatSnow': [0.11, 0.15], 'IuSlopeDefault': 0.2, 'IuStress': 0.3, 'meanEnvelope_ms': [0, 9], 'liftHold_ms': [14, 18],
     'kinds': 'Lu, Iu flat snow from IEC/WMO formulas (standard + INFERENCE for snow z0); 0.2/0.3 for complex slopes INFERENCE (GAP: no steep-slope Iu retrieved); envelope 0–9 m/s is a design choice below lift holds'},
   'gustFactorTargets': {'G3s_600s': {'flatSnow': [1.3, 1.45], 'complexTerrain': [1.5, 1.66]}, 'src': 'wmo2010'},
   'modelChanges': ['raise mode count (≥48, ratio ≈1.13, lowest 0.005 Hz) or add a peak-factor check so G3s ≈ 1 + 2.6·Iu', 'replace spatial phase with Taylor advection: phase k·(x·ê_U) with k = ω/U so moving platforms see Doppler-shifted gusts'],
   'measured': wi},
 'devices': {
   'insta360': {'equiW': 7680, 'fps8K': 30, 'equiW_5p7K': 5760, 'massG': 200, 'opTempC': [-20, 40], 'src': 'insta360x4', 'note': 'boom360 equiW 5760 (5.7K) is conservative; 8K only at 30 fps'},
   'hoverairX1ProMax': {'massG': 192.5, 'followMs': 11.7, 'windMs': 10.7, 'flightMin': 16, 'src': 'hoverair', 'note': 'follow speed < p95 recreational speed (17–20 m/s INFERENCE) and below carving 13–14 m/s at times'},
   'djiFlip': {'massG': 249, 'trackMs': 12, 'windMs': 10.7, 'flightMin': 31, 'opTempC': [-10, 40], 'src': 'djiFlip'},
   'djiNeo': {'massG': 135, 'followMs': 8, 'windMs': 8, 'flightMin': 18, 'opTempC': [-10, 40], 'src': 'djiNeo'},
   'liIonColdFactor_m10C': [0.6, 0.85], 'liIonColdSrc': 'battCold (INFERENCE range)'},
 'materials': {'CFRP_UD_T700': {'E_GPa': 134, 'strength_MPa': 2860, 'failStrain': 0.020, 'density': 1.55, 'src': 'torayT700', 'note': 'composite density 1.55 is INFERENCE (60 % Vf)'}, 'tapeSpringExample': {'R_mm': 12.5, 't_mm': 0.65, 'src': 'fleckTape'}},
 'criteriaReview': {
   'jitterRms_3degps': {'verdict': 'UNSUPPORTED (no published video shake watchability threshold found)', 'evidence': 'CIPA DC-X011 covers stills; NASA cybersickness onset for constant rotation ≈0.415 rad/s ≈ 24 °/s (nasaSickness, VR not video); smooth-pursuit ~40 °/s', 'recommendation': 'keep 3 °/s as ASSUMED design target, label it as such, report also 10 °/s as a secondary "degraded" line; schedule a viewer test. Note the proposed trunk model gives 6–12 °/s (groomed/icy) and ~52 °/s (moguls) >1 Hz trunk rate: a body mount must reject 70–95 % on groomed and ~95 % in moguls.'},
   'addedMass_1p5kg': {'verdict': 'supported as product target, not a tolerance limit', 'evidence': '1.5 kg = 1.9 % BW (80 kg) vs carriage guidance 10–15 % BW (popular) and military 30 % BW (militaryLoad)', 'recommendation': 'keep; label as convenience target'},
   'bodyForcePeak_40N': {'verdict': 'UNSUPPORTED (no wearer jerk/impulse tolerance source found)', 'evidence': 'context only: turn GRF fluctuates 1.2–2 BW ≈ 950–1600 N (nakazato2011); 40 N ≈ 3–5 % of that', 'recommendation': 'keep as ASSUMED; better to express as a fraction of BW and as an overturning moment about the CoM'},
   'keMax_14p9J': {'verdict': 'supported as conservative reference', 'evidence': 'FAA §107.120 Cat 2 = 11 ft-lb (14.9 J) transferred from a rigid object; Cat 3 = 25 ft-lb (33.9 J); Cat 1 = 0.55 lb; ASTM F3389 Method A < 73 J; EASA C0 < 250 g (no J), C1 < 900 g or < 80 J', 'recommendation': 'keep 14.9 J; note it is a transferred-energy limit so applying it to KE is conservative; 80 J kill line comes from fragment-injury data (sust80J) — label as regulatory class boundary, not injury threshold; also add Cat 1 mass check (≤250 g, no exposed rotors)'},
   'endurance_45min': {'verdict': 'user-goal target; device data show drones fail it per pack', 'evidence': 'HoverAir 16 min, Flip 31 min, Neo 18 min at room temperature; Li-ion 60–85 % at −10 °C; Insta360 X4 75 min 8K30 at room temperature', 'recommendation': 'keep; note baseline/index.js hard-codes 90 min with a "≥30 min (assumed)" label inconsistent with the shared 45 min'},
   'pxMed_300px': {'verdict': 'geometry target, not literature', 'evidence': '8K equirect = 21.3 px/° → 1.75 m skier at 5 m ≈ 20° ≈ 430 px; 5.7K = 16 px/° ≈ 320 px', 'recommendation': 'keep'},
   'setupTime/handsBusy/ops/azRange/avail': {'verdict': 'user-goal targets; no literature basis expected', 'recommendation': 'keep as ASSUMED'}},
 'scripts': ['compare_skier.mjs → skier_stats.json', 'compare_wind.mjs → wind_stats.json', 'trunk_model.mjs (drop-in)', 'compare_trunk.mjs → trunk_stats.json', 'tune_scan.mjs (parameter scan)', 'build_proposal.py → proposal.json'],
}
json.dump(proposal, open(os.path.join(H, 'proposal.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', os.path.getsize(os.path.join(H, 'proposal.json')))
