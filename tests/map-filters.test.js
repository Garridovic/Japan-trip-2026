import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFilters, toggleValue, matchesFilters, countActive, singleRouteDay, activeFilterList, shownLabel, describeFilters
} from '../js/modules/map-filters.js';
import { filtersButtonLabel, OFFLINE_LABELS } from '../js/modules/map-view.js';

const points = [
  { id: 'sensoji', day: '8', type: 'visit', stamp: { name: 'Sensō-ji' } },
  { id: 'kappabashi', day: '8', type: 'restaurant' },
  { id: 'ueno', day: '9', type: 'visit' },
  { id: 'meiji', day: '19', type: 'visit', stamp: { name: 'Meiji' } },
  { id: 'shared', day: '9,19', type: 'visit' },
  { id: 'hotel', day: 'hotel', type: 'hotel' },
  { id: 'teamlab', day: 'extra', type: 'visit' }
];
const ids = (filters, isPending) => points.filter((point) => matchesFilters(point, filters, isPending)).map((point) => point.id);

test('no filters shows every point', () => {
  assert.deepEqual(ids(emptyFilters()), points.map((point) => point.id));
  assert.equal(countActive(emptyFilters()), 0);
});

test('several days add up, and a point planned for two days shows with either', () => {
  assert.deepEqual(ids({ ...emptyFilters(), days: ['8', '19'] }), ['sensoji', 'kappabashi', 'meiji', 'shared']);
  assert.deepEqual(ids({ ...emptyFilters(), days: ['9'] }), ['ueno', 'shared']);
  assert.deepEqual(ids({ ...emptyFilters(), days: ['extra'] }), ['teamlab']);
});

test('kinds: visits and food can be chosen together; visits are everything that is not a restaurant', () => {
  assert.deepEqual(ids({ ...emptyFilters(), kinds: ['restaurantes'] }), ['kappabashi']);
  assert.ok(!ids({ ...emptyFilters(), kinds: ['visitas'] }).includes('kappabashi'));
  assert.equal(ids({ ...emptyFilters(), kinds: ['visitas', 'restaurantes'] }).length, points.length);
});

test('"solo" switches narrow the result and combine with days', () => {
  const pending = (point) => point.type === 'visit' && point.id !== 'ueno';
  assert.deepEqual(ids({ ...emptyFilters(), only: ['sellos'] }), ['sensoji', 'meiji']);
  assert.deepEqual(ids({ days: ['9'], kinds: [], only: ['pendientes'] }, pending), ['shared']);
  assert.deepEqual(ids({ days: ['8', '19'], kinds: ['visitas'], only: ['pendientes', 'sellos'] }, pending), ['sensoji', 'meiji']);
});

test('toggleValue adds and removes without touching the original list', () => {
  const list = ['8'];
  assert.deepEqual(toggleValue(list, '9'), ['8', '9']);
  assert.deepEqual(toggleValue(list, '8'), []);
  assert.deepEqual(list, ['8']);
});

test('the day route needs exactly one real day', () => {
  assert.equal(singleRouteDay({ ...emptyFilters(), days: ['19'] }), '19');
  assert.equal(singleRouteDay({ ...emptyFilters(), days: ['19', '20'] }), null);
  assert.equal(singleRouteDay({ ...emptyFilters(), days: ['extra'] }), null);
  assert.equal(singleRouteDay(emptyFilters()), null);
});

test('active filters are listed with their labels, and counted one by one', () => {
  const filters = { days: ['19', 'extra'], kinds: ['restaurantes'], only: ['sellos'] };
  const label = (value) => (value === 'extra' ? 'Alternativas' : `${value} dic`);
  assert.deepEqual(activeFilterList(filters, label).map((item) => item.label), ['19 dic', 'Alternativas', 'Comida', 'Con sello']);
  assert.equal(countActive(filters), 4);
});

test('the map pill and the status line say how many places are shown', () => {
  assert.equal(shownLabel(4, 18, 3), '4 de 18 lugares');
  assert.equal(shownLabel(18, 18, 0), '18 lugares');
  assert.equal(shownLabel(1, 1, 1), '1 de 1 lugar');
  assert.match(describeFilters(emptyFilters(), 18, 18), /Mostrando los 18 puntos/);
  assert.equal(describeFilters({ days: ['19'], kinds: [], only: ['pendientes'] }, 2, 18, (value) => `${value} dic`), 'Mostrando 2 de 18 puntos · 19 dic, Pendientes.');
});

test('the round Filtros button and the cloud have spoken names', () => {
  assert.equal(filtersButtonLabel(0), 'Filtros');
  assert.equal(filtersButtonLabel(1), 'Filtros, 1 activo');
  assert.equal(filtersButtonLabel(5), 'Filtros, 5 activos');
  assert.equal(OFFLINE_LABELS.complete, 'Mapa guardado sin conexión');
  assert.equal(OFFLINE_LABELS.none, 'Mapa sin guardar');
});
