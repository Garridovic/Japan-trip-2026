import { test, expect } from '@playwright/test';

// Minimum legibility rules (phone, 320 px wide, light and dark). They protect the sizes, margins, spacings and contrasts of V14.13.1:
// every visible text is at least 12 px and reaches contrast 4.5:1 (3:1 for large text), nothing pushes the page sideways,
// everything you tap daily is at least 44 px high and the tap targets do not touch each other.
const SCREENS = [
  ['guía · vista rápida', '/?tab=resumen'], ['guía · día a día', '/?tab=detalle'], ['guía · comer', '/?tab=comer'],
  ['guía · otros lugares', '/?tab=alternativas'], ['guía · consejos', '/?tab=practico'],
  ['viaje', '/?view=viaje'], ['frases', '/?view=frases'], ['platos', '/?view=platos']
];

/** Runs in the page: returns every rule break found on the current screen. */
function scan() {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, bottom) => { const a = top.a + bottom.a * (1 - top.a); return { r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a, g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a, b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a, a }; };
  const page = parse(getComputedStyle(document.body).backgroundColor);
  const canvas = page && page.a ? page : { r: 255, g: 255, b: 255, a: 1 };
  const name = (el) => (el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + ((el.getAttribute('class') || '').split(/\s+/)[0] ? `.${el.getAttribute('class').split(/\s+/)[0]}` : ''));
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false; } return true; };
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none') return null; // text over a picture or gradient: not measurable here
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let acc = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : canvas;
    while (layers.length) acc = over(layers.pop(), acc);
    return acc;
  };
  const opacity = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const found = { overflow: document.documentElement.scrollWidth - innerWidth, small: [], contrast: [], targets: [], touching: [] };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let node; (node = walker.nextNode());) {
    const el = node.parentElement;
    if (!el || seen.has(el) || !node.textContent.trim() || ['SCRIPT', 'STYLE'].includes(el.tagName) || !visible(el) || el.closest('.leaflet-container, .visually-hidden, :disabled')) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    if (size < 12) found.small.push(`${name(el)} ${size.toFixed(1)}px «${node.textContent.trim().slice(0, 24)}»`);
    const fg = parse(s.color);
    const bg = background(el);
    if (!fg || !bg) continue;
    const effective = over({ ...fg, a: fg.a * opacity(el) }, bg);
    const need = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight, 10) >= 700) ? 3 : 4.5;
    const got = ratio(effective, bg);
    if (got < need) found.contrast.push(`${name(el)} ${got.toFixed(2)}:1 (<${need}) «${node.textContent.trim().slice(0, 24)}»`);
  }

  const selector = 'a[href], button, summary, select, input:not([type=hidden]):not([type=checkbox]), [role=button], [role=tab]';
  const items = [...document.querySelectorAll(selector)].filter((el) => visible(el) && !el.closest('.leaflet-container, .visually-hidden, .app-bar')) // the bottom bar is a fixed strip whose tabs sit side by side by design
    .filter((el) => !(el.tagName === 'A' && getComputedStyle(el).display === 'inline')) // links inside a sentence
    .map((el) => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0);
  for (const { el, r } of items) {
    if (Math.min(r.width, r.height) < 43.5 && el.closest('#city-view, #view-viaje, #view-frases, #view-platos, .poi-detail')) found.targets.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    for (const other of items) {
      if (other.el === el || el.contains(other.el) || other.el.contains(el)) continue;
      const dx = Math.max(other.r.left - r.right, r.left - other.r.right, 0);
      const dy = Math.max(other.r.top - r.bottom, r.top - other.r.bottom, 0);
      if (Math.hypot(dx, dy) < 4 && el.compareDocumentPosition(other.el) & Node.DOCUMENT_POSITION_FOLLOWING) found.touching.push(`${name(el)} ↔ ${name(other.el)}`);
    }
  }
  return found;
}

for (const colorScheme of ['light', 'dark']) {
  test.describe(`legibility minimums · ${colorScheme}`, () => {
    test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, colorScheme });

    for (const [label, url] of SCREENS) {
      test(`${label}: text of 12 px or more, contrast 4.5:1, no sideways scroll`, async ({ page }) => {
        await page.goto(url);
        await expect(page.locator('#hero-title')).not.toHaveText('…');
        await page.waitForTimeout(800);
        const found = await page.evaluate(scan);
        expect(found.overflow, 'sideways scroll').toBeLessThanOrEqual(0);
        expect(found.small, 'text under 12 px').toEqual([]);
        expect(found.contrast, 'text contrast').toEqual([]);
      });
    }

    for (const [label, url] of SCREENS.slice(0, 5)) {
      test(`${label}: day-to-day targets of 44 px, none touching another`, async ({ page }) => {
        await page.goto(url);
        await expect(page.locator('#hero-title')).not.toHaveText('…');
        await page.waitForTimeout(800);
        const found = await page.evaluate(scan);
        expect(found.targets, 'targets under 44 px').toEqual([]);
        expect(found.touching, 'targets touching').toEqual([]);
      });
    }
  });
}
