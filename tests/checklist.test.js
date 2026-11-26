import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseChecklist, serializeChecklist, validateChecklist, groupChecklist, progress, createChecklistStore } from '../js/modules/checklist.js';

const data = JSON.parse(await readFile(new URL('../data/global/checklist.json', import.meta.url), 'utf8'));
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map }; };

test('the base checklist is valid and has the essentials', () => {
  assert.deepEqual(validateChecklist(data), []);
  ['pasaporte', 'cargador', 'ropa-abrigo'].forEach((id) => assert.ok(data.items.some((item) => item.id === id), id));
});

test('validateChecklist reports bad ids, duplicates, unknown groups and empty texts', () => {
  const problems = validateChecklist({ groups: [{ id: 'a' }], items: [{ id: 'x', group: 'zzz', text: '' }, { id: 'x', group: 'a', text: 't' }, { id: 'Bad Id', group: 'a', text: 't' }] }).join('\n');
  assert.match(problems, /unknown group zzz/);
  assert.match(problems, /missing text/);
  assert.match(problems, /duplicate id/);
  assert.match(problems, /invalid id/);
});

test('parse is forgiving with corrupt or hostile storage', () => {
  for (const raw of [null, '', 'nope', '[]', '{"checked":"x","custom":5}', '{"custom":[{"id":1,"text":"x"},{"id":"a","text":"   "}]}']) {
    const state = parseChecklist(raw);
    assert.equal(state.checked.size, 0);
    assert.equal(state.custom.length, 0);
  }
});

test('toggle, add, remove and uncheck persist and notify', () => {
  const storage = memory();
  const store = createChecklistStore(storage, 'k', () => 'c1');
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  assert.equal(store.toggle('pasaporte'), true);
  assert.deepEqual(store.add('  Cámara  '), { id: 'c1', text: 'Cámara', group: 'mis' });
  assert.equal(store.add('cámara'), null, 'no duplicates (case-insensitive)');
  assert.equal(store.add('   '), null);
  store.toggle('c1');
  assert.equal(notified, 3);
  const reloaded = createChecklistStore(storage, 'k');
  assert.ok(reloaded.state().checked.has('pasaporte') && reloaded.state().checked.has('c1'));
  reloaded.remove('c1');
  assert.equal(reloaded.state().custom.length, 0);
  assert.ok(!reloaded.state().checked.has('c1'));
  reloaded.remove('cargador');
  assert.ok(reloaded.state().removed.has('cargador'));
  assert.ok(!groupChecklist(data, reloaded.state()).flatMap((g) => g.items).some((i) => i.id === 'cargador'));
  reloaded.restoreBase();
  assert.ok(groupChecklist(data, reloaded.state()).flatMap((g) => g.items).some((i) => i.id === 'cargador'));
  reloaded.uncheckAll();
  assert.equal(reloaded.state().checked.size, 0);
});

test('progress counts checked items over visible items; custom items are capped in length', () => {
  const store = createChecklistStore(memory(), 'k', () => 'x1');
  store.toggle('pasaporte');
  store.add('x'.repeat(200));
  const groups = groupChecklist(data, store.state());
  const { done, total } = progress(groups);
  assert.equal(done, 1);
  assert.equal(total, data.items.length + 1);
  assert.equal(store.state().custom[0].text.length, 80);
});

test('serialize round-trips', () => {
  const store = createChecklistStore(memory(), 'k', () => 'c9');
  store.add('Algo'); store.toggle('sim'); store.remove('bateria');
  const back = parseChecklist(serializeChecklist(store.state()));
  assert.deepEqual([...back.checked], ['sim']);
  assert.deepEqual(back.custom.map((c) => c.text), ['Algo']);
  assert.deepEqual([...back.removed], ['bateria']);
});
