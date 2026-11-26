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

const status = byId('app-status');
const showStatus = (message, isError = false) => {
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
};

async function start() {
  const [journey, global] = await Promise.all([loadJourney(), loadGlobalContent()]);
  const cities = enabledCities(journey);
  const details = initDetails();
  const map = initMap({ openDetail: (localId) => details.open(localId) });
  const tabs = initTabs(cities, (cityId) => navigate(cityId));

  let activeCityId = null;
  let requestToken = 0;

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
      showStatus('');
    } catch (error) {
      if (token !== requestToken) return;
      console.error(`Failed to show city "${cityId}":`, error);
      showStatus('No se han podido cargar los datos de esta ciudad. Comprueba la conexión y vuelve a cargar la página.', true);
    }
  }

  function navigate(cityId) {
    if (cityId === resolveActiveCity(journey, requestedCityFromSearch(window.location.search)).cityId) return;
    const url = new URL(window.location.href);
    url.searchParams.set(CITY_QUERY_PARAM, cityId);
    url.hash = '';
    history.pushState({ cityId }, '', url);
    showCity(cityId).then(() => window.scrollTo({ top: 0 }));
  }

  function cityFromLocation() {
    const { cityId, problem } = resolveActiveCity(journey, requestedCityFromSearch(window.location.search));
    if (problem) console.warn(`[journey] ${problem}`);
    return cityId;
  }

  window.addEventListener('popstate', () => showCity(cityFromLocation()));
  await showCity(cityFromLocation());
  // Honour an in-page anchor (for example #mapa) once the content exists.
  if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
}

start().catch((error) => {
  console.error('Failed to start the guide:', error);
  showStatus('No se ha podido cargar la guía. Comprueba la conexión y vuelve a cargar la página.', true);
});
