'use strict';

const path = require('node:path');
const {runLogged} = require('../process');
const {VIEWPORT_WIDTHS} = require('../brands');
const {backgroundForCell} = require('./environment');

const HARNESS = path.join(__dirname, '..', '..', 'harness', 'wc');

function build(repo, outDir, {
  logPath = path.join(path.dirname(outDir), 'wc-harness-build.log'),
  run = runLogged,
} = {}) {
  run('npx', ['vite', 'build', '--outDir', outDir], {
    cwd: HARNESS,
    env: {...process.env, DS_REPO: repo},
    logPath,
    echo: true,
  });
  return outDir;
}

function urlFor(cell, baseUrl) {
  const query = new URLSearchParams({
    c: cell.component,
    scene: cell.sceneId || cell.storyId || '',
    brand: cell.brand || 'gol',
    theme: cell.theme || 'light',
    viewport: cell.viewport || 'sm',
    args: JSON.stringify(cell.args || {}),
    slots: JSON.stringify(cell.slots || {}),
    context: JSON.stringify(cell.context || null),
    background: backgroundForCell(cell),
  });
  return `${baseUrl}/index.html?${query}`;
}

async function verify(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#evidence-root');
    const customElement = root && [...root.querySelectorAll('*')]
      .find(element => element.tagName.includes('-'));
    return Boolean(customElement && customElement.shadowRoot);
  }, {timeout: 15000});
}

function makeWcHarnessHost(repo, options = {}) {
  return {
    framework: 'wc',
    viewportWidths: VIEWPORT_WIDTHS,
    build: (value, outDir, buildOptions = {}) => build(
      value || repo,
      outDir,
      {...options, ...buildOptions}
    ),
    urlFor,
    selectorFor: () => '#evidence-root',
    verify,
  };
}

module.exports = {makeWcHarnessHost};
