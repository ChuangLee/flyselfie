"""H6 - crosswind loops / figure-8 keep the flyer up with ZERO reel energy down to an apparent wind X.

Method: sim3d point-mass flyer on a fixed-length line (reel locked), uniform apparent wind W along +x,
vector-field guidance on the tether sphere (circles or a figure-8 made of two tangent circles), CL held
at a high-lift trim, airspeed governor (CL reduction + spoiler dCD <= 0.4) above V_lim so the
crosswind speed does not explode (Loyd: v_crosswind ~ W (L/D) cos(eps)). 60 s per case; "sustained" =
no snow contact (z > -z_exit + 0.3 m) and the last 40 s keep a mean height. Ground-frame KE uses the
rider velocity (-v_s along x) for a riding case and v_s = 0 for a stop.
Physics bound at W = 0 (stop in calm): no energy source exists - a stopped rider has no wake, and
dynamic soaring needs a wind *gradient* (Sachs 2005: >= ~8.6 m/s over the albatross flight band), so
X > 0 by first principles; the simulation finds its value.
"""
import math
import sys
from multiprocessing import Pool
from common import G130, K120, LINE_COND, ke_speed_cap, save
from sim3d import Sim, State, LoopGuidance, dir_from, mul, sph, norm, add, clamp


def run_loop(args):
    fl_name, W, l, elc, rho, CLn, eight, Vlim, vs, T = args
    fl = {'G130': G130, 'K120': K120}[fl_name]
    sim = Sim(fl, LINE_COND, Wa=(W, 0, 0))
    g = LoopGuidance(math.radians(elc), math.radians(rho), K=2.0, eight=eight)
    p = mul(dir_from(math.radians(elc + rho), 0), l)
    V0 = max(fl.vmin() * 1.4, min(Vlim, W * 4))
    s = State(p, [0, V0, 0], l, CL=CLn)
    dt = 2e-3
    zs, Ts, Vs, KEs, LOS = [], [], [], [], []
    crashed = False
    twist = 0.0
    prev_az = None
    n = int(T / dt)
    for i in range(n):
        info = sim.forces(s)[2]
        mu = g.bank(s, info)
        V = info['V']
        over = max(0.0, V - Vlim)
        CL = CLn * clamp(1 - 0.15 * over, 0.25, 1.0)
        sim.brake = clamp(0.08 * over, 0.0, 0.4)
        info = sim.step(s, dt, dict(CL=CL, mu=mu, ldot=0.0))
        if s.p[2] < -sim.z_exit + 0.3:
            crashed = True
            break
        if s.t > 20:
            vg = add(s.v, [-vs, 0.0, 0.0])
            zs.append(s.p[2]); Ts.append(info['T']); Vs.append(info['V'])
            KEs.append(0.5 * fl.m * (vg[0] ** 2 + vg[1] ** 2 + vg[2] ** 2))
            # line-of-sight rate of the rider as seen from the flyer (orbiting viewpoint), deg/s
            d = norm(s.p)
            vt = s.v[:]
            vr = (vt[0] * s.p[0] + vt[1] * s.p[1] + vt[2] * s.p[2]) / d
            vtan = math.sqrt(max(0.0, sum(x * x for x in vt) - vr * vr))
            LOS.append(math.degrees(vtan / d))
        el, az = sph(s.p)
        if prev_az is not None:
            pass
        prev_az = az
    res = dict(flyer=fl_name, W=W, l=l, elc=elc, rho=rho, CL=CLn, eight=eight, Vlim=Vlim, vs=vs)
    if crashed:
        res.update(ok=False, tCrash=round(s.t, 1))
        return res
    zs.sort(); Ts_s = sorted(Ts); LOS.sort()
    res.update(ok=True, zMin=round(zs[0] + sim.z_exit, 2), zMean=round(sum(zs) / len(zs) + sim.z_exit, 2),
               Tmean=round(sum(Ts) / len(Ts), 2), Tp95=round(Ts_s[int(0.95 * len(Ts_s))], 2),
               Vmean=round(sum(Vs) / len(Vs), 2), Vmax=round(max(Vs), 2), KEmax=round(max(KEs), 1),
               KEcap=14.9, losP50=round(LOS[len(LOS) // 2], 1), losP90=round(LOS[int(0.9 * len(LOS))], 1))
    return res


def main():
    jobs = []
    for fl, CLn in (('G130', 1.0), ('K120', 0.9)):
        for l in (10, 20):
            for W in (0.0, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 6.0):
                for elc, rho in ((35, 20), (50, 25)):
                    for eight in (False, True):
                        jobs.append((fl, W, l, elc, rho, CLn, eight, 9.0, 0.0, 60.0))
    # riding cases for ground-frame KE: rider 12 m/s, tailwind 9-10 -> Va 2-3 m/s
    for fl, CLn in (('G130', 1.0), ('K120', 0.9)):
        for W, vs in ((2.5, 12.0), (3.0, 12.0), (3.0, 13.2), (2.5, 8.0)):
            for Vlim in (7.0, 9.0):
                jobs.append((fl, W, 15, 50, 25, CLn, True, Vlim, vs, 60.0))
    with Pool(4) as pool:
        res = pool.map(run_loop, jobs)
    # X per flyer/line: smallest W with at least one sustained pattern (and all larger W sustained)
    X = {}
    for fl in ('G130', 'K120'):
        for l in (10, 20):
            for eight in (False, True):
                ws = sorted({r['W'] for r in res if r['flyer'] == fl and r['l'] == l and r['vs'] == 0})
                ok = {w: any(r['ok'] for r in res if r['flyer'] == fl and r['l'] == l and r['W'] == w and r['eight'] == eight and r['vs'] == 0) for w in ws}
                xmin = None
                for w in reversed(ws):
                    if ok[w]:
                        xmin = w
                    else:
                        break
                X[f'{fl}_l{l}_{"eight" if eight else "circle"}'] = xmin
    save('h6_results.json', dict(model=__doc__, X_ms=X, runs=res))
    return X, res


if __name__ == '__main__':
    X, res = main()
    print(X)
    for r in res:
        print(r)
