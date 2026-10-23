#!/usr/bin/env python3
"""RES-040 body lens: cantilever camera-boom mechanics (order-of-magnitude, stdlib only).

Models a boom rooted at a hip-belt frame, pointing rearward and upward at angle
ALPHA above horizontal, carrying a tip camera. Everything is a placeholder estimate
(source labels in printout); nothing here is a physical test.

Outputs results_boom.json next to this file.
"""
import json, math, os

G = 9.81
RHO_AIR = 1.2          # kg/m^3, cold air at ~1500 m is ~1.1-1.2 (assumed)
RHO_CF = 1550.0        # kg/m^3 carbon/epoxy (lit, typical)
E_CF = {"low": 70e9, "mid": 100e9, "high": 120e9}   # brief range
SIGMA_CF = 600e6       # Pa, conservative tube bending strength (assumed)
TIP_MASS = 0.20        # kg: 360 camera ~0.18-0.20 kg (Insta360 X4/X5 class, lit) + clamp
ALPHA_DEG = 30.0       # boom elevation above horizontal (assumed geometry)
ZETA_BARE = 0.02       # carbon tube structural damping (assumed, typical 1-3 %)
ZETA_DAMPED = 0.15     # with viscoelastic root / tuned damper (design target, assumed)
TELESCOPE_KNOCKDOWN = 0.6  # joint compliance factor on stiffness for telescoping tubes (assumed)

# skiing excitation (brief + assumed)
F_TURN = (0.3, 1.0)    # Hz
F_MOGUL = (1.0, 3.0)   # Hz, mogul spacing ~4-8 m at 8-15 m/s (assumed)
F_CHATTER = (5.0, 30.0)
N_TURN = math.sqrt(1 + 1.5 ** 2)  # body-frame load factor at 1.5 g lateral, coordinated (calc)
A_BASE_MOGUL = 0.5 * G  # base (torso) acceleration amplitude in moguls (assumed; sustained sinusoid = worst case)
A_BASE_CHATTER = 0.3 * G  # hip-level accel in chatter after leg attenuation (assumed)


def tube(od, wall):
    d = od - 2 * wall
    I = math.pi / 64 * (od ** 4 - d ** 4)
    A = math.pi / 4 * (od ** 2 - d ** 2)
    return I, A


def thin_ellipse(a, b, t):
    """thin-walled elliptical (lenticular-ish CTM) section, semi-axes a (wide), b (thin)."""
    I_weak = math.pi / 4 * t * b ** 2 * (b + 3 * a)   # bending that flattens toward a
    I_strong = math.pi / 4 * t * a ** 2 * (a + 3 * b)
    per = math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))
    return I_weak, I_strong, per * t


def cantilever(EI, L, m_per_len, m_tip):
    k = 3 * EI / L ** 3
    m_beam = m_per_len * L
    m_eff = m_tip + 0.2357 * m_beam
    f1 = math.sqrt(k / m_eff) / (2 * math.pi)
    return k, m_beam, f1


def base_excited_rel(f_n, zeta, f, a_base):
    """relative tip displacement amplitude for harmonic base accel a_base at f (SDOF)."""
    r = f / f_n
    wn = 2 * math.pi * f_n
    H = 1 / math.sqrt((1 - r ** 2) ** 2 + (2 * zeta * r) ** 2)
    return a_base / wn ** 2 * r ** 2 * H


def case(name, EI, L, mpl, od_m, strength_Z=None, zeta=ZETA_BARE):
    k, mb, f1 = cantilever(EI, L, mpl, TIP_MASS)
    ca = math.cos(math.radians(ALPHA_DEG))
    reach = L * ca
    rise = L * math.sin(math.radians(ALPHA_DEG))
    # static sag under 1 g and under body-frame turn load factor
    def sag(n):
        w = mpl * n * G * ca
        P = TIP_MASS * n * G * ca
        return P * L ** 3 / (3 * EI) + w * L ** 4 / (8 * EI)
    root_M = lambda n: (TIP_MASS * L + mb * L / 2) * n * G * ca
    # worst-case relative tip motion over mogul band
    worst = max(base_excited_rel(f1, zeta, f, A_BASE_MOGUL)
                for f in [F_MOGUL[0] + i * 0.05 for i in range(int((F_MOGUL[1] - F_MOGUL[0]) / 0.05) + 1)])
    chat = max(base_excited_rel(f1, zeta, f, A_BASE_CHATTER) for f in [F_CHATTER[0] + i * 0.25 for i in range(101)])
    tip_slope = 1.5 * worst / L      # rad, tip-load cantilever slope = 3δ/(2L)
    tip_rate = tip_slope * 2 * math.pi * f1
    # yaw inertia about vertical axis through hip pivot (boom horizontal reach)
    I_yaw = TIP_MASS * reach ** 2 + mb * reach ** 2 / 3
    # roll / pitch about feet line, hip root at 1.0 m (assumed)
    h_root = 1.0
    h_tip = h_root + rise
    I_roll = TIP_MASS * h_tip ** 2 + mb * (h_root ** 2 + h_root * rise + rise ** 2 / 3)
    # aero at 15 m/s: crossflow on inclined boom + camera bluff body
    v = 15.0
    q = 0.5 * RHO_AIR * v ** 2
    vn_fac = math.sin(math.radians(ALPHA_DEG))
    F_boom = q * vn_fac ** 2 * od_m * L * 1.2
    F_cam = q * 0.05 * 0.06 * 1.0
    shed = 0.2 * v * vn_fac / od_m
    # Euler buckling fixed-free and bending strength at root
    Pcr = math.pi ** 2 * EI / (4 * L ** 2)
    M_fail = SIGMA_CF * strength_Z if strength_Z else None
    ke_tip = 0.5 * (TIP_MASS + mb) * v ** 2
    return dict(name=name, L_m=L, EI_Nm2=round(EI, 1), k_tip_N_per_m=round(k, 2),
                boom_mass_kg=round(mb, 3), f1_Hz=round(f1, 2),
                sag_1g_mm=round(sag(1) * 1e3, 1), sag_turn_mm=round(sag(N_TURN) * 1e3, 1),
                root_moment_1g_Nm=round(root_M(1), 2), root_moment_turn_Nm=round(root_M(N_TURN), 2),
                mogul_rel_tip_amp_mm=round(worst * 1e3, 1), chatter_rel_tip_amp_mm=round(chat * 1e3, 1), tip_slope_amp_deg=round(math.degrees(tip_slope), 2),
                tip_ang_rate_amp_dps=round(math.degrees(tip_rate), 1),
                reach_m=round(reach, 2), tip_height_above_snow_m=round(h_tip, 2),
                I_yaw_added_kgm2=round(I_yaw, 3), I_roll_added_kgm2=round(I_roll, 3),
                drag_15ms_N=round(F_boom + F_cam, 2), vortex_shed_Hz=round(shed, 1),
                euler_Pcr_N=round(Pcr, 1), root_M_fail_Nm=(round(M_fail, 1) if M_fail else None),
                KE_boom_15ms_J=round(ke_tip, 1), zeta=zeta)


def main():
    out = {"assumptions": dict(TIP_MASS=TIP_MASS, ALPHA_DEG=ALPHA_DEG, N_TURN=round(N_TURN, 3),
                               A_BASE_MOGUL_ms2=A_BASE_MOGUL, TELESCOPE_KNOCKDOWN=TELESCOPE_KNOCKDOWN,
                               body_I_yaw_kgm2=(1.0, 2.0), body_I_roll_feet_kgm2=(10.0, 15.0)),
           "cases": []}
    rows = out["cases"]
    # 1) rigid / telescoping round carbon tubes
    for od, wall in [(0.016, 0.001), (0.020, 0.001), (0.025, 0.0012)]:
        I, A = tube(od, wall)
        for L in (1.0, 1.5, 2.0, 2.5, 3.0):
            for ek, E in (("mid", E_CF["mid"]),):
                rows.append(case(f"tube OD{od*1e3:.0f}x{wall*1e3:.1f} E{ek} rigid", E * I, L, RHO_CF * A, od,
                                 strength_Z=I / (od / 2)))
                rows.append(case(f"tube OD{od*1e3:.0f}x{wall*1e3:.1f} E{ek} telescoping", E * I * TELESCOPE_KNOCKDOWN,
                                 L, RHO_CF * A * 1.15, od, strength_Z=I / (od / 2)))
                rows.append(case(f"tube OD{od*1e3:.0f}x{wall*1e3:.1f} E{ek} telescoping+damper", E * I * TELESCOPE_KNOCKDOWN,
                                 L, RHO_CF * A * 1.15, od, strength_Z=I / (od / 2), zeta=ZETA_DAMPED))
    # 2) bistable / collapsible tubular mast (CTM-like) section, E_eff 60 GPa laminate (assumed)
    Iw, Is, A = thin_ellipse(0.025, 0.008, 0.0003)
    for L in (1.5, 2.0, 2.5, 3.0):
        rows.append(case("CTM 50x16x0.3 strong-axis(sagittal)", 60e9 * Is, L, RHO_CF * A, 0.05, strength_Z=Is / 0.025))
        rows.append(case("CTM 50x16x0.3 weak-axis(lateral)", 60e9 * Iw, L, RHO_CF * A, 0.016, strength_Z=Iw / 0.008))
    # 3) inflatable fabric beam: wrinkling moment M_w = pi p r^3 / 2, stiffness ~ pi r^3 t E (pre-wrinkle)
    infl = []
    for r in (0.025, 0.035, 0.05):
        for p in (1e5, 2e5, 4e5):
            Mw = math.pi * p * r ** 3 / 2
            infl.append(dict(r_m=r, p_Pa=p, M_wrinkle_Nm=round(Mw, 2),
                             vol_L_per_m=round(math.pi * r ** 2 * 1e3, 2),
                             pump_work_J_per_m=round(p * math.pi * r ** 2 * math.log((p + 1e5) / 1e5), 1)))
    out["inflatable"] = infl
    # 4) weathervane free-yaw boom: aero restoring torque vs inertia
    wv = []
    for L in (1.5, 2.0, 2.5):
        reach = L * math.cos(math.radians(15))
        I_yaw = TIP_MASS * reach ** 2 + 0.11 * L * reach ** 2 / 3
        for S in (0.01, 0.03, 0.06):
            for v in (8.0, 15.0):
                q = 0.5 * RHO_AIR * v ** 2
                k = q * S * 3.0 * reach      # CL_alpha ~3 /rad low-AR fin (assumed)
                wn = math.sqrt(k / I_yaw)
                wv.append(dict(L_m=L, fin_m2=S, v_ms=v, I_yaw=round(I_yaw, 3), k_aero_Nm_per_rad=round(k, 2),
                               f_n_Hz=round(wn / 2 / math.pi, 2),
                               phase_lag_deg_at_0p5Hz_zeta0p5=round(math.degrees(math.atan2(2 * 0.5 * (0.5 / (wn / 2 / math.pi)), 1 - (0.5 / (wn / 2 / math.pi)) ** 2)), 1)))
    out["weathervane"] = wv
    # 5) active yaw servo: torque to slew boom +/-45 deg at turn rhythm
    act = []
    for L in (1.5, 2.0, 2.5):
        reach = L * math.cos(math.radians(30))
        I_yaw = TIP_MASS * reach ** 2 + 0.11 * L * reach ** 2 / 3
        for f in (0.3, 0.5, 1.0):
            T = I_yaw * math.radians(45) * (2 * math.pi * f) ** 2
            act.append(dict(L_m=L, f_Hz=f, I_yaw=round(I_yaw, 3), peak_torque_Nm=round(T, 2)))
    out["active_yaw"] = act
    # 6) helmet stick: neck load
    hel = []
    for L in (0.3, 0.5, 0.8):
        m = TIP_MASS + 0.05
        hel.append(dict(L_m=L, static_neck_moment_Nm=round(m * G * L, 2),
                        added_head_yaw_I_kgm2=round(m * L ** 2, 3), head_yaw_I_ref_kgm2=0.025,
                        moment_at_3g_Nm=round(3 * m * G * L, 2)))
    out["helmet"] = hel
    # 7) passive pendulum (gravity) arm natural frequency
    out["pendulum"] = [dict(l_m=l, f_Hz=round(math.sqrt(G / l) / 2 / math.pi, 2)) for l in (0.5, 1.0, 2.0)]
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results_boom.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=1)
    hdr = "name L f1 sag1g sagTurn Mroot_turn mogulTip tipRate Iyaw Iroll drag Pcr Mfail"
    print(hdr)
    for r in rows:
        print(f"{r['name']:<44} {r['L_m']:.1f} f1={r['f1_Hz']:5.2f}Hz sag={r['sag_1g_mm']:6.1f}/{r['sag_turn_mm']:6.1f}mm "
              f"M={r['root_moment_turn_Nm']:5.1f}Nm mog={r['mogul_rel_tip_amp_mm']:6.1f}mm ch={r['chatter_rel_tip_amp_mm']:5.1f}mm rate={r['tip_ang_rate_amp_dps']:6.1f}dps "
              f"Iy={r['I_yaw_added_kgm2']:.2f} Ir={r['I_roll_added_kgm2']:.2f} D={r['drag_15ms_N']:.2f}N "
              f"Pcr={r['euler_Pcr_N']:.0f}N Mf={r['root_M_fail_Nm']}")
    print("inflatable:", *infl, sep="\n ")
    print("weathervane:", *wv, sep="\n ")
    print("active yaw:", *act, sep="\n ")
    print("helmet:", *hel, sep="\n ")
    print("pendulum:", out["pendulum"])
    print("wrote", path)


if __name__ == "__main__":
    main()
