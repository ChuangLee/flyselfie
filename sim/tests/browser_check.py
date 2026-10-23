"""Browser interaction check for SIM-010 (FE-13 / AC-04 frontend checks).

Usage: node tools/serve.mjs 8765 &   then
       python3 tests/browser_check.py OUT_DIR [URL] [CHROME_PATH]
Writes screenshots to OUT_DIR and prints one line per check. Exit code 1 on any
console/page error. This checks frontend interaction only — not numerical
correctness, engineering content or physical behaviour.
"""
import json, sys
from playwright.sync_api import sync_playwright
SP=sys.argv[1]
URL=sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8765/'
CHROME=sys.argv[3] if len(sys.argv) > 3 else '/usr/bin/google-chrome'
log=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':1440,'height':1000}, accept_downloads=True)
    errs=[]
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
    pg.set_default_timeout(120000)  # software WebGL in headless runs is slow
    pg.goto(URL); pg.wait_for_timeout(9000)
    log.append(('webgl view active', pg.get_attribute('#gl3d', 'hidden') is None and pg.get_attribute('#c3d', 'hidden') is not None))
    log.append(('status', pg.inner_text('#status')))
    log.append(('banner', pg.inner_text('#bnEvidence')))
    log.append(('playText', pg.inner_text('#playBtn')))
    pg.screenshot(path=f'{SP}/s_1440_sim.png')
    # play 1.5 s
    pg.click('#playBtn'); pg.wait_for_timeout(1500); pg.click('#playBtn')
    log.append(('time after play', pg.inner_text('#timeOut')))
    # seek via keyboard
    pg.focus('#resetTime'); pg.keyboard.press('Shift+ArrowRight'); pg.wait_for_timeout(2500)
    log.append(('time after shift-right', pg.inner_text('#timeOut')))
    # scenario: retrieval_headwind (reference replay)
    pg.click('#scenarioList li:nth-child(3) button'); pg.wait_for_timeout(500)
    log.append(('headwind status', pg.inner_text('#status')))
    log.append(('validity', pg.inner_text('#validityNote')))
    pg.fill('#seek', '700'); pg.dispatch_event('#seek','input'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SP}/s_1440_headwind.png')
    # parameter change -> recompute
    pg.fill('#p_airborneMass', '0.34'); pg.wait_for_timeout(2500)
    log.append(('after mass change', pg.inner_text('#status')))
    log.append(('validity2', pg.inner_text('#validityNote')))
    # invalid input
    pg.fill('#p_airborneMass', '5'); pg.wait_for_timeout(600)
    log.append(('invalid input', pg.inner_text('#status'), pg.inner_text('#err_airborneMass')))
    pg.fill('#p_airborneMass', '0.3'); pg.wait_for_timeout(1200)
    log.append(('restored', pg.inner_text('#status')))
    # export
    with pg.expect_download() as d: pg.click('#expCSV')
    log.append(('csv', d.value.suggested_filename))
    with pg.expect_download() as d: pg.click('#expResult')
    path=d.value.path(); obj=json.load(open(path)); log.append(('json', d.value.suggested_filename, obj['schema'], obj['checksum'], len(obj['events'])))
    # import it back
    pg.set_input_files('#impResult', path); pg.wait_for_timeout(500)
    log.append(('import', pg.inner_text('#status')))
    # pending + illustration scenarios
    pg.click('#scenarioList li:nth-child(13) button'); pg.wait_for_timeout(300)
    log.append(('pending', pg.inner_text('#overlayMsg'), pg.inner_text('#bnEvidence')))
    pg.click('#scenarioList li:nth-child(10) button'); pg.wait_for_timeout(300)
    log.append(('illus', pg.inner_text('#overlayMsg')))
    pg.click('#overlayMsg button'); pg.wait_for_timeout(500)
    log.append(('demo via illus', pg.inner_text('#bnEvidence'), pg.inner_text('#timeOut'), pg.inner_text('#demoText')[:60]))
    pg.screenshot(path=f'{SP}/s_1440_demo.png')
    for q in ['low', 'ultra', 'high']:
        pg.select_option('#qualitySel', q); pg.wait_for_timeout(2500)
    log.append(('quality switch ok', pg.input_value('#qualitySel')))
    pg.uncheck('#dirChk'); pg.wait_for_timeout(1500); pg.check('#dirChk'); pg.wait_for_timeout(1500)
    pg.click('#playBtn'); pg.wait_for_timeout(1200); pg.click('#playBtn')
    pg.click('#demoStageList li:nth-child(5) button'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SP}/s_1440_demo_film.png')
    # geometry
    pg.click('button[data-mode=geometry]'); pg.wait_for_timeout(400)
    pg.screenshot(path=f'{SP}/s_1440_geom.png')
    # compare
    pg.click('button[data-mode=compare]'); pg.wait_for_timeout(400)
    pg.screenshot(path=f'{SP}/s_1440_compare.png', full_page=True)
    # language
    pg.click('#langBtn'); pg.wait_for_timeout(300)
    log.append(('en title', pg.inner_text('h1'), pg.inner_text('#bnEvidence')))
    pg.click('button[data-mode=sim]'); pg.wait_for_timeout(600)
    pg.click('#scenarioList li:nth-child(6) button'); pg.wait_for_timeout(600)
    pg.fill('#seek', '800'); pg.dispatch_event('#seek','input'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SP}/s_1440_windloss_en.png')
    # reduced motion
    pg.check('#reducedMotion'); pg.click('#resetTime'); pg.click('#playBtn'); pg.wait_for_timeout(1300); pg.click('#playBtn')
    log.append(('reduced motion time', pg.inner_text('#timeOut')))
    for w,h in [(768,1000),(360,800)]:
        pg.set_viewport_size({'width':w,'height':h}); pg.wait_for_timeout(400)
        sw=pg.evaluate('document.documentElement.scrollWidth')
        log.append((f'vw{w} scrollWidth', sw))
        pg.screenshot(path=f'{SP}/s_{w}.png', full_page=True)
    log.append(('errors', errs))
    b.close()
for l in log: print(l)
sys.exit(1 if errs else 0)
