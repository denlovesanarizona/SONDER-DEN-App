// modules.js (v1.5): one door between app.js and the newer modules (search, to-do, library, widgets, budget extras).
import * as todo from './todo.js';
import * as lib from './library.js';
import * as search from './search.js';
import * as widgets from './widgets.js';
import * as bplus from './budgetplus.js';

export async function modulesInit(ctx) {
  const c = { ...ctx, todo, lib };
  await todo.init(c);
  await lib.init(c);
  await search.init(c);
  bplus.init(c);
  widgets.init(c);
}

const ROUTES = { todo: () => todo.html(), library: (a) => lib.html(a), search: () => search.html() };
export const moduleRoute = (name) => name in ROUTES;
export const moduleHTML = (name, arg) => ROUTES[name](arg);
export const moduleMount = (name) => { if (name === 'search') search.mount(); };

export const homeWidgetHTML = widgets.html;
export const budgetPlusHTML = bplus.html;
export const catChipsHTML = bplus.catChipsHTML;
export const todoOpenCount = todo.openCount;

export const modulesBackup = () => ({ todos: todo.backup(), library: lib.backup() });
export async function modulesRestore(data) {
  return (await todo.restore(data.todos)) + (await lib.restore(data.library));
}
export async function modulesErase() { await todo.erase(); await lib.erase(); }
