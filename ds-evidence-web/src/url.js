// Monta a URL do iframe do Storybook seguindo o template do spec:
// /iframe.html?id=<storyId>&globals=themes:<brand|theme>;backgrounds:<light|dark>&args=<k:v;...>
// Os separadores (| ; :) sao deixados crus de proposito — e o formato que o
// parser de globals/args do Storybook espera. page.goto cuida do encoding.
function buildIframeUrl(baseUrl, {storyId, brandGlobal, mode, args}) {
  const globals = [`themes:${brandGlobal}`];
  if (mode) {
    globals.push(`backgrounds:${mode}`);
  }

  let url = `${baseUrl}/iframe.html?id=${storyId}&globals=${globals.join(';')}`;

  const argEntries = Object.entries(args || {});
  if (argEntries.length > 0) {
    const argStr = argEntries.map(([key, value]) => `${key}:${value}`).join(';');
    url += `&args=${argStr}`;
  }

  return url;
}

module.exports = {buildIframeUrl};
