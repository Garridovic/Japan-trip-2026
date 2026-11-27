import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { foldRomaji, buildMapIndex, searchPoints, isSearchable } from '../js/modules/map-search.js';

const read = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
const cities = ['kyoto', 'osaka', 'nara', 'tokyo', 'hakone'];
const points = [];
for (const city of cities) {
  points.push(...await read(`data/cities/${city}/places.json`));
  points.push(...(await read(`data/cities/${city}/restaurants.json`)).map((r) => ({ ...r, type: 'restaurant' })));
}
const kyotoPoints = [...await read('data/cities/kyoto/places.json'), ...(await read('data/cities/kyoto/restaurants.json')).map((r) => ({ ...r, type: 'restaurant' }))];
const kyoto = buildMapIndex(kyotoPoints);
const names = (index, query) => (searchPoints(index, query) ?? []).map((point) => point.name);
const finds = (index, query, name) => assert.ok(names(index, query).some((found) => found.includes(name)), `«${query}» should find «${name}»: ${names(index, query).slice(0, 5)}`);

test('romaji spellings fold to the same key', () => {
  assert.equal(foldRomaji('Ryōan-ji'), foldRomaji('ryouanji'));
  assert.equal(foldRomaji('Tō-ji'), foldRomaji('touji'));
  assert.equal(foldRomaji('Shinjuku'), foldRomaji('sinzyuku'));
  assert.equal(foldRomaji('Pontochō'), foldRomaji('pontochou'));
  assert.equal(foldRomaji('Kiyomizu-dera'), foldRomaji('kiyomizudera'));
});

test('too short or empty queries mean "no search"', () => {
  for (const query of ['', ' ', 'a', ' k ']) { assert.equal(isSearchable(query), false); assert.equal(searchPoints(kyoto, query), null); }
  assert.equal(isSearchable('ra'), true);
});

test('finds places despite typos and alternative romaji spellings', () => {
  finds(kyoto, 'kinkakuji', 'Kinkaku-ji');
  finds(kyoto, 'kinkakugi', 'Kinkaku-ji'); // one wrong letter
  finds(kyoto, 'kiyomisu dera', 'Kiyomizu-dera');
  finds(kyoto, 'fushimi inary', 'Fushimi Inari');
  finds(kyoto, 'fusimi inari', 'Fushimi Inari'); // si/shi
  finds(kyoto, 'ryouanji', 'Ryoan-ji'); // ou/ō
  finds(kyoto, 'touji', 'Tō-ji');
  finds(kyoto, 'nijyo', 'Nij');
  finds(kyoto, 'kodaiji', 'Kōdai-ji');
  finds(kyoto, 'pontochou', 'Pontocho');
  finds(kyoto, 'arashiyma', 'Arashiyama'); // letters swapped or lost
  finds(kyoto, 'KINKAKU', 'Kinkaku-ji'); // case
});

test('category words find the Japanese endings: «templo» -dera / -ji, «santuario» -jinja, «castillo» -jo', () => {
  for (const name of ['Kinkaku-ji', 'Ryoan-ji', 'Kiyomizu-dera']) finds(kyoto, 'templo', name);
  finds(kyoto, 'tmplo', 'Kinkaku-ji'); // with a typo too
  finds(kyoto, 'santuario', 'Santuario Yasaka');
  finds(kyoto, 'castillo', 'Nij');
});

test('a short query is exact, a long one tolerates typos, and unrelated text matches nothing', () => {
  assert.deepEqual(names(kyoto, 'zzzz'), []);
  assert.deepEqual(names(kyoto, 'xqzj kwv'), []);
  assert.equal(isSearchable('ji'), true); // 2 letters are searched, but exactly: no typo tolerance below 4 letters
});

test('every term must match, in any order', () => {
  finds(kyoto, 'inari fushimi', 'Fushimi Inari');
  assert.deepEqual(names(kyoto, 'fushimi zzzzzz'), []);
});

test('name matches come before description-only matches', () => {
  const sample = buildMapIndex([
    { id: 'a', name: 'Parque grande', desc: 'Cerca del templo Kinkaku' },
    { id: 'b', name: 'Kinkaku-ji', desc: 'Pabellón de Oro' }
  ]);
  assert.deepEqual(names(sample, 'kinkaku'), ['Kinkaku-ji', 'Parque grande']);
});

test('works with the points of every city', () => {
  const all = buildMapIndex(points);
  finds(all, 'sensouji', 'Sensō-ji');
  finds(all, 'meiji jingu', 'Meiji');
  assert.ok(names(all, 'templo').length > 5);
});
