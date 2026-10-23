// Solver worker (FE-14): keeps long calculations off the render thread. The main
// thread cancels by terminating the worker.
import { simulate } from './model/solver.js';
import { scenarioById } from './model/scenarios.js';

self.onmessage = (e) => {
  const { id, scenarioId, inputs } = e.data;
  try {
    const res = simulate(scenarioById(scenarioId), inputs, {
      onProgress: (f) => self.postMessage({ id, type: 'progress', f }),
    });
    const buffers = Object.values(res.columns).map((a) => a.buffer);
    self.postMessage({ id, type: 'done', res }, buffers);
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err.message, errors: err.errors || null });
  }
};
