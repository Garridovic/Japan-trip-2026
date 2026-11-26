// Own flat illustrations for restaurants and places that have no photo. No credits needed: they are drawn here.
// Shapes are plain data (tag + attributes) so no HTML string is ever parsed. Classes are coloured by the theme tokens.
//   s = outline, f = solid accent, w = surface fill, g = gold fill

const P = (d, c = 's') => ['path', { d, class: c }];
const C = (cx, cy, r, c = 's') => ['circle', { cx, cy, r, class: c }];
const R = (x, y, width, height, rx = 0, c = 's') => ['rect', { x, y, width, height, rx, class: c }];
const L = (x1, y1, x2, y2, c = 's') => ['line', { x1, y1, x2, y2, class: c }];
const steam = (x) => P(`M${x} 14c-4-3 4-5 0-9`);

export const ART = {
  noodles: [steam(24), steam(32), steam(40), P('M8 30h48c0 14-10 24-24 24S8 44 8 30z', 'w'), P('M14 36c6 4 10-4 16 0s10-4 20 0', 's'), C(40, 33, 4, 'g'), L(46, 6, 28, 28)],
  sushi: [R(8, 36, 48, 16, 8, 'w'), P('M6 36c2-14 18-18 26-12 8-6 24-2 26 12z', 'f'), P('M20 30l6 6M32 28l6 8M44 30l4 6', 's')],
  cutlet: [P('M10 38c0-14 10-24 24-24s20 10 20 22-12 18-24 18S10 50 10 38z', 'g'), P('M20 30l20 18M28 26l18 16M18 40l12 12', 's')],
  skewer: [L(8, 56, 56, 8), C(20, 44, 7, 'f'), C(32, 32, 7, 'g'), C(44, 20, 7, 'f')],
  dumpling: [P('M8 44c0-16 12-26 24-26s24 10 24 26c0 4-48 4-48 0z', 'w'), P('M18 28v8M25 24v10M32 22v12M39 24v10M46 28v8')],
  pot: [steam(24), steam(40), P('M10 28h44v14c0 8-8 14-22 14S10 50 10 42z', 'w'), L(6, 28, 58, 28), P('M20 28c0-6 24-6 24 0', 's'), C(26, 40, 3, 'g'), C(38, 44, 3, 'f')],
  tray: [R(6, 16, 52, 36, 6, 'w'), C(20, 34, 8, 'g'), C(44, 34, 8, 'f'), R(26, 22, 12, 24, 4, 's')],
  balls: [P('M6 44h52l-4 8H10z', 'w'), C(18, 34, 10, 'g'), C(36, 30, 10, 'g'), C(48, 38, 7, 'g'), P('M12 30l8 6M30 26l8 6', 's')],
  pancake: [['ellipse', { cx: 32, cy: 38, rx: 26, ry: 14, class: 'g' }], P('M14 36c6-6 10 6 16 0s10 6 20 0', 's'), P('M18 42c8 4 20 4 28 0', 's')],
  tea: [P('M10 26h44c0 16-8 28-22 28S10 42 10 26z', 'w'), P('M14 30c10 4 26 4 36 0', 'f'), steam(26), steam(38)],
  cup: [P('M12 26h30v14c0 8-6 14-15 14s-15-6-15-14z', 'w'), P('M42 30h4a6 6 0 010 14h-5', 's'), steam(22), steam(32), L(8, 58, 50, 58)],
  curry: [P('M6 36h52c0 12-10 20-26 20S6 48 6 36z', 'w'), P('M10 36c4-14 22-18 34-8l6 8z', 'g'), P('M26 30l10 4M32 26l8 4', 's'), C(46, 28, 4, 'f')],
  market: [P('M6 24l6-14h40l6 14z', 'f'), P('M6 24c0 6 10 6 10 0 0 6 10 6 10 0 0 6 12 6 12 0 0 6 10 6 10 0 0 6 10 6 10 0', 's'), R(10, 30, 44, 24, 2, 'w'), R(16, 38, 10, 8, 2, 'g'), R(32, 38, 14, 8, 2, 'g')],
  lantern: [L(32, 4, 32, 10), R(22, 10, 20, 6, 2, 'f'), P('M20 16h24c4 8 4 24 0 32H20c-4-8-4-24 0-32z', 'g'), R(22, 48, 20, 6, 2, 'f'), L(26, 22, 26, 42), L(38, 22, 38, 42), L(32, 54, 32, 60)],
  rice: [P('M8 32h48c0 14-10 24-24 24S8 46 8 32z', 'w'), P('M12 32c2-14 18-20 20-20s18 6 20 20z', 'g'), L(44, 6, 30, 26), L(50, 8, 36, 28)],
  temple: [R(8, 10, 48, 7, 3, 'f'), R(14, 22, 36, 5, 2, 's'), R(16, 17, 6, 40, 1, 'w'), R(42, 17, 6, 40, 1, 'w'), L(10, 6, 54, 6)],
  mountain: [C(46, 14, 6, 'g'), P('M2 54L24 16l14 22 8-10 16 26z', 'w'), P('M24 16l-7 12 7-3 7 3z', 'f')],
  pagoda: [L(32, 2, 32, 8), P('M12 18h40l-6-8H18z', 'f'), P('M16 34h32l-5-8H21z', 'f'), P('M10 50h44l-8-10H18z', 'f'), R(20, 18, 24, 6, 0, 'w'), R(24, 34, 16, 6, 0, 'w'), R(28, 50, 8, 8, 0, 'w')],
  street: [P('M6 30l14-14 14 14v26H6z', 'w'), P('M30 24l14-12 14 12v32H30z', 'g'), R(14, 40, 8, 16, 1, 's'), R(40, 38, 10, 18, 1, 's'), L(2, 58, 62, 58)],
  pin: [P('M32 58C18 40 14 32 14 24a18 18 0 0136 0c0 8-4 16-18 34z', 'f'), C(32, 24, 7, 'w')]
};

// Order matters: the first keyword found in the label wins (label first, then the filter category).
const FOOD_RULES = [
  [/ramen|soba|udon|fideos/i, 'noodles'], [/sushi|zushi/i, 'sushi'], [/kushikatsu|yakitori|brocheta/i, 'skewer'],
  [/gyukatsu|katsu|tempura|wagyu|carne/i, 'cutlet'], [/gyoza/i, 'dumpling'], [/yudofu|tofu|motsunabe|nabe|oden|hot pot/i, 'pot'],
  [/takoyaki/i, 'balls'], [/okonomiyaki/i, 'pancake'], [/matcha|zenzai|postre|dulces|t[eé]/i, 'tea'], [/caf[eé]/i, 'cup'],
  [/curry/i, 'curry'], [/mercado/i, 'market'], [/callej[oó]n|varios/i, 'lantern'], [/obanzai|shojin|kaiseki|tradicional|izakaya/i, 'tray']
];
export function foodArtKind(item) {
  for (const field of [item?.foodTypeLabel, item?.foodCategory]) {
    const hit = FOOD_RULES.find(([pattern]) => pattern.test(field ?? ''));
    if (hit) return hit[1];
  }
  return 'rice';
}
const EXTRA = { templos: 'temple', naturaleza: 'mountain', cultura: 'pagoda', barrios: 'street' };
export const extraArtKind = (item) => EXTRA[item?.category] ?? 'pin';

const TONE = { noodles: 'warm', cutlet: 'warm', skewer: 'warm', curry: 'warm', sushi: 'net', pot: 'warn', tray: 'warn', balls: 'warn', pancake: 'warn', dumpling: 'warm',
  tea: 'ok', cup: 'ok', market: 'warm', lantern: 'warn', rice: 'warn', temple: 'warm', mountain: 'ok', pagoda: 'net', street: 'warn', pin: 'warm' };
export const artTone = (kind) => TONE[kind] ?? 'warm';

/** Decorative SVG banner for a card (the card text already names the place, so it is hidden from screen readers). */
export function artBanner(kind) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of ART[kind] ?? ART.pin) {
    const node = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    svg.append(node);
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'card-art';
  wrapper.dataset.art = kind;
  wrapper.dataset.tone = artTone(kind);
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.append(svg);
  return wrapper;
}
