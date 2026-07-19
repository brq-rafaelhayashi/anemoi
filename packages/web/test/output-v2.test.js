const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/outputV2.ts')).href);
}

const manifest = {
  schemaVersion: 2,
  tool: 'Anemoi Web',
  status: 'failed',
  card: 'CDCOM-1',
  component: 'tgr-button',
  generatedAt: '2026-07-18T12:00:00.000Z',
  cellCount: 9,
  axes: {
    browsers: ['chromium', 'firefox', 'webkit'],
    frameworks: ['wc', 'react', 'angular'],
  },
  gate: {
    status: 'failed',
    trusted: false,
    dimensions: {
      visualParity: {status: 'passed', required: true, failed: 0, unavailable: 0},
      behavioralParity: {status: 'failed', required: true, failed: 1, unavailable: 0},
    },
  },
  groups: [{
    browser: 'firefox',
    label: 'firefox · gol · Primary · sm · light',
    wc: 'firefox/wc/a.png',
    react: 'firefox/react/a.png',
    angular: 'firefox/angular/a.png',
    parity: [],
  }],
  behavior: {
    results: [{
      logicalTestId: 'primary--firefox',
      stability: 'stable',
      routes: [{
        routeId: 'activation',
        parity: 'failed',
        frameworks: {
          wc: {conformance: 'passed'},
          react: {conformance: 'passed'},
          angular: {conformance: 'passed'},
        },
      }],
    }],
  },
  attempts: [{
    logicalTestId: 'primary--firefox',
    stability: 'flaky',
    attempts: [
      {
        attempt: 0,
        status: 'failed',
        resultPath: 'results/primary--firefox/attempt-0/result.json',
        attachments: ['results/primary--firefox/attempt-0/attachments/failure.png'],
      },
      {
        attempt: 1,
        status: 'passed',
        resultPath: 'results/primary--firefox/attempt-1/result.json',
        attachments: ['results/primary--firefox/attempt-1/attachments/trace.zip'],
      },
    ],
  }],
};

test('summary v2 lista browsers e dimensoes independentes', async () => {
  const {renderSummaryV2} = await subject();
  const summary = renderSummaryV2(manifest);
  assert.match(summary, /Chromium, Firefox, WebKit/);
  assert.match(summary, /behavioralParity: failed/);
  assert.match(summary, /Gate confiável: não/);
});

test('summary v2 neutraliza HTML e quebras de linha em campos dinamicos', async () => {
  const {renderSummaryV2} = await subject();
  const unsafe = structuredClone(manifest);
  unsafe.component = '<img src=x onerror=alert(1)>\n- injetado: sim';
  unsafe.card = '[externo](https://example.test)';
  const summary = renderSummaryV2(unsafe);
  assert.doesNotMatch(summary, /<img src=x onerror/);
  assert.doesNotMatch(summary, /\n- injetado: sim/);
  assert.doesNotMatch(summary, /\[externo\]\(https:\/\/example\.test\)/);
});

test('galeria v2 e autocontida e mostra browser, comportamento e estabilidade', async () => {
  const {renderHtmlV2} = await subject();
  const html = renderHtmlV2(manifest);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /firefox/);
  assert.match(html, /activation/);
  assert.match(html, /stable/);
  assert.match(html, /trace\.zip/);
  assert.match(html, /attempt-1\/result\.json/);
  assert.doesNotMatch(html, /https?:\/\/(?!127\.0\.0\.1)/);
});

test('galeria v2 escapa HTML e recusa caminhos externos ou fora da tentativa', async () => {
  const {renderHtmlV2} = await subject();
  const unsafe = structuredClone(manifest);
  unsafe.component = '<img src=x onerror=alert(1)>';
  unsafe.groups[0].label = '<script>alert(1)</script>';
  unsafe.groups[0].wc = 'javascript:alert(1)';
  unsafe.groups[0].react = '../outside.png';
  unsafe.attempts[0].attempts[0].resultPath = 'javascript:alert(1)';
  unsafe.attempts[0].attempts[0].attachments = [
    '../outside.zip',
    'results/primary--firefox/attempt-1/attachments/cross-attempt.zip',
  ];
  unsafe.attempts[0].attempts.push({
    attempt: 2,
    status: 'passed',
    resultPath: 'results/primary--firefox/attempt-9/result.json',
    attachments: ['results/primary--firefox/attempt-9/attachments/wrong-attempt.zip'],
  });
  const html = renderHtmlV2(unsafe);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.doesNotMatch(html, /(?:href|src)="(?:javascript:|\.\.\/)/);
  assert.doesNotMatch(html, /href="[^"]*cross-attempt\.zip/);
  assert.doesNotMatch(html, /href="[^"]*attempt-9/);
  assert.match(html, /href="results\/primary--firefox\/attempt-1\/result\.json"/);
  assert.match(html, /href="results\/primary--firefox\/attempt-1\/attachments\/trace\.zip"/);
});
