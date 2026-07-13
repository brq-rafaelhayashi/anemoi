const {buildIframeUrl} = require('./url');

const BRAND_GLOBALS = {gol: 'gol|default_theme', smiles: 'smiles|default_theme', 'smiles-club': 'smiles|club'};
const VIEWPORT_WIDTHS = {xs: 320, sm: 360, md: 768, lg: 1024, xl: 1440};

const storybookHost = {
  viewportWidths: VIEWPORT_WIDTHS,
  selectorFor: () => '#storybook-root',
  urlFor: (cell, baseUrl) => buildIframeUrl(baseUrl, {
    storyId: cell.storyId,
    brandGlobal: BRAND_GLOBALS[cell.brand],
    mode: cell.theme === 'dark' ? 'dark' : undefined,
    args: cell.args,
  }),
};

module.exports = {storybookHost, BRAND_GLOBALS, VIEWPORT_WIDTHS};
