import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotices, visibleNotices, buildNotice, loadNotices, publishNotices, publishErrorText, CACHE_KEY, DAY_MS } from '../js/modules/notices.js';

const store = () => { const d = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = String(v); }, d }; };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('parseNotices keeps only well-formed notices and trims long text', () => {
  const list = parseNotices({ avisos: [{ id: 'a', titulo: ' Hola ', texto: 'x'.repeat(900), caduca: 5 }, { id: '', titulo: 'sin id' }, { id: 'b' }, null, { id: 'c', titulo: 3 }] });
  assert.equal(list.length, 1);
  assert.equal(list[0].titulo, 'Hola');
  assert.equal(list[0].texto.length, 400);
  assert.deepEqual(parseNotices(null), []);
});

test('visibleNotices hides expired and already closed notices', () => {
  const list = [{ id: 'a', caduca: 0 }, { id: 'b', caduca: 100 }, { id: 'c', caduca: 9999 }];
  assert.deepEqual(visibleNotices(list, { now: 500, seen: ['a'] }).map((n) => n.id), ['c']);
});

test('buildNotice sets an id, a title and the expiry in days', () => {
  const n = buildNotice({ titulo: ' Mapa nuevo ', texto: 'Mira', dias: 3, now: 1000 });
  assert.equal(n.titulo, 'Mapa nuevo');
  assert.equal(n.caduca, 1000 + 3 * DAY_MS);
  assert.ok(n.id.length > 1);
});

test('loadNotices saves the copy, and falls back to it on error or timeout', async () => {
  const s = store();
  const ok = await loadNotices({ storage: s, fetchFn: async () => json({ avisos: [{ id: 'a', titulo: 'Hola' }] }) });
  assert.equal(ok.fromCache, false);
  assert.ok(s.d[CACHE_KEY]);
  const down = await loadNotices({ storage: s, fetchFn: async () => { throw new Error('offline'); } });
  assert.deepEqual([down.fromCache, down.notices[0].titulo], [true, 'Hola']);
  const bad = await loadNotices({ storage: s, fetchFn: async () => json({}, 500) });
  assert.equal(bad.notices[0].titulo, 'Hola');
  const slow = await loadNotices({ storage: s, timeoutMs: 20, fetchFn: (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))) });
  assert.equal(slow.fromCache, true);
  await loadNotices({ storage: s, fetchFn: async () => json({ avisos: [] }) }); // withdrawn: the empty list replaces the copy
  assert.deepEqual((await loadNotices({ storage: s, fetchFn: async () => { throw new Error('x'); } })).notices, []);
});

test('publishNotices sends the ID token and maps the answers', async () => {
  const calls = [];
  const run = (status, token = 'idtoken') => publishNotices([{ id: 'a', titulo: 'T' }], { getIdToken: async () => token, fetchFn: async (url, init) => { calls.push({ url, init }); return json({}, status); } });
  assert.deepEqual(await run(200), { ok: true });
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.headers.authorization, 'Bearer idtoken');
  assert.equal((await run(401)).reason, 'session');
  assert.equal((await run(403)).reason, 'role');
  assert.equal((await run(500)).reason, 'server');
  assert.equal((await run(200, null)).reason, 'token');
  assert.equal((await publishNotices([], { getIdToken: async () => 't', fetchFn: async () => { throw new Error('x'); } })).reason, 'network');
  assert.match(publishErrorText('role'), /administrador/);
});

test('initNotices stays silent outside the published site unless switched on', async () => {
  const { initNotices } = await import('../js/modules/notices.js');
  const win = { location: { hostname: '127.0.0.1' }, document: { getElementById: () => ({}) } };
  assert.equal(initNotices({ win, storage: store() }), null);
});
