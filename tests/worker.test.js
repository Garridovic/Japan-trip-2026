// The notices Worker (worker/src/index.js) run in Node with a real RS256 key, a stand-in for Auth0's JWKS and an in-memory KV.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const env = (kv) => ({ AUTH0_DOMAIN: 't.eu.auth0.com', AUTH0_CLIENT_ID: 'cid', ALLOWED_ORIGIN: 'https://garridovic.github.io', ADMIN_ROLE: 'administrador', ROLES_CLAIM: 'https://japan-trip-2026/roles', AVISOS: kv });
const memoryKV = () => { const data = new Map(); return { get: async (k) => data.get(k) ?? null, put: async (k, v) => { data.set(k, v); } }; };
const b64u = (input) => Buffer.from(input).toString('base64url');

const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
globalThis.fetch = async (url) => { assert.match(String(url), /jwks\.json$/); return new Response(JSON.stringify({ keys: [jwk] })); };

async function token(claims = {}, { key = pair.privateKey } = {}) {
  const payload = { iss: 'https://t.eu.auth0.com/', aud: 'cid', exp: Math.floor(Date.now() / 1000) + 600, ...claims };
  const head = `${b64u(JSON.stringify({ alg: 'RS256', kid: 'k1' }))}.${b64u(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head));
  return `${head}.${Buffer.from(sig).toString('base64url')}`;
}
const put = (body, bearer) => new Request('https://w.test/avisos', { method: 'PUT', headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, body: JSON.stringify(body) });
const body = { avisos: [{ id: 'a1', titulo: 'Hola', texto: 'Prueba', caduca: 9e12 }] };

test('reading is public and starts empty; CORS allows only the app origin', async () => {
  const res = await worker.fetch(new Request('https://w.test/avisos'), env(memoryKV()));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { avisos: [] });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://garridovic.github.io');
});

test('writing needs a valid token with the administrator role (any case, accents, «admin»)', async () => {
  const kv = memoryKV();
  const e = env(kv);
  assert.equal((await worker.fetch(put(body), e)).status, 401);
  assert.equal((await worker.fetch(put(body, 'a.b.c'), e)).status, 401);
  const roles = (r) => token({ 'https://japan-trip-2026/roles': r });
  assert.equal((await worker.fetch(put(body, await roles(['editor'])), e)).status, 403);
  assert.equal((await worker.fetch(put(body, await token()), e)).status, 403);
  for (const ok of [['administrador'], ['Administrador'], [' ADMINISTRADOR '], ['admin']]) assert.equal((await worker.fetch(put(body, await roles(ok)), e)).status, 200, JSON.stringify(ok));
  const read = await (await worker.fetch(new Request('https://w.test/avisos'), e)).json();
  assert.equal(read.avisos[0].titulo, 'Hola');
});

test('rejects tokens that are expired, for another audience/issuer, or signed by another key', async () => {
  const e = env(memoryKV());
  const r = { 'https://japan-trip-2026/roles': ['administrador'] };
  assert.equal((await worker.fetch(put(body, await token({ ...r, exp: 1 })), e)).status, 401);
  assert.equal((await worker.fetch(put(body, await token({ ...r, aud: 'https://t.eu.auth0.com/api/v2/' })), e)).status, 401);
  assert.equal((await worker.fetch(put(body, await token({ ...r, iss: 'https://evil.example/' })), e)).status, 401);
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  assert.equal((await worker.fetch(put(body, await token(r, { key: other.privateKey })), e)).status, 401);
});

test('withdrawing (empty list) works and bad bodies are refused', async () => {
  const e = env(memoryKV());
  const t = await token({ 'https://japan-trip-2026/roles': ['administrador'] });
  assert.equal((await worker.fetch(put({ avisos: 'x' }, t), e)).status, 400);
  assert.equal((await worker.fetch(put({ avisos: [] }, t), e)).status, 200);
  assert.equal((await worker.fetch(new Request('https://w.test/avisos', { method: 'POST' }), e)).status, 405);
  assert.equal((await worker.fetch(new Request('https://w.test/otra'), e)).status, 404);
});
