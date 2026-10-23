"""S2-03 'Skyhook on the move' recovery for the descent glider, and S2-04 crosswind (AWE) low-speed mode
for a steered camera kite. Magnitudes only; ASSUMED values marked.

S2-03 transfer: Insitu ScanEagle SkyHook (wingtip hook catches a hanging rope, DGPS-guided).
Here the 'rope' is a 1.5 m tag line streaming back from a 1.2 m whip on the pack. Glider and skier
move together, so the capture is at small CLOSING speed, not flight speed.

S2-04 transfer: airborne-wind-energy crosswind flight (Loyd 1980; Kitepower/Kitemill/SkySails
autopilots). A steered kite flying figure-8s sees airspeed ~ (L/D)*Vw*cos(beta) instead of Vw, so it
stays airborne at far lower skier speed than a parked kite (round-1 A04: falls below 6.2 m/s).
"""
import math, random
from calc_common import RHO, G, SPEED, ke, normal_cdf, save, r

random.seed(7)
out = {}

# ---------------- S2-03 skyhook
m = 0.095; V = 12.0
closing = [0.8, 1.5, 2.5]
sig_lat = 0.10   # UWB+VIO relative position 1-sigma (ASSUMED from DW3000 10 cm ranging, +-5 deg AoA fused with VIO)
hook_capture_halfwidth = 0.25   # m, wingtip hook + line sweep (ASSUMED)
line_vert_span = 1.2            # m of tag line usable
sig_vert = 0.15
def p_capture(N=40000):
    ok = 0
    for _ in range(N):
        dy = random.gauss(0, sig_lat); dz = random.gauss(0, sig_vert)
        # lateral miss tolerated if hook passes within half-width; vertical within line span
        if abs(dy) < hook_capture_halfwidth and abs(dz) < line_vert_span / 2: ok += 1
    return ok / N
pc = p_capture()
abort = dict(time_to_cover_3m_at_12=r(3 / 12, 2), climb_gain_m_2g_0p25s=r(0.5 * 2 * G * 0.25 ** 2, 2),
             KE_ground_frame_at_12=r(ke(m, 12), 1))
out['S2-03_skyhook'] = dict(relative_KE_J={str(c): r(ke(m, c), 2) for c in closing}, p_capture_single_pass=r(pc, 3),
    p_capture_3_passes=r(1 - (1 - pc) ** 3, 4), hook_load_N_shockcord_0p3m=r(m * 1.5 ** 2 / (2 * 0.3) + m * G, 2),
    abort_if_skier_stops=abort,
    after_capture='glider hangs on 1.5 m line as a tiny kite (L/D ~6 -> line elevation ~80 deg) and a 3 s reel pulls it into the dorsal quiver',
    verdict='CONDITIONAL add-on: relative KE 0.03-0.3 J and ~0.98 single-pass capture on paper, but the approach volume is '
            '2-3 m behind the head; needs proof that turbulent wake behind a skier (0.5-1 m) does not upset the glider.')

# ---------------- S2-04 crosswind kite
LD = 4.4; S = 0.25; CL = 0.8; mk = 0.30   # round-1 kite numbers, plus 15 g servo/IMU pod (ASSUMED)
Vstall = math.sqrt(2 * mk * G / (RHO * S * 1.0))
Va_need = 1.25 * Vstall
rows = []
for cosb in (0.6, 0.8):
    Vs_min = Va_need / (LD * cosb)
    rows.append(dict(cos_beta=cosb, skier_speed_min=r(Vs_min, 2)))
# tension at that airspeed, and at parked high speeds (kite depowers by parking at edge of window)
T_need = 0.5 * RHO * Va_need ** 2 * S * CL * math.sqrt(1 + 1 / LD ** 2)
# fraction of time aloft: passive vs crosswind
frac_passive = 1 - normal_cdf(6.2, *SPEED['intermediate'])
frac_cw = 1 - normal_cdf(rows[0]['skier_speed_min'], *SPEED['intermediate'])
L_t = 8.0; sweep_deg = 30
out['S2-04_crosswind_kite'] = dict(kite_stall=r(Vstall, 2), airspeed_target=r(Va_need, 2), min_skier_speed=rows,
    tension_at_min_N=r(T_need, 1), frac_airborne_intermediate_passive=r(frac_passive, 3),
    frac_airborne_intermediate_crosswind=r(frac_cw, 3), figure8_lateral_m=r(L_t * math.sin(math.radians(sweep_deg)), 1),
    camera_az_sweep_deg=2 * sweep_deg, period_s=r(2 * math.pi * L_t * math.radians(sweep_deg) * 2 / Va_need, 1),
    elevation_centre_deg='can be held ~35-50 (crosswind window) vs ~74 parked',
    stops='still lands at standstill (no wind) -> needs glide-down to a backpack line-cradle; same as round-1',
    verdict='CONDITIONAL, hand to kite2 team: active figure-8 extends airborne fraction and lowers the view, at the cost of '
            'a periodic +-30 deg orbit in the footage and an autopilot on the kite.')

save('skyhook_kite', out)
if __name__ == '__main__':
    import json; print(json.dumps(out, indent=1))
