#!/usr/bin/env python3
"""Observability of a skier's body surface from body-worn / boom cameras vs a
virtual third-person viewpoint.

Question: if we want to *render* a view from e.g. 3 m behind / 2 m above the
skier, how much of the surface that this virtual camera would see has actually
been observed by any real camera we carry?  Whatever is not observed must be
hallucinated (generated), which the project forbids passing off as real footage.

Model (all ASSUMED, order-of-magnitude):
  * skier in a mid-crouch, facing +y (downhill), z up, as 13 capsules
  * cameras treated as OMNIDIRECTIONAL (optimistic upper bound: no FOV limit)
  * a surface point counts as "observed" by a camera if it is unoccluded and
    the incidence angle (surface normal vs ray) is < 75 deg (grazing views give
    useless texture), and the camera is >= 0.12 m away (lens near-focus / not
    the mount itself)
  * area-weighted; static single pose (temporal accumulation discussed below)
Run:  python3 calc_multiview_coverage.py
"""
import numpy as np

rng = np.random.default_rng(1)

# ---------------- body model: (p0, p1, radius) -----------------------------
def caps():
    c = []
    c.append(((0, 0.00, 0.95), (0, 0.15, 1.40), 0.16))   # torso
    c.append(((0, 0.20, 1.56), (0, 0.20, 1.56), 0.12))   # head+helmet (sphere)
    for s in (-1, 1):
        c.append(((s*0.20, 0.12, 1.38), (s*0.30, 0.30, 1.10), 0.05))  # upper arm
        c.append(((s*0.30, 0.30, 1.10), (s*0.32, 0.58, 1.02), 0.045)) # forearm
        c.append(((s*0.10, 0.00, 0.92), (s*0.12, 0.32, 0.52), 0.085)) # thigh
        c.append(((s*0.12, 0.32, 0.52), (s*0.12, 0.10, 0.12), 0.065)) # shin
        c.append(((s*0.12, 0.10, 0.12), (s*0.12, 0.28, 0.06), 0.07))  # boot
    return [(np.array(a, float), np.array(b, float), r) for a, b, r in c]

CAPS = caps()
SKIS = [(np.array((s*0.12, -0.80, 0.02)), np.array((s*0.12, 0.90, 0.02)), 0.025) for s in (-1, 1)]
OCCLUDERS = CAPS + SKIS


def sample_capsule(p0, p1, r, n):
    """Uniform-ish area samples on capsule surface -> points, normals."""
    ax = p1 - p0
    L = np.linalg.norm(ax)
    a_cyl = 2*np.pi*r*L
    a_sph = 4*np.pi*r*r
    n_cyl = int(n*a_cyl/(a_cyl+a_sph)) if L > 1e-6 else 0
    n_sph = n - n_cyl
    pts, nrm = [], []
    if n_cyl:
        u = ax/L
        tmp = np.array([1, 0, 0]) if abs(u[0]) < 0.9 else np.array([0, 1, 0])
        e1 = np.cross(u, tmp); e1 /= np.linalg.norm(e1)
        e2 = np.cross(u, e1)
        t = rng.random(n_cyl)*L
        th = rng.random(n_cyl)*2*np.pi
        nn = np.outer(np.cos(th), e1) + np.outer(np.sin(th), e2)
        pts.append(p0 + np.outer(t, u) + r*nn); nrm.append(nn)
    if n_sph:
        v = rng.normal(size=(n_sph, 3)); v /= np.linalg.norm(v, axis=1)[:, None]
        if L > 1e-6:
            u = ax/L
            side = (v @ u) > 0
            ctr = np.where(side[:, None], p1, p0)
        else:
            ctr = np.broadcast_to(p0, v.shape)
        pts.append(ctr + r*v); nrm.append(v)
    return np.vstack(pts), np.vstack(nrm), (a_cyl+a_sph)


def inside_capsule(P, p0, p1, r, shrink=1e-3):
    ax = p1 - p0
    L2 = ax @ ax
    if L2 < 1e-12:
        d = np.linalg.norm(P-p0, axis=1)
    else:
        t = np.clip(((P-p0) @ ax)/L2, 0, 1)
        d = np.linalg.norm(P-(p0+np.outer(t, ax)), axis=1)
    return d < r - shrink


def ray_hits_capsule(O, D, tmax, p0, p1, r):
    """O: (3,) origin, D: (N,3) unit dirs, tmax: (N,). Approximate: march along
    the ray with closest-approach test on the segment (analytic via sampling)."""
    # analytic segment-ray distance minimisation by dense t sampling (robust, simple)
    ts = np.linspace(0, 1, 48)[None, :]*tmax[:, None]           # (N,48)
    Pts = O[None, None, :] + D[:, None, :]*ts[..., None]          # (N,48,3)
    ax = p1 - p0; L2 = ax @ ax
    if L2 < 1e-12:
        d = np.linalg.norm(Pts-p0, axis=2)
    else:
        t = np.clip(((Pts-p0) @ ax)/L2, 0, 1)
        d = np.linalg.norm(Pts-(p0+t[..., None]*ax), axis=2)
    # ignore the last 2 cm before the target point (self surface)
    valid = ts < (tmax[:, None]-0.02)
    return np.any((d < r) & valid, axis=1)


def visible(P, Nn, cam, max_inc_deg=75.0, min_dist=0.12):
    V = cam[None, :] - P
    dist = np.linalg.norm(V, axis=1)
    Vu = V/dist[:, None]
    cosinc = np.sum(Vu*Nn, axis=1)
    ok = (cosinc > np.cos(np.radians(max_inc_deg))) & (dist > min_dist)
    idx = np.where(ok)[0]
    if len(idx):
        D = -Vu[idx]
        tmax = dist[idx]
        blocked = np.zeros(len(idx), bool)
        for (p0, p1, r) in OCCLUDERS:
            blocked |= ray_hits_capsule(cam, D, tmax, p0, p1, r)
        ok[idx[blocked]] = False
    return ok, cosinc, dist


# ---------------- build surface samples -----------------------------------
P_list, N_list, W_list = [], [], []
for (p0, p1, r) in CAPS:
    P, Nn, A = sample_capsule(p0, p1, r, 700)
    keep = np.ones(len(P), bool)
    for (q0, q1, rr) in CAPS:
        if q0 is p0 and q1 is p1:
            continue
        keep &= ~inside_capsule(P, q0, q1, rr)
    P_list.append(P[keep]); N_list.append(Nn[keep]); W_list.append(np.full(keep.sum(), A/len(P)))
P = np.vstack(P_list); Nn = np.vstack(N_list); W = np.concatenate(W_list)
TOTAL_AREA = W.sum()

# ---------------- cameras --------------------------------------------------
HEAD_TOP = np.array([0, 0.18, 1.71])
REAL = {
    "helmet_360":      [HEAD_TOP],
    "chest":           [np.array([0, 0.34, 1.22])],
    "wrists(2)":       [np.array([-0.33, 0.62, 1.02]), np.array([0.33, 0.62, 1.02])],
    "ski_tips(2)":     [np.array([-0.12, 0.88, 0.10]), np.array([0.12, 0.88, 0.10])],
    "ski_tails(2)":    [np.array([-0.12, -0.78, 0.10]), np.array([0.12, -0.78, 0.10])],
    "boom_1.2m_rear":  [np.array([0, -1.0, 2.20])],      # backpack boom tip, 360
    "boom_stereo_0.3": [np.array([-0.15, -1.0, 2.20]), np.array([0.15, -1.0, 2.20])],
}
VIRTUAL = {
    "rear_high_3m_back_2m_up": np.array([0, -3.0, 1.75+2.0]),
    "side_3m":                 np.array([3.0, 0.15, 1.3]),
    "front34_4m":              np.array([2.5, 3.5, 1.2]),
    "rear34_3m":               np.array([2.1, -2.1, 2.2]),
    "near_boom_+10deg":        None,   # filled below: boom tip rotated 10 deg about skier vertical axis
}
# near-boom virtual: rotate boom tip about vertical axis through pelvis by 10 deg
b = REAL["boom_1.2m_rear"][0]
th = np.radians(10)
VIRTUAL["near_boom_+10deg"] = np.array([b[0]*np.cos(th)-b[1]*np.sin(th), b[0]*np.sin(th)+b[1]*np.cos(th), b[2]])

real_vis = {k: np.any([visible(P, Nn, c)[0] for c in cs], axis=0) for k, cs in REAL.items()}

combos = {
    "helmet only":                        ["helmet_360"],
    "helmet+chest":                       ["helmet_360", "chest"],
    "all body-worn (6 cams, no boom)":    ["helmet_360", "chest", "wrists(2)", "ski_tips(2)", "ski_tails(2)"],
    "boom 360 only":                      ["boom_1.2m_rear"],
    "boom stereo (2)":                    ["boom_stereo_0.3"],
    "all body-worn + boom":               ["helmet_360", "chest", "wrists(2)", "ski_tips(2)", "ski_tails(2)", "boom_1.2m_rear"],
}

print(f"skier surface area model: {TOTAL_AREA:.2f} m^2 (real adult ~1.8-2.0 m^2 incl. clothing; capsule model is coarse)")
print("Fraction of the surface visible from each VIRTUAL viewpoint that is OBSERVED by real cameras")
print("(area-weighted, single pose, omnidirectional real cameras = optimistic upper bound)\n")
hdr = f"{'virtual viewpoint':28s} {'vis.area m2':>11s} " + " ".join(f"{k[:22]:>22s}" for k in combos)
print(hdr)
results = {}
for vn, vc in VIRTUAL.items():
    vv, _, _ = visible(P, Nn, vc)
    va = W[vv].sum()
    row = f"{vn:28s} {va:11.3f} "
    results[vn] = {}
    for cn, members in combos.items():
        obs = np.any([real_vis[m] for m in members], axis=0)
        frac = W[vv & obs].sum()/va
        results[vn][cn] = frac
        row += f"{frac*100:21.1f}% "
    print(row)

# view-angle discrepancy for the rear-high view with all body cams
print("\nView-angle mismatch (rear_high): for observed points, min angle between the virtual ray and any real ray")
vc = VIRTUAL["rear_high_3m_back_2m_up"]
vv, _, _ = visible(P, Nn, vc)
allcams = [c for k in combos["all body-worn (6 cams, no boom)"] for c in REAL[k]]
best = np.full(len(P), 180.0)
for c in allcams:
    ok, _, _ = visible(P, Nn, c)
    rv = (vc-P); rv /= np.linalg.norm(rv, axis=1)[:, None]
    rc = (c-P); rc /= np.linalg.norm(rc, axis=1)[:, None]
    ang = np.degrees(np.arccos(np.clip(np.sum(rv*rc, axis=1), -1, 1)))
    best = np.where(ok, np.minimum(best, ang), best)
m = vv & (best < 180)
if m.any():
    print(f"  median {np.median(best[m]):.0f} deg, 90th pct {np.percentile(best[m], 90):.0f} deg (texture re-projected across large angles -> view-dependent effects/shading are guessed)")

# ---------------- environment parallax -------------------------------------
print("\nEnvironment: parallax between helmet camera and virtual rear-high camera (offset |dc| = %.2f m)" % np.linalg.norm(vc-HEAD_TOP))
dc = np.linalg.norm(vc-HEAD_TOP)
for D in (2, 5, 10, 20, 50, 200):
    print(f"  scene point at {D:4d} m: parallax up to {np.degrees(np.arctan2(dc, D)):5.1f} deg")
print("  => background >~30 m can be re-projected from a helmet 360 with depth; snow/obstacles within ~10 m"
      "\n     behind the skier (the most visible part of a rear chase frame) need depth + disocclusion fill.")

# ---------------- body-cam pixel scale ------------------------------------
print("\nResolution check: ground sample distance (mm/px) on the body for a 360 cam with 5760 px equator (X4/X5 class 8K: 7680)")
for name, d in (("helmet->torso back", 0.55), ("wrist->chest", 0.45), ("ski tip->knee", 0.75), ("boom tip->pelvis", 1.6), ("virtual 3.6 m 4K 60deg", 3.6)):
    if name.startswith("virtual"):
        gsd = 2*3.6*np.tan(np.radians(30))/3840*1000
    else:
        gsd = d*2*np.pi/7680*1000
    print(f"  {name:24s} {gsd:5.2f} mm/px")

import json, os
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out_multiview_coverage.json")
with open(out, "w") as f:
    json.dump({"total_area_m2": float(TOTAL_AREA), "observed_fraction": {k: {kk: round(float(vv_), 3) for kk, vv_ in v.items()} for k, v in results.items()}}, f, indent=1)
print("\nwrote", out)
