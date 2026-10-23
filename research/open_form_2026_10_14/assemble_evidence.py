"""Merge researcher evidence using stable source/evidence identities; append only."""
from pathlib import Path
from datetime import datetime, timezone
import sys, json, hashlib
sys.path.insert(0,'/root/.codex/skills/deep-research/scripts')
from citation_manager import canonicalize_locator, compute_source_id
from evidence_store import compute_evidence_id

OUT=Path(__file__).resolve().parent
def rows(p):
 return [json.loads(x) for x in p.read_text().splitlines() if x.strip()] if p.exists() else []
def append(p,obj):
 with p.open('a') as f: f.write(json.dumps(obj,ensure_ascii=False)+'\n')
sources=rows(OUT/'sources.jsonl'); known={s['source_id'] for s in sources}
evidences=rows(OUT/'evidence.jsonl'); known_e={e['evidence_id'] for e in evidences}
claims=rows(OUT/'claims.jsonl'); known_c={c['claim_id'] for c in claims}
mapping={}
for filename in ['flight-evidence.json','physical-evidence.json','academic-evidence.json','root-evidence.json']:
 data=json.loads((OUT/filename).read_text())
 for row in data.get('sources',data.get('evidence',[])):
  url=row['source_url']; canonical=canonicalize_locator(url); sid=compute_source_id(canonical)
  if sid not in known:
   src={'source_id':sid,'canonical_locator':canonical,'raw_url':url,'title':row['title'],
    'authors':row.get('authors'),'year':row.get('year'),'source_type':row['source_type'],
    'access_depth':row['access_depth'],'access_date_local':'2026-10-14',
    'metadata_status':'reviewed against primary source; product claims not independently tested',
    'limits':row['limits'],'registered_at':datetime.now(timezone.utc).isoformat()}
   sources.append(src);append(OUT/'sources.jsonl',src);known.add(sid)
  mapping[row.get('source_id',row['id'])]={'source_id':sid,'display_number':next(i for i,s in enumerate(sources,1) if s['source_id']==sid),'url':url,'title':row['title']}
  quote=row.get('evidence_quote') or row['claim']; locator=row['locator']; eid=compute_evidence_id(sid,quote,locator)
  if eid not in known_e:
   ev={'evidence_id':eid,'source_id':sid,'quote':quote,'locator':locator,
    'evidence_type':'direct_quote' if row.get('evidence_quote') else 'paraphrase',
    'source_file':filename,'limits':row['limits']}
   append(OUT/'evidence.jsonl',ev);known_e.add(eid)
  cid=hashlib.sha256((sid+row['claim']).encode()).hexdigest()[:16]
  if cid not in known_c:
   cl={'claim_id':cid,'claim':row['claim'],'source_ids':[sid],'evidence_ids':[eid],
     'support_status':'supported within stated source scope; independent product performance unverified',
     'limits':row['limits'],'source_record':row['id']}
   append(OUT/'claims.jsonl',cl);known_c.add(cid)
(OUT/'citation-map.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2)+'\n')
manifest=json.loads((OUT/'run_manifest.json').read_text())
manifest.update({'assumptions':['滑雪是首要压力场景；不限制风筝/飞行/高位俯拍形态','机械和电子均可比较；当前授权为广泛研究','优先真实记录；合成视角单独标识','用户未确认画质、重量、预算等数值门槛'],
 'provider_config':{'primary':'web.run','reason':'search-cli and firecrawl CLI unavailable'},
 'artifact_paths':{'sources':'sources.jsonl','evidence':'evidence.jsonl','claims':'claims.jsonl','report':'../../docs/18-open-form-product-research-zh.md','geometry':'geometry-results.json'},
 'source_count':len(sources),'claim_count':len(known_c)})
(OUT/'run_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sources':len(sources),'evidence':len(known_e),'claims':len(known_c),'citation_map':mapping},ensure_ascii=False))
