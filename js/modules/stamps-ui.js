// "Mis sellos" section at the top of the Viaje view: the traveller notes each real stamp they collect (goshuin or
// gojōin), with an optional note and place. "Ver en el mapa" opens the map showing only the places where a real stamp
// is confirmed. Calm by design: no streaks, no ranking, no reminders.
import { byId, h } from './dom.js';
import { fetchJson, cityDataPath } from './data.js';
import { toast, haptic } from './feedback.js';
import { userStorage } from './user-data.js';
import { createStampStore, countStamps, stampLook, stampPlaces, STAMP_KINDS } from './stamps.js';

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

/** Decorative artwork for one entry (the label is written next to it as text). */
export function stampSvg(id) {
  const { shape, motif } = stampLook(id);
  return svg('svg', { viewBox: '0 0 80 80', class: 'stamp-art', 'aria-hidden': 'true', focusable: 'false' }, ...FRAMES[shape](), ...MOTIF_ART[motif]());
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDate = (iso) => { const time = Date.parse(`${iso}T00:00:00Z`); return Number.isFinite(time) ? DATE_FORMAT.format(time) : ''; };

/** Places of every enabled city (small files, cached for offline use). Loaded the first time Viaje opens. */
async function loadCityPlaces(cities, load) {
  const loaded = await Promise.all(cities.map(async ({ id, name }) => {
    try { return { id, name, places: (await load(cityDataPath(id, 'places'))) ?? [] }; } catch (error) { console.warn(`[sellos] ${id}: ${error.message}`); return { id, name, places: [] }; }
  }));
  return loaded;
}

export function initStamps(cities, { storage = userStorage(), load = fetchJson, notify = toast, openMap = () => {} } = {}) {
  const section = byId('sellos');
  if (!section) return { show: async () => {} };
  const store = createStampStore(storage);
  const list = byId('stamps-list');
  const select = byId('stamp-place');
  const input = byId('stamp-label');
  let cityPlaces = cities.map(({ id, name }) => ({ id, name, places: [] }));
  let newestId = null;

  const placeName = (key) => {
    const [cityId, id] = String(key ?? '').split(':');
    return cityPlaces.find((city) => city.id === cityId)?.places.find((place) => place.id === id)?.name ?? '';
  };
  const cityName = (cityId) => cityPlaces.find((city) => city.id === cityId)?.name ?? cityId;

  function renderPlaces() {
    const groups = cityPlaces.map((city) => ({ city, places: stampPlaces(city.places) })).filter(({ places }) => places.length);
    select.replaceChildren(h('option', { value: '' }, 'Sin lugar'),
      ...groups.map(({ city, places }) => h('optgroup', { label: city.name },
        places.map((place) => h('option', { value: `${city.id}:${place.id}` }, `${place.name} · ${STAMP_KINDS[place.stamp.kind]}`)))));
    byId('stamps-map').hidden = groups.length === 0;
  }

  function render() {
    const entries = store.entries();
    const { total, byCity } = countStamps(entries);
    byId('stamps-total').textContent = total === 1 ? '1 sello' : `${total} sellos`;
    byId('stamps-cities').replaceChildren(...[...byCity].map(([cityId, count]) => h('span', { class: 'stamps-city-chip', dataset: { city: cityId } }, `${cityName(cityId)} ${count}`)));
    byId('stamps-empty').hidden = total > 0;
    list.replaceChildren(...entries.map((entry) => {
      const place = entry.place ? placeName(entry.place) : '';
      const meta = [place && place !== entry.label ? place : '', shortDate(entry.date)].filter(Boolean).join(' · ');
      return h('li', { class: `stamp${entry.id === newestId ? ' is-new' : ''}`, dataset: { stampId: entry.id }, style: `--tilt:${stampLook(entry.id).tilt}deg` },
        stampSvg(entry.id),
        h('span', { class: 'stamp-name' }, entry.label),
        meta ? h('span', { class: 'stamp-meta' }, meta) : null,
        h('button', { type: 'button', class: 'stamp-remove', 'aria-label': `Quitar el sello «${entry.label}»`, onclick: () => removeEntry(entry.id) }, '✕'));
    }));
    newestId = null;
  }

  function removeEntry(id) {
    const entry = store.remove(id);
    if (entry) notify('Sello quitado', { actionLabel: 'Deshacer', onAction: () => store.restore(entry) });
  }

  store.subscribe(render);
  byId('stamp-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const place = select.value || null;
    const entry = store.add({ label: input.value, place, placeName: placeName(place) });
    if (!entry) { notify('Has llegado al máximo de sellos que caben en la guía.'); return; }
    newestId = entry.id;
    render();
    haptic(16);
    input.value = '';
    select.value = '';
    notify(`Sello añadido: ${entry.label}`);
  });
  byId('stamps-map').addEventListener('click', () => openMap());

  render();
  section.hidden = false;
  let ready = null;
  return {
    store,
    /** Fills the place list the first time Viaje opens (it needs the places of every city). */
    show: () => (ready ??= loadCityPlaces(cities, load).then((loaded) => { cityPlaces = loaded; renderPlaces(); render(); }))
  };
}
