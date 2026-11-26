// Pure helpers for the "Viaje" view (where we sleep). No DOM access.
const DAY = 24 * 60 * 60 * 1000;
// Anything that would be a problem on a public site must never be added to the data.
export const FORBIDDEN_KEYS = ['pin', 'code', 'password', 'booking', 'bookingnumber', 'reservation', 'reservationnumber', 'confirmation', 'price', 'cost', 'amount', 'paidby', 'payer', 'payment'];

const parse = (iso) => Date.UTC(...iso.split('-').map((part, index) => (index === 1 ? Number(part) - 1 : Number(part))));

export const nights = (checkIn, checkOut) => Math.round((parse(checkOut) - parse(checkIn)) / DAY);

const weekday = (iso) => new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' }).format(parse(iso)).replace('.', '');
const month = (iso) => new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(parse(iso)).replace('.', '');
const day = (iso) => Number(iso.slice(8, 10));
const capitalise = (text) => text[0].toUpperCase() + text.slice(1);

/** "Dom 8 → Mar 10 dic" (the month is repeated only when it changes). */
export function formatRange(checkIn, checkOut) {
  const sameMonth = month(checkIn) === month(checkOut);
  const start = `${capitalise(weekday(checkIn))} ${day(checkIn)}${sameMonth ? '' : ` ${month(checkIn)}`}`;
  return `${start} → ${capitalise(weekday(checkOut))} ${day(checkOut)} ${month(checkOut)}`;
}

export const formatDay = (iso) => `${day(iso)} de ${new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(parse(iso))}`;

/** 'past' | 'current' | 'next' | 'future' relative to a YYYY-MM-DD date (the night of `today` belongs to the stay it starts). */
export function statusFor(stay, today, stays = []) {
  if (today >= stay.checkOut) return 'past';
  if (today >= stay.checkIn) return 'current';
  const upcoming = stays.find((other) => today < other.checkIn);
  return upcoming && upcoming.id === stay.id ? 'next' : 'future';
}

/** "Hotel, address": what you show to a taxi driver or paste into a map. */
export const copyText = (stay) => `${stay.name}, ${stay.address}`;

export function validateLodging(data, knownCityIds = []) {
  const problems = [];
  if (!Array.isArray(data?.stays) || data.stays.length === 0) return ['stays must be a non-empty array'];
  const seen = new Set();
  let previous = null;
  const hasText = (value) => typeof value === 'string' && value.trim() !== '';
  const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');
  data.stays.forEach((stay) => {
    const label = stay?.id ?? '?';
    if (!/^[a-z0-9-]+$/.test(stay?.id ?? '')) problems.push(`stay ${label}: invalid id`);
    if (seen.has(stay.id)) problems.push(`stay ${label}: duplicate id`);
    seen.add(stay.id);
    for (const field of ['city', 'cityName', 'name', 'address']) if (!hasText(stay[field])) problems.push(`stay ${label}: missing ${field}`);
    if (!/^https:\/\/(maps\.app\.goo\.gl|www\.google\.com\/maps|goo\.gl\/maps)\//.test(stay.mapsUrl ?? '')) problems.push(`stay ${label}: mapsUrl must be a Google Maps link`);
    if (!isDate(stay.checkIn) || !isDate(stay.checkOut)) { problems.push(`stay ${label}: dates must be YYYY-MM-DD`); return; }
    if (!stay.checkIn.startsWith('2026-') || !stay.checkOut.startsWith('2026-')) problems.push(`stay ${label}: dates must be in 2026`);
    if (nights(stay.checkIn, stay.checkOut) < 1) problems.push(`stay ${label}: needs at least one night`);
    if (previous && stay.checkIn < previous.checkOut) problems.push(`stay ${label}: overlaps the previous stay`);
    if (previous && stay.checkIn > previous.checkOut) problems.push(`stay ${label}: gap after the previous stay`);
    previous = stay;
    if (stay.freeCancellationUntil && !isDate(stay.freeCancellationUntil)) problems.push(`stay ${label}: bad freeCancellationUntil`);
    if (knownCityIds.length && !knownCityIds.includes(stay.city) && !hasText(stay.cityName)) problems.push(`stay ${label}: unknown city`);
  });
  const forbidden = [...allKeys(data)].filter((key) => FORBIDDEN_KEYS.includes(key.toLowerCase()));
  return [...problems, ...forbidden.map((key) => `forbidden key "${key}" (the repository is public)`)];
}

function* allKeys(value) {
  if (Array.isArray(value)) for (const item of value) yield* allKeys(item);
  else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) { yield key; yield* allKeys(inner); }
}
