"""Assemble concepts.json from the calc_* results so every number is traceable.
Run order: calc_rotor_follow.py, calc_tether.py, calc_kite.py, calc_lta_fixedwing.py, build_concepts.py
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
for s in ("calc_rotor_follow.py", "calc_tether.py", "calc_kite.py", "calc_lta_fixedwing.py"):
    subprocess.run([sys.executable, os.path.join(HERE, s)], check=True, stdout=subprocess.DEVNULL, cwd=HERE)


def load(n):
    with open(os.path.join(HERE, "results", n), encoding="utf-8") as f:
        return json.load(f)


RF, TE, KI, LF = load("rotor_follow.json"), load("tether.json"), load("kite.json"), load("lta_fixedwing.json")


def kn(value, unit, source, ref):
    return {"value": value, "unit": unit, "source": source, "ref": ref}


def sc(score, why):
    return {"score": score, "why": why}


# ---- shared prior art
PA = {
    "hover": {"name": "HOVERAir X1 PRO/PROMAX specs (vendor)", "url": "https://hoverair.com/pages/x1-pro-and-promax",
              "relevance": "palm follow drone: 192.5 g, ~16 min, follow 42 km/h, flight temp -10..45 C"},
    "hover_winter": {"name": "HOVERAir winter sports page + FAQ", "url": "https://us.hoverair.com/pages/winter-sports",
                     "relevance": "ski mode, cold battery claim, admits retrieval of drone lost in snow may require hiking"},
    "hover_review": {"name": "Space.com HoverAir X1 PROMAX review", "url": "https://www.space.com/technology/hoverair-x1-promax-drone-review",
                     "relevance": "independent note that flight time is close to 16 min"},
    "neo2": {"name": "DJI Neo 2 specs", "url": "https://www.dji.com/ch/neo-2/specs",
             "relevance": "151 g, ~19 min, tracking 12 m/s, vision sensing <=8 m/s"},
    "neo2_um": {"name": "DJI Neo 2 user manual v1.2", "url": "https://dl.djicdn.com/downloads/DJI_Neo_2/UM/20251210/DJI_Neo_2_User_Manual_v1.2_en.pdf",
                "relevance": "gesture control limited with thick gloves; snow-field limits for QuickShots"},
    "vail": {"name": "Vail Resorts drone policy", "url": "https://www.vail.com/the-mountain/about-the-mountain/safety/drones.aspx",
             "relevance": "public/recreational drone use banned over resort land, incl. launches from outside; pass revocation"},
    "heavenly": {"name": "Heavenly drone policy", "url": "https://www.skiheavenly.com/the-mountain/about-the-mountain/safety/drones/drone-policy",
                 "relevance": "drones prohibited except written permission for licensed commercial use"},
    "skiutah": {"name": "Ski Utah resort drone policies", "url": "https://www.skiutah.com/blog/utah-resort-drone-policies",
                "relevance": "Alta etc. require prior written authorisation"},
    "easa": {"name": "EASA open category A1 / C0 summary (Norwegian CAA table)", "url": "https://caa.no/globalassets/dokumenter/dronedokumenter/nytt-eu-regelverk/drone--easa-tabell-2023_engelsk.pdf",
             "relevance": "<250 g / C0: A1, no flight over assemblies of people, VLOS, 120 m; national wording may say avoid uninvolved persons"},
    "faa": {"name": "FAA AIM ch.11 sec.2 small UAS (49 USC 44809)", "url": "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap11_section_2.html",
            "relevance": "recreational flight requires VLOS of operator or co-located observer; autonomous follow of yourself downhill strains VLOS"},
    "cfr101": {"name": "14 CFR Part 101 (moored balloons, kites) - not fetched this round", "url": "https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-101",
               "relevance": "kite rules apply to kites >5 lb; small passive kites largely outside; motorised tethered craft are likely UAS (unverified)"},
    "elistair": {"name": "Elistair tethered power (CORDIS project)", "url": "https://cordis.europa.eu/project/id/673601",
                 "relevance": "power-over-tether exists for enterprise drones (10-27 g/m tethers, 20 kg ground stations); no consumer wearable version found"},
    "cmu": {"name": "CMU autonomous drone cinematographer (Bonatti et al. 2018)", "url": "https://publications.ri.cmu.edu/autonomous-drone-cinematographer-using-artistic-principles-to-create-smooth-safe-occlusion-free-trajectories-for-aerial-filming",
            "relevance": "occlusion-aware shot planning; basis for track-replay and highlight scripting"},
    "fold": {"name": "Foldable Drone (Falanga et al.)", "url": "https://rpg.ifi.uzh.ch/docs/RAL18_Falanga.pdf",
             "relevance": "folding mechanism ~11 % mass; not crash tolerant"},
    "simkite": {"name": "FlySkiSelfie sim/README.md launch-boom kite concept (internal)", "url": "sim/README.md",
                "relevance": "existing point-mass kite model and invalid scenarios (low airspeed, retrieval into head volume)"},
    "autogyro": {"name": "Coaxial vs single autogiro rotor lift/drag (KMUTT)", "url": "https://ph02.tci-thaijo.org/index.php/KMUTT/article/view/3240",
                 "relevance": "measured autorotating rotor coefficients; no tethered rotor-kite camera data found"},
    "glasgow": {"name": "Autogyro rotor aerodynamics thesis (Glasgow 2018)", "url": "https://theses.gla.ac.uk/39052/1/2018ShahPhD.pdf",
                "relevance": "background for resultant force coefficients of autorotating rotors"},
}

R = RF
c = []

# ------------------------------------------------------------------ A01
p = R["PROMAX_class_192g"]
c.append({
    "id": "A01", "name_zh": "掌上自主跟拍无人机（现成品基线）", "name_en": "Palm follow drone baseline (HoverAir X1 PROMAX / Neo 2 class)",
    "lens": "aerial",
    "one_liner": "Buy-today 150-195 g follow drone carried in a chest/shoulder holster; the bar every other aerial concept must beat.",
    "principle": "Battery quadrotor, vision-based subject tracking, palm launch/land at stops.",
    "architecture": {"carrier": "free-flying quadrotor 150-195 g, guarded props", "support": "rotor thrust",
                     "energy": f"onboard Li-ion ~{p['implied_usable_energy_Wh']} Wh (implied by vendor time)",
                     "sensing": "camera vision tracking (+ limited obstacle sensing)", "imaging": "4K-8K single lens, EIS or 1-axis gimbal",
                     "use_flow": "stop -> glove off/partial -> palm launch -> select mode -> ski -> stop -> palm catch -> stow"},
    "viewpoints": [{"azimuth": "rear", "elevation_deg": 15, "distance_m": 6, "notes": "default follow"},
                   {"azimuth": "side", "elevation_deg": 10, "distance_m": 5, "notes": "vendor side mode, obstacle-blind on the far side"},
                   {"azimuth": "front (reverse)", "elevation_deg": 10, "distance_m": 5, "notes": "rear obstacle sensing only in limited modes 1.5-3 m/s (doc 18)"}],
    "key_numbers": {
        "mass": kn(192.5, "g", "lit", "hover"),
        "vendor_follow_cap": kn(p["vendor_follow_cap_m_s"], "m/s", "lit", "hover / neo2 (12 m/s)"),
        "riding_time_followable_under_cap": kn(p["riding_time_fraction_followable_headwind_0"], "fraction", "calc", "speed ~N(11,3.5) assumed; calc_rotor_follow.py"),
        "hover_power_2000m": kn(p["hover_power_W_alt"], "W", "calc", "calibrated to vendor time"),
        "flight_time_cold_alt_12ms": kn(p["airspeed_table"]["12"]["time_min_cold_alt"], "min", "calc", "75 % capacity at -10 C assumed"),
        "tilt_limited_airspeed": kn(p["tilt_limited_max_airspeed_m_s"], "m/s", "calc", "T/W=2 assumed; shows cap is perception, not thrust"),
        "subject_px_4K_at_6m_hfov90": kn(560, "px", "calc", "subject_px(); 26 % of frame height"),
        "KE_at_12": kn(p["KE_J_at_12"], "J", "calc", ""),
        "KE_at_20": kn(p["KE_J_at_20"], "J", "calc", "FAA Cat 2 threshold 11 ft-lbf = 14.9 J for comparison"),
        "stop_distance_if_skier_falls_12ms": kn(p["stop_distance_from_12_m_s_m"], "m", "calc", "0.3 s latency"),
        "noise_at_5m": kn(p["noise_dBA_at_5m_assumed"], "dBA", "assumed", "75 dBA@1 m placeholder, not measured"),
    },
    "scores": {
        "footage": sc(3, "Good external rear/side views at 4-8 m, but vendor follow cap ~12 m/s covers ~60 % of riding time; vision loss in flat light, spray, trees."),
        "interference": sc(5, "Nothing on the body during flight; ~0.2 kg in a pocket."),
        "convenience": sc(3, "~9 min per cold battery at 12 m/s; stop to launch/catch; glove gestures unreliable; snow landings need retrieval."),
        "safety": sc(3, "Light (14 J @12 m/s) but props near people; unaware of other skiers behind the subject."),
        "simplicity": sc(4, "Product exists; zero new hardware."),
    },
    "bold_hypothesis": "A ski-specific holster + workflow alone makes today's palm drones good enough, so new hardware is unjustified.",
    "falsification_test": "10 runs on a permitted slope at 8, 12, 15 m/s with GoPro-on-helmet ground truth: measure % time subject fully in frame and number of lost-track events; kill hypothesis if >20 % runs lose track or <60 % frame-in at 12 m/s.",
    "kill_criteria": ["Usable continuous footage <60 % of run at 12 m/s", "Launch+catch overhead >30 s with gloves", "Resort policy forbids use at target venues (already true at Vail Resorts properties)"],
    "sim_plan": {"what_to_model": "6-DoF-lite quad (point mass + attitude first-order lag, thrust/tilt limit, drag), vision tracker with FOV, latency, dropout probability vs contrast/occlusion, follow-speed cap",
                 "states": ["drone pos/vel", "attitude", "battery SoC (temperature)", "tracker state (locked/lost/reacquire)", "skier pos/vel"],
                 "scenarios": ["straight run 8-20 m/s", "carved turns R=15-30 m", "gusty headwind 8 m/s", "skier fall (12 m/s -> 0 in 1 s)", "tree-line edge run", "flat light / spray contrast loss", "battery cold sag"],
                 "metrics": ["% frames subject fully in frame", "subject px height", "angular jitter deg RMS", "lost-track events/min", "min distance to skier/bystanders/trees", "flight minutes per battery"]},
    "prior_art": [PA["hover"], PA["hover_winter"], PA["hover_review"], PA["neo2"], PA["neo2_um"], PA["vail"], PA["easa"], PA["faa"]],
})

# ------------------------------------------------------------------ A02
p = R["A02_ducted_245g"]; tr = R["track_replay"]
c.append({
    "id": "A02", "name_zh": "轨迹复现跟拍机（≤249 g 涵道+可穿戴信标）", "name_en": "Track-replay follow drone: <=249 g ducted + wearable UWB/GNSS beacon",
    "lens": "aerial",
    "one_liner": "Drone flies the skier's own just-skied path 0.3-2 s later at 3 m above snow, located by a wearable beacon instead of vision, so obstacles at skier height are cleared by construction.",
    "principle": "The skier's trajectory is a recently-verified free corridor; replaying it with a time lag dt=d/v plus altitude offset gives a rear-elevated shot without needing general obstacle avoidance. Relative position from UWB ranging + RTK-GNSS/IMU fusion; vision only for framing.",
    "architecture": {"carrier": "245 g ducted quad (4x76 mm), ducts = prop guards", "support": "rotor thrust",
                     "energy": f"75 g pack ~{p['usable_energy_Wh_warm']} Wh usable warm", "sensing": "UWB anchor in backpack + IMU/GNSS beacon (~30 g), downward ToF, forward camera",
                     "imaging": "4K 1/1.3in on 1-axis gimbal + EIS; horizon-locked", "use_flow": "pull from shoulder dock (magnetic) -> throw-up launch -> auto-replay follow -> at stop hovers 3 m away -> 'come home' button on strap -> lands into raised palm or on snow next to skier"},
    "viewpoints": [{"azimuth": "rear (on track)", "elevation_deg": tr["camera_depression_deg_d6"], "distance_m": 6, "notes": "default replay"},
                   {"azimuth": "rear", "elevation_deg": tr["camera_depression_deg_d10"], "distance_m": 10, "notes": "wide, more environment"},
                   {"azimuth": "rear-quarter", "elevation_deg": 20, "distance_m": 6, "notes": "lateral offset <=2 m from track only where snow surface is open (beacon map)"}],
    "key_numbers": {
        "mass": kn(245, "g", "assumed", "design point under 250 g (EASA C0/A1)"),
        "hover_power_2000m": kn(p["hover_power_W_alt"], "W", "calc", "calc_rotor_follow.py"),
        "flight_time_cold_alt_12ms": kn(p["airspeed_table"]["12"]["time_min_cold_alt"], "min", "calc", ""),
        "flight_time_cold_alt_16ms": kn(p["airspeed_table"]["16"]["time_min_cold_alt"], "min", "calc", ""),
        "tilt_limited_airspeed": kn(p["tilt_limited_max_airspeed_m_s"], "m/s", "calc", "T/W 2.6 assumed"),
        "max_skier_speed_with_8ms_headwind": kn(p["max_skier_speed_headwind_8_m_s"], "m/s", "calc", ""),
        "replay_lag_12ms_6m": kn(tr["lag_table"]["v12_d6"]["lag_s"], "s", "calc", "dt = d/v"),
        "replay_lag_5ms_10m": kn(tr["lag_table"]["v5_d10"]["lag_s"], "s", "calc", "slow skier -> long lag, use shorter d"),
        "rel_position_error": kn(tr["assumed_rel_position_error_m"], "m", "assumed", "UWB typical 0.1-0.3 m"),
        "lateral_accel_margin_at_12": kn(p["lateral_accel_available_at_12m_s_m_s2"], "m/s2", "calc", f"vs skier carve {p['skier_carve_lateral_accel_v12_R25_m_s2']} m/s2"),
        "subject_px_4K_d6": kn(560, "px", "calc", "26 % of frame (hfov 90)"),
        "KE_at_20": kn(p["KE_J_at_20"], "J", "calc", ""),
        "stop_distance_if_skier_falls_12ms": kn(p["stop_distance_from_12_m_s_m"], "m", "calc", "must stop above, not onto, a fallen skier: replay altitude 3 m keeps 1.5-2 m vertical clearance"),
    },
    "scores": {
        "footage": sc(4, "Follows 5-20 m/s with physics margin; corridor logic keeps it tracking through tree-lined pistes where vision followers drop; view is mostly rear (side views limited)."),
        "interference": sc(4, "~30 g beacon + dock on strap; no forces during flight."),
        "convenience": sc(3, "~8 min at 12 m/s cold -> 2-3 runs per battery; needs stop to launch; button recall glove-friendly."),
        "safety": sc(3, "Ducted props; 49 J at 20 m/s; corridor replay avoids static obstacles but not other skiers entering the track; resort bans."),
        "simplicity": sc(2, "New airframe + beacon fusion + replay planner; failure modes: beacon dropout, GNSS multipath under trees, overhanging branches."),
    },
    "bold_hypothesis": "Following the skier's own track (time-shifted) removes >80 % of the obstacle-avoidance problem, which is the real reason vendors cap follow speed at ~12 m/s.",
    "falsification_test": "Log skier GNSS/UWB tracks on 20 tree-lined runs; replay virtually at 3 m altitude with 0.3 m noise against a LiDAR/photogrammetry tree map; count corridor violations (branch within 1 m). Then fly real replay on an empty, permitted slope at 12-16 m/s and compare lost-frame % to A01.",
    "kill_criteria": ["Corridor violations >1 per 10 runs in mapped glades", "UWB/GNSS relative error >0.5 m at 95 % in trees", "Cannot stay <=249 g with ducts + gimbal + 20 min-class battery", "No legal venue for the target user (resort bans + VLOS)"],
    "sim_plan": {"what_to_model": "quad dynamics with tilt/thrust limits, beacon measurement noise/dropout, track buffer & lag controller, trees/overhangs as obstacles, second skier crossing the track",
                 "states": ["skier path buffer", "drone pos/vel/attitude", "lag dt", "estimator covariance", "battery SoC"],
                 "scenarios": ["glade run with overhangs", "tight slalom R=10 m", "skier stops abruptly / falls", "headwind gust 8 m/s at 16 m/s", "beacon dropout 2 s", "other skier enters corridor", "slow traverse 3-5 m/s"],
                 "metrics": ["min obstacle clearance", "corridor violations", "% frame-in", "subject px", "jitter deg RMS", "flight time", "vertical clearance to fallen skier"]},
    "prior_art": [PA["hover"], PA["neo2"], PA["cmu"], PA["easa"], PA["faa"], PA["vail"]],
})

# ------------------------------------------------------------------ A03
t = TE
c.append({
    "id": "A03", "name_zh": "背包供电短系留旋翼（飞行摄影杆）", "name_en": "Backpack power-tethered rotorcraft ('flying boom', 3-10 m)",
    "lens": "aerial",
    "one_liner": "Battery-less 180 g quad on a 1.4 mm power tether from an auto-reel on the pack: a virtual selfie boom of 3-10 m with 30-55 min cold endurance.",
    "principle": "Move the battery to the body (where mass is cheap) and send power up a 48-100 V micro-tether; the tether also bounds the flight volume and makes recovery a reel-in.",
    "architecture": {"carrier": "180 g ducted quad + 48/100->12 V converter", "support": "rotor thrust",
                     "energy": "60-100 Wh pack battery (0.4-0.65 kg) in backpack", "sensing": "tether length/angle encoder gives relative pose; camera for framing",
                     "imaging": "4K wide on drone + optional 360", "use_flow": "pull strap -> drone lifts from pack lid cradle -> reel pays out to set length -> ski -> stop: reel winds drone back into cradle (docking = reel-in, latch)"},
    "viewpoints": [{"azimuth": "rear-high", "elevation_deg": 30, "distance_m": 5, "notes": "default"},
                   {"azimuth": "side", "elevation_deg": 20, "distance_m": 4, "notes": "tether passes beside skier, visible as thin line"},
                   {"azimuth": "front-high", "elevation_deg": 40, "distance_m": 3, "notes": "possible at low speed only; tether crosses face/body"}],
    "key_numbers": {
        "drone_mass": kn(t["A03_drone_mass_g"], "g", "assumed", "calc_tether.py"),
        "hover_power": kn(t["A03_hover_power_W"], "W", "calc", ""),
        "tether_loss_6m_48V": kn(t["A03_electrical"]["L6_V48"]["loss_pct"], "%", "calc", "AWG~30 pair, 75 W load"),
        "tether_loss_6m_100V": kn(t["A03_electrical"]["L6_V100"]["loss_pct"], "%", "calc", ""),
        "tether_loss_10m_24V": kn(t["A03_electrical"]["L10_V24"]["loss_pct"], "%", "calc", "24 V not viable"),
        "tether_mass_per_m": kn(t["A03_electrical"]["L6_V48"]["mass_g_per_m"], "g/m", "calc", "Cu + 0.9 g/m jacket/Dyneema assumed"),
        "tether_drag_6m_20ms_side": kn(t["A03_tether_drag_N"]["L6_V20_side"], "N", "calc", "Cd 1.2 cylinder"),
        "force_on_skier_6m_20ms": kn(t["A03_force_on_skier_N"]["L6_V20_side"], "N", "calc", "incl. 1.5 N holding tension"),
        "yaw_moment_on_skier": kn(t["A03_yaw_moment_Nm_lever0.3m_L6_V20_side"], "N*m", "calc", "0.3 m lever"),
        "endurance_cold_100Wh": kn(t["A03_endurance_min_cold_pack_100Wh_650g"], "min", "calc", ""),
        "endurance_cold_60Wh": kn(t["A03_endurance_min_cold_pack_60Wh_400g"], "min", "calc", ""),
        "added_body_mass": kn(1.0, "kg", "assumed", "reel+pack battery+cradle 0.8-1.2 kg"),
        "stop_distance_vs_tether": kn(7.0, "m", "calc", "drone stop distance from 12 m/s exceeds 3-6 m tether -> reel must free-wheel or 15 N weak link breaks"),
        "KE_at_12": kn(t["A03_KE_J_at_12"], "J", "calc", ""),
    },
    "scores": {
        "footage": sc(3, "Close 3-10 m rear/side views, 30-55 min; tether visible in frame and range limited -> less environment than A02."),
        "interference": sc(3, "~1 kg on back, 2-3 N tug, <1 N*m yaw; drone motion couples into pack."),
        "convenience": sc(4, "No battery swaps on drone; launch/recover by reel without hands; works while moving."),
        "safety": sc(2, "Rotors 3-10 m from own head; tether can catch other skiers, lift towers, trees; fall dynamics need weak link."),
        "simplicity": sc(2, "Reel tension control + HV tether + docking + flight control."),
    },
    "bold_hypothesis": "A 100 V micro-tether costs <5 % power and <2 N at ski speeds, so a battery-less 180 g quad becomes an endless, hands-free selfie boom.",
    "falsification_test": "Bench: 6 m tether, 100 V, 75 W, measure loss and heating at -10 C; cart test on a vehicle at 12-20 m/s measuring tether tension and drone attitude; snag test with a weak link on a mannequin fall.",
    "kill_criteria": ["Tether tension spikes >15 N in normal turns", "Reel-in docking success <95 % at 3 m/s relative wind", "Any tether-wrap incident on rider in fall tests", "Tether visible enough to ruin >30 % of frames"],
    "sim_plan": {"what_to_model": "quad + discretised tether (lumped-mass, 10-20 nodes, drag per segment), active reel with tension control, weak link, backpack anchor attached to skier kinematics",
                 "states": ["drone pose", "tether node positions", "reel length & speed", "tension at anchor", "skier pose"],
                 "scenarios": ["carved turns with drone outside of turn", "skier fall/stop", "gust 8 m/s crosswind", "tree on inside of turn (tether snag)", "reel-in docking at slow skiing"],
                 "metrics": ["anchor tension peaks/RMS", "yaw moment on skier", "min rotor-head distance", "tether-in-frame %", "snag/wrap events", "dock success"]},
    "prior_art": [PA["elistair"], PA["fold"], PA["faa"], PA["vail"]],
})

# ------------------------------------------------------------------ A04
k4 = KI["A04"]
c.append({
    "id": "A04", "name_zh": "背包发射杆风筝（现有概念复核）", "name_en": "Backpack launch-boom kite (existing sim concept, re-checked)",
    "lens": "aerial",
    "one_liner": "Passive 0.25 m2 kite with 360 camera launched from a pack boom, riding the skier's apparent wind on an 8 m tether.",
    "principle": "Skier speed supplies the airflow; L = 0.5 rho V^2 S CL supports 0.3 kg above ~6 m/s.",
    "architecture": {"carrier": "delta kite 0.25 m2 + 360 camera, 0.30 kg", "support": "aerodynamic lift on tether",
                     "energy": "skier kinetic energy (drag) + camera battery", "sensing": "none required (passive); optional tension sensor",
                     "imaging": "twin-lens 360, reframed in post", "use_flow": "strap pull raises boom -> push off -> kite leaves cradle at release force -> payout -> crank retrieval -> dock latch"},
    "viewpoints": [{"azimuth": "rear-overhead", "elevation_deg": k4["V12"]["tether_elev_deg"], "distance_m": k4["slant_distance_to_skier_m"], "notes": "tether nearly vertical at L/D~4.4: mostly top-down view"}],
    "key_numbers": {
        "v_min_airspeed": kn(k4["v_min_airspeed_m_s_margin1.3"], "m/s", "calc", "1.3 margin; sim defaults"),
        "riding_fraction_below_vmin_calm": kn(k4["riding_time_fraction_below_vmin_calm"], "fraction", "calc", "plus all stops/traverses/lift lines"),
        "tension_12": kn(k4["V12"]["tension_N"], "N", "calc", ""),
        "tension_20": kn(k4["V20"]["tension_N"], "N", "calc", "rear-up pull on pack"),
        "tension_swing_3ms_gust": kn(k4["tension_swing_pct_for_3m_s_gust_at_12"], "%", "calc", ""),
        "tether_elevation_12": kn(k4["V12"]["tether_elev_deg"], "deg", "calc", ""),
        "subject_px_360_5.7K": kn(k4["subject_px_5.7K_360_equirect"], "px", "calc", "11.9 deg angular size @16 px/deg; seen largely from above"),
        "KE_at_15": kn(k4["KE_J_at_15"], "J", "calc", ""),
        "descent_on_wind_loss": kn(KI["A07"]["A04_kite_descent_on_wind_loss_m_s_(parachute-like flat plate CD 1.2 on 0.25 m2)"], "m/s", "calc", "best case flat-plate parachute"),
    },
    "scores": {
        "footage": sc(2, "Top-down 74 deg view, ~190 px subject in 360 source; continuity broken below 6 m/s."),
        "interference": sc(2, "12-38 N rear-up pull scaling with V^2, +/-56 % per 3 m/s gust."),
        "convenience": sc(3, "No flight battery; but every stop lands/drops the kite; crank retrieval."),
        "safety": sc(3, "No rotors; 34 J; tether + kite over the piste near lifts."),
        "simplicity": sc(4, "Passive; boom mechanism the main complexity."),
    },
    "bold_hypothesis": "Apparent wind from skiing alone is a sufficient, free lift source for a camera.",
    "falsification_test": "Tow test (vehicle or skier) at 4-20 m/s logging tension and kite position; measure % of a real run time with airspeed > v_min using GNSS logs from 10 recreational runs.",
    "kill_criteria": ["Usable airborne time <70 % of run", "Peak tension >40 N on pack in gusts", "Docking success <90 %", "View elevation always >60 deg (no environmental shot)"],
    "sim_plan": {"what_to_model": "already in sim/: add attitude dynamics (replace beta blend), depower/bridle control, stall/low-speed regime, ground contact",
                 "states": ["kite pose & rates", "tether length/tension", "boom state", "skier kinematics"],
                 "scenarios": ["slow traverse 3-5 m/s", "gusty crosswind", "skier stop -> kite descent path vs head", "tight turns", "lift line"],
                 "metrics": ["airborne fraction", "tension peak/RMS", "view elevation histogram", "head-volume intrusions", "dock success"]},
    "prior_art": [PA["simkite"], PA["cfr101"], PA["vail"]],
})

# ------------------------------------------------------------------ A05
k5 = KI["A05"]
c.append({
    "id": "A05", "name_zh": "侧飞水翼式风筝（侧位低机位）", "name_en": "Side-paravane kite (low side-offset kite)",
    "lens": "aerial",
    "one_liner": "Steer the kite's lift sideways so it flies ~8 m abeam and 2 m behind at low height, giving the classic side tracking shot without motors.",
    "principle": "On a tether the kite sits on a cone of half-angle atan(L/D)~77 deg around the downwind axis; rolling the lift vector horizontal moves it from overhead to abeam, needing only ~14 deg vertical lift share at 12 m/s.",
    "architecture": {"carrier": "0.3 kg kite with roll servo (or bridle), camera", "support": "aerodynamic lift, mostly lateral",
                     "energy": "apparent wind + small servo battery", "sensing": "IMU + tether angle for roll control", "imaging": "rectilinear 4K aimed at skier",
                     "use_flow": "as A04, then command 'side left/right'"},
    "viewpoints": [{"azimuth": "side (+/-77 deg from downwind)", "elevation_deg": 5, "distance_m": 8, "notes": "the cinematic side shot; tether almost horizontal"}],
    "key_numbers": {
        "lateral_offset_L8_V12": kn(k5["V12"]["lateral_offset_m_L8"], "m", "calc", ""),
        "lift_dir_from_horizontal_V12": kn(k5["V12"]["lift_dir_from_horizontal_deg"], "deg", "calc", ""),
        "lateral_pull_V12": kn(k5["V12"]["lateral_pull_on_skier_N"], "N", "calc", ""),
        "lateral_pull_V16": kn(k5["V16"]["lateral_pull_on_skier_N"], "N", "calc", ""),
        "roll_moment_V12": kn(k5["roll_moment_Nm_at_V12"], "N*m", "calc", "at 1.1 m hip/pack height"),
        "equiv_CoM_shift_V12": kn(k5["equiv_CoM_shift_cm_at_V12"], "cm", "calc", "80 kg skier"),
        "tether_height": kn("1.4-2.0", "m", "calc", "horizontal 8 m line across adjacent track"),
    },
    "scores": {
        "footage": sc(4, "Low side view at ~8 m is the most desired framing (~430 px at 4K)."),
        "interference": sc(2, "14-25 N sideways tug that reverses with every turn; ~2 cm CoM-equivalent bias."),
        "convenience": sc(2, "Needs roll control and side swaps every turn; lands at every stop."),
        "safety": sc(1, "Head-height clothesline across 8 m of piste - unacceptable near other skiers, trees, lift lines."),
        "simplicity": sc(2, "Active roll control on a passive kite; turn transitions unsolved."),
    },
    "bold_hypothesis": "A tethered kite can hold a side station at skier height using lateral lift alone.",
    "falsification_test": "Tow-cart test with roll-servo kite on 8 m line at 8-16 m/s: hold side station +/-1 m for 30 s; then simulate S-turns.",
    "kill_criteria": ["Any use near other skiers (tether clothesline) - effectively kills product use on open pistes", "Station-keeping error >2 m", "Kite crosses behind skier at each turn (tether sweeps body)"],
    "sim_plan": {"what_to_model": "kite with roll control (lift vector angle), tether lumped-mass, skier S-turns, other-skier agents",
                 "states": ["kite pose", "roll command", "tether shape", "skier & bystander positions"],
                 "scenarios": ["straight run side station", "S-turns period 4-8 s", "gust", "bystander crosses tether path", "tree line on kite side"],
                 "metrics": ["station error", "lateral force on skier", "tether-bystander intersections", "subject px"]},
    "prior_art": [PA["simkite"], PA["cfr101"]],
})

# ------------------------------------------------------------------ A06
k6 = KI["A06"]
c.append({
    "id": "A06", "name_zh": "混合动力系留翼（风筝-无人机）", "name_en": "Hybrid kite-drone: tethered tail-sitter wing with thrust assist",
    "lens": "aerial",
    "one_liner": "A 330 g tail-sitter flying wing on a backpack tether: hovers on two props when slow or stopped, becomes a near-zero-power kite above ~8 m/s airspeed.",
    "principle": "Wing lift costs ~3 W of control power at ski speeds vs ~65 W for a quad of similar mass; props fill the kite's low-speed dead zone and give attitude control, solving A04's v_min and docking problems.",
    "architecture": {"carrier": "330 g flying wing S=0.12 m2, 2x130 mm props, elevons", "support": "lift (fast) / thrust (slow)",
                     "energy": "60 g onboard pack (optionally power over tether as in A03)", "sensing": "IMU, airspeed, tether angle/length; camera framing",
                     "imaging": "4K gimbal in nose or 360", "use_flow": "hover-launch from pack cradle -> payout -> transitions to kite mode automatically -> at stops hovers at 3-4 m -> reel-in docking with props assisting"},
    "viewpoints": [{"azimuth": "rear-high", "elevation_deg": 35, "distance_m": 8, "notes": "props let it sit lower than a passive kite (thrust can pull down/aft)"},
                   {"azimuth": "rear-quarter", "elevation_deg": 25, "distance_m": 8, "notes": "lateral station by roll, tether away from neighbours"},
                   {"azimuth": "hover at stop", "elevation_deg": 20, "distance_m": 4, "notes": "establishing shot while skier stands"}],
    "key_numbers": {
        "hover_power": kn(k6["hover_power_W"], "W", "calc", "two 130 mm props, FoM_eff 0.4"),
        "wingborne_airspeed": kn(k6["v_wingborne_m_s"], "m/s", "calc", "CL 1.0"),
        "power_at_12ms": kn(k6["power_W_by_airspeed"]["12"], "W", "assumed", "control only"),
        "avg_power_riding_plus_15pct_stopped": kn(k6["avg_power_W_incl_15pct_stopped_hover"], "W", "calc", "speed ~N(11,3.5)"),
        "endurance_60g_pack_cold": kn(k6["onboard_endurance_min_60g_pack"], "min", "calc", "vs ~8 min for A02"),
        "tether_tension_12": kn(k6["tether_tension_N_V12_wingborne"], "N", "calc", ""),
        "tether_tension_20": kn(k6["tether_tension_N_V20"], "N", "calc", "could be reduced with pitch/depower"),
        "KE_at_15": kn(k6["KE_J_at_15"], "J", "calc", ""),
    },
    "scores": {
        "footage": sc(3, "Stable rear-high to rear-quarter 6-10 m, continuous through stops; tether in frame."),
        "interference": sc(3, "5-21 N pull (controllable), pack reel ~0.5 kg."),
        "convenience": sc(3, "~30 min per battery, auto transitions, hands-free dock; complex start-up checks."),
        "safety": sc(2, "Props + tether + 37 J; tether over piste."),
        "simplicity": sc(1, "Tethered tail-sitter transitions in gusts are a hard control problem; many failure modes."),
    },
    "bold_hypothesis": "Combining kite and drone removes each one's fatal flaw: the kite's low-speed dead zone and the drone's 8-10 min endurance.",
    "falsification_test": "Simulate then tow-test a 330 g tail-sitter on 8 m tether: measure electrical power vs airspeed 0-20 m/s and transition success in 2 m/s RMS gusts; kill if power >15 W at 12 m/s or transitions fail >2 %.",
    "kill_criteria": ["Power at 12 m/s airspeed >15 W (no endurance gain)", "Transition failure >2 % in gusts", "Tether tension cannot be held <20 N at 20 m/s", "Mass >400 g after structure+camera"],
    "sim_plan": {"what_to_model": "6-DoF tail-sitter with post-stall aero table (flat-plate model), prop thrust & slipstream, lumped-mass tether, reel, mode logic",
                 "states": ["wing pose & rates", "airspeed/AoA", "prop thrust", "mode (hover/transition/kite)", "tether shape", "battery SoC"],
                 "scenarios": ["start from stop and accelerate 0->15 m/s", "decelerate to stop (kite->hover)", "gusty crosswind 2 m/s RMS", "tight turns", "skier fall", "loss of tracking (fly by tether angle only)"],
                 "metrics": ["electrical power vs time", "transition success", "tether tension", "view stability deg RMS", "head-volume intrusions"]},
    "prior_art": [PA["simkite"], PA["elistair"], PA["cfr101"]],
})

# ------------------------------------------------------------------ A07
k7 = KI["A07"]
c.append({
    "id": "A07", "name_zh": "旋翼风筝（自转旋翼系留）", "name_en": "Rotor kite (tethered autogyro camera)",
    "lens": "aerial",
    "one_liner": "Replace the kite wing with a 0.6 m autorotating rotor that folds compactly and descends slowly when wind is lost.",
    "principle": "Autorotating rotor produces resultant force ~0.9 x q x disc area with L/D ~3.",
    "architecture": {"carrier": "0.35 kg, 0.6 m 2-blade rotor + camera pod", "support": "autorotation lift", "energy": "apparent wind",
                     "sensing": "none/optional", "imaging": "360 below rotor hub", "use_flow": "spin-up on boom (or pre-spin motor) -> payout -> crank in"},
    "viewpoints": [{"azimuth": "rear-overhead", "elevation_deg": 70, "distance_m": 8, "notes": "similar to A04"}],
    "key_numbers": {
        "v_min": kn(k7["v_min_m_s_margin1.3"], "m/s", "calc", "C_R 0.9, L/D 3 assumed from autogyro literature ranges"),
        "tension_12": kn(k7["V12"]["tension_N"], "N", "calc", ""),
        "tension_16": kn(k7["V16"]["tension_N"], "N", "calc", ""),
        "rotor_freq_12": kn(k7["rotor_freq_Hz_at_V12"], "Hz", "calc", "1P/2P vibration into camera"),
        "descent_on_wind_loss": kn(k7["descent_rate_on_wind_loss_m_s"], "m/s", "calc", "~same as flat kite (4.4) -> no real safety gain"),
    },
    "scores": {
        "footage": sc(2, "Overhead + rotor-induced 16-32 Hz vibration."),
        "interference": sc(2, "15-29 N, more drag than wing."),
        "convenience": sc(2, "Spin-up delay, blade icing."),
        "safety": sc(2, "Spinning 0.6 m blades ~30 m/s tip near head on retrieval."),
        "simplicity": sc(3, "Passive but rotor hub/flapping hinge."),
    },
    "bold_hypothesis": "Autorotation makes a safer, more compact apparent-wind carrier than a wing.",
    "falsification_test": "Tow test comparing rotor vs delta at equal stowed volume: v_min, tension, descent rate on cut-off, camera vibration PSD.",
    "kill_criteria": ["Descent rate on wind loss not < 0.6x flat kite (calc says ~1.0x)", "Camera vibration >0.5 deg RMS at 16 Hz", "Rotor strikes in retrieval"],
    "sim_plan": {"what_to_model": "rotor as actuator disc with tilt-dependent C_R and L/D table, spin-up dynamics, tether",
                 "states": ["rotor rpm", "disc tilt", "pose", "tether tension"],
                 "scenarios": ["start-up from boom", "wind loss", "gust"], "metrics": ["v_min", "descent rate", "vibration", "tension"]},
    "prior_art": [PA["autogyro"], PA["glasgow"], PA["simkite"]],
})

# ------------------------------------------------------------------ A08
p8 = R["A08_micro_90g"]
c.append({
    "id": "A08", "name_zh": "机会镜头微型飞行器（只拍高光段）", "name_en": "Opportunity-shot micro flyer (highlight segments only)",
    "lens": "aerial",
    "one_liner": "90 g flyer stored in a shoulder pod; launched only at the top of a chosen pitch for one scripted 20-40 s shot, then lands next to the stopped skier.",
    "principle": "Spend flight energy and regulatory exposure only on the 10 % of the run worth filming; a body camera covers the rest.",
    "architecture": {"carrier": "90 g guarded quad", "support": "rotor thrust", "energy": "20 g pack ~3 Wh",
                     "sensing": "beacon + vision (shares A02 stack)", "imaging": "4K wide, EIS",
                     "use_flow": "stop at top -> one-button pod release -> drone hovers 4 m in front (establishing) -> skier drops in -> 20-40 s follow -> skier stops -> drone lands within 3 m / hand catch -> back to pod (charges from pack)"},
    "viewpoints": [{"azimuth": "front then rear", "elevation_deg": 15, "distance_m": 5, "notes": "drop-in reveal"},
                   {"azimuth": "rear", "elevation_deg": 15, "distance_m": 6, "notes": "follow"}],
    "key_numbers": {
        "mass": kn(90, "g", "assumed", ""),
        "Wh_per_shot": kn(p8["Wh_per_30s_shot_plus_20s_overhead"], "Wh", "calc", "30 s @12 m/s + 20 s hover overhead"),
        "shots_per_battery_cold": kn(p8["shots_per_battery_cold"], "count", "calc", "pod recharge from pack raises this"),
        "flight_time_cold_12ms": kn(p8["airspeed_table"]["12"]["time_min_cold_alt"], "min", "calc", ""),
        "KE_at_12": kn(p8["KE_J_at_12"], "J", "calc", "below FAA Cat 2 14.9 J"),
        "KE_at_20": kn(p8["KE_J_at_20"], "J", "calc", ""),
    },
    "scores": {
        "footage": sc(3, "Excellent highlight shots but not continuous."),
        "interference": sc(5, "90 g pod."),
        "convenience": sc(3, "~20-25 s overhead per shot; few shots per charge unless pod charges."),
        "safety": sc(4, "6.5 J at 12 m/s; short exposure."),
        "simplicity": sc(3, "Small airframe, scripted shot reduces autonomy demands."),
    },
    "bold_hypothesis": "Users value 3-6 great 30 s shots per day more than continuous mediocre follow footage.",
    "falsification_test": "User study: give 8 skiers either continuous A01 follow or highlight-only mode for a day; measure clips kept/shared and perceived hassle.",
    "kill_criteria": ["Per-shot overhead >40 s", "Landing within 5 m of skier <90 %", "Users keep fewer clips than with continuous mode"],
    "sim_plan": {"what_to_model": "A01/A02 dynamics + scripted shot library + landing near stopped skier on slope",
                 "states": ["shot phase", "drone pose", "battery"], "scenarios": ["drop-in reveal", "skier stops early/late", "fall mid-shot", "landing on 25 deg slope"],
                 "metrics": ["shot completion %", "landing distance", "overhead s", "Wh/shot"]},
    "prior_art": [PA["hover_winter"], PA["neo2_um"], PA["cmu"], PA["easa"]],
})

# ------------------------------------------------------------------ A09
c.append({
    "id": "A09", "name_zh": "安全牵绳电池无人机", "name_en": "Leash-tethered battery drone (unpowered Dyneema leash)",
    "lens": "aerial",
    "one_liner": "Clip a 0.5 mm, 4 g, 20 m Dyneema leash on a spring reel between pack and a palm drone: bounded fly-away, pull-back recovery from snow, minimal drag.",
    "principle": "The leash gives the safety/recovery value of a tether at <1 N drag, keeping the drone's own battery.",
    "architecture": {"carrier": "A01/A02 drone", "support": "rotor thrust", "energy": "onboard battery", "sensing": "leash length encoder as backup relative range",
                     "imaging": "as drone", "use_flow": "clip -> launch -> reel free-runs with light tension -> after landing in powder: reel in"},
    "viewpoints": [{"azimuth": "rear/side", "elevation_deg": 15, "distance_m": 8, "notes": "within leash radius"}],
    "key_numbers": {
        "leash_mass_20m": kn(TE["A09_L20"]["leash_mass_g"], "g", "calc", "0.2 g/m assumed"),
        "drag_20m_12ms_side": kn(TE["A09_L20"]["drag_N_V12_side"], "N", "calc", ""),
        "drag_20m_20ms_side": kn(TE["A09_L20"]["drag_N_V20_side"], "N", "calc", "= 1.3x weight of 192 g drone: significant at high speed"),
        "breaking_strength": kn(TE["A09_breaking_strength_N_assumed"], "N", "assumed", ""),
    },
    "scores": {
        "footage": sc(3, "As A01 within leash radius; leash rarely visible (0.5 mm)."),
        "interference": sc(4, "Light reel, small tug."),
        "convenience": sc(3, "Easier recovery; but leash management, tangles."),
        "safety": sc(3, "No fly-away; leash can snag others; still a UA legally."),
        "simplicity": sc(3, "Add-on reel."),
    },
    "bold_hypothesis": "A near-weightless leash fixes the two worst field failures of follow drones (fly-away and lost-in-snow) without the power-tether's cost.",
    "falsification_test": "Drag/tangle test at 12-20 m/s with 10-20 m leash; count tangles per hour and flight-time penalty.",
    "kill_criteria": ["Tangles >1 per hour", "Flight time penalty >20 % at 16 m/s"],
    "sim_plan": {"what_to_model": "quad + slack-capable lumped-mass leash + spring reel",
                 "states": ["leash nodes", "reel length", "drone pose"], "scenarios": ["turns", "drone lands in powder -> reel recovery", "leash over tree branch"],
                 "metrics": ["tension", "tangles", "power penalty"]},
    "prior_art": [PA["elistair"], PA["hover_winter"]],
})

# ------------------------------------------------------------------ A10
c.append({
    "id": "A10", "name_zh": "轻于空气（氦气球）载具/升力辅助", "name_en": "Lighter-than-air carrier or lift-assist (helium)",
    "lens": "aerial",
    "one_liner": "Helium balloon carrying the camera on a tether, or a small balloon to unload a quad.",
    "principle": "Buoyancy ~0.91 kg/m3 net at 2000 m, -10 C.",
    "architecture": {"carrier": "envelope + camera", "support": "buoyancy", "energy": "helium", "sensing": "-", "imaging": "camera", "use_flow": "inflate at base -> tow"},
    "viewpoints": [{"azimuth": "rear-high", "elevation_deg": 45, "distance_m": 8, "notes": "pushed downwind by drag"}],
    "key_numbers": {
        "volume_for_200g": kn(LF["A10_sphere_for_200g_payload"]["volume_m3"], "m3", "calc", ""),
        "diameter": kn(LF["A10_sphere_for_200g_payload"]["diameter_m"], "m", "calc", ""),
        "drag_12ms": kn(LF["A10_drag_N_V12"], "N", "calc", "sphere Cd 0.47"),
        "drag_20ms": kn(LF["A10_drag_N_V20"], "N", "calc", ""),
        "assist_30L_lift": kn(LF["A10_assist_30L_net_lift_g"], "g", "calc", ""),
        "assist_30L_drag_12": kn(LF["A10_assist_30L_drag_N_V12"], "N", "calc", "2.2x the quad's weight"),
    },
    "scores": {"footage": sc(1, "Blown flat behind skier; oscillation."), "interference": sc(1, "23-64 N drag."),
               "convenience": sc(1, "0.4 m3 helium per fill."), "safety": sc(3, "Soft but large."), "simplicity": sc(2, "Simple but impractical.")},
    "bold_hypothesis": "Buoyancy can remove the energy cost of holding a camera aloft.",
    "falsification_test": "Already falsified by calc: drag at ski speed exceeds buoyant lift by 50-100x.",
    "kill_criteria": ["Killed: drag/lift ratio at 12 m/s ~6 (carrier) and ~50 (assist)"],
    "sim_plan": {"what_to_model": "not recommended; if needed, single sphere drag on tether for illustration", "states": ["pos"], "scenarios": ["12 m/s tow"], "metrics": ["drag", "tether angle"]},
    "prior_art": [],
})

# ------------------------------------------------------------------ A11
c.append({
    "id": "A11", "name_zh": "固定翼跟拍机（远景巡航）", "name_en": "Fixed-wing follow flyer (wide orbiting shots)",
    "lens": "aerial",
    "one_liner": "300 g flying wing follows the skier's smoothed path at 15-25 m, loitering in 8-13 m circles when the skier stops; ~1 h endurance.",
    "principle": "At ski speeds, a wing at L/D 7 needs ~10 W vs ~65 W for a quad.",
    "architecture": {"carrier": "300 g foam flying wing S=0.12 m2, pusher prop", "support": "wing lift", "energy": "80 g pack", "sensing": "beacon (A02) + GNSS",
                     "imaging": "3-axis micro gimbal 4K, 70 deg HFOV", "use_flow": "hand-launch -> autonomous follow/orbit -> belly-land in soft snow near skier"},
    "viewpoints": [{"azimuth": "side/orbit", "elevation_deg": 25, "distance_m": 20, "notes": "can't hold a station; flies figure-8s/arcs"}],
    "key_numbers": {
        "stall": kn(LF["A11_stall_m_s"], "m/s", "calc", ""),
        "cruise_power_15": kn(LF["A11_cruise_power_W_V15"], "W", "calc", ""),
        "endurance_cold_12": kn(LF["A11_endurance_min_cold_80g_pack_V12"], "min", "calc", ""),
        "loiter_radius_30deg": kn(LF["A11_loiter_radius_m_bank30"], "m", "calc", ""),
        "subject_px_4K_d20": kn(240, "px", "calc", "interpolated between d15 (320) and d25 (192)"),
        "KE_at_25": kn(LF["A11_KE_J_at_25_gust"], "J", "calc", ""),
    },
    "scores": {"footage": sc(2, "Wide, environment-rich but small subject and periodic framing."), "interference": sc(5, "Nothing on body."),
               "convenience": sc(2, "Hand launch on slope, belly landing in snow, no hover at stops."), "safety": sc(2, "60-94 J, can't stop."),
               "simplicity": sc(2, "Follow planner for non-hovering aircraft + landing.")},
    "bold_hypothesis": "Endurance, not framing, is the limiting factor for aerial ski filming, so a wing beats rotors.",
    "falsification_test": "Sim: compare % usable frames of fixed-wing vs A02 over 20 recorded ski tracks.",
    "kill_criteria": ["Usable framed time <50 %", "Landing damage >10 % of flights"],
    "sim_plan": {"what_to_model": "fixed-wing 3-DoF with bank/speed limits, path-following to a predicted skier reference",
                 "states": ["pos", "heading", "bank", "airspeed"], "scenarios": ["skier stops", "tight turns", "tree line", "headwind"],
                 "metrics": ["% frame-in", "subject px", "min distance"]},
    "prior_art": [PA["cmu"], PA["easa"]],
})

# ------------------------------------------------------------------ A12
k12 = KI["A12"]
c.append({
    "id": "A12", "name_zh": "翼面卸载背负摄影杆（体载升力面）", "name_en": "Wing-unloaded backpack mast (body-mounted lift surface)",
    "lens": "aerial",
    "one_liner": "A 0.12 m2 wing at the tip of a 1.6 m pack mast carries the camera's weight in the apparent wind.",
    "principle": "Small lift surface cancels tip weight moment at speed (O09 revisited with numbers).",
    "architecture": {"carrier": "mast + wing", "support": "structure + lift", "energy": "apparent wind", "sensing": "-", "imaging": "camera at tip", "use_flow": "as mast"},
    "viewpoints": [{"azimuth": "rear-high", "elevation_deg": 30, "distance_m": 1.8, "notes": "fixed"}],
    "key_numbers": {
        "tip_lift_12": kn(k12["V12_tip_lift_N"], "N", "calc", ""),
        "static_root_moment": kn(k12["static_root_moment_Nm_tip_weight"], "N*m", "calc", "what the wing removes"),
        "gust_root_moment_swing": kn(k12["gust_root_moment_swing_Nm_1.6m"], "N*m", "calc", "what the wing adds per 3 m/s gust"),
    },
    "scores": {"footage": sc(3, "Mast view."), "interference": sc(2, "Gust moment swing > static moment saved."),
               "convenience": sc(3, ""), "safety": sc(3, ""), "simplicity": sc(3, "")},
    "bold_hypothesis": "Aerodynamic unloading makes a long mast feel weightless.",
    "falsification_test": "Calc already shows gust-induced moment swing (6.2 N*m) exceeds the static moment removed (3.9 N*m).",
    "kill_criteria": ["Killed by calc unless an active/feathering wing is used"],
    "sim_plan": {"what_to_model": "cantilever mast + wing, gust input", "states": ["mast deflection"], "scenarios": ["gust"], "metrics": ["root moment RMS", "camera jitter"]},
    "prior_art": [],
})

if __name__ == "__main__":
    p = os.path.join(HERE, "concepts.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(c, f, indent=2, ensure_ascii=False)
    for x in c:
        s = x["scores"]
        tot = sum(v["score"] for v in s.values())
        print(x["id"], x["name_en"], "total", tot, {k: v["score"] for k, v in s.items()})
    print("wrote", p)
