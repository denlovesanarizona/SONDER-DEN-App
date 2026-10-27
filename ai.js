// ai.js (v1.6): the companion's brain. No server of ours is involved: the model runs on YOUR computer (Ollama / LM Studio / llama.cpp)
// or inside this device's browser. Chats, memories and settings live in IndexedDB (meta keys 'ai', 'aiChats', 'aiMem').

const DEFAULTS = {
  enabled: false,
  mode: 'pc',                    // 'pc' = a model server you run, 'device' = a small model inside the browser
  api: 'ollama',                 // 'ollama' | 'openai' (LM Studio, llama.cpp server, etc.)
  url: 'http://localhost:11434',
  model: 'llama3.2',
  deviceModel: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  temp: 0.7,
  maxReply: 400,
  numCtx: 4096,
  persona: 'gentle',
  custom: '',
  callName: '',
  useJournal: true,
  history: 90,                   // days of journal the companion may look back over (0 = everything)
  entries: 3,                    // journal entries pulled into each reply
  memory: true,                  // use remembered facts
  autoLearn: true                // learn new facts from finished chats
};

/* Experimental on-device engine (WebLLM). Needs a browser with WebGPU. Edit this address if the library moves. */
export const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm';

export const PERSONAS = {
  gentle: { label: 'Gentle listener', text: 'You are a warm, calm, non-judgmental listener. Reflect back what the person feels, validate before you advise, and ask at most one thoughtful question at a time. Keep replies short and human, never clinical.' },
  direct: { label: 'Straight-talking', text: 'You are a caring but direct friend. Be honest and concrete, gently name patterns you notice, and offer one practical next step when it helps. Skip filler and platitudes.' },
  coach: { label: 'Coach', text: 'You are a supportive coach. Help the person find their own answers: clarify what they want, notice strengths, and turn insights into one small action. Ask focused questions.' },
  custom: { label: 'Custom', text: '' }
};

const RULES = `Rules: You are an AI companion inside a private journaling app, not a licensed therapist, and you never claim to be one. Talk like a warm, natural person: no headings, no long lists. Talking about fiction, anime, manga, books, games, violence in stories, grief, trauma, anger and other heavy topics is completely fine; never refuse or lecture about them. If you don't know something (a show, a book, a person), say you're not sure instead of guessing, and let the person tell you about it. Use journal excerpts and remembered facts only when they truly help, and never invent details that are not there. Do not diagnose. Only if the person clearly says they want to hurt themselves or are in danger, respond with care and mention they can contact local emergency services or a crisis line (in the US, call or text 988). Otherwise do not mention crisis lines or hotlines.`;
const PERSONAS_SHORT = (p) => p.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.');
const RULES_SMALL = `You are a warm, friendly companion in a private journaling app. Reply in 2-4 short sentences, like a caring friend. Discussing fiction, anime, books, games and heavy feelings is fine; never refuse them. If you don't know something, say so and ask the person to tell you. Don't invent details. Don't mention hotlines unless the person says they want to hurt themselves.`;

let C = null;
let A = { ...DEFAULTS };
let CH = { chats: [] };
let MEM = { facts: [] };
let engine = null, engineModel = '';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export async function init(ctx) {
  C = ctx;
  const a = await C.db.getMeta('ai');
  if (a && typeof a === 'object') A = { ...DEFAULTS, ...a };
  const c = await C.db.getMeta('aiChats');
  if (c && Array.isArray(c.chats)) CH = c;
  const m = await C.db.getMeta('aiMem');
  if (m && Array.isArray(m.facts)) MEM = m;
}

/* ---------- settings ---------- */
export const cfg = () => A;
export async function setCfg(patch) { A = { ...A, ...patch }; await C.db.setMeta('ai', A); }
export const isReady = () => A.enabled && (A.mode === 'device' ? !!A.deviceModel : !!(A.url && A.model));
export const where = () => (A.mode === 'device' ? 'On this device' : `${A.model} · ${hostOf(A.url)}`);
const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };

/* ---------- chats ---------- */
const saveChats = () => C.db.setMeta('aiChats', CH);
export const chats = () => [...CH.chats].sort((a, b) => b.updated - a.updated);
export const getChat = (id) => CH.chats.find((c) => c.id === id) || null;
export async function newChat(extra = {}) {
  const c = { id: uid(), title: '', created: Date.now(), updated: Date.now(), msgs: [], summary: '', digested: 0, ...extra };
  CH.chats.push(c); await saveChats(); return c;
}
export const commitChat = async (c) => { c.updated = Date.now(); await saveChats(); };
export async function deleteChat(id) { CH.chats = CH.chats.filter((c) => c.id !== id); await saveChats(); }
export async function clearChats() { CH.chats = []; await saveChats(); }
export async function dropEmptyChats(except) {
  const n = CH.chats.length;
  CH.chats = CH.chats.filter((c) => c.msgs.length || c.id === except);
  if (CH.chats.length !== n) await saveChats();
}

/* ---------- memories ---------- */
const saveMem = () => C.db.setMeta('aiMem', MEM);
export const facts = () => [...MEM.facts].sort((a, b) => b.created - a.created);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
export async function addFact(text, src = 'you') {
  text = clip(String(text).replace(/\s+/g, ' ').trim(), 160);
  if (!text) return false;
  const n = norm(text);
  if (MEM.facts.some((f) => norm(f.text) === n || (n.length > 12 && norm(f.text).includes(n)))) return false;
  MEM.facts.push({ id: uid(), text, created: Date.now(), src });
  await saveMem(); return true;
}
export async function editFact(id, text) { const f = MEM.facts.find((x) => x.id === id); if (f && text.trim()) { f.text = clip(text.trim(), 160); await saveMem(); } }
export async function delFact(id) { MEM.facts = MEM.facts.filter((f) => f.id !== id); await saveMem(); }
export async function clearFacts() { MEM.facts = []; await saveMem(); }

/* ---------- finding relevant journal entries (simple keyword scoring, all on-device) ---------- */
const STOP = new Set('the and for with that this was were are but not you your have has had its from they them then than what when where which who why how about into just really very like get got been being would could should can did does doing don dont didnt cant wont ive im youre theyre hes shes thats there here also too out all any some one more much many only over after before because while still even our ours his her their him she mine myself yes yeah okay today yesterday'.split(' '));
const tokens = (s) => (String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));

function candidates() {
  const horizon = A.history ? Date.now() - A.history * 864e5 : 0;
  return C.S.items.filter((i) => i.kind === 'journal' && !i.summary && !i.noai && i.ts >= horizon);
}
export function relevantEntries(query, { pinId = '', limit = A.entries } = {}) {
  const out = [];
  const q = [...new Set(tokens(query))];
  const pool = candidates().filter((i) => i.id !== pinId);
  const now = Date.now();
  const scored = pool.map((i) => {
    const t = new Set(tokens(i.title || '')), body = tokens(i.body || '');
    const counts = {};
    body.forEach((w) => { counts[w] = (counts[w] || 0) + 1; });
    let s = 0;
    q.forEach((w) => { if (t.has(w)) s += 3; if (counts[w]) s += 1 + Math.min(2, counts[w] - 1) * 0.5; });
    const age = (now - i.ts) / 864e5;
    return { i, s: s > 0 ? s + Math.max(0, 1.2 - age / 60) : 0 };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  scored.slice(0, limit).forEach((x) => out.push(x.i));
  const latest = pool.sort((a, b) => b.ts - a.ts)[0];            // the most recent entry gives day-to-day continuity
  if (limit > 0 && latest && !out.includes(latest) && now - latest.ts < 4 * 864e5) out.push(latest);
  return { list: out };
}
const stamp = (ts) => new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
function entryBlock(i, n) {
  const mood = i.mood && C.moodLabel ? C.moodLabel(i.mood) : '';
  return `[${stamp(i.ts)}${mood ? ', mood: ' + mood : ''}] ${i.title || ''}\n${clip((i.body || '').replace(/\n{2,}/g, '\n'), n)}`;
}
function recentLogs() {
  const since = Date.now() - 3 * 864e5;
  return C.S.items.filter((i) => i.kind === 'log' && !i.summary && !i.noai && i.ts >= since).sort((a, b) => b.ts - a.ts).slice(0, 5).map((i) => `- ${stamp(i.ts)}: ${clip(i.body || '', 120)}`);
}

/* ---------- building the prompt ---------- */
export function systemPrompt(chat, query) {
  const p = PERSONAS[A.persona] || PERSONAS.gentle;
  const persona = A.persona === 'custom' && A.custom.trim() ? A.custom.trim() : p.text || PERSONAS.gentle.text;
  const small = A.mode === 'device';           // tiny on-device models do better with a short prompt
  const parts = [small ? PERSONAS_SHORT(persona) : persona, small ? RULES_SMALL : RULES];
  const who = A.callName.trim() || C.S.settings.name;
  if (who) parts.push(`The person's name is ${who}.`);
  parts.push(`Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`);

  if (A.memory && MEM.facts.length) {
    let used = 0;
    const lines = [];
    for (const f of facts()) { if (used + f.text.length > (small ? 500 : 1400)) break; lines.push('- ' + f.text); used += f.text.length; }
    parts.push('Things you remember about them:\n' + lines.join('\n'));
  }
  const others = chats().filter((c) => c.id !== chat.id && c.summary).slice(0, 3);
  if (!small && A.memory && others.length) parts.push('Earlier conversations:\n' + others.map((c) => `- ${stamp(c.created)}: ${clip(c.summary, 280)}`).join('\n'));

  if (chat.entryId) {
    const e = C.S.items.find((i) => i.id === chat.entryId);
    if (e) parts.push(`They want to talk about this journal entry they just wrote:\n${entryBlock(e, 2600)}`);
  }
  if (A.useJournal) {
    const { list } = relevantEntries(query, { pinId: chat.entryId, limit: small ? Math.min(A.entries, 1) : A.entries });
    if (list.length) parts.push('Possibly related entries from their journal (private; mention only if relevant):\n' + list.map((i) => entryBlock(i, small ? 220 : 420)).join('\n\n'));
    const logs = small ? [] : recentLogs();
    if (logs.length) parts.push('Their recent quick notes:\n' + logs.join('\n'));
  }
  if (chat.summary) parts.push('Summary of the earlier part of this conversation: ' + chat.summary);
  return parts.join('\n\n');
}
export function buildMessages(chat) {
  const msgs = chat.msgs.filter((m) => m.t && !m.err);
  const lastUser = [...msgs].reverse().find((m) => m.r === 'user');
  const sys = systemPrompt(chat, lastUser ? lastUser.t : '');
  const keep = [];
  let used = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    used += msgs[i].t.length;
    if (used > 5200 && keep.length >= 2) break;
    keep.unshift({ role: msgs[i].r, content: msgs[i].t });
  }
  while (keep.length && keep[0].role !== 'user') keep.shift();
  return [{ role: 'system', content: sys }, ...keep];
}

/* ---------- talking to the model ---------- */
const baseUrl = () => A.url.trim().replace(/\/+$/, '').replace(/\/(api|v1)$/, '');
function netError(e) {
  if (e && e.name === 'AbortError') return e;
  const err = new Error(`Can’t reach ${A.url}. Make sure the model server is running and allows this app’s address (see Setup help).`);
  err.net = true; return err;
}
async function httpError(r) {
  let msg = '';
  try { const j = await r.clone().json(); msg = (j.error && (j.error.message || j.error)) || j.message || ''; } catch { try { msg = await r.text(); } catch {} }
  msg = String(msg || '').slice(0, 200);
  if (r.status === 404 && /not found|pull/i.test(msg)) return new Error(`The model “${A.model}” isn’t installed. Run: ollama pull ${A.model}`);
  if (r.status === 403) return new Error('The server refused this app (403). Check the allowed origins in Setup help.');
  return new Error(`The model server said ${r.status}${msg ? ': ' + msg : ''}`);
}

async function* lines(r, signal) {
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  while (true) {
    if (signal?.aborted) { reader.cancel().catch(() => {}); throw new DOMException('Aborted', 'AbortError'); }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) yield l; }
  }
  if (buf.trim()) yield buf.trim();
}

async function streamPC(messages, onToken, signal) {
  const u = baseUrl();
  let r;
  try {
    if (A.api === 'ollama') {
      r = await fetch(`${u}/api/chat`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: A.model, messages, stream: true, keep_alive: '30m', options: { temperature: A.temp, num_ctx: A.numCtx, num_predict: A.maxReply } }) });
    } else {
      r = await fetch(`${u}/v1/chat/completions`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: A.model, messages, stream: true, temperature: A.temp, max_tokens: A.maxReply }) });
    }
  } catch (e) { throw netError(e); }
  if (!r.ok) throw await httpError(r);
  let out = '';
  try {
    for await (const l of lines(r, signal)) {
      let tok = '';
      if (A.api === 'ollama') {
        const j = JSON.parse(l);
        if (j.error) throw new Error(j.error);
        tok = j.message?.content || '';
      } else {
        if (!l.startsWith('data:')) continue;
        const d = l.slice(5).trim();
        if (d === '[DONE]') break;
        tok = JSON.parse(d).choices?.[0]?.delta?.content || '';
      }
      if (tok) { out += tok; onToken(tok, out); }
    }
  } catch (e) { if (e.name === 'AbortError') throw e; if (e instanceof SyntaxError) throw new Error('Got an unexpected reply from the server.'); throw e; }
  return out;
}

export const deviceSupported = () => !!navigator.gpu;
export async function loadDevice(onProgress) {
  if (!deviceSupported()) throw new Error('This browser has no WebGPU, so the on-device model can’t run here. Use “Your computer” mode instead.');
  if (engine && engineModel === A.deviceModel) return engine;
  let lib;
  try { lib = await import(/* @vite-ignore */ WEBLLM_URL); } catch { throw new Error('Couldn’t load the on-device engine. You need to be online the first time.'); }
  let model = A.deviceModel;
  try {                                  // many phone GPUs lack 16-bit shader support; use the 32-bit build of the same model then
    const ad = await navigator.gpu.requestAdapter();
    if (ad && !ad.features.has('shader-f16')) model = model.replace('q4f16_1', 'q4f32_1');
  } catch {}
  engine = await lib.CreateMLCEngine(model, { initProgressCallback: (p) => onProgress && onProgress(p.progress || 0, p.text || '') });
  engineModel = A.deviceModel;
  return engine;
}
async function streamDevice(messages, onToken, signal) {
  const e = await loadDevice();
  const it = await e.chat.completions.create({ messages, stream: true, temperature: A.temp, max_tokens: A.maxReply });
  let out = '';
  for await (const ch of it) {
    if (signal?.aborted) { try { e.interruptGenerate(); } catch {} throw new DOMException('Aborted', 'AbortError'); }
    const tok = ch.choices?.[0]?.delta?.content || '';
    if (tok) { out += tok; onToken(tok, out); }
  }
  return out;
}

export function stream(messages, onToken = () => {}, signal) {
  return A.mode === 'device' ? streamDevice(messages, onToken, signal) : streamPC(messages, onToken, signal);
}

export async function listModels() {
  const u = baseUrl();
  let r;
  try { r = await fetch(A.api === 'ollama' ? `${u}/api/tags` : `${u}/v1/models`); } catch (e) { throw netError(e); }
  if (!r.ok) throw await httpError(r);
  const j = await r.json();
  return A.api === 'ollama' ? (j.models || []).map((m) => m.name) : (j.data || []).map((m) => m.id);
}
export async function testConnection() {
  if (A.mode === 'device') return { ok: deviceSupported(), msg: deviceSupported() ? 'This browser supports on-device models.' : 'This browser has no WebGPU.' };
  try {
    const models = await listModels();
    const has = models.some((m) => m === A.model || m.split(':')[0] === A.model || m === A.model + ':latest');
    return { ok: true, has, models, msg: has ? `Connected. “${A.model}” is ready.` : `Connected, but “${A.model}” isn’t installed. ${models.length ? 'Installed: ' + models.slice(0, 4).join(', ') : 'No models yet.'}` };
  } catch (e) { return { ok: false, msg: e.message }; }
}

/* ---------- remembering ---------- */
const DIGEST = `You keep notes for a journaling companion's memory. Read the conversation and answer in exactly this format:
SUMMARY: one or two sentences about what was discussed and how the person seemed to feel.
FACTS:
- up to 5 short, lasting facts about the person (people, situations, goals, recurring feelings). Write "- none" if nothing is worth keeping.
Do not add anything else.`;
export async function digest(chat) {
  const msgs = chat.msgs.filter((m) => m.t && !m.err);
  if (msgs.length < 4) { chat.digested = chat.updated; await saveChats(); return; }
  const convo = msgs.map((m) => `${m.r === 'user' ? 'Person' : 'Companion'}: ${clip(m.t, 600)}`).join('\n').slice(-6000);
  const text = await stream([{ role: 'system', content: DIGEST }, { role: 'user', content: convo }]);
  const sm = text.match(/SUMMARY:\s*([\s\S]*?)(?:\n\s*FACTS:|$)/i);
  if (sm && sm[1].trim()) chat.summary = clip(sm[1].trim().replace(/\s+/g, ' '), 400);
  if (A.memory && A.autoLearn) {
    const fm = text.split(/FACTS:/i)[1] || '';
    for (const l of fm.split('\n')) {
      const m = l.match(/^\s*[-•*]\s+(.+)/);
      if (m && !/^none\.?$/i.test(m[1].trim())) await addFact(m[1], chat.id);
    }
  }
  chat.digested = chat.updated; await saveChats();
}
let digesting = false;
export async function digestPending(exceptId) {
  if (digesting || !isReady()) return;
  digesting = true;
  try {
    for (const c of CH.chats) {
      if (c.id === exceptId || c.digested >= c.updated || c.msgs.length < 4) continue;
      await digest(c);
    }
  } catch { /* the server may be off; try again next time */ }
  digesting = false;
}

/* ---------- backup ---------- */
export const backup = () => JSON.parse(JSON.stringify({ cfg: A, chats: CH, memory: MEM }));
export async function restore(d) {
  if (!d || typeof d !== 'object') return 0;
  let n = 0;
  if (d.cfg && typeof d.cfg === 'object') { A = { ...DEFAULTS, ...d.cfg }; await C.db.setMeta('ai', A); }
  for (const c of d.chats?.chats || []) {
    if (!c || typeof c.id !== 'string' || !Array.isArray(c.msgs)) continue;
    const cur = CH.chats.find((x) => x.id === c.id);
    if (!cur) { CH.chats.push(c); n++; } else if ((c.updated || 0) > (cur.updated || 0)) { Object.assign(cur, c); n++; }
  }
  for (const f of d.memory?.facts || []) {
    if (f && typeof f.id === 'string' && typeof f.text === 'string' && !MEM.facts.some((x) => x.id === f.id)) { MEM.facts.push(f); n++; }
  }
  await saveChats(); await saveMem();
  return n;
}
export async function erase() {
  A = { ...DEFAULTS }; CH = { chats: [] }; MEM = { facts: [] };
  await C.db.delMeta('ai'); await C.db.delMeta('aiChats'); await C.db.delMeta('aiMem');
}
