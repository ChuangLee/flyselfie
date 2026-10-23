import sys, json
from playwright.sync_api import sync_playwright
OUT=sys.argv[1]
want={'UT P1 beginner 5 m/s calm':[('p1_beg5_quiver_out_no_launch',12)],
 'UT P1 beginner 7 m/s calm':[('p1_beg7_flyer_dragged_while_riding',15),('p1_beg7_manual_stow',112)],
 'UT P4 family 6.5 m/s head 3':[('p4_family_towed_behind',12),('p4_family_filming',42)],
 'UT T05 stop 10 s and go (head 3)':[('t05_stop10_standing',45),('t05_second_ride_towed',66)],
 'UT P3 expert 15 m/s calm':[('p3_exp15_launch_fail',3),('p3_exp15_weaklink_flyer_lost',8)],
 'Full run: 4.5 m/s tailwind (the round-4 critical band)':[('t04_tail45_refusal_quiver_out',20)],
 'Downloading chairlift (5 m/s descent, no on-snow vibration)':[('t11_chair_download_stowed',10)]}
log=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':1440,'height':1000}); pg.set_default_timeout(180000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8791/concepts.html?c=activetether&m=test&lang=en&quality=low'); pg.wait_for_timeout(15000)
    n=pg.locator('#scenarioList li').count()
    for k in range(1,n+1):
        btn=pg.locator(f'#scenarioList li:nth-child({k}) button'); label=btn.inner_text().strip()
        key=next((w for w in want if label.startswith(w)),None)
        if not key: continue
        btn.click(); pg.wait_for_timeout(9000)
        for name,t in want[key]:
            pg.evaluate(f'window.__lab.seek({t})'); pg.wait_for_timeout(2500)
            pg.screenshot(path=f'{OUT}/{name}.png')
            log.append({'shot':name+'.png','scenario':label,'t':t,'time':pg.inner_text('#timeOut')})
    log.append({'errors':errs}); b.close()
json.dump(log,open(f'{OUT}/shots2_log.json','w'),indent=1); print(log)
