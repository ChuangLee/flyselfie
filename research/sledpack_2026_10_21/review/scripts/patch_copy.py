# Applies the review switches (REV_JSON env) to a COPY of sim/js/concepts/sledpack. Never run on the repo's sim/.
# Usage: python3 patch_copy.py /path/to/copy/sim/js/concepts/sledpack
import sys, os
D = sys.argv[1]; assert 'flySelfie/sim' not in os.path.abspath(D), 'refusing to patch the repo sim/'
R = "const REV = (()=>{try{return JSON.parse(process.env.REV_JSON||'{}')}catch{return {}}})();\n"
p = lambda f: os.path.join(D, f)
d = open(p('design.js')).read()
d = d.replace("const POD_ITEMS = [['cam4kNoGimbal'],", R + "const POD_ITEMS = [[{ g: REV.camG ?? 0, W: REV.camW ?? 0 }], ['cam4kNoGimbal'],")
d = d.replace("export const GEOM = { exitF: -0.17, exitU: -0.12,", "export const GEOM = { exitF: REV.exitF ?? -0.17, exitU: REV.exitU ?? -0.12,")
open(p('design.js'), 'w').write(d)
m = open(p('model.js')).read()
m = m.replace("import { makeWind }", R + "import { makeWind }", 1)
m = m.replace("const gWind = vAppM >= p.vGate,", "const tailE = (() => { const vv = Math.hypot(vR[0], vR[1]) || 1; return (we[0]*vR[0]+we[1]*vR[1])/vv; })(); const gWind = vAppM >= p.vGate && !(REV.tailMax != null && tailE > REV.tailMax),")
m = m.replace("if (vAppM < p.vGateOff) lowT += p.ctrlDt; else lowT = 0;", "{ const vv = Math.hypot(vR[0], vR[1]) || 1, tailE = (we[0]*vR[0]+we[1]*vR[1])/vv; if (vAppM < p.vGateOff || (REV.tailMax != null && tailE > REV.tailMax + 0.5)) lowT += p.ctrlDt; else lowT = 0; }")
open(p('model.js'), 'w').write(m)
a = open(p('analysis.js')).read()
a = a.replace("import { footage", R + "import { footage", 1)
a = a.replace("drift[k] += (driftR[k] - drift[k]) * (1 - Math.exp(-2 * Math.PI * 0.2 * SDT)); }", "drift[k] = REV.rawDrift ? driftR[k] : drift[k] + (driftR[k] - drift[k]) * (1 - Math.exp(-2 * Math.PI * 0.2 * SDT)); }")
a = a.replace("out.fit[i] = marginV >= 0 && marginH >= 0 ? 1 : 0;", """let offV = 0, offH = 0; { const bxv = X, buv = U, brv = unit(crs(bxv, buv)), z = dot(fwd, bxv); offH = Math.abs(Math.atan2(dot(fwd, brv), z)); offV = Math.abs(Math.atan2(dot(fwd, buv), z)); }
    out.offAxis[i] = Math.hypot(offH, offV) / D2R;
    out.fit[i] = REV.fitCheck ? (ox.halfV - halfV - offV >= 0 && ox.halfH - halfH - offH >= 0 ? 1 : 0) : (marginV >= 0 && marginH >= 0 ? 1 : 0);""")
a = a.replace("    out.offAxis[i] = offAx / D2R;\n", "")
a = a.replace("""    const SPt = sailPts(O, i, p);
    let dF = Math.min(...Object.values(SPt).map((q) => len(sub(q, H))));
    dF = Math.min(dF, segPointDist(H, SPt.tipL, SPt.tipR), segPointDist(H, SPt.nose, SPt.tail), segPointDist(H, SPt.apex, SPt.centre));""", """    const SPt = sailPts(O, i, p);
    let dF;
    if (REV.bundle && O.collapsed[i] === 1) { const c = [O.bux[i], O.buy[i], O.buz[i]]; dF = segPointDist(H, SPt.apex, add(SPt.apex, mul(c, 0.46))); }
    else { dF = Math.min(...Object.values(SPt).map((q) => len(sub(q, H)))); dF = Math.min(dF, segPointDist(H, SPt.tipL, SPt.tipR), segPointDist(H, SPt.nose, SPt.tail), segPointDist(H, SPt.apex, SPt.centre)); }""")
open(p('analysis.js'), 'w').write(a)
print('patched', D)
