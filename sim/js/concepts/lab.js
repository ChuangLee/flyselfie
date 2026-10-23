// Concept lab controller (SIM-030): runs registered concepts on the shared
// skier/wind/footage models, plays their results in the WebGL view with the
// product-camera inset, shows metrics, events and plots, and plays each
// concept's cinematic demonstration. Evidence: numerical-uncalibrated
// simulation and illustration; nothing here is a physical test.
import * as THREE from 'three';
import { CONCEPTS, conceptById } from './index.js';
import { drawPlot } from '../ui/plots.js';

const $ = (id) => document.getElementById(id);
const T = {
  zh: {
    title: 'FlySkiSelfie 方案实验室', sub: 'SIM-030 · 多方案自助跟拍：同一滑雪者、风场与画面口径下的仿真测试与演示',
    modeTest: '仿真测试', modeDemo: '演示动画', modeCompare: '方案比较', back: '← L1 仿真环境', lang: 'English',
    evidence: '证据等级', model: '模型', boundary: '所有结果为未经实测校准的数值仿真或工程示意，不是实物测试；画面内嵌窗为产品相机几何视图，不代表真实画质。G-MATURE 关口未通过。',
    concepts: '方案', scenarios: '测试工况', params: '参数', run: '计算', reset: '恢复默认', limits: '模型不包含',
    quality: '画质', director: '导演机位', pip: '产品相机窗', record: '录制视频', stopRecord: '停止录制', restart: '回到起点',
    play: '播放', pause: '暂停', metrics: '指标与判据', events: '事件', about: '方案说明',
    evNum: '数值仿真（未校准）', evDemo: '工程示意——非数值结果', demoBanner: '工程设计演示——待实物测试',
    compareNote: '各方案在其“标准”工况下的统一指标；“—”表示该方案模型未提供。比较只反映模型与假设，不是实测排名。',
    computing: '计算中…', done: '完成', ms: '耗时', invalidAfter: '模型有效至', noGL: '需要 WebGL2 才能显示三维视图。', pending: '待验证',
    pass: '通过', fail: '未通过', na: '—', criterion: '判据',
  },
  en: {
    title: 'FlySkiSelfie Concept Lab', sub: 'SIM-030 · Solo follow-filming concepts: simulation tests and demos on one skier, wind and footage basis',
    modeTest: 'Simulation tests', modeDemo: 'Demonstration', modeCompare: 'Compare', back: '← L1 simulator', lang: '中文',
    evidence: 'Evidence', model: 'Model', boundary: 'All results are uncalibrated numerical simulation or engineering illustration, not physical tests. The in-frame inset is the product camera’s geometric view, not real image quality. G-MATURE gate closed.',
    concepts: 'Concepts', scenarios: 'Test scenarios', params: 'Parameters', run: 'Run', reset: 'Defaults', limits: 'Not modelled',
    quality: 'Quality', director: 'Director camera', pip: 'Product-camera inset', record: 'Record video', stopRecord: 'Stop recording', restart: 'Restart',
    play: 'Play', pause: 'Pause', metrics: 'Metrics & criteria', events: 'Events', about: 'About this concept',
    evNum: 'Numerical simulation (uncalibrated)', evDemo: 'Engineering illustration — not a numerical result', demoBanner: 'Engineering design demonstration — physical testing pending',
    compareNote: 'Common metrics of each concept in its “nominal” scenario; “—” = not provided by that model. Reflects models and assumptions, not a measured ranking.',
    computing: 'Computing…', done: 'Done', ms: 'time', invalidAfter: 'Model valid until', noGL: 'WebGL2 is required for the 3D view.', pending: 'pending verification',
    pass: 'pass', fail: 'fail', na: '—', criterion: 'Criterion',
  },
};
const state = { lang: 'zh', mode: 'test', conceptId: null, scenarioId: null, params: {}, result: null, t: 0, playing: false, speed: 1, quality: 'high', director: true, pip: true };
try { const q = new URLSearchParams(location.search); if (q.get('quality')) state.quality = q.get('quality'); if (q.get('lang') === 'en') state.lang = 'en'; } catch { /* ignore */ }
const tr = (k) => T[state.lang][k] ?? k;
const lz = (o) => (o ? o[state.lang] ?? o.zh ?? '' : '');
let gl = null;
const gears = {};
const shotFns = {};

function concept() { return conceptById(state.conceptId); }
function scenario() { const c = concept(); return c.scenarios.find((s) => s.id === state.scenarioId) || c.scenarios[0]; }

function applyI18n() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = tr(el.dataset.t);
  $('langBtn').textContent = tr('lang');
}

function setStatus(text, cls = '') { const s = $('status'); s.textContent = text; s.className = 'status ' + cls; }

// ---------------------------------------------------------------- lists & forms
function renderConcepts() {
  const ul = $('conceptList'); ul.innerHTML = '';
  for (const c of CONCEPTS) {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button';
    b.setAttribute('aria-current', c.id === state.conceptId ? 'true' : 'false');
    b.innerHTML = `<b></b><span></span><em class="fam"></em>`;
    b.querySelector('b').textContent = lz(c.name);
    b.querySelector('span').textContent = lz(c.tagline);
    b.querySelector('em').textContent = c.family;
    b.addEventListener('click', () => selectConcept(c.id));
    li.append(b); ul.append(li);
  }
}
function renderScenarios() {
  const ul = $('scenarioList'); ul.innerHTML = '';
  for (const s of concept().scenarios) {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = lz(s);
    b.setAttribute('aria-current', s.id === scenario().id ? 'true' : 'false');
    b.addEventListener('click', () => { state.scenarioId = s.id; renderScenarios(); compute(); });
    li.append(b); ul.append(li);
  }
}
function renderParams() {
  const f = $('paramForm'); f.innerHTML = '';
  for (const p of concept().params) {
    const d = document.createElement('div'); d.className = 'prm';
    const id = 'p_' + p.id;
    d.innerHTML = `<label for="${id}"></label><input id="${id}" type="number" inputmode="decimal"><div class="meta"><span class="src ${p.src}">${p.src}</span> · ${p.unit || ''} · [${p.min}, ${p.max}]</div>`;
    d.querySelector('label').textContent = lz(p);
    const inp = d.querySelector('input');
    inp.value = state.params[p.id]; inp.min = p.min; inp.max = p.max; inp.step = p.step ?? 'any';
    if (p.note) d.title = p.note;
    inp.addEventListener('change', () => {
      const v = Number(inp.value);
      const ok = Number.isFinite(v) && v >= p.min && v <= p.max;
      inp.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (ok) { state.params[p.id] = v; compute(); }
    });
    f.append(d);
  }
  const ul = $('limitsList'); ul.innerHTML = '';
  for (const l of concept().modelLimits || []) { const li = document.createElement('li'); li.textContent = lz(l); ul.append(li); }
  $('conceptAbout').textContent = lz(concept().about || concept().tagline);
}
function defaults(c) { const o = {}; for (const p of c.params) o[p.id] = p.v; return o; }

function selectConcept(id) {
  state.conceptId = id;
  state.params = defaults(concept());
  state.scenarioId = concept().scenarios[0]?.id;
  try { history.replaceState(null, '', `?c=${id}&m=${state.mode}${state.quality !== 'high' ? '&quality=' + state.quality : ''}`); } catch { /* file:// */ }
  renderConcepts(); renderScenarios(); renderParams();
  compute();
}

// ---------------------------------------------------------------- compute
function compute() {
  const c = concept();
  setStatus(tr('computing'));
  const t0 = performance.now();
  try {
    state.result = state.mode === 'demo' ? c.demo.build({ ...state.params }) : c.simulate({ ...state.params }, scenario());
  } catch (err) { console.error(err); setStatus(String(err.message || err), 'error'); state.result = null; return; }
  const ms = performance.now() - t0;
  setStatus(`${tr('done')} · ${tr('ms')} ${ms.toFixed(0)} ms · ${state.result.modelVersion}`, 'ok');
  state.t = Math.min(state.t, state.result.duration);
  if (state.mode === 'demo') state.t = 0;
  $('bnEvidence').textContent = state.mode === 'demo' ? tr('evDemo') : tr('evNum');
  $('bnEvidence').className = 'ev-tag ' + (state.mode === 'demo' ? 'illustration' : 'numerical');
  $('bnModel').textContent = `${state.result.modelVersion} · ${lz(c.name)}`;
  ensureGear(c).then(() => requestDraw());
  renderMetrics(); renderEvents(); renderPlots(); renderStages();
}

async function ensureGear(c) {
  if (!gl || gears[c.id]) return;
  const mod = await c.gear();
  gears[c.id] = mod.createGear(gl.scene, THREE);
  if (mod.shots) shotFns[c.id] = mod.shots;
}

// ---------------------------------------------------------------- side panels
const fmt = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)) : '—');
function renderMetrics() {
  const tb = $('metricsTable'); tb.innerHTML = '';
  const R = state.result; if (!R) return;
  for (const m of R.metrics) {
    const tr2 = document.createElement('tr');
    const verdict = m.pass === true ? `<span class="pass">✔ ${tr('pass')}</span>` : m.pass === false ? `<span class="fail">✖ ${tr('fail')}</span>` : '<span class="na">·</span>';
    tr2.innerHTML = `<td></td><td class="v"></td><td>${verdict}</td>`;
    tr2.children[0].textContent = lz(m) + (m.criterion ? ` (${lz(m.criterion)})` : '');
    tr2.children[1].textContent = `${typeof m.value === 'number' ? fmt(m.value) : m.value} ${m.unit || ''}`;
    tb.append(tr2);
  }
}
function renderEvents() {
  const ol = $('eventList'); ol.innerHTML = '';
  const R = state.result; if (!R) return;
  for (const e of R.events) {
    const li = document.createElement('li'); li.className = e.severity;
    li.textContent = `${e.t.toFixed(2)} s · ${lz(e)}`;
    li.addEventListener('click', () => seek(e.t));
    ol.append(li);
  }
}
let plotCanvases = [];
function renderPlots() {
  const box = $('plots'); box.innerHTML = ''; plotCanvases = [];
  const R = state.result; if (!R || state.mode === 'demo') return;
  for (const p of R.plots) {
    const cv = document.createElement('canvas');
    box.append(cv);
    plotCanvases.push([cv, { key: lz(p), series: p.series.map((s) => [s[0], s[1]]), color: ['--c1', '--c2', '--c3', '--c4'], labels: p.series.map((s) => (state.lang === 'zh' ? s[2] : s[3])) }]);
  }
  drawPlots();
}
function drawPlots() {
  const R = state.result; if (!R) return;
  for (const [cv, def] of plotCanvases) drawPlot(cv, def, R, state.t, (k) => k, seek);
}
function stageAt(t) { const st = concept().demo.stages; return st.find((s) => t >= s.t0 && t < s.t1) || st[st.length - 1]; }
function renderStages() {
  const box = $('stageChips'); box.innerHTML = '';
  if (state.mode !== 'demo') { $('stageText').textContent = lz(scenario().expect) || ''; return; }
  for (const s of concept().demo.stages) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.key = s.key;
    b.className = s.pending ? 'pending' : '';
    b.textContent = `${s.title ? lz(s.title) : s.key} ${s.t0}s`;
    b.addEventListener('click', () => seek(s.t0 + 1e-6));
    box.append(b);
  }
}

// ---------------------------------------------------------------- generic director
// used when a concept supplies no shot list: chase, side track, low front, heli orbit
function genericShots(t, st3) {
  const k = (t % 6) / 6, i = Math.floor(t / 6) % 4;
  const P = st3.pos, F = st3.fwd, L = st3.left, UP = new THREE.Vector3(0, 1, 0);
  const at = (f, l, u) => P.clone().addScaledVector(F, f).addScaledVector(L, l).addScaledVector(UP, u);
  const tgt = at(0, 0, 1.2);
  if (i === 0) return { pos: at(-7 + k, 2.2, 3.2), target: at(4, 0, 0.8), fov: 42, shot: 'chase' };
  if (i === 1) return { pos: at(1 - 2 * k, -6.5, 1.4), target: tgt, fov: 34, dof: { focus: 6.5, aperture: 0.0012 }, shot: 'side' };
  if (i === 2) return { pos: at(9 - 3 * k, 1.5, 0.4), target: tgt, fov: 30, dof: { focus: 8, aperture: 0.0015 }, shot: 'front' };
  const a = 2.4 + k * 1.6;
  return { pos: P.clone().addScaledVector(F, Math.cos(a) * 8).addScaledVector(L, Math.sin(a) * 8).addScaledVector(UP, 3), target: tgt, fov: 44, shot: 'orbit' };
}

// ---------------------------------------------------------------- draw
let drawQueued = false;
function requestDraw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); }
function draw() {
  updateTimeUI();
  drawPlots();
  const R = state.result;
  if (!gl || !R || state.mode === 'compare') return;
  const c = concept();
  const fr = R.frame(state.t);
  const gear = gears[c.id];
  const demo = state.mode === 'demo';
  const stage = demo ? stageAt(state.t) : null;
  if (demo) $('stageText').textContent = (stage.pending ? '⧗ ' : '') + lz(stage) + (stage.pending ? `（${tr('pending')}）` : '');
  const invalid = R.validUntil != null && state.t > R.validUntil;
  const sk = fr.skier;
  const fs = {
    mode: 'demo', t: state.t, tanS: fr.tanS, reducedMotion: false,
    skier: { ...sk, handOnCrank: false, crank: false },
    kite: null, gear, device: fr.device, overlays: false,
    camera: state.director ? 'director' : 'orbit', letterbox: demo,
    shots: state.director ? (shotFns[c.id] ? (t, st3, f) => shotFns[c.id](t, st3, { frame: fr, mode: state.mode, result: R, THREE }) || genericShots(t, st3) : genericShots) : null,
    trackKey: `${c.id}:${state.mode}:${scenario().id}:${Math.floor(state.t * 4)}`,
    trackPath: () => { const out = []; for (let tt = 0; tt <= state.t; tt += 0.2) { const f2 = R.frame(tt); out.push({ pos: f2.skier.pos, heading: f2.skier.heading }); } return out; },
    labels: fr.labels || [],
    pip: state.pip && fr.productCam ? { ...fr.productCam, hide: gear ? gear.hideInPip : [] } : null,
    hud: {
      evidence: demo ? tr('evDemo') : tr('evNum'), tagColor: demo ? '#ffd27a' : '#9cc8ff',
      banner: demo ? tr('demoBanner') : '',
      title: demo ? (stage.title ? lz(stage.title) : lz(c.name)) + (stage.pending ? ' ⧗' : '') : lz(c.name),
      subtitle: demo ? lz(stage).split(/(?<=[。.])\s*/)[0] : lz(scenario()),
      titleAlpha: demo ? Math.min(1, (state.t - stage.t0) / 0.5) * Math.min(1, Math.max(0, (stage.t0 + 4.5 - state.t) / 0.6)) : 1,
      warn: invalid ? `${tr('invalidAfter')} ${R.validUntil.toFixed(2)} s` : '',
      endCard: demo ? [lz(c.name), tr('demoBanner')] : null, endAlpha: demo ? Math.min(1, Math.max(0, (state.t - (R.duration - 2.5)) / 1.2)) : 0,
    },
  };
  gl.frame(fs);
}

// ---------------------------------------------------------------- timeline
function duration() { return state.result ? state.result.duration : 0; }
function seek(t) { state.t = Math.max(0, Math.min(duration(), t)); requestDraw(); }
function updateTimeUI() {
  const d = duration();
  $('seek').value = d ? Math.round((state.t / d) * 1000) : 0;
  $('timeOut').textContent = `${state.t.toFixed(2)} / ${d.toFixed(1)} s`;
  $('playBtn').textContent = state.playing ? tr('pause') : tr('play');
  if (state.mode === 'demo') {
    const cur = stageAt(state.t).key;
    for (const b of $('stageChips').children) b.setAttribute('aria-current', b.dataset.key === cur ? 'true' : 'false');
  }
}
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (state.playing) {
    state.t += dt * state.speed;
    if (state.t >= duration()) { state.t = duration(); state.playing = false; }
    draw();
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- compare
function renderCompare() {
  const ids = ['avail', 'pxMed', 'jitterRms', 'azRange', 'addedMass', 'bodyForcePeak', 'handsBusy', 'setupTime', 'ops', 'keMax', 'endurance'];
  const rows = [];
  const names = {};
  for (const c of CONCEPTS) {
    let R = null;
    const sc = c.scenarios.find((s) => s.id === 'nominal') || c.scenarios[0];
    try { R = c.simulate(defaults(c), sc); } catch (err) { console.error(err); }
    const byId = {};
    for (const m of R ? R.metrics : []) { byId[m.id] = m; names[m.id] = names[m.id] || m; }
    rows.push([c, byId]);
  }
  const tb = $('compareTable'); tb.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = '<th></th>' + rows.map(([c]) => '<th></th>').join('');
  head.children[0].textContent = state.lang === 'zh' ? '指标' : 'Metric';
  rows.forEach(([c], i) => { head.children[i + 1].textContent = lz(c.name); });
  tb.append(head);
  for (const id of ids) {
    if (!names[id]) continue;
    const r = document.createElement('tr');
    r.innerHTML = '<th></th>' + rows.map(() => '<td></td>').join('');
    r.children[0].textContent = `${lz(names[id])}${names[id].unit ? ' [' + names[id].unit + ']' : ''}`;
    rows.forEach(([, byId], i) => {
      const m = byId[id];
      const td = r.children[i + 1];
      if (!m) { td.textContent = '—'; return; }
      td.textContent = typeof m.value === 'number' ? fmt(m.value) : m.value;
      if (m.pass === true) td.className = 'pass'; else if (m.pass === false) td.className = 'fail';
    });
    tb.append(r);
  }
}

// ---------------------------------------------------------------- mode, wiring
function setMode(m) {
  state.mode = m;
  state.playing = false;
  document.body.classList.toggle('m-compare', m === 'compare');
  for (const b of document.querySelectorAll('.modes button')) b.setAttribute('aria-selected', b.dataset.mode === m ? 'true' : 'false');
  $('comparePanel').hidden = m !== 'compare';
  $('scenPanel').hidden = m !== 'test';
  try { history.replaceState(null, '', `?c=${state.conceptId}&m=${m}${state.quality !== 'high' ? '&quality=' + state.quality : ''}`); } catch { /* ignore */ }
  if (m === 'compare') {
    $('bnEvidence').textContent = tr('evNum'); $('bnEvidence').className = 'ev-tag numerical';
    $('bnModel').textContent = CONCEPTS.map((c) => c.modelVersion).join(' · ');
    renderCompare(); return;
  }
  compute();
}

let recording = false;
async function toggleRecording() {
  if (!gl) return;
  const btn = $('recBtn');
  if (!recording) {
    try { gl.startRecording(30); } catch (err) { setStatus(err.message, 'error'); return; }
    recording = true; btn.textContent = tr('stopRecord'); btn.classList.add('recording');
    seek(0); state.playing = true; last = performance.now();
  } else {
    recording = false; state.playing = false; btn.textContent = tr('record'); btn.classList.remove('recording');
    const blob = await gl.stopRecording();
    if (blob) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `flyski-${state.conceptId}-${state.mode}.webm`; document.body.append(a); a.click(); a.remove();
    }
  }
}

function wire() {
  for (const b of document.querySelectorAll('.modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));
  $('langBtn').addEventListener('click', () => { state.lang = state.lang === 'zh' ? 'en' : 'zh'; applyI18n(); renderConcepts(); renderScenarios(); renderParams(); renderMetrics(); renderEvents(); renderPlots(); renderStages(); if (state.mode === 'compare') renderCompare(); requestDraw(); });
  $('runBtn').addEventListener('click', compute);
  $('resetBtn').addEventListener('click', () => { state.params = defaults(concept()); renderParams(); compute(); });
  $('playBtn').addEventListener('click', () => { if (state.t >= duration() - 1e-3) state.t = 0; state.playing = !state.playing; last = performance.now(); updateTimeUI(); });
  $('resetTime').addEventListener('click', () => seek(0));
  $('speedSel').addEventListener('change', () => { state.speed = Number($('speedSel').value); });
  $('seek').addEventListener('input', () => seek((Number($('seek').value) / 1000) * duration()));
  $('dirChk').addEventListener('change', () => { state.director = $('dirChk').checked; requestDraw(); });
  $('pipChk').addEventListener('change', () => { state.pip = $('pipChk').checked; requestDraw(); });
  $('qualitySel').addEventListener('change', () => { state.quality = $('qualitySel').value; if (gl) gl.setQuality(state.quality); requestDraw(); });
  $('recBtn').addEventListener('click', toggleRecording);
  window.addEventListener('resize', requestDraw);
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select') return;
    if (e.key === ' ') { e.preventDefault(); $('playBtn').click(); }
    else if (e.key === 'ArrowRight') seek(state.t + (e.shiftKey ? 1 : 0.1));
    else if (e.key === 'ArrowLeft') seek(state.t - (e.shiftKey ? 1 : 0.1));
  });
}

async function init() {
  applyI18n();
  wire();
  $('qualitySel').value = state.quality;
  try {
    const mod = await import('../render/gl.js');
    if (!mod.GLView.supported()) throw new Error('webgl2');
    gl = await mod.GLView.create($('gl3d'), state.quality);
    gl.onUserCamera = requestDraw;
  } catch (err) {
    console.warn('WebGL unavailable', err);
    $('overlayMsg').hidden = false; $('overlayMsg').textContent = tr('noGL');
  }
  const q = new URLSearchParams(location.search);
  state.conceptId = conceptById(q.get('c')) ? q.get('c') : CONCEPTS[0].id;
  state.mode = ['test', 'demo', 'compare'].includes(q.get('m')) ? q.get('m') : 'test';
  state.params = defaults(concept());
  state.scenarioId = concept().scenarios[0]?.id;
  renderConcepts(); renderScenarios(); renderParams();
  setMode(state.mode);
  requestAnimationFrame(tick);
  window.__lab = { state, seek, setMode, selectConcept, compute }; // test hook (headless checks)
}
init().catch((e) => { console.error(e); setStatus(String(e), 'error'); });
