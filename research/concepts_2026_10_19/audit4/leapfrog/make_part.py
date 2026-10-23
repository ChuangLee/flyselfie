#!/usr/bin/env python3
"""Audit4 leapfrog part.json builder: reads the auditor's own re-run outputs (out_*.json from recheck.mjs on a COPY of
sim/, stallprobe.mjs) and the developer's dev/leapfrog/results.json, writes audit4/leapfrog/part.json.
Evidence: numerical, uncalibrated simulation + code reading; NOT physical verification."""
import json, os, glob, statistics as st
from summarise import summ, load, pct

H = os.path.dirname(os.path.abspath(__file__))
R4 = os.path.dirname(os.path.dirname(H))
dev = json.load(open(os.path.join(R4, 'dev/leapfrog/results.json')))
E = dev['ensemble']
J = E['judged']
rows = load(os.path.join(H, 'out_r4_0_48.json'))
S = summ(rows, 'r4')
seeds = summ(load(os.path.join(H, 'out_seeds_0_48.json')), 'seeds14-16')
off = summ(load(os.path.join(H, 'out_offgrid_0_21.json')), 'offgrid')
seedRows = load(os.path.join(H, 'out_seeds_0_48.json'))
offRows = load(os.path.join(H, 'out_offgrid_0_21.json'))
tsRows = load(os.path.join(H, 'out_tailseeds_0_24.json'))
ts = summ(tsRows, 'tailseeds17-22')
keOver = [{'id': r['id'], 'gateW': r['gateW'], 'keMax': r['own']['keMax'], 'sepMax': r['own']['sepMax'], 'ops': r['own']['ops']} for r in seedRows + tsRows + offRows if r['own']['keMax'] > 14.9 or r['own']['sepMax'] > 50]
nFlownExtraTail = sum(1 for r in seedRows + tsRows if r['dir'] == 'tail' and 4.5 <= r['U'] <= 6 and not r['noFly'])
sens = {}
for tag in ['mass10', 'mass8', 'bias2', 'stow13p5', 'trackerEstComp5Hz', 'trackerGnss1Hz', 'clmax1p1']:
    f = glob.glob(os.path.join(H, f'out_r4_{tag}_0_48.json'))
    if f:
        sens[tag] = summ(load(f[0]), tag); sens[tag]['over'] = json.load(open(f[0]))['over']
stall = json.load(open(os.path.join(H, 'out_stallprobe.json')))
r3 = lambda v: round(v, 3) if isinstance(v, (int, float)) else v

# reproduction vs dev rows
devRows = {r['id']: r for r in E['rows']}
diffs = []
for r in rows:
    d = devRows[r['id']]
    for k_own, k_dev in [('keMax', 'keMax'), ('headClear', 'headClear'), ('setup', 'setupTime'), ('ops', 'ops'), ('jitterSubject', 'fsSubject')]:
        a, b = r['own'][k_own], d[k_dev]
        if a is None and (b is None or b != b):
            continue
        if a is None or b is None or abs(a - b) > 0.01:
            diffs.append({'id': r['id'], 'metric': k_own, 'own': a, 'dev': b})
availDiff = [{'id': r['id'], 'own': r['own']['avail'], 'ownWithDevTiltRule': r['own']['availWithTilt'], 'dev': devRows[r['id']]['avail']} for r in rows if abs(r['own']['avail'] - devRows[r['id']]['avail']) > 0.5]

def bywind(rs):
    out = {}
    for U in sorted(set(r['U'] for r in rs)):
        a = [r['own']['avail'] for r in rs if r['U'] == U]
        out[f'U{U}'] = {'n': len(a), 'recomputed': r3(st.mean(a)), 'noFly': sum(r['noFly'] for r in rs if r['U'] == U)}
    return out
bw = bywind(rows)
for b in E['byWind']:
    k = f"U{b['U']}"
    if k in bw: bw[k]['claimed'] = b['avail']['mean']
byDir = {}
for d in ['calm', 'head', 'tail', 'crossL', 'crossR']:
    a = [r['own']['avail'] for r in rows if r['dir'] == d]
    byDir[d] = r3(st.mean(a))
tailBand = {f"tail{U}": r3(st.mean([r['own']['avail'] for r in rows if r['dir'] == 'tail' and r['U'] == U])) for U in [3, 3.5, 4.5, 5.5, 6, 9]}
fsv = [r['own']['jitterSubject'] for r in rows if not r['noFly']]

def S_(k): return sens.get(k, {})

M = {}
def met(k, stat, cl, rc, verdict, note): M[k] = {'stat': stat, 'claimed': cl, 'recomputed': rc, 'verdict': verdict, 'note': note}

met('avail', 'ensemble mean (48), availMask riding time shifted by tGo, no-fly = 0, own footage() bodyPx ≥300 native-capped', J['avail']['value'], S['availMean'], 'conditional',
    f"reproduced ({S['availMean']} own vs {J['avail']['value']} dev; dev additionally requires horizon tilt ≤5° → own {S['availWithTilt']}). Margin 2.3 pp, p10 0 (6 no-fly). "
    f"Extra seeds 14–16: {seeds['availMean']} (still ≥80). Fragile to the morph hardware: mass +10 % → {S_('mass10').get('availMean')}, mass +8 % (LisHawk-class morph servos) → {S_('mass8').get('availMean')}, "
    f"extended CLmax 1.1 → {S_('clmax1p1').get('availMean')}. No line/boom artefact (none in shot).")
met('pxMed', 'mean of case medians (bodyPx, native-capped) over flown cases', J['pxMed']['value'], S['pxMed'], 'pass', '22° HFOV crop of a 4K sensor; native-row cap applied')
met('jitterRms', 'p90 footageStability(R).subjectRms over flown cases (LIVE tracker crop that R.frame outputs)', J['jitterRms']['value'], S['jitterP90'], 'conditional',
    f"reproduced exactly. Max {S['jitterMax']} (tail6_s11, left behind). The live tracker is a noise model on the TRUE line of sight: latency compensation uses the true LOS increment and the GNSS feed-forward is the true LOS rate + σ0.3 m/s error at 50 Hz. "
    f"Auditor variant (estimated latency compensation, 5 Hz GNSS) → p90 {S_('trackerEstComp5Hz').get('jitterP90')}; 1 Hz phone GNSS, σ0.5 → {S_('trackerGnss1Hz').get('jitterP90')}. Extra seeds p90 {seeds['jitterP90']}.")
met('azRange', 'mean of case p5–p95 (dev)', J['azRange']['value'], J['azRange']['value'], 'pass', 'not independently recomputed (dev value; head-on lead gives a wide span)')
met('addedMass', 'design', J['addedMass']['value'], J['addedMass']['value'], 'pass', 'glider 168.5 g + holster 50 g + 14 Wh bank 93 g + tag 8 g; large margin to 1.5 kg even if the airframe grows')
met('bodyForcePeak', 'max (holster inertia)', J['bodyForcePeak']['value'], J['bodyForcePeak']['value'], 'pass', 'nothing tethered; holster 0.143 kg × peak lateral+2 g')
met('handsBusy', 'design', 0, 0, 'pass', 'set-down/pick-up only at standstill')
met('setupTime', 'p90 (simulated: tGo incl. MODAPTS set-down + lift-off/lead wait, landing wait, skate/side-step, MODAPTS stow)', J['setupTime']['value'], S['setupP90'], 'conditional',
    f"reproduced exactly (max {S['setupMax']}). MODAPTS gloved stow mean 5.2 s is optimistic for a bend-from-ski-boots pick-up + snap; auditor 13.5 s stow → p90 {S_('stow13p5').get('setupP90')} (FAIL). Seeds 14–16 p90 {seeds['setupP90']}.")
met('ops', 'p90 (max)', 2, S['opsP90'], 'pass', f"p90 2, max 3 ({', '.join(S['ops3'])}: left behind, picked up next run); seeds 14–16 ops3 in {', '.join(seeds['ops3'])}")
met('keMax', 'ensemble max, ground frame when >1.5 m from every body point', J['keMax']['value'], S['keMax'], 'conditional',
    f"reproduced exactly on the 48 cases (13.748 J, tail5.5_s12). NOT robust: extra tail-band seeds cross 14.9 J in {sum(1 for x in keOver if x['keMax']>14.9)} runs (max {max(x['keMax'] for x in keOver)} J); seed 15 (bias −0.92) tail5.5 → {max(r['own']['keMax'] for r in seedRows if r['id']=='tail5.5_s15')} J (>14.9), tail6_s15 14.09; "
    f"bias ±2 m/s on the 48 → {S_('bias2').get('keMax')} J; off-grid max {off['keMax']} J. KE ≤14.9 J holds robustly only for true tail ≲5 m/s.")
met('packVol', 'design (ASSUMED holster envelope)', J['packVol']['value'], J['packVol']['value'], 'conditional', '0.32 × 0.091 × 0.086 m outer; folded span-morphing glider + gimbal + camera not CAD-checked; LisHawk-class servos (7.1 g, ~23 mm) would need re-layout')
met('endurance', 'shared enduranceMin(1.2 Wh + 14 Wh × 0.85, mean pTot of flown cases, heated)', J['endurance']['value'], r3(0.75 * 0.85 * (1.2 + 14 * 0.85) / (S['pMeanFlown'] + 0.6 / 0.33) * 60), 'pass',
    f"mean flown pTot recomputed {S['pMeanFlown']} W (dev 7.645) → same 52.95 min; NPU 0.8 W (not the shared 2.5 W board: 46.6 min, still pass)")
met('headClear', 'ensemble min, helmetAt(sk, t−tGo) to glider centre minus actual half-span 0.275+0.225·morph (prop inside), launch/lead/land/takeoff/slide', J['headClear']['value'], S['headClearMin'], 'pass',
    f"reproduced (min {S['headClearMin']} m at take-off from the set-down spot); seeds 14–16 {seeds['headClearMin']}, off-grid {off['headClearMin']}; no worn rigid members")

cvr = [{'metric': k, 'claimed': v['claimed'], 'recomputed': v['recomputed'], 'verdict': v['verdict']} for k, v in M.items()]

sepTxt = f"max 3-D distance glider↔pelvis while airborne: grid {S['sepMax']} m (dev 40.4 to mid-body+1 m), seeds 14–16 {seeds['sepMax']} m (tail5.5_s15 >50 m C0 follow-me radius), off-grid {off['sepMax']} m"

findings = [
 {'id': 'A4-LF-01', 'severity': 'major', 'title': 'Thin pass breaks on new seeds: KE >14.9 J in 4 and separation >50 m in 2 of the extra tail-band runs (worst 16.05 J, 54.9 m)',
  'detail': f"The 48-case grid uses only three wind-estimate bias draws (bias seeded by the case seed: s11 +0.82, s12 −0.55, s13 +0.18 m/s downslope). Seed 15 draws −0.92 m/s (tail wind under-estimated): tail5.5_s15 is launched (estimate 5.07), CL saturates at CLmax {[x for x in stall['rows'] if x['id']=='tail5.5_s15'][0]['clAtMaxPct']} % of the airborne time, KE 15.034 J, separation 54.9 m, ops 3, avail 49 %; tail6_s15 KE 14.09 J, ops 3. Seeds 14–16 ensemble: avail {seeds['availMean']} %, jitter p90 {seeds['jitterP90']}, setup p90 {seeds['setupP90']} — the means survive, the safety maxima do not. Bias ±2 m/s on the 48 grid → KE {S_('bias2').get('keMax')} J. Tail 4.5–6 × seeds 17–22 (six more bias draws): KE {ts['keMax']} J max, {ts['noFly']}/24 refused, ops 3 in {len(ts['ops3'])}. Over all extra tail-band flown runs (n={nFlownExtraTail}) the KE/C0 lines are crossed in: {', '.join(f"{x['id']} {x['keMax']} J / {x['sepMax']} m" for x in keOver)}. Mechanism: the gate admits estimated downslope wind up to ≈6 m/s, i.e. true tail 5.5–6 m/s in turbulence (σ 0.15–0.2 U) — at the physical limit w_max ≈6.1 m/s of the extended wing — and in those runs the limiter/air brake/land-now do not hold 14.9 J. Not only under-reading: s17 under-reads 0.24 (tail6, 16.05 J), s20 OVER-reads (tail5.5, est. 5.96, 15.49 J). All four are 'left behind' runs (ops 3). On the judged grid the same band gave ≤13.75 J only because of the three bias draws.",
  'evidence': 'audit4/leapfrog/out_seeds_0_48.json, out_tailseeds_0_24.json, out_r4_bias2_0_48.json, out_stallprobe.json'},
 {'id': 'A4-LF-02', 'severity': 'major', 'title': "'LisHawk-style' morph exceeds the cited data: +100 % wing area / +82 % span vs Ajanic 2020 +41 % wing (+60 % wing+tail) by sweep, and one 2.5 g servo vs LisHawk's 7.1 g servos",
  'detail': "Ajanic et al. 2020 (Sci. Robot. 5:eabc2897, Tab. 1): wing 0.117→0.165 m² (+41 %) by wrist SWEEP (feathers fan), tail 0.014→0.044 m²; 284 g; three BMS-306 servos 7.1 g / 2.0 kg·cm (one per wing side + tail). The 4.0 m/s minimum is a trim optimisation from static wind-tunnel data INCLUDING thrust at α>20° (implied CL ≈1.6 on 0.179 m² at ρ 1.2, ≈1.4 on 0.209 m²), not a demonstrated glide; tucked 7.6 m/s is a trim limit (CL≈0.6). leapfrog: 0.05→0.10 m² (+100 %) by spanwise sliding feathers (0.55→1.0 m), a different mechanism, CLmax 1.25 ASSUMED at Re ≈34 k (extended chord 0.10 m at 5.1–5.7 m/s, ν 1.67e-5) — optimistic but not impossible for a cambered thin wing; 3-D AR-10 feathered wing with gaps unproven. One 2.5 g micro servo extends the feathers under load AND folds the wings. LisHawk-class actuation (+2×7.1 g −2.5 g, ×1.15) ≈ +13.5 g → 182 g; mass is the most sensitive parameter (KE cap). Dev sensitivities: Sx 0.085 → separation 53.7 m; CLmax 1.1 → 50.4 m.",
  'evidence': 'arXiv 2002.02421 (Ajanic et al.) Tab. 1, wind-tunnel and morphing-optimisation sections; model.js BOM_R4/PDEF; audit4 out_r4_mass8/mass10/clmax1p1'},
 {'id': 'A4-LF-03', 'severity': 'major', 'title': 'avail margin (2.3 pp) depends on mass and CLmax: +8–10 % mass or CLmax 1.1 fails',
  'detail': f"Full 48-case re-runs (auditor): mass +10 % (0.185 kg, cap re-derived) → avail {S_('mass10').get('availMean')} %, KE {S_('mass10').get('keMax')}, sep {S_('mass10').get('sepMax')}; mass 0.182 kg → {S_('mass8').get('availMean')} %; extended CLmax 1.1 → {S_('clmax1p1').get('availMean')} %, sep {S_('clmax1p1').get('sepMax')} m. Mass 0.182 kg also breaks the C0 radius ({S_('mass8').get('sepMax')} m). The KE cap (√(2·14.9/m)) ≈ the rider's straight-line speed, so every gram costs footage.",
  'evidence': 'audit4/leapfrog/out_r4_mass10_0_48.json, out_r4_mass8_0_48.json, out_r4_clmax1p1_0_48.json'},
 {'id': 'A4-LF-04', 'severity': 'major', 'title': 'Live tracker: latency compensation and feed-forward use the true LOS; with a 1 Hz GNSS velocity link jitter p90 3.43 °/s and avail 64.6 % fail',
  'detail': f"analysis.js: detections = true LOS rotated by 3 % box noise + 3 % pose bias (15 Hz, 80 ms) — acceptable error model; but the latency compensation adds the TRUE LOS increment (los[i]−los[j]) and the feed-forward is the true LOS rate 0.1 s old + σ0.3 m/s GM velocity error every 20 ms (no GNSS update rate, no phone/tag GNSS latency beyond 0.1 s). Auditor variants on a copy: estimated latency compensation + 5 Hz GNSS → jitter p90 {S_('trackerEstComp5Hz').get('jitterP90')}, avail {S_('trackerEstComp5Hz').get('availMean')}; 1 Hz GNSS σ0.5 m/s → p90 {S_('trackerGnss1Hz').get('jitterP90')}, avail {S_('trackerGnss1Hz').get('availMean')}. Turret pointing in model.js likewise = true rider mid + Gauss–Markov UWB/GNSS/vision error with TRUE rider velocity for prediction. The vision detection test uses the true subject position (probability 0.9).",
  'evidence': 'sim/js/concepts/leapfrog/analysis.js L100–135; model.js L905–945; audit4 out_r4_tracker*.json (patched copy copy_lfsens)'},
 {'id': 'A4-LF-05', 'severity': 'minor', 'title': 'Guidance and airspeed control use true rider state and true airspeed; point-mass model cannot stall',
  'detail': "runCore guidance (gap, sepNow, lane, vsx, separation give-up/land) uses the TRUE rider position/velocity (GNSS rel. error σ1.5 m not applied to guidance); the airspeed floor/CL command uses the TRUE air vector (pitot noise only enters the gust interlock); CL is clamped at CLmax — no stall break, no lift loss, no departure. Stall probe: judged-grid min Va/v_stall 0.99–1.14 with ≤0.6 % of airborne time above 95 % CLmax; seed-15 tail cases spend 5–8 % of airborne time at the CL clamp with Va < v_stall. The in-flight air-data wind is true local wind + the shared bias, 2 s low-pass (no airspeed/sideslip error). Wind gates do use windEstimate() with ≥5 s history (verified gateHist 5.0 in every case).",
  'evidence': 'model.js L346–600, out_stallprobe.json'},
 {'id': 'A4-LF-06', 'severity': 'minor', 'title': 'Claimed sensitivity numbers do not match the files',
  'detail': f"Reported 'mass +10 % → 69.7 %, bias ±2 → KE 17.65 J, stow 13.5 s → 33.1 s'; results.json variants (18-case subset) say 65.6 %, 17.92 J, 33.4 s. Auditor full 48: mass +10 % {S_('mass10').get('availMean')} %, bias ±2 KE {S_('bias2').get('keMax')} J, stow 13.5 s setup p90 {S_('stow13p5').get('setupP90')} s. Direction and verdicts agree; the quoted figures are not traceable.",
  'evidence': 'dev/leapfrog/results.json variants; audit4 out_r4_*'},
 {'id': 'A4-LF-07', 'severity': 'minor', 'title': 'Reproduction exact despite the post-run index.js edit',
  'detail': f"index.js mtime 09:51 vs results 08:04; own re-run on a copy reproduces keMax/headClear/setup/ops/jitter for 48/48 cases (diffs > 0.01: {len(diffs)}); own avail differs from dev by the dev's extra horizon-tilt rule only (own 82.46, own+tilt 82.33, dev 82.34).",
  'evidence': 'audit4/leapfrog/out_r4_0_48.json'},
 {'id': 'A4-LF-08', 'severity': 'minor', 'title': 'Off-grid sweep: safe but thin at tail 6.5 / cross 7.5',
  'detail': f"tail 5–6.5 and head/cross 7.5 × seeds 11–13: KE max {off['keMax']} J (crossR7.5_s13), headClear ≥{off['headClearMin']} m, separation max {off['sepMax']} m (crossR7.5_s13 48.9, tail6.5_s11 48.4 — 1–2 m inside 50 m), ops 3 in {', '.join(off['ops3'])}; jitter up to {off['jitterMax']} in left-behind runs.",
  'evidence': 'audit4/leapfrog/out_offgrid_0_21.json'},
]

part = {
 'conceptId': 'leapfrog', 'modelVersion': dev['modelVersion'], 'auditor': 'audit4 (round 4)', 'generated': '2026-10-20',
 'evidence': 'numerical uncalibrated simulation re-run on a copy of sim/ + code reading; not physical verification (M-070 not_run, G-MATURE closed)',
 'scripts': ['audit4/leapfrog/recheck.mjs (r4 48, seeds 14–16 48, offgrid 21, tailseeds 24, 7 sensitivities on 48)', 'audit4/leapfrog/stallprobe.mjs', 'audit4/leapfrog/summarise.py', 'audit4/leapfrog/make_part.py', 'tracker variants on a patched copy (scratchpad copy_lfsens, analysis.js auditFFcomp/auditGnssHz)'],
 'reproduction': {'fullEnsembleRerun': {'cases': 48, 'matchesClaimed': len(diffs) == 0, 'diffs': diffs, 'availDiffsOver0p5pp': availDiff,
   'note': 'dev fullrunInput+buildResult on the copy; auditor metrics from R.frame()/core columns; post-run index.js edit has no numerical effect'}},
 'metrics13': M, 'claimedVsRecomputed': cvr,
 'envelope': {'def': 'groomed piste, rider downhill progress ≲11–12 m/s, wind estimate ≤12.5 m/s, true tail ≲5 m/s (gate at ≈5.5–6 estimated), head ≤9 (62–98 %), cross ≤9; KE/C0 radius robust only for true tail ≲5 m/s (gate admits up to ≈6 estimated)',
              'availRecomputedByDir': byDir, 'tailBins': tailBand, 'separation': sepTxt},
 'byWindAvail': bw,
 'footageStability': {'n': len(fsv), 'p50': pct(fsv, .5), 'p90': pct(fsv, .9), 'max': max(fsv), 'over3': sum(1 for v in fsv if v > 3)},
 'massBudget': {'claimed_kg': 0.32, 'flyingMass_g': 168.5, 'note': 'BOM 146.5 g ×1.15: structure 51 (feathers 6 + guides 3), motor 11, avionics 10, 4 × 2.5 g servos (one = feather extension + wing fold), cam 16, gimbal 30, wiring 5, 1.2 Wh cell 8, NPU 4, preview 1.5. Morph mechanism IS budgeted but at micro-servo scale; LisHawk used 7.1 g servos.'},
 'robustness': {'tailSeeds17to22': {k: ts[k] for k in ts}, 'safetyLineCrossings': keOver, 'extraSeeds': {k: seeds[k] for k in seeds}, 'extraSeedsRowsWorst': [{'id': r['id'], 'avail': r['own']['avail'], 'keMax': r['own']['keMax'], 'sepMax': r['own']['sepMax'], 'ops': r['own']['ops']} for r in seedRows if r['own']['keMax'] > 14 or r['own']['sepMax'] > 45 or r['own']['ops'] >= 3],
                'offGrid': {k: off[k] for k in off}, 'offGridRows': [{'id': r['id'], 'noFly': r['noFly'], 'avail': r['own']['avail'], 'keMax': r['own']['keMax'], 'headClear': r['own']['headClear'], 'sepMax': r['own']['sepMax'], 'ops': r['own']['ops']} for r in offRows],
                'sensitivities48': sens, 'stallProbe': stall['rows']},
 'physics': [
  {'assumption': 'Feathered span-morphing wing 0.05→0.10 m², CLmax 1.25 extended (v_stall 5.1 m/s)', 'devClaim': 'LisHawk-style (Ajanic 2020)', 'evidence': 'cited paper: +41 % wing area by sweep, 4.0 m/s with thrust; Re ≈34 k here', 'verdict': 'unverified, beyond cited data; load-bearing for tail envelope, avail and C0 radius', 'killTest': 'tow/wind-tunnel test of the 168 g feathered wing at 4–8 m/s: kill if CLmax(ext) <1.1 or extension under load/snow/−10 °C fails'},
  {'assumption': 'Flying mass 168.5 g incl. 15 % margin with one 2.5 g morph servo', 'devClaim': 'held by NPU and 1.2 Wh cell', 'evidence': 'every +10 % mass → avail ≈66–70 %', 'verdict': 'optimistic', 'killTest': 'weigh a built airframe; kill if >180 g'},
  {'assumption': 'Launch gate at ≈6 m/s estimated tail wind keeps KE ≤14.9 J', 'devClaim': 'gate robust box ±1 cross / +0.4 downslope; KE robust', 'evidence': '4 of 24 extra flown tail-band runs exceed 14.9 J (max 16.05) and 2 exceed 50 m', 'verdict': 'refuted beyond the 3 grid bias draws', 'killTest': 'tow/flight test in 5–6 m/s tailwind on a 15° slope with the feather air brake: kill if GNSS ground speed >12.6 m/s (KE >14.9 J); gate estimate vs reference anemometer'},
  {'assumption': 'Live tracker (NPU 15 Hz + GNSS FF)', 'devClaim': 'jitter p90 1.64', 'evidence': 'truth-based latency compensation; auditor variants in sensitivities48', 'verdict': 'plausible, partly idealised', 'killTest': 'record a carving skier from a moving 22° camera; p90 subject jitter ≤3 °/s'},
  {'assumption': 'MODAPTS gloved handling 3.1 s set-down / 5.2 s stow', 'devClaim': 'simulated', 'evidence': 'stow 13.5 s → setup p90 fail', 'verdict': 'optimistic', 'killTest': 'timed gloved trials on skis, 20 reps'},
 ],
 'definitionChecks': [
  {'metric': 'avail', 'issue': 'dev adds a horizon-tilt ≤5° rule (stricter); own without it 82.46', 'favours': 'neutral'},
  {'metric': 'headClear', 'issue': 'helmetAt used; half-span grows with morph; PERCH excluded (stationary on snow)', 'favours': 'neutral'},
  {'metric': 'ensemble', 'issue': 'bias of windEstimate is seeded by the case seed → only 3 bias draws in 48 cases; safety maxima depend on that draw', 'favours': 'leapfrog (and every gate-dependent concept)'},
  {'metric': 'gates', 'issue': 'windEstimate() with ≥5 s history in every case; no oracle wind in gates', 'favours': 'neutral'},
 ],
 'findings': findings,
 'auditResponseCheck': [
  {'id': 'A3-LF-01', 'claim': 'fixed', 'audit': 'avail 82.3–82.5 on 48 reproduced; holds on seeds 14–16 (84.4) but fragile to mass/CLmax'},
  {'id': 'A3-LF-02', 'claim': 'fixed (live tracker)', 'audit': 'partly: live crop modelled but latency compensation/FF from truth (A4-LF-04)'},
  {'id': 'A3-LF-03', 'claim': 'improved (40.4 m)', 'audit': 'grid yes; seed 15 tail5.5 54.9 m >50 m (A4-LF-01)'},
  {'id': 'A3-LF-04', 'claim': 'fixed', 'audit': 'true-wind init removed; gate history 5 s confirmed; air-data wind still truth+bias'},
  {'id': 'A3-LF-05', 'claim': 'fixed (MODAPTS)', 'audit': 'simulated but optimistic; 13.5 s stow fails'},
  {'id': 'A3-LF-06', 'claim': 'fixed (2.50 L)', 'audit': 'ASSUMED envelope, not CAD'},
  {'id': 'A3-LF-07', 'claim': 'answered', 'audit': 'accepted; shared board sensitivity still passes'},
  {'id': 'A3-LF-08', 'claim': 'reported', 'audit': 'unchanged, unjudged'},
 ],
 'safetyRegulatory': ['EU C0 follow-me 50 m: grid max 39.9 m, but 54.9 m on seed 15 tail5.5 (bias-dependent)', 'KE ≤14.9 J not robust for true tail 5.5–6 m/s (16.05 J tail6_s17, 15.49 tail5.5_s20, 15.03 tail5.5_s15, 14.94 tail6_s21); robust for true tail ≲5 m/s', 'Free-flying 168 g aircraft over a piste: resort permission and bystander exposure (0.15–1.5 near passes per run after avoidance, ASSUMED densities)', 'No tether, no worn boom: headClear ≥2.0 m robust'],
 'credibleEnvelope': 'Simulation-credible on groomed, low-traffic pistes in calm/cross/head wind ≤9 m/s and true tail wind ≲5 m/s, rider downhill progress ≲11 m/s, and only if: the feathered wing reaches CLmax ≥1.2 at +100 % area, the airframe stays ≤≈172 g, the launch gate is tightened to ≈5 m/s estimated downslope wind (costing tail-band avail; not re-judged), and the rider tag provides ≥5 Hz GNSS velocity to the framing tracker.',
 'verdict': f"Reproduces exactly (48/48) and passes all 13 metrics as modelled (avail {S['availMean']}, jitter p90 {S['jitterP90']}, setup p90 {S['setupP90']}, ops p90 2, KE {S['keMax']} J, headClear {S['headClearMin']} m, endurance 52.95 min, 2.50 L). The pass is thin: new seeds keep the means but break the safety maxima (KE up to 16.05 J in 4 extra tail-band runs, 54.9 m > C0 50 m); avail fails at +8–10 % mass or CLmax 1.1; the enabling morphing wing goes beyond the cited LisHawk data. Verdict: conditional pass — most credible 'usable in simulation' candidate inside a light-tailwind envelope, not demonstrated.",
}
json.dump(part, open(os.path.join(H, 'part.json'), 'w'), ensure_ascii=False, indent=1)
print('wrote part.json; diffs', len(diffs))
for k, v in sens.items(): print(k, {a: v[a] for a in ['availMean', 'jitterP90', 'keMax', 'sepMax', 'setupP90', 'opsMax', 'noFly']})
