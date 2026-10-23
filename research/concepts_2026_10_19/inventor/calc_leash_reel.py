"""I-05 'aerotow camera' (gravity glider on a slack/low-tension leash with a hip reel) and
I-02 free dorsal perch (glider lands on the moving skier's pack).

Key insight checked here: a glider flying on a leash needs tether tension only equal to its
energy DEFICIT (drag minus gravity contribution), not its weight. On slopes gravity pays,
so tension ~0; on flats/headwind the skier 'aerotows' it with ~W/(L/D) ~ 0.1-0.3 N.
A kite instead needs tether tension comparable to or larger than its weight (round-1: 12-38 N).

Run: python3 calc_leash_reel.py -> results_leash_reel.json
"""
import math
from calc_inv_common import (Glider, G, RHO, SLOPE_MIX, CENTRELINE, speed_bins, ke, v_for_ke,
                             subject_px, px_per_mrad, dump, r)
from calc_slope_glider import g1, BEHIND, UP_SNOW, SUBJ_MID, rng

OUT = {}
HIP = 1.0                       # m, reel/funnel height above snow
LINE_D = 0.17e-3                # m, PE braid #1.0 (ASSUMED ~70 N break, ~0.025 g/m)
LINE_L = 15.0                   # m on spool (30 m spool option)
LINE_CD_N = 1.1                 # normal drag coefficient of a cylinder
REEL_CLUTCH = 3.0               # N, reel slip clutch: pays out above this (ASSUMED)
WEAK_LINK = 15.0                # N, glider-end weak link (ASSUMED)

geom_len = math.hypot(BEHIND, UP_SNOW - HIP)
elev = math.atan2(UP_SNOW - HIP, BEHIND)


def line_drag(V, L=geom_len, mean_sin2=0.25):
    """Drag of the deployed leash; flow mostly along the line -> mean sin^2 of incidence ASSUMED 0.25."""
    q = 0.5 * RHO * V * V
    return LINE_CD_N * LINE_D * L * q * mean_sin2 + 0.01 * math.pi * LINE_D * L * q


def tow_tension(v_skier, theta, wind_head):
    vc = CENTRELINE * v_skier
    va = max(vc + wind_head, 1.25 * g1.v_stall())
    sink = g1.sink(va)
    drop = vc * math.sin(math.radians(theta))
    deficit_W = max(0.0, (sink - drop) * g1.W)          # power the leash must supply
    T_glider = deficit_W / vc                           # along flight path
    T = T_glider + 0.5 * line_drag(va)                  # half the line drag ends at the glider
    return T / math.cos(elev), va                       # tension along a line at elevation elev


tens = []
for th, wt in SLOPE_MIX:
    for v, wv in speed_bins():
        if v < 4 or CENTRELINE * v > v_for_ke(g1.m):
            continue
        for wind, ww in ((-5, 0.25), (0, 0.5), (5, 0.25)):
            T, va = tow_tension(v, th, wind)
            tens.append((T, wt * wv * ww))
tens.sort()
tot = sum(w for _, w in tens)


def pct(p):
    acc = 0
    for T, w in tens:
        acc += w
        if acc >= p * tot:
            return T
    return tens[-1][0]


OUT["tow_tension_N"] = {"p50": r(pct(0.5), 3), "p90": r(pct(0.9), 3), "p99": r(pct(0.99), 3), "max": r(tens[-1][0], 3),
                        "flat_0deg_v10_headwind5": r(tow_tension(10, 0, 5)[0], 3),
                        "glider_weight_N": r(g1.W, 3),
                        "kite_round1_pull_N": "12-38 (aerial/calc_kite.py)",
                        "share_of_time_gravity_alone_wind_mix": r(sum(w for T, w in tens if T < 0.5 * line_drag(12) / math.cos(elev) + 1e-3) / tot, 3)}
OUT["line"] = {
    "deployed_length_m": r(geom_len), "elevation_deg": r(math.degrees(elev), 1),
    "drag_N_at_12ms": r(line_drag(12), 3), "mass_g_15m": r(0.025 * LINE_L, 2),
    "height_at_1m_behind_skier": r(HIP + 1 * math.tan(elev), 2),
    "distance_behind_where_line_above_1.8m": r((1.8 - HIP) / math.tan(elev), 2),
}

# ---------------------------------------------------------------- line visibility in frame
ppm = px_per_mrad()   # px per mrad (90 deg HFOV, 4K)
OUT["line_in_frame"] = {
    "px_width_at_subject_range": r(LINE_D / rng * 1000 * ppm, 3),
    "px_width_at_1m_from_lens": r(LINE_D / 1.0 * 1000 * ppm, 2),
    "note": "line leaves the glider ~5 cm below the lens and runs almost along the line of sight to the hip; "
            "over the subject silhouette it is at 6-8 m range -> <0.1 px (criterion: no artefact >=1 px over subject).",
}

# ---------------------------------------------------------------- start of run: sled-tow + winch launch
# glider dropped from hip funnel, towed on its belly over snow while skier accelerates (a=1.5 m/s2 ASSUMED);
# when skier >=4 m/s the reel pulls in at up to 6 m/s so airspeed = skier + reel speed (no wind).
a_sk, v_lift = 1.5, 1.2 * g1.v_stall()
t_reel = 4.0 / a_sk
reel_v = max(0.0, v_lift - 4.0)
h_target = UP_SNOW
E_climb = g1.m * G * h_target
T_launch = g1.W * 1.6            # launch tension ~1.6 W (ASSUMED, sailplane winch launch 1-2x W)
OUT["start_launch"] = {
    "skier_speed_at_reel_start": 4.0, "t_reel_start_s": r(t_reel, 1), "reel_speed_needed_m_s": r(reel_v, 1),
    "liftoff_airspeed": r(v_lift, 1), "snow_tow_friction_N_mu0.15": r(0.15 * g1.W, 3),
    "climb_energy_J": r(E_climb, 1), "launch_tension_N": r(T_launch, 2),
    "reel_power_W": r(T_launch * reel_v + T_launch * 0, 1),
    "time_to_follow_height_s": r(t_reel + h_target / 2.0, 1),   # ~2 m/s climb under tow (ASSUMED)
    "line_needed_m": r(geom_len + reel_v * 2.5, 1),
}

# ---------------------------------------------------------------- stop: reel-down dock while decelerating
decel = 3.0                      # m/s2 skier hockey stop (ASSUMED 0.3 g)
v0 = 10.0
t_stop = v0 / decel
reel_in = 3.0                    # m/s
t_dock = geom_len / reel_in
v_final_rel = 1.5                # m/s into funnel (reel slows at the end)
OUT["stop_dock"] = {
    "skier_stop_time_s": r(t_stop, 2), "reel_time_s": r(t_dock, 2),
    "glider_overrun_if_no_reel_m": r(BEHIND - 0, 1),
    "funnel_entry_KE_rider_frame_J": r(ke(g1.m, v_final_rel), 3),
    "funnel_force_N_0.15m_stroke": r(g1.m * v_final_rel ** 2 / (2 * 0.15), 2),
    "reel_power_W": r((g1.W * 1.3) * reel_in, 1),
    "fallback_snow_drag_N_mu0.3": r(0.3 * g1.W, 3), "fallback_time_s_10m_at_2ms": 5.0,
    "extra_standstill_s": "0 if docked during deceleration; <=6 s if dragged over snow (auto, no action)",
}

# ---------------------------------------------------------------- hazards
OUT["hazards"] = {
    "rider_frame_KE_if_rider_falls_J": r(ke(g1.m, CENTRELINE * 11), 2),
    "ground_KE_at_KE_cap_J": r(ke(g1.m, v_for_ke(g1.m)), 1),
    "line_contact_force_cap_N": REEL_CLUTCH,
    "line_contact_pressure_MPa_20mm": r(REEL_CLUTCH / (LINE_D * 0.02) / 1e6, 2),
    "snag_force_on_body_N": REEL_CLUTCH,
    "weak_link_glider_N": WEAK_LINK,
    "note": "reel pays out above 3 N, so a crossing skier or a tree branch meets a free-running line, not a "
            "taut one; spool end is tied with a 10 N breakaway so the reel never anchors a snagged line.",
}

# ---------------------------------------------------------------- endurance / battery on body
REEL_E_PER_RUN = 2 * (T_launch * 6 * 3) + (g1.W * 1.3) * reel_in * t_dock * 3   # J (launch + ~3 docks)
OUT["energy"] = {
    "reel_energy_per_run_J": r(REEL_E_PER_RUN, 0),
    "reel_energy_per_day_20runs_Wh": r(REEL_E_PER_RUN * 20 / 3600, 2),
    "glider_filming_min_per_charge": "52 (results_slope_glider.json I-01 energy); quiver contacts top up glider from a 10 Wh hip cell during lift rides",
}

# ---------------------------------------------------------------- masses / volume (ASSUMED)
OUT["budget"] = {
    "glider_g": 125, "reel_motor_clutch_g": 70, "hip_cell_10Wh_g": 60, "funnel_quiver_g": 90, "belt_g": 80,
    "total_worn_g": 125 + 70 + 60 + 90 + 80,
    "quiver_box_L": r(0.46 * 0.095 * 0.06 * 1000, 2), "reel_L": 0.25,
    "packed_L": r(0.46 * 0.095 * 0.06 * 1000 + 0.25, 2),
}

# ---------------------------------------------------------------- I-02 free dorsal perch: skier wake
CDA_SKIER = 0.40   # m2 upright recreational (ASSUMED; tuck ~0.2)


def wake(x):
    ud = 0.7 * CDA_SKIER ** (1 / 3) * x ** (-2 / 3)      # axisymmetric far-wake similarity, const 0.7 ASSUMED
    b = 0.6 * (CDA_SKIER * x) ** (1 / 3) + 0.3          # half width incl. body (ASSUMED)
    return ud, b


wk = {}
for x in (0.5, 1, 2, 3):
    ud, b = wake(x)
    va = 9.35 * (1 - ud)
    wk[f"x{x}m"] = {"deficit_frac": r(min(ud, 1), 2), "half_width_m": r(b, 2), "airspeed_in_wake_m_s": r(va, 1),
                    "below_stall": va < g1.v_stall()}
OUT["I-02 wake"] = wk
OUT["I-02 perch"] = {
    "relative_KE_J_at_1.5ms": r(ke(g1.m, 1.5), 3),
    "perch_must_be_above_head_m": r(wake(1)[1] - 0.3 + 0.3, 2),
    "capture_window_needed_m": "+-0.15 (UWB relative +-0.1, trunk heave +-0.05-0.1, ASSUMED)",
    "DLR_car_landing_accuracy_m": 0.5,
}

if __name__ == "__main__":
    p = dump("results_leash_reel.json", OUT)
    import json
    print(json.dumps(OUT, indent=1))
    print("wrote", p)
