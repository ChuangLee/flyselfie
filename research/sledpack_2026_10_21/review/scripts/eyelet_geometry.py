# SIM-034 review: rear hip-belt eyelet (0.30 m behind / 0.35 m below the shared pelvis point) — 3D line clearance to the
# shared helmet point (bodyPoints head) vs line elevation and azimuth (0 = straight behind, 90 = to the side), plus the
# height of the eyelet and of the line, and the stowed-sail-to-helmet distance at release. Shared body model, ASSUMED.
import math
def pts(c):
    hipH = 0.95 - 0.22*c
    pel = (-0.06-0.1*c, 0.0, hipH); head = (0.12, 0.0, hipH+0.78)
    return pel, head
def clr(head, a, el, az):
    e, z = math.radians(el), math.radians(az)
    d = (-math.cos(e)*math.cos(z), math.cos(e)*math.sin(z), math.sin(e))
    v = [head[k]-a[k] for k in range(3)]; t = max(0, sum(v[k]*d[k] for k in range(3)))
    return math.dist(head, [a[k]+t*d[k] for k in range(3)])
for c in (0.2, 0.4, 0.6, 0.75):
    pel, head = pts(c); a = (pel[0]-0.30, 0, pel[2]-0.35)
    print(f'crouch {c}: eyelet height {a[2]:.2f} m, |eyelet-helmet| {math.dist(a, head):.3f} m')
    for az in (0, 30, 60, 90, 120):
        print('   az', az, ' '.join(f'el{el}:{clr(head, a, el, az):.2f}' for el in (30, 45, 55, 60, 65, 70, 80, 90)))
# elevation at which clearance drops below 1.0 m straight behind
pel, head = pts(0.4); a = (pel[0]-0.30, 0, pel[2]-0.35)
for el in range(40, 91):
    if clr(head, a, el, 0) < 1.0: print('straight behind: <1.0 m above elevation', el, 'deg (body frame)'); break
# clothesline: line from a 0.51 m eyelet at elevation el (relative to body/ slope normal ~ snow plane on a 15 deg slope, downhill rider)
for el in (45, 55, 60):
    ang = math.radians(el - 15)  # above the snow surface behind a downhill rider on a 15 deg slope
    print(f'el {el}: line reaches 2 m above snow at {(2-0.51)/math.tan(ang):.2f} m behind the eyelet (horizontal along slope)')
# stowed sail top (nose at the shoulder blades) vs helmet: sail lies on the back 0.06 m off the back plane (packMid f −0.26)
for c in (0.2, 0.4, 0.6):
    pel, head = pts(c); hipH = pel[2]
    nose = (-0.26-0.06, 0, hipH+0.41)
    for lat in (0, 0.295):
        print(f'crouch {c} sail nose/tip lat {lat}: distance to helmet {math.dist(head, (nose[0], lat, nose[2])):.2f} m')
