// Offline support: registers the service worker, verifies that the saved copy is really complete,
// shows its state in a header chip and offers a small popover (download everything, retry, check, delete).
// Recovery fallback: ?reset-offline.
import { OFFLINE_TEXTS } from './offline-texts.js';
export const RESET_PARAM = 'reset-offline';

/** Wifi or ethernet are the only links where downloading the bigger photos by itself is polite. */
export function canAutoDownloadAll(nav = navigator) {
  const connection = nav.connection;
  if (!connection || connection.saveData) return false;
  return ['wifi', 'ethernet'].includes(connection.type);
}

export const formatMegabytes = (bytes) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;

export function formatDate(timestamp, locale = 'es-ES') {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

/**
 * State of the saved copy, from a service worker report (a file-by-file check of the cache):
 *   incomplete : something the app needs is missing (retry needed)
 *   essentials : the app, data and small photos are complete; the big photos are not saved
 *   ready      : everything is saved
 */
export function stateFromReport(report) {
  const { required, optional, warm } = report.missing;
  if (required > 0 || optional > 0) return { kind: 'incomplete', missing: required + optional };
  if (warm > 0) return { kind: 'essentials' };
  return { kind: 'ready' };
}

/**
 * What the header chip shows for a state. `label` is the full text; `short` is used when the header is narrow
 * (the CSS switches at 420 px) so it never overlaps the city tabs on a 320 px phone.
 */
export function chipView(state, { online = true } = {}) {
  const T = OFFLINE_TEXTS;
  const view = (key, icon, tone, extra = {}) => ({ icon, label: T[key].label, short: T[key].short, tone, aria: T[key].aria, ...extra });
  switch (state.kind) {
    case 'ready': return online ? view('ready', '✓', 'ok') : view('network', '✓', 'net');
    case 'essentials': return online ? view('essentials', '✓', 'partial') : view('network', '✓', 'net');
    case 'saving': {
      const percent = state.total ? `${Math.round((state.done / state.total) * 100)}%` : '…';
      return view('saving', '⬇', 'busy', { label: `${T.saving.label} ${percent}`, short: percent });
    }
    case 'installing': return view('installing', '⬇', 'busy');
    case 'incomplete': return view('incomplete', '⚠', 'error');
    case 'none': return view('none', '☁', 'none');
    default: return null; // unsupported: no chip
  }
}

/** Popover: the first sentence says in plain words what is saved; then the details and which buttons make sense. */
export function describe(state, report = null) {
  const sizes = report?.sizes;
  const photos = sizes ? ` (≈ ${formatMegabytes(sizes.warm)})` : '';
  switch (state.kind) {
    case 'installing': return { summary: 'Guardando la guía para usarla sin internet…', detail: 'Necesita conexión solo esta vez.', download: false, retry: false };
    case 'essentials': return {
      summary: `Guía guardada para usarla sin internet. Faltan las fotos grandes${photos}.`,
      detail: 'La guía, el mapa, las frases y los platos ya funcionan sin conexión. Sin las fotos grandes verás versiones pequeñas.', download: true, retry: false
    };
    case 'saving': return { summary: `Descargando fotos grandes… ${state.done}/${state.total}`, detail: 'Puedes seguir usando la guía mientras se descarga.', download: false, retry: false };
    case 'ready': return { summary: 'Todo guardado para usar sin internet ✓', detail: 'La guía, las frases, los platos y todas las fotos están guardadas en este dispositivo.', download: false, retry: false };
    case 'incomplete': return { summary: 'La copia guardada está incompleta', detail: `Faltan ${state.missing} archivos. Con conexión, pulsa «Reintentar» para completarla.`, download: false, retry: true };
    case 'none': return { summary: 'Todavía no hay copia para usar sin internet', detail: 'Abre la guía con conexión para guardarla.', download: false, retry: false };
    default: return { summary: 'Este navegador no puede guardar la guía sin conexión', detail: '', download: false, retry: false };
  }
}

/** Rows ("Copia", "Espacio"…) for the popover. */
export function facts(state, report, appVersion) {
  const rows = [];
  if (report) {
    rows.push(['Copia guardada', report.installedAt ? `${appVersion ?? 'Guía'} · ${formatDate(report.installedAt)}` : (appVersion ?? 'Guía')]);
    const saved = (report.sizes.required + report.sizes.optional) + (report.missing.warm === 0 ? report.sizes.warm : 0);
    rows.push(['Espacio usado', `≈ ${formatMegabytes(saved)}`]);
    rows.push(['Archivos', `${report.totals.required + report.totals.optional + report.totals.warm - report.missing.required - report.missing.optional - report.missing.warm} de ${report.totals.required + report.totals.optional + report.totals.warm}`]);
    rows.push(['Mapa guardado', report.tiles ? `${report.tiles} teselas` : 'solo lo que veas con conexión']);
  }
  return rows;
}

export async function resetOfflineData(win = window) {
  const nav = win.navigator;
  if ('serviceWorker' in nav) for (const registration of await nav.serviceWorker.getRegistrations()) await registration.unregister();
  if (win.caches) for (const name of await win.caches.keys()) await win.caches.delete(name);
}

export async function initOffline({ win = window, doc = document } = {}) {
  const nav = win.navigator;
  const $ = (id) => doc.getElementById(id);
  const chip = $('offline-chip');
  const popover = $('offline-popover');
  const banner = $('offline-banner');
  let state = { kind: 'installing' };
  let report = null;
  let registration = null;
  let appVersion = null;

  const worker = () => registration?.active ?? nav.serviceWorker?.controller ?? null;
  const send = (type) => worker()?.postMessage({ type });

  // The download runs in the service worker, which the browser can stop while the page is idle or in the background.
  // Whenever the page comes back (screen change, tab visible, connection back, new worker), a copy that is not complete is asked to continue.
  // Automatic retries after a report that is still incomplete are limited, so a file that really cannot be downloaded does not loop.
  let autoRetries = 0;
  let retryTimer = null;
  const needsFill = () => nav.onLine !== false && state.kind !== 'unsupported' && state.kind !== 'ready' && state.kind !== 'essentials' && state.kind !== 'none';
  const resume = () => { if (worker() && needsFill()) send('fill'); };

  function render() {
    const view = chipView(state, { online: nav.onLine !== false });
    chip.hidden = !view;
    if (view) {
      chip.dataset.state = state.kind;
      chip.dataset.tone = view.tone;
      $('offline-chip-icon').textContent = view.icon;
      $('offline-chip-label').textContent = view.label;
      $('offline-chip-short').textContent = view.short;
      chip.setAttribute('aria-label', view.aria);
    }
    const text = describe(state, report);
    $('offline-summary').textContent = text.summary;
    $('offline-detail').textContent = text.detail;
    $('offline-download-all').hidden = !text.download || nav.onLine === false;
    $('offline-download-all').textContent = report ? `Descargar fotos grandes (≈ ${formatMegabytes(report.sizes.warm)})` : 'Descargar fotos grandes';
    $('offline-retry').hidden = !text.retry || nav.onLine === false;
    $('offline-verify').hidden = !worker();
    $('offline-facts').replaceChildren(...facts(state, report, appVersion).flatMap(([name, value]) => {
      const term = doc.createElement('dt'); term.textContent = name;
      const description = doc.createElement('dd'); description.textContent = value;
      return [term, description];
    }));
    const offline = nav.onLine === false;
    banner.hidden = !offline;
    doc.body.classList.toggle('is-offline', offline);
  }

  const setOpen = (open) => {
    popover.hidden = !open;
    chip.setAttribute('aria-expanded', String(open));
    if (open) { send('verify'); $('offline-close').focus(); } else chip.focus();
  };
  chip.addEventListener('click', () => setOpen(popover.hidden));
  $('offline-close').addEventListener('click', () => setOpen(false));
  doc.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !popover.hidden) setOpen(false); });
  doc.addEventListener('click', (event) => { if (!popover.hidden && !popover.contains(event.target) && !chip.contains(event.target)) { popover.hidden = true; chip.setAttribute('aria-expanded', 'false'); } });

  $('offline-download-all').addEventListener('click', () => { state = { kind: 'saving', done: 0, total: 0 }; render(); send('warm'); });
  $('offline-retry').addEventListener('click', () => { state = { kind: 'installing' }; render(); send('repair'); });
  $('offline-verify').addEventListener('click', () => send('verify'));
  $('offline-reset').addEventListener('click', async () => {
    const accepted = win.confirm('¿Borrar los datos guardados para usar la guía sin conexión y recargar? Tus favoritos y tus datos privados del viaje no se borran. Necesitarás conexión para volver a guardarla.');
    if (!accepted) return;
    await resetOfflineData(win);
    win.location.reload();
  });
  win.addEventListener('online', () => { render(); autoRetries = 0; resume(); });
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') resume(); });
  nav.serviceWorker?.addEventListener?.('controllerchange', () => resume());
  win.addEventListener('offline', render);

  if (!('serviceWorker' in nav)) { state = { kind: 'unsupported' }; render(); return null; }

  if (new URL(win.location.href).searchParams.has(RESET_PARAM)) {
    await resetOfflineData(win);
    const clean = new URL(win.location.href);
    clean.searchParams.delete(RESET_PARAM);
    win.location.replace(clean);
    return null;
  }

  nav.serviceWorker.addEventListener('message', ({ data }) => {
    if (data?.type === 'offline-progress') state = { kind: 'saving', done: data.done, total: data.total };
    else if (data?.type === 'offline-report') {
      report = data; state = stateFromReport(data);
      if (state.kind === 'incomplete' && autoRetries < 2 && nav.onLine !== false) {
        autoRetries += 1;
        win.clearTimeout(retryTimer);
        retryTimer = win.setTimeout(() => send('repair'), 5000 * autoRetries);
      } else if (state.kind !== 'incomplete') autoRetries = 0;
    }
    else if (data?.type === 'offline-resume') resume();
    else return;
    render();
  });

  render();
  try {
    await nav.serviceWorker.register('sw.js');
    registration = await nav.serviceWorker.ready;
    appVersion = await win.fetch('data/version.json').then((response) => response.json()).then(({ version }) => version).catch(() => null);
    send('fill'); // downloads the small photos of this version (the install itself only saves the app) and then reports what is really in the cache
    if (canAutoDownloadAll(nav)) win.setTimeout(() => send('warm'), 3000);
    return registration;
  } catch (error) {
    console.warn('[offline] service worker not available:', error);
    state = { kind: 'unsupported' };
    render();
    return null;
  }
}
