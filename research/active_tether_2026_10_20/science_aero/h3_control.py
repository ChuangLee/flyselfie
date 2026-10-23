"""H3 - 'fly it like a kite': pay out when lift is surplus, reel in when it drops.

Part A - reduced-order in-plane model (2D, flyer behind the exit, wings level):
  states  x = [eps, eps_dot, l],  inputs u = [l_dot (reel, + = pay out), CL]
  m_eff (l eps_dd + 2 l_dot eps_d) = F . e_eps           (tangential)
  T = F . e_r + m_eff l eps_d^2   (l_dd neglected)      (radial -> tension)
  F = lift + drag + gravity + line drag (moment-consistent, cross-flow) + line weight/2
Linearised numerically about the static equilibrium of h1 (fixed CL); eigenvalues give the
in-plane 'tether pendulum' mode; dT/d(l_dot) and dT/dVa give the reel->tension and gust->tension gains.
Part B - time domain (sim3d, 3D point mass, planar azimuth hold): Dryden longitudinal turbulence
(MIL-F-8785C low-altitude form) + rider speed oscillation from carving + exit heave, with
 (0) locked reel, (1) tension-tracking reel (PI on tension, slow line-length return) with a first-order
 reel-loop lag tau and the shared actuator limits (|a| <= 20 m/s^2, |v| <= 8 m/s),
 (2) + elevation-rate damping through CL ('pitch' loop, servo-rate limited).
Metrics: tension p95/max and std, elevation std, line excursion, reel speed/accel/power peaks.
"""
import math
import random
from multiprocessing import Pool
from common import G, RHO, G130, K120, LINE_COND, save
from sim3d import Sim, State, dir_from, mul, sph, clamp, norm
from h1_equilibrium import solve_eps


def planar_forces(fl, line, Va, eps, epsd, l, ldot, CL, brake=0.0):
    er = (math.cos(eps), math.sin(eps))
    ee = (-math.sin(eps), math.cos(eps))
    v = (ldot * er[0] + l * epsd * ee[0], ldot * er[1] + l * epsd * ee[1])
    va = (v[0] - Va, v[1])
    V = math.hypot(*va)
    vh = (va[0] / V, va[1] / V)
    lift_dir = (vh[1], -vh[0])
    if lift_dir[1] < 0:
        lift_dir = (-lift_dir[0], -lift_dir[1])
    q = 0.5 * RHO * V * V
    F = [q * fl.S * CL * lift_dir[0] - q * fl.S * fl.CD(CL, brake) * vh[0],
         q * fl.S * CL * lift_dir[1] - q * fl.S * fl.CD(CL, brake) * vh[1]]
    # line drag (normal), moment consistent
    nodes = [(0.1127016653792583, 0.2777777777777778), (0.5, 0.4444444444444444), (0.8872983346207417, 0.2777777777777778)]
    for sig, w in nodes:
        u = (sig * v[0] - Va, sig * v[1])
        un_s = u[0] * ee[0] + u[1] * ee[1]
        f = -0.5 * RHO * line.Cd * line.d * abs(un_s) * un_s * l
        F[0] += f * ee[0] * sig * w
        F[1] += f * ee[1] * sig * w
    mline = line.mu * l
    F[1] -= (fl.m + 0.5 * mline) * G
    meff = fl.m + mline / 3
    Ft = F[0] * ee[0] + F[1] * ee[1]
    Fr = F[0] * er[0] + F[1] * er[1]
    epsdd = (Ft - meff * 2 * ldot * epsd) / (meff * l)
    T = Fr + meff * l * epsd ** 2
    return epsdd, T


def linearise(fl, line, Va, l, CL, brake=0.0):
    global planar_forces
    _pf = planar_forces
    planar_forces = lambda *a: _pf(*a, brake=brake)
    try:
        return _linearise(fl, line, Va, l, CL, brake)
    finally:
        planar_forces = _pf


def _linearise(fl, line, Va, l, CL, brake):
    e0 = solve_eps(fl, line, l, Va, CL, brake)
    if e0 is None:
        return None
    h = 1e-6
    f0, T0 = planar_forces(fl, line, Va, e0, 0, l, 0, CL)
    a_e = (planar_forces(fl, line, Va, e0 + h, 0, l, 0, CL)[0] - planar_forces(fl, line, Va, e0 - h, 0, l, 0, CL)[0]) / (2 * h)
    a_w = (planar_forces(fl, line, Va, e0, h, l, 0, CL)[0] - planar_forces(fl, line, Va, e0, -h, l, 0, CL)[0]) / (2 * h)
    b_r = (planar_forces(fl, line, Va, e0, 0, l, h, CL)[0] - planar_forces(fl, line, Va, e0, 0, l, -h, CL)[0]) / (2 * h)
    b_cl = (planar_forces(fl, line, Va, e0, 0, l, 0, CL + h)[0] - planar_forces(fl, line, Va, e0, 0, l, 0, CL - h)[0]) / (2 * h)
    dT_dr = (planar_forces(fl, line, Va, e0, 0, l, h, CL)[1] - planar_forces(fl, line, Va, e0, 0, l, -h, CL)[1]) / (2 * h)
    dT_dVa = (planar_forces(fl, line, Va + h, e0, 0, l, 0, CL)[1] - planar_forces(fl, line, Va - h, e0, 0, l, 0, CL)[1]) / (2 * h)
    dT_dCL = (planar_forces(fl, line, Va, e0, 0, l, 0, CL + h)[1] - planar_forces(fl, line, Va, e0, 0, l, 0, CL - h)[1]) / (2 * h)
    # 2x2 system [eps, eps_dot]: char. eq s^2 - a_w s - a_e = 0
    disc = a_w * a_w + 4 * a_e
    if disc < 0:
        wn = math.sqrt(-a_e)
        zeta = -a_w / (2 * wn)
    else:
        r1 = (a_w + math.sqrt(disc)) / 2
        r2 = (a_w - math.sqrt(disc)) / 2
        wn = math.sqrt(abs(r1 * r2))
        zeta = -(r1 + r2) / (2 * wn) if wn > 0 else None
    return dict(Va=Va, l=l, CL=CL, brake=round(brake, 3), eps0_deg=round(math.degrees(e0), 1), T0=round(T0, 2),
                fn_Hz=round(wn / (2 * math.pi), 3), period_s=round(2 * math.pi / wn, 2), zeta=round(zeta, 3),
                dT_dReelOut=round(dT_dr, 3), dT_dVa=round(dT_dVa, 3), dT_dCL=round(dT_dCL, 2),
                dEpsdd_dCL=round(b_cl, 3), dEpsdd_dReel=round(b_r, 3),
                twoT_over_Va=round(2 * T0 / Va, 3))


# ---------------- Part B ----------------
def dryden_series(T, dt, V, sigma, L, seed):
    rnd = random.Random(seed)
    tau = L / V
    a = math.exp(-dt / tau)
    bscale = sigma * math.sqrt(1 - a * a)
    x, out = 0.0, []
    for _ in range(int(T / dt) + 2):
        x = a * x + bscale * rnd.gauss(0, 1)
        out.append(x)
    return out


def tb_case(args):
    fl_name, Va, l, mode, tau, seed, Tsim = args
    fl = {'G130': G130, 'K120': K120}[fl_name]
    dt = 2e-3
    # turbulence: MIL-F-8785C low altitude, W20 = 6 m/s (ASSUMED moderate day), h = 5 m (16 ft)
    hft = 16.0
    sig_w = 0.1 * 6.0
    sig_u = sig_w / (0.177 + 0.000823 * hft) ** 0.4
    Lu = hft / (0.177 + 0.000823 * hft) ** 1.2 * 0.3048
    gust = dryden_series(Tsim, dt, max(Va, 5.0), sig_u, Lu, seed)
    # rider: speed oscillation 0.8 m/s at 0.69 Hz (two turns per 2.9 s carving cycle) + exit heave 3 cm at 2 Hz
    fs, As = 2 / 2.9, 0.8
    fh, Ah = 2.0, 0.03
    def rider_dv(t): return As * math.sin(2 * math.pi * fs * t)
    def rider_acc(t):
        return [As * 2 * math.pi * fs * math.cos(2 * math.pi * fs * t), 0.0,
                -Ah * (2 * math.pi * fh) ** 2 * math.sin(2 * math.pi * fh * t)]
    def gfun(t, p):
        k = min(len(gust) - 1, int(t / dt))
        return [gust[k] + rider_dv(t), 0.0, 0.0]
    sim = Sim(fl, LINE_COND, Wa=(Va, 0, 0), a_rider=rider_acc, gust=gfun)
    CL0 = min(fl.CL_LDmax, 0.9 * fl.CLmax)
    e0 = solve_eps(fl, LINE_COND, l, Va, CL0)
    dTdCL = max(0.5, linearise(fl, LINE_COND, Va, l, CL0)['dT_dCL'])
    s = State(mul(dir_from(e0, 0), l * 1.0005), [0, 0, 0], l, CL=CL0)
    # settle 5 s without disturbances to find the reference tension
    Tref = None
    Ts, els, ls, vrs, ars, Ps = [], [], [], [], [], []
    filt = 0.0
    integ = 0.0
    prev_ld = 0.0
    tension_filt = None
    for i in range(int(Tsim / dt)):
        t = s.t
        info = sim.forces(s)[2]
        T = info['T']
        tension_filt = T if tension_filt is None else tension_filt + (T - tension_filt) * min(1.0, dt / 0.01)  # 10 ms sensor
        el, az = sph(s.p)
        mu = clamp(-2.0 * az - 0.5 * (s.v[1] / max(1.0, norm(s.p))), -0.5, 0.5)
        cmd = dict(mu=mu, CL=CL0)
        if t < 5.0:
            cmd['ldot'] = 0.0
            if t > 4.0:
                Tref = T if Tref is None else Tref + (T - Tref) * dt / 0.5
        else:
            if mode == 3:
                # fast loop on CL (servo-rate limited): T error -> CL; reel only returns line length slowly
                eT = tension_filt - Tref
                integ += eT * dt
                cmd['CL'] = clamp(CL0 - (1.0 * eT + 0.5 * integ) / dTdCL, fl.CLmin, fl.CLmax)
                vt = (s.v[2] * math.cos(el) - (s.v[0] * math.cos(az) + s.v[1] * math.sin(az)) * math.sin(el)) / s.l
                cmd['CL'] = clamp(cmd['CL'] - 0.6 * vt * s.l / max(info['V'], 3.0), fl.CLmin, fl.CLmax)
                cmd['ldot'] = clamp(-0.3 * (s.l - l), -1.0, 1.0)
            elif mode >= 1:
                eT = tension_filt - Tref
                integ += eT * dt
                kp = 0.6 / max(Tref, 0.3) * 4.0   # pay out ~2.4 m/s per 100 % tension error
                ld_cmd = kp * eT + 0.3 * kp * integ - 0.15 * (s.l - l)
                filt += (ld_cmd - filt) * min(1.0, dt / tau)
                cmd['ldot'] = filt
            else:
                cmd['ldot'] = 0.0
            if mode == 2:
                # elevation-rate damping by CL: eps rising fast -> less CL
                vt = (s.v[2] * math.cos(el) - (s.v[0] * math.cos(az) + s.v[1] * math.sin(az)) * math.sin(el)) / s.l
                cmd['CL'] = clamp(CL0 - 0.6 * vt * s.l / max(info['V'], 3.0), fl.CLmin, fl.CLmax)
        info = sim.step(s, dt, cmd)
        if t >= 5.0:
            Ts.append(info['T']); els.append(math.degrees(el)); ls.append(s.l); vrs.append(s.ldot)
            ars.append((s.ldot - prev_ld) / dt); Ps.append(info['T'] * s.ldot)
        prev_ld = s.ldot
        if s.p[2] < -sim.z_exit + 0.3:
            return dict(flyer=fl_name, Va=Va, l=l, mode=mode, tau=tau, seed=seed, ok=False, tCrash=round(t, 1))
    def stats(a):
        a2 = sorted(a)
        m = sum(a) / len(a)
        sd = math.sqrt(sum((x - m) ** 2 for x in a) / len(a))
        return m, sd, a2[int(0.95 * len(a2))], a2[-1], a2[0]
    Tm, Tsd, Tp95, Tmax, Tmin = stats(Ts)
    em, esd, _, emax, emin = stats(els)
    return dict(flyer=fl_name, Va=Va, l=l, mode=mode, tau=tau, seed=seed, ok=True, sigma_u=round(sig_u, 2), Lu_m=round(Lu, 1),
                Tref=round(Tref, 2), Tmean=round(Tm, 2), Tsd=round(Tsd, 2), Tp95=round(Tp95, 2), Tmax=round(Tmax, 2),
                Tmin=round(Tmin, 2), TmaxOverRef=round(Tmax / Tref, 2), eps_mean=round(em, 1), eps_sd=round(esd, 1),
                eps_min=round(emin, 1), eps_max=round(emax, 1), lineExcursion=round(max(ls) - min(ls), 2),
                reelVmax=round(max(abs(x) for x in vrs), 2), reelAccP99=round(sorted(abs(x) for x in ars)[int(0.99 * len(ars))], 1),
                reelPowerMaxIn_W=round(max(0.0, -min(Ps)), 2), reelPowerMeanAbs_W=round(sum(abs(x) for x in Ps) / len(Ps), 2))


def main():
    lin = []
    for fl in (G130, K120):
        CL = min(fl.CL_LDmax, 0.9 * fl.CLmax)
        for Va in (6, 8, 12, 16, 20):
            for l in (5, 10, 20, 30):
                r = linearise(fl, LINE_COND, Va, l, CL)
                if r:
                    r['flyer'] = fl.name
                    lin.append(r)
    # elevation lowered by airbrake (camera-friendly eps): does the reel regain tension authority?
    for Va in (8, 12, 16):
        for l in (10, 20):
            for eps_t in (30, 45, 60):
                CL = min(G130.CL_LDmax, 0.9 * G130.CLmax)
                lo, hi = 0.0, 3.0
                for _ in range(50):
                    mid = 0.5 * (lo + hi)
                    e = solve_eps(G130, LINE_COND, l, Va, CL, mid)
                    if e is not None and math.degrees(e) > eps_t:
                        lo = mid
                    else:
                        hi = mid
                r = linearise(G130, LINE_COND, Va, l, CL, lo)
                if r:
                    r['flyer'] = 'G130'
                    r['eps_target'] = eps_t
                    lin.append(r)
    jobs = []
    for fl in ('G130',):
        for Va in (8.0, 12.0, 16.0):
            for l in (10.0, 20.0):
                jobs.append((fl, Va, l, 0, 0.05, 1, 40.0))
                for tau in (0.02, 0.05, 0.1, 0.2, 0.5):
                    jobs.append((fl, Va, l, 1, tau, 1, 40.0))
                jobs.append((fl, Va, l, 2, 0.05, 1, 40.0))
                jobs.append((fl, Va, l, 3, 0.05, 1, 40.0))
    with Pool(4) as pool:
        tb = pool.map(tb_case, jobs)
    save('h3_results.json', dict(model=__doc__, linear=lin, timeDomain=tb))
    return lin, tb


if __name__ == '__main__':
    lin, tb = main()
    for r in lin:
        print(r)
    for r in tb:
        print(r)
