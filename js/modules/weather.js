// Weather forecast per city from Open-Meteo (free, no API key). Pure parsing plus a small store that keeps the last
// good answer on the device (localStorage, never synced) so the forecast also shows offline.
// Open-Meteo forecasts up to 16 days ahead; days beyond that simply have no data yet.
export const WEATHER_PREFIX = 'weather-v1:';
export const REFRESH_MS = 3 * 60 * 60 * 1000;
export const HOURS_SHOWN = [6, 9, 12, 15, 18, 21];

/** Condition from the WMO weather code. */
export function condition(code) {
  const c = Number(code);
  if (c === 0) return { kind: 'sun', label: 'Despejado' };
  if (c === 1 || c === 2) return { kind: 'part', label: 'Poco nuboso' };
  if (c === 3) return { kind: 'cloud', label: 'Nublado' };
  if (c === 45 || c === 48) return { kind: 'fog', label: 'Niebla' };
  if ((c >= 51 && c <= 57) || (c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { kind: 'rain', label: c >= 80 ? 'Chubascos' : 'Lluvia' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { kind: 'snow', label: 'Nieve' };
  if (c >= 95 && c <= 99) return { kind: 'storm', label: 'Tormenta' };
  return { kind: 'cloud', label: 'Variable' };
}

export function forecastUrl({ lat, lng }, { from, to }) {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset',
    hourly: 'weather_code,temperature_2m,precipitation_probability,wind_speed_10m',
    timezone: 'Asia/Tokyo',
    start_date: from,
    end_date: to
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

const num = (value) => (Number.isFinite(value) ? value : null);
const rounded = (value) => (Number.isFinite(value) ? Math.round(value) : null);

/** Open-Meteo JSON → [{ date, code, max, min, pop, rain, sunrise, sunset, hours: [{ h, code, t, pop, wind }] }]. Days without data are left out. */
export function parseForecast(json) {
  const daily = json?.daily;
  if (!Array.isArray(daily?.time)) return [];
  const hourly = json.hourly ?? {};
  const hoursByDate = new Map();
  (hourly.time ?? []).forEach((stamp, index) => {
    const [date, time] = String(stamp).split('T');
    const h = Number(time?.slice(0, 2));
    if (!HOURS_SHOWN.includes(h)) return;
    const entry = { h, code: num(hourly.weather_code?.[index]), t: rounded(hourly.temperature_2m?.[index]), pop: rounded(hourly.precipitation_probability?.[index]), wind: rounded(hourly.wind_speed_10m?.[index]) };
    if (!hoursByDate.has(date)) hoursByDate.set(date, []);
    hoursByDate.get(date).push(entry);
  });
  return daily.time.map((date, index) => ({
    date,
    code: num(daily.weather_code?.[index]),
    max: rounded(daily.temperature_2m_max?.[index]),
    min: rounded(daily.temperature_2m_min?.[index]),
    pop: rounded(daily.precipitation_probability_max?.[index]),
    rain: num(daily.precipitation_sum?.[index]),
    sunrise: String(daily.sunrise?.[index] ?? '').slice(11, 16) || null,
    sunset: String(daily.sunset?.[index] ?? '').slice(11, 16) || null,
    hours: hoursByDate.get(date) ?? []
  })).filter((day) => day.code !== null && day.max !== null && day.min !== null);
}

/** Short sentence for the top of the hourly sheet. */
export function daySummary(day) {
  const first = condition(day.code).label;
  const morning = day.hours.find((hour) => hour.h === 9);
  const afternoon = day.hours.find((hour) => hour.h === 15);
  const text = morning && afternoon && condition(morning.code).kind !== condition(afternoon.code).kind
    ? `${condition(morning.code).label} por la mañana, ${condition(afternoon.code).label.toLowerCase()} por la tarde`
    : first;
  return `${text} · máx ${day.max}° · mín ${day.min}°`;
}

export function ageText(fetchedAt, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - fetchedAt) / 60_000));
  if (minutes < 2) return 'actualizado ahora';
  if (minutes < 60) return `actualizado hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `actualizado hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `actualizado hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/**
 * Keeps and refreshes the forecast of each city.
 *   get(cityId)            → { fetchedAt, days } | null   (what is stored on the device)
 *   refresh(city, {force}) → fetches when the stored copy is older than REFRESH_MS; keeps the old copy when it fails
 */
export function createWeatherStore({ storage, fetcher = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }), now = () => Date.now() } = {}) {
  const listeners = new Set();
  const read = (cityId) => {
    try {
      const parsed = JSON.parse(storage?.getItem(`${WEATHER_PREFIX}${cityId}`) ?? 'null');
      return parsed && Array.isArray(parsed.days) && Number.isFinite(parsed.fetchedAt) ? parsed : null;
    } catch { return null; }
  };
  const inflight = new Map();
  return {
    get: read,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async refresh({ id, lat, lng, from, to }, { force = false } = {}) {
      const stored = read(id);
      if (!force && stored && now() - stored.fetchedAt < REFRESH_MS && stored.range === `${from}|${to}`) return stored;
      if (inflight.has(id)) return inflight.get(id);
      const request = (async () => {
        try {
          const days = parseForecast(await fetcher(forecastUrl({ lat, lng }, { from, to })));
          const entry = { fetchedAt: now(), range: `${from}|${to}`, days };
          try { storage?.setItem(`${WEATHER_PREFIX}${id}`, JSON.stringify(entry)); } catch { /* storage full or private mode */ }
          listeners.forEach((listener) => listener(id, entry));
          return entry;
        } catch (error) {
          console.warn(`[weather] ${id}: ${error.message}`);
          return stored; // offline or the service is down: the last good copy stays
        } finally { inflight.delete(id); }
      })();
      inflight.set(id, request);
      return request;
    }
  };
}
