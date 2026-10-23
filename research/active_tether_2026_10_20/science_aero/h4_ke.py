"""H4 - the reel as the KE governor; where 'reel in to stay airborne' collides with KE <= 14.9 J.

Kinematics (rider frame translating at v_s along +x; flyer behind at elevation eps, azimuth 0):
  apparent wind Wa = -(v_s - W_t) x  (W_t = tailwind, negative = headwind), Va = v_s - W_t
  reel-in at v_in moves the flyer along the line towards the exit: u = v_in (cos eps, 0, -sin eps)
  airspeed^2  = Va^2 + 2 Va v_in cos eps + v_in^2
  ground^2    = v_s^2 + 2 v_s v_in cos eps + v_in^2
  => ground^2 - airspeed^2 = W_t (v_s + Va + 2 v_in cos eps)   (exact identity)
Crosswind motion at speed v_c (perpendicular to the track): ground^2 = v_s^2 + v_c^2 (+ reel terms).
Pay-out governor: paying out at v_out lowers the ground speed to v_s - v_out cos eps (approximately)
and the airspeed by the same amount; it consumes line at v_out.
"""
import math
from common import ke_speed_cap, save, G130


def airspeed(Va, vin, eps):
    return math.sqrt(max(0.0, Va * Va + 2 * Va * vin * math.cos(eps) + vin * vin))


def ground(vs, vin, eps):
    return math.sqrt(max(0.0, vs * vs + 2 * vs * vin * math.cos(eps) + vin * vin))


def vin_needed(Va, Vreq, eps):
    """smallest reel-in speed giving airspeed >= Vreq"""
    if Va >= Vreq:
        return 0.0
    # v^2 + 2 Va cos e v + Va^2 - Vreq^2 = 0
    b = 2 * Va * math.cos(eps)
    c = Va * Va - Vreq * Vreq
    return (-b + math.sqrt(b * b - 4 * c)) / 2


def run():
    out = {}
    masses = [0.080, 0.100, 0.130, 0.150, 0.171, 0.200]
    out['speedCap'] = [dict(mass_g=round(m * 1000), vCap=round(ke_speed_cap(m), 2)) for m in masses]
    vmax_rider = 13.2  # max rider speed in the round-4 ensemble (kite2 design_notes rootCause.ke)
    out['massCeilingAtRider13_2'] = round(2 * 14.9 / vmax_rider ** 2 * 1000, 1)
    out['massCeilingAtRider12'] = round(2 * 14.9 / 12 ** 2 * 1000, 1)
    # conflict map: reel-in needed to keep Vreq in a tailwind; resulting ground speed vs cap
    Vreq = 1.15 * G130.vmin()  # 1.15 x stall of the 130 g baseline (ASSUMED margin)
    rows = []
    for m in (0.080, 0.130, 0.200):
        cap = ke_speed_cap(m)
        for vs in (3, 5, 8, 10, 12, 13.2):
            for Wt in (0, 3, 4.5, 6, 9):
                for eps_d in (30, 60, 75):
                    eps = math.radians(eps_d)
                    Va = vs - Wt
                    if Va <= 0:
                        rows.append(dict(mass_g=round(m * 1000), vs=vs, Wt=Wt, eps=eps_d, Va=Va, note='apparent wind reversed: flyer must sit ahead (downwind) of the rider or loiter'))
                        continue
                    vin = vin_needed(Va, Vreq, eps)
                    vg = ground(vs, vin, eps)
                    rows.append(dict(mass_g=round(m * 1000), vs=vs, Wt=Wt, eps=eps_d, Va=round(Va, 2), vinNeeded=round(vin, 2),
                                     groundSpeed=round(vg, 2), KE=round(0.5 * m * vg * vg, 1), cap=round(cap, 2),
                                     conflict=vg > cap, lineUsedPer10s=round(vin * 10, 1)))
    out['Vreq'] = round(Vreq, 2)
    out['reelInConflict'] = rows
    # minimal ground speed of any flyer holding airspeed Vreq in a tailwind, flying downwind at the rider's side:
    out['downwindFloor'] = 'a flyer that keeps pace with the rider has ground speed >= v_s; one that gains airspeed by reeling in has ground^2 = airspeed^2 + W_t (v_s + Va + 2 v_in cos eps)'
    # crosswind allowance
    cw = []
    for m in (0.080, 0.130, 0.171, 0.200):
        cap = ke_speed_cap(m)
        for vs in (5, 8, 10, 12, 13.2):
            vc = math.sqrt(cap * cap - vs * vs) if cap > vs else 0.0
            cw.append(dict(mass_g=round(m * 1000), vs=vs, vCrossAllowed=round(vc, 2)))
    out['crosswindAllowance'] = cw
    # pay-out governor line cost: time above cap for a rider profile; assume rider speed exceeds cap by dv for t s
    gov = []
    for m in (0.130, 0.150, 0.171, 0.200):
        cap = ke_speed_cap(m) - 0.3  # 0.3 m/s governor margin (ASSUMED)
        for vs in (12.0, 13.2, 14.0):
            dv = max(0.0, vs - cap)
            gov.append(dict(mass_g=round(m * 1000), vs=vs, payoutSpeed=round(dv, 2), linePer10s=round(dv * 10, 1),
                            airspeedLossOK=(vs - dv) > Vreq))
    out['payoutGovernor'] = gov
    # docking approach: relative KE at closing speed v_close (rider frame) - head-strike relevance
    dock = []
    for m in (0.080, 0.130, 0.200):
        for vc in (1, 2, 3, 5):
            dock.append(dict(mass_g=round(m * 1000), closing=vc, relKE_J=round(0.5 * m * vc * vc, 3)))
    out['dockRelKE'] = dock
    save('h4_results.json', dict(model=__doc__, **out))
    return out


if __name__ == '__main__':
    o = run()
    print(o['speedCap'], o['massCeilingAtRider13_2'], o['Vreq'])
    for r in o['reelInConflict']:
        if r.get('conflict') or r['mass_g'] == 130 and r['eps'] == 60:
            print(r)
    print(o['crosswindAllowance'])
    print(o['payoutGovernor'])
