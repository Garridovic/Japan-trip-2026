import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateTips, groupTips } from '../js/modules/tips.js';
import { validatePhrases } from '../js/modules/phrases.js';

const read = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
const global = await read('data/global/tips.json');
const journey = await read('data/journey.json');
const cities = journey.cities.filter(({ enabled }) => enabled);
// A city without friend tips yet (for example Tokyo, which only has extras) simply has no tips.json, as in the app.
const cityTips = new Map((await Promise.all(cities.map(async ({ id }) =>
  [id, await read(`data/cities/${id}/tips.json`).catch(() => null)]))).filter(([, data]) => data));

test('the real tips data is valid (categories, unique ids, texts, https links, sources)', () => {
  assert.deepEqual(validateTips(global.practical, cityTips), []);
});

// Tips are advice from friends, so a city only has a tips file once someone has given tips for it (Hakone and Nara have none yet).
test('every city tips file that exists has tips', () => {
  for (const [id, data] of cityTips) assert.ok(data?.items?.length > 0, `${id} has no tips`);
});

test('global tips are not repeated inside a city file and vice versa', () => {
  const titles = new Set(global.practical.items.map(({ title }) => title));
  const texts = new Set(global.practical.items.map(({ text }) => text));
  for (const [id, { items }] of cityTips) items.forEach((item) => {
    assert.ok(!titles.has(item.title) && !texts.has(item.text), `${id}/${item.id} duplicates a global tip`);
  });
});

test('the original four guide tips are untouched', () => {
  assert.equal(global.items.length, 4);
  assert.ok(global.title && global.kicker);
});

test('data facts that need checking are flagged, and everything is attributed to a friend', () => {
  const verify = new Set(global.practical.items.filter(({ verify }) => verify).map(({ id }) => id));
  ['sim', 'jr-pass', 'horarios-tiendas', 'goshuin'].forEach((id) => assert.ok(verify.has(id), `${id} should say "confirm before going"`));
  [...global.practical.items, ...[...cityTips.values()].flatMap(({ items }) => items)].forEach(({ source }) => assert.equal(source, 'Consejo de un amigo'));
});

test('city tips mention only their own city', () => {
  const kyoto = JSON.stringify(cityTips.get('kyoto'));
  const osaka = JSON.stringify(cityTips.get('osaka'));
  assert.ok(!/osaka|okonomiyaki/i.test(kyoto));
  assert.ok(!/kioto|fushimi|maiko/i.test(osaka));
});

test('validateTips reports each kind of problem', () => {
  const bad = { kicker: 'k', title: 't', categories: [{ id: 'a', label: 'A' }], items: [
    { id: 'x', category: 'zzz', title: 't', text: '', source: 's', links: [{ label: 'l', href: 'http://insecure' }] },
    { id: 'x', category: 'a', title: 't', text: 't', source: 's' }
  ] };
  const problems = validateTips(bad).join('\n');
  assert.match(problems, /unknown category zzz/);
  assert.match(problems, /missing text/);
  assert.match(problems, /must be https/);
  assert.match(problems, /duplicate id/);
});

test('groupTips: global categories first, then cities in journey order, empty groups dropped', () => {
  const groups = groupTips(global.practical, cityTips, cities);
  assert.deepEqual(groups.map(({ id }) => id), ['etiqueta', 'antes-y-durante', 'city-kyoto', 'city-osaka']);
  assert.deepEqual(groupTips(global.practical, new Map([['osaka', cityTips.get('osaka')]]), cities).map(({ id }) => id).slice(-1), ['city-osaka']);
});

test('«ki o tsukete» is in the phrases and the phrase data is still valid', async () => {
  const phrases = await read('data/global/phrases.json');
  assert.deepEqual(validatePhrases(phrases), []);
  assert.ok(phrases.phrases.some(({ id, romaji }) => id === 'ki-o-tsukete' && romaji === 'ki o tsukete'));
});
