const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {cellRelPath, assertSafePathSegment, captureCells} = require('../src/capture');

test('cellRelPath organiza por framework/brand/story/viewport/theme', () => {
  const rel = cellRelPath({framework: 'react', brand: 'gol', storyId: 'action-button--primary', storyName: 'Primary', viewport: 'sm', theme: 'dark'});
  assert.equal(rel, 'react/gol/action-button--primary/sm/dark.png');
});

test('captureCells fecha browser quando newContext falha', async () => {
  let closed = false;
  const browser = {
    newContext: async () => { throw new Error('context boom'); },
    close: async () => { closed = true; },
  };
  const browserType = {launch: async () => browser};
  await assert.rejects(
    captureCells([], {}, 'http://localhost', '/tmp', {browserType}),
    /context boom/,
  );
  assert.equal(closed, true);
});

test('captureCells desabilita animacoes no element screenshot', async () => {
  let screenshotOptions;
  const page = {
    setViewportSize: async () => {},
    goto: async () => {},
    locator: () => ({
      screenshot: async options => { screenshotOptions = options; },
    }),
    close: async () => {},
  };
  const context = {
    newPage: async () => page,
    close: async () => {},
  };
  const browser = {
    newContext: async () => context,
    close: async () => {},
  };
  const browserType = {launch: async () => browser};
  const host = {
    urlFor: () => 'http://example.test',
    selectorFor: () => '#evidence-root',
  };
  const cell = {
    framework: 'react',
    brand: 'gol',
    storyId: 'action-button--loading',
    storyName: 'Loading',
    viewport: 'sm',
    theme: 'dark',
    width: 360,
  };
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-capture-'));

  try {
    await captureCells([cell], host, 'http://example.test', destDir, {browserType});
  } finally {
    fs.rmSync(destDir, {recursive: true, force: true});
  }

  assert.equal(screenshotOptions.animations, 'disabled');
});

test('assertSafePathSegment bloqueia traversal e separadores', () => {
  for (const value of ['..', '.', '../outside', 'a/b', 'a\\b', 'line\nbreak']) {
    assert.throws(() => assertSafePathSegment(value, 'story'), /segmento de caminho invalido/);
  }
  assert.equal(assertSafePathSegment('Primary state', 'story'), 'Primary state');
});

test('cellRelPath rejeita eixo inseguro antes de compor o output', () => {
  assert.throws(
    () => cellRelPath({framework: 'react', brand: 'gol', storyId: '../../outside', storyName: 'Primary', viewport: 'sm', theme: 'dark'}),
    /storyId/,
  );
});
