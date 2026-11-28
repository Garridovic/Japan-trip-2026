// Map point groups: nearby points join into one numbered circle that splits apart as the user zooms in.
// Pure helpers (options, icon markup, the automation switch); map.js wires them to Leaflet.markercluster.
export const ENABLE_KEY = 'map-cluster-enabled'; // automated browsers (tests) see every point loose unless this is '1'
export const CLUSTER_RADIUS = 44; // px: two points closer than one finger tip join a group
export const LOOSE_FROM_ZOOM = 16; // street level: every point on its own
export const HIT_SIZE = 44; // px: the invisible tap area of every point, whatever its drawn size

/** Groups are on for people; tests that count or click single points turn them on explicitly. */
export function clusteringEnabled(win = globalThis, storage) {
  try { storage = storage ?? win.localStorage; } catch { storage = null; }
  let forced = null;
  try { forced = storage?.getItem(ENABLE_KEY) ?? null; } catch { /* blocked storage */ }
  if (forced === '1') return true;
  if (forced === '0') return false;
  return !win.navigator?.webdriver;
}

/** Text of a group: its count, capped so the circle never grows. */
export const clusterLabel = (count) => (count > 99 ? '99+' : String(count));

/** Accessible name of a group, read by screen readers and shown as its tooltip. */
export const clusterName = (count) => `${count} lugares aquí. Toca para acercar`;

/** Options for L.markerClusterGroup (iconCreateFunction is added by map.js, which owns Leaflet). */
export function clusterOptions({ reducedMotion = false } = {}) {
  return {
    maxClusterRadius: CLUSTER_RADIUS,
    disableClusteringAtZoom: LOOSE_FROM_ZOOM,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    animate: !reducedMotion,
    animateAddingMarkers: false,
    removeOutsideVisibleBounds: true
  };
}
