// "Frases" section: search, category chips, favourites, audio and the full-screen show mode.
import { byId, h, setPressed } from './dom.js';
import {
  ALL_CATEGORY, FAVORITES_CATEGORY, createFavoritesStore, filterPhrases
} from './phrases.js';
import { createSpeech } from './speech.js';

const NO_VOICE_NOTICE = 'Tu dispositivo no tiene una voz japonesa instalada, así que el audio puede sonar mal o no sonar. Puedes añadirla en los ajustes del sistema (iPhone: Ajustes › Accesibilidad › Contenido leído › Voces › Japonés; Android: Ajustes › Idioma › Salida de texto a voz). Mientras tanto, usa «Mostrar» para enseñar la frase.';
const NO_SPEECH_NOTICE = 'Este navegador no puede reproducir audio. Usa «Mostrar» para enseñar la frase en pantalla grande.';

export function initPhrases(data, { storage = safeStorage(), speech = createSpeech() } = {}) {
  const section = byId('frases');
  if (!data?.phrases?.length) { section.hidden = true; return null; }

  const favorites = createFavoritesStore(storage);
  favorites.prune(new Set(data.phrases.map(({ id }) => id)));
  const categoryLabels = new Map(data.categories.map(({ id, label }) => [id, label]));
  const state = { category: ALL_CATEGORY, query: '' };

  byId('phrases-kicker').textContent = data.kicker;
  byId('phrases-title').textContent = data.title;
  byId('phrases-lead').textContent = data.lead;
  section.hidden = false;

  // ----- audio availability -----
  const notice = byId('phrases-notice');
  const audioButtons = new Set();
  speech.onChange(({ supported, hasJapaneseVoice }) => {
    notice.hidden = supported && hasJapaneseVoice;
    notice.textContent = !supported ? NO_SPEECH_NOTICE : hasJapaneseVoice ? '' : NO_VOICE_NOTICE;
    audioButtons.forEach((button) => { button.disabled = !supported; });
  });

  const audioButton = (text, { slow = false, compact = false } = {}) => {
    const label = slow ? 'Escuchar despacio' : 'Escuchar';
    const button = h('button', {
      type: 'button',
      class: `phrase-btn phrase-audio${slow ? ' is-slow' : ''}${compact ? ' is-compact' : ''}`,
      'aria-label': `${label}: ${text}`,
      onclick: () => speech.speak(text, { slow })
    }, compact ? (slow ? '🐢' : '🔊') : (slow ? '🐢 Lento' : '🔊 Escuchar'));
    button.disabled = !speech.status().supported;
    audioButtons.add(button);
    return button;
  };

  // ----- full-screen show mode -----
  const modal = byId('phrase-show');
  const showBody = byId('phrase-show-body');
  let opener = null;
  const closeShow = () => {
    if (modal.hidden) return;
    speech.stop();
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('phrase-show-open');
    opener?.focus?.();
    opener = null;
  };
  const openShow = (phrase, trigger) => {
    opener = trigger;
    showBody.replaceChildren(
      h('p', { class: 'phrase-show-ja', lang: 'ja' }, phrase.ja),
      h('p', { class: 'phrase-show-romaji' }, phrase.romaji),
      h('p', { class: 'phrase-show-es' }, phrase.es),
      h('div', { class: 'phrase-show-actions' }, audioButton(phrase.ja), audioButton(phrase.ja, { slow: true }))
    );
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('phrase-show-open');
    byId('phrase-show-close').focus();
  };
  modal.querySelectorAll('[data-close-phrase]').forEach((node) => node.addEventListener('click', closeShow));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeShow(); });

  // ----- cards -----
  const favoriteButton = (phrase) => {
    const button = h('button', { type: 'button', class: 'phrase-fav', 'aria-pressed': String(favorites.has(phrase.id)), 'aria-label': `Favorita: ${phrase.es}` }, '★');
    button.addEventListener('click', () => {
      favorites.toggle(phrase.id);
      // In the favourites view an un-starred phrase must disappear, so re-render; otherwise just flip the star.
      if (state.category === FAVORITES_CATEGORY) render(); else { button.setAttribute('aria-pressed', String(favorites.has(phrase.id))); renderChips(); }
    });
    return button;
  };

  const renderCard = (phrase) => {
    const trigger = h('button', { type: 'button', class: 'phrase-btn', onclick: (event) => openShow(phrase, event.currentTarget) }, '⤢ Mostrar');
    return h('article', { class: 'phrase-card', dataset: { phraseId: phrase.id, category: phrase.category } },
      h('div', { class: 'phrase-top' },
        h('span', { class: 'phrase-cat' }, categoryLabels.get(phrase.category)),
        phrase.source === 'added' && h('span', { class: 'phrase-added', title: 'Frase añadida a las del PDF original' }, 'Añadida'),
        favoriteButton(phrase)
      ),
      h('p', { class: 'phrase-es' }, phrase.es),
      h('p', { class: 'phrase-ja', lang: 'ja' }, phrase.ja),
      h('p', { class: 'phrase-romaji' }, phrase.romaji),
      phrase.note && h('p', { class: 'phrase-note' }, phrase.note),
      h('div', { class: 'phrase-actions' }, audioButton(phrase.ja), audioButton(phrase.ja, { slow: true }), trigger),
      h('details', { class: 'phrase-examples' },
        h('summary', {}, 'Ejemplos'),
        h('ul', {}, phrase.examples.map((example) =>
          h('li', {},
            h('div', { class: 'phrase-example-text' },
              h('span', { class: 'phrase-example-ja', lang: 'ja' }, example.ja),
              h('span', { class: 'phrase-example-romaji' }, example.romaji),
              h('span', { class: 'phrase-example-es' }, example.es)
            ),
            audioButton(example.ja, { compact: true })
          )
        ))
      )
    );
  };

  // ----- chips, search and list -----
  const chips = [
    { id: ALL_CATEGORY, label: 'Todas' },
    { id: FAVORITES_CATEGORY, label: 'Favoritas' },
    ...data.categories
  ];
  const chipContainer = byId('phrases-chips');
  const renderChips = () => {
    chipContainer.replaceChildren(...chips.map(({ id, label }) =>
      h('button', {
        type: 'button', class: 'filter phrase-chip', 'aria-pressed': String(state.category === id), dataset: { phraseCategory: id },
        onclick: () => { state.category = id; render(); }
      }, id === FAVORITES_CATEGORY ? `★ ${label} (${favorites.all().size})` : label)
    ));
  };

  const grid = byId('phrases-grid');
  const count = byId('phrases-count');
  const empty = byId('phrases-empty');
  function render() {
    renderChips();
    const visible = filterPhrases(data.phrases, { ...state, favorites: favorites.all() });
    audioButtons.clear();
    grid.replaceChildren(...visible.map(renderCard));
    count.textContent = `${visible.length} ${visible.length === 1 ? 'frase' : 'frases'}`;
    empty.hidden = visible.length > 0;
    empty.textContent = state.category === FAVORITES_CATEGORY && !state.query
      ? 'Aún no tienes favoritas. Pulsa la estrella ★ de una frase para guardarla aquí.'
      : 'No hay frases que coincidan con la búsqueda.';
  }

  byId('phrases-search').addEventListener('input', (event) => { state.query = event.target.value; render(); });
  render();
  return { render };
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}
