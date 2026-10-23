#!/usr/bin/env python3
"""Round-2 iteration-2 cross-concept matrix (independent re-audit, 2026-10-20).

Reads the per-concept re-audit parts (audit2/<id>/part.json), the harmonised footage-stability
coverage (audit2/cross/fs_all_k2_lf_out.json, towglider/out_fs_all.json, descentglider/fs_all_out.json),
the developers' results.json and the round-1 matrix (reference row only). Writes:
  summary/matrix.json            final comparison (12 metrics claimed/recomputed/pass, envelopes, gates, ranking)
  audit2/cross/consistency.json  cross-concept definition/consistency checks
  audit2/findings.json           all re-audit findings (per concept + cross)
Numerical-uncalibrated simulations + literature checks; nothing here is a physical test.
"""
import json, os
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
R2 = os.path.dirname(HERE)                      # research/concepts_2026_10_19
A2 = os.path.join(R2, 'audit2')
R1 = os.path.join(os.path.dirname(R2), 'concepts_2026_10_18', 'summary', 'matrix.json')
IDS = ['kite2', 'towglider', 'leapfrog', 'descentglider']
STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'packVol', 'endurance']
load = lambda *p: json.load(open(os.path.join(*p), encoding='utf-8'))
parts = {c: load(A2, c, 'part.json') for c in IDS}
crit = None  # thresholds restated from sim/js/concepts/common/criteria.js
CRIT = {'avail': ('>=', 80, '%'), 'pxMed': ('>=', 300, 'px'), 'jitterRms': ('<=', 3, '°/s'), 'azRange': ('>=', 45, '°'), 'addedMass': ('<=', 1.5, 'kg'),
        'bodyForcePeak': ('<=', 40, 'N'), 'handsBusy': ('<=', 5, '%'), 'setupTime': ('<=', 30, 's'), 'ops': ('<=', 2, '-'), 'keMax': ('<=', 14.9, 'J'),
        'packVol': ('<=', 3, 'L'), 'endurance': ('>=', 45, 'min')}

# ---- harmonised footage stability (shared footageStability(R), flown cases, p90) ----
fsK = load(A2, 'cross', 'fs_all_k2_lf_out.json')
fsT = load(A2, 'towglider', 'out_fs_all.json')
fsD = load(A2, 'descentglider', 'fs_all_out.json')
FS = {
    'kite2': {'n': fsK['kite2']['n'], 'p50': fsK['kite2']['subject']['p50'], 'p90': fsK['kite2']['subject']['p90'], 'max': fsK['kite2']['subject']['max'], 'over3': fsK['kite2']['over3']},
    'leapfrog': {'n': fsK['leapfrog']['n'], 'p50': fsK['leapfrog']['subject']['p50'], 'p90': fsK['leapfrog']['subject']['p90'], 'max': fsK['leapfrog']['subject']['max'], 'over3': fsK['leapfrog']['over3']},
    'towglider': {'n': fsT['n'], 'p50': None, 'p90': round(fsT['subjectRms']['p90'], 3), 'max': round(fsT['subjectRms']['max'], 3), 'over3': fsT['over3']},
    'descentglider': {'n': fsD['flown'], 'p50': fsD['subject']['p50'], 'p90': fsD['subject']['p90'], 'max': fsD['subject']['max'], 'over3': None},
}

# ---- auditor's metric table: recomputed value used for the matrix + audit pass ----
# (value, pass, note). Values come from the parts; jitter uses the harmonised footageStability p90.
AUD = {
 'kite2': {
  'avail': (85.18, True, 'riding-mask denominator (dev 87.98 excludes t<2 s, v≤2 m/s); p10 80.8 %'),
  'pxMed': (511.7, True, 'reproduced via rerun; needs a custom 60° HFOV optic (90° lens → 326–346 px, avail 53–63 %)'),
  'jitterRms': (FS['kite2']['p90'], True, 'footageStability subject p90 over 39 cases (dev p90 1.11); no canopy coning modelled'),
  'azRange': (62.5, True, 'fullrun case; side swap by differential slots unverified'),
  'addedMass': (0.50, True, None),
  'bodyForcePeak': (30.35, 'conditional', 'passes as modelled; raw snatches 56–68 N in 12/39 runs on unreefed re-inflation; opening-shock estimate 41–55 N → unproven'),
  'handsBusy': (0, True, None),
  'setupTime': (23.95, True, 'p90; 37.7 s FAIL if the dock funnel accepts only 90° off-axis'),
  'ops': (2, True, 'p90 2, max 3 (7.7 % of runs)'),
  'keMax': (14.73, True, 'max; 0.17 J margin; L/D 0.95 → 15.6 J, 0.90 → 16.6 J, mass +15 % → 17.3 J (all FAIL)'),
  'packVol': (2.31, True, 'design estimate, not recomputed'),
  'endurance': (85.4, True, '79.5 min without winch-regeneration credit'),
 },
 'towglider': {
  'avail': (61.37, False, 'mean incl. 6 gated runs = 0; launched runs 72.5 % — below 80 % in every wind bin'),
  'pxMed': (444.1, True, 'needs a non-stock 90° fisheye (stock Thumb 2 ≈150°)'),
  'jitterRms': (FS['towglider']['p90'], False, 'footageStability p90 over 33 flown cases (dev 2.28); 5 cases >3 °/s; rests on 8 % EIS residual'),
  'azRange': (85.5, True, 'scripted ±28° shot plan'),
  'addedMass': (0.454, True, None),
  'bodyForcePeak': (10.6, True, 'raw 20 ms peaks ≤24 N'),
  'handsBusy': (0, True, None),
  'setupTime': (10.9, True, 'p90; holster capture by snow pull unverified'),
  'ops': (1, True, 'p90 1, max 3'),
  'keMax': (12.91, True, 'gate-wrong tail cases 14.6–19.2 J'),
  'packVol': ('≈4.2 (≥3.6)', False, '80 mm holster cannot take the 97 mm chord; ≥100 mm tube → ≈4.2 L'),
  'endurance': (55.0, True, 'thin: >≈7 Ω/m leash conductor → <45 min'),
 },
 'leapfrog': {
  'avail': (64.42, False, 'riding mask (dev 64.63); 9/39 no-fly runs = 0; all flown cases 84.0 %; envelope 88.3 %'),
  'pxMed': (410.4, True, '30° lens + post reframing; 4:3 readout not load-bearing'),
  'jitterRms': (FS['leapfrog']['p90'], True, 'footageStability p90 over 30 flown cases (dev 0.82); crossL9_s12 3.54 °/s'),
  'azRange': (85.4, True, None),
  'addedMass': (0.32, True, None),
  'bodyForcePeak': (3.43, True, None),
  'handsBusy': (0, True, None),
  'setupTime': (14.0, True, 'assumed constant 4 + 10 s, not simulated; 25.3 s with the 30–40 m end retrieval ride'),
  'ops': (2, True, 'p90 2, max 3'),
  'keMax': (14.62, True, '0.3 J margin; relies on an oracle wind gate (tail6 bypass 16.4–18.9 J); mass +10 % → 15.5 J'),
  'packVol': (2.72, True, 'tight, unverified'),
  'endurance': (63.6, True, 'flown cases only (conservative); 51.2 min if the heater runs during lift charging'),
 },
 'descentglider': {
  'avail': (29.59, False, '22/39 no-fly (wind interlock)'),
  'pxMed': (401.5, True, 'flown cases only'),
  'jitterRms': (FS['descentglider']['p90'], False, 'footageStability p90 over 17 flown cases (dev masked 1.39); calm/cross3 1.1–1.4'),
  'azRange': (84.2, True, None),
  'addedMass': (0.316, True, None),
  'bodyForcePeak': (0, True, 'no tether (hard-coded 0, acceptable)'),
  'handsBusy': (0, True, None),
  'setupTime': (60.4, False, 'fails even in calm (33–35 s)'),
  'ops': (3, False, 'p90 3 with recovery action counted in non-resting runs (dev 2)'),
  'keMax': (18.02, False, 'tail6_s11 interlock did not trip; ≤3 m/s max 13.7 J'),
  'packVol': (2.78, True, None),
  'endurance': (79.3, True, '66.5 min with per-run lift-heater accounting'),
 },
}

def claimed(c, m):
    v = parts[c]['metrics12'][m].get('claimed')
    return v

def judge(m, v):
    if not isinstance(v, (int, float)):
        return None
    op, t, _ = CRIT[m]
    return v >= t if op == '>=' else v <= t

# developer-claimed numeric for the dev pass column
DEVNUM = {
 'kite2': {'avail': 87.98, 'pxMed': 511.7, 'jitterRms': 1.11, 'azRange': 62.5, 'addedMass': 0.498, 'bodyForcePeak': 30.35, 'handsBusy': 0, 'setupTime': 23.91, 'ops': 2, 'keMax': 14.73, 'packVol': 2.31, 'endurance': 85.42},
 'towglider': {'avail': 61.37, 'pxMed': 445.97, 'jitterRms': 2.28, 'azRange': 85.49, 'addedMass': 0.454, 'bodyForcePeak': 10.6, 'handsBusy': 0, 'setupTime': 10.9, 'ops': 1, 'keMax': 12.91, 'packVol': 2.91, 'endurance': 54.97},
 'leapfrog': {'avail': 64.63, 'pxMed': 410.37, 'jitterRms': 0.82, 'azRange': 85.38, 'addedMass': 0.32, 'bodyForcePeak': 3.43, 'handsBusy': 0, 'setupTime': 14, 'ops': 2, 'keMax': 14.62, 'packVol': 2.72, 'endurance': 63.56},
 'descentglider': {'avail': 29.89, 'pxMed': 401.53, 'jitterRms': 1.39, 'azRange': 84.18, 'addedMass': 0.316, 'bodyForcePeak': 0, 'handsBusy': 0, 'setupTime': 60.4, 'ops': 2, 'keMax': 18.02, 'packVol': 2.775, 'endurance': 79.3},
}
STAT = {'avail': 'ensemble mean (39)', 'pxMed': 'ensemble mean of case medians', 'jitterRms': 'p90 over flown cases (audit: shared footageStability subject RMS)', 'azRange': 'ensemble mean / fullrun case',
        'addedMass': 'design', 'bodyForcePeak': 'ensemble max (50 ms mean)', 'handsBusy': 'design', 'setupTime': 'ensemble p90', 'ops': 'ensemble p90 (max reported)', 'keMax': 'ensemble max',
        'packVol': 'design', 'endurance': 'from ensemble mean power, components.js rules'}

KEYASSUMPTIONS = {c: [{'assumption': x['assumption'], 'auditVerdict': x['verdict'], 'killTest': x.get('killTest')} for x in parts[c]['physics']] for c in IDS}

GATES_COMMON = ['Resort written permission (not obtained; gate for every concept)', 'G-MATURE closed; nothing physically tested (M-070 not_run)']

concepts = []
for c in IDS:
    p = parts[c]
    mt = {}
    for m in STD:
        v, ok, note = AUD[c][m]
        dn = DEVNUM[c][m]
        mt[m] = {'stat': STAT[m], 'claimed': dn, 'claimedPass': judge(m, dn), 'recomputed': v, 'pass': ok, 'auditNote': note,
                 'conceptAuditNote': p['metrics12'][m].get('note')}
    fails = [m for m in STD if mt[m]['pass'] is False]
    cond = [m for m in STD if mt[m]['pass'] == 'conditional']
    concepts.append({
        'id': c, 'modelVersion': p.get('modelVersion'),
        'metrics': mt, 'auditFails': fails, 'auditConditional': cond,
        'envelope': p['envelope'], 'byWindAvail': p['byWindAvail'],
        'footageStabilityAll': FS[c],
        'massBudget': p['massBudget'],
        'keyAssumptions': KEYASSUMPTIONS[c],
        'safetyRegulatoryGates': GATES_COMMON + p['safetyRegulatory'],
        'majorFindings': [{'id': f['id'], 'title': f['title']} for f in p['findings'] if f['severity'] in ('fatal', 'major')],
        'credibleEnvelope': p['credibleEnvelope'], 'auditVerdict': p['verdict'],
    })

# ---- round-1 reference rows (NOT comparable: per-scenario, no packVol, no full-run ensemble) ----
r1 = load(R1)
ref = []
for cc in r1['concepts']:
    if cc['id'] not in ('tetherdrone', 'trackdrone', 'boom360'):
        continue
    nom = next(r for r in cc['rows'] if r['scenario'] == 'nominal')
    failsByScenario = {r['scenario']: [k for k in STD if k in r['metrics'] and r['metrics'][k]['pass'] is False] for r in cc['rows']}
    ref.append({'id': cc['id'], 'name': cc['name']['en'], 'modelVersion': cc['modelVersion'], 'referenceOnly': True,
                'nominal': {k: {'v': (round(v['v'], 3) if isinstance(v['v'], (int, float)) else v['v']), 'pass': v['pass']} for k, v in nom['metrics'].items() if k in STD},
                'failsByScenario': {k: v for k, v in failsByScenario.items() if v},
                'caveat': 'judged per scenario in round 1 (2026-10-18/19), WITHOUT packVol and WITHOUT the 39-case full-run ensemble, one-shot gust fix or oblique gust wavefronts; avail/setup/ops of round-2 concepts include stops, relaunches and wind refusals, round-1 nominal rows do not. Round-1 audit notes: tetherdrone keMax/tether-artefact fragile and 100 V line needs reinforced insulation; trackdrone endurance/keMax/follow envelope fail; boom360 footage stability fails robustly. Re-run them on fullrun + packVol before any head-to-head ranking.'})

# ---- cross-concept consistency ----
consistency = {
 'generated': str(date.today()), 'evidence': 'independent re-audit of numerical-uncalibrated simulations; not a physical test',
 'reproduction': {c: parts[c]['reproduction'].get('fullEnsembleRerun') for c in IDS},
 'checks': [
  {'id': 'A2-X-01', 'metric': 'avail denominator', 'finding': 'criteria.js: share of skiing time. Developers use different masks: kite2 excludes t<2 s and v≤2 m/s (+2.8 pp), towglider v>2 m/s (+0.7), descentglider v>2 m/s (+0.3/+0.8 flown), leapfrog speed>2 (+0.2). The matrix uses the auditor riding-mask (fullrun col.riding) value for all. Refused-launch/no-fly runs count 0 for all four (consistent).', 'favours': 'kite2 most (still passes)'},
  {'id': 'A2-X-02', 'metric': 'jitterRms', 'finding': 'ITERATE_BRIEF does not fix the ensemble statistic for jitter; developers report p90 of their own jitter metric with different masks (descentglider drops lens-edge frames; towglider own metric vs integrator). The matrix uses p90 of the shared footageStability(R) subject RMS over all flown cases for every concept (kite2 39, towglider 33, leapfrog 30, descentglider 17). This flips towglider (2.28 → 3.40) and descentglider (1.39 → 18.1) to FAIL; kite2 1.01 and leapfrog 1.01 pass.', 'favours': 'descentglider and towglider in the dev tables'},
  {'id': 'A2-X-03', 'metric': 'ops', 'finding': 'Brief says ops p90 AND max are reported; criteria judge ≤2 on p90. All four concepts have max 3 (kite2 7.7 %, towglider 1 run, leapfrog 1 run, descentglider 15 % → p90 3). If max were judged, all four fail equally. descentglider did not count the recovery action in non-resting runs (fixed by audit → p90 3).', 'favours': 'descentglider (dev table)'},
  {'id': 'A2-X-04', 'metric': 'setupTime', 'finding': 'kite2, towglider, descentglider simulate the standstill (dock/park/landing/walk); leapfrog uses an assumed constant 4 s + 10 s and does not charge the 30–40 m end retrieval ride (25.3 s with it; still passes). towglider extends the final hold to 30 s (declared; neutral — identical with the shared 10 s hold).', 'favours': 'leapfrog (mildly)'},
  {'id': 'A2-X-05', 'metric': 'endurance', 'finding': 'Bases differ: leapfrog uses flown cases only (conservative; 80.0 with all), descentglider includes no-fly cases, kite2 includes a winch-regeneration credit (79.5 without). The shared enduranceMin() adds the 0.6 W heater only to the filming load, not to time charging on the lift (leapfrog 51.2, descentglider 66.5 min if charged). All still pass ≥45 min; towglider (hip-pack power over the leash, no in-flight charging) is the only one whose margin depends on a conductor resistance (≥≈7 Ω/m → fail).', 'favours': 'small, mixed; fix enduranceMin to charge heater over charging time'},
  {'id': 'A2-X-06', 'metric': 'keMax', 'finding': 'All judged on ensemble max in the ground frame beyond 1.5 m; consistent. towglider and leapfrog wind gates read the TRUE case mean wind (oracle); descentglider uses a measured wind and its interlock failed to trip in tail6_s11 (18 J) — the more realistic gate is penalised. With gate bypass leapfrog 16.4–40.8 J, towglider 14.6–19.2 J.', 'favours': 'towglider and leapfrog vs descentglider'},
  {'id': 'A2-X-07', 'metric': 'safety gates outside the 12 metrics', 'finding': 'Proximity/line hazards are computed but not judged: kite2 line 0.9–1.5 m above snow 1 m behind the rider in every run (own gate ≥2.0 m) and canopy dragged on snow in 10/39 runs; towglider 0.78–0.90 m from the helmet (own limit 1.0 m) in calm and slow-rider tailwind; descentglider head pass <1.5 m in 3 and landing <2.5 m in 4 of 17 flown runs plus one 69.8 m geofence breach; leapfrog geofence breach only on gate bypass, landing ahead of the rider at every stop. The 12-metric table alone flatters kite2 most.', 'favours': 'kite2 most, then descentglider, towglider'},
  {'id': 'A2-X-08', 'metric': 'packVol', 'finding': 'Design estimates only, none measured. towglider 2.91 L is geometrically inconsistent (97 mm chord in an 80 mm tube) → ≈4.2 L FAIL. Others plausible but unverified.', 'favours': 'towglider (dev table)'},
  {'id': 'A2-X-09', 'metric': 'mass budgets', 'finding': 'All four reproduce arithmetically from components.js +15 % (kite2 86.3 g, towglider 128.8 g, leapfrog 168.5 g, descentglider 124 g; all <250 g C0). Deviations: leapfrog 20 g/3 W camera and 4 g NPU instead of the 11 g vision computer (176.5 g with the shared part → KE cap 13.0 m/s); kite2 omits ≈3 g of slot/reef/douse hardware (89.7 g → KE fail); descentglider 30 g airframe optimistic. Masses are knife-edge for kite2 and leapfrog KE.', 'favours': 'kite2, leapfrog'},
  {'id': 'A2-X-10', 'metric': 'envelope', 'finding': 'Envelope avail is self-defined per concept (leapfrog: drops exactly the gate-refused cases; towglider: launched runs; descentglider: ≤3 m/s; kite2: none needed). Only the full 39-case mean is comparable; envelope figures are reported for context only.', 'favours': 'leapfrog in envelope-only comparisons'},
 ],
}

# ---- ranking ----
ranking = [
 {'rank': 1, 'id': 'leapfrog', 'label': 'best credible light-wind follow-cam; fails the all-weather avail',
  'rationale': 'Reproduces exactly; fails only avail on the full ensemble (64.4 %), and that failure is an honest operating limit (it refuses to launch in ≥6 m/s tail / strong wind) rather than a footage defect: 84 % over all flown runs, 87–88 % at 0–3 m/s. All other 11 metrics pass on the harmonised basis (jitter p90 1.0 °/s, setup 14–25 s, ops 2, KE 14.6 J). Conventional technology (small glider, post reframing). Conditions: pointing better than UWB spec (≲2°), a real (non-oracle) wind gate, robust snow take-off, KE margin only 0.3 J, landing ahead of the rider at every stop, US VLOS issue.'},
 {'rank': 2, 'id': 'kite2', 'label': 'only concept passing all 12 as modelled, but the least evidenced and with an unjudged line hazard',
  'rationale': 'Passes every judged metric on the audit basis (avail 85.2 %, setup 24 s, ops 2, F 30 N, KE 14.73 J, endurance 85 min) in all wind bins. But the pass sits on three unprecedented, load-bearing assumptions (slot-open L/D ≥1.0 — not ≈0.9 as claimed; ≥70 % of glide kept while reefed to ≈29 % drag area; 120° off-axis soft-canopy dock capture), a 0.17 J KE margin, unproven snatch forces, and a line 0.9–1.5 m above the snow behind the rider in every run plus canopy dragged on snow — a clothesline/trip hazard that most resorts will not permit. Highest upside if a tow test confirms glide/reefing/docking; not usable until then.'},
 {'rank': 3, 'id': 'towglider', 'label': 'lowest operating burden, structurally capped footage',
  'rationale': 'Best convenience (ops 1, setup 11 s, F ≤11 N, KE 12.9 J, credible 48 V leash at ≈0.26 g/m and 0.56 W loss). But avail is ≈72 % even in launched runs in every wind bin (launch-to-station and stop-drop/relaunch time), the shared jitter metric fails (p90 3.4 °/s; 8 % EIS residual assumed), packVol ≈4.2 L, rider-speed envelope ≤≈11 m/s on ≤15–18°, and near-helmet passes (0.78–0.9 m) in calm/slow tailwind. Fixing avail needs a different stop strategy, not tuning.'},
 {'rank': 4, 'id': 'descentglider', 'label': 'fails; calm-day no-line research niche only',
  'rationale': 'Fails avail (29.6 %), setup (60 s; 33–35 s even calm), ops p90 3, KE 18 J, harmonised jitter (p90 18 °/s); near misses and landings beside the rider inside its ≤3 m/s envelope, one 50 m geofence breach. Dominated by towglider on setup, ops, KE and windy avail; wins only calm-air avail (87 vs 72 %) and needs no line.'},
]

matrix = {
 'generated': str(date.today()), 'round': 2, 'iteration': 2,
 'evidence': 'independent re-audit (audit2) of numerical-uncalibrated simulations + literature/web checks; NOT physical tests; M-070 not_run, G-MATURE closed',
 'basis': 'shared common/components.js, common/fullrun.js (39 cases: calm + 3/6/9 m/s × head/tail/crossL/crossR × 3 seeds), common/env.js (one-shot gust, oblique wavefronts), common/criteria.js (12 metrics incl. packVol ≤3 L ASSUMED). Ensemble statistics per ITERATE_BRIEF: avail mean, setupTime p90, ops p90 (max reported), bodyForcePeak max, keMax max, endurance from mean power; jitter harmonised by the auditor as p90 of footageStability subject RMS over flown cases.',
 'criteria': {m: {'op': CRIT[m][0], 'v': CRIT[m][1], 'unit': CRIT[m][2]} for m in STD},
 'concepts': concepts,
 'reference_round1': ref,
 'consistencyChecks': [{'id': x['id'], 'metric': x['metric'], 'favours': x['favours']} for x in consistency['checks']],
 'ranking': {'question': 'usable solo follow-cam (self-operated, full run, real winds, minimal set-up)', 'noConceptQualifies': True,
             'summary': 'No round-2 concept is a usable solo follow-cam as specified: leapfrog, towglider and descentglider fail the judged full-ensemble avail; kite2 passes only on unproven canopy/dock physics and carries an unjudged line hazard. Ranking is by credible usable envelope × evidence, not by count of passes.',
             'order': ranking,
             'nextKillTests': ['kite2: tow-test the 0.40 m² slotted canopy at 6–15 m/s for L/D (open/reefed) and dock capture vs off-axis angle', 'leapfrog: UWB/GNSS pointing error on a moving skier; snow take-off from a 1.8 Wh cell; non-oracle wind gate', 'towglider: fold-and-measure packVol; deep-stall drop/park/relaunch and holster capture; leash conductor Ω/m and flex life on the reel', 'all: resort written permission; EU C0 50 m follow-me fail-safe; US VLOS waiver route']},
}

json.dump(matrix, open(os.path.join(HERE, 'matrix.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(consistency, open(os.path.join(A2, 'cross', 'consistency.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
allf = {'generated': str(date.today()), 'evidence': consistency['evidence'],
        'counts': {c: {s: sum(1 for f in parts[c]['findings'] if f['severity'] == s) for s in ('fatal', 'major', 'minor')} for c in IDS},
        'findings': [dict(f, concept=c) for c in IDS for f in parts[c]['findings']] + [dict(x, concept='cross', severity='major' if x['id'] in ('A2-X-02', 'A2-X-07', 'A2-X-08') else 'minor', title=x['metric']) for x in consistency['checks']]}
allf['counts']['cross'] = {s: sum(1 for f in allf['findings'] if f['concept'] == 'cross' and f['severity'] == s) for s in ('fatal', 'major', 'minor')}
json.dump(allf, open(os.path.join(A2, 'findings.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote matrix.json, consistency.json, findings.json')
for c in concepts:
    print(c['id'], 'fails', c['auditFails'], 'conditional', c['auditConditional'])
print(allf['counts'])
