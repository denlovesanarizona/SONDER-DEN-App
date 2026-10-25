// budgetplus.js (v1.5): spending categories and recurring income for the Budget screen.
// Data lives inside the existing budget object: S.budget.cats and S.budget.recurring.
import { icon } from './icons.js';

let C = null;
export const DEFAULT_CATS = ['Books', 'Food', 'Tech', 'Clothes', 'Fun', 'Other'];
const EVERY = [['week', 'Every week'], ['2weeks', 'Every 2 weeks'], ['month', 'Every month']];

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dkey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const noon = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12, 0).getTime(); };
const endToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
const fmtDay = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const init = (ctx) => { C = ctx; if (!document.__bpBound) { document.__bpBound = true; bind(); } };
const B = () => C.S.budget;
const recs = () => (B().recurring = B().recurring || []);
export const cats = () => (B().cats && B().cats.length ? B().cats : DEFAULT_CATS);

/* ---------- categories on the planner ---------- */
export function catChipsHTML(sel) {
  return `<div class="label" style="margin-top:16px">Category <span style="text-transform:none;letter-spacing:0">(optional)</span></div>
    <div class="chips" id="planCats">${cats().map((c) => `<button type="button" class="pill ${sel === c ? 'on' : ''}" data-act="planCat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
}

/* ---------- recurring dates ---------- */
function advance(r) {
  const d = new Date(r.next);
  if (r.every === 'week') d.setDate(d.getDate() + 7);
  else if (r.every === '2weeks') d.setDate(d.getDate() + 14);
  else {
    const day = r.day || d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  r.next = d.getTime();
}
const dueCount = (r) => { let n = 0; const c = { ...r }; while (c.next <= endToday() && n < 60) { n++; advance(c); } return n; };
export const dueList = () => recs().filter((r) => r.on !== false && r.next <= endToday());

/* ---------- budget screen section ---------- */
export function html() {
  const b = B();
  const now = new Date();
  const month = b.txns.filter((t) => t.type === 'expense' && !t.history && new Date(t.ts).getFullYear() === now.getFullYear() && new Date(t.ts).getMonth() === now.getMonth());
  const by = {};
  month.forEach((t) => { const k = t.cat || 'No category'; by[k] = (by[k] || 0) + t.amount; });
  const rows = Object.entries(by).sort((a, z) => z[1] - a[1]);
  const total = rows.reduce((n, [, v]) => n + v, 0);
  const max = rows[0]?.[1] || 1;
  const due = dueList().map((r) => {
    const n = dueCount(r);
    return `<div class="card bp-due"><div class="l"><b>${esc(r.title)}</b><span>Due ${esc(fmtDay(r.next))}${n > 1 ? ` · +${n - 1} more` : ''}</span></div>
      <span class="a">+${C.money(r.amount)}</span><div class="bp-btns"><button class="btn-primary" data-bp="receive" data-id="${r.id}">Got it</button><button class="btn-ghost" data-bp="skip" data-id="${r.id}">Skip</button></div></div>`;
  }).join('');
  return `${due ? `<div class="eyebrow">Due now</div>${due}` : ''}
    <div class="row-between"><div class="eyebrow">Spending by category</div><button class="link" data-bp="cats">Edit</button></div>
    <div class="card chartcard">${rows.length ? rows.map(([k, v]) => `<div class="moodrow"><span class="nm" style="width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k)}</span><span class="tr"><i style="width:${(v / max) * 100}%"></i></span><span class="n" style="width:64px">${C.money(v)}</span></div>`).join('')
      + `<p class="sub" style="margin:10px 0 0;font-size:12.5px">${C.money(total)} this month. Pick a category when you plan a purchase.</p>` : '<div class="empty" style="padding:12px">No purchases this month yet.</div>'}</div>
    <button class="card bp-rec" data-bp="rec"><span class="l"><b>Recurring income</b><span>${recs().filter((r) => r.on !== false).length ? `${recs().filter((r) => r.on !== false).length} active` : 'Allowance, yard work, a paycheck…'}</span></span>${icon('chevron', 18)}</button>`;
}

/* ---------- sheets ---------- */
function catsSheet() {
  const el = C.openSheet(`<div class="hd"><h2>Categories</h2></div>
    <p class="sub" style="margin:-8px 0 12px;line-height:1.5">Separate them with commas. Old purchases keep the category they were saved with.</p>
    <textarea id="bpCats" style="min-height:90px" spellcheck="false">${esc(cats().join(', '))}</textarea>
    <button class="btn-primary" id="bpSave">Save</button>
    <button class="btn-ghost wide" id="bpReset" style="margin-top:10px;padding:14px">Back to the defaults</button>`);
  el.querySelector('#bpSave').onclick = async () => {
    const list = [...new Set(el.querySelector('#bpCats').value.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 30);
    if (!list.length) return C.toast('Add at least one category');
    B().cats = list; await C.saveBudget(); C.closeSheet(); C.render();
  };
  el.querySelector('#bpReset').onclick = async () => { B().cats = null; await C.saveBudget(); C.closeSheet(); C.render(); };
}

function recSheet() {
  const list = recs();
  const el = C.openSheet(`<div class="hd"><h2>Recurring income</h2></div>
    <p class="sub" style="margin:-8px 0 12px;line-height:1.5">Sonder reminds you when money is due. It only counts after you tap “Got it”.</p>
    ${list.length ? list.map((r) => `<div class="card bp-line"><button class="l" data-bp="edit" data-id="${r.id}"><b>${esc(r.title)} · ${C.money(r.amount)}</b><span>${esc(EVERY.find(([k]) => k === r.every)?.[1] || '')} · next ${esc(fmtDay(r.next))}</span></button>
      <button data-bp="toggle" data-id="${r.id}" aria-label="On or off"><span class="toggle ${r.on !== false ? 'on' : ''}"></span></button></div>`).join('') : ''}
    <button class="btn-primary" data-bp="new" style="margin-top:12px">${icon('plus', 16)}Add recurring income</button>`);
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-bp]'); if (!t) return;
    if (t.dataset.bp === 'new') editSheet(null);
    else if (t.dataset.bp === 'edit') editSheet(t.dataset.id);
    else if (t.dataset.bp === 'toggle') { const r = recs().find((x) => x.id === t.dataset.id); r.on = r.on === false; await C.saveBudget(); C.render(); recSheet(); }
  });
}

function editSheet(id) {
  const ex = id ? recs().find((r) => r.id === id) : null;
  const d = { title: ex?.title || '', amount: ex ? C.moneyIn(ex.amount) : '', every: ex?.every || 'week', only: ex?.only || '', first: dkey(ex ? ex.next : Date.now()) };
  const el = C.openSheet(`<div class="hd"><h2>${ex ? 'Edit' : 'New'} recurring income</h2></div>
    <input class="field" id="rcTitle" placeholder="What is it? (e.g. Cutting grass)" value="${esc(d.title)}" maxlength="50">
    <input class="field" id="rcAmt" inputmode="decimal" placeholder="Amount" value="${esc(d.amount)}" style="margin-top:10px">
    <div class="label" style="margin-top:14px">How often</div><div class="chips" id="rcEvery"></div>
    <div class="label">${ex ? 'Next due' : 'First due'}</div><input type="date" class="field" id="rcFirst" value="${d.first}">
    <div class="label" style="margin-top:14px">Put it in</div><div class="chips" id="rcWhere"></div>
    <button class="btn-primary" id="rcSave" style="margin-top:8px">Save</button>
    ${ex ? '<button class="btn-ghost wide" id="rcDel" style="margin-top:10px;padding:14px;color:var(--danger)">Delete</button>' : ''}`);
  const q = (s) => el.querySelector(s);
  const paint = () => {
    q('#rcEvery').innerHTML = EVERY.map(([k, l]) => `<button type="button" class="pill ${d.every === k ? 'on' : ''}" data-e="${k}">${l}</button>`).join('');
    q('#rcWhere').innerHTML = `<button type="button" class="pill ${d.only === '' ? 'on' : ''}" data-w="">Split</button>` + B().buckets.map((k) => `<button type="button" class="pill ${d.only === k.id ? 'on' : ''}" data-w="${esc(k.id)}">${esc(k.name)}</button>`).join('');
  };
  paint();
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-e]'), w = e.target.closest('[data-w]');
    if (a) { d.every = a.dataset.e; paint(); } else if (w) { d.only = w.dataset.w; paint(); }
  });
  q('#rcSave').onclick = async () => {
    const title = q('#rcTitle').value.trim(), amount = C.cents(q('#rcAmt').value);
    if (!title) return C.toast('Give it a name');
    if (!(amount > 0)) return C.toast('Enter an amount');
    const first = q('#rcFirst').value || dkey(Date.now());
    const rec = { ...(ex || {}), id: ex?.id || C.uid(), title, amount, every: d.every, only: d.only, next: noon(first), day: Number(first.slice(8)), on: ex ? ex.on : true };
    if (ex) Object.assign(ex, rec); else recs().push(rec);
    await C.saveBudget(); C.closeSheet(); C.render(); recSheet();
  };
  const del = q('#rcDel');
  if (del) del.onclick = async () => { B().recurring = recs().filter((r) => r.id !== id); await C.saveBudget(); C.closeSheet(); C.render(); recSheet(); };
}

/* ---------- events ---------- */
const act = {
  cats: catsSheet,
  rec: recSheet,
  receive: async (t) => {
    const r = recs().find((x) => x.id === t.dataset.id); if (!r) return;
    C.upsertTxn({ id: C.uid(), type: 'income', ts: r.next, amount: r.amount, title: r.title, only: r.only || '', alloc: C.splitCents(r.amount, r.only || ''), history: false, rec: r.id, updated: Date.now() });
    advance(r); await C.saveBudget(); C.toast(`Added ${C.money(r.amount)}`); C.render();
  },
  skip: async (t) => { const r = recs().find((x) => x.id === t.dataset.id); if (!r) return; advance(r); await C.saveBudget(); C.render(); }
};
function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-bp]');
    if (t && act[t.dataset.bp] && !t.closest('.sheet')) act[t.dataset.bp](t);
  });
}
