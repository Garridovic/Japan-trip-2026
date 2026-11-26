// Identifier conventions (V11)
//
// Every dataset stores LOCAL ids ("fushimi", "food-01"), unique inside one city.
// Whenever data from more than one city could meet in memory, the runtime builds a
// composite key "<cityId>:<localId>" with cityKey(). City ids are lowercase slugs.

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidId = (value) => typeof value === 'string' && ID_PATTERN.test(value);

export const cityKey = (cityId, localId) => `${cityId}:${localId}`;

export function parseCityKey(key) {
  const separator = key.indexOf(':');
  if (separator <= 0) throw new Error(`Invalid composite key: ${key}`);
  return { cityId: key.slice(0, separator), localId: key.slice(separator + 1) };
}
