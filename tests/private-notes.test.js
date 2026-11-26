import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPrivateStore, sanitize, serializeBackup, parseBackup, FIELDS, BACKUP_KIND, PRIVATE_STORAGE_KEY } from '../js/modules/private-notes.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const ids = new Set(['osaka', 'kyoto']);
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }; };

test('private fields (PIN, reservation, notes) are saved in the device storage and come back', () => {
  const storage = memory();
  const store = createPrivateStore(storage, ids);
  assert.equal(store.isEmpty(), true);
  assert.equal(store.set('osaka', 'pin', '4821'), true);
  store.set('osaka', 'booking', 'AB-123456');
  store.set('osaka', 'notes', 'Piso 5');
  assert.deepEqual(store.get('osaka'), { pin: '4821', booking: 'AB-123456', notes: 'Piso 5' });
  assert.deepEqual(store.get('kyoto'), { pin: '', booking: '', notes: '' });
  const again = createPrivateStore(storage, ids); // a new session on the same phone
  assert.equal(again.get('osaka').pin, '4821');
  assert.ok(storage.map.has(PRIVATE_STORAGE_KEY));
});

test('only known stays and fields are accepted, values are length-limited and empty ones are dropped', () => {
  const store = createPrivateStore(memory(), ids);
  assert.equal(store.set('unknown', 'pin', '1'), false);
  assert.equal(store.set('osaka', 'password', '1'), false);
  store.set('osaka', 'pin', 'x'.repeat(500));
  assert.equal(store.get('osaka').pin.length, FIELDS.find(({ id }) => id === 'pin').max);
  store.set('osaka', 'pin', '   ');
  assert.equal(store.isEmpty(), true);
  assert.deepEqual(sanitize({ osaka: { pin: '1', evil: 'x' }, other: { pin: '2' }, kyoto: 'nope' }, ids), { osaka: { pin: '1' } });
});

test('broken or hostile storage never throws and never leaks', () => {
  assert.deepEqual(createPrivateStore({ getItem: () => '{not json', setItem() {} }, ids).all(), {});
  const throwing = createPrivateStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('x'); } }, ids);
  assert.equal(throwing.set('osaka', 'pin', '1'), false);
  assert.doesNotThrow(() => throwing.clear());
  assert.doesNotThrow(() => createPrivateStore(null, ids).set('osaka', 'pin', '1'));
});

test('clear removes everything from the device', () => {
  const storage = memory();
  const store = createPrivateStore(storage, ids);
  store.set('osaka', 'pin', '1');
  store.clear();
  assert.equal(store.isEmpty(), true);
  assert.equal(storage.map.has(PRIVATE_STORAGE_KEY), false);
});

test('backups round-trip, reject foreign files and ignore unknown stays', () => {
  const data = { osaka: { pin: '4821', booking: 'AB-1' }, kyoto: { notes: 'n' } };
  const file = serializeBackup(data, new Date('2026-12-01T00:00:00Z'));
  assert.equal(JSON.parse(file).kind, BACKUP_KIND);
  assert.deepEqual(parseBackup(file, ids), { ok: true, stays: data, count: 2 });
  assert.equal(parseBackup('not json', ids).ok, false);
  assert.equal(parseBackup(JSON.stringify({ hello: 1 }), ids).ok, false);
  const withExtra = JSON.stringify({ kind: BACKUP_KIND, version: 1, stays: { osaka: { pin: '1' }, atlantis: { pin: '2' } } });
  assert.deepEqual(parseBackup(withExtra, ids).stays, { osaka: { pin: '1' } });
});

test('the private data code never talks to the network', async () => {
  for (const file of ['js/modules/private-notes.js', 'js/modules/lodging-ui.js']) {
    const source = await readFile(`${root}${file}`, 'utf8');
    assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.share/, `${file} must not send data anywhere`);
  }
});

test('the service worker does not touch localStorage or private data', async () => {
  const worker = await readFile(`${root}sw.js`, 'utf8');
  assert.doesNotMatch(worker, /localStorage|japan-trip:lodging-private/);
});

test('only the Viaje view has a PDF/print button', async () => {
  const html = await readFile(`${root}index.html`, 'utf8');
  assert.equal((html.match(/window\.print\(\)/g) ?? []).length, 0, 'no inline print handlers');
  assert.match(html, /id="lodging-pdf"/);
  assert.doesNotMatch(html, /Imprimir \/ guardar PDF/);
  const sources = (await Promise.all(['js/main.js', 'js/modules/render.js', 'js/modules/details.js', 'js/modules/phrases-ui.js', 'js/modules/dishes-ui.js', 'js/modules/filters.js', 'js/modules/offline.js'].map((f) => readFile(`${root}${f}`, 'utf8')))).join('\n');
  assert.doesNotMatch(sources, /\.print\(/);
  const lodging = await readFile(`${root}js/modules/lodging-ui.js`, 'utf8');
  assert.match(lodging, /win\.print\(\)/);
  const css = await readFile(`${root}assets/styles.css`, 'utf8');
  const printCss = css.slice(css.indexOf('@media print'));
  assert.ok(css.split('@media print').length === 2, 'a single print block, for the Viaje view');
  assert.match(printCss, /body > :not\(#view-viaje\)/);
});
