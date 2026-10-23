// Sensor and actuator specifications for the active-tether autonomy study (SIM-032, controls/estimation).
// Every value carries a source URL or is marked ASSUMED. Datasheet values are typical/class values that
// must be re-checked against the exact part revision before any design freeze. Evidence level: datasheet
// numbers + ASSUMED integration losses; NOT measurements on our hardware.
import { mulberry32, gaussian } from '../../../../sim/js/model/util.js';

export const SPECS = {
  imu: {
    part: 'TDK InvenSense ICM-42688-P (6-axis)',
    gyroNoiseDps_rtHz: 0.0028, accelNoise_ug_rtHz: 70, gyroZroDps: 0.5, accelOffset_mg: 20, sensTolPct: 0.5,
    odrHz: 400, // used ODR (part supports up to 32 kHz)
    src: 'https://invensense.tdk.com/wp-content/uploads/2020/04/ds-000347_icm-42688-p-datasheet.pdf',
    integration: {
      // what reaches the estimator after AHRS fusion on a moving, vibrating body — ASSUMED budget
      tiltErrDeg: 1.5, yawErrDeg: 4, accelBiasAfterAhrs: 0.25,
      note: 'ASSUMED: 1.5° tilt / 4° yaw (GNSS-aided AHRS during carving with 1–2 g lateral loads) → 0.25 m/s² along-track accel bias. Raw noise is negligible next to this.',
    },
  },
  loadCell: {
    part: 'HX711 24-bit bridge ADC + 5 kg (49 N) bar load cell (TAL220 class) on the line-exit pulley',
    adcNoise_nV_80sps: 90, sps: 80, ratedOutput_mVperV: 1.0, nonlinPctFS: 0.05, zeroDriftPctFS_per10C: 0.05,
    src: 'https://cdn.sparkfun.com/datasheets/Sensors/ForceFlex/hx711_english.pdf ; https://cdn.sparkfun.com/datasheets/Sensors/ForceFlex/TAL220M4M5Update.pdf',
    model: { sigmaN: 0.15, scaleErr: 0.05, biasN: 0.1, latencyS: 0.0125 + 0.01,
      note: 'electrical noise ≈1 mN (90 nV over 5 mV FS × 49 N) is negligible; σ 0.15 N vibration pickup, ±5 % exit-pulley friction scale error and 0.1 N zero drift are ASSUMED; latency = one 80 SPS sample + 10 ms filter' },
  },
  lineAngle: {
    part: '2-axis gimballed line-exit fairlead with two ams AS5600 12-bit magnetic encoders',
    lsbDeg: 360 / 4096, slowFilterMs: 2.2,
    src: 'https://ams-osram.com/products/sensor-solutions/position-sensors/ams-as5600-position-sensor',
    model: { sigmaDeg: 0.15, biasDeg: 0.7, armTauS: 0.03,
      note: 'ASSUMED: 0.15° noise (LSB + magnet wobble), ±0.7° bias (magnet misalignment INL + fairlead play), 30 ms arm lag; angles are in the pack frame → add pack AHRS tilt/yaw error' },
  },
  reelEncoder: {
    part: 'motor-shaft magnetic encoder (AS5047P 14-bit class) + drum',
    src: 'https://ams-osram.com/products/sensor-solutions/position-sensors/ams-as5047p-360-magnetic-rotary-position-sensor',
    model: { lengthScaleErr: 0.03, note: 'ASSUMED ±3 % paid-out length error from drum layer build-up (no level-wind); encoder resolution itself is negligible' },
  },
  gnss: {
    part: 'u-blox MAX-M10S',
    velAcc50pct: 0.05, maxRateHz: 10,
    src: 'https://www.u-blox.com/en/product/max-m10-series',
    model: { rateHz: 10, sigmaVh: 0.12, sigmaVz: 0.25, latencyS: 0.1, outageFrac: 0.05,
      note: 'datasheet 0.05 m/s is 50 % CEP in open sky; ASSUMED ×2.4 for body shadowing / trees on a back-worn patch antenna, vertical ×2, 100 ms latency, 5 % outages of 2–10 s' },
  },
  baro: {
    part: 'Bosch BMP390',
    relAccPa: 3, src: 'https://www.bosch-sensortec.com/products/environmental-sensors/pressure-sensors/bmp390/',
    model: { rateHz: 25, sigmaM: 0.1, cpDyn: 0.08,
      note: 'ASSUMED: 0.1 m noise after IIR; inside the pack a port sees ±8 % of the apparent dynamic pressure that changes with every turn (≈ ±0.5 m at 12 m/s)' },
  },
  flyerImu: {
    part: 'ICM-42688-P on the flyer + attitude filter',
    src: 'https://invensense.tdk.com/wp-content/uploads/2020/04/ds-000347_icm-42688-p-datasheet.pdf',
    model: { attErrDeg: 3, accelSigma: 0.3, note: 'ASSUMED 3° attitude error: on a tethered wing the accelerometer never sees gravity alone, so attitude is gyro-integrated and corrected only by the line direction' },
  },
  camera: {
    part: 'flyer 4K camera, subject detector (optional)',
    model: { bearingSigmaDeg: 0.3, rateHz: 30, latencyS: 0.06, dropout: 0.1, note: 'ASSUMED: 0.3° bearing to the detected rider (≈10 px at 4K/80° HFOV), 60 ms pipeline, 10 % dropouts' },
    src: 'ASSUMED',
  },
  radio: {
    part: 'ExpressLRS-class 2.4 GHz link pack→flyer',
    src: 'https://www.expresslrs.org/',
    model: { rateHz: 100, latencyS: 0.02, note: 'packet rates 50–1000 Hz per ELRS docs; 20 ms end-to-end ASSUMED incl. servo PWM frame' },
  },
  servo: {
    part: 'micro digital servo (≈5 g class)',
    src: 'ASSUMED',
    model: { tauS: 0.06, rateDegS: 400, note: 'ASSUMED 0.10 s/60° loaded at −10 °C → ≈400 °/s; surface→CL/bank response modelled as first order' },
  },
  motor: {
    part: 'reel motor: T-Motor MN3508 KV380 class outrunner, FOC driver, 4S',
    src: 'https://store.tmotor.com/product/mn3508-kv380-navigator-type.html ; FOC current bandwidth default 1000 rad/s: https://docs.odriverobotics.com/v/0.5.6/fibre_types/com_odriverobotics_ODrive.html',
    kv: 380, R: 0.12, Vbus: 14.8, Imax: 20, Jrotor: 3.0e-5, massG: 79,
    note: 'KV/mass from the T-Motor page; R 0.12 Ω and rotor inertia ASSUMED class values; Imax 20 A is a short burst limit (ASSUMED)',
  },
};

// ------------------------------------------------------------------ helpers
export function rngFrom(seed) { const r = mulberry32((seed * 2654435761) >>> 0); return { u: r, n: () => gaussian(r) }; }

// first-order lag on a scalar (time constant tau, step dt)
export const lag1 = (y, x, tau, dt) => (tau <= 0 ? x : y + (x - y) * Math.min(1, dt / tau));

// FIFO delay line for sampled signals (stores [t, value])
export class Delay {
  constructor(d) { this.d = d; this.q = []; this.last = null; }
  push(t, v) { this.q.push([t, v]); }
  get(t) { while (this.q.length && this.q[0][0] <= t - this.d) this.last = this.q.shift()[1]; return this.last; }
}
