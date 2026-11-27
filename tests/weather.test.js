import test from 'node:test';
import assert from 'node:assert/strict';
import { condition, parseForecast, forecastUrl, daySummary, ageText, createWeatherStore, REFRESH_MS } from '../js/modules/weather.js';

const sample = {
  daily: { time: ['2026-12-12', '2026-12-13'], weather_code: [0, 61], temperature_2m_max: [11.4, 8.6], temperature_2m_min: [2.2, 4], precipitation_probability_max: [0, 70], precipitation_sum: [0, 5.2], sunrise: ['2026-12-12T06:56', '2026-12-13T06:57'], sunset: ['2026-12-12T16:46', '2026-12-13T16:46'] },
  hourly: {
    time: ['2026-12-12T06:00', '2026-12-12T07:00', '2026-12-12T09:00', '2026-12-12T15:00', '2026-12-13T12:00'],
    weather_code: [3, 3, 0, 2, 61], temperature_2m: [2.1, 3, 6.4, 11, 8], precipitation_probability: [0, 0, 0, 10, 70], wind_speed_10m: [3.2, 4, 5, 10, 12]
  }
};

test('weather codes become a simple condition in Spanish', () => {
  assert.deepEqual([0, 2, 3, 45, 61, 81, 73, 95].map((code) => condition(code).kind), ['sun', 'part', 'cloud', 'fog', 'rain', 'rain', 'snow', 'storm']);
  assert.equal(condition(0).label, 'Despejado');
  assert.equal(condition(null === 1 ? 1 : 999).kind, 'cloud', 'unknown codes stay neutral');
});

test('the Open-Meteo answer is reduced to days with the hours the sheet shows', () => {
  const [d1, d2] = parseForecast(sample);
  assert.deepEqual([d1.date, d1.code, d1.max, d1.min, d1.pop], ['2026-12-12', 0, 11, 2, 0]);
  assert.deepEqual([d1.sunrise, d1.sunset], ['06:56', '16:46']);
  assert.deepEqual(d1.hours.map((hour) => hour.h), [6, 9, 15], 'only 6, 9, 12, 15, 18 and 21 h are kept');
  assert.deepEqual(d1.hours[1], { h: 9, code: 0, t: 6, pop: 0, wind: 5 });
  assert.equal(d2.rain, 5.2);
  assert.deepEqual(parseForecast({}), []);
  assert.deepEqual(parseForecast({ daily: { time: ['2026-12-12'], weather_code: [null], temperature_2m_max: [1], temperature_2m_min: [0] } }), [], 'days without data are dropped');
});

test('the request asks for Japan time, only the dates needed and needs no key', () => {
  const url = new URL(forecastUrl({ lat: 35, lng: 135.7 }, { from: '2026-12-11', to: '2026-12-15' }));
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.searchParams.get('timezone'), 'Asia/Tokyo');
  assert.equal(url.searchParams.get('start_date'), '2026-12-11');
  assert.equal([...url.searchParams.keys()].some((key) => /key|token/i.test(key)), false);
});

test('texts: summary of the day and how old the data is', () => {
  const [day] = parseForecast(sample);
  assert.match(daySummary(day), /máx 11° · mín 2°/);
  assert.match(daySummary(day), /Despejado por la mañana, poco nuboso por la tarde/);
  const t0 = 1_000_000_000_000;
  assert.equal(ageText(t0, t0 + 30_000), 'actualizado ahora');
  assert.equal(ageText(t0, t0 + 20 * 60_000), 'actualizado hace 20 min');
  assert.equal(ageText(t0, t0 + 3 * 3_600_000), 'actualizado hace 3 h');
  assert.equal(ageText(t0, t0 + 30 * 3_600_000), 'actualizado hace 1 día');
});

const memory = () => { const data = {}; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data }; };
const city = { id: 'kyoto', lat: 35, lng: 135.7, from: '2026-12-11', to: '2026-12-15' };

test('the store keeps the forecast on the device and only asks again after three hours', async () => {
  let calls = 0;
  let time = 5_000_000;
  const storage = memory();
  const store = createWeatherStore({ storage, fetcher: async () => { calls += 1; return sample; }, now: () => time });
  assert.equal(store.get('kyoto'), null);
  const first = await store.refresh(city);
  assert.equal(first.days.length, 2);
  assert.equal(store.get('kyoto').fetchedAt, 5_000_000);
  await store.refresh(city);
  assert.equal(calls, 1, 'fresh copy: no new request');
  time += REFRESH_MS + 1;
  await store.refresh(city);
  assert.equal(calls, 2);
  await store.refresh({ ...city, to: '2026-12-14' });
  assert.equal(calls, 3, 'a wider or shorter range asks again');
  await store.refresh(city, { force: true });
  assert.equal(calls, 4);
});

test('offline or a failing service keeps the last good copy and never throws', async () => {
  const storage = memory();
  let fail = false;
  let time = 1;
  const store = createWeatherStore({ storage, fetcher: async () => { if (fail) throw new Error('offline'); return sample; }, now: () => time });
  await store.refresh(city);
  fail = true;
  time += REFRESH_MS + 1;
  const kept = await store.refresh(city);
  assert.equal(kept.days.length, 2);
  assert.equal(store.get('kyoto').days.length, 2);
  const empty = createWeatherStore({ storage: memory(), fetcher: async () => { throw new Error('offline'); } });
  assert.equal(await empty.refresh(city), null);
  assert.equal(createWeatherStore({ storage: { getItem: () => '{broken', setItem() {} } }).get('kyoto'), null);
});

test('the forecast is device-only: it never goes through the synced user data', async () => {
  const { SYNCED_KEYS } = await import('../js/modules/user-data.js');
  assert.equal(SYNCED_KEYS.some((key) => key.startsWith('weather')), false);
});
