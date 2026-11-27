// Notices for everyone: the administrator publishes one from «Administración» (Cloudflare Worker + KV); every device reads it.
// Best effort and offline-friendly: a short timeout, the last copy as fallback, and any failure leaves the app exactly as it was.
// Notice texts are public and only ever written with textContent: never PINs, bookings or personal data.
import { h } from './dom.js';

export const NOTICES_URL = 'https://japon-avisos.garridovic.workers.dev/avisos';
export const CACHE_KEY = 'notices-cache';
export const ENABLE_KEY = 'notices-enabled'; // set to '1' to read notices outside the published site (tests, local checks)
export const SITE_HOST = 'garridovic.github.io';
export const SEEN_KEY = 'notices-seen';
export const TIMEOUT_MS = 4000;
export const REFRESH_MS = 5 * 60 * 1000;
export const DAY_MS = 86400000;
export const MAX_TITLE = 80;
export const MAX_TEXT = 400;

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Only well-formed notices survive: an id, a title, and plain-text fields. `caduca` is a time in ms (0 = never). */
export function parseNotices(data) {
  const list = Array.isArray(data?.avisos) ? data.avisos : [];
  return list.map((item) => ({
    id: text(item?.id, 40), tipo: item?.tipo === 'novedad' ? 'novedad' : 'aviso',
    titulo: text(item?.titulo, MAX_TITLE), texto: text(item?.texto, MAX_TEXT), caduca: Number(item?.caduca) || 0
  })).filter((item) => item.id && item.titulo);
}

/** What to show now: not expired and not already closed on this device. */
export function visibleNotices(list, { now = Date.now(), seen = [] } = {}) {
  return list.filter((item) => (!item.caduca || item.caduca > now) && !seen.includes(item.id));
}

/** A notice as the administrator form builds it. `dias` = days until it expires. */
export function buildNotice({ titulo, texto, dias = 7, now = Date.now() }) {
  return { id: `n${now.toString(36)}`, tipo: 'aviso', titulo: text(titulo, MAX_TITLE), texto: text(texto, MAX_TEXT), caduca: now + Math.max(1, Number(dias) || 7) * DAY_MS };
}

const readJSON = (storage, key, fallback) => { try { return JSON.parse(storage?.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } };
const writeJSON = (storage, key, value) => { try { storage?.setItem(key, JSON.stringify(value)); } catch { /* full or blocked */ } };

/** Reads the notices from the Worker, with a timeout; on any failure uses the last good copy. */
export async function loadNotices({ url = NOTICES_URL, fetchFn = (...args) => fetch(...args), storage = null, timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const notices = parseNotices(await response.json());
    writeJSON(storage, CACHE_KEY, notices);
    return { notices, fromCache: false };
  } catch {
    return { notices: parseNotices({ avisos: readJSON(storage, CACHE_KEY, []) }), fromCache: true };
  } finally { clearTimeout(timer); }
}

/** Replaces the published notices (administrator only: the Worker checks the ID token and the role). */
export async function publishNotices(list, { getIdToken, url = NOTICES_URL, fetchFn = (...args) => fetch(...args) }) {
  const token = await getIdToken();
  if (!token) return { ok: false, reason: 'token' };
  let response;
  try {
    response = await fetchFn(url, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ avisos: list }) });
  } catch { return { ok: false, reason: 'network' }; }
  if (response.status === 401) return { ok: false, reason: 'session' };
  if (response.status === 403) return { ok: false, reason: 'role' };
  return response.ok ? { ok: true } : { ok: false, reason: 'server' };
}

export const publishErrorText = (reason) => ({
  token: 'No se ha podido obtener tu sesión. Vuelve a entrar.',
  session: 'La sesión ha caducado. Vuelve a entrar e inténtalo de nuevo.',
  role: 'Tu cuenta no tiene el rol de administrador.',
  network: 'Sin conexión con el servidor de avisos. Inténtalo de nuevo.'
}[reason] ?? 'El servidor de avisos no ha respondido. Inténtalo de nuevo.');

/** The banner under the header: the newest open notice, with «Entendido». Refreshes on open and when the app comes back to the foreground. */
export function initNotices({ win = window, storage = null, fetchFn, url } = {}) {
  const host = win.document.getElementById('app-notice');
  if (!host) return null;
  try { storage = storage ?? win.localStorage; } catch { /* blocked */ }
  // Only the published site (or an explicit switch) talks to the Worker: local servers and test runs stay offline and free of CORS noise.
  if (win.location.hostname !== SITE_HOST && storage?.getItem(ENABLE_KEY) !== '1') return null;
  let lastLoad = 0;
  // The full-screen map starts below the banner: its height is published as --notice-height (0 while the banner is hidden).
  const root = win.document.documentElement;
  const publishHeight = () => {
    root.style.setProperty('--notice-height', host.hidden ? '0px' : `${host.offsetHeight + 8}px`);
    win.dispatchEvent(new win.Event('resize')); // the map re-measures its container
  };
  if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(publishHeight).observe(host);

  function render(list) {
    const seen = readJSON(storage, SEEN_KEY, []);
    const [notice] = visibleNotices(list, { now: Date.now(), seen }).slice(-1);
    host.replaceChildren();
    host.hidden = !notice;
    if (!notice) { publishHeight(); return; }
    host.append(
      h('strong', {}, notice.titulo),
      notice.texto ? h('p', {}, notice.texto) : null,
      h('button', { type: 'button', class: 'filter', onclick: () => { writeJSON(storage, SEEN_KEY, [...seen, notice.id].slice(-30)); render(list); } }, 'Entendido'));
    publishHeight();
  }

  async function refresh() {
    lastLoad = Date.now();
    render((await loadNotices({ storage, fetchFn, url })).notices);
  }
  render(parseNotices({ avisos: readJSON(storage, CACHE_KEY, []) })); // the last copy, at once
  refresh();
  win.document.addEventListener('visibilitychange', () => { if (win.document.visibilityState === 'visible' && Date.now() - lastLoad > REFRESH_MS) refresh(); });
  return { refresh };
}
