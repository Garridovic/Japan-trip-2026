// Application entry point: one app, one journey, one active city at a time.
import './modules/version.js';
import { byId } from './modules/dom.js';
import { loadJourney, loadGlobalContent, loadCity } from './modules/data.js';
import { enabledCities, resolveActiveCity, staysOf, pickStayIndex, requestedCityFromSearch, CITY_QUERY_PARAM } from './modules/journey.js';
import { indexCity } from './modules/city-index.js';
import { initTabs } from './modules/tabs.js';
import { renderCity, resetHero } from './modules/render.js';
import { initDetails } from './modules/details.js';
import { initMap } from './modules/map.js';
import { initGuideTabs, tabFromSearch, tabForHash, rememberedTab, withTab } from './modules/guide-tabs.js';
import { initPhrases } from './modules/phrases-ui.js';
import { VIEW_QUERY_PARAM, viewFromSearch, withView, initViews } from './modules/views.js';
import { initOverlayHistory, popstateWasOverlay, whenOverlaySettled } from './modules/overlay-history.js';
import { initCollapsibles, initFilterSheets } from './modules/collapsible.js';
import { initOffline } from './modules/offline.js';
import { initLodging } from './modules/lodging-ui.js';
import { initTips } from './modules/tips-ui.js';
import { initTaxi } from './modules/taxi-ui.js';
import { initChecklist } from './modules/checklist-ui.js';
import { userData } from './modules/user-data.js';
import { toast, haptic } from './modules/feedback.js';
import { initSearch } from './modules/search-ui.js';
import { visitedStore } from './modules/visited.js';
import { initDayLinks, openDay, setBeforeOpenDay } from './modules/anchors.js';
import { initDishes } from './modules/dishes-ui.js';
import { initTheme } from './modules/theme.js';
import { initMapView } from './modules/map-view.js';
import { initMapSearch } from './modules/map-search-ui.js';
import { initUpdates } from './modules/updates.js';
import { initToday } from './modules/today.js';
import { initHero } from './modules/hero-ui.js';
import { initProgress } from './modules/progress-ui.js';
import { initWeather } from './modules/weather-ui.js';
import { createProximity } from './modules/proximity-ui.js';
import { localISO } from './modules/trip-status.js';
import { initStamps } from './modules/stamps-ui.js';

const status = byId('app-status');
const skeleton = byId('app-skeleton');
const showStatus = (message, isError = false) => {
  if (skeleton) skeleton.hidden = message !== 'Cargando la guía…';
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
};

userData(); // creates window.japanTripUserData right away so an account-sync module can connect before start() loads
initOverlayHistory(); // registered first so overlays handle Back before navigation does

initCollapsibles();
initFilterSheets();
initDayLinks();
initOffline();
initTheme();
initUpdates();

/** Optional account (Auth0). Loaded lazily so that a failure there can never stop the guide from starting. */
async function startAccount(proximity) {
  try {
    const { AUTH_CONFIG } = await import('../assets/auth-config.js');
    if (!AUTH_CONFIG.enabled) return null;
    const { initAccount } = await import('./modules/account.js');
    return await initAccount({ config: AUTH_CONFIG, userData: userData(), proximity });
  } catch (error) { console.warn('[account] disabled:', error); return null; }
}

async function start() {
  const [journey, global] = await Promise.all([loadJourney(), loadGlobalContent()]);
  await userData().load(); // with a sync backend connected (see user-data.js) the stored values are in place before any store reads them
  const cities = enabledCities(journey);
  const proximity = createProximity({ journey }); // optional "¿Estás en…?" card; off until the user accepts the consent sheet
  const account = await startAccount(proximity); // optional Google sign-in; null (and invisible) while disabled or unavailable
  const visitedMarks = visitedStore();
  visitedMarks.subscribe(({ cityId, id, visited: now }) => {
    haptic(now ? 16 : 8);
    toast(now ? '✓ Marcado como visitado' : 'Marca quitada', { actionLabel: 'Deshacer', onAction: () => visitedMarks.set(cityId, id, !now) });
  });
  const details = initDetails();
  const map = initMap({ openDetail: (localId) => details.open(localId) });
  const stamps = initStamps(cities, { // stamp book; "Ver en el mapa" opens the map with only the places that have a real stamp
    openMap: async () => { await navigateViewRef('mapa'); map.setFilters({ only: ['sellos'] }); }
  });
  initChecklist(global.checklist);
  initTaxi(global.lodging?.stays); // the taxi screen opens from any button with data-taxi
  initLodging(global.lodging);
  const tips = initTips(global.tips?.practical, cities); // city tips.json files are fetched the first time Viaje opens
  initDishes(global.dishes, global.dishCredits);
  initPhrases(global.phrases); // global content: rendered once, shared by every city
  const mapView = initMapView({ map });
  initMapSearch({ map });
  let navigateViewRef = async () => {};
  const jumpToSearch = async (view, inputId, text) => {
    await navigateViewRef(view);
    const field = byId(inputId);
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.scrollIntoView({ block: 'center' });
  };
  const search = initSearch({
    phrases: global.phrases?.phrases ?? [],
    dishes: global.dishes?.dishes ?? [],
    handlers: {
      place: async ({ id }) => { await whenOverlaySettled(); details.open(id); },
      restaurant: async ({ id }) => {
        await navigateViewRef('guia');
        guideTabs.select('comer');
        const card = document.querySelector(`.food-card[data-food-id="${CSS.escape(id)}"]`);
        if (!card) return;
        card.hidden = false;
        card.scrollIntoView({ block: 'center' });
        card.classList.add('is-found');
        setTimeout(() => card.classList.remove('is-found'), 2500);
      },
      extra: async ({ id }) => {
        await navigateViewRef('guia');
        guideTabs.select('alternativas');
        const card = [...document.querySelectorAll('.extra-card h3')].find((node) => node.textContent === id)?.closest('.extra-card');
        card?.scrollIntoView({ block: 'center' });
        card?.classList.add('is-found');
        setTimeout(() => card?.classList.remove('is-found'), 2500);
      },
      phrase: ({ id }) => jumpToSearch('frases', 'phrases-search', global.phrases.phrases.find((p) => p.id === id)?.es ?? ''),
      dish: ({ id }) => jumpToSearch('platos', 'dishes-search', global.dishes.dishes.find((d) => d.id === id)?.es ?? '')
    }
  });
  const hero = initHero();
  const progress = initProgress({ cities, global });
  const weather = initWeather();
  const today = initToday();
  // Section tabs of the guide: one section at a time. The map is created while its tab may be hidden, so it is
  // fitted again the first time the Mapa tab is shown after a city change.
  let mapNeedsFit = false;
  const guideTabs = initGuideTabs({
    onChange: (tab) => {
      if (tab !== 'mapa') return;
      if (mapNeedsFit) { mapNeedsFit = false; map.refit(); } else map.refresh();
    }
  });
  setBeforeOpenDay(() => guideTabs.select('detalle'));
  const tabs = initTabs(cities, (cityId) => navigate(cityId));

  let onboarding = null; // coach marks (lazy, optional)
  let activeView = viewFromSearch(window.location.search);
  if (new URLSearchParams(window.location.search).has(VIEW_QUERY_PARAM) && withView(window.location.href, activeView).search !== window.location.search) {
    history.replaceState(history.state, '', withView(window.location.href, activeView)); // drop an invalid ?view=
  }
  const scrollByView = new Map();
  const views = initViews((view) => navigateView(view));
  const stayByCity = new Map(); // the stay chosen by hand for a city visited twice (Tokio)
  let activeCityId = null;
  let requestToken = 0;

  function applyView(view) {
    scrollByView.set(activeView, window.scrollY);
    activeView = view;
    views.setActive(view);
    mapView.sync(view);
    if (view === 'mapa' && mapNeedsFit) { mapNeedsFit = false; map.refit(); } // the map was built while its guide tab was hidden
    if (view === 'viaje') { tips.show(); stamps.show(); }
    if (view === 'guia') { map.refresh(); guideTabs.refresh(); }
    window.scrollTo({ top: scrollByView.get(view) ?? 0, behavior: 'instant' });
    onboarding?.onView(view);
  }

  navigateViewRef = (view) => navigateView(view);
  async function navigateView(view) {
    await whenOverlaySettled();
    if (view === activeView) { window.scrollTo({ top: 0 }); return; }
    const next = withView(window.location.href, view);
    next.hash = ''; // a section anchor of the previous view means nothing here
    next.searchParams.delete('tab'); // nor does the guide tab (it is remembered on this device)
    history.pushState({ view }, '', next);
    applyView(view);
  }

  async function showCity(cityId) {
    const token = ++requestToken;
    tabs.setActive(cityId);
    if (cityId === activeCityId) { showStatus(''); return; }
    showStatus('Cargando la guía…');
    resetHero();
    weather.clear();
    try {
      const bundle = await loadCity(cityId, cities.find((city) => city.id === cityId));
      if (token !== requestToken) return; // a newer tab selection superseded this one
      const index = indexCity(cityId, bundle);
      const entry = cities.find((city) => city.id === cityId);
      const stays = staysOf(entry);
      const stayIndex = stayByCity.get(cityId) ?? pickStayIndex(stays, localISO(new Date()));
      const whereOf = () => ({ id: cityId, name: entry.name, lat: bundle.city.map.center[0], lng: bundle.city.map.center[1] });
      const onStay = (next) => {
        stayByCity.set(cityId, next);
        renderCity({ journey, cityEntry: entry, bundle, global, stay: stays[next], stays, stayIndex: next, onStay });
        weather.show(whereOf(), stays[next]);
      };
      renderCity({ journey, cityEntry: entry, bundle, global, stay: stays[stayIndex], stays, stayIndex, onStay });
      details.setCity({ ...index, events: bundle.events });
      guideTabs.resetCity();
      map.setCity(index, bundle.city.map);
      mapNeedsFit = guideTabs.active() !== 'mapa';
      search.setCity({ places: bundle.places, restaurants: bundle.restaurants, extras: bundle.extras?.items ?? [] });
      weather.show(whereOf(), stays[stayIndex]);
      progress.show({ cityId, days: bundle.itinerary.days, places: bundle.places });
      today.show({ days: bundle.itinerary.days, cityName: cities.find((city) => city.id === cityId).name, queryContext: bundle.city.map.queryContext });
      hero.reset(); // opens on "Ahora" during the trip, otherwise on "Tu viaje"
      activeCityId = cityId;
      guideTabs.refresh();
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

  // An old link such as #comer or #dia12 followed while the guide is open: show its tab (the day opens through anchors.js).
  window.addEventListener('hashchange', () => {
    if (activeView !== 'guia') return;
    const tab = tabForHash(window.location.hash);
    if (!tab) return;
    const target = /^#dia/.test(window.location.hash) ? document.getElementById(window.location.hash.slice(1)) : null; // read before select() rewrites the URL
    guideTabs.select(tab, { source: 'code' });
    if (target) openDay(target, { smooth: false });
  });

  window.addEventListener('popstate', () => {
    if (popstateWasOverlay()) return;
    // A change of #anchor on the same page is not navigation: leave the scroll position to the browser.
    const tabInUrl = tabFromSearch(window.location.search);
    if (tabInUrl) guideTabs.select(tabInUrl, { source: 'history' });
    if (viewFromSearch(window.location.search) === activeView && cityFromLocation() === activeCityId) return;
    applyView(viewFromSearch(window.location.search)); showCity(cityFromLocation());
  });
  views.setActive(activeView);
  // First tab: ?tab= in the URL, else an old #anchor (#comer, #dia12), else the last one used on this device.
  const firstTab = tabFromSearch(window.location.search) ?? tabForHash(window.location.hash) ?? rememberedTab() ?? 'resumen';
  await showCity(cityFromLocation());
  guideTabs.select(firstTab, { source: 'init' });
  if (!tabFromSearch(window.location.search) && tabForHash(window.location.hash) && !/^#dia/.test(window.location.hash)) {
    history.replaceState(history.state, '', withTab(window.location.href, guideTabs.active())); // #comer → ?tab=comer
  }
  mapView.sync(activeView); // opened directly on ?view=mapa
  if (activeView === 'mapa' && mapNeedsFit) { mapNeedsFit = false; map.refit(); }
  if (activeView === 'viaje') { tips.show(); stamps.show(); }
  // Honour an old link to a day (#dia12) once the content exists: «Día a día» with that day open.
  if (activeView === 'guia' && window.location.hash) {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) openDay(target, { smooth: false });
  }
  proximity.start();
  account?.markStarted();
  import('./modules/notices.js').then(({ initNotices }) => initNotices()).catch((error) => console.warn('[notices] disabled:', error)); // best effort: never blocks the guide
  import('./modules/onboarding.js').then(({ initOnboarding }) => {
    const tripStart = cities.map((city) => city.arrivalDate).filter(Boolean).sort()[0] ?? '';
    onboarding = initOnboarding({ tripStart, toast, navigate: (view) => navigateViewRef(view) });
    onboarding?.onView(activeView);
  }).catch((error) => console.warn('[onboarding] disabled:', error)); // best effort: never blocks the guide
}

start().catch((error) => {
  console.error('Failed to start the guide:', error);
  showStatus('No se ha podido cargar la guía. Comprueba la conexión y vuelve a cargar la página.', true);
});
