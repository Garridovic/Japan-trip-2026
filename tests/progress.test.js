import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, TIERS, tripSpan, computeProgress } from '../js/modules/progress.js';
import { filterDishes, TRIED } from '../js/modules/dishes.js';
import { mergeValue } from '../js/modules/sync-merge.js';

const cities = [
  { id: 'tokyo', name: 'Tokio', arrivalDate: '2026-12-08', departureDate: '2026-12-22' },
  { id: 'kyoto', name: 'Kioto', arrivalDate: '2026-12-11', departureDate: '2026-12-15' },
  { id: 'osaka', name: 'Osaka', arrivalDate: '2026-12-15', departureDate: '2026-12-17' }
];
const kyotoPlaces = [
  { id: 'hotel', type: 'hotel' },
  { id: 'a', type: 'itinerary', day: '11' }, { id: 'b', type: 'itinerary', day: '11', stamp: { kind: 'goshuin', source: 'x' } },
  { id: 'c', type: 'itinerary', day: '12' }, { id: 'd', type: 'alternative' }
];
const base = { cities, cityId: 'kyoto', totals: { tokyo: { visitable: 0, stamps: 0 }, kyoto: { visitable: 4, stamps: 1 }, osaka: { visitable: 3, stamps: 1 } }, placesByCity: new Map([['kyoto', kyotoPlaces]]), dishes: { total: 56, tried: 5, favorites: 4 }, phrasesFavorites: 3, checklist: { done: 19, total: 22 } };

test('tiers: grey, amber, gold, light green, green; never red; no goal means no colour', () => {
  assert.equal(tierOf(0, 12), TIERS.none);
  assert.equal(tierOf(3, 12), TIERS.start);
  assert.equal(tierOf(6, 12), TIERS.half);
  assert.equal(tierOf(10, 12), TIERS.almost);
  assert.equal(tierOf(12, 12), TIERS.done);
  assert.equal(tierOf(0, 0), TIERS.neutral);
  assert.equal(tierOf(49, 100).id, 'start');
  assert.equal(tierOf(50, 100).id, 'half');
  assert.equal(tierOf(80, 100).id, 'almost');
});

test('the trip spans the first arrival to the last departure', () => {
  assert.deepEqual(tripSpan(cities), { start: '2026-12-08', end: '2026-12-22' });
  assert.equal(tripSpan([]), null);
});

test('before the trip the card is about preparing: checklist ring, countdown, nothing invented', () => {
  const result = computeProgress({ ...base, now: new Date(2026, 10, 27, 10) });
  assert.equal(result.mode, 'before');
  assert.deepEqual([result.ring.done, result.ring.total, result.ring.tier.id], [19, 22, 'almost']);
  assert.match(result.sub, /Faltan 3 tareas · 11 días para salir/);
  assert.equal(result.nudge, ''); // the countdown and the pending tasks are already in the line above
  assert.deepEqual(result.tiles.map((tile) => tile.id), ['sellos', 'platos', 'guardados']);
  assert.equal(result.tiles.find((tile) => tile.id === 'guardados').done, 7); // 4 dishes + 3 phrases, no colour
  assert.equal(result.tiles.find((tile) => tile.id === 'guardados').tier, TIERS.neutral);
});

test('during the trip: places of the city (hotels never count), stamps against the possible ones, today\'s stops', () => {
  const visited = new Map([['kyoto', new Set(['a', 'c'])], ['tokyo', new Set(['x'])]]);
  const result = computeProgress({ ...base, now: new Date(2026, 11, 13, 10), visited, todayKey: '11', stampEntries: [{ id: 's1' }, { id: 's2' }] });
  assert.equal(result.mode, 'during');
  assert.deepEqual([result.ring.done, result.ring.total], [2, 4]); // a, b, c, d are visitable; the hotel is not
  assert.equal(result.headline, '2 lugares en Kioto');
  assert.match(result.sub, /Día 6 de 15/);
  const tile = (id) => result.tiles.find((item) => item.id === id);
  assert.deepEqual([tile('hoy').done, tile('hoy').total], [1, 2]);
  assert.deepEqual([tile('sellos').done, tile('sellos').total], [2, 2]); // goal = stamps of every city (1 Kioto + 1 Osaka), never above it
  assert.deepEqual([tile('ciudades').done, tile('ciudades').total], [2, 3]);
  assert.match(result.nudge, /Te falta 1 parada/);
});

test('a city with no visitable places (only a hotel) shows the trip total instead of an empty ring', () => {
  const result = computeProgress({ ...base, cityId: 'tokyo', now: new Date(2026, 11, 9, 10), visited: new Map([['kyoto', new Set(['a'])]]) });
  assert.deepEqual([result.ring.done, result.ring.total], [1, 7]); // Kioto 4 + Osaka 3
  assert.equal(result.headline, '1 lugar del viaje');
});

test('everything visited turns the headline into a celebration', () => {
  const visited = new Map([['kyoto', new Set(['a', 'b', 'c', 'd'])]]);
  const result = computeProgress({ ...base, now: new Date(2026, 11, 13, 10), visited });
  assert.equal(result.headline, '¡Kioto completado!');
  assert.equal(result.ring.tier, TIERS.done);
});

test('after the trip the card says it is over and keeps the figures', () => {
  const result = computeProgress({ ...base, now: new Date(2026, 11, 30, 10) });
  assert.equal(result.mode, 'after');
  assert.match(result.sub, /Viaje terminado/);
});

test('"Lo probé": the Probados filter keeps only tried dishes and is its own key', () => {
  const dishes = [{ id: 'a', es: 'Ramen', ja: 'ラーメン', romaji: 'ramen', category: 'x', protein: 'carne' }, { id: 'b', es: 'Sushi', ja: '寿司', romaji: 'sushi', category: 'x', protein: 'pescado' }];
  assert.deepEqual(filterDishes(dishes, { category: TRIED, tried: new Set(['b']) }).map((dish) => dish.id), ['b']);
  assert.deepEqual(filterDishes(dishes, { category: TRIED, tried: new Set() }), []);
});

test('tried dishes from two devices are merged as a union and a removal sticks', () => {
  const merged = mergeValue('japan-trip:dish-tried', '["a","b"]', '["a","b","c"]', '["a"]');
  assert.deepEqual(JSON.parse(merged), ['a', 'c']);
});

test('the stamp goal is the same whichever city is open (no jump when the other cities load)', () => {
  const total = (cityId, placesByCity) => computeProgress({ ...base, cityId, placesByCity, now: new Date(2026, 11, 13, 10), stampEntries: [] }).tiles.find((tile) => tile.id === 'sellos').total;
  assert.equal(total('kyoto', new Map([['kyoto', kyotoPlaces]])), 2);
  assert.equal(total('osaka', new Map()), 2);
  assert.equal(total('tokyo', new Map()), 2);
});
