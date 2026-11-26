// Offline support: registers the service worker, asks it to store the rest of the guide in the background
// and shows a small status line ("available offline"). Also a recovery switch: ?reset-offline.
export const RESET_PARAM = 'reset-offline';

/** Whether it is polite to download ~20 MB in the background now (not on data saver or very slow links). */
export function shouldWarm(nav = navigator) {
  const connection = nav.connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !['slow-2g', '2g', '3g'].includes(connection.effectiveType);
}

export function describe(state) {
  switch (state.kind) {
    case 'saving': return `Guardando la guía para usarla sin conexión… ${state.done}/${state.total}`;
    case 'ready': return 'Guía disponible sin conexión ✓';
    case 'offline': return 'Sin conexión · usando la guía guardada';
    case 'partial': return 'Guía guardada casi entera: se completará con la próxima visita con conexión';
    default: return '';
  }
}

export async function initOffline({ win = window, doc = document } = {}) {
  const indicator = doc.getElementById('offline-indicator');
  const nav = win.navigator;
  let state = { kind: 'none' };
  const render = () => {
    const offline = nav.onLine === false;
    const shown = offline ? { kind: 'offline' } : state;
    const text = describe(shown);
    indicator.hidden = !text;
    indicator.textContent = text;
    doc.body.classList.toggle('is-offline', offline);
  };
  win.addEventListener('online', render);
  win.addEventListener('offline', render);
  render();

  if (!('serviceWorker' in nav)) return null;

  if (new URL(win.location.href).searchParams.has(RESET_PARAM)) {
    for (const registration of await nav.serviceWorker.getRegistrations()) await registration.unregister();
    for (const name of await win.caches.keys()) await win.caches.delete(name);
    const clean = new URL(win.location.href);
    clean.searchParams.delete(RESET_PARAM);
    win.location.replace(clean);
    return null;
  }

  nav.serviceWorker.addEventListener('message', ({ data }) => {
    if (data?.type === 'offline-progress') state = { kind: 'saving', done: data.done, total: data.total };
    else if (data?.type === 'offline-ready') state = { kind: 'ready' };
    else if (data?.type === 'offline-partial') state = { kind: 'partial' };
    else return;
    render();
  });

  try {
    await nav.serviceWorker.register('sw.js');
    const registration = await nav.serviceWorker.ready;
    registration.active?.postMessage({ type: 'status' });
    const startWarm = () => { if (shouldWarm(nav)) registration.active?.postMessage({ type: 'warm' }); };
    if (doc.readyState === 'complete') win.setTimeout(startWarm, 3000);
    else win.addEventListener('load', () => win.setTimeout(startWarm, 3000), { once: true });
    return registration;
  } catch (error) {
    console.warn('[offline] service worker not available:', error);
    return null;
  }
}
