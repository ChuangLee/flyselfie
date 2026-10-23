#!/usr/bin/env python3
"""RES-040 body lens: towed camera sled and autonomous snow robot first-principles numbers.
Friction ranges: ski kinetic friction ~0.03-0.1 rising with speed 5-22 m/s (Kuroiwa, lit);
modern 0.005-0.14 depending on snow (lit). Tracked-vehicle motion resistance on snow 0.1-0.3
incl. compaction (assumed). Outputs results_snow.json."""
import json, math, os

G = 9.81
RHO = 1.2


def sled():
    m, cda = 3.0, 0.03                    # 3 kg sled+mast+360 cam, frontal CdA (assumed)
    out = {"mass_kg": m, "CdA_m2": cda}
    # tow force on groomed flat run-out vs on slope (sled is gravity-driven like the skier)
    tf = []
    for mu in (0.03, 0.06, 0.10, 0.20):
        for v in (10.0, 15.0, 20.0):
            for slope in (0.0, 10.0, 20.0):
                th = math.radians(slope)
                F = m * G * (mu * math.cos(th) - math.sin(th)) + 0.5 * RHO * v * v * cda
                tf.append(dict(mu=mu, v=v, slope_deg=slope, tow_force_N=round(F, 1)))
    out["tow_force"] = tf
    # traverse: sled has no edges -> slides down the fall line, tether supplies cross-slope force
    out["cross_slope_force_20deg_N"] = round(m * G * math.sin(math.radians(20)), 1)
    # turn: tether-inside cut (steady circle) and centripetal tether load
    turns = []
    for R in (8.0, 15.0, 25.0):
        for Lt in (3.0, 5.0, 8.0):
            if Lt >= R:
                continue
            r_sled = math.sqrt(R * R - Lt * Lt)
            for v in (10.0, 15.0):
                turns.append(dict(R=R, tether=Lt, v=v, sled_radius=round(r_sled, 2), cut_inside_m=round(R - r_sled, 2),
                                  sled_speed=round(v * r_sled / R, 1),
                                  centripetal_N=round(m * (v * r_sled / R) ** 2 / r_sled, 1)))
    out["turns"] = turns
    # alternating turns: lateral swing of sled ~ like a whip; amplitude estimate from turn-shape offset
    # stopping: skier hockey-stops at 0.8 g; sled at mu 0.06 decelerates at <0.06 g (+slope makes it worse)
    for v in (10.0, 15.0):
        t_stop = v / (0.8 * G)
        d_skier = v * v / (2 * 0.8 * G)
        a_sled = G * (0.06 * math.cos(math.radians(15)) - math.sin(math.radians(15)))
        out[f"stop_from_{int(v)}"] = dict(skier_stop_s=round(t_stop, 2), skier_stop_m=round(d_skier, 1),
                                         sled_decel_on_15deg_ms2=round(a_sled, 2),
                                         sled_KE_J=round(0.5 * m * v * v, 0),
                                         sled_needs_own_brake=a_sled > -0.5 * G)
        # passive claw brake triggered by slack tether, mu_brake 0.5
        a_b = G * (0.5 * math.cos(math.radians(15)) - math.sin(math.radians(15)))
        out[f"stop_from_{int(v)}"]["claw_brake_stop_m"] = round(v * v / (2 * a_b), 1)
    # mogul/air: sled at 15 m/s off a 0.5 m mogul crest ~ ballistic; airtime ~ 2*sqrt(2h/g)
    out["mogul_airtime_s_h0p5"] = round(2 * math.sqrt(2 * 0.5 / G), 2)
    return out


def robot():
    out = []
    for m in (8.0, 15.0, 25.0):
        for crr in (0.05, 0.15, 0.3):
            for v in (5.0, 10.0, 15.0):
                cda = 0.08
                F_flat = crr * m * G + 0.5 * RHO * v * v * cda
                out.append(dict(m=m, crr=crr, v=v, P_flat_W=round(F_flat * v), P_uphill5deg_W=round((F_flat + m * G * math.sin(math.radians(5))) * v)))
    # lateral grip limit vs skier turns
    grip = []
    for mu_lat in (0.2, 0.4, 0.6):
        for v in (10.0, 15.0):
            grip.append(dict(mu_lat=mu_lat, v=v, min_radius_m=round(v * v / (mu_lat * G), 1)))
    # fall-line shortcut: robot travels straight downhill at skier's mean downslope speed
    shortcut = [dict(mean_heading_deg=h, downslope_speed_at_15=round(15 * math.cos(math.radians(h)), 1)) for h in (20, 35, 50)]
    # braking on slope
    brake = []
    for mu_b in (0.3, 0.5, 0.8):
        for slope in (10, 20, 30):
            a = G * (mu_b * math.cos(math.radians(slope)) - math.sin(math.radians(slope)))
            brake.append(dict(mu_b=mu_b, slope=slope, decel=round(a, 2),
                              stop_from_12_m=(round(144 / (2 * a), 1) if a > 0 else None)))
    ke = [dict(m=m, v=12.0, KE_J=round(0.5 * m * 144)) for m in (8.0, 15.0, 25.0)]
    # battery: energy for a 2 min run at 300-800 W average
    batt = [dict(P_W=p, run_s=120, Wh=round(p * 120 / 3600, 1), Li_kg_at_150Whkg_x2cold=round(2 * p * 120 / 3600 / 150, 2)) for p in (300, 800)]
    return dict(power=out, grip=grip, fall_line_shortcut=shortcut, brake=brake, KE=ke, battery_per_run=batt)


def main():
    res = dict(sled=sled(), robot=robot())
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results_snow.json")
    json.dump(res, open(path, "w"), indent=1)
    s = res["sled"]
    print("sled tow force (selected):")
    for r in s["tow_force"]:
        if r["v"] == 15.0:
            print(" ", r)
    print("cross-slope force 20deg:", s["cross_slope_force_20deg_N"], "N")
    print("turns:"); [print(" ", t) for t in s["turns"] if t["v"] == 15.0]
    print("stop:", s["stop_from_10"], s["stop_from_15"], "mogul air", s["mogul_airtime_s_h0p5"])
    r = res["robot"]
    print("robot power (m=15):"); [print(" ", x) for x in r["power"] if x["m"] == 15.0]
    print("grip:", r["grip"]); print("shortcut:", r["fall_line_shortcut"]); print("brake:", r["brake"])
    print("KE:", r["KE"]); print("battery:", r["battery_per_run"]); print("wrote", path)


if __name__ == "__main__":
    main()
