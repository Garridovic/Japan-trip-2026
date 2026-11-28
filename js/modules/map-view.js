// Full-screen map view ("Mapa" in the bottom bar, ?view=mapa).
// There is only one Leaflet map. Entering the view MOVES the map element and its panels (filters, nearby places,
// offline button) into this view; leaving puts every node back exactly where it was in the guide, so the map in the
// guide section keeps working as before. Filters (with the legend), "Cerca de mí" and "Guardar mapa" live in one bottom sheet.
// City: a red chip under the search field opens the «Ciudad» sheet.
// Layout: one round Filtros button (top left) with the number of active filters and, beside it, a single fixed-size
// "N de M lugares" pill; the saved-map cloud, «Cerca de mí» and the zoom stack bottom right.
import { byId, h } from './dom.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';
import { shownLabel } from './map-filters.js';
import { staysOf } from './journey.js';
import { dateRange, daysBetween, nightsLabel } from './trip-status.js';
import { enableSheetDrag } from './sheet-drag.js';

export const SHEETS = {
  filters: 'Filtros',
  nearby: 'Cerca de mí',
  offline: 'Mapa sin conexión',
  city: 'Ciudad'
};

/** Second line of a city card: dates and nights ("11–15 dic · 4 noches"); a city visited twice lists both stays. */
export function cityCardInfo(entry) {
  const stays = staysOf(entry).filter((stay) => stay.arrival && stay.departure);
  if (!stays.length) return '';
  if (stays.length === 1) return `${dateRange(stays[0].arrival, stays[0].departure)} · ${nightsLabel(Math.max(0, daysBetween(stays[0].arrival, stays[0].departure)))}`;
  return `${stays.map((stay) => dateRange(stay.arrival, stay.departure)).join(' · ')} · ${stays.length} estancias`;
}

/** Accessible name of the city chip. */
export const cityChipLabel = (name) => `Ciudad: ${name}. Cambiar`;

/** Accessible name of the cloud button for each state of the saved map (map-offline.js sets data-state on «Guardar mapa»). */
export const OFFLINE_LABELS = {
  none: 'Mapa sin guardar',
  saving: 'Guardando el mapa',
  partial: 'Mapa guardado a medias',
  error: 'El mapa no se guardó entero',
  complete: 'Mapa guardado sin conexión'
};

/** Accessible name of the round Filtros button. */
export const filtersButtonLabel = (count) => (count ? `Filtros, ${count} ${count === 1 ? 'activo' : 'activos'}` : 'Filtros');

/** Remembers where a node lives so it can be put back (before the next sibling, or at the end of its parent). */
export function rememberHome(node) {
  return { node, parent: node.parentNode, next: node.nextSibling };
}
export function restoreHome({ node, parent, next }) {
  if (next && next.parentNode === parent) parent.insertBefore(node, next);
  else parent.appendChild(node);
}

export function initMapView({ map, doc = document, cities = [], onCity = () => {} }) {
  const view = doc.getElementById('view-mapa');
  if (!view) return { sync() {}, isOpen: () => false, hideCard() {}, setCity() {}, setBusy() {} };
  const canvas = byId('map-view-canvas');
  const sheet = byId('map-sheet');
  const sheetTitle = byId('map-sheet-title');
  const sections = Object.fromEntries(Object.keys(SHEETS).map((name) => [name, doc.querySelector(`[data-sheet-section="${name}"]`)]));
  const buttons = [...view.querySelectorAll('[data-map-sheet]')];

  const mapElement = byId('city-map');
  const offlineBlock = byId('save-offline-map')?.closest('.map-offline') ?? null;
  const legendDetails = doc.querySelector('.map-legend');
  const moves = [
    { home: rememberHome(mapElement), target: canvas },
    ...['map-filters', 'map-filter-status'].map((id) => ({ home: rememberHome(byId(id)), target: sections.filters })),
    { home: rememberHome(legendDetails), target: sections.filters }, // the legend lives under the filters
    { home: rememberHome(doc.querySelector('.nearby-panel')), target: sections.nearby },
    ...(offlineBlock ? [{ home: rememberHome(offlineBlock), target: sections.offline }] : [])
  ];
  const filtersDetails = byId('map-filters');

  let inside = false;
  let openSheet = null;
  let askedLocation = false;
  let filtersWereOpen = false;
  let legendWasOpen = false;

  function closeSheet({ fromHistory = false } = {}) {
    if (!openSheet) return;
    openSheet = null;
    sheet.hidden = true;
    view.classList.remove('has-sheet');
    buttons.forEach((button) => { button.setAttribute('aria-expanded', 'false'); button.classList.remove('is-active'); });
    if (!fromHistory) releaseOverlay('map-sheet');
  }

  function showSheet(name) {
    if (openSheet === name) { closeSheet(); return; }
    hideCard();
    const wasOpen = Boolean(openSheet);
    openSheet = name;
    sheetTitle.textContent = SHEETS[name];
    sheet.dataset.sheet = name;
    view.classList.add('has-sheet');
    Object.entries(sections).forEach(([key, section]) => { section.hidden = key !== name; });
    buttons.forEach((button) => {
      const active = button.dataset.mapSheet === name;
      button.setAttribute('aria-expanded', String(active));
      button.classList.toggle('is-active', active);
    });
    sheet.hidden = false;
    paintSheetChrome();
    if (!wasOpen) openOverlay('map-sheet', () => closeSheet({ fromHistory: true }));
    if (name === 'nearby' && !askedLocation) { askedLocation = true; byId('locate-me')?.click(); } // first "Cerca de mí": ask for the position
  }

  buttons.forEach((button) => button.addEventListener('click', () => showSheet(button.dataset.mapSheet)));
  byId('map-sheet-close').addEventListener('click', () => closeSheet());
  enableSheetDrag(sheet, { close: () => closeSheet(), regions: [sheet.querySelector('.map-sheet-header')], scroller: sheet.querySelector('.map-sheet-body') });
  doc.addEventListener('keydown', (event) => { if (event.key === 'Escape' && openSheet && doc.getElementById('poi-modal')?.hidden) closeSheet(); });

  // Active filters never grow on the map: the Filtros button turns red with their number and a single pill says
  // how many places are left ("4 de 18 lugares"). The full list is in the sheet, where each filter is a pressed chip.
  const filtersButton = byId('map-filters-button');
  const filtersCount = byId('map-filters-count');
  const shownPill = byId('map-shown-pill');
  const sheetSub = byId('map-sheet-sub');
  const resetButton = byId('map-sheet-reset');
  const footer = byId('map-sheet-footer');
  const applyButton = byId('map-sheet-apply');
  let lastState = { visited: { done: 0, total: 0 }, filters: [], shown: 0, total: 0 };
  function paintSheetChrome() {
    const { visited, filters, shown, total } = lastState;
    const onFilters = openSheet === 'filters';
    sheetSub.textContent = onFilters
      ? `${shownLabel(shown, total, filters.length)}${visited.total ? ` · ${visited.done}/${visited.total} visitados` : ''}`
      : openSheet === 'city' ? 'Cambia la ciudad del mapa y de la guía' : '';
    sheetSub.hidden = !sheetSub.textContent;
    resetButton.hidden = !(onFilters && filters.length);
    footer.hidden = !onFilters;
    applyButton.textContent = `Ver ${shown} ${shown === 1 ? 'lugar' : 'lugares'}`;
  }
  function paintState() {
    const { filters, shown, total } = lastState;
    const count = filters.length;
    filtersButton.classList.toggle('is-filtered', count > 0);
    filtersButton.setAttribute('aria-label', filtersButtonLabel(count));
    filtersCount.textContent = String(count);
    filtersCount.hidden = !count;
    shownPill.hidden = !count;
    shownPill.textContent = shownLabel(shown, total, count);
    paintSheetChrome();
  }
  resetButton.addEventListener('click', () => map.clearFilters());
  applyButton.addEventListener('click', () => closeSheet());

  // The cloud mirrors the state of «Guardar mapa» (none, saving, partial, error, complete).
  const offlineButton = byId('map-offline-button');
  const saveButton = byId('save-offline-map');
  const paintOffline = () => {
    const state = saveButton?.dataset.state || 'none';
    offlineButton.dataset.state = state;
    offlineButton.setAttribute('aria-label', OFFLINE_LABELS[state] ?? OFFLINE_LABELS.none);
  };
  if (saveButton && typeof MutationObserver === 'function') new MutationObserver(paintOffline).observe(saveButton, { attributes: true, attributeFilter: ['data-state'] });
  paintOffline();
  const routeButton = byId('map-route-button');
  const paintRouteButton = () => {
    const { route } = lastState;
    routeButton.hidden = !route?.available;
    routeButton.setAttribute('aria-pressed', String(Boolean(route?.on)));
  };
  routeButton.addEventListener('click', () => map.setRoute(routeButton.getAttribute('aria-pressed') !== 'true'));
  doc.addEventListener('map:state', (event) => { lastState = event.detail; paintState(); paintRouteButton(); });

  // City switcher: a red chip with the active city opens the «Ciudad» sheet (one card per city). Choosing one changes the
  // active city of the whole app (guide included) without leaving the map; the map flies to it (see main.js).
  const cityChip = byId('map-city-button');
  const cityName = byId('map-city-name');
  const cityLive = byId('map-city-live');
  const cityList = sections.city;
  const searchInput = byId('map-search-input');
  let activeCity = null;
  const nameOf = (id) => cities.find((city) => city.id === id)?.name ?? '';
  function paintCityCards() {
    cityList.replaceChildren(...cities.map((city) => {
      const on = city.id === activeCity;
      return h('button', { type: 'button', class: `map-city-card${on ? ' is-active' : ''}`, 'aria-pressed': String(on), dataset: { city: city.id }, onclick: () => pickCity(city.id) },
        h('span', { class: 'map-city-card-text' }, h('strong', {}, city.name), h('small', {}, cityCardInfo(city))),
        on ? h('span', { class: 'map-city-tick', 'aria-hidden': 'true' }, '✓') : null);
    }));
  }
  function pickCity(id) {
    closeSheet();
    if (id !== activeCity) onCity(id);
  }
  cityChip.hidden = cities.length < 2; // a single city needs no switcher

  // Bottom card for the selected place, with the nearest places as a carousel.
  const card = byId('map-card');
  const cardBody = byId('map-card-body');
  const cardNearby = byId('map-card-nearby');
  const hideCard = () => { card.hidden = true; cardBody.replaceChildren(); cardNearby.replaceChildren(); };
  byId('map-card-close').addEventListener('click', hideCard);
  doc.addEventListener('map:city', hideCard); // a card of the previous city must not stay open
  doc.addEventListener('map:select', (event) => {
    if (!inside) return;
    const { point, content, nearby } = event.detail;
    if (openSheet) closeSheet();
    cardBody.replaceChildren(content);
    cardNearby.replaceChildren(...nearby.map((item) => h('button', { type: 'button', class: 'map-near-chip', onclick: () => map.select(item.point.id) },
      h('strong', {}, item.point.name), h('span', {}, item.label))));
    card.hidden = false;
    card.scrollTop = 0;
  });

  function enter() {
    if (inside) return;
    inside = true;
    moves.forEach(({ home, target }) => target.appendChild(home.node));
    filtersWereOpen = filtersDetails.open;
    filtersDetails.open = true;
    legendWasOpen = legendDetails.open;
    legendDetails.open = false; // folded under the filters; the day chips already show each day's colour
    map.placeControls?.(true);
    paintState();
    paintOffline();
    map.refit();
  }

  function leave() {
    if (!inside) return;
    closeSheet();
    hideCard();
    doc.dispatchEvent(new CustomEvent('map:leave')); // the search is cleared: the guide's map must not stay faded
    inside = false;
    [...moves].reverse().forEach(({ home }) => restoreHome(home));
    map.placeControls?.(false);
    filtersDetails.open = filtersWereOpen;
    legendDetails.open = legendWasOpen;
    map.refresh();
  }

  return {
    /** Called whenever the active view changes (and once at start). */
    hideCard() { hideCard(); },
    /** Shows `cityId` on the chip and in the sheet; `announce` also tells screen readers ("Mapa de Kioto"). */
    setCity(cityId, { announce = false } = {}) {
      activeCity = cityId;
      const name = nameOf(cityId);
      cityName.textContent = name;
      cityChip.setAttribute('aria-label', cityChipLabel(name));
      if (searchInput) searchInput.placeholder = name ? `Buscar en ${name}…` : 'Buscar en el mapa…';
      paintCityCards();
      if (announce && name) cityLive.textContent = `Mapa de ${name}`;
    },
    /** While another city loads, the chip shows it is busy. */
    setBusy(busy) { cityChip.classList.toggle('is-loading', Boolean(busy)); cityChip.setAttribute('aria-busy', String(Boolean(busy))); },
    sync(activeView) { if (activeView === 'mapa') enter(); else leave(); },
    isOpen: () => inside
  };
}
