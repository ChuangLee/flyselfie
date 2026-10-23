# Builds audit2/kite2/part.json from out_recheck*.json (auditor's own runs on a copy) + dev/kite2/results.json (claims).
import json, os
H = os.path.dirname(os.path.abspath(__file__))
DEV = os.path.join(H, '../../dev/kite2/results.json')
R = json.load(open(DEV)); spot = json.load(open(os.path.join(H, 'out_recheck.json')))
ALL = json.load(open(os.path.join(H, 'out_recheck_all.json')))['allIndependent']
SENS = json.load(open(os.path.join(H, 'out_recheck_sens.json')))['sens']
E = R['ensemble']['metrics']; fr = R['scenarios']['fullrun']['std12']; bsb = R['ensemble']['bySpeedBin']
part = {
 'conceptId': 'kite2', 'modelVersion': R['modelVersion'], 'auditor': 'audit2 (round 2, iteration 2), independent re-audit', 'generated': '2026-10-20',
 'evidence': 'numerical-uncalibrated simulation re-run on a copy of sim/ + literature/web checks; nothing physical tested',
 'scripts': ['audit2/kite2/recheck.mjs (spot, --all, --sens)', 'audit2/kite2/make_part.py'],
 'reproduction': {
  'fullEnsembleRerun': {'matchesClaimed': True, 'cases': 39, 'maxAbsDiff': spot['rerun']['maxAbsDiff'], 'diffs': spot['rerun']['diffs'],
                        'note': 'evaluateCase on the copy reproduces dev/kite2/ensemble_rows.json to <0.001 in every judged column'},
  'spotCases': [{'id': s['id'], 'U': s['U'], 'dir': s['dir'], 'claimed': s['claimed'], 'recomputed': s['recomputed'], 'footageStability': s['footageStability']} for s in spot['spot']],
  'allCasesIndependent': {k: v for k, v in ALL.items() if k != 'rows'},
  'independentMethod': 'avail = filming ∧ inFrame ∧ ≥300 px ∧ artefact<3 % over fullrun col.riding from t=0 (developer: speed>2 m/s and t≥2 s); KE = kite KE, ground frame if >1.5 m from any body capsule else rider frame, every non-docked sample incl. stow; F = 50 ms trapezoid mean of the 20 ms tension samples, plus the raw sub-sample max reported separately; ops = arm tap + manual stow/give-up/pick-up (give-up + its pick-up = 1) + stow taps + losses; setup = 2 s arm + wait to stowed at every stop beyond the rest + 15 s per manual action; endurance = enduranceMin(12+1.2 Wh, Pk/0.9+Pw+0.6 W, heated) with and without winch-regeneration credit; footageStability(R) on the fullrun Result.',
 },
}
def m(stat, claimed, rec, passed, note=''):
    return {'stat': stat, 'claimed': claimed, 'recomputed': rec, 'pass': passed, 'note': note}
part['metrics12'] = {
 'avail': m('mean of 39', E['avail']['mean'], ALL['availRidingMean'], ALL['availRidingMean'] >= 80, 'recomputed over fullrun riding time from push-off (dev excludes t<2 s and v≤2 m/s: +2.8 pp). p10 80.8 %. Conditional on the custom 60° optic: 90° HFOV → 53–63 % per case, 120° → ≈2 % (auditor run).'),
 'pxMed': m('mean of case medians', E['pxMed']['mean'], 'not recomputed (geometry reproduced via rerun)', True, 'only with a custom 60° HFOV 4K optic (ASSUMED part); 90° lens → 326–346 px'),
 'jitterRms': m('p90 / mean', E['jitterRms']['p90'], {'footageStability_subject_range': [0.44, 1.94], 'background_range': [0.8, 1.71]}, True, 'pod pendulum lag + 0.4° flutter are ASSUMED; no canopy breathing/coning (round canopies oscillate ±5–15° without slots/vents) — optimistic'),
 'azRange': m('fullrun case', fr['azRange']['value'], None, True, 'side swap by differential slots; steering authority of a reefed round canopy unverified'),
 'addedMass': m('worn', fr['addedMass']['value'], 0.50, True, 'pod 0.12 + winch 0.07 + 80 g pack + kite 86 g, margin on pod items'),
 'bodyForcePeak': m('max of 39', E['bodyForcePeak']['max'], {'F50_trapezoid_max': ALL['F50max'], 'rawSubSampleTensionMax': ALL['tensionRawMax'], 'casesRawOver40N': len(ALL['casesRawOver40N'])}, None,
   'PASS as modelled (30.4 N) but not robust: 12/39 cases have 56–68 N sub-sample snatches when a canopy towed on the snow at ≈13 m/s re-inflates UNREEFED (relift) or launches unreefed; the 0.4×Tmax rule assumes the spike lasts ≤20 ms. Opening-shock estimate (q≈85 Pa×0.4 m²×CR 0.8≈27 N steady, infinite-mass Ck 1.5–2 → 41–55 N over ≈0.1–0.3 s fill time) says the 50 ms mean can exceed 40 N → treat as UNPROVEN'),
 'handsBusy': m('fullrun', 0, 0, True, 'all actions while stopped'),
 'setupTime': m('p90 of 39', E['setupTime']['p90'], ALL['setupP90'], ALL['setupP90'] <= 30, 'reproduced (+0.04 s). Depends on the 120° funnel acceptance: 90° → p90 37.7 s FAIL, 60° → 52.0 s FAIL'),
 'ops': m('p90 (max)', f"{E['ops']['p90']} (max {E['ops']['max']})", f"{ALL['opsP90']} (max {ALL['opsMax']}, {ALL['opsShareAbove2']} % of runs >2)", True, 'passes on p90; fails if judged on max (3 in 3/39 runs). Funnel 90° → p90 3 FAIL'),
 'keMax': m('max of 39', E['keMax']['max'], ALL['keMax'], ALL['keMax'] <= 14.9, 'reproduced; margin 0.17 J (1.2 %). Fails at L/D 0.95 (15.6 J), 0.90 (16.6 J), 0.85 (19.4 J), 0.75 (19.7 J), mass +15 % (17.3 J); fast scenario 16.8 J'),
 'packVol': m('design', fr['packVol']['value'], None, True, '210×110×100 mm ASSUMED layout incl. mast, winch, canopy sleeve'),
 'endurance': m('mean of 39', E['endurance']['mean'], {'withRegen': ALL['enduranceMean'], 'noRegenCredit': ALL['enduranceNoRegenMean']}, True, 'heated charging counted; kite cell 1.2 Wh = 10.5 min per sortie (dock recharge required)'),
}
part['envelope'] = {'def': 'rider ≤≈14.6 m/s (auto-dock above), any wind 0–9 m/s except tailwinds ≥6 m/s; low-traffic pistes only (line 0.9–1.5 m above snow 1 m behind)',
  'availClaimed': 'not separately claimed; head/cross 88–96 %', 'availRecomputed': {'head': ALL['byDir']['head'], 'crossL': ALL['byDir']['crossL'], 'crossR': ALL['byDir']['crossR'], 'calm': ALL['byDir']['calm'], 'tail': ALL['byDir']['tail']}}
part['byWindAvail'] = {f'U{U}': {'claimed': bsb[str(U)]['avail']['mean'], 'recomputed': ALL['byU'][f'U{U}']['availRiding']} for U in [0, 3, 6, 9]}
part['massBudget'] = {'claimed_g': 86.3, 'rebuilt_g': 78.0, 'withMargin_g': 89.7,
  'note': 'developer: 16 cam + 10 avionics + 3×4 servo-winch + 5 wiring + 8 cell(1.2 Wh) + 14.0 canopy (0.40 m²×1.3×27 g/m²) + 6 KCU/arm/funnel cone + 4 lines = 75.0 g ×1.15 = 86.3 g (arithmetic correct, components.js used, 4 g servos justified). Auditor adds 3 g for slot frames/reefing rings/dousing line/hi-vis flag hardware the list omits → 78 g ×1.15 = 89.7 g. The KE gate has only 1.2 % margin and vMaxFilm is fixed from the 86.3 g budget, so +4 % mass already needs a lower speed cap (mass +15 % → KE 17.3 J FAIL). No vision compute: framing is post-run from line/UWB geometry (consistent with design).'}
part['physics'] = [
 {'assumption': 'Slotted round canopy glides at L/D 1.0 at full slot opening (gMaxR default 1.0) at 0.71 m diameter with a camera pod',
  'devClaim': 'passes if L/D ≥≈0.9; fails at 0.75 (KE 19.7 J)',
  'evidence': 'MC1-1C: 8 kt forward / 18 ft/s descent → L/D ≈0.75. MC-6 (SF-10A canopy): ≈10 kt forward at ≈14–18 ft/s → 0.9–1.2, but descent figures are forum/press level. Both are 10–11 m canopies with a man-sized payload; Reynolds number at 0.7 m is ≈15× lower and the pod/KCU adds non-lifting drag. Auditor ensembles: gMaxR 0.90 → KE 16.6 J FAIL, 0.95 → 15.6 J FAIL; only ≥1.0 passes (14.73 J).',
  'sources': ['https://www.millsmanufacturing.com/products/mc1-1c-1d-parachute/', 'https://stripes.com/migration/special-forces-look-to-smoke-jumpers-for-new-parachutes-1.101901', 'https://en.wikipedia.org/wiki/MC-6_parachute', 'https://armyranger.com/bb/viewtopic.php?p=422741'],
  'verdict': 'optimistic', 'killTest': 'tow-tank/car-top tow of the 0.7 m canopy + pod at 4–15 m/s: measured L/D vs slot opening; kill if max L/D <1.0 (unreefed) or the developer claim threshold 0.9 is used (fails KE in the model)'},
 {'assumption': 'Glide retained when reefed to 25–30 % drag area (reefGloss 0.3 → 70 % kept); filming operating point is reefed ≈0.29',
  'devClaim': 'ASSUMED; reefGloss 0.6 → KE 17.5 J fail',
  'evidence': 'No data found for gliding reefed round canopies; a skirt-reefed canopy is an elongated, partly closed shape whose slots near the skirt are gathered; reefed canopies are known for reduced stability. The pass requires L/D≈0.7 in this reefed state.',
  'sources': ['https://ntrs.nasa.gov/api/citations/20090033119/downloads/20090033119.pdf'], 'verdict': 'not credible until shown (no precedent)', 'killTest': 'same tow rig at reef 0.25/0.35/0.5: kill if reefed L/D <0.6 or coning >10°'},
 {'assumption': 'Steering (azimuth/side swap) by differential slot opening on a reefed 0.7 m canopy',
  'devClaim': 'psi via differential slots; az range 62°',
  'evidence': 'MC-1-1C/MC-6 steer via toggles opening rear slots, 360° in 5–9 s at full size; scaled time constant faster, but authority when reefed unknown.', 'sources': ['https://www.millsmanufacturing.com/products/mc1-1c-1d-parachute/'], 'verdict': 'optimistic', 'killTest': 'tow test: azimuth step response ≥20° within 2 s at reef 0.3'},
 {'assumption': 'Continuous servo reefing 1↔0.25 drag area with a 4 g servo-winch',
  'devClaim': 'tauReef 0.25 s; 0.15 W',
  'evidence': 'Existing variable-drag/disreef devices are passive (US 5,248,117 regulated drag area; US 7,416,158 continuous disreefing); actuated spiral reefing (US 3,642,237) was criticised for tangling. Reefing-line load is a fraction of canopy load (≈2–10 N here) plus ring friction, near a 4 g servo stall at −10 °C; repeated reef/disreef cycling at 4 Hz bandwidth is unprecedented.',
  'sources': ['https://patents.google.com/patent/US7416158', 'https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5248117', 'https://patents.google.com/patent/US7028951'], 'verdict': 'unknown (no precedent)', 'killTest': '1000-cycle bench + tow test of reef 1→0.25→1 under 20 N canopy load at −10 °C with 0.25 s time constant; kill if jams/tangles >1 %'},
 {'assumption': 'Inflation in 0.6 s regardless of dynamic pressure; launch out of the body wake from a 0.35 m mast; re-lift of a towed canopy',
  'devClaim': 'launch at ≥3.5–4 m/s apparent wind; landed canopy relifts after 0.7 s at ≥5 m/s',
  'evidence': 'Canopy loading 0.86 N/0.4 m² ≈2 Pa vs q 8 Pa at 4 m/s → flight possible; but inflation (filling distance ≈4–8 D0 → 0.2–1.4 s) is speed-dependent and the model ignores it. Launches and relifts are UNREEFED, so at 12–13 m/s the opening load is ≈27 N steady ×Ck 1.5–2. The ensemble has 30 landings/15 relifts in 10/39 runs with the canopy dragged over snow at rider speed.',
  'sources': ['https://ntrs.nasa.gov/api/citations/20170003949/downloads/20170003949.pdf'], 'verdict': 'optimistic', 'killTest': '200 launches from the mast behind a moving skier at 4–14 m/s incl. turbulence: kill if success <98 % or 50 ms peak pull >40 N'},
 {'assumption': 'Docking: KCU slides down the line into a mast-tip trumpet accepting ≤120° off-axis; canopy doused into a sleeve',
  'devClaim': 'auto-dock at stops, manual push-in 15 s otherwise',
  'evidence': 'Load-bearing: auditor ensembles with 90° acceptance → setup p90 37.7 s, ops p90 3 (FAIL); 60° → 52 s FAIL. No small-kite precedent; SkySails-class launch/recovery masts are large engineered systems. Wet/iced fabric, line twist and lines catching on the funnel lip are not modelled.',
  'sources': [], 'verdict': 'optimistic', 'killTest': '500 dock cycles (wet/iced, 0–9 m/s gusts): kill if hands-free success <90 % or any acceptance cone <90° needed'},
 {'assumption': 'Camera: 16 g 4K module with a custom 60° HFOV rectilinear optic',
  'devClaim': 'pxMed 510 px',
  'evidence': 'Auditor: 90° HFOV → avail 53–63 %, px 326–346; 120° → avail ≈2 %. M12 narrow lenses exist, so buildable, but it is not the stock RunCam Thumb Pro lens of components.js cam4k.', 'sources': ['https://www.getfpv.com/runcam-thumb-pro-4k-hd-action-camera.html'], 'verdict': 'credible with a sourced M12 module', 'killTest': 'buy/spec a ≤20 g 4K M12 module with 55–65° HFOV'},
]
part['definitionChecks'] = [
 {'metric': 'avail', 'issue': 'denominator = samples with rider speed >2 m/s and t ≥2 s (settle) instead of fullrun col.riding from push-off; launch time during the first metres is excluded', 'favours': 'kite2 by +2.8 pp (88.0 → 85.2 %); still passes. Check that every concept uses the same denominator.'},
 {'metric': 'setupTime', 'issue': 'only the last stop counted; mid-run rest counted 0. Auditor recount (all stops, wait beyond the rest) gives the same values because the kite docks within the 20 s rest; 15 s per manual action counted even when inside the rest (conservative).', 'favours': 'neutral'},
 {'metric': 'ops', 'issue': 'judged on p90 (2); max 3 in 3/39 runs. Brief asks p90 and max; criteria threshold ≤2 per run.', 'favours': 'kite2 if other concepts are judged on max'},
 {'metric': 'bodyForcePeak', 'issue': '50 ms mean is computed on the 20 ms grid with 0.4×(sub-sample max) as a spike bound; this caps a 68 N relift snatch at 27 N. No opening-shock model.', 'favours': 'kite2 (force likely under-read in relift/launch at speed)'},
 {'metric': 'keMax', 'issue': 'DOCKED and STOW samples excluded; auditor including STOW finds no change. KE gate held by a speed cap computed from the budget mass, not from the param mass.', 'favours': 'neutral (but knife-edge)'},
 {'metric': 'endurance', 'issue': 'mean power includes negative winch power (regeneration credit ≈6 min); heated charging counted per components.js', 'favours': 'kite2 slightly (85.4 vs 79.5 min without regen); passes either way'},
 {'metric': 'concept gates', 'issue': 'viewElev gate relaxed 50°→55° by the developer; lineH1m ≥2.0 m concept gate fails in every ensemble run (min 0.91–1.52 m) and is not part of the 12 judged metrics', 'favours': 'kite2 (safety gate failure not visible in the 12-metric table)'},
]
part['findings'] = [
 {'id': 'A2-K2-01', 'severity': 'major', 'title': 'Pass threshold on canopy L/D is ≥1.0, not ≥≈0.9 as claimed',
  'detail': 'Auditor full ensembles: gMaxR 0.90 → KE 16.6 J, 0.95 → 15.6 J (FAIL); default 1.0 → 14.73 J (margin 0.17 J). Combined with reefed-glide retention 70 % (ASSUMED) and mass ≤86 g, the pass is knife-edge on three unmeasured numbers; the documented small-canopy evidence (MC1-1C) is 0.75.',
  'evidence': 'audit2/kite2/out_recheck_sens.json; dev results.json sensitivity'},
 {'id': 'A2-K2-02', 'severity': 'major', 'title': 'Dock-funnel acceptance of 120° off-axis is load-bearing for setupTime and ops',
  'detail': '90° acceptance → setup p90 37.7 s and ops p90 3 (FAIL); 60° → 52 s. Soft-canopy docking into a funnel has no precedent at this scale; wet/iced canopy and line twist not modelled.', 'evidence': 'out_recheck_sens.json funnelAcc_60/90'},
 {'id': 'A2-K2-03', 'severity': 'major', 'title': 'Canopy lands and is dragged over the snow at rider speed, then re-inflates unreefed (snatch)',
  'detail': '10/39 runs, 30 landings and 15 relifts (incl. all calm cases); sub-sample line snatches 56–68 N in 12/39 runs, reported as ≤27 N by the 0.4×Tmax rule. A canopy and line on the snow behind a 13 m/s skier is also a tripping/snag hazard for others. Fix: reef before launch/relift, never relift on snow (dock or give up) — then re-run avail.',
  'evidence': 'out_recheck_all.json casesRawOver40N, landedEventsTotal'},
 {'id': 'A2-K2-04', 'severity': 'major', 'title': 'Line 0.9–1.5 m above snow 1 m behind the rider in every ensemble run (own gate ≥2.0 m)',
  'detail': 'Clothesline hazard to following/crossing skiers; forced contact 16.6 N (gate ≤10 N). Not fixable by mast length (developer K2-04). Restricts use to empty pistes.', 'evidence': 'dev results.json ensemble lineH1min mean 1.25, min 0.91; crosspole neighbourForce 16.6 N'},
 {'id': 'A2-K2-05', 'severity': 'major', 'title': 'Continuous actuated reefing + glide while reefed has no precedent',
  'detail': 'Every filming sample sits at reef ≈0.29 with 70 % of the slot glide retained (ASSUMED). Existing devices are passive; reefGloss 0.6 already fails KE (17.5 J).', 'evidence': 'dev sensitivity reefGloss_0.6; patents US 5,248,117, US 7,416,158'},
 {'id': 'A2-K2-06', 'severity': 'minor', 'title': 'avail denominator excludes the first 2 s and v≤2 m/s (+2.8 pp)', 'detail': 'Recomputed over fullrun riding time: 85.2 % (claimed 88.0 %); still ≥80 %.', 'evidence': 'out_recheck_all.json'},
 {'id': 'A2-K2-07', 'severity': 'minor', 'title': 'ops max 3 (3/39 runs) and setup max 38.8 s', 'detail': 'Tail-wind 3–6 m/s cases need two manual push-ins; passes on p90 only.', 'evidence': 'ensemble rows tail3_s12, tail6_s12, tail6_s13'},
 {'id': 'A2-K2-08', 'severity': 'minor', 'title': 'Footage quality depends on an ASSUMED custom 60° optic', 'detail': '90° HFOV → avail 53–63 % per case.', 'evidence': 'auditor lens check (5 cases)'},
 {'id': 'A2-K2-09', 'severity': 'minor', 'title': 'Endurance includes winch regeneration credit', 'detail': '85.4 → 79.5 min without it; passes.', 'evidence': 'out_recheck_all.json'},
]
part['safetyRegulatory'] = [
 'Resort written permission is a hard gate: most resorts prohibit kites/tethered objects on pistes; the line at 0.9–1.5 m above snow behind the rider is a clothesline hazard (A2-K2-04).',
 'Canopy/line dragged on the snow at rider speed in 10/39 runs (A2-K2-03): trip/snag hazard to others; must be eliminated by design.',
 'KE 14.73 J vs 14.9 J line (FAA Part 107 Cat 2 reference) with 1.2 % margin; rider >14.6 m/s → 16.8 J during auto-dock.',
 'Lift interlock relies on an ASSUMED on-snow vibration signature for down-riding chairlifts.',
 'Kite at ≤7 m line, ≤≈10 m AGL: generally outside drone rules but subject to local kite/tethered-object rules near lifts and power lines.',
]
part['credibleEnvelope'] = 'Simulation-credible only for: empty or low-traffic piste with written permission, rider 8–14 m/s carving, wind 0–9 m/s head/cross or calm (tail ≥6 m/s degrades to 70–81 %), AND a canopy that tow-tests at L/D ≥1.0 unreefed with ≥70 % glide kept when reefed, a ≤86 g flying mass, and a dock that captures from ≥120° off-axis. Each of those is unmeasured; with MC1-1C-class glide (0.75) or a 90° funnel it fails.'
part['verdict'] = 'Reproduces exactly (39/39) and passes all judged metrics as modelled (independent avail 85.2 %, setup p90 24.0 s, ops p90 2/max 3, F 30.4 N, KE 14.73 J, endurance 85 min). But the pass is knife-edge and conditional: the stated L/D threshold is wrong (needs ≥1.0, not ≈0.9), docking acceptance and reefed glide are load-bearing and unprecedented, relift snatches are under-read, and the line height behind the rider is an unfixed bystander hazard. Rank as a high-risk research concept, not a credible usable product, until tow tests settle polar/reefing/docking.'
json.dump(part, open(os.path.join(H, 'part.json'), 'w'), ensure_ascii=False, indent=1)
print('ok')
