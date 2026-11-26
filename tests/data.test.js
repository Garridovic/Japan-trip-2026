import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidId, cityKey } from '../js/modules/ids.js';
import { validateJourney, enabledCities } from '../js/modules/journey.js';
import { REQUIRED_CITY_DATASETS, OPTIONAL_CITY_DATASETS } from '../js/modules/data.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const exists = (path) => access(resolve(root, path)).then(() => true, () => false);

const journey = await readJson('data/journey.json');
const version = await readJson('data/version.json');
const packageJson = await readJson('package.json');
const tips = await readJson('data/global/tips.json');
const cities = enabledCities(journey);

const loadCityData = async (cityId) => {
  const names = [...REQUIRED_CITY_DATASETS, ...OPTIONAL_CITY_DATASETS, 'image-catalog'];
  const entries = await Promise.all(names.map(async (name) => {
    const path = `data/cities/${cityId}/${name}.json`;
    return [name, (await exists(path)) ? await readJson(path) : null];
  }));
  return Object.fromEntries(entries);
};
const cityData = new Map(await Promise.all(cities.map(async ({ id }) => [id, await loadCityData(id)])));

const isValidCoordinate = (lat, lng) =>
  Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;

// ---------- journey ----------

test('the journey manifest is valid and has at least one enabled city', () => {
  assert.deepEqual(validateJourney(journey), []);
  assert.ok(cities.length >= 1);
});

test('journey connections reference cities that exist in the journey', () => {
  const ids = new Set(journey.cities.map(({ id }) => id));
  journey.connections.forEach(({ from, to, date, title }) => {
    assert.ok(ids.has(from), `unknown origin ${from}`);
    assert.ok(ids.has(to), `unknown destination ${to}`);
    assert.notEqual(from, to);
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(title);
  });
});

test('only enabled cities become tabs; disabled cities need no content', () => {
  assert.deepEqual(cities.map(({ id }) => id), journey.cities.filter(({ enabled }) => enabled).map(({ id }) => id));
  journey.cities.filter(({ enabled }) => !enabled).forEach(({ id }) => {
    assert.ok(!cities.some((city) => city.id === id), `${id} must not have a tab`);
  });
});

test('data folders exist only for cities declared in the journey', async () => {
  const folders = await readdir(resolve(root, 'data/cities'));
  const declared = new Set(journey.cities.map(({ id }) => id));
  folders.forEach((folder) => assert.ok(declared.has(folder), `data/cities/${folder} is not in journey.json`));
});

// ---------- per-city integrity ----------

for (const { id: cityId } of cities) {
  const data = cityData.get(cityId);

  test(`[${cityId}] has every required dataset and valid metadata`, () => {
    REQUIRED_CITY_DATASETS.forEach((name) => assert.ok(data[name], `missing ${name}.json`));
    assert.equal(data.city.id, cityId);
    assert.ok(data.city.pageTitle && data.city.description && data.city.hero?.subtitle);
    assert.ok(Array.isArray(data.city.hero.meta) && data.city.hero.meta.length > 0);
    const { center, zoom, queryContext, dayFilters, alternativeCategories } = data.city.map;
    assert.ok(isValidCoordinate(center[0], center[1]));
    assert.ok(Number.isInteger(zoom) && zoom > 0 && zoom <= 19);
    assert.ok(queryContext);
    dayFilters.forEach(({ value, label, short, color, legend }) => {
      assert.ok(value && label && short && legend);
      assert.match(color, /^#[0-9a-f]{6}$/i);
    });
    alternativeCategories.forEach(({ id, label, color, legend }) => {
      assert.ok(id && label && legend);
      assert.match(color, /^#[0-9a-f]{6}$/i);
    });
  });

  test(`[${cityId}] local ids are unique and composite keys cannot collide`, () => {
    const ids = [...data.places, ...data.restaurants].map(({ id }) => id);
    assert.equal(ids.length, new Set(ids).size);
    ids.forEach((id) => assert.ok(isValidId(id), `invalid id ${id}`));
    const keys = ids.map((id) => cityKey(cityId, id));
    assert.equal(keys.length, new Set(keys).size);
  });

  test(`[${cityId}] all places and restaurants have valid coordinates and display fields`, () => {
    [...data.places, ...data.restaurants].forEach(({ id, name, lat, lng, type, desc, query }) => {
      assert.ok(isValidCoordinate(lat, lng), `Invalid coordinates for ${id}`);
      assert.ok(id && name && type && desc && query, `Missing required fields for ${id}`);
    });
  });

  test(`[${cityId}] every place has a detail record of its own city`, () => {
    const detailIds = data.details.map(({ id }) => id);
    assert.equal(detailIds.length, new Set(detailIds).size);
    data.places.forEach(({ id }) => assert.ok(detailIds.includes(id), `Missing details for ${id}`));
    data.details.forEach(({ id, photos }) => assert.ok(Array.isArray(photos), `Photos must be an array for ${id}`));
  });

  test(`[${cityId}] map day filters and alternative categories cover the points`, () => {
    const dayValues = new Set(data.city.map.dayFilters.map(({ value }) => value));
    const categoryIds = new Set(data.city.map.alternativeCategories.map(({ id }) => id));
    [...data.places, ...data.restaurants].forEach(({ id, day, altCategory }) => {
      if (day === 'base') return;
      if (day === 'extra') return assert.ok(categoryIds.has(altCategory), `${id}: unknown alternative category ${altCategory}`);
      day.split(',').forEach((value) => assert.ok(dayValues.has(value), `${id}: no map filter for day ${value}`));
    });
  });

  test(`[${cityId}] itinerary days are complete and fall inside the journey dates`, () => {
    const entry = journey.cities.find(({ id }) => id === cityId);
    const keys = data.itinerary.days.map(({ key }) => key);
    assert.equal(keys.length, new Set(keys).size);
    data.itinerary.days.forEach((day) => {
      assert.ok(day.date >= entry.arrivalDate, `${day.date} is before arrival`);
      if (entry.departureDate) assert.ok(day.date <= entry.departureDate, `${day.date} is after departure`);
      if (!day.quick && !day.detail) return;
      assert.ok(day.quick?.title && day.quick.route.length > 0 && day.quick.date && day.quick.zone && day.quick.note);
      assert.ok(day.detail?.title && day.detail.lead && day.detail.transport && day.detail.mapUrl && day.detail.stops.length > 0);
      day.detail.stops.forEach((stop) => assert.ok(stop.time && stop.title && stop.text));
      assert.ok(data.city.map.dayFilters.some(({ value }) => value === day.key), `day ${day.key} has no map filter`);
    });
  });

  test(`[${cityId}] events reference their own places`, () => {
    const eventPlaces = data.places.filter(({ type }) => type === 'event');
    if (!data.events) return assert.equal(eventPlaces.length, 0, 'event places need events.json');
    assert.ok(data.events.start && data.events.finish);
    assert.ok(Array.isArray(data.events.routeStops) && data.events.routeStops.length > 0);
    const placeIds = new Set(data.places.map(({ id }) => id));
    data.events.routeStops.forEach(({ id }) => assert.ok(placeIds.has(id), `event stop ${id} is not a place of ${cityId}`));
  });

  test(`[${cityId}] restaurant cards are fully described and match the filters`, () => {
    if (!data.food) return assert.equal(data.restaurants.length, 0);
    const dayValues = new Set(data.food.dayFilters.map(({ value }) => value));
    const typeValues = new Set(data.food.typeFilters.map(({ value }) => value));
    assert.ok(data.food.title && data.food.intro && data.food.note.label && data.food.note.text);
    data.restaurants.forEach(({ id, foodCategory, day, foodTypeLabel, dayLabel, note, mapsUrl, links = [] }) => {
      assert.ok(typeValues.has(foodCategory), `${id}: no food type filter ${foodCategory}`);
      assert.ok(dayValues.has(day), `${id}: no food day filter ${day}`);
      assert.ok(foodTypeLabel && dayLabel && note, `${id}: incomplete card`);
      assert.ok(mapsUrl.startsWith('https://www.google.com/maps/'), `${id}: bad maps url`);
      links.forEach((link) => assert.ok(link.label && /^https?:\/\//.test(link.url)));
    });
  });

  test(`[${cityId}] extra places use declared categories`, () => {
    if (!data.extras) return;
    const categoryIds = new Set(data.city.map.alternativeCategories.map(({ id }) => id));
    data.extras.items.forEach(({ category, tag, name, desc }) => {
      assert.ok(categoryIds.has(category), `${name}: unknown category ${category}`);
      assert.ok(tag && name && desc);
    });
  });

  test(`[${cityId}] optional files referenced by the city exist`, async () => {
    if (data.city.kml) assert.ok(await exists(data.city.kml), `${data.city.kml} is missing`);
    if (data.sources) data.sources.items.forEach(({ label, href }) => assert.ok(label && /^https?:\/\//.test(href)));
  });
}

test('composite keys are unique across all enabled cities', () => {
  const keys = cities.flatMap(({ id }) => [...cityData.get(id).places, ...cityData.get(id).restaurants].map((point) => cityKey(id, point.id)));
  assert.equal(keys.length, new Set(keys).size);
});

// ---------- global content ----------

test('global tips are well formed and not duplicated inside city datasets', () => {
  assert.ok(tips.kicker && tips.title && tips.items.length > 0);
  tips.items.forEach(({ title, text }) => assert.ok(title && text));
  const cityText = JSON.stringify([...cityData.values()]);
  tips.items.forEach(({ text }) => assert.ok(!cityText.includes(text), `Global tip is duplicated in a city dataset: ${text.slice(0, 40)}`));
});

test('the page shell contains no hand-written city content', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  ['Nishiki', 'Fushimi', 'Kinkaku', 'Agora Kyoto'].forEach((word) => assert.ok(!html.includes(word), `index.html still hard-codes "${word}"`));
});

test('application code does not use pre-V11 fixed data paths', async () => {
  const files = [...(await readdir(resolve(root, 'js/modules'))).map((name) => `js/modules/${name}`), 'js/main.js'];
  for (const file of files) {
    const source = await readFile(resolve(root, file), 'utf8');
    assert.ok(!/data\/(places|restaurants|details|events)\.json/.test(source), `${file} reads a pre-V11 data path`);
  }
});

// ---------- version ----------

test('application version metadata is consistent', () => {
  assert.match(version.version, /^V\d+\.\d+\.\d+$/);
  assert.ok(version.updated);
  assert.equal(`V${packageJson.version}`, version.version, 'package.json version must match data/version.json');
});

// ---------- images (require `npm run prepare:images`) ----------

test('all generated place photos use local responsive assets with credits', async () => {
  const report = await readJson('image-preparation-report.json');
  assert.ok(Array.isArray(report.issues), 'Image preparation report must include an issues array');
  let expectedPlaces = 0;

  for (const { id: cityId } of cities) {
    const data = cityData.get(cityId);
    if (!data['image-catalog']) continue;
    expectedPlaces += data['image-catalog'].places.length;
    const credits = await readJson(`data/cities/${cityId}/image-credits.json`);
    const photoRecords = data.details.flatMap(({ id, photos }) => photos.map((photo) => ({ id, photo })));
    assert.equal(photoRecords.length, credits.length, `${cityId}: every photo must have a credit record`);

    for (const { id, photo } of photoRecords) {
      assert.equal(typeof photo, 'object', `Photo for ${cityId}/${id} must contain responsive image metadata`);
      assert.ok(photo.src.startsWith(`assets/images/${cityId}/`), `Photo for ${cityId}/${id} must be local to its city`);
      assert.ok(photo.srcSet.includes('480w') && photo.srcSet.includes('960w') && photo.srcSet.includes('1600w'));
      await access(resolve(root, photo.src));
      for (const source of photo.srcSet.split(', ')) {
        const [assetPath] = source.split(' ');
        assert.ok(assetPath.startsWith(`assets/images/${cityId}/`));
        await access(resolve(root, assetPath));
      }
    }
    credits.forEach(({ author, license, sourcePage }) => {
      assert.ok(author, 'Every image must have an author or credited source');
      assert.ok(license, 'Every image must have a license');
      assert.ok(sourcePage.startsWith('https://commons.wikimedia.org/'));
    });
  }
  assert.equal(report.placesChecked, expectedPlaces);
});

test('journey optionalData lists exactly the optional files each city has, so no 404s are requested', async () => {
  for (const city of cities) {
    const present = [];
    for (const name of [...OPTIONAL_CITY_DATASETS, 'tips']) if (await exists(`data/cities/${city.id}/${name}.json`)) present.push(name);
    assert.deepEqual([...(city.optionalData ?? [])].sort(), present.sort(), `optionalData of ${city.id}`);
  }
});
