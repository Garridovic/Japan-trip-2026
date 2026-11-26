import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeData, mergeValue, sameData } from '../js/modules/sync-merge.js';
import { SYNCED_KEYS } from '../js/modules/user-data.js';

const V = 'visited-v1';
const F = 'japan-trip:phrase-favorites';
const C = 'checklist-v1';
const json = (value) => JSON.stringify(value);

test('first login (empty base) is a plain union: nothing is lost on either side', () => {
  const merged = mergeData(SYNCED_KEYS, {}, { [V]: json({ kyoto: ['a', 'b'] }), [F]: json(['x']) }, { [V]: json({ kyoto: ['b', 'c'], osaka: ['d'] }), [F]: json(['y']) });
  assert.deepEqual(JSON.parse(merged[V]), { kyoto: ['a', 'b', 'c'], osaka: ['d'] });
  assert.deepEqual(JSON.parse(merged[F]), ['x', 'y']);
});

test('a removal on one side is honoured when the other side did not touch the item', () => {
  const base = { [V]: json({ kyoto: ['a', 'b'] }) };
  const local = { [V]: json({ kyoto: ['a'] }) }; // unmarked b here
  const remote = { [V]: json({ kyoto: ['a', 'b'] }) };
  assert.deepEqual(JSON.parse(mergeData(SYNCED_KEYS, base, local, remote)[V]), { kyoto: ['a'] });
  assert.deepEqual(JSON.parse(mergeData(SYNCED_KEYS, base, remote, local)[V]), { kyoto: ['a'] });
});

test('removed on one side stays removed; removed on both sides is gone; never-seen items are kept', () => {
  assert.deepEqual(JSON.parse(mergeValue(F, json(['x']), json([]), json(['x']))), []);
  assert.deepEqual(JSON.parse(mergeValue(F, json(['x']), json([]), json([]))), []);
  // an item added on one side while the other removed a different one
  assert.deepEqual(JSON.parse(mergeValue(F, json(['x']), json(['x', 'n']), json([]))), ['n']);
});

test('additions on both sides are combined with a non-empty base', () => {
  assert.deepEqual(JSON.parse(mergeValue(F, json(['a']), json(['a', 'b']), json(['a', 'c']))), ['a', 'b', 'c']);
});

test('checklist: checked, removed and custom tasks merge; newer custom text wins for the same id', () => {
  const base = json({ checked: ['pasaporte'], custom: [], removed: [] });
  const local = json({ checked: ['pasaporte', 'cargador'], custom: [{ id: 'c1', text: 'Comprar Suica', group: 'mis', updatedAt: 1 }], removed: [] });
  const remote = json({ checked: ['pasaporte', 'ropa'], custom: [{ id: 'c1', text: 'Comprar Suica ya', group: 'mis', updatedAt: 5 }, { id: 'c2', text: 'Otra', group: 'mis' }], removed: ['seguro'] });
  const merged = JSON.parse(mergeValue(C, base, local, remote));
  assert.deepEqual(merged.checked, ['cargador', 'pasaporte', 'ropa']);
  assert.deepEqual(merged.removed, ['seguro']);
  assert.deepEqual(merged.custom.map((item) => [item.id, item.text]), [['c1', 'Comprar Suica ya'], ['c2', 'Otra']]);
});

test('a custom task deleted on one side stays deleted when the other did not change it', () => {
  const task = { id: 'c1', text: 'x', group: 'mis' };
  const merged = JSON.parse(mergeValue(C, json({ checked: [], custom: [task], removed: [] }), json({ checked: [], custom: [], removed: [] }), json({ checked: [], custom: [task], removed: [] })));
  assert.deepEqual(merged.custom, []);
});

test('corrupt or unknown data is never invented or overwritten', () => {
  assert.equal(mergeValue(V, undefined, '{bad', json({ kyoto: ['a'] })), '{bad');
  assert.equal(mergeValue('other-key', undefined, 'L', 'R'), 'L');
  assert.equal(mergeValue(V, undefined, null, json({ kyoto: ['a'] })), json({ kyoto: ['a'] }));
});

test('only the requested keys are merged and lodging notes never appear', () => {
  const merged = mergeData(SYNCED_KEYS, {}, { 'japan-trip:lodging-private': 'PIN', [F]: json(['a']) }, {});
  assert.deepEqual(Object.keys(merged), [F]);
});

test('sameData ignores key order and whitespace', () => {
  assert.ok(sameData([V], { [V]: '{"a":["x"]}' }, { [V]: '{ "a": ["x"] }' }));
  assert.ok(!sameData([V], { [V]: '{"a":["x"]}' }, { [V]: '{"a":["y"]}' }));
});
