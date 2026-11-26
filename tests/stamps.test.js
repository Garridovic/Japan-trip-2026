import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCollections, stampablePlaces, stampLook, hashId, orderedStamps, percent, SHAPES, MOTIFS } from '../js/modules/stamps.js';

const places = [
  { id: 'hotel', name: 'Hotel', type: 'hotel' },
  { id: 'a', name: 'Lugar A', type: 'itinerary' },
  { id: 'b', name: 'Lugar B', type: 'alternative' },
  { id: 'c', name: 'Lugar C', type: 'event' }
];
const store = (marks) => ({ has: (city, id) => marks.has(`${city}:${id}`) });

test('hotels get no stamp; every other place does', () => {
  assert.deepEqual(stampablePlaces(places).map((p) => p.id), ['a', 'b', 'c']);
});

test('collections count visited places per city and flag a complete city', () => {
  const cities = [{ id: 'kyoto', name: 'Kioto', places }, { id: 'osaka', name: 'Osaka', places: [places[1]] }];
  const [kyoto, osaka] = buildCollections(cities, store(new Set(['kyoto:a', 'osaka:a', 'kyoto:hotel'])));
  assert.deepEqual([kyoto.done, kyoto.total, kyoto.complete], [1, 3, false]);
  assert.deepEqual([osaka.done, osaka.total, osaka.complete], [1, 1, true]);
  assert.equal(percent(kyoto), 33);
  assert.equal(percent({ done: 0, total: 0 }), 0);
});

test('ids that no longer exist in the data are ignored and an empty city is never "complete"', () => {
  const [collection] = buildCollections([{ id: 'kyoto', name: 'Kioto', places }], store(new Set(['kyoto:ghost'])));
  assert.equal(collection.done, 0);
  assert.equal(buildCollections([{ id: 'x', name: 'X', places: [] }], store(new Set()))[0].complete, false);
});

test('earned stamps come first, empty slots after', () => {
  const [collection] = buildCollections([{ id: 'kyoto', name: 'Kioto', places }], store(new Set(['kyoto:c'])));
  assert.deepEqual(orderedStamps(collection).map((s) => s.id), ['c', 'a', 'b']);
});

test('a place always gets the same stamp, with a valid shape, motif and a small tilt', () => {
  assert.equal(hashId('kyoto:a'), hashId('kyoto:a'));
  const seen = new Set();
  for (const id of ['fushimi', 'nishiki', 'nijo', 'kinkaku', 'arashiyama', 'gion', 'kiyomizu', 'osaka-castle']) {
    const look = stampLook('kyoto', id);
    assert.deepEqual(look, stampLook('kyoto', id));
    assert.ok(SHAPES.includes(look.shape) && MOTIFS.includes(look.motif));
    assert.ok(Math.abs(look.tilt) <= 5);
    seen.add(`${look.shape}/${look.motif}`);
  }
  assert.ok(seen.size >= 3, 'stamps vary from place to place');
});

test('stamps are derived only: the module never touches storage, so Auth0 user_metadata is unchanged', () => {
  for (const file of ['stamps.js', 'stamps-ui.js']) {
    const source = readFileSync(new URL(`../js/modules/${file}`, import.meta.url), 'utf8');
    const code = source.replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /localStorage|sessionStorage|setItem|userStorage/, file);
  }
});
