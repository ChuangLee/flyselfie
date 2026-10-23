#!/usr/bin/env python3
"""Audit4 kite2 part.json from the auditor's own re-runs (out_<tag>_all.json, built by aggregate.py from recheck.mjs).
Evidence level: numerical, uncalibrated simulation re-run on a copy of sim/; NOT physical verification."""
import json, os, math

HERE = os.path.dirname(os.path.abspath(__file__))
R4 = os.path.dirname(os.path.dirname(HERE))
load = lambda *p: json.load(open(os.path.join(*p), encoding='utf-8'))
B = load(HERE, 'out_base_all.json')['agg']
LD = load(HERE, 'out_LD060_all.json')['agg']
MS = load(HERE, 'out_mass115_all.json')['agg']
B6 = load(HERE, 'out_boom6_all.json')
LDM = load(HERE, 'out_LDmass_all.json')
dev = load(R4, 'dev', 'kite2', 'results.json')
DM = dev['ensemble']['metrics']
r = lambda v, k=3: round(v, k) if isinstance(v, (int, float)) else v


# ---- closed-form boom structure (auditor): carbon tube E 130 GPa (ASSUMED), density 1.6 g/cm3
def tube(od, t):
    di = od - 2 * t
    return math.pi / 64 * (od ** 4 - di ** 4), math.pi / 4 * (od ** 2 - di ** 2)


E, L, Fk = 130e3, 1450.0, 0.0897 * 9.81
struct = {}
for od, t in [(3.0, 0.25), (3.0, 0.5)]:
    I, A = tube(od, t)
    struct[f'OD{od}_t{t}'] = {'I_mm4': r(I), 'tubeMass_g': r(A * L * 1.6e-3, 1), 'eulerPinned_N': r(math.pi ** 2 * E * I / L ** 2, 2),
                              'tipDeflKCUhoriz_mm_linear': round(Fk * L ** 3 / (3 * E * I)), 'rootStressKCU_MPa': round(Fk * L * (od / 2) / I)}
need = {}
for lab, d in [('sag50mm', 50), ('sag200mm', 200)]:
    Ireq = Fk * math.cos(math.radians(40)) * L ** 3 / (3 * E * d)
    need[lab] = next(x / 10 for x in range(30, 300) if tube(x / 10, 0.5)[0] >= Ireq)
for P in (5, 14, 30):
    Ireq = P * L ** 2 / (math.pi ** 2 * E)
    need[f'euler_{P}N'] = next(x / 10 for x in range(30, 300) if tube(x / 10, 0.5)[0] >= Ireq)

T = lambda m, cl, rc, v, note, stat: {'stat': stat, 'claimed': cl, 'recomputed': rc, 'verdict': v, 'note': note}
m13 = {
    'avail': T('avail', 72.3, r(B['avail']['mean'], 2), 'fail',
               f"own bbox-rule recompute {B['avail']['mean']:.2f} % (dev silhouette-capsule variant {B['availCaps']['mean']:.2f} %, without any artefact {B['availNoArtefact']['mean']:.2f} %); p10 {B['avail']['p10']}; tail bins 24–69 % (all 18 tail cases {B['tailAvail']} %), non-tail 30 cases {B['nonTailAvail']} %; calm only {B['byDirAvail']['calm']} %. Boom over the rider in ≈{B['boomOverShare']['mean']:.0f} % of filming frames at median {B['boomWpxMedOver']['p50']} px (p99 {B['boomWpxP99Over']['p50']}, max {B['boomWpxMaxOver']['max']} px) — passes the ≥2 px rule only for a boom that cannot be built as specified (A4-K2-01): boom 6→5 mm → {B6['agg']['avail']['mean']:.1f} % (6 cases).",
               'ensemble mean (48), availMask riding time, refused runs 0'),
    'pxMed': T('pxMed', 504.92, r(B['pxMed']['mean'], 2), 'conditional', f"own footage().bodyPx; crop vfov median {B['vfMed']['p50']}°, never below the 1:1-native {B['vfMin']['min']}° (0 violations); needs an ASSUMED 16 g 4K module with a 45° HFOV M12 lens (hfov 60 → avail 67.7 %, dev)", 'mean of case medians (bodyPx)'),
    'jitterRms': T('jitterRms', 1.78, r(B['jitterSubject']['p90'], 3), 'pass', f"footageStability p90 over 47 flown cases, max {B['jitterSubject']['max']}; pod pendulum (ω 12 rad/s, ζ 0.45) and flutter 0.4° ASSUMED", 'p90 footageStability subjectRms'),
    'azRange': T('azRange', 55.74, r(B['dev']['azRange']['mean'], 2), 'pass', 'reproduced from the re-run judge (not independently re-derived); min 39.1° (one case below 45°)', 'mean of case p5–p95'),
    'addedMass': T('addedMass', 0.56, 0.56, 'pass', 'arithmetic verified: kite 89.7 g + (tether 4, pod 120, winch 85 [2205 30 + 5:1 planetary 12 + spool/drag/anti-reverse 20 + drag servo 4 + solenoid 6 + ESC 8], boom 40, radar 10, electronics 25, heater 5, 12 Wh 80, mount 40) ×1.15; reel motor + gearbox ARE included. A structurally adequate boom (A4-K2-01) adds ≈10–30 g — large margin to 1.5 kg', 'design'),
    'bodyForcePeak': T('bodyForcePeak', 29.83, r(B['F50']['max'], 2), 'pass', f"own 20 ms-grid 50 ms mean {B['F50grid20ms']['max']} N; mass +15 % → {MS['F50']['max']} N; L/D 0.6 + mass +15 % (8 cases) → {LDM['agg']['F50']['max']} N (fail)", 'max raw 50 ms mean'),
    'handsBusy': T('handsBusy', 0, 0, 'pass', 'no action while moving', 'design'),
    'setupTime': T('setupTime', 4.64, r(B['setup']['p90'], 2), 'pass', f"own recount (arm 2 s + wait from each shared stop to DOCKED) p90 {B['setup']['p90']} s, max {B['setup']['max']}; dev's standstill-based count is slightly more conservative (tail9_s12 8.16 vs 2.0 s)", 'p90 (simulated)'),
    'ops': T('ops', 1, B['ops']['p90'], 'pass', 'event-log recount, max 1 (mass +15 % → max 3)', 'p90 (max)'),
    'keMax': T('keMax', 14.28, r(B['keMax']['max'], 3), 'conditional',
               f"reproduced exactly (crossL9); margin 0.62 J. Own sensitivities (48 cases): L/D 0.6 → {LD['keMax']['max']} J, mass +15 % → {MS['keMax']['max']} J (both FAIL, reproduce dev 17.26/16.95); L/D 0.6 + mass +15 % (8 cases) → {LDM['agg']['keMax']['max']} J. Dev: governor off 16.05, L/D 0.9 14.44, noise-free sensing 15.40 J. Pass only at the nominal polar and mass.",
               'ensemble max (ground frame >1.5 m from body capsules)'),
    'packVol': T('packVol', 2.86, 2.86, 'conditional', 'round-3 constant 260×110×100 mm kept unchanged although the winch grew (2205 motor + 5:1 planetary + drag stack, 85 g) and the boom became 6 sections; a buildable boom (≥6 mm base, A4-K2-01) collapses thicker/longer; no CAD, 0.14 L margin', 'design (ASSUMED layout)'),
    'endurance': T('endurance', 69.81, r(B['endurance']['mean'], 2), 'pass', f"reproduced (min {B['endurance']['min']} min); winch bursts {B['winch']['PwMax']['max']} W = {B['winch']['battCrateMax']['max']} C from the 12 Wh 3S pack at −10 °C with fixed 10.8 V (no IR sag) — dev 15 A / 9.6 V sensitivity shows little effect", 'mean from per-run mean power, heated'),
    'headClear': T('headClear', 1.07, r(B['headClear']['min'], 3), 'conditional',
                   f"own helmetAt(raw run) geometry reproduces 1.074 m (line beyond the boom tip). Exclusion windows ≤{B['exclWindowMaxS']} s (compliant); KCU seated on the tip {B['kcuSeatedHeadMin']['min']} m; worn boom {B['boomHeadMin']['min']} m from the helmet centre (excluded by rule). Depends on boom length (1.2 m → 0.84) and fails at L/D 0.9 (0.98 m, dev).",
                   'ensemble min vs helmetAt'),
}
cvr = [{'metric': k, 'claimed': v['claimed'], 'recomputed': v['recomputed'], 'verdict': v['verdict']} for k, v in m13.items()]
byBin = {k: {'claimed': v['dev'], 'recomputed': v['own']} for k, v in B['byBinAvail'].items()}

findings = [
    {'id': 'A4-K2-01', 'severity': 'major', 'title': 'The <2 px passive boom is not buildable as specified and is structurally inconsistent with its own launch/dock sequence',
     'detail': (f"(a) A 6-section telescopic tube cannot taper only 3.0→2.5 mm: nested sections need each OD < the previous ID (≥0.4–0.5 mm per step), so a 3 mm base gives a ≈0.5–1 mm tip or the base must be ≈5–6 mm. "
                f"(b) The boom is a free-pivot tension member only while the line is taut, but in EXTEND (0.8 s) and STOW (≈1 s at full length, then retracting) it cantilevers the 90 g KCU at 1.45 m: 3.0×0.25 mm tube → linear tip deflection {struct['OD3.0_t0.25']['tipDeflKCUhoriz_mm_linear']} mm, root stress {struct['OD3.0_t0.25']['rootStressKCU_MPa']} MPa. "
                f"(c) Hauling the KCU onto the tip ring puts the boom in compression between reel and KCU: Euler (pinned) {struct['OD3.0_t0.25']['eulerPinned_N']}–{struct['OD3.0_t0.5']['eulerPinned_N']} N vs reel/drag forces of several N up to 30 N. "
                f"Required OD (t 0.5 mm, E 130 GPa): {need['sag200mm']}–{need['sag50mm']} mm for 20–5 cm sag with the KCU, {need['euler_5N']}–{need['euler_30N']} mm for 5–30 N compression. "
                f"Auditor sensitivity boom 6→5 mm: avail {B6['agg']['avail']['mean']:.1f} % on 6 cases (dev 4.5 mm → 2.6 %). The artefact pass therefore rests on a boom that cannot do its job; a real boom puts avail near 0 unless docking/stowing is redesigned (e.g. no KCU on the boom)."),
     'evidence': 'audit4/kite2/make_part.py (closed form), out_boom6_all.json; model.js PDEF boomDBase/boomDTip, MODE.EXTEND/STOW; index.js wornMass'},
    {'id': 'A4-K2-02', 'severity': 'major', 'title': f"avail fails: {B['avail']['mean']:.2f} % (claimed 72.30) — tailwind 24–69 %, calm {B['byDirAvail']['calm']} %",
     'detail': f"Own recompute with the shared bbox artefact rule {B['avail']['mean']:.2f} % (capsule variant {B['availCaps']['mean']:.2f} %, no-artefact {B['availNoArtefact']['mean']:.2f} %); tail 18 cases {B['tailAvail']} %, non-tail 30 cases {B['nonTailAvail']} %. Boom over the subject in ≈{B['boomOverShare']['mean']:.0f} % of filming frames at median 1.66 px — a +20 % diameter puts the median at the 2 px line. L/D 0.6 → {LD['avail']['mean']:.1f} %, mass +15 % → {MS['avail']['mean']:.1f} %.",
     'evidence': 'audit4/kite2/out_base_all.json, out_LD060_all.json, out_mass115_all.json'},
    {'id': 'A4-K2-03', 'severity': 'major', 'title': 'KE pass has 0.62 J margin and fails at the documented-low polar or +15 % mass',
     'detail': f"Reproduced 14.275 J. Own 48-case runs: L/D 0.6 → {LD['keMax']['max']} J, mass +15 % → {MS['keMax']['max']} J; L/D 0.6 + mass +15 % (8 cases) → {LDM['agg']['keMax']['max']} J. Dev: governor off 16.05 J, L/D 0.9 14.44 J, noise-free sensing 15.40 J. The 11 J governor threshold on an estimated speed is what holds the line; the flying mass already includes a 15 % margin, but the polar (L/D 0.75 from MC-1-1C scaled to 0.4 m²) is untested.",
     'evidence': 'audit4/kite2/out_LD060_all.json, out_mass115_all.json, out_LDmass_all.json; dev results.json sensitivity'},
    {'id': 'A4-K2-04', 'severity': 'major', 'title': 'Clothesline hazard unchanged (envelope limit, honestly declared)',
     'detail': f"Own heights of boom+line above the snow 1/2/3 m behind the pivot: min {B['lineH1min']['min']}/{B['lineH2min']['min']}/{B['lineH3min']['min']} m; below 1.8 m in a mean {B['lowSharePct']['mean']:.0f} % (median {B['lowSharePct']['p50']:.0f} %) of airborne riding samples (dev's 'lowShareMeanPct 90.17' is the median). Crossing-skier mitigation (boom 0.2 N·s ≈4 N assuming 50 ms contact; raised-pole line 9.1 N) comes from one scripted geometry each, with a 5 N breakaway and radar/contact detection all ASSUMED. Piste use needs written resort permission; low-traffic slopes only.",
     'evidence': 'audit4/kite2/out_base_all.json (lineH*); dev scenarios cross/crosspole'},
    {'id': 'A4-K2-05', 'severity': 'minor', 'title': 'headClear 1.074 m reproduces, but rests on excluding a boom that is kinematically the line',
     'detail': f"A free-pivot boom aligned with the line is the first 1.45 m of the line polyline; excluding it as a 'worn rigid member' is allowed by the round-4 rule but the line-plus-boom passes {B['boomHeadMin']['min']} m from the helmet centre. Boom 1.2 m → 0.84 m; L/D 0.9 → 0.98 m (fail). Exclusion windows ≤{B['exclWindowMaxS']} s (compliant); KCU seated at the tip {B['kcuSeatedHeadMin']['min']} m from the helmet centre during them. The 'passive, 25 g, 3 mm' justification inherits A4-K2-01 (a real boom is thicker and heavier).",
     'evidence': 'audit4/kite2/out_base_all.json'},
    {'id': 'A4-K2-06', 'severity': 'minor', 'title': 'Residual idealised estimators in the in-flight controller',
     'detail': 'Gates (launch, park, stop, retrieve) use windEstimate() — compliant. Pitot/vane apparent wind (σ 0.4 m/s), heave estimate (40 ms, 0.3 m/s) and the governor speed estimate (σ 0.2 m/s, 50 ms) are noisy. Still noise-free: kite position and velocity relative to the boom tip in the window controller (K, A, Vk → uT/uB), true dynamic pressure in the lift-authority term (Fres/liftN), the true apparent-wind direction at the kite in the climb mode, and the launch reef preset (qL from true wind at the tip). Position is plausibly measurable (line length + boom encoders); velocity is not without noise. Dev noise ×2 → avail 73.25, KE 14.31: effect small.',
     'evidence': 'model.js runCore (~L585–700: rrA/Vr/Fres; ~L560 qL)'},
    {'id': 'A4-K2-07', 'severity': 'minor', 'title': 'Reel motor envelope respected; battery and comments not',
     'detail': f"0 envelope violations in 48 cases: current max {B['winch']['Imax']['max']} A (hits 25 A in ≥10 % of runs), reel-in shaft ≤{B['winch']['nuInMax']['max']} m/s vs 6.24 no-load, ≤{B['winch']['PwMax']['max']} W electrical, motor on ≤{B['winch']['motorOnS']['max']} s/run. The 12 Wh 3S pack (≈1.1 Ah at 150 Wh/kg) must deliver up to {B['winch']['battCrateMax']['max']} C at −10 °C at a fixed 10.8 V (no internal-resistance sag); dev's 15 A / 9.6 V case shows small effect. PDEF comment still says '3:1 planetary … ≈10.4 m/s … ≈22 N' while the code uses 5:1 (6.24 m/s, 36.8 N).",
     'evidence': 'audit4/kite2/out_base_all.json agg.winch; model.js PDEF'},
    {'id': 'A4-K2-08', 'severity': 'minor', 'title': 'packVol is the unchanged round-3 constant',
     'detail': '2.86 L = 260×110×100 mm kept from round 3 while the winch became a 2205 + 5:1 planetary + spinning-reel drag stack and the boom 6 sections; with a structurally adequate boom it is unverified. 0.14 L margin.',
     'evidence': 'index.js PACK_L'},
]

physics = [
    {'assumption': 'Passive 6-section 3.0→2.5 mm, 1.45 m carbon boom on a free damped pivot (tension member)', 'devClaim': '<2 px in the delivered frame; no motors; 40 g',
     'evidence': f"auditor projection: median {B['boomWpxMedOver']['p50']} px over the rider (true); closed form: cannot nest, cannot cantilever the 90 g KCU (deflection {struct['OD3.0_t0.25']['tipDeflKCUhoriz_mm_linear']} mm linear), buckles at ≈1.3–2 N; ≥{need['sag200mm']}–{need['sag50mm']} mm needed → avail ≈6 % at 6 mm",
     'verdict': 'not credible as specified; load-bearing for avail and headClear', 'killTest': 'build the boom; bench: extend/retract with the KCU seated, haul-in compression to the clutch level; kill if OD >≈3.5 mm needed (≥2 px over the rider)'},
    {'assumption': 'Round slotted 0.40 m² canopy L/D 0.75, 50 % kept when reefed', 'devClaim': 'avail and KE at nominal', 'evidence': f"L/D 0.6 → avail {LD['avail']['mean']:.1f} %, KE {LD['keMax']['max']} J (own 48)", 'verdict': 'unverified; load-bearing for KE and avail', 'killTest': 'tow test L/D vs slot/reef at 6–15 m/s; kill if L/D <0.7'},
    {'assumption': 'Motorised fishing-reel winch (2205, 25 A, 10.8 V, 5:1, passive drag pay-out, solenoid release 20 ms)', 'devClaim': 'zero envelope violations', 'evidence': 'reproduced 0 violations; battery C-rate ≤16 C cold', 'verdict': 'credible in principle', 'killTest': 'bench: drag slip/stick-slip at 2–30 N, solenoid release time, reel-in at −10 °C on the real pack'},
    {'assumption': 'KE governor: drag release at 11 J on an estimated kite speed', 'devClaim': 'KE 14.28 J', 'evidence': 'governor off → 16.05 J; margin 0.62 J', 'verdict': 'load-bearing, thin margin', 'killTest': 'hockey-stop replays with real GNSS/IMU estimate; kill if KE >14.9 J'},
    {'assumption': '45° HFOV 16 g 4K module, pod pendulum ω 12 rad/s ζ 0.45', 'devClaim': 'pxMed 505, jitter 1.78', 'evidence': 'reproduced; hfov 60 → avail 67.7 (dev)', 'verdict': 'ASSUMED part', 'killTest': 'source the module; tow-test pod oscillation spectrum'},
    {'assumption': 'Crossing-skier mitigation (rear radar 4 m/0.2 s, contact free-spool 60 ms, 5 N breakaway)', 'devClaim': 'boom ≈4 N, line 9.1 N', 'evidence': 'single scripted geometries; 50 ms contact time assumed', 'verdict': 'unverified', 'killTest': 'instrumented crossing with a dummy at 4–10 m/s; kill if >10 N at the neck'},
]

part = {
    'conceptId': 'kite2', 'modelVersion': 'kite2@4.0.0', 'auditor': 'audit4 (round 4)', 'generated': '2026-10-20',
    'evidence': 'numerical uncalibrated simulation re-run on a copy of sim/ + closed-form structural checks; not physical verification',
    'scripts': ['audit4/kite2/recheck.mjs (48 cases, 2 processes; also --over sensitivities)', 'audit4/kite2/aggregate.py', 'audit4/kite2/make_part.py'],
    'reproduction': {'fullEnsembleRerun': {'matchesClaimed': True, 'cases': 48, 'maxAbsDiff': B['reproMaxAbsDiff'],
                                           'note': 'concept prepare()+buildResult() on the copy reproduces dev results.json case rows; auditor metrics from R.frame()/raw columns: avail −0.05 pp (bbox rule vs capsule rule), KE/headClear/endurance/boomHead exact, setup p90 4.56 vs 4.64 (own stop-based recount)'}},
    'metrics13': m13, 'claimedVsRecomputed': cvr,
    'envelope': {'def': 'rider 7–16 m/s (18 m/s → KE 19.7 J, dev fast scenario), apparent wind ≥≈7 m/s to launch; head/cross 3–9 m/s pass avail, calm 77.6 %, tail all bins fail; low-traffic pistes only (clothesline)',
                 'availRecomputedByDir': B['byDirAvail'], 'tailAvail': B['tailAvail'], 'nonTailAvail': B['nonTailAvail']},
    'byWindAvail': byBin,
    'footageStability': {'n': B['jitterSubject']['n'], 'p50': B['jitterSubject']['p50'], 'p90': B['jitterSubject']['p90'], 'max': B['jitterSubject']['max'], 'over3': 0},
    'massBudget': {'claimed_kg': 0.56, 'flyingMass_g': 89.7, 'note': 'kite 89.7 g + worn items 409 g ×1.15 = 0.560 kg; winch 85 g includes 2205 motor 30 + 5:1 planetary 12 + spool/drag/anti-reverse 20 + drag servo 4 + solenoid 6 + ESC 8; boom 40 g (tube 12 + pivot/damper/encoders/breakaway 27 + ring 1) — a buildable boom is heavier (A4-K2-01)'},
    'actuatorDemand': {'winch': B['winch'], 'boomStructure': {'closedForm': struct, 'requiredOD_mm_t0.5': need, 'E_GPa': 130, 'note': 'auditor closed form; tube wall and modulus ASSUMED'},
                       'boomProjection': {k: B[k] for k in ['boomWpxMedOver', 'boomWpxP99Over', 'boomWpxMaxOver', 'boomOverShare', 'boomCamDistMin', 'lineWpxMaxOver', 'artBboxSharePct', 'artCapsSharePct', 'vfMed', 'vfMin']}},
    'sensitivitiesAudit': {
        'LD_0.60_48': {'avail': LD['avail']['mean'], 'keMax': LD['keMax']['max'], 'headClearMin': LD['headClear']['min'], 'F': LD['F50']['max'], 'setupP90': LD['setup']['p90'], 'opsMax': LD['ops']['max']},
        'mass_+15pct_48': {'avail': MS['avail']['mean'], 'keMax': MS['keMax']['max'], 'headClearMin': MS['headClear']['min'], 'F': MS['F50']['max'], 'setupP90': MS['setup']['p90'], 'opsMax': MS['ops']['max']},
        'LD0.6_mass+15_8cases': {'avail': LDM['agg']['avail']['mean'], 'keMax': LDM['agg']['keMax']['max'], 'F': LDM['agg']['F50']['max'], 'setupP90': LDM['agg']['setup']['p90'], 'opsMax': LDM['agg']['ops']['max'], 'cases': [x['id'] for x in LDM['rows']]},
        'boom_6to5mm_6cases': {'avail': B6['agg']['avail']['mean'], 'availCaps': B6['agg']['availCaps']['mean'], 'keMax': B6['agg']['keMax']['max'], 'cases': [x['id'] for x in B6['rows']]},
    },
    'physics': physics,
    'definitionChecks': [
        {'metric': 'avail artefact', 'issue': 'dev counts overlap with body capsules (silhouette); shared text says subject bounding box — difference 0.05 pp here', 'favours': 'neutral'},
        {'metric': 'headClear', 'issue': 'free-pivot boom excluded as worn rigid member although it moves as the line; 0.33 m from the helmet centre', 'favours': 'kite2'},
        {'metric': 'setupTime', 'issue': 'simulated; only the 2 s arm tap is a constant', 'favours': 'neutral'},
        {'metric': 'gates', 'issue': 'windEstimate used for all wind gates; residual noise-free relative kite state in the window controller', 'favours': 'kite2 (small)'},
    ],
    'auditResponseCheck': {
        'A3-K2-01': 'not fixed — confirmed (lines 0.84/0.81/0.74 m)', 'A3-K2-02': 'artefact rule now met, but by a boom that is not buildable (A4-K2-01); avail fails honestly',
        'A3-K2-03': 'gimbal removed (true) — replaced by a structural problem in EXTEND/STOW (A4-K2-01)', 'A3-K2-04': 'fixed: real motor envelope, 0 violations reproduced',
        'A3-K2-05': 'headClear re-evaluated with helmetAt; reproduced 1.074 m', 'A3-K2-06': 'largely fixed; residual noise-free relative kite state (A4-K2-06)', 'A3-K2-07': 'disclosed; KE now also fails at L/D 0.6 (reproduced)'},
    'findings': findings,
    'safetyRegulatory': ['Written resort permission is a hard gate: boom/line 0.74–0.84 m above the snow 1–3 m behind the rider (A4-K2-04).',
                         'Rigid boom (a buildable one is ≥5–9 mm) 0.33 m from the helmet centre and at shoulder height for crossing skiers.',
                         'KE 14.28 J only with the governor and the nominal polar/mass; 17 J at L/D 0.6 or +15 % mass; 19.7 J for an 18 m/s rider.',
                         'Kite ≤14 m line: kite/tethered-object rules near lifts.'],
    'credibleEnvelope': 'None as an all-weather solo follow-cam (avail fails). In simulation, with the nominal polar and mass and IF a ≤3 mm boom could launch/dock the KCU, it would deliver ≈83 % in head/cross winds 3–9 m/s on low-traffic pistes with written permission; calm 78 %, tailwinds 24–69 %. The boom premise fails a closed-form check, so even that envelope is not credible until the dock/boom is redesigned and re-run.',
    'verdict': f"Reproduces the 48-case ensemble (avail {B['avail']['mean']:.2f} % own vs 72.30 claimed; other metrics exact or within 0.1). Honest fail on avail; KE passes by 0.62 J and fails at L/D 0.6 / +15 % mass (reproduced 17.26 / 16.95 J). The new passive 3 mm boom does project <2 px (median 1.66 px) but cannot nest as a 6-section telescope, cannot hold the 90 g KCU in EXTEND/STOW and buckles at ≈1.3 N when hauling it in; a boom that can (≥5.7–8.7 mm) collapses avail to ≈6 %. The reel-motor envelope is real and respected. Clothesline unsolved. Not usable; research concept only.",
}
json.dump(part, open(os.path.join(HERE, 'part.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote part.json')
for c in cvr:
    print(c)
