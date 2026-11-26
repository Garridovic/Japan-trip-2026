// A horizontal swipe: far enough sideways and clearly more sideways than vertical (so scrolling never counts).
export const SWIPE_MIN_PX = 60;
export const SWIPE_MAX_SLOPE = 0.6; // |dy| may be at most 60 % of |dx|

/** 'left' (finger moved left: next), 'right' (previous) or null. */
export function swipeDirection(dx, dy, { minPx = SWIPE_MIN_PX, maxSlope = SWIPE_MAX_SLOPE } = {}) {
  if (Math.abs(dx) < minPx) return null;
  if (Math.abs(dy) > Math.abs(dx) * maxSlope) return null;
  return dx < 0 ? 'left' : 'right';
}
