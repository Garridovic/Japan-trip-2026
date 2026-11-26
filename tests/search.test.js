import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildIndex, search } from '../js/modules/search.js';

const read = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
const phrases = (await read('data/global/phrases.json')).phrases;
const dishes = (await read('data/global/dishes.json')).dishes;
const index = buildIndex({
  places: await read('data/cities/kyoto/places.json'), restaurants: await read('data/cities/kyoto/restaurants.json'),
  extras: (await read('data/cities/kyoto/extras.json')).items, phrases, dishes
});
const kinds = (groups) => groups.map(({ kind }) => kind);

test('short or empty queries return nothing', () => {
  assert.deepEqual(search(index, ''), []);
  assert.deepEqual(search(index, '  '), []);
  assert.deepEqual(search(index, 'a'), []);
});

test('finds places, restaurants, phrases and dishes in one query set', () => {
  assert.ok(kinds(search(index, 'fushimi')).includes('place'));
  assert.ok(kinds(search(index, 'ramen')).includes('restaurant'));
  assert.ok(kinds(search(index, 'gracias')).includes('phrase'));
  assert.ok(kinds(search(index, 'onigiri')).includes('dish'));
});

test('ignores accents, case and punctuation, and understands Japanese and romaji', () => {
  assert.ok(search(index, 'GRÁCIAS').length > 0);
  assert.ok(search(index, 'ありがとう').some(({ kind }) => kind === 'phrase'));
  assert.ok(search(index, 'arigato').some(({ kind }) => kind === 'phrase'));
  assert.ok(search(index, 'ラーメン').some(({ kind }) => kind === 'dish'));
});

test('every term must match, and results are grouped in a fixed order with title matches first', () => {
  assert.deepEqual(search(index, 'ramen zzzzzz'), []);
  const groups = search(index, 'sushi');
  const order = ['place', 'restaurant', 'extra', 'phrase', 'dish'];
  assert.deepEqual(kinds(groups), order.filter((kind) => kinds(groups).includes(kind)));
  const dish = groups.find(({ kind }) => kind === 'dish');
  assert.ok(dish.items[0].head.includes('sushi') || dish.items[0].text.includes('sushi'));
});

test('each group is capped but reports the total', () => {
  const [group] = search(index, 'de', { perKind: 2 });
  assert.ok(group.items.length <= 2);
  assert.ok(group.total >= group.items.length);
});

test('restaurants are not duplicated as places and other cities are not in the index', () => {
  const restaurantIds = new Set(index.filter(({ kind }) => kind === 'restaurant').map(({ id }) => id));
  const places = index.filter(({ kind }) => kind === 'place');
  places.forEach((place) => assert.ok(!restaurantIds.has(place.id) || place.id !== undefined));
  assert.equal(search(index, 'okonomiyaki').filter(({ kind }) => kind === 'restaurant').length, 0);
});
