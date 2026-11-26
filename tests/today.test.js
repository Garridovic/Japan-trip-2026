import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseStartMinutes, parseEndMinutes, stopStates, tripMoment, localDateISO, daysBetween, directionsTo, stopPlace } from '../js/modules/today.js';
import { swipeDirection } from '../js/modules/swipe.js';

const itinerary = async (city) => JSON.parse(await readFile(new URL(`../data/cities/${city}/itinerary.json`, import.meta.url), 'utf8'));
const at = (iso) => new Date(`${iso}`); // local time of the machine running the tests, like the app

test('times are read the way the itinerary writes them', () => {
  assert.equal(parseStartMinutes('10:30–11:30'), 630);
  assert.equal(parseStartMinutes('19:00 en adelante'), 1140);
  assert.equal(parseStartMinutes('10:00'), 600);
  assert.equal(parseStartMinutes('Tarde'), null);
  assert.equal(parseEndMinutes('10:30–11:30'), 690);
  assert.equal(parseEndMinutes('11:45–12:30 aprox.'), 750);
  assert.equal(parseEndMinutes('18:00–noche'), null);
  assert.equal(parseEndMinutes('10:00'), null);
});

test('every stop of every itinerary has a time the card can use (only "Tarde" is vague)', async () => {
  for (const city of ['kyoto', 'osaka']) {
    for (const day of (await itinerary(city)).days.filter((item) => item.detail)) {
      for (const stop of day.detail.stops) {
        assert.ok(parseStartMinutes(stop.time) !== null || /^Tarde$/i.test(stop.time), `${city} ${day.date}: "${stop.time}"`);
      }
    }
  }
});

test('stops are done, now, next or later according to the time of day', () => {
  const stops = [{ time: '10:30–11:30' }, { time: '11:45–13:15' }, { time: '13:45–16:00' }, { time: '18:00–noche' }];
  assert.deepEqual(stopStates(stops, 9 * 60), ['next', 'later', 'later', 'later']);
  assert.deepEqual(stopStates(stops, 11 * 60), ['now', 'next', 'later', 'later']);
  assert.deepEqual(stopStates(stops, 11 * 60 + 35), ['done', 'next', 'later', 'later'], 'between two stops the next one is "next"');
  assert.deepEqual(stopStates(stops, 14 * 60), ['done', 'done', 'now', 'next']);
  assert.deepEqual(stopStates(stops, 20 * 60), ['done', 'done', 'done', 'now'], 'an open-ended last stop lasts until the end of the day');
});

test('a vague stop takes the place of the previous one', () => {
  const stops = [{ time: '14:30–15:00 aprox.' }, { time: 'Tarde' }];
  assert.deepEqual(stopStates(stops, 15 * 60 + 30), ['done', 'now']);
});

test('the trip moment: before, today, after, and no day without a plan', async () => {
  const { days } = await itinerary('kyoto');
  assert.deepEqual(['before', 10], [tripMoment(days, at('2026-12-01T09:00:00')).kind, tripMoment(days, at('2026-12-01T09:00:00')).daysLeft]);
  assert.equal(tripMoment(days, at('2026-12-10T23:00:00')).daysLeft, 1);
  const today = tripMoment(days, at('2026-12-11T13:00:00'));
  assert.equal(today.kind, 'today');
  assert.equal(today.current.title, 'Mercado Nishiki');
  assert.equal(today.next.title, 'Castillo Nijō');
  assert.equal(tripMoment(days, at('2026-12-11T23:30:00')).finished, false, 'the open-ended last stop is still on');
  assert.equal(tripMoment(days, at('2026-12-20T09:00:00')).kind, 'after');
  assert.equal(tripMoment([], at('2026-12-11T09:00:00')).kind, 'none');
});

test('dates are the phone\'s local date, and day counts do not drift with daylight saving', () => {
  assert.equal(localDateISO(new Date(2026, 11, 5, 23, 59)), '2026-12-05');
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-12-11', '2026-12-11'), 0);
});

test('directions go to the place name with the city, never to coordinates the data does not have', () => {
  assert.equal(stopPlace({ title: 'Agora Kyoto Karasuma · dejar equipaje' }), 'Agora Kyoto Karasuma');
  const url = directionsTo('Mercado Nishiki', 'Kyoto, Japan');
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=Mercado%20Nishiki%2C%20Kyoto%2C%20Japan&travelmode=transit$/);
});

test('swipes need distance and must be mostly horizontal', () => {
  assert.equal(swipeDirection(-120, 10), 'left');
  assert.equal(swipeDirection(120, -20), 'right');
  assert.equal(swipeDirection(-30, 0), null, 'too short');
  assert.equal(swipeDirection(-100, 90), null, 'a scroll, not a swipe');
});
