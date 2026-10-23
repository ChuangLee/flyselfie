// Result container shared by concept models (see ../README.md).
export function makeResult({ conceptId, scenarioId, modelVersion, duration, sampleDt = 0.02 }) {
  const n = Math.floor(duration / sampleDt + 1e-9) + 1;
  const columns = { t: new Float64Array(n) };
  for (let i = 0; i < n; i++) columns.t[i] = i * sampleDt;
  return {
    conceptId, scenarioId, modelVersion, duration, sampleDt, n, columns,
    events: [], metrics: [], plots: [], validUntil: null, scopeEnd: null,
    col(name) { return columns[name] || (columns[name] = new Float64Array(n).fill(NaN)); },
    event(t, type, severity, zh, en) { this.events.push({ t, type, severity, zh, en }); },
    metric(id, zh, en, value, unit, pass = null, criterion = null) { this.metrics.push({ id, zh, en, value, unit, pass, criterion }); },
    index(t) { return Math.max(0, Math.min(n - 1, Math.round(t / sampleDt))); },
  };
}

// fraction of samples where pred(i) is true
export function fraction(n, pred) { let k = 0; for (let i = 0; i < n; i++) if (pred(i)) k++; return k / Math.max(1, n); }
