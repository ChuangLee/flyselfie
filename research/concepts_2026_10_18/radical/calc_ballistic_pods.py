#!/usr/bin/env python3
"""Ballistic camera pods: (a) vertical toss-and-catch while skiing,
(b) throw-ahead ground pod, (c) tether-guided catapult burst pod.
Point-mass with quadratic drag, skier speed changes on slope.  ASSUMED inputs.
Run: python3 calc_ballistic_pods.py
"""
import math
g = 9.81; rho = 1.0   # air density at ~2000 m altitude, cold (ASSUMED ~1.0 kg/m3)

def fly(v0x, v0z, m, CdA, dt=0.001, z0=0.0, wind=0.0):
    x, z, vx, vz, t = 0.0, z0, v0x, v0z, 0.0
    zmax = z
    while True:
        rvx = vx-wind
        v = math.hypot(rvx, vz)
        k = 0.5*rho*CdA*v/m
        ax = -k*rvx; az = -g-k*vz
        vx += ax*dt; vz += az*dt; x += vx*dt; z += vz*dt; t += dt
        zmax = max(zmax, z)
        if z <= z0 and vz < 0:
            return t, x, zmax, math.hypot(vx, vz)

print("== (a) Vertical toss-and-catch while skiing ==")
m, CdA = 0.12, 0.6*0.0025     # 120 g pod ~ 5.6 cm sphere-ish, Cd 0.6 (ASSUMED)
for h in (3, 6, 10):
    v0z = math.sqrt(2*g*h)*1.08   # extra to overcome drag (approx)
    for vs in (8.0, 12.0):
        # pod inherits skier horizontal speed vs; skier then changes speed by a_s
        t, x, zmax, vimp = fly(vs, v0z, m, CdA)
        for a_s in (-1.0, 0.0, 1.5):   # braking turn / steady / accelerating on steeper pitch (m/s2)
            xs = vs*t + 0.5*a_s*t*t
            miss = x - xs
            print(f"  apex {zmax:4.1f} m, flight {t:4.2f} s, skier {vs:4.1f} m/s, skier accel {a_s:+.1f}: along-track miss {miss:+5.2f} m;"
                  f" return speed {vimp:4.1f} m/s, KE {0.5*m*vimp**2:4.1f} J")
print("  Hand catch window ~ +/-0.3 m (ASSUMED, gloved, while skiing). Skier must look up ~0.5-1 s:"
      " at 10 m/s that is 5-10 m of slope travelled without looking ahead.")
print("  Lateral: any turn of radius R moves the skier sideways by ~ v^2 t^2 /(2R); R=20 m, v=10 m/s, t=2 s ->"
      f" {10**2*2**2/(2*20):.0f} m  => catch only possible in straight gliding.")

print("\n== (b) Throw-ahead ground pod (thrown downhill from standstill, films approach) ==")
for vt in (12.0, 16.0):
    t, x, zmax, vimp = fly(vt*math.cos(math.radians(30)), vt*math.sin(math.radians(30)), m, CdA, z0=1.5)
    # add slide on snow after landing (ASSUMED 3 m) and slope 20 deg increases horizontal range ~ x/(1 - tan(slope)*...)
    d = x + 3.0
    # skier accelerates from 0 at a=2 m/s2 toward pod; time to reach
    a = 2.0
    T = math.sqrt(2*d/a)
    print(f"  throw {vt:4.1f} m/s @30deg: lands ~{x:4.1f} m out (+3 m slide), approach shot {T:4.1f} s (skier accelerates 2 m/s2,"
          f" arrives at {a*T:4.1f} m/s), impact KE {0.5*m*vimp**2:4.1f} J")
print("  Thrown while moving at 10 m/s with +10 m/s relative: gap opens ~9 m only -> <1 s of approach footage. Must throw from standstill.")
print("  Pickup: stop beside pod (~5-10 s). Powder burial: pod at 15 m/s into soft snow penetrates ~0.1-0.3 m (ASSUMED) -> needs streamer/beacon.")
print("  SCOPE FLAG: docs/19 excludes self-pre-placed environment cameras; a throw-ahead pod is a momentary self-placed cam -> borderline/likely excluded.")

print("\n== (c) Tether-guided catapult burst pod (from backpack, while STOPPED) ==")
m_c, CdA_c = 0.08, 0.8*0.0020
for h in (8, 15):
    v0 = math.sqrt(2*g*h)*1.12
    t, x, zmax, vimp = fly(0.0, v0, m_c, CdA_c, z0=1.6)
    E_launch = 0.5*m_c*v0**2
    # elastic launcher: energy stored, efficiency 0.5 (ASSUMED)
    print(f"  apex {zmax:4.1f} m, flight {t:4.2f} s, launch speed {v0:4.1f} m/s, launch KE {E_launch:4.1f} J"
          f" (elastic store ~{E_launch/0.5:4.1f} J), uncontrolled fall KE {0.5*m_c*vimp**2:4.1f} J")
    # with a 0.25 m drag streamer/chute descent: CdA ~ 0.03 -> terminal
    vt = math.sqrt(2*m_c*g/(rho*0.03))
    print(f"     with deployed 0.03 m2 drag chute: terminal {vt:4.1f} m/s, KE {0.5*m_c*vt**2:4.2f} J, descent ~{zmax/vt:4.1f} s of extra footage")
print("  Line: 15 m of 1 mm Dyneema ~ 8-10 g (ASSUMED 0.6 g/m). Reel-in 15 m at 1.5 m/s = 10 s. Wind 5 m/s drifts chute pod"
      " ~ wind*t_descent downwind -> tether keeps it bounded (it becomes a tiny kite).")
print("  Footage: top-down 360 from 8-15 m for 2.5-6 s per shot; spin must be <~1 rev/s for 360 stitching/EIS to cope (ASSUMED).")
