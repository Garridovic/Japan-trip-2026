import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ALLERGEN_ICONS } from '../js/modules/allergen-icons.js';

const dishes = JSON.parse(await readFile(new URL('../data/global/dishes.json', import.meta.url), 'utf8'));

test('every allergen the dishes can declare has an icon', () => {
  Object.keys(dishes.allergenLabels).forEach((key) => assert.ok(ALLERGEN_ICONS[key]?.length > 0, key));
});

test('no icon exists for an allergen the data does not know about', () => {
  Object.keys(ALLERGEN_ICONS).forEach((key) => assert.ok(dishes.allergenLabels[key], key));
});
