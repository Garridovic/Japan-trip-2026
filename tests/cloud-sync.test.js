import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSync, META_KEY, BACKUP_KEY, SyncError } from '../js/modules/cloud-sync.js';
import { createUserData, CHECKLIST_KEY } from '../js/modules/user-data.js';

const memory = (initial = {}) => { const map = new Map(Object.entries(initial)); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }; };
const json = (value) => JSON.stringify(value);

/** A fake Auth0 Management API holding one user. */
function fakeApi(remoteData = null, { failWith = null } = {}) {
  const api = { calls: [], meta: remoteData ? { [META_KEY]: { v: 1, updatedAt: 1, data: remoteData } } : {}, failWith };
  api.fetch = async (url, options) => {
    api.calls.push({ method: options.method, url, auth: options.headers.authorization, body: options.body ? JSON.parse(options.body) : null });
    if (api.failWith) { const status = api.failWith; return { ok: false, status, json: async () => ({}) }; }
    if (options.method === 'PATCH') { Object.assign(api.meta, JSON.parse(options.body).user_metadata); return { ok: true, status: 200, json: async () => ({}) }; }
    return { ok: true, status: 200, json: async () => ({ user_metadata: api.meta }) };
  };
  return api;
}
const setup = ({ local = {}, remote = null, failWith = null } = {}) => {
  const storage = memory(local);
  const userData = createUserData(storage, { now: () => 100 });
  const api = fakeApi(remote, { failWith });
  const statuses = [];
  let changed = 0;
  const timers = [];
  const sync = createCloudSync({
    domain: 't.eu.auth0.com', userId: 'google-oauth2|123', userData, storage, fetchFn: api.fetch, now: () => 100,
    getToken: async () => 'tok', setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
    onStatus: (s) => statuses.push(s.state), onRemoteChanges: () => { changed += 1; }
  });
  return { storage, userData, api, sync, statuses, timers, changed: () => changed };
};

test('first login merges local and cloud, keeps a backup, writes one PATCH and sets the base', async () => {
  const t = setup({ local: { 'visited-v1': json({ kyoto: ['a'] }) }, remote: { 'visited-v1': json({ kyoto: ['b'] }), [CHECKLIST_KEY]: json({ checked: ['pasaporte'], custom: [], removed: [] }) } });
  await t.sync.reconcile();
  assert.deepEqual(JSON.parse(t.storage.getItem('visited-v1')), { kyoto: ['a', 'b'] });
  assert.deepEqual(JSON.parse(t.storage.getItem(CHECKLIST_KEY)).checked, ['pasaporte']);
  assert.ok(t.storage.getItem(BACKUP_KEY), 'a local backup is kept before the first merge');
  assert.deepEqual(JSON.parse(t.storage.getItem(BACKUP_KEY)).data, { 'visited-v1': json({ kyoto: ['a'] }) });
  assert.equal(t.api.calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.deepEqual(JSON.parse(t.api.meta[META_KEY].data['visited-v1']), { kyoto: ['a', 'b'] });
  assert.equal(t.api.calls[0].url, 'https://t.eu.auth0.com/api/v2/users/google-oauth2%7C123?fields=user_metadata&include_fields=true');
  assert.equal(t.api.calls[0].auth, 'Bearer tok');
  assert.equal(t.changed(), 1);
  assert.equal(t.sync.state, 'synced');
});

test('nothing to write when both sides already agree', async () => {
  const data = { 'visited-v1': json({ kyoto: ['a'] }) };
  const t = setup({ local: data, remote: data });
  await t.sync.reconcile();
  assert.equal(t.api.calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.equal(t.changed(), 0);
});

test('a removal made here after a sync is sent to the cloud, not undone by it', async () => {
  const t = setup({ local: { 'visited-v1': json({ kyoto: ['a', 'b'] }) }, remote: { 'visited-v1': json({ kyoto: ['a', 'b'] }) } });
  await t.sync.reconcile(); // base = a,b
  t.userData.storage.setItem('visited-v1', json({ kyoto: ['a'] }));
  await t.sync.reconcile();
  assert.deepEqual(JSON.parse(t.api.meta[META_KEY].data['visited-v1']), { kyoto: ['a'] });
  assert.deepEqual(JSON.parse(t.storage.getItem('visited-v1')), { kyoto: ['a'] });
});

test('offline or rate limited: stays local, goes pending and retries with backoff; nothing is lost', async () => {
  const t = setup({ local: { 'visited-v1': json({ kyoto: ['a'] }) }, failWith: 429 });
  await t.sync.reconcile();
  assert.equal(t.sync.state, 'pending');
  assert.equal(t.timers.length, 1);
  assert.equal(t.timers[0].ms, 5000);
  assert.deepEqual(JSON.parse(t.storage.getItem('visited-v1')), { kyoto: ['a'] });
  t.api.failWith = null;
  await t.timers[0].fn();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(t.sync.state, 'synced');
});

test('401 means signed out (no retry loop); a newer schema in the cloud is never overwritten', async () => {
  const t = setup({ local: { 'visited-v1': '{}' }, failWith: 401 });
  await t.sync.reconcile();
  assert.equal(t.sync.state, 'signed-out');
  assert.equal(t.timers.length, 0);
  const future = setup({ local: { 'visited-v1': json({ kyoto: ['a'] }) } });
  future.api.meta[META_KEY] = { v: 99, data: {} };
  await future.sync.reconcile();
  assert.equal(future.sync.state, 'error');
  assert.equal(future.api.calls.filter((c) => c.method === 'PATCH').length, 0);
});

test('lodging notes and other keys never reach the cloud', async () => {
  const t = setup({ local: { 'visited-v1': json({ kyoto: ['a'] }), 'japan-trip:lodging-private': 'PIN 1234', theme: 'dark' } });
  await t.sync.reconcile();
  assert.ok(!JSON.stringify(t.api.calls).includes('PIN'));
  assert.deepEqual(Object.keys(t.api.meta[META_KEY].data), ['visited-v1']);
});

test('the connected backend saves through reconcile, debounced by delayMs', async () => {
  const t = setup({ local: { 'visited-v1': json({ kyoto: ['a'] }) } });
  const timers = [];
  const ud = createUserData(t.storage, { now: () => 5, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {} });
  const sync = createCloudSync({ domain: 'd', userId: 'u', userData: ud, storage: t.storage, fetchFn: t.api.fetch, getToken: async () => 't', now: () => 5 });
  ud.connect(sync.backend, { delayMs: 5000 });
  ud.storage.setItem('visited-v1', json({ kyoto: ['a', 'z'] }));
  ud.storage.setItem('visited-v1', json({ kyoto: ['a', 'z', 'y'] }));
  assert.equal(timers.at(-1).ms, 5000);
  await ud.flush();
  assert.equal(t.api.calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.ok(SyncError);
});
