// Optional "¿Estás en…?" card. With the app open in the foreground and location allowed, the position is checked every
// few seconds and, near a temple / monument / park / museum not yet visited, a small card offers to mark it as visited.
// Off by default; turning it on shows a consent sheet first. The position is never stored, logged or sent anywhere.
import { h } from './dom.js';
import { visitedStore } from './visited.js';
import { suggestiblePlaces, pickSuggestion, placeKey, dayKey, pruneRecords, parseRecords } from './proximity.js';
import { fetchJson, cityDataPath } from './data.js';
import { enabledCities } from './journey.js';
import { toast } from './feedback.js';

export const ENABLED_KEY = 'japan-trip:proximity-enabled'; // device setting: not part of the synced user data
export const PROMPTED_KEY = 'japan-trip:proximity-prompted'; // { place: day }, so a place is offered once per day
export const POLL_MS = 10_000;
export const CARD_MS = 30_000;

export const IPHONE_NOTE = 'Solo funciona con la guía abierta y la pantalla encendida. En iPhone no puede avisarte con la app cerrada ni con el móvil bloqueado.';
const DENIED_NOTE = 'El navegador tiene bloqueada la ubicación para esta guía. Actívala en los ajustes del navegador para usar los avisos.';

export function createProximity({ journey, visited = visitedStore(), win = window, storage = null, poll = win.__JT_PROXIMITY_POLL_MS ?? POLL_MS, now = () => new Date() } = {}) {
  try { storage = storage ?? win.localStorage; } catch { /* blocked */ }
  const read = (key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const write = (key, value) => { try { storage?.setItem(key, value); } catch { /* kept for this visit only */ } };

  let enabled = read(ENABLED_KEY) === '1';
  let state = 'idle'; // idle | watching | denied | unsupported
  let timer = null;
  let candidates = null;
  let card = null;
  let cardTimer = null;
  const listeners = new Set();
  const setState = (next) => { state = next; listeners.forEach((fn) => fn()); };

  const prompted = () => pruneRecords(parseRecords(read(PROMPTED_KEY)), dayKey(now()));
  const remember = (cityId, id) => write(PROMPTED_KEY, JSON.stringify({ ...prompted(), [placeKey(cityId, id)]: dayKey(now()) }));

  async function loadCandidates() {
    if (candidates) return candidates;
    const cities = journey ? enabledCities(journey) : [];
    const lists = await Promise.all(cities.map(async (city) => {
      try { return suggestiblePlaces(city.id, await fetchJson(cityDataPath(city.id, 'places'), { optional: true })); } catch { return []; }
    }));
    candidates = lists.flat();
    return candidates;
  }

  function hideCard() { clearTimeout(cardTimer); card?.remove(); card = null; }

  function showCard(place) {
    hideCard();
    remember(place.cityId, place.id); // offered today, whatever the answer
    const accept = h('button', { type: 'button', class: 'proximity-yes', onclick: () => { hideCard(); visited.set(place.cityId, place.id, true); } }, 'Marcar visitado');
    const later = h('button', { type: 'button', class: 'proximity-no', onclick: hideCard }, 'Ahora no');
    card = h('div', { class: 'proximity-card', role: 'status', 'aria-live': 'polite', dataset: { place: place.id } },
      h('p', {}, '¿Estás en ', h('strong', {}, place.name), '?'),
      h('div', { class: 'proximity-actions' }, accept, later));
    win.document.body.append(card);
    cardTimer = setTimeout(hideCard, CARD_MS);
  }

  visited.subscribe(({ cityId, id, visited: now }) => { if (now && card?.dataset.place === id && candidates?.some((c) => c.cityId === cityId && c.id === id)) hideCard(); });

  async function check(position) {
    if (card) return; // one card at a time
    const list = await loadCandidates();
    const best = pickSuggestion({ position, candidates: list, isVisited: (c, i) => visited.has(c, i), prompted: prompted(), today: dayKey(now()) });
    if (best && enabled && !card) showCard(best);
  }

  function tick() {
    timer = null;
    if (!enabled || win.document.hidden) return;
    win.navigator.geolocation.getCurrentPosition(
      ({ coords }) => { check({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }); schedule(); },
      (error) => { if (error.code === 1) { setState('denied'); return; } schedule(); },
      { enableHighAccuracy: false, maximumAge: 5000, timeout: 20_000 }
    );
  }
  function schedule() { if (enabled && !timer && !win.document.hidden && state !== 'denied') timer = setTimeout(tick, poll); }
  function stop() { clearTimeout(timer); timer = null; }

  win.document.addEventListener('visibilitychange', () => {
    if (win.document.hidden) { stop(); hideCard(); } else if (enabled) { stop(); tick(); }
  });

  function start() {
    stop();
    if (!enabled) { setState('idle'); return; }
    if (!win.navigator.geolocation) { setState('unsupported'); return; }
    setState('watching');
    tick();
  }

  function setEnabled(value) {
    enabled = value;
    write(ENABLED_KEY, value ? '1' : '0');
    if (!value) { stop(); hideCard(); setState('idle'); } else start();
  }

  /** The consent sheet. Turning on is only possible through it. */
  function askConsent() {
    const doc = win.document;
    if (doc.getElementById('proximity-consent')) return;
    const close = () => { sheet.remove(); };
    const sheet = h('div', { class: 'proximity-consent', id: 'proximity-consent', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Avisos de lugares cercanos' },
      h('div', { class: 'proximity-consent-box' },
        h('h2', {}, 'Avisos de lugares cercanos'),
        h('p', {}, 'Si lo activas, la guía mirará tu ubicación cada pocos segundos mientras la tengas abierta y, si estás en un templo, monumento, parque o museo que aún no has marcado, te preguntará si quieres marcarlo como visitado.'),
        h('ul', {},
          h('li', {}, 'Nunca marca nada por su cuenta: siempre te lo pregunta.'),
          h('li', {}, 'Tu posición no se guarda ni se envía a ningún sitio.'),
          h('li', {}, IPHONE_NOTE),
          h('li', {}, 'El navegador te pedirá permiso de ubicación. Puedes apagarlo cuando quieras desde el panel de cuenta.')),
        h('div', { class: 'account-actions' },
          h('button', { type: 'button', class: 'filter proximity-accept', onclick: () => { close(); setEnabled(true); toast('Avisos de lugares cercanos activados.'); } }, 'Activar avisos'),
          h('button', { type: 'button', class: 'filter proximity-cancel', onclick: close }, 'Ahora no'))));
    doc.body.append(sheet);
    sheet.querySelector('button')?.focus();
  }

  /** Switch row shown in the "Cuenta y ajustes" screen (a fresh node each time it is rendered). */
  function settingNode() {
    const on = enabled;
    const toggle = h('button', { type: 'button', class: 'account-row proximity-toggle', role: 'switch', 'aria-checked': String(on), 'aria-label': on ? 'Avisos de lugares cercanos: activados' : 'Avisos de lugares cercanos: desactivados', onclick: () => { if (enabled) setEnabled(false); else askConsent(); } },
      h('span', {}, 'Avisos de lugares cercanos'), h('span', { class: 'switch', 'aria-hidden': 'true' }));
    const note = state === 'denied' && on ? DENIED_NOTE : state === 'unsupported' && on ? 'Este navegador no ofrece geolocalización.' : IPHONE_NOTE;
    return h('div', { class: 'proximity-setting' }, toggle, h('p', { class: 'proximity-note' }, note));
  }

  return {
    start, setEnabled, askConsent, settingNode, hideCard,
    get enabled() { return enabled; },
    get state() { return state; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
