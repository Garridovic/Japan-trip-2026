import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeTheme, readTheme, writeTheme, applyTheme } from '../js/modules/theme.js';

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, data };
};

test('only "light" and "dark" are explicit choices; anything else is automatic', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('dark'), 'dark');
  for (const value of ['auto', '', null, undefined, 'blue']) assert.equal(normalizeTheme(value), 'auto');
});

test('the choice is stored on the device and "auto" removes it', () => {
  const storage = memoryStorage();
  writeTheme(storage, 'dark');
  assert.equal(storage.data.theme, 'dark');
  assert.equal(readTheme(storage), 'dark');
  writeTheme(storage, 'auto');
  assert.equal('theme' in storage.data, false);
  assert.equal(readTheme(storage), 'auto');
});

test('a blocked localStorage never breaks the page', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(readTheme(broken), 'auto');
  assert.doesNotThrow(() => writeTheme(broken, 'dark'));
});

test('applyTheme sets or clears data-theme on the root element', () => {
  const root = { dataset: {} };
  assert.equal(applyTheme(root, 'dark'), 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(applyTheme(root, 'auto'), 'auto');
  assert.equal('theme' in root.dataset, false);
});

// ---- Contrast (WCAG AA) of the design tokens in assets/theme.css ----
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const colorsIn = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));

test('every text/background pair of the palette reaches 4.5:1 in light and dark', async () => {
  const css = await readFile(new URL('../assets/theme.css', import.meta.url), 'utf8');
  const light = colorsIn(css.split('@media')[0]);
  const dark = { ...light, ...colorsIn(css.split(':root[data-theme=dark]')[1].split('}')[0]) };
  const pairs = [['ink', 'bg'], ['ink', 'surface'], ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'], ['accent-ink', 'accent'], ['accent-text', 'bg'], ['accent-text', 'surface'], ['accent-text', 'accent-soft'], ['ok', 'ok-soft'], ['warn', 'warn-soft'], ['err', 'err-soft'], ['net', 'net-soft'], ['idle', 'idle-soft'], ['ok', 'surface'], ['warn', 'surface'], ['err', 'surface'], ['net', 'surface']];
  for (const [name, theme] of [['light', light], ['dark', dark]]) {
    for (const [fg, bg] of pairs) {
      assert.ok(theme[fg] && theme[bg], `${name}: missing ${fg} or ${bg}`);
      const ratio = contrast(theme[fg], theme[bg]);
      assert.ok(ratio >= 4.5, `${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('the page applies the saved theme before the first paint and links the theme sheet after the base styles', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.indexOf('localStorage.getItem("theme")');
  assert.ok(script > 0 && script < html.indexOf('rel="stylesheet"'), 'inline script runs before any stylesheet');
  assert.ok(html.indexOf('assets/styles.css') < html.indexOf('assets/theme.css'));
  assert.equal((html.match(/data-theme-choice=/g) ?? []).length, 3, 'automatic, light and dark');
});

test('the bottom bar has five destinations, the map button in the centre and no emoji', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const bar = html.slice(html.indexOf('id="app-bar"'), html.indexOf('</nav>', html.indexOf('id="app-bar"')));
  const buttons = [...bar.matchAll(/<button[^>]*class="app-bar-button[^>]*>/g)].map((m) => m[0]);
  assert.equal(buttons.length, 5);
  assert.match(buttons[2], /data-action="map"/);
  assert.deepEqual(buttons.filter((b) => b.includes('data-view-target')).map((b) => b.match(/data-view-target="(\w+)"/)[1]), ['guia', 'viaje', 'frases', 'platos']);
  assert.doesNotMatch(bar, /[\u{1F300}-\u{1FAFF}]/u);
  assert.match(bar, /<svg/);
});
