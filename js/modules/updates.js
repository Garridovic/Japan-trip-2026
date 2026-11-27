// "Hay una versión nueva · Actualizar": tells the user when the deployed guide is newer than the one on screen.
// The service worker keeps the guide working offline, which also means an old copy can stay in use for days (an iPhone
// home-screen app is rarely closed). So: ask for the newest version.json (the worker never answers `?fresh` from the
// saved copy), nudge the worker to look for a new build, and offer a reload. Never blocks anything and never needs internet to work.
export const FRESH_PARAM = 'fresh';
export const CHECK_EVERY_MS = 5 * 60 * 1000; // coming back to the app does not re-check more often than this
export const TAKEOVER_TIMEOUT_MS = 40 * 1000; // the new worker only has to save the app itself (a few hundred KB of files), so this is generous
export const AUTO_RETRY_AFTER_MS = 2 * 60 * 1000; // an automatic update that did not work is not retried by itself for this long
export const ATTEMPT_KEY = 'japan-trip:update-attempt'; // sessionStorage: "I reloaded to update at this time, towards this version"
export const AUTO_KEY = 'japan-trip:update-auto-at';

/** Cache names of the app and the files the service worker keeps; deleting them (and the worker) is the "start over" of last resort. */
export async function forceFreshStart(win = window) {
  const nav = win.navigator;
  if (nav.serviceWorker?.getRegistrations) for (const registration of await nav.serviceWorker.getRegistrations()) await registration.unregister();
  if (win.caches) for (const name of await win.caches.keys()) if (name.startsWith('japan-guide-')) await win.caches.delete(name);
}

/**
 * Asks the browser for the newest worker and waits until it controls this page.
 * Resolves 'took-over' (reload now serves the new files), 'failed' (the new worker could not install) or 'timeout'.
 */
export function waitForTakeover({ win = window, registration, timeoutMs = TAKEOVER_TIMEOUT_MS } = {}) {
  const container = win.navigator.serviceWorker;
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      win.clearTimeout(timer);
      container?.removeEventListener('controllerchange', onChange);
      resolve(result);
    };
    const onChange = () => finish('took-over');
    const timer = win.setTimeout(() => finish('timeout'), timeoutMs);
    container?.addEventListener('controllerchange', onChange);
    const watch = (worker) => {
      if (!worker) return;
      const look = () => {
        if (worker.state === 'redundant') finish('failed');
        else if (worker.state === 'installed') worker.postMessage?.({ type: 'skip-waiting' }); // normally it activates by itself; this just makes sure
      };
      worker.addEventListener('statechange', look);
      look();
    };
    registration?.addEventListener?.('updatefound', () => watch(registration.installing));
    watch(registration?.installing);
    watch(registration?.waiting);
    Promise.resolve(registration?.update?.()).then(() => { watch(registration?.installing); watch(registration?.waiting); }, () => {});
    if (!registration) win.setTimeout(() => finish('failed'), 0);
  });
}

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
  let touched = false; // the person already did something on this screen since it opened or came back
  let applying = false;
  let workerChanged = false; // a new worker already took control of this page, so the next reload serves the new files
  const store = (() => { try { return win.sessionStorage; } catch { return null; } })();
  const hasEditingFocus = () => {
    const el = doc.activeElement;
    return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
  };
  /** Nothing half-done on screen: no field being edited, no touch since the screen opened. Only then the update applies by itself. */
  const isIdle = () => !touched && !hasEditingFocus() && ![...doc.querySelectorAll('dialog[open], [aria-modal="true"]')].some((el) => !el.closest('[hidden]'));

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
      if (result === 'new') { latest = newest; offerOrApply(); }
      if (manual) setStatus(result);
      return result;
    } catch {
      if (manual) setStatus(win.navigator.onLine === false ? 'offline' : 'error');
      return win.navigator.onLine === false ? 'offline' : 'error';
    }
  }

  /**
   * Loads the new version. The new worker takes over (skipWaiting + claim) and the page reloads on its own files.
   * If the worker cannot take over in time, the saved copy is wiped and the guide reloads from the network: the update
   * never ends with the old version still on screen. Wiping needs the network, so offline it only reports.
   */
  async function applyUpdate({ auto = false, tookOver = false } = {}) {
    if (applying) return 'busy';
    applying = true;
    tookOver = tookOver || workerChanged;
    if (reloadButton) { reloadButton.disabled = true; reloadButton.textContent = 'Actualizando…'; }
    store?.setItem(ATTEMPT_KEY, JSON.stringify({ at: now(), from: running, to: latest }));
    if (auto) store?.setItem(AUTO_KEY, String(now()));
    let outcome = tookOver ? 'took-over' : 'timeout';
    if (!tookOver) try { outcome = await waitForTakeover({ win, registration: await registration() }); } catch { /* handled below */ }
    if (outcome !== 'took-over') {
      if (win.navigator.onLine === false) {
        applying = false;
        if (reloadButton) { reloadButton.disabled = false; reloadButton.textContent = 'Actualizar'; }
        setStatus('offline');
        return 'offline';
      }
      try { await forceFreshStart(win); } catch { /* reload anyway */ }
    }
    win.location.reload();
    return outcome === 'took-over' ? 'reloading' : 'fresh-start';
  }

  /** Called when something says a new version exists: applies it by itself if nothing is half-done, otherwise shows the banner. */
  function offerOrApply({ tookOver = false } = {}) {
    const lastAuto = Number(store?.getItem(AUTO_KEY) ?? 0);
    if (isIdle() && now() - lastAuto > AUTO_RETRY_AFTER_MS) { applyUpdate({ auto: true, tookOver }); return 'auto'; }
    showBanner(latest);
    return 'banner';
  }

  // We reloaded to update and, after all that, the screen still shows the old version: wipe the saved copy once and start over.
  function verifyAfterReload() {
    let attempt = null;
    try { attempt = JSON.parse(store?.getItem(ATTEMPT_KEY) ?? 'null'); } catch { attempt = null; }
    if (!attempt) return false;
    store?.removeItem(ATTEMPT_KEY);
    if (now() - attempt.at > 10 * 60 * 1000 || !attempt.to || running !== attempt.from) return false;
    // Still on the same version as before the update: one clean start (never twice in a row).
    if (win.navigator.onLine === false) return false;
    forceFreshStart(win).then(() => win.location.reload());
    return true;
  }

  reloadButton?.addEventListener('click', () => applyUpdate());
  for (const type of ['pointerdown', 'keydown', 'touchstart']) doc.addEventListener(type, () => { touched = true; }, { capture: true, passive: true });
  laterButton?.addEventListener('click', () => { dismissed = true; if (banner) banner.hidden = true; });
  checkButton?.addEventListener('click', () => { dismissed = false; checkNow({ manual: true }); });

  // A new worker took control while this page was open: the files behind it changed.
  win.navigator.serviceWorker?.addEventListener('controllerchange', () => {
    const replaced = hadController; // the first claim of a first visit is not an update
    hadController = true;
    if (!replaced) return;
    workerChanged = true;
    if (!applying) offerOrApply({ tookOver: true });
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return;
    touched = false; // coming back to the app: a fresh screen, so a pending update may apply by itself
    if (now() - lastCheck > CHECK_EVERY_MS) checkNow();
  });
  win.addEventListener('online', () => checkNow());

  // The version on screen is the one saved with the app files (the worker answers this URL from its copy).
  readVersion('data/version.json').then((version) => {
    running = version;
    if (verifyAfterReload()) return;
    if (versionLabel) versionLabel.textContent = version ?? '—';
    win.setTimeout(() => checkNow(), 1500);
  }).catch(() => { if (versionLabel) versionLabel.textContent = '—'; });

  return { checkNow, applyUpdate, isIdle, getVersions: () => ({ running, latest }) };
}
