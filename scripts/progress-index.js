// Totals the "Tu diario del viaje" card needs for EVERY city (visitable places, places with a confirmed stamp), computed
// from each city's places.json and stored in data/global/progress-index.json. The card can then show the same totals
// whichever city is opened, without downloading the other cities (a rule of the guide). build-offline.js regenerates it
// on every release and tests/progress-index.test.js fails if it is ever out of date.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const INDEX_PATH = 'data/global/progress-index.json';
const exists = (file) => stat(file).then(() => true, () => false);

/** Pure: totals of one city's places (same rules as visited.js isVisitable and stamps.js stampPlaces). */
export function totalsOf(places) {
  const list = Array.isArray(places) ? places : [];
  return {
    visitable: list.filter((place) => place.type !== 'hotel').length,
    stamps: list.filter((place) => place.stamp && ['goshuin', 'gojoin'].includes(place.stamp.kind)).length
  };
}

export async function buildProgressIndex(root = process.cwd()) {
  const citiesDir = path.join(root, 'data/cities');
  const cities = {};
  if (await exists(citiesDir)) {
    for (const entry of (await readdir(citiesDir, { withFileTypes: true })).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(citiesDir, entry.name, 'places.json');
      if (await exists(file)) cities[entry.name] = totalsOf(JSON.parse(await readFile(file, 'utf8')));
    }
    await writeFile(path.join(root, INDEX_PATH), `${JSON.stringify({ cities }, null, 2)}\n`);
  }
  return { cities };
}
