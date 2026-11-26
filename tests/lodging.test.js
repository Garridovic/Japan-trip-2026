import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { nights, formatRange, formatDay, statusFor, copyText, validateLodging, FORBIDDEN_KEYS } from '../js/modules/lodging.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const raw = await readFile(`${root}data/global/lodging.json`, 'utf8');
const data = JSON.parse(raw);

test('the lodging data is valid and covers the whole trip without gaps or overlaps', () => {
  assert.deepEqual(validateLodging(data), []);
  assert.deepEqual(data.stays.map(({ id }) => id), ['tokyo-1', 'hakone', 'kyoto', 'osaka', 'nara', 'tokyo-2']);
  assert.equal(data.stays[0].checkIn, '2026-12-08');
  assert.equal(data.stays.at(-1).checkOut, '2026-12-22');
  assert.equal(data.stays.reduce((sum, stay) => sum + nights(stay.checkIn, stay.checkOut), 0), 14);
});

test('nights per stay match the plan (Tokio 2, Hakone 1, Kioto 4, Osaka 2, Nara 1, Tokio 4)', () => {
  assert.deepEqual(data.stays.map((stay) => nights(stay.checkIn, stay.checkOut)), [2, 1, 4, 2, 1, 4]);
});

test('the public repository never receives PINs, booking numbers, who paid or amounts', () => {
  assert.deepEqual(FORBIDDEN_KEYS.filter((key) => raw.toLowerCase().includes(`"${key}"`)), []);
  assert.doesNotMatch(raw, /\bPIN\b/i);
  assert.doesNotMatch(raw, /[€¥]|\bJPY\b|\beur(os?)?\b/i, 'no amounts');
  assert.doesNotMatch(raw, /pagad[oa] por|pagó|\bpaid by\b/i, 'nobody is named as the payer');
  for (const name of ['Miguel', 'Ángel', 'Eva']) assert.ok(!raw.includes(name), `${name} must not appear`);
  assert.deepEqual(validateLodging({ stays: [{ ...data.stays[0], pin: '1234' }] }).filter((p) => p.includes('forbidden')), ['forbidden key "pin" (the repository is public)']);
});

test('addresses and map links are the ones given in the trip document', () => {
  const byId = Object.fromEntries(data.stays.map((stay) => [stay.id, stay]));
  assert.equal(byId.osaka.name, 'The Bridge Hotel Shinsaibashi');
  assert.equal(byId.osaka.address, 'Chuo-ku Nishi Shinsaibashi 1-10-24, Osaka 542-0086');
  assert.equal(byId.osaka.mapsUrl, 'https://maps.app.goo.gl/ohmM1sY272qXbuhj7');
  assert.equal(byId.kyoto.mapsUrl, 'https://maps.app.goo.gl/vGFBKz2eG2h4FQJs5');
  assert.equal(byId['tokyo-1'].mapsUrl, byId['tokyo-2'].mapsUrl, 'same hotel for both Tokyo stays');
  assert.equal(byId.osaka.freeCancellationUntil, '2026-12-08');
  assert.equal(byId.osaka.checkInHint, 'Check-in orientativo 12:00–14:00 (por confirmar)');
  assert.equal(byId.nara.freeCancellationUntil, '2026-12-10');
});

test('Osaka lodging matches the Osaka city hero hotel', async () => {
  const city = JSON.parse(await readFile(`${root}data/cities/osaka/city.json`, 'utf8'));
  const osaka = data.stays.find(({ city: id }) => id === 'osaka');
  assert.equal(city.hero.hotel.name, osaka.name);
  assert.equal(city.hero.hotel.mapUrl, osaka.mapsUrl);
  const journey = JSON.parse(await readFile(`${root}data/journey.json`, 'utf8'));
  const entry = journey.cities.find(({ id }) => id === 'osaka');
  assert.equal(entry.arrivalDate, osaka.checkIn);
  assert.equal(entry.departureDate, osaka.checkOut);
});

test('date formatting in Spanish', () => {
  assert.equal(formatRange('2026-12-08', '2026-12-10'), 'Mar 8 → Jue 10 dic');
  assert.equal(formatRange('2026-12-17', '2026-12-18'), 'Jue 17 → Vie 18 dic');
  assert.equal(formatDay('2026-12-08'), '8 de diciembre');
});

test('stays are marked as past, current or next relative to today (Japan date)', () => {
  const status = (today) => data.stays.map((stay) => statusFor(stay, today, data.stays)).join(',');
  assert.equal(status('2026-12-01'), 'next,future,future,future,future,future');
  assert.equal(status('2026-12-09'), 'current,next,future,future,future,future');
  assert.equal(statusFor(data.stays[2], '2026-12-13', data.stays), 'current');
  assert.equal(statusFor(data.stays[2], '2026-12-15', data.stays), 'past');
  assert.equal(statusFor(data.stays[3], '2026-12-15', data.stays), 'current');
  assert.equal(statusFor(data.stays[0], '2026-12-30', data.stays), 'past');
});

test('copying gives hotel name plus address', () => {
  assert.equal(copyText(data.stays[3]), 'The Bridge Hotel Shinsaibashi, Chuo-ku Nishi Shinsaibashi 1-10-24, Osaka 542-0086');
});

test('validation catches gaps, overlaps, wrong years and bad links', () => {
  const stay = (id, checkIn, checkOut, extra = {}) => ({ id, city: 'x', cityName: 'X', name: 'N', address: 'A', mapsUrl: 'https://maps.app.goo.gl/a', checkIn, checkOut, ...extra });
  assert.deepEqual(validateLodging({ stays: [stay('a', '2026-12-08', '2026-12-10'), stay('b', '2026-12-10', '2026-12-12')] }), []);
  assert.match(validateLodging({ stays: [stay('a', '2026-12-08', '2026-12-10'), stay('b', '2026-12-11', '2026-12-12')] }).join(), /gap/);
  assert.match(validateLodging({ stays: [stay('a', '2026-12-08', '2026-12-10'), stay('b', '2026-12-09', '2026-12-12')] }).join(), /overlaps/);
  assert.match(validateLodging({ stays: [stay('a', '2025-12-08', '2025-12-10')] }).join(), /2026/);
  assert.match(validateLodging({ stays: [stay('a', '2026-12-08', '2026-12-08')] }).join(), /one night/);
  assert.match(validateLodging({ stays: [stay('a', '2026-12-08', '2026-12-10', { mapsUrl: 'http://evil.example' })] }).join(), /Google Maps/);
});
