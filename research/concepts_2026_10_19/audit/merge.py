#!/usr/bin/env python3
"""Merge per-concept audit parts (part_<id>.json) into findings.json and verdicts.json.
Cross-concept comparability is read from comparability.json (written by the lead auditor).
Evidence: audit of numerical-uncalibrated simulations; not a physical test."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
IDS = ['kite2', 'towglider', 'leapfrog', 'descentglider']
parts = {}
for c in IDS:
    p = os.path.join(HERE, f'part_{c}.json')
    if os.path.exists(p):
        parts[c] = json.load(open(p))

comp = {}
cp = os.path.join(HERE, 'comparability.json')
if os.path.exists(cp):
    comp = json.load(open(cp))

meta = {'generated': '2026-10-19', 'round': 2,
        'evidence': 'independent audit of numerical-uncalibrated simulations and literature/web checks; not a physical test',
        'severityScale': {'fatal': 'kills the concept as specified; no credible design change inside the concept keeps it',
                          'major': 'a claimed pass or key assumption does not hold; fixable by a design/model change',
                          'minor': 'reporting, labelling or robustness issue'}}

findings = []
for c in IDS:
    for f in parts.get(c, {}).get('findings', []):
        findings.append(f)
findings += comp.get('findings', [])
# schema: fixable is yes|no; keep any qualifier in fixableNote
for f in findings:
    fx = str(f.get('fixable', '')).strip()
    if fx not in ('yes', 'no'):
        f['fixableNote'] = fx
        f['fixable'] = 'no' if 'not engineering-fixable' in fx else 'yes'
order = {'fatal': 0, 'major': 1, 'minor': 2}
findings.sort(key=lambda f: (IDS.index(f['concept']) if f['concept'] in IDS else 9, order.get(f['severity'], 3)))
counts = {c: {s: sum(1 for f in findings if f['concept'] == c and f['severity'] == s) for s in order} for c in IDS + ['cross']}
json.dump({**meta, 'counts': counts, 'findings': findings}, open(os.path.join(HERE, 'findings.json'), 'w'), ensure_ascii=False, indent=1)

verdicts = {c: parts[c]['verdict'] for c in IDS if c in parts}
for c in verdicts:
    verdicts[c]['comparabilityInputs'] = parts[c].get('comparability')
json.dump({**meta, 'verdicts': verdicts, 'crossConcept': comp.get('crossConcept')},
          open(os.path.join(HERE, 'verdicts.json'), 'w'), ensure_ascii=False, indent=1)
print('parts', list(parts), 'findings', len(findings), counts)
