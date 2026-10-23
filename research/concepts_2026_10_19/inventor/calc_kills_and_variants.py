"""Magnitude checks for the remaining concepts (mostly kills) and the I-03 land-and-wait variant.

I-03b tail-sitter that lands upright in the snow at stops instead of hovering
I-07 unpowered self-steering snow pod follower
I-08 supercapacitor sprint micro-quad recharged on the lift
I-09 ionic-wind (EAD) silent follower
I-10 leapfrog lander + pole 'ring-tilt' snatch pickup
I-11 slope-soaring / katabatic station keeping at stops
I-12 chairlift-drop height bank
I-13 shadow cam (helmet camera films own shadow)
I-14 silicon-anode (450 Wh/kg) follow quad - cross-industry battery check

Run: python3 calc_kills_and_variants.py -> results_kills.json
"""
import math
from calc_inv_common import G, RHO, COLD_CAP, RESERVE, ke, v_for_ke, subject_px, dump, r
from calc_slope_glider import g1, g3, AVIONICS_W, P_hover

OUT = {}

# I-03b ------------------------------------------------------------------------------
for bat_wh, extra_g in ((6.3, 0), (7.4, 7)):
    run_s, climbs, climb_s = 240, 3, 10        # 2 mid-run stops + start (ASSUMED)
    E = run_s * (AVIONICS_W + 0.5) + climbs * climb_s * P_hover
    usable = bat_wh * COLD_CAP * RESERVE * 3600
    OUT[f"I-03b land_and_wait_{bat_wh}Wh"] = {
        "mass_kg": round(g3.m + extra_g / 1000, 3), "E_run_Wh": r(E / 3600, 3), "runs": r(usable / E, 1),
        "filming_min": r(usable / E * run_s / 60, 0), "v_KE_cap": r(v_for_ke(g3.m + extra_g / 1000), 1)}
# tip-over check for an upright tail-sitter on snow: wind moment vs restoring
S_side, h_cp, base = 0.06, 0.18, 0.06          # side area ~ wing planform when standing edge-on? use fin+fuselage 0.02 m2
for w in (5, 8, 10):
    F = 0.5 * RHO * w * w * 0.02 * 1.2
    OUT.setdefault("I-03b tipover", {})[f"wind{w}"] = {"overturn_Nm": r(F * h_cp, 3), "restoring_Nm_tail_sunk": r(g3.m * G * base, 3)}

# I-07 snow pod --------------------------------------------------------------------------
OUT["I-07 snow_pod"] = {
    "max_mass_kg_for_14.9J_at_12": r(2 * 14.9 / 144, 3), "at_15": r(2 * 14.9 / 225, 3),
    "accel_free_slide_20deg_mu0.05_m_s2": r(G * (math.sin(math.radians(20)) - 0.05 * math.cos(math.radians(20))), 2),
    "mogul_vertical_accel_g_v10_R2m": r(100 / 2 / G, 1),
    "camera_height_m": 0.3, "verdict_physics": "pod goes airborne on every mogul (5 g crest) and sits in other skiers' ski paths",
}

# I-08 supercap quad ---------------------------------------------------------------------
P_follow, t_shot = 30.0, 60.0                  # W, s (round-1 rotor follow 30-40 W)
E = P_follow * t_shot
sc_whkg = 5.4 * 0.75                           # lit 5.4 Wh/kg (Maxwell 3V 50F), 75 % usable down to V/2
OUT["I-08 supercap"] = {"E_shot_Wh": r(E / 3600, 3), "supercap_mass_g": r(E / 3600 / sc_whkg * 1000, 0),
                        "liion_mass_g_equiv": r(E / 3600 / (150 * COLD_CAP) * 1000, 1),
                        "glider_run_supercap_g": r(AVIONICS_W * 240 / 3600 / sc_whkg * 1000, 0)}

# I-09 ion wind ----------------------------------------------------------------------------
T_need = g1.W / g1.ld(10)
for tp in (5.0, 8.9):
    OUT.setdefault("I-09 ion", {})[f"T_per_kW_{tp}"] = {"thrust_N": r(T_need, 3), "power_W": r(T_need / tp * 1000, 1),
                                                         "battery_g_45min": r(T_need / tp * 1000 * 0.75 / (150 * COLD_CAP) * 1000, 0)}
OUT["I-09 ion"]["electrode_len_m_at_0.22N_per_m"] = r(T_need / 0.22, 2)
OUT["I-09 ion"]["prop_power_W"] = r(T_need * 10 / 0.5, 1)
OUT["I-09 ion"]["gravity_glider_thrust_needed_on_slopes"] = 0.0

# I-10 leapfrog ring-tilt --------------------------------------------------------------------
v_cap = v_for_ke(g1.m)
lead = 40.0
OUT["I-10 leapfrog"] = {
    "time_to_get_40m_ahead_s": r(lead / (v_cap - 0.85 * 11), 1),
    "px_at_30m": int(subject_px(30)), "px_at_10m": int(subject_px(10)),
    "snatch_force_avg_N_v5_stroke0.5": r(g1.m * 25 / (2 * 0.5), 2),
    "hit_prob_window_0.125_sigma_0.10": r(math.erf(0.125 / (0.10 * math.sqrt(2))), 2),
    "hit_prob_window_0.125_sigma_0.15": r(math.erf(0.125 / (0.15 * math.sqrt(2))), 2),
    "miss_cost": "stop + side-step uphill 5-15 m (~30-60 s)",
}

# I-11 slope soaring -------------------------------------------------------------------------
smin, vms = g1.min_sink()
OUT["I-11 soaring"] = {
    "glider_min_airspeed_m_s": r(1.25 * g1.v_stall(), 1), "min_sink_m_s": r(smin, 2),
    "upslope_wind_needed_m_s_20deg": r(smin * 1.15 / math.sin(math.radians(20)), 2),
    "katabatic_typical_m_s": "2-4 DOWNslope over cooled snow (AMS glossary; EGU22-6441)",
    "verdict_physics": "downslope drainage gives sink, not lift; ridge lift needs >=1.8 m/s upslope component plus convex terrain; opportunistic only",
}

# I-12 chair drop ----------------------------------------------------------------------------
OUT["I-12 chairdrop"] = {"height_m": "5-15", "extra_energy_J_per_10m": r(g1.m * G * 10, 1),
                         "legal": "throwing/expelling objects from a lift prohibited (Colorado C.R.S. 33-44-105)"}

# I-13 shadow cam ----------------------------------------------------------------------------
lat = 46.0
for month, decl in (("Dec", -23.4), ("Feb", -13.0), ("Mar", -2.0)):
    noon = 90 - lat + decl
    OUT.setdefault("I-13 shadow", {})[month] = {"noon_sun_elev": r(noon, 1),
                                                 "shadow_len_m": r(1.75 / math.tan(math.radians(noon)), 1)}
OUT["I-13 shadow"]["note"] = "silhouette only; visible to helmet cam only when the sun is behind (~1/3 of headings on a given slope aspect)"

# I-14 silicon-anode quad ----------------------------------------------------------------------
A = 4 * math.pi * 0.038 ** 2
m = 0.249
P = math.sqrt((m * G) ** 3 / (2 * RHO * A)) / 0.55 / 0.75 + 3
need = P * 0.75
cell = 450 * 0.85 * COLD_CAP * RESERVE
OUT["I-14 si_quad"] = {"P_W": r(P, 1), "battery_Wh_45min": r(need, 1), "battery_g": r(need / cell * 1000, 0),
                       "KE_at_12_J": r(ke(m, 12), 1), "v_KE_cap": r(v_for_ke(m), 1),
                       "cell_ref": "Amprius SiCore 450 Wh/kg (2025), no cold data published"}

if __name__ == "__main__":
    p = dump("results_kills.json", OUT)
    import json
    print(json.dumps(OUT, indent=1))
    print("wrote", p)
