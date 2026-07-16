const test = require('node:test');
const assert = require('node:assert/strict');

const {makeWcHost} = require('../src/hosts/wc');
const {makeReactHost} = require('../src/hosts/react');
const {makeAngularHost} = require('../src/hosts/angular');

const baseCell = {
  component: 'tgr-button',
  storyId: 'action-button--default',
  brand: 'gol',
  theme: 'light',
  viewport: 'sm',
  args: {},
};

test('wc envia colorScheme explicito e background somente no dark', () => {
  const host = makeWcHost();
  const light = new URL(host.urlFor(baseCell, 'http://example.test'));
  const dark = new URL(host.urlFor({...baseCell, theme: 'dark'}, 'http://example.test'));

  assert.equal(light.searchParams.get('globals'), 'themes:gol;colorScheme:light');
  assert.equal(dark.searchParams.get('globals'), 'themes:gol;colorScheme:dark;backgrounds.value:#211E1C');
});

for (const [framework, factory] of [
  ['react', makeReactHost],
  ['angular', makeAngularHost],
]) {
  test(`${framework} recebe o mesmo background semantico da story`, () => {
    const host = factory('/tmp/tangerina');
    const light = new URL(host.urlFor(baseCell, 'http://example.test'));
    const dark = new URL(host.urlFor({...baseCell, theme: 'dark'}, 'http://example.test'));
    const brand = new URL(host.urlFor({
      ...baseCell,
      args: {brand: true},
    }, 'http://example.test'));
    const onBrand = new URL(host.urlFor({
      ...baseCell,
      args: {onBrand: true},
    }, 'http://example.test'));

    assert.equal(light.searchParams.get('background'), '');
    assert.equal(dark.searchParams.get('background'), '#211E1C');
    assert.equal(brand.searchParams.get('background'), 'var(--action-primary-background)');
    assert.equal(onBrand.searchParams.get('background'), 'var(--action-primary-background)');
  });
}
