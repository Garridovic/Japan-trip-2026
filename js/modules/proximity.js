// "Are you here?" suggestions: pure logic (no DOM, no geolocation). It never marks anything by itself.
// The position is only compared with the places and then forgotten: nothing in here stores or sends it.
import { distanceKm } from './geo.js';

/** Only these kinds of place can be suggested. Restaurants, lodging, markets, streets and event points never can. */
export const SUGGESTIBLE_KINDS = Object.freeze(['temple', 'monument', 'park', 'museum']);
export const DEFAULT_RADIUS_M = 100;
/** A fix less precise than this (metres) is ignored: it could place you in the wrong temple. */
export const MAX_ACCURACY_M = 60;

/** The day as the device sees it ("2026-12-12"): the unit of "once per day". */
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const suggestibleRadius = (point) => {
  const proximity = point?.proximity;
  if (!proximity || !SUGGESTIBLE_KINDS.includes(proximity.kind)) return null;
  if (point.type === 'hotel') return null;
  const radius = Number(proximity.radius ?? DEFAULT_RADIUS_M);
  return Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_RADIUS_M;
};

/** Places of one city that may ever be suggested, each with its radius in metres. */
export function suggestiblePlaces(cityId, places) {
  return (places ?? []).flatMap((point) => {
    const radius = suggestibleRadius(point);
    return radius === null ? [] : [{ cityId, id: point.id, name: point.name, lat: point.lat, lng: point.lng, radius }];
  });
}

/** Key used to remember that a place was already offered today. */
export const placeKey = (cityId, id) => `${cityId}:${id}`;

/**
 * The single place to offer for a position, or null.
 * `prompted` is a Map/object { "kyoto:fushimi": "2026-12-12" }: a place offered today (accepted, dismissed or ignored) is not offered again today.
 * Among several places inside their radius the nearest wins.
 */
export function pickSuggestion({ position, candidates, isVisited, prompted = {}, today = dayKey() }) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return null;
  if (!(position.accuracy <= MAX_ACCURACY_M)) return null; // also rejects missing / NaN accuracy
  let best = null;
  for (const place of candidates) {
    if (isVisited(place.cityId, place.id)) continue;
    const seen = prompted instanceof Map ? prompted.get(placeKey(place.cityId, place.id)) : prompted[placeKey(place.cityId, place.id)];
    if (seen === today) continue;
    const metres = distanceKm(position, place) * 1000;
    if (metres > place.radius) continue;
    if (!best || metres < best.metres) best = { ...place, metres };
  }
  return best;
}

/** Drops entries from earlier days so the remembered list never grows. */
export function pruneRecords(records, today = dayKey()) {
  return Object.fromEntries(Object.entries(records ?? {}).filter(([, day]) => day === today));
}

export function parseRecords(raw) {
  try {
    const parsed = JSON.parse(raw ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, day]) => typeof day === 'string'));
  } catch { return {}; }
}
