"""Shared physical basis for the active-tether science scripts (SIM-032, aero/flight-dynamics).

Evidence level: first-principles reduced-order models, numerical-uncalibrated.
Nothing here is a measurement. Every coefficient without a source is ASSUMED.
All scripts write JSON next to themselves; build_report.py assembles report.json.
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
G = 9.81

# Atmosphere: shared design day of the concept lab (sim/js/concepts/common/components.js ATMOS)
RHO = 1.0          # kg/m^3, 2000-2500 m, -10 C (ASSUMED design day, same as components.js)
NU = 1.67e-5       # m^2/s kinematic viscosity at -10 C, rho 1.0 (mu 1.67e-5 Pa s; Sutherland)

# Battery basis (components.js BATTERY): 150 Wh/kg pack, 0.75 cold, 15 % reserve
WH_PER_KG = 150.0
COLD = 0.75
RESERVE = 0.15
KE_CAP = 14.9      # J, shared criterion keMax (FAA Cat 2 basis)


def ke_speed_cap(m, J=KE_CAP):
    return math.sqrt(2 * J / m)


class Flyer:
    """Point-mass flyer with a parabolic polar CD = CD0 + dCD_brake + k CL^2.

    kind 'glider' = rigid small glider (camera pod, tail); kind 'kite' = low-wing-loading
    soft / semi-rigid wing. Polars ASSUMED from low-Re practice (see report sources)."""

    def __init__(self, name, m, S, AR, CD0, e=0.8, CLmax=1.1, CLmin=0.05, kind='glider'):
        self.name, self.m, self.S, self.AR, self.CD0, self.e = name, m, S, AR, CD0, e
        self.CLmax, self.CLmin, self.kind = CLmax, CLmin, kind
        self.k = 1.0 / (math.pi * e * AR)

    def CD(self, CL, brake=0.0):
        return self.CD0 + brake + self.k * CL * CL

    @property
    def LDmax(self):
        return 0.5 / math.sqrt(self.CD0 * self.k)

    @property
    def CL_LDmax(self):
        return math.sqrt(self.CD0 / self.k)

    def vmin(self, rho=RHO):  # 1 g level flight at CLmax (stall)
        return math.sqrt(2 * self.m * G / (rho * self.S * self.CLmax))

    def v_at(self, CL, rho=RHO):
        return math.sqrt(2 * self.m * G / (rho * self.S * CL))

    def chord(self):
        return math.sqrt(self.S / self.AR)

    def Re(self, V):
        return V * self.chord() / NU

    def to_dict(self):
        return dict(name=self.name, kind=self.kind, mass_g=round(self.m * 1000, 1), S_m2=self.S, AR=self.AR,
                    span_m=round(math.sqrt(self.S * self.AR), 3), chord_m=round(self.chord(), 3), CD0=self.CD0,
                    e=self.e, CLmax=self.CLmax, wingLoading_Nm2=round(self.m * G / self.S, 2),
                    LDmax=round(self.LDmax, 2), vmin_ms=round(self.vmin(), 2),
                    Re_at_7ms=round(self.Re(7.0)))


def glider_with_LD(LD, m=0.130, S=0.11, AR=6.0, e=0.8, CLmax=1.1, name=None):
    """Rigid glider sized for a target (L/D)max by its zero-lift drag (low-Re reality check in report)."""
    k = 1.0 / (math.pi * e * AR)
    CD0 = (0.5 / LD) ** 2 / k
    return Flyer(name or f'G{int(m*1000)}_LD{LD:g}', m, S, AR, CD0, e, CLmax, kind='glider')


# Baselines (ASSUMED)
# G130: 130 g rigid glider, 0.11 m^2 (span 0.81 m, AR 6), Re ~ 5e4 at 7 m/s -> CD0 0.045 incl. camera pod/tail
#        (low-Re profile cd 0.02-0.03, Selig/UIUC; pod+tail+interference ~0.015-0.02) -> (L/D)max ~ 9
G130 = Flyer('G130', 0.130, 0.11, 6.0, 0.045, 0.8, 1.1, kind='glider')
# K120: 120 g low-wing-loading semi-rigid kite/wing, 0.6 m^2, AR 4, CD0 0.09 (single-skin + bridle) -> (L/D)max ~ 5
K120 = Flyer('K120', 0.120, 0.60, 4.0, 0.09, 0.7, 1.0, kind='kite')


class Line:
    """Tether. Defaults: towglider conductive line 0.60 mm, 0.40 g/m (design_notes.json, round 3)."""

    def __init__(self, d=0.6e-3, mu=0.40e-3, Cd=1.1, EA=5000.0, name='conductive 0.6 mm'):
        # EA ~ 0.17 mm UHMWPE core (~2.3 kN) + 14 x 44 AWG Cu (~3.2 kN), ASSUMED; break load ~60-80 N (ASSUMED)
        self.d, self.mu, self.Cd, self.EA, self.name = d, mu, Cd, EA, name

    def to_dict(self):
        return dict(name=self.name, d_mm=self.d * 1000, g_per_m=self.mu * 1000, Cd=self.Cd, EA_N=self.EA,
                    Re_at_10ms=round(10 * self.d / NU))


LINE_COND = Line()
# plain Dyneema/UHMWPE 0.5 mm braid ~0.15 g/m (ASSUMED from 0.97 g/cm^3 x ~0.7 packing)
LINE_DYN = Line(d=0.5e-3, mu=0.15e-3, Cd=1.1, EA=10000.0, name='UHMWPE 0.5 mm')


# Camera of the towglider round 3: 4K 4:3 3840x2880 through a 66 deg HFOV rectilinear lens (ASSUMED there)
CAM = dict(w=3840, h=2880, hfov_deg=66.0)
CAM['vfov_deg'] = 2 * math.degrees(math.atan(math.tan(math.radians(CAM['hfov_deg'] / 2)) * CAM['h'] / CAM['w']))

RIDER_H = 1.75 * (1 - 0.16 * 0.3)  # env.js subjectPoints with crouch 0.3 -> 1.666 m


def _norm(a):
    l = math.sqrt(sum(x * x for x in a)) or 1.0
    return [x / l for x in a]


def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def body_px(cam_pos, lean_deg=0.0, cam=CAM):
    """Replicates sim/js/concepts/common/env.js footage().bodyPx for an upright/leaning rider at the
    origin heading +x (camera up = world z, camera aimed at the 0.55 H point)."""
    H = RIDER_H
    ln = math.radians(lean_deg)
    up = [0.0, math.sin(ln), math.cos(ln)]
    P = lambda u, l: [up[0] * u, up[1] * u + l, up[2] * u]
    feet, head, shL, shR, mid = P(0, 0), P(H, 0), P(0.82 * H, 0.22), P(0.82 * H, -0.22), P(0.55 * H, 0)
    f = _norm([m - c for m, c in zip(mid, cam_pos)])
    upv = [0, 0, 1]
    if abs(_dot(f, upv)) > 0.999:
        upv = [1, 0, 0]
    r = _norm(_cross(f, upv))
    u = _cross(r, f)
    tv = math.tan(math.radians(cam['vfov_deg']) / 2)
    ys = []
    for p in (feet, head, shL, shR):
        d = [a - b for a, b in zip(p, cam_pos)]
        z = _dot(d, f)
        ys.append(_dot(d, u) / z / tv)
    return (max(ys) - min(ys)) / 2 * cam['h']


def point_line_dist(p, a, b):
    """distance from point p to segment a-b (3D)"""
    ab = [y - x for x, y in zip(a, b)]
    ap = [y - x for x, y in zip(a, p)]
    t = max(0.0, min(1.0, _dot(ap, ab) / max(1e-12, _dot(ab, ab))))
    q = [x + t * y for x, y in zip(a, ab)]
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(p, q)))


def save(name, obj):
    path = os.path.join(HERE, name)
    with open(path, 'w') as fh:
        json.dump(obj, fh, indent=1, ensure_ascii=False)
    return path


def r(x, n=2):
    if isinstance(x, float):
        return round(x, n)
    return x
