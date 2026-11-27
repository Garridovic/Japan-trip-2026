const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
let jwks = { keys: null, at: 0 };

const cors = (env) => ({
  'access-control-allow-origin': env.ALLOWED_ORIGIN,
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
  vary: 'origin'
});
const reply = (env, data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors(env), ...extra } });

async function getKeys(env) {
  if (jwks.keys && Date.now() - jwks.at < 3600_000) return jwks.keys;
  const r = await fetch(`https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`);
  if (!r.ok) throw new Error('jwks');
  jwks = { keys: (await r.json()).keys, at: Date.now() };
  return jwks.keys;
}

// Verifies RS256 signature, issuer, audience (= Client ID, it is an ID token) and expiry.
async function verify(token, env) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('format');
  const header = JSON.parse(dec.decode(b64u(h)));
  if (header.alg !== 'RS256') throw new Error('alg');
  const jwk = (await getKeys(env)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error('signature');
  const c = JSON.parse(dec.decode(b64u(p)));
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (c.iss !== `https://${env.AUTH0_DOMAIN}/`) throw new Error('iss');
  if (!aud.includes(env.AUTH0_CLIENT_ID)) throw new Error('aud');
  if (!c.exp || c.exp * 1000 < Date.now()) throw new Error('expired');
  return c;
}

// Same rule as the app: role names are typed by hand, so ignore case, accents and stray spaces; «admin» also counts.
const norm = (role) => String(role ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const isAdminRole = (roles, env) => Array.isArray(roles) && roles.some((r) => [norm(env.ADMIN_ROLE), 'admin'].includes(norm(r)));

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function clean(list) {
  if (!Array.isArray(list) || list.length > 20) return null;
  return list.map((a) => ({
    id: str(a?.id, 40), tipo: ['novedad', 'aviso', 'coach', 'tour'].includes(a?.tipo) ? a.tipo : 'novedad',
    titulo: str(a?.titulo, 80), texto: str(a?.texto, 400), destino: str(a?.destino, 60),
    urgente: a?.urgente === true, caduca: Number(a?.caduca) || 0, desdeVersion: str(a?.desdeVersion, 20), ts: Date.now()
  })).filter((a) => a.id && a.titulo);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname !== '/avisos') return reply(env, { error: 'not found' }, 404);

    if (request.method === 'GET') {
      const saved = await env.AVISOS.get('avisos');
      return new Response(saved ?? '{"avisos":[]}', {
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60', ...cors(env) }
      });
    }

    if (request.method === 'PUT') {
      const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
      let claims;
      try { claims = await verify(token, env); } catch { return reply(env, { error: 'invalid token' }, 401); }
      const roles = claims[env.ROLES_CLAIM];
      if (!isAdminRole(roles, env)) return reply(env, { error: 'administrator only' }, 403);
      let body;
      try { body = await request.json(); } catch { return reply(env, { error: 'invalid JSON' }, 400); }
      const avisos = clean(body?.avisos);
      if (!avisos) return reply(env, { error: 'invalid avisos' }, 400);
      await env.AVISOS.put('avisos', JSON.stringify({ avisos }));
      return reply(env, { ok: true, total: avisos.length });
    }
    return reply(env, { error: 'method not allowed' }, 405);
  }
};
