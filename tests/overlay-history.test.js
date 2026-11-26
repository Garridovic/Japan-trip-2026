import test from 'node:test';
import assert from 'node:assert/strict';

// A tiny fake browser: window with history + popstate listeners.
function fakeWindow(url = 'https://example.com/?view=frases') {
  const entries = [{ state: null, url }];
  let index = 0;
  const listeners = [];
  const win = {
    location: { get href() { return entries[index].url; } },
    history: {
      get state() { return entries[index].state; },
      get length() { return entries.length; },
      pushState(state, _t, next) { entries.splice(index + 1); entries.push({ state, url: String(next) }); index++; },
      back() { if (index > 0) { index--; queueMicrotask(() => listeners.forEach((fn) => fn({ state: entries[index].state }))); } },
      forward() { if (index < entries.length - 1) { index++; queueMicrotask(() => listeners.forEach((fn) => fn({ state: entries[index].state }))); } }
    },
    addEventListener(type, fn) { if (type === 'popstate') listeners.push(fn); }
  };
  return win;
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function fresh() {
  const mod = await import(`../js/modules/overlay-history.js?${Math.random()}`);
  const win = fakeWindow();
  mod.initOverlayHistory(win);
  return { ...mod, win };
}

test('opening an overlay adds a history entry and Back closes it without leaving the page', async () => {
  const { openOverlay, popstateWasOverlay, win } = await fresh();
  let closed = 0;
  openOverlay('phrase-show', () => { closed++; }, win);
  assert.equal(win.history.length, 2);
  assert.equal(win.history.state.overlay, 'phrase-show');
  win.history.back();
  await tick();
  assert.equal(closed, 1);
  assert.equal(popstateWasOverlay(), true, 'navigation code must ignore this popstate');
  assert.equal(win.history.state, null);
  assert.equal(win.location.href, 'https://example.com/?view=frases');
});

test('closing with the button removes the history entry so Back does not need a second press', async () => {
  const { openOverlay, releaseOverlay, win } = await fresh();
  openOverlay('dish-show', () => {}, win);
  releaseOverlay('dish-show', win);
  await tick();
  assert.equal(win.history.state, null);
});

test('going Forward onto a closed overlay entry never reopens it and is ignored by navigation', async () => {
  const { openOverlay, popstateWasOverlay, win } = await fresh();
  let opened = 0;
  openOverlay('poi', () => {}, win);
  win.history.back();
  await tick();
  win.history.forward();
  await tick();
  assert.equal(opened, 0);
  assert.equal(popstateWasOverlay(), true);
});

test('only one overlay is tracked at a time and an unrelated release does nothing', async () => {
  const { openOverlay, releaseOverlay, win } = await fresh();
  openOverlay('a', () => {}, win);
  openOverlay('b', () => {}, win);
  assert.equal(win.history.length, 2);
  releaseOverlay('b', win);
  await tick();
  assert.equal(win.history.state.overlay, 'a');
});

test('a plain popstate is not treated as an overlay event', async () => {
  const { popstateWasOverlay, win } = await fresh();
  win.history.pushState({ view: 'frases' }, '', 'https://example.com/?view=platos');
  win.history.back();
  await tick();
  assert.equal(popstateWasOverlay(), false);
});

test('navigation waits for a just-closed overlay to leave the history before pushing a new entry', async () => {
  const { openOverlay, releaseOverlay, whenOverlaySettled, win } = await fresh();
  openOverlay('poi', () => {}, win);
  releaseOverlay('poi', win); // closed with the button: history.back() is now pending
  let settled = false;
  const waiting = whenOverlaySettled().then(() => { settled = true; });
  assert.equal(settled, false);
  await tick();
  await waiting;
  assert.equal(settled, true);
  assert.equal(win.history.state, null);
  await whenOverlaySettled(); // nothing pending: resolves at once
});
