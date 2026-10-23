#!/usr/bin/env python3
"""Hand calcs for the active-tether back-reel follow-cam (SIM-032, hardware/mechanical role).

Evidence level: closed-form estimates with catalogue numbers (URLs in report.json) and
ASSUMED coefficients (marked). NOT physical verification; nothing built or tested.
Run:  python3 calc_hardware.py  -> writes calc_out.json next to this file.
"""
import json, math, os, random

RHO = 1.0          # kg/m3, components.js ATMOS (2000-2500 m, -10 C)
G = 9.81
OUT = {}

# ---------------------------------------------------------------- line
LINE = dict(
    name='PowerPro Spectra 50 lb braid (8-carrier UHMWPE)', d_mm=0.36, break_N=50 * 4.448,
    g_per_m=0.11,      # ASSUMED (0.36 mm, fill 0.75, 0.97 g/cm3 -> 0.074; +coating) rounded up
    E_eff_GPa=50.0,    # ASSUMED effective braid modulus (fibre ~100 GPa, braid angle + fill)
    fill=0.65, cd=1.1)
LINE_COND = dict(name='2-conductor litz on UHMWPE core (towglider round-3 spec, custom)', d_mm=0.60,
                 break_N=None, g_per_m=0.40, ohm_per_m_per_cond=1.3)
T_CLUTCH = 35.0    # N, mechanical slip-clutch line-equivalent setting (< 40 N body-force rule)
T_OP = 25.0        # N, controller tension cap in normal flight

def line_checks():
    d = LINE['d_mm'] * 1e-3
    A = math.pi / 4 * d * d * LINE['fill']
    EA = LINE['E_eff_GPa'] * 1e9 * A
    res = {}
    for L in (10, 15, 20, 25):
        U = 0.5 * T_CLUTCH ** 2 * L / EA          # stored elastic energy at the clutch limit
        res[f'L{L}m'] = dict(stretch_mm=round(T_CLUTCH * L / EA * 1e3, 1), elasticEnergy_J=round(U, 2))
    sf_clutch = LINE['break_N'] / T_CLUTCH
    return dict(EA_N=round(EA), sf_vs_clutch=round(sf_clutch, 2),
                sf_with_knot_0p7=round(0.7 * sf_clutch, 2), byLength=res,
                note='snap-back: the stored energy goes into ~2-3 g of line; aerodynamic drag of a 0.36 mm line '
                     'limits recoil speed, but the free end can whip; weak link + cutter decide where it parts')

def line_drag(Va, L, d_mm=LINE['d_mm'], cd=LINE['cd']):
    """Total cross-flow drag of a straight line normal to the flow (upper bound)."""
    return 0.5 * RHO * Va * Va * (d_mm * 1e-3) * L * cd

# ---------------------------------------------------------------- flyers
# CD0 / k ASSUMED (low-Re, flexible sail, camera pod); see report flyer section
FLYERS = {
    'umbrellaDelta': dict(S=0.094, CD0=0.075, k=0.095, CLmax=1.0, m=0.118,
                          desc='folding delta (Rogallo-type) with umbrella runner, LE 0.45 m, span 0.75 m'),
    'foldGlider':    dict(S=0.080, CD0=0.035, k=0.060, CLmax=1.1, m=0.140,
                          desc='rigid folding glider, span 0.80 m, chord 0.10 m, tail (towglider-class)'),
    'ramAir':        dict(S=0.12, CD0=0.11, k=0.12, CLmax=0.8, m=0.100,
                          desc='single-skin/ram-air foil + bridled camera pod'),
}

def equilibrium(f, Va, L_line=15.0, Tcap=T_OP):
    """Best elevation over the CL range with |T| <= Tcap; weight + half the line drag included.
    Apparent wind horizontal (rider-relative); 2-D, steady, straight line (ASSUMED)."""
    W = f['m'] * G
    Wl = LINE['g_per_m'] * 1e-3 * L_line * G
    best = None
    q = 0.5 * RHO * Va * Va
    for i in range(41):
        CL = 0.15 + (f['CLmax'] - 0.15) * i / 40
        CD = f['CD0'] + f['k'] * CL * CL
        Lf, Df = q * f['S'] * CL, q * f['S'] * CD
        Dl = 0.5 * line_drag(Va, L_line)         # ~half of the line drag acts at the flyer (ASSUMED)
        Tz = Lf - W - 0.5 * Wl
        Tx = Df + Dl
        T = math.hypot(Tx, Tz)
        eps = math.degrees(math.atan2(Tz, Tx))
        if T > Tcap:
            continue
        cand = dict(CL=round(CL, 3), LD=round(CL / CD, 2), eps_deg=round(eps, 1), T_N=round(T, 2))
        if Tz > 0 and (best is None or eps > best['eps_deg']):
            best = cand
    return best

def flyer_tables():
    out = {}
    for k, f in FLYERS.items():
        ldmax = max((0.15 + i * 0.01) / (f['CD0'] + f['k'] * (0.15 + i * 0.01) ** 2) for i in range(int((f['CLmax'] - 0.15) / 0.01)))
        rows = {}
        for Va in (5, 6, 7, 8, 10, 12, 15, 20, 25):
            rows[str(Va)] = equilibrium(f, Va)
        vmin = math.sqrt(2 * f['m'] * G / (RHO * f['S'] * f['CLmax']))
        # min apparent wind for eps>=45 deg and T>=1.5 N (estimable tension)
        v45 = None
        for i in range(400):
            Va = 3 + i * 0.05
            e = equilibrium(f, Va)
            if e and e['eps_deg'] >= 45 and e['T_N'] >= 1.5:
                v45 = round(Va, 2); break
        out[k] = dict(desc=f['desc'], massKg=f['m'], S=f['S'], LDmax_polar=round(ldmax, 2),
                      VaMin_level_ms=round(vmin, 2), VaFor45degAnd1p5N_ms=v45,
                      keSpeedCap_ms=round(math.sqrt(2 * 14.9 / f['m']), 2), byVa=rows)
    return out

def elevation_control():
    """Extra drag area needed to hold a target elevation (head clearance / framing), umbrellaDelta.
    Achieved in practice by trimming the tow point to a high angle of attack (flat-plate branch,
    L/D≈cot α) or a servo tail drogue; numbers below are the required CdA increment."""
    f = FLYERS['umbrellaDelta']
    W = f['m'] * G
    out = {}
    for eps in (45, 50, 55, 60):
        rows = {}
        for Va in (7, 10, 15, 20):
            q = 0.5 * RHO * Va * Va
            best = None
            for i in range(30):
                CL = 0.3 + i * 0.025
                Lf = q * f['S'] * CL
                Tz = Lf - W
                if Tz <= 0: continue
                Dneed = Tz / math.tan(math.radians(eps))
                Dbase = q * f['S'] * (f['CD0'] + f['k'] * CL * CL) + 0.5 * 0.5 * line_drag(Va, 15)
                dCdA = (Dneed - Dbase) / q
                T = math.hypot(Tz, Dneed)
                if T <= T_OP and dCdA >= 0 and (best is None or T > best['T_N']):
                    best = dict(CL=round(CL, 2), dCdA_m2=round(dCdA, 4), T_N=round(T, 2),
                                flatPlateAlpha_deg=round(90 - eps, 1))
            rows[str(Va)] = best
        out[str(eps)] = rows
    return out

def reel_on_flyer():
    """Architecture B: reel, driver and the energy for reel-in work ride on the flyer."""
    base = FLYERS['umbrellaDelta']['m']
    add = dict(motor_1404_class=17, planetary_or_belt=8, drum_and_line_25m=9, foc_driver=7,
               extra_cell_for_reel_work=25, structure=6)  # g, ASSUMED/class values
    m = base + sum(add.values()) * 1.15 / 1000
    return dict(addedG=add, flyerKg=round(m, 3), keSpeedCap_ms=round(math.sqrt(2 * 14.9 / m), 2),
                note='KE cap below typical rider speed 12-15 m/s before any swing about the rider -> fails KE')

# ---------------------------------------------------------------- head clearance & clothesline
def dist_point_line(P, A, d):
    v = [P[i] - A[i] for i in range(3)]
    t = max(0.0, sum(v[i] * d[i] for i in range(3)))   # half-line from the exit outward
    c = [A[i] + t * d[i] - P[i] for i in range(3)]
    return math.sqrt(sum(x * x for x in c))

POSTURES = {   # helmet centre relative to the lumbar pivot (x fwd, y left, z up), m (ASSUMED anthropometry)
    'upright': (0.05, 0.0, 0.95), 'crouch': (0.30, 0.0, 0.78), 'sitBack': (-0.08, 0.0, 0.85),
    'carve45': (0.20, 0.55, 0.62)}

def exit_point(kind, a=0.0, pitch_deg=-10.0):
    if kind == 'shoulder':      # top of a back pack
        return (-0.15, 0.0, 0.50)
    if kind == 'mast0.6':       # 0.6 m mast above the pack top
        return (-0.15, 0.0, 1.10)
    if kind == 'lumbarTail':    # tail/quiver of length a from the lumbar pivot, pitched pitch_deg
        p = math.radians(pitch_deg)
        return (-0.12 - a * math.cos(p), 0.0, a * math.sin(p))
    raise ValueError(kind)

def head_clearance():
    rows = {}
    for kind, a in (('shoulder', 0), ('mast0.6', 0), ('lumbarTail', 0.30), ('lumbarTail', 0.45),
                    ('lumbarTail', 0.55), ('lumbarTail', 0.65)):
        E = exit_point(kind, a)
        key = kind if a == 0 else f'{kind}{a:.2f}'
        tab = {}
        for eps in (30, 45, 55, 65, 75, 90):
            worst = 9
            for az in (-30, 0, 30):
                e, z = math.radians(eps), math.radians(az)
                d = (-math.cos(e) * math.cos(z), math.cos(e) * math.sin(z), math.sin(e))
                for pn, P in POSTURES.items():
                    worst = min(worst, dist_point_line(P, E, d))
            tab[str(eps)] = round(worst, 3)
        # line height above snow 1/2/3 m behind the exit (pivot at 0.95 m above snow upright, ASSUMED)
        hgt = {str(eps): [round(0.95 + E[2] + math.tan(math.radians(eps)) * x, 2) for x in (1, 2, 3)]
               for eps in (30, 45, 55)}
        rows[key] = dict(exit_m=[round(c, 3) for c in E], minHeadClear_m_byElev=tab,
                         lineHeight_1_2_3m_behind_upright=hgt)
    return rows

# ---------------------------------------------------------------- reel / motor / battery
MOTOR = dict(name='T-Motor MN3110 KV700', Kv=700, R=0.092, I0=0.6, Imax=21.0, g=80)  # I0 ASSUMED
PACK = dict(name='4S1P Molicel P28A', cells=4, Ah=2.8, Vcold=3.30, Rcell_cold=0.036,  # Vcold/R ASSUMED (-10 C, ~3x 25 C IR)
            g_cells=4 * 46, g_total=215)

def drum_geom(width_mm=4.0, r_hub_mm=15.0, L=25.0, d_mm=LINE['d_mm'], pack=0.8):
    vol = L * 1e3 * math.pi / 4 * d_mm ** 2 / pack       # mm3
    r_full = math.sqrt(r_hub_mm ** 2 + vol / (math.pi * width_mm))
    wraps = L * 1e3 / (2 * math.pi * (r_hub_mm + r_full) / 2)
    return dict(width_mm=width_mm, r_hub_mm=r_hub_mm, r_full_mm=round(r_full, 2), wraps=round(wraps),
                lineVol_mm3=round(vol))

def motor_point(T_line, v_line, r, Gr):
    """Line tension (N) and line speed (m/s, + = reel-in) at drum radius r (m) and gear ratio Gr."""
    Kt = 60 / (2 * math.pi * MOTOR['Kv'])
    w_m = v_line / r * Gr
    tau_m = T_line * r / Gr / 0.92            # belt efficiency 0.92 ASSUMED
    I = tau_m / Kt + MOTOR['I0']
    Vbemf = w_m * Kt
    Vreq = Vbemf + I * MOTOR['R']
    Pel = Vreq * I
    Rpack = PACK['cells'] * PACK['Rcell_cold']
    Vpack_oc = PACK['cells'] * PACK['Vcold']
    # battery current from Pel at the sagged voltage (driver eff 0.95 ASSUMED)
    Pb = Pel / 0.95
    disc = Vpack_oc ** 2 - 4 * Rpack * Pb
    Ib = (Vpack_oc - math.sqrt(disc)) / (2 * Rpack) if disc > 0 else float('inf')
    Vbus = Vpack_oc - Ib * Rpack
    ok = (Vreq <= 0.95 * Vbus) and (I <= MOTOR['Imax'] * 1.3)
    return dict(T=T_line, v=v_line, r_mm=round(r * 1e3, 1), motorRpm=round(w_m * 60 / 2 / math.pi),
                phaseA=round(I, 1), Vneeded=round(Vreq, 2), Vbus=round(Vbus, 2), Pmech=round(T_line * v_line, 1),
                Pel=round(Pel, 1), copperW=round(I * I * MOTOR['R'], 1), battA=round(Ib, 2),
                Crate=round(Ib / PACK['Ah'], 2), feasible=ok)

OPS = {'pump_15N_3ms': (15, 3), 'retract_6N_6ms': (6, 6), 'tailwindReelIn_20N_5ms': (20, 5),
       'hold_25N_stall': (25, 0.0), 'launchPayout_5N_-12ms': (5, -12), 'gustPayoutBrake_25N_-10ms': (25, -10)}

def reel():
    dg = drum_geom()
    sweep = {}
    for Gr in (1.5, 2.0, 2.5, 3.0):
        pts = {}
        for name, (T, v) in OPS.items():
            # speed checks at the empty-drum radius when reeling in from full pay-out, torque at the full radius
            r = dg['r_hub_mm'] / 1e3 if v > 0 else dg['r_full_mm'] / 1e3
            if T >= 20: r = dg['r_full_mm'] / 1e3
            pts[name] = motor_point(T, v, r, Gr)
        sweep[str(Gr)] = dict(allFeasible=all(p['feasible'] for k, p in pts.items() if not k.startswith(('launch', 'gust'))),
                              points=pts)
    # reflected inertia (rotor J ASSUMED 2.5e-5 kg m2 for a 37 mm outrunner bell; drum 3e-6)
    Gr = 2.0
    J = 2.5e-5 * Gr ** 2 + 3e-6
    meq = {f'r{rr}mm': round(J / (rr / 1e3) ** 2, 3) for rr in (15, 22)}
    # hub crush: N wraps each at tension T on width b (upper bound, no relaxation)
    hub = {}
    for T in (5, 15):
        p = dg['wraps'] * T / (dg['r_hub_mm'] * 1e-3 * dg['width_mm'] * 1e-3) / 1e6
        hub[f'windOnTension_{T}N'] = dict(hubPressure_MPa=round(p, 1),
                                          note='solid Al 6061-T6 hub (yield 240-275 MPa) OK; flanges see a fraction of it (spool burst known for braid)')
    # payout-brake energy and where it goes (Li-ion cannot take charge below ~0 C)
    E_brake = 25 * 10 * 2.0   # 2 s at 25 N / 10 m/s
    dT_motor = E_brake / (MOTOR['g'] * 0.45)
    return dict(drum=dg, gearSweep=sweep, chosenGear=2.0, reflectedMass_kg=meq,
                hubCrush=hub, payoutBrake=dict(energy_J=E_brake, motorTempRiseIfDumpedInWindings_K=round(dT_motor, 1),
                                               note='regen only when the pack thermistor reads >5 C, otherwise 10 W shunt resistor + short-circuit braking'))

def battery():
    Wh = PACK['cells'] * 3.6 * PACK['Ah']
    usable = Wh * 0.75 * 0.85    # components.js coldFactor & reserve
    loads = dict(reelMean=6.0, backUnitMCU_IMU_GNSS=0.6, quiverDriveMean=0.05, dockChargeFlyer=1.2, cutterStandby=0.0)
    # flyer loads are carried by the flyer cell, recharged from the pack via dock contacts (dockChargeFlyer)
    Wmean = sum(loads.values())
    endur = usable / Wmean * 60
    sens = {f'reelMean_{w}W': round(usable / (Wmean - 6.0 + w) * 60, 1) for w in (3, 6, 10, 15)}
    flyer_cell = dict(name='1S LiPo 450 mAh', Wh=1.67, g=11)
    flyer_load = 2.7 + 1.0 + 0.4 + 0.3   # cam4kNoGimbal + avionics + 2 servos + tilt servo/heater share
    fmin = flyer_cell['Wh'] * 0.75 * 0.85 / flyer_load * 60
    return dict(pack=PACK, nominalWh=round(Wh, 1), usableColdWh=round(usable, 1), loadsW=loads,
                enduranceMin_backUnit=round(endur, 1), reelMeanSensitivity=sens,
                flyerCell=flyer_cell, flyerLoadW=flyer_load, flyerMinPerCharge=round(fmin, 1),
                peakCrate_note='peak ~10-13 A from a 2.8 Ah cell = 3.6-4.6 C vs 35 A (12.5 C) rating at 25 C; '
                               'kite2 needed 15.8 C from a 12 Wh 3S LiPo at -10 C (A4-K2-07)')

# ---------------------------------------------------------------- structures (every slender part)
def tube_I(D, d):
    return math.pi / 64 * (D ** 4 - d ** 4)

def structures():
    s = {}
    Ec = 70000.0   # MPa, roll-wrapped carbon tube (ASSUMED conservative; pultruded 110-130 GPa)
    # 1) quiver/line-exit tube 56 x 0.6 mm, 0.47 m, lateral line pull at clutch limit
    D, t, L = 56.0, 0.6, 470.0
    I = tube_I(D, D - 2 * t)
    M = T_CLUTCH * L
    s['quiverTube'] = dict(OD_mm=D, wall_mm=t, L_mm=L, I_mm4=round(I), M_Nmm=M, sigma_MPa=round(M * D / 2 / I, 1),
                           tipDefl_mm=round(T_CLUTCH * L ** 3 / (3 * Ec * I), 2),
                           localBucklingCrit_MPa=round(0.3 * Ec * t / (D / 2), 0),
                           massG=round(math.pi / 4 * (D ** 2 - (D - 2 * t) ** 2) * L * 1.55e-3, 1),
                           crushNote='a falling rider (≈800 N) ovalises/crushes it: hinge must break away (≤60 N tip load, '
                                     'except along the line) and fold onto the pack')
    # 2) delta leading-edge spar: half lift at 25 N op cap, UDL over 0.45 m, simply supported (nose hinge/strut)
    Lsp, Fhalf = 450.0, 12.5
    w = Fhalf / Lsp
    for (Do, di) in ((5.0, 4.0), (4.0, 3.0), (3.0, 2.0)):
        I = tube_I(Do, di)
        Mx = w * Lsp ** 2 / 8
        s[f'deltaLE_{Do}x{di}'] = dict(sigma_MPa=round(Mx * Do / 2 / I, 1),
                                       midDefl_mm=round(5 * w * Lsp ** 4 / (384 * 110000 * I), 1),
                                       massG=round(math.pi / 4 * (Do ** 2 - di ** 2) * Lsp * 1.55e-3, 2),
                                       note='pultruded E≈110 GPa; strength ~1000+ MPa; keep σ<300 MPa for impact/fatigue')
    # at the 35 N clutch limit (rare)
    w35 = 17.5 / Lsp
    I5 = tube_I(5.0, 4.0)
    s['deltaLE_5x4_atClutch'] = dict(sigma_MPa=round(w35 * Lsp ** 2 / 8 * 2.5 / I5, 1))
    # 3) umbrella struts (compression), 0.18 m, pinned-pinned; load = spreader thrust ASSUMED 0.8 x lift
    for (Do, di) in ((4.0, 3.0), (3.0, 2.0), (3.0, 0.0)):
        I = tube_I(Do, di)
        Pcr = math.pi ** 2 * 110000 * I / 180.0 ** 2
        s[f'strut_{Do}x{di}'] = dict(Pcr_N=round(Pcr, 1), loadAtClutch_N=round(0.8 * T_CLUTCH / 2, 1),
                                     SF=round(Pcr / (0.8 * T_CLUTCH / 2), 2))
    # 4) keel 6x5 mm, 0.30 m, tow point mid-keel, line 35 N reacted at nose & tail (3-point bend)
    I = tube_I(6.0, 5.0)
    Mk = T_CLUTCH * 300 / 4
    s['keel_6x5'] = dict(sigma_MPa=round(Mk * 3 / I, 1), massG=round(math.pi / 4 * (36 - 25) * 300 * 1.55e-3, 2))
    # 5) the round-4 kite2 boom, reproduced for contrast (3.0 x 0.25 mm, 1.45 m, 90 g KCU cantilever)
    I = tube_I(3.0, 2.5)
    Lb, F = 1450.0, 0.09 * G
    s['kite2Boom_reference'] = dict(tipDefl_mm=round(F * Lb ** 3 / (3 * 130000 * I), 0),
                                    rootStress_MPa=round(F * Lb * 1.5 / I, 0),
                                    eulerPinned_N=round(math.pi ** 2 * 130000 * I / Lb ** 2, 2),
                                    note='reproduces audit4 A4-K2-01 order of magnitude (3341 mm, 930 MPa, 1.3-1.95 N)')
    # 6) GT2 6 mm belt at the hold point (motor pulley 20T r=6.37 mm, gear 2:1)
    tau_m = T_CLUTCH * 0.022 / 2.0
    s['gt2Belt'] = dict(effectiveTension_N=round(tau_m / 6.37e-3, 1),
                        note='Gates 2MR/GT2 6 mm allowable working tension is of order 100+ N (ASSUMED, check Gates tables)')
    # 7) quiver hinge pin, steel 4 mm, double shear, line pull + inertia 60 N
    A = math.pi / 4 * 16
    s['hingePin_4mm'] = dict(shear_MPa=round(60 / (2 * A), 1))
    # 8) fold-drive torque need
    tau = 0.175 * G * 0.25 + 3.4 * 0.28     # gravity of quiver+flyer at CoM + drag of the tube at 15 m/s
    s['quiverFoldDrive'] = dict(needNm=round(tau, 2), pololu1000to1_stallNm=0.98,
                                withExtra3to1_stallNm=2.94, ratioUse=round(tau / 2.94, 2),
                                note='operate ≤35-40 % of stall; 90° in ≈1.3 s at 11.7 rpm')
    return s

# ---------------------------------------------------------------- capture Monte Carlo (ASSUMED distributions)
def capture_mc(n=200000, seed=7):
    rnd = random.Random(seed)
    trumpet_half = 45.0
    res = {}
    for label, sig_ang, align in (('quiverFixed', 25.0, False), ('quiverAlignsToLine', 25.0, True)):
        ok = 0
        fails = dict(angle=0, rollJam=0, ice=0, wrap=0)
        for _ in range(n):
            line_ang = abs(rnd.gauss(35.0 if not align else 0.0, sig_ang if not align else 10.0))
            roll = abs(rnd.gauss(0, 20))                 # flyer roll at entry, deg
            if line_ang > trumpet_half:
                fails['angle'] += 1; continue
            # asymmetric LE contact -> jam probability rising with roll and entry angle (ASSUMED logistic)
            pj = 1 / (1 + math.exp(-(roll + 0.5 * line_ang - 55) / 6))
            if rnd.random() < pj:
                fails['rollJam'] += 1; continue
            if rnd.random() < 0.01:                      # ice/snow in the mouth (ASSUMED 1 %)
                fails['ice'] += 1; continue
            if rnd.random() < 0.005:                     # line wrapped on a spar after a tumble (ASSUMED 0.5 %)
                fails['wrap'] += 1; continue
            ok += 1
        p1 = ok / n
        res[label] = dict(firstTry=round(p1, 4), within3Tries=round(1 - (1 - p1) ** 3, 4),
                          failShares={k: round(v / n, 4) for k, v in fails.items()})
    res['note'] = ('Illustrative only: every distribution is ASSUMED. The line passes through the mouth eyelet, '
                   'so position error is self-centred; the drivers are entry angle vs trumpet half-angle, roll at entry '
                   '(asymmetric spar contact), icing and line wraps. Retries correlate (same wind), so within-3 is optimistic.')
    return res

# ---------------------------------------------------------------- mass / volume budget
def budget():
    flyer = dict(cam4kNoGimbal=27, tiltServo=2.5, camBracket=2, avionics=10, flightServos_2x4p5=9,
                 cell1S450=11, wiring=5, noseProbe_latchPlate_pogo=5, sail_Skytex27x0p094x1p3=3.3,
                 LEspars_2x5x4=round(2 * 4.9, 1), keel_6x5=round(math.pi / 4 * 11 * 300 * 1.55e-3, 1),
                 struts_runner_spring_hinges=6, towPointTrimSlide=2)
    fsum = sum(flyer.values())
    back = dict(motor_MN3110_700=85, beltPulleysBearingsClutchRatchet=35, drumYoYo_Al=12,
                meteringHead_flexure_ADS1220_encoders=15, focDriver_moteus_r4p11=14.2,
                MCU_IMU_baro_GNSS_radio=12, pack4S1P_P28A_withBMS=215, shuntResistor_heater_insulation=18,
                lineCutter_guillotine=8, line25m=round(25 * LINE['g_per_m'], 1),
                quiverTube_56x0p6=round(math.pi / 4 * (56 ** 2 - 54.8 ** 2) * 470 * 1.55e-3, 1),
                trumpet_lineAngleGimbal_AS5600x2=18, hinge_breakaway_foldDrive_pololu=32,
                enclosure_hipBelt_harness=150)
    bsum = sum(back.values())
    vol = dict(quiverL=round(math.pi / 4 * 0.056 ** 2 * 0.47 * 1000, 2), backUnitL=round(0.16 * 0.10 * 0.065 * 1000, 2),
               trumpetL=0.08)
    return dict(flyerG=round(fsum, 1), flyerWithMarginG=round(fsum * 1.15, 1), flyerItems=flyer,
                backUnitG=round(bsum, 1), backWithMarginG=round(bsum * 1.15, 1), backItems=back,
                wornTotalKg=round((fsum + bsum) * 1.15 / 1000, 3), volumeL=vol,
                packVolL=round(sum(vol.values()), 2))

if __name__ == '__main__':
    OUT['evidence'] = 'closed-form hand calcs; catalogue values + ASSUMED coefficients; not physical verification'
    OUT['line'] = line_checks()
    OUT['flyers'] = flyer_tables()
    OUT['elevationControl'] = elevation_control()
    OUT['archB_reelOnFlyer'] = reel_on_flyer()
    OUT['headClearance'] = head_clearance()
    OUT['reel'] = reel()
    OUT['battery'] = battery()
    OUT['structures'] = structures()
    OUT['capture'] = capture_mc()
    OUT['budget'] = budget()
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'calc_out.json')
    json.dump(OUT, open(p, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(OUT, indent=1, ensure_ascii=False))
