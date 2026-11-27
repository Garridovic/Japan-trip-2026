import test from 'node:test';
import assert from 'node:assert/strict';
import { tripStatus, dateRange, nightsLabel, addDays, weekdayShort, dateShort } from '../js/modules/trip-status.js';

const kyoto = { arrival: '2026-12-11', departure: '2026-12-15' };
const at = (iso, time = '12:00') => new Date(`${iso}T${time}:00`);

test('before the trip it counts days; the day before says "mañana"', () => {
  assert.equal(tripStatus(kyoto, at('2026-11-27')).label, 'Faltan 14 días');
  assert.equal(tripStatus(kyoto, at('2026-12-10')).label, 'Empieza mañana');
  assert.equal(tripStatus(kyoto, at('2026-11-27')).kind, 'before');
});

test('during the trip it says which day it is, then the departure day', () => {
  assert.equal(tripStatus(kyoto, at('2026-12-11')).label, 'Día 1 de 4');
  assert.equal(tripStatus(kyoto, at('2026-12-12')).label, 'Día 2 de 4');
  assert.equal(tripStatus(kyoto, at('2026-12-14', '23:30')).label, 'Día 4 de 4');
  assert.equal(tripStatus(kyoto, at('2026-12-15')).label, 'Día de salida');
  assert.equal(tripStatus(kyoto, at('2026-12-16')).kind, 'after');
});

test('dates are formatted for the header and cities without dates do not break', () => {
  assert.equal(dateRange('2026-12-11', '2026-12-15'), '11–15 dic');
  assert.equal(dateRange('2026-11-30', '2026-12-02'), '30 nov–2 dic');
  assert.equal(nightsLabel(1), '1 noche');
  assert.equal(nightsLabel(4), '4 noches');
  assert.equal(tripStatus({}, at('2026-12-11')).kind, 'unknown');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekdayShort('2026-12-12'), 'Sáb');
  assert.equal(dateShort('2026-12-12'), '12 dic');
});
