"""Tethered rotorcraft from the backpack: A03 powered short tether ("flying boom"),
A09 unpowered safety leash on a battery drone.

Tether model (order-of-magnitude): straight line, crossflow principle
  normal drag per metre  q = 0.5 rho (V sin a)^2 Cd_cyl d,   Cd_cyl ~ 1.2 (assumed)
  a = angle between tether and relative airflow.
Electrical: two copper conductors, loop length 2L, ohmic loss I^2 R.
Run: python3 calc_tether.py
"""
import math
from calc_common import G, RHO_CONS, COLD_CAPACITY, ideal_hover_power, ke, save, r

RHO = RHO_CONS
CD_CYL = 1.2
RHO_CU = 8960.0
RES_CU = 1.72e-8  # ohm m


def tether_drag(L, d, V, angle_deg):
    a = math.radians(angle_deg)
    return 0.5 * RHO * (V * math.sin(a)) ** 2 * CD_CYL * d * L


def powered_tether(L, V_bus, P_load, awg_area_mm2, d_tether_mm, extra_g_per_m):
    A = awg_area_mm2 * 1e-6
    R_loop = RES_CU * 2 * L / A
    I = P_load / V_bus  # first-order
    V_drop = I * R_loop
    P_loss = I * I * R_loop
    m_per_m = 2 * A * RHO_CU + extra_g_per_m / 1000.0
    return dict(R_loop_ohm=r(R_loop, 2), I_A=r(I, 2), V_drop_V=r(V_drop, 1),
                loss_W=r(P_loss, 1), loss_pct=r(100 * P_loss / P_load, 1),
                mass_g_per_m=r(m_per_m * 1000, 2), tether_mass_g=r(m_per_m * L * 1000, 1),
                d_mm=d_tether_mm)


def main():
    out = {}
    # ---- A03 powered short tether, drone without battery (~180 g incl. 48->12 V converter)
    m_drone = 0.180  # kg (assumed: 245 g design minus 75 g pack plus 15 g converter)
    A_disc = 4 * math.pi * 0.038 ** 2
    P_h = ideal_hover_power(m_drone, A_disc, RHO) / 0.38
    out["A03_drone_mass_g"] = m_drone * 1000
    out["A03_hover_power_W"] = r(P_h, 1)
    P_load = 75.0  # W budget incl. forward flight + tether pull (assumed)
    cases = {}
    for L in (3, 6, 10):
        for V_bus in (24, 48, 100):
            cases[f"L{L}_V{V_bus}"] = powered_tether(L, V_bus, P_load, 0.05, 1.4, 0.9)
    out["A03_electrical"] = cases
    # aerodynamic tether drag and force on skier at 1.4 mm
    drag = {}
    for L in (3, 6, 10):
        for V in (8, 12, 20):
            for ang, pos in ((45, "rear_high"), (90, "side")):
                drag[f"L{L}_V{V}_{pos}"] = r(tether_drag(L, 1.4e-3, V, ang), 2)
    out["A03_tether_drag_N"] = drag
    # force on skier = tether drag share (~half) + holding tension (assumed 1.5 N) + tether weight share
    def skier_force(L, V, ang):
        mt = powered_tether(L, 48, P_load, 0.05, 1.4, 0.9)["tether_mass_g"] / 1000
        return 0.5 * tether_drag(L, 1.4e-3, V, ang) + 1.5 + 0.5 * mt * G
    out["A03_force_on_skier_N"] = {f"L{L}_V{V}_side": r(skier_force(L, V, 90), 2)
                                   for L in (3, 6, 10) for V in (12, 20)}
    out["A03_yaw_moment_Nm_lever0.3m_L6_V20_side"] = r(skier_force(6, 20, 90) * 0.3, 2)
    # backpack battery endurance
    for E_wh, mass in ((60, 0.40), (100, 0.65)):
        t = E_wh * COLD_CAPACITY / (P_load * 1.08) * 60
        out[f"A03_endurance_min_cold_pack_{E_wh}Wh_{int(mass*1000)}g"] = r(t, 0)
    # skier fall: skier stops in ~1 s from 12 m/s; drone needs ~6-7 m to stop (calc_rotor_follow)
    for L in (3, 6, 10):
        slack_needed = 7.0 - L * 0.0  # drone overshoot relative to anchor
        out[f"A03_fall_overshoot_vs_tether_L{L}"] = "tether shorter than stop distance: reel must pay out or weak link must break" if L < 7 else "within tether if reel free-wheels"
    out["A03_weak_link_N_assumed"] = 15.0
    out["A03_KE_J_at_12"] = r(ke(m_drone, 12), 1)
    # rotor proximity: at L=3 m the rotor disc is ~3 m from head; at L=6 m elevation 45 deg
    out["A03_rotor_to_head_m_L3"] = 3.0
    # ---- A09 unpowered Dyneema leash on battery drone (PROMAX class 192 g)
    for L in (10, 20, 30):
        d = 0.5e-3
        m = 0.20 / 1000 * L  # 0.2 g/m assumed for 0.5 mm UHMWPE braid
        out[f"A09_L{L}"] = {"leash_mass_g": r(m * 1000, 1),
                            "drag_N_V12_side": r(tether_drag(L, d, 12, 90), 2),
                            "drag_N_V20_side": r(tether_drag(L, d, 20, 90), 2),
                            "drag_N_V12_rear45": r(tether_drag(L, d, 12, 45), 2)}
    out["A09_breaking_strength_N_assumed"] = 200.0
    # reel: spring retractor recovering 20 m at 1 m/s
    out["A09_reel_in_time_s_20m_at_1m_s"] = 20.0
    return out


if __name__ == "__main__":
    res = main()
    for k, v in res.items():
        print(k, v)
    print("saved", save("tether.json", res))
