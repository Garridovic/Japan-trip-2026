// Small feedback: toasts (short messages with an optional undo) and a soft vibration where the device has one.
// Pure helpers are exported for tests; the DOM part creates one live region the first time it is needed.
export const TOAST_MS = 4000;
export const MAX_TOASTS = 2;

/** Vibration is a bonus: it needs support (not iOS Safari) and must never throw. */
export function haptic(ms = 12, nav = typeof navigator === 'undefined' ? null : navigator) {
  try { return Boolean(nav?.vibrate?.(ms)); } catch { return false; }
}

/** Keeps the newest `limit` toasts (older ones are dropped, so they never pile up over the bar). */
export const trimToasts = (list, limit = MAX_TOASTS) => list.slice(Math.max(0, list.length - limit));

let region = null;
const live = [];
function ensureRegion() {
  if (region) return region;
  region = document.createElement('div');
  region.className = 'toast-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  document.body.append(region);
  return region;
}

export function toast(message, { actionLabel = '', onAction = null, duration = TOAST_MS } = {}) {
  const root = ensureRegion();
  const node = document.createElement('div');
  node.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  node.append(text);
  const remove = () => { node.remove(); const i = live.indexOf(node); if (i >= 0) live.splice(i, 1); };
  if (actionLabel && onAction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = actionLabel;
    button.addEventListener('click', () => { remove(); onAction(); });
    node.append(button);
  }
  live.push(node);
  root.append(node);
  trimToasts(live).length < live.length && live.slice(0, live.length - MAX_TOASTS).forEach((old) => { old.remove(); live.splice(live.indexOf(old), 1); });
  setTimeout(remove, duration);
  return remove;
}
