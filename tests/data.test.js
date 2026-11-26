import test from 'node:test';
import assert from 'node:assert/strict';
import places from '../data/places.json' with { type: 'json' };
import restaurants from '../data/restaurants.json' with { type: 'json' };
import details from '../data/details.json' with { type: 'json' };
import events from '../data/events.json' with { type: 'json' };
import version from '../data/version.json' with { type: 'json' };

const isValidCoordinate = (lat, lng) =>
  Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
  Number.isFinite(lng) && lng >= -180 && lng <= 180;

test('place and restaurant IDs are unique', () => {
  const ids = [...places, ...restaurants].map(({ id }) => id);
  assert.equal(ids.length, new Set(ids).size);
});

test('all places and restaurants have valid coordinates', () => {
  [...places, ...restaurants].forEach(({ id, lat, lng }) => {
    assert.ok(isValidCoordinate(lat, lng), `Invalid coordinates for ${id}`);
  });
});

test('every place has a matching detail record', () => {
  const detailIds = new Set(details.map(({ id }) => id));
  places.forEach(({ id }) => assert.ok(detailIds.has(id), `Missing details for ${id}`));
});

test('detail IDs are unique and photo collections are arrays', () => {
  const ids = details.map(({ id }) => id);
  assert.equal(ids.length, new Set(ids).size);
  details.forEach(({ id, photos }) => {
    assert.ok(Array.isArray(photos), `Photos must be an array for ${id}`);
  });
});

test('all map entries have required display fields', () => {
  [...places, ...restaurants].forEach(({ id, name, type, desc, query }) => {
    assert.ok(id && name && type && desc && query, `Missing required fields for ${id}`);
  });
});

test('event plan has a start, finish and route stops', () => {
  assert.ok(events.start);
  assert.ok(events.finish);
  assert.ok(Array.isArray(events.routeStops));
  assert.ok(events.routeStops.length > 0);
});

test('application version metadata is present', () => {
  assert.match(version.version, /^V\d+$/);
  assert.ok(version.updated);
});
