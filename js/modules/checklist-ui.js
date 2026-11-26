// Checklist section in the Viaje view. State lives in the shared user-data storage.
import { byId, h } from './dom.js';
import { createChecklistStore, groupChecklist, progress, validateChecklist } from './checklist.js';
import { userStorage } from './user-data.js';

export async function initChecklist(data, { storage = userStorage() } = {}) {
  const section = byId('checklist');
  if (!data?.items?.length) { section.hidden = true; return null; }
  validateChecklist(data).forEach((problem) => console.warn(`[checklist] ${problem}`));
  section.hidden = false;
  byId('checklist-kicker').textContent = data.kicker;
  byId('checklist-title').textContent = data.title;
  byId('checklist-lead').textContent = data.lead;
  const store = createChecklistStore(storage);
  const list = byId('checklist-groups');
  const count = byId('checklist-count');
  const bar = byId('checklist-bar');
  const input = byId('checklist-input');
  const openGroups = new Set(['documentos']);

  function row(item) {
    const id = `ck-${item.id}`;
    const box = h('input', { type: 'checkbox', id, checked: item.checked });
    box.checked = item.checked;
    box.addEventListener('change', () => { store.toggle(item.id); if (navigator.vibrate) navigator.vibrate(10); });
    return h('li', { class: `checklist-item${item.checked ? ' is-done' : ''}`, dataset: { itemId: item.id } },
      h('label', { for: id }, box, h('span', {}, item.text)),
      h('button', { type: 'button', class: 'checklist-remove', 'aria-label': `Quitar «${item.text}» de la lista`, onclick: () => store.remove(item.id) }, '✕'));
  }

  function render() {
    const groups = groupChecklist(data, store.state());
    const { done, total } = progress(groups);
    count.textContent = `${done} de ${total} listos`;
    bar.style.setProperty('--progress', `${total ? Math.round((done / total) * 100) : 0}%`);
    bar.setAttribute('aria-valuenow', String(done));
    bar.setAttribute('aria-valuemax', String(total));
    list.replaceChildren(...groups.map((group) => {
      const groupDone = group.items.filter(({ checked }) => checked).length;
      const details = h('details', { class: 'checklist-group', dataset: { group: group.id }, open: openGroups.has(group.id) },
        h('summary', {}, h('span', {}, group.label), h('span', { class: 'tips-count' }, `${groupDone}/${group.items.length}`)),
        h('ul', { class: 'checklist-items' }, group.items.map(row)));
      details.addEventListener('toggle', () => { if (details.open) openGroups.add(group.id); else openGroups.delete(group.id); });
      return details;
    }));
  }
  store.subscribe(render);

  byId('checklist-form').addEventListener('submit', (event) => {
    event.preventDefault();
    openGroups.add('mis'); // open before adding: the store re-renders as soon as it saves
    if (store.add(input.value)) input.value = ''; else render();
    input.focus();
  });
  byId('checklist-reset').addEventListener('click', () => { if (window.confirm('¿Quitar todas las marcas? Tus cosas añadidas se quedan.')) store.uncheckAll(); });
  render();
  return { store };
}
