import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserData, SYNCED_KEYS, CHECKLIST_KEY } from '../js/modules/user-data.js';
import { VISITED_KEY } from '../js/modules/visited.js';
import { FAVORITES_STORAGE_KEY } from '../js/modules/phrases.js';
import { DISH_FAVORITES_KEY } from '../js/modules/dishes.js';

const memory = (initial = {}) => { const map = new Map(Object.entries(initial)); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }; };
const fakeTimers = () => { const queue = []; return { setTimer: (fn) => { queue.push(fn); return queue.length; }, clearTimer: () => { queue.length = 0; }, run: async () => { while (queue.length) await queue.shift()(); } }; };

test('the synced keys are exactly the keys the stores use', () => {
  assert.deepEqual([...SYNCED_KEYS].sort(), [VISITED_KEY, FAVORITES_STORAGE_KEY, DISH_FAVORITES_KEY, CHECKLIST_KEY].sort());
});

test('the facade reads and writes the underlying storage', () => {
  const storage = memory();
  const { storage: facade } = createUserData(storage);
  facade.setItem(VISITED_KEY, '{"kyoto":["a"]}');
  assert.equal(storage.getItem(VISITED_KEY), '{"kyoto":["a"]}');
  assert.equal(facade.getItem(VISITED_KEY), '{"kyoto":["a"]}');
  facade.removeItem(VISITED_KEY);
  assert.equal(facade.getItem(VISITED_KEY), null);
});

test('snapshot holds only synced keys, never lodging notes', () => {
  const storage = memory({ [VISITED_KEY]: '{}', 'japan-trip:lodging-private': 'PIN 1234', theme: 'dark' });
  const { snapshot } = createUserData(storage);
  assert.deepEqual(Object.keys(snapshot().data), [VISITED_KEY]);
});

test('a connected backend gets a debounced save with the full snapshot after a change', async () => {
  const timers = fakeTimers();
  const saved = [];
  const userData = createUserData(memory(), { ...timers, now: () => 42 });
  userData.connect({ load: async () => null, save: async (snapshot) => { saved.push(snapshot); } });
  userData.storage.setItem(CHECKLIST_KEY, '{"checked":["a"]}');
  userData.storage.setItem(VISITED_KEY, '{}');
  assert.equal(saved.length, 0);
  await timers.run();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].updatedAt, 42);
  assert.deepEqual(Object.keys(saved[0].data).sort(), [CHECKLIST_KEY, VISITED_KEY].sort());
});

test('without a backend nothing is saved remotely and nothing breaks', async () => {
  const timers = fakeTimers();
  const userData = createUserData(memory(), timers);
  userData.storage.setItem(CHECKLIST_KEY, '{}');
  await timers.run();
  assert.equal(await userData.load(), false);
});

test('load applies the remote snapshot to known keys only; failures and timeouts keep local data', async () => {
  const storage = memory({ [VISITED_KEY]: 'local' });
  const userData = createUserData(storage);
  userData.connect({ load: async () => ({ updatedAt: 9, data: { [VISITED_KEY]: 'remote', 'japan-trip:lodging-private': 'x', [CHECKLIST_KEY]: 5 } }), save: async () => {} });
  assert.equal(await userData.load(), true);
  assert.equal(storage.getItem(VISITED_KEY), 'remote');
  assert.equal(storage.getItem('japan-trip:lodging-private'), null);
  assert.equal(storage.getItem(CHECKLIST_KEY), null);
  const failing = createUserData(memory({ [VISITED_KEY]: 'local' }));
  failing.connect({ load: async () => { throw new Error('offline'); }, save: async () => {} });
  assert.equal(await failing.load(), false);
  assert.equal(failing.storage.getItem(VISITED_KEY), 'local');
});

test('subscribers hear about synced changes only', () => {
  const userData = createUserData(memory());
  const heard = [];
  userData.subscribe((key) => heard.push(key));
  userData.storage.setItem(CHECKLIST_KEY, '{}');
  userData.storage.setItem('theme', 'dark');
  assert.deepEqual(heard, [CHECKLIST_KEY]);
});
