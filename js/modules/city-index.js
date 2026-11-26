// Builds lookup tables for ONE loaded city. Pure (no DOM) so it can be unit-tested in Node.
// Keys are composite ("kyoto:fushimi"), so a place can only ever resolve details of its own city.
import { cityKey } from './ids.js';

export function indexCity(cityId, { places, restaurants, details, events = null }) {
  const pointByKey = new Map();
  [...places, ...restaurants].forEach((point) => pointByKey.set(cityKey(cityId, point.id), point));
  const detailByKey = new Map(details.map((detail) => [cityKey(cityId, detail.id), detail]));
  return { cityId, points: [...pointByKey.values()], pointByKey, detailByKey, events };
}

export const findPoint = (index, localId) => index.pointByKey.get(cityKey(index.cityId, localId));
export const findDetail = (index, localId) => index.detailByKey.get(cityKey(index.cityId, localId));
