// chat.js (v1.6): the Talk screen, Companion settings, Memories screen, and "talk about this entry".
import { icon } from './icons.js';
import * as AI from './ai.js';

let C = null;
const V = { busy: false, id: '', text: '', ctrl: null, err: '', errId: '' };

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const $ = (s) => document.querySelector(s);
const fmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>').replace(/\n/g, '<br>');
const arg = () => location.hash.split('/')[2] || '';
const fdate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(new Date(ts).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });

export async function init(ctx) {
  C = ctx;
  await AI.init(ctx);
  if (!document.__chBound) { document.__chBound = true; bind(); }
}
export const backup = AI.backup;
export const restore = AI.restore;
export const erase = AI.erase;
export const enabled = () => AI.cfg().enabled;

/* ---------- which chat is on screen ---------- */
function chatFor(a) {
  if (a && a !== 'new') return AI.getChat(a);
  if (!a) { const c = AI.chats()[0]; if (c && c.msgs.length && Date.now() - c.updated < 6 * 36e5) return c; }
  return null;
}

/* ---------- Talk screen ---------- */
export function chatHTML(a) {
  const chat = chatFor(a);
  const ready = AI.isReady();
  const name = AI.cfg().callName.trim() || C.S.settings.name || '';
  const msgs = chat ? chat.msgs : [];
  const live = V.busy && chat && V.id === chat.id;
  const body = msgs.map((m) => `<div class="msg ${m.r}"><div class="bub selectable">${fmt(m.t)}</div></div>`).join('')
    + (live ? `<div class="msg assistant"><div class="bub selectable" id="chStream">${V.text ? fmt(V.text) : '<span class="typing"><i></i><i></i><i></i></span>'}</div></div>` : '')
    + (V.err && chat && V.errId === chat.id ? `<div class="msg err"><div class="bub">${esc(V.err)}<div class="errbtns"><button class="pill" data-ch="retry">Try again</button><button class="pill" data-act="go" data-to="ai">Settings</button></div></div></div>` : '');
  const empty = `<div class="ch-empty"><div class="ch-orb"></div>
      <h2>${name ? `How are you, ${esc(name)}?` : 'How are you?'}</h2>
      <p class="sub">Vent about your day, think out loud, or talk through something that happened. It can look back at your journal. It all stays on your own devices.</p>
      ${ready ? '' : `<div class="card ch-setup"><b>Set up your companion</b><span>Connect it to a model running on your computer (or this device). It takes a few minutes.</span><button class="btn-primary" data-act="go" data-to="ai">Set up</button></div>`}
      <div class="ch-starters">${['I want to vent about my day', 'Something happened and I’m still thinking about it', 'Help me make sense of how I’ve been feeling'].map((t) => `<button class="pill" data-ch="starter" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
  return `<div class="screen chat">
    <div class="ch-top">
      <button class="round" data-act="go" data-to="home" aria-label="Back">${icon('back', 19)}</button>
      <div class="ch-title"><b>${chat && chat.title ? esc(clip(chat.title, 40)) : 'Talk it out'}</b><span>${ready ? esc(AI.where()) : 'Not set up'}</span></div>
      <div class="ch-tools"><button class="round" data-ch="history" aria-label="Past chats">${icon('book', 18)}</button><button class="round" data-ch="new" aria-label="New chat">${icon('plus', 18)}</button><button class="round" data-act="go" data-to="ai" aria-label="Companion settings">${icon('gear', 18)}</button></div>
    </div>
    <div class="ch-msgs" id="chMsgs">${msgs.length || live ? body : empty}</div>
  </div>
  <div class="ch-bar"><textarea id="chIn" rows="1" placeholder="Say what’s on your mind…" enterkeyhint="send"></textarea>
    <button class="ch-send ${V.busy ? 'stop' : ''}" id="chSend" data-ch="${V.busy ? 'stop' : 'send'}" aria-label="${V.busy ? 'Stop' : 'Send'}">${icon(V.busy ? 'stop' : 'send', 20)}</button></div>`;
}

export function chatMount() {
  const chat = chatFor(arg());
  AI.digestPending(chat && chat.id);
  window.scrollTo(0, document.documentElement.scrollHeight);
  const t = $('#chIn');
  if (t && !chat?.entryId) setTimeout(() => { if (matchMedia('(min-width: 900px)').matches) t.focus(); }, 50);
  if (chat && chat.entryId && !chat.msgs.length && !V.busy && AI.isReady()) {
    const e = C.S.items.find((i) => i.id === chat.entryId);
    send(`Can we talk about my entry “${e ? e.title : 'today'}”?`);
  }
}

const stick = (force) => {
  const near = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 260;
  if (force || near) window.scrollTo(0, document.documentElement.scrollHeight);
};
function setBusy(b) {
  V.busy = b;
  const s = $('#chSend');
  if (s) { s.classList.toggle('stop', b); s.dataset.ch = b ? 'stop' : 'send'; s.innerHTML = icon(b ? 'stop' : 'send', 20); s.setAttribute('aria-label', b ? 'Stop' : 'Send'); }
}

async function send(text) {
  const inp = $('#chIn');
  text = String(text ?? (inp ? inp.value : '')).trim();
  if (!text || V.busy) return;
  if (!AI.isReady()) { C.toast('Set up your companion first', { label: 'Set up', fn: () => C.go('ai') }); return; }
  let chat = chatFor(arg());
  if (!chat) { chat = await AI.newChat(); history.replaceState(null, '', `#/chat/${chat.id}`); }
  chat.msgs.push({ id: C.uid(), r: 'user', t: text, ts: Date.now() });
  if (AI.cfg().memory && (await AI.rememberFromMessage(text))) C.toast('Remembered');
  if (!chat.title) chat.title = clip(text, 44);
  await AI.commitChat(chat);
  V.err = '';
  respond(chat);
}

async function respond(chat) {
  V.id = chat.id; V.text = ''; V.err = ''; V.ctrl = new AbortController(); V.busy = true;
  C.render();
  stick(true);
  try {
    const out = await AI.stream(AI.buildMessages(chat), (tok, all) => {
      V.text = all;
      const el = document.getElementById('chStream');
      if (el) { el.innerHTML = fmt(all); stick(); }
    }, V.ctrl.signal);
    if (out.trim()) chat.msgs.push({ id: C.uid(), r: 'assistant', t: out.trim(), ts: Date.now() });
    else { V.err = 'The model sent back an empty reply. Try again.'; V.errId = chat.id; }
  } catch (e) {
    if (e.name === 'AbortError') { if (V.text.trim()) chat.msgs.push({ id: C.uid(), r: 'assistant', t: V.text.trim(), ts: Date.now() }); }
    else { V.err = e.message || 'Something went wrong.'; V.errId = chat.id; }
  }
  V.busy = false; V.ctrl = null; V.text = '';
  await AI.commitChat(chat);
  if (location.hash.startsWith('#/chat')) { C.render(); stick(true); }
}

export async function startDebrief(entryId) {
  const e = C.S.items.find((i) => i.id === entryId);
  if (!e) return;
  if (!AI.isReady()) { C.toast('Turn on the companion first', { label: 'Set up', fn: () => C.go('ai') }); return; }
  const chat = await AI.newChat({ entryId, title: 'About: ' + clip(e.title || 'my entry', 34) });
  C.go('chat/' + chat.id);
}

/* ---------- history sheet ---------- */
function historySheet() {
  const list = AI.chats().filter((c) => c.msgs.length);
  const el = C.openSheet(`<div class="hd"><h2>Past chats</h2></div>
    ${list.length ? `<div class="chlist">${list.map((c) => `<div class="chrow"><button class="chopen" data-id="${c.id}"><b>${esc(clip(c.title || 'Chat', 44))}</b><span>${esc(fdate(c.updated))} · ${c.msgs.length} message${c.msgs.length === 1 ? '' : 's'}</span></button><button class="xbtn" data-del="${c.id}" aria-label="Delete chat">${icon('trash', 16)}</button></div>`).join('')}</div>` : '<p class="sub" style="margin:0 0 12px">No chats yet.</p>'}`);
  el.addEventListener('click', async (e) => {
    const o = e.target.closest('.chopen'), d = e.target.closest('[data-del]');
    if (o) { C.closeSheet(); C.go('chat/' + o.dataset.id); }
    else if (d) { await AI.deleteChat(d.dataset.del); historySheet(); if (location.hash.includes(d.dataset.del)) C.go('chat/new'); }
  });
}

/* ---------- Companion settings ---------- */
const pills = (key, opts, cur) => `<div class="td-chips">${opts.map(([l, v]) => `<button class="pill ${String(cur) === String(v) ? 'on' : ''}" data-ai="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
const tg = (on) => `<span class="toggle ${on ? 'on' : ''}"></span>`;

export function aiHTML() {
  const a = AI.cfg();
  const chev = `<span style="color:var(--faint)">${icon('chevron', 18)}</span>`;
  const nCh = AI.chats().filter((c) => c.msgs.length).length, nF = AI.facts().length;
  const pc = a.mode === 'pc';
  return `<div class="screen">
    <button class="round" data-act="go" data-to="account" aria-label="Back">${icon('back', 19)}</button>
    <h1 style="margin-top:14px">Companion</h1><p class="sub">An AI you can talk to about your day. It runs on your own devices; nothing goes to the cloud.</p>
    <div class="card group" style="margin-top:18px">
      <button class="setrow" data-ai="enable"><span class="ico">${icon('chat', 18)}</span><span class="t">Turn on companion</span>${tg(a.enabled)}</button>
      ${a.enabled ? `<button class="setrow" data-act="go" data-to="chat"><span class="ico">${icon('pen', 18)}</span><span class="t">Open chat</span>${chev}</button>` : ''}
    </div>

    <div class="eyebrow">Where it runs</div>
    ${pills('mode', [['Your computer', 'pc'], ['On this device', 'device']], a.mode)}
    ${pc ? `<div class="card aicard">
        <div class="label">Server type</div>
        ${pills('api', [['Ollama', 'ollama'], ['LM Studio / llama.cpp', 'openai']], a.api)}
        <div class="label">Address</div>
        <input class="field" id="aiUrl" value="${esc(a.url)}" autocapitalize="off" autocomplete="off" spellcheck="false" inputmode="url">
        <div class="label" style="margin-top:12px">Model</div>
        <div style="display:flex;gap:8px"><input class="field" id="aiModel" value="${esc(a.model)}" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="btn-ghost" data-ai="pick">Pick</button></div>
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn-ghost" data-ai="test" style="flex:1">Test connection</button><button class="btn-ghost" data-ai="help" style="flex:1">Setup help</button></div>
        <div class="aiout" id="aiOut"></div></div>`
      : `<div class="card aicard">
        <p class="sub" style="margin:0 0 12px;line-height:1.5">Experimental. Runs a small model inside the browser (needs WebGPU and a one-time download, about 0.7 GB for the default). Works offline afterwards. Replies are simpler than with your computer.</p>
        <p class="aiout ${AI.deviceSupported() ? 'ok' : 'bad'}" style="margin:0 0 12px">${AI.deviceSupported() ? 'This browser supports WebGPU.' : 'This browser has no WebGPU, so this mode won’t work here.'}</p>
        <div class="label">Model</div>
        <input class="field" id="aiDevModel" value="${esc(a.deviceModel)}" autocapitalize="off" autocomplete="off" spellcheck="false">
        <button class="btn-ghost wide" data-ai="load" style="margin-top:12px">Download / load model</button>
        <div class="aiout" id="aiOut"></div></div>`}

    <div class="eyebrow">Personality</div>
    ${pills('persona', Object.entries(AI.PERSONAS).map(([k, p]) => [p.label, k]), a.persona)}
    ${a.persona === 'custom' ? `<textarea id="aiCustom" placeholder="Describe how it should talk to you…" style="min-height:96px;margin-top:6px">${esc(a.custom)}</textarea>` : ''}
    <div class="label" style="margin-top:10px">What should it call you?</div>
    <input class="field" id="aiName" value="${esc(a.callName)}" placeholder="${esc(C.S.settings.name || 'Your name')}" maxlength="30">
    <div class="label" style="margin-top:14px">Reply length</div>
    ${pills('reply', [['Short', 200], ['Medium', 400], ['Long', 800]], a.maxReply)}
    <div class="label" style="margin-top:6px">Creativity · <span id="aiTempV">${a.temp.toFixed(1)}</span></div>
    <input type="range" id="aiTemp" min="0" max="1.2" step="0.1" value="${a.temp}" style="width:100%;accent-color:var(--accent)">

    <div class="eyebrow">Memory & context</div>
    <div class="card group">
      <button class="setrow" data-ai="journal"><span class="ico">${icon('book', 18)}</span><span class="t">Use my journal</span>${tg(a.useJournal)}</button>
      <button class="setrow" data-ai="memory"><span class="ico">${icon('info', 18)}</span><span class="t">Use remembered facts</span>${tg(a.memory)}</button>
      <button class="setrow" data-ai="learn"><span class="ico">${icon('check', 18)}</span><span class="t">Learn from my chats</span>${tg(a.autoLearn)}</button>
    </div>
    <div class="label" style="margin-top:14px">How far back it can read</div>
    ${pills('history', [['30 days', 30], ['90 days', 90], ['1 year', 365], ['Everything', 0]], a.history)}
    <div class="label" style="margin-top:6px">Entries it looks at per reply</div>
    ${pills('entries', [['1', 1], ['3', 3], ['5', 5]], a.entries)}
    <p class="sub" style="font-size:12.5px;margin:6px 4px 0">More entries means better context, but slower replies on a CPU. Entries you mark “Keep private from AI” are never used.</p>
    <div class="card group" style="margin-top:16px">
      <button class="setrow" data-act="go" data-to="memories"><span class="ico">${icon('pen', 18)}</span><span class="t">Memories</span><span class="v">${nF}</span>${chev}</button>
      <button class="setrow" data-ch="history"><span class="ico">${icon('chat', 18)}</span><span class="t">Chat history</span><span class="v">${nCh}</span>${chev}</button>
      <button class="setrow danger" data-ai="clearChats"><span class="ico" style="color:var(--danger)">${icon('trash', 18)}</span><span class="t">Clear all chats</span></button>
    </div>
    <div class="card" style="padding:14px 16px;margin-top:16px"><p class="sub" style="margin:0;line-height:1.55;font-size:13px">This is an AI, not a therapist, and it can be wrong. If you’re in crisis or thinking about hurting yourself, contact local emergency services or a crisis line. In the US, call or text 988.</p></div>
  </div>${C.nav('account')}`;
}

export function aiMount() {
  const t = $('#aiTemp');
  if (t) t.addEventListener('input', () => { $('#aiTempV').textContent = (+t.value).toFixed(1); });
}

function helpSheet() {
  const o = location.origin;
  C.openSheet(`<div class="hd"><h2>Setup help</h2></div>
    <div class="aihelp selectable">
    <p><b>1. Install a model server.</b> Get Ollama from ollama.com, then in a terminal run <code>ollama pull llama3.2</code>.</p>
    <p><b>2. Let Sonder connect.</b> Browsers block other sites unless the server allows them. In Windows, search “Edit environment variables for your account” and add a variable <code>OLLAMA_ORIGINS</code> with the value <code>${esc(o)}</code>. Then quit and restart Ollama.</p>
    <p><b>3. On the same computer:</b> use the address <code>http://localhost:11434</code>. Your browser may ask to allow access to devices on your network; allow it.</p>
    <p><b>4. From your phone:</b> install Tailscale on both devices and sign in to the same account. On the computer run <code>tailscale serve --bg 11434</code>. It prints an https address like <code>https://your-laptop.your-tailnet.ts.net</code>. Paste that as the Address. If you get a 403, also add the variable <code>OLLAMA_HOST</code> = <code>0.0.0.0</code> and restart Ollama.</p>
    <p><b>5.</b> Tap “Test connection”. The computer must be awake for the phone to reach it.</p></div>
    <button class="btn-primary" onclick="document.querySelector('.scrim').click()" style="margin-top:8px">Got it</button>`);
}

async function pickModel() {
  const out = $('#aiOut');
  try {
    const models = await AI.listModels();
    if (!models.length) { out.className = 'aiout bad'; out.textContent = 'No models installed yet. Run: ollama pull llama3.2'; return; }
    const el = C.openSheet(`<div class="hd"><h2>Pick a model</h2></div><div class="chlist">${models.map((m) => `<div class="chrow"><button class="chopen" data-m="${esc(m)}"><b>${esc(m)}</b></button></div>`).join('')}</div>`);
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-m]');
      if (b) { await AI.setCfg({ model: b.dataset.m }); C.closeSheet(); C.render(); }
    });
  } catch (e) { out.className = 'aiout bad'; out.textContent = e.message; }
}

async function loadDevice() {
  const out = $('#aiOut');
  out.className = 'aiout'; out.textContent = 'Starting…';
  try {
    await AI.loadDevice((p, text) => { out.textContent = `${Math.round(p * 100)}% · ${clip(text, 80)}`; });
    out.className = 'aiout ok'; out.textContent = 'Model ready.';
  } catch (e) { out.className = 'aiout bad'; out.textContent = e.message; }
}

/* ---------- Memories ---------- */
export function memHTML() {
  const f = AI.facts();
  return `<div class="screen">
    <button class="round" data-act="go" data-to="ai" aria-label="Back">${icon('back', 19)}</button>
    <h1 style="margin-top:14px">Memories</h1><p class="sub">Things your companion remembers about you. You decide what stays.</p>
    <button class="btn-ghost wide" data-ch="addmem" style="margin-top:16px">${icon('plus', 16)}Add a memory</button>
    ${f.length ? `<div class="card group" style="margin-top:16px">${f.map((x) => `<button class="setrow memrow" data-ch="editmem" data-id="${x.id}"><span class="t" style="white-space:normal;line-height:1.4">${esc(x.text)}</span><span class="v">${x.src === 'you' ? 'you' : 'chat'}</span></button>`).join('')}</div>`
      : `<div class="card" style="padding:18px;margin-top:16px"><p class="sub" style="margin:0;line-height:1.55">Nothing yet. After you finish a chat, the companion can jot down lasting facts here, like people and situations in your life. You can also add your own.</p></div>`}
    ${f.length ? `<button class="btn-ghost wide" data-ch="clearmem" style="margin-top:16px;color:var(--danger)">Clear all memories</button>` : ''}
  </div>${C.nav('account')}`;
}
function memSheet(id) {
  const f = id && AI.facts().find((x) => x.id === id);
  const el = C.openSheet(`<div class="hd"><h2>${f ? 'Edit memory' : 'Add a memory'}</h2></div>
    <textarea id="memText" placeholder="e.g. My sister Maya is visiting in November" maxlength="160">${esc(f ? f.text : '')}</textarea>
    <button class="btn-primary" id="memSave">Save</button>
    ${f ? `<button class="btn-ghost wide" id="memDel" style="margin-top:10px;padding:14px;color:var(--danger)">Delete</button>` : ''}`);
  el.querySelector('#memSave').onclick = async () => {
    const t = el.querySelector('#memText').value.trim();
    if (!t) return C.toast('Write something first');
    if (f) await AI.editFact(f.id, t); else await AI.addFact(t, 'you');
    C.closeSheet(); C.render();
  };
  if (f) el.querySelector('#memDel').onclick = async () => { await AI.delFact(f.id); C.closeSheet(); C.render(); };
}

/* ---------- events ---------- */
const flip = (k) => async () => { await AI.setCfg({ [k]: !AI.cfg()[k] }); C.render(); };
const ai = {
  enable: flip('enabled'), journal: flip('useJournal'), memory: flip('memory'), learn: flip('autoLearn'),
  mode: async (t) => { await AI.setCfg({ mode: t.dataset.v }); C.render(); },
  api: async (t) => { const v = t.dataset.v; await AI.setCfg({ api: v, ...(v === 'openai' && AI.cfg().url.includes(':11434') ? { url: 'http://localhost:1234' } : {}), ...(v === 'ollama' && AI.cfg().url.includes(':1234') ? { url: 'http://localhost:11434' } : {}) }); C.render(); },
  persona: async (t) => { await AI.setCfg({ persona: t.dataset.v }); C.render(); },
  reply: async (t) => { await AI.setCfg({ maxReply: +t.dataset.v }); C.render(); },
  history: async (t) => { await AI.setCfg({ history: +t.dataset.v }); C.render(); },
  entries: async (t) => { await AI.setCfg({ entries: +t.dataset.v }); C.render(); },
  help: helpSheet, pick: pickModel, load: loadDevice,
  test: async () => {
    const out = $('#aiOut');
    out.className = 'aiout'; out.textContent = 'Testing…';
    const r = await AI.testConnection();
    out.className = 'aiout ' + (r.ok && r.has !== false ? 'ok' : 'bad'); out.textContent = r.msg;
  },
  clearChats: async () => {
    if (!(await C.confirmSheet({ title: 'Clear all chats?', text: 'Every conversation will be deleted. Your journal and memories stay.', ok: 'Clear', danger: true }))) return;
    await AI.clearChats(); C.render(); C.toast('Chats cleared');
  }
};
const ch = {
  send: () => send(), stop: () => V.ctrl && V.ctrl.abort(),
  retry: () => { const c = chatFor(arg()); if (c) respond(c); },
  starter: (t) => { const i = $('#chIn'); if (i) { i.value = t.dataset.v; i.focus(); autosize(i); } },
  new: async () => { if (V.busy) V.ctrl && V.ctrl.abort(); V.err = ''; await AI.dropEmptyChats(''); AI.digestPending(); if (location.hash === '#/chat/new') C.render(); else C.go('chat/new'); },
  history: historySheet,
  addmem: () => memSheet(''), editmem: (t) => memSheet(t.dataset.id),
  clearmem: async () => {
    if (!(await C.confirmSheet({ title: 'Clear all memories?', text: 'The companion will forget everything listed here.', ok: 'Clear', danger: true }))) return;
    await AI.clearFacts(); C.render();
  }
};
const autosize = (t) => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; };

function bind() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-ai]'), c = e.target.closest('[data-ch]');
    if (a && ai[a.dataset.ai]) ai[a.dataset.ai](a);
    else if (c && ch[c.dataset.ch]) ch[c.dataset.ch](c);
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'chIn') autosize(e.target); });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'chIn' && e.key === 'Enter' && !e.shiftKey && matchMedia('(min-width: 900px)').matches) { e.preventDefault(); send(); }
  });
  document.addEventListener('change', async (e) => {
    const m = { aiUrl: 'url', aiModel: 'model', aiDevModel: 'deviceModel', aiName: 'callName', aiCustom: 'custom' }[e.target.id];
    if (m) await AI.setCfg({ [m]: e.target.value.trim() });
    else if (e.target.id === 'aiTemp') await AI.setCfg({ temp: +e.target.value });
  });
}
