import json,sys,glob,statistics as st
def pct(a,p):
    a=sorted(x for x in a if x is not None); 
    return a[min(len(a)-1,max(0,round(p*(len(a)-1))))] if a else None
def summ(rows,label):
    o=[r['own'] for r in rows]; fl=[r for r in rows if not r['noFly']]
    av=[x['avail'] for x in o]
    res=dict(label=label,n=len(rows),noFly=sum(r['noFly'] for r in rows),availMean=round(st.mean(av),3),availP10=pct(av,.1),availP50=pct(av,.5),
      availWithTilt=round(st.mean(x['availWithTilt'] for x in o),3),
      pxMed=round(st.mean(r['own']['pxMed'] for r in fl),2) if fl else None,
      jitterP90=pct([r['own']['jitterSubject'] for r in fl],.9),jitterMax=max([r['own']['jitterSubject'] for r in fl],default=None),
      keMax=max(x['keMax'] for x in o),headClearMin=min([r['own']['headClear'] for r in fl],default=None),
      sepMax=max(x['sepMax'] for x in o),setupP90=pct([x['setup'] for x in o],.9),setupMax=max(x['setup'] for x in o),
      opsP90=pct([x['ops'] for x in o],.9),opsMax=max(x['ops'] for x in o),ops3=[r['id'] for r in rows if r['own']['ops']>=3],
      pMeanFlown=round(st.mean(r['own']['pMean'] for r in fl),3) if fl else None, landNow=sum(x['landNow'] for x in o), giveUp=sum(x['giveUp'] for x in o))
    return res
def load(pat):
    rows=[]
    for f in sorted(glob.glob(pat)): rows+=json.load(open(f))['rows']
    return rows
if __name__=='__main__':
    rows=load(sys.argv[1]); print(json.dumps(summ(rows,sys.argv[1])))
    for r in rows: print(r['id'],r['noFly'],r['gateW'],r['own']['avail'],r['own']['keMax'],r['own']['headClear'],r['own']['sepMax'],r['own']['ops'],r['own']['setup'],r['own']['jitterSubject'],'dev',r['dev']['avail'],r['dev']['keMax'],r['dev']['sepMaxFly'])
