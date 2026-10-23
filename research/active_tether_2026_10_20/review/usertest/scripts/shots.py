import sys, json
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]
BASE = 'http://localhost:8791/concepts.html'
log = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.set_default_timeout(180000)
    pg.goto(BASE + '?c=activetether&m=demo&lang=en&quality=low'); pg.wait_for_timeout(15000)
    stages = [('01_stowed', 0.5), ('02_detect', 1.6), ('03_launch_short_line', 4.0), ('04_launch_payout', 7.5), ('05_film_carve', 15.0), ('06_film_turn', 24.0), ('07_stop_brake', 31.5), ('08_tow_in', 37.0), ('09_capture', 42.5), ('10_docked', 51.0)]
    for name, t in stages:
        pg.evaluate(f'window.__lab.seek({t})'); pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/demo_{name}.png')
        log.append({'shot': f'demo_{name}.png', 't': t, 'time': pg.inner_text('#timeOut'), 'stageText': pg.inner_text('#stageText')[:300]})
    # test mode scenarios
    pg.evaluate("window.__lab.setMode('test')"); pg.wait_for_timeout(2000)
    n = pg.locator('#scenarioList li').count()
    for k in range(1, n + 1):
        btn = pg.locator(f'#scenarioList li:nth-child({k}) button')
        label = btn.inner_text()
        btn.click(); pg.wait_for_timeout(9000)
        dur = pg.evaluate("(()=>{const t=document.querySelector('#timeOut').textContent;return t})()")
        # seek to mid-run for a representative frame
        pg.evaluate("window.__lab.seek(14)"); pg.wait_for_timeout(2000)
        fn = f'test_{k:02d}.png'
        pg.screenshot(path=f'{OUT}/{fn}', full_page=True)
        metrics = pg.evaluate("""(()=>{const R=window.__lab.state.result; if(!R) return null; return (R.metrics||[]).map(m=>[m.id, m.value, m.unit, m.pass]);})()""")
        log.append({'shot': fn, 'scenario': label, 'time': dur, 'status': pg.inner_text('#status')[:200], 'metrics': metrics})
    log.append({'errors': errs})
    b.close()
json.dump(log, open(f'{OUT}/shots_log.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps(log, ensure_ascii=False)[:6000])
