import json,sys,statistics as st
def pct(v,q):
  v=sorted(v); 
  if not v: return None
  # match sim pct? approximate linear
  k=(len(v)-1)*q; f=int(k); c=min(f+1,len(v)-1); return v[f]+(v[c]-v[f])*(k-f)
def summ(rows):
  av=[r['avail'] for r in rows]; px=[r['pxMed'] for r in rows if r.get('pxMed') is not None]
  jit=[r['jitter'] for r in rows if r.get('jitter') is not None and r['launches']-r['launchFails']>0]
  ke=[r['keMax'] for r in rows if r.get('keMax') is not None]; hc=[r['headClear'] for r in rows if r.get('headClear') is not None]
  cat={k:round(st.mean([r['cat'][k] for r in rows]),2) for k in rows[0]['cat']}
  fk=[r['fly']['ke'][0] for r in rows if r['fly']['ke'][0] is not None]
  return dict(n=len(rows),avail=round(st.mean(av),2),pxP50=round(pct(px,.5),1) if px else None,jitP90=round(pct(jit,.9),2) if jit else None,keMax=round(max(ke),1) if ke else None,keP50=round(pct(ke,.5),1) if ke else None,keFlyMedP50=round(pct(fk,.5),2) if fk else None,hcMin=round(min(hc),2) if hc else None,hcP10=round(pct(hc,.1),2) if hc else None,ke_over=sum(1 for x in ke if x>14.9),hc_under=sum(1 for x in hc if x<1),neverFlown=sum(1 for r in rows if r['launches']-r['launchFails']<=0),cat=cat)
if __name__=='__main__':
  rows=json.load(open(sys.argv[1])); tags=[]
  for r in rows:
    if r.get('error'): print('ERR',r['tag'],r.get('id'),r['error'][:300]); continue
    if r['tag'] not in tags: tags.append(r['tag'])
  for t in tags:
    rr=[r for r in rows if r['tag']==t and not r.get('error')]; print(t, json.dumps(summ(rr)))
