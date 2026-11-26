// "Mis sellos" section at the top of the Viaje view: a goshuin-style stamp for every visited place, grouped by city,
// with a progress ring per city and a small celebration when a city is completed. Calm by design: no streaks, no ranking.
import { byId, h } from './dom.js';
import { fetchJson, cityDataPath } from './data.js';
import { visitedStore } from './visited.js';
import { toast } from './feedback.js';
import { buildCollections, stampLook, percent } from './stamps.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...children) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  children.forEach((child) => node.append(child));
  return node;
};

const FRAMES = {
  circle: () => [svg('circle', { cx: 40, cy: 40, r: 35, class: 'stamp-line' }), svg('circle', { cx: 40, cy: 40, r: 30, class: 'stamp-line thin' })],
  ring: () => [svg('circle', { cx: 40, cy: 40, r: 35, class: 'stamp-line' }), svg('circle', { cx: 40, cy: 40, r: 29, class: 'stamp-line dashed' })],
  square: () => [svg('rect', { x: 6, y: 6, width: 68, height: 68, rx: 9, class: 'stamp-line' }), svg('rect', { x: 11, y: 11, width: 58, height: 58, rx: 5, class: 'stamp-line thin' })],
  octagon: () => [svg('path', { d: 'M26 5h28l21 21v28L54 75H26L5 54V26Z', class: 'stamp-line' }), svg('path', { d: 'M28 11h24l17 17v24L52 69H28L11 52V28Z', class: 'stamp-line thin' })]
};
const MOTIF_ART = {
  torii: () => [svg('path', { d: 'M20 29c8 3 32 3 40 0M24 35h32M30 35v22M50 35v22M28 44h24', class: 'stamp-fill-line' })],
  sun: () => [svg('circle', { cx: 40, cy: 40, r: 12, class: 'stamp-solid' })],
  waves: () => [svg('path', { d: 'M20 46c5-8 11-8 15 0 4-8 10-8 15 0 4-8 8-8 10-3M20 35c5-8 11-8 15 0 4-8 10-8 15 0', class: 'stamp-fill-line' })],
  mountain: () => [svg('path', { d: 'M18 55 33 30l8 12 6-8 15 21Z', class: 'stamp-solid' }), svg('path', { d: 'M18 55h44', class: 'stamp-fill-line' })]
};

/** The stamp artwork for one place (decorative: the name is written next to it as text). */
export function stampSvg(cityId, id) {
  const { shape, motif } = stampLook(cityId, id);
  return svg('svg', { viewBox: '0 0 80 80', class: 'stamp-art', 'aria-hidden': 'true', focusable: 'false' }, ...FRAMES[shape](), ...MOTIF_ART[motif]());
}

const RADIUS = 15.9155; // circumference 100: stroke-dasharray is directly a percentage
function ring(collection) {
  const pct = percent(collection);
  return svg('svg', { viewBox: '0 0 40 40', class: 'stamp-ring', 'aria-hidden': 'true', focusable: 'false' },
    svg('circle', { cx: 20, cy: 20, r: RADIUS, class: 'stamp-ring-track' }),
    svg('circle', { cx: 20, cy: 20, r: RADIUS, class: 'stamp-ring-fill', 'stroke-dasharray': `${pct} ${100 - pct}`, transform: 'rotate(-90 20 20)' }));
}

function stampCell(cityId, stamp, isNew) {
  const look = stampLook(cityId, stamp.id);
  return h('li', { class: `stamp${stamp.visited ? ' is-earned' : ''}${isNew ? ' is-new' : ''}`, dataset: { stampId: stamp.id }, style: `--tilt:${look.tilt}deg` },
    stamp.visited ? stampSvg(cityId, stamp.id) : h('span', { class: 'stamp-slot', 'aria-hidden': 'true' }),
    h('span', { class: 'stamp-name' }, stamp.name),
    h('span', { class: 'visually-hidden' }, stamp.visited ? ' (sello conseguido)' : ' (sello por conseguir)'));
}

/** Loads the places of every enabled city in the background (small files, already cached for offline use). */
async function loadCityPlaces(cities, load) {
  const loaded = await Promise.all(cities.map(async ({ id, name }) => {
    try { return { id, name, places: (await load(cityDataPath(id, 'places'))) ?? [] }; } catch (error) { console.warn(`[sellos] ${id}: ${error.message}`); return null; }
  }));
  return loaded.filter(Boolean);
}

export function initStamps(cities, { store = visitedStore(), load = fetchJson, notify = toast } = {}) {
  const section = byId('sellos');
  if (!section || !cities.length) { section?.setAttribute('hidden', ''); return { show: async () => {} }; }
  const list = byId('stamps-cities');
  const openCities = new Set();
  let placesByCity = [];
  let lastComplete = new Set();
  let newest = null; // { cityId, id }: the stamp that just arrived, to animate it once

  function render() {
    const collections = buildCollections(placesByCity, store);
    const total = collections.reduce((sum, c) => sum + c.done, 0);
    byId('stamps-total').textContent = total === 1 ? '1 sello' : `${total} sellos`;
    section.hidden = collections.length === 0;
    list.replaceChildren(...collections.map((collection) => {
      const earned = collection.stamps.filter((stamp) => stamp.visited);
      const pending = collection.stamps.filter((stamp) => !stamp.visited);
      const details = h('details', { class: `stamps-city${collection.complete ? ' is-complete' : ''}`, dataset: { city: collection.id }, open: openCities.has(collection.id) },
        h('summary', {},
          ring(collection),
          h('span', { class: 'stamps-city-name' }, collection.name),
          h('span', { class: 'stamps-count', dataset: { done: collection.done, total: collection.total } }, `${collection.done}/${collection.total}`),
          collection.complete ? h('span', { class: 'stamps-badge' }, 'Colección completa') : null),
        collection.done === 0 ? h('p', { class: 'muted small stamps-empty' }, 'Marca un lugar como visitado y se estampará aquí su sello.') : null,
        collection.done ? h('ul', { class: 'stamps-grid' }, earned.map((stamp) => stampCell(collection.id, stamp, newest?.cityId === collection.id && newest.id === stamp.id))) : null,
        pending.length ? h('details', { class: 'stamps-pending' }, h('summary', {}, `Por conseguir (${pending.length})`), h('ul', { class: 'stamps-grid' }, pending.map((stamp) => stampCell(collection.id, stamp, false)))) : null);
      details.addEventListener('toggle', () => { if (details.open) openCities.add(collection.id); else openCities.delete(collection.id); });
      return details;
    }));
    newest = null;
    return collections;
  }

  /** Fetches the places of every city once: the first time Viaje opens, or the first time a place is marked. */
  let ready = null;
  const ensure = () => (ready ??= loadCityPlaces(cities, load).then((loaded) => {
    placesByCity = loaded;
    lastComplete = new Set(render().filter((c) => c.complete).map((c) => c.id));
  }));

  store.subscribe(async ({ cityId, id, visited }) => {
    const wasLoaded = placesByCity.length > 0;
    if (!wasLoaded) { await ensure(); return; } // first load already shows the new mark; nothing to celebrate yet
    if (visited) { newest = { cityId, id }; openCities.add(cityId); }
    const collections = render();
    const complete = new Set(collections.filter((c) => c.complete).map((c) => c.id));
    for (const collection of collections) {
      if (complete.has(collection.id) && !lastComplete.has(collection.id)) {
        notify(`Colección de ${collection.name} completa: ${collection.total} sellos`, { duration: 6000 });
        list.querySelector(`[data-city="${CSS.escape(collection.id)}"]`)?.classList.add('is-celebrating');
      }
    }
    lastComplete = complete;
  });

  return { show: ensure, render };
}
