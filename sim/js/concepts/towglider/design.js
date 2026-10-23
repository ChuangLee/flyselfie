// towglider round-2 design basis (SIM-031, audit 2026-10-19 TG-02/TG-03/X-01..X-03):
// flying mass, power chain and worn mass built from the shared component table
// (common/components.js) plus this concept's own structure, the conductive leash
// and the hip power pack. Every number without a source is ASSUMED and labelled.
// Evidence level: catalogue values and estimates, no part was weighed or measured.
import { COMPONENTS, BATTERY, MASS_MARGIN, budget, keSpeedCap } from '../common/components.js';

// ---------------------------------------------------------------- airframe structure
// EPP 3 mm skin over a carbon spar + laminating film ≈ 220 g/m² of wing (ASSUMED: 3 mm EPP at
// 30 kg/m³ = 90 g/m², spar/film/LE tape ≈ 130 g/m²); pod + boom + folding V-tail 16 g; fold hinges,
// springs and latch 5 g; tow hook with load cell and magnetic pogo connector 3 g (all ASSUMED).
// Round 3 (re-audit A2-TG-04): each wing panel also folds along a chord hinge at 55 % chord (the rear 45 % incl. the
// split flap folds under the front), and the tail boom telescopes into the pod: +3 g of chord hinges/latches and
// +0.003 cd0 for the sealed hinge gap (both ASSUMED).
export const STRUCT = { wingGm2: 220, podTailG: 16, hingesG: 5, chordHingeG: 3, hookG: 3 };
export const structureG = (S) => STRUCT.wingGm2 * S + STRUCT.podTailG + STRUCT.hingesG + STRUCT.chordHingeG + STRUCT.hookG;

// ---------------------------------------------------------------- camera options
// id → items on the glider (component ids or {g, W}), optics for analysis.js
//  gimbal : 4K 60° rectilinear on a 2-axis brushless pan/tilt micro gimbal (30 g class, Caddx GM2 mass)
//  panEIS : 4K gyro-EIS camera (Thumb 2 class, 27 g) with a 90° fisheye on a 3-servo pan/tilt/roll pointing mount, crop reframed
//  fixEIS : same camera, 150° fisheye fixed to the airframe, crop reframed (no moving parts)
//  fix48  : 48 MP (8000×6000) 1/1.3" sensor with 150° fisheye, fixed (ASSUMED 30 g / 3.5 W: no part in the
//           shared table; sensitivity variant only)
export const CAMERA_OPTIONS = {
  gimbal: { items: [['cam4k'], ['gimbal2ax']], optic: 'rect', hfov: 60, sensor: [3840, 2160], stab: 'gimbal', pan: false,
    zh: '4K 60° + 两轴无刷云台（30 g 级）', en: '4K 60° on a 2-axis brushless gimbal (30 g class)' },
  panEIS: { items: [['cam4kNoGimbal'], ['servo', 3], [{ g: 3, W: 0 }]], optic: 'fisheye', hfov: 90, sensor: [3840, 2160], stab: 'eis', pan: true, tilt: true, roll: true,
    zh: '4K 陀螺稳像相机 90° 鱼眼 + 三只微型舵机指向座（水平/俯仰/横滚，只指向不稳像）', en: '4K gyro-EIS camera, 90° fisheye on a 3-servo pan/tilt/roll pointing mount (pointing only, no stabilisation)' },
  fixEIS: { items: [['cam4kNoGimbal']], optic: 'fisheye', hfov: 150, sensor: [3840, 2160], stab: 'eis', pan: false,
    zh: '4K 陀螺稳像相机 150° 鱼眼机身固定', en: '4K gyro-EIS camera, 150° fisheye, body-fixed' },
  fix48: { items: [[{ g: 30, W: 3.5 }]], optic: 'fisheye', hfov: 150, sensor: [8000, 6000], stab: 'eis', pan: false, assumedPart: true,
    zh: '48 MP 1/1.3" 传感器 150° 鱼眼机身固定（假设部件）', en: '48 MP 1/1.3" sensor, 150° fisheye, body-fixed (ASSUMED part)' },
  // round 3 (chosen): same Thumb 2 class camera (27 g, IMX586, records 4K 4:3 at 30 fps per the retailer spec sheet) with
  // a narrow M12 rectilinear lens (≈66° HFOV, ASSUMED custom lens swap, mass unchanged) on the 3-servo mount, now
  // closed-loop: world-referenced pointing with FC-IMU feed-forward (EMAX ES9251 II class servos: 2.5 g, 0.08 s/60°)
  panRect: { items: [['cam4kNoGimbal'], ['servo', 3], [{ g: 3, W: 0 }]], optic: 'rect', hfov: 66, sensor: [3840, 2880], stab: 'eis', pan: true, tilt: true, roll: true, stabMount: true,
    src: 'https://www.diyfpv.com/product/runcam-thumb-2-4k-hd-action-camera-nd-filter-set (4K 4:3 30 fps, 27 g); https://www.readymaderc.com/products/details/emax-es9251-2-5g-plastic-micro-digital-servo (2.5 g, 0.08 s/60°)',
    zh: '4K 4:3 陀螺稳像相机 + 66° M12 直线镜头 + 三舵机闭环稳定指向座（选定）', en: '4K 4:3 gyro-EIS camera, 66° M12 rectilinear lens on a closed-loop 3-servo stabilised pointing mount (chosen)' },
};

// common glider avionics: FC/IMU/GNSS/UWB/radio, 4 micro servos (2 ruddervators, 2 split flaps), wiring/
// connectors/SD, release + fold-latch actuator 2 g (ASSUMED), 48→5 V buck 2 g / 90 % (ASSUMED),
// supercapacitor buffer 2 × 10 F 2.7 V = 5 F at 5.4 V, ≈50 J usable down to 3 V, 5 g (ASSUMED, EDLC
// cells ≈2.5 g each) — enough for a 3–5 s deep-stall landing at ~1.5 W if the leash power is lost.
// There is NO lithium cell on the glider, so nothing on the glider is ever charged in the cold.
export const AVIONICS_ITEMS = [['avionics'], ['servo', 4], ['wiring'], [{ g: 2, W: 0 }], [{ g: 2, W: 0 }], [{ g: 5, W: 0 }]];

export function gliderBudget(cam = 'panEIS', S = 0.07) {
  const C = CAMERA_OPTIONS[cam] || CAMERA_OPTIONS.panEIS;
  const b = budget([...C.items, ...AVIONICS_ITEMS], structureG(S));
  return { ...b, kg: b.gWithMargin / 1000, structureG: structureG(S), cam };
}

// ---------------------------------------------------------------- conductive leash (power over the line)
// Two enamelled Cu-alloy tinsel conductors (0.12 mm equivalent, helically served so the copper sees
// little strain) around a 0.17 mm Dyneema core, hi-vis PU jacket: ≈0.45 mm OD, ≈0.27 g/m, ~70 N break
// (core). Resistance 1.8 Ω/m per conductor (Cu 1.52 Ω/m at 0.12 mm × 1.2 alloy/tinsel factor, ASSUMED).
// 15 m spool (the round-1 25 m spool only served the outrun/stop cases that now end in a deep-stall drop).
// Round 3 (re-audit A2-TG-06): a specified conductor instead of 'tinsel': two enamelled 7/44 AWG copper litz bundles
// (7 × 0.0508 mm strands, 0.0142 mm² each; litz strands see 1/7 of the bending strain of a solid wire of equal section
// on the 25 mm drum) helically served over a 0.17 mm UHMWPE core, 0.05 mm PU hi-vis jacket: OD 0.60 mm, 0.40 g/m
// (Cu 0.25 + PE 0.02 + PU/enamel 0.13). R = 1.724e-8 Ω·m / 1.42e-8 m² = 1.21 Ω/m, +5 % lay → 1.28 Ω/m at 20 °C
// (≈1.13 at −10 °C; 1.3 used). AWG 44 = 0.0508 mm (ASTM B258); construction per standard litz catalogues.
export const LINE = { dMm: 0.6, gPerM: 0.40, EA: 1800, breakN: 70, ohmPerM: 1.3, spoolM: 15, volt: 48,
  src: 'ASTM B258 (AWG 44 = 0.0508 mm), IACS Cu 1.724e-8 Ω·m; litz construction e.g. https://mwswire.com/wp-content/uploads/2025/08/MWS_LitzWire.pdf; flex life, OD and resistance after cycling must be measured (kill test)' };

// ---------------------------------------------------------------- power chain
// glider load (5 V) → buck 90 % → line loss I²R over the whole spool (both conductors) → hip boost 88 %
// from the worn pack (3.6 V Li-ion, discharge only in the cold: allowed; it is recharged indoors)
// round 4 (audit3 A3-TG-05): the lift ride (liftS = 8 min per run, the shared basis) is charged: after the stow the hip unit
// sleeps (MCU stop mode + GNSS power-save for the geofence wake + 48 V boost and reel driver off: sleepW 0.05 W, ASSUMED;
// u-blox M10-class GNSS ≈ 0.015–0.03 W in power-save); without the sleep mode it idles at reelIdleW + hipElecW (0.6 W)
export const HIP = { packWh: 15, reelIdleW: 0.3, hipElecW: 0.3, boostEff: 0.88, buckEff: 0.9, sleepW: 0.05, liftS: 480 };
export function powerChain(gliderW, reelMechW = 0, ohmPerM = LINE.ohmPerM) {
  const atGlider = gliderW / HIP.buckEff;
  const I = atGlider / LINE.volt;
  const Rloop = 2 * LINE.spoolM * ohmPerM;
  const loss = I * I * Rloop;
  const hipIn = (atGlider + loss) / HIP.boostEff + HIP.reelIdleW + reelMechW / 0.6 + HIP.hipElecW;
  return { atGlider, I, Rloop, loss, lossPct: (100 * loss) / (atGlider + loss), hipIn };
}

// ---------------------------------------------------------------- worn mass (kg)
// reel: tension-mode micro winch, slip clutch, 2-ring slip ring, hip cutter, line 15 m (4 g): 85 g;
// hip pack 15 Wh at the shared 150 Wh/kg = 100 g; 48 V boost + current limiter + line-fault monitor 10 g;
// holster tube + funnel + belly-skid dock 60 g; belt + button + haptic 70 g (ASSUMED)
export const WORN = { reel: 0.085, hipPack: HIP.packWh / BATTERY.whPerKgPack, boost: 0.01, holster: 0.06, belt: 0.07 };

// packed volume (L), round 3 (re-audit A2-TG-04: a 97 mm chord does not fit an 80 mm tube). Folded glider: each half
// wing pivots aft to lie along the pod AND folds along a chord hinge at 55 % (folded chord 0.55 c, folded panel
// thickness ≈0.13 c: 8 % airfoil + folded flap); the panels stand on edge either side of the pod (camera 26 × 27.5 ×
// 55 mm + 2 mm shell = 30 × 31.5 mm). Tube ID = diagonal of that section + 1 mm, 1 mm wall. Length = pivot 0.07 m +
// panel (half span − 16 mm root) + 20 mm, or the stowed fuselage with the telescoped tail boom (0.40 m), whichever is
// longer. Plus reel 0.30 L, 15 Wh pack 0.12 L, 48 V boost 0.03 L, mouth flare 0.05 L. All ASSUMED geometry.
export function packVolume(p) {
  const span = Math.sqrt(p.S * p.AR), c = p.S / span, half = span / 2;
  const gimbal = p.camOpt === 'gimbal';
  const pod = gimbal ? [47, 47] : [30, 31.5];
  const cf = (p.chordFold === 0 ? 1 : 0.55) * c * 1000, tp = (p.chordFold === 0 ? 0.08 : 0.13) * c * 1000;
  const w = pod[0] + 2 * tp, h = Math.max(pod[1], cf);
  const id = Math.hypot(w, h) + 1, od = id + 2;
  const Lf = Math.max(0.40, 0.07 + half - 0.016 + 0.02);
  const tube = Math.PI * (od / 2000) ** 2 * Lf * 1000;
  const parts = { reelL: 0.3, cellL: 0.12, boostL: 0.03, mouthL: 0.05 };
  return { holsterL: tube, ...parts, other: parts.boostL + parts.mouthL, total: tube + parts.reelL + parts.cellL + parts.boostL + parts.mouthL, foldedLength: Lf, tubeOD_mm: od, chord_mm: c * 1000, foldedChord_mm: cf };
}

export { keSpeedCap, MASS_MARGIN, COMPONENTS, BATTERY };
