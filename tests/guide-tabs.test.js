import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_TABS, DEFAULT_TAB, tabFromSearch, tabForHash, withTab, pickTab, rememberedTab, TAB_STORAGE_KEY } from '../js/modules/guide-tabs.js';
import { readFile } from 'node:fs/promises';

test('the guide has six tabs and no Fuentes tab', async () => {
  assert.deepEqual(GUIDE_TABS, ['resumen', 'mapa', 'detalle', 'comer', 'alternativas', 'practico']);
  assert.equal(DEFAULT_TAB, 'resumen');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const hrefs = [...html.matchAll(/<div class="nav-inner">([\s\S]*?)<\/div>/g)][0][1].match(/href="#[^"]+"/g).map((href) => href.slice(7, -1));
  assert.deepEqual(hrefs, GUIDE_TABS);
  assert.doesNotMatch(html, /id="fuentes"|Fuentes útiles|poi-sources/);
});

test('the tab is read from ?tab=, unknown values are ignored', () => {
  assert.equal(tabFromSearch('?city=kyoto&tab=comer'), 'comer');
  assert.equal(tabFromSearch('?tab=fuentes'), null);
  assert.equal(tabFromSearch('?city=kyoto'), null);
});

test('old in-page anchors still lead to their tab', () => {
  assert.equal(tabForHash('#comer'), 'comer');
  assert.equal(tabForHash('#mapa'), 'mapa');
  assert.equal(tabForHash('#dia12'), 'detalle');
  assert.equal(tabForHash('#fuentes'), null);
  assert.equal(tabForHash(''), null);
});

test('withTab sets the tab, keeps the city and drops the anchor', () => {
  assert.equal(withTab('https://x.test/?city=kyoto#comer', 'comer').href, 'https://x.test/?city=kyoto&tab=comer');
  assert.equal(withTab('https://x.test/?city=kyoto&tab=mapa', 'practico').search, '?city=kyoto&tab=practico');
});

test('a tab the city does not have falls back to the first one it has', () => {
  assert.equal(pickTab(['resumen', 'mapa', 'comer'], 'comer'), 'comer');
  assert.equal(pickTab(['resumen', 'mapa'], 'comer', 'resumen'), 'resumen');
  assert.equal(pickTab(['mapa', 'detalle'], null), 'mapa');
  assert.equal(pickTab([], 'comer'), 'resumen');
});

test('the last tab is remembered on the device, and a broken storage is harmless', () => {
  const store = new Map([[TAB_STORAGE_KEY, 'alternativas']]);
  assert.equal(rememberedTab({ localStorage: { getItem: (key) => store.get(key) ?? null } }), 'alternativas');
  store.set(TAB_STORAGE_KEY, 'fuentes');
  assert.equal(rememberedTab({ localStorage: { getItem: (key) => store.get(key) ?? null } }), null);
  assert.equal(rememberedTab({ get localStorage() { throw new Error('blocked'); } }), null);
});
