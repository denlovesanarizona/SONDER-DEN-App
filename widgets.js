// widgets.js (v1.5): the optional blocks on the Home screen. Turn them on, off and reorder them in Account > Appearance.
import { icon } from './icons.js';

let C = null;
export const init = (ctx) => { C = ctx; };

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dk = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); const t = new Date(y, m - 1, d); t.setDate(t.getDate() + n); return dk(t); };
const real = () => C.S.items.filter((i) => !i.summary);

function streak() {
  const days = new Set(real().map((i) => dk(i.ts)));
  const t = dk(Date.now());
  let cur = 0, k = days.has(t) ? t : addDays(t, -1);
  while (days.has(k)) { cur++; k = addDays(k, -1); }
  let best = 0, run = 0, prev = null;
  for (const d of [...days].sort()) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return { cur, best, days };
}

const W = {
  shortcuts: () => `<div class="wlinks">
    <button class="card wl" data-act="go" data-to="search">${icon('search', 20)}<span>Search</span></button>
    <button class="card wl" data-act="go" data-to="todo">${icon('todo', 20)}<span>To-do</span></button>
    <button class="card wl" data-act="go" data-to="library">${icon('books', 20)}<span>Library</span></button>
    <button class="card wl" data-act="go" data-to="budget">${icon('wallet', 20)}<span>Budget</span></button></div>`,

  streak: () => {
    const { cur, best, days } = streak();
    const t = dk(Date.now());
    const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    return `<div class="card wgt"><div class="wgt-hd"><span class="k">STREAK</span><span class="sub" style="margin:0">Best ${best}</span></div>
      <div class="wstreak"><b>${cur}</b><span>day${cur === 1 ? '' : 's'} in a row</span></div>
      <div class="wdots">${week.map((k) => `<i class="${days.has(k) ? 'on' : ''}" title="${k}"></i>`).join('')}</div></div>`;
  },

  week: () => {
    const per = {};
    real().forEach((i) => { const k = dk(i.ts); per[k] = (per[k] || 0) + 1; });
    const t = dk(Date.now());
    const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    const mx = Math.max(1, ...week.map((k) => per[k] || 0));
    const sum = week.reduce((n, k) => n + (per[k] || 0), 0);
    return `<div class="card wgt"><div class="wgt-hd"><span class="k">THIS WEEK</span><span class="sub" style="margin:0">${sum} item${sum === 1 ? '' : 's'}</span></div>
      <div class="bars" style="height:70px">${week.map((k) => `<div class="b"><i class="${per[k] ? '' : 'zero'}" style="height:${per[k] ? Math.max(10, (per[k] / mx) * 100) : 4}%"></i>${new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8)).toLocaleDateString('en-US', { weekday: 'narrow' })}</div>`).join('')}</div></div>`;
  },

  onthisday: () => {
    const now = new Date();
    const day = now.getDate();
    const hits = real().filter((i) => {
      const d = new Date(i.ts);
      if (i.kind !== 'journal' || dk(i.ts) === dk(now)) return false;
      return d.getDate() === day && (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth());
    }).slice(0, 3);
    if (!hits.length) return '';
    const ago = (ts) => {
      const d = new Date(ts);
      const m = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
      if (m >= 12 && m % 12 === 0) return `${m / 12} year${m === 12 ? '' : 's'} ago`;
      return `${m} month${m === 1 ? '' : 's'} ago`;
    };
    return `<div class="card wgt"><div class="wgt-hd"><span class="k">ON THIS DAY</span></div>
      ${hits.map((i) => `<button class="lb-mini" data-act="edit" data-id="${i.id}" data-open="1"><b>${esc(i.title || 'Untitled')}</b><span>${esc(ago(i.ts))} · ${esc((i.body || '').replace(/\s+/g, ' ').slice(0, 70))}</span></button>`).join('')}</div>`;
  },

  todo: () => C.todo.widgetHTML(),
  reading: () => C.lib.readingWidget(),
  wishlist: () => C.lib.wishlistWidget()
};

export const html = (id) => (W[id] ? W[id]() : '');
