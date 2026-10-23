#!/usr/bin/env python3
"""RES-040 body lens: can a sprung / pendulum / iso-elastic boom root isolate mogul bounce?
Single-DOF base isolation of the boom+camera in the vertical (body-frame) direction.
Key conflict: turn load factor varies at 0.3-1 Hz, moguls excite 1-3 Hz, chatter 5-30 Hz.
Outputs results_isolation.json."""
import json, math, os

G = 9.81


def T(r, z):
    return math.sqrt((1 + (2 * z * r) ** 2) / ((1 - r * r) ** 2 + (2 * z * r) ** 2))


rows = []
for fn in (0.7, 1.0, 1.5, 2.5, 4.0):
    for z in (0.1, 0.3):
        w = 2 * math.pi * fn
        rows.append(dict(f_iso_Hz=fn, zeta=z,
                         drift_per_g_m=round(G / w ** 2, 3),
                         drift_turn_extra_0p8g_m=round(0.8 * G / w ** 2, 3),
                         T_turn_0p5Hz=round(T(0.5 / fn, z), 2), T_mogul_2Hz=round(T(2 / fn, z), 2),
                         T_chatter_10Hz=round(T(10 / fn, z), 3)))
out = dict(rows=rows, conclusion="Isolating 1-3 Hz moguls needs f_iso<~0.7 Hz, which drifts ~0.5 m per g of turn load "
           "(turn load factor 1->1.8 g) and amplifies at turn rhythm. Passive isolation only works for chatter (f_iso 2.5-4 Hz), "
           "which a damped carbon boom already gives. => prefer damping (zeta>=0.1) + 360 electronic rotation stabilisation.")
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "results_isolation.json"), "w"), indent=1)
for r in rows:
    print(r)
print(out["conclusion"])
