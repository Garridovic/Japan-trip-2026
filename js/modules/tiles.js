// Map tiles for offline use. OpenStreetMap's tile policy discourages bulk downloads, so this stays deliberately small:
// only when the user taps "Guardar mapa", a handful of tiles around the city, fetched one by one with a pause.
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAX_SAVED_TILES = 120;
export const TILE_CACHE_NAME = 'japan-tiles-v1';

export const tileX = (lng, zoom) => Math.floor(((lng + 180) / 360) * 2 ** zoom);
export function tileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom);
}

export const tileUrl = (z, x, y) => TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);

/** Tiles covering a lat/lng box at one zoom level. */
export function tilesForBox({ north, south, west, east }, zoom) {
  const tiles = [];
  for (let x = tileX(west, zoom); x <= tileX(east, zoom); x++) {
    for (let y = tileY(north, zoom); y <= tileY(south, zoom); y++) tiles.push({ z: zoom, x, y });
  }
  return tiles;
}

export function boxAround([lat, lng], km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return { north: lat + dLat, south: lat - dLat, west: lng - dLng, east: lng + dLng };
}

export function boxOfPoints(points, paddingKm = 1) {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const middleLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = paddingKm / 111;
  const dLng = paddingKm / (111 * Math.cos((middleLat * Math.PI) / 180));
  return { north: Math.max(...lats) + dLat, south: Math.min(...lats) - dLat, west: Math.min(...lngs) - dLng, east: Math.max(...lngs) + dLng };
}

export const AVERAGE_TILE_BYTES = 18 * 1024;
export const MIN_ZOOM = 11;

/**
 * The tiles worth keeping for a city. The map opens at an overview zoom (about 11–12, it fits all the points), so
 * the overview levels (11–14) cover the whole area of the points and zoom 15 adds the centre in detail.
 * Capped at MAX_SAVED_TILES: the most detailed tiles are dropped first, never the overview ones.
 */
export function planCityTiles({ center, points }) {
  const area = points.length ? boxOfPoints(points, 1) : boxAround(center, 4);
  const overview = [11, 12, 13, 14].flatMap((zoom) => tilesForBox(area, zoom));
  const plans = [overview, tilesForBox(boxAround(center, 1.6), 15)];
  const unique = new Map();
  for (const tile of plans.flat()) unique.set(`${tile.z}/${tile.x}/${tile.y}`, tile);
  return [...unique.values()].sort((a, b) => a.z - b.z).slice(0, MAX_SAVED_TILES);
}

export const estimateMegabytes = (count) => Math.max(1, Math.round((count * AVERAGE_TILE_BYTES) / 1024 / 1024));

export function zoomRange(plan) {
  const zooms = plan.map(({ z }) => z);
  return zooms.length ? [Math.min(...zooms), Math.max(...zooms)] : [0, 0];
}

/**
 * Text and button for the "Guardar mapa" control.
 * state: { kind: 'none' | 'saving' | 'partial' | 'complete' | 'error', total, saved?, done?, failed? }
 */
export function describeSaveState(state, { online = true, city = 'la ciudad', range = [MIN_ZOOM, 15] } = {}) {
  const mb = estimateMegabytes(state.total);
  const zooms = `zoom ${range[0]}–${range[1]}`;
  switch (state.kind) {
    case 'saving': return { text: `Guardando el mapa… ${state.done}/${state.total}`, button: 'Guardando…', disabled: true, tone: 'busy' };
    case 'complete': return {
      text: `✓ Mapa guardado: ${state.total} teselas (${zooms}, ≈ ${mb} MB). Se ve sin conexión alrededor de ${city}; fuera de esa zona el fondo del mapa saldrá en blanco.`,
      button: '✓ Mapa guardado · comprobar', disabled: !online, tone: 'ok'
    };
    case 'partial': return {
      text: online ? `Mapa guardado a medias: ${state.saved} de ${state.total} teselas. Pulsa «Completar mapa» para terminar.` : `Mapa guardado a medias (${state.saved} de ${state.total} teselas). Con conexión podrás completarlo.`,
      button: '↻ Completar mapa', disabled: !online, tone: 'partial'
    };
    case 'error': return {
      text: `No se pudieron guardar ${state.failed} de ${state.total} teselas (comprueba la conexión o inténtalo en un rato). Guardadas: ${state.saved}. Vuelve a pulsar para completar.`,
      button: '↻ Completar mapa', disabled: !online, tone: 'error'
    };
    default: return {
      text: online ? `Mapa sin guardar. Pulsa para guardar unas ${state.total} teselas (≈ ${mb} MB) alrededor de ${city} y verlo sin conexión.` : 'Sin conexión: el mapa se podrá guardar cuando vuelvas a tener internet.',
      button: `⬇ Guardar mapa (≈ ${mb} MB)`, disabled: !online, tone: 'none'
    };
  }
}
