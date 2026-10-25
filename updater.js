// updater.js (v1.5): checking for and installing new versions.
// A new version is downloaded in the background and kept ready. Nothing changes until you say "Update now",
// and then the switch is instant because everything is already downloaded.
let reg = null, C = null, reloading = false, lastCheck = 0;

export async function initUpdates(ctx) {
  C = ctx;
  if (!navigator.serviceWorker || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  // lets a new worker know this page can ask you before updating
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'CAN_PROMPT' && e.ports[0]) e.ports[0].postMessage('ok'); });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;      // first install: nothing to reload
    reloading = true; location.reload();
  });
  try { reg = await navigator.serviceWorker.register('sw.js'); } catch { return; }
  if (!reg) return;
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showBanner(); });
  });
  if (reg.waiting && navigator.serviceWorker.controller) showBanner();
  // look for updates when you come back to the app (at most once a minute) and every 30 minutes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now(); reg.update().catch(() => {});
  });
  setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
}

function showBanner() {
  if (document.querySelector('.banner')) return;
  const b = document.createElement('div');
  b.className = 'banner';
  b.innerHTML = '<span>A new version of Sonder is ready</span><button data-go>Update now</button><button data-x aria-label="Dismiss" style="background:none;color:inherit;font-size:18px;padding:2px 8px">×</button>';
  b.querySelector('[data-go]').onclick = () => applyUpdate(b);
  b.querySelector('[data-x]').onclick = () => b.remove();
  document.body.appendChild(b);
}

export async function applyUpdate(banner) {
  if (!reg || !reg.waiting) { location.reload(); return; }
  if (C.isDirty()) {
    const ok = await C.confirmSheet({ title: 'Update now?', text: 'You have unsaved changes in the entry you’re editing. Updating reloads the app and they would be lost.', ok: 'Update anyway', danger: true });
    if (!ok) return;
  }
  const btn = banner?.querySelector('[data-go]');
  if (btn) { btn.textContent = 'Updating…'; btn.disabled = true; }
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(() => { if (!reloading) { reloading = true; location.reload(); } }, 4000);   // safety net
}

/* "Check for updates" button */
export async function checkForUpdates(btn) {
  const label = btn ? btn.textContent : '';
  const done = () => { if (btn) { btn.textContent = label; btn.disabled = false; } };
  if (!reg) { C.toast('Updates are checked when Sonder is installed over HTTPS'); return; }
  if (btn) { btn.textContent = 'Checking…'; btn.disabled = true; }
  try {
    await reg.update();
    if (!reg.waiting && reg.installing) {
      if (btn) btn.textContent = 'Downloading update…';
      await new Promise((resolve) => {
        const w = reg.installing;
        const t = setTimeout(resolve, 30000);
        w.addEventListener('statechange', () => { if (w.state === 'installed' || w.state === 'redundant' || w.state === 'activated') { clearTimeout(t); resolve(); } });
      });
    }
  } catch {
    done(); C.toast('Couldn’t check. Are you online?'); return;
  }
  done();
  if (reg.waiting && navigator.serviceWorker.controller) {
    const ok = await C.confirmSheet({ title: 'Update available', text: 'A new version of Sonder is ready. Update now? The app will reload.', ok: 'Update now' });
    if (ok) applyUpdate(null);
  } else {
    C.toast(`You’re on the latest version (v${C.version})`);
  }
}
