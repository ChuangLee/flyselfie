"""Shared constants and helpers for the round-2 inventor lens (2026-10-19).

Stdlib only, deterministic. Source tags on every constant:
  calc    = derived here
  lit     = cited public source (URL in concepts.json prior_art / key_numbers)
  assumed = engineering placeholder, NOT measured (label ASSUMED in outputs)
Simulation and calculation are not physical verification.
"""
import json
import math
import os

G = 9.81
HERE = os.path.dirname(os.path.abspath(__file__))

RHO = 1.00            # kg/m3 design density, 2000-2500 m, -10 C (assumed, same as round-1 RHO_CONS)
NU = 1.5e-5           # m2/s kinematic viscosity at 2000 m, -10 C (calc from mu=1.67e-5 / rho 1.05)
COLD_CAP = 0.75       # usable Li-ion fraction at -10 C (assumed, round-1 value)
RESERVE = 0.90        # keep 10 % reserve (assumed)
SKIER_H = 1.75        # m (brief)
KE_LIMIT = 14.9       # J (criteria.js keMax, FAA Part 107 cat 2)
V_MEAN, V_SD = 11.0, 3.5   # skier speed N(11,3.5) m/s (assumed, round-1 calc_common)

# Piste slope mix for a blue/red resort day (ASSUMED weights; bands from Swiss/Scandinavian
# grading: blue <=15 deg, red <=25 deg, https://en.wikipedia.org/wiki/Piste)
SLOPE_MIX = [(4, 0.10), (8, 0.15), (12, 0.25), (16, 0.25), (20, 0.15), (25, 0.10)]
CENTRELINE = 0.85     # centreline speed / skier speed in linked turns (assumed)


def frac_speed_above(v):
    z = (v - V_MEAN) / V_SD
    return 0.5 * math.erfc(z / math.sqrt(2))


def speed_bins(n=13, lo=4.0, hi=20.0):
    """Discretised skier-speed distribution, weights sum to 1 (truncated normal)."""
    out = []
    step = (hi - lo) / (n - 1)
    for i in range(n):
        v = lo + i * step
        w = math.exp(-0.5 * ((v - V_MEAN) / V_SD) ** 2)
        out.append((v, w))
    s = sum(w for _, w in out)
    return [(v, w / s) for v, w in out]


def ke(m, v):
    return 0.5 * m * v * v


def v_for_ke(m, e=KE_LIMIT):
    return math.sqrt(2 * e / m)


def subject_px(d, hfov_deg=90.0, h_res=3840, v_res=2160, h=SKIER_H):
    """Native vertical pixels of a standing skier at range d (rectilinear after EIS crop)."""
    vfov = 2 * math.atan(math.tan(math.radians(hfov_deg) / 2) * v_res / h_res)
    frame_h = 2 * d * math.tan(vfov / 2)
    return v_res * h / frame_h


def px_per_mrad(hfov_deg=90.0, h_res=3840):
    return h_res / (math.radians(hfov_deg) * 1000.0)


class Glider:
    """Parabolic-polar glider. CL limited to clmax; airbrake adds dcd0."""

    def __init__(self, m, S, AR, cd0, e=0.8, clmax=1.0, cla=4.5, name=""):
        self.m, self.S, self.AR, self.cd0, self.e = m, S, AR, cd0, e
        self.clmax, self.cla, self.name = clmax, cla, name
        self.W = m * G
        self.span = math.sqrt(S * AR)
        self.chord = S / self.span

    def cl(self, V, n=1.0):
        return n * self.W / (0.5 * RHO * V * V * self.S)

    def v_stall(self, n=1.0):
        return math.sqrt(2 * n * self.W / (RHO * self.S * self.clmax))

    def ld(self, V, n=1.0, dcd0=0.0, ground_k=1.0, extra_drag=0.0):
        cl = self.cl(V, n)
        if cl > self.clmax:
            return 0.0
        cd = self.cd0 + dcd0 + ground_k * cl * cl / (math.pi * self.e * self.AR)
        D = 0.5 * RHO * V * V * self.S * cd + extra_drag
        return n * self.W / D

    def sink(self, V, **kw):
        l = self.ld(V, **kw)
        return float('inf') if l == 0 else V / l

    def best(self):
        best = (0, 0)
        v = self.v_stall() * 1.05
        while v < 30:
            l = self.ld(v)
            if l > best[0]:
                best = (l, v)
            v += 0.05
        return best

    def min_sink(self):
        best = (1e9, 0)
        v = self.v_stall() * 1.05
        while v < 30:
            s = self.sink(v)
            if s < best[0]:
                best = (s, v)
            v += 0.05
        return best

    def re(self, V):
        return V * self.chord / NU


def dump(name, obj):
    p = os.path.join(HERE, name)
    with open(p, "w") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    return p


def r(x, n=2):
    if isinstance(x, float):
        return round(x, n)
    return x
