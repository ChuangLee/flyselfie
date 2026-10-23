// Scenario catalogue (FE-07). Each scenario declares its evidence type:
//   numerical    — computed by the browser solver (uncalibrated model)
//   illustration — engineering illustration only (see demo mode); no numbers
//   pending      — no model exists yet; selectable so the gap is visible
//
// Schedules are keyframes [t, value], linearly interpolated (speed, wind) or
// step-wise (reel). Speed/wind values are factors of the user inputs.
//   start: 'hand'   → kite held at the hand until `release`, then launched
//   start: 'flight' → kite initialised from a 5 s settled pre-run (not shown)

export const SCENARIOS = [
  {
    id: 'launch', evidence: 'numerical', duration: 14, start: 'hand', release: 2.5,
    speed: [[0, 0], [4, 1]], wind: [[0, 1]],
    reel: [[0, 'hold'], [3, 'payout']],
    stages: [[0, 'prepare'], [2.5, 'launch'], [3, 'payout'], [7, 'film']],
  },
  {
    id: 'film_turns', evidence: 'numerical', duration: 30, start: 'flight',
    speed: [[0, 1]], wind: [[0, 1]], reel: [[0, 'hold']],
    stages: [[0, 'film']],
  },
  {
    id: 'retrieval_headwind', evidence: 'numerical', duration: 16, start: 'flight',
    overrides: { windSpeed: 4, windFromDeg: 0 },
    speed: [[0, 1], [3, 1], [8, 0.35]], wind: [[0, 1]], reel: [[0, 'hold'], [4, 'retrieve']],
    stages: [[0, 'film'], [3, 'decelerate'], [4, 'retrieve']],
  },
  {
    id: 'retrieval_calm', evidence: 'numerical', duration: 16, start: 'flight',
    overrides: { windSpeed: 0, gustIntensity: 0 },
    speed: [[0, 1], [3, 1], [8, 0.35]], wind: [[0, 1]], reel: [[0, 'hold'], [4, 'retrieve']],
    stages: [[0, 'film'], [3, 'decelerate'], [4, 'retrieve']],
  },
  {
    id: 'retrieval_crosswind', evidence: 'numerical', duration: 16, start: 'flight',
    overrides: { windSpeed: 3, windFromDeg: 90 },
    speed: [[0, 1], [3, 1], [8, 0.35]], wind: [[0, 1]], reel: [[0, 'hold'], [4, 'retrieve']],
    stages: [[0, 'film'], [3, 'decelerate'], [4, 'retrieve']],
  },
  {
    id: 'wind_loss', evidence: 'numerical', duration: 16, start: 'flight', counterexample: true,
    overrides: { skierSpeed: 4, windSpeed: 6, windFromDeg: 0 },
    speed: [[0, 1]], wind: [[0, 1], [6, 1], [7, 0]], reel: [[0, 'hold']],
    stages: [[0, 'film'], [6, 'windLoss']],
  },
  {
    id: 'abrupt_stop', evidence: 'numerical', duration: 14, start: 'flight', counterexample: true,
    speed: [[0, 1], [5, 1], [6, 0]], wind: [[0, 1]], reel: [[0, 'hold'], [7.5, 'retrieve']],
    stages: [[0, 'film'], [5, 'abruptStop'], [7.5, 'retrieve']],
  },
  {
    id: 'slack_overpayout', evidence: 'numerical', duration: 12, start: 'flight', counterexample: true,
    initialLength: 1.0, overrides: { payoutRate: 3, skierSpeed: 7, windSpeed: 0, gustIntensity: 0 },
    speed: [[0, 1]], wind: [[0, 1]], reel: [[0, 'hold'], [3, 'payout']],
    stages: [[0, 'film'], [3, 'payout']],
  },
  {
    id: 'reel_jam', evidence: 'numerical', duration: 14, start: 'flight', counterexample: true,
    speed: [[0, 1], [3, 1], [8, 0]], wind: [[0, 1]], reel: [[0, 'hold'], [4, 'retrieve'], [4.6, 'jam']],
    stages: [[0, 'film'], [3, 'decelerate'], [4, 'retrieve'], [4.6, 'jam']],
  },
  { id: 'handover', evidence: 'illustration', demoStage: 'handover' },
  { id: 'short_stop', evidence: 'illustration', demoStage: 'shortStop' },
  { id: 'stowage', evidence: 'illustration', demoStage: 'stow' },
  { id: 'power_loss', evidence: 'pending', candidate: 'electronic' },
];

export function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id);
}

export function interp(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return keys[keys.length - 1][1];
}

export function step(keys, t) {
  let v = keys[0][1];
  for (const [tk, vk] of keys) if (t >= tk) v = vk;
  return v;
}
