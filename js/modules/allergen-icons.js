// Small icons for the allergen tags on dishes. Always shown next to the text label, never instead of it:
// an icon alone is not enough for something that matters for health. Drawn here, no credits needed.
const E = (cx, cy, rx, ry, rot = 0) => ['ellipse', { cx, cy, rx, ry, transform: rot ? `rotate(${rot} ${cx} ${cy})` : null }];
const P = (d) => ['path', { d }];

export const ALLERGEN_ICONS = {
  gluten: [P('M12 22V9'), E(8.5, 8, 2, 3.2, -35), E(15.5, 8, 2, 3.2, 35), E(8.5, 13, 2, 3.2, -35), E(15.5, 13, 2, 3.2, 35), E(12, 4, 1.8, 2.8)],
  huevo: [P('M12 3c-4 0-7 6-7 11a7 7 0 0014 0c0-5-3-11-7-11z')],
  pescado: [E(10, 12, 7, 4.5), P('M17 12l5-4v8z'), ['circle', { cx: 6.5, cy: 11, r: 0.9 }]],
  marisco: [P('M5 9c3-6 12-5 14 1 1 4-1 8-5 9'), P('M14 19l-3 3M17 18l-1 4M10 17l-4 3'), P('M5 9l-2-3M7 7l-1-4')],
  soja: [E(8.5, 9, 4.5, 3, -30), E(15.5, 15, 4.5, 3, -30), ['circle', { cx: 7.5, cy: 8.5, r: 0.8 }], ['circle', { cx: 16.5, cy: 15.5, r: 0.8 }]]
};

export function allergenIcon(key) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'allergen-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of ALLERGEN_ICONS[key] ?? []) {
    const node = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) if (value !== null) node.setAttribute(name, String(value));
    svg.append(node);
  }
  return svg;
}

/** The tag: icon + text label. */
export function allergenTag(key, label) {
  const tag = document.createElement('span');
  tag.className = 'dish-allergen';
  tag.dataset.allergen = key;
  tag.append(allergenIcon(key), document.createTextNode(label));
  return tag;
}

/** Compact row for cards: icons with a text alternative. */
export function allergenRow(keys, labels) {
  const row = document.createElement('span');
  row.className = 'allergen-row';
  for (const key of keys) {
    const item = document.createElement('span');
    item.className = 'allergen-chip';
    item.dataset.allergen = key;
    item.setAttribute('role', 'img');
    item.setAttribute('aria-label', labels[key]);
    item.title = labels[key];
    item.append(allergenIcon(key));
    row.append(item);
  }
  return row;
}
