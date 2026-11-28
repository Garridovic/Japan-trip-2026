import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDismiss, MAX_CLOSE_DISTANCE, CLOSE_VELOCITY } from '../js/modules/sheet-drag.js';

test('a long drag closes the sheet, a short slow one does not', () => {
  assert.equal(shouldDismiss({ offset: MAX_CLOSE_DISTANCE, height: 600, velocity: 0 }), true);
  assert.equal(shouldDismiss({ offset: 40, height: 600, velocity: 0.1 }), false);
});
test('a fast flick closes it even over a short distance', () => {
  assert.equal(shouldDismiss({ offset: 30, height: 600, velocity: CLOSE_VELOCITY + 0.1 }), true);
});
test('a small sheet closes at 30 % of its height', () => {
  assert.equal(shouldDismiss({ offset: 40, height: 120, velocity: 0 }), true);
  assert.equal(shouldDismiss({ offset: 20, height: 120, velocity: 0 }), false);
});
test('dragging up or not at all never closes', () => {
  assert.equal(shouldDismiss({ offset: 0, height: 300, velocity: 2 }), false);
  assert.equal(shouldDismiss({ offset: -50, height: 300, velocity: 2 }), false);
});
