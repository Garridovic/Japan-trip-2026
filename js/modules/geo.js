// Pure geography helpers (no DOM).
export const NEAR_CITY_KM = 50;

export function distanceKm(a, b) {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export const formatDistance = (distance) => distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;

/** Rounded distance text for long distances: "365 km". */
export const formatFarDistance = (distance) => `${Math.round(distance).toLocaleString('es-ES')} km`;

/** The position is far from the city when it is farther than `limit` km from the map centre. Returns the distance or null. */
export function distanceIfFarFromCity(position, center, limit = NEAR_CITY_KM) {
  const distance = distanceKm(position, { lat: center[0], lng: center[1] });
  return distance > limit ? distance : null;
}
