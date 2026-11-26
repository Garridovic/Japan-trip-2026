// "Modo taxi": pure helpers. A stay may carry `nameJa`, `addressJa` and `phone` (public hotel data, never private data).
// Without Japanese text the screen still works with the Latin name and address, and says so.

const norm = (value) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9぀-ヿ一-鿿]+/g, '');

export const findStay = (stays, { id, name } = {}) =>
  (stays ?? []).find((stay) => id && stay.id === id) ?? (name ? (stays ?? []).find((stay) => norm(stay.name) === norm(name)) : undefined) ?? null;

/** What the taxi screen shows. `fallback` is used when the hotel is not in the lodging list. */
export function taxiModel(stay, fallback = {}) {
  const source = stay ?? {};
  const name = source.name ?? fallback.name ?? '';
  const mapsUrl = source.mapsUrl ?? fallback.mapsUrl
    ?? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([name, fallback.city].filter(Boolean).join(', '))}`;
  const nameJa = source.nameJa || '';
  const addressJa = source.addressJa || '';
  return {
    name,
    city: source.cityName ?? fallback.city ?? '',
    address: source.address ?? fallback.address ?? '',
    nameJa,
    addressJa,
    phone: source.phone || '',
    mapsUrl,
    hasJapanese: Boolean(nameJa && addressJa),
    // The text that gets copied: the Japanese address when there is one (it can be pasted into a maps app or a message).
    copyText: [nameJa || name, addressJa || source.address || ''].filter(Boolean).join('\n')
  };
}

export const telHref = (phone) => `tel:${String(phone).replace(/[^+\d]/g, '')}`;
