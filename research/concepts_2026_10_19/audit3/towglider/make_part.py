#!/usr/bin/env python3
"""Audit3 (round 3) part for towglider@0.4.0: merges recheck.mjs outputs (out_s0/out_s1 = 39 FULLRUN_CASES with the dev
values alongside, out_sens_* = jitter sensitivities on all flown cases, out_tail_edge* = off-grid tailwinds) into
out_recheck_all.json and part.json. Numerical uncalibrated simulation re-run on a copy of sim/; not physical verification."""
import json, os, statistics as st
from datetime import date

H = os.path.dirname(os.path.abspath(__file__))
R2 = os.path.dirname(os.path.dirname(H))
L = lambda f: json.load(open(os.path.join(H, f)))
rows = L('out_s0.json')['rows'] + L('out_s1.json')['rows']
order = [c for c in [r['id'] for r in rows]]
dres = json.load(open(os.path.join(R2, 'dev', 'towglider', 'results.json')))
dev = {r['id']: r for r in dres['ensemble']['rows']}
ens = dres['ensemble']

def pct(a, p):
    a = sorted(x for x in a if x is not None)
    return a[min(len(a) - 1, max(0, round(p * (len(a) - 1))))] if a else None
r3 = lambda x: round(x, 3) if isinstance(x, (int, float)) else x
fl = [r for r in rows if r['launched']]

# ---- reproduction of the dev ensemble path (R.summary per case vs dev/towglider/results.json rows)
KEYS = ['avail', 'pxMed', 'setupTime', 'ops', 'bodyForcePeak', 'keMax', 'headClear', 'endurance', 'azRange']
diffs, mx = [], 0.0
for r in rows:
    d = dev[r['id']]
    for k in KEYS:
        a, b = r['dev'].get(k), d.get(k)
        if a is None or b is None:
            if (a is None) != (b is None): diffs.append({'id': r['id'], 'k': k, 'rerun': a, 'claimed': b})
            continue
        mx = max(mx, abs(a - b))
        if abs(a - b) > 0.002: diffs.append({'id': r['id'], 'k': k, 'rerun': r3(a), 'claimed': b})

fs = [r['fsSubject'] for r in fl]
sens = {}
for f, lab in [('out_sens_eis015.json', 'EIS residual 0.15'), ('out_sens_eis025.json', 'EIS residual 0.25'), ('out_sens_db05.json', 'mount deadband 0.5° RMS')]:
    v = [x['fsSubject'] for x in L(f)['rows'] if x['fsSubject'] is not None]
    sens[lab] = {'n': len(v), 'p50': pct(v, .5), 'p90': pct(v, .9), 'max': max(v), 'over3': sum(x > 3 for x in v)}
edge = L('out_tail_edge2.json')['rows'] + L('out_tail_edge.json')['rows']
edgeRows = [{k: e[k] for k in ['id', 'launched', 'gates', 'avail', 'keMax', 'keArg', 'headClearBodyHead', 'headClearHelmetSimple', 'headClearWhere', 'fsSubject', 'ops', 'setupTime']} for e in edge]

A = [r['avail'] for r in rows]
uw = 15 * 0.75 * 0.85
Em, Fm = st.mean(r['E_J'] for r in fl), st.mean(r['filmS'] for r in fl)
endur = uw * 3600 / Em * Fm / 60
endurLift = uw * 3600 / (Em + rows[0]['idleW'] * 480) * Fm / 60
hcB = min((r['headClearBodyHead'], r['id']) for r in rows if r['headClearBodyHead'] is not None)
hcA = min((r['headClearHelmetSimple'], r['id']) for r in rows if r['headClearHelmetSimple'] is not None)
hcWhere = next(r['headClearWhere'] for r in rows if r['id'] == hcB[1])
nA = sum(1 for r in rows if r['headClearHelmetSimple'] is not None and r['headClearHelmetSimple'] < 1.0)
keR = max(rows, key=lambda r: r['keMax'])
azMean = st.mean(dev[r['id']]['azRange'] for r in fl)

summary = {
    'availMean': r3(st.mean(A)), 'availP10': pct(A, .1), 'availLaunched': r3(st.mean(r['avail'] for r in fl)), 'nNeverLaunched': sum(not r['launched'] for r in rows),
    'availDevColumnsOwnMask': r3(st.mean(r['availDevMaskOwnCount'] for r in rows)), 'availStrictFeetHead': r3(st.mean(r['availFeetHead'] for r in rows)),
    'pxMedOwnMean': r3(st.mean(r['pxMedOwn'] for r in fl)), 'pxMedFeetHeadMean': r3(st.mean(r['pxMedFeetHead'] for r in fl)), 'pxAgreeMinPct': min(r['pxAgreePct'] for r in fl),
    'fs': {'n': len(fs), 'p50': pct(fs, .5), 'p90': pct(fs, .9), 'max': max(fs), 'over3': sum(x > 3 for x in fs)},
    'keMax': keR['keMax'], 'keMaxCase': keR['id'], 'keArg': keR['keArg'], 'keUpperGround': max(r['keUpperGround'] for r in rows),
    'headClearBodyHead': hcB, 'headClearHelmetSimple': hcA, 'headClearWhere': hcWhere, 'casesBelow1mSimpleHelmet': nA,
    'captureWindowMaxS': max(r['captureWindowS'] for r in rows),
    'lineH1min': min(r['lineH1min'] for r in fl), 'lineH1p10median': pct([r['lineH1p10'] for r in fl], .5), 'lineH2min': min(r['lineH2min'] for r in fl), 'lineH2p10median': pct([r['lineH2p10'] for r in fl], .5),
    'bodyForce50max': max(r['bodyForce50'] for r in rows), 'opsP90': pct([r['ops'] for r in rows], .9), 'opsMax': max(r['ops'] for r in rows),
    'setupP90': pct([r['setupTime'] for r in rows], .9), 'setupMax': max(r['setupTime'] for r in rows),
    'endurance': r3(endur), 'enduranceLiftIdle': r3(endurLift), 'idleW': rows[0]['idleW'], 'azRangeMean': r3(azMean),
    'releases': sum(r['releases'] for r in rows), 'marginDrops': sum(r['margins'] for r in rows),
}
byU = {f'U{U}': {'claimed': ens['byWindSpeed'][f'U{U}']['avail']['mean'], 'recomputed': r3(st.mean(r['avail'] for r in rows if r['U'] == U))} for U in [0, 3, 6, 9]}
byDir = {d: r3(st.mean(r['avail'] for r in rows if r['dir'] == d)) for d in ['calm', 'head', 'tail', 'crossL', 'crossR']}
json.dump({'generated': str(date.today()), 'summary': summary, 'byWindAvail': byU, 'byDir': byDir, 'jitterSens': sens, 'tailEdge': edgeRows,
           'reproduction': {'cases': len(rows), 'maxAbsDiff': r3(mx), 'diffs': diffs}, 'rows': rows}, open(os.path.join(H, 'out_recheck_all.json'), 'w'), indent=1)

S = summary
M = {
 'avail': ('ensemble mean (39), riding mask, never-launched = 0', 72.104, S['availMean'], 'fail',
           f"own projection of the shared silhouette on the riding mask: {S['availMean']} % (p10 0); launched runs {S['availLaunched']} %; 6 tail 6/9 runs never launch (gate) and crossL9_s13/crossR9_s13 lose the whole first ride (≈40 %) to a gate false positive at t=0.5 s (windEstimate has no 10 s history at the top: 4.8 m/s estimated down-slope in a pure crosswind). Strict feet→head ≥300 px reading of the criterion: {S['availStrictFeetHead']} % (shared footage() box includes ski tips; cross-concept definition)"),
 'pxMed': ('mean of case medians (flown)', 535.614, S['pxMedOwnMean'], 'pass', f"own projection agrees with the dev column in ≥{S['pxAgreeMinPct']} % of riding frames; strict feet→head median {S['pxMedFeetHeadMean']} px (still ≥300). Needs a custom 66° M12 lens on the Thumb-2-class camera (ASSUMED, mass unchanged) and auto-zoom to the native-resolution limit"),
 'jitterRms': ('p90 footageStability subject RMS, flown cases', 1.918, S['fs']['p90'], 'conditional', f"reproduced exactly (n {S['fs']['n']}, max {S['fs']['max']}, 0 >3 °/s). Rests on ASSUMED residuals: EIS 8 %→15 %: p90 {sens['EIS residual 0.15']['p90']} (3 cases >3); 25 %: {sens['EIS residual 0.25']['p90']} (all 33 >3); mount deadband 0.15→0.5° RMS: {sens['mount deadband 0.5° RMS']['p90']} (all >3). The pass margin disappears at ≈15 % EIS residual"),
 'azRange': ('mean over flown cases', 63.885, S['azRangeMean'], 'pass', 'reproduced via the dev path (not independently re-derived); scripted shot plan'),
 'addedMass': ('design', 0.457, 0.457, 'pass', 'rebuilt: glider 115 g ×1.15 = 132.3 g (components.js + 43.5 g structure incl. +3 g chord hinges) + reel 85 + 15 Wh pack 100 + boost 10 + holster 60 + belt 70 g'),
 'bodyForcePeak': ('ensemble max, 50 ms mean of hip tension (+ capture impact)', 4.291, S['bodyForce50max'], 'pass', 'own 50 ms window weighting gives 5.3 N; ≪40 N'),
 'handsBusy': ('design', 0, 0, 'pass', 'arm tap while standing'),
 'setupTime': ('ensemble p90', 12.36, S['setupP90'], 'pass', f"recount from events: 1 s arm + rider-still→seated at the lift approach (max {S['setupMax']} s); the mid-run relaunch fires 0.26 s after push-off (no wait). Final hold extended to 30 s so the stow completes (declared, riding identical)"),
 'ops': ('ensemble p90 (max)', 1, S['opsP90'], 'pass', f"p90 1, max {S['opsMax']} on the grid; off-grid tail 3.5–4 m/s: 3 (refused relaunch → restow counted as not docked)"),
 'keMax': ('ensemble max', 14.006, S['keMax'], 'conditional', f"reproduced ({S['keMaxCase']} follow at 14.55 m/s; 0.9 J margin). Off-grid tailwinds BETWEEN the 3 and 6 m/s grid points fail: tail3.5_s11 21.8 J and tail4_s11 21.3 J (parked glider snow-pulled into the holster at 18 m/s ground speed when the gate refuses the relaunch at push-off, 1.6–1.9 m from the body → ground frame)"),
 'packVol': ('design estimate', 2.80, 2.80, 'pass', 'geometry now self-consistent: 55 % chord fold → folded chord 53 mm, panels on edge beside a 30×31.5 mm pod → 79.7 mm OD × 0.46 m = 2.30 L + reel 0.30 + cell 0.12 + boost/mouth 0.08 L. Unmeasured; hinge behind the spar and V-tail stowage not drawn; 7 % margin'),
 'endurance': ('from ensemble mean hip energy', 57.79, S['endurance'], 'conditional', f"reproduced; 1.3 Ω/m litz arithmetic checks (7×0.0508 mm Cu → 1.21 Ω/m). Not charged: hip electronics + reel idle ({S['idleW']} W) during the lift (8 min per run, the basis the shared enduranceMin uses for heaters) → {S['enduranceLiftIdle']} min FAIL unless the hip unit sleeps on the lift (not modelled). >≈7.5 Ω/m after flex cycling also fails"),
 'headClear': ('ensemble min (capture window excluded)', 1.011, S['headClearBodyHead'][0], 'conditional', f"reproduced with own segment geometry (wing tip–tip, nose–tail, every leash segment) to the model's bodyPoints head: {S['headClearBodyHead'][0]} m ({S['headClearBodyHead'][1]}, deep-stall drop at the rest stop, t 40.6 s, rider decelerating at 7.3 m/s). With the brief's upright helmet (pos + 1.61 m): {S['headClearHelmetSimple'][0]} m, {S['casesBelow1mSimpleHelmet']}/39 runs <1.0 m. Off-grid tail4_s12: 0.36 m. Capture window ≤{S['captureWindowMaxS']} s (declared ≤3 s, honest)"),
}
metrics13 = {k: {'stat': v[0], 'claimed': v[1], 'recomputed': v[2], 'verdict': v[3], 'note': v[4]} for k, v in M.items()}
cvr = [{'metric': k, 'claimed': v[1], 'recomputed': v[2] if not isinstance(v[2], tuple) else v[2][0], 'verdict': v[3]} for k, v in M.items()]

part = {
 'conceptId': 'towglider', 'modelVersion': 'towglider@0.4.0', 'auditor': 'audit3 (round 3)', 'generated': str(date.today()),
 'evidence': 'numerical uncalibrated simulation re-run on a copy of sim/; not physical verification',
 'scripts': ['audit3/towglider/recheck.mjs (--shard 0/2, 1/2 --dev; --fsOnly --eis 0.15/0.25, --db 0.5; --tailU 2,3.5 and 4,4.5,5,5.5)', 'audit3/towglider/make_part.py'],
 'reproduction': {'fullEnsembleRerun': {'matchesClaimed': len(diffs) == 0, 'cases': len(rows), 'maxAbsDiff': r3(mx), 'diffs': diffs[:20],
     'note': 'concept simulate(P, fullrunScenario(c)) on the copy reproduces every dev row (avail, pxMed, setup, ops, force, KE, headClear, endurance, azRange) to <0.002; the auditor\'s own riding-mask/projection avail is 0.0–0.2 pp lower per case (mask sample alignment), ensemble 72.01 vs 72.10'},
     'independent': {'avail': S['availMean'], 'jitterP90': S['fs']['p90'], 'keMax': S['keMax'], 'headClear': S['headClearBodyHead'][0], 'setupP90': S['setupP90'], 'opsP90': S['opsP90'], 'endurance': S['endurance']}},
 'metrics13': metrics13, 'claimedVsRecomputed': cvr,
 'envelope': {'def': 'rider 8–13 m/s carving on ≤≈20° groomed slopes; calm/head/cross wind ≤9 m/s; tail ≤3 m/s only (gate at 4.5 m/s estimated; 3.5–4 m/s true tail is an unsafe gap); not beginners (6 m/s: headClear 0.79 m, line through the body), not moguls (headClear 0.55 m, jitter 5.1), not ≥14 m/s (avail 64 %→6 %, release + walk-up 400–1300 s at ≥15 m/s)',
     'availLaunched': S['availLaunched'], 'availByDir': byDir, 'source': 'auditor 39-case recompute + dev runEnvelope/envelope (reproduced path)'},
 'byWindAvail': byU,
 'footageStability': {'n': S['fs']['n'], 'p50': S['fs']['p50'], 'p90': S['fs']['p90'], 'max': S['fs']['max'], 'over3': S['fs']['over3'], 'sensitivity': sens},
 'massBudget': {'claimed_g': 132.25, 'rebuilt_g': 132.25, 'worn_kg': 0.457, 'note': '115 g ×1.15; KE governor cap √(29.8/0.1323) = 15.0 m/s; the 14.0 J max is within 0.9 J'},
 'lineExposure': {'h1mMin': S['lineH1min'], 'h1mP10median': S['lineH1p10median'], 'h2mMin': S['lineH2min'], 'h2mP10median': S['lineH2p10median'],
     'note': 'auditor value over all riding samples with line out incl. sled tow (dev reports follow-only: min 0.12 m); leash lies on the snow 1–2 m behind the rider during launch/sled tow and is ≈0.25–0.45 m high when following → ankle/ski-tip trip line, not a neck clothesline; dev crossing scenario strike force 1.9 N (slip 0.18 N) and the line pulls through'},
 'physics': [
  {'assumption': 'Gyro EIS removes 92 % of the camera rotation rate (STAB.eis.ratio 0.08) and the closed-loop servo mount has 0.15° RMS deadband', 'devClaim': 'jitter p90 1.92 °/s', 'evidence': 'auditor full-ensemble sensitivities: 15 % → 2.99 (3 runs >3), 25 % → 4.65, deadband 0.5° → 3.51. No source for 8 % at 4:3 4K with a narrow M12 lens on a light glider', 'verdict': 'load-bearing, unmeasured', 'killTest': 'fly the camera+mount on a towed/hand-launched glider in gusts, measure residual subject rate after gyroflow-class EIS'},
  {'assumption': 'Tailwind gate on windEstimate at 4.5 m/s separates safe from unsafe', 'devClaim': 'no oracle wind; forced-launch proof at 6/9 m/s', 'evidence': 'gate uses windEstimate (model.js 278, 340–343; tailOracle only when windEst=0). But off-grid true tail 3.5–4 m/s launches and then fails KE (21–22 J) and headClear (0.36 m); the 39-case grid hides the gap; the t=0 estimate has no 10 s history (false refusals in crossL9/crossR9 s13)', 'verdict': 'gate real but threshold tuned to the grid; unsafe band 3.5–4.5 m/s', 'killTest': 'sweep tail 3–6 m/s in 0.25 m/s steps × seeds; field-test belt anemometer bias'},
  {'assumption': 'Deep-stall drop at stops lands the glider behind-beside the rider', 'devClaim': 'headClear 1.01 m', 'evidence': 'min occurs in the deep-stall drop while the rider is still decelerating; 1 cm margin on the concept\'s body model, <1 m with an upright helmet, 0.36 m in a 4 m/s tailwind', 'verdict': 'unproven, knife-edge', 'killTest': 'drop tests behind a moving rig with a head-height marker in 0–5 m/s tailwind'},
  {'assumption': 'Snow-pull capture into an 80 mm holster and auto-relaunch from a parked fold', 'devClaim': 'setup 12 s, ops 1', 'evidence': 'capture window 2.0–2.1 s; refused relaunch snow-pulls at 18 m/s ground speed (KE 21 J)', 'verdict': 'unverified mechanism', 'killTest': 'snow-pull 50 captures at 0–18 m/s, count jams/damage'},
  {'assumption': '1.3 Ω/m 2×7/44 AWG litz leash at 0.4 g/m, 70 N, flex life on a 25 mm drum', 'devClaim': 'endurance 57.8 min', 'evidence': 'resistance arithmetic correct; flex life and Ω after cycling unmeasured; endurance ignores lift-time idle (→39 min)', 'verdict': 'plausible, conditional', 'killTest': 'cycle 10 000 reel bends at −10 °C, measure Ω/m and break'},
 ],
 'definitionChecks': [
  {'metric': 'avail', 'issue': 'shared env.footage() subjectPx = vertical extent of feet/head/shoulders/ski tips, not feet→head as criteria.js words it; from an elevated rear camera the skis add ≈45 % (537 vs 373 px median); strict reading → avail 52 %', 'favours': 'all concepts using env.footage (cross-concept; towglider auto-zoom sits at the box limit)'},
  {'metric': 'endurance', 'issue': 'idle power during the lift is not charged (shared rule charges heaters over lift time)', 'favours': 'towglider (57.8 → 39.0 min if the hip unit stays on)'},
  {'metric': 'headClear', 'issue': 'helmet = bodyPoints head (0.12 m forward of the hip line, leaning with the turn) vs brief approximation pos + 1.61 m up: 1.011 vs 0.859 m', 'favours': 'towglider'},
  {'metric': 'keMax/headClear', 'issue': 'ensemble grid has no tailwind between 3 and 6 m/s, exactly where the 4.5 m/s gate is', 'favours': 'towglider'},
  {'metric': 'setupTime', 'issue': 'final hold extended 10→30 s (declared); setup counts arm 1 s + seated time; mid-run rest costs no wait (verified 0.26 s relaunch)', 'favours': 'neutral'},
 ],
 'findings': [
  {'id': 'A3-TG-01', 'severity': 'major', 'title': 'Unsafe tailwind gap between the ensemble grid points (3.5–4 m/s): KE 21–22 J, head clearance 0.36 m', 'detail': 'Off-grid runs (same seeds): tail3.5_s11 KE 21.8 J, ops 3; tail4_s11 KE 21.3 J, headClear 0.93 m, ops 3; tail4_s12 headClear 0.36 m (deep-stall drop overtaken by the tailwind at the rest stop). Causes: the 4.5 m/s gate on a ±1 m/s biased estimate lets 3.5–4.5 m/s tailwinds launch, and a refused relaunch snow-pulls the parked glider into the holster at ≈18 m/s ground speed. The 39-case pass on keMax/headClear is a grid artefact.', 'evidence': 'audit3/towglider/out_tail_edge.json, out_tail_edge2.json'},
  {'id': 'A3-TG-02', 'severity': 'major', 'title': 'headClear passes by 1 cm only on the concept\'s own head model; <1.0 m in 9/39 runs with the brief\'s helmet approximation', 'detail': 'Minimum 1.011 m (crossL9_s12, deep-stall drop at the rest stop while the rider decelerates). Same geometry to an upright helmet at pos + 1.61 m: 0.859 m. Dev scenarios also show 0.79 m (beginner 6 m/s), 0.55 m (moguls), 0.92 m (dock variant).', 'evidence': 'audit3/towglider/out_recheck_all.json; dev results.json runEnvelope'},
  {'id': 'A3-TG-03', 'severity': 'major', 'title': 'avail fails (72.0 %) for a structural reason: the tailwind gate refuses 6/39 runs and its t=0 estimate also refuses whole rides in 9 m/s crosswind', 'detail': 'Launched runs 85.1 % (passes); tail 28 %, cross 82 %, head 90 %. crossL9_s13/crossR9_s13 lose the first ride because windEstimate at t=0.5 s has no history (single sample + bias = 4.8 m/s down-slope in a pure crosswind).', 'evidence': 'out_recheck_all.json byDir; events of crossL9_s13'},
  {'id': 'A3-TG-04', 'severity': 'major', 'title': 'Jitter pass rests on an 8 % EIS residual and 0.15° mount deadband (both ASSUMED)', 'detail': 'p90 1.92 reproduced; 15 % residual → 2.99 (edge), 25 % → 4.65, 0.5° deadband → 3.51 °/s (fail). Verdict conditional until measured.', 'evidence': 'out_sens_eis015/025.json, out_sens_db05.json'},
  {'id': 'A3-TG-05', 'severity': 'minor', 'title': 'Endurance omits lift-time idle power (39 min if the hip unit stays on)', 'detail': '0.66 W (reel idle 0.3 + hip electronics 0.3 + stowed glider) × 8 min lift per run is not charged; needs a modelled sleep mode with GNSS geofence wake.', 'evidence': 'make_part.py summary.enduranceLiftIdle'},
  {'id': 'A3-TG-06', 'severity': 'minor', 'title': 'Leash lies on the snow / ≤0.45 m high 1–2 m behind the rider', 'detail': 'Own line-height recompute incl. sled tow: min 0.004 m, p10 ≈0.25–0.43 m. Low trip-line rather than clothesline; dev crossing strike force ≤1.9 N with pull-through. Documented, not judged.', 'evidence': 'out_recheck_all.json summary.line*'},
  {'id': 'A3-TG-07', 'severity': 'minor', 'title': 'Narrow rider envelope', 'detail': 'avail ≥80 % only at 8–13 m/s and ≤≈20°; ≥15 m/s or 24° the glider is released and the walk-up costs 400–1300 s; beginners/moguls fail headClear.', 'evidence': 'dev results.json envelope/runEnvelope (reproduced path)'},
 ],
 'auditResponseCheck': [
  {'id': 'A2-TG-01', 'claim': 'avail 85.2 % launched, 72.1 % overall', 'check': 'reproduced (85.1 / 72.0); real change (narrow lens + stabilised mount); still FAIL overall'},
  {'id': 'A2-TG-02', 'claim': 'windEstimate gate + airspeed-margin rule', 'check': 'real: gate reads windEstimate (no oracle); but threshold leaves a 3.5–4.5 m/s unsafe band (A3-TG-01) and the dev\'s own "head ≥0.98 m" for the slow tailwind case is below 1.0'},
  {'id': 'A2-TG-03', 'claim': 'jitter p90 1.92, EIS 15 % → 2.99, 25 % → 4.65', 'check': 'reproduced exactly on all 33 flown cases'},
  {'id': 'A2-TG-04', 'claim': 'packVol 2.80 L with 55 % chord fold', 'check': 'arithmetic and section geometry consistent; unmeasured'},
  {'id': 'A2-TG-06', 'claim': '1.3 Ω/m litz, endurance 57.8', 'check': 'arithmetic correct; lift idle not charged (A3-TG-05)'},
  {'id': 'A2-X-07', 'claim': 'headClear 1.01 PASS', 'check': 'reproduced on own geometry but 1 cm margin and grid-dependent (A3-TG-01/02)'},
 ],
 'safetyRegulatory': [
  'Resort written permission (tethered flying object on piste) — not obtained.',
  'Leash on/near the snow behind the rider during launch and sled tow: trip hazard for following skiers.',
  'Glider (132 g) at ≤14 J in the 39-case grid but 21–22 J and 0.36 m from the head in 3.5–4 m/s tailwind (off-grid).',
  'Sub-250 g tethered glider: tethered-aircraft rules vary; EU C0 class weight but follow-me/tether rules unclear.',
 ],
 'credibleEnvelope': 'Simulation-credible only for intermediate carving riders at 8–13 m/s on ≤≈20° groomed, low-traffic pistes, calm/head/cross wind ≤9 m/s and tailwind ≤3 m/s, AND an EIS/mount that keeps ≤≈12 % residual, a holster that captures a snow-pulled folded glider, and a leash surviving reel flexing. Tailwind 3.5–4.5 m/s is unsafe as modelled; ≥4.5 m/s no flight.',
 'verdict': 'Reproduces exactly (39/39). Fails the judged avail (72.0 %; launched runs 85.1 %). Passes the other 12 on the grid, but jitter, keMax, endurance and headClear are conditional: the 1 cm head clearance and 0.9 J KE margin hold only at the grid winds — an off-grid 3.5–4 m/s tailwind gives 21–22 J and a 0.36 m head pass — and jitter rests on an assumed 8 % EIS residual. Lowest user burden of the field (ops 1, setup 12 s, 0.46 kg worn, 2.8 L), but not a usable product until the tailwind band and stop/drop behaviour are made safe.',
}
json.dump(part, open(os.path.join(H, 'part.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps(cvr, ensure_ascii=False))
print(json.dumps(summary, ensure_ascii=False)[:1500])
