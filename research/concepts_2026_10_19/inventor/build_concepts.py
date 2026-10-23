"""Assemble concepts.json and ranking.json from the calc_* results (run the calc scripts first).

python3 calc_slope_glider.py && python3 calc_leash_reel.py && python3 calc_kills_and_variants.py && python3 build_concepts.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SG = json.load(open(os.path.join(HERE, "results_slope_glider.json")))
LR = json.load(open(os.path.join(HERE, "results_leash_reel.json")))
KL = json.load(open(os.path.join(HERE, "results_kills.json")))
G1, G3 = SG["I-01 rigid"], SG["I-03 tailsitter"]


def kn(value, unit, source, ref):
    return {"value": value, "unit": unit, "source": source, "ref": ref}


def sc(score, why):
    return {"score": score, "why": why}


U = {  # shared URLs
    "hoverair": "https://hoverair.com/pages/winter-sports",
    "skydio": "https://www.skimag.com/gadgets-and-tech/first-look-skydio-2/?scope=anon",
    "staaker": "https://www.tomsguide.com/us/staaker-autofollow-drone,news-23078.html",
    "cape": "https://gearjunkie.com/cape-drone-ski-video",
    "uav_follow_patent": "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9769387",
    "dlr": "https://www.dlr.de/en/rm/research/expertise/autonomy/landing-on-mobile-platforms",
    "dlr_news": "https://www.unmannedsystemstechnology.com/2016/01/german-aerospace-center-lands-uav-on-moving-car/",
    "fortus": "https://www.swiftengineering.com/?p=1731",
    "fold_patent": "https://patents.google.com/patent/US10112698",
    "fotokite": "https://newatlas.com/fotokite-phi-tethered-drone/46692",
    "boat_tow": "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7264204",
    "awe_takeoff": "https://arxiv.org/pdf/1608.01889",
    "awe_sim": "https://arxiv.org/pdf/1510.01088",
    "perch": "https://groups.csail.mit.edu/robotics-center/public_papers/Cory10a.pdf",
    "body_land": "https://hci.informatik.uni-due.de/en/publications/understanding-drone-landing-on-the-human-body-15864",
    "pack_dock_patent": "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12220994",
    "microonyx": "https://defense-update.com/20070406_micro-onyx.html",
    "mit_parafoil": "https://dspace.mit.edu/handle/1721.1/32457",
    "leapp": "https://www.machinedesign.com/news/gliding-high-servos",
    "tailsitter": "https://inderscience.com/offers.php?id=132116",
    "hovercam": "https://petapixel.com/2016/04/26/hover-camera-hovering-drone-cam-follows-around/",
    "regent": "https://thedefensepost.com/2026/04/15/regent-hybrid-seaglider-test/amp/",
    "flyingship": "https://www.uncrewed-systems.com/?p=15266",
    "maxwell": "https://maxwell.com/wp-content/uploads/2024/07/3002556-EN.7_3V-50F_datasheet_20240702-2.pdf",
    "ion": "https://news.mit.edu/2018/first-ionic-wind-plane-no-moving-parts-1121",
    "ion_tp": "https://graz.elsevierpure.com/en/publications/investigations-on-thrusttopower-of-an-ionic-wind-propulsion(55d0b9a6-7bbd-407a-aeaf-dda7dbddf520).html",
    "snatch": "https://www.historyofwar.org/Pictures/pictures_glider_pickup.html",
    "katabatic": "https://glossary.ametsoc.org/wiki/Katabatic_wind",
    "egu_slope": "https://presentations.copernicus.org/EGU22/EGU22-6441_presentation-h369927.pdf",
    "colorado": "https://colorado.public.law/statutes/crs_33-44-105",
    "amprius": "https://dronelife.com/2025/05/05/amprius-launches-450-wh-kg-sicore-lithium-ion-battery-targeting-aviation-and-defense/",
    "runcam": "https://oscarliang.com/runcam-thumb-2",
    "piste": "https://en.wikipedia.org/wiki/Piste",
    "inflatable": "https://compositesworld.com/articles/aircraft-in-a-box",
}
SEARCH_NOTE = ("web searches 2026-10-19: 'autonomous glider drone follow skier camera unpowered', "
               "'\"glider\" camera follows snowboarder OR skier \"no motor\"' -> only powered follow drones "
               "(HoverAir, Skydio, Staaker, Airdog, Cape) and a powered-UAV follow patent; no unpowered/gravity follower found")

concepts = []

# ======================================================================== I-05 (top)
concepts.append({
    "id": "I-05", "lens": "inventor",
    "name_en": "Aerotow camera: gravity glider on a near-zero-tension leash with a hip reel",
    "name_zh": "滑翔拖拍：近零张力牵绳 + 髋部卷线器的重力滑翔相机",
    "one_liner": "A 125 g folding-wing glider flies 7 m behind and 3.5 m above the skier. The slope pays for the flight, and a 0.17 mm leash only adds the missing drag on flats or in headwind (median 0.01 N, p99 0.4 N). A hip reel launches the glider by sled-tow and winch, and docks it automatically into a hip quiver when the skier stops.",
    "principle": ("Anything that keeps a constant height above the snow while moving with the skier must lose height at the terrain drop rate "
                  "Vc*sin(theta). A glider loses height at Va/(L/D). With L/D 7-12 at 8-12 m/s, gravity alone pays for following on slopes "
                  f"steeper than about {G1['min_slope_deg_for_gravity_follow']['v11_wind+0']} deg in still air. That covers {SG['I-01 rigid']['time_fractions_wind0']['follow']*100:.0f} % "
                  "of an assumed blue/red day. Where it falls short (flats, headwind), the skier tows it like a sailplane on aerotow. "
                  "The tow needs only the energy deficit, about drag minus gravity, so the line tension is the size of drag (~W/(L/D)), not of weight. "
                  "A kite needs tether tension of the order of its weight or more, which in round 1 was 12-38 N. "
                  "The same line does three more jobs: it caps fly-away, provides winch launch from a standstill, and pulls the glider into a funnel dock. Snow is the soft fallback surface."),
    "architecture": {
        "carrier": "125 g foam/carbon glider, S 0.06 m2, span 0.73 m AR 9, spring-hinged wings fold aft along the fuselage (tube-launched-UAV style), split-flap airbrake, belly skid",
        "support": "aerodynamic lift; leash carries only drag deficit (p99 0.4 N)",
        "energy": "gravity (slope) + skier tow on flats; 3.7 Wh 1S cell for avionics/camera (2.9 W); 10 Wh hip cell runs the reel and tops up the glider in the quiver",
        "sensing": "UWB ranging to hip tag + GNSS + IMU; reel line length/angle encoder gives relative position directly (the leash is a position sensor)",
        "imaging": "16 g 4K camera with gyro log (RunCam Thumb Pro class), 90 deg HFOV after EIS crop, subject-tracking reframe; no gimbal",
        "use_flow": "arm at top -> push off -> glider drops from quiver, sled-towed over snow, winch-launched at skier 4 m/s -> gravity follow -> on deceleration reel pulls it down the line into the hip funnel (wings fold) -> lift ride docked & charging",
    },
    "viewpoints": [{"azimuth": "behind on smoothed centreline", "elevation_deg": SG["view"]["elevation_deg"], "distance_m": SG["view"]["range_m"],
                    "notes": f"{SG['view']['px_4K_hfov90_at_range']} px (4K, 90 deg); lateral offset of +-3-5 m is possible for 3/4 rear views (ASSUMED, needs sim)"}],
    "key_numbers": {
        "LDmax": kn(G1["LDmax"], "-", "calc", "calc_slope_glider.py parabolic polar cd0 0.035 e 0.8 (ASSUMED at Re 65k)"),
        "LD_at_12": kn(G1["LD_at"]["12"], "-", "calc", "calc_slope_glider.py"),
        "v_stall": kn(G1["v_stall"], "m/s", "calc", "CLmax 1.0 ASSUMED, rho 1.0"),
        "min_slope_gravity_only_v11": kn(G1["min_slope_deg_for_gravity_follow"]["v11_wind+0"], "deg", "calc", "still air; headwind 5 m/s -> " + str(G1["min_slope_deg_for_gravity_follow"]["v11_wind+5"])),
        "gravity_follow_share_still_air": kn(G1["time_fractions_wind0"]["follow"], "frac", "calc", "ASSUMED slope mix & N(11,3.5) speeds"),
        "tow_tension_p50": kn(LR["tow_tension_N"]["p50"], "N", "calc", "calc_leash_reel.py, wind mix -5/0/+5 m/s"),
        "tow_tension_p99": kn(LR["tow_tension_N"]["p99"], "N", "calc", "calc_leash_reel.py"),
        "tow_tension_flat_headwind5": kn(LR["tow_tension_N"]["flat_0deg_v10_headwind5"], "N", "calc", "worst realistic case"),
        "kite_pull_round1": kn("12-38", "N", "calc", "research/concepts_2026_10_18/aerial/calc_kite.py"),
        "line_px_over_subject": kn(LR["line_in_frame"]["px_width_at_subject_range"], "px", "calc", "0.17 mm line at 7.8 m, 90 deg 4K"),
        "subject_px": kn(SG["view"]["px_4K_hfov90_at_range"], "px", "calc", "range 7.8 m"),
        "jitter_bg_wind6": kn(SG["gust_jitter_deg_s"]["I-01 rigid_wind6"]["jitter_bg"], "deg/s", "calc", "von Karman surface-layer ASSUMED; wind 9 m/s -> " + str(SG["gust_jitter_deg_s"]["I-01 rigid_wind9"]["jitter_bg"])),
        "KE_cap_speed": kn(G1["v_max_KE_14.9J"], "m/s", "calc", "125 g at 14.9 J; skier faster than this 2 % of time"),
        "time_to_follow_from_standstill": kn(LR["start_launch"]["time_to_follow_height_s"], "s", "calc", "sled-tow + winch launch"),
        "launch_tension": kn(LR["start_launch"]["launch_tension_N"], "N", "calc", "1.6 W ASSUMED"),
        "dock_entry_KE_rider_frame": kn(LR["stop_dock"]["funnel_entry_KE_rider_frame_J"], "J", "calc", "1.5 m/s into funnel"),
        "snag_force_body": kn(LR["hazards"]["snag_force_on_body_N"], "N", "assumed", "reel slip clutch setting"),
        "filming_per_charge": kn(SG["I-01 energy"]["filming_min_per_charge"], "min", "calc", "3.7 Wh, -10 C 0.75, 10 % reserve, 2.9 W; topped up from hip cell"),
        "worn_mass": kn(LR["budget"]["total_worn_g"], "g", "assumed", "budget in calc_leash_reel.py"),
        "packed_volume": kn(LR["budget"]["packed_L"], "L", "assumed", "quiver 0.46x0.095x0.06 m + reel"),
    },
    "criteria_estimate": {"avail": "~85-90 % (ASSUMED: launch 5 s per segment, 2 % over KE cap)", "pxMed": 429, "jitter": "0.7-2.1 bg + subject term; ~1.5-3 deg/s",
                          "azRange": "~60-90 deg if lateral offset flown (needs sim)", "addedMass_kg": 0.43, "bodyForcePeak_N": 3.0, "handsBusy": "0 %",
                          "setupTime_s": "0-6", "ops": "0-1", "keMax_J": 14.9, "packVol_L": LR["budget"]["packed_L"], "endurance_min": 52},
    "scores": {
        "footage": sc(4, "Real chase-plane view from behind and above at 7.8 m, ~430 px, decoupled from the body. Turbulence jitter is estimated at 0.7-2 deg/s. Behind-only by default."),
        "interference": sc(4, "425 g on the hip, no hands while skiing. Line pull is <0.6 N, below what the skier can feel."),
        "convenience": sc(4, "Zero or one action per run; launch and dock happen while moving, standstill 0-6 s. Packs to ~2.9 L."),
        "safety": sc(3, "KE capped at 14.9 J by a speed limit. Rider-frame strike if the rider falls is 5.5 J. A thin line behind the skier is the residual hazard, reduced by a 3 N free-running clutch."),
        "simplicity": sc(3, "Glider autopilot, reel tension control and funnel dock. No propulsion and no hover."),
        "originality": sc(5, "No unpowered or gravity follower and no leashed glider for a person found. The parts come from sailplane aerotow/winch, boat-towed UAV recovery and tube-launched UAVs."),
        "tech_risk": sc(3, "The dock-on-deceleration and sled-tow launch are unproven, and the regulatory class is unclear (towed glider, kite or UAS)."),
    },
    "bold_hypothesis": "A ski slope is an unlimited, free energy source for a camera that descends with the skier. With the slope covering most of the energy, a leash that only supplies the deficit can give a towed camera body forces about 100 times lower than a kite while keeping a kite's 'can't fly away' safety.",
    "falsification_test": ("Sim: 3-DoF glider + reel-controlled elastic line + calibrated skier/wind models (sim/js/concepts/common). Run 20 tracks across the slope mix, "
                           "with wind -5/0/+5/gusts 9 m/s. Falsified if p95 line tension exceeds 3 N while moving, usable frames fall below 80 %, the dock succeeds in under 95 % of stops, "
                           "or jitter exceeds 3 deg/s in nominal conditions. Bench (not run): pull a folded glider into the funnel at 1.5 m/s 200 times."),
    "kill_criteria": ["p95 tension >3 N moving (it would become a kite)", "dock success <95 % in sim", "usable frames <80 %",
                      "line visible >=1 px over subject >2 % of frames", "regulator classifies it as a UAS requiring VLOS by a second person (then no better than a drone legally)"],
    "sim_plan": {"what_to_model": "3-DoF point-mass glider with polar, bank and airbrake; line as spring-damper with reel speed/tension control; launch from snow (mu 0.15); funnel dock on deceleration",
                 "states": ["glider pos/vel", "bank", "airbrake", "line length", "reel speed", "tension"],
                 "scenarios": ["nominal blue", "cat track 4 deg 200 m", "headwind 5", "tailwind 5", "gust 9 m/s", "hockey stop", "fall", "crossing skier hits line", "tree snag", "short turns"],
                 "metrics": ["avail", "pxMed", "jitterRms", "tension p95/max", "dock success", "keMax", "bodyForcePeak"]},
    "prior_art": [
        {"name": "Fotokite Phi (leashed quad, 8/30 m leash, ~13 min)", "url": U["fotokite"], "relevance": "closest leashed consumer camera; powered, short endurance, no gravity glide"},
        {"name": "US7264204 UAV catcher: boat-towed UAV launch as towed glider + winch recovery", "url": U["boat_tow"], "relevance": "tow launch/winch-down recovery from a moving vessel; transfer to a skier is new"},
        {"name": "Autonomous take-off of tethered aircraft for airborne wind energy (arXiv 1608.01889)", "url": U["awe_takeoff"], "relevance": "winch/tether control of a rigid glider"},
        {"name": "Tethered glider take-off/landing simulation (arXiv 1510.01088)", "url": U["awe_sim"], "relevance": "ground winch + rigid glider"},
        {"name": "Swift Fortus tube-folding UAV", "url": U["fortus"], "relevance": "spring-folding wings stow in a tube"},
        {"name": "US10112698B2 folding wing deployment", "url": U["fold_patent"], "relevance": "stacked-hinge wing deployment"},
        {"name": "Powered ski follow drones (HoverAir, Skydio, Staaker, Cape)", "url": U["hoverair"], "relevance": "existing category; all powered, battery-limited"},
    ],
    "novelty": SEARCH_NOTE + "; no leashed glider camera for a person found. Distinct from the kite workstream: lift = weight by flight, tether carries only drag deficit.",
    "user_sequence": [
        {"step": "morning", "action": "clip hip belt (quiver + reel + 10 Wh cell)", "time_s": 20, "hands": "2, once per day"},
        {"step": "top of run", "action": "press strap button 'arm' (or auto-arm by speed)", "time_s": 1, "hands": "1 gloved"},
        {"step": "push off", "action": "none: glider drops, sled-tows, winch-launches at skier 4 m/s, at height after ~5 s", "time_s": 0, "hands": "0"},
        {"step": "ride", "action": "none: gravity follow; reel holds 0.01-0.4 N", "time_s": 0, "hands": "0"},
        {"step": "mid-run stop", "action": "none: reel docks glider during the 3 s deceleration (fallback: drags it over snow, <=6 s)", "time_s": "0-6", "hands": "0"},
        {"step": "lift ride", "action": "none: glider in quiver, charging", "time_s": 0, "hands": "0"},
        {"step": "end of day", "action": "unclip belt, charge cell", "time_s": 15, "hands": "2"},
    ],
    "verdict": "TOP-1. Develop: highest originality, and it removes the drone's two failures (battery, helper) without a kite's pull. Biggest risks: the thin line behind the skier as a hazard to others, and the dock/launch mechanics.",
})

# ======================================================================== I-03
concepts.append({
    "id": "I-03", "lens": "inventor",
    "name_en": "Glide-and-perch tail-sitter: glides on gravity, hovers only to take off, waits standing in the snow",
    "name_zh": "滑翔-驻停尾座式：重力滑翔跟拍，只在起飞时悬停，停下时立在雪里等待",
    "one_liner": "A free 175-182 g tail-sitter flying wing glides behind the skier on slope energy. At each stop it lands upright in the snow near the skier and waits at zero power, then takes off vertically when the skier moves. Hover is used ~10 s per segment, giving 44 min filming per 7.4 Wh charge against ~9 min for a pure hover.",
    "principle": ("Follow drones fail on endurance because they hover the whole time (27-50 W). On slopes, gliding costs about 3 W of avionics power, because gravity pays for the flight. "
                  "The only unavoidable powered phase is getting airborne from a standstill. Snow lets the aircraft land tail-down and stand at zero power, which removes loitering."),
    "architecture": {"carrier": "flying wing S 0.06 m2 AR 9 with two 5-inch tractor props (folding) on the leading edge; tail-sitter VTOL",
                     "support": "wing lift (glide) / prop thrust (10 s take-off, transition)",
                     "energy": "gravity on runs + 7.4 Wh 2S for take-offs",
                     "sensing": "UWB/GNSS beacon + vision fallback (as round-1 S2 v3)",
                     "imaging": "16 g 4K EIS camera, belly-mounted (horizon in glide, looks forward in hover after reframe)",
                     "use_flow": "palm/snow VTOL -> transition -> gravity follow -> on stop: land tail-down upright beside track -> wait -> auto VTOL when skier moves -> end of run lands on glove"},
    "viewpoints": [{"azimuth": "behind/side", "elevation_deg": 27, "distance_m": 7.8, "notes": "plus static 'stop shot' from where it stands"}],
    "key_numbers": {
        "P_hover": kn(SG["I-03 hover"]["P_hover_W"], "W", "calc", "momentum theory, FM 0.55, motor 0.75 ASSUMED"),
        "filming_per_charge_land_and_wait": kn(KL["I-03b land_and_wait_7.4Wh"]["filming_min"], "min", "calc", "3 take-offs x 10 s per 4-min run"),
        "filming_if_hover_30s_at_stops": kn(SG["I-03 hover"]["filming_min_per_charge"], "min", "calc", "6.3 Wh, 2 stops x 30 s hover"),
        "pure_hover_equivalent": kn(SG["I-03 hover"]["pure_hover_quad_equiv_min"], "min", "calc", "same battery"),
        "KE_cap_speed": kn(KL["I-03b land_and_wait_7.4Wh"]["v_KE_cap"], "m/s", "calc", "182 g; skier faster ~10 % of time"),
        "gravity_follow_share": kn(G3["time_fractions_wind0"]["follow"], "frac", "calc", "still air; headwind 5 m/s -> " + str(G3["time_fractions_headwind5"]["follow"])),
        "tipover_wind": kn("6-7", "m/s", "calc", "upright on snow, tail sunk 6 cm (calc_kills_and_variants.py)"),
        "jitter_bg_wind6": kn(SG["gust_jitter_deg_s"]["I-03 tailsitter_wind6"]["jitter_bg"], "deg/s", "calc", "ASSUMED turbulence"),
    },
    "criteria_estimate": {"avail": "~75-80 % (KE lag 10 %, headwind deficit -> motor assist)", "pxMed": 429, "jitter": "~1.2-2 bg", "azRange": ">=90 (free flyer)",
                          "addedMass_kg": 0.25, "bodyForcePeak_N": 0, "handsBusy": "0 %", "setupTime_s": "~8", "ops": 2, "keMax_J": 14.9, "packVol_L": 1.5, "endurance_min": 44},
    "scores": {"footage": sc(4, "Free viewpoint plus stop shots. Behind at 7.8 m."), "interference": sc(5, "Nothing on the body except a holster."),
               "convenience": sc(4, "Self-relaunching; actions only at the start and end of a run (palm)."),
               "safety": sc(3, "Free flyer near other skiers; a 14.9 J cap means it drops behind above 12.8 m/s. Props are live only during take-off."),
               "simplicity": sc(2, "Tail-sitter transitions in gusts near snow are hard; snow landing and stand-up need work."),
               "originality": sc(4, "No glide-and-perch follow camera product found; tail-sitters exist in research."),
               "tech_risk": sc(2, "Transition control at 2-5 m altitude in gusts, tipping over above ~6-7 m/s wind, and still a UAS legally.")},
    "bold_hypothesis": "A follow-camera's endurance problem disappears if it never hovers to wait. With gravity paying for the glide and snow providing a free perch, hover is <10 % of airborne time.",
    "falsification_test": "Sim the transition and an upright snow landing in 0-9 m/s wind. Falsified if energy per run exceeds 0.6 Wh or more than 10 % of landings tip over.",
    "kill_criteria": ["tip-over >10 % of perches", "transition altitude loss >2 m", "<45 min filming at -10 C"],
    "sim_plan": {"what_to_model": "6-DoF tail-sitter with post-stall polar, prop wash; snow contact model", "states": ["pose", "rates", "prop rpm"],
                 "scenarios": ["start from snow", "stop & perch in wind 3/6/9", "skier faster than KE cap", "headwind"], "metrics": ["Wh/run", "tip-over rate", "avail", "jitter"]},
    "prior_art": [{"name": "Tail-sitter UAV hover research (Int J Sustainable Aviation 2023)", "url": U["tailsitter"], "relevance": "VTOL tail-sitter; not follow/gravity"},
                  {"name": "Hover Camera / HoverAir (palm follow quads)", "url": U["hovercam"], "relevance": "hand landing, but hover-only flight"},
                  {"name": "MIT post-stall perching glider (Cory 2010)", "url": U["perch"], "relevance": "glider perching manoeuvre"}],
    "novelty": SEARCH_NOTE + "; 'small tail-sitter VTOL glider hover and glide follow-me camera' search found no product.",
    "user_sequence": [{"step": "top", "action": "hold out palm-launch (button)", "time_s": 3, "hands": "1"},
                      {"step": "ride", "action": "none", "time_s": 0, "hands": "0"},
                      {"step": "mid-run stop", "action": "none: it perches upright 5 m away, relaunches when you move", "time_s": 0, "hands": "0"},
                      {"step": "end of run", "action": "raise glove, it lands; drop into holster", "time_s": 5, "hands": "1"}],
    "verdict": "TOP-2. A real endurance fix for free flyers (~5x a hover-only follow drone). Biggest risk: transition control and perch stability in wind. It remains a drone for regulatory purposes.",
})

# ======================================================================== I-01
concepts.append({
    "id": "I-01", "lens": "inventor",
    "name_en": "Slope shadow: free tube-launched gravity glider that lands ahead in the snow",
    "name_zh": "坡影：从背管射出、靠重力跟拍、停下时落在前方雪里的自由滑翔机",
    "one_liner": "The I-05 glider without the leash. It ejects from a pack tube once the skier is above 8 m/s and follows on slope energy with servo-only power (2.9 W, 52 min). When the skier slows it overflies and belly-lands 3-4 m past them at 3 J. The skier picks it up and slides it back into the tube.",
    "principle": "Same gravity-following physics as I-05. Without a tether there is no tow on flats and no automatic recovery, so every stop costs a pick-up.",
    "architecture": {"carrier": "I-05 glider", "support": "lift", "energy": "gravity + 3.7 Wh avionics", "sensing": "UWB/GNSS", "imaging": "16 g 4K EIS",
                     "use_flow": "spring/air-flow ejection from shoulder tube at >=8 m/s -> follow -> overfly & land ahead -> pick up (1 action)"},
    "viewpoints": [{"azimuth": "behind", "elevation_deg": 27, "distance_m": 7.8, "notes": "429 px"}],
    "key_numbers": {"gravity_follow_share_still_air": kn(G1["time_fractions_wind0"]["follow"], "frac", "calc", ""),
                    "gravity_follow_share_headwind5": kn(G1["time_fractions_headwind5"]["follow"], "frac", "calc", "headwind kills it"),
                    "landing_point_past_skier": kn(SG["I-01 stop"]["landing_point_past_skier_m"], "m", "calc", "airbrake glide from 4.5 m"),
                    "touchdown_KE": kn(SG["I-01 stop"]["touchdown_KE_J"], "J", "calc", ""),
                    "filming_per_charge": kn(SG["I-01 energy"]["filming_min_per_charge"], "min", "calc", ""),
                    "gravity_power_available": kn(SG["I-01 energy"]["gravity_power_available_W_at_11ms_16deg"], "W", "calc", "vs 1.1 W needed")},
    "scores": {"footage": sc(4, "Same view as I-05 but drops out in headwind."), "interference": sc(5, "Nothing pulling; tube 1.5 L."),
               "convenience": sc(2, "A pick-up at every stop; no footage in the first ~5 s of each run."),
               "safety": sc(3, "Free flyer, 14.9 J cap; lands near people."), "simplicity": sc(4, "No reel, no propulsion."),
               "originality": sc(5, "No unpowered follow glider found."), "tech_risk": sc(3, "Headwind and flats ground it; UAS rules apply.")},
    "bold_hypothesis": "Gravity alone can carry a camera behind a skier for whole runs on blue/red slopes.",
    "falsification_test": "Sim over the slope mix with real wind: falsified if follow share <70 % in 0-5 m/s wind.",
    "kill_criteria": ["follow share <70 %", ">2 pick-ups per run"],
    "sim_plan": {"what_to_model": "as I-05 without line", "states": ["glider"], "scenarios": ["headwind", "cat track", "stop"], "metrics": ["avail", "pickups/run"]},
    "prior_art": [{"name": "Powered follow drones (Skydio, Staaker)", "url": U["skydio"], "relevance": "category"},
                  {"name": "Swift Fortus tube-folding UAV", "url": U["fortus"], "relevance": "tube launch"},
                  {"name": "UAV follow-skier patent", "url": U["uav_follow_patent"], "relevance": "powered follow claims"}],
    "novelty": SEARCH_NOTE,
    "user_sequence": [{"step": "top", "action": "push off; auto-eject at 8 m/s", "time_s": 0, "hands": "0"},
                      {"step": "stop", "action": "ski 4 m, pick up, slide into tube", "time_s": 12, "hands": "1"}],
    "verdict": "TOP-4 (as the simple, tether-free sibling of I-05). Proves the gravity principle cheaply. Biggest risk: headwind (32 % follow at 5 m/s) and a pick-up at every stop.",
})

# ======================================================================== I-10
concepts.append({
    "id": "I-10", "lens": "inventor",
    "name_en": "Leapfrog lander with pole 'ring-tilt' snatch pickup",
    "name_zh": "跃进落位 + 雪杖挑环回收",
    "one_liner": "The gravity glider runs ahead (it can fly faster than the skier's centreline), lands beside the piste 40 m ahead, raises a loop and films the skier approaching and passing. The skier hooks the loop with a pole tip at ~5 m/s, as in WWII glider snatch pickups, and the glider is relaunched from the hip.",
    "principle": "On slopes the glider has surplus energy, so it can lead instead of follow. Snow is a free tripod. Recovery uses the skier's own momentum, as in a snatch pickup.",
    "architecture": {"carrier": "I-01 glider + 0.5 m elastic loop mast", "support": "lift / snow", "energy": "gravity", "sensing": "UWB/GNSS",
                     "imaging": "4K, digital pan", "use_flow": "lead 6.6 s -> land -> film approach -> snatch -> hip quiver"},
    "viewpoints": [{"azimuth": "front -> side -> rear (pan)", "elevation_deg": 2, "distance_m": "30 -> 2", "notes": "112 px at 30 m, 336 px at 10 m"}],
    "key_numbers": {"time_to_lead_40m": kn(KL["I-10 leapfrog"]["time_to_get_40m_ahead_s"], "s", "calc", ""),
                    "snatch_force": kn(KL["I-10 leapfrog"]["snatch_force_avg_N_v5_stroke0.5"], "N", "calc", "0.5 m elastic"),
                    "hit_prob_sigma10cm": kn(KL["I-10 leapfrog"]["hit_prob_window_0.125_sigma_0.10"], "-", "calc", "ASSUMED human aim sigma"),
                    "hit_prob_sigma15cm": kn(KL["I-10 leapfrog"]["hit_prob_window_0.125_sigma_0.15"], "-", "calc", "")},
    "scores": {"footage": sc(3, "Classic static-camera pan shots, one per hop."), "interference": sc(3, "Requires aiming the pole at speed."),
               "convenience": sc(2, "A 20-40 % miss rate means climbing back."), "safety": sc(3, "Object on the piste edge."),
               "simplicity": sc(3, "Mechanically simple."), "originality": sc(5, "Snatch pickup by a skier is unprecedented."),
               "tech_risk": sc(3, "Human aim; borderline 'self-placed camera' scope.")},
    "bold_hypothesis": "A skier can retrieve a camera on the move as reliably as hitting a slalom gate.",
    "falsification_test": "Not physically run. Sim/human-factors: falsified if pole-tip aim sigma exceeds 10 cm at 5 m/s.",
    "kill_criteria": ["hit rate <90 %", "judged a pre-placed camera under the brief"],
    "sim_plan": {"what_to_model": "lead trajectory + landing site choice", "states": ["glider"], "scenarios": ["narrow piste", "crowd"], "metrics": ["hops/run", "px"]},
    "prior_art": [{"name": "Waco CG-4A glider snatch pickup", "url": U["snatch"], "relevance": "snatch recovery by a moving vehicle"}],
    "novelty": "No ski or camera use found; snatch pickup is a 1940s aviation technique.",
    "user_sequence": [{"step": "ride", "action": "hook loop with pole while passing", "time_s": 1, "hands": "1 while moving (counts)"}],
    "verdict": "HOLD (rank 5). Original and fun, but aim reliability and scope (it acts like a self-placed camera) make it a feature mode of I-05/I-01, not a product.",
})

# ======================================================================== I-02
concepts.append({
    "id": "I-02", "lens": "inventor",
    "name_en": "Carrier perch: free glider lands on the moving skier's back",
    "name_zh": "航母式停靠：滑翔机在行进中落到滑雪者背上",
    "one_liner": "At matched speed the relative velocity between glider and skier is ~0, so the glider could land on a dorsal perch like a plane on a carrier (DLR has landed a UAV on a car at 75 km/h).",
    "principle": "Relative KE at 1.5 m/s is only 0.14 J. The trouble is that the skier's wake has a 32-52 % velocity deficit 1-2 m behind the skier, below the glider's stall speed.",
    "architecture": {"carrier": "I-01 glider", "support": "lift", "energy": "gravity", "sensing": "UWB +-0.1 m", "imaging": "4K", "use_flow": "approach from behind-above -> hook dorsal wire"},
    "viewpoints": [],
    "key_numbers": {"wake_deficit_1m": kn(LR["I-02 wake"]["x1m"]["deficit_frac"], "frac", "calc", "axisymmetric wake similarity ASSUMED const 0.7, CdA 0.4"),
                    "airspeed_in_wake_2m": kn(LR["I-02 wake"]["x2m"]["airspeed_in_wake_m_s"], "m/s", "calc", "stall 6.4"),
                    "relative_KE": kn(LR["I-02 perch"]["relative_KE_J_at_1.5ms"], "J", "calc", "")},
    "scores": {"footage": sc(0, "n/a (recovery method)"), "interference": sc(2, "Needs an above-head perch."), "convenience": sc(4, "Hands-free."),
               "safety": sc(2, "Approach over the head."), "simplicity": sc(2, "Precision landing in a wake."), "originality": sc(4, "Car-top landing exists; human-back landing has only HCI studies."),
               "tech_risk": sc(1, "The glider stalls in the skier's wake.")},
    "bold_hypothesis": "A glider can land on a moving skier.",
    "falsification_test": "CFD/sim of the wake: killed if airspeed at the perch is below 1.1 x stall.",
    "kill_criteria": ["airspeed at perch < 1.1 Vs"],
    "sim_plan": {"what_to_model": "wake model + approach", "states": [], "scenarios": [], "metrics": []},
    "prior_art": [{"name": "DLR fixed-wing landing on moving car", "url": U["dlr"], "relevance": "matched-speed landing, 0.5 m accuracy, 4x5 m net"},
                  {"name": "DLR news 2016", "url": U["dlr_news"], "relevance": ""},
                  {"name": "Understanding drone landing on the human body (MobileHCI 2021)", "url": U["body_land"], "relevance": "HCI only"},
                  {"name": "UAV backpack docking patent", "url": U["pack_dock_patent"], "relevance": "concept disclosure"}],
    "novelty": "Matched-speed landing exists for cars, not for people.",
    "user_sequence": [],
    "verdict": "KILLED as a free perch: the skier's wake leaves 4.5-6.3 m/s airspeed at 1-2 m, below stall. The idea survives as I-05's line-guided dock, where the reel supplies the energy and the glider doesn't need to fly the final metre.",
})

# ======================================================================== I-04
concepts.append({
    "id": "I-04", "lens": "inventor", "name_en": "Ram-air micro-parafoil follower (soft wing self-inflated by the skier's apparent wind)",
    "name_zh": "冲压微型翼伞跟拍（由滑行相对风自充气）",
    "one_liner": "A 0.03 m2 soft canopy packs into 0.2 L and is inflated by the skier's own apparent wind on release, then follows by gravity with brake-line steering.",
    "principle": "Soft and packable, but a parafoil's L/D (~3) needs slopes of 19.5 deg or more, and its speed window is narrow (8-14 m/s).",
    "architecture": {"carrier": "ram-air canopy 0.31 m span + 110 g pod", "support": "lift", "energy": "gravity", "sensing": "GNSS", "imaging": "4K", "use_flow": "release from pack pocket at speed"},
    "viewpoints": [],
    "key_numbers": {"follow_share": kn(SG["I-04 parafoil"]["time_fractions"]["follow"], "frac", "calc", "L/D 3 ASSUMED"),
                    "min_slope": kn(SG["I-04 parafoil"]["min_slope_deg_still_air"], "deg", "calc", ""),
                    "canopy_area": kn(SG["I-04 parafoil"]["canopy_S_m2"], "m2", "calc", "")},
    "scores": {"footage": sc(1, "Follows only 17 % of the time."), "interference": sc(5, ""), "convenience": sc(2, ""), "safety": sc(4, "Soft."),
               "simplicity": sc(3, ""), "originality": sc(4, ""), "tech_risk": sc(1, "Tiny canopies collapse in turbulence.")},
    "bold_hypothesis": "A soft wing is the safest gravity follower.", "falsification_test": "calc: follow share", "kill_criteria": ["follow share <70 %"],
    "sim_plan": {"what_to_model": "none (killed)", "states": [], "scenarios": [], "metrics": []},
    "prior_art": [{"name": "Atair Micro-Onyx guided parafoil", "url": U["microonyx"], "relevance": "autonomous small parafoil"},
                  {"name": "MIT guided parafoil thesis 2005", "url": U["mit_parafoil"], "relevance": ""},
                  {"name": "Atair Leapp/MicroLeapp", "url": U["leapp"], "relevance": "powered parafoil UAV"}],
    "novelty": "Guided parafoils exist for payload delivery; none for following people.", "user_sequence": [],
    "verdict": "KILLED: L/D about 3 gives gravity-following on only 17 % of skiing time; the speed window is 8.2-13.8 m/s.",
})

# ======================================================================== kills I-06..I-14
def kill(id_, en, zh, one, principle, nums, prior, verdict, novelty="see prior_art"):
    return {"id": id_, "lens": "inventor", "name_en": en, "name_zh": zh, "one_liner": one, "principle": principle,
            "architecture": {}, "viewpoints": [], "key_numbers": nums,
            "scores": {}, "bold_hypothesis": "", "falsification_test": "magnitude calc (calc_kills_and_variants.py / calc_slope_glider.py)",
            "kill_criteria": [], "sim_plan": {}, "prior_art": prior, "novelty": novelty, "user_sequence": [], "verdict": verdict}


GE = SG["I-06 ground_effect_v10"]
concepts.append(kill("I-06", "Ground-effect snow skimmer (WIG follower at 0.2-0.8 m)", "地效贴雪跟拍翼",
                     "Fly the glider in ground effect, low behind the skier, for a better L/D and a low cinematic angle.",
                     "Ground effect only matters at h/b < 0.15. For a 0.73 m span that means 0.1 m, where moguls and skis are.",
                     {"LD_gain_h0.4": kn(GE["h0.4"]["gain_pct"], "%", "calc", "McCormick phi"), "LD_gain_h0.1": kn(GE["h0.1"]["gain_pct"], "%", "calc", "")},
                     [{"name": "Regent seaglider", "url": U["regent"], "relevance": "WIG over water"}, {"name": "Flying Ship sea-skimmer", "url": U["flyingship"], "relevance": ""}],
                     "KILLED: 0.2 % L/D gain at 0.4 m, and at knee height it is a strike hazard to other skiers' legs and on moguls."))
concepts.append(kill("I-07", "Unpowered self-steering snow pod follower", "无动力自转向雪面跟拍舱",
                     "A 130 g sled with a mast that slides behind the skier on gravity, braking with a drag flap.",
                     "The KE cap forces 0.13-0.21 kg. At 10 m/s a mogul crest gives 5 g, so the pod goes airborne, and it sits in other skiers' paths.",
                     {"max_mass_15ms": kn(KL["I-07 snow_pod"]["at_15"], "kg", "calc", ""), "mogul_g": kn(KL["I-07 snow_pod"]["mogul_vertical_accel_g_v10_R2m"], "g", "calc", "")},
                     [{"name": "Round-1 BODY-09/BODY-10 sled and robot", "url": "research/concepts_2026_10_18/body/concepts.json", "relevance": "killed snow carriers"}],
                     "KILLED: trip hazard on the piste, uncontrollable over moguls, low occluded view."))
concepts.append(kill("I-08", "Supercapacitor sprint micro-quad recharged on the lift", "超级电容冲刺微型机（缆车上充电）",
                     "Lithium-free, cold-proof quad that flies 60 s highlights on a supercap topped up in 20 s.",
                     "A 60 s follow needs 0.5 Wh, which at 5.4 Wh/kg is 123 g of supercap against 4 g of Li-ion.",
                     {"supercap_mass": kn(KL["I-08 supercap"]["supercap_mass_g"], "g", "calc+lit", U["maxwell"]),
                      "glider_run_supercap": kn(KL["I-08 supercap"]["glider_run_supercap_g"], "g", "calc", "a glider would need 48 g")},
                     [{"name": "Maxwell 3V 50F datasheet 5.4 Wh/kg", "url": U["maxwell"], "relevance": ""}],
                     "KILLED: mass. A glider could use one (48 g), but it is not worth it over a heated Li-ion cell."))
concepts.append(kill("I-09", "Ionic-wind (EAD) silent follower", "离子风无声跟拍机",
                     "Use solid-state ion propulsion (MIT 2018) for a silent glider-follower.",
                     "Thrust 0.13 N at 5-9 N/kW needs 14-25 W against 2.5 W for a propeller, with 40 kV near people and snow and humidity.",
                     {"power": kn(KL["I-09 ion"]["T_per_kW_8.9"]["power_W"], "W", "calc", "8.9 N/kW best lit"), "prop_power": kn(KL["I-09 ion"]["prop_power_W"], "W", "calc", "")},
                     [{"name": "MIT ionic-wind plane", "url": U["ion"], "relevance": "5 N/kW, 2.45 kg"}, {"name": "TU Graz thrust-to-power 8.9 N/kW", "url": U["ion_tp"], "relevance": ""}],
                     "KILLED: 6-10x the power of a propeller, and on slopes gravity needs no thrust at all."))
concepts.append(kill("I-11", "Slope-soaring / katabatic station keeping at stops", "坡面升力/下坡风定点盘旋",
                     "Keep the glider aloft while the skier stands, using slope lift, the way RC slope soarers do.",
                     "Needs about 1.8 m/s of upslope wind on a 20 deg slope. Over cold snow the drainage flow is usually 2-4 m/s DOWNslope, which gives sink.",
                     {"upslope_needed": kn(KL["I-11 soaring"]["upslope_wind_needed_m_s_20deg"], "m/s", "calc", "")},
                     [{"name": "AMS glossary katabatic wind", "url": U["katabatic"], "relevance": "3-4 m/s typical"}, {"name": "EGU22-6441 alpine slope flow", "url": U["egu_slope"], "relevance": "2-3 m/s near surface"}],
                     "KILLED as a mode the product relies on; opportunistic on windward ridges only."))
concepts.append(kill("I-12", "Chairlift-drop height bank", "缆车投放储能",
                     "Release the glider from the chair near the top to bank 5-15 m of extra height.",
                     "Gives 12 J per 10 m, which is useful, but throwing objects from a lift is illegal or against resort rules.",
                     {"energy_per_10m": kn(KL["I-12 chairdrop"]["extra_energy_J_per_10m"], "J", "calc", "")},
                     [{"name": "Colorado C.R.S. 33-44-105 (no throwing/expelling objects from a lift)", "url": U["colorado"], "relevance": ""}],
                     "KILLED: legal and conduct rules."))
concepts.append(kill("I-13", "Shadow cam: helmet camera films the skier's own shadow", "影子相机：头盔相机拍自己的影子",
                     "The low winter sun projects a true third-person silhouette onto the snow; a rear/down helmet camera records it.",
                     "Shadow 1.9-4.7 m long at 46 N. It is visible only with the sun behind (~1/3 of headings) and is a silhouette, not the skier.",
                     {"shadow_len_dec": kn(KL["I-13 shadow"]["Dec"]["shadow_len_m"], "m", "calc", "")}, [],
                     "KILLED as a product (not real appearance footage); possible free bonus clip in any helmet cam.", novelty="not searched (shadow selfies are a common photo genre)"))
concepts.append(kill("I-14", "Silicon-anode battery follow quad (cross-industry battery check)", "硅负极电池跟拍四旋翼（跨行业电池检验）",
                     "Apply 2025 450 Wh/kg cells (Amprius SiCore) to fix drone endurance.",
                     "A 249 g quad needs about 52 W. 45 min cold needs 150 g of cells, which leaves ~100 g for everything else, and KE at 12 m/s is 17.9 J > 14.9.",
                     {"battery_g": kn(KL["I-14 si_quad"]["battery_g"], "g", "calc", ""), "KE_12": kn(KL["I-14 si_quad"]["KE_at_12_J"], "J", "calc", "")},
                     [{"name": "Amprius SiCore 450 Wh/kg", "url": U["amprius"], "relevance": "no cold data"}, {"name": "HoverAir", "url": U["hoverair"], "relevance": ""}],
                     "KILLED: batteries do not fix the hover-power x KE corner; changing the energy source (gravity) does."))

concepts.sort(key=lambda c: c["id"])
json.dump({"lens": "inventor", "date": "2026-10-19",
           "evidence_boundary": "magnitude calculations with ASSUMED parameters and literature; no physical tests (M-070 NOT_RUN, G-MATURE closed)",
           "reproduce": "python3 calc_slope_glider.py && python3 calc_leash_reel.py && python3 calc_kills_and_variants.py && python3 build_concepts.py",
           "concepts": concepts}, open(os.path.join(HERE, "concepts.json"), "w"), indent=1, ensure_ascii=False)

ranking = {
    "date": "2026-10-19", "method": "1-5 per axis: originality, footage (x2), interference, convenience, safety, simplicity, tech_risk (5=low risk); physics kills excluded",
    "top4": [
        {"rank": 1, "id": "I-05", "why": "Gravity pays for the flight and the leash pays only the deficit (p99 0.4 N vs kite 12-38 N). Hands-free launch and dock, ~430 px, 52 min.", "biggest_risk": "thin line behind the skier (hazard to others/snags) and the regulatory class"},
        {"rank": 2, "id": "I-03", "why": "Free viewpoint; landing and waiting in the snow cuts hover to ~10 s per segment, giving 44 min vs 9 min hover-only", "biggest_risk": "tail-sitter transition in gusts near snow; tipping over above ~6-7 m/s wind"},
        {"rank": 3, "id": "I-01", "why": "Simplest proof of the slope-energy principle; no tether, no motor", "biggest_risk": "headwind (32 % follow at 5 m/s) and a pick-up at every stop"},
        {"rank": 4, "id": "I-10", "why": "Most surprising: lead-and-snatch with the skier's pole; best used as a mode of I-05/I-01", "biggest_risk": "pole aim reliability (60-79 % hit) and self-placed-camera scope"},
    ],
    "scores": {c["id"]: {k: v["score"] for k, v in c["scores"].items()} for c in concepts if c["scores"]},
    "killed": {c["id"]: c["verdict"] for c in concepts if c["verdict"].startswith("KILLED")},
    "note_for_kite_workstream": "I-05 is not a kite: lift balances weight by gliding and the tether carries only drag deficit; the kite agent may reuse the reel/funnel dock and the sled-tow+winch launch.",
}
json.dump(ranking, open(os.path.join(HERE, "ranking.json"), "w"), indent=1, ensure_ascii=False)
print("concepts:", [c["id"] for c in concepts])
