import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { totalsOf } from '../scripts/progress-index.js';

const read = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));

test('totalsOf counts visitable places (no hotels) and places with a confirmed stamp', () => {
  assert.deepEqual(totalsOf([{ type: 'hotel' }, { type: 'itinerary' }, { type: 'alternative', stamp: { kind: 'goshuin' } }, { type: 'event', stamp: { kind: 'otro' } }]), { visitable: 3, stamps: 1 });
  assert.deepEqual(totalsOf(undefined), { visitable: 0, stamps: 0 });
});

test('data/global/progress-index.json is up to date with every city (run `npm run build:offline` after changing places)', async () => {
  const index = await read('data/global/progress-index.json');
  const ids = (await readdir(new URL('../data/cities', import.meta.url), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(Object.keys(index.cities).sort(), ids);
  for (const id of ids) assert.deepEqual(index.cities[id], totalsOf(await read(`data/cities/${id}/places.json`)), `${id} totals are stale`);
});
