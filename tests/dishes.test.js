import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { validateDishes, filterDishes, matchesDishQuery, FAVORITES } from '../js/modules/dishes.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(`${root}${path}`, 'utf8'));
const data = await readJson('data/global/dishes.json');
const credits = await readJson('data/global/dish-credits.json');
const catalog = await readJson('data/global/dish-catalog.json');
const byId = (id) => data.dishes.find((dish) => dish.id === id);
const fileExists = (src) => existsSync(`${root}${src}`);

test('the dishes dataset is valid, with local photos that have credits', () => {
  assert.deepEqual(validateDishes(data, credits, fileExists), []);
  assert.ok(data.dishes.length >= 55);
});

test('every dish has a catalog entry and the catalog has no unknown dishes', () => {
  assert.deepEqual(catalog.dishes.map(({ id }) => id).sort(), data.dishes.map(({ id }) => id).sort());
});

test('photos are only from reusable licences and carry attribution', () => {
  assert.ok(credits.length >= 40, 'most dishes should have a photo');
  credits.forEach((credit) => {
    assert.match(credit.license, /public domain|cc0|cc by/i, `${credit.dishId}: ${credit.license}`);
    assert.match(credit.sourcePage, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(credit.author);
  });
});

test('sweets and drinks are out of scope for now', () => {
  const ids = data.dishes.map(({ id }) => id);
  ['mochi', 'matcha', 'sake', 'ramune'].forEach((id) => assert.ok(!ids.includes(id), id));
});

test('validation reports broken dishes', () => {
  const broken = structuredClone(data);
  broken.dishes[0].protein = 'bad';
  broken.dishes[1].allergens = ['nope'];
  broken.dishes[2].id = broken.dishes[3].id;
  broken.dishes[4].photos = [{ src: 'assets/images/dishes/missing.webp', alt: '' }];
  const problems = validateDishes(broken, credits, fileExists).join('\n');
  assert.match(problems, /invalid protein/);
  assert.match(problems, /unknown allergen nope/);
  assert.match(problems, /duplicate id/);
  assert.match(problems, /missing photo file/);
  assert.match(problems, /without alt text/);
});

test('search finds dishes by Spanish, Japanese and romaji, ignoring accents and spacing', () => {
  assert.equal(matchesDishQuery(byId('ramen'), 'ラーメン'), true);
  assert.equal(matchesDishQuery(byId('tonkatsu'), 'TON katsu'), true);
  assert.equal(matchesDishQuery(byId('tonkatsu'), 'cerdo'), true);
  assert.equal(matchesDishQuery(byId('shabu-shabu'), 'shabushabu'), true);
  assert.equal(matchesDishQuery(byId('kare-raisu'), 'kare raisu'), true);
  assert.equal(matchesDishQuery(byId('ramen'), 'sushi'), false);
});

test('filters combine category, ingredient and favourites', () => {
  assert.ok(filterDishes(data.dishes, { category: 'fideos' }).every(({ category }) => category === 'fideos'));
  const fish = filterDishes(data.dishes, { protein: 'pescado' });
  assert.ok(fish.length > 3 && fish.every(({ protein }) => protein === 'pescado'));
  assert.deepEqual(filterDishes(data.dishes, { category: 'fideos', protein: 'carne', query: 'tsukemen' }).map(({ id }) => id), ['tsukemen']);
  assert.deepEqual(filterDishes(data.dishes, { category: FAVORITES, favorites: new Set(['ramen']) }).map(({ id }) => id), ['ramen']);
});

test('Osaka and Kyoto specialities are flagged', () => {
  assert.equal(byId('okonomiyaki').region, 'Osaka');
  assert.equal(byId('takoyaki').region, 'Osaka');
  assert.equal(byId('yudofu').region, 'Kioto');
});
