// Page section navigation: highlights the section being read and scrolls to a section when its link is clicked.
//
// Clicking is handled here (instead of the browser's default anchor jump) so that the highlight does not fight
// the smooth scroll: while a click-initiated scroll is running, the clicked link stays highlighted, and the final
// position is corrected once if the layout moved meanwhile (lazy images, opened days…). The nav strip is scrolled
// sideways with scrollLeft: scrollIntoView() would also scroll the page and cancel the smooth scroll in some browsers.
const OFFSET = 140; // sticky city tabs + section nav + some breathing room
const SETTLE_MS = 160; // quiet time without scroll events that marks the end of a scroll
const TOLERANCE = 3;
const MAX_WAITS = 12; // × SETTLE_MS: about 2 s of patience before forcing the position

export function initScrollSpy(win = window, doc = document) {
  const links = [...doc.querySelectorAll('.nav-inner a[href^="#"]')];
  let frame = null;
  let target = null; // { link, section } while a click-initiated scroll is running
  let settleTimer = null;

  const sectionOf = (link) => doc.querySelector(link.getAttribute('href'));
  const visibleEntries = () => links
    .filter((link) => !link.hidden)
    .map((link) => ({ link, section: sectionOf(link) }))
    .filter(({ section }) => section && !section.hidden);

  const marginOf = (section) => parseFloat(win.getComputedStyle(section).scrollMarginTop) || 0;
  const destination = (section) => Math.max(0, Math.round(section.getBoundingClientRect().top + win.scrollY - marginOf(section)));
  const maxScroll = () => doc.documentElement.scrollHeight - win.innerHeight;

  // Fade at the edges of the strip that still have tabs hidden beyond them (a hint that it scrolls).
  function updateEdges(strip) {
    const nav = strip.parentElement;
    nav.toggleAttribute('data-more-start', strip.scrollLeft > 4);
    nav.toggleAttribute('data-more-end', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
  }

  function highlight(link) {
    links.forEach((other) => {
      if (other === link) other.setAttribute('aria-current', 'location');
      else other.removeAttribute('aria-current');
    });
    // Keep the active link in view inside the nav strip without touching the page scroll.
    const strip = link?.parentElement;
    if (strip) updateEdges(strip);
    if (strip && strip.scrollWidth > strip.clientWidth) {
      const left = link.offsetLeft - strip.offsetLeft;
      if (left < strip.scrollLeft + 8 || left + link.offsetWidth > strip.scrollLeft + strip.clientWidth - 8) {
        strip.scrollLeft = Math.max(0, left - 24);
      }
    }
  }

  function update() {
    frame = null;
    if (target) { highlight(target.link); return; }
    const visible = visibleEntries();
    let current = visible[0];
    const atBottom = win.innerHeight + win.scrollY >= doc.documentElement.scrollHeight - 4;
    if (atBottom) current = visible[visible.length - 1];
    else visible.forEach((entry) => { if (entry.section.getBoundingClientRect().top <= OFFSET) current = entry; });
    highlight(current?.link ?? null);
  }
  const schedule = () => { if (frame === null) frame = win.requestAnimationFrame(update); };

  function finishClickScroll() {
    if (!target) return;
    const { section } = target;
    const wanted = Math.min(destination(section), Math.max(0, maxScroll()));
    const off = Math.abs(win.scrollY - wanted) > TOLERANCE;
    // A busy page can pause the smooth scroll for a moment: if it has not arrived, keep waiting (a few times)
    // before correcting the position directly, so the highlight never jumps to another section meanwhile.
    if (off && target.waits < MAX_WAITS) { target.waits += 1; armSettle(); return; }
    if (off) win.scrollTo({ top: wanted, behavior: 'instant' });
    target = null;
    schedule();
  }
  function onNavClick(event) {
    const link = event.currentTarget;
    const section = sectionOf(link);
    if (!section || section.hidden || event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
    event.preventDefault();
    target = { link, section, waits: 0 };
    highlight(link);
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}${link.getAttribute('href')}`);
    win.scrollTo({ top: Math.min(destination(section), Math.max(0, maxScroll())), behavior: 'smooth' });
    armSettle(); // covers the case where nothing needs to scroll (already there)
  }

  links.forEach((link) => link.addEventListener('click', onNavClick));
  win.addEventListener('scroll', () => { schedule(); if (target) armSettle(); }, { passive: true });
  win.addEventListener('resize', schedule);
  links[0]?.parentElement?.addEventListener('scroll', () => updateEdges(links[0].parentElement), { passive: true });
  return { refresh: schedule };
}
