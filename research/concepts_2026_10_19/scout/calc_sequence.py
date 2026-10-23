"""User sequences with timings for the ranked concepts (ASSUMED durations, gloved hands).
Counts per the criteria.js definitions: ops = deploy/launch, stow/land, battery swap, recovery per run;
standstill = seconds stopped because of the device per run; handsBusy = 1 s per action while moving."""
from calc_common import save

RUN_S = 150   # filmed seconds per run (ASSUMED, matches calc_descent_glider)

SEQ = {
 'S2-01': [  # morph descent glider, belly-lands in snow
  dict(step='day start: clip 1.2 L shoulder-strap quiver, glider inside (power-on by removal)', t=0, moving=False, action=False, once=True),
  dict(step='push off; at >=7 m/s draw glider from quiver and release overhead (wings spring out, apparent wind = launch speed)', t=2, moving=True, action=True),
  dict(step='ride: autonomous follow 6-10 m behind/above via UWB tag + vision; regen on steep pitches', t=0, moving=True, action=False),
  dict(step='mid-run stop: glider orbits r~10 m at 2.4 W (orbit shot), rejoins on restart; no user input', t=0, moving=False, action=False),
  dict(step='end of run: glider belly-lands 3-5 m to the downhill side; skier slides to it and picks it up', t=6, moving=False, action=True),
  dict(step='insert tail-first in quiver (wings fold on the tube mouth), board lift', t=3, moving=False, action=True),
  dict(step='end of day: USB-C charge quiver+glider', t=0, moving=False, action=False, once=True)],
 'S2-02': [  # VTOL tail-sitter descent glider, palm/cradle landing
  dict(step='stopped at top: press shoulder-cradle button; glider climbs vertically to 4 m, transitions to wing-borne', t=4, moving=False, action=True),
  dict(step='ride: wing-borne follow; hover only for transitions', t=0, moving=True, action=False),
  dict(step='end of run: stop; glider transitions to hover and lands in the shoulder cradle funnel (auto on standstill >3 s)', t=10, moving=False, action=False),
  dict(step='cradle latch confirms; board lift', t=1, moving=False, action=True)],
 'S2-03': [  # S2-01 + skyhook in-motion recovery
  dict(step='push off; release glider overhead at >=7 m/s', t=2, moving=True, action=True),
  dict(step='ride: follow', t=0, moving=True, action=False),
  dict(step='last 100 m: tap strap button (or automatic on lift-approach geofence); 1.5 m tag line streams from a 1.2 m pack whip', t=1, moving=True, action=True),
  dict(step='glider hooks the line at 1-2 m/s closing speed; reel draws it into the dorsal quiver in ~3 s', t=0, moving=True, action=False),
  dict(step='stop at lift: nothing to do', t=0, moving=False, action=False)],
 'S2-04': [  # crosswind steered kite (input to kite2)
  dict(step='push off; pack boom releases kite above ~3 m/s skier speed', t=0, moving=True, action=True),
  dict(step='ride: parked at 35-50 deg elevation when fast; flies figure-8s when slow (down to ~2.2 m/s)', t=0, moving=True, action=False),
  dict(step='stop: kite glides down behind; reel retrieves into boom cradle', t=8, moving=False, action=True)],
}

out = {}
for cid, steps in SEQ.items():
    per_run = [s for s in steps if not s.get('once')]
    stand = sum(s['t'] for s in per_run if not s['moving'])
    ops = sum(1 for s in per_run if s['action'])
    hands_moving_s = sum(1 for s in per_run if s['action'] and s['moving'])
    out[cid] = dict(steps=steps, standstill_s_per_run=stand, ops_per_run=ops,
                    hands_busy_pct=round(100 * hands_moving_s / RUN_S, 2),
                    pass_standstill=stand <= 30, pass_ops=ops <= 2, pass_hands=100 * hands_moving_s / RUN_S <= 5)
out['S2-01']['note'] = ('3 ops/run by the strict definition (launch, pick-up, insert); 2 if pick-and-insert counts as one '
                        'recovery. S2-03 is the fix (1-2 ops, 0 s standstill).')
save('sequence', out)
if __name__ == '__main__':
    for k, v in out.items():
        print(k, {kk: vv for kk, vv in v.items() if kk != 'steps'})
