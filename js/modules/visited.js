// "Visited" marks for places of interest. They belong to the device (localStorage), per city, and never leave it.
// Shape in storage: { "kyoto": ["fushimi", "nishiki"], "osaka": [...] }.
export const VISITED_KEY = 'visited-v1';

/** Hotels are where you sleep, not something to tick off. */
export const isVisitable = (point) => point.type !== 'hotel';

export function parseVisited(raw) {
  const data = new Map();
  try {
    const parsed = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [cityId, ids] of Object.entries(parsed)) {
        if (Array.isArray(ids)) data.set(cityId, new Set(ids.filter((id) => typeof id === 'string')));
      }
    }
  } catch { /* corrupt or missing: start empty */ }
  return data;
}

export function serializeVisited(data) {
  return JSON.stringify(Object.fromEntries([...data].filter(([, ids]) => ids.size).map(([cityId, ids]) => [cityId, [...ids].sort()])));
}

/** Done / total over the visitable points of one city. Ids that no longer exist in the data are ignored. */
export function countVisited(store, cityId, points) {
  const visitable = points.filter(isVisitable);
  return { done: visitable.filter((point) => store.has(cityId, point.id)).length, total: visitable.length };
}

export function createVisitedStore(storage) {
  let data;
  try { data = parseVisited(storage?.getItem(VISITED_KEY)); } catch { data = new Map(); }
  const listeners = new Set();
  const persist = () => { try { storage?.setItem(VISITED_KEY, serializeVisited(data)); } catch { /* private mode: kept for this visit only */ } };
  const notify = (change) => listeners.forEach((listener) => listener(change));
  return {
    has: (cityId, id) => data.get(cityId)?.has(id) ?? false,
    set(cityId, id, visited) {
      const ids = data.get(cityId) ?? new Set();
      if (ids.has(id) === visited) return;
      if (visited) ids.add(id); else ids.delete(id);
      data.set(cityId, ids);
      persist();
      notify({ cityId, id, visited });
    },
    toggle(cityId, id) { this.set(cityId, id, !this.has(cityId, id)); return this.has(cityId, id); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

let shared = null;
/** One store for the whole page (map, place sheet and counters share it). */
export function visitedStore() {
  if (!shared) {
    let storage = null;
    try { storage = window.localStorage; } catch { /* blocked */ }
    shared = createVisitedStore(storage);
  }
  return shared;
}
