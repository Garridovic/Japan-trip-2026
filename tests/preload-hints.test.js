import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hintBlock, withHints, moduleGraph, DATA_FILES } from '../scripts/preload-hints.js';

test('index.html preload hints match the real import graph (run `npm run build:offline` to refresh them)', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.equal(withHints(html, await hintBlock()), html);
});

test('every preloaded module and data file exists and the hints sit after the stylesheets', async () => {
  const html = await readFile('index.html', 'utf8');
  for (const file of [...await moduleGraph(), ...DATA_FILES]) await readFile(file);
  assert.ok(html.indexOf('preload-hints:start') > html.indexOf('assets/theme.css'), 'hints must not delay the CSS');
});

test('the account code and the Auth0 SDK are never preloaded (a disabled account must request none of it)', async () => {
  const graph = await moduleGraph();
  assert.ok(graph.includes('js/main.js') && graph.includes('assets/auth-config.js'));
  for (const file of graph) assert.ok(!/account|auth\.js|auth0|cloud-sync/.test(file.replace('auth-config', '')), file);
});
