"""Wind-borne tethered carriers riding the skier's apparent wind:
A04 backpack launch-boom kite (sim/README.md concept), A05 side-paravane kite,
A06 motor-assisted hybrid kite-drone, A07 rotor kite (autogyro), A12 wing-unloaded mast.

Constant-coefficient model (same simplification as sim/, not validated):
  L = 0.5 rho V^2 S CL,  D = L * CD/CL,  tether tension = |aero - weight|
Run: python3 calc_kite.py
"""
import math
from calc_common import G, RHO_CONS, ke, fisheye_px, frac_speed_above, save, r, ideal_hover_power

RHO = RHO_CONS


def kite_state(m, S, CL, CD, V, lift_dir_deg=90.0):
    """lift_dir_deg: direction of lift in the plane normal to the flow,
    90 = straight up, 0 = sideways (horizontal). Returns tension & tether angles."""
    L = 0.5 * RHO * V * V * S * CL
    D = L * CD / CL
    W = m * G
    phi = math.radians(lift_dir_deg)
    # axes: x downwind (drag), y lateral, z up
    Fx, Fy, Fz = D, L * math.cos(phi), L * math.sin(phi) - W
    T = math.sqrt(Fx * Fx + Fy * Fy + Fz * Fz)
    elev = math.degrees(math.atan2(Fz, math.hypot(Fx, Fy)))
    azim = math.degrees(math.atan2(Fy, Fx))
    return dict(L_N=r(L, 2), D_N=r(D, 2), W_N=r(W, 2), tension_N=r(T, 2),
                tether_elev_deg=r(elev, 1), tether_azim_from_downwind_deg=r(azim, 1))


def v_min(m, S, CL, margin=1.3):
    return math.sqrt(2 * m * G * margin / (RHO * S * CL))


def main():
    out = {}
    # ---------------- A04 launch-boom kite (sim defaults: 0.30 kg, 0.25 m2, CL .8, CD .18)
    m, S, CL, CD = 0.30, 0.25, 0.8, 0.18
    a04 = {"v_min_airspeed_m_s_margin1.3": r(v_min(m, S, CL), 1)}
    for V in (6, 8, 12, 16, 20):
        a04[f"V{V}"] = kite_state(m, S, CL, CD, V)
    vmin = v_min(m, S, CL)
    a04["riding_time_fraction_below_vmin_calm"] = r(1 - frac_speed_above(vmin), 2)
    # gust sensitivity: dT/T = 2 dV/V
    a04["tension_swing_pct_for_3m_s_gust_at_12"] = r(100 * ((15 / 12) ** 2 - 1), 0)
    L_t = 8.0
    st = kite_state(m, S, CL, CD, 12)
    el = math.radians(st["tether_elev_deg"])
    a04["camera_height_above_anchor_m_L8_V12"] = r(L_t * math.sin(el), 1)
    a04["camera_behind_m_L8_V12"] = r(L_t * math.cos(el), 1)
    d_cam = math.hypot(L_t * math.sin(el) + 0.4, L_t * math.cos(el))
    px, ang = fisheye_px(d_cam, 5760 / 360)
    a04["slant_distance_to_skier_m"] = r(d_cam, 1)
    a04["subject_angular_size_deg"] = r(ang, 1)
    a04["subject_px_5.7K_360_equirect"] = r(px, 0)
    a04["KE_J_at_15"] = r(ke(m, 15), 1)
    out["A04"] = a04

    # ---------------- A05 side paravane: lift steered sideways, small vertical share
    a05 = {}
    for V in (8, 12, 16):
        # choose lift direction so that vertical component = 1.15 W (slight climb margin)
        L = 0.5 * RHO * V * V * S * CL
        sinphi = min(1.0, 1.15 * m * G / L)
        phi = math.degrees(math.asin(sinphi))
        stt = kite_state(m, S, CL, CD, V, phi)
        stt["lift_dir_from_horizontal_deg"] = r(phi, 1)
        Lt = 8.0
        stt["lateral_offset_m_L8"] = r(Lt * math.cos(math.radians(stt["tether_elev_deg"])) *
                                       math.sin(math.radians(stt["tether_azim_from_downwind_deg"])), 1)
        stt["behind_m_L8"] = r(Lt * math.cos(math.radians(stt["tether_elev_deg"])) *
                               math.cos(math.radians(stt["tether_azim_from_downwind_deg"])), 1)
        stt["lateral_pull_on_skier_N"] = r(stt["tension_N"] * math.cos(math.radians(stt["tether_elev_deg"])) *
                                           math.sin(math.radians(stt["tether_azim_from_downwind_deg"])), 1)
        a05[f"V{V}"] = stt
    # skier lateral push budget: edge grip is huge, but a 20 N sideways tug at hip
    # height ~1.1 m gives 22 N m roll moment (vs body weight moment ~ 80*9.81*0.1 = 78 N m per 0.1 m CoM shift)
    a05["roll_moment_Nm_at_V12"] = r(a05["V12"]["lateral_pull_on_skier_N"] * 1.1, 1)
    a05["equiv_CoM_shift_cm_at_V12"] = r(100 * a05["V12"]["lateral_pull_on_skier_N"] * 1.1 / (80 * G), 1)
    a05["tether_height_above_snow_at_mid_m"] = "~1.4-2.0 (clothesline across neighbouring track)"
    out["A05"] = a05

    # ---------------- A06 hybrid kite-drone: 0.33 kg tail-sitter wing on tether, S=0.12, CL 1.0
    m6, S6, CL6, CD6 = 0.33, 0.12, 1.0, 0.10
    A_disc = 2 * math.pi * 0.065 ** 2  # two 130 mm props (assumed)
    P_hover = ideal_hover_power(m6, A_disc, RHO) / 0.40
    v_wingborne = math.sqrt(2 * m6 * G / (RHO * S6 * CL6))
    a06 = {"hover_power_W": r(P_hover, 1), "v_wingborne_m_s": r(v_wingborne, 1)}
    # power vs airspeed: thrust replaces missing lift linearly (crude blend), plus control 3 W
    def P(V):
        lift_share = min(1.0, (V / v_wingborne) ** 2)
        return P_hover * (1 - lift_share) ** 1.5 + 3.0
    a06["power_W_by_airspeed"] = {str(V): r(P(V), 1) for V in (0, 4, 6, 8, 10, 12, 16)}
    # average power over assumed speed distribution N(11,3.5) truncated at 0, plus 15% stopped time
    import random
    rnd = random.Random(1)
    samples = [max(0.0, rnd.gauss(11, 3.5)) for _ in range(20000)]
    p_ride = sum(P(v) for v in samples) / len(samples)
    p_avg = 0.85 * p_ride + 0.15 * P(0)
    a06["avg_power_W_riding"] = r(p_ride, 1)
    a06["avg_power_W_incl_15pct_stopped_hover"] = r(p_avg, 1)
    E = 0.06 * 180 * 0.9 * 0.75  # 60 g onboard pack, cold
    a06["onboard_endurance_min_60g_pack"] = r(E / p_avg * 60, 1)
    a06["equal_mass_quad_power_at_12_W_ref"] = "~65 W (calc_rotor_follow A02 class)"
    a06["tether_tension_N_V12_wingborne"] = kite_state(m6, S6, CL6, CD6, 12)["tension_N"]
    a06["tether_tension_N_V20"] = kite_state(m6, S6, CL6, CD6, 20)["tension_N"]
    a06["KE_J_at_15"] = r(ke(m6, 15), 1)
    out["A06"] = a06

    # ---------------- A07 rotor kite: 0.6 m disc, resultant coefficient C_R ~0.9 (assumed lit range 0.7-1.1), L/D 3
    m7, Dd, CR, LD = 0.35, 0.6, 0.9, 3.0
    Ad = math.pi * (Dd / 2) ** 2
    a07 = {"disc_area_m2": r(Ad, 3)}
    for V in (6, 8, 12, 16):
        F = 0.5 * RHO * V * V * Ad * CR
        Lr, Dr = F * LD / math.hypot(LD, 1), F / math.hypot(LD, 1)
        a07[f"V{V}"] = {"lift_N": r(Lr, 1), "drag_N": r(Dr, 1),
                        "tension_N": r(math.hypot(Lr - m7 * G, Dr), 1)}
    a07["v_min_m_s_margin1.3"] = r(math.sqrt(2 * m7 * G * 1.3 / (RHO * Ad * CR * LD / math.hypot(LD, 1))), 1)
    # tip speed with tip-speed ratio ~ 3-5 of inflow component (assumed 4 x V sin(15deg incidence)... use 30 m/s at V=12)
    a07["tip_speed_m_s_at_V12_assumed"] = 30.0
    a07["rotor_freq_Hz_at_V12"] = r(30.0 / (math.pi * Dd), 1)
    # wind loss: autorotative vertical descent with disc CD ~1.2
    a07["descent_rate_on_wind_loss_m_s"] = r(math.sqrt(2 * m7 * G / (RHO * Ad * 1.2)), 1)
    a07["A04_kite_descent_on_wind_loss_m_s_(parachute-like flat plate CD 1.2 on 0.25 m2)"] = r(math.sqrt(2 * m * G / (RHO * S * 1.2)), 1)
    out["A07"] = a07

    # ---------------- A12 wing-unloaded backpack mast: 1.6 m mast, 0.12 m2 wing at tip
    a12 = {}
    m_tip = 0.25
    S12, CL12 = 0.12, 0.8
    for V in (8, 12, 16):
        L = 0.5 * RHO * V * V * S12 * CL12
        a12[f"V{V}_tip_lift_N"] = r(L, 1)
        a12[f"V{V}_net_vertical_tip_N"] = r(L - m_tip * G, 1)
    # gust 3 m/s at 12: lift swing
    L12 = 0.5 * RHO * 144 * S12 * CL12
    L15 = 0.5 * RHO * 225 * S12 * CL12
    a12["gust_lift_swing_N_12to15"] = r(L15 - L12, 1)
    a12["gust_root_moment_swing_Nm_1.6m"] = r((L15 - L12) * 1.6, 1)
    a12["static_root_moment_Nm_tip_weight"] = r(m_tip * G * 1.6, 1)
    out["A12"] = a12
    return out


if __name__ == "__main__":
    res = main()
    for k, v in res.items():
        print(k, v)
    print("saved", save("kite.json", res))
