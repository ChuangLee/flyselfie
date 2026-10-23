#!/usr/bin/env python3
"""Aggregate audit4 kite2 recheck outputs (out_<tag>_*.json) into out_<tag>_all.json with ensemble statistics.
usage: python3 aggregate.py TAG"""
import json, glob, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
tag = sys.argv[1] if len(sys.argv) > 1 else 'base'
rows = []
for f in sorted(glob.glob(os.path.join(HERE, f'out_{tag}_[0-9]*_[0-9]*.json'))):
    rows += json.load(open(f))['rows']


def pct(a, q):
    v = sorted(x for x in a if isinstance(x, (int, float)) and x == x and abs(x) != float('inf'))
    return v[min(len(v) - 1, max(0, round(q * (len(v) - 1))))] if v else None


def st(a):
    v = [x for x in a if isinstance(x, (int, float)) and x == x and abs(x) != float('inf')]
    if not v:
        return None
    return {'mean': round(sum(v) / len(v), 3), 'p10': pct(v, .1), 'p50': pct(v, .5), 'p90': pct(v, .9), 'min': min(v), 'max': max(v), 'n': len(v)}


own = lambda k: [r['own'][k] for r in rows]
dev = lambda k: [r['dev'][k] for r in rows]
agg = {k: st(own(k)) for k in ['avail', 'availCaps', 'availNoArtefact', 'artBboxSharePct', 'artCapsSharePct', 'pxMed', 'jitterSubject', 'keMax', 'headClear',
                               'headClearNoExclusion', 'kcuSeatedHeadMin', 'boomHeadMin', 'setup', 'ops', 'F50', 'F50grid20ms', 'endurance', 'pMean', 'lineH1min', 'lineH2min',
                               'lineH3min', 'lineH1p10', 'lowSharePct', 'boomWpxMedOver', 'boomWpxP99Over', 'boomWpxMaxOver', 'boomCamDistMin', 'boomOverShare', 'lineWpxMaxOver', 'vfMed', 'vfMin']}
agg['dev'] = {k: st(dev(k)) for k in ['avail', 'pxMed', 'jitterFs', 'setup', 'ops', 'F50', 'keMax', 'endurance', 'azRange', 'headClear', 'boomHead']}
agg['winch'] = {k: st([r['own']['winch'][k] for r in rows]) for k in ['Imax', 'nuInMax', 'FmMax', 'PwMax', 'battCrateMax', 'motorOnS', 'envViol']}
agg['exclWindowMaxS'] = max(max(r['own']['exclWindowsS'] or [0]) for r in rows) if rows else None
bins = {}
for r in rows:
    key = 'calm' if r['U'] == 0 else f"{r['dir']}{r['U']}"
    bins.setdefault(key, []).append(r)
agg['byBinAvail'] = {k: {'own': round(sum(x['own']['avail'] for x in v) / len(v), 2), 'dev': round(sum(x['dev']['avail'] for x in v) / len(v), 2), 'keMax': max(x['own']['keMax'] for x in v), 'n': len(v)} for k, v in bins.items()}
dirs = {}
for r in rows:
    dirs.setdefault(r['dir'], []).append(r['own']['avail'])
agg['byDirAvail'] = {k: round(sum(v) / len(v), 2) for k, v in dirs.items()}
tb = [r for r in rows if r['dir'] == 'tail']
agg['tailAvail'] = round(sum(r['own']['avail'] for r in tb) / max(1, len(tb)), 2)
nt = [r for r in rows if r['dir'] != 'tail']
agg['nonTailAvail'] = round(sum(r['own']['avail'] for r in nt) / max(1, len(nt)), 2)
agg['reproMaxAbsDiff'] = {k: max(abs(r['own'][o] - r['dev'][d]) for r in rows if isinstance(r['own'][o], (int, float)) and isinstance(r['dev'][d], (int, float))) for k, o, d in
                          [('availCaps_vs_dev', 'availCaps', 'avail'), ('avail_bbox_vs_dev', 'avail', 'avail'), ('pxMed', 'pxMed', 'pxMed'), ('keMax', 'keMax', 'keMax'), ('headClear', 'headClear', 'headClear'),
                           ('setup', 'setup', 'setup'), ('endurance', 'endurance', 'endurance'), ('boomHead', 'boomHeadMin', 'boomHead')]} if rows else {}
json.dump({'tag': tag, 'n': len(rows), 'agg': agg, 'rows': rows}, open(os.path.join(HERE, f'out_{tag}_all.json'), 'w'), indent=1)
print(json.dumps({k: agg[k] for k in agg if k not in ('byBinAvail',)}, indent=0)[:6000])
print(json.dumps(agg['byBinAvail']))
