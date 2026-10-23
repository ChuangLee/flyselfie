"""Reduced-order 3D tethered-flyer simulator (point mass + elastic straight line + reel).

Frame: rider frame (origin = line exit on the rider), translating with the rider; uniform apparent
wind Wa (horizontal) = wind - rider velocity; optional rider acceleration a_rider(t) enters as a
fictitious force. z up; snow at z = -z_exit.

Flyer: point mass, lift CL (rate-limited 'elevator'), bank mu about the airspeed vector (rate-limited
'aileron', 300 deg/s ASSUMED micro-servo class), parabolic polar + optional airbrake dCD.
Lift reference: 'tether' mode -> lift lies in the plane of va and the line (kite-like, lift points
away from the exit); 'free' mode -> lift in the vertical plane (glider). Tension: one-sided spring-
damper k = EA/l. Line: straight, normal-component drag integrated along the line with the line
velocity varying linearly from the exit (0) to the flyer (moment-consistent force at the flyer);
half the line weight carried at the flyer, a third of its mass added to the flyer inertia.
Reel: speed command, |a| <= reel_acc, |v| <= reel_vmax (finite actuator, A3-X-08 spirit).
Evidence: numerical-uncalibrated; ASSUMED coefficients; not a validated model.
"""
import math
from common import G, RHO

QS = [(0.0198550717512319, 0.0506142681451881), (0.1016667612931866, 0.1111905172266872),
      (0.2372337950418355, 0.1568533229389436), (0.4082826787521751, 0.1813418916891810),
      (0.5917173212478249, 0.1813418916891810), (0.7627662049581645, 0.1568533229389436),
      (0.8983332387068134, 0.1111905172266872), (0.9801449282487681, 0.0506142681451881)]  # 8-pt Gauss on [0,1]


def add(a, b): return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
def sub(a, b): return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
def mul(a, s): return [a[0] * s, a[1] * s, a[2] * s]
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
def norm(a): return math.sqrt(dot(a, a))
def unit(a):
    n = norm(a)
    return [a[0] / n, a[1] / n, a[2] / n] if n > 1e-12 else [0.0, 0.0, 0.0]
def clamp(x, lo, hi): return lo if x < lo else hi if x > hi else x


class State:
    def __init__(self, p, v, l, ldot=0.0, CL=0.5, mu=0.0):
        self.p, self.v, self.l, self.ldot, self.CL, self.mu = list(p), list(v), l, ldot, CL, mu
        self.t = 0.0


class Sim:
    def __init__(self, flyer, line, Wa=(0.0, 0.0, 0.0), z_exit=1.35, reel_acc=20.0, reel_vmax=8.0,
                 bank_rate=math.radians(300), CL_rate=3.0, mu_max=math.radians(65), a_rider=None, gust=None,
                 damping=0.3):
        self.f, self.ln = flyer, line
        self.Wa = list(Wa)
        self.z_exit = z_exit
        self.reel_acc, self.reel_vmax = reel_acc, reel_vmax
        self.bank_rate, self.CL_rate, self.mu_max = bank_rate, CL_rate, mu_max
        self.a_rider = a_rider          # function t -> 3-vector rider acceleration (fictitious force -m a)
        self.gust = gust                # function (t, p) -> 3-vector added to Wa
        self.zeta = damping
        self.brake = 0.0
        self.lift_mode = 'tether'

    def wind(self, t, p):
        w = self.Wa
        if self.gust:
            g = self.gust(t, p)
            w = add(w, g)
        return w

    def forces(self, s, CLcmd=None):
        f, ln = self.f, self.ln
        p, v = s.p, s.v
        W = self.wind(s.t, p)
        va = sub(v, W)
        V = norm(va) + 1e-9
        vh = mul(va, 1.0 / V)
        er = unit(p)
        ref = er if self.lift_mode == 'tether' else [0.0, 0.0, 1.0]
        L0 = sub(ref, mul(vh, dot(ref, vh)))
        if norm(L0) < 1e-6:
            L0 = [0.0, 0.0, 1.0]
        L0 = unit(L0)
        side = cross(vh, L0)
        eL = add(mul(L0, math.cos(s.mu)), mul(side, math.sin(s.mu)))
        q = 0.5 * RHO * V * V
        CL = s.CL
        Lf = mul(eL, q * f.S * CL)
        Df = mul(vh, -q * f.S * f.CD(CL, self.brake))
        # line
        d = norm(p)
        k = ln.EA / max(s.l, 0.3)
        mline = ln.mu * s.l
        meff = f.m + mline / 3.0
        ddot = dot(v, er)
        c = 2 * self.zeta * math.sqrt(k * meff)
        T = 0.0
        if d > s.l:
            T = max(0.0, k * (d - s.l) + c * (ddot - s.ldot))
        Tf = mul(er, -T)
        # line drag (straight line through exit and flyer, length = min(d, l) taut part)
        Fl = [0.0, 0.0, 0.0]
        lt = min(d, s.l)
        for sig, w in QS:
            u = sub(mul(v, sig), W)
            un = sub(u, mul(er, dot(u, er)))
            unn = norm(un)
            if unn > 1e-9:
                fd = mul(un, -0.5 * RHO * ln.Cd * ln.d * unn * lt)
                Fl = add(Fl, mul(fd, sig * w))
        grav = [0.0, 0.0, -(f.m + 0.5 * mline) * G]
        F = add(add(add(Lf, Df), add(Tf, Fl)), grav)
        if self.a_rider:
            F = add(F, mul(self.a_rider(s.t), -meff))
        return F, meff, dict(T=T, V=V, va=va, W=W, q=q, side=side, L0=L0, eL=eL, vh=vh, d=d, Fl=Fl, D=q * f.S * f.CD(CL, self.brake))

    def step(self, s, dt, cmd):
        """cmd: dict with CL, mu, ldot (reel speed command, + = pay out)"""
        # actuators
        if 'CL' in cmd:
            s.CL += clamp(cmd['CL'] - s.CL, -self.CL_rate * dt, self.CL_rate * dt)
            s.CL = clamp(s.CL, self.f.CLmin, self.f.CLmax)
        if 'mu' in cmd:
            mu_c = clamp(cmd['mu'], -self.mu_max, self.mu_max)
            s.mu += clamp(mu_c - s.mu, -self.bank_rate * dt, self.bank_rate * dt)
        if 'ldot' in cmd:
            lc = clamp(cmd['ldot'], -self.reel_vmax, self.reel_vmax)
            s.ldot += clamp(lc - s.ldot, -self.reel_acc * dt, self.reel_acc * dt)
        F, meff, info = self.forces(s)
        a = mul(F, 1.0 / meff)
        s.v = add(s.v, mul(a, dt))
        s.p = add(s.p, mul(s.v, dt))
        s.l = max(0.2, s.l + s.ldot * dt)
        s.t += dt
        return info


# ---------- guidance helpers ----------
def sph(p, axis=(1.0, 0.0, 0.0)):
    """elevation (above horizontal) and azimuth (from downwind +x, positive towards +y) of the flyer"""
    d = norm(p)
    el = math.asin(clamp(p[2] / d, -1, 1))
    az = math.atan2(p[1], p[0])
    return el, az


def dir_from(el, az):
    return [math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)]


def wrap(a):
    while a > math.pi:
        a -= 2 * math.pi
    while a < -math.pi:
        a += 2 * math.pi
    return a


class LoopGuidance:
    """Follow a circle of angular radius rho around the direction c (elevation elc, azimuth 0) on the
    tether sphere (vector-field guidance), by banking. Optionally figure-8 = two tangent circles
    alternately (switch at the crossing point)."""

    def __init__(self, elc, rho, K=2.0, kr=3.0, ccw=True, eight=False):
        self.c = dir_from(elc, 0.0)
        self.rho = rho
        self.K, self.kr = K, kr
        self.ccw = ccw
        self.eight = eight
        self.elc = elc
        self.lobe = 1
        self.prev_side = None

    def center(self):
        if not self.eight:
            return self.c
        return dir_from(self.elc, self.lobe * self.rho)

    def bank(self, s, info):
        er = unit(s.p)
        if self.eight:
            side = 1 if s.p[1] > 0 else -1
            if self.prev_side is not None and side != self.prev_side:
                self.lobe = side
            self.prev_side = side
        c = self.center()
        # tangent-plane geometry at the flyer
        to_c = sub(c, mul(er, dot(c, er)))
        ang = math.acos(clamp(dot(c, er), -1, 1))       # angular distance from centre
        inward = unit(to_c)
        ccw = self.ccw if not self.eight else (self.lobe > 0)
        tang = cross(er, inward) if ccw else cross(inward, er)
        err = ang - self.rho
        des = unit(add(tang, mul(inward, clamp(self.kr * err, -2.0, 2.0))))
        # current velocity direction in the tangent plane (ground-frame velocity relative to the exit)
        vt = sub(s.v, mul(er, dot(s.v, er)))
        if norm(vt) < 1e-3:
            return 0.0
        vt = unit(vt)
        e = math.atan2(dot(cross(vt, des), er), dot(vt, des))  # + = desired is CCW about er
        # which way does +mu turn? lateral lift direction 'side' projected on (er x vt)
        sgn = 1.0 if dot(info['side'], cross(er, vt)) > 0 else -1.0
        return sgn * self.K * e
