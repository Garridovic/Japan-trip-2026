// "Hay una versión nueva · Actualizar": tells the user when the deployed guide is newer than the one on screen.
// The service worker keeps the guide working offline, which also means an old copy can stay in use for days (an iPhone
// home-screen app is rarely closed). So: ask for the newest version.json (the worker never answers `?fresh` from the
// saved copy), nudge the worker to look for a new build, and offer a reload. Never blocks anything and never needs internet to work.
export const FRESH_PARAM = 'fresh';
export const CHECK_EVERY_MS = 5 * 60 * 1000; // coming back to the app does not re-check more often than this

/** Result of comparing the version on screen with the newest deployed one. */
export function compareVersions(running, latest) {
  if (!latest) return 'unknown';
  if (!running) return 'unknown';
  return running === latest ? 'current' : 'new';
}

export const freshVersionUrl = (base = 'data/version.json', now = Date.now()) => `${base}?${FRESH_PARAM}=${now}`;

export function describeCheck(result) {
  switch (result) {
    case 'new': return 'Hay una versión nueva de la guía.';
    case 'current': return 'Tienes la última versión.';
    case 'offline': return 'Sin conexión: no se puede comprobar ahora. La guía guardada sigue funcionando.';
    case 'checking': return 'Comprobando…';
    default: return 'No se ha podido comprobar la versión. Inténtalo de nuevo con conexión.';
  }
}

export function initUpdates({ win = window, doc = document, fetchFn = (...args) => win.fetch(...args), now = () => Date.now() } = {}) {
  const banner = doc.getElementById('update-banner');
  const bannerText = doc.getElementById('update-banner-text');
  const reloadButton = doc.getElementById('update-reload');
  const laterButton = doc.getElementById('update-later');
  const versionLabel = doc.getElementById('update-version');
  const statusLabel = doc.getElementById('update-status');
  const checkButton = doc.getElementById('update-check');

  const registration = async () => { try { return (await win.navigator.serviceWorker?.getRegistration?.()) ?? null; } catch { return null; } };
  let running = null;
  let latest = null;
  let dismissed = false;
  let lastCheck = 0;
  let hadController = Boolean(win.navigator.serviceWorker?.controller);

  const readVersion = async (url, options) => {
    const response = await fetchFn(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()).version ?? null;
  };

  function showBanner(version) {
    latest = version ?? latest;
    if (dismissed || !banner) return;
    if (bannerText) bannerText.textContent = `Hay una versión nueva${latest ? ` (${latest})` : ''}`;
    banner.hidden = false;
  }

  function setStatus(result) {
    if (statusLabel) statusLabel.textContent = describeCheck(result);
  }

  async function checkNow({ manual = false } = {}) {
    if (win.navigator.onLine === false) { if (manual) setStatus('offline'); return 'offline'; }
    if (manual) setStatus('checking');
    lastCheck = now();
    try {
      (await registration())?.update?.().catch(() => {}); // let the browser look for a new service worker in parallel
      const newest = await readVersion(freshVersionUrl('data/version.json', lastCheck), { cache: 'no-store' });
      const result = compareVersions(running, newest);
      if (result === 'new') showBanner(newest);
      if (manual) setStatus(result);
      return result;
    } catch {
      if (manual) setStatus(win.navigator.onLine === false ? 'offline' : 'error');
      return win.navigator.onLine === false ? 'offline' : 'error';
    }
  }

  async function applyUpdate() {
    if (reloadButton) { reloadButton.disabled = true; reloadButton.textContent = 'Actualizando…'; }
    try {
      const current = await registration();
      await current?.update?.();
      // Wait (briefly) for the new worker to take over, so the reload serves the new files.
      await new Promise((resolve) => {
        const timer = win.setTimeout(resolve, 15000);
        win.navigator.serviceWorker?.addEventListener('controllerchange', () => { win.clearTimeout(timer); resolve(); }, { once: true });
        if (!current?.installing && !current?.waiting) win.setTimeout(resolve, 1500);
      });
    } catch { /* reload anyway */ }
    win.location.reload();
  }

  reloadButton?.addEventListener('click', applyUpdate);
  laterButton?.addEventListener('click', () => { dismissed = true; if (banner) banner.hidden = true; });
  checkButton?.addEventListener('click', () => { dismissed = false; checkNow({ manual: true }); });

  // A new worker took control while this page was open: the files behind it changed.
  win.navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (hadController) showBanner(latest);
    hadController = true;
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible' && now() - lastCheck > CHECK_EVERY_MS) checkNow();
  });
  win.addEventListener('online', () => checkNow());

  // The version on screen is the one saved with the app files (the worker answers this URL from its copy).
  readVersion('data/version.json').then((version) => {
    running = version;
    if (versionLabel) versionLabel.textContent = version ?? '—';
    win.setTimeout(() => checkNow(), 1500);
  }).catch(() => { if (versionLabel) versionLabel.textContent = '—'; });

  return { checkNow, applyUpdate, getVersions: () => ({ running, latest }) };
}
