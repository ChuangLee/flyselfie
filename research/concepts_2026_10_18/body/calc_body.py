#!/usr/bin/env python3
"""RES-040 body lens: what a body-borne boom does to the skier (loads, inertia, falls, snags).
Uses results_boom.json (run calc_boom.py first). Outputs results_body.json."""
import json, math, os

G = 9.81
HERE = os.path.dirname(os.path.abspath(__file__))
boom = json.load(open(os.path.join(HERE, "results_boom.json")))
M_SKIER = 75.0
I_YAW_BODY = (1.0, 2.0)       # brief
I_ROLL_FEET = (10.0, 15.0)    # brief
SKIER_CDA = (0.4, 0.6)        # m^2 upright recreational skier (assumed, lit order)
DYN_FACTOR = 2.0              # transient load factor on top of quasi-static turn load (assumed)


def pick(name, L):
    return next(c for c in boom["cases"] if c["name"] == name and abs(c["L_m"] - L) < 1e-6)


def main():
    rows = []
    for name, L in [("tube OD20x1.0 Emid telescoping+damper", 1.5), ("tube OD20x1.0 Emid telescoping+damper", 2.0),
                    ("tube OD25x1.2 Emid telescoping+damper", 2.0), ("tube OD25x1.2 Emid telescoping+damper", 2.5),
                    ("CTM 50x16x0.3 strong-axis(sagittal)", 2.0), ("CTM 50x16x0.3 strong-axis(sagittal)", 2.5)]:
        c = pick(name, L)
        sys_mass = c["boom_mass_kg"] + 0.2 + 0.35      # + tip camera + root frame/hip-belt hardware (assumed)
        reach = c["reach_m"]
        com_shift = (0.2 * reach + c["boom_mass_kg"] * reach / 2) / (M_SKIER + sys_mass)
        M_op = c["root_moment_turn_Nm"] * DYN_FACTOR
        fuse = 1.5 * M_op
        q = 0.5 * 1.2 * 15 ** 2
        skier_drag = [q * a for a in SKIER_CDA]
        rows.append(dict(
            case=f"{name} L={L}", system_mass_kg=round(sys_mass, 2),
            com_shift_mm=round(com_shift * 1e3, 1),
            yaw_I_added_pct=[round(100 * c["I_yaw_added_kgm2"] / i) for i in I_YAW_BODY],
            roll_I_added_pct=[round(100 * c["I_roll_added_kgm2"] / i, 1) for i in I_ROLL_FEET],
            root_moment_quasistatic_turn_Nm=c["root_moment_turn_Nm"],
            root_moment_operating_peak_Nm=round(M_op, 1),
            breakaway_fuse_setting_Nm=round(fuse, 1),
            boom_failure_moment_Nm=c["root_M_fail_Nm"],
            fuse_to_failure_ratio=round(c["root_M_fail_Nm"] / fuse, 1),
            snag_force_at_tip_with_fuse_N=round(fuse / L, 1),
            snag_force_at_tip_no_fuse_N=round(c["root_M_fail_Nm"] / L, 1),
            boom_drag_pct_of_skier=[round(100 * c["drag_15ms_N"] / d, 1) for d in skier_drag],
            KE_tip_hardware_15ms_J=round(0.5 * (0.2 + c["boom_mass_kg"]) * 15 ** 2, 1),
            tip_sweep_radius_yaw_m=reach,
            protrusion_behind_hip_m=reach,
        ))
    # fall backward: torso pivots about feet; tip hits snow when body leans back by beta
    falls = []
    for L, alpha in [(1.5, 30), (2.0, 30), (2.5, 35)]:
        h_root, a = 1.0, math.radians(alpha)
        # body+boom rigid rotation backward by beta about feet: tip height = h_root*cos(b) + L*sin(a - b)
        beta = next(b for b in range(0, 91) if h_root * math.cos(math.radians(b)) + L * math.sin(a - math.radians(b)) <= 0.0)
        falls.append(dict(L_m=L, alpha_deg=alpha, lean_back_deg_at_tip_contact=beta,
                          note="tip contacts snow before buttocks if beta < ~45-60 deg: boom becomes a lever into the lumbar belt; needs fold-down fuse"))
    # chairlift: seat back ~0.45 m behind hip; boom must be stowed below this protrusion
    lift = dict(seat_back_clearance_m=0.10, max_stowed_protrusion_m=0.10,
                note="any boom protruding > ~0.1 m behind the back hits the seat back / other riders; stowing is mandatory (assumed geometry)")
    out = dict(rows=rows, falls=falls, chairlift=lift,
               assumptions=dict(M_SKIER=M_SKIER, DYN_FACTOR=DYN_FACTOR, SKIER_CDA=SKIER_CDA))
    json.dump(out, open(os.path.join(HERE, "results_body.json"), "w"), indent=1)
    for r in rows:
        print(json.dumps(r))
    for f in falls:
        print(f)
    print(lift)


if __name__ == "__main__":
    main()
