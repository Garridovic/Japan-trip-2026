import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, freshVersionUrl, describeCheck, FRESH_PARAM } from '../js/modules/updates.js';

test('a different deployed version is "new"; the same one is "current"; missing data is "unknown"', () => {
  assert.equal(compareVersions('V12.1.0', 'V12.2.0'), 'new');
  assert.equal(compareVersions('V12.2.0', 'V12.2.0'), 'current');
  assert.equal(compareVersions('V12.2.0', null), 'unknown');
  assert.equal(compareVersions(null, 'V12.2.0'), 'unknown');
});

test('the fresh check uses a URL the service worker never answers from its saved copy', () => {
  assert.equal(freshVersionUrl('data/version.json', 123), `data/version.json?${FRESH_PARAM}=123`);
});

test('every outcome has a plain-language message', () => {
  for (const result of ['new', 'current', 'offline', 'checking', 'error']) assert.ok(describeCheck(result).length > 10, result);
  assert.match(describeCheck('offline'), /sigue funcionando/);
});
