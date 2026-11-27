import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOWS, pickFlow, touchSession, isEve, readState, writeState, SESSION_GAP_MS, MIN_SPACING_MS } from '../js/modules/onboarding.js';

const fresh = (patch = {}) => ({ v: 1, sessions: 1, lastActive: 0, lastShown: 0, seen: {}, snoozed: {}, ...patch });
const ctx = { now: 10_000_000, today: '2026-11-27', tripStart: '2026-12-08' };

test('there are six flows, each with a view, a target and Spanish text', () => {
  assert.deepEqual(FLOWS.map((f) => f.id).sort(), ['checklists', 'map-filters', 'offline-map', 'tabs', 'taxi', 'welcome']);
  for (const flow of FLOWS) assert.ok(flow.view && flow.target && flow.title && flow.text && flow.label);
});

test('first session: welcome in the guide, filters in the map; nothing else', () => {
  assert.equal(pickFlow(fresh(), 'guia', ctx).id, 'welcome');
  assert.equal(pickFlow(fresh(), 'mapa', ctx).id, 'map-filters');
  assert.equal(pickFlow(fresh(), 'viaje', ctx), null);
  assert.equal(pickFlow(fresh(), 'frases', ctx), null);
});

test('second session: offline map in Mapa, checklists in Viaje; the first-session tips are gone', () => {
  const second = fresh({ sessions: 2 });
  assert.equal(pickFlow(second, 'mapa', ctx).id, 'offline-map');
  assert.equal(pickFlow(second, 'viaje', ctx).id, 'checklists');
  assert.equal(pickFlow(second, 'guia', ctx), null);
  assert.equal(pickFlow(second, 'mapa', { ...ctx, mapOfflineState: 'complete' }), null); // already saved: nothing to teach
});

test('the day before the trip: tabs, then taxi, both in the guide (hotel card); Viaje keeps its checklists', () => {
  const eve = { ...ctx, today: '2026-12-07' };
  assert.equal(isEve('2026-12-08', '2026-12-06'), false);
  assert.equal(isEve('2026-12-08', '2026-12-07'), true);
  assert.equal(isEve('2026-12-08', '2026-12-20'), true);
  assert.equal(isEve('', '2026-12-07'), false);
  const state = fresh({ sessions: 3 });
  assert.equal(pickFlow(state, 'guia', eve).id, 'tabs');
  assert.equal(pickFlow(fresh({ sessions: 3, seen: { tabs: 1 } }), 'guia', eve).id, 'taxi'); // next visit to the guide
  assert.equal(pickFlow(state, 'viaje', eve).id, 'checklists');
  assert.equal(pickFlow(state, 'guia', ctx), null); // not yet the eve
});

test('seen tips never return; «Más tarde» waits for the next session; spacing of one minute', () => {
  assert.equal(pickFlow(fresh({ seen: { welcome: 1 } }), 'guia', ctx), null);
  const snoozed = fresh({ snoozed: { welcome: 1 } });
  assert.equal(pickFlow(snoozed, 'guia', ctx), null);
  assert.equal(pickFlow({ ...snoozed, sessions: 2 }, 'guia', ctx), null); // welcome is for the first session only
  assert.equal(pickFlow(fresh({ sessions: 2, snoozed: { 'offline-map': 2 } }), 'mapa', ctx), null);
  assert.equal(pickFlow(fresh({ sessions: 3, snoozed: { 'offline-map': 2 } }), 'mapa', ctx).id, 'offline-map');
  assert.equal(pickFlow(fresh({ lastShown: ctx.now - 5_000 }), 'guia', ctx), null);
  assert.equal(pickFlow(fresh({ lastShown: ctx.now - MIN_SPACING_MS - 1 }), 'guia', ctx).id, 'welcome');
});

test('a new session starts after 30 minutes without use', () => {
  const first = touchSession(readState(null), 1000);
  assert.equal(first.sessions, 1);
  assert.equal(touchSession(first, 1000 + 60_000).sessions, 1);
  assert.equal(touchSession(first, 1000 + SESSION_GAP_MS + 1).sessions, 2);
});

test('state survives bad storage', () => {
  const store = { v: null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
  store.v = '{oops';
  assert.equal(readState(store).sessions, 0);
  writeState(store, fresh({ sessions: 4 }));
  assert.equal(readState(store).sessions, 4);
});
