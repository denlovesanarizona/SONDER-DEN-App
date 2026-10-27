// appearance.js (v1.4): everything about how Sonder looks.
// Settings live in S.settings.ui (saved with your other settings, and included in backups). Pew pew pew.
import { icon } from './icons.js';

let X = null; // context from app.js: { S, saveSettings, applyTheme, render, openSheet, closeSheet, toast, confirmSheet }

const FONTS = {
  sans: '"Manrope", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  serif: '"Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  rounded: 'ui-rounded, "Nunito", "Varela Round", "Segoe UI", system-ui, sans-serif'
};
const FONT_LABEL = { sans: 'Clean', serif: 'Serif', mono: 'Mono', rounded: 'Rounded' };
const DENSITY = { compact: [18, 8], cozy: [24, 12], roomy: [30, 18] };          // [side padding, gap between cards]
const CORNERS = [['Sharp', 6], ['Soft', 12], ['Round', 18], ['Pill', 28]];
const WIDTHS = [['Narrow', 680], ['Medium', 820], ['Wide', 1000]];
const ACCENTS = [['Default', ''], ['Amber', '#d4a373'], ['Rose', '#e58aa0'], ['Coral', '#ff8a6b'], ['Sage', '#8fbf9f'], ['Mint', '#5fd1b0'], ['Sky', '#7fb2e5'], ['Lavender', '#b583ff']];
const COLOR_VARS = [['bg', 'Background'], ['surface', 'Cards'], ['surface-2', 'Raised cards'], ['line', 'Borders'], ['text', 'Text'], ['muted', 'Soft text'], ['faint', 'Faint text'], ['accent', 'Accent'], ['violet', 'Links'], ['danger', 'Warnings']];
const HOME_LABEL = {
  resonance: 'Today’s resonance', reflect: 'Daily reflection', budget: 'Budget card', recent: 'Recent entries',
  shortcuts: 'Quick links', onthisday: 'On this day', streak: 'Streak', week: 'This week chart', todo: 'To-do list', reading: 'Reading & watching', wishlist: 'Wishlist'
};
const HOME_OFF = new Set(['streak', 'week', 'todo', 'reading', 'wishlist']);   // new widgets start hidden, except Quick links and On this day

const DEF = {
  accent: null, font: 'sans', scale: 100, density: 'cozy', radius: 18, motion: true, splash: true, content: 820,
  greeting: 'How are you, {name}?',
  home: Object.keys(HOME_LABEL).map((id) => ({ id, on: !HOME_OFF.has(id) })),
  vars: { dark: {}, light: {} }, css: ''
};
const HEX = /^#[0-9a-f]{6}$/i;

export function uiNorm(u) {
  const o = { ...structuredClone(DEF), ...(u || {}) };
  o.vars = { dark: { ...(u?.vars?.dark) }, light: { ...(u?.vars?.light) } };
  const seen = new Set(), h = [];
  for (const s of Array.isArray(o.home) ? o.home : []) if (HOME_LABEL[s?.id] && !seen.has(s.id)) { seen.add(s.id); h.push({ id: s.id, on: s.on !== false }); }
  for (const id of Object.keys(HOME_LABEL)) if (!seen.has(id)) h.push({ id, on: !HOME_OFF.has(id) });
  o.home = h;
  return o;
}
const getUI = () => uiNorm(X?.S.settings.ui);
export const homeOrder = (settings) => uiNorm(settings.ui).home.filter((s) => s.on).map((s) => s.id);
export const greeting = (settings) => (uiNorm(settings.ui).greeting || DEF.greeting).replace(/\{name\}/gi, settings.name || '');

/* ---------- colour helpers ---------- */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const ink = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.58 ? '#1a1208' : '#ffffff'; };
const soft = (hex, a = 0.14) => `rgba(${rgb(hex).join(',')},${a})`;

function setStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
  el.textContent = css;
}

/* Builds and injects the style rules from your settings. Open the app with ?safe to ignore colours + custom CSS. */
export function uiApply() {
  if (!X) return;
  const u = getUI();
  const safe = /[?&]safe\b/.test(location.search);
  const [pad, gap] = DENSITY[u.density] || DENSITY.cozy;
  document.documentElement.style.zoom = u.scale === 100 ? '' : String(u.scale / 100);
  let css = `:root{--radius:${Number(u.radius) || 18}px;--font:${FONTS[u.font] || FONTS.sans};--pad:${pad}px;--gap:${gap}px;--content-w:${Number(u.content) || 820}px}`;
  if (u.accent && HEX.test(u.accent)) css += `:root[data-theme="dark"],:root[data-theme="light"]{--accent:${u.accent};--accent-ink:${ink(u.accent)};--accent-soft:${soft(u.accent)}}`;
  if (!safe) {
    for (const t of ['dark', 'light']) {
      const parts = [];
      for (const [k, c] of Object.entries(u.vars[t])) {
        if (!COLOR_VARS.some(([n]) => n === k) || !HEX.test(c)) continue;
        parts.push(`--${k}:${c}`);
        if (k === 'accent') parts.push(`--accent-ink:${ink(c)}`, `--accent-soft:${soft(c)}`);
      }
      if (parts.length) css += `:root[data-theme="${t}"]{${parts.join(';')}}`;
    }
  }
  if (!u.motion) css += '*,*::before,*::after{animation:none!important;transition:none!important}';
  setStyle('sonder-ui', css);
  setStyle('sonder-css', safe ? '' : u.css || '');
  const m = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (m && bg) m.content = bg;
}

/* ---------- saving ---------- */
let t0;
const saveSoon = () => { clearTimeout(t0); t0 = setTimeout(() => X.saveSettings(), 350); };
async function set(patch, rerender) {
  X.S.settings.ui = { ...getUI(), ...patch };
  uiApply();
  if (rerender) { await X.saveSettings(); X.render(); } else saveSoon();
}

/* ---------- screen ---------- */
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pills = (key, list, cur) => `<div class="ui-row">${list.map(([l, v]) => `<button class="pill ${String(cur) === String(v) ? 'on' : ''}" data-ui="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
const tg = (on) => `<span class="toggle ${on ? 'on' : ''}"></span>`;
const cssVar = (k) => getComputedStyle(document.documentElement).getPropertyValue(`--${k}`).trim();
const asHex = (v) => (HEX.test(v) ? v : '#000000');

export function appearanceHTML() {
  const u = getUI(), s = X.S.settings;
  const resolved = document.documentElement.dataset.theme || 'dark';
  const accentNow = u.accent || '';
  return `<div class="screen">
    <div class="topbar"><button class="round" data-act="go" data-to="account" aria-label="Back">${icon('back', 19)}</button>
      <div class="brand">Appearance</div><span style="width:40px"></span></div>
    <p class="sub" style="margin-top:-6px">Changes apply instantly and are saved on this device.</p>

    <div class="card ui-prev"><div class="top"><span>Preview</span><span class="tag">Tag</span></div>
      <h3>A sample entry</h3><p>This is how your cards, text and colours look together.</p>
      <div class="ui-row" style="margin-top:12px"><button class="pill on">Selected</button><button class="pill">Option</button><button class="btn-primary" style="width:auto;padding:10px 20px">Button</button></div></div>

    <div class="eyebrow">Theme</div>
    ${pills('theme', [['Dark', 'dark'], ['Light', 'light'], ['Match device', 'system']], s.theme)}

    <div class="eyebrow">Accent colour</div>
    <div class="ui-row">${ACCENTS.map(([l, v]) => `<button class="ui-sw ${accentNow.toLowerCase() === v ? 'on' : ''}" data-ui="accent" data-v="${v}" aria-label="${l}" title="${l}" style="${v ? `background:${v}` : 'background:var(--surface-2)'}">${v ? '' : icon('x', 14)}</button>`).join('')}
      <label class="ui-sw custom ${accentNow && !ACCENTS.some(([, v]) => v === accentNow.toLowerCase()) ? 'on' : ''}" title="Pick any colour"><input type="color" data-uiin="accentPick" value="${asHex(accentNow || cssVar('accent'))}"><span>+</span></label></div>

    <div class="eyebrow">Text & shape</div>
    <div class="label">Font</div>
    <div class="ui-row">${Object.entries(FONT_LABEL).map(([k, l]) => `<button class="pill ${u.font === k ? 'on' : ''}" data-ui="font" data-v="${k}" style="font-family:${FONTS[k]}">${l}</button>`).join('')}</div>
    <div class="label" style="margin-top:16px">Size <span id="uiScaleLbl">${u.scale}%</span></div>
    <input type="range" class="ui-range" min="85" max="130" step="5" value="${u.scale}" data-uiin="scale" aria-label="Interface size">
    <div class="label" style="margin-top:16px">Spacing</div>
    ${pills('density', [['Compact', 'compact'], ['Cozy', 'cozy'], ['Roomy', 'roomy']], u.density)}
    <div class="label" style="margin-top:16px">Corners</div>
    ${pills('radius', CORNERS.map(([l, v]) => [l, v]), u.radius)}
    <div class="label" style="margin-top:16px">Width on a computer</div>
    ${pills('content', WIDTHS, u.content)}
    <div class="card group" style="margin-top:16px"><button class="setrow" data-ui="motion"><span class="ico">${icon('moon', 18)}</span><span class="t">Animations</span>${tg(u.motion)}</button>
      <button class="setrow" data-ui="splash"><span class="ico">${icon('home', 18)}</span><span class="t">Startup animation</span>${tg(u.splash)}</button></div>

    <div class="eyebrow">Home screen</div>
    <div class="label">Greeting <span style="text-transform:none;letter-spacing:0">({name} is replaced by your name)</span></div>
    <input class="field" data-uiin="greeting" maxlength="60" value="${esc(u.greeting)}" placeholder="${esc(DEF.greeting)}">
    <div class="card group ui-home" style="margin-top:14px">${u.home.map((h, i) => `<div class="setrow">
      <span class="t" style="${h.on ? '' : 'color:var(--faint)'}">${HOME_LABEL[h.id]}</span>
      <button class="xbtn" data-ui="homeUp" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled style="opacity:.25"' : ''}><span style="display:block;transform:rotate(-90deg)">${icon('chevron', 18)}</span></button>
      <button class="xbtn" data-ui="homeDown" data-i="${i}" aria-label="Move down" ${i === u.home.length - 1 ? 'disabled style="opacity:.25"' : ''}><span style="display:block;transform:rotate(90deg)">${icon('chevron', 18)}</span></button>
      <button data-ui="homeToggle" data-i="${i}" aria-label="Show or hide">${tg(h.on)}</button></div>`).join('')}</div>

    <div class="eyebrow">Colours <span style="text-transform:none;letter-spacing:0;font-weight:500">· editing the ${resolved} theme</span></div>
    <div class="ui-colors">${COLOR_VARS.map(([k, l]) => `<label class="ui-color"><input type="color" data-uiin="var" data-k="${k}" value="${asHex(cssVar(k))}"><span>${l}</span></label>`).join('')}</div>
    <button class="btn-ghost" data-ui="varReset" style="margin-top:12px">Reset ${resolved} colours</button>

    <div class="eyebrow">Custom CSS <span style="text-transform:none;letter-spacing:0;font-weight:500">· advanced</span></div>
    <textarea class="ui-css" data-uiin="css" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="/* Any CSS. Applied live. Example:\n.card { box-shadow: 0 6px 20px rgba(0,0,0,.25); } */">${esc(u.css)}</textarea>
    <p class="sub" style="font-size:12.5px;margin-top:8px;line-height:1.5">If something breaks the screen, open Sonder with <b>?safe</b> at the end of the address (e.g. <b>…/index.html?safe</b>) to ignore custom colours and CSS, then fix it here.</p>

    <div class="eyebrow">Share this look</div>
    <div class="ui-row"><button class="btn-ghost" data-ui="copyTheme">Copy theme code</button><button class="btn-ghost" data-ui="pasteTheme">Paste theme code</button></div>
    <p class="sub" style="font-size:12.5px;margin-top:8px;line-height:1.5">Handy for matching your phone and computer. Backups also carry your look.</p>
    <button class="btn-ghost" data-ui="resetAll" style="margin-top:22px;color:var(--danger)">Reset all appearance</button>
  </div>${X.nav('account')}`;
}

/* ---------- events ---------- */
const A = {
  theme: async (t) => { X.S.settings.theme = t.dataset.v; await X.saveSettings(); X.applyTheme(); X.render(); },
  accent: (t) => set({ accent: t.dataset.v || null }, true),
  font: (t) => set({ font: t.dataset.v }, true),
  density: (t) => set({ density: t.dataset.v }, true),
  radius: (t) => set({ radius: Number(t.dataset.v) }, true),
  content: (t) => set({ content: Number(t.dataset.v) }, true),
  motion: () => set({ motion: !getUI().motion }, true),
  splash: () => set({ splash: !getUI().splash }, true),
  homeUp: (t) => moveHome(+t.dataset.i, -1),
  homeDown: (t) => moveHome(+t.dataset.i, 1),
  homeToggle: (t) => { const h = getUI().home; h[+t.dataset.i].on = !h[+t.dataset.i].on; return set({ home: h }, true); },
  varReset: () => { const u = getUI(), th = document.documentElement.dataset.theme; u.vars[th] = {}; return set({ vars: u.vars }, true); },
  resetAll: async () => {
    if (!(await X.confirmSheet({ title: 'Reset appearance?', text: 'Colours, fonts, sizes, home layout and custom CSS go back to the defaults.', ok: 'Reset', danger: true }))) return;
    X.S.settings.ui = null; await X.saveSettings(); uiApply(); X.render(); X.toast('Appearance reset');
  },
  copyTheme: async () => {
    const code = JSON.stringify(getUI());
    try { await navigator.clipboard.writeText(code); X.toast('Theme code copied'); }
    catch {
      const el = X.openSheet(`<div class="hd"><h2>Theme code</h2></div><textarea class="ui-css" readonly style="min-height:160px">${esc(code)}</textarea>`);
      el.querySelector('textarea').select();
    }
  },
  pasteTheme: () => {
    const el = X.openSheet(`<div class="hd"><h2>Paste theme code</h2></div><textarea class="ui-css" id="uiPaste" placeholder="Paste a theme code here" style="min-height:140px"></textarea><button class="btn-primary" id="uiPasteGo" style="margin-top:16px">Apply</button>`);
    el.querySelector('#uiPasteGo').onclick = async () => {
      try {
        const o = JSON.parse(el.querySelector('#uiPaste').value);
        if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('bad');
        X.S.settings.ui = uiNorm(o); await X.saveSettings(); uiApply(); X.closeSheet(); X.render(); X.toast('Theme applied');
      } catch { X.toast('That isn’t a theme code'); }
    };
  }
};
function moveHome(i, d) {
  const h = getUI().home, j = i + d;
  if (j < 0 || j >= h.length) return;
  [h[i], h[j]] = [h[j], h[i]];
  return set({ home: h }, true);
}

export function uiInit(ctx) {
  X = ctx;
  if (document.__uiBound) return;
  document.__uiBound = true;
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ui]');
    if (t && A[t.dataset.ui]) A[t.dataset.ui](t);
  });
  document.addEventListener('input', (e) => {
    const k = e.target.dataset?.uiin;
    if (!k) return;
    const v = e.target.value;
    if (k === 'scale') { set({ scale: Number(v) }); const l = document.getElementById('uiScaleLbl'); if (l) l.textContent = `${v}%`; }
    else if (k === 'greeting') set({ greeting: v });
    else if (k === 'css') set({ css: v });
    else if (k === 'accentPick') set({ accent: v });
    else if (k === 'var') {
      const u = getUI(), th = document.documentElement.dataset.theme;
      u.vars[th][e.target.dataset.k] = v;
      set({ vars: u.vars });
    }
  });
  document.addEventListener('change', (e) => { if (e.target.dataset?.uiin === 'accentPick') X.render(); });
}

/* ---------- startup animation (plays once each time the app is opened) ---------- */
export function playSplash() {
  const u = getUI();
  if (!u.motion || !u.splash || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  try { if (sessionStorage.getItem('sonder-splash')) return Promise.resolve(); sessionStorage.setItem('sonder-splash', '1'); } catch {}
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'splash';
    el.innerHTML = '<div class="sp-mark"><i></i><span>Sonder</span></div>';
    document.body.appendChild(el);
    const done = () => { el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 380); };
    el.addEventListener('click', done);
    setTimeout(done, 1250);
  });
}
