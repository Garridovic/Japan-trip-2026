// Highlights the section link of the page navigation that matches the section being read.
const OFFSET = 140; // sticky city tabs + section nav + some breathing room

export function initScrollSpy() {
  const links = [...document.querySelectorAll('.nav-inner a[href^="#"]')];
  let frame = null;

  function update() {
    frame = null;
    const visible = links
      .filter((link) => !link.hidden)
      .map((link) => ({ link, section: document.querySelector(link.getAttribute('href')) }))
      .filter(({ section }) => section && !section.hidden);
    let current = visible[0];
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atBottom) current = visible[visible.length - 1];
    else visible.forEach((entry) => { if (entry.section.getBoundingClientRect().top <= OFFSET) current = entry; });
    links.forEach((link) => {
      if (current && link === current.link) {
        link.setAttribute('aria-current', 'location');
        link.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      } else link.removeAttribute('aria-current');
    });
  }
  const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  return { refresh: schedule };
}
