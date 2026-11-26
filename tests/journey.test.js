import test from 'node:test';
import assert from 'node:assert/strict';
import { cityKey, parseCityKey, isValidId } from '../js/modules/ids.js';
import {
  validateJourney, enabledCities, connectionsFrom, resolveActiveCity, requestedCityFromSearch
} from '../js/modules/journey.js';
import { indexCity, findPoint, findDetail } from '../js/modules/city-index.js';

const journey = {
  id: 'trip',
  title: 'Trip',
  cities: [
    { id: 'alpha', name: 'Alpha', enabled: true },
    { id: 'beta', name: 'Beta', enabled: true },
    { id: 'gamma', name: 'Gamma', enabled: false }
  ],
  connections: [{ from: 'alpha', to: 'beta' }, { from: 'beta', to: 'gamma' }]
};

test('composite keys round-trip and ids are validated', () => {
  assert.equal(cityKey('kyoto', 'fushimi'), 'kyoto:fushimi');
  assert.deepEqual(parseCityKey('osaka:food-01'), { cityId: 'osaka', localId: 'food-01' });
  assert.throws(() => parseCityKey('nocity'));
  ['kyoto', 'food-01', 'a1'].forEach((id) => assert.ok(isValidId(id)));
  ['', 'Kyoto', '../etc', 'a/b', 'a_b', '-a', null].forEach((id) => assert.ok(!isValidId(id), String(id)));
});

test('validateJourney reports configuration problems', () => {
  assert.deepEqual(validateJourney(journey), []);
  assert.ok(validateJourney({ ...journey, cities: [] }).length > 0);
  assert.ok(validateJourney({ ...journey, connections: [{ from: 'alpha', to: 'nowhere' }] }).some((p) => p.includes('nowhere')));
  assert.ok(validateJourney({ ...journey, cities: [journey.cities[0], journey.cities[0]] }).some((p) => p.includes('duplicate')));
});

test('only enabled cities are exposed and connections are grouped by origin', () => {
  assert.deepEqual(enabledCities(journey).map(({ id }) => id), ['alpha', 'beta']);
  assert.equal(connectionsFrom(journey, 'alpha').length, 1);
  assert.equal(connectionsFrom(journey, 'gamma').length, 0);
});

test('the active city is resolved safely from the URL', () => {
  assert.deepEqual(resolveActiveCity(journey, null), { cityId: 'alpha' });
  assert.deepEqual(resolveActiveCity(journey, 'beta'), { cityId: 'beta' });
  for (const bad of ['gamma', 'unknown', '../../etc/passwd', '']) {
    const result = resolveActiveCity(journey, bad);
    if (bad === '') assert.equal(result.cityId, 'alpha');
    else {
      assert.equal(result.cityId, 'alpha', `${bad} must fall back to the first enabled city`);
      assert.ok(result.problem, `${bad} must report a configuration problem`);
    }
  }
  assert.throws(() => resolveActiveCity({ cities: [{ id: 'a', enabled: false }] }, null));
  assert.equal(requestedCityFromSearch('?city=beta&x=1'), 'beta');
  assert.equal(requestedCityFromSearch(''), null);
});

test('a place id shared by two cities never resolves the other city details', () => {
  const build = (name) => ({
    places: [{ id: 'shrine', name, type: 'itinerary' }],
    restaurants: [{ id: 'food-01', name: `${name} food`, type: 'restaurant' }],
    details: [{ id: 'shrine', description: `Description of ${name}`, photos: [] }]
  });
  const alpha = indexCity('alpha', build('Alpha shrine'));
  const beta = indexCity('beta', build('Beta shrine'));
  assert.equal(findPoint(alpha, 'shrine').name, 'Alpha shrine');
  assert.equal(findPoint(beta, 'shrine').name, 'Beta shrine');
  assert.equal(findDetail(alpha, 'shrine').description, 'Description of Alpha shrine');
  assert.equal(findDetail(beta, 'shrine').description, 'Description of Beta shrine');
  assert.equal(alpha.points.length, 2);
  assert.equal(findPoint(alpha, 'missing'), undefined);
  // A detail that exists only in another city is not reachable.
  const lonely = indexCity('gamma', { places: [{ id: 'other', name: 'Other' }], restaurants: [], details: [] });
  assert.equal(findDetail(lonely, 'shrine'), undefined);
});
