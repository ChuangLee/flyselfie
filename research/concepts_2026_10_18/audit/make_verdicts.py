import json, datetime
import os; A=os.path.dirname(os.path.abspath(__file__))+'/'
V = {
 'boom360': {
  'overallOriginal':'fail (jitterRms, jitterBoom, rollInertiaPct, persp; plus snag/fast/lift faults)',
  'overallHarmonised':'FAIL — robust (footage stability)',
  'metrics': {
   'avail':      ['100 % pass (≥70)', '100 % pass', 'robust; envelope: lift 77 % (false fold), snag 43 % (fault)'],
   'pxMed':      ['432 px pass', '432 px pass', 'robust'],
   'jitterRms':  ['5.97 °/s fail (≤5)', '6.7 °/s fail (≤3)', 'robust: fails under every definition tried (raw 6.0, in-crop HP 5.8, LOS HP 6.5, boom-only 4.0); short 18.8, moguls 34'],
   'azRange':    ['41° informational', '≈0° deliberate (non-gating) fail', 'robust: body-locked rear view'],
   'addedMass':  ['1.16 kg pass (≤2.0)', '1.16 kg pass', 'robust'],
   'bodyForcePeak': ['18.6 N pass (≤150)', '6.1 N pass; snag 101 N FAIL', 'nominal robust; snag fail robust in sign, magnitude set by ASSUMED branch slip load'],
   'handsBusy':  ['0 % pass', '0 % pass', 'robust'],
   'setupTime':  ['6.35 s pass', '6.35 s pass', 'robust'],
   'ops':        ['1 pass', '1 pass', 'robust'],
   'keMax':      ['50 J pass (fast 102 J fail)', '0.3 J pass (falls ≤5.9 J)', 'FLIPS in fast scenario; fragile to definition (camera-only ground frame 18 J would fail)'],
   'endurance':  ['75 min pass (ASSUMED)', '75 min pass', 'fragile only in that it is hard-coded'],
   'rollInertiaPct (extra)': ['26 % fail', '3.9 % pass', 'FLIPS: wrong reference inertia'],
  }},
 'trackdrone': {
  'overallOriginal':'fail (keMax, jitterRms, azRange, vlos, regGate, podSustain; highspeed/crosswind/dropout availability)',
  'overallHarmonised':'FAIL — robust (keMax, endurance, follow envelope)',
  'metrics': {
   'avail':      ['100 % pass', '100 % pass', 'nominal robust; envelope fails robustly: highspeed 3.6 %, crosswind 47.6 %, dropout 60 %'],
   'pxMed':      ['474 px pass', '474 px pass', 'robust (highspeed 29 px)'],
   'jitterRms':  ['5.42 °/s fail (≤5)', '4.4 °/s fail as modelled / 1.8 °/s pass with rate-consistent residual', 'FRAGILE: hinges on the residual-gimbal model; short turns fail either way (7.5–9.6)'],
   'azRange':    ['22° fail (gating)', 'non-gating; side mode exists but not exercised', 'fragile (scenario choice)'],
   'addedMass':  ['0.40 kg pass', '0.40 kg (≈0.8–0.9 kg with the power bank) pass', 'robust'],
   'bodyForcePeak': ['0.9 N pass', '≈1 N pass', 'robust'],
   'handsBusy':  ['0 % pass', '0 % pass', 'robust'],
   'setupTime':  ['12.7 s pass (≤25)', 'p90 over 0–9 m/s wind incl. manual pick-up ≈35–40 s (estimate) fail', 'fragile (wind climate, retrieval time)'],
   'ops':        ['1 pass', '1 (2 on dock failure) pass', 'robust'],
   'keMax':      ['24.4 J fail', '24.4 J fail', 'robust at 14.9 J (needs ≤150 g); passes the 80 J kill line; Cat 1 / C0 regulatory route exists'],
   'endurance':  ['6.3 min pass (≥4 per run)', '4.5–6.3 min per battery fail (≥45 min/day)', 'FLIPS pass→fail; robust under the day definition (7–10 batteries needed)'],
  }},
 'tetherdrone': {
  'overallOriginal':'fail (keMax, tetherCross, p24max; snag/power/dock faults)',
  'overallHarmonised':'FAIL — fragile (keMax threshold/route and tether artefact)',
  'metrics': {
   'avail':      ['100 % pass', '100 % geometric; ≈0 % if a ≥1 px tether across the subject counts', 'FRAGILE: flips with tether inpainting credit'],
   'pxMed':      ['555 px pass', '555 px pass', 'robust'],
   'jitterRms':  ['0.69 °/s pass', '0.79 °/s pass (short 0.9, power fault 2.2)', 'robust'],
   'azRange':    ['63° informational', 'side station demonstrated (non-gating) pass', 'robust'],
   'addedMass':  ['1.2 kg pass (<1.5)', '1.2 kg pass', 'fragile margin (0.3 kg; ASSUMED breakdown)'],
   'bodyForcePeak': ['1.8 N pass (≤15)', '1.8 N pass (snag 5.8 N)', 'robust'],
   'handsBusy':  ['3.3 % pass', '0 % pass', 'robust'],
   'setupTime':  ['14.2 s pass (≤60)', '14.2 s pass (≤30)', 'moderately robust; only tested at 3 m/s gusty'],
   'ops':        ['2 pass (≤3)', '2 pass (≤2)', 'robust'],
   'keMax':      ['19.7 J fail', '19.7 J fail (fast 38 J)', 'robust at 14.9 J (200 g passes only below 12.2 m/s); passes the 80 J kill line; Cat 1 / C0 route exists'],
   'endurance':  ['142 min pass', '142 min pass', 'robust'],
   'electricalSafety (extra)': ['not assessed', '100 V > 60 V ES1: needs reinforced insulation + GFCI', 'design gate'],
  }},
 'robust': ['S1 fails footage stability (body-locked camera; torso-rotation parallax + boom flex) in every moving scenario', 'S2 cannot film a ski day on ≤249 g of battery and cannot follow 18 m/s + headwind or strong crosswind', 'S2 and S3 exceed 14.9 J at rider speed (mass > 150–200 g)', 'S3 passes stability, force, endurance and convenience comfortably'],
 'fragile': ['S1 keMax (reference frame)', 'S1 roll inertia (reference error)', 'S2 nominal jitter (residual model)', 'S2 setupTime (dock in wind)', 'S2 endurance (per-run vs per-day definition)', 'S3 avail (tether artefact / inpainting)', 'S2/S3 keMax (14.9 J vs 80 J vs Cat 1 ≤250 g route)'],
 'ranking': 'S3 > S2 > S1 on footage; S3 is the only concept whose remaining failures are addressable by threshold/route choice and post-processing rather than physics.',
}
json.dump({'generated':str(datetime.date.today()),'evidence':'harmonised re-statement on numerical-uncalibrated simulations; not a physical test','columns':['original (nominal)','harmonised (nominal)','robustness'],'verdicts':V}, open(A+'verdicts.json','w'), ensure_ascii=False, indent=1)
print('ok')
