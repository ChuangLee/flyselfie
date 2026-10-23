"""H2 - can active reel-in keep the flyer up when the apparent wind is too low (stop, tailwind, slow rider)?

Strategies tested in calm (W = 0, the worst case of a stop; also = a tailwind equal to rider speed):
  S1 straight reel-in    : the flyer is towed straight towards the exit at airspeed V_req.
                           line used = V_req * t  (closed form).
  S2 tethered spiral     : flyer circles round the rider on a cone (elevation eps0) while the reel takes
                           line in at a constant v_r; energy input T v_r. Simulated (sim3d) for v_r sweep.
  S3 pumping cycle       : the AWE pumping cycle run 'backwards': reel IN at high CL (high tension), pay
                           OUT at low CL under a small tension; net work (T_hi - T_lo) dl per cycle.
                           Simulated (sim3d).
  S4 free circling glide : line slack (light pay-out tension), glider circles on its own energy:
                           time aloft = (h - h_min) / sink; closed form + sim check.
  S5 dock & relaunch     : reel in, dock on the pack, relaunch when moving (energy closed form).
Battery basis (components.js): 150 Wh/kg pack, x0.75 cold, 15 % reserve; motor+gear+driver efficiency
0.5 (ASSUMED for a 1-10 W micro winch).
"""
import math
from multiprocessing import Pool
from common import G, RHO, G130, K120, LINE_COND, save, WH_PER_KG, COLD, RESERVE
from sim3d import Sim, State, LoopGuidance, dir_from, mul, norm, clamp

ETA = 0.5
USABLE = COLD * (1 - RESERVE)


def sink_rate(fl, CL, bank_deg=0.0, rho=RHO):
    n = 1 / math.cos(math.radians(bank_deg))
    V = math.sqrt(2 * fl.m * G * n / (rho * fl.S * CL))
    return V * fl.CD(CL) / CL * 1.0, V


def spiral_case(args):
    """S2: circle round the rider on a cone (elevation eps0) with a tension-held reel (T_set)."""
    fl_name, l0, eps0, Tset, CLref, Vref, T = args
    fl = {'G130': G130, 'K120': K120}[fl_name]
    sim = Sim(fl, LINE_COND, Wa=(0.0, 0.0, 0.0))
    g = LoopGuidance(math.radians(90), math.radians(90 - eps0), K=2.0, kr=2.0)
    s = State(mul(dir_from(math.radians(eps0), 0.0), l0), [0.0, Vref, 0.0], l0, CL=CLref)
    dt = 2e-3
    z0 = s.p[2]
    E = 0.0
    crashed = False
    for i in range(int(T / dt)):
        info = sim.forces(s)[2]
        mu = g.bank(s, info)
        CL = clamp(CLref + 0.2 * (info['V'] - Vref), 0.2, fl.CLmax)
        ld = clamp(-2.0 * (Tset - info['T']), -3.0, 3.0) if s.l > 3 else max(0.0, -2.0 * (Tset - info['T']))
        info = sim.step(s, dt, dict(CL=CL, mu=mu, ldot=ld))
        if s.ldot < 0:
            E += info['T'] * (-s.ldot) * dt / ETA
        if s.p[2] < -sim.z_exit + 0.3:
            crashed = True
            break
    return dict(strategy='S2_spiral', flyer=fl_name, l0=l0, eps0=eps0, Tset=Tset, ok=not crashed, t=round(s.t, 1),
                dz=round(s.p[2] - z0, 2), lineUsed=round(l0 - s.l, 2), E_batt_J=round(E, 1))


def yoyo_case(args):
    """S3: 'yo-yo' winch-climb inbound + glide outbound (line paid out at ~0.2 N), net line ~0 per cycle.
    Guidance: course angle on the horizontal plane; glider lift reference (free mode)."""
    fl_name, lmin, lmax, vin, CLin, CLout, T, h0, Ttow = args
    fl = {'G130': G130, 'K120': K120}[fl_name]
    sim = Sim(fl, LINE_COND, Wa=(0.0, 0.0, 0.0), reel_vmax=12.0)
    sim.lift_mode = 'free'
    x0 = math.sqrt(max(1.0, lmax ** 2 - h0 ** 2))
    Vg = fl.v_at(CLout)
    s = State([x0 * 0.9, 0.0, h0], [Vg, 0.0, 0.0], lmax, CL=CLout)
    dt = 2e-3
    phase = 'out'
    E = 0.0
    zs = []
    turn_dir = 1.0
    heading_ref = 0.0
    cycles = 0
    crashed = False
    lmin_seen, lmax_seen = 1e9, 0.0
    for i in range(int(T / dt)):
        info = sim.forces(s)[2]
        p = s.p
        vrad = (s.v[0] * p[0] + s.v[1] * p[1] + s.v[2] * p[2]) / max(norm(p), 1e-6)
        rad = math.atan2(p[1], p[0])            # bearing of the flyer from the rider
        crs = math.atan2(s.v[1], s.v[0])
        Vh = math.hypot(s.v[0], s.v[1])
        if phase == 'out':
            des = rad
            CL = CLout
            ld = clamp(vrad + 4.0 * (info['T'] - 0.15), 0.0, 12.0)
            if s.l >= lmax:
                phase = 'turn_in'
                heading_ref = rad + math.pi
        elif phase == 'turn_in':
            des = heading_ref
            CL = CLout
            ld = clamp(vrad + 4.0 * (info['T'] - 0.15), -2.0, 12.0)
            if abs(wrap(crs - heading_ref)) < math.radians(20):
                phase = 'in'
        elif phase == 'in':
            des = rad + math.pi
            CL = CLin
            ld = clamp(-3.0 * (Ttow - info['T']), -vin, 2.0)   # tension-controlled tow (winch launch style)
            el = math.asin(clamp(p[2] / norm(p), -1, 1))
            if s.l <= lmin or el > math.radians(70):
                phase = 'turn_out'
                heading_ref = rad
                cycles += 1
        else:  # turn_out
            des = heading_ref
            CL = CLout
            ld = clamp(vrad + 4.0 * (info['T'] - 0.15), 0.0, 12.0)
            if abs(wrap(crs - heading_ref)) < math.radians(20):
                phase = 'out'
        err = wrap(des - crs)
        mu = clamp(1.5 * err, -math.radians(50), math.radians(50))
        # free-mode: +mu banks lift towards 'side' = vh x L0 (L0 ~ up): side points right of velocity -> +mu turns right
        sgn = 1.0 if (info['side'][0] * (-s.v[1]) + info['side'][1] * s.v[0]) > 0 else -1.0
        info = sim.step(s, dt, dict(CL=CL, mu=sgn * mu, ldot=ld))
        if s.ldot < 0:
            E += info['T'] * (-s.ldot) * dt / ETA
        zs.append(s.p[2] + sim.z_exit)
        lmin_seen, lmax_seen = min(lmin_seen, s.l), max(lmax_seen, s.l)
        if s.p[2] < -sim.z_exit + 0.3:
            crashed = True
            break
    n = len(zs)
    last = zs[n // 2:] if n > 10 else zs
    return dict(strategy='S3_yoyo', flyer=fl_name, lmin=lmin, lmax=lmax, vinMax=vin, Ttow=Ttow, CLin=CLin, ok=not crashed,
                t=round(s.t, 1), cycles=cycles, h_start=round(h0 + sim.z_exit, 1), h_end=round(zs[-1], 2),
                h_min_2nd_half=round(min(last), 2), lineRange=[round(lmin_seen, 1), round(lmax_seen, 1)],
                E_batt_J=round(E, 1), meanP_W=round(E / max(s.t, 1e-3), 2))


def wrap(a):
    while a > math.pi:
        a -= 2 * math.pi
    while a < -math.pi:
        a += 2 * math.pi
    return a


def main():
    out = {}
    # S1 closed form
    s1 = []
    for fl in (G130, K120):
        Vreq = 1.15 * fl.vmin()
        LD = fl.LDmax
        for t in (5, 10, 20, 38):
            T = fl.m * G / LD * 1.3  # drag incl. line (+30 %, ASSUMED) when towed in level flight
            s1.append(dict(flyer=fl.name, Vreq=round(Vreq, 2), t=t, lineNeeded=round(Vreq * t, 1),
                           E_batt_J=round(T * Vreq * t / ETA, 1)))
    out['S1_straightReelIn'] = s1
    # S4 free circling glide
    s4 = []
    for fl in (G130, K120):
        CLms = min(fl.CLmax * 0.9, math.sqrt(3 * fl.CD0 / fl.k))
        for bank in (0, 30, 45):
            ws, V = sink_rate(fl, CLms, bank)
            R = V * V / (G * math.tan(math.radians(bank))) if bank else None
            s4.append(dict(flyer=fl.name, CL=round(CLms, 2), bank=bank, V=round(V, 2), sink=round(ws, 2),
                           turnRadius=None if R is None else round(R, 1),
                           heightFor20s=round(ws * 20, 1), heightFor10s=round(ws * 10, 1)))
    out['S4_freeGlide'] = s4
    # S2 / S3 simulations
    jobs2 = []
    for fl, CLref, Vref in (('G130', 0.8, 7.0), ('K120', 0.8, 3.0)):
        for l0 in (20, 30):
            for Tset in (1.0, 2.0, 4.0, 6.0):
                jobs2.append((fl, l0, 55, Tset, CLref, Vref, 20.0))
    jobs3 = []
    for fl, CLin, CLout, Tt in (('G130', 1.0, 0.9, (2.0, 3.0, 5.0)), ('K120', 0.95, 0.8, (1.5, 2.5, 4.0))):
        for lmin, lmax in ((6.0, 15.0), (8.0, 25.0)):
            for Ttow in Tt:
                jobs3.append((fl, lmin, lmax, 10.0, CLin, CLout, 40.0, 8.0, Ttow))
    with Pool(4) as pool:
        res = pool.map(spiral_case, jobs2) + pool.map(yoyo_case, jobs3)
    out['S2_S3_sim'] = res
    # S5 dock & relaunch energy: reel in l at 3 m/s against ~1-3 N
    out['S5_dock'] = [dict(l=l, E_batt_J=round(2.0 * l / ETA, 1), t_s=round(l / 3.0 + 2.0, 1)) for l in (10, 20, 30)]
    # battery fit: per 45 min of filming (27 full-run laps of 101 s: 2 stops each => 54 stops)
    bat = []
    for E_stop in (20, 50, 100, 200, 500):
        Wh = E_stop * 54 / 3600
        g_cells = Wh / USABLE / WH_PER_KG * 1000
        bat.append(dict(E_per_stop_J=E_stop, Wh_per_45min=round(Wh, 3), cell_g=round(g_cells, 1)))
    out['batteryFit'] = bat
    save('h2_results.json', dict(model=__doc__, eta=ETA, usableFraction=USABLE, **out))
    return out


if __name__ == '__main__':
    o = main()
    for k in ('S1_straightReelIn', 'S4_freeGlide', 'S5_dock', 'batteryFit'):
        print(k)
        for r in o[k]:
            print(' ', r)
    for r in o['S2_S3_sim']:
        print(r)
