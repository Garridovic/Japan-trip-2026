// Drag-to-close for every bottom sheet of the app (one utility, wired by each sheet's own module).
// - Handle (the grey bar) and header: pointer events with touch-action:none, so a finger or a mouse moves the sheet and the page
//   behind never scrolls or pulls to refresh.
// - Body: when its scroll is at the very top, a downward touch drag moves the sheet too (touch events, because the browser only
//   lets us cancel a native scroll through a non-passive touchmove).
// - Past a distance or a speed the sheet slides out and `close()` runs (the sheet's normal close: Escape, history, focus…);
//   otherwise it springs back. With prefers-reduced-motion there is no animation, the sheet just follows and jumps.

export const DRAG_START = 6; // px before a touch/click turns into a drag
export const MAX_CLOSE_DISTANCE = 120; // px
export const CLOSE_FRACTION = 0.3; // or 30 % of the sheet height, whichever is smaller
export const CLOSE_VELOCITY = 0.6; // px per ms
const SETTLE_MS = 200;

/** Whether releasing the drag dismisses the sheet. `velocity` is px/ms, positive downwards. */
export function shouldDismiss({ offset, height, velocity }) {
  if (offset <= 0) return false;
  if (velocity >= CLOSE_VELOCITY && offset > DRAG_START) return true;
  return offset >= Math.min(MAX_CLOSE_DISTANCE, Math.max(DRAG_START, height * CLOSE_FRACTION));
}

const GRAB_SELECTOR = '.sheet-grab, .map-sheet-grab, .weather-grab';

/** Makes sure the sheet has a 44 px handle as its first child and returns it. */
export function ensureGrab(sheet) {
  let grab = sheet.querySelector(`:scope > ${GRAB_SELECTOR}`);
  if (!grab) {
    grab = sheet.ownerDocument.createElement('div');
    grab.setAttribute('aria-hidden', 'true');
    sheet.prepend(grab);
  }
  grab.classList.add('sheet-grab');
  return grab;
}

const canScrollUp = (node, stop) => {
  for (let el = node; el && el !== stop?.parentElement; el = el.parentElement) {
    if (el.nodeType === 1 && el.scrollTop > 0) return true;
    if (el === stop) break;
  }
  return false;
};

/**
 * @param {HTMLElement} sheet the element that moves
 * @param {object} options
 * @param {() => void} options.close the sheet's own close function
 * @param {HTMLElement[]} [options.regions] extra drag areas besides the handle (usually the header)
 * @param {HTMLElement|null} [options.scroller] the element that scrolls the content; at scrollTop 0 a downward drag moves the sheet
 * @param {Window} [options.win]
 * @returns {{ destroy(): void }}
 */
export function enableSheetDrag(sheet, { close, regions = [], scroller = sheet, win = window } = {}) {
  const grab = ensureGrab(sheet);
  const areas = [grab, ...regions.filter(Boolean)];
  areas.forEach((area) => area.classList.add('sheet-drag-area'));
  const reducedMotion = () => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  let gesture = null; // { y0, y, prevY, t, prevT, dragging, source, pointerId }
  let settleTimer = null;

  const reset = () => {
    clearTimeout(settleTimer);
    sheet.style.transform = '';
    sheet.style.transition = '';
    sheet.style.animation = '';
    sheet.classList.remove('is-dragging');
  };
  const offsetOf = () => Math.max(0, (gesture?.y ?? 0) - (gesture?.y0 ?? 0));

  function begin(y, source, pointerId) {
    reset();
    const now = performance.now();
    gesture = { y0: y, y, prevY: y, t: now, prevT: now, dragging: false, source, pointerId };
  }

  /** Returns true when the gesture is (or just became) a drag, so the caller cancels the native scroll. */
  function move(y) {
    if (!gesture) return false;
    const now = performance.now();
    if (now - gesture.t > 60) { gesture.prevY = gesture.y; gesture.prevT = gesture.t; }
    gesture.y = y;
    gesture.t = now;
    if (!gesture.dragging) {
      if (gesture.source === 'body' && scroller && scroller.scrollTop > 0) { gesture.y0 = y; return false; } // still scrolling the content
      if (y - gesture.y0 < DRAG_START) {
        if (gesture.source === 'body' && y - gesture.y0 < -DRAG_START) gesture = null; // upwards: it is a normal scroll
        return false;
      }
      gesture.dragging = true;
      gesture.y0 = y - DRAG_START; // the sheet follows from where the drag was recognised, without a jump
      sheet.style.animation = 'none';
      sheet.style.transition = 'none';
      sheet.classList.add('is-dragging');
    }
    sheet.style.transform = `translateY(${offsetOf()}px)`;
    return true;
  }

  function end(cancelled) {
    if (!gesture) return;
    const { dragging, prevY, prevT, y, t } = gesture;
    const offset = offsetOf();
    gesture = null;
    if (!dragging) return;
    // the click that follows a drag that started on a button must not press it
    const swallow = (event) => { event.stopPropagation(); event.preventDefault(); };
    sheet.addEventListener('click', swallow, true);
    setTimeout(() => sheet.removeEventListener('click', swallow, true), 0);
    const velocity = t > prevT ? (y - prevY) / (t - prevT) : 0;
    const height = sheet.getBoundingClientRect().height;
    const dismiss = !cancelled && shouldDismiss({ offset, height, velocity });
    if (reducedMotion()) {
      reset();
      if (dismiss) close();
      return;
    }
    sheet.style.transition = `transform ${SETTLE_MS}ms ease-out`;
    sheet.style.transform = dismiss ? `translateY(${Math.max(height, offset)}px)` : 'translateY(0)';
    settleTimer = setTimeout(() => {
      if (dismiss) { close(); }
      reset();
    }, SETTLE_MS);
  }

  // ----- pointer path: handle and header (finger or mouse) -----
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };
  areas.forEach((area) => {
    listen(area, 'pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (!event.isPrimary) return;
      begin(event.clientY, 'handle', event.pointerId);
    });
    listen(area, 'pointermove', (event) => {
      if (!gesture || gesture.source !== 'handle' || event.pointerId !== gesture.pointerId) return;
      const was = gesture.dragging;
      if (move(event.clientY) && !was) { try { area.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ } }
      if (gesture?.dragging) event.preventDefault();
    });
    const up = (event) => { if (gesture?.source === 'handle' && event.pointerId === gesture.pointerId) end(event.type === 'pointercancel'); };
    listen(area, 'pointerup', up);
    listen(area, 'pointercancel', up);
  });

  // ----- touch path: the scrolling body, only while it is at the top -----
  const inArea = (target) => areas.some((area) => area.contains(target));
  listen(sheet, 'touchstart', (event) => {
    if (event.touches.length !== 1 || inArea(event.target)) return;
    if (canScrollUp(event.target, scroller ?? sheet)) { gesture = null; return; }
    begin(event.touches[0].clientY, 'body');
  }, { passive: true });
  listen(sheet, 'touchmove', (event) => {
    if (!gesture || gesture.source !== 'body') {
      // a sheet whose content does not scroll must not hand the swipe to the page behind
      if (!inArea(event.target) && scroller && scroller.scrollHeight <= scroller.clientHeight + 1 && event.cancelable) event.preventDefault();
      return;
    }
    if (move(event.touches[0].clientY) && event.cancelable) event.preventDefault();
  }, { passive: false });
  const touchEnd = (event) => { if (gesture?.source === 'body') end(event.type === 'touchcancel'); };
  listen(sheet, 'touchend', touchEnd);
  listen(sheet, 'touchcancel', touchEnd);

  return {
    destroy() {
      reset();
      gesture = null;
      cleanups.forEach((fn) => fn());
      areas.forEach((area) => area.classList.remove('sheet-drag-area'));
    }
  };
}
