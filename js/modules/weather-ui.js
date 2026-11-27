// "El tiempo" card of the header carousel and the hourly sheet that opens when a day is tapped.
import { byId, h } from './dom.js';
import { condition, dayCondition, createWeatherStore, daySummary, dayAdvice, ageText, HOURS_SHOWN } from './weather.js';
import { addDays, localISO, weekdayShort, dateShort } from './trip-status.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';
import { swipeDirection } from './swipe.js';
import { userStorage } from './user-data.js';

export const FORECAST_DAYS = 15; // Open-Meteo answers for today + 15 days at most

const NS = 'http://www.w3.org/2000/svg';
const ICON_PATHS = {
  sun: ['circle:12:12:4.5', 'M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8'],
  part: ['circle:9:9:3.5', 'M9 3v1.5M3 9h1.5M4.8 4.8l1 1M13.2 4.8l-1 1', 'M9 19h9a3.4 3.4 0 0 0 .3-6.8 4.6 4.6 0 0 0-8.8 1.3A2.8 2.8 0 0 0 9 19Z'],
  cloud: ['M7 18h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18Z'],
  rain: ['M7 15h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 15Z', 'M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5'],
  snow: ['M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14Z', 'M9 17.5v.01M13 19v.01M17 17.5v.01M11 21v.01'],
  fog: ['M7 13h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 13Z', 'M5 17h14M8 20.5h8'],
  storm: ['M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 14Z', 'M12.5 14l-2.5 4h3l-2 4']
};
export function weatherIcon(code, kindOverride = null) {
  const kind = kindOverride ?? condition(code).kind;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `wi wi-${kind}`);
  svg.setAttribute('aria-hidden', 'true');
  for (const item of ICON_PATHS[kind]) {
    if (item.startsWith('circle:')) {
      const [, cx, cy, r] = item.split(':');
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r);
      svg.append(circle);
    } else {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', item);
      svg.append(path);
    }
  }
  return svg;
}

const WEEKDAY_LONG = { Dom: 'Domingo', Lun: 'Lunes', Mar: 'Martes', Mié: 'Miércoles', Jue: 'Jueves', Vie: 'Viernes', Sáb: 'Sábado' };
const dayLabel = (iso) => `${weekdayShort(iso)} ${iso.slice(8)}`;
const dayLong = (iso) => `${weekdayShort(iso)} ${dateShort(iso)}`;
const popText = (pop) => (pop === null ? '' : `${pop} %`);
const dayAria = (day) => `${dayLong(day.date)}: ${dayCondition(day).label}, máxima ${day.max} grados, mínima ${day.min}, lluvia ${day.pop ?? 0} %. Ver por horas`;

/** `trip` is { arrival, departure } of the active city; `where` is { id, name, lat, lng }. Returns controls for main.js. */
export function initWeather({ storage = userStorage(), fetcher, now = () => new Date() } = {}) {
  const raw = (() => { try { return window.localStorage; } catch { return null; } })(); // device only: never part of the synced data
  const store = createWeatherStore({ storage: raw ?? storage, fetcher });
  const strip = byId('weather-strip');
  const note = byId('weather-note');
  const sheet = byId('weather-sheet');
  const scrim = byId('weather-scrim');
  let current = null; // { where, trip }
  let selected = null;
  let days = [];

  const range = (trip) => {
    const today = localISO(now());
    const from = trip.arrival > today ? trip.arrival : today;
    const last = addDays(today, FORECAST_DAYS);
    return { from, to: trip.departure < last ? trip.departure : last, today };
  };

  function renderStrip() {
    if (!current) return;
    const { trip } = current;
    const stored = store.get(current.where.id);
    days = (stored?.days ?? []).filter((day) => day.date >= trip.arrival && day.date <= trip.departure);
    const byDate = new Map(days.map((day) => [day.date, day]));
    const today = localISO(now());
    const cells = [];
    for (let date = trip.arrival; date <= trip.departure; date = addDays(date, 1)) {
      const day = byDate.get(date);
      const cell = day
        ? h('button', { type: 'button', class: `wd${date === today ? ' is-today' : ''}`, dataset: { date }, 'aria-label': dayAria(day), onclick: () => openSheet(date) },
          h('span', { class: 'wday' }, dayLabel(date)), weatherIcon(day.code, dayCondition(day).kind),
          h('span', { class: 'wt' }, h('b', {}, `${day.max}°`), ` ${day.min}°`), h('span', { class: 'wp' }, popText(day.pop)))
        : h('div', { class: 'wd is-empty', dataset: { date }, 'aria-label': `${dayLong(date)}: sin previsión todavía` },
          h('span', { class: 'wday' }, dayLabel(date)), h('span', { class: 'wt' }, '—'), h('span', { class: 'wp' }, 'aún no'));
      cells.push(cell);
    }
    strip.replaceChildren(...cells);
    renderBrief();
    strip.style.setProperty('--days', String(cells.length));
    const missing = cells.length - days.length;
    note.textContent = stored
      ? `Open-Meteo · ${ageText(stored.fetchedAt, now().getTime())}${missing ? ` · ${missing === 1 ? 'un día más aparecerá' : `${missing} días más aparecerán`} cuando haya previsión` : ' · toca un día para verlo por horas'}`
      : (navigator.onLine === false ? 'Sin internet y aún sin previsión guardada.' : 'Cargando la previsión…');
  }

  /** One useful line under the strip: today (or the first day with a forecast), its summary, sun times and tips. */
  function renderBrief() {
    const box = byId('weather-brief');
    if (!days.length) { box.replaceChildren(); return; }
    const today = localISO(now());
    const day = days.find((item) => item.date === today) ?? days[0];
    const label = day.date === today ? 'Hoy' : dayLong(day.date);
    box.replaceChildren(
      h('p', { class: 'weather-brief-title' }, h('b', {}, `${label}: `), daySummary(day)),
      ...(day.sunrise && day.sunset ? [h('p', {}, `Amanece ${day.sunrise} · anochece ${day.sunset}`)] : []),
      ...dayAdvice(day).map((tip) => h('p', { class: 'weather-tip' }, tip)));
  }

  async function refresh({ force = false } = {}) {
    if (!current) return;
    const { where, trip } = current;
    const { from, to } = range(trip);
    if (from > to) { renderStrip(); return; } // the trip is further away than the forecast reaches
    await store.refresh({ ...where, from, to }, { force });
    if (current?.where.id === where.id) renderStrip();
  }

  // ---- hourly sheet ----
  const chips = byId('weather-days');
  const hoursBox = byId('weather-hours');
  function renderSheet() {
    const day = days.find((item) => item.date === selected);
    if (!day) return;
    byId('weather-sheet-title').textContent = `${WEEKDAY_LONG[weekdayShort(day.date)]} ${dateShort(day.date)} · ${current.where.name}`;
    byId('weather-sheet-summary').textContent = daySummary(day);
    chips.replaceChildren(...days.map((item) => h('button', { type: 'button', class: `wchip${item.date === selected ? ' is-active' : ''}`, 'aria-pressed': String(item.date === selected), onclick: () => { selected = item.date; renderSheet(); } }, dayLabel(item.date))));
    const hours = HOURS_SHOWN.map((hour) => day.hours.find((entry) => entry.h === hour)).filter(Boolean);
    hoursBox.replaceChildren(...(hours.length ? hours.map((hour) => h('div', { class: 'wh', 'aria-label': `${hour.h}:00, ${condition(hour.code).label}, ${hour.t} grados, lluvia ${hour.pop ?? 0} %, viento ${hour.wind} km/h` },
      h('span', {}, `${hour.h}:00`), weatherIcon(hour.code), h('b', {}, `${hour.t}°`), h('span', { class: 'wr' }, popText(hour.pop)), h('span', { class: 'ww' }, hour.wind === null ? '' : `${hour.wind} km/h`)))
      : [h('p', { class: 'muted small' }, 'Sin datos por horas para este día.')]));
    byId('weather-facts').replaceChildren(...[
      day.sunrise && `Amanece ${day.sunrise}`, day.sunset && `Anochece ${day.sunset}`, day.rain !== null && `Lluvia total ${Math.round(day.rain * 10) / 10} mm`
    ].filter(Boolean).map((text) => h('span', {}, text)));
    byId('weather-sheet-note').textContent = `Open-Meteo · ${ageText(store.get(current.where.id)?.fetchedAt ?? 0, now().getTime())} · desliza para cambiar de día`;
  }
  function openSheet(date) {
    selected = date;
    renderSheet();
    const wasHidden = sheet.hidden;
    sheet.hidden = false; scrim.hidden = false;
    document.body.classList.add('has-weather-sheet');
    if (wasHidden) openOverlay('weather', () => closeSheet({ fromHistory: true }));
    byId('weather-close').focus();
  }
  function closeSheet({ fromHistory = false } = {}) {
    if (sheet.hidden) return;
    sheet.hidden = true; scrim.hidden = true;
    document.body.classList.remove('has-weather-sheet');
    if (!fromHistory) releaseOverlay('weather');
    strip.querySelector(`[data-date="${selected}"]`)?.focus();
  }
  byId('weather-close').addEventListener('click', () => closeSheet());
  scrim.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !sheet.hidden) closeSheet(); });
  const step = (direction) => {
    const index = days.findIndex((day) => day.date === selected) + direction;
    if (index >= 0 && index < days.length) { selected = days[index].date; renderSheet(); }
  };
  let start = null;
  sheet.addEventListener('touchstart', (event) => { start = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
  sheet.addEventListener('touchend', (event) => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y);
    start = null;
    if (direction) step(direction === 'left' ? 1 : -1);
  }, { passive: true });

  window.addEventListener('online', () => refresh());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  store.subscribe((id) => { if (current?.where.id === id) renderStrip(); });

  return {
    /** Call each time a city is shown. */
    show(where, trip) {
      current = { where, trip };
      if (!trip?.arrival || !trip?.departure) { current = null; strip.replaceChildren(); note.textContent = ''; return Promise.resolve(); }
      if (!sheet.hidden) closeSheet();
      renderStrip();
      return refresh();
    },
    refresh
  };
}
