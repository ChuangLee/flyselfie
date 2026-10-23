"""First-principles viewpoint illustration; not a product or camera validation.
Run from repository root. Figure and calculations are written alongside this file.
"""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

OUT = Path(__file__).resolve().parent
H = 1.75
def angular_extent(r, z):
    return np.degrees(np.arctan2(z, r) - np.arctan2(z-H, r))

points=[dict(horizontal_offset_m=r,camera_height_m=z,
             upright_body_angle_deg=round(float(angular_extent(r,z)),3))
        for z in [2.5,3.5,5] for r in [0,.8,2.5,5,10]]
result={'evidence':'analytic illustration with assumed geometry',
 'assumptions':{'body_height_m':H,'ground':'level','subject':'upright zero-width vertical segment','camera_height_above_head':True},
 'formula':'angle=atan2(z,r)-atan2(z-H,r)',
 'max_angle_offset_at_z_3_5_m':round(float(np.sqrt(3.5*(3.5-H))),3),
 'points':points,
 'equirectangular_example':{'assumed_panorama_width_px':7680,'azimuth_sector_deg':90,'source_columns_in_sector':1920,
   'limit':'angular sample budget only; rectilinear projection, sensor detail, compression and stitching differ'},
 'duty_cycle_example':{'assumed_flight_power_W':60,'flight_seconds':30,'ideal_flight_energy_Wh':.5,
   'limit':'not a motor specification; excludes launch, reserve, transit, losses and dock energy'}}
(OUT/'geometry-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10})
fig,axes=plt.subplots(1,2,figsize=(10.5,4.2),layout='constrained')
ax=axes[0]
r=np.linspace(.001,10,600)
for z,col in [(2.5,'#185c86'),(3.5,'#b45309'),(5,'#43816c')]:
 ax.plot(r,angular_extent(r,z),color=col,label=f'Camera height {z:g} m')
ax.scatter([0],[0],color='#a32929',s=25,zorder=3)
ax.annotate('Directly overhead: body axis\ncollapses to a point in this model',xy=(0,0),xytext=(2.8,5.5),fontsize=8,arrowprops={'arrowstyle':'->','color':'#777'})
ax.set(xlabel='Horizontal camera offset (m)',ylabel='Upright body angular extent (degrees)',title='Higher is not automatically more informative')
ax.grid(alpha=.18);ax.legend(frameon=False,fontsize=8)
ax=axes[1]
ax.plot([0,0],[0,H],color='#1c4566',lw=8,solid_capstyle='round')
ax.plot([-1,6],[0,0],color='#999')
for r,z,col in [(.8,3.5,'#b45309'),(2.5,3.5,'#43816c'),(5,3.5,'#185c86')]:
 ax.scatter([r],[z],marker='s',color=col,s=45)
 ax.plot([0,r],[0,z],color=col,lw=1,alpha=.7)
 ax.plot([0,r],[H,z],color=col,lw=1,alpha=.7)
 ax.text(r,z+.2,f'{float(angular_extent(r,z)):.1f} deg',ha='center',color=col,fontsize=9)
ax.set(xlabel='Horizontal offset (m)',ylabel='Height (m)',title='Example: 1.75 m person, 3.5 m camera',xlim=(-.5,5.8),ylim=(-.2,4.2))
ax.set_aspect('equal');ax.grid(alpha=.18)
fig.suptitle('Viewpoint geometry - illustrative assumptions, not a picture-quality score',fontsize=12)
fig.savefig(OUT/'viewpoint-geometry.svg')
fig.savefig(OUT/'viewpoint-geometry.png',dpi=150)
