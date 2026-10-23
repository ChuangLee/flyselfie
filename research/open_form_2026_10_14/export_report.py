"""Create standalone HTML and print PDF of the research report.
Requires markdown (for this run: /tmp/flyski-research-export) and Playwright.
"""
from pathlib import Path
import sys,re,json,base64,hashlib
from datetime import datetime,timezone
sys.path.insert(0,'/tmp/flyski-research-export')
import markdown
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
src=ROOT/'docs/18-open-form-product-research-zh.md'
text=src.read_text()
concepts=[]
for line in text.splitlines():
 if re.match(r'\| O\d\d \|',line):
  parts=[s.strip() for s in line.split('|')[1:-1]]
  concepts.append(dict(id=parts[0],name=parts[1],hypothesis=parts[2],first_falsification=parts[3],status='research hypothesis, not validated'))
assert len(concepts)==28
(OUT/'concepts.json').write_text(json.dumps(concepts,ensure_ascii=False,indent=2)+'\n')
# Hypotheses have a separate ledger. Do not label them as source-supported facts.
(OUT/'hypotheses.jsonl').write_text(''.join(json.dumps(c,ensure_ascii=False)+'\n' for c in concepts))

html=markdown.markdown(text,extensions=['tables','fenced_code','toc'])
def size_concept_table(match):
 body=match.group(1)
 if re.search(r'<td>O\d\d</td>',body):
  return '<table><colgroup><col style="width:7%"><col style="width:19%"><col style="width:37%"><col style="width:37%"></colgroup>'+body+'</table>'
 return match.group(0)
html=re.sub(r'<table>(.*?)</table>',size_concept_table,html,flags=re.S)
svg=(OUT/'viewpoint-geometry.svg').read_bytes()
html=html.replace('../research/open_form_2026_10_14/viewpoint-geometry.svg','data:image/svg+xml;base64,'+base64.b64encode(svg).decode())
css='''
*{box-sizing:border-box}body{margin:0;background:#eef1f3;color:#202832;font:14px/1.85 "Noto Sans CJK SC","Microsoft YaHei",sans-serif}
main{max-width:1120px;margin:auto;background:white;padding:36px 52px}h1{font-size:28px;color:#003d5c;border-bottom:4px solid #003d5c;padding-bottom:18px;line-height:1.5}
h2{font-size:21px;color:#003d5c;margin-top:36px;padding-top:12px;border-top:1px solid #b6c7d1;line-height:1.5}
h3{font-size:17px;color:#254b62;margin-top:28px}h4{font-size:15px;color:#354b57}p{margin:12px 0}a{color:#146181;text-decoration:none;overflow-wrap:anywhere}
table{border-collapse:collapse;width:100%;margin:18px 0;font-size:12px;line-height:1.7;table-layout:fixed}th{background:#e6edf1;color:#123e57;text-align:left}td,th{border:1px solid #c8d3db;padding:9px;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}img{max-width:100%;height:auto}
pre{white-space:pre-wrap;background:#f5f7f8;padding:12px}code{font-size:.94em;background:#f4f6f8}.metrics{display:table;width:100%;margin:16px 0 28px;background:#edf2f5}.metric{display:table-cell;width:33%;padding:14px 20px;border-right:1px solid #ccd7de}.metric strong{display:block;font-size:26px;color:#003d5c}.metric span{font-size:12px;color:#44515b}
@page{size:A4;margin:14mm 13mm 17mm} @media print{body{background:white;font-size:9pt;line-height:1.75}main{max-width:none;padding:0}h1{font-size:21pt}h2{font-size:15pt;margin-top:18pt}h3{font-size:12pt;margin-top:13pt}h4{font-size:10pt}table{font-size:7.8pt;line-height:1.6}td,th{padding:5pt}h1,h2,h3,h4{break-after:avoid}p{orphans:3;widows:3}a{color:#20516c}.metrics{break-inside:avoid}img{break-inside:avoid}pre{font-size:8pt}}
'''
metrics='<div class="metrics"><div class="metric"><strong>23</strong><span>原始来源，含同厂商不同页面</span></div><div class="metric"><strong>28</strong><span>候选构想，均非已验证原型</span></div><div class="metric"><strong>6</strong><span>场地或同伴构想已排除</span></div></div>'
html=html.replace('</h1>','</h1>'+metrics,1)
html=re.sub(r'(<h1\b[^>]*>.*?</h1>)',r'<header class="header">\1</header>',html,flags=re.S)
html=re.sub(r'<h2\b[^>]*>','<h2 class="section-title">',html)
bib_start=html.index('<h2 class="section-title">Bibliography')
bib=re.sub(r'<p>\[(\d+)\]',r'<p class="bib-entry">[\1]',html[bib_start:])
html='<article class="content">'+html[:bib_start]+'<section class="bibliography">'+bib+'</section></article>'
# Keep local links useful when opened from output/research/.
html=re.sub(r'href="\.\./research/open_form_2026_10_14/', 'href="../../research/open_form_2026_10_14/',html)
html=html.replace('href="19-solo-follow-filming-scope.md"', 'href="../../docs/19-solo-follow-filming-scope.md"')
target=ROOT/'output/research';target.mkdir(parents=True,exist_ok=True)
html_path=target/'open-form-product-research.html'
pdf_path=target/'open-form-product-research.pdf'
html_path.write_text('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>不限形态的便利跟拍产品调研</title><style>'+css+'</style></head><body><main>'+html+'</main></body></html>')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
 page=browser.new_page()
 page.goto(html_path.as_uri())
 page.evaluate('document.fonts.ready')
 page.pdf(path=str(pdf_path),format='A4',print_background=True,prefer_css_page_size=True,display_header_footer=True,
   header_template='<span></span>',footer_template='<div style="font-size:8px;width:100%;text-align:center;color:#777">FlySkiSelfie · Research · <span class="pageNumber"></span> / <span class="totalPages"></span></div>')
 browser.close()
manifest=json.loads((OUT/'run_manifest.json').read_text())
manifest['artifact_paths'].update({'html':'../../output/research/'+html_path.name,'pdf':'../../output/research/'+pdf_path.name,'concepts':'concepts.json','hypotheses':'hypotheses.jsonl'})
manifest['report_sha256']=hashlib.sha256(src.read_bytes()).hexdigest()
manifest['finished_at']=datetime.now(timezone.utc).isoformat()
(OUT/'run_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'html':str(html_path),'pdf':str(pdf_path),'hypotheses':len(concepts)},ensure_ascii=False))
