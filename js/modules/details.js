// Place detail sheet (modal). Details are always resolved inside the active city.
import { byId, h, externalLink } from './dom.js';
import { findPoint, findDetail } from './city-index.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';
import { visitedStore, isVisitable } from './visited.js';

export function initDetails() {
  const modal = byId('poi-modal');
  const photoElement = byId('poi-photo');
  let cityIndex = null;
  let photos = [];
  let photoIndex = 0;
  let previousFocus = null;
  let openId = null; // local id of the place being shown
  const visited = visitedStore();
  const visitedButton = byId('poi-visited');
  function paintVisited() {
    const point = openId && cityIndex ? findPoint(cityIndex, openId) : null;
    visitedButton.hidden = !point || !isVisitable(point);
    if (visitedButton.hidden) return;
    const done = visited.has(cityIndex.cityId, openId);
    visitedButton.setAttribute('aria-pressed', String(done));
    visitedButton.textContent = done ? '✓ Visitado' : 'Marcar como visitado';
  }
  visitedButton.addEventListener('click', () => { if (openId && cityIndex) visited.toggle(cityIndex.cityId, openId); });
  visited.subscribe(paintVisited);
  const taxiTrigger = byId('poi-taxi');
  function paintTaxi(point, cityName) {
    taxiTrigger.hidden = point.type !== 'hotel';
    taxiTrigger.dataset.taxiName = point.name;
    taxiTrigger.dataset.taxiCity = cityName ?? '';
  }

  function renderPhoto() {
    const photo = photos[photoIndex];
    const source = typeof photo === 'string' ? { src: photo } : photo;
    photoElement.classList.remove('is-fallback');
    byId('poi-gallery').classList.toggle('is-empty', !photos.length); // no photo: a slim band, not half the screen
    photoElement.src = source?.src || '';
    photoElement.srcset = source?.srcSet || '';
    photoElement.sizes = '(max-width: 720px) 100vw, 760px';
    photoElement.alt = source?.alt || (photo ? 'Fotografía del lugar' : 'Fotografía no disponible');
    photoElement.loading = 'lazy';
    photoElement.decoding = 'async';
    photoElement.onerror = () => photoElement.classList.add('is-fallback');
    const counter = byId('poi-photo-count');
    counter.hidden = photos.length === 1; // "1 / 1" says nothing
    counter.textContent = photos.length ? `${photoIndex + 1} / ${photos.length}` : 'Foto no disponible';
    byId('poi-photo-prev').hidden = photos.length < 2;
    byId('poi-photo-next').hidden = photos.length < 2;
  }

  function close() {
    if (modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    releaseOverlay('poi');
    openId = null;
    previousFocus?.focus?.();
  }

  function renderEvent(point, eventPlan) {
    const section = byId('poi-event');
    section.replaceChildren();
    section.hidden = point.type !== 'event' || !eventPlan;
    if (section.hidden) return;
    const list = h('ol', {}, eventPlan.routeStops.map((stop) =>
      h('li', {}, h('strong', {}, `${stop.time} · ${stop.name}`), h('span', {}, stop.note))
    ));
    section.append(
      h('h3', {}, `${eventPlan.title} · ${eventPlan.date}`),
      h('p', {}, `Horario oficial del festival: ${eventPlan.officialHours}. Recomendación: llegar a ${eventPlan.recommendedArrival} a ${eventPlan.start} para buscar sitio antes de la salida.`),
      list,
      externalLink(eventPlan.routeUrl, 'Ver recorrido y paradas en Google Maps'),
      h('p', {}, eventPlan.note),
      externalLink(eventPlan.officialSource, 'Programa oficial de Kyoto City')
    );
  }

  function renderSources(detail) {
    const section = byId('poi-sources-section');
    const sources = detail.sources ?? [];
    section.hidden = sources.length === 0 && !detail.verificationNote;
    byId('poi-verification').textContent = detail.verificationNote ?? '';
    byId('poi-verification').hidden = !detail.verificationNote;
    byId('poi-sources').replaceChildren(...sources.map((source) => h('li', {}, externalLink(source.url, `${source.label} ↗`))));
  }

  function open(localId) {
    if (!cityIndex) return;
    const point = findPoint(cityIndex, localId);
    if (!point || point.type === 'restaurant') return;
    const detail = findDetail(cityIndex, localId) ?? {};
    previousFocus = document.activeElement;
    byId('poi-title').textContent = point.name;
    byId('poi-description').textContent = detail.description || point.desc || '';
    photos = Array.isArray(detail.photos) ? detail.photos : [];
    photoIndex = 0;
    renderPhoto();

    const directions = byId('poi-directions');
    directions.replaceChildren();
    [['search', 'Ver ubicación'], ['transit', 'Transporte público'], ['walking', 'A pie']].forEach(([key, label]) => {
      if (detail.directions?.[key]) directions.append(externalLink(detail.directions[key], label));
    });

    const guides = detail.audioGuides ?? [];
    byId('poi-audio-section').hidden = guides.length === 0;
    byId('poi-audio-links').replaceChildren(...guides.flatMap((guide) => [h('p', {}, guide.note || ''), externalLink(guide.url, guide.label)]));

    renderSources(detail);
    renderEvent(point, cityIndex.events);
    openId = localId;
    paintVisited();
    paintTaxi(point, byId('hero-title')?.textContent);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    openOverlay('poi', close);
    document.querySelector('.poi-back').focus();
  }

  document.querySelectorAll('[data-close-detail]').forEach((button) => button.addEventListener('click', close));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  byId('poi-photo-prev').addEventListener('click', () => { photoIndex = (photoIndex - 1 + photos.length) % photos.length; renderPhoto(); });
  byId('poi-photo-next').addEventListener('click', () => { photoIndex = (photoIndex + 1) % photos.length; renderPhoto(); });

  return {
    open,
    close,
    setCity(index) {
      close();
      cityIndex = index;
    }
  };
}
