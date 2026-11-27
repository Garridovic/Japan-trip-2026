import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = async (file) => JSON.parse(await readFile(`${root}data/cities/osaka/${file}.json`, 'utf8'));
const [city, places, restaurants, details, itinerary, food, extras, sources, catalog] = await Promise.all(
  ['city', 'places', 'restaurants', 'details', 'itinerary', 'food', 'extras', 'sources', 'image-catalog'].map(read));
const journey = JSON.parse(await readFile(`${root}data/journey.json`, 'utf8'));
const day = (key) => itinerary.days.find((entry) => entry.key === key);
const stops = (key) => day(key).detail.stops;

test('Osaka is enabled in the journey, between Kioto and the connection note', () => {
  const entry = journey.cities.find(({ id }) => id === 'osaka');
  assert.equal(entry.enabled, true);
  assert.deepEqual([entry.arrivalDate, entry.departureDate], ['2026-12-15', '2026-12-17']);
  const order = journey.cities.map(({ id }) => id);
  assert.equal(order.indexOf('osaka'), order.indexOf('kyoto') + 1);
  const connection = journey.connections.find(({ from, to }) => from === 'kyoto' && to === 'osaka');
  assert.match(connection.note, /Shinsaibashi/);
  assert.match(connection.note, /JR Special Rapid/);
});

test('the hotel marker is The Bridge Hotel Shinsaibashi at verified OpenStreetMap coordinates', () => {
  const hotel = places.find(({ type }) => type === 'hotel');
  assert.equal(hotel.name, 'The Bridge Hotel Shinsaibashi');
  assert.ok(Math.abs(hotel.lat - 34.67377) < 0.0002 && Math.abs(hotel.lng - 135.49813) < 0.0002);
  assert.equal(city.hero.hotel.name, hotel.name);
  assert.equal(city.hero.hotel.mapUrl, 'https://maps.app.goo.gl/ohmM1sY272qXbuhj7');
});

test('every place is in Osaka (coordinates inside the city) and every dated stop is on the map', () => {
  [...places, ...restaurants].forEach(({ id, lat, lng }) => {
    assert.ok(lat > 34.55 && lat < 34.75 && lng > 135.4 && lng < 135.6, `${id} is outside Osaka`);
  });
  const ids = new Set(places.map(({ id }) => id));
  ['dotonbori', 'hozenji', 'shinsaibashisuji', 'osakajo', 'nambayasaka', 'kuromon', 'nipponbashi', 'shinsekai', 'umeda', 'nakanoshima', 'sumiyoshi'].forEach((id) => assert.ok(ids.has(id), id));
});

test("Victor's plan for the 15th is kept exactly (times and order)", () => {
  assert.deepEqual(stops('15').map(({ time, title }) => `${time} ${title.split(' · ')[0].split('.')[0]}`), [
    '15:00–17:00 Llegada desde Kioto, hotel y dejar equipaje',
    '17:00–17:30 Paseo hacia Dotonbori',
    '17:30–18:15 Dotonbori',
    '18:15–18:45 Hozenji Yokocho',
    '18:45–19:30 Shinsaibashi-suji',
    '19:30–21:00 Cena por Dotonbori y paseo nocturno'
  ]);
});

test("Victor's plan for the 16th is kept exactly (times and order)", () => {
  assert.deepEqual(stops('16').map(({ time }) => time), [
    '08:30–09:00', '09:00–10:45', '10:45–11:20', '11:20–11:50', '11:50–12:10', '12:10–13:30',
    '13:30–14:15', '14:15–14:45', '14:45–16:30', '16:30–17:15', '17:15–18:30', '19:00 en adelante'
  ]);
  assert.deepEqual(stops('16').map(({ title }) => title.replace(/^\d\. /, '')), [
    'Desayuno y traslado al castillo', 'Castillo de Osaka', 'Traslado a Namba Yasaka', 'Santuario Namba Yasaka',
    'Paseo hasta Kuromon', 'Mercado Kuromon y comida', 'Nipponbashi · Den Den Town', 'Traslado a Shinsekai',
    'Shinsekai y torre Tsutenkaku', 'Traslado a Umeda', 'Umeda Sky Building', 'Cena y regreso al hotel'
  ]);
  assert.match(stops('16')[1].text, /1\.200 yenes/);
  assert.match(stops('16')[1].text, /17:30/);
  assert.match(stops('16').find(({ time }) => time === '17:15–18:30').text, /22:30/);
});

test('problems with the plan are shown as visible suggestions, never applied silently', () => {
  const suggestions = [...stops('15'), ...stops('16')].filter((stop) => stop.suggestion);
  assert.ok(suggestions.length >= 6);
  assert.ok(stops('16').some(({ suggestion }) => /Orden alternativo \(no aplicado\)/.test(suggestion ?? '')));
  assert.ok(stops('16').some(({ suggestion }) => /Visita extra opcional, Nakanoshima/.test(suggestion ?? '')));
});

test('the extra visits have a clear verdict and are marked optional', () => {
  const byName = Object.fromEntries(extras.items.map((item) => [item.name, item]));
  assert.match(byName['Nakanoshima y Hikari-Renaissance'].desc, /^Cabe/);
  assert.match(byName['Sumiyoshi Taisha'].desc, /^No cabe el día 16/);
  assert.match(places.find(({ id }) => id === 'sumiyoshi').name, /visita extra/);
  assert.match(places.find(({ id }) => id === 'nakanoshima').name, /visita extra/);
  assert.match(day('17').detail.lead, /Borrador/);
});

test('every detail carries sources, and uncertain data is flagged as unverified', () => {
  details.forEach(({ id, sources: list = [], verificationNote }) => {
    assert.ok(list.length > 0, `${id} needs at least one source`);
    list.forEach(({ label, url }) => assert.ok(label && /^https:\/\//.test(url), `${id}: bad source`));
    assert.ok(verificationNote, `${id}: say what is not verified`);
  });
  assert.ok(sources.items.length >= 10);
  assert.match(sources.note, /no se han confirmado/);
  assert.match(food.note.text, /no he confirmado horarios/i);
});

test('restaurants never invent hours or addresses and mark approximate pins', () => {
  restaurants.forEach((restaurant) => {
    assert.ok(restaurant.links.length > 0, `${restaurant.id} needs a source link`);
    assert.doesNotMatch(JSON.stringify(restaurant), /\d{3}-\d{4}-\d{4}/, 'no invented phone numbers');
    assert.ok(restaurant.note, restaurant.id);
  });
  const approximate = restaurants.filter(({ pinApproximate }) => pinApproximate).map(({ id }) => id);
  assert.deepEqual(approximate.sort(), ['food-02', 'food-05', 'food-06']);
  assert.deepEqual([...new Set(restaurants.map(({ foodCategory }) => foodCategory))].sort(), ['dulces', 'kushikatsu', 'mercado', 'oden', 'okonomiyaki', 'takoyaki', 'varios']);
});

test('photos come from the image pipeline: free licences with credits, hotel and Den Den Town without photo', async () => {
  const credits = JSON.parse(await readFile(`${root}data/cities/osaka/image-credits.json`, 'utf8'));
  credits.forEach((credit) => assert.match(credit.license, /public domain|cc0|cc by/i));
  const withPhotos = details.filter(({ photos }) => photos.length);
  assert.ok(withPhotos.length >= 8);
  assert.equal(details.find(({ id }) => id === 'hotel').photos.length, 0);
  assert.equal(credits.length, details.reduce((sum, { photos }) => sum + photos.length, 0));
  for (const { photos } of withPhotos) for (const photo of photos) await access(`${root}${photo.src}`);
  assert.equal(catalog.places.find(({ id }) => id === 'osakajo').files.length, 2);
  assert.ok(!credits.some(({ fileTitle }) => /Azuchi|Tokugawa|近江/.test(fileTitle)), 'wrong castle photos were discarded');
});
