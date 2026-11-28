import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusteringEnabled, clusterOptions, clusterLabel, clusterName, ENABLE_KEY, CLUSTER_RADIUS, HIT_SIZE, LOOSE_FROM_ZOOM } from '../js/modules/map-cluster.js';

const storage = (value) => ({ getItem: (key) => (key === ENABLE_KEY ? value : null) });

test('groups are on for people and off for automated browsers unless a test asks for them', () => {
  assert.equal(clusteringEnabled({ navigator: {} }, storage(null)), true);
  assert.equal(clusteringEnabled({ navigator: { webdriver: true } }, storage(null)), false);
  assert.equal(clusteringEnabled({ navigator: { webdriver: true } }, storage('1')), true);
  assert.equal(clusteringEnabled({ navigator: {} }, storage('0')), false);
  assert.equal(clusteringEnabled({ navigator: {} }, { getItem() { throw new Error('blocked'); } }), true);
});

test('points closer than a finger tip join, and every point is loose at street level', () => {
  const options = clusterOptions();
  assert.equal(HIT_SIZE, 44);
  assert.ok(CLUSTER_RADIUS >= HIT_SIZE, 'two 44 px tap areas never overlap outside a group');
  assert.equal(options.maxClusterRadius, CLUSTER_RADIUS);
  assert.equal(options.disableClusteringAtZoom, LOOSE_FROM_ZOOM);
  assert.equal(options.zoomToBoundsOnClick, true);
  assert.equal(options.showCoverageOnHover, false);
  assert.equal(options.animate, true);
  assert.equal(clusterOptions({ reducedMotion: true }).animate, false);
});

test('group labels', () => {
  assert.equal(clusterLabel(7), '7');
  assert.equal(clusterLabel(120), '99+');
  assert.equal(clusterName(3), '3 lugares aquí. Toca para acercar');
});
