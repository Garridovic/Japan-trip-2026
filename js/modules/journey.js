// Journey helpers. Pure functions (no DOM, no fetch) so Node tests can import them.
import { isValidId } from './ids.js';

export const CITY_QUERY_PARAM = 'city';

/** Cities that are enabled for the trip, in journey order. Disabled cities never get a tab. */
export const enabledCities = (journey) => journey.cities.filter((city) => city.enabled);

/** Inter-city connections that start in the given city. */
export const connectionsFrom = (journey, cityId) =>
  (journey.connections ?? []).filter((connection) => connection.from === cityId);

/** Returns a list of human-readable configuration problems (empty when the journey is valid). */
export function validateJourney(journey) {
  const problems = [];
  if (!journey || typeof journey !== 'object') return ['journey.json is not an object'];
  if (!journey.id) problems.push('journey.id is missing');
  if (!journey.title) problems.push('journey.title is missing');
  if (!Array.isArray(journey.cities) || journey.cities.length === 0) {
    problems.push('journey.cities must be a non-empty array');
    return problems;
  }
  const seen = new Set();
  journey.cities.forEach((city) => {
    if (!isValidId(city.id)) problems.push(`invalid city id: ${city.id}`);
    if (seen.has(city.id)) problems.push(`duplicate city id: ${city.id}`);
    seen.add(city.id);
    if (!city.name) problems.push(`city ${city.id} has no name`);
    if (typeof city.enabled !== 'boolean') problems.push(`city ${city.id} must declare enabled true/false`);
  });
  (journey.connections ?? []).forEach((connection, index) => {
    if (!seen.has(connection.from)) problems.push(`connection ${index} starts in unknown city ${connection.from}`);
    if (!seen.has(connection.to)) problems.push(`connection ${index} ends in unknown city ${connection.to}`);
  });
  return problems;
}

/**
 * Picks the city to show. An unknown or disabled request falls back to the first enabled city;
 * the returned `problem` explains why so the caller can log the configuration issue.
 */
export function resolveActiveCity(journey, requestedId) {
  const cities = enabledCities(journey);
  if (cities.length === 0) throw new Error('The journey has no enabled cities.');
  const fallback = cities.find((city) => city.id === journey.defaultCity) ?? cities[0];
  if (!requestedId) return { cityId: fallback.id };
  if (cities.some((city) => city.id === requestedId)) return { cityId: requestedId };
  return {
    cityId: fallback.id,
    problem: `City "${requestedId}" is unknown or not enabled; showing "${fallback.id}" instead.`
  };
}

export const requestedCityFromSearch = (search) => new URLSearchParams(search).get(CITY_QUERY_PARAM);

/** The stays of a city as [{ arrival, departure }]. A city visited twice (Tokio) lists them in `stays`; otherwise it is one stay. */
export function staysOf(cityEntry) {
  const list = Array.isArray(cityEntry?.stays) && cityEntry.stays.length ? cityEntry.stays : [cityEntry ?? {}];
  return list.map((stay) => ({ arrival: stay.arrivalDate, departure: stay.departureDate }));
}

/** Index of the stay to show on `today` (ISO): the one in progress, else the next one, else the last. */
export function pickStayIndex(stays, today) {
  const during = stays.findIndex((stay) => stay.arrival && stay.departure && today >= stay.arrival && today <= stay.departure);
  if (during >= 0) return during;
  const next = stays.findIndex((stay) => stay.arrival && today < stay.arrival);
  return next >= 0 ? next : Math.max(0, stays.length - 1);
}
