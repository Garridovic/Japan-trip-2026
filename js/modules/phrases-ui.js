// "Frases" section: search, category chips, favourites, audio and the full-screen show mode.
import { setFilterSummary } from './collapsible.js';
import { haptic } from './feedback.js';
import { userStorage } from './user-data.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';
import { byId, h, setPressed } from './dom.js';
import {
  ALL_CATEGORY, FAVORITES_CATEGORY, createFavoritesStore, filterPhrases
} from './phrases.js';
import { createSpeech } from './speech.js';
import { swipeDirection } from './swipe.js';

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
  let sequence = []; // phrases visible when the sheet was opened: Anterior/Siguiente walk through them
  let position = 0;
  const closeShow = () => {
    if (modal.hidden) return;
    speech.stop();
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('phrase-show-open');
    releaseOverlay('phrase-show');
    opener?.focus?.();
    opener = null;
  };
  function showPhrase(index) {
    position = (index + sequence.length) % sequence.length;
    const phrase = sequence[position];
    speech.stop();
    audioButtons.forEach((button) => { if (!button.isConnected) audioButtons.delete(button); });
    showBody.replaceChildren(
      h('p', { class: 'phrase-show-ja', lang: 'ja' }, phrase.ja),
      h('p', { class: 'phrase-show-romaji' }, phrase.romaji),
      h('p', { class: 'phrase-show-es' }, phrase.es),
      h('div', { class: 'phrase-show-actions' }, audioButton(phrase.ja), audioButton(phrase.ja, { slow: true }))
    );
    byId('phrase-show-position').textContent = `${position + 1} / ${sequence.length}`;
    byId('phrase-show-pager').hidden = sequence.length < 2;
    byId('phrase-show-hint').hidden = sequence.length < 2;
  }
  const openShow = (phrase, trigger) => {
    opener = trigger;
    sequence = filterPhrases(data.phrases, { ...state, favorites: favorites.all() });
    showPhrase(Math.max(0, sequence.findIndex(({ id }) => id === phrase.id)));
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('phrase-show-open');
    openOverlay('phrase-show', closeShow);
    byId('phrase-show-close').focus();
  };
  byId('phrase-show-prev').addEventListener('click', () => showPhrase(position - 1));
  byId('phrase-show-next').addEventListener('click', () => showPhrase(position + 1));
  modal.querySelectorAll('[data-close-phrase]').forEach((node) => node.addEventListener('click', closeShow));
  // Swipe left / right on the big phrase to walk through the list (the Anterior / Siguiente buttons stay).
  let touchStart = null;
  modal.addEventListener('touchstart', (event) => { const t = event.changedTouches[0]; touchStart = { x: t.clientX, y: t.clientY }; }, { passive: true });
  modal.addEventListener('touchend', (event) => {
    if (!touchStart || sequence.length < 2) return;
    const t = event.changedTouches[0];
    const direction = swipeDirection(t.clientX - touchStart.x, t.clientY - touchStart.y);
    touchStart = null;
    if (direction === 'left') showPhrase(position + 1);
    else if (direction === 'right') showPhrase(position - 1);
  }, { passive: true });
  document.addEventListener('keydown', (event) => {
    if (modal.hidden) return;
    if (event.key === 'Escape') closeShow();
    else if (event.key === 'ArrowRight') showPhrase(position + 1);
    else if (event.key === 'ArrowLeft') showPhrase(position - 1);
  });

  // ----- cards -----
  const favoriteButton = (phrase) => {
    const button = h('button', { type: 'button', class: 'phrase-fav', 'aria-pressed': String(favorites.has(phrase.id)), 'aria-label': `Favorita: ${phrase.es}` }, '★');
    button.addEventListener('click', () => {
      favorites.toggle(phrase.id);
      haptic(10);
      // In the favourites view an un-starred phrase must disappear, so re-render; otherwise just flip the star.
      if (state.category === FAVORITES_CATEGORY) render(); else { button.setAttribute('aria-pressed', String(favorites.has(phrase.id))); renderChips(); }
    });
    return button;
  };

  const renderCard = (phrase) => {
    const trigger = h('button', { type: 'button', class: 'phrase-btn is-primary', onclick: (event) => openShow(phrase, event.currentTarget) }, '⤢ Mostrar');
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
      h('div', { class: 'phrase-actions' }, trigger, audioButton(phrase.ja, { compact: true }), audioButton(phrase.ja, { slow: true, compact: true })),
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
    ...data.categories
  ];
  const chipContainer = byId('phrases-chips');
  const favButton = byId('phrases-fav');
  const filtersSummary = byId('phrases-filters-summary');
  const renderChips = () => {
    chipContainer.replaceChildren(...chips.map(({ id, label }) =>
      h('button', {
        type: 'button', class: 'filter phrase-chip', 'aria-pressed': String(state.category === id), dataset: { phraseCategory: id },
        onclick: () => { state.category = id; render(); }
      }, label)
    ));
    favButton.textContent = `★ Favoritas (${favorites.all().size})`;
    favButton.setAttribute('aria-pressed', String(state.category === FAVORITES_CATEGORY));
    const active = chips.find(({ id }) => id === state.category);
    setFilterSummary(filtersSummary, active && active.id !== ALL_CATEGORY ? 1 : 0);
  };
  // One tap to jump to / leave the favourites, handy at the restaurant table.
  favButton.addEventListener('click', () => {
    state.category = state.category === FAVORITES_CATEGORY ? ALL_CATEGORY : FAVORITES_CATEGORY;
    render();
  });

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
  return userStorage(); // favourites go through the single user-data layer
}
