"""A10 lighter-than-air (helium) carriers and A11 fixed-wing follow flyer.
Run: python3 calc_lta_fixedwing.py
"""
import math
from calc_common import G, RHO_ALT, P_ALT, RHO_CONS, COLD_CAPACITY, ke, subject_px, vfov_from_hfov, save, r

R_HE = 2077.0


def helium_sphere(payload_kg, film_kg_m2=0.06, T=263.15):
    rho_he = P_ALT / (R_HE * T)
    net = RHO_ALT - rho_he
    for V10 in range(1, 5000):
        V = V10 / 1000.0
        rad = (3 * V / (4 * math.pi)) ** (1 / 3)
        env = 4 * math.pi * rad ** 2 * film_kg_m2
        if V * net >= payload_kg + env:
            return dict(net_lift_kg_m3=r(net, 3), volume_m3=r(V, 3), diameter_m=r(2 * rad, 2),
                        envelope_g=r(env * 1000, 0), frontal_m2=r(math.pi * rad ** 2, 3), rad=rad)
    return None


def main():
    out = {}
    s = helium_sphere(0.20)
    out["A10_sphere_for_200g_payload"] = {k: v for k, v in s.items() if k != "rad"}
    for V in (5, 12, 20):
        D = 0.5 * RHO_ALT * V * V * 0.47 * s["frontal_m2"]
        out[f"A10_drag_N_V{V}"] = r(D, 1)
    out["A10_helium_cost_note"] = "~0.4 m3 He per fill; cylinders not carriable by a skier (assumed)"
    # lift-assist balloon on a 192 g quad: 30 L
    V = 0.030
    rad = (3 * V / (4 * math.pi)) ** (1 / 3)
    net = (RHO_ALT - P_ALT / (R_HE * 263.15)) * V - 4 * math.pi * rad ** 2 * 0.04
    out["A10_assist_30L_net_lift_g"] = r(net * 1000, 1)
    out["A10_assist_30L_drag_N_V12"] = r(0.5 * RHO_ALT * 144 * 0.47 * math.pi * rad ** 2, 2)
    out["A10_quad_192g_weight_N"] = r(0.1925 * G, 2)

    # ---------- A11 fixed wing follow: 300 g, S 0.12 m2, L/D 7, CLmax 1.1
    m, S, LD, CLmax = 0.30, 0.12, 7.0, 1.1
    W = m * G
    vs = math.sqrt(2 * W / (RHO_CONS * S * CLmax))
    out["A11_stall_m_s"] = r(vs, 1)
    out["A11_min_loiter_speed_m_s"] = r(1.3 * vs, 1)
    for V in (10, 15, 20):
        P = W / LD * V / 0.5
        out[f"A11_cruise_power_W_V{V}"] = r(P, 1)
    E = 0.08 * 180 * 0.9 * COLD_CAPACITY
    out["A11_endurance_min_cold_80g_pack_V12"] = r(E / (W / LD * 12 / 0.5) * 60, 0)
    for bank in (30, 45):
        v = 1.3 * vs
        out[f"A11_loiter_radius_m_bank{bank}"] = r(v * v / (G * math.tan(math.radians(bank))), 1)
    # skier at 12 m/s carving R 25 m: wing must fly a smoothed centreline, offset 15-25 m
    vf = vfov_from_hfov(70)
    for d in (15, 25):
        out[f"A11_subject_px_4K_d{d}_hfov70"] = r(subject_px(d, vf, 2160)[0], 0)
    out["A11_KE_J_at_20"] = r(ke(m, 20), 1)
    out["A11_KE_J_at_25_gust"] = r(ke(m, 25), 1)
    return out


if __name__ == "__main__":
    res = main()
    for k, v in res.items():
        print(k, v)
    print("saved", save("lta_fixedwing.json", res))
