#!/usr/bin/env python3
"""Round-4 cross-concept matrix (independent audit4, 2026-10-20).

Reads the per-concept round-4 audit parts (audit4/<id>/part.json, each with a 13-metric
claimed-vs-recomputed table computed by the auditor's own scripts on a copy of sim/), and keeps the
frozen descentglider row from the round-3 matrix (summary/matrix_round3.json, itself copied from round 2) unchanged.
Writes:
  summary/matrix.json       round-4 comparison (13 metrics incl. headClear, envelopes, kill tests, ranking)
  audit4/findings.json      all round-4 findings (per concept + cross)
Evidence level: numerical, uncalibrated simulation + code reading. NOT physical verification
(M-070 not_run, G-MATURE closed).
Before the first run the round-3 matrix was backed up to summary/matrix_round3.json.
"""
import json, os
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
R2 = os.path.dirname(HERE)                      # research/concepts_2026_10_19
A3 = os.path.join(R2, 'audit4')
LIVE = ['kite2', 'towglider', 'leapfrog']
FROZEN = 'descentglider'
STD = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax',
       'packVol', 'endurance', 'headClear']
CRIT = {'avail': ('>=', 80, '%'), 'pxMed': ('>=', 300, 'px'), 'jitterRms': ('<=', 3, '°/s'), 'azRange': ('>=', 45, '°'),
        'addedMass': ('<=', 1.5, 'kg'), 'bodyForcePeak': ('<=', 40, 'N'), 'handsBusy': ('<=', 5, '%'), 'setupTime': ('<=', 30, 's'),
        'ops': ('<=', 2, '-'), 'keMax': ('<=', 14.9, 'J'), 'packVol': ('<=', 3, 'L'), 'endurance': ('>=', 45, 'min'),
        'headClear': ('>=', 1.0, 'm')}
STAT = {'avail': 'ensemble mean (48, FULLRUN_CASES_R4), riding mask, bodyPx >=300, artefactCounts >=2 px, refused runs = 0', 'pxMed': 'ensemble mean of case medians of footage().bodyPx',
        'jitterRms': 'p90 over flown cases of footageStability(R).subjectRms', 'azRange': 'ensemble mean / fullrun case',
        'addedMass': 'design budget', 'bodyForcePeak': 'ensemble max (50 ms mean)', 'handsBusy': 'design',
        'setupTime': 'ensemble p90 (simulated)', 'ops': 'ensemble p90 (max reported)', 'keMax': 'ensemble max',
        'packVol': 'design estimate', 'endurance': 'mean power, components.js (heater over whole day)',
        'headClear': 'ensemble min, helmetAt(sk,t) (bodyPoints head) to airborne parts, auditor geometry from R.frame(); worn rigid members reported separately'}

load = lambda *p: json.load(open(os.path.join(*p), encoding='utf-8'))
parts = {c: load(A3, c, 'part.json') for c in LIVE}
m2 = load(HERE, 'matrix_round3.json')


def judge(m, v):
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return None
    op, t, _ = CRIT[m]
    return v >= t if op == '>=' else v <= t


def norm_verdict(v):
    if v in (True, 'pass'):
        return 'pass'
    if v in (False, 'fail'):
        return 'fail'
    if v in ('conditional',):
        return 'conditional'
    return None


concepts = []
for c in LIVE:
    p = parts[c]
    mt = {}
    for m in STD:
        e = p['metrics13'][m]
        cl = e.get('claimed')
        mt[m] = {'stat': e.get('stat', STAT[m]), 'claimed': cl, 'claimedPass': judge(m, cl), 'recomputed': e.get('recomputed'),
                 'verdict': norm_verdict(e.get('verdict')), 'auditNote': e.get('note')}
    concepts.append({
        'id': c, 'modelVersion': p.get('modelVersion'), 'round': 4,
        'robustness': p.get('robustness'), 'actuatorDemand': p.get('actuatorDemand'), 'lineExposure': p.get('lineExposure'),
        'metrics': mt,
        'auditFails': [m for m in STD if mt[m]['verdict'] == 'fail'],
        'auditConditional': [m for m in STD if mt[m]['verdict'] == 'conditional'],
        'reproduction': p.get('reproduction'),
        'envelope': p.get('envelope'), 'byWindAvail': p.get('byWindAvail'),
        'footageStabilityAll': p.get('footageStability'),
        'massBudget': p.get('massBudget'),
        'keyAssumptions': [{'assumption': x.get('assumption'), 'auditVerdict': x.get('verdict'), 'killTest': x.get('killTest')} for x in p.get('physics', [])],
        'safetyRegulatoryGates': None,  # filled below
        'majorFindings': [{'id': f['id'], 'severity': f['severity'], 'title': f['title']} for f in p['findings'] if f['severity'] in ('fatal', 'major')],
        'credibleEnvelope': p.get('credibleEnvelope'), 'auditVerdict': p.get('verdict'),
    })

GATES_COMMON = ['Resort written permission (not obtained; gate for every concept)',
                'G-MATURE closed; nothing physically tested (M-070 not_run)']
for cc in concepts:
    cc['safetyRegulatoryGates'] = GATES_COMMON + list(parts[cc['id']].get('safetyRegulatory', []))

# ---- frozen descentglider: round-2 row unchanged; headClear added as "not evaluated" ----
dg = json.loads(json.dumps(next(x for x in m2['concepts'] if x['id'] == FROZEN)))
dg['frozen'] = True
dg['frozenNote'] = 'Frozen as a documented negative result after audit2; row copied unchanged from summary/matrix_round3.json (= round-2 row + headClear not evaluated). Not re-run on the 48-case round-4 grid.'
concepts.append(dg)

# ---- cross-concept consistency (round 4) ----
CROSS = json.load(open(os.path.join(A3, 'cross', 'consistency.json'), encoding='utf-8')) if os.path.exists(os.path.join(A3, 'cross', 'consistency.json')) else {'checks': []}

# ---- ranking (auditor judgement, see rationale) ----
RANK = load(A3, 'cross', 'ranking.json')

matrix = {
    'generated': str(date.today()), 'round': 4,
    'evidence': 'independent audit4 of numerical, uncalibrated simulations (re-run on a copy of sim/) + code reading; NOT physical verification; M-070 not_run, G-MATURE closed',
    'basis': 'shared common/components.js, common/fullrun.js (FULLRUN_CASES_R4, 48 cases: calm + 3/6/9 m/s × head/tail/crossL/crossR × 3 seeds + tail 3.5/4.5/5.5 × 3 seeds; avail on footage().bodyPx ≥300 with artefactCounts (≥2 px over the subject); headClear from helmetAt(); no idealised actuators/estimators in judged runs; avail = share of col.riding time, refused runs 0; jitter = p90 of footageStability(R).subjectRms over flown cases; ops judged on p90; setup simulated; gates via windEstimate), common/criteria.js (13 metrics incl. packVol ≤3 L and headClear ≥1.0 m, both ASSUMED).',
    'previous': 'summary/matrix_round3.json',
    'criteria': {m: {'op': CRIT[m][0], 'v': CRIT[m][1], 'unit': CRIT[m][2]} for m in STD},
    'concepts': concepts,
    'reference_round1': m2.get('reference_round1'),
    'consistencyChecks': [{'id': x['id'], 'metric': x['metric'], 'finding': x['finding'], 'favours': x.get('favours')} for x in CROSS['checks']],
    'killTests': {c: [k['killTest'] for k in next(x for x in concepts if x['id'] == c)['keyAssumptions'] if k.get('killTest')] for c in LIVE},
    'ranking': RANK,
}
json.dump(matrix, open(os.path.join(HERE, 'matrix.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

allf = {'generated': str(date.today()), 'round': 4, 'evidence': matrix['evidence'],
        'counts': {c: {s: sum(1 for f in parts[c]['findings'] if f['severity'] == s) for s in ('fatal', 'major', 'minor')} for c in LIVE},
        'findings': [dict(f, concept=c) for c in LIVE for f in parts[c]['findings']]
        + [dict(id=x['id'], concept='cross', severity=x.get('severity', 'minor'), title=x['metric'], detail=x['finding'], favours=x.get('favours')) for x in CROSS['checks']],
        'descentglider': 'frozen; round-2 findings remain in audit2/findings.json', 'previousRound': 'audit3/findings.json'}
allf['counts']['cross'] = {s: sum(1 for f in allf['findings'] if f['concept'] == 'cross' and f['severity'] == s) for s in ('fatal', 'major', 'minor')}
json.dump(allf, open(os.path.join(A3, 'findings.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

print('wrote summary/matrix.json and audit4/findings.json')
for cc in concepts:
    print(f"{cc['id']:14s} fails {cc['auditFails']} conditional {cc['auditConditional']}")
print(allf['counts'])
