import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { suggestiblePlaces, pickSuggestion, pruneRecords, parseRecords, dayKey, placeKey, SUGGESTIBLE_KINDS, DEFAULT_RADIUS_M, MAX_ACCURACY_M } from '../js/modules/proximity.js';

const fushimi = { id: 'fushimi', name: 'Fushimi', lat: 34.96754, lng: 135.77944, type: 'itinerary', proximity: { kind: 'temple', radius: 400 } };
const kodaiji = { id: 'kodaiji', name: 'Kōdai-ji', lat: 35.00032, lng: 135.78135, type: 'itinerary', proximity: { kind: 'temple' } };
const candidates = suggestiblePlaces('kyoto', [fushimi, kodaiji]);
const never = () => false;
// ~metres north of a point (1 degree of latitude ≈ 111.19 km)
const north = (place, metres, accuracy = 20) => ({ lat: place.lat + metres / 111_195, lng: place.lng, accuracy });

test('a place inside its radius is suggested, one outside is not (Haversine, same as "Cerca de mí")', () => {
  assert.equal(pickSuggestion({ position: north(kodaiji, 60), candidates, isVisited: never })?.id, 'kodaiji');
  assert.equal(pickSuggestion({ position: north(kodaiji, 140), candidates, isVisited: never }), null);
});

test('the default radius is 100 m and a per-place radius widens it for big grounds', () => {
  assert.equal(candidates.find((c) => c.id === 'kodaiji').radius, DEFAULT_RADIUS_M);
  assert.equal(candidates.find((c) => c.id === 'fushimi').radius, 400);
  assert.equal(pickSuggestion({ position: north(fushimi, 350), candidates, isVisited: never })?.id, 'fushimi');
  assert.equal(pickSuggestion({ position: north(fushimi, 450), candidates, isVisited: never }), null);
});

test('only the nearest place is offered when several are in range', () => {
  const a = { id: 'a', name: 'A', lat: 35, lng: 135, proximity: { kind: 'park', radius: 300 } };
  const b = { id: 'b', name: 'B', lat: 35 + 100 / 111_195, lng: 135, proximity: { kind: 'museum', radius: 300 } };
  const list = suggestiblePlaces('kyoto', [a, b]);
  assert.equal(pickSuggestion({ position: { lat: 35 + 90 / 111_195, lng: 135, accuracy: 10 }, candidates: list, isVisited: never }).id, 'b');
  assert.equal(pickSuggestion({ position: { lat: 35 + 20 / 111_195, lng: 135, accuracy: 10 }, candidates: list, isVisited: never }).id, 'a');
});

test('visited places are never suggested, and the next nearest is offered instead', () => {
  const visited = (cityId, id) => id === 'kodaiji';
  assert.equal(pickSuggestion({ position: north(kodaiji, 10), candidates, isVisited: visited }), null);
});

test('a place already offered today is silent until the next day', () => {
  const prompted = { [placeKey('kyoto', 'kodaiji')]: '2026-12-12' };
  const position = north(kodaiji, 10);
  assert.equal(pickSuggestion({ position, candidates, isVisited: never, prompted, today: '2026-12-12' }), null);
  assert.equal(pickSuggestion({ position, candidates, isVisited: never, prompted, today: '2026-12-13' })?.id, 'kodaiji');
  assert.equal(pickSuggestion({ position, candidates, isVisited: never, prompted: new Map(Object.entries(prompted)), today: '2026-12-12' }), null);
});

test('imprecise or invalid positions are ignored', () => {
  assert.equal(pickSuggestion({ position: north(kodaiji, 10, MAX_ACCURACY_M + 1), candidates, isVisited: never }), null);
  assert.equal(pickSuggestion({ position: north(kodaiji, 10, MAX_ACCURACY_M), candidates, isVisited: never })?.id, 'kodaiji');
  for (const bad of [null, {}, { lat: 35, lng: 135 }, { lat: NaN, lng: 135, accuracy: 5 }, { lat: 35, lng: 135, accuracy: NaN }]) {
    assert.equal(pickSuggestion({ position: bad, candidates, isVisited: never }), null, JSON.stringify(bad));
  }
});

test('hotels, restaurants, markets, events and anything without a trusted kind are never candidates', () => {
  const at = { lat: 35, lng: 135 };
  const items = [
    { id: 'hotel', type: 'hotel', ...at, proximity: { kind: 'temple' } },
    { id: 'restaurant', type: 'restaurant', ...at, proximity: { kind: 'restaurant' } },
    { id: 'market', type: 'itinerary', ...at, proximity: { kind: 'market' } },
    { id: 'plain', type: 'itinerary', ...at },
    { id: 'event', type: 'event', ...at, proximity: { kind: 'event' } },
    { id: 'ok', type: 'itinerary', ...at, proximity: { kind: 'museum' } }
  ];
  assert.deepEqual(suggestiblePlaces('kyoto', items).map((c) => c.id), ['ok']);
  assert.equal(suggestiblePlaces('kyoto', undefined).length, 0);
});

test('remembered records keep only today and survive corrupt storage', () => {
  assert.deepEqual(pruneRecords({ a: '2026-12-11', b: '2026-12-12' }, '2026-12-12'), { b: '2026-12-12' });
  for (const raw of [null, '', 'nope', '[]', '"x"', '{"a":3}']) assert.deepEqual(parseRecords(raw), {}, String(raw));
  assert.equal(dayKey(new Date(2026, 11, 5)), '2026-12-05');
});

test('real data: every suggestible place has a trusted kind and a sensible radius, and none is a hotel, event or restaurant', () => {
  const root = new URL('../data/cities/', import.meta.url);
  let marked = 0;
  for (const city of readdirSync(root)) {
    const places = JSON.parse(readFileSync(new URL(`${city}/places.json`, root), 'utf8'));
    const restaurants = JSON.parse(readFileSync(new URL(`${city}/restaurants.json`, root), 'utf8'));
    const restaurantIds = new Set(restaurants.map(({ id }) => id));
    for (const place of places.filter((p) => p.proximity)) {
      marked += 1;
      assert.ok(SUGGESTIBLE_KINDS.includes(place.proximity.kind), `${city}/${place.id}: kind ${place.proximity.kind}`);
      assert.ok(!['hotel', 'event', 'restaurant'].includes(place.type), `${city}/${place.id} has type ${place.type}`);
      assert.ok(!restaurantIds.has(place.id), `${city}/${place.id} is also a restaurant`);
      const radius = place.proximity.radius ?? DEFAULT_RADIUS_M;
      assert.ok(radius >= 50 && radius <= 500, `${city}/${place.id}: radius ${radius}`);
    }
    const candidates = suggestiblePlaces(city, places);
    assert.equal(candidates.length, places.filter((p) => p.proximity).length);
    for (const restaurant of restaurants) {
      const hit = pickSuggestion({ position: { lat: restaurant.lat, lng: restaurant.lng, accuracy: 5 }, candidates: candidates.filter((c) => c.id === restaurant.id), isVisited: never });
      assert.equal(hit, null, `${city}: restaurant ${restaurant.id} must not be suggested`);
    }
  }
  assert.ok(marked >= 20);
});
