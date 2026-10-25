// search.js (v1.5): one search box for journal entries, logs, summaries, to-dos, library and budget records.
import { icon } from './icons.js';

let C = null;
const Q = { q: '', type: 'all', sort: 'new', more: 40, recent: [] };
let timer;

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmt = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const TYPE = { journal: 'Journal', event: 'Events', todo: 'To-do', lib: 'Library', budget: 'Budget' };

export async function init(ctx) {
  C = ctx;
  Q.recent = (await C.db.getMeta('recentSearches')) || [];
  if (!document.__srBound) { document.__srBound = true; bind(); }
}

/* "quoted phrases" stay together, everything else is split into words; all of them must match */
function terms(q) {
  const out = [];
  q.replace(/"([^"]+)"|(\S+)/g, (_, a, b) => { out.push(norm(a || b)); return ''; });
  return out.filter(Boolean);
}
function collect() {
  const S = C.S, rows = [];
  for (const i of S.items) {
    const text = `${i.title || ''}\n${i.body || ''}`;
    rows.push({ t: i.kind === 'journal' ? 'journal' : 'event', id: i.id, ts: i.ts, title: i.kind === 'journal' ? i.title || 'Untitled' : i.summary ? (i.approx || 'Summary') : 'Quick log', text: i.kind === 'journal' ? i.body || '' : i.body || '', hay: norm(text) });
  }
  for (const i of C.todo.all()) rows.push({ t: 'todo', id: i.id, ts: i.created || 0, title: i.done ? 'Done task' : 'Task', text: `${i.text}${i.note ? ` — ${i.note}` : ''}`, hay: norm(`${i.text} ${i.note || ''}`) });
  for (const i of C.lib.all()) rows.push({ t: 'lib', id: i.id, ts: i.updated || i.created || 0, title: C.lib.label(i), text: [i.creator, i.notes].filter(Boolean).join(' — '), hay: norm(`${i.title} ${i.series} ${i.creator} ${i.notes}`) });
  for (const x of S.budget.txns) rows.push({ t: 'budget', id: x.id, ts: x.ts, title: x.title || (x.type === 'income' ? 'Income' : 'Purchase'), text: (x.items || []).map((m) => m.name).join(', '), hay: norm(`${x.title} ${x.store || ''} ${x.cat || ''} ${(x.items || []).map((m) => m.name).join(' ')}`) });
  return rows;
}
function run() {
  const ts = terms(Q.q);
  if (!ts.length) return { rows: [], counts: {} };
  const matched = [];
  for (const r of collect()) {
    let score = 0, ok = true;
    for (const t of ts) { const n = r.hay.split(t).length - 1; if (!n) { ok = false; break; } score += n; }
    if (ok) matched.push({ ...r, score: score + (ts.some((t) => norm(r.title).includes(t)) ? 3 : 0) });
  }
  const counts = { all: matched.length };
  matched.forEach((r) => { counts[r.t] = (counts[r.t] || 0) + 1; });
  let rows = Q.type === 'all' ? matched : matched.filter((r) => r.t === Q.type);
  rows.sort(Q.sort === 'best' ? (a, b) => b.score - a.score || b.ts - a.ts : Q.sort === 'old' ? (a, b) => a.ts - b.ts : (a, b) => b.ts - a.ts);
  return { rows, counts, ts };
}
function snippet(text, ts) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const n = norm(flat);
  let at = -1;
  for (const t of ts) { const i = n.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const start = Math.max(0, at - 50);
  const piece = flat.slice(start, start + 170);
  return (start > 0 ? '…' : '') + piece + (start + 170 < flat.length ? '…' : '');
}
function mark(text, ts) {
  const n = norm(text), spans = [];
  for (const t of ts) { let i = 0; while ((i = n.indexOf(t, i)) >= 0) { spans.push([i, i + t.length]); i += t.length; } }
  spans.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  for (const [a, b] of spans) { if (a < pos) continue; out += esc(text.slice(pos, a)) + `<mark>${esc(text.slice(a, b))}</mark>`; pos = b; }
  return out + esc(text.slice(pos));
}

function paint() {
  const box = document.getElementById('srOut');
  if (!box) return;
  const tabs = document.getElementById('srTabs');
  if (!Q.q.trim()) {
    tabs.innerHTML = '';
    box.innerHTML = Q.recent.length
      ? `<div class="eyebrow">Recent searches</div><div class="td-chips">${Q.recent.map((r) => `<button class="pill" data-sr="recent" data-v="${esc(r)}">${esc(r)}</button>`).join('')}<button class="link" data-sr="clearRecent" style="margin-left:6px">Clear</button></div>`
      : '<div class="card empty" style="margin-top:18px">Search your journal, quick logs, to-dos, library and budget.<br>Use “quotes” for an exact phrase.</div>';
    return;
  }
  const { rows, counts, ts } = run();
  const order = [['all', 'All'], ['journal', 'Journal'], ['event', 'Events'], ['todo', 'To-do'], ['lib', 'Library'], ['budget', 'Budget']];
  tabs.innerHTML = order.filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => `<button class="pill ${Q.type === k ? 'on' : ''}" data-sr="type" data-v="${k}">${l} ${counts[k] || 0}</button>`).join('')
    + `<select id="srSort" aria-label="Sort"><option value="new" ${Q.sort === 'new' ? 'selected' : ''}>Newest</option><option value="old" ${Q.sort === 'old' ? 'selected' : ''}>Oldest</option><option value="best" ${Q.sort === 'best' ? 'selected' : ''}>Best match</option></select>`;
  if (!rows.length) { box.innerHTML = '<div class="card empty" style="margin-top:18px">No matches.</div>'; return; }
  const shown = rows.slice(0, Q.more);
  box.innerHTML = `<div class="sub" style="margin:14px 4px 10px">${rows.length} result${rows.length === 1 ? '' : 's'}</div>
    ${shown.map((r) => `<button class="card sr-row" data-sr="open" data-t="${r.t}" data-id="${r.id}">
      <span class="sr-top"><span class="tag mood">${TYPE[r.t]}</span><span>${r.ts ? esc(fmt(r.ts)) : ''}</span></span>
      <b>${mark(r.title, ts)}</b>${r.text ? `<span class="sr-snip">${mark(snippet(r.text, ts), ts)}</span>` : ''}</button>`).join('')}
    ${rows.length > Q.more ? `<button class="btn-ghost wide" data-sr="more" style="margin-top:6px">Show more</button>` : ''}`;
}

export function html() {
  return `<div class="screen">
    <div class="topbar"><button class="round" data-act="go" data-to="home" aria-label="Back">${icon('back', 19)}</button><div class="brand">Search</div><span style="width:40px"></span></div>
    <div class="card logbar" style="margin-top:4px"><span style="color:var(--muted);display:flex">${icon('search', 18)}</span><input id="srIn" type="search" placeholder="Search everything…" enterkeyhint="search" autocomplete="off" value="${esc(Q.q)}"><button data-sr="clear" aria-label="Clear" style="${Q.q ? '' : 'display:none'}" id="srClr">${icon('x', 16)}</button></div>
    <div class="filters" id="srTabs"></div>
    <div id="srOut"></div>
  </div>${C.nav('search')}`;
}
export function mount() {
  paint();
  const i = document.getElementById('srIn');
  if (i && !Q.q) setTimeout(() => i.focus(), 80);
}

async function remember(q) {
  q = q.trim();
  if (!q) return;
  Q.recent = [q, ...Q.recent.filter((x) => x !== q)].slice(0, 8);
  await C.db.setMeta('recentSearches', Q.recent);
}
const act = {
  type: (t) => { Q.type = t.dataset.v; Q.more = 40; paint(); },
  more: () => { Q.more += 40; paint(); },
  recent: (t) => { Q.q = t.dataset.v; const i = document.getElementById('srIn'); i.value = Q.q; document.getElementById('srClr').style.display = ''; paint(); },
  clearRecent: async () => { Q.recent = []; await C.db.delMeta('recentSearches'); paint(); },
  clear: () => { Q.q = ''; const i = document.getElementById('srIn'); i.value = ''; document.getElementById('srClr').style.display = 'none'; i.focus(); paint(); },
  open: async (t) => {
    await remember(Q.q);
    const { id, t: kind } = t.dataset;
    if (kind === 'journal') { C.S.from = 'search'; C.go(`edit/${id}`); }
    else if (kind === 'event') C.openLog(id);
    else if (kind === 'todo') C.todo.openItem(id);
    else if (kind === 'lib') C.lib.openItem(id);
    else if (kind === 'budget') C.openTx(id);
  }
};
function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sr]');
    if (t && act[t.dataset.sr]) act[t.dataset.sr](t);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'srIn') return;
    Q.q = e.target.value; Q.more = 40;
    document.getElementById('srClr').style.display = Q.q ? '' : 'none';
    clearTimeout(timer); timer = setTimeout(paint, 120);
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'srSort') { Q.sort = e.target.value; paint(); } });
  document.addEventListener('keydown', (e) => { if (e.target.id === 'srIn' && e.key === 'Enter') { remember(Q.q); e.target.blur(); } });
}
