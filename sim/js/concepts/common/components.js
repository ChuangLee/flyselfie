// Shared component, battery and atmosphere table for the concept lab (SIM-031,
// audit 2026-10-19 X-01/X-02/X-03). One basis for every concept so mass,
// power and cold endurance are comparable. Masses/powers are catalogue values
// where a source is given, otherwise ASSUMED estimates from the audit.
// Evidence level: datasheet/catalogue numbers, not measurements on our parts.

export const ATMOS = { rho: 1.0, tempC: -10, note: '2000–2500 m, −10 °C (ASSUMED design day)' };

export const BATTERY = {
  whPerKgPack: 150,          // pack level, micro LiPo/Li-ion incl. case & leads (real 117–200; audit DG-01)
  whPerKgPackMax: 200,       // optimistic bound for sensitivity runs
  coldFactor: 0.75,          // usable fraction at −10 °C (ASSUMED, consistent with round 1)
  reserve: 0.15,             // kept in reserve
  chargeBelow0C: false,      // Li-ion must not be charged below ≈0 °C unless the cell is heated
  heaterW: 0.6,              // keeping a ≤30 g cell above 0 °C in an insulated holster (ASSUMED), charged to the budget
  boostEff: 0.85,            // 1S→5 V conversion for 5 V camera modules
  src: 'https://www.fpv24.com/en/boslipo/boslipo-p7-battery-520mah-74v-2s-95c-lipo-battery-with-xt30-plug ; https://www.redarcelectronics.com/us/resources/chargers-isolators-faqs/do-not-charge-lithium-battery-below-32-degrees/',
};

// mass g, mean power W (at 5 V or battery as noted)
export const COMPONENTS = {
  cam4k: { g: 16, W: 2.5, zh: '4K 微型相机（RunCam Thumb Pro 级）', en: '4K micro camera (RunCam Thumb Pro class)', src: 'https://www.getfpv.com/runcam-thumb-pro-4k-hd-action-camera.html' },
  cam4kNoGimbal: { g: 27, W: 2.7, zh: '4K 带电子稳像相机（Thumb 2 级）', en: '4K camera with gyro EIS (Thumb 2 class)', src: 'audit LF-03' },
  gimbal2ax: { g: 30, W: 1.0, zh: '两轴无刷微云台（Caddx GM2 级）', en: '2-axis brushless micro gimbal (Caddx GM2 class)', src: 'https://rotorama.com/product/gm2 (power ASSUMED)' },
  avionics: { g: 10, W: 1.0, zh: '飞控/IMU/GNSS/UWB/数传', en: 'FC/IMU/GNSS/UWB/radio', src: 'audit LF-03 (ASSUMED)' },
  visionCompute: { g: 11, W: 2.5, zh: '视觉跟踪计算板（VOXL 2 Mini 级）', en: 'vision tracking compute (VOXL 2 Mini class)', src: 'https://www.modalai.com/products/voxl-2-mini (0.5–8 W)' },
  servo: { g: 2.5, W: 0.1, zh: '微型舵机（每个）', en: 'micro servo (each)', src: 'ASSUMED' },
  motorProp: { g: 11, W: 0, zh: '1104 电机+折叠桨+电调', en: '1104 motor + folding prop + ESC', src: 'audit LF-03' },
  motorProp4in: { g: 17, W: 0, zh: '1404 电机+4 英寸折叠桨+电调', en: '1404 motor + 4-inch folding prop + ESC', src: 'audit X-02 (ASSUMED)' },
  wiring: { g: 5, W: 0, zh: '线束/接插件/升压/SD', en: 'wiring/connectors/boost/SD', src: 'audit TG-02' },
};

export const MASS_MARGIN = 0.15; // design margin on the summed budget

// items: [[componentId | {g, W}, count?], ...] plus extra structural grams
// returns { g, gWithMargin, W }
export function budget(items, structureG = 0) {
  let g = structureG, W = 0;
  for (const [it, n = 1] of items) {
    const c = typeof it === 'string' ? COMPONENTS[it] : it;
    if (!c) throw new Error(`unknown component ${it}`);
    g += c.g * n; W += c.W * n;
  }
  return { g, gWithMargin: g * (1 + MASS_MARGIN), W };
}

// cold usable minutes for a pack of `wh` at mean load `W` (everything worn, one charge)
// heated: the cell heater also runs while riding the lift (filmFraction = filming share of the day,
// default 0.33 ≈ 4 min run / 8 min lift), so its power is charged per filming minute (re-audit 2026-10-20)
export function enduranceMin(wh, W, { heated = false, filmFraction = 0.33 } = {}) {
  const load = W + (heated ? BATTERY.heaterW / Math.max(0.05, filmFraction) : 0);
  return (wh * BATTERY.coldFactor * (1 - BATTERY.reserve) / Math.max(1e-6, load)) * 60;
}

// pack energy from mass at the shared specific energy
export const packWh = (grams, whPerKg = BATTERY.whPerKgPack) => (grams / 1000) * whPerKg;

// max ground speed for a flyer of mass kg under the shared 14.9 J line (criteria keMax)
export const keSpeedCap = (kg, J = 14.9) => Math.sqrt((2 * J) / kg);
