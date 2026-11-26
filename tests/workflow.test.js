import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const workflow = await readFile(fileURLToPath(new URL('../.github/workflows/tests.yml', import.meta.url)), 'utf8');
const uses = [...workflow.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@v(\d+)/g)].map(([, action, major]) => [action, Number(major)]);

// First major version of each GitHub action that runs on Node.js 24 (Node 20 actions raise a deprecation warning in every run).
const MINIMUM_NODE24_MAJOR = {
  'actions/cache': 5,
  'actions/checkout': 5,
  'actions/setup-node': 5,
  'actions/upload-artifact': 6,
  'actions/download-artifact': 7,
  'actions/configure-pages': 6,
  'actions/upload-pages-artifact': 5,
  'actions/deploy-pages': 5
};

test('every GitHub action in the workflow runs on Node.js 24, so CI shows no Node 20 deprecation warning', () => {
  assert.ok(uses.length >= 10);
  for (const [action, major] of uses) {
    assert.ok(action in MINIMUM_NODE24_MAJOR, `${action} is not in the checked list: add its minimum Node 24 version`);
    assert.ok(major >= MINIMUM_NODE24_MAJOR[action], `${action}@v${major} still runs on Node 20 (needs v${MINIMUM_NODE24_MAJOR[action]} or newer)`);
  }
});

test('artifact producers and consumers use compatible majors and the Pages artifact keeps its expected name', () => {
  const majors = (action) => [...new Set(uses.filter(([name]) => name === action).map(([, major]) => major))];
  assert.equal(majors('actions/upload-artifact').length, 1);
  assert.equal(majors('actions/download-artifact').length, 1);
  // The Pages deploy job needs an artifact called "github-pages": upload-pages-artifact creates it by default.
  assert.match(workflow, /upload-pages-artifact@v\d+\n\s+with:\n\s+path: site\n(?!\s+name:)/);
  assert.match(workflow, /actions\/deploy-pages@v\d+/);
  assert.match(workflow, /needs: \[prepare, unit, browser\]/, 'deployment stays gated on image preparation, data tests and browser tests');
});
