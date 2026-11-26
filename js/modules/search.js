// Global search: one index over what is already loaded (active city places, restaurants and extras, plus the global
// phrases and dishes). No network, so it also works offline, and other cities are never downloaded for it.
import { normalizeText } from './phrases.js';

export const KINDS = [
  { id: 'place', label: 'Lugares' },
  { id: 'restaurant', label: 'Restaurantes' },
  { id: 'extra', label: 'Otros lugares' },
  { id: 'phrase', label: 'Frases' },
  { id: 'dish', label: 'Platos' }
];

const entry = (kind, id, title, subtitle, ...extra) => ({ kind, id, title, subtitle, text: normalizeText([title, subtitle, ...extra].join(' ')), head: normalizeText(title) });

export function buildIndex({ places = [], restaurants = [], extras = [], phrases = [], dishes = [] } = {}) {
  return [
    ...places.filter((p) => p.type !== 'restaurant').map((p) => entry('place', p.id, p.name, p.desc ?? '', p.query)),
    ...restaurants.map((r) => entry('restaurant', r.id, r.name, r.foodTypeLabel ?? '', r.desc, r.query)),
    ...extras.map((x) => entry('extra', x.name, x.name, x.tag ?? '', x.desc)),
    ...phrases.map((p) => entry('phrase', p.id, p.es, `${p.ja} · ${p.romaji}`, p.ja, p.romaji)),
    ...dishes.map((d) => entry('dish', d.id, d.es, `${d.ja} · ${d.romaji}`, d.ja, d.romaji, d.description))
  ];
}

const termsOf = (query) => String(query ?? '').trim().split(/\s+/).map(normalizeText).filter(Boolean);

/** Groups of results (in KINDS order), best first inside each group. Needs every term; titles that start with the first term rank higher. */
export function search(index, query, { perKind = 5 } = {}) {
  const terms = termsOf(query);
  if (!terms.length || terms.join('').length < 2) return [];
  const scored = index.filter((item) => terms.every((term) => item.text.includes(term)))
    .map((item) => ({ item, score: (item.head.startsWith(terms[0]) ? 0 : item.head.includes(terms[0]) ? 1 : 2) }));
  return KINDS.map(({ id, label }) => ({
    kind: id, label,
    total: scored.filter(({ item }) => item.kind === id).length,
    items: scored.filter(({ item }) => item.kind === id).sort((a, b) => a.score - b.score).slice(0, perKind).map(({ item }) => item)
  })).filter((group) => group.total > 0);
}
