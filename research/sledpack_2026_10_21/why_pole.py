# Why the kite demos carry a pole, and what a pole-free back unit can reach.
# Point-to-line geometry, sagittal plane (x back +, z up), crouched skier.
# Body dimensions ASSUMED (1.75 m rider, ski crouch); helmet = head centre.
import math
helmet = (-0.08, 1.52)      # crouched head centre, slightly forward of the back plane
exits = {
  'shoulder top of pack': (0.18, 1.35),
  'lumbar sleeve mouth (pole-free)': (0.20, 0.88),
  'hip belt side':  (0.10, 0.92),
  'AT-1 quiver tip 0.55 m': (0.62, 0.62),
  'demo boom tip 0.72 m raised 62 deg': (0.18+0.72*math.cos(math.radians(62)), 1.35+0.72*math.sin(math.radians(62))),
}
def dist_to_ray(p, a, el):
    d = (math.cos(el), math.sin(el)); v = (p[0]-a[0], p[1]-a[1])
    t = max(0, v[0]*d[0]+v[1]*d[1]); q = (a[0]+t*d[0], a[1]+t*d[1])
    return math.hypot(p[0]-q[0], p[1]-q[1])
print('exit, |exit-helmet| m, line clearance at elevation 30/45/55/65 deg')
for k, a in exits.items():
    r = math.hypot(helmet[0]-a[0], helmet[1]-a[1])
    cl = [dist_to_ray(helmet, a, math.radians(e)) for e in (30, 45, 55, 65)]
    print(f'{k:38s} {r:5.2f}  ' + ' '.join(f'{c:4.2f}' for c in cl))
print('Upper bound: line clearance <= |exit-helmet|; >=1.0 m needs an exit >=1.0 m from the head -> pole/boom/quiver.')
# Sled kite sizing (soft, two longitudinal spars). ASSUMED coefficients (sled CLmax ~1.0, L/D ~1.6-2 powered).
rho, g = 1.0, 9.81
for S, m in ((0.25, 0.055), (0.30, 0.060), (0.40, 0.065)):
    vmin = math.sqrt(2*m*g/(rho*S*1.0))
    for Va in (4, 13, 22):
        Tpow = 0.5*rho*Va**2*S*math.hypot(0.9, 0.5)
        Tdep = 0.5*rho*Va**2*S*math.hypot(0.12, 0.18)
        print(f'S={S} m={m*1000:.0f} g vmin={vmin:.1f} m/s Va={Va:2d}: T powered {Tpow:5.1f} N, depowered {Tdep:5.1f} N')
for m in (0.055, 0.06, 0.07, 0.116):
    print(f'flyer {m*1000:.0f} g: KE at 13 m/s {0.5*m*169:.1f} J, speed cap for 14.9 J {math.sqrt(2*14.9/m):.1f} m/s')
