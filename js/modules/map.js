// Interactive map, marker filters, nearby places and geolocation.
// One Leaflet map is created once; setCity() swaps in the data of the active city.
import { taxiButton } from './taxi-ui.js';
import { byId, h, externalLink, setPressed } from './dom.js';
import { cityKey } from './ids.js';
import { TILE_URL, planCityTiles } from './tiles.js';
import { initMapOffline } from './map-offline.js';
import { visitedStore, isVisitable, countVisited } from './visited.js';
import { distanceKm, formatDistance, formatFarDistance, distanceIfFarFromCity } from './geo.js';
import { buildMapIndex, searchPoints } from './map-search.js';
import { emptyFilters, toggleValue, matchesFilters, singleRouteDay, activeFilterList, describeFilters } from './map-filters.js';

const HOTEL_COLOR = '#273d70';
const SEARCH_COLOR = '#B03020'; // the app's red: chosen / tappable
const FALLBACK_COLOR = '#64748b';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export function initMap({ openDetail }) {
  const mapElement = byId('city-map');
  const map = L.map(mapElement, { scrollWheelZoom: false });
  // crossOrigin lets the service worker keep the tiles you have seen, so the map still has a background offline.
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION, crossOrigin: 'anonymous' }).addTo(map);
  const markerLayer = L.featureGroup().addTo(map);
  const userLocationLayer = L.layerGroup().addTo(map);

  const visited = visitedStore();
  const inMapView = () => document.body.dataset.view === 'mapa';
  const routeLayer = L.layerGroup().addTo(map);
  let routeOn = false;
  const visitButtons = new Map(); // point id -> popup button, repainted when the mark changes

  // Active city state
  let cityId = null;
  let config = null;
  let points = [];
  let markerByKey = new Map();
  // Map search: matches stay bright, the rest of the visible points fade (see map-search.js)
  let searchHits = null; // Set of point ids, or null when no search is active
  let searchIndex = null;
  let filters = emptyFilters(); // several days, kinds and "solo" switches at once (see map-filters.js)

  // GPS state (the user's position belongs to the device, not to a city)
  let userLatLng = null;
  let currentAccuracy = null;
  let watchId = null;
  let followMap = false;

  const nearbyStatus = byId('nearby-status');
  const nearbyList = byId('nearby-list');
  const locateButton = byId('locate-me');
  const followButton = byId('follow-me');
  const mapFilterStatus = byId('map-filter-status');
  const kindButtons = [...document.querySelectorAll('.map-kind-filter')];
  const onlyButtons = [...document.querySelectorAll('.map-only-filter')];

  const hasAlternatives = () => points.some((point) => point.day === 'extra');
  const dayLabel = (value) => (value === 'extra' ? 'Alternativas' : config?.dayFilters.find((item) => item.value === value)?.label ?? value);

  function markerColorForPoint(point) {
    if (point.type === 'hotel') return HOTEL_COLOR;
    if (point.day === 'extra') {
      const categories = config.alternativeCategories;
      return (categories.find((item) => item.id === point.altCategory) ?? categories[categories.length - 1])?.color ?? FALLBACK_COLOR;
    }
    const primaryDay = String(point.day).split(',')[0];
    return config.dayFilters.find((item) => item.value === primaryDay)?.color ?? FALLBACK_COLOR;
  }

  const googleSearchUrl = (point) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.query}, ${config.queryContext}`)}`;
  const googleDirectionsUrl = (point) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.query}, ${config.queryContext}`)}&travelmode=transit`;

  function paintVisitButton(button, point) {
    const done = visited.has(cityId, point.id);
    button.setAttribute('aria-pressed', String(done));
    button.textContent = done ? '✓ Visitado · quitar marca' : 'Marcar como visitado';
  }
  function buildVisitButton(point) {
    const button = h('button', { type: 'button', class: 'popup-visit-button', onclick: () => visited.toggle(cityId, point.id) });
    visitButtons.set(point.id, button);
    paintVisitButton(button, point);
    return button;
  }

  function buildPopup(point) {
    const isRestaurant = point.type === 'restaurant';
    return h('div', {},
      h('div', { class: 'popup-title' }, point.name),
      h('div', { class: 'popup-meta' }, point.desc),
      isRestaurant && h('div', { class: 'popup-meta' }, 'Marcador orientativo. Abre Google Maps para confirmar la entrada exacta y navegar.'),
      isVisitable(point) && buildVisitButton(point),
      point.type === 'hotel' && taxiButton({ name: point.name, city: config.queryContext?.split(',')[0], className: 'popup-visit-button taxi-button' }),
      h('div', { class: 'popup-links' },
        !isRestaurant && h('button', { type: 'button', class: 'popup-detail-button', onclick: () => openDetail(point.id) }, 'Ver ficha del lugar'),
        externalLink(googleSearchUrl(point), 'Ver ficha en Google Maps ↗'),
        externalLink(googleDirectionsUrl(point), 'Cómo llegar ↗')
      )
    );
  }

  const restaurantIcon = (color, done) => L.divIcon({
    className: `restaurant-map-marker${done ? ' is-visited' : ''}`,
    html: `<span style="--marker-color:${color}" aria-hidden="true"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  function buildMarker(point) {
    const color = markerColorForPoint(point);
    const marker = point.type === 'restaurant'
      ? L.marker([point.lat, point.lng], {
        icon: restaurantIcon(color, visited.has(cityId, point.id)),
        zIndexOffset: 250
      })
      : L.circleMarker([point.lat, point.lng], {
        radius: point.type === 'hotel' ? 9 : point.type === 'event' ? 8 : 7,
        color: '#fff', weight: point.type === 'hotel' ? 3 : 2, fillColor: color, fillOpacity: 0.95
      });
    // Keep popups clear of the zoom buttons (top left): they used to cover the popup text.
    marker.bindPopup(buildPopup(point), { maxWidth: 200, autoPanPaddingTopLeft: [72, 24], autoPanPaddingBottomRight: [24, 24] });
    // In the full-screen map the place goes to the bottom card instead of a popup.
    marker.on('popupopen', () => { if (inMapView()) { marker.closePopup(); selectPoint(point); } });
    marker.bindTooltip(point.name, { direction: 'top', offset: [0, -7] });
    return marker;
  }

  /** Visited places fade out and get a check in their label; pending ones stay as bright as before. */
  function paintMarker(point) {
    const marker = markerByKey.get(cityKey(cityId, point.id));
    if (!marker) return;
    const done = visited.has(cityId, point.id);
    if (point.type === 'restaurant') marker.setIcon(restaurantIcon(markerColorForPoint(point), done));
    else if (point.type !== 'hotel') marker.setStyle({ fillOpacity: done ? 0.3 : 0.95 });
    marker.setTooltipContent(done ? `✓ ${point.name}` : point.name);
    paintSearchMarker(point);
  }

  /** Search state of a point: 'hit' (matches), 'dim' (visible but does not match) or null (no search). */
  const searchState = (point) => (searchHits ? (searchHits.has(point.id) ? 'hit' : 'dim') : null);
  function paintSearchMarker(point) {
    const marker = markerByKey.get(cityKey(cityId, point.id));
    if (!marker) return;
    const state = searchState(point);
    if (point.type === 'restaurant') {
      const element = marker.getElement?.();
      element?.classList.toggle('is-search-hit', state === 'hit');
      element?.classList.toggle('is-search-dim', state === 'dim');
      marker.setZIndexOffset(state === 'hit' ? 900 : 250);
      return;
    }
    const base = point.type === 'hotel' ? 9 : point.type === 'event' ? 8 : 7;
    const done = visited.has(cityId, point.id);
    const fillOpacity = state === 'dim' ? 0.18 : point.type === 'hotel' ? 0.95 : done ? 0.3 : 0.95;
    marker.setStyle(state === 'hit'
      ? { radius: base + 4, color: SEARCH_COLOR, weight: 4, opacity: 1, fillOpacity: 0.95 }
      : { radius: state === 'dim' ? 4 : base, color: '#fff', weight: state === 'dim' ? 1 : point.type === 'hotel' ? 3 : 2, opacity: state === 'dim' ? 0.35 : 1, fillOpacity });
    if (state === 'hit') marker.bringToFront?.();
  }
  const paintSearch = () => points.forEach(paintSearchMarker);

  /** Results for a query among the points the filters show now (no side effects). hidden = matches the filters leave out. */
  function computeSearch(query) {
    const found = searchIndex ? searchPoints(searchIndex, query) : null;
    if (!found) return { active: false, results: [], shown: filteredPoints().length, hidden: 0 };
    const results = found.filter(isShown);
    return { active: true, results, shown: filteredPoints().length, hidden: found.length - results.length };
  }
  const paintAllMarkers = () => points.forEach(paintMarker);

  const isPending = (point) => isVisitable(point) && !visited.has(cityId, point.id);
  const isShown = (point) => matchesFilters(point, filters, isPending);
  const filteredPoints = () => points.filter(isShown);

  /** Day route: the day's stops joined in order (only when exactly one day is filtered). */
  const routeStops = () => {
    const day = singleRouteDay(filters);
    return day ? points.filter((point) => String(point.day).split(',').includes(day) && point.type !== 'restaurant' && point.type !== 'hotel') : [];
  };
  function paintRoute() {
    routeLayer.clearLayers();
    const stops = routeStops();
    if (!routeOn || stops.length < 2) return;
    const color = markerColorForPoint(stops[0]);
    routeLayer.addLayer(L.polyline(stops.map((stop) => [stop.lat, stop.lng]), { color, weight: 4, opacity: 0.75, dashArray: '2 8', lineCap: 'round' }));
    stops.forEach((stop, i) => routeLayer.addLayer(L.marker([stop.lat, stop.lng], {
      interactive: false, zIndexOffset: 500,
      icon: L.divIcon({ className: 'route-number', html: `<span style="--marker-color:${color}">${i + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] })
    })));
  }
  /** Bottom card of the full-screen map: the place, its actions and the nearest places as a carousel. */
  function selectPoint(point) {
    const nearest = points
      .filter((other) => other.id !== point.id && other.day !== 'extra')
      .map((other) => ({ other, km: distanceKm(point, other) }))
      .sort((a, b) => a.km - b.km).slice(0, 6)
      .map(({ other, km }) => ({ point: other, label: formatDistance(km) }));
    document.dispatchEvent(new CustomEvent('map:select', { detail: { point, content: buildPopup(point), nearby: nearest } }));
  }

  function refreshMapPoints() {
    const visiblePoints = filteredPoints();
    markerLayer.clearLayers();
    visiblePoints.forEach((point) => markerLayer.addLayer(markerByKey.get(cityKey(cityId, point.id))));
    mapFilterStatus.textContent = describeFilters(filters, visiblePoints.length, points.length, dayLabel);
    if (searchHits) {
      const hit = visiblePoints.filter((point) => searchHits.has(point.id));
      if (!hit.length) searchHits = null; // the filters left no match: back to the normal look
    }
    paintSearch();
    const fitPoints = searchHits ? visiblePoints.filter((point) => searchHits.has(point.id)) : visiblePoints;
    if (visiblePoints.length) {
      const bounds = searchHits ? L.latLngBounds(fitPoints.map((point) => [point.lat, point.lng])) : markerLayer.getBounds();
      if (userLatLng) {
        const nearest = Math.min(...fitPoints.map((point) => distanceKm(userLatLng, point)));
        if (nearest < 15) bounds.extend([userLatLng.lat, userLatLng.lng]);
      }
      map.fitBounds(bounds.pad(0.12), searchHits ? { maxZoom: 16 } : {});
    }
    if (userLatLng) renderNearby();
    paintRoute();
    announce();
  }

  const visitedSummary = byId('visited-summary');
  /** Tells the rest of the page (full-screen map chips, counters) what the map is showing. */
  function announce() {
    const count = cityId ? countVisited(visited, cityId, points) : { done: 0, total: 0 };
    if (visitedSummary) {
      visitedSummary.textContent = count.total ? `${count.done} de ${count.total} lugares visitados` : '';
      visitedSummary.dataset.done = String(count.done);
    }
    document.dispatchEvent(new CustomEvent('map:state', { detail: {
      visited: count,
      filters: activeFilterList(filters, dayLabel),
      shown: filteredPoints().length,
      total: points.length,
      search: searchHits ? filteredPoints().filter((point) => searchHits.has(point.id)).length : null,
      route: { available: routeStops().length >= 2, on: routeOn }
    } }));
  }
  visited.subscribe(({ id }) => {
    const point = points.find((item) => item.id === id);
    if (!point) return;
    paintMarker(point);
    const button = visitButtons.get(id);
    if (button) paintVisitButton(button, point);
    if (filters.only.includes('pendientes')) refreshMapPoints(); else announce();
  });

  /** Every filter button shows its own state; "Todos los días" / "Todos los puntos" are on when nothing of theirs is chosen. */
  function paintFilterButtons() {
    setPressed([...document.querySelectorAll('.map-filter')], (button) => (button.dataset.mapFilter === 'todos' ? !filters.days.length : filters.days.includes(button.dataset.mapFilter)));
    setPressed(kindButtons, (button) => (button.dataset.mapKind === 'todos' ? !filters.kinds.length : filters.kinds.includes(button.dataset.mapKind)));
    setPressed(onlyButtons, (button) => filters.only.includes(button.dataset.mapOnly));
  }
  function applyFilters(next) {
    filters = { days: [...next.days], kinds: [...next.kinds], only: [...next.only] };
    paintFilterButtons();
    refreshMapPoints();
  }
  const toggleDay = (value) => applyFilters({ ...filters, days: value === 'todos' ? [] : toggleValue(filters.days, value) });
  kindButtons.forEach((button) => button.addEventListener('click', () => {
    const kind = button.dataset.mapKind;
    applyFilters({ ...filters, kinds: kind === 'todos' ? [] : toggleValue(filters.kinds, kind) });
  }));
  onlyButtons.forEach((button) => button.addEventListener('click', () => applyFilters({ ...filters, only: toggleValue(filters.only, button.dataset.mapOnly) })));

  function renderDayFilters() {
    const days = [
      { value: 'todos', label: 'Todos los días' },
      ...config.dayFilters,
      ...(hasAlternatives() ? [{ value: 'extra', label: 'Alternativas', color: config.alternativeCategories?.[0]?.color }] : [])
    ];
    // The coloured dot is the day's colour on the map, so the day list is also the colour legend.
    byId('map-day-filters').replaceChildren(...days.map(({ value, label, color }) =>
      h('button', {
        class: 'filter map-filter',
        type: 'button',
        'aria-pressed': String(value === 'todos'),
        dataset: { mapFilter: value },
        onclick: () => toggleDay(value)
      }, color && h('span', { class: 'map-filter-dot', style: `--day-color:${color}`, 'aria-hidden': 'true' }), label)
    ));
  }

  function renderLegend() {
    const swatch = (props) => h('i', props);
    const item = (icon, text) => h('span', {}, icon, ` ${text}`);
    const entries = [
      ...config.dayFilters.map((day) => item(swatch({ style: `background:${day.color}` }), day.legend)),
      item(swatch({ class: 'restaurant-shape' }), 'Diamante · restaurantes y paradas gastronómicas (el color conserva la jornada)'),
      item(swatch({ class: 'visit-shape', style: 'background:#8a9699' }), 'Círculo · visitas y puntos de interés'),
      item(swatch({ class: 'hotel-shape', style: `background:${HOTEL_COLOR}` }), 'Hotel · alojamiento del grupo'),
      ...(hasAlternatives() ? config.alternativeCategories.map((category) => item(swatch({ style: `background:${category.color}` }), category.legend)) : []),
      item(swatch({ class: 'visited-shape' }), '✓ Atenuado · ya visitado'),
      item(swatch({ class: 'route-shape' }), 'Número · orden de la ruta del día'),
      item(swatch({ class: 'location' }), 'Azul intenso · tu ubicación GPS'),
      item(swatch({ class: 'accuracy' }), 'Azul claro · precisión estimada del GPS')
    ];
    byId('map-legend').replaceChildren(...entries);
    byId('map-legend-summary').textContent = config.legendSummary;
  }

  function renderNearby() {
    if (!userLatLng) return;
    const ordered = filteredPoints()
      .filter((point) => point.type !== 'hotel')
      .map((point) => ({ point, distance: distanceKm(userLatLng, point) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 7);
    nearbyList.replaceChildren(...ordered.map(({ point, distance }) => {
      const button = h('button', { type: 'button', onclick: () => {
        if (!markerLayer.hasLayer(markerByKey.get(cityKey(cityId, point.id)))) applyFilters(emptyFilters());
        map.setView([point.lat, point.lng], 16);
        openDetail(point.id);
      } }, point.name, h('small', {}, point.desc));
      return h('li', {},
        button,
        h('span', { class: 'nearby-distance' }, formatDistance(distance)),
        externalLink(googleDirectionsUrl(point), 'Cómo llegar con Google Maps ↗', 'nearby-directions')
      );
    }));
    const far = config ? distanceIfFarFromCity(userLatLng, config.center) : null;
    const cityName = document.querySelector('[data-city-name]')?.textContent ?? 'la ciudad';
    nearbyStatus.classList.toggle('is-far', far !== null);
    nearbyStatus.textContent = `${far !== null ? `Estás a ${formatFarDistance(far)} de ${cityName}: lo que ves son los puntos de esta guía más cercanos a ti, aunque quedan lejos. ` : ''}Los ${ordered.length} lugares más próximos, ordenados por distancia en línea recta. La ruta real puede ser más larga.${currentAccuracy ? ` Precisión GPS aproximada: ${Math.round(currentAccuracy)} m.` : ''}`;
  }

  function updateUserLocation(position, centerMap) {
    userLatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
    currentAccuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
    userLocationLayer.clearLayers();
    if (currentAccuracy && currentAccuracy > 0) {
      L.circle([userLatLng.lat, userLatLng.lng], {
        radius: currentAccuracy, color: '#2466bd', weight: 1, opacity: 0.55, fillColor: '#2466bd', fillOpacity: 0.1, interactive: false
      }).addTo(userLocationLayer);
    }
    const userIcon = L.divIcon({ className: 'user-location-marker', html: '<span aria-hidden="true"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
    L.marker([userLatLng.lat, userLatLng.lng], { icon: userIcon, keyboard: false, zIndexOffset: 1000 })
      .bindPopup(`Tu ubicación${currentAccuracy ? ` · precisión ±${Math.round(currentAccuracy)} m` : ''}`)
      .addTo(userLocationLayer);
    if (centerMap || followMap) map.setView([userLatLng.lat, userLatLng.lng], Math.max(map.getZoom(), 15));
    renderNearby();
  }

  function geolocationError(error) {
    const messages = {
      1: 'No se ha concedido el permiso de ubicación. Revisa los permisos de Safari/Chrome y los ajustes de localización del dispositivo.',
      2: 'El dispositivo no ha podido determinar tu posición. Comprueba que la localización esté activada y vuelve a intentarlo.',
      3: 'La petición de ubicación ha tardado demasiado. Prueba de nuevo en una zona despejada.'
    };
    nearbyStatus.textContent = messages[error.code] || 'No se ha podido acceder a tu ubicación.';
    locateButton.disabled = false;
    locateButton.textContent = '⌖ Volver a intentar';
    if (followMap) stopFollowing(false);
  }

  function geolocationAvailable() {
    if (!window.isSecureContext) {
      nearbyStatus.textContent = 'La ubicación requiere una conexión segura HTTPS. Abre la guía desde su dirección de GitHub Pages.';
      return false;
    }
    if (!('geolocation' in navigator)) {
      nearbyStatus.textContent = 'Este navegador no ofrece geolocalización. Abre la guía en Safari (iPhone) o Chrome (Android).';
      return false;
    }
    return true;
  }

  function stopFollowing(updateStatus = true) {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    followMap = false;
    followButton.setAttribute('aria-pressed', 'false');
    followButton.textContent = '◎ Seguir ubicación';
    if (updateStatus) nearbyStatus.textContent = userLatLng
      ? 'Seguimiento detenido. Tu última posición sigue marcada en el mapa.'
      : 'Seguimiento detenido.';
  }

  locateButton.addEventListener('click', () => {
    if (!geolocationAvailable()) return;
    locateButton.disabled = true;
    locateButton.textContent = 'Buscando ubicación…';
    nearbyStatus.textContent = 'Solicitando tu ubicación al dispositivo…';
    navigator.geolocation.getCurrentPosition((position) => {
      updateUserLocation(position, true);
      locateButton.disabled = false;
      locateButton.textContent = '⌖ Actualizar mi ubicación';
    }, geolocationError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  });
  followButton.addEventListener('click', () => {
    if (followMap) { stopFollowing(); return; }
    if (!geolocationAvailable()) return;
    followMap = true;
    followButton.setAttribute('aria-pressed', 'true');
    followButton.textContent = '■ Detener seguimiento';
    nearbyStatus.textContent = 'Siguiendo tu ubicación. Permite unos segundos para obtener una posición GPS precisa.';
    watchId = navigator.geolocation.watchPosition((position) => updateUserLocation(position, true), geolocationError, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
  });
  window.addEventListener('pagehide', () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); });

  // "Guardar mapa": see map-offline.js (shared by every view that shows the control).
  const mapOffline = initMapOffline({ button: byId('save-offline-map'), status: byId('save-offline-status'), progress: byId('save-offline-progress') });

  return {
    /** Replaces markers, filters and legend with the data of the given city. */
    setCity(index, cityConfig) {
      cityId = index.cityId;
      config = cityConfig;
      points = index.points;
      mapElement.dataset.city = cityId;
      markerLayer.clearLayers();
      visitButtons.clear();
      markerByKey = new Map(points.map((point) => [cityKey(cityId, point.id), buildMarker(point)]));
      filters = emptyFilters();
      searchHits = null;
      searchIndex = buildMapIndex(points);
      routeOn = false;
      routeLayer.clearLayers();
      renderDayFilters();
      paintFilterButtons();
      renderLegend();
      map.setView(config.center, config.zoom);
      map.invalidateSize();
      refreshMapPoints();
      paintAllMarkers();
      mapOffline.setPlan(planCityTiles({ center: config.center, points }), document.querySelector('[data-city-name]')?.textContent);
      document.dispatchEvent(new CustomEvent('map:city')); // the search field starts empty in every city
    },
    /** Call when the guide view becomes visible again: Leaflet cannot measure a hidden container. */
    refresh() { map.invalidateSize(); },
    /** After the map moves into the full-screen view: re-measure and fit the visible points again. */
    refit() { map.invalidateSize(); refreshMapPoints(); },
    /** Shows or hides the day route; returns whether it is on. */
    setRoute(on) { routeOn = Boolean(on); paintRoute(); announce(); return routeOn; },
    /** Opens the card of a place (used by the carousel). */
    select(id) { const point = points.find((item) => item.id === id); if (!point) return; map.panTo([point.lat, point.lng]); selectPoint(point); },
    /** Removes one active filter: key 'day' | 'kind' | 'only' and its value (without a value, the whole group). */
    clearFilter(key, value) {
      const group = { day: 'days', kind: 'kinds', only: 'only' }[key];
      if (!group) return;
      applyFilters({ ...filters, [group]: value === undefined ? [] : filters[group].filter((item) => item !== value) });
    },
    clearFilters() { applyFilters(emptyFilters()); },
    /** Results of a query among the points shown (for the list under the search field). Changes nothing on the map. */
    previewSearch(query) { return computeSearch(query); },
    /** Highlights the matches and fades the rest; an empty or too short query clears it. Returns the same as previewSearch. */
    setSearch(query) {
      const outcome = computeSearch(query);
      searchHits = outcome.active && outcome.results.length ? new Set(outcome.results.map((point) => point.id)) : null;
      refreshMapPoints();
      return outcome;
    },
    searchActive: () => Boolean(searchHits),
    /** Replaces every filter at once, e.g. { only: ['sellos'] } from the stamp book. */
    setFilters(next) { applyFilters({ ...emptyFilters(), ...next }); },
    /** Full-screen map: zoom bottom right (under «Cerca de mí»), attribution bottom left; back to Leaflet's corners in the guide. */
    placeControls(fullScreen) {
      map.zoomControl.setPosition(fullScreen ? 'bottomright' : 'topleft');
      map.attributionControl.setPosition(fullScreen ? 'bottomleft' : 'bottomright');
    },
    announce
  };
}
