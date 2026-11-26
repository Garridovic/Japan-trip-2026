// "Guardar mapa para usar sin conexión": saves a small plan of OpenStreetMap tiles (see tiles.js for the policy note)
// and always says what is saved. Reused by any view that shows the same control.
import { TILE_CACHE_NAME, tileUrl, describeSaveState, zoomRange } from './tiles.js';

const PAUSE_MS = 120; // one tile at a time, politely

/**
 * Pauses are multiplied by window.__tilePauseScale when a test sets it (e.g. 0 so a browser test does not wait
 * minutes). Nothing sets it in the app, so in production the pauses are exactly PAUSE_MS.
 */
export const pauseScale = (win) => (typeof win.__tilePauseScale === 'number' && win.__tilePauseScale >= 0 ? win.__tilePauseScale : 1);

export function initMapOffline({ button, status, progress, win = window, cacheStorage = win.caches, fetchFn = (...args) => win.fetch(...args), pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms * pauseScale(win))) }) {
  let plan = [];
  let city = 'la ciudad';
  let state = { kind: 'none', total: 0 };
  let running = false;

  const online = () => win.navigator.onLine !== false;
  const render = () => {
    const view = describeSaveState(state, { online: online(), city, range: zoomRange(plan) });
    status.textContent = plan.length ? view.text : '';
    button.textContent = view.button;
    button.disabled = view.disabled || !plan.length;
    button.dataset.state = state.kind;
    if (progress) {
      progress.hidden = state.kind !== 'saving';
      progress.max = Math.max(1, state.total ?? 1);
      progress.value = state.done ?? 0;
    }
  };

  async function coverage() {
    if (!cacheStorage || !plan.length) return 0;
    const cache = await cacheStorage.open(TILE_CACHE_NAME);
    let saved = 0;
    for (const { z, x, y } of plan) if (await cache.match(tileUrl(z, x, y))) saved += 1;
    return saved;
  }

  async function refresh() {
    if (running) return;
    const saved = await coverage();
    state = saved === 0 ? { kind: 'none', total: plan.length }
      : saved === plan.length ? { kind: 'complete', total: plan.length }
        : { kind: 'partial', saved, total: plan.length };
    render();
  }

  async function save() {
    if (running || !plan.length || !online()) return;
    running = true;
    const cache = await cacheStorage.open(TILE_CACHE_NAME);
    let done = 0;
    let failed = 0;
    const missing = [];
    for (const tile of plan) if (!(await cache.match(tileUrl(tile.z, tile.x, tile.y)))) missing.push(tile);
    const alreadySaved = plan.length - missing.length;
    const attempt = async ({ z, x, y }) => {
      const url = tileUrl(z, x, y);
      try {
        const response = await fetchFn(url, { mode: 'cors' });
        if (!response.ok) return false;
        await cache.put(url, response);
        return true;
      } catch { return false; }
    };
    state = { kind: 'saving', done: alreadySaved, total: plan.length };
    render();
    const retry = [];
    for (const tile of missing) {
      if (!(await attempt(tile))) retry.push(tile);
      done += 1;
      state = { kind: 'saving', done: alreadySaved + done, total: plan.length };
      render();
      await pause(PAUSE_MS);
    }
    for (const tile of retry) { // one more try for the tiles that failed, after a longer pause
      await pause(PAUSE_MS * 4);
      if (!(await attempt(tile))) failed += 1;
    }
    running = false;
    const saved = await coverage();
    state = failed === 0 && saved === plan.length ? { kind: 'complete', total: plan.length }
      : { kind: 'error', total: plan.length, saved, failed: plan.length - saved };
    render();
  }

  button.addEventListener('click', save);
  win.addEventListener('online', refresh);
  win.addEventListener('offline', render);
  button.hidden = !cacheStorage;
  render();

  return {
    /** Called when the active city (and so its tile plan) changes. */
    async setPlan(nextPlan, cityName) {
      plan = nextPlan;
      city = cityName ?? city;
      await refresh();
    },
    refresh,
    save,
    getState: () => state
  };
}
