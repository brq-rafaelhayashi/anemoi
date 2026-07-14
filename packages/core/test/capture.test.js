const test = require('node:test');
const assert = require('node:assert');
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
