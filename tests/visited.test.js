import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitedStore, parseVisited, serializeVisited, countVisited, isVisitable, VISITED_KEY } from '../js/modules/visited.js';

const memoryStorage = (initial) => {
  const data = initial === undefined ? {} : { [VISITED_KEY]: initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
};

test('corrupt, missing or odd stored data starts empty instead of breaking the page', () => {
  for (const raw of [null, '', 'not json', '[]', '"x"', '{"kyoto": 3}']) assert.equal(parseVisited(raw).size, 0, String(raw));
  assert.deepEqual([...parseVisited('{"kyoto":["a",5,"b"]}').get('kyoto')], ['a', 'b']);
});

test('marking and unmarking is saved per city and survives a reload', () => {
  const storage = memoryStorage();
  const store = createVisitedStore(storage);
  assert.equal(store.has('kyoto', 'fushimi'), false);
  assert.equal(store.toggle('kyoto', 'fushimi'), true);
  store.set('osaka', 'fushimi', true); // same local id in another city is a different place
  assert.equal(store.has('kyoto', 'fushimi'), true);
  assert.equal(JSON.parse(storage.data[VISITED_KEY]).osaka[0], 'fushimi');
  const reloaded = createVisitedStore(storage);
  assert.equal(reloaded.has('kyoto', 'fushimi'), true);
  assert.equal(reloaded.has('osaka', 'nishiki'), false);
  assert.equal(reloaded.toggle('kyoto', 'fushimi'), false);
  assert.equal(JSON.parse(storage.data[VISITED_KEY]).kyoto, undefined, 'empty cities are not stored');
});

test('listeners hear about real changes only', () => {
  const store = createVisitedStore(memoryStorage());
  const seen = [];
  const stop = store.subscribe((change) => seen.push(change));
  store.set('kyoto', 'a', true);
  store.set('kyoto', 'a', true); // no change
  store.set('kyoto', 'a', false);
  stop();
  store.set('kyoto', 'b', true);
  assert.deepEqual(seen, [{ cityId: 'kyoto', id: 'a', visited: true }, { cityId: 'kyoto', id: 'a', visited: false }]);
});

test('the counter ignores hotels and ids that no longer exist', () => {
  const store = createVisitedStore(memoryStorage('{"kyoto":["a","ghost","hotel"]}'));
  const points = [{ id: 'a', type: 'itinerary' }, { id: 'b', type: 'restaurant' }, { id: 'hotel', type: 'hotel' }];
  assert.deepEqual(countVisited(store, 'kyoto', points), { done: 1, total: 2 });
  assert.equal(isVisitable({ type: 'hotel' }), false);
  assert.deepEqual(countVisited(store, 'osaka', points), { done: 0, total: 2 });
});

test('storage that throws never breaks marking', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  const store = createVisitedStore(broken);
  assert.doesNotThrow(() => store.toggle('kyoto', 'a'));
  assert.equal(store.has('kyoto', 'a'), true, 'kept in memory for this visit');
  assert.equal(serializeVisited(new Map([['kyoto', new Set()]])), '{}');
});
