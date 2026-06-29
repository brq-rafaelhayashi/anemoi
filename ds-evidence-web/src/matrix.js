// Mapa brand -> valor do global `themes` do Storybook (de .storybook/preview.ts)
const BRAND_GLOBALS = {
  gol: 'gol|default_theme',
  smiles: 'smiles|default_theme',
  'smiles-club': 'smiles|club',
};

// Larguras dos breakpoints de grid (de .storybook/preview.ts -> viewports)
const VIEWPORT_WIDTHS = {
  xs: 320,
  sm: 360,
  md: 768,
  lg: 1024,
  xl: 1440,
};

// Varre os eixos e produz uma celula por combinacao.
// modes vazio => uma passada sem `mode` (usa o default light do preview).
function buildMatrix({stories, brands, viewports, modes, args}) {
  const cells = [];
  const modeList = modes && modes.length > 0 ? modes : [undefined];

  for (const brand of brands) {
    const brandGlobal = BRAND_GLOBALS[brand];
    if (!brandGlobal) {
      throw new Error(
        `Brand desconhecida: "${brand}". Use uma de: ${Object.keys(BRAND_GLOBALS).join(', ')}.`,
      );
    }
    for (const story of stories) {
      for (const viewport of viewports) {
        const width = VIEWPORT_WIDTHS[viewport];
        if (!width) {
          throw new Error(
            `Viewport desconhecido: "${viewport}". Use um de: ${Object.keys(VIEWPORT_WIDTHS).join(', ')}.`,
          );
        }
        for (const mode of modeList) {
          cells.push({
            brand,
            brandGlobal,
            storyId: story.id,
            storyName: story.name,
            viewport,
            width,
            mode,
            args: {...(args || {})},
          });
        }
      }
    }
  }

  return cells;
}

function countCells({stories, brands, viewports, modes}) {
  const modeFactor = modes && modes > 0 ? modes : 1;
  return stories * brands * viewports * modeFactor;
}

module.exports = {BRAND_GLOBALS, VIEWPORT_WIDTHS, buildMatrix, countCells};
