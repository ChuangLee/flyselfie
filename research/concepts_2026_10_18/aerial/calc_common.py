"""Shared constants and helpers for the AIRBORNE & TETHERED lens (RES-040).

Stdlib only. Every constant carries a source tag:
  calc    = derived here
  lit     = from a cited public source (see concepts.json prior_art)
  assumed = engineering placeholder, NOT measured
"""
import json
import math
import os

G = 9.81  # m/s^2

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")


def air_density(alt_m=2000.0, temp_c=-10.0):
    """Pressure from ISA (troposphere), actual temperature for density.  calc."""
    T_isa = 288.15 - 0.0065 * alt_m
    p = 101325.0 * (T_isa / 288.15) ** 5.2559
    return p / (287.05 * (temp_c + 273.15)), p


RHO_ALT, P_ALT = air_density(2000.0, -10.0)   # ~1.05 kg/m^3
RHO_CONS = 1.00   # conservative design density (assumed: 2000 m, warm day / 2500 m cold)
RHO_SL = 1.225    # sea-level reference used by vendor specs (assumed)

COLD_CAPACITY = 0.75  # usable Li-ion capacity fraction at -10 C (assumed 0.70-0.80)

SKIER_H = 1.75  # m (brief)
SKIER_MASS = 80.0  # kg incl. gear (assumed)

# Skier ground-speed envelope (brief 5-20 m/s); recreational mean ~11-13 m/s is
# a commonly quoted literature range (lit, not re-verified here) -> assumed N(11, 3.5)
SKIER_SPEED_MEAN = 11.0
SKIER_SPEED_SD = 3.5


def frac_speed_above(v):
    """Fraction of riding time with skier speed > v for assumed normal distribution."""
    z = (v - SKIER_SPEED_MEAN) / SKIER_SPEED_SD
    return 0.5 * math.erfc(z / math.sqrt(2))


def ideal_hover_power(m_kg, disc_area_m2, rho):
    """Momentum theory P = sqrt(T^3 / (2 rho A))."""
    T = m_kg * G
    return math.sqrt(T ** 3 / (2.0 * rho * disc_area_m2))


def induced_velocity_hover(m_kg, disc_area_m2, rho):
    return math.sqrt(m_kg * G / (2.0 * rho * disc_area_m2))


def subject_px(d_m, vfov_deg, v_res_px, h=SKIER_H):
    """Vertical pixel height of a standing skier at distance d (rectilinear)."""
    frame_h = 2.0 * d_m * math.tan(math.radians(vfov_deg) / 2.0)
    return v_res_px * h / frame_h, h / frame_h


def vfov_from_hfov(hfov_deg, aspect=16 / 9):
    return math.degrees(2 * math.atan(math.tan(math.radians(hfov_deg) / 2) / aspect))


def fisheye_px(d_m, px_per_deg, h=SKIER_H):
    ang = math.degrees(2 * math.atan(h / 2 / d_m))
    return ang * px_per_deg, ang


def ke(m, v):
    return 0.5 * m * v * v


def save(name, data):
    os.makedirs(RESULTS, exist_ok=True)
    path = os.path.join(RESULTS, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return path


def r(x, n=2):
    return round(x, n)
