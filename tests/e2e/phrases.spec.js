import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const phrases = JSON.parse(readFileSync(new URL('../../data/global/phrases.json', import.meta.url), 'utf8'));
const total = phrases.phrases.length;

// Fake Web Speech API: records what would be spoken. `withJapanese` decides whether a ja voice exists.
const installSpeech = (page, { withJapanese = true } = {}) => page.addInitScript((hasJa) => {
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const voices = hasJa ? [{ lang: 'es-ES', name: 'es' }, { lang: 'ja-JP', name: 'ja' }] : [{ lang: 'es-ES', name: 'es' }];
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { getVoices: () => voices, cancel() {}, speak: (u) => window.__spoken.push({ text: u.text, rate: u.rate, lang: u.lang, voice: u.voice?.name }), addEventListener() {} }
  });
}, withJapanese);

test('the phrases section is global, linked from the navigation and lists every phrase', async ({ page }) => {
  await installSpeech(page);
  await page.goto('/?view=frases');
  await expect(page.locator('.phrase-card')).toHaveCount(total);
  await expect(page.locator('[data-view-target="frases"]')).toBeVisible();
  await expect(page.locator('#phrases-title')).toHaveText('Frases útiles');
  await expect(page.locator('#phrases-notice')).toBeHidden();
  const card = page.locator('.phrase-card[data-phrase-id="arigato"]');
  await expect(card.locator('.phrase-es')).toHaveText('Gracias');
  await expect(card.locator('.phrase-ja')).toHaveText('ありがとう');
  await expect(card.locator('.phrase-romaji')).toHaveText('arigato');
});

test('search matches Spanish, Japanese and romaji and category chips filter', async ({ page }) => {
  await installSpeech(page);
  await page.goto('/?view=frases');
  const search = page.locator('#phrases-search');
  await search.fill('baño');
  await expect(page.locator('.phrase-card[data-phrase-id="toire-doko"]')).toBeVisible();
  await search.fill('ありがとう');
  await expect(page.locator('.phrase-card[data-phrase-id="arigato"]')).toBeVisible();
  await search.fill('onegaishimas');
  await expect(page.locator('.phrase-card[data-phrase-id="onegaishimas"]')).toBeVisible();
  await search.fill('zzzz');
  await expect(page.locator('.phrase-card')).toHaveCount(0);
  await expect(page.locator('#phrases-empty')).toBeVisible();
  await search.fill('');
  await page.getByRole('button', { name: 'Emergencias' }).click();
  const expected = phrases.phrases.filter(({ category }) => category === 'emergencias').length;
  await expect(page.locator('.phrase-card')).toHaveCount(expected);
  await expect(page.getByRole('button', { name: 'Emergencias' })).toHaveAttribute('aria-pressed', 'true');
});

test('favourites can be starred, filtered and survive a reload', async ({ page }) => {
  await installSpeech(page);
  await page.goto('/?view=frases');
  await page.locator('.phrase-card[data-phrase-id="hai"] .phrase-fav').click();
  await page.locator('.phrase-card[data-phrase-id="sore"] .phrase-fav').click();
  await expect(page.getByRole('button', { name: /Favoritas \(2\)/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Favoritas \(2\)/ }).click();
  await expect(page.locator('.phrase-card')).toHaveCount(2);
  await page.locator('.phrase-card[data-phrase-id="hai"] .phrase-fav').click();
  await expect(page.locator('.phrase-card')).toHaveCount(1);
  await page.locator('.phrase-card[data-phrase-id="sore"] .phrase-fav').click();
  await expect(page.locator('#phrases-empty')).toContainText('Aún no tienes favoritas');
});

test('audio, slow audio and example audio speak the Japanese text with a ja-JP voice', async ({ page }) => {
  await installSpeech(page);
  await page.goto('/?view=frases');
  const card = page.locator('.phrase-card[data-phrase-id="arigato"]');
  await card.getByRole('button', { name: /^Escuchar:/ }).click();
  await card.getByRole('button', { name: /^Escuchar despacio:/ }).click();
  await card.locator('summary').click();
  await expect(card.locator('.phrase-examples li')).toHaveCount(2);
  await card.locator('.phrase-examples li').first().locator('button').click();
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken[0]).toMatchObject({ text: 'ありがとう', lang: 'ja-JP', voice: 'ja' });
  expect(spoken[1].text).toBe('ありがとう');
  expect(spoken[1].rate).toBeLessThan(spoken[0].rate);
  expect(spoken[2].text).toBe(phrases.phrases.find(({ id }) => id === 'arigato').examples[0].ja);
});

test('a clear warning appears when the device has no Japanese voice', async ({ page }) => {
  await installSpeech(page, { withJapanese: false });
  await page.goto('/?view=frases');
  await expect(page.locator('#phrases-notice')).toBeVisible();
  await expect(page.locator('#phrases-notice')).toContainText('voz japonesa');
});

test('a warning and disabled audio appear when speech is unavailable', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined }); });
  await page.goto('/?view=frases');
  await expect(page.locator('#phrases-notice')).toContainText('no puede reproducir audio');
  await expect(page.locator('.phrase-card[data-phrase-id="arigato"] .phrase-audio').first()).toBeDisabled();
});

test('show mode displays the phrase full screen, plays audio and closes with Escape', async ({ page }) => {
  await installSpeech(page);
  await page.goto('/?view=frases');
  await page.locator('.phrase-card[data-phrase-id="toire-doko"]').getByRole('button', { name: /Mostrar/ }).click();
  const modal = page.locator('#phrase-show');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.phrase-show-ja')).toHaveText('トイレはどこですか？');
  await expect(modal.locator('.phrase-show-es')).toHaveText('¿Dónde está el baño?');
  const box = await modal.boundingBox();
  const viewport = page.viewportSize();
  expect(box.width).toBe(viewport.width);
  expect(box.height).toBe(viewport.height);
  await modal.getByRole('button', { name: /^Escuchar despacio/ }).click();
  expect((await page.evaluate(() => window.__spoken)).at(-1).text).toBe('トイレはどこですか？');
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await page.locator('.phrase-card[data-phrase-id="toire-doko"]').getByRole('button', { name: /Mostrar/ }).click();
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(modal).toBeHidden();
});

test('the section fits a narrow phone and the nav link reaches it', async ({ page }) => {
  await installSpeech(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?view=frases&city=kyoto');
  await expect(page.locator('.phrase-card')).toHaveCount(total);
  await page.locator('#phrases-search').fill('gracias');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const tall = await page.locator('.phrase-card').first().boundingBox();
  expect(tall.width).toBeLessThanOrEqual(320);
});
