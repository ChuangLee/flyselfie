#!/usr/bin/env python3
"""Audit3 (round 3) leapfrog part: merges out_part_*.json + out_bypass.json (recheck.mjs on a copy of sim/) with the
developer's results.json and writes out_summary.json + part.json. Numerical-uncalibrated simulation; not physical verification."""
import json, os
from datetime import date

H = os.path.dirname(os.path.abspath(__file__))
R3 = os.path.dirname(os.path.dirname(H))
L = lambda *p: json.load(open(os.path.join(*p), encoding='utf-8'))
rows = L(H, 'out_part_0_20.json')['rows'] + L(H, 'out_part_20_39.json')['rows']
byp = L(H, 'out_bypass.json')['rows']
dev = L(R3, 'dev', 'leapfrog', 'results.json')
assert len(rows) == 39

def pct(a, p):
    a = sorted(x for x in a if isinstance(x, (int, float)))
    return a[min(len(a) - 1, max(0, round(p * (len(a) - 1))))]
mean = lambda a: sum(a) / len(a)
r3 = lambda v: round(v, 3) if isinstance(v, (int, float)) else v
o = [r['own'] for r in rows]
fl = [r for r in rows if not r['noFly']]
js = [r['own']['jitterSubject'] for r in fl]
maxdiff, diffs = 0, []
for r in rows:
    for k, v in r['repro'].items():
        a, b = v['dev'], v['rerun']
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            maxdiff = max(maxdiff, abs(a - b))
            if abs(a - b) > 0.002: diffs.append({'id': r['id'], 'k': k, 'dev': a, 'rerun': b})
pmean = mean([r['own']['pMean'] for r in fl])
whEff = 1.8 + 14 * 0.85
endur = whEff * 0.75 * 0.85 / (pmean + 0.6 / 0.33) * 60
S = {
    'cases': 39, 'flown': len(fl), 'noFly': [{'id': r['id'], 'why': r['gate'].get('why'), 'wEst': r['gate']['w'], 'vProg': r['gate']['vProg']} for r in rows if r['noFly']],
    'avail': {'mean': r3(mean([x['avail'] for x in o])), 'p10': pct([x['avail'] for x in o], .1), 'meanNoLossFlags': r3(mean([x['availNoLossFlags'] for x in o])), 'flownMean': r3(mean([r['own']['avail'] for r in fl])),
              'devMean': r3(mean([r['dev']['avail'] for r in rows])), 'fromFlightPct': r3(mean([r['own']['fromFlightPct'] for r in fl if r['own']['fromFlightPct'] is not None]))},
    'byWind': {f'U{U}': {'own': r3(mean([r['own']['avail'] for r in rows if r['U'] == U])), 'dev': r3(mean([r['dev']['avail'] for r in rows if r['U'] == U]))} for U in (0, 3, 6, 9)},
    'byDir': {d: r3(mean([r['own']['avail'] for r in rows if r['dir'] == d])) for d in ('calm', 'head', 'tail', 'crossL', 'crossR')},
    'jitter': {'n': len(js), 'p50': pct(js, .5), 'p90': pct(js, .9), 'max': max(js), 'over3': [r['id'] for r in fl if r['own']['jitterSubject'] > 3]},
    'keMax': max(x['keMax'] for x in o), 'keMaxCase': max(rows, key=lambda r: r['own']['keMax'])['id'],
    'headClear': {'movingMin': min(x['headClearMoving'] for x in o if x['headClearMoving'] is not None), 'inclPerchMin': min(x['headClearInclPerch'] for x in o if x['headClearInclPerch'] is not None),
                  'where': 'skid-run take-off from the set-down point ≈1.5 m beside the standing rider (t≈2.5–2.9 s); helmet = skier.pos + 1.61 m, glider sphere r 0.38 m', 'dev': 1.89},
    'rangeMax': max(x['rangeMax'] for x in o), 'rangeMaxCase': max(rows, key=lambda r: r['own']['rangeMax'])['id'],
    'setup': {'p90': pct([x['setup'] for x in o], .9), 'max': max(x['setup'] for x in o), 'devP90': pct([r['dev']['setup'] for r in rows], .9)},
    'ops': {'p90': pct([x['ops'] for x in o], .9), 'max': max(x['ops'] for x in o), 'casesAbove2': [r['id'] for r in rows if r['own']['ops'] > 2]},
    'endurance': {'pMeanFlown': r3(pmean), 'value': r3(endur), 'whEff': whEff},
    'pxMedMean': r3(mean([r['dev']['pxMed'] for r in fl])), 'azRangeMean': r3(mean([r['dev']['azRange'] for r in fl])), 'bodyFMax': max(r['dev']['bodyF'] for r in rows), 'addedMass': rows[0]['dev']['addedMass'],
    'reproduction': {'maxAbsDiff': r3(maxdiff), 'diffs': diffs, 'keys': list(rows[0]['repro'].keys())},
    'bypass': {'rows': [{'id': r['id'], 'avail': r['own']['avail'], 'keMax': r['own']['keMax'], 'rangeMax': r['own']['rangeMax'], 'ops': r['own']['ops'], 'nextRun': r['own']['nextRun']} for r in byp],
               'keMax': max(r['own']['keMax'] for r in byp), 'rangeMax': max(r['own']['rangeMax'] for r in byp), 'availMean': r3(mean([r['own']['avail'] for r in byp]))},
}
json.dump(S, open(os.path.join(H, 'out_summary.json'), 'w'), indent=1, ensure_ascii=False)
V = {k: v for k, v in dev['variants'].items() if isinstance(v, dict)}
vv = lambda k, m: V[k][m]

J = dev['ensemble']['judged']
def row(m, stat, claimed, rec, verdict, note):
    return {'stat': stat, 'claimed': claimed, 'recomputed': rec, 'verdict': verdict, 'note': note}
M13 = {
 'avail': row('avail', 'mean of 39 (col.riding, no-fly = 0)', J['avail']['value'], S['avail']['mean'], 'fail',
              f"own frame-geometry usable test; p10 {S['avail']['p10']}; flown cases {S['avail']['flownMean']} %; 7/39 refused (6 progress-gate tail ≥3–4.4 m/s est., 1 wind); 9 m/s headwind 18.6–58.5 %. Without the occlusion/spray/buried loss flags {S['avail']['meanNoLossFlags']} %"),
 'pxMed': row('pxMed', 'mean of case medians', J['pxMed']['value'], S['pxMedMean'], 'pass', 'reproduced via rerun (22° lens on shared 4K; native-row capped)'),
 'jitterRms': row('jitterRms', 'p90 footageStability subjectRms over 32 flown', J['jitterRms']['value'], S['jitter']['p90'], 'conditional',
                  f"reproduced; max {S['jitter']['max']} ({', '.join(S['jitter']['over3'])} >3). Rests on post reframing that follows the TRUE subject line of sight (analysis.js losLP: perfect offline tracking): live framing {vv('V14_live_framing','jitterP90')}, UWB-only {vv('V2_uwbOnly_tau2','jitterP90')}, wind-estimate bias ×2 {vv('V7_estBias_x2','jitterP90')}, closer lead {vv('V8_lead_closer','jitterP90')} (12-case subset, dev)"),
 'azRange': row('azRange', 'mean', J['azRange']['value'], S['azRangeMean'], 'pass', 'reproduced via rerun'),
 'addedMass': row('addedMass', 'design', 0.315, S['addedMass'], 'pass', '164 g glider + 50 g holster + 93 g 14 Wh bank + 8 g tag'),
 'bodyForcePeak': row('bodyForcePeak', 'max', J['bodyForcePeak']['value'], S['bodyFMax'], 'pass', 'holster inertia formula; no tether'),
 'handsBusy': row('handsBusy', 'design', 0, 0, 'pass', 'set-down and pick-up while stopped'),
 'setupTime': row('setupTime', 'p90 (simulated)', J['setupTime']['value'], S['setup']['p90'], 'conditional',
                  f"recount identical in all 39 (launch stand from pre-run, landing wait, kinematic glide/side-step); max {S['setup']['max']}. Still contains an 8 s pick-up/fold/holster constant (ASSUMED) and 2.5 s no-fly constant: a gloved fold ≥13.5 s → p90 >30 s"),
 'ops': row('ops', 'p90 (max reported)', J['ops']['value'], S['ops']['p90'], 'pass', f"max {S['ops']['max']} in {', '.join(S['ops']['casesAbove2'])} (glider left uphill → next-run pick-up)"),
 'keMax': row('keMax', 'max', J['keMax']['value'], S['keMax'], 'pass', f"own capsule rule; margin 1.3 J; gate bypassed on the 7 refused cases {S['bypass']['keMax']} J; mass +10 % {vv('V6_mass_plus10','keMax')} J (cap re-derived, avail −6 pp)"),
 'packVol': row('packVol', 'design', 2.72, 2.72, 'conditional', 'holster 400×85×80 mm outer holds a 85 mm-chord folded wing, 2-axis gimbal and 14 Wh bank; chord equals the outer width (zero wall) → with 3 mm walls ≈3.1 L FAIL. Not measured'),
 'endurance': row('endurance', 'shared enduranceMin, mean power of flown cases, heater over the whole day', 54.661, S['endurance']['value'], 'pass', f"{vv('V1_vision_172g','endurance')} min with the shared 11 g/2.5 W vision computer"),
 'headClear': row('headClear', 'min over 39 (incl. launch, stops, landings)', J['headClear']['value'], S['headClear']['movingMin'], 'pass', f"own geometry {S['headClear']['movingMin']} m (incl. perch {S['headClear']['inclPerchMin']}); at the set-down skid take-off beside the standing rider; no capture window claimed"),
}
part = {
 'conceptId': 'leapfrog', 'modelVersion': dev['modelVersion'], 'auditor': 'audit3 (round 3)', 'generated': str(date.today()),
 'evidence': 'numerical uncalibrated simulation re-run on a copy of sim/; not physical verification',
 'scripts': ['audit3/leapfrog/recheck.mjs (0 20 / 20 39 / --bypass)', 'audit3/leapfrog/make_part.py'],
 'reproduction': {'fullEnsembleRerun': {'matchesClaimed': S['reproduction']['maxAbsDiff'] < 0.002, 'cases': 39, 'maxAbsDiff': S['reproduction']['maxAbsDiff'], 'keys': S['reproduction']['keys'], 'diffs': S['reproduction']['diffs'],
               'note': 'concept.simulate() on a fullrun scenario per case reproduces dev/leapfrog/results.json ensemble rows exactly; auditor metrics recomputed from R.frame + core columns'}},
 'metrics13': M13,
 'claimedVsRecomputed': [{'metric': k, 'stat': v['stat'], 'claimed': v['claimed'], 'recomputed': v['recomputed'], 'verdict': v['verdict']} for k, v in M13.items()] + [
     {'metric': 'rangeMax (EU C0 follow-me 50 m)', 'stat': 'max airborne glider–pelvis', 'claimed': 48.6, 'recomputed': S['rangeMax'], 'verdict': 'conditional'}],
 'envelope': {'def': 'estimated downslope wind ≲4.4 m/s (progress gate), total ≤12.5 m/s; groomed piste; rider ≈11 m/s downhill progress', 'availClaimedFlown': 91.7, 'availRecomputedFlown': S['avail']['flownMean'], 'byDir': S['byDir']},
 'byWindAvail': {k: {'claimed': v['dev'], 'recomputed': v['own']} for k, v in S['byWind'].items()},
 'footageStability': {'n': S['jitter']['n'], 'p50': S['jitter']['p50'], 'p90': S['jitter']['p90'], 'max': S['jitter']['max'], 'over3': S['jitter']['over3']},
 'massBudget': {'claimed_g': 163.9, 'rebuilt_g': 163.9, 'withSharedVision_g': 171.9, 'note': 'BOM 142.5 g ×1.15 from components.js (47 g structure ASSUMED, 4 g NPU ASSUMED instead of the shared 11 g/2.5 W vision computer). Speed cap is derived from the mass, so KE holds at +10 % mass but avail drops (68.4 %).'},
 'physics': [
  {'assumption': 'Post reframing tracks the subject perfectly in the recorded file (crop follows a low-pass of the true LOS)', 'devClaim': 'jitter p90 2.22 °/s', 'evidence': f"analysis.js losLP from true subject points; live framing → {vv('V14_live_framing','jitterP90')} °/s; UWB-only pointing → {vv('V2_uwbOnly_tau2','jitterP90')}", 'verdict': 'unverified, load-bearing', 'killTest': 'record a skier from a moving 22° camera with UWB pointing; run the actual post tracker; measure subject-rate RMS'},
  {'assumption': 'Fused UWB AoA ±5° + GNSS 1.5 m + height geometry pointing (≈3° RMS) keeps the rider on a 22° sensor', 'devClaim': 'avail flown 91.7 %', 'evidence': f"audit-style UWB 5° both axes → subset avail {vv('V3_uwbOnly_noHeight_tau2','availMean')} %, jitter {vv('V3_uwbOnly_noHeight_tau2','jitterP90')}", 'verdict': 'sourced but unmeasured on a moving skier', 'killTest': 'UWB/GNSS relative-bearing error between a 20–45 m glider and a carving skier'},
  {'assumption': 'Glider L/D (8–10) and 0.76 m span at Re 4–6e4', 'devClaim': 'range ≤48.6 m', 'evidence': f"L/D −30 % → follow-me range {vv('V12_ld_minus30','sepMaxFly')} m > 50 m, avail {vv('V12_ld_minus30','availMean')}", 'verdict': 'margin 1.4 m to the EU C0 follow-me limit', 'killTest': 'glide polar of the folded-wing airframe; geofence give-up behaviour'},
  {'assumption': 'Autonomous skid-run take-off from snow (set-down) and perch/claw hold', 'devClaim': 'every flown case launches and relaunches', 'evidence': 'model only; no snow take-off data', 'verdict': 'unverified', 'killTest': 'snow take-off success rate from groomed/soft snow with 1.8 Wh cell at −10 °C'},
  {'assumption': '8 s gloved pick-up, fold and holster', 'devClaim': 'setup p90 24.5 s', 'evidence': 'constant ASSUMED; p90 margin 5.5 s', 'verdict': 'unverified', 'killTest': 'timed gloved fold/holster trials'},
 ],
 'definitionChecks': [
  {'metric': 'avail', 'issue': 'dev mask = col.riding shifted by tGo; auditor own geometry gives the same mean within 0.002 pp. Perch footage counted (2.8 % of usable).', 'favours': 'neutral'},
  {'metric': 'wind gates', 'issue': 'launch gate, kestrel/land decisions use windEstimate (model.js:207,352). Residual true-wind uses: in-flight air-data wl initialised from wind(0) (model.js:251); gust interlock/gust factor use instantaneous true wind + bias, no noise/lag (in-flight pitot idealised); riderProg taken from the judged run (seeds differ only 10.86–10.98 m/s → harmless).', 'favours': 'leapfrog slightly'},
  {'metric': 'setupTime', 'issue': 'simulated except 8 s pick-up and 2.5 s no-fly constants', 'favours': 'leapfrog slightly'},
  {'metric': 'headClear', 'issue': 'dev excludes perch/stowed; auditor incl. perch gives the same min (1.88 vs 1.89 m; helmet height definition)', 'favours': 'neutral'},
  {'metric': 'endurance', 'issue': 'flown cases only (no-fly 0.3 W excluded) — conservative', 'favours': 'neutral'},
 ],
 'findings': [
  {'id': 'A3-LF-01', 'severity': 'major', 'title': 'avail fails on the full ensemble (75.2 %); reproduced exactly', 'detail': f"Own recompute {S['avail']['mean']} % (dev 75.22). 7/39 refused: progress gate has a cliff — feasible downhill progress 12.0 m/s at 3.2–3.4 m/s estimated downslope wind, −3 m/s at 4.4 → 1 of 3 tail3 seeds refused on the ±1 m/s estimate bias; all tail 6/9 refused (bypass: {S['bypass']['availMean']} % avail, left behind). 9 m/s headwind 18.6–58.5 %. By wind 0/3/6/9: {', '.join(str(S['byWind'][k]['own']) for k in ('U0','U3','U6','U9'))} %. Honest envelope limit, not a definition artefact.", 'evidence': 'audit3/leapfrog/out_summary.json'},
  {'id': 'A3-LF-02', 'severity': 'major', 'title': 'Jitter pass (2.22 °/s) relies on perfect offline subject tracking; rose from 1.0 because pointing is now sourced and the lens narrower', 'detail': f"Reproduced p90 {S['jitter']['p90']} (max {S['jitter']['max']}). Rise vs round 2: sourced pointing (≈3° RMS vs 1.2° GM; it.2 pointing → {vv('V4_it2_oracle_1.2','jitterP90')}), 22° lens and adaptive lane. The output crop follows a low-pass of the TRUE line of sight; live framing {vv('V14_live_framing','jitterP90')}, UWB-only {vv('V2_uwbOnly_tau2','jitterP90')}, estimate bias ×2 {vv('V7_estBias_x2','jitterP90')}, closer lead {vv('V8_lead_closer','jitterP90')} all FAIL.", 'evidence': 'sim/js/concepts/leapfrog/analysis.js (losLP); dev results.json variants'},
  {'id': 'A3-LF-03', 'severity': 'major', 'title': 'Follow-me radius margin 1.4 m (48.6 m vs EU C0 50 m)', 'detail': f"Own max glider–rider distance {S['rangeMax']} m ({S['rangeMaxCase']}); L/D −30 % → {vv('V12_ld_minus30','sepMaxFly')} m (breach); gate off → {vv('V11_no_gate','sepMaxFly')} m.", 'evidence': 'out_summary.json rangeMax; dev variants V11/V12'},
  {'id': 'A3-LF-04', 'severity': 'minor', 'title': 'Oracle wind removed from gates; idealised residuals remain', 'detail': 'Launch/progress gate and approach decisions use windEstimate. wl initialised with true wind at t=0 (model.js:251); gust interlock uses noise-free instantaneous wind + bias. Gate-bypass KE now 13.43 J (round 2: 16.4–40.8 J) — audit2 A2-LF-02 genuinely fixed.', 'evidence': 'model.js:207-251, 293-330, 347-357; out_bypass.json'},
  {'id': 'A3-LF-05', 'severity': 'minor', 'title': 'setupTime simulated but keeps an 8 s pick-up/fold constant', 'detail': f"Recount identical (p90 {S['setup']['p90']} s, max {S['setup']['max']} s); a fold/holster ≥13.5 s with gloves fails p90.", 'evidence': 'index.js:66,186'},
  {'id': 'A3-LF-06', 'severity': 'minor', 'title': 'packVol 2.72 L is geometrically tight (85 mm chord in an 85 mm outer holster)', 'detail': 'With realistic 3 mm walls ≈3.1 L (> 3 L). Same class of issue as audit2 towglider.', 'evidence': 'index.js:61; results.json airframe.chord 0.085'},
  {'id': 'A3-LF-07', 'severity': 'minor', 'title': 'Mass budget uses a 4 g NPU, not the shared 11 g vision computer', 'detail': f"Shared-part variant 171.9 g → subset avail {vv('V1_vision_172g','availMean')} %, endurance {vv('V1_vision_172g','endurance')} min (still ≥45).", 'evidence': 'results.json airframe, variants V1'},
  {'id': 'A3-LF-08', 'severity': 'minor', 'title': 'Bystander exposure unjudged', 'detail': 'Dev exposure table: 0.7–7.3 flight passes within 5 m of other skiers per run (low–high density), perched glider on the piste in other riders\' lines; headClear covers only the owner.', 'evidence': 'results.json exposure'},
 ],
 'safetyRegulatory': ['Resort written permission (not obtained).', 'EU C0 follow-me ≤50 m: 1.4 m margin; L/D shortfall breaches it.', 'US: follow-me without VLOS observer needs a waiver.', 'Perched glider and low passes near other skiers (unjudged exposure).', 'KE 13.6 J vs 14.9 J line holds under gate bypass and +10 % mass (speed cap derived from mass).'],
 'credibleEnvelope': 'Simulation-credible only for groomed pistes, calm to 3 m/s any direction, cross/head winds to ≈6–9 m/s, estimated downslope wind ≲4 m/s, rider ≈11 m/s; conditional on perfect offline subject tracking in post, ≈3° fused UWB/GNSS pointing, reliable snow take-off and an 8 s gloved fold. Outside: refuses (tail ≥4.5 m/s) or partly films (9 m/s headwind).',
 'verdict': f"Reproduces exactly (39/39). Fails avail on the full ensemble (75.2 %) as an honest envelope limit; all other metrics pass as modelled (jitter p90 {S['jitter']['p90']}, setup p90 {S['setup']['p90']} s, ops p90 2/max 3, KE {S['keMax']} J, headClear {S['headClear']['movingMin']} m, endurance {S['endurance']['value']:.1f} min). The audit2 oracle-gate and simulated-setup responses are real. Conditional: jitter on perfect post tracking, packVol geometry, 8 s fold, 1.4 m follow-me margin. Best-evidenced light-wind follow-cam; not an all-weather solution.",
}
json.dump(part, open(os.path.join(H, 'part.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(json.dumps({k: (v['claimed'], v['recomputed'], v['verdict']) for k, v in M13.items()}, ensure_ascii=False))
print(S['byWind'], S['jitter'], S['rangeMax'], S['bypass']['keMax'], S['reproduction']['maxAbsDiff'])
