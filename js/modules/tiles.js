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

/**
 * The tiles worth keeping for a city: the whole area of its points at overview zooms (13-14),
 * plus the centre in detail (15). Capped at MAX_SAVED_TILES; the largest zoom is dropped first.
 */
export function planCityTiles({ center, points }) {
  const area = points.length ? boxOfPoints(points, 1) : boxAround(center, 4);
  const plans = [
    [...tilesForBox(area, 13), ...tilesForBox(area, 14)],
    tilesForBox(boxAround(center, 1.6), 15)
  ];
  const unique = new Map();
  for (const tile of plans.flat()) unique.set(`${tile.z}/${tile.x}/${tile.y}`, tile);
  return [...unique.values()].sort((a, b) => a.z - b.z).slice(0, MAX_SAVED_TILES);
}
