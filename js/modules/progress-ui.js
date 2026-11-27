// Header card "Tu diario del viaje": progress rings and tiles with a colour per tier (see progress.js).
// It reads the traveller's data straight from the shared user-data storage on every render, so it never gets out of
// step with the stores that write it, and it repaints whenever one of the synced keys changes.
import { byId, h } from './dom.js';
import { fetchJson } from './data.js';
import { userData, userStorage } from './user-data.js';
import { computeProgress } from './progress.js';
import { parseVisited, VISITED_KEY } from './visited.js';
import { parseStamps, STAMPS_KEY } from './stamps.js';
import { parseChecklist, groupChecklist, progress as checklistProgress } from './checklist.js';
import { DISH_FAVORITES_KEY, DISH_TRIED_KEY } from './dishes.js';
import { FAVORITES_STORAGE_KEY } from './phrases.js';
import { tripMoment } from './today.js';

const NS = 'http://www.w3.org/2000/svg';
const RING_LENGTH = 2 * Math.PI * 15.5;

const idSet = (raw, validIds) => {
  try {
    const list = JSON.parse(raw ?? '[]');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string' && (!validIds || validIds.has(id))).length : 0;
  } catch { return 0; }
};

function ringSvg({ done, total, tier }) {
  const svg = (tag, attrs) => { const node = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value))); return node; };
  const root = svg('svg', { viewBox: '0 0 36 36', class: 'progress-ring-svg', 'aria-hidden': 'true', focusable: 'false' });
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  root.append(svg('circle', { cx: 18, cy: 18, r: 15.5, class: 'progress-ring-track' }));
  if (ratio > 0) root.append(svg('circle', { cx: 18, cy: 18, r: 15.5, class: `progress-ring-arc tier-${tier.id}`, 'stroke-dasharray': `${(RING_LENGTH * ratio).toFixed(1)} ${RING_LENGTH.toFixed(1)}`, transform: 'rotate(-90 18 18)' }));
  return root;
}

export function initProgress({ cities, global, storage = userStorage(), load = fetchJson } = {}) {
  const slide = byId('progress-card');
  if (!slide) return { show() {} };
  const placesByCity = new Map();
  let current = null; // { cityId, days }
  let queued = false;

  let totals = {}; // per-city totals (data/global/progress-index.json), fetched once; the open city's places come with its page
  const totalsReady = load('data/global/progress-index.json', { optional: true }).then((index) => { totals = index?.cities ?? {}; render(); }, () => {});

  function read() {
    const dishList = global.dishes?.dishes ?? [];
    const dishIds = new Set(dishList.map(({ id }) => id));
    const phraseIds = new Set((global.phrases?.phrases ?? []).map(({ id }) => id));
    const state = parseChecklist(storage.getItem('checklist-v1'));
    return {
      visited: parseVisited(storage.getItem(VISITED_KEY)),
      stampEntries: parseStamps(storage.getItem(STAMPS_KEY)),
      dishes: { total: dishList.length, tried: idSet(storage.getItem(DISH_TRIED_KEY), dishIds), favorites: idSet(storage.getItem(DISH_FAVORITES_KEY), dishIds) },
      phrasesFavorites: idSet(storage.getItem(FAVORITES_STORAGE_KEY), phraseIds),
      checklist: global.checklist?.items?.length ? checklistProgress(groupChecklist(global.checklist, state)) : { done: 0, total: 0 }
    };
  }

  function render() {
    queued = false;
    if (!current) return;
    const moment = current.days ? tripMoment(current.days, new Date()) : { kind: 'none' };
    const data = computeProgress({ cities, cityId: current.cityId, totals, placesByCity, todayKey: moment.kind === 'today' ? moment.day.key : null, ...read() });
    const { ring } = data;
    const tierText = (tier) => (tier.label ? `, ${tier.label.toLowerCase()}` : '');
    slide.dataset.mode = data.mode;
    slide.replaceChildren(
      h('div', { class: 'eyebrow' }, 'Tu diario del viaje'),
      h('div', { class: 'progress-top' },
        h('div', { class: `progress-ring tier-${ring.tier.id}`, role: 'img', 'aria-label': `${ring.done} ${ring.total ? `de ${ring.total}` : ''}${tierText(ring.tier)}` },
          ringSvg(ring),
          h('b', {}, String(ring.done), h('small', {}, ring.total ? `de ${ring.total}` : ''))
        ),
        h('div', { class: 'progress-text' }, h('h2', {}, data.headline), h('p', {}, data.sub), data.nudge ? h('p', { class: 'progress-nudge' }, data.nudge) : null)
      ),
      h('div', { class: 'progress-tiles' }, ...data.tiles.map((tile) =>
        h('div', { class: `progress-tile tier-${tile.tier.id}`, role: 'group', 'aria-label': `${tile.full}: ${tile.done}${tile.total ? ` de ${tile.total}` : ''}${tierText(tile.tier)}` },
          h('div', { class: 'progress-tile-top' }, h('b', {}, String(tile.done), tile.total ? h('small', {}, `/${tile.total}`) : null), tile.tier.icon ? h('i', { 'aria-hidden': 'true' }, tile.tier.icon) : null),
          h('span', {}, tile.label),
          tile.total ? h('div', { class: 'progress-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.min(100, Math.round((100 * tile.done) / tile.total))}%` })) : null
        )))
    );
  }

  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };
  userData().subscribe(schedule);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(); });
  void totalsReady;
  return {
    /** Call when a city page is shown. `days` are its itinerary days (to know today's stops). */
    show({ cityId, days, places }) {
      current = { cityId, days };
      placesByCity.clear(); // only the open city's places are ever in memory
      placesByCity.set(cityId, places ?? []);
      render();
    }
  };
}
