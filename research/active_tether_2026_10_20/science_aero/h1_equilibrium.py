"""H1 - static elevation of a tethered flyer with weight, line drag and line weight.

Model (2D vertical plane, apparent wind Va horizontal, flyer downwind = behind the rider):
  straight line of length l at elevation eps from the exit point, wings level, lift CL, drag CD(+brake).
  Moment balance about the exit (line treated as a rigid straight member - valid when sag << l,
  sag is checked separately):
     l[cos(eps)(Lift - m g) - sin(eps) D] - f_n l^2/2 - w_l cos(eps) l^2/2 = 0
     f_n = 0.5 rho Cd_l d (Va sin eps)^2      (cross-flow principle: only the normal wind component)
     w_l = mu_l g
  Weightless, dragless-line limit: tan(eps) = L/D  (classic kite result).
Outputs: eps vs CL (max-eps trim and max-L/D trim), the equivalent L/D_eff = tan(eps), tension,
line height 1/2/3 m behind the exit (upright exit 1.35 m, carving exit 1.05 m), catenary sag,
camera distance/depression/bodyPx for a camera ON the flyer and a camera clamped ON THE LINE,
and the head clearance of the line (shared headClear rule: any line >= 1.0 m from helmet centre).
"""
import math
from common import (G, RHO, G130, K120, LINE_COND, LINE_DYN, glider_with_LD, Flyer, body_px,
                    point_line_dist, save, CAM, RIDER_H)


def moment(eps, fl, line, l, Va, CL, brake=0.0):
    q = 0.5 * RHO * Va * Va
    Lift = q * fl.S * CL
    D = q * fl.S * fl.CD(CL, brake)
    fn = 0.5 * RHO * line.Cd * line.d * (Va * math.sin(eps)) ** 2
    wl = line.mu * G
    return l * (math.cos(eps) * (Lift - fl.m * G) - math.sin(eps) * D) - fn * l * l / 2 - wl * math.cos(eps) * l * l / 2


def solve_eps(fl, line, l, Va, CL, brake=0.0):
    """root of the moment balance in (0, 90 deg); None if the flyer cannot hold itself up"""
    a, b = 1e-4, math.pi / 2 - 1e-4
    fa, fb = moment(a, fl, line, l, Va, CL, brake), moment(b, fl, line, l, Va, CL, brake)
    if fa <= 0:
        return None
    if fb > 0:
        return b
    for _ in range(80):
        c = 0.5 * (a + b)
        if moment(c, fl, line, l, Va, CL, brake) > 0:
            a = c
        else:
            b = c
    return 0.5 * (a + b)


def tension(fl, line, l, Va, CL, eps, brake=0.0):
    q = 0.5 * RHO * Va * Va
    Lift, D = q * fl.S * CL, q * fl.S * fl.CD(CL, brake)
    T_tip = D * math.cos(eps) + (Lift - fl.m * G) * math.sin(eps)
    T_exit = T_tip - line.mu * G * l * math.sin(eps)  # line weight carried by the flyer end
    return T_tip, T_exit


def best(fl, line, l, Va, brake=0.0, objective='eps'):
    """trim CL: 'eps' maximises elevation, 'ld' flies at CL of (L/D)max (min tension per lift)"""
    if objective == 'ld':
        CL = min(fl.CL_LDmax, 0.9 * fl.CLmax)
        e = solve_eps(fl, line, l, Va, CL, brake)
        return (CL, e) if e is not None else best(fl, line, l, Va, brake, 'eps')
    bestCL, beste = None, None
    n = 120
    for i in range(n + 1):
        CL = fl.CLmin + (fl.CLmax - fl.CLmin) * i / n
        e = solve_eps(fl, line, l, Va, CL, brake)
        if e is not None and (beste is None or e > beste):
            bestCL, beste = CL, e
    return bestCL, beste


def va_static_min(fl, line, l):
    """lowest apparent wind with a static equilibrium at CLmax (Lift >= m g + w l/2)"""
    need = fl.m * G + line.mu * G * l / 2
    return math.sqrt(2 * need / (RHO * fl.S * fl.CLmax))


def geometry(eps_deg, l, exit_z=1.35, exit_x=-0.15, az_deg=0.0, cam_on_line_at=None, lean_deg=0.0):
    """rider at origin heading +x; flyer behind (-x) at elevation eps, azimuth az (positive = to the left)"""
    e, a = math.radians(eps_deg), math.radians(az_deg)
    ex = [exit_x, 0.0, exit_z]
    u = [-math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)]
    fly = [ex[i] + l * u[i] for i in range(3)]
    out = {}
    for s in (1.0, 2.0, 3.0):  # height of line above snow s metres (horizontal) behind the exit
        if math.cos(e) * math.cos(a) > 1e-6:
            t = s / (math.cos(e) * math.cos(a))
            out[f'lineH_{int(s)}m'] = round(ex[2] + t * u[2], 2) if t <= l else None
        else:
            out[f'lineH_{int(s)}m'] = None
    helmet = [0.10, 0.0, 1.60]  # crouched rider helmet centre (ASSUMED, consistent with env.js 1.666 m stature)
    out['headClear_m'] = round(point_line_dist(helmet, ex, fly), 2)
    out['flyerHead_m'] = round(math.dist(helmet, fly), 2)
    camp = fly if cam_on_line_at is None else [ex[i] + min(cam_on_line_at, l) * u[i] for i in range(3)]
    mid = [0, 0, 0.55 * RIDER_H]
    d = math.dist(camp, mid)
    dep = math.degrees(math.asin((camp[2] - mid[2]) / d))
    out.update(camDist_m=round(d, 2), camDepression_deg=round(dep, 1), bodyPx=round(body_px(camp, lean_deg)))
    return out


def sag(line, l, T, eps):
    """max catenary sag (perpendicular to chord), shallow approximation w cos(eps) l^2 / (8T)"""
    return line.mu * G * math.cos(eps) * l * l / (8 * max(T, 1e-3))


def run():
    lines = [5, 10, 15, 20, 30]
    masses = [0.080, 0.130, 0.200]
    vas = [3, 4, 5, 6, 8, 10, 12, 15, 20]
    flyers = []
    for m in masses:
        for LD in (5, 7.5, 10):
            flyers.append(glider_with_LD(LD, m=m))
    flyers.append(G130)
    flyers.append(K120)
    rows = []
    for fl in flyers:
        for line in (LINE_COND, LINE_DYN):
            for l in lines:
                vmin_static = va_static_min(fl, line, l)
                for Va in vas:
                    CL, e = best(fl, line, l, Va, objective='eps')
                    CLld, eld = best(fl, line, l, Va, objective='ld')
                    row = dict(flyer=fl.name, mass_g=round(fl.m * 1000), LDmax=round(fl.LDmax, 2), line=line.name,
                               l=l, Va=Va, vaStaticMin=round(vmin_static, 2))
                    if e is None:
                        row.update(flies=False)
                    else:
                        Tt, Te = tension(fl, line, l, Va, CL, e)
                        Ttl, Tel = tension(fl, line, l, Va, CLld, eld)
                        row.update(flies=True, CL_maxEps=round(CL, 3), eps_max_deg=round(math.degrees(e), 1),
                                   LDeff_maxEps=round(math.tan(e), 2), T_exit_maxEps=round(Te, 2),
                                   CL_LD=round(CLld, 3), eps_LD_deg=round(math.degrees(eld), 1),
                                   T_exit_LD=round(Tel, 2), sag_m=round(sag(line, l, Tel, eld), 3))
                        row.update({k: v for k, v in geometry(math.degrees(eld), l).items()})
                    rows.append(row)

    # headline table: G130 + conductive line
    head = [r for r in rows if r['flyer'] == 'G130' and r['line'] == LINE_COND.name]

    # camera feasibility map: what (eps, l) gives bodyPx >= 300 and headClear >= 1.0 m ?
    cammap = []
    for l in (4, 5, 6, 8, 10, 12, 15, 20, 30):
        for eps in (20, 30, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85):
            g0 = geometry(eps, l)
            g45 = geometry(eps, l, az_deg=45)
            gseat = geometry(eps, l, exit_z=0.95, exit_x=-0.25)
            gcarve = geometry(eps, l, exit_z=1.05)
            cammap.append(dict(l=l, eps=eps, bodyPx_cam_on_flyer=g0['bodyPx'], camDep=g0['camDepression_deg'],
                               camDist=g0['camDist_m'], lineH_1m=g0['lineH_1m'], lineH_2m=g0['lineH_2m'],
                               lineH_3m=g0['lineH_3m'], lineH_1m_carving=gcarve['lineH_1m'],
                               headClear_packTop=g0['headClear_m'], headClear_packTop_az45=g45['headClear_m'],
                               headClear_seatExit=gseat['headClear_m'], bodyPx_az45=g45['bodyPx']))

    # camera clamped on the line at s metres from the exit, flyer far out (l = 20 m)
    online = []
    for eps in (40, 50, 55, 60, 65, 70, 75, 80):
        for s in (4, 5, 6, 7, 8, 10):
            g = geometry(eps, 20, cam_on_line_at=s)
            online.append(dict(eps=eps, s_cam=s, bodyPx=g['bodyPx'], camDep=g['camDepression_deg'], camDist=g['camDist_m']))

    # required off-axis distance of the exit for headClear >= 1 m as a function of eps (exit at pack top)
    boom = []
    for eps in (30, 45, 60, 70, 80):
        need = None
        for k in range(0, 300):
            bx = -0.15 - k * 0.01
            if geometry(eps, 15, exit_x=bx, exit_z=1.35)['headClear_m'] >= 1.0:
                need = round(-bx - 0.15, 2)
                break
        boom.append(dict(eps=eps, extraRearwardExit_m=need))

    # airbrake (spoiler dCD) needed to hold a camera-friendly elevation, and the tension that results
    brake_rows = []
    for fl in (G130, K120):
        for Va in (6, 8, 10, 12, 15, 20):
            for l in (6, 10, 20):
                for eps_t in (45, 55, 60):
                    CL = min(fl.CL_LDmax, 0.9 * fl.CLmax)
                    lo, hi = 0.0, 3.0
                    e0 = solve_eps(fl, LINE_COND, l, Va, CL, 0.0)
                    if e0 is None or math.degrees(e0) <= eps_t:
                        brake_rows.append(dict(flyer=fl.name, Va=Va, l=l, eps_target=eps_t, brake_dCD=0.0,
                                               eps_free=None if e0 is None else round(math.degrees(e0), 1)))
                        continue
                    for _ in range(60):
                        mid = 0.5 * (lo + hi)
                        e = solve_eps(fl, LINE_COND, l, Va, CL, mid)
                        if e is not None and math.degrees(e) > eps_t:
                            lo = mid
                        else:
                            hi = mid
                    e = solve_eps(fl, LINE_COND, l, Va, CL, lo)
                    Tt, Te = tension(fl, LINE_COND, l, Va, CL, e, lo)
                    brake_rows.append(dict(flyer=fl.name, Va=Va, l=l, eps_target=eps_t, brake_dCD=round(lo, 3),
                                           brake_over_CD=round(lo / fl.CD(CL), 2), eps_free=round(math.degrees(e0), 1),
                                           T_exit=round(Te, 2)))
    # head clearance for alternative exits and azimuths (steep line)
    hc = []
    for name, ex, ez in (('packTop', -0.15, 1.35), ('seat', -0.25, 0.95), ('belt', -0.30, 0.80),
                         ('packTop+0.5m rear boom', -0.65, 1.45), ('packTop+0.8m rear boom', -0.95, 1.45)):
        for az in (0, 30, 60):
            for eps in (45, 60, 75):
                hc.append(dict(exit=name, az=az, eps=eps, headClear=geometry(eps, 15, exit_x=ex, exit_z=ez, az_deg=az)['headClear_m']))
    lean = []
    for eps in (45, 55, 65):
        for l in (5, 8):
            lean.append(dict(eps=eps, l=l, bodyPx_upright=geometry(eps, l)['bodyPx'],
                             bodyPx_lean40=geometry(eps, l, lean_deg=40)['bodyPx']))
    summary = dict(brakeForCamera=brake_rows, headClearExits=hc, leanEffect=lean,
        G130_table=[{k: r[k] for k in ('l', 'Va', 'flies', 'vaStaticMin') if k in r} |
                    ({k: r[k] for k in ('eps_max_deg', 'eps_LD_deg', 'LDeff_maxEps', 'T_exit_LD', 'sag_m',
                                         'lineH_1m', 'lineH_2m', 'lineH_3m', 'camDist_m', 'camDepression_deg',
                                         'bodyPx', 'headClear_m')} if r.get('flies') else {}) for r in head],
    )
    # compact extraction: eps (LD trim) for each flyer at Va 10 m/s and l 5/15/30
    comp = []
    for r in rows:
        if r['Va'] in (5, 8, 12, 20) and r['l'] in (5, 15, 30) and r['line'] == LINE_COND.name:
            comp.append({k: r.get(k) for k in ('flyer', 'mass_g', 'LDmax', 'l', 'Va', 'flies', 'eps_max_deg',
                                                 'eps_LD_deg', 'LDeff_maxEps', 'T_exit_LD', 'vaStaticMin')})
    save('h1_results.json', dict(model=__doc__, rows=rows, cameraMap=cammap, cameraOnLine_l20=online,
                                 rearwardExitForHeadClear=boom, compact=comp, **summary))
    return comp, cammap, online, boom


if __name__ == '__main__':
    comp, cammap, online, boom = run()
    for c in comp:
        if c['flyer'] in ('G130', 'K120', 'G80_LD10', 'G200_LD5', 'G200_LD10', 'G130_LD5', 'G130_LD10'):
            print(c)
    print('--- camera map (cam on flyer)')
    for c in cammap:
        if c['l'] in (5, 8, 10, 15) and c['eps'] in (30, 45, 55, 65, 75, 85):
            print(c)
    print('--- camera on line, l=20')
    for c in online:
        if c['s_cam'] in (5, 6, 8):
            print(c)
    print(boom)
