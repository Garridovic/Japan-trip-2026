// Full-screen map view ("Mapa" in the bottom bar, ?view=mapa).
// There is only one Leaflet map. Entering the view MOVES the map element and its panels (filters, nearby places,
// offline button) into this view; leaving puts every node back exactly where it was in the guide, so the map in the
// guide section keeps working as before. Filters, "Cerca de mí" and "Guardar mapa" live in one bottom sheet.
import { byId, h } from './dom.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';

export const SHEETS = {
  filters: 'Filtros del mapa',
  nearby: 'Cerca de mí',
  legend: 'Leyenda del mapa',
  offline: 'Mapa sin conexión'
};

/** Remembers where a node lives so it can be put back (before the next sibling, or at the end of its parent). */
export function rememberHome(node) {
  return { node, parent: node.parentNode, next: node.nextSibling };
}
export function restoreHome({ node, parent, next }) {
  if (next && next.parentNode === parent) parent.insertBefore(node, next);
  else parent.appendChild(node);
}

export function initMapView({ map, doc = document }) {
  const view = doc.getElementById('view-mapa');
  if (!view) return { sync() {}, isOpen: () => false };
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
    { home: rememberHome(legendDetails), target: sections.legend },
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
    buttons.forEach((button) => { button.setAttribute('aria-expanded', 'false'); button.classList.remove('is-active'); });
    if (!fromHistory) releaseOverlay('map-sheet');
  }

  function showSheet(name) {
    if (openSheet === name) { closeSheet(); return; }
    hideCard();
    const wasOpen = Boolean(openSheet);
    openSheet = name;
    sheetTitle.textContent = SHEETS[name];
    Object.entries(sections).forEach(([key, section]) => { section.hidden = key !== name; });
    buttons.forEach((button) => {
      const active = button.dataset.mapSheet === name;
      button.setAttribute('aria-expanded', String(active));
      button.classList.toggle('is-active', active);
    });
    sheet.hidden = false;
    if (!wasOpen) openOverlay('map-sheet', () => closeSheet({ fromHistory: true }));
    if (name === 'nearby' && !askedLocation) { askedLocation = true; byId('locate-me')?.click(); } // first "Cerca de mí": ask for the position
  }

  buttons.forEach((button) => button.addEventListener('click', () => showSheet(button.dataset.mapSheet)));
  byId('map-sheet-close').addEventListener('click', () => closeSheet());
  doc.addEventListener('keydown', (event) => { if (event.key === 'Escape' && openSheet && doc.getElementById('poi-modal')?.hidden) closeSheet(); });

  // Active filters as chips over the map ("13 dic ✕"), the count on the Filtros button and the visited counter in the title.
  const chips = byId('map-active-filters');
  const filtersButton = byId('map-filters-button');
  let cityName = 'la ciudad';
  let lastState = { visited: { done: 0, total: 0 }, filters: [] };
  function paintState() {
    const { visited, filters } = lastState;
    filtersButton.textContent = filters.length ? `Filtros (${filters.length})` : 'Filtros';
    chips.replaceChildren(...filters.map(({ key, label }) => h('button', { type: 'button', class: 'map-chip', 'aria-label': `Quitar filtro ${label}`, onclick: () => map.clearFilter(key) }, `${label} ✕`)));
    byId('map-view-title').textContent = `Mapa de ${cityName}${visited.total ? ` · ${visited.done}/${visited.total}` : ''}`;
  }
  const routeButton = byId('map-route-button');
  const paintRouteButton = () => {
    const { route } = lastState;
    routeButton.hidden = !route?.available;
    routeButton.setAttribute('aria-pressed', String(Boolean(route?.on)));
  };
  routeButton.addEventListener('click', () => map.setRoute(routeButton.getAttribute('aria-pressed') !== 'true'));
  doc.addEventListener('map:state', (event) => { lastState = event.detail; paintState(); paintRouteButton(); });

  // Bottom card for the selected place, with the nearest places as a carousel.
  const card = byId('map-card');
  const cardBody = byId('map-card-body');
  const cardNearby = byId('map-card-nearby');
  const hideCard = () => { card.hidden = true; cardBody.replaceChildren(); cardNearby.replaceChildren(); };
  byId('map-card-close').addEventListener('click', hideCard);
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
    legendDetails.open = true;
    cityName = doc.getElementById('hero-title')?.textContent || 'la ciudad';
    paintState();
    map.refit();
  }

  function leave() {
    if (!inside) return;
    closeSheet();
    hideCard();
    inside = false;
    [...moves].reverse().forEach(({ home }) => restoreHome(home));
    filtersDetails.open = filtersWereOpen;
    legendDetails.open = legendWasOpen;
    map.refresh();
  }

  return {
    /** Called whenever the active view changes (and once at start). */
    hideCard() { hideCard(); },
    sync(activeView) { if (activeView === 'mapa') enter(); else leave(); },
    isOpen: () => inside
  };
}
