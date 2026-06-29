const {test} = require('node:test');
const assert = require('node:assert');
const {parseArgs} = require('../src/args');

test('parseArgs: flags com valor', () => {
  const args = parseArgs([
    '--repo', '/tmp/web',
    '--component', 'country_flag',
    '--card', 'CDCOM-99',
  ]);
  assert.equal(args.repo, '/tmp/web');
  assert.equal(args.component, 'country_flag');
  assert.equal(args.card, 'CDCOM-99');
});

test('parseArgs: flags boolean (sem valor)', () => {
  const args = parseArgs(['--before-after', '--component', 'badge']);
  assert.equal(args['before-after'], true);
  assert.equal(args.component, 'badge');
});

test('parseArgs: listas separadas por virgula ficam string crua', () => {
  const args = parseArgs(['--brands', 'gol,smiles', '--viewports', 'xs,md']);
  assert.equal(args.brands, 'gol,smiles');
  assert.equal(args.viewports, 'xs,md');
});

test('parseArgs: ignora tokens que nao sao --flag', () => {
  const args = parseArgs(['foo', '--card', 'CDCOM-1', 'bar']);
  assert.equal(args.card, 'CDCOM-1');
  assert.equal(args.foo, undefined);
});
