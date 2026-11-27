// Header carousel: native horizontal scroll with snapping (swipe, trackpad and keyboard all work), plus page dots.
// Slides that are hidden (for example "Ahora" outside the trip) are skipped. The first visible slide is the one shown on open.
import { byId } from './dom.js';

export function initHero({ doc = document } = {}) {
  const viewport = byId('hero-viewport');
  const track = byId('hero-track');
  const dotsBox = byId('hero-dots');
  if (!viewport || !track) return { goTo() {}, reset() {}, paintDots() {} };
  const slides = () => [...track.querySelectorAll('.hero-slide')].filter((slide) => !slide.hidden);

  function activeIndex() {
    const list = slides();
    const center = viewport.scrollLeft + viewport.clientWidth / 2;
    let best = 0;
    list.forEach((slide, index) => { if (Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center) < Math.abs(list[best].offsetLeft + list[best].offsetWidth / 2 - center)) best = index; });
    return best;
  }
  function paintDots() {
    const list = slides();
    dotsBox.hidden = list.length < 2;
    const active = activeIndex();
    dotsBox.replaceChildren(...list.map((_, index) => Object.assign(doc.createElement('i'), { className: index === active ? 'on' : '' })));
  }
  function goTo(name, { smooth = true } = {}) {
    const slide = slides().find((item) => item.dataset.slide === name);
    if (slide) viewport.scrollTo({ left: slide.offsetLeft - track.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft || '0'), behavior: smooth ? 'smooth' : 'instant' });
  }
  viewport.addEventListener('scroll', () => requestAnimationFrame(paintDots), { passive: true });
  viewport.addEventListener('keydown', (event) => {
    if (event.target !== viewport || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const list = slides();
    const next = Math.max(0, Math.min(list.length - 1, activeIndex() + (event.key === 'ArrowRight' ? 1 : -1)));
    event.preventDefault();
    goTo(list[next].dataset.slide);
  });
  new MutationObserver(() => { paintDots(); if (!slides().length) return; }).observe(track, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  window.addEventListener('resize', paintDots);
  paintDots();
  const reset = () => { viewport.scrollLeft = 0; paintDots(); };
  return { goTo, paintDots, reset };
}
