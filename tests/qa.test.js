import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { distanceKm, distanceIfFarFromCity, formatFarDistance, NEAR_CITY_KM } from '../js/modules/geo.js';
import { editDistance, fuzzyIncludes, filterDishes } from '../js/modules/dishes.js';
import { initCollapsibles } from '../js/modules/collapsible.js';

const dishes = JSON.parse(await readFile(fileURLToPath(new URL('../data/global/dishes.json', import.meta.url)), 'utf8')).dishes;
const KYOTO = [35.0116, 135.7681];

test('distance helpers', () => {
  assert.ok(Math.abs(distanceKm({ lat: 35.0116, lng: 135.7681 }, { lat: 35.6762, lng: 139.6503 }) - 370) < 15);
  assert.equal(distanceIfFarFromCity({ lat: 35.01, lng: 135.77 }, KYOTO), null);
  assert.equal(distanceIfFarFromCity({ lat: 34.99, lng: 135.80 }, KYOTO), null);
  const tokyo = distanceIfFarFromCity({ lat: 35.6762, lng: 139.6503 }, KYOTO);
  assert.ok(tokyo > NEAR_CITY_KM && tokyo < 400);
  assert.match(formatFarDistance(365.4), /^365 km$/);
  assert.equal(distanceIfFarFromCity({ lat: 34.69, lng: 135.5 }, KYOTO), null, 'Osaka is about 40 km away: still near');
});

test('edit distance and fuzzy matching', () => {
  assert.equal(editDistance('sasimi', 'sashimi'), 1);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(fuzzyIncludes('sashimisashimi', 'sasimi'), true);
  assert.equal(fuzzyIncludes('ramenramen', 'sushi'), false);
  assert.equal(fuzzyIncludes('ramen', 'ab'), false, 'very short terms never match fuzzily');
});

test('dish search tolerates typos and accents, but prefers exact matches', () => {
  const ids = (query) => filterDishes(dishes, { query }).map(({ id }) => id);
  assert.ok(ids('sasimi').includes('sashimi'));
  assert.ok(ids('tonkatzu').includes('tonkatsu'));
  assert.ok(ids('okonomyaki').includes('okonomiyaki'));
  assert.ok(ids('Ramén').includes('ramen'));
  assert.deepEqual(ids('zzzzzz'), []);
  assert.deepEqual(ids('tsukemen'), ['tsukemen'], 'an exact match does not drag in fuzzy ones');
});

test('dish photos have short Spanish alt text without licence text', () => {
  dishes.flatMap(({ photos }) => photos).forEach(({ alt }) => {
    assert.match(alt, /^Foto de /);
    assert.ok(alt.length < 70, alt);
    assert.doesNotMatch(alt, /licen|CC BY|free picture|created by/i);
  });
});

test('collapsible filters start open on wide screens and closed on phones', () => {
  const make = () => { const el = { open: null }; return { el, doc: { querySelectorAll: () => [el] } }; };
  const wide = make();
  initCollapsibles({ matchMedia: () => ({ matches: true }) }, wide.doc);
  assert.equal(wide.el.open, true);
  const narrow = make();
  initCollapsibles({ matchMedia: () => ({ matches: false }) }, narrow.doc);
  assert.equal(narrow.el.open, false);
});

test('Sannenzaka never uses the information board as its photo', async () => {
  const catalog = JSON.parse(await readFile(fileURLToPath(new URL('../data/cities/kyoto/image-catalog.json', import.meta.url)), 'utf8'));
  const entry = catalog.places.find(({ id }) => id === 'sannenzaka');
  assert.ok(entry.exclude.includes('File:Sanneizaka board.JPG'));
});
