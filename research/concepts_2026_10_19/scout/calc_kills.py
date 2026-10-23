"""Magnitude screens for transfers that were evaluated and (mostly) killed. Each block states the
kill physics so the reasoning is reproducible. ASSUMED values are placeholders, not measurements."""
import math
from calc_common import RHO, G, CRIT, SPEED, ke, vmax_for_ke, normal_cdf, battery_usable_Wh, save, r

out = {}

# S2-07 Laser power-beamed follow micro-drone (DARPA POWER 2025: >800 W at 8.6 km)
P_elec_drone = 15 + 2            # W: 120 g hover ~13-15 W + camera/avionics (ASSUMED)
eta_pv = 0.50                    # laser PV at matched wavelength (ASSUMED, lab 50-68 %)
eta_point = 0.8                  # pointing/spill (ASSUMED)
eta_laser = 0.40                 # diode wall-plug (ASSUMED)
P_opt = P_elec_drone / (eta_pv * eta_point)
P_pack = P_opt / eta_laser
rx_d_cm = 5.0
irr = P_opt / (math.pi * (rx_d_cm / 2) ** 2)   # W/cm2 at receiver
MPE_980_10s = 5e-3               # W/cm2 order of magnitude for NIR ~10 s ocular exposure (ASSUMED, IEC 60825 class; exact value needs tables)
out['S2-07_laser_beamed_drone'] = dict(P_optical_W=r(P_opt, 1), P_from_pack_W=r(P_pack, 1),
    pack_Wh_for_45min=r(P_pack * 0.75, 0), beam_irradiance_W_cm2=r(irr, 2), x_MPE=r(irr / MPE_980_10s, 0),
    snow_NIR_reflectance='~0.6-0.8 diffuse + specular ice glints (ASSUMED)',
    skin_safe_beam_diameter_cm=28, verdict='KILL: beam is ~400x ocular MPE, every pointing miss lands on a crowded snow surface; '
    'a 28 cm skin-safe beam needs a receiver bigger than the drone; and the drone is still a drone (no originality gain).')

# S2-08 Spinning samara (monocopter) camera with global shutter
rev_hz = 4.0; exp_s = 1 / 8000
blur_deg = 360 * rev_hz * exp_s
rs_readout_s = 0.008
out['S2-08_samara_spin_cam'] = dict(rotation_hz=rev_hz, blur_deg_global_shutter=r(blur_deg, 2),
    rolling_shutter_skew_deg=r(360 * rev_hz * rs_readout_s, 1), facing_frames_per_s_single_lens=rev_hz,
    translation_speed_ms_assumed=5.0, skier_mean_speed=r(SPEED['all'][0], 1),
    frac_time_skier_faster_than_5ms=r(1 - normal_cdf(5, *SPEED['all']), 2),
    verdict='KILL: global shutter fixes blur (0.16 deg) but monocopter translation (~5 m/s ASSUMED) is below the skier '
            '86 % of the time; rolling-shutter 360 cams skew ~12 deg; efficiency gain does not matter if it cannot keep up.')

# S2-09 Leapfrog snow-perch flyer (lands ahead, films pass-by, overtakes)
Vs = 12.0; lead = 40.0; t_overtake = 6.0
V_need = Vs + lead / t_overtake
out['S2-09_leapfrog_perch'] = dict(V_overtake=r(V_need, 1), mass_max_for_14_9J=r(2 * 14.9 / V_need ** 2 * 1000, 0),
    KE_150g=r(ke(0.15, V_need), 1), cycle_s=r(t_overtake + lead / Vs, 1), flying_fraction=r(t_overtake / (t_overtake + lead / Vs), 2),
    verdict='KILL: overtaking a 12 m/s skier needs ~19 m/s (KE 26 J at 150 g, or <=85 g airframe that cannot fly 19 m/s in wind); '
            'only static pass-by shots; lands on piste in others\' line.')

# S2-10 Micro ski-robot follower (200 g sled with steering fin)
m = 0.2
out['S2-10_micro_ski_robot'] = dict(KE_at_12=r(ke(m, 12), 1), KE_at_18=r(ke(m, 18), 1),
    camera_height_m=0.2, mogul_rut_depth_m='0.2-0.6 (ASSUMED) > robot size',
    stop_distance_on_20deg_with_claw_mu0p5=r(12 ** 2 / (2 * G * (0.5 * math.cos(math.radians(20)) - math.sin(math.radians(20)))), 1),
    verdict='KILL: 0.2 m camera height sees boots and snow spray; ruts/moguls exceed body size; others ski over it; '
            'stopping on 20 deg needs ~50 m even with a claw. Same physics as round-1 BODY-09/10.')

# S2-11 Battery-breakthrough micro-quad (enabler only)
P_fly = 25.0
for name, whkg in (('HoverAir_class_pack_7p4Wh_64g_116Whkg', 7.4 / 0.064), ('SiAnode_450Whkg_cell_380Whkg_pack', 380)):
    Wh = 0.064 * whkg
    out.setdefault('S2-11_battery_quad', {})[name] = dict(pack_g=64, Wh=r(Wh, 1),
        endurance_min_cold=r(battery_usable_Wh(Wh, 0.8) / P_fly * 60, 1))
out['S2-11_battery_quad']['self_heating'] = '-20->0 C in 20 s using 3.8 % capacity (Penn State/EC Power 2016)'
out['S2-11_battery_quad']['verdict'] = ('ENABLER, not a concept: Si-anode roughly triples cold flight time (~12->~40 min at 25 W, if the 450 Wh/kg cells deliver ~1C in the cold, unverified) of a '
    'palm follow drone, still < 45 min and still the market product the user rejected. Used inside S2-01/S2-02.')

# S2-12 Guided soft parafoil camera (precision airdrop transfer)
LD = 3.0; WS = 40.0; CL = 0.6
V = math.sqrt(2 * WS / (RHO * CL))
out['S2-12_guided_parafoil'] = dict(LD=LD, glide_deg=r(math.degrees(math.atan(1 / LD)), 1), airspeed=r(V, 1),
    small_parafoil_landing_median_miss_m=13, verdict='KILL as stand-alone: glide 18.4 deg means it sinks into any slope '
    'flatter than 18 deg and cannot climb; landing miss ~13 m (Georgia Tech) vs 3 m pickup need. Keep soft-wing idea as a '
    'safety skin for S2-01.')

# S2-13 Wing-in-ground-effect skimming chase (h < span)
b = 0.62; h = 0.3
LD_gain = 1 / (1 - (1 - 1.32 * h / b) / (1.05 + 7.4 * h / b))   # McCormick-style induced drag reduction (approx)
out['S2-13_ground_effect_skim'] = dict(h_m=h, induced_drag_factor=r(1 / LD_gain, 2),
    verdict='KILL: needs h < ~0.3 m above snow (span 0.62 m) in the band where other skiers\' skis and legs are; '
            'moguls and rollers exceed h. Induced-drag saving is irrelevant because gravity already pays.')

# S2-14 Tether-climbing camera trolley on the kite line (rail-cam / Picavet transfer)
out['S2-14_tether_trolley'] = dict(kite_elevation_deg=74, trolley_elevation_deg='same 74 (straight line through the skier)',
    verdict='KILL: any point on a taut line through the skier sees him from the same elevation; moving the camera inward only '
            'shrinks distance, it cannot lower the view angle.')

# S2-15 Micro swarm (drone-show RTK transfer), each <=30 g so KE small
out['S2-15_micro_swarm'] = dict(member_mass_kg=0.03, KE_at_10=r(ke(0.03, 10), 1), black_hornet4_vmax=10, black_hornet4_mass_g=70,
    frac_time_skier_faster_than_10=r(1 - normal_cdf(10, *SPEED['all']), 2),
    verdict='KILL: sub-100 g rotorcraft top out ~10 m/s (Black Hornet 4, 70 g) so they lose the skier ~47 % of the time; '
            'swarm multiplies regulatory and recovery burden.')

# S2-16 Boomerang camera
out['S2-16_boomerang_cam'] = dict(return_time_s=3, skier_travel_m=r(3 * SPEED['all'][0], 0), spin_hz=10,
    rs_skew_deg_8ms=r(360 * 10 * 0.008, 0), verdict='KILL: returns to the throw point, not to a moving skier (~29 m behind); '
    'spin 10 Hz gives 29 deg rolling-shutter skew; catch with gloves unreliable.')

save('kills', out)
if __name__ == '__main__':
    import json; print(json.dumps(out, indent=1))
