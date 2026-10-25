// library.js (v1.5): reading/watching log + collection + wishlist, in one place. Stored in meta key 'library'.
import { icon } from './icons.js';

let C = null;
let L = { items: [] };
const V = { tab: 'log', type: 'all' };

const TYPES = [['book', 'Book'], ['manga', 'Manga'], ['comic', 'Comic'], ['movie', 'Movie'], ['show', 'Show'], ['anime', 'Anime'], ['game', 'Game'], ['music', 'Music'], ['other', 'Other']];
const TYPE_LABEL = Object.fromEntries(TYPES);
const VERBS = { book: ['Read', 'Reading'], manga: ['Read', 'Reading'], comic: ['Read', 'Reading'], movie: ['Watched', 'Watching'], show: ['Watched', 'Watching'], anime: ['Watched', 'Watching'], game: ['Played', 'Playing'], music: ['Listened', 'Listening'], other: ['Finished', 'In progress'] };
const STATUS = [['planned', 'Up next'], ['active', 'In progress'], ['done', 'Finished'], ['dropped', 'Dropped']];

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => key(new Date());
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const save = () => C.db.setMeta('library', L);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const fmtKey = (k) => { if (!k) return ''; const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const titleOf = (i) => (i.series && i.vol ? `${i.series} Vol. ${i.vol}${i.title && i.title !== i.series ? ` · ${i.title}` : ''}` : i.title || i.series || 'Untitled');

export async function init(ctx) {
  C = ctx;
  const s = await C.db.getMeta('library');
  if (s && Array.isArray(s.items)) L = s;
  if (!document.__lbBound) { document.__lbBound = true; bind(); }
}
export const all = () => L.items;
export const label = titleOf;
export const backup = () => JSON.parse(JSON.stringify(L));
export async function erase() { L = { items: [] }; await C.db.delMeta('library'); }
export async function restore(inc) {
  if (!inc || !Array.isArray(inc.items)) return 0;
  let n = 0;
  for (const it of inc.items) {
    if (!it || typeof it.id !== 'string' || typeof it.title !== 'string') continue;
    const cur = L.items.find((x) => x.id === it.id);
    if (!cur) { L.items.push(it); n++; } else if ((it.updated || 0) > (cur.updated || 0)) { Object.assign(cur, it); n++; }
  }
  await save();
  return n;
}

/* ---------- widgets ---------- */
export function readingWidget() {
  const act = L.items.filter((i) => i.status === 'active').slice(0, 3);
  if (!act.length) return '';
  return `<div class="card wgt"><div class="wgt-hd"><span class="k">IN PROGRESS</span><button class="link" data-act="go" data-to="library">Library</button></div>
    ${act.map((i) => `<button class="lb-mini" data-lb="open" data-id="${i.id}"><b>${esc(titleOf(i))}</b><span>${esc(VERBS[i.type]?.[1] || 'In progress')} · ${esc(TYPE_LABEL[i.type] || '')}</span></button>`).join('')}</div>`;
}
export function wishlistWidget() {
  const w = L.items.filter((i) => i.own === 'want');
  if (!w.length) return '';
  const total = w.reduce((n, i) => n + (i.price || 0), 0);
  return `<div class="card wgt"><div class="wgt-hd"><span class="k">WISHLIST</span><button class="link" data-lb="goWish">${w.length} item${w.length === 1 ? '' : 's'}${total ? ` · ${C.money(total)}` : ''}</button></div>
    ${w.slice(0, 3).map((i) => `<button class="lb-mini" data-lb="open" data-id="${i.id}"><b>${esc(titleOf(i))}</b><span>${i.price ? C.money(i.price) : TYPE_LABEL[i.type] || ''}</span></button>`).join('')}</div>`;
}

/* ---------- rows ---------- */
function typeTag(i) { return `<span class="tag mood">${esc(TYPE_LABEL[i.type] || 'Other')}</span>`; }
function logRow(i) {
  const verb = VERBS[i.type] || VERBS.other;
  const sub = i.status === 'done' ? `${verb[0]} ${fmtKey(i.finished) || ''}`.trim() : i.status === 'active' ? `${verb[1]}${i.started ? ` since ${fmtKey(i.started)}` : ''}` : i.status === 'dropped' ? 'Dropped' : 'Up next';
  const quick = i.status === 'planned' ? `<button class="btn-ghost lb-q" data-lb="start" data-id="${i.id}">Start</button>` : i.status === 'active' ? `<button class="btn-ghost lb-q" data-lb="finish" data-id="${i.id}">Finish</button>` : '';
  return `<div class="card lb-row"><button class="lb-main" data-lb="open" data-id="${i.id}"><b>${esc(titleOf(i))}</b>
    <span class="lb-sub">${typeTag(i)}${i.creator ? `<span>${esc(i.creator)}</span>` : ''}<span>${esc(sub)}</span></span>${i.rating ? `<span class="lb-stars">${stars(i.rating)}</span>` : ''}</button>${quick}</div>`;
}
function wishRow(i) {
  return `<div class="card lb-row"><button class="lb-main" data-lb="open" data-id="${i.id}"><b>${esc(titleOf(i))}</b>
    <span class="lb-sub">${typeTag(i)}${i.creator ? `<span>${esc(i.creator)}</span>` : ''}${i.price ? `<span>${C.money(i.price)}</span>` : ''}</span></button>
    <div class="lb-btns">${safeUrl(i.url) ? `<a class="btn-ghost lb-q" href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">Link</a>` : ''}<button class="btn-ghost lb-q" data-lb="buy" data-id="${i.id}">Plan buy</button></div></div>`;
}

/* ---------- screen ---------- */
export function html(arg) {
  if (['log', 'collection', 'wishlist'].includes(arg)) V.tab = arg;
  const fit = (i) => V.type === 'all' || i.type === V.type;
  let body = '';
  if (V.tab === 'log') {
    const log = L.items.filter((i) => i.status && fit(i));
    const act = log.filter((i) => i.status === 'active'), nxt = log.filter((i) => i.status === 'planned');
    const done = log.filter((i) => i.status === 'done' || i.status === 'dropped').sort((a, b) => (b.finished || b.updated || '').toString().localeCompare((a.finished || a.updated || '').toString()));
    const year = String(new Date().getFullYear());
    const fin = L.items.filter((i) => i.status === 'done' && (i.finished || '').startsWith(year));
    const rated = L.items.filter((i) => i.status === 'done' && i.rating);
    const avg = rated.length ? (rated.reduce((n, i) => n + i.rating, 0) / rated.length).toFixed(1) : '—';
    const sect = (t, a) => (a.length ? `<div class="eyebrow">${t}</div>${a.map(logRow).join('')}` : '');
    body = `<div class="stats"><div class="card stat"><b>${fin.length}</b><span>Finished ${year}</span></div><div class="card stat"><b>${act.length}</b><span>In progress</span></div><div class="card stat"><b>${avg}</b><span>Avg rating</span></div></div>
      ${sect('In progress', act)}${sect('Up next', nxt)}${sect('Finished', done)}
      ${log.length ? '' : '<div class="card empty" style="margin-top:18px">Nothing logged yet.<br>Add a book, a movie, a manga volume…</div>'}`;
  } else if (V.tab === 'collection') {
    const own = L.items.filter((i) => i.own === 'own' && fit(i));
    const groups = new Map(); const singles = [];
    own.forEach((i) => { if (i.series) { const k = `${i.type}|${i.series.toLowerCase()}`; if (!groups.has(k)) groups.set(k, { series: i.series, type: i.type, list: [] }); groups.get(k).list.push(i); } else singles.push(i); });
    const g = [...groups.values()].sort((a, b) => a.series.localeCompare(b.series)).map((s) => {
      s.list.sort((a, b) => (a.vol || 0) - (b.vol || 0));
      return `<div class="card lb-series"><div class="lb-sh"><b>${esc(s.series)}</b><span class="tag mood">${esc(TYPE_LABEL[s.type] || '')}</span></div>
        <div class="lb-vols">${s.list.map((i) => `<button class="pill" data-lb="open" data-id="${i.id}" title="${esc(i.title)}">${i.vol ? `Vol. ${i.vol}` : esc(i.title || 'Item')}</button>`).join('')}<button class="pill" data-lb="addVol" data-series="${esc(s.series)}" data-type="${s.type}" data-next="${Math.max(0, ...s.list.map((x) => x.vol || 0)) + 1}">+ Volume</button></div></div>`;
    }).join('');
    const sg = singles.sort((a, b) => titleOf(a).localeCompare(titleOf(b))).map((i) => `<div class="card lb-row"><button class="lb-main" data-lb="open" data-id="${i.id}"><b>${esc(titleOf(i))}</b><span class="lb-sub">${typeTag(i)}${i.creator ? `<span>${esc(i.creator)}</span>` : ''}</span></button></div>`).join('');
    body = `<div class="sub" style="margin:16px 4px 4px">${own.length} item${own.length === 1 ? '' : 's'} owned</div>${g}${sg}${own.length ? '' : '<div class="card empty" style="margin-top:12px">Your collection is empty.<br>Add things you own, like manga volumes.</div>'}`;
  } else {
    const w = L.items.filter((i) => i.own === 'want' && fit(i)).sort((a, b) => (a.created || 0) - (b.created || 0));
    const total = w.reduce((n, i) => n + (i.price || 0), 0);
    const avail = C.availableCents();
    body = `<div class="card sumcard" style="margin-top:16px"><div class="sumrow"><span>${w.length} item${w.length === 1 ? '' : 's'} wanted</span><b>${C.money(total)}</b></div>
      ${avail != null ? `<div class="sumrow"><span>Available in your budget</span><b>${C.money(avail)}</b></div><div class="sumrow total"><span>${avail >= total ? 'Left after buying everything' : 'Still to save'}</span><b class="${avail >= total ? '' : 'warn'}">${C.money(Math.abs(avail - total))}</b></div>` : ''}</div>
      <div style="margin-top:14px">${w.map(wishRow).join('') || '<div class="card empty">No wishlist items.<br>Add things you want, with a price and link.</div>'}</div>`;
  }
  const have = new Set(L.items.map((i) => i.type));
  return `<div class="screen">
    <div class="topbar"><button class="round" data-act="go" data-to="home" aria-label="Back">${icon('back', 19)}</button><div class="brand">Library</div>
      <button class="round" data-lb="new" aria-label="Add">${icon('plus', 19)}</button></div>
    <div class="filters">${[['log', 'Log'], ['collection', 'Collection'], ['wishlist', 'Wishlist']].map(([v, l]) => `<button class="pill ${V.tab === v ? 'on' : ''}" data-lb="tab" data-v="${v}">${l}</button>`).join('')}</div>
    ${have.size > 1 ? `<div class="filters" style="margin-top:10px"><button class="pill ${V.type === 'all' ? 'on' : ''}" data-lb="type" data-v="all">All</button>${TYPES.filter(([k]) => have.has(k)).map(([k, l]) => `<button class="pill ${V.type === k ? 'on' : ''}" data-lb="type" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
    ${body}
  </div>${C.nav('library')}`;
}

/* ---------- item sheet ---------- */
export function openItem(id, preset = {}) {
  const ex = id ? L.items.find((x) => x.id === id) : null;
  const base = { type: V.type !== 'all' ? V.type : 'book', title: '', creator: '', series: '', vol: 0, own: V.tab === 'collection' ? 'own' : V.tab === 'wishlist' ? 'want' : '', status: V.tab === 'log' ? 'active' : '', rating: 0, started: '', finished: '', price: 0, url: '', notes: '', ...preset };
  const d = { ...base, ...(ex || {}) };
  const el = C.openSheet(`<div class="hd"><h2>${ex ? 'Edit item' : 'Add item'}</h2></div>
    <div class="td-chips" id="lbType"></div>
    <input class="field" id="lbTitle" placeholder="Title" value="${esc(d.title)}" maxlength="120" style="margin-top:6px">
    <input class="field" id="lbCreator" placeholder="Author / director / studio (optional)" value="${esc(d.creator)}" maxlength="80" style="margin-top:10px">
    <div class="row3" style="margin-top:10px"><label><span>Series</span><input class="field" id="lbSeries" value="${esc(d.series)}" maxlength="80" placeholder="optional"></label><label><span>Volume</span><input class="field" id="lbVol" inputmode="numeric" value="${d.vol || ''}" placeholder="optional"></label></div>
    <div class="label" style="margin-top:14px">I…</div>
    <div class="td-chips" id="lbOwn"></div>
    <div class="label" style="margin-top:6px">Progress</div>
    <div class="td-chips" id="lbStatus"></div>
    <div id="lbExtra"></div>
    <div class="label" style="margin-top:6px">Notes</div>
    <textarea id="lbNotes" placeholder="Thoughts, where you left off…" style="min-height:80px">${esc(d.notes)}</textarea>
    <button class="btn-primary" id="lbSave">Save</button>
    ${ex && ex.own === 'want' ? '<button class="btn-ghost wide" id="lbGot" style="margin-top:10px;padding:14px">Got it — move to my collection</button>' : ''}
    ${ex ? '<button class="btn-ghost wide" id="lbDel" style="margin-top:10px;padding:14px;color:var(--danger)">Delete</button>' : ''}`);
  const q = (s) => el.querySelector(s);
  const keepFields = () => { d.title = q('#lbTitle').value; d.creator = q('#lbCreator').value; d.series = q('#lbSeries').value; d.vol = parseInt(q('#lbVol').value, 10) || 0; d.notes = q('#lbNotes').value; const r = (s) => q(s)?.value; if (q('#lbPrice')) { d.price = C.cents(r('#lbPrice')) || 0; d.url = r('#lbUrl'); } if (q('#lbStart')) { d.started = r('#lbStart'); d.finished = r('#lbFin'); } };
  const paint = () => {
    q('#lbType').innerHTML = TYPES.map(([k, l]) => `<button class="pill ${d.type === k ? 'on' : ''}" data-k="type" data-v="${k}">${l}</button>`).join('');
    q('#lbOwn').innerHTML = [['', 'Just log it'], ['own', 'Own it'], ['want', 'Want it']].map(([v, l]) => `<button class="pill ${d.own === v ? 'on' : ''}" data-k="own" data-v="${v}">${l}</button>`).join('');
    q('#lbStatus').innerHTML = [['', 'Not tracking'], ...STATUS].map(([v, l]) => `<button class="pill ${d.status === v ? 'on' : ''}" data-k="status" data-v="${v}">${l}</button>`).join('');
    let x = '';
    if (d.own === 'want') x += `<div class="row3" style="margin:8px 0"><label><span>Price $</span><input class="field" id="lbPrice" inputmode="decimal" value="${d.price ? (d.price / 100).toFixed(2) : ''}" placeholder="optional"></label><label><span>Link</span><input class="field" id="lbUrl" value="${esc(d.url)}" placeholder="optional"></label></div>`;
    if (d.status === 'active' || d.status === 'done' || d.status === 'dropped') x += `<div class="row3" style="margin:8px 0"><label><span>Started</span><input type="date" class="field" id="lbStart" value="${d.started || ''}"></label><label><span>${d.status === 'dropped' ? 'Stopped' : 'Finished'}</span><input type="date" class="field" id="lbFin" value="${d.finished || ''}"></label></div>`;
    if (d.status === 'done') x += `<div class="label">Rating</div><div class="lb-rate" id="lbRate">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" class="${n <= d.rating ? 'on' : ''}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}<button type="button" data-n="0" class="clr">Clear</button></div>`;
    q('#lbExtra').innerHTML = x;
  };
  paint();
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'), r = e.target.closest('#lbRate [data-n]');
    if (b) {
      keepFields(); d[b.dataset.k] = b.dataset.v;
      if (b.dataset.k === 'status' && d.status === 'done' && !d.finished) d.finished = today();
      if (b.dataset.k === 'status' && d.status === 'active' && !d.started) d.started = today();
      paint();
    } else if (r) { d.rating = +r.dataset.n; paint(); }
  });
  q('#lbSave').onclick = async () => {
    keepFields();
    if (!d.title.trim() && !d.series.trim()) return C.toast('Add a title');
    const rec = { ...(ex || {}), id: ex?.id || uid(), type: d.type, title: d.title.trim(), creator: d.creator.trim(), series: d.series.trim(), vol: d.vol, own: d.own, status: d.status, rating: d.status === 'done' ? d.rating : 0, started: d.started || '', finished: d.status === 'done' || d.status === 'dropped' ? d.finished || '' : '', price: d.own === 'want' ? d.price : 0, url: d.own === 'want' ? d.url.trim() : '', notes: d.notes.trim(), created: ex?.created || Date.now(), updated: Date.now() };
    if (ex) Object.assign(ex, rec); else L.items.push(rec);
    await save(); C.closeSheet(); C.render(); C.toast('Saved');
  };
  const got = q('#lbGot');
  if (got) got.onclick = async () => { Object.assign(ex, { own: 'own', price: ex.price, updated: Date.now() }); await save(); C.closeSheet(); C.render(); C.toast('Moved to your collection'); };
  const del = q('#lbDel');
  if (del) del.onclick = async () => { L.items = L.items.filter((x) => x.id !== id); await save(); C.closeSheet(); C.render(); C.toast('Deleted'); };
}

/* ---------- events ---------- */
const act = {
  tab: (t) => { V.tab = t.dataset.v; C.render(); },
  type: (t) => { V.type = t.dataset.v; C.render(); },
  new: () => openItem(null),
  open: (t) => openItem(t.dataset.id),
  addVol: (t) => openItem(null, { series: t.dataset.series, type: t.dataset.type, vol: +t.dataset.next, own: 'own', status: '' }),
  start: async (t) => { const i = L.items.find((x) => x.id === t.dataset.id); if (!i) return; i.status = 'active'; i.started = i.started || today(); i.updated = Date.now(); await save(); C.render(); },
  finish: async (t) => { const i = L.items.find((x) => x.id === t.dataset.id); if (!i) return; i.status = 'done'; i.finished = today(); i.updated = Date.now(); await save(); C.render(); openItem(i.id); },
  buy: (t) => { const i = L.items.find((x) => x.id === t.dataset.id); if (i) C.planWith(titleOf(i), i.price || 0); },
  goWish: () => { V.tab = 'wishlist'; if (location.hash === '#/library') C.render(); else C.go('library'); }
};
function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lb]');
    if (t && act[t.dataset.lb]) act[t.dataset.lb](t);
  });
}
