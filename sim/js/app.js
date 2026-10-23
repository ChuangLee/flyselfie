// SIM-010 main controller.
import { CONFIG, MODEL, MODEL_CONSTANTS, PARAMS, defaultInputs, validateInputs } from './model/config.js';
import { SCENARIOS, scenarioById } from './model/scenarios.js';
import { inputHash, effectiveInputs, resultToJSON, resultFromJSON, resultToCSV, RESULT_SCHEMA } from './model/solver.js';
import { CANDIDATES, COMPARE_ROWS } from './model/candidates.js';
import { STRINGS, PARAM_TEXT, SCENARIO_TEXT, STAGE_TEXT, EVENT_TEXT } from './i18n.js';
import { Orbit, attachOrbit, Projector, line, dot, label, arrow, slopeGrid, skier, kite } from './ui/view3d.js';
import { drawCamView } from './ui/camview.js';
import { PLOT_DEFS, drawPlot } from './ui/plots.js';
import { DEMO_STAGES, DEMO_DURATION, demoState, demoStage, demoTrack } from './ui/demo.js';
import { v3 } from './model/util.js';

const $ = (id) => document.getElementById(id);
const state = {
  lang: 'zh', mode: 'sim', scenarioId: 'film_turns', inputs: defaultInputs(),
  result: null, resultSource: null, stale: false, inputErrors: [],
  t: 0, playing: false, speed: 1, reducedMotion: false, demoT: 0,
  worker: null, runId: 0, running: false, cache: new Map(), references: new Map(),
  statusKey: 'statusIdle', statusClass: '', statusExtra: '',
};
try { state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* default off */ }
// WebGL photoreal view (null → Canvas 2D fallback)
let gl = null;
const glOpts = { quality: 'high', overlays: true, director: true, letterbox: true };
let lastFisheye = 0;
const orbit = new Orbit(); // follows the skier in sim/demo modes (canvas fallback)
const geomOrbit = new Orbit({ yaw: -1.35, pitch: 0.12, dist: 6.5, target: [-0.7, 0, 1.6] }); // fixed side view
const activeOrbit = () => (state.mode === 'geometry' ? geomOrbit : orbit);

// ---------------------------------------------------------------- i18n
const tr = (k) => (STRINGS[state.lang][k] ?? k);
const pair = (p) => (p ? p[state.lang === 'zh' ? 0 : 1] : '');
const lz = (o) => (o ? o[state.lang] : '');

function applyI18n() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  $('speedSel').title = tr('speedNote');
  renderAll();
}

// ---------------------------------------------------------------- colours
let C = {};
function readColors() {
  const s = getComputedStyle(document.documentElement);
  const g = (n) => s.getPropertyValue(n).trim();
  C = {
    fg: g('--fg'), muted: g('--muted'), grid: g('--grid'), gridHeavy: g('--muted'), snow: g('--snow'), sky: g('--sky'), camBg: g('--panel'),
    body: g('--fg'), ski: g('--c2'), pole: g('--muted'), helmet: g('--c1'), pack: g('--c3'), packEdge: g('--fg'),
    kite: 'rgba(194, 65, 12, 0.55)', kiteEdge: g('--c1'), tether: g('--fg'), slack: g('--warn'), bad: g('--bad'), warn: g('--warn'),
    wind: g('--c2'), air: g('--c4'), cam: g('--c3'), accent: g('--accent'), good: g('--good'),
  };
}
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); requestDraw(); }); } catch { /* old browsers */ }

// ---------------------------------------------------------------- status
function setStatus(key, cls = '', extra = '') {
  state.statusKey = key; state.statusClass = cls; state.statusExtra = extra;
  const el = $('status');
  el.className = 'status ' + cls;
  el.textContent = tr(key) + (extra ? ' — ' + extra : '');
}

// ---------------------------------------------------------------- banner
function evidenceOf() {
  if (state.mode === 'geometry') return ['geometry', tr('evGeometry')];
  if (state.mode === 'demo') return ['illustration', tr('evIllustration')];
  if (state.mode === 'compare') return ['compare', tr('evCompare')];
  const sc = scenarioById(state.scenarioId);
  if (sc.evidence === 'illustration') return ['illustration', tr('evIllustration')];
  if (sc.evidence === 'pending') return ['pending', tr('evPending')];
  if (state.resultSource === 'imported' || state.resultSource === 'reference') return ['numerical', tr('evReplay') + ' · ' + tr('evNumerical')];
  return ['numerical', tr('evNumerical')];
}

function renderBanner() {
  const [cls, text] = evidenceOf();
  const ev = $('bnEvidence');
  ev.className = 'ev-tag ' + cls;
  ev.textContent = text;
  $('bnConfig').textContent = `${CONFIG.id} (${CONFIG.maturity})`;
  $('bnModel').textContent = state.mode === 'sim' || state.mode === 'geometry' ? `${MODEL.id}@${MODEL.version} — ${MODEL.name}` : '—';
  $('bnPending').textContent = CONFIG.pendingTests.join(', ') + ' — NOT_RUN';
  $('demoBanner').hidden = state.mode !== 'demo';
}

// ---------------------------------------------------------------- scenarios
function renderScenarios() {
  const ul = $('scenarioList');
  ul.innerHTML = '';
  for (const sc of SCENARIOS) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-current', sc.id === state.scenarioId ? 'true' : 'false');
    const name = document.createElement('span');
    name.textContent = pair(SCENARIO_TEXT[sc.id]);
    const tags = document.createElement('span');
    const badge = document.createElement('span');
    badge.className = 'badge ' + sc.evidence;
    badge.textContent = { numerical: state.lang === 'zh' ? '数值' : 'numerical', illustration: state.lang === 'zh' ? '示意' : 'illustration', pending: state.lang === 'zh' ? '待建模' : 'pending' }[sc.evidence];
    tags.append(badge);
    if (sc.counterexample) {
      const cx = document.createElement('span');
      cx.className = 'badge cx';
      cx.textContent = tr('counterexample');
      tags.append(' ', cx);
    }
    b.append(name, tags);
    b.addEventListener('click', () => selectScenario(sc.id));
    li.append(b);
    ul.append(li);
  }
}

function selectScenario(id) {
  state.scenarioId = id;
  state.t = 0;
  state.playing = false;
  const sc = scenarioById(id);
  state.result = null;
  state.resultSource = null;
  if (sc.evidence === 'numerical') {
    renderParams();
    resolveResult(true);
  } else {
    renderParams();
    setStatus(sc.evidence === 'pending' ? 'evPending' : 'evIllustration', 'stale');
  }
  renderAll();
}

// ---------------------------------------------------------------- parameters
function renderParams() {
  const form = $('paramForm');
  form.innerHTML = '';
  const sc = scenarioById(state.scenarioId);
  const ov = sc.overrides || {};
  const groups = ['scenario', 'design', 'operation', 'unsupported'];
  const gName = { scenario: 'groupScenario', design: 'groupDesign', operation: 'groupOperation', unsupported: 'groupUnsupported' };
  for (const g of groups) {
    const fs = document.createElement('fieldset');
    const lg = document.createElement('legend');
    lg.textContent = tr(gName[g]);
    fs.append(lg);
    for (const p of PARAMS.filter((q) => q.group === g)) {
      const row = document.createElement('div');
      row.className = 'prm' + (p.supported === false ? ' unsupported' : '') + (p.id in ov ? ' overridden' : '');
      const id = 'p_' + p.id;
      const lab = document.createElement('label');
      lab.htmlFor = id;
      lab.textContent = pair(PARAM_TEXT[p.id]) + (p.unit ? ` [${p.unit}]` : '');
      const inp = document.createElement('input');
      inp.id = id; inp.type = 'number'; inp.inputMode = 'decimal';
      if (p.supported === false) {
        inp.disabled = true; inp.value = p.def;
      } else {
        inp.min = p.min; inp.max = p.max; inp.step = p.step;
        inp.value = p.id in ov ? ov[p.id] : state.inputs[p.id];
        if (p.id in ov) inp.disabled = true;
        inp.addEventListener('input', onParamInput);
      }
      const meta = document.createElement('div');
      meta.className = 'meta';
      const src = document.createElement('span');
      src.className = 'src ' + p.src;
      src.textContent = p.src;
      meta.append(src);
      if (p.supported === false) meta.append(' · ' + tr('unsupportedNote'));
      else {
        meta.append(` · ${tr('range')} ${p.min}–${p.max} · ${tr('default')} ${p.def}`);
        if (p.id in ov) meta.append(state.lang === 'zh' ? ` · 工况固定为 ${ov[p.id]}` : ` · fixed by scenario: ${ov[p.id]}`);
        if (p.ref) meta.append(' · ' + p.ref);
      }
      const err = document.createElement('div');
      err.className = 'err'; err.id = 'err_' + p.id; err.setAttribute('aria-live', 'polite');
      inp.setAttribute('aria-describedby', err.id);
      row.append(lab, inp, meta, err);
      fs.append(row);
    }
    form.append(fs);
  }
  showInputErrors();
}

function readForm() {
  const sc = scenarioById(state.scenarioId);
  const ov = sc.overrides || {};
  const inp = { ...state.inputs };
  for (const p of PARAMS) {
    if (p.supported === false || p.id in ov) continue;
    const el = $('p_' + p.id);
    if (!el) continue;
    inp[p.id] = el.value.trim() === '' ? NaN : Number(el.value);
  }
  return inp;
}

function showInputErrors() {
  for (const p of PARAMS) {
    const el = $('p_' + p.id), err = $('err_' + p.id);
    if (!el || !err) continue;
    const e = state.inputErrors.find((x) => x.id === p.id);
    el.setAttribute('aria-invalid', e ? 'true' : 'false');
    err.textContent = e ? e.msg : '';
  }
}

let debounce = null;
function onParamInput() {
  const inp = readForm();
  const check = validateInputs(inp);
  state.inputErrors = check.errors;
  showInputErrors();
  if (!check.ok) {
    setStatus('statusInvalidInput', 'invalid');
    state.stale = !!state.result;
    renderValidity();
    return;
  }
  state.inputs = inp;
  clearTimeout(debounce);
  debounce = setTimeout(() => resolveResult($('autoRun').checked), 350);
}

// Use a cached / reference result when the input hash matches; otherwise compute
// (auto) or flag "no matching replay" (FE-04).
function resolveResult(allowRun) {
  const sc = scenarioById(state.scenarioId);
  if (sc.evidence !== 'numerical') return;
  const h = inputHash(sc, state.inputs);
  if (state.result && state.result.inputHash === h) { state.stale = false; renderAll(); return; }
  if (state.references.has(h)) { setResult(state.references.get(h), 'reference'); return; }
  if (state.cache.has(h)) { setResult(state.cache.get(h), 'computed'); return; }
  if (allowRun) runSim();
  else {
    state.stale = !!state.result;
    setStatus('statusStale', 'stale');
    renderAll();
  }
}

// ---------------------------------------------------------------- solving
function runSim() {
  const sc = scenarioById(state.scenarioId);
  if (sc.evidence !== 'numerical') return;
  const check = validateInputs(state.inputs);
  if (!check.ok) { state.inputErrors = check.errors; showInputErrors(); setStatus('statusInvalidInput', 'invalid'); return; }
  cancelSim(true);
  const id = ++state.runId;
  state.running = true;
  $('runBtn').disabled = true; $('cancelBtn').disabled = false;
  setStatus('statusRunning');
  const inputs = { ...state.inputs };
  const finish = (res) => {
    if (id !== state.runId) return;
    state.running = false;
    $('runBtn').disabled = false; $('cancelBtn').disabled = true;
    state.cache.set(res.inputHash, res);
    if (state.scenarioId === res.scenario) setResult(res, 'computed');
  };
  const fail = (msg) => {
    if (id !== state.runId) return;
    state.running = false;
    $('runBtn').disabled = false; $('cancelBtn').disabled = true;
    setStatus('statusError', 'error', msg);
  };
  try {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    state.worker = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === 'progress') setStatus('statusRunning', '', `${Math.round(m.f * 100)}%`);
      else if (m.type === 'done') { w.terminate(); state.worker = null; finish(m.res); }
      else if (m.type === 'error') { w.terminate(); state.worker = null; fail(m.message + (m.errors ? ' ' + JSON.stringify(m.errors) : '')); }
    };
    w.onerror = (e) => { e.preventDefault(); w.terminate(); state.worker = null; fallback(); };
    w.postMessage({ id, scenarioId: sc.id, inputs });
  } catch { fallback(); }
  function fallback() {
    // module workers unavailable: compute on the main thread (cannot be cancelled mid-run)
    import('./model/solver.js').then(({ simulate }) => setTimeout(() => {
      try { finish(simulate(sc, inputs)); } catch (err) { fail(err.message); }
    }, 0));
  }
}

function cancelSim(silent) {
  if (state.worker) { state.worker.terminate(); state.worker = null; }
  if (state.running) {
    state.running = false;
    state.runId++;
    $('runBtn').disabled = false; $('cancelBtn').disabled = true;
    if (!silent) setStatus('statusCancelled', 'stale');
  }
}

function setResult(res, source) {
  state.result = res;
  state.resultSource = source;
  state.stale = res.inputHash !== inputHash(scenarioById(state.scenarioId), state.inputs);
  state.t = Math.min(state.t, res.duration);
  if (state.stale) setStatus('statusStale', 'stale');
  else setStatus('statusDone', 'ok', source === 'reference' ? tr('matchReplay') : source === 'imported' ? tr('importOk') : tr('computed'));
  renderAll();
}

async function loadReferences() {
  try {
    const idx = await (await fetch('data/reference/index.json')).json();
    for (const f of idx.files) {
      try {
        const res = resultFromJSON(await (await fetch('data/reference/' + f)).json());
        if (res.model.version === MODEL.version) state.references.set(res.inputHash, res);
      } catch (err) { console.warn('reference rejected', f, err.message); }
    }
  } catch { /* no reference set available (e.g. file://) — compute instead */ }
}

// ---------------------------------------------------------------- sampled state
function sampleAt(res, t) {
  const c = res.columns;
  const i = Math.max(0, Math.min(res.n - 1, Math.round(t / res.sampleDt)));
  const j = Math.min(res.n - 1, i + 1), k = Math.max(0, i - 1);
  let hd = [c.sx[j] - c.sx[k], c.sy[j] - c.sy[k], 0];
  if (v3.len(hd) < 1e-4) hd = [1, 0, 0];
  const P = res.effectiveInputs;
  const kp = [c.kx[i], c.ky[i], c.kz[i]];
  return {
    i, t: c.t[i],
    skierPos: [c.sx[i], c.sy[i], c.sz[i]], anchor: [c.ax[i], c.ay[i], c.az[i]], kite: kp,
    cam: [kp[0], kp[1], kp[2] - P.cameraDrop], heading: v3.norm(hd),
    air: [c.vax[i], c.vay[i], c.vaz[i]], wind: [c.wx[i], c.wy[i], c.wz[i]],
    T: c.T[i], slack: Number.isFinite(c.T[i]) && c.T[i] <= 0, unavailable: !Number.isFinite(c.T[i]),
    valid: c.valid[i] === 1, tanS: Math.tan(P.slopeDeg * Math.PI / 180), halfSpan: 0.5 * Math.sqrt(2 * P.wingArea),
  };
}

// ---------------------------------------------------------------- drawing
function setupCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [ctx, W, H];
}

function drawScene3D(st, opts = {}) {
  const [ctx, W, H] = setupCanvas($('c3d'));
  ctx.fillStyle = C.sky; ctx.fillRect(0, 0, W, H);
  const o = activeOrbit();
  if (o === orbit) {
    // reduced motion: re-centre only when the skier leaves the view, instead of continuous follow
    if (!state.reducedMotion || v3.len(v3.sub(orbit.target, st.skierPos)) > 12) orbit.target = v3.add(st.skierPos, [0, 0, 1.4]);
  }
  const P = new Projector(o, W, H);
  slopeGrid(ctx, P, st.skierPos, st.tanS, C);
  // kite ground shadow for depth reading
  if (st.kite) {
    const sh = [st.kite[0], st.kite[1], -st.kite[0] * st.tanS];
    dot(ctx, P, sh, 4, 'rgba(0,0,0,0.25)');
    line(ctx, P, sh, st.kite, C.grid, 0.8, [2, 4]);
  }
  if (opts.trail) for (const q of opts.trail) dot(ctx, P, q, 1.6, C.kiteEdge);
  const items = [];
  items.push({ d: P.depth(st.skierPos), f: () => skier(ctx, P, st.skierPos, st.heading, C, st.pose || {}) });
  if (st.kite) {
    items.push({ d: P.depth(st.kite) - 0.01, f: () => {
      if (st.tetherVisible !== false) line(ctx, P, st.anchor, st.kite, st.unavailable ? C.muted : st.slack ? C.slack : C.tether, 1.4, st.slack ? [5, 4] : null);
      kite(ctx, P, st.kite, st.air || [-1, 0, 0], st.halfSpan, C, st.valid === false ? 0.55 : 1);
      if (st.cam) dot(ctx, P, st.cam, 3.5, C.cam);
    } });
  }
  items.sort((a, b) => b.d - a.d).forEach((it) => it.f());
  if (Array.isArray(st.crank)) dot(ctx, P, st.crank, 4, C.accent);
  if (opts.arrows && st.kite) {
    const wl = v3.len(st.wind);
    if (wl > 0.05) arrow(ctx, P, v3.add(st.skierPos, [-2, 2.5, 3]), v3.scale(st.wind, 0.25), C.wind);
    if (v3.len(st.air) > 0.05) arrow(ctx, P, st.kite, v3.scale(st.air, 0.06), C.air, 1.5);
  }
  if (opts.markers) for (const m of opts.markers) {
    const S = P.p(m.pos);
    if (!S) continue;
    ctx.strokeStyle = C.bad; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(S[0] - 6, S[1] - 6); ctx.lineTo(S[0] + 6, S[1] + 6); ctx.moveTo(S[0] + 6, S[1] - 6); ctx.lineTo(S[0] - 6, S[1] + 6); ctx.stroke();
    label(ctx, P, m.pos, m.text, C.bad);
  }
  if (opts.dims) opts.dims(ctx, P);
  // legend / scale
  ctx.fillStyle = C.muted; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(tr('gridNote') + (opts.arrows ? (state.lang === 'zh' ? ' · 蓝箭头=环境风 · 紫箭头=相对气流' : ' · blue arrow = ambient wind · purple = relative airflow') : ''), 8, H - 8);
  if (opts.badge) {
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = opts.badgeColor || C.bad;
    ctx.fillText(opts.badge, 8, 16);
  }
}

function drawCam(st, fov) {
  const [ctx, W, H] = setupCanvas($('ccam'));
  if (!st.cam) {
    ctx.fillStyle = C.camBg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.muted; ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(tr('statusNoData'), 10, 20);
    return;
  }
  drawCamView(ctx, W, H, st, C, fov);
}

// onboard fisheye panel from the WebGL scene (throttled while playing)
// A cube capture renders the scene six times, so it runs at ~4 Hz while playing
// and once shortly after the timeline settles when paused.
let fisheyeTimer = null;
function camPanel(fs) {
  const now = performance.now();
  if (state.playing) {
    if (now - lastFisheye < 250) return;
  } else {
    clearTimeout(fisheyeTimer);
    fisheyeTimer = setTimeout(() => renderCamPanel(fs), 180);
    return;
  }
  renderCamPanel(fs);
}
function renderCamPanel(fs) {
  lastFisheye = performance.now();
  const ctx = $('ccam').getContext('2d');
  if (!gl.fisheyeTo(ctx, fs)) {
    const cv = $('ccam');
    cv.width = cv.height = 384;
    ctx.fillStyle = C.camBg; ctx.fillRect(0, 0, 384, 384);
    ctx.fillStyle = C.muted; ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(tr('statusNoData'), 16, 28);
  }
}

function drawSim() {
  const sc = scenarioById(state.scenarioId);
  const ov = $('overlayMsg');
  if (sc.evidence !== 'numerical' || !state.result) {
    ov.hidden = false;
    ov.innerHTML = '';
    const p = document.createElement('p');
    if (sc.evidence === 'pending') p.textContent = tr('pendingScenario');
    else if (sc.evidence === 'illustration') p.textContent = tr('illusScenario');
    else p.textContent = state.running ? tr('statusRunning') : state.inputErrors.length ? tr('statusInvalidInput') : tr('statusNoData');
    ov.append(p);
    if (sc.evidence === 'illustration') {
      const b = document.createElement('button');
      b.textContent = tr('openDemo');
      b.addEventListener('click', () => { const s = DEMO_STAGES.find((d) => d.key === sc.demoStage); state.demoT = s ? s.t0 : 0; setMode('demo'); });
      ov.append(b);
    }
    if (!gl) {
      const [ctx, W, H] = setupCanvas($('c3d'));
      ctx.fillStyle = C.sky; ctx.fillRect(0, 0, W, H);
    }
    drawCam({}, 180);
    $('camMeta').textContent = '';
    for (const cv of document.querySelectorAll('.plots canvas')) drawPlot(cv, PLOT_DEFS[+cv.dataset.i], null, 0, tr, seek);
    return;
  }
  ov.hidden = true;
  const res = state.result;
  const st = sampleAt(res, state.t);
  const c = res.columns;
  const trail = [];
  for (let k = Math.max(0, st.i - 150); k < st.i; k += 3) trail.push([c.kx[k], c.ky[k], c.kz[k]]);
  const markers = res.events.filter((e) => e.severity === 'invalid' && e.pos.length && e.t <= state.t).slice(0, 1)
    .map((e) => ({ pos: e.pos, text: `${pair(EVENT_TEXT[e.type])} @ ${e.t.toFixed(2)} s` }));
  let badge = null, badgeColor = null;
  if (state.stale) { badge = tr('statusStale'); badgeColor = C.warn; }
  else if (!st.valid) { badge = res.validUntil !== null && state.t >= res.validUntil ? tr('invalidAfter') : tr('scopeAfter'); }
  if (gl) {
    const i = st.i, dtS = res.sampleDt;
    const im = Math.max(0, i - 1), ip = Math.min(res.n - 1, i + 1);
    const P = res.effectiveInputs;
    const d = v3.len(v3.sub(st.kite, st.anchor));
    const fs = {
      mode: 'sim', t: state.t, tanS: st.tanS, reducedMotion: state.reducedMotion,
      skier: {
        pos: st.skierPos, heading: st.heading, speed: c.skierSpeed[i],
        lat: (c.sy[ip] - 2 * c.sy[i] + c.sy[im]) / (dtS * dtS) * (ip > i && im < i ? 1 : 0),
        accel: (c.skierSpeed[ip] - c.skierSpeed[im]) / ((ip - im || 1) * dtS),
        handOnCrank: c.Ldot[i] < -1e-4, crank: c.Ldot[i] < -1e-4, crankRate: Math.abs(c.Ldot[i]) * 14,
      },
      kite: {
        visible: true, pos: st.kite, air: st.air, anchor: st.anchor, cam: st.cam, span: 2 * st.halfSpan, fov: P.cameraFovDeg,
        slack: st.slack, slackLen: st.slack ? Math.max(0, c.L[i] - d) : 0, valid: st.valid, unavailable: st.unavailable,
      },
      trail: state.reducedMotion ? null : trail, wind: st.wind, marker: markers.length ? markers[0].pos : null,
      overlays: glOpts.overlays, camera: 'orbit', letterbox: false,
      trackKey: `${res.inputHash}:${Math.floor(i / 5)}`,
      trackPath: () => { const out = []; for (let k = 0; k <= i; k += 3) { let h = [c.sx[Math.min(res.n - 1, k + 1)] - c.sx[Math.max(0, k - 1)], c.sy[Math.min(res.n - 1, k + 1)] - c.sy[Math.max(0, k - 1)], 0]; if (v3.len(h) < 1e-6) h = [1, 0, 0]; out.push({ pos: [c.sx[k], c.sy[k], c.sz[k]], heading: v3.norm(h) }); } return out; },
      labels: markers.map((m) => ({ p: m.pos, text: m.text, color: '#ff8a80' })),
      hud: { evidence: evidenceOf()[1], tagColor: '#9cc8ff', sub: `${CONFIG.id} · ${MODEL.id}@${MODEL.version} · ${pair(SCENARIO_TEXT[state.scenarioId])} · t=${state.t.toFixed(2)} s`, warn: badge },
    };
    gl.frame(fs);
    camPanel(fs);
  } else {
    drawScene3D(st, { trail: state.reducedMotion ? null : trail, arrows: true, markers, badge, badgeColor });
    drawCam(st, res.effectiveInputs.cameraFovDeg);
  }
  const yn = (b) => (b ? tr('yes') : tr('no'));
  const sep = c.tetherHeadSep[st.i];
  $('camMeta').innerHTML = '';
  for (const [k2, v] of [['camFov', res.effectiveInputs.cameraFovDeg + '°'], ['camSubject', c.subjectAngle[st.i].toFixed(1) + '°'], ['camVisible', yn(c.subjectVisible[st.i] === 1)], ['camTetherHead', Number.isFinite(sep) ? sep.toFixed(1) + '°' : tr('unavailable')]]) {
    const a = document.createElement('span'); a.textContent = tr(k2);
    const b = document.createElement('span'); b.textContent = v;
    $('camMeta').append(a, b);
  }
  for (const cv of document.querySelectorAll('.plots canvas')) drawPlot(cv, PLOT_DEFS[+cv.dataset.i], res, state.t, tr, seek);
}

function drawGeometry() {
  $('overlayMsg').hidden = true;
  const P0 = { ...state.inputs };
  const tanS = Math.tan(P0.slopeDeg * Math.PI / 180);
  const pos = [0, 0, 0];
  const anchor = [-MODEL_CONSTANTS.anchorBack.v, 0, P0.anchorHeight];
  const el = 65 * Math.PI / 180;
  const kp = v3.add(anchor, [-Math.cos(el) * P0.tetherMax, 0, Math.sin(el) * P0.tetherMax]);
  const halfSpan = 0.5 * Math.sqrt(2 * P0.wingArea);
  const st = { skierPos: pos, heading: [1, 0, 0], anchor, kite: kp, cam: [kp[0], kp[1], kp[2] - P0.cameraDrop], air: [-1, 0, 0.2], halfSpan, tanS, valid: true };
  const tag = (src) => ` [${src}]`;
  if (gl) {
    const r = MODEL_CONSTANTS.bodyRadius.v, hb = MODEL_CONSTANTS.bodyHeight.v;
    const arc = [];
    for (let a = 0; a <= Math.PI + 1e-9; a += Math.PI / 24) arc.push(v3.add(anchor, [-Math.cos(a) * P0.prePayout, 0, Math.sin(a) * P0.prePayout]));
    const fs = {
      mode: 'geometry', t: 0, tanS,
      skier: { pos, heading: [1, 0, 0], speed: 0, lat: 0, crouch: 0.08 },
      kite: { visible: true, pos: kp, air: [-1, 0, 0.25], anchor, cam: st.cam, span: 2 * halfSpan, fov: P0.cameraFovDeg, valid: true },
      overlays: false, camera: 'geometry', geomTarget: [-0.7, 0, 1.7], letterbox: false,
      trackKey: 'geometry', trackPath: () => [],
      dims: [
        [[anchor[0], 0.45, -anchor[0] * tanS], [anchor[0], 0.45, anchor[2]]],
        arc,
        [[0, r, 0.2], [0, r, hb]], [[0, -r, 0.2], [0, -r, hb]],
        [v3.add(kp, [0, -halfSpan, 0.14]), v3.add(kp, [0, halfSpan, 0.14])],
      ],
      labels: [
        { p: [anchor[0], 0.45, anchor[2] * 0.5], text: `${pair(PARAM_TEXT.anchorHeight)} ${P0.anchorHeight} m${tag('ASSUMED')}`, color: '#ffd27a' },
        { p: v3.scale(v3.add(anchor, kp), 0.55), text: `${pair(PARAM_TEXT.tetherMax)} ${P0.tetherMax} m${tag('REQ')}`, color: '#8ef0b0' },
        { p: v3.add(anchor, [P0.prePayout * 0.71, 0, P0.prePayout * 0.71]), text: `${pair(PARAM_TEXT.prePayout)} ${P0.prePayout} m${tag('REQ')}`, color: '#8ef0b0' },
        { p: st.cam, text: `${pair(PARAM_TEXT.cameraDrop)} ${P0.cameraDrop} m · FOV ${P0.cameraFovDeg}°${tag('ASSUMED')}`, color: '#ffd27a' },
        { p: v3.add(kp, [0, halfSpan, 0.14]), text: `span ≈ ${(2 * halfSpan).toFixed(2)} m (${P0.wingArea} m², AR 2)${tag('ASSUMED')}`, color: '#ffd27a' },
        { p: [0, -r, 0.7], text: `body volume r=${r} m h=${hb} m${tag('ASSUMED')}`, color: '#cfd8e3' },
        { p: [0, -r, 0.35], text: `dock zone ${MODEL_CONSTANTS.dockZone.v} m${tag('ASSUMED')}`, color: '#cfd8e3' },
      ],
      hud: { evidence: tr('evGeometry'), tagColor: '#8ef0b0', sub: `${tr('geomTitle')} · ${CONFIG.id}` },
    };
    gl.frame(fs);
    camPanel(fs);
    $('camMeta').textContent = '';
    return;
  }
  drawScene3D(st, {
    dims: (ctx, P) => {
      // anchor height
      line(ctx, P, [anchor[0], 0.4, 0], [anchor[0], 0.4, anchor[2]], C.accent, 1, [3, 3]);
      label(ctx, P, [anchor[0], 0.4, anchor[2] / 2], `${pair(PARAM_TEXT.anchorHeight)} ${P0.anchorHeight} m${tag('ASSUMED')}`, C.accent, 8, 0);
      // tether
      label(ctx, P, v3.scale(v3.add(anchor, kp), 0.6), `${pair(PARAM_TEXT.tetherMax)} ${P0.tetherMax} m${tag('REQ')}`, C.good, 10, 4);
      // pre-payout arc
      const pts = [];
      for (let a = 0; a <= Math.PI; a += Math.PI / 24) pts.push(v3.add(anchor, [-Math.cos(a) * P0.prePayout, 0, Math.sin(a) * P0.prePayout]));
      for (let k = 1; k < pts.length; k++) line(ctx, P, pts[k - 1], pts[k], C.good, 1, [2, 3]);
      label(ctx, P, v3.add(anchor, [P0.prePayout * 0.7, 0, P0.prePayout * 0.7]), `${pair(PARAM_TEXT.prePayout)} ${P0.prePayout} m${tag('REQ')}`, C.good, 6, -2);
      // camera drop + wing span
      label(ctx, P, st.cam, `${pair(PARAM_TEXT.cameraDrop)} ${P0.cameraDrop} m · FOV ${P0.cameraFovDeg}°${tag('ASSUMED')}`, C.cam, 8, 14);
      line(ctx, P, v3.add(kp, [0, -halfSpan, 0.12]), v3.add(kp, [0, halfSpan, 0.12]), C.accent, 1);
      label(ctx, P, v3.add(kp, [0, halfSpan, 0.12]), `span ≈ ${(2 * halfSpan).toFixed(2)} m (${pair(PARAM_TEXT.wingArea)} ${P0.wingArea} m², AR 2)${tag('ASSUMED')}`, C.accent);
      // body volume
      const r = MODEL_CONSTANTS.bodyRadius.v, hb = MODEL_CONSTANTS.bodyHeight.v;
      for (const s of [-r, r]) line(ctx, P, [0, s, 0.2], [0, s, hb], C.muted, 1, [4, 3]);
      label(ctx, P, [0.3, -r, 0.6], `body volume r=${r} m h=${hb} m${tag('ASSUMED')}`, C.muted, 8, 0);
      // docking zone
      label(ctx, P, [0.3, -r, 0.25], `dock zone ${MODEL_CONSTANTS.dockZone.v} m${tag('ASSUMED')}`, C.muted, 8, 0);
    },
    badge: tr('geomTitle'), badgeColor: C.good,
  });
  drawCam(st, P0.cameraFovDeg);
  $('camMeta').textContent = '';
}

function drawDemo() {
  $('overlayMsg').hidden = true;
  const st = demoState(state.demoT);
  const stage = demoStage(state.demoT);
  if (gl) {
    const t = state.demoT;
    const note = lz(stage);
    const firstSentence = note.split(/(?<=[。.])\s*/)[0];
    const fs = {
      mode: 'demo', t, tanS: st.tanS, reducedMotion: state.reducedMotion,
      skier: {
        pos: st.pos, heading: st.heading, speed: st.speed, lat: st.lat, accel: st.accel,
        crouch: st.speed < 0.3 ? 0.08 : undefined,
        handL: st.pose.armL, handR: st.pose.armR, reachR: st.pose.reachR, handToLoop: st.pose.reachR > 0 && !st.handOnCrank,
        noPoles: st.pose.noPoles, plantL: st.plantL, plantR: st.plantR,
        handOnCrank: !!st.handOnCrank, crank: !!st.crank, crankRate: 9,
        boom: st.boom, pull: st.pullR, locked: st.locked,
      },
      kite: { visible: st.showKite, pos: st.kite, rel: st.rel, relDir: st.relDir, stowAtt: st.stowAtt, air: st.airflow, anchor: st.anchor, cam: st.cam, span: 0.71, fold: st.fold, tetherVisible: st.tetherVisible, fov: 180, valid: true },
      overlays: false, camera: glOpts.director && !state.reducedMotion ? 'director' : 'orbit', letterbox: glOpts.letterbox,
      trackKey: `demo:${Math.floor(t * 4)}`, trackPath: () => demoTrack(t),
      hud: {
        evidence: tr('evIllustration'), tagColor: '#ffd27a', banner: tr('demoBanner'),
        title: `${pair(STAGE_TEXT[stage.key])}${stage.pending ? ' ⧗' : ''}`, subtitle: firstSentence + (stage.pending ? (state.lang === 'zh' ? '（待验证）' : ' (pending verification)') : ''),
        titleAlpha: Math.min(1, (t - stage.t0) / 0.5) * Math.min(1, Math.max(0, (stage.t0 + 4 - t) / 0.6)),
        endCard: [tr('demoBanner'), tr('demoBanner2').split(/(?<=[；;])\s*/)[0]],
        endAlpha: Math.min(1, Math.max(0, (t - 56.5) / 1.2)),
        fisheyeNote: tr('camNote'),
      },
    };
    gl.frame(fs);
    camPanel(fs);
  } else {
    const sc = { ...st, skierPos: st.pos, air: st.airflow, valid: true };
    drawScene3D(sc, { badge: tr('demoBanner'), badgeColor: C.warn });
    drawCam(sc.showKite ? sc : {}, 180);
  }
  $('camMeta').textContent = '';
  $('demoText').textContent = (stage.pending ? '⧗ ' : '') + lz(stage) + (stage.pending ? (state.lang === 'zh' ? '（待验证）' : ' (pending verification)') : '');
}

let drawQueued = false;
function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}

function draw() {
  try {
    if (state.mode === 'sim') drawSim();
    else if (state.mode === 'geometry') drawGeometry();
    else if (state.mode === 'demo') drawDemo();
    updateTimeUI();
  } catch (err) { reportError(err); }
}

// ---------------------------------------------------------------- timeline
function duration() {
  if (state.mode === 'demo') return DEMO_DURATION;
  return state.result ? state.result.duration : 0;
}
function curT() { return state.mode === 'demo' ? state.demoT : state.t; }
function seek(t) {
  const d = duration();
  const v = Math.max(0, Math.min(d, t));
  if (state.mode === 'demo') state.demoT = v; else state.t = v;
  requestDraw();
}

function updateTimeUI() {
  const d = duration();
  $('seek').value = d ? Math.round((curT() / d) * 1000) : 0;
  $('seek').disabled = !d;
  $('playBtn').disabled = !d;
  $('timeOut').textContent = `${curT().toFixed(2)} / ${d.toFixed(1)} s`;
  $('playBtn').textContent = state.playing ? tr('pause') : tr('play');
  $('playBtn').setAttribute('aria-pressed', state.playing ? 'true' : 'false');
  // stage chips
  const chips = $('stageChips');
  const stages = state.mode === 'demo' ? DEMO_STAGES.map((s) => [s.t0, s.key, s.pending]) : (scenarioById(state.scenarioId).stages || []).map(([t0, key]) => [t0, key, false]);
  const t = curT();
  let cur = null;
  for (const s of stages) if (t >= s[0]) cur = s[1];
  if (chips.dataset.sig !== state.mode + state.scenarioId + state.lang) {
    chips.dataset.sig = state.mode + state.scenarioId + state.lang;
    chips.innerHTML = '';
    for (const [t0, key, pending] of stages) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.key = key;
      b.className = pending ? 'pending' : '';
      b.textContent = `${pair(STAGE_TEXT[key])} ${t0}s`;
      b.addEventListener('click', () => seek(t0 + 1e-6));
      chips.append(b);
    }
  }
  for (const b of chips.children) b.setAttribute('aria-current', b.dataset.key === cur ? 'true' : 'false');
  if (state.mode === 'demo') {
    for (const b of $('demoStageList').querySelectorAll('button')) b.setAttribute('aria-current', b.dataset.key === cur ? 'true' : 'false');
  }
}

let last = performance.now(), stepAcc = 0;
function tick(now) {
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing) {
    const d = duration();
    let adv = dtReal * state.speed;
    if (state.reducedMotion) {
      // reduced motion: discrete 0.5 s steps instead of continuous animation
      stepAcc += adv; adv = 0;
      if (stepAcc >= 0.5) { adv = 0.5; stepAcc = 0; }
    }
    if (adv > 0) {
      const t = curT() + adv;
      if (t >= d) { seek(d); state.playing = false; if (recording) toggleRecording(); } else seek(t);
    }
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- panels
function renderSummary() {
  const dl = $('summary');
  dl.innerHTML = '';
  const add = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); };
  if (state.mode === 'geometry') {
    add(tr('source'), 'REQ: ' + PARAMS.filter((p) => p.src === 'REQ').map((p) => pair(PARAM_TEXT[p.id])).join(', '));
    add('ASSUMED', String(PARAMS.filter((p) => p.src === 'ASSUMED' && p.supported !== false).length));
    return;
  }
  const res = state.result;
  if (!res || state.mode !== 'sim') return;
  const c = res.columns;
  const lim = res.validUntil ?? res.scopeEnd ?? res.duration;
  // extremum of a signal within the valid interval only; NaN (unavailable) skipped
  const extreme = (name, useMin) => {
    let best = null;
    for (let i = 0; i < res.n && c.t[i] <= lim; i++) {
      const v = c[name][i];
      if (Number.isFinite(v)) best = best === null ? v : useMin ? Math.min(best, v) : Math.max(best, v);
    }
    return best;
  };
  const maxT = extreme('T', false);
  const minC = extreme('clearance', true);
  const minH = extreme('height', true);
  const fmt = (v, u) => (v === null ? tr('unavailable') : `${v.toFixed(2)} ${u}`);
  const vNote = state.lang === 'zh' ? '（有效区间内）' : ' (within valid interval)';
  add(tr('validUntil'), res.validUntil === null ? (res.scopeEnd === null ? tr('allValid') : `${tr('scopeEnd')} ${res.scopeEnd} s`) : `${res.validUntil} s`);
  const firstInv = res.events.find((e) => e.severity === 'invalid');
  if (firstInv) add(tr('sumInvalidFirst'), `${pair(EVENT_TEXT[firstInv.type]) || firstInv.type} @ ${firstInv.t} s [${firstInv.pos.join(', ')}] m`);
  add(tr('sumPeakT') + vNote, fmt(maxT, 'N'));
  add(tr('sumMinClr') + vNote, fmt(minC, 'm'));
  add(tr('sumMinH') + vNote, fmt(minH, 'm'));
  add(tr('sumWork'), `${c.operatorWork[res.n - 1].toFixed(1)} J`);
  const ne = res.events.find((e) => e.type === 'near_end');
  add(tr('sumNearEnd'), ne ? `${ne.t} s` : '—');
  add('inputHash', res.inputHash);
  add(state.lang === 'zh' ? '来源' : 'Source', state.resultSource === 'reference' ? tr('matchReplay') : state.resultSource === 'imported' ? tr('importOk') : tr('computed'));
  const ovr = Object.entries(res.overrides || {});
  if (ovr.length) add(state.lang === 'zh' ? '工况固定参数' : 'Scenario overrides', ovr.map(([k2, v]) => `${k2}=${v}`).join(', '));
}

function renderEvents() {
  const ol = $('eventList');
  ol.innerHTML = '';
  const res = state.result;
  if (!res || state.mode !== 'sim') return;
  for (const e of res.events) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const sevKey = { info: 'sevInfo', warning: 'sevWarning', invalid: 'sevInvalid', scope: 'sevScope' }[e.severity];
    const icon = { info: 'ⓘ', warning: '⚠', invalid: '✖', scope: '◧' }[e.severity];
    const a = document.createElement('span'); a.textContent = `${e.t.toFixed(2)} s`;
    const s = document.createElement('span'); s.className = 'sev ' + e.severity; s.textContent = `${icon} ${tr(sevKey)}`;
    const d = document.createElement('span');
    const extra = e.detail && e.detail.T !== undefined ? ` ${e.detail.T} N` : e.detail && e.detail.airspeed !== undefined ? ` ${e.detail.airspeed} m/s` : '';
    d.textContent = (pair(EVENT_TEXT[e.type]) || e.type) + extra;
    b.title = (e.detail && e.detail.note ? e.detail.note + ' · ' : '') + (e.pos.length ? `[${e.pos.join(', ')}] m` : '');
    b.append(a, s, d);
    b.addEventListener('click', () => seek(e.t));
    li.append(b);
    ol.append(li);
  }
}

function renderValidity() {
  const el = $('validityNote');
  const res = state.result;
  if (state.mode !== 'sim' || !res) { el.hidden = true; return; }
  el.hidden = false;
  if (state.stale) { el.className = 'validity invalid'; el.textContent = tr('statusStale'); return; }
  if (res.validUntil !== null) { el.className = 'validity invalid'; el.textContent = `✖ ${tr('validUntil')} ${res.validUntil} s — ${tr('invalidAfter')}`; }
  else if (res.scopeEnd !== null) { el.className = 'validity scope'; el.textContent = `◧ ${tr('scopeEnd')} ${res.scopeEnd} s — ${tr('scopeAfter')}`; }
  else { el.className = 'validity ok'; el.textContent = `✓ ${tr('allValid')} (${MODEL.evidence})`; }
}

function renderLimits() {
  const ul = $('limitsList');
  ul.innerHTML = '';
  for (const l of MODEL.limits) { const li = document.createElement('li'); li.textContent = l; ul.append(li); }
  const tb = $('constTable');
  tb.innerHTML = '';
  for (const [k2, o] of Object.entries(MODEL_CONSTANTS)) {
    const tr2 = document.createElement('tr');
    for (const x of [k2, `${o.v} ${o.unit}`, o.src]) { const td = document.createElement('td'); td.textContent = x; tr2.append(td); }
    tb.append(tr2);
  }
}

function renderPlots() {
  const box = $('plots');
  if (box.children.length) return;
  PLOT_DEFS.forEach((d, i) => {
    const cv = document.createElement('canvas');
    cv.dataset.i = i;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', d.key);
    box.append(cv);
  });
}

function renderCompare() {
  const tb = $('compareTable');
  tb.innerHTML = '';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.append(document.createElement('th'));
  for (const c of CANDIDATES) {
    const th = document.createElement('th');
    th.textContent = `${lz(c)} — ${state.lang === 'zh' ? (c.product === 'mechanical' ? '纯机械' : '电子') : c.product}`;
    const st = document.createElement('div');
    st.className = 'note'; st.textContent = lz(c.status);
    th.append(st);
    hr.append(th);
  }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  for (const row of COMPARE_ROWS) {
    const r = document.createElement('tr');
    const th = document.createElement('th'); th.textContent = lz(row); r.append(th);
    for (const c of CANDIDATES) {
      const v = row.v[c.id];
      const td = document.createElement('td');
      td.className = 'k-' + v.kind;
      td.textContent = v.kind === 'unknown' ? (state.lang === 'zh' ? '未知' : 'unknown') : lz(v);
      r.append(td);
    }
    tbody.append(r);
  }
  tb.append(thead, tbody);
}

function renderDemoStages() {
  const ol = $('demoStageList');
  ol.innerHTML = '';
  for (const s of DEMO_STAGES) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.key = s.key;
    b.textContent = `${pair(STAGE_TEXT[s.key])}${s.pending ? ' ⧗' : ''} (${s.t0}–${s.t1}s)`;
    b.addEventListener('click', () => seek(s.t0 + 1e-6));
    li.append(b);
    ol.append(li);
  }
}

function setMode(m) {
  state.mode = m;
  state.playing = false;
  document.body.className = 'mode-' + m;
  for (const b of document.querySelectorAll('.modes button')) b.setAttribute('aria-selected', b.dataset.mode === m ? 'true' : 'false');
  $('demoStages').hidden = m !== 'demo';
  $('demoExplain').hidden = m !== 'demo';
  $('comparePanel').hidden = m !== 'compare';
  $('stageChips').dataset.sig = '';
  $('ovWrap').hidden = m !== 'sim';
  $('dirWrap').hidden = $('lbWrap').hidden = m !== 'demo';
  $('recBtn').hidden = m === 'geometry';
  if (gl) gl.followTarget = null; // re-frame the camera for the new mode
  renderAll();
}

function renderAll() {
  renderBanner();
  renderScenarios();
  renderSummary();
  renderEvents();
  renderValidity();
  renderLimits();
  renderPlots();
  if (state.mode === 'compare') renderCompare();
  if (state.mode === 'demo') renderDemoStages();
  const el = $('status');
  el.textContent = tr(state.statusKey) + (state.statusExtra ? ' — ' + state.statusExtra : '');
  requestDraw();
}

// ---------------------------------------------------------------- export (FE-12)
function download(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportConfig() {
  const sc = scenarioById(state.scenarioId);
  download(`flyski-config-${sc.id}.json`, 'application/json', JSON.stringify({
    schema: 'flyski-sim-config/1', config: CONFIG, model: { id: MODEL.id, version: MODEL.version, evidence: MODEL.evidence, limits: MODEL.limits },
    scenario: sc, inputs: state.inputs, effectiveInputs: effectiveInputs(sc, state.inputs),
    inputHash: sc.evidence === 'numerical' ? inputHash(sc, state.inputs) : null,
    params: PARAMS, constants: MODEL_CONSTANTS, exportedAt: new Date().toISOString(),
  }, null, 2));
}

function exportResult(kind) {
  const res = state.result;
  if (!res) { setStatus('statusNoData', 'stale'); return; }
  if (kind === 'csv') download(`flyski-result-${res.scenario}-${res.inputHash}.csv`, 'text/csv', resultToCSV(res));
  else download(`flyski-result-${res.scenario}-${res.inputHash}.json`, 'application/json', JSON.stringify(resultToJSON(res)));
}

async function importResult(file) {
  try {
    const obj = JSON.parse(await file.text());
    const res = resultFromJSON(obj);
    if (!scenarioById(res.scenario)) throw new Error('unknown scenario ' + res.scenario);
    state.scenarioId = res.scenario;
    renderParams();
    setResult(res, 'imported');
    if (state.stale) setStatus('importMismatch', 'stale');
  } catch (err) { setStatus('statusError', 'error', `${err.message} (${RESULT_SCHEMA})`); }
}

function snapshot() {
  const src = gl ? $('gl3d') : $('c3d');
  const out = document.createElement('canvas');
  const pad = 70;
  out.width = src.width; out.height = src.height + pad;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, pad);
  ctx.fillStyle = '#000'; ctx.font = `${Math.round(14 * (window.devicePixelRatio || 1))}px system-ui, sans-serif`;
  const [, evText] = evidenceOf();
  const lines = [
    `${tr('bannerEvidence')}: ${evText}`,
    `${CONFIG.id} · ${MODEL.id}@${MODEL.version} · ${state.mode === 'sim' ? `${state.scenarioId} t=${state.t.toFixed(2)}s ${state.result ? state.result.inputHash : ''}` : state.mode}`,
    state.mode === 'demo' ? tr('demoBanner') : `${tr('bannerPending')}: NOT_RUN`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 10, 20 + i * 20));
  out.toBlob((b) => {
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url; a.download = `flyski-snapshot-${state.mode}.png`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// ---------------------------------------------------------------- errors
function reportError(err) {
  console.error(err);
  setStatus('statusError', 'error', String(err && err.message ? err.message : err));
}
window.addEventListener('error', (e) => reportError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

// ---------------------------------------------------------------- wiring
function wire() {
  for (const b of document.querySelectorAll('.modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));
  $('langBtn').addEventListener('click', () => { state.lang = state.lang === 'zh' ? 'en' : 'zh'; renderParams(); applyI18n(); });
  $('reducedMotion').checked = state.reducedMotion;
  $('reducedMotion').addEventListener('change', (e) => { state.reducedMotion = e.target.checked; requestDraw(); });
  $('runBtn').addEventListener('click', runSim);
  $('cancelBtn').addEventListener('click', () => cancelSim(false));
  $('resetParams').addEventListener('click', () => { state.inputs = defaultInputs(); state.inputErrors = []; renderParams(); resolveResult($('autoRun').checked); });
  $('playBtn').addEventListener('click', () => {
    if (curT() >= duration() - 1e-6) seek(0);
    state.playing = !state.playing; last = performance.now(); updateTimeUI();
  });
  $('resetTime').addEventListener('click', () => { state.playing = false; seek(0); });
  $('speedSel').addEventListener('change', (e) => { state.speed = Number(e.target.value); });
  $('seek').addEventListener('input', (e) => seek((Number(e.target.value) / 1000) * duration()));
  $('expConfig').addEventListener('click', exportConfig);
  $('expResult').addEventListener('click', () => exportResult('json'));
  $('expCSV').addEventListener('click', () => exportResult('csv'));
  $('impResult').addEventListener('change', (e) => { if (e.target.files[0]) importResult(e.target.files[0]); e.target.value = ''; });
  $('snapBtn').addEventListener('click', snapshot);
  attachOrbit($('c3d'), activeOrbit, requestDraw);
  $('qualitySel').addEventListener('change', (e) => { glOpts.quality = e.target.value; try { localStorage.setItem('flyski.quality', glOpts.quality); } catch { /* ignore */ } if (gl) gl.setQuality(glOpts.quality); requestDraw(); });
  $('ovChk').addEventListener('change', (e) => { glOpts.overlays = e.target.checked; requestDraw(); });
  $('dirChk').addEventListener('change', (e) => { glOpts.director = e.target.checked; requestDraw(); });
  $('lbChk').addEventListener('change', (e) => { glOpts.letterbox = e.target.checked; requestDraw(); });
  $('cinemaBtn').addEventListener('click', () => { const f = $('gl3d').closest('figure'); if (document.fullscreenElement) document.exitFullscreen(); else f.requestFullscreen?.().catch(() => {}); });
  document.addEventListener('fullscreenchange', () => setTimeout(requestDraw, 50));
  $('recBtn').addEventListener('click', toggleRecording);
  window.addEventListener('resize', requestDraw);
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.id === 'c3d' || e.target.id === 'gl3d') return;
    if (e.key === ' ' && tag !== 'button') { e.preventDefault(); $('playBtn').click(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(curT() + (e.shiftKey ? 1 : 0.1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(curT() - (e.shiftKey ? 1 : 0.1)); }
    else if (e.key === 'Home') { e.preventDefault(); seek(0); }
    else if (e.key === '[' || e.key === ']') {
      const sel = $('speedSel');
      sel.selectedIndex = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + (e.key === ']' ? 1 : -1)));
      state.speed = Number(sel.value);
    }
  });
}

async function initGL() {
  try {
    const mod = await import('./render/gl.js');
    if (!mod.GLView.supported()) throw new Error('webgl2 unavailable');
    try { const q = localStorage.getItem('flyski.quality'); if (mod.QUALITIES.includes(q)) glOpts.quality = q; } catch { /* storage blocked */ }
    if (new URLSearchParams(location.search).get('quality')) glOpts.quality = new URLSearchParams(location.search).get('quality');
    $('gl3d').hidden = false;
    gl = await mod.GLView.create($('gl3d'), glOpts.quality);
    gl.onUserCamera = requestDraw;
    $('c3d').hidden = true;
    $('glTools').hidden = false;
    $('qualitySel').value = glOpts.quality;
  } catch (err) {
    console.warn('WebGL view unavailable, using 2D fallback:', err);
    gl = null;
    $('gl3d').hidden = true;
    $('c3d').hidden = false;
    setStatus('glFallback', 'stale');
  }
}

let recording = false;
async function toggleRecording() {
  if (!gl) return;
  const btn = $('recBtn');
  if (!recording) {
    try { gl.startRecording(30); } catch (err) { setStatus('statusError', 'error', err.message); return; }
    recording = true;
    btn.classList.add('recording'); btn.textContent = tr('stopRecord');
    if (curT() >= duration() - 0.05 || state.mode === 'demo') seek(0);
    state.playing = true; last = performance.now();
  } else {
    recording = false;
    state.playing = false;
    btn.classList.remove('recording'); btn.textContent = tr('record');
    const blob = await gl.stopRecording();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `flyski-${state.mode}-${state.mode === 'sim' ? state.scenarioId : 'cycle'}.webm`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }
}

async function init() {
  readColors();
  await initGL();
  wire();
  setMode('sim');
  renderParams();
  applyI18n();
  setStatus('loading');
  await loadReferences();
  selectScenario(state.scenarioId);
  requestAnimationFrame(tick);
}

init().catch(reportError);
