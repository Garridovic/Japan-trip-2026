// In-page links to a day of the itinerary ("Ver detalle"): show the «Día a día» tab, open the day and scroll so that
// its title is not hidden under the two sticky bars. The browser's own jump would leave a closed day under the bars.
const clamp = (value, max) => Math.max(0, Math.min(value, max));

/** Scroll position that puts `element` right below the sticky bars (its scroll-margin-top). */
export function destinationFor(element, win = window, doc = document) {
  const margin = parseFloat(win.getComputedStyle(element).scrollMarginTop) || 0;
  const max = doc.documentElement.scrollHeight - win.innerHeight;
  return clamp(Math.round(element.getBoundingClientRect().top + win.scrollY - margin), max);
}

let beforeOpen = () => {};
/** Called before a day opens (main.js shows the «Día a día» tab there, so the day is visible). */
export function setBeforeOpenDay(fn) { beforeOpen = fn; }

export function openDay(target, { win = window, doc = document, smooth = true } = {}) {
  beforeOpen(target);
  if (target.tagName === 'DETAILS') target.open = true;
  win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}#${target.id}`);
  win.scrollTo({ top: destinationFor(target, win, doc), behavior: smooth ? 'smooth' : 'instant' });
  target.querySelector('summary')?.focus({ preventScroll: true });
}

export function initDayLinks({ win = window, doc = document } = {}) {
  doc.addEventListener('click', (event) => {
    const link = event.target.closest?.('a.text-link[href^="#dia"]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
    const target = doc.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    openDay(target, { win, doc });
  });
}
