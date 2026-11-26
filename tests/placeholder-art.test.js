import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ART, foodArtKind, extraArtKind, artTone } from '../js/modules/placeholder-art.js';

const read = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
const journey = await read('data/journey.json');
const cities = journey.cities.filter(({ enabled }) => enabled).map(({ id }) => id);

test('every kind has shapes, and every shape uses a known style class and element', () => {
  for (const [kind, shapes] of Object.entries(ART)) {
    assert.ok(shapes.length >= 2, kind);
    shapes.forEach(([tag, attrs]) => {
      assert.ok(['path', 'circle', 'rect', 'line', 'ellipse'].includes(tag), `${kind}: ${tag}`);
      if (tag !== 'line' || attrs.class) assert.ok(['s', 'f', 'w', 'g'].includes(attrs.class ?? 's'), `${kind}: class ${attrs.class}`);
    });
  }
});

test('restaurants map to the right drawing by what they serve', () => {
  const pick = (foodTypeLabel, foodCategory = 'x') => foodArtKind({ foodTypeLabel, foodCategory });
  assert.equal(pick('Ramen · comida informal'), 'noodles');
  assert.equal(pick('Nishin soba · especialidad histórica'), 'noodles');
  assert.equal(pick('Saba-zushi · sushi tradicional'), 'sushi');
  assert.equal(pick('Gyukatsu · ternera empanada'), 'cutlet');
  assert.equal(pick('Yakitori · pollo a la brasa'), 'skewer');
  assert.equal(pick('Kushikatsu · Shinsekai'), 'skewer');
  assert.equal(pick('Gyoza · izakaya informal'), 'dumpling');
  assert.equal(pick('Oden · Dotonbori'), 'pot');
  assert.equal(pick('Takoyaki · Dotonbori'), 'balls');
  assert.equal(pick('Okonomiyaki · Dotonbori'), 'pancake');
  assert.equal(pick('Matcha · parfaits y té'), 'tea');
  assert.equal(pick('Café · pausa junto al río'), 'cup');
  assert.equal(pick('Curry japonés · comida rápida'), 'curry');
  assert.equal(pick('Mercado · bocados locales'), 'market');
  assert.equal(pick('Obanzai · izakaya'), 'tray');
  assert.equal(pick('Algo raro', 'carne'), 'cutlet');
  assert.equal(pick('Algo raro'), 'rice');
});

test('places map by category with a pin as the fallback', () => {
  assert.equal(extraArtKind({ category: 'templos' }), 'temple');
  assert.equal(extraArtKind({ category: 'naturaleza' }), 'mountain');
  assert.equal(extraArtKind({ category: 'cultura' }), 'pagoda');
  assert.equal(extraArtKind({ category: 'barrios' }), 'street');
  assert.equal(extraArtKind({ category: 'extra' }), 'pin');
  assert.equal(extraArtKind({}), 'pin');
});

test('every real restaurant and extra place resolves to a drawing that exists', async () => {
  for (const city of cities) {
    for (const item of await read(`data/cities/${city}/restaurants.json`)) assert.ok(ART[foodArtKind(item)], `${city}/${item.id}`);
    const extras = await read(`data/cities/${city}/extras.json`).catch(() => ({ items: [] }));
    for (const item of extras.items ?? []) assert.ok(ART[extraArtKind(item)], `${city}/${item.name}`);
  }
});

test('every kind has a tone and no kind is orphaned', () => {
  Object.keys(ART).forEach((kind) => assert.ok(['warm', 'ok', 'net', 'warn'].includes(artTone(kind)), kind));
});
