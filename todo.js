// todo.js (v1.5): lists and to-dos. Stored in IndexedDB meta key 'todos'.
import { icon } from './icons.js';

let C = null;
let T = { lists: [{ id: 'inbox', name: 'Inbox' }], items: [] };
const V = { view: 'todo', list: 'all', due: '', listPick: 'inbox' };   // screen state (not saved)

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => key(new Date());
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); const t = new Date(y, m - 1, d); t.setDate(t.getDate() + n); return key(t); };
const toDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
function dueLabel(k) {
  if (!k) return '';
  const t = today();
  if (k === t) return 'Today';
  if (k === addDays(t, 1)) return 'Tomorrow';
  if (k === addDays(t, -1)) return 'Yesterday';
  const d = toDate(k);
  const diff = Math.round((d - toDate(t)) / 864e5);
  if (diff > 0 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const save = () => C.db.setMeta('todos', T);
const listName = (id) => T.lists.find((l) => l.id === id)?.name || 'Inbox';

export async function init(ctx) {
  C = ctx;
  const s = await C.db.getMeta('todos');
  if (s && Array.isArray(s.items) && Array.isArray(s.lists) && s.lists.length) T = s;
  if (!document.__tdBound) { document.__tdBound = true; bind(); }
}
export const all = () => T.items;
export const backup = () => JSON.parse(JSON.stringify(T));
export async function erase() { T = { lists: [{ id: 'inbox', name: 'Inbox' }], items: [] }; await C.db.delMeta('todos'); }
export async function restore(inc) {
  if (!inc || !Array.isArray(inc.items)) return 0;
  let n = 0;
  for (const l of inc.lists || []) if (l && typeof l.id === 'string' && l.name && !T.lists.some((x) => x.id === l.id)) T.lists.push({ id: l.id, name: String(l.name) });
  for (const it of inc.items) {
    if (!it || typeof it.id !== 'string' || typeof it.text !== 'string') continue;
    const cur = T.items.find((x) => x.id === it.id);
    if (!cur) { T.items.push(it); n++; } else if ((it.updated || 0) > (cur.updated || 0)) { Object.assign(cur, it); n++; }
  }
  await save();
  return n;
}

/* ---------- ordering ---------- */
const open = () => T.items.filter((i) => !i.done);
function rank(a, b) {
  const t = today();
  const grp = (i) => (!i.due ? 3 : i.due < t ? 0 : i.due === t ? 1 : 2);
  return grp(a) - grp(b) || (a.due || '').localeCompare(b.due || '') || (b.pri || 0) - (a.pri || 0) || a.created - b.created;
}
export const openCount = () => open().length;
export const dueTodayCount = () => open().filter((i) => i.due && i.due <= today()).length;
export const topOpen = (n = 4) => [...open()].sort(rank).slice(0, n);

/* ---------- rows ---------- */
function row(i, showList) {
  const t = today();
  const late = !i.done && i.due && i.due < t;
  return `<div class="td-row ${i.done ? 'done' : ''}">
    <button class="td-check ${i.done ? 'on' : ''}" data-td="toggle" data-id="${i.id}" aria-label="${i.done ? 'Mark not done' : 'Mark done'}">${i.done ? icon('check', 15) : ''}</button>
    <button class="td-main" data-td="open" data-id="${i.id}"><span class="td-text">${esc(i.text)}</span>
      <span class="td-meta">${i.due ? `<span class="${late ? 'late' : ''}">${esc(dueLabel(i.due))}</span>` : ''}${showList ? `<span>${esc(listName(i.list))}</span>` : ''}${i.note ? '<span>note</span>' : ''}</span></button>
    <button class="td-star ${i.pri ? 'on' : ''}" data-td="star" data-id="${i.id}" aria-label="Important">${i.pri ? '★' : '☆'}</button></div>`;
}

export function widgetHTML() {
  const items = topOpen(4);
  const n = openCount();
  return `<div class="card wgt"><div class="wgt-hd"><span class="k">TO-DO</span><button class="link" data-act="go" data-to="todo">${n ? `${n} open` : 'Open'}</button></div>
    ${items.length ? items.map((i) => row(i, false)).join('') : '<p class="sub" style="margin:4px 0 2px">All clear. Add something from the to-do page.</p>'}</div>`;
}

/* ---------- screen ---------- */
export function html() {
  const t = today();
  const showList = V.list === 'all' && T.lists.length > 1;
  let list = V.view === 'done' ? T.items.filter((i) => i.done) : open();
  if (V.list !== 'all') list = list.filter((i) => i.list === V.list);
  let body = '';
  if (V.view === 'done') {
    list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    body = list.length ? `${list.map((i) => row(i, showList)).join('')}<button class="btn-ghost" data-td="clearDone" style="margin-top:14px">Clear completed</button>` : '<div class="card empty">Nothing completed yet.</div>';
  } else {
    if (V.view === 'today') list = list.filter((i) => i.due && i.due <= t);
    list.sort(rank);
    const sect = (label, arr, cls = '') => (arr.length ? `<div class="td-sec ${cls}">${label}</div>${arr.map((i) => row(i, showList)).join('')}` : '');
    const late = list.filter((i) => i.due && i.due < t), td = list.filter((i) => i.due === t);
    const up = list.filter((i) => i.due && i.due > t), none = list.filter((i) => !i.due);
    body = list.length
      ? sect('Overdue', late, 'late') + sect('Today', td) + sect('Upcoming', up) + sect(V.view === 'todo' ? 'No date' : '', none)
      : `<div class="card empty">${V.view === 'today' ? 'Nothing due today.' : 'Nothing to do. Add your first task above.'}</div>`;
  }
  const dueChip = (v, l) => `<button class="pill ${V.due === v ? 'on' : ''}" data-td="dueQuick" data-v="${v}">${l}</button>`;
  const custom = V.due && V.due !== 'today' && V.due !== 'tomorrow' ? `<button class="pill on" data-td="dueQuick" data-v="">${esc(dueLabel(V.due))} ×</button>` : '';
  return `<div class="screen">
    <div class="topbar"><button class="round" data-act="go" data-to="home" aria-label="Back">${icon('back', 19)}</button><div class="brand">To-do</div>
      <button class="round" data-td="lists" aria-label="Lists">${icon('gear', 19)}</button></div>
    <div class="card td-add"><input id="tdIn" placeholder="Add a task…" enterkeyhint="done" autocomplete="off"><button data-td="add" aria-label="Add">${icon('plus', 20)}</button></div>
    <div class="td-chips">${dueChip('today', 'Today')}${dueChip('tomorrow', 'Tomorrow')}${custom || `<span class="dtwrap"><button class="pill" data-td="pickDue">${icon('calendar', 14)}Date</button><input type="date" id="tdDue" class="hidden-dt"></span>`}
      ${T.lists.length > 1 ? `<select id="tdListPick" aria-label="List">${T.lists.map((l) => `<option value="${l.id}" ${V.listPick === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>` : ''}</div>
    <div class="filters" style="margin-top:16px">${[['todo', 'To do'], ['today', 'Today'], ['done', 'Done']].map(([v, l]) => `<button class="pill ${V.view === v ? 'on' : ''}" data-td="view" data-v="${v}">${l}</button>`).join('')}</div>
    ${T.lists.length > 1 ? `<div class="filters" style="margin-top:10px"><button class="pill ${V.list === 'all' ? 'on' : ''}" data-td="listf" data-v="all">All lists</button>${T.lists.map((l) => `<button class="pill ${V.list === l.id ? 'on' : ''}" data-td="listf" data-v="${l.id}">${esc(l.name)}</button>`).join('')}</div>` : ''}
    <div style="margin-top:14px">${body}</div>
  </div>${C.nav('todo')}`;
}

/* ---------- item sheet ---------- */
export function openItem(id) {
  const it = T.items.find((x) => x.id === id);
  if (!it) return;
  let due = it.due || '', list = it.list, pri = it.pri || 0;
  const el = C.openSheet(`<div class="hd"><h2>Edit task</h2></div>
    <input class="field" id="tiText" value="${esc(it.text)}" maxlength="200">
    <textarea id="tiNote" placeholder="Notes (optional)" style="margin-top:10px;min-height:80px">${esc(it.note || '')}</textarea>
    <div class="label">Due</div>
    <div class="td-chips" id="tiDue"></div>
    ${T.lists.length > 1 ? `<div class="label" style="margin-top:12px">List</div><div class="td-chips" id="tiList"></div>` : ''}
    <div class="setrow" id="tiPri" style="border:0;padding:12px 0 4px;cursor:pointer"><span class="t">Important</span><span class="toggle ${pri ? 'on' : ''}"></span></div>
    <button class="btn-primary" id="tiSave" style="margin-top:14px">Save</button>
    <button class="btn-ghost wide" id="tiDel" style="margin-top:10px;padding:14px;color:var(--danger)">Delete</button>`);
  const q = (s) => el.querySelector(s);
  const paint = () => {
    const t = today();
    q('#tiDue').innerHTML = [['Today', t], ['Tomorrow', addDays(t, 1)], ['Next week', addDays(t, 7)], ['None', '']].map(([l, v]) => `<button class="pill ${due === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')
      + `<span class="dtwrap"><button class="pill ${due && ![t, addDays(t, 1), addDays(t, 7)].includes(due) ? 'on' : ''}" id="tiPick">${icon('calendar', 14)}${due && ![t, addDays(t, 1), addDays(t, 7)].includes(due) ? esc(dueLabel(due)) : 'Pick'}</button><input type="date" id="tiDate" class="hidden-dt" value="${due}"></span>`;
    if (q('#tiList')) q('#tiList').innerHTML = T.lists.map((l) => `<button class="pill ${list === l.id ? 'on' : ''}" data-l="${l.id}">${esc(l.name)}</button>`).join('');
    q('#tiPri .toggle').classList.toggle('on', !!pri);
  };
  paint();
  el.addEventListener('click', (e) => {
    const d = e.target.closest('#tiDue [data-v]'), l = e.target.closest('[data-l]');
    if (d) { due = d.dataset.v; paint(); }
    else if (l) { list = l.dataset.l; paint(); }
    else if (e.target.closest('#tiPick')) { try { q('#tiDate').showPicker(); } catch { q('#tiDate').click(); } }
    else if (e.target.closest('#tiPri')) { pri = pri ? 0 : 1; paint(); }
  });
  q('#tiDate').addEventListener('change', (e) => { due = e.target.value || ''; paint(); });
  q('#tiSave').onclick = async () => {
    const text = q('#tiText').value.trim();
    if (!text) return C.toast('A task needs some text');
    Object.assign(it, { text, note: q('#tiNote').value.trim(), due, list, pri, updated: Date.now() });
    await save(); C.closeSheet(); C.render();
  };
  q('#tiDel').onclick = async () => { T.items = T.items.filter((x) => x.id !== id); await save(); C.closeSheet(); C.render(); C.toast('Deleted'); };
}

function listsSheet() {
  const el = C.openSheet(`<div class="hd"><h2>Lists</h2></div>
    <div id="lsList">${T.lists.map((l) => `<div class="bkedit" data-id="${l.id}" style="display:flex;gap:8px;align-items:center"><input class="field" data-f="name" value="${esc(l.name)}" maxlength="30" style="padding:12px 14px;font-size:16px">${l.id === 'inbox' ? '<span style="width:34px"></span>' : `<button type="button" class="xbtn" data-del aria-label="Delete list">${icon('trash', 16)}</button>`}</div>`).join('')}</div>
    <button class="btn-ghost wide" id="lsAdd">${icon('plus', 16)}Add a list</button>
    <button class="btn-primary" id="lsSave" style="margin-top:16px">Save</button>`);
  el.addEventListener('click', (e) => {
    if (e.target.closest('#lsAdd')) { el.querySelector('#lsList').insertAdjacentHTML('beforeend', `<div class="bkedit" data-id="${uid()}" data-new="1" style="display:flex;gap:8px;align-items:center"><input class="field" data-f="name" placeholder="List name" maxlength="30" style="padding:12px 14px;font-size:16px"><button type="button" class="xbtn" data-del aria-label="Remove">${icon('trash', 16)}</button></div>`); el.querySelector('#lsList .bkedit:last-child input').focus(); }
    const d = e.target.closest('[data-del]');
    if (d) d.closest('.bkedit').remove();
  });
  el.querySelector('#lsSave').onclick = async () => {
    const rows = [...el.querySelectorAll('.bkedit')].map((r) => ({ id: r.dataset.id, name: r.querySelector('input').value.trim() })).filter((r) => r.name);
    const keep = new Set(rows.map((r) => r.id));
    T.items.forEach((i) => { if (!keep.has(i.list)) i.list = 'inbox'; });
    if (!keep.has('inbox')) rows.unshift({ id: 'inbox', name: 'Inbox' });
    T.lists = rows;
    if (V.list !== 'all' && !keep.has(V.list)) V.list = 'all';
    await save(); C.closeSheet(); C.render();
  };
}

/* ---------- events ---------- */
async function add() {
  const inp = document.getElementById('tdIn');
  const text = inp?.value.trim();
  if (!text) { inp?.focus(); return; }
  const t = today();
  const due = V.due === 'today' ? t : V.due === 'tomorrow' ? addDays(t, 1) : V.due;
  const list = T.lists.some((l) => l.id === V.listPick) ? V.listPick : 'inbox';
  T.items.push({ id: uid(), text, note: '', due, list: V.list !== 'all' ? V.list : list, pri: 0, done: false, created: Date.now(), updated: Date.now() });
  V.due = '';
  await save(); C.render();
  document.getElementById('tdIn')?.focus();
}
const act = {
  add,
  toggle: async (t) => {
    const it = T.items.find((x) => x.id === t.dataset.id); if (!it) return;
    it.done = !it.done; it.doneAt = it.done ? Date.now() : null; it.updated = Date.now();
    await save(); C.render();
  },
  star: async (t) => { const it = T.items.find((x) => x.id === t.dataset.id); if (!it) return; it.pri = it.pri ? 0 : 1; it.updated = Date.now(); await save(); C.render(); },
  open: (t) => openItem(t.dataset.id),
  view: (t) => { V.view = t.dataset.v; C.render(); },
  listf: (t) => { V.list = t.dataset.v; C.render(); },
  dueQuick: (t) => { V.due = V.due === t.dataset.v ? '' : t.dataset.v; keepText(); C.render(); restoreText(); },
  pickDue: () => { const i = document.getElementById('tdDue'); try { i.showPicker(); } catch { i.click(); } },
  lists: listsSheet,
  clearDone: async () => {
    if (!(await C.confirmSheet({ title: 'Clear completed?', text: 'Completed tasks will be removed for good.', ok: 'Clear', danger: true }))) return;
    T.items = T.items.filter((i) => !i.done); await save(); C.render();
  }
};
let keep = '';
const keepText = () => { keep = document.getElementById('tdIn')?.value || ''; };
const restoreText = () => { const i = document.getElementById('tdIn'); if (i) i.value = keep; };

function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-td]');
    if (t && act[t.dataset.td]) act[t.dataset.td](t);
  });
  document.addEventListener('keydown', (e) => { if (e.target.id === 'tdIn' && e.key === 'Enter') add(); });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'tdDue') { V.due = e.target.value || ''; keepText(); C.render(); restoreText(); }
    else if (e.target.id === 'tdListPick') V.listPick = e.target.value;
  });
}
