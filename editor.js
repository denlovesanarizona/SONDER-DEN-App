// editor.js (v1.5): rich text for journal entries.
// An entry keeps `body` (plain text: used for previews, search, backups) and, only when you used formatting, `html`.
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEEP = new Set(['STRONG', 'EM', 'U', 'S', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'MARK', 'BR', 'P', 'DIV']);
const RENAME = { B: 'strong', I: 'em', STRIKE: 's', DEL: 's', H1: 'h2', H4: 'h3', H5: 'h3', H6: 'h3' };
const FORMATTING = /<(strong|em|u|s|h2|h3|ul|ol|blockquote|mark)[\s>]/i;

const parse = (html) => new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html').body;

/* Whitelist: only these tags survive, and never any attributes. Everything else is unwrapped. */
export function sanitizeHTML(html) {
  const out = document.createElement('div');
  const walk = (src, dst) => {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      const name = RENAME[tag] || (KEEP.has(tag) ? tag.toLowerCase() : null);
      if (!name) { walk(n, dst); continue; }
      const el = document.createElement(name);
      if (name !== 'br') walk(n, el);
      dst.appendChild(el);
    }
  };
  walk(parse(html), out);
  return out.innerHTML;
}
export const plainToHtml = (text) => esc(text).replace(/\n/g, '<br>');
/* One <div> per line, the same shape the browser makes when you press Enter. Keeps lists and headings predictable. */
export const plainToBlocks = (text) => String(text || '').split('\n').map((l) => `<div>${l ? esc(l) : '<br>'}</div>`).join('');
export const hasFormatting = (html) => FORMATTING.test(html || '');

const BLOCK = new Set(['DIV', 'P', 'H2', 'H3', 'LI', 'BLOCKQUOTE', 'UL', 'OL']);
export function htmlToText(html) {
  let out = '';
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  const walk = (n) => {
    let idx = 0;
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out += c.nodeValue; continue; }
      if (c.nodeType !== 1) continue;
      if (c.tagName === 'BR') { out += '\n'; continue; }
      const b = BLOCK.has(c.tagName);
      if (b) nl();
      if (c.tagName === 'LI') { idx++; out += c.parentNode.tagName === 'OL' ? `${idx}. ` : '- '; }
      walk(c);
      if (b) nl();
    }
  };
  walk(parse(html));
  return out;
}
export function htmlToMd(html) {
  let out = '';
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  const walk = (n, ctx = {}) => {
    let idx = 0;
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out += c.nodeValue; continue; }
      if (c.nodeType !== 1) continue;
      const t = c.tagName;
      if (t === 'BR') { out += '\n'; continue; }
      const wrap = { STRONG: '**', EM: '*', S: '~~', MARK: '==' }[t];
      if (wrap) { out += wrap; walk(c, ctx); out += wrap; continue; }
      if (t === 'U') { out += '<u>'; walk(c, ctx); out += '</u>'; continue; }
      nl();
      if (t === 'H2') out += '## ';
      else if (t === 'H3') out += '### ';
      else if (t === 'BLOCKQUOTE') out += '> ';
      else if (t === 'LI') { idx++; out += c.parentNode.tagName === 'OL' ? `${idx}. ` : '- '; }
      walk(c, ctx);
      nl();
    }
  };
  walk(parse(html));
  return out.trim();
}

/* ---------- toolbar ---------- */
const BTN = [
  ['bold', '<b>B</b>', 'Bold'], ['italic', '<i>I</i>', 'Italic'], ['underline', '<u>U</u>', 'Underline'], ['strike', '<s>S</s>', 'Strikethrough'],
  ['h2', 'H1', 'Heading'], ['h3', 'H2', 'Subheading'], ['ul', '•', 'Bulleted list'], ['ol', '1.', 'Numbered list'],
  ['quote', '“', 'Quote'], ['mark', '<span class="hl">A</span>', 'Highlight'], ['clear', 'Clear', 'Clear formatting'],
  ['undo', '↶', 'Undo'], ['redo', '↷', 'Redo']
];
export const toolbarHTML = () => `<div class="rt" id="rtBar" role="toolbar" aria-label="Formatting">${BTN.map(([k, l, t]) => `<button type="button" data-rt="${k}" aria-label="${t}" title="${t}">${l}</button>`).join('')}</div>`;

const exec = (c, v) => document.execCommand(c, false, v);
const blockNow = () => (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');

export function bindRich(root, onChange) {
  const bar = document.getElementById('rtBar');
  try { exec('defaultParagraphSeparator', 'div'); } catch {}
  const touch = () => { root.classList.toggle('is-empty', !root.textContent.trim() && !root.querySelector('li')); onChange && onChange(); };

  const toggleBlock = (tag) => exec('formatBlock', blockNow() === tag ? 'div' : tag);
  const mark = () => {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const near = (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode).closest?.('mark');
    if (near && root.contains(near)) { near.replaceWith(...near.childNodes); touch(); return; }
    if (sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const m = document.createElement('mark');
    m.appendChild(range.extractContents());
    range.insertNode(m);
    sel.removeAllRanges();
    const r2 = document.createRange(); r2.selectNodeContents(m); sel.addRange(r2);
  };
  const run = {
    bold: () => exec('bold'), italic: () => exec('italic'), underline: () => exec('underline'), strike: () => exec('strikeThrough'),
    h2: () => toggleBlock('h2'), h3: () => toggleBlock('h3'), quote: () => toggleBlock('blockquote'),
    ul: () => exec('insertUnorderedList'), ol: () => exec('insertOrderedList'), mark,
    clear: () => { exec('removeFormat'); exec('formatBlock', 'div'); exec('unlink'); },
    undo: () => exec('undo'), redo: () => exec('redo')
  };
  bar.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); });   // keep the selection
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rt]');
    if (!b) return;
    root.focus();
    run[b.dataset.rt]?.();
    touch(); refresh();
  });

  const refresh = () => {
    if (!root.contains(getSelection().anchorNode)) return;
    const st = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough', ul: 'insertUnorderedList', ol: 'insertOrderedList' };
    const blk = blockNow();
    bar.querySelectorAll('[data-rt]').forEach((b) => {
      const k = b.dataset.rt;
      let on = false;
      try {
        if (st[k]) on = document.queryCommandState(st[k]);
        else if (k === 'h2' || k === 'h3') on = blk === k;
        else if (k === 'quote') on = blk === 'blockquote';
        else if (k === 'mark') on = !!(getSelection().anchorNode?.parentElement?.closest('mark'));
      } catch {}
      b.classList.toggle('on', on);
    });
  };
  document.addEventListener('selectionchange', refresh);

  /* paste as plain text so nothing odd sneaks in */
  root.addEventListener('paste', (e) => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain');
    exec('insertText', t);
  });
  root.addEventListener('drop', (e) => e.preventDefault());

  /* markdown shortcuts: "# ", "## ", "- ", "1. ", "> " at the start of a line */
  root.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && e.data === ' ') {
      const sel = getSelection();
      const node = sel.anchorNode;
      if (node && node.nodeType === 3 && !node.previousSibling && root.contains(node)) {
        const before = node.textContent.slice(0, sel.anchorOffset);
        const map = { '# ': () => exec('formatBlock', 'h2'), '## ': () => exec('formatBlock', 'h3'), '- ': () => exec('insertUnorderedList'), '* ': () => exec('insertUnorderedList'), '1. ': () => exec('insertOrderedList'), '> ': () => exec('formatBlock', 'blockquote') };
        if (map[before]) {
          for (let i = 0; i < before.length; i++) exec('delete');   // let the browser remove the typed characters so the line keeps its shape
          map[before]();
        }
      }
    }
    touch();
  });
  root.classList.toggle('is-empty', !root.textContent.trim() && !root.querySelector('li'));
  return { touch };
}
