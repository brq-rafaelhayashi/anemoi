// Varre os eixos e produz uma celula por combinacao.
// frameworks: ['wc','react','angular']; themes: ['light','dark']; viewports usam viewportWidths.
function buildMatrix({frameworks, stories, brands, themes, viewports, viewportWidths, args}) {
  const cells = [];
  const frameworkList = frameworks && frameworks.length ? frameworks : ['wc'];
  const themeList = themes && themes.length ? themes : ['light'];

  for (const framework of frameworkList) {
    for (const brand of brands) {
      for (const story of stories) {
        for (const viewport of viewports) {
          const width = viewportWidths[viewport];
          if (!width) {
            throw new Error(
              `Viewport desconhecido: "${viewport}". Use um de: ${Object.keys(viewportWidths).join(', ')}.`,
            );
          }
          for (const theme of themeList) {
            cells.push({
              framework,
              brand,
              storyId: story.id,
              storyName: story.name,
              viewport,
              width,
              theme,
              args: {...(args || {})},
            });
          }
        }
      }
    }
  }
  return cells;
}

function countCells({frameworks, stories, brands, themes, viewports}) {
  return (frameworks || 1) * (stories || 1) * (brands || 1) * (themes || 1) * (viewports || 1);
}

module.exports = {buildMatrix, countCells};
