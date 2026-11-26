import test from 'node:test';
import assert from 'node:assert/strict';
import { viewFromSearch, withView, VIEWS, DEFAULT_VIEW } from '../js/modules/views.js';

test('the three app views are Guía, Frases and Platos, with the guide as default', () => {
  assert.deepEqual(VIEWS, ['guia', 'frases', 'platos']);
  assert.equal(DEFAULT_VIEW, 'guia');
});

test('the view is read from the query string and unknown values fall back to the guide', () => {
  assert.equal(viewFromSearch('?view=frases'), 'frases');
  assert.equal(viewFromSearch('?city=kyoto&view=platos'), 'platos');
  assert.equal(viewFromSearch(''), 'guia');
  assert.equal(viewFromSearch('?view=nope'), 'guia');
  assert.equal(viewFromSearch('?view='), 'guia');
});

test('withView sets the param, keeps other params, and clears it for the guide', () => {
  const base = 'https://example.com/Japan-trip-2026/?city=kyoto#mapa';
  assert.equal(withView(base, 'frases').search, '?city=kyoto&view=frases');
  assert.equal(withView(base, 'frases').hash, '#mapa');
  assert.equal(withView('https://example.com/?city=kyoto&view=platos', 'guia').search, '?city=kyoto');
  assert.equal(withView('https://example.com/', 'guia').search, '');
});
