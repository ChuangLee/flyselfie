// SledPack concept film — typography layer. Deterministic: window.__ov.seek(t, anchors)
// draws the overlay for time t; anchors are the projected callout points from the 3D
// layer (main.js). Copy comes from research/sledpack_2026_10_21/video/copy.json via
// window.__ov.setCopy(copy, lang). The honesty tag is drawn on every frame.
import { sectionAt, SECTIONS, systemState, EV, smooth } from './timeline.js';

const $ = (s) => document.querySelector(s);
let C = null, lang = 'en';
const tx = (o) => (o ? (o[lang] ?? o.en ?? '') : '');
const fade = (t, a, b, fin = 0.6, fout = 0.6) => Math.min(smooth(a, a + fin, t), 1 - smooth(b - fout, b, t));
const sec = (k) => SECTIONS.find((s) => s.key === k);

// callout label offsets (px) relative to the anchor, per key
const OFF = {
  reel: [-330, -70], battery: [-330, 30], folded: [190, -40], mouth: [170, 70], sensor: [-300, -90],
  mainMid: [-480, -40], depMid: [80, 90], kite: [-470, -10], pack: [-380, 40],
};
const CALLOUTS = {
  xray: { keys: ['reel', 'battery', 'folded', 'mouth'], t0: 13.4, step: 0.45, t1: 17.6 },
  how: { keys: ['pack', 'mainMid', 'depMid', 'kite'], t0: 40.6, step: 0.7, t1: 46.6 },
};

function setCopy(copy, l) {
  C = copy; lang = l;
  document.body.className = l;
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  $('#tag').textContent = tx(C.tag);
  const S = C.sections;
  $('#hero h1').textContent = tx(S.hero.title); $('#hero p').textContent = tx(S.hero.sub);
  for (const el of document.querySelectorAll('#hud .k')) el.textContent = tx(S.sense.hud[el.dataset.k]);
  $('#hud .note').textContent = tx(S.sense.hud.note);
  $('#onboard .lab').textContent = tx(S.onboard.label);
  $('#facts h3').textContent = tx(S.facts.title);
  $('#facts .grid').innerHTML = S.facts.items.map((it) => `<div class="it"><div class="val">${it.value}<i>${it.unit}</i></div><div class="lb">${tx(it.label)}</div><span class="sim ${it.tag || 'sim'}">${tx((S.facts.tags || {})[it.tag || 'sim']) || (lang === 'zh' ? '仿真' : 'SIMULATED')}</span></div>`).join('');
  $('#facts .foot').textContent = tx(S.facts.footnote);
  $('#facts .dev h4').textContent = tx(S.facts.dev.title);
  $('#facts .dev ul').innerHTML = S.facts.dev.items.map((it) => `<li>${tx(it)}</li>`).join('');
  $('#end h1').textContent = tx(S.end.title); $('#end .sub').textContent = tx(S.end.sub); $('#end .disc').textContent = tx(S.end.disclaimer);
}

function lowerThird(t) {
  const s = sectionAt(t);
  const S = C.sections[s.key] || {};
  const skip = ['hero', 'facts', 'end'];
  const el = $('#lower');
  if (skip.includes(s.key)) { el.style.opacity = 0; return; }
  const title = s.key === 'onboard' ? '' : tx(S.title);
  const sub = tx(S.sub);
  el.querySelector('h2').textContent = title;
  el.querySelector('p').textContent = sub;
  el.style.opacity = fade(t, s.t0 + 0.3, s.t1 - 0.1, 0.7, 0.5);
}

function callouts(t, anchors) {
  const svg = $('#callouts'), labs = $('#labels');
  let svgHtml = '', labHtml = '';
  for (const [k, cfg] of Object.entries(CALLOUTS)) {
    if (t < cfg.t0 - 0.1 || t > cfg.t1 + 0.1) continue;
    const S = C.sections[k].callouts;
    cfg.keys.forEach((key, i) => {
      const a = anchors && anchors[key];
      if (!a) return;
      const ti = cfg.t0 + i * cfg.step;
      const grow = smooth(ti, ti + 0.45, t) * (1 - smooth(cfg.t1 - 0.4, cfg.t1, t));
      if (grow <= 0.001) return;
      const [dx, dy] = OFF[key];
      const ex = a[0] + dx * grow, ey = a[1] + dy * grow;
      svgHtml += `<circle class="ring" cx="${a[0]}" cy="${a[1]}" r="${(9 * grow).toFixed(1)}" opacity="${grow}"/><circle class="dot" cx="${a[0]}" cy="${a[1]}" r="3.2" opacity="${grow}"/>`;
      svgHtml += `<line x1="${a[0]}" y1="${a[1]}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" opacity="${grow}"/>`;
      const la = smooth(ti + 0.3, ti + 0.7, t) * (1 - smooth(cfg.t1 - 0.4, cfg.t1, t));
      const left = dx < 0;
      labHtml += `<div class="lab" style="opacity:${la.toFixed(3)};top:${(ey - 20).toFixed(0)}px;${left ? `right:${(1920 - ex + 6).toFixed(0)}px` : `left:${(ex + 6).toFixed(0)}px`}">${tx(S[key])}</div>`;
    });
  }
  svg.innerHTML = svgHtml; labs.innerHTML = labHtml;
}

const MODES_A = ['DOCKED', 'ARMED', 'LAUNCH', 'FILMING'];
const MODES_B = ['FILMING', 'DEPOWER', 'RETRIEVE', 'DOCKING', 'DOCKED · CHARGING'];
function hud(t) {
  const el = $('#hud');
  const a = fade(t, 18.2, 31.5, 0.6, 0.6), b = fade(t, 46.4, 58.4, 0.6, 0.6);
  const op = Math.max(a, b) * (t > sec('onboard').t0 && t < sec('onboard').t1 ? 0 : 1);
  el.style.opacity = op.toFixed(3);
  if (op < 0.01) return;
  const st = systemState(t);
  const list = a >= b ? MODES_A : MODES_B;
  const H = C.sections.sense.hud.modes;
  el.querySelector('.modes').innerHTML = list.map((m) => {
    const on = st.mode === m;
    const cls = on ? (m === 'LAUNCH' ? 'on go' : m === 'ARMED' || m === 'DEPOWER' ? 'on amber' : m.startsWith('DOCKED ·') ? 'on blue' : 'on') : '';
    return `<span class="${cls}">${tx(H[m])}</span>`;
  }).join('');
  $('#vSpeed').textContent = st.speed.toFixed(1);
  $('#vWind').textContent = st.apparent.toFixed(1);
  $('#vLine').textContent = st.line.toFixed(1);
  $('#bWind').style.width = `${Math.min(100, (st.apparent / 15) * 100).toFixed(1)}%`;
}

function seek(t, anchors) {
  if (!C) return;
  // honesty tag + mark: always on (dimmed slightly only under the end card)
  $('#tag').style.opacity = 1;
  $('#mark').style.opacity = 1 - 0.6 * smooth(sec('end').t0, sec('end').t0 + 1, t);
  // hero
  $('#hero').style.opacity = fade(t, 1.2, 5.8, 1.2, 0.8).toFixed(3);
  $('#hero').style.transform = `translateY(${(10 * (1 - smooth(1.2, 3.5, t))).toFixed(1)}px)`;
  lowerThird(t);
  callouts(t, anchors);
  hud(t);
  const ob = sec('onboard');
  $('#onboard').style.opacity = fade(t, ob.t0, ob.t1, 0.3, 0.3).toFixed(3);
  // facts
  const fs = sec('facts');
  $('#facts').style.opacity = fade(t, fs.t0, fs.t1, 0.8, 0.7).toFixed(3);
  document.querySelectorAll('#facts .it').forEach((it, i) => { it.style.opacity = smooth(fs.t0 + 0.6 + i * 0.35, fs.t0 + 1.1 + i * 0.35, t).toFixed(3); });
  $('#facts .dev').style.opacity = smooth(fs.t0 + 4.2, fs.t0 + 4.9, t).toFixed(3);
  // end card
  const e = sec('end');
  const eo = smooth(e.t0, e.t0 + 1.2, t);
  $('#end').style.opacity = eo.toFixed(3);
  $('#end').style.background = `rgba(4,6,9,${(0.72 * eo).toFixed(3)})`;
  $('#end .disc').style.opacity = smooth(e.t0 + 1.6, e.t0 + 2.4, t).toFixed(3);
}

window.__ov = { ready: true, setCopy, seek, EV };
