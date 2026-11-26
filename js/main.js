// Application entry point: one app, one journey, one active city at a time.
import './modules/version.js';
import { byId } from './modules/dom.js';
import { loadJourney, loadGlobalContent, loadCity } from './modules/data.js';
import { enabledCities, resolveActiveCity, requestedCityFromSearch, CITY_QUERY_PARAM } from './modules/journey.js';
import { indexCity } from './modules/city-index.js';
import { initTabs } from './modules/tabs.js';
import { renderCity } from './modules/render.js';
import { initDetails } from './modules/details.js';
import { initMap } from './modules/map.js';
import { initScrollSpy } from './modules/scrollspy.js';
import { initPhrases } from './modules/phrases-ui.js';
import { VIEW_QUERY_PARAM, viewFromSearch, withView, initViews } from './modules/views.js';
import { initOverlayHistory, popstateWasOverlay, whenOverlaySettled } from './modules/overlay-history.js';
import { initCollapsibles } from './modules/collapsible.js';
import { initOffline } from './modules/offline.js';
import { initLodging } from './modules/lodging-ui.js';
import { initDayLinks, openDay } from './modules/anchors.js';
import { initDishes } from './modules/dishes-ui.js';
import { initTheme } from './modules/theme.js';
import { initMapView } from './modules/map-view.js';

const status = byId('app-status');
const showStatus = (message, isError = false) => {
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
};

initOverlayHistory(); // registered first so overlays handle Back before navigation does

initCollapsibles();
initDayLinks();
initOffline();
initTheme();

async function start() {
  const [journey, global] = await Promise.all([loadJourney(), loadGlobalContent()]);
  const cities = enabledCities(journey);
  const details = initDetails();
  const map = initMap({ openDetail: (localId) => details.open(localId) });
  initLodging(global.lodging);
  initDishes(global.dishes, global.dishCredits);
  initPhrases(global.phrases); // global content: rendered once, shared by every city
  const mapView = initMapView({ map });
  const scrollSpy = initScrollSpy();
  const tabs = initTabs(cities, (cityId) => navigate(cityId));

  let activeView = viewFromSearch(window.location.search);
  if (new URLSearchParams(window.location.search).has(VIEW_QUERY_PARAM) && withView(window.location.href, activeView).search !== window.location.search) {
    history.replaceState(history.state, '', withView(window.location.href, activeView)); // drop an invalid ?view=
  }
  const scrollByView = new Map();
  const views = initViews((view) => navigateView(view));
  let activeCityId = null;
  let requestToken = 0;

  function applyView(view) {
    scrollByView.set(activeView, window.scrollY);
    activeView = view;
    views.setActive(view);
    mapView.sync(view);
    if (view === 'guia') { map.refresh(); scrollSpy.refresh(); }
    window.scrollTo({ top: scrollByView.get(view) ?? 0, behavior: 'instant' });
  }

  async function navigateView(view) {
    await whenOverlaySettled();
    if (view === activeView) { window.scrollTo({ top: 0 }); return; }
    const next = withView(window.location.href, view);
    next.hash = ''; // a section anchor of the previous view means nothing here
    history.pushState({ view }, '', next);
    applyView(view);
  }

  async function showCity(cityId) {
    const token = ++requestToken;
    tabs.setActive(cityId);
    if (cityId === activeCityId) { showStatus(''); return; }
    showStatus('Cargando la guía…');
    try {
      const bundle = await loadCity(cityId);
      if (token !== requestToken) return; // a newer tab selection superseded this one
      const index = indexCity(cityId, bundle);
      renderCity({ journey, cityEntry: cities.find((city) => city.id === cityId), bundle, global });
      details.setCity({ ...index, events: bundle.events });
      map.setCity(index, bundle.city.map);
      activeCityId = cityId;
      scrollSpy.refresh();
      showStatus('');
    } catch (error) {
      if (token !== requestToken) return;
      console.error(`Failed to show city "${cityId}":`, error);
      showStatus('No se han podido cargar los datos de esta ciudad. Comprueba la conexión y vuelve a cargar la página.', true);
    }
  }

  async function navigate(cityId) {
    await whenOverlaySettled();
    if (cityId === resolveActiveCity(journey, requestedCityFromSearch(window.location.search)).cityId) return;
    const url = new URL(window.location.href);
    url.searchParams.set(CITY_QUERY_PARAM, cityId);
    url.searchParams.delete(VIEW_QUERY_PARAM); // city tabs live in the guide
    url.hash = '';
    history.pushState({ cityId }, '', url);
    applyView('guia');
    showCity(cityId).then(() => window.scrollTo({ top: 0 }));
  }

  function cityFromLocation() {
    const { cityId, problem } = resolveActiveCity(journey, requestedCityFromSearch(window.location.search));
    if (problem) console.warn(`[journey] ${problem}`);
    return cityId;
  }

  window.addEventListener('popstate', () => {
    if (popstateWasOverlay()) return;
    // A change of #anchor on the same page is not navigation: leave the scroll position to the browser.
    if (viewFromSearch(window.location.search) === activeView && cityFromLocation() === activeCityId) return;
    applyView(viewFromSearch(window.location.search)); showCity(cityFromLocation());
  });
  views.setActive(activeView);
  await showCity(cityFromLocation());
  mapView.sync(activeView); // opened directly on ?view=mapa
  // Honour an in-page anchor (for example #mapa) once the content exists.
  if (activeView === 'guia' && window.location.hash) {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) openDay(target, { smooth: false });
  }
}

start().catch((error) => {
  console.error('Failed to start the guide:', error);
  showStatus('No se ha podido cargar la guía. Comprueba la conexión y vuelve a cargar la página.', true);
});
