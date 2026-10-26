// modules.js (v1.5): one door between app.js and the newer modules (search, to-do, library, widgets, budget extras). Come on dude.
import * as todo from './todo.js';
import * as lib from './library.js';
import * as search from './search.js';
import * as widgets from './widgets.js';
import * as bplus from './budgetplus.js';
import * as chat from './chat.js';

export async function modulesInit(ctx) {
  const c = { ...ctx, todo, lib };
  await todo.init(c);
  await lib.init(c);
  await search.init(c);
  bplus.init(c);
  widgets.init(c);
  await chat.init(c);
}

const ROUTES = { todo: () => todo.html(), library: (a) => lib.html(a), search: () => search.html(), chat: (a) => chat.chatHTML(a), ai: () => chat.aiHTML(), memories: () => chat.memHTML() };
export const moduleRoute = (name) => name in ROUTES;
export const moduleHTML = (name, arg) => ROUTES[name](arg);
export const moduleMount = (name) => { if (name === 'search') search.mount(); else if (name === 'chat') chat.chatMount(); else if (name === 'ai') chat.aiMount(); };

export const homeWidgetHTML = widgets.html;
export const budgetPlusHTML = bplus.html;
export const catChipsHTML = bplus.catChipsHTML;
export const todoOpenCount = todo.openCount;
export const startDebrief = chat.startDebrief;
export const aiEnabled = chat.enabled;

export const modulesBackup = () => ({ todos: todo.backup(), library: lib.backup(), ai: chat.backup() });
export async function modulesRestore(data) {
  return (await todo.restore(data.todos)) + (await lib.restore(data.library)) + (await chat.restore(data.ai));
}
export async function modulesErase() { await todo.erase(); await lib.erase(); await chat.erase(); }
