// Espelha .storybook/preview.ts do tangerina-web-core.
const VIEWPORT_WIDTHS = {xs: 320, sm: 360, md: 768, lg: 1024, xl: 1440};
// data-brand no <html>: gol nao seta (default); demais setam o nome.
const BRAND_ATTR = {gol: null, smiles: 'smiles', 'clube-smiles': 'clube-smiles'};
// data-theme no <html>: dark seta; light nao seta.
const THEME_ATTR = {light: null, dark: 'dark'};
// global `themes` do Storybook (toolbar) = nome da brand.
function brandGlobal(brand) {
  if (!(brand in BRAND_ATTR)) throw new Error(`Brand desconhecida: "${brand}". Use: ${Object.keys(BRAND_ATTR).join(', ')}.`);
  return brand;
}
module.exports = {VIEWPORT_WIDTHS, BRAND_ATTR, THEME_ATTR, brandGlobal};
