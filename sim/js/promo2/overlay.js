// SledPack concept film — typography layer. Deterministic: window.__ov.seek(t, anchors)
// draws the overlay for time t; anchors are the projected callout points from the 3D
// layer (main.js). Copy comes from research/sledpack_2026_10_21/video/copy.json via
// window.__ov.setCopy(copy, lang). The honesty tag is drawn on every frame.
import { SECTIONS as SECTIONS3D, systemState, EV, smooth, GEOM, lineTarget } from './timeline.js';

// text-layer section map: the 'stowed' beat and the first seconds of the facts card become the
// motion-graphics "Not just for skiing" segment (overlay only; the 3D frames underneath are dimmed)
const SECTIONS = SECTIONS3D.filter((s) => s.key !== 'stowed').map((s) => {
  if (s.key === 'facts') return { ...s, t0: 76, t1: 86 };
  if (s.key === 'end') return { ...s, t0: 86 };
  return s;
}).concat([{ key: 'uses', t0: 67, t1: 76 }]).sort((a, b) => a.t0 - b.t0);
const sectionAt = (t) => SECTIONS.find((s) => t >= s.t0 && t < s.t1) || SECTIONS[SECTIONS.length - 1];

const $ = (s) => document.querySelector(s);
let C = null, lang = 'en';
const tx = (o) => (o ? (o[lang] ?? o.en ?? '') : '');
const fade = (t, a, b, fin = 0.6, fout = 0.6) => Math.min(smooth(a, a + fin, t), 1 - smooth(b - fout, b, t));
const sec = (k) => SECTIONS.find((s) => s.key === k);

// callout label offsets (px) relative to the anchor, per key
const OFF = {
  kiteOnBack: [-380, -60], lumbar: [-380, 60], mouth: [220, 40], cradle: [220, -30], seat: [240, -90], sensor: [-300, -90],
  mainMid: [-480, -40], depMid: [80, 90], kite: [-470, -10], pack: [-380, 40], mouthHow: [200, 60],
};
const CALLOUTS = {
  onback: { keys: ['kiteOnBack', 'seat', 'lumbar', 'mouth'], t0: 12.5, step: 0.5, t1: 16.8 },
  how: { keys: ['mouth', 'mainMid', 'depMid', 'kite'], t0: 46.0, step: 0.6, t1: 50.3 },
};

function setCopy(copy, l) {
  C = copy; lang = l;
  document.body.className = `${l} v2`;
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  $('#tag').textContent = tx(C.tag);
  const S = C.sections;
  $('#hero h1').textContent = tx(S.hero.title); $('#hero p').textContent = tx(S.hero.sub);
  $('#hero .ex').textContent = tx(S.hero.example);
  // "not just for skiing" montage tiles
  const U = S.uses;
  $('#uses h3').textContent = tx(U.title); $('#uses .tag').textContent = tx(U.tag); $('#uses .rules').textContent = tx(U.rules);
  $('#uses .grid').innerHTML = U.items.map((it) => `<div class="tile" data-k="${it.k}"><svg viewBox="0 0 300 200" width="330" height="220"></svg><div class="lb">${tx(it.label)}</div></div>`).join('');
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
  const skip = ['hero', 'facts', 'end', 'uses'];
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

const MODES = [
  { t0: 17.0, t1: 34.3, list: ['ON BACK', 'ARMED', 'LAUNCH', 'FILMING · HIGH'] },
  { t0: 38.5, t1: 49.8, list: ['FILMING · HIGH', 'FILMING · LOW', 'SWING GUARD'] },
  { t0: 49.8, t1: 61.0, list: ['DEPOWER', 'PARKED', 'RELAUNCH', 'FILMING · LOW'] },
  { t0: 61.0, t1: 67.2, list: ['FILMING · LOW', 'DOCKING', 'ON BACK'] },
];
function hud(t) {
  const el = $('#hud');
  let op = 0, seg = MODES[0];
  for (const m of MODES) { const f = fade(t, m.t0, m.t1, 0.6, 0.6); if (f > op) { op = f; seg = m; } }
  if (t > sec('onboard').t0 && t < sec('onboard').t1) op = 0;
  el.style.opacity = op.toFixed(3);
  if (op < 0.01) return;
  const st = systemState(t);
  const H = C.sections.sense.hud.modes;
  el.querySelector('.modes').innerHTML = seg.list.filter((m) => m !== 'NUDGE' || GEOM.nudge).map((m) => {
    const on = st.mode === m;
    const cls = on ? (m === 'LAUNCH' ? 'on go' : m === 'ARMED' || m === 'DEPOWER' || m === 'SWING GUARD' ? 'on amber' : m === 'FILMING · LOW' ? 'on blue' : 'on') : '';
    return `<span class="${cls}">${tx(H[m])}</span>`;
  }).join('');
  $('#vSpeed').textContent = st.speed.toFixed(1);
  $('#vWind').textContent = st.apparent.toFixed(1);
  $('#vLine').textContent = st.line.toFixed(1);
  $('#bWind').style.width = `${Math.min(100, (st.apparent / 18) * 100).toFixed(1)}%`;
  // line-length law: target line vs apparent wind, live dot
  const lawEl = $('#law');
  const show = Math.max(fade(t, 26.5, 49.8, 0.8, 0.6), fade(t, 60.6, 63.4, 0.5, 0.5));
  lawEl.style.opacity = show.toFixed(3);
  if (show > 0.01) {
    const W = 340, Hh = 96, vMax = 22, Lmax = GEOM.lineMax + 2;
    const X = (v) => 30 + (v / vMax) * (W - 40), Y = (L) => Hh - 14 - (L / Lmax) * (Hh - 26);
    const lw = C.sections.sense.hud.law || {};
    const law = (vv) => (lw.ref != null ? Math.min(lw.max, Math.max(lw.min, lw.ref + lw.k * (vv - lw.vRef))) : lineTarget(vv));
    let d = ''; for (let v = 0; v <= vMax; v += 0.5) d += `${v ? 'L' : 'M'}${X(v).toFixed(1)},${Y(law(v)).toFixed(1)}`;
    const v = Math.min(vMax, st.apparent), Lc = st.line;
    lawEl.innerHTML = `<svg width="${W}" height="${Hh}"><line x1="30" y1="${Hh - 14}" x2="${W - 10}" y2="${Hh - 14}" stroke="rgba(255,255,255,0.3)"/><line x1="30" y1="8" x2="30" y2="${Hh - 14}" stroke="rgba(255,255,255,0.3)"/>`
      + `<path d="${d}" fill="none" stroke="#ffc062" stroke-width="2"/><circle cx="${X(v).toFixed(1)}" cy="${Y(Lc).toFixed(1)}" r="5" fill="#fff"/>`
      + `<text x="${W - 10}" y="${Hh - 2}" text-anchor="end">${tx(C.sections.sense.hud.lawX)}</text><text x="34" y="14">${tx(C.sections.sense.hud.lawY)}</text></svg>`;
  }
}

// stylised line illustrations: vehicle + kite on a line behind/above; ground per scene (track, beach, water)
const ICON = {
  car: { body: 'M28 150 L46 128 L86 117 L136 115 L172 128 L204 134 L210 150 Z', extra: '<circle cx="62" cy="152" r="13"/><circle cx="180" cy="152" r="13"/><path d="M92 120 L104 106 L144 106 L160 122"/>', att: [204, 132], ground: 'track' },
  moto: { body: 'M60 150 L95 128 L140 128 L162 148', extra: '<circle cx="60" cy="152" r="18"/><circle cx="168" cy="152" r="18"/><path d="M110 126 L118 98 L132 92 M118 98 L102 118"/><circle cx="136" cy="84" r="8"/>', att: [96, 104], ground: 'track' },
  run: { body: 'M150 70 L142 112 L120 140 L108 166 M142 112 L160 136 L176 160 M146 84 L126 100 L112 96 M146 84 L166 98 L176 112', extra: '<circle cx="152" cy="58" r="10"/>', att: [140, 88], ground: 'beach' },
  bike: { body: 'M70 152 L110 120 L150 152 L110 152 Z M110 120 L148 118 L168 152', extra: '<circle cx="70" cy="152" r="22"/><circle cx="168" cy="152" r="22"/><path d="M118 118 L128 86 L148 96 M128 86 L112 72"/><circle cx="110" cy="66" r="8"/>', att: [116, 82], ground: 'track' },
  kayak: { body: 'M40 150 Q140 170 240 148 Q140 158 40 150 Z', extra: '<path d="M138 148 L140 112 M140 120 L118 134 M140 120 L162 132 M100 150 L184 96"/><circle cx="140" cy="102" r="8"/>', att: [134, 108], ground: 'water' },
};
function uses(t) {
  const u = sec('uses'), el = $('#uses');
  const op = fade(t, u.t0, u.t1, 0.7, 0.7);
  el.style.opacity = op.toFixed(3);
  if (op < 0.01) return;
  el.querySelectorAll('.tile').forEach((tile, i) => {
    const k = tile.dataset.k, ic = ICON[k];
    const a = smooth(u.t0 + 0.5 + i * 0.45, u.t0 + 1.1 + i * 0.45, t);
    tile.style.opacity = a.toFixed(3);
    tile.style.transform = `translateY(${(14 * (1 - a)).toFixed(1)}px)`;
    const ph = t * 1.6 + i;
    const kx = ic.att[0] - 118 + 6 * Math.sin(ph * 0.7), ky = 34 + 7 * Math.sin(ph);
    const scroll = ((t * 60) % 24).toFixed(1);
    const ground = ic.ground === 'water'
      ? `<path d="M0 166 Q 25 160 50 166 T 100 166 T 150 166 T 200 166 T 250 166 T 300 166" transform="translate(${-((t * 30) % 50).toFixed(1)} 0)" class="gnd"/>`
      : ic.ground === 'beach' ? `<path d="M0 174 Q 80 160 160 172 T 300 166" class="gnd"/>` : `<line x1="0" y1="172" x2="300" y2="172" class="gnd" stroke-dasharray="14 10" stroke-dashoffset="${scroll}"/>`;
    const kite = `<g transform="translate(${kx.toFixed(1)} ${ky.toFixed(1)}) rotate(${(-18 + 5 * Math.sin(ph * 1.3)).toFixed(1)})"><path d="M-18 -10 L18 -10 L22 6 L0 14 L-22 6 Z" class="kite"/><path d="M-6 -10 L-6 12 M6 -10 L6 12" class="spar"/></g>`;
    tile.querySelector('svg').innerHTML = `${ground}<path d="M${ic.att[0]} ${ic.att[1]} Q ${((ic.att[0] + kx) / 2).toFixed(1)} ${((ic.att[1] + ky) / 2 + 12).toFixed(1)} ${kx.toFixed(1)} ${(ky + 12).toFixed(1)}" class="line"/>${kite}<g class="ic"><path d="${ic.body}"/>${ic.extra}</g>`;
  });
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
  uses(t);
  $('#hero .ex').style.opacity = fade(t, 2.6, 5.8, 0.9, 0.8).toFixed(3);
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
