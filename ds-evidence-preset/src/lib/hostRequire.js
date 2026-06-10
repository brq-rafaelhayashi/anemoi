const path = require('path');
const {createRequire} = require('module');

// O preset vive fora do app (fonte canônica no BRQ-AI, consumido via symlink),
// então um require bare aqui resolveria pelo realpath — onde não há node_modules.
// Dependências fornecidas pelo host (metro-config, sharp) precisam resolver a
// partir da raiz do app: todos os entry points (yarn ds:evidence, metro, jest)
// rodam com cwd na raiz do repo host.
function hostRequire(id) {
  try {
    return createRequire(path.join(process.cwd(), 'package.json'))(id);
  } catch (error) {
    return require(id);
  }
}

module.exports = {hostRequire};
