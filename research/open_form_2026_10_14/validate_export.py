"""Run the skill HTML checks with one documented Unicode bug correction.
The upstream emoji range U+24C2..U+1F251 includes CJK text and rejects Chinese.
Preserve its structural, citation and bibliography checks; use actual emoji blocks.
"""
from pathlib import Path
import sys,re,json
sys.path.insert(0,'/root/.codex/skills/deep-research/scripts')
from verify_html import HTMLVerifier

ROOT=Path(__file__).resolve().parents[2]
class CJKHTMLVerifier(HTMLVerifier):
 def _check_no_emojis(self,html):
  emoji=re.findall('[\U0001F300-\U0001FAFF\U0001F1E0-\U0001F1FF\u2702-\u27B0]',html)
  if emoji:self.errors.append(f'Unexpected emoji codepoints: {sorted(set(emoji))}')

md=ROOT/'docs/18-open-form-product-research-zh.md'
html=ROOT/'output/research/open-form-product-research.html'
assert CJKHTMLVerifier(html,md).verify()
text=md.read_text()
body=text.split('## Bibliography')[0]
bib=text.split('## Bibliography')[1]
used=set(map(int,re.findall(r'\[(\d+)\]',body)))
entries=set(map(int,re.findall(r'^\[(\d+)\]',bib,re.M)))
assert used==entries==set(range(1,24)),(used,entries)
for link in re.findall(r'\]\(([^)]+)\)',text):
 if not link.startswith(('https://','http://')):
  assert (md.parent/link.split('#')[0]).exists(),link
concepts=json.loads((ROOT/'research/open_form_2026_10_14/concepts.json').read_text())
assert len({c['id'] for c in concepts})==28
print('CJK-aware HTML verification, all 23 citations, local links and 28 hypotheses: PASS')
