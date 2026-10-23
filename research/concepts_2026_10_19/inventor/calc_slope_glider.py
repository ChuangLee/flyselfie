"""Gravity followers on a ski slope: I-01 free slope glider, I-03 glide+hover tail-sitter,
I-04 ram-air micro-parafoil, I-06 ground-effect skimmer.

Core physics: a follower that stays a fixed height above the snow must lose height at the
terrain drop rate Vc*sin(theta) (Vc = skier centreline speed). A glider at airspeed Va sinks
at Va/(L/D). If Va/(L/D) <= Vc*sin(theta) gravity alone pays for following; the surplus is
dumped by airbrake/weaving. So the slope acts as an unlimited energy source as long as
L/D(Va) >= Va / (Vc sin theta), i.e. ~1/sin(theta) in still air.

Run: python3 calc_slope_glider.py  -> results_slope_glider.json
"""
import math
from calc_inv_common import (Glider, G, RHO, COLD_CAP, RESERVE, SLOPE_MIX, CENTRELINE,
                             speed_bins, ke, v_for_ke, subject_px, frac_speed_above, dump, r)

OUT = {}

# ---------------------------------------------------------------- designs (all ASSUMED)
# I-01 rigid folding-wing glider: 125 g, S 0.06 m2, AR 9 (span 0.73 m, chord 82 mm)
#   mass budget: foam/carbon airframe w/ spring-hinged wings 50 g, 2 micro servos 8 g,
#   FC+GNSS+UWB+radio 15 g, 1S 1000 mAh 3.7 Wh 22 g, 4K gyro-logging cam 16 g
#   (RunCam Thumb Pro class, lit 16 g https://oscarliang.com/runcam-thumb-2), margin 14 g
g1 = Glider(m=0.125, S=0.06, AR=9.0, cd0=0.035, e=0.8, clmax=1.0, name="I-01 rigid")
# I-03 tail-sitter: same wing, 2x 5" props + motors + 2S 6.3 Wh -> 175 g, cd0 incl. folded props
g3 = Glider(m=0.175, S=0.06, AR=9.0, cd0=0.045, e=0.8, clmax=1.0, name="I-03 tailsitter")
# I-04 ram-air parafoil sized for 11 m/s trim at CL 0.55; small parafoil L/D ~3 (ASSUMED)
P4_M, P4_CLTRIM, P4_VTRIM, P4_LD = 0.11, 0.55, 11.0, 3.0
P4_S = 2 * P4_M * G / (RHO * P4_VTRIM ** 2 * P4_CLTRIM)
P4_VRANGE = (0.75 * P4_VTRIM, 1.25 * P4_VTRIM)   # brakes / trim tab (ASSUMED +-25 %)

AIRBRAKE_DCD0 = 0.20   # split-flap/spoiler increment (ASSUMED) -> steep descent capability
AVIONICS_W = 2.9       # cam 1.8 + FC/GNSS/UWB/radio 0.8 + servos 0.3 W (ASSUMED)
BUF_H = 3.0            # usable height buffer: cruise 5.5 m -> min 2.5 m above snow (ASSUMED)

for g in (g1, g3):
    ld_max, v_ldmax = g.best()
    smin, v_smin = g.min_sink()
    OUT[g.name] = {
        "mass_kg": g.m, "S_m2": g.S, "span_m": r(g.span), "chord_m": r(g.chord, 3),
        "wing_loading_N_m2": r(g.W / g.S, 1), "v_stall": r(g.v_stall()),
        "LDmax": r(ld_max), "v_LDmax": r(v_ldmax), "min_sink": r(smin), "v_min_sink": r(v_smin),
        "LD_at": {str(v): r(g.ld(v)) for v in (6, 8, 10, 12, 14, 16)},
        "LD_airbrake_at_12": r(g.ld(12, dcd0=AIRBRAKE_DCD0)),
        "Re_at_12": int(g.re(12)),
        "v_max_KE_14.9J": r(v_for_ke(g.m)),
    }


def follow_state(g, v_skier, theta_deg, wind_head=0.0, vmin_factor=1.25):
    """Classify one (speed, slope, wind) cell for a rigid glider."""
    vc = CENTRELINE * v_skier
    drop = vc * math.sin(math.radians(theta_deg))
    vmax_ground = v_for_ke(g.m)
    if v_skier < 4.0:
        return "stopped", 0
    if vc > vmax_ground:
        return "lag_KE", 0
    va = max(vc + wind_head, vmin_factor * g.v_stall())   # weave if centreline too slow
    s = g.sink(va)
    if s <= drop:
        return "follow", drop - s
    # deficit: how far can the height buffer carry it?
    dist = BUF_H / (s - drop) * vc
    return ("deficit_short" if dist > 150 else "deficit"), dist


def mix_fractions(g, wind_head=0.0):
    acc = {}
    for th, wt in SLOPE_MIX:
        for v, wv in speed_bins():
            st, _ = follow_state(g, v, th, wind_head)
            acc[st] = acc.get(st, 0) + wt * wv
    tot = sum(acc.values())
    return {k: r(v / tot, 3) for k, v in sorted(acc.items())}


def min_slope_deg(g, v_skier, wind_head=0.0):
    vc = CENTRELINE * v_skier
    va = max(vc + wind_head, 1.25 * g.v_stall())
    s = g.sink(va)
    x = s / vc
    return 90.0 if x >= 1 else math.degrees(math.asin(x))


for g in (g1, g3):
    d = OUT[g.name]
    d["min_slope_deg_for_gravity_follow"] = {
        f"v{v}_wind{w:+d}": r(min_slope_deg(g, v, w), 1) for v in (8, 11, 14) for w in (-5, 0, 5)}
    d["time_fractions_wind0"] = mix_fractions(g, 0)
    d["time_fractions_headwind5"] = mix_fractions(g, 5)
    d["time_fractions_tailwind5"] = mix_fractions(g, -5)
    # steepest slope where surplus can be dumped by airbrake at same airspeed
    d["max_slope_deg_airbrake_no_weave_v11"] = r(math.degrees(math.asin(min(1, 1 / g.ld(CENTRELINE * 11, dcd0=AIRBRAKE_DCD0)))), 1)
    d["deficit_buffer_distance_m_4deg_v9"] = r(follow_state(g, 9, 4)[1], 0)
    d["deficit_buffer_distance_m_8deg_v9"] = r(follow_state(g, 9, 8)[1], 0)

# --------------------------------------------------------------- footage geometry
BEHIND, UP_SNOW, SUBJ_MID = 7.0, 4.5, 1.0
rng = math.hypot(BEHIND, UP_SNOW - SUBJ_MID)
OUT["view"] = {
    "behind_m": BEHIND, "height_above_snow_m": UP_SNOW, "range_m": r(rng),
    "elevation_deg": r(math.degrees(math.atan2(UP_SNOW - SUBJ_MID, BEHIND)), 1),
    "px_4K_hfov90_at_range": int(subject_px(rng)), "px_at_10m": int(subject_px(10)),
    "px_at_14m": int(subject_px(14)), "range_for_300px_m": r(2160 * 1.75 / 300 / (2 * math.tan(math.atan(math.tan(math.radians(45)) * 2160 / 3840))), 1),
}


# --------------------------------------------------------------- gust-induced jitter
def vk_w(Om, sig, L):
    a = 1.339 * L * Om
    return sig ** 2 * L / math.pi * (1 + 8 / 3 * a * a) / (1 + a * a) ** (11 / 6)


def gust_jitter(g, V, wind10, d, z=5.0, z0=0.001, fc_hp=1.0):
    """Background LOS-rate RMS (deg/s, >1 Hz) caused by the follower heaving/swaying with
    turbulence. Heave follows gust velocity with 1st-order lag tau=m/(0.5 rho V S CLa)."""
    ustar = 0.4 * wind10 / math.log(10 / z0)
    sig_w, sig_v = 1.25 * ustar, 1.9 * ustar           # surface-layer ratios (lit, Panofsky&Dutton)
    L = z                                               # near-surface integral scale ~ z (assumed)
    tau = g.m / (0.5 * RHO * V * g.S * g.cla)
    fcut = 1 / (2 * math.pi * tau)
    tot = 0.0
    for sig, resp in ((sig_w, 1.0), (sig_v, 0.6)):      # lateral: weathervane/sideforce (assumed 0.6)
        f = fc_hp
        df = 0.01
        var = 0.0
        while f < 30:
            Om = 2 * math.pi * f / V
            S_f = vk_w(Om, sig, L) * 2 * math.pi / V    # convert per rad/m to per Hz (one-sided x2 folded)
            h = 1 / (1 + (f / fcut) ** 2)
            var += 2 * S_f * h * resp ** 2 * df
            f += df
        tot += var
    return math.degrees(math.sqrt(tot) / d), ustar, fcut


OUT["gust_jitter_deg_s"] = {}
for g in (g1, g3):
    for w10 in (3, 6, 9):
        j, us, fcut = gust_jitter(g, 11 * CENTRELINE, w10, rng)
        OUT["gust_jitter_deg_s"][f"{g.name}_wind{w10}"] = {"jitter_bg": r(j), "ustar": r(us), "heave_bandwidth_Hz": r(fcut)}
OUT["gust_jitter_note"] = ("background LOS rate from follower translation only; add round-3 ideal-chase subject term "
                           "0.1-0.3 deg/s carving, 1.6-3.0 deg/s short turns in quadrature (docs/20 s6.2). ASSUMED turbulence model.")

# --------------------------------------------------------------- energy / endurance
bat1 = 3.7 * COLD_CAP * RESERVE
OUT["I-01 energy"] = {
    "avionics_W": AVIONICS_W, "battery_Wh": 3.7, "usable_cold_Wh": r(bat1),
    "filming_min_per_charge": r(bat1 / AVIONICS_W * 60, 0),
    "gravity_power_available_W_at_11ms_16deg": r(g1.m * G * CENTRELINE * 11 * math.sin(math.radians(16)), 1),
    "aero_power_needed_W_at_9.35ms": r(g1.m * G * g1.sink(CENTRELINE * 11), 2),
    "quad_follow_power_W_ref": "30-40 W for 150 g quad at 12 m/s (round-1 calc_rotor_follow.py)",
}
# stop: overfly & land ahead
glide_dist_brake = (UP_SNOW) * g1.ld(1.3 * g1.v_stall(), dcd0=AIRBRAKE_DCD0)
OUT["I-01 stop"] = {
    "touchdown_v_flare": r(1.1 * g1.v_stall()), "touchdown_KE_J": r(ke(g1.m, 1.1 * g1.v_stall())),
    "deep_stall_descent_v": r(math.sqrt(2 * g1.W / (RHO * g1.S * 1.2))),
    "landing_point_past_skier_m": r(glide_dist_brake - BEHIND, 1),
    "frac_time_skier_faster_than_KE_cap": r(frac_speed_above(v_for_ke(g1.m) / CENTRELINE), 3),
}

# --------------------------------------------------------------- I-03 hover budget
props_A = 2 * math.pi * 0.0635 ** 2
P_ideal = math.sqrt((g3.W) ** 3 / (2 * RHO * props_A))
P_hover = P_ideal / 0.55 / 0.75 + AVIONICS_W                  # FM 0.55, motor+ESC 0.75 (assumed)
run_s, stops, hover_s, climb_s = 240, 2, 30, 10                # per run (ASSUMED)
E_run = run_s * (AVIONICS_W + 0.5) + stops * (hover_s + climb_s) * P_hover   # +0.5 W extra servo/transition
bat3 = 6.3 * COLD_CAP * RESERVE * 3600
film_per_run_min = (run_s + stops * hover_s) / 60
OUT["I-03 hover"] = {
    "P_hover_W": r(P_hover, 1), "E_per_run_Wh": r(E_run / 3600, 2), "runs_per_charge": r(bat3 / E_run, 1),
    "filming_min_per_charge": r(bat3 / E_run * film_per_run_min, 0),
    "pure_hover_quad_equiv_min": r(bat3 / P_hover / 60, 1),
    "v_max_KE": r(v_for_ke(g3.m)), "frac_time_skier_faster_than_KE_cap": r(frac_speed_above(v_for_ke(g3.m) / CENTRELINE), 3),
}

# --------------------------------------------------------------- I-04 parafoil
acc = {}
for th, wt in SLOPE_MIX:
    for v, wv in speed_bins():
        vc = CENTRELINE * v
        if v < 4:
            st = "stopped"
        elif vc > P4_VRANGE[1]:
            st = "lag_speed_or_KE"
        else:
            va = max(vc, P4_VRANGE[0])
            st = "follow" if va / P4_LD <= vc * math.sin(math.radians(th)) else "deficit"
        acc[st] = acc.get(st, 0) + wt * wv
OUT["I-04 parafoil"] = {
    "canopy_S_m2": r(P4_S, 3), "canopy_span_m_AR3": r(math.sqrt(P4_S * 3), 2), "LD_assumed": P4_LD,
    "speed_window_m_s": [r(x, 1) for x in P4_VRANGE], "min_slope_deg_still_air": r(math.degrees(math.asin(1 / P4_LD)), 1),
    "time_fractions": {k: r(v, 3) for k, v in acc.items()},
    "KE_at_vmax_J": r(ke(P4_M, P4_VRANGE[1]), 1),
}

# --------------------------------------------------------------- I-06 ground effect
def phi(h, b):
    x = 16 * h / b
    return x * x / (1 + x * x)


ge = {}
for h in (0.1, 0.2, 0.4, 0.8):
    ld0, ldge = g1.ld(10), g1.ld(10, ground_k=phi(h, g1.span))
    ge[f"h{h}"] = {"phi": r(phi(h, g1.span), 3), "LD_free": r(ld0), "LD_ground": r(ldge), "gain_pct": r(100 * (ldge / ld0 - 1), 1)}
OUT["I-06 ground_effect_v10"] = ge

if __name__ == "__main__":
    p = dump("results_slope_glider.json", OUT)
    import json
    print(json.dumps(OUT, indent=1))
    print("wrote", p)
