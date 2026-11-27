// Data for the «Alojamiento» card of the header: the hotel's Japanese name (for the taxi driver) and the plan places
// closest to it, from coordinates already in places.json (straight-line distance; no request, no route calculation).
import { distanceKm } from './geo.js';

/** Distance as people say it: "760 m" under a kilometre, "1,3 km" above (rounded, Spanish decimal comma). */
export function walkText(km) {
  if (!(km >= 0)) return '';
  return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}

/** The `count` plan places (type «itinerary») nearest to the city's hotel, nearest first. Empty when there is no hotel point. */
export function nearestPlaces(places, count = 2) {
  const hotel = (places ?? []).find((place) => place.type === 'hotel' && Number.isFinite(place.lat) && Number.isFinite(place.lng));
  if (!hotel) return [];
  return places
    .filter((place) => place.type === 'itinerary' && Number.isFinite(place.lat) && Number.isFinite(place.lng))
    .map((place) => ({ id: place.id, name: place.name, km: distanceKm(hotel, place) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count)
    .map((entry) => ({ ...entry, text: walkText(entry.km) }));
}

/** The lodging record of this stay (same city, same check-in date), else the first one of the city. */
export function stayLodging(lodgingStays, cityId, arrival) {
  const ofCity = (lodgingStays ?? []).filter((item) => item.city === cityId);
  return ofCity.find((item) => item.checkIn === arrival) ?? ofCity[0] ?? null;
}
