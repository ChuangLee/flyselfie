"""Assemble report.json from the h*/launch_dock result files (run the scripts first; see RUN below)."""
import json
import math
import os
from common import HERE, G130, K120, LINE_COND, LINE_DYN, CAM, ke_speed_cap, save

RUN = ['python3 h1_equilibrium.py', 'python3 h4_ke.py', 'python3 h6_crosswind.py', 'python3 h2_reel_sustain.py',
       'python3 launch_dock.py', 'python3 h3_control.py', 'python3 h5_reel_location.py', 'python3 build_report.py']


def J(name):
    return json.load(open(os.path.join(HERE, name)))


h1, h2, h3, h4, h5, h6, ld = (J('h1_results.json'), J('h2_results.json'), J('h3_results.json'), J('h4_results.json'),
                              J('h5_results.json'), J('h6_results.json'), J('launch_dock_results.json'))


def pick(rows, **kw):
    return [r for r in rows if all(r.get(k) == v for k, v in kw.items())]


# ---------- H1 numbers ----------
g130 = {(r['l'], r['Va']): r for r in h1['rows'] if r['flyer'] == 'G130' and r['line'] == LINE_COND.name}
h1_table = []
for l in (5, 10, 15, 20, 30):
    for Va in (5, 8, 12, 20):
        r = g130.get((l, Va))
        if r and r.get('flies'):
            h1_table.append(dict(l=l, Va=Va, eps_deg=r['eps_LD_deg'], tanEps=round(math.tan(math.radians(r['eps_LD_deg'])), 2),
                                 T_exit_N=r['T_exit_LD'], lineH_1m=r['lineH_1m'], lineH_2m=r['lineH_2m'], lineH_3m=r['lineH_3m'],
                                 sag_m=r['sag_m'], camDist_m=r['camDist_m'], camDep_deg=r['camDepression_deg'], bodyPx_camOnFlyer=r['bodyPx'],
                                 headClear_packTopExit=r['headClear_m']))
mass_eps = []
for r in h1['compact']:
    if r['l'] == 15 and r['Va'] in (5, 8, 12) and r['flyer'] in ('G80_LD5', 'G80_LD10', 'G130_LD5', 'G130_LD10', 'G200_LD5', 'G200_LD10', 'K120'):
        mass_eps.append(dict(flyer=r['flyer'], Va=r['Va'], eps_deg=r['eps_LD_deg'], eps_max_deg=r['eps_max_deg'], vaStaticMin=r['vaStaticMin'], T_exit=r['T_exit_LD']))
cam_on_flyer_ok = sorted({(c['l'], c['eps']) for c in h1['cameraMap'] if c['bodyPx_cam_on_flyer'] >= 300})
max_eps_by_l = {}
for l, e in cam_on_flyer_ok:
    max_eps_by_l[l] = max(max_eps_by_l.get(l, 0), e)
online = [c for c in h1['cameraOnLine_l20'] if c['s_cam'] in (5, 6)]

# ---------- H6 numbers ----------
h6_ok = [r for r in h6['runs'] if r['ok'] and r['vs'] == 0]
def minW(fl):
    ws = sorted({r['W'] for r in h6_ok if r['flyer'] == fl})
    return ws[0] if ws else None
h6_riding = [r for r in h6['runs'] if r['vs'] > 0]

# ---------- dead-band table over the R4 wind cases ----------
X = {'G130': 2.5, 'K120': 1.5}
Vstat = {'G130': round(1.15 * G130.vmin(), 2), 'K120': round(1.15 * K120.vmin(), 2)}
dead = []
for vs in (12.0, 8.0, 4.0):
    for d, U in [('calm', 0)] + [(dd, u) for dd in ('head', 'tail', 'cross') for u in (3, 6, 9)] + [('tail', u) for u in (3.5, 4.5, 5.5)]:
        for hdg in (0, 45):
            vx, vy = vs * math.cos(math.radians(hdg)), vs * math.sin(math.radians(hdg))
            wx, wy = {'calm': (0, 0), 'head': (-U, 0), 'tail': (U, 0), 'cross': (0, U)}[d]
            Va = math.hypot(wx - vx, wy - vy)
            along = (wx * vx + wy * vy) / vs
            row = dict(riderSpeed=vs, wind=f'{d}{U}', headingFromFallLine=hdg, Va=round(Va, 2), apparentWindReversed=along > vs)
            for fl in ('G130', 'K120'):
                row[fl] = 'static' if Va >= Vstat[fl] else ('loops-only' if Va >= X[fl] else 'dead-band')
                if row['apparentWindReversed']:
                    row[fl] += ' (flyer would sit AHEAD)'
            dead.append(row)

# ---------- H2 numbers ----------
s2 = [r for r in h2['S2_S3_sim'] if r.get('strategy') == 'S2_spiral']
s3 = [r for r in h2['S2_S3_sim'] if r.get('strategy') == 'S3_yoyo']
s3ok = [r for r in s3 if r['ok'] and r['h_min_2nd_half'] > 3.0]

# ---------- H3 numbers ----------
lin = h3['linear']
tb = h3['timeDomain']

report = {
    'id': 'SIM-032 science_aero',
    'date': '2026-10-20',
    'role': 'aerodynamics / flight-dynamics scientist',
    'evidenceLevel': ('First-principles reduced-order models and small numerical simulations (point-mass flyer, straight elastic '
                      'line with cross-flow drag, finite actuators). Numerical-uncalibrated. NOTHING was built, flown or measured; '
                      'no physical test was run (M-070 not_run, G-MATURE closed). Coefficients without a source are ASSUMED.'),
    'howToReproduce': {'dir': 'research/active_tether_2026_10_20/science_aero/', 'commands': RUN, 'python': '3 (stdlib only; multiprocessing)'},
    'basis': {
        'flyers': {'G130': G130.to_dict() | {'status': 'ASSUMED polar (CD0 0.045 at Re ~5e4 incl. camera pod/tail; e 0.8; CLmax 1.1)'},
                   'K120': K120.to_dict() | {'status': 'ASSUMED low-wing-loading semi-rigid kite (single-skin + bridle CD0 0.09)'},
                   'sweep': 'h1 also sweeps 80/130/200 g x (L/D)max 5/7.5/10 with S = 0.11 m^2'},
        'lines': {'conductive': LINE_COND.to_dict() | {'source': 'towglider design_notes.json round 3 (0.60 mm, 0.40 g/m)'},
                  'uhmwpe': LINE_DYN.to_dict() | {'status': 'ASSUMED'}},
        'lineDragCd': '1.1 for a cylinder at Re 2e2-1e3 (https://en.wikipedia.org/wiki/Drag_coefficient) - ASSUMED for a braided line',
        'atmosphere': 'rho 1.0 kg/m^3, -10 C (components.js ATMOS, ASSUMED design day)',
        'camera': CAM | {'source': 'towglider round-3 camera (4K 4:3, 66 deg HFOV M12, ASSUMED there); bodyPx replicates env.js footage().bodyPx'},
        'battery': '150 Wh/kg pack, x0.75 cold, 15 % reserve (components.js BATTERY); reel motor+gear+driver efficiency 0.5 ASSUMED',
        'turbulence': 'MIL-F-8785C low-altitude Dryden longitudinal, W20 = 6 m/s, h = 5 m -> sigma_u 1.17 m/s, L_u 36 m (https://en.wikipedia.org/wiki/Dryden_Wind_Turbulence_Model); rider speed oscillation 0.8 m/s at 0.69 Hz and 3 cm/2 Hz heave ASSUMED',
        'KEcap': '14.9 J ground frame (criteria.js keMax)',
    },
    'hypotheses': [],
}
H = report['hypotheses']

H.append(dict(
    id='H1', title='A high-L/D tethered glider flies steep (tan eps ~ L/D_eff), so the line no longer forms a low clothesline - and what that does to the camera view',
    method='h1_equilibrium.py: moment balance of a straight line with flyer lift/drag/weight + cross-flow line drag + line weight; bisection on eps; trim CL for max L/D and for max eps; grid l 5-30 m, m 80-200 g, (L/D)max 5-10, Va 3-20 m/s, two lines. Cross-checked by the 3D simulator (sim3d.py): fixed-CL runs settle at 73.3 deg (Va 8, l 15) and 78.5 deg (Va 12) vs 73.6/78.5 deg from the static solver. Camera: env.js bodyPx rule replicated; head clearance = distance helmet centre -> line segment (shared headClear >= 1.0 m).',
    numbers=dict(
        G130_conductiveLine=h1_table,
        massAndLD_l15=mass_eps,
        staticFlightFloor_Va={'G130 (stall 4.6 m/s)': 4.6, 'G80 (L/D10)': 3.7, 'G200': 5.7, 'K120': 2.0},
        effectiveLD_note='tan(eps) = 3.4-7.5 for G130 at Va >= 8 m/s i.e. 40-80 % of (L/D)max 9.15; the deficit is weight at low Va and line drag at long l (line drag scales with (Va sin eps)^2, so steep lines carry MORE normal drag).',
        lineHeightBehindExit='eps 70-80 deg -> line 4-6 m above the snow 1 m behind a 1.35 m exit (3.8-5.1 m in a carving lean with a 1.05 m exit); at eps 45 deg: 2.35 m (2.05 m carving). Catenary sag <= 0.1 m for T >= 1.5 N.',
        cameraOnFlyer_maxEpsFor300px=max_eps_by_l,
        cameraOnFlyer_examples='l 10 m: eps 30 -> 402 px, 45 -> 325 px, 55 -> 264 px, 75 -> 122 px; l 5 m: eps 65 -> 371 px, 75 -> 237 px (upright rider); a 40 deg carving lean costs another 10-20 %.',
        cameraOnLine_l20=online,
        headClearance='Pack-top exit: 0.27-0.35 m for every eps/azimuth (the helmet is 0.35 m from the exit itself). Seat exit 0.41-0.74 m, belt exit 0.53-0.85 m, worse when steeper. Only an exit >= ~0.95 m behind the helmet (0.8 m rear boom) gives >= 1.0 m.',
        brakeForCameraEps=[r for r in h1['brakeForCamera'] if r['flyer'] == 'G130' and r['l'] == 10 and r['eps_target'] in (45, 60)],
    ),
    verdict='SUPPORTED for the clothesline, REFUTED as a free lunch for the camera and head clearance',
    finding=('A 9:1 glider at Va >= 8 m/s settles at eps 73-82 deg (tan eps 3.4-7.5): the line rises 4-6 m within 1 m behind the rider, '
             'so the kite2/towglider clothesline (0.7-0.8 m above the snow) disappears. But (a) a camera ON the flyer then looks almost straight down: '
             'bodyPx >= 300 needs eps <= 65 deg at l 5 m, <= 55 deg at 8 m, <= 45 deg at 10 m, <= 25 deg at 15 m; (b) head clearance is set by the exit, '
             'not by eps - a pack-top exit is 0.35 m from the helmet whatever the line angle. The flyer must deliberately fly LOWER than it can '
             '(airbrake dCD 0.15-0.65 at Va 8-20 m/s for eps 45-60 deg, at +10-35 % tension) or the camera must leave the flyer (H8).'),
    assumed=['G130/K120 polars', 'line Cd 1.1', 'rider/helmet geometry (helmet 0.35 m from a pack-top exit)', 'camera 66 deg HFOV 4K 4:3'],
))

H.append(dict(
    id='H2', title='Active reel-in keeps the flyer up when the apparent wind is too low (stops, tailwinds, slow riders)',
    method='h2_reel_sustain.py: S1 straight reel-in (closed form); S2 circling on a cone round the stopped rider with a tension-held reel (sim3d, 20 s, calm); S3 "yo-yo": tension-controlled winch-climb inbound + glide outbound with fed-forward pay-out (sim3d, 40 s, calm); S4 free circling glide (closed form); S5 dock & relaunch. Battery budget per 45 min = 54 stops (27 laps of the R4 run).',
    numbers=dict(
        S1=h2['S1_straightReelIn'],
        S2_spiral=s2,
        S3_yoyo=s3,
        S4_freeGlide=h2['S4_freeGlide'],
        S5_dock=h2['S5_dock'],
        batteryFit=h2['batteryFit'],
        lineEqualsAltitude='In calm with a fixed exit, height = l sin(eps): every metre of line reeled in while circling is lost height. S2 runs lost 10-21 m of height and used 11-25 m of line in 20 s whatever the tension set-point (1-6 N); more tension only burned more energy (15-260 J).',
    ),
    verdict='CONDITIONAL - straight reel-in REFUTED; circling + reel REFUTED; yo-yo pumping SUPPORTED in simulation but costly and unfilmable',
    finding=('Straight reel-in needs line at the stall-margin airspeed: 106 m for a 20 s stop (G130), 46 m (K120) - a 30 m line buys 5.7 s / 13 s. '
             'Circling on a tension-held reel cannot hold height in calm (line = altitude). The only reel-only strategy that held height '
             f'was the yo-yo (winch-climb in, glide out): G130 sustained 40 s with line between ~7 and 28 m at {min(r["meanP_W"] for r in s3ok if r["flyer"]=="G130")}-{max(r["meanP_W"] for r in s3ok if r["flyer"]=="G130")} W mean battery power '
             f'(K120 {min(r["meanP_W"] for r in s3ok if r["flyer"]=="K120")}-{max(r["meanP_W"] for r in s3ok if r["flyer"]=="K120")} W), i.e. 120-350 J per 20 s stop, 1.8-5 Wh per 45 min = 20-55 g of cells in the PACK (not on the flyer). '
             'It fits the battery only if the reel is in the backpack; the flyer swoops 7-28 m round the rider every 5-10 s (no usable footage, head-clearance risk on every inbound leg). '
             'Docking and relaunching costs 40-120 J per stop and is the rational stop strategy; the minimum line budget is set by the 6-7 m camera station plus ~5 m of gust/heave margin (h3: 0 m with a CL loop) - ~12-15 m, '
             'or >= 28 m if the yo-yo is kept.'),
    assumed=['motor efficiency 0.5', 'tow tension set-points', 'guidance laws (crude; better optimal control would lower energy)'],
))

H.append(dict(
    id='H3', title='"Fly it like a kite": pay out when lift is surplus, reel in when it drops, to regulate tension and position',
    method='h3_control.py Part A: reduced-order in-plane model (eps, eps_dot, l; inputs reel speed and CL) linearised numerically about the h1 equilibrium -> mode frequency, damping, reel->tension and gust->tension gains, with and without airbrake. Part B: sim3d with Dryden turbulence + rider speed oscillation + heave; controllers 0 locked reel, 1 tension-tracking reel (PI, lag tau 0.02-0.5 s, |a| <= 20 m/s^2, |v| <= 8 m/s), 2 = 1 + eps-rate damping via CL, 3 CL tension loop (servo-rate limited) + slow reel length hold.',
    numbers=dict(
        linear_G130_unbraked=[{k: r[k] for k in ('Va', 'l', 'eps0_deg', 'T0', 'fn_Hz', 'zeta', 'dT_dReelOut', 'dT_dVa', 'dT_dCL')} for r in lin if r['flyer'] == 'G130' and r.get('brake', 0) == 0 and r['l'] in (10, 20)],
        linear_G130_braked=[{k: r[k] for k in ('Va', 'l', 'brake', 'eps0_deg', 'T0', 'fn_Hz', 'zeta', 'dT_dReelOut', 'dT_dVa')} for r in lin if r.get('eps_target')],
        linear_K120=[{k: r[k] for k in ('Va', 'l', 'eps0_deg', 'T0', 'fn_Hz', 'zeta', 'dT_dReelOut')} for r in lin if r['flyer'] == 'K120' and r['l'] in (10, 20)],
        timeDomain=[{k: r.get(k) for k in ('Va', 'l', 'mode', 'tau', 'ok', 'Tref', 'Tsd', 'Tp95', 'Tmax', 'Tmin', 'eps_sd', 'eps_min', 'lineExcursion', 'reelVmax', 'reelAccP99', 'reelPowerMeanAbs_W')} for r in tb],
    ),
    verdict='REFUTED for a steep, unbraked glider; CONDITIONAL (supported) when the flyer is braked to eps 30-60 deg and the fast loop is CL/airbrake, the reel slow',
    finding=('The in-plane "tether pendulum" of a fixed-trim 9:1 glider is lightly damped (zeta 0.00-0.2 at Va 8-20 m/s, fn 0.1-0.8 Hz) and UNSTABLE at Va 6 m/s '
             '(zeta -0.3 to -0.67: it overshoots over the zenith and falls, also seen in sim3d). At eps ~75-82 deg the reel is a weak tension actuator: '
             'dT/d(reel speed) = 0.12-0.3 N per m/s against dT/dVa = 0.7-1.8 N per m/s of gust, so cancelling sigma_u 1.2 m/s would need 4-8 m/s of reel speed. '
             'A tension-tracking reel made things worse in time domain (tension sd up to 3.4 N vs 2.6 N locked, eps excursions to 17-48 deg, 10-16 m line wander) for every reel lag 0.02-0.5 s. '
             'A CL/airbrake tension loop with the reel only holding length cut tension sd to 0.9-1.3 N (Tmax/Tref 1.24-1.43 at Va 12-16) with eps sd 0.5-1.3 deg and zero line excursion. '
             'Braking to eps 30-60 deg raises zeta to 0.35-1.45 and reel authority to 0.45-2.2 N per m/s (dT/dReel approaches dT/dVa at eps 30 deg). '
             'Requirements: CL/brake actuator >= 3 CL/s (micro-servo class), pitch-rate/eps-rate damping; reel loop bandwidth ~1-2 Hz for heave and slack take-up, '
             '|a| ~5-14 m/s^2, |v| ~1.5-3.4 m/s, mean |P| 3-9 W when it chases tension (avoid), < 1 W when it only holds length. At Va 8 m/s gusts still produce slack/snatch (Tmin 0, Tmax 10-35 N): '
             'the low-Va end needs a softer line segment or a slip clutch.'),
    assumed=['Dryden parameters (W20 6 m/s)', 'rider speed oscillation and heave amplitudes', 'quasi-steady aero (no pitch dynamics of the flyer)', 'controller gains (hand-tuned)'],
))

H.append(dict(
    id='H4', title='The reel as the KE governor; where reel-in to stay airborne conflicts with KE <= 14.9 J',
    method='h4_ke.py: exact kinematics in the rider frame; identity ground^2 - airspeed^2 = W_t (v_s + Va + 2 v_in cos eps); KE speed cap sqrt(2*14.9/m); h6 riding cases give KE of crosswind manoeuvres; launch_dock stop simulations give KE of fast reel-in at a hockey stop.',
    numbers=dict(
        speedCap=h4['speedCap'],
        massCeiling_g={'rider 13.2 m/s (R4 max)': h4['massCeilingAtRider13_2'], 'rider 12 m/s': h4['massCeilingAtRider12']},
        conflicts=[r for r in h4['reelInConflict'] if r.get('conflict') and r['eps'] == 60][:12],
        crosswindAllowance=h4['crosswindAllowance'],
        payoutGovernor=h4['payoutGovernor'],
        loopsWhileRiding=[{k: r.get(k) for k in ('flyer', 'W', 'vs', 'Vlim', 'ok', 'KEmax', 'Vmax')} for r in h6_riding],
        hockeyStopFastReelIn=[{k: r[k] for k in ('flyer', 'l0', 'strategy', 'KEmaxGround', 'minHelmetDist', 'maxAheadOfRider')} for r in ld['stopSim']],
    ),
    verdict='SUPPORTED as a governor by PAYING OUT; REFUTED as "reel in harder"',
    finding=('Any flyer that keeps station follows at the rider\'s ground speed, so KE = m v_s^2/2 regardless of the reel: m <= 171 g at the R4 maximum 13.2 m/s (207 g at 12 m/s). '
             'Reel-in for airspeed in a tailwind adds ground speed by the exact identity ground^2 = airspeed^2 + W_t(v_s + Va + 2 v_in cos eps): with 130 g it never broke the cap in the R4 grid '
             '(worst 13 J at 13.2 m/s with 9 m/s tail), with 200 g it broke it in every fast-rider case. Crosswind loops while riding broke it for G130 at 13.2 m/s (16.3 J) and K120 (15.1-17.1 J). '
             'The dangerous case is braking: fast reel-in at a hockey stop gave 38-145 J ground-frame KE and passed 0.1-0.16 m from the helmet (K120). '
             'A pay-out governor works kinematically (pay out at v_s - v_cap; 1.3 m/s = 13 m per 10 s for 200 g at 13.2 m/s) but eats line; a <= 150 g flyer needs essentially none. '
             'Rules: m_flyer <= ~150 g; never reel in faster than KE allows; on a stop brake/deep-stall instead of reeling (H-stop below).'),
    assumed=['Vreq = 1.15 x stall', 'R4 maximum rider speed 13.2 m/s (kite2 design_notes)'],
))

H.append(dict(
    id='H5', title='Reel on the flyer vs reel in the backpack',
    method='h5_reel_location.py: flyer reel kit mass (micro gearmotor 9.5 g, spool/level-wind 6 g, 30 m UHMWPE 4.5 g, driver/encoder 2 g = 22 g, ASSUMED class values) + cell for reel energy (from h2/h3), consequences for stall speed, eps (h1 solver), KE at 13.2 m/s; latency/peak-power argument for heave compensation.',
    numbers=dict(cases=h5['cases'], kit=h5['flyerReelKit_g'], dynamics=h5['dynamics']),
    verdict='Backpack reel SUPPORTED; flyer reel REFUTED for this product',
    finding=('A flyer reel adds 22 g of kit plus 4-34 g of cells: 156-186 g flyer, stall +10-20 %, eps at Va 8 m/s down 2-6 deg, KE at 13.2 m/s 13.6-16.2 J (over the cap from ~171 g). '
             'A pack reel adds nothing to the flyer and, with the conductive line, removes the flyer cell (122 g, KE 10.6 J, cap speed 15.6 m/s). '
             'The disturbance (rider speed oscillation, heave, the 8-9 m/s lean flip at a hockey stop) enters at the exit, so the pack reel can cancel it locally with ~10-20 ms latency and ~40 W peak; '
             'a 9.5 g flyer gearmotor is a 1-2 W device behind a radio hop. Line drag is the same either way (same deployed length). The flyer-reel advantage (no moving drum on the body, simple harness breakaway) does not outweigh mass/KE/power.'),
    assumed=['kit masses (class values)', 'latencies', 'pack motor class'],
))

H.append(dict(
    id='H6', title='(bold) Crosswind figure-8 / loops (or "dynamic soaring") keep a kite up with zero net reel energy down to apparent wind X',
    method='h6_crosswind.py: sim3d with the reel locked, vector-field loop and figure-8 guidance on the tether sphere, high-lift trim, airspeed governor (CL reduction + spoiler above 9 m/s), l 10/20 m, two loop centres, W 0-6 m/s, 60 s; KE in the ground frame for riding cases. Physics bound for W = 0: no energy source (stopped rider has no wake; dynamic soaring needs a wind gradient - Sachs 2005).',
    numbers=dict(
        X_bestPattern_ms={'G130': minW('G130'), 'K120': minW('K120')},
        X_byPattern=h6['X_ms'],
        staticFloor_ms={'G130': 4.6, 'K120': 2.0},
        loopSpeedsUngoverned='W 4 m/s, l 15 m, no governor: airspeed 24 m/s, tension 31 N for a 130 g glider (Loyd v ~ W L/D cos eps)',
        orbitRate_degPerS='line-of-sight rate of the rider from the looping flyer: p50 13-55, p90 20-78 deg/s (shared jitter rule p90 <= 3 deg/s)',
        runs=[{k: r.get(k) for k in ('flyer', 'W', 'l', 'elc', 'eight', 'ok', 'zMin', 'Tmean', 'Tp95', 'Vmean', 'KEmax', 'losP90')} for r in h6['runs'] if r['vs'] == 0 and r['W'] in (1.0, 1.5, 2.0, 2.5, 3.0)],
    ),
    verdict='CONDITIONAL - X ~ 2-2.5 m/s (130 g glider) and ~1.5 m/s (120 g low-loading kite); REFUTED at a stop in calm (X > 0 by first principles); loops are a survival mode, not a filming mode',
    finding=('Crosswind loops halve the wind floor of the 9:1 glider (static 4.6 -> loops 2.0-2.5 m/s, pattern- and controller-dependent) and give the low-wing-loading kite 1.5 m/s (static 2.0). '
             'Ungoverned loops are violent (24 m/s, 31 N at W 4 m/s), so a speed governor is mandatory; with it, riding cases at Va 3 m/s still reached 14-17 J at 12-13.2 m/s rider speed. '
             'The orbiting viewpoint sweeps the rider at typically 13-55 deg/s (p50), up to 78 deg/s (p90), far above the 3 deg/s jitter rule. Calm at a stop: nothing in the simulations sustained at W 0-1 m/s, as physics requires. '
             'Circular loops twist the line (one turn per loop) - figure-8 or a swivel is required. Guidance here is crude; an optimised controller could lower X somewhat, never to 0.'),
    assumed=['guidance laws/gains', 'uniform wind (no gradient near the snow)', 'speed-governor law'],
))

H.append(dict(
    id='H7', title='(bold, own) When the tailwind exceeds the rider speed the stable station flips AHEAD of the rider - fly the kite in front and film the face',
    method='Kinematics of apparent wind (h4) over the R4 wind grid, dead-band classification with X (h6) and the static floor (h1); geometry of the transition.',
    numbers=dict(deadBand_R4=dead, X=X, staticVaNeeded=Vstat),
    verdict='REFUTED as a product mode (physically true)',
    finding=('Apparent wind reverses whenever the tailwind component exceeds the rider speed (R4: tail 9 with any rider below 9 m/s, every push-off in tail >= 3 m/s, short turns at 8 m/s in tail 9). '
             'The flyer\'s equilibrium is then downwind = ahead. But the transition passes through |Va| < X (no flight) and over the rider\'s head, and a line in front of the body is a face/neck hazard. '
             'At 12 m/s riding the G130 is "static" in calm/head/cross/tail <= 6 and "loops-only" in tail 9 (Va 3); at 8 m/s tail 6 is loops-only and tail 9 is dead/reversed; at 4 m/s (push-off, moguls) '
             'most tail cases are dead. These are wind-gate / dock cases, not flight cases.'),
    assumed=['X values from h6', 'rider speeds 4/8/12 m/s'],
))

H.append(dict(
    id='H8', title='(bold, own) Put the camera ON THE LINE 5-6 m from the exit (kite-aerial-photography style) and let the flyer fly high and steep',
    method='h1 geometry: camera clamped on a straight line at s metres from the exit, flyer at l = 20 m; env.js bodyPx rule.',
    numbers=dict(cameraOnLine_l20=h1['cameraOnLine_l20']),
    verdict='SUPPORTED (geometry) - CONDITIONAL on eps <= 60-65 deg and a stabilised camera mount',
    finding=('A line-mounted camera at 5-6 m gives bodyPx 369-435 at eps 60 deg, 422-497 at 55 deg, 472-556 at 50 deg, at a 5.4-6.4 m distance and a depression equal to eps. '
             'The camera sits ON the line, so its own line runs end-on towards the subject (no clothesline across the frame), it moves only s/l (25-30 %) of the flyer motion (gust and loop motion attenuated), '
             'and the flyer can stay at 15-30 m where it is >= 10 m from the head and in cleaner air. The flyer must still be braked to eps <= 60-65 deg (H1/H9), and the camera needs a Picavet/gimbal against line swing. '
             'Kite aerial photography already hangs cameras on the line (https://en.wikipedia.org/wiki/Kite_aerial_photography).'),
    assumed=['straight line between exit and flyer (sag <= 0.1 m at T >= 1.5 N)', 'camera mass not modelled in the equilibrium'],
))

H.append(dict(
    id='H9', title='(bold, own) "Fly braked": one airbrake setting fixes the camera angle, the pendulum damping and the reel authority at once',
    method='h1 brake bisection + h3 linearisation of the braked equilibria.',
    numbers=dict(braked=[{k: r[k] for k in ('Va', 'l', 'brake', 'eps0_deg', 'T0', 'zeta', 'dT_dReelOut', 'dT_dVa')} for r in lin if r.get('eps_target')],
                 unbraked=[{k: r[k] for k in ('Va', 'l', 'eps0_deg', 'T0', 'zeta', 'dT_dReelOut')} for r in lin if r['flyer'] == 'G130' and r.get('brake', 0) == 0 and r['Va'] in (8, 12, 16) and r['l'] in (10, 20)]),
    verdict='SUPPORTED in the model',
    finding=('Braking the G130 from eps 75-81 deg down to 45-60 deg raises damping from zeta 0.01-0.16 to 0.13-0.95, raises reel authority 2-6x (0.27-1.3 N per m/s), and puts the camera geometry in the 300-px window, '
             'at a tension cost of +11-13 % (60 deg), +36-38 % (45 deg), ~+95 % (30 deg) - still <= 15 N at Va 16 m/s for 45 deg. The "high L/D" requirement therefore becomes "high L/D with a large, fast drag modulation range (dCD 0-0.7)": '
             'the L/D is spent on climbing to station at low Va, the brake on holding it at high Va.'),
    assumed=['brake as a pure dCD (spoiler/split flap) without CL change', 'quasi-steady aero'],
))

H.append(dict(
    id='H10', title='Launch from the back at rider speed 3-8 m/s',
    method='launch_dock.py: closed-form release envelope + sim3d release 0.4 m behind/0.3 m above the exit on a 0.5 m line, CL scheduled so lift <= 3 mg, pay-out-only tension control (T_ref 0.5 N) to 12 m.',
    numbers=dict(envelope=ld['launchEnvelope'], sim=ld['launchSim']),
    verdict='CONDITIONAL',
    finding=('The 130 g glider needs Va >= 5.3 m/s to release and ~7 m/s to climb briskly: in calm it cannot launch below ~6 m/s rider speed (Va 4-5 m/s: falls; Va 6: 3.3 s to 3 m and stalls out of the climb; Va 7: 1.3 s to 3 m, 4.9 s to 6 m; Va 8: 0.7/2.9 s; Va 12-16: 0.5/1.3-1.6 s). '
             'With a 3 m/s tailwind the rider must exceed ~8.3 m/s. The 120 g low-loading kite launches from Va 4 m/s (1.8 s to 3 m) but pulls 16-83 N on the way up unless depowered. '
             'Releasing from the pack top passes 0.47-0.65 m from the helmet in every case - launch must start from a station >= 1 m from the helmet (rear boom or seat holster, as towglider did) to meet headClear. '
             'At high Va a full-CL release loops the flyer over and into the snow (first runs, 380 N) - the release CL must be scheduled with airspeed (pitot), exactly like a kite launched in strong wind.'),
    assumed=['release geometry', 'CL schedule', 'pitot available on the flyer'],
))

H.append(dict(
    id='H11', title='Hockey stop and docking: reel in fast, or brake?',
    method='launch_dock.py: rider 12 -> 0 m/s in 2 s (6 m/s^2) in calm, 0.2 s detection latency; strategies none / brake (spoiler dCD 0.8, CL 0.3, slack take-up only) / fast reel-in 6 m/s / pay-out-and-loiter. Dock snap from line spring (EA 5 kN over 0.5 m).',
    numbers=dict(stop=ld['stopSim'], dockSnap=ld['dockSnap'], lineElasticEnergy=ld['lineElasticEnergy']),
    verdict='Brake-then-retrieve SUPPORTED; fast reel-in REFUTED',
    finding=('Doing nothing, the steep flyer keeps its 12 m/s and overflies the stopped rider by 10-20 m (lands ahead). Fast reel-in is the worst option: 38-145 J ground-frame KE and, for the kite, 0.1-0.16 m from the helmet. '
             'Deep-stall/airbrake at stop onset with slack-only take-up kept the flyer behind the rider (never ahead), >= 7 m from the helmet, KE <= 9.4 J, landing 7-15 m behind; it is then reeled in along the snow or re-flown if the wind allows. '
             'Docking: a rigid stop at 2 m/s closing speed snaps the line to ~70 N; a 26-52 mm compliant dock stroke (or reel slip clutch) keeps it to 5-10 N; relative KE at 2 m/s is 0.26 J. '
             'Line elastic energy is small (0.03-1.2 J at 5-20 N), so snap-back is a minor hazard compared with the flyer itself.'),
    assumed=['stop deceleration 6 m/s^2', 'detection latency 0.2 s', 'brake dCD 0.8 achievable (split flap / deep-stall trim)'],
))

report['designImplications'] = [
    ('1. Decouple the camera from the flyer\'s elevation: either clamp the camera on the line 5-6 m from the exit (H8) or brake the flyer to eps 45-60 deg (H9); '
     'a camera on a free-flying 9:1 glider at its natural 75-82 deg sees the top of the helmet (bodyPx 120-240 at 5-10 m). The high-L/D wing earns its keep at LOW apparent wind (station-keeping 4.6->~2.5 m/s with loops) - '
     'at high Va it must carry a fast, large airbrake (dCD 0-0.7), which is also the primary tension/KE/stop actuator.'),
    ('2. Put the reel in the backpack and use it slowly: length hold, slack take-up, heave compensation at the exit, retrieve. The fast tension loop belongs to the flyer\'s CL/airbrake (H3: reel tension-chasing is ineffective at steep eps and degraded every metric). '
     'Never reel in to regain airspeed at a stop (H4/H11: 38-145 J); deep-stall/brake instead. Keep the flyer <= ~150 g (KE ceiling 171 g at 13.2 m/s; a flyer reel pushes it to 156-186 g).'),
    ('3. Treat low apparent wind as a gate, not a flight regime: below ~5.3 m/s (G130) static flight is impossible, below ~2-2.5 m/s nothing reel-free works, and in calm the only reel-only sustain (yo-yo) costs 6-18 W, 18-28 m of line and all usable footage. '
     'Stops -> brake, land behind, retrieve/dock (40-120 J), relaunch above ~6-7 m/s rider speed (or use a low-wing-loading wing, which launches at ~4 m/s but needs a 5-10x depower range). '
     'Separately, headClear >= 1.0 m is set by where the line leaves the body: a pack-top exit (0.35 m) cannot pass for any line angle - the exit/launch station must sit >= 1 m from the helmet (rear boom ~0.8 m, or a seat/hip holster).'),
]
report['limitations'] = [
    'Point-mass flyer: no pitch/roll dynamics, no aeroelasticity, quasi-steady aero; the in-plane mode damping depends on these and must be re-derived with a 6-DOF model and wind-tunnel/tow data.',
    'Straight line with cross-flow drag (no line waves, no sag dynamics); valid for T >= ~1 N, l <= 30 m.',
    'Uniform wind in the rider frame (no gradient near the snow, no terrain); turbulence longitudinal only.',
    'Guidance/controllers hand-tuned; X, energies and launch times are controller-dependent (upper bounds on what optimal control achieves for X; lower bounds on achievable energy are physics-bound only for W = 0).',
    'Polars ASSUMED for Re ~5e4-1.6e5; low-Re hysteresis/laminar bubbles can cut L/D and CLmax by 20-40 % (Selig, VFS 2026).',
    'No physical test of any kind. Simulation is not physical verification (AGENTS.md).',
]
report['sources'] = [
    {'id': 'Loyd1980', 'what': 'Crosswind kite power: v_crosswind ~ W (L/D); power ~ (L/D)^2', 'url': 'https://awesco.eu/awe-explained/Loyd1980.pdf'},
    {'id': 'CrosswindWiki', 'what': 'crosswind kite power overview', 'url': 'https://en.wikipedia.org/wiki/Crosswind_kite_power'},
    {'id': 'vanderVlugt2019', 'what': 'Quasi-steady model of a pumping kite power system (gravity matters; tether drag grows with length)', 'url': 'https://arxiv.org/pdf/1705.04133'},
    {'id': 'Fagiano2010', 'what': 'High-altitude wind power generation, IEEE TEC 25(1):168-180 (automatic crosswind flight of tethered airfoils)', 'url': 'https://fagiano.faculty.polimi.it/docs/FaMiPi_TR_27082009.pdf'},
    {'id': 'Fechner_FF', 'what': 'Feed-forward control of kite power systems (winch force/speed control)', 'url': 'https://core.ac.uk/works/33452152'},
    {'id': 'RigidWingPumping', 'what': 'Control of a rigid-wing pumping AWE system in all operational phases', 'url': 'https://arxiv.org/pdf/2006.11141'},
    {'id': 'ReelingNoWind', 'what': 'Optimal reeling control without wind speed feedback (reel speed ~ tension)', 'url': 'https://arxiv.org/pdf/2109.15032'},
    {'id': 'Kitepower', 'what': 'pumping cycle: reel-out 80 % / reel-in 20 % of 100 s, reel-in at low force', 'url': 'https://thekitepower.com/?p=21710'},
    {'id': 'TetherDragFoM', 'what': 'tether drag in the AWE figure of merit (Houska & Diehl estimate)', 'url': 'https://repository.tudelft.nl/file/File_0a654ec4-4393-4122-8796-c659717911c3'},
    {'id': 'BGA_winch', 'what': 'winch launch practice (release under tension, height vs cable length)', 'url': 'https://www.gliding.co.uk/wp-content/uploads/sites/3/2019/06/Winch-Launch.pdf'},
    {'id': 'WinchSim', 'what': 'glider winch launch simulation: cable speed, release at ~60 deg cable angle', 'url': 'https://bogan.ca/soaring/winch/winch.html'},
    {'id': 'WinchRule', 'what': 'release height ~1/3 of cable length (club rule of thumb)', 'url': 'https://soargbsc.com/inststud/SOARING/photo_page_7.htm'},
    {'id': 'IndoorKite', 'what': 'kites flown with no wind by relative motion / line pulls', 'url': 'https://en.wikipedia.org/wiki/Indoor_kite'},
    {'id': 'Sachs2005', 'what': 'Minimum shear wind strength for dynamic soaring (Ibis 147:1-10)', 'url': 'https://portal.fis.tum.de/en/publications/minimum-shear-wind-strength-required-for-dynamic-soaring-of-albat/'},
    {'id': 'Richardson2011', 'what': 'How do albatrosses fly around the world without flapping (Rayleigh cycle, wind gradient required)', 'url': 'https://www2.whoi.edu/staff/prichardson/wp-content/uploads/sites/75/2018/11/Richardson-2011-PinO-How-do-albatrosses-fly.pdf'},
    {'id': 'SeligLowRe', 'what': 'airfoils at low speeds (UIUC low-Re data)', 'url': 'https://m-selig.ae.illinois.edu/ads/soartech8_abs.html'},
    {'id': 'VFS2026LowRe', 'what': 'L/D strongly Re-dependent at 1e4-1e5 (laminar separation bubbles)', 'url': 'https://proceedings.vtol.org/82/proceedingsPaper?paper=217'},
    {'id': 'Dryden', 'what': 'MIL-F-8785C low-altitude Dryden turbulence scales', 'url': 'https://en.wikipedia.org/wiki/Dryden_Wind_Turbulence_Model'},
    {'id': 'CylinderCd', 'what': 'cylinder drag coefficient ~1.0-1.2 at line Reynolds numbers', 'url': 'https://en.wikipedia.org/wiki/Drag_coefficient'},
    {'id': 'KAP', 'what': 'kite aerial photography: camera suspended on the line (Picavet)', 'url': 'https://en.wikipedia.org/wiki/Kite_aerial_photography'},
    {'id': 'PololuMicro', 'what': 'micro metal gearmotor 9.5 g class', 'url': 'https://www.robotshop.com/products/pololu-50-to-1-micro-hp-gear-motor'},
    {'id': 'project', 'what': 'shared rules/basis: sim/js/concepts/common/{criteria,components,env,fullrun}.js; research/concepts_2026_10_19/dev/{kite2,towglider}/design_notes.json', 'url': 'local repository'},
]
save('report.json', report)
print('report.json written:', len(H), 'hypotheses')
