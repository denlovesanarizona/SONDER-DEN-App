import { icon } from './icons.js';
import { db, uid, MOODS, moodById, TAGS, DEFAULT_SETTINGS, DEFAULT_BUDGET, ICON_DIR } from './db.js';

export const VERSION = '1.3.0';
const RELEASE_NOTES = [
  'New Budget: split your money between goals, and track every purchase and income.',
  'Plan a purchase: add up prices and tax before you buy, see your balance afterwards and the change you\u2019ll get back.',
  'Purchases keep their line items, so you can look back at exactly what you bought. Back-date old ones as history.',
  'Budget data is included in backups and has a CSV export.'
];

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const todayKey = () => dayKey(Date.now());
const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtLong = (ts) => new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const fmtMD = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
const fmtFull = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtStamp = (ts) => `${new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })} \u00B7 ${fmtTime(ts)}`;
const fmtShort = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(new Date(ts).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
const mi = (m) => m ? `<span class="mi" role="img" aria-label="${m.label}" style="-webkit-mask-image:url('${ICON_DIR}${m.icon}');mask-image:url('${ICON_DIR}${m.icon}')"></span>` : '';
function pickDate(inp) { try { inp.showPicker(); } catch { inp.focus(); inp.click(); } }
const toLocalInput = (ts) => `${dayKey(ts)}T${pad(new Date(ts).getHours())}:${pad(new Date(ts).getMinutes())}`;

function dayHeading(key) {
  const dt = keyToDate(key);
  const md = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const yr = dt.getFullYear() !== new Date().getFullYear() ? `, ${dt.getFullYear()}` : '';
  if (key === todayKey()) return `Today · ${md}`;
  if (key === addDays(todayKey(), -1)) return `Yesterday · ${md}`;
  return `${dt.toLocaleDateString('en-US', { weekday: 'long' })} · ${md}${yr}`;
}

const PROMPTS = [
  'What felt most meaningful about the stillness this morning?',
  'What is one small thing that went better than you expected today?',
  'What is taking up space in your mind right now?',
  'Who or what are you grateful for today, and why?',
  'What did you need today that you didn’t get?',
  'What would make tomorrow feel lighter?',
  'What did you notice today that you usually rush past?',
  'When did you feel most like yourself today?',
  'What are you avoiding, and what is it protecting you from?',
  'What conversation is still echoing with you?',
  'What is one thing you want to remember about this week?',
  'What would you tell a friend who felt the way you do right now?',
  'What gave you energy today, and what drained it?',
  'What are you looking forward to?'
];
const promptOfDay = () => {
  const d = new Date();
  const n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return PROMPTS[n % PROMPTS.length];
};

/* ---------- state ---------- */
const S = {
  items: [],
  settings: { ...DEFAULT_SETTINGS },
  dayMood: {},
  filter: 'all',
  jy: '',
  jm: '',
  from: 'home',
  budget: null,
  planDraft: null,
  planFrom: 'budget',
  budgetAll: false,
  locked: false,
  hiddenAt: 0
};

async function loadAll() {
  S.items = (await db.all()).sort((a, b) => b.ts - a.ts);
  S.settings = { ...DEFAULT_SETTINGS, ...((await db.getMeta('settings')) || {}) };
  S.dayMood = (await db.getMeta('dayMood')) || {};
  S.budget = { ...structuredClone(DEFAULT_BUDGET), ...((await db.getMeta('budget')) || {}) };
  S.planDraft = (await db.getMeta('budgetPlan')) || null;
  if (!S.settings.since) { S.settings.since = Date.now(); await db.setMeta('settings', S.settings); }
}
const saveSettings = () => db.setMeta('settings', S.settings);
const saveDayMood = () => db.setMeta('dayMood', S.dayMood);

async function saveItem(it) {
  it.updated = Date.now();
  await db.put(it);
  const i = S.items.findIndex((x) => x.id === it.id);
  if (i >= 0) S.items[i] = it; else S.items.push(it);
  S.items.sort((a, b) => b.ts - a.ts);
  db.persist();
}
async function delItem(id) {
  await db.remove(id);
  S.items = S.items.filter((x) => x.id !== id);
}

/* ---------- theme ---------- */
function applyTheme() {
  const t = S.settings.theme;
  const dark = t === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : t === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = dark ? '#0b0b0d' : '#f6f3ee';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => S.settings.theme === 'system' && applyTheme());

/* ---------- sheets, toast, confirm ---------- */
let sheetEl, scrimEl, sheetClose;
function openSheet(html, onClose) {
  closeSheet();
  scrimEl = document.createElement('div'); scrimEl.className = 'scrim';
  sheetEl = document.createElement('div'); sheetEl.className = 'sheet';
  sheetEl.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(scrimEl, sheetEl);
  scrimEl.addEventListener('click', closeSheet);
  sheetClose = onClose;
  return sheetEl;
}
function closeSheet() {
  if (!sheetEl) return;
  const cb = sheetClose;
  sheetEl.remove(); scrimEl.remove();
  sheetEl = scrimEl = sheetClose = null;
  cb && cb();
}
let toastTimer;
function toast(msg, action) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${esc(msg)}${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.remove(); action.fn(); };
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), action ? 6000 : 2600);
}
function confirmSheet({ title, text, ok = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const el = openSheet(`
      <div class="hd"><h2>${esc(title)}</h2></div>
      <p class="sub" style="margin:-6px 0 22px;line-height:1.55">${esc(text)}</p>
      <button class="btn-primary" data-ok style="${danger ? 'background:var(--danger);color:#fff' : ''}">${esc(ok)}</button>
      <button class="btn-ghost" data-no style="width:100%;margin-top:10px;padding:14px">Cancel</button>`,
      () => { if (!done) resolve(false); });
    el.querySelector('[data-ok]').onclick = () => { done = true; closeSheet(); resolve(true); };
    el.querySelector('[data-no]').onclick = () => closeSheet();
  });
}

/* ---------- PIN lock ---------- */
async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function pinPad({ title, hint = '', cancel = false, validate }) {
  return new Promise((resolve) => {
    let pin = '';
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `<h2>${esc(title)}</h2><div class="hint">${esc(hint)}</div><div class="dots">${'<i></i>'.repeat(4)}</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
      ${cancel ? '<button data-k="x" style="font-size:15px">Cancel</button>' : '<span></span>'}
      <button data-k="0">0</button><button data-k="b" aria-label="Delete">⌫</button></div>`;
    document.body.appendChild(el);
    const dots = el.querySelector('.dots');
    const paint = () => dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('f', i < pin.length));
    let busy = false;
    el.addEventListener('click', async (e) => {
      const k = e.target.closest('button')?.dataset.k;
      if (!k || busy) return;
      if (k === 'x') { el.remove(); resolve(null); return; }
      if (k === 'b') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
      paint();
      if (pin.length === 4) {
        busy = true;
        const r = validate ? await validate(pin) : true;
        if (r === true) { el.remove(); resolve(pin); return; }
        dots.classList.add('shake');
        el.querySelector('.hint').textContent = r || 'Try again';
        setTimeout(() => { pin = ''; paint(); dots.classList.remove('shake'); busy = false; }, 380);
      }
    });
  });
}
async function unlock() {
  if (S.locked || !S.settings.lockEnabled) return;
  S.locked = true;
  await pinPad({
    title: 'Sonder is locked',
    hint: 'Enter your PIN',
    validate: async (p) => (await hashPin(p, S.settings.lockSalt)) === S.settings.lockHash || 'Wrong PIN'
  });
  S.locked = false;
}
async function toggleLock() {
  if (!crypto.subtle) { toast('App lock needs a secure (HTTPS) connection'); return; }
  if (S.settings.lockEnabled) {
    const ok = await pinPad({
      title: 'Turn off app lock', hint: 'Enter your PIN', cancel: true,
      validate: async (p) => (await hashPin(p, S.settings.lockSalt)) === S.settings.lockHash || 'Wrong PIN'
    });
    if (!ok) return;
    S.settings.lockEnabled = false; S.settings.lockHash = S.settings.lockSalt = null;
  } else {
    const first = await pinPad({ title: 'Choose a 4-digit PIN', cancel: true });
    if (!first) return;
    const second = await pinPad({ title: 'Confirm your PIN', cancel: true, validate: (p) => p === first || 'PINs didn’t match' });
    if (!second) return;
    S.settings.lockSalt = uid();
    S.settings.lockHash = await hashPin(first, S.settings.lockSalt);
    S.settings.lockEnabled = true;
  }
  await saveSettings();
  render();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { S.hiddenAt = Date.now(); return; }
  if (S.settings.lockEnabled && S.hiddenAt && Date.now() - S.hiddenAt > 30000) unlock();
});

/* ---------- router ---------- */
const currentRoute = () => {
  const [name = 'home', arg] = (location.hash.slice(2) || 'home').split('/');
  return { name, arg };
};
const go = (r) => { location.hash = `#/${r}`; };
let lastRouteName = null;

function nav(active) {
  const it = (to, ic, label) => `<button class="it ${active === to ? 'on' : ''}" data-act="go" data-to="${to}">${icon(ic, 21)}<span>${label}</span></button>`;
  return `<nav class="nav">
    ${it('home', 'home', 'Home')}${it('timeline', 'book', 'Timeline')}
    <button class="fab" data-act="fab" aria-label="New">${icon('plus', 26)}</button>
    ${it('insights', 'chart', 'Insights')}${it('account', 'user', 'Account')}
  </nav>`;
}

function render() {
  const { name, arg } = currentRoute();
  const app = $('#app');
  if (name !== 'edit') E = null;
  if (name !== 'plan') P = null;
  let html;
  if (name === 'edit') { html = editorHTML(arg); }
  else if (name === 'timeline') html = timelineHTML();
  else if (name === 'insights') html = insightsHTML();
  else if (name === 'account') html = accountHTML();
  else if (name === 'budget') html = budgetHTML();
  else if (name === 'plan') html = planHTML(arg);
  else html = homeHTML();
  app.innerHTML = html;
  if (name !== lastRouteName) {
    window.scrollTo(0, 0); lastRouteName = name;
    app.firstElementChild?.classList.add('enter');
  }
  if (name === 'edit') mountEditor();
  if (name === 'plan') mountPlan();
}
window.addEventListener('hashchange', () => { closeSheet(); render(); });

/* ---------- Home ---------- */
const entryCard = (it) => {
  const m = moodById(it.mood);
  return `<button class="card entry" data-act="edit" data-id="${it.id}">
    <div class="top"><span>${esc(fmtMD(it.ts))}</span>${m ? `<span class="tag mood">${mi(m)} ${m.label}</span>` : ''}</div>
    <h3>${esc(it.title || 'Untitled')}</h3><p>${esc(it.body)}</p></button>`;
};

function homeHTML() {
  const sel = S.dayMood[todayKey()];
  const recent = S.items.filter((i) => i.kind === 'journal').slice(0, 3);
  return `<div class="screen">
    <div class="topbar"><div class="brand"><i></i>Sonder</div>
      <button class="round" data-act="go" data-to="account" aria-label="Settings">${icon('gear', 19)}</button></div>
    <h1>How are you, ${esc(S.settings.name)}?</h1>
    <p class="sub">${esc(fmtLong(Date.now()))}</p>
    <div class="eyebrow">Today’s resonance</div>
    <div class="resonance">${MOODS.map((m) => `<button class="res ${sel === m.id ? 'sel' : ''}" data-act="dayMood" data-id="${m.id}"><span class="face">${mi(m)}</span>${m.label}</button>`).join('')}</div>
    <div class="card reflect" style="margin-top:26px">
      <div class="k">DAILY REFLECTION</div>
      <p class="q">“${esc(promptOfDay())}”</p>
      <button class="btn-ghost" data-act="new">${icon('pen', 17)}Write Today’s Entry</button>
    </div>
    ${moneyCard()}
    <div class="row-between"><div class="eyebrow">Recent entries</div>
      <button class="link" data-act="viewAll">View All</button></div>
    ${recent.length ? recent.map(entryCard).join('') : `<div class="card empty">Nothing here yet.<br>Tap <b>Write Today’s Entry</b> to start your journal.</div>`}
  </div>${nav('home')}`;
}

/* ---------- Timeline ---------- */
function timelineHTML() {
  const f = S.filter;
  let list = S.items.filter((i) => f === 'all' || (f === 'journal' ? i.kind === 'journal' : i.kind === 'log'));
  const years = [...new Set(S.items.map((i) => new Date(i.ts).getFullYear()))].sort((a, b) => b - a);
  if (S.jy) list = list.filter((i) => String(new Date(i.ts).getFullYear()) === S.jy);
  if (S.jm !== '') list = list.filter((i) => String(new Date(i.ts).getMonth()) === S.jm);

  const groups = [];
  for (const it of list) {
    const k = dayKey(it.ts);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, items: [] });
    groups[groups.length - 1].items.push(it);
  }
  const row = (it, last) => {
    const m = moodById(it.mood);
    const inner = it.kind === 'journal'
      ? `<button class="card jrow" data-act="edit" data-id="${it.id}">
           <div class="top"><span>Journal</span>${m ? `<span class="tag mood">${mi(m)} ${m.label}</span>` : ''}</div>
           <h3>${esc(it.title || 'Untitled')}</h3><p>${esc(it.body)}</p></button>`
      : `<button class="card logrow${it.summary ? ' summary' : ''}" data-act="editLog" data-id="${it.id}"><span>${esc(it.body)}</span>${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ''}</button>`;
    return `<div class="tl ${it.kind} ${last ? 'last' : ''}"><div class="time">${esc(it.summary ? (it.approx || 'Summary') : fmtTime(it.ts))}</div><div class="rail"><i class="dot"></i></div><div class="body">${inner}</div></div>`;
  };
  return `<div class="screen">
    <h1>Timeline</h1><p class="sub">Everything, in order</p>
    <div class="card logbar"><input id="logInput" placeholder="What’s happening right now?" enterkeyhint="done" autocomplete="off"><button data-act="logFromBar">Log</button></div>
    <div class="filters">
      ${[['all', 'All'], ['journal', 'Journal'], ['events', 'Events']].map(([v, l]) => `<button class="pill ${f === v ? 'on' : ''}" data-act="filter" data-v="${v}">${l}</button>`).join('')}
    </div>
    ${years.length ? `<div class="jump" style="margin-top:12px">
      <select data-sel="jy" aria-label="Year"><option value="">All years</option>${years.map((y) => `<option ${S.jy === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <select data-sel="jm" aria-label="Month"><option value="">All months</option>${MONTHS.map((m, i) => `<option value="${i}" ${S.jm === String(i) ? 'selected' : ''}>${m}</option>`).join('')}</select>
    </div>` : ''}
    ${groups.length ? groups.map((g) => `<div class="daylabel">${esc(dayHeading(g.k))}</div>${g.items.map((it, i) => row(it, i === g.items.length - 1)).join('')}`).join('')
      : `<div class="empty">${S.items.length ? 'Nothing matches this filter.' : 'Your timeline is empty.<br>Log what’s happening, or write a journal entry.'}</div>`}
  </div>${nav('timeline')}`;
}

/* ---------- Quick log sheet ---------- */
function openLog({ id, text = '' } = {}) {
  const existing = id ? S.items.find((i) => i.id === id) : null;
  let ts = existing ? existing.ts : Date.now();
  let tag = existing ? existing.tag || '' : '';
  const label = () => `${dayKey(ts) === todayKey() ? 'Today' : fmtShort(ts)} · ${fmtTime(ts)}`;
  const el = openSheet(`
    <div class="hd"><h2>${existing ? 'Edit log' : 'Quick Log'}</h2>
      <span class="dtwrap"><button type="button" class="pill" id="tsBtn" style="padding:8px 14px">${icon('calendar', 15)}<span id="tsLabel">${esc(label())}</span></button><input id="tsInput" class="hidden-dt" type="datetime-local" value="${toLocalInput(ts)}" max="${toLocalInput(Date.now())}"></span></div>
    <textarea id="logText" placeholder="What just happened?">${esc(existing ? existing.body : text)}</textarea>
    <div class="eyebrow" style="margin:0 0 10px">Tag · optional</div>
    <div class="tags">${TAGS.map((t) => `<button class="pill ${tag === t ? 'on' : ''}" data-tag="${t}">${t}</button>`).join('')}</div>
    <button class="btn-primary" id="logSave">${existing ? 'Save' : 'Log it'}</button>
    ${existing ? `<button class="btn-ghost" id="logDel" style="width:100%;margin-top:10px;padding:14px;color:var(--danger)">Delete</button>` : ''}`);
  const ta = $('#logText', el);
  setTimeout(() => ta.focus(), 120);
  $('#tsBtn', el).addEventListener('click', () => pickDate($('#tsInput', el)));
  $('#tsInput', el).addEventListener('change', (e) => {
    const t = new Date(e.target.value).getTime();
    if (!isNaN(t)) { ts = t; $('#tsLabel', el).textContent = label(); }
  });
  el.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => {
    tag = tag === b.dataset.tag ? '' : b.dataset.tag;
    el.querySelectorAll('[data-tag]').forEach((x) => x.classList.toggle('on', x.dataset.tag === tag));
  }));
  $('#logSave', el).addEventListener('click', async () => {
    const body = ta.value.trim();
    if (!body) { ta.focus(); return; }
    await saveItem({ ...(existing || {}), id: existing?.id || uid(), kind: 'log', ts, body, tag });
    closeSheet(); toast(existing ? 'Saved' : 'Logged'); render();
  });
  $('#logDel', el)?.addEventListener('click', async () => {
    closeSheet();
    if (await confirmSheet({ title: 'Delete this log?', text: 'This can’t be undone.', ok: 'Delete', danger: true })) {
      await delItem(existing.id); toast('Deleted'); render();
    }
  });
}

/* ---------- Editor ---------- */
let E = null;
function startEditor(arg) {
  if (E && E.key === arg) return;
  if (arg && arg !== 'new') {
    const it = S.items.find((i) => i.id === arg);
    if (it) { E = { key: arg, id: it.id, isNew: false, ts: it.ts, title: it.title || '', body: it.body, mood: it.mood || '', dirty: false }; return; }
  }
  E = { key: 'new', id: uid(), isNew: true, ts: Date.now(), title: '', body: '', mood: S.dayMood[todayKey()] || '', dirty: false };
}
function editorHTML(arg) {
  startEditor(arg);
  return `<div class="editor">
    <div class="ed-top">
      <button class="round" data-act="edBack" aria-label="Back">${icon('back', 19)}</button>
      <span></span>
      <div style="display:flex;gap:8px">
        ${E.isNew ? '' : `<button class="round" data-act="edDelete" aria-label="Delete" style="color:var(--danger)">${icon('trash', 18)}</button>`}
        <button class="btn-ghost" data-act="edSave" style="padding:10px 18px">Save</button>
      </div>
    </div>
    <div class="label">Date & time</div>
    <div class="dtwrap"><button type="button" class="field datefield" id="edDateBtn"><span id="edDateText">${esc(fmtStamp(E.ts))}</span>${icon('calendar', 18)}</button>
      <input type="datetime-local" id="edDateInput" class="hidden-dt" value="${toLocalInput(E.ts)}" max="${toLocalInput(Date.now())}"></div>
    <div class="label" style="margin-top:16px">Mood</div>
    <div class="moods">${MOODS.map((m) => `<button data-mood="${m.id}" class="${E.mood === m.id ? 'sel' : ''}" aria-label="${m.label}" title="${m.label}">${mi(m)}</button>`).join('')}</div>
    <div class="label" style="margin-top:16px">Entry title</div>
    <input class="field" id="edTitle" placeholder="Entry title…" value="${esc(E.title)}" autocomplete="off">
    <textarea class="body" id="edBody" placeholder="What’s on your mind?">${esc(E.body)}</textarea>
    <div class="saved-hint" id="edHint">${E.isNew ? 'Drafts save automatically' : ''}</div>
  </div>`;
}
let draftTimer;
function mountEditor() {
  const $t = $('#edTitle'), $b = $('#edBody');
  const touch = () => {
    E.title = $t.value; E.body = $b.value; E.dirty = true;
    if (E.isNew) {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(async () => {
        if (!E.title && !E.body) return db.delMeta('draft');
        await db.setMeta('draft', { ts: E.ts, title: E.title, body: E.body, mood: E.mood });
        const h = $('#edHint'); if (h) h.textContent = 'Draft saved';
      }, 600);
    }
  };
  $t.addEventListener('input', touch); $b.addEventListener('input', touch);
  document.querySelectorAll('[data-mood]').forEach((b) => b.addEventListener('click', () => {
    E.mood = E.mood === b.dataset.mood ? '' : b.dataset.mood; E.dirty = true;
    document.querySelectorAll('[data-mood]').forEach((x) => x.classList.toggle('sel', x.dataset.mood === E.mood));
    touch();
  }));
  $('#edDateBtn').addEventListener('click', () => pickDate($('#edDateInput')));
  $('#edDateInput').addEventListener('change', (e) => {
    const t = new Date(e.target.value).getTime();
    if (isNaN(t)) return;
    E.ts = t;
    $('#edDateText').textContent = fmtStamp(E.ts);
    touch();
  });
  if (E.isNew && !E.title && !E.body) {
    db.getMeta('draft').then((d) => {
      if (d && (d.title || d.body) && E && E.isNew && !E.body && !E.title) {
        E.ts = d.ts || E.ts; E.mood = d.mood || E.mood; $t.value = E.title = d.title || ''; $b.value = E.body = d.body || '';
        $('#edDateText').textContent = fmtStamp(E.ts); $('#edDateInput').value = toLocalInput(E.ts);
        document.querySelectorAll('[data-mood]').forEach((x) => x.classList.toggle('sel', x.dataset.mood === E.mood));
        toast('Draft restored');
      } else if (!d) $b.focus();
    });
  }
}
async function leaveEditor(to) {
  const hasContent = E && (E.title.trim() || E.body.trim());
  if (E && E.dirty && hasContent && !E.isNew) {
    if (!(await confirmSheet({ title: 'Discard changes?', text: 'Your edits to this entry haven’t been saved.', ok: 'Discard', danger: true }))) return;
  }
  E = null; go(to || S.from || 'home');
}
async function saveEditor() {
  const title = E.title.trim(), body = E.body.trim();
  if (!title && !body) { toast('Write something first'); return; }
  const first = body.split(/\n/)[0];
  const finalTitle = title || (first.length > 42 ? first.slice(0, 40).trim() + '…' : first) || 'Untitled';
  const old = S.items.find((i) => i.id === E.id);
  await saveItem({ ...(old || {}), id: E.id, kind: 'journal', ts: E.ts, title: finalTitle, body, mood: E.mood });
  if (E.mood && dayKey(E.ts) === todayKey()) { S.dayMood[todayKey()] = E.mood; await saveDayMood(); }
  clearTimeout(draftTimer);
  if (E.isNew) await db.delMeta('draft');
  E = null; toast('Saved'); go('timeline');
}

/* ---------- Insights ---------- */
function streaks() {
  const days = new Set(S.items.filter((i) => !i.summary).map((i) => dayKey(i.ts)));
  let cur = 0, k = days.has(todayKey()) ? todayKey() : addDays(todayKey(), -1);
  while (days.has(k)) { cur++; k = addDays(k, -1); }
  let best = 0, run = 0, prev = null;
  for (const d of [...days].sort()) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return { cur, best, days };
}
function insightsHTML() {
  const { cur, best, days } = streaks();
  const per = {};
  S.items.forEach((i) => { if (i.summary) return; const k = dayKey(i.ts); per[k] = (per[k] || 0) + 1; });
  const total = S.items.filter((i) => !i.summary).length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(todayKey(), i - 6));
  const wmax = Math.max(1, ...week.map((k) => per[k] || 0));
  const moodDay = {};
  [...S.items].sort((a, b) => a.ts - b.ts).forEach((i) => { if (i.kind === 'journal' && i.mood) moodDay[dayKey(i.ts)] = i.mood; });
  Object.entries(S.dayMood).forEach(([k, v]) => { moodDay[k] = v; });
  const counts = Object.fromEntries(MOODS.map((m) => [m.id, 0]));
  Object.values(moodDay).forEach((m) => { if (counts[m] != null) counts[m]++; });
  const cmax = Math.max(1, ...Object.values(counts));
  const heat = Array.from({ length: 98 }, (_, i) => addDays(todayKey(), i - 97));
  const words = S.items.filter((i) => i.kind === 'journal').reduce((n, i) => n + (i.body.trim().split(/\s+/).filter(Boolean).length), 0);
  return `<div class="screen">
    <h1>Insights</h1><p class="sub">Patterns in your days</p>
    <div class="stats" style="margin-top:22px">
      <div class="card stat"><b>${cur}</b><span>Day streak</span></div>
      <div class="card stat"><b>${best}</b><span>Best streak</span></div>
      <div class="card stat"><b>${words.toLocaleString()}</b><span>Words written</span></div>
    </div>
    <div class="eyebrow">This week</div>
    <div class="card chartcard"><div class="bars">${week.map((k) => `<div class="b" title="${per[k] || 0}"><i class="${per[k] ? '' : 'zero'}" style="height:${per[k] ? Math.max(8, (per[k] / wmax) * 100) : 3}%"></i>${keyToDate(k).toLocaleDateString('en-US', { weekday: 'narrow' })}</div>`).join('')}</div></div>
    <div class="eyebrow">Moods</div>
    <div class="card chartcard">${Object.values(counts).some(Boolean)
      ? MOODS.map((m) => `<div class="moodrow"><span class="nm">${mi(m)} ${m.label}</span><span class="tr"><i style="width:${(counts[m.id] / cmax) * 100}%"></i></span><span class="n">${counts[m.id]}</span></div>`).join('')
      : '<div class="empty" style="padding:14px">Pick a mood on Home or in an entry<br>and your patterns will show up here.</div>'}</div>
    <div class="eyebrow">Last 14 weeks</div>
    <div class="card chartcard"><div class="heat">${heat.map((k) => { const n = per[k] || 0; return `<i class="${n >= 3 ? 'l3' : n === 2 ? 'l2' : n === 1 ? 'l1' : ''}" title="${esc(k)}: ${n}"></i>`; }).join('')}</div>
      <p class="sub" style="margin:12px 0 0;font-size:12.5px">${total} item${total === 1 ? '' : 's'} total · ${days.size} day${days.size === 1 ? '' : 's'} with something written</p></div>
  </div>${nav('insights')}`;
}

/* ---------- Account ---------- */
function accountHTML() {
  const s = S.settings;
  const entries = S.items.filter((i) => i.kind === 'journal').length;
  const logs = S.items.filter((i) => i.kind === 'log' && !i.summary).length;
  const { cur } = streaks();
  const since = new Date(Math.min(s.since, ...S.items.map((i) => i.ts))).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const row = (ic, t, v, act, extra = '') => `<button class="setrow" data-act="${act}"><span class="ico">${icon(ic, 18)}</span><span class="t">${t}</span>${v ? `<span class="v">${esc(v)}</span>` : ''}${extra}</button>`;
  const chev = `<span style="color:var(--faint)">${icon('chevron', 18)}</span>`;
  const tg = (on) => `<span class="toggle ${on ? 'on' : ''}"></span>`;
  return `<div class="screen">
    <h1>Account</h1><p class="sub">Your profile and preferences</p>
    <div class="card profile"><div class="avatar">${esc((s.name || '?')[0].toUpperCase())}</div>
      <div class="who"><b>${esc(s.name)}</b><span>Journaling since ${esc(since)}</span></div>
      <button class="btn-ghost" data-act="editProfile" style="padding:8px 16px;font-size:13.5px">Edit</button></div>
    <div class="stats" style="margin-top:14px">
      <div class="card stat"><b>${entries}</b><span>Entries</span></div>
      <div class="card stat"><b>${logs}</b><span>Quick logs</span></div>
      <div class="card stat"><b>${cur}</b><span>Day streak</span></div>
    </div>
    <div class="eyebrow">Preferences</div>
    <div class="card group">
      ${row('bell', 'Daily reminder', '', 'toggleReminder', tg(s.reminder))}
      ${s.reminder ? `<div class="setrow"><span class="ico">${icon('calendar', 18)}</span><span class="t">Remind me at</span><input type="time" id="remTime" value="${esc(s.reminderTime)}" style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:6px 10px;color:var(--text)"></div>` : ''}
      ${row('moon', 'Appearance', { dark: 'Dark', light: 'Light', system: 'System' }[s.theme], 'appearance', chev)}
      ${row('lock', 'App lock', '', 'toggleLock', tg(s.lockEnabled))}
    </div>
    <div class="eyebrow">Data</div>
    <div class="card group">
      ${row('download', 'Export journal', 'PDF, Markdown', 'exportSheet', chev)}
      ${row('cloud', 'Backup & restore', 'Manual', 'backupSheet', chev)}
    </div>
    <div class="eyebrow">About</div>
    <div class="card group">
      ${row('help', 'Help & feedback', '', 'helpSheet', chev)}
      ${row('info', 'About Sonder', 'v' + VERSION, 'aboutSheet', chev)}
    </div>
    <div class="card group" style="margin-top:24px">
      <button class="setrow danger" data-act="eraseAll"><span class="ico" style="color:var(--danger)">${icon('trash', 18)}</span><span class="t">Erase all data</span></button>
    </div>
  </div>${nav('account')}`;
}

/* ---------- export / import ---------- */
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const sortedAsc = () => [...S.items].sort((a, b) => a.ts - b.ts);
function toMarkdown() {
  let out = `# Sonder journal\n\nExported ${fmtFull(Date.now())}\n`;
  let lastDay = '';
  for (const it of sortedAsc()) {
    const k = dayKey(it.ts);
    if (k !== lastDay) { out += `\n## ${keyToDate(k).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n\n`; lastDay = k; }
    if (it.kind === 'journal') {
      const m = moodById(it.mood);
      out += `### ${it.title || 'Untitled'}\n*${fmtTime(it.ts)}${m ? ` · ${m.label}` : ''}*\n\n${it.body}\n\n`;
    } else out += `- ${(it.summary ? (it.approx || 'Summary') : fmtTime(it.ts))} — ${it.body}${it.tag ? ` _(${it.tag})_` : ''}\n`;
  }
  return out;
}
function printPDF() {
  let body = '', lastDay = '';
  for (const it of sortedAsc()) {
    const k = dayKey(it.ts);
    if (k !== lastDay) { body += `<h2>${esc(keyToDate(k).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</h2>`; lastDay = k; }
    if (it.kind === 'journal') {
      const m = moodById(it.mood);
      body += `<h3>${esc(it.title || 'Untitled')}</h3><div class="meta">${esc(fmtTime(it.ts))}${m ? ' · ' + esc(m.label) : ''}</div><p>${esc(it.body).replace(/\n/g, '<br>')}</p>`;
    } else body += `<div class="log">${esc((it.summary ? (it.approx || 'Summary') : fmtTime(it.ts)))} — ${esc(it.body)}${it.tag ? ` <span>(${esc(it.tag)})</span>` : ''}</div>`;
  }
  const doc = `<!doctype html><meta charset="utf-8"><title>Sonder journal</title><style>
    body{font:12pt/1.55 Georgia,serif;color:#111;max-width:680px;margin:0 auto;padding:24px}
    h1{font-size:22pt;margin:0 0 4px} h2{font-size:13pt;margin:26px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px;page-break-after:avoid}
    h3{font-size:12.5pt;margin:14px 0 2px} .meta{color:#777;font-size:10pt;margin-bottom:6px} p{margin:0 0 8px} .log{margin:3px 0;color:#333} .log span{color:#888}
  </style><h1>Sonder journal</h1><div class="meta">Exported ${esc(fmtFull(Date.now()))}</div>${body}`;
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.appendChild(fr);
  fr.srcdoc = doc;
  fr.onload = () => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 60000); };
}
async function backupJSON() {
  const data = { app: 'sonder', version: 2, exported: new Date().toISOString(), settings: { name: S.settings.name, since: S.settings.since, theme: S.settings.theme }, dayMood: S.dayMood, items: S.items, budget: S.budget };
  download(`sonder-backup-${todayKey()}.json`, JSON.stringify(data, null, 2), 'application/json');
  await db.setMeta('lastBackup', Date.now());
  toast('Backup saved to your downloads');
}
function pickImport() {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    try {
      const data = JSON.parse(await inp.files[0].text());
      if (data.app !== 'sonder' || !Array.isArray(data.items)) throw new Error('bad');
      let n = 0, bn = 0;
      for (const it of data.items) {
        if (!it || typeof it.id !== 'string' || !['journal', 'log'].includes(it.kind) || typeof it.ts !== 'number' || typeof it.body !== 'string') continue;
        const cur = S.items.find((x) => x.id === it.id);
        if (!cur || (it.updated || 0) > (cur.updated || 0)) { await db.put(it); n++; }
      }
      S.dayMood = { ...(data.dayMood || {}), ...S.dayMood };
      await saveDayMood();
      bn = await mergeBudget(data.budget);
      if (data.settings?.since && data.settings.since < S.settings.since) { S.settings.since = data.settings.since; await saveSettings(); }
      await loadAll(); closeSheet(); render();
      toast(`Imported ${n} item${n === 1 ? '' : 's'}${bn ? ` and ${bn} budget record${bn === 1 ? '' : 's'}` : ''}`);
    } catch { toast('That file isn’t a Sonder backup'); }
  };
  inp.click();
}

/* ---------- sheets for account ---------- */
const sheetRow = (act, ic, t, sub = '') => `<button class="setrow" data-act="${act}" style="padding:15px 2px"><span class="ico">${icon(ic, 18)}</span><span class="t">${t}${sub ? `<div class="sub" style="font-size:13px;margin-top:2px">${sub}</div>` : ''}</span></button>`;

async function openBackupSheet() {
  const last = await db.getMeta('lastBackup');
  openSheet(`<div class="hd"><h2>Backup & restore</h2></div>
    <p class="sub" style="margin:-6px 0 14px;line-height:1.55">Your journal lives only on this phone. There’s no cloud copy, so back it up now and then.</p>
    <div class="menu">${sheetRow('doBackup', 'download', 'Back up now', last ? `Last backup: ${esc(fmtFull(last))}` : 'No backup yet')}${sheetRow('doImport', 'upload', 'Restore from a backup file', 'Merges with what’s already here')}</div>`);
}

/* ---------- actions ---------- */
const actions = {
  go: (t) => go(t.dataset.to),
  edit: (t) => { S.from = currentRoute().name; E = null; go(`edit/${t.dataset.id}`); },
  new: () => { S.from = currentRoute().name; E = null; go('edit/new'); },
  viewAll: () => { S.filter = 'journal'; go('timeline'); },
  fab: () => {
    const el = openSheet(`<div class="menu">
      ${sheetRow('fabEntry', 'pen', 'Write a journal entry', 'Longer thoughts, with a mood')}
      ${sheetRow('fabLog', 'plus', 'Quick log', 'One line about what just happened')}
      ${sheetRow('fabPlan', 'cart', 'Plan a purchase', 'Add up prices and tax before you buy')}</div>`);
    el.querySelector('[data-act="fabEntry"]').onclick = () => { closeSheet(); actions.new(); };
    el.querySelector('[data-act="fabLog"]').onclick = () => { closeSheet(); openLog(); };
    el.querySelector('[data-act="fabPlan"]').onclick = () => { closeSheet(); actions.planNew(); };
  },
  dayMood: async (t) => {
    const k = todayKey();
    if (S.dayMood[k] === t.dataset.id) delete S.dayMood[k]; else S.dayMood[k] = t.dataset.id;
    await saveDayMood(); render();
  },
  filter: (t) => { S.filter = t.dataset.v; render(); },
  logFromBar: () => { const v = $('#logInput').value.trim(); openLog({ text: v }); },
  editLog: (t) => openLog({ id: t.dataset.id }),
  edBack: () => leaveEditor(),
  edSave: () => saveEditor(),
  edDelete: async () => {
    if (await confirmSheet({ title: 'Delete this entry?', text: 'This can’t be undone.', ok: 'Delete', danger: true })) {
      const id = E.id; await delItem(id); E = null; toast('Deleted'); go('timeline');
    }
  },
  editProfile: () => {
    const el = openSheet(`<div class="hd"><h2>Edit profile</h2></div>
      <div class="label" style="margin-left:0">Your name</div>
      <input class="field" id="nameIn" value="${esc(S.settings.name)}" maxlength="24" style="margin-bottom:18px">
      <button class="btn-primary" id="nameSave">Save</button>`);
    $('#nameSave', el).onclick = async () => {
      const v = $('#nameIn', el).value.trim();
      if (v) { S.settings.name = v; await saveSettings(); }
      closeSheet(); render();
    };
  },
  toggleReminder: async () => { S.settings.reminder = !S.settings.reminder; await saveSettings(); render(); },
  toggleLock: () => toggleLock(),
  appearance: () => {
    const opts = [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match my phone']];
    const el = openSheet(`<div class="hd"><h2>Appearance</h2></div><div class="menu">${opts.map(([v, l]) => `<button data-th="${v}"><span style="flex:1;text-align:left">${l}</span>${S.settings.theme === v ? `<span style="color:var(--accent)">${icon('check', 20)}</span>` : ''}</button>`).join('')}</div>`);
    el.querySelectorAll('[data-th]').forEach((b) => b.onclick = async () => { S.settings.theme = b.dataset.th; await saveSettings(); applyTheme(); closeSheet(); render(); });
  },
  exportSheet: () => {
    const el = openSheet(`<div class="hd"><h2>Export journal</h2></div><div class="menu">
      ${sheetRow('x-md', 'download', 'Markdown (.md)', 'Plain text you can open anywhere')}
      ${sheetRow('x-pdf', 'download', 'PDF', 'Opens the print dialog, choose “Save as PDF”')}
      ${sheetRow('x-json', 'cloud', 'Full backup (.json)', 'Everything, so you can restore it later')}</div>`);
    el.querySelector('[data-act="x-md"]').onclick = () => { closeSheet(); download(`sonder-journal-${todayKey()}.md`, toMarkdown(), 'text/markdown'); toast('Exported'); };
    el.querySelector('[data-act="x-pdf"]').onclick = () => { closeSheet(); printPDF(); };
    el.querySelector('[data-act="x-json"]').onclick = () => { closeSheet(); backupJSON(); };
  },
  backupSheet: () => openBackupSheet(),
  doBackup: () => { closeSheet(); backupJSON(); },
  doImport: () => pickImport(),
  helpSheet: () => openSheet(`<div class="hd"><h2>Help & feedback</h2></div><div class="about">
    <p><b style="color:var(--text)">Add to Home Screen.</b> In Chrome, open the ⋮ menu and tap “Install app”.</p>
    <p><b style="color:var(--text)">Quick log vs. journal.</b> Quick logs are one-liners about what happened (they appear as dots on the timeline). Journal entries are longer, with a title and mood.</p>
    <p><b style="color:var(--text)">Your data</b> stays on this device. Use Export or Backup regularly, and avoid clearing Chrome’s site data for this app.</p></div>`),
  aboutSheet: async () => {
    let usage = '';
    try { const e = await navigator.storage.estimate(); usage = `${(e.usage / 1048576).toFixed(2)} MB used`; } catch {}
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    const el = openSheet(`<div class="hd"><h2>About Sonder</h2><span class="tag">v${VERSION}</span></div><div class="about">
      <p>A private, local-first journal. Everything you write is stored on this device only. Nothing is sent anywhere.</p>
      <p>${esc(usage)}${usage ? ' · ' : ''}Storage protection: ${persisted ? 'on' : 'not guaranteed (back up regularly)'}</p>
      <p style="margin-bottom:6px"><b style="color:var(--text)">What\u2019s new in v${VERSION}</b></p>
      <ul>${RELEASE_NOTES.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
      <button class="btn-primary" id="chk">Check for updates</button>`);
    $('#chk', el).onclick = async () => {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) { toast('Updates are checked when installed over HTTPS'); return; }
      await reg.update(); toast('You’re on the latest version unless a banner appears');
    };
  },
  eraseAll: async () => {
    if (!(await confirmSheet({ title: 'Erase everything?', text: 'This permanently deletes every entry and setting on this device. Export a backup first if you want to keep anything.', ok: 'Erase all data', danger: true }))) return;
    await db.clearItems(); await db.delMeta('settings'); await db.delMeta('dayMood'); await db.delMeta('draft');
    await db.delMeta('budget'); await db.delMeta('budgetPlan'); S.planDraft = null; P = null;
    E = null; await loadAll(); applyTheme(); toast('All data erased'); go('home'); render();
  }
};

/* ---------- Budget (v1.3) ---------- */
// All money is stored as whole cents (integers) so nothing ever drifts by a fraction of a cent.
const cents = (s) => { const n = Number(String(s ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const money = (c) => `${c < 0 ? '\u2212' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const moneyIn = (c) => (c / 100).toFixed(2);
const saveBudget = async () => { await db.setMeta('budget', S.budget); db.persist(); };
const bucketOf = (id) => S.budget.buckets.find((k) => k.id === id);
const bucketName = (id) => bucketOf(id)?.name || 'Removed goal';
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

// Balance of each goal = money allocated to it minus purchases paid from it. "History only" records are ignored.
function balances() {
  const b = {};
  S.budget.buckets.forEach((k) => { b[k.id] = 0; });
  for (const t of S.budget.txns) {
    if (t.history) continue;
    if (t.type === 'income') for (const [id, c] of Object.entries(t.alloc || {})) b[id] = (b[id] || 0) + c;
    else if (t.type === 'expense') b[t.bucket] = (b[t.bucket] || 0) - t.amount;
  }
  return b;
}
const totalBalance = () => Object.values(balances()).reduce((n, c) => n + c, 0);

// Split an amount between goals by their share %, to the exact cent.
function splitCents(total, only) {
  const bs = S.budget.buckets;
  if (only && bucketOf(only)) return { [only]: total };
  const sum = bs.reduce((n, k) => n + k.pct, 0) || 1;
  const out = {}; let used = 0;
  bs.forEach((k) => { out[k.id] = Math.floor(total * k.pct / sum); used += out[k.id]; });
  let left = total - used;
  // largest-remainder method: leftover cents go to whichever goals lost the most to rounding
  [...bs].sort((a, b) => ((total * b.pct) % sum) - ((total * a.pct) % sum) || b.pct - a.pct).forEach((k) => { if (left > 0) { out[k.id]++; left--; } });
  return out;
}
function upsertTxn(t) {
  const L = S.budget.txns, i = L.findIndex((x) => x.id === t.id);
  if (i >= 0) L[i] = t; else L.push(t);
  L.sort((a, b) => b.ts - a.ts);
}

/* Home card */
function moneyCard() {
  if (!S.budget.setup) {
    return `<div class="card moneycard"><button class="mc-main" data-act="go" data-to="budget"><span class="k">BUDGET</span><b>Set up your budget</b><span class="s">Plan every purchase to the cent</span></button></div>`;
  }
  return `<div class="card moneycard"><button class="mc-main" data-act="go" data-to="budget"><span class="k">BUDGET</span><b>${money(totalBalance())}</b><span class="s">available across your goals</span></button>
    <button class="btn-ghost" data-act="planNew">${icon('cart', 16)}Plan</button></div>`;
}

/* Budget screen */
function txRow(t) {
  const inc = t.type === 'income';
  const where = inc ? (t.only ? bucketName(t.only) : 'Split') : bucketName(t.bucket);
  const n = !inc && t.items?.length > 1 ? ` \u00B7 ${t.items.length} items` : '';
  return `<button class="card tx${t.history ? ' hist' : ''}" data-act="txOpen" data-id="${t.id}">
    <span class="l"><b>${esc(t.title)}</b><span>${esc(fmtShort(t.ts))} \u00B7 ${esc(where)}${n}${t.history ? ' \u00B7 history' : ''}</span></span>
    <span class="a ${inc ? 'in' : ''}">${inc ? '+' : '\u2212'}${money(t.amount)}</span></button>`;
}
function budgetHTML() {
  const B = S.budget;
  if (!B.setup) {
    return `<div class="screen"><h1>Budget</h1><p class="sub">Every cent, planned before you spend</p>
      <div class="card empty" style="margin-top:22px">Tell Sonder how much you have right now.<br>It gets split between your goals automatically.<br><br>
      <button class="btn-primary" data-act="budgetSetup" style="max-width:260px;margin:0 auto">Set up budget</button></div></div>${nav('budget')}`;
  }
  const bal = balances();
  const total = Object.values(bal).reduce((n, c) => n + c, 0);
  const now = new Date();
  const mt = B.txns.filter((t) => !t.history && new Date(t.ts).getFullYear() === now.getFullYear() && new Date(t.ts).getMonth() === now.getMonth());
  const inM = mt.filter((t) => t.type === 'income').reduce((n, t) => n + t.amount, 0);
  const exp = mt.filter((t) => t.type === 'expense');
  const outM = exp.reduce((n, t) => n + t.amount, 0);
  const list = S.budgetAll ? B.txns : B.txns.slice(0, 12);
  const bucketCard = (k) => {
    const b = bal[k.id] || 0;
    const pct = k.target > 0 ? Math.max(0, Math.min(100, (b / k.target) * 100)) : 0;
    return `<div class="card bk"><div class="top"><span class="nm">${esc(k.name)}</span><span class="amt ${b < 0 ? 'warn' : ''}">${money(b)}</span></div>
      <div class="meta"><span>${k.pct}% of new money${k.target > 0 ? ` \u00B7 goal ${money(k.target)}` : ''}</span>${k.target > 0 ? `<span>${b >= k.target ? 'Goal reached' : `${money(k.target - b)} to go`}</span>` : ''}</div>
      ${k.target > 0 ? `<div class="tr"><i style="width:${pct}%"></i></div>` : ''}
      ${safeUrl(k.url) ? `<a href="${esc(safeUrl(k.url))}" target="_blank" rel="noopener">Open listing</a>` : ''}</div>`;
  };
  return `<div class="screen">
    <h1>Budget</h1><p class="sub">Every cent, planned before you spend</p>
    <div class="card bal"><div class="k">AVAILABLE TO SPEND</div><b class="${total < 0 ? 'warn' : ''}">${money(total)}</b>
      <button class="link" data-act="coins" style="margin-top:2px">Loose coins: ${money(B.coins || 0)} (not counted)</button></div>
    <div class="acts">
      <button class="btn-primary" data-act="planNew">${icon('cart', 18)}Plan a purchase</button>
      <button class="btn-ghost wide" data-act="addIncome">${icon('plus', 16)}Add income</button></div>
    <div class="row-between"><div class="eyebrow">Goals</div><button class="link" data-act="editBuckets">Edit</button></div>
    ${B.buckets.map(bucketCard).join('')}
    <div class="eyebrow">This month</div>
    <div class="stats">
      <div class="card stat"><b>${money(inM)}</b><span>Income</span></div>
      <div class="card stat"><b>${money(outM)}</b><span>Spent</span></div>
      <div class="card stat"><b>${exp.length}</b><span>Purchases</span></div></div>
    <div class="row-between"><div class="eyebrow">Activity</div>${B.txns.length ? '<button class="link" data-act="budgetCSV">Export CSV</button>' : ''}</div>
    ${list.length ? list.map(txRow).join('') : '<div class="card empty">No activity yet.<br>Plan a purchase or add income to begin.</div>'}
    ${B.txns.length > 12 ? `<button class="link" data-act="budgetMore" style="display:block;margin:6px auto 0">${S.budgetAll ? 'Show less' : `Show all ${B.txns.length}`}</button>` : ''}
  </div>${nav('budget')}`;
}

/* Income sheet (also used for the starting balance) */
function openIncome({ id, setup = false } = {}) {
  const B = S.budget, ex = id ? B.txns.find((t) => t.id === id) : null;
  let ts = ex ? ex.ts : Date.now(), only = ex?.only || '', hist = !!ex?.history;
  const label = () => `${dayKey(ts) === todayKey() ? 'Today' : fmtShort(ts)} \u00B7 ${fmtTime(ts)}`;
  const el = openSheet(`
    <div class="hd"><h2>${setup ? 'Starting balance' : ex ? 'Edit income' : 'Add income'}</h2>
      ${setup ? '' : `<span class="dtwrap"><button type="button" class="pill" id="inTsBtn" style="padding:8px 14px">${icon('calendar', 15)}<span id="inTsLabel">${esc(label())}</span></button><input id="inTsInput" class="hidden-dt" type="datetime-local" value="${toLocalInput(ts)}" max="${toLocalInput(Date.now())}"></span>`}</div>
    ${setup ? '<p class="sub" style="margin:-8px 0 14px;line-height:1.5">How much money do you have right now? It\u2019s split between your goals using their share percentages.</p>' : ''}
    <div class="label">Amount</div>
    <input class="field" id="inAmt" inputmode="decimal" placeholder="0.00" value="${ex ? moneyIn(ex.amount) : ''}" autocomplete="off">
    <div class="label" style="margin-top:14px">${setup ? 'Note' : 'From'}</div>
    <input class="field" id="inNote" placeholder="${setup ? 'Starting balance' : 'e.g. Helping Uncle'}" value="${esc(ex ? ex.title : setup ? 'Starting balance' : '')}" autocomplete="off">
    <div class="label" style="margin-top:14px">Put it in</div>
    <div class="chips" id="inWhere"><button type="button" class="pill" data-w="">Split</button>${B.buckets.map((k) => `<button type="button" class="pill" data-w="${esc(k.id)}">${esc(k.name)}</button>`).join('')}</div>
    <div class="sub" id="inPrev" style="min-height:20px;margin:0 4px 12px;font-size:13px"></div>
    ${setup ? '' : `<button type="button" class="setrow" id="inHist" style="border:0;padding:6px 4px"><span class="t" style="white-space:normal">History only<span class="sub" style="display:block;font-size:12.5px">Record it without changing my balance</span></span><span class="toggle ${hist ? 'on' : ''}"></span></button>`}
    <button class="btn-primary" id="inSave" style="margin-top:12px">${setup ? 'Start budget' : 'Save'}</button>
    ${setup ? '<button class="btn-ghost wide" id="inSkip" style="margin-top:10px;padding:14px">Start at $0.00</button>' : ''}
    ${ex ? '<button class="btn-ghost wide" id="inDel" style="margin-top:10px;padding:14px;color:var(--danger)">Delete</button>' : ''}`);
  const amt = $('#inAmt', el), prev = $('#inPrev', el);
  const paint = () => {
    el.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('on', b.dataset.w === only));
    const c = cents(amt.value);
    if (!(c > 0)) { prev.textContent = ''; return; }
    const a = splitCents(c, only);
    prev.textContent = B.buckets.filter((k) => a[k.id]).map((k) => `${k.name}: ${money(a[k.id])}`).join(' \u00B7 ');
  };
  paint();
  setTimeout(() => amt.focus(), 120);
  amt.addEventListener('input', paint);
  el.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { only = b.dataset.w; paint(); }));
  $('#inTsBtn', el)?.addEventListener('click', () => pickDate($('#inTsInput', el)));
  $('#inTsInput', el)?.addEventListener('change', (e) => {
    const t = new Date(e.target.value).getTime();
    if (!isNaN(t)) { ts = t; $('#inTsLabel', el).textContent = label(); }
  });
  $('#inHist', el)?.addEventListener('click', (e) => { hist = !hist; e.currentTarget.querySelector('.toggle').classList.toggle('on', hist); });
  $('#inSave', el).addEventListener('click', async () => {
    const c = cents(amt.value);
    if (!(c > 0)) { amt.focus(); toast('Enter an amount'); return; }
    const same = ex && ex.amount === c && (ex.only || '') === only;
    upsertTxn({ ...(ex || {}), id: ex?.id || uid(), type: 'income', ts, amount: c, title: $('#inNote', el).value.trim() || (setup ? 'Starting balance' : 'Income'), only, alloc: same ? ex.alloc : splitCents(c, only), history: hist, updated: Date.now() });
    B.setup = true;
    await saveBudget(); closeSheet(); toast(setup ? 'Budget started' : 'Saved'); render();
  });
  $('#inSkip', el)?.addEventListener('click', async () => { B.setup = true; await saveBudget(); closeSheet(); render(); });
  $('#inDel', el)?.addEventListener('click', async () => {
    closeSheet();
    if (await confirmSheet({ title: 'Delete this income?', text: 'Your goal balances will update. This can\u2019t be undone.', ok: 'Delete', danger: true })) {
      B.txns = B.txns.filter((t) => t.id !== ex.id); await saveBudget(); toast('Deleted'); render();
    }
  });
}

/* Goals & settings sheet */
function bkRow(k) {
  return `<div class="bkedit" data-b="${esc(k.id)}">
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center"><input class="field" data-f="name" value="${esc(k.name)}" placeholder="Goal name" maxlength="40" style="padding:12px 14px;font-size:16px"><button type="button" class="xbtn" data-bkdel aria-label="Remove goal">${icon('trash', 16)}</button></div>
    <div class="row3"><label><span>Share %</span><input class="field" data-f="pct" inputmode="numeric" value="${k.pct}"></label><label><span>Goal $</span><input class="field" data-f="target" inputmode="decimal" placeholder="optional" value="${k.target ? moneyIn(k.target) : ''}"></label></div>
    <input class="field" data-f="url" placeholder="Link (optional)" value="${esc(k.url || '')}" style="margin-top:8px;padding:12px 14px;font-size:15px"></div>`;
}
function openBuckets() {
  const B = S.budget;
  const el = openSheet(`<div class="hd"><h2>Goals &amp; settings</h2></div>
    <p class="sub" style="margin:-8px 0 14px;line-height:1.5">Shares decide how new money is split. They only affect money you add from now on; past balances don\u2019t change.</p>
    <div id="bkList">${B.buckets.map(bkRow).join('')}</div>
    <button class="btn-ghost wide" id="bkAdd">${icon('plus', 16)}Add a goal</button>
    <div class="sub" id="bkSum" style="margin:12px 4px;font-size:13px"></div>
    <div class="label">Default sales tax %</div>
    <input class="field" id="bkTax" inputmode="decimal" value="${esc(String(B.taxRate))}" style="margin-bottom:6px">
    <p class="sub" style="font-size:12.5px;margin:0 4px 18px">Used when planning a purchase. You can change it for any single purchase.</p>
    <button class="btn-primary" id="bkSave">Save</button>`);
  const rows = () => [...el.querySelectorAll('.bkedit')];
  const paint = () => {
    const sum = rows().reduce((n, r) => n + (parseInt($('[data-f="pct"]', r).value, 10) || 0), 0);
    const s = $('#bkSum', el);
    s.textContent = `Shares add up to ${sum}%${sum === 100 ? '' : ' \u2014 they need to total 100%'}`;
    s.classList.toggle('warn', sum !== 100);
  };
  paint();
  el.addEventListener('input', paint);
  $('#bkAdd', el).addEventListener('click', () => {
    $('#bkList', el).insertAdjacentHTML('beforeend', bkRow({ id: uid(), name: '', pct: 0, target: 0, url: '' }));
    const r = rows(); $('[data-f="name"]', r[r.length - 1]).focus(); paint();
  });
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-bkdel]');
    if (!d) return;
    const row = d.closest('.bkedit'), bid = row.dataset.b;
    if (rows().length <= 1) { toast('Keep at least one goal'); return; }
    if (B.txns.some((t) => t.bucket === bid || t.only === bid || t.alloc?.[bid])) { toast('That goal has activity \u2014 set its share to 0% instead'); return; }
    row.remove(); paint();
  });
  $('#bkSave', el).addEventListener('click', async () => {
    const nb = [];
    for (const r of rows()) {
      const name = $('[data-f="name"]', r).value.trim();
      const pct = parseInt($('[data-f="pct"]', r).value, 10) || 0;
      const tg = $('[data-f="target"]', r).value.trim();
      const target = tg === '' ? 0 : cents(tg);
      if (!name) { toast('Every goal needs a name'); return; }
      if (pct < 0 || pct > 100 || Number.isNaN(target) || target < 0) { toast(`Check the numbers for \u201C${name}\u201D`); return; }
      nb.push({ id: r.dataset.b, name, pct, target, url: $('[data-f="url"]', r).value.trim() });
    }
    if (nb.reduce((n, k) => n + k.pct, 0) !== 100) { toast('Shares need to add up to 100%'); return; }
    const tax = parseFloat($('#bkTax', el).value);
    if (!(tax >= 0 && tax <= 25)) { toast('Check the tax rate'); return; }
    B.buckets = nb; B.taxRate = tax;
    await saveBudget(); closeSheet(); toast('Saved'); render();
  });
}

/* Loose coins sheet */
function openCoins() {
  const B = S.budget;
  const el = openSheet(`<div class="hd"><h2>Loose coins</h2></div>
    <p class="sub" style="margin:-8px 0 14px;line-height:1.5">Coins in your jar don\u2019t count toward your balance until you add them. Count them, then add them to split between your goals.</p>
    <div class="label">Amount in the jar</div>
    <input class="field" id="coinIn" inputmode="decimal" placeholder="0.00" value="${B.coins ? moneyIn(B.coins) : ''}" style="margin-bottom:18px" autocomplete="off">
    <button class="btn-primary" id="coinAdd">Add to my budget</button>
    <button class="btn-ghost wide" id="coinSave" style="margin-top:10px;padding:14px">Just remember the amount</button>`);
  const read = () => { const c = cents($('#coinIn', el).value); return Number.isNaN(c) || c < 0 ? null : c; };
  $('#coinSave', el).addEventListener('click', async () => {
    const c = read(); if (c === null) { toast('Enter an amount'); return; }
    B.coins = c; await saveBudget(); closeSheet(); render();
  });
  $('#coinAdd', el).addEventListener('click', async () => {
    const c = read(); if (!c) { toast('Enter an amount'); return; }
    upsertTxn({ id: uid(), type: 'income', ts: Date.now(), amount: c, title: 'Coins', only: '', alloc: splitCents(c, ''), history: false, updated: Date.now() });
    B.coins = 0; await saveBudget(); closeSheet(); toast(`Added ${money(c)}`); render();
  });
}

function budgetCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Type', 'Title', 'Store', 'Goal', 'Amount', 'Tax', 'Paid with', 'Change', 'History only', 'Items']];
  [...S.budget.txns].sort((a, b) => a.ts - b.ts).forEach((t) => rows.push([
    toLocalInput(t.ts).replace('T', ' '), t.type, t.title, t.store || '',
    t.type === 'income' ? (t.only ? bucketName(t.only) : 'Split') : bucketName(t.bucket),
    moneyIn(t.amount), t.tax != null ? moneyIn(t.tax) : '',
    t.tendered != null ? moneyIn(t.tendered) : '', t.tendered != null ? moneyIn(t.tendered - t.amount) : '',
    t.history ? 'yes' : '', (t.items || []).map((i) => `${i.name} ${moneyIn(i.price)}`).join(' | ')
  ]));
  return rows.map((r) => r.map(q).join(',')).join('\n');
}

async function mergeBudget(inc) {
  if (!inc || typeof inc !== 'object') return 0;
  const B = S.budget;
  const ok = (t) => t && typeof t.id === 'string' && ['income', 'expense'].includes(t.type) && typeof t.ts === 'number' && Number.isInteger(t.amount);
  let n = 0;
  if (!B.setup && !B.txns.length) {
    S.budget = { ...structuredClone(DEFAULT_BUDGET), ...inc, txns: (inc.txns || []).filter(ok) };
    n = S.budget.txns.length;
  } else {
    const ids = new Set(B.buckets.map((k) => k.id));
    (inc.buckets || []).forEach((k) => { if (k && !ids.has(k.id)) B.buckets.push(k); });
    for (const t of inc.txns || []) {
      if (!ok(t)) continue;
      const cur = B.txns.find((x) => x.id === t.id);
      if (!cur || (t.updated || 0) > (cur.updated || 0)) { upsertTxn(t); n++; }
    }
  }
  await saveBudget();
  return n;
}

/* ---------- Plan a purchase ---------- */
let P = null, planTimer;
const newPlan = () => ({
  key: 'new', editId: null, store: '', items: [{ id: uid(), name: '', price: '', taxed: true }],
  rate: String(S.budget.taxRate), taxExact: '', bucket: S.budget.buckets[0]?.id || '', tendered: '', ts: null, history: false, dirty: false
});
function startPlan(arg) {
  if (P && P.key === (arg || 'new')) return;
  if (arg && arg !== 'new') {
    const t = S.budget.txns.find((x) => x.id === arg && x.type === 'expense');
    if (t) {
      const src = t.items?.length ? t.items : [{ name: t.title, price: t.amount - (t.tax || 0), taxed: false }];
      P = {
        key: arg, editId: t.id, store: t.store || '', items: src.map((i) => ({ id: uid(), name: i.name, price: moneyIn(i.price), taxed: !!i.taxed })),
        rate: String(t.rate ?? S.budget.taxRate), taxExact: t.tax != null ? moneyIn(t.tax) : '', bucket: t.bucket,
        tendered: t.tendered != null ? moneyIn(t.tendered) : '', ts: t.ts, history: !!t.history, dirty: false
      };
      return;
    }
  }
  P = S.planDraft && S.planDraft.items ? { ...newPlan(), ...S.planDraft, key: 'new', editId: null, dirty: false } : newPlan();
}
function planSnap() {
  const { items, store, rate, taxExact, bucket, tendered, ts, history } = P;
  return { items, store, rate, taxExact, bucket, tendered, ts, history };
}
function savePlanDraft() {
  if (!P) return;
  P.dirty = true;
  if (P.editId) return;
  S.planDraft = planSnap();
  clearTimeout(planTimer);
  planTimer = setTimeout(() => { if (S.planDraft) db.setMeta('budgetPlan', S.planDraft); }, 400);
}
async function dropPlanDraft() {
  clearTimeout(planTimer); S.planDraft = null; await db.delMeta('budgetPlan');
}

function planCalc() {
  const rows = P.items.filter((i) => i.name.trim() || i.price.trim());
  const parsed = rows.map((i) => ({ ...i, c: cents(i.price) }));
  const bad = parsed.some((i) => !(i.c > 0));
  const ok = parsed.filter((i) => i.c > 0);
  const sub = ok.reduce((n, i) => n + i.c, 0);
  const taxable = ok.reduce((n, i) => n + (i.taxed ? i.c : 0), 0);
  const rate = Math.max(0, parseFloat(P.rate) || 0);
  const exact = P.taxExact.trim() === '' ? NaN : cents(P.taxExact);
  const tax = Number.isNaN(exact) ? Math.round((taxable * rate) / 100) : Math.max(0, exact);
  const total = sub + tax;
  const tendered = P.tendered.trim() === '' ? NaN : cents(P.tendered);
  let before = balances()[P.bucket] || 0;
  if (P.editId) {
    const old = S.budget.txns.find((x) => x.id === P.editId);
    if (old && !old.history && old.bucket === P.bucket) before += old.amount;
  }
  const after = P.history ? before : before - total;
  return { ok, bad, sub, tax, rate, total, tendered, before, after, exactTax: !Number.isNaN(exact) };
}

const planItemsHTML = () => P.items.map((i) => `<div class="pitem">
  <input class="field" data-i="${i.id}" data-f="name" placeholder="Item" value="${esc(i.name)}" autocomplete="off">
  <input class="field" data-i="${i.id}" data-f="price" inputmode="decimal" placeholder="0.00" value="${esc(i.price)}" autocomplete="off">
  <button type="button" class="taxchip ${i.taxed ? 'on' : ''}" data-act="planTax" data-i="${i.id}" aria-pressed="${i.taxed}" title="Charge sales tax on this item">Tax</button>
  <button type="button" class="xbtn" data-act="planRemove" data-i="${i.id}" aria-label="Remove item">${icon('x', 16)}</button></div>`).join('');

function planHTML(arg) {
  startPlan(arg);
  const B = S.budget, bal = balances();
  if (!bucketOf(P.bucket)) P.bucket = B.buckets[0]?.id || '';
  return `<div class="editor plan" id="planRoot">
    <div class="ed-top">
      <button class="round" data-act="planBack" aria-label="Back">${icon('back', 19)}</button><span></span>
      ${P.editId ? `<button class="round" data-act="planDelete" aria-label="Delete" style="color:var(--danger)">${icon('trash', 18)}</button>` : '<button class="btn-ghost" data-act="planClear" style="padding:10px 18px">Clear</button>'}
    </div>
    <h1>${P.editId ? 'Edit purchase' : 'Plan a purchase'}</h1>
    <p class="sub" style="margin:4px 0 18px;line-height:1.5">Add everything in your cart. Nothing changes your balance until you tap \u201C${P.editId ? 'Save changes' : 'I bought it'}\u201D.</p>
    <div class="label">Store or title</div>
    <input class="field" id="plStore" placeholder="e.g. Barnes &amp; Noble" value="${esc(P.store)}" autocomplete="off">
    <div class="label" style="margin-top:16px">Items</div>
    <div class="items" id="planItems">${planItemsHTML()}</div>
    <button class="btn-ghost wide" data-act="planAdd" style="margin-top:10px">${icon('plus', 16)}Add item</button>
    <div class="row3" style="margin-top:16px">
      <label><span class="label" style="display:block;margin-left:4px">Tax rate %</span><input class="field" id="plRate" inputmode="decimal" value="${esc(P.rate)}"></label>
      <label><span class="label" style="display:block;margin-left:4px">Exact tax $</span><input class="field" id="plTaxExact" inputmode="decimal" placeholder="optional" value="${esc(P.taxExact)}"></label>
    </div>
    <div class="card sumcard" id="planSum"></div>
    <div class="label" style="margin-top:20px">Pay from</div>
    <div class="chips" id="planBuckets">${B.buckets.map((k) => `<button type="button" class="pill" data-act="planBucket" data-id="${esc(k.id)}">${esc(k.name)} \u00B7 ${money(bal[k.id] || 0)}</button>`).join('')}</div>
    <div class="label" style="margin-top:8px">Cash you\u2019ll hand over</div>
    <input class="field" id="plTender" inputmode="decimal" placeholder="optional" value="${esc(P.tendered)}" autocomplete="off">
    <div class="chips" id="planChips"></div>
    <div class="sub" id="planChange" style="margin:0 4px 6px;min-height:20px"></div>
    <div class="label" style="margin-top:12px">Date &amp; time</div>
    <div class="dtwrap"><button type="button" class="field datefield" id="plDateBtn"><span id="plDateText">${P.ts ? esc(fmtStamp(P.ts)) : 'Now'}</span>${icon('calendar', 18)}</button>
      <input type="datetime-local" id="plDateInput" class="hidden-dt" value="${toLocalInput(P.ts || Date.now())}" max="${toLocalInput(Date.now())}"></div>
    <div class="card group" style="margin-top:14px"><button type="button" class="setrow" id="planHist" data-act="planHist"><span class="t" style="white-space:normal">History only<span class="sub" style="display:block;font-size:12.5px">Already happened \u2014 record it without changing my balance</span></span><span class="toggle ${P.history ? 'on' : ''}"></span></button></div>
    <button class="btn-primary" data-act="planSave" style="margin-top:20px">${icon('check', 18)}${P.editId ? 'Save changes' : 'I bought it'}</button>
  </div>`;
}

function paintPlan() {
  const c = planCalc(), bk = bucketOf(P.bucket);
  const over = !P.history && c.after < 0;
  $('#planSum').innerHTML = `
    <div class="sumrow"><span>Subtotal \u00B7 ${c.ok.length} item${c.ok.length === 1 ? '' : 's'}</span><b>${money(c.sub)}</b></div>
    <div class="sumrow"><span>Tax ${c.exactTax ? '(exact)' : `(${c.rate}%)`}</span><b>${money(c.tax)}</b></div>
    <div class="sumrow total"><span>Total</span><b>${money(c.total)}</b></div>
    <div class="sumrow" style="margin-top:6px"><span>${esc(bk ? bk.name : '')}</span><b class="${over ? 'warn' : ''}">${money(c.before)} \u2192 ${money(c.after)}</b></div>
    ${P.history ? '<p class="note">History only \u2014 this won\u2019t change your balance.</p>' : ''}
    ${over ? `<p class="note warn">That\u2019s ${money(-c.after)} more than you have in this goal.</p>` : ''}
    ${c.bad ? '<p class="note warn">Every item needs a price.</p>' : ''}`;
  const opts = new Set();
  if (c.total > 0) {
    opts.add(c.total); opts.add(Math.ceil(c.total / 100) * 100);
    [500, 1000, 2000, 5000, 10000].filter((b) => b >= c.total).slice(0, 3).forEach((b) => opts.add(b));
  }
  $('#planChips').innerHTML = [...opts].sort((a, b) => a - b).map((v) => `<button type="button" class="pill ${c.tendered === v ? 'on' : ''}" data-act="planChip" data-v="${v}">${v === c.total ? `Exact ${money(v)}` : money(v)}</button>`).join('');
  const ch = $('#planChange');
  if (Number.isNaN(c.tendered) || c.total <= 0) ch.innerHTML = '';
  else if (c.tendered < c.total) ch.innerHTML = `<span class="warn">Short by ${money(c.total - c.tendered)}</span>`;
  else ch.innerHTML = `Change back: <b style="color:var(--text)">${money(c.tendered - c.total)}</b>`;
  document.querySelectorAll('#planBuckets [data-id]').forEach((b) => b.classList.toggle('on', b.dataset.id === P.bucket));
  $('#planHist .toggle').classList.toggle('on', P.history);
}
function mountPlan() {
  const root = $('#planRoot');
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.i) { const it = P.items.find((x) => x.id === t.dataset.i); if (!it) return; it[t.dataset.f] = t.value; }
    else if (t.id === 'plStore') P.store = t.value;
    else if (t.id === 'plRate') P.rate = t.value;
    else if (t.id === 'plTaxExact') P.taxExact = t.value;
    else if (t.id === 'plTender') P.tendered = t.value;
    else return;
    paintPlan(); savePlanDraft();
  });
  $('#plDateBtn').addEventListener('click', () => pickDate($('#plDateInput')));
  $('#plDateInput').addEventListener('change', (e) => {
    const t = new Date(e.target.value).getTime();
    if (isNaN(t)) return;
    P.ts = t; $('#plDateText').textContent = fmtStamp(t); savePlanDraft();
  });
  paintPlan();
}
async function savePlan() {
  const c = planCalc();
  if (!c.ok.length || c.bad) { toast(c.ok.length ? 'Every item needs a price' : 'Add an item and a price'); return; }
  if (!P.history && c.after < 0 && !(await confirmSheet({ title: 'Over budget', text: `This is ${money(-c.after)} more than you have in ${bucketName(P.bucket)}. Record it anyway?`, ok: 'Record anyway', danger: true }))) return;
  const items = c.ok.map((i) => ({ name: i.name.trim() || 'Item', price: i.c, taxed: i.taxed }));
  const title = P.store.trim() || (items.length <= 2 ? items.map((i) => i.name).join(' + ') : `${items[0].name} + ${items.length - 1} more`);
  upsertTxn({
    id: P.editId || uid(), type: 'expense', ts: P.ts || Date.now(), amount: c.total, title, store: P.store.trim(), items,
    tax: c.tax, rate: c.rate, tendered: Number.isNaN(c.tendered) ? null : c.tendered, bucket: P.bucket, history: P.history, updated: Date.now()
  });
  await saveBudget();
  const msg = P.history ? 'Added to history' : `Recorded ${money(c.total)}`;
  P = null; await dropPlanDraft();
  toast(msg); go('budget');
}

/* ---------- Budget actions ---------- */
Object.assign(actions, {
  budgetSetup: () => openIncome({ setup: true }),
  addIncome: () => openIncome(),
  planNew: () => { S.planFrom = currentRoute().name; go('plan'); },
  editBuckets: () => openBuckets(),
  coins: () => openCoins(),
  budgetMore: () => { S.budgetAll = !S.budgetAll; render(); },
  budgetCSV: () => { download(`sonder-budget-${todayKey()}.csv`, budgetCSV(), 'text/csv'); toast('Exported'); },
  txOpen: (t) => {
    const x = S.budget.txns.find((q) => q.id === t.dataset.id);
    if (!x) return;
    const inc = x.type === 'income';
    const row = (a, b) => `<div class="sumrow"><span>${a}</span><b>${b}</b></div>`;
    const lines = inc
      ? Object.entries(x.alloc || {}).filter(([, c]) => c).map(([bid, c]) => row(esc(bucketName(bid)), money(c))).join('')
      : `${(x.items || []).map((i) => row(`${esc(i.name)}${i.taxed ? '' : ' <em>(no tax)</em>'}`, money(i.price))).join('')}
         ${x.tax ? row('Tax', money(x.tax)) : ''}
         ${x.tendered != null ? row('Paid with', money(x.tendered)) + row('Change', money(x.tendered - x.amount)) : ''}`;
    const el = openSheet(`<div class="hd"><h2>${esc(x.title)}</h2><span class="tag">${inc ? '+' : '\u2212'}${money(x.amount)}</span></div>
      <p class="sub" style="margin:-8px 0 12px">${esc(fmtStamp(x.ts))}${inc ? '' : ` \u00B7 from ${esc(bucketName(x.bucket))}`}${x.history ? ' \u00B7 history only' : ''}</p>
      <div>${lines}</div>
      <button class="btn-primary" data-edit style="margin-top:18px">Edit</button>
      <button class="btn-ghost wide" data-del style="margin-top:10px;padding:14px;color:var(--danger)">Delete</button>`);
    el.querySelector('[data-edit]').onclick = () => { closeSheet(); if (inc) openIncome({ id: x.id }); else { S.planFrom = 'budget'; go(`plan/${x.id}`); } };
    el.querySelector('[data-del]').onclick = async () => {
      closeSheet();
      if (await confirmSheet({ title: 'Delete this record?', text: 'Your goal balances will update. This can\u2019t be undone.', ok: 'Delete', danger: true })) {
        S.budget.txns = S.budget.txns.filter((q) => q.id !== x.id); await saveBudget(); toast('Deleted'); render();
      }
    };
  },
  planBack: async () => {
    if (P?.editId && P.dirty && !(await confirmSheet({ title: 'Discard changes?', text: 'Your edits to this purchase haven\u2019t been saved.', ok: 'Discard', danger: true }))) return;
    const to = S.planFrom && S.planFrom !== 'plan' ? S.planFrom : 'budget';
    P = null; go(to);
  },
  planClear: async () => {
    const hasAny = P.items.some((i) => i.name.trim() || i.price.trim()) || P.store.trim();
    if (hasAny && !(await confirmSheet({ title: 'Clear this plan?', text: 'The items you added will be removed.', ok: 'Clear', danger: true }))) return;
    P = newPlan(); await dropPlanDraft(); render();
  },
  planDelete: async () => {
    if (!(await confirmSheet({ title: 'Delete this purchase?', text: 'Your goal balances will update. This can\u2019t be undone.', ok: 'Delete', danger: true }))) return;
    const id = P.editId; P = null;
    S.budget.txns = S.budget.txns.filter((q) => q.id !== id); await saveBudget(); toast('Deleted'); go('budget');
  },
  planAdd: () => {
    P.items.push({ id: uid(), name: '', price: '', taxed: true });
    $('#planItems').innerHTML = planItemsHTML();
    const ins = document.querySelectorAll('#planItems [data-f="name"]'); ins[ins.length - 1].focus();
    paintPlan(); savePlanDraft();
  },
  planRemove: (t) => {
    if (P.items.length > 1) P.items = P.items.filter((i) => i.id !== t.dataset.i);
    else { P.items[0].name = ''; P.items[0].price = ''; }
    $('#planItems').innerHTML = planItemsHTML(); paintPlan(); savePlanDraft();
  },
  planTax: (t) => {
    const it = P.items.find((x) => x.id === t.dataset.i); if (!it) return;
    it.taxed = !it.taxed; t.classList.toggle('on', it.taxed); t.setAttribute('aria-pressed', it.taxed);
    paintPlan(); savePlanDraft();
  },
  planBucket: (t) => { P.bucket = t.dataset.id; paintPlan(); savePlanDraft(); },
  planChip: (t) => { P.tendered = moneyIn(Number(t.dataset.v)); $('#plTender').value = P.tendered; paintPlan(); savePlanDraft(); },
  planHist: () => { P.history = !P.history; paintPlan(); savePlanDraft(); },
  planSave: () => savePlan()
});

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (t && actions[t.dataset.act]) actions[t.dataset.act](t, e);
});
document.addEventListener('change', async (e) => {
  const sel = e.target.dataset?.sel;
  if (sel) { S[sel] = e.target.value; render(); return; }
  if (e.target.id === 'remTime') { S.settings.reminderTime = e.target.value || '20:00'; await saveSettings(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'logInput' && e.key === 'Enter') actions.logFromBar();
});

/* ---------- reminder nudge (in-app) ---------- */
function maybeNudge() {
  const s = S.settings;
  if (!s.reminder) return;
  const [h, m] = (s.reminderTime || '20:00').split(':').map(Number);
  const now = new Date();
  const due = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
  const wrote = S.items.some((i) => i.kind === 'journal' && dayKey(i.ts) === todayKey());
  if (due && !wrote) toast('Time to write today’s entry', { label: 'Write', fn: () => actions.new() });
}

/* ---------- boot ---------- */
async function boot() {
  await loadAll();
  applyTheme();
  if (S.settings.lockEnabled) unlock();
  render();
  maybeNudge();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      const b = document.createElement('div');
      b.className = 'banner';
      b.innerHTML = 'A new version of Sonder is ready <button>Reload</button>';
      b.querySelector('button').onclick = () => location.reload();
      document.body.appendChild(b);
    });
  }
}
boot();
