// Section tabs of the city guide: each tab shows only its own section (instead of scrolling one long page).
//
// - The tab lives in the URL as ?tab=<id> (replaceState: Back never walks through tabs) and is remembered on this
//   device; old in-page links (#comer, #dia12…) still open the right tab.
// - The tab strip is sticky under the top bar. When it is already stuck, the new tab starts right below it (the
//   header does not come back); otherwise nothing moves. Each tab remembers its scroll position while the city stays.
// - Every section is rendered when the city loads and only hidden, so switching never waits or fetches anything.
export const TAB_QUERY_PARAM = 'tab';
export const GUIDE_TABS = ['resumen', 'mapa', 'detalle', 'comer', 'alternativas', 'practico'];
export const DEFAULT_TAB = 'resumen';
export const TAB_STORAGE_KEY = 'guide-tab';

/** The tab named in a query string, or null when there is none (or it is unknown). */
export function tabFromSearch(search) {
  const value = new URLSearchParams(search).get(TAB_QUERY_PARAM);
  return GUIDE_TABS.includes(value) ? value : null;
}

/** The tab an old in-page anchor points to: #comer → comer, #dia12 → detalle; anything else → null. */
export function tabForHash(hash = '') {
  const id = hash.replace(/^#/, '');
  if (GUIDE_TABS.includes(id)) return id;
  if (/^dia\w+$/.test(id)) return 'detalle';
  return null;
}

/** The URL with ?tab=<id> set and no #anchor. */
export function withTab(url, tab) {
  const next = new URL(url);
  next.searchParams.set(TAB_QUERY_PARAM, tab);
  next.hash = '';
  return next;
}

/** The first wanted tab the city has, else its first tab. */
export function pickTab(available, ...wanted) {
  for (const tab of wanted) if (tab && available.includes(tab)) return tab;
  return available[0] ?? DEFAULT_TAB;
}

function storage(win) {
  try { return win.localStorage; } catch { return null; }
}
export function rememberedTab(win = window) {
  const value = storage(win)?.getItem(TAB_STORAGE_KEY);
  return GUIDE_TABS.includes(value) ? value : null;
}

export function initGuideTabs({ win = window, doc = document, onChange = () => {} } = {}) {
  const view = doc.getElementById('city-view');
  const nav = view?.querySelector(':scope > nav');
  const strip = nav?.querySelector('.nav-inner');
  if (!strip) return { select() {}, refresh() {}, resetCity() {}, active: () => DEFAULT_TAB };
  const links = [...strip.querySelectorAll('a[href^="#"]')];
  const idOf = (link) => link.getAttribute('href').slice(1);
  const panelOf = (id) => doc.getElementById(id);
  let active = null;
  const scrollByTab = new Map();

  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Apartados de la guía');
  links.forEach((link) => {
    const id = idOf(link);
    link.setAttribute('role', 'tab');
    link.id = `guide-tab-${id}`;
    link.setAttribute('aria-controls', id);
    link.setAttribute('aria-selected', 'false');
    const panel = panelOf(id);
    if (panel) {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', link.id);
      panel.dataset.guidePanel = id;
    }
  });

  const available = () => links.filter((link) => !link.hidden && panelOf(idOf(link)) && !panelOf(idOf(link)).hidden).map(idOf);
  const linkOf = (id) => links.find((link) => idOf(link) === id);

  /** Scroll position at which the tab strip sticks under the top bar (the bottom of the city header). */
  function stickPoint() {
    const hero = view.querySelector(':scope > .hero');
    const top = parseFloat(win.getComputedStyle(nav).top) || 0;
    const bottom = hero && !hero.hidden ? hero.getBoundingClientRect().bottom + win.scrollY : nav.offsetTop + top;
    return Math.max(0, Math.round(bottom - top));
  }
  const isStuck = () => win.scrollY >= stickPoint() - 1;

  // Fade at the edges of the strip that still have tabs hidden beyond them (a hint that it scrolls sideways).
  function updateEdges() {
    nav.toggleAttribute('data-more-start', strip.scrollLeft > 4);
    nav.toggleAttribute('data-more-end', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
  }
  // Keeps the active tab in view inside the strip without touching the page scroll.
  function revealLink(link) {
    if (!link || strip.scrollWidth <= strip.clientWidth) { updateEdges(); return; }
    const left = link.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft + 8 || left + link.offsetWidth > strip.scrollLeft + strip.clientWidth - 8) {
      strip.scrollLeft = Math.max(0, left - 24);
    }
    updateEdges();
  }

  function paint() {
    view.dataset.guideTab = active;
    links.forEach((link) => {
      const on = idOf(link) === active;
      link.setAttribute('aria-selected', String(on));
      link.tabIndex = on ? 0 : -1;
    });
    GUIDE_TABS.forEach((id) => panelOf(id)?.toggleAttribute('data-active-panel', id === active));
    revealLink(linkOf(active));
  }

  /**
   * Shows one tab. source: 'click' (writes the URL and scrolls), 'init' (first paint, no URL change, no scroll),
   * 'history' (URL already right) or 'code' (search, day links: writes the URL).
   */
  function select(id, { source = 'code' } = {}) {
    const list = available();
    const tab = pickTab(list, id, DEFAULT_TAB);
    if (tab === active) {
      if (source === 'click') {
        win.history.replaceState(win.history.state, '', withTab(win.location.href, tab));
        if (win.scrollY > stickPoint()) win.scrollTo({ top: stickPoint(), behavior: 'smooth' });
      }
      return tab;
    }
    const wasStuck = active !== null && isStuck();
    if (active) scrollByTab.set(active, win.scrollY);
    active = tab;
    paint();
    try { storage(win)?.setItem(TAB_STORAGE_KEY, tab); } catch { /* private mode: not remembered */ }
    if (source === 'click' || source === 'code') {
      win.history.replaceState(win.history.state, '', withTab(win.location.href, tab));
    }
    if (wasStuck && source !== 'init') {
      const saved = scrollByTab.get(tab) ?? 0;
      const stick = stickPoint();
      win.scrollTo({ top: Math.max(saved, stick), behavior: 'instant' });
    }
    onChange(tab);
    return tab;
  }

  links.forEach((link) => link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
    event.preventDefault();
    select(idOf(link), { source: 'click' });
  }));
  strip.addEventListener('keydown', (event) => {
    // Tabs reachable only by URL (the guide map, now that the full-screen map has it all) are skipped by the arrows.
    const list = available().filter((id) => id === active || !linkOf(id)?.hasAttribute('data-url-only'));
    const index = list.indexOf(active);
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: list.length - 1 };
    if (!(event.key in moves) || index < 0) return;
    event.preventDefault();
    const next = list[(moves[event.key] + list.length) % list.length];
    select(next, { source: 'click' });
    linkOf(next)?.focus();
  });
  strip.addEventListener('scroll', updateEdges, { passive: true });
  win.addEventListener('resize', updateEdges);

  return {
    select,
    /** After a city renders: keeps the active tab if the city has it, otherwise falls back to its first tab. */
    refresh() {
      const tab = pickTab(available(), active, DEFAULT_TAB);
      if (tab !== active) select(tab, { source: 'history' });
      else paint();
    },
    /** A new city starts every tab at its top. */
    resetCity() { scrollByTab.clear(); },
    active: () => active
  };
}
