#!/usr/bin/env python3
"""Framing, pixel budget, boom dynamics and added inertia for body-anchored
cameras (helmet/chest baseline, handheld 360 stick, backpack 360 boom,
ski-mounted cam).  All inputs ASSUMED unless marked lit.
Run: python3 calc_framing_boom.py
"""
import math

H = 1.75            # standing height (m); in skiing crouch effective ~1.45
H_CROUCH = 1.45
EQ_PX = 7680        # lit: Insta360 X4/X5 8K equirect width (px)
PPD = EQ_PX/360.0   # pixels per degree on the 360 sphere

def subject_angle(cam_xyz, head_z=H_CROUCH, feet_z=0.0, subj_xy=(0.0, 0.0)):
    """angle subtended between feet and head points seen from cam (deg)."""
    cx, cy, cz = cam_xyz
    sx, sy = subj_xy
    import math as m
    a = (sx-cx, sy-cy, feet_z-cz)
    b = (sx-cx, sy-cy, head_z-cz)
    dot = sum(i*j for i, j in zip(a, b))
    na = m.sqrt(sum(i*i for i in a)); nb = m.sqrt(sum(i*i for i in b))
    return m.degrees(m.acos(dot/(na*nb)))

print("== Subject angular size and pixel budget for 360 reframing ==")
print(f"360 sphere: {EQ_PX} px / 360 deg = {PPD:.1f} px/deg (lit; before stitching/compression losses)")
cases = {
    "handheld 360 stick 1.0 m, arm forward-side (cam ~1.1 m from body axis, z 1.5)": (0.8, 0.8, 1.5),
    "backpack boom 1.2 m rear, tip 0.6 m above head (y=-1.0, z=2.2)": (0.0, -1.0, 2.2),
    "backpack boom 2.0 m (y=-1.6, z=2.6)": (0.0, -1.6, 2.6),
    "ski-tip cam looking back (y=+0.85, z=0.1)": (0.0, 0.85, 0.1),
    "virtual drone 6 m rear-high (y=-5, z=4)": (0.0, -5.0, 4.0),
}
for k, c in cases.items():
    ang = subject_angle(c)
    px = ang*PPD
    # to fill 70% of a 1080-px tall output frame the crop vertical FOV = ang/0.7
    vfov = ang/0.7
    src_px_per_out = (vfov*PPD)/1080
    print(f"  {k}\n     body spans {ang:5.1f} deg -> {px:5.0f} source px; crop VFOV for 70% fill = {vfov:5.1f} deg;"
          f" source/out px ratio at 1080p = {src_px_per_out:4.2f} ({'upsampled' if src_px_per_out < 1 else 'ok'})")

print("\n  Note: for very close cameras (boom/ski) the body spans >60 deg so rectilinear crops of it are heavily"
      "\n  stretched at edges and perspective is extreme (big head, tiny skis or vice versa). It is a REAL view,"
      "\n  but from <=1.5 m it cannot look like a 5-10 m chase shot. Environment context is good (360).")

print("\n== Boom dynamics (carbon tube, cantilever from backpack) ==")
E = 70e9            # ASSUMED effective modulus for wound CF tube (Pa)
rho = 1550.0
for L, OD, t, m_tip in ((1.2, 0.020, 0.0010, 0.20), (2.0, 0.025, 0.0010, 0.20), (2.0, 0.030, 0.0012, 0.20)):
    ID = OD-2*t
    I = math.pi*(OD**4-ID**4)/64
    A = math.pi*(OD**2-ID**2)/4
    m_tube = rho*A*L
    k = 3*E*I/L**3
    m_eff = m_tip + 0.24*m_tube
    f = math.sqrt(k/m_eff)/(2*math.pi)
    # tip deflection under 3 g vertical bump (mogul/landing)
    a_bump = 3*9.81
    defl = m_eff*a_bump/k
    ang_jit = math.degrees(math.atan2(1.5*defl, L))  # tip slope of cantilever ~1.5*defl/L
    root_M = (m_tip*L + m_tube*L/2)*a_bump
    I_yaw = m_tip*(L*0.85)**2 + m_tube*(L*0.85)**2/3   # boom yaw inertia about spine (85% horizontal)
    print(f"  L={L} m OD={OD*1000:.0f} mm t={t*1000:.1f} mm: tube {m_tube*1000:.0f} g, tip {m_tip*1000:.0f} g, f1={f:4.1f} Hz,"
          f" 3g-bump tip defl {defl*1000:4.0f} mm, tip slope {ang_jit:4.1f} deg, root moment {root_M:4.1f} N m, added yaw I {I_yaw:4.2f} kg m2")
print("  Reference (lit-range, ASSUMED value): whole-body yaw inertia of an adult about the vertical axis ~1.0-1.5 kg m2;"
      "\n  torso-only ~0.5-0.7 kg m2 -> a 2 m boom adds tens of % to torso yaw inertia (felt in fast upper-body rotation).")
print("  Angular jitter is dominated by rigid-body torso rotation (gyro-stabilised in post by 360 FlowState-type EIS);"
      "\n  boom bending modes at a few Hz add *translation* wobble that EIS cannot remove (it is a real viewpoint shift).")

print("\n== Handheld 360 stick: arm load ==")
for L in (0.7, 1.0, 1.2):
    m_cam, m_stick = 0.200, 0.124   # lit: X5 ~200 g; Insta360 1 m stick 124 g
    M = 9.81*(m_cam*L + m_stick*L/2)
    print(f"  stick {L} m: static wrist moment {M:4.2f} N m; at 2 g turn/bump {2*M:4.2f} N m (hand occupied, no pole plant on that side)")

print("\n== Helmet / chest baseline ==")
print("  helmet cam: subject = skier's own skis/hands only; full-body fraction ~0 (FPV). chest cam: arms, skis, no face/body.")
print("  Added mass helmet 0.15-0.2 kg at ~0.15 m above head CG -> neck moment in 5 g crash ~1.5 N m (snag risk is the real issue).")

print("\n== Ski-mounted cam inertia ==")
m_ski = 1.7; L_ski = 1.70
I_ski = m_ski*L_ski**2/12
for m_cam, r in ((0.06, 0.80), (0.12, 0.80)):
    dI = m_cam*r*r
    print(f"  {m_cam*1000:.0f} g at {r} m from binding: +{dI:.3f} kg m2 vs ski yaw I {I_ski:.2f} -> +{100*dI/I_ski:.0f}% swing weight")
print("  Ski vibration: lit ranges for ski chatter 20-200 Hz, peaks of 10+ g at tips (ASSUMED order) -> rolling shutter jello, mount fatigue.")
