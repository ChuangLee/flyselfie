"""S2-01 / S2-02 / S2-05 / S2-06: 'Descent glider' follow-cam magnitude model.

Physics insight: a follow-cam that descends the same vertical drop as the skier receives
m*g*V*sin(slope) of free gravitational power. A light fixed wing needs only D*V to fly, so on
typical pistes gravity pays for most or all of the flight; a folding prop windmills surplus back
into the battery (regenerative soaring) and spends it at stops/slow segments.

Design levers transferred from other industries:
  - loitering-munition folding wings (Switchblade/Hero-30) -> tube stow, one-motion deploy
  - bird-inspired wing sweep morphing (EPFL LisHawk 2020) -> one airframe covers 5-18 m/s
  - regenerative soaring windprop (Barnes SAE 2006, Pipistrel Velis regen, TU Delft 2021-23)
  - Si-anode cells (Amprius SiCore 450 Wh/kg, 2025) + self-heating cell (Penn State/EC Power)
  - gyro-log stabilisation + subject-locked reframing (Gyroflow) instead of a gimbal
All aero coefficients ASSUMED (low-Re foam/carbon wing); deterministic seed for reproducibility.
"""
import math, random
from calc_common import (RHO, MU, G, CRIT, SPEED, ke, vmax_for_ke, normal_cdf, subject_px,
                         battery_usable_Wh, save, r)

random.seed(20261019)

# ------------------------------------------------------------------ airframes
def airframe(name, m, S_ext, b_ext, S_sw, b_sw, CD0=0.055, e=0.75, CLmax_ext=1.0, CLmax_sw=0.8):
    return dict(name=name, m=m, W=m * G,
                cfg={'extended': dict(S=S_ext, b=b_ext, CD0=CD0, k=1 / (math.pi * e * b_ext ** 2 / S_ext), CLmax=CLmax_ext),
                     'swept': dict(S=S_sw, b=b_sw, CD0=CD0 * 0.95, k=1 / (math.pi * 0.7 * b_sw ** 2 / S_sw), CLmax=CLmax_sw)})

# S2-01 morphing descent glider, 95 g (mass budget below)
MASS_BUDGET_G = dict(camera_4k_gyro_module=18, battery_SiAnode_1S_4Wh=10, motor_esc_folding_prop=9,
                     servos_2x=5, fc_imu_gnss_uwb=8, airframe_epp_carbon_folding_morph=38, hinge_spring_misc=7)
M_GLIDER = sum(MASS_BUDGET_G.values()) / 1000.0           # 0.095 kg
GL = airframe('morph_glider_95g', M_GLIDER, S_ext=0.060, b_ext=0.62, S_sw=0.034, b_sw=0.40)
# comparison: same mass, fixed (non-morph) wing = extended config only
GL_FIXED = dict(GL, name='fixed_wing_95g', cfg={'extended': GL['cfg']['extended']})

ETA_PROP = 0.45      # ASSUMED small folding prop + motor + ESC
ETA_REGEN = 0.30     # ASSUMED windmill mode (DGLR 2022: windmill efficiency is the weak point)
P_REGEN_MAX = 3.0    # W, ASSUMED generator/ESC limit
P_CAM = 1.6          # W, 4K60 module ASSUMED (RunCam Thumb 2 class)
P_AVIONICS = 0.6     # W, FC + UWB + GNSS + servos ASSUMED

def vstall(af, c):
    s = af['cfg'][c]
    return math.sqrt(2 * af['W'] / (RHO * s['S'] * s['CLmax']))

def drag_power(af, c, Va, n=1.0):
    s = af['cfg'][c]
    q = 0.5 * RHO * Va * Va
    CL = n * af['W'] / (q * s['S'])
    if CL > s['CLmax']:
        return None
    CD = s['CD0'] + s['k'] * CL * CL
    return q * s['S'] * CD * Va

def best_LD(af, c):
    s = af['cfg'][c]
    return 1 / (2 * math.sqrt(s['CD0'] * s['k']))

def follow_power(af, Vg, slope_deg, wind_along=0.0):
    """Electrical power (+ motor, - regen) to hold station behind a skier moving at ground speed Vg
    down a slope; wind_along = tailwind component (m/s, + reduces airspeed). Picks the best config.
    Returns (P_elec, cfg, mode)."""
    best = None
    for c in af['cfg']:
        vmin = 1.25 * vstall(af, c)
        Va = Vg - wind_along
        mode = 'follow'
        if Va < vmin:            # fly lazy S-turns at vmin; along-track speed matches skier
            Va = vmin; mode = 'S-turn'
        Pd = drag_power(af, c, Va)
        if Pd is None:
            continue
        Pg = af['W'] * Vg * math.sin(math.radians(slope_deg))   # gravity power available (vertical drop rate)
        net = Pd - Pg
        Pe = net / ETA_PROP if net > 0 else -min(-net * ETA_REGEN, P_REGEN_MAX)
        if best is None or Pe < best[0]:
            best = (Pe, c, mode)
    return best

def loiter_power(af, bank_deg=30):
    """Orbiting a stopped skier: level turn, best config."""
    n = 1 / math.cos(math.radians(bank_deg))
    out = []
    for c in af['cfg']:
        V = 1.3 * vstall(af, c) * math.sqrt(n)
        Pd = drag_power(af, c, V, n)
        if Pd:
            out.append((Pd / ETA_PROP, c, V, V * V / (G * math.tan(math.radians(bank_deg)))))
    return min(out)

# ------------------------------------------------------------------ Monte Carlo day
def simulate_day(af, level='advanced', runs=18, film_s=150, stop_s=20, dt=2.0, wind_max=9.0):
    mu, sd = SPEED[level]
    vcap = vmax_for_ke(af['m'])
    E_motor = E_regen = 0.0; t_tot = 0; t_sturn = 0; t_lag = 0; t_hi_air = 0
    lag_dist_max = 0.0
    for _ in range(runs):
        wspd = random.uniform(0, wind_max); wdir = random.uniform(0, 2 * math.pi)
        lag = 0.0
        t = 0.0
        while t < film_s:
            slope = min(35, max(6, random.gauss(18, 5)))       # ASSUMED blue/red distribution (Ettlinger: blue 16-20 deg)
            Vs = max(1.0, random.gauss(mu, sd))
            Vg = min(Vs, vcap)                                  # KE cap: glider never exceeds 14.9 J ground speed
            if Vs > vcap:
                t_lag += dt; lag += (Vs - vcap) * dt
            else:
                lag = max(0.0, lag - (vcap - Vs) * dt)           # catches up when skier slows
            lag_dist_max = max(lag_dist_max, lag)
            # along-track wind component varies with turning (+-30 deg heading swing)
            hdg = random.uniform(-0.5, 0.5)
            w_along = wspd * math.cos(wdir - hdg)
            Pe, c, mode = follow_power(af, Vg, slope, w_along)
            if mode == 'S-turn': t_sturn += dt
            if Pe > 0: E_motor += Pe * dt
            else: E_regen += -Pe * dt
            t += dt; t_tot += dt
        # one mid-run stop with orbit loiter + launch climb (6 m at 1.5 m/s)
        Pl = loiter_power(af)[0]
        E_motor += Pl * stop_s
        E_motor += (af['W'] * 1.5 / ETA_PROP + Pl) * 4.0
    E_av = (P_CAM + P_AVIONICS) * (t_tot + runs * (stop_s + 4))
    net_Wh = (E_motor + E_av - E_regen) / 3600
    return dict(level=level, runs=runs, film_min=r(t_tot / 60, 1), motor_Wh=r(E_motor / 3600, 2),
                regen_Wh=r(E_regen / 3600, 2), camera_avionics_Wh=r(E_av / 3600, 2), net_Wh=r(net_Wh, 2),
                frac_S_turn=r(t_sturn / t_tot, 3), frac_skier_faster_than_KE_cap=r(t_lag / t_tot, 3),
                max_lag_m=r(lag_dist_max, 1))

# ------------------------------------------------------------------ gust-driven translation jitter
def dryden_los_jitter(V=12.0, h=5.0, U20=7.0, d_subject=8.0, d_bg=60.0, m=None, S=None):
    """Light glider 'rides' gusts: its velocity follows gust velocity through a heave lag tau.
    Translation velocity > 1 Hz divided by distance = LOS angular rate. Subject term is removable by
    subject-locked reframing (post, zero latency); background term is what remains."""
    h_ft = h / 0.3048
    sw = 0.1 * U20
    su = sw / (0.177 + 0.000823 * h_ft) ** 0.4
    Lw = h; Lu = (h_ft / (0.177 + 0.000823 * h_ft) ** 1.2) * 0.3048
    CLa = 2 * math.pi * 6 / 8 * 0.9
    tau = 2 * m / (RHO * V * S * CLa)
    def band_var(sig, L, vert):
        tot = 0.0; dw = 0.05; w = 2 * math.pi * 1.0
        while w < 2 * math.pi * 30:
            x = L * w / V
            if vert:
                phi = sig ** 2 * (L / (math.pi * V)) * (1 + 3 * x * x) / (1 + x * x) ** 2
            else:
                phi = sig ** 2 * (2 * L / (math.pi * V)) / (1 + x * x)
            H2 = 1 / (1 + (w * tau) ** 2)
            tot += phi * H2 * dw; w += dw
        return tot
    var = band_var(sw, Lw, True) + band_var(su, Lu, False) * 0.5   # lateral: partial response ASSUMED 0.5
    vrms = math.sqrt(var)
    return dict(V=V, U20=U20, sigma_w=r(sw), sigma_v=r(su), tau_heave_s=r(tau, 3), translation_rate_rms_gt1Hz=r(vrms, 3),
                subject_LOS_dps_raw=r(math.degrees(vrms / d_subject), 2),
                background_LOS_dps_after_subject_lock=r(math.degrees(vrms / d_bg), 2),
                crop_margin_deg_3sigma=r(math.degrees(3 * 0.25 / d_subject), 1))

# ------------------------------------------------------------------ VTOL tail-sitter variant (S2-02)
def vtol_variant():
    m = 0.115
    W = m * G
    A = 2 * math.pi * (0.0508) ** 2           # two 4-inch props
    P_ideal = W ** 1.5 / math.sqrt(2 * RHO * A)
    P_hover = P_ideal / 0.5                   # FoM*eta ASSUMED 0.5
    hover_s_per_run = 10 + 12 + 0             # take-off+transition, hover-land on palm; stops use orbit
    E_hover_run = P_hover * hover_s_per_run
    return dict(mass_kg=m, disk_loading_N_m2=r(W / A, 0), hover_W=r(P_hover, 1),
                hover_Wh_per_run=r(E_hover_run / 3600, 3), vmax_KE=r(vmax_for_ke(m), 1),
                note='palm/cradle landing at standstill only (moving dock killed in round 1: 8-15 cm error)')

# ------------------------------------------------------------------ main
def main():
    out = dict(mass_budget_g=MASS_BUDGET_G, mass_kg=M_GLIDER, rho=r(RHO, 3))
    for af in (GL, GL_FIXED):
        d = {}
        for c, s in af['cfg'].items():
            d[c] = dict(S=s['S'], span=s['b'], wing_loading=r(af['W'] / s['S'], 1), vstall=r(vstall(af, c), 2),
                        LD_max=r(best_LD(af, c), 1),
                        Re_at_10=r(RHO * 10 * s['S'] / s['b'] / MU, 0))
        # glide angle needed at speeds
        table = []
        for V in (6, 8, 10, 12, 14, 16, 18):
            row = dict(V=V)
            for c in af['cfg']:
                Pd = drag_power(af, c, V)
                row[c + '_glide_deg'] = r(math.degrees(math.asin(min(1, Pd / (af['W'] * V)))), 1) if Pd else None
            for sl in (10, 15, 20, 25):
                row[f'Pelec_slope{sl}'] = r(follow_power(af, V, sl)[0], 2)
            table.append(row)
        lo = loiter_power(af)
        d['speed_table'] = table
        d['loiter_orbit'] = dict(P_W=r(lo[0], 2), cfg=lo[1], V=r(lo[2], 1), radius_m=r(lo[3], 1))
        d['day_advanced'] = simulate_day(af, 'advanced')
        d['day_intermediate'] = simulate_day(af, 'intermediate')
        out[af['name']] = d
    # endurance on a 4 Wh Si-anode cell (10 g at ~380 Wh/kg pack level ASSUMED from 450 Wh/kg cell)
    usable = battery_usable_Wh(4.0)
    for lvl in ('day_advanced', 'day_intermediate'):
        dd = out['morph_glider_95g'][lvl]
        per_min = dd['net_Wh'] / (dd['film_min'] + dd['runs'] * 24 / 60)
        dd['usable_Wh_4Wh_cell'] = r(usable, 2)
        dd['endurance_min_on_4Wh'] = r(usable / per_min, 0)
        dd['film_minutes_per_charge_vs_45'] = 'PASS' if usable / per_min >= 45 else 'FAIL'
    out['KE'] = dict(vmax_for_14_9J=r(vmax_for_ke(M_GLIDER), 1), KE_at_12=r(ke(M_GLIDER, 12), 1),
                     KE_at_17=r(ke(M_GLIDER, 17), 1), touchdown_KE_6ms=r(ke(M_GLIDER, 6), 2),
                     frac_adv_skier_above_cap=r(1 - normal_cdf(vmax_for_ke(M_GLIDER), *SPEED['advanced']), 3),
                     frac_int_skier_above_cap=r(1 - normal_cdf(vmax_for_ke(M_GLIDER), *SPEED['intermediate']), 4),
                     EU_C0_speed_cap_19ms='within (C0 requires <=19 m/s)')
    out['jitter'] = [dryden_los_jitter(V=v, U20=u, m=M_GLIDER, S=0.045) for v in (10, 14) for u in (4, 8)]
    # footage geometry: 4K module, 100 deg rectilinear-after-dewarp, 55 deg output crop
    out['footage'] = {f'd{d}m': dict(subject_px_1080=r(subject_px(d, 55), 0),
                                      native_px_across_crop=r(3840 / 100 * 55, 0)) for d in (6, 8, 10, 12)}
    out['footage']['max_distance_for_300px'] = r(next(d / 10 for d in range(40, 300) if subject_px(d / 10, 55) < 300), 1)
    # stow: fuselage tube with Switchblade-style wings folded along the body
    tube_L = math.pi * (0.058 / 2) ** 2 * 0.36 * 1000
    out['stow'] = dict(tube_id_mm=58, tube_len_m=0.36, tube_volume_L=r(tube_L, 2), quiver_total_L=r(tube_L * 1.3, 2),
                       deploy='wings spring out on release (torsion springs), sweep servo sets morph')
    out['vtol_variant_S2_02'] = vtol_variant()
    # VTOL day energy: glide model as above + hover segments, 18 runs
    v = out['vtol_variant_S2_02']
    base = out['morph_glider_95g']['day_advanced']['net_Wh'] * 0.115 / 0.095   # scale aero/gravity terms with mass (rough)
    v['day_net_Wh'] = r(base + 18 * v['hover_Wh_per_run'], 2)
    v['battery_needed_Wh_nominal'] = r(v['day_net_Wh'] / (0.75 * 0.85), 2)
    v['battery_mass_g_at_380Whkg'] = r(v['battery_needed_Wh_nominal'] / 380 * 1000, 1)
    v['battery_mass_g_at_180Whkg_conventional'] = r(v['battery_needed_Wh_nominal'] / 180 * 1000, 1)
    # Kestrel wind-hover at stops (S2-05): needs upslope wind ~ airspeed with updraft >= sink
    af = GL; c = 'extended'
    Vmin = 1.15 * vstall(af, c)
    sink = drag_power(af, c, Vmin) / af['W']
    need_U = max(Vmin, sink / math.sin(math.radians(20)))
    # fraction of stops with upslope component >= need_U for wind ~ U(0,9) random dir (ASSUMED)
    n = 0; N = 20000
    for _ in range(N):
        U = random.uniform(0, 9); a = random.uniform(-math.pi, math.pi)
        if U * math.cos(a) >= need_U: n += 1
    out['kestrel_wind_hover_S2_05'] = dict(V_hover_air=r(Vmin, 1), sink_ms=r(sink, 2), upslope_wind_needed=r(need_U, 1),
                                           frac_stops_possible=r(n / N, 3),
                                           saving_Wh_per_stop=r(loiter_power(GL)[0] * 20 / 3600, 3))
    # Solar skin (S2-06): flexible GaAs on upper wing
    A_cells = 0.6 * GL['cfg']['extended']['S']
    out['solar_skin_S2_06'] = dict(cell_area_m2=r(A_cells, 3), eff=0.25, sun_W_m2=1000,
                                   mean_incidence_factor=0.45, P_mean_sunny_W=r(A_cells * 0.25 * 1000 * 0.45, 2),
                                   P_camera_avionics_W=P_CAM + P_AVIONICS,
                                   mass_g_at_1W_per_g_module=r(A_cells * 0.25 * 1000 / 1.0, 1),
                                   note='5 W/g lab cells (KIST/GIST) would be ~2 g; overcast days give ~10-20 %')
    save('descent_glider', out)
    return out

if __name__ == '__main__':
    import json
    o = main()
    print(json.dumps({k: o[k] for k in ('KE', 'footage', 'stow', 'vtol_variant_S2_02', 'kestrel_wind_hover_S2_05', 'solar_skin_S2_06')}, indent=1))
    for n in ('morph_glider_95g', 'fixed_wing_95g'):
        print(n, json.dumps({k: o[n][k] for k in ('extended', 'loiter_orbit', 'day_advanced', 'day_intermediate')}, indent=0))
        if 'swept' in o[n]: print('swept', o[n]['swept'])
        for row in o[n]['speed_table']: print(row)
    for j in o['jitter']: print(j)
