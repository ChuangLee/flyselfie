#!/usr/bin/env python3
"""RES-040 body lens: viewpoint geometry, 360 reframing resolution, stick-hiding condition.

Skier modelled as a 1.75 m vertical segment (feet at origin, standing frame; in a turn the
geometry is body-fixed for body-borne carriers, so body frame is the right frame).
Camera positions are given in body frame: x = behind (+), z = up, y = lateral.
Outputs results_imaging.json.
"""
import json, math, os

H = 1.75
EQUI = {"5.7K": 5760, "8K": 7680}          # equirect width px over 360 deg (lit: Insta360 X4/X5 class)
OUT_W, OUT_H = 1920, 1080                   # reframed delivery
LENS_BASELINE = 0.030                       # m, back-to-back entrance pupil separation (assumed)
FISHEYE_HALF = 100.0                        # deg per lens half-FOV (assumed ~200 deg lenses)


def subtend(cam, p0, p1):
    def vec(p):
        return [p[i] - cam[i] for i in range(3)]
    a, b = vec(p0), vec(p1)
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)); nb = math.sqrt(sum(x * x for x in b))
    return math.degrees(math.acos(max(-1, min(1, dot / na / nb)))), na, nb


def view(name, cam, notes=""):
    ang, d_feet, d_head = subtend(cam, (0, 0, 0), (0, 0, H))
    centre = (0, 0, H / 2)
    d_c = math.dist(cam, centre)
    horiz = math.hypot(cam[0], cam[1])
    elev = math.degrees(math.atan2(cam[2] - H / 2, horiz))   # camera elevation seen from body centre
    out = dict(name=name, cam_xyz_m=cam, distance_to_centre_m=round(d_c, 2), elevation_deg=round(elev, 1),
               body_subtends_deg=round(ang, 1), head_vs_feet_scale_ratio=round(d_feet / d_head, 2), notes=notes)
    for k, w in EQUI.items():
        ppd = w / 360.0
        out[f"body_px_native_{k}"] = round(ang * ppd)
    # with a 16:9 reframe of vertical FOV chosen so body = 50% of frame height (rectilinear approx)
    vfov = min(2 * math.degrees(math.atan(2 * math.tan(math.radians(ang / 2)))), 120)
    hfov = 2 * math.degrees(math.atan(math.tan(math.radians(vfov / 2)) * OUT_W / OUT_H))
    out["reframe_vfov_for_body_50pct_deg"] = round(vfov, 1)
    out["reframe_hfov_deg"] = round(hfov, 1)
    for k, w in EQUI.items():
        ppd = w / 360.0
        src_px_across = hfov * ppd       # centre-of-crop approximation
        out[f"source_px_across_crop_{k}"] = round(src_px_across)
        out[f"upsample_factor_{k}"] = round(OUT_W / src_px_across, 2)
    # how much environment: for fixed 90 deg HFOV crop body fraction of frame height
    vf90 = 2 * math.degrees(math.atan(math.tan(math.radians(45)) * OUT_H / OUT_W))
    out["body_frac_height_in_90deg_hfov_crop"] = round(min(1.0, math.tan(math.radians(ang / 2)) / math.tan(math.radians(vf90 / 2))), 2)
    return out


def stick_hiding():
    """Back-to-back dual fisheye; each hemisphere is cropped at the seam plane (90 deg).
    A stick lying IN the seam plane is invisible if its half-width < half the baseline (it lies in
    the slab neither cropped hemisphere sees). If the stick axis is tilted out of plane by gamma or
    bends laterally by delta, it emerges where offset + D/2 > b/2."""
    res = []
    for D in (0.010, 0.016, 0.020, 0.025, 0.030):
        margin = (LENS_BASELINE - D) / 2
        row = dict(stick_D_mm=D * 1e3, slab_margin_mm=round(margin * 1e3, 1), hidden_in_plane=margin > 0)
        for r in (0.5, 1.0, 2.0):
            row[f"max_tilt_deg_hidden_to_r{r}m"] = round(math.degrees(math.atan(margin / r)), 3) if margin > 0 else None
        res.append(row)
    # angular size of the stick seen in the overlap band (parallax visibility of the far end)
    overlap = FISHEYE_HALF - 90.0
    return dict(baseline_m=LENS_BASELINE, lens_half_fov_deg=FISHEYE_HALF, overlap_band_deg=overlap, rows=res,
                note="Seam-plane alignment: put boom sag (largest deflection, sagittal) inside the seam plane; lateral bending must stay < slab margin or the stick shows.")


def main():
    views = [
        view("tail boom 1.5 m @30deg from hip (1.0 m)", (1.5 * math.cos(math.radians(30)), 0, 1.0 + 0.75), "rear, close: selfie-like"),
        view("tail boom 2.0 m @30deg", (2.0 * math.cos(math.radians(30)), 0, 2.0), "rear-high"),
        view("tail boom 2.5 m @35deg", (2.5 * math.cos(math.radians(35)), 0, 1.0 + 2.5 * math.sin(math.radians(35))), "rear-high, drone-ish"),
        view("tail boom 3.0 m @35deg", (3.0 * math.cos(math.radians(35)), 0, 1.0 + 3.0 * math.sin(math.radians(35))), "limit length"),
        view("rear-quarter boom 2.0 m, 40deg off-axis", (1.73 * math.cos(math.radians(40)), 1.73 * math.sin(math.radians(40)), 2.0), "3/4 rear; asymmetric"),
        view("overhead mast 1.6 m above shoulders, tilted 25deg back", (1.6 * math.sin(math.radians(25)), 0, 1.5 + 1.6 * math.cos(math.radians(25))), "top-down-ish"),
        view("helmet stick 0.6 m rear-up", (0.45, 0, 1.75 + 0.4), "very close, extreme perspective"),
        view("ski-pole stick 1.1 m held forward-low", (-1.3, 0.3, 0.9), "front-low; arm-dependent"),
        view("towed sled mast 1.4 m at 5 m tether", (5.0, 0, 1.4), "rear-low, true follow-cam"),
        view("snow robot mast 1.8 m at 8 m behind", (8.0, 0, 1.8), "rear, more environment"),
        view("reference drone follow 10 m back 4 m up", (10 * math.cos(math.radians(20)), 0, 4.0), "aerial benchmark (not this lens)"),
    ]
    out = dict(assumptions=dict(H=H, EQUI=EQUI, out=(OUT_W, OUT_H)), views=views, stick=stick_hiding(),
               px_per_deg={k: round(w / 360, 2) for k, w in EQUI.items()},
               px_across_90deg={k: round(90 * w / 360) for k, w in EQUI.items()})
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results_imaging.json")
    json.dump(out, open(path, "w"), indent=1)
    print("px/deg", out["px_per_deg"], "px across 90deg crop", out["px_across_90deg"])
    for v in views:
        print(f"{v['name']:<55} d={v['distance_to_centre_m']:5.2f} el={v['elevation_deg']:5.1f} body={v['body_subtends_deg']:5.1f}deg "
              f"px5.7K={v['body_px_native_5.7K']:4d} px8K={v['body_px_native_8K']:4d} scale={v['head_vs_feet_scale_ratio']} "
              f"vfov50={v['reframe_vfov_for_body_50pct_deg']} up5.7K={v['upsample_factor_5.7K']} frac90={v['body_frac_height_in_90deg_hfov_crop']}")
    print("stick:", json.dumps(out["stick"], indent=1))
    print("wrote", path)


if __name__ == "__main__":
    main()
