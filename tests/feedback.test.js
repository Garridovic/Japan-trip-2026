import test from 'node:test';
import assert from 'node:assert/strict';
import { haptic, trimToasts, MAX_TOASTS } from '../js/modules/feedback.js';

test('haptic uses navigator.vibrate when it exists and never throws without it', () => {
  const calls = [];
  assert.equal(haptic(20, { vibrate: (ms) => { calls.push(ms); return true; } }), true);
  assert.deepEqual(calls, [20]);
  assert.equal(haptic(20, {}), false);
  assert.equal(haptic(20, null), false);
  assert.equal(haptic(20, { vibrate: () => { throw new Error('blocked'); } }), false);
});

test('only the newest toasts are kept', () => {
  assert.deepEqual(trimToasts([1, 2, 3, 4]), [3, 4]);
  assert.deepEqual(trimToasts([1]), [1]);
  assert.equal(MAX_TOASTS, 2);
});
