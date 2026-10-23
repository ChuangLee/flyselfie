#!/usr/bin/env python3
"""Assemble audit4/towglider/part.json from the auditor's own runs (recheck.mjs outputs). Evidence: numerical uncalibrated simulation."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
L = lambda f: json.load(open(os.path.join(H, f)))['rows']
def pct(a, p):
    a = sorted(x for x in a if x is not None)
    return a[min(len(a) - 1, max(0, round(p * (len(a) - 1))))] if a else None
rows = L('out_s0.json') + L('out_s1.json'); fl = [r for r in rows if not r['gated']]
mean = lambda a: round(sum(a) / len(a), 3)
ph = L('out_preHist_s0.json') + L('out_preHist_s1.json'); ts = L('out_tailSweep_a.json') + L('out_tailSweep_b.json')
sv3, sv4, n3, n5 = L('out_servo3.json'), L('out_servo4.json'), L('out_noise3.json'), L('out_noise5.json')
og = L('out_crossL75.json') + L('out_crossR75.json') + L('out_head75.json')
use = 0.75 * 0.85 * 15; mF = sum(r['filmS'] for r in fl) / len(fl); Eb = sum(r['E_runOnly_J'] for r in fl) / len(fl)
endur = lambda w, heat=0: round(use * 3600 / (Eb + 480 * w + heat) * mF / 60, 2)
rec = {
 'avail': mean([r['availSilhouette'] for r in rows]), 'availBoxLiteral': mean([r['avail'] for r in rows]), 'availNoArtefact': mean([r['availNoArtefact'] for r in rows]),
 'pxMed': mean([r['pxMed'] for r in fl]), 'fsP90': pct([r['fsSubject'] for r in fl], 0.9), 'keMax': max(r['keMax'] for r in rows),
 'headClear': min(r['headClear'] for r in fl), 'setupP90': pct([r['dev']['setupTime'] for r in rows], 0.9), 'opsP90': pct([r['dev']['ops'] for r in rows], 0.9),
 'F': max(r['dev']['bodyForcePeak'] for r in rows), 'endurance': endur(0.05), 'azRange': mean([r['dev']['azRange'] for r in fl]),
}
M = lambda stat, cl, rc, v, note: {'stat': stat, 'claimed': cl, 'recomputed': rc, 'verdict': v, 'note': note}
metrics = {
 'avail': M('ensemble mean (48), availMask riding, own bodyPx ≥300 + in-frame + own artefact projection (leash Ø0.6 mm and wand Ø3 mm, ≥2 px over the body silhouette); never-launched = 0', 49.409, rec['avail'], 'fail',
   f"17/48 never launch (all tail ≥3.5 and tail3 s11/s13 + tail6/9). Launched mean {mean([r['availSilhouette'] for r in fl])} % (dev 76.5). Literal 'subject bounding box' reading of the shared artefact rule (6-point box incl. skis): {rec['availBoxLiteral']} %. No-artefact ceiling {rec['availNoArtefact']} %. Dev artefact test samples only the leash vertices and ignores the wand (−1.4 pp). With pre-run wind history: 53.1 % (still FAIL)."),
 'pxMed': M('mean of case medians of own bodyPx (flown)', 467.615, rec['pxMed'], 'pass', 'reproduced; crop never narrower than native 1080 rows (vfMin); 50° M12 lens on a 4K 4:3 sensor ASSUMED part'),
 'jitterRms': M('p90 footageStability subject RMS over 31 flown cases', 2.451, rec['fsP90'], 'conditional',
   f"reproduced exactly (max 2.744). Rests on ASSUMED ≥6 Hz loaded small-signal servo bandwidth: own runs (12 flown cases) fs 4 Hz → p90 {pct([r['fsSubject'] for r in sv4],0.9)} (6/12 >3), 3 Hz → {pct([r['fsSubject'] for r in sv3],0.9)} (12/12 >3). Reframe detection noise 1 %→3 %: {pct([r['fsSubject'] for r in n3],0.9)}, 5 %: {pct([r['fsSubject'] for r in n5],0.9)}. Live mount command uses the true line of sight (no tracker error); post reframe absorbs it inside the 5° crop margin. passTable prints 2.47 vs ensemble 2.451 (cosmetic)."),
 'azRange': M('mean of case p5–p95 (dev column, flown)', 61.56, rec['azRange'], 'pass', 'dev R.summary reproduced on the copy; not independently re-derived'),
 'addedMass': M('design', 0.457, 0.465, 'pass', 'the 8 g line-guide wand is not in WORN (reel 85, pack 100, boost 10, holster 60, belt 70 g + glider 132 g); +8 g → 0.465 kg'),
 'bodyForcePeak': M('ensemble max 50 ms hip tension', 4.24, rec['F'], 'pass', 'reproduced'),
 'handsBusy': M('design', 0, 0, 'pass', 'no action while moving'),
 'setupTime': M('ensemble p90 (arm 1 s + rider-still→seated)', 12.26, rec['setupP90'], 'pass', 'reproduced from events; capture windows per stow ≤2.1 s (two stows per run in crossL6_s11/crossR9_s11, 2.06 s each)'),
 'ops': M('p90 (max)', 1, rec['opsP90'], 'pass', 'max 1 in 48 and in all off-grid runs (refusals cost no action)'),
 'keMax': M('ensemble max, ground frame >1.5 m from body capsules', 13.219, rec['keMax'], 'pass',
   f"reproduced; pre-run wind history (dev request) → {max(r['keMax'] for r in ph)} J (crossR6_s13 first ride now flown); mass +15 % → 14.81 J (dev); off-grid cross/head 7.5 ≤{max(r['keMax'] for r in og)} J; tail 3–6 (0.25 steps, gate on) ≤{max(r['keMax'] for r in ts)} J"),
 'packVol': M('design estimate', 2.8, 2.8, 'conditional', 'arithmetic consistent; folded-tube geometry ASSUMED; Ø3 mm × 0.35 m wand folds along the ≈0.40 m holster (≈0.003 L, not listed)'),
 'endurance': M('usable Wh / mean run energy incl. 8 min lift', 53.09, rec['endurance'], 'conditional',
   f"reproduced; rests on a 0.05 W lift sleep (MCU stop + GNSS power-save, boost/reel driver off). Lift floor 0.15 W → {endur(0.15)}, 0.3 W → {endur(0.3)}, 0.5 W → {endur(0.5)} FAIL, idle 0.6 W → {endur(0.6)} FAIL. No cell heater charged (discharge-only pack, consistent with components.js which restricts charging); a 0.6 W holster heater all day → {endur(0.05, 0.6*(125.7+480))}"),
 'headClear': M('ensemble min, helmetAt(simulateRun, t−tGo) to glider segments + leash/free line, capture window excluded', 1.061, rec['headClear'], 'conditional',
   f"reproduced (also 1.061 to the frame body head). Off-grid with gate ON: crossL7.5_s11 {[r for r in og if r['id']=='crossL7.5_s11'][0]['headClear']} m (deep-stall drop at the final stop, rider standing) — FAIL outside the grid (dev listed it in offGridOther without flagging). Worn wand min distance to the helmet {min(r['wandToHelmetMin'] for r in rows)} m (whole rod incl. hinge; dev's 1.36 m is the eyelet)"),
}
order = list(metrics)
part = {
 'conceptId': 'towglider', 'modelVersion': 'towglider@0.5.0', 'auditor': 'audit4 (round 4)', 'generated': '2026-10-20',
 'evidence': 'numerical uncalibrated simulation re-run on a copy of sim/ (scratchpad) + code reading; not physical verification; M-070 not_run, G-MATURE closed',
 'scripts': ['audit4/towglider/recheck.mjs (48 cases, 2 shards; off-grid --tailU/--dir; --servoFs; --noise; pre-history run on a second copy with windEstimate t0 = t−lag−10 s, no clamp at 0)', 'audit4/towglider/make_part.py'],
 'reproduction': {'fullEnsembleRerun': {'matchesClaimed': True, 'cases': 48, 'maxAbsDiff': 0, 'note': 'concept.simulate on the copy reproduces dev results.json rows exactly for avail, pxMed, setup, ops, F, KE, headClear, endurance and footageStability subject RMS; auditor metrics computed independently from R.frame()'}},
 'metrics13': metrics,
 'claimedVsRecomputed': [{'metric': k, 'claimed': metrics[k]['claimed'], 'recomputed': metrics[k]['recomputed'], 'verdict': metrics[k]['verdict']} for k in order],
 'envelope': {'def': 'estimated down-slope tailwind <3 m/s (gate on the shared ±1 m/s estimate), head/cross ≤9 m/s on the grid seeds, rider 8–13 m/s on ≤20° slopes, carving; tail ≥3.5 m/s refused; cross 7.5 m/s not safe in 1/3 seeds',
   'availOwnByDir': {k: v for k, v in {}.items()}},
 'byWindAvail': None, 'footageStability': {'n': len(fl), 'p50': pct([r['fsSubject'] for r in fl], 0.5), 'p90': rec['fsP90'], 'max': max(r['fsSubject'] for r in fl), 'over3': sum(r['fsSubject'] > 3 for r in fl),
   'servo4Hz_p90': pct([r['fsSubject'] for r in sv4], 0.9), 'servo3Hz_p90': pct([r['fsSubject'] for r in sv3], 0.9), 'noise3pct_p90': pct([r['fsSubject'] for r in n3], 0.9), 'noise5pct_p90': pct([r['fsSubject'] for r in n5], 0.9)},
 'massBudget': {'claimed_kg': 0.457, 'recomputed_kg': 0.465, 'note': 'glider 132.25 g (component budget ×1.15) + reel 85 + 15 Wh pack 100 + boost 10 + holster 60 + belt 70 g; wand ≈8 g missing'},
 'lineExposure': {'note': 'dev columns reproduced: line p10 height 1/2/3 m behind the feet 0.466/0.454/0.77 m; ≥5 cm of line <0.3 m 1–3 m behind in 20.3 % of riding-with-line time (round-3 holster 7.4 %): the wand trades trip exposure for head clearance'},
}
# by wind
from collections import defaultdict
g = defaultdict(list)
for r in rows:
    g[('tail%s' % r['U']) if r['dir'] == 'tail' else ('U%s' % r['U'])].append(r); g['dir_' + r['dir']].append(r)
part['byWindAvail'] = {k: {'n': len(v), 'claimed': round(sum(x['dev']['avail'] or 0 for x in v) / len(v), 2), 'recomputed': round(sum(x['availSilhouette'] for x in v) / len(v), 2)} for k, v in sorted(g.items())}
part['envelope']['availOwnByDir'] = {k[4:]: v['recomputed'] for k, v in part['byWindAvail'].items() if k.startswith('dir_')}
part['offGrid'] = {
 'tailSweep_gateOn_3to6_step0.25_s11-13': [{'id': r['id'], 'launched': not r['gated'], 'avail': r['availSilhouette'], 'keMax': r['keMax'], 'headClear': r['headClear']} for r in ts if not r['gated']] + [{'refused': [r['id'] for r in ts if r['gated']]}],
 'cross_head_7p5': [{'id': r['id'], 'avail': r['availSilhouette'], 'keMax': r['keMax'], 'headClear': r['headClear'], 'where': r['headClearWhere']} for r in og],
 'preRunWindHistory': {'availDev': round(sum(r['dev']['avail'] or 0 for r in ph) / 48, 3), 'availOwn': round(sum(r['availSilhouette'] for r in ph) / 48, 3), 'gated': sum(r['gated'] for r in ph), 'keMax': max(r['keMax'] for r in ph), 'headClearMin': min(r['headClear'] for r in ph if not r['gated']), 'fsP90': pct([r['fsSubject'] for r in ph if not r['gated']], 0.9), 'changedCases': ['crossL6_s13', 'crossR6_s13', 'crossL9_s13', 'crossR9_s13 (≈38–40 % → ≈83 %)']},
}
part['physics'] = [
 {'assumption': 'Micro digital servo mount (ES9251 II class) with ≥6 Hz loaded small-signal bandwidth, 0.3° dead band, 0.5° backlash, ≤5 ms FC latency', 'devClaim': 'jitter p90 2.45 °/s', 'evidence': 'auditor: 4 Hz → 4.44, 3 Hz → 6.30 (12-case subset); dev: 50 Hz PWM → 3.61, 20 ms latency → 3.58, all pessimistic → 7.66', 'verdict': 'unverified, load-bearing for jitter', 'killTest': 'bench: step/sine response of the servo with the 27 g camera at −10 °C; kill if −3 dB bandwidth <5 Hz or dead band >0.5°'},
 {'assumption': 'Lift-ride sleep 0.05 W for the whole hip unit', 'devClaim': 'endurance 53.1 min', 'evidence': 'MCU stop + M10 GNSS power-save ≈0.02–0.05 W is plausible, but boost/reel driver quiescent, radio link to the glider/phone and an awake wind estimator for pre-run history push it to 0.15–0.3 W → 49.6–45.1 min; 0.5 W → 40.3 FAIL', 'verdict': 'plausible but optimistic; margin ≤8 min', 'killTest': 'measure hip-unit sleep current incl. boost/driver leakage at −10 °C; kill if >0.35 W'},
 {'assumption': 'Tail gate 3.0 m/s on the shared estimate keeps launches ≤4 m/s true tail', 'devClaim': 'safe in all 48 and off-grid tail 2–6', 'evidence': 'auditor tail 3–6 m/s (0.25 steps, s11–13): all ≥3.5 refused, launched tail3/3.25 s12 safe (KE 12.5 J, 1.36 m); but crossL7.5_s11 0.934 m', 'verdict': 'safe in tail by refusing; cross 7.5 off-grid fail', 'killTest': 'field: deep-stall drop next to a standing rider in 7–8 m/s crosswind with a head-height marker; kill if <1.0 m'},
 {'assumption': 'Deep-stall drop / snow-pull / holster capture', 'devClaim': 'capture windows ≤2.1 s, no whip with the reel KE governor', 'evidence': 'own contiguous windows 2.04–2.10 s per stow (two stows per run in 2 cases)', 'verdict': 'compliant as modelled; post-stall dynamics not modelled', 'killTest': '50 holster captures at −10 °C; kill if <95 % first-time capture'},
 {'assumption': 'Conductive 0.6 mm litz leash 1.3 Ω/m after flex', 'devClaim': 'endurance 53.1 (46.3 at 5.2 Ω/m)', 'evidence': 'dev sensitivity reproduced in round 3', 'verdict': 'unverified', 'killTest': 'flex-life test 10k cycles on a 25 mm drum; kill if >7 Ω/m or break <50 N'},
]
part['definitionChecks'] = [
 {'metric': 'avail artefact', 'issue': "shared rule text says 'overlaps the subject's bounding box'; dev tests overlap with body capsules at leash vertices only and omits the Ø3 mm wand. Literal 6-point box: 42.75 %; body silhouette (own, densified, wand incl.): 48.03 %; dev 49.41 %", 'favours': 'towglider (small; verdict unchanged)'},
 {'metric': 'headClear', 'issue': 'helmetAt reproduced (1.061); worn wand excluded as a rigid member, reported 1.165 m', 'favours': 'neutral'},
 {'metric': 'jitter', 'issue': 'servo model is a real per-axis model with limits (A3-X-08 met), but the mount command uses the true LOS and post-reframe detection noise is white 1 %', 'favours': 'towglider (small)'},
 {'metric': 'endurance', 'issue': 'own energy accounting with lift sleep; no cell heater (pack is discharge-only, consistent with components.js)', 'favours': 'towglider (sleep figure)'},
 {'metric': 'gates', 'issue': 'gate/estimate via shared windEstimate (no oracle); flight guidance uses a noisy relative fix; KE governor reads filtered true ground speed (GNSS-class, small)', 'favours': 'neutral'},
]
F = lambda i, s, t, d, e: {'id': i, 'severity': s, 'title': t, 'detail': d, 'evidence': e}
part['findings'] = [
 F('A4-TG-01', 'major', 'avail fails structurally: 48.0 % own (49.4 % claimed); 17/48 runs never launch', f"Launched runs {mean([r['availSilhouette'] for r in fl])} %; every tail ≥3.5 case and tail3 s11/s13 refused; tail band 3.5–5.5 = 0 %. Pre-run wind history (dev request) only recovers the 4 cross s13 first rides → 53.1 %. Upper bound if everything flew ≈74–76 %: cannot reach 80 % even then.", 'out_s0/s1.json, out_preHist_s*.json'),
 F('A4-TG-02', 'major', 'Off-grid crosswind 7.5 m/s: headClear 0.934 m with the gate on', 'crossL7.5_s11: deep-stall drop at the final stop passes 0.934 m from helmetAt while the rider stands (KE 13.7 J). Dev reported it in offGridOther but claims "safe in all 48"; the safety claim is grid-bound like round 3.', 'out_crossL75.json; dev results.json offGridOther'),
 F('A4-TG-03', 'major', 'Jitter pass depends on an ASSUMED ≥6 Hz loaded servo bandwidth', f"Servo model is now physical (dead band, backlash, slew, PWM, latency) — A3-TG-04 substantively addressed — but 4 Hz → p90 {pct([r['fsSubject'] for r in sv4],0.9)} °/s, 3 Hz → {pct([r['fsSubject'] for r in sv3],0.9)}. No datasheet bandwidth for a 2.5 g servo with a 27 g camera; mount pointing commanded from the true LOS.", 'out_servo3.json, out_servo4.json'),
 F('A4-TG-04', 'minor', 'Endurance pass rests on a 0.05 W lift sleep', f"Recomputed 53.09 (exact). 0.15 W → {endur(0.15)}, 0.3 W → {endur(0.3)}, 0.5 W → {endur(0.5)} (FAIL), idle → 38.26. The dev's own pre-history request needs the wind estimator awake ≥10 s before push-off (geofence wake at the lift top is enough; continuous on-lift sensing is not compatible with 0.05 W). Camera/boost wake latency (≈2–4 s) is not modelled but fits inside the launch sequence.", 'make_part.py endurance variants'),
 F('A4-TG-05', 'minor', 'Artefact check under-counts: leash tested at vertices only, wand omitted', f"Own densified projection: leash ≥2 px over the body in {mean([r['artLeashSilPct'] for r in fl])} % of riding samples (near-camera segment, z 0.3–0.6 m, 3–13 px, strongly defocused), wand (Ø3 mm, p50 1.45 px, max 2.57 px) {mean([r['artWandSilPct'] for r in fl])} %; avail −1.4 pp; literal bounding-box reading −6.7 pp.", 'out_s*.json artLeashSilPct/artWandSilPct'),
 F('A4-TG-06', 'minor', 'Wand missing from mass budget; wand distance overstated', 'WORN omits the 8 g wand (0.457 → 0.465 kg, still pass). Min distance of the worn rod (hinge to eyelet) to helmetAt 1.165 m, not the 1.36 m quoted for the eyelet.', 'design.js WORN; out_s*.json wandToHelmetMin'),
 F('A4-TG-07', 'minor', 'Pre-run wind history request: small avail gain, KE margin shrinks', f"With a 10 s pre-run window: 4 cross s13 runs fly their first ride (avail 53.1 %); no tail refusal changes; KE max {max(r['keMax'] for r in ph)} J (crossR6_s13, 0.7 J margin).", 'out_preHist_s*.json'),
 F('A4-TG-08', 'minor', 'Tail 3–6 m/s off-grid (0.25 steps, gate on) is safe because it is refused', f"39 runs: {sum(1 for r in ts if not r['gated'])} launched (tail3/3.25 s12: KE ≤12.47 J, headClear 1.356 m, avail 37 %), the rest refused; fixes A3-TG-01 for these seeds at the cost of avail.", 'out_tailSweep_*.json'),
 F('A4-TG-09', 'minor', 'Trip exposure higher with the wand', 'Line p10 ≈0.45 m at 1–2 m behind the feet; ≥5 cm of line below 0.3 m in 20.3 % of riding-with-line time (7.4 % with the round-3 holster). Resort permission gate.', 'dev ensemble trip columns (reproduced)'),
]
part['auditResponseCheck'] = [
 {'id': 'A3-TG-01', 'claim': 'fixed in the judged 48; off-grid bounded by the gate', 'check': 'confirmed for tail 3–6 (0.25 steps, s11–13): refused or safe; but crossL7.5_s11 0.934 m shows the grid-dependence persists in crosswind (A4-TG-02)'},
 {'id': 'A3-TG-02', 'claim': 'headClear 1.061 on helmetAt', 'check': 'reproduced exactly with own segment geometry; margin 6 cm'},
 {'id': 'A3-TG-03', 'claim': 'NOT fixed — avail fails', 'check': 'honest; own 48.0 % (49.4 claimed); pre-history would give 53.1 %'},
 {'id': 'A3-TG-04', 'claim': 'component servo/EIS model; conditional on bandwidth', 'check': 'model is real and limited; conditionality confirmed (4 Hz → 4.44)'},
 {'id': 'A3-TG-05', 'claim': 'sleep mode 0.05 W', 'check': 'arithmetic reproduced; the figure is optimistic (A4-TG-04)'},
 {'id': 'A3-TG-06', 'claim': 'trip quantified, partly mitigated', 'check': 'reproduced; exposure up vs round 3 (A4-TG-09)'},
 {'id': 'A3-TG-07', 'claim': 'envelope narrower', 'check': 'agreed'},
 {'id': 'A3-X-01/03/04/08', 'claim': 'adopted', 'check': 'helmetAt, bodyPx and ≥2 px adopted; artefact test incomplete (A4-TG-05)'},
]
part['safetyRegulatory'] = ['<250 g UAS on a 15 m conductive leash: EU C0/A1 operator registration; US VLOS; resort written permission is a hard gate', 'Leash ≈0.45 m above the snow 1–2 m behind the rider: trip/clothesline exposure for crossing skiers', 'Off-grid 7.5 m/s crosswind deep-stall drop 0.93 m from a standing rider\'s helmet', '48 V on a 0.6 mm line: insulation abrasion / snag fault handling unverified']
part['credibleEnvelope'] = 'Simulation-credible only as a light-wind camera: estimated tailwind <3 m/s, head/cross ≤6 m/s (9 m/s on grid seeds only; 7.5 m/s cross showed a 0.93 m head pass), carving rider 8–13 m/s on ≤20°, low-traffic pistes with permission; footage quality conditional on a ≥6 Hz loaded servo mount; endurance on a ≤0.3 W lift sleep.'
part['verdict'] = 'Reproduces exactly (48/48). Fails avail honestly and structurally (own 48.0 %, claimed 49.4 %; tail ≥3.5 m/s refused by design; even perfect flying of all cases tops out ≈75 %). Safe on the judged grid (KE 13.22 J, headClear 1.061 m) and in the off-grid tail band (by refusal), but not at crosswind 7.5 m/s (0.934 m). Jitter 2.45 °/s rests on an assumed ≥6 Hz servo; endurance 53 min on an optimistic 0.05 W sleep. Not usable as an all-conditions solo follow-cam; a light-wind research concept.'
json.dump(part, open(os.path.join(H, 'part.json'), 'w'), ensure_ascii=False, indent=1)
for k in order: print(k, metrics[k]['claimed'], metrics[k]['recomputed'], metrics[k]['verdict'])
