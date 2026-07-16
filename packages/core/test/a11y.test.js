const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const {serveStatic} = require('../src/server');
const {WCAG_TAGS, axeCoreVersion, normalizeViolations, runAxeAudit, captureAriaSnapshot} = require('../src/a11y');

// Botao sem nome acessivel: violacao button-name (wcag2a / 4.1.2).
const VIOLATION_HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>fixture</title></head><body><div id="evidence-root"><button></button></div></body></html>';

// Botao com nome e contraste explicito 21:1 — nenhuma violacao A/AA.
const CLEAN_HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>fixture</title></head><body><div id="evidence-root">'
  + '<button style="color:#000;background:#fff;border:1px solid #000">Salvar</button></div></body></html>';

async function withPage(html, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemoi-a11y-'));
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  const server = await serveStatic(dir);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/index.html`);
    return await fn(page);
  } finally {
    await browser.close();
    await server.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

test('runAxeAudit acusa botao sem nome acessivel com regua WCAG A/AA', async () => {
  const audit = await withPage(VIOLATION_HTML, page => runAxeAudit(page, '#evidence-root'));
  assert.deepEqual(audit.ruleset, WCAG_TAGS);
  const violation = audit.violations.find(v => v.id === 'button-name');
  assert.ok(violation, `esperava button-name, veio: ${audit.violations.map(v => v.id).join(', ') || '(nenhuma)'}`);
  assert.ok(violation.impact);
  assert.ok(violation.wcag.some(tag => tag.startsWith('wcag')));
  assert.match(violation.helpUrl, /^https:\/\//);
  assert.ok(violation.nodes.length >= 1);
  assert.match(violation.nodes[0].html, /<button/);
});

test('runAxeAudit em html limpo nao acusa violacoes', async () => {
  const audit = await withPage(CLEAN_HTML, page => runAxeAudit(page, '#evidence-root'));
  assert.deepEqual(audit.violations, []);
});

test('captureAriaSnapshot devolve arvore ARIA em yaml do seletor', async () => {
  const snapshot = await withPage(CLEAN_HTML, page => captureAriaSnapshot(page, '#evidence-root'));
  assert.equal(typeof snapshot, 'string');
  assert.match(snapshot, /button "Salvar"/);
});

test('normalizeViolations reduz o resultado bruto do axe e trunca html', () => {
  const raw = {violations: [{
    id: 'button-name',
    impact: 'critical',
    tags: ['cat.name-role-value', 'wcag2a', 'wcag412'],
    description: 'Buttons must have discernible text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/button-name',
    nodes: [{target: ['#evidence-root', 'button'], html: '<button>' + 'x'.repeat(500) + '</button>'}],
  }]};
  const [v] = normalizeViolations(raw);
  assert.equal(v.id, 'button-name');
  assert.equal(v.impact, 'critical');
  assert.deepEqual(v.wcag, ['wcag2a', 'wcag412']);
  assert.equal(v.nodes[0].target, '#evidence-root button');
  assert.ok(v.nodes[0].html.length <= 300);
});

test('normalizeViolations tolera resultado vazio e campos ausentes', () => {
  assert.deepEqual(normalizeViolations({}), []);
  const [v] = normalizeViolations({violations: [{id: 'x', tags: undefined, nodes: undefined}]});
  assert.equal(v.impact, null);
  assert.deepEqual(v.wcag, []);
  assert.deepEqual(v.nodes, []);
});

test('axeCoreVersion devolve a versao instalada', () => {
  assert.match(axeCoreVersion(), /^\d+\.\d+\.\d+/);
});

test('barrel do core exporta as primitivas de a11y', () => {
  const core = require('../src/index');
  assert.equal(core.runAxeAudit, runAxeAudit);
  assert.equal(core.captureAriaSnapshot, captureAriaSnapshot);
  assert.deepEqual(core.WCAG_TAGS, WCAG_TAGS);
  assert.equal(core.axeCoreVersion, axeCoreVersion);
});

// Texto sobre gradiente: axe nao consegue determinar o fundo — color-contrast
// vai para needsReview (incomplete), nunca para violations.
const GRADIENT_HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>fixture</title></head><body><div id="evidence-root">'
  + '<p style="background-image:linear-gradient(#fff,#777);color:#888">Texto sobre gradiente</p>'
  + '</div></body></html>';

test('runAxeAudit: contraste indeterminavel vira needsReview, nao violacao', async () => {
  const audit = await withPage(GRADIENT_HTML, page => runAxeAudit(page, '#evidence-root'));
  assert.ok(!audit.violations.some(v => v.id === 'color-contrast'));
  const review = audit.needsReview.find(v => v.id === 'color-contrast');
  assert.ok(review, `esperava color-contrast em needsReview, veio: ${audit.needsReview.map(v => v.id).join(', ') || '(nenhum)'}`);
  assert.ok(review.nodes.length >= 1);
});

test('runAxeAudit: violacao carrega failureSummary com evidencia de triagem', async () => {
  const audit = await withPage(VIOLATION_HTML, page => runAxeAudit(page, '#evidence-root'));
  const violation = audit.violations.find(v => v.id === 'button-name');
  assert.ok(violation.nodes[0].failureSummary.length > 0);
});

test('normalizeViolations trunca failureSummary em 400 chars', () => {
  const [v] = normalizeViolations({violations: [{id: 'x', nodes: [{target: ['a'], html: '<a></a>', failureSummary: 'y'.repeat(900)}]}]});
  assert.equal(v.nodes[0].failureSummary.length, 400);
});
