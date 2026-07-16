'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {computeA11y, hasA11yDivergence, summarizeA11y} = require('../src/a11y');

function entry(framework, overrides = {}) {
  return {
    relPath: `${framework}/gol/button--primary/sm/light.a11y.json`,
    ariaRelPath: `${framework}/gol/button--primary/sm/light.aria.yaml`,
    ruleset: ['wcag2a'],
    violations: [],
    ariaSnapshot: '- button "Salvar"\n',
    ...overrides,
  };
}

function group(_a11y) {
  return {label: 'gol · Primary · sm · light', wc: 'wc.png', react: 'react.png', parity: [], _a11y};
}

test('computeA11y monta audits por framework e remove _a11y', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([group({wc: entry('wc'), react: entry('react')})], runDir);
  assert.equal('_a11y' in g, false);
  assert.deepEqual(g.a11y.audits.wc, {violations: [], artifactPath: 'wc/gol/button--primary/sm/light.a11y.json'});
  assert.deepEqual(g.a11y.ariaParity, [{against: 'react', match: true}]);
});

test('computeA11y: snapshots divergentes gravam aria-diff e marcam match false', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([group({
    wc: entry('wc'),
    react: entry('react', {ariaSnapshot: '- button\n'}),
  })], runDir);
  const [p] = g.a11y.ariaParity;
  assert.equal(p.against, 'react');
  assert.equal(p.match, false);
  assert.equal(p.diffPath, 'aria-diff/react-vs-wc/gol-button--primary-sm-light.txt');
  const diff = fs.readFileSync(path.join(runDir, p.diffPath), 'utf8');
  assert.match(diff, /--- wc \(reference\)/);
  assert.match(diff, /\+\+\+ react \(against\)/);
  assert.match(diff, /button "Salvar"/);
});

test('computeA11y: erro de coleta vira audits[fw].error e o par sai do ariaParity', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([group({wc: entry('wc'), react: {error: 'axe timeout'}})], runDir);
  assert.deepEqual(g.a11y.audits.react, {error: 'axe timeout'});
  assert.deepEqual(g.a11y.ariaParity, []);
});

test('computeA11y: grupo sem _a11y sai intocado, sem bloco a11y', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([{label: 'x', wc: 'wc.png', parity: []}], runDir);
  assert.equal('a11y' in g, false);
});

test('computeA11y respeita pairs customizado (angular vs react)', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'));
  const [g] = computeA11y([group({react: entry('react'), angular: entry('angular', {ariaSnapshot: '- link\n'})})], runDir, {
    pairs: [{reference: 'react', against: 'angular'}],
  });
  assert.equal(g.a11y.ariaParity[0].against, 'angular');
  assert.equal(g.a11y.ariaParity[0].match, false);
  assert.match(g.a11y.ariaParity[0].diffPath, /^aria-diff\/angular-vs-react\//);
});

const VIOLATION = {id: 'button-name', impact: 'critical', wcag: ['wcag2a'], description: 'd', helpUrl: 'https://x', nodes: []};

test('hasA11yDivergence: violacao, aria mismatch ou erro divergem; limpo e sem a11y nao', () => {
  const ok = {a11y: {audits: {wc: {violations: [], artifactPath: 'x'}}, ariaParity: [{against: 'react', match: true}]}};
  const withViolation = {a11y: {audits: {wc: {violations: [VIOLATION], artifactPath: 'x'}}, ariaParity: []}};
  const withMismatch = {a11y: {audits: {}, ariaParity: [{against: 'react', match: false, diffPath: 'd.txt'}]}};
  const withError = {a11y: {audits: {react: {error: 'boom'}}, ariaParity: []}};
  assert.equal(hasA11yDivergence([ok]), false);
  assert.equal(hasA11yDivergence([withViolation]), true);
  assert.equal(hasA11yDivergence([withMismatch]), true);
  assert.equal(hasA11yDivergence([withError]), true);
  assert.equal(hasA11yDivergence([{label: 'manifesto antigo sem a11y', parity: []}]), false);
  assert.equal(hasA11yDivergence([]), false);
});

test('summarizeA11y agrega totais, pior impacto e mismatches', () => {
  const groups = [
    {a11y: {audits: {wc: {violations: [VIOLATION, {...VIOLATION, id: 'color-contrast', impact: 'serious'}], artifactPath: 'x'}},
      ariaParity: [{against: 'react', match: false, diffPath: 'd.txt'}]}},
    {a11y: {audits: {wc: {violations: [{...VIOLATION, id: 'label', impact: 'minor'}], artifactPath: 'y'}}, ariaParity: []}},
  ];
  const summary = summarizeA11y(groups);
  assert.equal(summary.totalViolations, 3);
  assert.equal(summary.worstImpact, 'critical');
  assert.equal(summary.ariaMismatches, 1);
  assert.deepEqual(summary.ruleset, ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
});

test('summarizeA11y devolve undefined quando nenhum grupo tem a11y', () => {
  assert.equal(summarizeA11y([{label: 'x', parity: []}]), undefined);
  assert.equal(summarizeA11y([]), undefined);
});
