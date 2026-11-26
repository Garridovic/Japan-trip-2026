import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  normalizeText, matchesQuery, filterPhrases, validatePhrases, createFavoritesStore, ALL_CATEGORY, FAVORITES_CATEGORY
} from '../js/modules/phrases.js';
import { pickJapaneseVoice, createSpeech, SLOW_RATE, NORMAL_RATE } from '../js/modules/speech.js';

const data = JSON.parse(await readFile(fileURLToPath(new URL('../data/global/phrases.json', import.meta.url)), 'utf8'));
const byId = (id) => data.phrases.find((phrase) => phrase.id === id);

test('the phrases dataset is valid', () => {
  assert.deepEqual(validatePhrases(data), []);
});

test('the six required categories exist and every one has phrases', () => {
  assert.deepEqual(data.categories.map(({ label }) => label), ['Saludos', 'Cortesía', 'Comprar', 'Preguntar', 'Emergencias', 'Comida']);
});

test('PDF phrases keep the romaji and Spanish translation exactly as written in the PDF', () => {
  assert.equal(byId('konichiwa').romaji, 'konichiwa');
  assert.equal(byId('onegaishimas').romaji, 'onegaishimas');
  assert.equal(byId('toire-doko').romaji, 'toire doko deska?');
  assert.equal(byId('ikura').es, '¿Cuándo cuesta?');
  assert.equal(byId('ookini').ja, 'おおきに');
});

test('phrases added on top of the PDF are marked as added', () => {
  const added = data.phrases.filter(({ source }) => source === 'added');
  assert.ok(added.length > 0 && added.length < data.phrases.length);
  assert.ok(data.phrases.filter(({ source }) => source === 'pdf').length >= 25);
  assert.ok(added.some(({ category }) => category === 'emergencias'));
  assert.ok(added.some(({ category }) => category === 'comida'));
});

test('validation reports broken phrases', () => {
  const broken = structuredClone(data);
  broken.phrases[0].examples = [];
  broken.phrases[1].category = 'nope';
  broken.phrases[2].id = broken.phrases[3].id;
  broken.phrases[4].ja = 'hola';
  const problems = validatePhrases(broken).join('\n');
  assert.match(problems, /needs exactly 2 examples/);
  assert.match(problems, /unknown category nope/);
  assert.match(problems, /duplicate id/);
  assert.match(problems, /no Japanese characters/);
});

test('search ignores case, accents, spaces and punctuation', () => {
  assert.equal(normalizeText('  ¿Dónde está el Baño? '), 'dondeestaelbano');
  assert.equal(matchesQuery(byId('arigato'), 'GRACIAS'), true);
  assert.equal(matchesQuery(byId('arigato'), 'ありがとう'), true);
  assert.equal(matchesQuery(byId('arigato'), 'ariga'), true);
  assert.equal(matchesQuery(byId('onegaishimas'), 'o negai-shimas'), true);
  assert.equal(matchesQuery(byId('toire-doko'), 'donde bano'), true);
  assert.equal(matchesQuery(byId('toire-doko'), 'gracias'), false);
  assert.equal(matchesQuery(byId('toire-doko'), ''), true);
});

test('filtering combines category, query and favourites', () => {
  const all = filterPhrases(data.phrases, {});
  assert.equal(all.length, data.phrases.length);
  const food = filterPhrases(data.phrases, { category: 'comida' });
  assert.ok(food.length > 0 && food.every(({ category }) => category === 'comida'));
  assert.deepEqual(filterPhrases(data.phrases, { category: 'comida', query: 'cuenta' }).map(({ id }) => id), ['okaikei']);
  const favorites = new Set(['hai', 'sore']);
  assert.deepEqual(filterPhrases(data.phrases, { category: FAVORITES_CATEGORY, favorites }).map(({ id }) => id).sort(), ['hai', 'sore']);
  assert.deepEqual(filterPhrases(data.phrases, { category: FAVORITES_CATEGORY, favorites, query: 'eso' }).map(({ id }) => id), ['sore']);
  assert.equal(filterPhrases(data.phrases, { category: ALL_CATEGORY, query: 'zzzz' }).length, 0);
});

test('favourites persist, survive broken storage and can be pruned', () => {
  const backing = new Map();
  const storage = { getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => backing.set(k, v) };
  const store = createFavoritesStore(storage);
  assert.equal(store.toggle('hai'), true);
  assert.equal(store.toggle('sore'), true);
  assert.equal(store.toggle('hai'), false);
  assert.deepEqual([...createFavoritesStore(storage).all()], ['sore']);
  store.prune(new Set(['hai']));
  assert.deepEqual([...createFavoritesStore(storage).all()], []);

  const corrupt = createFavoritesStore({ getItem: () => '{not json', setItem: () => {} });
  assert.deepEqual([...corrupt.all()], []);
  const throwing = createFavoritesStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.equal(throwing.toggle('hai'), true);
  assert.equal(throwing.has('hai'), true);
  assert.doesNotThrow(() => createFavoritesStore(null).toggle('x'));
});

test('voice selection prefers ja-JP, accepts other ja variants and returns null otherwise', () => {
  const voices = [{ lang: 'es-ES' }, { lang: 'ja' }, { lang: 'ja_JP' }];
  assert.equal(pickJapaneseVoice(voices), voices[2]);
  assert.equal(pickJapaneseVoice([{ lang: 'es-ES' }, { lang: 'ja' }]).lang, 'ja');
  assert.equal(pickJapaneseVoice([{ lang: 'es-ES' }, { lang: 'en-US' }]), null);
});

test('speech reports unsupported browsers and no-Japanese-voice devices, and speaks slowly on request', () => {
  assert.deepEqual(createSpeech({}).status(), { supported: false, hasJapaneseVoice: false });
  assert.equal(createSpeech({}).speak('こんにちは'), false);

  const spoken = [];
  class Utterance { constructor(text) { this.text = text; } }
  const synth = { getVoices: () => [{ lang: 'es-ES' }], cancel() {}, speak: (u) => spoken.push(u), addEventListener() {} };
  const noVoice = createSpeech({ speechSynthesis: synth, SpeechSynthesisUtterance: Utterance });
  assert.deepEqual(noVoice.status(), { supported: true, hasJapaneseVoice: false });

  synth.getVoices = () => [{ lang: 'ja-JP' }];
  const withVoice = createSpeech({ speechSynthesis: synth, SpeechSynthesisUtterance: Utterance });
  assert.equal(withVoice.status().hasJapaneseVoice, true);
  withVoice.speak('ありがとう');
  withVoice.speak('ありがとう', { slow: true });
  assert.equal(spoken[0].lang, 'ja-JP');
  assert.equal(spoken[0].rate, NORMAL_RATE);
  assert.equal(spoken[1].rate, SLOW_RATE);
  assert.ok(SLOW_RATE < NORMAL_RATE);
});
