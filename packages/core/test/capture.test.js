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

// --- coleta a11y na visita da captura ---

// Page fake que responde aos coletores: addScriptTag/evaluate para o axe,
// locator().ariaSnapshot() para a arvore ARIA.
function a11yFakePage({axeResults, aria, evaluateError, evaluateThrowRaw} = {}) {
  return {
    setViewportSize: async () => {},
    goto: async () => {},
    addScriptTag: async () => {},
    evaluate: async () => {
      // evaluateThrowRaw lanca o valor cru (ex.: string) — sem envelope Error.
      if (evaluateThrowRaw !== undefined) throw evaluateThrowRaw;
      if (evaluateError) throw new Error(evaluateError);
      return axeResults ?? {violations: []};
    },
    locator: () => ({
      screenshot: async () => {},
      ariaSnapshot: async () => aria ?? '- button "Salvar"',
    }),
    close: async () => {},
  };
}

function fakeBrowserType(page) {
  const context = {newPage: async () => page, close: async () => {}};
  const browser = {newContext: async () => context, close: async () => {}};
  return {launch: async () => browser};
}

const A11Y_HOST = {urlFor: () => 'http://example.test', selectorFor: () => '#evidence-root'};
const A11Y_CELL = {
  framework: 'react', brand: 'gol', storyId: 'button--primary', storyName: 'Primary',
  viewport: 'sm', theme: 'light', width: 360,
};

test('captureCells coleta axe + aria e grava artefatos ao lado do png', async () => {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-capture-a11y-'));
  const page = a11yFakePage({
    axeResults: {violations: [{id: 'button-name', impact: 'critical', tags: ['wcag2a'], description: 'd', helpUrl: 'https://x', nodes: [{target: ['button'], html: '<button></button>'}]}]},
    aria: '- button',
  });
  try {
    const [result] = await captureCells([A11Y_CELL], A11Y_HOST, 'http://example.test', destDir, {browserType: fakeBrowserType(page)});
    assert.equal(result.a11y.relPath, 'react/gol/button--primary/sm/light.a11y.json');
    assert.equal(result.a11y.ariaRelPath, 'react/gol/button--primary/sm/light.aria.yaml');
    assert.equal(result.a11y.violations[0].id, 'button-name');
    assert.equal(result.a11y.ariaSnapshot, '- button');
    const artifact = JSON.parse(fs.readFileSync(path.join(destDir, result.a11y.relPath), 'utf8'));
    assert.equal(artifact.violations[0].id, 'button-name');
    assert.deepEqual(artifact.ruleset, ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
    assert.equal(fs.readFileSync(path.join(destDir, result.a11y.ariaRelPath), 'utf8'), '- button\n');
  } finally {
    fs.rmSync(destDir, {recursive: true, force: true});
  }
});

test('captureCells com collectA11y=false nao coleta nem grava artefatos', async () => {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-capture-a11y-'));
  try {
    const [result] = await captureCells([A11Y_CELL], A11Y_HOST, 'http://example.test', destDir, {
      browserType: fakeBrowserType(a11yFakePage()),
      collectA11y: false,
    });
    assert.equal('a11y' in result, false);
    assert.equal(fs.existsSync(path.join(destDir, 'react/gol/button--primary/sm/light.a11y.json')), false);
  } finally {
    fs.rmSync(destDir, {recursive: true, force: true});
  }
});

test('falha na coleta a11y nao derruba a captura: vira a11y.error', async () => {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-capture-a11y-'));
  const page = a11yFakePage({evaluateError: 'axe timeout'});
  try {
    const [result] = await captureCells([A11Y_CELL], A11Y_HOST, 'http://example.test', destDir, {browserType: fakeBrowserType(page)});
    assert.equal(result.relPath, 'react/gol/button--primary/sm/light.png');
    assert.match(result.a11y.error, /axe timeout/);
    assert.equal(fs.existsSync(path.join(destDir, 'react/gol/button--primary/sm/light.a11y.json')), false);
    assert.equal(fs.existsSync(path.join(destDir, 'react/gol/button--primary/sm/light.aria.yaml')), false);
  } finally {
    fs.rmSync(destDir, {recursive: true, force: true});
  }
});

test('coleta que lanca string vira a11y.error string; captura visual segue valida', async () => {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-capture-a11y-'));
  const page = a11yFakePage({evaluateThrowRaw: 'boom-string'});
  try {
    const [result] = await captureCells([A11Y_CELL], A11Y_HOST, 'http://example.test', destDir, {browserType: fakeBrowserType(page)});
    assert.equal(result.relPath, 'react/gol/button--primary/sm/light.png');
    assert.equal(result.a11y.error, 'boom-string');
    assert.equal(fs.existsSync(path.join(destDir, 'react/gol/button--primary/sm/light.a11y.json')), false);
    assert.equal(fs.existsSync(path.join(destDir, 'react/gol/button--primary/sm/light.aria.yaml')), false);
  } finally {
    fs.rmSync(destDir, {recursive: true, force: true});
  }
});

test('captureCells propaga needsReview do axe para resultado e artefato', async () => {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-capture-a11y-'));
  const page = a11yFakePage({
    axeResults: {violations: [], incomplete: [{id: 'color-contrast', impact: 'serious', tags: ['wcag2aa'], description: 'd', helpUrl: 'https://x', nodes: [{target: ['p'], html: '<p>x</p>', failureSummary: 'needs review'}]}]},
    aria: '- text',
  });
  try {
    const [result] = await captureCells([A11Y_CELL], A11Y_HOST, 'http://example.test', destDir, {browserType: fakeBrowserType(page)});
    assert.equal(result.a11y.needsReview[0].id, 'color-contrast');
    assert.equal(result.a11y.needsReview[0].nodes[0].failureSummary, 'needs review');
    const artifact = JSON.parse(fs.readFileSync(path.join(destDir, result.a11y.relPath), 'utf8'));
    assert.equal(artifact.needsReview[0].id, 'color-contrast');
    assert.deepEqual(artifact.violations, []);
  } finally {
    fs.rmSync(destDir, {recursive: true, force: true});
  }
});
