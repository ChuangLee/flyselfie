// sledpack design basis (SIM-033, 2026-10-21): soft single-skin sled kite + camera pod, pole-free back unit with a
// spine sleeve dock (mouth at the sacrum), two-drum reel (main + depower line), dock-charged pod cell.
// Every number is from the shared component table (common/components.js), a cited catalogue/literature value, the
// SIM-032 engineering basis (research/active_tether_2026_10_20/engineering/report.json) or ASSUMED.
// Evidence level: catalogue numbers + hand calculations; nothing was built or measured.
import { budget, MASS_MARGIN, packWh, BATTERY } from '../common/components.js';

export const G = 9.81;
export const RHO = 1.0; // components.js ATMOS (2000–2500 m, −10 °C)

// ------------------------------------------------------------------ kite (sled)
// Sail: Icarex PC31-class ripstop polyester 31 g/m² (https://www.icarex.de / kite-fabric catalogues, 31 g/m²), 0.30 m²
// + 25 % hems/reinforcement; two Ø2.0 mm pultruded carbon rods 0.56 m (≈1.0 g each, ~1.8 g/m catalogue class);
// bridle (Dyneema 0.5 mm, 2 × 0.4 m) + depower bridle + rings. ASSUMED make-up; no prototype weighed.
export const SAIL_ITEMS = { sail: 0.30 * 31 * 1.25, spars: 2 * 1.0, bridle: 1.2, depowerBridle: 0.8, apexRing: 0.6, keelTabs: 1.0 };
// Pod at the bridle apex: 4K gyro-EIS camera (shared cam4kNoGimbal), 2.4 GHz/BLE SoC + IMU (nRF52840-class module
// ≈1.5 g + antenna, ASSUMED 3 g / 0.1 W), 1S 160 mAh cell (≈4 g, 0.6 Wh at the shared 150 Wh/kg), dock contacts +
// shell 4 g, shared wiring 5 g. No servos, no propulsion, no air data: the flyer is an unpowered kite (FAA §101 kite;
// research/active_tether_2026_10_20/product/report.json regulation).
// I9 (review RV-01): the 48 MP module the analysis uses is counted honestly — cam4kNoGimbal + 3 g + 0.5 W (activetether
// CAMERA basis; towglider fix48 class)
const POD_ITEMS = [[{ g: 30, W: 3.2 }], [{ g: 3, W: 0.1 }], [{ g: 4, W: 0 }], [{ g: 4, W: 0 }], ['wiring']];
export const POD_CELL_G = 4;

// Drogue tail (SIM-033 iteration 2): a 0.25 m Ø ripstop cone on a 1.2 m tail line behind the trailing edge, CdA
// ≈0.05 m² (cone drogue CD ≈1.0 on 0.049 m², Hoerner-class, ASSUMED). Adds drag without lift → lower flying angle (the
// camera needs ≲50–55° to keep bodyPx), damps yaw and keeps the sled pointed (classic kite practice). 3 g.
export const TAIL = { CdA: 0.05, g: 3, len: 1.2 };
// areaScale scales the sail (area, fabric, spar length) for the sizing study; pod unchanged
export function kiteBudget(areaScale = 1, tail = 1) {
  const k = Math.sqrt(areaScale);
  const sailG = SAIL_ITEMS.sail * areaScale + (SAIL_ITEMS.spars + SAIL_ITEMS.bridle + SAIL_ITEMS.depowerBridle) * k + SAIL_ITEMS.apexRing + SAIL_ITEMS.keelTabs + (tail ? TAIL.g : 0);
  const pod = budget(POD_ITEMS, 0);
  const g = sailG + pod.g;
  return { sailG, podG: pod.g, g, gWithMargin: g * (1 + MASS_MARGIN), kg: (g * (1 + MASS_MARGIN)) / 1000, W: pod.W };
}

// Sled aerodynamics (ASSUMED polar, disclosed):
// • low-aspect-ratio membrane, AR = b²/S = 0.72²/0.30 = 1.73; lift slope by Helmbold: 2πAR/(2+√(AR²+4)) = 2.34 /rad;
// • CLmax 1.0 at ≈25–30°: low-AR flat plates reach CLmax 1.0–1.2 at 25–40° at Re ≈ 1e5 (Torres & Mueller 2004, AIAA J
//   42(5) 865–873); a slack membrane with keels is taken at the low end;
// • CD0 0.12 (fluttering single skin, keels, bridles, pod — ASSUMED; flat-plate-like sleds fly at ≈45–60° line angle,
//   which needs L/D ≈1.5–2.5 after weight: Wikipedia "Sled kite"; KAP practice), induced k = 1/(π e AR), e 0.7;
// • post-stall: flat plate CL = sin2α, CD = 1.9 sin²α (Hoerner, as activetether design.js).
export const SLED = {
  S: 0.30, span: 0.72, chord: 0.56, AR: 0.72 ** 2 / 0.30, CLa: 2.34, CLmax: 1.0, CD0: 0.12, e: 0.7,
  bridle: 0.40,            // apex → sail centre distance
  podCdA: 0.0012,          // pod 45×35 mm frontal, Cd ≈0.8
  // bridle trim: α = 90° − φ + δb, φ = angle between the line (exit→kite) and the local airflow; δb full power −8°,
  // depower line (0…0.16 m of trailing-edge pull) lowers δb by up to 45° (ASSUMED linear map); in flight the pack
  // keeps the estimated AoA above a margin, the last 5 % of the stroke pulls the trailing edge to the apex so the sail flags (kill)
  deltaPowerDeg: -8, deltaDepowerDeg: 45, depowerStroke: 0.16,
  // collapse (membrane kites lose shape when the sail is unloaded or side-slipped): collapse after 0.15 s with α < 6°,
  // sideslip > 40° or sail pressure q < 1.2 Pa; re-inflate after 0.4 s with 10° < α < 85° (a sled face-on to the wind stays inflated), sideslip < 25°, q > 3 Pa.
  // Collapsed = drogue: CL 0, CD 0.35 on 0.6 S (ASSUMED; no sled collapse data found — kill test: wind tunnel /
  // tow tests in turbulence)
  colAlphaDeg: 6, colBetaDeg: 40, colQ: 1.2, colT: 0.15, infAlphaLoDeg: 10, infAlphaHiDeg: 85, infBetaDeg: 25, infQ: 3, infT: 0.4,
  colCD: 0.35, colSfrac: 0.6,
  yawTau: 0.25,            // keel weathervane lag of the kite heading toward the airflow (ASSUMED)
  src: 'Helmbold low-AR lift slope; Torres & Mueller 2004 (AIAA J 42(5)) low-AR plates CLmax 1.0–1.2; Hoerner flat plate; CD0, collapse and yaw lag ASSUMED',
};
export function aeroCoef(alpha, F = SLED, clmaxScale = 1, cd0Scale = 1) {
  const CLmax = F.CLmax * clmaxScale, CD0 = F.CD0 * cd0Scale, k = 1 / (Math.PI * F.e * F.AR);
  const aS = CLmax / F.CLa, aN = -0.3 / F.CLa;
  if (alpha <= aS && alpha >= aN) { const CL = F.CLa * alpha; return [CL, CD0 + k * CL * CL]; }
  const edge = alpha > aS ? aS : aN, cE = F.CLa * edge, cdE = CD0 + k * cE * cE, w = 1 - Math.exp(-Math.abs(alpha - edge) / 0.1);
  return [cE * (1 - w) + Math.sin(2 * alpha) * w, cdE * (1 - w) + Math.max(cdE, 1.9 * Math.sin(alpha) ** 2) * w];
}
export const vMin = (m, F = SLED, clmaxScale = 1) => Math.sqrt((2 * m * G) / (RHO * F.S * F.CLmax * clmaxScale));
export const ldMax = (F = SLED) => 1 / (2 * Math.sqrt(F.CD0 / (Math.PI * F.e * F.AR)));

// ------------------------------------------------------------------ lines, weak link
// main: 8-carrier UHMWPE 0.30 mm (30 lb class, ≈133 N break); EA scaled by area from the activetether 0.36 mm basis
// (3308 N) → 2300 N; depower: 0.20 mm (≈60 N break). Drag on both (side by side), weight of both.
export const LINE = {
  d: 0.0003, dDep: 0.0002, lambda: 0.000078 + 0.000035, EA: 2300, Cd: 1.1, zeta: 0.3, Ldrum: 25,
  kShock: 150, strokeShock: 0.10, weakLinkN: 38, clutchN: 35,
  src: 'UHMWPE braid catalogue class (PowerPro/Spiderwire 30 lb 0.30 mm); EA by area from activetether design.js; shock spring and slip clutch as activetether (ASSUMED); weak link 38 N at the sleeve mouth (below the 40 N body-force rule)',
};

// ------------------------------------------------------------------ reel (main drum) + depower drum
// 2S Li-ion pack (2 × 18650 3.5 Ah, 95 g), 2204-class outrunner 1400 Kv via 3:1 belt to a Ø30 mm drum; spring-applied
// brake holds length at zero power; slip clutch 35 N. Force limit at the current limit ≈30 N line; no-load line speed
// ≈5.5 m/s at the cold 2S bus (7.0 V × 1400 rpm/V / 3 × π × 0.030 m / 60 ≈ 5.1–5.5 m/s). Reflected mass 0.18 kg
// (ASSUMED). Electrical model: P = T·v_in / 0.65 + 1.5 W while the motor runs (driver/copper, ASSUMED).
// Depower drum: 9 g micro-servo-class gear motor on a second drum, stroke 0.16 m in 0.35 s (ASSUMED), 0.3 W mean.
export const REEL = {
  Fmax: 30, vNL: 5.3, mEff: 0.18, fric: 0.25, eff: 0.65, runW: 1.5, kv: 1400, gear: 3, rDrum: 0.015,
  depRate: 0.45, depW: 0.3, massG: 58,
  src: '2204-class outrunner + 3:1 belt + Ø30 mm drum (catalogue class), spring brake, slip clutch; numbers derived above, reflected mass and losses ASSUMED',
};

// ------------------------------------------------------------------ sensors (pack only + pod camera)
export const SENS = {
  tension: { sigma: 0.15, scale: 0.05, bias: 0.1, lat: 0.0225, src: 'flexure load cell at the sleeve mouth (activetether class)' },
  lineAngle: { sigmaDeg: 0.15, biasDeg: 0.7, src: '2-axis exit eyelet angle (activetether class)' },
  ahrs: { tiltDeg: 1.5, yawDeg: 4 },
  length: { scale: 0.01 },
  gnss: { sigmaV: 0.12, lat: 0.1 },
  vision: { sigmaDeg: 0.3, rate: 30, lat: 0.06, dropout: 0.1, src: 'subject detector bearing on the pod camera (activetether class, ASSUMED)' },
  camAtt: { driftDeg: 0.8, eisFrac: 0.02, syncS: 0.0016, src: 'gyro-EIS residual (activetether/towglider basis, ASSUMED)' },
};

// ------------------------------------------------------------------ camera (as activetether: 48 MP 4:3, 66° lens, 1080p reframed crop)
export const CAMERA = { out: [1920, 1080], hfovDeg: 66, sensor: [8000, 6000], podOffset: 0.12, src: '48 MP 4:3 gyro-EIS module (towglider fix48 class, ASSUMED part, same mass as cam4kNoGimbal +0.5 W), 66° lens' };
export function optics(hfovDeg = CAMERA.hfovDeg, sensor = CAMERA.sensor) {
  const [w, h] = sensor, th = Math.tan((hfovDeg * Math.PI) / 360), tv = th * (h / w);
  const vfNative = (2 * Math.atan(tv) * 180) / Math.PI;
  const vfMin = (2 * Math.atan(tv * (CAMERA.out[1] / h)) * 180) / Math.PI;
  return { th, tv, vfNative, vfMin, halfH: Math.atan(th), halfV: Math.atan(tv) };
}

// ------------------------------------------------------------------ geometry of the worn unit (body frame of bodyPoints)
// sleeve mouth at the sacrum: 0.17 m behind and 0.12 m below the shared pelvis point; mouth axis points down and 35°
// back; the sleeve runs 0.65 m up the spine. Stow-length budget (I9, review RV-06): pod 0.045 + spars 0.457 + drogue cone
// collapsed past the spar ends ≈0.10 + funnel/contacts clearance 0.05 = 0.65 m; the 1.2 m tail line and both bridles
// fold alongside the spars inside Ø55 mm (ASSUMED). Top of the sleeve ≈0.53 m above the pelvis point (below packTop). (dock end = top). Stowed kite centre 0.30 m above the mouth.
// The mouth carries a passive swivel funnel (Ø120 mm, ±80° ball-gimbal, spring-centred; ±50° in iteration I4 failed crosswind docks) that aligns to the line under
// tension like a fairlead trumpet; the folded sled is drawn through it and the spring swings it back to the axis.
// I10 (SIM-034, user 2026-10-21: the kite may stay UNFOLDED on the back): back stow. The open sled lies flat on the rider's
// back, nose up at the shoulder blades, trailing edge down; the bridle apex seats in the line eyelet at the sacrum
// (same exit point as the sleeve mouth), the two keel noses in magnetic seats on the shoulder straps. No sleeve, no
// funnel, nothing above the shoulders (sail top ≈0.30 + chord/2 above the exit ≈ pelvis + 0.41 m; helmet ≈ pelvis
// + 0.78 m). Dock axis: line leaving the eyelet backward, tilted 20° up (the kite is reeled down onto the back from
// behind); capture (apex seats AND the sail lies down onto the seats) is an ASSUMED model.
// I10b: with the back stow there is no sleeve mouth, so the line eyelet moves to a short stiff tab on the hip belt behind
// the buttocks (0.30 m behind / 0.35 m below the shared pelvis point, ≈0.5 m above the snow in a carving crouch — a
// seat-harness-style rear ring, not a pole): at ≤60° line elevation the line then passes ≥1.0 m from the helmet centre
// (shared bodyPoints geometry), the sacrum mouth gave 0.77–0.86 m.
// Hip tab safety (I11 design note, review R2-05, NOT simulated): the tab is a fold-flat sprung flap with a soft collar
// that folds against the belt at ≤50 N on it (sitting down, backward fall), and the ring is held by a magnetic
// breakaway at ≤60 N in any direction; the 38 N body weak link stays in the line. Padding over the sacrum. Kill test:
// backward falls and sit-downs on snow with a dummy.
export const EYELET = { exitF: -0.30, exitU: -0.35, tabFoldN: 50, ringBreakawayN: 60 };
export const BACKSTOW = { seatU: 0.30, seatB: 0.06, axisUpDeg: 20, angFull: 45, angZero: 80, P0: 0.9, sailThick: 0.07 };
export const GEOM = { exitF: -0.17, exitU: -0.12, axisBackDeg: 35, swivelDeg: 80, sleeveLen: 0.65, sleeveD: 0.055, funnelD: 0.12, stowU: 0.30 };

// ------------------------------------------------------------------ worn mass (grams before margin) and volume
export function sledGeo(areaScale = 1) { const k = Math.sqrt(areaScale); return { ...SLED, S: SLED.S * areaScale, span: SLED.span * k, chord: SLED.chord * k, bridle: SLED.bridle * k }; }
export function wornBudget(areaScale = 1, tail = 1, stow = 1) {
  const back = {
    reelMotorBeltDrum: REEL.massG, depowerDrumMotor: 12, brakeClutch: 10, driver: 8, tensionSensorEyelet: 14,
    mcuImuGnssBaroRadio: 12, battery2S: 120, // I9: 2S 18650 + 25 g (≈+3.8 Wh) for endurance margin after RV-01
    heaterInsulation: 12, cutterWeakLink: 8, lines: 2.9,
    ...(stow ? { backSeatsMagnetsGuide: 22, harnessBackPanel: 25 } : { sleeveAndFunnel: 38 }), dockContactsCharger: 6, enclosureHarness: 165,
  };
  const backG = Object.values(back).reduce((a, b) => a + b, 0);
  const k = kiteBudget(areaScale, tail);
  const kg = (backG * (1 + MASS_MARGIN) + k.gWithMargin) / 1000;
  return { back, backG, backWithMarginG: backG * (1 + MASS_MARGIN), kiteG: k.gWithMargin, kg, batteryWh: packWh(back.battery2S), podCellWh: packWh(POD_CELL_G) };
}
// packed volume (L): the stowed kite lives inside the spine sleeve (outer Ø60 mm × 0.65 m, shoulder blades → sacrum),
// merged at the bottom with the lumbar module (reel, depower drum, battery, electronics; 1.04 L as the SIM-032
// engineering back-unit split, research/active_tether_2026_10_20/engineering/report.json). A slim spine unit on a
// harness (or clipped to the rider's own pack / back protector), not a rucksack.
export function packVolume(stow = 1, areaScale = 1) {
  const lumbar = 1.04 + 0.012; // +25 g of 18650 cells ≈ +12 cm³ (I9)
  if (!stow) { const sleeve = (Math.PI / 4) * 0.060 ** 2 * GEOM.sleeveLen * 1000; return { sleeve, lumbar, total: sleeve + lumbar }; }
  // back stow: the shared rule's bounding volume of the stowed device = the open sail lying on the back (span × chord ×
  // ≈0.07 m incl. pod and seats) — large but flat; the optional fold-into-a-pack (bonus): sail rolled round its keels
  // with the pod (Ø55 × 0.50 m) + lumbar module + harness seats ≈0.25 L
  const g = sledGeo(areaScale);
  const envelope = g.span * g.chord * BACKSTOW.sailThick * 1000 + lumbar;
  const folded = (Math.PI / 4) * 0.055 ** 2 * 0.50 * 1000 + lumbar + 0.25;
  return { envelope, folded, lumbar, total: envelope, dims_m: [g.span, g.chord, BACKSTOW.sailThick] };
}

// static electrical loads (W) not simulated: pack MCU/IMU/GNSS/radio 0.6, depower drum mean 0.3; the pod draws its own
// W from its cell, recharged from the pack while docked (charger efficiency 0.85, cell warmed above 0 °C first:
// BATTERY.chargeBelow0C false)
export const BACK_STATIC_W = 0.6 + REEL.depW;
export const CHARGE_EFF = 0.85;
export { BATTERY };
