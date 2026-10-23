#!/usr/bin/env python3
"""Audit3 (round 3) kite2 part: merges recheck.mjs outputs (out_part0/1.json), spot_actuators and sensitivity outputs
into out_recheck_all.json and part.json. Numerical uncalibrated simulation re-run on a copy of sim/; not physical verification."""
import json, os, statistics as st
from datetime import date

H = os.path.dirname(os.path.abspath(__file__))
R2 = os.path.dirname(os.path.dirname(H))
L = lambda *p: json.load(open(os.path.join(*p), encoding='utf-8'))
rows = L(H, 'out_part0.json')['rows'] + L(H, 'out_part1.json')['rows']
order = {c: k for k, c in enumerate([r['id'] for r in L(R2, 'dev', 'kite2', 'ensemble_rows.json')['rows']])}
rows.sort(key=lambda r: order[r['id']])
assert len(rows) == 39
spot = L(H, 'out_spot_actuators.json')['cases']
sens = {n: L(H, f'out_sens_{n}.json') for n in ('hc_0p5', 'hc_0p5_speed3p7')}
dev = L(R2, 'dev', 'kite2', 'results.json')
DM = dev['ensemble']['metrics']
fr = dev['scenarios']['fullrun']['std12']


def pc(a, q):
    a = sorted(x for x in a if isinstance(x, (int, float)))
    return a[min(len(a) - 1, max(0, round(q * (len(a) - 1))))]


A = lambda k: [r['aud'][k] for r in rows]
r2 = lambda v: round(v, 2)
# reproduction
maxdiff, diffs = 0, []
for r in rows:
    for k, v in r['devRerun'].items():
        c = (r['claimed'] or {}).get(k)
        if isinstance(v, (int, float)) and isinstance(c, (int, float)):
            d = abs(v - c); maxdiff = max(maxdiff, d)
            if d > 0.002: diffs.append({'id': r['id'], 'k': k, 'claimed': c, 'rerun': v})
fsv = A('fsSubject')
agg = {
    'avail': {'mean': r2(st.mean(A('avail'))), 'p10': pc(A('avail'), .1), 'min': min(A('avail'))},
    'availStrictArt0': {'mean': r2(st.mean(A('availStrictArt0')))},
    'pxMed': r2(st.mean(A('pxMed'))), 'azRange': r2(st.mean(A('azRange'))),
    'fs': {'n': len(fsv), 'p50': pc(fsv, .5), 'p90': pc(fsv, .9), 'max': max(fsv), 'over3': sum(1 for x in fsv if x > 3)},
    'keMax': max(A('keMax')), 'headClear': min(A('headClear')), 'headClearInclExcl': min(A('headClearInclExcluded')),
    'headClearVertHelmet': min(A('headClearVertHelmet')), 'excludedMaxDur': max(A('excludedMaxDur')),
    'boomSeg': min(A('boomSegToHelmet')), 'boomTip': min(A('boomTipToHelmet')),
    'lineH1min': min(A('lineH1min')), 'lineH1p10ofMins': pc(A('lineH1min'), .1), 'lineH2min': min(A('lineH2min')), 'lineH2p10ofMins': pc(A('lineH2min'), .1),
    'F50': max(A('bodyForce50')), 'Traw': max(A('tensionRawMax')),
    'setupP90': pc(A('setupTime'), .9), 'setupMax': max(A('setupTime')), 'opsP90': pc(A('ops'), .9), 'opsMax': max(A('ops')),
    'endurance': r2(st.mean(A('endurance'))), 'enduranceNoRegen': r2(st.mean(A('enduranceNoRegen'))), 'enduranceMin': min(A('endurance')),
    'winch': {k: (min(r['aud']['winch'][k] for r in rows), max(r['aud']['winch'][k] for r in rows)) for k in rows[0]['aud']['winch']},
    'boom': {k: (min(r['aud']['boom'][k] for r in rows), max(r['aud']['boom'][k] for r in rows)) for k in rows[0]['aud']['boom']},
}
byU = {f'U{U}': {'claimed': r2(st.mean([r['claimed']['avail'] for r in rows if r['U'] == U])), 'recomputed': r2(st.mean([r['aud']['avail'] for r in rows if r['U'] == U]))} for U in (0, 3, 6, 9)}
byDir = {d: r2(st.mean([r['aud']['avail'] for r in rows if r['dir'] == d])) for d in ('calm', 'head', 'tail', 'crossL', 'crossR')}
json.dump({'generated': str(date.today()), 'agg': agg, 'byU': byU, 'byDir': byDir, 'reproduction': {'maxAbsDiff': maxdiff, 'diffs': diffs},
           'rows': [{'id': r['id'], **{k: v for k, v in r['aud'].items() if k not in ('stops', 'excludedWindows')}} for r in rows]},
          open(os.path.join(H, 'out_recheck_all.json'), 'w'), indent=1, ensure_ascii=False)

C = {'avail': 81.52, 'pxMed': 522.6, 'jitterRms': 1.66, 'azRange': 58.14, 'addedMass': fr['addedMass']['value'], 'bodyForcePeak': 28.14, 'handsBusy': 0,
     'setupTime': 4.7, 'ops': 1, 'keMax': 12.92, 'packVol': 2.86, 'endurance': 56.94, 'headClear': 1.10}
m13 = {
 'avail': {'stat': 'ensemble mean (39), availMask riding time', 'claimed': C['avail'], 'recomputed': agg['avail']['mean'], 'verdict': 'conditional',
           'note': f"reproduced exactly (p10 {agg['avail']['p10']}); passes by 1.5 pp only under the developer's tolerance art<3 % of subject height. The actively pointed boom is counted as artefact (good) but is a ≈4.5 px stub over the rider in 100 % of filming frames: literal criteria.js text (no ≥1 px artefact over the subject) → {agg['availStrictArt0']['mean']} %. Also hc 0.5 → 80.04 %, L/D 0.6 → 73.0 %, mass +15 % → 79.4 %: knife-edge."},
 'pxMed': {'stat': 'mean of case medians (own footage() on productCam)', 'claimed': C['pxMed'], 'recomputed': agg['pxMed'], 'verdict': 'conditional', 'note': 'needs a custom 55–65° HFOV ≤20 g 4K M12 optic (ASSUMED part)'},
 'jitterRms': {'stat': 'p90 footageStability subject RMS over 39 flown cases', 'claimed': C['jitterRms'], 'recomputed': agg['fs']['p90'], 'verdict': 'pass', 'note': f"max {agg['fs']['max']} (tail9); pod pendulum/flutter ASSUMED, no round-canopy oscillation/coning model"},
 'azRange': {'stat': 'mean of case p5–p95 (0.2 Hz LP)', 'claimed': C['azRange'], 'recomputed': agg['azRange'], 'verdict': 'pass', 'note': 'min 46.2° (13° margin lost vs round 2 at the honest L/D)'},
 'addedMass': {'stat': 'design', 'claimed': C['addedMass'], 'recomputed': 0.667, 'verdict': 'pass', 'note': 'boom 148 g (incl. 2×40 g gimbal motors) and winch 70 g ARE in the budget; actuator sizing (see findings) may add mass but 1.5 kg has large margin'},
 'bodyForcePeak': {'stat': 'max raw 50 ms mean at integration step', 'claimed': C['bodyForcePeak'], 'recomputed': agg['F50'], 'verdict': 'pass', 'note': f"20 ms-grid recompute 28.07 N; instantaneous max {agg['Traw']} N; opening-shock factor 1.8 ASSUMED"},
 'handsBusy': {'stat': 'design', 'claimed': 0, 'recomputed': 0, 'verdict': 'pass', 'note': 'no manual actions while moving in any case'},
 'setupTime': {'stat': 'p90 (arm 2 s + simulated wait to stowed at every stop)', 'claimed': C['setupTime'], 'recomputed': agg['setupP90'], 'verdict': 'pass', 'note': f"max {agg['setupMax']} s (tail9_s12); docking before the stop depends on the 45° trumpet capture + 2.5 s snuff/retract (ASSUMED)"},
 'ops': {'stat': 'p90 (max)', 'claimed': C['ops'], 'recomputed': agg['opsP90'], 'verdict': 'pass', 'note': f"max {agg['opsMax']}; standing stows require facing into the wind (wrong facing → 3 ops, procedural)"},
 'keMax': {'stat': 'ensemble max, ground frame >1.5 m from body capsules', 'claimed': C['keMax'], 'recomputed': agg['keMax'], 'verdict': 'pass', 'note': 'robust to L/D, reef, mass, hc 0/0.5 (12.9–13.1 J); rests on the KE governor (2 N soft clutch, off → 21.9 J)'},
 'packVol': {'stat': 'design', 'claimed': C['packVol'], 'recomputed': 2.86, 'verdict': 'conditional', 'note': '260×110×100 mm ASSUMED layout (boom 5×0.26 m sections, gimbal, 14 m winch, 12 Wh, canopy, KCU+0.2 m arm); arithmetic correct, 0.14 L margin, not a CAD/fold measurement; a geared gimbal (finding A3-K2-03) would not fit unchanged'},
 'endurance': {'stat': 'mean from per-run mean power, heated', 'claimed': C['endurance'], 'recomputed': agg['endurance'], 'verdict': 'pass', 'note': f"{agg['enduranceNoRegen']} min without regeneration credit; head-9 cases 40 min; gimbal 1.5 W likely low (A3-K2-03)"},
 'headClear': {'stat': 'ensemble min, own geometry (bodyPoints head; airborne KCU, canopy, line beyond boom tip)', 'claimed': C['headClear'], 'recomputed': agg['headClear'], 'verdict': 'conditional',
               'note': f"reproduced (1.105 m, 10 cm margin). Declared exclusion windows {min(A('excludedMaxDur'))}–{agg['excludedMaxDur']} s (≤3 s OK; inside them {agg['headClearInclExcl']} m). The worn, actively driven 1.2 m boom passes {agg['boomSeg']} m from the helmet centre (tip {agg['boomTip']} m) — outside the 'airborne' definition but a rigid strike hazard. Brief's vertical helmet approximation (pos+1.61 m) gives {agg['headClearVertHelmet']} m — not physical in 45° carving lean but shows the margin depends on the lean model."},
}
rowsT = [{'metric': k, 'claimed': v['claimed'], 'recomputed': v['recomputed'], 'verdict': v['verdict']} for k, v in m13.items()]
spot_s = {k: {'reelInUnderLoad_m_s': v['default']['reelInUnderLoadMax_m_s'], 'motoringW': v['default']['motoringPowerMax_W'], 'backEmf_V': v['default']['backEmf_V'],
              'artShareGt0': v['default']['shareArtGt0'], 'artWpx': v['default']['artWidthPxP50'], 'avail_noBoomArtefact': v['noBoomArtefact_boomDiam0']['avail'], 'avail': v['default']['avail']} for k, v in spot.items()}

findings = [
 {'id': 'A3-K2-01', 'severity': 'major', 'title': 'Clothesline hazard unfixed: boom/line 0.80–1.0 m above the snow 1–2 m behind the rider in every run',
  'detail': f"Own recompute (FILM, riding): 1 m behind the pivot min {agg['lineH1min']} m (p10 of case minima {agg['lineH1p10ofMins']}), 2 m behind min {agg['lineH2min']} m. Developer's own ≥2.0 m gate fails in 39/39 runs; developer states no body exit can fix it in carving. Bystander line force 4.5 N (crossing pole), boom impact 1.7 N·s ≈34 N at shoulder height. Kills piste use without written resort permission; this is an envelope limit (empty/low-traffic slopes), not a metric pass.",
  'evidence': 'audit3/kite2/out_recheck_all.json (lineH1min/lineH2min); dev audit_response A2-K2-04'},
 {'id': 'A3-K2-02', 'severity': 'major', 'title': 'avail pass depends on tolerating a permanent boom artefact (<3 % of subject height) and is knife-edge',
  'detail': f"The boom is correctly counted in A.art, but it is over the rider in 100 % of filming frames (≈4.5 px wide end-on stub, art p50 0.6–1.1 %). criteria.js says no ≥1 px artefact over the subject → strict avail 0 %. With the 3 % tolerance (also used in round 2) avail 81.5 % reproduces exactly, margin 1.5 pp: hc 0.5 → 80.0 %, mass +15 % → 79.4 %, reefed-glide 70 % → 79.6 %, L/D 0.6 → 73.0 %, all-adverse 63.5 %. Tailwind ≥6 m/s bins 39–80 %.",
  'evidence': 'audit3/kite2/out_spot_actuators.json; out_sens_hc_0p5.json; dev results.json sensitivity'},
 {'id': 'A3-K2-03', 'severity': 'major', 'title': 'Active boom gimbal is undersized vs its own simulated demand',
  'detail': f"Boom 60 g over 1.2 m: static gravity torque ≈{agg['boom']['gravTorque_Nm'][0]} N·m horizontal, p99 dynamic torque {agg['boom']['torqueP99_Nm'][0]}–{agg['boom']['torqueP99_Nm'][1]} N·m (pointing τ 20 ms), plus a ≈90 g KCU seated on the tip during each 2.8 s stow (≈1 N·m). Budget: 2 × 40 g brushless gimbal motors, 1.5 W, kill test written at 0.13 N·m. Gimbal motors of that class deliver ≈0.05–0.15 N·m; a geared actuator adds mass/volume/power. The active boom is load-bearing: passive boom ablation → avail 42.9 %.",
  'evidence': 'audit3/kite2/out_recheck_all.json agg.boom; sim/js/concepts/kite2/model.js PDEF (boomMass, tauBoomAct, pGimbal); dev results sensitivity passive_boom'},
 {'id': 'A3-K2-04', 'severity': 'major', 'title': 'Heave-compensating winch is idealised: perfect zero-lag feed-forward, no motor speed/voltage limit',
  'detail': f"nuHC = exact exit velocity along the line (no sensor lag/noise) added after the slew limiter; reel-in under load reaches {min(v['reelInUnderLoad_m_s'] for v in spot_s.values())}–{max(v['reelInUnderLoad_m_s'] for v in spot_s.values())} m/s at 8–16 N, motoring peaks 93–166 W, line acceleration up to {agg['winch']['accMax'][1]} m/s². With the model's own Kt 0.012 N·m/A, 6:1, 12 mm drum this needs ≈40–50 V back-EMF (max line speed 1.85 m/s at 11.1 V); power and I²R loss are therefore computed for an impossible operating point. A drone-class motor with lower gearing could plausibly do it (not a kill), but the 70 g winch budget and the endurance figure are unverified. Sensitivity: hc 0.5 → avail 80.04 % (pass by 0.04 pp), KE 13.1 J; hc 0 → 79.7 % FAIL (dev ablation). No parameter caps total line speed, so a true speed-limit test needs a model change.",
  'evidence': 'audit3/kite2/out_spot_actuators.json; out_sens_hc_0p5*.json; model.js winch block'},
 {'id': 'A3-K2-05', 'severity': 'minor', 'title': 'headClear margin is 10 cm and excludes the worn boom (0.42 m from the helmet centre)',
  'detail': f"Own geometry reproduces 1.105 m (crossL cases, line just beyond the boom tip). Declared exclusion windows 2.76–2.82 s (≤3 s, compliant); inside them the seated KCU is {agg['headClearInclExcl']} m from the helmet centre. Boom segment {agg['boomSeg']} m, tip {agg['boomTip']} m from the helmet centre whenever extended — not 'airborne' under criteria.js, but an actuated rigid tube near the head in a fall/collision. Fault case (winch failure at a stop) 0.815 m (dev).",
  'evidence': 'audit3/kite2/out_recheck_all.json'},
 {'id': 'A3-K2-06', 'severity': 'minor', 'title': 'Wind gates honest; in-flight control and tip-pitot check use noise-free local true wind',
  'detail': 'Launch, park, stop and retrieve-planning gates read windEstimate() (fullrun.js) — compliant. The launch confirmation (tip pitot, model.js ~L516) and the in-flight wind-window controller (eaW from true local wind, 40 ms filter) are noise-free sensor idealisations, not oracle case-mean wind. Setup is simulated (arm tap 2 s constant only); ops from the event log.',
  'evidence': 'grep windTrue/wEst in sim/js/concepts/kite2/model.js'},
 {'id': 'A3-K2-07', 'severity': 'minor', 'title': 'Polar sensitivities disclosed honestly; avail fails at the documented-low end',
  'detail': 'Default L/D lowered to 0.75 (MC-1-1C) and reefed retention 0.5 (no data). KE, force and headClear no longer depend on them (verified by dev sensitivities, KE 12.9–13.0 J). avail: L/D 0.6 → 73.0 %, retention 0.7-loss → 79.6 %, mass +15 % → 79.4 %, combined 63.5 % — the concept passes only at nominal assumptions.',
  'evidence': 'dev results.json sensitivity'},
]
physics = [
 {'assumption': 'Slotted 0.40 m² round canopy L/D 0.75 unreefed, 50 % of glide kept when reefed to 0.25 area', 'devClaim': 'safety metrics independent of L/D; avail ≥80 % needs L/D ≳0.7', 'evidence': 'dev sensitivities reproduce the dependence (73.0 % at 0.6); no small-canopy or reefed-glide data', 'verdict': 'unverified, load-bearing for avail', 'killTest': 'tow test L/D vs slot opening and reef 0.25/0.35/0.5 at 6–15 m/s; kill if L/D <0.7 or retention <0.3'},
 {'assumption': 'Heave-compensating winch with zero-lag exact feed-forward of exit motion (8–9 m/s, 0.4 s)', 'devClaim': '≥7 m/s, ≤30 ms lag', 'evidence': 'auditor: needs 6–8 m/s reel-in at 8–16 N, ≤166 W, up to 172 m/s²; model motor constants cannot reach it; hc 0.5 keeps the pass by 0.04 pp', 'verdict': 'idealised, plausibly buildable with a different motor; unverified', 'killTest': 'bench replay of a measured hockey-stop exit motion with a 90 g dummy: kill if lag >30 ms or dummy speed >√(2·14.9/m)'},
 {'assumption': 'Active 2-axis gimbal points the 1.2 m boom end-on at the kite camera (τ 20 ms, ≤0.5°)', 'devClaim': '2×40 g gimbal motors, 1.5 W, 0.13 N·m', 'evidence': 'auditor: 0.35 N·m static, up to ≈1 N·m dynamic/with KCU seated; passive boom → avail 42.9 %', 'verdict': 'undersized; load-bearing for avail', 'killTest': 'boom pointing bench with carving vibration and KCU seated: ≤0.5° error at 20 Hz, artefact <3 % of subject height in real footage'},
 {'assumption': 'KE governor: kite GNSS/IMU ground speed > vGov → 2 N soft clutch', 'devClaim': 'KE ≤12.9 J in every case', 'evidence': 'reproduced; ablation off → 21.9 J', 'verdict': 'plausible control, unverified', 'killTest': 'soft-clutch drogue deceleration within 0.3 s on a 7 m line'},
 {'assumption': 'KCU docks on the boom-tip trumpet (45° residual) and snuff+retract in 2.5 s before the rider stops', 'devClaim': 'setup p90 4.7 s, ops 1', 'evidence': 'reproduced; residual max 30.8°', 'verdict': 'unverified mechanism', 'killTest': '500 seats wet/iced at 0–9 m/s'},
]
part = {
 'conceptId': 'kite2', 'modelVersion': rows and L(H, 'out_part0.json')['modelVersion'], 'auditor': 'audit3 (round 3)', 'generated': str(date.today()),
 'evidence': 'numerical uncalibrated simulation re-run on a copy of sim/; not physical verification',
 'scripts': ['audit3/kite2/recheck.mjs (39 cases, 2 slices)', 'audit3/kite2/spot_actuators.mjs', 'audit3/kite2/sens.mjs (hc_0p5, hc_0p5_speed3p7)', 'audit3/kite2/make_part.py'],
 'reproduction': {'fullEnsembleRerun': {'matchesClaimed': maxdiff < 0.002, 'cases': 39, 'maxAbsDiff': maxdiff, 'diffs': diffs[:10], 'note': 'dev evaluateCase on the copy reproduces dev/kite2/ensemble_rows.json; auditor metrics from R.frame/raw columns agree within 0.04 s (setup) and 0.1 N (20 ms-grid force)'}},
 'metrics13': m13, 'claimedVsRecomputed': rowsT,
 'envelope': {'def': 'rider 7–16 m/s, apparent wind ≥7 m/s to launch, 0–9 m/s head/cross/calm; tailwind ≥6 m/s degrades; low-traffic pistes only', 'availRecomputedByDir': byDir},
 'byWindAvail': byU, 'footageStability': agg['fs'],
 'massBudget': {'claimed_kg': C['addedMass'], 'flyingMass_g': 89.7, 'note': 'worn items: kite 89.7 g + (tether 4, pod shell 120, winch 70, boom+gimbal 148, radar 10, electronics 25, heater 5, 12 Wh cell 80, mount 40 g) ×1.15 = 0.667 kg; boom/gimbal/winch included; actuator sizing doubtful (A3-K2-03/04)'},
 'actuatorDemand': {'winch': agg['winch'], 'boom': agg['boom'], 'spot': spot_s},
 'sensitivitiesAudit': {k: {'avail': v['avail']['mean'], 'availP10': v['avail']['p10'], 'keMax': v['keMax'], 'jitterP90': v['jitterP90'], 'setupP90': v['setupP90'], 'headClearMin': v['headClearMin'], 'judgedPass': v['judgedPass']} for k, v in sens.items()},
 'physics': physics,
 'definitionChecks': [
  {'metric': 'avail', 'issue': 'ok-test tolerates artefact <3 % of subject height (same as round 2); literal ≥1 px rule → 0 % because the boom is always over the rider', 'favours': 'kite2 (decisive)'},
  {'metric': 'headClear', 'issue': 'worn boom excluded as non-airborne (0.42 m); exclusion windows 2.8 s compliant', 'favours': 'kite2'},
  {'metric': 'setupTime', 'issue': 'simulated; only the 2 s arm tap is a constant', 'favours': 'neutral'},
  {'metric': 'endurance', 'issue': 'includes regen credit (48.5 min without) and winch power computed at an infeasible motor operating point', 'favours': 'kite2 (small)'},
  {'metric': 'gates', 'issue': 'windEstimate used for launch/park/stop gates; no oracle case wind', 'favours': 'neutral'},
 ],
 'findings': findings,
 'safetyRegulatory': ['Written resort permission is a hard gate: line/boom 0.8–1.0 m above the snow behind the rider (A3-K2-01).', 'Rigid actuated boom 0.42 m from the helmet centre and at shoulder height for crossing skiers (≈34 N, 1.7 N·s).', 'KE 12.9 J governed (≤14.9 J line) only while the soft clutch works; fault cases separate.', 'Kite ≤14 m line: outside drone rules in most jurisdictions but subject to kite/tethered-object rules near lifts.'],
 'credibleEnvelope': 'Simulation-credible only on empty/low-traffic pistes with written permission, rider 7–16 m/s, head/cross/calm wind 0–9 m/s (tailwind ≥6 m/s → 39–80 %), and only if: canopy L/D ≥≈0.7 with ≥50 % reefed-glide retention, a boom gimbal that holds ≤0.5° pointing under ≈0.4–1 N·m, a heave-comp winch with ≤30 ms lag at 6–8 m/s, a 45° trumpet dock, and a custom 60° 4K optic — and if a permanent few-pixel boom stub over the rider is accepted as footage.',
 'verdict': 'Reproduces exactly (39/39) and passes all 13 judged metrics as modelled with the developer-tolerant artefact rule (avail 81.5 %, jitter p90 1.66, setup 4.7 s, ops 1, F 28.1 N, KE 12.9 J, headClear 1.105 m, endurance 56.9 min). Safety metrics are now robust; footage availability is knife-edge (≤1.5 pp margin, fails at L/D 0.6, mass +15 %, or a strict ≥1 px artefact rule) and rests on two idealised actuators (zero-lag heave winch beyond its own motor model; a gimbal driving a 1.2 m boom with motors too small for its simulated torque). The clothesline hazard is unfixed by design. Verdict: conditional pass as a research concept; not a usable product until tow/bench tests settle polar, gimbal, winch and dock.',
}
json.dump(part, open(os.path.join(H, 'part.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps({k: (v['claimed'], v['recomputed'], v['verdict']) for k, v in m13.items()}, ensure_ascii=False))
print(agg['fs'], byU)
