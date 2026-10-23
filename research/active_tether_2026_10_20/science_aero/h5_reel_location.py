"""H5 - reel on the flyer vs reel in the backpack.

Mass items are ASSUMED catalogue-class values (micro metal gearmotor ~9.5 g, Pololu); flyer energy
for reeling comes from h2/h3 results (mean reel power). Consequences evaluated with the same physics
as h1/h4: stall speed (sqrt(m)), static elevation at Va 8 m/s (h1 solver), KE at 13.2 m/s rider speed,
the 171 g KE mass ceiling, and the cell mass the flyer must carry for reel energy per 45 min.
"""
import json
import math
import os
from common import G130, LINE_COND, LINE_DYN, Flyer, save, ke_speed_cap, WH_PER_KG, COLD, RESERVE, HERE
from h1_equilibrium import best

USABLE = COLD * (1 - RESERVE)


def flyer_plus(dm, name, S=None):
    return Flyer(name, G130.m + dm, S or G130.S, G130.AR, G130.CD0, G130.e, G130.CLmax)


def run():
    # reel kit on the flyer (ASSUMED class values)
    kit = {
        'micro gearmotor (N20 / micro metal class)': 9.5,
        'spool + level-wind + frame': 6.0,
        'line 30 m UHMWPE 0.5 mm (0.15 g/m)': 4.5,
        'driver + encoder + tension sense (current)': 2.0,
    }
    kit_g = sum(kit.values())
    # reel energy per 45 min (from h2/h3 where available)
    h3p = os.path.join(HERE, 'h3_results.json')
    h2p = os.path.join(HERE, 'h2_results.json')
    reelW_tension = None
    if os.path.exists(h3p):
        tb = json.load(open(h3p))['timeDomain']
        m1 = [r['reelPowerMeanAbs_W'] for r in tb if r.get('ok') and r['mode'] == 1]
        reelW_tension = round(sum(m1) / len(m1), 2) if m1 else None
    yoyoW = None
    if os.path.exists(h2p):
        rr = [r for r in json.load(open(h2p))['S2_S3_sim'] if r.get('strategy') == 'S3_yoyo' and r['ok'] and r['flyer'] == 'G130']
        yoyoW = round(min(r['meanP_W'] for r in rr), 2) if rr else None
    cases = []
    scen = [('heave/tension trim only (0.5 W mean, ASSUMED)', 0.5),
            ('tension-tracking reel (h3 mode 1 mean |P|)', reelW_tension or 4.0),
            ('calm-stop yo-yo 40 % of the time (h2 S3 best)', 0.4 * (yoyoW or 6.0))]
    for label, W in scen:
        Wh = W * 0.75  # 45 min
        cell_g = Wh / USABLE / WH_PER_KG * 1000
        for where in ('flyer', 'backpack'):
            dm = (kit_g + cell_g) / 1000 if where == 'flyer' else 0.0
            # backpack reel with a conductive line can power the flyer: flyer cell (8 g in kite2/towglider) removed
            if where == 'backpack':
                dm -= 0.008
            fl = flyer_plus(dm, f'G{round((G130.m + dm) * 1000)}')
            line = LINE_DYN if where == 'flyer' else LINE_COND
            CL, e = best(fl, line, 15, 8.0, objective='ld')
            cases.append(dict(scenario=label, reelAt=where, reelPower_W=round(W, 2), flyerCell_g=round(cell_g, 1) if where == 'flyer' else 0.0,
                              flyerMass_g=round(fl.m * 1000, 1), vmin=round(fl.vmin(), 2),
                              eps_Va8_l15=None if e is None else round(math.degrees(e), 1),
                              KE_at_13_2=round(0.5 * fl.m * 13.2 ** 2, 1), keCapSpeed=round(ke_speed_cap(fl.m), 2),
                              line=line.name))
    # dynamics argument: disturbance enters at the exit; compensating at the pack needs no radio hop
    dyn = dict(
        exitDisturbance='rider carving: exit speed oscillation ~0.8 m/s at 0.69 Hz, body heave 3 cm at 2 Hz, hockey-stop lean flip moves the exit 8-9 m/s for ~0.4 s (kite2 design_notes rootCause.ke)',
        packReelLatency_ms='~10-20 (pack IMU -> motor, local) ASSUMED',
        flyerReelLatency_ms='~30-60 (pack IMU -> radio -> flyer MCU -> motor) ASSUMED',
        flyerReelPeakPower_W='to cancel a 8 m/s, 0.4 s lean-flip at 5 N needs ~40 W peak and ~20 m/s^2 for a few hundred ms - a 9.5 g gearmotor is ~1-2 W class',
        packReelPeakPower_W='40 W peak is a 30-50 g outrunner + 1:5 belt: fine in the pack (ASSUMED)',
    )
    save('h5_results.json', dict(model=__doc__, flyerReelKit_g=kit, kit_total_g=kit_g, cases=cases, dynamics=dyn))
    return cases, kit_g


if __name__ == '__main__':
    c, k = run()
    print('kit', k)
    for r in c:
        print(r)
