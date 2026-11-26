// Full-screen map view ("Mapa" in the bottom bar, ?view=mapa).
// There is only one Leaflet map. Entering the view MOVES the map element and its panels (filters, nearby places,
// offline button) into this view; leaving puts every node back exactly where it was in the guide, so the map in the
// guide section keeps working as before. Filters, "Cerca de mí" and "Guardar mapa" live in one bottom sheet.
import { byId } from './dom.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';

export const SHEETS = {
  filters: 'Filtros del mapa',
  nearby: 'Cerca de mí',
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
  const moves = [
    { home: rememberHome(mapElement), target: canvas },
    ...['map-filters', 'map-filter-status'].map((id) => ({ home: rememberHome(byId(id)), target: sections.filters })),
    { home: rememberHome(doc.querySelector('.map-legend')), target: sections.filters },
    { home: rememberHome(doc.querySelector('.nearby-panel')), target: sections.nearby },
    ...(offlineBlock ? [{ home: rememberHome(offlineBlock), target: sections.offline }] : [])
  ];
  const filtersDetails = byId('map-filters');

  let inside = false;
  let openSheet = null;
  let askedLocation = false;
  let filtersWereOpen = false;

  function closeSheet({ fromHistory = false } = {}) {
    if (!openSheet) return;
    openSheet = null;
    sheet.hidden = true;
    buttons.forEach((button) => { button.setAttribute('aria-expanded', 'false'); button.classList.remove('is-active'); });
    if (!fromHistory) releaseOverlay('map-sheet');
  }

  function showSheet(name) {
    if (openSheet === name) { closeSheet(); return; }
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

  function enter() {
    if (inside) return;
    inside = true;
    moves.forEach(({ home, target }) => target.appendChild(home.node));
    filtersWereOpen = filtersDetails.open;
    filtersDetails.open = true;
    byId('map-view-title').textContent = `Mapa de ${doc.getElementById('hero-title')?.textContent || 'la ciudad'}`;
    map.refit();
  }

  function leave() {
    if (!inside) return;
    closeSheet();
    inside = false;
    [...moves].reverse().forEach(({ home }) => restoreHome(home));
    filtersDetails.open = filtersWereOpen;
    map.refresh();
  }

  return {
    /** Called whenever the active view changes (and once at start). */
    sync(activeView) { if (activeView === 'mapa') enter(); else leave(); },
    isOpen: () => inside
  };
}
