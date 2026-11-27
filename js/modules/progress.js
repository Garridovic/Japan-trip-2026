// "Tu diario del viaje": the pure part of the header's progress card. It turns what already exists on the device
// (visited places, stamps, tried dishes, checklist, favourites) plus the phone's date into numbers and colour tiers.
// No streaks, no rankings, no steps: only things the traveller did, against goals the guide itself defines.
import { daysBetween, localISO } from './trip-status.js';
import { isVisitable } from './visited.js';
import { stampPlaces } from './stamps.js';

/** Colour tiers, never red: grey invites, amber/gold encourage, green rewards. */
export const TIERS = Object.freeze({
  none: { id: 'none', label: 'Sin empezar', icon: '○' },
  start: { id: 'start', label: 'Primeros pasos', icon: '◔' },
  half: { id: 'half', label: 'A medias', icon: '◑' },
  almost: { id: 'almost', label: 'Casi', icon: '◕' },
  done: { id: 'done', label: 'Completo', icon: '✓' },
  neutral: { id: 'neutral', label: '', icon: '' }
});

/** Tier of done/total. A goal that does not exist (total 0) has no colour at all. */
export function tierOf(done, total) {
  if (!(total > 0)) return TIERS.neutral;
  const ratio = done / total;
  if (ratio >= 1) return TIERS.done;
  if (ratio >= 0.8) return TIERS.almost;
  if (ratio >= 0.5) return TIERS.half;
  if (ratio > 0) return TIERS.start;
  return TIERS.none;
}

const plural = (count, one, many) => (count === 1 ? one : many);

/** First arrival and last departure over the enabled cities, as ISO dates. */
export function tripSpan(cities) {
  const arrivals = cities.map((city) => city.arrivalDate).filter(Boolean).sort();
  const departures = cities.map((city) => city.departureDate).filter(Boolean).sort();
  return arrivals.length && departures.length ? { start: arrivals[0], end: departures[departures.length - 1] } : null;
}

/**
 * Everything the card shows. Inputs are plain data so this can be tested without a DOM:
 *  cities        enabled journey cities ({ id, name, arrivalDate, departureDate })
 *  cityId        the city whose page is open
 *  placesByCity  Map(cityId → places[]) of the cities already loaded
 *  visited       Map(cityId → Set(ids)) as parsed by visited.js
 *  stampEntries  entries of the stamp book
 *  dishes        { total, tried, favorites }  phrases: favourites count
 *  checklist     { done, total }
 *  todayKey      key of today's itinerary day in the open city (or null)
 */
export function computeProgress({ now = new Date(), cities, cityId, placesByCity = new Map(), visited = new Map(), stampEntries = [], dishes = { total: 0, tried: 0, favorites: 0 }, phrasesFavorites = 0, checklist = { done: 0, total: 0 }, todayKey = null }) {
  const today = localISO(now);
  const span = tripSpan(cities);
  const city = cities.find(({ id }) => id === cityId) ?? null;
  const mode = !span || today < span.start ? 'before' : today > span.end ? 'after' : 'during';

  const visitable = (id) => (placesByCity.get(id) ?? []).filter(isVisitable);
  const doneIn = (id) => visitable(id).filter((place) => visited.get(id)?.has(place.id)).length;
  const cityPlaces = { done: city ? doneIn(city.id) : 0, total: city ? visitable(city.id).length : 0 };
  const tripPlaces = cities.reduce((sum, { id }) => ({ done: sum.done + doneIn(id), total: sum.total + visitable(id).length }), { done: 0, total: 0 });

  const possibleStamps = cities.reduce((sum, { id }) => sum + stampPlaces(placesByCity.get(id) ?? []).length, 0);
  const stamps = { done: Math.min(stampEntries.length, possibleStamps || stampEntries.length), total: possibleStamps };

  const stops = todayKey && city ? visitable(city.id).filter((place) => place.day === todayKey) : [];
  const stopsDone = stops.filter((place) => visited.get(city.id)?.has(place.id)).length;

  const tile = (id, label, done, total, extra = {}) => ({ id, label, done, total, tier: tierOf(done, total), ...extra });
  const tiles = [];
  const tilePlaces = cityPlaces.total > 0 ? cityPlaces : tripPlaces;

  let ring;
  let headline;
  let sub;
  let nudge = ''; // one short line under the headline (only while travelling, so the card stays as tall as the weather card)
  if (mode === 'before') {
    const left = span ? daysBetween(today, span.start) : null;
    ring = { ...checklist, tier: tierOf(checklist.done, checklist.total), label: 'tareas' };
    headline = 'Preparativos';
    const pending = checklist.total - checklist.done;
    sub = [pending > 0 ? `Faltan ${pending} ${plural(pending, 'tarea', 'tareas')}` : checklist.total ? 'Todo listo' : '', left !== null ? (left === 1 ? 'mañana sales' : `${left} días para salir`) : ''].filter(Boolean).join(' · ');
    tiles.push(tile('sellos', 'Sellos', stamps.done, stamps.total), tile('platos', 'Platos probados', dishes.tried, dishes.total));
  } else {
    const dayNumber = span ? daysBetween(span.start, today) + 1 : 0;
    const dayCount = span ? daysBetween(span.start, span.end) + 1 : 0;
    ring = { ...tilePlaces, tier: tierOf(tilePlaces.done, tilePlaces.total), label: 'de' };
    const where = cityPlaces.total > 0 ? ` en ${city.name}` : ' del viaje';
    headline = tilePlaces.total > 0 && tilePlaces.done === tilePlaces.total ? (cityPlaces.total > 0 ? `¡${city.name} completado!` : '¡Todo visitado!') : `${tilePlaces.done} ${plural(tilePlaces.done, 'lugar', 'lugares')}${where}`;
    sub = [mode === 'during' && dayCount ? `Día ${dayNumber} de ${dayCount}` : 'Viaje terminado', cityPlaces.total > 0 && tripPlaces.done !== cityPlaces.done ? `${tripPlaces.done} en todo el viaje` : ''].filter(Boolean).join(' · ');
    if (mode === 'during' && stops.length) tiles.push(tile('hoy', 'Hoy', stopsDone, stops.length));
    tiles.push(tile('sellos', 'Sellos', stamps.done, stamps.total), tile('platos', 'Platos probados', dishes.tried, dishes.total), tile('checklist', 'Checklist', checklist.done, checklist.total));
    if (span) tiles.push(tile('ciudades', 'Ciudades', cities.filter((item) => item.arrivalDate && item.arrivalDate <= today).length, cities.length));
    const remaining = stops.length - stopsDone;
    nudge = mode === 'during' && stops.length ? (remaining > 0 ? `Te ${plural(remaining, 'falta', 'faltan')} ${remaining} ${plural(remaining, 'parada', 'paradas')} para completar el día de hoy.` : '¡Día completado! Disfruta del resto.') : '';
  }
  const saved = dishes.favorites + phrasesFavorites;
  tiles.push({ id: 'guardados', label: 'Guardados', done: saved, total: null, tier: TIERS.neutral });
  return { mode, ring, headline, sub, tiles: tiles.filter((item) => item.total !== 0 || item.id === 'guardados'), nudge };
}
