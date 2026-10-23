// activetether design basis (SIM-032 phase 2): flyer variants, line, reel/motor, sensors, worn mass,
// pack volume and power. Every number is either taken from the phase-1 reports (engineering/report.json,
// science_aero/report.json, science_control/report.json, product/report.json in
// research/active_tether_2026_10_20/), from the shared component table (common/components.js) or marked
// ASSUMED. Evidence level: catalogue numbers + hand calculations; nothing was built or measured.
import { budget, BATTERY, MASS_MARGIN, packWh } from '../common/components.js';

export const G = 9.81;
export const RHO = 1.0; // components.js ATMOS (2000–2500 m, −10 °C)

// ------------------------------------------------------------------ flyers
// Structure grams follow the engineering umbrella-delta mass budget (engineering/report.json flyer.massBudget_g);
// the low-wing-loading kite scales the sail/spar/strut items to 0.30 m² with a mid-spar fold (ASSUMED).
const STRUCT = {
  delta: { sail: 3.3, LEspars: 9.8, keel: 4.0, struts: 6, towPoint: 2, noseProbe: 5 },             // 30.1 g (engineering)
  kite: { sail: 10.5, LEspars: 17.2, keel: 4.4, struts: 10, towPoint: 3, noseProbe: 5 },            // 50.1 g (scaled, ASSUMED)
};
const FLYER_ITEMS = [['avionics'], [{ g: 4.5, W: 0.15 }, 2], [{ g: 2, W: 0.05 }], [{ g: 11, W: 0 }], ['wiring']]; // FC/IMU/GNSS/UWB/radio, 2 flight servos (engineering 2×4.5 g), pitot+vane, 1S 450 mAh cell, wiring
const CAM_ITEMS = [['cam4kNoGimbal'], ['servo', 2], [{ g: 2, W: 0 }]];                                  // 4K gyro-EIS camera, pan+tilt pointing servos, bracket

export function flyerBudget(type, camOnFlyer) {
  const st = Object.values(STRUCT[type]).reduce((a, b) => a + b, 0);
  const b = budget([...FLYER_ITEMS, ...(camOnFlyer ? CAM_ITEMS : [])], st);
  return { g: b.g, gWithMargin: b.gWithMargin, kg: b.gWithMargin / 1000, W: b.W, structureG: st };
}

// line-camera pod ("traveller"): rides the line, grips it with a servo clamp when 5–6 m of line are out above it,
// 2-servo pointing mount + gyro-EIS, own 1S 300 mAh cell, UWB tag; ASSUMED masses on the shared table
export function podBudget() {
  const b = budget([['cam4kNoGimbal'], ['servo', 2], ['avionics'], [{ g: 7, W: 0 }], [{ g: 2.5, W: 0.05 }], ['wiring']], 8);
  return { g: b.g, gWithMargin: b.gWithMargin, kg: b.gWithMargin / 1000, W: b.W, CdA: 0.0024 };
}

// aerodynamic basis (ASSUMED polars, see engineering handoff "please replace the ASSUMED delta polar")
export const FLYERS = {
  delta: {
    id: 'delta', zh: '折叠伞骨三角翼（0.094 m²）', en: 'folding umbrella delta (0.094 m²)',
    S: 0.094, span: 0.75, AR: 6.0, CD0: 0.075, kInd: 0.095, CLa: 4.0, CLmax: 1.0, CDbrake: 0.7, brakeCL: 0.15,
    aFreeDeg: 6, aB0Deg: -45, aBminDeg: -85, aBmaxDeg: 15, aSlackRefDeg: -30, phiMaxDeg: 40,
    pitch: { wn: 12, zeta: 0.5 }, roll: { wn: 20, zeta: 0.7 }, chord: 0.25,
    src: 'engineering/report.json flyer.options.umbrellaDelta (S 0.094, LE 0.45, span 0.75, CD0 0.075, k 0.095, CLmax 1.0 — ASSUMED polar); airbrake ΔCD 0–0.7 (science_aero H9); pitch/roll mode frequencies ASSUMED',
  },
  kite: {
    id: 'kite', zh: '低翼载折叠三角风筝（0.30 m²）', en: 'low-wing-loading folding delta-kite (0.30 m²)',
    S: 0.30, span: 1.10, AR: 4.0, CD0: 0.09, kInd: 0.114, CLa: 3.5, CLmax: 1.0, CDbrake: 0.6, brakeCL: 0.15,
    aFreeDeg: 6, aB0Deg: -45, aBminDeg: -85, aBmaxDeg: 15, aSlackRefDeg: -30, phiMaxDeg: 35,
    pitch: { wn: 8, zeta: 0.5 }, roll: { wn: 12, zeta: 0.7 }, chord: 0.45,
    src: 'science_aero basis K120 (AR 4, CD0 0.09, e 0.7, CLmax 1.0) at 0.30 m²; science_control flyers.kite (low wing loading); depower ΔCD 0.6 and mode frequencies ASSUMED',
  },
};

// lift/drag vs angle of attack: linear polar to stall, then a blend to flat-plate coefficients
// (CL = sin 2α, CD = 1.9 sin²α, Hoerner-class flat plate); same form as science_control lib/tether.mjs aeroCoef
export function aeroCoef(F, alpha, brake = 0) {
  const CLmax = F.CLmax * (1 - F.brakeCL * brake), aS = CLmax / F.CLa, aN = -0.5 / F.CLa;
  const cdB = brake * F.CDbrake;
  if (alpha <= aS && alpha >= aN) { const CL = F.CLa * alpha; return [CL, F.CD0 + CL * CL * F.kInd + cdB]; }
  const edge = alpha > aS ? aS : aN, cE = F.CLa * edge, cdE = F.CD0 + cE * cE * F.kInd, w = 1 - Math.exp(-Math.abs(alpha - edge) / 0.08);
  return [cE * (1 - w) + Math.sin(2 * alpha) * w, cdE * (1 - w) + Math.max(cdE, 1.9 * Math.sin(alpha) ** 2) * w + cdB];
}
export const vStall = (F, m) => Math.sqrt((2 * m * G) / (RHO * F.S * F.CLmax));
export function ldMax(F) { return 1 / (2 * Math.sqrt(F.CD0 * F.kInd)); }

// ------------------------------------------------------------------ line, fairlead, weak link
export const LINE = {
  d: 0.00036, lambda: 0.000112, EA: 3308, Cd: 1.1, zeta: 0.3, Ldrum: 25,
  kShock: 150, strokeShock: 0.12, weakLinkN: 38, clutchN: 35,
  src: 'engineering line: 8-carrier UHMWPE 0.36 mm (PowerPro 50 lb class), EA 3308 N, 2.8 g / 25 m; fairlead shock spring 150 N/m (science_control H5) with a 0.12 m stroke (ASSUMED; bottoms at 18 N); slip clutch 35 N (engineering); weak link 38 N at the quiver exit (ASSUMED, below the 40 N body-force rule)',
};

// ------------------------------------------------------------------ reel (engineering report: MN3110 700 Kv, 2:1 GT2, yo-yo drum)
export const REEL = {
  kv: 700, Kt: 60 / (2 * Math.PI * 700), R: 0.092, Imax: 22, gear: 2,
  V0: 13.2, Rbatt: 0.144, Vclamp: 14.0, modIdx: 0.95, drvEff: 0.92,
  rHub: 0.015, kWind: 10.13e-6, Jdrum: 1.2e-5, Jmotor: 2.5e-5, b: 3e-5, coul: 0.004,
  massG: 85,
  src: 'engineering reel: T-Motor MN3110-17 700 Kv (92 mΩ, 21 A/180 s), 2:1 belt, 4 mm yo-yo drum r 15→21.9 mm for 25 m; 4S1P Molicel P28A cold bus 13.2 V − 0.144 Ω·I (fit to engineering operating points); regen clamped at 14.0 V by the 10 W shunt (cold cells not charged); rotor inertia 2.5e-5 kg·m² ASSUMED (reflected 0.21–0.46 kg, engineering)',
};
export const drumR = (Lwound) => Math.sqrt(REEL.rHub ** 2 + REEL.kWind * Math.max(0, Lwound));

// ------------------------------------------------------------------ sensors (science_control lib/sensors.mjs, datasheet + ASSUMED integration)
export const SENS = {
  tension: { sigma: 0.15, scale: 0.05, bias: 0.1, lat: 0.0225, src: 'flexure + ADS1220 metering head (engineering); σ/scale/bias/latency per science_control loadCell model (ASSUMED)' },
  lineAngle: { sigmaDeg: 0.15, biasDeg: 0.7, tau: 0.03, src: '2× AS5600 gimballed exit eyelet (engineering + science_control)' },
  ahrs: { tiltDeg: 1.5, yawDeg: 4, src: 'pack AHRS after GNSS aiding while carving (science_control imu.integration, ASSUMED)' },
  length: { scale: 0.01, src: 'idler metering wheel + AS5600 (engineering; independent of yo-yo radius) — ±1 % ASSUMED' },
  gnss: { rate: 10, sigmaV: 0.12, sigmaVz: 0.25, lat: 0.1, src: 'u-blox MAX-M10S on the back (science_control gnss model)' },
  pitot: { sigma: 0.4, rate: 50, src: 'SDP3x-class pitot (science_control airdata, ASSUMED σ incl. installation)' },
  vane: { sigmaDeg: 1.5 },
  flyerAtt: { errDeg: 3 },
  radio: { lat: 0.02, src: 'ELRS-class 2.4 GHz link, 20 ms end-to-end (science_control radio)' },
  uwb: { sigma: 0.1, rate: 20, lat: 0.03, src: 'UWB two-way ranging tag on the flyer/pod, ±0.1 m (ASSUMED class value)' },
  vision: { sigmaDeg: 0.3, rate: 30, lat: 0.06, dropout: 0.1, src: 'subject detector bearing on the camera (science_control camera model, ASSUMED)' },
  servo: { tau: 0.06, rateDegS: 400, src: 'micro digital servo, 0.10 s/60° at −10 °C (science_control servo, ASSUMED)' },
  camAtt: { driftDeg: 0.8, eisFrac: 0.02, syncS: 0.0016, src: 'gyro-EIS residual on the towglider attitude.js EIS basis: effective timing error 1.6 ms (1 ms sync + rolling-shutter residual 0.1 × 25 ms / 2) × body rate, 2 % gyro scale error on the high-frequency rotation angle, 0.8° attitude drift (OU 5 s) corrected by vision (ASSUMED)' },
};

// ------------------------------------------------------------------ cameras
export const CAMERA = { sensor: [3840, 2880], hfovDeg: 50, out: [1920, 1080], mountTau: 0.08, mountRateDegS: 300, mountDeadDeg: 0.3,
  src: '4K 4:3 gyro-EIS module (components.js cam4kNoGimbal) with a 50° M12 lens (towglider round 4 class, ASSUMED; 66° in science_aero gives bodyPx <300 at 8–9 m); output = 1080p reframed crop limited by native resolution' };
// sensors: 4K 4:3 (3840×2880, components.js cam4kNoGimbal) or a 48 MP 4:3 module (8000×6000, IMX586 class; towglider CAMS fix48
// 'ASSUMED part'; same mass, +0.5 W, slower rolling-shutter readout) — the 1080p crop is native-resolution limited
export const SENSORS = { k4: [3840, 2880], mp48: [8000, 6000] };
export function optics(hfovDeg = CAMERA.hfovDeg, sensor = CAMERA.sensor) {
  const [w, h] = sensor, th = Math.tan((hfovDeg * Math.PI) / 360), tv = th * (h / w);
  const vfNative = (2 * Math.atan(tv) * 180) / Math.PI;
  const vfMin = (2 * Math.atan(tv * (CAMERA.out[1] / h)) * 180) / Math.PI; // 1:1 crop of 1080 native rows
  return { th, tv, vfNative, vfMin, halfH: Math.atan(th), halfV: Math.atan(tv) };
}

// ------------------------------------------------------------------ worn unit (engineering BOM, adjusted)
// grams before margin; quiver tube scales with diameter × length for the kite variant
export function wornBudget(type, camOnFlyer) {
  const kiteQ = type === 'kite';
  const back = {
    reelMotor: 85, beltClutchRatchet: 35, drum: 12, focDriver: 14.2, meteringHead: 15, lineAngleGimbalTrumpet: 18,
    mcuImuGnssRadio: 12, battery: 215, shuntHeaterInsulation: 18, cutterWeakLink: 8, line: 2.8,
    quiverTube: kiteQ ? 101.6 : 76, hingeFoldDrive: 32, enclosureBelt: 150, podDockSleeve: camOnFlyer ? 0 : 10,
  };
  const backG = Object.values(back).reduce((a, b) => a + b, 0);
  const fl = flyerBudget(type, camOnFlyer), pod = camOnFlyer ? null : podBudget();
  const kg = (backG * (1 + MASS_MARGIN) + fl.gWithMargin + (pod ? pod.gWithMargin : 0)) / 1000;
  return { back, backG, backWithMarginG: backG * (1 + MASS_MARGIN), flyerG: fl.gWithMargin, podG: pod ? pod.gWithMargin : 0, kg,
    batteryWh: packWh(back.battery), flyerCellWh: 11 / 1000 * BATTERY.whPerKgPack, podCellWh: pod ? 7 / 1000 * BATTERY.whPerKgPack : 0 };
}

// packed volume (L): quiver tube + back unit + trumpet (engineering BOM_totals.volumeSplitL), scaled for the kite's
// Ø64 × 0.55 m quiver (mid-spar fold, ASSUMED) and +0.08 m of quiver length for the line-camera pod
export function packVolume(type, camOnFlyer) {
  const D = type === 'kite' ? 0.064 : 0.056, Lq = (type === 'kite' ? 0.55 : 0.47) + (camOnFlyer ? 0 : 0.08);
  const quiver = (Math.PI / 4) * D * D * Lq * 1000;
  return { quiver, back: 1.04, trumpet: 0.08, total: quiver + 1.04 + 0.08 };
}

// mean electrical loads (W) that are not simulated: back MCU/IMU/GNSS 0.6, quiver drive 0.05 (engineering battery.loadsW)
export const BACK_STATIC_W = 0.65;
