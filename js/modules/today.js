// "Hoy" card: which day of the trip it is (from the phone's date), what is on now and what comes next.
// The pure functions here take a `now` Date so they can be tested; the card itself only reads the itinerary data.
import { byId, h, externalLink } from './dom.js';

const END_OF_DAY = 24 * 60 - 1;

/** "10:30–11:30" → 630; "19:00 en adelante" → 1140; "Tarde" → null. */
export function parseStartMinutes(time) {
  const match = /^\s*(\d{1,2}):(\d{2})/.exec(time ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "10:30–11:30" → 690; "18:00–noche" or "10:00" → null (open ended). */
export function parseEndMinutes(time) {
  const match = /[–-]\s*(\d{1,2}):(\d{2})/.exec(time ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export const localDateISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const localMinutes = (date) => date.getHours() * 60 + date.getMinutes();

const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
export const daysBetween = (fromIso, toIso) => dayNumber(toIso) - dayNumber(fromIso);

/** Gives every stop a window [start, end) and a state: done, now, next or later. */
export function stopStates(stops, minutes) {
  let carry = 12 * 60;
  const windows = stops.map((stop) => {
    const start = parseStartMinutes(stop.time) ?? carry;
    const end = parseEndMinutes(stop.time);
    carry = end ?? start;
    return { start, end };
  });
  windows.forEach((window, index) => {
    if (window.end === null) window.end = windows[index + 1]?.start ?? END_OF_DAY; // open ended: until the next stop
    window.end = Math.max(window.end, window.start);
  });
  let nextFound = false;
  return windows.map(({ start, end }) => {
    if (minutes >= end) return 'done';
    if (minutes >= start) return 'now';
    if (!nextFound) { nextFound = true; return 'next'; }
    return 'later';
  });
}

/**
 * Where the trip is for one city, given its days (with ISO `date`) and the current moment:
 *  - before: the city has not started (daysLeft counts to its first day)
 *  - today:  today is one of its days (day, states per stop, current/next stop)
 *  - after:  the city's days are over
 */
export function tripMoment(days, now) {
  const planned = days.filter((day) => day.date && day.detail);
  if (!planned.length) return { kind: 'none' };
  const today = localDateISO(now);
  const first = planned[0];
  const last = planned[planned.length - 1];
  if (today < first.date) return { kind: 'before', daysLeft: daysBetween(today, first.date), first };
  if (today > last.date) return { kind: 'after' };
  const day = planned.find((item) => item.date === today);
  if (!day) return { kind: 'before', daysLeft: 0, first };
  const states = stopStates(day.detail.stops, localMinutes(now));
  const stops = day.detail.stops;
  return {
    kind: 'today',
    day,
    states,
    current: stops[states.indexOf('now')] ?? null,
    next: stops[states.indexOf('next')] ?? null,
    finished: states.every((state) => state === 'done'),
    tomorrow: planned.find((item) => item.date > today) ?? null
  };
}

const stopLabel = (stop) => `${stop.time.replace(' aprox.', '').split('–')[0].replace(' en adelante', '')} · ${stop.title}`;
/** The place to navigate to: the part of the stop title before « · » is the place name. */
export const stopPlace = (stop) => stop.title.split(' · ')[0];
export const directionsTo = (place, context) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place}, ${context}`)}&travelmode=transit`;

export function initToday({ win = window, doc = document } = {}) {
  const card = byId('today-card');
  let current = null; // { days, cityName, queryContext }
  let timer = null;

  function markTimeline(moment) {
    doc.querySelectorAll('.day-detail .stop').forEach((stop) => stop.classList.remove('is-done', 'is-now', 'is-next'));
    if (moment.kind !== 'today') return;
    const details = doc.getElementById(`dia${moment.day.key}`);
    if (!details) return;
    details.dataset.today = 'true';
    details.querySelectorAll('.stop').forEach((stop, index) => {
      const state = moment.states[index];
      if (state && state !== 'later') stop.classList.add(`is-${state}`);
    });
  }

  function render() {
    if (!current) return;
    const moment = tripMoment(current.days, new Date());
    doc.querySelectorAll('.day-detail[data-today]').forEach((node) => node.removeAttribute('data-today'));
    markTimeline(moment);
    card.hidden = moment.kind === 'none' || moment.kind === 'after';
    card.dataset.moment = moment.kind;
    if (card.hidden) { card.replaceChildren(); return; }
    if (moment.kind === 'before') {
      const first = moment.first;
      card.replaceChildren(
        h('div', { class: 'today-eyebrow' }, `Tu viaje a ${current.cityName}`),
        h('h3', {}, moment.daysLeft === 0 ? 'Empieza hoy' : moment.daysLeft === 1 ? 'Empieza mañana' : `Faltan ${moment.daysLeft} días`),
        h('p', { class: 'today-line' }, `${first.quick.date} · ${first.quick.title}`),
        h('div', { class: 'today-actions' }, h('a', { class: 'today-button', href: `#dia${first.key}`, onclick: () => { doc.getElementById(`dia${first.key}`)?.setAttribute('open', ''); } }, 'Ver el primer día'))
      );
      return;
    }
    const { day, current: now, next } = moment;
    const target = next ?? now;
    const lines = [];
    if (now) lines.push(h('p', { class: 'today-line is-now' }, h('span', {}, 'Ahora'), stopLabel(now)));
    if (next) lines.push(h('p', { class: 'today-line' }, h('span', {}, 'Siguiente'), stopLabel(next)));
    if (!now && !next) lines.push(h('p', { class: 'today-line' }, moment.tomorrow ? `Plan de hoy terminado. Mañana: ${moment.tomorrow.quick.title}.` : 'Plan de hoy terminado.'));
    card.replaceChildren(
      h('div', { class: 'today-eyebrow' }, `Hoy · ${day.quick.date}`),
      h('h3', {}, day.quick.title),
      ...lines,
      h('div', { class: 'today-actions' },
        target && externalLink(directionsTo(stopPlace(target), current.queryContext), 'Cómo llegar', 'today-button'),
        h('a', { class: 'today-button is-secondary', href: `#dia${day.key}`, onclick: () => { doc.getElementById(`dia${day.key}`)?.setAttribute('open', ''); } }, 'Ver el día')
      )
    );
  }

  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') render(); });
  timer = win.setInterval(render, 60_000);

  return {
    /** Call after the city's itinerary is rendered. */
    show({ days, cityName, queryContext }) {
      current = { days, cityName, queryContext };
      render();
    },
    refresh: render,
    stop() { win.clearInterval(timer); }
  };
}
