"""Launch from the back, the hockey-stop transient, and docking.

A. Launch envelope (closed form): release needs Va >= 1.15 vmin (+ climb to a usable elevation needs
   the h1 elevation at that Va). Rider-speed threshold in calm / head / tail wind.
B. Launch sim (sim3d): flyer released 0.4 m behind/0.3 m above the exit on a 0.8 m line, CL high,
   reel pays out under tension control (T_ref 0.5-1 N) to 12 m. Metrics: time to 3 m and 6 m above
   the snow, minimum flyer-helmet distance, minimum height above snow.
C. Hockey stop: rider 12 -> 0 m/s in 2.0 s (6 m/s^2, ASSUMED from the shared skier stop), calm air.
   Strategies: (a) do nothing, (b) spoiler/deep-stall dCD 0.8 at stop onset + slack take-up reel,
   (c) immediate fast reel-in 6 m/s. Metrics: min flyer-helmet distance, overfly distance ahead of
   the rider, KE (ground frame) peak, landing point.
D. Dock: line spring snap when the reel stops the flyer against a rigid dock vs a compliant dock
   stroke; relative KE at closing speed.
"""
import math
from multiprocessing import Pool
from common import G, RHO, G130, K120, LINE_COND, save, ke_speed_cap
from sim3d import Sim, State, dir_from, mul, sph, clamp, norm, sub
from h1_equilibrium import best, solve_eps

HELMET = [-0.25, 0.0, 0.25]   # helmet centre relative to the pack-top exit; rider faces -x in the sim frame


def launch_case(args):
    fl_name, Va, Tref, Wt = args
    fl = {'G130': G130, 'K120': K120}[fl_name]
    sim = Sim(fl, LINE_COND, Wa=(Va, 0, 0))
    p = [0.4, 0.0, 0.3]
    l0 = norm(p) + 0.01
    s = State(p, [0.0, 0.0, 0.0], l0, CL=0.5)
    dt = 1e-3
    t3 = t6 = None
    dmin = 9.0
    zmin = 9.0
    Tmax = 0.0
    lmax = 12.0
    ok = True
    for i in range(int(15 / dt)):
        info = sim.forces(s)[2]
        el, az = sph(s.p)
        mu = clamp(-2.0 * az, -0.5, 0.5)
        # pay out when tension above Tref (tension control), stop at lmax
        ld = clamp(2.5 * (info['T'] - Tref), 0.0, 5.0) if s.l < lmax else 0.0   # pay out only
        # release CL scheduled so that lift <= ~3 m g at this airspeed (avoid the overfly/loop at high Va)
        q = 0.5 * RHO * max(info['V'], 1.0) ** 2
        CLsched = clamp(3.0 * fl.m * G / (q * fl.S), 0.3, 0.9 * fl.CLmax)
        CL = CLsched if s.p[2] < 3.0 else min(min(fl.CL_LDmax, 0.9 * fl.CLmax), max(CLsched, 0.3))
        info = sim.step(s, dt, dict(CL=CL, mu=mu, ldot=ld))
        Tmax = max(Tmax, info['T'])
        dmin = min(dmin, norm(sub(s.p, HELMET)))
        zabs = s.p[2] + sim.z_exit
        zmin = min(zmin, zabs)
        if t3 is None and zabs >= 3.0:
            t3 = s.t
        if t6 is None and zabs >= 6.0:
            t6 = s.t
        if zabs < 0.3:
            ok = False
            break
    el, az = sph(s.p)
    return dict(flyer=fl_name, Va=Va, Tref=Tref, ok=ok, t_to_3m=None if t3 is None else round(t3, 2),
                t_to_6m=None if t6 is None else round(t6, 2), minHelmetDist=round(dmin, 2),
                minHeightAboveSnow=round(zmin, 2), Tmax=round(Tmax, 2), lineOut=round(s.l, 1),
                eps_end=round(math.degrees(el), 1))


def stop_case(args):
    fl_name, l0, strategy, vs0, decel = args
    fl = {'G130': G130, 'K120': K120}[fl_name]
    tstop = vs0 / decel
    def vs(t): return max(0.0, vs0 - decel * t)
    def a_r(t): return [decel if t < tstop else 0.0, 0.0, 0.0]
    def gust(t, p): return [vs(t) - vs0, 0.0, 0.0]
    sim = Sim(fl, LINE_COND, Wa=(vs0, 0, 0), a_rider=a_r, gust=gust)
    CL = min(fl.CL_LDmax, 0.9 * fl.CLmax)
    e0 = solve_eps(fl, LINE_COND, l0, vs0, CL)
    s = State(mul(dir_from(e0, 0), l0 * 1.0003), [0, 0, 0], l0, CL=CL)
    # rider-frame starts at t=0 with stop onset
    dt = 1e-3
    dmin, ahead, KEmax = 9.0, -99.0, 0.0
    land = None
    for i in range(int(12 / dt)):
        t = s.t
        info = sim.forces(s)[2]
        el, az = sph(s.p)
        mu = clamp(-2.0 * az, -0.5, 0.5)
        cmd = dict(mu=mu, CL=CL)
        if strategy == 'none':
            cmd['ldot'] = 0.0
        elif strategy == 'brake':
            sim.brake = 0.8 if t > 0.2 else 0.0          # 0.2 s detection latency (IMU decel)
            cmd['CL'] = 0.3 if t > 0.2 else CL
            # take up slack only (no pulling): reel in while tension < 0.3 N
            cmd['ldot'] = clamp(4.0 * (info['T'] - 0.3), -6.0, 0.0) if t > 0.2 else 0.0
        elif strategy == 'reelin':
            cmd['ldot'] = -6.0 if t > 0.2 else 0.0
        elif strategy == 'payout_loiter':
            # let it go: pay out freely so the line never yanks, brake moderately
            sim.brake = 0.3 if t > 0.2 else 0.0
            cmd['ldot'] = clamp(4.0 * (info['T'] - 0.3), 0.0, 8.0) if t > 0.2 else 0.0
        info = sim.step(s, dt, cmd)
        d = norm(sub(s.p, HELMET))
        if s.p[2] + sim.z_exit > 0.05:
            dmin = min(dmin, d)
        ahead = max(ahead, -s.p[0])            # how far in front of the rider (rider faces -x)
        vg = [s.v[0] - vs(s.t), s.v[1], s.v[2]]
        KEmax = max(KEmax, 0.5 * fl.m * (vg[0] ** 2 + vg[1] ** 2 + vg[2] ** 2))
        if s.p[2] < -sim.z_exit + 0.05:
            land = [round(s.p[0], 1), round(s.p[1], 1)]
            break
    return dict(flyer=fl_name, l0=l0, strategy=strategy, eps0=round(math.degrees(e0), 1), minHelmetDist=round(dmin, 2),
                maxAheadOfRider=round(ahead, 1), KEmaxGround=round(KEmax, 1), landedAt_xy=land, tEnd=round(s.t, 1),
                lineEnd=round(s.l, 1))


def main():
    out = {}
    env = []
    for fl in (G130, K120):
        Vrel = 1.15 * fl.vmin()
        for W in (-3, 0, 3, 4.5, 6):   # + = tailwind
            env.append(dict(flyer=fl.name, tailwind=W, releaseVa=round(Vrel, 2), riderSpeedNeeded=round(Vrel + W, 2)))
        for Va in (3, 4, 5, 6, 8):
            CL, e = best(fl, LINE_COND, 3.0, Va, objective='eps')
            env.append(dict(flyer=fl.name, Va=Va, eps_on_3m_line=None if e is None else round(math.degrees(e), 1)))
    out['launchEnvelope'] = env
    jobs = [(f, Va, T, 0) for f in ('G130', 'K120') for Va in (4.0, 5.0, 6.0, 8.0, 12.0) for T in (0.5, 1.0)]
    sj = [(f, l, st, 12.0, 6.0) for f in ('G130', 'K120') for l in (10.0, 20.0) for st in ('none', 'brake', 'reelin', 'payout_loiter')]
    with Pool(4) as pool:
        out['launchSim'] = pool.map(launch_case, jobs)
        out['stopSim'] = pool.map(stop_case, sj)
    # docking snap: flyer arriving at closing speed v against the line spring of a short (0.5 m) line
    dock = []
    for fl in (G130, K120):
        for v in (1.0, 2.0, 3.0):
            k = LINE_COND.EA / 0.5
            Tpeak_rigid = v * math.sqrt(k * fl.m)
            E = 0.5 * fl.m * v * v
            dock.append(dict(flyer=fl.name, closing=v, relKE_J=round(E, 3), Tpeak_rigidStop_N=round(Tpeak_rigid, 1),
                             strokeFor5N_mm=round(E / 5.0 * 1000, 1), strokeFor10N_mm=round(E / 10.0 * 1000, 1)))
    out['dockSnap'] = dock
    # line snap-back energy if the line parts under load
    out['lineElasticEnergy'] = [dict(T=T, l=l, E_J=round(T * T * l / (2 * LINE_COND.EA), 3)) for T in (5, 20, 40) for l in (10, 30)]
    save('launch_dock_results.json', dict(model=__doc__, **out))
    return out


if __name__ == '__main__':
    o = main()
    for k, v in o.items():
        print(k)
        for r in v:
            print(' ', r)
