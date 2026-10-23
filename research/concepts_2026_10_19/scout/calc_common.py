"""Shared constants and helpers for scout round-2 magnitude calcs (FlySkiSelfie, 2026-10-19).
All numbers are magnitude estimates. ASSUMED marks placeholders, not measurements.
Run any calc_*.py with python3; each writes results_<name>.json next to itself."""
import json, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
G = 9.81
# ISA-ish at 2000 m, -10 C (ASSUMED resort conditions; same as criteria endurance temperature)
P_2000 = 79500.0          # Pa
T_COLD = 263.15           # K
RHO = P_2000 / (287.05 * T_COLD)   # ~1.05 kg/m3
MU = 1.67e-5              # Pa s at -10 C

# Harmonised criteria (sim/js/concepts/common/criteria.js)
CRIT = dict(ke_J=14.9, ke_hard_J=80.0, body_force_N=40.0, endurance_min=45.0,
            standstill_s=30.0, actions=2, pack_L=3.0, jitter_dps=3.0, subject_px=300.0)

# Skier speed statistics: Stepan et al. 2023 JSAMS Plus (doi 10.1016/j.jsampl.2023.100033), observer-timed, groomed runs
SPEED = dict(all=(34.9/3.6, 13.6/3.6), advanced=(44.5/3.6, 11.7/3.6),
             intermediate=(32.4/3.6, 9.9/3.6), beginner=(19.9/3.6, 7.2/3.6))
SKIER_H = 1.75  # m standing height; crouched ~1.4

def ke(m, v):
    return 0.5 * m * v * v

def vmax_for_ke(m, limit=CRIT['ke_J']):
    return math.sqrt(2 * limit / m)

def normal_cdf(x, mu, sd):
    return 0.5 * (1 + math.erf((x - mu) / (sd * math.sqrt(2))))

def subject_px(distance_m, out_hfov_deg, out_w=1920, out_h=1080, h=SKIER_H):
    """Subject height in px of a 1080p output whose horizontal FOV is out_hfov (rectilinear)."""
    vfov = 2 * math.degrees(math.atan(math.tan(math.radians(out_hfov_deg / 2)) * out_h / out_w))
    ang = 2 * math.degrees(math.atan(h / 2 / distance_m))
    return ang / vfov * out_h

def native_px_per_deg(sensor_w_px, lens_hfov_deg):
    return sensor_w_px / lens_hfov_deg

def battery_usable_Wh(nominal_Wh, cold_factor=0.75, reserve=0.15):
    """cold_factor ASSUMED for Li-ion at -10 C cell temp ~0..5 C with insulation; reserve kept."""
    return nominal_Wh * cold_factor * (1 - reserve)

def save(name, obj):
    p = os.path.join(HERE, f'results_{name}.json')
    with open(p, 'w') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    print('wrote', p)
    return p

def r(x, n=2):
    return round(x, n) if isinstance(x, float) else x
