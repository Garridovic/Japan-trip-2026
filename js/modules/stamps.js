// "Sellos" (goshuin-style stamps): one stamp per place of interest, earned by marking the place as visited.
// Pure logic (no DOM, no storage): everything is derived from the visited marks, which already sync through
// user-data.js, so stamps add nothing to localStorage or to the Auth0 profile.
import { isVisitable } from './visited.js';

export const SHAPES = ['circle', 'square', 'octagon', 'ring'];
export const MOTIFS = ['torii', 'sun', 'waves', 'mountain'];

/** Small stable hash: the same place always gets the same stamp. */
export function hashId(text) {
  let hash = 2166136261;
  for (const char of String(text)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash >>> 0;
}

/** Shape, motif and a slight tilt (-5..+5°) chosen from the place id. */
export function stampLook(cityId, id) {
  const hash = hashId(`${cityId}:${id}`);
  return { shape: SHAPES[hash % SHAPES.length], motif: MOTIFS[(hash >>> 3) % MOTIFS.length], tilt: ((hash >>> 6) % 11) - 5 };
}

/** Hotels are not stamped (same rule as the visited counters). */
export const stampablePlaces = (places) => places.filter(isVisitable);

/**
 * One collection per city, in journey order: { id, name, done, total, complete, stamps: [{ id, name, visited }] }.
 * `cities` is [{ id, name, places }]; `store` has `has(cityId, id)`.
 */
export function buildCollections(cities, store) {
  return cities.map(({ id, name, places }) => {
    const stamps = stampablePlaces(places).map((place) => ({ id: place.id, name: place.name, visited: store.has(id, place.id) }));
    const done = stamps.filter((stamp) => stamp.visited).length;
    return { id, name, done, total: stamps.length, complete: stamps.length > 0 && done === stamps.length, stamps };
  });
}

/** Earned stamps first (in data order), then the empty slots. */
export const orderedStamps = (collection) => [...collection.stamps.filter((s) => s.visited), ...collection.stamps.filter((s) => !s.visited)];

export const percent = ({ done, total }) => (total ? Math.round((done / total) * 100) : 0);
export const progressLabel = ({ name, done, total }) => `${name} ${done}/${total}`;
