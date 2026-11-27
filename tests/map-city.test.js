import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cityCardInfo, cityChipLabel, SHEETS } from '../js/modules/map-view.js';

const journey = JSON.parse(await readFile(new URL('../data/journey.json', import.meta.url), 'utf8'));
const entry = (id) => journey.cities.find((city) => city.id === id);

test('a city with one stay shows its dates and nights', () => {
  assert.equal(cityCardInfo(entry('kyoto')), '11–15 dic · 4 noches');
  assert.equal(cityCardInfo(entry('hakone')), '10–11 dic · 1 noche');
});

test('Tokio, visited twice, lists both stays', () => {
  assert.equal(cityCardInfo(entry('tokyo')), '8–10 dic · 18–22 dic · 2 estancias');
});

test('a city without dates has no second line', () => {
  assert.equal(cityCardInfo({ id: 'x', name: 'X' }), '');
});

test('the city chip names the active city and says it changes it', () => {
  assert.equal(cityChipLabel('Kioto'), 'Ciudad: Kioto. Cambiar');
  assert.equal(SHEETS.city, 'Ciudad');
});
