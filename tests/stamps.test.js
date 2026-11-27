import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStampStore, parseStamps, serializeStamps, countStamps, stampPlaces, stampLook, hashId, SHAPES, MOTIFS, STAMPS_KEY, MAX_ENTRIES, MAX_LABEL } from '../js/modules/stamps.js';

const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data }; };
const clock = (iso) => () => new Date(iso);

test('the look of a stamp is stable and always valid', () => {
  assert.equal(hashId('a'), hashId('a'));
  for (const id of ['a', 's1', 'kyoto:fushimi', '']) {
    const look = stampLook(id);
    assert.ok(SHAPES.includes(look.shape) && MOTIFS.includes(look.motif));
    assert.ok(look.tilt >= -5 && look.tilt <= 5);
    assert.deepEqual(look, stampLook(id));
  }
});

test('add: label falls back to the place name, then to "Sello"; the date is local; storage holds one key', () => {
  const storage = memory();
  const store = createStampStore(storage, { now: clock('2026-12-12T10:00:00'), makeId: (() => { let n = 0; return () => `s${++n}`; })() });
  assert.equal(store.add({ label: '  Mi   sello  ' }).label, 'Mi sello');
  assert.equal(store.add({ place: 'kyoto:fushimi', placeName: 'Fushimi Inari Taisha' }).label, 'Fushimi Inari Taisha');
  assert.equal(store.add({}).label, 'Sello');
  assert.equal(store.add({ label: 'x'.repeat(200) }).label.length, MAX_LABEL);
  assert.equal(store.entries()[0].date, '2026-12-12');
  assert.deepEqual([...storage.data.keys()], [STAMPS_KEY]);
  assert.equal(parseStamps(storage.getItem(STAMPS_KEY)).length, 4);
});

test('a bad place key is dropped, not stored', () => {
  const store = createStampStore(memory());
  assert.equal(store.add({ label: 'a', place: '<script>' }).place, undefined);
});

test('remove and restore (undo) put the entry back exactly', () => {
  const store = createStampStore(memory());
  const entry = store.add({ label: 'a', place: 'kyoto:kinkaku' });
  assert.equal(store.entries().length, 1);
  assert.deepEqual(store.remove(entry.id), entry);
  assert.equal(store.entries().length, 0);
  store.restore(entry); store.restore(entry);
  assert.deepEqual(store.entries(), [entry]);
});

test('the book is capped and parse survives garbage', () => {
  const store = createStampStore(memory());
  for (let i = 0; i < MAX_ENTRIES; i += 1) assert.ok(store.add({ label: `s${i}` }));
  assert.equal(store.add({ label: 'one more' }), null);
  for (const raw of [null, '', '{', '[]', '{"entries":5}', '{"entries":[1,null,{"id":3}]}']) assert.deepEqual(parseStamps(raw), []);
  assert.equal(serializeStamps(parseStamps(serializeStamps([{ id: 'b', label: 'B', date: '2026-12-01', updatedAt: 1 }, { id: 'a', label: 'A', date: '2026-12-02', updatedAt: 2 }]))), serializeStamps([{ id: 'a', label: 'A', date: '2026-12-02', updatedAt: 2 }, { id: 'b', label: 'B', date: '2026-12-01', updatedAt: 1 }]));
});

test('countStamps counts per city; entries without a place only count in the total', () => {
  const { total, byCity } = countStamps([{ place: 'kyoto:a' }, { place: 'kyoto:b' }, { place: 'osaka:c' }, {}]);
  assert.equal(total, 4);
  assert.deepEqual([...byCity], [['kyoto', 2], ['osaka', 1]]);
});

test('stampPlaces keeps only places with a known stamp kind', () => {
  const places = [{ id: 'a', stamp: { kind: 'goshuin' } }, { id: 'b' }, { id: 'c', stamp: { kind: 'otro' } }, { id: 'd', stamp: { kind: 'gojoin' } }];
  assert.deepEqual(stampPlaces(places).map((p) => p.id), ['a', 'd']);
});

test('only the 14 places with a sourced real stamp carry `stamp`; unconfirmed ones never do', async () => {
  const stamped = [];
  for (const city of ['kyoto', 'osaka', 'tokyo']) {
    const places = JSON.parse(await readFile(new URL(`../data/cities/${city}/places.json`, import.meta.url), 'utf8'));
    for (const place of places) if (place.stamp) { assert.match(place.stamp.source, /^https:\/\//, place.id); stamped.push(`${city}:${place.id}`); }
  }
  assert.equal(stamped.length, 14);
  for (const unconfirmed of ['kyoto:ryoanji', 'kyoto:tenryuji', 'kyoto:iwaya', 'kyoto:oishi', 'kyoto:nijo', 'osaka:sumiyoshi', 'osaka:osakajo']) assert.ok(!stamped.includes(unconfirmed), unconfirmed);
});
