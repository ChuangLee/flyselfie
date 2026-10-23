#!/usr/bin/env python3
"""IMU-mocap avatar re-render and multi-cam neural synthesis: data, power,
compute, positional accuracy, and 'how much of each output pixel is real'.
ASSUMED unless marked lit.  Run: python3 calc_mocap_render.py
"""
print("== Wearable mocap kit ==")
kits = {   # (n sensors, g each)  lit-order: Sony mocopi 6 x ~8 g; Xsens MVN Link 17 sensors (suit)
    "consumer 6-sensor (mocopi-class)": (6, 8),
    "pro 17-sensor suit (Xsens-class)": (17, 15),
}
for k, (n, gm) in kits.items():
    print(f"  {k}: {n} sensors, ~{n*gm} g sensors (+straps/suit); donning ~{2 if n < 10 else 10} min; occupies no hands")
print("  Global trajectory: IMU dead reckoning drifts (double-integrated accel); need GNSS:")
for name, sig in (("phone GNSS", 3.0), ("dual-band GNSS", 1.0), ("RTK GNSS (needs base/NTRIP)", 0.03)):
    print(f"   {name:30s} ~{sig} m 1-sigma -> avatar foot-to-snow contact error {'invisible' if sig < 0.05 else 'visible floating/sinking unless snapped to terrain'}")
print("  Terrain: photogrammetry/SLAM from helmet 360 along the run; trees/people/snow texture reconstructed, NOT the actual"
      " spray, lighting changes, other skiers at that moment (unless separately segmented from real video).")

print("\n== Honesty accounting (fraction of output pixels that are direct camera measurements from the output viewpoint) ==")
rows = [
    ("R00 helmet/chest cam", 1.00, "real, but first-person"),
    ("R02 boom 360 reframe", 1.00, "real, reprojection only (same optical centre)"),
    ("R11 bounded stereo NVS within baseline", 0.90, "interpolated; ~10% disocclusion fill (flagged)"),
    ("R03 body-array NVS to 3 m rear-high", 0.47, "<=47% of visible body surface ever observed (calc_multiview_coverage); rest generated"),
    ("R04 mocap avatar re-render", 0.00, "100% synthetic render driven by measured motion"),
]
for name, frac, note in rows:
    print(f"  {name:42s} real-from-viewpoint ~{frac*100:5.0f}%  {note}")

print("\n== Compute / power ==")
# 3DGS-style dynamic human + scene training: ASSUMED order-of-magnitude
print("  Onboard live NVS from 6 body cams: 6 x 4K30 decode ~ 6 x 1.5 W (ASSUMED SoC) + NVS ~10-30 W GPU-class -> not wearable live.")
print("  Offline: dynamic gaussian/NeRF per 30 s clip ~ 10-60 GPU-min (ASSUMED from current dynamic-scene methods) -> cloud or desktop.")
bitrate = 6*100  # Mbps for 6 x 4K
print(f"  Storage: 6 cams x 100 Mbps = {bitrate} Mbps -> {bitrate/8*3600/1000:.0f} GB/hour; batteries: 6 devices to charge/sync per day.")
print("  Sync requirement: at 10 m/s skier, 1 frame (33 ms) offset = 33 cm world motion; limbs move ~3-5 m/s -> need <~2 ms sync"
      " (genlock or audio/timecode) for multi-view geometry.")
