// "Consejos prácticos" block at the top of the Viaje view: collapsible categories.
// City tips are listed under their city whichever tab is active, so they also work offline.
import { byId, h, externalLink } from './dom.js';
import { fetchJson, hasOptionalData } from './data.js';
import { validateTips, groupTips } from './tips.js';

const tipCard = (tip) => h('article', { class: 'tip-item', dataset: { tipId: tip.id } },
  h('h4', {}, tip.title),
  h('p', {}, tip.text),
  h('p', { class: 'tip-meta' },
    tip.verify ? h('span', { class: 'tip-verify' }, 'Confirmar antes de ir') : null,
    h('span', {}, tip.source)),
  tip.links?.length ? h('p', { class: 'tip-links' }, tip.links.map((link) => externalLink(link.href, link.label))) : null);

/** Returns `show()`: renders the block the first time the Viaje view is opened (city tips are fetched then, not at start). */
export function initTips(practical, cities, { load = fetchJson } = {}) {
  const section = byId('consejos');
  if (!practical?.items?.length) { section.hidden = true; return { show: () => {} }; }
  let started = null;
  return { show: () => (started ??= render(practical, cities, load, section)) };
}

async function render(practical, cities, load, section) {
  const cityTips = new Map();
  await Promise.all(cities.filter((city) => hasOptionalData(city, 'tips')).map(async ({ id }) => {
    try {
      const data = await load(`data/cities/${id}/tips.json`, { optional: true });
      if (data?.items?.length) cityTips.set(id, data);
    } catch (error) { console.warn(`[tips] ${id}: ${error.message}`); }
  }));
  validateTips(practical, cityTips).forEach((problem) => console.warn(`[tips] ${problem}`));
  const groups = groupTips(practical, cityTips, cities);
  byId('tips-practical-title').textContent = practical.title;
  byId('tips-groups').replaceChildren(...groups.map((group) =>
    h('details', { class: 'tips-group', dataset: { tipsGroup: group.id } },
      h('summary', {}, h('span', {}, group.label), h('span', { class: 'tips-count' }, String(group.items.length))),
      h('div', { class: 'tips-list' }, group.items.map(tipCard)))));
  section.hidden = false;
  return { groups };
}
