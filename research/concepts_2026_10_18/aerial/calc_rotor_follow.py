"""Free-flying follow rotorcraft (A01 palm baseline, A02 ski-hardened 249 g
track-replay drone, A08 opportunity-shot micro flyer).

Model (order-of-magnitude, not validated):
  hover   P_h = sqrt(T^3/(2 rho A)) / FoM_eff      (FoM_eff includes motor+ESC)
  forward P(V) = P_h*(k_i*(T/W)^1.5*v_i(V)/v_h + (1-k_i)) + 0.5 rho V^3 CdA / eta_p
  v_i from v_i^4 + V^2 v_i^2 = v_h'^4 (Glauert, level flight, tilt ignored for inflow)
  tilt-limited speed: D(V) = W*sqrt((T/W)_max^2 - 1)
Vendor products are calibrated so that the warm, sea-level hover time equals
the vendor flight time; the implied battery energy is printed as a sanity check.
Run: python3 calc_rotor_follow.py
"""
import math
from calc_common import (G, RHO_SL, RHO_CONS, COLD_CAPACITY, ideal_hover_power,
                         induced_velocity_hover, ke, subject_px, vfov_from_hfov,
                         frac_speed_above, save, r)

K_I = 0.7     # induced share of hover power (assumed)
ETA_P = 0.55  # propulsive efficiency for parasite power (assumed)

CLASSES = {
    # name: mass kg, n_rotor, rotor diameter m, FoM_eff, CdA m^2, T/W max,
    #       vendor time min (None -> energy given), energy Wh, src
    "X1_class_125g": dict(m=0.125, n=4, D=0.055, fom=0.30, CdA=0.008, tw=2.0,
                          t_vendor=11.0, E=None, cap_follow=None,
                          src="HoverAir X1 125 g / ~11 min (lit, vendor); geometry assumed"),
    "Neo2_class_151g": dict(m=0.151, n=4, D=0.051, fom=0.30, CdA=0.009, tw=2.0,
                            t_vendor=19.0, E=None, cap_follow=12.0,
                            src="DJI Neo 2 151 g / ~19 min, 12 m/s tracking (lit, retailer spec); geometry assumed"),
    "PROMAX_class_192g": dict(m=0.1925, n=4, D=0.060, fom=0.32, CdA=0.011, tw=2.0,
                              t_vendor=16.0, E=None, cap_follow=42 / 3.6,
                              src="HoverAir X1 PROMAX 192.5 g / 16 min / follow 42 km/h / L5 wind 10.7 m/s (lit, retailer); geometry assumed"),
    "A02_ducted_245g": dict(m=0.245, n=4, D=0.076, fom=0.38, CdA=0.016, tw=2.6,
                            t_vendor=None, E=0.075 * 180.0, cap_follow=None,
                            src="design point (assumed): 75 g pack @180 Wh/kg, ducted 76 mm"),
    "A08_micro_90g": dict(m=0.090, n=4, D=0.045, fom=0.30, CdA=0.006, tw=2.2,
                          t_vendor=None, E=0.020 * 170.0, cap_follow=None,
                          src="design point (assumed): 20 g pack @170 Wh/kg"),
}


def v_induced_forward(vh, V):
    return math.sqrt((-V * V + math.sqrt(V ** 4 + 4 * vh ** 4)) / 2.0)


def analyse(name, c):
    m, A = c["m"], c["n"] * math.pi * (c["D"] / 2) ** 2
    W = m * G
    out = {"name": name, "src": c["src"], "mass_g": m * 1000, "disc_area_m2": r(A, 5),
           "disc_loading_N_m2": r(W / A, 1)}
    P_h_sl = ideal_hover_power(m, A, RHO_SL) / c["fom"]
    if c["t_vendor"]:
        E = P_h_sl * c["t_vendor"] / 60.0
        out["implied_usable_energy_Wh"] = r(E)
        out["implied_battery_mass_g_at_170Whkg"] = r(E / 170 * 1000, 0)
    else:
        E = c["E"] * 0.9  # 90 % usable (assumed)
        out["usable_energy_Wh_warm"] = r(E)
    rho = RHO_CONS
    P_h = ideal_hover_power(m, A, rho) / c["fom"]
    vh = induced_velocity_hover(m, A, rho)
    out["hover_power_W_alt"] = r(P_h, 1)
    out["hover_induced_velocity_m_s"] = r(vh, 1)

    def P(V):
        D = 0.5 * rho * V * V * c["CdA"]
        T = math.hypot(W, D)
        vh_t = vh * math.sqrt(T / W)
        vi = v_induced_forward(vh_t, V)
        return P_h * (K_I * (T / W) ** 1.5 * vi / vh_t + (1 - K_I)) + D * V / ETA_P

    table = {}
    for V in (0, 8, 12, 16, 20):
        p = P(V)
        table[str(V)] = {"power_W": r(p, 1),
                         "time_min_cold_alt": r(E * COLD_CAPACITY / p * 60, 1)}
    out["airspeed_table"] = table
    # tilt-limited max airspeed
    Fh = W * math.sqrt(c["tw"] ** 2 - 1)
    vmax = math.sqrt(2 * Fh / (rho * c["CdA"]))
    out["tilt_limited_max_airspeed_m_s"] = r(vmax, 1)
    out["vendor_follow_cap_m_s"] = r(c["cap_follow"], 1) if c["cap_follow"] else None
    # vendor cap is a ground-speed follow cap; the tilt limit applies to airspeed
    for hw in (0, 5, 8):
        vs = max(0.0, min(c["cap_follow"] or 1e9, vmax - hw))
        out[f"max_skier_speed_headwind_{hw}_m_s"] = r(vs, 1)
        out[f"riding_time_fraction_followable_headwind_{hw}"] = r(1 - frac_speed_above(vs), 2)
    # lateral accel margin at 12 m/s airspeed
    D12 = 0.5 * rho * 144 * c["CdA"]
    a_lat = math.sqrt(max(Fh ** 2 - D12 ** 2, 0)) / m
    out["lateral_accel_available_at_12m_s_m_s2"] = r(a_lat, 1)
    out["skier_carve_lateral_accel_v12_R25_m_s2"] = r(144 / 25, 1)
    # stopping when skier falls (0.3 s detection latency, assumed)
    for V in (12, 16):
        D = 0.5 * rho * V * V * c["CdA"]
        a = (Fh + D) / m
        s = V * 0.3 + V * V / (2 * a)
        out[f"stop_distance_from_{V}_m_s_m"] = r(s, 1)
    # kinetic energy
    out["KE_J_at_12"] = r(ke(m, 12), 1)
    out["KE_J_at_20"] = r(ke(m, 20), 1)
    out["KE_ft_lbf_at_20"] = r(ke(m, 20) / 1.3558, 1)
    # noise: assumed reference 75 dBA @ 1 m for this class, inverse square
    out["noise_dBA_at_5m_assumed"] = r(75 - 20 * math.log10(5), 0)
    # energy per 30 s opportunity shot incl. 20 s launch/land overhead at 12 m/s
    out["Wh_per_30s_shot_plus_20s_overhead"] = r((P(12) * 30 + P_h * 20) / 3600, 2)
    out["shots_per_battery_cold"] = r(E * COLD_CAPACITY / ((P(12) * 30 + P_h * 20) / 3600), 0)
    return out


def viewpoint_table():
    vf = vfov_from_hfov(90.0)
    rows = {}
    for d in (3, 5, 8, 12, 20):
        px, frac = subject_px(d, vf, 2160)
        rows[str(d)] = {"px_4K": r(px, 0), "frame_fraction": r(frac, 2)}
    return {"hfov_deg": 90, "vfov_deg": r(vf, 1), "by_distance_m": rows}


def track_replay():
    """A02: drone retraces the skier's own path dt seconds later, offset dz up."""
    rows = {}
    for v in (5, 8, 12, 16, 20):
        for d in (6, 10):
            dt = d / v
            rows[f"v{v}_d{d}"] = {"lag_s": r(dt, 2)}
    # how far skier path may be from an overhanging branch: offset altitude
    # 3 m above snow on the skier track, skier head ~1.75 m => 1.25 m above head
    # localisation needed: UWB ~0.1-0.3 m (lit typical), GNSS-RTK 0.02-0.05 m
    pos_err = 0.3
    return {"lag_table": rows, "replay_altitude_above_snow_m": 3.0,
            "assumed_rel_position_error_m": pos_err,
            "camera_depression_deg_d6": r(math.degrees(math.atan2(3.0 - 1.0, 6.0)), 1),
            "camera_depression_deg_d10": r(math.degrees(math.atan2(3.0 - 1.0, 10.0)), 1)}


if __name__ == "__main__":
    res = {k: analyse(k, v) for k, v in CLASSES.items()}
    res["viewpoint"] = viewpoint_table()
    res["track_replay"] = track_replay()
    for k, v in res.items():
        print(k, v)
    print("saved", save("rotor_follow.json", res))
