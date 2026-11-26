import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

export const journey = readJson('data/journey.json');
export const version = readJson('data/version.json');
export const kyoto = {
  city: readJson('data/cities/kyoto/city.json'),
  places: readJson('data/cities/kyoto/places.json'),
  restaurants: readJson('data/cities/kyoto/restaurants.json'),
  extras: readJson('data/cities/kyoto/extras.json'),
  itinerary: readJson('data/cities/kyoto/itinerary.json')
};

export const SVG_MARKERS = '.leaflet-overlay-pane svg path';
export const RESTAURANT_MARKERS = '.restaurant-map-marker';

/** A minimal fictional city used only by tests. It reuses the id "fushimi" on purpose. */
export const testCity = (name) => ({
  city: {
    id: name.toLowerCase(),
    pageTitle: `${name} · ciudad de prueba`,
    description: 'Ciudad de prueba',
    hero: { subtitle: `Subtítulo de ${name}`, meta: ['1 jornada'], hotel: { name: `${name} Hotel`, mapUrl: 'https://www.google.com/maps/search/?api=1&query=Test' } },
    map: {
      center: [34.69, 135.5],
      zoom: 12,
      queryContext: `${name}, Japan`,
      legendSummary: `Leyenda de ${name}`,
      dayFilters: [{ value: '20', label: '20 dic', short: '20 dic', color: '#c45a4a', legend: '20 dic · prueba' }],
      alternativeCategories: []
    },
    footerLabel: `${name} · prueba`
  },
  places: [
    { id: 'fushimi', name: `${name} Tower`, lat: 34.69, lng: 135.5, day: '20', type: 'itinerary', desc: 'Torre de prueba', query: `${name} Tower` },
    { id: 'second', name: `${name} Park`, lat: 34.7, lng: 135.51, day: '20', type: 'itinerary', desc: 'Parque de prueba', query: `${name} Park` }
  ],
  restaurants: [],
  details: [
    { id: 'fushimi', description: `Descripción exclusiva de ${name}`, photos: [], directions: {} },
    { id: 'second', description: `Segundo lugar de ${name}`, photos: [], directions: {} }
  ],
  itinerary: {
    days: [{
      key: '20', date: '2026-12-20', label: '20 diciembre', route: name, focus: 'Prueba',
      quick: { date: 'Dom · 20 dic', zone: 'Centro', title: `Día en ${name}`, route: ['A', 'B'], note: 'Nota' },
      detail: {
        dayOfWeek: 'dom', title: `Día en ${name}`, summary: 'Resumen', lead: 'Introducción',
        stops: [{ time: '10:00', title: 'Parada', text: 'Texto' }], transport: 'A pie',
        mapUrl: 'https://www.google.com/maps/dir/?api=1&destination=Test'
      }
    }]
  }
});

/**
 * Serves extra enabled test cities next to Kyoto without touching the real data files.
 * `ids` are city ids; each one gets its own copy of the fictional city.
 */
export async function addTestCities(page, ids) {
  await page.route('**/data/journey.json', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    ids.forEach((id, index) => body.cities.splice(1 + index, 0, {
      id, name: id[0].toUpperCase() + id.slice(1), enabled: true, arrivalDate: '2026-12-20'
    }));
    await route.fulfill({ response, json: body });
  });
  await page.route(/\/data\/cities\/([a-z0-9-]+)\/([a-z-]+)\.json$/, async (route) => {
    const [, cityId, dataset] = route.request().url().match(/\/data\/cities\/([a-z0-9-]+)\/([a-z-]+)\.json$/);
    if (!ids.includes(cityId)) return route.fallback();
    const name = cityId[0].toUpperCase() + cityId.slice(1);
    const data = testCity(name);
    if (!(dataset in data)) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill({ json: data[dataset] });
  });
}

export const countFor = (points, day) => points.filter((point) => point.day === day || point.day.split(',').includes(day)).length;

/** City selector: one button that opens a list of cities (keeps the header the same size for 2 or 10 cities). */
export const citySelect = (page) => page.locator('#city-select');
export async function openCities(page) {
  if ((await citySelect(page).getAttribute('aria-expanded')) !== 'true') await citySelect(page).click();
  return page.getByRole('option');
}
export async function selectCity(page, name) {
  await openCities(page);
  await page.getByRole('option', { name, exact: true }).click();
}
