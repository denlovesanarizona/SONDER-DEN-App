// ux.js (v1.5): smoother scrolling on phones.
//  - remembers where you were on each list screen, so Back from an entry returns you to the same spot
//  - hides the bottom bar while you scroll down and brings it back when you scroll up
const pos = new Map();
let prevHash = location.hash || '#/home';
const LISTS = new Set(['home', 'timeline', 'insights', 'account', 'budget', 'todo', 'library', 'search']);

export const uxSave = () => { pos.set(prevHash, window.scrollY); };

/* Called by render() after the new screen is in the page. */
export function uxScroll(name, routeChanged, yBefore) {
  if (routeChanged) {
    const y = LISTS.has(name) ? pos.get(location.hash) || 0 : 0;
    window.scrollTo(0, y);
  } else window.scrollTo(0, yBefore);
  prevHash = location.hash || '#/home';
  document.body.classList.remove('nav-hide');
}

export function uxInit() {
  if (document.__uxBound) return;
  document.__uxBound = true;
  let last = window.scrollY, ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY, d = y - last;
      const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 80;
      if (y < 80 || d < -6 || atEnd) document.body.classList.remove('nav-hide');
      else if (d > 8 && y > 140 && !document.querySelector('.sheet')) document.body.classList.add('nav-hide');
      last = y; ticking = false;
    });
  }, { passive: true });
}
