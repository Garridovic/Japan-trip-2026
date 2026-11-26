// Browser history for full-screen overlays: the Back button (or Android gesture) closes the open sheet
// instead of leaving the guide. One overlay at a time.
let active = null; // { id, close }
let ignoreNextPop = false;
let popHandled = false;

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
  }
}

/** True when the popstate that just fired belonged to an overlay (the app must not treat it as navigation). */
export const popstateWasOverlay = () => popHandled;

export function initOverlayHistory(win = window) {
  win.addEventListener('popstate', (event) => {
    popHandled = false;
    if (ignoreNextPop) { ignoreNextPop = false; popHandled = true; return; }
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
