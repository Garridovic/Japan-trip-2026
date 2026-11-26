// Browser history for full-screen overlays: the Back button (or Android gesture) closes the open sheet
// instead of leaving the guide. One overlay at a time.
let active = null; // { id, close }
let ignoreNextPop = false;
let popHandled = false;
let settleWaiters = [];
const settle = () => { const waiters = settleWaiters; settleWaiters = []; waiters.forEach((resolve) => resolve()); };

/** Call when an overlay opens. `close` hides it without touching the history. */
export function openOverlay(id, close, win = window) {
  if (active) return; // a sheet is already open: do not stack history entries
  active = { id, close };
  win.history.pushState({ ...(win.history.state ?? {}), overlay: id }, '', win.location.href);
}

/** Call when the overlay closes by any means. Removes its history entry if it is still the current one. */
export function releaseOverlay(id, win = window) {
  if (!active || active.id !== id) return;
  active = null;
  if (win.history.state?.overlay === id) {
    ignoreNextPop = true;
    win.history.back();
    setTimeout(() => { ignoreNextPop = false; settle(); }, 500); // safety net if the browser never reports the pop
  }
}

/**
 * Resolves once the history entry of an overlay that was just closed has been removed. Navigation must wait for it:
 * pushing a new entry while that Back is still pending would mix up the history.
 */
export const whenOverlaySettled = () => (ignoreNextPop ? new Promise((resolve) => { settleWaiters.push(resolve); }) : Promise.resolve());

/** True when the popstate that just fired belonged to an overlay (the app must not treat it as navigation). */
export const popstateWasOverlay = () => popHandled;

export function initOverlayHistory(win = window) {
  win.addEventListener('popstate', (event) => {
    popHandled = false;
    if (ignoreNextPop) { ignoreNextPop = false; popHandled = true; settle(); return; }
    if (active) {
      const { close } = active;
      active = null;
      close();
      popHandled = true;
    } else if (event.state?.overlay) {
      popHandled = true; // forward onto an overlay entry that is no longer open: ignore
    }
  });
}
