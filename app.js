import { icon } from './icons.js';
import { db, uid, MOODS, moodById, TAGS, DEFAULT_SETTINGS, ICON_DIR } from './db.js';

export const VERSION = '1.2.0';
const RELEASE_NOTES = [
  'Summary events (imported history) show \u201CSummary\u201D or a month range instead of a clock time.',
  'Summaries no longer count toward streaks, the heatmap, or your entry and log totals.',
  'Exports show summaries without a made-up time.'
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
  locked: false,
  hiddenAt: 0
};

async function loadAll() {
  S.items = (await db.all()).sort((a, b) => b.ts - a.ts);
  S.settings = { ...DEFAULT_SETTINGS, ...((await db.getMeta('settings')) || {}) };
  S.dayMood = (await db.getMeta('dayMood')) || {};
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
  let html;
  if (name === 'edit') { html = editorHTML(arg); }
  else if (name === 'timeline') html = timelineHTML();
  else if (name === 'insights') html = insightsHTML();
  else if (name === 'account') html = accountHTML();
  else html = homeHTML();
  app.innerHTML = html;
  if (name !== lastRouteName) {
    window.scrollTo(0, 0); lastRouteName = name;
    app.firstElementChild?.classList.add('enter');
  }
  if (name === 'edit') mountEditor();
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
  const data = { app: 'sonder', version: 1, exported: new Date().toISOString(), settings: { name: S.settings.name, since: S.settings.since, theme: S.settings.theme }, dayMood: S.dayMood, items: S.items };
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
      let n = 0;
      for (const it of data.items) {
        if (!it || typeof it.id !== 'string' || !['journal', 'log'].includes(it.kind) || typeof it.ts !== 'number' || typeof it.body !== 'string') continue;
        const cur = S.items.find((x) => x.id === it.id);
        if (!cur || (it.updated || 0) > (cur.updated || 0)) { await db.put(it); n++; }
      }
      S.dayMood = { ...(data.dayMood || {}), ...S.dayMood };
      await saveDayMood();
      if (data.settings?.since && data.settings.since < S.settings.since) { S.settings.since = data.settings.since; await saveSettings(); }
      await loadAll(); closeSheet(); render();
      toast(`Imported ${n} item${n === 1 ? '' : 's'}`);
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
      ${sheetRow('fabLog', 'plus', 'Quick log', 'One line about what just happened')}</div>`);
    el.querySelector('[data-act="fabEntry"]').onclick = () => { closeSheet(); actions.new(); };
    el.querySelector('[data-act="fabLog"]').onclick = () => { closeSheet(); openLog(); };
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
    E = null; await loadAll(); applyTheme(); toast('All data erased'); go('home'); render();
  }
};

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
