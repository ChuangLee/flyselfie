// Review diagnostics, not product validation. Run from repository root:
// node research/review_2026_10_14/reproduce.mjs > research/review_2026_10_14/results.json
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defaultInputs, MODEL_CONSTANTS as K } from '../../sim/js/model/config.js';
import { SCENARIOS, scenarioById } from '../../sim/js/model/scenarios.js';
import { simulate, inputHash, resultToJSON, resultFromJSON } from '../../sim/js/model/solver.js';

const P = defaultInputs();
const rounded = x => Number.isFinite(x) ? +x.toFixed(6) : null;
const summary = r => ({scenario:r.scenario, validUntil:r.validUntil, scopeEnd:r.scopeEnd,
  invalid:r.events.filter(e=>e.severity==='invalid').map(e=>({t:e.t,type:e.type})),
  peakTValid:rounded(Math.max(0,...Array.from(r.columns.T).filter((x,i)=>r.columns.valid[i]===1 && Number.isFinite(x))))});
const out = {evidence:'Uncalibrated model diagnostics and analytic estimates; no physical testing',
  sourceSha256:Object.fromEntries(['sim/js/model/solver.js','sim/js/model/config.js','sim/js/model/scenarios.js','sim/js/app.js','sim/tests/browser_check.py'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),
  defaults:P};
const runs = SCENARIOS.filter(s=>s.evidence==='numerical').map(s=>simulate(s,P));
out.defaultScenarios = runs.map(summary);
out.rollSensitivity = [0,0.25,0.5,0.7,1].map(b=>({beta:b,...summary(simulate(scenarioById('film_turns'),{...P,rollStability:b}))}));

const r = runs.find(r=>r.scenario==='film_turns');
const speeds=[];
for(let i=1;i<r.n;i++) {
  const dt=r.columns.t[i]-r.columns.t[i-1];
  speeds.push(Math.hypot(...['sx','sy','sz'].map(k=>(r.columns[k][i]-r.columns[k][i-1])/dt)));
}
out.speedDefinition = {displayed:P.skierSpeed,actualMin:rounded(Math.min(...speeds)),actualMax:rounded(Math.max(...speeds)),
  legalExtremeMax:rounded(Math.hypot(8,8*2*Math.PI/2,8*Math.tan(15*Math.PI/180))),
  legalExtremeLateralAcceleration:rounded(8*(2*Math.PI/2)**2)};

const alteredSc = {...scenarioById('film_turns'),speed:[[0,0.5]]};
const alteredRun=simulate(alteredSc,P);
out.hashCollision = {sameIdDifferentSchedule: inputHash(alteredSc,P)===inputHash(scenarioById('film_turns'),P),
  originalSampleSkierSpeed:r.columns.skierSpeed[0],changedSampleSkierSpeed:alteredRun.columns.skierSpeed[0]};
const h0=inputHash(scenarioById('film_turns'),P), oldK=K.tetherStiffness.v;
try {K.tetherStiffness.v=oldK/2;out.hashCollision.changedConstantSameHash=inputHash(scenarioById('film_turns'),P)===h0;} finally {K.tetherStiffness.v=oldK;}

const exported=resultToJSON(r);
function accepts(o) {try {resultFromJSON(o);return true;} catch {return false;}}
const unsigned=structuredClone(exported);delete unsigned.checksum;
const short=structuredClone(unsigned);short.columns.T=[1];
const foreign=structuredClone(unsigned);foreign.config.id='review-foreign-config';foreign.model.id='review-foreign-model';foreign.model.version='99.0';
const backwards=structuredClone(unsigned);backwards.columns.t.reverse();
out.importValidation={noChecksumAccepted:accepts(unsigned),shortColumnAccepted:accepts(short),foreignModelAccepted:accepts(foreign),nonMonotonicTimeAccepted:accepts(backwards)};

out.validDockBodyIntersections=[];
for (const id of ['retrieval_crosswind','retrieval_headwind','retrieval_calm']) {
  for (const anchorHeight of [0.8,1,1.2,1.35,1.6,1.8]) {
    const a=simulate(scenarioById(id),{...P,anchorHeight});const c=a.columns;
    for(let i=0;i<a.n;i++) {
      const d=Math.hypot(c.kx[i]-c.ax[i],c.ky[i]-c.ay[i],c.kz[i]-c.az[i]);
      const centreClearance=c.clearance[i]+0.5*Math.sqrt(2*P.wingArea);
      if(c.valid[i]===1 && d<K.dockZone.v && centreClearance<0) {
        out.validDockBodyIntersections.push({scenario:id,anchorHeight,t:rounded(c.t[i]),distanceToAnchor:rounded(d),centreClearance:rounded(centreClearance),validUntil:a.validUntil,scopeEnd:a.scopeEnd});break;
      }
    }
  }
}

// Level, horizontal apparent airflow, constant coefficients and mass, negligible tether drag.
const rho=1.1,CL=0.8,CD=0.18,m=0.3,g=9.81,area=0.25,theta=50*Math.PI/180;
out.analytic={assumptions:{rho,CL,CD,m,g,area,thetaDeg:50,anchorHeight:1.35,tether:2.5,cameraDrop:0.15},
  liftEqualsWeightSpeed:rounded(Math.sqrt(2*m*g/(rho*area*CL))),
  elevation50Speed:rounded(Math.sqrt(2*m*g/(rho*area*(CL-CD*Math.tan(theta))))),
  areaAtSpeedFor50:[4,5,6,8].map(V=>({V,area:rounded(2*m*g/(rho*V*V*(CL-CD*Math.tan(theta))))})),
  steadyAtSpeed:[6,8,11].map(V=>{const q=.5*rho*area*V*V,L=q*CL,D=q*CD,angle=Math.atan2(L-m*g,D);
    return {V,lift:rounded(L),drag:rounded(D),thetaDeg:rounded(angle*180/Math.PI),tension:rounded(Math.hypot(D,L-m*g)),cameraHeight:rounded(1.35+2.5*Math.sin(angle)-.15),horizontalBehindAnchor:rounded(2.5*Math.cos(angle))};}),
  massReduction:{from:0.3,to:0.18,thresholdSpeedRatio:rounded(Math.sqrt(.18/.3))},
  retrievalExample:{assumedTensionN:10,strokeM:2.15,efficiency:.6,outputWorkJ:21.5,inputWorkJ:rounded(21.5/.6),reelRadiusM:.02,crankRadiusM:.08,handleForceN:rounded(10*.02/(.08*.6)),rateMps:.5,crankRpm:rounded(.5/(2*Math.PI*.02)*60)},
  boomExample:{payloadKg:.18,reachM:2,gravityMomentNm:rounded(.18*g*2),assumedEI_Nm2:100,tipDeflectionM:rounded(.18*g*2**3/(3*100))},
  rotorIdealHover:{massKg:.3,totalDiskAreaM2:.05,powerW:rounded((.3*g)**1.5/Math.sqrt(2*rho*.05))},
  buoyancyIdeal:{payloadKg:.3,assumedAirDensity:1.1,assumedHeliumDensity:.15,minVolumeM3:rounded(.3/(1.1-.15)),sphereDiameterM:rounded(Math.cbrt(6*(.3/(1.1-.15))/Math.PI))}
};
console.log(JSON.stringify(out,null,2));
