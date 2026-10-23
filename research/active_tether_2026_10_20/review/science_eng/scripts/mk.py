import json,sys
ALL=['calm_s11','calm_s12','calm_s13']+[f'{d}{U}_s{s}' for U in [3,6,9] for d in ['head','tail','crossL','crossR'] for s in [11,12,13]]+[f'tail{U}_s{s}' for U in [3.5,4.5,5.5] for s in [11,12,13]]
FLOWN=[i for i in ALL if not any(i.startswith(x) for x in ['tail6','tail9','tail4.5','tail5.5'])]
# 12-case screening subset of flown-type winds
SUB=['calm_s11','calm_s13','head3_s12','head6_s12','head9_s11','tail3_s12','crossL3_s12','crossL6_s13','crossL9_s11','crossR3_s11','crossR6_s12','crossR9_s13']
def jobs(tag, ids, over, fs=True, skier=None, patch=None): return [{'tag':tag,'id':i,'over':over,'fs':fs,'skier':skier,'patch':patch} for i in ids]
if __name__=='__main__':
  spec=json.loads(sys.argv[1]); out=[]
  for it in spec:
    tag,over,sel=it[:3]; sk=it[3] if len(it)>3 else None; pt=it[4] if len(it)>4 else None
    ids={'ALL':ALL,'FLOWN':FLOWN,'SUB':SUB}.get(sel, sel.split(',') if isinstance(sel,str) else sel)
    out+=jobs(tag,ids,over,skier=sk,patch=pt)
  json.dump(out,open(sys.argv[2],'w')); print(len(out))
