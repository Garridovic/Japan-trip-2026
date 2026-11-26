// Data loading: journey, global content and per-city datasets (static JSON files).
import { isValidId } from './ids.js';
import { validateJourney } from './journey.js';

export const REQUIRED_CITY_DATASETS = ['city', 'places', 'restaurants', 'details', 'itinerary'];
export const OPTIONAL_CITY_DATASETS = ['events', 'food', 'extras', 'sources'];

export async function fetchJson(path, { optional = false } = {}) {
  const response = await fetch(path);
  if (response.status === 404 && optional) return null;
  if (!response.ok) throw new Error(`Failed to load ${path} (HTTP ${response.status})`);
  return response.json();
}

export const cityDataPath = (cityId, dataset) => `data/cities/${cityId}/${dataset}.json`;

export async function loadJourney() {
  const journey = await fetchJson('data/journey.json');
  validateJourney(journey).forEach((problem) => console.warn(`[journey] ${problem}`));
  return journey;
}

export async function loadGlobalContent() {
  const [tips, phrases, dishes, dishCredits, lodging] = await Promise.all([
    fetchJson('data/global/tips.json', { optional: true }),
    fetchJson('data/global/phrases.json', { optional: true }),
    fetchJson('data/global/dishes.json', { optional: true }),
    fetchJson('data/global/dish-credits.json', { optional: true }),
    fetchJson('data/global/lodging.json', { optional: true })
  ]);
  return { tips, phrases, dishes, dishCredits: dishCredits ?? [], lodging };
}

const cityCache = new Map();

/** Loads every dataset of one city (only that city: other cities are never downloaded). */
export function loadCity(cityId) {
  if (!isValidId(cityId)) return Promise.reject(new Error(`Invalid city id: ${cityId}`));
  if (!cityCache.has(cityId)) {
    const request = (async () => {
      const entries = await Promise.all([
        ...REQUIRED_CITY_DATASETS.map(async (name) => [name, await fetchJson(cityDataPath(cityId, name))]),
        ...OPTIONAL_CITY_DATASETS.map(async (name) => [name, await fetchJson(cityDataPath(cityId, name), { optional: true })])
      ]);
      return { id: cityId, ...Object.fromEntries(entries) };
    })();
    request.catch(() => cityCache.delete(cityId));
    cityCache.set(cityId, request);
  }
  return cityCache.get(cityId);
}
