# SIM-033 review: hand calculations on the SHARED body model (common/skier.js bodyPoints) — not why_pole.py's body.
# Sagittal plane, x = forward along heading, z = up from the snow-normal foot point. Numerical, ASSUMED geometry.
import math
def body(c):
    hipH = 0.95 - 0.22*c
    pel = (-0.06-0.1*c, hipH); head = (0.12, hipH+0.78)
    return pel, head
def exitpt(c, f=-0.17, u=-0.12):
    pel, _ = body(c); return (pel[0]+f, pel[1]+u)
def clr(head, a, el_back_deg):
    # line leaves a going BACKWARD (−x) and up at elevation el (relative to body-horizontal)
    e = math.radians(el_back_deg); d = (-math.cos(e), math.sin(e))
    v = (head[0]-a[0], head[1]-a[1]); t = max(0, v[0]*d[0]+v[1]*d[1])
    return math.hypot(v[0]-t*d[0], v[1]-t*d[1])
out = {}
print('crouch |exit-helmet| clearance@ elevation 25/40/55/70/90(overhead)/110(over head, kite blown forward)')
for c in (0.2, 0.4, 0.6):
    _, h = body(c); a = exitpt(c)
    r = math.hypot(h[0]-a[0], h[1]-a[1])
    row = [round(clr(h, a, e), 3) for e in (25, 40, 55, 70, 90, 110)]
    out[f'c{c}'] = {'exitHelmet': round(r, 3), 'clear': row}
    print(c, round(r, 3), row)
# required |exit-helmet| (and stand-off behind the sacrum) for 1.0 m line clearance at 55 deg
_, h = body(0.4)
for f in (-0.17, -0.3, -0.45, -0.6, -0.8):
    for u in (-0.12, -0.3):
        a = exitpt(0.4, f, u); print('exit f', f, 'u', u, '|d|', round(math.hypot(h[0]-a[0], h[1]-a[1]), 3), 'clr@55', round(clr(h, a, 55), 3), 'clr@45', round(clr(h, a, 45), 3))
# dynamic pressure range vs sled force range
rho = 1.0
for va in (4, 5.5, 13, 22):
    print('Va', va, 'q Pa', round(0.5*rho*va*va, 1))
print('q ratio 22 vs 4 m/s:', round((22/4)**2, 1), '; vs 5.5 m/s gate:', round((22/5.5)**2, 1))
# KE
for m in (0.0674, 0.062, 0.060, 0.0709):
    print('mass g', m*1000, 'KE @21 m/s', round(0.5*m*21**2, 2), 'cap speed', round(math.sqrt(2*14.9/m), 2))
# camera on the line (KAP style): sail+tail vs pod as separate bodies (design.js kiteBudget at areaScale 0.667 with tail)
sail = (0.30*31*1.25*0.667 + (2*1.0+1.2+0.8)*math.sqrt(0.667) + 0.6 + 1.0 + 3)*1.15
pod = (27+3+4+4+5)*1.15
print('sail+tail g', round(sail, 1), 'pod g', round(pod, 1), 'sum', round(sail+pod, 1))
v = math.sqrt(2*15.358/0.0674)
print('worst-case kite ground speed m/s', round(v, 2), 'sail-only KE', round(0.5*sail/1000*v*v, 2), 'pod KE if at kite speed', round(0.5*pod/1000*v*v, 2))
