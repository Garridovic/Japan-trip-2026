import test from 'node:test';
import assert from 'node:assert/strict';
import { walkText, nearestPlaces, stayLodging } from '../js/modules/hotel-card.js';

test('distances read like people say them: metres under a kilometre, kilometres with a decimal comma above', () => {
  assert.equal(walkText(0.76), '760 m');
  assert.equal(walkText(0.012), '10 m');
  assert.equal(walkText(1.33), '1,3 km');
  assert.equal(walkText(12), '12,0 km');
  assert.equal(walkText(Number.NaN), '');
});

test('the nearest plan places come from the hotel coordinates; alternatives and events are not part of the plan', () => {
  const places = [
    { id: 'h', name: 'Hotel', type: 'hotel', lat: 35, lng: 135 },
    { id: 'far', name: 'Lejos', type: 'itinerary', lat: 35.02, lng: 135 },
    { id: 'near', name: 'Cerca', type: 'itinerary', lat: 35.005, lng: 135 },
    { id: 'alt', name: 'Alternativa', type: 'alternative', lat: 35.0001, lng: 135 },
    { id: 'bad', name: 'Sin coordenadas', type: 'itinerary' }
  ];
  const result = nearestPlaces(places, 2);
  assert.deepEqual(result.map((place) => place.id), ['near', 'far']);
  assert.equal(result[0].text, '560 m');
  assert.deepEqual(nearestPlaces([{ id: 'x', type: 'itinerary', lat: 1, lng: 1 }]), []); // no hotel point
});

test('the lodging record is the one of the same city and check-in date', () => {
  const stays = [{ city: 'tokyo', checkIn: '2026-12-08', nameJa: 'A' }, { city: 'tokyo', checkIn: '2026-12-18', nameJa: 'B' }, { city: 'kyoto', checkIn: '2026-12-11', nameJa: 'C' }];
  assert.equal(stayLodging(stays, 'tokyo', '2026-12-18').nameJa, 'B');
  assert.equal(stayLodging(stays, 'tokyo', '2026-01-01').nameJa, 'A');
  assert.equal(stayLodging(stays, 'osaka', '2026-12-15'), null);
});
