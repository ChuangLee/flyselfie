#!/usr/bin/env python3
"""Docking micro-drone (highlight shots) + dual-device auto-director coverage.
Momentum-theory hover power, battery per shot, cycle overhead, dock accuracy,
external-view coverage per ski day.  ASSUMED unless marked lit.
Run: python3 calc_drone_dock_director.py
"""
import math
g = 9.81; rho = 1.0   # ~2000 m, cold

print("== Hover / cruise power, ~150 g class (lit: DJI Neo 2 takeoff 151 g) ==")
m = 0.151
for r_prop in (0.025, 0.030):
    A = 4*math.pi*r_prop**2
    T = m*g
    P_ideal = T**1.5/math.sqrt(2*rho*A)
    for FM in (0.45, 0.55):
        P = P_ideal/FM + 2.0   # + avionics/camera ~2 W
        print(f"  prop r={r_prop*100:.1f} cm, disk {A*1e4:.0f} cm2, FM {FM}: P_hover ~ {P:4.1f} W")
P_avg = 32.0   # W, ASSUMED average incl. 8-12 m/s follow (ducted props, high disk loading)
E_batt = 10.0  # Wh, ASSUMED (Neo-class 2S ~1400-1600 mAh)
cold = 0.70    # usable fraction at -10 C, ASSUMED
E_use = E_batt*cold*0.85  # 15% reserve
print(f"  ASSUMED avg power {P_avg} W, battery {E_batt} Wh x cold {cold} x reserve 0.85 = {E_use:.1f} Wh -> {E_use/P_avg*60:.1f} min airtime")

print("\n== Per highlight shot cycle (stationary launch + palm/dock recovery) ==")
steps = {   # seconds, ASSUMED
    "stop, unstow, glove-press launch": 12,
    "climb + acquire target": 5,
    "highlight follow shot": 30,
    "skier stops; drone returns & lands (palm/dock)": 10,
    "stow / lid closed": 8,
}
air = 5 + 30 + 10
tot = sum(steps.values())
for k, v in steps.items():
    print(f"  {k:48s} {v:3d} s")
E_shot = P_avg*air/3600
print(f"  total {tot} s of which overhead (non-shot) {tot-30} s; airtime {air} s -> {E_shot:.2f} Wh/shot -> {E_use/E_shot:.0f} shots/battery")

print("\n== Dock approach accuracy ==")
print("  Stationary skier on a backpack/shoulder dock: body sway ~ +/-2-3 cm @0.3-1 Hz (ASSUMED quiet stance on skis).")
for capture_r in (0.03, 0.06, 0.10):
    print(f"   funnel capture radius {capture_r*100:.0f} cm vs combined drone hover error (vision, gusts) ~3-6 cm (ASSUMED) -> "
          f"{'marginal' if capture_r < 0.06 else 'plausible'}")
print("  Moving dock (skier at 10 m/s carving R=15 m): lateral accel v^2/R = %.1f m/s2;" % (10**2/15))
for bw_hz, lat in ((2.0, 0.08), (4.0, 0.05)):
    w = 2*math.pi*bw_hz
    a_lat = 10**2/15
    # tracking error of a 2nd-order loop to accel a ~ a/w^2, plus latency x relative-velocity jitter (ASSUMED 1 m/s from
    # carving/chatter/body pumping) plus 1 cm sensor noise; rough lower bound, ignores rotor wash off the body
    err = a_lat/w**2 + lat*1.0 + 0.5*a_lat*lat**2 + 0.01
    print(f"   position-loop BW {bw_hz} Hz, latency {lat*1000:.0f} ms: error ~ {err*100:.0f} cm (capture needs <~3-5 cm while body also pitches/rolls +/-10 deg) -> moving docking NOT credible for v1")
print("  Rotor near head: 150 g at 12 m/s KE = %.1f J; prop tip speed at 30k rpm, r=2.5 cm = %.0f m/s (guarded/ducted mandatory)"
      % (0.5*0.151*144, 30000/60*2*math.pi*0.025))

print("\n== Dual-device auto-director: external-view coverage per day ==")
runs, run_s = 12, 180          # ASSUMED: 12 runs of 3 min descent
for shots_per_run in (1, 2, 3):
    ext = shots_per_run*30
    stops_extra = shots_per_run*(tot-30)
    print(f"  {shots_per_run} flyer shot(s)/run: external aerial {ext} s of {run_s} s descent = {100*ext/run_s:.0f}%; "
          f"added stop overhead {stops_extra} s/run ({100*stops_extra/run_s:.0f}% of descent time); "
          f"day: {runs*shots_per_run} shots, battery swaps {math.ceil(runs*shots_per_run/(E_use/E_shot))-1}")
print("  Body cam (helmet/chest/boom 360) covers ~100% of descent continuously; director merges.")
print("  Honest metric: % of edited output from a REAL external viewpoint vs body-anchored viewpoint; no synthetic fill.")
print("\n  Legal (lit): Vail Resorts bans recreational drones on its mountains; many resorts require written permission.")
