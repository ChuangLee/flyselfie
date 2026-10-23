"""Review diagnostic for import provenance, using the application's 2D fallback.
Run with the local server on :8765. No application code is modified.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.set_default_timeout(20000)
    page.add_init_script("""const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind,...args) {
        if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
        return original.call(this,kind,...args);
      };""")
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/')
    page.wait_for_function("document.querySelector('#status').textContent.includes('完成')")
    before = page.inner_text('#timeOut')
    page.click('#playBtn')
    page.wait_for_timeout(500)
    page.click('#playBtn')
    after = page.inner_text('#timeOut')
    assert before != after, 'Playback did not advance'
    foreign = page.evaluate("""async () => {
      const {resultFromJSON,resultToJSON}=await import('./js/model/solver.js');
      const obj=await (await fetch('./data/reference/film_turns.json')).json();
      const r=resultFromJSON(obj);
      r.config.id='review-foreign-config';r.model.id='review-foreign-model';r.model.version='99.0';
      return resultToJSON(r);
    }""")
    page.set_input_files('#impResult', {'name': 'foreign-result.json', 'mimeType': 'application/json', 'buffer': json.dumps(foreign).encode()})
    page.wait_for_timeout(300)
    result = {'renderer': 'forced 2D fallback, not GPU performance measurement',
              'playbackBefore': before, 'playbackAfter': after,
              'fileConfig': foreign['config'], 'fileModel': foreign['model'],
              'displayConfig': page.inner_text('#bnConfig'), 'displayModel': page.inner_text('#bnModel'),
              'importStatus': page.inner_text('#status'), 'pageErrors': errors}
    assert 'review-foreign-config' not in result['displayConfig']
    assert 'review-foreign-model' not in result['displayModel']
    widths = {}
    for width in [768, 360]:
        page.set_viewport_size({'width': width, 'height': 1000})
        widths[width] = page.evaluate('document.documentElement.scrollWidth')
        assert widths[width] <= width
    result['scrollWidths'] = widths
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.screenshot(path=str(root / 'output/playwright/review_2026_10_14/import-provenance.png'))
    assert not errors
    print(json.dumps(result, ensure_ascii=False, indent=2))
    browser.close()
